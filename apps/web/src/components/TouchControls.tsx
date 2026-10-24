import React, { useRef, useState, useCallback, useEffect } from 'react';
import { CrosshairIcon, ZapIcon } from './icons.js';

interface TouchControlsProps {
  onJoystick: (x: number, y: number, active: boolean) => void;
  onFire: (active: boolean) => void;
  onBoost: (active: boolean) => void;
  visible?: boolean;
}

const JOYSTICK_RADIUS = 44; // max knob travel radius in pixels

export const TouchControls: React.FC<TouchControlsProps> = ({
  onJoystick,
  onFire,
  onBoost,
  visible = true,
}) => {
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [joystickActive, setJoystickActive] = useState(false);
  const [fireActive, setFireActive] = useState(false);
  const [boostActive, setBoostActive] = useState(false);

  const joystickBaseRef = useRef<HTMLDivElement>(null);
  const joystickPointerId = useRef<number | null>(null);

  // Clean up if unmounted while pressed
  useEffect(() => {
    return () => {
      onJoystick(0, 0, false);
      onFire(false);
      onBoost(false);
    };
  }, [onJoystick, onFire, onBoost]);

  // ── Joystick Pointer Handlers ─────────────────────────────────────────────
  const handleJoystickDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerId.current !== null) return;
      joystickPointerId.current = e.pointerId;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore fallback
      }
      setJoystickActive(true);

      const rect = e.currentTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let dx = e.clientX - centerX;
      let dy = e.clientY - centerY;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
      }
      setKnobPos({ x: dx, y: dy });
      onJoystick(dx, dy, true);
    },
    [onJoystick]
  );

  const handleJoystickMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerId.current !== e.pointerId || !joystickBaseRef.current) return;
      const rect = joystickBaseRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      let dx = e.clientX - centerX;
      let dy = e.clientY - centerY;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
      }
      setKnobPos({ x: dx, y: dy });
      onJoystick(dx, dy, true);
    },
    [onJoystick]
  );

  const handleJoystickUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (joystickPointerId.current !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore fallback
      }
      joystickPointerId.current = null;
      setJoystickActive(false);
      setKnobPos({ x: 0, y: 0 });
      onJoystick(0, 0, false);
    },
    [onJoystick]
  );

  // ── Fire Pointer Handlers ─────────────────────────────────────────────────
  const handleFireDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore fallback
      }
      setFireActive(true);
      onFire(true);
    },
    [onFire]
  );

  const handleFireUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore fallback
      }
      setFireActive(false);
      onFire(false);
    },
    [onFire]
  );

  // ── Boost Pointer Handlers ────────────────────────────────────────────────
  const handleBoostDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore fallback
      }
      setBoostActive(true);
      onBoost(true);
    },
    [onBoost]
  );

  const handleBoostUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore fallback
      }
      setBoostActive(false);
      onBoost(false);
    },
    [onBoost]
  );

  if (!visible) return null;

  return (
    <div
      className="touch-controls-layer"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 40,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* ── Left Virtual Joystick (Minimalist Glassmorphism) ─────────────── */}
      <div
        ref={joystickBaseRef}
        className="touch-control"
        onPointerDown={handleJoystickDown}
        onPointerMove={handleJoystickMove}
        onPointerUp={handleJoystickUp}
        onPointerCancel={handleJoystickUp}
        style={{
          position: 'fixed',
          bottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          left: 'max(20px, env(safe-area-inset-left, 20px))',
          width: 116,
          height: 116,
          borderRadius: '50%',
          border: `1.5px solid ${joystickActive ? '#22d3ee' : 'rgba(34, 211, 238, 0.3)'}`,
          background: joystickActive ? 'rgba(8, 20, 44, 0.45)' : 'rgba(6, 12, 28, 0.25)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          boxShadow: joystickActive
            ? '0 0 20px rgba(34, 211, 238, 0.4), inset 0 0 12px rgba(34, 211, 238, 0.15)'
            : '0 0 10px rgba(0, 0, 0, 0.5)',
          pointerEvents: 'auto',
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.15s ease, background 0.15s ease',
        }}
      >
        {/* Reticle axis lines */}
        <div
          style={{
            position: 'absolute',
            width: 70,
            height: 1,
            background: 'rgba(34, 211, 238, 0.2)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 1,
            height: 70,
            background: 'rgba(34, 211, 238, 0.2)',
            pointerEvents: 'none',
          }}
        />

        {/* Joystick Thumb Knob */}
        <div
          style={{
            position: 'absolute',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: joystickActive
              ? 'radial-gradient(circle, #67e8f9 0%, #0891b2 100%)'
              : 'radial-gradient(circle, rgba(34, 211, 238, 0.75) 0%, rgba(14, 116, 144, 0.75) 100%)',
            border: '2px solid #22d3ee',
            boxShadow: joystickActive
              ? '0 0 16px #22d3ee, inset 0 0 6px #ffffff'
              : '0 0 8px rgba(34, 211, 238, 0.4)',
            transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: joystickActive ? 'none' : 'transform 0.18s cubic-bezier(0.1, 0.9, 0.2, 1)',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#ffffff',
              boxShadow: '0 0 4px #ffffff',
            }}
          />
        </div>
      </div>

      {/* ── Right Action Buttons (Boost & Fire) ─────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          bottom: 'max(18px, env(safe-area-inset-bottom, 18px))',
          right: 'max(18px, env(safe-area-inset-right, 18px))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 12,
          pointerEvents: 'none',
        }}
      >
        {/* Boost Button (Above and offset) */}
        <button
          type="button"
          className="touch-control"
          onPointerDown={handleBoostDown}
          onPointerUp={handleBoostUp}
          onPointerCancel={handleBoostUp}
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: `1.5px solid ${boostActive ? '#fbbf24' : 'rgba(251, 191, 36, 0.5)'}`,
            background: boostActive
              ? 'radial-gradient(circle, rgba(245, 158, 11, 0.8) 0%, rgba(180, 83, 9, 0.9) 100%)'
              : 'radial-gradient(circle, rgba(245, 158, 11, 0.22) 0%, rgba(120, 53, 15, 0.35) 100%)',
            boxShadow: boostActive
              ? '0 0 18px rgba(251, 191, 36, 0.8), inset 0 0 10px #fde047'
              : '0 0 8px rgba(251, 191, 36, 0.25)',
            transform: boostActive ? 'scale(0.92)' : 'scale(1)',
            transition: 'transform 0.08s ease, background 0.1s ease, box-shadow 0.1s ease',
            pointerEvents: 'auto',
            touchAction: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginRight: 18,
          }}
          aria-label="Afterburner Boost"
        >
          <ZapIcon size={18} color={boostActive ? '#ffffff' : '#fbbf24'} />
          <span
            style={{
              fontSize: 8,
              fontWeight: 900,
              color: boostActive ? '#ffffff' : '#fbbf24',
              letterSpacing: 1,
              marginTop: 1,
            }}
          >
            BOOST
          </span>
        </button>

        {/* Main Fire Button */}
        <button
          type="button"
          className="touch-control"
          onPointerDown={handleFireDown}
          onPointerUp={handleFireUp}
          onPointerCancel={handleFireUp}
          style={{
            width: 74,
            height: 74,
            borderRadius: '50%',
            border: `2px solid ${fireActive ? '#f43f5e' : 'rgba(244, 63, 94, 0.6)'}`,
            background: fireActive
              ? 'radial-gradient(circle, rgba(239, 68, 68, 0.85) 0%, rgba(159, 18, 57, 0.95) 100%)'
              : 'radial-gradient(circle, rgba(239, 68, 68, 0.25) 0%, rgba(136, 19, 55, 0.45) 100%)',
            boxShadow: fireActive
              ? '0 0 24px rgba(244, 63, 94, 0.9), inset 0 0 12px #ffffff'
              : '0 0 12px rgba(244, 63, 94, 0.35)',
            transform: fireActive ? 'scale(0.92)' : 'scale(1)',
            transition: 'transform 0.08s ease, background 0.1s ease, box-shadow 0.1s ease',
            pointerEvents: 'auto',
            touchAction: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
          aria-label="Dual Blasters Fire"
        >
          <CrosshairIcon size={24} color={fireActive ? '#ffffff' : '#f43f5e'} />
          <span
            style={{
              fontSize: 9,
              fontWeight: 900,
              color: fireActive ? '#ffffff' : '#f43f5e',
              letterSpacing: 1.5,
              marginTop: 2,
            }}
          >
            FIRE
          </span>
        </button>
      </div>
    </div>
  );
};
