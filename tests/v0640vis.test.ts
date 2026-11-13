/**
 * 0.64.0 상태가 같은 보이기 호출(63차 남은 일 — 앱이 보이기를 바꿀 때마다 모든 항목에 setItemVisible을 부르면, 상태가 같은 항목도 바꾼 항목 기록에 들어
 * 묶음 장면에서 기록이 늘 1,024개를 넘었다: 0.63.0의 바뀐 그물만 고치기를 타지 못하고 렌더러가 그물마다 다시 물었다).
 *  - setItemVisible·setGroupVisible·setHiddenRanges를 지금 상태와 같은 값으로 부르면 숨김 판·바꾼 항목 기록·다시 그리기 표시를 남기지 않는다
 *  - 그래서 모든 항목에 부르되 하나만 바뀐 그리기도 렌더러는 바뀐 그물만 묻는다
 *  - 같은 id가 여럿인 그물·묶음 숨김과 항목 숨김이 겹친 경우·장면 바꾸기 직후에도 보이는지와 그린 도형이 끈 뷰어와 같다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
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

/** 상자 n개(묶음 g0~g3, 정점 색 셋째마다, 37번째마다 반투명 — 묶음 밖, 마지막 그물은 b7과 같은 id) */
function grid(n: number): Scene3d {
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, i % 37 === 5 ? 0.5 : 1], `g${i % 4}`);
    m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
    return m;
  });
  meshes.push({ ...meshes[7]!, origin: [0, -20, 0] });
  return { name: 'g', units: 'mm', meshes, lines: [] };
}

/** 뷰어 안: 숨김 판·바꾼 항목 기록·다시 그리기 요청 */
type Inner = { visVer: number; visBase: number; visIds: string[]; raf: number; renderState: (...a: unknown[]) => { visible: (id: string, g: string | undefined) => boolean } };
const inner = (v: Viewer3d): Inner => v as unknown as Inner;
type W = { v: Viewer3d; gl: FakeGL; asked: { n: number } };
type Rec = { src: Mesh3d; visAt?: number };
type Rend = { meshes: Rec[]; visMemo: { seq: number; list: Rec[] } | null; mgOrder: { blocks: { a: number; b: number; g: { recs: Rec[] }; hid: number[] }[] } | null };
const rend = (w: W): Rend => (w.v as unknown as { renderer: Rend }).renderer;

function view(sc: Scene3d, merging: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const asked = { n: 0 };
  // 렌더러가 RenderState.visible로 묻는 수(뷰어의 보이는 범위 셈은 빼고)
  const o = inner(v);
  const rs = o.renderState.bind(v);
  o.renderState = (...a) => {
    const s = rs(...a);
    const f = s.visible;
    s.visible = (id, g) => (asked.n++, f(id, g));
    return s;
  };
  v.setRenderOptions({ merging });
  v.setScene(sc);
  v.fit(false);
  return { v, gl, asked };
}

function bake(w: W): void {
  w.v.renderNow();
  for (let i = 0; i < 100 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}

/** 판·기록·다시 그리기 요청의 지금 값 */
const mark = (v: Viewer3d): string => {
  const o = inner(v);
  return `${o.visVer}/${o.visBase}/${o.visIds.join(',')}/${o.raf ? 'raf' : '-'}`;
};

describe('0.64.0 상태가 같은 보이기 호출', () => {
  it('지금 상태와 같은 값이면 숨김 판·바꾼 항목 기록·다시 그리기 요청을 남기지 않는다(항목·묶음·구간 숨김)', () => {
    const w = view(grid(60), false);
    const v = w.v;
    v.renderNow();
    const ids = v.scene!.meshes.map((m) => m.id);
    const still = (label: string, fn: () => void): void => {
      v.renderNow();
      const a = mark(v);
      fn();
      expect(mark(v), label).toBe(a);
    };
    const moved = (label: string, fn: () => void): void => {
      v.renderNow();
      const a = inner(v).visVer;
      fn();
      expect(inner(v).visVer, label).toBe(a + 1);
      expect(inner(v).raf, label).not.toBe(0);
    };
    still('모두 보임으로', () => ids.forEach((id) => v.setItemVisible(id, true)));
    still('없는 id 보임', () => v.setItemVisible('nope', true));
    still('묶음 보임', () => ['g0', 'g1', 'g2', 'g3', 'gx'].forEach((g) => v.setGroupVisible(g, true)));
    still('구간 숨김 없음 → 없음', () => (v.setHiddenRanges('b3', null), v.setHiddenRanges('b3', []), v.setHiddenRanges('b3', { prims: [], edges: [] })));
    expect(v.hiddenRanges('b3')).toEqual([]);
    still('구간 숨김 모두 풀기(없음)', () => v.clearHiddenRanges());
    // 바꾸면 판이 하나 오른다, 같은 값으로 다시 부르면 그대로
    moved('항목 숨김', () => v.setItemVisible('b3', false));
    still('항목 숨김 다시', () => (v.setItemVisible('b3', false), ids.forEach((id) => v.setItemVisible(id, id !== 'b3'))));
    moved('없는 id 숨김', () => v.setItemVisible('nope', false));
    still('없는 id 숨김 다시', () => v.setItemVisible('nope', false));
    moved('묶음 숨김', () => v.setGroupVisible('g1', false));
    still('묶음 숨김 다시', () => (v.setGroupVisible('g1', false), v.setGroupVisible('g2', true)));
    moved('구간 숨김', () => v.setHiddenRanges('b4', [{ start: 0, count: 2 }]));
    // 합치면 같은 구간(이어 붙은 두 구간·한도 밖 꼬리), 같은 구간을 { prims }로
    still('구간 숨김 다시', () => (v.setHiddenRanges('b4', [{ start: 1, count: 1 }, { start: 0, count: 1 }]), v.setHiddenRanges('b4', { prims: [{ start: 0, count: 2 }] })));
    expect(v.hiddenRanges('b4')).toEqual([{ start: 0, count: 2 }]);
    moved('윤곽선 구간 더함', () => v.setHiddenRanges('b4', { prims: [{ start: 0, count: 2 }], edges: [{ start: 0, count: 3 }] }));
    still('윤곽선 구간 다시', () => v.setHiddenRanges('b4', { prims: [{ start: 0, count: 2 }], edges: [{ start: 0, count: 1 }, { start: 1, count: 2 }] }));
    moved('구간 숨김 풀기', () => v.setHiddenRanges('b4', null));
    still('구간 숨김 풀기 다시', () => v.setHiddenRanges('b4', null));
    // 뷰어가 숨김을 바꾼 항목만 적는다(같은 값 호출은 기록에 없다)
    v.renderNow();
    const k = inner(v).visVer;
    ids.forEach((id) => v.setItemVisible(id, id !== 'b3' && id !== 'b9'));
    expect(inner(v).visVer).toBe(k + 1);
    expect(inner(v).visIds.slice(k - inner(v).visBase)).toEqual(['b9']);
    expect(v.isVisible('b9')).toBe(false);
    expect(v.isVisible('b3')).toBe(false);
    expect(v.isVisible('b5')).toBe(false); // g1
    expect(v.isVisible('b6')).toBe(true);
  });

  it('모든 항목에 부르되 하나만 바뀐 그리기는 바뀐 그물만 묻고, 같은 id 둘·묶음 숨김 겹침·장면 바꾸기 뒤에도 끈 뷰어와 같은 도형', () => {
    const n = 1500;
    const on = view(grid(n), true), off = view(grid(n), false);
    bake(on);
    bake(off);
    const shot = (w: W): string[] => expandFrame(w.gl, () => w.v.renderNow());
    /** 보이는 목록·덩이 숨긴 번호가 처음부터 만든 것과 같은지 */
    const same = (label: string): void => {
      const r = rend(on), M = r.visMemo!;
      expect(M, label).not.toBeNull();
      const vis = (x: Rec): boolean => on.v.isVisible(x.src.id);
      expect(M.list, label).toEqual(r.meshes.filter(vis));
      for (const x of r.meshes) expect(x.visAt === M.seq, `${label} ${x.src.id}`).toBe(vis(x));
      for (const k of r.mgOrder!.blocks) {
        const hid: number[] = [];
        for (let i = k.a; i < k.b; i++) if (!vis(k.g.recs[i]!)) hid.push(i);
        expect(k.hid, label).toEqual(hid);
      }
    };
    const step = (label: string, fn: (v: Viewer3d) => void): number => {
      for (const w of [on, off]) fn(w.v);
      on.asked.n = 0;
      const b = shot(on);
      const asked = on.asked.n;
      const a = shot(off);
      expect(b.length, label).toBe(a.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
      same(label);
      for (const id of ['b2', 'b3', 'b7', 'b10', 'b30']) expect(on.v.isVisible(id), `${label} ${id}`).toBe(off.v.isVisible(id));
      return asked;
    };
    /** 장면 그물 모두(같은 id 둘 포함 — 장면 차례)에 setItemVisible(hidden에 없으면 보임) */
    const all = (hidden: ReadonlySet<string>) => (v: Viewer3d) => {
      for (const m of v.scene!.meshes) v.setItemVisible(m.id, !hidden.has(m.id));
    };
    const H = new Set<string>();
    step('plain', () => undefined);
    // 하나씩 더 숨김(덩이 그물·같은 id 둘·묶음 밖 반투명 그물)
    for (const id of ['b10', 'b7', 'b5', 'b1499']) {
      H.add(id);
      expect(step(`all-one ${id}`, all(H)), id).toBeLessThan(20);
    }
    expect(on.v.isVisible('b7')).toBe(false);
    // 바뀐 것 없음 — 판이 그대로라 렌더러가 묻지 않는다
    const k0 = inner(on.v).visVer;
    expect(step('all-none', all(H))).toBe(0);
    expect(inner(on.v).visVer).toBe(k0);
    // 다시 보임(같은 id 둘 함께)
    H.delete('b7');
    expect(step('all-show b7', all(H))).toBeLessThan(20);
    expect(on.v.isVisible('b7')).toBe(true);
    // 묶음 숨김(처음부터) 뒤 그 묶음 그물을 항목으로도 숨김 — 보이는지는 그대로, 묶음을 다시 보이면 항목 숨김이 남는다
    expect(step('group', (v) => v.setGroupVisible('g2', false))).toBeGreaterThanOrEqual(n);
    H.add('b2');
    expect(step('group+item', all(H))).toBeLessThan(20);
    expect(step('group again', (v) => (v.setGroupVisible('g2', false), all(H)(v)))).toBe(0);
    step('group back', (v) => v.setGroupVisible('g2', true));
    expect(on.v.isVisible('b2')).toBe(false);
    expect(on.v.isVisible('b6')).toBe(true);
    expect(step('group back again', (v) => (v.setGroupVisible('g2', true), all(H)(v)))).toBe(0);
    // 절반이 바뀜(기록 한도를 넘음 — 처음부터)
    const half = new Set<string>();
    for (let i = 0; i < n; i += 2) half.add(`b${i}`);
    step('all-half', all(half));
    step('all-back', all(new Set()));
    // 장면 바꾸기 직후: 모두 보임으로 부르면 판이 그대로, 하나만 숨기면 그 그물만
    for (const w of [on, off]) {
      w.v.setScene(grid(n));
      w.v.fit(false);
      bake(w);
    }
    const k1 = mark(on.v);
    all(new Set())(on.v);
    all(new Set())(off.v);
    expect(mark(on.v)).toBe(k1);
    step('scene', () => undefined);
    expect(step('scene all-one', all(new Set(['b30'])))).toBeLessThan(20);
  });
});
