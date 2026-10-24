import React from 'react';
import type { GameSnapshot, PlayerState, UpgradeType } from '@lss/shared';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  COSMIC_EVENT_COLORS,
  PICKUP_COLORS,
  SHIP_COLORS,
  SHIP_MAX_HEALTH,
} from '@lss/shared';

interface HudOverlayProps {
  localPlayer: PlayerState | null;
  snapshot: GameSnapshot | null;
  latencyMs?: number;
  muted: boolean;
  onToggleMute: () => void;
}

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
  let safeZoneStatusText = 'SAFE ZONE STABLE';
  if (safeZone.isShrinking) {
    safeZoneStatusText = '⚠️ SAFE ZONE SHRINKING!';
  } else if (safeZone.nextShrinkAt) {
    const untilShrink = Math.max(0, Math.ceil((safeZone.nextShrinkAt - Date.now()) / 1000));
    safeZoneStatusText = `ZONE SHRINKS IN ${untilShrink}s`;
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

  // Radar dimensions
  const radarSize = 130;
  const scaleX = radarSize / ARENA_WIDTH;
  const scaleY = radarSize / ARENA_HEIGHT;

  return (
    <>
      {/* Red screen edge danger vignette when taking storm damage outside zone */}
      {isOutsideSafeZone && <div className="storm-vignette" />}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          zIndex: 10,
          fontFamily: 'monospace',
          color: '#e2e8f0',
        }}
      >
        {/* ── TOP BAR ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* Top Left: Match Stats & Safe Zone */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'auto' }}>
            <div className="glass-panel" style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ color: '#22d3ee', fontWeight: 'bold', fontSize: 13 }}>
                ⚔️ {snapshot.aliveCount} / {snapshot.players.length} ALIVE
              </span>
              <span style={{ color: '#64748b' }}>|</span>
              <span style={{ fontSize: 13, color: '#f8fafc', fontWeight: 'bold' }}>
                ⏱️ {timerStr}
              </span>
              {localPlayer && (
                <>
                  <span style={{ color: '#64748b' }}>|</span>
                  <span style={{ color: '#fbbf24', fontWeight: 'bold', fontSize: 13 }}>
                    ☠️ {localPlayer.kills} KILLS
                  </span>
                </>
              )}
            </div>

            <div
              className="glass-panel"
              style={{
                padding: '4px 12px',
                fontSize: 11,
                fontWeight: 'bold',
                color: safeZone.isShrinking ? '#f43f5e' : '#22d3ee',
                borderLeft: `3px solid ${safeZone.isShrinking ? '#f43f5e' : '#22d3ee'}`,
              }}
            >
              {safeZoneStatusText}
            </div>
          </div>

          {/* Top Center: Storm Warning & Cosmic Event Banners */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            {/* Outside Zone Flashing Alert */}
            {isOutsideSafeZone && (
              <div
                className="glass-panel-danger storm-active-warning"
                style={{
                  padding: '8px 20px',
                  color: '#fff',
                  fontWeight: 900,
                  fontSize: 13,
                  letterSpacing: 2,
                  textAlign: 'center',
                }}
              >
                ⚠️ OUTSIDE SAFE ZONE — TAKING STORM DAMAGE!
              </div>
            )}

            {/* AI Cosmic Director Event Banner */}
            {cosmicEvent && (
              <div
                className="glass-panel cosmic-banner-pulse"
                style={{
                  padding: '8px 24px',
                  border: `1px solid ${COSMIC_EVENT_COLORS[cosmicEvent.type] ?? '#fb923c'}`,
                  borderRadius: 6,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    letterSpacing: 2,
                    color: COSMIC_EVENT_COLORS[cosmicEvent.type] ?? '#fb923c',
                  }}
                >
                  {cosmicEvent.type === 'METEOR_SHOWER' && `☄️ METEOR SHOWER DETECTED (${cosmicEndsIn}s)`}
                  {cosmicEvent.type === 'SOLAR_SURGE' && `☀️ SOLAR SURGE — STORM DAMAGE ×2.5 (${cosmicEndsIn}s)`}
                  {cosmicEvent.type === 'SUPPLY_DROP' && '📦 SUPPLY DROP PODS DEPLOYED'}
                </div>
              </div>
            )}
          </div>

          {/* Top Right: Kill Feed, Ping & Audio Toggle */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, pointerEvents: 'auto' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {latencyMs !== undefined && (
                <div
                  className="glass-panel"
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    color: latencyMs < 80 ? '#10b981' : latencyMs < 150 ? '#fbbf24' : '#f43f5e',
                  }}
                >
                  {latencyMs} ms
                </div>
              )}
              <button
                onClick={onToggleMute}
                className="btn-neon-outline"
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                {muted ? 'MUTED' : 'AUDIO'}
              </button>
            </div>

            {/* Live Kill Feed */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 280 }}>
              {snapshot.killFeed.slice(-4).map((k) => (
                <div
                  key={k.id}
                  className="glass-panel"
                  style={{
                    padding: '4px 10px',
                    fontSize: 11,
                    background: 'rgba(15, 23, 42, 0.85)',
                    borderLeft: '3px solid #f43f5e',
                  }}
                >
                  <span style={{ color: k.killerId ? '#22d3ee' : '#94a3b8', fontWeight: 'bold' }}>
                    {k.killerName ?? 'DEEP SPACE'}
                  </span>
                  <span style={{ color: '#f43f5e', margin: '0 6px' }}>⚡</span>
                  <span style={{ color: '#f1f5f9' }}>{k.victimName}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── BOTTOM BAR ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          {/* Bottom Left: Health, Shield & Upgrades */}
          <div
            className="glass-panel"
            style={{
              padding: '14px 18px',
              width: 280,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              pointerEvents: 'auto',
            }}
          >
            {/* Health Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>HULL INTEGRITY</span>
                <span style={{ color: hpPercent > 50 ? '#10b981' : hpPercent > 25 ? '#fbbf24' : '#f43f5e', fontWeight: 'bold' }}>
                  {Math.ceil(hp)} / {maxHp}
                </span>
              </div>
              <div style={{ height: 8, background: '#090d1f', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${hpPercent}%`,
                    background: hpPercent > 50 ? '#10b981' : hpPercent > 25 ? '#fbbf24' : '#f43f5e',
                    boxShadow: hpPercent > 50 ? '0 0 8px #10b981' : '0 0 8px #f43f5e',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>

            {/* Shield Bar */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>ENERGY SHIELD</span>
                <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{Math.ceil(shield)} / 60</span>
              </div>
              <div style={{ height: 6, background: '#090d1f', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${shieldPercent}%`,
                    background: '#38bdf8',
                    boxShadow: '0 0 8px #38bdf8',
                    transition: 'width 0.2s ease',
                  }}
                />
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
                      color: PICKUP_COLORS[u.type] ?? '#22d3ee',
                      background: 'rgba(15, 23, 42, 0.9)',
                      border: `1px solid ${PICKUP_COLORS[u.type] ?? '#22d3ee'}`,
                      borderRadius: 4,
                      padding: '2px 6px',
                    }}
                  >
                    {u.type} {u.remainingSec}s
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Right: Real-time Mini-Radar Map */}
          <div
            className="glass-panel"
            style={{
              padding: 8,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ fontSize: 9, color: '#94a3b8', letterSpacing: 1, marginBottom: 4 }}>
              TACTICAL RADAR
            </div>
            <svg
              width={radarSize}
              height={radarSize}
              viewBox={`0 0 ${radarSize} ${radarSize}`}
              style={{ background: '#060918', borderRadius: 4, border: '1px solid rgba(34, 211, 238, 0.3)' }}
            >
              {/* Safe Zone Ring */}
              <circle
                cx={safeZone.centerX * scaleX}
                cy={safeZone.centerY * scaleY}
                r={safeZone.radius * scaleX}
                fill="none"
                stroke={safeZone.isShrinking ? '#f43f5e' : '#22d3ee'}
                strokeWidth={1.5}
                strokeDasharray={safeZone.isShrinking ? '3, 2' : undefined}
                opacity={0.8}
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

              {/* Pickups */}
              {snapshot.pickups.map((pick) => (
                <circle
                  key={pick.id}
                  cx={pick.x * scaleX}
                  cy={pick.y * scaleY}
                  r={2}
                  fill={PICKUP_COLORS[pick.type] ?? '#fde047'}
                />
              ))}

              {/* Enemy Ships */}
              {snapshot.players
                .filter((p) => p.alive && p.id !== localPlayer?.id)
                .map((p) => (
                  <circle
                    key={p.id}
                    cx={p.x * scaleX}
                    cy={p.y * scaleY}
                    r={2.5}
                    fill={SHIP_COLORS[p.colorIndex % SHIP_COLORS.length] ?? '#f43f5e'}
                  />
                ))}

              {/* Local Player Ship (Bright Green Arrow/Point with Facing Line) */}
              {localPlayer && isAlive && (
                <g transform={`translate(${localPlayer.x * scaleX}, ${localPlayer.y * scaleY})`}>
                  <circle cx={0} cy={0} r={3.5} fill="#10b981" />
                  <line
                    x1={0}
                    y1={0}
                    x2={Math.cos(localPlayer.rotation) * 6}
                    y2={Math.sin(localPlayer.rotation) * 6}
                    stroke="#10b981"
                    strokeWidth={1.5}
                  />
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>
    </>
  );
};
