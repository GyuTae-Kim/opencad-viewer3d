/**
 * 0.10.0 측정 추론 보완(순수 함수): 나란함(parallelSnap), 잠금(lockedSnap·lockFromSnap·axisLock), 축 붙잡기 식을 함께 쓰도록 나눈 뒤에도
 * 0.9.1 axisSnap과 값이 같은지, 측정 결과의 방향·잠금 필드, pointsFor 다시 쓰기의 같은 고르기 판정(samePick)
 */
import { describe, expect, it } from 'vitest';
import { type CameraState, type ViewFrame, computeFrame, defaultCamera, dirToAngles, projectToScreen, screenRay } from '../src/camera';
import {
  type SnapAxis,
  axisAligned,
  axisLock,
  axisSnap,
  inferenceCandidates,
  lockFromSnap,
  lockedSnap,
  normalizeInference,
  parallelSnap,
  rayLinePoint,
  unitDir,
} from '../src/inference';
import type { V3 } from '../src/math';
import { chooseMeasureSnap, measureResult, samePick } from '../src/snap';
import type { Pick3d } from '../src/types';

const iso = dirToAngles([1, -1, 0.8]);
const frames: [string, ViewFrame, V3][] = [];
for (const projection of ['perspective', 'orthographic'] as const)
  for (const target of [
    [0, 0, 0],
    [1e6, -5e5, 1e4],
  ] as V3[]) {
    const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target, distance: 200, projection };
    frames.push([`${projection} ${target[0]}`, computeFrame(cam, 600, 400, { center: target, radius: 60 }), target]);
  }

const add = (a: readonly number[], e: readonly number[], t: number): V3 => [a[0]! + e[0]! * t, a[1]! + e[1]! * t, a[2]! + e[2]! * t];
/** 점 p에서 선 a + t·e(단위)까지 거리 */
const lineDist = (p: readonly number[], a: readonly number[], e: readonly number[]): number => {
  const t = (p[0]! - a[0]!) * e[0]! + (p[1]! - a[1]!) * e[1]! + (p[2]! - a[2]!) * e[2]!;
  const q = add(a, e, t);
  return Math.hypot(p[0]! - q[0], p[1]! - q[1], p[2]! - q[2]);
};

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 0.9.1 axisSnap 그대로(나눈 식과 값이 같은지 견준다) */
function axisSnap091(f: ViewFrame, a: readonly number[], x: number, y: number, snapPx: number): { p: V3; axis: SnapAxis; distPx: number } | null {
  const AXES: readonly [SnapAxis, V3][] = [
    ['x', [1, 0, 0]],
    ['y', [0, 1, 0]],
    ['z', [0, 0, 1]],
  ];
  const sa = projectToScreen(f, a);
  if (sa && Math.hypot(sa[0] - x, sa[1] - y) <= snapPx) return null;
  const ray = screenRay(f, x, y);
  const o = ray.origin, d = ray.dir;
  const w0x = a[0]! - o[0], w0y = a[1]! - o[1], w0z = a[2]! - o[2];
  const ee = d[0] * w0x + d[1] * w0y + d[2] * w0z;
  let best: { p: V3; axis: SnapAxis; distPx: number } | null = null;
  for (const [axis, e] of AXES) {
    const b = e[0] * d[0] + e[1] * d[1] + e[2] * d[2];
    const den = 1 - b * b;
    if (den < 1e-6) continue;
    const dd = e[0] * w0x + e[1] * w0y + e[2] * w0z;
    const t = (b * ee - dd) / den;
    const p: V3 = [a[0]! + e[0] * t, a[1]! + e[1] * t, a[2]! + e[2] * t];
    const s = projectToScreen(f, p);
    if (!s || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) continue;
    if (f.projection === 'perspective' && s[2] < f.near * 0.999) continue;
    const dist = Math.hypot(s[0] - x, s[1] - y);
    if (dist <= snapPx && (!best || dist < best.distPx)) best = { p, axis, distPx: dist };
  }
  return best;
}

describe('axisSnap(식을 rayLinePoint로 나눈 뒤)', () => {
  for (const [name, f, tg] of frames)
    it(`0.9.1과 값이 똑같다(${name})`, () => {
      const r = rng(9);
      const c = tg;
      let hits = 0;
      for (let k = 0; k < 3000; k++) {
        const a: V3 = [c[0] + (r() - 0.5) * 80, c[1] + (r() - 0.5) * 80, c[2] + (r() - 0.5) * 80];
        const x = r() * 600, y = r() * 400;
        const want = axisSnap091(f, a, x, y, 10);
        expect(axisSnap(f, a, x, y, 10)).toEqual(want);
        if (want) hits++;
      }
      // 축 위 커서(맞는 경우도 충분히)
      for (let k = 0; k < 300; k++) {
        const a: V3 = [c[0] + (r() - 0.5) * 60, c[1] + (r() - 0.5) * 60, c[2] + (r() - 0.5) * 60];
        const s = projectToScreen(f, add(a, [[1, 0, 0], [0, 1, 0], [0, 0, 1]][k % 3]!, 15 + r() * 20));
        if (!s) continue;
        const want = axisSnap091(f, a, s[0] + 2, s[1] - 1, 10);
        expect(axisSnap(f, a, s[0] + 2, s[1] - 1, 10)).toEqual(want);
        if (want) hits++;
      }
      expect(hits).toBeGreaterThan(200);
    });
});

describe('rayLinePoint·unitDir·axisAligned', () => {
  it('선 위 점과 광선을 잇는 선이 둘 모두에 수직이다. 나란하면 null', () => {
    const o = [0, 0, 10], d = unitDir([0, 0, 0], [1, 2, -3])!;
    const a = [5, -4, 2], e = unitDir([0, 0, 0], [2, -1, 0.5])!;
    const p = rayLinePoint(o, d, a, e)!;
    expect(lineDist(p, a, e)).toBeLessThan(1e-12);
    // 광선 위 가장 가까운 점
    const s = (p[0] - o[0]!) * d[0] + (p[1] - o[1]!) * d[1] + (p[2] - o[2]!) * d[2];
    const q = add(o, d, s);
    const w = [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
    expect(Math.abs(w[0]! * d[0] + w[1]! * d[1] + w[2]! * d[2])).toBeLessThan(1e-12);
    expect(Math.abs(w[0]! * e[0] + w[1]! * e[1] + w[2]! * e[2])).toBeLessThan(1e-12);
    expect(rayLinePoint(o, d, a, d)).toBeNull();
  });
  it('길이 0은 방향 없음, 축과 거의 나란한지', () => {
    expect(unitDir([1, 2, 3], [1, 2, 3])).toBeNull();
    expect(unitDir([0, 0, 0], [0, 3, 4])).toEqual([0, 0.6, 0.8]);
    expect(axisAligned([0, 0, -1])).toBe(true);
    expect(axisAligned(unitDir([0, 0, 0], [1, 1e-4, 0])!)).toBe(true);
    expect(axisAligned(unitDir([0, 0, 0], [1, 0.01, 0])!)).toBe(false);
  });
});

describe('parallelSnap(나란함)', () => {
  const ref: [V3, V3] = [
    [-20, 30, 5],
    [10, 45, 5],
  ];
  const e = unitDir(ref[0], ref[1])!;
  for (const [name, f, tg] of frames)
    it(`첫 점에서 기준 선분과 나란한 선 위(${name})`, () => {
      const a = tg.map((v, i) => v + [-15, -10, 0][i]!) as V3;
      const want = add(a, e, 35);
      const s = projectToScreen(f, want)!;
      const r = parallelSnap(f, a, ref, s[0] + 3, s[1] - 2, 10, true)!;
      expect(r).not.toBeNull();
      expect(r.direction).toEqual(e);
      expect(lineDist(r.p, a, e)).toBeLessThan(1e-9 * (1 + Math.abs(a[0])));
      expect(r.distPx).toBeLessThanOrEqual(10);
      // 선에서 먼 커서·첫 점 둘레는 없다
      expect(parallelSnap(f, a, ref, s[0] + 40, s[1] + 40, 10, true)).toBeNull();
      const sa = projectToScreen(f, a)!;
      expect(parallelSnap(f, a, ref, sa[0] + 4, sa[1], 10, true)).toBeNull();
      // 축과 나란한 기준 선분은 skipAxes면 축 붙잡기에 맡긴다
      const xRef: [V3, V3] = [
        [0, 0, 0],
        [30, 0, 0],
      ];
      const sx = projectToScreen(f, add(a, [1, 0, 0], 30))!;
      expect(parallelSnap(f, a, xRef, sx[0] + 2, sx[1], 10, true)).toBeNull();
      expect(parallelSnap(f, a, xRef, sx[0] + 2, sx[1], 10, false)!.direction).toEqual([1, 0, 0]);
      // 길이 0 기준 선분
      expect(parallelSnap(f, a, [ref[0], ref[0]], s[0], s[1], 10, true)).toBeNull();
    });
});

describe('lockedSnap·lockFromSnap·axisLock(잠금)', () => {
  for (const [name, f, tg] of frames)
    it(`잠근 선 위에만 찍는다(${name})`, () => {
      const a = tg.map((v, i) => v + [10, -5, 0][i]!) as V3;
      const e: V3 = [0, 0, 1];
      // 붙잡은 점이 있으면 그 점을 선에 수직으로 내린 자리(높이만 옮겨 온다)
      const q: V3 = [a[0] + 30, a[1] - 20, a[2] + 17];
      const r = lockedSnap(f, a, e, 0, 0, q)!;
      expect(r.p[0]).toBe(a[0]);
      expect(r.p[1]).toBe(a[1]);
      expect(r.p[2]).toBeCloseTo(a[2] + 17, 6);
      expect(r.from).toEqual(q);
      // 이미 선 위인 점은 옮겨 오지 않는다(from 없음)
      expect(lockedSnap(f, a, e, 0, 0, add(a, e, 12))).toEqual({ p: add(a, e, 12) });
      // 붙잡은 점이 없으면 커서 광선에 가장 가까운 선 위 점 — 커서가 선에서 멀어도(붙잡기 거리 제한 없음)
      const s = projectToScreen(f, add(a, e, 25))!;
      for (const dx of [0, 30, 120]) {
        const g = lockedSnap(f, a, e, s[0] + dx, s[1], null)!;
        expect(g).not.toBeNull();
        expect(g.from).toBeUndefined();
        expect(lineDist(g.p, a, e)).toBeLessThan(1e-9 * (1 + Math.abs(a[0])));
        if (dx === 0) expect(g.p[2]).toBeCloseTo(a[2] + 25, 3);
      }
    });

  it('미리 보기에서 잠글 방향: 축·나란함·수직만(방향이 있을 때)', () => {
    expect(axisLock('y')).toEqual({ kind: 'axis', axis: 'y', direction: [0, 1, 0] });
    expect(lockFromSnap({ kind: 'axis', axis: 'z', direction: [0, 0, 1] })).toEqual(axisLock('z'));
    const edge: [V3, V3] = [
      [0, 0, 0],
      [3, 4, 0],
    ];
    expect(lockFromSnap({ kind: 'parallel', direction: [0.6, 0.8, 0], edge })).toEqual({ kind: 'parallel', direction: [0.6, 0.8, 0], edge });
    expect(lockFromSnap({ kind: 'perpendicular', direction: [0, 1, 0] })).toEqual({ kind: 'perpendicular', direction: [0, 1, 0] });
    expect(lockFromSnap({ kind: 'vertex', direction: [0, 1, 0] })).toBeNull();
    expect(lockFromSnap({ kind: 'parallel' })).toBeNull();
    expect(lockFromSnap({ kind: 'axis', direction: [1, 0, 0] })).toBeNull();
    expect(lockFromSnap(null)).toBeNull();
  });
});

describe('측정 결과·고르기 결과의 0.10.0 필드', () => {
  it('방향·잠금은 있을 때만 싣고, 없으면 0.9.1 꼴 그대로', () => {
    const a: V3 = [0, 0, 0], b: V3 = [0, 0, 5];
    const old = measureResult(a, b, [{ kind: 'vertex' }, { kind: 'axis', axis: 'z' }]);
    expect(old).toEqual({ a, b, distance: 5, dx: 0, dy: 0, dz: 5, snapA: 'vertex', snapB: 'axis', axisB: 'z' });
    expect('directionB' in old || 'lockedB' in old).toBe(false);
    const dir: V3 = [0, 0, 1];
    const m = measureResult(a, b, [{ kind: 'vertex' }, { kind: 'axis', axis: 'z', direction: dir, locked: true }]);
    expect(m.directionB).toEqual([0, 0, 1]);
    expect(m.directionB).not.toBe(dir);
    expect(m.lockedB).toBe(true);
    expect(m.axisB).toBe('z');
    expect('directionA' in m || 'lockedA' in m).toBe(false);
    const p = measureResult(a, [3, 4, 0], [{ kind: 'endpoint' }, { kind: 'parallel', direction: [0.6, 0.8, 0] }]);
    expect(p.snapB).toBe('parallel');
    expect(p.directionB).toEqual([0.6, 0.8, 0]);
    expect('axisB' in p).toBe(false);
  });

  it('chooseMeasureSnap은 선분이 있는 후보(수직 발)만 edge를 넘긴다', () => {
    const [, f, tg] = frames[0]!;
    const p: V3 = [...tg] as V3;
    const s = projectToScreen(f, p)!;
    const edge: [V3, V3] = [
      [p[0] - 5, p[1], p[2]],
      [p[0] + 5, p[1], p[2]],
    ];
    const vis = (): boolean => true;
    expect(chooseMeasureSnap(f, s[0], s[1], 10, null, [{ p, kind: 'center' }], vis)).toEqual({ p, vertex: true, kind: 'center' });
    expect('edge' in chooseMeasureSnap(f, s[0], s[1], 10, null, [{ p, kind: 'center' }], vis)!).toBe(false);
    expect(chooseMeasureSnap(f, s[0], s[1], 10, null, [{ p, kind: 'perpendicular', edge }], vis)).toEqual({ p, vertex: true, kind: 'perpendicular', edge });
  });

  it('수직 발 후보는 그 선분을 싣는다. 교차점은 그대로', () => {
    const seg = { a: [0, -10, 0] as V3, b: [0, 10, 0] as V3, id: 's', wpp: 0.01 };
    const c = inferenceCandidates([seg], [7, 3, 0], { intersections: true, perpendicular: true });
    expect(c).toEqual([{ p: [0, 3, 0], kind: 'perpendicular', id: 's', edge: [seg.a, seg.b] }]);
  });

  it('samePick: 종류·묶음·번호·고른 점·법선·잘린 면이 모두 같을 때만 같은 고르기(pointsFor 다시 쓰기)', () => {
    const base: Pick3d = { kind: 'line', id: 'nc-cut-1', index: 42, raw: 7, point: [1, 2, 3] };
    expect(samePick(base, { ...base, point: [1, 2, 3] })).toBe(true);
    expect(samePick(base, { ...base, point: [1, 2, 3 + 1e-12] })).toBe(false);
    expect(samePick(base, { ...base, kind: 'edge' })).toBe(false);
    expect(samePick(base, { ...base, id: 'nc-cut-2' })).toBe(false);
    expect(samePick(base, { ...base, index: 43 })).toBe(false);
    expect(samePick(base, { ...base, raw: 8 })).toBe(false);
    const mesh: Pick3d = { kind: 'mesh', id: '상자', index: 3, raw: 3, point: [0, 0, 40], normal: [0, 0, 1] };
    expect(samePick(mesh, { ...mesh, normal: [0, 0, 1] })).toBe(true);
    expect(samePick(mesh, { ...mesh, normal: [0, 1, 0] })).toBe(false);
    expect(samePick(mesh, { ...mesh, normal: undefined })).toBe(false);
    expect(samePick(mesh, { ...mesh, section: true })).toBe(false);
  });

  it('나란함·잠금만 켠 선택도 켜진 것이다(true는 0.9.0의 셋만)', () => {
    expect(normalizeInference({ parallel: true })).toEqual({ intersections: false, perpendicular: false, axes: false, parallel: true, lock: false });
    expect(normalizeInference({ lock: true })).toEqual({ intersections: false, perpendicular: false, axes: false, parallel: false, lock: true });
    expect(normalizeInference(true)!.parallel).toBe(false);
  });
});
