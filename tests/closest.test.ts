/** 두 묶음 사이 최근접점: 기본 도형 쌍, BVH 가지치기 = 모두 훑기, 행렬·원점·숨김 */
import { describe, expect, it } from 'vitest';
import { buildBvh } from '../src/bvh';
import { type ClosestShape, closestBetween, closestPtTri, closestSegSeg, closestSegTri, closestTriTri, segTriIntersect } from '../src/closest';
import type { V3 } from '../src/math';
import { boxMesh, helixPath, sphereMesh } from '../src/synth';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const tri = (p: Float32Array, I: Uint32Array | undefined, i: number, M?: ArrayLike<number> | null): [V3, V3, V3] => {
  const v = (k: number): V3 => {
    const j = (I ? I[i * 3 + k]! : i * 3 + k) * 3;
    const x = p[j]!, y = p[j + 1]!, z = p[j + 2]!;
    return M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
  };
  return [v(0), v(1), v(2)];
};

describe('기본 도형 쌍', () => {
  it('선분–선분: 엇갈린 두 선분, 평행, 점처럼 짧은 선분', () => {
    const r = closestSegSeg([0, 0, 0], [10, 0, 0], [5, -5, 3], [5, 5, 3]);
    expect(r.c1).toEqual([5, 0, 0]);
    expect(r.c2).toEqual([5, 0, 3]);
    expect(r.d2).toBeCloseTo(9, 12);
    expect(closestSegSeg([0, 0, 0], [10, 0, 0], [2, 1, 0], [4, 1, 0]).d2).toBeCloseTo(1, 12);
    expect(closestSegSeg([1, 1, 1], [1, 1, 1], [0, 0, 0], [2, 0, 0]).d2).toBeCloseTo(2, 12);
  });

  it('점–삼각형: 안쪽은 면 위, 바깥은 변·꼭짓점', () => {
    const a: V3 = [0, 0, 0], b: V3 = [4, 0, 0], c: V3 = [0, 4, 0];
    expect(closestPtTri([1, 1, 5], a, b, c)).toEqual([1, 1, 0]);
    expect(closestPtTri([-3, -3, 0], a, b, c)).toEqual([0, 0, 0]);
    expect(closestPtTri([3, 3, 0], a, b, c)).toEqual([2, 2, 0]);
    expect(closestPtTri([6, -1, 0], a, b, c)).toEqual([4, 0, 0]);
  });

  it('선분–삼각형 지남·삼각형 둘 걸침은 거리 0', () => {
    const T: [V3, V3, V3] = [
      [0, 0, 0],
      [4, 0, 0],
      [0, 4, 0],
    ];
    expect(segTriIntersect([1, 1, -1], [1, 1, 1], ...T)).toEqual([1, 1, 0]);
    expect(closestSegTri([1, 1, -1], [1, 1, 1], ...T).d2).toBe(0);
    expect(closestSegTri([1, 1, 2], [1, 1, 3], ...T).d2).toBeCloseTo(4, 12);
    const U: [V3, V3, V3] = [
      [1, 1, -1],
      [1, 1, 1],
      [3, -2, 0],
    ];
    expect(closestTriTri(T, U).d2).toBe(0);
    expect(closestTriTri(T, U.map((p) => [p[0], p[1], p[2] + 5]) as [V3, V3, V3]).d2).toBeCloseTo(16, 9);
  });
});

describe('두 묶음 사이', () => {
  it('떨어진 두 상자: 틈 길이와 두 점', () => {
    const A = boxMesh('A', [0, 0, 0], [10, 10, 10], [1, 1, 1, 1]);
    const B = boxMesh('B', [13, 2, 4], [20, 8, 6], [1, 1, 1, 1]);
    const r = closestBetween(
      { kind: 'triangle', positions: A.positions, indices: A.indices, bvh: buildBvh('triangle', A.positions, A.indices) },
      { kind: 'triangle', positions: B.positions, indices: B.indices, bvh: buildBvh('triangle', B.positions, B.indices) },
    )!;
    expect(r.distance).toBeCloseTo(3, 9);
    expect(r.a[0]).toBeCloseTo(10, 9);
    expect(r.b[0]).toBeCloseTo(13, 9);
    expect(closestBetween(
      { kind: 'triangle', positions: A.positions, indices: A.indices, bvh: buildBvh('triangle', A.positions, A.indices) },
      { kind: 'triangle', positions: B.positions, indices: B.indices, bvh: buildBvh('triangle', B.positions, B.indices) },
      { maxDistance: 2 },
    )).toBeNull();
  });

  it('구(행렬로 옮기고 키움)–나선 선분: BVH 가지치기 = 모두 훑기', () => {
    const sph = sphereMesh('구', [0, 0, 0], 10, 24, 12, [1, 1, 1, 1]);
    const M = new Float64Array([1.5, 0, 0, 0, 0, 1.5, 0, 0, 0, 0, 1.5, 0, 40, 5, 3, 1]);
    const hx = helixPath('나선', [0, 0, 0], 12, 30, 600);
    const o: V3 = [1e6, -2e5, 50];
    const S: ClosestShape = { kind: 'triangle', positions: sph.positions, indices: sph.indices, bvh: buildBvh('triangle', sph.positions, sph.indices), model: M };
    // 선분 묶음은 원점 기준(세계 = o + p) — 구도 같은 원점으로 옮긴다
    const Mo = new Float64Array(M);
    Mo[12]! += o[0];
    Mo[13]! += o[1];
    Mo[14]! += o[2];
    const L: ClosestShape = { kind: 'segment', positions: hx.positions, bvh: buildBvh('segment', hx.positions), model: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...o, 1]) };
    const r = closestBetween({ ...S, model: Mo }, L)!;
    // 모두 훑기
    let best = Infinity;
    const nt = sph.indices!.length / 3, ns = hx.positions.length / 6;
    const P = hx.positions;
    for (let i = 0; i < nt; i++) {
      const T = tri(sph.positions, sph.indices, i, M);
      for (let j = 0; j < ns; j++) {
        const p: V3 = [P[j * 6]!, P[j * 6 + 1]!, P[j * 6 + 2]!], q: V3 = [P[j * 6 + 3]!, P[j * 6 + 4]!, P[j * 6 + 5]!];
        best = Math.min(best, closestSegTri(p, q, ...T).d2);
      }
    }
    expect(r.distance).toBeCloseTo(Math.sqrt(best), 6);
    // 결과 점은 세계(원점 1e6대) 좌표
    expect(r.b[0]).toBeGreaterThan(9e5);
    expect(Math.hypot(r.a[0] - r.b[0], r.a[1] - r.b[1], r.a[2] - r.b[2])).toBeCloseTo(r.distance, 6);
  });

  it('무작위 삼각형 무리 둘: = 모두 훑기, 숨긴 삼각형은 뺀다', () => {
    const rand = rng(7);
    const soup = (n: number, c: V3): Float32Array => {
      const p = new Float32Array(n * 9);
      for (let i = 0; i < n; i++) {
        const x = c[0] + rand() * 20, y = c[1] + rand() * 20, z = c[2] + rand() * 20;
        for (let k = 0; k < 3; k++) {
          p[i * 9 + k * 3] = x + rand() * 2;
          p[i * 9 + k * 3 + 1] = y + rand() * 2;
          p[i * 9 + k * 3 + 2] = z + rand() * 2;
        }
      }
      return p;
    };
    const pa = soup(300, [0, 0, 0]), pb = soup(300, [18, 5, -3]);
    const brute = (skipA?: (i: number) => boolean): number => {
      let b = Infinity;
      for (let i = 0; i < 300; i++) {
        if (skipA?.(i)) continue;
        for (let j = 0; j < 300; j++) b = Math.min(b, closestTriTri(tri(pa, undefined, i), tri(pb, undefined, j)).d2);
      }
      return Math.sqrt(b);
    };
    const A: ClosestShape = { kind: 'triangle', positions: pa, bvh: buildBvh('triangle', pa) };
    const B: ClosestShape = { kind: 'triangle', positions: pb, bvh: buildBvh('triangle', pb) };
    expect(closestBetween(A, B)!.distance).toBeCloseTo(brute(), 9);
    const skip = (i: number): boolean => i % 2 === 0;
    expect(closestBetween({ ...A, skip }, B)!.distance).toBeCloseTo(brute(skip), 9);
  });

  it('점 묶음–선분 묶음, 빈 묶음은 null', () => {
    const pts = new Float32Array([0, 0, 5, 3, 3, 3, 10, 0, 0]);
    const seg = new Float32Array([0, 0, 0, 10, 0, 0]);
    const r = closestBetween({ kind: 'point', positions: pts, bvh: buildBvh('point', pts) }, { kind: 'segment', positions: seg, bvh: buildBvh('segment', seg) })!;
    expect(r.distance).toBe(0);
    expect(r.a).toEqual([10, 0, 0]);
    const e = new Float32Array(0);
    expect(closestBetween({ kind: 'point', positions: e, bvh: buildBvh('point', e) }, { kind: 'segment', positions: seg, bvh: buildBvh('segment', seg) })).toBeNull();
  });
});
