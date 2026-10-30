/**
 * 0.29.0 되찾은 뒤 다시 올리기 끝 알림(Viewer3d.onContextRestoreDone·restorePending): 문맥을 잃었다 되찾은 뒤 코어가 장면을 다시 올리고(나눠 올리기 포함),
 * 장면의 그림 바이트를 다시 풀어 올리고, 앱이 restoreMeshArrays·restoreTexture로 다 줬을 때 한 번 오는지 — 놓지 않은 장면·놓은 장면('bitmap'·true)·나눠 올리기,
 * 알림 차례(잃음 → 되찾음 → 끝), 끝나기 전에 다시 잃으면, 해제·없앤 뒤. 가짜 DOM·가짜 WebGL2·가짜 그림 풀기(0.25.0 시험과 같은 꼴).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { fnv } from './fakegl';
import { type ContextRestoreNeed, Viewer3d } from '../src/viewer';
import { syntheticScene } from '../src/synth';
import type { Mesh3d, Scene3d, Texture3d } from '../src/types';

interface FakeBitmap {
  width: number;
  height: number;
  tag: string;
  closed: boolean;
  close(): void;
}
const fakeBitmap = (tag: string, width: number, height: number): FakeBitmap => ({
  width,
  height,
  tag,
  closed: false,
  close() {
    this.closed = true;
  },
});

let dom: ReturnType<typeof installDom>;
const g = globalThis as Record<string, unknown>;
let savedCib: unknown;
beforeAll(() => {
  dom = installDom();
  savedCib = g.createImageBitmap;
  g.createImageBitmap = async (src: unknown, o?: ImageBitmapOptions): Promise<FakeBitmap> => {
    if (src instanceof Blob) {
      const b = new Uint8Array(await src.arrayBuffer());
      return fakeBitmap(`bytes:${fnv(b)}`, o?.resizeWidth ?? 64, o?.resizeHeight ?? 64);
    }
    const s = src as FakeBitmap;
    if (s.closed) throw new Error('닫힌 그림');
    return fakeBitmap(`bmp:${s.tag}`, o?.resizeWidth ?? s.width, o?.resizeHeight ?? s.height);
  };
});
const views: Viewer3d[] = [];
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  g.createImageBitmap = savedCib;
  dom.restore();
});

/** 합성 장면(무늬 둘 — 바둑판은 바이트, 격자는 푼 그림으로 바이트와 함께) */
function makeScene(textures = true): Scene3d {
  const s = syntheticScene({ segments: 400, sphereSeg: 24, textures });
  if (textures) {
    const box = s.meshes.find((m) => m.id === '무늬 상자')!;
    const grid: Texture3d = { id: '격자', data: s.textures![0]!.data, bitmap: fakeBitmap('격자', 16, 16) as unknown as ImageBitmap, width: 16, height: 16 };
    s.textures!.push(grid);
    box.backTexture = '격자';
  }
  return s;
}
function view(): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  views.push(v);
  return v;
}
/** 조건이 맞을 때까지 시간으로 기다린다(횟수가 아니라 — 부하가 높아도 흔들리지 않게) */
async function until(cond: () => boolean, ms = 10_000): Promise<void> {
  const end = performance.now() + ms;
  while (!cond()) {
    if (performance.now() > end) throw new Error('기다림 시간을 넘었습니다');
    await new Promise((r) => setTimeout(r, 1));
  }
}
const ready = (v: Viewer3d): boolean => v.stats.textures.ready === v.stats.textures.count && v.stats.textures.count > 0;
const lose = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextlost', {});
const restore = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextrestored', {});
const uploading = (v: Viewer3d): boolean => (v as unknown as { renderer: { uploading: boolean } }).renderer.uploading;
/** 나눠 올리기를 다 마칠 때까지 그린다 */
const drain = (v: Viewer3d): Promise<void> =>
  until(() => {
    v.renderNow();
    return !uploading(v);
  });
/** 잠깐 기다린다(시간으로 — 가짜 그림 풀기가 끝날 만큼) */
const settle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('되찾은 뒤 다시 올리기 끝 알림(0.29.0 onContextRestoreDone·restorePending)', () => {
  it('무늬 없는 장면·놓지 않음: 되찾음 알림들 바로 뒤에 같은 차례로 한 번(잃음 → 되찾음 → 끝), restorePending은 잃는 순간부터 끝까지', () => {
    const v = view();
    v.setScene(makeScene(false));
    expect(v.restorePending).toBe(false);
    const order: string[] = [];
    v.onContextLost(() => order.push('lost'));
    v.onContextRestore(() => void order.push(`restore:${v.restorePending}`));
    v.onContextRestore(() => void order.push('restore2'));
    v.onContextRestoreDone(() => order.push(`done:${v.restorePending}`));
    lose(v);
    expect(v.restorePending).toBe(true);
    restore(v);
    expect(order).toEqual(['lost', 'restore:true', 'restore2', 'done:false']);
    expect(v.restorePending).toBe(false);
    // 다음 잃음·되찾음에도 또 한 번
    lose(v);
    restore(v);
    expect(order.filter((x) => x.startsWith('done')).length).toBe(2);
  });

  it('놓지 않은 무늬 장면: 코어가 장면의 그림 바이트를 다시 풀어 올린 뒤에 온다', async () => {
    const v = view();
    v.setScene(makeScene());
    await until(() => ready(v));
    const done = vi.fn();
    v.onContextRestoreDone(done);
    lose(v);
    restore(v);
    expect(v.stats.textures.ready).toBeLessThan(v.stats.textures.count);
    expect(done).not.toHaveBeenCalled();
    expect(v.restorePending).toBe(true);
    await until(() => done.mock.calls.length > 0);
    expect(ready(v)).toBe(true);
    expect(v.restorePending).toBe(false);
    await settle();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("놓은 장면(release: true): 앱이 그물 배열·무늬 원본을 다 주고 그 무늬를 다 풀어 올린 뒤에 온다", async () => {
    const s = makeScene();
    const keep = makeScene();
    const v = view();
    v.setScene(s, { release: true });
    await until(() => ready(v));
    const needs: ContextRestoreNeed[] = [];
    const done = vi.fn();
    v.onContextRestore((n) => void needs.push(n));
    v.onContextRestoreDone(done);
    lose(v);
    restore(v);
    const need = needs[0]!;
    expect(need.meshes.length).toBeGreaterThan(0);
    expect(need.textures.length).toBe(2);
    const of = (id: string): Mesh3d => keep.meshes.find((m) => m.id === id)!;
    for (const m of need.meshes) expect(v.restoreMeshArrays(m.id, { normals: of(m.id).normals, uvs: of(m.id).uvs, backUvs: of(m.id).backUvs })).toBe(true);
    await settle();
    expect(done).not.toHaveBeenCalled();
    expect(v.restoreNeed).toEqual({ meshes: [], textures: need.textures });
    expect(await v.restoreTexture('바둑판', keep.textures![0]!.data!)).toBe(true);
    expect(done).not.toHaveBeenCalled();
    expect(v.restorePending).toBe(true);
    // 마지막 무늬를 올리는 순간(restoreTexture가 풀리기 전) 끝 알림
    const p = v.restoreTexture('격자', fakeBitmap('격자', 16, 16) as unknown as ImageBitmap);
    expect(done).not.toHaveBeenCalled();
    expect(await p).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
    expect(v.restoreNeed).toBeNull();
    expect(v.restorePending).toBe(false);
  });

  it("release: { textures: 'bitmap' } + 나눠 올리기: 코어가 다시 나눠 올리고 바이트를 다시 풀고, 앱이 그물 배열을 다 준 뒤", async () => {
    const s = makeScene();
    const keep = makeScene();
    const v = view();
    v.setScene(s, { release: { normals: true, textures: 'bitmap' }, incremental: { budgetMs: 0 } });
    await drain(v);
    await until(() => ready(v));
    const done = vi.fn();
    const of = (id: string): Mesh3d => keep.meshes.find((m) => m.id === id)!;
    v.onContextRestore((need) => {
      expect(need.textures).toEqual([]);
      for (const m of need.meshes) expect(v.restoreMeshArrays(m.id, { normals: of(m.id).normals })).toBe(true);
    });
    v.onContextRestoreDone(done);
    lose(v);
    restore(v);
    expect(uploading(v)).toBe(true);
    expect(done).not.toHaveBeenCalled();
    await drain(v);
    await until(() => done.mock.calls.length > 0);
    expect(ready(v)).toBe(true);
    expect(v.restoreNeed).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('앱이 주지 않은 것이 남으면 오지 않는다. 끝나기 전에 다시 잃으면 그 되찾기의 알림은 없고 다음 되찾기가 끝날 때 한 번', async () => {
    const s = makeScene(false);
    const keep = makeScene(false);
    const v = view();
    v.setScene(s, { release: { normals: true } });
    const done = vi.fn();
    v.onContextRestoreDone(done);
    lose(v);
    restore(v);
    await settle();
    expect(done).not.toHaveBeenCalled();
    expect(v.restorePending).toBe(true);
    lose(v);
    expect(v.restorePending).toBe(true);
    restore(v);
    const need = v.restoreNeed!;
    for (const m of need.meshes) v.restoreMeshArrays(m.id, { normals: keep.meshes.find((x) => x.id === m.id)!.normals });
    expect(done).toHaveBeenCalledTimes(1);
    expect(v.restorePending).toBe(false);
  });

  it('되찾은 뒤 새 장면을 주면 그 장면을 다 올렸을 때 온다. 해제한 알림·없앤 뒤는 부르지 않는다', async () => {
    const v = view();
    v.setScene(makeScene(false), { release: { normals: true } });
    const done = vi.fn(), off = vi.fn();
    v.onContextRestoreDone(done);
    const un = v.onContextRestoreDone(off);
    un();
    lose(v);
    restore(v);
    expect(done).not.toHaveBeenCalled();
    v.setScene(makeScene(false));
    expect(done).toHaveBeenCalledTimes(1);
    expect(off).not.toHaveBeenCalled();
    const w = view();
    w.setScene(makeScene(false));
    const d2 = vi.fn();
    w.onContextRestoreDone(d2);
    w.dispose();
    expect(w.restorePending).toBe(false);
    expect(d2).not.toHaveBeenCalled();
  });
});
