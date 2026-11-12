/**
 * 0.63.0 그물 바꾸기·빼기 호출 몫(62차까지 setMesh·removeMesh마다 뷰어가 장면 범위를 그물 모두로 다시 합치고(sceneBounds) 렌더러가 무늬를 맞추며(syncTextures)
 * 그물 기록 Map을 새로 만들었다 — 가짜 WebGL 8만 그물에서 한 번에 수십 ms).
 *  - 장면 범위는 그물 덩어리마다 합친 범위를 두고 그물 객체가 바뀐 덩어리·바꾼 그물의 덩어리만 다시 합친다: 바꾸기·같은 객체 제자리 고치기·빼기·더하기·선분 묶음이 있는 장면에서
 *    sceneBounds와 비트까지 같다(±0·같은 값·깨진 좌표 그물)
 *  - 무늬가 없는 장면은 무늬 맞추기를 건너뛴다. 무늬가 있는 장면은 그대로(무늬를 쓰던 그물을 바꿔 아무도 쓰지 않으면 그 무늬를 지운다)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installDom } from './fakedom';
import { sceneBounds } from '../src/bounds';
import { boxMesh, checkerBmp, texturedBoxMesh } from '../src/synth';
import type { Box3, Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

function view(sc: Scene3d): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  v.setScene(sc);
  v.fit(false);
  v.renderNow();
  return v;
}

const allBox = (v: Viewer3d): Box3 => (v as unknown as { allBox: Box3 }).allBox;
const bits = (b: Box3): string => [...b.min, ...b.max].map((x) => (Object.is(x, -0) ? '-0' : String(x))).join(',');

/** 상자 i(원점 — 몇 개는 −0·같은 값 끝, 깨진 좌표 하나) */
function box(i: number, k = 0): Mesh3d {
  const m = boxMesh(`b${i}`, [i % 7 === 0 ? -0 : 0, 0, 0], [5 + k, 5, 3 + (i % 4)], [0.5, 0.5, 0.5, 1]);
  m.origin = [(i % 40) * 8 + k, Math.floor(i / 40) * 8, i % 11 === 0 ? -0 : 0];
  if (i === 333) m.positions[4] = NaN;
  return m;
}

describe('0.63.0 장면 범위 덩어리', () => {
  it('바꾸기·제자리 고치기·빼기·더하기 뒤 장면 범위가 sceneBounds와 비트까지 같다', () => {
    const n = 1500;
    const sc: Scene3d = {
      name: 's',
      units: 'mm',
      meshes: Array.from({ length: n }, (_, i) => box(i)),
      lines: [{ id: 'l', positions: new Float32Array([0, 0, 0, 10, 10, 10]), color: [1, 1, 1, 1] }],
    };
    const v = view(sc);
    const check = (label: string): void => expect(bits(allBox(v)), label).toBe(bits(sceneBounds(v.scene!)));
    check('처음');
    // 새 객체로 바꾸기(범위가 늘고, 줄고)
    v.setMesh({ ...box(5), origin: [-100, 0, 0] });
    check('바꾸기 늘림');
    v.setMesh(box(5));
    check('바꾸기 되돌림');
    v.setMesh({ ...box(1499), origin: [0, 2000, 0] });
    check('끝 그물 늘림');
    // 같은 객체를 제자리에서 고치고 setMesh(원점·정점 — vertices)
    const m = v.scene!.meshes[700]!;
    m.origin = [0, 0, 500];
    v.setMesh(m);
    check('같은 객체 원점');
    m.positions[2] = 900;
    v.setMesh(m, { vertices: [{ start: 0, count: 1 }] });
    check('같은 객체 정점');
    // 빼기(앞·가운데·끝 — 뒤 덩어리 차례가 밀린다), 더하기
    for (const id of ['b0', 'b700', 'b1499', 'b3']) {
      v.removeMesh(id);
      check(`빼기 ${id}`);
    }
    for (let i = n; i < n + 300; i++) v.setMesh(box(i, 3));
    check('더하기');
    v.setMesh({ ...box(9), origin: [-0, -0, -0] });
    check('−0 원점');
    // 장면을 바꾸면 처음부터
    v.setScene({ name: 't', units: 'mm', meshes: Array.from({ length: 300 }, (_, i) => box(i, 1)), lines: [] });
    check('새 장면');
    v.setMesh({ ...box(10, 1), origin: [5000, 0, 0] });
    check('새 장면 바꾸기');
  });

  it('무늬 장면은 무늬 맞추기 그대로: 무늬를 쓰던 그물을 바꿔 아무도 쓰지 않으면 그 무늬를 지운다', () => {
    const tex = { id: 'chk', data: checkerBmp(), mime: 'image/bmp' as const };
    const sc: Scene3d = { name: 'x', units: 'mm', meshes: [texturedBoxMesh('t', [0, 0, 0], [10, 10, 10], [1, 1, 1, 1], 'chk', 2), boxMesh('p', [20, 0, 0], [30, 10, 10], [0.5, 0.5, 0.5, 1])], lines: [], textures: [tex] };
    const v = view(sc);
    const rend = (v as unknown as { renderer: { textures: Map<string, unknown> } }).renderer;
    expect(rend.textures.has('chk')).toBe(true);
    v.setMesh(boxMesh('p', [20, 0, 0], [31, 10, 10], [0.5, 0.5, 0.5, 1]));
    expect(rend.textures.has('chk')).toBe(true);
    v.setMesh(boxMesh('t', [0, 0, 0], [10, 10, 10], [1, 1, 1, 1]));
    expect(rend.textures.has('chk')).toBe(false);
    // 다시 무늬 그물을 넣으면 다시 맞춘다
    v.setMesh(texturedBoxMesh('t2', [40, 0, 0], [50, 10, 10], [1, 1, 1, 1], 'chk', 2));
    expect(rend.textures.has('chk')).toBe(true);
  });
});
