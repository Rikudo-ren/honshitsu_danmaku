// ─────────────────────────────────────────────────────────────
//  クリア画像（シェアカード）のオフスクリーン描画プレビュー。
//  実 Engine を @napi-rs/canvas 上で走らせ、全ステージ＋ALL CLEAR の
//  クリアカードを PNG として書き出す。視覚確認用ツール。
//  実行: npx esbuild tools/clearshot.ts --bundle --platform=node --format=esm \
//          --outfile=/tmp/clearshot.mjs --log-level=warning && node /tmp/clearshot.mjs <outDir>
// ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] ?? '/home/user/preview';
mkdirSync(OUT, { recursive: true });

// ゲームが使う Web フォントを登録（無ければフォールバック表示になる）
// ※ google/fonts の Dela Gothic One はラテン字のみのサブセットのため、
//   プレビューでは Zen Kaku Gothic New Black を代用登録する（実ブラウザでは
//   Google Fonts が日本語サブセットを供給するので本番では Dela で描画される）。
try {
  GlobalFonts.registerFromPath('/tmp/fonts/ZenKakuGothicNew-Black.ttf', 'Dela Gothic One');
  GlobalFonts.registerFromPath('/tmp/fonts/ShipporiMinchoB1-Regular.ttf', 'Shippori Mincho B1');
  GlobalFonts.registerFromPath('/tmp/fonts/ShipporiMinchoB1-Bold.ttf', 'Shippori Mincho B1');
  GlobalFonts.registerFromPath('/tmp/fonts/ZenKakuGothicNew-Regular.ttf', 'Zen Kaku Gothic New');
  GlobalFonts.registerFromPath('/tmp/fonts/ZenKakuGothicNew-Bold.ttf', 'Zen Kaku Gothic New');
} catch (e) {
  console.log('font register failed (fallback fonts will be used):', e);
}

function shimCanvas(cv: any): any {
  cv.style = {};
  cv.addEventListener = () => undefined;
  cv.removeEventListener = () => undefined;
  cv.setPointerCapture = () => undefined;
  cv.releasePointerCapture = () => undefined;
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: cv.width, height: cv.height, right: cv.width, bottom: cv.height });
  return cv;
}

const g: any = globalThis;
g.document = {
  createElement: () => shimCanvas(createCanvas(300, 150)),
  createElementNS: (_ns: string, tag: string) => (tag === 'canvas' ? shimCanvas(createCanvas(300, 150)) : {}),
  documentElement: shimCanvas(createCanvas(480, 640)),
  body: { appendChild() { /* noop */ } },
  addEventListener() { /* noop */ },
  removeEventListener() { /* noop */ },
  fonts: { check: () => true },
};
g.window = {
  addEventListener() { /* noop */ },
  removeEventListener() { /* noop */ },
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
};
let rafCb: ((ts: number) => void) | null = null;
g.requestAnimationFrame = (cb: (ts: number) => void): number => { rafCb = cb; return 1; };
g.cancelAnimationFrame = (): void => { rafCb = null; };
g.performance = { now: () => 0 };
g.localStorage = { getItem: () => null, setItem() { /* noop */ }, removeItem() { /* noop */ } };

const { Engine } = await import('../src/game/engine');

async function forceClearAll(mode: number, diff: number, tag: string): Promise<void> {
  const shots: any[] = [];
  let ended = false;
  const cv: any = shimCanvas(createCanvas(480, 640));
  const eng: any = new Engine(cv, {
    onStageReached() { /* noop */ },
    onEnd() { ended = true; },
    onPause() { /* noop */ },
    onClearShot: (shot: any) => shots.push(shot),
  });
  eng.resize(480, 640, 1);
  let ts = 0;
  let guard = 0;
  eng.startRun(mode, diff, 0);
  const space = (): void => {
    eng.onKeyDown({ code: 'Space', repeat: false, preventDefault() {} });
    eng.onKeyUp({ code: 'Space', repeat: false, preventDefault() {} });
  };
  while (!ended && eng.mode !== 'over' && guard < 60 * 60 * 12) {
    guard++;
    ts += 1000 / 60;
    if (eng.mode === 'phase') eng.phaseT = eng.phaseDur; // フェーズを即クリアして進める
    if (mode === 1) space();
    rafCb?.(ts);
  }
  eng.destroy();
  console.log(`${tag}: ${shots.length} 枚生成`);
  let i = 1;
  for (const s of shots) {
    const b64 = String(s.url).split(',')[1] ?? '';
    if (!b64) {
      console.log(`  ✗ shot ${i}: url なし`);
      i++;
      continue;
    }
    const file = join(OUT, `${tag}-${String(i).padStart(2, '0')}-${s.kind}.png`);
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, Buffer.from(b64, 'base64'));
    console.log(`  ✓ ${file} 「${s.label}」`);
    i++;
  }
}

await forceClearAll(0, 0, 'mode0-d0'); // 回避弾幕・普通科（偏差値50）
await forceClearAll(1, 1, 'mode1-d1'); // 無限ジャンプ・理数科（偏差値60）
console.log('done');
