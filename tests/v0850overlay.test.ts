/**
 * 0.85.0 선분 강조·덧그림·마커·선 그리기 구간의 유한하지 않은 값(85차 — 0.84.0 남은 한계): 0.84.0은 받은 값을 그대로 두어 그 덧그림 하나가 틀렸다
 * - setHighlightSegments·highlightSegmentIds: 색 NaN → u_color NaN, 굵기 NaN·−Infinity → 1화소 선·Infinity → u_width 무한, hidden NaN → 가린 부분을 그리지 않음, origin NaN → u_mvp NaN
 * - setAnnotations: 굵기 NaN → 1화소 선·Infinity → u_width 무한, hidden NaN → 가린 부분을 그리지 않음
 * - setMarker: 색 NaN → u_color NaN, 축 NaN·반지름 Infinity·화면 높이 NaN·±Infinity → 마커 행렬 NaN·무한
 * - setLineDrawRange·setDrawLimitBySegmentId: 개수·번호 NaN → 그 묶음을 그리지 않음, ghost Infinity → u_alpha 무한
 * 0.84.0 규칙으로 맞춘다: 깨진 색 배열(badRgba)은 그 색을, 자른 뒤에도 유한하지 않은 수는 그 수를 주지 않은 것과 같다. 꼭 맞아야 하는 자리·방향(강조 origin·마커 axis)이
 * 유한한 수 셋이 아니면 그 호출은 null(지움)과, 개수·번호 NaN은 null(전부 그림)과 같다.
 * 경우마다 깨진 값을 준 뷰어와 같아야 할 부름(그 필드를 주지 않음·null)의 뷰어가 돌려준 값·그리기 기록(가짜 WebGL2 — 프로그램·속성·균일 변수 값)에서 같고 균일 변수가 모두 유한하다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { guardGl } from './glguard';
import type { Annotation3d } from '../src/annotate';
import type { RenderMode } from '../src/renderer';
import { boxMesh } from '../src/synth';
import type { Rgba, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
});
afterAll(() => {
  dom.restore();
});

/** 상자 둘과 원본 번호가 있는 선분 묶음 둘(재생 — 묶음 L은 1·2·3, M은 2·5) */
const scene = (): Scene3d => ({
  name: 's',
  units: 'mm',
  meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [16, 2, 0], [26, 8, 6], [0.8, 0.6, 0.5, 1])],
  lines: [
    { id: 'L', positions: Float32Array.of(0, 0, 12, 10, 0, 12, 10, 0, 12, 10, 10, 12, 10, 10, 12, 20, 10, 12), color: [1, 0, 0, 1], segmentIds: Uint32Array.of(1, 2, 3) },
    { id: 'M', positions: Float32Array.of(0, 12, 2, 8, 12, 2, 8, 12, 2, 8, 20, 2), color: [0, 0.4, 1, 1], segmentIds: Uint32Array.of(2, 5) },
  ],
});

interface W {
  v: Viewer3d;
  gl: FakeGL;
  bad: string[];
}
/** 음영+윤곽 상자 둘(유한하지 않은 균일 변수는 bad에 — tests/glguard.ts) */
function view(mode: RenderMode): W {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 400, height: 300 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false, renderMode: mode });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const w: W = { v, gl, bad: [] };
  guardGl(gl, (x) => w.bad.push(x));
  v.setScene(scene());
  void v.setView('seIso', false);
  return w;
}
/** 그리기 한 번의 기록(프로그램·속성·균일 변수 값) */
function frame(w: W): DrawEntry[] {
  w.gl.draws = [];
  w.gl.logDraws = true;
  w.v.renderNow();
  w.gl.logDraws = false;
  return w.gl.draws;
}
const uniq = (a: readonly string[]): string[] => [...new Set(a)];

const RED: Rgba = [1, 0, 0, 1];
const NAN: Rgba = [NaN, 1, 1, 1];
const SEG = Float32Array.of(0, 0, 0, 10, 10, 10, 10, 0, 0, 0, 10, 10);
const ANNO: Annotation3d[] = [
  { kind: 'distance', a: [0, 0, 0], b: [10, 0, 10] },
  { kind: 'angle', a: [16, 2, 6], b: [26, 2, 6], c: [16, 8, 6] },
];
const TIP = [5, 5, 14];
const two = (a: number, b: number): number[] => [a, b];

interface Case {
  name: string;
  /** 그리기 모드(없으면 음영+윤곽) */
  mode?: RenderMode;
  /** 두 뷰어에 먼저 거는 멀쩡한 값(건 뒤 한 번 그린다) */
  prep?: (v: Viewer3d) => void;
  /** 깨진 값(돌려준 값도 견준다) */
  bad: (v: Viewer3d) => unknown;
  /** 같아야 할 부름(그 필드를 주지 않음·null) */
  ref: (v: Viewer3d) => unknown;
}

const SEGMENTS: readonly Case[] = [
  { name: 'color NaN = color를 주지 않음(테마 강조색)', bad: (v) => v.setHighlightSegments(SEG, { color: NAN }), ref: (v) => v.setHighlightSegments(SEG) },
  { name: 'color 알파 Infinity = 주지 않음', bad: (v) => v.setHighlightSegments(SEG, { color: [1, 0, 0, Infinity] }), ref: (v) => v.setHighlightSegments(SEG) },
  { name: 'width NaN = 주지 않음(3 — 0.84.0은 1화소 선)', bad: (v) => v.setHighlightSegments(SEG, { width: NaN }), ref: (v) => v.setHighlightSegments(SEG) },
  { name: 'width Infinity = 주지 않음', bad: (v) => v.setHighlightSegments(SEG, { width: Infinity }), ref: (v) => v.setHighlightSegments(SEG) },
  { name: 'width −Infinity = 주지 않음(자르지 않는 수)', bad: (v) => v.setHighlightSegments(SEG, { width: -Infinity }), ref: (v) => v.setHighlightSegments(SEG) },
  { name: 'hidden NaN = 주지 않음(0.3 — 0.84.0은 가린 부분을 그리지 않음)', bad: (v) => v.setHighlightSegments(SEG, { hidden: NaN }), ref: (v) => v.setHighlightSegments(SEG) },
  {
    name: 'origin NaN = null(지움 — 앞서 건 강조도)',
    prep: (v) => v.setHighlightSegments(SEG, { color: RED }),
    bad: (v) => v.setHighlightSegments(SEG, { origin: [NaN, 0, 0] }),
    ref: (v) => v.setHighlightSegments(null),
  },
  { name: 'origin 셋에 Infinity = null', bad: (v) => v.setHighlightSegments(SEG, { origin: [0, Infinity, 0] }), ref: (v) => v.setHighlightSegments(null) },
  { name: 'origin 수 둘 = null', bad: (v) => v.setHighlightSegments(SEG, { origin: two(5, 5) }), ref: (v) => v.setHighlightSegments(null) },
  {
    name: 'highlightSegmentIds 깨진 색·굵기·hidden = 주지 않음(찾은 수 같음)',
    bad: (v) => v.highlightSegmentIds([1, 2], { color: NAN, width: Infinity, hidden: NaN }),
    ref: (v) => v.highlightSegmentIds([1, 2]),
  },
  { name: 'highlightSegmentIds origin NaN = null(0을 돌려준다)', bad: (v) => v.highlightSegmentIds([1, 2], { origin: [NaN, 0, 0] }), ref: (v) => v.highlightSegmentIds(null) },
];

const ANNOTATIONS: readonly Case[] = [
  { name: 'width NaN = 주지 않음(2 — 0.84.0은 1화소 선)', bad: (v) => v.setAnnotations(ANNO, { width: NaN }), ref: (v) => v.setAnnotations(ANNO) },
  { name: 'width Infinity = 주지 않음', bad: (v) => v.setAnnotations(ANNO, { width: Infinity }), ref: (v) => v.setAnnotations(ANNO) },
  { name: 'hidden NaN = 주지 않음(0.35 — 0.84.0은 가린 부분을 그리지 않음)', bad: (v) => v.setAnnotations(ANNO, { hidden: NaN }), ref: (v) => v.setAnnotations(ANNO) },
  { name: '굵기 NaN·hidden NaN 함께(숨은 선)', mode: 'hiddenLine', bad: (v) => v.setAnnotations(ANNO, { width: NaN, hidden: NaN }), ref: (v) => v.setAnnotations(ANNO) },
];

const MARKERS: readonly Case[] = [
  { name: 'color NaN = 주지 않음(테마 마커 색)', bad: (v) => v.setMarker(TIP, 'cone', { color: NAN }), ref: (v) => v.setMarker(TIP, 'cone') },
  { name: 'color 알파 −Infinity = 주지 않음', bad: (v) => v.setMarker(TIP, 'ball', { color: [0, 1, 0, -Infinity] }), ref: (v) => v.setMarker(TIP, 'ball') },
  { name: 'axis NaN = null(지움 — 앞서 건 마커도)', prep: (v) => v.setMarker(TIP, 'cone'), bad: (v) => v.setMarker(TIP, 'cone', { axis: [NaN, 0, 1] }), ref: (v) => v.setMarker(null) },
  { name: 'axis 셋에 Infinity = null', bad: (v) => v.setMarker(TIP, 'cylinder', { axis: [0, Infinity, 1] }), ref: (v) => v.setMarker(null) },
  { name: 'axis 수 둘 = null', bad: (v) => v.setMarker(TIP, 'cone', { axis: two(0, 1) }), ref: (v) => v.setMarker(null) },
  { name: 'radius Infinity = 주지 않음(화면 높이)', bad: (v) => v.setMarker(TIP, 'cone', { radius: Infinity }), ref: (v) => v.setMarker(TIP, 'cone') },
  { name: 'sizePx NaN = 주지 않음(44)', bad: (v) => v.setMarker(TIP, 'cylinder', { sizePx: NaN }), ref: (v) => v.setMarker(TIP, 'cylinder') },
  { name: 'sizePx Infinity = 주지 않음', bad: (v) => v.setMarker(TIP, 'ball', { sizePx: Infinity }), ref: (v) => v.setMarker(TIP, 'ball') },
  { name: 'sizePx −Infinity = 주지 않음', bad: (v) => v.setMarker(TIP, 'cone', { sizePx: -Infinity }), ref: (v) => v.setMarker(TIP, 'cone') },
  {
    name: '깨진 색·반지름·화면 높이 함께 = 그 필드 모두 주지 않음',
    bad: (v) => v.setMarker(TIP, 'cone', { axis: [0.3, 0.2, 1], color: NAN, radius: Infinity, sizePx: NaN }),
    ref: (v) => v.setMarker(TIP, 'cone', { axis: [0.3, 0.2, 1] }),
  },
];

const RANGES: readonly Case[] = [
  { name: 'setLineDrawRange 개수 NaN = null(전부 — 0.84.0은 그 묶음을 그리지 않음)', bad: (v) => v.setLineDrawRange('L', NaN), ref: (v) => v.setLineDrawRange('L', null) },
  {
    name: 'setLineDrawRange 개수 NaN은 앞서 건 구간도 지운다(null과 같다)',
    prep: (v) => v.setLineDrawRange('L', 1, { ghost: 0.3 }),
    bad: (v) => v.setLineDrawRange('L', NaN, { ghost: 0.3 }),
    ref: (v) => v.setLineDrawRange('L', null),
  },
  { name: 'setLineDrawRange ghost Infinity = 주지 않음(0)', bad: (v) => v.setLineDrawRange('L', 1, { ghost: Infinity }), ref: (v) => v.setLineDrawRange('L', 1) },
  { name: 'setDrawLimitBySegmentId NaN = null(전부, null을 돌려준다)', bad: (v) => v.setDrawLimitBySegmentId(NaN), ref: (v) => v.setDrawLimitBySegmentId(null) },
  {
    name: 'setDrawLimitBySegmentId NaN은 앞서 건 재생 구간도 지운다',
    prep: (v) => v.setDrawLimitBySegmentId(2, { ghost: 0.2 }),
    bad: (v) => v.setDrawLimitBySegmentId(NaN, { ghost: 0.2 }),
    ref: (v) => v.setDrawLimitBySegmentId(null),
  },
  { name: 'setDrawLimitBySegmentId ghost Infinity = 주지 않음(공구 자리 같음)', bad: (v) => v.setDrawLimitBySegmentId(2, { ghost: Infinity }), ref: (v) => v.setDrawLimitBySegmentId(2) },
];

/** 0.84.0도 문제 없던 유한하지 않은 값(자르기·비교로 유한한 결과) — 그대로 둔다 */
const KEPT: readonly Case[] = [
  { name: '강조 hidden ±Infinity = 1·0으로 자름', bad: (v) => (v.setHighlightSegments(SEG, { hidden: Infinity }), v.highlightSegmentIds([3], { hidden: -Infinity })), ref: (v) => (v.setHighlightSegments(SEG, { hidden: 1 }), v.highlightSegmentIds([3], { hidden: 0 })) },
  { name: '강조 id NaN = 맞는 선분 없음(null)', bad: (v) => v.highlightSegmentIds([NaN]), ref: (v) => v.highlightSegmentIds(null) },
  { name: '덧그림 굵기 −Infinity = 0.5로 자름', bad: (v) => v.setAnnotations(ANNO, { width: -Infinity }), ref: (v) => v.setAnnotations(ANNO, { width: 0.5 }) },
  { name: '덧그림 hidden ±Infinity = 1·0으로 자름', bad: (v) => v.setAnnotations(ANNO, { hidden: Infinity }), ref: (v) => v.setAnnotations(ANNO, { hidden: 1 }) },
  { name: '마커 반지름 NaN·−Infinity = 화면 높이', bad: (v) => (v.setMarker(TIP, 'cone', { radius: NaN }), v.setMarker(TIP, 'ball', { radius: -Infinity })), ref: (v) => v.setMarker(TIP, 'ball') },
  { name: '그리기 구간 개수 Infinity = 전부', bad: (v) => v.setLineDrawRange('L', Infinity), ref: (v) => v.setLineDrawRange('L', null) },
  { name: '그리기 구간 ghost NaN·−Infinity = 0', bad: (v) => (v.setLineDrawRange('L', 1, { ghost: NaN }), v.setLineDrawRange('M', 1, { ghost: -Infinity })), ref: (v) => (v.setLineDrawRange('L', 1), v.setLineDrawRange('M', 1)) },
  { name: '재생 번호 Infinity = 전부(마지막 공구 자리)', bad: (v) => v.setDrawLimitBySegmentId(Infinity), ref: (v) => v.setDrawLimitBySegmentId(5) },
  { name: '재생 번호 −Infinity = 없음(null)', bad: (v) => v.setDrawLimitBySegmentId(-Infinity), ref: (v) => v.setDrawLimitBySegmentId(0) },
];

function same(c: Case): void {
  const mode = c.mode ?? 'shadedEdges';
  const A = view(mode);
  const B = view(mode);
  for (const w of [A, B]) {
    c.prep?.(w.v);
    w.v.renderNow();
  }
  const ra = c.bad(A.v);
  const rb = c.ref(B.v);
  const fa = frame(A);
  const fb = frame(B);
  expect({ bad: uniq(A.bad), ret: ra, draws: fa.length }).toEqual({ bad: [], ret: rb, draws: fb.length });
  expect(B.bad).toEqual([]);
  expect(fa).toEqual(fb);
}

describe('선분 강조: 깨진 색·수는 그 필드를 주지 않은 것과, 깨진 origin은 null과 같다', () => {
  for (const c of SEGMENTS) it(c.name, () => same(c));
});

describe('덧그림: 자른 뒤에도 유한하지 않은 굵기·hidden은 주지 않은 것과 같다', () => {
  for (const c of ANNOTATIONS) it(c.name, () => same(c));
});

describe('마커: 깨진 색·반지름·화면 높이는 주지 않은 것과, 깨진 축은 null과 같다', () => {
  for (const c of MARKERS) it(c.name, () => same(c));
});

describe('선 그리기 구간(재생): 개수·번호 NaN은 null과, 깨진 ghost는 주지 않은 것과 같다', () => {
  for (const c of RANGES) it(c.name, () => same(c));
});

describe('0.84.0과 같은 값으로 두는 것', () => {
  for (const c of KEPT) it(c.name, () => same(c));
  it('유한한 값 — 범위 밖 hidden·작은·음수 굵기·축 0·음수 화면 높이·큰 ghost·큰 개수는 균일 변수가 유한하다', () => {
    const w = view('hiddenLine');
    const { v } = w;
    v.setHighlightSegments(SEG, { width: -2, hidden: 2, origin: [0, 0, 0], color: [2, -1, 0.5, 1] });
    v.setAnnotations(ANNO, { width: 0.1, hidden: -1 });
    v.setMarker(TIP, 'cone', { axis: [0, 0, 0], sizePx: -10, color: [0, 0, 0, 0] });
    v.setLineDrawRange('L', 1e9, { ghost: 5 });
    expect(v.setDrawLimitBySegmentId(1e300, { ghost: 0.5 })).toEqual([8, 20, 2]);
    v.renderNow();
    v.setRenderMode('shadedEdges');
    v.setMarker(TIP, 'ball', { radius: 1e-3, sizePx: 1e6 });
    v.renderNow();
    expect(w.bad).toEqual([]);
  });
});
