// ─────────────────────────────────────────────────────────────
//  回避難度シミュレータ — 「画面下部の自機がどれだけ避けにくいか」
//  弾の総量 T ではなく、自機近傍の危険度・隙間・反応時間を測る。
// ─────────────────────────────────────────────────────────────
import {
  STAGE_TABLES, levelOf, spdMul, denMul, rateMul, gapMul, trackMul, TYPE_HIT, PATTERN_CAL,
  W, H, TAU, BASE_SPD,
} from '../src/game/data';
import { PATTERNS } from '../src/game/patterns';
import { PATTERNS_JUMP } from '../src/game/patternsJump';

const MAXB = 4096;
const WARM = 70;
const PR = 2.4;
const FAST = 4.3;
const SLOW = 1.8;
const PL_Y0 = H - 70; // 回避弾幕の定位置

class Mock {
  bn = 0;
  bx = new Float32Array(MAXB); by = new Float32Array(MAXB);
  ba = new Float32Array(MAXB); bs = new Float32Array(MAXB);
  bacc = new Float32Array(MAXB); bav = new Float32Array(MAXB);
  bmin = new Float32Array(MAXB); bmax = new Float32Array(MAXB);
  br = new Float32Array(MAXB); bt = new Float32Array(MAXB);
  blife = new Float32Array(MAXB); bghost = new Float32Array(MAXB);
  b0 = new Float32Array(MAXB); b1 = new Float32Array(MAXB);
  b2 = new Float32Array(MAXB); b3 = new Float32Array(MAXB);
  bbeh = new Uint8Array(MAXB); btyp = new Uint8Array(MAXB); bcol = new Uint8Array(MAXB);
  bflg = new Uint8Array(MAXB);
  tmr = new Float32Array(8); cnt = new Int32Array(8); fv = new Float32Array(8);
  bossX = W / 2; bossY = 120; phaseT = 0;
  sp = 1; dn = 1; R = 1; gp = 1; tr = 1; L = 0; cal = 1;
  wander = true; stepF = 1; wellOn = false; wellX = W / 2; wellY = 320; wellG = 260;
  emitN = 0; emitLink = false; emitX = new Float32Array(4); emitY = new Float32Array(4);
  plX = W / 2; plY = PL_Y0;
  gameType = 0;
  private seed = 1;
  private ts = 0;
  private msx = 0; private msy = 0; private mtx = 0; private mty = 0; private moveT = 0; private moveDur = 1;
  lasers: { t: number; len: number; w: number; warn: number; act: number; x: number; y: number; a: number }[] = [];
  private frozen = 0;

  reset(seed: number): void {
    this.bn = 0; this.seed = seed >>> 0 || 1; this.ts = 0;
    this.tmr.fill(0); this.cnt.fill(0); this.fv.fill(0);
    this.wander = true; this.stepF = 1; this.wellOn = false; this.emitN = 0;
    this.bossX = W / 2; this.bossY = -80; this.msx = this.bossX; this.msy = this.bossY;
    this.mtx = this.bossX; this.mty = this.bossY; this.moveT = 0; this.moveDur = 1;
    this.lasers = []; this.frozen = 0;
    this.plX = W / 2; this.plY = PL_Y0;
  }
  rnd(): number {
    let s = this.seed; s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    this.seed = s; return s / 4294967296;
  }
  tick(k: number, base: number): boolean {
    this.tmr[k] += this.R / base;
    if (this.tmr[k] >= 1) { this.tmr[k] -= 1; return true; }
    return false;
  }
  aim(x: number, y: number): number { return Math.atan2(this.plY - y, this.plX - x); }
  v(base: number): number { return base * this.sp; }
  n(base: number): number { return Math.max(1, Math.round(base * this.dn * this.cal)); }
  fw(k: number, base: number): boolean { return this.tick(k, base / Math.max(0.2, this.dn * this.cal)); }
  gap(base: number, floor = 28): number { return Math.max(floor, base * this.gp); }
  track(base = 1): number { return base * this.tr; }
  spawn(x: number, y: number, a: number, s: number, type: number, col: number): number {
    if (this.bn >= MAXB) return -1;
    const i = this.bn++;
    this.bx[i] = x; this.by[i] = y; this.ba[i] = a; this.bs[i] = s;
    this.bacc[i] = 0; this.bav[i] = 0; this.bmin[i] = -50; this.bmax[i] = 50;
    this.br[i] = TYPE_HIT[type]; this.bt[i] = 0; this.blife[i] = 0; this.bghost[i] = 0;
    this.b0[i] = 0; this.b1[i] = 0; this.b2[i] = 0; this.b3[i] = 0;
    this.bbeh[i] = 0; this.btyp[i] = type; this.bcol[i] = col; this.bflg[i] = 0;
    return i;
  }
  shot(): void {}
  moveBoss(x: number, y: number, dur: number): void {
    this.msx = this.bossX; this.msy = this.bossY; this.mtx = x; this.mty = y; this.moveT = 0; this.moveDur = Math.max(1, dur);
  }
  laser(x: number, y: number, a: number, len: number, w: number, warn: number, act: number): void {
    this.lasers.push({ t: 0, len, w, warn, act, x, y, a });
  }
  startTimeStop(dur = 200): void { this.frozen = Math.max(this.frozen, dur); }
  popText(): void {}
  flashScreen(): void {}

  killB(i: number): void {
    const l = --this.bn;
    if (i === l) return;
    this.bx[i] = this.bx[l]; this.by[i] = this.by[l]; this.ba[i] = this.ba[l]; this.bs[i] = this.bs[l];
    this.bacc[i] = this.bacc[l]; this.bav[i] = this.bav[l]; this.bmin[i] = this.bmin[l]; this.bmax[i] = this.bmax[l];
    this.br[i] = this.br[l]; this.bt[i] = this.bt[l]; this.blife[i] = this.blife[l]; this.bghost[i] = this.bghost[l];
    this.b0[i] = this.b0[l]; this.b1[i] = this.b1[l]; this.b2[i] = this.b2[l]; this.b3[i] = this.b3[l];
    this.bbeh[i] = this.bbeh[l]; this.btyp[i] = this.btyp[l]; this.bcol[i] = this.bcol[l]; this.bflg[i] = this.bflg[l];
  }

  /** 1フレーム進め、プレイヤー帯の危険指標を返す */
  step(): { near: number; dens: number; minGap: number; aimed: number; hitProb: number } {
    if (this.frozen > 0) this.frozen--;
    const frozen = this.frozen > 0;
    let i = 0;
    while (i < this.bn) {
      let x = this.bx[i]; let y = this.by[i];
      const beh = this.bbeh[i];
      let dead = false;
      if (frozen && (this.bflg[i] & 2)) { i++; continue; }
      const t = ++this.bt[i];
      let a = this.ba[i];
      let s = this.bs[i] + this.bacc[i];
      if (s < this.bmin[i]) s = this.bmin[i];
      else if (s > this.bmax[i]) s = this.bmax[i];
      this.bs[i] = s;
      a += this.bav[i];
      let vx = 0, vy = 0;
      switch (beh) {
        case 0: case 1:
          vx = Math.cos(a) * s; vy = Math.sin(a) * s; break;
        case 2: {
          const c = Math.cos(a); const sn = Math.sin(a);
          vx = c * s; vy = sn * s;
          if (this.b0[i] > 0) {
            if ((x < 4 && c < 0) || (x > W - 4 && c > 0)) { a = Math.PI - a; this.b0[i]--; }
            else if (y < 4 && sn < 0) { a = -a; this.b0[i]--; }
            else if (y > H - 6 && sn > 0) { a = -a; this.b0[i]--; }
          }
          break;
        }
        case 3: {
          this.b2[i] += s; this.b3[i] += this.bav[i];
          x = this.b0[i] + Math.cos(this.b3[i]) * this.b2[i];
          y = this.b1[i] + Math.sin(this.b3[i]) * this.b2[i];
          a = this.b3[i];
          vx = Math.cos(a) * s; vy = Math.sin(a) * s;
          if (this.b2[i] > 820) dead = true;
          break;
        }
        case 4: {
          let lvx = this.b0[i]; let lvy = this.b1[i];
          const dx = this.wellX - x; const dy = this.wellY - y;
          const d2 = dx * dx + dy * dy; const d = Math.sqrt(d2) + 0.001;
          const f = this.wellG / (d * (d2 + 1800));
          lvx += dx * f; lvy += dy * f;
          const m2 = lvx * lvx + lvy * lvy; const cap = this.bmax[i];
          if (m2 > cap * cap && m2 > 0) { const k = cap / Math.sqrt(m2); lvx *= k; lvy *= k; }
          this.b0[i] = lvx; this.b1[i] = lvy;
          vx = lvx; vy = lvy;
          break;
        }
        case 5: {
          const c = Math.cos(a); const sn = Math.sin(a);
          this.b0[i] += c * s; this.b1[i] += sn * s;
          const off = Math.sin(t * this.b3[i]) * this.b2[i];
          x = this.b0[i] - sn * off; y = this.b1[i] + c * off;
          vx = c * s; vy = sn * s;
          break;
        }
        case 6: {
          const e = s * this.stepF;
          vx = Math.cos(a) * e; vy = Math.sin(a) * e;
          break;
        }
        case 7:
          vx = Math.cos(a) * s; vy = Math.sin(a) * s;
          if (t === this.b0[i]) {
            const n = this.b1[i]; const gen = this.b2[i]; const cs = this.b3[i];
            const typ = this.btyp[i]; const ct = typ === 2 ? 1 : 0; const cc = typ === 2 ? 0 : 2;
            const a0 = a + Math.PI / n;
            for (let k = 0; k < n; k++) {
              const j = this.spawn(x, y, a0 + (k * TAU) / n, cs, ct, cc);
              if (j < 0) break;
              if (gen > 1) {
                this.bbeh[j] = 7; this.b0[j] = 40; this.b1[j] = 3; this.b2[j] = gen - 1; this.b3[j] = cs * 0.85;
                this.bacc[j] = -0.02; this.bmin[j] = cs * 0.45;
              } else {
                this.bacc[j] = 0.008; this.bmax[j] = cs * 1.4;
              }
            }
            dead = true;
          }
          break;
        case 8: {
          if (t < this.b1[i]) {
            let d = Math.atan2(this.plY - y, this.plX - x) - a;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            const tr = this.b0[i];
            if (d > tr) d = tr; else if (d < -tr) d = -tr;
            a += d;
          }
          vx = Math.cos(a) * s; vy = Math.sin(a) * s;
          break;
        }
      }
      this.ba[i] = a;
      x += vx; y += vy;
      this.bx[i] = x; this.by[i] = y;
      if (!dead) {
        if (this.bflg[i] & 16) { /* NOCULL */ }
        else if (beh !== 3) {
          const m = beh === 4 ? 160 : 64;
          if (x < -m || x > W + m || y < -m || y > H + m) dead = true;
        }
      }
      if (dead) { this.killB(i); continue; }
      i++;
    }
    this.ts++;
    // 自機は「定位置帯」を左右に動く（フォーカス寄り：実プレイの標準）
    this.plX = W / 2 + Math.sin(this.ts * 0.021) * 110;
    this.plY = PL_Y0 + Math.sin(this.ts * 0.013) * 40;

    // ── プレイヤー帯 (y = PL_Y0 ± 80) の危険度 ──
    const ZONE_LO = PL_Y0 - 100;
    const ZONE_HI = PL_Y0 + 60;
    // x 方向 16 セルの占有
    const CELLS = 24;
    const occ = new Float32Array(CELLS);
    let near = 0; // 自機 80px 以内の弾の脅威（速度/距離）
    let dens = 0;
    let aimed = 0;
    for (let j = 0; j < this.bn; j++) {
      const x = this.bx[j], y = this.by[j];
      if (y < ZONE_LO || y > ZONE_HI) continue;
      dens++;
      const r = this.br[j] + PR + 6;
      const c0 = Math.max(0, Math.floor(((x - r) / W) * CELLS));
      const c1 = Math.min(CELLS - 1, Math.floor(((x + r) / W) * CELLS));
      for (let c = c0; c <= c1; c++) occ[c] = Math.max(occ[c], 1);
      const dx = x - this.plX, dy = y - this.plY;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.5;
      if (d < 90) {
        const spd = Math.abs(this.bs[j]);
        near += (spd / BASE_SPD) * (1 - d / 90) * (TYPE_HIT[this.btyp[j]] / 2.6);
      }
      // 自機狙い寄りの弾：進行方向が自機に向いている
      const ax = Math.cos(this.ba[j]), ay = Math.sin(this.ba[j]);
      const toPx = this.plX - x, toPy = this.plY - y;
      const td = Math.sqrt(toPx * toPx + toPy * toPy) + 0.1;
      const dot = (ax * toPx + ay * toPy) / td;
      if (dot > 0.92 && y < this.plY) aimed += 1;
    }
    // 最大連続空きセル → 隙間幅
    let maxRun = 0, run = 0;
    for (let c = 0; c < CELLS; c++) {
      if (occ[c] < 0.5) { run++; if (run > maxRun) maxRun = run; }
      else run = 0;
    }
    const minGap = (maxRun / CELLS) * W;
    // 自機位置セルが塞がれている確率的指標
    const pc = Math.min(CELLS - 1, Math.max(0, Math.floor((this.plX / W) * CELLS)));
    const hitProb = occ[pc];

    for (const l of this.lasers) {
      l.t++;
    }
    return { near, dens, minGap, aimed, hitProb };
  }

  updateBoss(): void {
    if (this.moveT < this.moveDur) {
      this.moveT++;
      const e = this.moveT / this.moveDur;
      const k = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;
      this.bossX = this.msx + (this.mtx - this.msx) * k;
      this.bossY = this.msy + (this.mty - this.msy) * k;
    } else if (this.wander && this.phaseT > WARM && this.phaseT % 170 === 0) {
      this.moveBoss(90 + this.rnd() * 300, 80 + this.rnd() * 70, 100);
    }
  }
}

interface Row {
  mode: number; d: number; s: number; p: number; id: string; L: number;
  near: number; dens: number; gap: number; aimed: number; occ: number; dodge: number;
}

function measure(mode: number, d: number, s: number, p: number): Row | null {
  const table = STAGE_TABLES[mode];
  const stage = table[s];
  const ph = stage.phases[p];
  const pat = (mode === 0 ? PATTERNS : PATTERNS_JUMP)[ph.id];
  if (!pat) return null;
  const g = new Mock();
  g.gameType = mode;
  const dur = Math.round(ph.dur * 60);
  const NSEED = 3;
  let nearS = 0, densS = 0, gapS = 0, aimS = 0, occS = 0, n = 0;
  for (let sd = 0; sd < NSEED; sd++) {
    g.reset(0xA11CE + mode * 977 + d * 131 + s * 17 + p + sd * 7919);
    g.cal = PATTERN_CAL[ph.id] ?? 1;
    g.bossX = W / 2; g.bossY = -80;
    g.tmr.fill(0.999);
    const L0 = levelOf(d, s, p, 0);
    g.sp = spdMul(L0); g.dn = denMul(L0); g.R = rateMul(L0); g.gp = gapMul(L0); g.tr = trackMul(L0); g.L = L0;
    if (pat.init) pat.init(g as never, g.L);
    g.moveBoss(W / 2, 120, 110);
    for (let t = 0; t < dur; t++) {
      g.phaseT = t;
      const f = Math.min(1, t / dur);
      const L = levelOf(d, s, p, f);
      g.L = L; g.sp = spdMul(L); g.dn = denMul(L); g.R = rateMul(L); g.gp = gapMul(L); g.tr = trackMul(L);
      g.updateBoss();
      if (t >= WARM) pat.update(g as never, t - WARM, L);
      const m = g.step();
      if (t >= 90) {
        nearS += m.near; densS += m.dens; gapS += m.minGap; aimS += m.aimed; occS += m.hitProb; n++;
      }
    }
  }
  const near = nearS / n, dens = densS / n, gap = gapS / n, aimed = aimS / n, occ = occS / n;
  // 回避難度 D: 近傍脅威↑ 密度↑ 隙間↓ 狙い弾↑ 占有↑
  // gap は 40px 未満で急激に危険、120px 以上で余裕
  const gapPenalty = gap < 40 ? 3.0 : gap < 80 ? 1.5 + (80 - gap) / 40 : gap < 140 ? (140 - gap) / 60 : 0.2;
  const dodge = near * 1.4 + dens * 0.08 + aimed * 0.35 + occ * 2.5 + gapPenalty * 1.2;
  return { mode, d, s, p, id: ph.id, L: levelOf(d, s, p, 0.5), near, dens, gap, aimed, occ, dodge };
}

const rows: Row[] = [];
for (let d = 0; d < 4; d++) {
  for (let m = 0; m < 1; m++) { // まず回避弾幕
    const table = STAGE_TABLES[m];
    for (let s = 0; s < table.length; s++) {
      for (let p = 0; p < table[s].phases.length; p++) {
        const r = measure(m, d, s, p);
        if (r) rows.push(r);
      }
    }
  }
}

console.log('d s p  id      L      near   dens   gap   aim   occ   DODGE');
for (const r of rows) {
  console.log(
    `${r.d} ${r.s} ${r.p}  ${r.id.padEnd(6)} ${r.L.toFixed(2)}  ${r.near.toFixed(2).padStart(5)}  ${r.dens.toFixed(1).padStart(5)}  ${r.gap.toFixed(0).padStart(4)}  ${r.aimed.toFixed(1).padStart(4)}  ${r.occ.toFixed(2)}  ${r.dodge.toFixed(2).padStart(6)}`
  );
}

// 難易度ごとの平均 DODGE と単調性
console.log('\n── 難易度平均 DODGE（ステージ別）──');
for (let d = 0; d < 4; d++) {
  const byS: number[] = [];
  for (let s = 0; s < 6; s++) {
    const ph = rows.filter((r) => r.d === d && r.s === s);
    byS.push(ph.reduce((a, b) => a + b.dodge, 0) / ph.length);
  }
  console.log(`d${d}: ` + byS.map((v) => v.toFixed(2)).join(' → ') + `  | avg ${ (byS.reduce((a,b)=>a+b,0)/byS.length).toFixed(2)}`);
}
// 同ステージ・同フェーズでの d 上昇比
console.log('\n── 同一フェーズ d0→d3 の DODGE 比 ──');
for (let s = 0; s < 6; s++) {
  for (let p = 0; p < STAGE_TABLES[0][s].phases.length; p++) {
    const a = rows.find((r) => r.d === 0 && r.s === s && r.p === p)!;
    const b = rows.find((r) => r.d === 3 && r.s === s && r.p === p)!;
    console.log(`  ${a.id}: ${a.dodge.toFixed(2)} → ${b.dodge.toFixed(2)}  ×${(b.dodge / a.dodge).toFixed(2)}`);
  }
}
