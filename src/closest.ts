/**
 * 두 묶음 사이 가장 가까운 두 점(순수 함수, DOM 없음). Viewer3d.closestPoints가 쓴다.
 *
 * 묶음마다 이미 있는 BVH(삼각형·선분·점)를 함께 내려가며(가지치기: 두 마디 세계 상자 사이 거리 ≥ 지금 최솟값이면 버림)
 * 잎끼리는 기본 도형 쌍의 정확한 최근접점(점·선분·삼각형 조합, double)을 잰다. 모형 행렬(로컬 → 세계: 묶음 원점·Mesh3d.matrix)은
 * 마디 상자 여덟 꼭짓점과 정점을 세계로 옮겨 반영한다(필요한 것만, 한 번씩). 교차하면 거리 0.
 */
import type { Bvh, PrimKind } from './bvh';
import type { V3 } from './math';

export interface ClosestShape {
  kind: PrimKind;
  positions: Float32Array;
  /** 삼각형 정점 번호(없으면 positions를 세 개씩) */
  indices?: Uint32Array;
  bvh: Bvh;
  /** 로컬 → 세계(없으면 단위) */
  model?: ArrayLike<number> | null;
  /** true면 그 기본 도형은 건너뛴다(숨긴 구간) */
  skip?: ((i: number) => boolean) | null;
}

export interface ClosestResult {
  /** 첫 묶음 위 점(세계) */
  a: V3;
  /** 둘째 묶음 위 점(세계) */
  b: V3;
  distance: number;
}

const EPS = 1e-30;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** 두 선분 p1–q1, p2–q2의 최근접점(Ericson 5.1.9) */
export function closestSegSeg(p1: V3, q1: V3, p2: V3, q2: V3): { c1: V3; c2: V3; d2: number } {
  const d1x = q1[0] - p1[0], d1y = q1[1] - p1[1], d1z = q1[2] - p1[2];
  const d2x = q2[0] - p2[0], d2y = q2[1] - p2[1], d2z = q2[2] - p2[2];
  const rx = p1[0] - p2[0], ry = p1[1] - p2[1], rz = p1[2] - p2[2];
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s: number, t: number;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const den = a * e - b * b;
      s = den > EPS * a * e ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const c1: V3 = [p1[0] + d1x * s, p1[1] + d1y * s, p1[2] + d1z * s];
  const c2: V3 = [p2[0] + d2x * t, p2[1] + d2y * t, p2[2] + d2z * t];
  const dx = c1[0] - c2[0], dy = c1[1] - c2[1], dz = c1[2] - c2[2];
  return { c1, c2, d2: dx * dx + dy * dy + dz * dz };
}

/** 점 p에서 선분 a–b 위 가장 가까운 점 */
export function closestPtSeg(p: V3, a: V3, b: V3): V3 {
  const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
  const l2 = ex * ex + ey * ey + ez * ez;
  const t = l2 > EPS ? clamp01(((p[0] - a[0]) * ex + (p[1] - a[1]) * ey + (p[2] - a[2]) * ez) / l2) : 0;
  return [a[0] + ex * t, a[1] + ey * t, a[2] + ez * t];
}

/** 점 p에서 삼각형 abc 위 가장 가까운 점(Ericson 5.1.5) */
export function closestPtTri(p: V3, a: V3, b: V3, c: V3): V3 {
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
  const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return [a[0], a[1], a[2]];
  const bpx = p[0] - b[0], bpy = p[1] - b[1], bpz = p[2] - b[2];
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return [b[0], b[1], b[2]];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return [a[0] + abx * v, a[1] + aby * v, a[2] + abz * v];
  }
  const cpx = p[0] - c[0], cpy = p[1] - c[1], cpz = p[2] - c[2];
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return [c[0], c[1], c[2]];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return [a[0] + acx * w, a[1] + acy * w, a[2] + acz * w];
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
  }
  const den = va + vb + vc;
  if (!(Math.abs(den) > 0)) return [a[0], a[1], a[2]];
  const v = vb / den, w = vc / den;
  return [a[0] + abx * v + acx * w, a[1] + aby * v + acy * w, a[2] + abz * v + acz * w];
}

/** 선분 p–q가 삼각형 abc를 지나는 점(없으면 null, Möller–Trumbore를 선분 구간으로) */
export function segTriIntersect(p: V3, q: V3, a: V3, b: V3, c: V3): V3 | null {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
  const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
  const hx = dy * e2z - dz * e2y, hy = dz * e2x - dx * e2z, hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  const scale = Math.hypot(e1x, e1y, e1z) * Math.hypot(e2x, e2y, e2z) * Math.hypot(dx, dy, dz);
  if (!(Math.abs(det) > scale * 1e-14)) return null;
  const inv = 1 / det;
  const sx = p[0] - a[0], sy = p[1] - a[1], sz = p[2] - a[2];
  const u = (sx * hx + sy * hy + sz * hz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (t < 0 || t > 1) return null;
  return [p[0] + dx * t, p[1] + dy * t, p[2] + dz * t];
}

const d2of = (a: V3, b: V3): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** 선분 p–q와 삼각형 abc의 최근접점(c1은 선분 위, c2는 삼각형 위) */
export function closestSegTri(p: V3, q: V3, a: V3, b: V3, c: V3): { c1: V3; c2: V3; d2: number } {
  const x = segTriIntersect(p, q, a, b, c);
  if (x) return { c1: x, c2: x, d2: 0 };
  let best = closestSegSeg(p, q, a, b);
  for (const [u, v] of [
    [b, c],
    [c, a],
  ] as const) {
    const r = closestSegSeg(p, q, u, v);
    if (r.d2 < best.d2) best = r;
  }
  for (const e of [p, q]) {
    const t = closestPtTri(e, a, b, c);
    const d = d2of(e, t);
    if (d < best.d2) best = { c1: e, c2: t, d2: d };
  }
  return best;
}

/** 두 삼각형의 최근접점(c1은 첫 삼각형 위). 서로 걸치면 거리 0 */
export function closestTriTri(A: readonly [V3, V3, V3], B: readonly [V3, V3, V3]): { c1: V3; c2: V3; d2: number } {
  let best: { c1: V3; c2: V3; d2: number } | null = null;
  for (let i = 0; i < 3; i++) {
    const r = closestSegTri(A[i]!, A[(i + 1) % 3]!, B[0], B[1], B[2]);
    if (!best || r.d2 < best.d2) best = r;
    if (best.d2 === 0) return best;
  }
  for (let i = 0; i < 3; i++) {
    const r = closestSegTri(B[i]!, B[(i + 1) % 3]!, A[0], A[1], A[2]);
    if (r.d2 < best!.d2) best = { c1: r.c2, c2: r.c1, d2: r.d2 };
    if (best!.d2 === 0) return best!;
  }
  return best!;
}

/** 기본 도형(정점 1~3개) 둘의 최근접점 */
function closestPrims(A: V3[], B: V3[]): { c1: V3; c2: V3; d2: number } {
  const na = A.length, nb = B.length;
  if (na > nb) {
    const r = closestPrims(B, A);
    return { c1: r.c2, c2: r.c1, d2: r.d2 };
  }
  if (na === 1) {
    const p = A[0]!;
    const q = nb === 1 ? B[0]! : nb === 2 ? closestPtSeg(p, B[0]!, B[1]!) : closestPtTri(p, B[0]!, B[1]!, B[2]!);
    return { c1: p, c2: q, d2: d2of(p, q) };
  }
  if (na === 2) return nb === 2 ? closestSegSeg(A[0]!, A[1]!, B[0]!, B[1]!) : closestSegTri(A[0]!, A[1]!, B[0]!, B[1]!, B[2]!);
  return closestTriTri(A as [V3, V3, V3], B as [V3, V3, V3]);
}

/** 묶음 하나의 세계 마디 상자·정점(필요할 때 한 번씩 계산해 둔다) */
class WorldShape {
  readonly s: ClosestShape;
  private boxes: Float64Array;
  private boxDone: Uint8Array;
  private verts: Float64Array | null;
  private vertDone: Uint8Array | null;
  readonly perPrim: number;
  constructor(s: ClosestShape) {
    this.s = s;
    this.boxes = new Float64Array(s.bvh.nodeCount * 6);
    this.boxDone = new Uint8Array(s.bvh.nodeCount);
    const nv = Math.floor(s.positions.length / 3);
    this.verts = s.model ? new Float64Array(nv * 3) : null;
    this.vertDone = s.model ? new Uint8Array(nv) : null;
    this.perPrim = s.kind === 'triangle' ? 3 : s.kind === 'segment' ? 2 : 1;
  }

  /** 마디 ni의 세계 상자(out 안 o부터 [min xyz, max xyz]) */
  box(ni: number): Float64Array {
    const b = this.boxes;
    const o = ni * 6;
    if (this.boxDone[ni]) return b.subarray(o, o + 6);
    const L = this.s.bvh.box;
    const M = this.s.model;
    if (!M) for (let k = 0; k < 6; k++) b[o + k] = L[o + k]!;
    else {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < 8; i++) {
        const x = L[o + (i & 1 ? 3 : 0)]!, y = L[o + (i & 2 ? 4 : 1)]!, z = L[o + (i & 4 ? 5 : 2)]!;
        const wx = M[0]! * x + M[4]! * y + M[8]! * z + M[12]!;
        const wy = M[1]! * x + M[5]! * y + M[9]! * z + M[13]!;
        const wz = M[2]! * x + M[6]! * y + M[10]! * z + M[14]!;
        if (wx < x0) x0 = wx;
        if (wx > x1) x1 = wx;
        if (wy < y0) y0 = wy;
        if (wy > y1) y1 = wy;
        if (wz < z0) z0 = wz;
        if (wz > z1) z1 = wz;
      }
      // float32 상자를 세계로 옮긴 반올림 여유
      const pad = (Math.abs(x1 - x0) + Math.abs(y1 - y0) + Math.abs(z1 - z0)) * 1e-7;
      b[o] = x0 - pad;
      b[o + 1] = y0 - pad;
      b[o + 2] = z0 - pad;
      b[o + 3] = x1 + pad;
      b[o + 4] = y1 + pad;
      b[o + 5] = z1 + pad;
    }
    this.boxDone[ni] = 1;
    return b.subarray(o, o + 6);
  }

  vert(v: number): V3 {
    const P = this.s.positions;
    const M = this.s.model;
    if (!M) return [P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!];
    const W = this.verts!;
    if (!this.vertDone![v]) {
      const x = P[v * 3]!, y = P[v * 3 + 1]!, z = P[v * 3 + 2]!;
      W[v * 3] = M[0]! * x + M[4]! * y + M[8]! * z + M[12]!;
      W[v * 3 + 1] = M[1]! * x + M[5]! * y + M[9]! * z + M[13]!;
      W[v * 3 + 2] = M[2]! * x + M[6]! * y + M[10]! * z + M[14]!;
      this.vertDone![v] = 1;
    }
    return [W[v * 3]!, W[v * 3 + 1]!, W[v * 3 + 2]!];
  }

  prim(i: number): V3[] {
    const s = this.s;
    if (s.kind === 'triangle') {
      const I = s.indices;
      return I ? [this.vert(I[i * 3]!), this.vert(I[i * 3 + 1]!), this.vert(I[i * 3 + 2]!)] : [this.vert(i * 3), this.vert(i * 3 + 1), this.vert(i * 3 + 2)];
    }
    if (s.kind === 'segment') return [this.vert(i * 2), this.vert(i * 2 + 1)];
    return [this.vert(i)];
  }
}

/** 두 세계 상자 사이 거리의 제곱 */
function boxDist2(a: Float64Array, b: Float64Array): number {
  let d = 0;
  for (let k = 0; k < 3; k++) {
    const g = Math.max(0, a[k]! - b[k + 3]!, b[k]! - a[k + 3]!);
    d += g * g;
  }
  return d;
}

const boxSize = (b: Float64Array): number => b[3]! - b[0]! + (b[4]! - b[1]!) + (b[5]! - b[2]!);

/**
 * 두 묶음 사이 가장 가까운 두 점(세계). maxDistance를 주면 그보다 먼 결과는 찾지 않고 null.
 * 기본 도형이 없으면 null.
 */
export function closestBetween(A: ClosestShape, B: ClosestShape, opts: { maxDistance?: number } = {}): ClosestResult | null {
  if (!A.bvh.count || !B.bvh.count) return null;
  const wa = new WorldShape(A), wb = new WorldShape(B);
  const max = opts.maxDistance;
  let best2 = max !== undefined && max >= 0 ? max * max : Infinity;
  let best: { c1: V3; c2: V3 } | null = null;
  const na = A.bvh.node, nb = B.bvh.node;
  const stack: number[] = [0, 0];
  while (stack.length) {
    const j = stack.pop()!, i = stack.pop()!;
    const ba = wa.box(i), bb = wb.box(j);
    if (boxDist2(ba, bb) > best2 || (best && boxDist2(ba, bb) === best2)) continue;
    const aa = na[i * 2]!, ak = na[i * 2 + 1]!, ba0 = nb[j * 2]!, bk = nb[j * 2 + 1]!;
    const leafA = ak > 0 || aa === 0xffffffff, leafB = bk > 0 || ba0 === 0xffffffff;
    if (leafA && leafB) {
      if (ak === 0 || bk === 0) continue;
      for (let x = aa; x < aa + ak; x++) {
        const pi = A.bvh.order[x]!;
        if (A.skip && A.skip(pi)) continue;
        const PA = wa.prim(pi);
        for (let y = ba0; y < ba0 + bk; y++) {
          const pj = B.bvh.order[y]!;
          if (B.skip && B.skip(pj)) continue;
          const r = closestPrims(PA, wb.prim(pj));
          if (r.d2 < best2 || (!best && r.d2 <= best2)) {
            best2 = r.d2;
            best = { c1: r.c1, c2: r.c2 };
            if (best2 === 0) return { a: r.c1, b: r.c2, distance: 0 };
          }
        }
      }
      continue;
    }
    // 큰 쪽(또는 잎이 아닌 쪽)을 나누고, 가까운 쌍을 나중에 넣어 먼저 꺼낸다
    const splitA = !leafA && (leafB || boxSize(ba) >= boxSize(bb));
    const pairs: [number, number][] = splitA
      ? [
          [aa, j],
          [aa + 1, j],
        ]
      : [
          [i, ba0],
          [i, ba0 + 1],
        ];
    const d0 = boxDist2(wa.box(pairs[0]![0]), wb.box(pairs[0]![1]));
    const d1 = boxDist2(wa.box(pairs[1]![0]), wb.box(pairs[1]![1]));
    const order = d0 <= d1 ? [pairs[1]!, pairs[0]!] : [pairs[0]!, pairs[1]!];
    for (const [p, q] of order) stack.push(p, q);
  }
  if (!best) return null;
  return { a: best.c1, b: best.c2, distance: Math.sqrt(best2) };
}
