/**
 * 그물(부품 자리)이 아주 많은 평평한 장면(0.51.0 — 비용 재기 페이지 scripts/bench/many.ts가 ?flat 꼴로 쓴다. STEP 58차 큰 조립 합성처럼 자리마다 그물 하나·자리 행렬 하나).
 * share: 'distinct' = 자리마다 따로 만든 배열(서로 다른 부품 — 인스턴싱이 묶지 못한다), 'mixed' = 짝수 자리는 정의 12개의 배열을 함께 쓰고(같은 부품 — 나사·볼트 꼴)
 * 홀수 자리는 따로 만든 배열, 'same' = 모든 자리가 정의 하나의 배열을 함께 쓴다(STEP 58차 표본 — 같은 판을 8만 자리에).
 * 정의는 scripts/pixels/many.ts의 닫힌 원기둥(삼각형 수 triangles 어림), 따로 만든 배열은 정의 배열의 사본(내용은 같고 객체만 다르다).
 */
import type { Mesh3d, Scene3d } from '../../src/types';
import { cylinderDef, defShape, placeAt } from '../pixels/many';

export interface FlatSpec {
  /** 자리(그물) 수 */
  flat: number;
  /** 0.52.0 'varied' = 서로 다른 배열에 그리기 상태가 섞인 꼴(스무째마다 반투명, 열째마다 정점 색, 열둘째마다 같은 정의 배열 — 나사 꼴) */
  share: 'distinct' | 'mixed' | 'same' | 'varied';
  /** 자리 하나의 평균 삼각형 수 어림(기본 60) */
  triangles?: number;
}

const COLORS: [number, number, number, number][] = [
  [0.72, 0.74, 0.78, 1],
  [0.85, 0.55, 0.3, 1],
  [0.35, 0.6, 0.85, 1],
  [0.55, 0.78, 0.4, 1],
  [0.86, 0.78, 0.35, 1],
  [0.6, 0.45, 0.8, 1],
];

/** 자리가 많은 평평한 장면(가로세로 같은 칸에 늘어선다 — 칸 30 단위) */
export function flatScene(spec: FlatSpec): Scene3d & { triangles: number } {
  const tri = spec.triangles ?? 60;
  const ndefs = spec.share === 'same' ? 1 : 12;
  const defs = Array.from({ length: ndefs }, (_, k) => {
    const sh = defShape(k, ndefs, tri);
    return cylinderDef(sh.s, sh.rings, 5 + (k % 4), 8 + (k % 5) * 2);
  });
  const n = Math.max(1, Math.floor(spec.flat));
  const cols = Math.ceil(Math.sqrt(n));
  const meshes: Mesh3d[] = [];
  let triangles = 0;
  for (let i = 0; i < n; i++) {
    const k = i % ndefs;
    const d = defs[k]!;
    const varied = spec.share === 'varied';
    const shared = spec.share === 'same' || (spec.share === 'mixed' && i % 2 === 0) || (varied && i % 12 === 5);
    const x = (i % cols) * 30, y = Math.floor(i / cols) * 30;
    const lying = i % 3 === 1;
    const c = COLORS[Math.floor(i / 7) % COLORS.length]!;
    const mesh: Mesh3d = {
      id: `자리 ${i}`,
      name: `부품 ${shared ? k : `따로 ${i}`}`,
      group: `줄 ${Math.floor(i / cols)}`,
      positions: shared ? d.positions : d.positions.slice(),
      normals: shared ? d.normals : d.normals!.slice(),
      indices: shared ? d.indices : d.indices!.slice(),
      edges: shared ? d.edges : d.edges!.slice(),
      color: varied && i % 20 === 7 ? [c[0], c[1], c[2], 0.6] : c,
      doubleSided: false,
      closed: true,
      matrix: placeAt(x, y, lying ? 6 : 0, (i * 37) % 360, lying),
    };
    // 0.52.0 'varied': 열째마다 정점 색(묶음 열쇠가 다르다)
    if (varied && !shared && i % 10 === 3) {
      const nv = mesh.positions.length / 3;
      mesh.colors = Float32Array.from({ length: nv * 4 }, (_, j) => (j % 4 === 3 ? 1 : c[j % 4]! * (0.8 + ((j >> 2) % 5) * 0.05)));
    }
    meshes.push(mesh);
    triangles += d.indices!.length / 3;
  }
  return { name: 'flat', units: 'mm', meshes, lines: [], triangles };
}
