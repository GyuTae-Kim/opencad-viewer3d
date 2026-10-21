/**
 * 단면 보기용 순수 계산(DOM·WebGL 없음): 평면 표현과 로컬 좌표로 옮기기, 장면 범위 안 위치(0~1),
 * 평면 ∩ 상자 다각형, 광선·선분 자르기, 그물 교선(단면 테두리), 화면 끌기 → 평면 이동량.
 *
 * 평면은 Plane4 = [a, b, c, w]: 값 = a·x + b·y + c·z + w. 값 > 0 쪽(법선 쪽)을 잘라 내고 값 ≤ 0 쪽을 남긴다.
 * 세계 평면 "normal·p = offset"(normal 단위)은 [nx, ny, nz, −offset]이다.
 */
import type { Box3 } from './types';
import type { Bvh } from './bvh';
import { boxCorners, boxIsEmpty } from './bounds';
import { type ViewFrame, projectToScreen, viewDepth, worldPerPixel } from './camera';
import { type V3, cross, dot, length, normalize } from './math';

export type Plane4 = [number, number, number, number];
export type SectionAxis = 'x' | 'y' | 'z';

export const AXIS_DIRS: Readonly<Record<SectionAxis, V3>> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

/** 아무것도 자르지 않는 평면(값이 늘 −1). 셰이더에 "단면 없음"으로 넘긴다 */
export const NO_CLIP: Readonly<Plane4> = [0, 0, 0, -1];

/** normal·p = offset 평면(normal은 길이와 상관없음 — 단위로 맞추고 offset도 같은 비율로 나눈다). normal이 0이면 null */
export function planeFrom(normal: readonly number[], offset: number): { normal: V3; offset: number; plane: Plane4 } | null {
  const l = length(normal);
  if (!(l > 0) || !Number.isFinite(l) || !Number.isFinite(offset)) return null;
  const n: V3 = [normal[0]! / l, normal[1]! / l, normal[2]! / l];
  const d = offset / l;
  return { normal: n, offset: d, plane: [n[0], n[1], n[2], -d] };
}

export function planeValue(p: Readonly<Plane4>, x: number, y: number, z: number): number {
  return p[0] * x + p[1] * y + p[2] * z + p[3];
}

/**
 * 세계 평면 → 로컬 평면(세계 = model · 로컬). plane · (M·[x, 1]) = (Mᵀ·plane) · [x, 1].
 * double로 계산하므로 큰 좌표의 원점(RTC)을 합친 행렬에서도 w가 정밀하다. model이 없으면 그대로.
 */
export function planeToLocal(p: Readonly<Plane4>, model?: ArrayLike<number> | null): Plane4 {
  if (!model) return [p[0], p[1], p[2], p[3]];
  const m = model;
  const [a, b, c, w] = p;
  return [
    m[0]! * a + m[1]! * b + m[2]! * c + m[3]! * w,
    m[4]! * a + m[5]! * b + m[6]! * c + m[7]! * w,
    m[8]! * a + m[9]! * b + m[10]! * c + m[11]! * w,
    m[12]! * a + m[13]! * b + m[14]! * c + m[15]! * w,
  ];
}

/** 원점 o만큼 옮긴 로컬(세계 = o + 로컬) 평면 */
export function planeShift(p: Readonly<Plane4>, o: readonly number[] | undefined | null): Plane4 {
  if (!o) return [p[0], p[1], p[2], p[3]];
  return [p[0], p[1], p[2], p[3] + p[0] * o[0]! + p[1] * o[1]! + p[2] * o[2]!];
}

/** 상자를 방향 dir(단위)로 잰 범위: min ≤ dir·p ≤ max. 빈 상자면 {0, 0} */
export function boxRange(b: Box3, dir: readonly number[]): { min: number; max: number } {
  if (boxIsEmpty(b)) return { min: 0, max: 0 };
  let min = 0, max = 0;
  for (let k = 0; k < 3; k++) {
    const d = dir[k]!;
    const lo = d * b.min[k]!, hi = d * b.max[k]!;
    min += Math.min(lo, hi);
    max += Math.max(lo, hi);
  }
  return { min, max };
}

/** 범위 [min, max] 안 위치 0~1(범위가 0이면 0.5) */
export function rangeFraction(v: number, r: { min: number; max: number }): number {
  const s = r.max - r.min;
  return s > 0 ? (v - r.min) / s : 0.5;
}

/** 상자 값 범위가 평면을 걸치는지(잘린 쪽과 남는 쪽에 모두 걸친다) */
export function boxStraddles(b: Box3, p: Readonly<Plane4>): boolean {
  if (boxIsEmpty(b)) return false;
  let lo = p[3], hi = p[3];
  for (let k = 0; k < 3; k++) {
    const a = p[k]! * b.min[k]!, c = p[k]! * b.max[k]!;
    lo += Math.min(a, c);
    hi += Math.max(a, c);
  }
  return lo <= 0 && hi > 0;
}

/** 상자가 통째로 잘린 쪽에 있는지 */
export function boxRemoved(b: Box3, p: Readonly<Plane4>): boolean {
  if (boxIsEmpty(b)) return false;
  let lo = p[3];
  for (let k = 0; k < 3; k++) lo += Math.min(p[k]! * b.min[k]!, p[k]! * b.max[k]!);
  return lo > 0;
}

const BOX_EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [2, 3], [4, 5], [6, 7],
  [0, 2], [1, 3], [4, 6], [5, 7],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

/** 평면 ∩ 상자 = 볼록 다각형(꼭짓점을 평면 위에서 돌아가는 차례로). 안 만나면 빈 배열 */
export function planeBoxPolygon(b: Box3, p: Readonly<Plane4>): V3[] {
  if (boxIsEmpty(b)) return [];
  const cs = boxCorners(b);
  const v = cs.map((c) => planeValue(p, c[0], c[1], c[2]));
  const pts: V3[] = [];
  const size = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2], 1e-300);
  const eps = size * 1e-9;
  for (const [i, j] of BOX_EDGES) {
    const a = v[i]!, c = v[j]!;
    if (a > 0 === c > 0) continue;
    const t = a / (a - c);
    const A = cs[i]!, B = cs[j]!;
    const q: V3 = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];
    if (!pts.some((r) => Math.abs(r[0] - q[0]) <= eps && Math.abs(r[1] - q[1]) <= eps && Math.abs(r[2] - q[2]) <= eps)) pts.push(q);
  }
  if (pts.length < 3) return [];
  // 평면 위 2D 틀(u, v)에서 가운데 둘레 각도로 늘어놓는다
  const n = normalize([p[0], p[1], p[2]]);
  const ref: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(n, ref));
  const w = cross(n, u);
  const c: V3 = [0, 0, 0];
  for (const q of pts) for (let k = 0; k < 3; k++) c[k] += q[k]! / pts.length;
  const ang = (q: V3): number => {
    const d: V3 = [q[0] - c[0], q[1] - c[1], q[2] - c[2]];
    return Math.atan2(dot(d, w), dot(d, u));
  };
  return pts.map((q) => ({ q, a: ang(q) })).sort((x, y) => x.a - y.a).map((e) => e.q);
}

/** 광선 origin + t·dir(t ≥ 0)이 남는 쪽(값 ≤ 0)에 있는 t 구간 [t0, t1]. 없으면 null */
export function rayKeptInterval(p: Readonly<Plane4>, origin: readonly number[], dir: readonly number[]): [number, number] | null {
  const v0 = planeValue(p, origin[0]!, origin[1]!, origin[2]!);
  const k = p[0] * dir[0]! + p[1] * dir[1]! + p[2] * dir[2]!;
  if (Math.abs(k) < 1e-300) return v0 <= 0 ? [0, Infinity] : null;
  const t = -v0 / k;
  if (k > 0) return t >= 0 ? [0, t] : null;
  return [Math.max(0, t), Infinity];
}

/** 선분 a–b(매개변수 0~1)의 남는 쪽 구간 [s0, s1]. 통째로 잘리면 null */
export function segmentKeptRange(p: Readonly<Plane4>, ax: number, ay: number, az: number, bx: number, by: number, bz: number): [number, number] | null {
  const v0 = planeValue(p, ax, ay, az), v1 = planeValue(p, bx, by, bz);
  const r0 = v0 > 0, r1 = v1 > 0;
  if (r0 && r1) return null;
  if (!r0 && !r1) return [0, 1];
  const t = v0 / (v0 - v1);
  return r0 ? [t, 1] : [0, t];
}

/**
 * 삼각형 그물과 평면의 교선 = 단면 테두리(선분 쌍 xyz,xyz…, positions와 같은 로컬 좌표).
 * 평면도 같은 로컬 좌표로 준다(planeToLocal). bvh가 있으면 평면을 걸치는 마디만 훑는다. skip(삼각형 번호)이 true면 건너뛴다(숨긴 구간).
 */
export function sectionSegments(positions: Float32Array, indices: Uint32Array | undefined, p: Readonly<Plane4>, bvh?: Bvh | null, skip?: ((tri: number) => boolean) | null): Float32Array {
  const P = positions;
  const [a, b, c, w] = p;
  let out = new Float32Array(768);
  let n = 0;
  const put = (x: number, y: number, z: number): void => {
    if (n + 3 > out.length) {
      const o = new Float32Array(out.length * 2);
      o.set(out);
      out = o;
    }
    out[n++] = x;
    out[n++] = y;
    out[n++] = z;
  };
  const cut = (i: number, vi: number, j: number, vj: number): void => {
    const t = vi / (vi - vj);
    put(P[i]! + (P[j]! - P[i]!) * t, P[i + 1]! + (P[j + 1]! - P[i + 1]!) * t, P[i + 2]! + (P[j + 2]! - P[i + 2]!) * t);
  };
  const tri = (t: number): void => {
    if (skip && skip(t)) return;
    let i0: number, i1: number, i2: number;
    if (indices) {
      i0 = indices[t * 3]! * 3;
      i1 = indices[t * 3 + 1]! * 3;
      i2 = indices[t * 3 + 2]! * 3;
    } else {
      i0 = t * 9;
      i1 = i0 + 3;
      i2 = i0 + 6;
    }
    const v0 = a * P[i0]! + b * P[i0 + 1]! + c * P[i0 + 2]! + w;
    const v1 = a * P[i1]! + b * P[i1 + 1]! + c * P[i1 + 2]! + w;
    const v2 = a * P[i2]! + b * P[i2 + 1]! + c * P[i2 + 2]! + w;
    const s0 = v0 > 0, s1 = v1 > 0, s2 = v2 > 0;
    if (s0 === s1 && s1 === s2) return;
    // 부호가 바뀌는 변은 늘 둘이다
    if (s0 !== s1) cut(i0, v0, i1, v1);
    if (s1 !== s2) cut(i1, v1, i2, v2);
    if (s2 !== s0) cut(i2, v2, i0, v0);
  };
  const count = indices ? Math.floor(indices.length / 3) : Math.floor(P.length / 9);
  if (bvh && bvh.count === count && bvh.kind === 'triangle') {
    const { box, node, order } = bvh;
    const stack: number[] = [0];
    while (stack.length) {
      const ni = stack.pop()!;
      const o = ni * 6;
      let lo = w, hi = w;
      for (let k = 0; k < 3; k++) {
        const q = p[k]!;
        const x = q * box[o + k]!, y = q * box[o + 3 + k]!;
        lo += Math.min(x, y);
        hi += Math.max(x, y);
      }
      if (!(lo <= 0 && hi > 0)) continue;
      const first = node[ni * 2]!, k = node[ni * 2 + 1]!;
      if (k > 0) for (let j = first; j < first + k; j++) tri(order[j]!);
      else if (first !== 0xffffffff) stack.push(first, first + 1);
    }
  } else for (let t = 0; t < count; t++) tri(t);
  return out.slice(0, n - (n % 6));
}

/**
 * 화면에서 평면 위치를 끌 때 쓰는 값: 평면 위 기준점 c의 화면 위치(x, y)와, 법선 n 방향이 화면에서 향하는 단위 방향(dx, dy),
 * 법선 방향 세계 1단위가 화면에서 몇 화소인지(pxPerUnit). c가 눈 뒤면 null.
 */
export function sectionScreenAxis(f: ViewFrame, c: readonly number[], n: readonly number[]): { x: number; y: number; dx: number; dy: number; pxPerUnit: number } | null {
  const s0 = projectToScreen(f, c);
  if (!s0) return null;
  const h = worldPerPixel(f, Math.max(viewDepth(f, c), f.near)) * 40 || 1;
  const s1 = projectToScreen(f, [c[0]! + n[0]! * h, c[1]! + n[1]! * h, c[2]! + n[2]! * h]);
  if (!s1) return { x: s0[0], y: s0[1], dx: 0, dy: 0, pxPerUnit: 0 };
  const ex = s1[0] - s0[0], ey = s1[1] - s0[1];
  const L = Math.hypot(ex, ey);
  return { x: s0[0], y: s0[1], dx: L > 1e-9 ? ex / L : 0, dy: L > 1e-9 ? ey / L : 0, pxPerUnit: L / h };
}

/**
 * 화면 끌기(dxPx, dyPx) → 평면을 법선 n 방향으로 옮길 세계 거리. 법선이 화면에 드러나면 그 방향 성분을,
 * 눈 쪽을 거의 바로 향하면(화면에서 짧으면) 세로 끌기를 깊이 방향 이동으로 본다(위로 끌면 눈 쪽으로).
 */
export function sectionDragDistance(f: ViewFrame, c: readonly number[], n: readonly number[], dxPx: number, dyPx: number): number {
  const ax = sectionScreenAxis(f, c, n);
  const wpp = worldPerPixel(f, Math.max(viewDepth(f, c), f.near));
  // 법선 40화소어치가 화면에서 8화소보다 짧으면(약 80° 넘게 눈 쪽) 세로 끌기로
  if (ax && ax.pxPerUnit * wpp * 40 >= 8) return (dxPx * ax.dx + dyPx * ax.dy) / ax.pxPerUnit;
  const toEye = dot(n, f.basis.back) >= 0 ? 1 : -1;
  return -dyPx * wpp * toEye;
}

/** 단면 평면 최대 수(셰이더 균일 배열 크기 — 상자 단면 여섯 면) */
export const MAX_SECTION_PLANES = 6;

/**
 * 여러 평면 모두의 남는 쪽(교집합)에 광선이 있는 t 구간. 평면이 하나면 rayKeptInterval과 같다. 없으면 null.
 * 들어오는 평면 번호(enter: 구간 시작을 정한 평면, 눈이 이미 안이면 −1)도 돌려준다.
 */
export function rayKeptIntervalN(planes: readonly Readonly<Plane4>[], origin: readonly number[], dir: readonly number[]): { t0: number; t1: number; enter: number } | null {
  let t0 = 0, t1 = Infinity, enter = -1;
  for (let i = 0; i < planes.length; i++) {
    const r = rayKeptInterval(planes[i]!, origin, dir);
    if (!r) return null;
    if (r[0] > t0) {
      t0 = r[0];
      enter = i;
    }
    if (r[1] < t1) t1 = r[1];
    if (t0 > t1) return null;
  }
  return { t0, t1, enter };
}

/** 볼록 다각형을 평면으로 잘라 남는 쪽(값 ≤ 0)만(Sutherland–Hodgman). 다 잘리면 빈 배열 */
export function clipPolygon(poly: readonly V3[], p: Readonly<Plane4>): V3[] {
  const out: V3[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!, b = poly[(i + 1) % n]!;
    const va = planeValue(p, a[0], a[1], a[2]), vb = planeValue(p, b[0], b[1], b[2]);
    if (va <= 0) out.push(a);
    if (va <= 0 !== vb <= 0) {
      const t = va / (va - vb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out.length >= 3 ? out : [];
}

/**
 * 선분 묶음(xyz,xyz…, 세계 좌표 double 배열 또는 float)을 여러 평면의 남는 쪽으로 잘라 남는 부분만 돌려준다(다른 평면으로 단면 테두리를 자를 때)
 */
export function clipSegments(segs: ArrayLike<number>, planes: readonly Readonly<Plane4>[]): number[] {
  const out: number[] = [];
  for (let i = 0; i + 5 < segs.length; i += 6) {
    const ax = segs[i]!, ay = segs[i + 1]!, az = segs[i + 2]!, bx = segs[i + 3]!, by = segs[i + 4]!, bz = segs[i + 5]!;
    let s0 = 0, s1 = 1, ok = true;
    for (const p of planes) {
      const r = segmentKeptRange(p, ax + (bx - ax) * s0, ay + (by - ay) * s0, az + (bz - az) * s0, ax + (bx - ax) * s1, ay + (by - ay) * s1, az + (bz - az) * s1);
      if (!r) {
        ok = false;
        break;
      }
      const d = s1 - s0;
      [s0, s1] = [s0 + d * r[0], s0 + d * r[1]];
    }
    if (!ok || !(s1 > s0)) continue;
    out.push(ax + (bx - ax) * s0, ay + (by - ay) * s0, az + (bz - az) * s0, ax + (bx - ax) * s1, ay + (by - ay) * s1, az + (bz - az) * s1);
  }
  return out;
}
