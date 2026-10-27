/** 0.8.0 걷기 중력·부딪힘: 세계 광선 맞음(castRay)과 한 걸음(walkStep) */
import { describe, expect, it } from 'vitest';
import { buildBvh } from '../src/bvh';
import { boxMesh } from '../src/synth';
import type { Mesh3d } from '../src/types';
import { type CastOptions, type WalkPhysics, castRay, walkStep } from '../src/walk';

const bvhs = new Map<Float32Array, ReturnType<typeof buildBvh>>();
const o = (x: Partial<CastOptions> = {}): CastOptions => ({
  bvh: (kind, positions, indices) => {
    let b = bvhs.get(positions);
    if (!b) bvhs.set(positions, (b = buildBvh(kind, positions, indices)));
    return b;
  },
  ...x,
});
const grey = [0.7, 0.7, 0.7, 1] as const;
// 바닥(두께 0.2, 윗면 z = 0), 계단 한 단(높이 0.3, x 2~3), 높은 벽(x 5~5.2, 높이 3), 2층 판(윗면 z = 3, x −6~−2)
const floor = boxMesh('바닥', [-10, -10, -0.2], [10, 10, 0], grey);
const step = boxMesh('계단', [2, -10, 0], [3, 10, 0.3], grey);
const wall = boxMesh('벽', [5, -10, 0], [5.2, 10, 3], grey);
const deck = boxMesh('2층', [-6, -10, 2.8], [-2, 10, 3], grey);
const world: Mesh3d[] = [floor, step, wall, deck];
const phys: WalkPhysics = { eyeHeight: 1.6, stepHeight: 0.5, radius: 0.3, gravity: true, collide: true, drop: 20 };
const cast = (ms: Mesh3d[] = world) => (org: [number, number, number], d: [number, number, number], t: number) => castRay(org, d, t, ms, o());

describe('castRay', () => {
  it('처음 맞는 면의 거리·법선(광선 쪽)·id', () => {
    const h = castRay([0, 0, 1], [1, 0, 0], 100, world, o())!;
    expect(h.id).toBe('벽');
    expect(h.t).toBeCloseTo(5, 6);
    expect(h.normal[0]).toBeCloseTo(-1, 6);
    expect(castRay([0, 0, 1], [1, 0, 0], 4, world, o())).toBeNull();
    const down = castRay([0, 0, 1], [0, 0, -1], 100, world, o())!;
    expect(down.id).toBe('바닥');
    expect(down.t).toBeCloseTo(1, 6);
    expect(down.normal[2]).toBeCloseTo(1, 6);
  });
  it('묶음 행렬·숨긴 삼각형·단면(남는 쪽만)을 따른다', () => {
    const moved: Mesh3d = { ...wall, id: '옮긴 벽', matrix: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -2, 0, 0, 1]) };
    expect(castRay([0, 0, 1], [1, 0, 0], 100, [moved], o())!.t).toBeCloseTo(3, 6);
    // 벽 앞면(x = 5) 삼각형을 숨기면 뒷면(x = 5.2)
    const hideAll = castRay([0, 0, 1], [1, 0, 0], 100, [wall], o({ hidden: () => () => true }));
    expect(hideAll).toBeNull();
    // x > 5.1 쪽을 잘라 내면 앞면만 남아 그대로, x > 4 쪽을 자르면 벽 전체가 잘려 맞지 않는다
    expect(castRay([0, 0, 1], [1, 0, 0], 100, [wall], o({ clips: () => [[1, 0, 0, -5.1]] }))!.t).toBeCloseTo(5, 6);
    expect(castRay([0, 0, 1], [1, 0, 0], 100, [wall], o({ clips: () => [[1, 0, 0, -4]] }))).toBeNull();
  });
});

describe('walkStep', () => {
  it('중력: 계단 한 단(0.3 < stepHeight)은 오르고 내려오면 다시 바닥 높이', () => {
    const on = walkStep([1.8, 0, 1.6], [0.7, 0, 0], { ...phys, collide: false }, cast());
    expect(on[0]).toBeCloseTo(2.5, 9);
    expect(on[2]).toBeCloseTo(1.9, 6);
    const off = walkStep(on, [1, 0, 0], { ...phys, collide: false }, cast());
    expect(off[2]).toBeCloseTo(1.6, 6);
  });
  it('부딪힘: 높은 벽 앞 radius에서 멈추고, 비스듬히 가면 벽을 따라 미끄러진다', () => {
    const p = walkStep([4, 0, 1.6], [2, 0, 0], phys, cast());
    expect(p[0]).toBeCloseTo(4.7, 6);
    expect(p[1]).toBeCloseTo(0, 9);
    const s = walkStep([4, 0, 1.6], [2, 1, 0], phys, cast());
    expect(s[0]).toBeCloseTo(4.7, 6);
    expect(s[1]).toBeCloseTo(1, 6);
  });
  it('부딪힘만: 무릎보다 낮은 계단은 막지 않고, 끄면 벽도 지나간다', () => {
    expect(walkStep([1, 0, 1.6], [1.5, 0, 0], { ...phys, gravity: false }, cast())[0]).toBeCloseTo(2.5, 9);
    expect(walkStep([4, 0, 1.6], [2, 0, 0], { ...phys, gravity: false, collide: false }, cast())[0]).toBeCloseTo(6, 9);
  });
  it('2층 판 끝 밖으로 나가면 아래 바닥으로 내려가고, 아래에 아무것도 없으면 높이를 지킨다', () => {
    const fall = walkStep([-2.5, 0, 4.6], [1, 0, 0], { ...phys, collide: false }, cast());
    expect(fall[2]).toBeCloseTo(1.6, 6);
    const air = walkStep([30, 0, 7], [1, 0, 0], phys, cast());
    expect(air).toEqual([31, 0, 7]);
  });
  it('중력을 켜면 위아래 입력은 무시하고, 끄면 그대로 움직인다(0.7.x)', () => {
    expect(walkStep([0, 0, 1.6], [0, 0, 1], phys, cast())[2]).toBeCloseTo(1.6, 6);
    expect(walkStep([0, 0, 1.6], [0, 0, 1], { ...phys, gravity: false, collide: false }, cast())).toEqual([0, 0, 2.6]);
  });
});
