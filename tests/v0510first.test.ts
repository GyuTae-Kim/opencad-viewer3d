/**
 * 0.51.0 나눠 올리기 첫 걸음만 작게(setScene incremental.firstMs): 첫 프레임은 firstMs 몫, 그 뒤는 budgetMs. 주지 않거나 쓸 수 없는 값(0·음수·NaN·무한대)이면
 * 0.50.0과 같은 걸음(모든 프레임 budgetMs). 시간은 performance.now를 부를 때마다 1 ms씩 가게 해 걸음을 정해 둔다.
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

/** 나눠 올리며 프레임마다 올린 묶음 수(onProgress) — 다 올리거나 200프레임까지 */
function steps(inc: boolean | { budgetMs?: number; firstMs?: number }): number[] {
  let t = 0;
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => (t += 1));
  try {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false });
    views.push(v);
    const done: number[] = [];
    v.setScene(scene(), { incremental: inc, onProgress: (d) => done.push(d) });
    for (let i = 0; i < 200 && (done.at(-1) ?? 0) < 300; i++) v.renderNow();
    return done;
  } finally {
    spy.mockRestore();
  }
}

describe('0.51.0 나눠 올리기 firstMs', () => {
  it('첫 프레임만 firstMs 몫(첫 그림이 곧), 그 뒤는 budgetMs — 다 올리기까지 걸음은 budgetMs만 준 것과 비슷하다', () => {
    const a = steps({ budgetMs: 60 });
    const b = steps({ budgetMs: 60, firstMs: 4 });
    expect(a.at(-1)).toBe(300);
    expect(b.at(-1)).toBe(300);
    // 첫 걸음: firstMs면 훨씬 적게
    expect(b[0]!).toBeLessThan(a[0]! / 4);
    expect(b[0]!).toBeGreaterThan(0);
    // 둘째 걸음부터는 budgetMs 몫(첫 걸음보다 크다)
    expect(b[1]! - b[0]!).toBeGreaterThan(b[0]! * 4);
    expect(b.length).toBeLessThanOrEqual(a.length + 1);
  });

  it('주지 않거나 쓸 수 없는 값이면 0.50.0과 같은 걸음', () => {
    const a = steps({ budgetMs: 30 });
    for (const firstMs of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(steps({ budgetMs: 30, firstMs })).toEqual(a);
    // incremental: true(기본 8 ms)도 그대로
    expect(steps(true)).toEqual(steps({ budgetMs: 8 }));
  });
});
