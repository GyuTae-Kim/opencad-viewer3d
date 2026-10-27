/**
 * 앱 붙잡기 점 색인(0.9.0, 순수 계산 — DOM·WebGL 없음). Viewer3d.setMeasureSnap({ points })가 쓴다.
 *
 * 0.8.0은 마우스 이동마다 앱 점을 모두 화면에 투영했다(수십만 개면 이동마다 수십 ms). 점 묶음 고르기와 같은 범위 나무(BVH, 점)를 한 번 만들고
 * 커서 광선 둘레 원뿔(화면 몇 화소 → 세계 길이, 보수적)에 들 수 있는 점만 꺼낸다. 꺼낸 점 번호는 오름차순으로 돌려주므로,
 * 거리가 같을 때 앞의 점이 이기는 0.8.0 규칙(chooseMeasureSnap)과 결과가 같다 — 붙잡기 거리 밖 점은 어차피 고를 수 없다.
 *
 * - 큰 좌표: 나무는 점들의 가운데를 뺀 float32 좌표로 만들고, 그 반올림만큼 원뿔을 넓힌다(정확한 판정은 double 세계 좌표로 따로 한다)
 * - 묶음 행렬(setItemMatrix — 분해도): 행렬이 걸린 묶음(id)의 점은 그 묶음만의 나무(점이 적으면 모두 훑기)에서
 *   광선을 행렬의 역으로 옮겨 찾는다(반지름은 역행렬 노름 한계만큼 넉넉히)
 * - 차례 한도(0.10.0 — SnapPoint.order, Viewer3d.setMeasureSnapLimit): 점마다 차례 값을 두면 near(…, limit)가 차례 < limit인 점만 돌려준다.
 *   나무는 모든 점으로 한 번 만들고 꺼낼 때만 거르므로, 재생처럼 한도가 자주 바뀌어도 점 목록·나무를 다시 만들지 않는다
 */
import { type Bvh, buildBvh, queryCone } from './bvh';
import { type ViewFrame, screenRay } from './camera';
import { mat4Invert, transformDir, transformPoint } from './math';
import { normBound3, pickCone } from './pick';

/** 점이 이보다 적으면 색인 없이 모두 훑는다(0.8.0 그대로) */
export const SNAP_INDEX_MIN = 512;
/** 행렬이 걸린 묶음의 점이 이보다 적으면 그 묶음은 모두 훑는다 */
const SUB_INDEX_MIN = 64;

interface Tree {
  bvh: Bvh;
  /** 나무 좌표 = 세계 − center */
  center: [number, number, number];
  /** float32 반올림 여유(세계 길이) */
  pad: number;
  /** 나무 안 번호 → 전체 점 번호(전체 나무면 null) */
  map: Uint32Array | null;
  /** 점들을 감싸는 구 반지름(평행 투영 원뿔 시작점을 물릴 거리) */
  radius: number;
}

function makeTree(xyz: Float64Array, idx: Uint32Array | null): Tree {
  const n = idx ? idx.length : xyz.length / 3;
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (let k = 0; k < n; k++) {
    const i = idx ? idx[k]! : k;
    const x = xyz[i * 3]!, y = xyz[i * 3 + 1]!, z = xyz[i * 3 + 2]!;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  const center: [number, number, number] = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2];
  const local = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const i = idx ? idx[k]! : k;
    local[k * 3] = xyz[i * 3]! - center[0];
    local[k * 3 + 1] = xyz[i * 3 + 1]! - center[1];
    local[k * 3 + 2] = xyz[i * 3 + 2]! - center[2];
  }
  const half = Math.max(x1 - x0, y1 - y0, z1 - z0) / 2;
  // float32 상대 반올림(2⁻²⁴)의 몇 배 — 좌표 셋이 모두 어긋나도 덮는다
  const pad = half * 4e-7 + 1e-12;
  return { bvh: buildBvh('point', local), center, pad, map: idx, radius: Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 };
}

/**
 * 나무에서 커서(x, y) tolPx 안일 수 있는 점을 out에 더한다. inv = 세계 → 나무 쪽 세계(묶음 행렬의 역, 없으면 그대로).
 * skip(전체 번호)이 true인 점은 뺀다
 */
function queryTree(t: Tree, f: ViewFrame, x: number, y: number, tolPx: number, inv: ArrayLike<number> | null, out: number[], skip: ((i: number) => boolean) | null): void {
  const ray = screenRay(f, x, y);
  let o: number[], d: number[], r0: number, k: number;
  if (f.projection === 'perspective') {
    // 꼭짓점을 눈에 둔 원뿔(눈과 가까운 면 사이 점도 들게)
    const c = pickCone(f, f.eye, tolPx);
    o = [...f.eye];
    d = [...ray.dir];
    r0 = c.r0;
    k = c.k;
  } else {
    // 평행: 원기둥. 시작점을 점들 뒤로 물려 가까운 면 앞의 점도 든다
    const c = pickCone(f, ray.origin, tolPx);
    const back = Math.hypot(ray.origin[0] - t.center[0], ray.origin[1] - t.center[1], ray.origin[2] - t.center[2]) + t.radius + 1;
    o = [ray.origin[0] - ray.dir[0] * back, ray.origin[1] - ray.dir[1] * back, ray.origin[2] - ray.dir[2] * back];
    d = [...ray.dir];
    r0 = c.r0;
    k = 0;
  }
  if (inv) {
    // 묶음 행렬의 역으로 옮긴 광선(단위 방향으로 다시 맞추고, 반지름은 역행렬 노름 한계만큼 늘린다)
    const s = normBound3(inv);
    const lo = transformPoint(inv, o);
    const ld = transformDir(inv, d);
    const l = Math.hypot(ld[0], ld[1], ld[2]);
    if (!(l > 0)) return;
    o = lo;
    d = [ld[0] / l, ld[1] / l, ld[2] / l];
    r0 *= s;
    k = (k * s) / l;
  }
  const lo: [number, number, number] = [o[0]! - t.center[0], o[1]! - t.center[1], o[2]! - t.center[2]];
  const map = t.map;
  queryCone(t.bvh, lo, d, r0 + t.pad, k, Infinity, (j) => {
    const i = map ? map[j]! : j;
    if (!skip || !skip(i)) out.push(i);
  });
}

/** 앱 붙잡기 점(세계 xyz, 묶음 id, 차례) 색인 */
export class SnapPointIndex {
  readonly count: number;
  private readonly xyz: Float64Array;
  private readonly ids: readonly (string | undefined)[];
  /** 점마다 차례 값(0.10.0, 없으면 null — 차례가 없는 점은 −Infinity라 어떤 한도에도 든다) */
  private readonly order: Float64Array | null;
  private all: Tree | null = null;
  /** 묶음 id → 그 묶음 점 번호(오름차순) */
  private readonly byId = new Map<string, Uint32Array>();
  /** 행렬이 걸린 묶음의 나무(점이 많을 때만, 처음 쓸 때 만든다) */
  private readonly sub = new Map<string, Tree>();

  constructor(xyz: Float64Array, ids: readonly (string | undefined)[], order: Float64Array | null = null) {
    this.xyz = xyz;
    this.ids = ids;
    this.order = order;
    this.count = Math.floor(xyz.length / 3);
    const lists = new Map<string, number[]>();
    for (let i = 0; i < this.count; i++) {
      const id = ids[i];
      if (id === undefined) continue;
      let l = lists.get(id);
      if (!l) lists.set(id, (l = []));
      l.push(i);
    }
    for (const [id, l] of lists) this.byId.set(id, Uint32Array.from(l));
  }

  /** 나무를 미리 만든다(쉬는 틈에) */
  build(): void {
    this.all ??= makeTree(this.xyz, null);
  }

  /**
   * 커서(x, y)에서 화면 tolPx 안일 수 있는 점 번호(오름차순, 겹침 없음 — 정확한 거리는 부르는 쪽이 잰다).
   * matrixOf(id) = 그 묶음에 걸린 행렬(세계' = M · 세계, 없으면 undefined). moved = 행렬이 걸린 묶음 id들.
   * limit(0.10.0)을 주면 차례 값이 limit보다 작은 점만(차례가 없는 점은 늘 든다). null·undefined면 거르지 않는다
   */
  near(f: ViewFrame, x: number, y: number, tolPx: number, matrixOf: (id: string) => ArrayLike<number> | undefined, moved: Iterable<string>, limit?: number | null): number[] {
    const out: number[] = [];
    const movedPts: string[] = [];
    for (const id of moved) if (this.byId.has(id) && matrixOf(id)) movedPts.push(id);
    const movedSet = movedPts.length ? new Set(movedPts) : null;
    const ids = this.ids;
    const ord = limit !== null && limit !== undefined ? this.order : null;
    const lim = limit ?? Infinity;
    // 꺼낼 때 거르기: 행렬이 걸린 묶음의 점(따로 찾는다)과 한도를 넘은 차례
    const late = ord ? (i: number): boolean => ord[i]! >= lim : null;
    const skip =
      movedSet && late ? (i: number) => late(i) || (ids[i] !== undefined && movedSet.has(ids[i]!)) : movedSet ? (i: number) => ids[i] !== undefined && movedSet.has(ids[i]!) : late;
    this.build();
    queryTree(this.all!, f, x, y, tolPx, null, out, skip);
    for (const id of movedPts) {
      const idx = this.byId.get(id)!;
      const M = matrixOf(id)!;
      const inv = idx.length < SUB_INDEX_MIN ? null : mat4Invert(M);
      if (!inv) {
        for (const i of idx) if (!late || !late(i)) out.push(i);
        continue;
      }
      let t = this.sub.get(id);
      if (!t) this.sub.set(id, (t = makeTree(this.xyz, idx)));
      queryTree(t, f, x, y, tolPx, inv, out, late);
    }
    out.sort((a, b) => a - b);
    return out;
  }
}
