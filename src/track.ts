/**
 * 다른 점에서 끌어온 축 안내(0.16.0, 순수 — DOM·WebGL 없음). Viewer3d.setMeasureSnap({ inference: { track } })가 쓰고,
 * 코어 측정 모드를 쓰지 않는 앱(자체 줄자 등)도 같은 규칙으로 쓸 수 있게 나눠 둔다.
 *
 * - 머무르기: 마우스·펜이 점 붙잡기(꼭짓점·끝점·가운데 점·중심·앱 점·교차점·수직 발) 위에서 TRACK_DWELL_PX 안으로 dwellMs 동안 머물면
 *   그 점을 기억한다(최근 TRACK_MAX개, 새것이 앞). 시간은 부르는 쪽이 잰다(MeasureTracker는 상태만 — 뷰어는 setTimeout)
 * - 첫 점 축 위 나란한 자리(trackCrossSnap): 첫 점 A를 지나는 축 i 위에서 기억한 점 P와 그 축 방향 자리가 같은 점
 *   (P를 그 축에 수직으로 내린 자리 A + e·((P − A)·e)). A와 P가 다른 좌표 하나를 함께 쓰면 A의 축과 P의 다른 축이 3D로 만나는 점이다
 * - 끌어온 축(trackAxisSnap): 기억한 점 P를 지나는 X·Y·Z 축 위에서 커서 광선에 가장 가까운 점
 * - 끌어온 축끼리의 교차(0.17.0 trackPairSnap): 기억한 두 점 P·Q의 서로 다른 축(P의 X축과 Q의 Y축 등)이 3D로 만나는 점(만나지 않으면 없다)
 * - 끌어온 축과 선분의 교차(0.17.0 trackEdgeSnap): P의 축이 커서 둘레 선분·윤곽선과 3D로 만나는 점
 * - 첫 점 축과 선분의 교차(0.18.0 axisEdgeSnap): 첫 측정 점 A를 지나는 X·Y·Z 축이 커서 둘레 선분·윤곽선과 3D로 만나는 점(trackEdgeSnap과 같은 허용치·빼는 규칙 —
 *   끌어온 점이 없어도 된다. 뷰어는 MeasureInference.axisEdges를 켰을 때)
 * - 축과 면의 교차(0.18.0 axisFaceSnap): 첫 점 축·끌어온 축이 커서 아래 보이는 면을 뚫는 점(뷰어는 MeasureInference.axisFaces를 켰을 때)
 * - 잠근 선과 선분·면의 교차(0.19.0 lockEdgeSnap·lockFaceSnap): 첫 점을 지나는 잠근 선(축이 아닌 방향도)이 커서 둘레 선분과 3D로 만나는 점·커서 아래 보이는 면을
 *   뚫는 점(axisEdgeSnap·axisFaceSnap과 같은 계산 — 뷰어는 MeasureInference.lockEdges·lockFaces를 켜고 잠갔을 때)
 * 모두 화면 붙잡기 거리 안일 때만이고, 가까운 것이 이기며 같으면 새 점 → X·Y·Z 차례다.
 * 점 후보(첫 점 축 위 나란한 자리·축끼리 교차·선분 교차·첫 점 축과 선분의 교차) 사이는 chooseTrackPoint(뒤 차례는 TRACK_YIELD_PX 넘게 가까워야 이긴다).
 */
import { type ViewFrame, projectToScreen, screenRay, viewDepth, worldPerPixel } from './camera';
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

/** 끌어온 축 하나(0.17.0): 끌어온 점(복사본)과 그 점을 지나는 축 */
export interface TrackGuide {
  from: V3;
  axis: SnapAxis;
}

/** 끌어온 축 붙잡기 결과: 찍을 점, 그 선의 축, 끌어온 점(복사본), 커서와의 화면 거리, 첫 점 축 위면 그 단위 방향(잠글 때) */
export interface TrackSnap {
  p: V3;
  axis: SnapAxis;
  from: V3;
  distPx: number;
  /** trackCrossSnap(첫 점을 지나는 축 위)만 — 축 단위 방향(세계 축이면 +X·+Y·+Z). trackAxisSnap(끌어온 점을 지나는 축)은 없다 */
  direction?: V3;
  /** 0.17.0 trackPairSnap만 — 이 점에서 만나는 둘째 끌어온 축(첫째는 from·axis) */
  other?: TrackGuide;
}

/** 끌어온 축과 선분의 교차(0.17.0 trackEdgeSnap)가 보는 선분: 세계 끝점 둘, 커서 쪽 깊이에서 한 화소의 세계 길이, 단면에서 남는 쪽 판정(뷰어의 NearSegment) */
export interface TrackSegment {
  a: readonly number[];
  b: readonly number[];
  wpp: number;
  keep?: (p: readonly number[]) => boolean;
}

/** 끌어온 축과 선분의 교차 결과(0.17.0): TrackSnap에 그 점이 놓인 선분(받은 segs의 그 객체) */
export interface TrackEdgeSnap<S extends TrackSegment = TrackSegment> extends TrackSnap {
  seg: S;
}

/** 점 후보 사이에서 뒤 차례 후보가 이기려면 화면에서 이만큼(화소) 더 가까워야 한다(0.17.0 — 같은 점을 셈 오차로 바꿔 고르지 않게) */
export const TRACK_YIELD_PX = 1;

const dist3 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** 같은 자리로 볼 허용치: 그 점 깊이에서 화면 반 화소(0.9.0 교차점과 같은 눈금), 아주 큰 좌표에서는 좌표 크기의 1e-9배 */
function meetTol(f: ViewFrame, m: readonly number[], wpp?: number): number {
  const w = wpp ?? worldPerPixel(f, viewDepth(f, m));
  return Math.max(0.5 * w, 1e-9 * (1 + Math.max(Math.abs(m[0]!), Math.abs(m[1]!), Math.abs(m[2]!))));
}

/**
 * 선 P + s·e(e는 단위)와 선 Q + t·g(g는 단위, segment면 Q + t·g의 t를 0~1로 — g는 길이 그대로) 사이에서 가장 가까운 두 점의 가운데와 두 점 사이 거리.
 * 나란하면(사잇각 사인² < 1e-10) null, segment인데 t가 범위 밖이면 null. 한 선에서 변하지 않는 좌표는 그 선의 값을 그대로 쓴다
 * (세계 축이면 P의 X축과 Q의 Y축이 만나는 점이 정확히 (Qx, Py, Pz) — 셈 오차 없이)
 */
function closestMid(P: readonly number[], e: readonly number[], Q: readonly number[], g: readonly number[], segment: boolean): { m: V3; gap: number } | null {
  const wx = P[0]! - Q[0]!, wy = P[1]! - Q[1]!, wz = P[2]! - Q[2]!;
  const A = e[0]! * e[0]! + e[1]! * e[1]! + e[2]! * e[2]!;
  const B = e[0]! * g[0]! + e[1]! * g[1]! + e[2]! * g[2]!;
  const C = g[0]! * g[0]! + g[1]! * g[1]! + g[2]! * g[2]!;
  const D = e[0]! * wx + e[1]! * wy + e[2]! * wz;
  const E = g[0]! * wx + g[1]! * wy + g[2]! * wz;
  const den = A * C - B * B;
  if (!(A > 0) || !(C > 0) || !(den > 1e-10 * A * C)) return null;
  // |w + s·e − t·g|² 최소: s = (B·E − C·D)/den, t = (A·E − B·D)/den
  const t = (A * E - B * D) / den;
  if (segment && (t < 0 || t > 1)) return null;
  const s = (B * t - D) / A;
  const m: V3 = [0, 0, 0];
  let gap2 = 0;
  for (let k = 0; k < 3; k++) {
    const p = P[k]! + e[k]! * s, q = Q[k]! + g[k]! * t;
    gap2 += (p - q) * (p - q);
    m[k] = e[k] === 0 && g[k] !== 0 ? P[k]! : g[k] === 0 && e[k] !== 0 ? Q[k]! : (p + q) / 2;
  }
  return { m, gap: Math.sqrt(gap2) };
}

/** 커서가 점 P의 화면 자리 snapPx 안인지(그 P의 축은 보지 않는다 — 점 붙잡기가 맡는다) */
function cursorOn(f: ViewFrame, P: readonly number[], x: number, y: number, snapPx: number): boolean {
  const sp = projectToScreen(f, P);
  return !!sp && Math.hypot(sp[0] - x, sp[1] - y) <= snapPx;
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

/**
 * 끌어온 축끼리의 교차(0.17.0): 기억한 두 점 P·Q(P가 앞 — 더 최근)의 서로 다른 축(P의 i축과 Q의 j축, i ≠ j)이 3D로 만나는 점 m이
 * 커서에서 snapPx 안이면 후보(가까운 것, 같으면 앞 점 쌍 → P의 X·Y·Z → Q의 X·Y·Z). 결과의 from·axis는 P와 그 축, other는 Q와 그 축.
 * - 만난다: 두 축 사이 가장 가까운 두 점이 그 자리 깊이에서 화면 반 화소(세계 길이) 안. 세계 축이면 P와 Q가 남은 좌표 하나를 함께 쓸 때다
 *   (P의 X축과 Q의 Y축은 Pz = Qz일 때 (Qx, Py, Pz)에서). 만나지 않으면 후보가 없다 — 화면에서만 엇갈리는 두 축의 가장 가까운 자리는
 *   한 점과만 나란한 점이라, 찍으면 다른 점과는 그 높이 차만큼 어긋난다(그때는 trackAxisSnap이 한 축에 붙는다)
 * - 같은 점의 두 축(P의 X축과 Y축은 P에서 만난다)·같은 축 둘(나란하다)은 보지 않는다. m이 P나 Q 자리(한 점이 다른 점의 축 위)거나 첫 점 자리면 뺀다
 * - skip(첫 측정 점)과 같은 점은 쌍에 넣지 않는다(그 축은 첫 점 축이고, 첫 점 축과 끌어온 축의 교차는 trackCrossSnap이다)
 * - 커서가 P나 Q의 화면 자리 snapPx 안이면 그 쌍은 보지 않는다(점 붙잡기가 맡는다). 원근에서 가까운 면보다 앞이면 뺀다. 단면·가림은 따지지 않는다
 * axes는 trackCrossSnap과 같다(앱의 그리기 축 — 나란하지 않은 두 축이면 같은 규칙)
 */
export function trackPairSnap(
  f: ViewFrame,
  tracks: readonly (readonly number[])[],
  x: number,
  y: number,
  snapPx: number,
  skip?: readonly number[] | null,
  axes?: TrackAxes | null,
): TrackSnap | null {
  if (tracks.length < 2) return null;
  const dirs = axesOf(axes);
  const live = tracks.filter((P) => !(skip && sameTrackPoint(P, skip)) && !cursorOn(f, P, x, y, snapPx));
  let best: TrackSnap | null = null;
  for (let i = 0; i < live.length; i++) {
    const P = live[i]!;
    for (let j = i + 1; j < live.length; j++) {
      const Q = live[j]!;
      if (sameTrackPoint(P, Q)) continue;
      for (const [axis, e] of dirs)
        for (const [axis2, g] of dirs) {
          if (axis === axis2) continue;
          const c = closestMid(P, e, Q, g, false);
          if (!c) continue;
          const tol = meetTol(f, c.m);
          if (!(c.gap <= tol) || dist3(c.m, P) <= tol || dist3(c.m, Q) <= tol || (skip && dist3(c.m, skip) <= tol)) continue;
          const dist = screenDistance(f, c.m, x, y);
          if (dist === null || dist > snapPx || (best && dist >= best.distPx)) continue;
          best = { p: c.m, axis, from: [P[0]!, P[1]!, P[2]!], distPx: dist, other: { from: [Q[0]!, Q[1]!, Q[2]!], axis: axis2 } };
        }
    }
  }
  return best;
}

/**
 * 끌어온 축과 선분의 교차(0.17.0): 기억한 점 P를 지나는 X·Y·Z 축이 선분 segs(커서 둘레 선분·윤곽선 — 뷰어는 segmentsNear 차례)와 3D로 만나는 점이
 * 커서에서 snapPx 안이면 후보(가까운 것, 같으면 앞 점 → X·Y·Z → 선분 차례). 결과의 seg는 그 선분(받은 객체 그대로).
 * - 만난다: 축과 선분 사이 가장 가까운 두 점이 선분 쪽 화면 반 화소(0.5 × wpp — 0.9.0 두 선분 교차와 같은 허용치) 안이고 선분 범위 안
 * - 선분 끝점(허용치 안)은 뺀다(끝점 붙잡기가 맡는다). 축과 나란한 선분, P 자리의 교차(P가 그 선분 위)와 첫 점 자리의 교차는 뺀다
 * - 단면에서 잘린 쪽(seg.keep)이면 뺀다. visible(p, seg)를 주면 지금 고른 것보다 가까운 후보에만 물어 false면 뺀다(뷰어는 음영 계열의 면 가림)
 * - skip(첫 측정 점)과 같은 P, 커서가 화면 자리 snapPx 안인 P는 뺀다(trackAxisSnap과 같다). axes는 trackCrossSnap과 같다
 */
export function trackEdgeSnap<S extends TrackSegment>(
  f: ViewFrame,
  tracks: readonly (readonly number[])[],
  segs: readonly S[],
  x: number,
  y: number,
  snapPx: number,
  skip?: readonly number[] | null,
  axes?: TrackAxes | null,
  visible?: ((p: V3, seg: S) => boolean) | null,
): TrackEdgeSnap<S> | null {
  if (!tracks.length || !segs.length) return null;
  const dirs = axesOf(axes);
  let best: TrackEdgeSnap<S> | null = null;
  for (const P of tracks) {
    if ((skip && sameTrackPoint(P, skip)) || cursorOn(f, P, x, y, snapPx)) continue;
    best = crossEdges<S, TrackEdgeSnap<S>>(f, P, dirs, segs, x, y, snapPx, skip, visible, best, (p, axis, _e, s, dist) => ({
      p,
      axis,
      from: [P[0]!, P[1]!, P[2]!],
      distPx: dist,
      seg: s,
    }));
  }
  return best;
}

/**
 * 점 P를 지나는 축들(dirs)이 선분들(segs)과 3D로 만나는 점 가운데 커서에 가장 가까운 것(trackEdgeSnap·axisEdgeSnap이 함께 쓴다 — 규칙은 trackEdgeSnap 머리글).
 * best(지금까지 고른 것)보다 가까운 것만 take로 만들어 돌려주고, 없으면 best 그대로. 축 차례 → 선분 차례, 같으면 앞의 것
 */
function crossEdges<S extends TrackSegment, T extends { distPx: number }, A = SnapAxis>(
  f: ViewFrame,
  P: readonly number[],
  dirs: readonly (readonly [A, V3])[],
  segs: readonly S[],
  x: number,
  y: number,
  snapPx: number,
  skip: readonly number[] | null | undefined,
  visible: ((p: V3, seg: S) => boolean) | null | undefined,
  best: T | null,
  take: (p: V3, axis: A, e: V3, seg: S, distPx: number) => T,
): T | null {
  for (const [axis, e] of dirs)
    for (const s of segs) {
      const g = [s.b[0]! - s.a[0]!, s.b[1]! - s.a[1]!, s.b[2]! - s.a[2]!];
      const c = closestMid(P, e, s.a, g, true);
      if (!c) continue;
      const tol = meetTol(f, c.m, s.wpp);
      if (!(c.gap <= tol) || dist3(c.m, s.a) <= tol || dist3(c.m, s.b) <= tol || dist3(c.m, P) <= tol || (skip && dist3(c.m, skip) <= tol)) continue;
      if (s.keep && !s.keep(c.m)) continue;
      const dist = screenDistance(f, c.m, x, y);
      if (dist === null || dist > snapPx || (best && dist >= best.distPx)) continue;
      if (visible && !visible(c.m, s)) continue;
      best = take(c.m, axis, e, s, dist);
    }
  return best;
}

/** 첫 점 축과 선분의 교차 결과(0.18.0): 찍을 점, 그 축과 단위 방향(잠글 때 — 세계 축이면 +X·+Y·+Z), 커서와의 화면 거리, 그 점이 놓인 선분(받은 segs의 그 객체) */
export interface AxisEdgeSnap<S extends TrackSegment = TrackSegment> {
  p: V3;
  axis: SnapAxis;
  direction: V3;
  distPx: number;
  seg: S;
}

/**
 * 첫 점 축과 선분의 교차(0.18.0): 첫 측정 점 a를 지나는 X·Y·Z 축이 선분 segs(커서 둘레 선분·윤곽선 — 뷰어는 segmentsNear 차례)와 3D로 만나는 점이
 * 커서에서 snapPx 안이면 후보(가까운 것, 같으면 X·Y·Z → 선분 차례). 규칙은 trackEdgeSnap과 같다 —
 * 허용치는 선분 쪽 화면 반 화소(0.5 × wpp), 선분 끝점·축과 나란한 선분·a 자리의 교차(a가 그 선분 위)·단면에서 잘린 쪽(seg.keep)은 빼고,
 * visible(p, seg)는 지금 고른 것보다 가까운 후보에만 묻는다. 커서가 a의 화면 자리 snapPx 안이면(세 축이 모두 지나는 곳 — axisSnap과 같다) 없다.
 * 결과의 direction은 그 축 단위 방향이라 Shift·setMeasureInferenceLock(true)가 그 축으로 잠근다. axes는 trackCrossSnap과 같다(앱의 그리기 축)
 */
export function axisEdgeSnap<S extends TrackSegment>(
  f: ViewFrame,
  a: readonly number[],
  segs: readonly S[],
  x: number,
  y: number,
  snapPx: number,
  axes?: TrackAxes | null,
  visible?: ((p: V3, seg: S) => boolean) | null,
): AxisEdgeSnap<S> | null {
  if (!segs.length || cursorOn(f, a, x, y, snapPx)) return null;
  return crossEdges<S, AxisEdgeSnap<S>>(f, a, axesOf(axes), segs, x, y, snapPx, null, visible, null, (p, axis, e, s, dist) => ({
    p,
    axis,
    direction: [e[0], e[1], e[2]],
    distPx: dist,
    seg: s,
  }));
}

/** 축과 면의 교차(0.18.0 axisFaceSnap)가 보는 면 맞음: 화면 광선이 맞은 세계 점과 그 면의 세계 법선(길이는 상관없다). 부르는 쪽이 식별자를 더 실어도 된다(뷰어는 그물 id·삼각형 번호) */
export interface TrackFaceHit {
  point: readonly number[];
  normal: readonly number[];
  /** 면 평면 위의 점(없으면 point). 뷰어는 맞은 삼각형의 꼭짓점을 준다 — 광선 맞은 점의 셈 오차 없이 평면을 정하려고 */
  origin?: readonly number[];
}

/** 축과 면의 교차가 보는 축 직선 하나(0.18.0): 지나는 점(첫 측정 점이나 끌어온 점)과 축 */
export interface TrackLine {
  from: readonly number[];
  axis: SnapAxis;
}

/** 축과 면의 교차 결과(0.18.0): 찍을 점, 축, 지나는 점(복사본), 그 축 단위 방향, 커서와의 화면 거리, 그 점의 면 맞음(hitAt이 돌려준 그 객체), 받은 lines 안 번호 */
export interface AxisFaceSnap<H extends TrackFaceHit = TrackFaceHit> {
  p: V3;
  axis: SnapAxis;
  from: V3;
  direction: V3;
  distPx: number;
  hit: H;
  line: number;
}

/** 축과 면의 교차에서 면을 바꿔 다시 구하는 최대 횟수(0.18.0 — 곡면을 나눈 삼각형에서 축이 뚫는 삼각형을 찾아 간다) */
export const AXIS_FACE_STEPS = 3;

/**
 * 축과 면의 교차(0.18.0): 축 직선들(lines — 첫 점 축·끌어온 축)이 커서 아래 보이는 면을 뚫는 점 가운데 커서에서 snapPx 안이고 가장 가까운 것
 * (같으면 lines 차례). under = 커서 아래 면 맞음(없으면 후보가 없다 — 커서가 면 위일 때만), hitAt(sx, sy) = 화면 점에서 맨 앞에 보이는 면 맞음(없으면 null).
 * - 축 직선과 under 면의 평면이 만나는 점 m을 구하고, m의 화면 자리에서 hitAt으로 다시 맞춰 그 점이 m과 같은 자리(그 깊이에서 화면 반 화소 안)면 받는다.
 *   다르면(곡면을 나눈 다른 삼각형, 면 밖, 앞에 다른 면) 새로 맞은 면의 평면으로 다시 구한다(steps번까지, 기본 AXIS_FACE_STEPS)
 * - 가림·단면·면 밖은 hitAt이 맡는다(맨 앞에 보이는 면이 아니면 다른 점이 맞는다). 면과 나란한 축(법선과 사잇각 코사인 < 1e-9), 교차가 지나는 점 자리인 축
 *   (그 점이 면 위 — 점 붙잡기가 맡는다), 커서가 지나는 점의 화면 자리 snapPx 안인 직선은 뺀다
 * - 세계 축이면 m은 지나는 점과 남은 두 좌표가 정확히 같다(축 위 점). axes는 trackCrossSnap과 같다(앱의 그리기 축)
 */
export function axisFaceSnap<H extends TrackFaceHit>(
  f: ViewFrame,
  lines: readonly TrackLine[],
  x: number,
  y: number,
  snapPx: number,
  under: H | null | undefined,
  hitAt: (sx: number, sy: number) => H | null | undefined,
  axes?: TrackAxes | null,
  steps = AXIS_FACE_STEPS,
): AxisFaceSnap<H> | null {
  if (!under || !lines.length) return null;
  const dirs = axesOf(axes);
  let best: AxisFaceSnap<H> | null = null;
  for (let li = 0; li < lines.length; li++) {
    const { from: O, axis } = lines[li]!;
    const e = dirs.find(([n]) => n === axis)?.[1];
    if (!e || cursorOn(f, O, x, y, snapPx)) continue;
    const r: LockFaceSnap<H> | null = faceMeet<H>(f, O, e, x, y, snapPx, under, hitAt, steps, best ? best.distPx : Infinity);
    if (r) best = { p: r.p, axis, from: [O[0]!, O[1]!, O[2]!], direction: [e[0], e[1], e[2]], distPx: r.distPx, hit: r.hit, line: li };
  }
  return best;
}

/**
 * 점 O를 지나는 단위 방향 e의 직선이 커서 아래 면(under)에서 시작해 맨 앞에 보이는 면을 뚫는 점(axisFaceSnap·lockFaceSnap이 함께 쓴다 — 규칙은 axisFaceSnap 머리글).
 * 커서에서 snapPx 안이고 bestDist보다 가까울 때만 { p, distPx, hit }, 아니면 null
 */
function faceMeet<H extends TrackFaceHit>(
  f: ViewFrame,
  O: readonly number[],
  e: readonly number[],
  x: number,
  y: number,
  snapPx: number,
  under: H,
  hitAt: (sx: number, sy: number) => H | null | undefined,
  steps: number,
  bestDist: number,
): { p: V3; distPx: number; hit: H } | null {
  let plane: TrackFaceHit = under;
  for (let k = 0; k < steps; k++) {
    const n = plane.normal, Q = plane.origin ?? plane.point;
    const nn = Math.hypot(n[0]!, n[1]!, n[2]!);
    const den = n[0]! * e[0]! + n[1]! * e[1]! + n[2]! * e[2]!;
    if (!(nn > 0) || !(Math.abs(den) > 1e-9 * nn)) return null;
    const t = (n[0]! * (Q[0]! - O[0]!) + n[1]! * (Q[1]! - O[1]!) + n[2]! * (Q[2]! - O[2]!)) / den;
    const m: V3 = [O[0]! + e[0]! * t, O[1]! + e[1]! * t, O[2]! + e[2]! * t];
    if (!Number.isFinite(m[0]) || !Number.isFinite(m[1]) || !Number.isFinite(m[2])) return null;
    const tol = meetTol(f, m);
    if (dist3(m, O) <= tol) return null;
    const dist = screenDistance(f, m, x, y);
    if (dist === null || dist > snapPx || dist >= bestDist) return null;
    const s = projectToScreen(f, m)!;
    const h = hitAt(s[0], s[1]);
    if (!h) return null;
    if (dist3(h.point, m) <= tol) return { p: m, distPx: dist, hit: h };
    plane = h;
  }
  return null;
}

/** 잠근 선과 선분의 교차 결과(0.19.0 lockEdgeSnap): 찍을 점, 커서와의 화면 거리, 그 점이 놓인 선분(받은 segs의 그 객체) */
export interface LockEdgeSnap<S extends TrackSegment = TrackSegment> {
  p: V3;
  distPx: number;
  seg: S;
}

/** 잠근 선과 면의 교차 결과(0.19.0 lockFaceSnap): 찍을 점, 커서와의 화면 거리, 그 점의 면 맞음(hitAt이 돌려준 그 객체) */
export interface LockFaceSnap<H extends TrackFaceHit = TrackFaceHit> {
  p: V3;
  distPx: number;
  hit: H;
}

/**
 * 잠근 선과 선분의 교차(0.19.0): 첫 측정 점 a를 지나는 방향 dir(길이는 상관없다 — 잠근 축·나란함·수직·선분 방향·앱이 정한 방향)의 직선이
 * 선분 segs(커서 둘레 선분·윤곽선)와 3D로 만나는 점이 커서에서 snapPx 안이면 후보(가까운 것, 같으면 선분 차례). 규칙은 axisEdgeSnap과 같다 —
 * 허용치는 선분 쪽 화면 반 화소(0.5 × wpp), 선분 끝점·잠근 선과 나란한 선분·a 자리의 교차·단면에서 잘린 쪽(seg.keep)은 빼고, visible(p, seg)는 지금 고른 것보다
 * 가까운 후보에만 묻는다. 커서가 a의 화면 자리 snapPx 안이면 없다. dir가 길이 0이거나 수가 아니면 없다.
 * 세계 축 방향이면 교차의 남은 두 좌표가 a와 정확히 같다(axisEdgeSnap과 같은 셈)
 */
export function lockEdgeSnap<S extends TrackSegment>(
  f: ViewFrame,
  a: readonly number[],
  dir: readonly number[],
  segs: readonly S[],
  x: number,
  y: number,
  snapPx: number,
  visible?: ((p: V3, seg: S) => boolean) | null,
): LockEdgeSnap<S> | null {
  const e = unitDir([0, 0, 0], dir);
  if (!e || !segs.length || cursorOn(f, a, x, y, snapPx)) return null;
  return crossEdges<S, LockEdgeSnap<S>, null>(f, a, [[null, e]], segs, x, y, snapPx, null, visible, null, (p, _a, _e, s, dist) => ({ p, distPx: dist, seg: s }));
}

/**
 * 잠근 선과 면의 교차(0.19.0): 첫 측정 점 a를 지나는 방향 dir의 직선이 커서 아래 보이는 면을 뚫는 점(커서에서 snapPx 안일 때만). 규칙은 axisFaceSnap과 같다 —
 * under = 커서 아래 면 맞음(없으면 없다), hitAt(sx, sy) = 화면 점에서 맨 앞에 보이는 면 맞음. 교차의 화면 자리에서 다시 맞춰 같은 자리면 받고, 다르면
 * 새로 맞은 면의 평면으로 다시 구한다(steps번까지). 면과 나란한 선, a 자리의 교차(a가 면 위), 커서가 a의 화면 자리 snapPx 안이면 없다
 */
export function lockFaceSnap<H extends TrackFaceHit>(
  f: ViewFrame,
  a: readonly number[],
  dir: readonly number[],
  x: number,
  y: number,
  snapPx: number,
  under: H | null | undefined,
  hitAt: (sx: number, sy: number) => H | null | undefined,
  steps = AXIS_FACE_STEPS,
): LockFaceSnap<H> | null {
  const e = unitDir([0, 0, 0], dir);
  if (!under || !e || cursorOn(f, a, x, y, snapPx)) return null;
  return faceMeet(f, a, e, x, y, snapPx, under, hitAt, steps, Infinity);
}

/**
 * 끌어온 점 P를 지나는 axis 축 선이 첫 점 a도 지나는지(0.17.0 — P가 a의 그 축 위): 그렇다면 그 축 단위 방향(세계 축이면 +X·+Y·+Z), 아니면 null.
 * 허용치는 a 깊이에서 화면 반 화소(아주 큰 좌표는 좌표 크기의 1e-9배). 뷰어는 그 선 위의 점 후보(축끼리의 교차·선분 교차)에 이 방향을 실어
 * 첫 점 축처럼 잠글 수 있게 하고 첫 점에서 축 색 안내선을 긋는다. axes는 trackCrossSnap과 같다
 */
export function trackAlongFirst(f: ViewFrame, a: readonly number[], P: readonly number[], axis: SnapAxis, axes?: TrackAxes | null): V3 | null {
  const e = axesOf(axes).find(([n]) => n === axis)?.[1];
  if (!e) return null;
  const wx = a[0]! - P[0]!, wy = a[1]! - P[1]!, wz = a[2]! - P[2]!;
  const t = wx * e[0] + wy * e[1] + wz * e[2];
  const off = Math.hypot(wx - e[0] * t, wy - e[1] * t, wz - e[2] * t);
  return off <= meetTol(f, a) ? [e[0], e[1], e[2]] : null;
}

/**
 * 끌어온 점 후보(점인 것) 가운데 하나(0.17.0): cands는 차례대로(뷰어는 첫 점 축 위 나란한 자리 → 축끼리 교차 → 선분 교차, 없는 것은 null).
 * 화면에서 가까운 것이 이기지만 뒤 차례 후보는 yieldPx(기본 TRACK_YIELD_PX) 넘게 가까워야 한다 — 첫 점 축 위 나란한 자리가 곧 모서리와 만나는 자리처럼
 * 같은 점을 두 길로 구했을 때 셈 오차로 바꿔 고르지 않는다
 */
export function chooseTrackPoint<T extends { distPx: number }>(cands: readonly (T | null | undefined)[], yieldPx = TRACK_YIELD_PX): T | null {
  let best: T | null = null;
  for (const c of cands) if (c && (!best || c.distPx < best.distPx - yieldPx)) best = c;
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
