/**
 * 0.58.0 Viewer3d.whenMerged: 미룬 올리기·나눠 올리기·묶음 굽기가 끝나면 풀리는 약속(앱이 stats.merged.pending을 폴링하지 않게 — STEP).
 *  - 할 일이 없으면 곧 'done', 나눠 올리기·미룬 한 번에 올리기·굽기는 끝난 프레임에 'done'
 *  - 조각 받기 늦음·실패는 그물마다 다 올린 뒤 'done'(폴링이 보던 pending 0과 같은 때)
 *  - 기다리는 동안 문맥을 잃으면 'lost', 뷰어를 없애면 'disposed'. 약속이 남지 않는다
 * 조각 받기 상태는 모듈마다 하나라 시험마다 모듈을 새로 받는다(v0560hold와 같은 꼴)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { MERGE_AUTO_MIN, MERGE_KIT_WAIT_MS } from '../src/mergeopts';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import type { Viewer3d as ViewerT } from '../src/viewer';

type ViewerCtor = typeof import('../src/viewer').Viewer3d;
type Rend = { uploading: boolean; meshes: unknown[] };

let dom: ReturnType<typeof installDom>;
const views: ViewerT[] = [];
beforeAll(() => {
  dom = installDom();
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  vi.useRealTimers();
  vi.doUnmock('../src/mergegl');
});
afterAll(() => dom.restore());

async function fresh(how: 'real' | 'fail' | 'gate'): Promise<{ Viewer3d: ViewerCtor; open: () => void }> {
  vi.resetModules();
  let opened = false;
  let release = (): void => undefined;
  if (how === 'real') vi.doUnmock('../src/mergegl');
  else
    vi.doMock('../src/mergegl', async () => {
      if (how === 'fail') throw new Error('조각을 받지 못함(시험)');
      if (!opened) await new Promise<void>((res) => (release = res));
      return vi.importActual('../src/mergegl');
    });
  const { Viewer3d } = await import('../src/viewer');
  return {
    Viewer3d,
    open: () => {
      opened = true;
      release();
    },
  };
}
const settle = async (n = 4): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise<void>((res) => setImmediate(res));
};
const box = (i: number): Mesh3d => {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1]);
  m.origin = [(i % 60) * 10, Math.floor(i / 60) * 10, 0];
  return m;
};
const boxes = (n: number): Scene3d => ({ name: 'b', units: 'mm', meshes: Array.from({ length: n }, (_, i) => box(i)), lines: [] });
const N = MERGE_AUTO_MIN + 200;

function make(V: ViewerCtor): { v: ViewerT; r: Rend } {
  const v = new V(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  return { v, r: (v as unknown as { renderer: Rend }).renderer };
}
/** 약속이 풀렸는지 보는 표시 */
function watch(p: Promise<string>): { value: string | null } {
  const s: { value: string | null } = { value: null };
  void p.then((x) => (s.value = x));
  return s;
}

describe('0.58.0 whenMerged', () => {
  it('할 일이 없으면 곧 done(장면 없음·문턱 아래 장면)', async () => {
    const { Viewer3d } = await fresh('real');
    const { v } = make(Viewer3d);
    await expect(v.whenMerged()).resolves.toBe('done');
    v.setScene(boxes(5));
    await expect(v.whenMerged()).resolves.toBe('done');
  });

  it('나눠 올리기: 끝나기 전에는 풀리지 않고(pending이 0이어도) 다 구운 프레임에 done', async () => {
    const { Viewer3d } = await fresh('real');
    expect(await Viewer3d.preloadMerging()).toBe(true);
    const { v, r } = make(Viewer3d);
    v.setScene(boxes(N), { incremental: { budgetMs: 0.001 } });
    v.fit(false);
    const s = watch(v.whenMerged());
    v.renderNow();
    await settle();
    expect(r.uploading).toBe(true);
    expect(v.stats.merged.pending).toBe(0);
    expect(s.value).toBeNull();
    for (let i = 0; i < 20_000 && r.uploading; i++) v.renderNow();
    for (let i = 0; i < 200 && v.stats.merged.pending > 0; i++) v.renderNow();
    v.renderNow();
    await settle();
    expect(s.value).toBe('done');
    expect(v.stats.merged.meshes).toBe(N);
  });

  it('조각을 기다려 미룬 한 번에 올리기: 조각이 오고 다 구운 뒤 done(여러 번 불러도 모두 풀린다)', async () => {
    const { Viewer3d, open } = await fresh('gate');
    const { v, r } = make(Viewer3d);
    v.setScene(boxes(N));
    v.fit(false);
    const a = watch(v.whenMerged()), b = watch(v.whenMerged());
    v.renderNow();
    await settle();
    expect(r.uploading).toBe(true);
    expect(a.value).toBeNull();
    open();
    expect(await Viewer3d.preloadMerging()).toBe(true);
    for (let i = 0; i < 200 && (r.uploading || v.stats.merged.pending > 0); i++) v.renderNow();
    v.renderNow();
    await settle();
    expect(a.value).toBe('done');
    expect(b.value).toBe('done');
    expect(v.stats.merged.meshes).toBe(N);
  });

  it('받기가 늦으면(late) 그물마다 다 올린 뒤 done — 조각을 기다리지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { Viewer3d } = await fresh('gate');
    const { v, r } = make(Viewer3d);
    v.setScene(boxes(N));
    v.fit(false);
    const s = watch(v.whenMerged());
    vi.advanceTimersByTime(MERGE_KIT_WAIT_MS - 1);
    await settle();
    v.renderNow();
    await settle();
    expect(s.value).toBeNull();
    vi.advanceTimersByTime(1);
    expect(Viewer3d.mergingState()).toBe('late');
    v.renderNow();
    await settle();
    expect(r.uploading).toBe(false);
    expect(r.meshes.length).toBe(N);
    expect(s.value).toBe('done');
    expect(v.stats.merged.groups).toBe(0);
  });

  it('받지 못하면(failed) 그물마다 다 올린 뒤 done', async () => {
    const { Viewer3d } = await fresh('fail');
    const { v, r } = make(Viewer3d);
    v.setScene(boxes(N));
    v.fit(false);
    const s = watch(v.whenMerged());
    expect(await Viewer3d.preloadMerging()).toBe(false);
    expect(Viewer3d.mergingState()).toBe('failed');
    v.renderNow();
    await settle();
    expect(r.uploading).toBe(false);
    expect(r.meshes.length).toBe(N);
    expect(s.value).toBe('done');
  });

  it('기다리는 동안 뷰어를 없애면 disposed, 없앤 뒤 부르면 곧 disposed', async () => {
    const { Viewer3d } = await fresh('gate');
    const { v } = make(Viewer3d);
    v.setScene(boxes(N));
    const s = watch(v.whenMerged());
    await settle();
    expect(s.value).toBeNull();
    v.dispose();
    await settle();
    expect(s.value).toBe('disposed');
    await expect(v.whenMerged()).resolves.toBe('disposed');
  });

  it('기다리는 동안 문맥을 잃으면 lost, 잃은 동안 부르면 곧 lost', async () => {
    const { Viewer3d } = await fresh('gate');
    const { v } = make(Viewer3d);
    v.setScene(boxes(N));
    const s = watch(v.whenMerged());
    await settle();
    (v.canvas as unknown as FakeElement).fire('webglcontextlost', { preventDefault: () => undefined });
    await settle();
    expect(s.value).toBe('lost');
    await expect(v.whenMerged()).resolves.toBe('lost');
  });
});
