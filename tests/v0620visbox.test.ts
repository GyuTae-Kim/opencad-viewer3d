/**
 * 0.62.0 숨김을 바꾼 그리기의 보이는 범위를 덩어리째(61차 남은 한계 "숨김을 프레임마다 바꾸면 … 그리기 밖 뷰어 몫" — 8만 숨김 하나씩 더함 프레임마다 약 20 ms).
 *  - 묶음 차례 64개 덩어리마다 모두 보일 때의 범위를 두고 숨긴 묶음이 든 덩어리만 묶음마다 합친다 — 묶음마다 unionBox로 합친 0.61.0 값과 비트까지 같다
 *    (±0 칸·빈 묶음·숨긴 이름·겉모습 행렬·그물 바꾸기·빼기·장면 바꾸기)
 *  - 숨김을 하나 더한 그리기에서 뷰어가 묻는 보이는지 수가 묶음 수만큼(0.61.0)이 아니라 숨긴 덩어리만큼
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installDom } from './fakedom';
import { emptyBox, unionBox } from '../src/bounds';
import { translation } from '../src/math';
import { boxMesh } from '../src/synth';
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

/** 그물 n개: 원점·크기가 다르고, 7번째마다 x 범위 끝이 ±0(앞뒤 차례가 바뀌는 0과 −0), 이름 g0~g4(11번째마다 이름 없음) */
function scene(n: number, seed = 1): Scene3d {
  let s = seed;
  const rnd = (): number => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const m = boxMesh(`b${i}`, [0, 0, 0], [1 + rnd() * 5, 1 + rnd() * 5, 1 + rnd() * 5], [0.5, 0.5, 0.5, 1], i % 11 === 0 ? undefined : `g${i % 5}`);
    if (i % 7 === 0) {
      // x 범위가 [−0, …] 또는 [0, …] — 원점 없이 위치 칸 그대로
      const p = m.positions as Float32Array;
      for (let k = 0; k < p.length; k += 3) if (p[k] === 0) p[k] = i % 14 === 0 ? -0 : 0;
    } else m.origin = [(rnd() - 0.5) * 2000, (rnd() - 0.5) * 2000, rnd() * 50];
    return m;
  });
  return { name: 's', units: 'mm', meshes, lines: [] };
}

type V = {
  items: Map<string, { item: Mesh3d & { group?: string } }>;
  visibleBox(): Box3;
  visBox: Box3 | null;
  boundsOf(it: Mesh3d): Box3;
  visible(id: string, g: string | undefined): boolean;
};

/** 0.61.0 셈: 묶음 차례대로 보이는 묶음 범위를 unionBox로 */
function plain(v: Viewer3d): Box3 {
  const V = v as unknown as V;
  let b = emptyBox();
  for (const it of V.items.values()) if (V.visible(it.item.id, it.item.group)) b = unionBox(b, V.boundsOf(it.item));
  return b;
}

function same(v: Viewer3d, label: string): void {
  const V = v as unknown as V;
  V.visBox = null;
  const a = V.visibleBox(), b = plain(v);
  const flat = (x: Box3): number[] => [...x.min, ...x.max];
  // 빈 범위면 장면 전체(같은 길)
  if (b.min[0] > b.max[0]) return;
  const A = flat(a), B = flat(b);
  for (let i = 0; i < 6; i++) if (!Object.is(A[i], B[i])) expect([label, i, A[i]]).toEqual([label, i, B[i]]);
}

describe('0.62.0 보이는 범위 덩어리', () => {
  it('unionBox를 차례대로 합친 값 = 덩어리마다 합친 범위를 차례대로 합친 값(±0·같은 값·빈 상자·한도 밖 꼭짓점 — 비트까지)', () => {
    let s = 3;
    const rnd = (): number => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = (): number => {
      const r = rnd();
      return r < 0.15 ? 0 : r < 0.3 ? -0 : r < 0.35 ? 1e30 : r < 0.38 ? Number.NaN : Math.round((r - 0.5) * 8) / 2;
    };
    for (let t = 0; t < 200; t++) {
      const boxes: Box3[] = Array.from({ length: 1 + Math.floor(rnd() * 300) }, () => {
        const a = [pick(), pick(), pick()], b = [pick(), pick(), pick()];
        return rnd() < 0.1 ? { min: [b[0]!, b[1]!, b[2]!], max: [a[0]!, a[1]!, a[2]!] } : { min: [Math.min(a[0]!, b[0]!), Math.min(a[1]!, b[1]!), a[2]!], max: [Math.max(a[0]!, b[0]!), Math.max(a[1]!, b[1]!), b[2]!] };
      });
      let seq = emptyBox();
      for (const b of boxes) seq = unionBox(seq, b);
      const k = 1 + Math.floor(rnd() * 70);
      let ch = emptyBox();
      for (let i = 0; i < boxes.length; i += k) {
        let c = emptyBox();
        for (let j = i; j < Math.min(boxes.length, i + k); j++) c = unionBox(c, boxes[j]!);
        ch = unionBox(ch, c);
      }
      const A = [...seq.min, ...seq.max], B = [...ch.min, ...ch.max];
      for (let i = 0; i < 6; i++) if (!Object.is(A[i], B[i])) expect([t, k, i, B[i]]).toEqual([t, k, i, A[i]]);
    }
  });

  it('숨김·이름 숨김·겉모습 행렬·그물 바꾸기·빼기·장면 바꾸기에서 묶음마다 합친 값과 비트까지 같다', () => {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false });
    views.push(v);
    v.setScene(scene(1000));
    v.renderNow();
    const ids = Array.from({ length: 1000 }, (_, i) => `b${i}`);
    for (const k of [0, 14, 7, 999, 500, 63, 64, 65, 127, 128]) {
      v.setItemVisible(ids[k]!, false);
      same(v, `hide ${k}`);
    }
    v.setGroupVisible('g2', false);
    same(v, 'group g2');
    v.setGroupVisible('g0', false);
    same(v, 'group g0');
    v.setGroupVisible('g2', true);
    same(v, 'group g2 on');
    // 범위 끝 묶음(±0 x 끝·가장 먼 묶음)을 숨기고 켜기
    let far = 0, fx = -Infinity;
    const V = v as unknown as V;
    for (const [i, id] of ids.entries()) {
      const b = V.boundsOf(V.items.get(id)!.item);
      if (b.max[0] > fx) {
        fx = b.max[0];
        far = i;
      }
    }
    v.setItemVisible(ids[far]!, false);
    same(v, 'far');
    v.setItemVisible(ids[far]!, true);
    same(v, 'far on');
    // 겉모습 행렬(판이 올라 덩어리를 다시 센다)
    v.setItemMatrix('b300', translation([5000, 0, 0]));
    same(v, 'look');
    v.setItemVisible('b300', false);
    same(v, 'look hide');
    v.setItemVisible('b300', true);
    v.setItemMatrix('b300', null);
    same(v, 'look off');
    // 그물 바꾸기·빼기·더하기
    v.setMesh({ ...boxMesh('b301', [0, 0, 0], [3, 3, 3], [1, 0, 0, 1], 'g1'), origin: [-9000, 1, 1] });
    same(v, 'setMesh');
    v.removeMesh('b302');
    same(v, 'remove');
    v.setMesh({ ...boxMesh('new', [0, 0, 0], [3, 3, 3], [1, 0, 0, 1], 'g3'), origin: [0, 9000, 1] });
    same(v, 'add');
    v.setGroupVisible('g3', false);
    same(v, 'add hidden group');
    // 장면 바꾸기(숨김은 그대로 둔 채)
    v.setScene(scene(700, 7));
    v.setItemVisible('b5', false);
    same(v, 'scene');
    v.setGroupVisible('g4', false);
    same(v, 'scene group');
  });

  it('숨김을 하나 더한 그리기에서 뷰어가 묻는 보이는지 수는 숨긴 덩어리 묶음 수만큼(렌더러 몫 그물 수는 그대로)', () => {
    const n = 3000;
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false });
    views.push(v);
    v.setScene(scene(n));
    v.renderNow();
    const V = v as unknown as V;
    const orig = V.visible.bind(v);
    let calls = 0;
    V.visible = (id, g) => (calls++, orig(id, g));
    v.setItemVisible('b10', false);
    v.renderNow();
    // 첫 숨김: 덩어리를 세고(묶음마다 범위 — 보이는지는 묻지 않는다) 숨긴 덩어리 하나만 묻는다 + 렌더러가 그물마다 한 번
    expect(calls).toBeLessThanOrEqual(n + 64);
    for (let k = 1; k <= 20; k++) {
      calls = 0;
      v.setItemVisible(`b${(k * 131) % n}`, false);
      v.renderNow();
      expect(calls, `step ${k}`).toBeLessThanOrEqual(n + 64 * (k + 1));
    }
    same(v, 'steps');
  });
});
