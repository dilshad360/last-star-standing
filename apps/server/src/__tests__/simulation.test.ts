import { describe, expect, it } from 'vitest';
import type {
  ControllerState,
  CosmicEventState,
  HapticKind,
  GameSnapshot,
  KillFeedEntry,
  MatchResult,
  PlayerInput,
  UpgradeType,
} from '@lss/shared';
import {
  ARENA_CENTER_X,
  ARENA_CENTER_Y,
  COSMIC_DIRECTOR_FIRST_EVENT_MS,
  COSMIC_EVENT_WARNING_MS,
  FIRE_COOLDOWN_MS,
  MATCH_TIMEOUT_MS,
  PICKUP_RADIUS,
  PROJECTILE_DAMAGE,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_SPEED,
  REPAIR_HEAL_AMOUNT,
  RESPAWN_DELAY_MS,
  SAFE_ZONE_INITIAL_RADIUS,
  SAFE_ZONE_STAGES,
  SHIELD_ABSORB,
  SHIP_MAX_HEALTH,
  SHIP_RADIUS,
  SPAWN_SHIELD_MS,
  STORM_DAMAGE_PER_SECOND,
  TICK_INTERVAL_MS,
  UPGRADE_DURATIONS_MS,
} from '@lss/shared';
import {
  WorldSimulation,
  type ShipState,
  type SimulationHost,
  type SimulationRosterEntry,
} from '../game/WorldSimulation.js';

// ── Deterministic RNG (mulberry32) ───────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BOT_NAMES = ['Vega', 'Orion', 'Lyra', 'Rigel', 'Altair', 'Sirius', 'Castor', 'Mira'];

function botRoster(count: number): SimulationRosterEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bot-test-${i}`,
    displayName: `${BOT_NAMES[i % BOT_NAMES.length]} [AI]`,
    isBot: true,
    colorIndex: i,
  }));
}

function humanRoster(count: number): SimulationRosterEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `human-${i}`,
    displayName: `Human ${i}`,
    isBot: false,
    colorIndex: i,
  }));
}

class TestHost implements SimulationHost {
  readonly roomCode = 'TEST';
  readonly snapshots: GameSnapshot[] = [];
  readonly eliminations: KillFeedEntry[] = [];
  readonly cosmicEvents: CosmicEventState[] = [];
  readonly inputs = new Map<string, PlayerInput>();
  readonly connected = new Map<string, boolean>();
  readonly controllerStates = new Map<string, ControllerState>();
  readonly haptics: Array<{ playerId: string; kind: HapticKind }> = [];
  result: MatchResult | null = null;

  constructor(readonly roster: SimulationRosterEntry[]) {
    for (const entry of roster) this.connected.set(entry.id, true);
  }

  listRoster(): SimulationRosterEntry[] {
    return this.roster;
  }
  getInput(playerId: string): PlayerInput | null {
    return this.inputs.get(playerId) ?? null;
  }
  isConnected(playerId: string): boolean {
    return this.connected.get(playerId) ?? false;
  }
  emitSnapshot(snapshot: GameSnapshot): void {
    this.snapshots.push(snapshot);
  }
  emitElimination(entry: KillFeedEntry): void {
    this.eliminations.push(entry);
  }
  emitCosmicEvent(event: CosmicEventState): void {
    this.cosmicEvents.push(event);
  }
  finishMatch(result: MatchResult): void {
    this.result = result;
  }
  emitControllerState(playerId: string, state: ControllerState): void {
    this.controllerStates.set(playerId, state);
  }
  emitHaptic(playerId: string, kind: HapticKind): void {
    this.haptics.push({ playerId, kind });
  }
}

const START_TIME = 1_000_000;
const MAX_TICKS = Math.ceil((MATCH_TIMEOUT_MS * 1.2) / TICK_INTERVAL_MS);

function createSim(
  roster: SimulationRosterEntry[],
  seed = 42,
  options: { safeZoneShrinks?: boolean } = {},
): { sim: WorldSimulation; host: TestHost } {
  const host = new TestHost(roster);
  const sim = new WorldSimulation(host, {
    manual: true,
    rng: mulberry32(seed),
    startTimeMs: START_TIME,
    ...options,
  });
  sim.start();
  return { sim, host };
}

function input(partial: Partial<PlayerInput> = {}): PlayerInput {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    aimAngle: 0,
    shooting: false,
    sequence: 1,
    ...partial,
  };
}

function ship(sim: WorldSimulation, id: string): ShipState {
  const s = sim.ships.get(id);
  if (!s) throw new Error(`No ship ${id}`);
  return s;
}

function runUntilFinished(sim: WorldSimulation): void {
  let ticks = 0;
  while (!sim.matchFinished && ticks < MAX_TICKS) {
    sim.step();
    ticks++;
  }
}

// ── Physics & combat ─────────────────────────────────────────────────────────
describe('WorldSimulation — movement & combat', () => {
  it('spawns ships equidistant on the radial ring with spawn protection', () => {
    const { sim } = createSim(botRoster(6));
    for (const s of sim.ships.values()) {
      const dist = Math.hypot(s.x - ARENA_CENTER_X, s.y - ARENA_CENTER_Y);
      expect(dist).toBeCloseTo(750, 0);
      expect(s.spawnProtectedUntil).toBe(START_TIME + SPAWN_SHIELD_MS);
      expect(s.health).toBe(SHIP_MAX_HEALTH);
    }
  });

  it('applies thrust, drag, and clamps ships to the arena', () => {
    const { sim, host } = createSim(humanRoster(2));
    const a = ship(sim, 'human-0');
    host.inputs.set('human-0', input({ left: true, up: true }));
    for (let i = 0; i < 25; i++) sim.step();
    expect(Math.hypot(a.velocityX, a.velocityY)).toBeGreaterThan(50);

    // Blast toward the wall for 20 simulated seconds — must stay in bounds.
    host.inputs.set('human-0', input({ left: true, sequence: 2 }));
    for (let i = 0; i < 500; i++) sim.step();
    expect(a.x).toBeGreaterThanOrEqual(SHIP_RADIUS);
    expect(a.x).toBeLessThanOrEqual(2400 - SHIP_RADIUS);
    expect(a.y).toBeGreaterThanOrEqual(SHIP_RADIUS);
  });

  it('enforces the weapon fire cooldown', () => {
    const { sim, host } = createSim(humanRoster(2));
    const shooter = ship(sim, 'human-0');
    host.inputs.set('human-0', input({ shooting: true, aimAngle: 0 }));
    sim.step(); // first shot fires immediately (dual wing lasers)
    const afterFirst = sim.projectiles.size;
    expect(afterFirst).toBe(2);

    let shots = afterFirst;
    const ticksPerSecond = Math.round(1000 / TICK_INTERVAL_MS);
    for (let i = 0; i < ticksPerSecond; i++) {
      sim.step();
      shots = Math.max(shots, sim.projectiles.size);
    }
    // 280 ms cooldown → at most ~4 volleys (8 lasers) per second.
    expect(shooter.lastShotAt).toBeGreaterThan(START_TIME);
    expect(sim.projectiles.size).toBeLessThanOrEqual(10);
    void shots;
  });

  it('projectiles damage and eliminate ships; killers get credit', () => {
    const { sim, host } = createSim(humanRoster(2));
    const shooter = ship(sim, 'human-0');
    const victim = ship(sim, 'human-1');
    // Place ships nose-to-nose and burn through spawn protection.
    shooter.x = 1000;
    shooter.y = 1000;
    victim.x = 1100;
    victim.y = 1000;
    victim.health = 30;
    victim.spawnProtectedUntil = 0;
    shooter.spawnProtectedUntil = 0;
    host.inputs.set(
      'human-0',
      input({ shooting: true, aimAngle: 0, sequence: 1 }),
    );
    for (let i = 0; i < 60 && victim.alive; i++) sim.step();

    expect(victim.alive).toBe(false);
    expect(victim.health).toBe(0);
    expect(victim.deaths).toBe(1);
    expect(shooter.kills).toBe(1);
    expect(host.haptics).toContainEqual({ playerId: victim.id, kind: 'killed' });
    expect(host.haptics).toContainEqual({ playerId: shooter.id, kind: 'kill' });
    expect(shooter.damageDealt).toBeGreaterThanOrEqual(30);
    expect(host.eliminations.at(-1)).toMatchObject({
      killerId: shooter.id,
      victimId: victim.id,
      cause: 'PROJECTILE',
    });
  });

  it('SHIELD pool absorbs damage before health', () => {
    const { sim } = createSim(humanRoster(2));
    const victim = ship(sim, 'human-1');
    victim.spawnProtectedUntil = 0;
    victim.shield = SHIELD_ABSORB;
    victim.upgrades.SHIELD = START_TIME + UPGRADE_DURATIONS_MS.SHIELD;
    victim.x = 500;
    victim.y = 500;
    // Inject a projectile overlapping the ship.
    sim.projectiles.set('test-proj', {
      id: 'test-proj',
      ownerId: 'human-0',
      x: victim.x,
      y: victim.y,
      velocityX: 0,
      velocityY: 0,
      damage: PROJECTILE_DAMAGE,
      expiresAt: START_TIME + PROJECTILE_LIFETIME_MS,
    });
    sim.step();
    expect(victim.shield).toBe(SHIELD_ABSORB - PROJECTILE_DAMAGE);
    expect(victim.health).toBe(SHIP_MAX_HEALTH);
    expect(victim.alive).toBe(true);
  });

  it('eliminated ships cannot move or fire', () => {
    const { sim, host } = createSim(humanRoster(2));
    const dead = ship(sim, 'human-0');
    dead.spawnProtectedUntil = 0;
    dead.health = 0;
    dead.alive = false;
    dead.respawnAt = null;
    const { x, y } = dead;
    host.inputs.set('human-0', input({ up: true, shooting: true }));
    const projectilesBefore = sim.projectiles.size;
    for (let i = 0; i < 30; i++) sim.step();
    expect(dead.x).toBe(x);
    expect(dead.y).toBe(y);
    expect(sim.projectiles.size).toBe(projectilesBefore);
  });

  it('analog stick input steers the nose toward the stick and thrusts', () => {
    const { sim, host } = createSim(humanRoster(2));
    sim.asteroids.clear();
    const a = ship(sim, 'human-0');
    a.x = 1200;
    a.y = 1200;
    a.rotation = 0;
    // Stick straight down (screen +Y).
    host.inputs.set('human-0', input({ moveX: 0, moveY: 1 }));
    for (let i = 0; i < 25; i++) sim.step();
    expect(a.rotation).toBeCloseTo(Math.PI / 2, 2);
    expect(a.velocityY).toBeGreaterThan(100);
    expect(Math.abs(a.velocityX)).toBeLessThan(20);
  });

  it('a centered stick inside the dead zone does not thrust', () => {
    const { sim, host } = createSim(humanRoster(2));
    sim.asteroids.clear();
    const a = ship(sim, 'human-0');
    host.inputs.set('human-0', input({ moveX: 0.05, moveY: -0.05 }));
    for (let i = 0; i < 10; i++) sim.step();
    expect(Math.hypot(a.velocityX, a.velocityY)).toBeLessThan(1);
  });

  it('projectiles expire after their lifetime', () => {
    const { sim, host } = createSim(humanRoster(2));
    host.inputs.set('human-0', input({ shooting: true, aimAngle: 0 }));
    sim.step();
    expect(sim.projectiles.size).toBe(2);
    for (const projectile of sim.projectiles.values()) {
      projectile.x = -9999; // fling out of bounds
    }
    sim.step();
    expect(sim.projectiles.size).toBe(0);
  });
});

// ── Asteroids & pickups ──────────────────────────────────────────────────────
describe('WorldSimulation — asteroids & pickups', () => {
  it('spawns destructible asteroids away from ships', () => {
    const { sim } = createSim(botRoster(4));
    expect(sim.asteroids.size).toBeGreaterThan(0);
    for (const asteroid of sim.asteroids.values()) {
      for (const s of sim.ships.values()) {
        expect(Math.hypot(asteroid.x - s.x, asteroid.y - s.y)).toBeGreaterThanOrEqual(200);
      }
    }
  });

  it('destroying an asteroid removes it and can drop a pickup', () => {
    let dropRoll = 0.01; // force the 45% drop chance
    const host = new TestHost(humanRoster(2));
    const sim = new WorldSimulation(host, {
      manual: true,
      rng: () => dropRoll,
      startTimeMs: START_TIME,
    });
    sim.start();
    const asteroid = [...sim.asteroids.values()][0]!;
    asteroid.health = 10;
    const pickupsBefore = sim.pickups.size;
    sim.projectiles.set('test-proj', {
      id: 'test-proj',
      ownerId: 'human-0',
      x: asteroid.x,
      y: asteroid.y,
      velocityX: 0,
      velocityY: 0,
      damage: PROJECTILE_DAMAGE,
      expiresAt: START_TIME + PROJECTILE_LIFETIME_MS,
    });
    sim.step();
    expect(sim.asteroids.has(asteroid.id)).toBe(false);
    expect(sim.pickups.size).toBe(pickupsBefore + 1);
  });

  it('collecting a pickup applies its buff', () => {
    const { sim } = createSim(humanRoster(2));
    const s = ship(sim, 'human-0');
    const cases: Array<[UpgradeType, () => void]> = [
      ['SHIELD', () => expect(s.shield).toBe(SHIELD_ABSORB)],
      ['RAPID_FIRE', () => expect(s.upgrades.RAPID_FIRE).toBeDefined()],
      ['REPAIR', () => expect(s.health).toBe(40 + REPAIR_HEAL_AMOUNT)], // heals wounded
      ['ENERGY', () => expect(s.upgrades.ENERGY).toBeDefined()],
    ];
    for (const [type, assert] of cases) {
      if (type === 'REPAIR') s.health = 40;
      sim.pickups.set(`pick-${type}`, {
        id: `pick-${type}`,
        type,
        x: s.x,
        y: s.y,
        expiresAt: START_TIME + 60_000,
      });
      sim.step();
      assert();
    }
    expect(sim.pickups.size).toBe(0);
  });

  it('ships bounce off asteroids and take contact damage', () => {
    const { sim } = createSim(humanRoster(2));
    const s = ship(sim, 'human-0');
    const asteroid = [...sim.asteroids.values()][0]!;
    s.spawnProtectedUntil = 0;
    asteroid.velocityX = 0;
    asteroid.velocityY = 0;
    s.x = asteroid.x + asteroid.radius + SHIP_RADIUS - 4;
    s.y = asteroid.y;
    s.velocityX = -120; // ramming into the rock
    s.velocityY = 0;
    const healthBefore = s.health;
    sim.step();
    expect(s.health).toBeLessThan(healthBefore);
    expect(s.velocityX).toBeGreaterThan(0); // bounced away
  });
});

// ── Safe zone & storm ────────────────────────────────────────────────────────
describe('WorldSimulation — safe zone & storm', () => {
  it('keeps a fixed ring in free-for-all mode', () => {
    const { sim } = createSim(humanRoster(2));
    for (let i = 0; i < Math.ceil(60_000 / TICK_INTERVAL_MS); i++) sim.step();
    expect(sim.safeZone.radius).toBe(SAFE_ZONE_INITIAL_RADIUS);
    expect(sim.safeZone.nextShrinkAt).toBeNull();
  });

  it('shrinks through stages on schedule when enabled', () => {
    // Passive ships keep the match alive long enough to observe stage 0.
    const { sim } = createSim(humanRoster(2), 42, { safeZoneShrinks: true });
    sim.asteroids.clear();
    for (const s of sim.ships.values()) s.health = 10_000;
    expect(sim.safeZone.radius).toBe(SAFE_ZONE_INITIAL_RADIUS);
    const firstStage = SAFE_ZONE_STAGES[0]!;
    const ticksToMidShrink = Math.ceil(
      (firstStage.delayMs + firstStage.shrinkMs / 2) / TICK_INTERVAL_MS,
    );
    for (let i = 0; i < ticksToMidShrink && !sim.matchFinished; i++) sim.step();
    expect(sim.safeZone.isShrinking).toBe(true);
    expect(sim.safeZone.radius).toBeLessThan(SAFE_ZONE_INITIAL_RADIUS);
    expect(sim.safeZone.stage).toBe(0);
  });

  it('damages ships outside the safe radius', () => {
    const { sim } = createSim(humanRoster(2));
    sim.asteroids.clear(); // keep drifting rocks from nudging the ship inside
    const outsider = ship(sim, 'human-0');
    outsider.x = 30;
    outsider.y = 30; // ~1670 units from center, outside the 1600 ring
    outsider.spawnProtectedUntil = 0;
    const healthBefore = outsider.health;
    for (let i = 0; i < 25; i++) sim.step(); // 1 simulated second
    const expected = STORM_DAMAGE_PER_SECOND;
    expect(healthBefore - outsider.health).toBeCloseTo(expected, 0);
  });
});

// ── Cosmic Director ──────────────────────────────────────────────────────────
describe('WorldSimulation — cosmic director', () => {
  it('broadcasts and schedules a cosmic event after the first delay', () => {
    const { sim, host } = createSim(humanRoster(2));
    sim.asteroids.clear();
    for (const s of sim.ships.values()) s.health = 10_000;
    const warningTicks = Math.ceil(
      (COSMIC_DIRECTOR_FIRST_EVENT_MS + COSMIC_EVENT_WARNING_MS / 2) /
        TICK_INTERVAL_MS,
    );
    for (let i = 0; i < warningTicks && !sim.matchFinished; i++) sim.step();
    expect(host.cosmicEvents.length).toBeGreaterThanOrEqual(1);
    const snapshot = host.snapshots.at(-1)!;
    expect(snapshot.cosmicEvent).not.toBeNull();
  });
});

// ── Match resolution ─────────────────────────────────────────────────────────
describe('WorldSimulation — free-for-all resolution', () => {
  it('a full headless bot match runs to the timer with a valid MatchResult', () => {
    const { sim, host } = createSim(botRoster(6), 7);
    runUntilFinished(sim);
    const result = host.result;
    expect(result).not.toBeNull();
    expect(result!.stats).toHaveLength(6);
    const placements = result!.stats.map((s) => s.placement).sort();
    expect(placements).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result!.stats[0]!.playerId).toBe(result!.winnerPlayerId);
    expect(result!.winnerName).toBe(result!.stats[0]!.displayName);
    expect(result!.endReason).toBe('TIMEOUT');
    expect(result!.durationMs).toBeGreaterThanOrEqual(MATCH_TIMEOUT_MS);
    // Winner has the most kills.
    const maxKills = Math.max(...result!.stats.map((s) => s.kills));
    expect(result!.stats[0]!.kills).toBe(maxKills);
    expect(host.eliminations.length).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic for a fixed seed', () => {
    const run = () => {
      const { sim, host } = createSim(botRoster(6), 99);
      runUntilFinished(sim);
      return host.result;
    };
    const a = run();
    const b = run();
    expect(a).toEqual(b);
  });

  it('destroyed ships respawn after the delay with full health and a spawn shield', () => {
    const { sim, host } = createSim(humanRoster(3));
    sim.asteroids.clear();
    const victim = ship(sim, 'human-1');
    victim.spawnProtectedUntil = 0;
    sim.projectiles.set('kill-shot', {
      id: 'kill-shot',
      ownerId: 'human-0',
      x: victim.x,
      y: victim.y,
      velocityX: 0,
      velocityY: 0,
      damage: SHIP_MAX_HEALTH * 2,
      expiresAt: START_TIME + PROJECTILE_LIFETIME_MS,
    });
    sim.step();
    expect(victim.alive).toBe(false);
    expect(victim.respawnAt).not.toBeNull();
    expect(host.result).toBeNull();

    const ticks = Math.ceil(RESPAWN_DELAY_MS / TICK_INTERVAL_MS) + 1;
    for (let i = 0; i < ticks; i++) sim.step();
    expect(victim.alive).toBe(true);
    expect(victim.health).toBe(SHIP_MAX_HEALTH);
    expect(victim.deaths).toBe(1);
    expect(victim.spawnProtectedUntil).toBeGreaterThan(START_TIME);
    expect(host.haptics).toContainEqual({ playerId: victim.id, kind: 'respawn' });
  });

  it('parks a disconnected phone ship and brings it back on reconnect', () => {
    const roster: SimulationRosterEntry[] = [
      { id: 'human-0', displayName: 'Flaky', isBot: false, colorIndex: 0 },
      ...botRoster(3),
    ];
    const { sim, host } = createSim(roster, 5);
    host.connected.set('human-0', false);
    sim.step();
    const s = ship(sim, 'human-0');
    expect(s.alive).toBe(false);
    expect(s.connected).toBe(false);
    expect(s.deaths).toBe(0);
    for (let i = 0; i < 100; i++) sim.step();
    expect(s.alive).toBe(false);

    host.connected.set('human-0', true);
    sim.step();
    expect(s.alive).toBe(true);
    expect(s.connected).toBe(true);
  });

  it('spawns ships for phones that join mid-round and removes leavers', () => {
    const { sim, host } = createSim(humanRoster(2));
    host.roster.push({ id: 'late', displayName: 'Late', isBot: false, colorIndex: 5 });
    host.connected.set('late', true);
    sim.step();
    expect(ship(sim, 'late').alive).toBe(true);

    host.roster.splice(0, 1);
    sim.step();
    expect(sim.ships.has('human-0')).toBe(false);
  });

  it('pushes ranked controller state to human ships only', () => {
    const roster: SimulationRosterEntry[] = [...humanRoster(2), ...botRoster(1)];
    const { sim, host } = createSim(roster);
    ship(sim, 'human-1').kills = 3;
    for (let i = 0; i < 8; i++) sim.step();
    expect(host.controllerStates.get('human-1')).toMatchObject({ rank: 1, kills: 3, alive: true });
    expect(host.controllerStates.get('human-0')?.totalPlayers).toBe(3);
    expect(host.controllerStates.has('bot-test-0')).toBe(false);
  });
});
