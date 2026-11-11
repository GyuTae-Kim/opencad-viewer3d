/**
 * 0.59.0 나눠 올리는 동안 그리기 줄이기(58차 남은 일 — 묶을 그물만 있는 큰 장면의 전체 시간)와 큰 장면 첫 그림 앞 그물마다 버퍼 줄이기.
 * 시간 몫에 답이 달린 시험이라 performance.now를 시험이 돌리고, 프레임은 requestAnimationFrame 줄로 돌린다(renderNow는 늘 그린다).
 *  - 그릴 것이 늘지 않은 걸음은 그리지 않고, 끝 그림·묶음·버퍼는 걸음마다 그린 뷰어와 같다
 *  - 지난 그리기가 걸음 몫보다 오래 걸리면 몇 걸음에 한 번 그린다(다 올린 걸음·다른 까닭의 그리기·조각을 기다리는 걸음은 그린다, redrawMs를 주면 그 뜻대로)
 *  - 훑기를 뒤로 미룬 큰 장면의 첫 그림 앞 걸음은 그물 64개까지만 그물마다 올린다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { MERGE_FIRST_MESHES, MERGE_SCAN_FIRST, MERGE_UPLOAD_MESHES } from '../src/mergeopts';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
let raf: ((t: number) => void)[] = [];
beforeAll(async () => {
  dom = installDom();
  expect(await Viewer3d.preloadMerging()).toBe(true);
  const g = globalThis as unknown as Record<string, unknown>;
  g.requestAnimationFrame = (cb: (t: number) => void): number => raf.push(cb);
  g.cancelAnimationFrame = (): void => {
    raf = [];
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  raf = [];
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

const box = (i: number): Mesh3d => {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1]);
  m.origin = [(i % 300) * 10, Math.floor(i / 300) * 10, 0];
  return m;
};
const scene = (n: number, lines = 0): Scene3d => ({
  name: 'd',
  units: 'mm',
  meshes: Array.from({ length: n }, (_, i) => box(i)),
  lines: Array.from({ length: lines }, (_, i) => ({ id: `l${i}`, positions: new Float32Array([i, 0, 0, i, 10, 0]), color: [0, 0, 0, 1] as [number, number, number, number] })),
});

type Rend = {
  uploadSome: (b: number) => boolean;
  uploading: boolean;
  uploadHeld: boolean;
  meshes: unknown[];
  mgHold: unknown[];
  render: (...a: unknown[]) => void;
  renderMs: number;
};
type W = { v: Viewer3d; gl: FakeGL; r: Rend; log: { draws: number; atDraw: number[]; shown: number[] } };

function make(): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  v.fit(false);
  v.renderNow();
  const r = (v as unknown as { renderer: Rend }).renderer;
  const log = { draws: 0, atDraw: [] as number[], shown: [] as number[] };
  const render = r.render.bind(r);
  r.render = (...a: unknown[]) => {
    log.draws++;
    log.atDraw.push(clock.t);
    log.shown.push(r.meshes.length);
    render(...a);
    // 시험이 정한 그리기 시간(renderMs가 그 값 — render 안에서 잰 것처럼)
    if (clock.renderCost) {
      clock.t += clock.renderCost;
      r.renderMs = clock.renderCost;
    }
  };
  raf = [];
  return { v, gl, r, log };
}
/** 시험이 돌리는 시계: performance.now를 부를 때마다 dt만큼 간다 */
const clock = { t: 0, dt: 0.002, renderCost: 0 };
function freeze(renderCost = 0, dt = 0.002): void {
  clock.t = 0;
  clock.dt = dt;
  clock.renderCost = renderCost;
  vi.spyOn(performance, 'now').mockImplementation(() => (clock.t += clock.dt));
}
/** 프레임 한 번(rAF 줄에서 하나) */
function frame(): boolean {
  const cb = raf.shift();
  if (!cb) return false;
  cb(performance.now());
  return true;
}
/** 다 올리고 다 구울 때까지 프레임을 돌린다(프레임 수) */
function run(w: W, opt?: { each?: (i: number) => void }): number {
  let n = 0;
  for (let i = 0; i < 40_000; i++) {
    opt?.each?.(i);
    if (!frame()) break;
    n++;
    if (!w.r.uploading && w.v.stats.merged.pending === 0 && !raf.length) break;
  }
  return n;
}
/** 같은 장면을 걸음마다 그리는 뷰어(renderNow)로 끝까지 */
function everyStep(sc: Scene3d, inc: object): W {
  const w = make();
  w.v.setScene(sc, { incremental: inc });
  w.v.fit(false);
  for (let i = 0; i < 40_000 && w.r.uploading; i++) w.v.renderNow();
  for (let i = 0; i < 2000 && w.v.stats.merged.pending > 0; i++) w.v.renderNow();
  w.v.renderNow();
  return w;
}
const endOf = (w: W): unknown => {
  const s = w.v.stats;
  return { merged: s.merged.meshes, groups: s.merged.groups, drawCalls: s.drawCalls, triangles: s.triangles, segments: s.segments, bytes: s.buffers.bytes, buffers: w.gl.liveBuffers, shown: w.r.meshes.length };
};

describe('0.59.0 그릴 것이 늘지 않은 걸음', () => {
  it('묶을 그물만 있는 1만 그물: 빛 기록만 모은 걸음은 그리지 않고(프레임보다 그리기가 적다) 끝 그림·묶음·버퍼는 걸음마다 그린 뷰어와 같다', () => {
    freeze();
    const ref = everyStep(scene(10_000), { budgetMs: 1 });
    freeze();
    const w = make();
    w.v.setScene(scene(10_000), { incremental: { budgetMs: 1 } });
    w.v.fit(false);
    const before = { draws: w.log.draws };
    const steps = run(w);
    expect(steps).toBeGreaterThan(1);
    const draws = w.log.draws - before.draws;
    expect(draws).toBeLessThan(steps);
    // 그릴 때마다 그리기 목록이 지난번보다 늘었다(첫 그림 빼고)
    for (let i = 1; i < w.log.shown.length; i++) expect(w.log.shown[i]).toBeGreaterThan(w.log.shown[i - 1]!);
    expect(w.log.shown.at(-1)).toBe(10_000);
    w.v.renderNow();
    expect(endOf(w)).toEqual(endOf(ref));
  });

  it('첫 걸음은 그린다(setScene의 첫 그림) — 그때까지 보이는 것이 없어도', () => {
    freeze();
    const w = make();
    const before = w.log.draws;
    w.v.setScene(scene(10_000), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    expect(frame()).toBe(true);
    expect(w.log.draws).toBe(before + 1);
    expect(w.r.meshes.length).toBe(0);
    expect(w.r.mgHold.length).toBeGreaterThan(0);
  });

  it('둘째 걸음도 빛 기록만이면 그리지 않고, 다른 까닭의 그리기(궤도)는 그린다', () => {
    freeze();
    const w = make();
    w.v.setScene(scene(10_000), { incremental: { budgetMs: 1 } });
    w.v.fit(false);
    frame();
    const d = w.log.draws;
    frame();
    expect(w.log.draws).toBe(d);
    expect(w.r.meshes.length).toBe(0);
    w.v.orbitBy(0.1, 0);
    frame();
    expect(w.log.draws).toBe(d + 1);
    expect(w.r.meshes.length).toBe(0);
  });

  it('다 올린 걸음은 그린다 — 뒤따르는 것이 없어도 끝 그림이 남는다', () => {
    freeze();
    const w = make();
    w.v.setScene(scene(10_000), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    run(w);
    expect(w.r.uploading).toBe(false);
    expect(w.log.shown.at(-1)).toBe(10_000);
    expect(raf.length).toBe(0);
  });

  it('그물이 다 올라간 뒤 선분을 올리는 걸음은 그린다(묶음과 상관없는 기록도 새 그림)', () => {
    freeze();
    const w = make();
    w.v.setScene(scene(3000, 50), { incremental: { budgetMs: 0.05 } });
    w.v.fit(false);
    const d0 = w.log.draws;
    run(w);
    expect(w.log.draws).toBeGreaterThan(d0);
    w.v.renderNow();
    expect((w.v as unknown as { renderer: { lines: unknown[] } }).renderer.lines.length).toBe(50);
  });

  it('redrawMs를 주어도 그릴 것이 없으면 간격이 지나도 그리지 않는다', () => {
    freeze();
    const w = make();
    w.v.setScene(scene(10_000), { incremental: { budgetMs: 1, redrawMs: 0.001 } });
    w.v.fit(false);
    frame();
    const d = w.log.draws;
    frame();
    expect(w.log.draws).toBe(d);
  });

  it('whenMerged는 건너뛴 걸음이 있어도 다 구운 뒤 풀린다', async () => {
    freeze();
    const w = make();
    w.v.setScene(scene(10_000), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    const p = w.v.whenMerged();
    run(w);
    for (let i = 0; i < 50 && raf.length; i++) frame();
    await expect(p).resolves.toBe('done');
  });
});

describe('0.59.0 그리기가 걸음 몫보다 오래 걸릴 때', () => {
  const R = 5;
  it('몇 걸음에 한 번만 그린다(지난 그리기 시작에서 그리기 ms의 3배) — 다 올린 걸음은 그린다', () => {
    freeze(R);
    const w = make();
    w.v.setScene(scene(12_000), { incremental: { budgetMs: 2 } });
    w.v.fit(false);
    const d0 = w.log.draws;
    const steps = run(w);
    const draws = w.log.draws - d0;
    expect(draws).toBeLessThan(steps / 2);
    const at = w.log.atDraw.slice(d0);
    expect(at.length).toBeGreaterThanOrEqual(3);
    // 이웃한 그리기 사이가 3R 이상이다(그리기 시각은 걸음 뒤라 걸음 시간만큼 어긋날 수 있다), 첫 그림과 다 올린 걸음의 그리기는 뺀다
    for (let i = 2; i < at.length - 1; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(3 * R - 2);
    expect(w.log.shown.at(-1)).toBe(12_000);
    expect(raf.length).toBe(0);
    w.v.renderNow();
    expect(w.v.stats.merged.meshes).toBe(12_000);
  });

  it('그리기가 몫보다 짧으면 그릴 것이 있는 걸음은 모두 그린다(지금과 같다 — 작은 장면)', () => {
    freeze(1);
    const w = make();
    w.v.setScene(scene(10_000), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    const d0 = w.log.draws;
    run(w);
    // 그릴 때마다 묶음 단위(2,048개)로만 늘고, 건너뛴 묶음이 없다(첫 그림 앞 빼고)
    const shown = w.log.shown.slice(d0);
    for (let i = 1; i < shown.length - 1; i++) expect(shown[i]! - shown[i - 1]!).toBeLessThanOrEqual(2 * MERGE_UPLOAD_MESHES);
    expect(shown.at(-1)).toBe(10_000);
    expect(shown.length).toBeGreaterThanOrEqual(Math.ceil(10_000 / MERGE_UPLOAD_MESHES));
  });

  it('카메라를 움직인 프레임은 간격 안이어도 그린다(나눠 올리는 동안 조작이 끊기지 않게)', () => {
    freeze(R);
    const w = make();
    w.v.setScene(scene(12_000), { incremental: { budgetMs: 2 } });
    w.v.fit(false);
    for (let i = 0; i < 4; i++) frame();
    expect(w.r.renderMs).toBe(R);
    expect(w.r.uploading).toBe(true);
    const d = w.log.draws;
    w.v.orbitBy(0.1, 0);
    frame();
    expect(w.log.draws).toBe(d + 1);
  });

  it('redrawMs: 0을 주면 간격을 두지 않는다(그릴 것이 있는 걸음은 모두 그린다)', () => {
    freeze(R);
    const w = make();
    w.v.setScene(scene(12_000), { incremental: { budgetMs: 2, redrawMs: 0 } });
    w.v.fit(false);
    const d0 = w.log.draws;
    run(w);
    const shown = w.log.shown.slice(d0);
    for (let i = 1; i < shown.length - 1; i++) expect(shown[i]! - shown[i - 1]!).toBeLessThanOrEqual(2 * MERGE_UPLOAD_MESHES);
  });

  it('redrawMs를 주면 그 간격을 따른다(자동 간격을 겹치지 않는다)', () => {
    freeze(R);
    const w = make();
    w.v.setScene(scene(12_000), { incremental: { budgetMs: 2, redrawMs: 12 } });
    w.v.fit(false);
    const d0 = w.log.draws;
    run(w);
    const at = w.log.atDraw.slice(d0);
    for (let i = 2; i < at.length - 1; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(12 - 2);
    expect(at.length).toBeGreaterThan(2);
  });

  it('조각을 기다려 멈춘 걸음은 그리기를 건너뛰지 않는다(다음 프레임이 걸리지 않아 그동안 올린 것이 안 보인다)', () => {
    freeze(R);
    const w = make();
    w.v.setScene(scene(3000), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    frame();
    // 다음 걸음이 그물을 올리고 멈췄다고(uploadHeld) 흉내 낸다 — 지난 그리기는 비싸고 간격 안이다
    const up0 = w.r.uploadSome;
    const r = w.r as unknown as { meshes: unknown[]; uploadSome: unknown; pending: unknown };
    w.r.uploadSome = () => {
      r.meshes.push(...w.r.mgHold);
      w.r.mgHold.length = 0;
      return false;
    };
    Object.defineProperty(w.r, 'uploadHeld', { configurable: true, get: () => true });
    w.r.renderMs = 500;
    (w.v as unknown as { upload: { lastDraw: number } }).upload.lastDraw = clock.t;
    (w.v as unknown as { upOnly: boolean }).upOnly = true;
    raf.push((t) => (w.v as unknown as { draw: (x: number) => void }).draw(t));
    const d = w.log.draws;
    frame();
    expect(w.log.draws).toBe(d + 1);
    delete (w.r as unknown as Record<string, unknown>).uploadHeld;
    w.r.uploadSome = up0;
  });
});

describe('0.59.0 훑기를 뒤로 미룬 큰 장면의 첫 걸음', () => {
  it(`그물 ${MERGE_SCAN_FIRST} 초과: 첫 그림 앞 걸음은 ${MERGE_FIRST_MESHES}개까지만 그물마다 올린다(GL 버퍼가 그만큼만 늘고, 몫이 많아도)`, () => {
    freeze();
    const w = make();
    const b0 = w.gl.liveBuffers;
    w.v.setScene(scene(MERGE_SCAN_FIRST + 2), { incremental: { budgetMs: 1000 } });
    w.v.fit(false);
    const d = w.log.draws;
    expect(frame()).toBe(true);
    expect(w.r.meshes.length).toBe(MERGE_FIRST_MESHES);
    expect(w.log.draws).toBe(d + 1);
    expect(w.gl.liveBuffers - b0).toBeLessThanOrEqual(MERGE_FIRST_MESHES * 4);
    // 멈춘 것이 아니라 다음 걸음이 잇는다
    expect(w.r.uploadHeld).toBe(false);
    expect(raf.length).toBe(1);
    run(w);
    w.v.renderNow();
    expect(w.v.stats.merged.meshes).toBe(MERGE_SCAN_FIRST + 2);
    expect(w.r.meshes.length).toBe(MERGE_SCAN_FIRST + 2);
  });

  it(`그물 ${MERGE_SCAN_FIRST}개 이하는 상한이 없다(곧 훑어 첫 걸음부터 빛 기록)`, () => {
    freeze();
    const w = make();
    const b0 = w.gl.liveBuffers;
    w.v.setScene(scene(MERGE_SCAN_FIRST), { incremental: { budgetMs: 1000 } });
    w.v.fit(false);
    frame();
    // 그물마다 버퍼가 아니라 묶음만 — 빛 기록을 곧장 구웠다
    expect(w.r.meshes.length).toBeGreaterThan(MERGE_FIRST_MESHES);
    expect(w.gl.liveBuffers - b0).toBeLessThan(MERGE_FIRST_MESHES);
  });

  it('다 올리라는 걸음(그림 저장 — 몫 Infinity)은 상한을 보지 않는다', () => {
    freeze();
    const w = make();
    w.v.setScene(scene(MERGE_SCAN_FIRST + 1), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    expect(w.r.uploadSome(Number.POSITIVE_INFINITY)).toBe(true);
    expect(w.r.meshes.length).toBe(MERGE_SCAN_FIRST + 1);
  });

  it('끝값은 상한 없이 올린 뷰어(한 번에 올리기)와 같은 묶음·그물 수다', () => {
    freeze();
    const w = make();
    w.v.setScene(scene(MERGE_SCAN_FIRST + 500), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    run(w);
    w.v.renderNow();
    const ref = make();
    ref.v.setScene(scene(MERGE_SCAN_FIRST + 500));
    ref.v.fit(false);
    for (let i = 0; i < 2000 && ref.v.stats.merged.pending > 0; i++) ref.v.renderNow();
    ref.v.renderNow();
    expect([w.v.stats.merged.meshes, w.v.stats.drawCalls > 0]).toEqual([ref.v.stats.merged.meshes, true]);
  });

  it('묶어 그리기를 끈 큰 장면은 상한이 없다(mgScan이 없다 — 첫 걸음이 몫만큼 올린다)', () => {
    freeze();
    const w = make();
    w.v.setRenderOptions({ merging: 'off' as never });
    w.v.setScene(scene(MERGE_SCAN_FIRST + 1), { incremental: { budgetMs: 1000 } });
    w.v.fit(false);
    frame();
    expect(w.r.meshes.length).toBeGreaterThan(MERGE_FIRST_MESHES);
  });
});
