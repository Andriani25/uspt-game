const BPM = 124;
const STEP_DUR = 60 / BPM / 4;
const LOOKAHEAD = 0.15;
const TICK_MS = 25;
const STEPS_PER_BAR = 16;
const VOLUME = 0.7;

interface Bar {
  bass: number;
  chord: [number, number, number];
}

const PROGRESSION: Bar[] = [
  { bass: 45, chord: [57, 60, 64] },
  { bass: 41, chord: [53, 57, 60] },
  { bass: 48, chord: [55, 60, 64] },
  { bass: 43, chord: [55, 59, 62] },
];

const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 1, 2, 1];

function freq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private send: DelayNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private running = false;

  start(): void {
    if (this.running) {
      return;
    }
    const ctx = this.ensure();
    if (!ctx || !this.bus) {
      return;
    }
    void ctx.resume().catch(() => undefined);
    this.running = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    const gain = this.bus.gain;
    gain.cancelScheduledValues(ctx.currentTime);
    gain.setValueAtTime(Math.max(gain.value, 0.0001), ctx.currentTime);
    gain.exponentialRampToValueAtTime(VOLUME, ctx.currentTime + 0.9);
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), TICK_MS);
  }

  stop(): void {
    if (!this.running) {
      return;
    }
    this.running = false;
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) {
      return;
    }
    const now = ctx.currentTime;
    const gain = bus.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(Math.max(gain.value, 0.0001), now);
    gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) {
      return this.ctx;
    }
    try {
      const ctx = new AudioContext();
      const bus = ctx.createGain();
      bus.gain.value = 0.0001;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      bus.connect(comp);
      comp.connect(ctx.destination);

      const delay = ctx.createDelay(1);
      delay.delayTime.value = (60 / BPM) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.3;
      const wet = ctx.createGain();
      wet.gain.value = 0.28;
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(bus);

      this.ctx = ctx;
      this.bus = bus;
      this.send = delay;
      return ctx;
    } catch {
      return null;
    }
  }

  private noise(): AudioBuffer {
    if (!this.noiseBuffer && this.ctx) {
      const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buffer;
    }
    return this.noiseBuffer as AudioBuffer;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.running) {
      return;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % (PROGRESSION.length * STEPS_PER_BAR);
      this.nextTime += STEP_DUR;
    }
  }

  private playStep(step: number, t: number): void {
    const bar = PROGRESSION[Math.floor(step / STEPS_PER_BAR)];
    const s = step % STEPS_PER_BAR;

    if (s % 4 === 0) {
      this.kick(t);
    }
    if (s % 4 === 2) {
      this.clap(t);
    }
    if (s % 2 === 1) {
      this.hat(t, s % 8 === 3 || s % 8 === 7 ? 0.1 : 0.055);
    }
    if (s % 2 === 0) {
      this.bass(t, freq(bar.bass + (s === 14 ? 12 : 0)), STEP_DUR * 1.9);
    }

    const tone = ARP[s];
    const midi = tone < 3 ? bar.chord[tone] : bar.chord[0] + 12;
    this.pluck(t, freq(midi), STEP_DUR * 1.5);
  }

  private kick(t: number): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) {
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.connect(gain);
    gain.connect(bus);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  private hat(t: number, level: number): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) {
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(hp);
    hp.connect(gain);
    gain.connect(bus);
    src.start(t);
    src.stop(t + 0.08);
  }

  private clap(t: number): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const send = this.send;
    if (!ctx || !bus || !send) {
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1750;
    bp.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(bus);
    gain.connect(send);
    src.start(t);
    src.stop(t + 0.2);
  }

  private bass(t: number, f: number, dur: number): void {
    const ctx = this.ctx;
    const bus = this.bus;
    if (!ctx || !bus) {
      return;
    }
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = f;
    sub.type = "sine";
    sub.frequency.value = f / 2;
    lp.type = "lowpass";
    lp.Q.value = 6;
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + dur * 0.9);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp);
    sub.connect(lp);
    lp.connect(gain);
    gain.connect(bus);
    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.05);
    sub.stop(t + dur + 0.05);
  }

  private pluck(t: number, f: number, dur: number): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const send = this.send;
    if (!ctx || !bus || !send) {
      return;
    }
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = f;
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(1400, t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp);
    lp.connect(gain);
    gain.connect(bus);
    gain.connect(send);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

export const music = new Music();
