// ─────────────────────────────────────────────────────────────
//  Sprite pre-rendering — 起動時に一度だけ全弾種×全色を焼き込む
// ─────────────────────────────────────────────────────────────
import {
  COLORS, N_COLORS, N_TYPES, TYPE_VIS,
  T_SMALL, T_MED, T_LARGE, T_RICE, T_KUNAI, T_CROSS, T_STAR, T_HEART, T_PETAL,
} from './data';

export interface SpriteSet {
  readonly core: HTMLCanvasElement[];
  readonly glow: HTMLCanvasElement[];
  readonly glowCrimson: HTMLCanvasElement;
}

export interface DigitAtlas {
  canvas: HTMLCanvasElement;
  cw: number;
  ch: number;
}

const SS = 4;

function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function circle(g: CanvasRenderingContext2D, r: number): void {
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
}

function starPath(g: CanvasRenderingContext2D, ro: number, ri: number): void {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i & 1 ? ri : ro;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
}

function crossPath(g: CanvasRenderingContext2D, v: number, k: number): void {
  const bw = 0.36 * v * k;
  g.beginPath();
  g.rect(-bw / 2, -0.95 * v * (0.55 + 0.45 * k), bw, 1.9 * v * (0.55 + 0.45 * k));
  g.rect(-0.62 * v * (0.5 + 0.5 * k), -0.5 * v, 1.24 * v * (0.5 + 0.5 * k), 0.34 * v * k);
}

function heartPath(g: CanvasRenderingContext2D, v: number): void {
  g.beginPath();
  g.moveTo(0, 0.85 * v);
  g.bezierCurveTo(-1.1 * v, 0.05 * v, -0.7 * v, -0.95 * v, 0, -0.4 * v);
  g.bezierCurveTo(0.7 * v, -0.95 * v, 1.1 * v, 0.05 * v, 0, 0.85 * v);
  g.closePath();
}

function petalPath(g: CanvasRenderingContext2D, v: number): void {
  g.beginPath();
  g.moveTo(0, 0.95 * v);
  g.quadraticCurveTo(0.9 * v, 0.1 * v, 0.28 * v, -0.9 * v);
  g.lineTo(0, -0.62 * v);
  g.lineTo(-0.28 * v, -0.9 * v);
  g.quadraticCurveTo(-0.9 * v, 0.1 * v, 0, 0.95 * v);
  g.closePath();
}

function drawShape(g: CanvasRenderingContext2D, t: number, col: string, v: number): void {
  g.lineJoin = 'round';
  switch (t) {
    case T_SMALL:
    case T_MED:
    case T_LARGE: {
      const R = v * 0.8;
      g.globalAlpha = 0.28;
      g.fillStyle = col;
      circle(g, v * 0.98);
      g.globalAlpha = 1;
      g.fillStyle = col;
      circle(g, R);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, R * 0.74);
      rg.addColorStop(0, '#ffffff');
      rg.addColorStop(0.62, '#ffffff');
      rg.addColorStop(1, col);
      g.fillStyle = rg;
      circle(g, R * 0.74);
      g.strokeStyle = 'rgba(255,255,255,0.55)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(0, 0, R, 0, Math.PI * 2);
      g.stroke();
      if (t === T_LARGE) {
        g.strokeStyle = 'rgba(255,255,255,0.7)';
        g.lineWidth = 1.1;
        g.beginPath();
        g.arc(0, 0, R * 0.88, 0, Math.PI * 2);
        g.stroke();
      }
      break;
    }
    case T_RICE: {
      g.globalAlpha = 0.3;
      g.fillStyle = col;
      g.beginPath();
      g.ellipse(0, 0, v, v * 0.6, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      g.beginPath();
      g.ellipse(0, 0, v * 0.92, v * 0.46, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.ellipse(0, 0, v * 0.58, v * 0.24, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case T_KUNAI: {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(v, 0);
      g.lineTo(-0.1 * v, 0.44 * v);
      g.lineTo(-0.55 * v, 0.18 * v);
      g.lineTo(-v, 0.34 * v);
      g.lineTo(-0.78 * v, 0);
      g.lineTo(-v, -0.34 * v);
      g.lineTo(-0.55 * v, -0.18 * v);
      g.lineTo(-0.1 * v, -0.44 * v);
      g.closePath();
      g.fill();
      g.strokeStyle = '#ffffff';
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(0.72 * v, 0);
      g.lineTo(-0.55 * v, 0);
      g.stroke();
      break;
    }
    case T_CROSS: {
      g.shadowColor = col;
      g.shadowBlur = 3 * SS;
      g.fillStyle = col;
      crossPath(g, v, 1);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      crossPath(g, v, 0.42);
      g.fill();
      break;
    }
    case T_STAR: {
      g.shadowColor = col;
      g.shadowBlur = 3 * SS;
      g.fillStyle = col;
      starPath(g, v * 0.98, v * 0.44);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      starPath(g, v * 0.5, v * 0.22);
      g.fill();
      break;
    }
    case T_HEART: {
      g.rotate(-Math.PI / 2);
      g.shadowColor = col;
      g.shadowBlur = 3 * SS;
      g.fillStyle = col;
      heartPath(g, v * 0.95);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#ffffff';
      g.save();
      g.scale(0.48, 0.48);
      heartPath(g, v * 0.95);
      g.fill();
      g.restore();
      break;
    }
    case T_PETAL: {
      g.shadowColor = col;
      g.shadowBlur = 2 * SS;
      g.fillStyle = col;
      petalPath(g, v * 0.95);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#fff4fb';
      g.beginPath();
      g.ellipse(0, 0.15 * v, 0.22 * v, 0.42 * v, 0, 0, Math.PI * 2);
      g.fill();
      break;
    }
  }
}

function glowSprite(col: string): HTMLCanvasElement {
  const size = 64;
  const c = mk(size, size);
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  rg.addColorStop(0, col);
  rg.addColorStop(0.25, col);
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.55;
  g.fillStyle = rg;
  g.fillRect(0, 0, size, size);
  return c;
}

export function buildSprites(): SpriteSet {
  const core: HTMLCanvasElement[] = [];
  const glow: HTMLCanvasElement[] = [];
  for (let t = 0; t < N_TYPES; t++) {
    const v = TYPE_VIS[t];
    for (let c = 0; c < N_COLORS; c++) {
      const size = v * 2 * SS;
      const cv = mk(size, size);
      const g = cv.getContext('2d')!;
      g.translate(cv.width / 2, cv.height / 2);
      g.scale(SS, SS);
      drawShape(g, t, COLORS[c], v);
      core.push(cv);
    }
  }
  for (let c = 0; c < N_COLORS; c++) glow.push(glowSprite(COLORS[c]));
  return { core, glow, glowCrimson: glowSprite('#ff2d55') };
}

const CHARS = '0123456789.-+x%';

export function buildDigits(color: string, font: string): DigitAtlas {
  const fs = 48;
  const cw = Math.ceil(fs * 0.66);
  const ch = Math.ceil(fs * 1.25);
  const c = mk(cw * CHARS.length, ch);
  const g = c.getContext('2d')!;
  g.font = `700 ${fs}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  for (let i = 0; i < CHARS.length; i++) {
    const x = i * cw + cw / 2;
    const y = ch / 2 + 2;
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineWidth = 8;
    g.strokeText(CHARS[i], x, y);
    g.fillStyle = color;
    g.fillText(CHARS[i], x, y);
  }
  return { canvas: c, cw, ch };
}

export const DIGIT_DOT = 10;
export const DIGIT_MINUS = 11;
export const DIGIT_PLUS = 12;
export const DIGIT_X = 13;
