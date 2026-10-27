/**
 * 측정 점 붙잡기 고르기(0.8.0, 순수 함수 — DOM·WebGL 없음). Viewer3d.setMeasureSnap이 쓴다.
 *
 * 고르기(pickScene)가 붙잡은 점(꼭짓점·끝점·가운데 점)과 앱 붙잡기 점(원 중심 등) 가운데 커서에서 붙잡기 거리 안이고
 * 화면에 가장 가까운 보이는 것을 고른다. 거리가 같으면 앞의 것(고르기가 붙잡은 점 → 앱 점 차례)을 지킨다.
 * 보이는지(단면·가림) 따지기는 비싸므로 지금 고른 것보다 가까운 후보에만 묻는다.
 */
import type { Pick3d, SnapKind } from './types';
import { type ViewFrame, projectToScreen } from './camera';
import type { SnapAxis } from './inference';
import type { V3 } from './math';
import type { MeasureResult } from './viewer';

/** 측정 점 고르기 결과: 찍을 점, 붙잡았는지, 붙잡은 종류(붙잡지 않았으면 null), 0.10.0부터 그 후보의 선분(수직 발 — 있을 때만) */
export interface MeasureSnapPick {
  p: V3;
  vertex: boolean;
  kind: SnapKind | null;
  edge?: [V3, V3];
}

/** 앱 붙잡기 후보(세계 점·종류·묶음 id, 0.10.0부터 추론 후보의 선분) */
export interface SnapCandidate {
  p: V3;
  kind: SnapKind;
  id?: string;
  edge?: [V3, V3];
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
  let best: { p: V3; kind: SnapKind; dist: number; edge?: [V3, V3] | undefined } | null = null;
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
    best = { p: c.p, kind: c.kind, dist, edge: c.edge };
  }
  if (best) return best.edge ? { p: best.p, vertex: true, kind: best.kind, edge: best.edge } : { p: best.p, vertex: true, kind: best.kind };
  return base ? { p: base.p, vertex: false, kind: null } : null;
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
