/**
 * 측정 점 붙잡기 고르기(0.8.0, 순수 함수 — DOM·WebGL 없음). Viewer3d.setMeasureSnap이 쓴다.
 *
 * 고르기(pickScene)가 붙잡은 점(꼭짓점·끝점·가운데 점)과 앱 붙잡기 점(원 중심 등) 가운데 커서에서 붙잡기 거리 안이고
 * 화면에 가장 가까운 보이는 것을 고른다. 거리가 같으면 앞의 것(고르기가 붙잡은 점 → 앱 점 차례)을 지킨다.
 * 보이는지(단면·가림) 따지기는 비싸므로 지금 고른 것보다 가까운 후보에만 묻는다.
 *
 * 0.14.0 다듬기(MeasureSnapOptions.refine): 코어가 고른 수직 발·선분 가운데 점·붙잡지 않은 선분 위 점은 화면용 꺾은선 토막 위의 점이다.
 * 앱이 정확한 형상(B-rep 곡선 등) 위로 옮길 수 있게 무엇을 넘길지(refineTarget), 돌려받은 점을 받을지(acceptRefined)를 여기서 정한다.
 */
import type { Pick3d, SnapKind } from './types';
import { type ViewFrame, projectToScreen } from './camera';
import type { SnapAxis } from './inference';
import type { V3 } from './math';
import type { MeasureResult } from './viewer';

/**
 * 측정 점 고르기 결과: 찍을 점, 붙잡았는지, 붙잡은 종류(붙잡지 않았으면 null), 0.10.0부터 그 후보의 선분(수직 발 — 있을 때만),
 * 0.14.0부터 그 후보가 놓인 선분의 식별자(코어 수직 발 — 있을 때만)
 */
export interface MeasureSnapPick {
  p: V3;
  vertex: boolean;
  kind: SnapKind | null;
  edge?: [V3, V3];
  seg?: SnapSegment;
}

/** 앱 붙잡기 후보(세계 점·종류·묶음 id, 0.10.0부터 추론 후보의 선분, 0.14.0부터 코어 수직 발이 놓인 선분의 식별자) */
export interface SnapCandidate {
  p: V3;
  kind: SnapKind;
  id?: string;
  edge?: [V3, V3];
  seg?: SnapSegment;
}

/**
 * 다듬을 점이 놓인 선분(0.14.0 — MeasureSnapOptions.refine에 넘긴다). 식별자는 고르기 결과(Pick3d)와 같은 뜻이라
 * 앱이 pointsFor에서 쓰던 찾기(그물 id와 윤곽선 선분 번호 → 앱의 모서리 표)를 그대로 쓴다
 */
export interface SnapSegment {
  /** 'line' = 선분 묶음(LineSet3d), 'edge' = 그물 윤곽선(Mesh3d.edges) — Pick3d.kind와 같다 */
  kind: 'line' | 'edge';
  /** 선분 묶음 id, 윤곽선이면 그 그물 id(Pick3d.id) */
  id: string;
  /** 원본 식별 번호: 선분 묶음은 segmentIds를 거친 값, 윤곽선은 Mesh3d.edges의 선분 번호(Pick3d.index) */
  index: number;
  /** 배열 안 선분 번호(Pick3d.raw): 선분 묶음 positions·윤곽선 edges에서 이 선분은 raw × 6부터 여섯 값 */
  raw: number;
  /** 세계 끝점 둘(묶음 origin·행렬을 거친 값, 단면으로 자르기 전 — 복사본) */
  ends: [V3, V3];
}

/**
 * 다듬을 점의 종류(0.14.0): 'perpendicular' = 첫 점에서 커서 둘레 선분으로 내린 수직 발(추론 붙잡기),
 * 'midpoint' = 코어가 붙잡은 선분 가운데 점(midpoints — 앱 점 pointsFor의 가운데 점은 아니다), 'onEdge' = 붙잡지 않은 선분·윤곽선 위 점
 */
export type SnapRefineKind = 'perpendicular' | 'midpoint' | 'onEdge';

/** 다듬기 손잡이(MeasureSnapOptions.refine)가 받는 것(0.14.0 — 모두 복사본, 세계 좌표) */
export interface SnapRefineInput {
  kind: SnapRefineKind;
  /** 코어가 고른 점(꺾은선 토막 위) */
  point: V3;
  /** 그 점이 놓인 선분 */
  segment: SnapSegment;
  /** 첫 측정 점(찍었으면 — 수직 발의 기준점), 없으면 null */
  first: V3 | null;
  /** 커서 광선(원점은 가까운 면 위, 방향은 단위) — 선분 위 점을 곡선에서 광선에 가장 가까운 점으로 다듬을 때 */
  ray: { origin: V3; dir: V3 };
}

/**
 * base = 고르기 결과(붙잡은 점이면 kind가 있다, 아무것도 고르지 않았으면 null), cands = 앱 붙잡기 후보,
 * visible(p, 화면 x, y, id) = 그 점이 보이는지(단면에 잘리지 않고 가리지 않음).
 * 원근에서 가까운 면(near)보다 앞의 점(눈 뒤 포함)은 뺀다
 */
export function chooseMeasureSnap(
  f: ViewFrame,
  x: number,
  y: number,
  snapPx: number,
  base: { p: V3; kind: SnapKind | null } | null,
  cands: Iterable<SnapCandidate>,
  visible: (p: V3, sx: number, sy: number, id: string | undefined) => boolean,
): MeasureSnapPick | null {
  let best: { p: V3; kind: SnapKind; dist: number; edge?: [V3, V3] | undefined; seg?: SnapSegment | undefined } | null = null;
  if (base && base.kind) {
    const s = projectToScreen(f, base.p);
    best = { p: base.p, kind: base.kind, dist: s ? Math.hypot(s[0] - x, s[1] - y) : 0 };
  }
  for (const c of cands) {
    const s = projectToScreen(f, c.p);
    if (!s || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) continue;
    const dist = Math.hypot(s[0] - x, s[1] - y);
    if (dist > snapPx || (best && dist >= best.dist)) continue;
    if (f.projection === 'perspective' && s[2] < f.near * 0.999) continue;
    if (!visible(c.p, s[0], s[1], c.id)) continue;
    best = { p: c.p, kind: c.kind, dist, edge: c.edge, seg: c.seg };
  }
  if (best) {
    const r: MeasureSnapPick = { p: best.p, vertex: true, kind: best.kind };
    if (best.edge) r.edge = best.edge;
    if (best.seg) r.seg = best.seg;
    return r;
  }
  return base ? { p: base.p, vertex: false, kind: null } : null;
}

/**
 * 다듬을 후보(0.14.0): 고른 점 r이 코어 수직 발(선분 식별자가 실린 후보), 고르기가 붙잡은 선분 가운데 점, 붙잡지 않은 선분·윤곽선 위 점이면
 * 그 종류와 선분(복사본), 아니면 null. base = 고르기 결과(붙잡은 점 snap·종류·고른 것·고른 선분의 세계 끝점).
 * 끝점·꼭짓점(꺾은선 꼭짓점은 곡선 위다), 앱 점(points·pointsFor — 앱이 이미 정확히 준다), 교차점(두 선분), 축·나란함(첫 점을 지나는 선)은 넘기지 않는다
 */
export function refineTarget(
  r: MeasureSnapPick | null,
  base: { snap: V3; snapKind: SnapKind | null; pick: Pick3d; ends?: [V3, V3] | undefined } | null,
): { kind: SnapRefineKind; segment: SnapSegment } | null {
  if (!r) return null;
  if (r.kind === 'perpendicular') return r.seg ? { kind: 'perpendicular', segment: copySegment(r.seg) } : null;
  // 고르기가 고른 점 그대로일 때만(앱 점이 이기면 다른 객체다)
  if (!base || r.p !== base.snap || !base.ends) return null;
  const pk = base.pick;
  if (pk.kind !== 'line' && pk.kind !== 'edge') return null;
  const kind: SnapRefineKind | null = r.kind === null ? 'onEdge' : r.kind === 'midpoint' && base.snapKind === 'midpoint' ? 'midpoint' : null;
  if (!kind) return null;
  return { kind, segment: copySegment({ kind: pk.kind, id: pk.id, index: pk.index, raw: pk.raw ?? pk.index, ends: base.ends }) };
}

function copySegment(s: SnapSegment): SnapSegment {
  return { kind: s.kind, id: s.id, index: s.index, raw: s.raw, ends: [[s.ends[0][0], s.ends[0][1], s.ends[0][2]], [s.ends[1][0], s.ends[1][1], s.ends[1][2]]] };
}

/** 앱이 돌려준 값이 수 셋이 모두 유한한 점이면 그 복사본(0.14.0 — 배열·Float64Array 등), 아니면 null */
export function finitePoint(q: unknown): V3 | null {
  if (!q || typeof q !== 'object') return null;
  const a = q as ArrayLike<unknown>;
  const x = a[0], y = a[1], z = a[2];
  return typeof x === 'number' && typeof y === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

/**
 * 앱이 다듬은 점 q를 받을지(0.14.0 안전장치): 화면에 투영되고(원근에서 가까운 면보다 앞·눈 뒤가 아님) 코어 점 core와 화면 거리가 maxPx(붙잡기 거리) 안이면 true.
 * 앱이 다른 모서리·곡선의 먼 점을 돌려주면 버리고 코어 점을 쓴다(미리 본 표식이 커서에서 튀지 않게)
 */
export function acceptRefined(f: ViewFrame, core: readonly number[], q: readonly number[], maxPx: number): boolean {
  const s = projectToScreen(f, q), c = projectToScreen(f, core);
  if (!s || !c || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) return false;
  if (f.projection === 'perspective' && s[2] < f.near * 0.999) return false;
  return Math.hypot(s[0] - c[0], s[1] - c[1]) <= maxPx;
}

const same3 = (a: readonly number[] | null, b: readonly number[] | null): boolean => (!a || !b ? a === b : a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

/**
 * 같은 다듬기 입력인지(0.14.0 — 같은 자리에서 미리 본 뒤 누르기, 한도가 바뀌어 다시 구하기): 종류·코어 점·선분(종류·id·번호·끝점)·첫 점·커서 광선이 모두 같으면 true.
 * 같으면 뷰어는 앱 함수를 다시 부르지 않고 앞 결과를 쓴다(미리 본 점이 그대로 찍힌다)
 */
export function sameRefineInput(a: SnapRefineInput, b: SnapRefineInput): boolean {
  const s = a.segment, t = b.segment;
  return (
    a.kind === b.kind &&
    same3(a.point, b.point) &&
    s.kind === t.kind &&
    s.id === t.id &&
    s.index === t.index &&
    s.raw === t.raw &&
    same3(s.ends[0], t.ends[0]) &&
    same3(s.ends[1], t.ends[1]) &&
    same3(a.first, b.first) &&
    same3(a.ray.origin, b.ray.origin) &&
    same3(a.ray.dir, b.ray.dir)
  );
}

/**
 * 붙잡기 한도 값 고르기(0.10.0, setMeasureSnapLimit·setMeasureSnap({ limit })): 수(NaN 아님, +Infinity 아님)면 그대로, 아니면 null(한도 없음).
 * −Infinity는 차례 값이 있는 점을 모두 뺀다
 */
export function snapLimit(n: unknown): number | null {
  return typeof n === 'number' && !Number.isNaN(n) && n !== Infinity ? n : null;
}

/** 차례 값 order인 점이 한도 limit 안인지(차례가 없거나 한도가 없으면 늘 안) */
export function withinSnapLimit(order: number | undefined, limit: number | null): boolean {
  return limit === null || typeof order !== 'number' || Number.isNaN(order) || order < limit;
}

/**
 * 같은 고르기인지(0.10.0 — pointsFor 결과를 다시 쓸 때): 종류·묶음 id·번호(index·raw)·고른 점·법선·잘린 면이 모두 같으면 true.
 * 커서가 움직이면 고른 점이 달라지므로, 앱 점이 고른 점에 따라 달라도(가장 가까운 요소 찾기 등) 다시 쓴 결과가 부른 결과와 같다
 */
export function samePick(a: Pick3d, b: Pick3d): boolean {
  if (a.kind !== b.kind || a.id !== b.id || a.index !== b.index || a.raw !== b.raw || !!a.section !== !!b.section) return false;
  const p = a.point, q = b.point;
  if (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]) return false;
  const n = a.normal, m = b.normal;
  if (!n || !m) return !n && !m;
  return n[0] === m[0] && n[1] === m[1] && n[2] === m[2];
}

/**
 * 찍은 측정 점의 붙잡기: 종류(붙잡지 않았으면 null)와 축 붙잡기('axis')면 그 축,
 * 0.10.0부터 방향 추론(축·나란함·수직)이면 첫 점을 지나는 그 선의 단위 방향과 잠갔는지
 */
export interface MeasurePointSnap {
  kind: SnapKind | null;
  axis?: SnapAxis;
  direction?: V3;
  locked?: boolean;
  /** 0.14.0: 앱이 다듬은 점(MeasureSnapOptions.refine)이면 true — 측정 결과에는 싣지 않는다(measurePoints·measureHoverSnap에만) */
  refined?: boolean;
}

/**
 * 두 점 측정 결과(Viewer3d.measurement·onMeasure). snaps를 주면(붙잡기 선택을 켰을 때 — 찍은 점마다, 모르는 점은 undefined) snapA·snapB를 싣고,
 * 0.9.1부터 축 붙잡기('axis')인 점은 그 축을 axisA·axisB로 싣는다(다른 종류면 그 필드가 없다). snaps가 없으면 0.7.2 꼴(a·b·거리·dx dy dz).
 * 0.10.0: 방향 추론으로 찍은 점은 directionA·directionB(단위 방향 — 복사본), 잠금(Shift·setMeasureInferenceLock)으로 찍은 점은 lockedA·lockedB = true
 */
export function measureResult(a: V3, b: V3, snaps?: readonly [MeasurePointSnap | undefined, MeasurePointSnap | undefined] | null): MeasureResult {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const r: MeasureResult = { a, b, distance: Math.hypot(dx, dy, dz), dx, dy, dz };
  if (snaps) {
    const [sa, sb] = snaps;
    r.snapA = sa?.kind ?? null;
    r.snapB = sb?.kind ?? null;
    if (sa?.kind === 'axis' && sa.axis) r.axisA = sa.axis;
    if (sb?.kind === 'axis' && sb.axis) r.axisB = sb.axis;
    if (sa?.direction) r.directionA = [...sa.direction] as V3;
    if (sb?.direction) r.directionB = [...sb.direction] as V3;
    if (sa?.locked) r.lockedA = true;
    if (sb?.locked) r.lockedB = true;
  }
  return r;
}
