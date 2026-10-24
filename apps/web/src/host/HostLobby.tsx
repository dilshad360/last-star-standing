import React, { useEffect, useState } from 'react';
import type { CountdownPayload, RoomInfo } from '@lss/shared';
import { MAX_BOTS_PER_ROOM, SHIP_COLORS, SHIP_COLOR_NAMES } from '@lss/shared';
import { QrCodeSvg } from '../components/QrCodeSvg.js';
import { BotIcon, PlayIcon, UsersIcon } from '../components/icons.js';
import { useShareUrl } from './useShareUrl.js';

interface HostLobbyProps {
  room: RoomInfo;
  countdown: CountdownPayload | null;
  onSetBotCount: (count: number) => void;
  onStart: () => void;
  onClose: () => void;
}

export const HostLobby: React.FC<HostLobbyProps> = ({
  room,
  countdown,
  onSetBotCount,
  onStart,
  onClose,
}) => {
  const share = useShareUrl(room.code);
  const humans = room.players.filter((p) => !p.isBot);
  const canStart = room.players.length >= 2 && room.status === 'LOBBY';
  const maxBots = Math.min(MAX_BOTS_PER_ROOM, room.maxPlayers - humans.length);

  return (
    <div className="host-screen">
      <div className="host-lobby">
        <section className="cockpit-panel host-qr-panel">
          <div className="host-eyebrow">SCAN TO JOIN</div>
          <div className="host-qr-frame">
            <QrCodeSvg value={share.url} size={300} />
          </div>
          <div className="host-eyebrow">OR OPEN</div>
          <div className="host-url">{share.url.replace(/^https?:\/\//, '').replace(/\/play.*/, '/play')}</div>
          <div className="host-eyebrow">ROOM CODE</div>
          <div className="host-room-code title-glow">{room.code}</div>
          {share.hosts.length > 1 && (
            <label className="host-network-select">
              Network
              <select value={share.selectedHost} onChange={(e) => share.selectHost(e.target.value)}>
                {share.hosts.map((host) => (
                  <option key={host} value={host}>
                    {host}
                  </option>
                ))}
              </select>
            </label>
          )}
          {share.unreachable && (
            <div className="host-warning">
              Phones can't open "localhost". Open this page using your computer's network IP.
            </div>
          )}
        </section>

        <section className="cockpit-panel host-roster-panel">
          <header className="host-roster-header">
            <h1 className="title-glow">LAST STAR STANDING</h1>
            <p>Free-for-all. Destroyed ships respawn. Most kills when the timer ends wins.</p>
          </header>

          <div className="host-section-title">
            <UsersIcon size={18} /> PILOTS {room.players.length}/{room.maxPlayers}
          </div>
          <ul className="host-roster">
            {room.players.length === 0 && (
              <li className="host-roster-empty">Waiting for phones to scan the QR code…</li>
            )}
            {room.players.map((p) => (
              <li key={p.id} className="host-roster-item" style={{ borderColor: SHIP_COLORS[p.colorIndex] }}>
                <span className="host-swatch" style={{ background: SHIP_COLORS[p.colorIndex] }} />
                <span className="host-roster-name">{p.displayName}</span>
                <span className="host-roster-meta">
                  {p.isBot ? 'AI' : p.isConnected ? SHIP_COLOR_NAMES[p.colorIndex] : 'reconnecting…'}
                </span>
              </li>
            ))}
          </ul>

          <div className="host-section-title">
            <BotIcon size={18} /> AI PILOTS
          </div>
          <div className="host-bot-row">
            <button
              type="button"
              className="btn-neon-outline"
              disabled={room.botCount <= 0}
              onClick={() => onSetBotCount(room.botCount - 1)}
            >
              −
            </button>
            <span className="host-bot-count">{room.botCount}</span>
            <button
              type="button"
              className="btn-neon-outline"
              disabled={room.botCount >= maxBots}
              onClick={() => onSetBotCount(room.botCount + 1)}
            >
              +
            </button>
          </div>

          <div className="host-actions">
            <button type="button" className="btn-neon-cyan host-start" disabled={!canStart} onClick={onStart}>
              <PlayIcon size={20} /> START MATCH
            </button>
            <button type="button" className="btn-neon-outline" onClick={onClose}>
              Close room
            </button>
          </div>
          {!canStart && room.status === 'LOBBY' && (
            <div className="host-hint">Need at least 2 ships. Add AI pilots to play solo.</div>
          )}
        </section>
      </div>
      {countdown && <CountdownOverlay countdown={countdown} />}
    </div>
  );
};

export const CountdownOverlay: React.FC<{ countdown: CountdownPayload }> = ({ countdown }) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((countdown.startsAt - now) / 1000));
  return (
    <div className="host-countdown">
      <div key={seconds} className="countdown-pop title-glow">
        {seconds > 0 ? seconds : 'GO!'}
      </div>
    </div>
  );
};
