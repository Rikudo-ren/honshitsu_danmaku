import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
mkdirSync('node_modules/.cache', { recursive: true });
await build({ entryPoints: ['src/game/engine.ts'], bundle: true, format: 'esm', platform: 'node',
  outfile: 'node_modules/.cache/honshitsu-engine.mjs', logLevel: 'warning' });
import { installDom, makeCanvas } from './dom-stub.mjs';
installDom();
const { Engine } = await import('../node_modules/.cache/honshitsu-engine.mjs');
const FLOOR_Y = 580;
const eng = new Engine(makeCanvas(), { onEnd: () => {}, onPause: () => {} });
const key = (code, down) => eng[down ? 'onKeyDown' : 'onKeyUp']({ code, repeat: false, preventDefault() {} });

/**
 * 回避Bot：x を24px刻みに分割し「数フレーム後の弾との近さ」で最も安全な列へ移動。
 * 床を走る弾が近いときだけジャンプする（跳びすぎない）。
 */
const BINS = 20, BW = 480 / BINS;
const risk = new Float64Array(BINS);
function botFrame(f) {
  const px = eng.plX, py = eng.plY;
  risk.fill(0);
  let floorThreat = 1e9;
  for (let i = 0; i < eng.bn; i++) {
    // 現在位置＋進行方向で12f先を予測
    const a = eng.ba[i], sp = eng.bs[i];
    const fx = eng.bx[i] + Math.cos(a) * sp * 12;
    const fy = eng.by[i] + Math.sin(a) * sp * 12;
    const b = Math.max(0, Math.min(BINS - 1, (fx / BW) | 0));
    // 自機の高さ帯にいる弾だけ危険
    const dyv = Math.abs(fy - py);
    if (dyv < 30) risk[b] += 1 + (30 - dyv) / 30;
    for (let k = 1; k <= 1; k++) { if (b - k >= 0) risk[b - k] += 0.35; if (b + k < BINS) risk[b + k] += 0.35; }
    // 床すれすれの弾が横に近づいてきたらジャンプ
    if (Math.abs(eng.by[i] - FLOOR_Y) < 14 && eng.bx[i] > 0 && eng.bx[i] < 480) {
      floorThreat = Math.min(floorThreat, Math.abs(eng.bx[i] - px));
    }
  }
  let best = (px / BW) | 0, bv = 1e9;
  for (let b = 0; b < BINS; b++) {
    const d = Math.abs(b * BW + BW / 2 - px);
    if (d > 90) continue;                       // 今すぐ行ける範囲だけ
    const v = risk[b] + d * 0.004;              // 近い列を優先
    if (v < bv) { bv = v; best = b; }
  }
  const tx = best * BW + BW / 2;
  key('ArrowLeft', tx < px - 4); key('ArrowRight', tx > px + 4);
  if (floorThreat < 46 && eng.grounded && !eng.jumpHeld) key('Space', true);
  else if (eng.jumpHeld && f % 5 === 0) key('Space', false);
}

for (const diff of [0, 3]) {
  eng.startRun(1, diff, 0);
  eng.lives = 10 ** 6;
  let deaths = 0, phases = 0, guard = 0;
  const seen = new Set();
  const perPhase = {};
  const causes = {};
  const samples = [];
  let prevDT = -1;
  while (guard++ < 60 * 60 * 20) {
    const before = eng.lives;
    if (eng.mode === 'phase') botFrame(guard);
    eng.step();
    if (eng.lives < before) deaths++;
    // 被弾判定の瞬間（deathTimer が -1 → 8）に死因を記録する
    if (eng.deathTimer === 8 && prevDT < 0) {
      const id = eng.stages[eng.stage].phases[eng.phase].id;
      perPhase[id] = (perPhase[id] || 0) + 1;
      let bd = 1e9, info = 'laser?';
      for (let i = 0; i < eng.bn; i++) {
        const d = (eng.bx[i] - eng.plX) ** 2 + (eng.by[i] - eng.plY) ** 2;
        if (d < bd) { bd = d; info = `beh${eng.bbeh[i]} y=${eng.by[i].toFixed(0)} d=${Math.sqrt(d).toFixed(0)}`; }
      }
      const kind = info.split(' ')[0];
      causes[kind] = (causes[kind] || 0) + 1;
      if (samples.length < 24) samples.push(`${id} ${info}`);
    }
    prevDT = eng.deathTimer;
    if (eng.mode === 'phase') {
      const id = eng.stages[eng.stage].phases[eng.phase].id;
      if (!seen.has(id)) { seen.add(id); phases++; }
    }
    if (eng.mode === 'ending' || eng.mode === 'over') break;
  }
  console.log(`偏差値${[50, 60, 70, 85][diff]}：Bot が通しで被弾 ${deaths} 回（到達フェーズ ${seen.size}/19）`);
  console.log('  ' + Object.entries(perPhase).map(([k, v]) => `${k}:${v}`).join('  '));
  console.log('  死因(弾の挙動): ' + JSON.stringify(causes));
  console.log('  例: ' + samples.slice(0, 12).join(' | '));
}
eng.destroy();
