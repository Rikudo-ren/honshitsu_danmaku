// ─────────────────────────────────────────────────────────────
//  ✝本質✝回避弾幕 — 静的データ / 型 / 難易度数式
// ─────────────────────────────────────────────────────────────

export const W = 480;
export const H = 640;
export const TAU = Math.PI * 2;

// ── Bullet types ───────────────────────────────────────────
export const T_SMALL = 0;
export const T_MED = 1;
export const T_LARGE = 2;
export const T_RICE = 3;
export const T_KUNAI = 4;
export const T_CROSS = 5;
export const T_STAR = 6;
export const T_HEART = 7;
export const T_PETAL = 8;
export const N_TYPES = 9;

/** 当たり判定半径（論理px）。見た目より必ず小さい＝「見た目より優しい」原則 */
export const TYPE_HIT: readonly number[] = [2.6, 5.0, 10.0, 2.4, 2.4, 3.4, 3.4, 3.4, 2.6];
/** スプライト半径（論理px） */
export const TYPE_VIS: readonly number[] = [6, 10, 18, 8, 9, 9, 8, 8, 8];
/** 0:回転なし 1:進行方向 2:自転 */
export const TYPE_ROT: readonly number[] = [0, 0, 0, 1, 1, 0, 2, 1, 2];

// ── Colors ─────────────────────────────────────────────────
export const C_RED = 0;
export const C_ORANGE = 1;
export const C_YELLOW = 2;
export const C_GREEN = 3;
export const C_CYAN = 4;
export const C_BLUE = 5;
export const C_VIOLET = 6;
export const C_PINK = 7;
export const C_WHITE = 8;
export const N_COLORS = 9;
export const COLORS: readonly string[] = [
  '#ff3b5c', '#ff8a2a', '#ffd23f', '#3dff9a', '#36e6ff', '#4a7bff', '#b86bff', '#ff6bd6', '#dfe8ff',
];
export const RAINBOW: readonly number[] = [C_RED, C_ORANGE, C_YELLOW, C_GREEN, C_CYAN, C_VIOLET];

// ── Behaviours ─────────────────────────────────────────────
export const B_LINEAR = 0;
export const B_REDIRECT = 1;
export const B_BOUNCE = 2;
export const B_POLAR = 3;
export const B_GRAVITY = 4;
export const B_SINE = 5;
export const B_STEP = 6;
export const B_SPLIT = 7;
export const B_HOMING = 8;

// ── Flags ──────────────────────────────────────────────────
export const FL_GRAZED = 1;
export const FL_STOP = 2;
export const FL_FADE = 4;
export const FL_SUPER = 8;
export const FL_NOCULL = 16;

// ── Fonts ──────────────────────────────────────────────────
export const F_DISPLAY = '"Dela Gothic One", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
export const F_UI = '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif';
export const F_MINCHO = '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif';

// ── Difficulty ─────────────────────────────────────────────
export type DiffId = 0 | 1 | 2 | 3;

export interface DifficultyDef {
  readonly id: DiffId;
  readonly name: string;
  readonly label: string;
  readonly hensachi: number;
  readonly lives: number;
  readonly bombs: number;
  readonly color: string;
}

/** 全難易度 残機5 ／「は？」5 */
export const LIVES = 5;
export const BOMB_MAX = 5;

export const DIFFS: readonly DifficultyDef[] = [
  { id: 0, name: '普通科', label: 'EASY', hensachi: 50, lives: LIVES, bombs: BOMB_MAX, color: '#5eead4' },
  { id: 1, name: '理数科', label: 'NORMAL', hensachi: 60, lives: LIVES, bombs: BOMB_MAX, color: '#fbbf24' },
  { id: 2, name: '内進', label: 'HARD', hensachi: 70, lives: LIVES, bombs: BOMB_MAX, color: '#f472b6' },
  { id: 3, name: '数理零', label: 'LUNATIC', hensachi: 85, lives: LIVES, bombs: BOMB_MAX, color: '#a78bfa' },
];

// ── Game kinds ─────────────────────────────────────────────
export type KindId = 'stage' | 'jump';

export interface KindDef {
  readonly id: KindId;
  readonly name: string;
  readonly label: string;
  readonly color: string;
  readonly glyph: string;
}

export const KINDS: readonly KindDef[] = [
  { id: 'stage', name: '回避弾幕', label: 'DANMAKU', color: '#ff4d6d', glyph: '✝' },
  { id: 'jump', name: '無限ジャンプ', label: 'ENDLESS', color: '#5eead4', glyph: '跳' },
];

/**
 * 難度係数 L — 全ゲーム内で「厳密に単調増加」する唯一のスカラー。
 *   L = d + 0.13·s + 0.032·p + 0.028·f   (f: フェーズ内経過率 0..1)
 * 検証:
 *   ・フェーズ内最大増分 0.028 < フェーズ刻み 0.032
 *   ・ステージ内最大増分 3·0.032 + 0.028 = 0.124 < ステージ刻み 0.13
 *   ・難易度内最大 5·0.13 + 0.124 = 0.774 < 難易度刻み 1.0
 * ⇒ (d,s,p,f) の辞書式順序と L の大小が完全一致する。
 */
export function levelOf(d: number, s: number, p: number, f: number): number {
  return d + s * 0.13 + p * 0.032 + f * 0.028;
}
/** 弾速倍率 */
export const spdMul = (L: number): number => 0.82 + 0.15 * L;
/** 弾数倍率 */
export const denMul = (L: number): number => 0.62 + 0.26 * L;
/** 発射頻度倍率 */
export const rateMul = (L: number): number => 0.75 + 0.25 * L;

// ── Stages ─────────────────────────────────────────────────
export interface PhaseDef {
  readonly id: string;
  readonly name: string;
  readonly dur: number; // seconds
}

export interface StageDef {
  readonly title: string;
  readonly boss: string;
  readonly glyph: string;
  readonly color: string;
  readonly colorIdx: number;
  readonly quote: string;
  readonly phases: readonly PhaseDef[];
}

export const STAGES: readonly StageDef[] = [
  {
    title: '✝本質✝の発生', boss: '両馬二郎', glyph: '両', color: '#ff8a4a', colorIdx: C_ORANGE,
    quote: '「文法の✝本質✝を超えたところに本質があるんだよ」',
    phases: [
      { id: 's1p1', name: '二郎系「脂の浮き方」', dur: 24 },
      { id: 's1p2', name: '電線「本質感のある電線」', dur: 26 },
      { id: 's1p3', name: '天啓「道歩いてたら降りてきた」', dur: 28 },
    ],
  },
  {
    title: '火曜三限、味噌の地政学', boss: '塀勝也', glyph: '塀', color: '#ffd23f', colorIdx: C_YELLOW,
    quote: '「お前らが今朝飲んだ味噌汁は、地殻変動が決めてる」',
    phases: [
      { id: 's2p1', name: '地質「糸魚川-静岡構造線」', dur: 28 },
      { id: 's2p2', name: '段丘「上から描く河岸段丘」', dur: 28 },
      { id: 's2p3', name: '等高線「地形図の向こう側」', dur: 28 },
      { id: 's2p4', name: '窓「窓の外の五秒」', dur: 32 },
    ],
  },
  {
    title: '本質配信、始動', boss: '寺地星', glyph: '星', color: '#4fd8ff', colorIdx: C_CYAN,
    quote: '「本質を追えば追うほど、本質は遠くなる」',
    phases: [
      { id: 's3p1', name: '配信「コメント欄に草が流れた」', dur: 28 },
      { id: 's3p2', name: '天文「光速に近づく重力」', dur: 28 },
      { id: 's3p3', name: '星座「オリオンの三つ星」', dur: 28 },
    ],
  },
  {
    title: '恋愛学の理論崩壊', boss: '櫻優', glyph: '櫻', color: '#ff6bd6', colorIdx: C_PINK,
    quote: '「告白は、波動関数の崩壊である」',
    phases: [
      { id: 's4p1', name: '恋愛学「シュレディンガーの好意」', dur: 28 },
      { id: 's4p2', name: '第七法則「不理解の引力」', dur: 28 },
      { id: 's4p3', name: '告白「波動関数の崩壊」', dur: 30 },
    ],
  },
  {
    title: '✝本質✝のグレートチェーン', boss: '倉石暁', glyph: '倉', color: '#b86bff', colorIdx: C_VIOLET,
    quote: '「その否定こそが✝本質✝です」',
    phases: [
      { id: 's5p1', name: '聖典「✝本質✝入門ガイド」', dur: 28 },
      { id: 's5p2', name: '階層「グレートチェーン五段階」', dur: 30 },
      { id: 's5p3', name: '原✝本質✝「前-原✝本質✝」', dur: 30 },
    ],
  },
  {
    title: '来年もある', boss: '✝本質✝', glyph: '✝', color: '#ffe3f3', colorIdx: C_WHITE,
    quote: '「何も変わらない。何も解決しない。でも、来年もある」',
    phases: [
      { id: 's6p1', name: '三重「は？」', dur: 28 },
      { id: 's6p2', name: '砂糖「見てない」', dur: 28 },
      { id: 's6p3', name: '零「面白い」', dur: 30 },
      { id: 's6p4', name: '✝「来年もある」', dur: 40 },
    ],
  },
];

export const N_STAGES = STAGES.length;
export const STAGE_LABELS: readonly string[] = ['STAGE 1', 'STAGE 2', 'STAGE 3', 'STAGE 4', 'STAGE 5', 'FINAL STAGE'];

/** ポップアップ文字列（事前確保：毎フレームの文字列生成ゼロ） */
export const POP_TEXTS: readonly string[] = ['', 'は？', 'まあ…', '観測', '窓の外の五秒', '見てない', '面白い', '草', '✝本質✝', '「は？」+1'];
export const POP_HA = 1;
export const POP_MAA = 2;
export const POP_KANSOKU = 3;
export const POP_WINDOW = 4;
export const POP_MITENAI = 5;
export const POP_OMOSHIROI = 6;
export const POP_HONSHITSU = 8;
export const POP_EXTEND = 9;

export const COUNTDOWN: readonly string[] = ['', '1', '2', '3', '4', '5'];

export const ENDING_LINES: readonly string[] = [
  '何も変わらない。何も解決しない。',
  '✝本質✝が何かは、最後までわからない。',
  'でも、来年もある。',
  'それだけで十分だ。',
];

// ── Save data ──────────────────────────────────────────────
export interface Progress {
  /** 各難易度で到達済みのステージ index（表示用） */
  reached: number[];
  hi: number[];
  /** 各難易度をステージ1〜FINALまで通しでクリアした回数 */
  clears: number[];
  /** 無限ジャンプ：ハイスコア */
  jumpHi: number;
  /** 無限ジャンプ：最長生存フレーム */
  jumpBest: number;
}

export const SAVE_KEY = 'honshitsu-danmaku-v2';

export function defaultProgress(): Progress {
  return { reached: [-1, -1, -1, -1], hi: [0, 0, 0, 0], clears: [0, 0, 0, 0], jumpHi: 0, jumpBest: 0 };
}

/** 難易度は「前の難易度を通しでクリア」で解禁 */
export function isDiffUnlocked(p: Progress, d: number): boolean {
  if (d === 0) return true;
  return p.clears[d - 1] > 0;
}
