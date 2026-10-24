import { useEffect, useRef, useState } from 'react';
import type {
  GameSnapshot,
  KillFeedEntry,
  MatchResult,
  PlayerState,
  RoomInfo,
} from '@lss/shared';
import { phaserGame } from './game/PhaserGame.js';
import { socketClient } from './networking/SocketClient.js';
import { gameEvents } from './game/EventBus.js';
import { soundManager } from './game/audio/SoundManager.js';

import { LandingScreen } from './components/LandingScreen.js';
import { LobbyScreen } from './components/LobbyScreen.js';
import { HudOverlay } from './components/HudOverlay.js';
import { EliminatedOverlay } from './components/EliminatedOverlay.js';
import { WinnerScreen } from './components/WinnerScreen.js';
import { ConnectionBanner } from './components/ConnectionBanner.js';

import './styles/index.css';

type ScreenState = 'landing' | 'lobby' | 'playing' | 'finished';

interface EliminatedInfo {
  placement: number;
  totalPlayers: number;
  killerName: string | null;
  cause?: string;
}

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('landing');
  const [displayName, setDisplayName] = useState(() => {
    return (
      localStorage.getItem('lss_pilot_name') ||
      `Pilot-${Math.floor(100 + Math.random() * 900)}`
    );
  });
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);

  // Connection
  const [connected, setConnected] = useState(true);
  const [latencyMs, setLatencyMs] = useState<number | undefined>(undefined);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Match & Room state
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [countdown, setCountdown] = useState<{ startsAt: number; durationMs: number } | null>(null);
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [eliminatedInfo, setEliminatedInfo] = useState<EliminatedInfo | null>(null);
  const [spectatorTargetName, setSpectatorTargetName] = useState<string | null>(null);

  const playerIdRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const lastSnapshotTimeRef = useRef(0);

  // Save display name when updated
  const handleDisplayNameChange = (name: string) => {
    setDisplayName(name);
    localStorage.setItem('lss_pilot_name', name);
  };

  // Check URL query parameters for initial ?room=CODE
  const initialRoomCode = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || '';
  })();

  // ── Global EventBus Subscriptions ──────────────────────────────────────────
  useEffect(() => {
    const offConn = gameEvents.on('connection:status', (status) => {
      setConnected(status.connected);
      if (status.latencyMs !== undefined) setLatencyMs(status.latencyMs);
    });

    const offError = gameEvents.on('error', (err) => {
      setErrorToast(err.message);
      setLoading(false);
    });

    const offRoom = gameEvents.on('room:updated', (updatedRoom) => {
      setRoom(updatedRoom);
      if (updatedRoom.status === 'LOBBY' && screen !== 'lobby' && screen !== 'landing') {
        setScreen('lobby');
        setCountdown(null);
        setResult(null);
        setEliminatedInfo(null);
      }
    });

    const offCountdown = gameEvents.on('match:countdown', (cd) => {
      setCountdown(cd);
    });

    const offMatchStarted = gameEvents.on('match:started', (payload) => {
      setCountdown(null);
      setSnapshot(payload.snapshot);
      setEliminatedInfo(null);
      setScreen('playing');
    });

    // Throttled snapshot state update (~10 Hz) for React HUD overlay
    const offSnapshot = gameEvents.on('snapshot:update', (snap) => {
      const now = Date.now();
      if (now - lastSnapshotTimeRef.current >= 100) {
        lastSnapshotTimeRef.current = now;
        setSnapshot(snap);

        // Update current spectator target if spectating
        if (mountedRef.current && phaserGame.scene) {
          setSpectatorTargetName(phaserGame.scene.getCurrentSpectatorTargetName());
        }
      }
    });

    const offEliminated = gameEvents.on('player:eliminated', (entry: KillFeedEntry) => {
      if (entry.victimId === playerIdRef.current) {
        const total = snapshot?.players.length ?? 8;
        const alive = (snapshot?.aliveCount ?? 1);
        setEliminatedInfo({
          placement: alive,
          totalPlayers: total,
          killerName: entry.killerName,
          cause: entry.cause ? `Eliminated by ${entry.cause.toLowerCase()}` : undefined,
        });
      }
    });

    const offFinished = gameEvents.on('match:finished', (res) => {
      setResult(res);
      setScreen('finished');
      soundManager.playVictory();
    });

    return () => {
      offConn();
      offError();
      offRoom();
      offCountdown();
      offMatchStarted();
      offSnapshot();
      offEliminated();
      offFinished();
    };
  }, [screen, snapshot]);

  // ── Mount / Unmount Phaser Game Canvas ─────────────────────────────────────
  useEffect(() => {
    if (screen === 'playing' && canvasRef.current && !mountedRef.current) {
      mountedRef.current = true;
      phaserGame.mount(canvasRef.current, playerIdRef.current ?? undefined);
    }
    if (screen !== 'playing' && mountedRef.current) {
      mountedRef.current = false;
      phaserGame.unmount();
    }
  }, [screen]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleQuickPlay = async (botCount: number) => {
    const name = displayName.trim() || `Pilot-${Math.floor(100 + Math.random() * 900)}`;
    setLoading(true);
    setStatusMessage('Connecting to orbital grid…');
    try {
      soundManager.init();
      soundManager.resume();
      await socketClient.connect();
      const ack = await socketClient.quickPlay(name, botCount);
      if (!ack.ok) {
        setErrorToast(ack.error);
        setLoading(false);
        return;
      }
      playerIdRef.current = ack.playerId;
      setRoom(ack.room);
      setScreen(ack.room.status === 'ACTIVE' ? 'playing' : 'lobby');
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setStatusMessage(null);
    }
  };

  const handleCreateRoom = async () => {
    const name = displayName.trim() || `Pilot-${Math.floor(100 + Math.random() * 900)}`;
    setLoading(true);
    setStatusMessage('Establishing quantum room…');
    try {
      soundManager.init();
      soundManager.resume();
      await socketClient.connect();
      const ack = await socketClient.createRoom(name);
      if (!ack.ok) {
        setErrorToast(ack.error);
        setLoading(false);
        return;
      }
      playerIdRef.current = ack.playerId;
      setRoom(ack.room);
      setScreen('lobby');
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setStatusMessage(null);
    }
  };

  const handleJoinRoom = async (code: string) => {
    const name = displayName.trim() || `Pilot-${Math.floor(100 + Math.random() * 900)}`;
    setLoading(true);
    setStatusMessage(`Docking with room ${code}…`);
    try {
      soundManager.init();
      soundManager.resume();
      await socketClient.connect();
      const ack = await socketClient.joinRoom(code, name);
      if (!ack.ok) {
        setErrorToast(ack.error);
        setLoading(false);
        return;
      }
      playerIdRef.current = ack.playerId;
      setRoom(ack.room);
      setScreen(ack.room.status === 'ACTIVE' ? 'playing' : 'lobby');
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setStatusMessage(null);
    }
  };

  const handleSetReady = async (ready: boolean) => {
    try {
      await socketClient.setReady(ready);
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSetBotCount = async (count: number) => {
    try {
      await socketClient.setBotCount(count);
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleStartMatch = async () => {
    try {
      await socketClient.startMatch();
    } catch (err) {
      setErrorToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await socketClient.leaveRoom();
    } catch {
      // Ignore
    }
    setRoom(null);
    setScreen('landing');
  };

  const handlePlayAgain = async () => {
    if (isHost) {
      try {
        await socketClient.restartMatch();
      } catch (err) {
        setErrorToast(err instanceof Error ? err.message : String(err));
      }
    } else {
      setResult(null);
      setScreen('lobby');
    }
  };

  const handleReturnToLanding = () => {
    setResult(null);
    setEliminatedInfo(null);
    setScreen('landing');
    socketClient.disconnect();
    mountedRef.current = false;
    phaserGame.unmount();
  };

  const toggleMute = () => {
    const next = soundManager.toggleMute();
    setMuted(next);
  };

  // Find local player in snapshot
  const localPlayerState: PlayerState | null =
    snapshot?.players.find((p) => p.id === playerIdRef.current) ?? null;

  const isHost = room ? room.hostPlayerId === playerIdRef.current : false;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* Toast and Connection Alerts */}
      <ConnectionBanner
        connected={connected}
        error={errorToast}
        onDismissError={() => setErrorToast(null)}
      />

      {/* ── Screen: Landing ─────────────────────────────────────────────────── */}
      {screen === 'landing' && (
        <LandingScreen
          displayName={displayName}
          onDisplayNameChange={handleDisplayNameChange}
          onQuickPlay={handleQuickPlay}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          initialRoomCode={initialRoomCode}
          muted={muted}
          onToggleMute={toggleMute}
          loading={loading}
          statusMessage={statusMessage}
        />
      )}

      {/* ── Screen: Lobby ───────────────────────────────────────────────────── */}
      {screen === 'lobby' && room && (
        <LobbyScreen
          room={room}
          localPlayerId={playerIdRef.current ?? ''}
          isHost={isHost}
          onSetReady={handleSetReady}
          onSetBotCount={handleSetBotCount}
          onStartMatch={handleStartMatch}
          onLeaveRoom={handleLeaveRoom}
          countdown={countdown}
        />
      )}

      {/* ── Screen: Playing (Phaser Canvas + Live HUD + Spectator) ───────────── */}
      {screen === 'playing' && (
        <>
          <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />

          {/* Live HUD Overlay */}
          <HudOverlay
            localPlayer={localPlayerState}
            snapshot={snapshot}
            latencyMs={latencyMs}
            muted={muted}
            onToggleMute={toggleMute}
          />

          {/* Eliminated Spectator Overlay */}
          {eliminatedInfo && (
            <EliminatedOverlay
              placement={eliminatedInfo.placement}
              totalPlayers={eliminatedInfo.totalPlayers}
              killerName={eliminatedInfo.killerName}
              cause={eliminatedInfo.cause}
              spectatorTargetName={spectatorTargetName}
              onSpectateNext={() => phaserGame.scene?.nextSpectatorTarget()}
              onSpectatePrev={() => phaserGame.scene?.prevSpectatorTarget()}
              onReturnToLobby={handleLeaveRoom}
            />
          )}
        </>
      )}

      {/* ── Screen: Winner Scoreboard ────────────────────────────────────────── */}
      {screen === 'finished' && result && (
        <WinnerScreen
          result={result}
          localPlayerId={playerIdRef.current}
          isHost={isHost}
          onPlayAgain={handlePlayAgain}
          onReturnToLobby={handleReturnToLanding}
        />
      )}
    </div>
  );
}
