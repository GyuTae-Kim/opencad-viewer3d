/**
 * 시험에서만 쓰는 색 계산(0.48.0 v0480contrast에서 옮김 — 0.49.0 v0490contrast도 쓴다): 색맹 모의(Machado·Oliveira·Fernandes 2009, 심한 정도 1.0 — 선형 RGB),
 * CIELAB·CIEDE2000 색 차, HSL 색상각. 코어 코드는 대비(contrastRatio)만 쓰고 이것들은 내보내지 않는다
 */
import type { Rgba } from '../src/types';

const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number): number => {
  const x = Math.min(1, Math.max(0, v));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};
/** Machado·Oliveira·Fernandes 2009 심한 정도 1.0(제1·제2·제3색맹) */
export const CVD = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
} as const;
export type Vision = 'normal' | keyof typeof CVD;
export const VISIONS: readonly Vision[] = ['normal', 'protan', 'deutan', 'tritan'];

/** 색맹 모의(normal은 그대로) */
export function simulate(c: Rgba, kind: Vision): Rgba {
  if (kind === 'normal') return c;
  const m = CVD[kind];
  const l = [lin(c[0]), lin(c[1]), lin(c[2])] as const;
  return [gam(m[0] * l[0] + m[1] * l[1] + m[2] * l[2]), gam(m[3] * l[0] + m[4] * l[1] + m[5] * l[2]), gam(m[6] * l[0] + m[7] * l[1] + m[8] * l[2]), 1];
}

/** sRGB → CIELAB(D65) */
export function lab(c: Rgba): [number, number, number] {
  const r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const X = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047), Y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b), Z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** CIEDE2000 */
export function de2000(c1: Rgba, c2: Rgba): number {
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2);
  const rad = Math.PI / 180;
  const Cb = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hp = (b: number, a: number): number => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1 = hp(b1, ap1), h2 = hp(b2, ap2);
  let dh = Cp1 * Cp2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  const hb = Cp1 * Cp2 === 0 ? h1 + h2 : Math.abs(h1 - h2) > 180 ? (h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2) : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const RC = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T;
  const RT = -Math.sin(2 * 30 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad) * RC;
  const dC = Cp2 - Cp1;
  return Math.sqrt(((L2 - L1) / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

/** 색상각(도, HSL) */
export function hue(c: Rgba): number {
  const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
