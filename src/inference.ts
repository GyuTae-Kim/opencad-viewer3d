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
 * - 끌어온 축(0.16.0): 선택 normalizeTrack·TRACK_DWELL_MS만 여기 두고, 계산은 track.ts(점 목록·머무르기·축 붙잡기)
 */
import { type ViewFrame, projectToScreen, screenRay } from './camera';
import type { V3 } from './math';
import type { OpenSnapCandidate, SnapSegment } from './snap';

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
  /**
   * 0.16.0: 다른 점에서 끌어온 축 안내(기본 꺼짐 — true에 들지 않는다). 마우스·펜으로 점 붙잡기 위에 머문 점(2화소 안에서 dwellMs, 기본 500 ms)을
   * 최근 셋까지 기억하고, 그 점을 지나는 X·Y·Z 축과 첫 점 축 위에서 그 점과 나란한 자리에도 붙잡는다(opencad-viewer3d/track). true면 { dwellMs: 500 }
   */
  track?: boolean | MeasureTrackOptions | null;
}

/** 끌어온 축 안내 선택(0.16.0, MeasureInference.track) */
export interface MeasureTrackOptions {
  /** 점 붙잡기 위에서 이만큼(ms) 머물면 그 점을 기억한다(기본 TRACK_DWELL_MS 500, 0 이상) */
  dwellMs?: number;
}

/** 끌어온 축: 점 붙잡기 위에 머물러야 하는 시간 기본값(ms, 0.16.0) */
export const TRACK_DWELL_MS = 500;

/** 편 inference 선택(Viewer3d.measureSnap.inference): 0.9.0·0.10.0 다섯 값, 0.16.0 끌어온 축은 켰을 때만 track이 있다 */
export interface NormalizedInference {
  intersections: boolean;
  perpendicular: boolean;
  axes: boolean;
  parallel: boolean;
  lock: boolean;
  track?: { dwellMs: number };
}

/** 끌어온 축 선택을 편다(0.16.0): 꺼짐(없음·false·null)이면 null, true·객체면 { dwellMs }(수가 아니거나 음수면 기본값) */
export function normalizeTrack(o: boolean | MeasureTrackOptions | null | undefined): { dwellMs: number } | null {
  if (!o) return null;
  const ms = o === true ? undefined : o.dwellMs;
  return { dwellMs: typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? ms : TRACK_DWELL_MS };
}

/**
 * inference 선택을 다섯 값으로 편다(아무것도 켜지 않았으면 null). true는 0.9.0의 셋(교차점·수직 발·축)만 — 0.10.0의 나란함·잠금은
 * 따로 켠다(true로 켜 둔 앱의 동작이 바뀌지 않게). 0.16.0: 끌어온 축(track)은 켰을 때만 track 열쇠가 붙는다(끄면 0.15.0과 같은 꼴)
 */
export function normalizeInference(o: MeasureInference | boolean | null | undefined): NormalizedInference | null {
  if (!o) return null;
  const r: NormalizedInference =
    o === true
      ? { intersections: true, perpendicular: true, axes: true, parallel: false, lock: false }
      : { intersections: !!o.intersections, perpendicular: !!o.perpendicular, axes: !!o.axes, parallel: !!o.parallel, lock: !!o.lock };
  const track = o === true ? null : normalizeTrack(o.track);
  if (track) r.track = track;
  return r.intersections || r.perpendicular || r.axes || r.parallel || r.lock || track ? r : null;
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

/** 세계 점 p의 화면 자리와 커서(x, y) 사이 화소 거리. 투영할 수 없거나 원근에서 가까운 면보다 앞(눈 뒤 포함)이면 null(0.16.0부터 track도 쓴다) */
export function screenDistance(f: ViewFrame, p: readonly number[], x: number, y: number): number | null {
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

/**
 * 추론 후보(세계 점·종류·묶음 id, 0.10.0부터 수직 발은 그 선분 — 잠글 때 기준 선분, 0.14.0부터 수직 발이 놓인 선분의 식별자 — 선분에 번호가 있을 때,
 * 0.15.0부터 교차점은 두 선분의 식별자 seg·other — 두 선분 모두 번호가 있을 때)
 */
export interface InferenceCandidate {
  p: V3;
  kind: 'intersection' | 'perpendicular';
  id: string;
  edge?: [V3, V3];
  seg?: SnapSegment;
  other?: SnapSegment;
}

/** 커서 둘레 선분의 식별자(번호가 없으면 null — 0.13.0 꼴 입력) */
function segOf(s: NearSegment): SnapSegment | null {
  return s.kind && s.raw !== undefined ? { kind: s.kind, id: s.id, index: s.index ?? s.raw, raw: s.raw, ends: [s.a, s.b] } : null;
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
        if (!p || (s.keep && !s.keep(p)) || (t.keep && !t.keep(p))) continue;
        const c: InferenceCandidate = { p, kind: 'intersection', id: s.id };
        const a = segOf(s), b = a && segOf(t);
        if (a && b) {
          c.seg = a;
          c.other = b;
        }
        out.push(c);
      }
  if (o.perpendicular && first)
    for (const s of segs) {
      const p = perpendicularFoot(first, s.a, s.b, 0.5 * s.wpp);
      if (!p || (s.keep && !s.keep(p))) continue;
      const c: InferenceCandidate = { p, kind: 'perpendicular', id: s.id, edge: [s.a, s.b] };
      const g = segOf(s);
      if (g) c.seg = g;
      out.push(c);
    }
  return out;
}

/**
 * 열린 수직 발(0.15.0): 점 p에서 선분 a–b로 내린 발이 선분 밖이거나 끝점(tol 안)이라 perpendicularFoot가 없을 때, 그 발을 선분 범위로 자른 점
 * (발 쪽 끝점의 복사본 — 꺾은선 꼭짓점이라 곡선 위 점이고, 곡선 위 발이 그쪽에 있다). 발이 선분 안쪽이면(perpendicularFoot가 있다),
 * 선분 길이가 0이거나 p가 그 직선 위(tol 안)면 null
 */
export function openFoot(p: readonly number[], a: readonly number[], b: readonly number[], tol: number): V3 | null {
  const ux = b[0]! - a[0]!, uy = b[1]! - a[1]!, uz = b[2]! - a[2]!;
  const l2 = ux * ux + uy * uy + uz * uz;
  if (!(l2 > 0)) return null;
  const t = ((p[0]! - a[0]!) * ux + (p[1]! - a[1]!) * uy + (p[2]! - a[2]!) * uz) / l2;
  if (!Number.isFinite(t)) return null;
  const f: V3 = [a[0]! + ux * t, a[1]! + uy * t, a[2]! + uz * t];
  if (d2(f, p) <= tol) return null;
  if (t > 0 && t < 1 && d2(f, a) > tol && d2(f, b) > tol) return null;
  const e = t < 0.5 ? a : b;
  return [e[0]!, e[1]!, e[2]!];
}

/**
 * 넓힌 교차(0.15.0): 두 선분 a0–a1, b0–b1이 허용치 tol로는 만나지 않지만(segmentIntersection이 null) 가장 가까운 두 점(선분 범위 안) 사이가
 * looseTol 안이면 그 두 점의 가운데. 나란하거나(사잇각 사인² < 1e-10) 길이가 0이거나, 그 가운데가 어느 끝점에서 tol 안이면(꼭짓점에서 만나는 선분 —
 * 끝점 붙잡기가 맡는다) null. 곡선을 나눈 꺾은선 둘은 곡선이 3D에서 만나도 현의 처짐만큼 비켜 지나가므로 앱이 다듬을 자리를 찾을 때 쓴다
 */
export function looseIntersection(a0: readonly number[], a1: readonly number[], b0: readonly number[], b1: readonly number[], tol: number, looseTol: number): V3 | null {
  if (!(looseTol > tol) || segmentIntersection(a0, a1, b0, b1, tol)) return null;
  const ux = a1[0]! - a0[0]!, uy = a1[1]! - a0[1]!, uz = a1[2]! - a0[2]!;
  const vx = b1[0]! - b0[0]!, vy = b1[1]! - b0[1]!, vz = b1[2]! - b0[2]!;
  const wx = a0[0]! - b0[0]!, wy = a0[1]! - b0[1]!, wz = a0[2]! - b0[2]!;
  const a = ux * ux + uy * uy + uz * uz, b = ux * vx + uy * vy + uz * vz, c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz, e = vx * wx + vy * wy + vz * wz;
  const den = a * c - b * b;
  if (!(a > 0) || !(c > 0) || den <= 1e-10 * a * c) return null;
  const clamp = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
  // 선분 범위 안에서 가장 가까운 두 점: 직선끼리의 답을 자르고, 한쪽이 잘리면 다른 쪽을 그 점에서 다시 구한다
  let s = clamp((b * e - c * d) / den);
  let t = (b * s + e) / c;
  if (t < 0 || t > 1) {
    t = clamp(t);
    s = clamp((t * b - d) / a);
  }
  const p: V3 = [a0[0]! + ux * s, a0[1]! + uy * s, a0[2]! + uz * s];
  const q: V3 = [b0[0]! + vx * t, b0[1]! + vy * t, b0[2]! + vz * t];
  if (!(d2(p, q) <= looseTol)) return null;
  const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  if (d2(m, a0) <= tol || d2(m, a1) <= tol || d2(m, b0) <= tol || d2(m, b1) <= tol) return null;
  return m;
}

/**
 * 넓힌 교차 허용치의 토막 길이 비(0.15.0): 한 토막이 45°보다 덜 도는 꺾은선이면 현과 곡선 사이(활꼴 높이 = 현 길이/2 × tan(돈 각/4))는
 * 현 길이의 0.1배 안이다 — 곡선 둘이 만나는 자리에서 두 꺾은선 사이 틈은 두 토막 길이 합의 이만큼 안
 */
export const OPEN_INTERSECTION_CHORD = 0.1;

/**
 * 열린 후보(0.15.0 — 다듬기 MeasureSnapOptions.refine이 있을 때만, 앱이 다듬어야 후보가 된다): 커서 둘레 선분(segmentsNear 차례 — 커서에 가까운 것부터)에서
 * - 넓힌 교차점(o.intersections): 허용치(화소 반)로는 만나지 않지만 가장 가까운 두 점 사이가 min(OPEN_INTERSECTION_CHORD × 두 토막 길이 합,
 *   커서 쪽 깊이에서 붙잡기 거리 snapPx의 세계 길이) 안인 두 선분(looseIntersection)
 * - 열린 수직 발(o.perpendicular, first): 첫 점에서 내린 발이 토막 밖·끝점이라 보통 수직 발이 없는 선분(openFoot)
 * 두 선분 모두 번호(kind·raw)가 있어야 한다(앱에 넘길 식별자). 차례는 더 먼 쪽 선분의 차례(교차점은 두 선분 가운데 늦은 것)로, 같으면 교차점 먼저 —
 * 커서에 가까운 선분의 후보가 앱 호출 한도를 먼저 쓴다
 */
export function openCandidates(
  segs: readonly NearSegment[],
  first: readonly number[] | null,
  o: Pick<Required<MeasureInference>, 'intersections' | 'perpendicular'>,
  snapPx: number,
): OpenSnapCandidate[] {
  const out: OpenSnapCandidate[] = [];
  const ids = segs.map(segOf);
  const len = (s: NearSegment): number => d2(s.a, s.b);
  for (let j = 0; j < segs.length; j++) {
    const t = segs[j]!, tg = ids[j];
    if (!tg) continue;
    if (o.intersections)
      for (let i = 0; i < j; i++) {
        const s = segs[i]!, sg = ids[i];
        if (!sg) continue;
        const wpp = Math.max(s.wpp, t.wpp);
        const tol = 0.5 * wpp;
        const m = looseIntersection(s.a, s.b, t.a, t.b, tol, Math.min(OPEN_INTERSECTION_CHORD * (len(s) + len(t)), snapPx * wpp));
        if (!m) continue;
        const c: OpenSnapCandidate = { kind: 'intersection', p: m, id: s.id, seg: sg, other: tg, tol };
        if (s.keep || t.keep) c.keep = (q) => (!s.keep || s.keep(q)) && (!t.keep || t.keep(q));
        out.push(c);
      }
    if (o.perpendicular && first) {
      const tol = 0.5 * t.wpp;
      const p = openFoot(first, t.a, t.b, tol);
      if (!p) continue;
      const c: OpenSnapCandidate = { kind: 'perpendicular', p, id: t.id, seg: tg, edge: [t.a, t.b], tol };
      if (t.keep) c.keep = t.keep;
      out.push(c);
    }
  }
  return out;
}
