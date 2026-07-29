import { SFX } from "./config";
import { isSoundEnabled } from "./save";

/**
 * Sounds synthesised on the fly: no files, no preloading.
 *
 * The audio context can only start after a user gesture, so it opens lazily
 * on the first sound and wakes up on every tap. There is exactly ONE context
 * for the whole game — the music (src/music.ts) builds its layers on this
 * same context, never a second one.
 */
let sharedCtx: AudioContext | null = null;

/** The game's one AudioContext, created lazily. Null if Web Audio is absent. */
export function audioContext(): AudioContext | null {
  if (sharedCtx) return sharedCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  sharedCtx = new Ctor();
  return sharedCtx;
}

/** Call on a real gesture (pointerdown), otherwise the browser refuses. */
export function unlockAudio(): void {
  const ctx = audioContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** 0 normally, 1 at the Percée marker: the world's sound hollows out. */
  private tension = 0;

  /** Approach to the record: detunes the graze swoosh downward. */
  setTension(k: number): void {
    this.tension = Math.max(0, Math.min(1, k));
  }

  /** Swoosh pitch multiplier for the current tension. */
  private tensionRatio(): number {
    // Cents -> ratio: a negative detune drops the pitch, which is what makes
    // the forest feel like it is holding its breath.
    return Math.pow(2, (SFX.tensionDetuneCents * this.tension) / 1200);
  }

  /** Call on a real gesture (pointerdown), otherwise the browser refuses. */
  unlock(): void {
    this.ensureContext();
    unlockAudio();
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = audioContext();
    if (!ctx) return null;

    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = SFX.masterVolume;
    this.master.connect(ctx.destination);
    return this.ctx;
  }

  /** One second of white noise, generated once and reused. */
  private ensureNoise(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  /**
   * Graze: a short, dry breath. The filter pitch rises with the combo, so a
   * long chain can be heard building tension.
   */
  graze(combo: number): void {
    if (!isSoundEnabled()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master || ctx.state !== "running") return;

    const now = ctx.currentTime;
    const duration = SFX.swooshMs / 1000;
    const peak =
      Math.min(SFX.swooshBaseHz + combo * SFX.swooshHzPerCombo, SFX.swooshMaxHz) *
      this.tensionRatio();

    const source = ctx.createBufferSource();
    source.buffer = this.ensureNoise(ctx);

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 6;
    // Upward sweep: this is what makes it read as a "swoosh".
    band.frequency.setValueAtTime(peak * 0.45, now);
    band.frequency.exponentialRampToValueAtTime(peak, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    source.connect(band).connect(gain).connect(this.master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  /** Death: a low impact sliding down, no reverb, no tail. */
  death(): void {
    if (!isSoundEnabled()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master || ctx.state !== "running") return;

    const now = ctx.currentTime;
    const duration = SFX.deathMs / 1000;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(SFX.deathFromHz, now);
    osc.frequency.exponentialRampToValueAtTime(SFX.deathToHz, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(1.4, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  /**
   * Firefly pickup: a short crystalline chime. Two sine partials and a fast
   * decay — it fires on every graze, so it has to sit under the swoosh rather
   * than compete with it.
   */
  spark(): void {
    if (!isSoundEnabled()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master || ctx.state !== "running") return;

    const now = ctx.currentTime;
    const duration = SFX.sparkMs / 1000;

    for (const ratio of [1, SFX.sparkPartialRatio]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(SFX.sparkHz * ratio, now);

      const gain = ctx.createGain();
      const peak = SFX.sparkGain / ratio;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain).connect(this.master);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    }
  }
}
