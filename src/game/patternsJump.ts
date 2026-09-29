// ─────────────────────────────────────────────────────────────
//  無限ジャンプモードの弾幕 — 難度は「低空の自機がどれだけ避けにくいか」。
//  patterns.ts と同一規則（sp/dn/R/gap/track + cal）。
//
//  このモードだけの前提:
//   ・自機は左右移動＋ジャンプのみ。重力 0.26、跳躍の高さは最大 80px 程度
//   ・地面はない（画面下端で止まるだけ）。空中ジャンプ可
//   → 「低空を横切る弾を跳ぶ」「上から降る雨の隙間を走る」
//     「横から来る壁の切れ目を通る」が基本の避け方になる。
//     切れ目幅は g.gap()、狙いの厳しさは g.track() で L に比例させる。
// ─────────────────────────────────────────────────────────────
import type { Engine } from './engine';
import {
  W, H, TAU,
  T_SMALL, T_MED, T_RICE, T_KUNAI, T_CROSS, T_STAR, T_HEART,
  C_RED, C_ORANGE, C_CYAN, C_BLUE, C_VIOLET, C_PINK, C_WHITE,
  B_BOUNCE, B_GRAVITY, B_SINE, B_HOMING, B_POLAR,
  POP_TENSA, POP_OKAERI, POP_OMOSHIROI,
} from './data';

export interface PatternDef {
  init?: (g: Engine, L: number) => void;
  update: (g: Engine, t: number, L: number) => void;
}

const PI = Math.PI;
/** 画面下端の自機ライン（engine の J_BOT と同値） */
const FLOOR = H - 14;

/** 自機狙い n-way */
function fan(g: Engine, x: number, y: number, n: number, spread: number, speed: number, type: number, col: number): void {
  const base = g.aim(x, y);
  for (let k = 0; k < n; k++) {
    if (g.spawn(x, y, base + (k - (n - 1) / 2) * spread, speed, type, col) < 0) return;
  }
}

/** 円形弾（gapA 方向に gapW の切れ目を必ず残す） */
function ringGap(g: Engine, x: number, y: number, n: number, a0: number, gapA: number, gapW: number, speed: number, type: number, col: number): void {
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * TAU) / n;
    let d = a - gapA;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) < gapW) continue;
    if (g.spawn(x, y, a, speed, type, col) < 0) return;
  }
}

/** ✝ の形に5発（信徒の印） */
function crossMark(g: Engine, x: number, y: number, a: number, s: number, col: number): void {
  const r = 7;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const px = -sin;
  const py = cos;
  g.spawn(x, y, a, s, T_CROSS, col);
  g.spawn(x + px * r, y + py * r, a, s, T_CROSS, col);
  g.spawn(x - px * r, y - py * r, a, s, T_CROSS, col);
  g.spawn(x + cos * r * 0.6, y + sin * r * 0.6, a, s, T_CROSS, col);
  g.spawn(x + cos * r * 1.3, y + sin * r * 1.3, a, s, T_CROSS, col);
}

/** 横から画面外へ流れる弾 */
function sweep(g: Engine, fromLeft: boolean, y: number, s: number, type: number, col: number): number {
  return g.spawn(fromLeft ? -8 : W + 8, y, fromLeft ? 0 : PI, s, type, col);
}

export const PATTERNS_JUMP: Record<string, PatternDef> = {
  // ═══ STAGE 1 倉石暁、降臨 ═══════════════════════════════
  // 信徒「教祖に会えた」— ✝が上から降る。隙間列数が gapMul で減る
  j1p1: {
    init(g) { g.moveBoss(W / 2, 96, 60); },
    update(g, t) {
      if (g.fw(0, 76)) {
        // 列を増やし、スキップ幅を gap で狭める（1列→時々0.5相当）
        const cols = Math.max(7, Math.round(8 + 3 * g.dn));
        const gap = Math.floor(g.rnd() * cols);
        // 高難度では隣接1列の余裕が消える
        const pad = g.gp > 0.55 ? 1 : 0;
        for (let c = 0; c < cols; c++) {
          if (Math.abs(c - gap) <= pad) continue;
          const x = 26 + (c * (W - 52)) / (cols - 1);
          crossMark(g, x + (g.rnd() - 0.5) * 6, -12, PI / 2, g.v(1.0 + 0.4 * g.rnd()), C_VIOLET);
        }
        g.shot();
      }
      if (t > 40 && g.tick(1, 96)) {
        const n = g.n(3.0);
        for (let k = 0; k < n; k++) {
          // 低空薙ぎの高さを track で自機ラインに寄せる
          const h = 30 + 30 * g.gp;
          sweep(g, g.rnd() < 0.5, FLOOR - g.rnd() * h, g.v(1.1 + 0.3 * g.rnd()), T_SMALL, C_WHITE);
        }
        g.shot();
      }
    },
  },

  // ノート「表紙に✝」— 横罫線。スキップ行が gap で減る
  j1p2: {
    init(g) { g.moveBoss(W / 2, 104, 60); },
    update(g, _t) {
      if (g.fw(0, 52)) {
        const rows = Math.max(5, Math.round(5 + 2 * g.dn));
        const skip = Math.floor(g.rnd() * rows);
        const fromLeft = g.rnd() < 0.5;
        // 易しいほどスキップ行の隣も空けて逃げ道を広く。高難度では隣接も塞ぐ
        for (let r = 0; r < rows; r++) {
          if (r === skip) continue;
          if (Math.abs(r - skip) === 1 && g.rnd() < 0.55 * g.gp) continue;
          const y = 96 + (r * (FLOOR - 120)) / (rows - 1) + (g.rnd() - 0.5) * 10;
          sweep(g, fromLeft, y, g.v(1.05 + 0.3 * g.rnd()), T_RICE, C_CYAN);
        }
        g.shot();
      }
      if (g.tick(1, 66)) {
        const n = g.n(1.8);
        for (let k = 0; k < n; k++) {
          crossMark(g, 60 + g.rnd() * (W - 120), 40, PI / 2 + (g.rnd() - 0.5) * 0.3, g.v(0.85), C_VIOLET);
        }
      }
    },
  },

  // 教会「グレートチェーン」— 切れ目が gap で狭まる
  j1p3: {
    init(g) { g.moveBoss(W / 2, 104, 60); },
    update(g, t) {
      if (g.fw(0, 44)) {
        const cols = Math.max(5, Math.round(4 + 2.5 * g.dn));
        const gap = Math.floor(g.rnd() * cols);
        const links = Math.max(4, Math.round(4 + g.dn));
        for (let c = 0; c < cols; c++) {
          if (c === gap) continue;
          const x = 60 + (c * (W - 120)) / (cols - 1);
          for (let k = 0; k < links; k++) {
            const i = g.spawn(x, -14 - k * 30, PI / 2, g.v(0.9 + 0.06 * k), T_SMALL, [C_WHITE, C_VIOLET, C_PINK][k % 3]);
            if (i < 0) break;
          }
        }
        g.shot();
      }
      if (t > 120 && g.tick(1, 54)) {
        fan(g, g.bossX, g.bossY, g.n(3.2), 0.22 / g.track(), g.v(2.0), T_KUNAI, C_VIOLET);
        g.shot();
      }
    },
  },

  // ═══ STAGE 2 人妻の✝本質✝ ═══════════════════════════════
  // 指輪「封印の刻印」— 切れ目角が gap で狭まる
  j2p1: {
    init(g) { g.moveBoss(W / 2, 120, 60); g.fv[0] = 0; },
    update(g, t) {
      if (g.tick(0, 70)) {
        g.fv[0] += 0.08 + 0.05 * g.track();
        const n = g.n(26);
        const gapW = 0.22 + 0.38 * g.gp;
        for (let k = 0; k < n; k++) {
          const a = (k * TAU) / n;
          let d = a - g.fv[0];
          d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < gapW) continue;
          const i = g.spawn(g.bossX + Math.cos(a) * 150, g.bossY + Math.sin(a) * 150, a, g.v(1.35), T_SMALL, C_PINK);
          if (i < 0) break;
          g.bbeh[i] = B_POLAR;
          g.b0[i] = g.bossX;
          g.b1[i] = g.bossY;
          g.b2[i] = 150;
          g.b3[i] = a;
          g.bav[i] = 0.0035 * g.track();
          g.bmin[i] = -0.4;
        }
        g.shot();
      }
      if (t > 120 && g.tick(1, 72)) {
        const c = g.n(2.2);
        for (let k = 0; k < c; k++) {
          g.spawn(g.bossX, g.bossY, g.aim(g.bossX, g.bossY) + (g.rnd() - 0.5) * (1.0 / g.track()), g.v(2.2), T_MED, C_WHITE);
        }
        g.shot();
      }
    },
  },

  // 英語「Take your time」— 行間隔が gap で狭まる
  j2p2: {
    init(g) { g.moveBoss(W / 2, 118, 60); g.cnt[5] = 0; },
    update(g, t) {
      if (g.fw(0, 11)) {
        g.cnt[5]++;
        const fromLeft = (g.cnt[5] & 1) === 1;
        const rows = Math.max(4, Math.round(4 + 2 * g.dn));
        const span = FLOOR - 140;
        for (let r = 0; r < rows; r++) {
          const y = 132 + (r * span) / Math.max(1, rows - 1);
          const i = sweep(g, fromLeft, y, g.v(1.25), T_SMALL, C_PINK);
          if (i < 0) break;
          g.bbeh[i] = B_SINE;
          g.b0[i] = fromLeft ? -8 : W + 8;
          g.b1[i] = y;
          g.b2[i] = (22 + r * 5) * g.gp + 8;
          g.b3[i] = 0.012 + 0.004 * r;
          g.ba[i] = fromLeft ? 0 : PI;
        }
      }
      if (t > 60 && g.tick(1, 74)) {
        const gapW = 0.35 + 0.35 * g.gp;
        ringGap(g, g.bossX, g.bossY, g.n(16), g.rnd() * TAU, g.aim(W / 2, FLOOR), gapW, g.v(1.0), T_SMALL, C_VIOLET);
        g.shot();
      }
    },
  },

  // 玉砕「告白の意味」— 扇が track で狭まり、低空薙ぎが増える
  j2p3: {
    init(g) { g.moveBoss(W / 2, 108, 60); },
    update(g, _t) {
      if (g.tick(0, 22)) {
        const c = g.n(9);
        const base = g.aim(W / 2, FLOOR);
        const step = 0.28 / g.track();
        for (let k = 0; k < c; k++) {
          const a = base + (k - (c - 1) / 2) * step;
          const i = g.spawn(g.bossX, g.bossY, a, g.v(1.5), T_MED, C_RED);
          if (i < 0) break;
          g.bacc[i] = 0.004;
        }
        g.shot();
      }
      if (g.tick(1, 28)) {
        const n = g.n(4.2);
        for (let k = 0; k < n; k++) {
          sweep(g, g.rnd() < 0.5, FLOOR - 8 - g.rnd() * (24 + 12 * g.gp), g.v(0.9), T_SMALL, C_ORANGE);
        }
      }
    },
  },

  // ═══ STAGE 3 翠湖十キロ ═════════════════════════════════
  // 十キロ「加工なしの言葉」— 走路が右から左へ。等間隔の関門
  j3p1: {
    init(g) { g.moveBoss(W - 90, 110, 70); },
    update(g, t) {
      if (g.fw(0, 20)) {
        const lanes = Math.max(5, Math.round(5 + 2.5 * g.dn));
        const open = Math.floor(g.rnd() * lanes);
        // 隣接レーンの空きは gap が大きいときだけ
        const soft = g.gp > 0.55;
        for (let l = 0; l < lanes; l++) {
          if (l === open) continue;
          if (soft && l === open + 1 && g.rnd() < 0.45) continue;
          const y = 110 + (l * (FLOOR - 122)) / (lanes - 1);
          sweep(g, false, y, g.v(1.35 + 0.25 * (l % 2)), T_RICE, l % 2 ? C_CYAN : C_BLUE);
        }
        g.shot();
      }
      if (t > 180 && g.tick(1, 20)) {
        fan(g, g.bossX, g.bossY, g.n(1.6), 0.5 / g.track(), g.v(2.4), T_KUNAI, C_WHITE);
      }
    },
  },

  // 等高線「地形図の向こう」— 切れ目が gap で狭まる
  j3p2: {
    init(g) { g.moveBoss(W / 2, 86, 60); g.fv[2] = 0; },
    update(g, t) {
      if (g.tick(0, 134)) {
        const cx = g.bossX;
        const cy = 60;
        const r0 = 30;
        g.fv[2] += 0.55 + 0.3 * g.track();
        const n = g.n(20);
        const gapW = 0.18 + 0.28 * g.gp;
        for (let k = 0; k < n; k++) {
          const a = (k * TAU) / n;
          let d = a - g.fv[2];
          d = Math.atan2(Math.sin(d), Math.cos(d));
          if (Math.abs(d) < gapW) continue;
          const i = g.spawn(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, a, 0, T_SMALL, C_CYAN);
          if (i < 0) break;
          g.bbeh[i] = B_POLAR;
          g.b0[i] = cx;
          g.b1[i] = cy;
          g.b2[i] = r0;
          g.b3[i] = a;
          g.bav[i] = 0;
          g.bs[i] = g.v(1.15);
          g.bmin[i] = 0.15;
          g.bacc[i] = 0.012;
        }
        g.shot();
      }
      if (t > 150 && g.fw(1, 200)) {
        const x = 70 + g.rnd() * (W - 140);
        for (let k = 0; k < 3; k++) {
          crossMark(g, x, -10 - k * 26, PI / 2, g.v(0.9), C_WHITE);
        }
      }
    },
  },

  // 反射「湖面に映る✝本質✝」— 跳ね返り＋低空波。弾はハート（装飾花びらと区別）
  j3p3: {
    init(g) { g.moveBoss(W / 2, 100, 60); },
    update(g, _t) {
      if (g.tick(0, 42)) {
        const c = g.n(4);
        for (let k = 0; k < c; k++) {
          const a = g.aim(g.bossX, g.bossY) + (g.rnd() - 0.5) * (1.4 / g.track());
          const i = g.spawn(g.bossX, g.bossY, a, g.v(1.6), T_STAR, C_CYAN);
          if (i < 0) break;
          g.bbeh[i] = B_BOUNCE;
          g.b0[i] = Math.max(1, Math.round(1 + g.dn));
        }
        g.shot();
      }
      if (g.tick(1, 56)) {
        const n = g.n(6);
        for (let k = 0; k < n; k++) {
          const y = FLOOR - g.rnd() * (18 + 14 * g.gp);
          const fromLeft = g.rnd() < 0.5;
          const i = sweep(g, fromLeft, y, g.v(0.8 + 0.3 * g.rnd()), T_HEART, C_BLUE);
          if (i < 0) break;
          g.bbeh[i] = B_SINE;
          g.b0[i] = fromLeft ? -8 : W + 8;
          g.b1[i] = y;
          g.b2[i] = 10 + g.rnd() * 16;
          g.b3[i] = 0.02;
        }
      }
    },
  },

  // ═══ STAGE 4 球技大会、二点差 ═══════════════════════════
  // スティール「読み」— ホーミングが track で強化
  j4p1: {
    init(g) { g.moveBoss(W / 2, 116, 60); },
    update(g, _t) {
      if (g.tick(0, 34)) {
        const c = g.n(5);
        const turn = 0.016 * g.track();
        const dur = 80 + 50 * g.track();
        for (let k = 0; k < c; k++) {
          const a = g.aim(g.bossX, g.bossY) + (g.rnd() - 0.5) * (2.8 / g.track());
          const i = g.spawn(g.bossX, g.bossY, a, g.v(1.35), T_MED, C_ORANGE);
          if (i < 0) break;
          g.bbeh[i] = B_HOMING;
          g.b0[i] = turn;
          g.b1[i] = dur + g.rnd() * 40;
        }
        g.shot();
      }
      if (g.tick(1, 40)) {
        const n = g.n(4.2);
        for (let k = 0; k < n; k++) {
          sweep(g, g.rnd() < 0.5, 130 + g.rnd() * (FLOOR - 150), g.v(0.85 + 0.5 * g.rnd()), T_SMALL, C_WHITE);
        }
      }
    },
  },

  // 三点「用は済んだ」— 切れ目が gap で狭まる
  j4p2: {
    init(g) { g.moveBoss(W / 2, 108, 60); },
    update(g, t) {
      if (g.tick(0, 62)) {
        const cols: number[] = [C_ORANGE, C_WHITE, C_BLUE];
        for (let j = 0; j < 3; j++) {
          const x = j === 0 ? 40 : j === 1 ? W / 2 : W - 40;
          const n = g.n(5.2);
          for (let k = 0; k < n; k++) {
            const i = g.spawn(x, 120, j === 1 ? 0 : (j === 0 ? 1 : -1) * 0.35, 0, T_SMALL, cols[j]);
            if (i < 0) break;
            g.bbeh[i] = B_GRAVITY;
            g.b0[i] = j === 1 ? 0 : (j === 0 ? 1 : -1) * (1.1 + 0.2 * k);
            g.b1[i] = -0.4;
            g.bmax[i] = g.v(2.2);
          }
        }
        g.shot();
      }
      if (t > 100 && g.tick(1, 74)) {
        const gapW = 0.28 + 0.32 * g.gp;
        ringGap(g, g.bossX, g.bossY, g.n(16), g.rnd() * TAU, PI / 2, gapW, g.v(1.3), T_SMALL, C_ORANGE);
        g.shot();
      }
    },
  },

  // 二点差「最後の十秒」— レーン増・扇の収束
  j4p3: {
    init(g) { g.moveBoss(W / 2, 120, 60); g.flashScreen(0.3); },
    update(g, t) {
      const last = t > 1260;
      if (last ? g.fw(0, 34) : g.fw(0, 30)) {
        const lanes = Math.max(5, Math.round(4 + 2.5 * g.dn));
        const open = Math.floor(g.rnd() * lanes);
        for (let l = 0; l < lanes; l++) {
          if (l === open) continue;
          const y = 120 + (l * (FLOOR - 132)) / (lanes - 1);
          sweep(g, false, y, g.v(1.2 + 0.2 * (l % 3)), T_SMALL, l === 2 ? C_ORANGE : C_WHITE);
        }
        g.shot();
      }
      if (last ? g.tick(1, 20) : g.tick(1, 22)) {
        fan(g, g.bossX, g.bossY, g.n(2.1), 0.28 / g.track(), g.v(2.3), T_KUNAI, C_ORANGE);
      }
      if (last && g.tick(2, 100)) {
        const gapW = 0.25 + 0.28 * g.gp;
        ringGap(g, g.bossX, g.bossY, g.n(16), g.rnd() * TAU, g.aim(W / 2, FLOOR), gapW, g.v(1.5), T_STAR, C_WHITE);
        g.popText(W / 2, 240, POP_TENSA);
      }
    },
  },

  // ═══ STAGE 5 寺地星、沈黙する ═══════════════════════════
  // 切り抜き「十五万再生」— 枠が小さく密に、低空薙ぎ強化
  j5p1: {
    init(g) { g.moveBoss(W / 2, 104, 60); },
    update(g, _t) {
      if (g.tick(0, 44)) {
        const c = g.n(5);
        for (let k = 0; k < c; k++) {
          const fromLeft = g.rnd() < 0.5;
          const cy = 140 + g.rnd() * (FLOOR - 170);
          // 枠サイズを gap で縮小＝中を通りにくい
          const w = 30 + 22 * g.gp;
          const h = 22 + 16 * g.gp;
          const x0 = fromLeft ? -w : W + w;
          const a = fromLeft ? 0 : PI;
          const s = g.v(1.5);
          const col = [C_WHITE, C_CYAN, C_PINK][k % 3];
          g.spawn(x0, cy - h / 2, a, s, T_SMALL, col);
          g.spawn(x0, cy + h / 2, a, s, T_SMALL, col);
          g.spawn(x0 + (fromLeft ? w : -w), cy, a, s, T_SMALL, col);
        }
        g.shot();
      }
      if (g.tick(1, 48)) {
        const n = g.n(5.4);
        for (let k = 0; k < n; k++) {
          sweep(g, g.rnd() < 0.5, FLOOR - 10 - g.rnd() * (14 + 12 * g.gp), g.v(1.0), T_RICE, C_CYAN);
        }
      }
    },
  },

  // 一万人「コメント欄」— スキップ行が gap で減る
  j5p2: {
    init(g) { g.moveBoss(W / 2, 96, 60); },
    update(g, t) {
      if (g.fw(0, 5)) {
        const burst = Math.max(2, Math.round(2 + g.dn));
        for (let k = 0; k < burst; k++) {
          const y = 110 + g.rnd() * (FLOOR - 130);
          sweep(g, false, y, g.v(1.0 + 0.7 * g.rnd()), T_RICE, g.rnd() < 0.5 ? C_WHITE : C_PINK);
        }
      }
      if (g.fw(1, 56)) {
        const rows = Math.max(4, Math.round(3 + 2 * g.dn));
        const skip = Math.floor(g.rnd() * rows);
        for (let r = 0; r < rows; r++) {
          if (r === skip) continue;
          const y = 130 + (r * (FLOOR - 150)) / (rows - 1);
          sweep(g, true, y, g.v(1.1), T_SMALL, C_WHITE);
        }
        g.shot();
      }
      if (t > 300 && g.tick(2, 170)) {
        g.popText(W / 2, 220, POP_OMOSHIROI);
      }
    },
  },

  // 沈黙「配信やめる」— 雨の隙間が gap で狭まる
  j5p3: {
    init(g) { g.moveBoss(W / 2, 112, 60); },
    update(g, t) {
      const cyc = Math.max(100, Math.round(240 / g.R));
      const c = t % cyc;
      const dropAt = Math.round(cyc * 0.78);
      if (c < Math.round(cyc * 0.26) && g.tick(0, 8)) {
        const n = g.n(2.6);
        for (let k = 0; k < n; k++) {
          sweep(g, g.rnd() < 0.5, FLOOR - 8 - g.rnd() * (18 + 12 * g.gp), g.v(0.9), T_SMALL, C_CYAN);
        }
      }
      if (c === dropAt) {
        const n = g.n(38);
        // 隙間1箇所を gap 幅で確保（完全塞ぎを避ける）
        const gapX = 40 + g.rnd() * (W - 80);
        const gapW = g.gap(70, 22);
        for (let k = 0; k < n; k++) {
          const x = 20 + (k * (W - 40)) / (n - 1);
          if (Math.abs(x - gapX) < gapW / 2) continue;
          const i = g.spawn(x, -12, PI / 2, g.v(1.7 + 0.5 * g.rnd()), T_SMALL, C_WHITE);
          if (i < 0) break;
        }
        g.shot();
        g.flashScreen(0.3);
      }
    },
  },

  // 三十二人「おかえり」— 切れ目が gap で狭まる
  j5p4: {
    init(g) { g.moveBoss(W / 2, 118, 60); },
    update(g, t) {
      if (g.tick(0, 40)) {
        g.popText(W / 2, 250, POP_OKAERI);
        const n = g.n(6.5);
        for (let k = 0; k < n; k++) {
          const x = 30 + g.rnd() * (W - 60);
          const i = g.spawn(x, FLOOR + 10, -PI / 2, g.v(0.85), T_HEART, C_PINK);
          if (i < 0) break;
          g.bacc[i] = -0.0012;
        }
      }
      if (g.tick(1, 44)) {
        const gapW = 0.3 + 0.35 * g.gp;
        ringGap(g, g.bossX, g.bossY, g.n(18), g.rnd() * TAU, g.aim(g.bossX, g.bossY) + PI, gapW, g.v(1.05), T_CROSS, C_WHITE);
        g.shot();
      }
      if (t > 200 && g.fw(2, 130)) {
        crossMark(g, 60 + g.rnd() * (W - 120), 30, PI / 2 + (g.rnd() - 0.5) * 0.5, g.v(0.9), C_VIOLET);
      }
    },
  },
};
