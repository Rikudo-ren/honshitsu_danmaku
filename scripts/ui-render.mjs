// React 側を実際にマウントして、タイトル→選択画面の遷移と表示内容を確認する
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom に canvas 2D がないので、ヘッドレステストと同じスタブを差し込む
const { makeCanvas } = await import('./dom-stub.mjs');
const stubCtx = makeCanvas(1, 1).getContext('2d');
dom.window.HTMLCanvasElement.prototype.getContext = () => stubCtx;

const { build } = await import('esbuild');
await build({
  entryPoints: ['scripts/ui-entry.tsx'], bundle: true, format: 'esm', platform: 'node',
  outfile: 'node_modules/.cache/ui-entry.mjs', logLevel: 'warning',
  jsx: 'automatic',
  external: ['react', 'react-dom', 'react-dom/client', 'jsdom', 'lucide-react'],
});
const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const mod = await import('../node_modules/.cache/ui-entry.mjs');

const host = document.getElementById('root');
const root = createRoot(host);
let bad = 0;
const check = (cond, msg) => { if (!cond) { bad++; console.log('  FAIL:', msg); } else console.log('  ok  :', msg); };

await act(async () => { root.render(React.createElement(mod.default)); });
const text = () => host.textContent;
check(text().includes('✝本質✝'), 'タイトル：✝本質✝');
check(text().includes('桐葉高校 普通科 B組より'), 'タイトル：普通科');
check(!text().includes('北棟'), '「北棟」は残っていない');
check(!text().includes('矢印 / WASD'), 'タイトルに操作説明の一覧がない');

// START
const startBtn = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('START'));
await act(async () => { startBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
check(text().includes('回避弾幕') && text().includes('無限ジャンプ'), '選択画面：2モードが並ぶ');
check(text().includes('普通科') && text().includes('理数科') && text().includes('内進') && text().includes('数理零'), '選択画面：4つの偏差値');
check(text().includes('残機 5') && text().includes('「は？」 5'), '選択画面：残機5／「は？」5');
check(text().includes('STAGE 1 → FINAL'), '選択画面：通しプレイ表記');
check(!text().includes('前のステージを耐え抜くと解禁'), '解禁の補足説明はない');

// 無限ジャンプモードを選ぶとステージ一覧が入れ替わる
const jumpBtn = [...host.querySelectorAll('button')].find((b) => b.textContent.includes('無限ジャンプ'));
await act(async () => { jumpBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
check(text().includes('半歩ずれる') && text().includes('冷笑'), '無限ジャンプ：専用ステージ一覧（伊豆見〜三重）');
check(text().includes('SPACE ジャンプ'), '無限ジャンプ：操作行');
check(!text().includes('✝本質✝の発生'), '回避弾幕のステージは混ざらない');

// 難易度ロック
const locked = [...host.querySelectorAll('button')].filter((b) => b.disabled).length;
check(locked === 3, `未解禁の偏差値は3つロック（実際 ${locked}）`);

await act(async () => { root.unmount(); });
console.log(bad === 0 ? '\nUI ALL PASS' : `\nUI ${bad} FAILED`);
process.exit(bad ? 1 : 0);
