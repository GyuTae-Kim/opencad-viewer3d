/**
 * 0.29.0 0.10.0 나란함(첫 점에서)의 기준 선분 거르기(MeasureInference.parallelEdge): 곡선을 나눈 현을 앱이 거르면 첫 점의 나란함 기준이 앞 선분으로 남는지,
 * 끌어온 점의 기준(trackDirs)과 따로인지, 같은 함수를 둘에 주면 같은 선분은 한 번만 묻는지, 주지 않으면 0.28.0과 같은지(화면 격자 미리 보기).
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { normalizeInference } from '../src/inference';
import type { V3 } from '../src/math';
import type { SnapSegment } from '../src/snap';
import { type MeasureHoverSnap, type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { LineSet3d, Scene3d } from '../src/types';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

const ptrEvent = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as FakeElement).fire(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: type === 'pointermove' ? -1 : 0,
    buttons,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  });
const hoverXY = (v: Viewer3d, x: number, y: number): void => {
  ptrEvent(v, 'pointermove', x, y, 0);
  v.renderNow();
};
const clickXY = (v: Viewer3d, x: number, y: number): void => {
  hoverXY(v, x, y);
  ptrEvent(v, 'pointerdown', x, y, 1);
  ptrEvent(v, 'pointerup', x, y, 0);
  v.renderNow();
};
const scr = (v: Viewer3d, p: readonly number[]): { x: number; y: number } => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const along = (o: readonly number[], d: readonly number[], t: number): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t];
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

/** 0.28.0 시험과 같은 자리: 첫 점 A = (0, 0, 0)('가'의 끝), 기준 '기준' (20, 60) → (60, 90)(방향 (0.8, 0.6)), 원(가운데 (130, 30), 반지름 12)을 나눈 현 여덟 '호', 끌어온 점 E */
const A: V3 = [0, 0, 0];
const E: V3 = [80, 20, 0];
const R0: V3 = [20, 60, 0], R1: V3 = [60, 90, 0];
const PAR: V3 = [0.8, 0.6, 0];
const ARC_C: V3 = [130, 30, 0];
const arcPt = (k: number): V3 => {
  const a = ((-45 + 45 * k) * Math.PI) / 180;
  return [ARC_C[0] + 12 * Math.cos(a), ARC_C[1] + 12 * Math.sin(a), 0];
};
const ARC_POS = new Float32Array(8 * 6);
for (let k = 0; k < 8; k++) ARC_POS.set([...arcPt(k), ...arcPt(k + 1)], k * 6);
const chordEnds = (k: number): [V3, V3] => [Array.from(ARC_POS.subarray(k * 6, k * 6 + 3)) as V3, Array.from(ARC_POS.subarray(k * 6 + 3, k * 6 + 6)) as V3];
const chordDir = (k: number): V3 => {
  const [p, q] = chordEnds(k);
  const l = dist(p, q);
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l, (q[2] - p[2]) / l];
};
const scene: Scene3d = {
  name: 'p',
  units: 'mm',
  meshes: [],
  lines: [
    { id: '가', positions: new Float32Array([...A, 0, -20, 0]) },
    { id: '기준', positions: new Float32Array([...R0, ...R1]) },
    { id: '호', positions: ARC_POS, segmentIds: new Uint32Array([201, 202, 203, 204, 205, 206, 207, 208]) } as LineSet3d,
  ],
  points: [],
};
function make(snap: MeasureSnapOptions): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  v.setMeasureSnap(snap);
  const a = scr(v, A);
  clickXY(v, a.x + 0.4, a.y + 0.3);
  expect(v.measurePointCount).toBe(1);
  return v;
}
const pass = (v: Viewer3d, p: readonly number[], q: readonly number[], t = 0.5): void => {
  const s = scr(v, along(p, [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!], t));
  hoverXY(v, s.x + 0.4, s.y + 0.3);
};
const passRef = (v: Viewer3d): void => {
  pass(v, R0, R1, 0.8);
  expect(v.measureHoverSnap).toMatchObject({ segment: { id: '기준' } });
};
const passChord = (v: Viewer3d, k: number, t = 0.5): void => {
  const [p, q] = chordEnds(k);
  pass(v, p, q, t);
  expect(v.measureHoverSnap).toMatchObject({ segment: { id: '호', raw: k } });
};
const hoverAt = (v: Viewer3d, p: readonly number[]): MeasureHoverSnap | null => {
  const s = scr(v, p);
  hoverXY(v, s.x + 2, s.y + 1);
  return v.measureHoverSnap;
};
const notArc = (s: SnapSegment): boolean => s.id !== '호';
/** 첫 점에서 나란한 선 위(첫 점 나란함 — 끌어온 점이 실리지 않는다)이고 기준이 그 선분인지 */
const firstParallel = (h: MeasureHoverSnap | null, e: [V3, V3]): boolean =>
  !!h && h.snap === 'parallel' && !h.trackFrom && !!h.edge && dist(h.edge[0], e[0]) < 1e-6 && dist(h.edge[1], e[1]) < 1e-6;

describe('첫 점 나란함의 기준 선분 거르기(0.29.0 inference.parallelEdge)', () => {
  it('normalizeInference: 함수일 때만 parallelEdge 열쇠(이것만으로는 켜지 않는다)', () => {
    const fn = (): boolean => true;
    expect(normalizeInference({ parallel: true, parallelEdge: fn })!.parallelEdge).toBe(fn);
    expect(normalizeInference({ parallel: true, parallelEdge: null })).not.toHaveProperty('parallelEdge');
    expect(normalizeInference({ parallel: true })).not.toHaveProperty('parallelEdge');
    expect(normalizeInference({ parallelEdge: fn })).toBeNull();
  });

  it('거르지 않으면(0.28.0) 현을 지나면 그 현이 첫 점 나란함의 기준, 거르면 앞 기준(기준)이 남는다', () => {
    const v = make({ edges: true, inference: { parallel: true } });
    passRef(v);
    passChord(v, 0);
    expect(firstParallel(hoverAt(v, along(A, chordDir(0), 40)), chordEnds(0))).toBe(true);
    const w = make({ edges: true, inference: { parallel: true, parallelEdge: notArc } });
    passRef(w);
    passChord(w, 0);
    passChord(w, 3);
    expect(firstParallel(hoverAt(w, along(A, PAR, 30)), [R0, R1])).toBe(true);
    expect(hoverAt(w, along(A, chordDir(0), 40))?.snap === 'parallel').toBe(false);
    // 받은 기준이 없으면 첫 점 나란함이 없다
    const u = make({ edges: true, inference: { parallel: true, parallelEdge: notArc } });
    passChord(u, 0);
    expect(hoverAt(u, along(A, chordDir(0), 40))?.snap === 'parallel').toBe(false);
  });

  it('끌어온 점의 기준(trackDirs)과 따로다 — parallelEdge만 주면 끌어온 점은 현과 나란, trackDirs edge만 주면 첫 점은 현과 나란', () => {
    const v = make({ edges: true, inference: { parallel: true, track: true, trackDirs: true, parallelEdge: notArc } });
    v.setMeasureTrackPoints([E]);
    passRef(v);
    passChord(v, 0);
    expect(firstParallel(hoverAt(v, along(A, PAR, 30)), [R0, R1])).toBe(true);
    expect(hoverAt(v, along(E, chordDir(0), 30))).toMatchObject({ snap: 'parallel', trackFrom: E, edge: chordEnds(0) });
    const w = make({ edges: true, inference: { parallel: true, track: true, trackDirs: { edge: notArc } } });
    w.setMeasureTrackPoints([E]);
    passRef(w);
    passChord(w, 0);
    expect(firstParallel(hoverAt(w, along(A, chordDir(0), 40)), chordEnds(0))).toBe(true);
  });

  it('같은 함수를 둘에 주면 같은 선분은 한 번만 묻는다. 다른 함수면 각자 묻는다. setMeasureSnap을 다시 주면 받은 기준을 잊는다', () => {
    const fn = vi.fn(notArc);
    const v = make({ edges: true, inference: { parallel: true, track: true, trackDirs: { edge: fn }, parallelEdge: fn } });
    passRef(v);
    passChord(v, 0);
    // 첫 점을 찍은 '가'·'기준'·현 0 — 선분마다 한 번
    expect(fn.mock.calls.map((c) => c[0].id)).toEqual(['가', '기준', '호']);
    const f1 = vi.fn(notArc), f2 = vi.fn(notArc);
    const w = make({ edges: true, inference: { parallel: true, track: true, trackDirs: { edge: f1 }, parallelEdge: f2 } });
    passRef(w);
    passChord(w, 0);
    expect(f1).toHaveBeenCalledTimes(3);
    expect(f2).toHaveBeenCalledTimes(3);
    w.setMeasureSnap(w.measureSnap);
    expect(hoverAt(w, along(A, PAR, 30))?.snap === 'parallel').toBe(false);
  });

  it('주지 않으면 0.28.0과 같다(parallelEdge 없음·null의 화면 격자 미리 보기 — 기준·현을 지난 뒤)', () => {
    const run = (parallelEdge: ((s: SnapSegment) => boolean) | null | undefined): unknown[] => {
      const v = make({ edges: true, inference: { axes: true, parallel: true, ...(parallelEdge !== undefined ? { parallelEdge } : {}) } });
      const out: unknown[] = [];
      passRef(v);
      passChord(v, 2);
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 9; i++) {
          hoverXY(v, ((i + 0.5) * 800) / 9 + 0.37, ((j + 0.5) * 600) / 7 + 0.21);
          out.push(v.measureHoverSnap);
        }
      return out;
    };
    const want = run(undefined);
    expect(want.some((h) => (h as MeasureHoverSnap | null)?.snap === 'parallel')).toBe(true);
    expect(run(null)).toEqual(want);
    expect(run(() => true)).toEqual(want);
  });
});
