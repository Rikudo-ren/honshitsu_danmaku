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
const FLOOR_Y = 580, BAND_TOP = FLOOR_Y - 150;

const eng = new Engine(makeCanvas(), { onEnd: () => {}, onPause: () => {} });
const IDS = ['j1p1','j1p2','j1p3','j2p1','j2p2','j2p3','j3p1','j3p2','j3p3','j4p1','j4p2','j4p3','j5p1','j5p2','j5p3','j6p1','j6p2','j6p3','j6p4'];

function probe(diff) {
  console.log(`\n── 偏差値${[50,60,70,85][diff]}（立ち尽くした場合） ──`);
  console.log('phase   dur  初被弾   被弾数  帯内最大弾数');
  for (let s = 0; s < 6; s++) {
    for (let p = 0; p < eng.stages.length; p++) { /* noop */ }
  }
  for (const id of IDS) {
    // 該当フェーズまで進める
    let stage = Number(id[1]) - 1;
    let phase = Number(id[3]) - 1;
    eng.startRun(1, diff, 0);
    // 手早く目的のステージ/フェーズへ
    for (let i = 0; i < 60 * 60 * 40; i++) {
      eng.step();
      if (eng.mode === 'phase' && eng.stage === stage && eng.phase === phase) break;
      eng.invuln = 10; eng.lives = 99;
    }
    eng.invuln = 0;
    eng.plX = 240; eng.plY = FLOOR_Y;
    let firstHit = -1, hits = 0, bandMax = 0;
    const dur = eng.stages[stage].phases[phase].dur * 60;
    for (let f = 0; f < dur; f++) {
      const before = eng.lives;
      eng.plX = 240; eng.plY = FLOOR_Y;   // 中央に立ち尽くす
      eng.invuln = 0;
      eng.step();
      if (eng.lives < before) { hits++; if (firstHit < 0) firstHit = f; }
      if (eng.mode !== 'phase') break;
      let inBand = 0;
      for (let i = 0; i < eng.bn; i++) {
        if (eng.by[i] >= BAND_TOP - 20 && eng.by[i] <= FLOOR_Y + 12) inBand++;
      }
      bandMax = Math.max(bandMax, inBand);
    }
    console.log(
      `${id}  ${String(eng.stages[stage].phases[phase].dur).padStart(3)}s  ` +
      `${firstHit < 0 ? '  なし' : (firstHit / 60).toFixed(1) + 's'}  ` +
      `${String(hits).padStart(5)}  ${String(bandMax).padStart(8)}`
    );
  }
}
probe(0);
probe(3);
eng.destroy();
