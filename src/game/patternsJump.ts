// ─────────────────────────────────────────────────────────────
//  無限ジャンプモード用 弾幕パターン
//  ・自機は「床（FLOOR_Y）」の上を走り、左右 + ジャンプだけで避ける
//  ・回避弾幕モードと同じエンジン・同じ弾の挙動を使う（構成だけ別物）
//  ・到達可能な高さは FLOOR_Y - 150 程度 ⇒ 弾幕はこの帯に張る
// ─────────────────────────────────────────────────────────────
import type { Engine } from './engine';
import type { PatternDef } from './patterns';
import {
  W, TAU, FLOOR_Y,
  T_SMALL, T_MED, T_LARGE, T_RICE, T_KUNAI, T_CROSS, T_STAR, T_HEART,
  C_RED, C_ORANGE, C_YELLOW, C_GREEN, C_CYAN, C_BLUE, C_VIOLET, C_PINK, C_WHITE,
  B_FLOOR, B_HOMING, B_SPLIT, B_POLAR,
  POP_HA, POP_MAA, POP_OMOSHIROI,
} from './data';

const PI = Math.PI;
/** 自機が届く天井（これより上に弾を張っても意味がない） */
const CEIL = FLOOR_Y - 150;
/** 床を這う弾の高さ */
const ROLL_Y = FLOOR_Y;

/** 床を転がる弾 */
function roller(g: Engine, fromLeft: boolean, speed: number, col: number, type = T_SMALL): number {
  return g.spawn(fromLeft ? -12 : W + 12, ROLL_Y, fromLeft ? 0 : PI, speed, type, col);
}

/** 床で n 回跳ねてから転がる弾（放物運動） */
function hopper(g: Engine, x: number, a: number, speed: number, bounces: number, col: number, type = T_SMALL): number {
  const i = g.spawn(x, -10, a, speed, type, col);
  if (i < 0) return -1;
  g.bbeh[i] = B_FLOOR;
  g.b0[i] = bounces;
  g.b2[i] = Math.cos(a) * speed;
  g.b3[i] = Math.sin(a) * speed;
  return i;
}

/** 上から降る弾 */
function rain(g: Engine, x: number, speed: number, col: number, type = T_SMALL, spread = 0.22): number {
  return g.spawn(x, -12, PI / 2 + (g.rnd() - 0.5) * spread, speed, type, col);
}

/** 横から来る壁（gapY の周辺 gapH だけ穴） */
function wall(g: Engine, fromLeft: boolean, gapY: number, gapH: number, speed: number, col: number): void {
  const x = fromLeft ? -14 : W + 14;
  const a = fromLeft ? 0 : PI;
  for (let y = CEIL - 14; y <= FLOOR_Y + 4; y += 18) {
    if (Math.abs(y - gapY) < gapH) continue;
    if (g.spawn(x, y, a, speed, T_SMALL, col) < 0) return;
  }
}

export const PATTERNS_JUMP: Record<string, PatternDef> = {
  // ═══ STAGE 1 伊豆見「半歩ずれる」 ═════════════════════════
  j1p1: {
    update(g, t, L) {
      // お題が降ってくる
      if (g.tick(0, 34)) {
        const n = 1 + Math.floor(g.dn * 1.4);
        for (let k = 0; k < n; k++) rain(g, 30 + g.rnd() * (W - 60), (1.3 + g.rnd() * 0.7) * g.sp, C_GREEN, T_RICE);
      }
      // 床を転がる回答
      if (g.tick(1, 88)) {
        roller(g, (g.cnt[1]++ & 1) === 0, 1.75 * g.sp, C_WHITE);
        g.shot();
      }
      if (t > 120 && g.tick(2, 264)) hopper(g, 60 + g.rnd() * (W - 120), PI / 2, 2 * g.sp, 2 + Math.floor(L), C_YELLOW);
    },
  },
  j1p2: {
    update(g, t, L) {
      // 三段の高さの横波
      if (g.tick(0, 84)) {
        const i = g.cnt[0]++;
        const low = (i & 1) === 0;                 // low = 床すれすれ（跳ぶ） / high = 跳躍高度（跳ばない）
        const left = (i & 2) === 0;
        const y = low ? FLOOR_Y - 2 : FLOOR_Y - 74;
        const n = 1 + Math.floor(L * 0.6);
        for (let k = 0; k < n; k++) {
          g.spawn(left ? -12 : W + 12, y - k * 11, left ? 0 : PI, 1.9 * g.sp, T_KUNAI, low ? C_CYAN : C_GREEN);
        }
        g.shot();
      }
      if (g.tick(1, 71)) roller(g, g.rnd() < 0.5, 2.0 * g.sp, C_YELLOW);
      if (t > 90 && g.tick(2, 124)) rain(g, 20 + g.rnd() * (W - 40), 1.7 * g.sp, C_GREEN, T_SMALL);
    },
  },
  j1p3: {
    update(g, _t, L) {
      // 穴の高さが交互に変わる壁：床で耐えるか、跳ぶか
      if (g.tick(0, 184)) {
        const i = g.cnt[0]++;
        const high = (i & 1) === 1;
        wall(g, (i & 2) === 0, high ? CEIL + 40 : FLOOR_Y - 8, 32 - 2 * L, 1.9 * g.sp, C_GREEN);
        g.shot();
      }
      if (g.tick(1, 60)) rain(g, 20 + g.rnd() * (W - 40), 1.9 * g.sp, C_WHITE, T_RICE);
      if (g.tick(2, 155)) {
        hopper(g, 40 + g.rnd() * (W - 80), PI / 2, 1.75 * g.sp, 3, C_YELLOW);
        g.popText(W / 2, CEIL + 40, POP_OMOSHIROI);
      }
    },
  },

  // ═══ STAGE 2 砂糖東洋「窓の外を見ない」 ═══════════════════
  j2p1: {
    update(g, t, L) {
      // 充電切れの一時間十分：ゆっくり、しかし途切れない雨
      if (g.tick(0, 24)) rain(g, g.rnd() * W, (1.1 + g.rnd() * 0.6) * g.sp, C_CYAN);
      if (g.tick(1, 130)) {
        roller(g, (g.cnt[1]++ & 1) === 0, 1.95 * g.sp, C_WHITE, T_MED);
        g.shot();
      }
      if (t > 100 && g.tick(2, 211)) {
        for (let k = 0; k < 2 + Math.floor(L); k++) {
          hopper(g, 50 + g.rnd() * (W - 100), PI / 2 + (g.rnd() - 0.5) * 0.5, 2 * g.sp, 2 + Math.floor(L), C_CYAN);
        }
      }
    },
  },
  j2p2: {
    update(g, t, _L) {
      // 送電線：床すれすれのレーザーは跳んで越える
      if (g.tick(0, 229)) {
        const low = (g.cnt[0]++ & 1) === 0;
        const y = low ? FLOOR_Y + 2 : CEIL + 46;
        g.laser(-20, y, 0, W + 60, 14, 62, 78, C_CYAN, 0);
      }
      if (g.tick(1, 35)) rain(g, g.rnd() * W, 1.6 * g.sp, C_WHITE);
      if (t > 140 && g.tick(2, 170)) {
        const fromLeft = g.rnd() < 0.5;
        for (let k = 0; k < 3; k++) {
          g.spawn(fromLeft ? -12 : W + 12, FLOOR_Y - 20 - k * 34, fromLeft ? 0 : PI, 1.95 * g.sp, T_KUNAI, C_CYAN);
        }
      }
    },
  },
  j2p3: {
    update(g, _t, L) {
      // トンネル：両側から交互に壁。見なかったことにしても通れない
      if (g.tick(0, 163)) {
        const i = g.cnt[0]++;
        const high = (i & 1) === 0;
        wall(g, (i & 2) === 0, high ? CEIL + 40 : FLOOR_Y - 8, 32 - 2 * L, 1.75 * g.sp, C_BLUE);
        g.shot();
      }
      if (g.tick(1, 81)) {
        const i = g.spawn(g.rnd() * W, CEIL - 20, PI / 2, 1.8 * g.sp, T_MED, C_CYAN);
        if (i >= 0) {
          g.bbeh[i] = B_HOMING;
          g.b0[i] = 0.028 + 0.006 * L;
          g.b1[i] = 90;
        }
      }
      if (g.tick(2, 106)) roller(g, g.rnd() < 0.5, 2.1 * g.sp, C_WHITE);
    },
  },

  // ═══ STAGE 3 召野カイト「覚醒」 ═══════════════════════════
  j3p1: {
    update(g, t, _L) {
      // 左手薬指の指輪：広がる輪
      if (g.tick(0, 74)) {
        const n = Math.round(14 + 8 * g.dn);
        const a0 = g.rnd() * TAU;
        for (let k = 0; k < n; k++) {
          const i = g.spawn(g.bossX, g.bossY + 30, a0 + (k * TAU) / n, 1.5 * g.sp, T_STAR, C_BLUE);
          if (i < 0) break;
          g.bbeh[i] = B_POLAR;
          g.b0[i] = g.bossX;
          g.b1[i] = g.bossY + 30;
          g.bav[i] = 0.006 * ((k & 1) ? 1 : -1);
        }
        g.shot();
      }
      if (g.tick(1, 88)) roller(g, (g.cnt[1]++ & 1) === 0, 2.0 * g.sp, C_WHITE);
      if (t > 120 && g.tick(2, 194)) rain(g, 30 + g.rnd() * (W - 60), 1.8 * g.sp, C_BLUE, T_HEART);
    },
  },
  j3p2: {
    update(g, _t, L) {
      // I was watching：ゆっくり追尾してくる英語
      if (g.tick(0, 74)) {
        const n = 1 + Math.floor(L * 0.9);
        for (let k = 0; k < n; k++) {
          const i = g.spawn(20 + g.rnd() * (W - 40), CEIL - 40, PI / 2, 1.5 * g.sp, T_CROSS, C_VIOLET);
          if (i < 0) break;
          g.bbeh[i] = B_HOMING;
          g.b0[i] = 0.022 + 0.005 * L;
          g.b1[i] = 130;
        }
      }
      if (g.tick(1, 53)) rain(g, g.rnd() * W, 1.7 * g.sp, C_BLUE);
      if (g.tick(2, 124)) roller(g, g.rnd() < 0.5, 2.05 * g.sp, C_CYAN, T_RICE);
    },
  },
  j3p3: {
    update(g, t, L) {
      // 玉砕：落ちて割れて床を走る
      if (g.tick(0, 81)) {
        const i = g.spawn(40 + g.rnd() * (W - 80), -14, PI / 2, 1.9 * g.sp, T_MED, C_RED);
        if (i >= 0) {
          g.bbeh[i] = B_SPLIT;
          g.b0[i] = 70 + Math.floor(g.rnd() * 40);
          g.b1[i] = 5 + Math.floor(L * 2);
          g.b2[i] = 1;
          g.b3[i] = 1.7 * g.sp;
        }
        g.shot();
      }
      if (g.tick(1, 66)) roller(g, (g.cnt[1]++ & 1) === 0, 2.05 * g.sp, C_ORANGE);
      if (t > 100 && g.tick(2, 148)) {
        for (let k = 0; k < 3; k++) hopper(g, 40 + g.rnd() * (W - 80), PI / 2 + (g.rnd() - 0.5) * 0.7, 1.75 * g.sp, 2 + Math.floor(L), C_BLUE);
      }
    },
  },

  // ═══ STAGE 4 三峰瑠衣「二つの「は？」」 ══════════════════
  j4p1: {
    update(g, _t, _L) {
      // 来訪：✝の形の塊が横切っていく
      if (g.tick(0, 106)) {
        const left = (g.cnt[0]++ & 1) === 0;
        const y = CEIL + 30 + g.rnd() * 90;
        const a = left ? 0 : PI;
        const pts = [0, -1, 1, -2, 2];
        for (let k = 0; k < pts.length; k++) {
          g.spawn(left ? -14 : W + 14, y + pts[k] * 16, a, 1.75 * g.sp, T_CROSS, C_VIOLET);
        }
        g.shot();
      }
      if (g.tick(1, 46)) rain(g, g.rnd() * W, 1.7 * g.sp, C_PINK);
      if (g.tick(2, 117)) roller(g, g.rnd() < 0.5, 2.1 * g.sp, C_WHITE, T_MED);
    },
  },
  j4p2: {
    update(g, t, L) {
      // お目付け役：左右の発射機が交差する
      g.emitN = 2;
      g.emitLink = false;
      g.emitX[0] = 26;
      g.emitY[0] = CEIL + 26;
      g.emitX[1] = W - 26;
      g.emitY[1] = CEIL + 26;
      if (g.tick(0, 28)) {
        for (let e = 0; e < 2; e++) {
          const dir = e === 0 ? 1 : -1;
          const a = dir > 0 ? 0.42 : PI - 0.42;
          if (g.spawn(g.emitX[e], g.emitY[e], a, 1.9 * g.sp, T_SMALL, e ? C_VIOLET : C_CYAN) < 0) break;
        }
      }
      if (g.tick(1, 94)) {
        roller(g, (g.cnt[1]++ & 1) === 0, 2.1 * g.sp, C_WHITE);
        g.shot();
      }
      if (t > 120 && g.tick(2, 177)) {
        for (let k = 0; k < 2 + Math.floor(L); k++) rain(g, 20 + g.rnd() * (W - 40), 1.9 * g.sp, C_PINK, T_RICE);
      }
    },
  },
  j4p3: {
    update(g, _t, L) {
      // 二つの「は？」：同時に二方向から
      if (g.tick(0, 170)) {
        const i = g.cnt[0]++;
        wall(g, true, (i & 1) ? FLOOR_Y - 8 : CEIL + 40, 32 - 2 * L, 1.9 * g.sp, C_VIOLET);
        wall(g, false, (i & 1) ? CEIL + 40 : FLOOR_Y - 8, 32 - 2 * L, 1.9 * g.sp, C_PINK);
        g.popText(g.plX, g.plY - 34, POP_HA);
        g.shot();
      }
      if (g.tick(1, 39)) rain(g, g.rnd() * W, 1.8 * g.sp, C_VIOLET);
      if (g.tick(2, 78)) roller(g, g.rnd() < 0.5, 2.15 * g.sp, C_WHITE);
    },
  },

  // ═══ STAGE 5 校長「特別試験」 ═════════════════════════════
  j5p1: {
    update(g, t, L) {
      // 異棟合同課題：五人一組の五列
      if (g.tick(0, 53)) {
        const n = 5;
        const off = (g.cnt[0]++ % 2) * 24;
        for (let k = 0; k < n; k++) {
          const x = ((k * (W + 80)) / n + off) % (W + 40) - 20;
          rain(g, x, (1.5 + (k % 3) * 0.35) * g.sp, k & 1 ? C_YELLOW : C_CYAN, T_RICE, 0.1);
        }
      }
      if (g.tick(1, 101)) {
        roller(g, (g.cnt[1]++ & 1) === 0, 2.1 * g.sp, C_ORANGE, T_MED);
        g.shot();
      }
      if (t > 110 && g.tick(2, 211)) {
        for (let k = 0; k < 2 + Math.floor(L); k++) hopper(g, 40 + g.rnd() * (W - 80), PI / 2, 1.75 * g.sp, 2 + Math.floor(L), C_YELLOW);
      }
    },
  },
  j5p2: {
    update(g, t, L) {
      // 予算削減：跳ねる弾が床を埋める
      if (g.tick(0, 42)) {
        hopper(g, 20 + g.rnd() * (W - 40), PI / 2 + (g.rnd() - 0.5) * 0.9, (1.7 + g.rnd() * 0.8) * g.sp, 2 + Math.floor(L * 1.4), C_YELLOW, T_SMALL);
      }
      if (g.tick(1, 81)) {
        const left = (g.cnt[1]++ & 1) === 0;
        for (let k = 0; k < 2; k++) {
          g.spawn(left ? -12 : W + 12, FLOOR_Y - 2 - k * 54, left ? 0 : PI, 1.95 * g.sp, T_KUNAI, C_RED);
        }
        g.shot();
      }
      if (t > 120 && g.tick(2, 155)) {
        const i = g.spawn(W / 2, CEIL + 30, PI / 2, 1.6 * g.sp, T_LARGE, C_ORANGE);
        if (i >= 0) {
          g.bbeh[i] = B_SPLIT;
          g.b0[i] = 60;
          g.b1[i] = 6;
          g.b2[i] = 2;
          g.b3[i] = 1.5 * g.sp;
        }
      }
    },
  },
  j5p3: {
    update(g, t, _L) {
      // 五人一組：五つの発射機が床を狙う
      g.emitN = 4;
      g.emitLink = true;
      for (let k = 0; k < 4; k++) {
        g.emitX[k] = 60 + k * 120;
        g.emitY[k] = CEIL + 18 + Math.sin(g.phaseT * 0.02 + k) * 14;
      }
      if (g.tick(0, 39)) {
        const k = g.cnt[0]++ % 4;
        const a = g.aim(g.emitX[k], g.emitY[k]);
        for (let j = -1; j <= 1; j++) {
          if (g.spawn(g.emitX[k], g.emitY[k], a + j * 0.16, 1.9 * g.sp, T_SMALL, C_YELLOW) < 0) break;
        }
      }
      if (g.tick(1, 60)) roller(g, g.rnd() < 0.5, 2.15 * g.sp, C_WHITE);
      if (t > 100 && g.tick(2, 124)) rain(g, g.rnd() * W, 2 * g.sp, C_RED, T_RICE);
    },
  },

  // ═══ FINAL 三重県臣「冷笑」 ══════════════════════════════
  j6p1: {
    update(g, t, L) {
      // 「まあ」：流す。だが流せない
      if (g.tick(0, 24)) rain(g, g.rnd() * W, (1.4 + g.rnd() * 0.8) * g.sp, C_WHITE);
      if (g.tick(1, 78)) {
        roller(g, (g.cnt[1]++ & 1) === 0, 2.15 * g.sp, C_PINK, T_MED);
        g.shot();
        g.popText(g.plX, g.plY - 36, POP_MAA);
      }
      if (t > 100 && g.tick(2, 142)) {
        for (let k = 0; k < 2 + Math.floor(L); k++) hopper(g, 30 + g.rnd() * (W - 60), PI / 2, 1.9 * g.sp, 3, C_WHITE);
      }
    },
  },
  j6p2: {
    update(g, _t, _L) {
      // 「ふーん」：防御。三方向の横波
      if (g.tick(0, 64)) {
        const i = g.cnt[0]++;
        const y = FLOOR_Y - 2 - (i % 3) * 52;
        const left = (i & 1) === 0;
        g.spawn(left ? -12 : W + 12, y, left ? 0 : PI, 2.0 * g.sp, T_KUNAI, C_PINK);
        g.spawn(left ? -12 : W + 12, y - 22, left ? 0 : PI, 2.0 * g.sp, T_KUNAI, C_PINK);
        g.shot();
      }
      if (g.tick(1, 27)) rain(g, g.rnd() * W, 1.9 * g.sp, C_VIOLET);
      if (g.tick(2, 92)) roller(g, g.rnd() < 0.5, 2.35 * g.sp, C_WHITE);
    },
  },
  j6p3: {
    update(g, _t, L) {
      // 「言わなかっただけだ」：壁と誘導
      if (g.tick(0, 152)) {
        const i = g.cnt[0]++;
        wall(g, (i & 1) === 0, (i & 2) ? CEIL + 40 : FLOOR_Y - 8, 32 - 2 * L, 1.95 * g.sp, C_WHITE);
        g.shot();
      }
      if (g.tick(1, 71)) {
        const i = g.spawn(g.rnd() * W, CEIL - 30, PI / 2, 1.7 * g.sp, T_CROSS, C_PINK);
        if (i >= 0) {
          g.bbeh[i] = B_HOMING;
          g.b0[i] = 0.03 + 0.006 * L;
          g.b1[i] = 120;
        }
      }
      if (g.tick(2, 53)) rain(g, g.rnd() * W, 2 * g.sp, C_VIOLET, T_RICE);
    },
  },
  j6p4: {
    update(g, t, L) {
      // 「は？じゃない」：全部
      if (g.tick(0, 19)) rain(g, g.rnd() * W, (1.5 + g.rnd() * 0.9) * g.sp, (g.cnt[0]++ % 3) === 0 ? C_PINK : C_WHITE);
      if (g.tick(1, 53)) {
        roller(g, (g.cnt[1]++ & 1) === 0, 2.45 * g.sp, C_RED, T_MED);
        g.shot();
      }
      if (g.tick(2, 124)) {
        const i = g.cnt[2]++;
        wall(g, (i & 1) === 0, (i & 2) ? CEIL + 40 : FLOOR_Y - 8, 31 - 2 * L, 2.0 * g.sp, C_VIOLET);
        g.popText(g.plX, g.plY - 38, POP_HA);
      }
      if (t > 90 && g.tick(3, 110)) {
        for (let k = 0; k < 3; k++) hopper(g, 30 + g.rnd() * (W - 60), PI / 2 + (g.rnd() - 0.5) * 0.8, 1.9 * g.sp, 3 + Math.floor(L), C_YELLOW);
      }
      if (t > 300 && g.tick(4, 264)) {
        g.emitN = 2;
        g.emitLink = false;
        g.emitX[0] = 30;
        g.emitY[0] = CEIL + 20;
        g.emitX[1] = W - 30;
        g.emitY[1] = CEIL + 20;
        for (let e = 0; e < 2; e++) {
          const a = g.aim(g.emitX[e], g.emitY[e]);
          for (let k = -2; k <= 2; k++) {
            if (g.spawn(g.emitX[e], g.emitY[e], a + k * 0.14, 1.95 * g.sp, T_STAR, C_PINK) < 0) break;
          }
        }
      }
    },
  },
};
