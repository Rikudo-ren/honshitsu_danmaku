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

// ── Modes ──────────────────────────────────────────────────
/** 0: 回避弾幕（平面4方向移動） / 1: 無限ジャンプ（重力＋ジャンプ移動） */
export type ModeId = 0 | 1;
export const N_MODES = 2;

export interface ModeDef {
  readonly id: ModeId;
  readonly name: string;
  readonly sub: string;
  readonly color: string;
}

export const MODES: readonly ModeDef[] = [
  { id: 0, name: '回避弾幕', sub: 'EVASION', color: '#ff5c86' },
  { id: 1, name: '無限ジャンプ', sub: 'INFINITE JUMP', color: '#5ecbff' },
];

// ── Difficulty ─────────────────────────────────────────────
export type DiffId = 0 | 1 | 2 | 3;

export interface DifficultyDef {
  readonly id: DiffId;
  readonly name: string;
  readonly label: string;
  readonly hensachi: number;
  /** 残機（全難易度共通の5機） */
  readonly lives: number;
  /** 「は？」（全難易度共通で5回） */
  readonly bombs: number;
  readonly color: string;
}

export const DIFFS: readonly DifficultyDef[] = [
  { id: 0, name: '普通科', label: 'EASY', hensachi: 50, lives: 5, bombs: 5, color: '#5eead4' },
  { id: 1, name: '理数科', label: 'NORMAL', hensachi: 60, lives: 5, bombs: 5, color: '#fbbf24' },
  { id: 2, name: '内進', label: 'HARD', hensachi: 70, lives: 5, bombs: 5, color: '#f472b6' },
  { id: 3, name: '数理零', label: 'LUNATIC', hensachi: 85, lives: 5, bombs: 5, color: '#a78bfa' },
];

export const LIVES = 5;
export const BOMBS = 5;

/**
 * 難度係数 L — ゲーム全体で「避けにくさ」を決める唯一のスカラー。
 *
 *   L = d + 0.16·s + 0.04·p + 0.028·f        (f: フェーズ内経過率 0..1)
 *
 * 辞書式順序 (d,s,p,f) と L の大小が完全一致するための検証：
 *   ・フェーズ内最大増分 0.028   < フェーズ刻み 0.04
 *   ・最長ステージ（4フェーズ）でも 3·0.04 + 0.028 = 0.148 < ステージ刻み 0.16
 *   ・難易度内の最大 5·0.16 + 3·0.04 + 0.028 = 0.948 < 難易度刻み 1.0
 *
 * 実プレイの「画面下部で自機がどれだけ避けにくいか」は、弾の総量だけでなく
 *   spdMul / denMul / rateMul  （量・速さ・頻度）
 *   gapMul                     （逃げ道の幅）
 *   trackMul                   （自機狙い・ホーミングの収束）
 * の5倍率で連続にスケールする。L を直接読む閾値は禁止。
 *
 * tools/dodge.ts が下部帯の危険度を、tools/measure.ts が弾幕総量を検証する。
 */
export function levelOf(d: number, s: number, p: number, f: number): number {
  return d + s * 0.16 + p * 0.04 + f * 0.028;
}

/**
 * 弾速倍率  : 0.82 → 1.55 (L=0 → 3.948)
 *  — 反応時間を直接削る。L が 1 上がるごとに約 +18%。
 */
export const spdMul = (L: number): number => 0.82 + 0.185 * L;
/**
 * 弾数倍率  : 0.55 → 1.70
 *  — 密度＝逃げ道の狭さ。L が 1 上がるごとに約 +29%。
 */
export const denMul = (L: number): number => 0.55 + 0.29 * L;
/**
 * 発射頻度倍率 : 0.62 → 1.72
 *  — 息継ぎ間隔。L が 1 上がるごとに約 +28%。
 */
export const rateMul = (L: number): number => 0.62 + 0.28 * L;
/** 弾幕強度 S = 弾数 × 弾速 × 頻度（係数と難易度の対応を保証する量） */
export const intensityOf = (L: number): number => spdMul(L) * denMul(L) * rateMul(L);
/**
 * 隙間縮小係数 G — 「画面下部の自機が通れる幅」を L で直接狭める。
 *   G(0)≈1.00 / G(1)≈0.62 / G(2)≈0.43 / G(3)≈0.33 / G(3.9)≈0.28
 * 壁・帯・環の切れ目は baseGap × G で決める（弾数を増やせない形の本丸）。
 */
export const gapMul = (L: number): number => 1 / (1 + 0.62 * L);
/**
 * 追尾・収束倍率 T — ホーミング角速度・自機狙い扇の狭さ。
 *   T(0)≈0.75 / T(2)≈1.25 / T(3.9)≈1.72
 */
export const trackMul = (L: number): number => 0.75 + 0.25 * L;
/** 単発弾の基準速度（論理px/frame）。全パターンはこの定数に倍率を掛ける。 */
export const BASE_SPD = 1.9;

// ── パターン別 強度較正 ────────────────────────────────────
/**
 * 各パターンの「基準強度」補正係数。
 * 設計規則（data.ts 冒頭の3倍率）どおりに書かれたパターンでも、
 * 形（環・壁・螺旋…）による基礎強度の差が残るため、ここで 1.00 に揃える。
 * 値は tools/measure.ts の実測（弾幕強度 T / 理論値 K·S(L)）から決定する。
 *   1.00 より大きい = その形は弱めに出るので本数／頻度を増やす
 */
export const PATTERN_CAL: Record<string, number> = {
  // 回避弾幕 — 弾幕強度 T ≈ K·S(L) になるよう実測較正（隙間・追尾は gap/track で別管理）
  s1p1: 0.96,
  s1p2: 0.85,
  s1p3: 0.98,
  s2p1: 0.92,
  s2p2: 0.75,
  s2p3: 0.85,
  s2p4: 1.11,
  s3p1: 0.57,
  s3p2: 0.90,
  s3p3: 1.16,
  s4p1: 0.90,
  s4p2: 1.03,
  s4p3: 0.89,
  s5p1: 0.78,
  s5p2: 0.58,
  s5p3: 0.61,
  s6p1: 1.09,
  s6p2: 0.95,
  s6p3: 1.15,
  s6p4: 0.83,
  // 無限ジャンプ
  j1p1: 0.76,
  j1p2: 3.22,
  j1p3: 2.13,
  j2p1: 1.19,
  j2p2: 1.00,
  j2p3: 1.20,
  j3p1: 1.28,
  j3p2: 1.11,
  j3p3: 1.31,
  j4p1: 1.35,
  j4p2: 1.22,
  j4p3: 1.51,
  j5p1: 1.28,
  j5p2: 0.89,
  j5p3: 1.89,
  j5p4: 1.73,
};

export const MAX_L = levelOf(3, 5, 3, 1);
export const INTENSITY_AT_L1 = intensityOf(1);
export const INTENSITY_MAX = intensityOf(MAX_L);

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

/** モード0: 回避弾幕 — 一年目（両馬・塀・寺地・櫻・倉石・✝本質✝） */
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

/** モード1: 無限ジャンプ — 二年目〜三年目（倉石・召野・翠湖・球技大会・沈黙） */
export const STAGES_JUMP: readonly StageDef[] = [
  {
    title: '倉石暁、降臨', boss: '倉石暁', glyph: '倉', color: '#b86bff', colorIdx: C_VIOLET,
    quote: '「僕は信徒です。教祖とは違います」',
    phases: [
      { id: 'j1p1', name: '信徒「教祖に会えた」', dur: 26 },
      { id: 'j1p2', name: 'ノート「表紙に✝」', dur: 28 },
      { id: 'j1p3', name: '教会「グレートチェーン」', dur: 30 },
    ],
  },
  {
    title: '人妻の✝本質✝', boss: '召野カイト', glyph: '召', color: '#ff6bd6', colorIdx: C_PINK,
    quote: '「人妻の結婚指輪は、封印の刻印である」',
    phases: [
      { id: 'j2p1', name: '指輪「封印の刻印」', dur: 26 },
      { id: 'j2p2', name: '英語「Take your time」', dur: 28 },
      { id: 'j2p3', name: '玉砕「告白の意味」', dur: 30 },
    ],
  },
  {
    title: '翠湖十キロ', boss: '零', glyph: '零', color: '#4fd8ff', colorIdx: C_CYAN,
    quote: '「見えないけど、ある」',
    phases: [
      { id: 'j3p1', name: '十キロ「加工なしの言葉」', dur: 28 },
      { id: 'j3p2', name: '等高線「地形図の向こう」', dur: 28 },
      { id: 'j3p3', name: '反射「湖面に映る✝本質✝」', dur: 30 },
    ],
  },
  {
    title: '球技大会、二点差', boss: '内進三年', glyph: '進', color: '#ff8a4a', colorIdx: C_ORANGE,
    quote: '「背番号に✝本質✝はない。✝に✝本質✝がある」',
    phases: [
      { id: 'j4p1', name: 'スティール「読み」', dur: 28 },
      { id: 'j4p2', name: '三点「用は済んだ」', dur: 28 },
      { id: 'j4p3', name: '二点差「最後の十秒」', dur: 32 },
    ],
  },
  {
    title: '寺地星、沈黙する', boss: '寺地星', glyph: '星', color: '#dfe8ff', colorIdx: C_WHITE,
    quote: '「わからないことが✝本質✝」',
    phases: [
      { id: 'j5p1', name: '切り抜き「十五万再生」', dur: 28 },
      { id: 'j5p2', name: '一万人「コメント欄」', dur: 28 },
      { id: 'j5p3', name: '沈黙「配信やめる」', dur: 26 },
      { id: 'j5p4', name: '三十二人「おかえり」', dur: 36 },
    ],
  },
];

export const STAGE_TABLES: readonly (readonly StageDef[])[] = [STAGES, STAGES_JUMP];
export const N_STAGES = STAGES.length;
export const N_STAGES_JUMP = STAGES_JUMP.length;
export const STAGE_LABELS: readonly string[] = ['STAGE 1', 'STAGE 2', 'STAGE 3', 'STAGE 4', 'STAGE 5', 'FINAL STAGE'];

/** ステージ表記（STAGE 1 … FINAL STAGE） */
export function stageLabel(n: number, s: number): string {
  return s === n - 1 ? 'FINAL STAGE' : STAGE_LABELS[s];
}

export function stageLevelRange(d: number, s: number, table: readonly StageDef[]): [number, number] {
  const last = table[s].phases.length - 1;
  return [levelOf(d, s, 0, 0), levelOf(d, s, last, 1)];
}

/** ポップアップ文字列（事前確保：毎フレームの文字列生成ゼロ） */
export const POP_TEXTS: readonly string[] = [
  '', 'は？', 'まあ…', '観測', '窓の外の五秒', '見てない', '面白い', '草', '✝本質✝', '「は？」+1',
  '信徒', '封印', '見えないけどある', '二点差', 'おかえり',
];
export const POP_HA = 1;
export const POP_MAA = 2;
export const POP_KANSOKU = 3;
export const POP_WINDOW = 4;
export const POP_MITENAI = 5;
export const POP_OMOSHIROI = 6;
export const POP_EXTEND = 9;
export const POP_FUKUIN = 11;
export const POP_MIENAI = 12;
export const POP_TENSA = 13;
export const POP_OKAERI = 14;

export const COUNTDOWN: readonly string[] = ['', '1', '2', '3', '4', '5'];

export const ENDING_LINES: readonly string[] = [
  '何も変わらない。何も解決しない。',
  '✝本質✝が何かは、最後までわからない。',
  'でも、来年もある。',
  'それだけで十分だ。',
];

export const ENDING_LINES_JUMP: readonly string[] = [
  '一万人から、三十二人になった。',
  '✝本質✝は、数じゃなかった。',
  '見えないけど、ある。',
  'わからないことが✝本質✝。',
];

export const ENDING_LINES_ALL: readonly (readonly string[])[] = [ENDING_LINES, ENDING_LINES_JUMP];

// ── Save data ──────────────────────────────────────────────
export interface RunStat {
  /** 到達済みのステージ index（N で全ステージクリア） */
  reached: number;
  hi: number;
  clears: number;
}

export interface Progress {
  /** [mode][difficulty] */
  stats: RunStat[][];
  /** モードごとのクリア済み難易度 */
  cleared: boolean[][];
}

// ── キー割り当て ───────────────────────────────────────────
//  操作は8つ。全部コード（KeyboardEvent.code）で保持し、保存も同じ表現。
//  移動は WASD が常時使える補助キーとして別枠で効く（下の WASD_ALIAS）。
export const KEY_ACTIONS = ['left', 'right', 'up', 'down', 'focus', 'bomb', 'jump', 'pause'] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

export interface KeyDef {
  readonly id: KeyAction;
  readonly label: string;
  /** この操作を使うモード（0:回避弾幕 1:無限ジャンプ）。空なら共通 */
  readonly modes: readonly number[];
}

export const KEY_DEFS: readonly KeyDef[] = [
  { id: 'left', label: '左', modes: [] },
  { id: 'right', label: '右', modes: [] },
  { id: 'up', label: '上', modes: [0] },
  { id: 'down', label: '下', modes: [0] },
  { id: 'focus', label: '低速（当たり判定が見える）', modes: [] },
  { id: 'bomb', label: '「は？」', modes: [] },
  { id: 'jump', label: 'ジャンプ', modes: [1] },
  { id: 'pause', label: 'ポーズ', modes: [] },
];

export type KeyMap = Record<KeyAction, string>;

export function defaultKeys(): KeyMap {
  return {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    up: 'ArrowUp',
    down: 'ArrowDown',
    focus: 'ShiftLeft',
    bomb: 'KeyZ',
    jump: 'Space',
    pause: 'Escape',
  };
}

/** 移動の補助キー（常時有効。割り当てを変えても効く） */
export const WASD_ALIAS: Readonly<Record<string, KeyAction>> = {
  KeyA: 'left',
  KeyD: 'right',
  KeyW: 'up',
  KeyS: 'down',
};

/** 表示用の短い名前 */
export function codeLabel(code: string): string {
  const fixed: Record<string, string> = {
    ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
    ShiftLeft: 'Shift', ShiftRight: 'Shift',
    ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
    AltLeft: 'Alt', AltRight: 'Alt',
    Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'BS',
    MetaLeft: 'Meta', MetaRight: 'Meta',
    Semicolon: ';', Slash: '/', Period: '.', Comma: ',', Backquote: '`',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Quote: "'",
  };
  if (fixed[code]) return fixed[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}

export const KEYS_SAVE_KEY = 'honshitsu-danmaku-keys-v1';

export const SAVE_KEY = 'honshitsu-danmaku-v2';
export const OLD_SAVE_KEY = 'honshitsu-danmaku-v1';

export function newStat(): RunStat {
  return { reached: -1, hi: 0, clears: 0 };
}

export function defaultProgress(): Progress {
  return {
    stats: [0, 1].map(() => [0, 1, 2, 3].map(() => newStat())),
    cleared: [0, 1].map(() => [false, false, false, false]),
  };
}

/** 難易度 d が遊べるか（1つ下の難易度を final まで通しでクリアで解禁） */
export function isDiffUnlocked(p: Progress, m: number, d: number): boolean {
  if (d === 0) return true;
  return p.cleared[m][d - 1];
}

export function modeCleared(p: Progress, m: number): boolean {
  return p.cleared[m][3];
}
