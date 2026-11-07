/**
 * 두 묶음 사이 가장 가까운 두 점(순수 함수, DOM 없음). Viewer3d.closestPoints가 쓴다.
 *
 * 묶음마다 이미 있는 BVH(삼각형·선분·점)를 함께 내려가며(가지치기: 두 마디 세계 상자 사이 거리 ≥ 지금 최솟값이면 버림)
 * 잎끼리는 기본 도형 쌍의 정확한 최근접점(점·선분·삼각형 조합, double)을 잰다. 모형 행렬(로컬 → 세계: 묶음 원점·Mesh3d.matrix)은
 * 마디 상자 여덟 꼭짓점과 정점을 세계로 옮겨 반영한다(필요한 것만, 한 번씩). 교차하면 거리 0.
 * 0.45.0: 묶음 안 구간(면 표의 삼각형 구간 등)만 담은 모양 조각(closestPart — 이어진 구간 하나는 배열의 subarray로 복사 없이, 그 구간만의 BVH)끼리도 잰다.
 */
import { type Bvh, type PrimKind, buildBvh, primCount } from './bvh';
import type { V3 } from './math';
import { type IndexRange, mergeRanges, rangesTotal } from './ranges';

export interface ClosestShape {
  kind: PrimKind;
  positions: Float32Array;
  /** 삼각형 정점 번호(없으면 positions를 세 개씩) */
  indices?: Uint32Array;
  bvh: Bvh;
  /** 로컬 → 세계(없으면 단위) */
  model?: ArrayLike<number> | null;
  /** true면 그 기본 도형은 건너뛴다(숨긴 구간 — 0.45.0 구간 모양이면 묶음 번호로 묻는다) */
  skip?: ((i: number) => boolean) | null;
  /**
   * 0.45.0 구간 모양(closestPart): 이 모양의 기본 도형 i는 묶음의 기본 도형 map[i](map이 없으면 offset + i)다 — skip은 묶음 번호로 묻고 결과 rawA·rawB도 묶음 번호다.
   * 없으면 0·null(0.44.0 그대로 — 모양 번호가 곧 묶음 번호)
   */
  offset?: number;
  map?: Uint32Array | null;
}

/**
 * 0.45.0 묶음 안 구간만 담은 최근접점 모양 조각(closestPart): 정점 배열·번호 배열(이어진 구간 하나면 원래 배열의 subarray — 복사 없음, 여러 구간이면 모은 것)과
 * 그 구간만의 BVH, 모양 번호 → 묶음 번호(offset·map). ClosestShape의 같은 이름 필드로 그대로 넘긴다
 */
export interface ClosestPart {
  kind: PrimKind;
  positions: Float32Array;
  indices?: Uint32Array;
  bvh: Bvh;
  offset: number;
  map: Uint32Array | null;
  /** 담은 기본 도형 수 */
  count: number;
  /** 새로 잡은 바이트(BVH 배열과 모은 배열·번호 표 — subarray는 0) */
  bytes: number;
}

/**
 * 0.45.0 묶음(kind·positions·indices)의 기본 도형 구간들(그물 = 삼각형, 선분 묶음 = 선분, 점 묶음 = 점 — Pick3d.raw·setHiddenRanges와 같은 번호)만 담은 모양 조각.
 * 구간은 mergeRanges로 합치고 묶음 수 밖은 자른다(남는 것이 없으면 null). 이어진 구간 하나면 번호 배열(번호 없는 그물·선분·점이면 정점 배열)의 subarray로 복사 없이,
 * 여럿이면 번호 배열을 모으고(번호 없는 그물은 정점 번호를 만들고, 선분·점은 정점을 모은다) 그 구간만의 BVH를 만든다(buildBvh — 구간 기본 도형 수에 비례).
 * 같은 기본 도형을 같은 차례로 따로 담은 묶음의 BVH와 같은 나무라, 앱이 그 구간을 따로 묶음으로 만들어 잰 것과 같은 답(두 점·거리 — 번호는 묶음 번호)이다
 */
export function closestPart(kind: PrimKind, positions: Float32Array, indices: Uint32Array | undefined, ranges: readonly IndexRange[]): ClosestPart | null {
  const R = mergeRanges(ranges, primCount(kind, positions, indices));
  if (!R.length) return null;
  const count = rangesTotal(R);
  const per = kind === 'triangle' ? 9 : kind === 'segment' ? 6 : 3;
  let P = positions, I: Uint32Array | undefined, offset = 0, map: Uint32Array | null = null, bytes = 0;
  if (R.length === 1) {
    const { start } = R[0]!;
    offset = start;
    if (kind === 'triangle' && indices) I = indices.subarray(start * 3, (start + count) * 3);
    else P = positions.subarray(start * per, (start + count) * per);
  } else {
    map = new Uint32Array(count);
    let k = 0;
    for (const r of R) for (let i = r.start; i < r.start + r.count; i++) map[k++] = i;
    bytes += map.byteLength;
    if (kind === 'triangle') {
      I = new Uint32Array(count * 3);
      for (let j = 0; j < count; j++) {
        const t = map[j]!;
        I[j * 3] = indices ? indices[t * 3]! : t * 3;
        I[j * 3 + 1] = indices ? indices[t * 3 + 1]! : t * 3 + 1;
        I[j * 3 + 2] = indices ? indices[t * 3 + 2]! : t * 3 + 2;
      }
      bytes += I.byteLength;
    } else {
      P = new Float32Array(count * per);
      for (let j = 0; j < count; j++) P.set(positions.subarray(map[j]! * per, map[j]! * per + per), j * per);
      bytes += P.byteLength;
    }
  }
  const bvh = buildBvh(kind, P, I);
  bytes += bvh.box.byteLength + bvh.node.byteLength + bvh.order.byteLength;
  const out: ClosestPart = { kind, positions: P, bvh, offset, map, count, bytes };
  if (I) out.indices = I;
  return out;
}

export interface ClosestResult {
  /** 첫 묶음 위 점(세계) */
  a: V3;
  /** 둘째 묶음 위 점(세계) */
  b: V3;
  distance: number;
  /**
   * 0.41.0(indices를 줬을 때만): 두 점이 놓인 기본 도형의 배열 안 번호(Pick3d.raw와 같은 뜻 — 그물은 삼각형 번호, 선분 묶음·점 묶음은 segmentIds·pointIds를 거치기 전 번호).
   * 두 묶음이 걸치면(거리 0) 처음 찾은 걸친 쌍
   */
  rawA?: number;
  rawB?: number;
  /** 0.41.0(Viewer3d.closestPoints에 indices를 줬을 때만): 원본 식별 번호(Pick3d.index와 같은 뜻 — segmentIds·pointIds를 거친 번호, 그물이면 삼각형 번호) */
  indexA?: number;
  indexB?: number;
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
  /**
   * 0.45.0 구간 모양이 큰 그물의 정점 배열을 함께 쓰고 쓰는 정점이 적으면(번호 수 × 4 < 정점 수) 세계 정점을 정점 수만큼의 배열 대신 Map에 둔다
   * (작은 면 하나를 잴 때마다 그물 정점 수만큼 잡지 않게 — 값은 같은 셈이다)
   */
  private sparse: Map<number, V3> | null = null;
  readonly perPrim: number;
  constructor(s: ClosestShape) {
    this.s = s;
    this.boxes = new Float64Array(s.bvh.nodeCount * 6);
    this.boxDone = new Uint8Array(s.bvh.nodeCount);
    const nv = Math.floor(s.positions.length / 3);
    this.perPrim = s.kind === 'triangle' ? 3 : s.kind === 'segment' ? 2 : 1;
    if (s.model && (s.offset !== undefined || s.map) && s.indices && s.indices.length * 4 < nv) {
      this.sparse = new Map();
      this.verts = this.vertDone = null;
    } else {
      this.verts = s.model ? new Float64Array(nv * 3) : null;
      this.vertDone = s.model ? new Uint8Array(nv) : null;
    }
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
    const S = this.sparse;
    if (S) {
      let w = S.get(v);
      if (!w) {
        const x = P[v * 3]!, y = P[v * 3 + 1]!, z = P[v * 3 + 2]!;
        w = [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!];
        S.set(v, w);
      }
      return [w[0], w[1], w[2]];
    }
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

/** 최근접점 찾기 선택(0.41.0 — indices: 결과에 두 기본 도형의 배열 안 번호 rawA·rawB를 싣는다) */
export interface ClosestOptions {
  maxDistance?: number;
  indices?: boolean;
}

/**
 * 두 묶음 사이 최근접점 찾기를 나눠 돌리는 상태(0.41.0). closestBetween은 이것을 한 번에 끝까지 돌린다(step(Infinity)).
 * 마디 쌍 더미(stack)·지금 최솟값·세계 상자·정점 기억을 들고 있어, step(n)으로 마디 쌍 n개씩 이어 꺼내도 한 번에 돌린 것과
 * 같은 차례로 같은 쌍을 보고 같은 답(두 점·거리·기본 도형 번호 — 바이트까지)을 낸다. 모양(정점·BVH·행렬·숨김)은 끝날 때까지 바뀌지 않아야 한다
 */
export class ClosestSearch {
  private readonly A: ClosestShape;
  private readonly B: ClosestShape;
  private readonly wa: WorldShape | null;
  private readonly wb: WorldShape | null;
  private readonly indices: boolean;
  private best2: number;
  private best: { c1: V3; c2: V3; ia: number; ib: number } | null = null;
  private readonly stack: number[];
  private out: ClosestResult | null | undefined;
  /** 0.45.0 모양 번호 → 묶음 번호(구간 모양 — 없으면 0·null) */
  private readonly offA: number;
  private readonly offB: number;
  private readonly mapA: Uint32Array | null;
  private readonly mapB: Uint32Array | null;
  /** 지금까지 꺼낸 마디 쌍 수 */
  visited = 0;

  constructor(A: ClosestShape, B: ClosestShape, opts: ClosestOptions = {}) {
    this.A = A;
    this.B = B;
    this.offA = A.offset ?? 0;
    this.offB = B.offset ?? 0;
    this.mapA = A.map ?? null;
    this.mapB = B.map ?? null;
    this.indices = opts.indices === true;
    const max = opts.maxDistance;
    this.best2 = max !== undefined && max >= 0 ? max * max : Infinity;
    if (!A.bvh.count || !B.bvh.count) {
      this.wa = this.wb = null;
      this.stack = [];
      this.out = null;
    } else {
      this.wa = new WorldShape(A);
      this.wb = new WorldShape(B);
      this.stack = [0, 0];
      this.out = undefined;
    }
  }

  /** 끝났는지 */
  get done(): boolean {
    return this.out !== undefined;
  }

  /** 답(끝나기 전에는 undefined) — 가장 가까운 두 점(세계)·거리, indices면 기본 도형 번호. maxDistance보다 멀거나 기본 도형이 없으면 null */
  get result(): ClosestResult | null | undefined {
    return this.out;
  }

  private finish(c1: V3, c2: V3, d2: number, ia: number, ib: number): void {
    const r: ClosestResult = { a: c1, b: c2, distance: d2 === 0 ? 0 : Math.sqrt(d2) };
    if (this.indices) {
      r.rawA = ia;
      r.rawB = ib;
    }
    this.out = r;
    this.stack.length = 0;
  }

  /** 마디 쌍을 n개까지 꺼내 본다(잎끼리면 그 기본 도형 쌍을 모두 잰다). 끝났으면 true */
  step(n = Infinity): boolean {
    if (this.out !== undefined) return true;
    const A = this.A, B = this.B, wa = this.wa!, wb = this.wb!;
    const na = A.bvh.node, nb = B.bvh.node;
    const stack = this.stack;
    let best2 = this.best2;
    let best = this.best;
    // 0.45.0 모양 번호 → 묶음 번호(구간 모양이 아니면 0 · null — 그대로)
    const offA = this.offA, offB = this.offB, mapA = this.mapA, mapB = this.mapB;
    let k = 0;
    while (stack.length && k < n) {
      k++;
      const j = stack.pop()!, i = stack.pop()!;
      const ba = wa.box(i), bb = wb.box(j);
      if (boxDist2(ba, bb) > best2 || (best && boxDist2(ba, bb) === best2)) continue;
      const aa = na[i * 2]!, ak = na[i * 2 + 1]!, ba0 = nb[j * 2]!, bk = nb[j * 2 + 1]!;
      const leafA = ak > 0 || aa === 0xffffffff, leafB = bk > 0 || ba0 === 0xffffffff;
      if (leafA && leafB) {
        if (ak === 0 || bk === 0) continue;
        for (let x = aa; x < aa + ak; x++) {
          const pi = A.bvh.order[x]!;
          const ra = mapA ? mapA[pi]! : offA + pi;
          if (A.skip && A.skip(ra)) continue;
          const PA = wa.prim(pi);
          for (let y = ba0; y < ba0 + bk; y++) {
            const pj = B.bvh.order[y]!;
            const rb = mapB ? mapB[pj]! : offB + pj;
            if (B.skip && B.skip(rb)) continue;
            const r = closestPrims(PA, wb.prim(pj));
            if (r.d2 < best2 || (!best && r.d2 <= best2)) {
              best2 = r.d2;
              best = { c1: r.c1, c2: r.c2, ia: ra, ib: rb };
              if (best2 === 0) {
                this.visited += k;
                this.finish(r.c1, r.c2, 0, ra, rb);
                return true;
              }
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
    this.visited += k;
    this.best2 = best2;
    this.best = best;
    if (stack.length) return false;
    if (!best) this.out = null;
    else this.finish(best.c1, best.c2, best2, best.ia, best.ib);
    return true;
  }
}

/**
 * 두 묶음 사이 가장 가까운 두 점(세계). maxDistance를 주면 그보다 먼 결과는 찾지 않고 null.
 * 기본 도형이 없으면 null. 0.41.0: indices면 두 기본 도형의 배열 안 번호(rawA·rawB)도 싣는다
 */
export function closestBetween(A: ClosestShape, B: ClosestShape, opts: ClosestOptions = {}): ClosestResult | null {
  const s = new ClosestSearch(A, B, opts);
  s.step(Infinity);
  return s.result!;
}

/** 나눠 돌리기 사이에 쉴 틈(0.41.0 closestBetweenAsync) */
export type ClosestYield = () => Promise<void>;

/** 한 조각에서 시계를 보는 간격(마디 쌍 수) — performance.now()를 너무 자주 부르지 않게 */
const CLOCK_EVERY = 64;

/**
 * 두 묶음 사이 최근접점을 시간 조각으로 나눠 찾는다(0.41.0, 순수 — 쉬는 길 wait는 부르는 쪽이 준다). 조각마다 sliceMs(기본 8)를 넘기 전에 멈추고
 * wait()를 기다린 뒤 이어 간다. 답은 closestBetween(같은 입력)과 바이트까지 같다(같은 ClosestSearch를 같은 차례로 돌린다).
 * signal이 멈추면 signal.reason으로 거절한다. now는 시계(기본 performance.now — 시험에서 바꾼다). 조각 수·가장 긴 조각은 stats에 적는다
 */
export async function closestBetweenAsync(
  A: ClosestShape,
  B: ClosestShape,
  opts: ClosestOptions & { signal?: AbortSignal | null; sliceMs?: number; wait: ClosestYield; now?: () => number; stats?: ClosestSliceStats },
): Promise<ClosestResult | null> {
  const s = new ClosestSearch(A, B, opts);
  const now = opts.now ?? (() => performance.now());
  const ms = sliceRange(opts.sliceMs);
  for (;;) {
    opts.signal?.throwIfAborted();
    if (closestSlice(s, ms, now, opts.stats)) return s.result!;
    await opts.wait();
  }
}

/** 조각 하나(0.41.0): 끝나거나 ms가 지날 때까지 마디 쌍을 CLOCK_EVERY개씩 꺼낸다. 끝났으면 true. stats를 주면 조각 수·가장 긴 조각·꺼낸 수를 적는다 */
export function closestSlice(s: ClosestSearch, ms: number, now: () => number, stats?: ClosestSliceStats | null): boolean {
  const t0 = now();
  while (!s.step(CLOCK_EVERY) && now() - t0 < ms);
  if (stats) {
    stats.slices++;
    stats.longest = Math.max(stats.longest, now() - t0);
    stats.visited = s.visited;
  }
  return s.done;
}

/**
 * 나눠 돌린 기록(0.41.0 — 부르는 쪽이 0으로 채운 객체를 주면 그 자리에 적는다): 조각 수, 가장 긴 조각(ms — 그 시계로 잰 것), 마지막 찾기에서 꺼낸 마디 쌍 수,
 * 모양이 바뀌어 처음부터 다시 찾은 횟수(Viewer3d.closestPointsAsync만 — 순수 함수는 세지 않는다)
 */
export interface ClosestSliceStats {
  slices: number;
  longest: number;
  visited: number;
  restarts: number;
}

/** 나눠 돌리는 동안 모양이 바뀌었는지 볼 열쇠(0.41.0): 정점·번호 배열·BVH·숨김 함수는 같은 객체여야 하고, 모형 행렬은 값으로 견준다 */
export interface ClosestKey {
  s: ClosestShape;
  model: number[] | null;
}

export function closestKey(s: ClosestShape): ClosestKey {
  return { s, model: s.model ? Array.from(s.model, Number) : null };
}

export function sameClosestKey(a: ClosestKey, b: ClosestKey): boolean {
  const s = a.s, t = b.s;
  if (s.kind !== t.kind || s.positions !== t.positions || s.indices !== t.indices || s.bvh !== t.bvh || (s.skip ?? null) !== (t.skip ?? null)) return false;
  // 0.45.0 구간 모양의 번호 돌리기
  if ((s.offset ?? 0) !== (t.offset ?? 0) || (s.map ?? null) !== (t.map ?? null)) return false;
  const m = a.model, n = b.model;
  if (!m || !n) return !m && !n;
  if (m.length !== n.length) return false;
  for (let i = 0; i < m.length; i++) if (!Object.is(m[i], n[i])) return false;
  return true;
}

/** 조각 시간(ms) 고르기: 수이고 0보다 크면 그대로(1000 위는 1000), 아니면 기본 8 */
export function sliceRange(v: unknown): number {
  return typeof v === 'number' && v > 0 ? Math.min(v, 1000) : CLOSEST_SLICE_MS;
}

/** 나눠 돌리기 기본 조각 시간(ms, 0.41.0) — 60 Hz 한 프레임(16.7 ms)의 절반 남짓이라 그리기·입력 틈이 남는다 */
export const CLOSEST_SLICE_MS = 8;
