import type { PlayerInput } from '@lss/shared';
import { SHIP_TURN_SPEED } from '@lss/shared';
import { soundManager } from '../audio/SoundManager.js';

/**
 * Authentic space flight input manager:
 * A / D: Direction steering (counter-clockwise / clockwise rotation).
 * W / S: Main forward thruster / reverse retro-braking thruster.
 * Space: Dual wing laser blasters.
 * Shift: Afterburner speed boost.
 */
export class InputManager {
  private keys = new Set<string>();
  private facingAngle = -Math.PI / 2; // Default facing North / Upwards
  private lastUpdateTime = performance.now();
  private touchJoystick: { x: number; y: number; active: boolean } = { x: 0, y: 0, active: false };
  private touchFire = false;
  private sequence = 0;
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private onInput: ((input: PlayerInput) => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
  }

  attach(canvas: HTMLCanvasElement, onInput: (input: PlayerInput) => void): void {
    this.canvas = canvas;
    this.onInput = onInput;

    // Set cursor to default
    canvas.style.cursor = 'default';

    // Keyboard listeners
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Touch (mobile fallback)
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd);
    canvas.addEventListener('touchcancel', this.handleTouchEnd);

    // Initialize sound on first user interaction
    const initSound = () => {
      soundManager.init();
      soundManager.resume();
      window.removeEventListener('keydown', initSound);
      canvas.removeEventListener('touchstart', initSound);
    };
    window.addEventListener('keydown', initSound);
    canvas.addEventListener('touchstart', initSound);

    // Emit inputs at 30 Hz
    this.emitTimer = setInterval(() => this.emitInput(), 33);
  }

  detach(): void {
    if (this.emitTimer) {
      clearInterval(this.emitTimer);
      this.emitTimer = null;
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    if (this.canvas) {
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
      this.canvas.removeEventListener('touchmove', this.handleTouchMove);
      this.canvas.removeEventListener('touchend', this.handleTouchEnd);
      this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
    }
    this.canvas = null;
    this.onInput = null;
    this.keys.clear();
    this.touchJoystick = { x: 0, y: 0, active: false };
    this.touchFire = false;
  }

  /** Update camera position (retained for interface compatibility). */
  updateCamera(_x: number, _y: number, _zoom: number): void {
    // No-op without mouse aim
  }

  /** Current facing angle of the ship in radians based on directional WASD inputs. */
  getFacingAngle(): number {
    return this.facingAngle;
  }

  /** Check if Afterburner Boost is active (Shift key held). */
  isBoosting(): boolean {
    return this.keys.has('shift');
  }

  /** Check if Flight Assist / Space Drift is active. */
  isDrifting(): boolean {
    return this.keys.has('shift');
  }

  /** Get current input state for local prediction. */
  getCurrentInput(): PlayerInput {
    return this.buildInput();
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private handleKeyDown(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keys.add(key);

    // Also support e.code for consistent spacebar handling
    if (e.code === 'Space') {
      this.keys.add(' ');
      this.keys.add('space');
      e.preventDefault();
    }

    if (e.repeat) return;

    // Mute toggle
    if (key === 'm') {
      soundManager.toggleMute();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    this.keys.delete(key);
    if (e.code === 'Space') {
      this.keys.delete(' ');
      this.keys.delete('space');
    }
  }

  private handleTouchStart(e: TouchEvent): void {
    e.preventDefault();
    const rect = this.canvas!.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]!;
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      // Left half = joystick, right half = fire
      if (x < rect.width / 2) {
        this.touchJoystick = { x: x - rect.width / 4, y: y - rect.height * 0.75, active: true };
      } else {
        this.touchFire = true;
      }
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const rect = this.canvas!.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]!;
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      if (this.touchJoystick.active && x < rect.width / 2) {
        this.touchJoystick.x = x - rect.width / 4;
        this.touchJoystick.y = y - rect.height * 0.75;
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]!;
      const rect = this.canvas!.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      if (x < rect.width / 2) {
        this.touchJoystick.active = false;
      } else {
        this.touchFire = false;
      }
    }
  }

  // ── Input building & emission ─────────────────────────────────────────────

  public update(dtSeconds?: number): void {
    const now = performance.now();
    const dt = dtSeconds ?? Math.min(0.05, (now - this.lastUpdateTime) / 1000);
    this.lastUpdateTime = now;

    // Steering: A/ArrowLeft turns counter-clockwise, D/ArrowRight turns clockwise
    const turnLeft = this.keys.has('a') || this.keys.has('arrowleft');
    const turnRight = this.keys.has('d') || this.keys.has('arrowright');

    if (turnLeft && !turnRight) {
      this.facingAngle -= SHIP_TURN_SPEED * dt;
    } else if (turnRight && !turnLeft) {
      this.facingAngle += SHIP_TURN_SPEED * dt;
    }

    if (this.touchJoystick.active) {
      if (this.touchJoystick.x < -18) {
        this.facingAngle -= SHIP_TURN_SPEED * dt;
      } else if (this.touchJoystick.x > 18) {
        this.facingAngle += SHIP_TURN_SPEED * dt;
      }
    }

    // Keep angle normalized in [-PI, PI]
    while (this.facingAngle > Math.PI) this.facingAngle -= Math.PI * 2;
    while (this.facingAngle < -Math.PI) this.facingAngle += Math.PI * 2;
  }

  public buildInput(): PlayerInput {
    this.update();

    // Thrusters: W is forward main engine, S is reverse retro thruster
    const forward = this.keys.has('w') || this.keys.has('arrowup');
    const reverse = this.keys.has('s') || this.keys.has('arrowdown');
    const turnLeft = this.keys.has('a') || this.keys.has('arrowleft');
    const turnRight = this.keys.has('d') || this.keys.has('arrowright');

    // Mobile touch joystick
    const touchActive = this.touchJoystick.active;
    const touchThreshold = 20;
    const joystickForward = touchActive && this.touchJoystick.y < -touchThreshold;
    const joystickReverse = touchActive && this.touchJoystick.y > touchThreshold;
    const joystickLeft = touchActive && this.touchJoystick.x < -touchThreshold;
    const joystickRight = touchActive && this.touchJoystick.x > touchThreshold;

    const shooting = this.keys.has(' ') || this.keys.has('space') || this.touchFire;
    const boost = this.keys.has('shift');

    return {
      up: forward || joystickForward,
      down: reverse || joystickReverse,
      left: turnLeft || joystickLeft,
      right: turnRight || joystickRight,
      aimAngle: this.facingAngle,
      shooting,
      boost,
      drift: boost,
      sequence: ++this.sequence,
    };
  }

  private emitInput(): void {
    if (!this.onInput || !this.canvas) return;
    const input = this.buildInput();
    this.onInput(input);
  }
}
