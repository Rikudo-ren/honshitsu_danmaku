import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Maximize2, Volume2, VolumeX, Pause, Play, Lock, ChevronRight, RotateCcw, Home, Trophy, Check } from 'lucide-react';
import { Engine, type RunResult } from './game/engine';
import {
  DIFFS, MODES, W, H, SAVE_KEY, SLOT, N_SLOTS, ENDING_LINES,
  defaultProgress, isDiffUnlocked, stagesOf, type Progress,
} from './game/data';

type Screen = 'title' | 'select' | 'playing' | 'paused' | 'result';

const DISPLAY: CSSProperties = { fontFamily: '"Dela Gothic One", "Hiragino Sans", sans-serif' };
const MINCHO: CSSProperties = { fontFamily: '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif' };
const UI: CSSProperties = { fontFamily: '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif' };

const MODE_KEYS: readonly string[] = ['矢印 / WASD　・　X「は？」', '← →　・　SPACE ジャンプ　・　X「は？」'];

function isNumArr(v: unknown, len: number): v is number[] {
  return Array.isArray(v) && v.length === len && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultProgress();
    const p = JSON.parse(raw) as Partial<Progress>;
    const d = defaultProgress();
    return {
      hi: isNumArr(p.hi, N_SLOTS) ? p.hi : d.hi,
      clears: isNumArr(p.clears, N_SLOTS) ? p.clears : d.clears,
    };
  } catch {
    return defaultProgress();
  }
}

function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(p));
  } catch {
    /* ストレージ不可環境ではセッション内のみ保持 */
  }
}

function totalPhases(mode: number): number {
  return stagesOf(mode).reduce((a, s) => a + s.phases.length, 0);
}

function honshitsuHensachi(r: RunResult): number {
  const base = DIFFS[r.difficulty].hensachi - 12;
  const all = totalPhases(r.ruleMode);
  const ratio = r.phasesCleared > 0 ? r.noMissPhases / r.phasesCleared : 0;
  const v =
    base + (r.phasesCleared / all) * 14 + ratio * 10 - r.misses * 0.8 + Math.min(8, r.graze / 300) + (r.cleared ? 4 : 0);
  return Math.max(25, Math.min(99.9, v));
}

export default function DanmakuGame() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const progressRef = useRef<Progress>(progress);
  const [selM, setSelM] = useState(0);
  const [selD, setSelD] = useState(0);
  const [result, setResult] = useState<RunResult | null>(null);
  const [newUnlock, setNewUnlock] = useState(-1);
  const [muted, setMuted] = useState(false);
  const [size, setSize] = useState({ w: W, h: H });
  const [isTouch] = useState<boolean>(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  // ── Engine 生成（一度だけ） ─────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const eng = new Engine(cv, {
      onEnd: (r) => {
        const cur = progressRef.current;
        const slot = SLOT(r.ruleMode, r.difficulty);
        const next: Progress = { hi: [...cur.hi], clears: [...cur.clears] };
        if (r.score > next.hi[slot]) next.hi[slot] = r.score;
        if (r.cleared) {
          next.clears[slot]++;
          if (r.difficulty + 1 < DIFFS.length && !isDiffUnlocked(cur, r.ruleMode, r.difficulty + 1)) setNewUnlock(r.difficulty + 1);
        }
        progressRef.current = next;
        saveProgress(next);
        setProgress(next);
        setResult(r);
        setScreen('result');
      },
      onPause: (p) => setScreen(p ? 'paused' : 'playing'),
    });
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

  /** 通しプレイ：STAGE 1 から FINAL まで一気に */
  const startGame = useCallback((m: number, d: number) => {
    const eng = engineRef.current;
    if (!eng || !isDiffUnlocked(progressRef.current, m, d)) return;
    ensureAudio();
    eng.audio.select();
    setNewUnlock(-1);
    setResult(null);
    eng.startRun(m, d, progressRef.current.hi[SLOT(m, d)]);
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
    startGame(result.ruleMode, result.difficulty);
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

  // ── メニュー用キーボード操作 ─────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const code = e.code;
      if (screen === 'title') {
        if (code === 'Enter' || code === 'KeyZ' || code === 'Space') {
          e.preventDefault();
          goSelect();
        }
      } else if (screen === 'select') {
        const eng = engineRef.current;
        if (code === 'ArrowUp' || code === 'ArrowDown') {
          e.preventDefault();
          const nm = selM + (code === 'ArrowUp' ? -1 : 1);
          if (nm >= 0 && nm < MODES.length) {
            setSelM(nm);
            eng?.audio.ui();
          }
        } else if (code === 'ArrowLeft' || code === 'ArrowRight') {
          e.preventDefault();
          const dir = code === 'ArrowLeft' ? -1 : 1;
          let nd = selD + dir;
          while (nd >= 0 && nd < DIFFS.length && !isDiffUnlocked(progress, selM, nd)) nd += dir;
          if (nd >= 0 && nd < DIFFS.length) {
            setSelD(nd);
            eng?.audio.ui();
          }
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
  }, [screen, selM, selD, progress, goSelect, startGame, retry, toSelect]);

  const overlayStyle: CSSProperties = { width: size.w, height: size.h };
  const diff = DIFFS[selD];
  const mode = MODES[selM];
  const slot = SLOT(selM, selD);
  const stages = stagesOf(selM);

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
          ✝本質✝
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[calc(50%-260px)] items-center justify-center lg:flex">
        <div className="text-[#ffffff08] text-[9vh] leading-tight" style={{ ...MINCHO, writingMode: 'vertical-rl' }}>
          偏差値60の教室から漏れ出している
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
                ✝本質✝
              </div>
              <div className="text-base text-white/90 sm:text-xl" style={MINCHO}>が漏れ出している件について</div>
              <div className="mt-4 text-[10px] tracking-[0.35em] text-amber-200/70 sm:text-xs">DANMAKU EVASION — 回避専用弾幕</div>
              <p className="mt-5 text-xs leading-relaxed text-white/70 sm:text-sm" style={MINCHO}>
                君は<span className="text-rose-300">三重県臣</span>。否定の守護者。<br />
                撃つな。避けろ。耐え抜け。
              </p>
              <button
                onClick={goSelect}
                className="group mt-7 flex items-center gap-2 rounded-sm border border-rose-300/60 bg-rose-900/40 px-8 py-3 text-sm tracking-[0.3em] text-white transition hover:bg-rose-700/60 hover:shadow-[0_0_30px_rgba(255,80,120,0.5)]"
                style={DISPLAY}
              >
                START <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
              <div className="mt-2 animate-pulse text-[10px] tracking-widest text-white/40">PRESS ENTER / TAP</div>
            </div>
          )}

          {/* ── SELECT ──────────────────────────────────── */}
          {screen === 'select' && (
            <div className="absolute inset-0 flex flex-col bg-black/75 backdrop-blur-[2px]">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <button onClick={() => setScreen('title')} className="text-[11px] text-white/50 hover:text-white">← タイトル</button>
                <div className="text-xs tracking-[0.3em] text-white/80" style={DISPLAY}>SELECT</div>
                <div className="w-12" />
              </div>

              {/* モード */}
              <div className="grid grid-cols-2 gap-1 px-3 pt-3">
                {MODES.map((m) => {
                  const active = selM === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => {
                        setSelM(m.id);
                        engineRef.current?.audio.ui();
                      }}
                      className={`flex flex-col items-center rounded-sm border px-1 py-2 transition ${
                        active ? 'border-white/80 bg-white/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                      }`}
                    >
                      <span className="text-[9px] tracking-widest" style={{ color: m.color }}>{m.label}</span>
                      <span className="text-sm" style={MINCHO}>{m.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* 偏差値 */}
              <div className="grid grid-cols-4 gap-1 px-3 pt-2">
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
                      {progress.clears[SLOT(selM, d.id)] > 0 && <Check className="absolute left-1 top-1 h-3 w-3 text-emerald-300" />}
                    </button>
                  );
                })}
              </div>

              <div className="px-4 pt-2 text-[10px] leading-relaxed text-white/55" style={MINCHO}>
                {diff.desc}
                <span className="ml-2 text-white/35">{MODE_KEYS[selM]}</span>
              </div>

              {/* 通しの構成 */}
              <div className="mt-2 flex-1 overflow-y-auto px-3 pb-2">
                <div className="mb-1 px-1 text-[9px] tracking-[0.25em] text-white/40">
                  STAGE 1 → FINAL ・ 残機 {diff.lives} ・ 「は？」 {diff.bombs}
                </div>
                {stages.map((st, s) => (
                  <div
                    key={s}
                    className="mb-1 flex w-full items-center gap-3 rounded-sm border border-white/10 bg-white/[0.02] px-3 py-2"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-lg"
                      style={{ ...DISPLAY, borderColor: st.color, color: st.color }}
                    >
                      {st.glyph}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] tracking-widest text-white/45">
                        {s === stages.length - 1 ? 'FINAL' : `STAGE ${s + 1}`}
                      </div>
                      <div className="truncate text-sm" style={MINCHO}>{st.title}</div>
                      <div className="text-[10px] text-white/45">{st.boss}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
                <div className="flex items-center gap-1 text-[10px] text-white/55">
                  <Trophy className="h-3 w-3 text-amber-300" />
                  HI <span className="font-mono text-amber-200">{progress.hi[slot].toLocaleString()}</span>
                </div>
                <button
                  onClick={() => startGame(selM, selD)}
                  className="flex items-center gap-2 rounded-sm border px-6 py-2 text-xs tracking-[0.25em] transition hover:shadow-[0_0_24px_rgba(255,255,255,0.25)]"
                  style={{ ...DISPLAY, borderColor: mode.color, color: mode.color }}
                >
                  耐え抜く <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── PAUSE ───────────────────────────────────── */}
          {screen === 'paused' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm">
              <div className="text-3xl tracking-[0.3em]" style={DISPLAY}>PAUSE</div>
              <button onClick={resume} className="mt-2 flex w-44 items-center justify-center gap-2 rounded-sm border border-white/50 py-2 text-sm hover:bg-white/10">
                <Play className="h-4 w-4" /> 再開
              </button>
              <button onClick={toTitle} className="flex w-44 items-center justify-center gap-2 rounded-sm border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">
                <Home className="h-4 w-4" /> やめる
              </button>
            </div>
          )}

          {/* ── RESULT ──────────────────────────────────── */}
          {screen === 'result' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-black/80 px-6 py-6 text-center backdrop-blur-[2px]">
              <div className="text-[10px] tracking-[0.4em]" style={{ color: MODES[result.ruleMode].color }}>
                {MODES[result.ruleMode].name} · {DIFFS[result.difficulty].label} · {DIFFS[result.difficulty].name}
              </div>
              <div
                className={`mt-1 text-4xl ${result.cleared ? 'bg-gradient-to-b from-white to-pink-300 bg-clip-text text-transparent' : 'text-rose-300'}`}
                style={DISPLAY}
              >
                {result.cleared ? '✝完✝' : 'は？'}
              </div>
              <div className="mt-1 text-xs text-white/60" style={MINCHO}>
                {result.cleared ? 'ALL CLEAR — 来年もある。' : `GAME OVER — ${stagesOf(result.ruleMode)[result.stageReached].boss}の✝本質✝に呑まれた`}
              </div>
              {result.cleared && (
                <div className="mt-3 space-y-0.5 text-[11px] text-white/70" style={MINCHO}>
                  {ENDING_LINES.map((l) => (
                    <div key={l}>{l}</div>
                  ))}
                </div>
              )}
              <div className="mt-4 grid w-full max-w-[260px] grid-cols-2 gap-x-4 gap-y-1 text-left text-xs">
                <span className="text-white/50">SCORE</span>
                <span className="text-right font-mono text-amber-200">{result.score.toLocaleString()}</span>
                <span className="text-white/50">到達</span>
                <span className="text-right">{result.cleared ? 'FINAL' : `STAGE ${result.stageReached + 1}`}</span>
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
              {newUnlock >= 0 && (
                <div className="mt-3 rounded-sm border px-3 py-1.5 text-xs" style={{ borderColor: DIFFS[newUnlock].color, color: DIFFS[newUnlock].color }}>
                  偏差値{DIFFS[newUnlock].hensachi}「{DIFFS[newUnlock].name}」解禁
                </div>
              )}
              <div className="mt-5 flex flex-col gap-2">
                <button onClick={retry} className="flex w-52 items-center justify-center gap-2 rounded-sm border border-white/60 py-2 text-sm hover:bg-white/10">
                  <RotateCcw className="h-4 w-4" />
                  STAGE 1 から
                </button>
                <button onClick={toSelect} className="flex w-52 items-center justify-center gap-2 rounded-sm border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">
                  <ChevronRight className="h-4 w-4" /> 選択
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
