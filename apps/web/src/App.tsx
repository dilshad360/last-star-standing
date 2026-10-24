import { useEffect, useRef, useState } from 'react';
import type { GameSnapshot, MatchResult } from '@lss/shared';
import { phaserGame } from './game/PhaserGame.js';
import { socketClient } from './networking/SocketClient.js';
import { gameEvents } from './game/EventBus.js';
import { soundManager } from './game/audio/SoundManager.js';

type Phase = 'landing' | 'playing' | 'finished';

/**
 * Minimal playable test harness for Phase 4.
 * The full React UI (lobby, HUD, winner screen) arrives in Phase 5.
 */
export default function App() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [displayName, setDisplayName] = useState('');
  const [status, setStatus] = useState('');
  const [hud, setHud] = useState<{ health: number; alive: number; kills: number } | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [muted, setMuted] = useState(false);
  const playerIdRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const offFinished = gameEvents.on('match:finished', (r) => {
      setResult(r);
      setPhase('finished');
      soundManager.playVictory();
    });
    const offSnapshot = gameEvents.on('snapshot:update', (snap: GameSnapshot) => {
      const me = snap.players.find((p) => p.id === playerIdRef.current);
      if (me) setHud({ health: me.health, alive: snap.aliveCount, kills: me.kills });
    });
    return () => {
      offFinished();
      offSnapshot();
    };
  }, []);

  useEffect(() => {
    if (phase === 'playing' && canvasRef.current && !mountedRef.current) {
      mountedRef.current = true;
      phaserGame.mount(canvasRef.current, playerIdRef.current ?? undefined);
    }
    if (phase !== 'playing' && mountedRef.current) {
      mountedRef.current = false;
      phaserGame.unmount();
    }
  }, [phase]);

  const quickPlay = async () => {
    const name = displayName.trim() || `Pilot-${Math.floor(Math.random() * 1000)}`;
    setStatus('Connecting…');
    try {
      await socketClient.connect();
      const ack = await socketClient.quickPlay(name, 5);
      if (!ack.ok) {
        setStatus(`Error: ${ack.error}`);
        return;
      }
      playerIdRef.current = ack.playerId;
      setStatus(`Room ${ack.room.code} — match starting…`);
      setPhase('playing');
    } catch (err) {
      setStatus(`Connection failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const playAgain = async () => {
    setResult(null);
    setPhase('landing');
    socketClient.disconnect();
    mountedRef.current = false;
    phaserGame.unmount();
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', fontFamily: 'monospace', color: '#e2e8f0' }}>
      {phase === 'landing' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: 'radial-gradient(ellipse at center, #0a0a1f 0%, #05050f 100%)',
        }}>
          <h1 style={{ color: '#22d3ee', textShadow: '0 0 20px #22d3ee', letterSpacing: 4 }}>
            LAST STAR STANDING
          </h1>
          <p style={{ color: '#94a3b8' }}>Phase 4 test harness — fly, shoot, survive.</p>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display name"
            maxLength={16}
            style={{
              background: '#0f172a', border: '1px solid #22d3ee', color: '#e2e8f0',
              padding: '10px 16px', fontSize: 16, fontFamily: 'monospace', width: 240,
              textAlign: 'center', borderRadius: 4, outline: 'none',
            }}
          />
          <button
            onClick={quickPlay}
            style={{
              background: '#22d3ee', border: 'none', color: '#05050f',
              padding: '12px 32px', fontSize: 16, fontWeight: 'bold',
              fontFamily: 'monospace', cursor: 'pointer', borderRadius: 4,
              boxShadow: '0 0 16px #22d3ee66',
            }}
          >
            QUICK PLAY (5 BOTS)
          </button>
          <div style={{ fontSize: 12, color: '#64748b', textAlign: 'center', lineHeight: 1.8 }}>
            WASD / Arrows — thrust &nbsp;·&nbsp; Mouse — aim &nbsp;·&nbsp; LMB / Space — fire<br />
            M — mute &nbsp;·&nbsp; Mobile: left half joystick, right half fire
          </div>
          {status && <div style={{ color: '#fbbf24' }}>{status}</div>}
        </div>
      )}

      {phase === 'playing' && (
        <>
          <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />
          {hud && (
            <div style={{
              position: 'absolute', top: 12, left: 12, fontSize: 14,
              textShadow: '0 0 4px #000',
            }}>
              <div>HP {Math.ceil(hud.health)} · Kills {hud.kills} · Alive {hud.alive}</div>
            </div>
          )}
          <button
            onClick={() => setMuted(soundManager.toggleMute())}
            style={{
              position: 'absolute', top: 12, right: 12, background: 'transparent',
              border: '1px solid #22d3ee', color: '#22d3ee', padding: '4px 10px',
              fontFamily: 'monospace', cursor: 'pointer', borderRadius: 4,
            }}
          >
            {muted ? 'UNMUTE' : 'MUTE'}
          </button>
        </>
      )}

      {phase === 'finished' && result && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: 'rgba(5,5,15,0.92)',
        }}>
          <h1 style={{ color: '#fde047', textShadow: '0 0 20px #fde047' }}>
            {result.winnerName ?? 'NO WINNER'} WINS
          </h1>
          <table style={{ borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ color: '#94a3b8' }}>
                <th style={{ padding: '4px 12px', textAlign: 'left' }}>#</th>
                <th style={{ padding: '4px 12px', textAlign: 'left' }}>Pilot</th>
                <th style={{ padding: '4px 12px' }}>Kills</th>
                <th style={{ padding: '4px 12px' }}>Damage</th>
              </tr>
            </thead>
            <tbody>
              {result.stats.map((s) => (
                <tr key={s.playerId} style={{ color: s.playerId === playerIdRef.current ? '#22d3ee' : '#e2e8f0' }}>
                  <td style={{ padding: '4px 12px' }}>{s.placement}</td>
                  <td style={{ padding: '4px 12px' }}>{s.displayName}</td>
                  <td style={{ padding: '4px 12px', textAlign: 'center' }}>{s.kills}</td>
                  <td style={{ padding: '4px 12px', textAlign: 'center' }}>{s.damageDealt}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={playAgain}
            style={{
              background: '#22d3ee', border: 'none', color: '#05050f',
              padding: '12px 32px', fontSize: 16, fontWeight: 'bold',
              fontFamily: 'monospace', cursor: 'pointer', borderRadius: 4,
            }}
          >
            PLAY AGAIN
          </button>
        </div>
      )}
    </div>
  );
}
