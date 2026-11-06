/**
 * 0.49.0 카메라 움직임 끝 알림·길이(48차가 남긴 것 — SKP 장면 탭 넘김·STEP 보기 도우미처럼 "끝난 뒤 부를 것"이 있는 앱 고리):
 * 순수 moveDuration, 뷰어(가짜 DOM): flyTo·fit·fitItems·setView·setViewDir·zoomToRect가 돌려준 Promise — 다 옮긴 그림 뒤 true,
 * 움직이지 않음(false·'auto' 줄이기·길이 0 이하)이면 바로 true, 같은 프레임 두 번 부름(앞은 false), 끌기·휠·굴림·움직임 끄기(끝 자리로 마침 → true),
 * setCamera·새 장면 맞춤·걷기 이동(끊김 → false), dispose 중·뒤 부름(false, 던지지 않음), 길이(ms), 주지 않으면 0.48.0과 같은 카메라 차례
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, defaultCamera, dirToAngles, lerpCamera } from '../src/camera';
import * as entry from '../src/index';
import { CAMERA_MOVE_MAX_MS, CAMERA_MOVE_MS, REDUCED_MOTION_QUERY, moveDuration } from '../src/motion';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

describe('순수: moveDuration', () => {
  it('주지 않거나 유한한 수가 아니면 320(0.48.0), 0 이하면 0(바로), 60초에서 자른다', () => {
    expect(CAMERA_MOVE_MS).toBe(320);
    expect(CAMERA_MOVE_MAX_MS).toBe(60_000);
    expect([undefined, null, NaN, Infinity, -Infinity, '100', {}].map(moveDuration)).toEqual([320, 320, 320, 320, 320, 320, 320]);
    expect([0, -0, -5, 1, 280, 320, 4000, 60_000, 1e9].map(moveDuration)).toEqual([0, 0, 0, 1, 280, 320, 4000, 60_000, 60_000]);
  });

  it('입구에서 내보낸다', () => {
    expect(entry.moveDuration).toBe(moveDuration);
    expect(entry.CAMERA_MOVE_MS).toBe(CAMERA_MOVE_MS);
    expect(entry.CAMERA_MOVE_MAX_MS).toBe(CAMERA_MOVE_MAX_MS);
  });
});

// ───────────── 뷰어 ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
let clock = 1000;
let reduce = false;
const reduceFns = new Set<() => void>();
beforeAll(() => {
  dom = installDom();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  (globalThis as Record<string, unknown>).matchMedia = (s: string) => {
    if (s !== REDUCED_MOTION_QUERY) return { matches: false, addEventListener() {}, removeEventListener() {} };
    return {
      get matches() {
        return reduce;
      },
      addEventListener: (_t: string, fn: () => void) => void reduceFns.add(fn),
      removeEventListener: (_t: string, fn: () => void) => void reduceFns.delete(fn),
    };
  };
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  reduce = false;
  reduceFns.clear();
});
afterAll(() => {
  vi.restoreAllMocks();
  dom.restore();
});

function view(opts: ConstructorParameters<typeof Viewer3d>[1] = {}): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { keyboard: true, ...opts });
  views.push(v);
  v.setScene(scene());
  v.setCamera(start());
  return v;
}
const scene = (): Scene3d => ({ name: 't', units: 'mm', meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [30, 0, 0], [34, 4, 4], [0.8, 0.6, 0.5, 1])], lines: [] });
/** 시험마다 같은 처음 카메라(멀리서 비스듬히) */
function start(): CameraState {
  const a = dirToAngles([-0.3, -1, 0.4]);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [3, -2, 1], distance: 400, projection: 'perspective' };
}
/** 저장된 보기 둘(장면 탭 A·B) */
function saved(i: number): CameraState {
  const a = dirToAngles(i ? [1, 0.2, 0.3] : [-0.5, 0.8, 0.6]);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: i ? [5, 5, 5] : [-4, 2, 0], distance: i ? 60 : 90, projection: 'perspective' };
}
const key = (c: CameraState): string => JSON.stringify(c, (_k, x) => (typeof x === 'number' ? +x.toFixed(9) : x));
/** Promise가 지금 풀렸는지(풀렸으면 그 값, 아니면 'pending') — 그림을 그리지 않고 마이크로 작업만 돌린다 */
async function state<T>(p: Promise<T>): Promise<T | 'pending'> {
  const PENDING = Symbol('pending');
  const r = await Promise.race([p, Promise.resolve(PENDING)]);
  return r === PENDING ? 'pending' : (r as T);
}
/** 시계를 ms 옮기고 그림 한 장 */
function frame(v: Viewer3d, ms: number): void {
  clock += ms;
  v.renderNow();
}
const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
let pid = 900;
const ptr = (el: FakeElement, type: string, x: number, y: number, button: number, buttons: number): void =>
  el.fire(type, { clientX: x, clientY: y, pointerId: pid, pointerType: 'mouse', button, buttons, isPrimary: true, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });

describe('뷰어: flyTo 끝 알림', () => {
  it('다 옮긴 그림(끝 자리)을 그린 뒤 true — 그 전에는 기다린다, 처리기 때 카메라는 끝 자리이고 onCameraChange가 먼저 알렸다', async () => {
    const v = view();
    const order: string[] = [];
    v.onCameraChange((c) => order.push(`camera ${key(c) === key(saved(1)) ? 'end' : 'mid'}`));
    const p = v.flyTo(saved(1));
    expect(p).toBeInstanceOf(Promise);
    void p.then((ok) => order.push(`done ${ok} ${key(v.getCamera()) === key(saved(1))}`));
    expect(await state(p)).toBe('pending');
    frame(v, 100);
    expect(await state(p)).toBe('pending');
    frame(v, 219);
    expect(await state(p)).toBe('pending');
    frame(v, 1);
    expect(await state(p)).toBe(true);
    expect(key(v.getCamera())).toBe(key(saved(1)));
    expect(order).toEqual(['camera mid', 'camera mid', 'camera end', 'done true true']);
  });

  it('움직이지 않으면 바로 true(그림 없이): animate false·인자 false·길이 0 이하, 카메라는 부른 그때 끝 자리', async () => {
    for (const [name, act] of [
      ['animate: false', (v: Viewer3d) => v.flyTo(saved(1))],
      ['flyTo(c, false)', (v: Viewer3d) => v.flyTo(saved(1), false)],
      ['duration 0', (v: Viewer3d) => v.flyTo(saved(1), undefined, { duration: 0 })],
      ['duration -10', (v: Viewer3d) => v.flyTo(saved(1), true, { duration: -10 })],
    ] as const) {
      const v = view(name === 'animate: false' ? { animate: false } : {});
      const p = act(v);
      expect(key(v.getCamera()), name).toBe(key(saved(1)));
      expect(await state(p), name).toBe(true);
    }
  });

  it("'auto'에서 줄이기 선호면 길이와 상관없이 바로 true", async () => {
    reduce = true;
    const v = view({ animate: 'auto' });
    expect(v.animate).toBe(false);
    const p = v.flyTo(saved(0), undefined, { duration: 4000 });
    expect(key(v.getCamera())).toBe(key(saved(0)));
    expect(await state(p)).toBe(true);
  });

  it('같은 프레임에 두 번 부르면 앞의 것은 false(닿기 전에 바뀜), 뒤의 것만 끝 자리에서 true', async () => {
    const v = view();
    const p1 = v.flyTo(saved(0));
    const p2 = v.flyTo(saved(1));
    expect(await state(p1)).toBe(false);
    expect(await state(p2)).toBe('pending');
    frame(v, 320);
    expect(await state(p2)).toBe(true);
    expect(key(v.getCamera())).toBe(key(saved(1)));
    // 같은 카메라로 두 번이어도 앞의 것은 false
    const q1 = v.flyTo(saved(0));
    const q2 = v.flyTo(saved(0));
    expect(await state(q1)).toBe(false);
    frame(v, 320);
    expect(await state(q2)).toBe(true);
    // 앞의 것이 그 처리기에서 다음 것을 불러도(장면 차례 넘기기) 다음 것은 제대로 끝난다
    const seen: boolean[] = [];
    const r1 = v.flyTo(saved(1)).then((ok) => {
      seen.push(ok);
      return { next: v.flyTo(saved(0)) };
    });
    frame(v, 320);
    const r2 = (await r1).next;
    expect(seen).toEqual([true]);
    expect(await state(r2)).toBe('pending');
    frame(v, 320);
    expect(await state(r2)).toBe(true);
    expect(key(v.getCamera())).toBe(key(saved(0)));
  });

  it('다른 카메라 길(fit·setView·뷰 키)이 바꾸면 false, setCamera·새 장면 맞춤도 false — 카메라는 그 길의 것', async () => {
    const acts: [string, (v: Viewer3d) => void, boolean][] = [
      ['fit()', (v) => void v.fit(), false],
      ["setView('top', false)", (v) => void v.setView('top', false), false],
      ['키 F', (v) => void v.handleKey({ key: 'f', code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, target: v.canvas } as unknown as KeyboardEvent), false],
      ['setCamera', (v) => v.setCamera(start()), false],
      ['setScene(새 장면 맞춤)', (v) => v.setScene(scene()), false],
      ['setScene(keepView)', (v) => v.setScene(scene(), { keepView: true }), true],
    ];
    for (const [name, act, keeps] of acts) {
      const v = view();
      const p = v.flyTo(saved(1));
      frame(v, 100);
      act(v);
      if (keeps) {
        expect(await state(p), name).toBe('pending');
        frame(v, 320);
        expect(await state(p), name).toBe(true);
        expect(key(v.getCamera()), name).toBe(key(saved(1)));
      } else {
        expect(await state(p), name).toBe(false);
        frame(v, 320);
        expect(key(v.getCamera()), name).not.toBe(key(saved(1)));
        if (name === 'setCamera') expect(key(v.getCamera())).toBe(key(start()));
      }
    }
  });

  it('끌기·휠·굴림·움직임 끄기(setAnimate(false)·줄이기 선호로 바뀜)는 끝 자리로 마치므로 true', async () => {
    const acts: [string, (v: Viewer3d) => void][] = [
      ['끌기 시작(누르기)', (v) => {
        pid++;
        ptr(v.canvas as unknown as FakeElement, 'pointerdown', 400, 300, 0, 1);
        ptr(v.canvas as unknown as FakeElement, 'pointerup', 400, 300, 0, 0);
      }],
      ['휠', (v) => (v.canvas as unknown as FakeElement).fire('wheel', { clientX: 400, clientY: 300, deltaY: 0, deltaMode: 0, ctrlKey: false, shiftKey: false })],
      ['setRoll(0)', (v) => v.setRoll(0)],
      ['setAnimate(false)', (v) => v.setAnimate(false)],
      ["'auto'에서 줄이기로 바뀜", () => {
        reduce = true;
        for (const f of [...reduceFns]) f();
      }],
    ];
    for (const [name, act] of acts) {
      reduce = false;
      const v = view({ animate: name.startsWith("'auto'") ? 'auto' : true });
      const p = v.flyTo(saved(1));
      frame(v, 100);
      expect(key(v.getCamera()), name).not.toBe(key(saved(1)));
      act(v);
      expect(await state(p), name).toBe(true);
      if (name !== '휠') expect(key(v.getCamera()), name).toBe(key(saved(1)));
    }
  });

  it('걷기 이동이 옮기던 카메라를 그 자리에서 바꾸면 false', async () => {
    const v = view();
    v.setNavigation('walk');
    const p = v.flyTo(saved(1));
    v.setWalkInput({ forward: 1 });
    frame(v, 100);
    expect(await state(p)).toBe(false);
    v.setWalkInput({});
  });

  it('dispose: 옮기던 것은 false, dispose 뒤·그 처리기 안에서 부르면 바로 false(던지지 않고 그림을 청하지 않음)', async () => {
    const v = view();
    const p = v.flyTo(saved(1));
    frame(v, 100);
    const again: Promise<boolean>[] = [];
    const after = p.then((ok) => {
      again.push(v.flyTo(saved(0)), v.fit(), v.setView('top'), v.zoomToRect(100, 100, 300, 300));
      return ok;
    });
    v.dispose();
    expect(await after).toBe(false);
    expect(await Promise.all(again)).toEqual([false, false, false, false]);
    expect(await state(v.flyTo(saved(1), true, { duration: 500 }))).toBe(false);
    expect(await state(v.flyTo(saved(1), false))).toBe(false);
    expect(() => v.renderNow()).not.toThrow();
  });
});

describe('뷰어: flyTo 길이', () => {
  it('duration ms 동안 같은 곡선으로 — 반에서 반, 끝 1ms 전은 끝이 아니고 끝에서 true', async () => {
    const v = view();
    const from = v.getCamera();
    const p = v.flyTo(saved(1), undefined, { duration: 1000 });
    frame(v, 500);
    expect(key(v.getCamera())).toBe(key(lerpCamera(from, saved(1), ease(0.5))));
    frame(v, 499);
    expect(key(v.getCamera())).not.toBe(key(saved(1)));
    expect(await state(p)).toBe('pending');
    frame(v, 1);
    expect(await state(p)).toBe(true);
    expect(key(v.getCamera())).toBe(key(saved(1)));
  });

  it('60초에서 자른다', async () => {
    const v = view();
    const p = v.flyTo(saved(0), true, { duration: 1e9 });
    frame(v, 59_999);
    expect(await state(p)).toBe('pending');
    frame(v, 1);
    expect(await state(p)).toBe(true);
  });

  it('주지 않으면 0.48.0과 같은 카메라 차례(0.32초, 같은 곡선) — 선택 객체를 주어도 길이가 없으면 같다', () => {
    const steps = [0, 40, 80, 120, 160, 200, 240, 280, 319, 320, 400];
    const run = (fly: (v: Viewer3d) => void): string[] => {
      const v = view();
      const t0 = clock;
      fly(v);
      return steps.map((ms) => {
        clock = t0 + ms;
        v.renderNow();
        return key(v.getCamera());
      });
    };
    const from = start();
    const want = steps.map((ms) => key(ms >= 320 ? saved(1) : lerpCamera(from, saved(1), ease(ms / 320))));
    expect(run((v) => void v.flyTo(saved(1)))).toEqual(want);
    expect(run((v) => void v.flyTo(saved(1), undefined, {}))).toEqual(want);
    expect(run((v) => void v.flyTo(saved(1), true, { duration: 320 }))).toEqual(want);
    expect(run((v) => void v.flyTo(saved(1), undefined, { duration: NaN }))).toEqual(want);
  });
});

describe('뷰어: 다른 카메라 길의 끝 알림', () => {
  it('fit·fitItems·setView·setViewDir·zoomToRect도 같은 Promise — 움직이면 끝 자리 그림 뒤 true, 바로면 곧 true', async () => {
    const paths: [string, (v: Viewer3d, a?: boolean) => Promise<boolean>][] = [
      ['fit', (v, a) => v.fit(a)],
      ['fitItems', (v, a) => v.fitItems(['b'], a)],
      ['fitItems(없는 id → fit)', (v, a) => v.fitItems(['없음'], a)],
      ['setView', (v, a) => v.setView('front', a)],
      ['setViewDir', (v, a) => v.setViewDir([1, 1, 1], a)],
      ['zoomToRect', (v, a) => v.zoomToRect(300, 200, 500, 400, a)],
    ];
    for (const [name, go] of paths) {
      const v = view();
      const p = go(v);
      expect(await state(p), name).toBe('pending');
      frame(v, 320);
      expect(await state(p), name).toBe(true);
      const end = key(v.getCamera());
      v.setCamera(start());
      const q = go(v, false);
      expect(await state(q), name).toBe(true);
      expect(key(v.getCamera()), name).toBe(end);
    }
  });

  it('zoomToRect가 무시하는 작은 사각형은 옮기지 않으므로 바로 false', async () => {
    const v = view();
    expect(await state(v.zoomToRect(10, 10, 11, 200))).toBe(false);
    expect(key(v.getCamera())).toBe(key(start()));
  });

  it('zoomToRect는 옮기던 것을 끝 자리로 마친 뒤 시작하므로 앞의 것은 true', async () => {
    const v = view();
    const p = v.flyTo(saved(1));
    frame(v, 100);
    const q = v.zoomToRect(300, 200, 500, 400);
    expect(await state(p)).toBe(true);
    expect(await state(q)).toBe('pending');
    frame(v, 320);
    expect(await state(q)).toBe(true);
  });
});
