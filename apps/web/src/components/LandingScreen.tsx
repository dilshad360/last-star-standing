import React, { useMemo, useState } from 'react';
import { PICKUP_COLORS, ROOM_CODE_LENGTH, SHIP_COLORS } from '@lss/shared';
import { ControlsModal } from './ControlsModal.js';
import {
  HelpCircleIcon,
  Volume2Icon,
  VolumeXIcon,
  PlayIcon,
  UserPlusIcon,
  BotIcon,
  UsersIcon,
  MaximizeIcon,
  MinimizeIcon,
  CrosshairIcon,
  RadioIcon,
  RotateCcwIcon,
} from './icons.js';

interface LandingScreenProps {
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  onQuickPlay: (botCount: number) => void;
  onCreateRoom: () => void;
  onJoinRoom: (code: string) => void;
  initialRoomCode?: string;
  muted: boolean;
  onToggleMute: () => void;
  loading?: boolean;
  statusMessage?: string | null;
}

const CALLSIGN_PREFIXES = [
  'Nova',
  'Vortex',
  'Hyper',
  'Astra',
  'Orion',
  'Nebula',
  'Pulsar',
  'Zenith',
  'Solar',
  'Valkyrie',
];

const ARSENAL_ITEMS = [
  { label: 'Shield', color: PICKUP_COLORS.SHIELD },
  { label: 'Rapid Fire', color: PICKUP_COLORS.RAPID_FIRE },
  { label: 'Spread Shot', color: PICKUP_COLORS.TRIPLE_SHOT },
  { label: 'EMP Nova', color: PICKUP_COLORS.EMP_BLAST },
  { label: 'Hull Repair', color: PICKUP_COLORS.REPAIR },
  { label: 'Afterburner', color: PICKUP_COLORS.ENERGY },
] as const;

export const LandingScreen: React.FC<LandingScreenProps> = ({
  displayName,
  onDisplayNameChange,
  onQuickPlay,
  onCreateRoom,
  onJoinRoom,
  initialRoomCode = '',
  muted,
  onToggleMute,
  loading = false,
  statusMessage,
}) => {
  const [joinCode, setJoinCode] = useState(initialRoomCode.toUpperCase());
  const [showControls, setShowControls] = useState(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'custom'>(initialRoomCode ? 'custom' : 'quick');
  const [quickBots, setQuickBots] = useState(5);
  const [hullColorIdx, setHullColorIdx] = useState(0);

  const [isFullscreen, setIsFullscreen] = React.useState(
    typeof document !== 'undefined' ? !!document.fullscreenElement : false
  );
  React.useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Deterministic starfield backdrop
  const stars = useMemo(
    () =>
      Array.from({ length: 48 }, (_, i) => ({
        id: i,
        left: `${(i * 37 + 13) % 98 + 1}%`,
        top: `${(i * 53 + 7) % 96 + 2}%`,
        size: i % 5 === 0 ? 3 : i % 2 === 0 ? 2 : 1.5,
        color:
          i % 6 === 0
            ? '#22d3ee'
            : i % 7 === 0
              ? '#fb923c'
              : i % 9 === 0
                ? '#fde047'
                : '#f8fafc',
        delay: `${(i * 0.35) % 4}s`,
        duration: `${2.2 + (i % 4) * 0.8}s`,
      })),
    [],
  );

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const randomizeCallsign = () => {
    const prefix = CALLSIGN_PREFIXES[Math.floor(Math.random() * CALLSIGN_PREFIXES.length)]!;
    const num = Math.floor(10 + Math.random() * 89);
    onDisplayNameChange(`${prefix}-${num}`);
    setHullColorIdx((prev) => (prev + 1) % SHIP_COLORS.length);
  };

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (code.length === ROOM_CODE_LENGTH) {
      onJoinRoom(code);
    }
  };

  const activeHullColor = SHIP_COLORS[hullColorIdx % SHIP_COLORS.length] ?? '#22d3ee';
  const botDifficultyLabel =
    quickBots === 0
      ? 'Solo Flight Practice'
      : quickBots <= 2
        ? 'Tactical Skirmish'
        : quickBots <= 5
          ? 'Standard Battle Royale'
          : 'Maximum Orbital Chaos';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 35%, #0c1938 0%, #050918 55%, #02040a 100%)',
        padding: 16,
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 20,
      }}
    >
      {/* Animated Cosmic Backdrop: Nebula Orbs, Perspective Grid & Twinkling Stars */}
      <div className="landing-nebula-cyan" />
      <div className="landing-nebula-orange" />
      <div className="landing-grid-backdrop" />

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1, overflow: 'hidden' }}>
        {stars.map((s) => (
          <div
            key={s.id}
            style={{
              position: 'absolute',
              left: s.left,
              top: s.top,
              width: s.size,
              height: s.size,
              borderRadius: '50%',
              background: s.color,
              boxShadow: s.size >= 2.5 ? `0 0 8px ${s.color}` : undefined,
              animation: `starTwinkle ${s.duration} ease-in-out ${s.delay} infinite`,
            }}
          />
        ))}

        {/* Shooting Meteor Streaks */}
        <div
          style={{
            position: 'absolute',
            top: '14%',
            right: '12%',
            width: 110,
            height: 2,
            background: 'linear-gradient(90deg, rgba(34,211,238,0.95), transparent)',
            borderRadius: 2,
            animation: 'meteorStreak 7s linear 1.2s infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '28%',
            right: '28%',
            width: 85,
            height: 2,
            background: 'linear-gradient(90deg, rgba(249,115,22,0.9), transparent)',
            borderRadius: 2,
            animation: 'meteorStreak 9.5s linear 4.5s infinite',
          }}
        />
      </div>

      {/* Cockpit Canopy Frame & Brackets */}
      <div className="cockpit-visor-frame" />
      <div className="cockpit-bracket-tl" />
      <div className="cockpit-bracket-tr" />
      <div className="cockpit-bracket-bl" />
      <div className="cockpit-bracket-br" />

      {/* Top-Left Sector Telemetry Status Badge */}
      <div
        className="landing-telemetry-badge cockpit-panel"
        style={{
          position: 'absolute',
          top: 'max(14px, env(safe-area-inset-top, 14px))',
          left: 'max(16px, env(safe-area-inset-left, 16px))',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '6px 12px',
          fontSize: 11,
          zIndex: 10,
          borderLeft: '3px solid #22d3ee',
        }}
      >
        <RadioIcon size={13} color="#22c55e" />
        <span style={{ color: '#94a3b8', letterSpacing: 1 }}>
          SECTOR 07 <span style={{ color: '#334155' }}>//</span>{' '}
          <span style={{ color: '#22d3ee', fontWeight: 700 }}>25HZ ARENA ONLINE</span>
        </span>
      </div>

      {/* Top-Right Action Controls: Fullscreen, Sound & Help */}
      <div
        style={{
          position: 'absolute',
          top: 'max(14px, env(safe-area-inset-top, 14px))',
          right: 'max(16px, env(safe-area-inset-right, 16px))',
          display: 'flex',
          gap: 8,
          zIndex: 10,
        }}
      >
        <button
          onClick={toggleFullscreen}
          className="btn-neon-outline"
          style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
        >
          {isFullscreen ? <MinimizeIcon size={14} /> : <MaximizeIcon size={14} />}
          {isFullscreen ? 'Exit' : 'Full'}
        </button>
        <button
          onClick={() => setShowControls(true)}
          className="btn-neon-outline"
          style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
          title="View Flight Controls"
        >
          <HelpCircleIcon size={14} />
          Controls
        </button>
        <button
          onClick={onToggleMute}
          className="btn-neon-outline"
          style={{ padding: '5px 10px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {muted ? <VolumeXIcon size={14} /> : <Volume2Icon size={14} />}
          {muted ? 'Muted' : 'Sound'}
        </button>
      </div>

      {/* Main Brand Logo Header + Animated Starfighter Hangar Emblem */}
      <div style={{ textAlign: 'center', marginBottom: 14, zIndex: 10, marginTop: 'auto' }}>
        {/* Orbital Radar Ring + Neon Starfighter Crest */}
        <div
          onClick={() => setHullColorIdx((prev) => (prev + 1) % SHIP_COLORS.length)}
          title="Click to cycle ship neon hull trim"
          style={{
            position: 'relative',
            width: 92,
            height: 92,
            margin: '0 auto 8px auto',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width={92} height={92} viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0 }}>
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="rgba(8, 14, 30, 0.7)"
              stroke="rgba(34, 211, 238, 0.25)"
              strokeWidth="1.2"
            />
            <circle
              className="landing-orbital-ring"
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={activeHullColor}
              strokeWidth="1.5"
              strokeDasharray="10 6 3 6"
              opacity="0.75"
            />
            <circle
              className="landing-orbital-ring-reverse"
              cx="50"
              cy="50"
              r="31"
              fill="none"
              stroke="#f97316"
              strokeWidth="1"
              strokeDasharray="6 10"
              opacity="0.55"
            />
          </svg>

          {/* Procedural Starfighter SVG matching ArenaScene ship silhouette */}
          <svg
            className="landing-ship-emblem"
            width={58}
            height={58}
            viewBox="-26 -28 52 56"
            style={{ position: 'relative', zIndex: 2 }}
          >
            {/* Dual Plasma Exhaust Flames */}
            <g className="landing-thruster-flame">
              <polygon points="-10,14 -4,14 -7,27" fill={activeHullColor} opacity="0.9" />
              <polygon points="4,14 10,14 7,27" fill={activeHullColor} opacity="0.9" />
              <polygon points="-8.5,14 -5.5,14 -7,22" fill="#ffffff" />
              <polygon points="5.5,14 8.5,14 7,22" fill="#ffffff" />
            </g>

            {/* Wingtip Laser Blaster Rails */}
            <line x1="-13" y1="2" x2="-13" y2="-10" stroke="#64748b" strokeWidth="2" />
            <circle cx="-13" cy="-11" r="2.2" fill={activeHullColor} />
            <line x1="13" y1="2" x2="13" y2="-10" stroke="#64748b" strokeWidth="2" />
            <circle cx="13" cy="-11" r="2.2" fill={activeHullColor} />

            {/* Aerodynamic Dart Hull */}
            <polygon
              points="0,-22 -16,12 -8,8 -7,15 0,11 7,15 8,8 16,12"
              fill="#080e1e"
              stroke={activeHullColor}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />

            {/* Cockpit Canopy */}
            <polygon
              points="0,-10 -3.5,0 0,4 3.5,0"
              fill="#06b6d4"
              stroke="#e0f2fe"
              strokeWidth="1"
            />
          </svg>
        </div>

        {/* Tactical Sector Tag Pill */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '3px 12px',
            borderRadius: 999,
            background: 'rgba(249, 115, 22, 0.12)',
            border: '1px solid rgba(249, 115, 22, 0.45)',
            fontSize: 10,
            color: '#fb923c',
            letterSpacing: 2.5,
            fontWeight: 800,
            marginBottom: 8,
          }}
        >
          <CrosshairIcon size={12} color="#fb923c" />
          2D MULTIPLAYER SPACE BATTLE ROYALE
        </div>

        <h1
          className="title-glow"
          style={{
            fontSize: 'clamp(26px, 6.5vw, 44px)',
            margin: '0 0 6px 0',
            fontWeight: 900,
          }}
        >
          LAST STAR STANDING
        </h1>

        {/* Decorative Wing Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            maxWidth: 340,
            margin: '0 auto 6px auto',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, #22d3ee)' }} />
          <span style={{ fontSize: 10, color: '#38bdf8', letterSpacing: 2 }}>ORBITAL COMBAT DECK</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(270deg, transparent, #22d3ee)' }} />
        </div>
      </div>

      {/* Main Interaction Card */}
      <div
        className="cockpit-panel-glow"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 'min(450px, 94vw)',
          padding: '22px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          zIndex: 10,
        }}
      >
        <div className="landing-scanline" />

        {/* Pilot Name Input */}
        <div style={{ position: 'relative', zIndex: 3 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label
              style={{
                fontSize: 11,
                color: '#cbd5e1',
                fontWeight: 'bold',
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Pilot Callsign
            </label>
            <span
              style={{
                fontSize: 10,
                color: '#22c55e',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                letterSpacing: 0.5,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: '#22c55e',
                  boxShadow: '0 0 6px #22c55e',
                }}
              />
              SYSTEMS READY
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="landing-input"
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
              placeholder="e.g. StarPilot"
              maxLength={16}
              disabled={loading}
              style={{
                flex: 1,
                background: '#060a1a',
                border: '1px solid rgba(249, 115, 22, 0.45)',
                borderRadius: 4,
                color: '#f8fafc',
                fontSize: 16,
                fontFamily: 'inherit',
                fontWeight: 700,
                padding: '10px 14px',
                outline: 'none',
                textAlign: 'center',
                letterSpacing: 1.5,
                boxShadow: 'inset 0 2px 6px rgba(0, 0, 0, 0.6)',
              }}
            />
            <button
              type="button"
              onClick={randomizeCallsign}
              disabled={loading}
              className="btn-neon-outline"
              title="Generate Random Pilot Callsign"
              style={{
                padding: '0 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RotateCcwIcon size={15} />
            </button>
          </div>
        </div>

        {/* Tab Selector */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, position: 'relative', zIndex: 3 }}>
          <button
            type="button"
            onClick={() => setActiveTab('quick')}
            className={activeTab === 'quick' ? 'btn-neon-orange' : 'btn-neon-outline'}
            style={{ padding: '9px 12px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <BotIcon size={14} /> Play vs Bots
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('custom')}
            className={activeTab === 'custom' ? 'btn-neon-orange' : 'btn-neon-outline'}
            style={{ padding: '9px 12px', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <UsersIcon size={14} /> Custom Room
          </button>
        </div>

        {/* Quick Play Tab */}
        {activeTab === 'quick' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'relative', zIndex: 3 }}>
            <div
              style={{
                background: 'rgba(6, 10, 26, 0.75)',
                border: '1px solid rgba(34, 211, 238, 0.2)',
                borderRadius: 6,
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13 }}>
                <div>
                  <div style={{ color: '#cbd5e1', fontWeight: 700, fontSize: 12 }}>AI Squadron Size</div>
                  <div style={{ color: '#38bdf8', fontSize: 10, marginTop: 2 }}>{botDifficultyLabel}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => setQuickBots(Math.max(0, quickBots - 1))}
                    className="btn-neon-outline"
                    style={{ width: 28, height: 28, padding: 0, fontWeight: 800 }}
                  >
                    -
                  </button>
                  <span style={{ color: '#f97316', fontWeight: 900, fontSize: 16, width: 22, textAlign: 'center' }}>
                    {quickBots}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuickBots(Math.min(7, quickBots + 1))}
                    className="btn-neon-outline"
                    style={{ width: 28, height: 28, padding: 0, fontWeight: 800 }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Visual Squadron Roster Pips */}
              <div style={{ display: 'flex', gap: 5 }}>
                {Array.from({ length: 7 }, (_, idx) => {
                  const active = idx < quickBots;
                  const pipColor = SHIP_COLORS[(idx + 1) % SHIP_COLORS.length]!;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setQuickBots(idx + 1)}
                      title={`Set ${idx + 1} AI Bots`}
                      style={{
                        flex: 1,
                        height: 6,
                        borderRadius: 2,
                        border: 'none',
                        cursor: 'pointer',
                        background: active ? pipColor : 'rgba(51, 65, 85, 0.45)',
                        boxShadow: active ? `0 0 8px ${pipColor}` : 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onQuickPlay(quickBots)}
              disabled={loading || !displayName.trim()}
              className="btn-neon-orange"
              style={{
                width: '100%',
                padding: '14px',
                fontSize: 16,
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
              }}
            >
              <PlayIcon size={16} />
              {loading ? 'Launching Thrusters...' : 'Launch Into Arena'}
            </button>
          </div>
        )}

        {/* Custom Room Tab */}
        {activeTab === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'relative', zIndex: 3 }}>
            <button
              type="button"
              onClick={onCreateRoom}
              disabled={loading || !displayName.trim()}
              className="btn-neon-orange"
              style={{
                width: '100%',
                padding: '12px',
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                letterSpacing: 1,
              }}
            >
              <UserPlusIcon size={16} />
              {loading ? 'Creating...' : 'Create Private Hangar'}
            </button>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                color: '#64748b',
                fontSize: 11,
              }}
            >
              <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
              <span>OR JOIN BY 4-CHAR CODE</span>
              <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
            </div>

            <form onSubmit={handleJoinSubmit} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="landing-input"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="4-CHAR CODE"
                maxLength={ROOM_CODE_LENGTH}
                disabled={loading}
                style={{
                  flex: 1,
                  background: '#060a1a',
                  border: '1px solid rgba(34, 211, 238, 0.3)',
                  borderRadius: 4,
                  color: '#f8fafc',
                  fontSize: 15,
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  padding: '10px 12px',
                  outline: 'none',
                  textAlign: 'center',
                  letterSpacing: 3,
                }}
              />
              <button
                type="submit"
                disabled={loading || joinCode.length !== ROOM_CODE_LENGTH}
                className="btn-neon-outline"
                style={{
                  padding: '10px 18px',
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                Join
              </button>
            </form>
          </div>
        )}

        {statusMessage && (
          <div
            style={{
              padding: '8px 12px',
              backgroundColor: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 4,
              fontSize: 12,
              color: '#38bdf8',
              textAlign: 'center',
              position: 'relative',
              zIndex: 3,
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>

      {/* Bottom Flight Deck Briefing: Keycaps & Arena Power-Up Arsenal */}
      <div
        style={{
          width: '100%',
          maxWidth: 'min(520px, 95vw)',
          marginTop: 14,
          marginBottom: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 10,
        }}
      >
        {/* Flight Keycap Strip */}
        <div
          className="cockpit-panel"
          style={{
            padding: '8px 12px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px 14px',
            fontSize: 11,
            color: '#94a3b8',
          }}
        >
          <span>
            <span className="keycap-badge">A</span> <span className="keycap-badge">D</span> Steer
          </span>
          <span>
            <span className="keycap-badge">W</span> <span className="keycap-badge">S</span> Thrust
          </span>
          <span>
            <span className="keycap-badge">SHIFT</span> Boost
          </span>
          <span>
            <span className="keycap-badge">SPACE</span> Blasters
          </span>
        </div>

        {/* Arena Power-Ups Preview Strip */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          {ARSENAL_ITEMS.map((item) => (
            <div
              key={item.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(8, 14, 30, 0.8)',
                border: `1px solid ${item.color}55`,
                fontSize: 10,
                color: '#cbd5e1',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: item.color,
                  boxShadow: `0 0 6px ${item.color}`,
                }}
              />
              {item.label}
            </div>
          ))}
        </div>
      </div>

      <ControlsModal isOpen={showControls} onClose={() => setShowControls(false)} />
    </div>
  );
};

