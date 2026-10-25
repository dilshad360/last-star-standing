import { useEffect } from 'react';
import { soundManager } from '../game/audio/SoundManager.js';
import {
  WifiIcon,
  SmartphoneIcon,
  CrosshairIcon,
  ZapIcon,
  XIcon,
} from './icons.js';

interface MissionIntelModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MissionIntelModal({ isOpen, onClose }: MissionIntelModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="cockpit-panel modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div className="modal-tag">BRIEFING // INSTRUCTIONS</div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={() => {
              soundManager.playUiClick();
              onClose();
            }}
            onMouseEnter={() => soundManager.playUiHover()}
            aria-label="Close modal"
          >
            <XIcon size={18} />
          </button>
        </div>

        <h2 id="modal-title" className="modal-title title-glow">
          HOW TO PLAY
        </h2>

        <div className="modal-grid">
          <div className="briefing-card">
            <div className="briefing-icon"><WifiIcon size={22} color="var(--neon-cyan)" /></div>
            <div className="briefing-step">01. HOST A ROOM</div>
            <h3>Open on this Device</h3>
            <p>
              Click Host Game to open the room. The server runs authoritative 25Hz physics simulation and synth audio.
            </p>
          </div>

          <div className="briefing-card">
            <div className="briefing-icon"><SmartphoneIcon size={22} color="var(--neon-cyan)" /></div>
            <div className="briefing-step">02. JOIN FROM PHONE</div>
            <h3>Scan QR Code</h3>
            <p>
              Up to 8 players scan the QR code with their phone camera or enter the 4-letter room code.
            </p>
          </div>

          <div className="briefing-card">
            <div className="briefing-icon"><CrosshairIcon size={22} color="var(--neon-cyan)" /></div>
            <div className="briefing-step">03. FLIGHT CONTROLS</div>
            <h3>Touch Controls</h3>
            <p>
              Steer using the digital thumbstick. Tap Fire for plasma bursts and Boost for speed.
            </p>
          </div>

          <div className="briefing-card">
            <div className="briefing-icon"><ZapIcon size={22} color="var(--neon-cyan)" /></div>
            <div className="briefing-step">04. SAFE ZONE</div>
            <h3>Cosmic Storm</h3>
            <p>
              Stay inside the shrinking safe circle. Destroyed ships respawn after 3s. Most kills wins.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn-neon-cyan modal-action-btn"
            onClick={() => {
              soundManager.playUiClick();
              onClose();
            }}
            onMouseEnter={() => soundManager.playUiHover()}
          >
            GOT IT
          </button>
        </div>
      </div>
    </div>
  );
}
