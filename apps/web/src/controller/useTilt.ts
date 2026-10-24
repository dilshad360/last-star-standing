import { useCallback, useEffect, useRef, useState } from 'react';
import { TILT_DEADZONE_DEGREES, TILT_MAX_DEGREES } from '@lss/shared';

export type TiltPermission = 'unsupported' | 'prompt' | 'granted' | 'denied';

type OrientationEventCtor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

const shape = (degrees: number): number => {
  const magnitude = Math.abs(degrees);
  if (magnitude <= TILT_DEADZONE_DEGREES) return 0;
  const scaled = (magnitude - TILT_DEADZONE_DEGREES) / (TILT_MAX_DEGREES - TILT_DEADZONE_DEGREES);
  return Math.sign(degrees) * Math.min(1, scaled);
};

/** Maps beta/gamma to screen-space x/y for the current screen rotation. */
function screenTilt(beta: number, gamma: number): { x: number; y: number } {
  const angle = (screen.orientation?.angle ?? (window as { orientation?: number }).orientation ?? 0) as number;
  switch (((angle % 360) + 360) % 360) {
    case 90:
      return { x: beta, y: -gamma };
    case 270:
      return { x: -beta, y: gamma };
    case 180:
      return { x: -gamma, y: -beta };
    default:
      return { x: gamma, y: beta };
  }
}

/**
 * Phone tilt as an analog stick. `vector.current` holds -1..1 x/y relative
 * to the pose captured by calibrate(); it is a ref so reading it at 30 Hz
 * never re-renders React.
 */
export function useTilt(enabled: boolean) {
  const vector = useRef({ x: 0, y: 0 });
  const raw = useRef<{ x: number; y: number } | null>(null);
  const neutral = useRef<{ x: number; y: number } | null>(null);
  const [permission, setPermission] = useState<TiltPermission>(() => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return 'unsupported';
    if (!window.isSecureContext) return 'unsupported';
    return typeof (DeviceOrientationEvent as OrientationEventCtor).requestPermission === 'function'
      ? 'prompt'
      : 'granted';
  });

  const request = useCallback(async (): Promise<boolean> => {
    const ctor = DeviceOrientationEvent as OrientationEventCtor;
    if (typeof ctor.requestPermission !== 'function') return permission === 'granted';
    try {
      const result = await ctor.requestPermission();
      setPermission(result);
      return result === 'granted';
    } catch {
      setPermission('denied');
      return false;
    }
  }, [permission]);

  const calibrate = useCallback(() => {
    neutral.current = raw.current ? { ...raw.current } : null;
  }, []);

  useEffect(() => {
    if (!enabled || permission !== 'granted') {
      vector.current = { x: 0, y: 0 };
      return;
    }
    const onOrientation = (event: DeviceOrientationEvent) => {
      if (event.beta === null || event.gamma === null) return;
      const tilt = screenTilt(event.beta, event.gamma);
      raw.current = tilt;
      neutral.current ??= { ...tilt };
      vector.current = {
        x: shape(tilt.x - neutral.current.x),
        y: shape(tilt.y - neutral.current.y),
      };
    };
    const onRotate = () => {
      neutral.current = null;
    };
    window.addEventListener('deviceorientation', onOrientation);
    screen.orientation?.addEventListener?.('change', onRotate);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
      screen.orientation?.removeEventListener?.('change', onRotate);
      vector.current = { x: 0, y: 0 };
    };
  }, [enabled, permission]);

  return { vector, permission, request, calibrate };
}
