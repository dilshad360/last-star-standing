import React from 'react';
import type { GameSnapshot, KillFeedEntry } from '@lss/shared';
import { SHIP_COLORS } from '@lss/shared';
import { QrCodeSvg } from '../components/QrCodeSvg.js';
import { Volume2Icon, VolumeXIcon } from '../components/icons.js';
import { useShareUrl } from './useShareUrl.js';

interface TvHudProps {
  roomCode: string;
  snapshot: GameSnapshot | null;
  muted: boolean;
  onToggleMute: () => void;
  onEndRound: () => void;
}

const formatClock = (ms: number) => {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const causeText = (entry: KillFeedEntry) => {
  if (entry.killerName) return `${entry.killerName} ✦ ${entry.victimName}`;
  return `${entry.victimName} lost to ${entry.cause.toLowerCase()}`;
};

/** Big-screen overlay: round timer, live scoreboard, kill feed, and a join QR for late arrivals. */
export const TvHud: React.FC<TvHudProps> = ({ roomCode, snapshot, muted, onToggleMute, onEndRound }) => {
  const share = useShareUrl(roomCode);
  const players = [...(snapshot?.players ?? [])].sort(
    (a, b) => b.kills - a.kills || a.deaths - b.deaths,
  );
  const colorOf = (id: string | null) =>
    SHIP_COLORS[players.find((p) => p.id === id)?.colorIndex ?? 0];
  const now = snapshot?.serverTime ?? Date.now();
  const urgent = (snapshot?.timeRemainingMs ?? Infinity) <= 30_000;

  return (
    <div className="tv-hud">
      <div className={`tv-timer ${urgent ? 'tv-timer-urgent' : ''}`}>
        {formatClock(snapshot?.timeRemainingMs ?? 0)}
      </div>

      <div className="tv-scoreboard cockpit-panel">
        <div className="tv-scoreboard-head">
          <span>PILOT</span>
          <span>K</span>
          <span>D</span>
        </div>
        {players.map((p, i) => (
          <div key={p.id} className={`tv-score-row ${p.alive ? '' : 'tv-score-dead'}`}>
            <span className="tv-rank">{i + 1}</span>
            <span className="host-swatch" style={{ background: SHIP_COLORS[p.colorIndex] }} />
            <span className="tv-score-name">
              {p.displayName}
              {!p.connected && <em> offline</em>}
              {p.connected && !p.alive && p.respawnAt !== null && (
                <em> {Math.max(0, Math.ceil((p.respawnAt - now) / 1000))}s</em>
              )}
            </span>
            <span>{p.kills}</span>
            <span>{p.deaths}</span>
          </div>
        ))}
      </div>

      <div className="tv-killfeed">
        {(snapshot?.killFeed ?? []).slice(-5).map((entry) => (
          <div key={entry.id} className="tv-kill" style={{ borderLeftColor: colorOf(entry.killerId ?? entry.victimId) }}>
            {causeText(entry)}
          </div>
        ))}
      </div>

      <div className="tv-join cockpit-panel">
        <QrCodeSvg value={share.url} size={110} />
        <div>
          <div className="host-eyebrow">JOIN</div>
          <div className="tv-join-code">{roomCode}</div>
        </div>
      </div>

      <div className="tv-controls">
        <button type="button" className="btn-neon-outline" onClick={onToggleMute} aria-label="Toggle sound">
          {muted ? <VolumeXIcon size={16} /> : <Volume2Icon size={16} />}
        </button>
        <button type="button" className="btn-neon-outline" onClick={onEndRound}>
          End round
        </button>
      </div>
    </div>
  );
};
