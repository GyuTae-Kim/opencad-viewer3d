/**
 * 0.30.0 임의 방향 범위(bounds itemExtent·itemsExtent): 묶음(그물·선분·점)의 단위 벡터 v 방향 최소·최대(꼭짓점 지지 — 세계 꼭짓점 p·v)가
 * 정점마다 옮겨 잰 값과 같은지(행렬·원점·거울·원근 행렬), 축 나란 상자를 v에 비춘 구간보다 좁은지, 수가 아닌 정점·빈 묶음·잘못된 v,
 * 같은 배열·같은 방향 기억과 forgetBounds, 여럿 합치기. 기존 함수(itemBounds 등)는 그대로인지.
 */
import { describe, expect, it } from 'vitest';
import { forgetBounds, itemBounds, itemExtent, itemsExtent, meshBounds, positionsBox } from '../src/bounds';
import { transformPoint } from '../src/math';
import type { LineSet3d, Mesh3d, PointSet3d } from '../src/types';

/** 정점마다 세계 좌표로 옮겨 p·v의 최소·최대(시험의 기준) */
function brute(it: Mesh3d | LineSet3d | PointSet3d, v: readonly number[]): [number, number] | null {
  const p = it.positions;
  const o = it.origin ?? [0, 0, 0];
  const m = (it as Mesh3d).matrix;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i + 2 < p.length; i += 3) {
    const q = [o[0]! + p[i]!, o[1]! + p[i + 1]!, o[2]! + p[i + 2]!];
    if (!q.every(Number.isFinite)) continue;
    const w = m ? transformPoint(m, q) : q;
    const d = w[0]! * v[0]! + w[1]! * v[1]! + w[2]! * v[2]!;
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return lo <= hi ? [lo, hi] : null;
}
const unit = (a: readonly number[]): number[] => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!);
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};
/** 상자 꼭짓점 여덟(그물 — 삼각형은 상관없다) */
function cube(lo: number, hi: number, extra: Pick<Mesh3d, 'matrix' | 'origin'> = {}): Mesh3d {
  const pos: number[] = [];
  for (let i = 0; i < 8; i++) pos.push(i & 1 ? hi : lo, i & 2 ? hi : lo, i & 4 ? hi : lo);
  return { id: '상자', positions: new Float32Array(pos), indices: new Uint32Array([0, 1, 2]), color: [0.5, 0.5, 0.5, 1], ...extra };
}
/** Z축 둘레 a 라디안 돌리고 t만큼 옮기는 열 우선 4×4 */
function rotZ(a: number, t: readonly number[] = [0, 0, 0], s = 1): Float64Array {
  const c = Math.cos(a) * s, n = Math.sin(a) * s;
  return new Float64Array([c, n, 0, 0, -n, c, 0, 0, 0, 0, s, 0, t[0]!, t[1]!, t[2]!, 1]);
}
/** 0~1 고른 수(시험마다 같은 차례) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('itemExtent(0.30.0 — 단위 벡터 v 방향 꼭짓점 지지 범위)', () => {
  it('돌린 상자: 정점마다 옮긴 값과 같고, 축 나란 상자를 v에 비춘 구간보다 좁다', () => {
    const m = cube(-1, 1, { matrix: rotZ(Math.PI / 4, [10, -5, 2]) });
    const s2 = Math.SQRT2;
    // X 방향: 돌린 상자의 꼭짓점은 x = 10 ± √2
    const ex = itemExtent(m, [1, 0, 0])!;
    expect(ex[0]).toBeCloseTo(10 - s2, 12);
    expect(ex[1]).toBeCloseTo(10 + s2, 12);
    // 상자 면과 수직인 방향(45°): 꼭짓점은 ±1 — 축 나란 상자(±√2)를 비추면 ±2로 넉넉하다
    const v = unit([1, 1, 0]);
    const e = itemExtent(m, v)!;
    const c = 10 * v[0]! - 5 * v[1]!;
    expect(e[0]).toBeCloseTo(c - 1, 12);
    expect(e[1]).toBeCloseTo(c + 1, 12);
    const b = meshBounds(m);
    let half = 0, mid = 0;
    for (let k = 0; k < 3; k++) {
      mid += ((b.min[k]! + b.max[k]!) / 2) * v[k]!;
      half += ((b.max[k]! - b.min[k]!) / 2) * Math.abs(v[k]!);
    }
    expect(half).toBeCloseTo(2, 12);
    expect(e[0]).toBeGreaterThan(mid - half + 0.9);
    expect(e[1]).toBeLessThan(mid + half - 0.9);
    // 기존 함수는 그대로(상자 꼭짓점 여덟을 옮겨 감싼다)
    expect(itemBounds(m)).toEqual(meshBounds(m));
  });

  it('원점(큰 좌표)·거울·축척 행렬·선분·점 묶음, 무작위 아핀 행렬과 방향이 정점마다 옮긴 값과 같다', () => {
    const r = rng(7);
    const pts = new Float32Array(600);
    for (let i = 0; i < pts.length; i++) pts[i] = (r() - 0.5) * 40;
    const big: LineSet3d = { id: '선', positions: pts, origin: [1e6, -2e6, 3e5] };
    const dot: PointSet3d = { id: '점', positions: pts, origin: [0.5, 0, -1] };
    for (const it of [big, dot]) {
      for (let k = 0; k < 20; k++) {
        const v = unit([r() - 0.5, r() - 0.5, r() - 0.5]);
        const a = itemExtent(it, v)!, b = brute(it, v)!;
        const tol = 1e-9 * (1 + Math.abs(b[0]) + Math.abs(b[1]));
        expect(Math.abs(a[0] - b[0])).toBeLessThan(tol);
        expect(Math.abs(a[1] - b[1])).toBeLessThan(tol);
      }
    }
    // 원점이 크면 원점·이동은 한 번 더한다 — 정점 좌표가 작아도 그 값이 그대로
    const o = itemExtent(big, [1, 0, 0])!;
    expect(o[0]).toBeGreaterThan(1e6 - 21);
    expect(o[1]).toBeLessThan(1e6 + 21);
    for (let k = 0; k < 30; k++) {
      const mat = new Float64Array(16);
      for (let i = 0; i < 12; i++) mat[i] = (r() - 0.5) * 3;
      mat[3] = mat[7] = mat[11] = 0;
      mat[12] = (r() - 0.5) * 1e4;
      mat[13] = (r() - 0.5) * 1e4;
      mat[14] = (r() - 0.5) * 1e4;
      mat[15] = 1;
      const mesh: Mesh3d = { id: '그물', positions: pts, indices: new Uint32Array([0, 1, 2]), color: [0.5, 0.5, 0.5, 1], matrix: mat, ...(k % 2 ? { origin: [100, 200, -300] as [number, number, number] } : {}) };
      const v = unit([r() - 0.5, r() - 0.5, r() - 0.5]);
      const a = itemExtent(mesh, v)!, b = brute(mesh, v)!;
      const tol = 1e-9 * (1 + Math.abs(b[0]) + Math.abs(b[1]));
      expect(Math.abs(a[0] - b[0])).toBeLessThan(tol);
      expect(Math.abs(a[1] - b[1])).toBeLessThan(tol);
    }
    // 거울(행렬식 < 0)·축척
    const mir = cube(0, 2, { matrix: new Float64Array([-1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1]) });
    expect(itemExtent(mir, [1, 0, 0])).toEqual([3, 5]);
    expect(itemExtent(mir, [0, 1, 0])).toEqual([0, 6]);
  });

  it('원근 행렬(마지막 행이 0·0·0·1이 아님)은 정점마다 옮긴다', () => {
    const m = cube(1, 2, { matrix: new Float64Array([1, 0, 0, 0.1, 0, 1, 0, 0, 0, 0, 1, 0.05, 0, 0, 0, 1]) });
    for (const v of [[1, 0, 0], [0, 1, 0], unit([1, -2, 0.5])]) {
      const a = itemExtent(m, v)!, b = brute(m, v)!;
      expect(a[0]).toBeCloseTo(b[0], 12);
      expect(a[1]).toBeCloseTo(b[1], 12);
    }
  });

  it('수가 아닌 정점은 건너뛰고, 빈 묶음·수가 아닌 v·원점은 null. 길이가 1이 아닌 v는 그 배', () => {
    const p = new Float32Array([0, 0, 0, Number.NaN, 1, 1, 3, 4, 0, Infinity, 0, 0]);
    const l: LineSet3d = { id: '선', positions: p };
    expect(itemExtent(l, [1, 0, 0])).toEqual([0, 3]);
    expect(itemExtent(l, [0, 2, 0])).toEqual([0, 8]);
    expect(itemExtent({ id: '빈', positions: new Float32Array(0) }, [1, 0, 0])).toBeNull();
    expect(itemExtent({ id: '수 아님', positions: new Float32Array([Number.NaN, 0, 0]) }, [1, 0, 0])).toBeNull();
    expect(itemExtent(l, [Number.NaN, 0, 0])).toBeNull();
    expect(itemExtent({ id: '원점', positions: p, origin: [Number.NaN, 0, 0] }, [1, 0, 0])).toBeNull();
  });

  it('같은 배열·같은 방향은 다시 훑지 않고(forgetBounds가 버린다), 여럿은 가장 작은 최소·가장 큰 최대', () => {
    const p = new Float32Array([0, 0, 0, 1, 2, 3]);
    const l: LineSet3d = { id: '선', positions: p };
    expect(itemExtent(l, [0, 0, 1])).toEqual([0, 3]);
    // 제자리에서 고치면 forgetBounds 전에는 앞 값(positionsBox와 같은 규칙)
    p[5] = 9;
    expect(itemExtent(l, [0, 0, 1])).toEqual([0, 3]);
    expect(itemExtent(l, [0, 1, 0])).toEqual([0, 2]);
    forgetBounds(p);
    expect(itemExtent(l, [0, 0, 1])).toEqual([0, 9]);
    expect(positionsBox(p).max[2]).toBe(9);
    // 같은 배열을 다른 원점·행렬의 묶음이 함께 써도 로컬 방향이 같으면 기억한 값 + 그 묶음의 원점
    const l2: LineSet3d = { id: '선 2', positions: p, origin: [0, 0, 100] };
    expect(itemExtent(l2, [0, 0, 1])).toEqual([100, 109]);
    const m = cube(-1, 1, { matrix: rotZ(0, [0, 0, -50]) });
    expect(itemsExtent([l, l2, m], [0, 0, 1])).toEqual([-51, 109]);
    expect(itemsExtent([], [0, 0, 1])).toBeNull();
    expect(itemsExtent([{ id: '빈', positions: new Float32Array(0) }], [1, 0, 0])).toBeNull();
  });
});
