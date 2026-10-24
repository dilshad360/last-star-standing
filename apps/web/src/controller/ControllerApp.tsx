import { useCallback, useEffect, useRef, useState } from 'react';
import type { ControllerState, MatchResult, PlayerInput, RoomInfo } from '@lss/shared';
import {
  MAX_DISPLAY_NAME_LENGTH,
  SHIP_COLORS,
  SHIP_COLOR_NAMES,
} from '@lss/shared';
import { socketClient } from '../networking/SocketClient.js';
import { gameEvents } from '../game/EventBus.js';
import { ConnectionBanner } from '../components/ConnectionBanner.js';
import { TouchControls } from '../components/TouchControls.js';
import { useTilt } from './useTilt.js';
import { useWakeLock } from './useWakeLock.js';
import { vibrate } from './haptics.js';

const INPUT_INTERVAL_MS = 33;
const NAME_KEY = 'lss_pilot_name';

const initialCode = () =>
  (new URLSearchParams(window.location.search).get('room') ?? '').toUpperCase().slice(0, 4);

const defaultName = () =>
  localStorage.getItem(NAME_KEY) ?? `Pilot-${Math.floor(100 + Math.random() * 900)}`;

function requestFullscreen(): void {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (document.fullscreenElement) return;
  try {
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
    else el.webkitRequestFullscreen?.();
  } catch {
    // Fullscreen is optional (iOS Safari does not support it).
  }
}

/** The phone: join a room, then act as a joystick/tilt gamepad for one ship. */
export function ControllerApp() {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(defaultName);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [state, setState] = useState<ControllerState | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [countdownEndsAt, setCountdownEndsAt] = useState<number | null>(null);
  const [closedReason, setClosedReason] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  const [, forceTick] = useState(0);

  const tilt = useTilt(tiltOn);
  const stick = useRef({ x: 0, y: 0 });
  const fire = useRef(false);
  const boost = useRef(false);
  const sequence = useRef(0);
  const tiltDot = useRef<HTMLDivElement>(null);

  const me = room?.players.find((p) => p.id === playerId) ?? null;
  const color = me ? SHIP_COLORS[me.colorIndex]! : '#22d3ee';
  const active = room?.status === 'ACTIVE';

  useWakeLock(room !== null);

  const join = useCallback(
    async (roomCode: string, displayName: string) => {
      const trimmed = displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
      if (!trimmed || roomCode.trim().length !== 4) return;
      setJoining(true);
      setError(null);
      try {
        localStorage.setItem(NAME_KEY, trimmed);
        const ack = await socketClient.controllerJoin(roomCode, trimmed);
        if (!ack.ok) {
          setError(ack.error);
          return;
        }
        setRoom(ack.room);
        setPlayerId(ack.playerId);
        setClosedReason(null);
        window.history.replaceState(null, '', `/play?room=${ack.room.code}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setJoining(false);
      }
    },
    [],
  );

  // Rejoin automatically if this phone already has a ship in the room.
  useEffect(() => {
    const roomCode = initialCode();
    if (roomCode && socketClient.storedPlayerToken(roomCode)) void join(roomCode, defaultName());
  }, [join]);

  useEffect(() => {
    const offs = [
      gameEvents.on('connection:status', (s) => setConnected(s.connected)),
      gameEvents.on('error', (e) => setError(e.message)),
      gameEvents.on('room:updated', (r) => {
        setRoom(r);
        if (r.status !== 'COUNTDOWN') setCountdownEndsAt(null);
        if (r.status === 'LOBBY' || r.status === 'COUNTDOWN') {
          setResult(null);
          setState(null);
        }
      }),
      gameEvents.on('room:closed', (payload) => {
        setRoom(null);
        setPlayerId(null);
        setClosedReason(payload.reason);
      }),
      gameEvents.on('match:countdown', (cd) => setCountdownEndsAt(cd.startsAt)),
      gameEvents.on('controller:state', setState),
      gameEvents.on('controller:haptic', (h) => vibrate(h.kind)),
      gameEvents.on('match:finished', setResult),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  // 30 Hz input stream while a round is running. Stops when the tab is hidden
  // so the server's stale-input timeout releases the ship.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const v = tiltOn ? tilt.vector.current : stick.current;
      if (tiltDot.current) {
        tiltDot.current.style.transform = `translate(${v.x * 40}px, ${v.y * 40}px)`;
      }
      const input: PlayerInput = {
        up: false,
        down: false,
        left: false,
        right: false,
        aimAngle: Math.atan2(v.y, v.x),
        shooting: fire.current,
        boost: boost.current,
        drift: boost.current,
        moveX: v.x,
        moveY: v.y,
        sequence: ++sequence.current,
      };
      socketClient.sendInput(input);
    }, INPUT_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active, tiltOn, tilt.vector]);

  // Re-render once a second for countdown / respawn timers.
  useEffect(() => {
    const id = window.setInterval(() => forceTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  const enableTilt = async () => {
    if (tiltOn) {
      setTiltOn(false);
      return;
    }
    const granted = tilt.permission === 'granted' || (await tilt.request());
    if (granted) {
      setTiltOn(true);
      tilt.calibrate();
    } else {
      setError('Tilt needs motion permission and an HTTPS page. Using the joystick instead.');
    }
  };

  const leave = async () => {
    await socketClient.leaveRoom().catch(() => {});
    setRoom(null);
    setPlayerId(null);
  };

  // ── Join form ──────────────────────────────────────────────────────────
  if (!room || !playerId) {
    return (
      <div className="app-root controller-screen controller-join">
        <ConnectionBanner connected={connected} error={error} onDismissError={() => setError(null)} />
        <h1 className="title-glow">LAST STAR STANDING</h1>
        {closedReason && <p className="host-warning">{closedReason}</p>}
        <form
          className="cockpit-panel controller-form"
          onSubmit={(e) => {
            e.preventDefault();
            requestFullscreen();
            void join(code, name);
          }}
        >
          <label>
            Room code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="ABCD"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </label>
          <label>
            Your name
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, MAX_DISPLAY_NAME_LENGTH))}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              autoComplete="nickname"
            />
          </label>
          <button
            type="submit"
            className="btn-neon-cyan host-start"
            disabled={joining || code.length !== 4 || !name.trim()}
          >
            {joining ? 'Joining…' : 'JOIN GAME'}
          </button>
        </form>
      </div>
    );
  }

  const banner = (
    <ConnectionBanner connected={connected} error={error} onDismissError={() => setError(null)} />
  );
  const shipBadge = (
    <div className="controller-badge" style={{ borderColor: color, color }}>
      <span className="host-swatch" style={{ background: color }} />
      {me?.displayName} · {me ? SHIP_COLOR_NAMES[me.colorIndex] : ''} ship
    </div>
  );

  // ── Results ────────────────────────────────────────────────────────────
  if (room.status === 'FINISHED') {
    const mine = result?.stats.find((s) => s.playerId === playerId);
    return (
      <div className="app-root controller-screen controller-center">
        {banner}
        {shipBadge}
        <div className="host-eyebrow">ROUND OVER</div>
        <h1 className="title-glow-gold controller-big">{mine ? `#${mine.placement}` : '—'}</h1>
        {mine && (
          <p>
            {mine.kills} kills · {mine.deaths} deaths
          </p>
        )}
        <p className="controller-muted">Winner: {result?.winnerName ?? '…'}</p>
        <p className="controller-muted">Waiting for the host to start the next round.</p>
        <button type="button" className="btn-neon-outline" onClick={leave}>
          Leave
        </button>
      </div>
    );
  }

  // ── Lobby / countdown ──────────────────────────────────────────────────
  if (!active) {
    const seconds = countdownEndsAt ? Math.max(0, Math.ceil((countdownEndsAt - Date.now()) / 1000)) : null;
    return (
      <div className="app-root controller-screen controller-center">
        {banner}
        {shipBadge}
        {seconds !== null ? (
          <div className="countdown-pop title-glow controller-big">{seconds || 'GO!'}</div>
        ) : (
          <>
            <h2>You're in!</h2>
            <p className="controller-muted">
              Watch the big screen. {room.players.length} pilot{room.players.length === 1 ? '' : 's'} ready.
            </p>
          </>
        )}
        <div className="controller-tilt-setup">
          <button type="button" className="btn-neon-outline" onClick={enableTilt}>
            {tiltOn ? 'Tilt steering: ON' : 'Use tilt steering'}
          </button>
          {tiltOn && (
            <button type="button" className="btn-neon-outline" onClick={tilt.calibrate}>
              Calibrate (hold phone level)
            </button>
          )}
        </div>
        <p className="controller-muted controller-small">Turn your phone sideways for the best grip.</p>
        <button type="button" className="btn-neon-outline" onClick={leave}>
          Leave
        </button>
      </div>
    );
  }

  // ── Gamepad ────────────────────────────────────────────────────────────
  const respawnIn =
    state && !state.alive && state.respawnAt !== null
      ? Math.max(0, Math.ceil((state.respawnAt - state.serverTime) / 1000))
      : null;
  const healthPct = state ? Math.max(0, state.health / state.maxHealth) : 1;
  const clock = state ? Math.ceil(state.timeRemainingMs / 1000) : 0;

  return (
    <div className="app-root controller-screen controller-pad" style={{ ['--accent' as string]: color }}>
      {banner}
      <div className="controller-status">
        <span className="host-swatch" style={{ background: color }} />
        <div className="controller-health">
          <div style={{ width: `${healthPct * 100}%`, background: color }} />
        </div>
        {state && state.shield > 0 && <span className="controller-shield">+{state.shield}</span>}
        <span>
          #{state?.rank ?? '–'}/{state?.totalPlayers ?? '–'}
        </span>
        <span>{state?.kills ?? 0} K</span>
        <span>
          {Math.floor(clock / 60)}:{String(clock % 60).padStart(2, '0')}
        </span>
        <button type="button" className="btn-neon-outline controller-tilt-toggle" onClick={enableTilt}>
          {tiltOn ? 'Tilt ON' : 'Tilt'}
        </button>
        {tiltOn && (
          <button type="button" className="btn-neon-outline controller-tilt-toggle" onClick={tilt.calibrate}>
            Recenter
          </button>
        )}
      </div>

      {tiltOn && (
        <div className="controller-tilt-indicator" style={{ borderColor: color }}>
          <div ref={tiltDot} style={{ background: color }} />
        </div>
      )}

      {state && !state.alive && (
        <div className="controller-respawn">
          {respawnIn !== null ? (
            <>
              <div className="host-eyebrow">DESTROYED</div>
              <div className="controller-big">{respawnIn}</div>
              <div>Respawning…</div>
            </>
          ) : (
            <div>Reconnecting your ship…</div>
          )}
        </div>
      )}

      <TouchControls
        hideJoystick={tiltOn}
        accentColor={color}
        onJoystick={(x, y, isActive) => {
          stick.current = isActive ? { x, y } : { x: 0, y: 0 };
        }}
        onFire={(isActive) => {
          fire.current = isActive;
        }}
        onBoost={(isActive) => {
          boost.current = isActive;
        }}
      />
    </div>
  );
}
