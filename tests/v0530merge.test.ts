/**
 * 0.53.0 다시 구운 묶음이 장면 차례로 엇갈리지 않게(52차 남은 일 ①):
 *  - 순수 계산(merge.ts): 굽기 단위로 고르게 나누기(mergeChunks — 그물 수·정점 수 가운데 묶는 쪽, 두 한도, 하나뿐인 묶음·잘못된 후보), 열쇠마다 나누기(mergeChunksByKey)
 *  - 뷰어(그물 2,048개보다 많은 장면 — 묶음 여럿): 빼기·바꾸기·더하기 뒤 다시 굽기를 마치면 묶음 수·그리기 호출·GL 객체 수가 같은 장면을 새로 올린 뷰어(처음 굽기)
 *    이하이고 모든 묶을 그물이 묶음에 든다. 그린 도형은 끔과 같다. 굽기 하나는 굽기 단위 안(프레임 몫). 바뀌지 않은 앞 묶음은 그대로 두고, 몇 개만 바꾸면 다시 굽지 않는다.
 *    양옆 묶음은 붙여도 묶음 수가 늘지 않을 때만 함께 다시 굽는다(묶음 합치기)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { MERGE_LOOSE, MERGE_UPLOAD_MESHES, MERGE_UPLOAD_VERTS, mergeChunks, mergeChunksByKey } from '../src/merge';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
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

describe('0.53.0 mergeChunks 순수 계산', () => {
  it('묶는 쪽(그물 수)으로 몇 묶음인지 센 뒤 고르게 끊는다 — 52차처럼 끝 묶음이 몇 개로 남지 않는다', () => {
    const c = (n: number, nv = 8) => Array.from({ length: n }, () => ({ nv }));
    const lim = { items: 10, verts: 1000 };
    expect(mergeChunks(c(10), lim).map((g) => g.length)).toEqual([10]);
    expect(mergeChunks(c(11), lim).map((g) => g.length)).toEqual([6, 5]);
    expect(mergeChunks(c(35), lim).map((g) => g.length)).toEqual([9, 9, 8, 9]);
    // 그물 번호는 장면 차례 그대로 이어진다
    expect(mergeChunks(c(11), lim).flat()).toEqual(Array.from({ length: 11 }, (_, i) => i));
    // 기본 한도 = 장면을 올리는 걸음의 굽기 단위
    const d = mergeChunks(c(7000));
    expect(d.map((g) => g.length)).toEqual([1750, 1750, 1750, 1750]);
    expect(Math.max(...d.map((g) => g.length))).toBeLessThanOrEqual(MERGE_UPLOAD_MESHES);
    expect(mergeChunks(c(MERGE_UPLOAD_MESHES)).length).toBe(1);
    expect(mergeChunks(c(MERGE_UPLOAD_MESHES + 1)).map((g) => g.length)).toEqual([1025, 1024]);
  });

  it('정점이 묶는 쪽이면 정점 수로 고르게, 묶음 하나는 늘 두 한도 안 — 정점이 없거나 한도보다 큰 후보는 건너뛰고 하나뿐인 묶음은 버린다', () => {
    const lim = { items: 100, verts: 1000 };
    const r = mergeChunks([{ nv: 600 }, { nv: 600 }, { nv: 600 }], lim);
    expect(r).toEqual([[0], [1], [2]].filter((g) => g.length >= 2));
    const v = mergeChunks(Array.from({ length: 12 }, (_, i) => ({ nv: i % 2 ? 300 : 100 })), lim);
    for (const g of v) expect(g.reduce((s, i) => s + (i % 2 ? 300 : 100), 0)).toBeLessThanOrEqual(1000);
    expect(v.length).toBe(3);
    expect(v.flat().length).toBe(12);
    expect(mergeChunks([{ nv: 0 }, { nv: 5000 }, { nv: 10 }, { nv: 10 }], lim)).toEqual([[2, 3]]);
    expect(mergeChunks([{ nv: 10 }], lim)).toEqual([]);
    expect(mergeChunks([{ nv: Number.NaN }, { nv: 10 }], lim)).toEqual([]);
    // 기본 정점 한도(정점 2만 개 그물 20개 = 40만 → 두 묶음, 고르게)
    expect(mergeChunks(Array.from({ length: 20 }, () => ({ nv: 20000 }))).map((g) => g.length)).toEqual([10, 10]);
    expect(MERGE_UPLOAD_VERTS).toBe(262144);
  });

  it('mergeChunksByKey: 열쇠마다 나누고 묶음은 첫 후보 차례(장면 차례)', () => {
    const cands = ['a', 'b', 'a', 'b', 'a', 'c'].map((key) => ({ key, nv: 8, bytes: 1 }));
    expect(mergeChunksByKey(cands)).toEqual([[0, 2, 4], [1, 3]]);
    expect(mergeChunksByKey(cands, { items: 2, verts: 1000 })).toEqual([[0, 2], [1, 3]]);
  });
});

/** 서로 다른 상자 그물 n개(셋째마다 정점 색, 윤곽선 있음 — 52차 1만·8만 하네스와 같은 꼴) */
const box = (i: number, k = 0): Mesh3d => {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6 - k, 6 - k, 4 + (i % 3) + k], [0.4 + (i % 5) * 0.1, 0.5, 0.6 - k * 0.1, 1]);
  m.origin = [(i % 60) * 10, Math.floor(i / 60) * 10, 0];
  if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.5));
  return m;
};
const boxes = (n: number): Scene3d => ({ name: 'b', units: 'mm', meshes: Array.from({ length: n }, (_, i) => box(i)), lines: [] });

type W = { v: Viewer3d; gl: FakeGL; baked: number[][] };
type G = { recs: { src: { id: string } }[]; live: number };
const rend = (w: W): { mgGroups: Set<G>; mergeBudgetMs: number } => (w.v as unknown as { renderer: { mgGroups: Set<G>; mergeBudgetMs: number } }).renderer;

function view(sc: Scene3d, merging: boolean | 'auto' = 'auto'): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  // 굽기마다 그 묶음 그물 수와 정점 수(굽기 단위 확인)
  const baked: number[][] = [];
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const orig = r.mergeBake as (list: readonly { src: Mesh3d }[]) => void;
  r.mergeBake = function (this: unknown, list: readonly { src: Mesh3d }[]) {
    baked.push([list.length, list.reduce((s, x) => s + x.src.positions.length / 3, 0)]);
    return orig.call(this, list);
  };
  v.setRenderOptions({ merging });
  v.setScene(sc);
  v.fit(false);
  return { v, gl, baked };
}
function bake(w: W): void {
  for (let i = 0; i < 200 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}
const live = (w: W): { b: number; v: number } => ({ b: w.gl.liveBuffers, v: w.gl.vaos.filter((x) => !x.deleted).length });
/** 같은 마지막 장면을 새 뷰어로 처음 올린 값(처음 굽기 수준 — 늘 켬: 뺀 뒤 그물이 'auto' 문턱 아래여도 견줄 수 있게) */
function fresh(w: W): { groups: number; draws: number; live: { b: number; v: number } } {
  const f = view({ name: 'f', units: 'mm', meshes: w.v.scene!.meshes.map((m) => ({ ...m })), lines: [] }, true);
  bake(f);
  const out = { groups: f.v.stats.merged.groups, draws: f.v.stats.drawCalls, live: live(f) };
  f.v.dispose();
  return out;
}

describe('0.53.0 다시 굽기 — 뷰어', () => {
  it('빼기·바꾸기·더하기 뒤 묶음 수·그리기 호출·GL 객체가 새로 올린 뷰어 이하, 모든 그물이 묶음에, 그린 도형은 끔과 같고 굽기 하나는 단위 안', () => {
    const N = 2600;
    const on = view(boxes(N)), off = view(boxes(N), false);
    const both = (f: (v: Viewer3d) => void): void => {
      f(on.v);
      f(off.v);
      bake(on);
      off.v.renderNow();
    };
    const check = (label: string): void => {
      const st = on.v.stats;
      expect(st.merged.pending, label).toBe(0);
      expect(st.merged.meshes, label).toBe(on.v.scene!.meshes.length);
      const fr = fresh(on);
      expect(st.merged.groups, label).toBeLessThanOrEqual(fr.groups);
      on.v.renderNow();
      expect(on.v.stats.drawCalls, label).toBeLessThanOrEqual(fr.draws);
      const l = live(on);
      expect(l.b, label).toBeLessThanOrEqual(fr.live.b);
      expect(l.v, label).toBeLessThanOrEqual(fr.live.v);
      expect(expandFrame(on.gl, () => on.v.renderNow()), label).toEqual(expandFrame(off.gl, () => off.v.renderNow()));
      for (const [n, nv] of on.baked) {
        expect(n, label).toBeLessThanOrEqual(MERGE_UPLOAD_MESHES);
        expect(nv, label).toBeLessThanOrEqual(MERGE_UPLOAD_VERTS);
      }
    };
    bake(on);
    off.v.renderNow();
    expect(on.v.stats.merged.groups).toBe(2);
    check('처음');
    // 30% 빼기 — 52차는 빠진 몫이 ¼을 넘은 묶음만 남은 그물로 다시 구웠다
    both((v) => {
      for (let i = 0; i < N; i++) if (i % 10 < 3) v.removeMesh(`b${i}`);
    });
    check('빼기');
    // 20% 바꾸기 — 52차는 바꾼 그물끼리 새 묶음을 구워 옛 묶음과 엇갈렸다(1만에서 그리기 4,006)
    both((v) => {
      for (let i = 0; i < N; i++) if (i % 10 === 5 || i % 10 === 6) v.setMesh(box(i, 1));
    });
    check('바꾸기');
    // 더하기(장면 끝 — 끝 묶음이 거느린다. MERGE_LOOSE개 이상이라 다시 굽는다)
    both((v) => {
      for (let i = N; i < N + 300; i++) v.setMesh(box(i));
    });
    check('더하기');
    // 끄고 켜기: 굽기 단위로 고르게(52차는 묶음 하나로 다 구웠다)
    on.v.setRenderOptions({ merging: false });
    on.v.renderNow();
    on.v.setRenderOptions({ merging: true });
    bake(on);
    check('끄고 켜기');
  });

  it('바뀌지 않은 묶음은 그대로 두고, 바꾼 그물이 몇 개뿐이면 다시 굽지 않는다(문턱을 넘으면 그 토막만)', () => {
    const N = 4100;
    const w = view(boxes(N));
    bake(w);
    const g0 = [...rend(w).mgGroups];
    expect(g0.length).toBe(3);
    // 끝 묶음 자리 그물 몇 개만 바꾸기: 다시 굽지 않는다(그물마다 — 52차와 같다)
    const nBake = w.baked.length;
    for (let i = N - 10; i < N; i++) w.v.setMesh(box(i, 1));
    bake(w);
    expect(w.baked.length).toBe(nBake);
    expect(w.v.stats.merged.meshes).toBe(N - 10);
    // (끝 묶음 그물 넷을 모두 바꿔 그 묶음은 쓰는 기록이 없어 지워졌다)
    expect(rend(w).mgGroups.size).toBe(2);
    // 끝에 MERGE_LOOSE개 더하기: 끝 토막(둘째 묶음 + 바꾼 것 + 더한 것 2,308개)만 고르게 두 묶음으로 다시 굽고 첫 묶음은 같은 묶음 그대로
    // (첫 묶음을 붙이면 4,356개 — 세 묶음이라 붙이지 않는다)
    for (let i = N; i < N + MERGE_LOOSE; i++) w.v.setMesh(box(i));
    bake(w);
    const g1 = [...rend(w).mgGroups];
    expect(g1[0]).toBe(g0[0]);
    expect(g1.map((g) => g.live)).toEqual([2048, 1154, 1154]);
    expect(w.v.stats.merged.meshes).toBe(N + MERGE_LOOSE);
    expect(w.baked.length).toBe(nBake + 2);
  });

  it('묶음 합치기: 토막만 나누면 묶음이 하나 더 생길 때 이웃 묶음을 붙여 함께 고르게 다시 굽는다', () => {
    const N = 3000;
    const w = view(boxes(N));
    bake(w);
    expect(w.v.stats.merged.groups).toBe(2);
    // 300개 빼기(MERGE_LOOSE 넘음): 두 묶음 모두 더럽혀져 한 토막 2,700개 → 1,350개씩 두 묶음
    for (let i = 0; i < N; i += 10) w.v.removeMesh(`b${i}`);
    bake(w);
    const sizes = (): number[] => [...rend(w).mgGroups].map((g) => g.live);
    expect(sizes()).toEqual([1350, 1350]);
    // 끝에 800개 더하기: 끝 토막 2,150개는 두 묶음이 들지만 앞 묶음을 붙이면 3,500개도 두 묶음 — 붙여서 1,750개씩(셋이 아니라 둘)
    for (let i = N; i < N + 800; i++) w.v.setMesh(box(i));
    bake(w);
    expect(sizes()).toEqual([1750, 1750]);
    expect(w.v.stats.merged.meshes).toBe(3500);
    const fr = fresh(w);
    expect(w.v.stats.merged.groups).toBe(fr.groups);
  });
});
