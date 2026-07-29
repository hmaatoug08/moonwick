import { MUSIC } from "./config";
import { isMusicEnabled } from "./save";
import { audioContext } from "./sfx";

/**
 * Adaptive music — synthesised on the game's ONE AudioContext (sfx.ts),
 * never a second one. No audio file: the zero-asset pillar holds.
 *
 * Four layers, faded in and out, never cut:
 *   PAD      — permanent; tonality follows the current tier, root gliding
 *              with the tier transition; a lowpass opens with the combo and
 *              closes in the dark (the audible twin of the visual cooling).
 *   AIR      — a quiet filtered noise bed: candle-smoke / night wind, more
 *              audible in rest and as the run gets colder.
 *   RHYTHM   — soft low pulses on an eighth-note grid, entering from combo
 *              `MUSIC.rhythmEnterCombo`; density follows the multiplier.
 *   MELODY   — Full Moon only: a seeded walk over the tier's scale.
 *
 * NON-REPETITIVE BY CONSTRUCTION: rhythm and melody are drawn per bar from a
 * scale and a per-run seed (reseeded at every restart), so two runs never
 * sound identical and a 60 s session replayed twenty times never plays the
 * same passage. The Percée approach hollows the whole bed; the slow-motion
 * crossing silences it; losing the combo impoverishes it.
 *
 * ONE instance for the whole game: scenes set its mode (`run`/`rest`), never
 * own players, so the bed carries across menu -> run -> death with no cut
 * inside the 300 ms replay loop. Standing oscillators start once and are
 * mixed; the only transient nodes are the scheduled plucks, a handful per
 * second — nothing here shows up at 60 fps on The Wall.
 */

export type MusicMode = "silent" | "rest" | "run";

/** Live inputs from the run; all optional outside "run". */
export type MusicState = {
  /** 0 at x1, 1 at the multiplier cap. */
  combo?: number;
  /** Combo count, for the rhythm's entry threshold. */
  comboCount?: number;
  /** 0 full magic, 1 drained: closes the filter, retreats the layers. */
  cold?: number;
  /** 0 outside the Percée approach, 1 at the marker: hollows the bed. */
  tension?: number;
  /** True during the Percée slow-motion crossing: the music steps aside. */
  crossing?: boolean;
  fullMoon?: boolean;
  /** Index into TIERS: picks the pad's root note. */
  tierIndex?: number;
};

/** Small deterministic RNG (mulberry32), reseeded once per run. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private airBus: GainNode | null = null;
  private rhythmBus: GainNode | null = null;
  private melodyBus: GainNode | null = null;
  private chimeBus: GainNode | null = null;
  /** Send into the generated-impulse reverb — the room, still zero files. */
  private reverbSend: GainNode | null = null;
  private padVoices: { osc: OscillatorNode; mult: number }[] = [];
  private airNoise: AudioBuffer | null = null;

  private mode: MusicMode = "silent";
  private ducked = false;
  private tierIndex = 0;

  // JS-side smoothed values, written to the params every update.
  private level = 0;
  private airLevel = 0;
  private rhythmLevel = 0;
  private melodyLevel = 0;
  private filterHz = MUSIC.filterMinHz;

  // The grid: one clock for rhythm and melody, patterns drawn per bar.
  private random: () => number = rng(1);
  private nextStepAt = 0;
  private step = 0;
  private rhythmPattern: boolean[] = [];
  private melodyPattern: number[] = [];
  private melodyDegree = 0;

  private nextChimeAt = 0;

  /** Call on a real gesture (pointerdown) — autoplay policy. */
  unlock(): void {
    const ctx = this.ensureGraph();
    if (ctx && ctx.state === "suspended") void ctx.resume();
  }

  setMode(mode: MusicMode): void {
    this.mode = mode;
  }

  /** New run, new seed: two runs must never sound identical. */
  reseed(): void {
    this.random = rng((Math.random() * 0xffffffff) >>> 0);
    this.step = 0;
    this.rhythmPattern = [];
    this.melodyPattern = [];
  }

  /**
   * Pause/mute, callable while the scene's update loop is frozen — it writes
   * straight to the param instead of waiting for a frame. Wired to the
   * automatic pause AND to the tab losing focus (see ensureGraph).
   */
  duck(on: boolean): void {
    this.ducked = on;
    if (on && this.ctx && this.master) {
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    }
  }

  /** Advance the layers. Call every frame from the scene owning the moment. */
  update(dt: number, state: MusicState = {}): void {
    const ctx = this.ctx;
    if (
      !ctx ||
      !this.master ||
      !this.filter ||
      !this.airBus ||
      !this.rhythmBus ||
      !this.melodyBus
    ) return;
    if (ctx.state !== "running") return;

    const combo = state.combo ?? 0;
    const cold = state.cold ?? 0;
    const tension = state.tension ?? 0;

    // The pad's root follows the tier, gliding — the same 2 s changeover as
    // the sky, heard instead of seen.
    if (state.tierIndex !== undefined && state.tierIndex !== this.tierIndex) {
      this.tierIndex = state.tierIndex;
      this.applyRoot();
    }

    // Bed level: mode x music toggle x pause x the Percée hollow — and full
    // silence during the crossing, which owns the moment.
    const modeLevel = this.mode === "run" ? 1 : this.mode === "rest" ? MUSIC.restLevel : 0;
    const audible = isMusicEnabled() && !this.ducked && !state.crossing ? 1 : 0;
    const targetLevel =
      MUSIC.masterVolume * modeLevel * audible * (1 - MUSIC.tensionDuck * tension);

    // The filter is the light: open with the combo, closed by the cold.
    const openHz = MUSIC.filterMinHz + (MUSIC.filterMaxHz - MUSIC.filterMinHz) * combo;
    const targetHz = openHz * (1 - (1 - MUSIC.coldFilterFactor) * cold);

    // Layers retreat as the state empties — impoverishment, not a switch.
    const rhythmOn =
      this.mode === "run" && (state.comboCount ?? 0) >= MUSIC.rhythmEnterCombo ? 1 : 0;
    const melodyOn = this.mode === "run" && state.fullMoon ? 1 : 0;
    const airOn =
      this.mode === "rest"
        ? MUSIC.airRestPresence
        : this.mode === "run"
          ? MUSIC.airRunPresence + MUSIC.airColdLift * cold + MUSIC.airTensionLift * tension
          : 0;

    const k = 1 - Math.exp(-dt / MUSIC.smoothS);
    this.level += (targetLevel - this.level) * k;
    this.airLevel += (airOn - this.airLevel) * k;
    this.rhythmLevel += (rhythmOn - this.rhythmLevel) * k;
    this.melodyLevel += (melodyOn - this.melodyLevel) * k;
    this.filterHz += (targetHz - this.filterHz) * k;

    this.master.gain.value = this.level;
    this.airBus.gain.value = this.airLevel * MUSIC.airGain;
    this.rhythmBus.gain.value = this.rhythmLevel * MUSIC.rhythmGain;
    this.melodyBus.gain.value = this.melodyLevel * MUSIC.melodyGain;
    this.filter.frequency.value = this.filterHz;

    this.runGrid(combo);
    this.runChimes();
  }

  /**
   * The grid: schedules the next eighth notes a beat ahead of the clock.
   * Patterns are drawn from the run's seed at every bar — no fixed loop.
   */
  private runGrid(combo: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.rhythmBus || !this.melodyBus) return;
    const rhythmBus = this.rhythmBus;
    const melodyBus = this.melodyBus;
    const stepS = 60 / MUSIC.bpm / 2;
    const now = ctx.currentTime;

    // Neither layer audible: keep the clock aligned but schedule nothing.
    if (this.mode !== "run" || (this.rhythmLevel < 0.002 && this.melodyLevel < 0.002)) {
      this.nextStepAt = now;
      return;
    }
    if (this.nextStepAt < now - stepS) this.nextStepAt = now;

    while (this.nextStepAt < now + 0.12) {
      const inBar = this.step % MUSIC.stepsPerBar;
      if (inBar === 0) this.drawBar(combo);

      if (this.rhythmPattern[inBar]) {
        const root = MUSIC.tierRootHz[this.tierIndex] ?? MUSIC.tierRootHz[0];
        this.thump(
          (root / 2) * Math.pow(2, MUSIC.rhythmOctave),
          MUSIC.rhythmDecayS,
          rhythmBus,
          this.nextStepAt
        );
      }
      const degree = this.melodyPattern[inBar];
      if (degree !== undefined && degree >= 0 && this.melodyLevel >= 0.002) {
        const root = MUSIC.tierRootHz[this.tierIndex] ?? MUSIC.tierRootHz[0];
        const semis = MUSIC.scale[degree % MUSIC.scale.length];
        const freq = root * Math.pow(2, MUSIC.melodyOctave - 1 + semis / 12);
        this.pluck(freq, MUSIC.melodyDecayS, melodyBus, this.nextStepAt);
      }

      this.step++;
      this.nextStepAt += stepS;
    }
  }

  /** One bar of rhythm and melody, drawn from the seed. */
  private drawBar(combo: number): void {
    const density =
      MUSIC.rhythmDensityMin + (MUSIC.rhythmDensityMax - MUSIC.rhythmDensityMin) * combo;
    this.rhythmPattern = [];
    this.melodyPattern = [];
    for (let i = 0; i < MUSIC.stepsPerBar; i++) {
      // The downbeat always sounds; the rest is the seed's choice.
      this.rhythmPattern.push(i === 0 || this.random() < density);
      if (this.random() < MUSIC.melodyDensity) {
        // A walk, not a shuffle: step up or down the scale, rarely leap.
        const move = this.random();
        this.melodyDegree +=
          move < 0.4 ? 1 : move < 0.8 ? -1 : this.random() < 0.5 ? 2 : -2;
        this.melodyDegree =
          ((this.melodyDegree % MUSIC.scale.length) + MUSIC.scale.length) % MUSIC.scale.length;
        this.melodyPattern.push(this.melodyDegree);
      } else {
        this.melodyPattern.push(-1);
      }
    }
  }

  /** The rest's stray firefly chime, on no grid at all. */
  private runChimes(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    if (this.mode !== "rest" || this.level < 0.001) {
      this.nextChimeAt = 0;
      return;
    }
    if (this.nextChimeAt === 0) {
      this.nextChimeAt = now + MUSIC.chimeMinS + Math.random() * (MUSIC.chimeMaxS - MUSIC.chimeMinS);
      return;
    }
    if (now >= this.nextChimeAt) {
      const root = MUSIC.tierRootHz[0];
      const semis = MUSIC.scale[Math.floor(Math.random() * MUSIC.scale.length)];
      const bus = this.chimeBus ?? this.master;
      this.pluck(root * Math.pow(2, 3 + semis / 12), MUSIC.chimeDecayS, bus, now, MUSIC.chimeGain);
      this.nextChimeAt = 0;
    }
  }

  /**
   * One pluck into a bus, at an exact scheduled time. Three things separate
   * it from a bare sine: an octave partial that decays faster than the
   * fundamental, a breath of noise at note-on (what makes a pluck read as a
   * PHYSICAL event), and a start a hair sharp settling onto the pitch — a
   * plucked string does exactly that.
   */
  private pluck(
    freq: number,
    decayS: number,
    bus: AudioNode,
    at: number,
    gain = 1
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;

    for (const [ratio, share, decayShare] of [
      [1, 1, 1],
      [2, MUSIC.pluckPartialGain, 0.45]
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * ratio * (1 + MUSIC.pluckPitchSettle), at);
      osc.frequency.exponentialRampToValueAtTime(freq * ratio, at + 0.02);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(gain * share, at + 0.015);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decayS * decayShare);
      osc.connect(env).connect(bus);
      osc.start(at);
      osc.stop(at + decayS + 0.05);
    }

    // The breath: a few milliseconds of bandpassed noise around the note.
    const breath = ctx.createBufferSource();
    breath.buffer = this.ensureAirNoise(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq * 2;
    bp.Q.value = 1.2;
    const benv = ctx.createGain();
    benv.gain.setValueAtTime(gain * MUSIC.pluckNoiseGain, at);
    benv.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    breath.connect(bp).connect(benv).connect(bus);
    breath.start(at, Math.random() * 1.5, 0.08);
  }

  /**
   * The rhythm's voice: a soft drum skin, not a note — the pitch falls from
   * `thumpPitchDrop` down onto the root over the first 40 ms.
   */
  private thump(freq: number, decayS: number, bus: AudioNode, at: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * MUSIC.thumpPitchDrop, at);
    osc.frequency.exponentialRampToValueAtTime(freq, at + 0.04);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(1, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + decayS);
    osc.connect(env).connect(bus);
    osc.start(at);
    osc.stop(at + decayS + 0.05);
  }

  /** Glide every pad oscillator to the current tier's root. */
  private applyRoot(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const root = MUSIC.tierRootHz[this.tierIndex] ?? MUSIC.tierRootHz[0];
    for (const voice of this.padVoices) {
      voice.osc.frequency.setTargetAtTime(root * voice.mult, ctx.currentTime, MUSIC.rootGlideS);
    }
  }

  /**
   * The reverb's impulse response, generated: stereo noise under an
   * exponential decay, low-passed harder as the tail ages so the room
   * darkens the way real rooms do. A few hundred KB of samples computed
   * once at boot — never a file.
   */
  private makeImpulse(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * MUSIC.reverbSeconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const decay = Math.pow(1 - t, MUSIC.reverbDecay);
        // One-pole lowpass whose smoothing grows with the tail's age.
        const smooth = 0.6 + 0.39 * t;
        last = last * smooth + (Math.random() * 2 - 1) * (1 - smooth);
        data[i] = last * decay;
      }
    }
    return impulse;
  }

  /** Two seconds of soft noise, looped as the night-air layer. */
  private ensureAirNoise(ctx: AudioContext): AudioBuffer {
    if (this.airNoise) return this.airNoise;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Slightly pink-ish: smoother than raw white noise, cheaper than a
      // complex filter bank, and quiet enough to feel like texture.
      last = last * 0.985 + (Math.random() * 2 - 1) * 0.015;
      data[i] = last;
    }
    this.airNoise = buffer;
    return buffer;
  }

  /**
   * Build the standing graph once, on the SHARED context. Oscillators start
   * once and are mixed — starting nodes on a mode change clicks, and a 60 fps
   * loop must never allocate audio nodes per frame.
   */
  private ensureGraph(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = audioContext();
    if (!ctx) return null;
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = MUSIC.filterMinHz;
    this.filter.Q.value = 0.7;
    this.filter.connect(this.master);

    // The pad: root an octave down + fifth, each doubled and detuned a hair
    // apart so the pair beats slowly — the "alive" in the ambience. A third
    // pair sits further out and quieter (padWideCents): width, not chorus.
    const padGain = ctx.createGain();
    padGain.gain.value = MUSIC.padGain;
    padGain.connect(this.filter);
    const padWide = ctx.createGain();
    padWide.gain.value = MUSIC.padGain * MUSIC.padWideGain;
    padWide.connect(this.filter);
    const root = MUSIC.tierRootHz[this.tierIndex];
    const voices: { mult: number; cents: number; wide: boolean }[] = [
      { mult: 0.5, cents: -MUSIC.padDetuneCents, wide: false },
      { mult: 0.5, cents: MUSIC.padDetuneCents, wide: false },
      { mult: 0.75, cents: -MUSIC.padDetuneCents, wide: false },
      { mult: 0.75, cents: MUSIC.padDetuneCents, wide: false },
      { mult: 0.5, cents: MUSIC.padWideCents, wide: true },
      { mult: 0.75, cents: -MUSIC.padWideCents, wide: true }
    ];
    for (const spec of voices) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = root * spec.mult;
      osc.detune.value = spec.cents;
      osc.connect(spec.wide ? padWide : padGain);
      osc.start();
      this.padVoices.push({ osc, mult: spec.mult });
    }

    // Breathing: a slow LFO swaying the filter cutoff.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = MUSIC.breatheHz;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = MUSIC.breatheDepthHz;
    lfo.connect(lfoDepth).connect(this.filter.frequency);
    lfo.start();

    // Air: a looped, filtered noise bed. It makes the menu/death screen feel
    // alive even when the rhythmic layer is absent, and it thickens slightly
    // when the run gets cold or tense.
    this.airBus = ctx.createGain();
    this.airBus.gain.value = 0;
    const air = ctx.createBufferSource();
    air.buffer = this.ensureAirNoise(ctx);
    air.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = "bandpass";
    airFilter.frequency.value = MUSIC.airHz;
    airFilter.Q.value = MUSIC.airQ;
    air.connect(airFilter).connect(this.airBus).connect(this.filter);
    air.start();

    // Rhythm, melody and chime buses: plucks land here, levels ramp per frame.
    this.rhythmBus = ctx.createGain();
    this.rhythmBus.gain.value = 0;
    this.rhythmBus.connect(this.filter);
    this.melodyBus = ctx.createGain();
    this.melodyBus.gain.value = 0;
    this.melodyBus.connect(this.master);
    // Chimes bypass the mode-gated melody bus: they belong to the rest.
    this.chimeBus = ctx.createGain();
    this.chimeBus.gain.value = 1;
    this.chimeBus.connect(this.master);

    // THE ROOM: a convolution reverb whose impulse response is generated —
    // shaped noise with an exponentially decaying, progressively darkening
    // tail. This is what separates "oscillator" from "produced": the same
    // notes, standing in a space. Still zero files.
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(ctx);
    const reverbReturn = ctx.createGain();
    reverbReturn.gain.value = MUSIC.reverbReturn;
    convolver.connect(reverbReturn).connect(this.master);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(convolver);
    // The bed sits mostly dry; plucks and chimes ride the room openly.
    const bedSend = ctx.createGain();
    bedSend.gain.value = MUSIC.reverbBedSend;
    this.filter.connect(bedSend).connect(this.reverbSend);
    const pluckSend = ctx.createGain();
    pluckSend.gain.value = MUSIC.reverbPluckSend;
    this.melodyBus.connect(pluckSend);
    this.chimeBus.connect(pluckSend);
    pluckSend.connect(this.reverbSend);

    // Complete silence when the tab loses focus or hides — consistent with
    // the game's automatic pause. Only the MUSIC master ducks: the context is
    // shared with the effects and must not be suspended from here.
    const mute = () => this.duck(true);
    const unmute = () => this.duck(false);
    window.addEventListener("blur", mute);
    window.addEventListener("focus", unmute);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) mute();
      else unmute();
    });

    return ctx;
  }
}

/** The one music of the whole game. Scenes set its mode; nobody owns it. */
export const music = new Music();

// Debug/test handle, like `__moonwick` and `__moonwickStats` (main.ts).
(window as unknown as { __moonwickMusic?: Music }).__moonwickMusic = music;
