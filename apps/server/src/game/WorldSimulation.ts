import type {
  AsteroidState,
  ControllerState,
  CosmicEventState,
  HapticKind,
  EliminationCause,
  GameSnapshot,
  KillFeedEntry,
  MatchEndReason,
  MatchResult,
  PickupState,
  PlayerInput,
  PlayerMatchStats,
  PlayerState,
  ProjectileState,
  SafeZoneState,
  UpgradeType,
} from '@lss/shared';
import {
  ANALOG_DEADZONE,
  ANALOG_TURN_SPEED,
  ARENA_CENTER_X,
  ARENA_CENTER_Y,
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ASTEROID_BASE_HEALTH,
  ASTEROID_COUNT,
  ASTEROID_MAX_SPEED,
  ASTEROID_MIN_SPAWN_DISTANCE_FROM_SHIPS,
  ASTEROID_PICKUP_DROP_CHANCE,
  ASTEROID_RADIUS_MAX,
  ASTEROID_RADIUS_MIN,
  CONTROLLER_STATE_EVERY_TICKS,
  EMP_DAMAGE,
  EMP_RADIUS,
  ENERGY_SPEED_MULTIPLIER,
  FIRE_COOLDOWN_MS,
  MATCH_TIMEOUT_MS,
  MAX_PICKUPS,
  MAX_PROJECTILES,
  METEOR_DAMAGE,
  METEOR_RADIUS,
  METEOR_SPEED,
  PICKUP_LIFETIME_MS,
  PICKUP_RADIUS,
  PROJECTILE_DAMAGE,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_SPEED,
  RAPID_FIRE_COOLDOWN_MS,
  REPAIR_HEAL_AMOUNT,
  RESPAWN_DELAY_MS,
  RESPAWN_MIN_DISTANCE,
  SAFE_ZONE_INITIAL_RADIUS,
  SAFE_ZONE_SHRINKS,
  SAFE_ZONE_STAGES,
  SHIELD_ABSORB,
  SHIP_ACCELERATION,
  SHIP_ASTEROID_CONTACT_DAMAGE,
  SHIP_BOOST_ACCEL_MULTIPLIER,
  SHIP_BOOST_SPEED_MULTIPLIER,
  SHIP_DRAG,
  SHIP_DRIFT_DRAG,
  SHIP_MAX_HEALTH,
  SHIP_MAX_SPEED,
  SHIP_RADIUS,
  SHIP_RECOIL_IMPULSE,
  SHIP_REVERSE_SPEED_FACTOR,
  SHIP_TURN_SPEED,
  SPAWN_RING_RADIUS,
  SPAWN_SHIELD_MS,
  STORM_DAMAGE_PER_SECOND,
  TICK_INTERVAL_MS,
  UPGRADE_DURATIONS_MS,
  UPGRADE_TYPES,
} from '@lss/shared';
import { BotController, type BotView } from './BotController.js';
import { CosmicDirector } from './CosmicDirector.js';
import type { GameRoom, MatchSimulation } from '../rooms/GameRoom.js';

/** ownerId sentinel marking projectiles launched by a Meteor Shower. */
export const METEOR_OWNER_ID = 'cosmic:meteor';

const KILL_FEED_LIMIT = 8;
const ASTEROID_CONTACT_COOLDOWN_MS = 500;
const ASTEROID_BOUNCE_RESTITUTION = 0.8;
const METEOR_LIFETIME_MS = 8000;
const PROJECTILE_DESPAWN_MARGIN = 60;
const HIT_HAPTIC_COOLDOWN_MS = 250;

// ── Host abstraction ─────────────────────────────────────────────────────────
// The simulation never touches Socket.IO directly, which keeps it fully
// headless-testable. `RoomSimulationHost` (bottom of file) adapts a live
// GameRoom; tests provide their own in-memory host.

export interface SimulationRosterEntry {
  id: string;
  displayName: string;
  isBot: boolean;
  colorIndex: number;
}

export interface SimulationHost {
  readonly roomCode: string;
  listRoster(): SimulationRosterEntry[];
  getInput(playerId: string): PlayerInput | null;
  /** False when a human's socket has dropped mid-match. */
  isConnected(playerId: string): boolean;
  emitSnapshot(snapshot: GameSnapshot): void;
  emitElimination(entry: KillFeedEntry): void;
  emitCosmicEvent(event: CosmicEventState): void;
  finishMatch(result: MatchResult): void;
  /** Compact per-phone status (optional for headless hosts). */
  emitControllerState?(playerId: string, state: ControllerState): void;
  /** Vibration cue for one phone (optional for headless hosts). */
  emitHaptic?(playerId: string, kind: HapticKind): void;
}

export interface WorldSimulationOptions {
  /** When true, start() does not create a timer; callers drive step() manually. */
  manual?: boolean;
  /** Injectable RNG for deterministic simulations/tests. */
  rng?: () => number;
  /** Simulation clock origin (defaults to Date.now()). */
  startTimeMs?: number;
  /** Run the battle-royale shrinking ring (defaults to SAFE_ZONE_SHRINKS). */
  safeZoneShrinks?: boolean;
}

/** PlayerState plus server-only bookkeeping (never sent over the wire). */
export interface ShipState extends PlayerState {
  damageDealt: number;
  placement: number;
  lastShotAt: number;
  lastHitHapticAt: number;
  nextAsteroidDamageAt: number;
  bot: BotController | null;
  input: PlayerInput | null;
}

/**
 * Authoritative 25 Hz free-for-all world simulation: destroyed ships respawn
 * after RESPAWN_DELAY_MS and the most kills when the round timer ends wins. Fixed-step: every tick
 * advances the sim clock by exactly TICK_INTERVAL_MS so headless runs are
 * fully deterministic for a given RNG seed.
 */
export class WorldSimulation implements MatchSimulation {
  readonly ships = new Map<string, ShipState>();
  readonly projectiles = new Map<string, ProjectileState>();
  readonly asteroids = new Map<string, AsteroidState>();
  readonly pickups = new Map<string, PickupState>();
  readonly killFeed: KillFeedEntry[] = [];
  readonly safeZone: SafeZoneState = {
    centerX: ARENA_CENTER_X,
    centerY: ARENA_CENTER_Y,
    radius: SAFE_ZONE_INITIAL_RADIUS,
    targetRadius: SAFE_ZONE_INITIAL_RADIUS,
    stage: -1,
    isShrinking: false,
    nextShrinkAt: null,
  };

  private readonly host: SimulationHost;
  private readonly rng: () => number;
  private readonly manual: boolean;
  private readonly startTimeMs?: number;
  private readonly safeZoneShrinks: boolean;
  private readonly director: CosmicDirector;

  private timer: ReturnType<typeof setInterval> | null = null;
  private tickCount = 0;
  private now = 0;
  private startedAt = 0;
  private started = false;
  private finished = false;
  private shrinkFromRadius = SAFE_ZONE_INITIAL_RADIUS;
  private shrinkStartedAt = 0;
  private projectileSeq = 0;
  private asteroidSeq = 0;
  private pickupSeq = 0;
  private killSeq = 0;

  constructor(host: SimulationHost, options: WorldSimulationOptions = {}) {
    this.host = host;
    this.manual = options.manual ?? false;
    this.rng = options.rng ?? Math.random;
    this.startTimeMs = options.startTimeMs;
    this.safeZoneShrinks = options.safeZoneShrinks ?? SAFE_ZONE_SHRINKS;
    this.director = new CosmicDirector(this.rng);
  }

  get matchFinished(): boolean {
    return this.finished;
  }

  get elapsedMs(): number {
    return this.now - this.startedAt;
  }

  start(): GameSnapshot {
    if (this.started) return this.buildSnapshot();
    this.started = true;
    this.startedAt = this.startTimeMs ?? Date.now();
    this.now = this.startedAt;

    this.spawnShips();
    this.spawnAsteroids();
    this.safeZone.nextShrinkAt = this.safeZoneShrinks
      ? this.now + (SAFE_ZONE_STAGES[0]?.delayMs ?? 0)
      : null;
    this.director.arm(this.now);

    if (!this.manual) {
      this.timer = setInterval(() => {
        this.step();
      }, TICK_INTERVAL_MS);
    }
    return this.buildSnapshot();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Advance the world by exactly one 40 ms tick. Returns null when finished. */
  step(): GameSnapshot | null {
    if (!this.started || this.finished) return null;
    this.tickCount++;
    this.now += TICK_INTERVAL_MS;
    const dt = TICK_INTERVAL_MS / 1000;

    // 0. Late joiners, leavers, phone disconnects, and respawns.
    this.syncRoster();
    this.updateRespawns();
    // 1. AI Bot Pilot decisions.
    this.updateBotInputs();
    // 2. Movement, damping, boundary clamping, upgrade expiry.
    this.updateShips(dt);
    // 3. Weapon cooldowns + projectile spawning.
    this.updateWeapons();
    // 4. Projectile advance, expiry, ship/asteroid hit detection.
    this.updateProjectiles(dt);
    // 5. Asteroid drift + ship↔asteroid bounce + contact damage.
    this.updateAsteroids(dt);
    // 6. Pickup collection + expiry.
    this.updatePickups();
    // 7. Safe-zone shrink + storm damage.
    this.updateSafeZone();
    this.applyStormDamage(dt);
    // 8. AI Cosmic Director.
    this.director.update(this.now, {
      safeZone: this.safeZone,
      spawnMeteor: (x, y, dx, dy) => this.spawnMeteor(x, y, dx, dy),
      spawnPickup: (type, x, y) => this.spawnPickupAt(type, x, y),
      broadcast: (event) => this.host.emitCosmicEvent(event),
    });
    // 9. Round timer resolution.
    this.checkMatchEnd();

    const snapshot = this.buildSnapshot();
    this.host.emitSnapshot(snapshot);
    if (this.finished || this.tickCount % CONTROLLER_STATE_EVERY_TICKS === 0) {
      this.emitControllerStates();
    }
    if (this.finished) this.stop();
    return snapshot;
  }

  // ── Spawning ─────────────────────────────────────────────────────────────

  private spawnShips(): void {
    const roster = this.host.listRoster();
    const angularOffset = this.rng() * Math.PI * 2;
    roster.forEach((entry, index) => {
      const angle = angularOffset + (index * Math.PI * 2) / roster.length;
      const ship = this.createShip(entry);
      ship.x = ARENA_CENTER_X + Math.cos(angle) * SPAWN_RING_RADIUS;
      ship.y = ARENA_CENTER_Y + Math.sin(angle) * SPAWN_RING_RADIUS;
      // Face the arena center.
      ship.rotation = angle + Math.PI;
      this.ships.set(ship.id, ship);
    });
  }

  private createShip(entry: SimulationRosterEntry): ShipState {
    return {
      id: entry.id,
      displayName: entry.displayName,
      isBot: entry.isBot,
      colorIndex: entry.colorIndex,
      x: ARENA_CENTER_X,
      y: ARENA_CENTER_Y,
      rotation: 0,
      velocityX: 0,
      velocityY: 0,
      health: SHIP_MAX_HEALTH,
      maxHealth: SHIP_MAX_HEALTH,
      shield: 0,
      alive: true,
      kills: 0,
      deaths: 0,
      respawnAt: null,
      connected: entry.isBot || this.host.isConnected(entry.id),
      upgrades: {},
      spawnProtectedUntil: this.now + SPAWN_SHIELD_MS,
      lastInputSequence: 0,
      damageDealt: 0,
      placement: 0,
      lastShotAt: -Infinity,
      lastHitHapticAt: -Infinity,
      nextAsteroidDamageAt: 0,
      bot: entry.isBot ? new BotController(this.rng) : null,
      input: null,
    };
  }

  /** Picks a point inside the safe ring that is far from living ships. */
  private findSpawnPoint(): { x: number; y: number } {
    const others = this.aliveShips();
    const maxRadius = Math.max(0, this.safeZone.radius - SHIP_RADIUS * 4);
    let best = { x: this.safeZone.centerX, y: this.safeZone.centerY };
    let bestScore = -Infinity;
    for (let attempt = 0; attempt < 16; attempt++) {
      const angle = this.rng() * Math.PI * 2;
      const dist = Math.sqrt(this.rng()) * maxRadius;
      const x = Math.min(
        ARENA_WIDTH - SHIP_RADIUS * 3,
        Math.max(SHIP_RADIUS * 3, this.safeZone.centerX + Math.cos(angle) * dist),
      );
      const y = Math.min(
        ARENA_HEIGHT - SHIP_RADIUS * 3,
        Math.max(SHIP_RADIUS * 3, this.safeZone.centerY + Math.sin(angle) * dist),
      );
      const nearest = others.reduce(
        (min, s) => Math.min(min, Math.hypot(s.x - x, s.y - y)),
        Infinity,
      );
      if (nearest >= RESPAWN_MIN_DISTANCE) return { x, y };
      if (nearest > bestScore) {
        bestScore = nearest;
        best = { x, y };
      }
    }
    return best;
  }

  private respawn(ship: ShipState): void {
    const point = this.findSpawnPoint();
    ship.x = point.x;
    ship.y = point.y;
    ship.rotation = Math.atan2(this.safeZone.centerY - point.y, this.safeZone.centerX - point.x);
    ship.velocityX = 0;
    ship.velocityY = 0;
    ship.health = SHIP_MAX_HEALTH;
    ship.shield = 0;
    ship.upgrades = {};
    ship.alive = true;
    ship.respawnAt = null;
    ship.input = null;
    ship.spawnProtectedUntil = this.now + SPAWN_SHIELD_MS;
    if (!ship.isBot) this.host.emitHaptic?.(ship.id, 'respawn');
  }

  /**
   * Keeps ships in step with the room roster: phones that join mid-round get
   * a ship, leavers are removed, and disconnected phones park their ship
   * until they reconnect.
   */
  private syncRoster(): void {
    const roster = this.host.listRoster();
    const ids = new Set(roster.map((entry) => entry.id));
    for (const id of [...this.ships.keys()]) {
      if (!ids.has(id)) this.ships.delete(id);
    }
    for (const entry of roster) {
      let ship = this.ships.get(entry.id);
      if (!ship) {
        ship = this.createShip(entry);
        ship.alive = false;
        ship.respawnAt = this.now;
        this.ships.set(ship.id, ship);
      }
      if (ship.isBot) continue;
      ship.displayName = entry.displayName;
      const connected = this.host.isConnected(ship.id);
      if (connected === ship.connected) continue;
      ship.connected = connected;
      if (!connected) {
        ship.alive = false;
        ship.respawnAt = null;
        ship.input = null;
      } else if (!ship.alive) {
        ship.respawnAt = this.now;
      }
    }
  }

  private updateRespawns(): void {
    for (const ship of this.ships.values()) {
      if (ship.alive || ship.respawnAt === null || ship.respawnAt > this.now) continue;
      if (!ship.connected) continue;
      this.respawn(ship);
    }
  }

  private spawnAsteroids(): void {
    const ships = [...this.ships.values()];
    for (let i = 0; i < ASTEROID_COUNT; i++) {
      let x = ARENA_CENTER_X;
      let y = ARENA_CENTER_Y;
      for (let attempt = 0; attempt < 40; attempt++) {
        const cx = 120 + this.rng() * (ARENA_WIDTH - 240);
        const cy = 120 + this.rng() * (ARENA_HEIGHT - 240);
        const clear = ships.every(
          (s) =>
            Math.hypot(s.x - cx, s.y - cy) >=
            ASTEROID_MIN_SPAWN_DISTANCE_FROM_SHIPS,
        );
        if (clear) {
          x = cx;
          y = cy;
          break;
        }
      }
      const radius =
        ASTEROID_RADIUS_MIN +
        this.rng() * (ASTEROID_RADIUS_MAX - ASTEROID_RADIUS_MIN);
      const driftAngle = this.rng() * Math.PI * 2;
      const driftSpeed = this.rng() * ASTEROID_MAX_SPEED;
      // Bigger rocks are tankier: health scales with radius.
      const health = Math.round(
        ASTEROID_BASE_HEALTH * (radius / ASTEROID_RADIUS_MIN),
      );
      this.asteroids.set(`ast-${++this.asteroidSeq}`, {
        id: `ast-${this.asteroidSeq}`,
        x,
        y,
        radius,
        health,
        maxHealth: health,
        velocityX: Math.cos(driftAngle) * driftSpeed,
        velocityY: Math.sin(driftAngle) * driftSpeed,
        seed: Math.floor(this.rng() * 1_000_000),
      });
    }
  }

  private spawnMeteor(x: number, y: number, dirX: number, dirY: number): void {
    if (this.projectiles.size >= MAX_PROJECTILES) return;
    const id = `meteor-${++this.projectileSeq}`;
    this.projectiles.set(id, {
      id,
      ownerId: METEOR_OWNER_ID,
      x,
      y,
      velocityX: dirX * METEOR_SPEED,
      velocityY: dirY * METEOR_SPEED,
      damage: METEOR_DAMAGE,
      expiresAt: this.now + METEOR_LIFETIME_MS,
    });
  }

  private spawnPickupAt(type: UpgradeType, x: number, y: number): void {
    if (this.pickups.size >= MAX_PICKUPS) return;
    const id = `pick-${++this.pickupSeq}`;
    this.pickups.set(id, {
      id,
      type,
      x,
      y,
      expiresAt: this.now + PICKUP_LIFETIME_MS,
    });
  }

  // ── Tick stages ──────────────────────────────────────────────────────────

  private updateBotInputs(): void {
    const view: BotView = {
      now: this.now,
      ships: [...this.ships.values()],
      asteroids: [...this.asteroids.values()],
      pickups: [...this.pickups.values()],
      safeZone: this.safeZone,
    };
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      if (ship.bot) {
        ship.input = ship.bot.decide(ship, view);
        ship.lastInputSequence = ship.input.sequence;
      } else {
        const input = this.host.getInput(ship.id);
        ship.input = input;
        if (input && input.sequence > ship.lastInputSequence) {
          ship.lastInputSequence = input.sequence;
        }
      }
    }
  }

  private updateShips(dt: number): void {
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;

      // Expire timed upgrades; the SHIELD pool vanishes with its timer.
      for (const key of Object.keys(ship.upgrades) as UpgradeType[]) {
        const expiresAt = ship.upgrades[key];
        if (expiresAt !== undefined && expiresAt <= this.now) {
          delete ship.upgrades[key];
          if (key === 'SHIELD') ship.shield = 0;
        }
      }

      const input = ship.input;
      const isBoosting = Boolean(input?.boost);
      const accelMultiplier = isBoosting ? SHIP_BOOST_ACCEL_MULTIPLIER : 1;
      if (input) {
        if (ship.isBot) {
          if (Number.isFinite(input.aimAngle)) {
            ship.rotation = input.aimAngle;
          }
          const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          const ay = (input.down ? 1 : 0) - (input.up ? 1 : 0);
          if (ax !== 0 || ay !== 0) {
            const len = Math.hypot(ax, ay);
            ship.velocityX += (ax / len) * (SHIP_ACCELERATION * accelMultiplier) * dt;
            ship.velocityY += (ay / len) * (SHIP_ACCELERATION * accelMultiplier) * dt;
          }
        } else if (input.moveX !== undefined && input.moveY !== undefined) {
          // Phone stick/tilt: steer the nose toward the stick, thrust by deflection.
          const magnitude = Math.min(1, Math.hypot(input.moveX, input.moveY));
          if (magnitude > ANALOG_DEADZONE) {
            const target = Math.atan2(input.moveY, input.moveX);
            let diff = target - ship.rotation;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            const maxTurn = ANALOG_TURN_SPEED * dt;
            ship.rotation += Math.max(-maxTurn, Math.min(maxTurn, diff));
            const throttle =
              ((magnitude - ANALOG_DEADZONE) / (1 - ANALOG_DEADZONE)) * accelMultiplier;
            ship.velocityX += Math.cos(target) * SHIP_ACCELERATION * throttle * dt;
            ship.velocityY += Math.sin(target) * SHIP_ACCELERATION * throttle * dt;
          }
        } else {
          // Boolean fallback: left/right steers, up/down fires forward/reverse thrusters
          const turn = (input.right ? 1 : 0) - (input.left ? 1 : 0);
          if (turn !== 0) {
            ship.rotation += turn * SHIP_TURN_SPEED * dt;
          } else if (Number.isFinite(input.aimAngle)) {
            ship.rotation = input.aimAngle;
          }

          const forward = input.up ? 1 : 0;
          const reverse = input.down ? 1 : 0;
          if (forward > 0) {
            const fx = Math.cos(ship.rotation);
            const fy = Math.sin(ship.rotation);
            ship.velocityX += fx * (SHIP_ACCELERATION * accelMultiplier) * dt;
            ship.velocityY += fy * (SHIP_ACCELERATION * accelMultiplier) * dt;
          }
          if (reverse > 0) {
            const fx = Math.cos(ship.rotation);
            const fy = Math.sin(ship.rotation);
            const revAccel = SHIP_ACCELERATION * SHIP_REVERSE_SPEED_FACTOR;
            ship.velocityX -= fx * revAccel * dt;
            ship.velocityY -= fy * revAccel * dt;
          }
        }
      }

      // Velocity damping + speed cap (drift mode reduces damping for Newtonian space drift).
      const currentDrag = input?.drift ? SHIP_DRIFT_DRAG : SHIP_DRAG;
      const dragFactor = Math.exp(-currentDrag * dt);
      ship.velocityX *= dragFactor;
      ship.velocityY *= dragFactor;
      let maxSpeed =
        ship.upgrades.ENERGY !== undefined
          ? SHIP_MAX_SPEED * ENERGY_SPEED_MULTIPLIER
          : SHIP_MAX_SPEED;
      if (isBoosting) {
        maxSpeed *= SHIP_BOOST_SPEED_MULTIPLIER;
      }
      const speed = Math.hypot(ship.velocityX, ship.velocityY);
      if (speed > maxSpeed) {
        ship.velocityX = (ship.velocityX / speed) * maxSpeed;
        ship.velocityY = (ship.velocityY / speed) * maxSpeed;
      }

      ship.x += ship.velocityX * dt;
      ship.y += ship.velocityY * dt;

      if (ship.x < SHIP_RADIUS) {
        ship.x = SHIP_RADIUS;
        ship.velocityX = 0;
      } else if (ship.x > ARENA_WIDTH - SHIP_RADIUS) {
        ship.x = ARENA_WIDTH - SHIP_RADIUS;
        ship.velocityX = 0;
      }
      if (ship.y < SHIP_RADIUS) {
        ship.y = SHIP_RADIUS;
        ship.velocityY = 0;
      } else if (ship.y > ARENA_HEIGHT - SHIP_RADIUS) {
        ship.y = ARENA_HEIGHT - SHIP_RADIUS;
        ship.velocityY = 0;
      }
    }
  }

  private updateWeapons(): void {
    for (const ship of this.ships.values()) {
      if (!ship.alive || !ship.input?.shooting) continue;
      const cooldown =
        ship.upgrades.RAPID_FIRE !== undefined
          ? RAPID_FIRE_COOLDOWN_MS
          : FIRE_COOLDOWN_MS;
      if (this.now - ship.lastShotAt < cooldown) continue;
      if (this.projectiles.size >= MAX_PROJECTILES - 1) return;
      ship.lastShotAt = this.now;

      const cos = Math.cos(ship.rotation);
      const sin = Math.sin(ship.rotation);
      // Dual wing laser blasters (left: local x=10, y=-13; right: local x=10, y=+13)
      const forwardOffset = 10;
      const wingOffset = 13;

      // Left wing blaster cannon
      const id1 = `proj-${++this.projectileSeq}`;
      const leftX = ship.x + cos * forwardOffset + sin * wingOffset;
      const leftY = ship.y + sin * forwardOffset - cos * wingOffset;
      this.projectiles.set(id1, {
        id: id1,
        ownerId: ship.id,
        x: leftX,
        y: leftY,
        velocityX: cos * PROJECTILE_SPEED,
        velocityY: sin * PROJECTILE_SPEED,
        damage: Math.round(PROJECTILE_DAMAGE * 0.6), // 12 damage each (24 per dual salvo)
        expiresAt: this.now + PROJECTILE_LIFETIME_MS,
      });

      // Right wing blaster cannon
      const id2 = `proj-${++this.projectileSeq}`;
      const rightX = ship.x + cos * forwardOffset - sin * wingOffset;
      const rightY = ship.y + sin * forwardOffset + cos * wingOffset;
      this.projectiles.set(id2, {
        id: id2,
        ownerId: ship.id,
        x: rightX,
        y: rightY,
        velocityX: cos * PROJECTILE_SPEED,
        velocityY: sin * PROJECTILE_SPEED,
        damage: Math.round(PROJECTILE_DAMAGE * 0.6), // 12 damage each (24 per dual salvo)
        expiresAt: this.now + PROJECTILE_LIFETIME_MS,
      });

      // Special Power: TRIPLE_SHOT spread salvo (3 additional spread bolts)
      if (ship.upgrades.TRIPLE_SHOT !== undefined && this.projectiles.size <= MAX_PROJECTILES - 3) {
        const spreadAngle = 0.22; // ~13 degrees
        // Angled left bolt
        const id3 = `proj-${++this.projectileSeq}`;
        const cosL = Math.cos(ship.rotation - spreadAngle);
        const sinL = Math.sin(ship.rotation - spreadAngle);
        this.projectiles.set(id3, {
          id: id3,
          ownerId: ship.id,
          x: leftX,
          y: leftY,
          velocityX: cosL * PROJECTILE_SPEED,
          velocityY: sinL * PROJECTILE_SPEED,
          damage: Math.round(PROJECTILE_DAMAGE * 0.5),
          expiresAt: this.now + PROJECTILE_LIFETIME_MS,
        });

        // Angled right bolt
        const id4 = `proj-${++this.projectileSeq}`;
        const cosR = Math.cos(ship.rotation + spreadAngle);
        const sinR = Math.sin(ship.rotation + spreadAngle);
        this.projectiles.set(id4, {
          id: id4,
          ownerId: ship.id,
          x: rightX,
          y: rightY,
          velocityX: cosR * PROJECTILE_SPEED,
          velocityY: sinR * PROJECTILE_SPEED,
          damage: Math.round(PROJECTILE_DAMAGE * 0.5),
          expiresAt: this.now + PROJECTILE_LIFETIME_MS,
        });

        // Nose centerline bolt
        const id5 = `proj-${++this.projectileSeq}`;
        this.projectiles.set(id5, {
          id: id5,
          ownerId: ship.id,
          x: ship.x + cos * 20,
          y: ship.y + sin * 20,
          velocityX: cos * (PROJECTILE_SPEED * 1.05),
          velocityY: sin * (PROJECTILE_SPEED * 1.05),
          damage: Math.round(PROJECTILE_DAMAGE * 0.7),
          expiresAt: this.now + PROJECTILE_LIFETIME_MS,
        });
      }

      // Space physics: Newton's 3rd Law reactive weapon recoil
      ship.velocityX -= cos * SHIP_RECOIL_IMPULSE;
      ship.velocityY -= sin * SHIP_RECOIL_IMPULSE;
    }
  }

  private distToSegmentSq(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): number {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return (px - x1) * (px - x1) + (py - y1) * (py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * (x2 - x1);
    const projY = y1 + t * (y2 - y1);
    return (px - projX) * (px - projX) + (py - projY) * (py - projY);
  }

  private updateProjectiles(dt: number): void {
    for (const projectile of [...this.projectiles.values()]) {
      const prevX = projectile.x;
      const prevY = projectile.y;
      projectile.x += projectile.velocityX * dt;
      projectile.y += projectile.velocityY * dt;
      const currX = projectile.x;
      const currY = projectile.y;

      if (
        this.now >= projectile.expiresAt ||
        projectile.x < -PROJECTILE_DESPAWN_MARGIN ||
        projectile.x > ARENA_WIDTH + PROJECTILE_DESPAWN_MARGIN ||
        projectile.y < -PROJECTILE_DESPAWN_MARGIN ||
        projectile.y > ARENA_HEIGHT + PROJECTILE_DESPAWN_MARGIN
      ) {
        this.projectiles.delete(projectile.id);
        continue;
      }

      const isMeteor = projectile.ownerId === METEOR_OWNER_ID;
      const radius = isMeteor ? METEOR_RADIUS : PROJECTILE_RADIUS;

      // Projectile ↔ ship (precision dual-circle capsule swept collision detection).
      let consumed = false;
      for (const ship of this.ships.values()) {
        if (!ship.alive || ship.id === projectile.ownerId) continue;
        if (this.now < ship.spawnProtectedUntil) continue;

        const cos = Math.cos(ship.rotation);
        const sin = Math.sin(ship.rotation);

        // Projectile ↔ ship (precision 3-circle swept capsule matching visual dart hull).
        const noseX = ship.x + cos * 12;
        const noseY = ship.y + sin * 12;
        const noseHit = 6.5 + radius;
        const hitNose = this.distToSegmentSq(noseX, noseY, prevX, prevY, currX, currY) <= noseHit * noseHit;

        const midX = ship.x + cos * 1;
        const midY = ship.y + sin * 1;
        const midHit = 9.5 + radius;
        const hitMid = this.distToSegmentSq(midX, midY, prevX, prevY, currX, currY) <= midHit * midHit;

        const aftX = ship.x - cos * 8;
        const aftY = ship.y - sin * 8;
        const aftHit = 12.5 + radius;
        const hitAft = this.distToSegmentSq(aftX, aftY, prevX, prevY, currX, currY) <= aftHit * aftHit;

        if (!hitNose && !hitMid && !hitAft) continue;

        const cause: EliminationCause = isMeteor ? 'METEOR' : 'PROJECTILE';
        this.applyDamage(ship, projectile.damage, {
          shieldAbsorbs: true,
          attackerId: isMeteor ? null : projectile.ownerId,
          cause,
        });
        consumed = true;
        break;
      }
      if (consumed) {
        this.projectiles.delete(projectile.id);
        continue;
      }

      // Projectile ↔ asteroid (continuous swept-segment collision detection).
      for (const asteroid of this.asteroids.values()) {
        const hit = asteroid.radius * 0.88 + radius;
        const dSq = this.distToSegmentSq(asteroid.x, asteroid.y, prevX, prevY, currX, currY);
        if (dSq > hit * hit) continue;
        asteroid.health -= projectile.damage;
        consumed = true;
        if (asteroid.health <= 0) this.destroyAsteroid(asteroid);
        break;
      }
      if (consumed) this.projectiles.delete(projectile.id);
    }
  }

  private updateAsteroids(dt: number): void {
    for (const asteroid of this.asteroids.values()) {
      asteroid.x += asteroid.velocityX * dt;
      asteroid.y += asteroid.velocityY * dt;

      // Drift bounce off the arena walls.
      if (asteroid.x < asteroid.radius) {
        asteroid.x = asteroid.radius;
        asteroid.velocityX = Math.abs(asteroid.velocityX);
      } else if (asteroid.x > ARENA_WIDTH - asteroid.radius) {
        asteroid.x = ARENA_WIDTH - asteroid.radius;
        asteroid.velocityX = -Math.abs(asteroid.velocityX);
      }
      if (asteroid.y < asteroid.radius) {
        asteroid.y = asteroid.radius;
        asteroid.velocityY = Math.abs(asteroid.velocityY);
      } else if (asteroid.y > ARENA_HEIGHT - asteroid.radius) {
        asteroid.y = ARENA_HEIGHT - asteroid.radius;
        asteroid.velocityY = -Math.abs(asteroid.velocityY);
      }

      // Ship ↔ asteroid elastic bounce + hull contact damage.
      for (const ship of this.ships.values()) {
        if (!ship.alive) continue;
        const dx = ship.x - asteroid.x;
        const dy = ship.y - asteroid.y;
        const minDist = SHIP_RADIUS + asteroid.radius;
        const dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;

        const nx = dist > 0 ? dx / dist : 1;
        const ny = dist > 0 ? dy / dist : 0;
        // Separate the ship and reflect its inbound velocity component.
        ship.x = asteroid.x + nx * minDist;
        ship.y = asteroid.y + ny * minDist;
        const vn = ship.velocityX * nx + ship.velocityY * ny;
        if (vn < 0) {
          ship.velocityX -= (1 + ASTEROID_BOUNCE_RESTITUTION) * vn * nx;
          ship.velocityY -= (1 + ASTEROID_BOUNCE_RESTITUTION) * vn * ny;
        }
        if (
          this.now >= ship.spawnProtectedUntil &&
          this.now >= ship.nextAsteroidDamageAt
        ) {
          ship.nextAsteroidDamageAt = this.now + ASTEROID_CONTACT_COOLDOWN_MS;
          this.applyDamage(ship, SHIP_ASTEROID_CONTACT_DAMAGE, {
            shieldAbsorbs: true,
            attackerId: null,
            cause: 'ASTEROID',
          });
        }
      }
    }
  }

  private destroyAsteroid(asteroid: AsteroidState): void {
    this.asteroids.delete(asteroid.id);

    // Space physics: large asteroid fragmentation into smaller tumbling shards
    if (asteroid.radius >= 40 && this.asteroids.size < 28) {
      const splitAngle = this.rng() * Math.PI * 2;
      const fragRadius = Math.round(asteroid.radius * 0.52);
      const fragSpeed = 35;
      for (const dir of [1, -1]) {
        const id = `ast-frag-${++this.asteroidSeq}`;
        this.asteroids.set(id, {
          id,
          x: asteroid.x + Math.cos(splitAngle) * (fragRadius * dir),
          y: asteroid.y + Math.sin(splitAngle) * (fragRadius * dir),
          radius: fragRadius,
          health: 20,
          maxHealth: 20,
          velocityX: asteroid.velocityX + Math.cos(splitAngle + (dir * Math.PI) / 2) * fragSpeed,
          velocityY: asteroid.velocityY + Math.sin(splitAngle + (dir * Math.PI) / 2) * fragSpeed,
          seed: Math.floor(this.rng() * 10000),
        });
      }
    }

    if (this.rng() < ASTEROID_PICKUP_DROP_CHANCE) {
      const type =
        UPGRADE_TYPES[Math.floor(this.rng() * UPGRADE_TYPES.length)]!;
      this.spawnPickupAt(type, asteroid.x, asteroid.y);
    }
  }

  private updatePickups(): void {
    for (const pickup of [...this.pickups.values()]) {
      if (this.now >= pickup.expiresAt) {
        this.pickups.delete(pickup.id);
        continue;
      }
      for (const ship of this.ships.values()) {
        if (!ship.alive) continue;
        const dx = ship.x - pickup.x;
        const dy = ship.y - pickup.y;
        const hit = SHIP_RADIUS + PICKUP_RADIUS;
        if (dx * dx + dy * dy > hit * hit) continue;
        this.applyUpgrade(ship, pickup.type);
        this.pickups.delete(pickup.id);
        break;
      }
    }
  }

  private applyUpgrade(ship: ShipState, type: UpgradeType): void {
    const duration = UPGRADE_DURATIONS_MS[type];
    if (type === 'REPAIR') {
      ship.health = Math.min(ship.maxHealth, ship.health + REPAIR_HEAL_AMOUNT);
      return;
    }
    if (type === 'SHIELD') {
      ship.shield = SHIELD_ABSORB;
    }
    if (type === 'EMP_BLAST') {
      this.triggerEmpBlast(ship);
      return;
    }
    if (duration > 0) {
      ship.upgrades[type] = this.now + duration;
    }
  }

  private triggerEmpBlast(sourceShip: ShipState): void {
    // 1. Vaporize all enemy projectiles in flight within EMP_RADIUS
    for (const [id, proj] of this.projectiles) {
      if (proj.ownerId === sourceShip.id) continue;
      const d = Math.hypot(proj.x - sourceShip.x, proj.y - sourceShip.y);
      if (d <= EMP_RADIUS) {
        this.projectiles.delete(id);
      }
    }

    // 2. Knock back and damage all other ships within EMP_RADIUS
    for (const ship of this.ships.values()) {
      if (!ship.alive || ship.id === sourceShip.id) continue;
      const dx = ship.x - sourceShip.x;
      const dy = ship.y - sourceShip.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist <= EMP_RADIUS) {
        const pushFactor = 1 - dist / EMP_RADIUS;
        const pushForce = 420 * pushFactor;
        ship.velocityX += (dx / dist) * pushForce;
        ship.velocityY += (dy / dist) * pushForce;
        this.applyDamage(ship, EMP_DAMAGE, {
          shieldAbsorbs: true,
          attackerId: sourceShip.id,
          cause: 'EMP',
        });
      }
    }

    // 3. Shatter nearby asteroids
    for (const asteroid of this.asteroids.values()) {
      const dist = Math.hypot(asteroid.x - sourceShip.x, asteroid.y - sourceShip.y);
      if (dist <= EMP_RADIUS) {
        asteroid.health -= EMP_DAMAGE;
        if (asteroid.health <= 0) {
          this.destroyAsteroid(asteroid);
        }
      }
    }
  }

  private updateSafeZone(): void {
    if (!this.safeZoneShrinks) return;
    const zone = this.safeZone;
    if (!zone.isShrinking) {
      if (zone.nextShrinkAt !== null && this.now >= zone.nextShrinkAt) {
        const nextStage = SAFE_ZONE_STAGES[zone.stage + 1];
        if (!nextStage) {
          zone.nextShrinkAt = null;
          return;
        }
        zone.stage += 1;
        zone.isShrinking = true;
        zone.targetRadius = nextStage.targetRadius;
        this.shrinkFromRadius = zone.radius;
        this.shrinkStartedAt = this.now;
      }
      return;
    }

    const stage = SAFE_ZONE_STAGES[zone.stage];
    if (!stage) {
      zone.isShrinking = false;
      return;
    }
    const t = (this.now - this.shrinkStartedAt) / stage.shrinkMs;
    if (t >= 1) {
      zone.radius = stage.targetRadius;
      zone.isShrinking = false;
      const next = SAFE_ZONE_STAGES[zone.stage + 1];
      zone.nextShrinkAt = next ? this.now + next.delayMs : null;
    } else {
      zone.radius =
        this.shrinkFromRadius +
          (stage.targetRadius - this.shrinkFromRadius) * t;
    }
  }

  /** Storm burns hull directly — shields do not protect outside the ring. */
  private applyStormDamage(dt: number): void {
    const zone = this.safeZone;
    const dps = STORM_DAMAGE_PER_SECOND * this.director.stormDamageMultiplier;
    for (const ship of this.ships.values()) {
      if (!ship.alive) continue;
      const dist = Math.hypot(ship.x - zone.centerX, ship.y - zone.centerY);
      if (dist <= zone.radius) continue;
      this.applyDamage(ship, dps * dt, {
        shieldAbsorbs: false,
        attackerId: null,
        cause: 'STORM',
      });
    }
  }

  // ── Damage & elimination ─────────────────────────────────────────────────

  private applyDamage(
    ship: ShipState,
    amount: number,
    opts: {
      shieldAbsorbs: boolean;
      attackerId: string | null;
      cause: EliminationCause;
    },
  ): void {
    if (!ship.alive || this.finished || amount <= 0) return;

    let remaining = amount;
    if (opts.shieldAbsorbs && ship.shield > 0) {
      const absorbed = Math.min(ship.shield, remaining);
      ship.shield -= absorbed;
      remaining -= absorbed;
    }
    ship.health -= remaining;
    if (!ship.isBot && this.now - ship.lastHitHapticAt >= HIT_HAPTIC_COOLDOWN_MS) {
      ship.lastHitHapticAt = this.now;
      this.host.emitHaptic?.(ship.id, 'hit');
    }

    if (opts.attackerId) {
      const attacker = this.ships.get(opts.attackerId);
      if (attacker && attacker.id !== ship.id) {
        attacker.damageDealt += amount;
      }
    }

    if (ship.health <= 0) {
      this.eliminate(ship, opts.cause, opts.attackerId);
    }
  }

  private eliminate(
    ship: ShipState,
    cause: EliminationCause,
    killerId: string | null,
  ): void {
    if (!ship.alive || this.finished) return;
    ship.alive = false;
    ship.health = 0;
    ship.deaths += 1;
    ship.respawnAt = this.now + RESPAWN_DELAY_MS;
    ship.input = null;
    ship.shield = 0;
    ship.velocityX = 0;
    ship.velocityY = 0;

    const killer = killerId ? this.ships.get(killerId) : undefined;
    if (killer && killer.id !== ship.id) {
      killer.kills += 1;
      if (!killer.isBot) this.host.emitHaptic?.(killer.id, 'kill');
    }
    if (!ship.isBot) this.host.emitHaptic?.(ship.id, 'killed');

    const entry: KillFeedEntry = {
      id: `kill-${++this.killSeq}`,
      killerId: killer?.id ?? null,
      killerName: killer?.displayName ?? null,
      victimId: ship.id,
      victimName: ship.displayName,
      cause,
      timestamp: this.now,
    };
    this.killFeed.push(entry);
    if (this.killFeed.length > KILL_FEED_LIMIT) this.killFeed.shift();
    this.host.emitElimination(entry);
  }

  /** Scoreboard order: kills, then fewest deaths, then damage dealt. */
  rankedShips(): ShipState[] {
    return [...this.ships.values()].sort(
      (a, b) =>
        b.kills - a.kills ||
        a.deaths - b.deaths ||
        b.damageDealt - a.damageDealt ||
        a.id.localeCompare(b.id),
    );
  }

  private checkMatchEnd(): void {
    if (this.finished || this.elapsedMs < MATCH_TIMEOUT_MS) return;
    const ranked = this.rankedShips();
    ranked.forEach((ship, index) => {
      ship.placement = index + 1;
    });
    this.finish('TIMEOUT', ranked[0]?.id ?? null);
  }

  private emitControllerStates(): void {
    if (!this.host.emitControllerState) return;
    const ranked = this.rankedShips();
    const timeRemainingMs = Math.max(0, MATCH_TIMEOUT_MS - this.elapsedMs);
    ranked.forEach((ship, index) => {
      if (ship.isBot) return;
      this.host.emitControllerState?.(ship.id, {
        status: this.finished ? 'FINISHED' : 'ACTIVE',
        alive: ship.alive,
        health: Math.max(0, Math.round(ship.health)),
        maxHealth: ship.maxHealth,
        shield: Math.round(ship.shield),
        kills: ship.kills,
        deaths: ship.deaths,
        rank: index + 1,
        totalPlayers: ranked.length,
        respawnAt: ship.respawnAt,
        upgrades: { ...ship.upgrades },
        timeRemainingMs,
        serverTime: this.now,
      });
    });
  }

  private finish(endReason: MatchEndReason, winnerId: string | null): void {
    if (this.finished) return;
    this.finished = true;
    const stats: PlayerMatchStats[] = [...this.ships.values()]
      .map((ship) => ({
        playerId: ship.id,
        displayName: ship.displayName,
        isBot: ship.isBot,
        colorIndex: ship.colorIndex,
        placement: ship.placement,
        kills: ship.kills,
        deaths: ship.deaths,
        damageDealt: Math.round(ship.damageDealt),
        survivalTimeMs: this.now - this.startedAt,
      }))
      .sort((a, b) => a.placement - b.placement || a.playerId.localeCompare(b.playerId));
    const winner = winnerId ? this.ships.get(winnerId) : undefined;
    this.host.finishMatch({
      roomCode: this.host.roomCode,
      winnerPlayerId: winner?.id ?? null,
      winnerName: winner?.displayName ?? null,
      endReason,
      durationMs: this.elapsedMs,
      stats,
    });
  }

  // ── Snapshot ─────────────────────────────────────────────────────────────

  private aliveShips(): ShipState[] {
    return [...this.ships.values()].filter((s) => s.alive);
  }

  private toPlayerState(ship: ShipState): PlayerState {
    return {
      id: ship.id,
      displayName: ship.displayName,
      isBot: ship.isBot,
      colorIndex: ship.colorIndex,
      x: ship.x,
      y: ship.y,
      rotation: ship.rotation,
      velocityX: ship.velocityX,
      velocityY: ship.velocityY,
      health: ship.health,
      maxHealth: ship.maxHealth,
      shield: ship.shield,
      alive: ship.alive,
      kills: ship.kills,
      deaths: ship.deaths,
      respawnAt: ship.respawnAt,
      connected: ship.connected,
      upgrades: { ...ship.upgrades },
      spawnProtectedUntil: ship.spawnProtectedUntil,
      lastInputSequence: ship.lastInputSequence,
    };
  }

  private buildSnapshot(): GameSnapshot {
    const elapsed = this.elapsedMs;
    return {
      tick: this.tickCount,
      serverTime: Date.now(),
      status: this.finished ? 'FINISHED' : 'ACTIVE',
      matchElapsedMs: elapsed,
      timeRemainingMs: Math.max(0, MATCH_TIMEOUT_MS - elapsed),
      aliveCount: this.aliveShips().length,
      players: [...this.ships.values()].map((s) => this.toPlayerState(s)),
      projectiles: [...this.projectiles.values()],
      asteroids: [...this.asteroids.values()],
      pickups: [...this.pickups.values()],
      safeZone: { ...this.safeZone },
      cosmicEvent: this.director.currentEvent,
      killFeed: [...this.killFeed],
    };
  }
}

// ── Live-room adapter ────────────────────────────────────────────────────────

class RoomSimulationHost implements SimulationHost {
  constructor(private readonly room: GameRoom) {}

  get roomCode(): string {
    return this.room.code;
  }

  listRoster(): SimulationRosterEntry[] {
    return this.room.playerList.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isBot: p.isBot,
      colorIndex: p.colorIndex,
    }));
  }

  getInput(playerId: string): PlayerInput | null {
    return this.room.getFreshInput(playerId);
  }

  isConnected(playerId: string): boolean {
    return this.room.getPlayer(playerId)?.isConnected ?? false;
  }

  emitSnapshot(snapshot: GameSnapshot): void {
    this.room.emitToHost('game:snapshot', snapshot);
  }

  emitElimination(entry: KillFeedEntry): void {
    this.room.emitToHost('player:eliminated', entry);
  }

  emitCosmicEvent(event: CosmicEventState): void {
    this.room.emitToHost('cosmic:event', event);
  }

  emitControllerState(playerId: string, state: ControllerState): void {
    this.room.emitToPlayer(playerId, 'controller:state', state);
  }

  emitHaptic(playerId: string, kind: HapticKind): void {
    this.room.emitToPlayer(playerId, 'controller:haptic', { kind });
  }

  finishMatch(result: MatchResult): void {
    this.room.finishMatch(result);
  }
}

/** SimulationFactory used by RoomManager to attach a live match to a room. */
export function createWorldSimulation(room: GameRoom): WorldSimulation {
  return new WorldSimulation(new RoomSimulationHost(room));
}
