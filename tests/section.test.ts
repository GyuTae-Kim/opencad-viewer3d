/** 단면 보기 순수 계산: 평면 표현·로컬 변환·범위·다각형·광선/선분 자르기·교선·화면 끌기, 단면을 반영한 고르기 */
import { describe, expect, it } from 'vitest';
import { boxSphere, sceneBounds } from '../src/bounds';
import { buildBvh, countRayHits, raycastTriangles } from '../src/bvh';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles, fitCamera, projectToScreen, worldPerPixel } from '../src/camera';
import { mat4Mul, placeMatrix, transformPoint, translation } from '../src/math';
import { pickPointSet, pickSegments } from '../src/pick';
import { pickScene } from '../src/scenepick';
import {
  boxRange,
  boxRemoved,
  boxStraddles,
  planeBoxPolygon,
  planeFrom,
  planeShift,
  planeToLocal,
  planeValue,
  rangeFraction,
  rayKeptInterval,
  sectionDragDistance,
  sectionScreenAxis,
  sectionSegments,
  segmentKeptRange,
} from '../src/section';
import { boxMesh, gridPointSet, sphereMesh } from '../src/synth';
import type { LineSet3d, Scene3d } from '../src/types';

describe('평면 표현', () => {
  it('법선 길이와 상관없이 단위로 맞추고 offset도 같은 비율로', () => {
    const p = planeFrom([0, 0, 2], 10)!;
    expect(p.normal).toEqual([0, 0, 1]);
    expect(p.offset).toBe(5);
    expect(p.plane).toEqual([0, 0, 1, -5]);
    expect(planeValue(p.plane, 3, 4, 7)).toBe(2); // z = 7 > 5 → 잘린 쪽
    expect(planeFrom([0, 0, 0], 1)).toBeNull();
    expect(planeFrom([1, 0, 0], NaN)).toBeNull();
  });

  it('로컬 평면: 모형 행렬로 옮긴 점의 값이 세계 값과 같다(큰 원점 포함)', () => {
    const world = planeFrom([0.3, -0.5, 0.8], 1_000_123.25)!.plane;
    const o = [1e6, -5e5, 1e4];
    const model = mat4Mul(placeMatrix([5, 6, 7], [0.2, 0.4, 1], 1.5), translation(o));
    const local = planeToLocal(world, model);
    for (const p of [
      [0, 0, 0],
      [12.5, -3, 40],
      [-100, 250, 3],
    ]) {
      const w = transformPoint(model, p);
      expect(planeValue(local, p[0]!, p[1]!, p[2]!)).toBeCloseTo(planeValue(world, w[0], w[1], w[2]), 6);
    }
    // 원점만 옮기기
    const s = planeShift(world, o);
    expect(planeValue(s, 1, 2, 3)).toBeCloseTo(planeValue(world, 1 + o[0]!, 2 + o[1]!, 3 + o[2]!), 6);
    expect(planeToLocal(world, undefined)).toEqual(world);
  });
});

describe('범위·상자', () => {
  const b = { min: [0, 0, 0] as [number, number, number], max: [10, 20, 30] as [number, number, number] };
  it('방향 범위와 0~1 위치', () => {
    expect(boxRange(b, [0, 0, 1])).toEqual({ min: 0, max: 30 });
    expect(boxRange(b, [0, -1, 0])).toEqual({ min: -20, max: 0 });
    const r = boxRange(b, [Math.SQRT1_2, Math.SQRT1_2, 0]);
    expect(r.min).toBeCloseTo(0, 12);
    expect(r.max).toBeCloseTo(30 * Math.SQRT1_2, 12);
    expect(rangeFraction(15, { min: 0, max: 30 })).toBe(0.5);
    expect(rangeFraction(3, { min: 3, max: 3 })).toBe(0.5);
    expect(boxRange({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, [1, 0, 0])).toEqual({ min: 0, max: 0 });
  });

  it('걸침·통째로 잘림', () => {
    expect(boxStraddles(b, [0, 0, 1, -15])).toBe(true);
    expect(boxStraddles(b, [0, 0, 1, -40])).toBe(false);
    expect(boxRemoved(b, [0, 0, 1, 5])).toBe(true);
    expect(boxRemoved(b, [0, 0, 1, -15])).toBe(false);
  });

  it('평면 ∩ 상자: 축 평면은 사각형, 대각 평면은 육각형(볼록, 차례대로)', () => {
    const sq = planeBoxPolygon(b, [0, 0, 1, -12]);
    expect(sq.length).toBe(4);
    for (const p of sq) expect(p[2]).toBeCloseTo(12, 12);
    const cube = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] };
    const n = 1 / Math.sqrt(3);
    const hex = planeBoxPolygon(cube, [n, n, n, -1.5 * n]);
    expect(hex.length).toBe(6);
    // 볼록·차례: 이웃 변의 외적이 모두 같은 쪽
    const sign = new Set<number>();
    for (let i = 0; i < hex.length; i++) {
      const a = hex[i]!, c = hex[(i + 1) % hex.length]!, d = hex[(i + 2) % hex.length]!;
      const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], v = [d[0] - c[0], d[1] - c[1], d[2] - c[2]];
      const cr = (u[1]! * v[2]! - u[2]! * v[1]!) * n + (u[2]! * v[0]! - u[0]! * v[2]!) * n + (u[0]! * v[1]! - u[1]! * v[0]!) * n;
      sign.add(Math.sign(cr));
    }
    expect(sign.size).toBe(1);
    expect(planeBoxPolygon(b, [0, 0, 1, -100])).toEqual([]);
  });
});

describe('광선·선분 자르기', () => {
  const p: [number, number, number, number] = [0, 0, 1, -5]; // z > 5 잘림
  it('광선의 남는 구간', () => {
    expect(rayKeptInterval(p, [0, 0, 10], [0, 0, -1])).toEqual([5, Infinity]); // 위(잘린 쪽)에서 내려다보면 평면부터
    expect(rayKeptInterval(p, [0, 0, 0], [0, 0, 1])).toEqual([0, 5]); // 남는 쪽에서 올려다보면 평면까지
    expect(rayKeptInterval(p, [0, 0, 10], [0, 0, 1])).toBeNull();
    expect(rayKeptInterval(p, [0, 0, 0], [1, 0, 0])).toEqual([0, Infinity]);
    expect(rayKeptInterval(p, [0, 0, 6], [1, 0, 0])).toBeNull();
  });

  it('선분의 남는 매개변수 구간', () => {
    expect(segmentKeptRange(p, 0, 0, 0, 0, 0, 10)).toEqual([0, 0.5]);
    expect(segmentKeptRange(p, 0, 0, 10, 0, 0, 0)).toEqual([0.5, 1]);
    expect(segmentKeptRange(p, 0, 0, 6, 0, 0, 9)).toBeNull();
    expect(segmentKeptRange(p, 0, 0, 1, 0, 0, 2)).toEqual([0, 1]);
  });
});

/** 선분 쌍 배열의 길이 합 */
function totalLength(s: Float32Array): number {
  let L = 0;
  for (let i = 0; i < s.length; i += 6) L += Math.hypot(s[i + 3]! - s[i]!, s[i + 4]! - s[i + 1]!, s[i + 5]! - s[i + 2]!);
  return L;
}

describe('그물 교선(단면 테두리)', () => {
  it('상자를 수평으로 자르면 둘레 = 2·(가로 + 세로), 모든 점이 평면 위', () => {
    const m = boxMesh('b', [0, 0, 0], [120, 80, 40], [1, 1, 1, 1]);
    const s = sectionSegments(m.positions, m.indices, [0, 0, 1, -20]);
    expect(s.length % 6).toBe(0);
    for (let i = 2; i < s.length; i += 3) expect(s[i]).toBeCloseTo(20, 5);
    expect(totalLength(s)).toBeCloseTo(400, 3);
    // 평면이 그물 밖이면 없음
    expect(sectionSegments(m.positions, m.indices, [0, 0, 1, -100]).length).toBe(0);
  });

  it('구: BVH로 걸친 마디만 훑어도 모두 훑기와 같다, 점은 단면 원 위', () => {
    const m = sphereMesh('s', [10, -5, 3], 20, 96, 48, [1, 1, 1, 1]);
    const bvh = buildBvh('triangle', m.positions, m.indices);
    const n = planeFrom([0.3, 0.2, 0.9], 0)!;
    const c = [10, -5, 3];
    const d = n.normal[0] * c[0]! + n.normal[1] * c[1]! + n.normal[2] * c[2]! + 7; // 가운데에서 7만큼
    const plane: [number, number, number, number] = [n.normal[0], n.normal[1], n.normal[2], -d];
    const a = sectionSegments(m.positions, m.indices, plane, bvh);
    const b = sectionSegments(m.positions, m.indices, plane);
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThan(0);
    expect(totalLength(a)).toBeCloseTo(totalLength(b), 6);
    const rr = Math.sqrt(20 * 20 - 7 * 7);
    for (let i = 0; i < a.length; i += 3) {
      expect(planeValue(plane, a[i]!, a[i + 1]!, a[i + 2]!)).toBeCloseTo(0, 4);
      const q = [a[i]! - c[0]!, a[i + 1]! - c[1]!, a[i + 2]! - c[2]!];
      const along = q[0]! * n.normal[0] + q[1]! * n.normal[1] + q[2]! * n.normal[2];
      const radial = Math.sqrt(q[0]! ** 2 + q[1]! ** 2 + q[2]! ** 2 - along * along);
      expect(radial).toBeLessThanOrEqual(rr + 1e-3);
      expect(radial).toBeGreaterThan(rr * 0.99);
    }
    // 원둘레에 가깝다(다각형이라 조금 짧다)
    expect(totalLength(a)).toBeGreaterThan(2 * Math.PI * rr * 0.99);
    expect(totalLength(a)).toBeLessThan(2 * Math.PI * rr * 1.0001);
  });
});

describe('삼각형 광선: tMin과 교차 수', () => {
  it('tMin 앞 맞음은 건너뛰고, 닫힌 그물 안팎은 홀짝', () => {
    const m = boxMesh('b', [0, 0, 0], [10, 10, 10], [1, 1, 1, 1]);
    const bvh = buildBvh('triangle', m.positions, m.indices);
    // 위에서 아래로: z = 10(t = 10), z = 0(t = 20)
    const o = [3, 4, 20], d = [0, 0, -1];
    expect(raycastTriangles(bvh, m.positions, m.indices, o, d)!.t).toBeCloseTo(10, 9);
    expect(raycastTriangles(bvh, m.positions, m.indices, o, d, Infinity, 15)!.t).toBeCloseTo(20, 9);
    expect(raycastTriangles(bvh, m.positions, m.indices, o, d, Infinity, 25)).toBeNull();
    expect(countRayHits(bvh, m.positions, m.indices, o, d, 0)).toBe(2);
    expect(countRayHits(bvh, m.positions, m.indices, o, d, 15) % 2).toBe(1); // t = 15(z = 5)는 안
    expect(countRayHits(bvh, m.positions, m.indices, o, d, 25)).toBe(0);
  });
});

describe('화면 끌기', () => {
  const frontOrtho = (): CameraState => {
    const a = dirToAngles(VIEW_DIRS.front);
    return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, projection: 'orthographic', target: [0, 0, 0], distance: 10 / Math.tan(defaultCamera().fovY / 2) };
  };
  it('법선이 화면에 드러나면 그 방향 성분, 눈 쪽이면 세로 끌기', () => {
    // 반높이 10 → 400화소 화면에서 1단위 = 20화소
    const f = computeFrame(frontOrtho(), 400, 400, { center: [0, 0, 0], radius: 20 });
    const ax = sectionScreenAxis(f, [0, 0, 0], [1, 0, 0])!;
    expect(ax.x).toBeCloseTo(200, 9);
    expect(ax.dx).toBeCloseTo(1, 9);
    expect(ax.dy).toBeCloseTo(0, 9);
    expect(ax.pxPerUnit).toBeCloseTo(20, 6);
    expect(sectionDragDistance(f, [0, 0, 0], [1, 0, 0], 40, 13)).toBeCloseTo(2, 6);
    // +Z 법선: 화면 위쪽(y 감소)이 +
    expect(sectionDragDistance(f, [0, 0, 0], [0, 0, 1], 0, -20)).toBeCloseTo(1, 6);
    // 앞 뷰에서 −Y 법선은 눈을 바로 향한다 → 위로 끌면 눈 쪽(+법선)
    const wpp = worldPerPixel(f, 1);
    expect(sectionDragDistance(f, [0, 0, 0], [0, -1, 0], 0, -10)).toBeCloseTo(10 * wpp, 6);
  });
});

describe('단면을 반영한 고르기', () => {
  it('선분: 잘린 부분은 고르지 않고, 걸친 선분은 남는 부분만 잰다', () => {
    // x축 위 선분 −10 → 10, x > 0 잘림
    const P = new Float32Array([-10, 0, 0, 10, 0, 0]);
    const a = dirToAngles(VIEW_DIRS.front);
    const c: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, projection: 'orthographic', target: [0, 0, 0], distance: 10 / Math.tan(defaultCamera().fovY / 2) };
    const f = computeFrame(c, 400, 400, { center: [0, 0, 0], radius: 20 });
    const clip: [number, number, number, number] = [1, 0, 0, 0];
    const right = projectToScreen(f, [5, 0, 0])!, left = projectToScreen(f, [-5, 0, 0])!;
    expect(pickSegments(f, P, null, right[0], right[1], 3)).not.toBeNull();
    expect(pickSegments(f, P, null, right[0], right[1], 3, { clip })).toBeNull();
    const h = pickSegments(f, P, null, left[0], left[1], 3, { clip })!;
    expect(h.point[0]).toBeCloseTo(-5, 6);
    expect(h.t).toBeCloseTo(0.25, 6); // 원래 선분 위 매개변수
    // 점
    const pts = new Float32Array([5, 0, 0, -5, 0, 0]);
    expect(pickPointSet(f, pts, null, right[0], right[1], 4, Infinity, clip)).toBeNull();
    expect(pickPointSet(f, pts, null, left[0], left[1], 4, Infinity, clip)!.index).toBe(1);
  });

  it('그물: 잘린 앞면을 지나 안쪽 면, 채우는 그물이면 평면 위 잘린 면', () => {
    const m = boxMesh('b', [0, 0, 0], [10, 10, 10], [0.7, 0.7, 0.7, 1]);
    const s: Scene3d = { name: '', units: 'mm', meshes: [m], lines: [] };
    const c: CameraState = { ...defaultCamera(), ...dirToAngles(VIEW_DIRS.top), target: [5, 5, 5], distance: 60, projection: 'orthographic' };
    const f = computeFrame(c, 400, 400, { center: [5, 5, 5], radius: 20 });
    const at = projectToScreen(f, [3, 4, 10])!;
    const bvh = buildBvh('triangle', m.positions, m.indices);
    const base = { tol: 6, occlude: true, bvh: () => bvh };
    const clip: [number, number, number, number] = [0, 0, 1, -6]; // z > 6 잘림
    expect(pickScene(f, at[0], at[1], { meshes: [m], lines: [], points: [] }, base)!.pick.point[2]).toBeCloseTo(10, 6);
    const inner = pickScene(f, at[0], at[1], { meshes: [m], lines: [], points: [] }, { ...base, clip })!;
    expect(inner.pick.point[2]).toBeCloseTo(0, 6); // 윗면이 잘려 바닥 안쪽
    const capHit = pickScene(f, at[0], at[1], { meshes: [m], lines: [], points: [] }, { ...base, clip, caps: () => true })!;
    expect(capHit.pick.section).toBe(true);
    expect(capHit.pick.point[2]).toBeCloseTo(6, 6);
    expect(capHit.pick.normal).toEqual([0, 0, 1]);
    expect(capHit.pick.index).toBe(-1);
    // 면 가운데(아래 면 대각선 위 — 두 삼각형이 함께 맞는다)를 눌러도 잘린 면
    const mid = projectToScreen(f, [5, 5, 10])!;
    expect(pickScene(f, mid[0], mid[1], { meshes: [m], lines: [], points: [] }, { ...base, clip, caps: () => true })!.pick.section).toBe(true);
    // 상자 밖을 누르면 잘린 면이 아니다
    const out = projectToScreen(f, [12, 5, 6])!;
    expect(pickScene(f, out[0], out[1], { meshes: [m], lines: [], points: [] }, { ...base, clip, caps: () => true })).toBeNull();
    expect(sceneBounds(s).max[2]).toBe(10);
  });

  it('점·선분 묶음 전체가 잘린 쪽이면 고르지 않는다', () => {
    const p = gridPointSet('p', 0, 0, 0, 5, 5, 10, [1, 1, 1, 1]);
    const l: LineSet3d = { id: 'l', positions: new Float32Array([0, 0, 0, 40, 40, 0]) };
    const s: Scene3d = { name: '', units: 'mm', meshes: [], lines: [l], points: [p] };
    const box = sceneBounds(s);
    const c = fitCamera({ ...defaultCamera() }, box, 1);
    const f = computeFrame(c, 500, 500, boxSphere(box));
    const t = projectToScreen(f, [20, 20, 0])!;
    const items = { meshes: [], lines: [l], points: [p] };
    const o = { tol: 6, occlude: true, bvh: () => null };
    expect(pickScene(f, t[0], t[1], items, o)!.pick.kind).toBe('point');
    expect(pickScene(f, t[0], t[1], items, { ...o, clip: [0, 0, 1, 1] })).toBeNull(); // z > −1 모두 잘림
  });
});
