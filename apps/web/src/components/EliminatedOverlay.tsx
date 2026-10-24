import React from 'react';

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
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: 3,
            marginBottom: 4,
          }}
        >
          SHIP DESTROYED
        </div>
        <div style={{ fontSize: 15, color: '#fde047', fontWeight: 'bold' }}>
          PLACED #{placement} OF {totalPlayers}
        </div>
        <div style={{ fontSize: 12, color: '#cbd5e1', marginTop: 4 }}>
          {killerName ? (
            <>Eliminated by <span style={{ color: '#22d3ee', fontWeight: 'bold' }}>{killerName}</span></>
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
          style={{ padding: '6px 12px', fontSize: 12 }}
          title="Previous Pilot (A)"
        >
          ◀ PREV
        </button>

        <div style={{ textAlign: 'center', minWidth: 160 }}>
          <div style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 1 }}>SPECTATING PILOT</div>
          <div style={{ fontSize: 14, fontWeight: 'bold', color: '#22d3ee' }}>
            {spectatorTargetName ?? 'AUTOMATED FEED'}
          </div>
        </div>

        <button
          onClick={onSpectateNext}
          className="btn-neon-outline"
          style={{ padding: '6px 12px', fontSize: 12 }}
          title="Next Pilot (D)"
        >
          NEXT ▶
        </button>
      </div>

      {/* Return to Lobby action */}
      <button
        onClick={onReturnToLobby}
        className="btn-neon-outline"
        style={{ padding: '6px 16px', fontSize: 11, borderColor: '#64748b', color: '#94a3b8' }}
      >
        RETURN TO LOBBY
      </button>
    </div>
  );
};
