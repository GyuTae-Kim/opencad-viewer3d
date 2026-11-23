/**
 * 0.93.0 꼴이 틀린 인자(93차 — 0.92.0 남은 한계 「그 밖의 공개 API」): 91·92차가 훑지 않은 공개 API에 TypeScript 형 밖 값을 주면
 * - 알림 등록(on* 아홉·onPick)이 함수가 아닌 값도 걸어, 알릴 때 TypeError를 던지고 그 뒤에 단 알림을 부르지 않았다(onCameraChange는 카메라가 바뀐 그리기마다),
 * - setPointerClaim의 함수가 아닌 처리기(글·{}·수·claim이 함수가 아닌 객체)는 누를 때마다, 처리기의 함수가 아닌 move·end는 움직이고 뗄 때마다 TypeError,
 * - setMeasureFormat·생성자 formatMeasure의 함수가 아닌 값은 측정 글·거리 덧그림을 그릴 때마다 TypeError,
 * - setTheme(null)·생성자 theme null과 글이 아닌 테마 색은 TypeError — setTheme은 그 값을 남겨 그 뒤 setTheme()도 던졌다,
 * - setMeasureSnap의 함수가 아닌 pointsFor·refine·refineFace는 측정 미리 보기마다 TypeError, points의 null 항목·배열이 아닌 points는 TypeError,
 * - 걷기 선택의 수가 아닌 eyeHeight·speed와 수로 읽히지 않는 조명·마커·강조 선분 수 필드는 카메라·균일 변수 NaN, zoomToRect의 무한대 구석은 카메라 NaN,
 *   생성자 maxPixelRatio가 수로 읽히지 않으면 캔버스 크기 NaN,
 * - 선택 객체 null(measureCandidates·commitMeasureCandidate·snapshotSize·renderImage·toBlob·setScene)과 setWalkInput(null), 구간 목록의 null 항목은 TypeError
 *   (highlightRanges는 앞 강조를 반쯤 지운 채),
 * - 순수 markerMesh는 이름이 아닌 kind에 TypeError(물려받은 이름은 빈 그물)·무한대 segments에 끝나지 않고, parseColor는 글이 아닌 값·mergeRanges는 null 항목에 TypeError.
 * 0.93.0은 91·92차 규칙을 따른다: 꼭 줘야 하는 자리가 깨지면 그 API의 깨진 값 규칙(받지 않음 또는 null — 끔·기본), 선택 필드·선택 객체가 깨지면 주지 않은 것,
 * 목록의 깨진 항목은 건너뛴다. 경우마다 깨진 값을 준 뷰어와 같아야 할 부름의 뷰어가 상태·돌려준 값·그 뒤 사건·그리기 기록(가짜 WebGL2)에서 같고 균일 변수가 모두 유한하다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { guardGl } from './glguard';
import type { Annotation3d } from '../src/annotate';
import { markerMesh } from '../src/marker';
import { mergeRanges } from '../src/ranges';
import { boxMesh } from '../src/synth';
import { parseColor } from '../src/theme';
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

/** 상자 둘 + 원본 번호가 있는 선분 묶음(bad면 a의 첫 좌표가 NaN — 장면 알림) */
const scene = (bad = false): Scene3d => {
  const a = boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]);
  if (bad) a.positions[0] = NaN;
  return {
    name: 's',
    units: 'mm',
    meshes: [a, boxMesh('b', [16, 2, 0], [26, 8, 6], [0.8, 0.6, 0.5, 1])],
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
const canvasOf = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 견줄 상태: 카메라·측정·걷기·조명·구간·겉모습·맡은 포인터·캔버스 크기 */
const look = (v: Viewer3d): unknown => ({
  camera: v.getCamera(),
  measure: [v.measurePointCount, v.measurement()?.distance ?? null, v.measureHoverSnap, Object.keys(v.measureSnap ?? {}).sort()],
  nav: v.navigation,
  light: v.lighting,
  hidden: v.hiddenRanges('a'),
  looks: ['a', 'b'].map((id) => v.itemLook(id)),
  held: v.heldPointers,
  size: [canvasOf(v).width, canvasOf(v).height],
  cube: v.viewCubeSize,
  anim: v.animateSetting,
});
/** 형 밖 값(시험에서만 — 공개 형은 그대로) */
const X = <T>(x: unknown): T => x as T;
/** 시험 이름에 쓰는 값 글(NaN·±Infinity·undefined도 그대로) */
const show = (d: unknown): string => (d === undefined ? 'undefined' : JSON.stringify(d, (_k, x: unknown) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x)));

/** 가짜 포인터 사건(마우스) */
const fire = (v: Viewer3d, type: string, id: number, x: number, y: number, buttons = type === 'pointerup' ? 0 : 1): void =>
  canvasOf(v).fire(type, { clientX: x, clientY: y, pointerId: id, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const click = (v: Viewer3d, x: number, y: number): void => {
  clock += 500;
  fire(v, 'pointerdown', 1, x, y);
  fire(v, 'pointerup', 1, x, y);
};
const drag = (v: Viewer3d): void => {
  fire(v, 'pointerdown', 1, 200, 150);
  fire(v, 'pointermove', 1, 215, 155);
  fire(v, 'pointermove', 1, 240, 165);
  fire(v, 'pointerup', 1, 240, 165);
};
/** 측정 미리 보기: 상자 a의 위 구석(꼭짓점 붙잡기 — 다듬기 함수를 부른다)과 화면 가운데 */
const hover = (v: Viewer3d): unknown => {
  const q = v.project([10, 0, 10])!;
  const out: unknown[] = [];
  for (const [x, y] of [
    [q.x + 1, q.y + 1],
    [200, 150],
  ] as const) {
    canvasOf(v).fire('pointermove', { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    v.renderNow();
    out.push(v.measureHoverSnap);
  }
  return out;
};

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
  /** 그 뒤 두 뷰어에 같은 사건(누르기·끌기·미리 보기·카메라 바꾸기 — 던지지 않고 돌려준 값이 같아야 한다) */
  act?: (v: Viewer3d) => unknown;
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
  let xa: unknown, xb: unknown;
  if (c.act) {
    try {
      xa = await c.act(A.v);
    } catch (e) {
      thrown += ` / 사건 ${String(e)}`;
    }
    xb = await c.act(B.v);
  }
  let fa: DrawEntry[] = [];
  try {
    fa = frame(A);
  } catch (e) {
    thrown += ` / 그리기 ${String(e)}`;
  }
  const fb = frame(B);
  expect({ thrown, bad: uniq(A.bad), ret: ra, act: xa, look: look(A.v), draws: fa.length }).toEqual({ thrown: '-', bad: [], ret: rb, act: xb, look: look(B.v), draws: fb.length });
  expect(B.bad).toEqual([]);
  expect(fa).toEqual(fb);
}

/** 함수가 아닌 콜백·처리기 값 */
const JUNK: readonly unknown[] = ['foo', {}, 5, null, undefined];
const ANN: Annotation3d = { kind: 'distance', a: [0, 0, 0], b: [10, 0, 0] };
const SEG = Float32Array.of(0, 0, 0, 10, 10, 10);
const P = [5, 5, 5];
const R = { start: 0, count: 2 };

/** 알림 등록: 함수가 아닌 값 다섯을 먼저 걸고 좋은 알림을 건다 — 좋은 알림만 건 뷰어와 같은 횟수로 불려야 하고, 알리는 사건이 던지지 않는다 */
const hits = new WeakMap<Viewer3d, number>();
const good = (v: Viewer3d) => (): void => void hits.set(v, (hits.get(v) ?? 0) + 1);
type On = 'onCameraChange' | 'onMeasure' | 'onSectionChange' | 'onSceneIssues' | 'onContextLost' | 'onPick' | 'onViewCubeExpandedChange' | 'onContextRestore' | 'onContextRestoreDone';
const reg = (v: Viewer3d, f: On, cb: unknown): string => typeof (v[f] as (cb: unknown) => () => void)(cb);
const LISTEN: readonly (readonly [On, (v: Viewer3d) => void, ((v: Viewer3d) => void)?])[] = [
  ['onCameraChange', (v) => (v.orbitBy(0.2, 0), v.renderNow())],
  ['onPick', (v) => click(v, 200, 150)],
  ['onMeasure', (v) => (click(v, 200, 150), click(v, 240, 160)), (v) => v.setMeasureMode(true)],
  ['onSectionChange', (v) => v.setSectionAxis('x', 0.5)],
  ['onSceneIssues', (v) => v.setScene(scene(true))],
  ['onContextLost', (v) => canvasOf(v).fire('webglcontextlost', {})],
];
const NOTIFY: readonly Case[] = [
  ...LISTEN.map(
    ([f, act, prep]): Case => ({
      name: `${f}에 함수가 아닌 값(${JUNK.map(show).join('·')}) = 받지 않음(뒤에 단 알림도 불린다)`,
      prep,
      bad: (v) => [...JUNK.map((x) => reg(v, f, x)), reg(v, f, good(v))],
      ref: (v) => [...JUNK.map(() => 'function'), reg(v, f, good(v))],
      act: (v) => (act(v), hits.get(v) ?? 0),
    }),
  ),
];

/** 포인터 맡기: 함수·claim이 함수인 객체가 아닌 처리기는 null, 처리기의 함수가 아닌 move·end는 주지 않은 것 */
const CLAIM: readonly Case[] = [
  ...(['foo', {}, 5, { claim: 'x' }, true] as unknown[]).map(
    (h): Case => ({ name: `setPointerClaim(${show(h)}) = null(끌기가 궤도)`, bad: (v) => v.setPointerClaim(X(h)), ref: (v) => v.setPointerClaim(null), act: (v) => (drag(v), v.heldPointers) }),
  ),
  {
    name: '처리기의 함수가 아닌 move·end = 주지 않음(맡은 포인터를 움직이고 떼도 던지지 않는다)',
    bad: (v) => v.setPointerClaim(X({ claim: () => true, move: 'x', end: 5 })),
    ref: (v) => v.setPointerClaim({ claim: () => true }),
    act: (v) => (drag(v), v.heldPointers),
  },
  {
    name: 'claimPointer 처리기의 함수가 아닌 move·end = 주지 않음',
    bad: (v) => (fire(v, 'pointerdown', 1, 200, 150), v.claimPointer(1, X({ move: {}, end: 'y' }))),
    ref: (v) => (fire(v, 'pointerdown', 1, 200, 150), v.claimPointer(1, {})),
    act: (v) => (fire(v, 'pointermove', 1, 230, 160), fire(v, 'pointerup', 1, 230, 160), v.heldPointers),
  },
];

/** 측정 글 꼴·테마 */
const FORMAT: readonly Case[] = [
  ...(['foo', {}, 5] as unknown[]).map(
    (f): Case => ({ name: `setMeasureFormat(${show(f)}) = null(기본 글 — 거리 덧그림)`, prep: (v) => v.setAnnotations([ANN]), bad: (v) => v.setMeasureFormat(X(f)), ref: (v) => v.setMeasureFormat(null) }),
  ),
  {
    name: 'setMeasureFormat 함수가 아닌 값 = null(측정 두 점의 글)',
    prep: (v) => v.setMeasureMode(true),
    bad: (v) => v.setMeasureFormat(X('foo')),
    ref: (v) => v.setMeasureFormat(null),
    act: (v) => (click(v, 200, 150), click(v, 240, 160), v.measurePointCount),
  },
  { name: "생성자 formatMeasure 'foo' = 주지 않음", opts: [X({ formatMeasure: 'foo' }), {}], prep: (v) => v.setAnnotations([ANN]), bad: none, ref: none },
  { name: 'setTheme(null) = setTheme()(앞 테마 그대로 — 그 뒤 setTheme()도 던지지 않음)', prep: (v) => v.setTheme('light'), bad: (v) => v.setTheme(X(null)), ref: (v) => v.setTheme(), act: (v) => v.setTheme() },
  {
    name: '글이 아닌 테마 색(수·배열·null·undefined) = 그 색을 주지 않음',
    bad: (v) => v.setTheme(X({ base: 'light', background: 5, text: [1, 0, 0, 1], grid: undefined, edge: null })),
    ref: (v) => v.setTheme({ base: 'light' }),
    act: (v) => v.setTheme(),
  },
  { name: '좌표축 대비의 글이 아닌 축 색 = 주지 않음', bad: (v) => v.setTheme(X({ axisContrast: true, axisX: 5 })), ref: (v) => v.setTheme({ axisContrast: true }) },
  { name: '생성자 theme null = 주지 않음(0.92.0은 생성자가 던짐)', opts: [X({ theme: null }), {}], bad: none, ref: none },
  { name: '생성자 theme의 글이 아닌 색 = 주지 않음', opts: [X({ theme: { base: 'light', background: 5 } }), { theme: { base: 'light' } }], bad: none, ref: none },
];

/** 측정 붙잡기: 함수가 아닌 앱 함수·깨진 점 목록 */
const SNAP: readonly Case[] = [
  {
    name: 'setMeasureSnap 함수가 아닌 pointsFor만 = null(붙잡기 끔)',
    prep: (v) => v.setMeasureMode(true),
    bad: (v) => v.setMeasureSnap(X({ pointsFor: 'foo' })),
    ref: (v) => v.setMeasureSnap(null),
    act: hover,
  },
  {
    name: '함수가 아닌 pointsFor·refine·refineFace = 주지 않음(미리 보기가 던지지 않음)',
    prep: (v) => v.setMeasureMode(true),
    bad: (v) => v.setMeasureSnap(X({ midpoints: true, pointsFor: {}, refine: 'x', refineFace: 5 })),
    ref: (v) => v.setMeasureSnap({ midpoints: true }),
    act: hover,
  },
  {
    name: '축이 면을 뚫는 점의 함수가 아닌 refineFace = 주지 않음',
    prep: (v) => v.setMeasureMode(true),
    bad: (v) => v.setMeasureSnap(X({ refineFace: 'foo', inference: { axisFaces: true, axes: true } })),
    ref: (v) => v.setMeasureSnap({ inference: { axisFaces: true, axes: true } }),
    act: (v) => (click(v, 200, 150), hover(v)),
  },
  {
    name: 'points의 null·글·수 항목은 건너뛴다',
    prep: (v) => v.setMeasureMode(true),
    bad: (v) => v.setMeasureSnap(X({ midpoints: true, points: [null, { point: [10, 0, 10], kind: 'center' }, 5, 'x'] })),
    ref: (v) => v.setMeasureSnap({ midpoints: true, points: [{ point: [10, 0, 10], kind: 'center' }] }),
    act: hover,
  },
  {
    name: '배열이 아닌 points({}·Set) = 빈 목록',
    prep: (v) => v.setMeasureMode(true),
    bad: (v) => (v.setMeasureSnap(X({ midpoints: true, points: {} })), v.setMeasureSnap(X({ midpoints: true, points: new Set([{ point: [10, 0, 10] }]) }))),
    ref: (v) => v.setMeasureSnap({ midpoints: true, points: [] }),
    act: hover,
  },
];

/** 걷기·조명·마커·강조 선분의 수 자리, 창 확대, 생성자 화소 비율 */
const walkAct = (v: Viewer3d): unknown => {
  v.setWalkInput({ forward: 1 });
  v.renderNow();
  clock += 16;
  v.renderNow();
  v.setWalkInput({});
  return v.getCamera();
};
const NUM: readonly Case[] = [
  ...(['foo', NaN, Infinity, null, {}] as unknown[]).map(
    (h): Case => ({ name: `걷기 eyeHeight ${show(h)} = 주지 않음`, bad: (v) => v.setNavigation('walk', X({ eyeHeight: h })), ref: (v) => v.setNavigation('walk'), act: walkAct }),
  ),
  ...(['foo', NaN, -Infinity] as unknown[]).map(
    (s): Case => ({ name: `걷기 speed ${show(s)} = 주지 않음`, bad: (v) => v.setNavigation('walk', X({ speed: s })), ref: (v) => v.setNavigation('walk'), act: walkAct }),
  ),
  {
    name: '걷는 중 수가 아닌 eyeHeight = 주지 않음(앞 눈높이 그대로 — 다시 걷기로 들어갈 때 그 눈높이)',
    prep: (v) => v.setNavigation('walk', { eyeHeight: 800, stepHeight: 100, gravity: true }),
    bad: (v) => v.setNavigation('walk', X({ eyeHeight: 'x', stepHeight: NaN, radius: {} })),
    ref: none,
    act: (v) => (v.setNavigation('orbit'), v.setNavigation('walk'), v.walkBy(300, 0), v.getCamera()),
  },
  {
    name: '조명 수 필드의 글·객체 = 주지 않음(해 세기·주변광·그림자 크기·치우침)',
    bad: (v) => v.setLighting(X({ sun: { direction: [0, 0, 1], intensity: 'x', color: [1, 1, 1, 1] }, ambient: 'y', shadows: { size: 'x', bias: {} } })),
    ref: (v) => v.setLighting({ sun: { direction: [0, 0, 1], color: [1, 1, 1, 1] }, shadows: {} }),
  },
  { name: '마커 반지름·화면 높이의 글·객체 = 주지 않음', bad: (v) => v.setMarker(P, 'ball', X({ radius: 'x', sizePx: {} })), ref: (v) => v.setMarker(P, 'ball') },
  { name: '강조 선분 굵기의 글 = 주지 않음', bad: (v) => v.setHighlightSegments(SEG, X({ width: 'x' })), ref: (v) => v.setHighlightSegments(SEG) },
  ...([
    [0, 0, Infinity, 100],
    [NaN, 0, 100, 100],
    ['a', 0, 100, 100],
    [0, -Infinity, 100, 100],
  ] as unknown[][]).map((r): Case => ({ name: `zoomToRect(${r.map(show).join(', ')}) = 무시(false)`, bad: (v) => (v.zoomToRect as (...a: unknown[]) => Promise<boolean>)(...r, false), ref: () => false })),
  ...(['foo', NaN, {}] as unknown[]).map((m): Case => ({ name: `생성자 maxPixelRatio ${show(m)} = 주지 않음(2)`, opts: [X({ maxPixelRatio: m }), {}], bad: none, ref: none })),
];

/** 화면 밖 그리기(renderPixels)가 만드는 ImageData — Node에는 없다(v0490ao와 같다) */
function withImageData<T>(f: () => T): T {
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray;
      constructor(
        readonly width: number,
        readonly height: number,
      ) {
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    },
  );
  try {
    return f();
  } finally {
    vi.unstubAllGlobals();
  }
}

/** 선택 객체 null·setWalkInput(null)·구간 목록의 null 항목 */
const OPTS: readonly Case[] = [
  { name: 'measureCandidates 선택 null', prep: (v) => v.setMeasureMode(true), bad: (v) => v.measureCandidates(200, 150, X(null)), ref: (v) => v.measureCandidates(200, 150) },
  { name: 'commitMeasureCandidate 선택 null', prep: (v) => v.setMeasureMode(true), bad: (v) => v.commitMeasureCandidate(200, 150, 0, X(null)), ref: (v) => v.commitMeasureCandidate(200, 150, 0) },
  { name: 'snapshotSize 선택 null', bad: (v) => v.snapshotSize(X(null)), ref: (v) => v.snapshotSize() },
  { name: 'renderImage 선택 null', bad: (v) => withImageData(() => [v.renderImage(X(null)).width, v.snapshotSize().height]), ref: (v) => withImageData(() => [v.renderImage().width, v.snapshotSize().height]) },
  { name: 'toBlob(null) = toBlob()(화면 그림 — 화면 밖 선택 길로 가지 않음)', bad: (v) => v.toBlob(X(null)).then(() => 'ok', (e: unknown) => String(e)), ref: (v) => v.toBlob().then(() => 'ok', (e: unknown) => String(e)) },
  { name: 'setScene 선택 null', bad: (v) => v.setScene(scene(), X(null)), ref: (v) => v.setScene(scene()) },
  { name: 'setWalkInput(null) = 입력 없음', prep: (v) => v.setNavigation('walk'), bad: (v) => v.setWalkInput(X(null)), ref: (v) => v.setWalkInput({}), act: walkAct },
  { name: 'setHiddenRanges 목록의 null 항목은 건너뛴다', bad: (v) => v.setHiddenRanges('a', X([R, null])), ref: (v) => v.setHiddenRanges('a', [R]) },
  { name: 'setHiddenRanges { prims } 목록의 null 항목은 건너뛴다', bad: (v) => v.setHiddenRanges('a', X({ prims: [null, R] })), ref: (v) => v.setHiddenRanges('a', { prims: [R] }) },
  {
    name: 'highlightRanges 목록의 null 항목은 건너뛴다(0.92.0은 앞 강조를 반쯤 지운 채 던짐)',
    prep: (v) => v.highlightRanges({ b: [R] }),
    bad: (v) => v.highlightRanges(X({ a: [null, R] })),
    ref: (v) => v.highlightRanges({ a: [R] }),
  },
  { name: 'setItemPickThrough 목록의 null 항목은 건너뛴다', bad: (v) => v.setItemPickThrough('a', X([null, R])), ref: (v) => v.setItemPickThrough('a', [R]) },
];

/** 0.92.0도 던지지 않고 깨지지 않던 값 — 그대로 둔다 */
const KEPT: readonly Case[] = [
  {
    name: '함수가 아닌 값을 등록하고 받은 해제 함수는 불러도 던지지 않는다(그 뒤 좋은 알림 그대로)',
    bad: (v) => {
      for (const f of ['onViewCubeExpandedChange', 'onContextRestore', 'onContextRestoreDone', 'onCameraChange'] as const) (v[f] as (cb: unknown) => () => void)('foo')();
      v.onPick(X('foo'), { front: true })();
      return reg(v, 'onPick', good(v));
    },
    ref: (v) => reg(v, 'onPick', good(v)),
    act: (v) => (click(v, 200, 150), hits.get(v) ?? 0),
  },
  { name: 'claimPointer 처리기 글·수 = null(움직이고 떼도 던지지 않음)', bad: (v) => (fire(v, 'pointerdown', 1, 200, 150), v.claimPointer(1, X('foo'))), ref: (v) => (fire(v, 'pointerdown', 1, 200, 150), v.claimPointer(1, null)), act: (v) => (fire(v, 'pointermove', 1, 230, 160), fire(v, 'pointerup', 1, 230, 160), v.heldPointers) },
  { name: "setTheme('foo') = 어두운 기본", bad: (v) => v.setTheme(X('foo')), ref: (v) => v.setTheme('dark') },
  { name: "setViewCubeSize('foo')·NaN = 기본 한 변", bad: (v) => (v.setViewCubeSize(X('foo')), v.setViewCubeSize(NaN)), ref: (v) => v.setViewCubeSize(112) },
  { name: "setAnimate('foo') = true", bad: (v) => v.setAnimate(X('foo')), ref: (v) => v.setAnimate(true) },
  {
    name: '측정 추론 잠금의 깨진 방향({ direction: 글 }·{}·이름 아닌 글) = false',
    prep: (v) => (v.setMeasureSnap({ inference: true }), v.setMeasureMode(true), click(v, 200, 150)),
    bad: (v) => [v.setMeasureInferenceLock(X({ direction: 'abc' })), v.setMeasureInferenceLock(X({})), v.setMeasureInferenceLock(X('w'))],
    ref: () => [false, false, false],
  },
  { name: '걷기 eyeHeight undefined = 주지 않음', bad: (v) => v.setNavigation('walk', { eyeHeight: undefined }), ref: (v) => v.setNavigation('walk'), act: walkAct },
];

describe('알림 등록: 함수가 아닌 콜백', () => {
  for (const c of NOTIFY) it(c.name, () => same(c));
});
describe('포인터 맡기: 함수가 아닌 처리기', () => {
  for (const c of CLAIM) it(c.name, () => same(c));
});
describe('측정 글 꼴·테마', () => {
  for (const c of FORMAT) it(c.name, () => same(c));
});
describe('측정 붙잡기 선택', () => {
  for (const c of SNAP) it(c.name, () => same(c));
});
describe('수 자리의 꼴이 틀린 값: 걷기·조명·마커·강조 선분·창 확대·화소 비율', () => {
  for (const c of NUM) it(c.name, () => same(c));
});
describe('선택 객체 null·구간 목록', () => {
  for (const c of OPTS) it(c.name, () => same(c));
});
describe('순수 함수', () => {
  const cone = markerMesh('cone');
  it("markerMesh 이름이 아닌 kind = 'cone'(물려받은 이름 'toString'도)", () => {
    for (const k of ['foo', null, undefined, 'Cone', 5, '', 'toString', 'constructor']) expect([show(k), markerMesh(X(k))]).toEqual([show(k), cone]);
  });
  it('markerMesh 수로 읽히지 않는 segments = 주지 않음(24)', () => {
    for (const s of [NaN, 'x', {}]) expect([show(s), markerMesh('cone', X(s))]).toEqual([show(s), cone]);
  });
  it('markerMesh 무한대 segments = 주지 않음(24 — 0.92.0은 끝나지 않는 고리)', () => {
    for (const s of [Infinity, -Infinity]) expect([show(s), markerMesh('ball', s)]).toEqual([show(s), markerMesh('ball')]);
  });
  it('parseColor 글이 아닌 값 = null', () => {
    for (const c of [5, null, undefined, ['#fff'], {}]) expect([show(c), parseColor(X(c))]).toEqual([show(c), null]);
  });
  it('mergeRanges 목록의 null·undefined 항목은 건너뛴다', () => {
    expect(mergeRanges(X([null, R, undefined, { start: 5, count: 1 }]), 10)).toEqual(mergeRanges([R, { start: 5, count: 1 }], 10));
  });
  it('그대로: markerMesh 0 이하·소수·null(0)·수로 읽히는 글 segments, mergeRanges 글·{}', () => {
    expect([0, -3, 2.5, null].map((s) => markerMesh('cone', X(s)).positions.length)).toEqual([0, 0, 270, 0]);
    expect(markerMesh('ball', X('8'))).toEqual(markerMesh('ball', 8));
    expect([mergeRanges(X('abc'), 10), mergeRanges(X({}), 10)]).toEqual([[], []]);
  });
});
describe('0.92.0과 같은 값으로 두는 것', () => {
  for (const c of KEPT) it(c.name, () => same(c));
});
