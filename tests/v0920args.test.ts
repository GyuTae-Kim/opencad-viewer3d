/**
 * 0.92.0 꼴이 틀린 인자(92차 — 0.91.0 남은 한계 표): 0.91.0이 단면·보기·투영 밖으로 남긴 API에 TypeScript 형 밖 값을 주면
 * - setMarker의 kind가 이름이 아니면 그리기마다 TypeError(마커 모양을 찾지 못함 — 'toString' 같은 물려받은 이름은 빈 마커),
 * - setGridZ·생성자 gridZ가 높이가 아니면(엉뚱한 글·NaN·±Infinity·null·한도 밖 수) 격자 u_mvp가 유한하지 않거나 격자가 사라지고,
 * - setHighlightSegments의 Float32Array가 아닌 배열은 앞 강조를 지운 뒤 던져 그 뒤 그리기마다 지운 VAO를 묶었고,
 * - 겉모습(setItemLooks·setItemMatrices — 돌 수 없는 목록·항목, 앞 항목만 걸리고 범위는 옛 값)·setItemMatrix·색 API(undefined)·setItemOpacity·setAnnotations·
 *   highlight·setLineDrawRange·setRenderOptions와 선택 객체를 바로 읽는 setMesh·project·closestPoints·trianglesNear·closestPointsAsync·생성자가 던지고,
 * - setNavigation은 이름이 아닌 값을 상태(navigation)에 두었다.
 * 0.92.0은 91차 규칙을 따른다: 꼭 줘야 하는 자리가 깨지면 그 API의 깨진 값 규칙(받지 않음 또는 null — 되돌림·해제·지움), 선택 필드·선택 객체가 깨지면 주지 않은 것,
 * 목록의 돌 수 없는 항목은 건너뛴다. 경우마다 깨진 값을 준 뷰어와 같아야 할 부름의 뷰어가 상태(겉모습·맞춤 범위·덧그림·걷기·그리기 선택·카메라)·돌려준 값·
 * 그리기 기록(가짜 WebGL2 — 프로그램·속성·균일 변수 값)에서 같고 균일 변수가 모두 유한하다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { guardGl } from './glguard';
import type { Annotation3d } from '../src/annotate';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { Viewer3d, type Viewer3dOptions } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
let clock = 1000;
beforeAll(() => {
  dom = installDom();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
});
afterAll(() => {
  vi.restoreAllMocks();
  dom.restore();
});

/** 상자 둘 + 원점 있는 상자(격자도 원점 기준 좌표로 올린다) + 원본 번호가 있는 선분 묶음 */
const scene = (): Scene3d => {
  const c = boxMesh('c', [0, 0, 0], [4, 4, 4], [0.5, 0.8, 0.5, 1]);
  c.origin = [40, 0, 0];
  return {
    name: 's',
    units: 'mm',
    meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [16, 2, 0], [26, 8, 6], [0.8, 0.6, 0.5, 1]), c],
    lines: [{ id: 'L', positions: Float32Array.of(0, 0, 12, 10, 0, 12, 10, 0, 12, 10, 10, 12), color: [1, 0, 0, 1], segmentIds: Uint32Array.of(3, 7) }],
  };
};

interface W {
  v: Viewer3d;
  gl: FakeGL;
  bad: string[];
}
/** 유한하지 않은 균일 변수는 bad에 — tests/glguard.ts */
function view(opts: Viewer3dOptions = {}): W {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 400, height: 300 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false, ...opts });
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
/** 견줄 상태: 묶음 겉모습·맞춤 범위·덧그림·걷기·그리기 선택·격자·카메라 */
const look = (v: Viewer3d): unknown => ({
  looks: ['a', 'b', 'c', 'L'].map((id) => v.itemLook(id)),
  fit: v.fitBounds,
  anno: v.annotations,
  nav: v.navigation,
  ro: v.renderOptions,
  grid: v.gridVisible,
  camera: v.getCamera(),
});
/** 형 밖 값(시험에서만 — 공개 형은 그대로) */
const X = <T>(x: unknown): T => x as T;
/** 시험 이름에 쓰는 값 글(NaN·±Infinity·undefined도 그대로) */
const show = (d: unknown): string => (d === undefined ? 'undefined' : JSON.stringify(d, (_k, x: unknown) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x)));

interface Case {
  name: string;
  /** 두 뷰어를 만드는 선택(깨진 값·같아야 할 값 — 없으면 둘 다 기본) */
  opts?: readonly [Viewer3dOptions, Viewer3dOptions];
  /** 두 뷰어에 먼저 거는 멀쩡한 값(건 뒤 한 번 그린다) */
  prep?: (v: Viewer3d) => void;
  /** 깨진 값(돌려준 값도 견준다 — Promise면 푼 값) */
  bad: (v: Viewer3d) => unknown;
  /** 같아야 할 부름(부르지 않음·주지 않음·null) */
  ref: (v: Viewer3d) => unknown;
}
const none = (): void => {};

async function same(c: Case): Promise<void> {
  const A = view(c.opts?.[0]);
  const B = view(c.opts?.[1]);
  for (const w of [A, B]) {
    c.prep?.(w.v);
    w.v.renderNow();
  }
  let thrown = '-';
  let ra: unknown;
  try {
    ra = await c.bad(A.v);
  } catch (e) {
    thrown = String(e);
  }
  const rb = await c.ref(B.v);
  let fa: DrawEntry[] = [];
  try {
    fa = frame(A);
  } catch (e) {
    thrown += ` / 그리기 ${String(e)}`;
  }
  const fb = frame(B);
  expect({ thrown, bad: uniq(A.bad), ret: ra, look: look(A.v), draws: fa.length }).toEqual({ thrown: '-', bad: [], ret: rb, look: look(B.v), draws: fb.length });
  expect(B.bad).toEqual([]);
  expect(fa).toEqual(fb);
}

const P = [5, 5, 5];
const M = Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1);
const M2 = Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1);
const ANN: Annotation3d = { kind: 'distance', a: [0, 0, 0], b: [10, 0, 0] };
const SEG = Float32Array.of(0, 0, 0, 10, 10, 10);

/** 그리기마다 던지거나 깨지던 것: 마커 kind·격자 높이·강조 선분 */
const DRAW: readonly Case[] = [
  ...['foo', null, 'Cone', 5, '', 'toString', 'constructor'].map((k): Case => ({ name: `setMarker kind ${show(k)} = 주지 않음(cone)`, bad: (v) => v.setMarker(P, X(k)), ref: (v) => v.setMarker(P) })),
  { name: 'setMarker kind 엉뚱한 글은 앞 마커 모양도 따르지 않는다(cone)', prep: (v) => v.setMarker([1, 1, 1], 'ball'), bad: (v) => v.setMarker(P, X('foo')), ref: (v) => v.setMarker(P, 'cone') },
  ...(['foo', NaN, Infinity, -Infinity, null, {}, '5', true, 'toString', 1e300, [3]] as unknown[]).map(
    (z): Case => ({ name: `setGridZ(${show(z)}) = 부르지 않음(앞 높이 그대로)`, prep: (v) => v.setGridZ(5), bad: (v) => v.setGridZ(X(z)), ref: none }),
  ),
  ...(['foo', NaN, '5', 1e300] as unknown[]).map((z): Case => ({ name: `생성자 gridZ ${show(z)} = 주지 않음('min')`, opts: [X({ gridZ: z }), {}], bad: none, ref: none })),
  ...([[0, 0, 0, 10, 10, 10], Float64Array.of(0, 0, 0, 10, 10, 10), 'abcdefgh', { length: 6, 0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 }, Uint8Array.of(0, 0, 0, 9, 9, 9)] as unknown[]).map(
    (p): Case => ({
      name: `setHighlightSegments ${Object.prototype.toString.call(p)} = null(해제 — 그 뒤 그리기도 던지지 않음)`,
      prep: (v) => v.setHighlightSegments(SEG, { width: 3 }),
      bad: (v) => v.setHighlightSegments(X(p)),
      ref: (v) => v.setHighlightSegments(null),
    }),
  ),
];

/** 겉모습: 0.91.0은 던지거나 앞 항목만 걸고 던졌다 */
const LOOKS: readonly Case[] = [
  {
    name: 'setItemLooks·setItemMatrices 돌 수 없는 목록(null·{}·수·undefined) = 0(아무것도 걸지 않음)',
    bad: (v) => [null, {}, 5, undefined].flatMap((e) => [v.setItemLooks(X(e)), v.setItemMatrices(X(e))]),
    ref: () => [0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'setItemLooks 돌 수 없는 항목(null·{}·수·undefined)은 건너뛴다(0.91.0은 앞 항목만 걸고 범위는 옛 값)',
    bad: (v) => v.setItemLooks(X([['a', { matrix: M, color: [1, 0, 0, 1] }], null, {}, 5, undefined, ['b', { opacity: 0.5 }]])),
    ref: (v) => v.setItemLooks([['a', { matrix: M, color: [1, 0, 0, 1] }], ['b', { opacity: 0.5 }]]),
  },
  {
    name: 'setItemMatrices 돌 수 없는 항목은 건너뛴다',
    bad: (v) => v.setItemMatrices(X([['a', M], null, {}, 7, ['b', M2]])),
    ref: (v) => v.setItemMatrices([['a', M], ['b', M2]]),
  },
  { name: 'setItemMatrix undefined = 부르지 않음(배열이 아닌 행렬과 같다)', prep: (v) => v.setItemMatrix('a', M), bad: (v) => v.setItemMatrix('a', X(undefined)), ref: none },
  ...(['setItemColor', 'setItemEdgeColor', 'setItemProfileColor'] as const).map(
    (f): Case => ({ name: `${f} undefined = null(되돌림 — 깨진 색과 같다)`, prep: (v) => v[f]('a', [0, 1, 0, 1]), bad: (v) => v[f]('a', X(undefined)), ref: (v) => v[f]('a', null) }),
  ),
  {
    name: 'setItemOpacity 선택 null = 주지 않음(0.91.0은 앞 겉모습의 불투명도만 바꾸고 던짐)',
    prep: (v) => v.setItemOpacity('a', 0.8, { pickable: false }),
    bad: (v) => v.setItemOpacity('a', 0.5, X(null)),
    ref: (v) => v.setItemOpacity('a', 0.5),
  },
];

/** 덧그림·강조·그리기 선택·걷기 */
const OVERLAY: readonly Case[] = [
  {
    name: 'setAnnotations 글·유사 배열 = null(지움 — 5·{}와 같다)',
    prep: (v) => v.setAnnotations([ANN]),
    bad: (v) => (v.setAnnotations(X('abc')), v.setAnnotations([ANN]), v.setAnnotations(X({ length: 1, 0: ANN }))),
    ref: (v) => v.setAnnotations(null),
  },
  { name: 'setAnnotations 선택 null = 주지 않음', bad: (v) => v.setAnnotations([ANN], X(null)), ref: (v) => v.setAnnotations([ANN]) },
  { name: 'highlight 돌 수 없는 값({}·수·참) = null(해제)', prep: (v) => v.highlight(['b']), bad: (v) => (v.highlight(X({})), v.highlight(['b']), v.highlight(X(5)), v.highlight(['b']), v.highlight(X(true))), ref: (v) => v.highlight(null) },
  { name: 'setLineDrawRange 선택 null = 주지 않음', bad: (v) => v.setLineDrawRange('L', 1, X(null)), ref: (v) => v.setLineDrawRange('L', 1) },
  { name: 'setRenderOptions 객체가 아님(null·글·수·undefined·참) = 부르지 않음', prep: (v) => v.setRenderOptions({ profiles: true }), bad: (v) => [null, 'abc', 5, undefined, true].forEach((o) => v.setRenderOptions(X(o))), ref: none },
  ...(['fly', null, undefined, 'Walk', 'toString', 5] as unknown[]).map((n): Case => ({ name: `setNavigation(${show(n)}) = 부르지 않음(앞 걷기 그대로)`, bad: (v) => v.setNavigation(X(n)), ref: none })),
  { name: 'setNavigation 엉뚱한 글은 걷는 중에도 부르지 않음', prep: (v) => v.setNavigation('walk'), bad: (v) => v.setNavigation(X('fly'), { gravity: true }), ref: none },
];

/** 선택 객체를 바로 읽던 API: 선택 null = 주지 않음 */
const OPTS: readonly Case[] = [
  { name: 'setMesh 선택 null', bad: (v) => v.setMesh(boxMesh('a', [0, 0, 0], [8, 8, 8], [0.6, 0.7, 0.8, 1]), X(null)), ref: (v) => v.setMesh(boxMesh('a', [0, 0, 0], [8, 8, 8], [0.6, 0.7, 0.8, 1])) },
  { name: 'project 선택 null', bad: (v) => v.project([1, 2, 3], X(null)), ref: (v) => v.project([1, 2, 3]) },
  { name: 'closestPoints 선택 null', bad: (v) => v.closestPoints('a', 'b', X(null)), ref: (v) => v.closestPoints('a', 'b') },
  { name: 'trianglesNear 선택 null', bad: (v) => v.trianglesNear('a', [0, 0, 0], 3, X(null)), ref: (v) => v.trianglesNear('a', [0, 0, 0], 3) },
  { name: 'closestPointsAsync 선택 null(0.91.0은 거절)', bad: (v) => v.closestPointsAsync('a', 'b', X(null)), ref: (v) => v.closestPointsAsync('a', 'b') },
];

/** 0.91.0도 던지지 않고 깨지지 않던 값 — 그대로 둔다 */
const KEPT: readonly Case[] = [
  { name: 'setMarker kind undefined = cone', bad: (v) => v.setMarker(P, X(undefined)), ref: (v) => v.setMarker(P, 'cone') },
  { name: 'setMarker 선택 null = 주지 않음', bad: (v) => v.setMarker(P, 'ball', X(null)), ref: (v) => v.setMarker(P, 'ball') },
  { name: 'setMarker 자리 글·{} = null(지움)', prep: (v) => v.setMarker(P), bad: (v) => (v.setMarker(X('abc')), v.setMarker(P), v.setMarker(X({}))), ref: (v) => v.setMarker(null) },
  { name: "setGridZ(undefined) = 'min'", prep: (v) => v.setGridZ(5), bad: (v) => v.setGridZ(X(undefined)), ref: (v) => v.setGridZ('min') },
  { name: "생성자 gridZ null = 주지 않음('min')", opts: [X({ gridZ: null }), {}], bad: none, ref: none },
  { name: 'setItemMatrix 글·수 = 부르지 않음', prep: (v) => v.setItemMatrix('a', M), bad: (v) => (v.setItemMatrix('a', X('abc')), v.setItemMatrix('a', X(5))), ref: none },
  { name: 'setItemColor 수·{} = null(0.83.0)', prep: (v) => v.setItemColor('a', [0, 1, 0, 1]), bad: (v) => (v.setItemColor('a', X(5)), v.setItemColor('b', X({}))), ref: (v) => v.setItemColor('a', null) },
  { name: 'setItemLooks 글 하나 = 0(겉모습이 객체가 아닌 항목)', bad: (v) => v.setItemLooks(X('ab')), ref: () => 0 },
  { name: 'highlight 글 하나는 글자마다 id로 읽는다', bad: (v) => v.highlight(X('ab')), ref: (v) => v.highlight(['a', 'b']) },
  { name: 'setAnnotations {}·수 = null(지움)', prep: (v) => v.setAnnotations([ANN]), bad: (v) => (v.setAnnotations(X({})), v.setAnnotations([ANN]), v.setAnnotations(X(5))), ref: (v) => v.setAnnotations(null) },
  { name: 'setNavigation 선택 null = 주지 않음', bad: (v) => v.setNavigation('walk', X(null)), ref: (v) => v.setNavigation('walk') },
  { name: 'setDrawLimitBySegmentId 선택 null = 주지 않음', bad: (v) => v.setDrawLimitBySegmentId(3, X(null)), ref: (v) => v.setDrawLimitBySegmentId(3) },
];

describe('그리기마다 던지거나 깨지던 인자: 마커 kind·격자 높이·강조 선분', () => {
  for (const c of DRAW) it(c.name, () => same(c));
});
describe('겉모습: 꼴이 틀린 인자', () => {
  for (const c of LOOKS) it(c.name, () => same(c));
});
describe('덧그림·강조·그리기 선택·걷기: 꼴이 틀린 인자', () => {
  for (const c of OVERLAY) it(c.name, () => same(c));
});
describe('선택 객체 null', () => {
  for (const c of OPTS) it(c.name, () => same(c));
  it('생성자 선택 null = 주지 않음(기본 — 0.91.0은 TypeError)', () => {
    const mk = (o: unknown): W => {
      const host = dom.host();
      host.rect = { left: 0, top: 0, width: 400, height: 300 };
      const v = new Viewer3d(host as unknown as HTMLElement, X(o));
      views.push(v);
      const gl = (v.canvas as unknown as FakeElement).gl!;
      const w: W = { v, gl, bad: [] };
      guardGl(gl, (x) => w.bad.push(x));
      v.setScene(scene());
      return w;
    };
    let thrown = '-';
    let A: W | null = null;
    try {
      A = mk(null);
    } catch (e) {
      thrown = String(e);
    }
    expect(thrown).toBe('-');
    const B = mk(undefined);
    expect(look(A!.v)).toEqual(look(B.v));
    expect(frame(A!)).toEqual(frame(B));
    expect([...A!.bad, ...B.bad]).toEqual([]);
  });
});
describe('0.91.0과 같은 값으로 두는 것', () => {
  for (const c of KEPT) it(c.name, () => same(c));
});
