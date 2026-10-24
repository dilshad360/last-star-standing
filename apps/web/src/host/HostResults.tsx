import React from 'react';
import type { MatchResult } from '@lss/shared';
import { SHIP_COLORS } from '@lss/shared';
import { TrophyIcon } from '../components/icons.js';

interface HostResultsProps {
  result: MatchResult;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

export const HostResults: React.FC<HostResultsProps> = ({ result, onPlayAgain, onBackToLobby }) => {
  const winner = result.stats[0];
  return (
    <div className="host-screen host-results">
      <TrophyIcon size={64} color="#fde047" />
      <div className="host-eyebrow">WINNER</div>
      <h1
        className="title-glow-gold host-winner"
        style={{ color: winner ? SHIP_COLORS[winner.colorIndex] : undefined }}
      >
        {result.winnerName ?? 'Nobody'}
      </h1>
      <table className="host-results-table cockpit-panel">
        <thead>
          <tr>
            <th>#</th>
            <th>Pilot</th>
            <th>Kills</th>
            <th>Deaths</th>
            <th>Damage</th>
          </tr>
        </thead>
        <tbody>
          {result.stats.map((s) => (
            <tr key={s.playerId}>
              <td>{s.placement}</td>
              <td>
                <span className="host-swatch" style={{ background: SHIP_COLORS[s.colorIndex] }} />{' '}
                {s.displayName}
              </td>
              <td>{s.kills}</td>
              <td>{s.deaths}</td>
              <td>{s.damageDealt}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="host-actions">
        <button type="button" className="btn-neon-cyan host-start" onClick={onPlayAgain}>
          PLAY AGAIN
        </button>
        <button type="button" className="btn-neon-outline" onClick={onBackToLobby}>
          Back to lobby
        </button>
      </div>
    </div>
  );
};
