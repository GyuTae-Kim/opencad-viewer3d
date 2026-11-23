/**
 * 0.84.0 바탕·안개·조명 선택의 유한하지 않은 값(84차): 0.83.0은 setBackground·setFog·setLighting이 받은 색 배열·수를 그대로 두어
 * 바탕 지우기 색(clearColor)·숨은 선의 바탕색 면(u_color)·하늘·땅(u_sky·u_skyH·u_ground·u_groundH)·안개(u_fogCol)·해(u_sunDir·u_sunCol·u_amb·u_shadowBias)가 NaN이었다
 * (해 방향 NaN이면 모든 면이 검게). sun·direction이 없는 setLighting은 TypeError였다.
 * - 0.83.0 규칙으로 맞춘다: 색 배열에 유한하지 않은 값이 있으면(badRgba) 그 색을, 유한하지 않은 수(세기·주변광·그림자 크기·치우침)는 그 수를 주지 않은 것과 같다.
 *   해 방향이 유한한 수 셋이 아니면 setLighting(null)(끔)과 같다 — 안개의 start·end(0.7.0부터 끔)와 같은 꼴
 * - 경우마다 깨진 값을 준 뷰어와 그 필드를 주지 않은(또는 null) 뷰어가 선택 읽기·지우기 색·그리기 기록(가짜 WebGL2 — 균일 변수 값까지)에서 같고, 균일 변수가 모두 유한하다
 * - 유한한 값(범위 밖 색 성분·CSS 글·방향 0·음수 세기·뒤집힌 안개 깊이)은 0.83.0과 같은 값으로 둔다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { guardGl } from './glguard';
import type { RenderMode } from '../src/renderer';
import { boxMesh } from '../src/synth';
import type { Rgba, Scene3d } from '../src/types';
import { type LightingOptions, Viewer3d } from '../src/viewer';

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
  name: 's',
  units: 'mm',
  meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [16, 2, 0], [26, 8, 6], [0.8, 0.6, 0.5, 1])],
  lines: [],
});

interface W {
  v: Viewer3d;
  gl: FakeGL;
  bad: string[];
  /** 지우기 색(clearColor) 부름 */
  clears: number[][];
}
/** 외곽선을 켠 상자 둘(유한하지 않은 균일 변수·지우기 색은 bad에 — tests/glguard.ts) */
function view(mode: RenderMode): W {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 400, height: 300 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false, renderMode: mode });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const w: W = { v, gl, bad: [], clears: [] };
  guardGl(gl, (x) => w.bad.push(x));
  (gl as unknown as { clearColor: (...c: number[]) => void }).clearColor = (...c: number[]) => {
    if (c.some((x) => !Number.isFinite(x))) w.bad.push('clearColor: 유한하지 않음');
    w.clears.push(c);
  };
  v.setScene(scene());
  void v.setView('seIso', false);
  v.setRenderOptions({ profiles: true });
  return w;
}
/** 그리기 한 번의 기록(프로그램·속성·균일 변수 값)과 지우기 색 */
function frame(w: W): { draws: DrawEntry[]; clears: number[][] } {
  w.gl.draws = [];
  w.clears.length = 0;
  w.gl.logDraws = true;
  w.v.renderNow();
  w.gl.logDraws = false;
  return { draws: w.gl.draws, clears: [...w.clears] };
}
const uniq = (a: readonly string[]): string[] => [...new Set(a)];
/** 겉으로 보이는 선택 */
const shown = (v: Viewer3d): unknown => ({ bg: v.background, fog: v.fog, light: v.lighting });

const RED: Rgba = [1, 0, 0, 1];
const BLUE: Rgba = [0, 0, 1, 1];
const GREEN: Rgba = [0, 1, 0, 1];
const NAN: Rgba = [NaN, 1, 1, 1];
const three = (r: number, g: number, b: number): Rgba => [r, g, b] as unknown as Rgba;
const FOG = { start: 0, end: 200 };
const DIR = [-0.4, -0.6, 0.8];
/** 해 조명(sun 필드 sn, 나머지 rest) */
const sun = (sn: Partial<LightingOptions['sun']> = {}, rest: Partial<LightingOptions> = {}): LightingOptions => ({ sun: { direction: DIR, ...sn }, ...rest });

interface Case {
  name: string;
  /** 그리기 모드(없으면 음영+윤곽) */
  mode?: RenderMode;
  /** 두 뷰어에 먼저 거는 멀쩡한 값(건 뒤 한 번 그린다) */
  prep?: (v: Viewer3d) => void;
  /** 깨진 값 */
  bad: (v: Viewer3d) => void;
  /** 같아야 할 부름(그 필드를 주지 않음·null) */
  ref: (v: Viewer3d) => void;
}

const BACKGROUND: readonly Case[] = [
  { name: 'color NaN = color를 주지 않음(테마 바탕 — 앞서 건 색도 바뀐다)', prep: (v) => v.setBackground({ color: RED }), bad: (v) => v.setBackground({ color: NAN }), ref: (v) => v.setBackground({}) },
  { name: 'color NaN — 숨은 선의 바탕색 면', mode: 'hiddenLine', bad: (v) => v.setBackground({ color: NAN }), ref: (v) => v.setBackground({}) },
  { name: 'color 알파 Infinity', bad: (v) => v.setBackground({ color: [0, 0, 0, Infinity] }), ref: (v) => v.setBackground({}) },
  { name: 'color NaN — 안개 기본 색(바탕색)', prep: (v) => v.setFog(FOG), bad: (v) => v.setBackground({ color: NAN }), ref: (v) => v.setBackground({}) },
  {
    name: 'color NaN — 바탕 대비 윤곽선(와이어프레임)',
    mode: 'wireframe',
    prep: (v) => v.setRenderOptions({ edgeColor: 'contrast' }),
    bad: (v) => v.setBackground({ color: NAN }),
    ref: (v) => v.setBackground({}),
  },
  { name: 'sky NaN = sky를 주지 않음(ground만)', bad: (v) => v.setBackground({ sky: NAN, ground: GREEN }), ref: (v) => v.setBackground({ ground: GREEN }) },
  { name: 'sky NaN 혼자 = 기울기 바탕 없음', bad: (v) => v.setBackground({ sky: NAN }), ref: (v) => v.setBackground({}) },
  { name: 'skyHorizon NaN = 주지 않음(sky)', bad: (v) => v.setBackground({ sky: BLUE, skyHorizon: NAN }), ref: (v) => v.setBackground({ sky: BLUE }) },
  { name: 'ground 셋에 Infinity = 주지 않음', bad: (v) => v.setBackground({ sky: BLUE, ground: three(Infinity, 0, 0) }), ref: (v) => v.setBackground({ sky: BLUE }) },
  { name: 'groundHorizon NaN = 주지 않음(ground)', bad: (v) => v.setBackground({ ground: GREEN, groundHorizon: [0, 0, NaN, 1] }), ref: (v) => v.setBackground({ ground: GREEN }) },
  {
    name: '깨진 색 넷과 CSS 글 하나 = 그 글만',
    bad: (v) => v.setBackground({ color: '#334455', sky: NAN, skyHorizon: [0, 0, 0, NaN], ground: three(-Infinity, 0, 0), groundHorizon: NAN }),
    ref: (v) => v.setBackground({ color: '#334455' }),
  },
];

const FOGS: readonly Case[] = [
  { name: 'color NaN = 색을 주지 않음(바탕색)', bad: (v) => v.setFog({ ...FOG, color: NAN }), ref: (v) => v.setFog(FOG) },
  { name: 'color 셋에 −Infinity = 주지 않음', bad: (v) => v.setFog({ ...FOG, color: three(0, -Infinity, 0) }), ref: (v) => v.setFog(FOG) },
  { name: 'start NaN·end Infinity = null(0.7.0 그대로)', bad: (v) => v.setFog({ start: NaN, end: Infinity }), ref: (v) => v.setFog(null) },
];

const LIGHTS: readonly Case[] = [
  { name: '방향 NaN = null(끔)', mode: 'shaded', prep: (v) => v.setLighting(sun()), bad: (v) => v.setLighting(sun({ direction: [NaN, 0, 1] })), ref: (v) => v.setLighting(null) },
  { name: '방향 Infinity = null', mode: 'shaded', bad: (v) => v.setLighting(sun({ direction: [Infinity, 0, 1] })), ref: (v) => v.setLighting(null) },
  { name: '방향 수 둘 = null', mode: 'shaded', bad: (v) => v.setLighting(sun({ direction: [1, 0] })), ref: (v) => v.setLighting(null) },
  { name: '방향 NaN과 그림자 = null(깊이 그림도 없다)', mode: 'shaded', bad: (v) => v.setLighting(sun({ direction: [0, NaN, 1] }, { shadows: true })), ref: (v) => v.setLighting(null) },
  { name: 'sun 없음 = null(0.83.0은 TypeError)', mode: 'shaded', bad: (v) => v.setLighting({} as LightingOptions), ref: (v) => v.setLighting(null) },
  { name: 'direction 없음 = null(0.83.0은 TypeError)', mode: 'shaded', bad: (v) => v.setLighting({ sun: {} } as LightingOptions), ref: (v) => v.setLighting(null) },
  { name: '세기 NaN = 주지 않음(0.85)', mode: 'shaded', bad: (v) => v.setLighting(sun({ intensity: NaN })), ref: (v) => v.setLighting(sun()) },
  { name: '세기 Infinity = 주지 않음', mode: 'shaded', bad: (v) => v.setLighting(sun({ intensity: Infinity })), ref: (v) => v.setLighting(sun()) },
  { name: '세기 −Infinity = 주지 않음', mode: 'shaded', bad: (v) => v.setLighting(sun({ intensity: -Infinity })), ref: (v) => v.setLighting(sun()) },
  { name: '해 색 NaN = 주지 않음(흰색)', mode: 'shaded', bad: (v) => v.setLighting(sun({ color: NAN })), ref: (v) => v.setLighting(sun()) },
  { name: '주변광 NaN = 주지 않음(0.35)', mode: 'shaded', bad: (v) => v.setLighting(sun({}, { ambient: NaN })), ref: (v) => v.setLighting(sun()) },
  { name: '주변광 Infinity = 주지 않음', mode: 'shadedEdges', bad: (v) => v.setLighting(sun({}, { ambient: Infinity })), ref: (v) => v.setLighting(sun()) },
  { name: '그림자 치우침 NaN = 주지 않음(0.0015)', mode: 'shaded', bad: (v) => v.setLighting(sun({}, { shadows: { bias: NaN } })), ref: (v) => v.setLighting(sun({}, { shadows: {} })) },
  { name: '그림자 치우침 Infinity = 주지 않음', mode: 'shaded', bad: (v) => v.setLighting(sun({}, { shadows: { bias: Infinity } })), ref: (v) => v.setLighting(sun({}, { shadows: {} })) },
  {
    name: '그림자 크기 NaN = 주지 않음(2048 — 그림은 0.83.0도 같았다)',
    mode: 'shaded',
    bad: (v) => v.setLighting(sun({}, { shadows: { size: NaN, bias: 0.002 } })),
    ref: (v) => v.setLighting(sun({}, { shadows: { bias: 0.002 } })),
  },
  {
    name: '한 번에 깨진 값 다섯 = 그 필드 모두 주지 않음',
    mode: 'shaded',
    bad: (v) => v.setLighting(sun({ intensity: NaN, color: [1, 1, 1, -Infinity] }, { ambient: NaN, shadows: { size: Infinity, bias: NaN } })),
    ref: (v) => v.setLighting(sun({}, { shadows: {} })),
  },
];

function same(c: Case): void {
  const mode = c.mode ?? 'shadedEdges';
  const A = view(mode);
  const B = view(mode);
  for (const w of [A, B]) {
    c.prep?.(w.v);
    w.v.renderNow();
  }
  c.bad(A.v);
  c.ref(B.v);
  const fa = frame(A);
  const fb = frame(B);
  expect({ bad: uniq(A.bad), shown: shown(A.v), draws: fa.draws.length, clears: fa.clears }).toEqual({ bad: [], shown: shown(B.v), draws: fb.draws.length, clears: fb.clears });
  expect(B.bad).toEqual([]);
  expect(fa.draws).toEqual(fb.draws);
}

describe('setBackground: 깨진 색 배열은 그 색을 주지 않은 것과 같다', () => {
  for (const c of BACKGROUND) it(c.name, () => same(c));
});

describe('setFog: 깨진 색 배열은 그 색을 주지 않은 것과 같다', () => {
  for (const c of FOGS) it(c.name, () => same(c));
});

describe('setLighting: 해 방향이 유한한 수 셋이 아니면 null, 깨진 색·수는 그 필드를 주지 않은 것과 같다', () => {
  for (const c of LIGHTS) it(c.name, () => same(c));
});

describe('유한한 값', () => {
  it('0.83.0과 같은 값으로 둔다 — 범위 밖 색 성분·CSS 글·방향 0·큰 방향·음수 세기·뒤집힌 안개 깊이', () => {
    const w = view('shaded');
    const { v } = w;
    v.setBackground({ color: three(2, -1, 0.5), sky: '#102030', ground: [0, 0, 0, 0] });
    expect(v.background).toEqual({ color: [2, -1, 0.5], sky: '#102030', ground: [0, 0, 0, 0] });
    v.setFog({ color: 'not-a-color', start: 50, end: 10 });
    expect(v.fog).toEqual({ color: 'not-a-color', start: 50, end: 10 });
    v.setLighting({ sun: { direction: [0, 0, 0], intensity: -2, color: three(2, 2, 2) }, ambient: 5, shadows: { size: 300, bias: -1 } });
    expect(v.lighting).toEqual({ sun: { direction: [0, 0, 0], intensity: -2, color: [2, 2, 2] }, ambient: 5, shadows: { size: 300, bias: -1 } });
    v.renderNow();
    v.setLighting({ sun: { direction: [1e308, 1e308, 1e308], color: '#ffeedd' }, shadows: true });
    expect(v.lighting).toEqual({ sun: { direction: [1e308, 1e308, 1e308], color: '#ffeedd' }, shadows: true });
    v.setBackground({ sky: BLUE, skyHorizon: [0.5, 0.6, 0.7, 2], groundHorizon: '#445566' });
    v.renderNow();
    v.setRenderMode('hiddenLine');
    v.renderNow();
    expect(w.bad).toEqual([]);
  });
});
