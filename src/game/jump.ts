// ─────────────────────────────────────────────────────────────
//  無限ジャンプモード — 重力つき回避（本編とは別のWAVE内容）
//  ・左右 ＋ Space：押した長さで跳躍力が変わる／空中でも跳べる
//  ・地面なし。常に落ちる。跳んで空中に留まりながら避ける
//  ・WAVE は循環し、進むほど難度が上がる（終わりなし）
// ─────────────────────────────────────────────────────────────
import type { Engine } from './engine';
import {
  W, H, TAU,
  T_SMALL, T_MED, T_LARGE, T_RICE, T_KUNAI, T_CROSS, T_STAR,
  C_RED, C_ORANGE, C_YELLOW, C_GREEN, C_CYAN, C_BLUE, C_VIOLET, C_WHITE,
  B_BOUNCE, B_SPLIT, FL_NOCULL,
  POP_HA, POP_MITENAI, POP_OMOSHIROI, POP_HONSHITSU,
} from './data';
import type { PatternDef } from './patterns';

const PI = Math.PI;

// ── 物理（跳躍力は低い。押し込みで伸びる） ─────────────────
export const J_GRAV = 0.2; // 重力加速度 px/frame²
export const J_JUMP_V = 3.1; // 押した瞬間の初速
export const J_HOLD_ACC = 0.12; // 押し続けた分の加算
export const J_HOLD_MAX = 14; // 押し込みが効く最大フレーム
export const J_FALL_MAX = 4.6; // 落下終端速度
export const J_MOVE_ACC = 0.68; // 左右の加速度
export const J_MOVE_MAX = 3.4; // 左右の最高速
export const J_MOVE_FRIC = 0.8; // 入力なし時の減速

export const J_L0 = 0.75; // 開始難度
export const J_L_STEP = 0.12; // WAVEごとの上昇
export const J_L_MAX = 4.2; // 難度上限

export interface JumpWaveDef {
  readonly id: string;
  readonly name: string;
  readonly boss: string;
  readonly glyph: string;
  readonly color: string;
  readonly colorIdx: number;
  readonly dur: number; // seconds
}

export const JUMP_WAVES: readonly JumpWaveDef[] = [
  { id: 'j1', name: '「は？」の雨', boss: '三重県臣', glyph: '三', color: '#ff3b5c', colorIdx: C_RED, dur: 30 },
  { id: 'j2', name: '窓の外の稜線', boss: '砂糖東洋', glyph: '砂', color: '#36e6ff', colorIdx: C_CYAN, dur: 30 },
  { id: 'j3', name: '面白い', boss: '数理零', glyph: '零', color: '#b86bff', colorIdx: C_VIOLET, dur: 32 },
  { id: 'j4', name: '球技大会、二点差', boss: '伊崎・伊豆見', glyph: '球', color: '#ff8a2a', colorIdx: C_ORANGE, dur: 30 },
  { id: 'j5', name: '翠湖十キロ', boss: '翠湖', glyph: '湖', color: '#4a7bff', colorIdx: C_BLUE, dur: 34 },
  { id: 'j6', name: '紙に書いて読み上げる', boss: '寺地星', glyph: '星', color: '#ffd23f', colorIdx: C_YELLOW, dur: 32 },
  { id: 'j7', name: 'グレートチェーン', boss: '倉石暁', glyph: '倉', color: '#3dff9a', colorIdx: C_GREEN, dur: 34 },
  { id: 'j8', name: 'フェイカツの祈願', boss: 'フェイカツ', glyph: '✝', color: '#dfe8ff', colorIdx: C_WHITE, dur: 36 },
];

export const N_WAVES = JUMP_WAVES.length;

// ── 配置ヘルパー ───────────────────────────────────────────
/** 横一列（上端・下端）に隙間を空けて並べる */
function curtainX(
  g: Engine, y0: number, ang: number, spd: number, type: number, col: number,
  step: number, gapC: number, gapW: number, jit: number,
): void {
  for (let x = step * 0.5; x <= W; x += step) {
    if (Math.abs(x - gapC) < gapW * 0.5) continue;
    if (g.spawn(x, y0, ang + (g.rnd() - 0.5) * jit, spd, type, col) < 0) return;
  }
}

/** 縦一列（左端・右端）に隙間を空けて並べる */
function curtainY(
  g: Engine, x0: number, ang: number, spd: number, type: number, col: number,
  step: number, gapC: number, gapW: number, jit: number,
): void {
  for (let y = step * 0.5; y <= H; y += step) {
    if (Math.abs(y - gapC) < gapW * 0.5) continue;
    if (g.spawn(x0, y, ang + (g.rnd() - 0.5) * jit, spd, type, col) < 0) return;
  }
}

/** ✝ の形に弾を並べて降らせる */
function crossGlyph(g: Engine, x0: number, y0: number, cell: number, spd: number, col: number): void {
  for (let r = -3; r <= 4; r++) {
    const i = g.spawn(x0, y0 + r * cell, PI / 2, spd, T_SMALL, col);
    if (i < 0) return;
    g.bflg[i] |= FL_NOCULL;
  }
  for (let c = -2; c <= 2; c++) {
    if (c === 0) continue;
    const i = g.spawn(x0 + c * cell, y0 - cell, PI / 2, spd, T_SMALL, col);
    if (i < 0) return;
    g.bflg[i] |= FL_NOCULL;
  }
}

/** 自機狙い n-way */
function aimed(g: Engine, x: number, y: number, n: number, spread: number, spd: number, type: number, col: number): void {
  const base = g.aim(x, y);
  for (let k = 0; k < n; k++) {
    if (g.spawn(x, y, base + (k - (n - 1) / 2) * spread, spd, type, col) < 0) return;
  }
}

export const JUMP_PATTERNS: Record<string, PatternDef> = {
  // ═══ WAVE 1 三重県臣「は？」 ═══════════════════════════
  j1: {
    init(g) {
      g.moveBoss(W / 2, 92, 60);
    },
    update(g, t, L) {
      if (t % 240 === 0) g.moveBoss(80 + g.rnd() * (W - 160), 84 + g.rnd() * 26, 100);
      if (g.tick(0, Math.max(18, 48 - 5 * L))) {
        const gapW = Math.max(66, 118 - 12 * L);
        const gx = W / 2 + Math.sin(g.phaseT * 0.0097) * (W / 2 - 18);
        curtainX(g, -14, PI / 2, (1.9 + 0.25 * L) * g.sp, T_SMALL, C_RED, 17, gx, gapW, 0.1);
      }
      if (t > 90 && g.tick(1, Math.max(46, 112 - 16 * L))) {
        aimed(g, g.bossX, g.bossY, 1 + Math.floor(L * 1.1), 0.14, 2.5 * g.sp, T_KUNAI, C_WHITE);
        g.shot();
      }
      if (t % 210 === 60) g.popText(g.bossX, g.bossY - 54, POP_HA);
    },
  },

  // ═══ WAVE 2 砂糖東洋「窓の外を見ない」 ═════════════════
  j2: {
    init(g) {
      g.moveBoss(W / 2, 96, 60);
    },
    update(g, t, L) {
      if (g.tick(0, Math.max(30, 76 - 8 * L))) {
        const gap = Math.max(72, 132 - 12 * L);
        const gy = H / 2 + Math.sin(g.phaseT * 0.0083) * (H / 2 - 46);
        const left = (g.cnt[0]++ & 1) === 0;
        curtainY(g, left ? -14 : W + 14, left ? 0 : PI, 2.0 * g.sp, T_RICE, C_CYAN, 15, gy, gap, 0.08);
        g.shot();
      }
      if (g.tick(1, 66)) {
        const n = 13;
        const amp = 40 + g.rnd() * 30;
        const ph = g.rnd() * TAU;
        for (let k = 0; k <= n; k++) {
          const x = (k / n) * W;
          const y = -26 - Math.abs(Math.sin(ph + (k / n) * TAU)) * amp;
          if (g.spawn(x, y, PI / 2 + (g.rnd() - 0.5) * 0.06, 1.15 * g.sp, T_MED, C_BLUE) < 0) break;
        }
      }
      if (t % 260 === 120) g.popText(g.bossX, g.bossY - 50, POP_MITENAI);
    },
  },

  // ═══ WAVE 3 数理零「面白い」 ═══════════════════════════
  j3: {
    init(g) {
      g.moveBoss(W / 2, 88, 60);
    },
    update(g, t, L) {
      if (t % 180 === 0) g.moveBoss(90 + g.rnd() * (W - 180), 82 + g.rnd() * 30, 96);
      if (g.tick(0, Math.max(26, 58 - 6 * L))) {
        const n = Math.round(16 + 10 * g.dn) & ~1;
        const a0 = g.rnd() * TAU;
        const gi = (g.rnd() * n) | 0;
        for (let k = 0; k < n; k++) {
          if (k === gi || k === (gi + 1) % n) continue;
          const i = g.spawn(g.bossX, g.bossY, a0 + (k * TAU) / n, (1.5 + 0.1 * L) * g.sp, T_SMALL, C_VIOLET);
          if (i < 0) break;
          g.bav[i] = 0.0045;
        }
        g.shot();
      }
      if (t > 60 && g.tick(1, 124)) {
        const n = 2 + Math.floor(L);
        const base = g.aim(g.bossX, g.bossY);
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY, base + (k - (n - 1) / 2) * 0.2, 2.7 * g.sp, T_STAR, C_WHITE);
          if (i < 0) break;
          g.bav[i] = 0.01;
        }
      }
      if (t % 300 === 150) g.popText(g.bossX, g.bossY - 50, POP_OMOSHIROI);
    },
  },

  // ═══ WAVE 4 伊崎・伊豆見「球技大会、二点差」 ═══════════
  j4: {
    init(g) {
      g.moveBoss(W / 2, 110, 60);
    },
    update(g, t, L) {
      if (t % 150 === 0) g.moveBoss(W / 2 + (g.rnd() - 0.5) * 200, 96, 90);
      if (g.tick(0, Math.max(8, 22 - 2.5 * L))) {
        const n = 1 + (g.rnd() < 0.6 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.rnd() * W, -12, PI / 2 + (g.rnd() - 0.5) * 1.15, (2.0 + 0.15 * L) * g.sp, T_MED, C_ORANGE);
          if (i < 0) break;
          g.bbeh[i] = B_BOUNCE;
          g.b0[i] = 8;
        }
      }
      if (t > 120 && g.tick(1, Math.max(54, 104 - 10 * L))) {
        const left = (g.cnt[1]++ & 1) === 0;
        for (let k = 0; k < 2; k++) {
          const i = g.spawn(left ? -12 : W + 12, 80 + g.rnd() * (H * 0.5), left ? 0.5 : PI - 0.5, 2.6 * g.sp, k ? T_STAR : T_SMALL, k ? C_YELLOW : C_WHITE);
          if (i >= 0) {
            g.bbeh[i] = B_BOUNCE;
            g.b0[i] = 6;
          }
        }
        g.shot();
      }
    },
  },

  // ═══ WAVE 5 翠湖十キロ（下からせり上がる） ═════════════
  j5: {
    init(g) {
      g.moveBoss(W / 2, 96, 60);
    },
    update(g, t, L) {
      if (g.tick(0, Math.max(26, 60 - 7 * L))) {
        const gap = Math.max(78, 142 - 14 * L);
        const gx = W / 2 + Math.sin(g.phaseT * 0.0089 + 1.7) * (W / 2 - 18);
        curtainX(g, H + 14, -PI / 2, (1.9 + 0.2 * L) * g.sp, T_SMALL, C_BLUE, 18, gx, gap, 0.09);
        g.shot();
      }
      if (t > 90 && g.tick(1, 152)) {
        const n = 4 + Math.floor(g.dn * 2);
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.rnd() * W, H + 10, -PI / 2 + (g.rnd() - 0.5) * 0.7, (2.4 + 0.2 * L) * g.sp, T_MED, C_CYAN);
          if (i < 0) break;
          g.bghost[i] = 18;
        }
      }
      if (t % 250 === 90) g.popText(g.bossX, g.bossY - 48, POP_HA);
    },
  },

  // ═══ WAVE 6 寺地星「紙に書いて読み上げる」 ═════════════
  j6: {
    init(g) {
      g.moveBoss(W / 2, 104, 60);
      g.emitN = 4;
      g.emitLink = true;
      for (let k = 0; k < 4; k++) {
        g.emitX[k] = 60 + (k * (W - 120)) / 3;
        g.emitY[k] = 60;
      }
    },
    update(g, t, L) {
      if (g.tick(0, Math.max(5, 12 - 1.3 * L))) {
        const k = g.cnt[0]++ & 3;
        const i = g.spawn(g.emitX[k], g.emitY[k], PI / 2 + (g.rnd() - 0.5) * 0.25, (1.05 + 0.08 * L) * g.sp, T_CROSS, C_YELLOW);
        if (i >= 0) g.bav[i] = (g.rnd() - 0.5) * 0.02;
      }
      if (g.tick(1, Math.max(14, 34 - 3 * L))) {
        const i = g.spawn(24 + g.rnd() * (W - 48), -10, PI / 2, (1.5 + 0.1 * L) * g.sp, T_RICE, C_WHITE);
        if (i >= 0) {
          g.bghost[i] = 12;
          g.bav[i] = (g.rnd() - 0.5) * 0.05;
        }
      }
      if (t > 90 && g.tick(2, Math.max(30, 68 - 6 * L))) {
        const i = g.spawn(g.bossX, g.bossY, PI / 2 + (g.rnd() - 0.5) * 0.3, (1.6 + 0.1 * L) * g.sp, T_CROSS, C_WHITE);
        if (i >= 0) g.bghost[i] = 10;
      }
      if (g.tick(3, Math.max(90, 190 - 22 * L))) {
        const gap = Math.max(74, 130 - 10 * L);
        const gx = 40 + g.rnd() * (W - 80);
        curtainX(g, -12, PI / 2, (0.95 + 0.05 * L) * g.sp, T_CROSS, C_YELLOW, 16, gx, gap, 0.05);
      }
      if (t % 240 === 120) g.popText(g.bossX, g.bossY - 52, POP_HONSHITSU);
    },
  },

  // ═══ WAVE 7 倉石暁「グレートチェーン」 ═════════════════
  j7: {
    init(g) {
      g.moveBoss(W / 2, 100, 60);
    },
    update(g, t, L) {
      if (t % 200 === 0) g.moveBoss(80 + g.rnd() * (W - 160), 92, 88);
      if (g.tick(0, Math.max(13, 38 - 4.5 * L))) {
        const n = 1 + (g.rnd() < 0.4 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const i = g.spawn(40 + g.rnd() * (W - 80), -12 - k * 26, PI / 2 + (g.rnd() - 0.5) * 0.2, (1.25 + 0.1 * L) * g.sp, T_LARGE, C_GREEN);
          if (i < 0) break;
          g.bbeh[i] = B_SPLIT;
          g.b0[i] = 30 + ((g.rnd() * 22) | 0) + k * 14;
          g.b1[i] = 5;
          g.b2[i] = 1;
          g.b3[i] = (1.5 + 0.1 * L) * g.sp;
        }
        g.shot();
      }
      if (g.tick(1, Math.max(56, 96 - 8 * L))) {
        aimed(g, g.bossX, g.bossY, 3, 0.3, 2.2 * g.sp, T_KUNAI, C_WHITE);
      }
      if (t > 150 && g.tick(2, Math.max(40, 90 - 8 * L))) {
        const i = g.spawn(g.rnd() * W, -10, PI / 2, (1.7 + 0.1 * L) * g.sp, T_MED, C_WHITE);
        if (i >= 0) g.bav[i] = (g.rnd() - 0.5) * 0.08;
      }
    },
  },

  // ═══ WAVE 8 フェイカツの祈願 ═══════════════════════════
  j8: {
    init(g) {
      g.moveBoss(W / 2, 92, 60);
    },
    update(g, t, L) {
      if (t % 260 === 0 || t % 260 === 40) {
        crossGlyph(g, 90 + g.rnd() * (W - 180), -70 - (t % 260 === 40 ? 90 : 0), (0.9 + 0.03 * L) * 16, (1.1 + 0.08 * L) * g.sp, C_WHITE);
      }
      if (g.tick(0, Math.max(20, 46 - 5 * L))) {
        const i = g.spawn(20 + g.rnd() * (W - 40), -10, PI / 2, (2.0 + 0.12 * L) * g.sp, T_SMALL, C_WHITE);
        if (i >= 0) g.bghost[i] = 10;
      }
      if (t > 120 && g.tick(1, 156)) {
        const flip = g.cnt[1]++ & 1;
        const x0 = W * (0.28 + g.rnd() * 0.44);
        g.laser(x0, -20, Math.atan2(H + 60, (flip ? 1 : -1) * (70 + g.rnd() * 60)), 900, 13, 66, 120, C_WHITE, 0);
      }
      if (t % 200 === 100) g.popText(g.bossX, g.bossY - 50, POP_HONSHITSU);
    },
  },
};
