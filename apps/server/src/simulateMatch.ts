/**
 * Headless multi-bot match runner.
 *
 * Usage:
 *   npm run simulate:match --workspace=@lss/server -- [ships] [seed]
 *
 * Runs a full authoritative battle-royale match with AI Bot Pilots and prints
 * periodic status, cosmic events, the kill feed, and the final scoreboard.
 */
import type {
  CosmicEventState,
  GameSnapshot,
  KillFeedEntry,
  MatchResult,
  PlayerInput,
} from '@lss/shared';
import { MATCH_TIMEOUT_MS, TICK_INTERVAL_MS } from '@lss/shared';
import {
  WorldSimulation,
  type SimulationHost,
  type SimulationRosterEntry,
} from './game/WorldSimulation.js';

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
const shipCount = Math.max(2, Math.min(8, Number(process.argv[2] ?? 6) || 6));
const seed = Number(process.argv[3] ?? Date.now() % 100_000);

const fmt = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

class HeadlessHost implements SimulationHost {
  readonly roomCode = 'SIM';
  result: MatchResult | null = null;
  private lastReportSecond = -1;

  constructor(private readonly roster: SimulationRosterEntry[]) {}

  listRoster(): SimulationRosterEntry[] {
    return this.roster;
  }
  getInput(_playerId: string): PlayerInput | null {
    return null;
  }
  isConnected(): boolean {
    return true;
  }
  emitSnapshot(snapshot: GameSnapshot): void {
    const second = Math.floor(snapshot.matchElapsedMs / 5000);
    if (second > this.lastReportSecond) {
      this.lastReportSecond = second;
      const zone = snapshot.safeZone;
      const event = snapshot.cosmicEvent;
      console.log(
        `[t=${fmt(snapshot.matchElapsedMs)}] alive=${snapshot.aliveCount} ` +
          `zone r=${Math.round(zone.radius)}${zone.isShrinking ? ' (shrinking)' : ''} ` +
          `projectiles=${snapshot.projectiles.length} ` +
          `asteroids=${snapshot.asteroids.length} pickups=${snapshot.pickups.length}` +
          (event ? ` | event=${event.type}` : ''),
      );
    }
  }
  emitElimination(entry: KillFeedEntry): void {
    const killer = entry.killerName ?? 'the void';
    console.log(`  💥 ${entry.victimName} eliminated by ${killer} (${entry.cause})`);
  }
  emitCosmicEvent(event: CosmicEventState): void {
    console.log(`  ☄️  COSMIC EVENT INCOMING: ${event.type}`);
  }
  finishMatch(result: MatchResult): void {
    this.result = result;
  }
}

const roster: SimulationRosterEntry[] = Array.from({ length: shipCount }, (_, i) => ({
  id: `bot-sim-${i}`,
  displayName: `${BOT_NAMES[i % BOT_NAMES.length]} [BOT]`,
  isBot: true,
  colorIndex: i,
}));

const host = new HeadlessHost(roster);
const sim = new WorldSimulation(host, {
  manual: true,
  rng: mulberry32(seed),
  startTimeMs: 0,
});

console.log(`═══ Last Star Standing — headless simulation ═══`);
console.log(`ships=${shipCount} seed=${seed} tick=${TICK_INTERVAL_MS}ms\n`);
sim.start();

const maxTicks = Math.ceil((MATCH_TIMEOUT_MS * 1.2) / TICK_INTERVAL_MS);
let ticks = 0;
const t0 = performance.now();
while (!host.result && ticks < maxTicks) {
  sim.step();
  ticks++;
}
const wallMs = performance.now() - t0;

if (!host.result) {
  console.error('\nMatch did not resolve within the tick budget.');
  process.exit(1);
}

const result = host.result;
console.log(`\n═══ MATCH RESULT ═══`);
console.log(
  `Winner: ${result.winnerName ?? 'none'} | reason=${result.endReason} | ` +
    `duration=${fmt(result.durationMs)}`,
);
console.log(`\n  #  Pilot              Kills  Damage  Survival`);
for (const s of result.stats) {
  console.log(
    `  ${s.placement}  ${s.displayName.padEnd(18)} ${String(s.kills).padEnd(6)} ` +
      `${String(s.damageDealt).padEnd(8)} ${fmt(s.survivalTimeMs)}`,
  );
}
console.log(
  `\nSimulated ${ticks} ticks (${fmt(ticks * TICK_INTERVAL_MS)} match time) in ` +
    `${wallMs.toFixed(0)}ms wall time.`,
);
