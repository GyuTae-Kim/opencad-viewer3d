/** 0.9.0 측정 추론 붙잡기: 교차점·수직 발·축(순수 함수)과 커서 둘레 선분 모으기(segmentsNear) */
import { describe, expect, it } from 'vitest';
import { buildBvh } from '../src/bvh';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, worldPerPixel } from '../src/camera';
import { axisSnap, inferenceCandidates, normalizeInference, perpendicularFoot, segmentIntersection } from '../src/inference';
import { segmentsNear } from '../src/scenepick';
import { chooseMeasureSnap } from '../src/snap';
import { boxMesh } from '../src/synth';
import type { LineSet3d } from '../src/types';

const iso = dirToAngles([1, -1, 0.8]);
const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
const at = (p: readonly number[]): [number, number] => {
  const s = projectToScreen(f, p)!;
  return [s[0], s[1]];
};
const bvhs = new Map<Float32Array, ReturnType<typeof buildBvh>>();
const bvh = (kind: 'triangle' | 'segment' | 'point', positions: Float32Array, indices?: Uint32Array) => {
  let b = bvhs.get(positions);
  if (!b) bvhs.set(positions, (b = buildBvh(kind, positions, indices)));
  return b;
};

describe('segmentIntersection', () => {
  it('3D에서 만나는 두 선분의 안쪽 교차점', () => {
    const p = segmentIntersection([-10, 0, 0], [10, 0, 0], [0, -5, 0], [0, 15, 0], 1e-6)!;
    expect(p).not.toBeNull();
    expect(p[0]).toBeCloseTo(0, 12);
    expect(p[1]).toBeCloseTo(0, 12);
    // 비스듬한 3D 선분
    const q = segmentIntersection([0, 0, 0], [10, 10, 10], [10, 0, 0], [0, 10, 10], 1e-6)!;
    expect(q.map((v) => +v.toFixed(9))).toEqual([5, 5, 5]);
  });

  it('엇갈린 선분(허용치보다 멀다)·나란한 선분·선분 밖·끝점에서 만남은 없다', () => {
    expect(segmentIntersection([-10, 0, 0], [10, 0, 0], [0, -5, 1], [0, 15, 1], 0.5)).toBeNull();
    // 허용치 안이면 가장 가까운 두 점의 가운데
    const m = segmentIntersection([-10, 0, 0], [10, 0, 0], [0, -5, 0.4], [0, 15, 0.4], 0.5)!;
    expect(m[2]).toBeCloseTo(0.2, 12);
    expect(segmentIntersection([0, 0, 0], [10, 0, 0], [0, 1, 0], [10, 1, 0], 1)).toBeNull();
    expect(segmentIntersection([0, 0, 0], [10, 0, 0], [5, 0, 0], [20, 0, 0], 1)).toBeNull(); // 한 줄 위 겹침
    expect(segmentIntersection([-10, 0, 0], [10, 0, 0], [20, -5, 0], [20, 5, 0], 1e-6)).toBeNull();
    // T자(한 선분의 끝점이 다른 선분 위): 끝점 붙잡기가 맡는다
    expect(segmentIntersection([-10, 0, 0], [10, 0, 0], [0, 0, 0], [0, 10, 0], 1e-6)).toBeNull();
    // 꺾은선 모서리(끝점 공유)
    expect(segmentIntersection([0, 0, 0], [10, 0, 0], [10, 0, 0], [10, 10, 0], 1e-6)).toBeNull();
  });
});

describe('perpendicularFoot', () => {
  it('선분 안쪽의 수직 발', () => {
    const p = perpendicularFoot([3, 7, 2], [0, 0, 0], [10, 0, 0], 1e-6)!;
    expect(p).toEqual([3, 0, 0]);
  });
  it('발이 선분 밖·끝점·점이 선 위면 없다', () => {
    expect(perpendicularFoot([-3, 7, 0], [0, 0, 0], [10, 0, 0], 1e-6)).toBeNull();
    expect(perpendicularFoot([10, 7, 0], [0, 0, 0], [10, 0, 0], 1e-6)).toBeNull();
    expect(perpendicularFoot([4, 0, 0], [0, 0, 0], [10, 0, 0], 1e-6)).toBeNull();
    expect(perpendicularFoot([4, 3, 0], [0, 0, 0], [0, 0, 0], 1e-6)).toBeNull();
  });
});

describe('axisSnap', () => {
  const A = [0, 0, 0];
  it('축 선 위 점을 화면 붙잡기 거리 안에서 고르고, 그 점은 축 위에 있다', () => {
    for (const [axis, p] of [
      ['x', [30, 0, 0]],
      ['y', [0, 30, 0]],
      ['z', [0, 0, 30]],
    ] as const) {
      const [x, y] = at(p);
      const r = axisSnap(f, A, x + 3, y - 2, 10)!;
      expect(r.axis).toBe(axis);
      const k = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      for (let i = 0; i < 3; i++) if (i !== k) expect(Math.abs(r.p[i]!)).toBeLessThan(1e-9);
      expect(r.p[k]).toBeGreaterThan(20);
      expect(r.distPx).toBeLessThan(4);
    }
  });
  it('축에서 먼 곳·첫 점 자리 둘레는 없다', () => {
    const [x, y] = at([20, 20, 0]);
    expect(axisSnap(f, A, x, y, 10)).toBeNull();
    const [ax, ay] = at(A);
    expect(axisSnap(f, A, ax + 4, ay + 3, 10)).toBeNull();
  });
  it('평행 투영에서도 같다', () => {
    const fo = computeFrame({ ...cam, projection: 'orthographic' }, 600, 400, { center: [0, 0, 0], radius: 60 });
    const s = projectToScreen(fo, [0, 0, 25])!;
    const r = axisSnap(fo, A, s[0] + 2, s[1], 10)!;
    expect(r.axis).toBe('z');
    expect(r.p[2]).toBeCloseTo(25, 0);
  });
});

describe('normalizeInference', () => {
  it('true면 0.9.0의 셋 모두(0.10.0 나란함·잠금은 끔), 아무것도 켜지 않으면 null', () => {
    expect(normalizeInference(true)).toEqual({ intersections: true, perpendicular: true, axes: true, parallel: false, lock: false });
    expect(normalizeInference({ axes: true })).toEqual({ intersections: false, perpendicular: false, axes: true, parallel: false, lock: false });
    expect(normalizeInference({})).toBeNull();
    expect(normalizeInference(false)).toBeNull();
    expect(normalizeInference(null)).toBeNull();
  });
});

describe('segmentsNear + inferenceCandidates', () => {
  // 상자 윗면(z = 20) 위에 X자로 엇갈린 선분 둘, 원점을 둔 묶음(큰 좌표 꼴)
  const cross: LineSet3d = { id: '엇갈림', positions: new Float32Array([-20, -20, 20, 20, 20, 20, -20, 20, 20, 20, -20, 20]) };
  const off: LineSet3d = { ...cross, id: '엇갈림 원점', origin: [1e6, -5e5, 0], positions: cross.positions };
  const box = boxMesh('상자', [-20, -20, -20], [20, 20, 20], [0.7, 0.7, 0.7, 1]);
  const items = { meshes: [box], lines: [cross], points: [] };
  it('커서 둘레 두 선분의 교차점(세계 좌표)을 후보로 낸다', () => {
    const [x, y] = at([0, 0, 20]);
    const segs = segmentsNear(f, x + 4, y + 3, items, { bvh }, 10);
    expect(segs.map((s) => s.id)).toEqual(['엇갈림', '엇갈림']);
    const c = inferenceCandidates(
      segs.map((s) => ({ ...s, wpp: worldPerPixel(f, s.depth) })),
      null,
      { intersections: true, perpendicular: false, axes: false },
    );
    expect(c).toHaveLength(1);
    expect(c[0]!.kind).toBe('intersection');
    expect(c[0]!.p.map((v) => +v.toFixed(6))).toEqual([0, 0, 20]);
    // 고르기 결과와 함께: 교차점이 화면에서 가장 가까우면 붙잡는다
    const r = chooseMeasureSnap(f, x + 4, y + 3, 10, null, c, () => true)!;
    expect(r.kind).toBe('intersection');
  });
  it('묶음 원점이 있으면 원점을 더한 세계 좌표로', () => {
    const fo = computeFrame({ ...cam, target: [1e6, -5e5, 0] }, 600, 400, { center: [1e6, -5e5, 0], radius: 60 });
    const s = projectToScreen(fo, [1e6, -5e5, 20])!;
    const segs = segmentsNear(fo, s[0] + 2, s[1] - 2, { meshes: [], lines: [off], points: [] }, { bvh }, 10);
    expect(segs).toHaveLength(2);
    const c = inferenceCandidates(
      segs.map((q) => ({ ...q, wpp: worldPerPixel(fo, q.depth) })),
      null,
      { intersections: true, perpendicular: false, axes: false },
    );
    expect(c[0]!.p[0]).toBeCloseTo(1e6, 6);
    expect(c[0]!.p[1]).toBeCloseTo(-5e5, 6);
    expect(c[0]!.p[2]).toBeCloseTo(20, 6);
  });
  it('그물 윤곽선은 edges일 때만, 첫 점에서 내린 수직 발', () => {
    // 상자 윗면 앞 모서리(y = −20, z = 20) 위 x = 5 가까이
    const [x, y] = at([5, -20, 20]);
    const none = segmentsNear(f, x, y, { meshes: [box], lines: [], points: [] }, { bvh }, 10);
    expect(none).toHaveLength(0);
    const segs = segmentsNear(f, x, y, { meshes: [box], lines: [], points: [] }, { bvh, edges: true }, 10);
    expect(segs.length).toBeGreaterThan(0);
    const c = inferenceCandidates(
      segs.map((s) => ({ ...s, wpp: worldPerPixel(f, s.depth) })),
      [5, -50, 20],
      { intersections: false, perpendicular: true, axes: false },
    );
    const foot = c.find((q) => q.kind === 'perpendicular')!;
    expect(foot.id).toBe('상자');
    expect(foot.p.map((v) => +v.toFixed(9))).toEqual([5, -20, 20]);
  });
  it('단면에 잘린 쪽의 교차점은 뺀다(keep)', () => {
    const [x, y] = at([0, 0, 20]);
    // x > −5 쪽을 잘라 낸다: 교차점(0, 0, 20)은 잘린 쪽
    const segs = segmentsNear(f, x, y, items, { bvh, clip: [1, 0, 0, 5] }, 40);
    const c = inferenceCandidates(
      segs.map((s) => ({ ...s, wpp: worldPerPixel(f, s.depth) })),
      null,
      { intersections: true, perpendicular: false, axes: false },
    );
    expect(c).toHaveLength(0);
    // 반대쪽(x < −5를 잘라 냄 — 교차점은 남는 쪽)이면 있다
    const kept = segmentsNear(f, x, y, items, { bvh, clip: [-1, 0, 0, -5] }, 40);
    expect(inferenceCandidates(kept.map((s) => ({ ...s, wpp: worldPerPixel(f, s.depth) })), null, { intersections: true, perpendicular: false, axes: false })).toHaveLength(1);
  });
});
