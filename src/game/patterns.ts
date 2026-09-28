// ─────────────────────────────────────────────────────────────
//  弾幕パターン — 全パラメタは難度係数 L の3倍率（sp/dn/R）と
//                パターン別較正係数 cal だけで決まる。
//
//  設計規則（これを破ると「係数と実際の難しさ」がずれる）:
//   ・弾数     : g.n(基準本数)      = 基準 × denMul(L) × cal
//   ・発射頻度 : g.tick(k, 基準間隔) = 基準間隔 / rateMul(L)
//   ・壁・帯   : g.fw(k, 基準間隔)  = 頻度に denMul も掛ける（本数を増やせない形）
//   ・弾速     : g.v(g, 基準速度)      = 基準 × spdMul(L)
//   ・L を直接読む閾値（L >= 1 など）は禁止。すべて上の倍率で連続に変化させる。
//
//  基準値は「難度係数 L の強度カーブ」に実測で載るように較正済み
//  （tools/measure.ts で全フェーズの実測比が 1.00 ± 0.15 に収まることを検証）。
// ─────────────────────────────────────────────────────────────
import type { Engine } from './engine';
import {
  W, H, TAU,
  T_SMALL, T_MED, T_LARGE, T_RICE, T_KUNAI, T_CROSS, T_STAR, T_HEART, T_PETAL,
  C_RED, C_ORANGE, C_YELLOW, C_GREEN, C_CYAN, C_BLUE, C_VIOLET, C_PINK, C_WHITE, RAINBOW,
  B_POLAR, B_GRAVITY, B_SINE, B_STEP, B_SPLIT, B_HOMING, B_LINEAR,
  FL_STOP, FL_FADE, FL_SUPER, FL_NOCULL,
  POP_HA, POP_WINDOW, POP_KANSOKU, POP_MITENAI, POP_OMOSHIROI,
} from './data';

export interface PatternDef {
  init?: (g: Engine, L: number) => void;
  update: (g: Engine, t: number, L: number) => void;
}

const PI = Math.PI;

/** 自機狙い n-way */
function aimedFan(g: Engine, x: number, y: number, n: number, spread: number, speed: number, type: number, col: number): void {
  const base = g.aim(x, y);
  for (let k = 0; k < n; k++) {
    const a = base + (k - (n - 1) / 2) * spread;
    if (g.spawn(x, y, a, speed, type, col) < 0) return;
  }
}

/** 円形弾 */
function ring(g: Engine, x: number, y: number, n: number, a0: number, speed: number, type: number, col: number): number {
  let first = -1;
  for (let k = 0; k < n; k++) {
    const i = g.spawn(x, y, a0 + (k * TAU) / n, speed, type, col);
    if (i < 0) break;
    if (first < 0) first = i;
  }
  return first;
}

// ── ビットマップ文字（コメント弾幕） ─────────────────────
const GLYPH_W: readonly string[] = ['#...#', '#.#.#', '.#.#.'];
const GLYPH_KUSA: readonly string[] = ['.#...#.', '#######', '.#...#.', '..###..', '..#.#..', '..###..', '#######', '...#...'];
const GLYPH_CROSS: readonly string[] = ['..#..', '#####', '..#..', '..#..', '..#..'];

function glyphBullets(g: Engine, rows: readonly string[], x0: number, yc: number, cell: number, speed: number, col: number): number {
  const h = rows.length;
  const w = rows[0].length;
  for (let r = 0; r < h; r++) {
    const row = rows[r];
    for (let c = 0; c < w; c++) {
      if (row.charCodeAt(c) !== 35) continue; // '=#'
      const i = g.spawn(x0 + c * cell, yc + (r - (h - 1) / 2) * cell, PI, speed, T_SMALL, col);
      if (i < 0) return w * cell;
      g.bflg[i] |= FL_NOCULL;
      g.blife[i] = 300;
    }
  }
  return w * cell;
}

// ── ✝ の点群（入門ガイド） ─────────────────────────────
const CROSS_PTS: readonly number[] = (() => {
  const a: number[] = [];
  for (let y = -3; y <= 5; y++) a.push(0, y);
  for (let x = -3; x <= 3; x++) if (x !== 0) a.push(x, -1);
  return a;
})();

const CHAIN_COLS: readonly number[] = [C_WHITE, C_VIOLET, C_RED, C_ORANGE, C_BLUE];
const ROSE_K: readonly number[] = [2, 3, 5, 4, 2.5, 7, 1.5, 6];

export const PATTERNS: Record<string, PatternDef> = {
  // ═══ STAGE 1 両馬二郎 ═══════════════════════════════════
  // 環（減速する中弾）＋ 自機狙い
  s1p1: {
    update(g, t) {
      if (g.tick(0, 32)) {
        const n = g.n(22);
        const odd = g.cnt[0]++ & 1;
        const a0 = g.rnd() * TAU;
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY, a0 + (k * TAU) / n, g.v(1.55), T_MED, odd ? C_ORANGE : C_YELLOW);
          if (i < 0) break;
          g.bacc[i] = -0.006;
          g.bmin[i] = g.v(0.95);
          g.bav[i] = odd ? 0.003 : -0.003;
        }
        g.shot();
      }
      if (t > 60 && g.tick(1, 90)) {
        aimedFan(g, g.bossX, g.bossY, g.n(1.6), 0.16, g.v(2.3), T_SMALL, C_WHITE);
      }
    },
  },
  // 上から落ちる壁（隙間が動く）＋ 自機狙い苦無
  s1p2: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 100, 60);
    },
    update(g, t, L) {
      if (t % 120 === 0) g.moveBoss(W / 2 + (g.rnd() - 0.5) * 160, 88 + g.rnd() * 30, 110);
      if (g.fw(0, 58)) {
        const gap = Math.max(46, 84 - 7 * L);
        let gx = W / 2 + Math.sin(g.phaseT * 0.013) * 150 + (g.rnd() - 0.5) * 60;
        const lo = gap / 2 + 10;
        if (gx < lo) gx = lo;
        if (gx > W - lo) gx = W - lo;
        for (let x = 6; x <= W - 6; x += 15) {
          if (Math.abs(x - gx) < gap / 2) continue;
          if (g.spawn(x, -46 + 30 * (1 - ((x - W / 2) / (W / 2)) ** 2), PI / 2, g.v(1.3), T_SMALL, C_CYAN) < 0) break;
        }
      }
      if (t > 30 && g.tick(1, 110)) {
        aimedFan(g, g.bossX, g.bossY, g.n(2.6), 0.12, g.v(2.2), T_KUNAI, C_RED);
        g.shot();
      }
    },
  },
  // 螺旋（腕は弾数倍率で増える）＋ 上から舞い落ちる十字
  s1p3: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 130, 60);
    },
    update(g, _t) {
      if (g.tick(0, 7)) {
        const arms = g.n(4);
        g.fv[0] += 0.16;
        for (let k = 0; k < arms; k++) {
          if (g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / arms, g.v(1.8), T_CROSS, C_VIOLET) < 0) break;
        }
        g.shot();
      }
      if (g.tick(1, 52)) {
        const c = g.n(1.6);
        for (let k = 0; k < c; k++) {
          const i = g.spawn(20 + g.rnd() * (W - 40), -8, PI / 2 + (g.rnd() - 0.5) * 0.3, g.v(1.0 + g.rnd() * 0.9), T_CROSS, C_YELLOW);
          if (i >= 0) g.bghost[i] = 24;
        }
      }
    },
  },

  // ═══ STAGE 2 塀勝也 ═════════════════════════════════════
  // 構造線レーザー ＋ 自機狙い環 ＋ 左右からの米弾
  s2p1: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 110, 60);
    },
    update(g, t) {
      if (t % 300 === 0) {
        const flip = g.cnt[1]++ & 1;
        const x0 = W * (0.3 + g.rnd() * 0.4);
        const x1 = x0 + (flip ? 1 : -1) * (60 + g.rnd() * 60);
        g.laser(x0, -20, Math.atan2(H + 60, x1 - x0), 900, 14, 70, 130, C_ORANGE, 0);
      }
      if (g.tick(0, 62)) {
        const n = g.n(26) & ~1;
        const a0 = g.aim(g.bossX, g.bossY);
        for (let k = 0; k < n; k++) {
          if (g.spawn(g.bossX, g.bossY, a0 + (k * TAU) / n, g.v(1.5), T_MED, k & 1 ? C_WHITE : C_RED) < 0) break;
        }
        g.shot();
      }
      if (g.tick(1, 38)) {
        const c = g.n(1.2);
        for (let k = 0; k < c; k++) {
          let i = g.spawn(-6, 40 + g.rnd() * 300, 0.25 + (g.rnd() - 0.5) * 0.5, g.v(1.5), T_RICE, C_RED);
          if (i >= 0) g.bghost[i] = 16;
          i = g.spawn(W + 6, 40 + g.rnd() * 300, PI - 0.25 + (g.rnd() - 0.5) * 0.5, g.v(1.5), T_RICE, C_WHITE);
          if (i >= 0) g.bghost[i] = 16;
        }
      }
    },
  },
  // 段丘の壁（一定リズムで迫る）＋ 自機狙い ＋ 落ちる粒
  s2p2: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 90, 60);
      g.fv[0] = W / 2;
    },
    update(g, t, L) {
      const s = Math.sin((g.phaseT * TAU) / 90);
      g.stepF = s > 0 ? s * s * s * 2.2 : 0;
      if (g.fw(0, 150)) {
        const gap = Math.max(58, 92 - 8 * L);
        g.fv[0] += (g.rnd() - 0.5) * 180;
        const lo = gap / 2 + 12;
        if (g.fv[0] < lo) g.fv[0] = lo;
        if (g.fv[0] > W - lo) g.fv[0] = W - lo;
        const gx = g.fv[0];
        for (let x = 6; x <= W - 6; x += 14) {
          if (Math.abs(x - gx) < gap / 2) continue;
          const i = g.spawn(x, -20, PI / 2, g.v(1.7), T_SMALL, C_YELLOW);
          if (i < 0) break;
          g.bbeh[i] = B_STEP;
        }
      }
      if (t > 20 && g.tick(1, 44)) {
        aimedFan(g, g.bossX, g.bossY, g.n(2.5), 0.22, g.v(1.3), T_MED, C_BLUE);
        g.shot();
      }
      if (g.tick(2, 40)) {
        const c = g.n(1.8);
        for (let k = 0; k < c; k++) {
          g.spawn(g.bossX, g.bossY, PI / 2 + (g.rnd() - 0.5) * 1.6, g.v(0.9 + g.rnd() * 0.6), T_SMALL, C_GREEN);
        }
      }
    },
  },
  // 等高線のような波打つ環 ＋ 自機狙い苦無
  s2p3: {
    update(g, t) {
      if (g.tick(0, 30)) {
        const n = g.n(30);
        const p1 = g.rnd() * TAU;
        const p2 = g.rnd() * TAU;
        const a0 = g.rnd() * TAU;
        const col = g.cnt[0]++ & 1 ? C_GREEN : C_CYAN;
        for (let k = 0; k < n; k++) {
          const th = a0 + (k * TAU) / n;
          const m = 1 + 0.28 * Math.sin(3 * th + p1) + 0.18 * Math.sin(5 * th + p2);
          if (g.spawn(g.bossX, g.bossY, th, g.v(1.35) * m, T_SMALL, col) < 0) break;
        }
        g.shot();
      }
      if (t > 40 && g.tick(1, 75)) {
        aimedFan(g, g.bossX, g.bossY, g.n(2.2), 0.1, g.v(2.6), T_KUNAI, C_WHITE);
      }
    },
  },
  // 窓の外の五秒：滞空する弾 → 時間停止 → 一斉に自機へ
  s2p4: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 140, 60);
    },
    update(g, t) {
      const cyc = Math.max(190, Math.round(440 / g.R));
      const c = t % cyc;
      const parkEnd = Math.round(cyc * 0.45);
      const stopAt = Math.round(cyc * 0.49);
      const releaseAt = Math.round(cyc * 0.94);
      if (c < parkEnd && g.tick(0, 7)) {
        const m = g.n(3.4);
        for (let k = 0; k < m; k++) {
          const big = g.rnd() < 0.5;
          const i = g.spawn(g.bossX, g.bossY, g.rnd() * TAU, g.v(1.2 + g.rnd() * 1.8), big ? T_MED : T_SMALL, big ? C_BLUE : C_CYAN);
          if (i < 0) break;
          g.bacc[i] = -0.02;
          g.bmin[i] = 0;
          g.bflg[i] |= FL_STOP;
        }
        g.shot();
      }
      if (c === stopAt) {
        g.startTimeStop(releaseAt - stopAt);
        g.popText(W / 2, 250, POP_WINDOW);
      }
      if (c === releaseAt) {
        const jitter = 0.05 + 0.04 * g.dn;
        for (let i = 0; i < g.bn; i++) {
          if (!(g.bflg[i] & FL_STOP)) continue;
          g.ba[i] = g.aim(g.bx[i], g.by[i]) + (g.rnd() - 0.5) * jitter;
          g.bs[i] = 0;
          g.bacc[i] = 0.018 + g.rnd() * 0.02;
          g.bmax[i] = g.v(1.8 + g.rnd() * 1.0);
          g.bmin[i] = 0;
          g.bflg[i] &= ~FL_STOP;
        }
      }
    },
  },

  // ═══ STAGE 3 寺地星 ═════════════════════════════════════
  // コメント弾幕（文字の塊が飛んでくる）
  s3p1: {
    update(g, t) {
      if (g.fw(0, 150)) {
        let lane = Math.floor(g.rnd() * 11);
        if (lane === g.cnt[1]) lane = (lane + 4) % 11;
        g.cnt[1] = lane;
        const y = 44 + lane * 46 + (g.rnd() - 0.5) * 10;
        const spd = g.v(1.5 + g.rnd() * 1.2);
        const kind = g.rnd();
        let x = W + 14;
        if (kind < 0.6) {
          const reps = 1 + Math.floor(g.rnd() * 2);
          for (let r = 0; r < reps; r++) x += glyphBullets(g, GLYPH_W, x, y, 6, spd, C_GREEN) + 8;
        } else if (kind < 0.85) {
          glyphBullets(g, GLYPH_KUSA, x, y, 6, spd, C_GREEN);
        } else {
          glyphBullets(g, GLYPH_CROSS, x, y, 6, spd, C_WHITE);
        }
      }
      if (t > 20 && g.fw(1, 160)) {
        const per = g.n(5.5);
        const rot = (g.rnd() - 0.5) * 0.6;
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        const k = g.v(1.2);
        for (let side = 0; side < 4; side++) {
          for (let j = 0; j < per; j++) {
            const u = -1 + (2 * j) / (per - 1 || 1);
            let px: number;
            let py: number;
            if (side === 0) { px = u; py = -1.35; }
            else if (side === 1) { px = 1; py = u * 1.35; }
            else if (side === 2) { px = -u; py = 1.35; }
            else { px = -1; py = -u * 1.35; }
            const rx = px * cr - py * sr;
            const ry = px * sr + py * cr;
            if (g.spawn(g.bossX, g.bossY, Math.atan2(ry, rx), Math.sqrt(rx * rx + ry * ry) * k, T_SMALL, C_WHITE) < 0) break;
          }
        }
        g.shot();
      }
    },
  },
  // 重力井戸（光速に近づくほど重くなる）
  s3p2: {
    init(g) {
      g.wellOn = true;
      g.wellG = 260 * g.sp;
    },
    update(g, t) {
      g.wellX = W / 2 + Math.cos(g.phaseT * 0.008) * 120;
      g.wellY = 320 + Math.sin(g.phaseT * 0.011) * 70;
      g.wellG = 260 * g.sp;
      if (g.tick(0, 40)) {
        const n = g.n(16);
        const a0 = g.rnd() * TAU;
        const s = g.v(2.1);
        for (let k = 0; k < n; k++) {
          const a = a0 + (k * TAU) / n;
          const i = g.spawn(g.bossX, g.bossY, a, s, T_SMALL, C_YELLOW);
          if (i < 0) break;
          g.bbeh[i] = B_GRAVITY;
          g.b0[i] = Math.cos(a) * s;
          g.b1[i] = Math.sin(a) * s;
          g.bmax[i] = g.v(3.6);
          g.blife[i] = 560;
        }
        g.shot();
      }
      if (t > 40 && g.tick(1, 90)) {
        aimedFan(g, g.bossX, g.bossY, g.n(1.6), 0.14, g.v(2.4), T_KUNAI, C_WHITE);
      }
    },
  },
  // 三つ星（三連エミッタ）
  s3p3: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 150, 60);
      g.emitN = 3;
      g.emitLink = true;
      g.tmr[0] = 0.999;
      g.tmr[1] = 0.66;
      g.tmr[2] = 0.33;
    },
    update(g, _t) {
      const tilt = -0.35 + Math.sin(g.phaseT * 0.006) * 0.2;
      const ct = Math.cos(tilt);
      const st = Math.sin(tilt);
      for (let k = 0; k < 3; k++) {
        const off = (k - 1) * 72;
        g.emitX[k] = g.bossX + off * ct;
        g.emitY[k] = g.bossY + off * st;
      }
      const cols = [C_BLUE, C_CYAN, C_WHITE];
      for (let k = 0; k < 3; k++) {
        if (!g.tick(k, 90)) continue;
        const n = g.n(22);
        const rot = g.rnd() * TAU;
        for (let j = 0; j < n; j++) {
          const th = rot + (j * TAU) / n;
          const c = Math.abs(Math.cos(2.5 * (th - rot)));
          const m = 0.62 + 0.38 * c * c * c;
          if (g.spawn(g.emitX[k], g.emitY[k], th, g.v(1.5) * m, T_STAR, cols[k]) < 0) break;
        }
        g.shot();
      }
      if (g.tick(3, 60)) {
        const c = g.n(2.6);
        for (let k = 0; k < c; k++) {
          const i = g.spawn(10 + g.rnd() * (W - 20), -6, PI / 2, g.v(0.8 + g.rnd() * 0.8), T_SMALL, C_WHITE);
          if (i >= 0) g.bghost[i] = 20;
        }
      }
    },
  },

  // ═══ STAGE 4 櫻優 ═══════════════════════════════════════
  // ハート（反射する対の弾）
  s4p1: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 120, 60);
    },
    update(g, t) {
      if (t % 160 === 0) g.moveBoss(W / 2 + (g.rnd() - 0.5) * 80, 100 + g.rnd() * 40, 120);
      if (g.tick(0, 28)) {
        const m = g.n(6.5);
        const base = g.aim(g.bossX, g.bossY);
        const spread = 1.1;
        for (let k = 0; k < m; k++) {
          const a = base + (m > 1 ? (k / (m - 1) - 0.5) * spread : 0) + (g.rnd() - 0.5) * 0.08;
          const mir = PI - a;
          const d = Math.abs(Math.atan2(Math.sin(a - mir), Math.cos(a - mir)));
          const s = g.v(1.8);
          const i1 = g.spawn(g.bossX, g.bossY, a, s, T_HEART, C_PINK);
          if (i1 < 0) break;
          g.bacc[i1] = -0.004;
          g.bmin[i1] = g.v(1.3);
          if (d < 0.1) continue;
          const i2 = g.spawn(g.bossX, g.bossY, mir, s, T_HEART, C_PINK);
          if (i2 < 0) break;
          g.bacc[i2] = -0.004;
          g.bmin[i2] = g.v(1.3);
          g.bflg[i1] |= FL_SUPER;
          g.bflg[i2] |= FL_SUPER;
          if (g.rnd() < 0.5) g.blife[i1] = 80;
          else g.blife[i2] = 80;
        }
        g.shot();
      }
      if (t > 30 && g.tick(1, 100)) {
        ring(g, g.bossX, g.bossY, g.n(18), g.rnd() * TAU, g.v(1.2), T_SMALL, C_VIOLET);
      }
    },
  },
  // 不理解の引力（ホーミング）
  s4p2: {
    update(g, _t) {
      if (g.tick(0, 40)) {
        const n = g.n(8);
        const a0 = g.rnd() * TAU;
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY, a0 + (k * TAU) / n, g.v(1.6), T_HEART, C_PINK);
          if (i < 0) break;
          g.bbeh[i] = B_HOMING;
          g.b0[i] = 0.011;
          g.b1[i] = 110;
        }
        g.shot();
      }
      if (g.tick(1, 12)) {
        g.fv[0] += 0.21;
        const arms = g.n(3);
        for (let k = 0; k < arms; k++) {
          g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / arms, g.v(1.8), T_SMALL, C_VIOLET);
        }
      }
    },
  },
  // 波動関数の崩壊（波打つ二本の流れ → 収束）
  s4p3: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 100, 60);
      g.emitN = 2;
      g.emitLink = false;
    },
    update(g, t) {
      g.emitX[0] = W * 0.18 + Math.sin(g.phaseT * 0.01) * 30;
      g.emitY[0] = 70;
      g.emitX[1] = W * 0.82 - Math.sin(g.phaseT * 0.01) * 30;
      g.emitY[1] = 70;
      if (g.tick(0, 9)) {
        const streams = g.n(1.6);
        for (let e = 0; e < 2; e++) {
          for (let s = 0; s < streams; s++) {
            const a = PI / 2 + (e ? -1 : 1) * 0.35 * Math.sin(g.phaseT * 0.012 + s * 1.3);
            const i = g.spawn(g.emitX[e], g.emitY[e], a, g.v(1.6), T_SMALL, e ? C_PINK : C_CYAN);
            if (i < 0) break;
            g.bbeh[i] = B_SINE;
            g.b0[i] = g.emitX[e];
            g.b1[i] = g.emitY[e];
            g.b2[i] = e ? 36 : -36;
            g.b3[i] = 0.07;
          }
        }
      }
      if (t % 300 === 250) {
        for (let i = 0; i < g.bn; i++) {
          if (g.bbeh[i] !== B_SINE) continue;
          g.bbeh[i] = B_LINEAR;
          g.bs[i] = g.v(2.0);
        }
        g.popText(W / 2, 220, POP_KANSOKU);
        g.flashScreen(0.35);
      }
      if (t > 30 && g.tick(1, 80)) {
        ring(g, g.bossX, g.bossY, g.n(10), g.aim(g.bossX, g.bossY), g.v(1.4), T_SMALL, C_WHITE);
        g.shot();
      }
    },
  },

  // ═══ STAGE 5 倉石暁 ═════════════════════════════════════
  // 入門ガイド：✝の点群が編隊で飛ぶ
  s5p1: {
    update(g, _t) {
      if (g.tick(0, 72)) {
        const count = g.n(2.6);
        const base = g.aim(g.bossX, g.bossY);
        for (let c = 0; c < count; c++) {
          const dir = base + (c * TAU) / count;
          const rot = dir - PI / 2;
          const cr = Math.cos(rot);
          const sr = Math.sin(rot);
          const bvx = Math.cos(dir) * g.v(1.3);
          const bvy = Math.sin(dir) * g.v(1.3);
          const ex = g.v(0.16);
          for (let p = 0; p < CROSS_PTS.length; p += 2) {
            const ux = CROSS_PTS[p];
            const uy = CROSS_PTS[p + 1];
            const rx = ux * cr - uy * sr;
            const ry = ux * sr + uy * cr;
            const vx = bvx + rx * ex;
            const vy = bvy + ry * ex;
            const center = ux === 0 && uy === 0;
            if (g.spawn(g.bossX + rx * 4, g.bossY + ry * 4, Math.atan2(vy, vx), Math.sqrt(vx * vx + vy * vy), center ? T_MED : T_SMALL, C_RED) < 0) break;
          }
        }
        g.shot();
      }
      if (g.tick(1, 12)) {
        const arms = g.n(2.6);
        g.fv[0] += 0.19;
        for (let k = 0; k < arms; k++) g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / arms, g.v(1.5), T_CROSS, C_WHITE);
      }
    },
  },
  // グレートチェーン（五段階の階層リング）
  s5p2: {
    update(g, t) {
      if (g.tick(0, 190)) {
        const cx = g.bossX;
        const cy = g.bossY;
        const door = g.aim(cx, cy);
        for (let j = 0; j < 5; j++) {
          const n = g.n(8 + 2 * j);
          const r0 = 12 + j * 16;
          const av = (j & 1 ? 1 : -1) * (0.0015 + 0.0006 * j) * g.sp;
          for (let k = 2; k <= n - 2; k++) {
            const th = door + (k * TAU) / n;
            const i = g.spawn(cx + Math.cos(th) * r0, cy + Math.sin(th) * r0, th, g.v(1.7), j === 0 ? T_MED : T_SMALL, CHAIN_COLS[j]);
            if (i < 0) break;
            g.bbeh[i] = B_POLAR;
            g.b0[i] = cx;
            g.b1[i] = cy;
            g.b2[i] = r0;
            g.b3[i] = th;
            g.bav[i] = av;
          }
        }
        g.shot();
      }
      if (t > 40 && g.tick(1, 60)) {
        aimedFan(g, g.bossX, g.bossY, g.n(1.6), 0.15, g.v(2.5), T_SMALL, C_WHITE);
      }
    },
  },
  // 前-原✝本質✝（巨大弾が四散する）
  s5p3: {
    update(g, _t) {
      if (g.tick(0, 100)) {
        const c = g.n(7);
        const base = g.aim(g.bossX, g.bossY);
        for (let k = 0; k < c; k++) {
          const i = g.spawn(g.bossX, g.bossY, base + (k * TAU) / c, g.v(2.4), T_LARGE, C_VIOLET);
          if (i < 0) break;
          g.bacc[i] = -0.03;
          g.bmin[i] = g.v(0.5);
          g.bbeh[i] = B_SPLIT;
          g.b0[i] = 48;
          g.b1[i] = 5;
          g.b2[i] = 1;
          g.b3[i] = g.v(1.9);
        }
        g.shot();
      }
    },
  },

  // ═══ STAGE 6 ✝本質✝ ═════════════════════════════════════
  // 「は？」（二重の環：外へ加速する環と内へ縮む環）
  s6p1: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 170, 60);
      g.tmr[1] = 0.5;
    },
    update(g, t) {
      if (g.tick(0, 72)) {
        const n = g.n(15);
        g.fv[0] += 0.3;
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / n, g.v(2.8), T_MED, C_RED);
          if (i < 0) break;
          g.bacc[i] = -0.06 * g.sp;
          g.bmin[i] = -g.v(1.7);
        }
        g.shot();
      }
      if (g.tick(1, 64)) {
        const n = g.n(14);
        const dir = g.cnt[0]++ & 1 ? 1 : -1;
        const a0 = g.rnd() * TAU;
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY, a0 + (k * TAU) / n, g.v(1.3), T_SMALL, C_WHITE);
          if (i < 0) break;
          g.bav[i] = dir * 0.004;
        }
      }
      if (t % 150 === 75) g.popText(g.bossX + (g.rnd() - 0.5) * 140, g.bossY + 50, POP_HA);
    },
  },
  // 「見てない」（左右から消える米弾）
  s6p2: {
    update(g, t) {
      if (g.tick(0, 12)) {
        const c = g.n(2.4);
        for (let k = 0; k < c; k++) {
          const left = g.rnd() < 0.5;
          const i = g.spawn(left ? -8 : W + 8, 60 + g.rnd() * 540, left ? 0 : PI, g.v(1.4 + g.rnd() * 1.4), T_RICE, g.rnd() < 0.5 ? C_GREEN : C_ORANGE);
          if (i < 0) break;
          g.bflg[i] |= FL_FADE;
          g.bghost[i] = 18;
        }
      }
      if (g.tick(1, 50)) {
        ring(g, g.bossX, g.bossY, g.n(14), g.aim(g.bossX, g.bossY) + PI / 12, g.v(1.5), T_MED, C_BLUE);
        g.shot();
      }
      if (t % 200 === 100) g.popText(40 + g.rnd() * (W - 80), 90 + g.rnd() * 60, POP_MITENAI);
    },
  },
  // 「面白い」（バラ曲線の多点放射）
  s6p3: {
    update(g, t) {
      if (g.tick(0, 44)) {
        const K = ROSE_K[g.cnt[0]++ % ROSE_K.length];
        const n = g.n(34);
        g.fv[0] += 0.37;
        const rot = g.fv[0];
        for (let j = 0; j < n; j++) {
          const th = rot + (j * TAU) / n;
          const m = 0.5 + 0.5 * Math.abs(Math.cos(K * (th - rot)));
          const ang = ((th % TAU) + TAU) % TAU;
          const col = RAINBOW[Math.min(5, Math.floor((ang / TAU) * 6))];
          if (g.spawn(g.bossX, g.bossY, th, g.v(1.35) * (0.45 + 0.55 * m), T_SMALL, col) < 0) break;
        }
        g.shot();
      }
      if (t > 30 && g.tick(1, 90)) {
        aimedFan(g, g.bossX, g.bossY, g.n(3.2), 0.1, g.v(2.4), T_KUNAI, C_WHITE);
      }
      if (t % 240 === 120) g.popText(g.bossX, g.bossY - 56, POP_OMOSHIROI);
    },
  },
  // 「来年もある」（花びら＋対の米弾＋時折の大弾）
  s6p4: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 130, 60);
      g.petals = true;
    },
    update(g, t) {
      if (g.tick(0, 9)) {
        const arms = g.n(3.4);
        g.fv[0] += 0.11 * Math.sin(g.phaseT * 0.004) + 0.06;
        for (let k = 0; k < arms; k++) {
          if (g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / arms, g.v(1.7), T_PETAL, C_PINK) < 0) break;
        }
        const w = Math.max(1, arms - 1);
        for (let k = 0; k < w; k++) {
          if (g.spawn(g.bossX, g.bossY, -g.fv[0] + (k * TAU) / w, g.v(1.4), T_RICE, C_WHITE) < 0) break;
        }
      }
      if (g.tick(1, 70)) {
        ring(g, g.bossX, g.bossY, g.n(13), g.rnd() * TAU, g.v(1.3), T_CROSS, C_YELLOW);
        g.shot();
      }
      if (t > 600 && g.tick(2, 150)) {
        g.spawn(g.bossX, g.bossY, g.aim(g.bossX, g.bossY), g.v(1.6), T_LARGE, C_RED);
      }
    },
  },
};

/** タイトル画面の自動デモ（当たり判定なし） */
export function attractPattern(g: Engine, t: number): void {
  const cx = W / 2;
  const cy = 250;
  if (t % 30 === 0) {
    const K = ROSE_K[(t / 30) % ROSE_K.length | 0];
    const n = 48;
    const rot = t * 0.013;
    for (let j = 0; j < n; j++) {
      const th = rot + (j * TAU) / n;
      const m = 0.5 + 0.5 * Math.abs(Math.cos(K * (th - rot)));
      const ang = ((th % TAU) + TAU) % TAU;
      if (g.spawn(cx, cy, th, 1.05 * (0.45 + 0.55 * m), T_SMALL, RAINBOW[Math.min(5, Math.floor((ang / TAU) * 6))]) < 0) break;
    }
  }
  if (t % 6 === 0) {
    for (let k = 0; k < 3; k++) g.spawn(cx, cy, t * 0.021 + (k * TAU) / 3, 1.3, T_CROSS, C_WHITE);
  }
  if (t % 90 === 45) {
    for (let k = 0; k < 12; k++) {
      const i = g.spawn(cx, cy, (k * TAU) / 12 + t * 0.01, 1.6, T_PETAL, C_PINK);
      if (i >= 0) g.bav[i] = 0.004;
    }
  }
}
