import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Maximize2, Volume2, VolumeX, Pause, Play, Lock, ChevronRight, RotateCcw, Home, Trophy, Check } from 'lucide-react';
import { Engine, type RunResult } from './game/engine';
import {
  DIFFS, STAGES, N_STAGES, W, H, SAVE_KEY, ENDING_LINES, KINDS,
  defaultProgress, isDiffUnlocked, type Progress, type KindId,
} from './game/data';

type Screen = 'title' | 'select' | 'playing' | 'paused' | 'result';

const DISPLAY: CSSProperties = { fontFamily: '"Dela Gothic One", "Hiragino Sans", sans-serif' };
const MINCHO: CSSProperties = { fontFamily: '"Shippori Mincho B1", "Hiragino Mincho ProN", "Yu Mincho", serif' };
const UI: CSSProperties = { fontFamily: '"Zen Kaku Gothic New", "Hiragino Sans", "Yu Gothic", sans-serif' };

function isNumArr(v: unknown, len: number): v is number[] {
  return Array.isArray(v) && v.length === len && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}
function num(v: unknown, d = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : d;
}

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultProgress();
    const p = JSON.parse(raw) as Partial<Progress>;
    const d = defaultProgress();
    return {
      reached: isNumArr(p.reached, 4) ? p.reached : d.reached,
      hi: isNumArr(p.hi, 4) ? p.hi : d.hi,
      clears: isNumArr(p.clears, 4) ? p.clears : d.clears,
      jumpHi: num(p.jumpHi),
      jumpBest: num(p.jumpBest),
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

function honshitsuHensachi(r: RunResult): number {
  const base = DIFFS[r.difficulty].hensachi - 12;
  const ratio = r.phasesCleared > 0 ? r.noMissPhases / r.phasesCleared : 0;
  const v = base + (r.phasesCleared / 20) * 14 + ratio * 10 - r.misses * 0.8 + Math.min(8, r.graze / 300) + (r.cleared ? 4 : 0);
  return Math.max(25, Math.min(99.9, v));
}

function fmtTime(frames: number): string {
  return (frames / 60).toFixed(1);
}

export default function DanmakuGame() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [screen, setScreen] = useState<Screen>('title');
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const progressRef = useRef<Progress>(progress);
  const [kind, setKind] = useState<KindId>('stage');
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
      onStageReached: (d, s) => {
        const cur = progressRef.current;
        if (cur.reached[d] >= s) return;
        const next: Progress = { ...cur, reached: [...cur.reached], hi: [...cur.hi], clears: [...cur.clears] };
        next.reached[d] = s;
        progressRef.current = next;
        saveProgress(next);
        setProgress(next);
      },
      onEnd: (r) => {
        const cur = progressRef.current;
        const next: Progress = { ...cur, reached: [...cur.reached], hi: [...cur.hi], clears: [...cur.clears] };
        if (r.kind === 'jump') {
          if (r.score > next.jumpHi) next.jumpHi = r.score;
          if (r.frames > next.jumpBest) next.jumpBest = r.frames;
        } else {
          if (r.score > next.hi[r.difficulty]) next.hi[r.difficulty] = r.score;
          if (r.cleared) {
            next.clears[r.difficulty]++;
            if (next.clears[r.difficulty] === 1 && r.difficulty + 1 < DIFFS.length) setNewUnlock(r.difficulty + 1);
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

  const startGame = useCallback((d: number) => {
    const eng = engineRef.current;
    if (!eng || !isDiffUnlocked(progressRef.current, d)) return;
    ensureAudio();
    eng.audio.select();
    setNewUnlock(-1);
    setResult(null);
    eng.startRun(d, progressRef.current.hi[d]);
    setScreen('playing');
  }, [ensureAudio]);

  const startJumpRun = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    ensureAudio();
    eng.audio.select();
    setNewUnlock(-1);
    setResult(null);
    eng.startJump(progressRef.current.jumpHi);
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
    if (result.kind === 'jump') startJumpRun();
    else startGame(result.difficulty);
  }, [result, startGame, startJumpRun]);

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

  const toggleKind = useCallback((k: KindId) => {
    engineRef.current?.audio.ui();
    setKind(k);
  }, []);

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
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
          e.preventDefault();
          if (kind !== 'stage') return;
          const dir = code === 'ArrowLeft' ? -1 : 1;
          let nd = selD + dir;
          while (nd >= 0 && nd < DIFFS.length && !isDiffUnlocked(progress, nd)) nd += dir;
          if (nd >= 0 && nd < DIFFS.length) {
            setSelD(nd);
            eng?.audio.ui();
          }
        } else if (code === 'ArrowUp' || code === 'ArrowDown') {
          e.preventDefault();
          toggleKind(kind === 'stage' ? 'jump' : 'stage');
        } else if (code === 'Enter' || code === 'KeyZ') {
          e.preventDefault();
          if (kind === 'stage') startGame(selD);
          else startJumpRun();
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
  }, [screen, selD, progress, kind, goSelect, startGame, startJumpRun, retry, toSelect, toggleKind]);

  const overlayStyle: CSSProperties = { width: size.w, height: size.h };
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
              <div className="mb-3 text-[10px] tracking-[0.4em] text-rose-200/60">桐葉高校 理数科 B組より</div>
              <div className="text-lg text-white/90 sm:text-2xl" style={MINCHO}>偏差値60の教室から</div>
              <div
                className="my-1 bg-gradient-to-b from-white via-rose-100 to-rose-400 bg-clip-text text-6xl leading-tight text-transparent drop-shadow-[0_0_24px_rgba(255,80,120,0.55)] sm:text-8xl"
                style={DISPLAY}
              >
                ✝本質✝
              </div>
              <div className="text-base text-white/90 sm:text-xl" style={MINCHO}>が漏れ出している件について</div>
              <div className="mt-4 text-[10px] tracking-[0.35em] text-amber-200/70 sm:text-xs">DANMAKU ／ ENDLESS JUMP</div>
              <button
                onClick={goSelect}
                className="group mt-10 flex items-center gap-2 rounded-sm border border-rose-300/60 bg-rose-900/40 px-8 py-3 text-sm tracking-[0.3em] text-white transition hover:bg-rose-700/60 hover:shadow-[0_0_30px_rgba(255,80,120,0.5)]"
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
                {KINDS.map((k) => {
                  const active = kind === k.id;
                  return (
                    <button
                      key={k.id}
                      onClick={() => toggleKind(k.id)}
                      className={`relative flex flex-col items-center rounded-sm border px-1 py-2 transition ${
                        active ? 'border-white/80 bg-white/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                      }`}
                    >
                      <span className="text-[9px] tracking-widest" style={{ color: k.color }}>{k.label}</span>
                      <span className="text-sm" style={MINCHO}>{k.name}</span>
                    </button>
                  );
                })}
              </div>

              {kind === 'stage' ? (
                <>
                  <div className="grid grid-cols-4 gap-1 px-3 pt-3">
                    {DIFFS.map((d) => {
                      const un = isDiffUnlocked(progress, d.id);
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
                            active && un ? 'border-white/80 bg-white/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/10'
                          } ${un ? '' : 'cursor-not-allowed opacity-35'}`}
                        >
                          <span className="text-[9px] tracking-widest" style={{ color: d.color }}>{d.label}</span>
                          <span className="text-sm" style={MINCHO}>{d.name}</span>
                          <span className="text-[9px] text-white/50">偏差値{d.hensachi}</span>
                          {!un && <Lock className="absolute right-1 top-1 h-3 w-3 text-white/60" />}
                          {progress.clears[d.id] > 0 && <Check className="absolute left-1 top-1 h-3 w-3 text-emerald-300" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-between px-4 pt-3 text-[10px] text-white/60">
                    <span style={MINCHO}>{diff.name} · 残機 {diff.lives} ／「は？」 {diff.bombs}</span>
                    <span className="font-mono tracking-wider text-white/50">STAGE 1 → FINAL</span>
                  </div>
                  <div className="px-4 pt-1 text-[10px] text-white/45">
                    到達 {progress.reached[selD] < 0 ? '—' : progress.reached[selD] >= N_STAGES ? 'FINAL' : `STAGE ${progress.reached[selD] + 1}`}
                    {progress.clears[selD] > 0 && <span className="ml-2 text-emerald-300">通しクリア {progress.clears[selD]}回</span>}
                  </div>
                  <div className="flex-1" />
                  <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
                    <div className="flex flex-col gap-0.5 text-[10px] text-white/55">
                      <span className="flex items-center gap-1"><Trophy className="h-3 w-3 text-amber-300" /> HI <span className="font-mono text-amber-200">{progress.hi[selD].toLocaleString()}</span></span>
                      <span className="text-white/40">←↑↓→ 移動 ／ Shift 低速 ／ X は？</span>
                    </div>
                    <button
                      onClick={() => startGame(selD)}
                      className="flex items-center gap-2 rounded-sm border px-6 py-2 text-xs tracking-[0.25em] transition hover:shadow-[0_0_24px_rgba(255,255,255,0.25)]"
                      style={{ ...DISPLAY, borderColor: diff.color, color: diff.color }}
                    >
                      開始 <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex-1 px-4 pt-6 text-center">
                    <div className="text-[10px] tracking-[0.35em] text-white/45">HI SCORE</div>
                    <div className="font-mono text-3xl text-amber-200">{progress.jumpHi.toLocaleString()}</div>
                    <div className="mt-5 text-[10px] tracking-[0.35em] text-white/45">最長生存</div>
                    <div className="font-mono text-2xl text-white/90">
                      {fmtTime(progress.jumpBest)}<span className="ml-1 text-xs text-white/50">秒</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
                    <span className="text-[10px] text-white/45">←→ 移動 ／ Space ジャンプ ／ X は？</span>
                    <button
                      onClick={startJumpRun}
                      className="flex items-center gap-2 rounded-sm border px-6 py-2 text-xs tracking-[0.25em] transition hover:shadow-[0_0_24px_rgba(255,255,255,0.25)]"
                      style={{ ...DISPLAY, borderColor: '#5eead4', color: '#5eead4' }}
                    >
                      開始 <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
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
              <button onClick={toSelect} className="flex w-44 items-center justify-center gap-2 rounded-sm border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">
                <RotateCcw className="h-4 w-4" /> モード選択へ
              </button>
              <button onClick={toTitle} className="flex w-44 items-center justify-center gap-2 rounded-sm border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">
                <Home className="h-4 w-4" /> タイトルへ
              </button>
            </div>
          )}

          {/* ── RESULT ──────────────────────────────────── */}
          {screen === 'result' && result && (
            <div className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-black/80 px-6 py-6 text-center backdrop-blur-[2px]">
              {result.kind === 'jump' ? (
                <>
                  <div className="text-[10px] tracking-[0.4em] text-teal-300/80">ENDLESS · 無限ジャンプ</div>
                  <div className="mt-1 text-4xl text-rose-300" style={DISPLAY}>は？</div>
                  <div className="mt-1 text-xs text-white/60" style={MINCHO}>GAME OVER — WAVE {result.wave + 1} で落ちた</div>
                  <div className="mt-4 grid w-full max-w-[260px] grid-cols-2 gap-x-4 gap-y-1 text-left text-xs">
                    <span className="text-white/50">SCORE</span>
                    <span className="text-right font-mono text-amber-200">{result.score.toLocaleString()}</span>
                    <span className="text-white/50">生存時間</span>
                    <span className="text-right font-mono">{fmtTime(result.frames)} 秒</span>
                    <span className="text-white/50">到達WAVE</span>
                    <span className="text-right font-mono">{result.wave + 1}</span>
                    <span className="text-white/50">GRAZE</span>
                    <span className="text-right font-mono">{result.graze}</span>
                    <span className="text-white/50">被弾 ／「は？」</span>
                    <span className="text-right font-mono">{result.misses} ／ {result.bombsUsed}</span>
                  </div>
                  <div className="mt-4 border-y border-white/10 py-2">
                    <div className="text-[10px] text-white/50">HI SCORE ／ 最長生存</div>
                    <div className="text-lg text-white" style={DISPLAY}>
                      <span className="font-mono text-amber-200">{progress.jumpHi.toLocaleString()}</span>
                      <span className="mx-2 text-white/30">／</span>
                      <span className="font-mono">{fmtTime(progress.jumpBest)} 秒</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[10px] tracking-[0.4em]" style={{ color: DIFFS[result.difficulty].color }}>
                    {DIFFS[result.difficulty].label} · {DIFFS[result.difficulty].name}
                  </div>
                  <div
                    className={`mt-1 text-4xl ${result.cleared ? 'bg-gradient-to-b from-white to-pink-300 bg-clip-text text-transparent' : 'text-rose-300'}`}
                    style={DISPLAY}
                  >
                    {result.cleared ? '✝完✝' : 'は？'}
                  </div>
                  <div className="mt-1 text-xs text-white/60" style={MINCHO}>
                    {result.cleared ? 'ALL CLEAR — 来年もある。' : `GAME OVER — ${STAGES[Math.min(result.stageReached, N_STAGES - 1)].boss}の✝本質✝に呑まれた`}
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
                    <span className="text-right">{result.cleared ? '全ステージ' : `STAGE ${result.stageReached + 1}`}</span>
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
                      難易度「{DIFFS[newUnlock].name}（偏差値{DIFFS[newUnlock].hensachi}）」解禁
                    </div>
                  )}
                </>
              )}
              <div className="mt-5 flex flex-col gap-2">
                <button onClick={retry} className="flex w-52 items-center justify-center gap-2 rounded-sm border border-white/60 py-2 text-sm hover:bg-white/10">
                  <RotateCcw className="h-4 w-4" />
                  {result.kind === 'jump' ? 'もう一度' : result.cleared ? 'もう一度最初から' : '最初から再挑戦'}
                </button>
                <button onClick={toSelect} className="flex w-52 items-center justify-center gap-2 rounded-sm border border-white/20 py-2 text-sm text-white/70 hover:bg-white/10">
                  <ChevronRight className="h-4 w-4" /> モード選択
                </button>
              </div>
            </div>
          )}

          {/* ── Touch controls ──────────────────────────── */}
          {isTouch && screen === 'playing' && kind === 'stage' && (
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
          {isTouch && screen === 'playing' && kind === 'jump' && (
            <>
              <div className="absolute bottom-9 left-3 flex gap-2">
                <button
                  onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setMoveDir(-1); }}
                  onPointerUp={() => engineRef.current?.setMoveDir(0)}
                  onPointerLeave={() => engineRef.current?.setMoveDir(0)}
                  onPointerCancel={() => engineRef.current?.setMoveDir(0)}
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/60 bg-black/40 text-2xl text-white active:scale-90"
                >
                  ◀
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); engineRef.current?.setMoveDir(1); }}
                  onPointerUp={() => engineRef.current?.setMoveDir(0)}
                  onPointerLeave={() => engineRef.current?.setMoveDir(0)}
                  onPointerCancel={() => engineRef.current?.setMoveDir(0)}
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/60 bg-black/40 text-2xl text-white active:scale-90"
                >
                  ▶
                </button>
              </div>
              <button
                onPointerDown={(e) => { e.preventDefault(); engineRef.current?.requestBomb(); }}
                className="absolute bottom-32 right-4 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/60 bg-rose-900/50 text-base text-white active:scale-90"
                style={DISPLAY}
              >
                は？
              </button>
              <button
                onPointerDown={(e) => { e.preventDefault(); engineRef.current?.jumpDown(true); }}
                onPointerUp={() => engineRef.current?.jumpDown(false)}
                onPointerLeave={() => engineRef.current?.jumpDown(false)}
                onPointerCancel={() => engineRef.current?.jumpDown(false)}
                className="absolute bottom-9 right-3 flex h-20 w-20 items-center justify-center rounded-full border-2 border-teal-200/80 bg-teal-900/40 text-2xl text-white active:scale-90"
                style={DISPLAY}
              >
                跳
              </button>
            </>
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
