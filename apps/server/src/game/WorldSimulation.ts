import type {
  AsteroidState,
  CosmicEventState,
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
  SAFE_ZONE_INITIAL_RADIUS,
  SAFE_ZONE_STAGES,
  SHIELD_ABSORB,
  SHIP_ACCELERATION,
  SHIP_ASTEROID_CONTACT_DAMAGE,
  SHIP_DRAG,
  SHIP_MAX_HEALTH,
  SHIP_MAX_SPEED,
  SHIP_RADIUS,
  SPAWN_RING_RADIUS,
  SPAWN_SHIELD_MS,
  STORM_DAMAGE_PER_SECOND,
  TICK_INTERVAL_MS,
  UPGRADE_DURATIONS_MS,
  UPGRADE_TYPES,
} from '@lss/shared';
import { BotController, type BotView } from './BotController.js';
import { CosmicDirector } from './CosmicDirector.js';
import type { GameRoom, MatchSimulation, TypedServer } from '../rooms/GameRoom.js';

/** ownerId sentinel marking projectiles launched by a Meteor Shower. */
export const METEOR_OWNER_ID = 'cosmic:meteor';

const KILL_FEED_LIMIT = 8;
const ASTEROID_CONTACT_COOLDOWN_MS = 500;
const ASTEROID_BOUNCE_RESTITUTION = 0.8;
const METEOR_LIFETIME_MS = 8000;
const PROJECTILE_DESPAWN_MARGIN = 60;

// ── Host abstraction ─────────────────────────────────────────────────────────
// The simulation never touches Socket.IO directly, which keeps it fully
// headless-testable. `RoomSimulationHost` (bottom of file) adapts a live
// GameRoom + io pair; tests provide their own in-memory host.

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
}

export interface WorldSimulationOptions {
  /** When true, start() does not create a timer; callers drive step() manually. */
  manual?: boolean;
  /** Injectable RNG for deterministic simulations/tests. */
  rng?: () => number;
  /** Simulation clock origin (defaults to Date.now()). */
  startTimeMs?: number;
}

/** PlayerState plus server-only bookkeeping (never sent over the wire). */
export interface ShipState extends PlayerState {
  damageDealt: number;
  placement: number;
  eliminatedAt: number | null;
  lastShotAt: number;
  nextAsteroidDamageAt: number;
  bot: BotController | null;
  input: PlayerInput | null;
}

/**
 * Authoritative 25 Hz battle-royale world simulation. Fixed-step: every tick
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
    this.safeZone.nextShrinkAt = this.now + (SAFE_ZONE_STAGES[0]?.delayMs ?? 0);
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
    // 9. Disconnect culls + win/timeout resolution.
    this.cullDisconnectedShips();
    this.checkMatchEnd();

    const snapshot = this.buildSnapshot();
    this.host.emitSnapshot(snapshot);
    if (this.finished) this.stop();
    return snapshot;
  }

  // ── Spawning ─────────────────────────────────────────────────────────────

  private spawnShips(): void {
    const roster = this.host.listRoster();
    const angularOffset = this.rng() * Math.PI * 2;
    roster.forEach((entry, index) => {
      const angle = angularOffset + (index * Math.PI * 2) / roster.length;
      const ship: ShipState = {
        id: entry.id,
        displayName: entry.displayName,
        isBot: entry.isBot,
        colorIndex: entry.colorIndex,
        x: ARENA_CENTER_X + Math.cos(angle) * SPAWN_RING_RADIUS,
        y: ARENA_CENTER_Y + Math.sin(angle) * SPAWN_RING_RADIUS,
        // Face the arena center.
        rotation: angle + Math.PI,
        velocityX: 0,
        velocityY: 0,
        health: SHIP_MAX_HEALTH,
        maxHealth: SHIP_MAX_HEALTH,
        shield: 0,
        alive: true,
        kills: 0,
        upgrades: {},
        spawnProtectedUntil: this.now + SPAWN_SHIELD_MS,
        lastInputSequence: 0,
        damageDealt: 0,
        placement: 0,
        eliminatedAt: null,
        lastShotAt: -Infinity,
        nextAsteroidDamageAt: 0,
        bot: entry.isBot ? new BotController(this.rng) : null,
        input: null,
      };
      this.ships.set(ship.id, ship);
    });
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
      if (input) {
        const ax = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        const ay = (input.down ? 1 : 0) - (input.up ? 1 : 0);
        if (ax !== 0 || ay !== 0) {
          const len = Math.hypot(ax, ay);
          ship.velocityX += (ax / len) * SHIP_ACCELERATION * dt;
          ship.velocityY += (ay / len) * SHIP_ACCELERATION * dt;
        }
        if (Number.isFinite(input.aimAngle)) {
          ship.rotation = input.aimAngle;
        }
      }

      // Velocity damping + speed cap (ENERGY raises the cap).
      const dragFactor = Math.exp(-SHIP_DRAG * dt);
      ship.velocityX *= dragFactor;
      ship.velocityY *= dragFactor;
      const maxSpeed =
        ship.upgrades.ENERGY !== undefined
          ? SHIP_MAX_SPEED * ENERGY_SPEED_MULTIPLIER
          : SHIP_MAX_SPEED;
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
      if (this.projectiles.size >= MAX_PROJECTILES) return;
      ship.lastShotAt = this.now;

      const id = `proj-${++this.projectileSeq}`;
      const nose = SHIP_RADIUS + PROJECTILE_RADIUS + 4;
      this.projectiles.set(id, {
        id,
        ownerId: ship.id,
        x: ship.x + Math.cos(ship.rotation) * nose,
        y: ship.y + Math.sin(ship.rotation) * nose,
        velocityX: Math.cos(ship.rotation) * PROJECTILE_SPEED,
        velocityY: Math.sin(ship.rotation) * PROJECTILE_SPEED,
        damage: PROJECTILE_DAMAGE,
        expiresAt: this.now + PROJECTILE_LIFETIME_MS,
      });
    }
  }

  private updateProjectiles(dt: number): void {
    for (const projectile of [...this.projectiles.values()]) {
      projectile.x += projectile.velocityX * dt;
      projectile.y += projectile.velocityY * dt;

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

      // Projectile ↔ ship.
      let consumed = false;
      for (const ship of this.ships.values()) {
        if (!ship.alive || ship.id === projectile.ownerId) continue;
        if (this.now < ship.spawnProtectedUntil) continue;
        const hit = SHIP_RADIUS + radius;
        const dx = ship.x - projectile.x;
        const dy = ship.y - projectile.y;
        if (dx * dx + dy * dy > hit * hit) continue;

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

      // Projectile ↔ asteroid (meteors smash rocks too).
      for (const asteroid of this.asteroids.values()) {
        const hit = asteroid.radius + radius;
        const dx = asteroid.x - projectile.x;
        const dy = asteroid.y - projectile.y;
        if (dx * dx + dy * dy > hit * hit) continue;
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
    if (duration > 0) {
      ship.upgrades[type] = this.now + duration;
    }
  }

  private updateSafeZone(): void {
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

  /** Humans whose sockets dropped mid-match are eliminated by the void. */
  private cullDisconnectedShips(): void {
    for (const ship of this.ships.values()) {
      if (!ship.alive || ship.isBot) continue;
      if (!this.host.isConnected(ship.id)) {
        this.eliminate(ship, 'DISCONNECT', null);
      }
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
    // Placement = number of ships still alive (incl. this one) at death.
    ship.placement = this.aliveShips().length;
    ship.alive = false;
    ship.health = 0;
    ship.eliminatedAt = this.now;
    ship.input = null;
    ship.shield = 0;

    const killer = killerId ? this.ships.get(killerId) : undefined;
    if (killer && killer.alive && killer.id !== ship.id) {
      killer.kills += 1;
    }

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
    // Resolve the win condition immediately: the last ship standing at the
    // moment of this elimination wins, even if it would die later this tick.
    this.checkMatchEnd();
  }

  private checkMatchEnd(): void {
    if (this.finished) return;
    const alive = this.aliveShips();
    if (alive.length <= 1) {
      const winner = alive[0] ?? null;
      if (winner) winner.placement = 1;
      this.finish('LAST_SHIP_STANDING', winner?.id ?? null);
      return;
    }
    if (this.elapsedMs >= MATCH_TIMEOUT_MS) {
      // Timeout tiebreaker: kills → health → damage dealt.
      const ranked = [...alive].sort(
        (a, b) =>
          b.kills - a.kills || b.health - a.health || b.damageDealt - a.damageDealt,
      );
      ranked.forEach((ship, index) => {
        ship.placement = index + 1;
      });
      this.finish('TIMEOUT', ranked[0]?.id ?? null);
    }
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
        damageDealt: Math.round(ship.damageDealt),
        survivalTimeMs: (ship.eliminatedAt ?? this.now) - this.startedAt,
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
      upgrades: { ...ship.upgrades },
      spawnProtectedUntil: ship.spawnProtectedUntil,
      lastInputSequence: ship.lastInputSequence,
    };
  }

  private buildSnapshot(): GameSnapshot {
    const elapsed = this.elapsedMs;
    return {
      tick: this.tickCount,
      serverTime: this.now,
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
  constructor(
    private readonly room: GameRoom,
    private readonly io: TypedServer,
  ) {}

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
    return this.room.getPlayer(playerId)?.latestInput ?? null;
  }

  isConnected(playerId: string): boolean {
    return this.room.getPlayer(playerId)?.isConnected ?? false;
  }

  emitSnapshot(snapshot: GameSnapshot): void {
    this.io.to(this.room.code).emit('game:snapshot', snapshot);
  }

  emitElimination(entry: KillFeedEntry): void {
    this.io.to(this.room.code).emit('player:eliminated', entry);
  }

  emitCosmicEvent(event: CosmicEventState): void {
    this.io.to(this.room.code).emit('cosmic:event', event);
  }

  finishMatch(result: MatchResult): void {
    this.room.finishMatch(result);
  }
}

/** SimulationFactory used by RoomManager to attach a live match to a room. */
export function createWorldSimulation(room: GameRoom, io: TypedServer): WorldSimulation {
  return new WorldSimulation(new RoomSimulationHost(room, io));
}
