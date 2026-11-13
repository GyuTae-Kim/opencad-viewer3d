/**
 * 0.65.0 그물을 바꾸거나 빼거나 더한 뒤 첫 프레임(64차 남은 한계 — 가짜 WebGL 8만 약 35~67 ms: 그리기 뼈대 다시 만들기, 보이는 목록·덩이 숨긴 번호를 그물마다 다시 묻기,
 * 잘라내기 덩어리 견주기, 묶음 다시 살피기).
 *  - 그물 기록 하나를 바꾸거나(같은 꼴 — 묶음 자리 갈아 쓰기, 꼴이 다름 — 묶음에서 빠짐, 묶음 밖 그물) 빼거나 끝에 더하면 뼈대를 다시 만들지 않고 고친다:
 *    고친 뼈대의 덩이·묶음 밖 그물·차례(at)·덩이 판정·덩이 숨긴 번호·빠진·쓰는 그물 수가 처음부터 만든 뼈대와 같고, 보이는 목록이 처음부터 물은 목록과 같다
 *  - 그린 도형이 뼈대를 늘 다시 만드는 뷰어(0.64.0 길)와 같다(tests/drawexpand.ts) — 숨김·묶음 숨김·강조·바꾼 뒤 숨김·숨긴 묶음에 더하기·더한 뒤 바꾸기·빼기,
 *    덩이 앞·끝·가운데·하나뿐인 덩이 빼기, 묶음 다시 굽기(planLoose)가 끼는 차례
 *  - 숨김 판이 같으면 보이는 목록을 다시 만들 때 이미 물은 기록은 다시 묻지 않는다(묶음 없는 장면도 — 렌더러가 묻는 수)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { orderValid, planLoose } from '../src/mergegl';
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

/** 상자 i: 묶음 이름 g0~g3, 정점 색(3번째마다), 윤곽선 없음(13번째마다), 반투명(29번째마다 — 묶음 밖), 법선(5번째마다 — 다른 묶음) */
function box(i: number, k = 0, id = `b${i}`, group = `g${i % 4}`): Mesh3d {
  const col: Rgba = [0.4 + (i % 5) * 0.1, 0.5, 0.6, i % 29 === 7 ? 0.5 : 1];
  const m = boxMesh(id, [0, 0, 0], [6 - k, 6 + k, 4 + (i % 3) - k], col, group);
  m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, k];
  if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i + k) % 10) / 10));
  if (i % 13 === 0) delete m.edges;
  // 법선을 준 그물(5번째마다)은 묶음 열쇠가 달라 다른 묶음 — 장면 차례에서 두 묶음의 덩이가 엇갈린다
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
  return { id, positions, indices, edges, color: [0.9, 0.4, 0.2, 1], closed: true, group, origin: [(i % 30) * 10, Math.floor(i / 30) * 10, 2] };
}
const grid = (n: number): Scene3d => ({ name: 'g', units: 'mm', meshes: Array.from({ length: n }, (_, i) => box(i)), lines: [] });

type Rend = {
  meshes: MeshRec[];
  mgOrder: MergeOrder | null;
  visMemo: { ord: MergeOrder; key: number; seq: number; list: MeshRec[] } | null;
  mgGroups: Set<MergeGroup>;
  forgetOrder(): void;
  editOrder(...a: unknown[]): void;
  swapOrder(...a: unknown[]): boolean;
  renderState?: unknown;
};
type W = { v: Viewer3d; gl: FakeGL; r: Rend; forgets: { n: number } };

function view(sc: Scene3d, patch: boolean, merging = true): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const r = (v as unknown as { renderer: Rend }).renderer;
  const forgets = { n: 0 };
  const f0 = r.forgetOrder.bind(r);
  r.forgetOrder = () => {
    forgets.n++;
    f0();
  };
  if (!patch) {
    // 0.64.0 길: 바꾸고 빼고 더할 때마다 뼈대를 잊는다
    r.editOrder = () => r.forgetOrder();
    r.swapOrder = () => false;
  }
  v.setRenderOptions({ merging });
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  const w: W = { v, gl: (v.canvas as unknown as FakeElement).gl!, r, forgets };
  w.v.renderNow();
  for (let i = 0; i < 100 && (v.stats.merged.pending > 0 || v.stats.instanced.pending > 0); i++) v.renderNow();
  v.renderNow();
  return w;
}

/** 처음부터 만든 뼈대(조각 orderBuild와 같은 셈 — 기록을 고치지 않는다) */
function freshOrder(M: readonly MeshRec[]): { items: string[]; at: number[] } {
  const items: string[] = [], at: number[] = [];
  let k: { g: MergeGroup; a: number; b: number; ok: boolean; edges: boolean } | null = null;
  const names = new Map<MergeGroup, number>();
  const gname = (g: MergeGroup): number => names.get(g) ?? (names.set(g, names.size), names.size - 1);
  for (let j = 0; j < M.length; j++) {
    const r = M[j]!;
    const g = r.mg;
    if (!g) {
      if (k) items.push(`g${gname(k.g)}[${k.a},${k.b})${k.ok ? 'o' : ''}${k.edges ? 'e' : ''}`);
      k = null;
      items.push(`r:${r.src.id}`);
      at.push(j);
      continue;
    }
    const plain = !r.transparent && !r.back && !r.pbr && !r.tex;
    if (k && k.g === g && k.b === r.mi) {
      k.b++;
      if (!plain) k.ok = false;
      if (!r.edges) k.edges = false;
    } else {
      if (k) items.push(`g${gname(k.g)}[${k.a},${k.b})${k.ok ? 'o' : ''}${k.edges ? 'e' : ''}`);
      k = { g, a: r.mi!, b: r.mi! + 1, ok: plain, edges: !!g.thin && !!r.edges };
      at.push(j);
    }
  }
  if (k) items.push(`g${gname(k.g)}[${k.a},${k.b})${k.ok ? 'o' : ''}${k.edges ? 'e' : ''}`);
  return { items, at };
}

/** 고친 뼈대가 처음부터 만든 것과 같은지(덩이·묶음 밖 그물·차례·판정·덩이 번호·숨긴 번호·묶음 수)와 보이는 목록이 처음부터 물은 목록과 같은지 */
function checkOrder(w: W, label: string): void {
  const O = w.r.mgOrder;
  if (!O) return;
  const M = w.r.meshes;
  const names = new Map<MergeGroup, number>();
  const gname = (g: MergeGroup): number => names.get(g) ?? (names.set(g, names.size), names.size - 1);
  const items = O.items.map((x) => ('src' in x ? `r:${x.src.id}` : `g${gname(x.g)}[${x.a},${x.b})${x.ok ? 'o' : ''}${x.edges ? 'e' : ''}`));
  const fresh = freshOrder(M);
  expect(O.n, label).toBe(M.length);
  expect(items, label).toEqual(fresh.items);
  expect([...O.at], label).toEqual(fresh.at);
  const vis = (r: MeshRec): boolean => w.v.isVisible(r.src.id);
  const VM = w.r.visMemo;
  O.items.forEach((x) => {
    if ('src' in x) {
      expect(x.bk, label).toBe(-1);
      return;
    }
    const k = x as MergeBlock;
    expect(O.blocks[k.g.recs[k.a]!.bk!], label).toBe(k);
    for (let i = k.a; i < k.b; i++) expect(k.g.recs[i]!.bk, label).toBe(k.g.recs[k.a]!.bk);
    expect([k.gd, k.gl], label).toEqual([k.g.dead, k.g.live]);
    if (VM && VM.ord === O) {
      const hid: number[] = [];
      for (let i = k.a; i < k.b; i++) if (!vis(k.g.recs[i]!)) hid.push(i);
      expect(k.hid, `${label} 숨긴 번호`).toEqual(hid);
    }
  });
  if (VM && VM.ord === O) expect(VM.list.map((r) => r.src.id), `${label} 보이는 목록`).toEqual(M.filter(vis).map((r) => r.src.id));
}

describe('0.65.0 그물을 바꾸거나 빼거나 더한 뒤 그리기 뼈대 고치기', () => {
  it('고친 뼈대·보이는 목록이 처음부터 만든 것과 같고, 그린 도형이 뼈대를 늘 다시 만드는 뷰어와 같다', () => {
    const n = 600;
    const fast = view(grid(n), true), slow = view(grid(n), false);
    expect(fast.v.stats.merged.groups).toBeGreaterThan(1);
    expect(fast.r.mgOrder).not.toBeNull();
    // 덩이 첫·끝 그물(장면 차례): 첫 덩이 [a, b)
    const k0 = fast.r.mgOrder!.blocks[0]!;
    const first = k0.g.recs[k0.a]!.src.id, last = k0.g.recs[k0.b - 1]!.src.id;
    const ops: [string, (v: Viewer3d) => void, boolean][] = [
      ['숨김', (v) => (v.setItemVisible('b10', false), v.setItemVisible('b11', false)), true],
      ['가운데 빼기', (v) => void v.removeMesh('b100'), true],
      ['덩이 첫 그물 빼기', (v) => void v.removeMesh(first), true],
      ['덩이 끝 그물 빼기', (v) => void v.removeMesh(last), true],
      ['숨긴 그물 빼기', (v) => void v.removeMesh('b10'), true],
      ['묶음 밖 그물 빼기', (v) => void v.removeMesh('b36'), true],
      ['꼴 다른 바꾸기', (v) => void v.setMesh(prism('b200', 200)), true],
      ['숨긴 그물 꼴 다른 바꾸기', (v) => void v.setMesh(prism('b11', 11)), true],
      ['같은 꼴 바꾸기', (v) => void v.setMesh(box(300, 1)), true],
      ['묶음 밖 그물 바꾸기', (v) => void v.setMesh(box(65, 2)), true],
      ['묶음 이름이 다른 꼴 다른 바꾸기', (v) => void v.setMesh(prism('b201', 201, 'g0')), true],
      ['더하기', (v) => void v.setMesh(box(700, 0, 'a1')), true],
      ['숨긴 묶음에 더하기', (v) => (v.setGroupVisible('g2', false), v.setMesh(box(701, 0, 'a2', 'g2'))), true],
      ['더한 뒤 바꾸기', (v) => (v.setMesh(box(702, 0, 'a3')), v.setMesh(prism('a3', 702))), true],
      ['더한 뒤 빼기', (v) => (v.setMesh(box(703, 0, 'a4')), v.removeMesh('a4')), true],
      ['강조', (v) => v.highlight(['b120', 'b121', 'a1']), true],
      ['강조한 그물 빼기·바꾸기', (v) => (v.removeMesh('b120'), v.setMesh(prism('b121', 121))), true],
      ['하나뿐인 덩이 빼기', (v) => (v.removeMesh('b240'), v.removeMesh('b242'), v.setGroupVisible('g2', true), v.removeMesh('b241')), true],
      ['여럿 한 번에', (v) => {
        for (let i = 400; i < 420; i++) v.removeMesh(`b${i}`);
        for (let i = 420; i < 430; i++) v.setMesh(prism(`b${i}`, i));
        for (let i = 430; i < 440; i++) v.setMesh(box(i, 1));
        for (let i = 0; i < 5; i++) v.setMesh(box(800 + i, 0, `c${i}`));
      }, false],
      ['바꾼 뒤 숨김', (v) => (v.setItemVisible('b430', false), v.setItemVisible('c1', false)), true],
    ];
    let shown = 0;
    for (const [label, fn, one] of ops) {
      const f0 = fast.forgets.n, o0 = fast.r.mgOrder;
      fn(fast.v);
      fn(slow.v);
      const b = expandFrame(fast.gl, () => fast.v.renderNow()), a = expandFrame(slow.gl, () => slow.v.renderNow());
      expect(b.length, label).toBe(a.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
      shown += b.length;
      expect(fast.r.meshes.map((r) => r.src.id), label).toEqual(slow.r.meshes.map((r) => r.src.id));
      for (const k of ['drawCalls', 'triangles'] as const) expect(fast.v.stats[k], `${label} ${k}`).toBe(slow.v.stats[k]);
      checkOrder(fast, label);
      // 뼈대를 잊지 않았다(묶음 다시 굽기가 끼면 뼈대가 맞지 않아 다시 만든다 — 그것은 잊기가 아니다)
      if (one) {
        expect(fast.forgets.n - f0, `${label} 뼈대 잊기`).toBe(0);
        expect(fast.r.mgOrder, `${label} 고쳐 쓴 뼈대`).toBe(o0);
      }
      // 다음 프레임도 같다(가만히)
      fast.v.renderNow();
      slow.v.renderNow();
      checkOrder(fast, `${label} 다음 프레임`);
    }
    expect(shown).toBeGreaterThan(1000);
    expect(slow.forgets.n).toBeGreaterThan(20);
  });

  it('묶음 다시 살피기(planLoose)는 뼈대가 맞으면 덩이째 세고 그물마다 센 것과 같다', () => {
    const w = view(grid(600), true);
    for (const id of ['b100', 'b36', 'b301']) w.v.removeMesh(id);
    w.v.setMesh(prism('b200', 200));
    w.v.setMesh(box(700, 0, 'a1'));
    w.v.renderNow();
    const h = w.r as unknown as { mgOrder: MergeOrder | null; mgQueue: unknown[]; mgGroups: Set<MergeGroup & { plan?: object }> };
    const O = h.mgOrder;
    expect(O).not.toBeNull();
    expect(orderValid(w.r as never, O!)).toBe(true);
    expect(O!.items.length).toBeLessThan(w.r.meshes.length / 2);
    const plans = (): string => JSON.stringify([...h.mgGroups].map((g) => g.plan));
    planLoose(w.r as never);
    const byBlock = plans();
    h.mgOrder = null;
    planLoose(w.r as never);
    const byRec = plans();
    h.mgOrder = O;
    expect(byBlock).toBe(byRec);
    expect(h.mgQueue.length).toBe(0);
    expect(byBlock).toContain('"gaps"');
  });

  it('숨김 판이 같으면 보이는 목록을 다시 만들 때 이미 물은 기록은 다시 묻지 않는다(묶음 있는·없는 장면)', () => {
    for (const merging of [true, false]) {
      const w = view(grid(300), true, merging);
      w.v.setItemVisible('b5', false);
      w.v.setGroupVisible('g3', false);
      w.v.renderNow();
      const o = (w.v as unknown as { renderState: (...a: unknown[]) => { visible: (id: string, g: string | undefined) => boolean } });
      const rs = o.renderState.bind(w.v);
      let asked = 0;
      o.renderState = (...a) => {
        const s = rs(...a);
        const f = s.visible;
        s.visible = (id, g) => (asked++, f(id, g));
        return s;
      };
      // 가만히(묶음 없는 장면은 0.64.0이 프레임마다 그물마다 물었다)
      w.v.renderNow();
      expect(asked, `${merging} 가만히`).toBe(0);
      // 뼈대를 잊은 그리기(묶음 장면) — 숨김 판이 같으니 묻지 않는다
      w.r.forgetOrder();
      w.v.renderNow();
      expect(asked, `${merging} 뼈대 잊기`).toBe(0);
      checkOrder(w, `${merging} 뼈대 잊기`);
      // 새 기록(꼴 다른 바꾸기 — 묶음 이름이 다르다)만 묻는다
      w.v.setMesh(prism('b7', 7, 'gx'));
      w.v.setMesh(box(900, 0, 'n1', 'g3'));
      w.r.forgetOrder();
      w.v.renderNow();
      expect(asked, `${merging} 새 기록`).toBeLessThanOrEqual(2);
      checkOrder(w, `${merging} 새 기록`);
      // 숨김이 바뀌면 처음부터(묶음 숨김 — 바뀐 항목을 모른다)
      w.v.setGroupVisible('g3', true);
      w.v.renderNow();
      expect(asked, `${merging} 묶음 숨김`).toBeGreaterThan(250);
      checkOrder(w, `${merging} 묶음 숨김`);
    }
  });
});
