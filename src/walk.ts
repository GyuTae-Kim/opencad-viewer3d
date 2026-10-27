/**
 * 걷기 중력·부딪힘(0.8.0, 순수 함수 — DOM·WebGL 없음). Viewer3d.setNavigation('walk', { gravity, collide })가 쓴다.
 *
 * - castRay: 세계 광선이 처음 맞는 그물 면(t·세계 법선·묶음 id). 묶음 원점·행렬·숨긴 구간·단면(남는 쪽만)을 따른다
 * - walkStep: 눈 자리와 이번 움직임 → 새 눈 자리. 부딪힘은 눈높이와 무릎 높이(발 + 오를 수 있는 높이)에서 움직이는 쪽으로 광선을 쏴
 *   벽 앞 radius에서 멈추고 벽을 따라 미끄러진다. 중력은 발 + 오를 수 있는 높이에서 아래로 쏴 맞은 바닥 위 눈높이에 둔다
 *   (계단·경사는 오르고, 난간 밖으로 나가면 아래 바닥으로 내려간다. 아래에 아무것도 없으면 높이를 지킨다)
 */
import type { Box3, Mesh3d } from './types';
import { itemBounds } from './bounds';
import { type Bvh, type PrimKind, rayBoxEntry, raycastTriangles, safeInv } from './bvh';
import { type V3, cross, mat4Invert, modelMatrix, normalize, transformDir, transformPoint } from './math';
import { type Plane4, rayKeptIntervalN } from './section';

export interface RayHit {
  /** 광선 매개변수(dir이 단위면 세계 거리) */
  t: number;
  /** 맞은 면의 세계 법선(광선 쪽을 향함, 단위) */
  normal: V3;
  /** 맞은 그물 id */
  id: string;
}

export interface CastOptions {
  bvh: (kind: PrimKind, positions: Float32Array, indices: Uint32Array | undefined) => Bvh | null;
  /** 묶음 모형 행렬(없으면 modelMatrix(matrix, origin)) */
  model?: (m: Mesh3d) => ArrayLike<number> | undefined;
  /** 세계 범위(없으면 itemBounds) */
  bounds?: (m: Mesh3d) => Box3;
  /** 숨긴 삼각형 판정 */
  hidden?: (m: Mesh3d) => ((tri: number) => boolean) | null | undefined;
  /** 묶음을 자르는 단면 평면(세계, 남는 쪽만 맞는다) */
  clips?: (m: Mesh3d) => readonly Readonly<Plane4>[] | null | undefined;
}

/** 세계 광선(origin + t·dir, 0 ≤ t < tMax)이 처음 맞는 그물 면 */
export function castRay(origin: readonly number[], dir: readonly number[], tMax: number, meshes: readonly Mesh3d[], o: CastOptions): RayHit | null {
  const ox = origin[0]!, oy = origin[1]!, oz = origin[2]!;
  const ix = safeInv(dir[0]!), iy = safeInv(dir[1]!), iz = safeInv(dir[2]!);
  const box = new Float64Array(6);
  let best: RayHit | null = null;
  let bestT = tMax;
  for (const m of meshes) {
    const b = (o.bounds ?? itemBounds)(m);
    const pad = (Math.abs(b.max[0] - b.min[0]) + Math.abs(b.max[1] - b.min[1]) + Math.abs(b.max[2] - b.min[2])) * 1e-6 + 1e-9;
    box[0] = b.min[0];
    box[1] = b.min[1];
    box[2] = b.min[2];
    box[3] = b.max[0];
    box[4] = b.max[1];
    box[5] = b.max[2];
    if (rayBoxEntry(box, 0, ox, oy, oz, ix, iy, iz, bestT, pad) === Infinity) continue;
    let t0 = 0, t1 = bestT;
    const pl = o.clips?.(m);
    if (pl && pl.length) {
      const iv = rayKeptIntervalN(pl, origin, dir);
      if (!iv) continue;
      t0 = iv.t0;
      t1 = Math.min(t1, iv.t1);
      if (t1 <= t0) continue;
    }
    const bvh = o.bvh('triangle', m.positions, m.indices);
    if (!bvh) continue;
    const model = o.model ? o.model(m) : modelMatrix(m.matrix, m.origin);
    let lo: readonly number[] = origin, ld: readonly number[] = dir;
    if (model) {
      const inv = mat4Invert(model);
      if (!inv) continue;
      lo = transformPoint(inv, origin);
      ld = transformDir(inv, dir);
    }
    const h = raycastTriangles(bvh, m.positions, m.indices, lo, ld, t1, t0, o.hidden?.(m));
    if (!h || h.t >= bestT) continue;
    // 맞은 삼각형의 세계 법선(광선 쪽으로)
    const P = m.positions, I = m.indices;
    const k0 = I ? I[h.tri * 3]! : h.tri * 3, k1 = I ? I[h.tri * 3 + 1]! : h.tri * 3 + 1, k2 = I ? I[h.tri * 3 + 2]! : h.tri * 3 + 2;
    let a: V3 = [P[k0 * 3]!, P[k0 * 3 + 1]!, P[k0 * 3 + 2]!], b2: V3 = [P[k1 * 3]!, P[k1 * 3 + 1]!, P[k1 * 3 + 2]!], c: V3 = [P[k2 * 3]!, P[k2 * 3 + 1]!, P[k2 * 3 + 2]!];
    if (model) {
      a = transformPoint(model, a);
      b2 = transformPoint(model, b2);
      c = transformPoint(model, c);
    }
    let n = normalize(cross([b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));
    if (n[0] * dir[0]! + n[1] * dir[1]! + n[2] * dir[2]! > 0) n = [-n[0], -n[1], -n[2]];
    bestT = h.t;
    best = { t: h.t, normal: n, id: m.id };
  }
  return best;
}

export interface WalkPhysics {
  /** 눈높이(발에서 눈까지, 세계 단위) */
  eyeHeight: number;
  /** 한 걸음에 오를 수 있는 높이(계단 한 단 — 이보다 높은 것은 벽) */
  stepHeight: number;
  /** 몸 반지름(벽 앞에서 멈출 거리) */
  radius: number;
  /** 바닥을 따라간다(위아래 입력은 무시) */
  gravity: boolean;
  /** 면을 지나가지 않는다 */
  collide: boolean;
  /** 아래로 바닥을 찾을 거리(발 아래로 — 이 안에 없으면 높이를 지킨다) */
  drop: number;
}

/** 광선 쏘기(세계 원점·단위 방향·최대 거리) */
export type CastFn = (origin: V3, dir: V3, tMax: number) => RayHit | null;

/** 수평 움직임 (dx, dy)를 부딪힘으로 줄인다(눈·무릎 높이 광선, 벽을 따라 한 번 미끄러진다) */
function collideMove(eye: V3, dx: number, dy: number, o: WalkPhysics, cast: CastFn, slide: boolean): [number, number] {
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return [0, 0];
  const dir: V3 = [dx / len, dy / len, 0];
  const heights = [eye[2]];
  const knee = eye[2] - o.eyeHeight + o.stepHeight;
  if (o.stepHeight < o.eyeHeight - 1e-9) heights.push(knee);
  // 벽까지 수직 거리가 radius가 되는 자리에서 멈춘다: 비스듬히 다가가면 광선 위로는 radius / cos만큼 앞(cos 0.25까지 본다)
  let best: { allowed: number; nx: number; ny: number } | null = null;
  for (const z of heights) {
    const h = cast([eye[0], eye[1], z], dir, len + o.radius * 4);
    if (!h) continue;
    const nl = Math.hypot(h.normal[0], h.normal[1]);
    const nx = nl > 1e-6 ? h.normal[0] / nl : -dir[0], ny = nl > 1e-6 ? h.normal[1] / nl : -dir[1];
    const cos = -(dir[0] * nx + dir[1] * ny);
    const allowed = cos > 0.25 ? Math.max(0, h.t - o.radius / cos) : h.t <= len + o.radius ? 0 : len;
    if (allowed < len && (!best || allowed < best.allowed)) best = { allowed, nx, ny };
  }
  if (!best) return [dx, dy];
  const sx = dir[0] * best.allowed, sy = dir[1] * best.allowed;
  if (!slide) return [sx, sy];
  // 벽을 따라: 남은 움직임에서 벽 법선(수평) 쪽 성분을 뺀다
  const { nx, ny } = best;
  const rx = dx - sx, ry = dy - sy;
  const into = rx * nx + ry * ny;
  const tx = into < 0 ? rx - into * nx : rx, ty = into < 0 ? ry - into * ny : ry;
  const [ex, ey] = collideMove([eye[0] + sx, eye[1] + sy, eye[2]], tx, ty, o, cast, false);
  return [sx + ex, sy + ey];
}

/** 걷기 한 번: 눈 자리 eye에서 move(세계)만큼 움직인 새 눈 자리(중력·부딪힘을 켠 것만 따른다) */
export function walkStep(eye: readonly number[], move: readonly number[], o: WalkPhysics, cast: CastFn): V3 {
  const e: V3 = [eye[0]!, eye[1]!, eye[2]!];
  let dx = move[0]!, dy = move[1]!;
  const dz = o.gravity ? 0 : move[2]!;
  if (o.collide) [dx, dy] = collideMove(e, dx, dy, o, cast, true);
  const p: V3 = [e[0] + dx, e[1] + dy, e[2] + dz];
  if (o.gravity) {
    const top = p[2] - o.eyeHeight + o.stepHeight;
    const h = cast([p[0], p[1], top], [0, 0, -1], o.stepHeight + Math.max(0, o.drop));
    if (h) p[2] = top - h.t + o.eyeHeight;
  }
  return p;
}
