/**
 * 다른 점에서 끌어온 축 안내(0.16.0, 순수 — DOM·WebGL 없음). Viewer3d.setMeasureSnap({ inference: { track } })가 쓰고,
 * 코어 측정 모드를 쓰지 않는 앱(자체 줄자 등)도 같은 규칙으로 쓸 수 있게 나눠 둔다.
 *
 * - 머무르기: 마우스·펜이 점 붙잡기(꼭짓점·끝점·가운데 점·중심·앱 점·교차점·수직 발) 위에서 TRACK_DWELL_PX 안으로 dwellMs 동안 머물면
 *   그 점을 기억한다(최근 TRACK_MAX개, 새것이 앞). 시간은 부르는 쪽이 잰다(MeasureTracker는 상태만 — 뷰어는 setTimeout)
 * - 첫 점 축 위 나란한 자리(trackCrossSnap): 첫 점 A를 지나는 축 i 위에서 기억한 점 P와 그 축 방향 자리가 같은 점
 *   (P를 그 축에 수직으로 내린 자리 A + e·((P − A)·e)). A와 P가 다른 좌표 하나를 함께 쓰면 A의 축과 P의 다른 축이 3D로 만나는 점이다
 * - 끌어온 축(trackAxisSnap): 기억한 점 P를 지나는 X·Y·Z 축 위에서 커서 광선에 가장 가까운 점
 * 둘 다 화면 붙잡기 거리 안일 때만이고, 가까운 것이 이기며 같으면 새 점 → X·Y·Z 차례다.
 */
import { type ViewFrame, projectToScreen, screenRay } from './camera';
import { type SnapAxis, rayLinePoint, screenDistance, unitDir } from './inference';
import type { V3 } from './math';

export { TRACK_DWELL_MS, type MeasureTrackOptions, normalizeTrack } from './inference';

/** 머무르기: 머무는 동안 커서가 처음 자리에서 벗어나도 되는 거리(CSS 화소) */
export const TRACK_DWELL_PX = 2;
/** 기억하는 끌어온 점 수(새것이 앞, 넘으면 가장 오래된 것을 지운다) */
export const TRACK_MAX = 3;

const AXES: readonly [SnapAxis, V3][] = [
  ['x', [1, 0, 0]],
  ['y', [0, 1, 0]],
  ['z', [0, 0, 1]],
];

/** 축 방향 셋(앱의 그리기 축 — SketchUp 모형 축처럼 세계 축과 다를 때). 길이는 상관없다 */
export type TrackAxes = Readonly<Record<SnapAxis, readonly number[]>>;

/** 쓸 축(이름·단위 방향): 주지 않으면 세계 X·Y·Z, 주면 그 방향을 단위 길이로(길이 0·수가 아닌 축은 뺀다) */
function axesOf(axes: TrackAxes | null | undefined): readonly [SnapAxis, V3][] {
  if (!axes) return AXES;
  const out: [SnapAxis, V3][] = [];
  for (const [name] of AXES) {
    const u = axes[name] ? unitDir([0, 0, 0], axes[name]) : null;
    if (u) out.push([name, u]);
  }
  return out;
}

/** 같은 점으로 볼지(좌표 크기에 비례한 아주 작은 허용치 — 같은 꼭짓점을 다시 붙잡으면 같은 수다) */
export function sameTrackPoint(a: readonly number[], b: readonly number[]): boolean {
  const s = 1 + Math.max(Math.abs(a[0]!), Math.abs(a[1]!), Math.abs(a[2]!), Math.abs(b[0]!), Math.abs(b[1]!), Math.abs(b[2]!));
  return Math.abs(a[0]! - b[0]!) <= 1e-9 * s && Math.abs(a[1]! - b[1]!) <= 1e-9 * s && Math.abs(a[2]! - b[2]!) <= 1e-9 * s;
}

/** 끌어온 축 붙잡기 결과: 찍을 점, 그 선의 축, 끌어온 점(복사본), 커서와의 화면 거리, 첫 점 축 위면 그 단위 방향(잠글 때) */
export interface TrackSnap {
  p: V3;
  axis: SnapAxis;
  from: V3;
  distPx: number;
  /** trackCrossSnap(첫 점을 지나는 축 위)만 — 축 단위 방향(세계 축이면 +X·+Y·+Z). trackAxisSnap(끌어온 점을 지나는 축)은 없다 */
  direction?: V3;
}

/**
 * 첫 점 축 위에서 끌어온 점과 나란한 자리(0.16.0): 첫 점 a를 지나는 축 i마다, 기억한 점 P를 그 축에 수직으로 내린 자리 q = a + e·((P − a)·e)가
 * 커서에서 snapPx 안이면 후보(가까운 것, 같으면 앞 점 → X·Y·Z). 커서가 a의 화면 자리 snapPx 안이면(축 붙잡기와 같다) 없다.
 * q가 a 자리(P가 그 축 방향으로 a와 같은 자리)거나 P가 a 자체면 뺀다. 원근에서 가까운 면보다 앞이면 뺀다.
 * axes = 앱의 그리기 축(없으면 세계 X·Y·Z — 뷰어는 늘 세계 축)
 */
export function trackCrossSnap(
  f: ViewFrame,
  a: readonly number[],
  tracks: readonly (readonly number[])[],
  x: number,
  y: number,
  snapPx: number,
  axes?: TrackAxes | null,
): TrackSnap | null {
  if (!tracks.length) return null;
  const sa = projectToScreen(f, a);
  if (sa && Math.hypot(sa[0] - x, sa[1] - y) <= snapPx) return null;
  const dirs = axesOf(axes);
  let best: TrackSnap | null = null;
  for (const P of tracks) {
    if (sameTrackPoint(P, a)) continue;
    for (const [axis, e] of dirs) {
      const t = (P[0]! - a[0]!) * e[0] + (P[1]! - a[1]!) * e[1] + (P[2]! - a[2]!) * e[2];
      const q: V3 = [a[0]! + e[0] * t, a[1]! + e[1] * t, a[2]! + e[2] * t];
      if (sameTrackPoint(q, a)) continue;
      const dist = screenDistance(f, q, x, y);
      if (dist === null || dist > snapPx || (best && dist >= best.distPx)) continue;
      best = { p: q, axis, from: [P[0]!, P[1]!, P[2]!], distPx: dist, direction: [e[0], e[1], e[2]] };
    }
  }
  return best;
}

/**
 * 끌어온 축(0.16.0): 기억한 점 P마다 P를 지나는 X·Y·Z 축 위에서 커서 광선에 가장 가까운 점이 커서에서 snapPx 안이면 후보(가까운 것,
 * 같으면 앞 점 → X·Y·Z). 커서가 P의 화면 자리 snapPx 안이면 그 P는 뺀다(세 축이 모두 지나고, 점 붙잡기가 맡는다).
 * skip(첫 측정 점)과 같은 P는 뺀다 — 그 축은 첫 점 축 붙잡기다. 축이 커서 광선과 거의 나란하면 그 축은 뺀다. axes는 trackCrossSnap과 같다
 */
export function trackAxisSnap(
  f: ViewFrame,
  tracks: readonly (readonly number[])[],
  x: number,
  y: number,
  snapPx: number,
  skip?: readonly number[] | null,
  axes?: TrackAxes | null,
): TrackSnap | null {
  if (!tracks.length) return null;
  const ray = screenRay(f, x, y);
  const dirs = axesOf(axes);
  let best: TrackSnap | null = null;
  for (const P of tracks) {
    if (skip && sameTrackPoint(P, skip)) continue;
    const sp = projectToScreen(f, P);
    if (sp && Math.hypot(sp[0] - x, sp[1] - y) <= snapPx) continue;
    for (const [axis, e] of dirs) {
      const q = rayLinePoint(ray.origin, ray.dir, P, e);
      if (!q) continue;
      const dist = screenDistance(f, q, x, y);
      if (dist === null || dist > snapPx || (best && dist >= best.distPx)) continue;
      best = { p: q, axis, from: [P[0]!, P[1]!, P[2]!], distPx: dist };
    }
  }
  return best;
}

/** 머무르기 판정 결과: 'start' = 새로 머물기 시작(부르는 쪽이 dwellMs 뒤 commit), 'keep' = 같은 점에서 머무는 중, 'none' = 머무는 점 없음 */
export type DwellStep = 'start' | 'keep' | 'none';

/**
 * 끌어온 점 목록과 머무르기 상태(0.16.0 — 시간 없이 상태만). 뷰어는 미리 보기마다 hover를 부르고, 'start'면 타이머를 새로 걸어
 * dwellMs 뒤 같은 머무르기가 이어지고 있으면(hover가 그 사이 'start'·'none'을 돌려주지 않았다) commit한다
 */
export class MeasureTracker {
  private list: V3[] = [];
  private pending: { p: V3; x: number; y: number } | null = null;
  constructor(
    readonly max = TRACK_MAX,
    readonly dwellPx = TRACK_DWELL_PX,
  ) {}

  /** 기억한 점(새것이 앞, 복사본) */
  get points(): V3[] {
    return this.list.map((p) => [p[0], p[1], p[2]] as V3);
  }

  /** 기억한 점 수 */
  get size(): number {
    return this.list.length;
  }

  /** 기억한 점(안쪽 배열 — 고치지 않는다. 붙잡기 계산이 복사 없이 쓴다) */
  get view(): readonly V3[] {
    return this.list;
  }

  /** 머무는 중인 점(복사본), 없으면 null */
  get dwelling(): V3 | null {
    const q = this.pending;
    return q ? [q.p[0], q.p[1], q.p[2]] : null;
  }

  /**
   * 미리 보기 한 번: p = 커서 아래 점 붙잡기(없거나 점 붙잡기가 아니면 null), (x, y) = 커서 자리.
   * 머무는 점과 같은 점이고 커서가 머물기 시작한 자리에서 dwellPx 안이면 'keep', 다른 점이거나 벗어났으면 새로 'start',
   * 점이 없거나 이미 가장 최근에 기억한 점이면 'none'(머무르기를 버린다)
   */
  hover(p: readonly number[] | null, x: number, y: number): DwellStep {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2]) || (this.list[0] && sameTrackPoint(this.list[0], p))) {
      this.pending = null;
      return 'none';
    }
    const q = this.pending;
    if (q && sameTrackPoint(q.p, p) && Math.hypot(x - q.x, y - q.y) <= this.dwellPx) return 'keep';
    this.pending = { p: [p[0]!, p[1]!, p[2]!], x, y };
    return 'start';
  }

  /** 머무르기를 버린다(누르기·끌기·캔버스를 떠남) */
  cancel(): void {
    this.pending = null;
  }

  /** 머문 점을 기억한다(머무는 점이 없으면 null). 돌려주는 것은 그 점의 복사본 */
  commit(): V3 | null {
    const q = this.pending;
    if (!q) return null;
    this.pending = null;
    this.add(q.p);
    return [q.p[0], q.p[1], q.p[2]];
  }

  /** 점 하나를 가장 앞에 기억한다(같은 점이 있으면 앞으로 옮긴다, max를 넘으면 가장 오래된 것을 지운다). 수 셋이 아니면 false */
  add(p: readonly number[]): boolean {
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) return false;
    const q: V3 = [p[0]!, p[1]!, p[2]!];
    this.list = [q, ...this.list.filter((r) => !sameTrackPoint(r, q))].slice(0, Math.max(0, this.max));
    return true;
  }

  /** 목록을 통째로 바꾼다(앞이 가장 최근 — 수 셋이 아닌 것은 버리고 같은 점은 하나, max개까지). 머무르기도 버린다. 기억한 수를 돌려준다 */
  set(points: readonly (readonly number[])[] | null | undefined): number {
    this.pending = null;
    this.list = [];
    if (points) for (let i = points.length - 1; i >= 0; i--) this.add(points[i]!);
    return this.list.length;
  }

  /** 목록과 머무르기를 모두 지운다. 지울 것이 있었으면 true */
  clear(): boolean {
    const had = this.list.length > 0 || !!this.pending;
    this.list = [];
    this.pending = null;
    return had;
  }
}
