// ─────────────────────────────────────────────────────────────
//  弾幕パターン — 全パラメタは難度係数 L（と派生 sp / dn / R）の関数
//  各パターンは「決定論的乱数」で駆動：同じ難度なら毎回同じ＝学習可能
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
      if (row.charCodeAt(c) !== 35) continue; // '#'
      const i = g.spawn(x0 + c * cell, yc + (r - (h - 1) / 2) * cell, PI, speed, T_SMALL, col);
      if (i < 0) return w * cell;
      g.bflg[i] |= FL_NOCULL;
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
  s1p1: {
    update(g, t, L) {
      if (g.tick(0, 34)) {
        const n = Math.round(10 + 8 * g.dn);
        const odd = g.cnt[0]++ & 1;
        const a0 = g.rnd() * TAU;
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY, a0 + (k * TAU) / n, 1.55 * g.sp, T_MED, odd ? C_ORANGE : C_YELLOW);
          if (i < 0) break;
          g.bacc[i] = -0.008;
          g.bmin[i] = 1.0 * g.sp;
          g.bav[i] = odd ? 0.0035 : -0.0035;
        }
        g.shot();
      }
      if (t > 60 && g.tick(1, 90)) {
        aimedFan(g, g.bossX, g.bossY, 1 + 2 * Math.floor(L), 0.16, 2.4 * g.sp, T_SMALL, C_WHITE);
      }
    },
  },
  s1p2: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 100, 60);
    },
    update(g, t, L) {
      if (t % 120 === 0) g.moveBoss(W / 2 + (g.rnd() - 0.5) * 160, 88 + g.rnd() * 30, 110);
      if (g.tick(0, 64)) {
        const gap = Math.max(52, 88 - 8 * L);
        let gx = W / 2 + Math.sin(g.phaseT * 0.013) * 150 + (g.rnd() - 0.5) * 60;
        const lo = gap / 2 + 10;
        if (gx < lo) gx = lo;
        if (gx > W - lo) gx = W - lo;
        for (let x = 6; x <= W - 6; x += 14) {
          if (Math.abs(x - gx) < gap / 2) continue;
          const u = (x - W / 2) / (W / 2);
          if (g.spawn(x, -46 + 32 * (1 - u * u), PI / 2, 1.25 * g.sp, T_SMALL, C_CYAN) < 0) break;
        }
      }
      if (t > 30 && g.tick(1, 110)) {
        aimedFan(g, g.bossX, g.bossY, 3 + 2 * Math.floor(L), 0.12, 2.2 * g.sp, T_KUNAI, C_RED);
        g.shot();
      }
    },
  },
  s1p3: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 130, 60);
    },
    update(g, _t, L) {
      if (g.tick(0, 7)) {
        const arms = 2 + Math.floor(L * 0.8);
        g.fv[0] += 0.16;
        for (let k = 0; k < arms; k++) {
          if (g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / arms, 1.8 * g.sp, T_CROSS, C_VIOLET) < 0) break;
        }
        g.shot();
      }
      if (g.tick(1, 26)) {
        const c = 1 + Math.floor(g.dn);
        for (let k = 0; k < c; k++) {
          const i = g.spawn(20 + g.rnd() * (W - 40), -8, PI / 2 + (g.rnd() - 0.5) * 0.3, (1 + g.rnd() * 0.9) * g.sp, T_CROSS, C_YELLOW);
          if (i >= 0) g.bghost[i] = 24;
        }
      }
    },
  },

  // ═══ STAGE 2 塀勝也 ═════════════════════════════════════
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
      if (g.tick(0, 50)) {
        const n = Math.round(12 + 6 * g.dn) & ~1;
        const a0 = g.aim(g.bossX, g.bossY);
        for (let k = 0; k < n; k++) {
          if (g.spawn(g.bossX, g.bossY, a0 + (k * TAU) / n, 1.5 * g.sp, T_MED, k & 1 ? C_WHITE : C_RED) < 0) break;
        }
        g.shot();
      }
      if (g.tick(1, 16)) {
        const c = g.dn > 1.2 ? 2 : 1;
        for (let k = 0; k < c; k++) {
          let i = g.spawn(-6, 40 + g.rnd() * 300, 0.25 + (g.rnd() - 0.5) * 0.5, 1.5 * g.sp, T_RICE, C_RED);
          if (i >= 0) g.bghost[i] = 16;
          i = g.spawn(W + 6, 40 + g.rnd() * 300, PI - 0.25 + (g.rnd() - 0.5) * 0.5, 1.5 * g.sp, T_RICE, C_WHITE);
          if (i >= 0) g.bghost[i] = 16;
        }
      }
    },
  },
  s2p2: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 90, 60);
      g.fv[0] = W / 2;
    },
    update(g, t, L) {
      const s = Math.sin((g.phaseT * TAU) / 90);
      g.stepF = s > 0 ? s * s * s * 2.2 : 0;
      if (t % 90 === 0) {
        const gap = Math.max(60, 96 - 9 * L);
        g.fv[0] += (g.rnd() - 0.5) * 180;
        const lo = gap / 2 + 12;
        if (g.fv[0] < lo) g.fv[0] = lo;
        if (g.fv[0] > W - lo) g.fv[0] = W - lo;
        const gx = g.fv[0];
        for (let x = 6; x <= W - 6; x += 13) {
          if (Math.abs(x - gx) < gap / 2) continue;
          const i = g.spawn(x, -20, PI / 2, 1.6 * g.sp, T_SMALL, C_YELLOW);
          if (i < 0) break;
          g.bbeh[i] = B_STEP;
        }
      }
      if (t > 20 && g.tick(1, 44)) {
        aimedFan(g, g.bossX, g.bossY, 1 + Math.floor(L), 0.22, 1.3 * g.sp, T_MED, C_BLUE);
        g.shot();
      }
      if (L >= 1 && g.tick(2, 30)) {
        g.spawn(g.bossX, g.bossY, PI / 2 + (g.rnd() - 0.5) * 1.6, (0.9 + g.rnd() * 0.6) * g.sp, T_SMALL, C_GREEN);
      }
    },
  },
  s2p3: {
    update(g, t, L) {
      if (g.tick(0, 26)) {
        const n = Math.round(18 + 10 * g.dn);
        const p1 = g.rnd() * TAU;
        const p2 = g.rnd() * TAU;
        const a0 = g.rnd() * TAU;
        const col = g.cnt[0]++ & 1 ? C_GREEN : C_CYAN;
        for (let k = 0; k < n; k++) {
          const th = a0 + (k * TAU) / n;
          const m = 1 + 0.28 * Math.sin(3 * th + p1) + 0.18 * Math.sin(5 * th + p2);
          if (g.spawn(g.bossX, g.bossY, th, 1.35 * g.sp * m, T_SMALL, col) < 0) break;
        }
        g.shot();
      }
      if (t > 40 && g.tick(1, 75)) {
        aimedFan(g, g.bossX, g.bossY, 2 + Math.floor(L), 0.1, 2.6 * g.sp, T_KUNAI, C_WHITE);
      }
    },
  },
  s2p4: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 140, 60);
    },
    update(g, t, L) {
      const c = t % 440;
      if (c < 200 && g.tick(0, 4)) {
        const m = 2 + Math.floor(L * 0.6);
        for (let k = 0; k < m; k++) {
          const big = g.rnd() < 0.5;
          const i = g.spawn(g.bossX, g.bossY, g.rnd() * TAU, (1.2 + g.rnd() * 1.8) * g.sp, big ? T_MED : T_SMALL, big ? C_BLUE : C_CYAN);
          if (i < 0) break;
          g.bacc[i] = -0.02;
          g.bmin[i] = 0;
          g.bflg[i] |= FL_STOP;
        }
        g.shot();
      }
      if (c === 215) {
        g.startTimeStop(200);
        g.popText(W / 2, 250, POP_WINDOW);
      }
      if (c === 415) {
        const jitter = 0.05 + 0.08 * L;
        for (let i = 0; i < g.bn; i++) {
          if (!(g.bflg[i] & FL_STOP)) continue;
          g.ba[i] = g.aim(g.bx[i], g.by[i]) + (g.rnd() - 0.5) * jitter;
          g.bs[i] = 0;
          g.bacc[i] = (0.018 + g.rnd() * 0.02) * g.sp;
          g.bmax[i] = (1.8 + g.rnd() * 1.0) * g.sp;
          g.bmin[i] = 0;
          g.bflg[i] &= ~FL_STOP;
        }
      }
    },
  },

  // ═══ STAGE 3 寺地星 ═════════════════════════════════════
  s3p1: {
    update(g, t) {
      if (g.tick(0, 40)) {
        let lane = Math.floor(g.rnd() * 11);
        if (lane === g.cnt[1]) lane = (lane + 4) % 11;
        g.cnt[1] = lane;
        const y = 44 + lane * 46 + (g.rnd() - 0.5) * 10;
        const spd = (1.5 + g.rnd() * 1.2) * g.sp;
        const kind = g.rnd();
        let x = W + 14;
        if (kind < 0.6) {
          const reps = 2 + Math.floor(g.rnd() * 3);
          for (let r = 0; r < reps; r++) x += glyphBullets(g, GLYPH_W, x, y, 6, spd, C_GREEN) + 8;
        } else if (kind < 0.85) {
          glyphBullets(g, GLYPH_KUSA, x, y, 6, spd, C_GREEN);
        } else {
          glyphBullets(g, GLYPH_CROSS, x, y, 6, spd, C_WHITE);
        }
      }
      if (t > 20 && g.tick(1, 110)) {
        const per = 5 + Math.round(2 * g.dn);
        const rot = (g.rnd() - 0.5) * 0.6;
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        const k = 1.2 * g.sp;
        for (let side = 0; side < 4; side++) {
          for (let j = 0; j < per; j++) {
            const u = -1 + (2 * j) / per;
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
  s3p2: {
    init(g) {
      g.wellOn = true;
      g.wellG = 260 * g.sp;
    },
    update(g, t, L) {
      g.wellX = W / 2 + Math.cos(g.phaseT * 0.008) * 120;
      g.wellY = 320 + Math.sin(g.phaseT * 0.011) * 70;
      g.wellG = 260 * g.sp;
      if (g.tick(0, 30)) {
        const n = Math.round(10 + 8 * g.dn);
        const a0 = g.rnd() * TAU;
        const s = 2.1 * g.sp;
        for (let k = 0; k < n; k++) {
          const a = a0 + (k * TAU) / n;
          const i = g.spawn(g.bossX, g.bossY, a, s, T_SMALL, C_YELLOW);
          if (i < 0) break;
          g.bbeh[i] = B_GRAVITY;
          g.b0[i] = Math.cos(a) * s;
          g.b1[i] = Math.sin(a) * s;
          g.bmax[i] = 3.6 * g.sp;
          g.blife[i] = 560;
        }
        g.shot();
      }
      if (t > 40 && g.tick(1, 90)) {
        aimedFan(g, g.bossX, g.bossY, 1 + Math.floor(L), 0.14, 2.4 * g.sp, T_KUNAI, C_WHITE);
      }
    },
  },
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
    update(g, _t, L) {
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
        if (!g.tick(k, 60)) continue;
        const n = Math.round(20 + 10 * g.dn);
        const rot = g.rnd() * TAU;
        for (let j = 0; j < n; j++) {
          const th = rot + (j * TAU) / n;
          const c = Math.abs(Math.cos(2.5 * (th - rot)));
          const m = 0.62 + 0.38 * c * c * c;
          if (g.spawn(g.emitX[k], g.emitY[k], th, 1.5 * g.sp * m, T_STAR, cols[k]) < 0) break;
        }
        g.shot();
      }
      if (L >= 1 && g.tick(3, 20)) {
        const c = Math.floor(g.dn);
        for (let k = 0; k < c; k++) {
          const i = g.spawn(10 + g.rnd() * (W - 20), -6, PI / 2, (0.8 + g.rnd() * 0.8) * g.sp, T_SMALL, C_WHITE);
          if (i >= 0) g.bghost[i] = 20;
        }
      }
    },
  },

  // ═══ STAGE 4 櫻優 ═══════════════════════════════════════
  s4p1: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 120, 60);
    },
    update(g, t) {
      if (t % 160 === 0) g.moveBoss(W / 2 + (g.rnd() - 0.5) * 80, 100 + g.rnd() * 40, 120);
      if (g.tick(0, 30)) {
        const m = Math.round(4 + 3 * g.dn);
        const base = g.aim(g.bossX, g.bossY);
        const spread = 1.1;
        for (let k = 0; k < m; k++) {
          const a = base + (m > 1 ? (k / (m - 1) - 0.5) * spread : 0) + (g.rnd() - 0.5) * 0.08;
          const mir = PI - a;
          const d = Math.abs(Math.atan2(Math.sin(a - mir), Math.cos(a - mir)));
          const s = 1.8 * g.sp;
          const i1 = g.spawn(g.bossX, g.bossY, a, s, T_HEART, C_PINK);
          if (i1 < 0) break;
          g.bacc[i1] = -0.004;
          g.bmin[i1] = 1.3 * g.sp;
          if (d < 0.1) continue;
          const i2 = g.spawn(g.bossX, g.bossY, mir, s, T_HEART, C_PINK);
          if (i2 < 0) break;
          g.bacc[i2] = -0.004;
          g.bmin[i2] = 1.3 * g.sp;
          g.bflg[i1] |= FL_SUPER;
          g.bflg[i2] |= FL_SUPER;
          if (g.rnd() < 0.5) g.blife[i1] = 80;
          else g.blife[i2] = 80;
        }
        g.shot();
      }
      if (t > 30 && g.tick(1, 120)) {
        ring(g, g.bossX, g.bossY, Math.round(14 + 8 * g.dn), g.rnd() * TAU, 1.2 * g.sp, T_SMALL, C_VIOLET);
      }
    },
  },
  s4p2: {
    update(g, _t, L) {
      if (g.tick(0, 36)) {
        const n = Math.round(6 + 4 * g.dn);
        const a0 = g.rnd() * TAU;
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY, a0 + (k * TAU) / n, 1.6 * g.sp, T_HEART, C_PINK);
          if (i < 0) break;
          g.bbeh[i] = B_HOMING;
          g.b0[i] = 0.01 + 0.002 * L;
          g.b1[i] = 110;
        }
        g.shot();
      }
      if (g.tick(1, 12)) {
        g.fv[0] += 0.21;
        const arms = L >= 2 ? 4 : 2;
        for (let k = 0; k < arms; k++) {
          g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / arms, 1.8 * g.sp, T_SMALL, C_VIOLET);
        }
      }
    },
  },
  s4p3: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 100, 60);
      g.emitN = 2;
      g.emitLink = false;
    },
    update(g, t, L) {
      g.emitX[0] = W * 0.18 + Math.sin(g.phaseT * 0.01) * 30;
      g.emitY[0] = 70;
      g.emitX[1] = W * 0.82 - Math.sin(g.phaseT * 0.01) * 30;
      g.emitY[1] = 70;
      if (g.tick(0, 7)) {
        const streams = 1 + Math.floor(L / 1.3);
        for (let e = 0; e < 2; e++) {
          for (let s = 0; s < streams; s++) {
            const a = PI / 2 + (e ? -1 : 1) * 0.35 * Math.sin(g.phaseT * 0.012 + s * 1.3);
            const i = g.spawn(g.emitX[e], g.emitY[e], a, 1.6 * g.sp, T_SMALL, e ? C_PINK : C_CYAN);
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
          g.bs[i] = 2.0 * g.sp;
        }
        g.popText(W / 2, 220, POP_KANSOKU);
        g.flashScreen(0.35);
      }
      if (t > 30 && g.tick(1, 80)) {
        ring(g, g.bossX, g.bossY, Math.round(8 + 6 * g.dn), g.aim(g.bossX, g.bossY), 1.4 * g.sp, T_SMALL, C_WHITE);
        g.shot();
      }
    },
  },

  // ═══ STAGE 5 倉石暁 ═════════════════════════════════════
  s5p1: {
    update(g, _t, L) {
      if (g.tick(0, 70)) {
        const count = 1 + Math.floor(g.dn);
        const base = g.aim(g.bossX, g.bossY);
        for (let c = 0; c < count; c++) {
          const dir = base + (c * TAU) / count;
          const rot = dir - PI / 2;
          const cr = Math.cos(rot);
          const sr = Math.sin(rot);
          const bvx = Math.cos(dir) * 1.3 * g.sp;
          const bvy = Math.sin(dir) * 1.3 * g.sp;
          const ex = 0.16 * g.sp;
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
      if (g.tick(1, 9)) {
        const arms = 1 + Math.floor(L / 1.5);
        g.fv[0] += 0.19;
        for (let k = 0; k < arms; k++) g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / arms, 1.5 * g.sp, T_CROSS, C_WHITE);
      }
    },
  },
  s5p2: {
    update(g, t, L) {
      if (g.tick(0, 150)) {
        const cx = g.bossX;
        const cy = g.bossY;
        const door = g.aim(cx, cy);
        for (let j = 0; j < 5; j++) {
          const n = Math.round(16 + 3 * j + 8 * g.dn);
          const r0 = 12 + j * 16;
          const av = (j & 1 ? 1 : -1) * (0.0015 + 0.0006 * j) * g.sp;
          for (let k = 2; k <= n - 2; k++) {
            const th = door + (k * TAU) / n;
            const i = g.spawn(cx + Math.cos(th) * r0, cy + Math.sin(th) * r0, th, 0.95 * g.sp, j === 0 ? T_MED : T_SMALL, CHAIN_COLS[j]);
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
        aimedFan(g, g.bossX, g.bossY, 1 + Math.floor(L / 2), 0.15, 2.5 * g.sp, T_SMALL, C_WHITE);
      }
    },
  },
  s5p3: {
    update(g, _t, L) {
      if (g.tick(0, 100)) {
        const c = 3 + Math.floor(L);
        const base = g.aim(g.bossX, g.bossY);
        const gen = L >= 3 ? 2 : 1;
        for (let k = 0; k < c; k++) {
          const i = g.spawn(g.bossX, g.bossY, base + (k * TAU) / c, 2.4 * g.sp, T_LARGE, C_VIOLET);
          if (i < 0) break;
          g.bacc[i] = -0.03;
          g.bmin[i] = 0.5 * g.sp;
          g.bbeh[i] = B_SPLIT;
          g.b0[i] = 48;
          g.b1[i] = 5;
          g.b2[i] = gen;
          g.b3[i] = 1.6 * g.sp;
        }
        g.shot();
      }
    },
  },

  // ═══ STAGE 6 ✝本質✝ ═════════════════════════════════════
  s6p1: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 170, 60);
      g.tmr[1] = 0.5;
    },
    update(g, t) {
      if (g.tick(0, 44)) {
        const n = Math.round(14 + 10 * g.dn);
        g.fv[0] += 0.3;
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / n, 3.2 * g.sp, T_MED, C_RED);
          if (i < 0) break;
          g.bacc[i] = -0.06 * g.sp;
          g.bmin[i] = -1.7 * g.sp;
        }
        g.shot();
      }
      if (g.tick(1, 44)) {
        const n = Math.round(10 + 6 * g.dn);
        const dir = g.cnt[0]++ & 1 ? 1 : -1;
        const a0 = g.rnd() * TAU;
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY, a0 + (k * TAU) / n, 1.3 * g.sp, T_SMALL, C_WHITE);
          if (i < 0) break;
          g.bav[i] = dir * 0.004;
        }
      }
      if (t % 150 === 75) g.popText(g.bossX + (g.rnd() - 0.5) * 140, g.bossY + 50, POP_HA);
    },
  },
  s6p2: {
    update(g, t) {
      if (g.tick(0, 10)) {
        const c = g.dn > 1.25 ? 2 : 1;
        for (let k = 0; k < c; k++) {
          const left = g.rnd() < 0.5;
          const i = g.spawn(left ? -8 : W + 8, 60 + g.rnd() * 540, left ? 0 : PI, (1.4 + g.rnd() * 1.4) * g.sp, T_RICE, g.rnd() < 0.5 ? C_GREEN : C_ORANGE);
          if (i < 0) break;
          g.bflg[i] |= FL_FADE;
          g.bghost[i] = 18;
        }
      }
      if (g.tick(1, 55)) {
        ring(g, g.bossX, g.bossY, Math.round(10 + 6 * g.dn), g.aim(g.bossX, g.bossY) + PI / 12, 1.5 * g.sp, T_MED, C_BLUE);
        g.shot();
      }
      if (t % 200 === 100) g.popText(40 + g.rnd() * (W - 80), 90 + g.rnd() * 60, POP_MITENAI);
    },
  },
  s6p3: {
    update(g, t, L) {
      if (g.tick(0, 32)) {
        const K = ROSE_K[g.cnt[0]++ % ROSE_K.length];
        const n = Math.round(32 + 16 * g.dn);
        g.fv[0] += 0.37;
        const rot = g.fv[0];
        for (let j = 0; j < n; j++) {
          const th = rot + (j * TAU) / n;
          const m = 0.5 + 0.5 * Math.abs(Math.cos(K * (th - rot)));
          const ang = ((th % TAU) + TAU) % TAU;
          const col = RAINBOW[Math.min(5, Math.floor((ang / TAU) * 6))];
          if (g.spawn(g.bossX, g.bossY, th, 1.35 * g.sp * (0.45 + 0.55 * m), T_SMALL, col) < 0) break;
        }
        g.shot();
      }
      if (t > 30 && g.tick(1, 90)) {
        aimedFan(g, g.bossX, g.bossY, 3 + 2 * Math.floor(L / 2), 0.1, 2.4 * g.sp, T_KUNAI, C_WHITE);
      }
      if (t % 240 === 120) g.popText(g.bossX, g.bossY - 56, POP_OMOSHIROI);
    },
  },
  s6p4: {
    init(g) {
      g.wander = false;
      g.moveBoss(W / 2, 130, 60);
      g.petals = true;
    },
    update(g, t, L) {
      if (g.tick(0, 6)) {
        const arms = 2 + Math.floor(L * 0.7);
        g.fv[0] += 0.11 * Math.sin(g.phaseT * 0.004) + 0.06;
        for (let k = 0; k < arms; k++) {
          if (g.spawn(g.bossX, g.bossY, g.fv[0] + (k * TAU) / arms, 1.7 * g.sp, T_PETAL, C_PINK) < 0) break;
        }
        if (L >= 1.5) {
          const w = arms - 1;
          for (let k = 0; k < w; k++) {
            if (g.spawn(g.bossX, g.bossY, -g.fv[0] + (k * TAU) / w, 1.4 * g.sp, T_RICE, C_WHITE) < 0) break;
          }
        }
      }
      if (g.tick(1, 60)) {
        ring(g, g.bossX, g.bossY, Math.round(10 + 6 * g.dn), g.rnd() * TAU, 1.3 * g.sp, T_CROSS, C_YELLOW);
        g.shot();
      }
      if (t > 600 && g.tick(2, 120)) {
        g.spawn(g.bossX, g.bossY, g.aim(g.bossX, g.bossY), 1.6 * g.sp, T_LARGE, C_RED);
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

