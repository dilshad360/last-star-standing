import React from 'react';

interface ControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ControlsModal: React.FC<ControlsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 5, 15, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="glass-panel-glow"
        style={{
          maxWidth: 520,
          width: '100%',
          padding: '24px 28px',
          color: '#e2e8f0',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#22d3ee', letterSpacing: 2 }}>
            TACTICAL FLIGHT CONTROLS
          </h2>
          <button
            onClick={onClose}
            className="btn-neon-outline"
            style={{ padding: '4px 10px', fontSize: 14 }}
          >
            ✕
          </button>
        </div>

        {/* Desktop Controls */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 'bold', marginBottom: 8, letterSpacing: 1 }}>
            DESKTOP / LAPTOP
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px', fontSize: 13 }}>
            <span style={{ color: '#22d3ee' }}>W / Up Arrow</span>
            <span>Main Thruster Acceleration</span>

            <span style={{ color: '#22d3ee' }}>A / D (or ◀ / ▶)</span>
            <span>Lateral Strafe Maneuver</span>

            <span style={{ color: '#22d3ee' }}>S / Down Arrow</span>
            <span>Reverse Thrusters / Deceleration</span>

            <span style={{ color: '#22d3ee' }}>Mouse Movement</span>
            <span>Direct World-Space Ship Aiming</span>

            <span style={{ color: '#22d3ee' }}>Left Click / Space</span>
            <span>Fire Plasma Blaster Cannons</span>

            <span style={{ color: '#22d3ee' }}>M Key</span>
            <span>Toggle Procedural Audio Mute</span>
          </div>
        </div>

        {/* Mobile Controls */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 'bold', marginBottom: 8, letterSpacing: 1 }}>
            MOBILE / TOUCHSCREEN
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px 12px', fontSize: 13 }}>
            <span style={{ color: '#f472b6' }}>Left Screen Half</span>
            <span>Virtual Directional Joystick</span>

            <span style={{ color: '#f472b6' }}>Right Screen Half</span>
            <span>Touch to Fire Laser Blasters</span>
          </div>
        </div>

        {/* Tactical Tips */}
        <div style={{ borderTop: '1px solid rgba(34, 211, 238, 0.2)', paddingTop: 14, fontSize: 12, color: '#94a3b8' }}>
          <div style={{ color: '#fbbf24', fontWeight: 'bold', marginBottom: 4 }}>BATTLE ROYALE PROTOCOLS:</div>
          • Shatter floating asteroids to collect Shields, Rapid Fire, and Repairs.<br />
          • Stay within the cyan Safe-Zone perimeter ring — storm damage accelerates rapidly outside.<br />
          • Beware Cosmic Anomalies (Meteor Showers & Solar Surges) announced on your HUD!
        </div>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <button
            onClick={onClose}
            className="btn-neon-cyan"
            style={{ padding: '10px 32px', fontSize: 14 }}
          >
            DISMISS
          </button>
        </div>
      </div>
    </div>
  );
};
