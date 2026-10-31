/**
 * 0.30.0 처음 올릴 때 무늬 다시 그리기 모으기: setScene으로 무늬 여럿을 처음 올리는 동안 첫 무늬는 곧 그리고, 그 뒤로는 TEXTURE_REDRAW_MS와
 * "그 뒤 그린 화면·무늬 올리기·GPU 울타리 기다림 가운데 가장 긴 시간 × TEXTURE_REDRAW_SLOW" 가운데 긴 간격이 지나야 다시 그리는지(미룬 무늬는 그 때 —
 * 다음 무늬를 기다리지 않고), 다 올리면 곧 그리는지, 앞서 그린 화면을 GPU가 끝내지 않았으면(울타리) 기다리는지, 새 장면·문맥 잃음·없애기에서 미룬 것을 버리는지,
 * 되찾는 동안은 0.29.0 차례 그대로인지. 가짜 DOM·가짜 WebGL2·손으로 끝내는 가짜 그림 풀기, 가짜 시계(setTimeout·performance — 횟수가 아니라 시간으로 기다린다).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { TEXTURE_REDRAW_MS, TEXTURE_REDRAW_SLOW, Viewer3d } from '../src/viewer';
import type { Mesh3d, Scene3d, Texture3d } from '../src/types';

interface FakeBitmap {
  width: number;
  height: number;
  closed: boolean;
  close(): void;
}
const fakeBitmap = (width: number, height: number): FakeBitmap => ({
  width,
  height,
  closed: false,
  close() {
    this.closed = true;
  },
});

/** 풀기를 부른 차례대로 쌓아 두고 시험이 하나씩 끝낸다(ok = false면 풀지 못함) */
let decodes: { done: (ok?: boolean) => void }[] = [];
let dom: ReturnType<typeof installDom>;
const g = globalThis as Record<string, unknown>;
let savedCib: unknown;
beforeAll(() => {
  dom = installDom();
  savedCib = g.createImageBitmap;
  g.createImageBitmap = (_src: unknown, o?: ImageBitmapOptions): Promise<FakeBitmap> =>
    new Promise((resolve, reject) => {
      decodes.push({ done: (ok = true) => (ok ? resolve(fakeBitmap(o?.resizeWidth ?? 16, o?.resizeHeight ?? 16)) : reject(new Error('풀지 못함'))) });
    });
});
const views: Viewer3d[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const v of views) v.dispose();
  views.length = 0;
  decodes = [];
});
afterAll(() => {
  g.createImageBitmap = savedCib;
  dom.restore();
});

/** 무늬 n장을 판 n개에 붙인 장면(무늬 id는 앞붙이 + 번호 — 장면마다 다른 무늬) */
function texScene(n: number, tag = 'a'): Scene3d {
  const meshes: Mesh3d[] = [];
  const textures: Texture3d[] = [];
  for (let i = 0; i < n; i++) {
    const x = i * 2;
    meshes.push({
      id: `판 ${tag}${i}`,
      positions: new Float32Array([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
      color: [0.7, 0.7, 0.7, 1],
      texture: `무늬 ${tag}${i}`,
    });
    textures.push({ id: `무늬 ${tag}${i}`, data: new Uint8Array([i + 1, 2, 3, 4]), mime: 'image/png', width: 16, height: 16 });
  }
  return { name: 't', units: 'mm', meshes, lines: [], textures };
}

function view(): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  views.push(v);
  return v;
}
/** 풀기 결과가 올리기까지 이어지게 마이크로태스크를 비운다(가짜 시계가 아닌 setImmediate) */
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));
/** i번째로 부른 풀기를 끝내고 올리기까지 기다린다 */
async function finish(i: number, ok = true): Promise<void> {
  const d = decodes[i];
  if (!d) throw new Error(`풀기 ${i}가 아직 불리지 않았습니다(부른 수 ${decodes.length})`);
  d.done(ok);
  for (let k = 0; k < 4; k++) await flush();
}
const spyInv = (v: Viewer3d) => vi.spyOn(v as unknown as { invalidate(): void }, 'invalidate');
const fakeClock = (): void => void vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });

describe('처음 올릴 때 무늬 다시 그리기 모으기(0.30.0)', () => {
  it('첫 무늬는 곧, 그 뒤는 TEXTURE_REDRAW_MS가 지나야(미룬 무늬는 그 때 — 다음 무늬를 기다리지 않고), 다 올리면 곧 그린다', async () => {
    expect(TEXTURE_REDRAW_MS).toBe(250);
    expect(TEXTURE_REDRAW_SLOW).toBe(4);
    fakeClock();
    const v = view();
    v.setScene(texScene(8));
    const inv = spyInv(v);
    expect(decodes.length).toBe(4);
    await finish(0);
    expect(inv).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    await finish(1);
    vi.advanceTimersByTime(100);
    await finish(2);
    expect(inv).toHaveBeenCalledTimes(1);
    // 첫 무늬로 그린 때부터 250 ms — 미룬 무늬 둘을 함께 그린다
    vi.advanceTimersByTime(49);
    expect(inv).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    expect(inv).toHaveBeenCalledTimes(2);
    await finish(3);
    for (let i = 4; i < 7; i++) await finish(i);
    expect(inv).toHaveBeenCalledTimes(2);
    expect(v.stats.textures.ready).toBe(7);
    // 마지막 무늬는 곧 그리고, 미룬 것은 버린다
    await finish(7);
    expect(inv).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(2000);
    expect(inv).toHaveBeenCalledTimes(3);
    expect(v.stats.textures).toMatchObject({ count: 8, ready: 8 });
  });

  it('무늬 올리기가 오래 걸리면(앞서 그린 화면을 GPU가 끝내기를 기다림) 간격은 그 시간 × TEXTURE_REDRAW_SLOW', async () => {
    fakeClock();
    const v = view();
    v.setScene(texScene(6));
    const inv = spyInv(v);
    await finish(0);
    expect(inv).toHaveBeenCalledTimes(1);
    // 렌더러가 알리는 올리기 시간(1초 — 소프트웨어 GPU의 큰 모형)
    const r = (v as unknown as { renderer: { onTexture: (ms: number) => void } }).renderer;
    vi.advanceTimersByTime(300);
    r.onTexture(1000);
    vi.advanceTimersByTime(3000);
    expect(inv).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(800);
    expect(inv).toHaveBeenCalledTimes(2);
    // 그린 뒤로는 새로 잰다(짧은 올리기면 TEXTURE_REDRAW_MS)
    r.onTexture(5);
    vi.advanceTimersByTime(TEXTURE_REDRAW_MS + 1);
    expect(inv).toHaveBeenCalledTimes(3);
  });

  it('그린 화면이 오래 걸려도(그리기 시간) 간격에 셈한다', async () => {
    fakeClock();
    const v = view();
    v.setScene(texScene(4));
    const inv = spyInv(v);
    await finish(0);
    expect(inv).toHaveBeenCalledTimes(1);
    // 그 화면을 그리는 동안 시계가 600 ms 간다(앞 화면을 GPU가 끝내기를 기다린 그리기)
    const gl = v.canvas.getContext('webgl2') as unknown as Record<string, unknown>;
    const clear = gl.clear as (...a: unknown[]) => void;
    let once = true;
    gl.clear = (...a: unknown[]) => {
      if (once) vi.advanceTimersByTime(600);
      once = false;
      clear.apply(gl, a);
    };
    v.renderNow();
    gl.clear = clear;
    await finish(1);
    vi.advanceTimersByTime(4 * 600 - 700);
    expect(inv).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(inv).toHaveBeenCalledTimes(2);
  });

  it('앞서 그린 화면을 GPU가 끝내지 않았으면(fenceSync 울타리) 첫 무늬도 기다리고, 기다린 시간도 간격에 셈한다', async () => {
    fakeClock();
    const v = view();
    const gl = v.canvas.getContext('webgl2') as unknown as Record<string, unknown> & { SIGNALED: number; UNSIGNALED: number };
    let signaled = false;
    let fences = 0;
    gl.fenceSync = () => ({ n: ++fences });
    gl.getSyncParameter = () => (signaled ? gl.SIGNALED : gl.UNSIGNALED);
    gl.deleteSync = () => undefined;
    v.setScene(texScene(5));
    v.renderNow();
    expect(fences).toBe(1);
    const inv = spyInv(v);
    await finish(0);
    expect(inv).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(inv).not.toHaveBeenCalled();
    signaled = true;
    vi.advanceTimersByTime(50);
    expect(inv).toHaveBeenCalledTimes(1);
    // 첫 무늬로 그린 화면(울타리) — GPU가 1.3초 걸린다
    signaled = false;
    v.renderNow();
    expect(fences).toBe(2);
    await finish(1);
    vi.advanceTimersByTime(1300);
    expect(inv).toHaveBeenCalledTimes(1);
    signaled = true;
    vi.advanceTimersByTime(50);
    // 기다린 시간(약 1.35초) × 4가 지나기 전에는 그리지 않는다
    vi.advanceTimersByTime(3000);
    expect(inv).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2200);
    expect(inv).toHaveBeenCalledTimes(2);
    // 그 뒤(GPU는 끝났다): 간격(250 ms)이 지난 무늬는 곧, 바로 이은 무늬는 미루고, 마지막 무늬는 곧
    await finish(2);
    expect(inv).toHaveBeenCalledTimes(3);
    await finish(3);
    expect(inv).toHaveBeenCalledTimes(3);
    await finish(4);
    expect(inv).toHaveBeenCalledTimes(4);
    expect(v.stats.textures.ready).toBe(5);
  });

  it('새 장면의 첫 무늬는 곧 그리고, 풀지 못한 무늬도 끝난 것으로 센다', async () => {
    fakeClock();
    const v = view();
    v.setScene(texScene(6, 'a'));
    await finish(0);
    vi.advanceTimersByTime(10);
    await finish(1);
    const before = decodes.length;
    // 미룬 다시 그리기가 있는 채로 새 장면
    v.setScene(texScene(3, 'b'));
    const inv = spyInv(v);
    expect(decodes.length).toBe(before + 3);
    await finish(before);
    expect(inv).toHaveBeenCalledTimes(1);
    await finish(before + 1, false);
    expect(inv).toHaveBeenCalledTimes(1);
    await finish(before + 2);
    expect(inv).toHaveBeenCalledTimes(2);
    expect(v.stats.textures).toMatchObject({ count: 3, ready: 2, failed: 1 });
    vi.advanceTimersByTime(5000);
    expect(inv).toHaveBeenCalledTimes(2);
  });

  it('문맥을 잃으면·없애면 미룬 다시 그리기를 버리고, 되찾는 동안은 0.29.0처럼 다 끝났을 때 한 번', async () => {
    fakeClock();
    const v = view();
    v.setScene(texScene(6));
    const inv = spyInv(v);
    await finish(0);
    vi.advanceTimersByTime(10);
    await finish(1);
    expect((v as unknown as { texTimer: unknown }).texTimer).not.toBe(0);
    (v.canvas as unknown as FakeElement).fire('webglcontextlost', {});
    expect((v as unknown as { texTimer: unknown }).texTimer).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(inv).toHaveBeenCalledTimes(1);
    // 되찾으면 장면 바이트를 처음부터 다시 푼다(되찾는 순간 한 번 그린다 — 그 뒤 다 끝날 때까지 없다)
    decodes = [];
    const done = vi.fn();
    v.onContextRestoreDone(done);
    (v.canvas as unknown as FakeElement).fire('webglcontextrestored', {});
    inv.mockClear();
    for (let i = 0; i < 5; i++) {
      await finish(i);
      vi.advanceTimersByTime(400);
    }
    expect(inv).not.toHaveBeenCalled();
    await finish(5);
    expect(inv).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    // 없앤 뒤에는 미룬 것이 없다
    const w = view();
    w.setScene(texScene(4, 'c'));
    const n0 = decodes.length;
    const winv = spyInv(w);
    await finish(n0 - 4);
    vi.advanceTimersByTime(10);
    await finish(n0 - 3);
    expect((w as unknown as { texTimer: unknown }).texTimer).not.toBe(0);
    w.dispose();
    expect((w as unknown as { texTimer: unknown }).texTimer).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(winv).toHaveBeenCalledTimes(1);
  });
});
