import React, { useState, useEffect } from 'react';
import type { RoomInfo } from '@lss/shared';
import { MAX_BOTS_PER_ROOM, SHIP_COLORS } from '@lss/shared';
import { QrCodeSvg } from './QrCodeSvg.js';

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
  const [copiedCode, setCopiedCode] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  const localPlayer = room.players.find((p) => p.id === localPlayerId);
  const isReady = localPlayer?.isReady ?? false;

  const shareUrl = `${window.location.origin}/?room=${room.code}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
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
        background: 'radial-gradient(ellipse at center, #0c122c 0%, #05050f 100%)',
        padding: 20,
        zIndex: 20,
      }}
    >
      <div
        className="glass-panel-glow"
        style={{
          width: '100%',
          maxWidth: 820,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '24px 32px',
          overflowY: 'auto',
          position: 'relative',
        }}
      >
        {/* Top Header: Room Code & Actions */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(34, 211, 238, 0.25)',
            paddingBottom: 16,
            marginBottom: 20,
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 2 }}>ORBITAL LOBBY CODE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <span
                onClick={copyCode}
                className="title-glow"
                style={{
                  fontSize: 32,
                  fontWeight: 900,
                  cursor: 'pointer',
                  letterSpacing: 6,
                }}
                title="Click to copy room code"
              >
                {room.code}
              </span>
              <button
                onClick={copyCode}
                className="btn-neon-outline"
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                {copiedCode ? 'COPIED!' : 'COPY CODE'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={copyLink}
              className="btn-neon-cyan"
              style={{ padding: '8px 16px', fontSize: 12 }}
            >
              {copiedLink ? '✓ LINK COPIED!' : '🔗 COPY JOIN LINK'}
            </button>
            <button
              onClick={onLeaveRoom}
              className="btn-neon-outline"
              style={{ padding: '8px 14px', fontSize: 12, borderColor: '#f43f5e', color: '#f43f5e' }}
            >
              LEAVE
            </button>
          </div>
        </div>

        {/* Content: Pilots List (Left) & QR Code / Match Settings (Right) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          {/* Left Column: Connected Pilots */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, fontSize: 12 }}>
              <span style={{ color: '#94a3b8', fontWeight: 'bold', letterSpacing: 1 }}>
                CONNECTED PILOTS ({room.players.length} / {room.maxPlayers})
              </span>
              <span style={{ color: '#22d3ee' }}>
                {room.players.filter((p) => p.isReady).length} READY
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {room.players.map((p) => {
                const colorHex = SHIP_COLORS[p.colorIndex % SHIP_COLORS.length] ?? '#22d3ee';
                const isMe = p.id === localPlayerId;

                return (
                  <div
                    key={p.id}
                    className="glass-panel"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderLeft: `4px solid ${colorHex}`,
                      background: isMe ? 'rgba(34, 211, 238, 0.08)' : 'rgba(15, 23, 42, 0.6)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: colorHex,
                          boxShadow: `0 0 8px ${colorHex}`,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: isMe ? 'bold' : 'normal',
                          color: isMe ? '#22d3ee' : '#f1f5f9',
                        }}
                      >
                        {p.displayName} {isMe && '(YOU)'}
                      </span>
                      {p.isHost && (
                        <span
                          style={{
                            fontSize: 10,
                            background: 'rgba(253, 224, 71, 0.15)',
                            color: '#fde047',
                            border: '1px solid rgba(253, 224, 71, 0.4)',
                            borderRadius: 3,
                            padding: '1px 5px',
                            fontWeight: 'bold',
                          }}
                        >
                          HOST
                        </span>
                      )}
                    </div>

                    <div>
                      {p.isReady ? (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#10b981',
                            fontWeight: 'bold',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: 'rgba(16, 185, 129, 0.1)',
                          }}
                        >
                          READY
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            color: '#94a3b8',
                            border: '1px solid rgba(148, 163, 184, 0.3)',
                            padding: '2px 8px',
                            borderRadius: 4,
                          }}
                        >
                          WAITING
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
                    color: '#64748b',
                    background: 'rgba(15, 23, 42, 0.3)',
                    border: '1px dashed rgba(100, 116, 139, 0.4)',
                    borderRadius: 4,
                    textAlign: 'center',
                  }}
                >
                  🤖 +{room.botCount} Autonomous AI Bot Pilots will deploy on launch
                </div>
              )}
            </div>
          </div>

          {/* Right Column: QR Code & Match Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Inline SVG QR Code Card for Mobile / Judge Join */}
            <div
              className="glass-panel"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1, marginBottom: 10 }}>
                SCAN TO JOIN INSTANTLY (MOBILE / JUDGE)
              </div>
              <div style={{ padding: 8, background: '#05050f', borderRadius: 8, border: '1px solid rgba(34, 211, 238, 0.3)' }}>
                <QrCodeSvg value={shareUrl} size={150} fgColor="#22d3ee" bgColor="#05050f" />
              </div>
              <div style={{ fontSize: 10, color: '#64748b', marginTop: 8 }}>
                Share code <span style={{ color: '#22d3ee' }}>{room.code}</span> or link with friends
              </div>
            </div>

            {/* Host Controls: AI Bot Count Slider */}
            {isHost && (
              <div className="glass-panel" style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 'bold' }}>
                    AI BOT PILOTS (0–{MAX_BOTS_PER_ROOM}):
                  </span>
                  <span style={{ fontSize: 14, color: '#22d3ee', fontWeight: 'bold' }}>
                    {room.botCount} BOTS
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={MAX_BOTS_PER_ROOM}
                  value={room.botCount}
                  onChange={(e) => onSetBotCount(parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: '#22d3ee', cursor: 'pointer' }}
                />
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
                  Total combatants: {room.players.length + room.botCount} ships
                </div>
              </div>
            )}

            {/* Bottom Launch / Ready Actions */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {isHost ? (
                <button
                  onClick={onStartMatch}
                  className="btn-neon-gold"
                  style={{ padding: '14px', fontSize: 15, letterSpacing: 2 }}
                >
                  🚀 LAUNCH MATCH
                </button>
              ) : (
                <button
                  onClick={() => onSetReady(!isReady)}
                  className={isReady ? 'btn-neon-outline' : 'btn-neon-cyan'}
                  style={{ padding: '14px', fontSize: 15, letterSpacing: 2 }}
                >
                  {isReady ? 'CANCEL READY' : 'SET READY'}
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
              backgroundColor: 'rgba(5, 5, 15, 0.9)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 30,
              borderRadius: 8,
            }}
          >
            <div
              className="countdown-pop title-glow"
              style={{
                fontSize: 90,
                fontWeight: 900,
                color: countdownSeconds === 0 ? '#10b981' : '#fde047',
              }}
            >
              {countdownSeconds > 0 ? countdownSeconds : 'ENGAGE!'}
            </div>
            <div style={{ fontSize: 14, color: '#94a3b8', letterSpacing: 3, marginTop: 12 }}>
              SYSTEMS ARMED · COMMENCING COMBAT
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
