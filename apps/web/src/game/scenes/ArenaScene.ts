import Phaser from 'phaser';
import type {
  AsteroidState,
  GameSnapshot,
  PickupState,
  PlayerState,
  ProjectileState,
  SafeZoneState,
} from '@lss/shared';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  NEON,
  PICKUP_COLORS,
  SHIP_COLORS,
  SHIP_RADIUS,
} from '@lss/shared';
import { gameEvents } from '../EventBus.js';
import { socketClient } from '../../networking/SocketClient.js';
import { soundManager } from '../audio/SoundManager.js';
import { InputManager } from '../input/InputManager.js';
import type { PlayerInput } from '@lss/shared';

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
  graphics: Phaser.GameObjects.Container;
  shield: Phaser.GameObjects.Arc;
  healthBar: Phaser.GameObjects.Graphics;
  nameText: Phaser.GameObjects.Text;
  thruster: Phaser.GameObjects.Particles.ParticleEmitter;
}

interface InterpolatedProjectile {
  id: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  graphics: Phaser.GameObjects.Ellipse;
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

  constructor() {
    super({ key: 'ArenaScene' });
  }

  init(data: { localPlayerId?: string }): void {
    this.localPlayerId = data.localPlayerId ?? null;
    this.inputManager = new InputManager();
  }

  create(): void {
    // Procedural particle texture for thrusters/explosions (no assets).
    if (!this.textures.exists('particle-dot')) {
      const dot = this.add.graphics();
      dot.fillStyle(0xffffff, 1);
      dot.fillCircle(4, 4, 4);
      dot.generateTexture('particle-dot', 8, 8);
      dot.destroy();
    }

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

  update(_time: number, delta: number): void {
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

    // Update camera
    this.updateCamera();
  }

  // ── Snapshot processing ───────────────────────────────────────────────────

  private processSnapshot(snapshot: GameSnapshot): void {
    const now = Date.now();

    // Update ships
    for (const player of snapshot.players) {
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
    // Remove dead projectiles
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
    const color = Phaser.Display.Color.HexStringToColor(
      SHIP_COLORS[player.colorIndex % SHIP_COLORS.length]!,
    ).color;

    // Ship hull: triangle pointing right (rotation 0 = facing +X)
    const hull = this.add.triangle(
      0,
      0,
      0, 0,
      SHIP_RADIUS * 1.4, 0,
      SHIP_RADIUS * 0.7, -SHIP_RADIUS * 0.9,
      color,
    );
    hull.setStrokeStyle(2, color, 1);
    hull.setFillStyle(color, 0.6);

    // Thruster particle emitter
    const thruster = this.add.particles(0, 0, 'particle-dot', {
      speed: { min: 50, max: 100 },
      angle: { min: 160, max: 200 },
      scale: { start: 0.4, end: 0 },
      lifespan: 300,
      frequency: 30,
      tint: color,
      blendMode: 'ADD',
    });
    thruster.setPosition(-SHIP_RADIUS * 0.8, 0);

    // Shield bubble
    const shield = this.add.circle(0, 0, SHIP_RADIUS * 1.3, color, 0.15);
    shield.setStrokeStyle(1, color, 0.5);
    shield.setVisible(false);

    // Health bar background
    const healthBarBg = this.add.rectangle(0, -SHIP_RADIUS - 15, 40, 4, 0x333333);
    const healthBar = this.add.graphics();

    // Name tag
    const nameText = this.add.text(0, -SHIP_RADIUS - 30, player.displayName, {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'monospace',
    });
    nameText.setOrigin(0.5, 0.5);

    // Container for all ship visuals
    const graphics = this.add.container(player.x, player.y, [
      thruster,
      hull,
      shield,
      healthBarBg,
      healthBar,
      nameText,
    ]);

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
      graphics,
      shield,
      healthBar,
      nameText,
      thruster,
    };

    // Highlight local player
    if (player.id === this.localPlayerId) {
      hull.setFillStyle(color, 0.9);
      nameText.setColor('#00ffff');
    }

    return ship;
  }

  private updateShipVisuals(ship: InterpolatedShip, player: PlayerState): void {
    // Update health bar
    const healthPercent = player.health / player.maxHealth;
    ship.healthBar.clear();
    const barWidth = 36;
    const barHeight = 4;
    const barX = -barWidth / 2;
    const barY = -SHIP_RADIUS - 15;
    ship.healthBar.fillStyle(healthPercent > 0.5 ? 0x00ff00 : healthPercent > 0.25 ? 0xffff00 : 0xff0000);
    ship.healthBar.fillRect(barX, barY, barWidth * healthPercent, barHeight);

    // Shield bubble
    ship.shield.setVisible(player.shield > 0 || Date.now() < player.spawnProtectedUntil);

    // Thruster intensity based on velocity
    const speed = Math.hypot(player.velocityX, player.velocityY);
    ship.thruster.frequency = speed > 10 ? 20 : 200;

    // Fade out dead ships
    if (!player.alive) {
      ship.graphics.setAlpha(0.3);
      ship.thruster.stop();
    }
  }

  // ── Projectile creation ───────────────────────────────────────────────────

  private createProjectile(proj: ProjectileState): InterpolatedProjectile {
    const isMeteor = proj.ownerId === 'cosmic:meteor';
    const colorHex = isMeteor ? NEON.meteor : NEON.projectile;
    const color = Phaser.Display.Color.HexStringToColor(colorHex).color;
    const radius = isMeteor ? 14 : 5;

    const graphics = this.add.ellipse(proj.x, proj.y, radius * 2, radius * 2, color);
    graphics.setStrokeStyle(1, color, 0.8);
    graphics.setFillStyle(color, 0.6);

    return {
      id: proj.id,
      x: proj.x,
      y: proj.y,
      targetX: proj.x,
      targetY: proj.y,
      graphics,
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
    for (const ship of this.ships.values()) ship.graphics.destroy();
    for (const proj of this.projectiles.values()) proj.graphics.destroy();
    for (const ast of this.asteroids.values()) ast.graphics.destroy();
    for (const pickup of this.pickups.values()) pickup.graphics.destroy();
    this.ships.clear();
    this.projectiles.clear();
    this.asteroids.clear();
    this.pickups.clear();
  }
}
