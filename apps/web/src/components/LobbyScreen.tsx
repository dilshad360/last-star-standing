import React, { useState, useEffect } from 'react';
import type { RoomInfo } from '@lss/shared';
import { MAX_BOTS_PER_ROOM, SHIP_COLORS } from '@lss/shared';
import { QrCodeSvg } from './QrCodeSvg.js';
import { CopyIcon, CheckIcon, UsersIcon, BotIcon, PlayIcon } from './icons.js';

interface LobbyScreenProps {
  room: RoomInfo;
  localPlayerId: string;
  isHost: boolean;
  onSetReady: (ready: boolean) => void;
  onSetBotCount: (count: number) => void;
  onStartMatch: () => void;
  onLeaveRoom: () => void;
  countdown: { startsAt: number; durationMs: number } | null;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  localPlayerId,
  isHost,
  onSetReady,
  onSetBotCount,
  onStartMatch,
  onLeaveRoom,
  countdown,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  const localPlayer = room.players.find((p) => p.id === localPlayerId);
  const isReady = localPlayer?.isReady ?? false;

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const [selectedHost, setSelectedHost] = useState(isLocalhost ? '10.10.19.145' : window.location.hostname);
  const [availableIps, setAvailableIps] = useState<string[]>([
    isLocalhost ? '10.10.19.145' : window.location.hostname,
    '192.168.137.1',
  ]);

  useEffect(() => {
    fetch('http://localhost:3001/api/network')
      .then((res) => res.json())
      .then((data: { ips?: Array<{ name: string; ip: string }> }) => {
        if (data.ips && data.ips.length > 0) {
          const list = data.ips.map((i) => i.ip);
          setAvailableIps(list);
          if (isLocalhost && !list.includes(selectedHost)) {
            const wifi = list.find((ip) => ip.startsWith('10.'));
            setSelectedHost(wifi ?? list[0]);
          }
        }
      })
      .catch(() => {
        // Fallback already preset
      });
  }, [isLocalhost, selectedHost]);

  const networkPort = window.location.port ? `:${window.location.port}` : '';
  const networkOrigin = `${window.location.protocol}//${selectedHost}${networkPort}`;
  const shareUrl = `${networkOrigin}/?room=${room.code}`;

  const copyToClipboard = async (text: string): Promise<boolean> => {
    // 1. Try modern Clipboard API if supported and in secure context
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // Fall through to fallback
      }
    }

    // 2. Reliable cross-browser fallback for HTTP LAN IPs and mobile browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.top = '0';
      textArea.style.left = '0';
      textArea.style.width = '2em';
      textArea.style.height = '2em';
      textArea.style.padding = '0';
      textArea.style.border = 'none';
      textArea.style.outline = 'none';
      textArea.style.boxShadow = 'none';
      textArea.style.background = 'transparent';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      textArea.setSelectionRange(0, 99999);
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('Copy fallback failed:', err);
      return false;
    }
  };

  const copyLink = async () => {
    const ok = await copyToClipboard(shareUrl);
    if (ok) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Animate 3-2-1 countdown
  useEffect(() => {
    if (!countdown) {
      setCountdownSeconds(null);
      return;
    }

    const interval = setInterval(() => {
      const remaining = Math.max(0, countdown.startsAt - Date.now());
      const sec = Math.ceil(remaining / 1000);
      setCountdownSeconds(sec);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [countdown]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, #09122c 0%, #03050e 100%)',
        padding: 20,
        zIndex: 20,
      }}
    >
      {/* Cockpit Canopy Frame & Brackets */}
      <div className="cockpit-visor-frame" />
      <div className="cockpit-bracket-tl" />
      <div className="cockpit-bracket-tr" />
      <div className="cockpit-bracket-bl" />
      <div className="cockpit-bracket-br" />

      <div
        className="cockpit-panel-glow"
        style={{
          width: '100%',
          maxWidth: 820,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 30px',
          overflowY: 'auto',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Top Header: Room Code & Actions */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            paddingBottom: 16,
            marginBottom: 20,
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: '#f97316', letterSpacing: 2, fontWeight: 'bold' }}>
              {room.isCustom ? 'CUSTOM ROOM' : 'SOLO VS BOTS'}
            </div>
            <div
              className="title-glow"
              style={{
                fontSize: 32,
                fontWeight: 900,
                letterSpacing: 6,
                marginTop: 2,
              }}
            >
              {room.isCustom ? room.code : 'SIMULATION GRID'}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {room.isCustom && (
              <button
                onClick={copyLink}
                className="btn-neon-orange"
                style={{ padding: '8px 16px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {copiedLink ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
                {copiedLink ? 'Link Copied!' : 'Copy Invite Link'}
              </button>
            )}
            <button
              onClick={onLeaveRoom}
              className="btn-neon-outline"
              style={{ padding: '8px 14px', fontSize: 12, borderColor: '#ef4444', color: '#ef4444' }}
            >
              Leave Room
            </button>
          </div>
        </div>

        {/* Content: Pilots List (Left) & QR Code / Match Settings (Right) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {/* Left Column: Connected Players */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 12, alignItems: 'center' }}>
              <span style={{ color: '#94a3b8', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                <UsersIcon size={14} color="#f97316" /> Players ({room.players.length} / {room.maxPlayers})
              </span>
              <span style={{ color: '#22c55e', fontWeight: 600 }}>
                {room.players.filter((p) => p.isReady).length} Ready
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {room.players.map((p) => {
                const colorHex = SHIP_COLORS[p.colorIndex % SHIP_COLORS.length] ?? '#38bdf8';
                const isMe = p.id === localPlayerId;

                return (
                  <div
                    key={p.id}
                    className="cockpit-panel"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderLeft: `4px solid ${colorHex}`,
                      background: isMe ? 'rgba(56, 189, 248, 0.10)' : 'rgba(10, 16, 36, 0.7)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: colorHex,
                          boxShadow: `0 0 8px ${colorHex}`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: isMe ? 'bold' : 'normal',
                          color: isMe ? '#38bdf8' : '#f1f5f9',
                        }}
                      >
                        {p.displayName} {isMe && '(You)'}
                      </span>
                      {p.isHost && (
                        <span
                          style={{
                            fontSize: 10,
                            background: 'rgba(249, 115, 22, 0.15)',
                            color: '#f97316',
                            border: '1px solid rgba(249, 115, 22, 0.4)',
                            borderRadius: 2,
                            padding: '1px 5px',
                            fontWeight: 'bold',
                          }}
                        >
                          Host
                        </span>
                      )}
                    </div>

                    <div>
                      {p.isReady ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#22c55e',
                            fontWeight: 'bold',
                            border: '1px solid rgba(34, 197, 94, 0.4)',
                            padding: '2px 8px',
                            borderRadius: 2,
                            background: 'rgba(34, 197, 94, 0.1)',
                          }}
                        >
                          Ready
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#94a3b8',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            padding: '2px 8px',
                            borderRadius: 2,
                          }}
                        >
                          Waiting
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Bot Slots Placeholder Indicator */}
              {room.botCount > 0 && (
                <div
                  style={{
                    padding: '8px 14px',
                    fontSize: 12,
                    color: '#94a3b8',
                    background: 'rgba(10, 16, 36, 0.4)',
                    border: '1px dashed rgba(100, 116, 139, 0.4)',
                    borderRadius: 4,
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <BotIcon size={14} color="#f97316" /> +{room.botCount} AI Bots will join when match starts
                </div>
              )}
            </div>
          </div>

          {/* Right Column: QR Code (for custom rooms) or Bot Mission Briefing (for bot play) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {room.isCustom ? (
              /* High-visibility QR Code Card for Mobile / Secondary Players */
              <div
                className="cockpit-panel"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '18px 16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1.5, marginBottom: 12, fontWeight: 700 }}>
                  SCAN TO JOIN ON MOBILE
                </div>

                {/* High-contrast solid white frame without colored borders for instantaneous camera recognition */}
                <div
                  style={{
                    padding: 10,
                    background: '#ffffff',
                    borderRadius: 10,
                    boxShadow: '0 0 24px rgba(34, 211, 238, 0.45), 0 8px 24px rgba(0, 0, 0, 0.7)',
                    display: 'inline-block',
                  }}
                >
                  <QrCodeSvg
                    value={shareUrl}
                    size={typeof window !== 'undefined' && window.innerWidth < 480 ? 150 : 190}
                  />
                </div>

                {/* Direct share URL text */}
                <div
                  style={{
                    fontSize: 11,
                    color: '#38bdf8',
                    marginTop: 12,
                    letterSpacing: 0.5,
                    wordBreak: 'break-all',
                    maxWidth: 240,
                  }}
                >
                  {shareUrl}
                </div>

                {/* Network interface selector if multiple are available on host */}
                {availableIps.length > 1 && isLocalhost && (
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
                    <span>Host IP:</span>
                    <select
                      value={selectedHost}
                      onChange={(e) => setSelectedHost(e.target.value)}
                      style={{
                        background: '#09122c',
                        color: '#f8fafc',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      {availableIps.map((ip) => (
                        <option key={ip} value={ip}>
                          {ip} {ip.startsWith('10.') ? '(Wi-Fi)' : ip.startsWith('192.168.137') ? '(Hotspot)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            ) : (
              /* Bot Mission Briefing Panel */
              <div
                className="cockpit-panel"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '28px 20px',
                  textAlign: 'center',
                  gap: 12,
                }}
              >
                <div style={{ fontSize: 11, color: '#f97316', letterSpacing: 2, fontWeight: 700 }}>
                  TACTICAL MISSION BRIEFING
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8' }}>
                  ORBITAL AI ADVERSARIES
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, maxWidth: 300 }}>
                  Engaging {room.botCount} simulated combat pilots. Out-maneuver enemy trajectories, grab power-ups, and stay inside the shrinking safe zone.
                </div>
                <div
                  style={{
                    padding: '8px 16px',
                    borderRadius: 4,
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    color: '#22c55e',
                    fontSize: 12,
                    fontWeight: 'bold',
                    marginTop: 6,
                  }}
                >
                  {countdownSeconds !== null ? `LAUNCH IN ${countdownSeconds}s…` : 'SIMULATION PRIMED'}
                </div>
              </div>
            )}

            {/* Host Controls: AI Bot Count Slider */}
            {isHost && (
              <div className="cockpit-panel" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BotIcon size={14} color="#f97316" /> AI Bots (0–{MAX_BOTS_PER_ROOM}):
                  </span>
                  <span style={{ fontSize: 13, color: '#f97316', fontWeight: 'bold' }}>
                    {room.botCount} Bots
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={MAX_BOTS_PER_ROOM}
                  value={room.botCount}
                  onChange={(e) => onSetBotCount(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: '#f97316', cursor: 'pointer' }}
                />
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Total players in arena: {room.players.length + room.botCount}
                </div>
              </div>
            )}

            {/* Bottom Launch / Ready Actions */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {isHost ? (
                <button
                  onClick={onStartMatch}
                  className="btn-neon-orange"
                  style={{ padding: '14px', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <PlayIcon size={16} /> Start Game
                </button>
              ) : (
                <button
                  onClick={() => onSetReady(!isReady)}
                  className={isReady ? 'btn-neon-outline' : 'btn-neon-orange'}
                  style={{ padding: '14px', fontSize: 15 }}
                >
                  {isReady ? 'Cancel Ready' : "I'm Ready"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 3-2-1 Countdown Overlay */}
        {countdownSeconds !== null && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(3, 5, 14, 0.92)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 30,
              borderRadius: 4,
            }}
          >
            <div
              className="countdown-pop title-glow"
              style={{
                fontSize: 88,
                fontWeight: 900,
                color: countdownSeconds === 0 ? '#22c55e' : '#f97316',
              }}
            >
              {countdownSeconds > 0 ? countdownSeconds : 'GO!'}
            </div>
            <div style={{ fontSize: 13, color: '#94a3b8', letterSpacing: 2, marginTop: 12 }}>
              Launching into arena...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
