import React from 'react';
import type { GameSnapshot, PlayerState, UpgradeType } from '@lss/shared';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COSMIC_EVENT_COLORS,
  PICKUP_COLORS,
  SHIP_COLORS,
  SHIP_MAX_HEALTH,
  SHIP_MAX_SPEED,
} from '@lss/shared';
import {
  HeartIcon,
  ShieldIcon,
  SpeedIcon,
  ZapIcon,
  UsersIcon,
  ClockIcon,
  SwordsIcon,
  AlertTriangleIcon,
  Volume2Icon,
  VolumeXIcon,
  CompassIcon,
} from './icons.js';

interface HudOverlayProps {
  localPlayer: PlayerState | null;
  snapshot: GameSnapshot | null;
  latencyMs?: number;
  muted: boolean;
  onToggleMute: () => void;
}

const UPGRADE_LABELS: Record<UpgradeType, string> = {
  REPAIR: 'Hull Repair',
  SHIELD: 'Shield Matrix',
  RAPID_FIRE: 'Rapid Fire',
  ENERGY: 'Afterburner',
  TRIPLE_SHOT: 'Spread Shot',
  EMP_BLAST: 'EMP Blast',
};

export const HudOverlay: React.FC<HudOverlayProps> = ({
  localPlayer,
  snapshot,
  latencyMs,
  muted,
  onToggleMute,
}) => {
  if (!snapshot) return null;

  const safeZone = snapshot.safeZone;
  const isAlive = localPlayer?.alive ?? false;

  // Check if local player is outside the safe zone
  let isOutsideSafeZone = false;
  if (localPlayer && isAlive) {
    const distFromCenter = Math.hypot(
      localPlayer.x - safeZone.centerX,
      localPlayer.y - safeZone.centerY,
    );
    isOutsideSafeZone = distFromCenter > safeZone.radius;
  }

  // Format match time MM:SS
  const remainingSec = Math.max(0, Math.ceil(snapshot.timeRemainingMs / 1000));
  const min = Math.floor(remainingSec / 60);
  const sec = remainingSec % 60;
  const timerStr = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

  // Safe zone countdown text
  let safeZoneStatusText = 'Safe Zone: Stable';
  if (safeZone.isShrinking) {
    safeZoneStatusText = 'Danger: Safe Zone Shrinking!';
  } else if (safeZone.nextShrinkAt) {
    const untilShrink = Math.max(0, Math.ceil((safeZone.nextShrinkAt - Date.now()) / 1000));
    safeZoneStatusText = `Safe Zone shrinks in ${untilShrink}s`;
  }

  // Active cosmic event
  const cosmicEvent = snapshot.cosmicEvent;
  const cosmicEndsIn = cosmicEvent ? Math.max(0, Math.ceil((cosmicEvent.endsAt - Date.now()) / 1000)) : 0;

  // Health and Shield percentages
  const hp = localPlayer?.health ?? 0;
  const maxHp = localPlayer?.maxHealth ?? SHIP_MAX_HEALTH;
  const hpPercent = Math.max(0, Math.min(100, (hp / maxHp) * 100));

  const shield = localPlayer?.shield ?? 0;
  const shieldPercent = Math.max(0, Math.min(100, (shield / 60) * 100));

  // Ship velocity & heading telemetry
  const velocity = localPlayer ? Math.hypot(localPlayer.velocityX, localPlayer.velocityY) : 0;
  const throttlePercent = Math.min(100, Math.round((velocity / SHIP_MAX_SPEED) * 100));
  const headingDeg = localPlayer
    ? Math.round((((localPlayer.rotation * 180) / Math.PI + 360) % 360))
    : 0;

  // Active upgrade timers
  const now = Date.now();
  const activeUpgrades: { type: UpgradeType; remainingSec: number }[] = [];
  if (localPlayer?.upgrades) {
    for (const [type, expiresAt] of Object.entries(localPlayer.upgrades) as [UpgradeType, number][]) {
      if (expiresAt && expiresAt > now) {
        activeUpgrades.push({
          type,
          remainingSec: Math.ceil((expiresAt - now) / 1000),
        });
      }
    }
  }

  // Tactical Radar Dimensions (responsive for mobile)
  const [windowWidth, setWindowWidth] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const radarSize = windowWidth < 640 ? 84 : 130;
  const scaleX = radarSize / ARENA_WIDTH;
  const scaleY = radarSize / ARENA_HEIGHT;

  return (
    <>
      {/* Cockpit Visor Frame Overlay with Corner Telemetry */}
      <div className="cockpit-visor-frame" />
      <div className="cockpit-bracket-tl" />
      <div className="cockpit-bracket-tr" />
      <div className="cockpit-bracket-bl" />
      <div className="cockpit-bracket-br" />

      {/* Red screen edge danger vignette when taking storm damage outside zone */}
      {isOutsideSafeZone && <div className="storm-vignette" />}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          zIndex: 10,
          fontFamily: 'monospace',
          color: '#e2e8f0',
        }}
      >
        {/* ── TOP BAR: Match Status & Compass ────────────────────────────── */}
        <div className="hud-top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* Top Left: Players Left, Timer, Kills */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'auto' }}>
            <div
              className="cockpit-panel"
              style={{
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderLeft: '3px solid #f97316',
              }}
            >
              <span style={{ color: '#f8fafc', fontWeight: 'bold', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UsersIcon size={14} color="#f97316" />
                {snapshot.aliveCount} / {snapshot.players.length} Remaining
              </span>
              <span style={{ color: '#475569' }}>|</span>
              <span style={{ fontSize: 13, color: '#f8fafc', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClockIcon size={14} color="#94a3b8" />
                {timerStr}
              </span>
              {localPlayer && (
                <>
                  <span style={{ color: '#475569' }}>|</span>
                  <span style={{ color: '#f97316', fontWeight: 'bold', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SwordsIcon size={14} color="#f97316" />
                    {localPlayer.kills} Kills
                  </span>
                </>
              )}
            </div>

            <div
              className="cockpit-panel"
              style={{
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 'bold',
                color: safeZone.isShrinking ? '#ef4444' : '#38bdf8',
                borderLeft: `3px solid ${safeZone.isShrinking ? '#ef4444' : '#38bdf8'}`,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {safeZone.isShrinking && <AlertTriangleIcon size={13} color="#ef4444" />}
              {safeZoneStatusText}
            </div>
          </div>

          {/* Top Center: Heading & Alerts */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div
              className="cockpit-panel hud-heading-box"
              style={{
                padding: '4px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: '#94a3b8',
                borderTop: '2px solid rgba(249, 115, 22, 0.4)',
              }}
            >
              <CompassIcon size={14} color="#f97316" />
              <span>Heading</span>
              <span style={{ color: '#f8fafc', fontWeight: 'bold' }}>
                {headingDeg.toString().padStart(3, '0')}°
              </span>
            </div>

            {/* Outside Zone Flashing Alert */}
            {isOutsideSafeZone && (
              <div
                className="cockpit-panel-danger storm-active-warning"
                style={{
                  padding: '8px 20px',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 13,
                  letterSpacing: 1,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertTriangleIcon size={16} color="#ffffff" />
                DANGER: RETURN TO SAFE ZONE!
              </div>
            )}

            {/* AI Cosmic Director Event Banner */}
            {cosmicEvent && (
              <div
                className="cockpit-panel cosmic-banner-pulse"
                style={{
                  padding: '6px 18px',
                  border: `1px solid ${COSMIC_EVENT_COLORS[cosmicEvent.type] ?? '#fb923c'}`,
                  textAlign: 'center',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <AlertTriangleIcon size={14} color={COSMIC_EVENT_COLORS[cosmicEvent.type] ?? '#fb923c'} />
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: COSMIC_EVENT_COLORS[cosmicEvent.type] ?? '#fb923c',
                  }}
                >
                  {cosmicEvent.type === 'METEOR_SHOWER' && `Meteor Shower Incoming (${cosmicEndsIn}s)`}
                  {cosmicEvent.type === 'SOLAR_SURGE' && `Solar Surge: Double Storm Damage (${cosmicEndsIn}s)`}
                  {cosmicEvent.type === 'SUPPLY_DROP' && 'Supply Pods Deployed in Arena'}
                </div>
              </div>
            )}
          </div>

          {/* Top Right: Sound & Kill Feed */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {latencyMs !== undefined && (
                <div
                  className="cockpit-panel"
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    color: latencyMs < 80 ? '#22c55e' : latencyMs < 150 ? '#f59e0b' : '#ef4444',
                  }}
                >
                  {latencyMs}ms
                </div>
              )}
              <button
                onClick={onToggleMute}
                className="btn-neon-outline"
                style={{ padding: '4px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {muted ? <VolumeXIcon size={13} /> : <Volume2Icon size={13} />}
                {muted ? 'Muted' : 'Sound'}
              </button>
            </div>

            {/* Live Kill Feed */}
            <div className="hud-killfeed" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
              {snapshot.killFeed.slice(-3).map((k) => (
                <div
                  key={k.id}
                  className="cockpit-panel"
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    background: 'rgba(10, 16, 36, 0.9)',
                    borderLeft: '3px solid #ef4444',
                  }}
                >
                  <span style={{ color: k.killerId ? '#38bdf8' : '#94a3b8', fontWeight: 'bold' }}>
                    {k.killerName ?? 'Space Hazard'}
                  </span>
                  <span style={{ color: '#ef4444', margin: '0 6px' }}>⚡</span>
                  <span style={{ color: '#f1f5f9' }}>{k.victimName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── BOTTOM BAR: Ship Status & Minimap Radar ────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {/* Bottom Left: Hull, Shield & Boost */}
          <div
            className="cockpit-panel hud-status-panel"
            style={{
              padding: '14px 18px',
              width: 290,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              pointerEvents: 'auto',
              borderBottom: '3px solid #f97316',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', fontWeight: 'bold' }}>
              <span>SPACESHIP STATUS</span>
              <span style={{ color: '#22c55e' }}>ONLINE</span>
            </div>

            {/* Hull Health Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HeartIcon size={13} color="#22c55e" /> Health
                </span>
                <span style={{ color: hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#f59e0b' : '#ef4444', fontWeight: 'bold' }}>
                  {Math.ceil(hp)} / {maxHp}
                </span>
              </div>
              <div style={{ height: 8, background: '#090d1f', borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${hpPercent}%`,
                    background: hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#f59e0b' : '#ef4444',
                    boxShadow: hpPercent > 50 ? '0 0 10px #22c55e' : '0 0 10px #ef4444',
                    transition: 'width 0.15s ease',
                  }}
                />
              </div>
            </div>

            {/* Shield Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldIcon size={13} color="#38bdf8" /> Shield
                </span>
                <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{Math.ceil(shield)} / 60</span>
              </div>
              <div style={{ height: 6, background: '#090d1f', borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${shieldPercent}%`,
                    background: '#38bdf8',
                    boxShadow: '0 0 8px #38bdf8',
                    transition: 'width 0.15s ease',
                  }}
                />
              </div>
            </div>

            {/* Velocity Readout */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SpeedIcon size={14} color="#94a3b8" />
                <span style={{ color: '#f8fafc', fontWeight: 'bold' }}>{Math.round(velocity)} px/s</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#64748b' }}>Thrust:</span>
                <div style={{ width: 45, height: 5, background: '#090d1f', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${throttlePercent}%`, background: '#f97316' }} />
                </div>
              </div>
            </div>

            {/* Active Upgrades List */}
            {activeUpgrades.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                {activeUpgrades.map((u) => (
                  <span
                    key={u.type}
                    style={{
                      fontSize: 10,
                      fontWeight: 'bold',
                      color: PICKUP_COLORS[u.type] ?? '#38bdf8',
                      background: 'rgba(15, 23, 42, 0.95)',
                      border: `1px solid ${PICKUP_COLORS[u.type] ?? '#38bdf8'}`,
                      borderRadius: 2,
                      padding: '2px 6px',
                    }}
                  >
                    {UPGRADE_LABELS[u.type] ?? u.type} ({u.remainingSec}s)
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Center: Controls Quick Reminder */}
          <div
            className="cockpit-weapon-card keyboard-hints-bar"
            style={{
              padding: '10px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              pointerEvents: 'auto',
              marginBottom: 4,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#f97316', fontWeight: 'bold' }}>
              <ZapIcon size={14} color="#f97316" />
              <span>Dual Lasers: Ready [Space]</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: '#94a3b8' }}>
              <span>Steer: <strong style={{ color: '#f8fafc' }}>A / D</strong></span>
              <span style={{ color: '#475569' }}>|</span>
              <span>Thruster: <strong style={{ color: '#f8fafc' }}>W / S</strong></span>
              <span style={{ color: '#475569' }}>|</span>
              <span>Boost: <strong style={{ color: '#eab308' }}>Shift</strong></span>
            </div>
          </div>

          {/* Bottom Right: Minimap Radar */}
          <div
            className="cockpit-panel hud-radar-panel"
            style={{
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'auto',
              borderBottom: '3px solid #f97316',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 10, color: '#94a3b8', fontWeight: 'bold', marginBottom: 6 }}>
              <span>RADAR MINIMAP</span>
            </div>

            <div style={{ position: 'relative', width: radarSize, height: radarSize, borderRadius: '50%', overflow: 'hidden' }}>
              <div className="cockpit-radar-sweep" />
              <svg
                width={radarSize}
                height={radarSize}
                viewBox={`0 0 ${radarSize} ${radarSize}`}
                style={{ background: '#040714', borderRadius: '50%', border: '1px solid rgba(249, 115, 22, 0.35)' }}
              >
                {/* Concentric Radar Range Rings */}
                <circle cx={radarSize / 2} cy={radarSize / 2} r={radarSize * 0.42} fill="none" stroke="rgba(249, 115, 22, 0.12)" strokeWidth={1} />
                <circle cx={radarSize / 2} cy={radarSize / 2} r={radarSize * 0.28} fill="none" stroke="rgba(249, 115, 22, 0.15)" strokeWidth={1} />
                <circle cx={radarSize / 2} cy={radarSize / 2} r={radarSize * 0.14} fill="none" stroke="rgba(249, 115, 22, 0.2)" strokeWidth={1} />

                {/* Radar Crosshairs */}
                <line x1={0} y1={radarSize / 2} x2={radarSize} y2={radarSize / 2} stroke="rgba(255, 255, 255, 0.08)" strokeWidth={1} />
                <line x1={radarSize / 2} y1={0} x2={radarSize / 2} y2={radarSize} stroke="rgba(255, 255, 255, 0.08)" strokeWidth={1} />

                {/* Safe Zone Ring */}
                <circle
                  cx={safeZone.centerX * scaleX}
                  cy={safeZone.centerY * scaleY}
                  r={safeZone.radius * scaleX}
                  fill="none"
                  stroke={safeZone.isShrinking ? '#ef4444' : '#38bdf8'}
                  strokeWidth={1.5}
                  strokeDasharray={safeZone.isShrinking ? '4, 2' : undefined}
                  opacity={0.85}
                />

                {/* Asteroids */}
                {snapshot.asteroids.map((ast) => (
                  <circle
                    key={ast.id}
                    cx={ast.x * scaleX}
                    cy={ast.y * scaleY}
                    r={1.5}
                    fill="#64748b"
                  />
                ))}

                {/* Other Ships */}
                {snapshot.players.map((p) => {
                  if (!p.alive || p.id === localPlayer?.id) return null;
                  const col = SHIP_COLORS[p.colorIndex % SHIP_COLORS.length] ?? '#f43f5e';
                  return (
                    <circle
                      key={p.id}
                      cx={p.x * scaleX}
                      cy={p.y * scaleY}
                      r={2.5}
                      fill={col}
                    />
                  );
                })}

                {/* Local Ship Dot */}
                {localPlayer && localPlayer.alive && (
                  <circle
                    cx={localPlayer.x * scaleX}
                    cy={localPlayer.y * scaleY}
                    r={3.5}
                    fill="#22c55e"
                    stroke="#ffffff"
                    strokeWidth={1}
                  />
                )}
              </svg>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
