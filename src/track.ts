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
 * - 선과 꺾은선 토막의 열린 교차(0.20.0 openEdgeCandidates·openEdgeSnap): 축·잠근 선이 커서 둘레 토막과 3D로 만나지 않지만 그 토막의 활꼴(현과 곡선 사이)을
 *   지날 만큼 가까이 지나가면, 부르는 쪽(뷰어는 앱 refine — 'axisEdge', open)이 곡선과의 정확한 교차를 줄 때만 그 점을 후보로 받는다
 * - 잠근 선과 끌어온 축의 교차(0.21.0 lockTrackSnap): 첫 점을 지나는 잠근 선이 기억한 점의 X·Y·Z 축과 3D로 만나는 점, 축으로 잠갔으면 잠근 축 위에서
 *   기억한 점과 나란한 자리(trackCrossSnap과 같은 점 — 뷰어는 MeasureInference.lockTracks를 켜고 잠갔을 때)
 * - 0.22.0: 선이 한 토막의 활꼴을 두 번 지날 수 있으면(현의 직선과 같은 평면에서 토막 밖에서 만나거나 나란하다) 열린 교차 후보에 현의 다른 끝에서 선에 내린 발을
 *   둘째 힌트(twin)로 더한다. 선과 삼각형의 열린 교차(openFaceCandidates·openFaceSnap): 축·잠근 선이 곡면을 나눈 삼각형을 비켜 가지만 그 삼각형과 곡면 사이를
 *   지날 만큼 가까우면, 부르는 쪽(뷰어는 앱 refineFace — 'axisFace', open)이 곡면과의 정확한 교차를 줄 때만 그 점을 후보로 받는다
 * 모두 화면 붙잡기 거리 안일 때만이고, 가까운 것이 이기며 같으면 새 점 → X·Y·Z 차례다.
 * 점 후보(첫 점 축 위 나란한 자리·축끼리 교차·선분 교차·첫 점 축과 선분의 교차) 사이는 chooseTrackPoint(뒤 차례는 TRACK_YIELD_PX 넘게 가까워야 이긴다).
 * - 0.26.0 끌어온 점에서 나란함·수직 방향(trackDirGuides·trackDirSnap): 기억한 점 P를 지나 기준 선분과 나란한 선,
 *   기준 선분에 수직인 선(P에서 그 직선으로 내린 수직, 축을 수직 평면에 비친 방향) 위에서 커서 광선에 가장 가까운 점
 *   (0.27.0부터 뷰어는 MeasureInference.trackDirs를 켰을 때 끌어온 축과 함께 견준다 — 세계 축)
 */
import { type ViewFrame, projectToScreen, screenRay, viewDepth, worldPerPixel } from './camera';
import { OPEN_INTERSECTION_CHORD, type SnapAxis, rayLinePoint, screenDistance, unitDir } from './inference';
import type { V3 } from './math';
import { segmentScreenPick } from './pick';
import { acceptOnLine, finitePoint } from './snap';

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
 * 잠근 선과 끌어온 축의 교차 결과(0.21.0 lockTrackSnap): 찍을 점(잠근 선 위), 끌어온 점(복사본), 이 점에서 잠근 선과 만나는 그 점의 축
 * (축으로 잠근 선 위에서 끌어온 점과 나란한 자리일 뿐 그 점의 어느 축과도 만나지 않으면 없다), 커서와의 화면 거리
 */
export interface LockTrackSnap {
  p: V3;
  from: V3;
  axis?: SnapAxis;
  distPx: number;
}

/** 점 q에서 점 P를 지나는 단위 방향 e의 직선까지 거리 */
function lineGap(q: readonly number[], P: readonly number[], e: readonly number[]): number {
  const wx = q[0]! - P[0]!, wy = q[1]! - P[1]!, wz = q[2]! - P[2]!;
  const t = wx * e[0]! + wy * e[1]! + wz * e[2]!;
  return Math.hypot(wx - e[0]! * t, wy - e[1]! * t, wz - e[2]! * t);
}

/**
 * 잠근 선과 끌어온 축의 교차(0.21.0): 첫 측정 점 a를 지나는 방향 dir(길이는 상관없다 — 잠근 축·나란함·수직·선분 방향·앱이 정한 방향)의 직선이
 * 기억한 점 P(tracks — 새것이 앞)를 지나는 X·Y·Z 축과 3D로 만나는 점이 커서에서 snapPx 안이면 후보(가까운 것, 같으면 앞 점 → X·Y·Z 차례).
 * - 만난다: 두 직선 사이 가장 가까운 자리가 그 점 깊이에서 화면 반 화소(0.17.0 trackPairSnap과 같은 허용치) 안. 찍는 점은 잠근 선 위의 그 자리다
 *   (잠근 선의 방향 성분이 0인 좌표는 a 그대로 — 세계 축으로 잠갔으면 남은 두 좌표가 a와 정확히 같다)
 * - 잠근 선이 축(axes의 하나 — 없으면 세계 X·Y·Z)과 나란하면 P를 잠근 선에 수직으로 내린 자리 a + u·((P − a)·u)다(0.16.0 trackCrossSnap의 그 축 자리와 같은 셈 —
 *   잠그기 전 첫 점 축 위 나란한 자리를 Shift로 잠가도 같은 점이다). P가 a와 다른 좌표 하나를 함께 쓰면 그 자리에서 P의 다른 축이 잠근 축과 3D로 만나고(결과 axis),
 *   아니면 나란한 자리일 뿐이다(axis 없음 — 0.10.0 잠금에서 P를 가리킨 자리 from과 같은 점)
 * - 빼는 것: a와 같은 P(그 축은 첫 점 축이다), 커서가 P의 화면 자리 snapPx 안인 P(점 붙잡기가 맡는다), 잠근 선과 나란한 P의 축, 교차가 a 자리거나 P 자리인 것
 *   (P가 잠근 선 위), 원근에서 가까운 면보다 앞인 점. 커서가 a의 화면 자리 snapPx 안이면 없다. dir가 길이 0이거나 수가 아니면 없다. 단면·가림은 따지지 않는다(trackPairSnap과 같다)
 * - 만나지 않는 축(화면에서만 엇갈린다)은 받지 않는다. 축이 아닌 잠근 선 위에서 P에 가장 가까운 자리는 P의 축 위 점이 아니라 0.10.0 from과 같은 자리이고,
 *   0.15.0 넓힌 교차의 허용치(토막 길이의 0.1배)는 곡선을 나눈 꺾은선의 처짐 때문이라 곧은 두 직선에는 없다
 * axes는 trackCrossSnap과 같다(앱의 그리기 축)
 */
export function lockTrackSnap(
  f: ViewFrame,
  a: readonly number[],
  dir: readonly number[],
  tracks: readonly (readonly number[])[],
  x: number,
  y: number,
  snapPx: number,
  axes?: TrackAxes | null,
): LockTrackSnap | null {
  const u = unitDir([0, 0, 0], dir);
  if (!u || !tracks.length || !a.every(Number.isFinite) || cursorOn(f, a, x, y, snapPx)) return null;
  const dirs = axesOf(axes);
  // 잠근 선과 나란한 축(axisAligned와 같은 문턱)
  const along = dirs.find(([, e]) => Math.abs(e[0] * u[0] + e[1] * u[1] + e[2] * u[2]) >= 1 - 1e-6)?.[0] ?? null;
  let best: LockTrackSnap | null = null;
  const consider = (p: V3, P: readonly number[], axis: SnapAxis | undefined): void => {
    const dist = screenDistance(f, p, x, y);
    if (dist === null || dist > snapPx || (best && dist >= best.distPx)) return;
    best = { p, from: [P[0]!, P[1]!, P[2]!], distPx: dist };
    if (axis) best.axis = axis;
  };
  for (const P of tracks) {
    if (!P.every(Number.isFinite) || sameTrackPoint(P, a) || cursorOn(f, P, x, y, snapPx)) continue;
    if (along) {
      // 잠근 축 위 나란한 자리(trackCrossSnap과 같은 식 — 같은 수가 나온다)
      const t = (P[0]! - a[0]!) * u[0] + (P[1]! - a[1]!) * u[1] + (P[2]! - a[2]!) * u[2];
      const q: V3 = [a[0]! + u[0] * t, a[1]! + u[1] * t, a[2]! + u[2] * t];
      if (sameTrackPoint(q, a)) continue;
      const tol = meetTol(f, q);
      if (dist3(q, P) <= tol) continue;
      const on = dirs.find(([n, e]) => n !== along && lineGap(q, P, e) <= tol)?.[0];
      consider(q, P, on);
      continue;
    }
    for (const [axis, e] of dirs) {
      // 잠근 선 a + s·u와 P의 축 P + t·e 사이 가장 가까운 자리(잠근 선 위 점)
      const B = u[0] * e[0] + u[1] * e[1] + u[2] * e[2];
      const den = 1 - B * B;
      if (!(den > 1e-10)) continue;
      const wx = a[0]! - P[0]!, wy = a[1]! - P[1]!, wz = a[2]! - P[2]!;
      const D = u[0] * wx + u[1] * wy + u[2] * wz, E = e[0] * wx + e[1] * wy + e[2] * wz;
      const s = (B * E - D) / den;
      const m: V3 = [u[0] === 0 ? a[0]! : a[0]! + u[0] * s, u[1] === 0 ? a[1]! : a[1]! + u[1] * s, u[2] === 0 ? a[2]! : a[2]! + u[2] * s];
      if (!m.every(Number.isFinite)) continue;
      const tol = meetTol(f, m);
      if (!(lineGap(m, P, e) <= tol) || dist3(m, a) <= tol || dist3(m, P) <= tol) continue;
      consider(m, P, axis);
    }
  }
  return best;
}

/**
 * 열린 교차의 토막 길이 비(0.20.0 — 0.15.0 넓힌 교차 OPEN_INTERSECTION_CHORD와 같은 값 0.1): 한 토막이 45°보다 덜 도는 꺾은선이면 현과 곡선 사이(활꼴 높이 =
 * 현 길이/2 × tan(돈 각/4))는 현 길이의 0.1배 안이다. 곡선과 만나는 선은 그 토막의 활꼴을 지나므로 현에서 이만큼 안을 지나고, 곡선 위 교차점도 현에서 이만큼 안이다
 */
export const OPEN_EDGE_CHORD = OPEN_INTERSECTION_CHORD;

/** 열린 교차가 보는 선 하나(0.20.0): 지나는 점(첫 측정 점·끌어온 점)과 방향(길이는 상관없다 — 축·잠근 선) */
export interface OpenEdgeLine {
  from: readonly number[];
  dir: readonly number[];
}

/**
 * 선과 꺾은선 토막의 열린 교차 후보(0.20.0 openEdgeCandidates): 코어 점(선 위에서 토막에 가장 가까운 점 — 세계 축이면 남은 두 좌표가 지나는 점 그대로),
 * 받은 lines 안 번호, 토막(받은 segs의 그 객체), 선과 토막(범위 안) 사이 가장 가까운 거리(세계), 커서와 코어 점의 화면 거리.
 * 0.22.0: 선이 그 토막의 활꼴을 두 번 지날 수 있으면(같은 평면에서 토막 밖에서 만나거나 나란하다) 그 선·토막의 후보 모두 twice = true,
 * 그 가운데 더한 둘째 힌트면 twin = true(아니면 이 필드들이 없다) — twin의 p는 현의 다른 끝(나란하면 각 끝)에서 선에 내린 발이다.
 * 0.23.0: reachPx = 선에서 그 토막 범위(현에 내린 자리가 토막 안, 현의 직선에서 OPEN_EDGE_CHORD × 토막 길이 안)인 조각과 커서의 화면 거리.
 * 받는 점은 그 조각 위이므로 커서에서 이보다 가까울 수 없다
 */
export interface OpenEdgeCandidate<S extends TrackSegment = TrackSegment> {
  p: V3;
  line: number;
  seg: S;
  gap: number;
  distPx: number;
  reachPx: number;
  twice?: true;
  twin?: true;
}

/** 열린 교차 결과(0.20.0 openEdgeSnap): 받은 점(선 위로 내린 자리), 그 후보의 코어 점·선 번호·토막, 커서와 받은 점의 화면 거리 */
export interface OpenEdgeSnap<S extends TrackSegment = TrackSegment> {
  p: V3;
  core: V3;
  line: number;
  seg: S;
  distPx: number;
}

/**
 * 직선 P + s·e(e는 단위)와 토막 a → b(범위 안)에서 가장 가까운 두 점: 직선 위 점 m(e 성분이 0인 좌표는 P 그대로), 토막 매개변수 t(0~1), 둘 사이 거리,
 * 토막 안쪽이 아닌지(clamped — 가장 가까운 자리가 토막 끝 밖이라 끝으로 잘랐거나 나란해 어디서나 같다), 나란한지. 토막 길이 0이면 null
 */
function lineSegClosest(
  P: readonly number[],
  e: readonly number[],
  a: readonly number[],
  b: readonly number[],
): { m: V3; t: number; gap: number; clamped: boolean; parallel: boolean } | null {
  const g0 = b[0]! - a[0]!, g1 = b[1]! - a[1]!, g2 = b[2]! - a[2]!;
  const C = g0 * g0 + g1 * g1 + g2 * g2;
  if (!(C > 0)) return null;
  const w0 = P[0]! - a[0]!, w1 = P[1]! - a[1]!, w2 = P[2]! - a[2]!;
  const B = e[0]! * g0 + e[1]! * g1 + e[2]! * g2;
  const D = e[0]! * w0 + e[1]! * w1 + e[2]! * w2;
  const E = g0 * w0 + g1 * w1 + g2 * w2;
  const den = C - B * B;
  // |w + s·e − t·g|² 최소(closestMid와 같은 식, A = 1). 토막과 나란하면 어디서나 거리가 같다 — 토막 가운데
  const parallel = !(den > 1e-10 * C);
  let t = parallel ? 0.5 : (E - B * D) / den;
  let clamped = parallel;
  if (t < 0 || t > 1) {
    t = t < 0 ? 0 : 1;
    clamped = true;
  }
  if (!Number.isFinite(t)) return null;
  const s = B * t - D;
  const m: V3 = [0, 0, 0];
  let gap2 = 0;
  const g = [g0, g1, g2];
  for (let k = 0; k < 3; k++) {
    m[k] = e[k] === 0 ? P[k]! : P[k]! + e[k]! * s;
    const q = a[k]! + g[k]! * t;
    gap2 += (m[k]! - q) * (m[k]! - q);
  }
  return { m, t, gap: Math.sqrt(gap2), clamped, parallel };
}

/**
 * 선과 꺾은선 토막의 열린 교차 후보(0.20.0, 순수): 선 lines(지나는 점 from·방향 dir)가 토막 segs(커서 둘레 선분·윤곽선)와 3D로 만나지 않지만
 * (가장 가까운 두 점 사이가 그 깊이의 화면 반 화소를 넘는다 — 만나면 axisEdgeSnap·trackEdgeSnap·lockEdgeSnap이 맡는다) 그 토막의 활꼴을 지날 만큼 가까운 것.
 * - 가까움: 선과 토막(범위 안) 사이 거리가 min(OPEN_EDGE_CHORD × 토막 길이, 커서 쪽 깊이에서 붙잡기 거리 snapPx의 세계 길이) 안(0.15.0 넓힌 교차와 같은 근거)
 * - 코어 점은 선 위에서 토막에 가장 가까운 점이다. 다른 평면의 곡선(축이 곡선 평면을 뚫는다)이면 곡선 위 교차와 거의 같은 자리이고,
 *   같은 평면에서 곡선에 거의 닿듯 지나가면(활꼴만 지난다) 토막 끝 쪽이다. 커서와 상관없이 선과 토막으로만 정해진다(앱 결과를 기억할 수 있게)
 * - 빼는 것: 선이 지나는 점 자리(그 점이 토막 둘레 — 첫 점이 곡선 위면 그 점에서 만난다), 커서가 지나는 점의 화면 자리 snapPx 안인 선(axisEdgeSnap과 같다),
 *   가장 가까운 자리가 토막 끝 밖인데(나란하면 두 끝) 그 끝을 함께 쓰는 이웃 토막을 선이 3D로 지나는 것(곡선과의 교차는 그 이웃 토막의 코어 교차가 맡는다),
 *   선에서 그 토막 범위인 조각(현에 내린 자리가 토막 안, 현의 직선에서 OPEN_EDGE_CHORD × 토막 길이 안 — reachPx)이 화면에서 커서 snapPx 밖인 것
 *   (받는 점은 그 조각 위·커서에서 snapPx 안이어야 한다 — 0.23.0, 0.22.0까지는 "코어 점이 커서에서 2 × snapPx 밖"이었다)
 * - 0.22.0 두 번 지날 수 있는 토막(twice): 가장 가까운 자리가 토막 끝 밖이거나 나란하고(clamped) 선이 현의 직선과 같은 평면이면(엇갈린 거리가 반 화소 안 —
 *   나란하면 늘) 곡선이 선 쪽으로 볼록할 때 활꼴을 두 번 지난다. 다만 현 가운데에서 선까지(현에 수직) 거리가 OPEN_EDGE_CHORD × 토막 길이 안일 때만이고
 *   (곡선에 거의 닿듯 지나 활꼴의 높은 가운데를 지나는 선), segs 안의 이웃 토막이 선이 곡선의 안쪽(볼록하지 않은 쪽)을 지난다고 보이면 뺀다
 *   (이웃이 없으면 볼록한 쪽을 모르므로 남긴다). 현의 다른 끝(나란하면 두 끝 각각)에서 선에 내린 발을 같은 선·토막의 둘째 힌트(twin)로 더한다
 *   (그 끝을 함께 쓰는 이웃 토막을 선이 지나면 그 발은 뺀다). 앞의 후보(코어 점)의 자리는 0.20.0 그대로다
 * 커서에 가까운 코어 점부터(같으면 선 → 토막 차례). 다듬기 손잡이를 부를 차례와 같다
 */
export function openEdgeCandidates<S extends TrackSegment>(
  f: ViewFrame,
  lines: readonly OpenEdgeLine[],
  segs: readonly S[],
  x: number,
  y: number,
  snapPx: number,
): OpenEdgeCandidate<S>[] {
  const out: OpenEdgeCandidate<S>[] = [];
  if (!lines.length || !segs.length) return out;
  for (let li = 0; li < lines.length; li++) {
    const { from: P, dir } = lines[li]!;
    const e = unitDir([0, 0, 0], dir);
    if (!e || !P.every(Number.isFinite) || cursorOn(f, P, x, y, snapPx)) continue;
    for (const s of segs) {
      const c = lineSegClosest(P, e, s.a, s.b);
      if (!c) continue;
      const tol = meetTol(f, c.m, s.wpp);
      if (!(c.gap > tol) || !(c.gap <= Math.min(OPEN_EDGE_CHORD * dist3(s.a, s.b), snapPx * s.wpp)) || dist3(c.m, P) <= tol) continue;
      // 가장 가까운 자리가 토막 끝 밖이면 그 끝, 나란하면 두 끝을 함께 쓰는 이웃 토막을 선이 3D로 지나는지
      if (c.clamped && throughNeighbor(f, P, e, s, segs, c.parallel ? [s.a, s.b] : [c.t === 0 ? s.a : s.b], tol)) continue;
      // 0.23.0: 받는 점은 선 위·그 토막 범위 안·커서에서 snapPx 안이다 — 선에서 그 범위인 조각이 화면에서 커서 snapPx 밖이면 앱에 묻지 않는다
      const span = segSlabSpan(P, e, s.a, s.b, OPEN_EDGE_CHORD * dist3(s.a, s.b) + 2 * tol);
      const reach = span && segmentReachPx(f, P, e, span, x, y);
      if (reach == null || reach > snapPx) continue;
      // 0.22.0 두 번 지날 수 있는 토막: 선이 현의 직선과 같은 평면에서 토막 밖에서 만나거나 나란하면, 곡선이 선 쪽으로 볼록할 때 활꼴을 두 번 지난다
      // (현 양 끝에서는 선이 활꼴 밖이다 — 활꼴 안을 지나면 들어가고 나오는 두 교차가 있다)
      const twice = c.clamped && (c.parallel || skewGap(P, e, s.a, s.b) <= tol) && lensSide(P, e, s, segs, tol);
      const push = (m: V3, twin: boolean): void => {
        const d = screenDistance(f, m, x, y);
        if (d === null) return;
        const o: OpenEdgeCandidate<S> = { p: m, line: li, seg: s, gap: c.gap, distPx: d, reachPx: reach };
        if (twice) o.twice = true;
        if (twin) o.twin = true;
        out.push(o);
      };
      push(c.m, false);
      // 앱은 힌트(point) 둘레의 교차 하나를 주므로 현의 다른 끝(나란하면 각 끝)에서 선에 내린 발로 한 번 더 묻는다 — 두 교차는 두 끝 발 사이에 있어
      // 각 발에 가까운 쪽이 따로 온다(두 교차의 가운데가 두 발 사이면 늘 그렇다)
      if (twice)
        for (const V of c.parallel ? [s.a, s.b] : [c.t === 0 ? s.b : s.a]) {
          if (!c.parallel && throughNeighbor(f, P, e, s, segs, [V], tol)) continue;
          const m = lineFoot(P, e, V);
          if (dist3(m, P) > tol) push(m, true);
        }
    }
  }
  // 안정 정렬(같은 거리면 넣은 차례 — 선 → 토막, 한 토막에서는 0.20.0 힌트 → 둘째 힌트)
  return out.sort((p, q) => p.distPx - q.distPx);
}

/** 토막 s의 끝 ends(세계 점)를 함께 쓰는 이웃 토막(segs 안)을 선 P + t·e가 3D로 지나는지(0.20.0 열린 교차에서 뺄 때) */
function throughNeighbor<S extends TrackSegment>(f: ViewFrame, P: readonly number[], e: readonly number[], s: S, segs: readonly S[], ends: readonly (readonly number[])[], tol: number): boolean {
  for (const n of segs) {
    if (n === s || !ends.some((V) => dist3(n.a, V) <= tol || dist3(n.b, V) <= tol)) continue;
    const k = closestMid(P, e, n.a, [n.b[0]! - n.a[0]!, n.b[1]! - n.a[1]!, n.b[2]! - n.a[2]!], true);
    if (k && k.gap <= meetTol(f, k.m, n.wpp)) return true;
  }
  return false;
}

/**
 * 같은 평면의 선 P + t·e가 토막 s의 활꼴을 두 번 지날 수 있는 쪽인지(0.22.0 — 두 번 지날 수 있는 토막의 조건).
 * - 현 가운데에서 선까지(현에 수직인 성분) 거리가 OPEN_EDGE_CHORD × 토막 길이 안이다. 활꼴은 가운데쯤이 가장 높고(활꼴 높이 한도 0.1 × 현 길이 — 0.20.0과 같은 근거)
 *   곡선에 거의 닿듯 지나는 선은 그 높은 자리를 지난다. 토막 끝 둘레만 스치는 선(가운데에서 멀다)은 0.20.0처럼 가까운 끝 쪽 교차 하나다
 * - 이웃 토막(segs 안, 끝을 함께 쓰는 것)으로 볼록한 쪽이 드러나면 그쪽이어야 한다. 꺾은선이 곡선을 나눴으면 이웃 토막의 먼 끝은 현의 안쪽(곡선이 휘어 들어가는 쪽)에 있고
 *   활꼴은 그 반대쪽이다. 선 쪽과 같은 쪽에 먼 끝을 둔 이웃만 있으면(선이 곡선 안쪽을 지난다) false. 이웃이 없거나(모른다) 양쪽에 있으면(굽은 방향이 바뀐다) 따지지 않는다
 */
function lensSide<S extends TrackSegment>(P: readonly number[], e: readonly number[], s: S, segs: readonly S[], tol: number): boolean {
  const g = sub3(s.b, s.a);
  const gl = Math.hypot(g[0], g[1], g[2]);
  if (!(gl > 0)) return false;
  const u: V3 = [g[0] / gl, g[1] / gl, g[2] / gl];
  const perp = (w: V3): V3 => {
    const k = dot3(w, u);
    return [w[0] - u[0] * k, w[1] - u[1] * k, w[2] - u[2] * k];
  };
  const M: V3 = [(s.a[0]! + s.b[0]!) / 2, (s.a[1]! + s.b[1]!) / 2, (s.a[2]! + s.b[2]!) / 2];
  const v = perp(sub3(lineFoot(P, e, M), M));
  if (!(Math.hypot(v[0], v[1], v[2]) <= OPEN_EDGE_CHORD * gl + tol)) return false;
  let same = false, other = false;
  for (const n of segs) {
    if (n === s) continue;
    for (const [V, F] of [
      [n.a, n.b],
      [n.b, n.a],
    ] as const) {
      if (!(dist3(V, s.a) <= tol || dist3(V, s.b) <= tol) || dist3(F, s.a) <= tol || dist3(F, s.b) <= tol) continue;
      const w = perp(sub3(F, V));
      const k = dot3(v, w);
      if (k > 0) same = true;
      else if (k < 0) other = true;
    }
  }
  return !(same && !other);
}

/** 점 V에서 선 P + t·e(e는 단위)에 내린 발(e 성분이 0인 좌표는 P 그대로 — lineSegClosest의 토막 끝 자리와 같은 셈) */
function lineFoot(P: readonly number[], e: readonly number[], V: readonly number[]): V3 {
  const s = e[0]! * (V[0]! - P[0]!) + e[1]! * (V[1]! - P[1]!) + e[2]! * (V[2]! - P[2]!);
  return [e[0] === 0 ? P[0]! : P[0]! + e[0]! * s, e[1] === 0 ? P[1]! : P[1]! + e[1]! * s, e[2] === 0 ? P[2]! : P[2]! + e[2]! * s];
}

/**
 * 선 P + s·e(e는 단위)에서 토막 a → b 범위인 조각의 매개변수 [s0, s1](0.23.0 열린 교차의 받는 범위): 그 점을 현에 내린 자리가 토막 안(매개변수 0~1)이고
 * 현의 직선에서 h 안이다(현의 직선 둘레 원기둥과 두 끝 평면 사이). 없으면 null. 나란하거나 수직인 선도 범위가 닫혀 있다(둘 가운데 하나는 늘 묶는다)
 */
function segSlabSpan(P: readonly number[], e: readonly number[], a: readonly number[], b: readonly number[], h: number): [number, number] | null {
  const g = sub3(b, a);
  const C = dot3(g, g);
  if (!(C > 0) || !(h >= 0)) return null;
  const w = sub3(P, a);
  const u0 = dot3(w, g) / C, ue = dot3(e, g) / C;
  let lo = -Infinity, hi = Infinity;
  // 현에 내린 자리 u(s) = u0 + ue·s가 0~1
  if (Math.abs(ue) * Math.sqrt(C) > 1e-12) {
    const s0 = -u0 / ue, s1 = (1 - u0) / ue;
    lo = Math.min(s0, s1);
    hi = Math.max(s0, s1);
  } else if (!(u0 >= 0 && u0 <= 1)) return null;
  // 현의 직선까지 거리 |w⊥ + s·e⊥| ≤ h(⊥ = 현에 수직인 성분)
  const wp: V3 = [w[0] - g[0] * u0, w[1] - g[1] * u0, w[2] - g[2] * u0];
  const ep: V3 = [e[0]! - g[0] * ue, e[1]! - g[1] * ue, e[2]! - g[2] * ue];
  const A = dot3(ep, ep), B = dot3(wp, ep), K = dot3(wp, wp) - h * h;
  if (A > 1e-18) {
    const disc = B * B - A * K;
    if (!(disc >= 0)) return null;
    const r = Math.sqrt(disc);
    lo = Math.max(lo, (-B - r) / A);
    hi = Math.min(hi, (-B + r) / A);
  } else if (K > 0) return null;
  return Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? [lo, hi] : null;
}

/** 선 P + s·e의 조각 [s0, s1]과 커서의 화면 거리(원근에서 눈 뒤로 넘어간 부분은 가까운 면에서 자른다 — 다 눈 뒤면 null) */
function segmentReachPx(f: ViewFrame, P: readonly number[], e: readonly number[], span: readonly [number, number], x: number, y: number): number | null {
  const [s0, s1] = span;
  const h = segmentScreenPick(f, P[0]! + e[0]! * s0, P[1]! + e[1]! * s0, P[2]! + e[2]! * s0, P[0]! + e[0]! * s1, P[1]! + e[1]! * s1, P[2]! + e[2]! * s1, x, y);
  return h && Number.isFinite(h.distPx) ? h.distPx : null;
}

/** 선 P + t·e와 a, b를 지나는 직선 사이 거리(엇갈린 두 직선 — 나란하면 Infinity) */
function skewGap(P: readonly number[], e: readonly number[], a: readonly number[], b: readonly number[]): number {
  const g0 = b[0]! - a[0]!, g1 = b[1]! - a[1]!, g2 = b[2]! - a[2]!;
  const n0 = e[1]! * g2 - e[2]! * g1, n1 = e[2]! * g0 - e[0]! * g2, n2 = e[0]! * g1 - e[1]! * g0;
  const nn = Math.hypot(n0, n1, n2);
  if (!(nn > 0)) return Infinity;
  return Math.abs((a[0]! - P[0]!) * n0 + (a[1]! - P[1]!) * n1 + (a[2]! - P[2]!) * n2) / nn;
}

/**
 * 선과 꺾은선 토막의 열린 교차(0.20.0, 순수): openEdgeCandidates의 후보마다(커서에 가까운 코어 점부터) refine(후보)을 불러 곡선과의 정확한 교차 q를 받고,
 * 받을 수 있는 것 가운데 커서에 가장 가까운 것. refine이 null·undefined(모른다, 부르는 쪽 호출 한도가 다 됐다)거나 수 셋이 아니면 그 후보는 없다.
 * 받는 규칙:
 * - q를 선 위로 수직으로 내린 자리 p(acceptOnLine — q에서 그 깊이 화면 반 화소 안, 눈 뒤·가까운 면 앞이 아님). 세계 축이면 남은 두 좌표가 지나는 점 그대로
 * - p가 그 토막의 곡선 조각 위일 만한 자리: 현에 내린 자리가 토막 범위 안(이웃 토막의 곡선 위 점이면 범위 밖이다 — 그 토막이 맡는다)이고 토막 끝에서 반 화소 넘게 떨어지고,
 *   현에서 OPEN_EDGE_CHORD × 토막 길이 안. 선이 지나는 점 자리가 아니다
 * - 그 토막 묶음의 단면에서 남는 쪽(seg.keep), 커서에서 snapPx 안, visible(p, seg)(지금 고른 것보다 가까운 후보에만 묻는다 — 뷰어는 음영 계열의 면 가림)
 * 코어 점 그대로를 돌려줘도 받는다(곡선 평면을 수직으로 뚫는 축은 코어 점이 곧 교차다 — 모르면 null을 돌려준다).
 * 0.23.0: "코어 점에서 snapPx 안"(0.20.0)은 보지 않는다. 같은 평면에서 현과 거의 나란히 활꼴을 지나는 선은 코어 점이 현 끝(꼭짓점) 위라
 * 그 둘레에서는 끝점 붙잡기가 먼저 이기고, 토막 범위 판정이 앱 점을 그 토막 곡선 조각으로 이미 묶는다(0.22.0은 두 번 지날 수 있는 토막에서만 그렇게 받았다).
 * 받는 점은 커서에서 후보의 reachPx보다 가까울 수 없으므로 reachPx가 지금 고른 거리 이상인 후보는 부르지 않는다
 */
export function openEdgeSnap<S extends TrackSegment>(
  f: ViewFrame,
  lines: readonly OpenEdgeLine[],
  segs: readonly S[],
  x: number,
  y: number,
  snapPx: number,
  refine: (c: OpenEdgeCandidate<S>) => readonly number[] | null | undefined,
  visible?: ((p: V3, seg: S) => boolean) | null,
): OpenEdgeSnap<S> | null {
  let best: OpenEdgeSnap<S> | null = null;
  for (const c of openEdgeCandidates(f, lines, segs, x, y, snapPx)) {
    // 받는 점은 커서에서 reachPx보다 가깝지 않다(코어 점 거리 차례라 끝내지 않고 건너뛴다)
    if (best && c.reachPx >= best.distPx) continue;
    const q = finitePoint(refine(c));
    if (!q) continue;
    const L = lines[c.line]!;
    const p = acceptOnLine(f, c.p, q, { origin: L.from, dir: L.dir }, Infinity);
    if (!p) continue;
    const s = c.seg;
    const tol = meetTol(f, p, s.wpp);
    const g0 = s.b[0]! - s.a[0]!, g1 = s.b[1]! - s.a[1]!, g2 = s.b[2]! - s.a[2]!;
    const C = g0 * g0 + g1 * g1 + g2 * g2;
    const u = ((p[0] - s.a[0]!) * g0 + (p[1] - s.a[1]!) * g1 + (p[2] - s.a[2]!) * g2) / C;
    if (!(u >= 0 && u <= 1) || dist3(p, s.a) <= tol || dist3(p, s.b) <= tol || dist3(p, L.from) <= tol) continue;
    const off = Math.hypot(p[0] - s.a[0]! - g0 * u, p[1] - s.a[1]! - g1 * u, p[2] - s.a[2]! - g2 * u);
    if (!(off <= OPEN_EDGE_CHORD * Math.sqrt(C) + tol) || (s.keep && !s.keep(p))) continue;
    const dist = screenDistance(f, p, x, y);
    if (dist === null || dist > snapPx || (best && dist >= best.distPx)) continue;
    if (visible && !visible(p, s)) continue;
    best = { p, core: c.p, line: c.line, seg: s, distPx: dist };
  }
  return best;
}

/**
 * 열린 면 교차의 삼각형 변 길이 비(0.22.0 — 0.15.0 OPEN_INTERSECTION_CHORD·0.20.0 OPEN_EDGE_CHORD·0.21.0 ON_FACE_CHORD와 같은 값 0.1):
 * 곡면을 나눈 삼각형의 한 변이 45°보다 덜 도는 나눔이면 곡면과 그 삼각형 사이(활꼴 높이)는 가장 긴 변 길이의 0.1배 안이다.
 * 곡면과 만나는 선이 삼각형을 비켜 가면 그 사이를 지나므로 삼각형에서 이만큼 안을 지나고, 곡면 위 교차점도 삼각형에서 이만큼 안이다
 */
export const OPEN_FACE_CHORD = OPEN_INTERSECTION_CHORD;

/** 열린 면 교차가 보는 삼각형(0.22.0): 세계 꼭짓점 셋, 커서 쪽 깊이에서 한 화소의 세계 길이, 단면에서 남는 쪽 판정(뷰어는 그물 id·삼각형 번호·법선을 더 싣는다) */
export interface TrackTriangle {
  corners: readonly (readonly number[])[];
  wpp: number;
  keep?: (p: readonly number[]) => boolean;
}

/**
 * 선과 삼각형의 열린 교차 후보(0.22.0 openFaceCandidates): 코어 점(선 위에서 삼각형 무게중심에 가장 가까운 점 — 세계 축이면 남은 두 좌표가 지나는 점 그대로),
 * 받은 lines 안 번호, 삼각형(받은 tris의 그 객체), 선과 삼각형 사이 가장 가까운 거리(세계), 커서와 코어 점의 화면 거리.
 * 0.23.0: reachPx = 선에서 그 삼각형 위 곡면 조각 자리(삼각형 평면에 내린 발이 삼각형 안, 평면에서 OPEN_FACE_CHORD × 가장 긴 변 안)인 조각과 커서의 화면 거리.
 * 받는 점은 그 조각 위이므로 커서에서 이보다 가까울 수 없다.
 * 0.24.0: 선이 그 삼각형 위 곡면 조각을 두 번 지날 수 있으면(선이 곡면에 접하는 방향이 그 삼각형 안에 있다) 그 선·삼각형의 후보 모두 twice = true,
 * 그 가운데 더한 둘째 힌트면 twin = true(아니면 이 필드들이 없다) — twin의 p는 선에서 그 조각 자리인 조각(reachPx의 조각)의 한 끝이다
 */
export interface OpenFaceCandidate<T extends TrackTriangle = TrackTriangle> {
  p: V3;
  line: number;
  tri: T;
  gap: number;
  distPx: number;
  reachPx: number;
  twice?: true;
  twin?: true;
}

/** 열린 면 교차 결과(0.22.0 openFaceSnap): 받은 점(선 위로 내린 자리), 그 후보의 코어 점·선 번호·삼각형, 커서와 받은 점의 화면 거리 */
export interface OpenFaceSnap<T extends TrackTriangle = TrackTriangle> {
  p: V3;
  core: V3;
  line: number;
  tri: T;
  distPx: number;
}

const sub3 = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot3 = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross3 = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** 삼각형 평면 위 점 q의 무게중심 좌표(꼭짓점 A·B·C 차례). 넓이 0이면 null */
function barycentric(q: readonly number[], A: readonly number[], B: readonly number[], C: readonly number[]): [number, number, number] | null {
  const u = sub3(B, A), v = sub3(C, A), w = sub3(q, A);
  const d00 = dot3(u, u), d01 = dot3(u, v), d11 = dot3(v, v), d20 = dot3(w, u), d21 = dot3(w, v);
  const den = d00 * d11 - d01 * d01;
  if (!(den > 1e-30 * d00 * d11) || !(den > 0)) return null;
  const b = (d11 * d20 - d01 * d21) / den, c = (d00 * d21 - d01 * d20) / den;
  return [1 - b - c, b, c];
}

/** 삼각형의 가장 긴 변 길이 */
function longestEdge(c: readonly (readonly number[])[]): number {
  return Math.max(dist3(c[0]!, c[1]!), dist3(c[1]!, c[2]!), dist3(c[2]!, c[0]!));
}

/**
 * 선 P + s·e(e는 단위)와 삼각형 A·B·C(채운 면) 사이에서 가장 가까운 자리: 선 위 점 m(e 성분이 0인 좌표는 P 그대로), 둘 사이 거리, 삼각형 쪽 가장 가까운 것
 * (변이면 두 꼭짓점, 꼭짓점이면 하나). 선이 삼각형을 뚫으면 거리 0(m = 뚫는 점, near 없음). 넓이 0인 삼각형이면 null.
 * 뚫지 않으면 가장 가까운 자리는 테두리(세 변)에 있다 — 면 안쪽 점이 가장 가깝다면 선을 따라 면 쪽으로 옮겨 더 가까워지거나(평면을 뚫는 선) 테두리도 같은 거리다(나란한 선)
 */
function lineTriClosest(P: readonly number[], e: readonly number[], c: readonly (readonly number[])[]): { m: V3; gap: number; near: readonly (readonly number[])[] } | null {
  const A = c[0]!, B = c[1]!, C = c[2]!;
  const n = cross3(sub3(B, A), sub3(C, A));
  const nn = Math.hypot(n[0], n[1], n[2]);
  if (!(nn > 0)) return null;
  const den = dot3(n, e);
  if (Math.abs(den) > 1e-12 * nn) {
    const t = dot3(n, sub3(A, P)) / den;
    const m: V3 = [e[0] === 0 ? P[0]! : P[0]! + e[0]! * t, e[1] === 0 ? P[1]! : P[1]! + e[1]! * t, e[2] === 0 ? P[2]! : P[2]! + e[2]! * t];
    const w = barycentric(m, A, B, C);
    if (w && w[0] >= 0 && w[1] >= 0 && w[2] >= 0) return { m, gap: 0, near: [] };
  }
  let best: { m: V3; gap: number; near: readonly (readonly number[])[] } | null = null;
  for (let k = 0; k < 3; k++) {
    const a = c[k]!, b = c[(k + 1) % 3]!;
    const r = lineSegClosest(P, e, a, b);
    if (!r || (best && r.gap >= best.gap)) continue;
    best = { m: r.m, gap: r.gap, near: r.parallel || (r.t > 0 && r.t < 1) ? [a, b] : [r.t === 0 ? a : b] };
  }
  return best;
}

/**
 * 선과 삼각형의 열린 교차 후보(0.22.0, 순수): 선 lines(지나는 점 from·방향 dir — 0.20.0 OpenEdgeLine)가 삼각형 tris(커서 둘레 그물 면 — 뷰어는 화면에서 커서
 * 붙잡기 거리 안의 삼각형)를 뚫지 않지만(가장 가까운 거리가 그 깊이의 화면 반 화소를 넘는다 — 뚫으면 axisFaceSnap·lockFaceSnap이 맡는다) 그 삼각형과 곡면 사이를
 * 지날 만큼 가까운 것. 곡면이 삼각형 밖으로 볼록해 선이 곡면만 뚫고 삼각형은 비켜 가는 자리다(구를 스치듯 지나는 축 — 실루엣 둘레 등)
 * - 가까움: 선과 삼각형 사이 거리가 min(OPEN_FACE_CHORD × 가장 긴 변, 커서 쪽 깊이에서 붙잡기 거리 snapPx의 세계 길이) 안(0.20.0 OPEN_EDGE_CHORD와 같은 근거)
 * - 코어 점(앱에 넘기는 힌트)은 선 위에서 그 삼각형 무게중심에 가장 가까운 점이다. 선이 삼각형을 비켜 가면 가장 가까운 자리는 늘 이웃과 함께 쓰는 테두리라
 *   그 자리로는 이 삼각형 위 교차와 이웃 삼각형 위 교차를 가르지 못한다(구를 스치는 선은 곡면을 두 번 뚫는다). 무게중심 쪽 자리면 앱이 힌트 둘레 교차 하나를 줄 때
 *   이 삼각형 위 교차가 온다. 커서와 상관없이 선과 삼각형으로만 정해진다(앱 결과를 기억할 수 있게)
 * - 빼는 것: 선 위에서 삼각형에 가장 가까운 점이 선이 지나는 점 자리인 것(첫 점이 곡면 위면 그 점에서 만난다), 커서가 지나는 점의 화면 자리 snapPx 안인 선,
 *   가장 가까운 자리가 삼각형의 변(꼭짓점)인데 그 변(꼭짓점)을 함께 쓰는 이웃 삼각형(tris 안)을 선이 뚫고, 그 뚫는 자리에서 곡면 위 교차까지가 붙잡기 거리 안인 것
 *   (선을 따라 OPEN_FACE_CHORD × 이웃의 가장 긴 변 ÷ 이웃 평면과 선 사잇각의 사인 — 그 안이면 이웃의 코어 교차와 0.19.0 다듬기가 맡는다. 비스듬히 스치는 선은
 *   그물을 뚫는 자리와 곡면을 뚫는 자리가 몇 삼각형 떨어질 수 있어 남긴다), 코어 점이 화면에 투영되지 않는 것(눈 뒤),
 *   0.23.0: 선에서 그 삼각형 위 곡면 조각 자리인 조각(reachPx)이 화면에서 커서 snapPx 밖인 것(받는 점은 그 조각 위·커서에서 snapPx 안이어야 한다 — 0.20.0 열린 교차와 같은 근거)
 * - 0.24.0 두 번 지날 수 있는 삼각형(twice — faceTwice): 매끈한 이웃(tris 안, 변을 함께 쓰고 법선 사잇각 45° 안)과 사이의 변 법선·그 삼각형 법선이 선 방향과 이루는
 *   내적이 양·음 모두 있고(곡면이 선과 나란해지는 자리가 그 삼각형을 지난다) 선이 이웃의 먼 꼭짓점 쪽(곡면 안쪽)만이 아니면, 선에서 그 조각 자리인 조각의
 *   두 끝(reachPx의 조각 [s0, s1])을 같은 선·삼각형의 둘째 힌트(twin)로 더한다. 두 교차는 그 조각 안이라 각 끝에 가까운 쪽이 따로 온다(0.22.0 선분의 둘째 힌트와 같은 틀).
 *   앞의 후보(무게중심 쪽 힌트)는 0.22.0 그대로다. 이웃은 tris와 around(t)(주면 — 뷰어는 커서에서 먼 이웃을 그 변 가운데 화면 자리에서 모은다)에서 찾는다
 * 커서에 가까운 코어 점부터(같으면 선 → 삼각형 차례). 다듬기 손잡이를 부를 차례와 같다
 */
export function openFaceCandidates<T extends TrackTriangle>(
  f: ViewFrame,
  lines: readonly OpenEdgeLine[],
  tris: readonly T[],
  x: number,
  y: number,
  snapPx: number,
  around?: ((t: T) => readonly TrackTriangle[]) | null,
): OpenFaceCandidate<T>[] {
  const out: OpenFaceCandidate<T>[] = [];
  if (!lines.length || !tris.length) return out;
  for (let li = 0; li < lines.length; li++) {
    const { from: P, dir } = lines[li]!;
    const e = unitDir([0, 0, 0], dir);
    if (!e || !P.every(Number.isFinite) || cursorOn(f, P, x, y, snapPx)) continue;
    for (const t of tris) {
      if (t.corners.length < 3) continue;
      const c = lineTriClosest(P, e, t.corners);
      if (!c) continue;
      const tol = meetTol(f, c.m, t.wpp);
      if (!(c.gap > tol) || !(c.gap <= Math.min(OPEN_FACE_CHORD * longestEdge(t.corners), snapPx * t.wpp)) || dist3(c.m, P) <= tol) continue;
      let through = false;
      for (const n of tris) {
        if (n === t || n.corners.length < 3 || !c.near.every((V) => n.corners.some((W) => dist3(V, W) <= tol))) continue;
        const k = lineTriClosest(P, e, n.corners);
        if (!k || !(k.gap <= meetTol(f, k.m, n.wpp))) continue;
        // 이웃을 뚫는 자리에서 곡면 위 교차까지(선을 따라 처짐 한도 ÷ 사잇각 사인 안)가 붙잡기 거리 안이면 그 이웃의 코어 교차(0.19.0 다듬기)가 맡는다.
        // 비스듬히 스치는 선은 그보다 멀리서 곡면을 뚫을 수 있어 빼지 않는다
        const nv = cross3(sub3(n.corners[1]!, n.corners[0]!), sub3(n.corners[2]!, n.corners[0]!));
        const sin = Math.abs(dot3(nv, e)) / Math.hypot(nv[0], nv[1], nv[2]);
        if (OPEN_FACE_CHORD * longestEdge(n.corners) <= sin * snapPx * n.wpp) {
          through = true;
          break;
        }
      }
      if (through) continue;
      // 0.23.0: 받는 점은 선 위·그 삼각형 위 곡면 조각 자리·커서에서 snapPx 안이다 — 선에서 그 자리인 조각이 화면에서 커서 snapPx 밖이면 앱에 묻지 않는다
      const span = triPrismSpan(P, e, t.corners, OPEN_FACE_CHORD * longestEdge(t.corners) + 2 * tol, 2 * tol);
      const reach = span && segmentReachPx(f, P, e, span, x, y);
      if (reach == null || reach > snapPx) continue;
      const [A, B, C] = t.corners as [readonly number[], readonly number[], readonly number[]];
      const m = lineFoot(P, e, [(A[0]! + B[0]! + C[0]!) / 3, (A[1]! + B[1]! + C[1]!) / 3, (A[2]! + B[2]! + C[2]!) / 3]);
      const d = screenDistance(f, m, x, y);
      if (d === null) continue;
      // 0.24.0 두 번 지날 수 있는 삼각형: 선이 곡면에 접하는 방향이 그 삼각형 안이면(변 법선과 선 방향의 내적이 부호를 바꾼다) 곡면 조각을 들어가고 나오는 두 교차가 있을 수 있다.
      // 변 법선은 매끈한 이웃과 45° 안이라 그 삼각형 법선에서 22.5° 안이다 — 선이 그보다 가파르면 이웃을 찾지 않는다
      const twice = Math.abs(dot3(triNormal(t.corners), e)) < TANGENT_STEEP && faceTwice(e, t, around ? [...tris, ...around(t)] : tris, m, tol);
      const o: OpenFaceCandidate<T> = { p: m, line: li, tri: t, gap: c.gap, distPx: d, reachPx: reach };
      if (twice) o.twice = true;
      out.push(o);
      // 앱은 힌트(point) 둘레의 교차 하나를 주므로 선에서 그 조각 자리인 조각의 두 끝으로 한 번씩 더 묻는다 — 두 교차는 그 조각 안이라
      // 각 끝에 가까운 쪽이 따로 온다(0.22.0 선분의 둘째 힌트 — 현 끝의 발 — 와 같은 틀). 무게중심 쪽 힌트(0.22.0)는 그대로다.
      // 힌트는 커서와 상관없이 선과 삼각형으로만 정한다(앱 결과를 기억한다) — 화소 허용치 없이 삼각형 그대로·평면에서 OPEN_FACE_CHORD × 가장 긴 변 안인 조각
      const hs = twice ? triPrismSpan(P, e, t.corners, OPEN_FACE_CHORD * longestEdge(t.corners), 0) : null;
      if (hs)
        for (const s of hs) {
          const q: V3 = [e[0] === 0 ? P[0]! : P[0]! + e[0]! * s, e[1] === 0 ? P[1]! : P[1]! + e[1]! * s, e[2] === 0 ? P[2]! : P[2]! + e[2]! * s];
          if (dist3(q, P) <= tol || dist3(q, m) <= tol) continue;
          const dq = screenDistance(f, q, x, y);
          if (dq !== null) out.push({ p: q, line: li, tri: t, gap: c.gap, distPx: dq, reachPx: reach, twice: true, twin: true });
        }
    }
  }
  // 안정 정렬(같은 거리면 넣은 차례 — 선 → 삼각형, 한 삼각형에서는 0.22.0 힌트 → 둘째 힌트)
  return out.sort((p, q) => p.distPx - q.distPx);
}

/** 이웃 삼각형을 곡면을 나눈 같은 면으로 볼 법선 사잇각의 코사인(45° — OPEN_FACE_CHORD의 "한 변이 45°보다 덜 도는 나눔"과 같은 근거) */
const SMOOTH_COS = Math.SQRT1_2;
/** 변 법선과 선 방향의 내적을 0으로 볼 허용치(단위 벡터 — float32 좌표의 반올림보다 크게) */
const TANGENT_EPS = 1e-5;
/** 삼각형 법선과 선 방향의 내적이 이보다 크면(sin 22.5° — 변 법선이 닿을 수 있는 기울기 밖) 접하는 방향이 그 삼각형 안일 수 없다 */
const TANGENT_STEEP = Math.sin(Math.PI / 8);

/** 삼각형 단위 법선(넓이 0이면 [0, 0, 0]) */
function triNormal(c: readonly (readonly number[])[]): V3 {
  const n = cross3(sub3(c[1]!, c[0]!), sub3(c[2]!, c[0]!));
  const l = Math.hypot(n[0], n[1], n[2]);
  return l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : [0, 0, 0];
}

/**
 * 방향 e(단위)인 선(힌트 m을 지난다)이 삼각형 t 위 곡면 조각을 두 번 지날 수 있는지(0.24.0 — 면의 열린 교차 둘째 힌트의 조건, 0.22.0 선분 lensSide와 같은 몫).
 * - 접하는 방향이 그 삼각형 안: t와 변을 함께 쓰는 매끈한 이웃(tris 안, 법선 사잇각 45° 안)마다 변 법선(두 면 법선의 합 — 그 변 둘레 곡면 법선)을 두고,
 *   t 법선과 그 변 법선들이 선 방향과 이루는 내적이 양·음 모두 있어야 한다(곡면이 선과 나란해지는 자리가 그 삼각형을 지난다 — 볼록한 곡면을 얕게 스치는 선의
 *   두 교차 가운데쯤). 한쪽 부호뿐이면 선이 곡면을 한 번 지나거나 두 교차가 이웃 삼각형에 나뉜다(구의 적도를 스치는 축 — 적도 변 법선은 축과 수직이다).
 *   변 법선만 쓰므로 모은 삼각형이 그 꼭짓점 둘레를 다 덮지 않아도 흔들리지 않는다. 매끈한 이웃이 없으면(모른다) false
 * - 선이 볼록한 쪽: 매끈한 이웃의 먼 꼭짓점은 곡면이 휘어 들어가는 쪽이고 곡면 조각은 그 반대쪽이다. 선(힌트 m)이 그 먼 꼭짓점들과 같은 쪽뿐이면 false
 */
function faceTwice(e: readonly number[], t: TrackTriangle, tris: readonly TrackTriangle[], m: readonly number[], tol: number): boolean {
  const [A, B, C] = t.corners as [readonly number[], readonly number[], readonly number[]];
  const unitNormal = (c: readonly (readonly number[])[]): V3 | null => {
    const n = cross3(sub3(c[1]!, c[0]!), sub3(c[2]!, c[0]!));
    const l = Math.hypot(n[0], n[1], n[2]);
    return l > 0 ? [n[0] / l, n[1] / l, n[2] / l] : null;
  };
  const nt = unitNormal(t.corners);
  if (!nt) return false;
  const dots = [dot3(nt, e)];
  const side = dot3(nt, sub3(m, A));
  let same = false, other = false;
  for (let k = 0; k < 3; k++) {
    const a = [A, B, C][k]!, b = [A, B, C][(k + 1) % 3]!;
    for (const nb of tris) {
      if (nb === t || nb.corners.length < 3) continue;
      const ia = nb.corners.findIndex((W) => dist3(W, a) <= tol), ib = nb.corners.findIndex((W) => dist3(W, b) <= tol);
      if (ia < 0 || ib < 0 || ia === ib) continue;
      let nn = unitNormal(nb.corners);
      if (!nn) continue;
      const cos = dot3(nn, nt);
      if (Math.abs(cos) < SMOOTH_COS) continue;
      if (cos < 0) nn = [-nn[0], -nn[1], -nn[2]];
      const s: V3 = [nt[0] + nn[0], nt[1] + nn[1], nt[2] + nn[2]];
      const sl = Math.hypot(s[0], s[1], s[2]);
      if (sl > 0) dots.push(dot3(s, e) / sl);
      // 먼 꼭짓점(그 변에 없는 꼭짓점)이 t 평면의 어느 쪽인지
      const far = nb.corners.find((_, i) => i !== ia && i !== ib)!;
      const k2 = dot3(nt, sub3(far, A));
      if (Math.abs(k2) > tol && Math.abs(side) > tol) {
        if (k2 * side > 0) same = true;
        else other = true;
      }
    }
  }
  if (dots.length < 2 || (same && !other)) return false;
  return Math.max(...dots) > TANGENT_EPS && Math.min(...dots) < -TANGENT_EPS;
}

/**
 * 선과 삼각형의 열린 교차(0.22.0, 순수): openFaceCandidates의 후보마다(커서에 가까운 코어 점부터) refine(후보)을 불러 곡면과의 정확한 교차 q를 받고,
 * 받을 수 있는 것 가운데 커서에 가장 가까운 것. refine이 null·undefined(모른다, 부르는 쪽 호출 한도가 다 됐다)거나 수 셋이 아니면 그 후보는 없다.
 * 받는 규칙(0.20.0 openEdgeSnap과 같은 틀 — 토막 대신 삼각형):
 * - q를 선 위로 수직으로 내린 자리 p(acceptOnLine — q에서 그 깊이 화면 반 화소 안, 눈 뒤·가까운 면 앞이 아님). 세계 축이면 남은 두 좌표가 지나는 점 그대로
 * - p가 그 삼각형 위 곡면 조각 위일 만한 자리: 삼각형 평면에 내린 발이 삼각형 안(반 화소 허용 — 이웃 삼각형 위 곡면 점이면 밖이다, 그 삼각형이 맡는다)이고
 *   평면에서 OPEN_FACE_CHORD × 가장 긴 변 안(앞뒤 어느 쪽이든 — 볼록·오목). 선이 지나는 점 자리가 아니다.
 *   0.20.0의 "코어 점에서 붙잡기 거리 안"은 두지 않는다 — 삼각형 위 조각 자리라는 판정이 앱 점을 그 삼각형 둘레로 이미 묶고, 코어 점(무게중심 쪽)은 큰 삼각형이면
 *   그 삼각형 위 교차에서 붙잡기 거리보다 멀 수 있다
 * - 그 삼각형 그물의 단면에서 남는 쪽(tri.keep), 커서에서 snapPx 안, visible(p, tri)(지금 고른 것보다 가까운 후보에만 묻는다 — 뷰어는 음영 계열의 면 가림)
 * 코어 점 거리로는 자를 수 없다(부르는 쪽 호출 한도·기억이 횟수를 묶는다). 0.23.0: 받는 점은 커서에서 후보의 reachPx보다 가까울 수 없으므로
 * reachPx가 지금 고른 거리 이상인 후보는 부르지 않는다
 */
export function openFaceSnap<T extends TrackTriangle>(
  f: ViewFrame,
  lines: readonly OpenEdgeLine[],
  tris: readonly T[],
  x: number,
  y: number,
  snapPx: number,
  refine: (c: OpenFaceCandidate<T>) => readonly number[] | null | undefined,
  visible?: ((p: V3, tri: T) => boolean) | null,
  around?: ((t: T) => readonly TrackTriangle[]) | null,
): OpenFaceSnap<T> | null {
  let best: OpenFaceSnap<T> | null = null;
  for (const c of openFaceCandidates(f, lines, tris, x, y, snapPx, around)) {
    if (best && c.reachPx >= best.distPx) continue;
    const q = finitePoint(refine(c));
    if (!q) continue;
    const L = lines[c.line]!;
    const p = acceptOnLine(f, c.p, q, { origin: L.from, dir: L.dir }, Infinity);
    if (!p) continue;
    const t = c.tri;
    const [A, B, C] = t.corners as [readonly number[], readonly number[], readonly number[]];
    const tol = meetTol(f, p, t.wpp);
    const n = cross3(sub3(B, A), sub3(C, A));
    const nn = Math.hypot(n[0], n[1], n[2]);
    const h = dot3(n, sub3(p, A)) / nn;
    const foot: V3 = [p[0] - (n[0] / nn) * h, p[1] - (n[1] / nn) * h, p[2] - (n[2] / nn) * h];
    if (!(Math.abs(h) <= OPEN_FACE_CHORD * longestEdge(t.corners) + tol) || !(triGap(foot, t.corners) <= tol) || dist3(p, L.from) <= tol || (t.keep && !t.keep(p))) continue;
    const dist = screenDistance(f, p, x, y);
    if (dist === null || dist > snapPx || (best && dist >= best.distPx)) continue;
    if (visible && !visible(p, t)) continue;
    best = { p, core: c.p, line: c.line, tri: t, distPx: dist };
  }
  return best;
}

/**
 * 선 P + s·e(e는 단위)에서 삼각형 c 위 곡면 조각 자리인 조각의 매개변수 [s0, s1](0.23.0 열린 면 교차의 받는 범위): 삼각형 평면에 내린 발이 세 변을 바깥으로 grow만큼
 * 민 삼각형 안이고(openFaceSnap의 "발이 삼각형에서 반 화소 안"을 품는다) 평면에서 h 안이다(세 변의 수직 평면과 두 덮개 평면 사이 — 볼록한 기둥을 선으로 자른다).
 * 없거나 넓이 0이면 null
 */
function triPrismSpan(P: readonly number[], e: readonly number[], c: readonly (readonly number[])[], h: number, grow: number): [number, number] | null {
  const A = c[0]!, B = c[1]!, C = c[2]!;
  const n = cross3(sub3(B, A), sub3(C, A));
  const nn = Math.hypot(n[0], n[1], n[2]);
  if (!(nn > 0)) return null;
  const u: V3 = [n[0] / nn, n[1] / nn, n[2] / nn];
  let lo = -Infinity, hi = Infinity;
  // α + β·s ≥ 0 꼴의 반공간으로 [lo, hi]를 줄인다(β가 0이면 α로 판정)
  const clip = (alpha: number, beta: number): boolean => {
    if (Math.abs(beta) <= 1e-15) return alpha >= 0;
    const s = -alpha / beta;
    if (beta > 0) lo = Math.max(lo, s);
    else hi = Math.min(hi, s);
    return lo <= hi;
  };
  const hp = dot3(u, sub3(P, A)), he = dot3(u, e);
  if (!clip(h - hp, -he) || !clip(h + hp, he)) return null;
  for (let k = 0; k < 3; k++) {
    const a = c[k]!, b = c[(k + 1) % 3]!, o = c[(k + 2) % 3]!;
    // 변 a → b의 안쪽 수직(삼각형 평면 안, 셋째 꼭짓점 쪽 단위 벡터)
    let m = cross3(u, sub3(b, a));
    const ml = Math.hypot(m[0], m[1], m[2]);
    if (!(ml > 0)) return null;
    m = [m[0] / ml, m[1] / ml, m[2] / ml];
    if (dot3(m, sub3(o, a)) < 0) m = [-m[0], -m[1], -m[2]];
    if (!clip(dot3(m, sub3(P, a)) + grow, dot3(m, e))) return null;
  }
  return Number.isFinite(lo) && Number.isFinite(hi) && lo <= hi ? [lo, hi] : null;
}

/**
 * 열린 면 교차의 앱 점 p가 그 삼각형 tri 둘레 조각에만 가렸는지(0.23.0 — 곡면이 오목하게 보이는 자리, 구멍 안쪽 벽): 곡면이 눈에서 보아 오목하면
 * 곡면은 그 삼각형 뒤에 있어 앱 점이 그 삼각형(과 이웃)에 가린다. p 화면 자리의 광선이 처음 맞은 면 hit(세계 꼭짓점 셋·맞은 점·법선)이 tri이거나
 * tri와 꼭짓점을 함께 쓰는 이웃이고, p가 그 면에서 OPEN_FACE_CHORD × 두 삼각형 가운데 가장 긴 변 + tol 안(면 뒤)이면 true —
 * 그 조각이 곧 p가 놓인 곡면을 나눈 것이므로 보이는 것으로 본다. 다른 면(앞의 다른 벽 등)에 맞았거나 그보다 멀리 뒤면 false
 */
export function hiddenByOwnPatch(
  tri: readonly (readonly number[])[],
  hit: { corners: readonly (readonly number[])[]; point: readonly number[]; normal: readonly number[] },
  p: readonly number[],
  tol: number,
): boolean {
  if (tri.length < 3 || hit.corners.length < 3) return false;
  const L = Math.max(longestEdge(tri), longestEdge(hit.corners));
  let mag = 0;
  for (const c of [...tri, ...hit.corners]) mag = Math.max(mag, Math.abs(c[0]!), Math.abs(c[1]!), Math.abs(c[2]!));
  const eps = 1e-6 * L + 1e-9 * (1 + mag);
  if (!hit.corners.some((c) => tri.some((q) => dist3(c, q) <= eps))) return false;
  const n = hit.normal;
  const nl = Math.hypot(n[0]!, n[1]!, n[2]!);
  if (!(nl > 0)) return false;
  const h = Math.abs(dot3(sub3(p, hit.point), n)) / nl;
  return h <= OPEN_FACE_CHORD * L + tol;
}

/** 삼각형 평면 위 점 q에서 삼각형(채운 면)까지 거리(안이면 0) */
function triGap(q: readonly number[], c: readonly (readonly number[])[]): number {
  const w = barycentric(q, c[0]!, c[1]!, c[2]!);
  if (!w) return Infinity;
  if (w[0] >= 0 && w[1] >= 0 && w[2] >= 0) return 0;
  let d = Infinity;
  for (let k = 0; k < 3; k++) {
    const a = c[k]!, b = c[(k + 1) % 3]!;
    const g = sub3(b, a);
    const gg = dot3(g, g);
    let s = gg > 0 ? dot3(sub3(q, a), g) / gg : 0;
    s = s < 0 ? 0 : s > 1 ? 1 : s;
    d = Math.min(d, Math.hypot(q[0]! - a[0]! - g[0] * s, q[1]! - a[1]! - g[1] * s, q[2]! - a[2]! - g[2] * s));
  }
  return d;
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

/** 끌어온 점에서의 방향 안내 종류(0.26.0): 'parallel' = 기준 선분과 나란함, 'perpendicular' = 기준 선분에 수직 */
export type TrackDirKind = 'parallel' | 'perpendicular';

/** 끌어온 점을 지나는 방향 안내 하나(0.26.0): 종류와 단위 방향 */
export interface TrackDirGuide {
  kind: TrackDirKind;
  dir: V3;
}

/** 끌어온 점에서 방향 안내 위 점(0.26.0 trackDirSnap): 찍을 점, 끌어온 점(복사본), 안내 종류·단위 방향, 커서와의 화면 거리 */
export interface TrackDirSnap {
  p: V3;
  from: V3;
  kind: TrackDirKind;
  dir: V3;
  distPx: number;
}

/** 두 단위 방향이 같은 선(나란하거나 반대)인지 — 사잇각 약 0.08° 안(axisAligned와 같은 문턱) */
const sameLine = (a: readonly number[], b: readonly number[]): boolean => Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) >= 1 - 1e-6;

/**
 * 끌어온 점 P에서 기준 선분 seg(커서가 앞서 지나간 모서리 — 0.10.0 나란함의 기준과 같다)에 대한 방향 안내(0.26.0, 순수):
 * - 나란함: 선분 방향 e(첫 끝점 → 둘째 끝점)
 * - 수직: 수직인 방향은 평면 하나(e에 수직)라 쓸 만한 방향만 — (1) P에서 선분 직선으로 내린 수직(P가 그 직선 위가 아니면),
 *   (2) 축(세계 X·Y·Z 또는 앱 axes)을 그 평면에 비친 방향(축이 e와 나란하면 뺀다). 평면도에서 기운 벽에 수평으로 수직, 기운 서까래에는 그 세로 평면 안에서 수직
 * 축과 같은 선인 안내는 뺀다(끌어온 축 trackAxisSnap이 맡는다). 앞 안내와 같은 선이면 뺀다. 차례는 나란함 → 내린 수직 → 비친 축(X·Y·Z).
 * 선분 길이가 0이거나 수가 아니면 빈 목록
 */
export function trackDirGuides(P: readonly number[], seg: readonly [readonly number[], readonly number[]], axes?: TrackAxes | null): TrackDirGuide[] {
  const e = unitDir(seg[0], seg[1]);
  if (!e || !finitePoint(P)) return [];
  const dirs = axesOf(axes);
  const out: TrackDirGuide[] = [];
  const isAxis = (d: readonly number[]): boolean => dirs.some(([, a]) => sameLine(a, d));
  const add = (kind: TrackDirKind, d: V3 | null): void => {
    if (!d || isAxis(d) || out.some((g) => sameLine(g.dir, d))) return;
    out.push({ kind, dir: d });
  };
  add('parallel', e);
  // P에서 선분 직선으로 내린 수직(P가 직선 위면 — 선분 길이의 1e-9배 안 — 없다)
  const a = seg[0];
  const t = (P[0]! - a[0]!) * e[0] + (P[1]! - a[1]!) * e[1] + (P[2]! - a[2]!) * e[2];
  const foot: V3 = [a[0]! + e[0] * t, a[1]! + e[1] * t, a[2]! + e[2] * t];
  const len = Math.hypot(seg[1][0]! - a[0]!, seg[1][1]! - a[1]!, seg[1][2]! - a[2]!);
  if (dist3(P, foot) > 1e-9 * Math.max(1, len)) add('perpendicular', unitDir(P, foot));
  // 축을 e에 수직인 평면에 비친 방향
  for (const [, u] of dirs) {
    const d = u[0] * e[0] + u[1] * e[1] + u[2] * e[2];
    if (Math.abs(d) >= 1 - 1e-6) continue;
    add('perpendicular', unitDir([0, 0, 0], [u[0] - e[0] * d, u[1] - e[1] * d, u[2] - e[2] * d]));
  }
  return out;
}

/**
 * 끌어온 점에서 나란함·수직 방향 위 점(0.26.0, 순수 — 0.27.0부터 뷰어 MeasureInference.trackDirs도 쓴다): 기억한 점 P마다 trackDirGuides(P, seg, axes)의 선 위에서 커서 광선에 가장 가까운 점이
 * 커서에서 snapPx 안이면 후보(가까운 것, 같으면 앞 점 → 안내 차례). trackAxisSnap과 같은 규칙 — 커서가 P의 화면 자리 snapPx 안이면 그 P는 빼고(점 붙잡기가 맡는다),
 * skip(첫 측정 점)과 같은 P는 뺀다(첫 점의 나란함은 0.10.0 parallel). 선이 커서 광선과 거의 나란하면 그 선은 뺀다. 원근에서 가까운 면보다 앞이면 뺀다.
 * seg가 없으면 없다
 */
export function trackDirSnap(
  f: ViewFrame,
  tracks: readonly (readonly number[])[],
  seg: readonly [readonly number[], readonly number[]] | null | undefined,
  x: number,
  y: number,
  snapPx: number,
  skip?: readonly number[] | null,
  axes?: TrackAxes | null,
): TrackDirSnap | null {
  if (!tracks.length || !seg) return null;
  const ray = screenRay(f, x, y);
  let best: TrackDirSnap | null = null;
  for (const P of tracks) {
    if ((skip && sameTrackPoint(P, skip)) || cursorOn(f, P, x, y, snapPx)) continue;
    for (const g of trackDirGuides(P, seg, axes)) {
      const q = rayLinePoint(ray.origin, ray.dir, P, g.dir);
      if (!q) continue;
      const dist = screenDistance(f, q, x, y);
      if (dist === null || dist > snapPx || (best && dist >= best.distPx)) continue;
      best = { p: q, from: [P[0]!, P[1]!, P[2]!], kind: g.kind, dir: [g.dir[0], g.dir[1], g.dir[2]], distPx: dist };
    }
  }
  return best;
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
