/**
 * 공구 위치 표시: 단면(반지름 r, 높이 z)을 Z축 둘레로 돌린 작은 그물.
 * 로컬 좌표: 공구 끝 = 원점, 공구 축 = +Z, 공구 반지름 = 1.
 */

export type MarkerKind = 'cone' | 'cylinder' | 'ball';

/** 단면 점 [r, z]… (아래 → 위) */
const PROFILES: Record<MarkerKind, [number, number][]> = {
  // 드릴·V 날: 원뿔 끝 + 자루
  cone: [
    [0, 0],
    [1, 1.4],
    [1, 2.4],
    [0.62, 2.6],
    [0.62, 5],
    [0, 5],
  ],
  // 평 엔드밀
  cylinder: [
    [0, 0],
    [1, 0],
    [1, 2.6],
    [0.62, 2.8],
    [0.62, 5],
    [0, 5],
  ],
  // 볼 엔드밀
  ball: [
    ...Array.from({ length: 7 }, (_, i): [number, number] => {
      const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
      return [Math.cos(a), 1 + Math.sin(a)];
    }),
    [1, 2.6],
    [0.62, 2.8],
    [0.62, 5],
    [0, 5],
  ],
};

/** 표시 그물의 높이(로컬, 반지름 1 기준) */
export const MARKER_HEIGHT = 5;

/**
 * 0.93.0 kind가 모양 이름이 아니면(엉뚱한 글·null·'toString' 같은 물려받은 이름) 'cone'(뷰어 setMarker의 기본 — 0.92.0은 TypeError, 물려받은 이름은 빈 그물),
 * segments가 수로 읽히지 않으면(NaN·±Infinity·글·객체) 주지 않은 것(24 — 0.92.0은 빈 그물이고 무한대는 끝나지 않았다). 수로 읽히는 값은 0.92.0 그대로
 */
export function markerMesh(kind: MarkerKind, segments = 24): { positions: Float32Array; normals: Float32Array } {
  const prof = Object.prototype.hasOwnProperty.call(PROFILES, kind) ? PROFILES[kind] : PROFILES.cone;
  if (!Number.isFinite(Number(segments))) segments = 24;
  const pos: number[] = [];
  const nrm: number[] = [];
  for (let k = 0; k + 1 < prof.length; k++) {
    const [r0, z0] = prof[k]!;
    const [r1, z1] = prof[k + 1]!;
    const tr = r1 - r0, tz = z1 - z0;
    const tl = Math.hypot(tr, tz);
    if (!tl) continue;
    const nr = tz / tl, nz = -tr / tl;
    for (let j = 0; j < segments; j++) {
      const a0 = (j / segments) * Math.PI * 2;
      const a1 = ((j + 1) / segments) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const v = (r: number, z: number, c: number, s: number): void => {
        pos.push(r * c, r * s, z);
        nrm.push(nr * c, nr * s, nz);
      };
      // 바깥에서 볼 때 반시계
      v(r0, z0, c0, s0);
      v(r0, z0, c1, s1);
      v(r1, z1, c1, s1);
      v(r0, z0, c0, s0);
      v(r1, z1, c1, s1);
      v(r1, z1, c0, s0);
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm) };
}
