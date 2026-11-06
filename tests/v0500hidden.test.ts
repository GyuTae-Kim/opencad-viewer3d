/**
 * 0.50.0 카메라 움직임 끝 알림 — 탭이 숨었거나(visibilitychange) 그래픽 문맥을 잃은 동안(49차 남은 한계: requestAnimationFrame이 멈춰 영원히 풀리지 않았다):
 * 옮기던 움직임은 끝 자리로 마치고 true(끌기·휠처럼 — 카메라는 끝 자리, 다시 보이면 그 자리를 그린다), 숨은 동안·잃은 동안 새로 부른 움직임은 바로 끝 자리로 옮기고 true.
 * 보이는 동안은 0.49.0과 같다(끝 자리 그림 뒤 true)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.doc.visibilityState = 'visible';
});
afterAll(() => dom.restore());

function view(): { v: Viewer3d; canvas: FakeElement } {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: true, keyboard: false });
  views.push(v);
  v.setScene({ name: 'h', units: 'mm', meshes: [boxMesh('상자', [0, 0, 0], [10, 10, 10], [0.7, 0.7, 0.7, 1])], lines: [] });
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement };
}
const hide = (state: 'hidden' | 'visible'): void => {
  dom.doc.visibilityState = state;
  for (const fn of [...(dom.doc.listeners.get('visibilitychange') ?? [])]) fn({ type: 'visibilitychange' });
};
/** 마이크로 작업을 비운 뒤 풀렸는지(풀리지 않았으면 'pending') */
async function state<T>(p: Promise<T>): Promise<T | 'pending'> {
  let out: T | 'pending' = 'pending';
  void p.then((x) => (out = x));
  for (let i = 0; i < 5; i++) await Promise.resolve();
  return out;
}
const key = (c: { yaw: number; pitch: number; distance: number }): string => [c.yaw, c.pitch, c.distance].map((x) => x.toFixed(9)).join();

describe('끝 알림: 탭 숨김·문맥 잃음', () => {
  it('보이는 동안은 0.49.0과 같다(끝 자리 그림 전에는 풀리지 않는다)', async () => {
    const { v } = view();
    const c = v.getCamera();
    const p = v.flyTo({ ...c, yaw: c.yaw + 1 }, true, { duration: 60_000 });
    v.renderNow();
    expect(await state(p)).toBe('pending');
  });

  it('옮기는 중 탭이 숨으면 끝 자리로 마치고 true, 다시 보이면 그 자리를 그린다', async () => {
    const { v } = view();
    const c = v.getCamera();
    const to = { ...c, yaw: c.yaw + 1 };
    const seen: string[] = [];
    v.onCameraChange((k) => seen.push(key(k)));
    const p = v.flyTo(to, true, { duration: 60_000 });
    v.renderNow();
    expect(await state(p)).toBe('pending');
    hide('hidden');
    expect(await state(p)).toBe(true);
    expect(key(v.getCamera())).toBe(key(to));
    hide('visible');
    v.renderNow();
    expect(seen[seen.length - 1]).toBe(key(to));
  });

  it('숨은 동안 부르면 움직이지 않고 바로 끝 자리·true(fit·setView도)', async () => {
    const { v } = view();
    hide('hidden');
    const c = v.getCamera();
    const to = { ...c, yaw: c.yaw - 0.7 };
    expect(await state(v.flyTo(to, true, { duration: 5000 }))).toBe(true);
    expect(key(v.getCamera())).toBe(key(to));
    expect(await state(v.setView('top'))).toBe(true);
    expect(await state(v.fit())).toBe(true);
  });

  it('옮기는 중 문맥을 잃으면 끝 자리로 마치고 true, 잃은 동안 부른 것도 바로 true', async () => {
    const { v, canvas } = view();
    const c = v.getCamera();
    const to = { ...c, pitch: c.pitch * 0.5 };
    const p = v.flyTo(to, true, { duration: 60_000 });
    v.renderNow();
    canvas.fire('webglcontextlost', {});
    expect(await state(p)).toBe(true);
    expect(key(v.getCamera())).toBe(key(to));
    const to2 = { ...c, yaw: c.yaw + 0.3 };
    expect(await state(v.flyTo(to2, true, { duration: 5000 }))).toBe(true);
    expect(key(v.getCamera())).toBe(key(to2));
  });

  it('dispose 중에는 0.49.0처럼 false', async () => {
    const { v } = view();
    const c = v.getCamera();
    const p = v.flyTo({ ...c, yaw: c.yaw + 1 }, true, { duration: 60_000 });
    v.dispose();
    expect(await state(p)).toBe(false);
  });
});
