import React from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from './icons.js';

interface EliminatedOverlayProps {
  placement: number;
  totalPlayers: number;
  killerName: string | null;
  cause?: string;
  spectatorTargetName: string | null;
  onSpectateNext: () => void;
  onSpectatePrev: () => void;
  onReturnToLobby: () => void;
}

export const EliminatedOverlay: React.FC<EliminatedOverlayProps> = ({
  placement,
  totalPlayers,
  killerName,
  cause,
  spectatorTargetName,
  onSpectateNext,
  onSpectatePrev,
  onReturnToLobby,
}) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 25,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        pointerEvents: 'auto',
        fontFamily: 'monospace',
      }}
    >
      {/* Elimination Banner Card */}
      <div
        className="glass-panel-danger"
        style={{
          padding: '16px 36px',
          textAlign: 'center',
          minWidth: 320,
        }}
      >
        <div
          className="title-glow-danger"
          style={{
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: 2,
            marginBottom: 4,
          }}
        >
          Ship Destroyed
        </div>
        <div style={{ fontSize: 14, color: '#fde047', fontWeight: 'bold' }}>
          Placed #{placement} of {totalPlayers}
        </div>
        <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
          {killerName ? (
            <>Eliminated by <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{killerName}</span></>
          ) : (
            cause ?? 'Lost in Deep Space'
          )}
        </div>
      </div>

      {/* Spectator Target Controller */}
      <div
        className="glass-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '8px 20px',
        }}
      >
        <button
          onClick={onSpectatePrev}
          className="btn-neon-outline"
          style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          title="Previous Player (A)"
        >
          <ChevronLeftIcon size={14} /> Prev
        </button>

        <div style={{ textAlign: 'center', minWidth: 160 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 1 }}>WATCHING PLAYER</div>
          <div style={{ fontSize: 14, fontWeight: 'bold', color: '#38bdf8' }}>
            {spectatorTargetName ?? 'Camera Drone'}
          </div>
        </div>

        <button
          onClick={onSpectateNext}
          className="btn-neon-outline"
          style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
          title="Next Player (D)"
        >
          Next <ChevronRightIcon size={14} />
        </button>
      </div>

      <button
        onClick={onReturnToLobby}
        className="btn-neon-outline"
        style={{ padding: '6px 18px', fontSize: 12, color: '#94a3b8' }}
      >
        Leave Match
      </button>
    </div>
  );
};
