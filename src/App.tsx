import { useEffect, useRef, useState } from "react";

// ✝本質✝ — a self-contained Canvas game. React only handles menu transitions.
const W = 480;
const H = 720;
const TAU = Math.PI * 2;
const BULLET_MAX = 2200;
const SHOT_MAX = 240;
const PARTICLE_MAX = 750;
const ENEMY_MAX = 32;
const STAGES = [
  { name: "北棟の国境", chapter: "01 / THE BORDER", quote: "境界線は、見えないところにある。", color: "#58d9f5", speed: 1.65, interval: 82, count: 7, hp: 270, duration: 990 },
  { name: "味噌の断層", chapter: "02 / THE FAULT", quote: "朝飯は、何億年前の地面が決めた。", color: "#f7ba73", speed: 1.92, interval: 70, count: 9, hp: 340, duration: 1080 },
  { name: "翠湖、十キロ", chapter: "03 / THE LAKE", quote: "見えないけど、そこにある。", color: "#8ff0c4", speed: 2.19, interval: 59, count: 11, hp: 420, duration: 1170 },
  { name: "地面は忘れない", chapter: "04 / THE EARTH", quote: "地図が追いつかない地面に立つ。", color: "#c6a3ff", speed: 2.46, interval: 50, count: 13, hp: 510, duration: 1260 },
  { name: "✝本質✝の向こう", chapter: "05 / THE ESSENCE", quote: "答えが出た瞬間、それは本質ではない。", color: "#ff87b4", speed: 2.73, interval: 42, count: 15, hp: 620, duration: 1350 },
] as const;

type Screen = "title" | "playing" | "paused" | "clear" | "dead" | "ending";
type Hud = { stage: number; score: number; lives: number; bombs: number; graze: number };
type Overlay = { screen: Screen; stage: number; score: number; graze: number };

function clamp(v: number, min: number, max: number): number { return v < min ? min : v > max ? max : v; }

class Pool {
  readonly active: Uint8Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly kind: Uint8Array;
  readonly size: Float32Array;
  readonly extra: Float32Array;
  private cursor = 0;
  readonly length: number;
  constructor(length: number) {
    this.length = length;
    this.active = new Uint8Array(length);
    this.x = new Float32Array(length); this.y = new Float32Array(length);
    this.vx = new Float32Array(length); this.vy = new Float32Array(length);
    this.age = new Float32Array(length); this.life = new Float32Array(length);
    this.kind = new Uint8Array(length); this.size = new Float32Array(length);
    this.extra = new Float32Array(length);
  }
  add(x: number, y: number, vx: number, vy: number, size: number, kind: number, life = 999, extra = 0): number {
    for (let k = 0; k < this.length; k++) {
      const i = (this.cursor + k) % this.length;
      if (this.active[i]) continue;
      this.cursor = (i + 1) % this.length;
      this.active[i] = 1; this.x[i] = x; this.y[i] = y;
      this.vx[i] = vx; this.vy[i] = vy; this.size[i] = size;
      this.kind[i] = kind; this.life[i] = life; this.age[i] = 0; this.extra[i] = extra;
      return i;
    }
    return -1; // Saturation drops new effects rather than overwriting dangerous bullets.
  }
  clear(): void { this.active.fill(0); this.cursor = 0; }
}

class Synth {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  muted = false;
  unlock(): void {
    if (this.muted) return;
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate / 2, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let seed = 417;
        for (let i = 0; i < data.length; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; data[i] = (seed / 2147483648 - 1) * (1 - i / data.length * .7); }
        this.noise = buffer;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
    } catch { this.muted = true; }
  }
  tone(freq: number, duration: number, volume: number, shape: OscillatorType = "sine", end = freq): void {
    if (this.muted || !this.ctx || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime; const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
    osc.type = shape; osc.frequency.setValueAtTime(Math.max(30, freq), t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), t + duration);
    gain.gain.setValueAtTime(Math.max(.0001, volume), t);
    gain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    osc.connect(gain).connect(this.ctx.destination); osc.start(t); osc.stop(t + duration + .01);
  }
  burst(volume = .09): void {
    if (this.muted || !this.ctx || !this.noise || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime; const src = this.ctx.createBufferSource(); const filter = this.ctx.createBiquadFilter(); const gain = this.ctx.createGain();
    src.buffer = this.noise; filter.type = "lowpass"; filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(110, t + .32);
    gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(.0001, t + .32);
    src.connect(filter).connect(gain).connect(this.ctx.destination); src.start(t); src.stop(t + .34);
    this.tone(105, .35, volume * .8, "sawtooth", 35);
  }
  music(beat: number, stage: number): void {
    if (beat % 4 === 0) this.tone(58, .19, .026, "sine", 40);
    if (beat % 4 === 2) this.burst(.012);
    if (beat % 2 === 1) this.tone(5400, .035, .007, "triangle", 2600);
    if (beat % 4 === 0) {
      const notes = [110, 130.81, 146.83, 164.81, 196, 174.61, 146.83, 130.81];
      this.tone(notes[(Math.floor(beat / 4) + stage * 2) % notes.length], .36, .034, "triangle");
    }
  }
  close(): void { if (this.ctx) void this.ctx.close(); this.ctx = null; }
}

class Game {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private bullets = new Pool(BULLET_MAX);
  private shots = new Pool(SHOT_MAX);
  private particles = new Pool(PARTICLE_MAX);
  private enemies = new Pool(ENEMY_MAX);
  private sound = new Synth();
  private keys = new Set<string>();
  private pointer = false;
  private targetX = W / 2;
  private targetY = H - 110;
  private focusTouch = false;
  private lastTime = 0;
  private accumulator = 0;
  private raf = 0;
  private tick = 0;
  private stageTick = 0;
  private bossTick = 0;
  private stage = 0;
  private boss = false;
  private bossHp = 0;
  private bossX = W / 2;
  private bossY = 126;
  private px = W / 2;
  private py = H - 108;
  private invincible = 0;
  private shake = 0;
  private flash = 0;
  private bombWave = 0;
  private hitStop = 0;
  private spawnIndex = 0;
  private rng = 123456789;
  private score = 0;
  private lives = 3;
  private bombs = 2;
  private graze = 0;
  private combo = 0;
  private beat = 0;
  private screen: Screen = "title";
  private destroyed = false;
  private hud: Hud = { stage: 0, score: 0, lives: 3, bombs: 2, graze: 0 };
  private onScreen: (overlay: Overlay) => void;
  private onHud: (hud: Hud) => void;
  private starsX = new Float32Array(100);
  private starsY = new Float32Array(100);
  private starsS = new Float32Array(100);
  constructor(canvas: HTMLCanvasElement, onScreen: (o: Overlay) => void, onHud: (h: Hud) => void) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    this.canvas = canvas; this.ctx = ctx; this.onScreen = onScreen; this.onHud = onHud;
    canvas.width = W * 2; canvas.height = H * 2;
    ctx.setTransform(2, 0, 0, 2, 0, 0);
    for (let i = 0; i < 100; i++) { this.starsX[i] = this.random() * W; this.starsY[i] = this.random() * H; this.starsS[i] = .2 + this.random() * 1.4; }
    window.addEventListener("keydown", this.keyDown); window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.blur);
    canvas.addEventListener("pointerdown", this.pointerDown); canvas.addEventListener("pointermove", this.pointerMove);
    window.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("contextmenu", this.preventContext);
    this.raf = requestAnimationFrame(this.frame);
  }
  private random(): number { this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0; return this.rng / 4294967296; }
  private preventContext = (e: Event): void => e.preventDefault();
  private blur = (): void => { this.keys.clear(); this.pointer = false; if (this.screen === "playing") this.pause(); };
  private keyDown = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "shift", "x", "escape", "p", "enter"].includes(key)) e.preventDefault();
    this.keys.add(key);
    if (e.repeat) return;
    if ((key === "p" || key === "escape") && (this.screen === "playing" || this.screen === "paused")) this.pause();
    if (key === "x" && this.screen === "playing") this.bomb();
    if (key === "enter") {
      if (this.screen === "title" || this.screen === "dead" || this.screen === "ending") this.start();
      else if (this.screen === "clear") this.next();
      else if (this.screen === "paused") this.pause();
    }
  };
  private keyUp = (e: KeyboardEvent): void => { this.keys.delete(e.key.toLowerCase()); };
  private pointerDown = (e: PointerEvent): void => {
    if (this.screen !== "playing") return;
    e.preventDefault(); this.pointer = true;
    this.canvas.setPointerCapture(e.pointerId);
    this.updatePointer(e);
  };
  private pointerMove = (e: PointerEvent): void => { if (this.pointer) { e.preventDefault(); this.updatePointer(e); } };
  private pointerUp = (): void => { this.pointer = false; };
  private updatePointer(e: PointerEvent): void {
    const r = this.canvas.getBoundingClientRect();
    this.targetX = clamp((e.clientX - r.left) * W / r.width, 14, W - 14);
    this.targetY = clamp((e.clientY - r.top) * H / r.height - 25, 38, H - 24);
  }
  setFocus(value: boolean): void { this.focusTouch = value; }
  setMuted(value: boolean): void { this.sound.muted = value; if (!value) this.sound.unlock(); }
  getMuted(): boolean { return this.sound.muted; }
  private emit(): void { this.onScreen({ screen: this.screen, stage: this.stage, score: this.score, graze: this.graze }); this.updateHud(); }
  private updateHud(): void {
    this.hud.stage = this.stage; this.hud.score = this.score;
    this.hud.lives = this.lives; this.hud.bombs = this.bombs; this.hud.graze = this.graze;
    this.onHud(this.hud);
  }
  start(): void {
    this.sound.unlock(); this.score = 0; this.graze = 0; this.lives = 3; this.bombs = 2; this.stage = 0;
    this.beginStage();
  }
  next(): void { if (this.screen !== "clear") return; this.stage++; this.bombs = Math.min(3, this.bombs + 1); this.beginStage(); }
  private beginStage(): void {
    this.bullets.clear(); this.shots.clear(); this.particles.clear(); this.enemies.clear();
    this.screen = "playing"; this.stageTick = 0; this.bossTick = 0; this.boss = false;
    this.bossHp = STAGES[this.stage].hp; this.spawnIndex = 0;
    this.px = W / 2; this.py = H - 108; this.pointer = false;
    this.invincible = 110; this.combo = 0; this.bombWave = 0; this.flash = .65;
    this.emit();
  }
  pause(): void { if (this.screen === "playing") this.screen = "paused"; else if (this.screen === "paused") this.screen = "playing"; else return; this.sound.unlock(); this.emit(); }
  bomb(): void {
    if (this.screen !== "playing" || this.bombs <= 0) return;
    this.sound.unlock(); this.bombs--; this.bombWave = 1; this.invincible = 140; this.flash = .8; this.shake = 14;
    for (let i = 0; i < BULLET_MAX; i++) if (this.bullets.active[i]) {
      if (i % 5 === 0) this.spark(this.bullets.x[i], this.bullets.y[i], 1, 1);
      this.bullets.active[i] = 0; this.score += 2;
    }
    if (this.boss) { this.bossHp -= 55; if (this.bossHp <= 0) this.defeatBoss(); }
    for (let i = 0; i < ENEMY_MAX; i++) if (this.enemies.active[i]) this.killEnemy(i);
    this.sound.burst(.19); this.sound.tone(400, .8, .08, "sawtooth", 55); this.updateHud();
  }
  private frame = (now: number): void => {
    if (this.destroyed) return;
    if (!this.lastTime) this.lastTime = now;
    this.accumulator += Math.min(now - this.lastTime, 50);
    this.lastTime = now;
    let loops = 0;
    while (this.accumulator >= 1000 / 60 && loops++ < 3) {
      this.tick++;
      if (this.screen === "playing") this.step();
      this.accumulator -= 1000 / 60;
    }
    if (loops >= 3) this.accumulator = 0;
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };
  private step(): void {
    if (this.hitStop > 0) { this.hitStop--; return; }
    const st = STAGES[this.stage]; this.stageTick++;
    if (this.invincible > 0) this.invincible--;
    this.shake *= .86; this.flash *= .88; this.bombWave *= .91;
    if (this.tick % 15 === 0) { this.sound.music(this.beat++, this.stage); }
    const focus = this.keys.has("shift") || this.focusTouch;
    let dx = Number(this.keys.has("d") || this.keys.has("arrowright")) - Number(this.keys.has("a") || this.keys.has("arrowleft"));
    let dy = Number(this.keys.has("s") || this.keys.has("arrowdown")) - Number(this.keys.has("w") || this.keys.has("arrowup"));
    if (dx && dy) { dx *= .7071; dy *= .7071; }
    const speed = focus ? 2.15 : 4.25;
    if (dx || dy) { this.px += dx * speed; this.py += dy * speed; }
    else if (this.pointer) {
      const follow = focus ? .13 : .28;
      this.px += clamp((this.targetX - this.px) * follow, -speed * 2, speed * 2);
      this.py += clamp((this.targetY - this.py) * follow, -speed * 2, speed * 2);
    }
    this.px = clamp(this.px, 14, W - 14); this.py = clamp(this.py, 42, H - 16);
    if (this.stageTick % 6 === 0) {
      this.shots.add(this.px - 8, this.py - 14, -.25, -11, 3.4, 0);
      this.shots.add(this.px + 8, this.py - 14, .25, -11, 3.4, 0);
      if (this.stageTick % 18 === 0) this.sound.tone(630, .08, .011, "triangle", 320);
    }
    if (!this.boss) {
      // Identical deterministic timeline across attempts; only speed/count/cadence change by stage.
      if (this.stageTick < st.duration && this.stageTick % st.interval === 1) {
        const n = this.spawnIndex++;
        const x = 45 + ((n * 97 + this.stage * 33) % 390);
        this.enemies.add(x, -25, Math.sin(n * 2.4) * .55, .85 + this.stage * .12, 13, n % 3, 260, 36 + this.stage * 10);
      }
      if (this.stageTick >= st.duration && !this.anyEnemy()) this.spawnBoss();
    } else this.updateBoss();
    this.updateEnemies(); this.updateBullets(); this.updateShots(); this.updateParticles();
    if (this.stageTick % 10 === 0) this.updateHud();
  }
  private anyEnemy(): boolean { for (let i = 0; i < ENEMY_MAX; i++) if (this.enemies.active[i]) return true; return false; }
  private spawnBoss(): void {
    this.boss = true; this.bossTick = 0; this.bullets.clear(); this.flash = .9; this.shake = 8;
    this.sound.tone(180, .8, .12, "sawtooth", 55);
  }
  private enemyFire(x: number, y: number, kind: number): void {
    const st = STAGES[this.stage];
    const angle = Math.atan2(this.py - y, this.px - x);
    const count = kind === 2 ? 5 + this.stage : kind === 1 ? 4 + this.stage : 3 + this.stage;
    for (let j = 0; j < count; j++) {
      const a = kind === 1 ? (j / count * TAU + this.stageTick * .017) : angle + (j - (count - 1) / 2) * (kind === 2 ? .21 : .17);
      const v = st.speed * (kind === 1 ? .83 : kind === 2 ? 1.05 : .94);
      this.bullets.add(x, y, Math.cos(a) * v, Math.sin(a) * v, kind === 2 ? 4.7 : 4, (this.stage + kind) % 3, 999);
    }
  }
  private updateEnemies(): void {
    const e = this.enemies;
    for (let i = 0; i < ENEMY_MAX; i++) {
      if (!e.active[i]) continue;
      e.age[i]++; e.x[i] += e.vx[i] + Math.sin((e.age[i] + i * 31) * .027) * .45; e.y[i] += e.vy[i];
      if (e.age[i] === 65 || (this.stage > 1 && e.age[i] === 126)) this.enemyFire(e.x[i], e.y[i], e.kind[i]);
      if (e.age[i] > e.life[i] || e.y[i] > H + 30) e.active[i] = 0;
      if (e.active[i] && this.invincible === 0 && (e.x[i] - this.px) ** 2 + (e.y[i] - this.py) ** 2 < 190) this.hit();
    }
  }
  private updateBoss(): void {
    this.bossTick++;
    const st = STAGES[this.stage];
    this.bossX = W / 2 + Math.sin(this.bossTick * .012) * (90 + this.stage * 7);
    this.bossY = 122 + Math.sin(this.bossTick * .022) * 22;
    if (this.bossTick < 72) return; // Visible warning before the first volley.
    const t = this.bossTick - 72;
    const cadence = 54 - this.stage * 6;
    if (t % cadence === 0) {
      const gap = Math.atan2(this.py - this.bossY, this.px - this.bossX);
      for (let j = 0; j < st.count + 6; j++) {
        const a = j * TAU / (st.count + 6) + t * .012;
        // Deliberate corridor: suppress the two spokes closest to the player.
        const delta = Math.atan2(Math.sin(a - gap), Math.cos(a - gap));
        if (Math.abs(delta) < .20) continue;
        const v = st.speed * (.82 + (j % 3) * .095);
        this.bullets.add(this.bossX, this.bossY + 17, Math.cos(a) * v, Math.sin(a) * v, 4.8, this.stage % 3);
      }
      this.sound.tone(190 + this.stage * 35, .13, .025, "square", 80);
    }
    if (t % (92 - this.stage * 9) === 38) {
      const aim = Math.atan2(this.py - this.bossY, this.px - this.bossX);
      for (let j = -2 - Math.floor(this.stage / 2); j <= 2 + Math.floor(this.stage / 2); j++) {
        const a = aim + j * .16;
        const v = st.speed * 1.1;
        this.bullets.add(this.bossX, this.bossY + 12, Math.cos(a) * v, Math.sin(a) * v, 5.2, (this.stage + 1) % 3);
      }
    }
    if (this.stage >= 2 && t % 8 === 0) {
      // Curved, slower spiral; never spawn below the boss or directly on the player.
      const a = t * .052;
      for (let j = 0; j < 2; j++) {
        const angle = a + j * Math.PI;
        this.bullets.add(this.bossX, this.bossY, Math.cos(angle) * st.speed * .68, Math.sin(angle) * st.speed * .68, 3.8, 2, 999, (j ? -.006 : .006));
      }
    }
    if (this.invincible === 0 && (this.bossX - this.px) ** 2 + (this.bossY - this.py) ** 2 < 920) this.hit();
  }
  private updateBullets(): void {
    const b = this.bullets;
    for (let i = 0; i < BULLET_MAX; i++) {
      if (!b.active[i]) continue;
      b.age[i]++;
      if (b.extra[i]) {
        const turn = b.extra[i], vx = b.vx[i], vy = b.vy[i];
        b.vx[i] = vx - vy * turn; b.vy[i] = vy + vx * turn;
      }
      b.x[i] += b.vx[i]; b.y[i] += b.vy[i];
      if (b.x[i] < -30 || b.x[i] > W + 30 || b.y[i] < -30 || b.y[i] > H + 30) { b.active[i] = 0; continue; }
      if (this.invincible > 0) continue;
      const dist = (b.x[i] - this.px) ** 2 + (b.y[i] - this.py) ** 2;
      if (dist < (b.size[i] + 2.4) ** 2) { b.active[i] = 0; this.hit(); }
      else if (dist < (b.size[i] + 20) ** 2 && b.life[i] === 999) {
        b.life[i] = 1; this.graze++; this.combo = Math.min(100, this.combo + 1);
        this.score += 10 + this.combo;
        this.spark(this.px, this.py, 2, 1);
        if (this.graze % 4 === 0) this.sound.tone(830 + this.graze % 6 * 90, .085, .023, "sine", 1500);
      }
    }
  }
  private updateShots(): void {
    const s = this.shots, e = this.enemies;
    for (let i = 0; i < SHOT_MAX; i++) {
      if (!s.active[i]) continue;
      s.x[i] += s.vx[i]; s.y[i] += s.vy[i];
      if (s.y[i] < -15) { s.active[i] = 0; continue; }
      if (this.boss && this.bossTick > 30 && (s.x[i] - this.bossX) ** 2 + (s.y[i] - this.bossY) ** 2 < 1050) {
        s.active[i] = 0; this.bossHp -= 2;
        if (this.tick % 4 === 0) this.spark(s.x[i], s.y[i], 1, 2);
        if (this.bossHp <= 0) { this.defeatBoss(); return; }
        continue;
      }
      for (let j = 0; j < ENEMY_MAX; j++) {
        if (!e.active[j]) continue;
        if ((s.x[i] - e.x[j]) ** 2 + (s.y[i] - e.y[j]) ** 2 < 270) {
          s.active[i] = 0; e.extra[j] -= 2;
          if (e.extra[j] <= 0) this.killEnemy(j);
          break;
        }
      }
    }
  }
  private killEnemy(i: number): void {
    const e = this.enemies; if (!e.active[i]) return;
    this.spark(e.x[i], e.y[i], 15, 2); e.active[i] = 0; this.score += 250 + this.combo * 2;
    this.shake = 3; this.sound.burst(.035);
  }
  private spark(x: number, y: number, count: number, kind: number): void {
    for (let j = 0; j < count; j++) {
      const a = this.random() * TAU, v = .7 + this.random() * 4.2;
      this.particles.add(x, y, Math.cos(a) * v, Math.sin(a) * v, 1 + this.random() * 2.8, kind, 14 + this.random() * 22);
    }
  }
  private updateParticles(): void {
    const p = this.particles;
    for (let i = 0; i < PARTICLE_MAX; i++) if (p.active[i]) {
      p.x[i] += p.vx[i]; p.y[i] += p.vy[i]; p.vx[i] *= .972; p.vy[i] *= .972;
      p.age[i]++; if (p.age[i] >= p.life[i]) p.active[i] = 0;
    }
  }
  private hit(): void {
    if (this.invincible > 0) return;
    this.lives--; this.invincible = 135; this.combo = 0; this.flash = .8; this.shake = 13; this.hitStop = 5;
    this.spark(this.px, this.py, 36, 2); this.sound.burst(.17);
    // Briefly open space around the respawn position.
    const b = this.bullets;
    for (let i = 0; i < BULLET_MAX; i++) if (b.active[i] && (b.x[i] - this.px) ** 2 + (b.y[i] - this.py) ** 2 < 130 ** 2) b.active[i] = 0;
    this.px = W / 2; this.py = H - 108; this.pointer = false;
    if (this.lives <= 0) { this.screen = "dead"; this.emit(); }
    else this.updateHud();
  }
  private defeatBoss(): void {
    if (!this.boss || this.screen !== "playing") return;
    this.boss = false; this.score += 4000 + this.stage * 1500 + this.lives * 500;
    this.spark(this.bossX, this.bossY, 90, 2);
    this.bullets.clear(); this.shots.clear(); this.shake = 22; this.flash = 1;
    this.sound.burst(.22); this.sound.tone(330, .75, .08, "triangle", 880);
    this.screen = this.stage === STAGES.length - 1 ? "ending" : "clear";
    this.emit();
  }
  private draw(): void {
    const c = this.ctx; const st = STAGES[this.stage];
    c.save(); c.fillStyle = "#070e1d"; c.fillRect(0, 0, W, H);
    const shakeX = this.shake > .4 ? Math.sin(this.tick * 17.7) * this.shake : 0;
    const shakeY = this.shake > .4 ? Math.cos(this.tick * 13.3) * this.shake : 0;
    c.translate(shakeX, shakeY);
    // Architectural grid, scrolling contours and subdued stars, all analytic shapes.
    c.lineWidth = 1; c.strokeStyle = "rgba(108,177,205,.085)";
    c.beginPath();
    const shift = this.tick * .27 % 36;
    for (let y = -36 + shift; y < H; y += 36) { c.moveTo(0, y); c.lineTo(W, y); }
    for (let x = 24; x < W; x += 36) { c.moveTo(x, 0); c.lineTo(x, H); }
    c.stroke();
    c.strokeStyle = "rgba(104,200,229,.075)";
    for (let j = 0; j < 5; j++) {
      c.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const y = 132 + j * 114 + Math.sin(x * .018 + j * .85 + this.tick * .004) * 27 + Math.sin(x * .041 - j * 1.2) * 8;
        if (x === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = "rgba(154,213,240,.4)";
    for (let i = 0; i < 100; i++) c.fillRect(this.starsX[i], (this.starsY[i] + this.tick * this.starsS[i] * .22) % H, this.starsS[i], this.starsS[i]);
    c.strokeStyle = "rgba(97,221,247,.18)"; c.strokeRect(11.5, 11.5, W - 23, H - 23);
    c.strokeStyle = "rgba(97,221,247,.4)"; c.beginPath();
    c.moveTo(12, 42); c.lineTo(12, 12); c.lineTo(43, 12);
    c.moveTo(W - 43, 12); c.lineTo(W - 12, 12); c.lineTo(W - 12, 42);
    c.moveTo(12, H - 42); c.lineTo(12, H - 12); c.lineTo(43, H - 12);
    c.moveTo(W - 43, H - 12); c.lineTo(W - 12, H - 12); c.lineTo(W - 12, H - 42); c.stroke();
    if (this.screen !== "title") {
      this.drawEnemies(st.color); this.drawBoss(st.color); this.drawBullets(); this.drawShots(); this.drawParticles(); this.drawPlayer(); this.drawHud();
    } else {
      // Attract mode's concentric geometric sigil.
      c.save(); c.translate(W / 2, H * .44); c.rotate(this.tick * .0015);
      for (let r = 0; r < 6; r++) {
        c.strokeStyle = `rgba(104,221,246,${.06 + r * .022})`;
        c.lineWidth = r === 0 ? 2 : 1; c.beginPath();
        const radius = 84 + r * 22;
        for (let k = 0; k <= 12; k++) {
          const a = k * TAU / 12 + (r % 2 ? .22 : 0);
          if (!k) c.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
          else c.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
        }
        c.stroke();
      }
      c.restore();
    }
    if (this.bombWave > .008) {
      c.strokeStyle = `rgba(145,244,255,${this.bombWave * .85})`;
      c.lineWidth = 6 * this.bombWave + 1;
      c.beginPath(); c.arc(this.px, this.py, (1 - this.bombWave) * 550, 0, TAU); c.stroke();
    }
    if (this.flash > .01) { c.fillStyle = `rgba(184,239,255,${this.flash * .23})`; c.fillRect(0, 0, W, H); }
    c.restore();
  }
  private drawEnemies(color: string): void {
    const c = this.ctx, e = this.enemies;
    for (let i = 0; i < ENEMY_MAX; i++) if (e.active[i]) {
      c.save(); c.translate(e.x[i], e.y[i]); c.rotate(e.age[i] * .015);
      c.fillStyle = "rgba(7,14,29,.9)"; c.strokeStyle = color; c.lineWidth = 2;
      c.beginPath(); c.moveTo(0, -13); c.lineTo(12, 0); c.lineTo(0, 13); c.lineTo(-12, 0); c.closePath(); c.fill(); c.stroke();
      c.strokeStyle = "rgba(255,255,255,.7)"; c.beginPath(); c.moveTo(-5, 0); c.lineTo(5, 0); c.moveTo(0, -5); c.lineTo(0, 5); c.stroke(); c.restore();
    }
  }
  private drawBoss(color: string): void {
    if (!this.boss) return;
    const c = this.ctx, x = this.bossX, y = this.bossY, t = this.tick;
    c.save(); c.translate(x, y);
    c.strokeStyle = color; c.lineWidth = 1.5;
    for (let k = 0; k < 2; k++) {
      c.save(); c.rotate(t * (k ? -.012 : .018));
      c.globalAlpha = k ? .42 : .8; c.beginPath();
      for (let j = 0; j <= 8; j++) { const a = j * TAU / 8; if (j === 0) c.moveTo(Math.cos(a) * (39 + k * 12), Math.sin(a) * (39 + k * 12)); else c.lineTo(Math.cos(a) * (39 + k * 12), Math.sin(a) * (39 + k * 12)); }
      c.stroke(); c.restore();
    }
    c.fillStyle = "#0c1727"; c.beginPath(); c.arc(0, 0, 29, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 18;
    c.beginPath(); c.moveTo(0, -17); c.lineTo(15, 0); c.lineTo(0, 17); c.lineTo(-15, 0); c.closePath(); c.fill();
    c.shadowBlur = 0; c.fillStyle = "#fff"; c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill(); c.restore();
    c.fillStyle = "rgba(5,12,22,.85)"; c.fillRect(89, 59, 302, 7);
    c.fillStyle = color; c.fillRect(90, 60, Math.max(0, 300 * this.bossHp / STAGES[this.stage].hp), 5);
    c.font = "bold 11px monospace"; c.textAlign = "center"; c.fillStyle = "#d7edfa";
    c.fillText("✝  THE ESSENCE  ✝", W / 2, 51);
  }
  private drawBullets(): void {
    const c = this.ctx, b = this.bullets;
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < BULLET_MAX; i++) if (b.active[i]) {
      const x = b.x[i], y = b.y[i], r = b.size[i];
      c.fillStyle = b.kind[i] === 0 ? "rgba(91,214,251,.23)" : b.kind[i] === 1 ? "rgba(255,148,104,.26)" : "rgba(237,126,243,.26)";
      c.beginPath(); c.arc(x, y, r * 2.1, 0, TAU); c.fill();
      c.fillStyle = b.kind[i] === 0 ? "#65d9fc" : b.kind[i] === 1 ? "#ffb78c" : "#e99efc";
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.fillStyle = "rgba(255,255,255,.9)"; c.beginPath(); c.arc(x, y, r * .37, 0, TAU); c.fill();
    }
    c.globalCompositeOperation = "source-over";
  }
  private drawShots(): void {
    const c = this.ctx, s = this.shots; c.globalCompositeOperation = "lighter";
    c.fillStyle = "rgba(100,237,248,.32)";
    for (let i = 0; i < SHOT_MAX; i++) if (s.active[i]) c.fillRect(s.x[i] - 4, s.y[i] - 18, 8, 24);
    c.fillStyle = "#e8ffff";
    for (let i = 0; i < SHOT_MAX; i++) if (s.active[i]) c.fillRect(s.x[i] - 1.5, s.y[i] - 15, 3, 18);
    c.globalCompositeOperation = "source-over";
  }
  private drawParticles(): void {
    const c = this.ctx, p = this.particles; c.globalCompositeOperation = "lighter";
    for (let i = 0; i < PARTICLE_MAX; i++) if (p.active[i]) {
      c.globalAlpha = 1 - p.age[i] / p.life[i];
      c.fillStyle = p.kind[i] === 1 ? "#f5cd92" : "#75e9fa";
      c.fillRect(p.x[i], p.y[i], p.size[i], p.size[i]);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
  }
  private drawPlayer(): void {
    const c = this.ctx, x = this.px, y = this.py;
    if (this.invincible > 0 && this.tick % 8 < 4) c.globalAlpha = .42;
    c.save(); c.translate(x, y);
    const focus = this.keys.has("shift") || this.focusTouch;
    c.strokeStyle = focus ? "rgba(255,255,255,.85)" : "rgba(108,230,249,.3)";
    c.lineWidth = 1; c.beginPath(); c.arc(0, 0, focus ? 17 : 23, 0, TAU); c.stroke();
    c.globalCompositeOperation = "lighter"; c.fillStyle = "rgba(56,223,248,.16)";
    c.beginPath(); c.moveTo(0, -24); c.lineTo(18, 18); c.lineTo(0, 10); c.lineTo(-18, 18); c.closePath(); c.fill();
    c.globalCompositeOperation = "source-over";
    c.fillStyle = "#e4faff"; c.strokeStyle = "#54d9f1"; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -17); c.lineTo(11, 12); c.lineTo(0, 6); c.lineTo(-11, 12); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#f685b3"; c.beginPath(); c.arc(0, 0, 2.4, 0, TAU); c.fill();
    c.fillStyle = "rgba(93,220,249,.65)"; c.beginPath(); c.moveTo(-5, 14); c.lineTo(0, 24 + Math.sin(this.tick * .6) * 4); c.lineTo(5, 14); c.fill();
    c.restore(); c.globalAlpha = 1;
  }
  private drawHud(): void {
    const c = this.ctx, st = STAGES[this.stage];
    c.textAlign = "left"; c.fillStyle = st.color; c.font = "bold 11px monospace";
    c.fillText(`STAGE 0${this.stage + 1}  /  ${st.chapter.split(" / ")[1]}`, 27, 35);
    c.fillStyle = "#dcebf6"; c.font = "bold 20px monospace";
    c.fillText(this.score.toString().padStart(8, "0"), 27, 62);
    c.font = "11px monospace"; c.fillStyle = "#82a6b7";
    c.fillText(`LIFE ${"◆".repeat(Math.max(0, this.lives))}    BOMB ${"✦".repeat(this.bombs)}`, 27, H - 35);
    c.textAlign = "right"; c.fillText(`GRAZE ${this.graze.toString().padStart(4, "0")}`, W - 27, H - 35);
    if (!this.boss) {
      c.fillStyle = "rgba(155,204,225,.18)"; c.fillRect(27, 75, W - 54, 2);
      c.fillStyle = st.color; c.fillRect(27, 75, (W - 54) * Math.min(this.stageTick / st.duration, 1), 2);
    }
  }
  destroy(): void {
    this.destroyed = true; cancelAnimationFrame(this.raf); this.sound.close();
    window.removeEventListener("keydown", this.keyDown); window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.blur); window.removeEventListener("pointerup", this.pointerUp);
    this.canvas.removeEventListener("pointerdown", this.pointerDown); this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("contextmenu", this.preventContext);
  }
}

const initialOverlay: Overlay = { screen: "title", stage: 0, score: 0, graze: 0 };
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const grazeRef = useRef<HTMLSpanElement>(null);
  const [overlay, setOverlay] = useState<Overlay>(initialOverlay);
  const [muted, setMuted] = useState(false);
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!canvasRef.current) return;
    const game = new Game(canvasRef.current, setOverlay, (hud) => {
      if (scoreRef.current) scoreRef.current.textContent = hud.score.toString().padStart(8, "0");
      if (grazeRef.current) grazeRef.current.textContent = hud.graze.toString().padStart(4, "0");
    });
    gameRef.current = game;
    return () => { game.destroy(); gameRef.current = null; };
  }, []);
  const st = STAGES[overlay.stage];
  const playing = overlay.screen === "playing";
  return <div className="site">
    <div className="noise" aria-hidden="true" />
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✝</span><span>HONSHITSU<span className="brand-alt"> / DANMAKU</span></span></div>
      <div className="top-right"><span className="online-dot" /> LOCAL ARCADE <span className="top-divider">/</span> 2026 EDITION</div>
    </header>
    <main className="layout">
      <section className="editorial">
        <div className="kicker"><span className="kicker-line" /> A STORY-DRIVEN BULLET HELL <span className="kicker-line" /></div>
        <div className="title-area">
          <div className="title-english">THE ESSENCE IS EVERYWHERE</div>
          <h1>偏差値60の教室から<br /><em>✝本質✝</em>が<br />漏れ出している件<span className="title-small">について</span></h1>
          <p className="lead">見えないものを、避けてみせろ。<br />桐葉高校・北棟から始まる、五つの弾幕。</p>
        </div>
        <div className="chapter-section">
          <div className="section-heading"><span>STAGE SELECT / 五つの境界線</span><span>01 — 05</span></div>
          <div className="stage-list">
            {STAGES.map((s, i) => <div className={`stage-row ${overlay.stage === i ? "active" : ""} ${overlay.stage > i && overlay.screen !== "title" ? "completed" : ""}`} key={s.chapter}>
              <span className="stage-number">0{i + 1}</span><span className="stage-line" style={{ background: s.color }} />
              <span className="stage-name">{s.name}<small>{s.chapter.split(" / ")[1]}</small></span>
              <span className="stage-signal">{overlay.stage > i && overlay.screen !== "title" ? "✓" : overlay.stage === i ? "◈" : "·"}</span>
            </div>)}
          </div>
          <p className="difficulty-note">弾速・弾数・発射間隔・ボス耐久が各ステージで厳密に上昇。弾の軌道は覚えられる。理不尽な乱数はない。</p>
        </div>
        <div className="controls-section">
          <div className="section-heading"><span>HOW TO PLAY / 操作方法</span><span>✝</span></div>
          <div className="controls-grid">
            <div><kbd>WASD</kbd> <kbd>↑↓←→</kbd><span>移動</span></div>
            <div><kbd>SHIFT</kbd><span>低速 / 精密回避</span></div>
            <div><kbd>X</kbd><span>ボム / 弾消し</span></div>
            <div><kbd>P</kbd><span>一時停止</span></div>
          </div>
          <p className="touch-hint">マウス・タッチ操作にも対応。射撃は自動。弾に近づくと GRAZE ボーナス。</p>
        </div>
        <div className="editorial-footer"><span>NO ASSETS. JUST MATH, LIGHT & SOUND.</span><span>✝</span></div>
      </section>
      <section className="game-column" aria-label="弾幕シューティングゲーム">
        <div className="game-topline"><span><span className="live-led" /> {playing ? "LIVE SESSION" : "ARCADE CABINET"}</span><span>480 × 720 <span className="dim">/</span> 60Hz LOGIC</span></div>
        <div className="game-frame" style={{ borderColor: `${st.color}40` }}>
          <canvas ref={canvasRef} aria-label="弾幕ゲーム画面" />
          {overlay.screen !== "playing" && <div className="game-overlay">
            <div className="overlay-top">KIRIHA HIGH SCHOOL <span>✝</span> NORTH WING</div>
            <div className="overlay-center">
              {overlay.screen === "title" && <>
                <span className="overlay-eyebrow">AN ARCADE STORY IN FIVE ACTS</span>
                <div className="overlay-cross">✝</div>
                <h2>本質は、<br />避けられるか。</h2>
                <p>北棟の国境を越え、弾幕の向こう側へ。<br />すべての答えが、そこにあるとは限らない。</p>
                <button className="primary-btn" onClick={() => gameRef.current?.start()}>ゲームを始める <span>↗</span></button>
                <span className="overlay-shortcut">PRESS ENTER TO START</span>
              </>}
              {overlay.screen === "paused" && <>
                <span className="overlay-eyebrow">SIGNAL INTERRUPTED</span><div className="overlay-cross">Ⅱ</div>
                <h2>一時停止</h2><p>地面は忘れない。<br />この続きから、また始めよう。</p>
                <button className="primary-btn" onClick={() => gameRef.current?.pause()}>再開する <span>↗</span></button>
                <span className="overlay-shortcut">PRESS P / ESC TO RESUME</span>
              </>}
              {overlay.screen === "clear" && <>
                <span className="overlay-eyebrow">STAGE 0{overlay.stage + 1} / COMPLETE</span><div className="overlay-cross">✦</div>
                <h2>{st.name}<br /><span className="clear-sub">突破。</span></h2>
                <p>「{st.quote}」</p>
                <div className="result-line"><span>SCORE {overlay.score.toString().padStart(8, "0")}</span><span>GRAZE {overlay.graze}</span></div>
                <button className="primary-btn" onClick={() => gameRef.current?.next()}>次の境界線へ <span>↗</span></button>
                <span className="overlay-shortcut">PRESS ENTER TO CONTINUE</span>
              </>}
              {overlay.screen === "dead" && <>
                <span className="overlay-eyebrow">SIGNAL LOST / STAGE 0{overlay.stage + 1}</span><div className="overlay-cross">✝</div>
                <h2>まだ、<br />終わらない。</h2><p>見えないけれど、道はある。<br />もう一度、最初から。</p>
                <div className="result-line"><span>SCORE {overlay.score.toString().padStart(8, "0")}</span><span>GRAZE {overlay.graze}</span></div>
                <button className="primary-btn" onClick={() => gameRef.current?.start()}>再挑戦する <span>↗</span></button>
              </>}
              {overlay.screen === "ending" && <>
                <span className="overlay-eyebrow">ALL STAGES / COMPLETE</span><div className="overlay-cross">✝</div>
                <h2>✝本質✝は、<br />終わらない。</h2><p>同じ景色でも、見る人は変わる。<br />また来年、同じ桜の下で。</p>
                <div className="result-line"><span>SCORE {overlay.score.toString().padStart(8, "0")}</span><span>GRAZE {overlay.graze}</span></div>
                <button className="primary-btn" onClick={() => gameRef.current?.start()}>もう一度遊ぶ <span>↗</span></button>
              </>}
            </div>
            <div className="overlay-bottom"><span>✝ HONSHITSU / DANMAKU</span><span>NO. 001</span></div>
          </div>}
        </div>
        <div className="game-bottomline"><div><small>TOTAL SCORE</small><strong ref={scoreRef}>00000000</strong></div><div><small>GRAZE COUNT</small><strong ref={grazeRef}>0000</strong></div><button className="sound-btn" onClick={() => { const next = !muted; setMuted(next); gameRef.current?.setMuted(next); }} aria-label={muted ? "音をオンにする" : "音をオフにする"}>{muted ? "♪ OFF" : "♫ ON"}</button></div>
        <div className="mobile-actions"><button onClick={() => gameRef.current?.bomb()} disabled={!playing}>✦ ボム</button><button onPointerDown={() => { setFocus(true); gameRef.current?.setFocus(true); }} onPointerUp={() => { setFocus(false); gameRef.current?.setFocus(false); }} onPointerCancel={() => { setFocus(false); gameRef.current?.setFocus(false); }} disabled={!playing}>◎ {focus ? "低速 ON" : "低速移動"}</button><button onClick={() => gameRef.current?.pause()} disabled={!(playing || overlay.screen === "paused")}>Ⅱ 一時停止</button></div>
      </section>
    </main>
    <footer className="site-footer"><span>偏差値60の教室から✝本質✝が漏れ出している件について</span><span>THE EARTH REMEMBERS. <b>✝</b></span></footer>
    <style>{`
      *{box-sizing:border-box}html{background:#080e19}body{margin:0;color:#e6eff2;font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,system-ui,sans-serif}button{font:inherit}button:focus-visible{outline:2px solid #8cecf5;outline-offset:3px}.site{min-height:100vh;background:radial-gradient(ellipse at 84% 26%,#152c3c 0%,#0b1623 36%,#080e19 76%);position:relative;overflow:hidden}.noise{position:absolute;inset:0;pointer-events:none;opacity:.28;background-image:repeating-linear-gradient(0deg,transparent 0px,transparent 3px,rgba(167,220,231,.035) 4px);z-index:0}.topbar,.layout,.site-footer{position:relative;z-index:1}.topbar{height:72px;border-bottom:1px solid #2a3f4b;display:flex;align-items:center;justify-content:space-between;padding:0 max(4vw,28px);font:11px/1.2 monospace;letter-spacing:.15em}.brand{display:flex;align-items:center;gap:13px;font-weight:900;font-size:13px;letter-spacing:.14em}.brand-mark{font-size:28px;color:#83e4ef;line-height:1}.brand-alt{font-weight:400;color:#7d9eab}.top-right{color:#8da6ae;display:flex;gap:13px;align-items:center}.online-dot,.live-led{width:6px;height:6px;border-radius:50%;background:#7bdfcf;box-shadow:0 0 10px #7bdfcf;display:inline-block}.top-divider{color:#48616a}.layout{max-width:1370px;margin:auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(390px,480px);gap:clamp(40px,6vw,100px);padding:45px max(4vw,28px) 65px;align-items:start}.editorial{padding-top:16px;display:flex;flex-direction:column;min-height:750px}.kicker{display:flex;align-items:center;gap:14px;color:#8ce1e9;font:10px monospace;letter-spacing:.23em;white-space:nowrap}.kicker-line{height:1px;width:22px;background:#7bd6df}.title-area{margin-top:44px}.title-english{font:10px monospace;letter-spacing:.33em;color:#7c9ca8;margin-bottom:14px}h1{font-size:clamp(30px,3vw,46px);line-height:1.47;letter-spacing:-.075em;margin:0;font-weight:800;color:#eef5f4;text-shadow:0 3px 24px #071521}h1 em{font-style:normal;color:#8de5ed;text-shadow:0 0 36px #3eafc886}.title-small{font-size:.55em;letter-spacing:-.04em}.lead{font-size:13px;line-height:2;color:#9eb7bf;margin:20px 0 0;letter-spacing:.07em}.chapter-section{margin-top:45px}.section-heading{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #344c58;padding-bottom:11px;font:10px monospace;letter-spacing:.09em;color:#aac2c8}.stage-list{margin-top:4px}.stage-row{height:45px;display:flex;align-items:center;gap:15px;border-bottom:1px solid #263b47;color:#819ba5;transition:background .2s,padding .2s}.stage-row.active{color:#effbfc;background:linear-gradient(90deg,#183c4a80,transparent);padding:0 9px}.stage-row.completed{color:#a4cfcf}.stage-number{font:11px monospace;width:20px}.stage-line{width:2px;height:18px;opacity:.55}.stage-row.active .stage-line{opacity:1;box-shadow:0 0 10px currentColor}.stage-name{display:flex;align-items:center;justify-content:space-between;flex:1;font-size:12px;font-weight:600;letter-spacing:.08em}.stage-name small{font:9px monospace;letter-spacing:.09em;color:#718f9a}.stage-signal{font:16px monospace;color:#8bdde4;width:16px;text-align:right}.difficulty-note{font-size:11px;color:#809ca6;line-height:1.8;margin:13px 0 0}.controls-section{margin-top:34px}.controls-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;margin-top:19px}.controls-grid>div{display:flex;align-items:center;gap:5px;white-space:nowrap}.controls-grid span{color:#a8bfc5;font-size:11px;margin-left:5px}kbd{border:1px solid #48616b;border-bottom-width:2px;padding:3px 6px;color:#d4e8ed;background:#172936;font:10px monospace;border-radius:3px}.touch-hint{font-size:11px;line-height:1.7;color:#7d9aa5;margin-top:17px}.editorial-footer{margin-top:auto;padding-top:24px;display:flex;justify-content:space-between;color:#627f8b;font:10px monospace;letter-spacing:.09em}.editorial-footer span:last-child{color:#8adbe6;font-size:18px}.game-column{width:100%;max-width:480px;justify-self:center}.game-topline,.game-bottomline{display:flex;justify-content:space-between;align-items:center;color:#91b0bc;font:10px monospace;letter-spacing:.08em}.game-topline{padding:0 2px 12px}.game-topline>span:first-child{display:flex;align-items:center;gap:10px}.dim{color:#466575}.game-frame{position:relative;aspect-ratio:2/3;border:1px solid #35647c;background:#070e1d;box-shadow:0 0 0 7px #0d1c29,0 0 0 8px #284252,0 22px 85px #0008,0 0 100px #32788d16;overflow:hidden}.game-frame canvas{display:block;width:100%;height:100%;touch-action:none}.game-overlay{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;background:linear-gradient(180deg,rgba(6,14,26,.55),rgba(7,17,30,.55) 30%,rgba(7,16,28,.89) 62%,rgba(7,16,28,.8));padding:27px 30px;text-align:center}.overlay-top,.overlay-bottom{display:flex;justify-content:space-between;color:#8aafbd;font:9px monospace;letter-spacing:.15em}.overlay-top span{color:#8ce5eb}.overlay-center{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1}.overlay-eyebrow{font:10px monospace;letter-spacing:.23em;color:#85cfdf}.overlay-cross{color:#9eeaf0;font-size:58px;line-height:1.2;margin:26px 0 7px;text-shadow:0 0 35px #5bd1e2,0 0 80px #4fb5d2}.overlay-center h2{font-size:clamp(28px,3vw,43px);font-weight:700;line-height:1.5;letter-spacing:.06em;margin:10px 0;color:#f0f8f8}.overlay-center h2 .clear-sub{color:#96e3eb}.overlay-center p{font-size:12px;color:#b1c8cc;line-height:2;letter-spacing:.05em;margin:7px 0 28px}.primary-btn{background:#9be5e9;color:#09202b;min-width:232px;border:0;padding:15px 21px;display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:800;letter-spacing:.1em;cursor:pointer;box-shadow:0 7px 30px #58c5df35;transition:transform .18s,background .18s,box-shadow .18s}.primary-btn:hover{background:#d1fcf9;transform:translateY(-3px);box-shadow:0 12px 38px #58c5df55}.primary-btn span{font-size:20px;font-weight:400}.overlay-shortcut{font:9px monospace;color:#6c9eaa;letter-spacing:.17em;margin-top:15px}.result-line{width:100%;display:flex;justify-content:space-between;color:#aee4e8;border-top:1px solid #507484;border-bottom:1px solid #507484;padding:13px 0;margin:0 0 24px;font:11px monospace}.game-bottomline{margin-top:22px;padding:0 4px}.game-bottomline>div{display:flex;flex-direction:column;gap:5px}.game-bottomline small{font:9px monospace;color:#71909e}.game-bottomline strong{font:18px monospace;color:#e6f5f4;letter-spacing:.04em}.sound-btn{color:#a9dce0;background:none;border:1px solid #405f6b;padding:8px 10px;cursor:pointer;font:10px monospace}.sound-btn:hover{background:#1f4050}.mobile-actions{display:none}.site-footer{border-top:1px solid #263c49;margin:0 max(4vw,28px);min-height:55px;display:flex;justify-content:space-between;align-items:center;color:#688590;font-size:10px;letter-spacing:.08em}.site-footer b{color:#9be4e7;font-size:16px;margin-left:10px}@media(max-width:1000px){.layout{grid-template-columns:minmax(0,1fr) minmax(330px,440px);gap:32px}h1{font-size:30px}.editorial{min-height:660px}.title-area{margin-top:30px}.chapter-section{margin-top:28px}.controls-section{margin-top:24px}.stage-name small{display:none}}@media(max-width:760px){.topbar{height:57px;padding:0 18px}.top-right{display:none}.layout{display:flex;flex-direction:column;gap:30px;padding:32px 18px 40px}.editorial{min-height:0;width:100%;padding:0}.title-area{margin-top:22px}h1{font-size:clamp(27px,6vw,38px)}.lead{margin-top:10px}.chapter-section{margin-top:25px}.stage-row{height:39px}.controls-section,.editorial-footer{display:none}.game-column{max-width:480px;width:min(100%,calc((100dvh - 145px)*.6667));min-width:0}.game-bottomline{margin-top:18px}.game-overlay{padding:18px 18px}.overlay-cross{font-size:43px;margin:12px 0 4px}.overlay-center h2{font-size:clamp(24px,6vw,36px);margin:4px 0}.overlay-center p{font-size:10px;margin:4px 0 17px}.primary-btn{padding:10px 14px;min-width:195px;font-size:11px}.overlay-top,.overlay-bottom{font-size:8px}.overlay-eyebrow{font-size:8px}.result-line{margin-bottom:14px;padding:8px 0}.mobile-actions{display:flex;gap:8px;margin-top:17px}.mobile-actions button{flex:1;background:#193442;border:1px solid #416776;color:#c7e6e9;padding:12px 3px;font-size:11px;touch-action:none;user-select:none}.mobile-actions button:disabled{opacity:.45}.site-footer{margin:0 18px;font-size:9px}.site-footer span:last-child{display:none}}@media(max-width:400px){.brand-alt{display:none}.kicker{font-size:8px}.game-column{width:100%}.overlay-center p{line-height:1.6}.overlay-cross{margin:4px 0}.overlay-center h2{font-size:25px}}
    `}</style>
  </div>;
}
