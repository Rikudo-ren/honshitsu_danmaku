// ─────────────────────────────────────────────────────────────
//  Procedural Audio — 全音源を WebAudio でリアルタイム合成
//  ・BGM: 16ステップ・ルックアヘッド・シーケンサ（強度で層が増える）
//  ・SFX: 音響心理に基づく帯域分離（グレイズ=高域の粒 / 被弾=低域の塊）
//  ・「は？」: 鋸波 + 母音/a/フォルマント(800/1250Hz) + 上昇ピッチ = 疑問形の声
// ─────────────────────────────────────────────────────────────

interface BgmDef {
  readonly tempo: number;
  readonly root: number;
  readonly scale: readonly number[];
  readonly prog: readonly number[];
  readonly motif: readonly number[];
}

const REST = -99;
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARM = [0, 2, 3, 5, 7, 8, 11];
const PHRYG = [0, 1, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const R = REST;

const BGMS: readonly BgmDef[] = [
  { tempo: 150, root: 50, scale: DORIAN, prog: [0, 5, 3, 4], motif: [7, R, 9, 7, 4, R, 5, R, 7, R, 11, 9, 7, 5, 4, R] },
  { tempo: 156, root: 45, scale: HARM, prog: [0, 3, 5, 4], motif: [4, R, 4, 5, 7, R, 5, 4, 2, R, 4, R, 6, R, 7, R] },
  { tempo: 144, root: 52, scale: MINOR, prog: [0, 5, 2, 6], motif: [9, R, R, 7, 11, R, 9, R, 7, R, 4, R, 7, 9, R, R] },
  { tempo: 164, root: 53, scale: MINOR, prog: [0, 5, 3, 4], motif: [7, 9, 7, R, 4, R, 2, 4, 7, R, 9, 11, 9, R, 7, R] },
  { tempo: 170, root: 47, scale: PHRYG, prog: [0, 1, 0, 6], motif: [7, R, 8, 7, R, 5, 7, R, 10, R, 8, R, 7, 5, 8, R] },
  { tempo: 160, root: 48, scale: MINOR, prog: [5, 3, 0, 4], motif: [7, R, 9, 11, 9, R, 7, R, 4, R, 7, R, 9, R, 11, 14] },
  { tempo: 116, root: 52, scale: MAJOR, prog: [0, 4, 5, 3], motif: [4, R, R, 7, R, R, 9, R, 7, R, R, 4, R, R, 2, R] },
];

type Webkit = Window & { webkitAudioContext?: typeof AudioContext };

export class GameAudio {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private bgmFilter: BiquadFilterNode | null = null;
  private sfxBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private bgm: BgmDef | null = null;
  private bgmIdx = -1;
  private intensity = 0;
  private nextTime = 0;
  private step = 0;
  private playing = false;
  muted = false;

  // throttles
  private tGraze = 0;
  private tShot = 0;
  private tItem = 0;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as Webkit).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : 0.8;
    master.connect(comp);
    this.master = master;
    const bf = ctx.createBiquadFilter();
    bf.type = 'lowpass';
    bf.frequency.value = 18000;
    bf.connect(master);
    this.bgmFilter = bf;
    const bb = ctx.createGain();
    bb.gain.value = 0.55;
    bb.connect(bf);
    this.bgmBus = bb;
    const sb = ctx.createGain();
    sb.gain.value = 0.9;
    sb.connect(master);
    this.sfxBus = sb;
    // white noise buffer (1s) — 一度だけ生成
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    this.noise = buf;
    if (this.bgmIdx >= 0) {
      this.nextTime = ctx.currentTime + 0.08;
      this.playing = true;
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  // ── BGM ────────────────────────────────────────────────
  bgmStart(idx: number, intensity: number): void {
    this.intensity = intensity;
    if (idx === this.bgmIdx && this.playing) return;
    this.bgmIdx = idx;
    this.bgm = BGMS[idx];
    this.step = 0;
    this.playing = true;
    if (this.ctx) this.nextTime = this.ctx.currentTime + 0.08;
  }
  setIntensity(i: number): void {
    this.intensity = i;
  }
  bgmStop(): void {
    this.playing = false;
  }
  setMuffle(on: boolean): void {
    if (!this.ctx || !this.bgmFilter) return;
    this.bgmFilter.frequency.setTargetAtTime(on ? 520 : 18000, this.ctx.currentTime, 0.06);
  }

  /** RAF 毎に呼ぶ。120ms 先までスケジュール */
  tick(): void {
    const ctx = this.ctx;
    if (!ctx || !this.playing || !this.bgm || ctx.state !== 'running') return;
    const stepDur = 60 / this.bgm.tempo / 4;
    if (this.nextTime < ctx.currentTime - 0.25) this.nextTime = ctx.currentTime + 0.02;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private deg(def: BgmDef, d: number): number {
    const n = def.scale.length;
    const o = Math.floor(d / n);
    const idx = ((d % n) + n) % n;
    return def.root + def.scale[idx] + 12 * o;
  }

  private scheduleStep(s: number, t: number, sd: number): void {
    const def = this.bgm;
    if (!def) return;
    const st = s & 15;
    const bar = s >> 4;
    const cd = def.prog[bar & 3];
    const I = this.intensity;
    const rootM = this.deg(def, cd);

    if (I === 0) {
      if (st === 0) {
        this.pad(t, rootM, sd * 16);
        this.pad(t, this.deg(def, cd + 2), sd * 16);
        this.pad(t, this.deg(def, cd + 4), sd * 16);
      }
      if ((st & 1) === 0) {
        const arpD = [0, 2, 4, 7, 4, 2, 0, 4][(st >> 1) & 7];
        this.arp(t, this.deg(def, cd + arpD) + 12, 0.018);
      }
      if ((st & 3) === 2) this.hat(t, false, 0.025);
      return;
    }
    // Drums
    if ((st & 3) === 0) this.kick(t);
    if (st === 4 || st === 12) this.snare(t);
    if (I >= 3 && (st === 14 || st === 15)) this.snare(t);
    if ((st & 1) === 1) this.hat(t, st === 7 || st === 15, 0.05);
    else if (I >= 3) this.hat(t, false, 0.03);
    // Bass (8ths, octave jump)
    if ((st & 1) === 0) this.bass(t, rootM - 12 + ((st & 2) ? 12 : 0), sd * 1.8);
    // Arp (16ths)
    const arpD = [0, 2, 4, 7][st & 3] + ((st & 4) ? 7 : 0);
    this.arp(t, this.deg(def, cd + arpD) + 12, I >= 2 ? 0.02 : 0.024);
    // Pad
    if (st === 0) {
      this.pad(t, rootM, sd * 16);
      this.pad(t, this.deg(def, cd + 4), sd * 16);
    }
    // Lead
    if (I >= 2) {
      const m = def.motif[st];
      if (m !== REST) this.lead(t, this.deg(def, cd + m) + 12, sd * 1.9);
    }
  }

  // ── Instruments ────────────────────────────────────────
  private env(g: GainNode, t: number, peak: number, a: number, d: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  private freq(m: number): number {
    return 440 * Math.pow(2, (m - 69) / 12);
  }
  private kick(t: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.55, 0.004, 0.16);
    o.connect(g).connect(this.bgmBus!);
    o.start(t);
    o.stop(t + 0.2);
  }
  private noiseSrc(t: number, dur: number): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.start(t, Math.random() * 0.5, dur + 0.05);
    return n;
  }
  private snare(t: number): void {
    const ctx = this.ctx!;
    const n = this.noiseSrc(t, 0.14);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    this.env(g, t, 0.2, 0.002, 0.12);
    n.connect(f).connect(g).connect(this.bgmBus!);
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
    this.env(og, t, 0.12, 0.002, 0.08);
    o.connect(og).connect(this.bgmBus!);
    o.start(t);
    o.stop(t + 0.12);
  }
  private hat(t: number, open: boolean, vol: number): void {
    const ctx = this.ctx!;
    const d = open ? 0.1 : 0.03;
    const n = this.noiseSrc(t, d);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7800;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.001, d);
    n.connect(f).connect(g).connect(this.bgmBus!);
  }
  private bass(t: number, m: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = this.freq(m);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(260 + this.intensity * 220, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.13, 0.005, dur);
    o.connect(f).connect(g).connect(this.bgmBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private arp(t: number, m: number, vol: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = this.freq(m);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3200;
    const g = ctx.createGain();
    this.env(g, t, vol, 0.003, 0.09);
    o.connect(f).connect(g).connect(this.bgmBus!);
    o.start(t);
    o.stop(t + 0.12);
  }
  private pad(t: number, m: number, dur: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.028, t + dur * 0.25);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.bgmBus!);
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = this.freq(m);
      o.detune.value = k === 0 ? -7 : 7;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
  private lead(t: number, m: number, dur: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = this.freq(m);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    f.Q.value = 2;
    const g = ctx.createGain();
    this.env(g, t, 0.04, 0.01, dur);
    o.connect(f).connect(g).connect(this.bgmBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ── SFX ────────────────────────────────────────────────
  private ok(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !!this.sfxBus;
  }
  private blip(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.003, dur);
    o.connect(g).connect(this.sfxBus!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  private noiseHit(fType: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, q = 1): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = this.noiseSrc(t, dur);
    const f = ctx.createBiquadFilter();
    f.type = fType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, vol, 0.003, dur);
    n.connect(f).connect(g).connect(this.sfxBus!);
  }

  graze(): void {
    if (!this.ok()) return;
    const now = this.ctx!.currentTime;
    if (now - this.tGraze < 0.028) return;
    this.tGraze = now;
    this.blip('triangle', 2700 + Math.random() * 300, 1900, 0.04, 0.045);
  }
  shot(): void {
    if (!this.ok()) return;
    const now = this.ctx!.currentTime;
    if (now - this.tShot < 0.06) return;
    this.tShot = now;
    this.noiseHit('bandpass', 2600 + Math.random() * 800, 1400, 0.05, 0.035, 2);
  }
  /** 無限ジャンプ：跳ぶ */
  jump(): void {
    if (!this.ok()) return;
    const now = this.ctx!.currentTime;
    if (now - this.tGraze < 0.03) return;
    this.tGraze = now;
    this.blip('triangle', 360, 760, 0.075, 0.055);
  }
  item(): void {
    if (!this.ok()) return;
    const now = this.ctx!.currentTime;
    if (now - this.tItem < 0.035) return;
    this.tItem = now;
    this.blip('sine', 1400, 2000, 0.05, 0.03);
  }
  hit(): void {
    if (!this.ok()) return;
    this.blip('square', 1100, 180, 0.14, 0.12);
  }
  death(): void {
    if (!this.ok()) return;
    this.noiseHit('lowpass', 4000, 70, 0.9, 0.55, 0.7);
    this.blip('sine', 120, 28, 0.7, 0.55);
    this.blip('sawtooth', 300, 40, 0.5, 0.08);
  }
  /** 「は？」 — 声道モデル（簡易フォルマント合成） */
  bomb(): void {
    if (!this.ok()) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    // h（無声摩擦）
    const n = this.noiseSrc(t, 0.1);
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 1500;
    hf.Q.value = 1.2;
    const hg = ctx.createGain();
    this.env(hg, t, 0.28, 0.01, 0.09);
    n.connect(hf).connect(hg).connect(this.sfxBus!);
    // a（有声・上昇＝疑問）
    const src = ctx.createOscillator();
    src.type = 'sawtooth';
    src.frequency.setValueAtTime(165, t + 0.05);
    src.frequency.linearRampToValueAtTime(175, t + 0.2);
    src.frequency.exponentialRampToValueAtTime(340, t + 0.5);
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(0.0001, t + 0.05);
    vg.gain.exponentialRampToValueAtTime(0.9, t + 0.09);
    vg.gain.setValueAtTime(0.9, t + 0.38);
    vg.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 820;
    f1.Q.value = 7;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1280;
    f2.Q.value = 9;
    const f3 = ctx.createBiquadFilter();
    f3.type = 'bandpass';
    f3.frequency.value = 2600;
    f3.Q.value = 10;
    const mix = ctx.createGain();
    mix.gain.value = 0.55;
    src.connect(vg);
    vg.connect(f1).connect(mix);
    vg.connect(f2).connect(mix);
    vg.connect(f3).connect(mix);
    mix.connect(this.sfxBus!);
    src.start(t + 0.05);
    src.stop(t + 0.7);
    // 衝撃
    this.blip('sine', 90, 28, 0.6, 0.5);
    this.noiseHit('lowpass', 6000, 200, 0.7, 0.18);
  }
  clear(): void {
    if (!this.ok()) return;
    const notes = [72, 76, 79, 84, 88, 91];
    for (let i = 0; i < notes.length; i++) {
      const f = this.freq(notes[i]);
      this.blip('triangle', f, f * 1.002, 0.45, 0.06, i * 0.055);
    }
    this.noiseHit('highpass', 6000, 12000, 0.6, 0.05);
  }
  stageClear(): void {
    if (!this.ok()) return;
    const notes = [67, 72, 76, 79, 84, 79, 84, 88];
    for (let i = 0; i < notes.length; i++) {
      const f = this.freq(notes[i]);
      this.blip('square', f, f, 0.22, 0.045, i * 0.09);
      this.blip('triangle', f / 2, f / 2, 0.3, 0.05, i * 0.09);
    }
  }
  extend(): void {
    if (!this.ok()) return;
    const n = [79, 84, 91];
    for (let i = 0; i < 3; i++) this.blip('square', this.freq(n[i]), this.freq(n[i]), 0.14, 0.05, i * 0.07);
  }
  cutin(): void {
    if (!this.ok()) return;
    this.noiseHit('bandpass', 300, 4200, 0.42, 0.16, 1.5);
    this.blip('sine', 220, 880, 0.35, 0.05);
  }
  laserWarn(): void {
    if (!this.ok()) return;
    this.blip('sine', 600, 1200, 0.3, 0.04);
  }
  laserFire(): void {
    if (!this.ok()) return;
    this.blip('sawtooth', 110, 70, 0.5, 0.09);
    this.noiseHit('lowpass', 2000, 300, 0.4, 0.1);
  }
  clock(): void {
    if (!this.ok()) return;
    this.blip('sine', 1500, 1400, 0.05, 0.06);
    this.blip('square', 3000, 2900, 0.015, 0.02);
  }
  timeStop(): void {
    if (!this.ok()) return;
    this.blip('sine', 1800, 90, 0.8, 0.12);
    this.noiseHit('bandpass', 5000, 200, 0.8, 0.1, 3);
  }
  timeResume(): void {
    if (!this.ok()) return;
    this.blip('sine', 90, 1800, 0.35, 0.1);
  }
  gameOver(): void {
    if (!this.ok()) return;
    const n = [67, 63, 60, 55];
    for (let i = 0; i < 4; i++) this.blip('triangle', this.freq(n[i]), this.freq(n[i]) * 0.98, 0.4, 0.07, i * 0.22);
  }
  ui(): void {
    if (!this.ok()) return;
    this.blip('sine', 880, 990, 0.04, 0.04);
  }
  select(): void {
    if (!this.ok()) return;
    this.blip('triangle', 660, 1320, 0.1, 0.06);
    this.blip('sine', 1320, 1760, 0.12, 0.03, 0.05);
  }
}
