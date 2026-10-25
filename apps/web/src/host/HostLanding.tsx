import React, { useState } from 'react';
import { SpaceBackground } from '../components/SpaceBackground.js';
import { ShipHoloPreview } from '../components/ShipHoloPreview.js';
import { MenuDecorOverlay } from '../components/MenuDecorOverlay.js';
import { MissionIntelModal } from '../components/MissionIntelModal.js';
import { soundManager } from '../game/audio/SoundManager.js';
import { PlayIcon, HelpCircleIcon, SmartphoneIcon } from '../components/icons.js';

interface HostLandingProps {
  loading: boolean;
  onHostGame: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

export const HostLanding: React.FC<HostLandingProps> = ({
  loading,
  onHostGame,
  muted,
  onToggleMute,
}) => {
  const [intelOpen, setIntelOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const handleLaunch = () => {
    soundManager.init();
    soundManager.resume();
    soundManager.playUiStart();
    onHostGame();
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCode.trim().toUpperCase();
    if (clean.length === 4) {
      soundManager.playUiClick();
      window.location.href = `/play?room=${clean}`;
    }
  };

  return (
    <div className="host-screen host-landing-simple">
      {/* Background Starfield */}
      <SpaceBackground interactive density="normal" showGrid={false} />

      {/* Subtle Frame & Controls */}
      <MenuDecorOverlay isMuted={muted} onToggleSound={onToggleMute} />

      <main className="host-landing-panel cockpit-panel">
        <header className="landing-header">
          <h1 className="host-main-title title-glow">LAST STAR STANDING</h1>
          <p className="landing-subtitle">
            Free-for-all party arena. Connect up to 8 phones to pilot ships.
          </p>
        </header>

        <div className="landing-body">
          <div className="landing-ship-section">
            <ShipHoloPreview />
          </div>

          <div className="landing-controls-section">
            <button
              type="button"
              className="btn-neon-cyan landing-host-btn"
              disabled={loading}
              onClick={handleLaunch}
              onMouseEnter={() => soundManager.playUiHover()}
            >
              <PlayIcon size={20} />
              <span>{loading ? 'OPENING ROOM…' : 'HOST GAME'}</span>
            </button>

            <form className="landing-join-row" onSubmit={handleCodeSubmit}>
              <div className="join-input-wrap">
                <SmartphoneIcon size={16} color="var(--neon-cyan)" />
                <input
                  type="text"
                  className="landing-code-input"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 4))}
                  placeholder="CODE"
                  maxLength={4}
                  aria-label="Room code"
                />
              </div>
              <button
                type="submit"
                className="btn-neon-outline landing-join-btn"
                disabled={joinCode.trim().length !== 4}
                onMouseEnter={() => soundManager.playUiHover()}
              >
                JOIN
              </button>
            </form>

            <button
              type="button"
              className="btn-neon-outline landing-info-btn"
              onClick={() => {
                soundManager.playUiClick();
                setIntelOpen(true);
              }}
              onMouseEnter={() => soundManager.playUiHover()}
            >
              <HelpCircleIcon size={16} />
              <span>HOW TO PLAY</span>
            </button>
          </div>
        </div>
      </main>

      {/* Mission Intel Modal */}
      <MissionIntelModal isOpen={intelOpen} onClose={() => setIntelOpen(false)} />
    </div>
  );
};
