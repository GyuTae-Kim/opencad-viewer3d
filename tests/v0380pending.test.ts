/**
 * 0.38.0 장면을 올린 뒤 앱이 주는 무늬(Texture3d.pending ↔ Viewer3d.restoreTexture — SKP 36차 요청):
 * 앱이 원본을 손질한 그림(색 바꾸기·알파 재기)을 장면을 올린 뒤에 만들 수 있게, data·bitmap 없이 pending: true로 둔 무늬는 코어가 풀지 않고 기다린다
 * (그동안 그 무늬를 칠한 그물은 color — 0.25.0 놓은 무늬를 되찾을 때 기다리는 것과 같은 상태). 앱이 restoreTexture로 주면 풀어 올린다.
 * - 기다리는 동안 restoreNeed·stats.textures.missing에 들고, 그 그림은 풀지 않는다(createImageBitmap을 부르지 않는다)
 * - 주면 올리고(받은 ImageBitmap은 닫는다) 다시 그린다. 처음 올릴 때와 같은 긴 변 한도(width·height를 알면 그 크기로 예산을 나눈다)
 * - 코어는 준 원본을 붙잡지 않으므로 문맥을 잃었다 되찾으면 다시 기다린다(onContextRestore need에 든다 — 앱이 다시 준 뒤 끝 알림)
 * - 놓기(release)와 함께: 'bitmap' 놓기의 보통 무늬는 0.25.0 그대로(코어가 바이트를 다시 푼다)
 * - data·bitmap이 있으면 pending은 보지 않는다(0.37.0과 같다). 기다리지 않는 무늬에 restoreTexture는 false(0.25.0 그대로)
 * 가짜 DOM·가짜 WebGL2·가짜 그림 풀기(0.29.0 시험과 같은 꼴).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { fnv } from './fakegl';
import { type ContextRestoreNeed, Viewer3d } from '../src/viewer';
import { syntheticScene } from '../src/synth';
import type { Scene3d, Texture3d } from '../src/types';

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
/** 코어가 그림을 푼 원본(바이트 해시·그림 꼬리표) */
const decoded: string[] = [];
beforeAll(() => {
  dom = installDom();
  savedCib = g.createImageBitmap;
  g.createImageBitmap = async (src: unknown, o?: ImageBitmapOptions): Promise<FakeBitmap> => {
    if (src instanceof Blob) {
      const b = new Uint8Array(await src.arrayBuffer());
      decoded.push(`bytes:${fnv(b)}`);
      return fakeBitmap(`bytes:${fnv(b)}`, o?.resizeWidth ?? 64, o?.resizeHeight ?? 64);
    }
    const s = src as FakeBitmap;
    if (s.closed) throw new Error('닫힌 그림');
    decoded.push(`bmp:${s.tag}`);
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

/** 합성 장면(바둑판은 바이트, 격자는 앱이 나중에 줄 무늬 — pending) */
function makeScene(grid: Partial<Texture3d> = { pending: true, width: 16, height: 16 }): Scene3d {
  const s = syntheticScene({ segments: 400, sphereSeg: 24, textures: true });
  const box = s.meshes.find((m) => m.id === '무늬 상자')!;
  s.textures!.push({ id: '격자', ...grid });
  box.backTexture = '격자';
  return s;
}
function view(): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  views.push(v);
  return v;
}
async function until(cond: () => boolean, ms = 10_000): Promise<void> {
  const end = performance.now() + ms;
  while (!cond()) {
    if (performance.now() > end) throw new Error('기다림 시간을 넘었습니다');
    await new Promise((r) => setTimeout(r, 1));
  }
}
const settle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));
const lose = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextlost', {});
const restore = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextrestored', {});
const texOf = (v: Viewer3d, id: string): { state: string; side: number } => (v as unknown as { renderer: { textures: Map<string, { state: string; side: number }> } }).renderer.textures.get(id)!;

describe('장면을 올린 뒤 앱이 주는 무늬(0.38.0 Texture3d.pending ↔ restoreTexture)', () => {
  it('data·bitmap 없는 pending 무늬는 풀지 않고 기다린다(restoreNeed·stats.missing) — 다른 무늬는 그대로 풀어 올린다', async () => {
    decoded.length = 0;
    const v = view();
    v.setScene(makeScene());
    await until(() => v.stats.textures.ready === 1);
    await settle();
    expect(v.stats.textures).toMatchObject({ count: 2, ready: 1, failed: 0, missing: 1 });
    expect(v.restoreNeed).toEqual({ meshes: [], textures: ['격자'] });
    expect(texOf(v, '격자').state).toBe('missing');
    // 코어가 푼 것은 바둑판 바이트 하나뿐
    expect(decoded.length).toBe(1);
    expect(decoded[0]!.startsWith('bytes:')).toBe(true);
  });

  it('restoreTexture로 주면 풀어 올리고 다시 그린다(받은 그림은 닫는다) — 기다림이 풀린다', async () => {
    const v = view();
    v.setScene(makeScene());
    await until(() => v.stats.textures.ready === 1);
    const inval = vi.spyOn(v as unknown as { invalidate: () => void }, 'invalidate');
    const bmp = fakeBitmap('손질한 격자', 16, 16);
    expect(await v.restoreTexture('격자', bmp as unknown as ImageBitmap)).toBe(true);
    expect(bmp.closed).toBe(true);
    expect(v.stats.textures).toMatchObject({ count: 2, ready: 2, missing: 0 });
    expect(v.restoreNeed).toBeNull();
    // 무늬를 올리면 다시 그린다(다른 무늬를 푸는 중이 아니므로 곧)
    expect(inval).toHaveBeenCalled();
    inval.mockRestore();
    // 같은 장면 객체를 다시 줘도 그대로(다시 기다리지 않는다)
    v.setScene(v.scene!);
    expect(v.stats.textures).toMatchObject({ ready: 2, missing: 0 });
    // 기다리지 않는 무늬에는 false(0.25.0 그대로) — 받은 그림은 닫는다
    const again = fakeBitmap('또', 16, 16);
    expect(await v.restoreTexture('격자', again as unknown as ImageBitmap)).toBe(false);
    expect(await v.restoreTexture('바둑판', again as unknown as ImageBitmap)).toBe(false);
    expect(again.closed).toBe(true);
  });

  it('그림 바이트로 줘도 된다 — 처음 올릴 때와 같은 긴 변 한도(width·height로 예산을 나눈다)', async () => {
    decoded.length = 0;
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded', textureLimit: 8 });
    views.push(v);
    v.setScene(makeScene({ pending: true, width: 64, height: 32 }));
    await until(() => v.stats.textures.ready === 1);
    const side = texOf(v, '격자').side;
    const bytes = makeScene().textures![0]!.data!;
    expect(await v.restoreTexture('격자', { data: bytes })).toBe(true);
    expect(decoded.length).toBe(2);
    expect(v.stats.textures.ready).toBe(2);
    expect(texOf(v, '격자').side).toBe(side);
  });

  it('주지 못한 그림(풀지 못함)이면 false이고 다시 기다린다', async () => {
    const v = view();
    v.setScene(makeScene());
    await until(() => v.stats.textures.ready === 1);
    const dead = fakeBitmap('닫힘', 16, 16);
    dead.close();
    expect(await v.restoreTexture('격자', dead as unknown as ImageBitmap)).toBe(false);
    expect(texOf(v, '격자').state).toBe('missing');
    expect(v.restoreNeed).toEqual({ meshes: [], textures: ['격자'] });
    expect(await v.restoreTexture('격자', fakeBitmap('다시', 16, 16) as unknown as ImageBitmap)).toBe(true);
  });

  it('문맥을 잃었다 되찾으면 다시 기다린다(코어는 준 원본을 붙잡지 않는다) — 앱이 다시 준 뒤 끝 알림', async () => {
    const v = view();
    v.setScene(makeScene());
    await until(() => v.stats.textures.ready === 1);
    expect(await v.restoreTexture('격자', fakeBitmap('손질한 격자', 16, 16) as unknown as ImageBitmap)).toBe(true);
    const needs: ContextRestoreNeed[] = [];
    const done = vi.fn();
    v.onContextRestore((n) => void needs.push(n));
    v.onContextRestoreDone(done);
    lose(v);
    restore(v);
    expect(needs[0]).toEqual({ meshes: [], textures: ['격자'] });
    await until(() => v.stats.textures.ready === 1);
    await settle();
    expect(done).not.toHaveBeenCalled();
    expect(v.restorePending).toBe(true);
    expect(await v.restoreTexture('격자', fakeBitmap('손질한 격자', 16, 16) as unknown as ImageBitmap)).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
    expect(v.restorePending).toBe(false);
  });

  it("놓기(release: { textures: 'bitmap' })와 함께: 보통 무늬는 0.25.0 그대로 놓고 되찾을 때 바이트를 다시 풀며, pending 무늬만 다시 기다린다", async () => {
    const v = view();
    const s = makeScene();
    v.setScene(s, { release: { textures: 'bitmap' } });
    await until(() => v.stats.textures.ready === 1);
    expect(await v.restoreTexture('격자', fakeBitmap('손질한 격자', 16, 16) as unknown as ImageBitmap)).toBe(true);
    const needs: ContextRestoreNeed[] = [];
    v.onContextRestore((n) => void needs.push(n));
    lose(v);
    restore(v);
    expect(needs[0]!.textures).toEqual(['격자']);
    await until(() => v.stats.textures.ready === 1);
    expect(texOf(v, '바둑판').state).toBe('ready');
  });

  it('data나 bitmap이 있으면 pending은 보지 않는다(0.37.0과 같다 — 코어가 그대로 푼다)', async () => {
    decoded.length = 0;
    const v = view();
    v.setScene(makeScene({ pending: true, bitmap: fakeBitmap('원본 격자', 16, 16) as unknown as ImageBitmap, width: 16, height: 16 }));
    await until(() => v.stats.textures.ready === 2);
    expect(v.restoreNeed).toBeNull();
    expect(decoded).toContain('bmp:원본 격자');
  });

  it('pending 없이 data·bitmap도 없는 무늬는 0.37.0처럼 풀지 못한 무늬다(기다리지 않는다)', async () => {
    const v = view();
    v.setScene(makeScene({ width: 16, height: 16 }));
    await until(() => v.stats.textures.ready === 1 && v.stats.textures.failed === 1);
    expect(v.restoreNeed).toBeNull();
    expect(await v.restoreTexture('격자', fakeBitmap('늦음', 16, 16) as unknown as ImageBitmap)).toBe(false);
  });
});
