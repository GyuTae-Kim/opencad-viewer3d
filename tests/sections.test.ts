/** 여러 단면 평면: 광선 구간·다각형·선분 자르기, 묶음마다 다른 평면으로 고르기, capGroup 함께 채우기 */
import { describe, expect, it } from 'vitest';
import { buildBvh } from '../src/bvh';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { pickPointSet, pickSegments } from '../src/pick';
import { type ScenePickOptions, pickScene } from '../src/scenepick';
import { type Plane4, clipPolygon, clipSegments, rayKeptInterval, rayKeptIntervalN } from '../src/section';
import { boxMesh } from '../src/synth';
import type { Mesh3d } from '../src/types';

describe('여러 평면 계산', () => {
  it('광선 구간: 평면 하나면 예전과 같고, 여럿이면 교집합과 들어온 평면', () => {
    const o = [0, -100, 0], d = [0, 1, 0];
    const p1: Plane4 = [0, -1, 0, -20]; // y < −20 쪽을 잘라 냄
    const p2: Plane4 = [0, 1, 0, -40]; // y > 40 쪽을 잘라 냄
    const r1 = rayKeptInterval(p1, o, d)!;
    const n1 = rayKeptIntervalN([p1], o, d)!;
    expect([n1.t0, n1.t1]).toEqual(r1);
    const n = rayKeptIntervalN([p1, p2], o, d)!;
    expect(n.t0).toBeCloseTo(80, 9);
    expect(n.t1).toBeCloseTo(140, 9);
    expect(n.enter).toBe(0);
    expect(rayKeptIntervalN([p1, [0, 1, 0, 30]], o, d)).toBeNull();
    expect(rayKeptIntervalN([], o, d)).toEqual({ t0: 0, t1: Infinity, enter: -1 });
  });

  it('다각형·선분 자르기', () => {
    const sq = [
      [0, 0, 0],
      [10, 0, 0],
      [10, 10, 0],
      [0, 10, 0],
    ] as [number, number, number][];
    const c = clipPolygon(sq, [1, 0, 0, -4]); // x > 4 잘라 냄
    expect(c.length).toBe(4);
    for (const p of c) expect(p[0]).toBeLessThanOrEqual(4 + 1e-12);
    expect(clipPolygon(sq, [1, 0, 0, 20])).toEqual([]);
    const s = clipSegments([0, 0, 0, 10, 0, 0, 0, 5, 0, 0, 6, 0], [
      [1, 0, 0, -8],
      [-1, 0, 0, 2],
    ]);
    expect(s).toEqual([2, 0, 0, 8, 0, 0]);
  });

  it('선분·점 고르기: 평면 목록이면 모두의 남는 쪽만', () => {
    const a = dirToAngles(VIEW_DIRS.front);
    const cam: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [0, 0, 0], distance: 100, projection: 'orthographic' };
    const f = computeFrame(cam, 400, 400, { center: [0, 0, 0], radius: 50 });
    const seg = new Float32Array([-20, 0, 0, 20, 0, 0]);
    const at = (x: number): [number, number] => {
      const s = projectToScreen(f, [x, 0, 0])!;
      return [s[0], s[1]];
    };
    const [x0, y0] = at(-10), [x1, y1] = at(10), [xm, ym] = at(0);
    const clips: Plane4[] = [
      [1, 0, 0, -5],
      [-1, 0, 0, -5],
    ]; // −5 ≤ x ≤ 5만 남김
    expect(pickSegments(f, seg, null, x0, y0, 3, { clips })).toBeNull();
    expect(pickSegments(f, seg, null, x1, y1, 3, { clips })).toBeNull();
    expect(pickSegments(f, seg, null, xm, ym, 3, { clips })!.t).toBeCloseTo(0.5, 9);
    // 평면 하나는 예전 clip과 같다
    expect(pickSegments(f, seg, null, xm, ym, 3, { clips: [clips[0]!] })).toEqual(pickSegments(f, seg, null, xm, ym, 3, { clip: clips[0]! }));
    const pts = new Float32Array([-10, 0, 0, 0, 0, 0]);
    expect(pickPointSet(f, pts, null, x0, y0, 3, Infinity, clips)).toBeNull();
    expect(pickPointSet(f, pts, null, xm, ym, 3, Infinity, clips)!.index).toBe(1);
  });
});

describe('여러 평면으로 장면 고르기', () => {
  const a = dirToAngles(VIEW_DIRS.front);
  const cam: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [0, 0, 0], distance: 100, projection: 'perspective' };
  const f = computeFrame(cam, 400, 400, { center: [0, 0, 0], radius: 40 });
  const A = boxMesh('A', [-30, -10, -10], [-10, 10, 10], [0.7, 0.7, 0.7, 1]);
  const B = boxMesh('B', [10, -10, -10], [30, 10, 10], [0.7, 0.7, 0.7, 1]);
  const bvhs = new Map<Float32Array | Uint32Array, ReturnType<typeof buildBvh>>();
  const base = (o: Partial<ScenePickOptions>): ScenePickOptions => ({
    tol: 6,
    occlude: true,
    bvh: (kind, positions, indices) => {
      let b = bvhs.get(indices ?? positions);
      if (!b) bvhs.set(indices ?? positions, (b = buildBvh(kind, positions, indices)));
      return b;
    },
    ...o,
  });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  // 앞쪽 절반(y < 0)을 잘라 내는 평면
  const front: Plane4 = [0, -1, 0, 0];

  it('범위를 정한 평면은 그 묶음만 자른다(A는 잘려 잘린 면, B는 앞면 그대로)', () => {
    const o = base({ clips: (it) => (it.id === 'A' ? [front] : []), caps: () => true });
    const da = pickScene(f, ...at([-20, -10, 0]), { meshes: [A, B], lines: [], points: [] }, o)!;
    expect(da.pick.id).toBe('A');
    expect(da.pick.section).toBe(true);
    expect(da.pick.point[1]).toBeCloseTo(0, 6);
    const db = pickScene(f, ...at([20, -10, 0]), { meshes: [A, B], lines: [], points: [] }, o)!;
    expect(db.pick.id).toBe('B');
    expect(db.pick.section).toBeUndefined();
    expect(db.pick.point[1]).toBeCloseTo(-10, 6);
  });

  it('두 평면(앞을 자르고 x > −20을 자름): 남는 부분만, 잘린 면 법선은 들어온 평면', () => {
    const o = base({ clips: () => [front, [1, 0, 0, 20]], caps: () => true });
    const d = pickScene(f, ...at([-25, -10, 0]), { meshes: [A, B], lines: [], points: [] }, o)!;
    expect(d.pick.section).toBe(true);
    expect(d.pick.normal).toEqual([0, -1, 0]);
    // x > −20 쪽(A의 오른쪽 일부와 B 전체)은 없다
    expect(pickScene(f, ...at([-15, -10, 0]), { meshes: [A, B], lines: [], points: [] }, o)).toBeNull();
    expect(pickScene(f, ...at([20, -10, 0]), { meshes: [A, B], lines: [], points: [] }, o)).toBeNull();
  });

  it('capGroup: 반씩 나뉜 열린 그물 둘이 함께 닫힌 입체면 잘린 면을 고른다', () => {
    // 상자 A를 위·아래 삼각형 반으로 나눈다(각각은 열린 그물)
    const I = A.indices!;
    const half = (lo: number, hi: number, id: string): Mesh3d => ({ ...A, id, indices: I.slice(lo * 3, hi * 3), closed: false, edges: undefined });
    const n = I.length / 3;
    const h1 = half(0, n / 2, 'A1'), h2 = half(n / 2, n, 'A2');
    const items = { meshes: [h1, h2], lines: [], points: [] };
    const p = at([-20, -10, 0]);
    // 평면 하나(예전 경로)와 여러 평면 경로 모두
    // 뷰어 규칙: closed이거나 capGroup이 있는 그물만 채운다
    for (const o of [base({ clip: front, caps: (m) => m.closed === true }), base({ clips: () => [front], caps: (m) => m.closed === true })]) {
      const without = pickScene(f, ...p, items, o);
      expect(without?.pick.section).not.toBe(true);
      expect(without?.pick.id).toBe('A2');
      const withGroup = pickScene(f, ...p, items, { ...o, caps: () => true, capGroup: () => '상자 A' })!;
      expect(withGroup.pick.section).toBe(true);
    }
  });
});
