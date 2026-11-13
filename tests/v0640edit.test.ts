/**
 * 0.64.0 그물 바꾸기·빼기·더하기 호출의 그물 수 비례 몫(63차 남은 한계 — 가짜 WebGL 8만 그물에서 바꾸기 약 8~10 ms·더하기 약 24 ms·빼기 약 15 ms:
 * 렌더러 기록 찾기, 더할 때 묶음 표 다시 만들기, 뺀 뒤 장면 범위 덩어리 다시 합치기, 마주 보는 그물 훑기, 미룬 BVH 일 줄 다시 정렬).
 *  - 렌더러는 장면 id가 모두 다르면 뷰어가 준 장면 자리로 그물 기록을 찾는다(더하는 그물은 찾지 않는다). id가 겹치거나 같은 객체를 두 번 넣었다 뺀 장면은
 *    처음부터 찾는다 — 그물 기록 차례·묶음 표·GL 객체·그린 도형이 늘 처음부터 찾는 뷰어와 같다
 *  - 장면 범위 덩어리는 그물 수가 덩어리마다 달라도 되어 빼면 그 덩어리만 다시 합친다(sceneBounds와 비트까지 같다). 마주 보는 그물 목록·원점 쓰기는 처음부터 센 값과 같다
 *  - 바꾼 그물의 BVH 일은 남은 줄의 정렬된 자리에 넣는다(끝에 더해 안정 정렬한 줄과 같은 차례)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { sceneBounds } from '../src/bounds';
import { boxMesh } from '../src/synth';
import type { Box3, Mesh3d, Rgba, Scene3d } from '../src/types';
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

type Task = { n: number; run: () => void };
type Inner = {
  idsUnique: (s: Scene3d) => boolean;
  items: Map<string, { kind: string; item: unknown }>;
  allBox: Box3;
  meshBox: { box: (Box3 | undefined)[]; n: number[] };
  bbList: Mesh3d[];
  usesOrigin: boolean;
  bvhTasks: Task[];
  bvhHead: number;
  meshBvhTask: (m: Mesh3d) => Task;
  edgeBvhTask: (m: Mesh3d) => Task;
  renderer: { meshes: { src: Mesh3d }[] };
};
const inner = (v: Viewer3d): Inner => v as unknown as Inner;

function view(sc: Scene3d, o: { merging?: boolean; pickEdges?: boolean } = {}): { v: Viewer3d; gl: FakeGL } {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false, ...(o.pickEdges ? { pickEdges: true } : {}) });
  views.push(v);
  if (o.merging !== undefined) v.setRenderOptions({ merging: o.merging });
  v.setScene(sc);
  v.fit(false);
  v.renderNow();
  for (let i = 0; i < 100 && (v.stats.merged.pending > 0 || v.stats.instanced.pending > 0); i++) v.renderNow();
  v.renderNow();
  return { v, gl: (v.canvas as unknown as FakeElement).gl! };
}

const bits = (b: Box3): string => [...b.min, ...b.max].map((x) => (Object.is(x, -0) ? '-0' : String(x))).join(',');
const isBB = (m: Mesh3d): boolean => {
  const o = m.billboard?.origin;
  return !!o && o.length >= 3 && Number.isFinite(o[0]) && Number.isFinite(o[1]) && Number.isFinite(o[2]);
};
const anyOrigin = (s: Scene3d): boolean => [...s.meshes, ...s.lines, ...(s.points ?? [])].some((x) => !!x.origin && (x.origin[0] !== 0 || x.origin[1] !== 0 || x.origin[2] !== 0));

function box(id: string, i: number, k = 0, color: Rgba = [0.5, 0.5, 0.5, 1]): Mesh3d {
  const m = boxMesh(id, [i % 7 === 0 ? -0 : 0, 0, 0], [5 + k, 5, 3 + (i % 4)], color);
  m.origin = [(i % 40) * 8 + k, Math.floor(i / 40) * 8, i % 11 === 0 ? -0 : 0];
  return m;
}
/** 삼각기둥(정점 6·삼각형 8·모서리 9 — 상자와 꼴이 다르다) */
function prism(id: string, s: number, h: number, origin: [number, number, number]): Mesh3d {
  const positions = new Float32Array([0, 0, 0, s, 0, 0, 0, s, 0, 0, 0, h, s, 0, h, 0, s, h]);
  const indices = new Uint32Array([0, 2, 1, 3, 4, 5, 0, 1, 4, 0, 4, 3, 1, 2, 5, 1, 5, 4, 2, 0, 3, 2, 3, 5]);
  const e = [0, 1, 1, 2, 2, 0, 3, 4, 4, 5, 5, 3, 0, 3, 1, 4, 2, 5];
  const edges = new Float32Array(e.length * 3);
  e.forEach((x, j) => edges.set(positions.subarray(x * 3, x * 3 + 3), j * 3));
  return { id, name: id, positions, indices, color: [0.9, 0.4, 0.2, 1], edges, closed: true, origin };
}

describe('0.64.0 그물 바꾸기·빼기·더하기 호출', () => {
  it('자리 힌트로 찾은 그물 기록·묶음 표·GL 객체·그린 도형이 처음부터 찾는 뷰어와 같다(id가 겹치는 장면·같은 객체를 두 번 넣은 장면도)', () => {
    const run = (sc: () => Scene3d, ops: [string, (v: Viewer3d) => void][]): number => {
      // 두 뷰어가 같은 그물 객체를 쓴다(기록 src를 객체로 견준다)
      const s0 = sc();
      const fast = view(s0, { merging: true }), slow = view(s0, { merging: true });
      // 처음부터 찾는 뷰어(0.63.0 길 — 자리 힌트 없이, 더할 때 묶음 표를 다시 만든다)
      inner(slow.v).idsUnique = () => false;
      const ids = (v: Viewer3d): string[] => [...inner(v).items.entries()].map(([k, x]) => `${k}:${x.kind}`);
      const same = (label: string, shot: boolean): void => {
        for (const w of [fast, slow]) w.v.renderNow();
        const a = inner(fast.v), b = inner(slow.v);
        expect(a.renderer.meshes.length, label).toBe(b.renderer.meshes.length);
        expect(a.renderer.meshes.every((r, i) => r.src === b.renderer.meshes[i]!.src), `${label} 기록 차례`).toBe(true);
        expect(fast.v.scene!.meshes.every((m, i) => m === slow.v.scene!.meshes[i]), `${label} 장면`).toBe(true);
        expect(ids(fast.v), label).toEqual(ids(slow.v));
        expect([...a.items.values()].every((x, i) => x.item === [...b.items.values()][i]!.item), `${label} 표`).toBe(true);
        for (const k of ['drawCalls', 'triangles'] as const) expect(fast.v.stats[k], `${label} ${k}`).toBe(slow.v.stats[k]);
        expect({ ...fast.v.stats.merged, bakeMs: 0 }, label).toEqual({ ...slow.v.stats.merged, bakeMs: 0 });
        expect(fast.gl.liveBuffers, label).toBe(slow.gl.liveBuffers);
        expect(fast.gl.vaos.filter((x) => !x.deleted).length, label).toBe(slow.gl.vaos.filter((x) => !x.deleted).length);
        if (shot) expect(expandFrame(fast.gl, () => fast.v.renderNow()), label).toEqual(expandFrame(slow.gl, () => slow.v.renderNow()));
      };
      // 렌더러가 자리 힌트로 찾은 수(힌트 자리의 기록을 그대로 쓴 수)
      const R = fast.v as unknown as { renderer: { meshAt: (id: string, at?: number) => number } };
      const at0 = R.renderer.meshAt.bind(R.renderer);
      let hits = 0;
      R.renderer.meshAt = (id, at) => {
        const i = at0(id, at);
        if (at !== undefined && i === at) hits++;
        return i;
      };
      same('처음', true);
      ops.forEach(([label, fn], j) => {
        fn(fast.v);
        fn(slow.v);
        same(label, j % 3 === 2 || j === ops.length - 1);
      });
      return hits;
    };
    // id가 모두 다른 장면(묶음에 든 상자 700)
    const plain = (): Scene3d => ({ name: 'p', units: 'mm', meshes: Array.from({ length: 700 }, (_, i) => box(`b${i}`, i)), lines: [] });
    const objs = new Map<string, Mesh3d>();
    const once = (key: string, f: () => Mesh3d): Mesh3d => objs.get(key) ?? (objs.set(key, f()), objs.get(key)!);
    const hitPlain = run(plain, [
      ['같은 꼴 바꾸기', (v) => v.setMesh(once('s10', () => box('b10', 10, 2, [1, 0, 0, 1])))],
      ['꼴 다른 바꾸기', (v) => v.setMesh(once('p20', () => prism('b20', 6, 4, [20, 20, 0])))],
      ['더하기', (v) => v.setMesh(once('n1', () => box('n1', 3, 1)))],
      ['앞 빼기', (v) => v.removeMesh('b0')],
      ['끝 빼기', (v) => v.removeMesh('b699')],
      ['가운데 빼기', (v) => v.removeMesh('b350')],
      ['뺀 id 다시 더하기', (v) => v.setMesh(once('b0', () => box('b0', 0, 2)))],
      ['더한 그물 바꾸기', (v) => v.setMesh(once('n1b', () => box('n1', 4, 1)))],
      ['더한 그물 빼기', (v) => v.removeMesh('n1')],
      ['없는 id 빼기', (v) => v.removeMesh('nope')],
      [
        '같은 객체 제자리 고치기',
        (v) => {
          const m = v.scene!.meshes.find((x) => x.id === 'b5')!;
          m.origin = [5, 5, 40];
          v.setMesh(m);
        },
      ],
      ['여럿 더하기', (v) => ['n2', 'n3', 'n4'].forEach((id, i) => v.setMesh(once(id, () => box(id, 20 + i, 1))))],
    ]);
    // 같은 id 둘(다른 객체)과 같은 객체 둘이 든 장면: 뷰어와 렌더러가 다른 그물을 빼는 일도 처음부터 찾는 뷰어와 같아야 한다
    const twin = box('m', 60);
    const dup = (): Scene3d => {
      const meshes = Array.from({ length: 120 }, (_, i) => box(`b${i}`, i));
      meshes.splice(40, 0, box('d', 41, 1));
      meshes.push(box('d', 42, 2));
      meshes.splice(70, 0, twin);
      meshes.push(twin);
      return { name: 'd', units: 'mm', meshes, lines: [] };
    };
    run(dup, [
      ['겹친 장면 바꾸기', (v) => v.setMesh(once('d3', () => box('b3', 3, 2)))],
      ['겹친 id 빼기', (v) => v.removeMesh('d')],
      ['겹친 id 다시 넣기', (v) => v.setMesh(once('d4', () => box('d', 43, 3)))],
      ['같은 객체 둘 빼기', (v) => v.removeMesh('m')],
      ['같은 객체 둘 뒤 다시 넣기', (v) => v.setMesh(once('m2', () => box('m', 61, 1)))],
      ['그 뒤 더하기', (v) => v.setMesh(once('z', () => box('z', 62, 1)))],
      ['그 뒤 빼기', (v) => v.removeMesh('b5')],
      ['그 뒤 바꾸기', (v) => v.setMesh(once('b6', () => prism('b6', 5, 5, [0, 30, 0])))],
    ]);
    // 같은 id 둘을 하나 뺀 뒤(뷰어는 뒤 그물, 렌더러는 앞 기록을 뺀다) 다시 만든 묶음 표로 id가 모두 달라진 장면: 자리 힌트가 맞지 않으면 처음부터 찾는다
    const dup2 = (): Scene3d => {
      const meshes = Array.from({ length: 120 }, (_, i) => box(`b${i}`, i));
      meshes.splice(40, 0, box('d', 44, 1));
      meshes.push(box('d', 45, 2));
      return { name: 'd2', units: 'mm', meshes, lines: [] };
    };
    const hitDup2 = run(dup2, [
      ['겹친 id 빼기', (v) => v.removeMesh('d')],
      ['더해 표 다시', (v) => v.setMesh(once('y', () => box('y', 46, 1)))],
      ['남은 d 바꾸기', (v) => v.setMesh(once('d5', () => box('d', 47, 2)))],
      ['남은 d 빼기', (v) => v.removeMesh('d')],
      ['그 뒤 더하기', (v) => v.setMesh(once('y2', () => box('y2', 48, 1)))],
      ['그 뒤 같은 꼴 바꾸기', (v) => v.setMesh(once('b10x', () => box('b10', 10, 1)))],
      ['그 뒤 빼기', (v) => v.removeMesh('b11')],
    ]);
    // 선분 묶음이 든 장면에서 더하기(묶음 표를 다시 만든다 — 그물 → 선분 차례)
    const withLine = (): Scene3d => ({ ...plain(), lines: [{ id: 'l', positions: new Float32Array([0, 0, 0, 10, 10, 10]), color: [1, 1, 1, 1] }] });
    run(withLine, [
      ['선분 장면 더하기', (v) => v.setMesh(once('ln1', () => box('n9', 9, 1)))],
      ['선분 장면 빼기', (v) => v.removeMesh('b1')],
    ]);
    // 자리 힌트 길을 실제로 탔다(id가 모두 다른 장면 — 바꾸기·빼기, id가 다시 모두 달라진 장면의 맞는 힌트)
    expect(hitPlain).toBeGreaterThanOrEqual(8);
    expect(hitDup2).toBeGreaterThanOrEqual(2);
  });

  it('장면 범위 덩어리(그물 수가 다른 덩어리)·마주 보는 그물·원점 쓰기가 처음부터 센 값과 같다', () => {
    const n = 1000;
    const meshes = Array.from({ length: n }, (_, i) => {
      const m = box(`b${i}`, i);
      if (i === 333) m.positions[4] = NaN;
      if (i % 97 === 4) m.billboard = { origin: [i, 0, 0] };
      return m;
    });
    const { v } = view({ name: 's', units: 'mm', meshes, lines: [{ id: 'l', positions: new Float32Array([0, 0, 0, 10, 10, 10]), color: [1, 1, 1, 1] }] });
    const o = inner(v);
    const check = (label: string): void => {
      const s = v.scene!;
      expect(bits(o.allBox), label).toBe(bits(sceneBounds(s)));
      const N = o.meshBox.n;
      expect(N.reduce((a, b) => a + b, 0), `${label} 덩어리 그물 수`).toBe(s.meshes.length);
      expect(N.every((x) => x > 0 && x <= 256), label).toBe(true);
      const bb = s.meshes.filter(isBB);
      expect(o.bbList.length, label).toBe(bb.length);
      expect(o.bbList.every((m, i) => m === bb[i]), `${label} 마주 보는 그물`).toBe(true);
      expect(o.usesOrigin, label).toBe(anyOrigin(s));
    };
    check('처음');
    // 덩어리 하나를 모두 빼기(256~511 — 그 덩어리가 없어진다), 앞·끝 빼기
    for (let i = 256; i < 512; i++) v.removeMesh(`b${i}`);
    check('덩어리 하나 모두 빼기');
    v.removeMesh('b0');
    v.removeMesh('b999');
    check('앞·끝 빼기');
    // 더하기(끝 덩어리를 채우고 새 덩어리), 더한 것 빼기, 범위를 넓히는 더하기
    for (let i = 0; i < 300; i++) v.setMesh(box(`a${i}`, i, 3));
    check('300 더하기');
    for (const id of ['a0', 'a150', 'a299', 'b600']) v.removeMesh(id);
    check('더한 것 빼기');
    v.setMesh({ ...box('far', 1), origin: [-500, 0, 900] });
    check('범위 넓힘');
    v.removeMesh('far');
    check('범위 되돌림');
    // 같은 객체 제자리(원점), −0 원점
    const m = v.scene!.meshes[100]!;
    m.origin = [0, 0, -300];
    v.setMesh(m);
    check('같은 객체 원점');
    v.setMesh({ ...box('b7', 7), origin: [-0, -0, -0] });
    check('−0 원점');
    // 마주 보는 그물: 더하기, 마주 보는 그물을 보통 그물로, 같은 객체에서 마주 보기 빼기·더하기, 빼기
    v.setMesh({ ...box('bb1', 5), billboard: { origin: [1, 2, 3] } });
    check('마주 보는 그물 더하기');
    v.setMesh(box('b4', 4));
    check('마주 보는 그물을 보통 그물로');
    const q = v.scene!.meshes.find((x) => x.id === 'b101')!;
    expect(isBB(q)).toBe(true);
    q.billboard = undefined;
    v.setMesh(q);
    check('같은 객체 마주 보기 빼기');
    q.billboard = { origin: [0, 0, 1] };
    v.setMesh(q);
    check('같은 객체 마주 보기 더하기');
    v.removeMesh('bb1');
    v.removeMesh('b198');
    check('마주 보는 그물 빼기');
  });

  it('원점 쓰기: 원점 있는 그물을 바꾸고 빼고 더하고 같은 객체를 제자리에서 고쳐도 처음부터 센 값과 같다', () => {
    const meshes = Array.from({ length: 60 }, (_, i) => boxMesh(`b${i}`, [i * 8, 0, 0], [5, 5, 5], [0.5, 0.5, 0.5, 1]));
    meshes[30]!.origin = [0, 0, 100];
    const { v } = view({ name: 'o', units: 'mm', meshes, lines: [] });
    const o = inner(v);
    const check = (label: string, want: boolean): void => {
      expect(anyOrigin(v.scene!), label).toBe(want);
      expect(o.usesOrigin, label).toBe(want);
      expect(bits(o.allBox), label).toBe(bits(sceneBounds(v.scene!)));
    };
    check('처음', true);
    v.setMesh(boxMesh('b30', [0, 0, 0], [5, 5, 5], [1, 0, 0, 1]));
    check('원점 그물을 원점 없는 그물로', false);
    v.setMesh({ ...boxMesh('n', [0, 0, 0], [5, 5, 5], [1, 0, 0, 1]), origin: [3, 0, 0] });
    check('원점 그물 더하기', true);
    v.removeMesh('n');
    check('원점 그물 빼기', false);
    const m = v.scene!.meshes[3]!;
    m.origin = [0, 7, 0];
    v.setMesh(m);
    check('같은 객체에 원점', true);
    m.origin = [0, 0, 0];
    v.setMesh(m);
    check('같은 객체 원점 0', false);
  });

  it('바꾼 그물의 BVH 일은 남은 줄의 정렬된 자리에 들어간다(끝에 더해 안정 정렬한 줄과 같은 차례)', () => {
    const meshes = Array.from({ length: 300 }, (_, i) => box(`b${i}`, i));
    const { v } = view({ name: 'q', units: 'mm', meshes, lines: [] }, { pickEdges: true });
    const o = inner(v);
    const made: Task[] = [];
    for (const k of ['meshBvhTask', 'edgeBvhTask'] as const) {
      const f = o[k].bind(v);
      o[k] = (m: Mesh3d) => {
        const t = f(m);
        made.push(t);
        return t;
      };
    }
    const big = (id: string): Mesh3d => {
      const b = box(id, 9);
      const idx = new Uint32Array(600);
      for (let j = 0; j < 600; j++) idx[j] = b.indices![j % 36]!;
      return { ...b, indices: idx };
    };
    const check = (label: string, fn: () => void, done = 0): void => {
      // 앞 done개를 이미 했다고 둔다(쉬는 틈에 한 일)
      o.bvhHead = Math.min(done, o.bvhTasks.length);
      const before = o.bvhTasks.slice(o.bvhHead);
      made.length = 0;
      fn();
      const want = [...before, ...made].sort((a, b) => a.n - b.n);
      const got = o.bvhTasks.slice(o.bvhHead);
      expect(got.length, label).toBe(want.length);
      expect(got.every((t, i) => t === want[i]), label).toBe(true);
    };
    expect(o.bvhTasks.length).toBeGreaterThan(500);
    check('상자 바꾸기', () => v.setMesh(box('b3', 3, 1)));
    check('삼각기둥·큰 그물·상자', () => (v.setMesh(prism('b4', 6, 4, [0, 0, 0])), v.setMesh(big('b5')), v.setMesh(box('n1', 1, 2))), 120);
    check('윤곽선 없는 그물', () => v.setMesh({ ...box('b6', 6), edges: undefined }), 10);
  });
});
