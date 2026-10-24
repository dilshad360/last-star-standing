import Phaser from 'phaser';
import type {
  AsteroidState,
  GameSnapshot,
  PickupState,
  PlayerState,
  ProjectileState,
  SafeZoneState,
  UpgradeType,
} from '@lss/shared';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  EMP_RADIUS,
  NEON,
  PICKUP_COLORS,
  SHIP_COLORS,
  SHIP_MAX_SPEED,
  SHIP_RADIUS,
} from '@lss/shared';
import { gameEvents } from '../EventBus.js';
import { soundManager } from '../audio/SoundManager.js';

// ── Interpolation state ──────────────────────────────────────────────────────
interface InterpolatedShip {
  id: string;
  x: number;
  y: number;
  rotation: number;
  targetX: number;
  targetY: number;
  targetRotation: number;
  prevX: number;
  prevY: number;
  prevRotation: number;
  lastUpdate: number;
  color: number;
  speed: number;
  alive: boolean;
  hasShield: boolean;
  spawnProtectedUntil: number;
  trailAccumulator: number;
  flickerOffset: number;
  graphics: Phaser.GameObjects.Container;
  shipVisualContainer: Phaser.GameObjects.Container;
  hullGraphics: Phaser.GameObjects.Graphics;
  flameGraphics: Phaser.GameObjects.Graphics;
  rcsGraphics: Phaser.GameObjects.Graphics;
  shieldGraphics: Phaser.GameObjects.Graphics;
  healthBar: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  hitGraphics: Phaser.GameObjects.Graphics;
  lastHealth: number;
  lastShield: number;
  hitFlashUntil: number;
  trailEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
}

interface InterpolatedProjectile {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  velocityX: number;
  velocityY: number;
  graphics: Phaser.GameObjects.Container;
}

interface InterpolatedAsteroid {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  rotation: number;
  graphics: Phaser.GameObjects.Container;
  polygon: Phaser.GameObjects.Polygon;
}

interface InterpolatedPickup {
  id: string;
  x: number;
  y: number;
  type: UpgradeType;
  graphics: Phaser.GameObjects.Container;
}

const INTERPOLATION_DELAY_MS = 100; // Render 100ms behind server time
const LERP_FACTOR = 0.2;
/** Host-screen camera: keep every living ship in frame. */
const CAMERA_PADDING = 260;
const CAMERA_MIN_ZOOM_SPAN = 900;
const CAMERA_LERP = 0.04;

/**
 * Host-screen arena: renders the 2400×2400 neon arena with procedural
 * graphics and snapshot interpolation. Nobody plays on this screen, so the
 * camera frames every living ship instead of following one.
 */
export class ArenaScene extends Phaser.Scene {
  private ships = new Map<string, InterpolatedShip>();
  private projectiles = new Map<string, InterpolatedProjectile>();
  private asteroids = new Map<string, InterpolatedAsteroid>();
  private pickups = new Map<string, InterpolatedPickup>();
  private safeZoneGraphics!: Phaser.GameObjects.Graphics;
  private starfieldFar!: Phaser.GameObjects.TileSprite;
  private starfieldMid!: Phaser.GameObjects.TileSprite;
  private starfieldNear!: Phaser.GameObjects.TileSprite;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private boundaryGraphics!: Phaser.GameObjects.Graphics;
  private planetContainer!: Phaser.GameObjects.Container;
  private unsubscribeSnapshot: (() => void) | null = null;
  private unsubscribeEliminated: (() => void) | null = null;
  private explosionEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: 'ArenaScene' });
  }

  create(): void {
    // ── Procedural particle textures ──────────────────────────────────────────
    if (!this.textures.exists('particle-dot')) {
      const dot = this.add.graphics();
      dot.fillStyle(0xffffff, 1);
      dot.fillCircle(4, 4, 4);
      dot.generateTexture('particle-dot', 8, 8);
      dot.destroy();
    }

    // Soft glowing radial plasma orb for thruster trailers and effects
    if (!this.textures.exists('particle-glow')) {
      const canvas = this.textures.createCanvas('particle-glow', 32, 32);
      if (canvas) {
        const ctx = canvas.getContext();
        const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.25, 'rgba(255, 255, 255, 0.85)');
        grad.addColorStop(0.55, 'rgba(255, 255, 255, 0.35)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 32);
        canvas.refresh();
      }
    }

    // Sharp glowing spark particle for high-speed exhaust sparks and impacts
    if (!this.textures.exists('particle-spark')) {
      const canvas = this.textures.createCanvas('particle-spark', 8, 8);
      if (canvas) {
        const ctx = canvas.getContext();
        const grad = ctx.createRadialGradient(4, 4, 0, 4, 4, 4);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.8)');
        grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 8, 8);
        canvas.refresh();
      }
    }

    // Explosion particle burst emitter (world space)
    this.explosionEmitter = this.add.particles(0, 0, 'particle-glow', {
      lifespan: { min: 350, max: 650 },
      speed: { min: 60, max: 200 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: 'ADD',
      emitting: false,
    });
    this.explosionEmitter.setDepth(16);

    // Build the deep multi-layer cosmic space environment
    this.createSpaceEnvironment();
    this.createGrid();
    this.createBoundary();
    this.createSafeZone();


    // Subscribe to snapshots via EventBus
    this.unsubscribeSnapshot = gameEvents.on('snapshot:update', (snapshot) => {
      this.processSnapshot(snapshot);
    });

    this.unsubscribeEliminated = gameEvents.on('player:eliminated', (entry) => {
      const victimShip = this.ships.get(entry.victimId);
      if (victimShip) {
        this.createExplosion(victimShip.x, victimShip.y, victimShip.color);
      }
      soundManager.playExplosion();
    });

    // Detach DOM listeners and EventBus subs on every scene restart/shutdown.
    this.events.once('shutdown', this.shutdown, this);

    // Camera setup - center immediately on arena center to avoid void in top-left
    this.cameras.main.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    this.cameras.main.setZoom(this.fitZoom(ARENA_WIDTH, ARENA_HEIGHT));
    this.cameras.main.centerOn(ARENA_WIDTH / 2, ARENA_HEIGHT / 2);
  }

  update(time: number, delta: number): void {
    // ── 2. Multi-Layer Parallax Starfield & Deep Space Motion ───────────────
    const cx = this.cameras.main.scrollX;
    const cy = this.cameras.main.scrollY;
    if (this.starfieldFar) {
      this.starfieldFar.tilePositionX = cx * 0.05 + time * 0.001;
      this.starfieldFar.tilePositionY = cy * 0.05 + time * 0.0005;
    }
    if (this.starfieldMid) {
      this.starfieldMid.tilePositionX = cx * 0.15 + time * 0.002;
      this.starfieldMid.tilePositionY = cy * 0.15 + time * 0.001;
    }
    if (this.starfieldNear) {
      this.starfieldNear.tilePositionX = cx * 0.35 + time * 0.004;
      this.starfieldNear.tilePositionY = cy * 0.35 + time * 0.002;
    }

    // ── 3. Interpolate Entities ─────────────────────────────────────────────
    this.interpolateShips(delta);
    this.interpolateProjectiles(delta);
    this.interpolateAsteroids(delta);
    this.interpolatePickups(delta);

    // ── 4. Dynamic Thruster Flames, RCS Steering & Space Trails ─────────────
    this.updateShipEffects(time, delta);

    // ── 5. Update Camera ────────────────────────────────────────────────────
    this.updateCamera();
  }

  // ── Snapshot processing ───────────────────────────────────────────────────

  private processSnapshot(snapshot: GameSnapshot): void {
    if (!this.scene?.isActive() || !this.add) return;
    const now = Date.now();
    const seenPlayers = new Set<string>();

    // Update ships
    for (const player of snapshot.players) {
      seenPlayers.add(player.id);
      let ship = this.ships.get(player.id);
      if (!ship) {
        ship = this.createShip(player);
        this.ships.set(player.id, ship);
      }
      const respawned = !ship.alive && player.alive;
      ship.prevX = ship.x;
      ship.prevY = ship.y;
      ship.prevRotation = ship.rotation;
      ship.targetX = player.x;
      ship.targetY = player.y;
      ship.targetRotation = player.rotation;
      ship.lastUpdate = now;
      if (respawned) {
        // Teleport instead of sliding across the arena from the death spot.
        ship.x = player.x;
        ship.y = player.y;
        ship.rotation = player.rotation;
        ship.graphics.setPosition(ship.x, ship.y);
        ship.shipVisualContainer.setRotation(ship.rotation);
      }
      this.updateShipVisuals(ship, player);
    }

    // Clean up removed/disconnected ships
    for (const [id, ship] of this.ships) {
      if (!seenPlayers.has(id)) {
        ship.graphics.destroy();
        ship.trailEmitter.destroy();
        ship.sparkEmitter.destroy();
        this.ships.delete(id);
      }
    }

    // Update projectiles
    const seenProjectiles = new Set<string>();
    for (const proj of snapshot.projectiles) {
      seenProjectiles.add(proj.id);
      let interpolated = this.projectiles.get(proj.id);
      if (!interpolated) {
        interpolated = this.createProjectile(proj);
        this.projectiles.set(proj.id, interpolated);
      }
      interpolated.targetX = proj.x;
      interpolated.targetY = proj.y;
      interpolated.velocityX = proj.velocityX;
      interpolated.velocityY = proj.velocityY;
    }
    for (const [id, proj] of this.projectiles) {
      if (!seenProjectiles.has(id)) {
        proj.graphics.destroy();
        this.projectiles.delete(id);
      }
    }

    // Update asteroids
    const seenAsteroids = new Set<string>();
    for (const ast of snapshot.asteroids) {
      seenAsteroids.add(ast.id);
      let interpolated = this.asteroids.get(ast.id);
      if (!interpolated) {
        interpolated = this.createAsteroid(ast);
        this.asteroids.set(ast.id, interpolated);
      }
      interpolated.targetX = ast.x;
      interpolated.targetY = ast.y;
      this.updateAsteroidCracks(interpolated, ast);
    }
    for (const [id, ast] of this.asteroids) {
      if (!seenAsteroids.has(id)) {
        this.createExplosion(ast.x, ast.y, 0x8b9bb4);
        ast.graphics.destroy();
        this.asteroids.delete(id);
        soundManager.playAsteroidCrunch();
      }
    }

    // Update pickups
    const seenPickups = new Set<string>();
    for (const pickup of snapshot.pickups) {
      seenPickups.add(pickup.id);
      if (!this.pickups.has(pickup.id)) {
        const interpolated = this.createPickup(pickup);
        this.pickups.set(pickup.id, interpolated);
      }
    }
    for (const [id, pickup] of this.pickups) {
      if (!seenPickups.has(id)) {
        if (pickup.type === 'EMP_BLAST') {
          this.createEmpShockwave(pickup.x, pickup.y);
        }
        pickup.graphics.destroy();
        this.pickups.delete(id);
      }
    }

    // Update safe zone
    this.updateSafeZone(snapshot.safeZone);
  }

  // ── Ship creation & visuals ───────────────────────────────────────────────

  private createShip(player: PlayerState): InterpolatedShip {
    const colorHex = SHIP_COLORS[player.colorIndex % SHIP_COLORS.length]!;
    const color = Phaser.Display.Color.HexStringToColor(
      SHIP_COLORS[player.colorIndex % SHIP_COLORS.length]!,
    ).color;

    // Clean simple procedural neon spaceship hull
    const hullGraphics = this.add.graphics();
    this.drawSimpleShipHull(hullGraphics, color);

    // Dynamic dual exhaust flames (rendered beneath the ship hull)
    const flameGraphics = this.add.graphics();

    // RCS reaction control cold-gas thruster jets (steering & retro-braking)
    const rcsGraphics = this.add.graphics();

    // Forcefield energy shield bubble
    const shieldGraphics = this.add.graphics();
    shieldGraphics.setVisible(false);

    // Health bar background
    const healthBarBg = this.add.rectangle(0, -SHIP_RADIUS - 16, 40, 4, 0x1e293b);
    const healthBar = this.add.graphics();

    // Name tag
    // Name tag in the pilot's color, sized to read from across the room.
    const nameText = this.add.text(0, -SHIP_RADIUS - 32, player.displayName, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: colorHex,
      fontFamily: 'monospace',
      stroke: '#05050f',
      strokeThickness: 4,
    });
    nameText.setOrigin(0.5, 0.5);

    // Hit flash red damage indicator overlay
    const hitGraphics = this.add.graphics();
    hitGraphics.setDepth(3);

    // Rotating container for ship hull, engines, and shields
    const shipVisuals: Phaser.GameObjects.GameObject[] = [
      flameGraphics,
      rcsGraphics,
      hullGraphics,
      hitGraphics,
      shieldGraphics,
    ];
    const shipVisualContainer = this.add.container(0, 0, shipVisuals);
    shipVisualContainer.setRotation(player.rotation);

    // Root container holding rotating ship + always-upright HUD elements
    const containerChildren: Phaser.GameObjects.GameObject[] = [
      shipVisualContainer,
      healthBarBg,
      healthBar,
      nameText,
    ];

    const graphics = this.add.container(player.x, player.y, containerChildren);
    graphics.setDepth(10);

    // World-space thruster wake trailer particle emitters (depth 5 & 6)
    const trailEmitter = this.add.particles(0, 0, 'particle-glow', {
      lifespan: { min: 380, max: 620 },
      speed: { min: 15, max: 40 },
      scale: { start: 0.55, end: 0.02 },
      alpha: { start: 0.75, end: 0 },
      blendMode: 'ADD',
      tint: color,
      emitting: false,
    });
    trailEmitter.setDepth(5);

    const sparkEmitter = this.add.particles(0, 0, 'particle-spark', {
      lifespan: { min: 140, max: 280 },
      speed: { min: 30, max: 80 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.95, end: 0 },
      blendMode: 'ADD',
      tint: 0xffffff,
      emitting: false,
    });
    sparkEmitter.setDepth(6);

    const ship: InterpolatedShip = {
      id: player.id,
      x: player.x,
      y: player.y,
      rotation: player.rotation,
      targetX: player.x,
      targetY: player.y,
      targetRotation: player.rotation,
      prevX: player.x,
      prevY: player.y,
      prevRotation: player.rotation,
      lastUpdate: Date.now(),
      color,
      speed: 0,
      alive: player.alive,
      hasShield: player.shield > 0,
      spawnProtectedUntil: player.spawnProtectedUntil,
      trailAccumulator: 0,
      flickerOffset: (player.id.charCodeAt(0) || 0) * 17,
      graphics,
      shipVisualContainer,
      hullGraphics,
      flameGraphics,
      rcsGraphics,
      shieldGraphics,
      hitGraphics,
      lastHealth: player.health,
      lastShield: player.shield,
      hitFlashUntil: 0,
      healthBar,
      nameText,
      trailEmitter,
      sparkEmitter,
    };

    return ship;
  }

  private drawSimpleShipHull(g: Phaser.GameObjects.Graphics, color: number): void {
    g.clear();

    // ── 1. Clean Sleek Aerodynamic Dart Silhouette ───────────────────────────
    const hullPoints: Phaser.Types.Math.Vector2Like[] = [
      { x: 22, y: 0 },      // Sharp forward nose
      { x: -12, y: -16 },   // Left wingtip
      { x: -8, y: -8 },     // Left wing root indent
      { x: -15, y: -7 },    // Left engine exhaust nozzle
      { x: -11, y: 0 },     // Center engine keel notch
      { x: -15, y: 7 },     // Right engine exhaust nozzle
      { x: -8, y: 8 },      // Right wing root indent
      { x: -12, y: 16 },    // Right wingtip
    ];

    // Solid dark spaceship composite hull fill
    g.fillStyle(0x080e1e, 0.96);
    g.fillPoints(hullPoints, true);

    // ── 2. Dual Side Laser Blaster Cannons ───────────────────────────────────
    // Left blaster cannon rail on left wing
    g.lineStyle(2, 0x475569, 1);
    g.lineBetween(-2, -13, 9, -13);
    g.fillStyle(color, 0.9);
    g.fillCircle(10, -13, 2.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(10.5, -13, 1.3);

    // Right blaster cannon rail on right wing
    g.lineStyle(2, 0x475569, 1);
    g.lineBetween(-2, 13, 9, 13);
    g.fillStyle(color, 0.9);
    g.fillCircle(10, 13, 2.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(10.5, 13, 1.3);

    // ── 3. Crisp Neon Hull Vector Stroke ─────────────────────────────────────
    g.lineStyle(2.5, color, 1);
    g.strokePoints(hullPoints, true);

    // Subtle centerline keel spine
    g.lineStyle(1, color, 0.4);
    g.lineBetween(19, 0, 7, 0);

    // ── 4. Sleek Cockpit Canopy (Translucent Cyan Visor) ─────────────────────
    const canopy: Phaser.Types.Math.Vector2Like[] = [
      { x: 10, y: 0 },
      { x: 0, y: -3.5 },
      { x: -4, y: 0 },
      { x: 0, y: 3.5 },
    ];
    g.fillStyle(0x06b6d4, 0.85);
    g.fillPoints(canopy, true);
    g.lineStyle(1.2, 0xe0f2fe, 0.95);
    g.strokePoints(canopy, true);

    // Specular canopy reflection streak
    g.lineStyle(1, 0xffffff, 0.9);
    g.lineBetween(7, -0.8, 1, -2.5);
  }

  private updateShipVisuals(ship: InterpolatedShip, player: PlayerState): void {
    ship.speed = Math.hypot(player.velocityX, player.velocityY);
    ship.alive = player.alive;
    ship.hasShield = player.shield > 0;
    ship.spawnProtectedUntil = player.spawnProtectedUntil;

    // Detect incoming damage to trigger red hit flash and cockpit camera shake
    if (player.health < ship.lastHealth || player.shield < ship.lastShield) {
      ship.hitFlashUntil = Date.now() + 180;
    }
    ship.lastHealth = player.health;
    ship.lastShield = player.shield;

    // Update health bar
    const healthPercent = player.health / player.maxHealth;
    ship.healthBar.clear();
    const barWidth = 36;
    const barHeight = 4;
    const barX = -barWidth / 2;
    const barY = -SHIP_RADIUS - 16;
    ship.healthBar.fillStyle(healthPercent > 0.5 ? 0x00ff00 : healthPercent > 0.25 ? 0xffff00 : 0xff0000);
    ship.healthBar.fillRect(barX, barY, barWidth * healthPercent, barHeight);

    // Visual fading for eliminated ships
    if (!player.alive) {
      ship.graphics.setAlpha(0.25);
      ship.flameGraphics.clear();
      ship.rcsGraphics.clear();
      ship.hitGraphics.clear();
    } else {
      ship.graphics.setAlpha(1.0);
    }
  }

  // ── Dynamic Thrusters, RCS Jets, Flames & Trails ──────────────────────────

  private readonly shipHullOutlinePoints: Phaser.Types.Math.Vector2Like[] = [
    { x: 22, y: 0 },
    { x: -12, y: -16 },
    { x: -8, y: -8 },
    { x: -15, y: -7 },
    { x: -11, y: 0 },
    { x: -15, y: 7 },
    { x: -8, y: 8 },
    { x: -12, y: 16 },
  ];

  private updateShipEffects(time: number, delta: number): void {
    const now = Date.now();
    for (const ship of this.ships.values()) {
      // ── Red Hit Damage Flash ──────────────────────────────────────────────
      ship.hitGraphics.clear();
      if (now < ship.hitFlashUntil && ship.alive) {
        // Vibrant red flash overlay over the entire ship silhouette
        ship.hitGraphics.fillStyle(0xef4444, 0.7);
        ship.hitGraphics.fillPoints(this.shipHullOutlinePoints, true);
        ship.hitGraphics.lineStyle(3, 0xff1e1e, 1);
        ship.hitGraphics.strokePoints(this.shipHullOutlinePoints, true);
      }

      this.updateShipFlames(ship, time);
      this.updateShipShield(ship, time);

      this.updateShipTrails(ship, delta);
    }
  }

  private updateShipFlames(ship: InterpolatedShip, time: number): void {
    const fg = ship.flameGraphics;
    const rcs = ship.rcsGraphics;
    fg.clear();
    rcs.clear();

    if (!ship.alive) return;

    const speed = ship.speed;
    const throttle = Math.min(1, speed / SHIP_MAX_SPEED);
    const isBoosting = speed > SHIP_MAX_SPEED * 1.05;

    if (speed > 12 || isBoosting) {
      const baseLen = isBoosting ? 26 + throttle * 30 : 10 + throttle * 22;
      const flicker = Math.sin(time * 0.05 + ship.flickerOffset) * 3 + (Math.random() - 0.5) * 4;
      const flameLen = Math.max(6, baseLen + flicker);
      const flameHalfWidth = isBoosting ? 4.2 : 3.0;

      // Outer plasma flame (bright electric cyan when boosting, else ship neon tint)
      fg.fillStyle(isBoosting ? 0x22d3ee : ship.color, 0.9);
      fg.fillTriangle(
        -15, -7 - flameHalfWidth,
        -15, -7 + flameHalfWidth,
        -15 - flameLen, -7,
      );
      fg.fillTriangle(
        -15, 7 - flameHalfWidth,
        -15, 7 + flameHalfWidth,
        -15 - flameLen, 7,
      );

      // Inner core flame (bright white-hot plasma)
      const coreLen = flameLen * 0.6;
      const coreHalfWidth = isBoosting ? 2.2 : 1.5;
      fg.fillStyle(0xffffff, 0.98);
      fg.fillTriangle(
        -15, -7 - coreHalfWidth,
        -15, -7 + coreHalfWidth,
        -15 - coreLen, -7,
      );
      fg.fillTriangle(
        -15, 7 - coreHalfWidth,
        -15, 7 + coreHalfWidth,
        -15 - coreLen, 7,
      );
    } else {
      // Idle engine hum: subtle glowing pilot flames
      const idleLen = 4 + Math.sin(time * 0.008 + ship.flickerOffset) * 1.5;
      const idleAlpha = 0.45 + Math.sin(time * 0.006) * 0.2;
      fg.fillStyle(ship.color, idleAlpha);
      fg.fillTriangle(-15, -9, -15, -5, -15 - idleLen, -7);
      fg.fillTriangle(-15, 5, -15, 9, -15 - idleLen, 7);
      fg.fillStyle(0xffffff, idleAlpha * 0.8);
      fg.fillTriangle(-15, -8, -15, -6, -15 - idleLen * 0.5, -7);
      fg.fillTriangle(-15, 6, -15, 8, -15 - idleLen * 0.5, 7);
    }
  }

  private updateShipTrails(ship: InterpolatedShip, delta: number): void {
    if (!ship.alive) return;

    const speed = ship.speed;
    if (speed <= 12) return;

    const cos = Math.cos(ship.rotation);
    const sin = Math.sin(ship.rotation);

    const leftX = ship.x - cos * 16 + sin * 7.5;
    const leftY = ship.y - sin * 16 - cos * 7.5;

    const rightX = ship.x - cos * 16 - sin * 7.5;
    const rightY = ship.y - sin * 16 + cos * 7.5;

    ship.trailAccumulator += delta;
    const emitInterval = Math.max(16, 36 - (speed / SHIP_MAX_SPEED) * 20);

    while (ship.trailAccumulator >= emitInterval) {
      ship.trailAccumulator -= emitInterval;
      ship.trailEmitter.emitParticleAt(leftX, leftY, 1);
      ship.trailEmitter.emitParticleAt(rightX, rightY, 1);

      if (speed > 160 && Math.random() < 0.6) {
        ship.sparkEmitter.emitParticleAt(leftX, leftY, 1);
        ship.sparkEmitter.emitParticleAt(rightX, rightY, 1);
      }
    }
  }

  private updateShipShield(ship: InterpolatedShip, time: number): void {
    const sg = ship.shieldGraphics;
    sg.clear();

    const isSpawnProtected = Date.now() < ship.spawnProtectedUntil;
    const hasShield = ship.hasShield || isSpawnProtected;

    if (!hasShield || !ship.alive) {
      sg.setVisible(false);
      return;
    }

    sg.setVisible(true);
    const shieldColor = isSpawnProtected ? 0xfde047 : 0x38bdf8;
    const pulseAlpha = 0.5 + 0.3 * Math.sin(time * 0.006 + ship.flickerOffset);

    sg.lineStyle(2, shieldColor, pulseAlpha);
    sg.strokeCircle(0, 0, SHIP_RADIUS * 1.35);

    sg.fillStyle(shieldColor, 0.12);
    sg.fillCircle(0, 0, SHIP_RADIUS * 1.35);

    const arcOffset = time * 0.002;
    sg.lineStyle(2.5, 0xffffff, pulseAlpha * 0.9);
    for (let i = 0; i < 3; i++) {
      const startAngle = arcOffset + (i * Math.PI * 2) / 3;
      const endAngle = startAngle + 0.7;
      sg.beginPath();
      sg.arc(0, 0, SHIP_RADIUS * 1.35, startAngle, endAngle);
      sg.strokePath();
    }
  }


  // ── Projectile creation ───────────────────────────────────────────────────

  private createProjectile(proj: ProjectileState): InterpolatedProjectile {
    const isMeteor = proj.ownerId === 'cosmic:meteor';
    const colorHex = isMeteor ? NEON.meteor : NEON.projectile;
    const color = Phaser.Display.Color.HexStringToColor(colorHex).color;

    const angle = Math.atan2(proj.velocityY, proj.velocityX);
    const container = this.add.container(proj.x, proj.y);
    container.setDepth(12);
    container.setRotation(angle);

    if (isMeteor) {
      // Meteor fireball with pulsing glow
      const glow = this.add.circle(0, 0, 18, color, 0.4);
      const core = this.add.circle(0, 0, 11, 0xffffff, 0.95);
      core.setStrokeStyle(2, color, 1);
      container.add([glow, core]);
    } else {
      // Sleek, thin, elongated energy laser bolt (length 26px along flight axis, width 3.5px)
      const glow = this.add.ellipse(0, 0, 26, 6.5, color, 0.45);
      const core = this.add.ellipse(0, 0, 22, 2.8, 0xffffff, 1.0);
      container.add([glow, core]);
    }

    return {
      id: proj.id,
      x: proj.x,
      y: proj.y,
      targetX: proj.x,
      targetY: proj.y,
      velocityX: proj.velocityX,
      velocityY: proj.velocityY,
      graphics: container,
    };
  }

  // ── Asteroid creation ─────────────────────────────────────────────────────

  private createAsteroid(ast: AsteroidState): InterpolatedAsteroid {
    const points = this.generateAsteroidShape(ast.radius, ast.seed);
    const polygon = this.add.polygon(0, 0, points, 0x8b9bb4, 0.3);
    polygon.setStrokeStyle(2, 0x8b9bb4, 0.8);

    const graphics = this.add.container(ast.x, ast.y, [polygon]);

    return {
      id: ast.id,
      x: ast.x,
      y: ast.y,
      targetX: ast.x,
      targetY: ast.y,
      rotation: 0,
      graphics,
      polygon,
    };
  }

  private generateAsteroidShape(radius: number, seed: number): Phaser.Types.Math.Vector2Like[] {
    const points: Phaser.Types.Math.Vector2Like[] = [];
    const numPoints = 8;
    const rng = this.seededRandom(seed);
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const r = radius * (0.7 + rng() * 0.6);
      points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
    }
    return points;
  }

  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  private updateAsteroidCracks(asteroid: InterpolatedAsteroid, ast: AsteroidState): void {
    const healthPercent = ast.health / ast.maxHealth;
    if (healthPercent < 0.5) {
      asteroid.polygon.setStrokeStyle(2, 0xff6666, 0.9);
    }
  }

  // ── Pickup creation ───────────────────────────────────────────────────────

  private createPickup(pickup: PickupState): InterpolatedPickup {
    const color = Phaser.Display.Color.HexStringToColor(PICKUP_COLORS[pickup.type] ?? '#38bdf8').color;

    // Outer glowing energy halo
    const halo = this.add.circle(0, 0, 18, color, 0.16);
    halo.setStrokeStyle(1.5, color, 0.7);

    // Inner orb base
    const core = this.add.circle(0, 0, 13, color, 0.45);
    core.setStrokeStyle(2, 0xffffff, 0.9);

    // Procedural neon vector icon
    const icon = this.add.graphics();
    this.drawPickupIcon(icon, pickup.type);

    const graphics = this.add.container(pickup.x, pickup.y, [halo, core, icon]);

    // Floating bobbing animation
    this.tweens.add({
      targets: graphics,
      y: pickup.y - 5,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return { id: pickup.id, x: pickup.x, y: pickup.y, type: pickup.type, graphics };
  }

  private drawPickupIcon(g: Phaser.GameObjects.Graphics, type: UpgradeType): void {
    g.clear();
    g.lineStyle(2, 0xffffff, 1);

    if (type === 'REPAIR') {
      // Green medical plus cross (+)
      g.lineBetween(-5, 0, 5, 0);
      g.lineBetween(0, -5, 0, 5);
    } else if (type === 'SHIELD') {
      // Protective crest polygon
      g.beginPath();
      g.moveTo(0, -6);
      g.lineTo(5, -2);
      g.lineTo(3.5, 4);
      g.lineTo(0, 7);
      g.lineTo(-3.5, 4);
      g.lineTo(-5, -2);
      g.closePath();
      g.strokePath();
    } else if (type === 'RAPID_FIRE') {
      // Twin rapid fire blaster barrels
      g.lineBetween(-3, -5, -3, 5);
      g.lineBetween(3, -5, 3, 5);
    } else if (type === 'ENERGY') {
      // Lightning bolt
      g.beginPath();
      g.moveTo(1, -6);
      g.lineTo(-3, 0);
      g.lineTo(2, 0);
      g.lineTo(-1, 6);
      g.strokePath();
    } else if (type === 'TRIPLE_SHOT') {
      // 3-way spread arrows
      g.lineBetween(0, 5, 0, -5);
      g.lineBetween(-2, 4, -5, -4);
      g.lineBetween(2, 4, 5, -4);
    } else if (type === 'EMP_BLAST') {
      // Concentric shockwave rings
      g.strokeCircle(0, 0, 3.5);
      g.lineStyle(1.5, 0xffffff, 0.8);
      g.strokeCircle(0, 0, 6.5);
    }
  }

  // ── Environment: Multi-Layer Parallax Starfield & Space Cosmos ────────────

  private createSpaceEnvironment(): void {
    // ── Layer 1: Distant Deep Stars (ScrollFactor: 0.05) ─────────────────────
    if (!this.textures.exists('starfield-far')) {
      const canvasFar = this.textures.createCanvas('starfield-far', 1024, 1024);
      if (canvasFar) {
        const ctx = canvasFar.getContext();
        // Deep pure space void
        ctx.fillStyle = '#02040a';
        ctx.fillRect(0, 0, 1024, 1024);

        // 400 tiny pinpoint background stars
        for (let i = 0; i < 400; i++) {
          const x = Math.random() * 1024;
          const y = Math.random() * 1024;
          const sz = Math.random() * 0.7 + 0.3;
          const a = Math.random() * 0.45 + 0.2;
          ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
          ctx.fillRect(x, y, sz, sz);
        }
        canvasFar.refresh();
      }
    }

    // ── Layer 2: Mid-Field Stars (ScrollFactor: 0.15) ────────────────────────
    if (!this.textures.exists('starfield-mid')) {
      const canvasMid = this.textures.createCanvas('starfield-mid', 1024, 1024);
      if (canvasMid) {
        const ctx = canvasMid.getContext();
        ctx.clearRect(0, 0, 1024, 1024);

        const starColors = [
          'rgba(255, 255, 255, 0.85)',
          'rgba(186, 230, 253, 0.85)',
          'rgba(165, 243, 252, 0.85)',
          'rgba(254, 240, 138, 0.75)',
        ];

        for (let i = 0; i < 220; i++) {
          const x = Math.random() * 1024;
          const y = Math.random() * 1024;
          const r = Math.random() * 0.8 + 0.6;
          const col = starColors[i % starColors.length]!;

          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        canvasMid.refresh();
      }
    }

    // ── Layer 3: Near-Field Bright Stars (ScrollFactor: 0.35) ────────────────
    if (!this.textures.exists('starfield-near')) {
      const canvasNear = this.textures.createCanvas('starfield-near', 1024, 1024);
      if (canvasNear) {
        const ctx = canvasNear.getContext();
        ctx.clearRect(0, 0, 1024, 1024);

        for (let i = 0; i < 85; i++) {
          const x = Math.random() * 1024;
          const y = Math.random() * 1024;
          const r = Math.random() * 1.2 + 0.9;

          // Soft star aura glow
          ctx.fillStyle = 'rgba(125, 211, 252, 0.25)';
          ctx.beginPath();
          ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Bright star core
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();

          // Subtle 4-point cross diffraction glint on select bright stars
          if (i % 12 === 0) {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(x - 5, y);
            ctx.lineTo(x + 5, y);
            ctx.moveTo(x, y - 5);
            ctx.lineTo(x, y + 5);
            ctx.stroke();
          }
        }
        canvasNear.refresh();
      }
    }

    // Mount 3 TileSprites for smooth multi-layer parallax
    this.starfieldFar = this.add.tileSprite(0, 0, ARENA_WIDTH * 2.4, ARENA_HEIGHT * 2.4, 'starfield-far');
    this.starfieldFar.setOrigin(0, 0);
    this.starfieldFar.setScrollFactor(0.05);
    this.starfieldFar.setDepth(0);

    this.starfieldMid = this.add.tileSprite(0, 0, ARENA_WIDTH * 2.4, ARENA_HEIGHT * 2.4, 'starfield-mid');
    this.starfieldMid.setOrigin(0, 0);
    this.starfieldMid.setScrollFactor(0.15);
    this.starfieldMid.setDepth(1);

    this.starfieldNear = this.add.tileSprite(0, 0, ARENA_WIDTH * 2.4, ARENA_HEIGHT * 2.4, 'starfield-near');
    this.starfieldNear.setOrigin(0, 0);
    this.starfieldNear.setScrollFactor(0.35);
    this.starfieldNear.setDepth(2);

    this.planetContainer = this.add.container(0, 0);
    this.planetContainer.setDepth(2);
  }

  private createGrid(): void {
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.setDepth(3);
    this.gridGraphics.lineStyle(1, Phaser.Display.Color.HexStringToColor(NEON.grid).color, 0.35);
    const gridSize = 200;

    for (let x = 0; x <= ARENA_WIDTH; x += gridSize) {
      this.gridGraphics.moveTo(x, 0);
      this.gridGraphics.lineTo(x, ARENA_HEIGHT);
    }
    for (let y = 0; y <= ARENA_HEIGHT; y += gridSize) {
      this.gridGraphics.moveTo(0, y);
      this.gridGraphics.lineTo(ARENA_WIDTH, y);
    }
    this.gridGraphics.strokePath();

    // Sector tactical cross markings every 400px
    this.gridGraphics.lineStyle(1.5, 0x22d3ee, 0.4);
    for (let x = 400; x < ARENA_WIDTH; x += 400) {
      for (let y = 400; y < ARENA_HEIGHT; y += 400) {
        this.gridGraphics.lineBetween(x - 8, y, x + 8, y);
        this.gridGraphics.lineBetween(x, y - 8, x, y + 8);
      }
    }
  }

  private createBoundary(): void {
    this.boundaryGraphics = this.add.graphics();
    this.boundaryGraphics.setDepth(4);
    this.boundaryGraphics.lineStyle(4, Phaser.Display.Color.HexStringToColor(NEON.boundary).color, 0.85);
    this.boundaryGraphics.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Hazard corner indicators
    const cornerSize = 40;
    this.boundaryGraphics.lineStyle(2, 0xf43f5e, 0.8);
    this.boundaryGraphics.strokeRect(0, 0, cornerSize, cornerSize);
    this.boundaryGraphics.strokeRect(ARENA_WIDTH - cornerSize, 0, cornerSize, cornerSize);
    this.boundaryGraphics.strokeRect(0, ARENA_HEIGHT - cornerSize, cornerSize, cornerSize);
    this.boundaryGraphics.strokeRect(ARENA_WIDTH - cornerSize, ARENA_HEIGHT - cornerSize, cornerSize, cornerSize);
  }

  private createSafeZone(): void {
    this.safeZoneGraphics = this.add.graphics();
    this.safeZoneGraphics.setDepth(4);
  }

  private updateSafeZone(zone: SafeZoneState): void {
    this.safeZoneGraphics.clear();
    const color = zone.isShrinking ? NEON.storm : NEON.safeZone;
    this.safeZoneGraphics.lineStyle(6, Phaser.Display.Color.HexStringToColor(color).color, 0.8);
    this.safeZoneGraphics.strokeCircle(zone.centerX, zone.centerY, zone.radius);
    // Danger overlay outside the safe zone using an outer ring stroke
    const maxArenaRadius = Math.hypot(ARENA_WIDTH, ARENA_HEIGHT);
    if (zone.radius < maxArenaRadius) {
      const stormThickness = maxArenaRadius - zone.radius;
      this.safeZoneGraphics.lineStyle(stormThickness, 0xf43f5e, 0.07);
      this.safeZoneGraphics.strokeCircle(
        zone.centerX,
        zone.centerY,
        zone.radius + stormThickness / 2,
      );
    }
  }

  // ── Explosions ────────────────────────────────────────────────────────────

  private createExplosion(x: number, y: number, color: number): void {
    if (this.explosionEmitter) {
      this.explosionEmitter.emitParticleAt(x, y, 28);
    }
    // Expanding neon shockwave ring
    const ring = this.add.circle(x, y, 6);
    ring.setStrokeStyle(3, color, 1);
    ring.setDepth(18);
    this.tweens.add({
      targets: ring,
      radius: 68,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  // ── EMP Blast Shockwave ────────────────────────────────────────────────────

  private createEmpShockwave(x: number, y: number): void {
    soundManager.playEmpBlast();

    // 1. Dual expanding neon cyan shockwave rings up to EMP_RADIUS (450px)
    const ringOuter = this.add.circle(x, y, 16);
    ringOuter.setStrokeStyle(4, 0x06b6d4, 1);
    ringOuter.setDepth(19);

    const ringInner = this.add.circle(x, y, 8);
    ringInner.setStrokeStyle(2.5, 0xffffff, 0.95);
    ringInner.setDepth(19);

    this.tweens.add({
      targets: ringOuter,
      radius: EMP_RADIUS,
      alpha: 0,
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => ringOuter.destroy(),
    });

    this.tweens.add({
      targets: ringInner,
      radius: EMP_RADIUS * 0.7,
      alpha: 0,
      duration: 450,
      ease: 'Quad.easeOut',
      onComplete: () => ringInner.destroy(),
    });
  }

  // ── Interpolation & Local Prediction ──────────────────────────────────────

  private interpolateShips(delta: number): void {
    const factor = Math.min(1, delta / INTERPOLATION_DELAY_MS) * LERP_FACTOR;
    for (const ship of this.ships.values()) {
      ship.x = Phaser.Math.Linear(ship.x, ship.targetX, factor);
      ship.y = Phaser.Math.Linear(ship.y, ship.targetY, factor);
      ship.rotation = this.lerpAngle(ship.rotation, ship.targetRotation, factor);
      ship.graphics.setPosition(ship.x, ship.y);
      ship.shipVisualContainer.setRotation(ship.rotation);
    }
  }

  private interpolateProjectiles(delta: number): void {
    const dt = delta / 1000;
    for (const proj of this.projectiles.values()) {
      // Advance at true physical speed without delay
      proj.x += proj.velocityX * dt;
      proj.y += proj.velocityY * dt;

      // Softly reconcile towards authoritative server position
      proj.x = Phaser.Math.Linear(proj.x, proj.targetX, 0.25);
      proj.y = Phaser.Math.Linear(proj.y, proj.targetY, 0.25);

      proj.graphics.setPosition(proj.x, proj.y);
      proj.graphics.setRotation(Math.atan2(proj.velocityY, proj.velocityX));
    }
  }

  private interpolateAsteroids(delta: number): void {
    const factor = Math.min(1, delta / INTERPOLATION_DELAY_MS) * LERP_FACTOR;
    for (const ast of this.asteroids.values()) {
      ast.x = Phaser.Math.Linear(ast.x, ast.targetX, factor);
      ast.y = Phaser.Math.Linear(ast.y, ast.targetY, factor);
      ast.rotation += delta * 0.0005;
      ast.graphics.setPosition(ast.x, ast.y);
      ast.graphics.setRotation(ast.rotation);
    }
  }

  private interpolatePickups(delta: number): void {
    for (const pickup of this.pickups.values()) {
      pickup.graphics.setRotation(pickup.graphics.rotation + delta * 0.001);
    }
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private fitZoom(spanX: number, spanY: number): number {
    const cam = this.cameras.main;
    return Math.min(cam.width / spanX, cam.height / spanY);
  }

  /** Smoothly frames the bounding box of all living ships (whole arena when none). */
  private updateCamera(): void {
    const cam = this.cameras.main;
    const alive = [...this.ships.values()].filter((s) => s.alive);
    let minX = 0;
    let minY = 0;
    let maxX = ARENA_WIDTH;
    let maxY = ARENA_HEIGHT;
    if (alive.length > 0) {
      minX = Math.min(...alive.map((s) => s.x)) - CAMERA_PADDING;
      maxX = Math.max(...alive.map((s) => s.x)) + CAMERA_PADDING;
      minY = Math.min(...alive.map((s) => s.y)) - CAMERA_PADDING;
      maxY = Math.max(...alive.map((s) => s.y)) + CAMERA_PADDING;
    }
    const spanX = Math.min(ARENA_WIDTH, Math.max(CAMERA_MIN_ZOOM_SPAN, maxX - minX));
    const spanY = Math.min(ARENA_HEIGHT, Math.max(CAMERA_MIN_ZOOM_SPAN, maxY - minY));
    const minZoom = this.fitZoom(ARENA_WIDTH, ARENA_HEIGHT);
    const targetZoom = Math.max(minZoom, this.fitZoom(spanX, spanY));
    cam.setZoom(Phaser.Math.Linear(cam.zoom, targetZoom, CAMERA_LERP));
    const centerX = cam.midPoint.x;
    const centerY = cam.midPoint.y;
    cam.centerOn(
      Phaser.Math.Linear(centerX, (minX + maxX) / 2, CAMERA_LERP * 2),
      Phaser.Math.Linear(centerY, (minY + maxY) / 2, CAMERA_LERP * 2),
    );
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  shutdown(): void {
    this.unsubscribeSnapshot?.();
    this.unsubscribeEliminated?.();
    for (const ship of this.ships.values()) {
      ship.graphics.destroy();
      ship.trailEmitter.destroy();
      ship.sparkEmitter.destroy();
    }
    for (const proj of this.projectiles.values()) proj.graphics.destroy();
    for (const ast of this.asteroids.values()) ast.graphics.destroy();
    for (const pickup of this.pickups.values()) pickup.graphics.destroy();
    if (this.explosionEmitter) this.explosionEmitter.destroy();
    this.ships.clear();
    this.projectiles.clear();
    this.asteroids.clear();
    this.pickups.clear();
  }
}
