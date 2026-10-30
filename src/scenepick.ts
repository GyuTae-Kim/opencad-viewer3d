/**
 * 장면 고르기(순수 함수, DOM·WebGL 없음): 보이는 그물·선분·점 묶음에서 화면 점 아래 것을 고른다. Viewer3d.pick이 쓴다.
 *
 * - 차례: 점(가까운 것) → 선분 → 그물. 음영 모드(occlude)면 불투명 면이 그 뒤의 선분·점을 가린다.
 * - 묶음 원점(origin)이 있는 선분·점은 그 원점만큼 옮긴 프레임(shiftFrame)에서 로컬 positions 그대로 고르고 결과에 원점을 더한다.
 *   그물은 원점을 합친 모형 행렬로 광선을 로컬로 옮긴다. 어느 쪽이든 double로 계산하므로 큰 좌표에서도 정밀하다.
 * - 단면(clip, 세계 평면)이 있으면 잘린 쪽(평면 값 > 0)은 고르지 않는다: 그물은 광선의 남는 구간만, 선분은 남는 부분만, 점은 남는 것만.
 */
import type { Box3, LineSet3d, Mesh3d, Pick3d, PointSet3d, SnapKind } from './types';
import { itemBounds } from './bounds';
import { type Bvh, type PrimKind, countRayHits, queryCone, rayBoxEntry, safeInv } from './bvh';
import { type ViewFrame, projectToScreen, screenRay, shiftFrame, viewDepth, worldPerPixel } from './camera';
import { type V3, mat4Invert, modelMatrix, normalize, transformDir, transformPoint, translation } from './math';
import {
  TIE_PX,
  chooseNearest,
  normBound3,
  pickCone,
  pickMeshRay,
  pickPointSet,
  pickSegments,
  pointCandidates,
  segmentCandidates,
  segmentScreenPick,
  snapToNearest,
  snapToNearestKind,
} from './pick';
import { SNAP_PX } from './pointer';
import { type Plane4, planeShift, planeValue, rayKeptInterval, rayKeptIntervalN } from './section';

export interface PickDetail {
  pick: Pick3d;
  /** 측정용 붙잡은 점(꼭짓점·끝점 가까우면 그 점) */
  snap: V3;
  vertex: boolean;
  /**
   * 붙잡은 종류(0.8.0): 점 묶음의 점·그물 꼭짓점 'vertex', 선분·윤곽선 끝점 'endpoint', 가운데 점 'midpoint'(midpoints를 켰을 때).
   * 붙잡지 않았으면 null(vertex가 false일 때와 같다)
   */
  snapKind: SnapKind | null;
  /** 고른 선분·윤곽선의 세계 끝점 둘(0.10.0 — 나란함 추론의 기준 선분, 단면으로 자르기 전). 그물 면·점이면 없다 */
  ends?: [V3, V3];
  /** 0.18.0: 그물 면이면 맞은 삼각형의 세계 꼭짓점 셋(축과 면의 교차가 면 평면을 광선 맞은 점의 셈 오차 없이 쓴다). 잘린 면(단면 채움)·선분·점이면 없다 */
  corners?: [V3, V3, V3];
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
  /**
   * 단면에서 잘린 면을 채워 그리는 그물인지(닫힌 불투명 그물) — 그 잘린 면을 누르면 평면 위 점을 고른다.
   * 여러 평면(clips)이면 k = 그 묶음 평면 목록 안 번호(그 평면의 채우기 선택)
   */
  caps?: (m: Mesh3d, k?: number) => boolean;
  /** 여러 단면 평면(세계, 묶음마다 — 범위를 정한 평면은 그 묶음에만). 주면 clip 대신 쓴다. 빈 목록이면 그 묶음은 자르지 않는다 */
  clips?: (it: Mesh3d | LineSet3d | PointSet3d) => readonly Readonly<Plane4>[] | null | undefined;
  /** 잘린 면을 함께 채우는 묶음 이름(Mesh3d.capGroup): 같은 이름 그물은 광선 교차를 더해 안쪽을 가린다 */
  capGroup?: (m: Mesh3d) => string | undefined;
  /** 묶음 안 숨긴 구간: 기본 도형 번호(삼각형·선분·점)가 숨겨졌는지 판정하는 함수(숨긴 것이 없으면 null) */
  hidden?: (it: Mesh3d | LineSet3d | PointSet3d) => ((i: number) => boolean) | null | undefined;
  /** 그물 윤곽선(Mesh3d.edges)도 고른다(선분 다음, 면보다 먼저) — kind 'edge' */
  edges?: boolean;
  /** 숨긴 윤곽선 구간 판정(Mesh3d.edges의 선분 번호) */
  edgeHidden?: (m: Mesh3d) => ((i: number) => boolean) | null | undefined;
  /** 불투명 그물인지(가림·잘린 면 판정). 없으면 color 알파 ≥ 0.999 */
  opaque?: (m: Mesh3d) => boolean;
  /**
   * 선분·점 묶음의 모형 행렬(로컬 positions → 세계, 묶음 원점 포함). 행렬을 돌려주면 그 행렬로 고르고(setItemMatrix),
   * undefined면 예전처럼 원점만 옮겨 고른다
   */
  itemModel?: (it: LineSet3d | PointSet3d) => ArrayLike<number> | undefined;
  /** 고른 선분·윤곽선의 가운데 점에도 측정 점을 붙잡는다(0.8.0, 기본 false — 끝점과 같은 거리 snap 안에서 더 가까운 것) */
  midpoints?: boolean;
  /**
   * 0.23.0: 반투명 그물(opaque가 false — 없으면 color 알파 < 0.999)의 면을 지나 고른다. 광선이 그 뒤에서 불투명 그물 면(잘린 면 채움 포함)을 맞으면
   * 가장 앞의 불투명 면을 고르고, 반투명 면만 맞으면 예전처럼 가장 앞의 반투명 면이다. 선분·점·윤곽선과 가림(occlude — 원래 불투명 면만 가린다)은 그대로다
   */
  throughTranslucent?: boolean;
  /**
   * 0.24.0: throughTranslucent가 지나가지 않을 그물(true면 반투명이어도 불투명 면처럼 그 면에서 멈춘다 — 판 안 포켓처럼 반투명으로 그리지만 고르기에서는 벽으로 볼 그물).
   * throughTranslucent일 때만 본다. 가림(occlude)·잘린 면 판정은 그대로 opaque를 따른다(그림이 바뀌지 않으므로 뒤 선분·점을 가리지 않는다)
   */
  pickOpaque?: (m: Mesh3d) => boolean;
  /**
   * 0.27.0: throughTranslucent가 지나갈 그 그물의 삼각형(번호 판정 — Pick3d.raw와 같은 번호, 없으면 null). 그물이 불투명이거나 pickOpaque여도 이 삼각형에서는 멈추지 않고
   * 반투명 면처럼 지나 그 뒤(같은 그물의 다른 면 포함)를 본다 — 판 안 포켓의 뚜껑처럼 그물의 일부 면만 지나가게 할 때.
   * throughTranslucent일 때만 본다. 반투명 면만 맞으면 예전처럼 가장 앞의 면(이 삼각형일 수도 있다)이다. 가림(occlude)·잘린 면 판정은 그대로 opaque를 따른다
   */
  pickThrough?: (m: Mesh3d) => ((tri: number) => boolean) | null | undefined;
}

const FAST_SCAN_LIMIT = 20_000;

/** throughTranslucent가 이 그물 면에서 멈추는지: 불투명(opaque)이거나 앱이 고르기에서 불투명으로 보라고 한 그물(0.24.0 pickOpaque) */
function stopsThrough(o: ScenePickOptions, m: Mesh3d, opaque: boolean): boolean {
  return opaque || (!!o.pickOpaque && o.pickOpaque(m));
}

type MeshRayHit = NonNullable<ReturnType<typeof pickMeshRay>>;

/**
 * throughTranslucent가 이 그물에서 멈추는 면 맞음(0.27.0): 가장 앞 맞음 h가 지나갈 삼각형(o.pickThrough)이 아니면 h 그대로, 그렇다면
 * 지나갈 삼각형과 숨긴 삼각형을 빼고 같은 광선(같은 구간)으로 다시 맞춘 것(없으면 null). 지나갈 삼각형이 없는 그물은 다시 맞추지 않는다
 */
function stopHit(
  o: ScenePickOptions,
  m: Mesh3d,
  h: MeshRayHit,
  redo: (skip: (tri: number) => boolean) => MeshRayHit | null,
): MeshRayHit | null {
  const pass = o.pickThrough?.(m);
  if (!pass || !pass(h.tri)) return h;
  const hid = o.hidden?.(m);
  return redo(hid ? (t) => pass(t) || hid(t) : pass);
}

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
  // 여러 평면(묶음마다): 묶음의 평면 목록과 그 남는 쪽 판정
  const multi = !!o.clips;
  const NONE: readonly Readonly<Plane4>[] = [];
  const planesOf = (it: Mesh3d | LineSet3d | PointSet3d): readonly Readonly<Plane4>[] => (multi ? (o.clips!(it) ?? NONE) : clip ? [clip] : NONE);
  const keptBy = (planes: readonly Readonly<Plane4>[]) => (p: readonly number[]): boolean =>
    planes.every((c) => planeValue(c, p[0]!, p[1]!, p[2]!) <= 1e-9 * (Math.abs(c[3]) + 1));
  /** 아직 BVH가 없고(빠른 고르기) 크면 건너뛴다 — 모두 훑기는 작은 묶음만 */
  const skip = (bvh: Bvh | null, n: number): boolean => !bvh && !!o.fast && n > FAST_SCAN_LIMIT;

  // 그물(광선). 단면이 있으면 광선의 남는 구간만
  const interval = clip ? rayKeptInterval(clip, ray.origin, ray.dir) : null;
  let mesh: { m: Mesh3d; h: NonNullable<ReturnType<typeof pickMeshRay>> } | null = null;
  // 선분·점을 가리는 깊이: 불투명 면(음영 모드)만 가린다
  let occl = Infinity;
  // 잘린 면(채운 면): 눈이 잘린 쪽에 있어 광선이 평면에서 남는 쪽으로 들어가고(t0 > 0), 그 점이 닫힌 그물 안이면(뒤쪽 교차가 홀수)
  // 그 점을 고른다. 남는 쪽의 어떤 면보다도 앞에 있으므로 다른 그물보다 먼저다
  let cap: { m: Mesh3d; point: V3; depth: number; n?: V3 } | null = null;
  if (multi) {
    const r = pickMeshesMulti(f, ray, items, o, planesOf, boxHit, bounds);
    mesh = r.mesh;
    cap = r.cap;
    occl = r.occl;
  } else if (clip && interval && interval[0] > 0 && o.caps) {
    const t0 = interval[0];
    // 묶음 이름(capGroup)이 같은 그물은 교차 수를 더한다(이름이 없으면 그물 하나씩 — 예전과 같다)
    const groups = o.capGroup ? new Map<string, { m: Mesh3d; n: number }>() : null;
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
      const hits = countRayHits(bvh, m.positions, m.indices, lo, ld, t0, o.hidden?.(m));
      const g = groups ? o.capGroup!(m) : undefined;
      if (g !== undefined) {
        const e = groups!.get(g);
        if (e) e.n += hits;
        else groups!.set(g, { m, n: hits });
        continue;
      }
      if (hits % 2 === 1) {
        const point: V3 = [ray.origin[0] + ray.dir[0] * t0, ray.origin[1] + ray.dir[1] * t0, ray.origin[2] + ray.dir[2] * t0];
        cap = { m, point, depth: viewDepth(f, point) };
        break;
      }
    }
    if (!cap && groups)
      for (const e of groups.values())
        if (e.n % 2 === 1) {
          const point: V3 = [ray.origin[0] + ray.dir[0] * t0, ray.origin[1] + ray.dir[1] * t0, ray.origin[2] + ray.dir[2] * t0];
          cap = { m: e.m, point, depth: viewDepth(f, point) };
          break;
        }
    if (cap && (o.opaque ? o.opaque(cap.m) : cap.m.color[3] >= 0.999) && o.occlude) occl = cap.depth * (1 + 1e-4) + 1e-9;
  }
  if (!multi && (!clip || interval) && !cap) {
    // 0.23.0 throughTranslucent: 가장 앞의 불투명 면을 따로 기억해 있으면 그것을 고른다
    let solid: { m: Mesh3d; h: NonNullable<ReturnType<typeof pickMeshRay>> } | null = null;
    for (const m of items.meshes) {
      if (!boxHit(bounds(m))) continue;
      const bvh = o.bvh('triangle', m.positions, m.indices);
      if (!bvh) continue;
      const model = o.model ? o.model(m) : modelMatrix(m.matrix, m.origin);
      const h = pickMeshRay(f, ray, m.positions, m.indices, bvh, model, interval, o.hidden?.(m));
      if (!h) continue;
      if (!mesh || h.depth < mesh.h.depth) mesh = { m, h };
      const opaque = o.opaque ? o.opaque(m) : m.color[3] >= 0.999;
      if (o.throughTranslucent && stopsThrough(o, m, opaque)) {
        // 0.27.0: 그 그물의 지나갈 삼각형(pickThrough)을 맞았으면 그 뒤에서 멈추는 면
        const hs = stopHit(o, m, h, (skip) => pickMeshRay(f, ray, m.positions, m.indices, bvh, model, interval, skip));
        if (hs && (!solid || hs.depth < solid.h.depth)) solid = { m, h: hs };
      }
      if (o.occlude && opaque) occl = Math.min(occl, h.depth * (1 + 1e-4) + 1e-9);
    }
    if (solid) mesh = solid;
  }

  // 점
  const pts: { p: PointSet3d; i: number; point: V3; distPx: number; depth: number }[] = [];
  for (const p of items.points) {
    const bvh = o.bvh('point', p.positions, undefined);
    if (skip(bvh, p.positions.length / 3)) continue;
    const pm = o.itemModel?.(p);
    if (pm) {
      // 묶음 행렬이 걸린 점 묶음: 세계에서 재고 가림 깊이로 거른다
      const pl = planesOf(p);
      for (const h of pointCandidates(f, p.positions, bvh, pm, x, y, tol + (p.size ?? 4) / 2, { clips: pl.length ? pl : null, skip: o.hidden?.(p) }))
        if (h.depth <= occl) pts.push({ p, i: h.index, point: h.point, distPx: h.distPx, depth: h.depth });
      continue;
    }
    const fl = shiftFrame(f, p.origin);
    const pc = multi ? planesOf(p).map((c) => planeShift(c, p.origin)) : clip ? planeShift(clip, p.origin) : null;
    const h = pickPointSet(fl, p.positions, bvh, x, y, tol + (p.size ?? 4) / 2, occl, pc, o.hidden?.(p));
    if (h) pts.push({ p, i: h.index, point: addOrigin(h.point, p.origin), distPx: h.distPx, depth: h.depth });
  }
  const pt = chooseNearest(pts);
  if (pt) {
    const id = pt.p.pointIds?.[pt.i] ?? pt.i;
    return { pick: { kind: 'point', id: pt.p.id, index: id, point: pt.point, raw: pt.i }, snap: pt.point, vertex: true, snapKind: 'vertex' };
  }

  // 선분
  const lns: { l: LineSet3d; i: number; point: V3; distPx: number; depth: number }[] = [];
  for (const l of items.lines) {
    const tl = tol + (l.width ?? 1) / 2;
    const b = bounds(l);
    if (!boxHit(b) && !nearBox(f, b, x, y, tl)) continue;
    const bvh = o.bvh('segment', l.positions, undefined);
    if (skip(bvh, l.positions.length / 6)) continue;
    const lmod = o.itemModel?.(l);
    if (lmod) {
      // 묶음 행렬이 걸린 선분 묶음: 세계에서 재고(그리기 범위 앞쪽만) 가림 깊이로 거른다
      const pl = planesOf(l);
      const lim = o.limit?.(l.id) ?? Infinity;
      const hid = o.hidden?.(l);
      for (const h of segmentCandidates(f, l.positions, bvh, lmod, x, y, tl, { clips: pl.length ? pl : null, skip: (i) => i >= lim || !!hid?.(i) }))
        if (h.depth <= occl) lns.push({ l, i: h.index, point: h.point, distPx: h.distPx, depth: h.depth });
      continue;
    }
    const fl = shiftFrame(f, l.origin);
    const h = pickSegments(
      fl,
      l.positions,
      bvh,
      x,
      y,
      tl,
      multi
        ? { limit: o.limit?.(l.id), maxDepth: occl, clips: planesOf(l).map((c) => planeShift(c, l.origin)), skip: o.hidden?.(l) }
        : { limit: o.limit?.(l.id), maxDepth: occl, clip: clip ? planeShift(clip, l.origin) : null, skip: o.hidden?.(l) },
    );
    if (h) lns.push({ l, i: h.index, point: addOrigin(h.point, l.origin), distPx: h.distPx, depth: h.depth });
  }
  const ln = chooseNearest(lns);
  if (ln) {
    const P = ln.l.positions, k = ln.i * 6;
    const lmod = o.itemModel?.(ln.l);
    const raw = lmod
      ? [transformPoint(lmod, [P[k]!, P[k + 1]!, P[k + 2]!]), transformPoint(lmod, [P[k + 3]!, P[k + 4]!, P[k + 5]!])]
      : [addOrigin([P[k]!, P[k + 1]!, P[k + 2]!], ln.l.origin), addOrigin([P[k + 3]!, P[k + 4]!, P[k + 5]!], ln.l.origin)];
    const keep = multi ? keptBy(planesOf(ln.l)) : kept;
    const id = ln.l.segmentIds?.[ln.i] ?? ln.i;
    const pick: Pick3d = { kind: 'line', id: ln.l.id, index: id, point: ln.point, raw: ln.i };
    if (o.midpoints) return snapSegment(f, pick, raw as [V3, V3], keep, x, y, snapPx);
    const v = snapToNearest(f, raw.filter(keep), x, y, snapPx);
    return { pick, snap: v ?? ln.point, vertex: !!v, snapKind: v ? 'endpoint' : null, ends: raw as [V3, V3] };
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
      const pl = planesOf(m);
      for (const h of segmentCandidates(f, E, bvh, model, x, y, tol, { clips: pl.length ? pl : null, skip: o.edgeHidden?.(m) })) eds.push({ m, i: h.index, point: h.point, distPx: h.distPx, depth: h.depth });
    }
    const ed = chooseVisible(eds, (c) => !o.occlude || edgeVisible(f, c.point, c.depth, items, o));
    if (ed) {
      const P = ed.m.edges!, k = ed.i * 6;
      const model = o.model ? o.model(ed.m) : modelMatrix(ed.m.matrix, ed.m.origin);
      const raw = [
        [P[k]!, P[k + 1]!, P[k + 2]!],
        [P[k + 3]!, P[k + 4]!, P[k + 5]!],
      ].map((p) => (model ? transformPoint(model, p) : (p as V3)));
      const keep = keptBy(planesOf(ed.m));
      const pick: Pick3d = { kind: 'edge', id: ed.m.id, index: ed.i, point: ed.point, raw: ed.i };
      if (o.midpoints) return snapSegment(f, pick, raw as [V3, V3], keep, x, y, snapPx);
      const v = snapToNearest(f, raw.filter(keep), x, y, snapPx);
      return { pick, snap: v ?? ed.point, vertex: !!v, snapKind: v ? 'endpoint' : null, ends: raw as [V3, V3] };
    }
  }

  if (cap) {
    let n = cap.n ?? normalize([clip![0], clip![1], clip![2]]);
    if (n[0] * ray.dir[0] + n[1] * ray.dir[1] + n[2] * ray.dir[2] > 0) n = [-n[0], -n[1], -n[2]];
    return { pick: { kind: 'mesh', id: cap.m.id, index: -1, point: cap.point, raw: -1, normal: n, section: true }, snap: cap.point, vertex: false, snapKind: null };
  }
  if (mesh) {
    const v = snapToNearest(f, mesh.h.corners.filter(multi ? keptBy(planesOf(mesh.m)) : kept), x, y, snapPx);
    return {
      pick: { kind: 'mesh', id: mesh.m.id, index: mesh.h.tri, point: mesh.h.point, raw: mesh.h.tri, normal: mesh.h.normal },
      snap: v ?? mesh.h.point,
      vertex: !!v,
      snapKind: v ? 'vertex' : null,
      corners: mesh.h.corners,
    };
  }
  return null;
}

type ScenePickRay = { origin: V3; dir: V3 };

/** 커서 둘레 선분 하나(segmentsNear): 세계 끝점, 묶음 id, 남는 쪽 판정, 화면 거리·깊이, 0.14.0 선분 종류와 번호(원본 식별 번호 index, 배열 안 번호 raw) */
export interface NearSegmentHit {
  a: V3;
  b: V3;
  id: string;
  keep: ((p: readonly number[]) => boolean) | undefined;
  distPx: number;
  depth: number;
  kind: 'line' | 'edge';
  index: number;
  raw: number;
}

/**
 * 커서 tolPx 안의 선분(0.9.0 추론 붙잡기 — 교차점·수직 발): 보이는 선분 묶음(그리기 범위 앞쪽, 숨긴 구간 빼고)과 o.edges면 그물 윤곽선.
 * 세계 끝점(자르기 전 — 교차·수직 발은 선 위 어디든 된다)과 그 묶음의 남는 쪽 판정을 돌려준다. 화면 거리 차례로 max개까지.
 * 가림은 따지지 않는다(후보 점마다 따로 묻는다). 0.14.0부터 선분 종류와 번호(kind·index·raw — 고르기 결과 Pick3d와 같은 뜻)도 싣는다
 */
export function segmentsNear(
  f: ViewFrame,
  x: number,
  y: number,
  items: ScenePickItems,
  o: Pick<ScenePickOptions, 'bvh' | 'limit' | 'bounds' | 'model' | 'clip' | 'clips' | 'hidden' | 'edges' | 'edgeHidden' | 'itemModel'>,
  tolPx: number,
  max = 24,
): NearSegmentHit[] {
  const bounds = o.bounds ?? itemBounds;
  const clip = o.clip ?? null;
  const NONE: readonly Readonly<Plane4>[] = [];
  const planesOf = (it: Mesh3d | LineSet3d): readonly Readonly<Plane4>[] => (o.clips ? (o.clips(it) ?? NONE) : clip ? [clip] : NONE);
  const keepOf = (pl: readonly Readonly<Plane4>[]) =>
    pl.length ? (p: readonly number[]): boolean => pl.every((c) => planeValue(c, p[0]!, p[1]!, p[2]!) <= 1e-9 * (Math.abs(c[3]) + 1)) : undefined;
  const out: NearSegmentHit[] = [];
  const add = (
    kind: 'line' | 'edge',
    id: string,
    P: Float32Array,
    ids: ArrayLike<number> | undefined,
    model: ArrayLike<number> | undefined,
    pl: readonly Readonly<Plane4>[],
    hs: { index: number; distPx: number; depth: number }[],
  ): void => {
    if (!hs.length) return;
    const keep = keepOf(pl);
    for (const h of hs) {
      const k = h.index * 6;
      const a: V3 = [P[k]!, P[k + 1]!, P[k + 2]!], b: V3 = [P[k + 3]!, P[k + 4]!, P[k + 5]!];
      out.push({ a: model ? transformPoint(model, a) : a, b: model ? transformPoint(model, b) : b, id, keep, distPx: h.distPx, depth: h.depth, kind, index: ids?.[h.index] ?? h.index, raw: h.index });
    }
  };
  for (const l of items.lines) {
    if (!nearBox(f, bounds(l), x, y, tolPx + (l.width ?? 1) / 2)) continue;
    const model = o.itemModel?.(l) ?? (l.origin && (l.origin[0] || l.origin[1] || l.origin[2]) ? translation(l.origin) : undefined);
    const pl = planesOf(l);
    const lim = o.limit?.(l.id) ?? Infinity;
    const hid = o.hidden?.(l);
    add('line', l.id, l.positions, l.segmentIds, model, pl, segmentCandidates(f, l.positions, o.bvh('segment', l.positions, undefined), model, x, y, tolPx + (l.width ?? 1) / 2, { clips: pl.length ? pl : null, skip: (i) => i >= lim || !!hid?.(i) }));
  }
  if (o.edges)
    for (const m of items.meshes) {
      const E = m.edges;
      if (!E || E.length < 6 || !nearBox(f, bounds(m), x, y, tolPx)) continue;
      const model = o.model ? o.model(m) : modelMatrix(m.matrix, m.origin);
      const pl = planesOf(m);
      add('edge', m.id, E, undefined, model, pl, segmentCandidates(f, E, o.bvh('segment', E, undefined), model, x, y, tolPx, { clips: pl.length ? pl : null, skip: o.edgeHidden?.(m) }));
    }
  out.sort((p, q) => p.distPx - q.distPx);
  if (out.length > max) out.length = max;
  return out;
}

/**
 * 커서 둘레 그물 삼각형 하나(0.22.0 trianglesNear): 세계 꼭짓점 셋(묶음 origin·행렬을 거친 값), 그물 id, 삼각형 번호(Pick3d.index와 같은 뜻),
 * 세계 단위 법선(눈 쪽), 그 그물의 남는 쪽 판정, 커서와 화면 거리(화면에 그린 삼각형 안이면 0), 커서 쪽 점 깊이
 */
export interface NearTriangleHit {
  corners: [V3, V3, V3];
  id: string;
  index: number;
  normal: V3;
  keep: ((p: readonly number[]) => boolean) | undefined;
  distPx: number;
  depth: number;
}

/**
 * 커서 tolPx 안의 그물 삼각형(0.22.0 — 측정의 선과 삼각형의 열린 교차): 보이는 그물(숨긴 구간 빼고)에서 화면에 그린 삼각형이 커서에서 tolPx 안인 것.
 * 꼭짓점 하나라도 눈 뒤인 삼각형과 한 단면 평면의 잘린 쪽에 모두 있는 삼각형은 뺀다(일부만 잘린 삼각형은 남는다 — 받는 점마다 keep으로 따진다).
 * 가림은 따지지 않는다(후보 점마다 따로 묻는다). 화면 거리 차례로 max개까지. segmentsNear와 같은 원뿔 질의(BVH)를 쓴다
 */
export function trianglesNear(
  f: ViewFrame,
  x: number,
  y: number,
  items: ScenePickItems,
  o: Pick<ScenePickOptions, 'bvh' | 'bounds' | 'model' | 'clip' | 'clips' | 'hidden'>,
  tolPx: number,
  max = 24,
): NearTriangleHit[] {
  const bounds = o.bounds ?? itemBounds;
  const clip = o.clip ?? null;
  const NONE: readonly Readonly<Plane4>[] = [];
  const out: NearTriangleHit[] = [];
  const ray = screenRay(f, x, y);
  const eye = f.projection === 'perspective' ? f.eye : null;
  for (const m of items.meshes) {
    if (!nearBox(f, bounds(m), x, y, tolPx)) continue;
    const P = m.positions, I = m.indices;
    const n = I ? Math.floor(I.length / 3) : Math.floor(P.length / 9);
    if (!n) continue;
    const model = o.model ? o.model(m) : modelMatrix(m.matrix, m.origin);
    const pl = o.clips ? (o.clips(m) ?? NONE) : clip ? [clip] : NONE;
    const keep = pl.length ? (p: readonly number[]): boolean => pl.every((c) => planeValue(c, p[0]!, p[1]!, p[2]!) <= 1e-9 * (Math.abs(c[3]) + 1)) : undefined;
    const hid = o.hidden?.(m);
    const test = (tri: number): void => {
      if (tri >= n || (hid && hid(tri))) return;
      const cs = [0, 1, 2].map((k) => {
        const i = (I ? I[tri * 3 + k]! : tri * 3 + k) * 3;
        const p: V3 = [P[i]!, P[i + 1]!, P[i + 2]!];
        return model ? transformPoint(model, p) : p;
      }) as [V3, V3, V3];
      if (pl.some((c) => cs.every((p) => planeValue(c, p[0], p[1], p[2]) > 1e-9 * (Math.abs(c[3]) + 1)))) return;
      const s = cs.map((p) => projectToScreen(f, p));
      const s0 = s[0], s1 = s[1], s2 = s[2];
      if (!s0 || !s1 || !s2) return;
      const u: V3 = [cs[1][0] - cs[0][0], cs[1][1] - cs[0][1], cs[1][2] - cs[0][2]], w: V3 = [cs[2][0] - cs[0][0], cs[2][1] - cs[0][1], cs[2][2] - cs[0][2]];
      let nrm: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const nl = Math.hypot(nrm[0], nrm[1], nrm[2]);
      if (!(nl > 0)) return;
      nrm = [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl];
      const toEye: readonly number[] = eye ? [eye[0] - cs[0][0], eye[1] - cs[0][1], eye[2] - cs[0][2]] : f.basis.back;
      if (nrm[0] * toEye[0]! + nrm[1] * toEye[1]! + nrm[2] * toEye[2]! < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
      // 화면에 그린 삼각형 안이면 거리 0(깊이는 커서 광선이 그 평면을 맞는 자리), 밖이면 가장 가까운 변
      const side = (a: V3, b: V3): number => (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      const e0 = side(s0, s1), e1 = side(s1, s2), e2 = side(s2, s0);
      let distPx = Infinity, depth = Infinity;
      const den = nrm[0] * ray.dir[0] + nrm[1] * ray.dir[1] + nrm[2] * ray.dir[2];
      if (((e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0)) && Math.abs(den) > 1e-12) {
        const t = (nrm[0] * (cs[0][0] - ray.origin[0]) + nrm[1] * (cs[0][1] - ray.origin[1]) + nrm[2] * (cs[0][2] - ray.origin[2])) / den;
        distPx = 0;
        depth = viewDepth(f, [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t, ray.origin[2] + ray.dir[2] * t]);
      } else
        for (let k = 0; k < 3; k++) {
          const a = cs[k]!, b = cs[(k + 1) % 3]!;
          const h = segmentScreenPick(f, a[0], a[1], a[2], b[0], b[1], b[2], x, y);
          if (h && h.distPx < distPx) {
            distPx = h.distPx;
            depth = h.depth;
          }
        }
      if (!(distPx <= tolPx) || !Number.isFinite(depth)) return;
      out.push({ corners: cs, id: m.id, index: tri, normal: nrm, keep, distPx, depth });
    };
    const bvh = o.bvh('triangle', P, I);
    if (bvh) {
      const c = pickCone(f, ray.origin, tolPx);
      let lo: V3 = ray.origin, ld: V3 = ray.dir, r0 = c.r0, k = c.k;
      if (model) {
        const inv = mat4Invert(model);
        if (!inv) continue;
        const sc = normBound3(inv);
        lo = transformPoint(inv, ray.origin);
        const d = transformDir(inv, ray.dir);
        const l = Math.hypot(d[0], d[1], d[2]);
        if (!(l > 0)) continue;
        // 로컬 단위 방향의 매개변수 τ = l·t, 로컬 반지름 ≤ sc·(r0 + k·t) — segmentCandidates와 같다
        ld = [d[0] / l, d[1] / l, d[2] / l];
        r0 = c.r0 * sc;
        k = (c.k * sc) / l;
      }
      queryCone(bvh, lo, ld, r0, k, Infinity, (i) => {
        test(i);
      });
    } else for (let i = 0; i < n; i++) test(i);
  }
  out.sort((p, q) => p.distPx - q.distPx);
  if (out.length > max) out.length = max;
  return out;
}

/** 가운데 점이 끝점을 이기려면 화면에서 이만큼(화소) 더 가까워야 한다 — 화면에서 몇 화소짜리 선분(곡선을 나눈 꺾은선)은 끝점이 이긴다 */
export const MIDPOINT_YIELD_PX = 2;

/**
 * 고른 선분(세계 끝점 둘)에서 측정 점 붙잡기(0.8.0 midpoints): 남는 쪽(keep) 끝점과 가운데 점 가운데 커서에서 snapPx 안의 가까운 것.
 * 가운데 점은 끝점보다 MIDPOINT_YIELD_PX 넘게 가까울 때만. 아무것도 없으면 고른 점 그대로
 */
function snapSegment(f: ViewFrame, pick: Pick3d, ends: [V3, V3], keep: (p: readonly number[]) => boolean, x: number, y: number, snapPx: number): PickDetail {
  const [a, b] = ends;
  const e = snapToNearestKind(
    f,
    ends.filter(keep).map((p) => ({ p, kind: 'endpoint' as SnapKind })),
    x,
    y,
    snapPx,
  );
  const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const m = keep(mid) ? snapToNearestKind(f, [{ p: mid, kind: 'midpoint' as SnapKind }], x, y, snapPx) : null;
  const s = m && (!e || m.distPx + MIDPOINT_YIELD_PX < e.distPx) ? m : e;
  return { pick, snap: s ? s.p : pick.point, vertex: !!s, snapKind: s ? s.kind : null, ends };
}

/**
 * 여러 단면 평면(묶음마다 다를 수 있다): 그물마다 남는 광선 구간에서 맞음을 찾고, 채우는 그물(caps)은 들어온 평면 위 점이
 * 닫힌 그물(같은 capGroup이면 함께) 안이면 잘린 면으로 본다. 그물과 잘린 면 가운데 앞의 것이 이긴다.
 */
function pickMeshesMulti(
  f: ViewFrame,
  ray: ScenePickRay,
  items: ScenePickItems,
  o: ScenePickOptions,
  planesOf: (it: Mesh3d) => readonly Readonly<Plane4>[],
  boxHit: (b: Box3) => boolean,
  bounds: (it: Mesh3d) => Box3,
): { mesh: { m: Mesh3d; h: NonNullable<ReturnType<typeof pickMeshRay>> } | null; cap: { m: Mesh3d; point: V3; depth: number; n: V3 } | null; occl: number } {
  let mesh: { m: Mesh3d; h: NonNullable<ReturnType<typeof pickMeshRay>> } | null = null;
  let solid: { m: Mesh3d; h: NonNullable<ReturnType<typeof pickMeshRay>> } | null = null;
  let occl = Infinity;
  const groups = new Map<string, { m: Mesh3d; n: number; t0: number; plane: Readonly<Plane4> }>();
  for (const m of items.meshes) {
    if (!boxHit(bounds(m))) continue;
    const pl = planesOf(m);
    const iv = pl.length ? rayKeptIntervalN(pl, ray.origin, ray.dir) : { t0: 0, t1: Infinity, enter: -1 };
    if (!iv) continue;
    const bvh = o.bvh('triangle', m.positions, m.indices);
    if (!bvh) continue;
    const model = o.model ? o.model(m) : modelMatrix(m.matrix, m.origin);
    if (o.caps && iv.enter >= 0 && iv.t0 > 0 && o.caps(m, iv.enter)) {
      let lo: readonly number[] = ray.origin, ld: readonly number[] = ray.dir;
      let ok = true;
      if (model) {
        const inv = mat4Invert(model);
        if (!inv) ok = false;
        else {
          lo = transformPoint(inv, ray.origin);
          ld = transformDir(inv, ray.dir);
        }
      }
      if (ok) {
        const hits = countRayHits(bvh, m.positions, m.indices, lo, ld, iv.t0, o.hidden?.(m));
        const key = `${o.capGroup?.(m) ?? `#${m.id}`}|${iv.t0}`;
        const e = groups.get(key);
        if (e) e.n += hits;
        else groups.set(key, { m, n: hits, t0: iv.t0, plane: pl[iv.enter]! });
      }
    }
    const range: [number, number] | null = pl.length ? [iv.t0, iv.t1] : null;
    const h = pickMeshRay(f, ray, m.positions, m.indices, bvh, model, range, o.hidden?.(m));
    if (!h) continue;
    if (!mesh || h.depth < mesh.h.depth) mesh = { m, h };
    const opaque = o.opaque ? o.opaque(m) : m.color[3] >= 0.999;
    if (o.throughTranslucent && stopsThrough(o, m, opaque)) {
      const hs = stopHit(o, m, h, (skip) => pickMeshRay(f, ray, m.positions, m.indices, bvh, model, range, skip));
      if (hs && (!solid || hs.depth < solid.h.depth)) solid = { m, h: hs };
    }
    if (o.occlude && opaque) occl = Math.min(occl, h.depth * (1 + 1e-4) + 1e-9);
  }
  // 0.23.0 throughTranslucent: 가장 앞의 불투명 면이 있으면 그것(잘린 면 채움과는 그 면으로 견준다)
  if (solid) mesh = solid;
  let cap: { m: Mesh3d; point: V3; depth: number; n: V3 } | null = null;
  for (const e of groups.values()) {
    if (e.n % 2 !== 1) continue;
    const point: V3 = [ray.origin[0] + ray.dir[0] * e.t0, ray.origin[1] + ray.dir[1] * e.t0, ray.origin[2] + ray.dir[2] * e.t0];
    let n = normalize([e.plane[0], e.plane[1], e.plane[2]]);
    if (n[0] * ray.dir[0] + n[1] * ray.dir[1] + n[2] * ray.dir[2] > 0) n = [-n[0], -n[1], -n[2]];
    const depth = viewDepth(f, point);
    if (!cap || depth < cap.depth) cap = { m: e.m, point, depth, n };
  }
  // 잘린 면이 그물 맞음보다 앞이면 잘린 면(아니면 그물). throughTranslucent인데 맞은 그물이 반투명뿐이면 잘린 면(불투명)이 이긴다
  if (cap && mesh && mesh.h.depth < cap.depth && !(o.throughTranslucent && !solid)) cap = null;
  if (cap) {
    if ((o.opaque ? o.opaque(cap.m) : cap.m.color[3] >= 0.999) && o.occlude) occl = Math.min(occl, cap.depth * (1 + 1e-4) + 1e-9);
    mesh = null;
  }
  return { mesh, cap, occl };
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
  if (o.clips) {
    const NONE: readonly Readonly<Plane4>[] = [];
    return pickMeshesMulti(f, ray, items, { ...o, tol: 0, occlude: true }, (m) => o.clips!(m) ?? NONE, boxHit, bounds).occl;
  }
  const interval = clip ? rayKeptInterval(clip, ray.origin, ray.dir) : null;
  if (clip && !interval) return Infinity;
  let best = Infinity;
  if (clip && interval && interval[0] > 0 && o.caps) {
    const t0 = interval[0];
    const groups = new Map<string, number>();
    const capAt = (): number => viewDepth(f, [ray.origin[0] + ray.dir[0] * t0, ray.origin[1] + ray.dir[1] * t0, ray.origin[2] + ray.dir[2] * t0]);
    for (const m of items.meshes) {
      if (!(o.opaque ? o.opaque(m) : m.color[3] >= 0.999) || !o.caps(m) || !boxHit(bounds(m))) continue;
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
      const hits = countRayHits(bvh, m.positions, m.indices, lo, ld, t0, o.hidden?.(m));
      const g = o.capGroup?.(m);
      if (g !== undefined) groups.set(g, (groups.get(g) ?? 0) + hits);
      else if (hits % 2 === 1) {
        best = capAt();
        break;
      }
    }
    if (best === Infinity) for (const n of groups.values()) if (n % 2 === 1) best = capAt();
  }
  for (const m of items.meshes) {
    if (!(o.opaque ? o.opaque(m) : m.color[3] >= 0.999) || !boxHit(bounds(m))) continue;
    const bvh = o.bvh('triangle', m.positions, m.indices);
    if (!bvh) continue;
    const h = pickMeshRay(f, ray, m.positions, m.indices, bvh, o.model ? o.model(m) : modelMatrix(m.matrix, m.origin), interval, o.hidden?.(m));
    if (h && h.depth < best) best = h.depth;
  }
  return best;
}
