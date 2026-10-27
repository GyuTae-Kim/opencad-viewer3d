/** 0.9.0 보여 주기: 숨은 점선 CAPZ, 캔버스 초점 테두리 */
import { describe, expect, it } from 'vitest';
import { backEdgeDash } from '../src/renderer';
import { CANVAS_CSS, CANVAS_FOCUS_CSS, DARK_THEME, FOCUS_DEFAULT, LIGHT_THEME, contrastRatio, parseColor } from '../src/theme';
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

describe('캔버스 초점 테두리', () => {
  it('캔버스 자리 스타일에 outline을 직접 두지 않고, 키보드 초점(:focus-visible)에서만 테두리', () => {
    expect(CANVAS_CSS).not.toMatch(/outline/);
    expect(CANVAS_CSS).toMatch(/touch-action:none/);
    expect(CANVAS_FOCUS_CSS).toMatch(/:where\(canvas\.v3d-gl\)\{outline:none\}/);
    expect(CANVAS_FOCUS_CSS).toMatch(/:where\(canvas\.v3d-gl\):focus-visible\{outline:2px solid var\(--v3d-focus,/);
    expect(CANVAS_FOCUS_CSS).toMatch(/outline-offset:-2px/);
    expect(CANVAS_FOCUS_CSS).not.toMatch(/!important/);
  });
  it('테마 기본 초점 색은 그 테마 바탕과 3:1 넘게 대비한다', () => {
    expect(contrastRatio(parseColor(FOCUS_DEFAULT.dark)!, parseColor(DARK_THEME.background)!)).toBeGreaterThan(3);
    expect(contrastRatio(parseColor(FOCUS_DEFAULT.light)!, parseColor(LIGHT_THEME.background)!)).toBeGreaterThan(3);
  });
});
