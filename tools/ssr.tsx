// React の初期描画（タイトル画面）が例外なく通ることを確認する軽いチェック。
// 実行: npx esbuild tools/ssr.tsx --bundle --platform=node --format=esm \
//         --outfile=/tmp/ssr.mjs --log-level=warning && node /tmp/ssr.mjs
import { renderToString } from 'react-dom/server';
import DanmakuGame from '../src/DanmakuGame';

const g = globalThis as unknown as Record<string, unknown>;
g.window = { matchMedia: () => ({ matches: false }), addEventListener() { /* noop */ }, removeEventListener() { /* noop */ }, devicePixelRatio: 1 };
g.localStorage = { getItem: () => null, setItem() { /* noop */ }, removeItem() { /* noop */ } };

const html = renderToString(<DanmakuGame />);
console.log('SSR ok, length', html.length);
console.log(html.includes('✝本質✝') ? '✓ title rendered' : '✗ title missing');
console.log(html.includes('普通科') ? '✓ 普通科 rendered' : '✗ 普通科 missing');
console.log(html.includes('キー設定') ? '✓ キー設定ボタン rendered' : '✗ キー設定 missing');
