/** 0.8.0 선 색·뒤 모서리: 대비 색 고르기, 그물 윤곽선 색(0.7.2 식과 같음), 뒤 모서리를 그리는 모드, 두꺼운 선 셰이더 기본 변종이 0.7.2 그대로 */
import { describe, expect, it } from 'vitest';
import { type RenderMode, drawsBackEdges, meshEdgeColor } from '../src/renderer';
import { WIDE_VS, withDefines } from '../src/shaders';
import { DARK_THEME, LIGHT_THEME, contrastLineColor, contrastRatio, parseColor } from '../src/theme';
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

// 0.7.2 두꺼운 선 정점 셰이더 원본(CAPZ가 없는 변종은 이것과 글자까지 같아야 0.7.2와 화소까지 같다)
const WIDE_VS_072 = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_p0;
layout(location=2) in vec3 a_p1;
layout(location=3) in vec4 a_c0;
layout(location=4) in vec4 a_c1;
uniform mat4 u_mvp;
uniform vec2 u_viewport;
uniform float u_width;
uniform vec4 u_color;
uniform float u_vcol;
uniform float u_alpha;
uniform vec4 u_override;
uniform float u_bias;
uniform vec4 u_clip;
out vec4 v_col;
out float v_alongW;
out float v_w;
#ifdef CLIPN
uniform vec4 u_clips[6];
uniform int u_nclip;
#endif
#ifdef FOG
uniform vec4 u_mvz;
out float v_fd;
#endif
void main() {
  vec3 p0 = a_p0;
  vec3 p1 = a_p1;
#ifdef CLIPN
  for (int i = 0; i < 6; i++) {
    if (i >= u_nclip) break;
    float k0 = dot(u_clips[i], vec4(p0, 1.0));
    float k1 = dot(u_clips[i], vec4(p1, 1.0));
    if (k0 > 0.0 && k1 > 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    if (k0 > 0.0) p0 = mix(p0, p1, k0 / (k0 - k1));
    else if (k1 > 0.0) p1 = mix(p1, p0, k1 / (k1 - k0));
  }
#else
  float k0 = dot(u_clip, vec4(p0, 1.0));
  float k1 = dot(u_clip, vec4(p1, 1.0));
  if (k0 > 0.0 && k1 > 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (k0 > 0.0) p0 = mix(p0, p1, k0 / (k0 - k1));
  else if (k1 > 0.0) p1 = mix(p1, p0, k1 / (k1 - k0));
#endif
  vec4 c0 = u_mvp * vec4(p0, 1.0);
  vec4 c1 = u_mvp * vec4(p1, 1.0);
  float d0 = c0.z + c0.w;
  float d1 = c1.z + c1.w;
  if (d0 < 0.0 && d1 < 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  if (d0 < 0.0) c0 = mix(c0, c1, d0 / (d0 - d1));
  else if (d1 < 0.0) c1 = mix(c1, c0, d1 / (d1 - d0));
  vec2 hv = 0.5 * u_viewport;
  vec2 s0 = c0.xy / c0.w * hv;
  vec2 s1 = c1.xy / c1.w * hv;
  vec2 d = s1 - s0;
  float len = length(d);
  vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float hw = max(u_width, 1.0) * 0.5;
  vec4 c = mix(c0, c1, a_corner.x);
  float ext = a_corner.x * 2.0 - 1.0;
  vec2 off = nrm * a_corner.y * hw + dir * ext * hw;
  c.xy += off / hv * c.w;
  c.z -= u_bias * c.w;
  gl_Position = c;
  vec4 col = u_vcol > 0.5 ? mix(a_c0, a_c1, a_corner.x) : u_color;
  if (u_override.a > 0.0) col = u_override;
  v_col = vec4(col.rgb, col.a * u_alpha);
  v_alongW = (a_corner.x * len + ext * hw) * c.w;
  v_w = c.w;
#ifdef FOG
  v_fd = -dot(u_mvz, vec4(mix(p0, p1, a_corner.x), 1.0));
#endif
}`;


describe('두꺼운 선 셰이더', () => {
  it('CAPZ를 쓰지 않는 변종(FOG·CLIPN 조합)은 0.7.2 원본과 같다', () => {
    for (const defs of [[], ['FOG'], ['CLIPN'], ['FOG', 'CLIPN']])
      expect(preprocess(withDefines(WIDE_VS, ...defs), defs)).toBe(preprocess(withDefines(WIDE_VS_072, ...defs), defs));
  });
  it('CAPZ 변종은 끝 마개를 늘릴 때 깊이도 선을 따라 늘리고 기울기만큼 눈 쪽으로 당긴다', () => {
    const s = preprocess(withDefines(WIDE_VS, 'CAPZ'), ['CAPZ']);
    expect(s).toContain('c += (c1 - c0) * (ext * hw / len);');
    expect(s).toContain('c.z -= abs(c1.z / c1.w - c0.z / c0.w) / len * c.w;');
    expect(s).not.toContain('vec2 off = nrm * a_corner.y * hw + dir * ext * hw;');
  });
});

describe('대비 색', () => {
  const white: Rgba = [1, 1, 1, 1], black: Rgba = [0, 0, 0, 1];
  it('대비 비(WCAG): 검정·흰색 21, 같은 색 1, 알파는 바탕에 얹어 잰다', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 6);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 9);
    expect(contrastRatio([0, 0, 0, 0], white)).toBeCloseTo(1, 9);
    expect(contrastRatio([0, 0, 0, 0.5], white)).toBeLessThan(contrastRatio(black, white));
  });
  it('색이 바탕과 3:1이면 그대로, 아니면 대신할 색, 그것도 아니면 검정·흰색', () => {
    const darkBg = parseColor(DARK_THEME.background)!;
    const darkMat: Rgba = [0.12, 0.13, 0.15, 1];
    const line: Rgba = [0.85, 0.88, 0.92, 1];
    expect(contrastLineColor([0.9, 0.5, 0.2, 1], darkBg, line)).toEqual([0.9, 0.5, 0.2, 1]);
    expect(contrastLineColor(darkMat, darkBg, line)).toEqual(line);
    // 밝은 파일 바탕 + 어두운 테마 선 색(밝음) → 둘 다 모자라면 검정
    const lightBg = parseColor(LIGHT_THEME.background)!;
    expect(contrastLineColor([0.95, 0.95, 0.95, 1], lightBg, line)).toEqual(black);
    expect(contrastLineColor(darkMat, darkBg, [0.15, 0.17, 0.2, 1])).toEqual(white);
  });
});

describe('그물 윤곽선 색(meshEdgeColor)', () => {
  const colors = { line: [0.85, 0.88, 0.92, 1] as Rgba, edge: [0.04, 0.05, 0.06, 0.75] as Rgba, background: parseColor(DARK_THEME.background)!, highlight: [1, 0.7, 0.3, 1] as Rgba };
  const mat: Rgba = [0.12, 0.13, 0.15, 1];
  /** 0.7.2 렌더러의 식 그대로 */
  const old = (mode: RenderMode, c: Rgba, hi: boolean): Rgba =>
    hi ? colors.highlight : mode === 'hiddenLine' ? colors.line : mode === 'shadedEdges' || mode === 'monochrome' || mode === 'noTexture' ? colors.edge : [c[0], c[1], c[2], mode === 'xray' ? 0.9 : 1];
  it('선택이 없으면 0.7.2와 같다(모든 모드·강조)', () => {
    for (const m of MODES) for (const hi of [false, true]) expect(meshEdgeColor(m, mat, colors, hi)).toEqual(old(m, mat, hi));
  });
  it('fixed: 모든 모드에서 그 색(X-ray 알파 0.9배), 강조색은 그대로', () => {
    const fixed: Rgba = [0.2, 0.2, 0.2, 1];
    expect(meshEdgeColor('wireframe', mat, colors, false, { fixed })).toEqual(fixed);
    expect(meshEdgeColor('shadedEdges', mat, colors, false, { fixed })).toEqual(fixed);
    expect(meshEdgeColor('xray', mat, colors, false, { fixed })).toEqual([0.2, 0.2, 0.2, 0.9]);
    expect(meshEdgeColor('wireframe', mat, colors, true, { fixed })).toEqual(colors.highlight);
  });
  it('contrast: 어두운 테마의 어두운 재질은 와이어프레임·X-ray에서 테마 선 색, 음영+윤곽은 그대로, 밝은 재질도 그대로', () => {
    const contrast = colors.line;
    expect(meshEdgeColor('wireframe', mat, colors, false, { contrast })).toEqual(colors.line);
    expect(meshEdgeColor('xray', mat, colors, false, { contrast })).toEqual(colors.line);
    expect(meshEdgeColor('shadedEdges', mat, colors, false, { contrast })).toEqual(colors.edge);
    expect(meshEdgeColor('wireframe', [0.9, 0.6, 0.2, 1], colors, false, { contrast })).toEqual([0.9, 0.6, 0.2, 1]);
    // 숨은 선: 밝은 파일 바탕이면 테마 선 색(밝음)도 모자라 검정
    const lightBg = { ...colors, background: [0.96, 0.96, 0.96, 1] as Rgba };
    expect(meshEdgeColor('hiddenLine', mat, lightBg, false, { contrast })).toEqual([0, 0, 0, 1]);
  });
});

describe('뒤 모서리 점선을 그리는 모드(drawsBackEdges)', () => {
  it('숨은 선은 늘(0.7.2), shaded면 음영 계열도 — 음영은 선분 묶음만, 와이어프레임·X-ray는 없음', () => {
    const t = (shaded: boolean) => Object.fromEntries(MODES.map((m) => [m, drawsBackEdges(m, shaded)]));
    const none = { meshes: false, lines: false }, both = { meshes: true, lines: true };
    expect(t(false)).toEqual({ shaded: none, shadedEdges: none, wireframe: none, xray: none, hiddenLine: both, monochrome: none, noTexture: none });
    expect(t(true)).toEqual({ shaded: { meshes: false, lines: true }, shadedEdges: both, wireframe: none, xray: none, hiddenLine: both, monochrome: both, noTexture: both });
  });
});
