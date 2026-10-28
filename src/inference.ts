/**
 * 측정 추론 붙잡기(0.9.0, 순수 함수 — DOM·WebGL 없음). Viewer3d.setMeasureSnap({ inference })가 쓴다.
 *
 * - 교차점: 커서 둘레 두 선분(선분 묶음·그물 윤곽선)이 3D에서 만나는 점. 두 선분의 가장 가까운 두 점 사이가 허용치(화면 반 화소쯤) 안이고
 *   두 선분 모두 안쪽(끝점에서 허용치보다 먼 곳 — 끝점은 끝점 붙잡기가 맡는다)일 때만. 나란한 선분은 없다
 * - 수직 발: 첫 측정 점에서 커서 둘레 선분으로 내린 수직선의 발(선분 안쪽, 끝점·첫 점에서 허용치보다 먼 곳)
 * - 축: 첫 측정 점을 지나는 X·Y·Z 축 방향 선 가운데 커서 광선에 가장 가까운 점(화면 붙잡기 거리 안). 점 붙잡기가 하나도 없을 때만 쓴다
 * - 나란함(0.10.0): 첫 측정 점을 지나고 커서가 앞서 지나간 선분(모서리)과 나란한 선 위의 점. 축과 같이 점 붙잡기가 없을 때만
 * - 잠금(0.10.0): 방향 추론(축·나란함·수직)을 잠그면 첫 점을 지나는 그 선 위에만 찍는다. 커서가 꼭짓점 같은 점 붙잡기 위면
 *   그 점을 선에 수직으로 내린 자리(SketchUp의 추론 잠금처럼 — 다른 점의 높이·자리를 잠근 방향으로 옮겨 잰다)
 * - 선분 방향 잠금(0.12.0): 점 붙잡기(끝점·가운데 점·교차점 등)가 놓인 선분 직선이 첫 점을 지나면 그 방향으로도 잠근다(edgeLineLock).
 *   앱이 정한 방향 잠금(directionLock)
 */
import { type ViewFrame, projectToScreen, screenRay } from './camera';
import type { V3 } from './math';
import type { SnapSegment } from './snap';

/** 축 이름(축 붙잡기 — MeasureHoverSnap.axis, 찍은 결과는 0.9.1부터 MeasureResult.axisB) */
export type SnapAxis = 'x' | 'y' | 'z';

/** 측정 추론 붙잡기 선택(Viewer3d.setMeasureSnap({ inference })) */
export interface MeasureInference {
  /** 커서 둘레 두 선분(선분 묶음·그물 윤곽선)의 3D 교차점 */
  intersections?: boolean;
  /** 첫 측정 점에서 커서 둘레 선분으로 내린 수직 발 */
  perpendicular?: boolean;
  /** 첫 측정 점에서 X·Y·Z 축 방향(축 색 안내선) */
  axes?: boolean;
  /** 0.10.0: 첫 측정 점에서 커서가 앞서 지나간 선분(선분 묶음·측정 중 고르는 윤곽선)과 나란한 방향(자홍 안내선) */
  parallel?: boolean;
  /**
   * 0.10.0: Shift를 누르고 있는 동안 지금 방향 추론(축·나란함·수직)을 잠근다 — 커서가 선에서 멀어져도 그 선 위에 찍는다.
   * 터치처럼 Shift가 없으면 앱이 Viewer3d.setMeasureInferenceLock으로 잠근다(이 선택과 상관없이 된다)
   */
  lock?: boolean;
}

/**
 * inference 선택을 다섯 값으로 편다(아무것도 켜지 않았으면 null). true는 0.9.0의 셋(교차점·수직 발·축)만 — 0.10.0의 나란함·잠금은
 * 따로 켠다(true로 켜 둔 앱의 동작이 바뀌지 않게)
 */
export function normalizeInference(o: MeasureInference | boolean | null | undefined): Required<MeasureInference> | null {
  if (!o) return null;
  const r =
    o === true
      ? { intersections: true, perpendicular: true, axes: true, parallel: false, lock: false }
      : { intersections: !!o.intersections, perpendicular: !!o.perpendicular, axes: !!o.axes, parallel: !!o.parallel, lock: !!o.lock };
  return r.intersections || r.perpendicular || r.axes || r.parallel || r.lock ? r : null;
}

const d2 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * 두 3D 선분 a0–a1, b0–b1의 교차점: 가장 가까운 두 점의 가운데. 두 점 사이가 tol보다 멀거나, 선분이 나란하거나,
 * 교차가 어느 한 선분의 끝점(tol 안)이거나 선분 밖이면 null
 */
export function segmentIntersection(a0: readonly number[], a1: readonly number[], b0: readonly number[], b1: readonly number[], tol: number): V3 | null {
  const ux = a1[0]! - a0[0]!, uy = a1[1]! - a0[1]!, uz = a1[2]! - a0[2]!;
  const vx = b1[0]! - b0[0]!, vy = b1[1]! - b0[1]!, vz = b1[2]! - b0[2]!;
  const wx = a0[0]! - b0[0]!, wy = a0[1]! - b0[1]!, wz = a0[2]! - b0[2]!;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const den = a * c - b * b;
  // 나란함(사잇각 사인² < 1e-10)·길이 0
  if (!(a > 0) || !(c > 0) || den <= 1e-10 * a * c) return null;
  const s = (b * e - c * d) / den, t = (a * e - b * d) / den;
  if (s < 0 || s > 1 || t < 0 || t > 1) return null;
  const p: V3 = [a0[0]! + ux * s, a0[1]! + uy * s, a0[2]! + uz * s];
  const q: V3 = [b0[0]! + vx * t, b0[1]! + vy * t, b0[2]! + vz * t];
  if (!(d2(p, q) <= tol)) return null;
  const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  if (d2(m, a0) <= tol || d2(m, a1) <= tol || d2(m, b0) <= tol || d2(m, b1) <= tol) return null;
  return m;
}

/** 점 p에서 선분 a–b로 내린 수직 발. 발이 선분 밖이거나 끝점(tol 안)이거나 p가 선 위(tol 안)면 null */
export function perpendicularFoot(p: readonly number[], a: readonly number[], b: readonly number[], tol: number): V3 | null {
  const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!;
  const l2 = ux * ux + uy * uy + uz * uz;
  if (!(l2 > 0)) return null;
  const t = ((p[0]! - a[0]!) * ux + (p[1]! - a[1]!) * uy + (p[2]! - a[2]!) * uz) / l2;
  if (t < 0 || t > 1) return null;
  const f: V3 = [a[0]! + ux * t, a[1]! + uy * t, a[2]! + uz * t];
  if (d2(f, a) <= tol || d2(f, b) <= tol || d2(f, p) <= tol) return null;
  return f;
}

const AXES: readonly [SnapAxis, V3][] = [
  ['x', [1, 0, 0]],
  ['y', [0, 1, 0]],
  ['z', [0, 0, 1]],
];

/**
 * 첫 점 a를 지나는 축 방향 선 셋에서 커서(x, y) 광선에 가장 가까운 점(화면 snapPx 안에서 가장 가까운 축, 같으면 X → Y → Z).
 * 커서가 a의 화면 자리에서 snapPx 안이면(세 축이 모두 지나는 곳) 없다. 축이 커서 광선과 거의 나란하면 그 축은 뺀다.
 * 원근에서 가까운 면보다 앞(눈 뒤 포함)인 점은 뺀다
 */
export function axisSnap(f: ViewFrame, a: readonly number[], x: number, y: number, snapPx: number): { p: V3; axis: SnapAxis; distPx: number } | null {
  const sa = projectToScreen(f, a);
  if (sa && Math.hypot(sa[0] - x, sa[1] - y) <= snapPx) return null;
  const ray = screenRay(f, x, y);
  let best: { p: V3; axis: SnapAxis; distPx: number } | null = null;
  for (const [axis, e] of AXES) {
    const p = rayLinePoint(ray.origin, ray.dir, a, e);
    if (!p) continue;
    const dist = screenDistance(f, p, x, y);
    if (dist !== null && dist <= snapPx && (!best || dist < best.distPx)) best = { p, axis, distPx: dist };
  }
  return best;
}

/**
 * 선 a + t·e(e는 단위 방향)에서 광선 o + s·d(d는 단위 방향)에 가장 가까운 점. 선이 광선과 거의 나란하면(사잇각 사인² < 1e-6) null.
 * 0.9.0 축 붙잡기의 식 그대로(축·나란함·잠금이 함께 쓴다)
 */
export function rayLinePoint(o: readonly number[], d: readonly number[], a: readonly number[], e: readonly number[]): V3 | null {
  const w0x = a[0]! - o[0]!, w0y = a[1]! - o[1]!, w0z = a[2]! - o[2]!;
  const ee = d[0]! * w0x + d[1]! * w0y + d[2]! * w0z;
  const b = e[0]! * d[0]! + e[1]! * d[1]! + e[2]! * d[2]!;
  const den = 1 - b * b;
  if (den < 1e-6) return null;
  const dd = e[0]! * w0x + e[1]! * w0y + e[2]! * w0z;
  const t = (b * ee - dd) / den;
  return [a[0]! + e[0]! * t, a[1]! + e[1]! * t, a[2]! + e[2]! * t];
}

/** 세계 점 p의 화면 자리와 커서(x, y) 사이 화소 거리. 투영할 수 없거나 원근에서 가까운 면보다 앞(눈 뒤 포함)이면 null */
function screenDistance(f: ViewFrame, p: readonly number[], x: number, y: number): number | null {
  const s = projectToScreen(f, p);
  if (!s || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) return null;
  if (f.projection === 'perspective' && s[2] < f.near * 0.999) return null;
  return Math.hypot(s[0] - x, s[1] - y);
}

/** 단위 벡터(길이가 0이거나 수가 아니면 null) */
export function unitDir(a: readonly number[], b: readonly number[]): V3 | null {
  const x = b[0]! - a[0]!, y = b[1]! - a[1]!, z = b[2]! - a[2]!;
  const l = Math.hypot(x, y, z);
  return l > 0 && Number.isFinite(l) ? [x / l, y / l, z / l] : null;
}

/** 방향 e가 X·Y·Z 축 가운데 하나와 나란한지(사잇각 약 0.08° 안 — 그 선은 축 붙잡기가 맡는다) */
export function axisAligned(e: readonly number[]): boolean {
  return Math.max(Math.abs(e[0]!), Math.abs(e[1]!), Math.abs(e[2]!)) >= 1 - 1e-6;
}

/**
 * 나란함(0.10.0): 첫 점 a를 지나고 기준 선분 ref(세계 끝점 둘 — 커서가 앞서 지나간 모서리)와 나란한 선 위에서 커서 광선에 가장 가까운 점.
 * 화면 snapPx 안일 때만. 커서가 a의 화면 자리 snapPx 안이거나 기준 선분 길이가 0이면 없다. skipAxes면 기준 선분이 축과 나란할 때 뺀다
 * (축 붙잡기와 같은 선). direction은 기준 선분의 첫 끝점 → 둘째 끝점 쪽 단위 방향
 */
export function parallelSnap(
  f: ViewFrame,
  a: readonly number[],
  ref: readonly [readonly number[], readonly number[]],
  x: number,
  y: number,
  snapPx: number,
  skipAxes: boolean,
): { p: V3; direction: V3; distPx: number } | null {
  const e = unitDir(ref[0], ref[1]);
  if (!e || (skipAxes && axisAligned(e))) return null;
  const sa = projectToScreen(f, a);
  if (sa && Math.hypot(sa[0] - x, sa[1] - y) <= snapPx) return null;
  const ray = screenRay(f, x, y);
  const p = rayLinePoint(ray.origin, ray.dir, a, e);
  if (!p) return null;
  const dist = screenDistance(f, p, x, y);
  return dist !== null && dist <= snapPx ? { p, direction: e, distPx: dist } : null;
}

/** 방향 추론 종류(첫 점을 지나는 선): 축·나란함·수직(첫 점 → 수직 발) */
export type InferenceLockKind = 'axis' | 'parallel' | 'perpendicular';

/** 추론 잠금(0.10.0, Viewer3d.measureInferenceLock): 첫 측정 점을 지나는 선의 종류·단위 방향과 축·기준 선분 */
export interface InferenceLock {
  kind: InferenceLockKind;
  /** 단위 방향(축은 +X·+Y·+Z, 나란함은 기준 선분 방향, 수직은 첫 점 → 수직 발) */
  direction: V3;
  /** 축 잠금이면 그 축 */
  axis?: SnapAxis;
  /** 나란함·수직의 기준 선분(세계 끝점 둘) */
  edge?: [V3, V3];
}

/** 축 잠금(setMeasureInferenceLock('x' | 'y' | 'z')) */
export function axisLock(axis: SnapAxis): InferenceLock {
  return { kind: 'axis', axis, direction: axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1] };
}

/** 지금 미리 보기(붙잡은 종류·축·방향·기준 선분)에서 잠글 방향 추론. 방향 추론이 아니면 null */
export function lockFromSnap(h: { kind: string | null; axis?: SnapAxis; direction?: V3; edge?: [V3, V3] } | null | undefined): InferenceLock | null {
  if (!h || !h.direction) return null;
  if (h.kind === 'axis') return h.axis ? axisLock(h.axis) : null;
  if (h.kind === 'parallel' || h.kind === 'perpendicular') return { kind: h.kind, direction: [...h.direction] as V3, ...(h.edge ? { edge: h.edge } : {}) };
  return null;
}

/** 방향 e와 나란한 축(axisAligned일 때만 — 가장 큰 성분의 축) */
function alignedAxis(e: readonly number[]): SnapAxis | null {
  if (!axisAligned(e)) return null;
  const ax = Math.abs(e[0]!), ay = Math.abs(e[1]!), az = Math.abs(e[2]!);
  return ax >= ay && ax >= az ? 'x' : ay >= az ? 'y' : 'z';
}

/** 점 q에서 e0를 지나는 단위 방향 u의 직선까지 거리 */
function lineDistance(q: readonly number[], e0: readonly number[], u: readonly number[]): number {
  const wx = q[0]! - e0[0]!, wy = q[1]! - e0[1]!, wz = q[2]! - e0[2]!;
  const t = wx * u[0]! + wy * u[1]! + wz * u[2]!;
  return Math.hypot(wx - u[0]! * t, wy - u[1]! * t, wz - u[2]! * t);
}

/**
 * 선분 방향 잠금(0.12.0): 붙잡은 점 p가 놓인 선분들(세계 끝점 둘) 가운데 그 직선이 첫 점 a를 지나는 첫 선분의 방향.
 * 모서리 끝(a)에서 그 모서리를 따라 다른 끝·가운데 점·교차점을 가리키면 점 붙잡기가 방향 추론(축·나란함)보다 먼저라 잠글 방향이 없었다 —
 * 그 직선이 a를 지나면 이 방향으로 잠근 선은 그 모서리 직선 그대로다(같은 직선 위 떨어진 선분도 된다).
 * 축과 나란하면(axisAligned) 그 축(axisLock), 아니면 그 선분과 나란히(kind 'parallel', direction = 첫 끝점 → 둘째 끝점, edge = 그 선분).
 * p가 a 자리(tolA 안 — 여러 모서리가 만나는 꼭짓점이면 어느 모서리인지 모른다)거나, a를 지나면서 p가 놓인 선분이 없으면 null.
 * tolA = a에서 직선까지, tolP = p에서 직선까지 허용치(세계 길이 — 뷰어는 그 점 깊이에서 화면 반 화소)
 */
export function edgeLineLock(
  a: readonly number[],
  p: readonly number[],
  lines: Iterable<readonly [readonly number[], readonly number[]]>,
  tolA: number,
  tolP: number = tolA,
): InferenceLock | null {
  if (!(d2(p, a) > tolA)) return null;
  for (const [e0, e1] of lines) {
    const u = unitDir(e0, e1);
    if (!u || !(lineDistance(a, e0, u) <= tolA) || !(lineDistance(p, e0, u) <= tolP)) continue;
    const axis = alignedAxis(u);
    return axis ? axisLock(axis) : { kind: 'parallel', direction: u, edge: [[e0[0]!, e0[1]!, e0[2]!], [e1[0]!, e1[1]!, e1[2]!]] };
  }
  return null;
}

/** 앱이 정한 방향 잠금(0.12.0, Viewer3d.setMeasureInferenceLock({ direction, edge?, kind? })) */
export interface InferenceLockInput {
  /** 잠글 방향(세계 — 길이는 상관없다). 없으면 edge의 첫 끝점 → 둘째 끝점 방향 */
  direction?: readonly number[] | null;
  /** 기준 선분(세계 끝점 둘). 잠근 동안 그 선분을 자홍 점선으로 그린다(나란함 잠금과 같다) */
  edge?: readonly [readonly number[], readonly number[]] | null;
  /**
   * 종류(측정 결과·measureInferenceLock·안내선 색에 실린다): 'axis'(방향이 축과 나란해야 한다 — 축 색 안내선), 'parallel', 'perpendicular'(자홍 안내선).
   * 없으면 축과 나란한 방향은 'axis', 아니면 'parallel'
   */
  kind?: InferenceLockKind | null;
}

/** 수 셋이 모두 유한한 점인지 */
const finite3 = (q: unknown): q is readonly number[] => {
  const a = q as ArrayLike<unknown> | null | undefined;
  return !!a && typeof a === 'object' && Number.isFinite(a[0]) && Number.isFinite(a[1]) && Number.isFinite(a[2]);
};

/**
 * 앱이 정한 방향(InferenceLockInput)을 잠금으로(0.12.0). 방향(없으면 기준 선분 방향)이 길이 0이거나 수가 아니거나, 기준 선분을 주었는데 수가 아니거나,
 * 'axis'인데 축과 나란하지 않거나, 모르는 종류면 null. 축은 +X·+Y·+Z 방향으로 바꾸고(axisLock), 나란함·수직은 준 방향을 단위 길이로
 */
export function directionLock(o: InferenceLockInput | null | undefined): InferenceLock | null {
  if (!o || typeof o !== 'object') return null;
  let edge: [V3, V3] | undefined;
  if (o.edge != null) {
    const e = o.edge as ArrayLike<unknown>;
    const e0 = e[0], e1 = e[1];
    if (!finite3(e0) || !finite3(e1)) return null;
    edge = [[e0[0]!, e0[1]!, e0[2]!], [e1[0]!, e1[1]!, e1[2]!]];
  }
  const d = o.direction;
  const u = d != null ? (finite3(d) ? unitDir([0, 0, 0], d) : null) : edge ? unitDir(edge[0], edge[1]) : null;
  if (!u) return null;
  const kind = o.kind ?? (axisAligned(u) ? 'axis' : 'parallel');
  if (kind === 'axis') {
    const axis = alignedAxis(u);
    return axis ? { ...axisLock(axis), ...(edge ? { edge } : {}) } : null;
  }
  if (kind !== 'parallel' && kind !== 'perpendicular') return null;
  return { kind, direction: u, ...(edge ? { edge } : {}) };
}

/**
 * 잠근 선(첫 점 a를 지나는 단위 방향 e) 위에 찍을 점. q(커서 아래 붙잡은 점 — 꼭짓점·끝점·중심 등)가 있으면 그 점을 선에 수직으로 내린 자리
 * (from = q, q가 이미 선 위면 from 없음), 없으면 커서 광선에 가장 가까운 자리(화면 거리 제한 없음). 선이 광선과 나란하거나 그 자리가 눈 뒤면 null
 */
export function lockedSnap(f: ViewFrame, a: readonly number[], e: readonly number[], x: number, y: number, q: readonly number[] | null): { p: V3; from?: V3 } | null {
  if (q) {
    const t = (q[0]! - a[0]!) * e[0]! + (q[1]! - a[1]!) * e[1]! + (q[2]! - a[2]!) * e[2]!;
    const p: V3 = [a[0]! + e[0]! * t, a[1]! + e[1]! * t, a[2]! + e[2]! * t];
    const off = Math.hypot(q[0]! - p[0], q[1]! - p[1], q[2]! - p[2]);
    return off <= 1e-12 * (1 + Math.hypot(q[0]!, q[1]!, q[2]!)) ? { p } : { p, from: [q[0]!, q[1]!, q[2]!] };
  }
  const ray = screenRay(f, x, y);
  const p = rayLinePoint(ray.origin, ray.dir, a, e);
  return p && screenDistance(f, p, x, y) !== null ? { p } : null;
}

/** 커서 둘레 선분(세계 끝점, 묶음 id, 그 묶음의 남는 쪽 판정)과 커서 쪽 깊이에서 한 화소의 세계 길이 */
export interface NearSegment {
  a: V3;
  b: V3;
  id: string;
  /** 세계 점이 그 묶음의 단면 평면에서 남는 쪽인지(없으면 늘 남는다) */
  keep?: (p: readonly number[]) => boolean;
  /** 커서 쪽 점 깊이에서 한 화소의 세계 길이(교차·수직 발 허용치) */
  wpp: number;
  /**
   * 0.14.0: 선분 종류('line' = 선분 묶음, 'edge' = 그물 윤곽선)와 번호(index = 원본 식별 번호, raw = 배열 안 번호 — Pick3d와 같은 뜻).
   * 있으면 수직 발 후보에 선분 식별자(seg)를 실어 다듬기 손잡이(MeasureSnapOptions.refine)에 넘긴다
   */
  kind?: 'line' | 'edge';
  index?: number;
  raw?: number;
}

/** 추론 후보(세계 점·종류·묶음 id, 0.10.0부터 수직 발은 그 선분 — 잠글 때 기준 선분, 0.14.0부터 수직 발이 놓인 선분의 식별자 — 선분에 번호가 있을 때) */
export interface InferenceCandidate {
  p: V3;
  kind: 'intersection' | 'perpendicular';
  id: string;
  edge?: [V3, V3];
  seg?: SnapSegment;
}

/**
 * 커서 둘레 선분들에서 교차점·수직 발 후보(교차점 먼저, 선분 차례대로). first = 첫 측정 점(없으면 수직 발 없음).
 * 허용치는 두 선분 쪽 화소 길이의 반(교차)·화소 길이의 반(수직 발 끝점·첫 점 거리)
 */
export function inferenceCandidates(segs: readonly NearSegment[], first: readonly number[] | null, o: Pick<Required<MeasureInference>, 'intersections' | 'perpendicular'> & MeasureInference): InferenceCandidate[] {
  const out: InferenceCandidate[] = [];
  if (o.intersections)
    for (let i = 0; i < segs.length; i++)
      for (let j = i + 1; j < segs.length; j++) {
        const s = segs[i]!, t = segs[j]!;
        const p = segmentIntersection(s.a, s.b, t.a, t.b, 0.5 * Math.max(s.wpp, t.wpp));
        if (p && (!s.keep || s.keep(p)) && (!t.keep || t.keep(p))) out.push({ p, kind: 'intersection', id: s.id });
      }
  if (o.perpendicular && first)
    for (const s of segs) {
      const p = perpendicularFoot(first, s.a, s.b, 0.5 * s.wpp);
      if (!p || (s.keep && !s.keep(p))) continue;
      const c: InferenceCandidate = { p, kind: 'perpendicular', id: s.id, edge: [s.a, s.b] };
      if (s.kind && s.raw !== undefined) c.seg = { kind: s.kind, id: s.id, index: s.index ?? s.raw, raw: s.raw, ends: [s.a, s.b] };
      out.push(c);
    }
  return out;
}
