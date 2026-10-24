import type { CosmicEventType, UpgradeType } from './types.js';

// ── Arena ────────────────────────────────────────────────────────────────────
export const ARENA_WIDTH = 2400;
export const ARENA_HEIGHT = 2400;
export const ARENA_CENTER_X = ARENA_WIDTH / 2;
export const ARENA_CENTER_Y = ARENA_HEIGHT / 2;

// ── Simulation ───────────────────────────────────────────────────────────────
export const TICK_RATE = 25;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE; // 40 ms
export const SNAPSHOT_INTERVAL_MS = TICK_INTERVAL_MS;

// ── Ships ────────────────────────────────────────────────────────────────────
export const SHIP_RADIUS = 20;
export const SHIP_MAX_HEALTH = 100;
export const SHIP_MAX_SPEED = 420;
export const SHIP_ACCELERATION = 1250;
export const SHIP_DRAG = 2.0;
export const SHIP_DRIFT_DRAG = 0.35;
export const SHIP_BOOST_SPEED_MULTIPLIER = 1.6;
export const SHIP_BOOST_ACCEL_MULTIPLIER = 1.65;
export const SHIP_RECOIL_IMPULSE = 20;
export const SHIP_ASTEROID_CONTACT_DAMAGE = 10;
export const SHIP_TURN_SPEED = 4.8;
export const SHIP_REVERSE_SPEED_FACTOR = 0.55;
export const SPAWN_SHIELD_MS = 2500;
export const SPAWN_RING_RADIUS = 750;

// ── Weapons & projectiles ────────────────────────────────────────────────────
export const FIRE_COOLDOWN_MS = 240;
export const RAPID_FIRE_COOLDOWN_MS = 120;
export const PROJECTILE_RADIUS = 3;
export const PROJECTILE_SPEED = 1050;
export const PROJECTILE_DAMAGE = 20;
export const PROJECTILE_LIFETIME_MS = 1200;
export const MAX_PROJECTILES = 256;

// ── Asteroids ────────────────────────────────────────────────────────────────
export const ASTEROID_COUNT = 18;
export const ASTEROID_RADIUS_MIN = 28;
export const ASTEROID_RADIUS_MAX = 55;
export const ASTEROID_BASE_HEALTH = 40;
export const ASTEROID_MAX_SPEED = 40;
export const ASTEROID_PICKUP_DROP_CHANCE = 0.45;
export const ASTEROID_MIN_SPAWN_DISTANCE_FROM_SHIPS = 250;

// ── Pickups & upgrades ───────────────────────────────────────────────────────
export const PICKUP_RADIUS = 16;
export const PICKUP_LIFETIME_MS = 12_000;
export const MAX_PICKUPS = 24;

export const UPGRADE_TYPES = [
  'SHIELD',
  'RAPID_FIRE',
  'REPAIR',
  'ENERGY',
  'TRIPLE_SHOT',
  'EMP_BLAST',
] as const;

export const UPGRADE_DURATIONS_MS: Record<UpgradeType, number> = {
  SHIELD: 6000,
  RAPID_FIRE: 6000,
  REPAIR: 0, // instant effect
  ENERGY: 8000,
  TRIPLE_SHOT: 8000,
  EMP_BLAST: 0, // instant shockwave
};

export const SHIELD_ABSORB = 60;
export const REPAIR_HEAL_AMOUNT = 30;
export const ENERGY_SPEED_MULTIPLIER = 1.35;
export const EMP_RADIUS = 450;
export const EMP_DAMAGE = 35;

// ── Safe zone ────────────────────────────────────────────────────────────────
export interface SafeZoneStageConfig {
  /** Delay after the previous stage finishes shrinking before this stage begins. */
  delayMs: number;
  /** How long the shrink animation takes. */
  shrinkMs: number;
  /** Radius (world units) the zone reaches at the end of this stage. */
  targetRadius: number;
}

export const SAFE_ZONE_INITIAL_RADIUS = 1600;
export const SAFE_ZONE_WARNING_MS = 5000;
export const STORM_DAMAGE_PER_SECOND = 8;

export const SAFE_ZONE_STAGES: readonly SafeZoneStageConfig[] = [
  { delayMs: 30_000, shrinkMs: 10_000, targetRadius: 1100 },
  { delayMs: 15_000, shrinkMs: 10_000, targetRadius: 700 },
  { delayMs: 12_000, shrinkMs: 8_000, targetRadius: 420 },
  { delayMs: 10_000, shrinkMs: 8_000, targetRadius: 200 },
  { delayMs: 8_000, shrinkMs: 6_000, targetRadius: 80 },
];

// ── Match lifecycle ──────────────────────────────────────────────────────────
export const COUNTDOWN_DURATION_MS = 3000;
export const MATCH_TIMEOUT_MS = 180_000;

// ── Rooms & players ──────────────────────────────────────────────────────────
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
export const MAX_PLAYERS_PER_ROOM = 8;
export const MIN_HUMANS_TO_START = 1;
export const MAX_BOTS_PER_ROOM = 7;
export const QUICK_PLAY_DEFAULT_BOTS = 5;
export const MIN_DISPLAY_NAME_LENGTH = 1;
export const MAX_DISPLAY_NAME_LENGTH = 16;

// ── AI Cosmic Director ───────────────────────────────────────────────────────
export const COSMIC_EVENT_TYPES = ['METEOR_SHOWER', 'SOLAR_SURGE', 'SUPPLY_DROP'] as const;
export const COSMIC_DIRECTOR_FIRST_EVENT_MS = 20_000;
export const COSMIC_DIRECTOR_INTERVAL_MS = 25_000;
export const COSMIC_EVENT_WARNING_MS = 3000;

export const METEOR_SHOWER_DURATION_MS = 6000;
export const METEOR_SHOWER_COUNT = 14;
export const METEOR_RADIUS = 14;
export const METEOR_SPEED = 520;
export const METEOR_DAMAGE = 15;

export const SOLAR_SURGE_DURATION_MS = 8000;
export const SOLAR_SURGE_STORM_MULTIPLIER = 2.5;

export const SUPPLY_DROP_PICKUP_COUNT = 5;

export const COSMIC_EVENT_DURATIONS_MS: Record<CosmicEventType, number> = {
  METEOR_SHOWER: METEOR_SHOWER_DURATION_MS,
  SOLAR_SURGE: SOLAR_SURGE_DURATION_MS,
  SUPPLY_DROP: 0, // instant
};

// ── Neon palette ─────────────────────────────────────────────────────────────
export const SHIP_COLORS = [
  '#22d3ee',
  '#f472b6',
  '#a3e635',
  '#fbbf24',
  '#c084fc',
  '#fb7185',
  '#2dd4bf',
  '#fde047',
] as const;

export const PICKUP_COLORS: Record<UpgradeType, string> = {
  SHIELD: '#60a5fa',
  RAPID_FIRE: '#fb923c',
  REPAIR: '#4ade80',
  ENERGY: '#facc15',
  TRIPLE_SHOT: '#c084fc',
  EMP_BLAST: '#06b6d4',
};

export const COSMIC_EVENT_COLORS: Record<CosmicEventType, string> = {
  METEOR_SHOWER: '#fb923c',
  SOLAR_SURGE: '#fde047',
  SUPPLY_DROP: '#4ade80',
};

export const NEON = {
  background: '#05050f',
  grid: '#141432',
  boundary: '#22d3ee',
  safeZone: '#22d3ee',
  storm: '#f43f5e',
  projectile: '#7de3ff',
  asteroid: '#8b9bb4',
  meteor: '#fb923c',
} as const;
