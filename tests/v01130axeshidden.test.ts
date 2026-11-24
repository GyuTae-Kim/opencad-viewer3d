/**
 * 0.113.0 축선 끄기(115차 — 0.108.0 남은 한계 「격자를 숨긴 축선만 꼴에서 장면 안 축선도 끄려면 앱이 withoutGrid를 끈다」의 나머지,
 * 0.101.0 남은 한계 「축선은 격자와 함께만 보인다」의 남은 반쪽): 격자가 보이는 동안에는 장면 안 축선을 끌 길이 없었다.
 * SketchUp은 축을 숨기면 축선이 없다. 이제 앱이 setAxesStyle({ hidden: true })로 켤 때만:
 *  - 축선(X·Y와 켠 Z축선·−쪽 점선)을 하나도 그리지 않는다 — 격자가 보여도. 다른 칸보다 앞선다
 *  - 격자는 축선 자리 x = 0·y = 0 격자선을 큰 칸으로 낸다(틀이 있을 때와 같다)
 *  - 축선이 없으니 보이는 범위(가까운·먼 면)도 넓히지 않는다. 격자를 숨기면 아무것도 그리지 않는다(withoutGrid여도)
 *  - getter axesStyle은 hidden을 켰을 때만 칸이 있다(켜지 않은 모양은 0.112.0 값 그대로). hidden: false는 주지 않은 것
 *  - 참·거짓·undefined가 아닌 hidden은 쓸 수 없는 모양(false — 앞 모양 그대로)
 * 켜지 않으면 0.112.0과 같다(아래 「그대로」 시험 — 0.112.0 src로도 통과).
 * 장면: 상자 L [0,0,0]–[100,100,20] — 격자 x·y −20~120(큰 칸 10·작은 칸 2), 높이 0
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, LiveDraw } from './fakegl';
import { axesStyleOf, gridLines, gridSpec } from '../src/grid';
import { boxMesh } from '../src/synth';
import type { Box3, Rgba, Scene3d } from '../src/types';
import { type MeasureResult, Viewer3d } from '../src/viewer';

type P3 = [number, number, number];
const BOX: Box3 = { min: [0, 0, 0], max: [100, 100, 20] };
const L = boxMesh('L', BOX.min, BOX.max, [0.6, 0.65, 0.7, 1]);
const scene = (): Scene3d => ({ name: 'axes-hidden', units: 'mm', meshes: [L], lines: [] });
const C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
/** 옮기고 Z 둘레로 30° 돌린 그리기 축(0.101.0·0.108.0 시험과 같은 틀) */
const F1 = { origin: [30, 40, 20], x: [C30, S30, 0], y: [-S30, C30, 0] };
/** 세계 원점·세계 축 틀(격자 높이 0) — 틀이 있으면 x = 0·y = 0 격자선을 빼지 않는다(0.101.0) */
const WORLD = { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] };
const ON = { negativeDashed: true, z: true } as const;
/** SketchUp 모양(0.108.0 앱이 할 일 — 좌표축을 켰을 때) */
const SKP = { negativeDashed: true, z: true, withoutGrid: true } as const;
/** 받지 않는 hidden(쓸 수 없는 모양 — 0.108.0 칸 규칙) */
const BAD_HIDDEN: unknown[] = [{ hidden: 1 }, { hidden: 'true' }, { hidden: null }, { hidden: {} }, { hidden: Number.NaN }, { hidden: [] }, { z: true, hidden: 0 }];
const show = (x: unknown): string => JSON.stringify(x, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v)) ?? String(x);
/** 선분 배열(xyz,xyz…)을 선분마다 여섯 수로(−0은 0으로) */
const segs = (a: ArrayLike<number>): number[][] => {
  const out: number[][] = [];
  for (let i = 0; i + 5 < a.length; i += 6) out.push(Array.from({ length: 6 }, (_, k) => a[i + k]! + 0));
  return out;
};
const X0 = [0, -20, 0, 0, 120, 0];
const Y0 = [-20, 0, 0, 120, 0, 0];

describe('순수 axesStyleOf·gridLines — hidden', () => {
  const g = gridSpec(BOX, 'min');
  it('axesStyleOf: hidden은 켰을 때만 칸을 붙이고 hidden만 켜도 모양이다. hidden: false·undefined는 주지 않은 것, 다른 값은 쓸 수 없는 모양', () => {
    expect([g.x0, g.x1, g.y0, g.y1, g.z, g.step, g.minorStep]).toEqual([-20, 120, -20, 120, 0, 10, 2]);
    expect(axesStyleOf({ hidden: true })).toStrictEqual({ negativeDashed: false, z: false, withoutGrid: false, hidden: true });
    expect(axesStyleOf({ ...SKP, hidden: true })).toStrictEqual({ negativeDashed: true, z: true, withoutGrid: true, hidden: true });
    for (const s of [{ hidden: false }, { hidden: undefined }, { negativeDashed: false, z: false, withoutGrid: false, hidden: false }]) expect([show(s), axesStyleOf(s)]).toEqual([show(s), null]);
    expect(axesStyleOf({ z: true, hidden: false })).toStrictEqual({ negativeDashed: false, z: true, withoutGrid: false });
    expect(Object.keys(axesStyleOf(SKP)!)).toEqual(['negativeDashed', 'z', 'withoutGrid']);
    for (const b of BAD_HIDDEN) expect([show(b), axesStyleOf(b)]).toEqual([show(b), undefined]);
  });

  it('gridLines hidden(틀 없음): 축선은 모두 빈 배열(axisZ·axisDash 칸 없음), 큰 칸에 x = 0·y = 0 격자선이 든다(세계 틀을 준 격자와 같다)', () => {
    const a = gridLines(g), w = gridLines(g, null, WORLD);
    expect(segs(a.major)).not.toContainEqual(X0);
    expect(segs(a.major)).not.toContainEqual(Y0);
    for (const s of [{ hidden: true }, { ...SKP, hidden: true }, { ...ON, hidden: true }]) {
      const l = gridLines(g, null, null, s);
      expect([show(s), l.axisX.length, l.axisY.length, 'axisZ' in l, 'axisDash' in l]).toEqual([show(s), 0, 0, false, false]);
      expect(l.minor).toEqual(a.minor);
      expect(l.major).toEqual(w.major);
      expect(segs(l.major).length).toBe(segs(a.major).length + 2);
      expect(segs(l.major)).toContainEqual(X0);
      expect(segs(l.major)).toContainEqual(Y0);
    }
  });

  it('gridLines hidden(틀·원점 기준 좌표): 격자 선은 그 틀의 격자와 같고 축선은 없다. 원점 기준 좌표 + 원점 = 세계', () => {
    const b = gridLines(g, null, F1), l = gridLines(g, null, F1, { ...ON, hidden: true });
    expect([l.major, l.minor]).toEqual([b.major, b.minor]);
    expect([l.axisX.length, l.axisY.length, 'axisZ' in l, 'axisDash' in l]).toEqual([0, 0, false, false]);
    const o = [50, 50, 0];
    const w = gridLines(g, null, null, { hidden: true }), r = gridLines(g, o, null, { hidden: true });
    expect([r.major.length, r.minor.length, r.axisX.length, r.axisY.length]).toEqual([w.major.length, w.minor.length, 0, 0]);
    for (let i = 0; i < w.major.length; i++) expect(r.major[i]! + o[i % 3]!).toBeCloseTo(w.major[i]!, 3);
  });

  it('그대로: hidden이 false거나 없으면 0.112.0 값(모양 없음·z·점선·SketchUp 모양·withoutGrid, 틀 있음·없음)', () => {
    for (const f of [null, F1])
      for (const s of [null, { z: true }, ON, SKP, { withoutGrid: true }]) {
        const h = s === null ? { hidden: false } : { ...s, hidden: false };
        expect([show(f), show(s), gridLines(g, null, f, h)]).toEqual([show(f), show(s), gridLines(g, null, f, s)]);
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

function make(): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(scene());
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [50, 50, 10], distance: 400 });
  v.renderNow();
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/**
 * 그림 한 장의 GL 그리기 기록(프로그램·속성 버퍼 내용·균일 변수 값). 그리기 꼴·색인 꼴은 이름으로 — 가짜 GL 상수 값은 문맥마다 처음 쓴 차례라
 * 걸어온 길이 다른 두 뷰어의 점선(TRIANGLE_STRIP 인스턴스) 기록을 견줄 때 값이 다를 수 있다(fakegl nameOf — 0.25.0·0.26.0 시험과 같은 꼴)
 */
function draws(v: Viewer3d): DrawEntry[] {
  const gl = cv(v).gl!;
  gl.draws = [];
  gl.logDraws = true;
  v.renderNow();
  gl.logDraws = false;
  const typed = (op: string): boolean => op === 'drawElements' || op === 'drawElementsInstanced';
  return gl.draws.map((d) => ({ ...d, args: d.args.map((x, i) => (i === 0 || (typed(d.op) && i === 2) ? (gl.nameOf(x) ?? x) : x)) as unknown as number[] }));
}
type Inner = { colors: { grid: Rgba; gridMinor: Rgba; axisX: Rgba; axisY: Rgba }; theme: { axisZ: string }; rgba(s: string): Rgba };
const inner = (v: Viewer3d): Inner => v as unknown as Inner;
const viewFrame = (v: Viewer3d): { viewProj: ArrayLike<number> } => (v as unknown as { frame(): { viewProj: ArrayLike<number> } }).frame();

/** 그 그림의 격자·축선 그리기: 축 색(X·Y·axisZ — 가는 실선·점선 모두) 그리기 수, 격자 큰 칸 선분(세계 — 격자 모형 이동 없음 장면)·작은 칸 정점 수 */
function gridDraw(v: Viewer3d): { axes: number; major: number[][]; minor: number } {
  const gl = cv(v).gl!;
  const c = inner(v).colors;
  const z = inner(v).rgba(inner(v).theme.axisZ);
  const same = (u: unknown[] | undefined, col: Rgba): boolean => !!u && u.length === 4 && u.every((x, i) => x === col[i]);
  const read = (a: { buf: { bytes: Uint8Array } | null; offset: number } | undefined, n: number): number[] => [...new Float32Array(a!.buf!.bytes.slice(a!.offset, a!.offset + n * 4).buffer)];
  const out = { axes: 0, major: [] as number[][], minor: 0 };
  gl.onDraw = (d: LiveDraw) => {
    if (!d.prog) return;
    const u = d.prog.uniforms.get('u_color');
    if (same(u, c.axisX) || same(u, c.axisY) || same(u, z)) out.axes++;
    else if (d.op === 'drawArrays' && same(u, c.grid)) out.major = segs(read(d.attribs.get(0) as never, d.args[2]! * 3));
    else if (d.op === 'drawArrays' && same(u, c.gridMinor)) out.minor += d.args[2]!;
  };
  v.renderNow();
  gl.onDraw = null;
  return out;
}

describe('Viewer3d.setAxesStyle — hidden', () => {
  it('격자가 보이는 동안 hidden: 축선 그리기 없음, 큰 칸에 x = 0·y = 0 격자선. 다른 그리기·카메라 틀은 그대로, Z·점선 칸을 함께 줘도 같다', () => {
    const v = make(), B = make(), H = make();
    const base = gridDraw(v);
    expect([base.axes, base.major.length]).toEqual([2, 28]);
    expect(base.major).not.toContainEqual(X0);
    expect(v.setAxesStyle({ hidden: true })).toBe(true);
    expect(v.axesStyle).toStrictEqual({ negativeDashed: false, z: false, withoutGrid: false, hidden: true });
    const d = gridDraw(v);
    expect([d.axes, d.major.length, d.minor]).toEqual([0, 30, base.minor]);
    expect(d.major).toContainEqual(X0);
    expect(d.major).toContainEqual(Y0);
    expect(draws(v).length).toBe(draws(B).length - 2);
    expect(viewFrame(v)).toEqual(viewFrame(B));
    expect(H.setAxesStyle({ ...SKP, hidden: true })).toBe(true);
    expect(draws(H)).toEqual(draws(v));
    expect(viewFrame(H)).toEqual(viewFrame(B));
  });

  it('SketchUp 흐름: 좌표축 끔(hidden) → 격자를 보여도 축선 없음, 격자를 숨기면 아무것도 없음(격자를 숨긴 뷰어와 같음), 좌표축 켬 → 0.108.0 모양 그대로', () => {
    const A = make(), B = make(), C = make();
    A.setAxesStyle(SKP);
    C.setAxesStyle(SKP);
    expect(gridDraw(A).axes).toBe(6);
    expect(A.setAxesStyle({ ...SKP, hidden: true })).toBe(true);
    expect(A.axesStyle).toStrictEqual({ ...SKP, hidden: true });
    let d = gridDraw(A);
    expect([d.axes, d.major.length]).toEqual([0, 30]);
    A.setGridVisible(false);
    B.setGridVisible(false);
    d = gridDraw(A);
    expect([d.axes, d.major.length, d.minor]).toEqual([0, 0, 0]);
    expect(draws(A)).toEqual(draws(B));
    expect(viewFrame(A)).toEqual(viewFrame(B));
    A.setGridVisible(true);
    B.setGridVisible(true);
    expect(A.setAxesStyle(SKP)).toBe(true);
    expect(A.axesStyle).toStrictEqual({ ...SKP });
    expect(gridDraw(A).axes).toBe(6);
    expect(draws(A)).toEqual(draws(C));
    expect(viewFrame(A)).toEqual(viewFrame(C));
  });

  it('보이는 범위: hidden이면 Z축선 칸이 있어도 가까운·먼 면을 넓히지 않는다(모양 없는 뷰어와 비트까지 같음 — 켜지 않으면 0.108.0처럼 넓힘)', () => {
    const A = make(), B = make(), C = make();
    A.setAxesStyle({ ...ON, hidden: true });
    C.setAxesStyle(ON);
    expect(viewFrame(A)).toEqual(viewFrame(B));
    expect(viewFrame(C)).not.toEqual(viewFrame(B));
    A.setAxesStyle({ ...SKP, hidden: true });
    A.setGridVisible(false);
    B.setGridVisible(false);
    expect(viewFrame(A)).toEqual(viewFrame(B));
  });

  it('틀과 함께: 틀 축선도 그리지 않고 격자 선은 그 틀의 격자와 같다. 틀을 끄거나 장면을 바꿔도 hidden은 남는다', () => {
    const A = make(), B = make(), C = make();
    A.setAxesFrame(F1);
    B.setAxesFrame(F1);
    A.setAxesStyle({ ...ON, hidden: true });
    const a = gridDraw(A), b = gridDraw(B);
    expect([a.axes, b.axes]).toEqual([0, 2]);
    expect(a.major).toEqual(b.major);
    expect([a.major.length, a.minor]).toEqual([30, b.minor]);
    expect(viewFrame(A)).toEqual(viewFrame(C));
    A.setAxesFrame(null);
    expect(gridDraw(A).axes).toBe(0);
    A.setScene(scene());
    expect(A.axesStyle).toStrictEqual({ negativeDashed: true, z: true, withoutGrid: false, hidden: true });
    expect(gridDraw(A).axes).toBe(0);
  });

  it('같은 모양을 다시 주면 격자를 다시 만들지 않고, hidden만 바꾸면 다시 만든다', () => {
    const v = make();
    const spy = vi.spyOn(v as unknown as { rebuildGrid: () => void }, 'rebuildGrid');
    expect(v.setAxesStyle({ hidden: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(v.setAxesStyle({ hidden: true, z: false, withoutGrid: undefined })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(v.setAxesStyle({ hidden: true, z: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(v.setAxesStyle({ z: true })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(v.axesStyle).toStrictEqual({ negativeDashed: false, z: true, withoutGrid: false });
    expect(v.setAxesStyle({ z: true, hidden: false })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(3);
    spy.mockRestore();
  });

  it('쓸 수 없는 hidden은 받지 않는다(false — 앞 모양·그림 그대로)', () => {
    const v = make();
    const ref = draws(v);
    for (const b of BAD_HIDDEN) expect([show(b), v.setAxesStyle(b as never), v.axesStyle]).toEqual([show(b), false, null]);
    expect(draws(v)).toEqual(ref);
    v.setAxesStyle({ ...SKP, hidden: true });
    const s1 = v.axesStyle, ref1 = draws(v);
    for (const b of BAD_HIDDEN) expect([show(b), v.setAxesStyle(b as never), v.axesStyle]).toEqual([show(b), false, s1]);
    expect(draws(v)).toEqual(ref1);
  });

  it('그대로: hidden: false·undefined는 주지 않은 것(격자를 다시 만들지 않음), 켰다 끄면 주지 않은 뷰어와 GL 그리기·카메라 틀·살아 있는 버퍼 수가 같고, hidden을 끈 모양은 0.112.0 모양 값', () => {
    const A = make(), B = make();
    const spy = vi.spyOn(A as unknown as { rebuildGrid: () => void }, 'rebuildGrid');
    for (const s of [{ hidden: false }, { hidden: undefined }, { negativeDashed: false, z: false, withoutGrid: false, hidden: false }])
      expect([show(s), A.setAxesStyle(s), A.axesStyle]).toEqual([show(s), true, null]);
    expect(spy).not.toHaveBeenCalled();
    expect(draws(A)).toEqual(draws(B));
    A.setAxesStyle({ ...SKP, hidden: true });
    A.renderNow();
    A.setAxesStyle({ hidden: true });
    A.renderNow();
    expect(A.setAxesStyle(null)).toBe(true);
    expect(A.axesStyle).toBe(null);
    expect(draws(A)).toEqual(draws(B));
    expect(viewFrame(A)).toEqual(viewFrame(B));
    expect(cv(A).gl!.liveBuffers).toBe(cv(B).gl!.liveBuffers);
    A.setAxesStyle({ ...SKP, hidden: false });
    expect(A.axesStyle).toStrictEqual({ ...SKP });
    spy.mockRestore();
  });

  it('측정(미리 보기·찍은 값·알림)과 덧그림 2D는 hidden과 상관없다 — Z축선 칸이 있어도 hidden이면 모양 없는 뷰어와 같다', () => {
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
    const b = run(null);
    expect(run({ hidden: true })).toEqual(b);
    expect(run({ ...SKP, hidden: true })).toEqual(b);
    expect((b[b.length - 4] as MeasureResult).distance).toBeCloseTo(100, 6);
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
