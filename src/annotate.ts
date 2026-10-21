/**
 * 앱 측정 덧그림(Viewer3d.setAnnotations)의 순수 계산(DOM·WebGL 없음): 종류별 선분·점·글자 자리·값.
 *
 * - distance: a–b 선분, 두 끝점, 글자는 가운데. 값 = 거리
 * - angle: 꼭짓점 a에서 b·c로 가는 두 팔과 그 사이 호(반지름 = 짧은 팔의 0.3배), 글자는 호 가운데. 값 = 각(라디안)
 * - radius: 중심 a → 원 위 점 b 선분(normal을 주면 a 둘레 원 전체도), 글자는 선분 가운데. 값 = 반지름
 * - point: 점 a 하나, 글자는 그 점. 값 = 0
 * 선분은 세계 좌표(double) xyz,xyz…로 돌려준다 — 뷰어가 원점 기준으로 줄여 GPU에 올린다(큰 좌표에서도 떨리지 않게).
 */
import { type V3, cross, dot, length, normalize, sub } from './math';

export type AnnotationKind = 'distance' | 'angle' | 'radius' | 'point';

export interface Annotation3d {
  kind: AnnotationKind;
  /** distance·point: 첫 점, angle: 꼭짓점, radius: 중심(세계 좌표) */
  a: readonly number[];
  /** distance: 끝점, angle: 첫 팔 끝, radius: 원 위 점 */
  b?: readonly number[];
  /** angle: 둘째 팔 끝 */
  c?: readonly number[];
  /** 표시 글(없으면 값·단위로 만든다). 여러 줄은 '\n'으로 나눈다. 빈 문자열이면 글자 상자를 그리지 않는다 */
  label?: string;
  /** 색(CSS 색, 기본 테마 measure) */
  color?: string;
  /** radius: 원을 둘 평면의 법선(주면 중심 둘레 원 전체를 그린다) */
  normal?: readonly number[];
  /** 앱이 붙이는 식별자(뷰어는 보지 않는다) */
  id?: string;
}

export interface AnnotationGeometry {
  /** 선분 쌍(세계 좌표) xyz,xyz… */
  segs: number[];
  /** 점 표시를 그릴 자리 */
  dots: V3[];
  /** 글자 상자를 붙일 자리 */
  labelAt: V3;
  /** 값: distance = 거리, angle = 라디안, radius = 반지름, point = 0 */
  value: number;
}

/** 호를 나누는 칸 수 */
export const ARC_STEPS = 24;
/** 원을 나누는 칸 수 */
export const CIRCLE_STEPS = 64;

const v3 = (p: readonly number[]): V3 => [p[0]!, p[1]!, p[2]!];
const finite3 = (p: readonly number[] | undefined): p is readonly number[] => !!p && p.length >= 3 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Number.isFinite(p[2]);

/** 꼭짓점 a에서 b·c로 가는 두 방향 사이 각(라디안, 0~π). 길이가 0이면 0 */
export function angleAt(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  const u = sub(b, a), w = sub(c, a);
  const lu = length(u), lw = length(w);
  if (!(lu > 0) || !(lw > 0)) return 0;
  return Math.atan2(length(cross(u, w)), dot(u, w));
}

/** 덧그림 하나의 선분·점·글자 자리·값. 점이 모자라거나 수가 아니면 null */
export function annotationGeometry(an: Annotation3d): AnnotationGeometry | null {
  if (!finite3(an.a)) return null;
  const a = v3(an.a);
  const segs: number[] = [];
  const seg = (p: readonly number[], q: readonly number[]): void => {
    segs.push(p[0]!, p[1]!, p[2]!, q[0]!, q[1]!, q[2]!);
  };
  if (an.kind === 'point') return { segs, dots: [a], labelAt: a, value: 0 };
  if (!finite3(an.b)) return null;
  const b = v3(an.b);
  if (an.kind === 'distance') {
    seg(a, b);
    return { segs, dots: [a, b], labelAt: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], value: length(sub(b, a)) };
  }
  if (an.kind === 'radius') {
    const r = length(sub(b, a));
    seg(a, b);
    const n = an.normal && finite3(an.normal) ? normalize(an.normal) : null;
    if (n && (n[0] || n[1] || n[2]) && r > 0) {
      // 원: 중심 a, 평면 법선 n, 지름 방향 u는 a→b를 평면에 내린 것(없으면 아무 수직 방향)
      const d = sub(b, a);
      let u = sub(d, [n[0] * dot(d, n), n[1] * dot(d, n), n[2] * dot(d, n)]);
      if (!(length(u) > r * 1e-9)) u = cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
      u = normalize(u);
      const w = cross(n, u);
      let prev: V3 = [a[0] + u[0] * r, a[1] + u[1] * r, a[2] + u[2] * r];
      for (let i = 1; i <= CIRCLE_STEPS; i++) {
        const t = (i / CIRCLE_STEPS) * Math.PI * 2;
        const cs = Math.cos(t) * r, sn = Math.sin(t) * r;
        const p: V3 = [a[0] + u[0] * cs + w[0] * sn, a[1] + u[1] * cs + w[1] * sn, a[2] + u[2] * cs + w[2] * sn];
        seg(prev, p);
        prev = p;
      }
    }
    return { segs, dots: [a, b], labelAt: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], value: r };
  }
  // angle
  if (!finite3(an.c)) return null;
  const c = v3(an.c);
  seg(a, b);
  seg(a, c);
  const u = sub(b, a), w = sub(c, a);
  const lu = length(u), lw = length(w);
  const ang = angleAt(a, b, c);
  if (!(lu > 0) || !(lw > 0)) return { segs, dots: [a, b, c], labelAt: a, value: 0 };
  const r = Math.min(lu, lw) * 0.3;
  const e1 = normalize(u);
  // e2: 평면 위에서 e1에 수직이고 c 쪽을 향하는 방향(두 팔이 나란하면 호 없이)
  const wp = sub(w, [e1[0] * dot(w, e1), e1[1] * dot(w, e1), e1[2] * dot(w, e1)]);
  let mid: V3 = [a[0] + e1[0] * r, a[1] + e1[1] * r, a[2] + e1[2] * r];
  if (length(wp) > lw * 1e-9) {
    const e2 = normalize(wp);
    let prev: V3 = mid;
    for (let i = 1; i <= ARC_STEPS; i++) {
      const t = (i / ARC_STEPS) * ang;
      const cs = Math.cos(t) * r, sn = Math.sin(t) * r;
      const p: V3 = [a[0] + e1[0] * cs + e2[0] * sn, a[1] + e1[1] * cs + e2[1] * sn, a[2] + e1[2] * cs + e2[2] * sn];
      seg(prev, p);
      prev = p;
    }
    const h = ang / 2;
    mid = [a[0] + (e1[0] * Math.cos(h) + e2[0] * Math.sin(h)) * r, a[1] + (e1[1] * Math.cos(h) + e2[1] * Math.sin(h)) * r, a[2] + (e1[2] * Math.cos(h) + e2[2] * Math.sin(h)) * r];
  }
  return { segs, dots: [a, b, c], labelAt: mid, value: ang };
}

/**
 * 덧그림 글(label이 있으면 그것을 줄로 나눠). 없으면 값으로: distance = "12.5 mm", angle = "90.0°", radius = "R 6 mm",
 * point = "X … Y … Z …". fmt는 길이 숫자 꼴(뷰어의 장면 크기 맞춤 자릿수)
 */
export function annotationText(an: Annotation3d, g: AnnotationGeometry, fmt: (v: number) => string, unit: string): string[] {
  if (an.label !== undefined) return an.label === '' ? [] : an.label.split('\n');
  const u = unit ? ` ${unit}` : '';
  if (an.kind === 'distance') return [`${fmt(g.value)}${u}`];
  if (an.kind === 'radius') return [`R ${fmt(g.value)}${u}`];
  if (an.kind === 'angle') return [`${((g.value * 180) / Math.PI).toFixed(1)}°`];
  const a = an.a;
  return [`X ${fmt(a[0]!)}  Y ${fmt(a[1]!)}  Z ${fmt(a[2]!)}`];
}
