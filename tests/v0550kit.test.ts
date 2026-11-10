/**
 * 0.55.0 묶어 그리기 조각 받기 걸림 막기와 'auto' 받기 시점:
 *  - 걸림: 받기가 MERGE_KIT_WAIT_MS 안에 끝나지 않으면 페이지는 'late' — 굽기 단위에서 멈춘 나눠 올리기가 그물마다 이어 올리고 stats.merged.pending은 0
 *    (0.54.0은 2,047번째 그물에서 멈춘 채 남았다). 그림은 묶어 그리기를 끈 뷰어와 같다
 *  - 늦은 도착: 'late' 뒤에 오면 그때부터 굽는다 — 다 올린 뒤 오면 다 올린 장면을, 올리는 중에 오면 남은 그물은 올리는 걸음에서·기다리지 않고 올린 그물은 다 올린 뒤.
 *    끝 그림은 조각을 미리 받은 뷰어와 같다
 *  - 실패: 'failed' — 그물마다(0.54.0과 같다)
 *  - 'auto' 받기 시점: setScene이 아니라 훑기가 묶을 수 있는 그물을 문턱만큼 센 때. 그물은 문턱 이상이어도 묶을 수 있는 그물(함께 쓰는 배열이 없는 것)이
 *    문턱 아래면 받지 않는다('idle'). 다 올린 뒤 그물을 더해 문턱에 닿으면 mergeStep이 같은 셈으로 받는다
 * 조각 받기 상태는 모듈마다 하나라 시험마다 모듈을 새로 받는다(vi.resetModules — import('./mergegl')은 vi.doMock으로 걸거나·실패하거나·늦게 오게)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { MERGE_AUTO_MIN, MERGE_KIT_WAIT_MS, MERGE_UPLOAD_MESHES } from '../src/mergeopts';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import type { Viewer3d as ViewerT } from '../src/viewer';

type ViewerCtor = typeof import('../src/viewer').Viewer3d;
type Rend = { uploadSome: (b: number) => boolean; uploading: boolean; uploadHeld: boolean; meshes: unknown[] };

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
  // 'gate': 열기 전에 받기를 걸면 열 때까지 기다리고, 연 뒤에 걸면 곧 온다(받기 함수가 도는 때는 import() 뒤 몇 틱 — 시험이 열기 전인지 모른다)
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

/** import()가 풀릴 수 있게 이벤트 고리를 돌린다(가짜 시계에 걸리지 않는 setImmediate) */
const settle = async (n = 4): Promise<void> => {
  for (let i = 0; i < n; i++) await new Promise<void>((res) => setImmediate(res));
};

const box = (i: number): Mesh3d => {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1]);
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

/** 나눠 올리기를 굽기 단위에서 멈춘 데까지: 첫 걸음(첫 그림 앞 — 훑지 않는다) → 첫 그림 → 다음 걸음(훑기를 마치고 문턱에서 받기를 건다 — 조각이 없으면 멈춘다) */
function toHold(V: ViewerCtor, w: { v: ViewerT; r: Rend }, n: number): void {
  w.v.setScene(boxes(n), { incremental: { budgetMs: 600_000 } });
  // 0.55.0 'auto'는 setScene에서 받기를 걸지 않는다(훑기 전 — 묶을 수 있는 그물을 아직 세지 않았다)
  expect(V.mergingState()).toBe('idle');
  expect(w.r.uploadSome(600_000)).toBe(false);
  expect(w.r.meshes.length).toBe(MERGE_UPLOAD_MESHES - 1);
  w.v.renderNow();
  expect(w.r.uploadSome(600_000)).toBe(false);
  expect(V.mergingState()).toBe('loading');
  expect(w.r.meshes.length).toBe(MERGE_UPLOAD_MESHES - 1);
  expect(w.r.uploadHeld).toBe(true);
}

/** 묶어 그리기를 끈 뷰어(그물마다)·조각을 미리 받은 뷰어 — 같은 장면을 한 번에 */
async function refs(n: number): Promise<{ off: { v: ViewerT; gl: FakeGL }; on: { v: ViewerT; gl: FakeGL } }> {
  const { Viewer3d: R } = await fresh('real');
  expect(await R.preloadMerging()).toBe(true);
  const off = make(R, false);
  off.v.setScene(boxes(n));
  const on = make(R);
  on.v.setScene(boxes(n));
  for (const w of [off, on]) {
    w.v.fit(false);
    bake(w.v);
  }
  return { off, on };
}

const N = MERGE_UPLOAD_MESHES + 600;

describe('0.55.0 조각 받기 걸림 막기', () => {
  it('받기가 끝나지 않으면 기다림 한도에서 그물마다 이어 올린다(멈춘 채 남지 않는다) — 그림은 끈 뷰어와 같고 기다리는 것 0', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { Viewer3d } = await fresh('hang');
    const w = make(Viewer3d);
    let ready = 0;
    const rr = w.r as unknown as { onMergeReady: (() => void) | null };
    const note = rr.onMergeReady;
    rr.onMergeReady = () => {
      ready++;
      note?.();
    };
    toHold(Viewer3d, w, N);
    // 한도 바로 앞까지는 그대로 기다린다(걸음을 불러도 멈춘 자리)
    vi.advanceTimersByTime(MERGE_KIT_WAIT_MS - 1);
    await settle();
    expect(Viewer3d.mergingState()).toBe('loading');
    expect(w.r.uploadSome(600_000)).toBe(false);
    expect(w.r.meshes.length).toBe(MERGE_UPLOAD_MESHES - 1);
    expect(ready).toBe(0);
    vi.advanceTimersByTime(1);
    expect(Viewer3d.mergingState()).toBe('late');
    expect(ready).toBe(1);
    expect(w.r.uploadHeld).toBe(false);
    expect(w.r.uploadSome(600_000)).toBe(true);
    expect(w.r.meshes.length).toBe(N);
    w.v.fit(false);
    w.v.renderNow();
    expect(w.v.stats.merged.pending).toBe(0);
    expect(w.v.stats.merged.groups).toBe(0);
    // 걸린 받기에서 연 다음 장면도 기다리지 않는다(첫 걸음 뒤 굽기 단위에서 멈추지 않는다)
    const w2 = make(Viewer3d);
    w2.v.setScene(boxes(N), { incremental: { budgetMs: 600_000 } });
    w2.r.uploadSome(600_000);
    w2.v.renderNow();
    expect(w2.r.uploadSome(600_000)).toBe(true);
    expect(w2.r.meshes.length).toBe(N);
    w2.v.fit(false);
    w2.v.renderNow();
    expect(w2.v.stats.merged.pending).toBe(0);
    const frame = expandFrame(w.gl, () => w.v.renderNow());
    vi.useRealTimers();
    const { off } = await refs(N);
    expect(w.v.stats.drawCalls).toBe(off.v.stats.drawCalls);
    expect(frame).toEqual(expandFrame(off.gl, () => off.v.renderNow()));
  });

  it('늦게 오면 그때부터 굽는다: 다 올린 뒤 오면 다 올린 장면을 — 끝 그림·묶은 그물 수가 미리 받은 뷰어와 같다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { Viewer3d, open } = await fresh('gate');
    const w = make(Viewer3d);
    toHold(Viewer3d, w, N);
    vi.advanceTimersByTime(MERGE_KIT_WAIT_MS);
    expect(Viewer3d.mergingState()).toBe('late');
    expect(w.r.uploadSome(600_000)).toBe(true);
    w.v.fit(false);
    w.v.renderNow();
    expect(w.v.stats.merged.groups).toBe(0);
    vi.useRealTimers();
    open();
    // 받기 약속은 늦어도 받기가 끝날 때 풀린다(true)
    expect(await Viewer3d.preloadMerging()).toBe(true);
    expect(Viewer3d.mergingState()).toBe('ready');
    expect(w.v.stats.merged.pending).toBeGreaterThan(0);
    bake(w.v);
    expect(w.v.stats.merged.meshes).toBe(N);
    const frame = expandFrame(w.gl, () => w.v.renderNow());
    const { on } = await refs(N);
    expect(w.v.stats.merged.groups).toBe(on.v.stats.merged.groups);
    expect(w.v.stats.drawCalls).toBe(on.v.stats.drawCalls);
    expect(liveVaos(w.gl)).toBe(liveVaos(on.gl));
    expect(w.gl.liveBuffers).toBe(on.gl.liveBuffers);
    expect(frame).toEqual(expandFrame(on.gl, () => on.v.renderNow()));
  });

  it('올리는 중에 늦게 오면 남은 그물은 올리는 걸음에서 굽고, 기다리지 않고 올린 그물은 다 올린 뒤 묶는다 — 끝 그림이 미리 받은 뷰어와 같다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { Viewer3d, open } = await fresh('gate');
    const M = MERGE_UPLOAD_MESHES * 3 + 100;
    const w = make(Viewer3d);
    toHold(Viewer3d, w, M);
    vi.advanceTimersByTime(MERGE_KIT_WAIT_MS);
    // 한 걸음에 그물 하나씩(몫 0) 600개를 기다리지 않고 올린 뒤 조각이 온다
    for (let i = 0; i < 600; i++) w.r.uploadSome(0);
    expect(w.r.meshes.length).toBe(MERGE_UPLOAD_MESHES - 1 + 600);
    expect(w.v.stats.merged.groups).toBe(0);
    vi.useRealTimers();
    open();
    expect(await Viewer3d.preloadMerging()).toBe(true);
    expect(Viewer3d.mergingState()).toBe('ready');
    let peak = 0;
    while (w.r.uploading) {
      w.r.uploadSome(0);
      peak = Math.max(peak, liveVaos(w.gl));
    }
    // 남은 그물은 올리는 걸음에서 굽는다(그물마다 VAO가 남은 그물 수만큼 쌓이지 않는다 — 기다리지 않고 올린 2,647개 + 굽기 단위 안)
    expect(peak).toBeLessThan((MERGE_UPLOAD_MESHES - 1 + 600 + MERGE_UPLOAD_MESHES) * 3 + 32);
    expect(w.v.stats.merged.groups).toBeGreaterThan(0);
    w.v.fit(false);
    bake(w.v);
    expect(w.v.stats.merged.meshes).toBe(M);
    const frame = expandFrame(w.gl, () => w.v.renderNow());
    const { on } = await refs(M);
    expect(frame).toEqual(expandFrame(on.gl, () => on.v.renderNow()));
  });

  it('받지 못하면 그물마다(0.54.0과 같다) — failed, 멈춘 올리기를 잇는다', async () => {
    const { Viewer3d } = await fresh('fail');
    const w = make(Viewer3d);
    toHold(Viewer3d, w, N);
    expect(await Viewer3d.preloadMerging()).toBe(false);
    expect(Viewer3d.mergingState()).toBe('failed');
    expect(w.r.uploadSome(600_000)).toBe(true);
    w.v.renderNow();
    expect(w.v.stats.merged.pending).toBe(0);
    expect(w.v.stats.merged.groups).toBe(0);
  });
});

describe("0.55.0 'auto' 받기 시점", () => {
  it('그물이 문턱 이상이어도 묶을 수 있는 그물(함께 쓰는 배열이 없는 것)이 문턱 아래면 받지 않는다 — 나눠 올리기·한 번에 올리기', async () => {
    const { Viewer3d } = await fresh('real');
    // 상자 모양 셋을 그물 3,000개가 나눠 쓴다(같은 정의 자리 — 묶지 않는다) + 서로 다른 상자 1,999개
    const shapes = [0, 1, 2].map((k) => box(k));
    const shared = (i: number): Mesh3d => ({ ...shapes[i % 3]!, id: `s${i}`, origin: [(i % 60) * 10, 1000 + Math.floor(i / 60) * 10, 0] });
    const sc: Scene3d = { name: 's', units: 'mm', meshes: [...Array.from({ length: 3000 }, (_, i) => shared(i)), ...Array.from({ length: MERGE_AUTO_MIN - 1 }, (_, i) => box(i + 10))], lines: [] };
    const a = make(Viewer3d);
    a.v.setScene(sc, { incremental: { budgetMs: 600_000 } });
    for (let i = 0; i < 40 && a.r.uploading; i++) {
      a.r.uploadSome(600_000);
      a.v.renderNow();
    }
    a.v.renderNow();
    await settle();
    a.v.renderNow();
    expect(a.r.uploading).toBe(false);
    const b = make(Viewer3d);
    b.v.setScene(sc);
    b.v.renderNow();
    await settle();
    b.v.renderNow();
    expect(Viewer3d.mergingState()).toBe('idle');
    for (const w of [a, b]) {
      expect(w.v.stats.merged.pending).toBe(0);
      expect(w.v.stats.merged.active).toBe(false);
    }
    // 서로 다른 상자를 하나 더하면(다 올린 뒤 — mergeStep이 묶음 밖 그물을 센다) 문턱에 닿아 받기를 걸고 굽는다
    b.v.setMesh(box(MERGE_AUTO_MIN + 20));
    b.v.renderNow();
    expect(Viewer3d.mergingState()).toBe('loading');
    expect(b.v.stats.merged.pending).toBe(1);
    expect(await Viewer3d.preloadMerging()).toBe(true);
    bake(b.v);
    expect(b.v.stats.merged.active).toBe(true);
    expect(b.v.stats.merged.meshes).toBe(MERGE_AUTO_MIN);
  });

  it('훑기가 묶을 수 있는 그물을 문턱만큼 센 때 받기를 건다(한 번에 올리기는 setScene 안에서)', async () => {
    const { Viewer3d } = await fresh('real');
    const w = make(Viewer3d);
    w.v.setScene(boxes(MERGE_AUTO_MIN));
    expect(Viewer3d.mergingState()).toBe('loading');
    expect(w.v.stats.merged.pending).toBe(1);
    expect(await Viewer3d.preloadMerging()).toBe(true);
    bake(w.v);
    expect(w.v.stats.merged.meshes).toBe(MERGE_AUTO_MIN);
  });
});
