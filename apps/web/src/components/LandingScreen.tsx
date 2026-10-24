import React, { useState } from 'react';
import { ROOM_CODE_LENGTH } from '@lss/shared';
import { ControlsModal } from './ControlsModal.js';

interface LandingScreenProps {
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onQuickPlay: (botCount: number) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  initialRoomCode?: string;
  muted: boolean;
  onToggleMute: () => void;
  loading?: boolean;
  statusMessage?: string | null;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  displayName,
  onDisplayNameChange,
  onQuickPlay,
  onCreateRoom,
  onJoinRoom,
  initialRoomCode = '',
  muted,
  onToggleMute,
  loading = false,
  statusMessage,
}) => {
  const [joinCode, setJoinCode] = useState(initialRoomCode.toUpperCase());
  const [showControls, setShowControls] = useState(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'custom'>(initialRoomCode ? 'custom' : 'quick');
  const [quickBots, setQuickBots] = useState(5);

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length === ROOM_CODE_LENGTH) {
      onJoinRoom(code);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, #0c122c 0%, #05050f 100%)',
        padding: 16,
        zIndex: 20,
      }}
    >
      {/* Top action controls: Sound & Help */}
      <div style={{ position: 'absolute', top: 20, right: 24, display: 'flex', gap: 12 }}>
        <button
          onClick={() => setShowControls(true)}
          className="btn-neon-outline"
          style={{ padding: '6px 14px', fontSize: 13 }}
          title="View Flight Controls"
        >
          CONTROLS [?]
        </button>
        <button
          onClick={onToggleMute}
          className="btn-neon-outline"
          style={{ padding: '6px 14px', fontSize: 13 }}
        >
          {muted ? 'AUDIO: MUTED' : 'AUDIO: ON'}
        </button>
      </div>

      {/* Main Brand Logo Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <h1
          className="title-glow"
          style={{
            fontSize: 'clamp(28px, 6vw, 48px)',
            margin: '0 0 8px 0',
            fontWeight: 900,
          }}
        >
          LAST STAR STANDING
        </h1>
        <div style={{ fontSize: 13, color: '#94a3b8', letterSpacing: 3, textTransform: 'uppercase' }}>
          2D Multiplayer Space Battle Royale · 25 Hz Authoritative
        </div>
      </div>

      {/* Main Glassmorphism Interaction Card */}
      <div
        className="glass-panel-glow"
        style={{
          width: '100%',
          maxWidth: 440,
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
      >
        {/* Pilot Name Input */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: 12,
              color: '#94a3b8',
              marginBottom: 6,
              fontWeight: 'bold',
              letterSpacing: 1,
            }}
          >
            PILOT CALLSIGN
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="e.g. Maverick"
            maxLength={16}
            disabled={loading}
            style={{
              width: '100%',
              background: '#090d1f',
              border: '1px solid rgba(34, 211, 238, 0.4)',
              borderRadius: 4,
              color: '#f8fafc',
              fontSize: 16,
              fontFamily: 'inherit',
              padding: '10px 14px',
              outline: 'none',
              textAlign: 'center',
              boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.5)',
            }}
          />
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={activeTab === 'quick' ? 'btn-neon-cyan' : 'btn-neon-outline'}
            style={{ padding: '8px 12px', fontSize: 13 }}
          >
            QUICK PLAY
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={activeTab === 'custom' ? 'btn-neon-cyan' : 'btn-neon-outline'}
            style={{ padding: '8px 12px', fontSize: 13 }}
          >
            CUSTOM ROOM
          </button>
        </div>

        {/* Quick Play Tab */}
        {activeTab === 'quick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, textAlign: 'center' }}>
              Jump straight into a combat arena against autonomous AI bot pilots and live human contenders.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#cbd5e1' }}>AI Bot Pilots:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setQuickBots(Math.max(0, quickBots - 1))}
                  className="btn-neon-outline"
                  style={{ width: 28, height: 28, padding: 0 }}
                >
                  -
                </button>
                <span style={{ color: '#22d3ee', fontWeight: 'bold', width: 20, textAlign: 'center' }}>
                  {quickBots}
                </span>
                <button
                  type="button"
                  onClick={() => setQuickBots(Math.min(7, quickBots + 1))}
                  className="btn-neon-outline"
                  style={{ width: 28, height: 28, padding: 0 }}
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onQuickPlay(quickBots)}
              disabled={loading}
              className="btn-neon-cyan"
              style={{ padding: '14px 20px', fontSize: 16, marginTop: 4 }}
            >
              {loading ? 'CONNECTING...' : 'LAUNCH QUICK MATCH'}
            </button>
          </div>
        )}

        {/* Custom Room Tab */}
        {activeTab === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <button
              type="button"
              onClick={onCreateRoom}
              disabled={loading}
              className="btn-neon-cyan"
              style={{ padding: '12px 20px', fontSize: 14 }}
            >
              {loading ? 'INITIALIZING...' : 'CREATE NEW ROOM (HOST)'}
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                color: '#64748b',
                fontSize: 11,
                letterSpacing: 2,
              }}
            >
              <div style={{ flex: 1, height: 1, background: 'rgba(34, 211, 238, 0.2)' }} />
              <span>OR JOIN EXISTING</span>
              <div style={{ flex: 1, height: 1, background: 'rgba(34, 211, 238, 0.2)' }} />
            </div>

            <form onSubmit={handleJoinSubmit} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="4-CHAR CODE"
                maxLength={ROOM_CODE_LENGTH}
                disabled={loading}
                style={{
                  flex: 1,
                  background: '#090d1f',
                  border: '1px solid rgba(34, 211, 238, 0.4)',
                  borderRadius: 4,
                  color: '#f8fafc',
                  fontSize: 15,
                  letterSpacing: 3,
                  fontFamily: 'inherit',
                  padding: '10px 12px',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                disabled={loading || joinCode.trim().length !== ROOM_CODE_LENGTH}
                className="btn-neon-outline"
                style={{ padding: '10px 16px', fontSize: 13, fontWeight: 'bold' }}
              >
                JOIN
              </button>
            </form>
          </div>
        )}

        {/* Status Toast */}
        {statusMessage && (
          <div
            style={{
              fontSize: 12,
              color: '#fbbf24',
              textAlign: 'center',
              padding: '6px 12px',
              background: 'rgba(251, 191, 36, 0.1)',
              borderRadius: 4,
              border: '1px solid rgba(251, 191, 36, 0.3)',
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>

      {/* Controls Cheat-Sheet Modal */}
      <ControlsModal isOpen={showControls} onClose={() => setShowControls(false)} />
    </div>
  );
};
