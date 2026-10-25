import { useCallback, useEffect, useRef, useState } from 'react';
import type { CountdownPayload, GameSnapshot, MatchResult, RoomInfo } from '@lss/shared';
import { socketClient } from '../networking/SocketClient.js';
import { gameEvents } from '../game/EventBus.js';
import { phaserGame } from '../game/PhaserGame.js';
import { soundManager } from '../game/audio/SoundManager.js';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { HostLobby, CountdownOverlay } from './HostLobby.js';
import { TvHud } from './TvHud.js';
import { HostResults } from './HostResults.js';
import { HostLanding } from './HostLanding.js';

const HUD_UPDATE_MS = 200;

/** The big screen: creates the room, shows the QR code, and renders the arena. */
export function HostApp() {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [countdown, setCountdown] = useState<CountdownPayload | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastHudAt = useRef(0);

  const run = useCallback(async (action: () => Promise<{ ok: boolean; error?: string } | void>) => {
    try {
      const res = await action();
      if (res && !res.ok) setError(res.error ?? 'Something went wrong.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Resume a room this tab was already hosting (page refresh).
  useEffect(() => {
    const stored = socketClient.storedHostSession();
    if (!stored) return;
    setLoading(true);
    socketClient
      .hostResume(stored.code, stored.hostToken)
      .then((ack) => {
        if (ack.ok) setRoom(ack.room);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const offs = [
      gameEvents.on('connection:status', (s) => setConnected(s.connected)),
      gameEvents.on('error', (e) => setError(e.message)),
      gameEvents.on('room:updated', (r) => {
        setRoom(r);
        if (r.status !== 'COUNTDOWN') setCountdown(null);
        if (r.status === 'LOBBY') setResult(null);
      }),
      gameEvents.on('room:closed', (payload) => {
        setRoom(null);
        setError(payload.reason);
      }),
      gameEvents.on('match:countdown', (cd) => {
        setCountdown(cd);
        soundManager.playCountdown();
      }),
      gameEvents.on('match:started', (payload) => {
        setCountdown(null);
        setResult(null);
        setSnapshot(payload.snapshot);
        soundManager.playCountdown(true);
      }),
      gameEvents.on('snapshot:update', (snap) => {
        const now = performance.now();
        if (now - lastHudAt.current >= HUD_UPDATE_MS) {
          lastHudAt.current = now;
          setSnapshot(snap);
        }
      }),
      gameEvents.on('match:finished', (res) => {
        setResult(res);
        soundManager.playVictory();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const playing = room?.status === 'ACTIVE';
  useEffect(() => {
    if (playing && canvasRef.current) phaserGame.mount(canvasRef.current);
    return () => phaserGame.unmount();
  }, [playing]);

  const hostGame = () =>
    run(async () => {
      setLoading(true);
      soundManager.init();
      soundManager.resume();
      try {
        const ack = await socketClient.hostCreate();
        if (ack.ok) setRoom(ack.room);
        return ack;
      } finally {
        setLoading(false);
      }
    });

  const closeRoom = () =>
    run(async () => {
      await socketClient.leaveRoom();
      setRoom(null);
    });

  const playAgain = () =>
    run(async () => {
      const restart = await socketClient.restartMatch();
      if (!restart.ok) return restart;
      return socketClient.startMatch();
    });

  const toggleMute = () => setMuted(soundManager.toggleMute());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm' && !(e.target instanceof HTMLInputElement)) {
        setMuted(soundManager.toggleMute());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app-root">
      <ConnectionBanner connected={connected} error={error} onDismissError={() => setError(null)} />

      {!room && (
        <HostLanding
          loading={loading}
          onHostGame={hostGame}
          muted={muted}
          onToggleMute={toggleMute}
        />
      )}

      {room && (room.status === 'LOBBY' || room.status === 'COUNTDOWN') && (
        <HostLobby
          room={room}
          countdown={countdown}
          onSetBotCount={(count) => run(() => socketClient.setBotCount(count))}
          onStart={() => {
            soundManager.init();
            soundManager.resume();
            void run(() => socketClient.startMatch());
          }}
          onClose={closeRoom}
        />
      )}

      {room && playing && (
        <>
          <div ref={canvasRef} className="host-canvas" />
          <TvHud
            roomCode={room.code}
            snapshot={snapshot}
            muted={muted}
            onToggleMute={toggleMute}
            onEndRound={() => run(() => socketClient.restartMatch())}
          />
          {countdown && <CountdownOverlay countdown={countdown} />}
        </>
      )}

      {room && room.status === 'FINISHED' && result && (
        <HostResults
          result={result}
          onPlayAgain={playAgain}
          onBackToLobby={() => run(() => socketClient.restartMatch())}
        />
      )}
    </div>
  );
}
