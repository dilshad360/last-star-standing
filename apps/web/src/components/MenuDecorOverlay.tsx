import { useState } from 'react';
import { soundManager } from '../game/audio/SoundManager.js';
import {
  Volume2Icon,
  VolumeXIcon,
  MaximizeIcon,
  MinimizeIcon,
} from './icons.js';

interface MenuDecorOverlayProps {
  onToggleSound?: () => void;
  isMuted?: boolean;
}

export function MenuDecorOverlay({ onToggleSound, isMuted = false }: MenuDecorOverlayProps) {
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));

  const toggleFullscreen = () => {
    soundManager.playUiClick();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  return (
    <div className="menu-decor-overlay" aria-hidden="true">
      {/* Corner Brackets */}
      <div className="decor-corner decor-tl">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M0 32V2H30" stroke="var(--neon-cyan)" strokeWidth="1.5" />
          <circle cx="2" cy="2" r="1.5" fill="var(--neon-cyan)" />
        </svg>
      </div>

      <div className="decor-corner decor-tr">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M32 32V2H2" stroke="var(--neon-cyan)" strokeWidth="1.5" />
          <circle cx="30" cy="2" r="1.5" fill="var(--neon-cyan)" />
        </svg>
      </div>

      <div className="decor-corner decor-bl">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M0 0V30H30" stroke="var(--neon-cyan)" strokeWidth="1.5" />
          <circle cx="2" cy="30" r="1.5" fill="var(--neon-cyan)" />
        </svg>
      </div>

      <div className="decor-corner decor-br">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <path d="M32 0V30H2" stroke="var(--neon-cyan)" strokeWidth="1.5" />
          <circle cx="30" cy="30" r="1.5" fill="var(--neon-cyan)" />
        </svg>
      </div>

      {/* Top Header Bar */}
      <div className="menu-top-bar">
        <div className="menu-sys-status">
          <span className="status-blinker" />
          <span className="status-label">READY</span>
          <span className="status-divider">/</span>
          <span className="status-sub">UP TO 8 PLAYERS</span>
        </div>

        <div className="menu-audio-controls">
          {onToggleSound && (
            <button
              type="button"
              className={`menu-ctrl-btn ${isMuted ? 'muted' : ''}`}
              onClick={() => {
                soundManager.playUiClick();
                onToggleSound();
              }}
              onMouseEnter={() => soundManager.playUiHover()}
              title="Toggle Audio"
            >
              {isMuted ? <VolumeXIcon size={14} /> : <Volume2Icon size={14} />}
              <span>{isMuted ? 'MUTED' : 'SFX'}</span>
            </button>
          )}

          <button
            type="button"
            className="menu-ctrl-btn"
            onClick={toggleFullscreen}
            onMouseEnter={() => soundManager.playUiHover()}
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
