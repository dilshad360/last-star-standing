import Phaser from 'phaser';
import type {
  AsteroidState,
  GameSnapshot,
  PickupState,
  PlayerState,
  ProjectileState,
  SafeZoneState,
  PlayerInput,
} from '@lss/shared';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  NEON,
  PICKUP_COLORS,
  SHIP_COLORS,
  SHIP_MAX_SPEED,
  SHIP_RADIUS,
} from '@lss/shared';
import { gameEvents } from '../EventBus.js';
import { socketClient } from '../../networking/SocketClient.js';
import { soundManager } from '../audio/SoundManager.js';
import { InputManager } from '../input/InputManager.js';

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
  hullGraphics: Phaser.GameObjects.Graphics;
  flameGraphics: Phaser.GameObjects.Graphics;
  shieldGraphics: Phaser.GameObjects.Graphics;
  healthBar: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  localIndicator?: Phaser.GameObjects.Graphics;
  trailEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
}

interface InterpolatedProjectile {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
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
  graphics: Phaser.GameObjects.Container;
}

const INTERPOLATION_DELAY_MS = 100; // Render 100ms behind server time
const LERP_FACTOR = 0.2;

/**
 * Main game scene: renders the 2400×2400 neon arena with procedural graphics,
 * interpolates server snapshots, handles input, and manages the camera.
 */
export class ArenaScene extends Phaser.Scene {
  private inputManager!: InputManager;
  private localPlayerId: string | null = null;
  private ships = new Map<string, InterpolatedShip>();
  private projectiles = new Map<string, InterpolatedProjectile>();
  private asteroids = new Map<string, InterpolatedAsteroid>();
  private pickups = new Map<string, InterpolatedPickup>();
  private safeZoneGraphics!: Phaser.GameObjects.Graphics;
  private starfield!: Phaser.GameObjects.TileSprite;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private boundaryGraphics!: Phaser.GameObjects.Graphics;
  private latestSnapshot: GameSnapshot | null = null;
  private spectatorIndex = 0;
  private unsubscribeSnapshot: (() => void) | null = null;
  private unsubscribeEliminated: (() => void) | null = null;
  private explosionEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: 'ArenaScene' });
  }

  init(data: { localPlayerId?: string }): void {
    this.localPlayerId = data.localPlayerId ?? null;
    this.inputManager = new InputManager();
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

    this.createStarfield();
    this.createGrid();
    this.createBoundary();
    this.createSafeZone();

    // Attach input manager to canvas
    const canvas = this.game.canvas;
    this.inputManager.attach(canvas, (input) => {
      // The scene adds aimAngle and forwards to server via SocketClient
      this.handleLocalInput(input);
    });

    // Subscribe to snapshots via EventBus
    this.unsubscribeSnapshot = gameEvents.on('snapshot:update', (snapshot) => {
      this.latestSnapshot = snapshot;
      this.processSnapshot(snapshot);
    });

    this.unsubscribeEliminated = gameEvents.on('player:eliminated', (entry) => {
      const victimShip = this.ships.get(entry.victimId);
      if (victimShip) {
        this.createExplosion(victimShip.x, victimShip.y, victimShip.color);
      }
      if (entry.victimId === this.localPlayerId) {
        this.startSpectating();
      }
    });

    // Detach DOM listeners and EventBus subs on every scene restart/shutdown.
    this.events.once('shutdown', this.shutdown, this);

    // Camera setup
    this.cameras.main.setBounds(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    this.cameras.main.setZoom(0.8);
  }

  update(time: number, delta: number): void {
    // Animate starfield parallax
    if (this.starfield) {
      this.starfield.tilePositionX = this.cameras.main.scrollX * 0.1;
      this.starfield.tilePositionY = this.cameras.main.scrollY * 0.1;
    }

    // Interpolate all entities
    this.interpolateShips(delta);
    this.interpolateProjectiles(delta);
    this.interpolateAsteroids(delta);
    this.interpolatePickups(delta);

    // Animate procedural thrusters, dynamic flames, shields & trails
    this.updateShipEffects(time, delta);

    // Update camera
    this.updateCamera();
  }

  // ── Snapshot processing ───────────────────────────────────────────────────

  private processSnapshot(snapshot: GameSnapshot): void {
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
      ship.prevX = ship.x;
      ship.prevY = ship.y;
      ship.prevRotation = ship.rotation;
      ship.targetX = player.x;
      ship.targetY = player.y;
      ship.targetRotation = player.rotation;
      ship.lastUpdate = now;
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
    }
    // Remove dead projectiles and add tiny impact spark burst
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
      // Update crack visibility based on health
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
        pickup.graphics.destroy();
        this.pickups.delete(id);
      }
    }

    // Update safe zone
    this.updateSafeZone(snapshot.safeZone);
  }

  // ── Ship creation & visuals ───────────────────────────────────────────────

  private createShip(player: PlayerState): InterpolatedShip {
    const isLocal = player.id === this.localPlayerId;
    const color = Phaser.Display.Color.HexStringToColor(
      SHIP_COLORS[player.colorIndex % SHIP_COLORS.length]!,
    ).color;

    // Detailed procedural neon spaceship hull
    const hullGraphics = this.add.graphics();
    this.drawDetailedShipHull(hullGraphics, color, isLocal);

    // Dynamic dual exhaust flames (rendered beneath the ship hull)
    const flameGraphics = this.add.graphics();

    // Forcefield energy shield bubble
    const shieldGraphics = this.add.graphics();
    shieldGraphics.setVisible(false);

    // Health bar background
    const healthBarBg = this.add.rectangle(0, -SHIP_RADIUS - 16, 40, 4, 0x1e293b);
    const healthBar = this.add.graphics();

    // Name tag
    const nameText = this.add.text(0, -SHIP_RADIUS - 30, player.displayName, {
      fontSize: '12px',
      color: isLocal ? '#22d3ee' : '#ffffff',
      fontFamily: 'monospace',
    });
    nameText.setOrigin(0.5, 0.5);

    // Tactical reticle chevron for local player
    let localIndicator: Phaser.GameObjects.Graphics | undefined;
    if (isLocal) {
      localIndicator = this.add.graphics();
      localIndicator.lineStyle(2, 0x22d3ee, 0.95);
      localIndicator.beginPath();
      localIndicator.moveTo(-6, -SHIP_RADIUS - 10);
      localIndicator.lineTo(0, -SHIP_RADIUS - 5);
      localIndicator.lineTo(6, -SHIP_RADIUS - 10);
      localIndicator.strokePath();
    }

    // Container holding all local ship components (depth 10)
    const containerChildren: Phaser.GameObjects.GameObject[] = [
      flameGraphics,
      hullGraphics,
      shieldGraphics,
      healthBarBg,
      healthBar,
      nameText,
    ];
    if (localIndicator) {
      containerChildren.push(localIndicator);
    }

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
      hullGraphics,
      flameGraphics,
      shieldGraphics,
      healthBar,
      nameText,
      localIndicator,
      trailEmitter,
      sparkEmitter,
    };

    return ship;
  }

  /**
   * Procedurally draws a sleek, detailed sci-fi space interceptor with
   * swept wings, armor plating, dual blaster cannons, cockpit canopy with
   * reflection gleam, engine nacelles, and navigation lights.
   */
  private drawDetailedShipHull(g: Phaser.GameObjects.Graphics, color: number, isLocal: boolean): void {
    g.clear();

    // ── 1. Base Armored Hull Outline & Polygon ────────────────────────────────
    // Faceted space interceptor silhouette facing +X (nose at +24, wingspan ±21.5)
    const hullPoints: Phaser.Types.Math.Vector2Like[] = [
      { x: 24, y: 0 },       // Nose cone tip
      { x: 15, y: -4.5 },    // Forward chine slope
      { x: 7, y: -7 },       // Leading strake root
      { x: -5, y: -20 },     // Swept wing leading edge
      { x: 4, y: -20 },      // Left wingtip weapon launcher rail
      { x: 4, y: -21.5 },    // Left wingtip outer corner
      { x: -8, y: -21.5 },   // Left wingtip trailing edge
      { x: -11, y: -16 },    // Left wing root notch
      { x: -9, y: -11 },     // Left wing trailing inner notch
      { x: -16, y: -11 },    // Left engine nacelle outer corner
      { x: -16, y: -4 },     // Left engine exhaust nozzle port
      { x: -12, y: 0 },      // Rear center keel notch
      { x: -16, y: 4 },      // Right engine exhaust nozzle port
      { x: -16, y: 11 },     // Right engine nacelle outer corner
      { x: -9, y: 11 },      // Right wing trailing inner notch
      { x: -11, y: 16 },     // Right wing root notch
      { x: -8, y: 21.5 },    // Right wingtip trailing edge
      { x: 4, y: 21.5 },     // Right wingtip outer corner
      { x: 4, y: 20 },       // Right wingtip weapon launcher rail
      { x: -5, y: 20 },      // Swept wing leading edge
      { x: 7, y: 7 },        // Leading strake root
      { x: 15, y: 4.5 },     // Forward chine slope
    ];

    // Dark armored hull base fill
    g.fillStyle(0x0a0f24, 0.95);
    g.fillPoints(hullPoints, true);

    // ── 2. Wing Armor Plating Panels (Dual Tone) ──────────────────────────────
    // Upper wing panel plate
    g.fillStyle(0x131d3b, 0.85);
    g.fillPoints([
      { x: 6, y: -6.5 },
      { x: -4, y: -18 },
      { x: -8, y: -15 },
      { x: -7, y: -9 },
    ], true);

    // Lower wing panel plate
    g.fillPoints([
      { x: 6, y: 6.5 },
      { x: -4, y: 18 },
      { x: -8, y: 15 },
      { x: -7, y: 9 },
    ], true);

    // Center fuselage armored spine plate
    g.fillStyle(0x10172e, 0.9);
    g.fillPoints([
      { x: 15, y: 0 },
      { x: 5, y: -4.5 },
      { x: -5, y: -4.5 },
      { x: -11, y: 0 },
      { x: -5, y: 4.5 },
      { x: 5, y: 4.5 },
    ], true);

    // ── 3. Engine Nacelles & Exhaust Ports ─────────────────────────────────────
    // Left engine nacelle body
    g.fillStyle(0x172554, 0.9);
    g.fillRect(-16, -11, 7, 7);
    // Right engine nacelle body
    g.fillRect(-16, 4, 7, 7);

    // Engine intake/nozzle rings (metallic rims)
    g.lineStyle(1.5, 0x334155, 1);
    g.strokeRect(-16, -11, 7, 7);
    g.strokeRect(-16, 4, 7, 7);

    // Engine exhaust nozzle ports (inner glowing rim)
    g.lineStyle(2, color, 0.9);
    g.lineBetween(-16, -10.5, -16, -4.5);
    g.lineBetween(-16, 4.5, -16, 10.5);

    // ── 4. Main Hull Neon Vector Stroke & Panel Creases ───────────────────────
    // Vibrant neon outer perimeter
    g.lineStyle(isLocal ? 2.5 : 2, color, isLocal ? 1 : 0.9);
    g.strokePoints(hullPoints, true);

    // Subtle neon inner panel accent lines
    g.lineStyle(1, color, 0.45);
    g.lineBetween(6, -6.5, -4, -18);
    g.lineBetween(6, 6.5, -4, 18);
    g.lineBetween(23, 0, 14, 0);
    g.lineBetween(-3, 0, -11, 0);

    // ── 5. Wingtip Laser Blaster Cannons ───────────────────────────────────────
    // Left cannon barrel
    g.lineStyle(2, 0x64748b, 1);
    g.lineBetween(-4, -20.5, 6, -20.5);
    // Right cannon barrel
    g.lineBetween(-4, 20.5, 6, 20.5);

    // Glowing energy tips on the gun muzzles
    g.fillStyle(0xffffff, 1);
    g.fillCircle(6.5, -20.5, 1.8);
    g.fillCircle(6.5, 20.5, 1.8);
    g.fillStyle(color, 0.85);
    g.fillCircle(6.5, -20.5, 3);
    g.fillCircle(6.5, 20.5, 3);

    // ── 6. Cockpit Canopy (Fighter Jet Diamond Visor) ──────────────────────────
    const canopyPoints: Phaser.Types.Math.Vector2Like[] = [
      { x: 13, y: 0 },
      { x: 2.5, y: -4 },
      { x: -3, y: 0 },
      { x: 2.5, y: 4 },
    ];
    // Translucent electric neon visor glass
    g.fillStyle(0x00f5ff, 0.75);
    g.fillPoints(canopyPoints, true);

    // Cockpit neon frame
    g.lineStyle(1.5, 0xe0f2fe, 0.95);
    g.strokePoints(canopyPoints, true);

    // Specular glass glare highlight streak
    g.lineStyle(1, 0xffffff, 0.9);
    g.lineBetween(10, -1.2, 1, -3);

    // ── 7. Wingtip Navigation Beacons ─────────────────────────────────────────
    // Port wingtip: Ruby Red LED
    g.fillStyle(0xf43f5e, 0.9);
    g.fillCircle(-6, -21.5, 1.8);
    // Starboard wingtip: Emerald Green LED
    g.fillStyle(0x10b981, 0.9);
    g.fillCircle(-6, 21.5, 1.8);
  }

  private updateShipVisuals(ship: InterpolatedShip, player: PlayerState): void {
    ship.speed = Math.hypot(player.velocityX, player.velocityY);
    ship.alive = player.alive;
    ship.hasShield = player.shield > 0;
    ship.spawnProtectedUntil = player.spawnProtectedUntil;

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
    } else {
      ship.graphics.setAlpha(1.0);
    }
  }

  // ── Dynamic Thrusters, Flames, Shields & Trails ───────────────────────────

  private updateShipEffects(time: number, delta: number): void {
    for (const ship of this.ships.values()) {
      this.updateShipFlames(ship, time);
      this.updateShipShield(ship, time);

      // Pulse local indicator
      if (ship.localIndicator) {
        ship.localIndicator.setAlpha(0.6 + 0.4 * Math.sin(time * 0.005));
      }

      this.updateShipTrails(ship, delta);
    }
  }

  /**
   * Renders twin dynamic rocket exhaust plumes extending backwards from
   * the engine nozzles (-16, -7.5) and (-16, +7.5), complete with high-frequency
   * flicker, speed scaling, and white-hot inner core plasma.
   */
  private updateShipFlames(ship: InterpolatedShip, time: number): void {
    const fg = ship.flameGraphics;
    fg.clear();

    if (!ship.alive) return;

    const speed = ship.speed;
    const throttle = Math.min(1, speed / SHIP_MAX_SPEED);

    if (speed > 12) {
      // Active thrusting: twin elongated rocket exhaust flames
      const baseLen = 10 + throttle * 22;
      const flicker = Math.sin(time * 0.05 + ship.flickerOffset) * 3 + (Math.random() - 0.5) * 4;
      const flameLen = Math.max(6, baseLen + flicker);
      const flameHalfWidth = 3.2;

      // Outer plasma flame (ship neon tint)
      fg.fillStyle(ship.color, 0.85);
      // Left outer flame
      fg.fillTriangle(
        -16, -7.5 - flameHalfWidth,
        -16, -7.5 + flameHalfWidth,
        -16 - flameLen, -7.5,
      );
      // Right outer flame
      fg.fillTriangle(
        -16, 7.5 - flameHalfWidth,
        -16, 7.5 + flameHalfWidth,
        -16 - flameLen, 7.5,
      );

      // Inner core flame (bright white-hot plasma)
      const coreLen = flameLen * 0.55;
      const coreHalfWidth = 1.6;
      fg.fillStyle(0xffffff, 0.95);
      // Left inner core
      fg.fillTriangle(
        -16, -7.5 - coreHalfWidth,
        -16, -7.5 + coreHalfWidth,
        -16 - coreLen, -7.5,
      );
      // Right inner core
      fg.fillTriangle(
        -16, 7.5 - coreHalfWidth,
        -16, 7.5 + coreHalfWidth,
        -16 - coreLen, 7.5,
      );
    } else {
      // Idle engine hum: subtle glowing pilot flames
      const idleLen = 4 + Math.sin(time * 0.008 + ship.flickerOffset) * 1.5;
      const idleAlpha = 0.45 + Math.sin(time * 0.006) * 0.2;
      fg.fillStyle(ship.color, idleAlpha);
      fg.fillTriangle(-16, -9.5, -16, -5.5, -16 - idleLen, -7.5);
      fg.fillTriangle(-16, 5.5, -16, 9.5, -16 - idleLen, 7.5);
      // Tiny white center
      fg.fillStyle(0xffffff, idleAlpha * 0.8);
      fg.fillTriangle(-16, -8.5, -16, -6.5, -16 - idleLen * 0.5, -7.5);
      fg.fillTriangle(-16, 6.5, -16, 8.5, -16 - idleLen * 0.5, 7.5);
    }
  }

  /**
   * Emits glowing neon particles into world space at both engine nozzles
   * to create authentic lingering plasma thruster wake trails (trailers)
   * that follow the ship's curved flight path.
   */
  private updateShipTrails(ship: InterpolatedShip, delta: number): void {
    if (!ship.alive) return;

    const speed = ship.speed;
    if (speed <= 12) return;

    // Calculate world coordinates of twin exhaust nozzles (-16, -7.5) and (-16, +7.5)
    const cos = Math.cos(ship.rotation);
    const sin = Math.sin(ship.rotation);

    const leftX = ship.x - cos * 16 + sin * 7.5;
    const leftY = ship.y - sin * 16 - cos * 7.5;

    const rightX = ship.x - cos * 16 - sin * 7.5;
    const rightY = ship.y - sin * 16 + cos * 7.5;

    ship.trailAccumulator += delta;
    // Faster speed = higher trail frequency so there are no gaps in the trail
    const emitInterval = Math.max(16, 36 - (speed / SHIP_MAX_SPEED) * 20);

    while (ship.trailAccumulator >= emitInterval) {
      ship.trailAccumulator -= emitInterval;

      // Emit glowing plasma trailer particles from both nozzles into world space
      ship.trailEmitter.emitParticleAt(leftX, leftY, 1);
      ship.trailEmitter.emitParticleAt(rightX, rightY, 1);

      // High-speed energetic exhaust sparks
      if (speed > 160 && Math.random() < 0.6) {
        ship.sparkEmitter.emitParticleAt(leftX, leftY, 1);
        ship.sparkEmitter.emitParticleAt(rightX, rightY, 1);
      }
    }
  }

  /**
   * Animates a rotating, pulsing energy shield forcefield bubble.
   */
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

    // Outer shield perimeter ring
    sg.lineStyle(2, shieldColor, pulseAlpha);
    sg.strokeCircle(0, 0, SHIP_RADIUS * 1.35);

    // Translucent shield bubble fill
    sg.fillStyle(shieldColor, 0.12);
    sg.fillCircle(0, 0, SHIP_RADIUS * 1.35);

    // Three rotating high-energy shield arc segments
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
    const radius = isMeteor ? 14 : 5;

    const container = this.add.container(proj.x, proj.y);
    container.setDepth(12);

    // Outer plasma glow
    const glow = this.add.circle(0, 0, radius * 1.6, color, 0.3);
    // Core bolt elongated in flight direction
    const core = this.add.ellipse(0, 0, radius * 2.4, radius * 1.1, 0xffffff, 0.95);
    core.setStrokeStyle(1.5, color, 0.95);
    container.add([glow, core]);

    return {
      id: proj.id,
      x: proj.x,
      y: proj.y,
      targetX: proj.x,
      targetY: proj.y,
      graphics: container,
    };
  }

  // ── Asteroid creation ─────────────────────────────────────────────────────

  private createAsteroid(ast: AsteroidState): InterpolatedAsteroid {
    // Generate polygon from seed
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
    const color = Phaser.Display.Color.HexStringToColor(PICKUP_COLORS[pickup.type]).color;
    const circle = this.add.circle(0, 0, 16, color, 0.4);
    circle.setStrokeStyle(2, color, 1);
    const graphics = this.add.container(pickup.x, pickup.y, [circle]);
    return { id: pickup.id, x: pickup.x, y: pickup.y, graphics };
  }

  // ── Environment ───────────────────────────────────────────────────────────

  private createStarfield(): void {
    // Generate starfield texture procedurally
    const canvas = this.textures.createCanvas('starfield', 512, 512);
    if (!canvas) return;
    const ctx = canvas.getContext();
    ctx.fillStyle = '#05050f';
    ctx.fillRect(0, 0, 512, 512);
    // Draw stars
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const size = Math.random() * 1.5 + 0.5;
      const alpha = Math.random() * 0.5 + 0.3;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(x, y, size, size);
    }
    canvas.refresh();
    this.starfield = this.add.tileSprite(0, 0, ARENA_WIDTH * 2, ARENA_HEIGHT * 2, 'starfield');
    this.starfield.setOrigin(0, 0);
    this.starfield.setScrollFactor(0.3); // Parallax effect
  }

  private createGrid(): void {
    this.gridGraphics = this.add.graphics();
    this.gridGraphics.lineStyle(1, Phaser.Display.Color.HexStringToColor(NEON.grid).color, 0.3);
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
  }

  private createBoundary(): void {
    this.boundaryGraphics = this.add.graphics();
    this.boundaryGraphics.lineStyle(4, Phaser.Display.Color.HexStringToColor(NEON.boundary).color, 0.8);
    this.boundaryGraphics.strokeRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
  }

  private createSafeZone(): void {
    this.safeZoneGraphics = this.add.graphics();
  }

  private updateSafeZone(zone: SafeZoneState): void {
    this.safeZoneGraphics.clear();
    const color = zone.isShrinking ? NEON.storm : NEON.safeZone;
    this.safeZoneGraphics.lineStyle(6, Phaser.Display.Color.HexStringToColor(color).color, 0.8);
    this.safeZoneGraphics.strokeCircle(zone.centerX, zone.centerY, zone.radius);
    // Danger overlay outside zone
    if (zone.radius < 2000) {
      this.safeZoneGraphics.fillStyle(0xf43f5e, 0.05);
      this.safeZoneGraphics.fillCircle(zone.centerX, zone.centerY, 2000);
      this.safeZoneGraphics.fillStyle(0x000000, 0);
      this.safeZoneGraphics.fillCircle(zone.centerX, zone.centerY, zone.radius);
    }
  }

  // ── Explosions ────────────────────────────────────────────────────────────

  private createExplosion(x: number, y: number, color: number): void {
    if (this.explosionEmitter) {
      this.explosionEmitter.emitParticleAt(x, y, 24);
    }
    // Expanding neon shockwave ring
    const ring = this.add.circle(x, y, 6);
    ring.setStrokeStyle(3, color, 1);
    ring.setDepth(18);
    this.tweens.add({
      targets: ring,
      radius: 64,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  // ── Interpolation ─────────────────────────────────────────────────────────

  private interpolateShips(delta: number): void {
    const factor = Math.min(1, delta / INTERPOLATION_DELAY_MS) * LERP_FACTOR;
    for (const ship of this.ships.values()) {
      ship.x = Phaser.Math.Linear(ship.x, ship.targetX, factor);
      ship.y = Phaser.Math.Linear(ship.y, ship.targetY, factor);
      ship.rotation = this.lerpAngle(ship.rotation, ship.targetRotation, factor);
      ship.graphics.setPosition(ship.x, ship.y);
      ship.graphics.setRotation(ship.rotation);
      // Update camera for input manager
      if (ship.id === this.localPlayerId) {
        this.inputManager.updateCamera(ship.x, ship.y, this.cameras.main.zoom);
      }
    }
  }

  private interpolateProjectiles(delta: number): void {
    const factor = Math.min(1, delta / INTERPOLATION_DELAY_MS) * LERP_FACTOR;
    for (const proj of this.projectiles.values()) {
      const dx = proj.targetX - proj.x;
      const dy = proj.targetY - proj.y;
      if (Math.hypot(dx, dy) > 0.01) {
        proj.graphics.setRotation(Math.atan2(dy, dx));
      }
      proj.x = Phaser.Math.Linear(proj.x, proj.targetX, factor);
      proj.y = Phaser.Math.Linear(proj.y, proj.targetY, factor);
      proj.graphics.setPosition(proj.x, proj.y);
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

  // ── Camera & input ─────────────────────────────────────────────────────────

  private updateCamera(): void {
    const targetId = this.localPlayerId ?? this.getSpectatorTarget();
    const ship = targetId ? this.ships.get(targetId) : null;
    if (ship) {
      this.cameras.main.centerOn(ship.x, ship.y);
    }
  }

  private getSpectatorTarget(): string | null {
    const alive = [...this.ships.values()].filter((s) => {
      const player = this.latestSnapshot?.players.find((p) => p.id === s.id);
      return player?.alive;
    });
    if (alive.length === 0) return null;
    return alive[this.spectatorIndex % alive.length]!.id;
  }

  private startSpectating(): void {
    this.spectatorIndex = 0;
    soundManager.playExplosion();
  }

  nextSpectatorTarget(): void {
    this.spectatorIndex++;
  }

  prevSpectatorTarget(): void {
    this.spectatorIndex = Math.max(0, this.spectatorIndex - 1);
  }

  getCurrentSpectatorTargetName(): string | null {
    const targetId = this.getSpectatorTarget();
    if (!targetId) return null;
    const player = this.latestSnapshot?.players.find((p) => p.id === targetId);
    return player?.displayName ?? null;
  }

  private handleLocalInput(input: PlayerInput): void {
    // Calculate aim angle from local ship position
    const localShip = this.localPlayerId ? this.ships.get(this.localPlayerId) : null;
    if (localShip) {
      const worldMouse = this.inputManager.getCurrentInput(localShip.x, localShip.y);
      input.aimAngle = worldMouse.aimAngle;
    }
    socketClient.sendInput(input);
    if (input.shooting) {
      soundManager.playLaser();
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  shutdown(): void {
    this.unsubscribeSnapshot?.();
    this.unsubscribeEliminated?.();
    this.inputManager.detach();
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
