import { SFX } from "./config";
import { isSoundEnabled } from "./save";

/**
 * Sons synthétisés à la volée : aucun fichier, aucun préchargement.
 * Deux sons seulement — un swoosh de frôlement dont la hauteur monte avec le
 * combo, et un impact grave à la mort.
 *
 * Le contexte audio ne peut démarrer qu'après un geste utilisateur : on
 * l'ouvre paresseusement au premier son et on le réveille à chaque tap.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** À appeler sur un vrai geste (pointerdown), sinon le navigateur refuse. */
  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;

    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = SFX.masterVolume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  /** Bruit blanc d'une seconde, généré une fois et réutilisé. */
  private ensureNoise(ctx: AudioContext): AudioBuffer {
    if (this.noise) return this.noise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = buffer;
    return buffer;
  }

  /**
   * Frôlement : souffle court et sec. La hauteur du filtre monte avec le
   * combo, si bien qu'une longue chaîne s'entend monter en tension.
   */
  graze(combo: number): void {
    if (!isSoundEnabled()) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.master || ctx.state !== "running") return;

    const now = ctx.currentTime;
    const duration = SFX.swooshMs / 1000;
    const peak = Math.min(SFX.swooshBaseHz + combo * SFX.swooshHzPerCombo, SFX.swooshMaxHz);

    const source = ctx.createBufferSource();
    source.buffer = this.ensureNoise(ctx);

    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 6;
    // Balayage vers le haut : c'est ce qui donne le « swoosh ».
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

  /** Mort : impact grave qui descend, sans réverb ni traîne. */
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
}
