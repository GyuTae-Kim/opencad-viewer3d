/**
 * 0.51.0 나눠 올리기 걸음(setScene incremental — STEP 58·59차): budgetMs 함수 `(step, meshes) => ms`(걸음마다 몫 — 앞 걸음은 작게 첫 그림을 곧),
 * redrawMs(올리기 걸음만으로 생긴 다시 그리기를 간격에 한 번 — 첫 걸음은 그리고, 다 올린 걸음은 그리지 않고 다음 프레임에 장면 전체).
 * 주지 않거나 쓸 수 없는 값이면 0.50.0과 같은 걸음·같은 그리기. 시간은 performance.now를 부를 때마다 1 ms씩 가게 하고, requestAnimationFrame은 시험이 쌓아 둔 것을 차례로 부른다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

function scene(): Scene3d {
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < 300; i++) meshes.push(boxMesh(`b${i}`, [(i % 20) * 12, Math.floor(i / 20) * 12, 0], [(i % 20) * 12 + 8, Math.floor(i / 20) * 12 + 8, 8], [0.5, 0.6, 0.7, 1]));
  return { name: 'f', units: 'mm', meshes, lines: [] };
}

type Inc = boolean | { budgetMs?: number | ((step: number, meshes: number) => number); redrawMs?: number };

/**
 * 나눠 올리며 프레임을 차례로 부른다. 돌려주는 것: 사건 열('p<올린 수>' = 진행 알림, 'r' = 장면 그리기 — 프레임마다 '|'로 나눔)과 걸음별 올린 수.
 * between(i)는 i번째 프레임 앞에 부른다(사용자 조작 흉내)
 */
function run(inc: Inc, between?: (v: Viewer3d, i: number) => void): { events: string; done: number[]; renders: number; frames: number } {
  let t = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => (t += 1));
  const g = globalThis as unknown as Record<string, unknown>;
  const raf0 = g.requestAnimationFrame, caf0 = g.cancelAnimationFrame;
  let q: [number, (t: number) => void][] = [];
  let id = 0;
  g.requestAnimationFrame = (cb: (t: number) => void) => {
    q.push([++id, cb]);
    return id;
  };
  g.cancelAnimationFrame = (k: number) => {
    q = q.filter(([x]) => x !== k);
  };
  try {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false });
    views.push(v);
    const r = (v as unknown as { renderer: { render: (...a: unknown[]) => void } }).renderer;
    const render0 = r.render;
    let ev = '';
    let renders = 0;
    r.render = function (this: unknown, ...a: unknown[]) {
      ev += 'r';
      renders++;
      render0.apply(this, a);
    };
    const done: number[] = [];
    // 뷰어를 만들 때 걸어 둔 그리기(아직 부르지 않음)가 setScene 뒤 첫 프레임이다
    v.setScene(scene(), { incremental: inc, onProgress: (d) => (done.push(d), (ev += `p${d}`)) });
    let frames = 0;
    for (let i = 0; i < 400 && q.length; i++) {
      between?.(v, i);
      const batch = q;
      q = [];
      for (const [, cb] of batch) cb(t);
      ev += '|';
      frames++;
    }
    r.render = render0;
    return { events: ev, done, renders, frames };
  } finally {
    g.requestAnimationFrame = raf0;
    g.cancelAnimationFrame = caf0;
    spy.mockRestore();
  }
}

describe('0.51.0 나눠 올리기 걸음 몫(budgetMs 함수)', () => {
  it('함수는 걸음 번호(0부터)·장면 그물 수를 받고 걸음마다 그 몫 — 앞 두 걸음만 작게(STEP 59차 꼴)', () => {
    const calls: [number, number][] = [];
    const fn = (s: number, n: number): number => {
      calls.push([s, n]);
      return s < 2 ? 4 : 60;
    };
    const a = run({ budgetMs: 60 });
    const b = run({ budgetMs: fn });
    expect(a.done.at(-1)).toBe(300);
    expect(b.done.at(-1)).toBe(300);
    expect(calls.slice(0, 3)).toEqual([
      [0, 300],
      [1, 300],
      [2, 300],
    ]);
    expect(calls.map((c) => c[0])).toEqual(calls.map((_, i) => i));
    // 앞 두 걸음은 숫자 몫 60의 첫 걸음보다 훨씬 적게, 셋째 걸음부터는 크게
    expect(b.done[1]!).toBeLessThan(a.done[0]! / 2);
    expect(b.done[2]! - b.done[1]!).toBeGreaterThan(b.done[1]! * 2);
  });

  it('주지 않으면·숫자면 0.50.0과 같은 걸음, 쓸 수 없는 값·예외는 그 걸음만 숫자 몫(8 ms)', () => {
    const eight = run({ budgetMs: 8 });
    expect(run(true).events).toBe(eight.events);
    for (const bad of [Number.NaN, -1, 0, Number.POSITIVE_INFINITY, 'x' as unknown as number, undefined as unknown as number]) expect(run({ budgetMs: () => bad }).done).toEqual(eight.done);
    expect(
      run({
        budgetMs: () => {
          throw new Error('앱 함수 오류');
        },
      }).done,
    ).toEqual(eight.done);
  });
});

describe('0.51.0 나눠 올리는 동안 다시 그리기 간격(redrawMs)', () => {
  it('주지 않으면 걸음마다 그린다(0.50.0 — 진행 알림 뒤 같은 프레임에 그리기)', () => {
    const a = run({ budgetMs: 20 });
    const frames = a.events.split('|').filter(Boolean);
    expect(frames.every((f) => /^p\d+r$/.test(f))).toBe(true);
    expect(a.renders).toBe(a.done.length);
  });

  it('Infinity: 첫 걸음과 다 올린 뒤만 그리고, 다 올린 걸음은 그리지 않고 다음 프레임에 그린다', () => {
    const a = run({ budgetMs: 20, redrawMs: Number.POSITIVE_INFINITY });
    expect(a.done.at(-1)).toBe(300);
    expect(a.done.length).toBeGreaterThan(4);
    expect(a.renders).toBe(2);
    const frames = a.events.split('|').filter(Boolean);
    expect(frames[0]).toMatch(/^p\d+r$/);
    expect(frames.at(-2)).toBe('p300');
    expect(frames.at(-1)).toBe('r');
  });

  it('간격: 걸음보다 적게 그리고, 사용자 조작(궤도) 프레임은 늘 그린다', () => {
    const a = run({ budgetMs: 20, redrawMs: 60 });
    expect(a.renders).toBeGreaterThan(2);
    expect(a.renders).toBeLessThan(a.done.length);
    // 셋째 프레임 앞에 궤도 돌리기 — 그 프레임은 그린다
    const b = run({ budgetMs: 20, redrawMs: Number.POSITIVE_INFINITY }, (v, i) => {
      if (i === 2) v.orbitBy(0.1, 0);
    });
    expect(b.events.split('|')[2]).toMatch(/r$/);
    expect(b.renders).toBe(3);
  });
});
