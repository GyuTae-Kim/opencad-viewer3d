/** 0.9.0 보여 주기: 숨은 점선 CAPZ, 캔버스 초점 테두리, 그물마다 윤곽선·외곽선 색(셰이더 변종·색 고르기) */
import { describe, expect, it } from 'vitest';
import { type RenderMode, backEdgeDash, edgeLineColor, meshEdgeColor } from '../src/renderer';
import { DEPTH_FS, PROFILE_FS, withDefines } from '../src/shaders';
import { CANVAS_CSS, CANVAS_FOCUS_CSS, DARK_THEME, FOCUS_DEFAULT, LIGHT_THEME, contrastRatio, parseColor } from '../src/theme';
import type { Rgba } from '../src/types';

const MODES: RenderMode[] = ['shaded', 'shadedEdges', 'wireframe', 'xray', 'hiddenLine', 'monochrome', 'noTexture'];

/** 이 셰이더에 쓰는 꼴(#ifdef 이름 · #else · #endif)만 정의 여부대로 펼친다 */
const preprocess = (src: string, defs: readonly string[]): string => {
  const out: string[] = [];
  const stack: boolean[] = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    const m = /^#ifdef (\w+)$/.exec(t);
    if (m) stack.push(defs.includes(m[1]!));
    else if (t === '#else') stack.push(!stack.pop());
    else if (t === '#endif') stack.pop();
    else if (/^#define \w+$/.test(t)) continue;
    else if (stack.every(Boolean)) out.push(line);
  }
  expect(stack).toEqual([]);
  return out.join('\n');
};

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

describe('그물마다 윤곽선 색(edgeLineColor)', () => {
  const colors = { line: [0.85, 0.88, 0.92, 1] as Rgba, edge: [0.04, 0.05, 0.06, 0.75] as Rgba, background: [0.13, 0.16, 0.19, 1] as Rgba, highlight: [1, 0.7, 0.3, 1] as Rgba };
  const mesh: Rgba = [0.6, 0.2, 0.2, 1];
  it('선택이 없으면 0.7.2 모드 색(meshEdgeColor 기본)과 같다', () => {
    for (const m of MODES)
      for (const hi of [false, true]) expect(edgeLineColor(m, mesh, colors, hi, null)).toEqual(meshEdgeColor(m, mesh, colors, hi));
  });
  it('그물 색은 전역 edgeColor보다 먼저, 강조색보다는 뒤, X-ray는 알파 0.9배', () => {
    const item: Rgba = [0.9, 0.1, 0.4, 1];
    const fixed: Rgba = [0.1, 0.9, 0.1, 1];
    for (const m of MODES) {
      expect(edgeLineColor(m, mesh, colors, false, { fixed }, item)).toEqual(m === 'xray' ? [0.9, 0.1, 0.4, 0.9] : item);
      expect(edgeLineColor(m, mesh, colors, true, { fixed }, item)).toEqual(colors.highlight);
      // 그물 색이 없는 그물은 전역 색
      expect(edgeLineColor(m, mesh, colors, false, { fixed }, null)).toEqual(m === 'xray' ? [0.1, 0.9, 0.1, 0.9] : fixed);
    }
  });
  it("전역 'contrast'는 그물 색에도 따진다(선 뒤가 바탕인 모드에서 바탕과 3:1 미만이면 바꾼다)", () => {
    const dark: Rgba = [0.15, 0.17, 0.2, 1];
    const r = edgeLineColor('wireframe', mesh, colors, false, { fixed: null, contrast: colors.line }, dark);
    expect(r).toEqual(colors.line);
    // 음영+윤곽은 선 뒤가 면이라 바꾸지 않는다
    expect(edgeLineColor('shadedEdges', mesh, colors, false, { fixed: null, contrast: colors.line }, dark)).toEqual(dark);
  });
});

describe('그물마다 외곽선 색 셰이더(PCOL)', () => {
  it('PCOL이 없으면 외곽선·깊이 셰이더는 0.8.0 그대로(색 그림을 읽지 않는다)', () => {
    for (const defs of [[], ['ONE']]) {
      const s = preprocess(withDefines(PROFILE_FS, ...defs), defs);
      expect(s).not.toMatch(/u_pcol|\bat\b/);
      expect(s).toMatch(/\n {2}o_color = u_color;\n}$/);
    }
    const d = preprocess(DEPTH_FS, []);
    expect(d).not.toMatch(/u_pcol/);
    expect(d).toMatch(/o_color = vec4\(1\.0\);/);
  });
  it('PCOL이면 깊이 그림에 그물 색을 쓰고, 외곽선은 끊긴 곳에서 가장 가까운 화소의 색', () => {
    expect(preprocess(DEPTH_FS, ['PCOL'])).toMatch(/uniform vec4 u_pcol;[\s\S]*o_color = u_pcol;/);
    for (const defs of [['PCOL'], ['ONE', 'PCOL']]) {
      const s = preprocess(withDefines(PROFILE_FS, ...defs), defs);
      expect(s).toMatch(/uniform highp sampler2D u_pcol;/);
      expect(s).toMatch(/at = c <= a && c <= b \? vec2\(0\.0\) : a <= b \? o : -o;/);
      expect(s).toMatch(/o_color = texture\(u_pcol, v_uv \+ at \* u_texel\);/);
      expect(s).not.toMatch(/o_color = u_color;/);
    }
  });
});
