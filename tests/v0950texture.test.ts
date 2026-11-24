/**
 * 0.95.0 장면을 올린 뒤 앱이 손질한 무늬를 주는 공개 API(Viewer3d.setTexture — SKP 요청: 첫 그림 앞의 워커 무늬 손질을 첫 그림 뒤로).
 * restoreTexture와 같은 꼴·같은 열쇠(무늬 id)에 alpha를 더했고, 문맥 복구가 아닐 때도 그 무늬의 상태와 상관없이 받는다.
 * - 기다리는 무늬(pending)는 restoreTexture처럼 풀어 올린다. 이미 올린 무늬·코어가 장면 그림을 푸는 중인 무늬는 이 그림으로 바꾼다(바꾸는 동안은 앞 그림)
 * - alpha를 주면 그 무늬를 칠한 그물(앞·뒷면)의 반투명 차례·그림자 깊이 그림을 장면 alpha와 같은 규칙으로 다시 정한다 — 장면에서 그 alpha로 두고 restoreTexture로 준
 *   뷰어와 펼친 도형이 같다. 정한 alpha는 그 무늬 객체를 쓰는 동안 남는다(setMesh·같은 객체로 다시 setScene·문맥 복구)
 * - 받지 않는 것(82~94차 규칙 — 돌려주는 값 false): 장면이 쓰지 않는 id·꼴이 틀린 id·그림이 없는 값, 없앤 뒤·문맥을 잃은 동안, 더 나중 부름이 앞선 앞 부름, 풀지 못한 그림
 *   (앞 그림이 있으면 그대로, 없으면 기다림). 받은 ImageBitmap은 받지 않을 때도 닫는다. 선택 필드(mime·width·height·alpha)가 꼴이 틀리면 주지 않은 것
 * - 코어는 준 그림을 붙잡지 않으므로 문맥을 되찾으면 그 무늬는 다시 기다린다(need.textures — 장면에 그림 바이트가 있어도)
 * 가짜 DOM·가짜 WebGL2·가짜 그림 풀기(0.38.0 시험과 같은 꼴). 0.94.0에는 setTexture가 없다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type FakeGL, fnv } from './fakegl';
import { expandFrame } from './drawexpand';
import { type ContextRestoreNeed, Viewer3d } from '../src/viewer';
import { boxMesh, checkerBmp, texturedBoxMesh } from '../src/synth';
import type { Scene3d, Texture3d } from '../src/types';

interface FakeBitmap {
  width: number;
  height: number;
  tag: string;
  closed: boolean;
  close(): void;
}
const fakeBitmap = (tag: string, width = 16, height = 16): FakeBitmap => ({
  width,
  height,
  tag,
  closed: false,
  close() {
    this.closed = true;
  },
});
const asBmp = (b: FakeBitmap): ImageBitmap => b as unknown as ImageBitmap;

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

const BYTES_T = checkerBmp(4, 4);
const BYTES_U = checkerBmp(2, 8);
const TAG_T = `bytes:${fnv(BYTES_T)}`;

/**
 * 바닥(불투명 상자 — 그림자를 받는다), 무늬 T 상자, 앞면 U·뒷면 T 상자. T는 pending(기본) 또는 그림 바이트, alpha는 주면 그 값.
 * 쓰지 않는 무늬 V도 장면에 둔다
 */
function makeScene(o: { alpha?: boolean; data?: boolean } = {}): Scene3d {
  const ground = boxMesh('바닥', [-60, -60, -4], [60, 60, 0], [0.7, 0.7, 0.7, 1]);
  const box = texturedBoxMesh('무늬 상자', [-20, -20, 0], [20, 20, 30], [0.6, 0.6, 0.65, 1], 'T', 10);
  const two = texturedBoxMesh('뒷면 상자', [30, -10, 0], [50, 10, 20], [0.5, 0.55, 0.6, 1], 'U', 10);
  two.backTexture = 'T';
  const T: Texture3d = { id: 'T', width: 16, height: 16, ...(o.data ? { data: BYTES_T } : { pending: true }), ...(o.alpha !== undefined ? { alpha: o.alpha } : {}) };
  return { name: 't', units: 'mm', meshes: [ground, box, two], lines: [], textures: [T, { id: 'U', data: BYTES_U, width: 16, height: 16 }, { id: 'V', data: BYTES_U }] };
}
function view(): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 400, height: 300 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false, renderMode: 'shaded' });
  views.push(v);
  return v;
}
async function until(cond: () => boolean, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('기다림 시간을 넘었습니다');
    await new Promise((r) => setTimeout(r, 1));
  }
}
const settle = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));
const glOf = (v: Viewer3d): FakeGL => (v.canvas as unknown as FakeElement).gl!;
const lose = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextlost', {});
const restore = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextrestored', {});
interface TexRecLike {
  state: string;
  side: number;
  tex: { src: string; deleted: boolean } | null;
}
interface RendererLike {
  textures: Map<string, TexRecLike>;
  meshes: { src: { id: string }; transparent: boolean; texAlpha: boolean; back: { texAlpha: boolean } | null }[];
  decoding: number;
  texturesBusy: boolean;
}
const rd = (v: Viewer3d): RendererLike => (v as unknown as { renderer: RendererLike }).renderer;
const texOf = (v: Viewer3d, id: string): TexRecLike => rd(v).textures.get(id)!;
const recOf = (v: Viewer3d, id: string) => rd(v).meshes.find((r) => r.src.id === id)!;
/** 장면 무늬 U(그림 바이트)를 다 올릴 때까지 */
const readyU = (v: Viewer3d): Promise<void> => until(() => texOf(v, 'U')?.state === 'ready' && !rd(v).texturesBusy);
/** 그리기 하나의 펼친 도형 */
const frame = (v: Viewer3d): string[] => expandFrame(glOf(v), () => v.renderNow());
/** 그리기 하나의 그리기 기록(묶은 무늬 꼬리표 포함) */
function draws(v: Viewer3d): { prog: string; uniforms: string; tex?: string }[] {
  const gl = glOf(v);
  gl.draws = [];
  gl.logDraws = true;
  gl.logTextures = true;
  v.renderNow();
  gl.logDraws = false;
  gl.logTextures = false;
  return gl.draws;
}
const lit = (v: Viewer3d): void => v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true });

describe('장면을 올린 뒤 앱이 손질한 무늬를 주기(0.95.0 setTexture)', () => {
  it('공개 API가 있다(0.94.0에는 없다)', () => {
    expect(typeof (Viewer3d.prototype as unknown as { setTexture?: unknown }).setTexture).toBe('function');
  });

  it('기다리는 무늬(pending)는 restoreTexture처럼 풀어 올리고 다시 그린다 — 받은 그림은 닫고, 그 뒤 restoreTexture는 false(기다리지 않음)', async () => {
    decoded.length = 0;
    const v = view();
    v.setScene(makeScene());
    await readyU(v);
    expect(v.restoreNeed).toEqual({ meshes: [], textures: ['T'] });
    const inval = vi.spyOn(v as unknown as { invalidate: () => void }, 'invalidate');
    const b = fakeBitmap('손질 T');
    expect(await v.setTexture('T', asBmp(b))).toBe(true);
    expect(b.closed).toBe(true);
    expect(inval).toHaveBeenCalled();
    inval.mockRestore();
    expect(v.stats.textures).toMatchObject({ count: 2, ready: 2, failed: 0, missing: 0 });
    expect(v.restoreNeed).toBeNull();
    expect(texOf(v, 'T').tex!.src).toBe('bmp:손질 T');
    expect(draws(v).some((d) => d.tex?.includes('bmp:손질 T'))).toBe(true);
    expect(decoded).toEqual([`bytes:${fnv(BYTES_U)}`, 'bmp:손질 T']);
    const again = fakeBitmap('또');
    expect(await v.restoreTexture('T', asBmp(again))).toBe(false);
    expect(again.closed).toBe(true);
  });

  it('이미 올린 무늬를 바꾼다 — 바꾸는 동안은 앞 그림을 그리고, 다 풀면 새 그림(앞 GL 무늬는 지운다). 그림 바이트로 줘도 된다', async () => {
    const v = view();
    v.setScene(makeScene({ data: true }));
    await until(() => texOf(v, 'T')?.state === 'ready' && texOf(v, 'U')?.state === 'ready');
    const first = texOf(v, 'T').tex!;
    expect(first.src).toBe(TAG_T);
    const p = v.setTexture('T', asBmp(fakeBitmap('손질 T')));
    // 아직 풀기 전: 앞 그림 그대로(상태 ready)
    expect(texOf(v, 'T').state).toBe('ready');
    expect(draws(v).some((d) => d.tex?.includes(TAG_T))).toBe(true);
    expect(await p).toBe(true);
    expect(texOf(v, 'T').tex!.src).toBe('bmp:손질 T');
    expect(first.deleted).toBe(true);
    expect(draws(v).some((d) => d.tex?.includes(TAG_T))).toBe(false);
    expect(v.stats.textures).toMatchObject({ count: 2, ready: 2, failed: 0, missing: 0 });
    // 그림 바이트로(처음 올릴 때와 같은 긴 변 한도)
    const side = texOf(v, 'T').side;
    expect(await v.setTexture('T', { data: BYTES_U })).toBe(true);
    expect(texOf(v, 'T').tex!.src).toBe(`bytes:${fnv(BYTES_U)}`);
    expect(texOf(v, 'T').side).toBe(side);
  });

  it('코어가 장면 그림을 푸는 중(decoding)이면 앱 그림이 앞선다 — 늦게 끝난 장면 그림은 버리고 푸는 수도 돌아온다', async () => {
    decoded.length = 0;
    const v = view();
    v.setScene(makeScene({ data: true }));
    expect(texOf(v, 'T').state).toBe('decoding');
    expect(await v.setTexture('T', asBmp(fakeBitmap('앱 T')))).toBe(true);
    await until(() => !rd(v).texturesBusy && rd(v).decoding === 0);
    await settle();
    expect(texOf(v, 'T').tex!.src).toBe('bmp:앱 T');
    expect(texOf(v, 'T').state).toBe('ready');
    expect(v.stats.textures).toMatchObject({ count: 2, ready: 2, failed: 0, missing: 0 });
    expect(rd(v).decoding).toBe(0);
  });

  it('alpha를 주면 그 무늬를 칠한 그물(앞·뒷면)의 반투명 차례·그림자를 장면 alpha와 같은 규칙으로 다시 정한다 — 장면 alpha로 두고 restoreTexture로 준 뷰어와 같은 그림', async () => {
    // 기준: 장면에서 alpha: true로 둔 pending 무늬에 restoreTexture(같은 그림)
    const a = view();
    a.setScene(makeScene({ alpha: true }));
    lit(a);
    await readyU(a);
    frame(a);
    expect(await a.restoreTexture('T', asBmp(fakeBitmap('손질 T')))).toBe(true);
    // 그림자 판을 바꿔 다음 그리기가 그림자 깊이 그림을 다시 그리게 한다
    lit(a);
    const A = frame(a);
    // 새 길: alpha 없이(불투명) 둔 pending 무늬 — 첫 그림은 그 그물이 그림자를 드리우고 불투명 차례
    const b = view();
    b.setScene(makeScene());
    lit(b);
    await readyU(b);
    const B0 = frame(b);
    expect(recOf(b, '무늬 상자').transparent).toBe(false);
    expect(recOf(b, '뒷면 상자').transparent).toBe(false);
    expect(await b.setTexture('T', { bitmap: asBmp(fakeBitmap('손질 T')), alpha: true })).toBe(true);
    expect(recOf(b, '무늬 상자')).toMatchObject({ transparent: true, texAlpha: true });
    expect(recOf(b, '뒷면 상자')).toMatchObject({ transparent: true, texAlpha: false, back: { texAlpha: true } });
    expect(recOf(b, '바닥').transparent).toBe(false);
    // 판을 바꾸지 않은 다음 그리기 — 그림자 깊이 그림도 다시 그린다(기준 그림에 틀 버퍼 그리기가 있다 — 드리우는 그물은 바닥뿐)
    const B = frame(b);
    const shadowDraws = (s: string[]): number => s.filter((x) => x.includes('|fb|')).length;
    expect(shadowDraws(A)).toBeGreaterThan(0);
    expect(shadowDraws(B0)).toBeGreaterThan(shadowDraws(A));
    expect(B).toEqual(A);
    expect(B).not.toEqual(B0);
    const d = draws(b);
    expect(d.some((x) => x.tex?.includes('bmp:손질 T') && x.uniforms.includes('["u_texAlpha",[1]]'))).toBe(true);
    // 장면 객체는 고치지 않는다
    expect(b.scene!.textures!.find((t) => t.id === 'T')!.alpha).toBeUndefined();
  });

  it('alpha: false는 장면 alpha: true 무늬를 불투명 차례로 — 장면 alpha: false로 둔 뷰어와 같은 그림. alpha를 주지 않으면 앞서 정한 값 그대로', async () => {
    const a = view();
    a.setScene(makeScene({ alpha: false, data: true }));
    lit(a);
    await until(() => texOf(a, 'T')?.state === 'ready' && texOf(a, 'U')?.state === 'ready' && !rd(a).texturesBusy);
    expect(await a.setTexture('T', asBmp(fakeBitmap('손질 T')))).toBe(true);
    frame(a);
    lit(a);
    const A = frame(a);
    const b = view();
    b.setScene(makeScene({ alpha: true, data: true }));
    lit(b);
    await until(() => texOf(b, 'T')?.state === 'ready' && texOf(b, 'U')?.state === 'ready' && !rd(b).texturesBusy);
    const B0 = frame(b);
    expect(recOf(b, '무늬 상자').transparent).toBe(true);
    expect(await b.setTexture('T', { bitmap: asBmp(fakeBitmap('손질 T')), alpha: false })).toBe(true);
    expect(recOf(b, '무늬 상자').transparent).toBe(false);
    expect(recOf(b, '뒷면 상자').transparent).toBe(false);
    const B = frame(b);
    expect(B).toEqual(A);
    expect(B).not.toEqual(B0);
    // alpha 없이 다시 주면 앞서 정한 false 그대로
    expect(await b.setTexture('T', asBmp(fakeBitmap('다시 T')))).toBe(true);
    expect(recOf(b, '무늬 상자').transparent).toBe(false);
  });

  it('정한 alpha는 그 무늬 객체를 쓰는 동안 남는다 — setMesh로 더한 그물·같은 객체로 다시 setScene·문맥 복구(되찾으면 그 무늬는 다시 기다린다)', async () => {
    const v = view();
    v.setScene(makeScene({ data: true }));
    await until(() => texOf(v, 'T')?.state === 'ready' && !rd(v).texturesBusy);
    expect(await v.setTexture('T', { bitmap: asBmp(fakeBitmap('손질 T')), alpha: true })).toBe(true);
    expect(v.setMesh(texturedBoxMesh('새 상자', [-50, 30, 0], [-40, 40, 10], [0.4, 0.5, 0.6, 1], 'T', 10))).toBe(true);
    expect(recOf(v, '새 상자').transparent).toBe(true);
    v.setScene(v.scene!, { keepView: true });
    expect(recOf(v, '무늬 상자').transparent).toBe(true);
    expect(texOf(v, 'T').tex!.src).toBe('bmp:손질 T');
    const needs: ContextRestoreNeed[] = [];
    const done = vi.fn();
    v.onContextRestore((n) => void needs.push(n));
    v.onContextRestoreDone(done);
    decoded.length = 0;
    lose(v);
    restore(v);
    // 장면에 그림 바이트가 있어도 앱이 준 무늬는 다시 기다린다(코어는 장면 그림을 풀지 않는다)
    expect(needs[0]).toEqual({ meshes: [], textures: ['T'] });
    expect(recOf(v, '무늬 상자').transparent).toBe(true);
    await until(() => texOf(v, 'U')?.state === 'ready');
    await settle();
    expect(decoded).toEqual([`bytes:${fnv(BYTES_U)}`]);
    expect(done).not.toHaveBeenCalled();
    expect(await v.setTexture('T', asBmp(fakeBitmap('손질 T')))).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
    expect(recOf(v, '무늬 상자').transparent).toBe(true);
    // 새 무늬 객체로 다시 setScene하면 그 객체의 alpha(없음 — 불투명)
    v.setScene(makeScene({ data: true }));
    expect(recOf(v, '무늬 상자').transparent).toBe(false);
  });

  it('더 나중 부름이 앞선다 — 앞 부름은 false. 풀지 못한 그림은 false(앞 그림이 있으면 그대로, 없으면 기다림)', async () => {
    const v = view();
    v.setScene(makeScene());
    await readyU(v);
    const one = fakeBitmap('하나'), two = fakeBitmap('둘');
    const p1 = v.setTexture('T', asBmp(one));
    const p2 = v.setTexture('T', asBmp(two));
    expect(await p1).toBe(false);
    expect(await p2).toBe(true);
    expect(one.closed && two.closed).toBe(true);
    expect(texOf(v, 'T').tex!.src).toBe('bmp:둘');
    // 올린 무늬에 풀지 못하는 그림: 앞 그림 그대로
    const dead = fakeBitmap('닫힘');
    dead.close();
    expect(await v.setTexture('T', { bitmap: asBmp(dead), alpha: true })).toBe(false);
    expect(texOf(v, 'T').state).toBe('ready');
    expect(texOf(v, 'T').tex!.src).toBe('bmp:둘');
    expect(recOf(v, '무늬 상자').transparent).toBe(false);
    // 기다리는 무늬에 풀지 못하는 그림: 다시 기다린다
    const w = view();
    w.setScene(makeScene());
    await readyU(w);
    expect(await w.setTexture('T', asBmp(dead))).toBe(false);
    expect(texOf(w, 'T').state).toBe('missing');
    expect(w.restoreNeed).toEqual({ meshes: [], textures: ['T'] });
    expect(await w.setTexture('T', asBmp(fakeBitmap('다시')))).toBe(true);
  });

  it('받지 않는 것: 장면이 쓰지 않는 id·꼴이 틀린 id·그림이 없는 값은 false(상태 그대로, 받은 그림은 닫는다). 선택 필드가 꼴이 틀리면 주지 않은 것', async () => {
    const v = view();
    v.setScene(makeScene());
    await readyU(v);
    const bad: [unknown, unknown][] = [
      ['Z', fakeBitmap('없는 id')],
      ['V', fakeBitmap('쓰지 않는 무늬')],
      [5, fakeBitmap('수 id')],
      [null, fakeBitmap('null id')],
      [undefined, fakeBitmap('undefined id')],
      ['T', null],
      ['T', undefined],
      ['T', 'abc'],
      ['T', 5],
      ['T', {}],
      ['T', []],
      ['T', new Uint8Array(0)],
      ['T', { data: 'abc' }],
      ['T', { data: new Uint8Array(0) }],
      ['T', { data: [1, 2, 3] }],
      ['T', { bitmap: {} }],
      ['T', { bitmap: 'abc', alpha: true }],
    ];
    const loose = v as unknown as { setTexture(i: unknown, s: unknown): Promise<boolean> };
    for (const [id, src] of bad) {
      expect(await loose.setTexture(id, src)).toBe(false);
      if (src && typeof src === 'object' && 'closed' in src) expect((src as FakeBitmap).closed).toBe(true);
    }
    expect(v.restoreNeed).toEqual({ meshes: [], textures: ['T'] });
    expect(texOf(v, 'T').state).toBe('missing');
    expect(recOf(v, '무늬 상자').transparent).toBe(false);
    expect(v.stats.textures).toMatchObject({ count: 2, ready: 1, failed: 0, missing: 1 });
    // 꼴이 틀린 선택 필드는 주지 않은 것(alpha 'yes'는 알파를 바꾸지 않는다)
    const ok = fakeBitmap('선택 필드');
    expect(await v.setTexture('T', { bitmap: asBmp(ok), alpha: 'yes', width: NaN, height: -1, mime: 5 } as never)).toBe(true);
    expect(ok.closed).toBe(true);
    expect(texOf(v, 'T').tex!.src).toBe('bmp:선택 필드');
    expect(recOf(v, '무늬 상자').transparent).toBe(false);
  });

  it('없앤 뒤·문맥을 잃은 동안은 false(받은 그림은 닫는다). 잃기 전에 준 것은 늦게 끝나도 버리고, 되찾으면 다시 준다', async () => {
    const v = view();
    v.setScene(makeScene());
    await readyU(v);
    const p = v.setTexture('T', asBmp(fakeBitmap('잃기 전')));
    lose(v);
    expect(await p).toBe(false);
    const during = fakeBitmap('잃은 동안');
    expect(await v.setTexture('T', asBmp(during))).toBe(false);
    expect(during.closed).toBe(true);
    restore(v);
    await readyU(v);
    expect(texOf(v, 'T').state).toBe('missing');
    expect(await v.setTexture('T', asBmp(fakeBitmap('되찾은 뒤')))).toBe(true);
    expect(texOf(v, 'T').tex!.src).toBe('bmp:되찾은 뒤');
    v.dispose();
    const after = fakeBitmap('없앤 뒤');
    expect(await v.setTexture('T', asBmp(after))).toBe(false);
    expect(after.closed).toBe(true);
  });
});
