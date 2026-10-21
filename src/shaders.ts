/**
 * 3D 뷰어 셰이더(GLSL ES 3.00).
 * - 그물: 시점 공간 조명(주광 + 보조광 + 주변광, 약한 반사광), 양면. 법선이 없으면 화면 미분으로 면 법선을 만든다(평면 음영).
 * - 굵은 선: 선분 하나 = 사각형 인스턴스 하나. 끝점을 클립 공간으로 옮긴 뒤 가까운 면에서 자르고, 화면 화소로 폭을 편다.
 *   선분 배열(xyz,xyz…)을 그대로 인스턴스 속성(보폭 24바이트)으로 읽는다.
 * - 가는 선: gl.LINES로 같은 버퍼(보폭 12바이트)를 그대로 그린다.
 * - 점: 사각형 인스턴스 + 원 모양 잘라내기.
 * - 단면(u_clip = 로컬 좌표 평면 [a, b, c, w], 값 > 0 쪽을 버린다):
 *   그물·가는 선은 CLIP을 정의한 변종(withClip)에서 조각을 버린다(정의하지 않은 기본 셰이더는 예전과 같다 — 버리기 문이 없어 이른 깊이 검사를 막지 않는다).
 *   굵은 선은 정점 셰이더에서 선분을 평면으로 잘라 남는 부분만 펴고, 점은 잘린 쪽 점을 화면 밖으로 보낸다. 단면이 없으면 u_clip = (0, 0, 0, −1).
 * - 여러 단면(CLIPN을 정의한 변종, 0.7.0): u_clips[MAX](로컬 평면들)·u_nclip개 모두의 남는 쪽만 남긴다. 그물·가는 선은 로컬 위치를 보간해
 *   조각에서 평면마다 버리고, 굵은 선은 정점 셰이더에서 평면마다 차례로 자르고, 점은 잘린 쪽 점을 화면 밖으로 보낸다.
 * - FLAT(그물 변종, 숨은 선 모드): 조명 없이 색 그대로(바탕색으로 채워 뒤의 선을 가린다).
 * - 윤곽(PROFILE): 그물만 그린 깊이 그림에서 화면 화소 반지름 둘레의 깊이 2차 차분이 크면(실루엣) 그 색을 칠한다.
 *   원근 깊이 버퍼 값은 1/z에 대해 1차라 평면은 2차 차분이 0이다. 허용치는 (1 − 깊이)에 비례(가까운 곳·먼 곳 같은 상대 기준).
 * - 해(SUN, 0.7.0): 고정 보조광 대신 세계 방향 해 하나(시점 공간으로 옮긴 u_sunDir)·주변광. SHADOW면 해 쪽 평행 투영 깊이 그림을
 *   sampler2DShadow로 3×3 PCF해 그늘을 곱한다. FOG(그물·선·점)면 눈 깊이로 선형 안개 색을 섞는다.
 * - 뒷면(BACK·BACKTEX, 0.7.0): gl_FrontFacing으로 뒷면이면 Mesh3d.backColor(u_backColor, a < 0이면 앞면 그대로)나 뒷면 무늬(u_tex2, 좌표 a_uv2)를 칠한다.
 * - 무늬(TEX를 정의한 그물 변종): 무늬 좌표 a_uv(정점마다 (u, v) 또는 원근 무늬 (u·q, v·q, q))를 보간해 조각에서 q로 나누고
 *   u_tex(REPEAT·밉맵)를 읽어 rgb를 바꾼다. u_texAlpha가 1이면 그림 알파를 불투명도에 곱한다(반투명 차례). 무늬가 없는 그물은 예전 셰이더 그대로.
 */

/** 셰이더 원본에 #define들을 넣은 변종 */
export const withDefines = (src: string, ...names: string[]): string =>
  names.length ? src.replace('#version 300 es\n', `#version 300 es\n${names.map((n) => `#define ${n}\n`).join('')}`) : src;

/** 셰이더 원본에 #define CLIP을 넣은 변종 */
export const withClip = (src: string): string => withDefines(src, 'CLIP');

export const MESH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nrm;
layout(location=2) in vec4 a_col;
uniform mat4 u_mvp;
uniform mat4 u_mv;
uniform mat3 u_nmat;
uniform vec4 u_color;
uniform float u_vcol;
out vec3 v_vpos;
out vec3 v_nrm;
out vec4 v_col;
#ifdef CLIP
uniform vec4 u_clip;
out float v_clip;
#endif
#ifdef TEX
layout(location=3) in vec3 a_uv;
uniform float u_uvq;
out vec3 v_uv;
#endif
#ifdef CLIPN
out vec3 v_lpos;
#endif
#ifdef SHADOW
uniform mat4 u_shadowM;
out vec4 v_spos;
#endif
#ifdef BACKTEX
layout(location=4) in vec3 a_uv2;
uniform float u_uvq2;
out vec3 v_uv2;
#endif
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  v_vpos = (u_mv * vec4(a_pos, 1.0)).xyz;
#ifdef SHADOW
  v_spos = u_shadowM * vec4(a_pos, 1.0);
#endif
#ifdef BACKTEX
  v_uv2 = u_uvq2 > 0.5 ? a_uv2 : vec3(a_uv2.xy, 1.0);
#endif
  v_nrm = u_nmat * a_nrm;
  v_col = u_vcol > 0.5 ? a_col : u_color;
#ifdef CLIP
  v_clip = dot(u_clip, vec4(a_pos, 1.0));
#endif
#ifdef TEX
  v_uv = u_uvq > 0.5 ? a_uv : vec3(a_uv.xy, 1.0);
#endif
#ifdef CLIPN
  v_lpos = a_pos;
#endif
}`;

export const MESH_FS = `#version 300 es
precision highp float;
in vec3 v_vpos;
in vec3 v_nrm;
in vec4 v_col;
uniform float u_hasNrm;
uniform float u_ortho;
uniform vec4 u_tint;
uniform float u_alpha;
out vec4 o_color;
#ifdef CLIP
in float v_clip;
#endif
#ifdef TEX
in vec3 v_uv;
uniform sampler2D u_tex;
uniform float u_texAlpha;
#endif
#ifdef CLIPN
in vec3 v_lpos;
uniform vec4 u_clips[6];
uniform int u_nclip;
#endif
#ifdef SUN
uniform vec3 u_sunDir;
uniform vec3 u_sunCol;
uniform float u_amb;
#endif
#ifdef SHADOW
in vec4 v_spos;
uniform highp sampler2DShadow u_shadow;
uniform vec2 u_shadowTexel;
uniform float u_shadowBias;
float shadowAt() {
  vec3 p = v_spos.xyz / v_spos.w;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float s = 0.0;
  for (int i = -1; i <= 1; i++)
    for (int j = -1; j <= 1; j++) s += texture(u_shadow, vec3(p.xy + vec2(float(i), float(j)) * u_shadowTexel, p.z - u_shadowBias));
  return s / 9.0;
}
#endif
#ifdef FOG
uniform vec4 u_fogCol;
uniform vec2 u_fog;
#endif
#ifdef BACK
uniform vec4 u_backColor;
uniform float u_flipFace;
#endif
#ifdef BACKTEX
in vec3 v_uv2;
uniform sampler2D u_tex2;
uniform float u_tex2Alpha;
#endif
void main() {
  vec3 V = u_ortho > 0.5 ? vec3(0.0, 0.0, 1.0) : normalize(-v_vpos);
  vec3 ng = cross(dFdx(v_vpos), dFdy(v_vpos));
#ifdef CLIP
  if (v_clip > 0.0) discard;
#endif
#ifdef CLIPN
  for (int i = 0; i < 6; i++) {
    if (i >= u_nclip) break;
    if (dot(u_clips[i], vec4(v_lpos, 1.0)) > 0.0) discard;
  }
#endif
  float lg = length(ng);
  ng = lg > 0.0 ? ng / lg : V;
  if (dot(ng, V) < 0.0) ng = -ng;
  vec3 n = ng;
  if (u_hasNrm > 0.5) {
    float ln = length(v_nrm);
    if (ln > 0.0) {
      n = v_nrm / ln;
      if (dot(n, ng) < 0.0) n = -n;
    }
  }
  vec3 L1 = normalize(vec3(-0.35, 0.55, 0.76));
  vec3 L2 = normalize(vec3(0.6, -0.3, 0.45));
  float dif = 0.30 + 0.60 * max(dot(n, L1), 0.0) + 0.20 * max(dot(n, L2), 0.0);
  float spec = pow(max(dot(n, normalize(L1 + V)), 0.0), 48.0) * 0.2;
#ifdef SUN
  float sh = 1.0;
#ifdef SHADOW
  sh = shadowAt();
#endif
  float nl = max(dot(n, u_sunDir), 0.0) * sh;
  spec = pow(max(dot(n, normalize(u_sunDir + V)), 0.0), 48.0) * 0.2 * nl;
#endif
  vec4 base = v_col;
#ifdef TEX
  vec4 t = texture(u_tex, v_uv.xy / v_uv.z);
  base = vec4(t.rgb, v_col.a * mix(1.0, t.a, u_texAlpha));
#endif
#ifdef BACK
  // 뒷면(감김이 시계 방향 — 거울 행렬이면 뒤집어): 뒷면 색·뒷면 무늬
  if (gl_FrontFacing == (u_flipFace > 0.5)) {
    if (u_backColor.a >= 0.0) base = vec4(u_backColor.rgb, v_col.a);
#ifdef BACKTEX
    vec4 t2 = texture(u_tex2, v_uv2.xy / v_uv2.z);
    base = vec4(t2.rgb, v_col.a * mix(1.0, t2.a, u_tex2Alpha));
#endif
  }
#endif
  vec3 c = base.rgb * dif + vec3(spec);
#ifdef SUN
  c = base.rgb * (vec3(u_amb) + u_sunCol * nl) + vec3(spec);
#endif
#ifdef FLAT
  c = base.rgb;
#endif
  c = mix(c, u_tint.rgb, u_tint.a);
#ifdef FOG
  c = mix(c, u_fogCol.rgb, clamp((-v_vpos.z - u_fog.x) / max(u_fog.y - u_fog.x, 1e-9), 0.0, 1.0));
#endif
  o_color = vec4(c, base.a * u_alpha);
}`;

export const WIDE_VS = `#version 300 es
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

export const WIDE_FS = `#version 300 es
precision highp float;
in vec4 v_col;
in float v_alongW;
in float v_w;
uniform vec2 u_dash;
out vec4 o_color;
#ifdef FOG
in float v_fd;
uniform vec4 u_fogCol;
uniform vec2 u_fog;
#endif
void main() {
  if (u_dash.x > 0.0) {
    float along = v_alongW / v_w;
    if (mod(along, u_dash.x + u_dash.y) > u_dash.x) discard;
  }
  o_color = v_col;
#ifdef FOG
  o_color.rgb = mix(o_color.rgb, u_fogCol.rgb, clamp((v_fd - u_fog.x) / max(u_fog.y - u_fog.x, 1e-9), 0.0, 1.0));
#endif
}`;

export const THIN_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_col;
uniform mat4 u_mvp;
uniform vec4 u_color;
uniform float u_vcol;
uniform float u_alpha;
uniform vec4 u_override;
uniform float u_bias;
out vec4 v_col;
#ifdef CLIP
uniform vec4 u_clip;
out float v_clip;
#endif
#ifdef CLIPN
out vec3 v_lpos;
#endif
#ifdef FOG
uniform vec4 u_mvz;
out float v_fd;
#endif
void main() {
  vec4 c = u_mvp * vec4(a_pos, 1.0);
  c.z -= u_bias * c.w;
  gl_Position = c;
#ifdef FOG
  v_fd = -dot(u_mvz, vec4(a_pos, 1.0));
#endif
  vec4 col = u_vcol > 0.5 ? a_col : u_color;
  if (u_override.a > 0.0) col = u_override;
  v_col = vec4(col.rgb, col.a * u_alpha);
#ifdef CLIP
  v_clip = dot(u_clip, vec4(a_pos, 1.0));
#endif
#ifdef CLIPN
  v_lpos = a_pos;
#endif
}`;

export const THIN_FS = `#version 300 es
precision highp float;
in vec4 v_col;
out vec4 o_color;
#ifdef CLIP
in float v_clip;
#endif
#ifdef CLIPN
in vec3 v_lpos;
uniform vec4 u_clips[6];
uniform int u_nclip;
#endif
#ifdef FOG
in float v_fd;
uniform vec4 u_fogCol;
uniform vec2 u_fog;
#endif
void main() {
#ifdef CLIP
  if (v_clip > 0.0) discard;
#endif
#ifdef CLIPN
  for (int i = 0; i < 6; i++) {
    if (i >= u_nclip) break;
    if (dot(u_clips[i], vec4(v_lpos, 1.0)) > 0.0) discard;
  }
#endif
  o_color = v_col;
#ifdef FOG
  o_color.rgb = mix(o_color.rgb, u_fogCol.rgb, clamp((v_fd - u_fog.x) / max(u_fog.y - u_fog.x, 1e-9), 0.0, 1.0));
#endif
}`;

export const POINT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec3 a_pos;
uniform mat4 u_mvp;
uniform vec2 u_viewport;
uniform float u_size;
uniform float u_bias;
uniform vec4 u_clip;
out vec2 v_c;
#ifdef CLIPN
uniform vec4 u_clips[6];
uniform int u_nclip;
#endif
#ifdef FOG
uniform vec4 u_mvz;
out float v_fd;
#endif
void main() {
  vec4 c = u_mvp * vec4(a_pos, 1.0);
#ifdef FOG
  v_fd = -dot(u_mvz, vec4(a_pos, 1.0));
#endif
  if (c.w <= 0.0 || c.z < -c.w || dot(u_clip, vec4(a_pos, 1.0)) > 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
#ifdef CLIPN
  for (int i = 0; i < 6; i++) {
    if (i >= u_nclip) break;
    if (dot(u_clips[i], vec4(a_pos, 1.0)) > 0.0) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
  }
#endif
  float r = u_size * 0.5 + 1.0;
  c.xy += a_corner * r / (0.5 * u_viewport) * c.w;
  c.z -= u_bias * c.w;
  gl_Position = c;
  v_c = a_corner * r;
}`;

export const POINT_FS = `#version 300 es
precision highp float;
in vec2 v_c;
uniform float u_size;
uniform vec4 u_color;
uniform vec4 u_ring;
out vec4 o_color;
#ifdef FOG
in float v_fd;
uniform vec4 u_fogCol;
uniform vec2 u_fog;
#endif
void main() {
  float r = length(v_c);
  float R = u_size * 0.5;
  if (r > R) discard;
  o_color = r > R - max(1.0, R * 0.25) ? u_ring : u_color;
#ifdef FOG
  o_color.rgb = mix(o_color.rgb, u_fogCol.rgb, clamp((v_fd - u_fog.x) / max(u_fog.y - u_fog.x, 1e-9), 0.0, 1.0));
#endif
}`;

/** 화면 전체 삼각형(정점 번호로 만든다 — 버퍼 없음) */
export const FULL_VS = `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const PROFILE_FS = `#version 300 es
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

/**
 * 하늘·땅 바탕(0.7.0): 화소마다 눈에서 본 세계 방향의 높이(z 성분)로 지평선 위는 하늘(지평선 색 → 꼭대기 색),
 * 아래는 땅(지평선 색 → 바닥 색)을 칠한다. 평행 투영도 같은 시야각의 원근 방향으로 셈해 지평선이 앙각을 따라 움직인다.
 */
export const SKY_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec3 u_right;
uniform vec3 u_up;
uniform vec3 u_fwd;
uniform vec2 u_tan;
uniform vec2 u_shift;
uniform vec4 u_sky;
uniform vec4 u_skyH;
uniform vec4 u_ground;
uniform vec4 u_groundH;
out vec4 o_color;
void main() {
  vec2 n = v_uv * 2.0 - 1.0 - u_shift;
  vec3 d = normalize(u_fwd + n.x * u_tan.x * u_right + n.y * u_tan.y * u_up);
  float e = d.z;
  o_color = e >= 0.0 ? mix(u_skyH, u_sky, sqrt(clamp(e, 0.0, 1.0))) : mix(u_groundH, u_ground, sqrt(clamp(-e, 0.0, 1.0)));
}`;

/** 깊이만 그리기(그림자 깊이 그림): 단면 변종(CLIP·CLIPN)도 같은 규칙으로 버린다 */
export const DEPTH_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
uniform mat4 u_mvp;
#ifdef CLIP
uniform vec4 u_clip;
out float v_clip;
#endif
#ifdef CLIPN
out vec3 v_lpos;
#endif
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
#ifdef CLIP
  v_clip = dot(u_clip, vec4(a_pos, 1.0));
#endif
#ifdef CLIPN
  v_lpos = a_pos;
#endif
}`;

export const DEPTH_FS = `#version 300 es
precision highp float;
#ifdef CLIP
in float v_clip;
#endif
#ifdef CLIPN
in vec3 v_lpos;
uniform vec4 u_clips[6];
uniform int u_nclip;
#endif
out vec4 o_color;
void main() {
#ifdef CLIP
  if (v_clip > 0.0) discard;
#endif
#ifdef CLIPN
  for (int i = 0; i < 6; i++) {
    if (i >= u_nclip) break;
    if (dot(u_clips[i], vec4(v_lpos, 1.0)) > 0.0) discard;
  }
#endif
  o_color = vec4(1.0);
}`;
