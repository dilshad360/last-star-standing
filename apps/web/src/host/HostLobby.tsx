import React, { useEffect, useState } from 'react';
import type { CountdownPayload, RoomInfo } from '@lss/shared';
import { MAX_BOTS_PER_ROOM, SHIP_COLORS, SHIP_COLOR_NAMES } from '@lss/shared';
import { QrCodeSvg } from '../components/QrCodeSvg.js';
import { AlertTriangleIcon, BotIcon, PlayIcon, UsersIcon } from '../components/icons.js';
import { SpaceBackground } from '../components/SpaceBackground.js';
import { soundManager } from '../game/audio/SoundManager.js';
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
  const [copied, setCopied] = useState(false);
  const humans = room.players.filter((p) => !p.isBot);
  const canStart = room.players.length >= 2 && room.status === 'LOBBY';
  const maxBots = Math.min(MAX_BOTS_PER_ROOM, room.maxPlayers - humans.length);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(share.url);
      setCopied(true);
      soundManager.playUiClick();
      setTimeout(() => setCopied(false), 2200);
    } catch {}
  };

  const handleStart = () => {
    soundManager.playUiStart();
    onStart();
  };

  return (
    <div className="host-screen host-lobby-screen">
      <SpaceBackground density="low" showGrid={false} />

      <div className="host-lobby">
        <section className="cockpit-panel host-qr-panel">
          <div className="panel-badge-top">COMMUNICATIONS LINK</div>
          <div className="host-eyebrow">SCAN WITH PHONE CAMERA</div>
          <div className="host-qr-frame">
            <QrCodeSvg value={share.url} size={260} />
          </div>

          <div className="host-eyebrow">OR OPEN URL</div>
          <div className="host-url-row">
            <span className="host-url">{share.url.replace(/^https?:\/\//, '').replace(/\/play.*/, '/play')}</span>
            <button
              type="button"
              className="btn-copy-link"
              onClick={copyLink}
              onMouseEnter={() => soundManager.playUiHover()}
              title="Copy join link"
            >
              {copied ? 'COPIED!' : 'COPY'}
            </button>
          </div>

          <div className="host-eyebrow">ROOM CODE</div>
          <div className="host-room-code title-glow">{room.code}</div>

          {share.hosts.length > 1 && (
            <label className="host-network-select">
              Network IP
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
              <AlertTriangleIcon size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
              Phones can't open "localhost". Open this page using your computer's LAN IP.
            </div>
          )}
        </section>

        <section className="cockpit-panel host-roster-panel">
          <header className="host-roster-header">
            <div className="roster-meta-tags">
              <span className="roster-tag">2400x2400 SECTOR</span>
              <span className="roster-tag live">LOBBY STAGING</span>
            </div>
            <h1 className="title-glow">HANGAR BAY // PILOTS</h1>
            <p>Free-for-all dogfight. Destroyed ships respawn in 3s. Most kills at timer end claims the crown.</p>
          </header>

          <div className="host-section-title">
            <UsersIcon size={18} /> DEPLOYED PILOTS ({room.players.length}/{room.maxPlayers})
          </div>
          <ul className="host-roster">
            {room.players.length === 0 && (
              <li className="host-roster-empty">
                <span className="pulsing-dot" /> Waiting for phones to scan the QR code…
              </li>
            )}
            {room.players.map((p) => (
              <li
                key={p.id}
                className="host-roster-item"
                style={{
                  borderColor: SHIP_COLORS[p.colorIndex],
                  boxShadow: `0 0 12px ${SHIP_COLORS[p.colorIndex]}22`,
                }}
              >
                <span
                  className="host-swatch"
                  style={{
                    background: SHIP_COLORS[p.colorIndex],
                    boxShadow: `0 0 8px ${SHIP_COLORS[p.colorIndex]}`,
                  }}
                />
                <span className="host-roster-name">{p.displayName}</span>
                <span className="host-roster-meta">
                  {p.isBot ? 'BOT' : p.isConnected ? SHIP_COLOR_NAMES[p.colorIndex] : 'reconnecting…'}
                </span>
              </li>
            ))}
          </ul>

          <div className="host-section-title">
            <BotIcon size={18} /> AI OPPONENTS
          </div>
          <div className="host-bot-row">
            <button
              type="button"
              className="btn-neon-outline bot-btn"
              disabled={room.botCount <= 0}
              onClick={() => {
                soundManager.playUiClick();
                onSetBotCount(room.botCount - 1);
              }}
              onMouseEnter={() => soundManager.playUiHover()}
            >
              −
            </button>
            <span className="host-bot-count title-glow">{room.botCount}</span>
            <button
              type="button"
              className="btn-neon-outline bot-btn"
              disabled={room.botCount >= maxBots}
              onClick={() => {
                soundManager.playUiClick();
                onSetBotCount(room.botCount + 1);
              }}
              onMouseEnter={() => soundManager.playUiHover()}
            >
              +
            </button>
            <span className="host-bot-desc">
              {room.botCount === 0 ? 'No AI bots in match' : `${room.botCount} autonomous AI starfighter${room.botCount > 1 ? 's' : ''}`}
            </span>
          </div>

          <div className="host-actions">
            <button
              type="button"
              className="btn-neon-cyan host-start"
              disabled={!canStart}
              onClick={handleStart}
              onMouseEnter={() => soundManager.playUiHover()}
            >
              <PlayIcon size={22} />
              <span>START MATCH</span>
            </button>
            <button
              type="button"
              className="btn-neon-outline"
              onClick={() => {
                soundManager.playUiClick();
                onClose();
              }}
              onMouseEnter={() => soundManager.playUiHover()}
            >
              Close room
            </button>
          </div>
          {!canStart && room.status === 'LOBBY' && (
            <div className="host-hint">Need at least 2 ships to begin. Add AI pilots or invite friends.</div>
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
