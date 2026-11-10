/**
 * 0.54.0 고르기 후보 미리 강조의 그물 면(순수 계산 — Viewer3d.setPickPreview와 키보드 고르기 후보 돌리기의 화면 덧그림, SKP 56·57차 요청).
 *
 * 그물 면 후보(Pick3d kind 'mesh' — index = 삼각형 번호)는 삼각형 하나라 그대로 그리면 면의 일부만 보인다. 그래서 맞은 삼각형과 같은 평면에 있고
 * 변을 맞대고 이어진 삼각형(같은 그물 — 위치가 같은 꼭짓점은 번호가 달라도 같은 점으로 잇는다)을 면으로 본다(planarFace). 앱이 면을 알면
 * (판재 면·B-rep 면·SketchUp 면의 삼각형 구간) 그 구간을 그대로 쓴다(rangesFace). 결과는 삼각형 번호와 테두리 변(그 삼각형들 가운데 한 번만 나오는 변)의
 * 로컬 좌표 — 뷰어가 모형 행렬로 세계로 옮겨 화면에 칠하고 긋는다.
 * 셈: 같은 위치 꼭짓점 번호(위치 비트 무늬 해시 표)와 꼭짓점 → 삼각형 목록(정수 배열)을 그물마다 한 번 만들고(마지막 그물 하나를 기억), 맞은 삼각형에서
 * 변을 맞댄 같은 평면 이웃만 넓혀 간다 — 같은 평면 삼각형이 아주 많은 평평한 그물에서도 면 크기만큼만 본다. 면은 PICK_PREVIEW_MAX_TRIS개까지
 */
import type { IndexRange } from './ranges';

/** 미리 강조할 면의 삼각형 수 한도(넘으면 그만큼만 — capped) */
export const PICK_PREVIEW_MAX_TRIS = 4096;

/** 미리 강조할 면: 삼각형 번호(장면 차례 아님 — 찾은 차례), 테두리 변 끝점(로컬 좌표 6개씩), 한도에 걸렸는지 */
export interface FaceOutline {
  tris: number[];
  edges: Float64Array;
  capped: boolean;
}

const triCount = (positions: ArrayLike<number>, indices: ArrayLike<number> | undefined): number => (indices ? Math.floor(indices.length / 3) : Math.floor(positions.length / 9));
/** 삼각형 t의 k번째(0~2) 꼭짓점 번호(색인이 없으면 t × 3 + k) */
export const triCorner = (indices: ArrayLike<number> | undefined, t: number, k: number): number => (indices ? indices[t * 3 + k]! : t * 3 + k);
const corner = triCorner;

/**
 * 꼭짓점마다 같은 위치의 대표 꼭짓점 번호(처음 나온 것 — 번호가 달라도 위치가 같으면 같은 대표). Float32Array는 좌표 비트 무늬 해시 표(+0·−0은 같게),
 * 그 밖의 배열은 글 열쇠
 */
function canonical(positions: ArrayLike<number>, nv: number): Int32Array {
  const out = new Int32Array(nv);
  if (positions instanceof Float32Array) {
    const bits = new Uint32Array(positions.buffer, positions.byteOffset, nv * 3);
    let cap = 16;
    while (cap < nv * 2) cap *= 2;
    const table = new Int32Array(cap).fill(-1);
    const mask = cap - 1;
    const b0 = (v: number, i: number): number => {
      const x = bits[v * 3 + i]!;
      return x === 0x80000000 ? 0 : x;
    };
    // 비트 섞기(murmur3 마무리 — 작은 정수 좌표처럼 아래 비트가 0인 float 무늬도 표에 고르게 흩는다)
    const mix = (h: number): number => {
      h ^= h >>> 16;
      h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13;
      h = Math.imul(h, 0xc2b2ae35);
      return h ^ (h >>> 16);
    };
    for (let v = 0; v < nv; v++) {
      const a = b0(v, 0), b = b0(v, 1), c = b0(v, 2);
      let s = mix(mix(mix(a) ^ b) ^ c) & mask;
      for (;;) {
        const e = table[s]!;
        if (e < 0) {
          table[s] = v;
          out[v] = v;
          break;
        }
        if (b0(e, 0) === a && b0(e, 1) === b && b0(e, 2) === c) {
          out[v] = e;
          break;
        }
        s = (s + 1) & mask;
      }
    }
    return out;
  }
  const map = new Map<string, number>();
  for (let v = 0; v < nv; v++) {
    const k = `${positions[v * 3]},${positions[v * 3 + 1]},${positions[v * 3 + 2]}`;
    const e = map.get(k);
    if (e === undefined) map.set(k, (out[v] = v));
    else out[v] = e;
  }
  return out;
}

/** 그물 꼴(마지막 그물 하나 기억): 같은 위치 대표 번호, 대표 꼭짓점 → 삼각형 목록(start·list — 정수 배열), 꼭짓점이 그물 밖인 삼각형은 목록에 없다 */
interface Topo {
  positions: ArrayLike<number>;
  indices: ArrayLike<number> | undefined;
  canon: Int32Array;
  start: Int32Array;
  list: Int32Array;
}
let topoMemo: Topo | null = null;

function topoOf(positions: ArrayLike<number>, indices: ArrayLike<number> | undefined): Topo {
  const m = topoMemo;
  if (m && m.positions === positions && m.indices === indices) return m;
  const nv = Math.floor(positions.length / 3), nt = triCount(positions, indices);
  const canon = canonical(positions, nv);
  const start = new Int32Array(nv + 1);
  const ok = (t: number): boolean => {
    for (let k = 0; k < 3; k++) {
      const v = corner(indices, t, k);
      if (!(v >= 0 && v < nv)) return false;
    }
    return true;
  };
  for (let t = 0; t < nt; t++) if (ok(t)) for (let k = 0; k < 3; k++) start[canon[corner(indices, t, k)]! + 1]!++;
  for (let v = 0; v < nv; v++) start[v + 1]! += start[v]!;
  const fill = start.slice(0, nv);
  const list = new Int32Array(start[nv]!);
  for (let t = 0; t < nt; t++) if (ok(t)) for (let k = 0; k < 3; k++) list[fill[canon[corner(indices, t, k)]!]!++] = t;
  return (topoMemo = { positions, indices, canon, start, list });
}

/** 삼각형들의 테두리 변(그 가운데 한 번만 나오는 변 — 같은 위치 대표 번호로 센다) */
function outline(positions: ArrayLike<number>, indices: ArrayLike<number> | undefined, tris: number[], capped: boolean, canon: Int32Array): FaceOutline {
  const seen = new Map<number, { a: number; b: number; n: number }>();
  const nv = canon.length;
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const a = corner(indices, t, k), b = corner(indices, t, (k + 1) % 3);
      const ka = canon[a]!, kb = canon[b]!;
      if (ka === kb) continue;
      const key = ka < kb ? ka * nv + kb : kb * nv + ka;
      const e = seen.get(key);
      if (e) e.n++;
      else seen.set(key, { a, b, n: 1 });
    }
  const out: number[] = [];
  for (const e of seen.values()) {
    if (e.n !== 1) continue;
    for (const v of [e.a, e.b]) out.push(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!);
  }
  return { tris, edges: Float64Array.from(out), capped };
}

/**
 * 맞은 삼각형(tri)과 같은 평면에서 변을 맞대고 이어진 삼각형(같은 그물). 평면 판정: 꼭짓점 셋이 맞은 삼각형 평면에서 (좌표 크기·그물 크기의 4e-6배) 안이고
 * 법선이 나란하다(앞뒤 가리지 않음 — 감김이 섞인 그물도). 넓이가 없는 이웃은 건너뛴다. 삼각형 번호가 그물 밖이거나 꼭짓점이 그물 밖이면 null
 */
export function planarFace(positions: ArrayLike<number>, indices: ArrayLike<number> | undefined, tri: number, max = PICK_PREVIEW_MAX_TRIS): FaceOutline | null {
  const nt = triCount(positions, indices);
  const nv = Math.floor(positions.length / 3);
  if (!Number.isInteger(tri) || tri < 0 || tri >= nt) return null;
  for (let k = 0; k < 3; k++) {
    const v = corner(indices, tri, k);
    if (!(v >= 0 && v < nv)) return null;
  }
  const P = (v: number, i: number): number => positions[v * 3 + i]!;
  const topo = topoOf(positions, indices);
  const { canon, start, list } = topo;
  // 맞은 삼각형 평면
  const a = corner(indices, tri, 0), b = corner(indices, tri, 1), c = corner(indices, tri, 2);
  const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2);
  const vx = P(c, 0) - P(a, 0), vy = P(c, 1) - P(a, 1), vz = P(c, 2) - P(a, 2);
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 0)) return outline(positions, indices, [tri], false, canon);
  nx /= len;
  ny /= len;
  nz /= len;
  const d = nx * P(a, 0) + ny * P(a, 1) + nz * P(a, 2);
  // 허용 거리: 좌표 크기(float32 자리)와 그물 크기
  let lo0 = Infinity, lo1 = Infinity, lo2 = Infinity, hi0 = -Infinity, hi1 = -Infinity, hi2 = -Infinity;
  for (let v = 0; v < nv; v++) {
    const x = P(v, 0), y = P(v, 1), z = P(v, 2);
    if (x < lo0) lo0 = x;
    if (x > hi0) hi0 = x;
    if (y < lo1) lo1 = y;
    if (y > hi1) hi1 = y;
    if (z < lo2) lo2 = z;
    if (z > hi2) hi2 = z;
  }
  const size = Math.max(Math.hypot(hi0 - lo0, hi1 - lo1, hi2 - lo2), Math.abs(lo0), Math.abs(lo1), Math.abs(lo2), Math.abs(hi0), Math.abs(hi1), Math.abs(hi2));
  const tol = Math.max(size * 4e-6, 1e-12);
  /** 이웃 삼각형 t가 맞은 삼각형 평면 위인지(넓이가 없으면 아니다) */
  const coplanar = (t: number): boolean => {
    const i0 = corner(indices, t, 0), i1 = corner(indices, t, 1), i2 = corner(indices, t, 2);
    for (const v of [i0, i1, i2]) if (Math.abs(nx * P(v, 0) + ny * P(v, 1) + nz * P(v, 2) - d) > tol) return false;
    const px = P(i1, 0) - P(i0, 0), py = P(i1, 1) - P(i0, 1), pz = P(i1, 2) - P(i0, 2);
    const qx = P(i2, 0) - P(i0, 0), qy = P(i2, 1) - P(i0, 1), qz = P(i2, 2) - P(i0, 2);
    const mx = py * qz - pz * qy, my = pz * qx - px * qz, mz = px * qy - py * qx;
    const ml = Math.hypot(mx, my, mz);
    return ml > 0 && Math.abs(mx * nx + my * ny + mz * nz) >= ml * 0.9999;
  };
  // 맞은 삼각형에서 변을 맞댄(대표 꼭짓점 둘을 함께 쓰는) 같은 평면 이웃으로 넓힌다. seen: 이미 판정한 삼각형(면 1·아님 2)
  const seen = new Map<number, 1 | 2>([[tri, 1]]);
  const tris: number[] = [tri];
  let capped = false;
  for (let i = 0; i < tris.length && !capped; i++) {
    const t = tris[i]!;
    for (let k = 0; k < 3 && !capped; k++) {
      const u = canon[corner(indices, t, k)]!, w = canon[corner(indices, t, (k + 1) % 3)]!;
      if (u === w) continue;
      for (let j = start[u]!; j < start[u + 1]!; j++) {
        const s = list[j]!;
        if (seen.has(s)) continue;
        // 변 (u, w)를 함께 쓰는지
        let hasW = false;
        for (let q = 0; q < 3; q++) if (canon[corner(indices, s, q)] === w) hasW = true;
        if (!hasW) continue;
        if (!coplanar(s)) {
          seen.set(s, 2);
          continue;
        }
        if (tris.length >= max) {
          capped = true;
          break;
        }
        seen.set(s, 1);
        tris.push(s);
      }
    }
  }
  return outline(positions, indices, tris, capped, canon);
}

/** 앱이 준 삼각형 구간(그물 삼각형 번호 { start, count } — setHiddenRanges와 같은 꼴)의 삼각형과 테두리. 그물 밖 번호는 버리고, 없으면 null */
export function rangesFace(positions: ArrayLike<number>, indices: ArrayLike<number> | undefined, ranges: readonly IndexRange[], max = PICK_PREVIEW_MAX_TRIS): FaceOutline | null {
  const nt = triCount(positions, indices);
  const nv = Math.floor(positions.length / 3);
  const tris: number[] = [];
  const seen = new Set<number>();
  let capped = false;
  for (const r of ranges) {
    const s = Math.max(0, Math.floor(Number(r?.start))), e = Math.min(nt, s + Math.floor(Number(r?.count)));
    if (!Number.isFinite(s) || !(e > s)) continue;
    for (let t = s; t < e; t++) {
      if (seen.has(t)) continue;
      let ok = true;
      for (let k = 0; k < 3; k++) {
        const v = corner(indices, t, k);
        if (!(v >= 0 && v < nv)) ok = false;
      }
      if (!ok) continue;
      if (tris.length >= max) {
        capped = true;
        break;
      }
      seen.add(t);
      tris.push(t);
    }
    if (capped) break;
  }
  if (!tris.length) return null;
  // 테두리만 세므로 같은 위치 번호만(기억한 그물 꼴이 이 그물이면 그것을)
  const m = topoMemo;
  const canon = m && m.positions === positions && m.indices === indices ? m.canon : canonical(positions, nv);
  return outline(positions, indices, tris, capped, canon);
}
