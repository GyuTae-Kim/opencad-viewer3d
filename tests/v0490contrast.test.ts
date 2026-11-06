/**
 * 0.49.0 밝은 테마 고른 것 강조색의 색맹 구별(48차가 남긴 것): 0.48.0 #b87700은 측정색·공구 표시색과 밝기가 같아 적록 색맹 모의(Machado 2009 + CIEDE2000)에서
 * 거의 같은 색이었다(제2색맹 3.0·2.8). 주황 계열을 지키며 어둡게(#8a4500) 해 밝기로 가른다 — 바탕 대비 3:1 이상, 강조색과 다른 테마 색의 차가 시각 넷 모두에서 11.4 이상,
 * 물들인 그물이 그대로인 그물과 갈림, 바뀐 것은 밝은 테마 강조색 하나뿐, 뷰어가 새 색으로 그리고 덮는 길은 그대로
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VISIONS, type Vision, de2000, hue, lab, simulate } from './cvd';
import { installDom } from './fakedom';
import { DARK_THEME, LIGHT_THEME, type Viewer3dTheme, contrastRatio, overBackground, parseColor } from '../src/theme';
import type { Rgba } from '../src/types';
import { Viewer3d } from '../src/viewer';

const R48: Viewer3dTheme = { ...LIGHT_THEME, highlight: '#b87700' };
const rgba = (s: string): Rgba => parseColor(s)!;
const onBg = (th: Viewer3dTheme, k: keyof Viewer3dTheme): Rgba => overBackground(rgba(th[k] as string), rgba(th.background));
const d = (th: Viewer3dTheme, k: keyof Viewer3dTheme, v: Vision): number => +de2000(simulate(onBg(th, 'highlight'), v), simulate(onBg(th, k), v)).toFixed(1);
/** 강조색과 견줄 테마 색(그림에 함께 나오는 색) */
const OTHERS = ['measure', 'marker', 'axisX', 'axisY', 'axisZ', 'section', 'inference'] as const;
const minOver = (th: Viewer3dTheme): number => Math.min(...OTHERS.flatMap((k) => VISIONS.map((v) => d(th, k, v))));

describe('밝은 테마 강조색 #8a4500', () => {
  it('바뀐 것은 밝은 테마 강조색 하나뿐(#b87700 → #8a4500), 어두운 테마 강조색 #ffb44c 그대로', () => {
    expect(LIGHT_THEME.highlight).toBe('#8a4500');
    expect({ ...LIGHT_THEME, highlight: '#b87700' }).toEqual(R48);
    expect(DARK_THEME.highlight).toBe('#ffb44c');
  });

  it('바탕과 3:1 이상(3.39 → 6.57 — WCAG 1.4.11), 주황 계열(색상 30°, 어두운 테마 35°와 같은 계열)', () => {
    const r = (th: Viewer3dTheme): number => +contrastRatio(rgba(th.highlight), rgba(th.background)).toFixed(2);
    expect([r(R48), r(LIGHT_THEME)]).toEqual([3.39, 6.57]);
    const h = hue(rgba(LIGHT_THEME.highlight));
    expect(h).toBeGreaterThan(25);
    expect(h).toBeLessThan(45);
    expect(Math.abs(h - hue(rgba(DARK_THEME.highlight)))).toBeLessThan(10);
  });

  it('밝기(L*)로 측정색·공구 표시색과 갈린다: 0.48.0은 55.5 대 51.2·56.5, 0.49.0은 37.2(14 이상 어둡다)', () => {
    const L = (th: Viewer3dTheme, k: keyof Viewer3dTheme): number => +lab(onBg(th, k))[0].toFixed(1);
    expect([L(R48, 'highlight'), L(R48, 'measure'), L(R48, 'marker')]).toEqual([55.5, 51.2, 56.5]);
    expect(L(LIGHT_THEME, 'highlight')).toBe(37.2);
    for (const k of ['measure', 'marker'] as const) expect(L(LIGHT_THEME, k) - L(LIGHT_THEME, 'highlight')).toBeGreaterThanOrEqual(14);
  });

  it('적록 색맹 모의에서 측정색과 3.0 → 15.0(제1색맹 6.4 → 11.4), 공구 표시색과 2.8 → 21.0(4.3 → 14.6)', () => {
    const row = (th: Viewer3dTheme, k: keyof Viewer3dTheme): number[] => VISIONS.map((v) => d(th, k, v));
    // [정상, 제1, 제2, 제3색맹]
    expect(row(R48, 'measure')).toEqual([11.5, 6.4, 3, 6.9]);
    expect(row(LIGHT_THEME, 'measure')).toEqual([13.9, 11.4, 15, 13.8]);
    expect(row(R48, 'marker')).toEqual([18.4, 4.3, 2.8, 8.7]);
    expect(row(LIGHT_THEME, 'marker')).toEqual([21.2, 14.6, 21, 20.2]);
  });

  it('강조색과 함께 나오는 테마 색(측정·공구 표시·축 셋·단면·추론) 모두와 시각 넷에서 11.4 이상(0.48.0 최소 2.8) — 다른 짝을 3 아래로 버리지 않았다', () => {
    expect(minOver(R48)).toBe(2.8);
    expect(minOver(LIGHT_THEME)).toBe(11.4);
    // 0.48.0에서 낮던 짝: Y축 제1색맹 4.7 → 18.3, X축 제3색맹 6.9 → 19.5
    expect([d(R48, 'axisY', 'protan'), d(LIGHT_THEME, 'axisY', 'protan')]).toEqual([4.7, 18.3]);
    expect([d(R48, 'axisX', 'tritan'), d(LIGHT_THEME, 'axisX', 'tritan')]).toEqual([6.9, 19.5]);
  });

  it('물들인 그물(그물 색과 강조색을 반씩 — 셰이더 mix 0.5)이 그대로인 그물과 시각 넷 모두에서 15 넘게 갈린다(밝은 회색·나무·강철·어두운 회색)', () => {
    const meshes: Rgba[] = [[0.8, 0.8, 0.8, 1], [0.82, 0.71, 0.55, 1], [0.6, 0.66, 0.74, 1], [0.35, 0.35, 0.38, 1]];
    const hi = onBg(LIGHT_THEME, 'highlight');
    for (const m of meshes) {
      const t: Rgba = [(m[0] + hi[0]) / 2, (m[1] + hi[1]) / 2, (m[2] + hi[2]) / 2, 1];
      for (const v of VISIONS) expect(de2000(simulate(t, v), simulate(m, v)), `${m} ${v}`).toBeGreaterThan(15);
    }
  });
});

// ───────────── 뷰어 ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  dom.restore();
});
const colorsOf = (v: Viewer3d): { highlight: Rgba } => (v as unknown as { colors: { highlight: Rgba } }).colors;
const themeOf = (v: Viewer3d): Viewer3dTheme => (v as unknown as { theme: Viewer3dTheme }).theme;
const near = (a: Rgba, b: Rgba): void => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 6));

describe('뷰어', () => {
  it("theme 'light'는 새 강조색으로 그리고 측정색은 그대로, theme 객체로 0.48.0 강조색을 되돌릴 수 있다", () => {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { theme: 'light', animate: false, keyboard: false });
    views.push(v);
    near(colorsOf(v).highlight, rgba('#8a4500'));
    expect([themeOf(v).highlight, themeOf(v).measure, themeOf(v).marker]).toEqual(['#8a4500', '#c25e00', '#e0602a']);
    const old = new Viewer3d(dom.host() as unknown as HTMLElement, { theme: { base: 'light', highlight: '#b87700' }, animate: false, keyboard: false });
    views.push(old);
    near(colorsOf(old).highlight, rgba('#b87700'));
  });
});
