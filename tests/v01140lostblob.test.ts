/**
 * 0.114.0 문맥을 잃은 동안 선택 없는 toBlob()(116차 — 0.89.0 남은 한계 「toBlob()(선택 없이)은 문맥을 잃은 동안에는 그대로 캔버스(브라우저에서는 빈 그림)와
 * 덧그림을 풀어 준다」): 선택을 준 toBlob({ … })·renderImage는 문맥을 잃은 동안 「3D 보기 문맥이 없어 그림을 만들 수 없습니다」 Error로 거절했지만(0.89.0 — dispose 뒤는
 * 선택이 없어도), 선택 없는 toBlob()·toBlob(형, 품질)·toBlob(null)은 그리지 못한 화면 캔버스(빈 그림)에 덧그림을 붙여 풀어 주었다 — 앱의 PNG 저장이 빈 그림을 「저장했습니다」로 내려받았다.
 * 0.114.0: webglcontextlost부터 webglcontextrestored까지는 선택이 없어도 같은 Error로 거절한다(2D 캔버스를 만들지 않는다).
 *  - 잃음 알림(onContextLost) 콜백 안에서 불러도 거절(잃음 깃발을 알리기 전에 세운다)
 *  - 되찾은 뒤에는 첫 그림 전이어도 정상 길(다시 올린 장면을 그려 푼다 — 선택 없는 것·선택을 준 것 모두), 다시 잃으면 다시 거절
 *  - dispose 뒤는 0.89.0 그대로 거절(잃은 동안 dispose해도, 그 뒤 되찾음 사건이 와도)
 *  - 문맥을 잃지 않은 길은 0.113.0 그대로(아래 「그대로」 시험 — 0.113.0 src로도 통과)
 * 장면: 상자 하나(0.89.0 시험과 같은 꼴)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeElement, installDom } from './fakedom';
import type { DrawEntry } from './fakegl';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

const MSG = '3D 보기 문맥이 없어 그림을 만들 수 없습니다';
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
/** 가짜 캔버스 toBlob이 받은 형·품질·크기 */
const blobCalls: { type: unknown; quality: unknown; width: number; height: number }[] = [];
type Blobby = { toBlob?: (this: FakeElement, cb: (b: unknown) => void, type?: string, quality?: number) => void };
beforeAll(() => {
  dom = installDom();
  // 가짜 캔버스의 그림 파일(0.13.0·0.89.0 시험과 같은 꼴 — 빈 객체로 푼다)
  (FakeElement.prototype as unknown as Blobby).toBlob = function (cb, type, quality) {
    blobCalls.push({ type, quality, width: this.width, height: this.height });
    cb({});
  };
  // 화면 밖 그리기(renderPixels)가 만드는 ImageData — Node에는 없다(0.33.0 시험과 같은 꼴)
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray;
      constructor(
        readonly width: number,
        readonly height: number,
      ) {
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const v of views) v.dispose();
  views.length = 0;
  blobCalls.length = 0;
});
afterAll(() => {
  delete (FakeElement.prototype as unknown as Blobby).toBlob;
  vi.unstubAllGlobals();
  dom.restore();
});

const box = (): Scene3d => ({ name: 's', units: 'mm', meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1])], lines: [] });
function view(): { v: Viewer3d; canvas: FakeElement } {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(box());
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement };
}
const lose = (c: FakeElement): void => c.fire('webglcontextlost', {});
const restore = (c: FakeElement): void => c.fire('webglcontextrestored', {});
/** 약속을 곧 받아 'ok' 또는 거절 글로(처리하지 않은 거절이 남지 않게 만들자마자 단다) */
const settle = (p: Promise<unknown>): Promise<string> => p.then(
  () => 'ok',
  (e: unknown) => (e instanceof Error ? e.message : `던진 값 ${String(e)}`),
);
/** 선택 없는 꼴 넷(문자열 형·형과 품질·null — 0.93.0 null은 주지 않은 것) */
const plain = (v: Viewer3d): Promise<unknown>[] => [v.toBlob(), v.toBlob('image/png'), v.toBlob('image/jpeg', 0.9), v.toBlob(null as unknown as string)];
/** 이 뷰어의 그리기 기록(fn 동안) */
function drawsOf(c: FakeElement, fn: () => void): DrawEntry[] {
  const gl = c.gl!;
  gl.draws = [];
  gl.logDraws = true;
  fn();
  gl.logDraws = false;
  return gl.draws;
}

describe('문맥을 잃은 동안 toBlob()', () => {
  it('선택 없는 꼴(toBlob()·형·형과 품질·null)도 선택을 준 toBlob과 같은 Error로 거절하고 2D 캔버스를 만들지도 그리지도 않는다(0.113.0은 빈 캔버스와 덧그림을 풀어 주었다)', async () => {
    const { v, canvas } = view();
    lose(canvas);
    const made = vi.spyOn(dom.doc, 'createElement');
    let got: Promise<string>[] = [];
    const draws = drawsOf(canvas, () => {
      got = [settle(v.toBlob({ scale: 1 })), ...plain(v).map(settle)];
    });
    const [withOpts, ...rest] = await Promise.all(got);
    expect(withOpts).toBe(MSG);
    expect(rest).toEqual([MSG, MSG, MSG, MSG]);
    // renderImage도 같은 글로 던진다(0.89.0 그대로 — 한 규칙)
    expect(() => v.renderImage()).toThrow(MSG);
    expect(made).not.toHaveBeenCalled();
    expect(draws).toEqual([]);
    expect(blobCalls).toEqual([]);
  });

  it('잃음 알림(onContextLost) 콜백 안에서 부른 toBlob()도 거절한다 — 잃음 안내와 함께 앱이 저장을 막지 않아도 빈 그림을 풀지 않는다', async () => {
    const { v, canvas } = view();
    const inCb: Promise<string>[] = [];
    v.onContextLost(() => void inCb.push(settle(v.toBlob('image/png'))));
    lose(canvas);
    expect(await Promise.all(inCb)).toEqual([MSG]);
    expect(blobCalls).toEqual([]);
  });

  it('되찾은 뒤에는 첫 그림 전이어도 정상 길로 푼다(선택 없는 것은 다시 올린 장면을 그려서, 선택을 준 것은 화면 밖에서) — 다시 잃으면 다시 거절', async () => {
    const { v, canvas } = view();
    lose(canvas);
    expect(await settle(v.toBlob())).toBe(MSG);
    restore(canvas);
    // 되찾은 뒤 renderNow 없이 곧 — toBlob이 스스로 그린다
    let after: Promise<string> = Promise.resolve('');
    const draws = drawsOf(canvas, () => {
      after = settle(v.toBlob('image/png'));
    });
    expect(await after).toBe('ok');
    expect(draws.length).toBeGreaterThan(0);
    expect(blobCalls).toEqual([{ type: 'image/png', quality: undefined, width: canvas.width, height: canvas.height }]);
    expect(await settle(v.toBlob({ scale: 1 }))).toBe('ok');
    expect(await Promise.all(plain(v).map(settle))).toEqual(['ok', 'ok', 'ok', 'ok']);

    lose(canvas);
    expect(await Promise.all([v.toBlob({ scale: 1 }), ...plain(v)].map(settle))).toEqual([MSG, MSG, MSG, MSG, MSG]);
    restore(canvas);
    expect(await settle(v.toBlob())).toBe('ok');
  });

  it('dispose 뒤는 0.89.0 그대로 거절한다 — 잃은 동안 dispose해도, 그 뒤 되찾음 사건이 와도', async () => {
    const a = view();
    a.v.dispose();
    expect(await Promise.all([a.v.toBlob({ scale: 1 }), ...plain(a.v)].map(settle))).toEqual([MSG, MSG, MSG, MSG, MSG]);

    const b = view();
    lose(b.canvas);
    b.v.dispose();
    expect(await settle(b.v.toBlob())).toBe(MSG);
    restore(b.canvas);
    const made = vi.spyOn(dom.doc, 'createElement');
    expect(await Promise.all([b.v.toBlob({ scale: 1 }), ...plain(b.v)].map(settle))).toEqual([MSG, MSG, MSG, MSG, MSG]);
    expect(made).not.toHaveBeenCalled();
    expect(blobCalls).toEqual([]);
  });
});

describe('문맥을 잃지 않은 길은 0.113.0 그대로', () => {
  it('화면 캔버스 위에 덧그림을 붙인 2D 캔버스를 받은 형·품질로 풀고, 그리기 기록은 renderNow와 같다', async () => {
    const { v, canvas } = view();
    const overlay = (v as unknown as { overlay: FakeElement }).overlay;
    const name = (x: unknown): string => (x === canvas ? 'canvas' : x === overlay ? 'overlay' : String(x));
    const ops: string[] = [];
    const made: FakeElement[] = [];
    const orig = dom.doc.createElement.bind(dom.doc);
    vi.spyOn(dom.doc, 'createElement').mockImplementation((tag: string) => {
      const el = orig(tag);
      made.push(el);
      const ctx = el.getContext('2d') as Record<string | symbol, unknown>;
      // 화면 그림 길이 만드는 2D 캔버스의 호출만 적는다(화면 캔버스·덧그림 캔버스는 이름으로)
      el.getContext = (type: string): unknown =>
        type === '2d'
          ? new Proxy(ctx, {
              get: (t, k) => {
                const x = t[k];
                if (typeof x !== 'function') return x;
                return (...a: unknown[]): unknown => {
                  ops.push(`${String(k)}(${a.map(name).join(',')})`);
                  return (x as (...b: unknown[]) => unknown).apply(t, a);
                };
              },
            })
          : null;
      return el;
    });
    v.renderNow();
    const ref = drawsOf(canvas, () => v.renderNow());
    let got: Promise<string> = Promise.resolve('');
    const draws = drawsOf(canvas, () => {
      got = settle(v.toBlob('image/jpeg', 0.8));
    });
    expect(await got).toBe('ok');
    expect(draws.length).toBeGreaterThan(0);
    expect(draws).toEqual(ref);
    expect(made.map((e) => e.tagName)).toEqual(['CANVAS']);
    expect(ops).toEqual(['drawImage(canvas,0,0)', 'drawImage(overlay,0,0)']);
    expect(blobCalls).toEqual([{ type: 'image/jpeg', quality: 0.8, width: canvas.width, height: canvas.height }]);
    expect([made[0]!.width, made[0]!.height]).toEqual([canvas.width, canvas.height]);
  });
});
