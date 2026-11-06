/**
 * 0.48.0 밝은 테마 Y축·고른 것 강조색 대비(SKP 47차 요청 — WCAG 1.4.11 그래픽 3:1): 두 테마의 축 셋·강조색이 테마 바탕과 3:1 이상(0.47.0 밝은 Y축 2.52·강조색 2.81),
 * 축 색 관례(X 빨강·Y 초록·Z 파랑)와 강조색 주황 계열, 적록 색맹 모의(Machado 2009 — 선형 RGB)에서 X·Y의 CIEDE2000 차, 바뀐 것은 밝은 테마 두 색뿐,
 * 뷰어가 새 색으로 그리고 앱의 CSS 변수·테마 덮기 길은 그대로
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installDom } from './fakedom';
import { DARK_THEME, LIGHT_THEME, type Viewer3dTheme, contrastRatio, overBackground, parseColor } from '../src/theme';
import type { Rgba } from '../src/types';
import { Viewer3d } from '../src/viewer';

/** 0.47.0 밝은 테마의 두 색 */
const OLD_LIGHT = { axisY: 'rgba(40,150,40,0.75)', highlight: '#e07800' };
const rgba = (s: string): Rgba => parseColor(s)!;
const onBg = (th: Viewer3dTheme, k: keyof Viewer3dTheme): Rgba => overBackground(rgba(th[k] as string), rgba(th.background));
const ratio = (th: Viewer3dTheme, k: keyof Viewer3dTheme): number => contrastRatio(rgba(th[k] as string), rgba(th.background));

// ── 색맹 모의·색 차(시험 안에서만) ──
const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number): number => {
  const x = Math.min(1, Math.max(0, v));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};
/** Machado·Oliveira·Fernandes 2009 심한 정도 1.0 */
const CVD = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
} as const;
function simulate(c: Rgba, kind: keyof typeof CVD): Rgba {
  const m = CVD[kind];
  const l = [lin(c[0]), lin(c[1]), lin(c[2])] as const;
  return [gam(m[0] * l[0] + m[1] * l[1] + m[2] * l[2]), gam(m[3] * l[0] + m[4] * l[1] + m[5] * l[2]), gam(m[6] * l[0] + m[7] * l[1] + m[8] * l[2]), 1];
}
function lab(c: Rgba): [number, number, number] {
  const r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
  const X = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047), Y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b), Z = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
/** CIEDE2000 */
function de2000(c1: Rgba, c2: Rgba): number {
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
function hue(c: Rgba): number {
  const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('테마 색 대비(WCAG 1.4.11 — 3:1)', () => {
  it('0.47.0 밝은 테마 Y축·강조색은 바탕과 3:1이 안 됐다(앱이 잰 2.52·2.81)', () => {
    const old = { ...LIGHT_THEME, ...OLD_LIGHT };
    expect(+ratio(old, 'axisY').toFixed(2)).toBe(2.52);
    expect(+ratio(old, 'highlight').toFixed(2)).toBe(2.81);
  });

  it('두 테마의 X·Y·Z축과 강조색이 테마 바탕과 3:1 이상(밝은 Y축 3.91·강조색 3.39, 어두운 테마는 0.47.0 그대로 3.09~8.42)', () => {
    for (const th of [DARK_THEME, LIGHT_THEME]) for (const k of ['axisX', 'axisY', 'axisZ', 'highlight'] as const) expect(ratio(th, k), k).toBeGreaterThanOrEqual(3);
    expect(+ratio(LIGHT_THEME, 'axisY').toFixed(2)).toBe(3.91);
    expect(+ratio(LIGHT_THEME, 'highlight').toFixed(2)).toBe(3.39);
    expect(['axisX', 'axisY', 'axisZ', 'highlight'].map((k) => +ratio(DARK_THEME, k as keyof Viewer3dTheme).toFixed(2))).toEqual([3.09, 4.89, 4.12, 8.42]);
  });

  it('축 색 관례(X 빨강·Y 초록·Z 파랑)와 강조색 주황 계열(두 테마 같은 계열)을 지킨다', () => {
    for (const th of [DARK_THEME, LIGHT_THEME]) {
      const [x, y, z] = [rgba(th.axisX), rgba(th.axisY), rgba(th.axisZ)];
      expect(x[0]).toBeGreaterThan(Math.max(x[1], x[2]));
      expect(y[1]).toBeGreaterThan(Math.max(y[0], y[2]));
      expect(z[2]).toBeGreaterThan(Math.max(z[0], z[1]));
      expect(hue(y)).toBeCloseTo(120, 0);
      const h = hue(rgba(th.highlight));
      expect(h).toBeGreaterThan(25);
      expect(h).toBeLessThan(45);
    }
  });

  it('적록 색맹 모의에서 X·Y축 차가 커졌다(밝은 제2색맹 3.4 → 9.3, 제1색맹은 19.1 → 13.6) — 두 테마 모두 8 이상', () => {
    const d = (th: Viewer3dTheme, kind: keyof typeof CVD): number => de2000(simulate(onBg(th, 'axisX'), kind), simulate(onBg(th, 'axisY'), kind));
    const old = { ...LIGHT_THEME, ...OLD_LIGHT };
    expect([+d(old, 'deutan').toFixed(1), +d(old, 'protan').toFixed(1)]).toEqual([3.4, 19.1]);
    expect([+d(LIGHT_THEME, 'deutan').toFixed(1), +d(LIGHT_THEME, 'protan').toFixed(1)]).toEqual([9.3, 13.6]);
    for (const th of [DARK_THEME, LIGHT_THEME]) for (const k of ['deutan', 'protan'] as const) expect(d(th, k)).toBeGreaterThan(8);
    // 정상 시각 차는 거의 그대로(61.1 → 60.6)
    expect(+de2000(onBg(LIGHT_THEME, 'axisX'), onBg(LIGHT_THEME, 'axisY')).toFixed(1)).toBe(60.6);
  });

  it('강조색은 측정색·공구 표시색과 정상 시각 차가 0.47.0보다 크다(9.7 → 11.5, 11.9 → 18.4)', () => {
    const old = { ...LIGHT_THEME, ...OLD_LIGHT };
    const d = (th: Viewer3dTheme, k: keyof Viewer3dTheme): number => +de2000(onBg(th, 'highlight'), onBg(th, k)).toFixed(1);
    expect([d(old, 'measure'), d(old, 'marker')]).toEqual([9.7, 11.9]);
    expect([d(LIGHT_THEME, 'measure'), d(LIGHT_THEME, 'marker')]).toEqual([11.5, 18.4]);
  });

  it('바뀐 것은 밝은 테마 Y축·강조색 둘뿐(어두운 테마·밝은 테마 다른 색은 0.47.0 그대로)', () => {
    expect(DARK_THEME).toEqual({
      background: '#212830',
      grid: 'rgba(255,255,255,0.16)',
      gridMinor: 'rgba(255,255,255,0.06)',
      axisX: 'rgba(235,95,95,0.75)',
      axisY: 'rgba(110,205,110,0.75)',
      axisZ: 'rgba(90,150,255,0.85)',
      edge: 'rgba(10,12,16,0.75)',
      text: '#e8ebf0',
      textBg: 'rgba(25,30,38,0.85)',
      highlight: '#ffb44c',
      measure: '#ffd24c',
      marker: '#ff8a3d',
      cubeFace: '#4a5564',
      cubeEdge: '#9aa6b5',
      cubeText: '#e8ebf0',
      cubeHover: 'rgba(61,149,240,0.75)',
      section: '#ff5fa2',
      inference: '#f062f0',
    });
    expect({ ...LIGHT_THEME, ...OLD_LIGHT }).toEqual({
      background: '#f4f5f7',
      grid: 'rgba(0,0,0,0.18)',
      gridMinor: 'rgba(0,0,0,0.065)',
      axisX: 'rgba(205,50,50,0.75)',
      axisY: 'rgba(40,150,40,0.75)',
      axisZ: 'rgba(40,90,220,0.85)',
      edge: 'rgba(20,24,30,0.7)',
      text: '#1d2530',
      textBg: 'rgba(255,255,255,0.88)',
      highlight: '#e07800',
      measure: '#c25e00',
      marker: '#e0602a',
      cubeFace: '#e2e6ec',
      cubeEdge: '#8a95a3',
      cubeText: '#1d2530',
      cubeHover: 'rgba(31,111,209,0.6)',
      section: '#d0246e',
      inference: '#b31ab3',
    });
    expect([LIGHT_THEME.axisY, LIGHT_THEME.highlight]).toEqual(['rgba(25,120,25,0.85)', '#b87700']);
  });
});

// ───────────── 뷰어: 새 색으로 그리고, 앱이 덮는 길은 그대로 ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
let cssVars: Record<string, string> = {};
beforeAll(() => {
  dom = installDom();
  (globalThis as Record<string, unknown>).getComputedStyle = () => ({ position: 'relative', getPropertyValue: (k: string) => cssVars[k] ?? '' });
});
afterAll(() => {
  for (const v of views) v.dispose();
  dom.restore();
});
/** 뷰어가 그리기에 넘기는 색(테마를 고른 뒤 — private colors) */
const colorsOf = (v: Viewer3d): { axisY: Rgba; highlight: Rgba } => (v as unknown as { colors: { axisY: Rgba; highlight: Rgba } }).colors;
const near = (a: Rgba, b: Rgba): void => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 6));

describe('뷰어', () => {
  it("theme 'light'·setTheme('light')는 새 Y축·강조색으로 그린다(어두운 테마는 그대로)", () => {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { theme: 'light', animate: false, keyboard: false });
    views.push(v);
    near(colorsOf(v).axisY, rgba(LIGHT_THEME.axisY));
    near(colorsOf(v).highlight, rgba('#b87700'));
    v.setTheme('dark');
    near(colorsOf(v).highlight, rgba('#ffb44c'));
    near(colorsOf(v).axisY, rgba(DARK_THEME.axisY));
    v.setTheme('light');
    near(colorsOf(v).highlight, rgba('#b87700'));
  });

  it('앱이 색을 덮는 길(테마 객체·CSS 변수 --v3d-axis-y·--v3d-highlight)은 그대로 이긴다', () => {
    const a = new Viewer3d(dom.host() as unknown as HTMLElement, { theme: { base: 'light', highlight: '#e07800', axisY: 'rgba(40,150,40,0.75)' }, animate: false, keyboard: false });
    views.push(a);
    near(colorsOf(a).highlight, rgba('#e07800'));
    near(colorsOf(a).axisY, rgba('rgba(40,150,40,0.75)'));
    cssVars = { '--v3d-highlight': '#123456', '--v3d-axis-y': 'rgb(0, 128, 0)' };
    const b = new Viewer3d(dom.host() as unknown as HTMLElement, { theme: 'light', animate: false, keyboard: false });
    views.push(b);
    cssVars = {};
    near(colorsOf(b).highlight, rgba('#123456'));
    near(colorsOf(b).axisY, rgba('rgb(0, 128, 0)'));
  });
});
