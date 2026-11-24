/**
 * 0.108.0 축선 모양(110차 — 0.101.0 좌표축 틀의 남은 한계: Z축선과 −쪽 점선이 없고, 축선은 격자와 함께만 보인다).
 * SketchUp 화면은 빨강·초록·파랑 축을 원점 양의 쪽 실선, 음의 쪽 점선으로 그리고 격자가 없다. 이제 앱이 setAxesStyle로 켤 때만:
 *  - negativeDashed: 격자 축선의 원점 −쪽을 점선으로(+쪽은 가는 실선 그대로). 점선은 기존 점선 길(drawLines dashed — 숨은 점선과 같은 굵은 선 프로그램 WIDE_VS·u_dash)
 *  - z: 파랑 Z축선(축 색 axisZ) — 원점을 지나 틀의 X × Y(틀이 없으면 세계 Z), 원점 높이 ± 격자 한 변으로 자른다(세운 틀 축선과 같은 규칙)
 *  - withoutGrid: 격자를 숨긴 동안에도 축선만 그린다
 *  - 원점 = setAxesFrame 틀의 원점, 없으면 격자 높이의 세계 원점(세계 X·Y축선이 만나는 점)
 *  - 끄거나(null·모두 false) 쓸 수 없는 모양이면 0.107.0과 같다(격자를 다시 만들지 않는다 — GL 그리기 기록까지). 쓸 수 없는 모양은 false(앞 모양 그대로)
 *  - 축선은 보이는 범위만 넓힌다(밖인 끝점) — 고르기·측정은 그대로
 * 장면: 상자 L [0,0,0]–[100,100,20] — 격자 x·y −20~120, 높이 0, 한 변 H = 140
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, LiveDraw } from './fakegl';
import { axesStyleLines, axesStyleOf, gridLines, gridSpec } from '../src/grid';
import { WIDE_VS } from '../src/shaders';
import { boxMesh } from '../src/synth';
import { LIGHT_THEME } from '../src/theme';
import type { Box3, Mesh3d, Rgba, Scene3d } from '../src/types';
import { type MeasureResult, Viewer3d } from '../src/viewer';

type P3 = [number, number, number];
const BOX: Box3 = { min: [0, 0, 0], max: [100, 100, 20] };
const L = boxMesh('L', BOX.min, BOX.max, [0.6, 0.65, 0.7, 1]);
const scene = (meshes: Mesh3d[] = [L]): Scene3d => ({ name: 'axes-style', units: 'mm', meshes, lines: [] });
const T30 = Math.tan(Math.PI / 6), C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
/** 옮기고 Z 둘레로 30° 돌린 그리기 축(상자 윗면 높이) — 0.101.0 시험과 같은 틀 */
const F1 = { origin: [30, 40, 20], x: [C30, S30, 0], y: [-S30, C30, 0] };
/** F1 축선 끝점(세계 — 앞 끝이 −쪽): 격자 x·y −20~120으로 자름, 원점 높이 20 */
const F1X = [-20, 40 - 50 * T30, 20, 120, 40 + 90 * T30, 20];
const F1Y = [30 + 60 * T30, -20, 20, 30 - 80 * T30, 120, 20];
const ON = { negativeDashed: true, z: true } as const;
/** 받지 않는 모양(순수 gridLines는 주지 않은 것, setAxesStyle은 false — 앞 모양 그대로) */
const BAD: unknown[] = [
  'foo',
  5,
  true,
  false,
  0,
  [],
  [true],
  () => true,
  { z: 1 },
  { z: 'true' },
  { negativeDashed: null },
  { withoutGrid: 0 },
  { z: {} },
  { negativeDashed: true, z: [] },
  { negativeDashed: Number.NaN },
];
const show = (x: unknown): string => (typeof x === 'string' ? JSON.stringify(x) : (JSON.stringify(x, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)) ?? String(x)));

const near = (a: ArrayLike<number>, b: readonly number[], d = 3): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < b.length; i++) expect([i, a[i]]).toEqual([i, expect.closeTo(b[i]!, d)]);
};

describe('순수 axesStyleOf·gridLines(g, origin, frame, style)', () => {
  const g = gridSpec(BOX, 'min');
  it('axesStyleOf: 세 칸을 채운 모양, 모두 꺼졌으면 null, 쓸 수 없으면 undefined(모르는 열쇠는 읽지 않는다)', () => {
    expect([g.x0, g.x1, g.y0, g.y1, g.z]).toEqual([-20, 120, -20, 120, 0]);
    expect(axesStyleOf({ z: true, foo: 1 })).toEqual({ negativeDashed: false, z: true, withoutGrid: false });
    expect(axesStyleOf({ negativeDashed: true, z: undefined, withoutGrid: true })).toEqual({ negativeDashed: true, z: false, withoutGrid: true });
    for (const s of [null, undefined, {}, { negativeDashed: false, z: false, withoutGrid: false }, { foo: true }]) expect([show(s), axesStyleOf(s)]).toEqual([show(s), null]);
    for (const b of BAD) expect([show(b), axesStyleOf(b)]).toEqual([show(b), undefined]);
  });

  it('모양이 없거나(null·undefined·{}·모두 false) 쓸 수 없거나 withoutGrid뿐이면 0.107.0 그대로(틀이 있어도)', () => {
    const a = gridLines(g), b = gridLines(g, null, F1);
    for (const s of [null, undefined, {}, { negativeDashed: false, z: false, withoutGrid: false }, { withoutGrid: true }, ...BAD]) {
      expect([show(s), gridLines(g, null, null, s as never)]).toEqual([show(s), a]);
      expect([show(s), gridLines(g, null, F1, s as never)]).toEqual([show(s), b]);
    }
  });

  it('negativeDashed(틀 없음): 축선은 격자 높이 세계 원점에서 +쪽만, −쪽은 axisDash(원점 쪽 끝부터) — 격자 선은 그대로', () => {
    const a = gridLines(g), l = gridLines(g, null, null, { negativeDashed: true });
    expect(l.major).toEqual(a.major);
    expect(l.minor).toEqual(a.minor);
    near(l.axisX, [0, 0, 0, 120, 0, 0]);
    near(l.axisY, [0, 0, 0, 0, 120, 0]);
    near(l.axisDash!.x, [0, 0, 0, -20, 0, 0]);
    near(l.axisDash!.y, [0, 0, 0, 0, -20, 0]);
    expect(l.axisDash!.z.length).toBe(0);
    expect(l.axisZ).toBe(undefined);
  });

  it('z(틀 없음): Z축선은 격자 높이 원점에서 ± 격자 한 변 — negativeDashed 없으면 통째로 실선이고 X·Y는 0.107.0 그대로', () => {
    const a = gridLines(g), l = gridLines(g, null, null, { z: true });
    expect([l.major, l.minor, l.axisX, l.axisY]).toEqual([a.major, a.minor, a.axisX, a.axisY]);
    near(l.axisZ!, [0, 0, -140, 0, 0, 140]);
    expect(l.axisDash).toBe(undefined);
    const d = gridLines(g, null, null, ON);
    near(d.axisZ!, [0, 0, 0, 0, 0, 140]);
    near(d.axisDash!.z, [0, 0, 0, 0, 0, -140]);
    const low = gridLines(gridSpec(BOX, -50), null, null, ON);
    near(low.axisZ!, [0, 0, -50, 0, 0, 90]);
    near(low.axisDash!.z, [0, 0, -50, 0, 0, -190]);
  });

  it('틀: 틀 원점에서 나누고 Z = X × Y(원점 높이 ± 격자 한 변), 기울인 틀의 Z도 X × Y', () => {
    const b = gridLines(g, null, F1), l = gridLines(g, null, F1, ON);
    expect([l.major, l.minor]).toEqual([b.major, b.minor]);
    near(l.axisX, [30, 40, 20, ...F1X.slice(3)]);
    near(l.axisDash!.x, [30, 40, 20, ...F1X.slice(0, 3)]);
    near(l.axisY, [30, 40, 20, ...F1Y.slice(3)]);
    near(l.axisDash!.y, [30, 40, 20, ...F1Y.slice(0, 3)]);
    near(l.axisZ!, [30, 40, 20, 30, 40, 160]);
    near(l.axisDash!.z, [30, 40, 20, 30, 40, -120]);
    // x = Z, y = X 이면 Z = X × Y = 세계 +Y(격자 사각형으로 자름)
    const t = gridLines(g, null, { origin: [30, 40, 20], x: [0, 0, 1], y: [1, 0, 0] }, ON);
    near(t.axisZ!, [30, 40, 20, 30, 120, 20]);
    near(t.axisDash!.z, [30, 40, 20, 30, -20, 20]);
    const w = axesStyleLines(g, null, true);
    near(w.x.line, [...gridLines(g).axisX], 12);
    near(w.y.line, [...gridLines(g).axisY], 12);
  });

  it('원점이 격자 밖이면 지나는 부분이 한쪽으로만(−쪽이면 원점 쪽 끝부터), 지나지 않으면 없음', () => {
    const p = gridLines(g, null, { origin: [500, 50, 0], x: [1, 0, 0], y: [0, 1, 0] }, ON);
    expect(p.axisX.length).toBe(0);
    near(p.axisDash!.x, [120, 50, 0, -20, 50, 0]);
    expect([p.axisY.length, p.axisDash!.y.length, p.axisZ!.length, p.axisDash!.z.length]).toEqual([0, 0, 0, 0]);
    const m = gridLines(g, null, { origin: [-500, 50, 0], x: [1, 0, 0], y: [0, 1, 0] }, { negativeDashed: true });
    near(m.axisX, [-20, 50, 0, 120, 50, 0]);
    expect(m.axisDash!.x.length).toBe(0);
  });

  it('원점 기준 좌표(큰 좌표): gridLines(g, o, frame, style) + o = gridLines(g, null, frame, style)', () => {
    const o = [50, 50, 0];
    for (const f of [null, F1]) {
      const a = gridLines(g, null, f, ON), b = gridLines(g, o, f, ON);
      for (const [x, y] of [
        [a.axisX, b.axisX],
        [a.axisY, b.axisY],
        [a.axisZ!, b.axisZ!],
        [a.axisDash!.x, b.axisDash!.x],
        [a.axisDash!.y, b.axisDash!.y],
        [a.axisDash!.z, b.axisDash!.z],
      ]) {
        expect(y.length).toBe(x.length);
        for (let i = 0; i < x.length; i++) expect(y[i]! + o[i % 3]!).toBeCloseTo(x[i]!, 3);
      }
    }
  });
});

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  for (const v of views) v.dispose();
  vi.useRealTimers();
  dom.restore();
});

function make(meshes?: Mesh3d[]): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(scene(meshes));
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [50, 50, 10], distance: 400 });
  v.renderNow();
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 그림 한 장의 GL 그리기 기록(프로그램·속성 버퍼 내용·균일 변수 값) */
function draws(v: Viewer3d): DrawEntry[] {
  const gl = cv(v).gl!;
  gl.draws = [];
  gl.logDraws = true;
  v.renderNow();
  gl.logDraws = false;
  return gl.draws;
}
type Inner = { colors: { grid: Rgba; gridMinor: Rgba; axisX: Rgba; axisY: Rgba }; theme: { axisZ: string }; rgba(s: string): Rgba };
const inner = (v: Viewer3d): Inner => v as unknown as Inner;
const viewFrame = (v: Viewer3d): { viewProj: ArrayLike<number> } => (v as unknown as { frame(): { viewProj: ArrayLike<number> } }).frame();
const clipOf = (m: ArrayLike<number>, x: number, y: number, z: number): number[] => [0, 1, 2, 3].map((r) => m[r]! * x + m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!);
const inClip = (c: number[]): boolean => Math.abs(c[0]!) <= c[3]! && Math.abs(c[1]!) <= c[3]! && Math.abs(c[2]!) <= c[3]!;

interface AxisDraw {
  /** 세계 끝점(격자 모형 이동을 더한다) */
  p: number[];
  clip: number[][];
  vs: string;
  dash: unknown[] | undefined;
  width: unknown[] | undefined;
  depthMask: boolean;
  blend: boolean;
}
/** 그 그림의 축선 그리기: 가는 실선(drawArrays 정점 둘)과 점선(굵은 선 인스턴스)을 축 색(X·Y·Z)으로 가른다. grid = 격자 큰 칸·작은 칸 색 그리기 수 */
function axisDraws(v: Viewer3d): { solid: Record<'x' | 'y' | 'z', AxisDraw[]>; dashed: Record<'x' | 'y' | 'z', AxisDraw[]>; grid: number } {
  const gl = cv(v).gl!;
  const c = inner(v).colors;
  const z = inner(v).rgba(inner(v).theme.axisZ);
  const same = (u: unknown[] | undefined, col: Rgba): boolean => !!u && u.length === 4 && u.every((x, i) => x === col[i]);
  const model = (v as unknown as { renderer: { grid: { model?: ArrayLike<number> } | null } }).renderer.grid?.model;
  const t = model ? [model[12]!, model[13]!, model[14]!] : [0, 0, 0];
  const out = { solid: { x: [] as AxisDraw[], y: [] as AxisDraw[], z: [] as AxisDraw[] }, dashed: { x: [] as AxisDraw[], y: [] as AxisDraw[], z: [] as AxisDraw[] }, grid: 0 };
  const read = (a: { buf: { bytes: Uint8Array } | null; offset: number } | undefined, n: number): number[] => [...new Float32Array(a!.buf!.bytes.slice(a!.offset, a!.offset + n * 4).buffer)];
  gl.onDraw = (d: LiveDraw) => {
    if (!d.prog) return;
    const u = d.prog.uniforms.get('u_color');
    if (d.op === 'drawArrays' && (same(u, c.grid) || same(u, c.gridMinor))) out.grid++;
    const which = same(u, c.axisX) ? 'x' : same(u, c.axisY) ? 'y' : same(u, z) ? 'z' : null;
    if (!which) return;
    let p: number[];
    if (d.op === 'drawArrays' && d.args[2] === 2) p = read(d.attribs.get(0) as never, 6);
    else if (d.op === 'drawArraysInstanced' && d.args[3] === 1) p = [...read(d.attribs.get(1) as never, 3), ...read(d.attribs.get(2) as never, 3)];
    else return;
    const mvp = d.prog.uniforms.get('u_mvp')![0] as number[];
    const e: AxisDraw = {
      p: p.map((x, i) => x + t[i % 3]!),
      clip: [clipOf(mvp, p[0]!, p[1]!, p[2]!), clipOf(mvp, p[3]!, p[4]!, p[5]!)],
      vs: d.prog.vs,
      dash: d.prog.uniforms.get('u_dash'),
      width: d.prog.uniforms.get('u_width'),
      depthMask: d.depthMask,
      blend: d.caps.includes('BLEND'),
    };
    (d.op === 'drawArrays' ? out.solid : out.dashed)[which].push(e);
  };
  v.renderNow();
  gl.onDraw = null;
  return out;
}
const counts = (r: ReturnType<typeof axisDraws>): number[] => [r.solid.x.length, r.solid.y.length, r.solid.z.length, r.dashed.x.length, r.dashed.y.length, r.dashed.z.length];

describe('Viewer3d.setAxesStyle', () => {
  it('negativeDashed·z: +쪽은 가는 실선(축 색), −쪽은 기존 점선 길(WIDE_VS·u_dash 7·5), Z축선은 axisZ 색 — 새 셰이더·변종을 번역하지 않는다', () => {
    const v = make();
    expect(v.axesStyle).toBe(null);
    expect(counts(axisDraws(v))).toEqual([1, 1, 0, 0, 0, 0]);
    const gl = cv(v).gl!;
    const src = vi.spyOn(gl, 'shaderSource');
    expect(v.setAxesStyle(ON)).toBe(true);
    expect(v.axesStyle).toEqual({ negativeDashed: true, z: true, withoutGrid: false });
    const d = axisDraws(v);
    expect(counts(d)).toEqual([1, 1, 1, 1, 1, 1]);
    near(d.solid.x[0]!.p, [0, 0, 0, 120, 0, 0]);
    near(d.solid.y[0]!.p, [0, 0, 0, 0, 120, 0]);
    near(d.solid.z[0]!.p, [0, 0, 0, 0, 0, 140]);
    near(d.dashed.x[0]!.p, [0, 0, 0, -20, 0, 0]);
    near(d.dashed.y[0]!.p, [0, 0, 0, 0, -20, 0]);
    near(d.dashed.z[0]!.p, [0, 0, 0, 0, 0, -140]);
    for (const e of [d.dashed.x[0]!, d.dashed.y[0]!, d.dashed.z[0]!]) {
      expect([e.vs === WIDE_VS, e.dash, e.width, e.depthMask, e.blend]).toEqual([true, [7, 5], [1], false, true]);
      for (const c of e.clip) expect(inClip(c)).toBe(true);
    }
    for (const e of [d.solid.x[0]!, d.solid.y[0]!, d.solid.z[0]!]) expect([e.vs === WIDE_VS, e.depthMask, e.blend]).toEqual([false, false, true]);
    expect(src).not.toHaveBeenCalled();
    src.mockRestore();
    // 돌려준 모양은 사본
    (v.axesStyle as { z: boolean }).z = false;
    expect(v.axesStyle!.z).toBe(true);
  });

  it('z만: X·Y축선은 0.107.0 그대로(통째로 실선), Z축선도 통째로 실선 — 점선 그리기 없음. negativeDashed만: Z축선 없음', () => {
    const v = make();
    v.setAxesStyle({ z: true });
    const d = axisDraws(v);
    expect(counts(d)).toEqual([1, 1, 1, 0, 0, 0]);
    near(d.solid.x[0]!.p, [-20, 0, 0, 120, 0, 0]);
    near(d.solid.y[0]!.p, [0, -20, 0, 0, 120, 0]);
    near(d.solid.z[0]!.p, [0, 0, -140, 0, 0, 140]);
    v.setAxesStyle({ negativeDashed: true });
    expect(counts(axisDraws(v))).toEqual([1, 1, 0, 1, 1, 0]);
  });

  it('틀과 함께: 틀 원점에서 나누고 Z = X × Y(원점 높이 ± 격자 한 변), 틀·격자 높이·장면을 바꿔도 모양은 남는다', () => {
    const v = make();
    v.setAxesFrame(F1);
    v.setAxesStyle(ON);
    const d = axisDraws(v);
    near(d.solid.x[0]!.p, [30, 40, 20, ...F1X.slice(3)]);
    near(d.dashed.x[0]!.p, [30, 40, 20, ...F1X.slice(0, 3)]);
    near(d.solid.y[0]!.p, [30, 40, 20, ...F1Y.slice(3)]);
    near(d.dashed.y[0]!.p, [30, 40, 20, ...F1Y.slice(0, 3)]);
    near(d.solid.z[0]!.p, [30, 40, 20, 30, 40, 160]);
    near(d.dashed.z[0]!.p, [30, 40, 20, 30, 40, -120]);
    v.setAxesFrame(null);
    v.setGridZ(-50);
    const z = axisDraws(v);
    near(z.solid.z[0]!.p, [0, 0, -50, 0, 0, 90]);
    near(z.dashed.z[0]!.p, [0, 0, -50, 0, 0, -190]);
    v.setScene(scene([boxMesh('L2', [0, 0, 0], [300, 300, 20], [0.6, 0.65, 0.7, 1])]));
    expect(v.axesStyle).toEqual({ negativeDashed: true, z: true, withoutGrid: false });
    const g2 = gridSpec({ min: [0, 0, 0], max: [300, 300, 20] }, -50);
    near(axisDraws(v).solid.x[0]!.p, [0, 0, -50, g2.x1, 0, -50]);
  });

  it('끄면 0.107.0과 같다: 모양이 없을 때 null·{}·모두 false는 격자를 다시 만들지 않고, 켰다 끄면 주지 않은 뷰어와 GL 그리기·카메라 틀·살아 있는 버퍼 수가 같다', () => {
    const A = make(), B = make();
    const spy = vi.spyOn(A as unknown as { rebuildGrid: () => void }, 'rebuildGrid');
    for (const s of [null, undefined, {}, { negativeDashed: false, z: false, withoutGrid: false }]) expect([show(s), A.setAxesStyle(s as never), A.axesStyle]).toEqual([show(s), true, null]);
    expect(spy).not.toHaveBeenCalled();
    expect(draws(A)).toEqual(draws(B));
    A.setAxesStyle({ negativeDashed: true, z: true, withoutGrid: true });
    A.renderNow();
    A.setAxesStyle({ z: true });
    A.renderNow();
    // 같은 모양을 다시 주면 다시 만들지 않는다
    const n = spy.mock.calls.length;
    expect(A.setAxesStyle({ z: true, withoutGrid: false })).toBe(true);
    expect(spy.mock.calls.length).toBe(n);
    expect(A.setAxesStyle(null)).toBe(true);
    expect(A.axesStyle).toBe(null);
    expect(draws(A)).toEqual(draws(B));
    expect(viewFrame(A)).toEqual(viewFrame(B));
    expect(cv(A).gl!.liveBuffers).toBe(cv(B).gl!.liveBuffers);
    A.setAxesFrame(F1);
    B.setAxesFrame(F1);
    A.setAxesStyle(ON);
    A.renderNow();
    A.setAxesStyle({});
    expect(draws(A)).toEqual(draws(B));
    spy.mockRestore();
  });

  it('쓸 수 없는 모양은 받지 않는다(false — 앞 모양·그림 그대로)', () => {
    const v = make();
    const ref = draws(v);
    for (const b of BAD) expect([show(b), v.setAxesStyle(b as never), v.axesStyle]).toEqual([show(b), false, null]);
    expect(draws(v)).toEqual(ref);
    v.setAxesStyle(ON);
    const s1 = v.axesStyle, ref1 = draws(v);
    for (const b of BAD) expect([show(b), v.setAxesStyle(b as never), v.axesStyle]).toEqual([show(b), false, s1]);
    expect(draws(v)).toEqual(ref1);
  });

  it('withoutGrid: 격자를 숨긴 동안 축선만 그리고(격자 선 없음), 격자를 보이면 0.107.0처럼 격자와 함께(GL 그리기 같음). 끄면 격자와 함께 사라진다(0.101.0)', () => {
    const A = make(), B = make();
    A.setGridVisible(false);
    let d = axisDraws(A);
    expect([...counts(d), d.grid]).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(A.setAxesStyle({ withoutGrid: true })).toBe(true);
    d = axisDraws(A);
    expect([...counts(d), d.grid]).toEqual([1, 1, 0, 0, 0, 0, 0]);
    near(d.solid.x[0]!.p, [-20, 0, 0, 120, 0, 0]);
    near(d.solid.y[0]!.p, [0, -20, 0, 0, 120, 0]);
    A.setAxesStyle({ ...ON, withoutGrid: true });
    d = axisDraws(A);
    expect([...counts(d), d.grid]).toEqual([1, 1, 1, 1, 1, 1, 0]);
    for (const e of [...d.solid.z, ...d.dashed.z, ...d.solid.x]) for (const c of e.clip) expect(inClip(c)).toBe(true);
    A.setGridVisible(true);
    d = axisDraws(A);
    expect([...counts(d), d.grid]).toEqual([1, 1, 1, 1, 1, 1, 2]);
    A.setAxesStyle({ withoutGrid: true });
    expect(draws(A)).toEqual(draws(B));
    expect(viewFrame(A)).toEqual(viewFrame(B));
    A.setAxesStyle(ON);
    A.setGridVisible(false);
    d = axisDraws(A);
    expect([...counts(d), d.grid]).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('보이는 범위: 격자 안인 축선만이면(틀 없는 negativeDashed) 카메라 틀이 비트까지 같고, Z축선 끝점은 넓힌 틀로 클립 공간 안(넓히지 않은 틀로는 밖)', () => {
    const A = make(), B = make();
    A.setAxesStyle({ negativeDashed: true, withoutGrid: true });
    expect(viewFrame(A)).toEqual(viewFrame(B));
    A.setAxesStyle(ON);
    const d = axisDraws(A);
    for (const e of [...d.solid.z, ...d.dashed.z]) for (const c of e.clip) expect(inClip(c)).toBe(true);
    const c = clipOf(viewFrame(B).viewProj, 0, 0, 140);
    expect(Math.abs(c[2]!)).toBeGreaterThan(c[3]!);
  });

  it('측정(미리 보기·찍은 값·알림)과 덧그림 2D(왼쪽 아래 축 표시·측정 축 다리)는 축선 모양과 상관없다(Z축선으로 틀이 넓어져도 찍은 값은 같다)', () => {
    const run = (style: object | null): unknown[] => {
      const v = make();
      if (style) expect(v.setAxesStyle(style as never)).toBe(true);
      v.setMeasureMode(true);
      v.setMeasureSnap({ edges: true, inference: { axes: true } });
      const got: MeasureResult[] = [];
      v.onMeasure((m) => void (m && got.push(m)));
      const log: unknown[] = [trace(v)];
      tap(v, [0, 0, 20]);
      for (const p of [[60, 1.5, 20], [40, 50, 20], [1.5, 70, 20], [-12, 0.8, 20], [100, 0, 20]] as P3[]) {
        hover(v, p);
        log.push(v.measureHoverSnap, trace(v));
      }
      tap(v, [100, 0, 20]);
      log.push(v.measurement(), v.measurePoints, got, trace(v));
      return log;
    };
    const a = run({ negativeDashed: true, withoutGrid: true }), b = run(null);
    expect(a).toEqual(b);
    expect((b[b.length - 4] as MeasureResult).distance).toBeCloseTo(100, 6);
    const z = run(ON);
    expect((z[z.length - 4] as MeasureResult).distance).toBeCloseTo(100, 9);
    const kinds = (l: unknown[]): unknown[] => [1, 3, 5, 7, 9].map((i) => (l[i] as { kind?: string } | null)?.kind ?? null);
    expect(kinds(z)).toEqual(kinds(b));
  });

  it('Z축선 색은 테마 axisZ를 따른다(밝은 테마로 바꾸면 그 색)', () => {
    const v = make();
    v.setAxesStyle({ z: true });
    v.setTheme('light');
    const d = axisDraws(v);
    expect(d.solid.z.length).toBe(1);
    expect(inner(v).rgba(inner(v).theme.axisZ)).toEqual(inner(v).rgba(LIGHT_THEME.axisZ));
  });

  it('묶음 원점(큰 좌표) 장면도 세계 자리(점선·Z축선 — 격자 가운데 기준 좌표 + 이동)', () => {
    const O: P3 = [1e6, 2e6, 0];
    const v = make([{ ...boxMesh('M', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]), origin: O }]);
    expect(v.setAxesFrame({ origin: [O[0] + 30, O[1] + 40, 20], x: F1.x, y: F1.y })).toBe(true);
    v.setAxesStyle(ON);
    const d = axisDraws(v);
    const at = (w: number[]): number[] => w.map((c, i) => c + O[i % 3]!);
    near(d.solid.x[0]!.p, at([30, 40, 20, ...F1X.slice(3)]), 2);
    near(d.dashed.x[0]!.p, at([30, 40, 20, ...F1X.slice(0, 3)]), 2);
    near(d.solid.z[0]!.p, at([30, 40, 20, 30, 40, 160]), 2);
    near(d.dashed.z[0]!.p, at([30, 40, 20, 30, 40, -120]), 2);
  });

  it('dispose 뒤에도 던지지 않는다', () => {
    const v = make();
    v.setAxesStyle(ON);
    v.dispose();
    expect(() => v.setAxesStyle(null)).not.toThrow();
    expect(() => v.setAxesStyle(ON)).not.toThrow();
  });
});

/** 덧그림 2D 호출 기록(왼쪽 아래 축 표시·측정 덧그림) */
function trace(v: Viewer3d): string[] {
  const o = v as unknown as { octx: CanvasRenderingContext2D };
  const real = o.octx as unknown as Record<string | symbol, unknown>;
  const log: string[] = [];
  o.octx = new Proxy(real, {
    get: (t, k) => {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]): unknown => {
        log.push(`${String(k)}(${a.join(',')})`);
        return (x as (...b: unknown[]) => unknown).apply(t, a);
      };
    },
    set: (t, k, val) => {
      log.push(`${String(k)}=${String(val)}`);
      t[k] = val;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  v.renderNow();
  o.octx = real as unknown as CanvasRenderingContext2D;
  return log;
}
const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  cv(v).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (v: Viewer3d, p: P3): { x: number; y: number } => {
  const s = v.project(p)!;
  return { x: s.x + 0.37, y: s.y - 0.21 };
};
const hover = (v: Viewer3d, p: P3): void => {
  const s = at(v, p);
  ptr(v, 'pointermove', s.x, s.y, 0);
  v.renderNow();
};
const tap = (v: Viewer3d, p: P3): void => {
  const s = at(v, p);
  ptr(v, 'pointerdown', s.x, s.y, 1);
  ptr(v, 'pointerup', s.x, s.y, 0);
  v.renderNow();
};
