/**
 * 0.101.0 좌표축 틀(103차 — SKP 앱 README의 열린 코어 요청: 3D 좌표축 표시는 코어가 세계 원점에 그려 옮긴 그리기 축(모형·장면)의 자리·방향을 보이지 못함,
 * 코어에 축 틀을 주는 길이 없음). 0.100.0의 장면 안 축선은 격자의 X·Y축선 둘뿐이고 늘 세계 원점을 지나는 세계 X·Y 방향(격자 높이 면 위, 격자 사각형 안)이었다.
 * 이제 setAxesFrame({ origin, x, y })로 앱이 그리기 축을 주면 격자 X·Y축선을 그 원점을 지나 그 방향으로 그린다:
 *  - 축선 = 원점 o를 지나는 단위 방향 d의 직선을 격자 사각 기둥(x0~x1·y0~y1)과 원점 높이 ± 격자 한 변(o.z ± H)으로 자른 선분(원점 높이에 그린다 — 격자 면에 내리지 않는다)
 *  - 틀이 있으면 세계 원점 축선이 없으므로 x = 0·y = 0 격자선도 큰 칸 선으로 그린다. 축선 끝점이 보이는 범위 밖이면 그만큼 가까운·먼 면을 넓힌다(안이면 그대로)
 *  - y는 x에 직교로 맞춘다(그람-슈미트). 객체가 아님·유한한 수 셋이 아닌 원점·방향(원점은 좌표 한도 1e15 안)·길이 0·x와 나란한 y는 받지 않는다
 *    (false — 앞 틀 그대로, setMeasureInferenceLock 꼴)
 *  - null = 세계 원점·세계 축(0.100.0 그림). 주지 않으면 0.100.0과 GL 그리기까지 같다
 *  - 왼쪽 아래 축 표시·측정(추론 축·찍은 값·축 다리 점선)은 세계 축 그대로
 * 장면: 상자 L [0,0,0]–[100,100,20] — 격자 x·y −20~120, 높이 0, 한 변 H = 140
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, LiveDraw } from './fakegl';
import { gridLines, gridSpec } from '../src/grid';
import { boxMesh } from '../src/synth';
import type { Box3, Mesh3d, Rgba, Scene3d } from '../src/types';
import { type MeasureResult, Viewer3d } from '../src/viewer';

type P3 = [number, number, number];
const BOX: Box3 = { min: [0, 0, 0], max: [100, 100, 20] };
const L = boxMesh('L', BOX.min, BOX.max, [0.6, 0.65, 0.7, 1]);
const scene = (meshes: Mesh3d[] = [L]): Scene3d => ({ name: 'axes', units: 'mm', meshes, lines: [] });
const T30 = Math.tan(Math.PI / 6), C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
/** 옮기고 Z 둘레로 30° 돌린 그리기 축(상자 윗면 높이) */
const F1 = { origin: [30, 40, 20], x: [C30, S30, 0], y: [-S30, C30, 0] };
/** F1 축선 끝점(세계 — 격자 x·y −20~120으로 자름, 원점 높이 20) */
const F1X = [-20, 40 - 50 * T30, 20, 120, 40 + 90 * T30, 20];
const F1Y = [30 + 60 * T30, -20, 20, 30 - 80 * T30, 120, 20];
/** 받지 않는 틀(순수 gridLines는 주지 않은 것, setAxesFrame은 false — 앞 틀 그대로) */
const BAD: unknown[] = [
  'foo',
  5,
  true,
  [],
  {},
  [1, 2, 3],
  { origin: [0, 0, 0], x: [1, 0, 0] },
  { x: [1, 0, 0], y: [0, 1, 0] },
  { origin: [NaN, 0, 0], x: [1, 0, 0], y: [0, 1, 0] },
  { origin: [0, Infinity, 0], x: [1, 0, 0], y: [0, 1, 0] },
  { origin: [0, 0, 2e15], x: [1, 0, 0], y: [0, 1, 0] },
  { origin: [0, 0], x: [1, 0, 0], y: [0, 1, 0] },
  { origin: '000', x: [1, 0, 0], y: [0, 1, 0] },
  { origin: ['0', '0', '0'], x: [1, 0, 0], y: [0, 1, 0] },
  { origin: [0, 0, 0], x: [0, 0, 0], y: [0, 1, 0] },
  { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 0] },
  { origin: [0, 0, 0], x: [1, 0, 0], y: [2, 0, 0] },
  { origin: [0, 0, 0], x: [1, 0, 0], y: [-3, 1e-9, 0] },
  { origin: [0, 0, 0], x: [1.5e308, 1.5e308, 0], y: [0, 1, 0] },
  { origin: [0, 0, 0], x: [1, NaN, 0], y: [0, 1, 0] },
  { origin: [0, 0, 0], x: [1, 0, 0], y: 'abc' },
];
const show = (x: unknown): string => (typeof x === 'string' ? JSON.stringify(x) : JSON.stringify(x, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)) ?? String(x));

const near = (a: ArrayLike<number>, b: readonly number[], d = 3): void => {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < b.length; i++) expect([i, a[i]]).toEqual([i, expect.closeTo(b[i]!, d)]);
};

describe('순수 gridLines(g, origin, frame)', () => {
  const g = gridSpec(BOX, 'min');
  it('장면 격자(숫자 확인)', () => {
    expect([g.x0, g.x1, g.y0, g.y1, g.z, g.step, g.minorStep]).toEqual([-20, 120, -20, 120, 0, 10, 2]);
  });
  it('틀이 없거나(null·undefined) 쓸 수 없으면 0.100.0 그대로', () => {
    const a = gridLines(g);
    expect(gridLines(g, null, null)).toEqual(a);
    expect(gridLines(g, null, undefined)).toEqual(a);
    for (const b of BAD) expect([show(b), gridLines(g, null, b as never)]).toEqual([show(b), a]);
  });
  it('옮기고 돌린 틀: 축선이 원점을 지나 그 방향으로(격자 사각형으로 자름, 원점 높이), x = 0·y = 0 격자선을 그린다', () => {
    const a = gridLines(g), l = gridLines(g, null, F1);
    near(l.axisX, F1X);
    near(l.axisY, F1Y);
    expect(l.minor).toEqual(a.minor);
    expect(l.major.length).toBe(a.major.length + 12);
    const segs: string[] = [];
    for (let i = 0; i < l.major.length; i += 6) segs.push([...l.major.slice(i, i + 6)].join(','));
    expect(segs).toContain('0,-20,0,0,120,0');
    expect(segs).toContain('-20,0,0,120,0,0');
  });
  it('세계 틀을 격자 높이에 주면 축선은 0.100.0과 같은 선분(0.100.0의 −0은 0)', () => {
    const a = gridLines(g), l = gridLines(g, null, { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] });
    near(l.axisX, [...a.axisX], 12);
    near(l.axisY, [...a.axisY], 12);
  });
  it('형식 배열·방향 길이·남는 값, 직교하지 않는 y는 x에 직교로(그람-슈미트)', () => {
    const l = gridLines(g, null, { origin: Float64Array.of(30, 40, 20), x: [2 * C30, 2 * S30, 0, 9], y: [-S30 + 3 * C30, C30 + 3 * S30, 0], z: [0, 0, -1] } as never);
    near(l.axisX, F1X);
    near(l.axisY, F1Y);
  });
  it('기울인 틀: 세운 축선은 원점 높이 ± 격자 한 변으로 자른다', () => {
    const l = gridLines(g, null, { origin: [30, 40, 20], x: [0, 0, 1], y: [1, 0, 0] });
    near(l.axisX, [30, 40, 20 - 140, 30, 40, 20 + 140]);
    near(l.axisY, [-20, 40, 20, 120, 40, 20]);
  });
  it('원점이 격자 밖이면 격자를 지나는 부분만, 지나지 않으면 없음(0.100.0 세계 축선과 같은 규칙)', () => {
    const l = gridLines(g, null, { origin: [500, 50, 0], x: [1, 0, 0], y: [0, 1, 0] });
    near(l.axisX, [-20, 50, 0, 120, 50, 0]);
    expect(l.axisY.length).toBe(0);
  });
  it('원점 기준 좌표(큰 좌표): gridLines(g, o, frame) + o = gridLines(g, null, frame)', () => {
    const o = [50, 50, 0];
    const a = gridLines(g, null, F1), b = gridLines(g, o, F1);
    for (const k of ['major', 'minor', 'axisX', 'axisY'] as const) {
      expect(b[k].length).toBe(a[k].length);
      for (let i = 0; i < a[k].length; i++) expect(b[k][i]! + o[i % 3]!).toBeCloseTo(a[k][i]!, 3);
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
const colorsOf = (v: Viewer3d): { axisX: Rgba; axisY: Rgba } => (v as unknown as { colors: { axisX: Rgba; axisY: Rgba } }).colors;
const viewFrame = (v: Viewer3d): { viewProj: ArrayLike<number> } => (v as unknown as { frame(): { viewProj: ArrayLike<number> } }).frame();
const clipOf = (m: ArrayLike<number>, x: number, y: number, z: number): number[] => [0, 1, 2, 3].map((r) => m[r]! * x + m[4 + r]! * y + m[8 + r]! * z + m[12 + r]!);

/** 그 그림의 격자 축선 그리기(축 색·정점 둘): 정점(세계 — 격자 모형 이동을 더한다)과 끝점의 클립 좌표 */
function axisDraws(v: Viewer3d): { x: number[][]; y: number[][]; clip: number[][] } {
  const gl = cv(v).gl!;
  const c = colorsOf(v);
  const same = (u: unknown[] | undefined, col: Rgba): boolean => !!u && u.length === 4 && u.every((x, i) => x === col[i]);
  const model = (v as unknown as { renderer: { grid: { model?: ArrayLike<number> } | null } }).renderer.grid?.model;
  const t = model ? [model[12]!, model[13]!, model[14]!] : [0, 0, 0];
  const out = { x: [] as number[][], y: [] as number[][], clip: [] as number[][] };
  gl.onDraw = (d: LiveDraw) => {
    if (d.op !== 'drawArrays' || d.args[2] !== 2 || !d.prog) return;
    const u = d.prog.uniforms.get('u_color');
    const which = same(u, c.axisX) ? 'x' : same(u, c.axisY) ? 'y' : null;
    if (!which) return;
    const a = d.attribs.get(0)!;
    const p = new Float32Array(a.buf!.bytes.slice(a.offset, a.offset + 24).buffer);
    out[which].push([...p].map((x, i) => x + t[i % 3]!));
    const mvp = d.prog.uniforms.get('u_mvp')![0] as number[];
    out.clip.push(clipOf(mvp, p[0]!, p[1]!, p[2]!), clipOf(mvp, p[3]!, p[4]!, p[5]!));
  };
  v.renderNow();
  gl.onDraw = null;
  return out;
}
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

describe('Viewer3d.setAxesFrame', () => {
  it('주면 격자 X·Y축선을 그 원점을 지나 그 방향으로(축 색) 그리고, 돌려주는 틀은 단위 방향', () => {
    const v = make();
    expect(v.axesFrame).toBe(null);
    const w = axisDraws(v);
    expect([w.x.length, w.y.length]).toEqual([1, 1]);
    near(w.x[0]!, [-20, 0, 0, 120, 0, 0]);
    near(w.y[0]!, [0, -20, 0, 0, 120, 0]);
    expect(v.setAxesFrame(F1)).toBe(true);
    const f = v.axesFrame!;
    near(f.origin, [30, 40, 20], 12);
    near(f.x, F1.x, 12);
    near(f.y, F1.y, 12);
    const d = axisDraws(v);
    expect([d.x.length, d.y.length]).toEqual([1, 1]);
    near(d.x[0]!, F1X);
    near(d.y[0]!, F1Y);
  });

  it('null이면 세계 원점·세계 축으로 돌아가 주지 않은 뷰어와 GL 그리기가 같다(그 사이 틀을 몇 번 바꿔도)', () => {
    const A = make(), B = make();
    A.setAxesFrame(F1);
    A.renderNow();
    A.setAxesFrame({ origin: [0, 0, 0], x: [0, 1, 0], y: [-1, 0, 0] });
    A.renderNow();
    expect(A.setAxesFrame(null)).toBe(true);
    expect(A.axesFrame).toBe(null);
    expect(draws(A)).toEqual(draws(B));
  });

  it('틀이 없을 때 null은 아무것도 하지 않는다(격자를 다시 만들지 않는다 — 그림 그대로)', () => {
    const A = make(), B = make();
    const spy = vi.spyOn(A as unknown as { rebuildGrid: () => void }, 'rebuildGrid');
    expect(A.setAxesFrame(null)).toBe(true);
    expect(A.setAxesFrame(undefined as never)).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    expect(draws(A)).toEqual(draws(B));
  });

  it('쓸 수 없는 틀은 받지 않는다(false — 앞 틀·그림 그대로)', () => {
    const v = make();
    const ref = draws(v);
    for (const b of BAD) expect([show(b), v.setAxesFrame(b as never), v.axesFrame]).toEqual([show(b), false, null]);
    expect(draws(v)).toEqual(ref);
    v.setAxesFrame(F1);
    const f1 = v.axesFrame, ref1 = draws(v);
    for (const b of BAD) expect([show(b), v.setAxesFrame(b as never), v.axesFrame]).toEqual([show(b), false, f1]);
    expect(draws(v)).toEqual(ref1);
  });

  it('받는 꼴: 형식 배열·방향 길이·남는 값, 직교하지 않는 y는 x에 직교로 — 돌려주는 틀은 사본', () => {
    const v = make();
    expect(v.setAxesFrame({ origin: Float64Array.of(30, 40, 20), x: Float32Array.of(2 * C30, 2 * S30, 0), y: [-S30 + 3 * C30, C30 + 3 * S30, 0, 7], z: [0, 0, -1] } as never)).toBe(true);
    const f = v.axesFrame!;
    expect(Array.isArray(f.origin) && Array.isArray(f.x) && Array.isArray(f.y)).toBe(true);
    expect([f.origin.length, f.x.length, f.y.length]).toEqual([3, 3, 3]);
    near(f.x, F1.x, 6);
    near(f.y, F1.y, 6);
    const d = axisDraws(v);
    near(d.x[0]!, F1X);
    near(d.y[0]!, F1Y);
    (f.origin as number[])[0] = 999;
    expect(v.axesFrame!.origin[0]).toBe(30);
  });

  it('축선은 격자와 함께 보인다(setGridVisible), 격자 높이·장면을 바꿔도 틀은 남고 새 격자로 자른다(원점 높이 그대로)', () => {
    const v = make();
    v.setAxesFrame(F1);
    v.setGridVisible(false);
    const off = axisDraws(v);
    expect([off.x.length, off.y.length]).toEqual([0, 0]);
    v.setGridVisible(true);
    near(axisDraws(v).x[0]!, F1X);
    v.setGridZ(-50);
    const z = axisDraws(v);
    near(z.x[0]!, F1X);
    near(z.y[0]!, F1Y);
    const BOX2: Box3 = { min: [0, 0, 0], max: [300, 300, 20] };
    v.setScene(scene([boxMesh('L2', BOX2.min, BOX2.max, [0.6, 0.65, 0.7, 1])]));
    expect(v.axesFrame).toEqual({ origin: [30, 40, 20], x: v.axesFrame!.x, y: v.axesFrame!.y });
    const g2 = gridSpec(BOX2, -50);
    const want = gridLines(g2, null, F1);
    expect(g2.x1).toBeGreaterThan(120);
    const d = axisDraws(v);
    near(d.x[0]!, [...want.axisX]);
    near(d.y[0]!, [...want.axisY]);
    expect(d.x[0]![0]).toBeCloseTo(g2.x0, 3);
    expect(d.x[0]![2]).toBeCloseTo(20, 6);
  });

  it('축선 끝점이 보이는 범위 밖이면 가까운·먼 면을 넓힌다(안이면 카메라 틀이 비트까지 같다)', () => {
    const A = make(), B = make();
    A.setAxesFrame(F1);
    expect(viewFrame(A)).toEqual(viewFrame(B));
    const low = { origin: [50, 50, -300], x: [1, 0, 0], y: [0, 1, 0] };
    A.setAxesFrame(low);
    const d = axisDraws(A);
    near(d.x[0]!, [-20, 50, -300, 120, 50, -300]);
    expect(d.clip.length).toBe(4);
    for (const c of d.clip) expect(Math.abs(c[2]!)).toBeLessThanOrEqual(c[3]!);
    // 넓히지 않은 틀(틀이 없는 뷰어)로는 그 끝점이 먼 면 뒤다
    const c = clipOf(viewFrame(B).viewProj, -20, 50, -300);
    expect(c[2]!).toBeGreaterThan(c[3]!);
  });

  it('측정(미리 보기·찍은 값·알림)과 덧그림(왼쪽 아래 축 표시·측정 축 다리)은 틀과 상관없다', () => {
    const run = (frame: boolean): unknown[] => {
      const v = make();
      if (frame) expect(v.setAxesFrame(F1)).toBe(true);
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
    const a = run(true), b = run(false);
    expect(a).toEqual(b);
    expect((a[a.length - 4] as MeasureResult).distance).toBeCloseTo(100, 6);
  });

  it('묶음 원점(큰 좌표) 장면도 세계 자리에 그린다(격자 가운데 기준 좌표 + 이동)', () => {
    const O: P3 = [1e6, 2e6, 0];
    const v = make([{ ...boxMesh('M', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]), origin: O }]);
    expect(v.setAxesFrame({ origin: [O[0] + 30, O[1] + 40, 20], x: F1.x, y: F1.y })).toBe(true);
    const d = axisDraws(v);
    near(d.x[0]!, F1X.map((c, i) => c + O[i % 3]!), 2);
    near(d.y[0]!, F1Y.map((c, i) => c + O[i % 3]!), 2);
  });

  it('dispose 뒤에도 던지지 않는다', () => {
    const v = make();
    v.dispose();
    expect(() => v.setAxesFrame(F1)).not.toThrow();
    expect(() => v.setAxesFrame(null)).not.toThrow();
  });
});
