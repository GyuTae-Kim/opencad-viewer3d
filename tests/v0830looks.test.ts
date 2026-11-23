/**
 * 0.83.0 겉모습·그리기 선택 API의 유한하지 않은 값(83차): 0.82.0은 0.50.0 setItemColor 규칙(유한하지 않은 값이 든 색 배열은 null — 되돌림)을 setItemColor에만 두어
 * setItemLooks의 color(문서로는 setItemColor를 하나씩 부른 것과 같다)·edgeColor·profileColor, setItemEdgeColor·setItemProfileColor, setRenderOptions의 profiles.width·
 * profiles.color·edgeColor·hiddenEdges.color가 NaN·무한대를 그대로 두었다 — 그 묶음·선의 균일 변수(u_color·u_pcol·u_r)가 NaN(검게 칠하거나 사라짐).
 * setItemOpacity(id, NaN)은 0(보이지 않음)이었고, hiddenEdges NaN은 renderOptions에 NaN을 남겼다(그리지 않음).
 * - 같은 규칙으로 맞춘다: 값이 NaN이거나 범위로 자른 뒤에도 유한하지 않으면 그 자리에 null을 준 것과 같다(겉모습은 되돌림, 외곽선 굵기·숨은 점선 불투명도는 주지 않은 것)
 * - 경우마다 깨진 값을 준 뷰어와 null(주지 않음)을 준 뷰어가 겉모습·보여 주기 선택·그리기 기록(가짜 WebGL2 — 균일 변수 값까지)에서 같고, 균일 변수가 모두 유한하다
 * - 유한한 값(범위 밖 불투명도·굵기·숨은 점선 불투명도를 자르는 것, 범위 밖 색 성분 포함)은 0.82.0과 같은 값으로 둔다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { guardGl } from './glguard';
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

const scene = (): Scene3d => ({
  name: 'l',
  units: 'mm',
  meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [16, 2, 0], [26, 8, 6], [0.8, 0.6, 0.5, 1])],
  lines: [],
});

interface W {
  v: Viewer3d;
  gl: FakeGL;
  bad: string[];
}
/** 외곽선을 켠 상자 둘(유한하지 않은 균일 변수는 bad에 — tests/glguard.ts) */
function view(mode: RenderMode): W {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 400, height: 300 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false, renderMode: mode });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const bad: string[] = [];
  guardGl(gl, (x) => bad.push(x));
  v.setScene(scene());
  void v.setView('seIso', false);
  v.setRenderOptions({ profiles: true });
  return { v, gl, bad };
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
/** 겉으로 보이는 겉모습·보여 주기 선택 */
const shown = (v: Viewer3d): unknown => ({ a: v.itemLook('a'), b: v.itemLook('b'), opts: v.renderOptions });

const RED: Rgba = [1, 0, 0, 1];
const BLUE: Rgba = [0, 0, 1, 1];
const NAN: Rgba = [NaN, 1, 1, 1];
const three = (r: number, g: number, b: number): Rgba => [r, g, b] as unknown as Rgba;

interface Case {
  name: string;
  /** 그리기 모드(없으면 음영+윤곽) */
  mode?: RenderMode;
  /** 두 뷰어에 먼저 거는 멀쩡한 값(건 뒤 한 번 그린다) */
  prep: (v: Viewer3d) => void;
  /** 깨진 값 */
  bad: (v: Viewer3d) => void;
  /** 같아야 할 부름(null·주지 않음) */
  ref: (v: Viewer3d) => void;
}

const LOOKS: readonly Case[] = [
  { name: 'setItemColor 색 NaN — 0.50.0 그대로 null과 같다', prep: (v) => v.setItemColor('a', RED), bad: (v) => v.setItemColor('a', NAN), ref: (v) => v.setItemColor('a', null) },
  {
    name: 'setItemLooks color NaN = setItemColor(id, 같은 색)(문서 — 하나씩 부른 것과 같다)',
    prep: (v) => v.setItemColor('a', RED),
    bad: (v) => v.setItemLooks([['a', { color: NAN }]]),
    ref: (v) => v.setItemColor('a', NAN),
  },
  { name: 'setItemLooks color 알파 Infinity = color null', prep: (v) => v.setItemColor('a', RED), bad: (v) => v.setItemLooks([['a', { color: [1, 1, 1, Infinity] }]]), ref: (v) => v.setItemLooks([['a', { color: null }]]) },
  { name: 'setItemLooks color 셋에 −Infinity = color null', prep: (v) => v.setItemColor('a', RED), bad: (v) => v.setItemLooks([['a', { color: three(0, -Infinity, 0) }]]), ref: (v) => v.setItemLooks([['a', { color: null }]]) },
  {
    name: 'setItemLooks edgeColor NaN = setItemEdgeColor(id, null)',
    prep: (v) => v.setItemEdgeColor('a', RED),
    bad: (v) => v.setItemLooks([['a', { edgeColor: [NaN, 0, 0, 1] }]]),
    ref: (v) => v.setItemEdgeColor('a', null),
  },
  {
    name: 'setItemLooks profileColor NaN = setItemProfileColor(id, null)',
    prep: (v) => v.setItemProfileColor('a', RED),
    bad: (v) => v.setItemLooks([['a', { profileColor: [0, NaN, 0, 1] }]]),
    ref: (v) => v.setItemProfileColor('a', null),
  },
  { name: 'setItemEdgeColor NaN = null', prep: (v) => v.setItemEdgeColor('a', RED), bad: (v) => v.setItemEdgeColor('a', [NaN, 0, 0, 1]), ref: (v) => v.setItemEdgeColor('a', null) },
  { name: 'setItemEdgeColor 셋에 Infinity = null(와이어프레임)', mode: 'wireframe', prep: (v) => v.setItemEdgeColor('a', RED), bad: (v) => v.setItemEdgeColor('a', three(Infinity, 0, 0)), ref: (v) => v.setItemEdgeColor('a', null) },
  { name: 'setItemProfileColor NaN = null', prep: (v) => v.setItemProfileColor('a', RED), bad: (v) => v.setItemProfileColor('a', [NaN, 0, 0, 1]), ref: (v) => v.setItemProfileColor('a', null) },
  { name: 'setItemProfileColor 알파 NaN = null', prep: (v) => v.setItemProfileColor('a', RED), bad: (v) => v.setItemProfileColor('a', [0, 0, 0, NaN]), ref: (v) => v.setItemProfileColor('a', null) },
  { name: 'setItemOpacity NaN = null(pickable도 되돌림)', prep: (v) => v.setItemOpacity('a', 0.4, { pickable: false }), bad: (v) => v.setItemOpacity('a', NaN), ref: (v) => v.setItemOpacity('a', null) },
  { name: 'setItemOpacity(NaN, { pickable: false }) = null', prep: (v) => v.setItemOpacity('a', 0.4), bad: (v) => v.setItemOpacity('a', NaN, { pickable: false }), ref: (v) => v.setItemOpacity('a', null) },
  {
    name: 'setItemLooks opacity NaN = setItemOpacity(id, null)',
    prep: (v) => v.setItemOpacity('a', 0.4, { pickable: false }),
    bad: (v) => v.setItemLooks([['a', { opacity: NaN }]]),
    ref: (v) => v.setItemOpacity('a', null),
  },
  {
    name: 'setItemLooks 한 항목에 깨진 값 넷 = 그 필드 모두 null',
    prep: (v) => v.setItemLooks([['a', { opacity: 0.5, color: RED, edgeColor: BLUE, profileColor: BLUE }]]),
    bad: (v) => v.setItemLooks([['a', { opacity: NaN, pickable: false, color: NAN, edgeColor: [0, 0, Infinity, 1], profileColor: [NaN, NaN, NaN, NaN] }]]),
    ref: (v) => v.setItemLooks([['a', { opacity: null, color: null, edgeColor: null, profileColor: null }]]),
  },
];

const OPTIONS: readonly Case[] = [
  { name: 'profiles.width NaN = 굵기를 주지 않음(2)', prep: (v) => v.setRenderOptions({ profiles: { width: 3 } }), bad: (v) => v.setRenderOptions({ profiles: { width: NaN } }), ref: (v) => v.setRenderOptions({ profiles: {} }) },
  { name: 'profiles.width Infinity = 굵기를 주지 않음(2)', prep: (v) => v.setRenderOptions({ profiles: { width: 3 } }), bad: (v) => v.setRenderOptions({ profiles: { width: Infinity } }), ref: (v) => v.setRenderOptions({ profiles: {} }) },
  { name: 'profiles.color NaN = 색을 주지 않음', prep: (v) => v.setRenderOptions({ profiles: { color: RED } }), bad: (v) => v.setRenderOptions({ profiles: { color: NAN } }), ref: (v) => v.setRenderOptions({ profiles: {} }) },
  {
    name: 'profiles.color NaN — 그물마다 외곽선 색이 있는 길(PCOL)',
    prep: (v) => {
      v.setItemProfileColor('b', BLUE);
      v.setRenderOptions({ profiles: { width: 3, color: RED } });
    },
    bad: (v) => v.setRenderOptions({ profiles: { width: 3, color: [0, NaN, 0, 1] } }),
    ref: (v) => v.setRenderOptions({ profiles: { width: 3 } }),
  },
  { name: 'edgeColor NaN = null', prep: (v) => v.setRenderOptions({ edgeColor: RED }), bad: (v) => v.setRenderOptions({ edgeColor: [NaN, 0, 0, 1] }), ref: (v) => v.setRenderOptions({ edgeColor: null }) },
  { name: 'edgeColor 알파 Infinity = null(와이어프레임)', mode: 'wireframe', prep: (v) => v.setRenderOptions({ edgeColor: RED }), bad: (v) => v.setRenderOptions({ edgeColor: [0, 0, 0, Infinity] }), ref: (v) => v.setRenderOptions({ edgeColor: null }) },
  { name: 'hiddenEdges NaN = null(끔)', mode: 'hiddenLine', prep: (v) => v.setRenderOptions({ hiddenEdges: 0.5 }), bad: (v) => v.setRenderOptions({ hiddenEdges: NaN }), ref: (v) => v.setRenderOptions({ hiddenEdges: null }) },
  {
    name: 'hiddenEdges.opacity NaN = 불투명도를 주지 않음(0.35)',
    prep: (v) => v.setRenderOptions({ hiddenEdges: { opacity: 0.5, shaded: true } }),
    bad: (v) => v.setRenderOptions({ hiddenEdges: { opacity: NaN, shaded: true } }),
    ref: (v) => v.setRenderOptions({ hiddenEdges: { shaded: true } }),
  },
  {
    name: 'hiddenEdges.color NaN = null',
    mode: 'hiddenLine',
    prep: (v) => v.setRenderOptions({ hiddenEdges: { color: RED } }),
    bad: (v) => v.setRenderOptions({ hiddenEdges: { color: NAN } }),
    ref: (v) => v.setRenderOptions({ hiddenEdges: { color: null } }),
  },
];

function same(c: Case): void {
  const mode = c.mode ?? 'shadedEdges';
  const A = view(mode);
  const B = view(mode);
  for (const w of [A, B]) {
    c.prep(w.v);
    w.v.renderNow();
  }
  c.bad(A.v);
  c.ref(B.v);
  const fa = frame(A);
  const fb = frame(B);
  expect({ bad: uniq(A.bad), shown: shown(A.v), draws: fa.length }).toEqual({ bad: [], shown: shown(B.v), draws: fb.length });
  expect(B.bad).toEqual([]);
  expect(fa).toEqual(fb);
}

describe('겉모습: 유한하지 않은 값은 null과 같다(0.50.0 setItemColor 규칙)', () => {
  for (const c of LOOKS) it(c.name, () => same(c));
});

describe('그리기 선택(setRenderOptions): 유한하지 않은 값은 그 필드를 주지 않은(null) 것과 같다', () => {
  for (const c of OPTIONS) it(c.name, () => same(c));
});

describe('유한한 값', () => {
  it('0.82.0과 같은 값으로 둔다 — 범위 밖 불투명도·굵기·숨은 점선 불투명도는 자르고, 범위 밖 색 성분은 그대로', () => {
    const { v, bad } = view('shadedEdges');
    v.setItemOpacity('a', Infinity);
    expect(v.itemLook('a')).toEqual({ pickable: true, opacity: 1 });
    v.setItemOpacity('a', -Infinity, { pickable: false });
    expect(v.itemLook('a')).toEqual({ pickable: false, opacity: 0 });
    v.setItemOpacity('a', 0.25);
    expect(v.itemLook('a')).toEqual({ pickable: false, opacity: 0.25 });
    v.setItemLooks([['b', { opacity: 2, color: three(0.2, 0.4, 0.6), edgeColor: '#ff0000', profileColor: [0, 0, 1, 0.5] }]]);
    expect(v.itemLook('b')).toEqual({ pickable: true, opacity: 1, color: [0.2, 0.4, 0.6, 1], edgeColor: [1, 0, 0, 1], profileColor: [0, 0, 1, 0.5] });
    v.setItemEdgeColor('a', three(2, -1, 0.5));
    v.setItemProfileColor('a', [0, 0, 0, 0]);
    expect(v.itemLook('a')).toEqual({ pickable: false, opacity: 0.25, edgeColor: [2, -1, 0.5, 1], profileColor: [0, 0, 0, 0] });
    v.setRenderOptions({ profiles: { width: -Infinity, color: 'contrast' }, edgeColor: [0.1, 0.2, 0.3, 1], hiddenEdges: { opacity: Infinity, shaded: true, color: '#00ff00' } });
    expect(v.renderOptions).toMatchObject({ profiles: { width: 1, color: 'contrast' }, edgeColor: [0.1, 0.2, 0.3, 1], hiddenEdges: 1, hiddenEdgesShaded: true, hiddenEdgeColor: '#00ff00' });
    v.renderNow();
    v.setRenderOptions({ profiles: { width: 0.5 }, hiddenEdges: -Infinity, edgeColor: 'contrast' });
    expect(v.renderOptions).toMatchObject({ profiles: { width: 1, color: null }, edgeColor: 'contrast', hiddenEdges: 0, hiddenEdgesShaded: false, hiddenEdgeColor: null });
    v.renderNow();
    v.setRenderOptions({ profiles: { width: 3.5, color: [2, 0, 0, 1] }, hiddenEdges: 0.4 });
    expect(v.renderOptions).toMatchObject({ profiles: { width: 3.5, color: [2, 0, 0, 1] }, hiddenEdges: 0.4 });
    v.renderNow();
    expect(bad).toEqual([]);
  });
});
