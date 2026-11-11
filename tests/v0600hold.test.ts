/**
 * 0.60.0 조각을 받는 동안 곧장 구울 그물을 GL 객체 없이 빛 기록으로 들고 기다리기(59차 남은 한계 — 1만 나눠 올리기 걸음 사이 버퍼 2,607개).
 *  - 조각을 받는 동안: 첫 그림 앞 걸음은 그물 MERGE_FIRST_MESHES개(그물마다), 훑기 뒤 그물은 빛 기록(그리지 않는다)으로 굽기 단위 − 1까지 — 그물마다 VAO가 그만큼 생기지 않는다.
 *    조각이 오면 곧장 굽고, 끝 그림·묶음·GL 객체 수가 조각을 미리 받은 뷰어와 같다
 *  - 늦음·실패: 들고 있던 빛 기록을 그물 버퍼로 돌려(장면 차례) 그물마다 이어 올린다 — 그림은 끈 뷰어와 같다
 *  - 걸음 사이 앱 호출: 올린 그물 빼기·바꾸기, 묶어 그리기 끄기, 다 올리라는 걸음(그림 저장) — 들고 있던 기록을 그물 버퍼로. dispose
 *  - 장면이 굽기 단위보다 작으면 마지막 그물에서 조각을 기다린다(다 올림은 조각이 굽는다)
 * 조각 받기 상태는 모듈마다 하나라 시험마다 모듈을 새로 받는다(v0550kit과 같은 길 — vi.resetModules·vi.doMock)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { MERGE_AUTO_MIN, MERGE_FIRST_MESHES, MERGE_KIT_WAIT_MS, MERGE_UPLOAD_MESHES } from '../src/mergeopts';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import type { Viewer3d as ViewerT } from '../src/viewer';

type ViewerCtor = typeof import('../src/viewer').Viewer3d;
type Rend = { uploadSome: (b: number) => boolean; uploading: boolean; uploadHeld: boolean; meshes: { light?: boolean }[]; mgHold: { light?: boolean }[] };

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

/** 받기 모양: 'real' 조각 그대로 · 'hang' 끝나지 않음 · 'fail' 실패 · 'gate' 열 때 온다 */
async function fresh(how: 'real' | 'hang' | 'fail' | 'gate'): Promise<{ Viewer3d: ViewerCtor; open: () => void }> {
  vi.resetModules();
  let opened = false;
  let release = (): void => undefined;
  if (how === 'real') vi.doUnmock('../src/mergegl');
  else
    vi.doMock('../src/mergegl', async () => {
      if (how === 'hang') return new Promise<never>(() => undefined);
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

const box = (i: number, v = 0): Mesh3d => {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3) + v], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1]);
  m.origin = [(i % 60) * 10, Math.floor(i / 60) * 10, 0];
  if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.5));
  return m;
};
const boxes = (n: number): Scene3d => ({ name: 'b', units: 'mm', meshes: Array.from({ length: n }, (_, i) => box(i)), lines: [] });

function make(V: ViewerCtor, merging: boolean | 'auto' = 'auto'): { v: ViewerT; gl: FakeGL; r: Rend } {
  const v = new V(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  v.setRenderOptions({ merging });
  return { v, gl: (v.canvas as unknown as FakeElement).gl!, r: (v as unknown as { renderer: Rend }).renderer };
}
const liveVaos = (gl: FakeGL): number => gl.vaos.filter((x) => !x.deleted).length;
function bake(v: ViewerT): void {
  for (let i = 0; i < 200 && v.stats.merged.pending > 0; i++) v.renderNow();
  v.renderNow();
}

/** 묶어 그리기를 끈 뷰어·조각을 미리 받은 뷰어 — 같은 장면을 한 번에 */
async function refs(sc: () => Scene3d): Promise<{ off: { v: ViewerT; gl: FakeGL }; on: { v: ViewerT; gl: FakeGL } }> {
  const { Viewer3d: R } = await fresh('real');
  expect(await R.preloadMerging()).toBe(true);
  const off = make(R, false);
  off.v.setScene(sc());
  const on = make(R);
  on.v.setScene(sc());
  for (const w of [off, on]) {
    w.v.fit(false);
    bake(w.v);
  }
  return { off, on };
}

/** 첫 걸음 → 첫 그림 → 훑기를 마치고 빛 기록으로 들고 조각을 기다리는 데까지. 그동안 만든 VAO 수(그물마다)를 돌려준다 */
function toHold(V: ViewerCtor, w: { v: ViewerT; gl: FakeGL; r: Rend }, sc: Scene3d): number {
  const v0 = liveVaos(w.gl);
  w.v.setScene(sc, { incremental: { budgetMs: 600_000 } });
  expect(w.r.uploadSome(600_000)).toBe(false);
  expect(w.r.meshes.length).toBe(MERGE_FIRST_MESHES);
  w.v.renderNow();
  expect(w.r.uploadSome(600_000)).toBe(false);
  expect(V.mergingState()).toBe('loading');
  expect(w.r.uploadHeld).toBe(true);
  expect(w.r.meshes.length).toBe(MERGE_FIRST_MESHES);
  // 들고 있는 기록은 모두 빛 기록이고 그리기 목록에 없다(그리기·고르기가 보지 않는다)
  expect(w.r.mgHold.every((r) => r.light)).toBe(true);
  expect(w.r.meshes.some((r) => r.light)).toBe(false);
  return liveVaos(w.gl) - v0;
}

const N = MERGE_UPLOAD_MESHES + 600;

describe('0.60.0 조각을 받는 동안 빛 기록으로 들고 기다리기', () => {
  it('들고 있는 동안 그물마다 VAO는 첫 걸음 그물만큼 — 조각이 오면 곧장 굽고 끝값·그림이 미리 받은 뷰어와 같다', async () => {
    const { Viewer3d, open } = await fresh('gate');
    const w = make(Viewer3d);
    const vaos = toHold(Viewer3d, w, boxes(N));
    expect(w.r.mgHold.length).toBe(MERGE_UPLOAD_MESHES - 1 - MERGE_FIRST_MESHES);
    // 그물·윤곽선 VAO 셋 × 첫 걸음 그물(0.59.0은 굽기 단위 − 1개만큼 — 6천 남짓)
    expect(vaos).toBeLessThanOrEqual(MERGE_FIRST_MESHES * 3 + 8);
    expect(w.v.stats.merged.groups).toBe(0);
    open();
    expect(await Viewer3d.preloadMerging()).toBe(true);
    let peak = 0;
    for (let i = 0; i < 400 && (w.r.uploading || w.v.stats.merged.pending > 0); i++) {
      w.v.renderNow();
      peak = Math.max(peak, liveVaos(w.gl));
      await settle(1);
    }
    expect(w.r.uploading).toBe(false);
    expect(w.r.mgHold.length).toBe(0);
    w.v.fit(false);
    bake(w.v);
    expect(w.v.stats.merged.meshes).toBe(N);
    const frame = expandFrame(w.gl, () => w.v.renderNow());
    const { on } = await refs(() => boxes(N));
    expect(w.v.stats.merged.groups).toBe(on.v.stats.merged.groups);
    expect(w.v.stats.drawCalls).toBe(on.v.stats.drawCalls);
    expect(liveVaos(w.gl)).toBe(liveVaos(on.gl));
    expect(w.gl.liveBuffers).toBe(on.gl.liveBuffers);
    expect(frame).toEqual(expandFrame(on.gl, () => on.v.renderNow()));
  });

  it('늦으면 들고 있던 빛 기록을 그물 버퍼로 돌려(장면 차례) 그물마다 이어 올린다 — 그림은 끈 뷰어와 같다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { Viewer3d } = await fresh('hang');
    const w = make(Viewer3d);
    toHold(Viewer3d, w, boxes(N));
    vi.advanceTimersByTime(MERGE_KIT_WAIT_MS);
    expect(Viewer3d.mergingState()).toBe('late');
    expect(w.r.mgHold.length).toBe(0);
    expect(w.r.meshes.length).toBe(MERGE_UPLOAD_MESHES - 1);
    expect(w.r.meshes.some((r) => r.light)).toBe(false);
    expect(w.r.uploadSome(600_000)).toBe(true);
    w.v.fit(false);
    w.v.renderNow();
    expect(w.v.stats.merged.pending).toBe(0);
    const frame = expandFrame(w.gl, () => w.v.renderNow());
    vi.useRealTimers();
    const { off } = await refs(() => boxes(N));
    expect(frame).toEqual(expandFrame(off.gl, () => off.v.renderNow()));
  });

  it('받지 못하면 그물 버퍼로 돌려 이어 올린다 — 그림은 끈 뷰어와 같다', async () => {
    const { Viewer3d } = await fresh('fail');
    const w = make(Viewer3d);
    // 'fail'은 받기를 건 뒤 곧 실패할 수 있다 — 첫 걸음·첫 그림 뒤 훑기가 받기를 걸고, 실패가 오기 전에 들고 있던 기록이 있으면 그물 버퍼로 돌아간다
    w.v.setScene(boxes(N), { incremental: { budgetMs: 600_000 } });
    w.r.uploadSome(600_000);
    w.v.renderNow();
    w.r.uploadSome(600_000);
    expect(await Viewer3d.preloadMerging()).toBe(false);
    expect(Viewer3d.mergingState()).toBe('failed');
    expect(w.r.mgHold.length).toBe(0);
    expect(w.r.uploadSome(600_000)).toBe(true);
    expect(w.r.meshes.length).toBe(N);
    w.v.fit(false);
    w.v.renderNow();
    expect(w.v.stats.merged.groups).toBe(0);
    const frame = expandFrame(w.gl, () => w.v.renderNow());
    const { off } = await refs(() => boxes(N));
    expect(frame).toEqual(expandFrame(off.gl, () => off.v.renderNow()));
  });

  it('걸음 사이 올린 그물 빼기·바꾸기, 묶어 그리기 끄기, 다 올리라는 걸음 — 들고 있던 기록을 그물 버퍼로(끝 그림이 그 장면과 같다)', async () => {
    {
      const { Viewer3d, open } = await fresh('gate');
      const w = make(Viewer3d);
      const s = boxes(N);
      toHold(Viewer3d, w, s);
      // 들고 있는 그물(첫 걸음 뒤)을 빼고 바꾼다
      const removed = s.meshes[MERGE_FIRST_MESHES + 5]!.id;
      w.v.removeMesh(removed);
      w.v.setMesh(box(MERGE_FIRST_MESHES + 9, 2));
      expect(w.r.mgHold.length).toBe(0);
      expect(w.r.meshes.some((r) => r.light)).toBe(false);
      open();
      expect(await Viewer3d.preloadMerging()).toBe(true);
      for (let i = 0; i < 400 && (w.r.uploading || w.v.stats.merged.pending > 0); i++) {
        w.v.renderNow();
        await settle(1);
      }
      w.v.fit(false);
      bake(w.v);
      const want = (): Scene3d => {
        const t = boxes(N);
        t.meshes = t.meshes.filter((m) => m.id !== removed).map((m) => (m.id === `b${MERGE_FIRST_MESHES + 9}` ? box(MERGE_FIRST_MESHES + 9, 2) : m));
        return t;
      };
      const frame = expandFrame(w.gl, () => w.v.renderNow());
      const { on } = await refs(want);
      expect(frame).toEqual(expandFrame(on.gl, () => on.v.renderNow()));
    }
    {
      const { Viewer3d } = await fresh('gate');
      const w = make(Viewer3d);
      toHold(Viewer3d, w, boxes(N));
      w.v.setRenderOptions({ merging: false });
      expect(w.r.mgHold.length).toBe(0);
      expect(w.r.meshes.length).toBe(MERGE_UPLOAD_MESHES - 1);
      expect(w.r.uploadSome(600_000)).toBe(true);
      expect(w.r.meshes.length).toBe(N);
    }
    {
      // 다 올리라는 걸음(그림 저장 — 몫 Infinity)은 조각을 기다리지 않는다
      const { Viewer3d } = await fresh('gate');
      const w = make(Viewer3d);
      toHold(Viewer3d, w, boxes(N));
      expect(w.r.uploadSome(Infinity)).toBe(true);
      expect(w.r.mgHold.length).toBe(0);
      expect(w.r.meshes.length).toBe(N);
      expect(w.r.meshes.some((r) => r.light)).toBe(false);
    }
  });

  it('굽기 단위보다 작은 장면은 마지막 그물에서 조각을 기다린다 · 들고 있는 동안 dispose', async () => {
    const n = MERGE_AUTO_MIN + 10;
    {
      const { Viewer3d, open } = await fresh('gate');
      const w = make(Viewer3d);
      toHold(Viewer3d, w, boxes(n));
      expect(w.r.mgHold.length).toBe(n - 1 - MERGE_FIRST_MESHES);
      expect(w.r.uploading).toBe(true);
      open();
      expect(await Viewer3d.preloadMerging()).toBe(true);
      for (let i = 0; i < 100 && (w.r.uploading || w.v.stats.merged.pending > 0); i++) {
        w.v.renderNow();
        await settle(1);
      }
      expect(w.r.uploading).toBe(false);
      bake(w.v);
      expect(w.v.stats.merged.meshes).toBe(n);
    }
    {
      const { Viewer3d, open } = await fresh('gate');
      const w = make(Viewer3d);
      toHold(Viewer3d, w, boxes(n));
      const v0 = w.gl.liveBuffers;
      w.v.dispose();
      expect(w.gl.liveBuffers).toBeLessThanOrEqual(v0);
      open();
      expect(await Viewer3d.preloadMerging()).toBe(true);
      await settle();
      // 받기가 끝난 뒤에도 없앤 뷰어는 아무것도 하지 않고, 새 뷰어는 곧장 굽는다
      const x = make(Viewer3d);
      x.v.setScene(boxes(n));
      bake(x.v);
      expect(x.v.stats.merged.meshes).toBe(n);
    }
  });
});
