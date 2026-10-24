import type {
  CosmicEventState,
  CosmicEventType,
  SafeZoneState,
  UpgradeType,
} from '@lss/shared';
import {
  ARENA_CENTER_X,
  ARENA_CENTER_Y,
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COSMIC_DIRECTOR_FIRST_EVENT_MS,
  COSMIC_DIRECTOR_INTERVAL_MS,
  COSMIC_EVENT_DURATIONS_MS,
  COSMIC_EVENT_TYPES,
  COSMIC_EVENT_WARNING_MS,
  METEOR_SHOWER_COUNT,
  METEOR_SHOWER_DURATION_MS,
  SOLAR_SURGE_STORM_MULTIPLIER,
  SUPPLY_DROP_PICKUP_COUNT,
  UPGRADE_TYPES,
} from '@lss/shared';

/** Spawning/broadcast hooks the director needs from the world simulation. */
export interface CosmicDirectorContext {
  readonly safeZone: SafeZoneState;
  spawnMeteor(x: number, y: number, dirX: number, dirY: number): void;
  spawnPickup(type: UpgradeType, x: number, y: number): void;
  broadcast(event: CosmicEventState): void;
}

/**
 * AI Cosmic Director — a lightweight game-master that paces each match by
 * periodically triggering arena-wide anomalies. Every event goes through a
 * `COSMIC_EVENT_WARNING_MS` telegraph phase (broadcast immediately so HUDs
 * can warn players) before its effect activates.
 */
export class CosmicDirector {
  private nextEventAt = Number.POSITIVE_INFINITY;
  private pending: { event: CosmicEventState; activateAt: number } | null = null;
  private active: { event: CosmicEventState; visibleUntil: number } | null = null;
  private meteorTimes: number[] = [];
  private lastType: CosmicEventType | null = null;
  private seq = 0;

  constructor(private readonly rng: () => number = Math.random) {}

  /** Begin pacing a match that starts at `matchStartTime` (sim clock). */
  arm(matchStartTime: number): void {
    this.nextEventAt = matchStartTime + COSMIC_DIRECTOR_FIRST_EVENT_MS;
    this.pending = null;
    this.active = null;
    this.meteorTimes = [];
    this.lastType = null;
  }

  /** Storm DPS multiplier while a Solar Surge is active. */
  get stormDamageMultiplier(): number {
    return this.active?.event.type === 'SOLAR_SURGE'
      ? SOLAR_SURGE_STORM_MULTIPLIER
      : 1;
  }

  /** Event currently in warning or active phase (for snapshots). */
  get currentEvent(): CosmicEventState | null {
    return this.pending?.event ?? this.active?.event ?? null;
  }

  update(now: number, ctx: CosmicDirectorContext): void {
    // Warning phase elapsed → activate the anomaly's effect.
    if (this.pending && now >= this.pending.activateAt) {
      const event = this.pending.event;
      this.pending = null;
      this.activate(event, now, ctx);
      this.active = {
        event,
        // Instant events keep a short visible banner for HUD clarity.
        visibleUntil: Math.max(event.endsAt, now + 2500),
      };
      this.nextEventAt = now + COSMIC_DIRECTOR_INTERVAL_MS;
    }

    // Spawn any meteors whose scheduled time has arrived.
    if (this.active?.event.type === 'METEOR_SHOWER') {
      while (this.meteorTimes.length > 0 && this.meteorTimes[0]! <= now) {
        this.meteorTimes.shift();
        this.launchMeteor(ctx);
      }
    }

    if (this.active && now >= this.active.visibleUntil) {
      this.active = null;
      this.meteorTimes = [];
    }

    // Idle → pick the next anomaly and broadcast its warning.
    if (!this.pending && !this.active && now >= this.nextEventAt) {
      const type = this.chooseType();
      const event: CosmicEventState = {
        id: `cosmic-${++this.seq}`,
        type,
        startedAt: now,
        endsAt: now + COSMIC_EVENT_WARNING_MS + COSMIC_EVENT_DURATIONS_MS[type],
      };
      this.pending = { event, activateAt: now + COSMIC_EVENT_WARNING_MS };
      this.lastType = type;
      ctx.broadcast(event);
    }
  }

  private activate(
    event: CosmicEventState,
    now: number,
    ctx: CosmicDirectorContext,
  ): void {
    if (event.type === 'METEOR_SHOWER') {
      // Spread meteor impacts across the shower duration.
      this.meteorTimes = Array.from(
        { length: METEOR_SHOWER_COUNT },
        () => now + this.rng() * METEOR_SHOWER_DURATION_MS,
      ).sort((a, b) => a - b);
    } else if (event.type === 'SUPPLY_DROP') {
      for (let i = 0; i < SUPPLY_DROP_PICKUP_COUNT; i++) {
        const point = this.pointInSafeZone(ctx.safeZone);
        const type =
          UPGRADE_TYPES[Math.floor(this.rng() * UPGRADE_TYPES.length)]!;
        ctx.spawnPickup(type, point.x, point.y);
      }
    }
    // SOLAR_SURGE needs no spawn work — stormDamageMultiplier handles it.
  }

  private chooseType(): CosmicEventType {
    const candidates = COSMIC_EVENT_TYPES.filter((t) => t !== this.lastType);
    return candidates[Math.floor(this.rng() * candidates.length)]!;
  }

  private pointInSafeZone(zone: SafeZoneState): { x: number; y: number } {
    const angle = this.rng() * Math.PI * 2;
    const dist = this.rng() * Math.max(120, zone.radius * 0.7);
    return {
      x: Math.min(ARENA_WIDTH - 60, Math.max(60, zone.centerX + Math.cos(angle) * dist)),
      y: Math.min(ARENA_HEIGHT - 60, Math.max(60, zone.centerY + Math.sin(angle) * dist)),
    };
  }

  /** Meteors streak in from a random arena edge toward the safe zone. */
  private launchMeteor(ctx: CosmicDirectorContext): void {
    const side = Math.floor(this.rng() * 4);
    const along = this.rng();
    let x: number;
    let y: number;
    if (side === 0) {
      x = along * ARENA_WIDTH;
      y = 0;
    } else if (side === 1) {
      x = ARENA_WIDTH;
      y = along * ARENA_HEIGHT;
    } else if (side === 2) {
      x = along * ARENA_WIDTH;
      y = ARENA_HEIGHT;
    } else {
      x = 0;
      y = along * ARENA_HEIGHT;
    }

    const targetX = ARENA_CENTER_X + (this.rng() - 0.5) * ctx.safeZone.radius;
    const targetY = ARENA_CENTER_Y + (this.rng() - 0.5) * ctx.safeZone.radius;
    const dx = targetX - x;
    const dy = targetY - y;
    const len = Math.hypot(dx, dy) || 1;
    ctx.spawnMeteor(x, y, dx / len, dy / len);
  }
}
