/**
 * 장면 고르기(순수 함수, DOM·WebGL 없음): 보이는 그물·선분·점 묶음에서 화면 점 아래 것을 고른다. Viewer3d.pick이 쓴다.
 *
 * - 차례: 점(가까운 것) → 선분 → 그물. 음영 모드(occlude)면 불투명 면이 그 뒤의 선분·점을 가린다.
 * - 묶음 원점(origin)이 있는 선분·점은 그 원점만큼 옮긴 프레임(shiftFrame)에서 로컬 positions 그대로 고르고 결과에 원점을 더한다.
 *   그물은 원점을 합친 모형 행렬로 광선을 로컬로 옮긴다. 어느 쪽이든 double로 계산하므로 큰 좌표에서도 정밀하다.
 * - 단면(clip, 세계 평면)이 있으면 잘린 쪽(평면 값 > 0)은 고르지 않는다: 그물은 광선의 남는 구간만, 선분은 남는 부분만, 점은 남는 것만.
 */
import type { Box3, LineSet3d, Mesh3d, Pick3d, PointSet3d } from './types';
import { itemBounds } from './bounds';
import { type Bvh, type PrimKind, countRayHits, rayBoxEntry, safeInv } from './bvh';
import { type ViewFrame, projectToScreen, screenRay, shiftFrame, viewDepth, worldPerPixel } from './camera';
import { type V3, mat4Invert, modelMatrix, normalize, transformDir, transformPoint } from './math';
import { TIE_PX, chooseNearest, pickMeshRay, pickPointSet, pickSegments, segmentCandidates, snapToNearest } from './pick';
import { SNAP_PX } from './pointer';
import { type Plane4, planeShift, planeValue, rayKeptInterval } from './section';

export interface PickDetail {
  pick: Pick3d;
  /** 측정용 붙잡은 점(꼭짓점·끝점 가까우면 그 점) */
  snap: V3;
  vertex: boolean;
}

export interface ScenePickItems {
  meshes: readonly Mesh3d[];
  lines: readonly LineSet3d[];
  points: readonly PointSet3d[];
}

export interface ScenePickOptions {
  /** 고르기 허용 거리(화면 화소) */
  tol: number;
  /** 측정 점을 꼭짓점·끝점에 붙잡는 거리(화면 화소, 기본 10) */
  snap?: number;
  /** 불투명 면이 그 뒤 선분·점을 가리는지(음영 모드) */
  occlude: boolean;
  /** BVH 얻기(없으면 null — 그때는 모두 훑는다) */
  bvh: (kind: PrimKind, positions: Float32Array, indices: Uint32Array | undefined) => Bvh | null;
  /** 빠른 고르기: BVH가 없는 큰 선분·점 묶음(2만 개 넘음)은 건너뛴다(끄는 중 회전 중심 찾기 등) */
  fast?: boolean;
  /** 선분 묶음의 그리기 범위(앞 몇 개만 그릴 때) */
  limit?: (id: string) => number | undefined;
  /** 세계 범위(캐시를 넘기면 빠르다). 없으면 itemBounds */
  bounds?: (it: Mesh3d | LineSet3d | PointSet3d) => Box3;
  /** 묶음 모형 행렬(캐시를 넘기면 빠르다). 없으면 modelMatrix(matrix, origin) */
  model?: (m: Mesh3d) => ArrayLike<number> | undefined;
  /** 단면 평면(세계) */
  clip?: Readonly<Plane4> | null;
  /** 단면에서 잘린 면을 채워 그리는 그물인지(닫힌 불투명 그물) — 그 잘린 면을 누르면 평면 위 점을 고른다 */
  caps?: (m: Mesh3d) => boolean;
  /** 묶음 안 숨긴 구간: 기본 도형 번호(삼각형·선분·점)가 숨겨졌는지 판정하는 함수(숨긴 것이 없으면 null) */
  hidden?: (it: Mesh3d | LineSet3d | PointSet3d) => ((i: number) => boolean) | null | undefined;
  /** 그물 윤곽선(Mesh3d.edges)도 고른다(선분 다음, 면보다 먼저) — kind 'edge' */
  edges?: boolean;
  /** 숨긴 윤곽선 구간 판정(Mesh3d.edges의 선분 번호) */
  edgeHidden?: (m: Mesh3d) => ((i: number) => boolean) | null | undefined;
}

const FAST_SCAN_LIMIT = 20_000;

/** 화면 점(x, y)에서 고르기 */
export function pickScene(f: ViewFrame, x: number, y: number, items: ScenePickItems, o: ScenePickOptions): PickDetail | null {
  const ray = screenRay(f, x, y);
  const tol = o.tol;
  const snapPx = o.snap ?? SNAP_PX;
  const bounds = o.bounds ?? itemBounds;
  const clip = o.clip ?? null;
  const ix = safeInv(ray.dir[0]), iy = safeInv(ray.dir[1]), iz = safeInv(ray.dir[2]);
  const arr = new Float64Array(6);
  const boxHit = (b: Box3): boolean => {
    const pad = (Math.abs(b.max[0] - b.min[0]) + Math.abs(b.max[1] - b.min[1]) + Math.abs(b.max[2] - b.min[2])) * 1e-6 + 1e-9;
    arr[0] = b.min[0];
    arr[1] = b.min[1];
    arr[2] = b.min[2];
    arr[3] = b.max[0];
    arr[4] = b.max[1];
    arr[5] = b.max[2];
    return rayBoxEntry(arr, 0, ray.origin[0], ray.origin[1], ray.origin[2], ix, iy, iz, Infinity, pad) !== Infinity;
  };
  // 잘린 쪽 판정의 허용치(평면 위 점은 남는 쪽으로)
  const keptEps = clip ? 1e-9 * (Math.abs(clip[3]) + 1) : 0;
  const kept = (p: readonly number[]): boolean => !clip || planeValue(clip, p[0]!, p[1]!, p[2]!) <= keptEps;
  /** 아직 BVH가 없고(빠른 고르기) 크면 건너뛴다 — 모두 훑기는 작은 묶음만 */
  const skip = (bvh: Bvh | null, n: number): boolean => !bvh && !!o.fast && n > FAST_SCAN_LIMIT;

  // 그물(광선). 단면이 있으면 광선의 남는 구간만
  const interval = clip ? rayKeptInterval(clip, ray.origin, ray.dir) : null;
  let mesh: { m: Mesh3d; h: NonNullable<ReturnType<typeof pickMeshRay>> } | null = null;
  // 선분·점을 가리는 깊이: 불투명 면(음영 모드)만 가린다
  let occl = Infinity;
  // 잘린 면(채운 면): 눈이 잘린 쪽에 있어 광선이 평면에서 남는 쪽으로 들어가고(t0 > 0), 그 점이 닫힌 그물 안이면(뒤쪽 교차가 홀수)
  // 그 점을 고른다. 남는 쪽의 어떤 면보다도 앞에 있으므로 다른 그물보다 먼저다
  let cap: { m: Mesh3d; point: V3; depth: number } | null = null;
  if (clip && interval && interval[0] > 0 && o.caps) {
    const t0 = interval[0];
    for (const m of items.meshes) {
      if (!o.caps(m) || !boxHit(bounds(m))) continue;
      const bvh = o.bvh('triangle', m.positions, m.indices);
      if (!bvh) continue;
      const model = o.model ? o.model(m) : modelMatrix(m.matrix, m.origin);
      let lo: readonly number[] = ray.origin, ld: readonly number[] = ray.dir;
      if (model) {
        const inv = mat4Invert(model);
        if (!inv) continue;
        lo = transformPoint(inv, ray.origin);
        ld = transformDir(inv, ray.dir);
      }
      if (countRayHits(bvh, m.positions, m.indices, lo, ld, t0, o.hidden?.(m)) % 2 === 1) {
        const point: V3 = [ray.origin[0] + ray.dir[0] * t0, ray.origin[1] + ray.dir[1] * t0, ray.origin[2] + ray.dir[2] * t0];
        cap = { m, point, depth: viewDepth(f, point) };
        break;
      }
    }
    if (cap && cap.m.color[3] >= 0.999 && o.occlude) occl = cap.depth * (1 + 1e-4) + 1e-9;
  }
  if ((!clip || interval) && !cap) {
    for (const m of items.meshes) {
      if (!boxHit(bounds(m))) continue;
      const bvh = o.bvh('triangle', m.positions, m.indices);
      if (!bvh) continue;
      const h = pickMeshRay(f, ray, m.positions, m.indices, bvh, o.model ? o.model(m) : modelMatrix(m.matrix, m.origin), interval, o.hidden?.(m));
      if (!h) continue;
      if (!mesh || h.depth < mesh.h.depth) mesh = { m, h };
      if (o.occlude && m.color[3] >= 0.999) occl = Math.min(occl, h.depth * (1 + 1e-4) + 1e-9);
    }
  }

  // 점
  const pts: { p: PointSet3d; i: number; point: V3; distPx: number; depth: number }[] = [];
  for (const p of items.points) {
    const bvh = o.bvh('point', p.positions, undefined);
    if (skip(bvh, p.positions.length / 3)) continue;
    const fl = shiftFrame(f, p.origin);
    const h = pickPointSet(fl, p.positions, bvh, x, y, tol + (p.size ?? 4) / 2, occl, clip ? planeShift(clip, p.origin) : null, o.hidden?.(p));
    if (h) pts.push({ p, i: h.index, point: addOrigin(h.point, p.origin), distPx: h.distPx, depth: h.depth });
  }
  const pt = chooseNearest(pts);
  if (pt) {
    const id = pt.p.pointIds?.[pt.i] ?? pt.i;
    return { pick: { kind: 'point', id: pt.p.id, index: id, point: pt.point, raw: pt.i }, snap: pt.point, vertex: true };
  }

  // 선분
  const lns: { l: LineSet3d; i: number; point: V3; distPx: number; depth: number }[] = [];
  for (const l of items.lines) {
    const tl = tol + (l.width ?? 1) / 2;
    const b = bounds(l);
    if (!boxHit(b) && !nearBox(f, b, x, y, tl)) continue;
    const bvh = o.bvh('segment', l.positions, undefined);
    if (skip(bvh, l.positions.length / 6)) continue;
    const fl = shiftFrame(f, l.origin);
    const h = pickSegments(fl, l.positions, bvh, x, y, tl, { limit: o.limit?.(l.id), maxDepth: occl, clip: clip ? planeShift(clip, l.origin) : null, skip: o.hidden?.(l) });
    if (h) lns.push({ l, i: h.index, point: addOrigin(h.point, l.origin), distPx: h.distPx, depth: h.depth });
  }
  const ln = chooseNearest(lns);
  if (ln) {
    const P = ln.l.positions, k = ln.i * 6;
    const ends = [addOrigin([P[k]!, P[k + 1]!, P[k + 2]!], ln.l.origin), addOrigin([P[k + 3]!, P[k + 4]!, P[k + 5]!], ln.l.origin)].filter(kept);
    const v = snapToNearest(f, ends, x, y, snapPx);
    const id = ln.l.segmentIds?.[ln.i] ?? ln.i;
    return { pick: { kind: 'line', id: ln.l.id, index: id, point: ln.point, raw: ln.i }, snap: v ?? ln.point, vertex: !!v };
  }

  // 그물 윤곽선(켰을 때): 면보다 먼저. 음영 모드면 그 점에서 다시 광선을 쏴 면에 가린 윤곽선은 뺀다
  if (o.edges) {
    const eds: { m: Mesh3d; i: number; point: V3; distPx: number; depth: number }[] = [];
    for (const m of items.meshes) {
      const E = m.edges;
      if (!E || E.length < 6) continue;
      const b = bounds(m);
      if (!boxHit(b) && !nearBox(f, b, x, y, tol)) continue;
      const bvh = o.bvh('segment', E, undefined);
      if (skip(bvh, E.length / 6)) continue;
      const model = o.model ? o.model(m) : modelMatrix(m.matrix, m.origin);
      for (const h of segmentCandidates(f, E, bvh, model, x, y, tol, { clips: clip ? [clip] : null, skip: o.edgeHidden?.(m) })) eds.push({ m, i: h.index, point: h.point, distPx: h.distPx, depth: h.depth });
    }
    const ed = chooseVisible(eds, (c) => !o.occlude || edgeVisible(f, c.point, c.depth, items, o));
    if (ed) {
      const P = ed.m.edges!, k = ed.i * 6;
      const model = o.model ? o.model(ed.m) : modelMatrix(ed.m.matrix, ed.m.origin);
      const ends = [
        [P[k]!, P[k + 1]!, P[k + 2]!],
        [P[k + 3]!, P[k + 4]!, P[k + 5]!],
      ]
        .map((p) => (model ? transformPoint(model, p) : (p as V3)))
        .filter(kept);
      const v = snapToNearest(f, ends, x, y, snapPx);
      return { pick: { kind: 'edge', id: ed.m.id, index: ed.i, point: ed.point, raw: ed.i }, snap: v ?? ed.point, vertex: !!v };
    }
  }

  if (cap) {
    let n = normalize([clip![0], clip![1], clip![2]]);
    if (n[0] * ray.dir[0] + n[1] * ray.dir[1] + n[2] * ray.dir[2] > 0) n = [-n[0], -n[1], -n[2]];
    return { pick: { kind: 'mesh', id: cap.m.id, index: -1, point: cap.point, raw: -1, normal: n, section: true }, snap: cap.point, vertex: false };
  }
  if (mesh) {
    const v = snapToNearest(f, mesh.h.corners.filter(kept), x, y, snapPx);
    return {
      pick: { kind: 'mesh', id: mesh.m.id, index: mesh.h.tri, point: mesh.h.point, raw: mesh.h.tri, normal: mesh.h.normal },
      snap: v ?? mesh.h.point,
      vertex: !!v,
    };
  }
  return null;
}

/** 화면 거리 차례로 보아 visible을 처음 통과한 것(그 거리에서 TIE_PX 안의 통과한 것들 중 가장 앞) */
function chooseVisible<T extends { distPx: number; depth: number }>(cands: T[], visible: (c: T) => boolean): T | null {
  cands.sort((a, b) => a.distPx - b.distPx);
  let best: T | null = null;
  for (const c of cands) {
    if (best && c.distPx > best.distPx + TIE_PX) break;
    if (!visible(c)) continue;
    if (!best || c.depth < best.depth) best = c;
  }
  return best;
}

/** 윤곽선 위 점이 불투명 면에 가리지 않는지(그 점 화면 자리에서 광선을 다시 쏜다 — 점이 면 위에 있으면 보인다) */
function edgeVisible(f: ViewFrame, p: V3, depth: number, items: ScenePickItems, o: ScenePickOptions): boolean {
  const s = projectToScreen(f, p);
  if (!s) return false;
  const od = occludingDepth(f, s[0], s[1], items, o);
  return !(od < depth - Math.max(Math.abs(depth) * 1e-4, worldPerPixel(f, depth) * 2, 1e-9));
}

function addOrigin(p: V3, o: readonly number[] | undefined): V3 {
  return o ? [p[0] + o[0]!, p[1] + o[1]!, p[2] + o[2]!] : p;
}

/** 상자를 화면에 투영했을 때 커서가 tol 안에 드는지(대략) */
export function nearBox(f: ViewFrame, b: Box3, x: number, y: number, tol: number): boolean {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const p = projectToScreen(f, [i & 1 ? b.max[0] : b.min[0], i & 2 ? b.max[1] : b.min[1], i & 4 ? b.max[2] : b.min[2]]);
    if (!p) return true;
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  return x >= x0 - tol && x <= x1 + tol && y >= y0 - tol && y <= y1 + tol;
}

/**
 * 화면 점(x, y)에서 보이는 불투명 면(음영 모드의 가림)까지의 깊이. 없으면 Infinity.
 * 단면이 있으면 남는 쪽 면과 잘린 면(채운 면)만 본다. 덧그림·project의 가림 판정에 쓴다(고르기 결과와 같은 규칙).
 */
export function occludingDepth(f: ViewFrame, x: number, y: number, items: ScenePickItems, o: Omit<ScenePickOptions, 'tol' | 'occlude'>): number {
  const ray = screenRay(f, x, y);
  const bounds = o.bounds ?? itemBounds;
  const clip = o.clip ?? null;
  const ix = safeInv(ray.dir[0]), iy = safeInv(ray.dir[1]), iz = safeInv(ray.dir[2]);
  const arr = new Float64Array(6);
  const boxHit = (b: Box3): boolean => {
    const pad = (Math.abs(b.max[0] - b.min[0]) + Math.abs(b.max[1] - b.min[1]) + Math.abs(b.max[2] - b.min[2])) * 1e-6 + 1e-9;
    arr.set([b.min[0], b.min[1], b.min[2], b.max[0], b.max[1], b.max[2]]);
    return rayBoxEntry(arr, 0, ray.origin[0], ray.origin[1], ray.origin[2], ix, iy, iz, Infinity, pad) !== Infinity;
  };
  const interval = clip ? rayKeptInterval(clip, ray.origin, ray.dir) : null;
  if (clip && !interval) return Infinity;
  let best = Infinity;
  if (clip && interval && interval[0] > 0 && o.caps) {
    const t0 = interval[0];
    for (const m of items.meshes) {
      if (m.color[3] < 0.999 || !o.caps(m) || !boxHit(bounds(m))) continue;
      const bvh = o.bvh('triangle', m.positions, m.indices);
      if (!bvh) continue;
      const model = o.model ? o.model(m) : modelMatrix(m.matrix, m.origin);
      let lo: readonly number[] = ray.origin, ld: readonly number[] = ray.dir;
      if (model) {
        const inv = mat4Invert(model);
        if (!inv) continue;
        lo = transformPoint(inv, ray.origin);
        ld = transformDir(inv, ray.dir);
      }
      if (countRayHits(bvh, m.positions, m.indices, lo, ld, t0, o.hidden?.(m)) % 2 === 1) {
        best = viewDepth(f, [ray.origin[0] + ray.dir[0] * t0, ray.origin[1] + ray.dir[1] * t0, ray.origin[2] + ray.dir[2] * t0]);
        break;
      }
    }
  }
  for (const m of items.meshes) {
    if (m.color[3] < 0.999 || !boxHit(bounds(m))) continue;
    const bvh = o.bvh('triangle', m.positions, m.indices);
    if (!bvh) continue;
    const h = pickMeshRay(f, ray, m.positions, m.indices, bvh, o.model ? o.model(m) : modelMatrix(m.matrix, m.origin), interval, o.hidden?.(m));
    if (h && h.depth < best) best = h.depth;
  }
  return best;
}
