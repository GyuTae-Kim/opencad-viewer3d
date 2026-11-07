/**
 * 0.51.0 화면 밖 잘라내기(순수 계산 — GL은 모른다). 그물(삼각형·윤곽선)이 시야 사각뿔의 왼·오른·아래·위 평면 가운데 한 평면 바깥에
 * 통째로 있으면 그 그물은 화면에 화소를 하나도 내지 않으므로 그리지 않는다(앞·뒤 자르기 평면은 보지 않는다 — 늘 남긴다).
 *
 * 평면은 시점·투영 행렬(f.viewProj — double)의 행으로 만든 클립 공간 반공간 x ≥ −(1 + m)·w 꼴이고(Gribb·Hartmann), 여백 m은 굵은 선의 반폭·끝 마개와
 * 1화소 선 래스터를 덮는 화소 수를 NDC로 바꾼 값이다. 상자는 그물 로컬 범위(positions와 윤곽선 끝점 — 깨진 값은 0.50.0처럼 빼고 그리지도 않는다)를
 * 모형 행렬(matrix · T(origin), 겉모습 행렬이 있으면 그것까지)로 옮긴 세계 축 정렬 상자(가운데·반폭)다.
 *
 * GPU는 float32로 셈한다: 정점 셰이더의 u_mvp(= double 곱을 float32로)·a_pos 곱은 셈마다 상대 2⁻²⁴ 안팎 어긋나고, 로컬 좌표가 크고 행렬이 그것을 되돌리는
 * 꼴(큰 원점)이면 세계 좌표보다 훨씬 큰 값끼리의 차이라 어긋남이 화소 여럿이 될 수 있다. 그래서 평면마다 어긋남 한도
 * tol = 2⁻²⁰ · (Σₖ (|행ᵢₖ| + a·|행₃ₖ|) · Aₖ + |행ᵢ₃| + a·|행₃₃|) (Aₖ = Σⱼ |Mₖⱼ|·Lⱼ + |Mₖ₃| — 로컬 크기 L을 모형 행렬로 키운 값)
 * 를 더 두고 그보다 확실히 바깥일 때만 뺀다(곱·합 몇 번의 반올림보다 16배 넉넉하다). 값이 수가 아니면(NaN) 빼지 않는다.
 * 투영 성분이 있는 모형 행렬(마지막 행이 (0, 0, 0, 1)이 아님)도 빼지 않는다.
 */
import { COORD_LIMIT } from './bounds';
import type { Box3 } from './types';

/**
 * xyz… 배열(윤곽선 끝점)의 범위 — bounds.positionsBox와 같은 한도로 깨진 값(NaN·무한대·|값| > COORD_LIMIT)은 빼되 기억하지 않는다
 * (그물마다 한 번 — 부품 자리 8만 장면에서 배열마다 약한 표 칸을 더 잡지 않게). 0.51.0
 */
export function segmentsBox(p: Float32Array): Box3 {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const n = p.length - (p.length % 3);
  const L = COORD_LIMIT;
  for (let i = 0; i < n; i += 3) {
    const x = p[i]!, y = p[i + 1]!, z = p[i + 2]!;
    if (!(x >= -L && x <= L && y >= -L && y <= L && z >= -L && z <= L)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { min: [x0, y0, z0], max: [x1, y1, z1] };
}

/** 평면 넷(왼·오른·아래·위 — 각 [a, b, c, d])과 평면마다 어긋남 한도 계수 넷(16 + 16) */
export type CullPlanes = Float64Array;

/**
 * 시점·투영 행렬(열 우선)과 NDC 여백(가로·세로)으로 잘라내기 평면. 0.51.0
 */
export function cullPlanes(vp: ArrayLike<number>, mx: number, my: number): CullPlanes {
  const out = new Float64Array(32);
  const ax = 1 + mx, ay = 1 + my;
  for (let k = 0; k < 4; k++) {
    const r0 = vp[k * 4]!, r1 = vp[k * 4 + 1]!, r3 = vp[k * 4 + 3]!;
    // 왼: x + a·w ≥ 0, 오른: a·w − x ≥ 0, 아래·위는 y
    out[k] = ax * r3 + r0;
    out[4 + k] = ax * r3 - r0;
    out[8 + k] = ay * r3 + r1;
    out[12 + k] = ay * r3 - r1;
    // 어긋남 한도 계수(같은 평면 차례): |행ᵢₖ| + a·|행₃ₖ|
    out[16 + k] = Math.abs(r0) + ax * Math.abs(r3);
    out[20 + k] = out[16 + k]!;
    out[24 + k] = Math.abs(r1) + ay * Math.abs(r3);
    out[28 + k] = out[24 + k]!;
  }
  return out;
}

/** 그물 하나의 잘라내기 자료: 세계 상자 가운데 3·반폭 3, 어긋남 크기 A 3(9값). 쓸 수 없으면(빈 범위·투영 행렬·수가 아닌 값) null */
export type CullBox = Float64Array;

/**
 * 로컬 범위(positions·윤곽선 — 원점 전 좌표)와 모형 행렬(없으면 단위)로 잘라내기 자료. 0.51.0
 */
export function cullBox(local: Box3, model: ArrayLike<number> | undefined, out: Float64Array = new Float64Array(9)): CullBox | null {
  const l0 = local.min, l1 = local.max;
  if (!(l0[0] <= l1[0] && l0[1] <= l1[1] && l0[2] <= l1[2])) return null;
  const c = [(l0[0] + l1[0]) / 2, (l0[1] + l1[1]) / 2, (l0[2] + l1[2]) / 2];
  const e = [(l1[0] - l0[0]) / 2, (l1[1] - l0[1]) / 2, (l1[2] - l0[2]) / 2];
  const L = [Math.max(Math.abs(l0[0]), Math.abs(l1[0])), Math.max(Math.abs(l0[1]), Math.abs(l1[1])), Math.max(Math.abs(l0[2]), Math.abs(l1[2]))];
  if (!model) {
    for (let k = 0; k < 3; k++) {
      out[k] = c[k]!;
      out[3 + k] = e[k]!;
      out[6 + k] = L[k]!;
    }
  } else {
    const M = model;
    if (M[3] !== 0 || M[7] !== 0 || M[11] !== 0 || M[15] !== 1) return null;
    for (let k = 0; k < 3; k++) {
      // 열 우선: Mₖⱼ = M[j·4 + k]
      const m0 = M[k]!, m1 = M[4 + k]!, m2 = M[8 + k]!, m3 = M[12 + k]!;
      out[k] = m0 * c[0]! + m1 * c[1]! + m2 * c[2]! + m3;
      out[3 + k] = Math.abs(m0) * e[0]! + Math.abs(m1) * e[1]! + Math.abs(m2) * e[2]!;
      out[6 + k] = Math.abs(m0) * L[0]! + Math.abs(m1) * L[1]! + Math.abs(m2) * L[2]! + Math.abs(m3);
    }
  }
  for (let i = 0; i < 9; i++) if (!Number.isFinite(out[i]!)) return null;
  return out;
}

/** 어긋남 한도 비(2⁻²⁰ — float32 곱·합 몇 번의 반올림 2⁻²⁴의 16배) */
const TOL = 2 ** -20;

/** 잘라내기 자료가 네 평면 가운데 하나의 확실히 바깥이면 true(그리지 않아도 된다). 0.51.0 */
export function cullOut(P: CullPlanes, b: CullBox): boolean {
  const cx = b[0]!, cy = b[1]!, cz = b[2]!, ex = b[3]!, ey = b[4]!, ez = b[5]!, ax = b[6]!, ay = b[7]!, az = b[8]!;
  for (let i = 0; i < 16; i += 4) {
    const a = P[i]!, bb = P[i + 1]!, c = P[i + 2]!, d = P[i + 3]!;
    // 상자 위 가장 큰 평면 값(가운데 값 + 반폭 · |법선|)
    const top = a * cx + bb * cy + c * cz + d + Math.abs(a) * ex + Math.abs(bb) * ey + Math.abs(c) * ez;
    const tol = TOL * (P[16 + i]! * ax + P[17 + i]! * ay + P[18 + i]! * az + P[19 + i]!);
    if (top < -tol) return true;
  }
  return false;
}
