import type { PlayerInput } from '@lss/shared';
import { soundManager } from '../audio/SoundManager.js';

/**
 * Captures keyboard (WASD/Arrows), mouse (aim/fire), and mobile touch input.
 * Emits PlayerInput at a fixed rate for the server.
 */
export class InputManager {
  private keys = new Set<string>();
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;
  private touchJoystick: { x: number; y: number; active: boolean } = { x: 0, y: 0, active: false };
  private touchFire = false;
  private sequence = 0;
  private emitTimer: ReturnType<typeof setInterval> | null = null;
  private onInput: ((input: PlayerInput) => void) | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private camera: { x: number; y: number; zoom: number } = { x: 0, y: 0, zoom: 1 };

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
  }

  attach(canvas: HTMLCanvasElement, onInput: (input: PlayerInput) => void): void {
    this.canvas = canvas;
    this.onInput = onInput;

    // Keyboard
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);

    // Mouse
    canvas.addEventListener('mousemove', this.handleMouseMove);
    canvas.addEventListener('mousedown', this.handleMouseDown);
    canvas.addEventListener('mouseup', this.handleMouseUp);

    // Touch (mobile)
    canvas.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd);
    canvas.addEventListener('touchcancel', this.handleTouchEnd);

    // Initialize sound on first interaction
    const initSound = () => {
      soundManager.init();
      soundManager.resume();
      window.removeEventListener('keydown', initSound);
      canvas.removeEventListener('mousedown', initSound);
      canvas.removeEventListener('touchstart', initSound);
    };
    window.addEventListener('keydown', initSound);
    canvas.addEventListener('mousedown', initSound);
    canvas.addEventListener('touchstart', initSound);

    // Start emitting inputs at 30 Hz (server expects 25 Hz but allows some overhead)
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
      this.canvas.removeEventListener('mousemove', this.handleMouseMove);
      this.canvas.removeEventListener('mousedown', this.handleMouseDown);
      this.canvas.removeEventListener('mouseup', this.handleMouseUp);
      this.canvas.removeEventListener('touchstart', this.handleTouchStart);
      this.canvas.removeEventListener('touchmove', this.handleTouchMove);
      this.canvas.removeEventListener('touchend', this.handleTouchEnd);
      this.canvas.removeEventListener('touchcancel', this.handleTouchEnd);
    }
    this.canvas = null;
    this.onInput = null;
    this.keys.clear();
    this.mouseDown = false;
    this.touchJoystick = { x: 0, y: 0, active: false };
    this.touchFire = false;
  }

  /** Update camera position for world-space aim calculation. */
  updateCamera(x: number, y: number, zoom: number): void {
    this.camera = { x, y, zoom };
  }

  /** Get current input state for local prediction. */
  getCurrentInput(shipX: number, shipY: number): PlayerInput {
    const input = this.buildInput();
    // Calculate aim angle from ship position to mouse world position
    const worldMouseX = (this.mouseX - this.canvas!.width / 2) / this.camera.zoom + this.camera.x;
    const worldMouseY = (this.mouseY - this.canvas!.height / 2) / this.camera.zoom + this.camera.y;
    input.aimAngle = Math.atan2(worldMouseY - shipY, worldMouseX - shipX);
    return input;
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.repeat) return;
    const key = e.key.toLowerCase();
    this.keys.add(key);
    // Mute toggle
    if (key === 'm') {
      soundManager.toggleMute();
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.keys.delete(e.key.toLowerCase());
  }

  private handleMouseMove(e: MouseEvent): void {
    const rect = this.canvas!.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  }

  private handleMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      this.mouseDown = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.mouseDown = false;
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
        this.touchJoystick = { x, y, active: true };
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
        this.touchJoystick.x = x;
        this.touchJoystick.y = y;
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

  private buildInput(): PlayerInput {
    // Keyboard movement
    const up = this.keys.has('w') || this.keys.has('arrowup') || this.keys.has(' ');
    const down = this.keys.has('s') || this.keys.has('arrowdown');
    const left = this.keys.has('a') || this.keys.has('arrowleft');
    const right = this.keys.has('d') || this.keys.has('arrowright');

    // Mobile joystick overrides keyboard
    const touchActive = this.touchJoystick.active;
    const touchThreshold = 30;
    const joystickUp = touchActive && this.touchJoystick.y < -touchThreshold;
    const joystickDown = touchActive && this.touchJoystick.y > touchThreshold;
    const joystickLeft = touchActive && this.touchJoystick.x < -touchThreshold;
    const joystickRight = touchActive && this.touchJoystick.x > touchThreshold;

    return {
      up: up || joystickUp,
      down: down || joystickDown,
      left: left || joystickLeft,
      right: right || joystickRight,
      aimAngle: 0, // Calculated in getCurrentInput or emitInput
      shooting: this.mouseDown || this.touchFire,
      sequence: ++this.sequence,
    };
  }

  private emitInput(): void {
    if (!this.onInput || !this.canvas) return;
    const input = this.buildInput();
    // Aim angle will be set by the scene calling getCurrentInput
    this.onInput(input);
  }
}
