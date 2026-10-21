/** 외곽선(RenderState.profiles)을 그리는 모드(0.7.2 와이어프레임)와 굵기 1화소 변종 */
import { describe, expect, it } from 'vitest';
import { type RenderMode, drawsProfiles, isShadedLike, profileOnePixel } from '../src/renderer';
import { PROFILE_FS, withDefines } from '../src/shaders';

const MODES: RenderMode[] = ['shaded', 'shadedEdges', 'wireframe', 'xray', 'hiddenLine', 'monochrome', 'noTexture'];
const table = (f: (m: RenderMode) => boolean): Record<string, boolean> => Object.fromEntries(MODES.map((m) => [m, f(m)]));

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

/** 0.7.1 외곽선 셰이더 원본(굵기 1.5 이상은 이것과 같은 셰이더여야 0.7.1과 화소까지 같다) */
const PROFILE_FS_071 = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform highp sampler2D u_depth;
uniform vec2 u_texel;
uniform float u_r;
uniform vec4 u_color;
uniform float u_ortho;
out vec4 o_color;
float D(vec2 o) { return texture(u_depth, v_uv + o * u_texel).r; }
void main() {
  float c = D(vec2(0.0));
  float thr = u_ortho > 0.5 ? 0.002 : 0.04 * max(1.0 - c, 1e-7);
  float e = 0.0;
  vec2 dirs[4] = vec2[4](vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(0.7071, 0.7071), vec2(0.7071, -0.7071));
  for (int i = 0; i < 4; i++) {
    vec2 o = dirs[i] * u_r;
    float a = D(o), b = D(-o);
    // 바탕(1)과 그물 경계는 늘 윤곽
    if ((c < 1.0) != (a < 1.0) || (c < 1.0) != (b < 1.0)) { e = 1.0; break; }
    if (c >= 1.0) continue;
    if (abs(a + b - 2.0 * c) > thr) { e = 1.0; break; }
  }
  if (e < 0.5) discard;
  o_color = u_color;
}`;

describe('외곽선을 그리는 모드', () => {
  it('음영 계열은 0.7.1 그대로, 와이어프레임은 0.7.2부터 그리고, X-ray는 그리지 않는다', () => {
    expect(table(drawsProfiles)).toEqual({ shaded: true, shadedEdges: true, wireframe: true, xray: false, hiddenLine: true, monochrome: true, noTexture: true });
  });

  it('음영 계열(면을 채워 서로 가리는 모드)에는 와이어프레임·X-ray가 들지 않는다', () => {
    expect(table(isShadedLike)).toEqual({ shaded: true, shadedEdges: true, wireframe: false, xray: false, hiddenLine: true, monochrome: true, noTexture: true });
    // 와이어프레임만 음영 계열 밖에서 외곽선을 그린다
    expect(MODES.filter((m) => drawsProfiles(m) && !isShadedLike(m))).toEqual(['wireframe']);
  });
});

describe('외곽선 굵기 1화소(0.7.2)', () => {
  it('장치 화소 1.5 미만만 1화소 변종 — 기본 굵기(CSS 2)는 화소 비율 0.75 이상에서 늘 예전 셰이더', () => {
    expect(profileOnePixel(1)).toBe(true);
    expect(profileOnePixel(1.25)).toBe(true); // width 1 · 화소 비율 1.25
    expect(profileOnePixel(1.4999)).toBe(true);
    expect(profileOnePixel(1.5)).toBe(false);
    expect(profileOnePixel(2)).toBe(false); // 기본(2) · 화소 비율 1, 또는 width 1 · 화소 비율 2
    expect(profileOnePixel(4)).toBe(false);
    for (const dpr of [0.75, 1, 1.25, 1.5, 2, 3]) expect(profileOnePixel(2 * dpr)).toBe(false);
  });

  it('ONE을 정의하지 않은 셰이더는 0.7.1 원본과 같다', () => {
    expect(preprocess(PROFILE_FS, [])).toBe(PROFILE_FS_071);
  });

  it('ONE 변종은 바탕 화소를 칠하지 않고 이웃 평균보다 가까운 화소만 칠한다', () => {
    const src = withDefines(PROFILE_FS, 'ONE');
    expect(src.startsWith('#version 300 es\n#define ONE\n')).toBe(true);
    const one = preprocess(src, ['ONE']);
    expect(one).toContain('if (c >= 1.0) discard;');
    expect(one).toContain('if (a + b - 2.0 * c > thr) { e = 1.0; break; }');
    expect(one).not.toContain('abs(a + b - 2.0 * c)');
  });
});
