/**
 * 0.56.0 한 번에 올리는 큰 장면의 GL 객체 쌓임 막기(STEP 66차): 묶어 그리기를 켤 장면(훑기가 묶을 수 있는 그물을 문턱만큼 셌다)을 setScene 한 번으로 줄 때
 * 조각을 받는 중이면 아무것도 올리지 않고 미룬다(0.55.0은 그물마다 버퍼·VAO를 모두 만들고 조각이 오면 구웠다 — 그 사이 GL 버퍼가 그물 수 × 4개 남짓).
 *  - 조각이 오면 다음 걸음이 미리 받은 setScene과 같은 길로 한 번에 올린다: 묶음 수·그리기 호출·GL 버퍼·VAO·그림, GL 버퍼 가장 큰 값이 미리 받은 뷰어와 같다
 *  - 늦음('late')·실패·묶어 그리기 끔·다 올리라는 걸음(그림 저장 — Infinity)이면 곧 그물마다 올린다(0.55.0 길). 늦게 오면 그때부터 굽는다
 *  - 미룬 동안 그물을 바꾸거나 빼면 올릴 때 그 장면으로
 *  - 조각을 이미 받았거나 켜지지 않을 장면은 0.55.0처럼 setScene 안에서 올린다
 * 조각 받기 상태는 모듈마다 하나라 시험마다 모듈을 새로 받는다(v0550kit과 같은 꼴)
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
type Rend = { uploadSome: (b: number) => boolean; uploading: boolean; uploadHeld: boolean; meshes: unknown[]; lines: unknown[] };

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

/** 서로 다른 부품(배열을 함께 쓰지 않는 상자 — 셋째마다 정점 색, 윤곽선 있음) */
const box = (i: number, k = 0): Mesh3d => {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6 - k, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1]);
  m.origin = [(i % 60) * 10, Math.floor(i / 60) * 10, 0];
  if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.5));
  return m;
};
const line = { id: 'l0', positions: new Float32Array([0, 0, 0, 100, 0, 0, 0, 0, 0, 0, 100, 0]) };
const boxes = (n: number): Scene3d => ({ name: 'b', units: 'mm', meshes: Array.from({ length: n }, (_, i) => box(i)), lines: [line] });

/** 살아 있는 GL 버퍼 수의 가장 큰 값(만들 때마다 — 한 호출 안에서 만들고 지운 것도. 살아 있는 수는 만들기·지우기마다 하나씩 센다) */
function track(gl: FakeGL): { max: number; reset: () => void } {
  let live = gl.liveBuffers;
  const t = { max: live, reset: () => void (t.max = live) };
  const create = gl.createBuffer.bind(gl), del = gl.deleteBuffer.bind(gl);
  gl.createBuffer = () => {
    const b = create();
    t.max = Math.max(t.max, ++live);
    return b;
  };
  gl.deleteBuffer = (b) => {
    if (b && !b.deleted) live--;
    del(b);
  };
  return t;
}

function make(V: ViewerCtor, merging: boolean | 'auto' = 'auto'): { v: ViewerT; gl: FakeGL; r: Rend; peak: { max: number; reset: () => void } } {
  const v = new V(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  v.setRenderOptions({ merging });
  const gl = (v.canvas as unknown as FakeElement).gl!;
  return { v, gl, r: (v as unknown as { renderer: Rend }).renderer, peak: track(gl) };
}
const liveVaos = (gl: FakeGL): number => gl.vaos.filter((x) => !x.deleted).length;
function bake(v: ViewerT): void {
  for (let i = 0; i < 200 && v.stats.merged.pending > 0; i++) v.renderNow();
  v.renderNow();
}

/** 조각을 미리 받은 뷰어·묶어 그리기를 끈 뷰어 — 같은 장면을 한 번에(가장 큰 값은 setScene 바로 앞부터) */
async function refs(sc: () => Scene3d): Promise<{ on: ReturnType<typeof make> & { before: number }; off: ReturnType<typeof make> & { before: number } }> {
  const { Viewer3d: R } = await fresh('real');
  expect(await R.preloadMerging()).toBe(true);
  const on = { ...make(R), before: 0 };
  const off = { ...make(R, false), before: 0 };
  for (const w of [on, off]) {
    w.v.fit(false);
    w.v.renderNow();
    w.peak.reset();
    w.before = w.gl.liveBuffers;
    w.v.setScene(sc());
    w.v.fit(false);
    bake(w.v);
  }
  return { on, off };
}

const N = MERGE_UPLOAD_MESHES + 952;

describe('0.56.0 한 번에 올리기를 조각이 올 때까지 미루기', () => {
  it('조각을 받는 동안 아무것도 올리지 않고, 오면 미리 받은 뷰어와 같은 길로 올린다 — 그림·GL 객체 수·버퍼 가장 큰 값이 같다', async () => {
    const { Viewer3d, open } = await fresh('gate');
    const w = make(Viewer3d);
    w.v.fit(false);
    w.v.renderNow();
    w.peak.reset();
    const b0 = w.gl.liveBuffers;
    w.v.setScene(boxes(N));
    expect(Viewer3d.mergingState()).toBe('loading');
    expect(w.r.uploading).toBe(true);
    expect(w.r.meshes.length).toBe(0);
    expect(w.r.lines.length).toBe(0);
    // 기다리는 동안: 다 구울 때까지 기다리는 쪽이 이 올리기도 기다린다
    expect(w.v.stats.merged.pending).toBe(1);
    w.v.fit(false);
    for (let i = 0; i < 3; i++) w.v.renderNow();
    expect(w.r.uploadHeld).toBe(true);
    expect(w.r.meshes.length).toBe(0);
    // 장면 그물 버퍼를 하나도 만들지 않았다(0.55.0은 여기서 그물마다 버퍼 — 3,000개 상자에서 1만 개 남짓)
    expect(w.peak.max - b0).toBeLessThan(16);
    // 올리기 앞 살아 있는 버퍼(새 장면의 격자까지 — 미리 받은 뷰어는 setScene 앞)
    w.peak.reset();
    const up0 = w.gl.liveBuffers;
    open();
    expect(await Viewer3d.preloadMerging()).toBe(true);
    bake(w.v);
    expect(w.r.uploading).toBe(false);
    expect(w.r.lines.length).toBe(1);
    expect(w.v.stats.merged.meshes).toBe(N);
    const frame = expandFrame(w.gl, () => w.v.renderNow());
    const { on } = await refs(() => boxes(N));
    expect(w.v.stats.merged.groups).toBe(on.v.stats.merged.groups);
    expect(w.v.stats.drawCalls).toBe(on.v.stats.drawCalls);
    expect(liveVaos(w.gl)).toBe(liveVaos(on.gl));
    expect(w.gl.liveBuffers).toBe(on.gl.liveBuffers);
    expect(w.v.stats.buffers).toEqual(on.v.stats.buffers);
    // 올리는 걸음 안의 가장 큰 값: 0.57.0 곧장 구워 그물마다 버퍼를 만들지 않는다(미리 받은 setScene과 같은 길 — 격자 버퍼 넷이 setScene 안이면 그만큼만 다르다)
    expect(w.peak.max - up0).toBeLessThanOrEqual(on.peak.max - on.before);
    expect(on.peak.max - on.before).toBeLessThan(32);
    expect(frame).toEqual(expandFrame(on.gl, () => on.v.renderNow()));
  });

  it('받기가 기다림 한도를 넘으면 곧 그물마다 올리고(그림은 끈 뷰어와 같다), 늦게 오면 그때부터 굽는다 — 끝은 미리 받은 뷰어와 같다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { Viewer3d, open } = await fresh('gate');
    const w = make(Viewer3d);
    let ready = 0;
    const rr = w.r as unknown as { onMergeReady: (() => void) | null };
    const note = rr.onMergeReady;
    rr.onMergeReady = () => {
      ready++;
      note?.();
    };
    w.v.setScene(boxes(N));
    expect(w.r.uploading).toBe(true);
    vi.advanceTimersByTime(MERGE_KIT_WAIT_MS - 1);
    await settle();
    expect(w.r.uploadSome(8)).toBe(false);
    expect(w.r.meshes.length).toBe(0);
    expect(ready).toBe(0);
    vi.advanceTimersByTime(1);
    expect(Viewer3d.mergingState()).toBe('late');
    expect(ready).toBe(1);
    expect(w.r.uploadHeld).toBe(false);
    // 늦은 뒤 다음 걸음이 올리기 전까지는 1(이 올리기를 기다리게), 올린 뒤 0
    expect(w.v.stats.merged.pending).toBe(1);
    w.v.fit(false);
    w.v.renderNow();
    expect(w.r.uploading).toBe(false);
    expect(w.r.meshes.length).toBe(N);
    expect(w.v.stats.merged.pending).toBe(0);
    expect(w.v.stats.merged.groups).toBe(0);
    const perMesh = expandFrame(w.gl, () => w.v.renderNow());
    vi.useRealTimers();
    open();
    expect(await Viewer3d.preloadMerging()).toBe(true);
    expect(w.v.stats.merged.pending).toBeGreaterThan(0);
    bake(w.v);
    expect(w.v.stats.merged.meshes).toBe(N);
    const frame = expandFrame(w.gl, () => w.v.renderNow());
    const { on, off } = await refs(() => boxes(N));
    expect(perMesh).toEqual(expandFrame(off.gl, () => off.v.renderNow()));
    expect(w.v.stats.merged.groups).toBe(on.v.stats.merged.groups);
    expect(liveVaos(w.gl)).toBe(liveVaos(on.gl));
    expect(w.gl.liveBuffers).toBe(on.gl.liveBuffers);
    expect(frame).toEqual(expandFrame(on.gl, () => on.v.renderNow()));
  });

  it('받지 못하면 곧 그물마다 올린다(failed — 0.55.0과 같은 끝)', async () => {
    const { Viewer3d } = await fresh('fail');
    const w = make(Viewer3d);
    w.v.setScene(boxes(N));
    expect(w.r.uploading).toBe(true);
    expect(await Viewer3d.preloadMerging()).toBe(false);
    expect(Viewer3d.mergingState()).toBe('failed');
    w.v.fit(false);
    w.v.renderNow();
    expect(w.r.uploading).toBe(false);
    expect(w.r.meshes.length).toBe(N);
    expect(w.v.stats.merged.pending).toBe(0);
    expect(w.v.stats.merged.groups).toBe(0);
  });

  it('다 올리라는 걸음(그림 저장 — Infinity)·묶어 그리기 끔이면 기다리지 않고 곧 올린다', async () => {
    const { Viewer3d, open } = await fresh('gate');
    const a = make(Viewer3d);
    a.v.setScene(boxes(N));
    expect(a.r.uploadSome(8)).toBe(false);
    expect(a.r.uploadSome(Infinity)).toBe(true);
    expect(a.r.meshes.length).toBe(N);
    expect(a.r.lines.length).toBe(1);
    const b = make(Viewer3d);
    b.v.setScene(boxes(N));
    expect(b.r.uploading).toBe(true);
    b.v.setRenderOptions({ merging: false });
    b.v.fit(false);
    b.v.renderNow();
    expect(b.r.uploading).toBe(false);
    expect(b.r.meshes.length).toBe(N);
    expect(b.v.stats.merged.pending).toBe(0);
    open();
    expect(await Viewer3d.preloadMerging()).toBe(true);
    // 기다리지 않고 올린 a는 다 올린 뒤 묶는다(0.55.0 길), 끈 b는 그물마다 그대로
    a.v.fit(false);
    bake(a.v);
    expect(a.v.stats.merged.meshes).toBe(N);
    bake(b.v);
    expect(b.v.stats.merged.groups).toBe(0);
  });

  it('미룬 동안 그물을 바꾸거나 빼거나 더하면 올릴 때 그 장면으로 — 미리 받은 뷰어에 같은 장면을 준 것과 같다', async () => {
    const { Viewer3d, open } = await fresh('gate');
    const w = make(Viewer3d);
    w.v.setScene(boxes(N));
    w.v.setMesh(box(5, 2));
    w.v.removeMesh('b7');
    w.v.setMesh(box(N + 3));
    expect(w.r.uploading).toBe(true);
    expect(w.r.meshes.length).toBe(0);
    open();
    expect(await Viewer3d.preloadMerging()).toBe(true);
    w.v.fit(false);
    bake(w.v);
    expect(w.r.meshes.length).toBe(N);
    const frame = expandFrame(w.gl, () => w.v.renderNow());
    const want = (): Scene3d => {
      const s = boxes(N);
      s.meshes[5] = box(5, 2);
      s.meshes.splice(7, 1);
      s.meshes.push(box(N + 3));
      return s;
    };
    const { on } = await refs(want);
    expect(w.v.stats.merged.groups).toBe(on.v.stats.merged.groups);
    expect(w.v.stats.drawCalls).toBe(on.v.stats.drawCalls);
    expect(frame).toEqual(expandFrame(on.gl, () => on.v.renderNow()));
  });

  it('조각을 이미 받았거나 켜지지 않을 장면·나눠 올리기는 0.55.0처럼(setScene 안에서 올린다 / 굽기 단위에서 기다린다)', async () => {
    const { Viewer3d, open } = await fresh('gate');
    // 문턱 아래(서로 다른 상자 1,999개) — 받기를 걸지 않고 곧 올린다
    const a = make(Viewer3d);
    a.v.setScene(boxes(MERGE_AUTO_MIN - 1));
    expect(Viewer3d.mergingState()).toBe('idle');
    expect(a.r.uploading).toBe(false);
    expect(a.r.meshes.length).toBe(MERGE_AUTO_MIN - 1);
    // 나눠 올리기는 첫 걸음을 올린다(굽기 단위에서 기다리는 0.54.0 길 — 통째로 미루지 않는다)
    const b = make(Viewer3d);
    b.v.setScene(boxes(N), { incremental: { budgetMs: 600_000 } });
    expect(b.r.uploadSome(600_000)).toBe(false);
    // 0.60.0 조각이 없어 훑기를 미룬 첫 그림 앞 걸음은 그물 MERGE_FIRST_MESHES개까지
    expect(b.r.meshes.length).toBe(MERGE_FIRST_MESHES);
    open();
    expect(await Viewer3d.preloadMerging()).toBe(true);
    // 받은 뒤의 한 번에 올리기는 setScene 안에서
    const c = make(Viewer3d);
    c.v.setScene(boxes(N));
    expect(c.r.uploading).toBe(false);
    expect(c.r.meshes.length).toBe(N);
    expect(c.v.stats.merged.groups).toBeGreaterThan(0);
  });

  it("'on'은 그물이 문턱 이상일 때만 미룬다(작은 'on' 장면은 곧 그물마다 — 오면 굽는다)", async () => {
    const { Viewer3d, open } = await fresh('gate');
    const a = make(Viewer3d);
    a.v.setRenderOptions({ merging: 'on' });
    a.v.setScene(boxes(40));
    expect(Viewer3d.mergingState()).toBe('loading');
    expect(a.r.uploading).toBe(false);
    expect(a.r.meshes.length).toBe(40);
    const b = make(Viewer3d);
    b.v.setRenderOptions({ merging: 'on' });
    b.v.setScene(boxes(MERGE_AUTO_MIN));
    expect(b.r.uploading).toBe(true);
    open();
    expect(await Viewer3d.preloadMerging()).toBe(true);
    for (const w of [a, b]) {
      w.v.fit(false);
      bake(w.v);
    }
    expect(a.v.stats.merged.meshes).toBe(40);
    expect(b.v.stats.merged.meshes).toBe(MERGE_AUTO_MIN);
  });
});
