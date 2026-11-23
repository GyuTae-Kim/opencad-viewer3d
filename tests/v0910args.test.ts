/**
 * 0.91.0 꼴이 틀린 인자(91차 — 0.87.0 남은 한계 「축 이름이 아닌 글이나 normal: null은 TypeError를 던진다」):
 * TypeScript 형은 실행 때 지켜 주지 않는다 — 앱이 파일·보기 링크·사용자 입력에서 만든 값이 null·undefined·빈 객체·엉뚱한 글·수 대신 글·배열 대신 객체로 올 수 있다.
 * 0.90.0은 단면·보기 API가 그런 값에 TypeError를 던지거나(setSection·setSections·setSectionAxis·setSectionPosition·setSectionOptions·sectionRange·setView·setViewDir·fitItems),
 * 투영·그리기 모드·카메라가 형 밖 값을 그대로 두어 깨진 상태로 남았다(setProjection·setRenderMode·생성자·setCamera·flyTo의 projection — 그리기는 평행인데 고르기·전체 보기는
 * 다른 판정이라 전체 보기 거리 0, setViewDir ±Infinity → 방위각 NaN 카메라, 시야각 글 → 움직임 보간이 글 잇기로 NaN).
 * 0.91.0은 82~87차 규칙을 따른다: 꼭 줘야 하는 자리가 깨지면 그 호출을 받지 않고(앞 상태 그대로 — 단면·카메라·보기가 이미 쓰는 쪽, Promise는 곧 false),
 * setSections의 목록이 배열이 아니면 null(끔)과 같고, 선택 필드·선택 객체가 깨지면 그것을 주지 않은 것과 같다.
 * 경우마다 깨진 값을 준 뷰어와 같아야 할 부름(부르지 않음·주지 않음·null)의 뷰어가 상태·돌려준 값·그리기 기록(가짜 WebGL2 — 프로그램·속성·균일 변수 값)에서 같고
 * 균일 변수가 모두 유한하다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { guardGl } from './glguard';
import { type CameraState, dirToAngles } from '../src/camera';
import { planeFrom } from '../src/section';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { type SectionPlane, Viewer3d, type Viewer3dOptions } from '../src/viewer';

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

/** 상자 둘 + 원점 있는 상자 + 선분 묶음 */
const scene = (): Scene3d => {
  const c = boxMesh('c', [0, 0, 0], [4, 4, 4], [0.5, 0.8, 0.5, 1]);
  c.origin = [40, 0, 0];
  return {
    name: 's',
    units: 'mm',
    meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [16, 2, 0], [26, 8, 6], [0.8, 0.6, 0.5, 1]), c],
    lines: [{ id: 'L', positions: Float32Array.of(0, 0, 12, 10, 0, 12, 10, 0, 12, 10, 10, 12), color: [1, 0, 0, 1] }],
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
/** Promise가 지금 풀렸는지(풀렸으면 그 값, 아니면 'pending') */
async function state<T>(p: Promise<T>): Promise<T | 'pending'> {
  const PENDING = Symbol('pending');
  const r = await Promise.race([p, Promise.resolve(PENDING)]);
  return r === PENDING ? 'pending' : (r as T);
}
/** 견줄 상태: 단면 평면 모두·카메라·투영·그리기 모드 */
const look = (v: Viewer3d): unknown => ({ sections: v.sections, camera: v.getCamera(), projection: v.getProjection(), mode: v.getRenderMode() });
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
  const fa = frame(A);
  const fb = frame(B);
  expect({ thrown, bad: uniq(A.bad), ret: ra, look: look(A.v), draws: fa.length }).toEqual({ thrown: '-', bad: [], ret: rb, look: look(B.v), draws: fb.length });
  expect(B.bad).toEqual([]);
  expect(fa).toEqual(fb);
}

const Z = (v: Viewer3d): void => v.setSectionAxis('z', 0.5);
const GOOD: SectionPlane = { normal: [0, 0, 1], offset: 5 };

/** 단면: 0.90.0은 던지거나 형 밖 값을 상태에 두었다 */
const SECTION: readonly Case[] = [
  { name: 'setSection normal null·없음 = 부르지 않음(앞 단면 그대로)', prep: Z, bad: (v) => (v.setSection(X({ normal: null, offset: 1 })), v.setSection(X({}))), ref: none },
  { name: 'setSection 글·수·배열 = 부르지 않음', prep: Z, bad: (v) => (v.setSection(X('foo')), v.setSection(X(5)), v.setSection(X([0, 0, 1]))), ref: none },
  { name: 'setSection 선택 null = 주지 않음', prep: Z, bad: (v) => v.setSection(GOOD, X(null)), ref: (v) => v.setSection(GOOD) },
  {
    name: 'setSection caps 엉뚱한 글 = 주지 않음(앞 caps 그대로)',
    prep: (v) => v.setSectionAxis('z', 0.5, { caps: 'none' }),
    bad: (v) => v.setSection(GOOD, X({ caps: 'foo' })),
    ref: (v) => v.setSection(GOOD),
  },
  { name: 'setSections 글·유사 배열 = null(끔)', prep: Z, bad: (v) => (v.setSections(X('foo')), Z(v), v.setSections(X({ length: 1, 0: GOOD }))), ref: (v) => v.setSection(null) },
  { name: 'setSections 객체가 아닌 평면(null·undefined·수·글)은 뺀다', bad: (v) => v.setSections(X([null, GOOD, undefined, 5, 'x'])), ref: (v) => v.setSections([GOOD]) },
  { name: 'setSections normal null 평면은 뺀다', bad: (v) => v.setSections(X([{ normal: null, offset: 1 }, GOOD])), ref: (v) => v.setSections([GOOD]) },
  { name: 'setSections 객체가 아닌 평면뿐 = 끔', prep: Z, bad: (v) => v.setSections(X([null, 7])), ref: (v) => v.setSection(null) },
  { name: 'setSections items 돌 수 없는 값({}·수) = 주지 않음(모든 묶음)', bad: (v) => v.setSections(X([{ ...GOOD, items: {} }, { normal: [1, 0, 0], offset: 20, items: 5 }])), ref: (v) => v.setSections([GOOD, { normal: [1, 0, 0], offset: 20 }]) },
  { name: 'setSections 선택 null = 주지 않음', bad: (v) => v.setSections([GOOD], X(null)), ref: (v) => v.setSections([GOOD]) },
  { name: 'setSections 평면 caps 엉뚱한 글 = 주지 않음(선택의 caps)', bad: (v) => v.setSections(X([{ ...GOOD, caps: 'foo' }]), { caps: 'all' }), ref: (v) => v.setSections([GOOD], { caps: 'all' }) },
  {
    name: 'setSectionAxis 축 이름이 아님(엉뚱한 글·null·undefined·대문자·물려받은 이름) = 부르지 않음',
    prep: Z,
    bad: (v) => {
      for (const a of ['w', null, undefined, 'X', 'toString', 'constructor', 5]) v.setSectionAxis(X(a), 0.5);
    },
    ref: none,
  },
  { name: 'setSectionAxis 선택 null = 주지 않음', prep: Z, bad: (v) => v.setSectionAxis('x', 0.3, X(null)), ref: (v) => v.setSectionAxis('x', 0.3) },
  {
    name: 'setSectionAxis caps 엉뚱한 글 = 주지 않음(앞 caps 그대로)',
    prep: (v) => v.setSection(GOOD, { caps: 'all' }),
    bad: (v) => v.setSectionAxis('x', 0.3, X({ caps: 'foo', outline: false })),
    ref: (v) => v.setSectionAxis('x', 0.3, { outline: false }),
  },
  { name: 'setSectionPosition 선택 null = 주지 않음', prep: Z, bad: (v) => v.setSectionPosition(0.3, X(null)), ref: (v) => v.setSectionPosition(0.3) },
  { name: 'setSectionOptions null·글 = 부르지 않음', prep: Z, bad: (v) => (v.setSectionOptions(X(null)), v.setSectionOptions(X('abc'))), ref: none },
  { name: 'setSectionOptions caps 엉뚱한 글 = 주지 않음', prep: Z, bad: (v) => v.setSectionOptions(X({ caps: 'foo', plane: false })), ref: (v) => v.setSectionOptions({ plane: false }) },
  {
    name: 'sectionRange null·undefined·물려받은 이름 = { min: 0, max: 0 }(이름 아닌 글·NaN과 같다)',
    bad: (v) => [v.sectionRange(X(null)), v.sectionRange(X(undefined)), v.sectionRange(X('toString'))],
    ref: (v) => [v.sectionRange(X('w')), v.sectionRange([NaN, 0, 0]), { min: 0, max: 0 }],
  },
];

/** 단면: 0.90.0도 던지지 않고 깨지지 않던 값 — 그대로 둔다 */
const SECTION_KEPT: readonly Case[] = [
  { name: 'setSection undefined = null(끔)', prep: Z, bad: (v) => v.setSection(X(undefined)), ref: (v) => v.setSection(null) },
  { name: 'setSection offset 글·없음·null = 부르지 않음', prep: Z, bad: (v) => (v.setSection(X({ normal: [0, 0, 1], offset: '5' })), v.setSection(X({ normal: [0, 0, 1] })), v.setSection(X({ normal: [0, 0, 1], offset: null }))), ref: none },
  { name: 'setSection normal 글·객체 = 부르지 않음', prep: Z, bad: (v) => (v.setSection(X({ normal: 'abc', offset: 1 })), v.setSection(X({ normal: { x: 1 }, offset: 1 }))), ref: none },
  { name: 'setSections {}·평면 하나(배열 아님)·Set = 끔', prep: Z, bad: (v) => (v.setSections(X({})), Z(v), v.setSections(X(GOOD)), Z(v), v.setSections(X(new Set([GOOD])))), ref: (v) => v.setSection(null) },
  { name: 'setSections items 안의 null·수·id 없는 객체는 버린다(빈 목록)', bad: (v) => v.setSections(X([{ ...GOOD, items: [null, 5, { id: 5 }] }])), ref: (v) => v.setSections([{ ...GOOD, items: [] }]) },
  { name: 'setSectionAxis 위치 글은 수로 읽는다(범위 안 위치)', prep: Z, bad: (v) => v.setSectionAxis('x', X('0.25')), ref: (v) => v.setSectionAxis('x', 0.25) },
  { name: 'sectionHandle·moveSectionByPixels 번호 글 = 없는 평면', prep: Z, bad: (v) => [v.sectionHandle(X('a')), v.moveSectionByPixels(5, 5, X('a'))], ref: () => [null, null] },
];

const cam = (v: Viewer3d, p: Record<string, unknown>): CameraState => X({ ...v.getCamera(), yaw: 0.3, pitch: 0.4, ...p });

/** 보기: 0.90.0은 던지거나(이름·방향 없음) 앞 보기·NaN 카메라로 갔다 */
const VIEW: readonly Case[] = [
  ...['foo', undefined, null, 'TOP', 'toString', 'constructor', 3].map((n): Case => ({ name: `setView(${String(n)}) = 곧 false(카메라 그대로)`, bad: (v) => v.setView(X(n), false), ref: () => false })),
  ...([null, undefined, [Infinity, 0, 0], [1, -Infinity, 1], [NaN, 0, 0], [0, NaN, 1], 'abc', {}, 5, [1, 0], ['1', '0', '0']] as unknown[]).map(
    (d): Case => ({ name: `setViewDir(${show(d)}) = 곧 false(카메라 그대로)`, bad: (v) => v.setViewDir(X(d), false), ref: () => false }),
  ),
  { name: 'fitItems 돌 수 없는 값({}·수) = null과 같다(전체 보기)', bad: async (v) => [await v.fitItems(X({}), false), await v.fitItems(X(5), false)], ref: async (v) => [await v.fitItems(X(null), false), await v.fit(false)] },
];

const VIEW_KEPT: readonly Case[] = [
  { name: 'setViewDir [0, 0, 0](유한한 0 방향) = 앞 보기(0.90.0 그대로)', bad: (v) => v.setViewDir([0, 0, 0], false), ref: (v) => v.setView('front', false) },
  { name: 'setViewDir 길이가 1이 아닌 유한 방향 = 같은 방향의 표준 뷰', bad: (v) => v.setViewDir([2, 0, 0], false), ref: (v) => v.setView('right', false) },
  { name: 'fitItems 글 하나는 글자마다 id로 읽는다(0.90.0 그대로)', bad: (v) => v.fitItems(X('a'), false), ref: (v) => v.fitItems(['a'], false) },
];

/** 투영·그리기 모드·카메라: 0.90.0은 형 밖 값을 상태에 두었다 */
const MODE: readonly Case[] = [
  ...['foo', undefined, null, 'ortho', 1].map((p): Case => ({ name: `setProjection(${String(p)}) = 부르지 않음(앞 투영 그대로)`, prep: (v) => v.setProjection('orthographic'), bad: (v) => v.setProjection(X(p)), ref: none })),
  { name: 'setProjection 엉뚱한 글 뒤 전체 보기 = 전체 보기만(0.90.0은 거리 0)', bad: (v) => (v.setProjection(X('foo')), v.fit(false)), ref: (v) => v.fit(false) },
  ...['foo', undefined, null, 'Shaded', 2].map((m): Case => ({ name: `setRenderMode(${String(m)}) = 부르지 않음(앞 모드 그대로)`, prep: (v) => v.setRenderMode('hiddenLine'), bad: (v) => v.setRenderMode(X(m)), ref: none })),
  { name: 'setRenderMode 엉뚱한 글은 단면 채우기도 그대로', prep: Z, bad: (v) => v.setRenderMode(X('foo')), ref: none },
  { name: '생성자 projection 엉뚱한 글 = 주지 않음(원근)', opts: [X({ projection: 'foo' }), {}], bad: none, ref: none },
  { name: '생성자 renderMode 엉뚱한 글 = 주지 않음(음영+윤곽)', opts: [X({ renderMode: 'xRay' }), {}], bad: none, ref: none },
  { name: 'setCamera projection 엉뚱한 글·undefined = 부르지 않음', bad: (v) => (v.setCamera(cam(v, { projection: 'foo' })), v.setCamera(cam(v, { projection: undefined }))), ref: none },
  {
    name: 'setCamera projection 없음 = 부르지 않음',
    bad: (v) => {
      const { projection: _p, ...c } = cam(v, {});
      void _p;
      v.setCamera(X(c));
    },
    ref: none,
  },
  { name: 'flyTo projection 엉뚱한 글 = 곧 false', bad: (v) => v.flyTo(cam(v, { projection: 'perspectiv' }), false), ref: () => false },
  { name: 'setCamera 시야각 글·참·배열 = 부르지 않음(fovY 없음·NaN과 같다)', bad: (v) => (v.setCamera(cam(v, { fovY: '0.7' })), v.setCamera(cam(v, { fovY: true })), v.setCamera(cam(v, { fovY: [1] }))), ref: none },
];

const MODE_KEPT: readonly Case[] = [
  { name: '생성자 projection·renderMode null = 주지 않음(0.90.0 그대로)', opts: [X({ projection: null, renderMode: null }), {}], bad: none, ref: none },
  { name: 'setCamera(getCamera()) 평행 = 받음', bad: (v) => v.setCamera({ ...v.getCamera(), projection: 'orthographic' }), ref: (v) => v.setProjection('orthographic') },
  { name: 'setCamera 대상점·거리 글 = 부르지 않음(0.82.0)', bad: (v) => (v.setCamera(cam(v, { target: '123' })), v.setCamera(cam(v, { distance: '20' }))), ref: none },
];

describe('planeFrom: 법선이 없으면 null', () => {
  it('null·undefined는 null, 깨진 법선(NaN·글)과 같다', () => {
    expect(planeFrom(X(null), 1)).toBeNull();
    expect(planeFrom(X(undefined), 0)).toBeNull();
    expect(planeFrom(X('abc'), 0)).toBeNull();
    expect(planeFrom([0, 0, 2], 4)).toEqual({ normal: [0, 0, 1], offset: 2, plane: [0, 0, 1, -2] });
  });
});

describe('단면: 꼴이 틀린 인자', () => {
  for (const c of SECTION) it(c.name, () => same(c));
});
describe('보기: 꼴이 틀린 인자', () => {
  for (const c of VIEW) it(c.name, () => same(c));
  it('받지 않은 setView·setViewDir는 옮기던 움직임을 그만두지 않는다(flyTo의 깨진 카메라와 같다)', async () => {
    const w = view({ animate: true });
    const c0 = w.v.getCamera();
    const a = dirToAngles([1, 0.2, 0.3]);
    const to: CameraState = { ...c0, yaw: a.yaw, pitch: a.pitch, distance: 80 };
    const p = w.v.flyTo(to);
    clock += 100;
    w.v.renderNow();
    const mid = w.v.getCamera();
    expect(await state(w.v.setViewDir([NaN, 1, 0]))).toBe(false);
    expect(await state(w.v.setView(X('foo')))).toBe(false);
    expect(await state(p)).toBe('pending');
    expect(w.v.getCamera()).toEqual(mid);
    clock += 300;
    w.v.renderNow();
    expect(await state(p)).toBe(true);
    expect(w.v.getCamera()).toEqual(to);
    expect(w.bad).toEqual([]);
  });
});
describe('투영·그리기 모드·카메라: 꼴이 틀린 인자', () => {
  for (const c of MODE) it(c.name, () => same(c));
  it('시야각 글로 받은 카메라를 옮기면 보간이 글을 이어 NaN이 된다 — 받지 않으니 옮기는 동안 균일 변수가 유한하다', async () => {
    const w = view({ animate: true });
    const c0 = w.v.getCamera();
    w.v.setCamera(cam(w.v, { fovY: '0.6' }));
    expect(w.v.getCamera()).toEqual(c0);
    const a = dirToAngles([1, 0.2, 0.3]);
    const p = w.v.flyTo({ ...c0, yaw: a.yaw, pitch: a.pitch, distance: 80 });
    clock += 100;
    w.v.renderNow();
    expect(Number.isFinite(w.v.getCamera().fovY)).toBe(true);
    clock += 300;
    w.v.renderNow();
    expect(await p).toBe(true);
    expect(w.bad).toEqual([]);
  });
});
describe('0.90.0과 같은 값으로 두는 것', () => {
  for (const c of [...SECTION_KEPT, ...VIEW_KEPT, ...MODE_KEPT]) it(c.name, () => same(c));
});
