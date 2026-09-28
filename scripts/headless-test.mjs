import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
mkdirSync('node_modules/.cache', { recursive: true });
await build({
  entryPoints: ['src/game/engine.ts'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: 'node_modules/.cache/honshitsu-engine.mjs', logLevel: 'warning',
});
import { installDom, makeCanvas } from './dom-stub.mjs';
installDom();
const { Engine } = await import('../node_modules/.cache/honshitsu-engine.mjs');

const FLOOR_Y = 640 - 60;
const JUMP_G = 0.3, JUMP_MIN = 4.2, JUMP_MAX = 8.4, JUMP_CHARGE = 14, JUMP_AIR = 4.35, JUMP_AIR_CD = 30;

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('  FAIL:', msg); } else console.log('  ok  :', msg); };

const canvas = makeCanvas();
const ended = [];
const eng = new Engine(canvas, { onEnd: (r) => ended.push(r), onPause: () => {} });

// ── 0. タイトル（attract）描画 ─────────────────────────
eng.toTitle();
for (let i = 0; i < 200; i++) { eng.step(); if (i % 5 === 0) eng.render(1); }
ok(eng.mode === 'attract', 'タイトル：attract モードで描画');

// ── 1. 残機 / 「は？」 ─────────────────────────────────
for (const [m, d, want] of [[0,0,5],[0,1,5],[0,2,5],[0,3,5],[1,0,5],[1,3,5]]) {
  eng.startRun(m, d, 0);
  ok(eng.lives === 5 && eng.bombs === 5, `mode${m} diff${d}: 残機=${eng.lives} 「は？」=${eng.bombs} (want ${want})`);
}

// ── 2. ジャンプ物理 ────────────────────────────────────
eng.startRun(1, 0, 0);
const step = (n) => { for (let i = 0; i < n; i++) eng.step(); };
step(220); // intro を抜けて phase へ
ok(eng.mode === 'phase', 'intro → phase 遷移');
ok(Math.abs(eng.plY - FLOOR_Y) < 0.001, `接地時の y = ${eng.plY} (FLOOR_Y=${FLOOR_Y})`);

// 離散積分（毎フレーム vy += G → y += vy）での頂点を厳密に求める
const apexOf = (v0) => { let v = v0, y = 0; while (v + JUMP_G < 0) { v += JUMP_G; y += v; } return y; };
const wantMax = FLOOR_Y + apexOf(-JUMP_MAX);
const vOf = (charge) => -(JUMP_MIN + ((JUMP_MAX - JUMP_MIN) * charge) / JUMP_CHARGE);
const wantMin = FLOOR_Y + apexOf(vOf(2)); // 1f押し → charge=2（離したフレームにも加算される）

// 最大チャージジャンプの頂点
const key = (code, down) => eng[down ? 'onKeyDown' : 'onKeyUp']({ code, repeat: false, preventDefault() {} });
key('Space', true); step(JUMP_CHARGE + 1); key('Space', false);
let apex = FLOOR_Y;
for (let i = 0; i < 120; i++) { step(1); apex = Math.min(apex, eng.plY); }
ok(Math.abs(apex - wantMax) < 0.6, `最大ジャンプ頂点 ${apex.toFixed(1)} (期待 ${wantMax.toFixed(1)} / 高さ ${(FLOOR_Y - apex).toFixed(1)}px)`);
ok(FLOOR_Y - apex < 150, `ジャンプ力は控えめ（${(FLOOR_Y - apex).toFixed(1)}px < 150px = 画面の1/4未満）`);
step(200);
ok(Math.abs(eng.plY - FLOOR_Y) < 0.001, '着地して床に戻る');

// 弱ジャンプ
key('Space', true); step(1); key('Space', false);
let apex2 = FLOOR_Y;
for (let i = 0; i < 100; i++) { step(1); apex2 = Math.min(apex2, eng.plY); }
ok(Math.abs(apex2 - wantMin) < 0.6, `タップジャンプ頂点 ${apex2.toFixed(1)} (期待 ${wantMin.toFixed(1)} / 高さ ${(FLOOR_Y - apex2).toFixed(1)}px)`);
ok(apex2 > apex, '長押しの方が高く跳ぶ（押した長さでジャンプ力が変わる）');
step(200);

// 空中ジャンプを最も得なタイミングで使った場合の到達点
key('Space', true); step(JUMP_CHARGE + 1); key('Space', false);
let best = FLOOR_Y;
for (let i = 0; i < 400; i++) {
  if (eng.vy > -JUMP_AIR && eng.airCd === 0 && eng.plY < FLOOR_Y) { key('Space', true); key('Space', false); }
  step(1);
  best = Math.min(best, eng.plY);
}
ok(best > FLOOR_Y - 200, `空中ジャンプ込みの最高到達点 y=${best.toFixed(1)}（床から ${(FLOOR_Y - best).toFixed(1)}px）`);
step(200);

// 空中ジャンプ連打で高度を稼げないこと
let minY = FLOOR_Y;
for (let i = 0; i < 900; i++) {
  if (i % 4 === 0) key('Space', true);
  if (i % 4 === 2) key('Space', false);
  step(1);
  minY = Math.min(minY, eng.plY);
}
ok(minY > FLOOR_Y - 200, `空中ジャンプ連打 900f で到達した最高地点 y=${minY.toFixed(1)}（無限上昇しない）`);
step(300);

// ── 2b. 床で跳ねる弾（B_FLOOR） ────────────────────────
eng.startRun(1, 0, 0);
step(220);
eng.bn = 0;
eng.pattern = null;   // 他の弾を出さない
const bi = eng.spawn(120, -10, Math.PI / 2, 2.2, 0, 2);
eng.bbeh[bi] = 9 /* B_FLOOR */; eng.b0[bi] = 2;
eng.b2[bi] = Math.cos(Math.PI / 2) * 2.2; eng.b3[bi] = Math.sin(Math.PI / 2) * 2.2;
let bounced = false, rolled = false, lowest = -1;
for (let i = 0; i < 400 && eng.bn > 0; i++) {
  step(1);
  if (eng.bn === 0) break;
  if (eng.bbeh[0] === 9) { if (Math.abs(eng.by[0] - FLOOR_Y) < 0.01) bounced = true; }
  else if (eng.bbeh[0] === 0 && Math.abs(eng.by[0] - FLOOR_Y) < 0.01) rolled = true;
  lowest = Math.max(lowest, eng.by[0]);
}
ok(bounced, '床で跳ねる（B_FLOOR が床で反射）');
ok(rolled, '跳ね切ったら床を転がる（B_LINEAR に切替、y=FLOOR_Y）');
ok(lowest <= FLOOR_Y + 0.001, `床を越えない（最大 y=${lowest.toFixed(1)}）`);

// ── 3. 無限ジャンプモード 通しクリア ───────────────────
ended.length = 0;
eng.startRun(1, 0, 0);
eng.lives = 10 ** 6;
const seenJump = new Set();
let minY2 = 1e9, maxY2 = -1e9, maxBullets = 0, guard = 0;
while (ended.length === 0 && guard++ < 60 * 60 * 30) {
  // 適当に入力（左右＋ジャンプ）して物理を回し続ける
  if (guard % 37 === 0) key('ArrowLeft', (guard / 37 | 0) % 2 === 0);
  if (guard % 53 === 0) key('ArrowRight', (guard / 53 | 0) % 2 === 1);
  if (guard % 41 === 0) { key('Space', true); }
  if (guard % 41 === 9) { key('Space', false); }
  step(1);
  if (eng.mode === 'phase') {
    seenJump.add(eng.stages[eng.stage].phases[eng.phase].id);
    maxBullets = Math.max(maxBullets, eng.bn);
    minY2 = Math.min(minY2, eng.plY);
    maxY2 = Math.max(maxY2, eng.plY);
  }
  if (guard % 600 === 0) eng.invuln = 60;   // 検証用：死なせない
  if (guard % 7 === 0) eng.render(1);        // 描画経路も通す
}
ok(true, '無限ジャンプ：描画経路で例外なし');
const r1 = ended[0];
ok(!!r1 && r1.cleared === true, `無限ジャンプ 通しクリア（${guard} frame, cleared=${r1 && r1.cleared}）`);
ok(r1 && r1.ruleMode === 1, `RunResult.ruleMode = ${r1 && r1.ruleMode}`);
ok(seenJump.size === 19, `全19フェーズ通過（実際 ${seenJump.size}）: ${[...seenJump].join(',')}`);
ok(r1 && r1.phasesCleared === 19, `phasesCleared = ${r1 && r1.phasesCleared}`);
ok(maxBullets > 0, `弾が生成された（最大同時 ${maxBullets}）`);
ok(maxY2 <= FLOOR_Y + 0.001, `床を貫通しない（最大 y=${maxY2.toFixed(1)}）`);
ok(minY2 > FLOOR_Y - 200, `天井を越えない（最小 y=${minY2.toFixed(1)}）`);

// ── 4. 回避弾幕モード 通しクリア（退行確認） ───────────
ended.length = 0;
eng.startRun(0, 0, 0);
eng.lives = 10 ** 6;
const seenD = new Set();
guard = 0;
while (ended.length === 0 && guard++ < 60 * 60 * 30) {
  step(1);
  if (eng.mode === 'phase') seenD.add(eng.stages[eng.stage].phases[eng.phase].id);
  if (guard % 600 === 0) eng.invuln = 60;
  if (guard % 7 === 0) eng.render(1);
}
ok(true, '回避弾幕：描画経路で例外なし');
const r0 = ended[0];
ok(!!r0 && r0.cleared === true, `回避弾幕 通しクリア（cleared=${r0 && r0.cleared}）`);
ok(seenD.size === 20, `回避弾幕 全20フェーズ通過（実際 ${seenD.size}）`);
ok(r0 && r0.ruleMode === 0, `RunResult.ruleMode = ${r0 && r0.ruleMode}`);

// ── 5. 死んだら最初から（残機0でGAME OVER） ────────────
ended.length = 0;
eng.startRun(1, 2, 0);
eng.lives = 1;
eng.invuln = 0;
guard = 0;
while (ended.length === 0 && guard++ < 60 * 60 * 10) {
  step(1);
  if (eng.mode === 'phase' && guard % 10 === 0) eng.onHit();   // わざと喰らう
  eng.bombs = 0;
}
const r2 = ended[0];
ok(!!r2 && r2.cleared === false, `残機0で GAME OVER（cleared=${r2 && r2.cleared}, stageReached=${r2 && r2.stageReached}）`);

eng.destroy();
console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
