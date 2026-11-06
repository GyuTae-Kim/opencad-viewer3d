/**
 * 묶음 안 구간 단면 장면(0.44.0 — SKP 42차 요청의 그룹 안 단면. 화소 비교 페이지가 쓴다).
 * 비교 페이지는 base 판 src에 없는 것을 가져올 수 없어 그물 만들기를 이 파일에 둔다(boxMesh는 0.4.0부터 있다).
 *
 * 판(300 × 200 × 20) 위에 그룹 A(왼쪽)·그룹 B(오른쪽) 상자 — SketchUp이 재질 묶음 하나로 구운 것처럼 한 그물 '판재'로 합친다
 * (삼각형 0~11 판, 12~23 A, 24~35 B, 윤곽선도 같은 차례). 선분 묶음 '기준선': 0번은 판 윗면 뒤쪽을 가로지르는 선(그룹 밖), 1번은 B 위를 지나는 선.
 * split = 같은 모양을 묶음 넷(판·A·B 그물, 기준선 둘)으로 나눈 장면 — 구간 단면과 묶음 단면이 같은 그림인지 견준다
 */
import { boxMesh } from '../../src/synth';
import type { LineSet3d, Mesh3d, Rgba, Scene3d } from '../../src/types';

const GRAY: Rgba = [0.72, 0.74, 0.78, 1];
const BOXES: [string, [number, number, number], [number, number, number]][] = [
  ['판', [0, 0, 0], [300, 200, 20]],
  ['A', [40, 50, 20], [120, 150, 90]],
  ['B', [170, 50, 20], [270, 150, 90]],
];
const LINES = [10, 180, 20.5, 290, 180, 20.5, 150, 100, 100, 290, 100, 100];

/** B(삼각형 24~35·윤곽선 24~35)와 기준선 1번만 x > 220 쪽을 자르는 평면의 items */
export const SECRANGE_ITEMS = [
  { id: '판재', start: 24, count: 12 },
  { id: '판재', start: 24, count: 12, edges: true },
  { id: '기준선', start: 1, count: 1 },
];
/** split 장면에서 같은 것을 자르는 items(묶음 id) */
export const SECRANGE_SPLIT_ITEMS = ['B', '기준선 1'];

export function secRangeScene(split = false): Scene3d {
  const boxes = BOXES.map(([id, a, b]) => boxMesh(id, a, b, GRAY));
  if (split) {
    const lines: LineSet3d[] = [
      { id: '기준선 0', positions: new Float32Array(LINES.slice(0, 6)), color: [0.95, 0.75, 0.2, 1], width: 2 },
      { id: '기준선 1', positions: new Float32Array(LINES.slice(6)), color: [0.95, 0.75, 0.2, 1], width: 2 },
    ];
    return { name: 'secrange-split', units: 'mm', meshes: boxes, lines };
  }
  const positions = new Float32Array(boxes.length * 24);
  const indices = new Uint32Array(boxes.length * 36);
  const edges = new Float32Array(boxes.length * 72);
  boxes.forEach((m, k) => {
    positions.set(m.positions, k * 24);
    for (let i = 0; i < 36; i++) indices[k * 36 + i] = m.indices![i]! + k * 8;
    edges.set(m.edges!, k * 72);
  });
  const merged: Mesh3d = { id: '판재', name: '판재', positions, indices, edges, color: GRAY, closed: true };
  return { name: 'secrange', units: 'mm', meshes: [merged], lines: [{ id: '기준선', positions: new Float32Array(LINES), color: [0.95, 0.75, 0.2, 1], width: 2 }] };
}
