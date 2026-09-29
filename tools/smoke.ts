// ─────────────────────────────────────────────────────────────
//  Headless smoke test: 実 Engine をスタブ canvas 上で走らせ、
//  両モード × 全難易度の run が例外なく完走（または game over）することを確認する。
//  実行: npx esbuild tools/smoke.ts --bundle --platform=node --format=esm \
//          --outfile=/tmp/smoke.mjs --log-level=warning && node /tmp/smoke.mjs
// ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeCtx(): any {
  const grad = { addColorStop() { /* noop */ } };
  const base: any = {
    canvas: null,
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)),
      width: w,
      height: h,
    }),
    measureText: () => ({ width: 10 }),
    setTransform() {}, resetTransform() {},
  };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

function makeCanvas(w = 300, h = 150): any {
  const cv: any = {
    width: w,
    height: h,
    style: {},
    getContext: () => {
      const c = makeCtx();
      c.canvas = cv;
      return c;
    },
    addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: cv.width, height: cv.height, right: cv.width, bottom: cv.height }),
    toDataURL: () => 'data:image/png;base64,FAKEPNG',
  };
  return cv;
}

const g: any = globalThis;
g.document = {
  createElement: () => makeCanvas(),
  documentElement: makeCanvas(),
  body: { appendChild() {} },
  addEventListener() {}, removeEventListener() {},
};
g.window = {
  addEventListener() {}, removeEventListener() {},
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
};
let rafCb: ((ts: number) => void) | null = null;
g.requestAnimationFrame = (cb: (ts: number) => void): number => { rafCb = cb; return 1; };
g.cancelAnimationFrame = (): void => { /* noop */ };
g.performance = { now: () => 0 };
g.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
g.AudioContext = undefined;

const { Engine } = await import('../src/game/engine');

interface Outcome { mode: number; diff: number; ended: boolean; cleared: boolean; reached: number; frames: number; error: string; maxBullets: number; shots: string[] }

const outcomes: Outcome[] = [];

function simulate(mode: number, diff: number, maxFrames: number): Outcome {
  let result: any = null;
  let lastStage = 0;
  const shots: string[] = [];
  const eng: any = new Engine(makeCanvas(480, 640), {
    onStageReached: (_m: number, _d: number, s: number) => { lastStage = s; },
    onEnd: (r: any) => { result = r; },
    onPause: () => { /* noop */ },
    onClearShot: (shot: any) => {
      shots.push(`${shot?.label ?? '?'}/${typeof shot?.url}/${shot?.url ? shot.url.length : 0}`);
    },
  });
  eng.resize(480, 640, 1);
  let ts = 0;
  const out: Outcome = { mode, diff, ended: false, cleared: false, reached: 0, frames: 0, error: '', maxBullets: 0, shots: [] };
  try {
    eng.startRun(mode, diff, 0);
    for (let f = 0; f < maxFrames; f++) {
      ts += 1000 / 60;
      rafCb?.(ts);
      out.frames = f + 1;
      // 適当な入力を混ぜて分岐（移動・ジャンプ・ボム・ポーズ）を踏む
      if (f % 120 === 0) {
        eng.kL = !eng.kL;
        eng.kR = !eng.kR;
      }
      if (mode === 1) {
        // 地面がないモード：こまめに跳んで浮かび続ける
        if (f % 26 === 0) eng.onKeyDown({ code: 'Space', repeat: false, preventDefault() {} });
        if (f % 26 === 16) eng.onKeyUp({ code: 'Space', repeat: false, preventDefault() {} });
      } else if (f % 300 === 0) {
        eng.onKeyDown({ code: 'Space', repeat: false, preventDefault() {} });
        eng.onKeyUp({ code: 'Space', repeat: false, preventDefault() {} });
      }
      if (f % 900 === 0) {
        eng.onKeyDown({ code: 'KeyZ', repeat: false, preventDefault() {} });
      }
      if (f % 1500 === 0) {
        eng.onKeyDown({ code: 'Escape', repeat: false, preventDefault() {} });
        eng.onKeyDown({ code: 'Escape', repeat: false, preventDefault() {} });
      }
      if (eng.bn > out.maxBullets) out.maxBullets = eng.bn;
      if (result) break;
    }
    out.ended = !!result;
    out.cleared = !!result?.cleared;
    out.reached = result ? result.stageReached : lastStage;
  } catch (e) {
    out.error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  }
  eng.destroy();
  return out;
}

let fail = 0;
for (const mode of [0, 1]) {
  for (const diff of [0, 1, 2, 3]) {
    const o = simulate(mode, diff, 60 * 60 * 6); // 最大6分ぶん
    outcomes.push(o);
    const tag = `mode${mode} d${diff}`;
    if (o.error) {
      fail++;
      console.log(`✗ ${tag}: ERROR at frame ${o.frames}\n${o.error}`);
    } else if (o.maxBullets < 20) {
      fail++;
      console.log(`✗ ${tag}: 弾が出現していない (maxBullets=${o.maxBullets})`);
    } else if (o.ended) {
      const shotOk = o.shots.length >= o.reached;
      if (!shotOk) fail++;
      console.log(`✓ ${tag}: run終了 (cleared=${o.cleared} reached=${o.reached}, ${(o.frames / 60).toFixed(0)}s, maxBullets=${o.maxBullets})`);
      console.log(`  ${shotOk ? '✓' : '✗'} クリア画像 ${o.shots.length} 枚（ステージクリア ${o.reached} 回に対し${shotOk ? '十分' : '不足'}）${o.shots.length ? ` 最後:「${o.shots[o.shots.length - 1]}」` : ''}`);
    } else {
      console.log(`✓ ${tag}: 6分間クラッシュなし（未終了 reached=${o.reached}, maxBullets=${o.maxBullets}, クリア画像=${o.shots.length}枚）`);
    }
  }
}

// ── 無限ジャンプモード固有の挙動チェック ──────────────────────
//  1) 走り出す前は時間が止まっている（最初のジャンプで動き出す）
//  2) 地面がない：落ちると1機失って初期位置＋無敵時間で復帰する
{
  const eng: any = new Engine(makeCanvas(480, 640), { onStageReached() {}, onEnd() {}, onPause() {} });
  eng.resize(480, 640, 1);
  let ts = 0;
  const tick = (): void => { ts += 1000 / 60; rafCb?.(ts); };
  const space = (): void => {
    eng.onKeyDown({ code: 'Space', repeat: false, preventDefault() {} });
    eng.onKeyUp({ code: 'Space', repeat: false, preventDefault() {} });
  };

  eng.startRun(1, 0, 0);
  const modeT0 = eng.modeT;
  for (let f = 0; f < 120; f++) tick(); // 何も押さない
  const frozen = eng.modeT === modeT0 && eng.bn === 0;
  console.log(`${frozen ? '✓' : '✗'} ジャンプ待ち: 無入力の120フレームで modeT=${eng.modeT}（開始時 ${modeT0}）弾=${eng.bn}`);

  space();
  for (let f = 0; f < 30; f++) tick();
  const started = eng.modeT > modeT0;
  console.log(`${started ? '✓' : '✗'} 最初のジャンプで時間が動き出す: modeT=${eng.modeT}`);

  // ここから一切ジャンプしない → 重力で落ちてミスするはず
  const lives0 = eng.lives;
  const wasY = eng.plY;
  let fell = false;
  let invulnAfter = 0;
  let yAfter = 0;
  for (let f = 0; f < 60 * 10; f++) {
    tick();
    if (eng.lives < lives0) {
      fell = true;
      for (let g2 = 0; g2 < 3; g2++) tick();
      invulnAfter = eng.invuln;
      yAfter = eng.plY;
      break;
    }
  }
  console.log(`${fell ? '✓' : '✗'} 落下で1機失う: lives ${lives0} → ${eng.lives}（落下前 y=${wasY.toFixed(0)}）`);
  console.log(`${Math.abs(yAfter - (640 - 150)) < 2 ? '✓' : '✗'} 初期位置に復帰: y=${yAfter.toFixed(0)}（期待 ${640 - 150}）`);
  console.log(`${invulnAfter > 150 ? '✓' : '✗'} 無敵時間あり: invuln=${invulnAfter}`);

  // 無敵時間中に落ちても失わない（無敵が切れた後に落ちるのは正常）
  let lostDuringInvuln = false;
  let prevLives = eng.lives;
  for (let f = 0; f < 60 * 4; f++) {
    const invulnBefore = eng.invuln;
    tick();
    if (invulnBefore > 0 && eng.lives < prevLives) lostDuringInvuln = true;
    prevLives = eng.lives;
  }
  console.log(`${!lostDuringInvuln ? '✓' : '✗'} 無敵時間中の落下では失わない（4秒間の観測で lives=${eng.lives}）`);
  eng.destroy();
}


// ── キー割り当て：Shift が「は？」、X / Space は「は？」ではない ──
{
  const eng: any = new Engine(makeCanvas(480, 640), { onStageReached() {}, onEnd() {}, onPause() {} });
  eng.resize(480, 640, 1);
  let ts = 0;
  const tick = (): void => { ts += 1000 / 60; rafCb?.(ts); };
  eng.startRun(0, 0, 0);

  const tryBomb = (code: string): boolean => {
    while (eng.bombs > 0) {
      // 残りを減らして毎回満タンに見える状態に戻す
      const before = eng.bombs;
      eng.bombs = 3;
      eng.onKeyDown({ code, repeat: false, preventDefault() {} });
      for (let f = 0; f < 6; f++) tick();
      const used = eng.bombs < 3;
      eng.bombs = before;
      return used;
    }
    return false;
  };

  const zBombs = tryBomb('KeyZ');
  const xBombs = tryBomb('KeyX');
  const spaceBombs = tryBomb('Space');
  const shiftBombs = tryBomb('ShiftLeft');
  console.log(`${zBombs ? '✓' : '✗'} Z で「は？」が発動する`);
  console.log(`${!xBombs ? '✓' : '✗'} X は「は？」ではない`);
  console.log(`${!spaceBombs ? '✓' : '✗'} 回避弾幕で Space は「は？」ではない`);
  console.log(`${!shiftBombs ? '✓' : '✗'} Shift は「は？」ではない（低速専用）`);

  // Shift が低速（focus）— 入力は毎フレーム反映されるので数フレーム進めて見る
  eng.onKeyDown({ code: 'ShiftLeft', repeat: false, preventDefault() {} });
  for (let f = 0; f < 4; f++) tick();
  const focusOn = eng.focus;
  eng.onKeyUp({ code: 'ShiftLeft', repeat: false, preventDefault() {} });
  for (let f = 0; f < 4; f++) tick();
  const focusOff = eng.focus;
  console.log(`${focusOn && !focusOff ? '✓' : '✗'} Shift が低速（focus）: 押下=${focusOn} 離上=${focusOff}`);
  eng.destroy();
}

// ── キー割り当ての変更が実際に効くか ────────────────────────
{
  const { defaultKeys } = await import('../src/game/data');
  const eng: any = new Engine(makeCanvas(480, 640), { onStageReached() {}, onEnd() {}, onPause() {} });
  eng.resize(480, 640, 1);
  let ts = 0;
  const tick = (): void => { ts += 1000 / 60; rafCb?.(ts); };
  const press = (code: string): void => {
    eng.onKeyDown({ code, repeat: false, preventDefault() {} });
    eng.onKeyUp({ code, repeat: false, preventDefault() {} });
  };

  const d = defaultKeys();
  const okDefault = d.bomb === 'KeyZ' && d.focus === 'ShiftLeft' && d.jump === 'Space';
  console.log(`${okDefault ? '✓' : '✗'} 既定キー: は？=${d.bomb} 低速=${d.focus} ジャンプ=${d.jump}`);

  // 変更：は？→ KeyB、低速→ KeyN、左→ KeyJ
  eng.setKeys({ ...d, bomb: 'KeyB', focus: 'KeyN', left: 'KeyJ' });
  eng.startRun(0, 0, 0);

  eng.bombs = 3;
  press('KeyB');
  for (let f = 0; f < 6; f++) tick();
  const bombed = eng.bombs < 3;

  eng.bombs = 3;
  press('KeyZ');
  for (let f = 0; f < 6; f++) tick();
  const oldStillWorks = eng.bombs < 3;

  console.log(`${bombed ? '✓' : '✗'} 変更後のキー(KeyB)で「は？」が発動`);
  console.log(`${!oldStillWorks ? '✓' : '✗'} 変更前のキー(KeyZ)では発動しない`);

  eng.onKeyDown({ code: 'KeyN', repeat: false, preventDefault() {} });
  for (let f = 0; f < 4; f++) tick();
  const focusOn = eng.focus;
  eng.onKeyUp({ code: 'KeyN', repeat: false, preventDefault() {} });
  for (let f = 0; f < 2; f++) tick();
  console.log(`${focusOn ? '✓' : '✗'} 変更後のキー(KeyN)で低速`);

  const x0 = eng.plX;
  for (let f = 0; f < 20; f++) { eng.onKeyDown({ code: 'KeyJ', repeat: false, preventDefault() {} }); tick(); }
  eng.onKeyUp({ code: 'KeyJ', repeat: false, preventDefault() {} });
  console.log(`${eng.plX < x0 ? '✓' : '✗'} 変更後のキー(KeyJ)で左移動（x ${x0.toFixed(0)}→${eng.plX.toFixed(0)}）`);

  const x1 = eng.plX;
  for (let f = 0; f < 20; f++) { eng.onKeyDown({ code: 'KeyD', repeat: false, preventDefault() {} }); tick(); }
  eng.onKeyUp({ code: 'KeyD', repeat: false, preventDefault() {} });
  console.log(`${eng.plX > x1 ? '✓' : '✗'} WASD は常時有効（x ${x1.toFixed(0)}→${eng.plX.toFixed(0)}）`);

  eng.inputLocked = true;
  eng.bombs = 3;
  press('KeyB');
  for (let f = 0; f < 6; f++) tick();
  console.log(`${eng.bombs === 3 ? '✓' : '✗'} キー設定中（入力ロック）は発動しない`);
  eng.destroy();
}

// ── クリア画像（シェアカード）の検証 ──────────────────────
//  phaseT を毎フレーム埋めて全フェーズ即クリア → 最終ステージ → エンディングまで進め、
//  各ステージクリアでカード（stage）＋ ALL CLEAR カード（all）が出ることを確認する。
{
  const HENSACHI = [50, 60, 70, 85];
  const N_TABLE = [6, 5]; // N_STAGES / N_STAGES_JUMP

  function forceClearAll(mode: number, diff: number): any[] {
    const shots: any[] = [];
    let ended = false;
    const eng: any = new Engine(makeCanvas(480, 640), {
      onStageReached() { /* noop */ },
      onEnd() { ended = true; },
      onPause() { /* noop */ },
      onClearShot: (shot: any) => shots.push(shot),
    });
    eng.resize(480, 640, 1);
    let ts = 0;
    const space = (): void => {
      eng.onKeyDown({ code: 'Space', repeat: false, preventDefault() {} });
      eng.onKeyUp({ code: 'Space', repeat: false, preventDefault() {} });
    };
    eng.startRun(mode, diff, 0);
    let guard = 0;
    while (!ended && eng.mode !== 'over' && guard < 60 * 60 * 12) {
      guard++;
      ts += 1000 / 60;
      if (eng.mode === 'phase') eng.phaseT = eng.phaseDur; // フェーズを即クリア
      if (mode === 1) space(); // 無限ジャンプはジャンプし続けないと時間が止まる
      rafCb?.(ts);
    }
    eng.destroy();
    return shots;
  }

  console.log('\n── クリア画像（シェアカード） ──────────────────────');
  for (const [mode, diff] of [[0, 0], [1, 1]] as const) {
    const shots = forceClearAll(mode, diff);
    const nStage = N_TABLE[mode];
    const head = mode === 1 ? `偏差値${HENSACHI[diff]}の無限ジャンプクリア` : `偏差値${HENSACHI[diff]}クリア`;
    const okCount = shots.length === nStage + 1;
    const okHeads = shots.every((s) => s?.headline === head);
    const okUrl = shots.every((s) => typeof s?.url === 'string' && s.url.startsWith('data:image/png'));
    const okKinds = shots.filter((s) => s?.kind === 'stage').length === nStage && shots[shots.length - 1]?.kind === 'all';
    const okLabels = shots.every((s) => typeof s?.label === 'string' && s.label.includes(head));
    const pass = okCount && okHeads && okUrl && okKinds && okLabels;
    if (!pass) fail++;
    const last = shots[shots.length - 1];
    console.log(
      `${pass ? '✓' : '✗'} mode${mode} d${diff}: ${shots.length}枚（期待 ${nStage + 1}） `
      + `headline=「${shots[0]?.headline ?? 'なし'}」 label例=「${shots[0]?.label ?? 'なし'}」 最後=「${last?.label ?? 'なし'}」`,
    );
    if (!pass) {
      console.log(`   count=${okCount} heads=${okHeads} url=${okUrl} kinds=${okKinds} labels=${okLabels}`);
    }
  }
}

console.log(fail === 0 ? '\nSMOKE: OK' : `\nSMOKE: ${fail} failure(s)`);
if (fail > 0) process.exit(1);
