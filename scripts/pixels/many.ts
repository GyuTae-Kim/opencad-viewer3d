/**
 * 같은 그물을 아주 많이 놓은 장면(0.42.0 — STEP 큰 조립의 같은 부품 정의를 수천 자리에 놓은 꼴. 화소 비교 페이지·비용 재기·시험이 함께 쓴다).
 * 정의 defs개(닫힌 원기둥 — 토막 수·높이 칸 수가 정의마다 다르다)를 모듈 modules개 × 모듈마다 perModule자리에 돌려 놓는다.
 * 자리마다 그물 하나: 정의의 positions·normals·indices·edges 배열을 함께 쓰고 id·group·matrix(자리 행렬 — z축 둘레 돌림, 홀수 자리는 눕힘)만 다르다.
 * 정의 하나의 삼각형 수는 평균 triangles(자리 하나 어림)의 0.5~1.5배로 고르게 나눈다. 비교 페이지는 base 판 src에 없는 것을 가져올 수 없어 이 파일에 둔다.
 */
import type { Mesh3d, Rgba, Scene3d } from '../../src/types';

export interface ManySpec {
  /** 정의(서로 다른 그물 배열) 수 */
  defs: number;
  /** 모듈 수(모듈은 6열로 늘어선다) */
  modules: number;
  /** 모듈마다 자리 수(모듈 안 10열) */
  perModule: number;
  /** 자리 하나의 평균 삼각형 수 어림 */
  triangles: number;
  /** 묶음 원점(세계, 선택) — 있으면 positions·edges는 이 점 기준(자리 행렬이 원점을 되돌려 자리마다 돌린 꼴은 같다) */
  origin?: [number, number, number];
  /** 무늬 그림 id(선택) — 주면 셋째 정의마다(k % 3 = 2) 무늬 좌표(옆면 둘레·높이, 뚜껑 평면)와 이 무늬를 단다(그림은 부르는 쪽이 장면 textures에) */
  texture?: string;
}

/** 정의 색(12색 돌려 쓰기) */
const PALETTE: Rgba[] = [
  [0.72, 0.74, 0.78, 1],
  [0.85, 0.55, 0.3, 1],
  [0.35, 0.6, 0.85, 1],
  [0.55, 0.78, 0.4, 1],
  [0.86, 0.78, 0.35, 1],
  [0.6, 0.45, 0.8, 1],
  [0.4, 0.75, 0.72, 1],
  [0.82, 0.42, 0.5, 1],
  [0.5, 0.52, 0.58, 1],
  [0.92, 0.66, 0.55, 1],
  [0.45, 0.48, 0.75, 1],
  [0.7, 0.62, 0.48, 1],
];

/** 닫힌 원기둥 정의: 옆면(높이 칸 rings, 매끈한 법선)과 위·아래 뚜껑(평평한 법선), 모서리 = 위·아래 둘레와 이음매 선 하나. uvs = 무늬 좌표(옆면 둘레·높이, 뚜껑 평면) */
export function cylinderDef(s: number, rings: number, r: number, h: number): Pick<Mesh3d, 'positions' | 'normals' | 'indices' | 'edges'> & { uvs: Float32Array } {
  const side = (rings + 1) * s;
  const nv = side + 2 * (s + 1);
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const uvs = new Float32Array(nv * 2);
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++)
    for (let i = 0; i < s; i++) {
      const a = (i / s) * Math.PI * 2;
      const k = (j * s + i) * 3;
      positions.set([r * Math.cos(a), r * Math.sin(a), (j / rings) * h], k);
      normals.set([Math.cos(a), Math.sin(a), 0], k);
      uvs.set([(i / s) * 3, (j / rings) * 2], (j * s + i) * 2);
    }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < s; i++) {
      const a = j * s + i, b = j * s + ((i + 1) % s), c = a + s, d = b + s;
      idx.push(a, b, d, a, d, c);
    }
  // 뚜껑: 가운데 점 + 둘레(아래는 −z, 위는 +z 법선 — 바깥에서 반시계)
  for (const top of [0, 1]) {
    const c0 = side + top * (s + 1);
    const z = top * h;
    positions.set([0, 0, z], c0 * 3);
    normals.set([0, 0, top ? 1 : -1], c0 * 3);
    uvs.set([0.5, 0.5], c0 * 2);
    for (let i = 0; i < s; i++) {
      const a = (i / s) * Math.PI * 2;
      positions.set([r * Math.cos(a), r * Math.sin(a), z], (c0 + 1 + i) * 3);
      normals.set([0, 0, top ? 1 : -1], (c0 + 1 + i) * 3);
      uvs.set([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)], (c0 + 1 + i) * 2);
    }
    for (let i = 0; i < s; i++) {
      const p = c0 + 1 + i, q = c0 + 1 + ((i + 1) % s);
      if (top) idx.push(c0, p, q);
      else idx.push(c0, q, p);
    }
  }
  const e: number[] = [];
  for (const z of [0, h])
    for (let i = 0; i < s; i++) {
      const a0 = (i / s) * Math.PI * 2, a1 = ((i + 1) / s) * Math.PI * 2;
      e.push(r * Math.cos(a0), r * Math.sin(a0), z, r * Math.cos(a1), r * Math.sin(a1), z);
    }
  e.push(r, 0, 0, r, 0, h);
  return { positions, normals, uvs, indices: new Uint32Array(idx), edges: new Float32Array(e) };
}

/** 자리 행렬(열 우선): z축 둘레 deg도 돌리고(lying이면 먼저 x축 둘레 90°로 눕힌 뒤) (x, y, z)로 옮긴다 */
export function placeAt(x: number, y: number, z: number, deg: number, lying: boolean): Float64Array {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  // R = Rz · (lying ? Rx(90°) : I)
  if (!lying) return new Float64Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  // Rx(90°): y → z, z → −y. 열: Rz·ex = (c, s, 0), Rz·ez = (−s·0 …) — Rx 열은 ex, ez, −ey
  return new Float64Array([c, s, 0, 0, 0, 0, 1, 0, s, -c, 0, 0, x, y, z, 1]);
}

/** 정의 k의 토막 수·높이 칸 수(삼각형 = 2·s·rings + 2·s) */
export function defShape(k: number, defs: number, triangles: number): { s: number; rings: number; r: number; h: number } {
  const s = 12 + 4 * (k % 12);
  const t = triangles * (defs > 1 ? 0.5 + k / (defs - 1) : 1);
  const rings = Math.max(1, Math.round((t - 2 * s) / (2 * s)));
  return { s, rings, r: 6 + (k % 5) * 2, h: 10 + (k % 7) * 3 };
}

/** 같은 그물 자리가 많은 장면 */
export function manyScene(spec: ManySpec): Scene3d & { triangles: number } {
  const defs = Array.from({ length: spec.defs }, (_, k) => {
    const sh = defShape(k, spec.defs, spec.triangles);
    return { ...cylinderDef(sh.s, sh.rings, sh.r, sh.h), color: PALETTE[k % PALETTE.length]! };
  });
  const o = spec.origin;
  const meshes: Mesh3d[] = [];
  let triangles = 0;
  for (let m = 0; m < spec.modules; m++) {
    const mx = (m % 6) * 400, my = Math.floor(m / 6) * 400;
    for (let p = 0; p < spec.perModule; p++) {
      const k = (m * spec.perModule + p) % spec.defs;
      const d = defs[k]!;
      const x = mx + (p % 10) * 35, y = my + Math.floor(p / 10) * 35;
      const lying = p % 2 === 1;
      const matrix = placeAt(x, y, lying ? 12 : 0, (p * 37 + m * 11) % 360, lying);
      // 원점이 있으면 행렬 = T(자리 + 원점) · R · T(−원점): 세계 = 원점 + 자리 + R · position(큰 좌표에서 자리마다 돌린 꼴은 같다)
      if (o)
        for (let i = 0; i < 3; i++) matrix[12 + i] = matrix[12 + i]! + o[i]! - (matrix[i]! * o[0] + matrix[4 + i]! * o[1] + matrix[8 + i]! * o[2]);
      const mesh: Mesh3d = {
        id: `자리 ${m}-${p}`,
        name: `부품 ${k}`,
        group: `모듈 ${m}`,
        positions: d.positions,
        normals: d.normals,
        indices: d.indices,
        edges: d.edges,
        color: d.color,
        doubleSided: false,
        closed: true,
        matrix,
      };
      if (o) mesh.origin = o;
      if (spec.texture && k % 3 === 2) {
        mesh.uvs = d.uvs;
        mesh.texture = spec.texture;
      }
      meshes.push(mesh);
      triangles += d.indices!.length / 3;
    }
  }
  return { name: 'many', units: 'mm', meshes, lines: [], triangles };
}
