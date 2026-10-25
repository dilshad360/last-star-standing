import type {
  AsteroidState,
  PickupState,
  PlayerInput,
  SafeZoneState,
} from '@lss/shared';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PROJECTILE_SPEED,
  SHIP_RADIUS,
} from '@lss/shared';
import type { ShipState } from './WorldSimulation.js';

/** World view a bot reasons over each tick. */
export interface BotView {
  now: number;
  ships: readonly ShipState[];
  asteroids: readonly AsteroidState[];
  pickups: readonly PickupState[];
  safeZone: SafeZoneState;
}

const KEY_THRESHOLD = 0.3;
const EDGE_MARGIN = 200;
const ZONE_MARGIN = 120;
const ASTEROID_AVOID_RANGE = 160;
const ENGAGE_RANGE = 520;
const FIRE_RANGE = 380;
const ORBIT_DISTANCE = 320;
const PICKUP_SEEK_RANGE = 750;
const PICKUP_SEEK_RANGE_HURT = 1000;
const ASTEROID_FARM_RANGE = 800;
const EARLY_GAME_DURATION_MS = 14_000;

/**
 * Server-side AI Bot Pilot. Emits the exact same `PlayerInput` contract as a
 * human client — thrust keys + aim angle + fire flag — so bots can never act
 * outside the authoritative rules.
 */
export class BotController {
  private sequence = 0;
  private readonly orbitSign: 1 | -1;
  private readonly aimNoise: number;
  private matchStartTime: number | null = null;
  private burstCount = 0;
  private burstCooldownUntil = 0;

  constructor(private readonly rng: () => number = Math.random) {
    this.orbitSign = rng() < 0.5 ? -1 : 1;
    // Per-bot static aim bias gives each pilot a personality; per-shot jitter
    // in decide() keeps them beatable instead of perfectly lethal.
    this.aimNoise = (rng() - 0.5) * 0.22;
  }

  decide(self: ShipState, view: BotView): PlayerInput {
    let moveX = 0;
    let moveY = 0;
    let aimAngle = self.rotation;
    let shooting = false;

    const zone = view.safeZone;
    const zoneDx = zone.centerX - self.x;
    const zoneDy = zone.centerY - self.y;
    const zoneDist = Math.hypot(zoneDx, zoneDy) || 1;

    // ── Stay inside the safe zone ────────────────────────────────────────
    if (zoneDist > zone.radius - ZONE_MARGIN) {
      const weight = zoneDist > zone.radius ? 3 : 1.2;
      moveX += (zoneDx / zoneDist) * weight;
      moveY += (zoneDy / zoneDist) * weight;
    }

    // ── Arena boundary avoidance ─────────────────────────────────────────
    if (self.x < EDGE_MARGIN) moveX += 1.6;
    if (self.x > ARENA_WIDTH - EDGE_MARGIN) moveX -= 1.6;
    if (self.y < EDGE_MARGIN) moveY += 1.6;
    if (self.y > ARENA_HEIGHT - EDGE_MARGIN) moveY -= 1.6;

    // ── Asteroid collision avoidance ─────────────────────────────────────
    for (const asteroid of view.asteroids) {
      const dx = self.x - asteroid.x;
      const dy = self.y - asteroid.y;
      const range = asteroid.radius + SHIP_RADIUS + ASTEROID_AVOID_RANGE;
      const dist = Math.hypot(dx, dy);
      if (dist > 0 && dist < range) {
        const weight = 2.4 * (1 - dist / range);
        moveX += (dx / dist) * weight;
        moveY += (dy / dist) * weight;
      }
    }

    // ── Goal selection ───────────────────────────────────────────────────
    const enemy = this.nearestEnemy(self, view.ships);
    const hurt = self.health <= self.maxHealth * 0.45;
    const pickup = this.nearestPickup(
      self,
      view.pickups,
      hurt ? PICKUP_SEEK_RANGE_HURT : PICKUP_SEEK_RANGE,
    );
    const enemyDist = enemy ? this.distance(self.x, self.y, enemy.x, enemy.y) : Infinity;

    if (this.matchStartTime === null) {
      this.matchStartTime = view.now;
    }
    const matchElapsed = view.now - this.matchStartTime;
    const isEarlyGame = matchElapsed < EARLY_GAME_DURATION_MS;

    if (pickup && (hurt || isEarlyGame || enemyDist > ENGAGE_RANGE * 0.5)) {
      const steer = this.steerToward(self.x, self.y, pickup.x, pickup.y, 1.4);
      moveX += steer.x;
      moveY += steer.y;
    }

    const effectiveEngageRange = isEarlyGame ? 280 : ENGAGE_RANGE;
    if (enemy && enemyDist <= effectiveEngageRange) {
      // Lead the target by the projectile's time of flight with human-like latency jitter.
      const flightTime = enemyDist / PROJECTILE_SPEED;
      const targetX = enemy.x + enemy.velocityX * flightTime;
      const targetY = enemy.y + enemy.velocityY * flightTime;
      const jitter = isEarlyGame ? 0.75 : 0.45;
      aimAngle =
        Math.atan2(targetY - self.y, targetX - self.x) +
        this.aimNoise +
        (this.rng() - 0.5) * jitter;

      // Burst firing cadence: 2-3 shots then reposition pause
      const effectiveFireRange = isEarlyGame ? 240 : FIRE_RANGE;
      if (enemyDist <= effectiveFireRange) {
        if (view.now >= this.burstCooldownUntil) {
          shooting = true;
          this.burstCount++;
          if (this.burstCount >= 3) {
            this.burstCount = 0;
            this.burstCooldownUntil = view.now + 650 + this.rng() * 600;
          }
        }
      }

      // Hold a firing standoff: only close when far, back off when crowded,
      // and kite the opponent while hurt.
      const standoff = hurt ? ORBIT_DISTANCE + 160 : ORBIT_DISTANCE;
      if (enemyDist > standoff + 160) {
        // Hold a loose standoff — the shrinking safe zone is what forces
        // engagements, not blind convergence.
        const steer = this.steerToward(self.x, self.y, enemy.x, enemy.y, 0.35);
        moveX += steer.x;
        moveY += steer.y;
      } else if (enemyDist < standoff - 100) {
        const steer = this.steerToward(
          self.x,
          self.y,
          enemy.x,
          enemy.y,
          hurt ? -1.6 : -0.9,
        );
        moveX += steer.x;
        moveY += steer.y;
      }
      // Orbit strafe for evasive motion while fighting.
      const strafeAngle =
        Math.atan2(self.y - enemy.y, self.x - enemy.x) +
        (Math.PI / 2) * this.orbitSign;
      moveX += Math.cos(strafeAngle) * 0.55;
      moveY += Math.sin(strafeAngle) * 0.55;
    } else if (enemy && (!pickup || (!hurt && enemyDist < 1200))) {
      // Hunt and pursue distant enemies — never stay idle while opponents are alive!
      const huntWeight = isEarlyGame ? 0.9 : 1.25;
      const steer = this.steerToward(self.x, self.y, enemy.x, enemy.y, huntWeight);
      moveX += steer.x;
      moveY += steer.y;
      aimAngle = Math.atan2(enemy.y - self.y, enemy.x - self.x) + this.aimNoise;

      // Take potshots at asteroids along the hunt path if ready
      const nearAsteroid = this.nearestAsteroid(self, view.asteroids, 300);
      if (nearAsteroid && view.now >= this.burstCooldownUntil) {
        aimAngle = Math.atan2(nearAsteroid.y - self.y, nearAsteroid.x - self.x);
        shooting = true;
      }
    } else if (!pickup) {
      // No enemies or loot nearby: farm the closest asteroid for drops while actively maneuvering.
      const asteroid = this.nearestAsteroid(self, view.asteroids, ASTEROID_FARM_RANGE);
      if (asteroid) {
        aimAngle = Math.atan2(asteroid.y - self.y, asteroid.x - self.x);
        const dist = this.distance(self.x, self.y, asteroid.x, asteroid.y);
        shooting = dist <= ASTEROID_FARM_RANGE * 0.75;
        if (dist > asteroid.radius + SHIP_RADIUS + 220) {
          const steer = this.steerToward(self.x, self.y, asteroid.x, asteroid.y, 0.9);
          moveX += steer.x;
          moveY += steer.y;
        } else {
          // Circle/orbit around the asteroid instead of floating stationary
          const orbitAngle =
            Math.atan2(self.y - asteroid.y, self.x - asteroid.x) +
            (Math.PI / 2) * this.orbitSign;
          moveX += Math.cos(orbitAngle) * 0.7;
          moveY += Math.sin(orbitAngle) * 0.7;
        }
      } else {
        // Active patrol cruise inside safe zone: orbit or sweep the sector so it never sits idle
        const patrolAngle =
          Math.atan2(self.y - zone.centerY, self.x - zone.centerX) +
          (Math.PI / 2) * this.orbitSign;
        moveX += Math.cos(patrolAngle) * 0.8 + (zoneDx / zoneDist) * 0.3;
        moveY += Math.sin(patrolAngle) * 0.8 + (zoneDy / zoneDist) * 0.3;
        aimAngle = Math.atan2(moveY, moveX);
      }
    }

    // ── Guaranteed Active Movement ───────────────────────────────────────
    // Ensure the bot NEVER stays idle or motionless if nothing is nearby.
    const currentLen = Math.hypot(moveX, moveY);
    if (currentLen < KEY_THRESHOLD) {
      const patrolAngle =
        zoneDist > 60
          ? Math.atan2(self.y - zone.centerY, self.x - zone.centerX) +
            (Math.PI / 2) * this.orbitSign
          : self.rotation;
      moveX += Math.cos(patrolAngle);
      moveY += Math.sin(patrolAngle);
      if (!shooting && (!enemy || enemyDist > effectiveEngageRange)) {
        aimAngle = patrolAngle;
      }
    }

    // Translate the desired thrust vector into the 4-way key contract.
    const len = Math.hypot(moveX, moveY) || 1;
    const nx = moveX / len;
    const ny = moveY / len;

    return {
      up: ny < -KEY_THRESHOLD,
      down: ny > KEY_THRESHOLD,
      left: nx < -KEY_THRESHOLD,
      right: nx > KEY_THRESHOLD,
      aimAngle,
      shooting,
      sequence: ++this.sequence,
    };
  }

  private nearestEnemy(self: ShipState, ships: readonly ShipState[]): ShipState | null {
    let best: ShipState | null = null;
    let bestDist = Infinity;
    for (const ship of ships) {
      if (!ship.alive || ship.id === self.id) continue;
      const dist = this.distance(self.x, self.y, ship.x, ship.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = ship;
      }
    }
    return best;
  }

  private nearestPickup(
    self: ShipState,
    pickups: readonly PickupState[],
    maxRange: number,
  ): PickupState | null {
    let best: PickupState | null = null;
    let bestDist = maxRange;
    for (const pickup of pickups) {
      const dist = this.distance(self.x, self.y, pickup.x, pickup.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = pickup;
      }
    }
    return best;
  }

  private nearestAsteroid(
    self: ShipState,
    asteroids: readonly AsteroidState[],
    maxRange: number,
  ): AsteroidState | null {
    let best: AsteroidState | null = null;
    let bestDist = maxRange;
    for (const asteroid of asteroids) {
      const dist = this.distance(self.x, self.y, asteroid.x, asteroid.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = asteroid;
      }
    }
    return best;
  }

  private steerToward(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    weight: number,
  ): { x: number; y: number } {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    return { x: (dx / dist) * weight, y: (dy / dist) * weight };
  }

  private distance(ax: number, ay: number, bx: number, by: number): number {
    return Math.hypot(bx - ax, by - ay);
  }
}
