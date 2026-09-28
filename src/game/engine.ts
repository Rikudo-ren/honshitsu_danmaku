// ─────────────────────────────────────────────────────────────
//  ✝本質✝回避弾幕 — Game Core
//  ・React から完全分離。setState はモード遷移時のみ（毎フレームゼロ）
//  ・全エンティティは Structure-of-Arrays（TypedArray）固定長プール
//    → 実行中の new / 配列生成 / クロージャ生成 = 0 （GCスパイク原理的に不在）
//  ・固定 60Hz ロジック + 補間描画（120/144Hz でも滑らか・決定論的）
// ─────────────────────────────────────────────────────────────
import {
  W, H, TAU, TYPE_HIT, TYPE_VIS, TYPE_ROT, COLORS, N_COLORS,
  T_SMALL, T_MED, T_LARGE, T_CROSS, T_PETAL,
  C_RED, C_YELLOW, C_VIOLET, C_PINK, C_WHITE,
  B_LINEAR, B_REDIRECT, B_BOUNCE, B_POLAR, B_GRAVITY, B_SINE, B_STEP, B_SPLIT, B_HOMING,
  FL_GRAZED, FL_STOP, FL_FADE, FL_SUPER, FL_NOCULL,
  F_DISPLAY, F_UI, F_MINCHO,
  DIFFS, STAGES, N_STAGES, STAGE_LABELS, POP_TEXTS, POP_MAA, POP_EXTEND, COUNTDOWN, ENDING_LINES,
  levelOf, spdMul, denMul, rateMul,
} from './data';
import { PATTERNS, attractPattern, type PatternDef } from './patterns';
import { GameAudio } from './audio';
import { buildSprites, buildDigits, type SpriteSet, type DigitAtlas, DIGIT_DOT, DIGIT_PLUS } from './sprites';

const MAXB = 4096;
const MAXP = 3200;
const MAXL = 24;
const MAXQ = 48;
const BGH = 1280;
const STEP = 1000 / 60;

const PR = 2.4;
const GRAZE = 20;
const FAST = 4.3;
const SLOW = 1.8;
const GAUGE_MAX = 120;

const WARM = 70;
const INTRO = 210;
const GAP = 80;
const CLEAR_T = 180;

const K_SPARK = 0;
const K_DOT = 1;
const K_RING = 2;
const K_ITEM = 3;
const K_PETAL = 4;

export type Mode = 'attract' | 'intro' | 'phase' | 'gap' | 'stageclear' | 'over' | 'ending';

export interface RunResult {
  cleared: boolean;
  difficulty: number;
  startStage: number;
  stageReached: number;
  score: number;
  graze: number;
  misses: number;
  bombsUsed: number;
  phasesCleared: number;
  noMissPhases: number;
}

export interface EngineEvents {
  onStageReached: (d: number, s: number) => void;
  onEnd: (r: RunResult) => void;
  onPause: (paused: boolean) => void;
}

// ── 事前生成文字列（HUD で毎フレーム連結しない） ───────────
const FONT_HUD_S = `700 9px ${F_UI}`;
const FONT_HUD_M = `700 11px ${F_UI}`;
const FONT_PHASE = `700 12px ${F_MINCHO}`;
const FONT_BOSS = `26px ${F_DISPLAY}`;
const FONT_CUT_BIG = `150px ${F_DISPLAY}`;
const FONT_CUT_NAME = `800 23px ${F_MINCHO}`;
const FONT_CUT_SUB = `700 10px ${F_UI}`;
const FONT_STAGE = `18px ${F_DISPLAY}`;
const FONT_TITLE = `800 30px ${F_MINCHO}`;
const FONT_QUOTE = `600 14px ${F_MINCHO}`;
const FONT_BANNER = `28px ${F_DISPLAY}`;
const FONT_POP = `800 16px ${F_MINCHO}`;
const FONT_HA = `120px ${F_DISPLAY}`;
const FONT_COUNT = `96px ${F_DISPLAY}`;
const FONT_END = `800 19px ${F_MINCHO}`;
const FONT_BOMBCHIP = `700 9px ${F_UI}`;
const DIFF_HUD: readonly string[] = DIFFS.map((d) => `${d.name} · 偏差値`);
const BOSS_HUD: readonly string[] = STAGES.map((s) => `${s.boss}`);

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}
function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 周期的（縦方向シームレス）な等高線地形図を marching squares で生成 */
function genContour(seed: number, color: string): HTMLCanvasElement {
  const c = mkCanvas(W, BGH);
  const g = c.getContext('2d')!;
  let s = seed >>> 0 || 1;
  const rnd = (): number => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  const CELL = 8;
  const cols = W / CELL + 1;
  const rows = BGH / CELL;
  const NT = 7;
  const kx = new Float32Array(NT);
  const my = new Float32Array(NT);
  const ph = new Float32Array(NT);
  const am = new Float32Array(NT);
  let asum = 0;
  for (let i = 0; i < NT; i++) {
    kx[i] = (0.004 + rnd() * 0.018) * (rnd() < 0.5 ? -1 : 1);
    my[i] = 1 + Math.floor(rnd() * 7);
    ph[i] = rnd() * TAU;
    am[i] = 1 / (1 + i * 0.45);
    asum += am[i];
  }
  const f = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    const y = j * CELL;
    for (let i = 0; i < cols; i++) {
      const x = i * CELL;
      let v = 0;
      for (let k = 0; k < NT; k++) v += am[k] * Math.sin(kx[k] * x + (my[k] * TAU * y) / BGH + ph[k]);
      f[j * cols + i] = (v / asum) * 1.6;
    }
  }
  // grid
  g.strokeStyle = color;
  g.globalAlpha = 0.05;
  g.lineWidth = 1;
  g.beginPath();
  for (let x = 0; x <= W; x += 80) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, BGH); }
  for (let y = 0; y < BGH; y += 80) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
  g.stroke();
  const qx = new Float32Array(4);
  const qy = new Float32Array(4);
  for (let li = 0; li < 25; li++) {
    const lv = -0.9 + li * 0.075;
    const major = li % 5 === 0;
    g.beginPath();
    for (let j = 0; j < rows; j++) {
      const j1 = (j + 1) % rows;
      for (let i = 0; i < cols - 1; i++) {
        const a = f[j * cols + i] - lv;
        const b = f[j * cols + i + 1] - lv;
        const d = f[j1 * cols + i] - lv;
        const e = f[j1 * cols + i + 1] - lv;
        const x0 = i * CELL;
        const y0 = j * CELL;
        let n = 0;
        if (a < 0 !== b < 0) { const t = a / (a - b); qx[n] = x0 + t * CELL; qy[n] = y0; n++; }
        if (b < 0 !== e < 0) { const t = b / (b - e); qx[n] = x0 + CELL; qy[n] = y0 + t * CELL; n++; }
        if (d < 0 !== e < 0) { const t = d / (d - e); qx[n] = x0 + t * CELL; qy[n] = y0 + CELL; n++; }
        if (a < 0 !== d < 0) { const t = a / (a - d); qx[n] = x0; qy[n] = y0 + t * CELL; n++; }
        if (n >= 2) { g.moveTo(qx[0], qy[0]); g.lineTo(qx[1], qy[1]); }
        if (n === 4) { g.moveTo(qx[2], qy[2]); g.lineTo(qx[3], qy[3]); }
      }
    }
    g.globalAlpha = major ? 0.36 : 0.15;
    g.lineWidth = major ? 1.2 : 0.7;
    g.stroke();
  }
  return c;
}

function genBase(idx: number, color: string): HTMLCanvasElement {
  const c = mkCanvas(W, H);
  const g = c.getContext('2d')!;
  const lg = g.createLinearGradient(0, 0, 0, H);
  lg.addColorStop(0, '#070817');
  lg.addColorStop(0.55, '#06060f');
  lg.addColorStop(1, '#0b0512');
  g.fillStyle = lg;
  g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W / 2, 90, 10, W / 2, 90, 420);
  rg.addColorStop(0, color);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.13;
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 1;
  // 星（寺地ステージ / タイトル / 最終）
  if (idx === 2 || idx === 6 || idx === 5) {
    let s = 987654 + idx;
    for (let i = 0; i < 160; i++) {
      s = (s * 1103515245 + 12345) >>> 0;
      const x = (s % 4800) / 10;
      s = (s * 1103515245 + 12345) >>> 0;
      const y = (s % 6400) / 10;
      s = (s * 1103515245 + 12345) >>> 0;
      g.globalAlpha = 0.15 + (s % 100) / 180;
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, (s & 3) === 0 ? 1.6 : 0.9, (s & 3) === 0 ? 1.6 : 0.9);
    }
  }
  return c;
}

function genVignette(r: number, gr: number, b: number, a: number): HTMLCanvasElement {
  const c = mkCanvas(W, H);
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
  rg.addColorStop(0, `rgba(${r},${gr},${b},0)`);
  rg.addColorStop(1, `rgba(${r},${gr},${b},${a})`);
  g.fillStyle = rg;
  g.fillRect(0, 0, W, H);
  return c;
}

export class Engine {
  // ── Canvas / services ──────────────────────────────────
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private S = 1;
  private cssScale = 1;
  private readonly sprites: SpriteSet;
  private digits: DigitAtlas;
  private gold: DigitAtlas;
  readonly audio = new GameAudio();
  private readonly events: EngineEvents;
  private raf = 0;
  private lastTs = 0;
  private acc = 0;
  private alive = true;
  paused = false;

  private readonly bgBase: HTMLCanvasElement[] = [];
  private readonly bgContour: HTMLCanvasElement[] = [];
  private readonly vignette: HTMLCanvasElement;
  private readonly dangerVig: HTMLCanvasElement;
  private bgIdx = 6;
  private bgScroll = 0;

  // ── Bullets (SoA pool, public for patterns) ─────────────
  bn = 0;
  readonly bx = new Float32Array(MAXB);
  readonly by = new Float32Array(MAXB);
  readonly bpx = new Float32Array(MAXB);
  readonly bpy = new Float32Array(MAXB);
  readonly ba = new Float32Array(MAXB);
  readonly bs = new Float32Array(MAXB);
  readonly bacc = new Float32Array(MAXB);
  readonly bav = new Float32Array(MAXB);
  readonly bmin = new Float32Array(MAXB);
  readonly bmax = new Float32Array(MAXB);
  readonly br = new Float32Array(MAXB);
  readonly bt = new Float32Array(MAXB);
  readonly blife = new Float32Array(MAXB);
  readonly bghost = new Float32Array(MAXB);
  readonly b0 = new Float32Array(MAXB);
  readonly b1 = new Float32Array(MAXB);
  readonly b2 = new Float32Array(MAXB);
  readonly b3 = new Float32Array(MAXB);
  readonly bbeh = new Uint8Array(MAXB);
  readonly btyp = new Uint8Array(MAXB);
  readonly bcol = new Uint8Array(MAXB);
  readonly bflg = new Uint8Array(MAXB);

  // ── Lasers ─────────────────────────────────────────────
  private ln = 0;
  private readonly lx = new Float32Array(MAXL);
  private readonly ly = new Float32Array(MAXL);
  private readonly la = new Float32Array(MAXL);
  private readonly llen = new Float32Array(MAXL);
  private readonly lw = new Float32Array(MAXL);
  private readonly lwarn = new Float32Array(MAXL);
  private readonly lact = new Float32Array(MAXL);
  private readonly lt = new Float32Array(MAXL);
  private readonly lav = new Float32Array(MAXL);
  private readonly lcol = new Uint8Array(MAXL);

  // ── Particles ──────────────────────────────────────────
  private pn = 0;
  private readonly ppx = new Float32Array(MAXP);
  private readonly ppy = new Float32Array(MAXP);
  private readonly pvx = new Float32Array(MAXP);
  private readonly pvy = new Float32Array(MAXP);
  private readonly plife = new Float32Array(MAXP);
  private readonly pmax = new Float32Array(MAXP);
  private readonly psz = new Float32Array(MAXP);
  private readonly prot = new Float32Array(MAXP);
  private readonly pk = new Uint8Array(MAXP);
  private readonly pcol = new Uint8Array(MAXP);

  // ── Popups ─────────────────────────────────────────────
  private qn = 0;
  private readonly qx = new Float32Array(MAXQ);
  private readonly qy = new Float32Array(MAXQ);
  private readonly qv = new Float64Array(MAXQ);
  private readonly qlife = new Float32Array(MAXQ);
  private readonly qkind = new Uint8Array(MAXQ);

  private readonly numBuf = new Uint8Array(24);
  private readonly trailX = new Float32Array(10);
  private readonly trailY = new Float32Array(10);
  private trailHead = 0;

  // ── Player ─────────────────────────────────────────────
  plX = W / 2;
  plY = H - 70;
  private plPX = W / 2;
  private plPY = H - 70;
  private playerAlive = false;
  private invuln = 0;
  private deathTimer = -1;
  private focus = false;
  private moving = false;

  // ── Input ──────────────────────────────────────────────
  private kL = false;
  private kR = false;
  private kU = false;
  private kD = false;
  private kF = false;
  private bombReq = false;
  private dragId = -1;
  private dragDX = 0;
  private dragDY = 0;
  private lastPX = 0;
  private lastPY = 0;
  private activePointers = 0;
  private lastTap = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private touchActive = false;

  // ── Game state ─────────────────────────────────────────
  mode: Mode = 'attract';
  private modeT = 0;
  private globalT = 0;
  diff = 0;
  stage = 0;
  phase = 0;
  phaseT = 0;
  private phaseDur = 1;
  private startStage = 0;
  private pattern: PatternDef | null = null;
  L = 0;
  sp = 1;
  dn = 1;
  R = 1;
  score = 0;
  private hi = 0;
  lives = 3;
  bombs = 3;
  private graze = 0;
  private gauge = 0;
  private misses = 0;
  private bombsUsed = 0;
  private phasesCleared = 0;
  private noMissPhases = 0;
  private phaseMissed = false;
  private phaseBombed = false;
  private ended = false;

  // ── Boss ───────────────────────────────────────────────
  bossX = W / 2;
  bossY = -80;
  private bossPX = W / 2;
  private bossPY = -80;
  private msx = 0;
  private msy = 0;
  private mtx = 0;
  private mty = 0;
  private moveT = 0;
  private moveDur = 0;
  wander = true;
  private bossVisible = false;
  private bossRot = 0;

  // ── Pattern scratch (preallocated) ─────────────────────
  readonly tmr = new Float32Array(8);
  readonly cnt = new Int32Array(8);
  readonly fv = new Float32Array(8);
  private seed = 1;
  stepF = 1;
  wellOn = false;
  wellX = W / 2;
  wellY = 320;
  wellG = 260;
  emitN = 0;
  emitLink = false;
  readonly emitX = new Float32Array(4);
  readonly emitY = new Float32Array(4);
  petals = false;
  private timeStop = 0;

  // ── FX ─────────────────────────────────────────────────
  private shake = 0;
  private flash = 0;
  private flashRed = false;
  private hitStop = 0;
  private stepStill = false;
  private cancelR = -1;
  private cancelX = 0;
  private cancelY = 0;
  private cancelItems = false;
  private cancelHold = 0;
  private danger = 0;
  private cutinT = -1;
  private bombT = 0;
  private bombX = 0;
  private bombY = 0;
  private bannerVal = 0;
  private bannerClean = false;
  private stageBonus = 0;
  private phaseNameW = 100;

  constructor(canvas: HTMLCanvasElement, events: EngineEvents) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D unsupported');
    this.ctx = ctx;
    this.events = events;
    this.sprites = buildSprites();
    this.digits = buildDigits('#ffffff', F_UI);
    this.gold = buildDigits('#ffd98a', F_UI);
    for (let i = 0; i < N_STAGES; i++) {
      this.bgBase.push(genBase(i, STAGES[i].color));
      this.bgContour.push(genContour(1000 + i * 7777, STAGES[i].color));
    }
    this.bgBase.push(genBase(6, '#8fa0ff'));
    this.bgContour.push(genContour(424242, '#9fb0ff'));
    this.vignette = genVignette(0, 0, 0, 0.62);
    this.dangerVig = genVignette(255, 20, 60, 0.7);
    if (document.fonts && document.fonts.ready) {
      void document.fonts.ready.then(() => {
        this.digits = buildDigits('#ffffff', F_UI);
        this.gold = buildDigits('#ffd98a', F_UI);
      });
    }
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVis);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.toTitle();
    this.raf = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVis);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.audio.bgmStop();
    if (this.audio.ctx) void this.audio.ctx.close();
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (this.canvas.width !== bw) this.canvas.width = bw;
    if (this.canvas.height !== bh) this.canvas.height = bh;
    this.S = bw / W;
    this.cssScale = W / Math.max(1, cssW);
    this.ctx.imageSmoothingEnabled = true;
  }

  // ═══ Public control ══════════════════════════════════════
  toTitle(): void {
    this.clearAll();
    this.mode = 'attract';
    this.modeT = 0;
    this.bossVisible = false;
    this.playerAlive = false;
    this.bgIdx = 6;
    this.paused = false;
    this.L = 1;
    this.sp = 1;
    this.dn = 1;
    this.R = 1;
    this.audio.setMuffle(false);
    this.audio.bgmStart(6, 0);
  }

  startRun(d: number, s: number, hi: number): void {
    this.audio.init();
    this.diff = d;
    this.startStage = s;
    this.score = 0;
    this.hi = hi;
    this.graze = 0;
    this.gauge = 0;
    this.misses = 0;
    this.bombsUsed = 0;
    this.phasesCleared = 0;
    this.noMissPhases = 0;
    this.lives = DIFFS[d].lives;
    this.bombs = DIFFS[d].bombs;
    this.ended = false;
    this.clearAll();
    this.plX = this.plPX = W / 2;
    this.plY = this.plPY = H - 70;
    for (let i = 0; i < 10; i++) { this.trailX[i] = this.plX; this.trailY[i] = this.plY; }
    this.playerAlive = true;
    this.invuln = 0;
    this.deathTimer = -1;
    this.paused = false;
    this.beginStage(s);
  }

  setPaused(p: boolean): void {
    if (!this.isPlaying()) return;
    this.paused = p;
    this.kL = this.kR = this.kU = this.kD = this.kF = false;
    this.dragId = -1;
    this.activePointers = 0;
    if (p) this.audio.suspend();
    else {
      this.audio.resume();
      this.lastTs = 0;
    }
  }

  requestBomb(): void {
    this.bombReq = true;
  }

  isPlaying(): boolean {
    return this.mode !== 'attract';
  }

  // ═══ Pattern helper API ═════════════════════════════════
  rnd(): number {
    let s = this.seed;
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    this.seed = s;
    return s / 4294967296;
  }

  tick(k: number, base: number): boolean {
    this.tmr[k] += this.R / base;
    if (this.tmr[k] >= 1) {
      this.tmr[k] -= 1;
      return true;
    }
    return false;
  }

  aim(x: number, y: number): number {
    return Math.atan2(this.plY - y, this.plX - x);
  }

  spawn(x: number, y: number, a: number, s: number, type: number, col: number): number {
    if (this.bn >= MAXB) return -1;
    const i = this.bn++;
    this.bx[i] = x; this.by[i] = y; this.bpx[i] = x; this.bpy[i] = y;
    this.ba[i] = a; this.bs[i] = s;
    this.bacc[i] = 0; this.bav[i] = 0;
    this.bmin[i] = -50; this.bmax[i] = 50;
    this.br[i] = TYPE_HIT[type];
    this.bt[i] = 0; this.blife[i] = 0; this.bghost[i] = 0;
    this.b0[i] = 0; this.b1[i] = 0; this.b2[i] = 0; this.b3[i] = 0;
    this.bbeh[i] = B_LINEAR; this.btyp[i] = type; this.bcol[i] = col; this.bflg[i] = 0;
    return i;
  }

  shot(): void {
    if (this.mode === 'phase') this.audio.shot();
  }

  moveBoss(x: number, y: number, dur: number): void {
    this.msx = this.bossX;
    this.msy = this.bossY;
    this.mtx = x;
    this.mty = y;
    this.moveT = 0;
    this.moveDur = Math.max(1, dur);
  }

  laser(x: number, y: number, a: number, len: number, w: number, warn: number, act: number, col: number, av: number): void {
    if (this.ln >= MAXL) return;
    const i = this.ln++;
    this.lx[i] = x; this.ly[i] = y; this.la[i] = a; this.llen[i] = len; this.lw[i] = w;
    this.lwarn[i] = warn; this.lact[i] = act; this.lt[i] = 0; this.lav[i] = av; this.lcol[i] = col;
    this.audio.laserWarn();
  }

  startTimeStop(frames: number): void {
    this.timeStop = frames;
    this.audio.timeStop();
    this.audio.setMuffle(true);
    this.flash = 0.5;
    this.flashRed = false;
  }

  popText(x: number, y: number, kind: number): void {
    this.addPop(x, y, 0, kind);
  }

  flashScreen(a: number): void {
    this.flash = Math.max(this.flash, a);
    this.flashRed = false;
  }

  // ═══ Internal pools ══════════════════════════════════════
  private killB(i: number): void {
    const l = --this.bn;
    if (i === l) return;
    this.bx[i] = this.bx[l]; this.by[i] = this.by[l]; this.bpx[i] = this.bpx[l]; this.bpy[i] = this.bpy[l];
    this.ba[i] = this.ba[l]; this.bs[i] = this.bs[l]; this.bacc[i] = this.bacc[l]; this.bav[i] = this.bav[l];
    this.bmin[i] = this.bmin[l]; this.bmax[i] = this.bmax[l]; this.br[i] = this.br[l]; this.bt[i] = this.bt[l];
    this.blife[i] = this.blife[l]; this.bghost[i] = this.bghost[l];
    this.b0[i] = this.b0[l]; this.b1[i] = this.b1[l]; this.b2[i] = this.b2[l]; this.b3[i] = this.b3[l];
    this.bbeh[i] = this.bbeh[l]; this.btyp[i] = this.btyp[l]; this.bcol[i] = this.bcol[l]; this.bflg[i] = this.bflg[l];
  }

  private addP(kind: number, x: number, y: number, vx: number, vy: number, life: number, size: number, col: number): boolean {
    if (this.pn >= MAXP) return false;
    const i = this.pn++;
    this.ppx[i] = x; this.ppy[i] = y; this.pvx[i] = vx; this.pvy[i] = vy;
    this.plife[i] = life; this.pmax[i] = life; this.psz[i] = size; this.prot[i] = Math.random() * TAU;
    this.pk[i] = kind; this.pcol[i] = col;
    return true;
  }

  private killP(i: number): void {
    const l = --this.pn;
    if (i === l) return;
    this.ppx[i] = this.ppx[l]; this.ppy[i] = this.ppy[l]; this.pvx[i] = this.pvx[l]; this.pvy[i] = this.pvy[l];
    this.plife[i] = this.plife[l]; this.pmax[i] = this.pmax[l]; this.psz[i] = this.psz[l]; this.prot[i] = this.prot[l];
    this.pk[i] = this.pk[l]; this.pcol[i] = this.pcol[l];
  }

  private addPop(x: number, y: number, v: number, kind: number): void {
    if (this.qn >= MAXQ) return;
    const i = this.qn++;
    this.qx[i] = x; this.qy[i] = y; this.qv[i] = v; this.qlife[i] = kind === 0 ? 50 : 90; this.qkind[i] = kind;
  }

  private burst(x: number, y: number, n: number, col: number, spd: number, size: number): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU;
      const s = spd * (0.3 + Math.random());
      this.addP(K_SPARK, x, y, Math.cos(a) * s, Math.sin(a) * s, 20 + Math.random() * 30, size, col);
    }
  }

  private clearAll(): void {
    this.bn = 0;
    this.ln = 0;
    this.pn = 0;
    this.qn = 0;
    this.cancelR = -1;
    this.timeStop = 0;
    this.wellOn = false;
    this.emitN = 0;
    this.petals = false;
    this.stepF = 1;
    this.cutinT = -1;
    this.bombT = 0;
    this.shake = 0;
    this.flash = 0;
    this.hitStop = 0;
    this.danger = 0;
  }

  // ═══ Flow ════════════════════════════════════════════════
  private beginStage(s: number): void {
    this.stage = s;
    this.mode = 'intro';
    this.modeT = 0;
    this.bgIdx = s;
    this.bossVisible = true;
    this.bossX = this.bossPX = W / 2;
    this.bossY = this.bossPY = -80;
    this.wander = false;
    this.moveBoss(W / 2, 120, 110);
    this.petals = false;
    this.audio.bgmStart(s, 0);
    this.audio.setIntensity(0);
    this.events.onStageReached(this.diff, s);
  }

  private beginPhase(p: number): void {
    const st = STAGES[this.stage];
    this.phase = p;
    this.mode = 'phase';
    this.modeT = 0;
    this.phaseT = 0;
    this.phaseDur = st.phases[p].dur * 60;
    this.tmr.fill(0.999);
    this.cnt.fill(0);
    this.fv.fill(0);
    this.seed = ((this.diff * 7919 + this.stage * 104729 + p * 1299709 + 12345) >>> 0) | 1;
    this.wander = true;
    this.wellOn = false;
    this.emitN = 0;
    this.emitLink = false;
    this.stepF = 1;
    this.petals = false;
    this.timeStop = 0;
    this.phaseMissed = false;
    this.phaseBombed = false;
    this.updateLevel();
    this.pattern = PATTERNS[st.phases[p].id] ?? null;
    if (this.pattern && this.pattern.init) this.pattern.init(this, this.L);
    this.cutinT = 0;
    this.ctx.font = FONT_PHASE;
    this.phaseNameW = this.ctx.measureText(st.phases[p].name).width;
    this.audio.cutin();
    const last = p === st.phases.length - 1;
    this.audio.setIntensity(this.stage === N_STAGES - 1 && last ? 3 : p === 0 ? 1 : 2);
  }

  private updateLevel(): void {
    this.L = levelOf(this.diff, this.stage, this.phase, Math.min(1, this.phaseT / this.phaseDur));
    this.sp = spdMul(this.L);
    this.dn = denMul(this.L);
    this.R = rateMul(this.L);
  }

  private clearPhase(): void {
    const clean = !this.phaseMissed && !this.phaseBombed;
    const bonus = (clean ? 100000 : 30000) * (this.stage + 1) * (this.diff + 1);
    this.score += bonus;
    this.bannerVal = bonus;
    this.bannerClean = clean;
    this.phasesCleared++;
    if (clean) this.noMissPhases++;
    this.startCancel(this.bossX, this.bossY, true, 20);
    if (this.timeStop > 0) {
      this.timeStop = 0;
      this.audio.setMuffle(false);
    }
    this.wellOn = false;
    this.emitN = 0;
    this.mode = 'gap';
    this.modeT = 0;
    this.audio.clear();
    this.flash = 0.35;
    this.flashRed = false;
    this.shake = 6;
    for (let k = 0; k < 3; k++) this.addP(K_RING, this.bossX, this.bossY, 6 + k * 3, 0, 40, 10, STAGES[this.stage].colorIdx);
  }

  private nextAfterGap(): void {
    const st = STAGES[this.stage];
    if (this.phase + 1 < st.phases.length) {
      this.beginPhase(this.phase + 1);
      return;
    }
    this.mode = 'stageclear';
    this.modeT = 0;
    this.stageBonus = (this.lives * 50000 + this.bombs * 20000) * (this.diff + 1) * (this.stage + 1);
    this.score += this.stageBonus;
    this.burst(this.bossX, this.bossY, 140, STAGES[this.stage].colorIdx, 9, 2.2);
    this.burst(this.bossX, this.bossY, 60, C_WHITE, 12, 1.4);
    for (let k = 0; k < 5; k++) this.addP(K_RING, this.bossX, this.bossY, 4 + k * 2.5, 0, 50 + k * 6, 6, k & 1 ? C_WHITE : STAGES[this.stage].colorIdx);
    this.shake = 18;
    this.flash = 0.85;
    this.flashRed = false;
    this.hitStop = 12;
    this.audio.stageClear();
    this.audio.setIntensity(0);
    this.moveBoss(W / 2, -160, 150);
    this.events.onStageReached(this.diff, this.stage + 1);
  }

  private emitEnd(cleared: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.events.onEnd({
      cleared,
      difficulty: this.diff,
      startStage: this.startStage,
      stageReached: cleared ? N_STAGES : this.stage,
      score: this.score,
      graze: this.graze,
      misses: this.misses,
      bombsUsed: this.bombsUsed,
      phasesCleared: this.phasesCleared,
      noMissPhases: this.noMissPhases,
    });
  }

  private startCancel(x: number, y: number, items: boolean, hold: number): void {
    this.cancelX = x;
    this.cancelY = y;
    this.cancelR = 0;
    this.cancelItems = items;
    this.cancelHold = hold;
    this.ln = 0;
  }

  private onHit(): void {
    if (this.deathTimer >= 0 || this.invuln > 0 || !this.playerAlive) return;
    this.deathTimer = 8; // 喰らいボム猶予
    this.audio.hit();
    this.flash = 0.25;
    this.flashRed = true;
  }

  private die(): void {
    this.lives--;
    this.misses++;
    this.phaseMissed = true;
    this.hitStop = 22;
    this.shake = 16;
    this.flash = 0.9;
    this.flashRed = true;
    this.burst(this.plX, this.plY, 50, C_RED, 8, 2);
    this.burst(this.plX, this.plY, 30, C_WHITE, 11, 1.2);
    for (let k = 0; k < 3; k++) this.addP(K_RING, this.plX, this.plY, 5 + k * 3, 0, 40, 6, k === 1 ? C_WHITE : C_RED);
    this.audio.death();
    this.startCancel(this.plX, this.plY, false, 24);
    if (this.lives <= 0) {
      this.playerAlive = false;
      this.mode = 'over';
      this.modeT = 0;
      this.audio.bgmStop();
      this.audio.gameOver();
      if (this.timeStop > 0) {
        this.timeStop = 0;
        this.audio.setMuffle(false);
      }
      return;
    }
    this.bombs = Math.max(this.bombs, DIFFS[this.diff].bombs);
    this.invuln = 180;
    this.gauge = Math.floor(this.gauge * 0.5);
    this.plX = this.plPX = W / 2;
    this.plY = this.plPY = H - 60;
    this.addP(K_RING, this.plX, this.plY, -1.2, 0, 40, 60, C_PINK);
  }

  private doBomb(): void {
    if (this.bombs <= 0 || !this.playerAlive) return;
    this.bombs--;
    this.bombsUsed++;
    this.phaseBombed = true;
    this.deathTimer = -1;
    this.invuln = Math.max(this.invuln, 200);
    this.bombT = 90;
    this.bombX = this.plX;
    this.bombY = this.plY;
    this.startCancel(this.plX, this.plY, true, 60);
    this.shake = 10;
    this.flash = 0.55;
    this.flashRed = false;
    for (let k = 0; k < 4; k++) this.addP(K_RING, this.plX, this.plY, 7 + k * 4, 0, 45, 8, k & 1 ? C_WHITE : C_RED);
    this.burst(this.plX, this.plY, 40, C_PINK, 10, 1.6);
    this.audio.bomb();
  }

  private onGraze(x: number, y: number): void {
    this.graze++;
    this.score += 200 * (this.diff + 1);
    this.gauge++;
    const a = Math.atan2(y - this.plY, x - this.plX);
    this.addP(K_SPARK, (x + this.plX) * 0.5, (y + this.plY) * 0.5, Math.cos(a) * 3, Math.sin(a) * 3, 14, 1.2, C_WHITE);
    this.audio.graze();
    if (this.gauge >= GAUGE_MAX) {
      this.gauge = 0;
      if (this.bombs < 7) this.bombs++;
      this.addPop(this.plX, this.plY - 40, 0, POP_MAA);
      this.addPop(this.plX, this.plY - 22, 0, POP_EXTEND);
      this.audio.extend();
    }
  }

  // ═══ Main loop ═══════════════════════════════════════════
  private frame = (ts: number): void => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.lastTs === 0) this.lastTs = ts;
    let dt = ts - this.lastTs;
    this.lastTs = ts;
    if (dt > 100) dt = 100;
    // vsync スナップ：rAF タイムスタンプの揺らぎによる 0/2 ステップのジッタを除去
    if (Math.abs(dt - STEP) < 1.2) dt = STEP;
    else if (Math.abs(dt - STEP / 2) < 0.6) dt = STEP / 2;
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 6) {
        this.step();
        this.acc -= STEP;
        steps++;
      }
      if (steps === 6) this.acc = 0;
    }
    this.render(this.paused ? 1 : this.acc / STEP);
    this.audio.tick();
  };

  private step(): void {
    this.globalT++;
    this.bgScroll += this.mode === 'phase' ? 0.45 : 0.28;
    if (this.bgScroll >= BGH) this.bgScroll -= BGH;
    if (this.shake > 0.2) this.shake *= 0.86;
    else this.shake = 0;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.045);
    if (this.bombT > 0) this.bombT--;
    if (this.cutinT >= 0) {
      this.cutinT++;
      if (this.cutinT > 110) this.cutinT = -1;
    }
    if (this.hitStop > 0) {
      this.hitStop--;
      this.stepStill = true;
      return;
    }
    this.stepStill = false;
    // ゲームオーバー時はスローモーション
    if (this.mode === 'over' && (this.globalT & 1) === 1) {
      this.modeT++;
      if (this.modeT >= 130) this.emitEnd(false);
      this.stepStill = true;
      return;
    }
    this.modeT++;
    switch (this.mode) {
      case 'attract':
        attractPattern(this, this.modeT);
        break;
      case 'intro':
        if (this.modeT >= INTRO) this.beginPhase(0);
        break;
      case 'phase':
        this.phaseT++;
        this.updateLevel();
        if (this.pattern && this.phaseT >= WARM) this.pattern.update(this, this.phaseT - WARM, this.L);
        if (this.phaseT >= this.phaseDur) this.clearPhase();
        break;
      case 'gap':
        if (this.modeT >= GAP) this.nextAfterGap();
        break;
      case 'stageclear':
        if (this.modeT >= CLEAR_T) {
          if (this.stage + 1 < N_STAGES) this.beginStage(this.stage + 1);
          else {
            this.mode = 'ending';
            this.modeT = 0;
            this.petals = true;
            this.bossVisible = false;
            this.audio.bgmStart(6, 0);
          }
        }
        break;
      case 'over':
        if (this.modeT >= 130) this.emitEnd(false);
        break;
      case 'ending':
        if (this.modeT >= 520) this.emitEnd(true);
        break;
    }
    const playable = this.mode === 'intro' || this.mode === 'phase' || this.mode === 'gap' || this.mode === 'stageclear' || this.mode === 'ending';
    if (playable) this.updatePlayer();
    else this.bombReq = false;
    this.updateBoss();
    if (this.timeStop > 0) {
      this.timeStop--;
      if (this.timeStop % 40 === 0) this.audio.clock();
      if (this.timeStop === 0) {
        this.audio.setMuffle(false);
        this.audio.timeResume();
        this.flash = 0.3;
        this.flashRed = false;
      }
    }
    this.updateBullets(this.mode === 'phase' || this.mode === 'intro');
    this.updateLasers(this.mode === 'phase');
    this.updateCancel();
    this.updateParticles();
    this.updatePopups();
    if (this.petals && (this.globalT & 3) === 0) {
      this.addP(K_PETAL, Math.random() * W, -10, (Math.random() - 0.3) * 0.8, 0.6 + Math.random() * 0.9, 900, 1 + Math.random() * 1.2, C_PINK);
    }
    this.danger *= 0.85;
  }

  private updatePlayer(): void {
    this.plPX = this.plX;
    this.plPY = this.plY;
    if (!this.playerAlive) {
      this.bombReq = false;
      return;
    }
    if (this.deathTimer >= 0) {
      if (this.bombReq && this.bombs > 0) this.doBomb();
      else if (--this.deathTimer < 0) this.die();
      this.bombReq = false;
      return;
    }
    if (this.bombReq) {
      this.bombReq = false;
      if (this.mode !== 'ending') this.doBomb();
    }
    this.focus = this.kF;
    let dx = (this.kR ? 1 : 0) - (this.kL ? 1 : 0);
    let dy = (this.kD ? 1 : 0) - (this.kU ? 1 : 0);
    if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
    const v = this.focus ? SLOW : FAST;
    let mx = dx * v;
    let my = dy * v;
    let ddx = this.dragDX;
    let ddy = this.dragDY;
    this.dragDX = 0;
    this.dragDY = 0;
    if (ddx > 24) ddx = 24; else if (ddx < -24) ddx = -24;
    if (ddy > 24) ddy = 24; else if (ddy < -24) ddy = -24;
    mx += ddx;
    my += ddy;
    this.moving = mx !== 0 || my !== 0;
    let x = this.plX + mx;
    let y = this.plY + my;
    if (x < 8) x = 8; else if (x > W - 8) x = W - 8;
    if (y < 14) y = 14; else if (y > H - 12) y = H - 12;
    this.plX = x;
    this.plY = y;
    if (this.invuln > 0) this.invuln--;
    this.trailHead = (this.trailHead + 1) % 10;
    this.trailX[this.trailHead] = x;
    this.trailY[this.trailHead] = y;
  }

  private updateBoss(): void {
    this.bossPX = this.bossX;
    this.bossPY = this.bossY;
    this.bossRot += 0.018;
    if (this.moveT < this.moveDur) {
      this.moveT++;
      const e = ease(this.moveT / this.moveDur);
      this.bossX = this.msx + (this.mtx - this.msx) * e;
      this.bossY = this.msy + (this.mty - this.msy) * e;
    } else if (this.wander && this.mode === 'phase' && this.phaseT > WARM && this.phaseT % 170 === 0) {
      this.moveBoss(90 + this.rnd() * 300, 80 + this.rnd() * 70, 100);
    }
  }

  private updateBullets(collide: boolean): void {
    const px = this.plX;
    const py = this.plY;
    const frozen = this.timeStop > 0;
    const canHit = collide && this.playerAlive && this.invuln <= 0 && this.deathTimer < 0;
    const canGraze = collide && this.playerAlive && this.deathTimer < 0;
    let dangerAcc = 0;
    let i = 0;
    while (i < this.bn) {
      let x = this.bx[i];
      let y = this.by[i];
      this.bpx[i] = x;
      this.bpy[i] = y;
      let flg = this.bflg[i];
      let dead = false;
      const beh = this.bbeh[i];
      if (!(frozen && flg & FL_STOP)) {
        const t = ++this.bt[i];
        if (this.bghost[i] > 0) this.bghost[i]--;
        let a = this.ba[i];
        let s = this.bs[i] + this.bacc[i];
        if (s < this.bmin[i]) s = this.bmin[i];
        else if (s > this.bmax[i]) s = this.bmax[i];
        this.bs[i] = s;
        a += this.bav[i];
        switch (beh) {
          case B_LINEAR:
            x += Math.cos(a) * s;
            y += Math.sin(a) * s;
            break;
          case B_REDIRECT:
            if (t === this.b0[i]) {
              const m = this.b1[i];
              if (m === 0) a = Math.atan2(py - y, px - x) + this.b2[i];
              else if (m === 1) a += this.b2[i];
              else a = this.b2[i];
              s = this.b3[i];
              this.bs[i] = s;
              this.bacc[i] = 0;
            }
            x += Math.cos(a) * s;
            y += Math.sin(a) * s;
            break;
          case B_BOUNCE: {
            const c = Math.cos(a);
            const sn = Math.sin(a);
            x += c * s;
            y += sn * s;
            if (this.b0[i] > 0) {
              if ((x < 4 && c < 0) || (x > W - 4 && c > 0)) { a = Math.PI - a; this.b0[i]--; }
              else if (y < 4 && sn < 0) { a = -a; this.b0[i]--; }
            }
            break;
          }
          case B_POLAR: {
            this.b2[i] += s;
            this.b3[i] += this.bav[i];
            const r = this.b2[i];
            const th = this.b3[i];
            x = this.b0[i] + Math.cos(th) * r;
            y = this.b1[i] + Math.sin(th) * r;
            a = th;
            if (r > 820) dead = true;
            break;
          }
          case B_GRAVITY: {
            let vx = this.b0[i];
            let vy = this.b1[i];
            const dx = this.wellX - x;
            const dy = this.wellY - y;
            const d2 = dx * dx + dy * dy;
            const d = Math.sqrt(d2) + 0.001;
            const f = this.wellG / (d * (d2 + 1800));
            vx += dx * f;
            vy += dy * f;
            const m2 = vx * vx + vy * vy;
            const cap = this.bmax[i];
            if (m2 > cap * cap) {
              const k = cap / Math.sqrt(m2);
              vx *= k;
              vy *= k;
            }
            this.b0[i] = vx;
            this.b1[i] = vy;
            x += vx;
            y += vy;
            a = Math.atan2(vy, vx);
            break;
          }
          case B_SINE: {
            const c = Math.cos(a);
            const sn = Math.sin(a);
            this.b0[i] += c * s;
            this.b1[i] += sn * s;
            const off = Math.sin(t * this.b3[i]) * this.b2[i];
            x = this.b0[i] - sn * off;
            y = this.b1[i] + c * off;
            break;
          }
          case B_STEP: {
            const e = s * this.stepF;
            x += Math.cos(a) * e;
            y += Math.sin(a) * e;
            break;
          }
          case B_SPLIT:
            x += Math.cos(a) * s;
            y += Math.sin(a) * s;
            if (t === this.b0[i]) {
              this.splitBullet(i, x, y, a);
              dead = true;
            }
            break;
          case B_HOMING:
            if (t < this.b1[i]) {
              let d = Math.atan2(py - y, px - x) - a;
              d = Math.atan2(Math.sin(d), Math.cos(d));
              const tr = this.b0[i];
              if (d > tr) d = tr;
              else if (d < -tr) d = -tr;
              a += d;
            }
            x += Math.cos(a) * s;
            y += Math.sin(a) * s;
            break;
        }
        this.ba[i] = a;
        if (flg & FL_SUPER && t >= 80) {
          flg &= ~FL_SUPER;
          this.bflg[i] = flg;
          this.addP(K_RING, x, y, 0.8, 0, 14, 3, C_PINK);
        }
        if (this.blife[i] > 0 && t >= this.blife[i]) {
          dead = true;
          this.addP(K_RING, x, y, 1.2, 0, 16, 2, this.bcol[i]);
          this.addP(K_DOT, x, y, 0, 0, 14, 8, this.bcol[i]);
        }
      }
      this.bx[i] = x;
      this.by[i] = y;
      if (!dead) {
        if (flg & FL_NOCULL) {
          if (x > 0 && x < W && y > 0 && y < H) this.bflg[i] = flg & ~FL_NOCULL;
          else if (this.bt[i] > 900) dead = true;
        } else if (beh !== B_POLAR) {
          const m = beh === B_GRAVITY ? 160 : 64;
          if (x < -m || x > W + m || y < -m || y > H + m) dead = true;
        }
      }
      if (dead) {
        this.killB(i);
        continue;
      }
      if (canGraze && this.bghost[i] <= 0) {
        const dx = x - px;
        const dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < 3600) {
          dangerAcc += 1 - d2 / 3600;
          const rr = this.br[i] + PR;
          if (d2 < rr * rr) {
            if (canHit) this.onHit();
          } else {
            const gr = this.br[i] + GRAZE;
            if (d2 < gr * gr && !(this.bflg[i] & FL_GRAZED)) {
              this.bflg[i] |= FL_GRAZED;
              this.onGraze(x, y);
            }
          }
        }
      }
      i++;
    }
    const target = dangerAcc > 5 ? 1 : dangerAcc / 5;
    if (target > this.danger) this.danger += (target - this.danger) * 0.25;
  }

  private splitBullet(i: number, x: number, y: number, a: number): void {
    const n = this.b1[i];
    const gen = this.b2[i];
    const cs = this.b3[i];
    const typ = this.btyp[i];
    const ct = typ === T_LARGE ? T_MED : T_SMALL;
    const cc = typ === T_LARGE ? C_RED : C_YELLOW;
    const a0 = a + Math.PI / n;
    for (let k = 0; k < n; k++) {
      const j = this.spawn(x, y, a0 + (k * TAU) / n, cs, ct, cc);
      if (j < 0) break;
      if (gen > 1) {
        this.bbeh[j] = B_SPLIT;
        this.b0[j] = 40;
        this.b1[j] = 3;
        this.b2[j] = gen - 1;
        this.b3[j] = cs * 0.85;
        this.bacc[j] = -0.02;
        this.bmin[j] = cs * 0.45;
      } else {
        this.bacc[j] = 0.008;
        this.bmax[j] = cs * 1.4;
      }
    }
    this.addP(K_RING, x, y, 1.6, 0, 18, 4, this.bcol[i]);
  }

  private updateLasers(collide: boolean): void {
    const canHit = collide && this.playerAlive && this.invuln <= 0 && this.deathTimer < 0;
    let i = 0;
    while (i < this.ln) {
      const t = ++this.lt[i];
      this.la[i] += this.lav[i];
      const warn = this.lwarn[i];
      if (t === warn) {
        this.audio.laserFire();
        this.shake = Math.max(this.shake, 4);
      }
      if (t > warn + this.lact[i]) {
        const l = --this.ln;
        if (i !== l) {
          this.lx[i] = this.lx[l]; this.ly[i] = this.ly[l]; this.la[i] = this.la[l]; this.llen[i] = this.llen[l];
          this.lw[i] = this.lw[l]; this.lwarn[i] = this.lwarn[l]; this.lact[i] = this.lact[l]; this.lt[i] = this.lt[l];
          this.lav[i] = this.lav[l]; this.lcol[i] = this.lcol[l];
        }
        continue;
      }
      if (collide && this.playerAlive && t > warn + 6 && t < warn + this.lact[i] - 4) {
        const c = Math.cos(this.la[i]);
        const s = Math.sin(this.la[i]);
        const rx = this.plX - this.lx[i];
        const ry = this.plY - this.ly[i];
        let proj = rx * c + ry * s;
        if (proj < 0) proj = 0;
        else if (proj > this.llen[i]) proj = this.llen[i];
        const qx = rx - c * proj;
        const qy = ry - s * proj;
        const d = Math.sqrt(qx * qx + qy * qy);
        const half = this.lw[i] * 0.5;
        if (d < half * 0.72 + PR) {
          if (canHit) this.onHit();
        } else if (d < half + GRAZE && this.globalT % 6 === 0 && this.deathTimer < 0) {
          this.onGraze(this.plX - qx, this.plY - qy);
        }
        if (d < 60) this.danger = Math.max(this.danger, 1 - d / 60);
      }
      i++;
    }
  }

  private updateCancel(): void {
    if (this.cancelR < 0) return;
    this.cancelR += 22;
    const r2 = this.cancelR * this.cancelR;
    const cx = this.cancelX;
    const cy = this.cancelY;
    const petal = this.stage === N_STAGES - 1 && this.mode !== 'attract';
    let i = 0;
    while (i < this.bn) {
      const dx = this.bx[i] - cx;
      const dy = this.by[i] - cy;
      if (dx * dx + dy * dy < r2) {
        const x = this.bx[i];
        const y = this.by[i];
        if (this.cancelItems && this.pn < MAXP - 64) {
          const a = Math.random() * TAU;
          const s = 0.5 + Math.random() * 2;
          this.addP(K_ITEM, x, y, Math.cos(a) * s, Math.sin(a) * s, 999, 1, this.bcol[i]);
        } else if (petal) {
          this.addP(K_PETAL, x, y, (Math.random() - 0.5) * 1.5, -0.5 - Math.random(), 160, 1.2, C_PINK);
        } else {
          this.addP(K_DOT, x, y, 0, 0, 16, 7, this.bcol[i]);
        }
        this.killB(i);
        continue;
      }
      i++;
    }
    if (this.cancelR > 900) {
      if (this.cancelHold > 0) this.cancelHold--;
      else this.cancelR = -1;
    }
  }

  private updateParticles(): void {
    const playable = this.playerAlive && this.mode !== 'attract' && this.mode !== 'over';
    const itemVal = 100 * (this.stage + 1) * (this.diff + 1);
    let i = 0;
    while (i < this.pn) {
      const life = --this.plife[i];
      if (life <= 0) {
        this.killP(i);
        continue;
      }
      const k = this.pk[i];
      if (k === K_ITEM) {
        const age = this.pmax[i] - life;
        if (!playable) {
          this.pk[i] = K_DOT;
          this.plife[i] = 14;
          this.pmax[i] = 14;
          this.psz[i] = 6;
          i++;
          continue;
        }
        if (age < 18) {
          this.ppx[i] += this.pvx[i];
          this.ppy[i] += this.pvy[i];
          this.pvx[i] *= 0.9;
          this.pvy[i] *= 0.9;
        } else {
          const dx = this.plX - this.ppx[i];
          const dy = this.plY - this.ppy[i];
          const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
          if (d < 14) {
            this.score += itemVal;
            this.audio.item();
            this.killP(i);
            continue;
          }
          let sp = (age - 18) * 0.7 + 2;
          if (sp > 18) sp = 18;
          if (sp > d) sp = d;
          this.ppx[i] += (dx / d) * sp;
          this.ppy[i] += (dy / d) * sp;
        }
      } else if (k === K_PETAL) {
        this.ppx[i] += this.pvx[i] + Math.sin(this.globalT * 0.03 + i) * 0.35;
        this.ppy[i] += this.pvy[i];
        this.prot[i] += 0.03 * this.psz[i];
        if (this.ppy[i] > H + 20) {
          this.killP(i);
          continue;
        }
      } else if (k === K_RING) {
        this.psz[i] += this.pvx[i];
        if (this.psz[i] < 0) this.psz[i] = 0;
      } else {
        this.ppx[i] += this.pvx[i];
        this.ppy[i] += this.pvy[i];
        this.pvx[i] *= 0.94;
        this.pvy[i] *= 0.94;
      }
      i++;
    }
  }

  private updatePopups(): void {
    let i = 0;
    while (i < this.qn) {
      if (--this.qlife[i] <= 0) {
        const l = --this.qn;
        if (i !== l) {
          this.qx[i] = this.qx[l]; this.qy[i] = this.qy[l]; this.qv[i] = this.qv[l];
          this.qlife[i] = this.qlife[l]; this.qkind[i] = this.qkind[l];
        }
        continue;
      }
      this.qy[i] -= this.qkind[i] === 0 ? 0.6 : 0.35;
      i++;
    }
  }

  // ═══ Input ═══════════════════════════════════════════════
  private onKeyDown = (e: KeyboardEvent): void => {
    let handled = true;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': this.kL = true; break;
      case 'ArrowRight': case 'KeyD': this.kR = true; break;
      case 'ArrowUp': case 'KeyW': this.kU = true; break;
      case 'ArrowDown': case 'KeyS': this.kD = true; break;
      case 'ShiftLeft': case 'ShiftRight': this.kF = true; break;
      case 'KeyX': case 'Space': case 'KeyC':
        if (!e.repeat && !this.paused) this.bombReq = true;
        break;
      case 'Escape': case 'KeyP':
        if (!e.repeat && this.isPlaying() && this.mode !== 'over' && !this.ended) {
          const p = !this.paused;
          this.setPaused(p);
          this.events.onPause(p);
        }
        break;
      default:
        handled = false;
    }
    if (handled && this.isPlaying() && !this.paused) e.preventDefault();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA': this.kL = false; break;
      case 'ArrowRight': case 'KeyD': this.kR = false; break;
      case 'ArrowUp': case 'KeyW': this.kU = false; break;
      case 'ArrowDown': case 'KeyS': this.kD = false; break;
      case 'ShiftLeft': case 'ShiftRight': this.kF = false; break;
    }
  };

  private onBlur = (): void => {
    this.kL = this.kR = this.kU = this.kD = this.kF = false;
  };

  private onVis = (): void => {
    if (document.hidden && this.isPlaying() && !this.paused && this.mode !== 'over' && !this.ended) {
      this.setPaused(true);
      this.events.onPause(true);
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.isPlaying() || this.paused) return;
    this.audio.init();
    this.activePointers++;
    if (this.activePointers >= 2) this.bombReq = true;
    if (this.dragId === -1) {
      this.dragId = e.pointerId;
      this.lastPX = e.clientX;
      this.lastPY = e.clientY;
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* 非対応環境は無視 */ }
    }
    if (e.pointerType !== 'mouse') {
      const now = performance.now();
      const dx = e.clientX - this.lastTapX;
      const dy = e.clientY - this.lastTapY;
      if (now - this.lastTap < 280 && dx * dx + dy * dy < 2500) this.bombReq = true;
      this.lastTap = now;
      this.lastTapX = e.clientX;
      this.lastTapY = e.clientY;
      this.touchActive = true;
    }
    e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.dragId || this.paused) return;
    this.dragDX += (e.clientX - this.lastPX) * this.cssScale;
    this.dragDY += (e.clientY - this.lastPY) * this.cssScale;
    this.lastPX = e.clientX;
    this.lastPY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.activePointers = Math.max(0, this.activePointers - 1);
    if (e.pointerId === this.dragId) this.dragId = -1;
  };

  // ═══ Render ══════════════════════════════════════════════
  private render(alphaIn: number): void {
    const c = this.ctx;
    const S = this.S;
    const alpha = this.hitStop > 0 || this.stepStill ? 1 : alphaIn;
    let shx = 0;
    let shy = 0;
    if (this.shake > 0) {
      shx = (Math.random() - 0.5) * this.shake;
      shy = (Math.random() - 0.5) * this.shake;
    }
    c.setTransform(S, 0, 0, S, shx * S, shy * S);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    this.drawBg();
    if (this.wellOn) this.drawWell();
    if (this.emitN > 0) this.drawEmitters();
    this.drawLasers();
    if (this.bossVisible) this.drawBoss(alpha);
    this.drawParticles(shx, shy);
    const showPlayer = this.playerAlive && this.mode !== 'attract';
    if (showPlayer) this.drawPlayerBody(alpha);
    this.drawBullets(alpha, shx, shy);
    if (showPlayer) this.drawHitbox(alpha);
    this.drawCancelRing();
    this.drawPopups();

    c.setTransform(S, 0, 0, S, 0, 0);
    c.globalCompositeOperation = 'source-over';
    if (this.timeStop > 0) this.drawTimeStop();
    if (this.bombT > 0) this.drawBombFx();
    if (this.danger > 0.03 && this.mode === 'phase') {
      c.globalAlpha = Math.min(0.85, this.danger * 0.9);
      c.drawImage(this.dangerVig, 0, 0, W, H);
    }
    c.globalAlpha = 1;
    c.drawImage(this.vignette, 0, 0, W, H);
    if (this.cutinT >= 0) this.drawCutin();
    if (this.mode !== 'attract') this.drawHUD();
    switch (this.mode) {
      case 'intro': this.drawIntro(); break;
      case 'gap': this.drawGapBanner(); break;
      case 'stageclear': this.drawStageClear(); break;
      case 'over': this.drawOver(); break;
      case 'ending': this.drawEnding(); break;
      default: break;
    }
    if (this.flash > 0) {
      c.globalAlpha = Math.min(1, this.flash);
      c.fillStyle = this.flashRed ? '#ff2d55' : '#ffffff';
      c.globalCompositeOperation = this.flashRed ? 'source-over' : 'lighter';
      c.fillRect(0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
    }
    c.globalAlpha = 1;
  }

  private drawBg(): void {
    const c = this.ctx;
    c.drawImage(this.bgBase[this.bgIdx], 0, 0, W, H);
    const off = this.bgScroll;
    c.globalAlpha = 0.95;
    const cv = this.bgContour[this.bgIdx];
    c.drawImage(cv, 0, off - BGH, W, BGH);
    c.drawImage(cv, 0, off, W, BGH);
    c.globalAlpha = 1;
  }

  private drawWell(): void {
    const c = this.ctx;
    const x = this.wellX;
    const y = this.wellY;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.55;
    c.drawImage(this.sprites.glow[C_VIOLET], x - 80, y - 80, 160, 160);
    c.strokeStyle = COLORS[C_VIOLET];
    c.lineWidth = 1.2;
    for (let r = 0; r < 3; r++) {
      const rad = 18 + r * 17;
      const rot = this.globalT * (r & 1 ? -0.02 : 0.03);
      c.globalAlpha = 0.5 - r * 0.12;
      c.beginPath();
      for (let k = 0; k < 8; k++) {
        const a0 = rot + (k * TAU) / 8;
        c.moveTo(x + Math.cos(a0) * rad, y + Math.sin(a0) * rad);
        c.arc(x, y, rad, a0, a0 + 0.42);
      }
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.fillStyle = '#000000';
    c.beginPath();
    c.arc(x, y, 9, 0, TAU);
    c.fill();
    c.strokeStyle = '#e9d5ff';
    c.lineWidth = 1;
    c.stroke();
  }

  private drawEmitters(): void {
    const c = this.ctx;
    c.globalCompositeOperation = 'lighter';
    if (this.emitLink) {
      c.globalAlpha = 0.35;
      c.strokeStyle = '#9fdcff';
      c.lineWidth = 1;
      c.beginPath();
      for (let k = 0; k < this.emitN; k++) {
        if (k === 0) c.moveTo(this.emitX[k], this.emitY[k]);
        else c.lineTo(this.emitX[k], this.emitY[k]);
      }
      c.stroke();
    }
    for (let k = 0; k < this.emitN; k++) {
      const x = this.emitX[k];
      const y = this.emitY[k];
      const p = 1 + Math.sin(this.globalT * 0.1 + k) * 0.2;
      c.globalAlpha = 0.8;
      c.drawImage(this.sprites.glow[C_WHITE], x - 22 * p, y - 22 * p, 44 * p, 44 * p);
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x - 12 * p, y); c.lineTo(x + 12 * p, y);
      c.moveTo(x, y - 12 * p); c.lineTo(x, y + 12 * p);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  private drawLasers(): void {
    if (this.ln === 0) return;
    const c = this.ctx;
    c.lineCap = 'round';
    for (let i = 0; i < this.ln; i++) {
      const t = this.lt[i];
      const warn = this.lwarn[i];
      const x0 = this.lx[i];
      const y0 = this.ly[i];
      const x1 = x0 + Math.cos(this.la[i]) * this.llen[i];
      const y1 = y0 + Math.sin(this.la[i]) * this.llen[i];
      const col = COLORS[this.lcol[i]];
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      if (t < warn) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.25 + 0.25 * Math.sin(t * 0.5);
        c.strokeStyle = col;
        c.lineWidth = 1.5 + (t / warn) * 2;
        c.stroke();
      } else {
        const at = t - warn;
        const act = this.lact[i];
        let k = 1;
        if (at < 8) k = at / 8;
        else if (at > act - 10) k = Math.max(0, (act - at) / 10);
        const w = this.lw[i] * k;
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.45;
        c.strokeStyle = col;
        c.lineWidth = w * 1.8;
        c.stroke();
        c.globalAlpha = 0.9;
        c.lineWidth = w;
        c.stroke();
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
        c.strokeStyle = '#ffffff';
        c.lineWidth = w * 0.42;
        c.stroke();
      }
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.lineCap = 'butt';
  }

  private drawBoss(alpha: number): void {
    const c = this.ctx;
    const st = STAGES[this.stage];
    const x = this.bossPX + (this.bossX - this.bossPX) * alpha;
    const y = this.bossPY + (this.bossY - this.bossPY) * alpha;
    const col = this.mode === 'attract' ? '#ffffff' : st.color;
    const rot = this.bossRot;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.55;
    c.drawImage(this.sprites.glow[st.colorIdx], x - 70, y - 70, 140, 140);
    c.strokeStyle = col;
    c.lineWidth = 1.1;
    c.globalAlpha = 0.7;
    c.beginPath();
    c.arc(x, y, 44, 0, TAU);
    for (let k = 0; k < 24; k++) {
      const a = rot + (k * TAU) / 24;
      const r0 = k % 6 === 0 ? 34 : 40;
      c.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      c.lineTo(x + Math.cos(a) * 44, y + Math.sin(a) * 44);
    }
    c.stroke();
    c.globalAlpha = 0.55;
    c.beginPath();
    for (let tri = 0; tri < 2; tri++) {
      for (let k = 0; k <= 3; k++) {
        const a = -rot * 1.6 + tri * Math.PI + (k * TAU) / 3;
        const px = x + Math.cos(a) * 32;
        const py = y + Math.sin(a) * 32;
        if (k === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
    }
    c.stroke();
    c.beginPath();
    c.arc(x, y, 21, 0, TAU);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.font = FONT_BOSS;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.shadowColor = col;
    c.shadowBlur = 12;
    c.fillText(st.glyph, x, y + 1);
    c.shadowBlur = 0;
    if (this.mode === 'phase') {
      const rem = 1 - this.phaseT / this.phaseDur;
      c.strokeStyle = '#ffffff';
      c.globalAlpha = 0.85;
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(x, y, 53, -Math.PI / 2, -Math.PI / 2 + TAU * rem);
      c.stroke();
      c.globalAlpha = 1;
    }
  }

  private drawParticles(shx: number, shy: number): void {
    if (this.pn === 0) return;
    const c = this.ctx;
    const S = this.S;
    const glow = this.sprites.glow;
    const core = this.sprites.core;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (let i = 0; i < this.pn; i++) {
      const k = this.pk[i];
      const x = this.ppx[i];
      const y = this.ppy[i];
      const lf = this.plife[i] / this.pmax[i];
      const col = this.pcol[i];
      switch (k) {
        case K_SPARK:
          c.globalAlpha = lf;
          c.strokeStyle = COLORS[col];
          c.lineWidth = this.psz[i];
          c.beginPath();
          c.moveTo(x, y);
          c.lineTo(x - this.pvx[i] * 3, y - this.pvy[i] * 3);
          c.stroke();
          break;
        case K_DOT: {
          const r = this.psz[i] * (0.5 + lf * 0.7);
          c.globalAlpha = lf;
          c.drawImage(glow[col], x - r, y - r, r * 2, r * 2);
          break;
        }
        case K_RING:
          c.globalAlpha = lf * 0.85;
          c.strokeStyle = COLORS[col];
          c.lineWidth = 0.6 + lf * 2.2;
          c.beginPath();
          c.arc(x, y, this.psz[i], 0, TAU);
          c.stroke();
          break;
        case K_ITEM:
          c.globalAlpha = 0.8;
          c.drawImage(glow[col], x - 7, y - 7, 14, 14);
          c.globalAlpha = 1;
          c.drawImage(core[T_CROSS * N_COLORS + C_WHITE], x - 4, y - 4, 8, 8);
          break;
        case K_PETAL: {
          const a = this.prot[i];
          const sc = S * 0.9 * this.psz[i];
          const cs = Math.cos(a) * sc;
          const sn = Math.sin(a) * sc;
          c.globalCompositeOperation = 'source-over';
          c.globalAlpha = Math.min(1, lf * 3) * 0.75;
          c.setTransform(cs, sn * 0.5, -sn, cs, (x + shx) * S, (y + shy) * S);
          c.drawImage(core[T_PETAL * N_COLORS + C_PINK], -5, -5, 10, 10);
          c.setTransform(S, 0, 0, S, shx * S, shy * S);
          c.globalCompositeOperation = 'lighter';
          break;
        }
      }
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.lineCap = 'butt';
  }

  private drawPlayerBody(alpha: number): void {
    const c = this.ctx;
    const x = this.plPX + (this.plX - this.plPX) * alpha;
    const y = this.plPY + (this.plY - this.plPY) * alpha;
    const blink = (this.invuln > 0 || this.deathTimer >= 0) && ((this.globalT >> 2) & 1) === 1;
    const baseA = blink ? 0.3 : 1;
    // 残像
    c.globalCompositeOperation = 'lighter';
    if (this.moving) {
      for (let k = 1; k < 8; k++) {
        const idx = (this.trailHead - k + 10) % 10;
        const r = 12 - k * 1.2;
        c.globalAlpha = (0.32 - k * 0.04) * baseA;
        c.drawImage(this.sprites.glowCrimson, this.trailX[idx] - r, this.trailY[idx] - r, r * 2, r * 2);
      }
    }
    c.globalAlpha = 0.65 * baseA;
    c.drawImage(this.sprites.glowCrimson, x - 20, y - 20, 40, 40);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = baseA;
    // 三重県臣：えんじのネクタイ
    c.fillStyle = '#7d0f2a';
    c.strokeStyle = '#ffd3dc';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x, y - 12);
    c.lineTo(x + 7.5, y - 1);
    c.lineTo(x, y + 10);
    c.lineTo(x - 7.5, y - 1);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#ff4d6d';
    c.beginPath();
    c.moveTo(x - 2.4, y - 7);
    c.lineTo(x + 2.4, y - 7);
    c.lineTo(x + 1.4, y - 4.5);
    c.lineTo(x + 3, y + 4);
    c.lineTo(x, y + 7);
    c.lineTo(x - 3, y + 4);
    c.lineTo(x - 1.4, y - 4.5);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
  }

  private drawHitbox(alpha: number): void {
    const c = this.ctx;
    const x = this.plPX + (this.plX - this.plPX) * alpha;
    const y = this.plPY + (this.plY - this.plPY) * alpha;
    if (this.focus || this.touchActive) {
      const rot = this.globalT * 0.06;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 1;
      c.globalAlpha = 0.55;
      c.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = rot + (k * TAU) / 4;
        c.moveTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
        c.arc(x, y, 11, a, a + 0.9);
      }
      c.stroke();
      c.globalAlpha = 0.12;
      c.beginPath();
      c.arc(x, y, GRAZE, 0, TAU);
      c.stroke();
    }
    c.globalAlpha = 1;
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#ff2d55';
    c.lineWidth = 1.3;
    c.beginPath();
    c.arc(x, y, PR + 0.9, 0, TAU);
    c.fill();
    c.stroke();
  }

  private drawBullets(alpha: number, shx: number, shy: number): void {
    const n = this.bn;
    if (n === 0) return;
    const c = this.ctx;
    const S = this.S;
    const core = this.sprites.core;
    const glow = this.sprites.glow;
    const ia = 1 - alpha;
    // Pass 1: 加算グロー（高密度時は省略して帯域を守る）
    if (n < 2600) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.42;
      for (let i = 0; i < n; i++) {
        if (this.bghost[i] > 0) continue;
        const x = this.bx[i] * alpha + this.bpx[i] * ia;
        const y = this.by[i] * alpha + this.bpy[i] * ia;
        const r = TYPE_VIS[this.btyp[i]] * 1.6;
        c.drawImage(glow[this.bcol[i]], x - r, y - r, r * 2, r * 2);
      }
    }
    // Pass 2: 本体（白芯 + 色縁 = 最大コントラスト）
    c.globalCompositeOperation = 'source-over';
    let curA = 1;
    c.globalAlpha = 1;
    const gt = this.globalT;
    for (let i = 0; i < n; i++) {
      const x = this.bx[i] * alpha + this.bpx[i] * ia;
      const y = this.by[i] * alpha + this.bpy[i] * ia;
      const typ = this.btyp[i];
      const v = TYPE_VIS[typ];
      const t = this.bt[i];
      const f = this.bflg[i];
      let a = 1;
      let sc = 1;
      const gh = this.bghost[i];
      if (gh > 0) {
        a = 0.32;
        sc = 1 + gh * 0.03;
      } else if (t < 6) sc = 1 + (6 - t) * 0.1;
      if (f & FL_FADE) {
        if (t > 30 && t < 70) a *= 1 - ((t - 30) / 40) * 0.66;
        else if (t >= 70 && t < 150) a *= 0.34;
        else if (t >= 150 && t < 190) a *= 0.34 + ((t - 150) / 40) * 0.66;
      }
      if (a !== curA) {
        c.globalAlpha = a;
        curA = a;
      }
      const rm = TYPE_ROT[typ];
      const X = (x + shx) * S;
      const Y = (y + shy) * S;
      const k = S * sc;
      if (rm === 0) c.setTransform(k, 0, 0, k, X, Y);
      else {
        const ang = rm === 1 ? this.ba[i] : t * 0.09 + i;
        const cs = Math.cos(ang) * k;
        const sn = Math.sin(ang) * k;
        c.setTransform(cs, sn, -sn, cs, X, Y);
      }
      const spr = core[typ * N_COLORS + this.bcol[i]];
      c.drawImage(spr, -v, -v, v * 2, v * 2);
      if (f & FL_SUPER) {
        const o = 2.2 + Math.sin(gt * 0.45 + i) * 1.6;
        c.globalAlpha = 0.42 * a;
        c.drawImage(spr, -v + o, -v, v * 2, v * 2);
        c.drawImage(spr, -v - o, -v, v * 2, v * 2);
        c.globalAlpha = a;
      }
    }
    c.globalAlpha = 1;
    c.setTransform(S, 0, 0, S, shx * S, shy * S);
  }

  private drawCancelRing(): void {
    if (this.cancelR < 0 || this.cancelR > 900) return;
    const c = this.ctx;
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = Math.max(0, 0.5 - this.cancelR / 1800);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(this.cancelX, this.cancelY, this.cancelR, 0, TAU);
    c.stroke();
    c.globalAlpha *= 0.5;
    c.lineWidth = 12;
    c.beginPath();
    c.arc(this.cancelX, this.cancelY, Math.max(0, this.cancelR - 10), 0, TAU);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  private drawPopups(): void {
    if (this.qn === 0) return;
    const c = this.ctx;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let i = 0; i < this.qn; i++) {
      const k = this.qkind[i];
      const lf = this.qlife[i] / (k === 0 ? 50 : 90);
      c.globalAlpha = Math.min(1, lf * 2.5);
      if (k === 0) {
        this.drawNum(this.gold, this.qv[i], this.qx[i], this.qy[i] - 6, 12, 2, 0);
      } else {
        c.font = FONT_POP;
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(0,0,0,0.8)';
        c.strokeText(POP_TEXTS[k], this.qx[i], this.qy[i]);
        c.fillStyle = k === POP_EXTEND ? '#ffd98a' : '#ffffff';
        c.fillText(POP_TEXTS[k], this.qx[i], this.qy[i]);
      }
    }
    c.globalAlpha = 1;
  }

  private drawTimeStop(): void {
    const c = this.ctx;
    const ts = this.timeStop;
    const fin = Math.min(1, (200 - ts) / 12) * Math.min(1, ts / 10);
    c.globalAlpha = 0.28 * fin;
    c.fillStyle = '#1b2a78';
    c.fillRect(0, 0, W, H);
    // 窓枠
    c.globalAlpha = 0.22 * fin;
    c.strokeStyle = '#cfe0ff';
    c.lineWidth = 3;
    c.strokeRect(40, 60, W - 80, H - 200);
    c.beginPath();
    c.moveTo(W / 2, 60); c.lineTo(W / 2, H - 140);
    c.moveTo(40, (60 + H - 140) / 2); c.lineTo(W - 40, (60 + H - 140) / 2);
    c.stroke();
    // 時計
    const cx = W / 2;
    const cy = 330;
    c.globalAlpha = 0.5 * fin;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, 70, 0, TAU);
    c.stroke();
    const ha = -Math.PI / 2 + ((200 - ts) / 200) * TAU;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(ha) * 62, cy + Math.sin(ha) * 62);
    c.stroke();
    const n = Math.min(5, Math.ceil(ts / 40));
    c.globalAlpha = 0.8 * fin;
    c.font = FONT_COUNT;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#ffffff';
    c.fillText(COUNTDOWN[n], cx, cy + 4);
    c.globalAlpha = 1;
  }

  private drawBombFx(): void {
    const c = this.ctx;
    const S = this.S;
    const p = 1 - this.bombT / 90;
    const sc = 0.5 + easeOut(Math.min(1, p * 1.6)) * 1.9;
    c.globalAlpha = (1 - p) * 0.95;
    c.setTransform(S * sc, 0, 0, S * sc, this.bombX * S, (this.bombY - 30) * S);
    c.font = FONT_HA;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineWidth = 8;
    c.strokeStyle = '#7d0f2a';
    c.strokeText('は？', 0, 0);
    c.fillStyle = '#ffffff';
    c.fillText('は？', 0, 0);
    c.setTransform(S, 0, 0, S, 0, 0);
    c.globalAlpha = 1;
  }

  private drawCutin(): void {
    const c = this.ctx;
    const st = STAGES[this.stage];
    const t = this.cutinT;
    const inE = t < 16 ? easeOut(t / 16) : 1;
    const outE = t > 86 ? (t - 86) / 24 : 0;
    const a = inE * (1 - outE);
    const slide = (1 - inE) * W * 0.8 - outE * W * 0.5;
    const yc = 268;
    c.globalAlpha = 0.8 * a;
    c.fillStyle = '#04050b';
    c.beginPath();
    c.moveTo(-10 + slide, yc - 34);
    c.lineTo(W + 10 + slide, yc - 58);
    c.lineTo(W + 10 + slide, yc + 34);
    c.lineTo(-10 + slide, yc + 58);
    c.closePath();
    c.fill();
    c.strokeStyle = st.color;
    c.lineWidth = 1.5;
    c.globalAlpha = a;
    c.beginPath();
    c.moveTo(-10 + slide, yc - 34);
    c.lineTo(W + 10 + slide, yc - 58);
    c.moveTo(-10 + slide, yc + 58);
    c.lineTo(W + 10 + slide, yc + 34);
    c.stroke();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = 0.16 * a;
    c.font = FONT_CUT_BIG;
    c.fillStyle = st.color;
    c.fillText(st.glyph, W * 0.78 + slide * 1.4 - t * 0.3, yc + 6);
    c.globalAlpha = a;
    c.font = FONT_CUT_SUB;
    c.fillStyle = st.color;
    c.fillText('✝ 本 質 カ ー ド ✝', W / 2 + slide, yc - 24);
    c.font = FONT_CUT_NAME;
    c.fillStyle = '#ffffff';
    c.shadowColor = st.color;
    c.shadowBlur = 14;
    c.fillText(st.phases[this.phase].name, W / 2 + slide * 0.8, yc + 4);
    c.shadowBlur = 0;
    c.font = FONT_CUT_SUB;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText(BOSS_HUD[this.stage], W / 2 + slide * 0.6, yc + 32);
    c.globalAlpha = 1;
  }

  private drawNum(at: DigitAtlas, v: number, x: number, y: number, h: number, align: number, dec: number): void {
    const mul = dec === 2 ? 100 : dec === 1 ? 10 : 1;
    let n = Math.floor(Math.abs(v) * mul + 1e-6);
    const buf = this.numBuf;
    let len = 0;
    do {
      buf[len++] = n % 10;
      n = Math.floor(n / 10);
      if (dec > 0 && len === dec) buf[len++] = DIGIT_DOT;
    } while ((n > 0 || (dec > 0 && len <= dec + 1)) && len < 22);
    const sc = h / at.ch;
    const fw = at.cw * sc;
    const adv = fw * 0.74;
    const total = len * adv;
    let xx = align === 0 ? x : align === 1 ? x - total : x - total / 2;
    const c = this.ctx;
    for (let k = len - 1; k >= 0; k--) {
      c.drawImage(at.canvas, buf[k] * at.cw, 0, at.cw, at.ch, xx - (fw - adv) / 2, y, fw, h);
      xx += adv;
    }
  }

  private drawHUD(): void {
    const c = this.ctx;
    const st = STAGES[this.stage];
    const d = DIFFS[this.diff];
    c.globalAlpha = 1;
    c.textBaseline = 'alphabetic';
    // フェーズタイマー
    if (this.mode === 'phase') {
      const frac = Math.max(0, 1 - this.phaseT / this.phaseDur);
      c.fillStyle = st.color;
      c.fillRect(0, 0, W * frac, 3);
      const rem = Math.max(0, (this.phaseDur - this.phaseT) / 60);
      if (rem < 5) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.4 + 0.4 * Math.sin(this.globalT * 0.4);
        c.drawImage(this.sprites.glow[C_YELLOW], W / 2 - 40, -12, 80, 50);
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
      }
      this.drawNum(this.digits, rem, W / 2, 6, 22, 2, 1);
      c.font = FONT_PHASE;
      c.textAlign = 'right';
      c.fillStyle = 'rgba(0,0,0,0.5)';
      const tw = this.phaseNameW;
      c.fillRect(W - tw - 20, 55, tw + 20, 18);
      c.fillStyle = '#ffffff';
      c.fillText(st.phases[this.phase].name, W - 10, 68);
    }
    // スコア
    c.font = FONT_HUD_S;
    c.textAlign = 'left';
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillText('SCORE', 10, 14);
    this.drawNum(this.gold, this.score, 10, 16, 17, 0, 0);
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.fillText('HI', 10, 45);
    this.drawNum(this.digits, Math.max(this.hi, this.score), 24, 36, 11, 0, 0);
    // 難易度 & 係数
    c.textAlign = 'right';
    c.font = FONT_HUD_M;
    c.fillStyle = d.color;
    c.fillText(DIFF_HUD[this.diff], W - 36, 16);
    this.drawNum(this.digits, d.hensachi, W - 10, 5, 14, 1, 0);
    c.font = FONT_HUD_S;
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillText('難度係数 L', W - 50, 36);
    this.drawNum(this.digits, this.L, W - 10, 26, 13, 1, 2);
    c.textAlign = 'left';
    c.fillText(STAGE_LABELS[this.stage], 10, 58);
    // 残機
    const by = H - 14;
    for (let k = 0; k < this.lives && k < 9; k++) {
      const x = 16 + k * 14;
      c.fillStyle = '#9b1236';
      c.strokeStyle = '#ffd3dc';
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(x, by - 22);
      c.lineTo(x + 4.5, by - 15);
      c.lineTo(x, by - 8);
      c.lineTo(x - 4.5, by - 15);
      c.closePath();
      c.fill();
      c.stroke();
    }
    // 「は？」ストック
    c.font = FONT_BOMBCHIP;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let k = 0; k < this.bombs && k < 9; k++) {
      const x = 16 + k * 16;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(x, by, 6.5, 0, TAU);
      c.fill();
      c.fillStyle = '#7d0f2a';
      c.fillText('は', x, by + 0.5);
    }
    // グレイズ & まあゲージ
    c.textBaseline = 'alphabetic';
    c.textAlign = 'right';
    c.font = FONT_HUD_S;
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillText('GRAZE', W - 10, H - 36);
    this.drawNum(this.digits, this.graze, W - 10, H - 34, 12, 1, 0);
    const gw = 96;
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(W - 10 - gw, H - 14, gw, 5);
    c.fillStyle = '#ff6b9a';
    c.fillRect(W - 10 - gw, H - 14, (gw * this.gauge) / GAUGE_MAX, 5);
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText('まあ', W - 14 - gw, H - 8);
    c.textAlign = 'left';
  }

  private drawIntro(): void {
    const c = this.ctx;
    const st = STAGES[this.stage];
    const t = this.modeT;
    const a = Math.min(1, t / 20) * Math.min(1, (INTRO - t) / 25);
    if (a <= 0) return;
    c.globalAlpha = 0.72 * a;
    c.fillStyle = '#04050b';
    c.fillRect(0, 210, W, 150);
    c.globalAlpha = a;
    c.fillStyle = st.color;
    c.fillRect(0, 210, W * Math.min(1, t / 30), 1.5);
    c.fillRect(W - W * Math.min(1, t / 30), 358.5, W * Math.min(1, t / 30), 1.5);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = FONT_STAGE;
    c.fillStyle = st.color;
    c.fillText(STAGE_LABELS[this.stage], W / 2, 234);
    c.font = FONT_TITLE;
    c.fillStyle = '#ffffff';
    c.shadowColor = st.color;
    c.shadowBlur = 16;
    c.fillText(st.title, W / 2, 272);
    c.shadowBlur = 0;
    c.font = FONT_HUD_M;
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText(BOSS_HUD[this.stage], W / 2, 302);
    const wipe = Math.max(0, Math.min(1, (t - 45) / 70));
    c.save();
    c.beginPath();
    c.rect(0, 318, W * wipe, 32);
    c.clip();
    c.font = FONT_QUOTE;
    c.fillStyle = '#f5e9d0';
    c.fillText(st.quote, W / 2, 334);
    c.restore();
    c.globalAlpha = 1;
  }

  private drawGapBanner(): void {
    const c = this.ctx;
    const t = this.modeT;
    const a = Math.min(1, t / 10) * Math.min(1, (GAP - t) / 15);
    c.globalAlpha = a;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = FONT_BANNER;
    c.fillStyle = '#ffffff';
    c.shadowColor = STAGES[this.stage].color;
    c.shadowBlur = 18;
    c.fillText('✝本質回避✝', W / 2, 250);
    c.shadowBlur = 0;
    c.font = FONT_HUD_M;
    c.fillStyle = this.bannerClean ? '#ffd98a' : 'rgba(255,255,255,0.7)';
    c.fillText(this.bannerClean ? 'NO MISS BONUS' : 'SURVIVAL BONUS', W / 2, 280);
    this.drawNumPlus(this.bannerVal, W / 2, 292, 18);
    c.globalAlpha = 1;
  }

  private drawNumPlus(v: number, x: number, y: number, h: number): void {
    const sc = h / this.gold.ch;
    const fw = this.gold.cw * sc;
    this.ctx.drawImage(this.gold.canvas, DIGIT_PLUS * this.gold.cw, 0, this.gold.cw, this.gold.ch, x - 70 - fw / 2, y, fw, h);
    this.drawNum(this.gold, v, x + 6, y, h, 2, 0);
  }

  private drawStageClear(): void {
    const c = this.ctx;
    const t = this.modeT;
    const a = Math.min(1, t / 15) * Math.min(1, (CLEAR_T - t) / 20);
    c.globalAlpha = 0.65 * a;
    c.fillStyle = '#04050b';
    c.fillRect(0, 220, W, 120);
    c.globalAlpha = a;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = FONT_BANNER;
    c.fillStyle = '#ffffff';
    c.shadowColor = STAGES[this.stage].color;
    c.shadowBlur = 20;
    c.fillText('STAGE CLEAR', W / 2, 250);
    c.shadowBlur = 0;
    c.font = FONT_QUOTE;
    c.fillStyle = '#f5e9d0';
    c.fillText('——耐え抜いた。何も解決していないが。', W / 2, 282);
    this.drawNumPlus(this.stageBonus, W / 2, 300, 18);
    c.globalAlpha = 1;
  }

  private drawOver(): void {
    const c = this.ctx;
    const t = this.modeT;
    const a = Math.min(1, t / 30);
    c.globalAlpha = 0.55 * a;
    c.fillStyle = '#000000';
    c.fillRect(0, 0, W, H);
    c.globalAlpha = a;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = FONT_HA;
    c.lineWidth = 6;
    c.strokeStyle = '#7d0f2a';
    c.strokeText('は？', W / 2, 270);
    c.fillStyle = '#ffffff';
    c.fillText('は？', W / 2, 270);
    c.font = FONT_STAGE;
    c.fillStyle = '#ff6b8a';
    c.fillText('GAME OVER', W / 2, 350);
    c.globalAlpha = 1;
  }

  private drawEnding(): void {
    const c = this.ctx;
    const t = this.modeT;
    c.globalAlpha = Math.min(0.6, t / 80);
    c.fillStyle = '#05030a';
    c.fillRect(0, 0, W, H);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = FONT_END;
    for (let i = 0; i < ENDING_LINES.length; i++) {
      const a = Math.max(0, Math.min(1, (t - 40 - i * 70) / 40));
      c.globalAlpha = a;
      c.fillStyle = i === 2 ? '#ffd3ea' : '#ffffff';
      c.fillText(ENDING_LINES[i], W / 2, 220 + i * 40);
    }
    const a2 = Math.max(0, Math.min(1, (t - 360) / 50));
    c.globalAlpha = a2;
    c.font = FONT_BANNER;
    c.fillStyle = '#ffffff';
    c.shadowColor = '#ff6bd6';
    c.shadowBlur = 20;
    c.fillText('✝完✝', W / 2, 420);
    c.shadowBlur = 0;
    c.globalAlpha = 1;
  }
}

