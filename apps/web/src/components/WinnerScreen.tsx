import React from 'react';
import type { MatchResult } from '@lss/shared';
import { SHIP_COLORS } from '@lss/shared';
import { TrophyIcon, RotateCcwIcon, ChevronLeftIcon } from './icons.js';

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
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ marginBottom: 12 }}>
            <TrophyIcon size={44} color={isWinner ? '#eab308' : '#38bdf8'} />
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', letterSpacing: 3, marginBottom: 6 }}>
            MATCH OVER
          </div>
          <h1
            className={isWinner ? 'title-glow-gold' : 'title-glow'}
            style={{
              fontSize: 'clamp(24px, 5vw, 36px)',
              margin: '0 0 8px 0',
              fontWeight: 900,
            }}
          >
            {isWinner
              ? 'YOU ARE THE LAST STAR STANDING!'
              : `${result.winnerName ?? 'DEEP SPACE'} WON THE MATCH`}
          </h1>
          <div style={{ fontSize: 12, color: '#64748b', letterSpacing: 1 }}>
            Match Duration: {formatTime(result.durationMs)}
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
              <tr style={{ color: '#94a3b8', borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <th style={{ padding: '8px 12px' }}>Rank</th>
                <th style={{ padding: '8px 12px' }}>Player</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Kills</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Damage</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Survived</th>
              </tr>
            </thead>
            <tbody>
              {result.stats.map((s) => {
                const isMe = s.playerId === localPlayerId;
                const colorHex = SHIP_COLORS[s.colorIndex % SHIP_COLORS.length] ?? '#22d3ee';

                return (
                  <tr
                    key={s.playerId}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      background: isMe ? 'rgba(56, 189, 248, 0.12)' : 'transparent',
                      color: isMe ? '#38bdf8' : '#f1f5f9',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 'bold' }}>
                      #{s.placement}
                    </td>
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
                        {s.displayName} {isMe && '(You)'}
                      </span>
                      {s.isBot && (
                        <span style={{ fontSize: 10, color: '#64748b', marginLeft: 6 }}>[Bot]</span>
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
            className="btn-neon-orange"
            style={{ padding: '12px 32px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <RotateCcwIcon size={16} />
            {isHost ? 'Play Again' : 'Return to Lobby'}
          </button>
          <button
            onClick={onReturnToLobby}
            className="btn-neon-outline"
            style={{ padding: '12px 24px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <ChevronLeftIcon size={16} />
            Main Menu
          </button>
        </div>
      </div>
    </div>
  );
};
