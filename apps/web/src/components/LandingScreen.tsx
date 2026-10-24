import React, { useState } from 'react';
import { ROOM_CODE_LENGTH } from '@lss/shared';
import { ControlsModal } from './ControlsModal.js';
import {
  HelpCircleIcon,
  Volume2Icon,
  VolumeXIcon,
  PlayIcon,
  UserPlusIcon,
  BotIcon,
  UsersIcon,
  MaximizeIcon,
  MinimizeIcon,
} from './icons.js';

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

  const [isFullscreen, setIsFullscreen] = React.useState(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false
  );
  React.useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

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
        background: 'radial-gradient(ellipse at center, #09122c 0%, #03050e 100%)',
        padding: 16,
        overflowY: 'auto',
        zIndex: 20,
      }}
    >
      {/* Cockpit Canopy Frame & Brackets */}
      <div className="cockpit-visor-frame" />
      <div className="cockpit-bracket-tl" />
      <div className="cockpit-bracket-tr" />
      <div className="cockpit-bracket-bl" />
      <div className="cockpit-bracket-br" />

      {/* Top action controls: Fullscreen, Sound & Help */}
      <div
        style={{
          position: 'absolute',
          top: 'max(14px, env(safe-area-inset-top, 14px))',
          right: 'max(16px, env(safe-area-inset-right, 16px))',
          display: 'flex',
          gap: 8,
          zIndex: 10,
        }}
      >
        <button
          onClick={toggleFullscreen}
          className="btn-neon-outline"
          style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
          {isFullscreen ? 'Exit' : 'Full'}
        </button>
        <button
          onClick={() => setShowControls(true)}
          className="btn-neon-outline"
          style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          title="View Flight Controls"
        >
          <HelpCircleIcon size={14} />
          Controls
        </button>
        <button
          onClick={onToggleMute}
          className="btn-neon-outline"
          style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {muted ? <VolumeXIcon size={14} /> : <Volume2Icon size={14} />}
          {muted ? 'Muted' : 'Sound'}
        </button>
      </div>

      {/* Main Brand Logo Header */}
      <div style={{ textAlign: 'center', marginBottom: 20, zIndex: 10, marginTop: 'auto' }}>
        <div style={{ fontSize: 11, color: '#f97316', letterSpacing: 3, fontWeight: 'bold', marginBottom: 6 }}>
          2D MULTIPLAYER SPACE BATTLE ROYALE
        </div>
        <h1
          className="title-glow"
          style={{
            fontSize: 'clamp(26px, 7vw, 46px)',
            margin: '0 0 6px 0',
            fontWeight: 900,
          }}
        >
          LAST STAR STANDING
        </h1>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          Steer with A/D · Thrust with W/S · Space to Shoot · On-screen controls on Mobile
        </div>
      </div>

      {/* Main Interaction Card */}
      <div
        className="cockpit-panel-glow"
        style={{
          width: '100%',
          maxWidth: 'min(440px, 94vw)',
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          zIndex: 10,
          marginBottom: 'auto',
        }}
      >
        {/* Pilot Name Input */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <label
              style={{
                fontSize: 12,
                color: '#cbd5e1',
                fontWeight: 'bold',
              }}
            >
              Player Name
            </label>
            <span style={{ fontSize: 11, color: '#f97316' }}>Ready to Launch</span>
          </div>
          <input
            type="text"
            value={displayName}
            onChange={(e) => onDisplayNameChange(e.target.value)}
            placeholder="e.g. StarPilot"
            maxLength={16}
            disabled={loading}
            style={{
              width: '100%',
              background: '#060a1a',
              border: '1px solid rgba(249, 115, 22, 0.4)',
              borderRadius: 4,
              color: '#f8fafc',
              fontSize: 16,
              fontFamily: 'inherit',
              padding: '10px 14px',
              outline: 'none',
              textAlign: 'center',
              letterSpacing: 1,
              boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.6)',
            }}
          />
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={activeTab === 'quick' ? 'btn-neon-orange' : 'btn-neon-outline'}
            style={{ padding: '8px 12px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <BotIcon size={14} /> Play vs Bots
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={activeTab === 'custom' ? 'btn-neon-orange' : 'btn-neon-outline'}
            style={{ padding: '8px 12px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <UsersIcon size={14} /> Custom Room
          </button>
        </div>

        {/* Quick Play Tab */}
        {activeTab === 'quick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5, textAlign: 'center' }}>
              Jump straight into battle against intelligent AI pilots.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#cbd5e1' }}>Number of AI Bots:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setQuickBots(Math.max(0, quickBots - 1))}
                  className="btn-neon-outline"
                  style={{ width: 28, height: 28, padding: 0 }}
                >
                  -
                </button>
                <span style={{ color: '#f97316', fontWeight: 'bold', width: 20, textAlign: 'center' }}>
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
              disabled={loading || !displayName.trim()}
              className="btn-neon-orange"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: 16,
                marginTop: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <PlayIcon size={16} />
              {loading ? 'Starting Match...' : 'Start Game'}
            </button>
          </div>
        )}

        {/* Custom Room Tab */}
        {activeTab === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <button
              type="button"
              onClick={onCreateRoom}
              disabled={loading || !displayName.trim()}
              className="btn-neon-orange"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <UserPlusIcon size={16} />
              {loading ? 'Creating...' : 'Create New Room'}
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#64748b',
                fontSize: 11,
              }}
            >
              <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
              <span>OR JOIN EXISTING ROOM</span>
              <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
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
                  background: '#060a1a',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: 4,
                  color: '#f8fafc',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  padding: '10px 12px',
                  outline: 'none',
                  textAlign: 'center',
                  letterSpacing: 3,
                }}
              />
              <button
                type="submit"
                disabled={loading || joinCode.length !== ROOM_CODE_LENGTH}
                className="btn-neon-outline"
                style={{
                  padding: '10px 18px',
                  fontSize: 13,
                }}
              >
                Join
              </button>
            </form>
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 4,
              fontSize: 12,
              color: '#38bdf8',
              textAlign: 'center',
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>

      <ControlsModal isOpen={showControls} onClose={() => setShowControls(false)} />
    </div>
  );
};
