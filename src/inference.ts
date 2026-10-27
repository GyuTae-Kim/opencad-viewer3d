/**
 * 측정 추론 붙잡기(0.9.0, 순수 함수 — DOM·WebGL 없음). Viewer3d.setMeasureSnap({ inference })가 쓴다.
 *
 * - 교차점: 커서 둘레 두 선분(선분 묶음·그물 윤곽선)이 3D에서 만나는 점. 두 선분의 가장 가까운 두 점 사이가 허용치(화면 반 화소쯤) 안이고
 *   두 선분 모두 안쪽(끝점에서 허용치보다 먼 곳 — 끝점은 끝점 붙잡기가 맡는다)일 때만. 나란한 선분은 없다
 * - 수직 발: 첫 측정 점에서 커서 둘레 선분으로 내린 수직선의 발(선분 안쪽, 끝점·첫 점에서 허용치보다 먼 곳)
 * - 축: 첫 측정 점을 지나는 X·Y·Z 축 방향 선 가운데 커서 광선에 가장 가까운 점(화면 붙잡기 거리 안). 점 붙잡기가 하나도 없을 때만 쓴다
 */
import { type ViewFrame, projectToScreen, screenRay } from './camera';
import type { V3 } from './math';

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
}

/** inference 선택을 세 값으로 편다(true = 모두, 아무것도 켜지 않았으면 null) */
export function normalizeInference(o: MeasureInference | boolean | null | undefined): Required<MeasureInference> | null {
  if (!o) return null;
  const r = o === true ? { intersections: true, perpendicular: true, axes: true } : { intersections: !!o.intersections, perpendicular: !!o.perpendicular, axes: !!o.axes };
  return r.intersections || r.perpendicular || r.axes ? r : null;
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
  const o = ray.origin, d = ray.dir;
  const w0x = a[0]! - o[0], w0y = a[1]! - o[1], w0z = a[2]! - o[2];
  const ee = d[0] * w0x + d[1] * w0y + d[2] * w0z;
  let best: { p: V3; axis: SnapAxis; distPx: number } | null = null;
  for (const [axis, e] of AXES) {
    const b = e[0] * d[0] + e[1] * d[1] + e[2] * d[2];
    const den = 1 - b * b;
    if (den < 1e-6) continue;
    const dd = e[0] * w0x + e[1] * w0y + e[2] * w0z;
    // 축 선 a + t·e와 광선 o + s·d의 가장 가까운 점(둘 다 단위 방향)
    const t = (b * ee - dd) / den;
    const p: V3 = [a[0]! + e[0] * t, a[1]! + e[1] * t, a[2]! + e[2] * t];
    const s = projectToScreen(f, p);
    if (!s || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) continue;
    if (f.projection === 'perspective' && s[2] < f.near * 0.999) continue;
    const dist = Math.hypot(s[0] - x, s[1] - y);
    if (dist <= snapPx && (!best || dist < best.distPx)) best = { p, axis, distPx: dist };
  }
  return best;
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
}

/** 추론 후보(세계 점·종류·묶음 id) */
export interface InferenceCandidate {
  p: V3;
  kind: 'intersection' | 'perpendicular';
  id: string;
}

/**
 * 커서 둘레 선분들에서 교차점·수직 발 후보(교차점 먼저, 선분 차례대로). first = 첫 측정 점(없으면 수직 발 없음).
 * 허용치는 두 선분 쪽 화소 길이의 반(교차)·화소 길이의 반(수직 발 끝점·첫 점 거리)
 */
export function inferenceCandidates(segs: readonly NearSegment[], first: readonly number[] | null, o: Required<MeasureInference>): InferenceCandidate[] {
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
      if (p && (!s.keep || s.keep(p))) out.push({ p, kind: 'perpendicular', id: s.id });
    }
  return out;
}
