/**
 * 임의 방향 범위(0.30.0 itemExtent·itemsExtent — 0.31.0에 bounds에서 이 작은 모듈로 뗐다, 순수): 단위 벡터 v에 대한 꼭짓점 지지 값의 최소·최대(행렬·원점 반영).
 * opencad-viewer3d/bounds도 같은 이름으로 다시 내보낸다(0.30.0 가져오기 그대로). 첫 화면이 bounds(sceneBounds 등)만 쓰고 이것은 늦게 받는 조각에서만 쓰는 앱은
 * opencad-viewer3d/extent에서 가져오면 번들러가 이 코드를 그 조각에만 싣는다(bounds를 함께 쓰는 공유 조각에 실리지 않는다 — tests/v0310extent.test.ts가 vite 빌드로 본다).
 * 방향 기억은 bounds의 forgetBounds가 함께 버린다(기억 표는 bounds에 있다).
 */
import { extentMemo } from './bounds';
import { transformPoint } from './math';
import type { LineSet3d, Mesh3d, PointSet3d } from './types';

/** xyz… 배열의 정점마다 (x, y, z)·(w0, w1, w2)의 최소·최대(수가 아닌 정점은 건너뛴다 — 없으면 null). 같은 배열·같은 방향은 기억한 값 */
function positionsExtent(p: Float32Array, w0: number, w1: number, w2: number): [number, number] | null {
  const hit = extentMemo.get(p);
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
  extentMemo.set(p, { w0, w1, w2, lo, hi });
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
