// 最小 DOM スタブ（Engine を Node 上で駆動するため）
const gradient = { addColorStop() {} };
const CTX_METHODS = [
  'fillRect','clearRect','strokeRect','drawImage','beginPath','closePath','moveTo','lineTo','arc','arcTo',
  'ellipse','quadraticCurveTo','bezierCurveTo','fill','stroke','save','restore','translate','scale','rotate',
  'setTransform','transform','clip','rect','fillText','strokeText','setLineDash','putImageData',
];
function makeCtx(canvas) {
  const ctx = { canvas };
  for (const m of CTX_METHODS) ctx[m] = () => {};
  ctx.measureText = (s) => ({ width: String(s).length * 8 });
  ctx.createLinearGradient = () => gradient;
  ctx.createRadialGradient = () => gradient;
  ctx.createPattern = () => null;
  ctx.getImageData = (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h });
  return ctx;
}
export function makeCanvas(w = 480, h = 640) {
  const canvas = {
    width: w, height: h,
    style: {},
    getContext: () => makeCtx(canvas),
    addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, getBoundingClientRect: () => ({ width: w, height: h, left: 0, top: 0 }),
  };
  return canvas;
}
export function installDom() {
  globalThis.window = {
    addEventListener() {}, removeEventListener() {},
    matchMedia: () => ({ matches: false }),
    devicePixelRatio: 1,
  };
  globalThis.document = {
    createElement: (t) => (t === 'canvas' ? makeCanvas(1, 1) : { style: {} }),
    addEventListener() {}, removeEventListener() {},
    hidden: false,
    documentElement: {},
  };
  globalThis.requestAnimationFrame = () => 0;   // ループは回さない（step を手で回す）
  globalThis.cancelAnimationFrame = () => {};
}
