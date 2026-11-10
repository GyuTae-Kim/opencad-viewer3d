/**
 * 0.54.0 고르기 후보 미리 강조의 그물 면(순수 계산 — Viewer3d.setPickPreview와 키보드 고르기 후보 돌리기의 화면 덧그림, SKP 56·57차 요청).
 *
 * 그물 면 후보(Pick3d kind 'mesh' — index = 삼각형 번호)는 삼각형 하나라 그대로 그리면 면의 일부만 보인다. 그래서 맞은 삼각형과 같은 평면에 있고
 * 변을 맞대고 이어진 삼각형(같은 그물 — 위치가 같은 꼭짓점은 번호가 달라도 같은 점으로 잇는다)을 면으로 본다(planarFace). 앱이 면을 알면
 * (판재 면·B-rep 면·SketchUp 면의 삼각형 구간) 그 구간을 그대로 쓴다(rangesFace). 결과는 삼각형 번호와 테두리 변(그 삼각형들 가운데 한 번만 나오는 변)의
 * 로컬 좌표 — 뷰어가 모형 행렬로 세계로 옮겨 화면에 칠하고 긋는다. 큰 그물에서도 한 번 셈이 짧게 삼각형 수에 한도(PICK_PREVIEW_MAX_TRIS)를 둔다
 */
import type { IndexRange } from './ranges';

/** 미리 강조할 면의 삼각형 수 한도(넘으면 그만큼만 — capped) */
export const PICK_PREVIEW_MAX_TRIS = 4096;
/** 같은 평면 후보 삼각형 수 한도(넘으면 이은 면을 찾지 않고 맞은 삼각형만 — 아주 큰 평평한 그물에서 셈이 길지 않게) */
export const PICK_PREVIEW_MAX_COPLANAR = 65536;

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

/** 꼭짓점 위치 → 같은 위치 번호(번호가 달라도 위치가 같으면 같은 번호 — 면마다 나눈 꼭짓점을 잇는다) */
class PosKeys {
  private map = new Map<string, number>();
  constructor(private positions: ArrayLike<number>) {}
  of(v: number): number {
    const p = this.positions;
    const k = `${p[v * 3]},${p[v * 3 + 1]},${p[v * 3 + 2]}`;
    let id = this.map.get(k);
    if (id === undefined) this.map.set(k, (id = this.map.size));
    return id;
  }
}

/** 삼각형들의 테두리 변(그 가운데 한 번만 나오는 변 — 위치가 같은 꼭짓점은 같은 점) */
function outline(positions: ArrayLike<number>, indices: ArrayLike<number> | undefined, tris: number[], capped: boolean, keys = new PosKeys(positions)): FaceOutline {
  const seen = new Map<string, { a: number; b: number; n: number }>();
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const a = corner(indices, t, k), b = corner(indices, t, (k + 1) % 3);
      const ka = keys.of(a), kb = keys.of(b);
      if (ka === kb) continue;
      const key = ka < kb ? `${ka}:${kb}` : `${kb}:${ka}`;
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
 * 법선이 나란하다(앞뒤 가리지 않음 — 감김이 섞인 그물도). 넓이가 없는 삼각형은 건너뛴다. 삼각형 번호가 그물 밖이면 null
 */
export function planarFace(positions: ArrayLike<number>, indices: ArrayLike<number> | undefined, tri: number, max = PICK_PREVIEW_MAX_TRIS): FaceOutline | null {
  const nt = triCount(positions, indices);
  const nv = Math.floor(positions.length / 3);
  if (!Number.isInteger(tri) || tri < 0 || tri >= nt) return null;
  const P = (v: number, i: number): number => positions[v * 3 + i]!;
  const cornersOk = (t: number): boolean => {
    for (let k = 0; k < 3; k++) {
      const v = corner(indices, t, k);
      if (!(v >= 0 && v < nv)) return false;
    }
    return true;
  };
  if (!cornersOk(tri)) return null;
  // 맞은 삼각형 평면
  const a = corner(indices, tri, 0), b = corner(indices, tri, 1), c = corner(indices, tri, 2);
  const ux = P(b, 0) - P(a, 0), uy = P(b, 1) - P(a, 1), uz = P(b, 2) - P(a, 2);
  const vx = P(c, 0) - P(a, 0), vy = P(c, 1) - P(a, 1), vz = P(c, 2) - P(a, 2);
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz);
  if (!(len > 0)) return outline(positions, indices, [tri], false);
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
  // 같은 평면 후보(맞은 삼각형 포함)
  const cand: number[] = [];
  for (let t = 0; t < nt; t++) {
    if (t !== tri) {
      if (!cornersOk(t)) continue;
      const i0 = corner(indices, t, 0), i1 = corner(indices, t, 1), i2 = corner(indices, t, 2);
      let off = false;
      for (const v of [i0, i1, i2])
        if (Math.abs(nx * P(v, 0) + ny * P(v, 1) + nz * P(v, 2) - d) > tol) {
          off = true;
          break;
        }
      if (off) continue;
      const px = P(i1, 0) - P(i0, 0), py = P(i1, 1) - P(i0, 1), pz = P(i1, 2) - P(i0, 2);
      const qx = P(i2, 0) - P(i0, 0), qy = P(i2, 1) - P(i0, 1), qz = P(i2, 2) - P(i0, 2);
      const mx = py * qz - pz * qy, my = pz * qx - px * qz, mz = px * qy - py * qx;
      const ml = Math.hypot(mx, my, mz);
      if (!(ml > 0) || Math.abs(mx * nx + my * ny + mz * nz) < ml * 0.9999) continue;
    }
    cand.push(t);
    if (cand.length > PICK_PREVIEW_MAX_COPLANAR) return outline(positions, indices, [tri], true);
  }
  // 후보끼리 변 표(같은 위치 번호 짝 → 삼각형들)로 맞은 삼각형에서 넓혀 간다
  const keys = new PosKeys(positions);
  const byEdge = new Map<string, number[]>();
  const edgeKeys = (t: number): string[] => {
    const out: string[] = [];
    for (let k = 0; k < 3; k++) {
      const ka = keys.of(corner(indices, t, k)), kb = keys.of(corner(indices, t, (k + 1) % 3));
      if (ka !== kb) out.push(ka < kb ? `${ka}:${kb}` : `${kb}:${ka}`);
    }
    return out;
  };
  for (const t of cand)
    for (const e of edgeKeys(t)) {
      const l = byEdge.get(e);
      if (l) l.push(t);
      else byEdge.set(e, [t]);
    }
  const tris: number[] = [tri];
  const inFace = new Set<number>([tri]);
  let capped = false;
  for (let i = 0; i < tris.length && !capped; i++)
    for (const e of edgeKeys(tris[i]!)) {
      for (const t of byEdge.get(e) ?? []) {
        if (inFace.has(t)) continue;
        if (tris.length >= max) {
          capped = true;
          break;
        }
        inFace.add(t);
        tris.push(t);
      }
      if (capped) break;
    }
  return outline(positions, indices, tris, capped, keys);
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
  return tris.length ? outline(positions, indices, tris, capped) : null;
}
