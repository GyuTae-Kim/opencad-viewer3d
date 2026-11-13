/**
 * 0.66.0 그물을 빼거나 바꾸거나 더한 뒤 첫 프레임과 뼈대를 다시 만드는 그리기(65차 남은 한계 — 가짜 WebGL 8만에서 빼기 뒤 첫 프레임은 잘라내기 덩어리가 뺀 자리 뒤로
 * 밀려 뒤 덩어리를 모두 다시 셌고, 다시 굽기 뒤처럼 뼈대를 다시 만드는 그리기는 21~26 ms였다).
 *  - 빼기·바꾸기·끝에 더하기 뒤 잘라내기 덩어리는 그 기록이 든 덩어리만 고친다: 다른 덩어리의 감싸는 자료는 그 객체 그대로이고, 덩어리 기록을 이으면 장면 차례와 같으며,
 *    덩어리마다 감싸는 자료가 그 기록으로 처음부터 센 것과 같다. 잘라낸 그물·그린 도형이 덩어리를 프레임마다 처음부터 세는 뷰어와 같다(묶음 있는·없는 장면 — 덩어리 하나를
 *    모두 빼기·앞·끝·가운데 빼기·같은 꼴·꼴 다른 바꾸기·덩어리를 넘게 더하기·숨김·카메라). 뼈대가 있는 장면에서 고친 뒤 다음 그리기는 기록을 견주지 않는다
 *  - 뼈대를 다시 만든 그리기(뼈대 잊기·묶음 다시 굽기·묶어 그리기 끄고 켜기 뒤): 덩이·덩이 판정·덩이 숨긴 번호가 기록마다 센 것과 같고, 그린 도형이 뼈대 없이 그물마다
 *    훑는 뷰어(0.59.0 길)와 같다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { cullBox, type CullBox, cullUnion } from '../src/cull';
import { boxMesh } from '../src/synth';
import type { MergeBlock, MergeGroup, MergeOrder, MeshRec } from '../src/renderer';
import type { Mesh3d, Rgba, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(async () => {
  dom = installDom();
  expect(await Viewer3d.preloadMerging()).toBe(true);
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

/** 상자 i(가로 40개 격자): 묶음 이름 g0~g3, 정점 색(3번째마다), 윤곽선 없음(13번째마다), 반투명(29번째마다 — 묶음 밖), 법선(5번째마다 — 다른 묶음) */
function box(i: number, k = 0, id = `b${i}`, group = `g${i % 4}`): Mesh3d {
  const col: Rgba = [0.4 + (i % 5) * 0.1, 0.5, 0.6, i % 29 === 7 ? 0.5 : 1];
  const m = boxMesh(id, [0, 0, 0], [6 - k, 6 + k, 4 + (i % 3) - k], col, group);
  m.origin = [(i % 40) * 10, Math.floor(i / 40) * 10, k];
  if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i + k) % 10) / 10));
  if (i % 13 === 0) delete m.edges;
  if (i % 5 === 1) m.normals = Float32Array.from({ length: 24 }, (_, j) => (j % 3 === 2 ? 1 : 0));
  return m;
}
/** 삼각기둥(상자와 꼴이 다르다) */
function prism(id: string, i: number, group = `g${i % 4}`): Mesh3d {
  const s = 5, h = 3;
  const positions = new Float32Array([0, 0, 0, s, 0, 0, 0, s, 0, 0, 0, h, s, 0, h, 0, s, h]);
  const indices = new Uint32Array([0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5]);
  const e = [0, 1, 1, 2, 2, 0, 3, 4, 4, 5, 5, 3, 0, 3, 1, 4, 2, 5];
  const edges = new Float32Array(e.length * 3);
  e.forEach((x, j) => edges.set(positions.subarray(x * 3, x * 3 + 3), j * 3));
  return { id, positions, indices, edges, color: [0.9, 0.4, 0.2, 1], closed: true, group, origin: [(i % 40) * 10, Math.floor(i / 40) * 10, 2] };
}
const grid = (n: number): Scene3d => ({ name: 'g', units: 'mm', meshes: Array.from({ length: n }, (_, i) => box(i)), lines: [] });

type Chunks = { recs: MeshRec[][]; box: (CullBox | null)[]; sync?: boolean };
type Rend = {
  meshes: MeshRec[];
  frameNo: number;
  cullChunks: Chunks;
  mgOrder: MergeOrder | null;
  visMemo: { ord: MergeOrder; key: number; seq: number; list: MeshRec[] } | null;
  orderOff: boolean;
  forgetOrder(): void;
  render(...a: unknown[]): void;
};
type W = { v: Viewer3d; gl: FakeGL; r: Rend };

/** fresh면 그리기마다 잘라내기 덩어리를 버린다(덩어리를 처음부터 센다 — 0.51.0~0.65.0의 덩어리 판단과 같은 결과), off면 뼈대 없이(0.59.0 길) */
function view(sc: Scene3d, o: { fresh?: boolean; merging?: boolean; off?: boolean } = {}): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const r = (v as unknown as { renderer: Rend }).renderer;
  if (o.fresh) {
    const r0 = r.render.bind(r);
    r.render = (...a: unknown[]) => {
      // n은 0.65.0까지의 덩어리 그물 수 목록(그 판으로 돌려도 처음부터 세게)
      r.cullChunks = { recs: [], n: [], box: [] } as Chunks;
      r0(...a);
    };
  }
  if (o.off) r.orderOff = true;
  v.setRenderOptions({ merging: o.merging ?? true });
  v.setScene(sc);
  v.fit(false);
  v.zoomBy(0.35);
  v.orbitBy(0.3, 0.15);
  const w: W = { v, gl: (v.canvas as unknown as FakeElement).gl!, r };
  settle(w);
  return w;
}
function settle(w: W): void {
  w.v.renderNow();
  for (let i = 0; i < 200 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}
/** 이 그리기에서 잘라낸 그물 id(장면 차례) */
const culled = (w: W): string[] => w.r.meshes.filter((r) => r.culledAt === w.r.frameNo).map((r) => r.src.id);
const same = (a: CullBox | null, b: CullBox | null): boolean => (!a || !b ? !a && !b : a.length === b.length && a.every((x, i) => Object.is(x, b[i])));

/** 덩어리 기록을 이으면 장면 차례와 같고, 감싸는 자료가 그 기록으로 처음부터 센 것과 같다 */
function checkChunks(w: W, label: string): void {
  const C = w.r.cullChunks, M = w.r.meshes;
  expect(C.recs.length, label).toBe(C.box.length);
  let j = 0;
  C.recs.forEach((R, k) => {
    expect(R.length, `${label} 덩어리 ${k} 그물 수`).toBeLessThanOrEqual(64);
    for (const r of R) expect(r === M[j++], `${label} 덩어리 ${k} 기록`).toBe(true);
    const want = cullUnion(R.map((r) => cullBox(r.local, r.model)));
    expect(same(C.box[k], want), `${label} 덩어리 ${k} 감싸는 자료`).toBe(true);
  });
  expect(j, label).toBe(M.length);
}

describe('0.66.0 빼기·바꾸기·더하기 뒤 잘라내기 덩어리는 그 덩어리만', () => {
  it('고친 덩어리 밖의 감싸는 자료는 그대로이고, 잘라낸 그물·그린 도형이 덩어리를 처음부터 세는 뷰어와 같다(묶음 있는·없는 장면)', () => {
    for (const merging of [true, false]) {
      const n = 700;
      const fast = view(grid(n), { merging }), slow = view(grid(n), { merging, fresh: true });
      expect(fast.v.stats.culled, `${merging} 잘라냄`).toBeGreaterThan(50);
      expect(fast.v.stats.culled, `${merging} 남김`).toBeLessThan(n - 50);
      if (merging) expect(fast.r.mgOrder).not.toBeNull();
      checkChunks(fast, `${merging} 처음`);
      // [이름, 편집, 다시 센 덩어리 수 한도]
      const ops: [string, (v: Viewer3d) => void, number][] = [
        ['가운데 빼기', (v) => void v.removeMesh('b300'), 1],
        ['앞 빼기', (v) => void v.removeMesh('b0'), 1],
        ['끝 빼기', (v) => void v.removeMesh(`b${n - 1}`), 1],
        ['같은 꼴 바꾸기', (v) => void v.setMesh(box(200, 1)), 1],
        ['꼴 다른 바꾸기', (v) => void v.setMesh(prism('b201', 201)), 1],
        ['묶음 밖 그물 빼기', (v) => void v.removeMesh('b36'), 1],
        ['화면 밖으로 옮겨 바꾸기', (v) => void v.setMesh({ ...box(202), origin: [-900, -900, 0] }), 1],
        ['더하기', (v) => void v.setMesh(box(n, 0, 'a0')), 1],
        ['덩어리 하나를 모두 빼기', (v) => {
          for (let i = 400; i < 470; i++) v.removeMesh(`b${i}`);
        }, 3],
        ['덩어리를 넘게 더하기', (v) => {
          for (let i = 0; i < 90; i++) v.setMesh(box(n + 1 + i, 0, `a${i + 1}`));
        }, 3],
        ['숨김', (v) => (v.setItemVisible('b100', false), v.setGroupVisible('g2', false)), 0],
        ['숨긴 그물 빼기·바꾸기', (v) => (v.removeMesh('b104'), v.setMesh(prism('b108', 108))), 2],
        ['여럿 섞어', (v) => {
          for (let i = 500; i < 520; i++) v.removeMesh(`b${i}`);
          for (let i = 520; i < 530; i++) v.setMesh(prism(`b${i}`, i));
          for (let i = 530; i < 540; i++) v.setMesh(box(i, 1));
        }, 99],
      ];
      for (const [label0, fn, most] of ops) {
        const label = `${merging} ${label0}`;
        const before = fast.r.cullChunks.box.slice();
        fn(fast.v);
        fn(slow.v);
        // 그 덩어리만 고쳤으면 다음 그리기는 기록을 견주지 않는다(뼈대가 없는 장면도)
        expect(fast.r.cullChunks.sync, `${label} 견주지 않음`).toBe(true);
        const b = expandFrame(fast.gl, () => fast.v.renderNow()), a = expandFrame(slow.gl, () => slow.v.renderNow());
        expect(b.length, label).toBe(a.length);
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
        expect(culled(fast), label).toEqual(culled(slow));
        expect(fast.v.stats.culled, label).toBe(slow.v.stats.culled);
        checkChunks(fast, label);
        const kept = new Set(before);
        const redone = fast.r.cullChunks.box.filter((x) => x && !kept.has(x)).length;
        expect(redone, `${label} 다시 센 덩어리`).toBeLessThanOrEqual(most);
        // 카메라를 돌려도 같다(덩어리 나눔과 상관없는 판단)
        fast.v.orbitBy(0.05, 0);
        slow.v.orbitBy(0.05, 0);
        fast.v.renderNow();
        slow.v.renderNow();
        expect(culled(fast), `${label} 돌림`).toEqual(culled(slow));
      }
      expect(fast.r.cullChunks.recs.some((R) => R.length < 64), `${merging} 그물 수가 다른 덩어리`).toBe(true);
    }
  });
});

describe('0.66.0 뼈대를 다시 만드는 그리기', () => {
  /** 뼈대가 기록마다 센 것과 같은지(덩이 = 같은 묶음의 잇단 번호, 판정, 기록의 덩이 번호, 덩이 숨긴 번호) */
  function checkOrder(w: W, label: string): void {
    const O = w.r.mgOrder;
    expect(O, label).not.toBeNull();
    const M = w.r.meshes;
    let j = 0;
    for (const x of O!.items) {
      if ('src' in x) {
        expect(x === M[j] && !x.mg && x.bk === -1, `${label} 묶음 밖 ${j}`).toBe(true);
        j++;
        continue;
      }
      const k = x as MergeBlock;
      let ok = true, edges = !!k.g.thin;
      const hid: number[] = [];
      for (let i = k.a; i < k.b; i++, j++) {
        const r = M[j]!;
        expect(r.mg === k.g && r.mi === i && O!.blocks[r.bk!] === k, `${label} 덩이 ${j}`).toBe(true);
        if (r.transparent || r.back || r.pbr || r.tex) ok = false;
        if (!r.edges) edges = false;
        if (r.visAt !== w.r.visMemo!.seq) hid.push(i);
      }
      // 덩이는 잇지 못할 때 끊긴다(다음 기록이 같은 묶음의 다음 번호가 아니다)
      const nx = M[j];
      expect(!nx || nx.mg !== k.g || nx.mi !== k.b, `${label} 덩이 끝 ${j}`).toBe(true);
      expect([k.ok, k.edges], `${label} 판정`).toEqual([ok, edges]);
      expect(k.hid, `${label} 숨긴 번호`).toEqual(hid);
    }
    expect(j, label).toBe(M.length);
  }

  it('뼈대 잊기·묶음 다시 굽기·묶어 그리기 끄고 켜기 뒤 뼈대와 덩이 숨긴 번호가 기록마다 센 것과 같고, 그린 도형이 뼈대 없는 뷰어와 같다', () => {
    const n = 600;
    const fast = view(grid(n)), slow = view(grid(n), { off: true, fresh: true });
    const ops: [string, (w: W) => void][] = [
      ['숨김', (w) => (w.v.setItemVisible('b10', false), w.v.setItemVisible('b11', false), w.v.setGroupVisible('g3', false))],
      ['뼈대 잊기', (w) => w.r.forgetOrder()],
      ['강조', (w) => w.v.highlight(['b120', 'b121', 'b301'])],
      ['다시 굽기(묶음의 ¼ 넘게 빼기)', (w) => {
        for (let i = 0; i < 200; i += 2) w.v.removeMesh(`b${i}`);
      }],
      ['꼴 다른 바꾸기 여럿 뒤 다시 굽기', (w) => {
        for (let i = 201; i < 400; i += 2) w.v.setMesh(prism(`b${i}`, i));
      }],
      ['묶어 그리기 끄고 켜기', (w) => (w.v.setRenderOptions({ merging: false }), w.v.renderNow(), w.v.setRenderOptions({ merging: true }))],
      ['숨김 풀기', (w) => (w.v.setGroupVisible('g3', true), w.v.setItemVisible('b11', true))],
      ['다시 뼈대 잊기', (w) => w.r.forgetOrder()],
    ];
    let rebuilt = 0;
    for (const [label, fn] of ops) {
      const o0 = fast.r.mgOrder;
      fn(fast);
      fn(slow);
      settle(fast);
      settle(slow);
      const b = expandFrame(fast.gl, () => fast.v.renderNow()), a = expandFrame(slow.gl, () => slow.v.renderNow());
      expect(b.length, label).toBe(a.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
      expect(fast.r.meshes.map((r) => r.src.id), label).toEqual(slow.r.meshes.map((r) => r.src.id));
      checkOrder(fast, label);
      if (fast.r.mgOrder !== o0) rebuilt++;
    }
    expect(rebuilt).toBeGreaterThanOrEqual(4);
    // 묶음 그물 깃발은 묶음 기록과 같다
    for (const g of new Set(fast.r.meshes.map((r) => r.mg).filter((g): g is MergeGroup => !!g))) {
      const F = (g as MergeGroup & { pf?: Uint8Array }).pf;
      if (!F) continue;
      g.recs.forEach((r, i) => expect(F[i], `깃발 ${i}`).toBe((r.transparent || r.back || r.pbr || r.tex ? 1 : 0) | (r.edges ? 0 : 2)));
    }
  });
});
