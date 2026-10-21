/** 마주 보는 그물: 카메라 쪽 각, 원점 둘레 돌림, 돌려도 같은 범위 */
import { describe, expect, it } from 'vitest';
import { billboardAngle, billboardBounds, billboardMatrix, towardCamera } from '../src/billboard';
import { transformPoint } from '../src/math';

describe('마주 보는 그물', () => {
  it('앞(−Y)이 카메라 쪽으로: 원근은 원점 → 눈, 평행은 back, 바로 위면 방위각', () => {
    const o = [10, 20, 0];
    const to = towardCamera(o, [10, 120, 50], [0, 0, 1], true, 0);
    expect(to).toEqual([0, 100]);
    const a = billboardAngle([0, -1, 0], to);
    // −Y를 +Y로: 180°
    expect(Math.abs(a)).toBeCloseTo(Math.PI, 12);
    const M = billboardMatrix(o, a);
    // 원점은 제자리, 원점 앞(−Y 쪽) 점은 +Y 쪽으로
    const p0 = transformPoint(M, o);
    expect(p0[0]).toBeCloseTo(10, 12);
    expect(p0[1]).toBeCloseTo(20, 12);
    const p1 = transformPoint(M, [10, 15, 3]);
    expect(p1[0]).toBeCloseTo(10, 9);
    expect(p1[1]).toBeCloseTo(25, 9);
    expect(p1[2]).toBe(3);
    expect(towardCamera(o, [0, 0, 0], [1, 0, 0], false, 0)).toEqual([1, 0]);
    const top = towardCamera(o, [10, 20, 500], [0, 0, 1], true, Math.PI / 2);
    expect(top[0]).toBeCloseTo(1, 12);
    expect(top[1]).toBeCloseTo(0, 12);
  });

  it('범위: 원점 둘레 기둥(어느 각으로 돌려도 안에 든다)', () => {
    const b = { min: [-1, -0.2, 0] as [number, number, number], max: [1, 0.2, 5] as [number, number, number] };
    const c = billboardBounds(b, [0, 0, 0]);
    for (const a of [0, 0.7, 1.9, 3]) {
      const M = billboardMatrix([0, 0, 0], a);
      for (const p of [[-1, -0.2, 0], [1, 0.2, 5], [1, -0.2, 2]]) {
        const q = transformPoint(M, p);
        expect(q[0]).toBeGreaterThanOrEqual(c.min[0] - 1e-12);
        expect(q[0]).toBeLessThanOrEqual(c.max[0] + 1e-12);
        expect(q[1]).toBeGreaterThanOrEqual(c.min[1] - 1e-12);
        expect(q[1]).toBeLessThanOrEqual(c.max[1] + 1e-12);
      }
    }
    expect(c.min[2]).toBe(0);
    expect(c.max[2]).toBe(5);
  });
});
