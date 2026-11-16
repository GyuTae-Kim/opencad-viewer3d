/**
 * 0.73.0 그물 기록 칸 차례·단면 테두리 선분 차례(0.72.0 남은 한계):
 *  - 렌더러 그물 기록(MeshRec)은 그리기마다 그물마다 읽는 칸(보이는 목록·인스턴싱 뼈대 견주기·고치기·윤곽선 차례·묶어 그리기·잘라내기·겉모습)을 글자 객체 앞에 모아 둔다 —
 *    0.72.0은 늦게 더하던 칸 19개를 글자 객체 끝에 더해 그 칸들이 기록의 먼 쪽(Node 432 B 기록의 뒤 3분의 1)에 있었다. 칸 모음·꼴 하나(0.72.0)는 그대로
 *  - 단면 테두리(뷰어 meshCut → sectionSegments)는 BVH가 있어도 삼각형 번호 차례로 선분을 낸다 — 0.72.0까지는 BVH 차례라 쉬는 틈에 만드는 BVH가 단면을 처음 자를 때
 *    있었는지에 따라 같은 테두리의 선분 차례가 달랐다(STEP 86차 — 그린 선분 모음은 같다)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { buildBvh } from '../src/bvh';
import { planeFrom, sectionSegments } from '../src/section';
import { boxMesh, sphereMesh } from '../src/synth';
import type { Mesh3d, Rgba, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';

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

const PAL: Rgba[] = [
  [0.7, 0.4, 0.3, 1],
  [0.3, 0.6, 0.8, 1],
  [0.5, 0.5, 0.5, 1],
];

/** 그물 기록 글자 객체 앞에 모은 칸(이 차례 그대로 — 그리기마다 그물마다 읽는 칸) */
const HOT = ['src', 'visAt', 'visNo', 'ipm', 'ipc', 'mg', 'ipe', 'ipf', 'ipz', 'ipd', 'ipx', 'culledAt', 'model', 'edges', 'geo', 'lkv', 'lko', 'transparent', 'back', 'cull', 'mi', 'bk'];

/** STEP 꼴 반복 부품(꼴 셋 — 배열을 함께 씀, 큰 원점, 둘째마다 회전)과 제 배열 상자 own개(묶어 그리기 덩이) */
function scene(n = 18, own = 0): Scene3d {
  const shape = (k: string, h: number): Mesh3d => {
    const m = boxMesh(k, [-3, -3, -2], [3, 3, h], PAL[0]!);
    m.origin = [120000, -80000, 2500];
    return m;
  };
  const S = [shape('a', 2), shape('b', 3), shape('c', 4)];
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < n; i++)
    S.forEach((s, k) => {
      const id = `${'abc'[k]}${i}`;
      const m = placeAt((i % 6) * 10 - 120000, Math.floor(i / 6) * 10 + 80000 + k * 60, -2500, i % 2 ? 30 * k + 45 : 0, i % 4 === 1);
      meshes.push({ ...s, id, name: id, group: `g${i % 3}`, color: PAL[(i + k) % 3]!, matrix: m, closed: true });
    });
  for (let i = 0; i < own; i++) {
    const m = boxMesh(`m${i}`, [0, 0, 0], [5, 5, 3 + (i % 4)], PAL[i % 3]!, `g${i % 3}`);
    m.origin = [(i % 20) * 8 - 50, Math.floor(i / 20) * 8 + 60, -1];
    meshes.splice(i % 2 ? meshes.length : 24, 0, { ...m, closed: true });
  }
  return { name: 's', units: 'mm', meshes, lines: [] };
}

describe('0.73.0 그물 기록 칸 차례', () => {
  it('모든 그물 기록은 그리기마다 읽는 칸을 글자 객체 앞에 같은 차례로 가진다(흔한 흐름 뒤에도 — 칸 모음·꼴 하나는 0.72.0 그대로)', async () => {
    expect(await Viewer3d.preloadMerging()).toBe(true);
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
    views.push(v);
    v.setRenderOptions({ merging: 'on' });
    v.setScene(scene(18, 240));
    v.fit(false);
    v.orbitBy(0.4, 0.2);
    for (let i = 0; i < 50 && (v.stats.instanced.pending > 0 || v.stats.merged.pending > 0); i++) v.renderNow();
    v.renderNow();
    const r = (v as unknown as { renderer: { meshes: Record<string, unknown>[] } }).renderer;
    const check = (label: string): void => {
      const R = r.meshes;
      const k0 = Object.keys(R[0]!);
      // 칸 모음은 0.72.0과 같다(51칸 — 늦게 더하는 칸 없음)
      expect(k0.length, `${label} 칸 수`).toBe(51);
      expect(k0.slice(0, HOT.length), `${label} 앞 칸`).toEqual(HOT);
      for (const x of R) expect(Object.keys(x).join(','), `${label} ${(x.src as { id: string }).id}`).toBe(k0.join(','));
    };
    check('올린 뒤');
    // 묶어 그리기 덩이·인스턴싱 묶음이 함께 있다
    expect(r.meshes.some((x) => !!x.mg)).toBe(true);
    expect(r.meshes.some((x) => !x.mg && (x.ipf as number) > 0)).toBe(true);
    const flows: [string, () => void][] = [
      ['숨김', () => (v.setItemVisible('a3', false), v.setItemVisible('m7', false))],
      ['강조', () => v.highlight(['a2', 'm9', 'b4'])],
      ['확대', () => v.zoomBy(0.05)],
      ['단면', () => v.setSection({ normal: [0, 1, 0], offset: 80030 })],
      ['숨은 선', () => (v.setSection(null), v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 }))],
      ['분해', () => (v.setRenderMode('shadedEdges'), v.setItemLooks([['b5', { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1] }], ['m11', { color: [0.9, 0.1, 0.1, 1] }]]))],
      ['빼기·더하기·바꾸기', () => {
        v.removeMesh('m5');
        v.setMesh({ ...v.scene!.meshes.find((m) => m.id === 'm6')!, id: 'n0', name: 'n0', origin: [400, 400, 0] });
        v.setMesh({ ...v.scene!.meshes.find((m) => m.id === 'c4')!, color: [0.2, 0.9, 0.2, 1] });
      }],
    ];
    for (const [label, fn] of flows) {
      fn();
      for (let i = 0; i < 3; i++) v.renderNow();
      check(label);
    }
  });
});

/** 점 차례를 섞은 구(삼각형 번호 차례와 BVH 잎 차례가 다르다) */
function shuffled(id: string, c: readonly number[], r: number): Mesh3d {
  const m = sphereMesh(id, c, r, 48, 24, PAL[1]!);
  const I = m.indices!;
  const n = I.length / 3;
  const out = new Uint32Array(I.length);
  // 결정된 섞기(번호 k → (k × 7919) mod n — n과 서로소일 때 순열)
  let step = 7919;
  while (gcd(step, n) !== 1) step += 2;
  for (let k = 0; k < n; k++) {
    const t = (k * step) % n;
    out.set(I.subarray(t * 3, t * 3 + 3), k * 3);
  }
  return { ...m, indices: out };
}
function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

describe('0.73.0 단면 테두리 선분 차례', () => {
  it('sectionSegments는 BVH가 있어도 BVH 없이 훑은 것과 비트까지 같다(선분 차례 포함)', () => {
    for (const m of [sphereMesh('s', [10, -5, 3], 20, 96, 48, PAL[0]!), shuffled('q', [0, 0, 0], 7)]) {
      const bvh = buildBvh('triangle', m.positions, m.indices);
      for (const [nx, ny, nz, d] of [
        [0.3, 0.2, 0.9, 3],
        [1, 0, 0, 0],
        [0, 1, 0, -3.5],
        [0.5, -0.7, 0.2, 2],
      ] as const) {
        const n = planeFrom([nx, ny, nz], 0)!;
        const c = m.id === 's' ? [10, -5, 3] : [0, 0, 0];
        const off = n.normal[0] * c[0]! + n.normal[1] * c[1]! + n.normal[2] * c[2]! + d;
        const plane: [number, number, number, number] = [n.normal[0], n.normal[1], n.normal[2], -off];
        const a = sectionSegments(m.positions, m.indices, plane, bvh);
        const b = sectionSegments(m.positions, m.indices, plane);
        expect(a.length, `${m.id} ${nx},${ny},${nz},${d}`).toBeGreaterThan(0);
        expect(Array.from(a), `${m.id} ${nx},${ny},${nz},${d}`).toEqual(Array.from(b));
      }
    }
  });

  it('뷰어 단면 테두리는 BVH를 먼저 만든 뷰어와 만들지 않은 뷰어가 같은 그린 도형이다(켜기·끌기·숨김)', () => {
    const sc = (): Scene3d => ({
      name: 'q',
      units: 'mm',
      meshes: [
        { ...shuffled('q0', [0, 0, 0], 7), closed: true },
        { ...shuffled('q1', [0, 0, 0], 5), color: PAL[2]!, matrix: placeAt(18, 2, 0, 30, false), closed: true },
        { ...sphereMesh('s0', [-16, 3, 1], 6, 40, 20, PAL[0]!), closed: true },
      ],
      lines: [],
    });
    const mk = (pre: boolean): { v: Viewer3d; gl: FakeGL } => {
      const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
      views.push(v);
      const s = sc();
      v.setScene(s);
      v.fit(false);
      v.orbitBy(0.4, 0.2);
      v.renderNow();
      // 쉬는 틈에 만드는 BVH를 미리(단면을 처음 자를 때 이미 있는 꼴)
      if (pre) for (const m of s.meshes) (v as unknown as { bvhFor(k: string, p: Float32Array, i: Uint32Array | undefined, b: boolean): unknown }).bvhFor('triangle', m.positions, m.indices, true);
      return { v, gl: (v.canvas as unknown as FakeElement).gl! };
    };
    const A = mk(true), B = mk(false);
    const same = (label: string, fn: (v: Viewer3d) => void): void => {
      fn(A.v);
      fn(B.v);
      const a = expandFrame(A.gl, () => A.v.renderNow()), b = expandFrame(B.gl, () => B.v.renderNow());
      expect(a.length, label).toBe(b.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(a[i], `${label} #${i}`).toBe(b[i]);
    };
    same('켜기', (v) => v.setSection({ normal: [0.3, 0.2, 0.9], offset: 0.6 }));
    for (const t of [-2, 1.5, 3.2]) same(`끌기 ${t}`, (v) => v.setSection({ normal: [0.3, 0.2, 0.9], offset: t }));
    same('숨김', (v) => v.setItemVisible('s0', false));
    same('축 x', (v) => (v.setItemVisible('s0', true), v.setSection({ normal: [1, 0, 0], offset: 1.25 })));
  });
});
