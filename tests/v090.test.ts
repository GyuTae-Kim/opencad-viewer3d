/** 0.9.0 보여 주기: 숨은 점선 CAPZ */
import { describe, expect, it } from 'vitest';
import { backEdgeDash } from '../src/renderer';
import type { Rgba } from '../src/types';

describe('숨은 점선(뒤 모서리)', () => {
  it('늘 CAPZ 변종에 눈 쪽으로 당겨 그린다(0.8.0은 숨은 선 모드 기본 색에서 기본 변종 — 보이는 모서리 위에 겹쳤다)', () => {
    const c: Rgba = [0.2, 0.3, 0.4, 1];
    const o = backEdgeDash(c, 0.35);
    expect(o).toMatchObject({ color: c, vcol: false, width: 1, dashed: true, alpha: 0.35, capz: true });
    expect(o.bias).toBeGreaterThan(0);
    expect(o.bias).toBeLessThan(1e-4);
  });
});
