/** 묶음 안 구간(숨김·강조): 합치기·나누기·판정·모으기, 숨긴 구간을 뺀 범위·고르기·교선·강조 선분 */
import { describe, expect, it } from 'vitest';
import { itemRangesBounds, meshBounds, rangesBox } from '../src/bounds';
import { buildBvh, countRayHits, raycastTriangles } from '../src/bvh';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { pickPointSet, pickSegments } from '../src/pick';
import {
  clipRanges,
  compactStride,
  compactTriIndices,
  countBelow,
  mergeRanges,
  partitionRanges,
  partsOf,
  rangeTester,
  rangesTotal,
} from '../src/ranges';
import { pickScene } from '../src/scenepick';
import { sectionSegments } from '../src/section';
import { segmentsById } from '../src/segments';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d } from '../src/types';

describe('구간 계산', () => {
  it('합치기: 자르기·정렬·겹침과 맞닿음 합치기·빈 구간 버리기', () => {
    expect(mergeRanges([{ start: 8, count: 4 }, { start: 0, count: 2 }, { start: 2, count: 1 }, { start: 10, count: 5 }, { start: 30, count: 0 }, { start: -3, count: 1 }], 13)).toEqual([
      { start: 0, count: 3 },
      { start: 8, count: 5 },
    ]);
    expect(mergeRanges(null, 10)).toEqual([]);
    expect(mergeRanges([{ start: 5, count: 3 }], 0)).toEqual([]);
    expect(mergeRanges([{ start: NaN, count: 3 }], 10)).toEqual([]);
    expect(rangesTotal([{ start: 0, count: 3 }, { start: 8, count: 5 }])).toBe(8);
  });

  it('나누기: 숨김을 빼고 강조 안·밖으로, 같은 종류 이웃은 합침', () => {
    const hidden = mergeRanges([{ start: 2, count: 2 }], 10);
    const hi = mergeRanges([{ start: 3, count: 4 }, { start: 8, count: 1 }], 10);
    expect(partitionRanges(10, hidden, hi)).toEqual([
      { start: 0, count: 2, hi: false },
      { start: 4, count: 3, hi: true },
      { start: 7, count: 1, hi: false },
      { start: 8, count: 1, hi: true },
      { start: 9, count: 1, hi: false },
    ]);
    expect(partitionRanges(5, [], [])).toEqual([{ start: 0, count: 5, hi: false }]);
    expect(partitionRanges(5, [{ start: 0, count: 5 }], [])).toEqual([]);
    const p = partitionRanges(10, hidden, hi);
    expect(partsOf(p, true)).toEqual([
      { start: 4, count: 3 },
      { start: 8, count: 1 },
    ]);
  });

  it('창 자르기·앞쪽 개수·판정', () => {
    const r = [
      { start: 0, count: 3 },
      { start: 8, count: 5 },
    ];
    expect(clipRanges(r, 2, 10)).toEqual([
      { start: 2, count: 1 },
      { start: 8, count: 2 },
    ]);
    expect(countBelow(r, 0)).toBe(0);
    expect(countBelow(r, 2)).toBe(2);
    expect(countBelow(r, 9)).toBe(4);
    expect(countBelow(r, 100)).toBe(8);
    const t = rangeTester(r)!;
    expect([0, 2, 3, 7, 8, 12, 13].map(t)).toEqual([true, true, false, false, true, true, false]);
    expect(rangeTester([])).toBeNull();
  });

  it('모으기: 삼각형 색인(면·변)·보폭 복사', () => {
    const idx = new Uint32Array([0, 1, 2, 2, 1, 3, 3, 1, 4]);
    expect([...compactTriIndices(idx, [{ start: 1, count: 2 }])]).toEqual([2, 1, 3, 3, 1, 4]);
    expect([...compactTriIndices(undefined, [{ start: 1, count: 1 }])]).toEqual([3, 4, 5]);
    expect([...compactTriIndices(idx, [{ start: 0, count: 1 }], true)]).toEqual([0, 1, 1, 2, 2, 0]);
    const src = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...compactStride(src, [{ start: 0, count: 1 }, { start: 2, count: 1 }], 3)]).toEqual([0, 1, 2, 6, 7, 8]);
  });
});

/** 상자 두 개를 한 그물로(삼각형 0~11 = 왼쪽 상자, 12~23 = 오른쪽 상자) */
function twoBoxes(): Mesh3d {
  const a = boxMesh('a', [0, 0, 0], [10, 10, 10], [1, 1, 1, 1]);
  const b = boxMesh('b', [20, 0, 0], [30, 10, 10], [1, 1, 1, 1]);
  const positions = new Float32Array(48);
  positions.set(a.positions, 0);
  positions.set(b.positions, 24);
  const indices = new Uint32Array(72);
  indices.set(a.indices!, 0);
  for (let i = 0; i < 36; i++) indices[36 + i] = b.indices![i]! + 8;
  return { id: 'two', positions, indices, color: [0.7, 0.7, 0.7, 1], closed: true };
}

describe('숨긴 구간을 뺀 범위·고르기·교선', () => {
  const m = twoBoxes();
  const right = [{ start: 12, count: 12 }];

  it('보이는 구간만의 범위(원점·행렬 반영)', () => {
    expect(rangesBox('triangle', m.positions, m.indices, right)).toEqual({ min: [20, 0, 0], max: [30, 10, 10] });
    const moved: Mesh3d = { ...m, origin: [1e6, 0, 0], matrix: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 5, 0, 1]) };
    expect(itemRangesBounds(moved, 'triangle', [{ start: 0, count: 12 }])).toEqual({ min: [1e6, 5, 0], max: [1e6 + 10, 15, 10] });
    expect(meshBounds(m).max[0]).toBe(30);
    const l: LineSet3d = { id: 'l', positions: new Float32Array([0, 0, 0, 1, 1, 1, 5, 5, 5, 6, 7, 8]) };
    expect(rangesBox('segment', l.positions, undefined, [{ start: 1, count: 1 }])).toEqual({ min: [5, 5, 5], max: [6, 7, 8] });
  });

  it('광선 고르기·안팎 홀짝은 숨긴 삼각형을 건너뛴다', () => {
    const bvh = buildBvh('triangle', m.positions, m.indices);
    const hideLeft = rangeTester([{ start: 0, count: 12 }])!;
    // 왼쪽 상자 위에서 아래로: 숨기면 맞지 않는다
    expect(raycastTriangles(bvh, m.positions, m.indices, [5, 5, 20], [0, 0, -1])).not.toBeNull();
    expect(raycastTriangles(bvh, m.positions, m.indices, [5, 5, 20], [0, 0, -1], Infinity, 0, hideLeft)).toBeNull();
    expect(countRayHits(bvh, m.positions, m.indices, [5, 5, 20], [0, 0, -1], 0, hideLeft)).toBe(0);
    // x를 따라 두 상자를 지나는 광선: 숨기지 않으면 4번, 왼쪽을 숨기면 2번
    expect(countRayHits(bvh, m.positions, m.indices, [-5, 5, 5], [1, 0, 0])).toBe(4);
    expect(countRayHits(bvh, m.positions, m.indices, [-5, 5, 5], [1, 0, 0], 0, hideLeft)).toBe(2);
  });

  it('장면 고르기: 숨긴 구간 아래는 그 뒤의 것(또는 없음)', () => {
    const c: CameraState = { ...defaultCamera(), ...dirToAngles(VIEW_DIRS.top), target: [15, 5, 5], distance: 80, projection: 'orthographic' };
    const f = computeFrame(c, 400, 400, { center: [15, 5, 5], radius: 30 });
    const bvh = buildBvh('triangle', m.positions, m.indices);
    const items = { meshes: [m], lines: [], points: [] };
    const at = projectToScreen(f, [5, 5, 10])!;
    const o = { tol: 6, occlude: true, bvh: () => bvh };
    expect(pickScene(f, at[0], at[1], items, o)!.pick.index).toBeLessThan(12);
    const test = rangeTester([{ start: 0, count: 12 }]);
    expect(pickScene(f, at[0], at[1], items, { ...o, hidden: () => test })).toBeNull();
    const at2 = projectToScreen(f, [25, 5, 10])!;
    expect(pickScene(f, at2[0], at2[1], items, { ...o, hidden: () => test })!.pick.index).toBeGreaterThanOrEqual(12);
  });

  it('선분·점 고르기도 숨긴 번호를 건너뛴다', () => {
    const a = dirToAngles(VIEW_DIRS.front);
    const c: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, projection: 'orthographic', target: [0, 0, 0], distance: 10 / Math.tan(defaultCamera().fovY / 2) };
    const f = computeFrame(c, 400, 400, { center: [0, 0, 0], radius: 20 });
    // 같은 자리에 겹친 선분 둘: 0을 숨기면 1을 고른다
    const P = new Float32Array([-5, 0, 0, 5, 0, 0, -5, 0, 0, 5, 0, 0]);
    const s = projectToScreen(f, [0, 0, 0])!;
    expect(pickSegments(f, P, null, s[0], s[1], 3)!.index).toBe(0);
    expect(pickSegments(f, P, null, s[0], s[1], 3, { skip: (i) => i === 0 })!.index).toBe(1);
    expect(pickSegments(f, P, null, s[0], s[1], 3, { skip: () => true })).toBeNull();
    const pts = new Float32Array([0, 0, 0, 0, 0, 0]);
    expect(pickPointSet(f, pts, null, s[0], s[1], 4, Infinity, null, (i) => i === 0)!.index).toBe(1);
  });

  it('단면 테두리·강조 선분 모으기도 숨긴 구간을 뺀다', () => {
    const all = sectionSegments(m.positions, m.indices, [0, 0, 1, -5]);
    const some = sectionSegments(m.positions, m.indices, [0, 0, 1, -5], null, rangeTester([{ start: 12, count: 12 }]));
    expect(some.length).toBe(all.length / 2);
    for (let i = 0; i < some.length; i += 3) expect(some[i]!).toBeLessThanOrEqual(10);
    const l: LineSet3d = { id: 'l', positions: new Float32Array(18), segmentIds: new Uint32Array([7, 7, 8]) };
    expect(segmentsById([l], [7])!.length).toBe(12);
    expect(segmentsById([l], [7], undefined, null, () => (i) => i === 0)!.length).toBe(6);
  });
});
