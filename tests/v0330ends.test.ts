/**
 * 0.33.0 refineEnds: 켠 선(첫 점 축·끌어온 축·끌어온 점 안내 선·잠근 선)이 곡선을 나눈 꺾은선 꼭짓점을 반 화소 안으로 지나는 자리를 앱 refine('axisEdge', open)에 묻기.
 * - 순수 함수(track.ts vertexEdgeCandidates·vertexEdgeSnap): 반 화소 안이면 그 꼭짓점을 끝으로 둔 토막마다 후보(코어 점 = 꼭짓점을 선에 내린 발), 반 화소 밖은 열린 교차가 맡는다,
 *   at(끝점 붙잡기가 고른 꼭짓점)이면 그 자리만, 받는 범위가 커서에서 붙잡기 거리 밖이면 묻지 않기, 꼭짓점에서 곡선을 가로지르는 선(앱 점이 꼭짓점과 반 화소 안)은 받지 않기
 * - 뷰어(가짜 DOM — 실제 포인터 사건): NC 23차 재현(원호 꼭대기를 스치는 첫 점 X축 — v0230.test.ts와 같은 장면·앱 refine)을 확대 12단마다 끄고·켜서 견준다.
 *   켜지 않으면 0.32.0 값 그대로이고, 켜면 바뀐 자리는 모두 "선이 꼭짓점을 반 화소 안으로 지나는 단"의 원 위 교차다(NC tests/app measure-apex-core의 셈에 그 조건을 더한 것과 같다).
 *   끌어온 축·잠근 X축(점 붙잡기 자리와 선분 교차 자리)·기운 원호를 스치는 끌어온 점 안내 선(나란함)도 같은 규칙, 곧은 꺾은선(앱 null)·refine 없이는 0.32.0 그대로
 * 화면 좌표로 가리킬 때는 선의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, projectToScreen, viewDepth, worldPerPixel } from '../src/camera';
import type { SnapRefineInput } from '../src/snap';
import { openEdgeCandidates, vertexEdgeCandidates, vertexEdgeSnap } from '../src/track';
import { type MeasureHoverSnap, type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const DEG = Math.PI / 180;

/**
 * NC 23차 재현 장면(v0230.test.ts와 같다): 반지름 25 원호(152.5° → −12.49° 시계 방향, 33토막 — 꼭대기 90°가 92.504°~87.504° 토막 가운데쯤)와 (40, 25 − δ)까지 급속 이동.
 * rot(°)를 주면 원호·급속 이동을 원점 둘레로 그만큼 돌린다(기운 원호 — 안내 선 시험)
 */
const S = [25 * Math.cos(152.5 * DEG), 25 * Math.sin(152.5 * DEG)].map((v) => +v.toFixed(6));
const E = [25 * Math.cos(-12.49 * DEG), 25 * Math.sin(-12.49 * DEG)].map((v) => +v.toFixed(6));
const RA = Math.hypot(S[0]!, S[1]!);
const N = 33;
const a0 = Math.atan2(S[1]!, S[0]!), a1 = Math.atan2(E[1]!, E[0]!);
const arcV = (k: number, rot = 0): V3 => {
  const a = a0 + ((a1 - a0) * k) / N + rot * DEG;
  return [RA * Math.cos(a), RA * Math.sin(a), 0];
};
const turn = (p: readonly number[], rot: number): V3 => {
  const c = Math.cos(rot * DEG), s = Math.sin(rot * DEG);
  return [p[0]! * c - p[1]! * s, p[0]! * s + p[1]! * c, p[2] ?? 0];
};
/** 원호 꺾은선 세계 꼭짓점(장면 float32 반올림 그대로) */
const arcPts = (rot = 0): V3[] => Array.from({ length: N + 1 }, (_, k) => Array.from(new Float32Array(arcV(k, rot))) as V3);
function scene(d: number, rot = 0, extra: Scene3d['lines'] = []): Scene3d {
  const P: number[] = [];
  for (let k = 0; k < N; k++) P.push(...arcV(k, rot), ...arcV(k + 1, rot));
  return {
    name: 'apex',
    units: 'mm',
    meshes: [],
    lines: [
      { id: '호', positions: new Float32Array(P), segmentIds: new Uint32Array(Array.from({ length: N }, (_, k) => k)) },
      { id: '급속', positions: new Float32Array([...turn([E[0]!, E[1]!, 0], rot), ...turn([40, 25 - d, 0], rot)]) },
      ...extra,
    ],
    points: [],
  };
}
/** 앱 refine(NC 앱과 같은 셈 — v0230.test.ts): 'axisEdge' 직선과 원(z 0)의 교차 가운데 힌트(point)에 가까운 근(토막 길이 안). 곧은 꺾은선은 null */
const refine = (calls: SnapRefineInput[]) => (c: SnapRefineInput): V3 | null => {
  calls.push(c);
  if (c.kind !== 'axisEdge' || !c.line || c.segment.id !== '호') return null;
  const o = c.line.origin, d = c.line.dir;
  if (Math.abs(d[2]) > 1e-12 || Math.abs(o[2]) > 1e-9) return null;
  const a = d[0] * d[0] + d[1] * d[1], b = o[0] * d[0] + o[1] * d[1], k = o[0] * o[0] + o[1] * o[1] - RA * RA;
  const disc = b * b - a * k;
  if (disc < 0) return null;
  const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t): V3 => [o[0] + d[0] * t, o[1] + d[1] * t, o[2]]);
  const q = dist(ts[0]!, c.point) <= dist(ts[1]!, c.point) ? ts[0]! : ts[1]!;
  return dist(q, c.point) <= dist(c.segment.ends[0], c.segment.ends[1]) * (1 + 1e-6) ? q : null;
};
/** NC 앱의 추론 선택(measure.ts MEASURE_INFERENCE와 같다) */
const INF = { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true, axisFaces: true, lockEdges: true, lockFaces: true } as const;
/** 1화소의 세계 길이 0.002~0.1 사이 12단(곱 비 약 1.43) */
const STEPS = Array.from({ length: 12 }, (_, k) => 0.002 * Math.pow(50, k / 11));
const SNAP = 10;

// ───────────── 순수 함수 ─────────────
describe('vertexEdgeCandidates·vertexEdgeSnap(0.33.0 — 선이 꺾은선 꼭짓점을 반 화소 안으로 지나는 자리)', () => {
  const d = 0.0001;
  const yl = Math.fround(25 - d);
  const xi = Math.sqrt(RA * RA - yl * yl);
  const V = arcPts();
  // 꼭대기 토막(12: 92.504° → 87.504°)과 그 두 이웃
  const apex = 12;
  const at = (f: ReturnType<typeof frame>, p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  /** 위에서 본 평행 투영 — 꼭대기 둘레 1화소 = w */
  function frame(w: number) {
    const cam: CameraState = { ...defaultCamera(), yaw: 0, pitch: Math.PI / 2 - 1e-9, target: [0, 25, 0], distance: 100, projection: 'orthographic' };
    const f0 = computeFrame(cam, 800, 600, { center: [0, 0, 0], radius: 50 });
    const w0 = worldPerPixel(f0, viewDepth(f0, [0, 25, 0]));
    return computeFrame({ ...cam, distance: (100 * w) / w0 }, 800, 600, { center: [0, 0, 0], radius: 50 });
  }
  const segsOf = (f: ReturnType<typeof frame>) =>
    Array.from({ length: N }, (_, k) => ({ a: V[k]!, b: V[k + 1]!, wpp: worldPerPixel(f, viewDepth(f, V[k]!)), k }));
  const line = [{ from: [40, yl, 0] as V3, dir: [-1, 0, 0] as V3 }];
  const circle = (c: { p: V3 }): V3 => {
    const r = Math.sqrt(RA * RA - yl * yl);
    return [c.p[0] >= 0 ? r : -r, yl, 0];
  };

  it('전제: 꼭대기 토막의 두 끝은 선에서 0.024쯤 아래 — 1화소 0.07이면 반 화소 안, 0.02면 밖', () => {
    expect(Math.atan2(V[apex]![1], V[apex]![0]) / DEG).toBeCloseTo(92.504, 2);
    expect(Math.atan2(V[apex + 1]![1], V[apex + 1]![0]) / DEG).toBeCloseTo(87.504, 2);
    for (const k of [apex, apex + 1]) {
      expect(yl - V[k]![1]).toBeGreaterThan(0.02);
      expect(yl - V[k]![1]).toBeLessThan(0.5 * 0.07);
      expect(yl - V[k]![1]).toBeGreaterThan(0.5 * 0.02);
    }
  });

  it('반 화소 안: 꼭대기 토막 두 끝마다 후보(코어 점 = 꼭짓점을 선에 내린 발 — 이웃 토막은 받는 범위가 커서에서 멀다), 열린 교차 후보는 없다', () => {
    const f = frame(0.07);
    const segs = segsOf(f);
    const [x, y] = at(f, [xi, yl, 0]);
    const cs = vertexEdgeCandidates(f, line, segs, x + 1, y + 2, SNAP);
    const got = cs.map((c) => `${c.seg.k}:${c.p[0] === V[apex]![0] ? 'L' : c.p[0] === V[apex + 1]![0] ? 'R' : '?'}`).sort();
    expect(got).toEqual(['12:L', '12:R']);
    // 오른쪽 꼭짓점 둘레를 가리키면 그 꼭짓점을 함께 쓰는 이웃 토막(13)도
    const [rx, ry] = at(f, V[apex + 1]!);
    expect(vertexEdgeCandidates(f, line, segs, rx - 3, ry + 2, SNAP).map((c) => `${c.seg.k}:${c.p[0] === V[apex + 1]![0] ? 'R' : '?'}`)).toContain('13:R');
    for (const c of cs) {
      expect(c.p[1]).toBe(yl);
      expect(c.p[2]).toBe(0);
      expect(c.gap).toBeLessThanOrEqual(0.5 * c.seg.wpp);
      expect(c.reachPx).toBeLessThan(SNAP);
    }
    // 0.20.0 열린 교차는 이 자리를 보지 않는다(그 끝을 함께 쓰는 이웃 토막을 선이 3D로 지난다)
    expect(openEdgeCandidates(f, line, segs, x + 1, y + 2, SNAP).filter((c) => c.seg.k === apex)).toEqual([]);
    // 받는 것: 꼭대기 토막의 오른쪽 근(R 끝 발에 가까운 근) — 앱이 힌트 둘레 근을 준다
    const r = vertexEdgeSnap(f, line, segs, x + 1, y + 2, SNAP, circle)!;
    expect(r.seg.k).toBe(apex);
    expect(dist(r.p, [xi, yl, 0])).toBeLessThan(1e-9);
    expect(r.p[1]).toBe(yl);
    expect(r.distPx).toBeLessThan(3);
  });

  it('반 화소 밖(1화소 0.02)이면 후보가 없고 열린 교차가 맡는다', () => {
    const f = frame(0.02);
    const segs = segsOf(f);
    const [x, y] = at(f, [xi, yl, 0]);
    expect(vertexEdgeCandidates(f, line, segs, x + 1, y + 2, SNAP)).toEqual([]);
    expect(openEdgeCandidates(f, line, segs, x + 1, y + 2, SNAP).some((c) => c.seg.k === apex)).toBe(true);
  });

  it('at(끝점 붙잡기가 고른 꼭짓점)이면 그 자리의 끝만', () => {
    const f = frame(0.1);
    const segs = segsOf(f);
    // 오른쪽 꼭짓점에서 왼쪽으로 5화소(꼭짓점과 오른쪽 근 사이 — 근은 꼭짓점에서 1.02, 1화소 0.1이면 10화소쯤)
    const [x, y] = at(f, V[apex + 1]!);
    const cs = vertexEdgeCandidates(f, line, segs, x - 5, y + 2, SNAP, V[apex + 1]);
    expect(cs.map((c) => c.seg.k).sort()).toEqual([12, 13]);
    for (const c of cs) expect(c.p[0]).toBe(V[apex + 1]![0]);
    const [qx, qy] = at(f, [xi, yl, 0]);
    expect(Math.hypot(qx - x + 5, qy - y - 2)).toBeLessThan(SNAP);
    const r = vertexEdgeSnap(f, line, segs, x - 5, y + 2, SNAP, circle, null, V[apex + 1]);
    expect(r && dist(r.p, [xi, yl, 0])).toBeLessThan(1e-9);
    // 왼쪽 꼭짓점의 끝만 보라고 하면 그 발 둘레의 근(왼쪽 근 — 이 확대에서는 커서에서 7화소쯤이라 받는다)
    const l = vertexEdgeSnap(f, line, segs, x - 5, y + 2, SNAP, circle, null, V[apex])!;
    expect(dist(l.p, [-xi, yl, 0])).toBeLessThan(1e-9);
    expect(l.core[0]).toBe(V[apex]![0]);
  });

  it('받는 범위가 커서에서 붙잡기 거리 밖이면 묻지 않는다, 꼭짓점에서 곡선을 가로지르는 선의 앱 점(꼭짓점과 반 화소 안)은 받지 않는다', () => {
    const f = frame(0.07);
    const segs = segsOf(f);
    const [x, y] = at(f, [xi, yl, 0]);
    let calls = 0;
    // 선에서 30화소 아래
    expect(vertexEdgeSnap(f, line, segs, x + 1, y + 30, SNAP, () => (calls++, null))).toBeNull();
    expect(calls).toBe(0);
    // 꼭짓점 V(87.504°)를 지나는 세로 선(Y축): 앱이 주는 원 위 점은 V 자리(반 화소 안) — 끝점이 곧 교차라 받지 않는다
    const vy = [{ from: [V[apex + 1]![0], 0, 0] as V3, dir: [0, 1, 0] as V3 }];
    const [vx, vyy] = at(f, V[apex + 1]!);
    const cs = vertexEdgeCandidates(f, vy, segs, vx + 1, vyy + 2, SNAP);
    expect(cs.length).toBeGreaterThan(0);
    const onCircle = (): V3 => [V[apex + 1]![0], Math.sqrt(RA * RA - V[apex + 1]![0] ** 2), 0];
    expect(dist(onCircle(), V[apex + 1]!)).toBeLessThan(0.5 * 0.07);
    expect(vertexEdgeSnap(f, vy, segs, vx + 1, vyy + 2, SNAP, onCircle)).toBeNull();
  });
});

// ───────────── 뷰어 ─────────────
let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

const ptrEvent = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as { fire: (t: string, e: object) => void }).fire(type, {
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

/** 확대 하나에서 붙은 것: o = 원 위 교차(다듬음 — 선분 실림), v = 꼭짓점(끝점), a = 선 위 커서 자리(선분 없음), - = 그 밖 */
type Mode = 'first' | 'track' | 'lock';
interface Cell {
  k: string;
  h: MeasureHoverSnap | null;
  /** 이 단의 1화소 세계 길이와 그 근 쪽 꼭대기 토막 끝의 선과의 틈(화소) */
  w: number;
  gapPx: number;
  Q: V3;
}

/** 꼭대기 둘레를 1화소 = w(세계)쯤으로(화면 가로 800화소) — 실제 1화소 길이 */
function zoom(v: Viewer3d, w: number, rot = 0): number {
  const hw = 400 * w;
  const a = v.project(turn([-hw, 25 - 0.75 * hw, 0], rot))!, b = v.project(turn([hw, 25 + 0.75 * hw, 0], rot))!;
  v.zoomToRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), false);
  v.renderNow();
  const p0 = v.project(turn([0, 25, 0], rot))!, p1 = v.project(turn([1, 25, 0], rot))!;
  return 1 / Math.hypot(p1.x - p0.x, p1.y - p0.y);
}

/**
 * X축(첫 점 축 — 'first', 끌어온 점 (40, yl)의 축 — 'track', 첫 점에서 잠근 X축 — 'lock')이 원호 꼭대기를 스칠 때 확대 12단 × 두 근(+xi, −xi) 둘레를 가리킨 것.
 * refineEnds를 켜지 않으면(ends false) 0.32.0 그대로
 */
function sweep(d: number, mode: Mode, ends: boolean, opts: Partial<MeasureSnapOptions> = {}): { plus: Cell[]; minus: Cell[]; calls: SnapRefineInput[] } {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  v.setScene(scene(d));
  v.setView('top', false);
  v.fit(false);
  v.setMeasureMode(true);
  const calls: SnapRefineInput[] = [];
  v.setMeasureSnap({ points: [{ point: [0, 0, 0], kind: 'center' }], inference: INF, refine: refine(calls), ...(ends ? { refineEnds: true } : {}), ...opts });
  v.renderNow();
  const yl = Math.fround(25 - d);
  if (mode === 'track') expect(v.setMeasureTrackPoints([[40, yl, 0]])).toBe(1);
  else {
    const s0 = v.project([40, 25 - d, 0])!;
    clickXY(v, s0.x + 1, s0.y + 1);
    expect(v.measurePoints[0]).toMatchObject({ point: [40, yl, 0], snap: 'endpoint' });
    if (mode === 'lock') expect(v.setMeasureInferenceLock('x')).toBe(true);
  }
  const xi = Math.sqrt(RA * RA - yl * yl);
  const V = arcPts();
  const plus: Cell[] = [], minus: Cell[] = [];
  for (const s of STEPS) {
    const w = zoom(v, s);
    for (const Q of [[xi, yl, 0] as V3, [-xi, yl, 0] as V3]) {
      const p = v.project(Q)!;
      hoverXY(v, p.x + 1, p.y + 2);
      const h = v.measureHoverSnap;
      const end = Q[0] > 0 ? V[13]! : V[12]!;
      let k = '-';
      if (h?.snap === 'endpoint' || (h?.locked && h.fromSnap === 'endpoint')) k = 'v';
      else if (h?.snap === 'axis' && h.axis === 'x' && h.segment && h.refined) k = 'o';
      else if (h?.snap === 'axis' && h.axis === 'x' && !h.segment) k = 'a';
      (Q[0] > 0 ? plus : minus).push({ k, h, w, gapPx: (yl - end[1]) / w, Q });
    }
  }
  v.dispose();
  return { plus, minus, calls };
}
const str = (cs: readonly Cell[]): string => cs.map((c) => c.k).join('');

describe("Viewer3d refineEnds: 원호 꼭대기를 스치는 X축(NC 23차 재현 — 꼭짓점과 반 화소 안으로 겹치는 단)", () => {
  const DS = [0.0001, 0.001, 0.003, 0.01];

  it('켜지 않으면(refineEnds 없이·false·refine 없이) 0.32.0 값 그대로(v0230.test.ts와 같은 줄 — 0.35.0부터 앞 1단은 커서가 활꼴 쪽이라 원 위)', () => {
    const off = DS.map((d) => sweep(d, 'first', false));
    expect(off.map((g) => str(g.plus))).toEqual(['oooooooooaav', 'oooooooooaav', 'oooooooooavv', 'ooooooooavvv']);
    expect(off.map((g) => str(g.minus))).toEqual(['oooooooooaaa', 'oooooooooaav', 'oooooooooaav', 'ooooooooavvv']);
    const f = sweep(0.001, 'first', false, { refineEnds: false });
    expect(str(f.plus)).toBe('oooooooooaav');
    // refine 없이 켜도 켜지지 않는다(열린 교차도 없다 — 꼭짓점·커서 자리만, 끈 것과 같다)
    const n = sweep(0.001, 'first', true, { refine: null }), n0 = sweep(0.001, 'first', false, { refine: null });
    expect(str(n.plus)).not.toContain('o');
    expect(n.plus.map((c) => c.h)).toEqual(n0.plus.map((c) => c.h));
    expect(n.minus.map((c) => c.h)).toEqual(n0.minus.map((c) => c.h));
  });

  it('켜면 바뀐 자리는 모두 원 위 교차이고, 선이 그 근 쪽 꼭대기 토막 끝을 반 화소 안으로 지나는 단이다', () => {
    for (const d of DS) {
      const off = sweep(d, 'first', false), on = sweep(d, 'first', true);
      for (const side of ['plus', 'minus'] as const) {
        const A = off[side], B = on[side];
        for (let i = 0; i < A.length; i++) {
          const a = A[i]!, b = B[i]!;
          if (a.k === b.k) {
            expect(b.h).toEqual(a.h);
            continue;
          }
          expect(b.k).toBe('o');
          expect(['v', 'a']).toContain(a.k);
          expect(a.gapPx).toBeLessThanOrEqual(0.5);
          // 원 위(그 선 위)의 두 근 가운데 하나 — 두 근이 2화소쯤 떨어진 단에서는 커서(근에서 (1, 2)화소)에 더 가까운 다른 근일 수 있다
          const Qm: V3 = [-b.Q[0], b.Q[1], 0];
          expect(Math.min(dist(b.h!.point, b.Q), dist(b.h!.point, Qm))).toBeLessThan(1e-9);
          if (dist(b.h!.point, Qm) < 1e-9) expect(2 * Math.abs(b.Q[0]) / b.w).toBeLessThan(3);
          expect(b.h!.point[1]).toBe(Math.fround(25 - d));
          expect(b.h!.point[2]).toBe(0);
          expect(b.h!.segment).toMatchObject({ kind: 'line', id: '호', index: 12 });
          expect(b.h!.direction).toEqual([1, 0, 0]);
        }
        // 반 화소 안인 단은 모두 원 위 교차, 그 밖은 0.32.0 그대로
        for (let i = 0; i < A.length; i++) if (A[i]!.gapPx <= 0.5) expect(B[i]!.k).toBe('o');
      }
    }
  });

  it('NC measure-apex-core의 같은 셈(코어 점에서의 한도를 뺀 0.23.0 규칙 wide)에 "선이 꼭짓점을 반 화소 안으로 지나고 원 위 교차가 커서에서 붙잡기 거리 안"을 더한 단과 같다', () => {
    // NC tests/app/measure-apex-core.test.ts model()과 같은 셈(위에서 본 평면, 1화소 = w): 축 y = yl과 꼭대기 토막 a → b, 원 위 교차 q, 커서 c
    const V = arcPts();
    const model = (w: number, yl: number, c: readonly number[]): { wide: boolean; ends: boolean } => {
      const a = V[12]!, b = V[13]!;
      const xi = Math.sqrt(RA * RA - yl * yl);
      const hi = a[1] >= b[1] ? a : b;
      const gap = yl - hi[1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const tol = 0.5 * w;
      const q = [xi, yl];
      const px = (p: readonly number[], s: readonly number[]): number => Math.hypot(p[0]! - s[0]!, p[1]! - s[1]!) / w;
      const u = ((q[0]! - a[0]) * (b[0] - a[0]) + (q[1]! - a[1]) * (b[1] - a[1])) / (L * L);
      const inSeg = u >= 0 && u <= 1 && px(q, a) > 0.5 && px(q, b) > 0.5 && px(q, c) <= SNAP;
      const free = Math.min(px(c, a), px(c, b)) > SNAP;
      // 0.35.0: 틈이 붙잡기 거리의 세계 길이보다 넓어도 커서가 그 토막 활꼴 쪽(현에 내린 발이 토막 안, 현에서 선 쪽으로 0.1 × 토막 길이 안)이면 받는다
      const uc = ((c[0]! - a[0]) * (b[0] - a[0]) + (c[1]! - a[1]) * (b[1] - a[1])) / (L * L);
      const cy = a[1] + (b[1] - a[1]) * uc;
      const lens = uc >= 0 && uc <= 1 && c[1]! >= cy && c[1]! - cy <= 0.1 * L;
      return { wide: gap > tol && gap <= 0.1 * L && (gap <= SNAP * w || lens) && inSeg && free, ends: gap <= tol && inSeg };
    };
    for (const d of DS) {
      const yl = Math.fround(25 - d);
      const on = sweep(d, 'first', true);
      const want = on.plus.map((c) => {
        const m = model(c.w, yl, [c.Q[0] + c.w, yl - 2 * c.w]);
        return m.wide || m.ends ? 'o' : '.';
      });
      expect(str(on.plus).replace(/[^o]/g, '.')).toBe(want.join(''));
    }
  });

  it('줄로 보면: 12단 모두에서 두 교차 모두 붙는다(0.34.0까지 앞 1단은 틈이 붙잡기 거리보다 넓어 붙지 않았다 — 0.35.0)', () => {
    const got = DS.map((d) => sweep(d, 'first', true));
    expect(got.map((g) => str(g.plus))).toEqual(['oooooooooooo', 'oooooooooooo', 'oooooooooooo', 'oooooooooooo']);
    expect(got.map((g) => str(g.minus))).toEqual(['oooooooooooo', 'oooooooooooo', 'oooooooooooo', 'oooooooooooo']);
    // 앱 함수는 기억으로 단마다 몇 번만 불린다(12단 × 두 자리)
    for (const g of got) expect(g.calls.filter((c) => c.open).length).toBeLessThanOrEqual(5 * 12);
  });

  /** 끈 것과 켠 것을 견준다: 같은 자리는 값까지 같고, 바뀐 자리는 꼭짓점과 반 화소 안인 단의 원 위 교차(o)뿐 — 바뀐 수를 돌려준다 */
  function compare(off: Cell[], on: Cell[], check: (h: MeasureHoverSnap, c: Cell) => void): number {
    let n = 0;
    for (let i = 0; i < off.length; i++) {
      const a = off[i]!, b = on[i]!;
      if (a.k === b.k && JSON.stringify(a.h) === JSON.stringify(b.h)) continue;
      n++;
      expect(b.k).toBe('o');
      expect(['v', 'a']).toContain(a.k);
      expect(a.gapPx).toBeLessThanOrEqual(0.5);
      const Qm: V3 = [-b.Q[0], b.Q[1], 0];
      expect(Math.min(dist(b.h!.point, b.Q), dist(b.h!.point, Qm))).toBeLessThan(1e-9);
      expect(b.h!.segment).toMatchObject({ kind: 'line', id: '호', index: 12 });
      check(b.h!, b);
    }
    return n;
  }

  it('끌어온 축(첫 점 없이 끌어온 점 (40, yl)의 X축)과 첫 점에서 잠근 X축(lockEdges — 끝점을 잠근 선에 내리던 자리·선분 교차에서 빠지던 자리)도 같은 규칙', () => {
    for (const d of [0.0001, 0.01]) {
      const yl = Math.fround(25 - d);
      const t0 = sweep(d, 'track', false), t1 = sweep(d, 'track', true);
      const nt =
        compare(t0.plus, t1.plus, (h) => {
          expect(h.trackFrom).toEqual([40, yl, 0]);
          expect(h).not.toHaveProperty('direction');
        }) + compare(t0.minus, t1.minus, () => {});
      expect(nt).toBeGreaterThan(0);
      const l0 = sweep(d, 'lock', false), l1 = sweep(d, 'lock', true);
      // 줄은 첫 점 축과 같다(끈 것은 0.32.0 — v0230.test.ts의 첫 점 X축 줄)
      // 0.35.0: 앞 1단(틈이 붙잡기 거리보다 넓다)도 커서가 활꼴 쪽이라 원 위
      const off = d === 0.01 ? ['ooooooooavvv', 'ooooooooavvv'] : ['oooooooooaav', 'oooooooooaaa'];
      const on = 'oooooooooooo';
      for (const [g0, g1] of [
        [t0, t1],
        [l0, l1],
      ] as const) {
        expect([str(g0.plus), str(g0.minus)]).toEqual(off);
        expect([str(g1.plus), str(g1.minus)]).toEqual([on, on]);
      }
      const nl =
        compare(l0.plus, l1.plus, (h) => {
          expect(h).toMatchObject({ snap: 'axis', axis: 'x', locked: true, direction: [1, 0, 0], refined: true });
          expect(h).not.toHaveProperty('from');
        }) + compare(l0.minus, l1.minus, () => {});
      expect(nl).toBeGreaterThan(0);
      // 반 화소 안인 단은 켜면 모두 원 위 교차
      for (const g of [t1, l1]) for (const c of [...g.plus, ...g.minus]) if (c.gapPx <= 0.5) expect(c.k).toBe('o');
      // 0.32.0 잠근 동안의 끝점 자리(꼭짓점을 잠근 선에 내린 자리)가 있었고 켜면 바뀐다
      expect(str(l0.plus)).toContain('v');
      expect(str(l1.plus)).not.toContain('v');
    }
  });

  it('화면 격자(꼭대기 둘레 2화소 간격): 바뀐 자리는 모두 꼭짓점을 반 화소 안으로 지나는 첫 점 축 위·원 위 교차, 꼭짓점에서 원을 가로지르는 축은 그대로 끝점', () => {
    const d = 0.0001;
    const yl = Math.fround(25 - d);
    const V = arcPts();
    /** 첫 점 둘: 급속 이동 끝 (40, yl)(X축이 꼭대기를 스친다)과 꼭짓점 13 바로 아래 점(Y축이 꼭짓점 13에서 원을 가로지른다) */
    const B: V3 = [V[13]![0], 5, 0];
    const grid = (ends: boolean, A: V3, around: V3) => {
      const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
      v.setScene({ ...scene(d), points: [{ id: '점', positions: new Float32Array(B) }] });
      v.setView('top', false);
      v.fit(false);
      v.setMeasureMode(true);
      v.setMeasureSnap({ inference: INF, refine: refine([]), ...(ends ? { refineEnds: true } : {}) });
      v.renderNow();
      const s0 = v.project(A)!;
      clickXY(v, s0.x + 1, s0.y + 1);
      expect(v.measurePoints[0]!.point).toEqual(Array.from(new Float32Array(A)));
      const w = zoom(v, 0.07);
      const c = v.project(around)!;
      const out: { h: MeasureHoverSnap | null; w: number }[] = [];
      for (let j = -12; j <= 12; j++) for (let i = -30; i <= 30; i++) {
        hoverXY(v, c.x + 2 * i + 0.3, c.y + 2 * j + 0.4);
        out.push({ h: v.measureHoverSnap, w });
      }
      v.dispose();
      return out;
    };
    const near = (from: readonly number[], axis: 'x' | 'y', w: number): boolean =>
      V.some((p) => (axis === 'x' ? Math.abs(p[1] - from[1]!) : Math.abs(p[0] - from[0]!)) <= 0.5 * w * 1.01);
    for (const [A, around] of [
      [[40, yl, 0] as V3, [0, yl, 0] as V3],
      [B, V[13]!],
    ] as const) {
      const off = grid(false, A, around), on = grid(true, A, around);
      const first = Array.from(new Float32Array(A));
      let n = 0;
      for (let i = 0; i < off.length; i++) {
        const a = off[i]!.h, b = on[i]!.h;
        if (JSON.stringify(a) === JSON.stringify(b)) continue;
        n++;
        expect(b).toMatchObject({ snap: 'axis', refined: true, segment: { id: '호' } });
        expect(Math.abs(Math.hypot(b!.point[0], b!.point[1]) - RA)).toBeLessThan(1e-9);
        // 첫 점 축 위(남은 두 좌표는 첫 점 그대로)이고 그 축이 꼭짓점을 반 화소 안으로 지난다
        if (b!.axis === 'x') expect(b!.point[1]).toBe(first[1]);
        else expect(b!.point[0]).toBe(first[0]);
        expect(near(first, b!.axis as 'x' | 'y', off[i]!.w)).toBe(true);
        expect(['endpoint', 'axis']).toContain(a?.snap);
      }
      if (A === B) expect(n).toBe(0);
      else expect(n).toBeGreaterThan(20);
    }
  });

  it('곧은 꺾은선처럼 앱이 null만 주면 켜도 0.32.0 그대로', () => {
    const nul = () => null;
    for (const mode of ['first', 'track', 'lock'] as const) {
      const a = sweep(0.001, mode, false, { refine: nul }), b = sweep(0.001, mode, true, { refine: nul });
      expect(b.plus.map((c) => c.h)).toEqual(a.plus.map((c) => c.h));
      expect(b.minus.map((c) => c.h)).toEqual(a.minus.map((c) => c.h));
    }
  });

  it('찍으면: 원 위 교차를 두 점째로(다듬음·선분·축), 거리는 정확한 값', () => {
    const d = 0.001;
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    v.setScene(scene(d));
    v.setView('top', false);
    v.fit(false);
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: INF, refine: refine([]), refineEnds: true });
    v.renderNow();
    const s0 = v.project([40, 25 - d, 0])!;
    clickXY(v, s0.x + 1, s0.y + 1);
    const yl = v.measurePoints[0]!.point[1];
    const xi = Math.sqrt(RA * RA - yl * yl);
    // 1화소 0.1 — 꼭짓점이 커서에서 붙잡기 거리 안(0.32.0은 끝점)
    zoom(v, STEPS[11]!);
    const q = v.project([xi, yl, 0])!;
    clickXY(v, q.x + 1, q.y + 2);
    const m = v.measurePoints[1]!;
    expect(m).toMatchObject({ snap: 'axis', axis: 'x', refined: true, direction: [1, 0, 0], segment: { id: '호', index: 12 } });
    expect(dist(m.point, [xi, yl, 0])).toBeLessThan(1e-9);
    expect(dist(v.measurePoints[0]!.point, m.point)).toBeCloseTo(40 - xi, 9);
    v.dispose();
  });
});

describe('Viewer3d refineEnds: 기운 원호 꼭대기를 스치는 끌어온 점 안내 선(trackDirs meets — 나란함)', () => {
  const ROT = 30;
  const d = 0.001;
  const yl = Math.fround(25 - d);
  const dir: V3 = [Math.cos(ROT * DEG), Math.sin(ROT * DEG), 0];
  const P = turn([40, yl, 0], ROT);
  /** 기준 선분(안내 선 방향 — 원호에서 멀리)과 그것만 받는 거르기 */
  const ref: Scene3d['lines'] = [{ id: '기준', positions: new Float32Array([...turn([-60, -45, 0], ROT), ...turn([-20, -45, 0], ROT)]) }];
  function run(ends: boolean, nul = false): { cells: { k: string; h: MeasureHoverSnap | null; gapPx: number; Q: V3; w: number }[]; calls: number } {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    v.setScene(scene(d, ROT, ref));
    v.setView('top', false);
    v.fit(false);
    v.setMeasureMode(true);
    const calls: SnapRefineInput[] = [];
    v.setMeasureSnap({
      inference: { ...INF, trackDirs: { edge: (s) => s.id === '기준', meets: { open: true } } },
      refine: nul ? () => null : refine(calls),
      ...(ends ? { refineEnds: true } : {}),
    });
    v.renderNow();
    // 기준 선분 위를 지나간다(끌어온 점의 나란함 기준)
    const r0 = v.project(turn([-40, -45, 0], ROT))!;
    hoverXY(v, r0.x + 1, r0.y + 1);
    expect(v.setMeasureTrackPoints([P])).toBe(1);
    const V = arcPts(ROT);
    const xi = Math.sqrt(RA * RA - yl * yl);
    const cells: { k: string; h: MeasureHoverSnap | null; gapPx: number; Q: V3; w: number }[] = [];
    for (const s of STEPS) {
      const w = zoom(v, s, ROT);
      for (const sgn of [1, -1]) {
        const Q = turn([sgn * xi, yl, 0], ROT);
        const p = v.project(Q)!;
        hoverXY(v, p.x + 1, p.y + 2);
        const h = v.measureHoverSnap;
        const end = sgn > 0 ? V[13]! : V[12]!;
        // 꼭짓점과 안내 선 사이 거리(선에 수직)
        const ex = end[0] - P[0], ey = end[1] - P[1];
        const gap = Math.abs(ex * dir[1] - ey * dir[0]);
        let k = '-';
        if (h?.snap === 'endpoint') k = 'v';
        else if (h?.snap === 'parallel' && h.trackFrom && h.segment && h.refined) k = 'o';
        else if (h?.snap === 'parallel' && h.trackFrom && !h.segment) k = 'a';
        cells.push({ k, h, gapPx: gap / w, Q, w });
      }
    }
    v.dispose();
    return { cells, calls: calls.filter((c) => c.open).length };
  }

  it('켜지 않으면 0.32.0 그대로(앱 null도), 켜면 바뀐 자리는 모두 꼭짓점과 반 화소 안인 단의 원 위·안내 선 위 교차(나란함·끌어온 점·기준 선분·토막·다듬음)', () => {
    const off = run(false), on = run(true);
    const offStr = off.cells.map((c) => c.k).join(''), onStr = on.cells.map((c) => c.k).join('');
    // 확대 12단 × 두 근(단마다 +xi, −xi): 끈 것은 0.31.0 안내 선의 열린 교차(o)·안내 선 위 커서 자리(a)·끝점(v), 켜면 모두 원 위 교차
    expect(offStr).toBe('ooooooooooooooooaaaavvvv');
    expect(onStr).toBe('o'.repeat(24));
    let n = 0;
    for (let i = 0; i < off.cells.length; i++) {
      const a = off.cells[i]!, b = on.cells[i]!;
      if (JSON.stringify(a.h) === JSON.stringify(b.h)) continue;
      n++;
      expect(b.k).toBe('o');
      expect(['v', 'a']).toContain(a.k);
      expect(a.gapPx).toBeLessThanOrEqual(0.5);
      const h = b.h!;
      expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - RA)).toBeLessThan(1e-9);
      // 안내 선 위(끌어온 점을 지나 기준 선분(장면 float32 꼭짓점)과 나란한 직선)
      const e = h.edge!, ex = e[1][0] - e[0][0], ey = e[1][1] - e[0][1], el = Math.hypot(ex, ey);
      expect(Math.abs((h.point[0] - P[0]) * ey - (h.point[1] - P[1]) * ex) / el).toBeLessThan(1e-9);
      expect(h.trackFrom).toEqual(P);
      expect(h.segment).toMatchObject({ id: '호', index: 12 });
      expect(h.edge![0][0]).toBeCloseTo(turn([-60, -45, 0], ROT)[0], 4);
      expect(h).not.toHaveProperty('direction');
    }
    expect(n).toBeGreaterThan(0);
    for (const c of on.cells) if (c.gapPx <= 0.5) expect(c.k).toBe('o');
    expect(onStr.replace(/o/g, '')).not.toMatch(/v/);
    const n0 = run(false, true), n1 = run(true, true);
    expect(n1.cells.map((c) => c.h)).toEqual(n0.cells.map((c) => c.h));
    // 앱 함수는 기억으로 단마다 몇 번만
    expect(on.calls).toBeLessThanOrEqual(5 * 24);
  });
});
