// ─────────────────────────────────────────────────────────────
//  難度係数キャリブレーション計測器
//
//  「表示している難度係数 L」と「実際に画面に出ている弾幕の強さ T」が
//  一致しているかを、ヘッドレスで実測する検証ツール。
//
//  弾幕強度の定義（このゲームの唯一の難易度指標）:
//    T = Σ_(画面上の弾) w種[w] · w挙動 · (速度/BASE_SPD)^2
//    → 弾が毎秒どれだけ画面を横切り、どれだけ反応時間を奪うかの総量。
//      弾数・頻度・速度のすべてに単調で、data.ts の強度モデル
//         S(L) = spdMul(L)·denMul(L)·rateMul(L)
//      と比例する（弾は画面外で消えるため生存時間 ∝ 1/速度、よって Σ生存数·速度² ∝ 発射量·速度）。
//
//  目標: T ≈ K · S(Lmid)
//    ・全フェーズで T / (K·S) ≒ 1.00（±0.15 以内）
//    ・係数の単調性 = 実測の単調性（難易度・ステージ・フェーズの順序）
//    ・ずれは PATTERN_CAL[id] を 1/(T/(K·S)) 倍して補正する
//
//  使い方:
//    npx esbuild tools/measure.ts --bundle --platform=node --format=esm \
//      --outfile=/tmp/measure.mjs --log-level=warning && node /tmp/measure.mjs
//    node /tmp/measure.mjs --cal   # 較正テーブルの提案を出力
// ─────────────────────────────────────────────────────────────
import {
  STAGE_TABLES, levelOf, spdMul, denMul, rateMul, intensityOf, TYPE_HIT, PATTERN_CAL,
  W, H, TAU, BASE_SPD,
} from '../src/game/data';
import { PATTERNS } from '../src/game/patterns';
import { PATTERNS_JUMP } from '../src/game/patternsJump';

const MAXB = 4096;
const WARM = 70;
const K = 110;              // 目標係数（T = K·S(Lmid)）
const LASER_K = 300;        // レーザーの画面占有力の換算

const BEH_W = [1.0, 1.15, 1.15, 1.15, 1.1, 1.05, 1.02, 1.25, 1.35];
const TYPE_W = [1.0, 1.63, 3.46, 0.95, 0.95, 1.19, 1.19, 1.19, 1.0];

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
  sp = 1; dn = 1; R = 1; L = 0; cal = 1;
  wander = true; stepF = 1; wellOn = false; wellX = W / 2; wellY = 320; wellG = 260;
  emitN = 0; emitLink = false; emitX = new Float32Array(4); emitY = new Float32Array(4);
  petals = false;
  plX = W / 2; plY = H - 70;
  gameType = 0;
  private seed = 1;
  private ts = 0;
  private msx = 0; private msy = 0; private mtx = 0; private mty = 0; private moveT = 0; private moveDur = 1;

  reset(seed: number): void {
    this.bn = 0; this.seed = seed >>> 0 || 1; this.ts = 0;
    this.tmr.fill(0); this.cnt.fill(0); this.fv.fill(0);
    this.wander = true; this.stepF = 1; this.wellOn = false; this.emitN = 0; this.petals = false;
    this.bossX = W / 2; this.bossY = -80; this.msx = this.bossX; this.msy = this.bossY;
    this.mtx = this.bossX; this.mty = this.bossY; this.moveT = 0; this.moveDur = 1;
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
  shot(): void { /* noop */ }
  moveBoss(x: number, y: number, dur: number): void {
    this.msx = this.bossX; this.msy = this.bossY; this.mtx = x; this.mty = y; this.moveT = 0; this.moveDur = Math.max(1, dur);
  }
  laser(_x: number, _y: number, _a: number, len: number, w: number, warn: number, act: number): void {
    this.lasers.push({ t: 0, len, w, warn, act });
  }
  lasers: { t: number; len: number; w: number; warn: number; act: number }[] = [];
  private frozen = 0;
  startTimeStop(dur = 200): void { this.frozen = Math.max(this.frozen, dur); }
  popText(): void { /* noop */ }
  flashScreen(): void { /* noop */ }

  killB(i: number): void {
    const l = --this.bn;
    if (i === l) return;
    this.bx[i] = this.bx[l]; this.by[i] = this.by[l]; this.ba[i] = this.ba[l]; this.bs[i] = this.bs[l];
    this.bacc[i] = this.bacc[l]; this.bav[i] = this.bav[l]; this.bmin[i] = this.bmin[l]; this.bmax[i] = this.bmax[l];
    this.br[i] = this.br[l]; this.bt[i] = this.bt[l]; this.blife[i] = this.blife[l]; this.bghost[i] = this.bghost[l];
    this.b0[i] = this.b0[l]; this.b1[i] = this.b1[l]; this.b2[i] = this.b2[l]; this.b3[i] = this.b3[l];
    this.bbeh[i] = this.bbeh[l]; this.btyp[i] = this.btyp[l]; this.bcol[i] = this.bcol[l]; this.bflg[i] = this.bflg[l];
  }

  stepBullets(): number {
    let threat = 0;
    const frozen = this.frozen > 0;
    if (frozen) this.frozen--;
    let i = 0;
    while (i < this.bn) {
      let x = this.bx[i]; let y = this.by[i];
      const beh = this.bbeh[i];
      let vx = 0; let vy = 0; let dead = false;
      if (frozen && (this.bflg[i] & 2)) { i++; continue; }  // FL_STOP：時止め中は完全停止（脅威ゼロ）
      const t = ++this.bt[i];
      let a = this.ba[i];
      let s = this.bs[i] + this.bacc[i];
      if (s < this.bmin[i]) s = this.bmin[i];
      else if (s > this.bmax[i]) s = this.bmax[i];
      this.bs[i] = s;
      a += this.bav[i];
      switch (beh) {
        case 0: case 1:
          vx = Math.cos(a) * s; vy = Math.sin(a) * s;
          break;
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
      const spd = Math.sqrt(vx * vx + vy * vy);
      if (!dead) threat += TYPE_W[this.btyp[i]] * BEH_W[beh] * (spd / BASE_SPD) ** 2;
      if (dead) { this.killB(i); continue; }
      i++;
    }
    this.ts++;
    this.plX = W / 2 + Math.sin(this.ts * 0.011) * 150;
    this.plY = 400 + Math.sin(this.ts * 0.017) * 120;
    // レーザー（稼働中の画面占有力）
    let lz = 0;
    for (const l of this.lasers) {
      l.t++;
      if (l.t > l.warn && l.t <= l.warn + l.act) lz += (l.len * (l.w + 12)) / (W * H) * LASER_K;
    }
    return threat + lz;
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
  mode: number; d: number; s: number; p: number;
  id: string; Lmid: number; target: number;
  live: number; alive: number; peak: number; speed: number; fire: number; ratio: number;
}

function measurePhase(mode: number, d: number, s: number, p: number, table: readonly any[]): Row | null {
  const stage = table[s];
  const ph = stage.phases[p];
  const pat = (mode === 0 ? PATTERNS : PATTERNS_JUMP)[ph.id];
  if (!pat) return null;
  const g = new Mock();
  g.gameType = mode;
  const durFrames = Math.round(ph.dur * 60);
  const L0 = levelOf(d, s, p, 0);
  const NSEED = 4;
  let liveSum = 0, aliveAvg = 0, speedAvg = 0, peak = 0;
  for (let sd = 0; sd < NSEED; sd++) {
    g.reset(0x51ed + mode * 977 + d * 131 + s * 17 + p + sd * 7919);
    g.cal = PATTERN_CAL[ph.id] ?? 1;
    g.bossX = W / 2; g.bossY = -80; g.msx = W / 2; g.msy = -80;
    g.tmr.fill(0.999); g.cnt.fill(0); g.fv.fill(0);
    g.sp = spdMul(L0); g.dn = denMul(L0); g.R = rateMul(L0); g.L = L0;
    if (pat.init) pat.init(g as never, g.L);
    g.moveBoss(W / 2, 120, 110);
    let sum = 0; let n = 0; let aliveSum = 0; let peak0 = 0; let speedSum = 0; let speedN = 0;
    for (let t = 0; t < durFrames; t++) {
      g.phaseT = t;
      const f = Math.min(1, t / durFrames);
      const L = levelOf(d, s, p, f);
      g.L = L; g.sp = spdMul(L); g.dn = denMul(L); g.R = rateMul(L);
      g.updateBoss();
      if (t >= WARM) pat.update(g as never, t - WARM, L);
      const thr = g.stepBullets();
      const spawned = g.bn;
      if (t >= 30) {
        sum += thr; n++; aliveSum += spawned;
        if (spawned > peak0) peak0 = spawned;
        for (let i = 0; i < g.bn; i++) { speedSum += g.bs[i]; speedN++; }
      }
    }
    liveSum += n > 0 ? sum / n : 0;
    aliveAvg += n > 0 ? aliveSum / n : 0;
    speedAvg += speedN > 0 ? speedSum / speedN : 0;
    if (peak0 > peak) peak = peak0;
  }
  const live = liveSum / NSEED;
  const Lmid = levelOf(d, s, p, 0.5);
  const target = K * intensityOf(Lmid);
  return {
    mode, d, s, p, id: ph.id, Lmid, target,
    live, alive: aliveAvg / NSEED, peak,
    speed: speedAvg / NSEED,
    fire: 0, ratio: target > 0 ? live / target : 0,
  };
}

const rows: Row[] = [];
for (let d = 0; d < 4; d++) {
  for (let m = 0; m < 2; m++) {
    const table = STAGE_TABLES[m];
    for (let s = 0; s < table.length; s++) {
      for (let p = 0; p < table[s].phases.length; p++) {
        const r = measurePhase(m, d, s, p, table);
        if (r) rows.push(r);
      }
    }
  }
}

const KSTAR = '══════════════════════════════════════════════════════════════';
for (const m of [0, 1]) {
  const sub = rows.filter((r) => r.mode === m);
  if (!sub.length) continue;
  const title = m === 0 ? '回避弾幕' : '無限ジャンプ';
  console.log(`\n${KSTAR}\n モード${m} ${title}\n${KSTAR}`);
  console.log('  d s p   id      L(mid)   実測T   目標T   T/目標   弾数(平均/最大)  弾速  判定');
  let bad = 0;
  for (const r of sub) {
    const dev = Math.abs(r.ratio - 1);
    const mark = dev < 0.15 ? 'OK' : dev < 0.35 ? '△' : '×';
    if (dev >= 0.35) bad++;
    console.log(
      `  ${r.d} ${r.s} ${r.p}  ${r.id.padEnd(6)}  ${r.Lmid.toFixed(3)}  ${r.live.toFixed(0).padStart(6)}  ` +
      `${r.target.toFixed(0).padStart(6)}  ${r.ratio.toFixed(2).padStart(6)}   ${r.alive.toFixed(0).padStart(4)}/${r.peak.toString().padStart(4)}  ` +
      `${r.speed.toFixed(2).padStart(5)}  ${mark}`
    );
  }
  console.log(`  ── 目標から35%以上ずれたフェーズ: ${bad} / ${sub.length}`);

  // ステージ単位の単調性（フェーズ単位は±10%の形の差を許容）
  let mono = true;
  const badPair: string[] = [];
  for (let d = 0; d < 4; d++) {
    const seq: number[] = [];
    const nStage = Math.max(...sub.filter((r) => r.d === d).map((r) => r.s)) + 1;
    for (let s = 0; s < nStage; s++) {
      const ph = sub.filter((r) => r.d === d && r.s === s).map((r) => r.live);
      seq.push(ph.reduce((a, b) => a + b, 0) / ph.length);
    }
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] < seq[i - 1] * 0.97) { mono = false; badPair.push(`d${d}:s${i}→s${i + 1}`); }
    }
  }
  console.log(`  ── ステージ単位の単調増加（実測T平均）: ${mono ? 'OK' : 'NG ' + badPair.join(' ')}`);
  // 難易度の順序（前の難易度の最大 vs 次の難易度の最小）
  const mn: number[] = [];
  const mx: number[] = [];
  for (let d = 0; d < 4; d++) {
    const seq = sub.filter((r) => r.d === d);
    mn.push(Math.min(...seq.map((r) => r.live)));
    mx.push(Math.max(...seq.map((r) => r.live)));
  }
  console.log(`  ── 難易度帯の分離: ` + mn.map((v, i) => `d${i}[${v.toFixed(0)}–${mx[i].toFixed(0)}]`).join(' '));
}

if (process.argv.includes('--cal')) {
  const ids: string[] = [];
  const vals: number[] = [];
  const byId = new Map<string, number[]>();
  for (const r of rows) {
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id)!.push(r.ratio);
  }
  console.log('\n// ── PATTERN_CAL 提案（実測比の平均で 1.00 になるよう補正）──');
  for (const [id, ratios] of byId) {
    const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const cur = PATTERN_CAL[id] ?? 1;
    const next = cur / avg;
    ids.push(id); vals.push(next);
    console.log(`  ${id}: ${next.toFixed(2)},   // 実測比 avg ${avg.toFixed(2)} / 現 cal ${cur.toFixed(2)}`);
  }
}
