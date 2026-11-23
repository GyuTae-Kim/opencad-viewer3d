/**
 * 0.94.0 장면 계약 밖 값·키 사건 자리·생성자 수 선택·입구 순수 함수(94차 — 0.93.0 남은 한계): TypeScript 형 밖 값을 주면
 * - setScene(null)·객체가 아닌 장면, 돌 수 없는 meshes·lines·points·textures, 목록의 null 항목, Float32Array가 아닌 positions(글)는 TypeError —
 *   돌 수 있지만 배열이 아닌 목록(Set)은 장면을 반쯤 바꾼 뒤 TypeError, 객체·일반 배열 positions는 그리지 못한 채 범위·고르기에만 들었다,
 * - setMesh의 Float32Array가 아닌 positions(글)·Uint32Array가 아닌 indices(글)는 TypeError(indices는 장면을 바꾼 뒤),
 * - handleKey·handleKeyUp(null)은 TypeError, preventDefault가 없는 키 사건 객체는 처리한 뒤 TypeError,
 * - 생성자 pickTolerance·touchPickTolerance가 유한한 수가 아니면(글·NaN·{}·수로 읽히는 글·±Infinity) 선분을 고르지 못하거나 어디서나 골랐고,
 *   textureLimit·textureBudget이 수로 읽히지 않으면 한 장 한도·전체 예산이 없는 것처럼 풀었다(GPU 한도를 넘는 긴 변),
 * - 순수 gridSpec·gridLines·sceneBounds·checkScene·imageInfo·walkKeyOf·keySnapAction은 null(객체가 아닌 값)에 TypeError, gridSpec은 이름이 아닌 높이를,
 *   pickTolerance는 유한한 수가 아닌 허용 거리를 그대로 돌려줬다.
 * 0.94.0은 82~93차 규칙을 따른다: 객체가 아닌 장면은 clear()(지움), 돌 수 없는 목록은 빈 목록·돌 수 있는 목록은 배열로, null 항목은 수 항목처럼(빼고 알림),
 * Float32Array가 아닌 positions는 positions가 없는 것(빼고 알림), Uint32Array가 아닌 indices는 그 그물을 빼고 알린다(placement · indices).
 * 객체가 아닌 키 사건은 처리하지 않고(false), preventDefault가 함수가 아니면 부르지 않는다. 생성자 수 선택은 주지 않은 것, 순수 함수는 빈 값(빈 범위·빈 장면·null·기본)이다.
 * 경우마다 깨진 값을 준 뷰어와 같아야 할 부름의 뷰어가 상태·돌려준 값·그 뒤 사건·그리기 기록(가짜 WebGL2)에서 같고 균일 변수가 모두 유한하다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { guardGl } from './glguard';
import { emptyBox, sceneBounds } from '../src/bounds';
import { gridLines, gridSpec } from '../src/grid';
import { keySnapAction } from '../src/keysnap';
import { PICK_TOLERANCE_PX, TOUCH_PICK_TOLERANCE_PX, pickTolerance, walkKeyOf } from '../src/pointer';
import { checkScene } from '../src/sceneissues';
import { boxMesh } from '../src/synth';
import { imageInfo } from '../src/texture';
import type { Mesh3d, Scene3d, Texture3d } from '../src/types';
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

const A = (): Mesh3d => boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]);
const B = (): Mesh3d => boxMesh('b', [16, 2, 0], [26, 8, 6], [0.8, 0.6, 0.5, 1]);
const LINE = () => ({ id: 'L', positions: Float32Array.of(0, 0, 12, 10, 0, 12, 10, 0, 12, 10, 10, 12), color: [1, 0, 0, 1] as [number, number, number, number], segmentIds: Uint32Array.of(3, 7) });
const PTS = () => ({ id: 'P', positions: Float32Array.of(5, 5, 14, 20, 5, 10), color: [0, 0, 1, 1] as [number, number, number, number], size: 6 });
/** 상자 둘 + 원본 번호가 있는 선분 묶음 + 점 묶음 */
const scene = (): Scene3d => ({ name: 's', units: 'mm', meshes: [A(), B()], lines: [LINE()], points: [PTS()] });

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
/** 견줄 상태: 카메라·장면(묶음 id)·장면 알림·맞춤 범위·단면·측정·걷기·키보드 커서 */
const look = (v: Viewer3d, issues = true): unknown => {
  const s = v.scene;
  return {
    camera: v.getCamera(),
    scene: s ? [s.meshes.map((m) => m.id), s.lines.map((l) => l.id), (s.points ?? []).map((p) => p.id), (s.textures ?? []).length] : null,
    issues: issues ? v.sceneIssues : null,
    fit: v.fitBounds,
    section: v.section,
    measure: [v.measurePointCount, v.measurement()?.distance ?? null, v.measureHoverSnap],
    nav: v.navigation,
    cursor: v.keyboardCursor,
  };
};
/** 형 밖 값(시험에서만 — 공개 형은 그대로) */
const X = <T>(x: unknown): T => x as T;
/** 시험 이름에 쓰는 값 글 */
const show = (d: unknown): string =>
  d === undefined
    ? 'undefined'
    : d instanceof Float64Array
      ? 'Float64Array'
      : d instanceof Uint16Array
        ? 'Uint16Array'
        : (JSON.stringify(d, (_k, x: unknown) => (typeof x === 'number' && !Number.isFinite(x) ? String(x) : x)) ?? String(d));

const ev = (type: string, id: number, x: number, y: number, pt = 'mouse') => ({
  clientX: x,
  clientY: y,
  pointerId: id,
  pointerType: pt,
  button: type === 'pointermove' ? -1 : 0,
  buttons: type === 'pointerup' || type === 'pointermove' ? 0 : 1,
  shiftKey: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
});
const click = (v: Viewer3d, x: number, y: number, pt = 'mouse'): void => {
  clock += 500;
  canvasOf(v).fire('pointerdown', ev('pointerdown', 1, x, y, pt));
  canvasOf(v).fire('pointerup', ev('pointerup', 1, x, y, pt));
};
/** 장면을 바꾼 뒤 사건: 누르기·전체 보기·단면·고르기(던지지 않고 같은 값이어야 한다) */
const afterScene = (v: Viewer3d): unknown => (click(v, 200, 150), v.fit(false), v.setSectionAxis('x', 0.5), v.pick(200, 150)?.id ?? null);
/** 키 사건(기본 동작 막기를 센다 — 브라우저 KeyboardEvent처럼) */
const key = (k: string, o: { code?: string; shiftKey?: boolean; target?: unknown } = {}): KeyboardEvent => {
  const e = {
    key: k,
    code: o.code,
    shiftKey: !!o.shiftKey,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: o.target ?? null,
    defaultPrevented: false,
    preventDefault() {
      e.defaultPrevented = true;
    },
  };
  return X(e);
};
/** preventDefault가 없는 키 사건 객체(앱이 만든 값) */
const bare = (k: string, o: { code?: string; target?: unknown } = {}): KeyboardEvent => X({ key: k, code: o.code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, target: o.target ?? null });
/** 선분 L 가운데에서 아래로 떨어진 자리마다 고르기(허용 거리를 본다) */
const picks = (v: Viewer3d, pt: string): unknown => {
  const p = v.project([5, 0, 12])!;
  return [3, 6, 9, 13, 20, 60].map((dy) => {
    const h = v.pick(p.x, p.y + dy, pt);
    return h ? `${h.id}:${h.kind}` : null;
  });
};
/** 측정 미리 보기: 선분 끝 둘레(붙잡기 거리를 본다) */
const hover = (pt: string) => (v: Viewer3d): unknown => {
  v.setMeasureMode(true);
  const q = v.project([10, 0, 12])!;
  const out: unknown[] = [];
  for (const dx of [4, 9, 12, 16]) {
    canvasOf(v).fire('pointermove', ev('pointermove', 1, q.x + dx, q.y + 1, pt));
    v.renderNow();
    out.push(v.measureHoverSnap?.snap ?? null);
  }
  return out;
};

interface Case {
  name: string;
  /** 두 뷰어를 만드는 선택(깨진 값·같아야 할 값 — 없으면 둘 다 기본) */
  opts?: readonly [Viewer3dOptions, Viewer3dOptions];
  /** 두 뷰어에 먼저 거는 멀쩡한 값(건 뒤 한 번 그린다) */
  prep?: (v: Viewer3d) => void;
  /** 깨진 값(돌려준 값도 견준다) */
  bad: (v: Viewer3d) => unknown;
  /** 같아야 할 부름 */
  ref: (v: Viewer3d) => unknown;
  /** 그 뒤 두 뷰어에 같은 사건 */
  act?: (v: Viewer3d) => unknown;
  /** 장면 알림은 따로 본다(같아야 할 부름이 같은 알림을 만들 수 없을 때) */
  noIssues?: boolean;
}

async function same(c: Case): Promise<void> {
  const a = view(c.opts?.[0]);
  const b = view(c.opts?.[1]);
  for (const w of [a, b]) {
    c.prep?.(w.v);
    w.v.renderNow();
  }
  let thrown = '-';
  let ra: unknown;
  try {
    ra = await c.bad(a.v);
  } catch (e) {
    thrown = String(e);
  }
  const rb = await c.ref(b.v);
  let xa: unknown, xb: unknown;
  if (c.act) {
    try {
      xa = await c.act(a.v);
    } catch (e) {
      thrown += ` / 사건 ${String(e)}`;
    }
    xb = await c.act(b.v);
  }
  let fa: DrawEntry[] = [];
  try {
    fa = frame(a);
  } catch (e) {
    thrown += ` / 그리기 ${String(e)}`;
  }
  const fb = frame(b);
  expect({ thrown, bad: uniq(a.bad), ret: ra, act: xa, look: look(a.v, !c.noIssues), draws: fa.length }).toEqual({ thrown: '-', bad: [], ret: rb, act: xb, look: look(b.v, !c.noIssues), draws: fb.length });
  expect(b.bad).toEqual([]);
  expect(fa).toEqual(fb);
}

const P9 = Float32Array.of(0, 0, 30, 5, 0, 30, 0, 5, 30);
/** Float32Array가 아닌 위치(글·길이만 있는 객체·일반 배열·다른 형식 배열) */
const NOT_F32: readonly unknown[] = ['abc', { length: 9 }, [0, 0, 30, 5, 0, 30, 0, 5, 30], Float64Array.from(P9)];
/** Uint32Array가 아닌 색인 */
const NOT_U32: readonly unknown[] = ['abc', [0, 1, 2], Uint16Array.of(0, 1, 2)];
const sc = (o: Record<string, unknown>): Scene3d => X({ name: 's', units: 'mm', ...o });

const SCENE: readonly Case[] = [
  ...([null, undefined, 'abc', 5, true] as unknown[]).map(
    (s): Case => ({ name: `setScene(${show(s)}) = clear()(단면도 끈다)`, prep: (v) => v.setSectionAxis('y', 0.3), bad: (v) => v.setScene(X(s)), ref: (v) => v.clear(), act: afterScene }),
  ),
  { name: 'setScene({}) = 빈 목록 장면', bad: (v) => v.setScene(X({})), ref: (v) => v.setScene(X({ meshes: [], lines: [] })), act: afterScene },
  {
    name: '돌 수 없는 meshes·lines·points·textures(수·null·글·{}) = 빈 목록',
    bad: (v) => v.setScene(sc({ meshes: 5, lines: null, points: 'abc', textures: {} })),
    ref: (v) => v.setScene(sc({ meshes: [], lines: [] })),
    act: afterScene,
  },
  {
    name: '돌 수 없는 lines만 = 빈 선분 목록(그물은 그대로)',
    bad: (v) => v.setScene(sc({ meshes: [A(), B()], lines: 7, points: [PTS()] })),
    ref: (v) => v.setScene(sc({ meshes: [A(), B()], lines: [], points: [PTS()] })),
    act: afterScene,
  },
  {
    name: '돌 수 있는 목록(Set) = 배열(0.93.0은 장면을 반쯤 바꾼 뒤 TypeError)',
    bad: (v) => v.setScene(sc({ meshes: new Set([A(), B()]), lines: new Set([LINE()]), points: new Set([PTS()]), textures: new Set() })),
    ref: (v) => v.setScene(scene()),
    act: afterScene,
  },
  {
    name: '목록의 null·undefined 항목 = 수 항목과 같다(빼고 알림 — 0.93.0도 수·글 항목은 그랬다)',
    bad: (v) => v.setScene(sc({ meshes: [null, A(), undefined], lines: [LINE(), null], points: [null, PTS()] })),
    ref: (v) => v.setScene(sc({ meshes: [5, A(), 5], lines: [LINE(), 5], points: [5, PTS()] })),
    act: afterScene,
  },
  ...NOT_F32.map(
    (p): Case => ({
      name: `그물·선분·점 positions ${show(p)} = positions 없음(빼고 알림)`,
      bad: (v) => v.setScene(sc({ meshes: [A(), { id: 's', positions: p, color: [1, 1, 1, 1] }], lines: [{ id: 'l', positions: p, color: [1, 1, 1, 1] }], points: [{ id: 'p', positions: p, color: [1, 1, 1, 1] }] })),
      ref: (v) => v.setScene(sc({ meshes: [A(), { id: 's', color: [1, 1, 1, 1] }], lines: [{ id: 'l', color: [1, 1, 1, 1] }], points: [{ id: 'p', color: [1, 1, 1, 1] }] })),
      act: afterScene,
    }),
  ),
  ...NOT_U32.map(
    (i): Case => ({
      name: `그물 indices ${show(i)} = 그 그물을 뺀다(알림은 따로 — placement · indices)`,
      bad: (v) => v.setScene(sc({ meshes: [A(), { id: 's', positions: P9, indices: i, color: [1, 1, 1, 1] }], lines: [LINE()] })),
      ref: (v) => v.setScene(sc({ meshes: [A()], lines: [LINE()] })),
      act: afterScene,
      noIssues: true,
    }),
  ),
  ...NOT_F32.map(
    (p): Case => ({
      name: `setMesh positions ${show(p)} = false(장면 그대로)`,
      bad: (v) => [v.setMesh(X({ id: 'a', positions: p, color: [1, 1, 1, 1] })), v.setMesh(X({ id: 'n', positions: p, color: [1, 1, 1, 1] }))],
      ref: (v) => [v.setMesh(X({ id: 'a', color: [1, 1, 1, 1] })), v.setMesh(X({ id: 'n', color: [1, 1, 1, 1] }))],
      act: afterScene,
    }),
  ),
  ...NOT_U32.map(
    (i): Case => ({
      name: `setMesh indices ${show(i)} = false(장면 그대로 — 0.93.0은 장면을 바꾼 뒤 TypeError)`,
      bad: (v) => v.setMesh(X({ id: 'a', positions: P9, indices: i, color: [1, 1, 1, 1] })),
      ref: () => false,
      act: afterScene,
    }),
  ),
];

const JUNK_KEY: readonly unknown[] = [null, undefined, 'f', 5, true];
const KEYS: readonly Case[] = [
  { name: `handleKey(${JUNK_KEY.map(show).join('·')}) = false`, bad: (v) => JUNK_KEY.map((e) => v.handleKey(X(e))), ref: () => JUNK_KEY.map(() => false), act: (v) => (v.orbitBy(0.1, 0), v.renderNow(), 0) },
  {
    name: '걷는 중 handleKey(null) = false',
    prep: (v) => v.setNavigation('walk'),
    bad: (v) => v.handleKey(X(null)),
    ref: () => false,
    act: (v) => ((clock += 16), v.renderNow(), (clock += 16), v.renderNow(), 0),
  },
  { name: '키보드 스냅 켠 뒤 handleKey(null) = false', prep: (v) => (v.setKeyboardSnap(true), v.setMeasureMode(true)), bad: (v) => v.handleKey(X(null)), ref: () => false },
  { name: `handleKeyUp(${JUNK_KEY.map(show).join('·')}) = false`, prep: (v) => v.setNavigation('walk'), bad: (v) => JUNK_KEY.map((e) => v.handleKeyUp(X(e))), ref: () => JUNK_KEY.map(() => false) },
  ...['f', '1', '5'].map((k): Case => ({ name: `preventDefault가 없는 키 사건 '${k}' = 처리(true)`, prep: (v) => v.orbitBy(0.4, 0.1), bad: (v) => v.handleKey(bare(k)), ref: (v) => v.handleKey(key(k)) })),
  {
    name: "preventDefault가 없는 키 사건 'Escape'(측정 지우기) = 처리(true)",
    prep: (v) => (v.setMeasureMode(true), click(v, 200, 150)),
    bad: (v) => v.handleKey(bare('Escape')),
    ref: (v) => v.handleKey(key('Escape')),
  },
  {
    name: "preventDefault가 없는 걷기 키 'w' = 처리(true — 누른 동안 걷는다)",
    prep: (v) => v.setNavigation('walk'),
    bad: (v) => v.handleKey(bare('w', { code: 'KeyW' })),
    ref: (v) => v.handleKey(key('w', { code: 'KeyW' })),
    act: (v) => ((clock += 16), v.renderNow(), (clock += 16), v.renderNow(), v.handleKeyUp(bare('w', { code: 'KeyW' }))),
  },
  {
    name: "preventDefault가 없는 키보드 스냅 키 'ArrowRight' = 처리(true)",
    prep: (v) => (v.setKeyboardSnap(true), v.setMeasureMode(true)),
    bad: (v) => [v.handleKey(bare('ArrowRight')), v.handleKey(bare('ArrowRight')), v.handleKey(bare('Enter'))],
    ref: (v) => [v.handleKey(key('ArrowRight')), v.handleKey(key('ArrowRight')), v.handleKey(key('Enter'))],
  },
];

/** 유한한 수가 아닌 허용 거리(수로 읽히는 글도 — 선분 고르기가 `+`로 이어 글이 된다) */
const NOT_FINITE: readonly unknown[] = ['foo', NaN, {}, '8', Infinity, -Infinity];
const CTOR: readonly Case[] = [
  ...NOT_FINITE.map(
    (x): Case => ({ name: `생성자 pickTolerance ${show(x)} = 주지 않음(6)`, opts: [{ pickTolerance: X(x) }, {}], bad: (v) => picks(v, 'mouse'), ref: (v) => picks(v, 'mouse'), act: hover('mouse') }),
  ),
  ...NOT_FINITE.map(
    (x): Case => ({ name: `생성자 touchPickTolerance ${show(x)} = 주지 않음(14)`, opts: [{ touchPickTolerance: X(x) }, {}], bad: (v) => picks(v, 'touch'), ref: (v) => picks(v, 'touch'), act: hover('touch') }),
  ),
];

const KEPT: readonly Case[] = [
  { name: 'handleKey({}) = false(키 없음)', bad: (v) => v.handleKey(X({})), ref: () => false },
  { name: 'setMesh positions 수 = false(0.93.0도 positions 없음)', bad: (v) => v.setMesh(X({ id: 'a', positions: 5, color: [1, 1, 1, 1] })), ref: (v) => v.setMesh(X({ id: 'a', color: [1, 1, 1, 1] })), act: afterScene },
  {
    name: '목록의 수·글 항목 = 빼고 알림(0.93.0 그대로)',
    bad: (v) => v.setScene(sc({ meshes: [A(), 5, 'x'], lines: [] })),
    ref: (v) => v.setScene(sc({ meshes: [A(), 5, 5], lines: [] })),
    act: afterScene,
  },
];

describe('장면 계약 밖 값: setScene·setMesh', () => {
  for (const c of SCENE) it(c.name, () => same(c));
  it('Uint32Array가 아닌 indices는 placement · indices로 알린다(setScene·setMesh)', () => {
    for (const i of NOT_U32) {
      const w = view();
      const got: unknown[] = [];
      w.v.onSceneIssues((l) => got.push(l));
      w.v.setScene(sc({ meshes: [A(), { id: 's', positions: P9, indices: i, color: [1, 1, 1, 1] }], lines: [] }));
      const one = { code: 'placement', action: 'skipped', kind: 'mesh', id: 's', field: 'indices', count: 1 };
      expect([show(i), w.v.sceneIssues]).toEqual([show(i), [one]]);
      expect(w.v.setMesh(X({ id: 's', positions: P9, indices: i, color: [1, 1, 1, 1] }))).toBe(false);
      expect(got).toEqual([[one], [one]]);
    }
  });
});
describe('키 사건 자리', () => {
  for (const c of KEYS) it(c.name, () => same(c));
});
describe('생성자 고르기 허용 거리', () => {
  for (const c of CTOR) it(c.name, () => same(c));
});
describe('0.93.0과 같은 값으로 두는 것', () => {
  for (const c of KEPT) it(c.name, () => same(c));
});

describe('생성자 무늬 한도·예산', () => {
  /** 무늬 그림을 다 풀 때까지 그리고, 풀 때 받은 긴 변(그림 꼬리표마다)·무늬 통계를 돌려준다 */
  async function load(opts: Viewer3dOptions): Promise<unknown> {
    const seen: string[] = [];
    const g = globalThis as Record<string, unknown>;
    const saved = g.createImageBitmap;
    g.createImageBitmap = async (src: unknown, o?: ImageBitmapOptions) => {
      const tag = src instanceof Blob ? new TextDecoder().decode(new Uint8Array(await src.arrayBuffer())) : '?';
      seen.push(`${tag}:${o?.resizeWidth ?? '-'}`);
      return { width: o?.resizeWidth ?? 64, height: o?.resizeHeight ?? 64, close() {} };
    };
    try {
      const tex = (id: string, side: number): Texture3d => ({ id, data: new TextEncoder().encode(id), mime: 'image/png', width: side, height: side });
      const ts: Texture3d[] = [tex('big', 8192)];
      for (let i = 0; i < 12; i++) ts.push(tex(`t${i}`, 2048));
      const plate = (t: Texture3d, i: number): Mesh3d => ({
        id: `m${i}`,
        positions: Float32Array.of(i * 6, 0, 0, i * 6 + 5, 0, 0, i * 6 + 5, 5, 0),
        uvs: Float32Array.of(0, 0, 1, 0, 1, 1),
        texture: t.id,
        color: [1, 1, 1, 1],
      });
      const host = dom.host();
      host.rect = { left: 0, top: 0, width: 400, height: 300 };
      const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false, renderMode: 'shaded', ...opts });
      views.push(v);
      v.setScene({ name: 't', units: 'mm', meshes: ts.map(plate), lines: [], textures: ts });
      const end = Date.now() + 10_000;
      for (;;) {
        v.renderNow();
        const s = v.stats.textures;
        if (s.ready + s.failed >= s.count) break;
        if (Date.now() > end) throw new Error('무늬를 다 풀지 못했습니다');
        await new Promise((r) => setTimeout(r, 1));
      }
      return { sides: seen.sort(), stats: v.stats.textures };
    } finally {
      g.createImageBitmap = saved;
    }
  }
  // 무늬 풀기는 시계를 쓴다 — 이 묶음만 실제 시계로
  beforeAll(() => vi.restoreAllMocks());
  afterAll(() => void vi.spyOn(performance, 'now').mockImplementation(() => clock));

  it('textureLimit·textureBudget이 수로 읽히지 않으면(글·NaN·{}) 주지 않은 것(2048·256 MB)', async () => {
    const base = await load({});
    for (const x of ['foo', NaN, {}]) {
      expect([show(x), await load({ textureLimit: X(x) })]).toEqual([show(x), base]);
      expect([show(x), await load({ textureBudget: X(x) })]).toEqual([show(x), base]);
    }
  });
  it('그대로: textureLimit Infinity(GPU 한도)·수로 읽히는 글, textureBudget 0(끔)', async () => {
    expect(await load({ textureLimit: Infinity })).toEqual(await load({ textureLimit: 4096 }));
    expect(await load({ textureLimit: X('1024') })).toEqual(await load({ textureLimit: 1024 }));
    expect(await load({ textureBudget: 0 })).toEqual(await load({ textureBudget: -1 }));
  });
});

describe('순수 함수', () => {
  const box = { min: [0, 0, 0], max: [10, 10, 10] };
  const JUNK: readonly unknown[] = [null, undefined, {}, 'foo', 5];
  it('gridSpec 상자가 아닌 값 = 빈 범위(원점 둘레), 이름이 아닌 높이 = 주지 않음(min)', () => {
    for (const b of JUNK) expect([show(b), gridSpec(X(b))]).toEqual([show(b), gridSpec(emptyBox())]);
    for (const z of [null, {}, 'foo', true, '3']) expect([show(z), gridSpec(X(box), X(z))]).toEqual([show(z), gridSpec(X(box))]);
  });
  it('gridLines 객체가 아닌 값 = 격자 없음(0.93.0 {}와 같다)', () => {
    for (const g of [null, undefined, 'foo', 5]) expect([show(g), gridLines(X(g))]).toEqual([show(g), gridLines(X({}))]);
  });
  it('sceneBounds 장면 계약 밖 값 = 범위에 넣지 않음', () => {
    for (const s of JUNK) expect([show(s), sceneBounds(X(s))]).toEqual([show(s), emptyBox()]);
    expect(sceneBounds(sc({ meshes: 5, lines: null }))).toEqual(emptyBox());
    expect(sceneBounds(sc({ meshes: new Set([A(), null, { id: 's', positions: 'abc' }]), lines: [null, LINE(), { id: 'l', positions: [0, 0, 99, 1, 1, 99] }], points: 7 }))).toEqual(
      sceneBounds(sc({ meshes: [A()], lines: [LINE()] })),
    );
  });
  it('checkScene 객체가 아닌 장면 = 빈 장면, 목록은 배열로', () => {
    for (const s of JUNK.slice(0, 2).concat(['foo', 5])) expect([show(s), checkScene(X(s))]).toEqual([show(s), { scene: { name: '', units: 'unknown', meshes: [], lines: [] }, issues: [] }]);
    const r = checkScene(sc({ meshes: new Set([A()]), lines: 5, points: [PTS()], textures: 'x' }));
    expect([r.scene.meshes.map((m) => m.id), r.scene.lines, r.scene.points!.map((p) => p.id), r.scene.textures, r.issues]).toEqual([['a'], [], ['P'], [], []]);
  });
  it('imageInfo·walkKeyOf·keySnapAction null·undefined = null', () => {
    for (const x of [null, undefined]) expect([show(x), imageInfo(X(x)), walkKeyOf(X(x)), keySnapAction(X(x))]).toEqual([show(x), null, null, null]);
  });
  it('pickTolerance 유한한 수가 아닌 허용 거리 = 기본(6·14)', () => {
    for (const t of ['mouse', 'touch', null])
      for (const x of NOT_FINITE.concat([null, undefined]))
        expect([t, show(x), pickTolerance(t, X(x), X(x))]).toEqual([t, show(x), pickTolerance(t, PICK_TOLERANCE_PX, TOUCH_PICK_TOLERANCE_PX)]);
    expect([pickTolerance('touch', 3, 4), pickTolerance('mouse', 0, 0)]).toEqual([
      { tol: 4, snap: 10 },
      { tol: 0, snap: 10 },
    ]);
  });
});
