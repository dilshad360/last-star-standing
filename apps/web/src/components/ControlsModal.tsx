import React from 'react';
import { CompassIcon, SpeedIcon, ZapIcon, Volume2Icon, CheckIcon } from './icons.js';

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
        backgroundColor: 'rgba(3, 5, 14, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        className="cockpit-panel-glow"
        style={{
          maxWidth: 520,
          width: '100%',
          padding: '24px 28px',
          color: '#e2e8f0',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 11, color: '#f97316', letterSpacing: 2, fontWeight: 'bold' }}>PILOT GUIDE</div>
            <h2 style={{ margin: '2px 0 0 0', fontSize: 20, color: '#f8fafc', fontWeight: 800 }}>
              How to Play
            </h2>
          </div>
          <button
            onClick={onClose}
            className="btn-neon-outline"
            style={{ padding: '4px 10px', fontSize: 14 }}
          >
            ✕
          </button>
        </div>

        {/* Keyboard Controls */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 'bold', marginBottom: 10, letterSpacing: 1 }}>
            KEYBOARD CONTROLS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 4, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc' }}>
                <CompassIcon size={16} color="#38bdf8" /> A / D
              </span>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>Turn Ship (Left / Right)</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 4, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc' }}>
                <SpeedIcon size={16} color="#22c55e" /> W
              </span>
              <span style={{ color: '#22c55e', fontWeight: 600 }}>Main Thruster (Forward)</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 4, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc' }}>
                <SpeedIcon size={16} color="#f97316" /> S
              </span>
              <span style={{ color: '#f97316', fontWeight: 600 }}>Reverse Thruster (Brake)</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 4, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc' }}>
                <ZapIcon size={16} color="#38bdf8" /> Spacebar
              </span>
              <span style={{ color: '#38bdf8', fontWeight: 600 }}>Shoot Dual Lasers</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 4, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc' }}>
                <ZapIcon size={16} color="#eab308" /> Shift (Hold)
              </span>
              <span style={{ color: '#eab308', fontWeight: 600 }}>Boost Speed</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: 4, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f8fafc' }}>
                <Volume2Icon size={16} color="#94a3b8" /> M Key
              </span>
              <span style={{ color: '#94a3b8' }}>Mute / Unmute Sound</span>
            </div>
          </div>
        </div>

        {/* Tactical Rules */}
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: 14, fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
          <div style={{ color: '#f97316', fontWeight: 'bold', marginBottom: 4 }}>
            GAMEPLAY TIPS
          </div>
          • <strong>Dual Lasers:</strong> Fire straight ahead from your left and right wings.<br />
          • <strong>Safe Zone:</strong> Stay inside the safe zone ring. Taking storm damage outside drains your health fast.<br />
          • <strong>Power-ups:</strong> Shoot asteroids to uncover Shields, Rapid Fire, Repair, and Speed boosts.<br />
          • <strong>Last One Standing Wins:</strong> Survive against all opponents to win the match.
        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button
            onClick={onClose}
            className="btn-neon-orange"
            style={{ width: '100%', padding: '10px 20px', fontSize: 14 }}
          >
            <CheckIcon size={16} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 6 }} /> Got It
          </button>
        </div>
      </div>
    </div>
  );
};
