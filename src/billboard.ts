/**
 * 마주 보는 그물(Mesh3d.billboard, 0.7.0 — SketchUp "늘 나를 보기" 컴포넌트·2D 나무·사람): 세계 Z축(원점을 지나는) 둘레로 돌려
 * 그물의 앞(front, 기본 −Y — 앞 뷰에서 보이는 쪽)이 카메라를 향하게 한다. 순수 함수(DOM 없음).
 */
import type { Box3 } from './types';
import { boxCorners, boxIsEmpty } from './bounds';
import type { Mat4 } from './math';

/** 카메라 쪽 수평 방향: 원근은 원점 → 눈, 평행은 대상 → 눈(back). 수평 성분이 거의 없으면(바로 위·아래) 방위각으로 */
export function towardCamera(origin: readonly number[], eye: readonly number[], back: readonly number[], perspective: boolean, yaw: number): [number, number] {
  let x = perspective ? eye[0]! - origin[0]! : back[0]!, y = perspective ? eye[1]! - origin[1]! : back[1]!;
  const l = Math.hypot(x, y);
  if (!(l > 1e-9 * (Math.abs(x) + Math.abs(y) + 1)) || l === 0) {
    x = Math.sin(yaw);
    y = -Math.cos(yaw);
  }
  return [x, y];
}

/** 앞(front, 수평 성분)을 카메라 쪽(to)으로 돌리는 Z축 둘레 각(라디안) */
export function billboardAngle(front: readonly number[], to: readonly [number, number]): number {
  return Math.atan2(to[1], to[0]) - Math.atan2(front[1]!, front[0]!);
}

/** 원점 o를 지나는 Z축 둘레 a 라디안 돌림: T(o)·Rz(a)·T(−o)(열 우선 4×4, double) */
export function billboardMatrix(o: readonly number[], a: number): Mat4 {
  const c = Math.cos(a), s = Math.sin(a);
  const m = new Float64Array(16);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  m[10] = 1;
  m[15] = 1;
  m[12] = o[0]! - (c * o[0]! - s * o[1]!);
  m[13] = o[1]! - (s * o[0]! + c * o[1]!);
  return m;
}

/** 돌려도 변하지 않는 범위: 원점 둘레 수평 반지름(상자 구석 중 가장 먼 것)의 기둥 */
export function billboardBounds(b: Box3, o: readonly number[]): Box3 {
  if (boxIsEmpty(b)) return b;
  let r = 0;
  for (const p of boxCorners(b)) r = Math.max(r, Math.hypot(p[0] - o[0]!, p[1] - o[1]!));
  return { min: [o[0]! - r, o[1]! - r, b.min[2]], max: [o[0]! + r, o[1]! + r, b.max[2]] };
}

