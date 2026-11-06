/**
 * 0.40.0 아주 가까이 확대한 꺾은선 토막의 교차(MeasureSnapOptions.openEdgeLens — track.ts lensEdgeSnap·piercedEdgeCandidates·lineScreenGap,
 * pick.ts segmentCandidates·scenepick.ts segmentsNear의 chord, bvh.ts queryCone의 grow):
 * 처짐이 화면에서 붙잡기 거리보다 커지도록 확대하면 현이 커서에서 붙잡기 거리 밖이라 커서 둘레 선분이 아니게 되고(0.35.0 남은 한계),
 * 선이 현을 가로지르는 자리도 커서에서 멀다. 0.23.0 받는 범위(현에서 0.1 × 토막 길이 안)의 띠가 커서에 닿는 토막을 따로 모아 그 활꼴의 열린 교차와
 * 가로지르는 자리를 힌트로 한 교차를 앱에 묻는다.
 * - 순수: 띠로 모으기(BVH 있이·없이 같음), 가로지르는 자리가 먼 교차 후보, 선의 화면 거리, lensEdgeSnap
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 12토막 원 꼭대기 활꼴을 지나는 첫 점 X축(1화소 0.02·0.005 — 현이 커서에서 26·104화소),
 *   아래 토막 현을 가로지르는 첫 점 X축(가로지르는 자리가 근에서 79화소), 잠근 X축, 앱이 null이면 그대로, 곧은 변과 나란한 축은 그대로·호출 한 번
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { buildBvh } from '../src/bvh';
import { type CameraState, computeFrame, defaultCamera, projectToScreen, viewDepth, worldPerPixel } from '../src/camera';
import { segmentCandidates } from '../src/pick';
import { LENS_SEGMENTS, OPEN_EDGE_CHORD, lensEdgeSnap, lineScreenGap, openEdgeCandidates, piercedEdgeCandidates } from '../src/track';
import { OPEN_REFINE_CALLS, type SnapRefineInput } from '../src/snap';
import { type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { LineSet3d, Scene3d } from '../src/types';

const D = Math.PI / 180;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const SNAP = 10;
const R = 30;
/** 직선(o, d — z 0 평면)과 원(중심 0, 반지름 30)의 교차 가운데 near에 가까운 근 */
function circleRoot(o: readonly number[], d: readonly number[], near: readonly number[]): V3 | null {
  const A = d[0]! * d[0]! + d[1]! * d[1]!, B = o[0]! * d[0]! + o[1]! * d[1]!, C = o[0]! * o[0]! + o[1]! * o[1]! - R * R;
  const disc = B * B - A * C;
  if (!(A > 1e-12) || disc < 0) return null;
  const qs = [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A].map((s): V3 => [o[0]! + d[0]! * s, o[1]! + d[1]! * s, o[2]! + d[2]! * s]);
  return dist(qs[0]!, near) <= dist(qs[1]!, near) ? qs[0]! : qs[1]!;
}
/** 12토막 원(z 0) — 꼭짓점 각 a0 + 30°·k */
const ringV = (a0: number, k: number): V3 => [R * Math.cos((a0 + 30 * k) * D), R * Math.sin((a0 + 30 * k) * D), 0];
const ringLines = (id: string, a0: number): LineSet3d => ({
  id,
  positions: new Float32Array(Array.from({ length: 12 }, (_, k) => [...ringV(a0, k), ...ringV(a0, k + 1)]).flat()),
  segmentIds: new Uint32Array(Array.from({ length: 12 }, (_, k) => 100 + k)),
});
/** 위에서 본 평행 투영(1화소 = w, 가운데 c) */
function topFrame(c: V3, w: number) {
  const cam: CameraState = { ...defaultCamera(), yaw: 0, pitch: Math.PI / 2 - 1e-9, target: c, distance: 100, projection: 'orthographic' };
  const f0 = computeFrame(cam, 800, 600, { center: [0, 0, 0], radius: 50 });
  const w0 = worldPerPixel(f0, viewDepth(f0, c));
  return computeFrame({ ...cam, distance: (100 * w) / w0 }, 800, 600, { center: [0, 0, 0], radius: 50 });
}

// ───────────── 순수 함수 ─────────────
describe('띠로 모으기(segmentCandidates·segmentsNear chord — 0.40.0)', () => {
  const f = topFrame([0, 0, 0], 0.1);
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  // 긴 토막(길이 100 — 띠 10 = 100화소)이 커서에서 50화소, 같은 길이 토막이 300화소, 짧은 토막(길이 4 — 띠 0.4 = 4화소)이 30화소
  const P = new Float32Array([-50, 5, 0, 50, 5, 0, -50, 30, 0, 50, 30, 0, -2, -3, 0, 2, -3, 0]);
  const [x, y] = at([0, 0, 0]);

  it('chord 없이는 커서 붙잡기 거리 안 선분만, chord 0.1이면 띠가 닿는 긴 토막도(bandPx 0) — BVH 있이·없이 같다', () => {
    expect(f.pixelConst).toBeCloseTo(0.1, 9);
    expect(segmentCandidates(f, P, null, null, x, y, SNAP)).toEqual([]);
    for (const bvh of [null, buildBvh('segment', P)]) {
      const hs = segmentCandidates(f, P, bvh, null, x, y, SNAP, { chord: OPEN_EDGE_CHORD });
      expect(hs.map((h) => h.index)).toEqual([0]);
      expect(hs[0]!.distPx).toBeCloseTo(50, 6);
      expect(hs[0]!.bandPx).toBe(0);
    }
  });

  it('행렬이 걸린 선분(2배 축척)도 띠를 세계 길이로 잰다', () => {
    const half = new Float32Array(Array.from(P, (v) => v / 2));
    const M = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
    const hs = segmentCandidates(f, half, buildBvh('segment', half), M, x, y, SNAP, { chord: OPEN_EDGE_CHORD });
    expect(hs.map((h) => h.index)).toEqual([0]);
  });
});

describe('가로지르는 자리가 먼 교차·선의 화면 거리·lensEdgeSnap(0.40.0)', () => {
  // 꼭짓점 0° + 30°·k 원의 토막 9(270° → 300°, 현 (0, −30) → (15, −25.98))를 첫 점 X축 y = −29가 가로지른다:
  // 가로지르는 자리 X = (3.73, −29), 원 위 근 Q = (7.68, −29) — 1화소 0.05에서 79화소
  const from: V3 = [-40, -29, 0];
  const lines = [{ from, dir: [1, 0, 0] as V3 }];
  const Q: V3 = [Math.sqrt(900 - 29 * 29), -29, 0];
  const f = topFrame(Q, 0.05);
  const wpp = worldPerPixel(f, viewDepth(f, Q));
  const segs = Array.from({ length: 12 }, (_, k) => ({ a: ringV(0, k), b: ringV(0, k + 1), wpp }));
  const S9 = segs[9]!;
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const [qx, qy] = at(Q);

  it('근 둘레를 가리키면 토막 9 후보 하나(p = 가로지르는 자리, 커서에서 붙잡기 거리 밖, reachPx는 커서와 선의 거리) — 열린 교차 후보(0.20.0)는 없다', () => {
    const cs = piercedEdgeCandidates(f, lines, segs, qx + 1, qy + 2, SNAP);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.seg).toBe(S9);
    expect(cs[0]!.p[1]).toBeCloseTo(-29, 9);
    expect(cs[0]!.p[0]).toBeCloseTo(15 * (1 / (30 - 25.980762)) * 1, 1);
    expect(cs[0]!.distPx).toBeGreaterThan(70);
    expect(cs[0]!.reachPx).toBeLessThanOrEqual(2 + 1e-6);
    expect(openEdgeCandidates(f, lines, segs, qx + 1, qy + 2, SNAP)).toEqual([]);
  });

  it('가로지르는 자리가 커서에서 붙잡기 거리 안이면(코어 교차가 맡는다)·선에서 그 토막 범위인 조각이 커서에서 멀면 없다', () => {
    const [cx, cy] = at(piercedEdgeCandidates(f, lines, segs, qx, qy, SNAP)[0]!.p);
    expect(piercedEdgeCandidates(f, lines, segs, cx + 2, cy + 1, SNAP)).toEqual([]);
    // 근에서 선을 따라 4(80화소) 더 오른쪽 — 토막 9 범위 조각(현에서 0.1 × 15.5 = 1.55 안)은 x ≤ 3.73 + 6 남짓
    const [fx, fy] = at([Q[0] + 4, -29, 0]);
    expect(piercedEdgeCandidates(f, lines, segs, fx, fy + 1, SNAP)).toEqual([]);
  });

  it('lineScreenGap: 커서와 화면에 비춘 선의 거리', () => {
    expect(lineScreenGap(f, from, [1, 0, 0], qx + 3, qy + 4)).toBeCloseTo(4, 6);
    expect(lineScreenGap(f, from, [0, 0, 0], qx, qy)).toBe(Infinity);
  });

  it('lensEdgeSnap: 앱 근을 받는다(토막 9 곡선 조각·커서 붙잡기 거리 안), 앱이 null이면 없다', () => {
    const asks: V3[] = [];
    const refine = (c: { p: V3 }): V3 | null => {
      asks.push(c.p);
      return circleRoot(from, [1, 0, 0], c.p);
    };
    const r = lensEdgeSnap(f, lines, segs, [], qx + 1, qy + 2, SNAP, refine);
    expect(r).not.toBeNull();
    expect(r!.seg).toBe(S9);
    expect(dist(r!.p, Q)).toBeLessThan(1e-9);
    expect(asks).toHaveLength(1);
    expect(lensEdgeSnap(f, lines, segs, [], qx + 1, qy + 2, SNAP, () => null)).toBeNull();
  });

  it('LENS_SEGMENTS는 커서 둘레 선분 한도와 같은 24', () => {
    expect(LENS_SEGMENTS).toBe(24);
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

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const hoverXY = (w: View, x: number, y: number): void => {
  ptr(w, 'pointermove', x, y, 0);
  w.v.renderNow();
};
const INF = { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true, axisFaces: true, lockEdges: true, lockFaces: true } as const;
/** first(앱 점)을 첫 점으로 찍고 위에서 c 둘레를 1화소 = w로(zoomToRect) */
function view(scene: Scene3d, first: V3, opts: MeasureSnapOptions, c: V3, w: number): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  const vw: View = { v, canvas: v.canvas as unknown as FakeElement };
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setMeasureMode(true);
  v.setMeasureSnap({ points: [{ point: first, kind: 'point' }], inference: INF, ...opts });
  v.renderNow();
  const s0 = at(vw, first);
  hoverXY(vw, s0.x + 1, s0.y);
  ptr(vw, 'pointerdown', s0.x + 1, s0.y, 1);
  ptr(vw, 'pointerup', s0.x + 1, s0.y, 0);
  v.renderNow();
  expect(v.measurePoints[0]!.point).toEqual(first);
  const hw = 400 * w;
  const p = v.project([c[0] - hw, c[1] - 0.75 * hw, 0])!, q = v.project([c[0] + hw, c[1] + 0.75 * hw, 0])!;
  v.zoomToRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y), false);
  v.renderNow();
  return vw;
}
/** 앱 refine: 원 토막과 같은 평면(z 0)의 직선이면 point에 가까운 원 위 근(곧은 선분 묶음은 null) — 부른 수를 센다 */
function counted(ids: string[]): { refine: NonNullable<MeasureSnapOptions['refine']>; calls: SnapRefineInput[] } {
  const calls: SnapRefineInput[] = [];
  return {
    calls,
    refine: (c) => {
      calls.push(c);
      return c.kind !== 'axisEdge' || !c.line || !ids.includes(c.segment.id) || Math.abs(c.line.dir[2]) > 1e-12 || Math.abs(c.line.origin[2]) > 1e-9 ? null : circleRoot(c.line.origin, c.line.dir, c.point);
    },
  };
}

describe('Viewer3d: 꼭대기 활꼴을 지나는 첫 점 X축(0.35.0 남은 한계 — 현이 커서에서 붙잡기 거리 밖)', () => {
  // 꼭짓점 15° + 30°·k 원: 꼭대기 토막(75° → 105°) 현 y = 28.98, 첫 점 X축 y = 29.5(틈 0.52), 두 근 x = ±√(900 − 29.5²)
  const RING: Scene3d = { name: 'r', units: 'mm', meshes: [], lines: [ringLines('원', 15)], points: [] };
  const A0: V3 = [-40, 29.5, 0];
  const XI = Math.sqrt(900 - 29.5 * 29.5);

  for (const w of [0.02, 0.005])
    it(`1화소 ${w}(틈 ${Math.round(0.52 / w)}화소): 끄면 축 위 커서 자리, 켜면 두 근 둘레가 원 위 교차(꼭대기 토막·다듬음)이고 새 호출은 미리 보기 한 번 한도 안`, () => {
      for (const sgn of [-1, 1]) {
        const Q: V3 = [sgn * XI, 29.5, 0];
        const off = counted(['원']);
        const w0 = view(RING, A0, { refine: off.refine }, Q, w);
        const s0 = at(w0, Q);
        hoverXY(w0, s0.x + 1, s0.y + 2);
        expect(w0.v.measureHoverSnap!.snap).toBe('axis');
        expect(w0.v.measureHoverSnap).not.toHaveProperty('refined');
        w0.v.dispose();
        const on = counted(['원']);
        const w1 = view(RING, A0, { refine: on.refine, openEdgeLens: true }, Q, w);
        const s = at(w1, Q);
        for (const [dx, dy] of [
          [1, 2],
          [-3, -4],
          [5, 1],
        ] as const) {
          const n0 = on.calls.length;
          hoverXY(w1, s.x + dx, s.y + dy);
          expect(on.calls.length - n0).toBeLessThanOrEqual(OPEN_REFINE_CALLS);
          const h = w1.v.measureHoverSnap!;
          expect(h, `${sgn} ${dx},${dy}`).toMatchObject({ snap: 'axis', axis: 'x', refined: true, segment: { id: '원', index: 102 } });
          expect(dist(h.point, Q)).toBeLessThan(1e-9);
        }
        expect(on.calls.every((c) => c.kind === 'axisEdge' && c.open === true)).toBe(true);
        // 찍은 둘째 점도 그 근
        ptr(w1, 'pointerdown', s.x + 1, s.y + 2, 1);
        ptr(w1, 'pointerup', s.x + 1, s.y + 2, 0);
        w1.v.renderNow();
        expect(dist(w1.v.measurePoints[1]!.point, Q)).toBeLessThan(1e-9);
        w1.v.dispose();
      }
    });

  it('잠근 X축(lockEdges)도 같다 — 잠근 선 위 점(locked)에 토막·다듬음', () => {
    const Q: V3 = [XI, 29.5, 0];
    const on = counted(['원']);
    const w1 = view(RING, A0, { refine: on.refine, openEdgeLens: true }, Q, 0.01);
    w1.v.setMeasureInferenceLock('x');
    const s = at(w1, Q);
    hoverXY(w1, s.x + 1, s.y + 2);
    const h = w1.v.measureHoverSnap!;
    expect(h).toMatchObject({ locked: true, refined: true, segment: { id: '원', index: 102 } });
    expect(dist(h.point, Q)).toBeLessThan(1e-9);
    w1.v.dispose();
  });

  it('앱이 null을 주면 켜도 축 위 커서 자리, refine 없이 이 선택만 주면 다듬은 점이 없다', () => {
    const Q: V3 = [XI, 29.5, 0];
    const w1 = view(RING, A0, { refine: () => null, openEdgeLens: true }, Q, 0.01);
    const s = at(w1, Q);
    hoverXY(w1, s.x + 1, s.y + 2);
    expect(w1.v.measureHoverSnap!.snap).toBe('axis');
    expect(w1.v.measureHoverSnap).not.toHaveProperty('refined');
    w1.v.setMeasureSnap({ points: [{ point: A0, kind: 'point' }], inference: INF, openEdgeLens: true });
    hoverXY(w1, s.x + 1.3, s.y + 2);
    expect(w1.v.measureHoverSnap).not.toHaveProperty('refined');
    w1.v.dispose();
  });
});

describe('Viewer3d: 아래 토막 현을 가로지르는 자리가 근에서 먼 첫 점 X축(가로지르는 자리를 힌트로)', () => {
  // 꼭짓점 0° + 30°·k 원: 토막 9(270° → 300°)를 첫 점 X축 y = −29가 X = (3.73, −29)에서 가로지르고 원과는 Q = (7.68, −29)에서 만난다
  const RING: Scene3d = { name: 'r', units: 'mm', meshes: [], lines: [ringLines('원', 0)], points: [] };
  const A0: V3 = [-40, -29, 0];
  const Q: V3 = [Math.sqrt(900 - 29 * 29), -29, 0];

  it('1화소 0.05(X와 Q 사이 79화소): 끄면 축 위 커서 자리, 켜면 Q(토막 9·다듬음 — 앱에 가로지르는 자리를 힌트로 한 번 묻는다)', () => {
    const off = counted(['원']);
    const w0 = view(RING, A0, { refine: off.refine }, Q, 0.05);
    const s0 = at(w0, Q);
    hoverXY(w0, s0.x + 1, s0.y + 2);
    expect(w0.v.measureHoverSnap!.snap).toBe('axis');
    expect(w0.v.measureHoverSnap).not.toHaveProperty('refined');
    w0.v.dispose();
    const on = counted(['원']);
    const w1 = view(RING, A0, { refine: on.refine, openEdgeLens: true }, Q, 0.05);
    const s = at(w1, Q);
    hoverXY(w1, s.x + 1, s.y + 2);
    const h = w1.v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'axis', axis: 'x', refined: true, segment: { id: '원', index: 109 } });
    expect(dist(h.point, Q)).toBeLessThan(1e-9);
    const hint = on.calls.find((c) => c.open && c.segment.index === 109)!;
    expect(hint.point[1]).toBeCloseTo(-29, 9);
    expect(hint.point[0]).toBeCloseTo(15 / (30 - 25.980762), 4);
    w1.v.dispose();
  });
});

describe('Viewer3d: 곧은 변과 나란히 띠 안을 지나는 축(헛 호출)', () => {
  // 길이 180 곧은 변(띠 18) 위 1을 나란히 지나는 첫 점 X축. 앱은 곧은 선분에 null. 맞춰 보기에 첫 점이 들도록 먼 짧은 선분을 하나 둔다
  const SCENE: Scene3d = {
    name: 's',
    units: 'mm',
    meshes: [],
    lines: [
      { id: '변', positions: new Float32Array([-90, 0, 0, 90, 0, 0]), segmentIds: new Uint32Array([7]) },
      { id: '참고', positions: new Float32Array([-140, -30, 0, -138, 30, 0]) },
    ],
    points: [],
  };
  const A0: V3 = [-130, 1, 0];

  it('켜도 축 위 커서 자리, 앱 호출은 그 변 하나(기억 — 다시 묻지 않는다)', () => {
    const on = counted([]);
    const w1 = view(SCENE, A0, { refine: on.refine, openEdgeLens: true }, [0, 1, 0], 0.02);
    const s = at(w1, [0, 1, 0]);
    for (const dx of [0, 6, -9, 14]) {
      hoverXY(w1, s.x + dx + 0.3, s.y - 2);
      expect(w1.v.measureHoverSnap!.snap).toBe('axis');
      expect(w1.v.measureHoverSnap).not.toHaveProperty('refined');
    }
    expect(on.calls.length).toBeGreaterThanOrEqual(1);
    expect(on.calls.length).toBeLessThanOrEqual(3);
    expect(on.calls.every((c) => c.open && c.segment.index === 7)).toBe(true);
    w1.v.dispose();
  });
});
