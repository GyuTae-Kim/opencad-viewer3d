/**
 * 0.52.0 시험 도우미: 가짜 WebGL 그리기(LiveDraw)를 도형마다 펼친 기록 — 정점마다 셰이더가 받을 값(위치를 행렬로 옮긴 클립 좌표·시점 좌표·법선 행렬 곱·색)과
 * 그리기 상태(켠 상태·깊이·색 쓰기·면 밀기·틀 버퍼)·조각 셰이더가 읽는 균일 변수·정의를 글자열 하나로. 그물마다 그린 그림과 묶어(MERGE)·모아(INST) 그린 그림이
 * 같은 도형을 같은 차례·같은 값으로 그렸는지 견준다(행렬·색이 균일 변수에서 오든 자리 자료 그림에서 오든 같은 float32 값이면 같은 기록).
 * 셈은 JS double로 하지만 들어가는 값(float32 행렬·위치)이 같으면 결과도 비트까지 같다.
 */
import type { Attrib, FakeGL, LiveDraw } from './fakegl';

const SIZE: Record<string, number> = { FLOAT: 4, UNSIGNED_SHORT: 2, SHORT: 2, BYTE: 1, UNSIGNED_BYTE: 1, UNSIGNED_INT: 4 };

/** 속성 값(정점·인스턴스 번호 i의 n값 — 꺼진 속성이면 null) */
function attr(a: Attrib | undefined, i: number, n: number): number[] | null {
  if (!a || !a.enabled || !a.buf) return null;
  const b = a.buf.bytes;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const sz = SIZE[a.type] ?? 4;
  const stride = a.stride || sz * a.size;
  const o = a.offset + i * stride;
  const out: number[] = [];
  for (let c = 0; c < Math.min(n, a.size); c++) {
    const p = o + c * sz;
    let x: number;
    if (a.type === 'FLOAT') x = dv.getFloat32(p, true);
    else if (a.type === 'UNSIGNED_SHORT') x = dv.getUint16(p, true);
    else if (a.type === 'SHORT') x = dv.getInt16(p, true);
    else if (a.type === 'BYTE') x = dv.getInt8(p);
    else x = dv.getUint8(p);
    if (a.norm) x = a.type === 'BYTE' ? Math.max(x / 127, -1) : a.type === 'SHORT' ? Math.max(x / 32767, -1) : a.type === 'UNSIGNED_SHORT' ? x / 65535 : x / 255;
    out.push(x);
  }
  return out;
}

const f32 = (a: readonly unknown[] | undefined): number[] | null => (a ? (a.flat() as number[]).map((x) => Math.fround(x)) : null);
const mul4 = (m: readonly number[], x: number, y: number, z: number, w = 1): number[] => [
  m[0]! * x + m[4]! * y + m[8]! * z + m[12]! * w,
  m[1]! * x + m[5]! * y + m[9]! * z + m[13]! * w,
  m[2]! * x + m[6]! * y + m[10]! * z + m[14]! * w,
  m[3]! * x + m[7]! * y + m[11]! * z + m[15]! * w,
];
const mul3 = (m: readonly number[], x: number, y: number, z: number): number[] => [m[0]! * x + m[3]! * y + m[6]! * z, m[1]! * x + m[4]! * y + m[7]! * z, m[2]! * x + m[5]! * y + m[8]! * z];

const FOG = /^#define FOG$/m;
/** 0.60.0 묶음 선의 단면 하나(자리마다 로컬 평면 — 7번째 텍셀) */
const MCLIP = /^#define MCLIP$/m;
/** 0.62.0 이동뿐 꼴(0~2열은 균일 변수 u_mvp0·u_mv0·u_shadow0, 법선 행렬 u_nmat0 — 자리에는 3열·깃발·색) */
const MSHIFT = /^#define MSHIFT$/m;

/** 셰이더 정의(INST·MERGE·MCLIP·MSHIFT — 행렬·평면을 어디서 읽는지만 다르다 — 는 뺀다) */
const defsOf = (vs: string): string =>
  [...vs.matchAll(/^#define (\w+)$/gm)]
    .map((m) => m[1]!)
    .filter((d) => d !== 'INST' && d !== 'MERGE' && d !== 'MCLIP' && d !== 'MSHIFT')
    .sort()
    .join(',');

/** 0.62.0 균일 변수 4×4 행렬의 0~2열과 자리 텍셀 c3(3열) */
const cols012 = (U: ReadonlyMap<string, unknown[]>, name: string, c3: number[]): number[] => [...f32(U.get(name))!.slice(0, 12), ...c3];

/**
 * 선 자리 꼴: 그물 하나 텍셀 수·색·단면 평면 텍셀(인스턴싱 5, 묶음 6·7 — 색 5·평면 6, 이동뿐 꼴 2 + 안개 + 단면 — 색 1·평면 끝)과
 * 이동뿐 꼴의 안개 z 행(앞 세 칸 균일 변수 u_mvz0·끝 칸 텍셀 2의 x — 안개가 없으면 null)
 */
type LineLayout = { n: number; col: number; clip: number; lite: boolean; mvz: (U: ReadonlyMap<string, unknown[]>, at: (j: number) => number[]) => number[] | null };
function lineLayout(vs: string, merge: boolean, mclip: boolean): LineLayout {
  if (merge && MSHIFT.test(vs)) {
    const fog = FOG.test(vs) ? 1 : 0;
    return { n: 2 + fog + (mclip ? 1 : 0), col: 1, clip: 2 + fog, lite: true, mvz: (U, at) => (fog ? [...f32(U.get('u_mvz0'))!, at(2)[0]!] : null) };
  }
  return { n: merge ? (mclip ? 7 : 6) : 5, col: 5, clip: 6, lite: false, mvz: () => null };
}

/** 자리 자료 텍셀 k(4값) */
function texel(d: LiveDraw, k: number): number[] {
  const t = d.inst;
  if (!t?.floats || !t.w) throw new Error('자리 자료 그림이 없다');
  const o = ((k >> 10) * t.w + (k & 1023)) * 4;
  return Array.from(t.floats.subarray(o, o + 4));
}

/**
 * 그리기 하나를 도형 기록들로 펼친다(차례대로 out에 더한다). 그물(a_nrm)·가는 선(a_col)·굵은 선(a_corner) 정점 셰이더만 펼치고, 그 밖(화면 전체 삼각형 등)은
 * 그리기 꼴·균일 변수 한 줄로
 */
export function expandDraw(gl: FakeGL, d: LiveDraw, out: string[]): void {
  const p = d.prog;
  if (!p) return;
  const vs = p.vs;
  const U = p.uniforms;
  const mode = gl.nameOf(d.args[0]!) ?? String(d.args[0]);
  const state = `${d.caps.join('+')}|${d.depthFunc}|${d.depthMask}|${d.colorMask}|${d.polygonOffset}|${d.fb ? 'fb' : 'screen'}|${defsOf(vs)}`;
  const inst = /^#define INST$/m.test(vs);
  const merge = vs.includes('in float a_item;');
  const base = inst ? (U.get('u_instBase')?.[0] as number) : 0;
  // 정점 번호 목록(색인이면 색인 버퍼에서)과 인스턴스 수
  const verts = (): number[] => {
    if (d.op === 'drawElements' || d.op === 'drawElementsInstanced') {
      const [, count, , off] = d.args as [number, number, number, number];
      const b = d.element!.bytes;
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      return Array.from({ length: count }, (_, j) => dv.getUint32(off + j * 4, true));
    }
    const [, first, count] = d.args as [number, number, number];
    return Array.from({ length: count }, (_, j) => first + j);
  };
  const nInst = d.op.endsWith('Instanced') ? d.args[d.args.length - 1]! : 1;
  if (vs.includes('layout(location=1) in vec3 a_nrm;')) {
    // 그물: 정점마다 클립·시점 좌표·법선 행렬 곱·색(정점 색이면 a_col), 0.53.0 그림자 좌표(v_spos — SHADOW)·단면 값(v_clip — CLIP)
    // (인스턴싱·묶음 변종은 그림자 행렬·로컬 평면도 자리 자료에서 — 묶음은 색 텍셀 뒤 12~15·맨 끝, 인스턴싱은 11~14·맨 끝)
    const shadowOn = /^#define SHADOW$/m.test(vs), clipOn = /^#define CLIP$/m.test(vs);
    const lite = merge && MSHIFT.test(vs);
    const stride = inst ? ((U.get('u_instStride')?.[0] as number | undefined) ?? (lite ? 3 : merge ? 12 : 11)) : 0;
    // 정점 색 쓰기(u_vcol)는 묶음 변종에서 자리 자료(법선 행렬 첫 텍셀 w — 이동뿐 꼴은 시점 · 모형 3열 w) — 정점마다 셰이더가 고르는 색(v_col = u_vcol > 0.5 ? a_col : u_color)으로 견준다
    const flags = JSON.stringify([U.get('u_hasNrm'), f32(U.get('u_tint')), U.get('u_alpha'), U.get('u_ortho'), U.get('u_flipFace')]);
    const vl = verts();
    for (let n = 0; n < nInst; n++) {
      const tri: string[] = [];
      for (const v of vl) {
        const item = merge ? attr(d.attribs.get(5), v, 1)![0]! : n;
        const at = (j: number): number[] => texel(d, base + item * stride + j);
        const mvp = lite ? cols012(U, 'u_mvp0', at(0)) : inst ? [...at(0), ...at(1), ...at(2), ...at(3)] : f32(U.get('u_mvp'))!;
        const mv = lite ? cols012(U, 'u_mv0', at(1)) : inst ? [...at(4), ...at(5), ...at(6), ...at(7)] : f32(U.get('u_mv'))!;
        const nm = lite ? f32(U.get('u_nmat0'))! : inst ? [...at(8).slice(0, 3), ...at(9).slice(0, 3), ...at(10).slice(0, 3)] : f32(U.get('u_nmat'))!;
        const col = lite ? at(2) : merge ? at(11) : f32(U.get('u_color'));
        const vcol = lite ? at(1)[3]! : merge ? at(8)[3]! : ((U.get('u_vcol')?.[0] as number | undefined) ?? 0);
        const P = attr(d.attribs.get(0), v, 3)!;
        const N = attr(d.attribs.get(1), v, 3);
        const C = attr(d.attribs.get(2), v, 4) ?? [0, 0, 0, 1];
        const s0 = merge ? 12 : 11;
        const sm = !shadowOn ? null : lite ? cols012(U, 'u_shadow0', at(3)) : inst ? [...at(s0), ...at(s0 + 1), ...at(s0 + 2), ...at(s0 + 3)] : f32(U.get('u_shadowM'));
        const cp = !clipOn ? null : inst ? at(stride - 1) : f32(U.get('u_clip'));
        const extra = [sm ? mul4(sm, P[0]!, P[1]!, P[2]!) : null, cp ? cp[0]! * P[0]! + cp[1]! * P[1]! + cp[2]! * P[2]! + cp[3]! : null];
        tri.push(JSON.stringify([mul4(mvp, P[0]!, P[1]!, P[2]!), mul4(mv, P[0]!, P[1]!, P[2]!).slice(0, 3), N ? mul3(nm, N[0]!, N[1]!, N[2]!) : null, vcol > 0.5 ? C : col, ...extra]));
        if (tri.length === (mode === 'TRIANGLES' ? 3 : 2)) {
          out.push(`mesh|${mode}|${state}|${flags}|${tri.join(';')}`);
          tri.length = 0;
        }
      }
    }
    return;
  }
  if (vs.includes('layout(location=0) in vec2 a_corner;') && vs.includes('a_p0')) {
    // 굵은 선: 인스턴스(선분)마다 두 끝 클립 좌표·색·굵기·점선·치우침(0.60.0 묶음 단면 평면은 자리 자료 7번째 텍셀 — 그물마다 그릴 때의 u_clip 자리에)
    const fixedOf = (clip: number[] | null): string =>
      JSON.stringify([U.get('u_vcol'), U.get('u_alpha'), f32(U.get('u_override')), U.get('u_bias'), U.get('u_width'), U.get('u_viewport'), U.get('u_dash'), clip, f32(U.get('u_fogCol')), U.get('u_fog')]);
    const mclip = merge && MCLIP.test(vs);
    const L = lineLayout(vs, merge, mclip);
    const fixed0 = fixedOf(f32(U.get('u_clip')));
    const instN = (U.get('u_instN')?.[0] as number) ?? 1;
    const div = (a: Attrib | undefined): number => Math.max(1, a?.divisor ?? 1);
    for (let n = 0; n < nInst; n++) {
      const a1 = d.attribs.get(1), a2 = d.attribs.get(2);
      const item = merge ? attr(d.attribs.get(5), Math.floor(n / div(d.attribs.get(5))), 1)![0]! : inst ? n % instN : 0;
      const at = (j: number): number[] => texel(d, base + item * L.n + j);
      const fixed = mclip ? fixedOf(at(L.clip)) : fixed0;
      const mvp = L.lite ? cols012(U, 'u_mvp0', at(0)) : inst ? [...at(0), ...at(1), ...at(2), ...at(3)] : f32(U.get('u_mvp'))!;
      const col = merge ? at(L.col) : f32(U.get('u_color'));
      const mvz = L.lite ? L.mvz(U, at) : inst ? at(4) : f32(U.get('u_mvz'));
      const p0 = attr(a1, Math.floor(n / div(a1)), 3)!, p1 = attr(a2, Math.floor(n / div(a2)), 3)!;
      out.push(`wide|${mode}|${state}|${fixed}|${JSON.stringify([mul4(mvp, p0[0]!, p0[1]!, p0[2]!), mul4(mvp, p1[0]!, p1[1]!, p1[2]!), col, FOG.test(vs) ? mvz : null])}`);
    }
    return;
  }
  if (vs.includes('layout(location=1) in vec4 a_col;') && vs.includes('layout(location=0) in vec3 a_pos;')) {
    // 가는 선: 정점마다 클립 좌표·색(0.60.0 묶음 단면 평면은 자리 자료 7번째 텍셀 — 선분의 두 끝은 같은 그물)
    const fixedOf = (clip: number[] | null): string => JSON.stringify([U.get('u_vcol'), U.get('u_alpha'), f32(U.get('u_override')), U.get('u_bias'), clip, f32(U.get('u_fogCol')), U.get('u_fog')]);
    const mclip = merge && MCLIP.test(vs);
    const L = lineLayout(vs, merge, mclip);
    let fixed = fixedOf(f32(U.get('u_clip')));
    const instN = (U.get('u_instN')?.[0] as number) ?? 1;
    const vl = verts();
    for (let n = 0; n < nInst; n++) {
      const seg: string[] = [];
      for (const v of vl) {
        const item = merge ? attr(d.attribs.get(5), v, 1)![0]! : inst ? n % instN : 0;
        const at = (j: number): number[] => texel(d, base + item * L.n + j);
        if (mclip) fixed = fixedOf(at(L.clip));
        const mvp = L.lite ? cols012(U, 'u_mvp0', at(0)) : inst ? [...at(0), ...at(1), ...at(2), ...at(3)] : f32(U.get('u_mvp'))!;
        const col = merge ? at(L.col) : f32(U.get('u_color'));
        const mvz = L.lite ? L.mvz(U, at) : inst ? at(4) : f32(U.get('u_mvz'));
        const P = attr(d.attribs.get(0), v, 3)!;
        seg.push(JSON.stringify([mul4(mvp, P[0]!, P[1]!, P[2]!), col, attr(d.attribs.get(1), v, 4), FOG.test(vs) ? mvz : null]));
        if (seg.length === 2) {
          out.push(`thin|${mode}|${state}|${fixed}|${seg.join(';')}`);
          seg.length = 0;
        }
      }
    }
    return;
  }
  if (vs.includes('layout(location=0) in vec3 a_pos;\nuniform mat4 u_mvp;') && !vs.includes('a_col')) {
    // 깊이만 그리는 프로그램(그림자 깊이·외곽선 색 PCOL): 정점마다 클립 좌표 — 조각 셰이더 균일 변수(u_pcol·단면)
    const fixed = JSON.stringify([f32(U.get('u_pcol')), f32(U.get('u_clip')), U.get('u_nclip'), f32(U.get('u_clips'))]);
    const mvp = f32(U.get('u_mvp'))!;
    const tri: string[] = [];
    for (const v of verts()) {
      const P = attr(d.attribs.get(0), v, 3)!;
      tri.push(JSON.stringify(mul4(mvp, P[0]!, P[1]!, P[2]!)));
      if (tri.length === 3) {
        out.push(`depth|${mode}|${state}|${fixed}|${tri.join(';')}`);
        tri.length = 0;
      }
    }
    return;
  }
  const rest = d.op.startsWith('drawElements') ? [d.args[1], gl.nameOf(d.args[2]!), ...d.args.slice(3)] : d.args.slice(1);
  out.push(`other|${d.op}|${mode}|${rest.join(',')}|${state}|${JSON.stringify([...U].filter(([k]) => !k.startsWith('u_inst')).sort())}`);
}

/** 그리기 하나(f)에서 펼친 도형 기록 전부(차례대로) */
export function expandFrame(gl: FakeGL, f: () => void): string[] {
  const out: string[] = [];
  gl.onDraw = (d) => expandDraw(gl, d, out);
  try {
    f();
  } finally {
    gl.onDraw = null;
  }
  return out;
}
