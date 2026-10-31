/**
 * 범위 계산: 그물·선분·점의 축 나란 상자. 같은 형식 배열은 한 번만 훑는다(WeakMap 캐시).
 * 행렬이 있는 그물은 로컬 상자의 꼭짓점 8개만 옮겨 넓힌다(충분히 보수적이고 빠르다).
 * 묶음 원점(origin)이 있으면 positions 범위를 그만큼 옮긴다(세계 = origin + position, 행렬은 그 뒤).
 * 0.30.0: 임의 방향 범위(itemExtent·itemsExtent — 단위 벡터 v에 대한 꼭짓점 지지 값의 최소·최대, 행렬·원점 반영)도 있다.
 */
import type { Box3, LineSet3d, Mesh3d, PointSet3d, Scene3d } from './types';
import { type V3, transformPoint } from './math';
import type { IndexRange } from './ranges';

export function emptyBox(): Box3 {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

export function boxIsEmpty(b: Box3): boolean {
  return !(b.min[0] <= b.max[0] && b.min[1] <= b.max[1] && b.min[2] <= b.max[2]);
}

export function boxCenter(b: Box3): V3 {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

export function boxSize(b: Box3): V3 {
  return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
}

/** 대각선 길이(빈 상자는 0) */
export function boxDiagonal(b: Box3): number {
  if (boxIsEmpty(b)) return 0;
  const s = boxSize(b);
  return Math.hypot(s[0], s[1], s[2]);
}

export function expandPoint(b: Box3, x: number, y: number, z: number): void {
  if (!(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z))) return;
  if (x < b.min[0]) b.min[0] = x;
  if (y < b.min[1]) b.min[1] = y;
  if (z < b.min[2]) b.min[2] = z;
  if (x > b.max[0]) b.max[0] = x;
  if (y > b.max[1]) b.max[1] = y;
  if (z > b.max[2]) b.max[2] = z;
}

export function unionBox(a: Box3, b: Box3): Box3 {
  const o = emptyBox();
  if (!boxIsEmpty(a)) {
    expandPoint(o, a.min[0], a.min[1], a.min[2]);
    expandPoint(o, a.max[0], a.max[1], a.max[2]);
  }
  if (!boxIsEmpty(b)) {
    expandPoint(o, b.min[0], b.min[1], b.min[2]);
    expandPoint(o, b.max[0], b.max[1], b.max[2]);
  }
  return o;
}

export function boxCorners(b: Box3): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < 8; i++) out.push([i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]);
  return out;
}

/** 행렬로 옮긴 상자(꼭짓점 8개를 감싸는 상자) */
export function transformBox(b: Box3, m: ArrayLike<number>): Box3 {
  if (boxIsEmpty(b)) return emptyBox();
  const o = emptyBox();
  for (const c of boxCorners(b)) {
    const p = transformPoint(m, c);
    expandPoint(o, p[0], p[1], p[2]);
  }
  return o;
}

const cache = new WeakMap<Float32Array, Box3>();

/** xyz… 배열의 범위(같은 배열은 캐시) */
export function positionsBox(p: Float32Array): Box3 {
  const hit = cache.get(p);
  if (hit) return hit;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const n = p.length - (p.length % 3);
  for (let i = 0; i < n; i += 3) {
    const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
    // NaN·무한대는 건너뛴다(비교가 모두 거짓이 되도록 한 번에 거른다)
    if (!(x - x === 0 && y - y === 0 && z - z === 0)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const b: Box3 = { min: [x0, y0, z0], max: [x1, y1, z1] };
  cache.set(p, b);
  return b;
}

/** 배열을 제자리에서 고친 뒤(0.11.0 Viewer3d.setMesh의 vertices): 그 배열의 캐시한 범위를 버린다(다음에 다시 훑는다 — 0.30.0 방향 범위 기억도) */
export function forgetBounds(p: Float32Array): void {
  cache.delete(p);
  extentCache.delete(p);
}

/** 0.30.0 방향 범위 기억: 배열마다 바로 앞에 물은 로컬 방향 하나와 그 방향의 정점 최소·최대(원점·이동 전) */
const extentCache = new WeakMap<Float32Array, { w0: number; w1: number; w2: number; lo: number; hi: number }>();

/** xyz… 배열의 정점마다 (x, y, z)·(w0, w1, w2)의 최소·최대(수가 아닌 정점은 건너뛴다 — 없으면 null). 같은 배열·같은 방향은 기억한 값 */
function positionsExtent(p: Float32Array, w0: number, w1: number, w2: number): [number, number] | null {
  const hit = extentCache.get(p);
  if (hit && hit.w0 === w0 && hit.w1 === w1 && hit.w2 === w2) return hit.lo <= hit.hi ? [hit.lo, hit.hi] : null;
  let lo = Infinity, hi = -Infinity;
  const n = p.length - (p.length % 3);
  for (let i = 0; i < n; i += 3) {
    const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
    if (!(x - x === 0 && y - y === 0 && z - z === 0)) continue;
    const d = x * w0 + y * w1 + z * w2;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  extentCache.set(p, { w0, w1, w2, lo, hi });
  return lo <= hi ? [lo, hi] : null;
}

/**
 * 0.30.0 방향 범위(꼭짓점 지지): 묶음(그물·선분·점)의 세계 꼭짓점 p마다 p·v의 가장 작은 값과 큰 값 [min, max]. 세계 = matrix · (origin + position)(행렬은 그물만 —
 * itemBounds와 같은 규칙). 축 나란 상자를 v에 비춘 구간(기운 v에서는 상자 구석이 꼭짓점보다 멀어 넉넉하다)과 달리 꼭짓점 그대로의 값이다(볼록 껍질의 지지 값).
 * 정점 배열을 한 번 훑는다 — 행렬이 없거나 아핀이면(마지막 행 0·0·0·1) v를 로컬 방향으로 옮겨 정점마다 곱셈 셋(원점·이동은 한 번 더한다 — 큰 좌표도 셈 오차가 늘지 않는다),
 * 원근 행렬이면 정점마다 옮긴다. 같은 배열에 같은 로컬 방향을 잇달아 물으면 다시 훑지 않는다(배열마다 하나 기억 — forgetBounds가 함께 버린다).
 * v는 단위 벡터로 준다(길이를 맞추지 않는다 — 길이 L이면 값이 L배). 수가 아닌 정점은 건너뛴다. 정점이 없거나 v·원점·행렬 값이 수가 아니면 null
 */
export function itemExtent(it: Mesh3d | LineSet3d | PointSet3d, v: readonly number[]): [number, number] | null {
  const v0 = v[0]!, v1 = v[1]!, v2 = v[2]!;
  if (!(Number.isFinite(v0) && Number.isFinite(v1) && Number.isFinite(v2))) return null;
  const o = it.origin;
  const o0 = o ? o[0]! : 0, o1 = o ? o[1]! : 0, o2 = o ? o[2]! : 0;
  const m = (it as Mesh3d).matrix;
  if (m && !(m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1)) {
    // 원근 행렬: 정점마다 옮긴다(나누기가 있어 로컬 방향 하나로 줄일 수 없다)
    const p = it.positions;
    let lo = Infinity, hi = -Infinity;
    const n = p.length - (p.length % 3);
    for (let i = 0; i < n; i += 3) {
      const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
      if (!(x - x === 0 && y - y === 0 && z - z === 0)) continue;
      const q = transformPoint(m, [o0 + x, o1 + y, o2 + z]);
      const d = q[0] * v0 + q[1] * v1 + q[2] * v2;
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    return lo <= hi ? [lo, hi] : null;
  }
  // 세계·v = (origin + p)·(Lᵀv) + t·v (L = 행렬 왼쪽 위 3×3 — 열 우선, t = 이동)
  const w0 = m ? m[0]! * v0 + m[1]! * v1 + m[2]! * v2 : v0;
  const w1 = m ? m[4]! * v0 + m[5]! * v1 + m[6]! * v2 : v1;
  const w2 = m ? m[8]! * v0 + m[9]! * v1 + m[10]! * v2 : v2;
  const c = (m ? m[12]! * v0 + m[13]! * v1 + m[14]! * v2 : 0) + o0 * w0 + o1 * w1 + o2 * w2;
  if (!Number.isFinite(c) || !Number.isFinite(w0) || !Number.isFinite(w1) || !Number.isFinite(w2)) return null;
  const r = positionsExtent(it.positions, w0, w1, w2);
  return r ? [r[0] + c, r[1] + c] : null;
}

/** 0.30.0 묶음 여럿의 방향 범위(itemExtent의 가장 작은 최소·가장 큰 최대 — 정점이 있는 것이 없으면 null) */
export function itemsExtent(items: Iterable<Mesh3d | LineSet3d | PointSet3d>, v: readonly number[]): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (const it of items) {
    const r = itemExtent(it, v);
    if (!r) continue;
    if (r[0] < lo) lo = r[0];
    if (r[1] > hi) hi = r[1];
  }
  return lo <= hi ? [lo, hi] : null;
}

/** 상자를 o만큼 옮긴 새 상자(o가 없으면 복사) */
export function offsetBox(b: Box3, o: readonly number[] | undefined | null): Box3 {
  if (!o) return copyBox(b);
  return { min: [b.min[0] + o[0]!, b.min[1] + o[1]!, b.min[2] + o[2]!], max: [b.max[0] + o[0]!, b.max[1] + o[1]!, b.max[2] + o[2]!] };
}

export function meshBounds(m: Mesh3d): Box3 {
  const b = offsetBox(positionsBox(m.positions), m.origin);
  return m.matrix ? transformBox(b, m.matrix) : b;
}

export function lineBounds(l: LineSet3d): Box3 {
  return offsetBox(positionsBox(l.positions), l.origin);
}

export function pointBounds(p: PointSet3d): Box3 {
  return offsetBox(positionsBox(p.positions), p.origin);
}

/**
 * 기본 도형 구간(그물 = 삼각형 번호, 선분 묶음 = 선분 번호, 점 묶음 = 점 번호)에 든 정점만의 범위(positions 좌표, 원점·행렬 전).
 * 묶음 안 일부를 숨겼을 때 보이는 범위를 구한다.
 */
export function rangesBox(kind: 'triangle' | 'segment' | 'point', positions: Float32Array, indices: Uint32Array | undefined, ranges: readonly IndexRange[]): Box3 {
  const b = emptyBox();
  const P = positions;
  const put = (v: number): void => {
    const o = v * 3;
    expandPoint(b, P[o]!, P[o + 1]!, P[o + 2]!);
  };
  for (const r of ranges)
    for (let i = r.start, e = r.start + r.count; i < e; i++) {
      if (kind === 'triangle') {
        if (indices) {
          put(indices[i * 3]!);
          put(indices[i * 3 + 1]!);
          put(indices[i * 3 + 2]!);
        } else {
          put(i * 3);
          put(i * 3 + 1);
          put(i * 3 + 2);
        }
      } else if (kind === 'segment') {
        put(i * 2);
        put(i * 2 + 1);
      } else put(i);
    }
  return b;
}

/** 묶음의 보이는 구간만의 세계 범위(원점·행렬 반영). ranges는 보이는 구간 */
export function itemRangesBounds(it: Mesh3d | LineSet3d | PointSet3d, kind: 'triangle' | 'segment' | 'point', ranges: readonly IndexRange[]): Box3 {
  const local = rangesBox(kind, it.positions, (it as Mesh3d).indices, ranges);
  if (boxIsEmpty(local)) return local;
  const b = offsetBox(local, it.origin);
  const m = (it as Mesh3d).matrix;
  return m ? transformBox(b, m) : b;
}

/** 그물·선분·점 어느 것이든 세계 범위(행렬은 그물에만 있다) */
export function itemBounds(it: Mesh3d | LineSet3d | PointSet3d): Box3 {
  const b = offsetBox(positionsBox(it.positions), it.origin);
  const m = (it as Mesh3d).matrix;
  return m ? transformBox(b, m) : b;
}

export function copyBox(b: Box3): Box3 {
  return { min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], b.max[2]] };
}

/** 장면 전체 범위. keep이 있으면 그 항목만 */
export function sceneBounds(scene: Scene3d, keep?: (item: Mesh3d | LineSet3d | PointSet3d) => boolean): Box3 {
  let b = emptyBox();
  for (const m of scene.meshes) if (!keep || keep(m)) b = unionBox(b, meshBounds(m));
  for (const l of scene.lines) if (!keep || keep(l)) b = unionBox(b, lineBounds(l));
  for (const p of scene.points ?? []) if (!keep || keep(p)) b = unionBox(b, pointBounds(p));
  return b;
}

/** 상자를 감싸는 구 */
export function boxSphere(b: Box3): { center: V3; radius: number } {
  if (boxIsEmpty(b)) return { center: [0, 0, 0], radius: 1 };
  return { center: boxCenter(b), radius: Math.max(boxDiagonal(b) / 2, 1e-9) };
}
