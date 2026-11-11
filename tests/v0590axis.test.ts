/**
 * 0.59.0 파일 배경에 맞는 좌표축 대비(SKP 64차 요청): 앱이 준 바탕에서 축 색이 3:1에 닿지 않으면 같은 색상으로 가장 적게 고친다.
 * 순수 함수(회색 204·191·흰색·어두운 바탕, 닿지 못하는 비, 눈금·CSS 글)와 뷰어(기본은 그대로, axisContrast 켜기, setBackground 한 색·기울기, CSS 변수, 격자 축·축 표시에 가는 색)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installDom } from './fakedom';
import { DARK_THEME, LIGHT_THEME, type Viewer3dTheme, contrastRatio, cssRgba, fitContrast, overBackground, parseColor } from '../src/theme';
import type { Rgba } from '../src/types';
import { Viewer3d } from '../src/viewer';

const rgba = (s: string): Rgba => parseColor(s)!;
const g = (v: number): Rgba => [v / 255, v / 255, v / 255, 1];
const r2 = (x: number): number => +x.toFixed(2);
const AXES = ['axisX', 'axisY', 'axisZ'] as const;
const ratios = (th: Viewer3dTheme, bg: Rgba): number[] => AXES.map((k) => r2(contrastRatio(rgba(th[k]), bg)));
/** 색상(도) — 고친 뒤에도 같은 빨강·초록·파랑인지 */
function hue(c: Rgba): number {
  const [r, gg, b] = c;
  const max = Math.max(r, gg, b), d = max - Math.min(r, gg, b);
  if (d === 0) return 0;
  const h = max === r ? ((gg - b) / d) % 6 : max === gg ? (b - r) / d + 2 : (r - gg) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('fitContrast(순수 함수)', () => {
  it('출발점: 밝은 테마 축은 회색 204에서 X 2.54·Y 2.89, 회색 191에서 X 2.31·Y 2.59·Z 2.70(앱 계산 2.88·2.32·2.60·2.71과 반올림 차이)', () => {
    expect(ratios(LIGHT_THEME, g(204)).slice(0, 2)).toEqual([2.54, 2.89]);
    expect(ratios(LIGHT_THEME, g(191))).toEqual([2.31, 2.59, 2.7]);
  });

  it.each([
    ['회색 204', g(204)],
    ['회색 191', g(191)],
    ['회색 128', g(128)],
    ['회색 100', g(100)],
    ['흰색', g(255)],
    ['검정', g(0)],
    ['어두운 테마 바탕', rgba(DARK_THEME.background)],
    ['밝은 테마 바탕', rgba(LIGHT_THEME.background)],
  ])('%s: 밝은·어두운 테마의 축 셋 모두 고친 뒤 3:1 이상', (_n, bg) => {
    for (const th of [LIGHT_THEME, DARK_THEME]) for (const k of AXES) expect(contrastRatio(fitContrast(rgba(th[k]), bg), bg)).toBeGreaterThanOrEqual(3);
  });

  it('이미 닿으면 받은 값을 그대로 돌려준다(같은 그림 — 흰색·테마 바탕의 밝은 테마 축)', () => {
    for (const k of AXES) {
      const c = rgba(LIGHT_THEME[k]);
      expect(fitContrast(c, g(255))).toBe(c);
    }
    const yes: Rgba = [0, 0, 0, 1];
    expect(fitContrast(yes, g(204))).toBe(yes);
  });

  it('회색 204: 불투명도만 올린다(색은 그대로, 가장 적게 — 한 눈금 낮추면 3:1 아래로), Z는 이미 닿아 그대로', () => {
    const bg = g(204);
    for (const k of ['axisX', 'axisY'] as const) {
      const was = rgba(LIGHT_THEME[k]);
      const fit = fitContrast(was, bg);
      expect(fit.slice(0, 3)).toEqual(was.slice(0, 3));
      expect(fit[3]).toBeGreaterThan(was[3]);
      expect(fit[3]).toBeLessThan(1);
      expect(contrastRatio([fit[0], fit[1], fit[2], fit[3] - 1 / 255], bg)).toBeLessThan(3.03);
    }
    const z = rgba(LIGHT_THEME.axisZ);
    expect(fitContrast(z, bg)).toBe(z);
    expect(r2(contrastRatio(fitContrast(rgba(LIGHT_THEME.axisX), bg), bg))).toBeGreaterThanOrEqual(3.03);
  });

  it('불투명으로도 모자라면 색이 놓인 쪽으로 섞고 색상을 지킨다(밝은 바탕에서 더 어둡게, 어두운 바탕에서 더 밝게)', () => {
    const red = rgba('rgb(205,50,50)');
    const onGrey = fitContrast(red, g(150));
    expect(onGrey[3]).toBe(1);
    expect(onGrey[0]).toBeLessThan(red[0]);
    expect(Math.abs(hue(onGrey) - hue(red))).toBeLessThan(2);
    expect(contrastRatio(onGrey, g(150))).toBeGreaterThanOrEqual(3);
    const darkRed = rgba('rgb(120,30,30)');
    const onDark = fitContrast(darkRed, g(20));
    expect(onDark[0]).toBeGreaterThan(darkRed[0]);
    expect(Math.abs(hue(onDark) - hue(darkRed))).toBeLessThan(2);
    expect(contrastRatio(onDark, g(20))).toBeGreaterThanOrEqual(3);
  });

  it('고친 값은 0~255 눈금 위 — CSS 글로 옮겨 다시 읽어도 대비가 같다', () => {
    for (const bg of [g(204), g(191), g(150), g(40)]) {
      for (const th of [LIGHT_THEME, DARK_THEME]) {
        for (const k of AXES) {
          const fit = fitContrast(rgba(th[k]), bg);
          const back = rgba(cssRgba(fit));
          expect(back[0] * 255).toBeCloseTo(Math.round(fit[0] * 255), 6);
          expect(contrastRatio(back, bg)).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('8비트로 얹어 반올림해도 3:1 아래로 내려가지 않는다(여유 0.03)', () => {
    const round = (c: Rgba): Rgba => [Math.round(c[0] * 255) / 255, Math.round(c[1] * 255) / 255, Math.round(c[2] * 255) / 255, 1];
    for (let v = 0; v <= 255; v += 5) {
      const bg = g(v);
      for (const th of [LIGHT_THEME, DARK_THEME]) {
        for (const k of AXES) expect(contrastRatio(round(overBackground(fitContrast(rgba(th[k]), bg), bg)), bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('닿지 못하는 비(가운데 밝기에서 5:1)는 검정·흰색 가운데 더 대비하는 것, 닿는 쪽이 반대면 그쪽으로(바탕을 건너)', () => {
    const c = rgba('rgb(200,60,60)');
    const best = fitContrast(c, g(118), 5);
    expect([contrastRatio([0, 0, 0, 1], g(118)) < 5, contrastRatio([1, 1, 1, 1], g(118)) < 5]).toEqual([true, true]);
    expect([best[0], best[1], best[2]]).toEqual(contrastRatio([0, 0, 0, 1], g(118)) >= contrastRatio([1, 1, 1, 1], g(118)) ? [0, 0, 0] : [1, 1, 1]);
    // 색은 바탕보다 밝은데 흰색으로는 4:1에 못 닿고 검정으로는 닿는 바탕(회색 165 — 흰색 2.5:1, 검정 8.4:1)
    const light = rgba('rgb(255,200,200)');
    const crossed = fitContrast(light, g(165), 4);
    expect(contrastRatio(crossed, g(165))).toBeGreaterThanOrEqual(4);
    expect(crossed[0]).toBeLessThan(165 / 255);
  });

  it('min을 주면 그 비로(회색 204에 4.5:1)', () => {
    for (const k of AXES) expect(contrastRatio(fitContrast(rgba(LIGHT_THEME[k]), g(204), 4.5), g(204))).toBeGreaterThanOrEqual(4.5);
  });

  it('고쳐도 세 축의 색상은 갈린 채다(회색 204·191, 어두운 테마를 밝은 회색 위에)', () => {
    for (const bg of [g(204), g(191)]) {
      for (const th of [LIGHT_THEME, DARK_THEME]) {
        const h = AXES.map((k) => hue(fitContrast(rgba(th[k]), bg)));
        expect(Math.abs(h[0]! - h[1]!)).toBeGreaterThan(60);
        expect(Math.abs(h[1]! - h[2]!)).toBeGreaterThan(60);
      }
    }
  });

  it('cssRgba: 정수 색·넷째 자리 알파, 범위 밖은 자른다', () => {
    expect(cssRgba([1, 0, 0.5, 0.5])).toBe('rgba(255,0,128,0.5)');
    expect(cssRgba([2, -1, 0, 1.5])).toBe('rgba(255,0,0,1)');
    expect(cssRgba([0, 0, 0, 200 / 255])).toBe('rgba(0,0,0,0.7843)');
  });
});

describe('뷰어 theme.axisContrast', () => {
  let dom: ReturnType<typeof installDom>;
  const views: Viewer3d[] = [];
  beforeAll(() => {
    dom = installDom();
  });
  afterAll(() => {
    for (const v of views) v.dispose();
    dom.restore();
  });
  type Theme = NonNullable<ConstructorParameters<typeof Viewer3d>[1]>['theme'];
  const make = (theme: Theme): Viewer3d => {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { theme, animate: false, keyboard: false });
    views.push(v);
    return v;
  };
  const themeOf = (v: Viewer3d): Viewer3dTheme => (v as unknown as { theme: Viewer3dTheme }).theme;
  const colorsOf = (v: Viewer3d): { axisX: Rgba; axisY: Rgba } => (v as unknown as { colors: { axisX: Rgba; axisY: Rgba } }).colors;

  it('주지 않으면 지금과 같은 색 글 그대로(회색 204에서도 — 기본 그림 그대로)', () => {
    const th = themeOf(make({ base: 'light', background: '#cccccc' }));
    for (const k of AXES) expect(th[k]).toBe(LIGHT_THEME[k]);
    expect('axisContrast' in th).toBe(false);
  });

  it('false·1 이하·수 아닌 값은 끈다', () => {
    for (const axisContrast of [false, 1, 0, -2, Number.NaN]) {
      const th = themeOf(make({ base: 'light', background: '#cccccc', axisContrast }));
      for (const k of AXES) expect(th[k]).toBe(LIGHT_THEME[k]);
    }
  });

  it('true면 회색 204·191 위 축이 3:1 이상이고 격자 축 색(렌더러로 가는 값)도 같은 값이다', () => {
    for (const [hex, bg] of [['#cccccc', g(204)], ['#bfbfbf', g(191)]] as const) {
      const v = make({ base: 'light', background: hex, axisContrast: true });
      const th = themeOf(v);
      for (const k of AXES) expect(contrastRatio(rgba(th[k]), bg)).toBeGreaterThanOrEqual(3);
      expect(colorsOf(v).axisX).toEqual(rgba(th.axisX));
      expect(colorsOf(v).axisY).toEqual(rgba(th.axisY));
      expect('axisContrast' in th).toBe(false);
    }
  });

  it('이미 닿는 축의 글은 그대로 둔다(회색 204의 Z, 테마 바탕 흰색의 셋 모두)', () => {
    expect(themeOf(make({ base: 'light', background: '#cccccc', axisContrast: true })).axisZ).toBe(LIGHT_THEME.axisZ);
    const th = themeOf(make({ base: 'light', background: '#ffffff', axisContrast: true }));
    for (const k of AXES) expect(th[k]).toBe(LIGHT_THEME[k]);
  });

  it('수를 주면 그 비로', () => {
    const th = themeOf(make({ base: 'light', background: '#cccccc', axisContrast: 4.5 }));
    for (const k of AXES) expect(contrastRatio(rgba(th[k]), g(204))).toBeGreaterThanOrEqual(4.5);
  });

  it('앱이 준 축 색도 고친다', () => {
    const th = themeOf(make({ base: 'light', background: '#cccccc', axisX: '#ff8080', axisContrast: true }));
    expect(contrastRatio(rgba(th.axisX), g(204))).toBeGreaterThanOrEqual(3);
  });

  it('setTheme으로 켜고 끈다(끄면 테마 색으로 돌아온다)', () => {
    const v = make('light');
    expect(themeOf(v).axisX).toBe(LIGHT_THEME.axisX);
    v.setTheme({ base: 'light', background: '#cccccc', axisContrast: true });
    expect(themeOf(v).axisX).not.toBe(LIGHT_THEME.axisX);
    v.setTheme({ base: 'light', background: '#cccccc' });
    expect(themeOf(v).axisX).toBe(LIGHT_THEME.axisX);
  });

  it('setBackground 한 색이 있으면 그 색에 맞추고, 바꾸거나 지우면 다시 고른다', () => {
    const v = make({ base: 'light', axisContrast: true });
    expect(themeOf(v).axisX).toBe(LIGHT_THEME.axisX);
    v.setBackground({ color: '#bfbfbf' });
    expect(contrastRatio(rgba(themeOf(v).axisX), g(191))).toBeGreaterThanOrEqual(3);
    v.setBackground({ color: [0.8, 0.8, 0.8, 1] });
    expect(contrastRatio(rgba(themeOf(v).axisX), [0.8, 0.8, 0.8, 1])).toBeGreaterThanOrEqual(3);
    v.setBackground(null);
    expect(themeOf(v).axisX).toBe(LIGHT_THEME.axisX);
  });

  it('기울기 바탕(sky·ground)은 보지 않고 테마 바탕에 맞춘다', () => {
    const v = make({ base: 'light', background: '#cccccc', axisContrast: true });
    const before = themeOf(v).axisX;
    v.setBackground({ sky: '#000000', ground: '#000000' });
    expect(themeOf(v).axisX).toBe(before);
  });

  it('끈 뷰어의 setBackground는 테마를 다시 읽지 않는다(지금과 같은 길)', () => {
    const v = make({ base: 'light', background: '#cccccc' });
    const before = themeOf(v);
    v.setBackground({ color: '#bfbfbf' });
    expect(themeOf(v)).toBe(before);
  });

  it('CSS 변수로 준 축 색·바탕도 본다', () => {
    const host = dom.host() as unknown as HTMLElement;
    const gcs = globalThis.getComputedStyle;
    const vars: Record<string, string> = { '--v3d-bg': '#cccccc', '--v3d-axis-x': 'rgba(205,50,50,0.5)' };
    (globalThis as { getComputedStyle: unknown }).getComputedStyle = () => ({ position: 'relative', getPropertyValue: (k: string) => vars[k] ?? '' });
    try {
      const v = new Viewer3d(host, { theme: { base: 'light', axisContrast: true }, animate: false, keyboard: false });
      views.push(v);
      expect(contrastRatio(rgba(themeOf(v).axisX), g(204))).toBeGreaterThanOrEqual(3);
    } finally {
      (globalThis as { getComputedStyle: unknown }).getComputedStyle = gcs;
    }
  });

  it('왼쪽 아래 축 표시·격자 축은 고친 색으로 그린다', () => {
    const v = make({ base: 'light', background: '#cccccc', axisContrast: true });
    v.setScene({ name: 's', units: 'mm', meshes: [], lines: [{ id: 'l', positions: new Float32Array([0, 0, 0, 10, 0, 0]), color: [0, 0, 0, 1] }] });
    v.fit(false);
    const ctx = (v as unknown as { octx: { strokeStyle: unknown } }).octx;
    const seen: unknown[] = [];
    const proto = ctx as unknown as Record<string, unknown>;
    let cur: unknown = '';
    Object.defineProperty(proto, 'strokeStyle', { configurable: true, get: () => cur, set: (x) => { cur = x; seen.push(x); } });
    v.renderNow();
    delete proto.strokeStyle;
    const th = themeOf(v);
    for (const k of AXES) expect(seen).toContain(th[k]);
  });
});
