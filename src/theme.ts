/**
 * 뷰어 색: 밝은·어두운 테마. 호스트 요소의 CSS 변수(--v3d-*)가 있으면 그 값을 쓴다.
 */
import type { Rgba } from './types';

export interface Viewer3dTheme {
  /** 배경 */
  background: string;
  /** 큰 칸 격자 */
  grid: string;
  /** 작은 칸 격자 */
  gridMinor: string;
  /** 격자 위 X축·Y축 선 */
  axisX: string;
  axisY: string;
  axisZ: string;
  /** 음영 면 위 윤곽선 */
  edge: string;
  /** 덧그림 글자(측정 등) */
  text: string;
  /** 덧그림 글자 배경 */
  textBg: string;
  /** 강조(고른 것) */
  highlight: string;
  /** 측정선 */
  measure: string;
  /** 공구 표시 */
  marker: string;
  cubeFace: string;
  cubeEdge: string;
  cubeText: string;
  cubeHover: string;
  /** 단면 테두리(교선)·평면 표시(없으면 기본 테마 값) */
  section?: string;
  /** 단색 모드(monochrome) 면 색(없으면 밝은 회색) */
  monochrome?: string;
}

export const DARK_THEME: Viewer3dTheme = {
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
};

export const LIGHT_THEME: Viewer3dTheme = {
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
};

/**
 * 3D 캔버스 자리 스타일(0.9.0). 0.8.0까지는 여기에 outline:none을 직접 두어 키보드 초점이 보이지 않았다(앱이 !important로 덮어야 했다)
 */
export const CANVAS_CSS = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';

/**
 * 누르기(마우스·터치·펜)로 받은 초점 표시(0.9.1): 캔버스에 data-v3d-focus="pointer"를 달고, CANVAS_FOCUS_CSS가 그동안 테두리를 감춘다.
 * Tab(초점 옮기기)을 누르거나 초점이 캔버스를 떠나면 뗀다
 */
export const POINTER_FOCUS_ATTR = 'data-v3d-focus';

/**
 * 캔버스 초점 테두리(0.9.0, 뷰어 상자 안 <style>로 넣는다): 마우스·터치로 누를 때는 테두리가 없고, 키보드로 초점이 오면(:focus-visible)
 * 캔버스 안쪽 2화소 테두리. 색은 CSS 변수 --v3d-focus(없으면 테마 기본 — 어두운 #5aa9ff, 밝은 #1f6fd1, 둘 다 바탕과 3:1 넘음).
 * :where()로 구체성을 낮춰 앱이 .v3d-gl:focus-visible 같은 보통 규칙으로 바꿀 수 있다(!important 필요 없음).
 * 0.9.1: 누르기로 받은 초점(data-v3d-focus="pointer")에서는 테두리를 감춘다. 키보드로 초점을 준 캔버스를 누르면 초점이 바뀌지 않아
 * 브라우저가 :focus-visible을 그대로 두기 때문이다. 이 규칙만 구체성이 (0,3,1)이라 앱의 .v3d-gl:focus-visible 같은 보통 규칙도 이긴다
 */
export const CANVAS_FOCUS_CSS =
  ':where(canvas.v3d-gl){outline:none}' +
  ':where(canvas.v3d-gl):focus-visible{outline:2px solid var(--v3d-focus,var(--v3d-focus-default,#3d95f0));outline-offset:-2px}' +
  `canvas.v3d-gl[${POINTER_FOCUS_ATTR}=pointer]:focus-visible{outline:none}`;

/** 초점 테두리를 다루는 캔버스(시험에서는 가짜 요소) */
export interface FocusRingTarget {
  focus(options?: FocusOptions): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  readonly ownerDocument: { readonly activeElement: unknown } | null;
}

/**
 * 누르기(마우스·터치·펜)로 캔버스에 초점을 줄 때(0.9.1): 초점을 주고 data-v3d-focus="pointer"를 단다.
 * 0.9.0은 focus({ focusVisible: false })만 했는데, 키보드로 이미 초점이 있던 캔버스는 초점이 바뀌지 않아 그 선택이 듣지 않았다
 * (Chrome 156: Tab → 누르기에도 :focus-visible 그대로). 초점을 뺐다 다시 주지 않으므로 blur·focus 사건이 나지 않는다
 */
export function pointerFocus(el: FocusRingTarget): void {
  el.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
  el.setAttribute(POINTER_FOCUS_ATTR, 'pointer');
}

/**
 * 캔버스의 키 누르기(0.9.1): Tab·Shift+Tab(초점 옮기기)이면 누르기 표시를 뗀다 — 키보드로 다시 초점이 오면 테두리가 보이게.
 * 그 밖의 키(F·1~7·걷기 키)는 그대로 둔다(브라우저도 마우스로 준 초점에서는 키를 눌러도 테두리를 보이지 않는다 — 걷기에서 끌어 둘러보며 키를 눌러도 깜박이지 않게)
 */
export function focusKey(el: FocusRingTarget, e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): void {
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) el.removeAttribute(POINTER_FOCUS_ATTR);
}

/**
 * 캔버스가 흐려질 때(0.9.1): 초점이 문서 안 다른 곳으로 갔으면 누르기 표시를 뗀다. 창만 흐려진 것(다른 앱·탭 — 문서의 초점은 캔버스 그대로)이면 두어,
 * 돌아왔을 때 테두리가 다시 나오지 않게 한다
 */
export function focusLeft(el: FocusRingTarget): void {
  if (el.ownerDocument?.activeElement !== el) el.removeAttribute(POINTER_FOCUS_ATTR);
}

/** 테마별 초점 테두리 기본색(--v3d-focus-default) */
export const FOCUS_DEFAULT = { dark: '#5aa9ff', light: '#1f6fd1' } as const;

/** CSS 변수 이름(호스트 요소나 조상에 두면 덮어쓴다) */
export const THEME_CSS_VARS: Record<keyof Viewer3dTheme, string> = {
  background: '--v3d-bg',
  grid: '--v3d-grid',
  gridMinor: '--v3d-grid-minor',
  axisX: '--v3d-axis-x',
  axisY: '--v3d-axis-y',
  axisZ: '--v3d-axis-z',
  edge: '--v3d-edge',
  text: '--v3d-fg',
  textBg: '--v3d-fg-bg',
  highlight: '--v3d-highlight',
  measure: '--v3d-measure',
  marker: '--v3d-marker',
  cubeFace: '--v3d-cube-face',
  cubeEdge: '--v3d-cube-edge',
  cubeText: '--v3d-cube-fg',
  cubeHover: '--v3d-cube-hover',
  section: '--v3d-section',
  monochrome: '--v3d-mono',
};

/**
 * CSS 색 → RGBA(0~1). #rgb #rgba #rrggbb #rrggbbaa, rgb()/rgba()(쉼표·빈칸·슬래시) 를 읽는다.
 * 못 읽으면 null(브라우저에서는 부르는 쪽이 캔버스로 정규화한 뒤 다시 읽는다).
 */
export function parseColor(s: string): Rgba | null {
  const t = s.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    const h = m[1]!;
    if (h.length === 3 || h.length === 4) {
      const v = [...h].map((c) => parseInt(c + c, 16) / 255);
      return [v[0]!, v[1]!, v[2]!, v[3] ?? 1];
    }
    if (h.length === 6 || h.length === 8) {
      const v: number[] = [];
      for (let i = 0; i < h.length; i += 2) v.push(parseInt(h.slice(i, i + 2), 16) / 255);
      return [v[0]!, v[1]!, v[2]!, v[3] ?? 1];
    }
    return null;
  }
  m = /^rgba?\(([^)]*)\)$/.exec(t);
  if (m) {
    const parts = m[1]!.split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (p: string): number => (p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p));
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const r = [ch(parts[0]!) / 255, ch(parts[1]!) / 255, ch(parts[2]!) / 255, a];
    if (r.some((x) => !Number.isFinite(x))) return null;
    return [r[0]!, r[1]!, r[2]!, r[3]!];
  }
  return null;
}

/** 상대 휘도(WCAG 2, sRGB 0~1 값 — 알파는 보지 않는다) */
export function relativeLuminance(c: Rgba): number {
  const ch = (v: number): number => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
}

/** 색 c를 알파대로 바탕 bg 위에 얹은 색(불투명) */
export function overBackground(c: Rgba, bg: Rgba): Rgba {
  const a = Math.min(1, Math.max(0, c[3]));
  return [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a), 1];
}

/** 대비 비(WCAG 2, 1~21). fg는 알파대로 bg 위에 얹어 잰다 */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const a = relativeLuminance(overBackground(fg, bg)), b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** 선 대비 기준(WCAG 그래픽 요소 3:1) */
export const LINE_CONTRAST_MIN = 3;

/**
 * 바탕 위에서 보일 선 색(0.8.0 — 외곽선·윤곽선 'contrast'): color가 바탕과 min:1 이상 대비하면 그대로, 아니면 fallback(보통 테마 선 색)이,
 * 그것도 모자라면 검정·흰색 가운데 바탕과 더 대비하는 것(불투명)
 */
export function contrastLineColor(color: Rgba, bg: Rgba, fallback: Rgba, min = LINE_CONTRAST_MIN): Rgba {
  if (contrastRatio(color, bg) >= min) return color;
  if (contrastRatio(fallback, bg) >= min) return fallback;
  const black: Rgba = [0, 0, 0, 1], white: Rgba = [1, 1, 1, 1];
  return contrastRatio(black, bg) >= contrastRatio(white, bg) ? black : white;
}
