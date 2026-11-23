/**
 * 0.87.0 단면 API의 NaN·무한대 값(87차 — 0.85.0 남은 한계 「단면·측정·고르기 미리 강조 등은 따로 훑지 않았다」):
 * 0.86.0 단면 API는 NaN·±Infinity 법선·offset·위치를 이미 받지 않았다(앞 단면 그대로, setSections는 그 평면만 빼고 남는 것이 없으면 끔).
 * 빈틈은 유한한 값이 셈에서 넘치는 길 하나다 — 아주 짧은 법선(1e-200·비정규 5e-324)으로 offset을 나누면 위치가 ±Infinity가 되어
 * 그대로 받았다(u_clip·u_clips·u_mvpc 무한, section.position·offset·t ±Infinity). 0.87.0은 planeFrom이 그런 평면을 null로 돌려 NaN과 같은 길로 받지 않는다.
 * 경우마다 깨진 값을 준 뷰어와 같아야 할 부름(부르지 않음·멀쩡한 평면만·null)의 뷰어가 단면 상태·그리기 기록(가짜 WebGL2 — 프로그램·속성·균일 변수 값)에서 같고
 * 균일 변수가 모두 유한하다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { guardGl } from './glguard';
import type { RenderMode } from '../src/renderer';
import { planeFrom } from '../src/section';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { type SectionPlane, Viewer3d } from '../src/viewer';

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

/** 상자 둘 + 원점 있는 상자 + 행렬 있는 상자(로컬 평면 길) + 원점 있는 선분 묶음 */
const scene = (): Scene3d => {
  const c = boxMesh('c', [0, 0, 0], [4, 4, 4], [0.5, 0.8, 0.5, 1]);
  c.origin = [40, 0, 0];
  const d = boxMesh('d', [0, 0, 0], [5, 5, 5], [0.8, 0.5, 0.8, 1]);
  d.matrix = Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 20, 0, 1);
  return {
    name: 's',
    units: 'mm',
    meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [16, 2, 0], [26, 8, 6], [0.8, 0.6, 0.5, 1]), c, d],
    lines: [{ id: 'L', positions: Float32Array.of(0, 0, 12, 10, 0, 12, 10, 0, 12, 10, 10, 12), color: [1, 0, 0, 1], origin: [0, 0, 1] }],
  };
};

interface W {
  v: Viewer3d;
  gl: FakeGL;
  bad: string[];
}
/** 유한하지 않은 균일 변수는 bad에 — tests/glguard.ts */
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

const Z = (v: Viewer3d): void => v.setSectionAxis('z', 0.5);
const GOOD: SectionPlane = { normal: [0, 0, 1], offset: 5 };
/** 상자 단면 여섯 평면 */
const BOX: SectionPlane[] = [
  { normal: [1, 0, 0], offset: 30 },
  { normal: [-1, 0, 0], offset: 1 },
  { normal: [0, 1, 0], offset: 22 },
  { normal: [0, -1, 0], offset: 1 },
  { normal: [0, 0, 1], offset: 8 },
  { normal: [0, 0, -1], offset: 1 },
];

interface Case {
  name: string;
  /** 그리기 모드(없으면 음영+윤곽) */
  mode?: RenderMode;
  /** 두 뷰어에 먼저 거는 멀쩡한 값(건 뒤 한 번 그린다) */
  prep?: (v: Viewer3d) => void;
  /** 깨진 값(돌려준 값도 견준다) */
  bad: (v: Viewer3d) => unknown;
  /** 같아야 할 부름(부르지 않음·멀쩡한 평면만·null) */
  ref: (v: Viewer3d) => unknown;
}
const none = (): void => {};

/** 0.86.0은 넘친 위치를 받았다(유한하지 않은 균일 변수 — 새 시험이 0.86.0 src에서 재현) */
const OVERFLOW: readonly Case[] = [
  { name: 'setSection 짧은 법선 [1e-200, 0, 0]·offset 1e200 = 부르지 않음', bad: (v) => v.setSection({ normal: [1e-200, 0, 0], offset: 1e200 }), ref: none },
  { name: '앞 단면이 있으면 그대로(음의 넘침 −1e200)', prep: Z, bad: (v) => v.setSection({ normal: [1e-200, 0, 0], offset: -1e200 }), ref: none },
  { name: '음영에서도(u_clip·u_mvpc)', mode: 'shaded', prep: Z, bad: (v) => v.setSection({ normal: [0, 0, 1e-200], offset: 1e200 }, { caps: 'all' }), ref: none },
  { name: '비정규 법선 [5e-324, 0, 0]·offset 1 = 부르지 않음', mode: 'hiddenLine', bad: (v) => v.setSection({ normal: [5e-324, 0, 0], offset: 1 }), ref: none },
  { name: '비스듬한 짧은 법선', bad: (v) => v.setSection({ normal: [1e-200, 2e-200, 1e-200], offset: 1e200 }), ref: none },
  {
    name: 'setSections 멀쩡한 평면 + 넘친 평면 = 멀쩡한 평면만',
    bad: (v) => v.setSections([GOOD, { normal: [0, 1e-200, 0], offset: 1e200, items: ['a'] }]),
    ref: (v) => v.setSections([GOOD]),
  },
  { name: 'setSections 넘친 평면뿐 = 끔(앞 단면도 — 0.86.0 NaN 평면뿐과 같다)', prep: Z, bad: (v) => v.setSections([{ normal: [0, 0, 1e-300], offset: 1e100 }]), ref: (v) => v.setSection(null) },
  {
    name: '상자 단면 여섯 가운데 하나가 넘침 = 다섯',
    bad: (v) => v.setSections([...BOX.slice(0, 3), { normal: [0, -1e-250, 0], offset: 1e100 }, ...BOX.slice(4)]),
    ref: (v) => v.setSections([...BOX.slice(0, 3), ...BOX.slice(4)]),
  },
];

/** 0.86.0도 받지 않던 NaN·±Infinity(앞 단면 그대로·그 평면만 뺌·옮기지 않음) — 그대로 둔다 */
const KEPT: readonly Case[] = [
  { name: 'setSection 법선 NaN·Infinity·수 둘 = 앞 단면 그대로', prep: Z, bad: (v) => (v.setSection({ normal: [NaN, 0, 1], offset: 2 }), v.setSection({ normal: [Infinity, 0, 0], offset: 2 }), v.setSection({ normal: [0, 1], offset: 2 })), ref: none },
  { name: 'setSection offset NaN·±Infinity = 앞 단면 그대로', prep: Z, bad: (v) => (v.setSection(GOOD), v.setSection({ normal: [0, 0, 1], offset: Infinity }), v.setSection({ normal: [1, 0, 0], offset: NaN })), ref: (v) => v.setSection(GOOD) },
  { name: 'setSections NaN 평면뿐 = 끔', prep: Z, bad: (v) => v.setSections([{ normal: [NaN, 0, 1], offset: 1 }, { normal: [0, 0, 1], offset: NaN }]), ref: (v) => v.setSection(null) },
  { name: 'setSections NaN 평면은 뺀다', bad: (v) => v.setSections([{ normal: [0, 0, 1], offset: -Infinity }, GOOD]), ref: (v) => v.setSections([GOOD]) },
  { name: 'setSectionAxis NaN·world ±Infinity = 앞 단면 그대로', prep: Z, bad: (v) => (v.setSectionAxis('z', NaN), v.setSectionAxis('x', Infinity, { world: true }), v.setSectionAxis('y', -Infinity)), ref: none },
  { name: 'setSectionPosition NaN·world −Infinity·index NaN = 그대로', prep: Z, bad: (v) => (v.setSectionPosition(NaN), v.setSectionPosition(-Infinity, { world: true }), v.setSectionPosition(0.2, { index: NaN })), ref: none },
  { name: 'moveSectionByPixels NaN·Infinity = 옮기지 않음(같은 t)', prep: Z, bad: (v) => [v.moveSectionByPixels(NaN, 0), v.moveSectionByPixels(Infinity, 3)], ref: (v) => [v.moveSectionByPixels(0, 0), v.moveSectionByPixels(0, 0)] },
  { name: '구간 단면 start NaN·−Infinity = 그 구간을 버림(빈 목록 평면)', bad: (v) => v.setSections([{ ...GOOD, items: [{ id: 'a', start: NaN, count: 3 }, { id: 'b', start: -Infinity, count: 4 }] }]), ref: (v) => v.setSections([{ ...GOOD, items: [] }]) },
  { name: 'sectionRange NaN = {0, 0}·sectionHandle(NaN) = null', prep: Z, bad: (v) => [v.sectionRange([NaN, 0, 0]), v.sectionHandle(NaN)], ref: () => [{ min: 0, max: 0 }, null] },
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
  expect({ bad: uniq(A.bad), ret: ra, sections: A.v.sections, draws: fa.length }).toEqual({ bad: [], ret: rb, sections: B.v.sections, draws: fb.length });
  expect(B.bad).toEqual([]);
  expect(fa).toEqual(fb);
}

describe('planeFrom: 법선 길이로 나눈 offset이 넘치면 null', () => {
  it('짧은·비정규 법선의 넘침은 null, 유한하면 그대로', () => {
    expect(planeFrom([1e-200, 0, 0], 1e200)).toBeNull();
    expect(planeFrom([0, 0, 5e-324], 1)).toBeNull();
    expect(planeFrom([1e-200, 1e-200, 0], -1e200)).toBeNull();
    // 유한하면 큰 위치도 받는다(크기 한도 없음 — 0.86.0과 같은 값)
    expect(planeFrom([1e-200, 0, 0], 1e100)!.offset).toBe(1e100 / 1e-200);
    expect(planeFrom([0, 2e-9, 0], 1e-8)!.normal).toEqual([0, 1, 0]);
    expect(planeFrom([0, 0, 5e-324], 0)!.plane).toEqual([0, 0, 1, -0]);
  });
});

describe('단면: 유한한 값이 넘친 위치는 NaN처럼 받지 않는다', () => {
  for (const c of OVERFLOW) it(c.name, () => same(c));
});

describe('0.86.0과 같은 값으로 두는 것', () => {
  for (const c of KEPT) it(c.name, () => same(c));
  it('짧지만 넘치지 않는 법선은 단위 법선과 같은 평면 — 큰 위치(1e30)도 균일 변수가 유한하다', () => {
    // 위치는 offset ÷ 법선 길이(같은 나눗셈 — 끝 자리까지 같은 값)
    same({ name: '', bad: (v) => v.setSection({ normal: [0, 2e-9, 0], offset: 1e-8 }), ref: (v) => v.setSection({ normal: [0, 1, 0], offset: 1e-8 / 2e-9 }) });
    same({ name: '', mode: 'shaded', bad: (v) => v.setSection({ normal: [1e-10, 0, 0], offset: 1e20 }), ref: (v) => v.setSection({ normal: [1, 0, 0], offset: 1e20 / 1e-10 }) });
    same({ name: '', bad: (v) => v.setSections([{ normal: [0, 0, -1e-6], offset: -2e-6 }, GOOD]), ref: (v) => v.setSections([{ normal: [0, 0, -1], offset: -2e-6 / 1e-6 }, GOOD]) });
  });
});
