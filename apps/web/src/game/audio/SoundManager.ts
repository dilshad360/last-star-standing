/**
 * Web Audio API procedural sound synthesizer.
 * All sound effects are generated algorithmically — no audio files needed.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  constructor() {
    // Initialize on first user interaction to comply with browser autoplay policies
    this.init = this.init.bind(this);
  }

  /** Initialize AudioContext (call once after user gesture). */
  init(): void {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.3;
    this.masterGain.connect(this.ctx.destination);
  }

  /** Resume context if suspended (called after user interaction). */
  resume(): void {
    if (this.ctx?.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  /** Toggle mute state. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : 0.3;
    }
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  // ── Sound effects ─────────────────────────────────────────────────────────

  /** Laser projectile fire. */
  playLaser(): void {
    this.playTone({
      frequency: 800,
      frequencyEnd: 400,
      duration: 0.08,
      type: 'sawtooth',
      volume: 0.15,
    });
  }

  /** Hull hit / damage taken. */
  playHit(): void {
    this.playNoise({
      duration: 0.1,
      volume: 0.2,
      filterFrequency: 800,
      filterQ: 2,
    });
  }

  /** Asteroid destruction crunch. */
  playAsteroidCrunch(): void {
    this.playNoise({
      duration: 0.25,
      volume: 0.25,
      filterFrequency: 400,
      filterQ: 1,
    });
  }

  /** Ship explosion / elimination. */
  playExplosion(): void {
    // Layered explosion: noise burst + low sine boom
    this.playNoise({
      duration: 0.4,
      volume: 0.3,
      filterFrequency: 200,
      filterQ: 0.5,
    });
    this.playTone({
      frequency: 60,
      frequencyEnd: 30,
      duration: 0.4,
      type: 'sine',
      volume: 0.2,
    });
  }

  /** Pickup collected chime. */
  playPickup(): void {
    this.playTone({
      frequency: 600,
      frequencyEnd: 1200,
      duration: 0.15,
      type: 'sine',
      volume: 0.15,
    });
    // Add harmonic shimmer
    setTimeout(() => {
      this.playTone({
        frequency: 900,
        frequencyEnd: 1500,
        duration: 0.1,
        type: 'sine',
        volume: 0.1,
      });
    }, 80);
  }

  /** EMP Nova shockwave discharge sound. */
  playEmpBlast(): void {
    this.playNoise({
      duration: 0.5,
      volume: 0.35,
      filterFrequency: 600,
      filterQ: 3,
    });
    this.playTone({
      frequency: 420,
      frequencyEnd: 45,
      duration: 0.45,
      type: 'sawtooth',
      volume: 0.25,
    });
  }

  /** Storm warning pulse (repeating alarm). */
  playStormAlarm(): void {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.playTone({
          frequency: 400,
          frequencyEnd: 600,
          duration: 0.15,
          type: 'square',
          volume: 0.1,
        });
      }, i * 200);
    }
  }

  /** Countdown beep. */
  playCountdown(final = false): void {
    this.playTone({
      frequency: final ? 880 : 440,
      duration: final ? 0.4 : 0.15,
      type: 'sine',
      volume: 0.15,
    });
  }

  /** Victory fanfare. */
  playVictory(): void {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => {
        this.playTone({
          frequency: freq,
          duration: 0.3,
          type: 'triangle',
          volume: 0.15,
        });
      }, i * 150);
    });
  }

  // ── Synthesis primitives ──────────────────────────────────────────────────

  private playTone(opts: {
    frequency: number;
    frequencyEnd?: number;
    duration: number;
    type: OscillatorType;
    volume: number;
  }): void {
    if (!this.ctx || !this.masterGain || this.muted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = opts.type;
    osc.frequency.setValueAtTime(opts.frequency, now);
    if (opts.frequencyEnd) {
      osc.frequency.exponentialRampToValueAtTime(opts.frequencyEnd, now + opts.duration);
    }

    gain.gain.setValueAtTime(opts.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + opts.duration);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + opts.duration);
  }

  private playNoise(opts: {
    duration: number;
    volume: number;
    filterFrequency: number;
    filterQ: number;
  }): void {
    if (!this.ctx || !this.masterGain || this.muted) return;

    const bufferSize = this.ctx.sampleRate * opts.duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = opts.filterFrequency;
    filter.Q.value = opts.filterQ;

    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    gain.gain.setValueAtTime(opts.volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + opts.duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(now);
    noise.stop(now + opts.duration);
  }
}

/** Singleton sound manager. */
export const soundManager = new SoundManager();
