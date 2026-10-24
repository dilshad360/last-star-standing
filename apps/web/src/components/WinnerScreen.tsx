import React from 'react';
import type { MatchResult } from '@lss/shared';
import { SHIP_COLORS } from '@lss/shared';

interface WinnerScreenProps {
  result: MatchResult;
  localPlayerId: string | null;
  isHost: boolean;
  onPlayAgain: () => void;
  onReturnToLobby: () => void;
}

export const WinnerScreen: React.FC<WinnerScreenProps> = ({
  result,
  localPlayerId,
  isHost,
  onPlayAgain,
  onReturnToLobby,
}) => {
  const isWinner = result.winnerPlayerId === localPlayerId;

  // Format survival time
  const formatTime = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(5, 5, 15, 0.94)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        zIndex: 40,
        fontFamily: 'monospace',
        color: '#e2e8f0',
      }}
    >
      <div
        className="glass-panel-glow"
        style={{
          width: '100%',
          maxWidth: 680,
          padding: '32px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          maxHeight: '92vh',
          overflowY: 'auto',
        }}
      >
        {/* Victory Spotlight Banner */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', letterSpacing: 3, marginBottom: 6 }}>
            BATTLE ROYALE CONCLUDED
          </div>
          <h1
            className={isWinner ? 'title-glow-gold' : 'title-glow'}
            style={{
              fontSize: 'clamp(24px, 5vw, 38px)',
              margin: '0 0 8px 0',
              fontWeight: 900,
            }}
          >
            {isWinner
              ? '👑 YOU ARE THE LAST STAR STANDING!'
              : `🏆 ${result.winnerName ?? 'DEEP SPACE'} PREVAILED`}
          </h1>
          <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 1 }}>
            MATCH RESOLUTION: {result.endReason.replace(/_/g, ' ')} · DURATION: {formatTime(result.durationMs)}
          </div>
        </div>

        {/* Full Match Statistics Table */}
        <div style={{ width: '100%', overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(34, 211, 238, 0.3)' }}>
                <th style={{ padding: '8px 12px' }}>RANK</th>
                <th style={{ padding: '8px 12px' }}>PILOT</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>KILLS</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>DAMAGE</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>SURVIVAL</th>
              </tr>
            </thead>
            <tbody>
              {result.stats.map((s) => {
                const isMe = s.playerId === localPlayerId;
                const colorHex = SHIP_COLORS[s.colorIndex % SHIP_COLORS.length] ?? '#22d3ee';

                let medal = `#${s.placement}`;
                if (s.placement === 1) medal = '🥇 #1';
                else if (s.placement === 2) medal = '🥈 #2';
                else if (s.placement === 3) medal = '🥉 #3';

                return (
                  <tr
                    key={s.playerId}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      background: isMe ? 'rgba(34, 211, 238, 0.12)' : 'transparent',
                      color: isMe ? '#22d3ee' : '#f1f5f9',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>{medal}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          backgroundColor: colorHex,
                          marginRight: 8,
                        }}
                      />
                      <span style={{ fontWeight: isMe ? 'bold' : 'normal' }}>
                        {s.displayName} {isMe && '(YOU)'}
                      </span>
                      {s.isBot && (
                        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>[BOT]</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 'bold' }}>
                      {s.kills}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      {Math.round(s.damageDealt)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#94a3b8' }}>
                      {formatTime(s.survivalTimeMs)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action Rematch Buttons */}
        <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={onPlayAgain}
            className="btn-neon-cyan"
            style={{ padding: '12px 32px', fontSize: 15, letterSpacing: 1 }}
          >
            {isHost ? '⚡ PLAY AGAIN (REMATCH)' : 'RETURN TO LOBBY'}
          </button>
          <button
            onClick={onReturnToLobby}
            className="btn-neon-outline"
            style={{ padding: '12px 24px', fontSize: 14 }}
          >
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
};
