import { describe, expect, it } from 'vitest';
import {
  ARENA_CENTER_X,
  ARENA_CENTER_Y,
  ARENA_HEIGHT,
  ARENA_WIDTH,
  ASTEROID_COUNT,
  ASTEROID_PICKUP_DROP_CHANCE,
  ASTEROID_RADIUS_MAX,
  ASTEROID_RADIUS_MIN,
  COSMIC_EVENT_DURATIONS_MS,
  COSMIC_EVENT_TYPES,
  COUNTDOWN_DURATION_MS,
  FIRE_COOLDOWN_MS,
  MATCH_TIMEOUT_MS,
  MAX_BOTS_PER_ROOM,
  MAX_PLAYERS_PER_ROOM,
  PICKUP_COLORS,
  PROJECTILE_DAMAGE,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  RAPID_FIRE_COOLDOWN_MS,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  SAFE_ZONE_INITIAL_RADIUS,
  SAFE_ZONE_STAGES,
  SHIP_COLORS,
  SHIP_MAX_HEALTH,
  SHIP_RADIUS,
  SPAWN_RING_RADIUS,
  SPAWN_SHIELD_MS,
  STORM_DAMAGE_PER_SECOND,
  TICK_INTERVAL_MS,
  TICK_RATE,
  UPGRADE_DURATIONS_MS,
  UPGRADE_TYPES,
} from '../constants.js';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../events.js';
import type {
  CosmicEventType,
  GameSnapshot,
  MatchResult,
  PlayerInput,
  PlayerState,
  RoomInfo,
  UpgradeType,
} from '../types.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

describe('arena & simulation constants', () => {
  it('uses a 2400x2400 arena centered at (1200, 1200)', () => {
    expect(ARENA_WIDTH).toBe(2400);
    expect(ARENA_HEIGHT).toBe(2400);
    expect(ARENA_CENTER_X).toBe(1200);
    expect(ARENA_CENTER_Y).toBe(1200);
  });

  it('runs the authoritative sim at 25 Hz / 40 ms ticks', () => {
    expect(TICK_RATE).toBe(25);
    expect(TICK_INTERVAL_MS).toBe(40);
  });
});

describe('ship & combat balance', () => {
  it('ships have radius 20, max health 100, and a 2.5s spawn shield', () => {
    expect(SHIP_RADIUS).toBe(20);
    expect(SHIP_MAX_HEALTH).toBe(100);
    expect(SPAWN_SHIELD_MS).toBe(2500);
    expect(SPAWN_RING_RADIUS).toBe(750);
  });

  it('weapons use snappy cooldowns, 20 damage, 1.2s lifetime, and sleek projectile radius', () => {
    expect(FIRE_COOLDOWN_MS).toBe(240);
    expect(RAPID_FIRE_COOLDOWN_MS).toBe(120);
    expect(RAPID_FIRE_COOLDOWN_MS).toBeLessThan(FIRE_COOLDOWN_MS);
    expect(PROJECTILE_DAMAGE).toBe(20);
    expect(PROJECTILE_LIFETIME_MS).toBe(1200);
    expect(PROJECTILE_RADIUS).toBe(3);
  });
});

describe('room codes & lobby rules', () => {
  it('uses 4-char codes from an unambiguous 32-char alphabet', () => {
    expect(ROOM_CODE_LENGTH).toBe(4);
    expect(ROOM_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(32);
    for (const ambiguous of ['I', 'O', '0', '1']) {
      expect(ROOM_CODE_ALPHABET).not.toContain(ambiguous);
    }
    expect(ROOM_CODE_ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
  });

  it('caps rooms at 8 ships and 7 AI bot pilots', () => {
    expect(MAX_PLAYERS_PER_ROOM).toBe(8);
    expect(MAX_BOTS_PER_ROOM).toBe(7);
    expect(MAX_BOTS_PER_ROOM).toBeLessThan(MAX_PLAYERS_PER_ROOM);
  });
});

describe('asteroids & pickups', () => {
  it('spawns 18 asteroids in the 28-55 radius band', () => {
    expect(ASTEROID_COUNT).toBe(18);
    expect(ASTEROID_RADIUS_MIN).toBe(28);
    expect(ASTEROID_RADIUS_MAX).toBe(55);
    expect(ASTEROID_RADIUS_MIN).toBeLessThan(ASTEROID_RADIUS_MAX);
  });

  it('defines all six upgrade types with durations and colors', () => {
    expect(UPGRADE_TYPES).toEqual(['SHIELD', 'RAPID_FIRE', 'REPAIR', 'ENERGY', 'TRIPLE_SHOT', 'EMP_BLAST']);
    for (const type of UPGRADE_TYPES) {
      expect(UPGRADE_DURATIONS_MS[type]).toBeGreaterThanOrEqual(0);
      expect(PICKUP_COLORS[type]).toMatch(HEX_COLOR);
    }
  });

  it('drop chance is a valid probability', () => {
    expect(ASTEROID_PICKUP_DROP_CHANCE).toBeGreaterThan(0);
    expect(ASTEROID_PICKUP_DROP_CHANCE).toBeLessThan(1);
  });
});

describe('safe zone shrink schedule', () => {
  it('has multi-stage strictly shrinking target radii', () => {
    expect(SAFE_ZONE_STAGES.length).toBeGreaterThanOrEqual(3);
    let previous = SAFE_ZONE_INITIAL_RADIUS;
    for (const stage of SAFE_ZONE_STAGES) {
      expect(stage.delayMs).toBeGreaterThan(0);
      expect(stage.shrinkMs).toBeGreaterThan(0);
      expect(stage.targetRadius).toBeGreaterThanOrEqual(SHIP_RADIUS);
      expect(stage.targetRadius).toBeLessThan(previous);
      previous = stage.targetRadius;
    }
  });

  it('first shrink begins after ~30s and storm deals 8 HP/sec', () => {
    expect(SAFE_ZONE_STAGES[0]!.delayMs).toBe(30_000);
    expect(STORM_DAMAGE_PER_SECOND).toBe(8);
  });

  it('shrink timeline resolves before the 3-minute match timeout', () => {
    const totalShrinkTime = SAFE_ZONE_STAGES.reduce(
      (sum, stage) => sum + stage.delayMs + stage.shrinkMs,
      0,
    );
    expect(totalShrinkTime).toBeLessThan(MATCH_TIMEOUT_MS);
    expect(MATCH_TIMEOUT_MS).toBe(180_000);
    expect(COUNTDOWN_DURATION_MS).toBe(3000);
  });
});

describe('cosmic director', () => {
  it('covers all three cosmic anomaly types', () => {
    expect(COSMIC_EVENT_TYPES).toEqual([
      'METEOR_SHOWER',
      'SOLAR_SURGE',
      'SUPPLY_DROP',
    ]);
    for (const type of COSMIC_EVENT_TYPES) {
      expect(COSMIC_EVENT_DURATIONS_MS[type]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('neon palette', () => {
  it('provides at least 8 valid ship colors', () => {
    expect(SHIP_COLORS.length).toBeGreaterThanOrEqual(8);
    for (const color of SHIP_COLORS) {
      expect(color).toMatch(HEX_COLOR);
    }
  });
});

describe('contract structural invariants', () => {
  it('GameSnapshot carries every entity collection the client renders', () => {
    const snapshot: GameSnapshot = {
      tick: 1,
      serverTime: 0,
      status: 'ACTIVE',
      matchElapsedMs: 0,
      timeRemainingMs: MATCH_TIMEOUT_MS,
      aliveCount: 1,
      players: [
        {
          id: 'p1',
          displayName: 'Nova',
          isBot: false,
          colorIndex: 0,
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
          connected: true,
          upgrades: {},
          spawnProtectedUntil: SPAWN_SHIELD_MS,
          lastInputSequence: 0,
        } satisfies PlayerState,
      ],
      projectiles: [],
      asteroids: [],
      pickups: [],
      safeZone: {
        centerX: ARENA_CENTER_X,
        centerY: ARENA_CENTER_Y,
        radius: SAFE_ZONE_INITIAL_RADIUS,
        targetRadius: SAFE_ZONE_INITIAL_RADIUS,
        stage: -1,
        isShrinking: false,
        nextShrinkAt: null,
      },
      cosmicEvent: null,
      killFeed: [],
    };

    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.safeZone.radius).toBe(SAFE_ZONE_INITIAL_RADIUS);
    expect(snapshot.status).toBe('ACTIVE');
  });

  it('union types cover the documented value sets', () => {
    const statuses = ['LOBBY', 'COUNTDOWN', 'ACTIVE', 'FINISHED'] as const;
    const upgrades: UpgradeType[] = [
      'SHIELD',
      'RAPID_FIRE',
      'REPAIR',
      'ENERGY',
      'TRIPLE_SHOT',
      'EMP_BLAST',
    ];
    const cosmic: CosmicEventType[] = [
      'METEOR_SHOWER',
      'SOLAR_SURGE',
      'SUPPLY_DROP',
    ];
    expect(upgrades).toHaveLength(UPGRADE_TYPES.length);
    expect(cosmic).toHaveLength(COSMIC_EVENT_TYPES.length);
    expect(statuses).toContain('LOBBY');
    expect(statuses).toContain('FINISHED');
  });

  it('exposes typed event maps for both socket directions', () => {
    // Compile-time checks: if these interfaces lose members, this file
    // fails typecheck. Runtime check confirms the module shape is intact.
    const c2s: keyof ClientToServerEvents = 'input:update';
    const s2c: keyof ServerToClientEvents = 'game:snapshot';
    expect(c2s).toBe('input:update');
    expect(s2c).toBe('game:snapshot');
  });

  it('models a complete match result with per-player stats', () => {
    const result: MatchResult = {
      roomCode: 'ABCD',
      winnerPlayerId: 'p1',
      winnerName: 'Nova',
      endReason: 'TIMEOUT',
      durationMs: 95_000,
      stats: [
        {
          playerId: 'p1',
          displayName: 'Nova',
          isBot: false,
          colorIndex: 0,
          placement: 1,
          kills: 3,
          deaths: 1,
          damageDealt: 340,
          survivalTimeMs: 95_000,
        },
      ],
    };
    expect(result.stats[0]!.placement).toBe(1);
    expect(result.endReason).toBe('TIMEOUT');
  });

  it('models room and input contracts used by socket events', () => {
    const room: RoomInfo = {
      code: 'ABCD',
      status: 'LOBBY',
      hostConnected: true,
      players: [
        {
          id: 'p1',
          displayName: 'Nova',
          isBot: false,
          isConnected: true,
          colorIndex: 0,
        },
      ],
      botCount: 0,
      maxPlayers: MAX_PLAYERS_PER_ROOM,
      createdAt: Date.now(),
    };
    const input: PlayerInput = {
      up: true,
      down: false,
      left: false,
      right: false,
      aimAngle: Math.PI / 2,
      shooting: false,
      sequence: 1,
      moveX: 0.5,
      moveY: -0.5,
    };
    expect(room.hostConnected).toBe(true);
    expect(input.up).toBe(true);
  });
});
