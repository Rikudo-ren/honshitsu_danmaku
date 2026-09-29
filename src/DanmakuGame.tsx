import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Maximize2, Volume2, VolumeX, Pause, Play, Lock, ChevronRight, RotateCcw, Home, Trophy, Check, Keyboard } from 'lucide-react';
import { Engine, type RunResult } from './game/engine';
import {
  MODES, DIFFS, N_STAGES, N_STAGES_JUMP, STAGE_TABLES, W, H, SAVE_KEY, OLD_SAVE_KEY,
  ENDING_LINES_ALL, defaultProgress, isDiffUnlocked, modeCleared, stageLabel, levelOf,
  KEY_DEFS, defaultKeys, codeLabel, KEYS_SAVE_KEY,
  type ModeId, type Progress, type KeyMap, type KeyAction,
} from './game/data';

type Screen = 'title' | 'select' | 'playing' | 'paused' | 'result' | 'keys';

const DISPLAY: CSSProperties = { fontFamily: '"Dela Gothic One", "Hiragino Sans", sans-serif' };
const MINCHO: CSSProperties = { fontFamily: '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif' };
const UI: CSSProperties = { fontFamily: '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif' };

const N_STAGES_BY_MODE: readonly number[] = [N_STAGES, N_STAGES_JUMP];

/** 操作説明（いまのキー割り当てから生成。短く1行だけ） */
function controlLine(mode: number, keys: KeyMap): string {
  const k = (a: KeyAction): string => codeLabel(keys[a]);
  if (mode === 1) {
    return `移動 ${k('left')} ${k('right')}　ジャンプ ${k('jump')}　低速 ${k('focus')}　は？ ${k('bomb')}`;
  }
  return `移動 ${k('left')}${k('up')}${k('down')}${k('right')}　低速 ${k('focus')}　は？ ${k('bomb')}`;
}

function loadKeys(): KeyMap {
  const d = defaultKeys();
  try {
    const raw = localStorage.getItem(KEYS_SAVE_KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<KeyMap>;
    for (const def of KEY_DEFS) {
      const v = p[def.id];
      if (typeof v === 'string' && v.length > 0) d[def.id] = v;
    }
  } catch {
    /* 既定を使う */
  }
  return d;
}

function saveKeys(k: KeyMap): void {
  try {
    localStorage.setItem(KEYS_SAVE_KEY, JSON.stringify(k));
  } catch {
    /* ストレージ不可環境ではセッション内のみ保持 */
  }
}

function isNumArr(v: unknown, len: number): v is number[] {
  return Array.isArray(v) && v.length === len && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function loadProgress(): Progress {
  const d = defaultProgress();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      const stats = p.stats;
      const cleared = p.cleared;
      if (Array.isArray(stats) && Array.isArray(cleared)) {
        for (let m = 0; m < 2; m++) {
          for (let i = 0; i < 4; i++) {
            const s = stats[m]?.[i];
            if (s && Number.isFinite(s.reached) && Number.isFinite(s.hi) && Number.isFinite(s.clears)) {
              d.stats[m][i] = { reached: s.reached, hi: s.hi, clears: s.clears };
            }
            if (cleared[m]?.[i] === true) d.cleared[m][i] = true;
          }
        }
      }
      return d;
    }
    // v1（ステージ個別アンロック時代）からの引き継ぎ
    const old = localStorage.getItem(OLD_SAVE_KEY);
    if (old) {
      const p = JSON.parse(old) as { reached?: unknown; hi?: unknown; clears?: unknown };
      if (isNumArr(p.reached, 4) && isNumArr(p.hi, 4) && isNumArr(p.clears, 4)) {
        for (let i = 0; i < 4; i++) {
          d.stats[0][i] = {
            reached: Math.max(0, Math.min(N_STAGES, p.reached[i])),
            hi: p.hi[i] > 0 ? p.hi[i] : 0,
            clears: p.clears[i] > 0 ? p.clears[i] : 0,
          };
          d.cleared[0][i] = p.clears[i] > 0;
        }
      }
    }
  } catch {
    /* ストレージ不可環境ではセッション内のみ保持 */
  }
  return d;
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* 同上 */
  }
}

function honshitsuHensachi(r: RunResult): number {
  const base = DIFFS[r.difficulty].hensachi - 12;
  const ratio = r.phasesCleared > 0 ? r.noMissPhases / r.phasesCleared : 0;
  const total = N_STAGES_BY_MODE[r.mode] * 3;
  const v = base + (r.phasesCleared / total) * 18 + ratio * 10 - r.misses * 0.8 + Math.min(8, r.graze / 300) + (r.cleared ? 4 : 0);
  return Math.max(25, Math.min(99.9, v));
}

export default function DanmakuGame() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const progressRef = useRef<Progress>(progress);
  const [keys, setKeys] = useState<KeyMap>(loadKeys);
  const keysRef = useRef<KeyMap>(keys);
  const [selM, setSelM] = useState<ModeId>(0);
  const [selD, setSelD] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [newUnlock, setNewUnlock] = useState<{ m: number; d: number } | null>(null);
  const [muted, setMuted] = useState(false);
  const [binding, setBinding] = useState<KeyAction | null>(null);
  const [keysFrom, setKeysFrom] = useState<Screen>('title');
  const [size, setSize] = useState({ w: W, h: H });
  const [isTouch] = useState<boolean>(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);

  // キー割り当てを Engine に反映して保存（設定画面から変更されうる）
  useEffect(() => {
    engineRef.current?.setKeys(keys);
    saveKeys(keys);
  }, [keys]);

  // ── Engine 生成（一度だけ） ─────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const eng = new Engine(cv, {
      onStageReached: (m, d, s) => {
        const cur = progressRef.current;
        if (cur.stats[m][d].reached >= s) return;
        const next: Progress = {
          stats: cur.stats.map((row) => row.map((st) => ({ ...st }))),
          cleared: cur.cleared.map((row) => [...row]),
        };
        next.stats[m][d].reached = s;
        progressRef.current = next;
        saveProgress(next);
        setProgress(next);
      },
      onEnd: (r) => {
        const cur = progressRef.current;
        const next: Progress = {
          stats: cur.stats.map((row) => row.map((st) => ({ ...st }))),
          cleared: cur.cleared.map((row) => [...row]),
        };
        const st = next.stats[r.mode][r.difficulty];
        if (r.score > st.hi) st.hi = r.score;
        if (r.cleared) {
          st.clears++;
          if (!next.cleared[r.mode][r.difficulty]) {
            next.cleared[r.mode][r.difficulty] = true;
            if (r.difficulty + 1 < DIFFS.length) setNewUnlock({ m: r.mode, d: r.difficulty + 1 });
          }
        }
        progressRef.current = next;
        saveProgress(next);
        setProgress(next);
        setResult(r);
        setScreen('result');
      },
      onPause: (p) => setScreen(p ? 'paused' : 'playing'),
    });
    eng.setKeys(keysRef.current);
    engineRef.current = eng;
    return () => {
      eng.destroy();
      engineRef.current = null;
    };
  }, []);

  // ── レスポンシブ・フィット ───────────────────────────────
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const fit = (): void => {
      const r = wrap.getBoundingClientRect();
      const s = Math.min(r.width / W, r.height / H);
      const w = Math.max(160, Math.floor(W * s));
      const h = Math.max(213, Math.floor(H * s));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
      engineRef.current?.resize(w, h, Math.min(window.devicePixelRatio || 1, 2.5));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();
    return () => ro.disconnect();
  }, []);

  const ensureAudio = useCallback(() => {
    engineRef.current?.audio.init();
  }, []);

  const goSelect = useCallback(() => {
    ensureAudio();
    engineRef.current?.audio.ui();
    setScreen('select');
  }, [ensureAudio]);

  const startGame = useCallback((m: ModeId, d: number) => {
    const eng = engineRef.current;
    if (!eng || !isDiffUnlocked(progressRef.current, m, d)) return;
    ensureAudio();
    eng.audio.select();
    setNewUnlock(null);
    setResult(null);
    eng.startRun(m, d, progressRef.current.stats[m][d].hi);
    setScreen('playing');
  }, [ensureAudio]);

  const resume = useCallback(() => {
    engineRef.current?.setPaused(false);
    setScreen('playing');
  }, []);

  const toTitle = useCallback(() => {
    const eng = engineRef.current;
    if (eng) {
      eng.paused = false;
      eng.audio.resume();
      eng.toTitle();
    }
    setScreen('title');
  }, []);

  const toSelect = useCallback(() => {
    const eng = engineRef.current;
    if (eng) {
      eng.paused = false;
      eng.audio.resume();
      eng.toTitle();
    }
    setScreen('select');
  }, []);

  const retry = useCallback(() => {
    if (!result) return;
    startGame(result.mode, result.difficulty);
  }, [result, startGame]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nm = !m;
      engineRef.current?.audio.setMuted(nm);
      return nm;
    });
  }, []);

  const fullscreen = useCallback(() => {
    const el = document.documentElement;
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
  }, []);

  const requestPause = useCallback(() => {
    const eng = engineRef.current;
    if (!eng || screen !== 'playing') return;
    eng.setPaused(true);
    setScreen('paused');
  }, [screen]);

  const openKeys = useCallback((from: Screen) => {
    setKeysFrom(from);
    const eng = engineRef.current;
    if (eng) eng.inputLocked = true;
    setBinding(null);
    setScreen('keys');
    eng?.audio.ui();
  }, []);

  const closeKeys = useCallback(() => {
    const eng = engineRef.current;
    if (eng) eng.inputLocked = false;
    setBinding(null);
    setScreen(keysFrom);
  }, [keysFrom]);

  const resetKeys = useCallback(() => {
    setKeys(defaultKeys());
    setBinding(null);
    engineRef.current?.audio.ui();
  }, []);

  const switchMode = useCallback((m: ModeId) => {
    setSelM(m);
    setSelD((d) => (isDiffUnlocked(progressRef.current, m, d) ? d : 0));
    engineRef.current?.audio.ui();
  }, []);

  // ── キー設定：押されたキーをその操作に割り当てる ───────────
  useEffect(() => {
    if (screen !== 'keys' || binding === null) return;
    const onBind = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setBinding(null);
        return;
      }
      setKeys((prev) => {
        const next: KeyMap = { ...prev };
        // 同じキーを使っていた操作とは入れ替える（未割り当てを作らない）
        const other = (Object.keys(next) as KeyAction[]).find((a) => a !== binding && next[a] === e.code);
        if (other) next[other] = prev[binding];
        next[binding] = e.code;
        return next;
      });
      setBinding(null);
      engineRef.current?.audio.select();
    };
    window.addEventListener('keydown', onBind, true);
    return () => window.removeEventListener('keydown', onBind, true);
  }, [screen, binding]);

  // ── メニュー用キーボード操作 ─────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const code = e.code;
      if (screen === 'keys') {
        if (code === 'Escape' && binding === null) {
          e.preventDefault();
          closeKeys();
        }
        return;
      }
      if (screen === 'title') {
        if (code === 'Enter' || code === 'KeyZ' || code === 'Space') {
          e.preventDefault();
          goSelect();
        }
      } else if (screen === 'select') {
        const eng = engineRef.current;
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
          e.preventDefault();
          const dir = code === 'ArrowLeft' ? -1 : 1;
          let nd = selD + dir;
          while (nd >= 0 && nd < DIFFS.length && !isDiffUnlocked(progressRef.current, selM, nd)) nd += dir;
          if (nd >= 0 && nd < DIFFS.length) {
            setSelD(nd);
            eng?.audio.ui();
          }
        } else if (code === 'ArrowUp' || code === 'ArrowDown') {
          e.preventDefault();
          const dir = code === 'ArrowUp' ? -1 : 1;
          const nm = ((selM + dir) + MODES.length) % MODES.length;
          setSelD((d) => (isDiffUnlocked(progressRef.current, nm as ModeId, d) ? d : 0));
          setSelM(nm as ModeId);
          eng?.audio.ui();
        } else if (code === 'Enter' || code === 'KeyZ') {
          e.preventDefault();
          startGame(selM, selD);
        } else if (code === 'Escape' || code === 'KeyX') {
          setScreen('title');
        }
      } else if (screen === 'result') {
        if (code === 'Enter' || code === 'KeyZ') {
          e.preventDefault();
          retry();
        } else if (code === 'Escape' || code === 'KeyX') {
          toSelect();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen, selM, selD, progress, goSelect, startGame, retry, toSelect, binding, closeKeys]);

  const overlayStyle: CSSProperties = { width: size.w, height: size.h };
  const mode = MODES[selM];
  const diff = DIFFS[selD];

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#030308] text-white select-none" style={UI}>
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(ellipse at 50% 0%, rgba(125,15,42,0.35), transparent 55%), radial-gradient(ellipse at 50% 100%, rgba(80,60,200,0.18), transparent 60%)',
        }}
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[calc(50%-260px)] items-center justify-center lg:flex">
        <div className="text-[#ffffff08] text-[22vh] leading-none" style={{ ...DISPLAY, writingMode: 'vertical-rl' }}>
          ✝弾幕✝
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[calc(50%-260px)] items-center justify-center lg:flex">
        <div className="text-[#ffffff08] text-[9vh] leading-tight" style={{ ...MINCHO, writingMode: 'vertical-rl' }}>
          偏差値60の教室から弾幕が漏れ出してる件について
        </div>
      </div>

      <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center p-0 sm:p-3">
        <div className="relative shadow-[0_0_80px_rgba(255,45,85,0.15)] ring-1 ring-white/10" style={overlayStyle}>
          <canvas ref={canvasRef} className="block touch-none" style={{ width: size.w, height: size.h }} />

          {/* ── TITLE ───────────────────────────────────── */}
          {screen === 'title' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-black/30 via-black/55 to-black/80 px-5 text-center">
              <div className="mb-3 text-[10px] tracking-[0.4em] text-rose-200/60">桐葉高校 普通科 B組より</div>
              <div className="text-lg text-white/90 sm:text-2xl" style={MINCHO}>偏差値60の教室から</div>
              <div
                className="my-1 bg-gradient-to-b from-white via-rose-100 to-rose-400 bg-clip-text text-6xl leading-tight text-transparent drop-shadow-[0_0_24px_rgba(255,80,120,0.55)] sm:text-8xl"
                style={DISPLAY}
              >
                ✝弾幕✝
              </div>
              <div className="text-base text-white/90 sm:text-xl" style={MINCHO}>が漏れ出してる件について</div>
              <button
                onClick={goSelect}
                className="group mt-10 flex items-center gap-2 rounded-sm border border-rose-300/60 bg-rose-900/40 px-8 py-3 text-sm tracking-[0.3em] text-white transition hover:bg-rose-700/60 hover:shadow-[0_0_30px_rgba(255,80,120,0.5)]"
                style={DISPLAY}
              >
                START <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
              <div className="mt-2 animate-pulse text-[10px] tracking-widest text-white/40">PRESS ENTER / TAP</div>
              <button
                onClick={() => openKeys('title')}
                className="mt-4 rounded-sm border border-white/20 px-4 py-1.5 text-[11px] text-white/70 transition hover:bg-white/10"
              >
                キー設定
              </button>
            </div>
          )}

          {/* ── SELECT ──────────────────────────────────── */}
          {screen === 'select' && (
            <div className="absolute inset-0 flex flex-col bg-black/75 backdrop-blur-[2px]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <button onClick={() => setScreen('title')} className="text-[11px] text-white/50 hover:text-white">← タイトル</button>
                <div className="text-xs tracking-[0.3em] text-white/80" style={DISPLAY}>SELECT</div>
                <button onClick={() => openKeys('select')} className="text-[11px] text-white/50 hover:text-white">キー設定</button>
              </div>

              {/* モード選択 */}
              <div className="grid grid-cols-2 gap-2 px-3 pt-3">
                {MODES.map((m) => {
                  const active = selM === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => switchMode(m.id)}
                      className={`flex flex-col items-center rounded-sm border px-2 py-2 transition ${
                        active ? 'bg-white/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                      }`}
                      style={{ borderColor: active ? m.color : undefined }}
                    >
                      <span className="text-[9px] tracking-widest text-white/45">{m.sub}</span>
                      <span className="text-base" style={{ ...MINCHO, color: active ? m.color : undefined }}>{m.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* 難易度選択（1つ下を final まで通しでクリアで解禁） */}
              <div className="grid grid-cols-4 gap-1 px-3 pt-3">
                {DIFFS.map((d) => {
                  const un = isDiffUnlocked(progress, selM, d.id);
                  const active = selD === d.id;
                  return (
                    <button
                      key={d.id}
                      disabled={!un}
                      onClick={() => {
                        setSelD(d.id);
                        engineRef.current?.audio.ui();
                      }}
                      className={`relative flex flex-col items-center rounded-sm border px-1 py-2 transition ${
                        active ? 'border-white/80 bg-white/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                      } ${un ? '' : 'cursor-not-allowed opacity-35'}`}
                    >
                      <span className="text-[9px] tracking-widest" style={{ color: d.color }}>{d.label}</span>
                      <span className="text-sm" style={MINCHO}>{d.name}</span>
                      <span className="text-[9px] text-white/50">偏差値{d.hensachi}</span>
                      {!un && <Lock className="absolute right-1 top-1 h-3 w-3 text-white/60" />}
                      {progress.cleared[selM][d.id] && <Check className="absolute left-1 top-1 h-3 w-3 text-emerald-300" />}
                    </button>
                  );
                })}
              </div>

              {/* ステージ・フェーズ一覧 */}
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 py-1 text-[11px] leading-relaxed text-white/75" style={MINCHO}>
                <div className="mb-1.5 flex items-center justify-between text-[10px] text-white/50">
                  <span>
                    {mode.name}・{diff.name}（偏差値{diff.hensachi}）
                  </span>
                  <span>残機 {diff.lives} ／「は？」 {diff.bombs}</span>
                </div>
                <div className="space-y-2">
                  {STAGE_TABLES[selM].map((st, sIdx) => {
                    const sLabel = stageLabel(N_STAGES_BY_MODE[selM], sIdx);
                    return (
                      <div key={st.title} className="rounded-sm border border-white/10 bg-white/[0.02] p-2">
                        <div className="flex items-baseline justify-between border-b border-white/10 pb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] tracking-wider font-bold" style={{ color: st.color }}>
                              {sLabel}
                            </span>
                            <span className="text-xs text-white/90 font-medium">{st.boss}</span>
                            <span className="text-[10px] text-white/45">「{st.title}」</span>
                          </div>
                        </div>
                        <div className="mt-1 space-y-0.5">
                          {st.phases.map((ph, pIdx) => {
                            const lv = levelOf(selD, sIdx, pIdx, 0).toFixed(2);
                            return (
                              <div key={ph.id} className="flex items-center justify-between text-[10px] text-white/70">
                                <span className="truncate pr-2">
                                  <span className="text-white/40 mr-1">P{pIdx + 1}</span>
                                  {ph.name}
                                </span>
                                <span className="shrink-0 font-mono text-white/50">
                                  {ph.dur}秒<span className="mx-1 text-white/30">/</span>難易度 Lv.{lv}（偏差値{diff.hensachi}）
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-[10px] text-white/40">{controlLine(selM, keys)}</div>
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
                <div className="flex items-center gap-1 text-[10px] text-white/55">
                  <Trophy className="h-3 w-3 text-amber-300" />
                  HI <span className="font-mono text-amber-200">{progress.stats[selM][selD].hi.toLocaleString()}</span>
                  {modeCleared(progress, selM) && <span className="ml-1 text-emerald-300">CLEAR</span>}
                </div>
                <button
                  onClick={() => startGame(selM, selD)}
                  className="flex items-center gap-2 rounded-sm border px-6 py-2 text-xs tracking-[0.25em] transition hover:shadow-[0_0_24px_rgba(255,255,255,0.25)]"
                  style={{ ...DISPLAY, borderColor: diff.color, color: diff.color }}
                >
                  耐え抜く <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── KEYS ────────────────────────────────────── */}
          {screen === 'keys' && (
            <div className="absolute inset-0 flex flex-col bg-black/85 backdrop-blur-[2px]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <button onClick={closeKeys} className="text-[11px] text-white/50 hover:text-white">← 戻る</button>
                <div className="text-xs tracking-[0.3em] text-white/80" style={DISPLAY}>KEY CONFIG</div>
                <button onClick={resetKeys} className="text-[11px] text-white/50 hover:text-white">初期設定</button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                {KEY_DEFS.map((def) => {
                  const active = binding === def.id;
                  const used = def.modes.length > 0 && !def.modes.includes(selM);
                  return (
                    <button
                      key={def.id}
                      disabled={used}
                      onClick={() => {
                        setBinding(def.id);
                        engineRef.current?.audio.ui();
                      }}
                      className={`mb-1 flex w-full items-center justify-between gap-3 rounded-sm border px-3 py-2 text-left transition ${
                        active ? 'border-rose-300/80 bg-rose-900/30' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.07]'
                      } ${used ? 'opacity-35' : ''}`}
                    >
                      <span className="text-sm" style={MINCHO}>{def.label}</span>
                      <span className="shrink-0 font-mono text-sm text-amber-200">
                        {active ? '押してください…' : codeLabel(keys[def.id])}
                      </span>
                    </button>
                  );
                })}
                <div className="mt-2 px-1 text-[10px] leading-relaxed text-white/45">
                  灰色の操作は、いま選んでいるモードでは使いません。<br />
                  同じキーを割り当てると、もともと使っていた操作と入れ替わります。<br />
                  移動は WASD も常に効きます。
                </div>
              </div>
              <div className="flex justify-end border-t border-white/10 px-4 py-3">
                <button onClick={closeKeys} className="rounded-sm border border-white/40 px-6 py-2 text-xs tracking-[0.2em] hover:bg-white/10" style={DISPLAY}>
                  決定
                </button>
              </div>
            </div>
          )}

          {/* ── PAUSE ───────────────────────────────────── */}
          {screen === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
              <div className="text-3xl tracking-[0.3em]" style={DISPLAY}>PAUSE</div>
              <div className="mb-3 text-xs text-white/60" style={MINCHO}>「本質は、黙っているときに来る。」</div>
              <button onClick={resume} className="flex w-44 items-center justify-center gap-2 rounded-sm border border-white/50 py-2 text-sm hover:bg-white/10">
                <Play className="h-4 w-4" /> 再開
              </button>
              <button onClick={() => openKeys('paused')} className="flex w-44 items-center justify-center gap-2 rounded-sm border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">
                <Keyboard className="h-4 w-4" /> キー設定
              </button>
              <button onClick={toSelect} className="flex w-44 items-center justify-center gap-2 rounded-sm border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">
                <RotateCcw className="h-4 w-4" /> 難易度選択へ
              </button>
              <button onClick={toTitle} className="flex w-44 items-center justify-center gap-2 rounded-sm border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">
                <Home className="h-4 w-4" /> タイトルへ
              </button>
            </div>
          )}

          {/* ── RESULT ──────────────────────────────────── */}
          {screen === 'result' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-black/80 px-6 py-6 text-center backdrop-blur-[2px]">
              <div className="text-[10px] tracking-[0.4em]" style={{ color: MODES[result.mode].color }}>
                {MODES[result.mode].name} · {DIFFS[result.difficulty].label} {DIFFS[result.difficulty].name}
              </div>
              <div
                className={`mt-1 text-4xl ${result.cleared ? 'bg-gradient-to-b from-white to-pink-300 bg-clip-text text-transparent' : 'text-rose-300'}`}
                style={DISPLAY}
              >
                {result.cleared ? '✝完✝' : 'は？'}
              </div>
              <div className="mt-1 text-xs text-white/60" style={MINCHO}>
                {result.cleared
                  ? 'ALL CLEAR — 来年もある。'
                  : `GAME OVER — STAGE ${result.stageReached + 1}「${STAGE_TABLES[result.mode][result.stageReached].boss}」に呑まれた`}
              </div>
              {result.cleared && (
                <div className="mt-3 space-y-0.5 text-[11px] text-white/70" style={MINCHO}>
                  {ENDING_LINES_ALL[result.mode].map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid w-full max-w-[260px] grid-cols-2 gap-x-4 gap-y-1 text-left text-xs">
                <span className="text-white/50">SCORE</span>
                <span className="text-right font-mono text-amber-200">{result.score.toLocaleString()}</span>
                <span className="text-white/50">到達</span>
                <span className="text-right">
                  {result.cleared ? '全ステージ' : stageLabel(N_STAGES_BY_MODE[result.mode], Math.min(result.stageReached, N_STAGES_BY_MODE[result.mode] - 1))}
                </span>
                <span className="text-white/50">耐えたフェーズ</span>
                <span className="text-right font-mono">{result.phasesCleared}</span>
                <span className="text-white/50">ノーミス</span>
                <span className="text-right font-mono">{result.noMissPhases}</span>
                <span className="text-white/50">GRAZE</span>
                <span className="text-right font-mono">{result.graze}</span>
                <span className="text-white/50">被弾 ／「は？」</span>
                <span className="text-right font-mono">{result.misses} ／ {result.bombsUsed}</span>
              </div>
              <div className="mt-4 border-y border-white/10 py-2">
                <div className="text-[10px] text-white/50">あなたの✝本質✝偏差値</div>
                <div className="text-3xl text-white" style={DISPLAY}>{honshitsuHensachi(result).toFixed(1)}</div>
              </div>
              {newUnlock && (
                <div className="mt-3 rounded-sm border px-3 py-1.5 text-xs" style={{ borderColor: DIFFS[newUnlock.d].color, color: DIFFS[newUnlock.d].color }}>
                  難易度「{DIFFS[newUnlock.d].name}（偏差値{DIFFS[newUnlock.d].hensachi}）」解禁
                </div>
              )}
              <div className="mt-5 flex flex-col gap-2">
                <button onClick={retry} className="flex w-52 items-center justify-center gap-2 rounded-sm border border-white/60 py-2 text-sm hover:bg-white/10">
                  <RotateCcw className="h-4 w-4" /> もう一度ステージ1から
                </button>
                <button onClick={toSelect} className="flex w-52 items-center justify-center gap-2 rounded-sm border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">
                  <ChevronRight className="h-4 w-4" /> 難易度選択
                </button>
              </div>
            </div>
          )}

          {/* ── Touch bomb ──────────────────────────────── */}
          {isTouch && screen === 'playing' && (
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                engineRef.current?.requestBomb();
              }}
              className="absolute bottom-10 right-3 flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/70 bg-rose-900/50 text-xl text-white active:scale-90"
              style={DISPLAY}
            >
              は？
            </button>
          )}
        </div>
      </div>

      {/* ── Global controls ─────────────────────────────── */}
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        {screen === 'playing' && (
          <button onClick={requestPause} className="rounded-sm bg-black/50 p-2 text-white/70 ring-1 ring-white/10 hover:text-white" aria-label="pause">
            <Pause className="h-4 w-4" />
          </button>
        )}
        <button onClick={toggleMute} className="rounded-sm bg-black/50 p-2 text-white/70 ring-1 ring-white/10 hover:text-white" aria-label="mute">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <button onClick={fullscreen} className="rounded-sm bg-black/50 p-2 text-white/70 ring-1 ring-white/10 hover:text-white" aria-label="fullscreen">
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
