/**
 * 0.43.0 PBR 그림(법선·거칠기·금속 — SKP 40차 요청):
 * - 순수 계산(pbr.ts): 필드 정리(그림 id 차례·값 자르기), 올라간 그림만 쓰기, 거칠기·금속성 기본값(그림이 있으면 배율 1, 없으면 0.42.0 반사광·금속성 0), 반사광 지수
 * - 셰이더: PBR 정의가 없는 변종(예전 정의 10개의 부분 집합 1,024가지)은 전처리 뒤 0.42.0(e4780f4) 원본과 글자까지 같다(해시)
 * - 뷰어(가짜 WebGL2·가짜 그림 풀기): PBR 그림도 무늬 예산·stats.textures에 들고, 무늬 그림이 없어도 무늬 좌표를 올린다. 그물마다 맞는 변종(NMAP·PBR·UV)과
 *   균일 변수·무늬 단위 6·7·8, 다른 그물의 그리기는 PBR 필드가 없을 때와 같다. 끔(setRenderOptions({ pbr: false }))·무늬 없음 모드·색 바꾸기는 0.42.0 변종.
 *   나중에 주는 그림(pending) 여럿을 각각 기다리고 받고, 놓기(release) 뒤 문맥 복구에서 다시 받는다. 같은 그물 12자리는 PBR 변종으로 모아 그린다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type DrawEntry, type FakeGL, fnv } from './fakegl';
import { PBR_DEFAULT_ROUGHNESS, PBR_MAX_EXPONENT, pbrDefines, pbrNeedsUv, pbrSource, pbrState, pbrTextureIds, specExponent } from '../src/pbr';
import { MESH_FS, MESH_VS, withDefines } from '../src/shaders';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d, Texture3d } from '../src/types';
import { type ContextRestoreNeed, Viewer3d } from '../src/viewer';
import { plateMesh } from '../scripts/pixels/pbr';

// ───────────── 순수 계산 ─────────────
describe('PBR 필드 정리와 상태(pbr.ts)', () => {
  it('PBR 필드가 없으면 null, 그림 id는 따로 준 것이 금속·거칠기 그림보다 먼저, 값은 0~1로 자른다', () => {
    expect(pbrSource({})).toBeNull();
    expect(pbrSource({ normalScale: 2, normalFlipY: true, roughnessInvert: true })).toBeNull();
    expect(pbrSource({ roughness: Number.NaN })).toBeNull();
    const s = pbrSource({ normalTexture: 'n', metallicRoughnessTexture: 'mr', roughnessTexture: 'r', roughness: 1.5, metallic: -1 })!;
    expect(s).toEqual({ normal: 'n', rough: 'r', metal: 'mr', normalScale: 1, flipY: false, roughness: 1, metallic: 0, invert: false });
    expect(pbrSource({ metallicRoughnessTexture: 'mr' })).toMatchObject({ rough: 'mr', metal: 'mr', roughness: null, metallic: null });
    expect(pbrSource({ metallic: 0.5 })).toMatchObject({ normal: null, rough: null, metal: null, metallic: 0.5 });
    expect(pbrTextureIds(pbrSource({ normalTexture: 'a', metallicRoughnessTexture: 'b' }))).toEqual(['a', 'b']);
    expect(pbrTextureIds(pbrSource({ normalTexture: 'a', roughnessTexture: 'a', metallicTexture: 'c' }))).toEqual(['a', 'c']);
    expect(pbrTextureIds(null)).toEqual([]);
    expect(pbrNeedsUv({ roughness: 0.3 })).toBe(false);
    expect(pbrNeedsUv({ normalTexture: 'n' })).toBe(true);
  });

  it('올라간 그림만 쓴다 — 거칠기·금속성은 그림이 있으면 배율(기본 1), 없으면 값(기본 0.42.0 반사광 √0.2·금속성 0)', () => {
    const all = (): boolean => true;
    const none = (): boolean => false;
    const s = pbrSource({ normalTexture: 'n', normalScale: 0.5, normalFlipY: true, metallicRoughnessTexture: 'mr', roughnessInvert: true })!;
    expect(pbrState(s, all, true)).toEqual({ normal: 'n', scale: [0.5, -0.5], rough: 'mr', metal: 'mr', factors: [1, 1, 1], lit: true });
    // 무늬 좌표가 없으면 그림은 못 쓴다(값도 없으므로 null — 0.42.0)
    expect(pbrState(s, all, false)).toBeNull();
    // 그림이 아직이면 없는 것처럼
    expect(pbrState(s, none, true)).toBeNull();
    expect(pbrState(s, (id) => id === 'n', true)).toEqual({ normal: 'n', scale: [0.5, -0.5], rough: null, metal: null, factors: [PBR_DEFAULT_ROUGHNESS, 0, 0], lit: false });
    // 값만: 그림 없이 빛 식만
    const v = pbrSource({ roughness: 0.3, metallic: 1 })!;
    expect(pbrState(v, none, false)).toEqual({ normal: null, scale: [1, 1], rough: null, metal: null, factors: [0.3, 1, 0], lit: true });
    // 금속성만 주면 거칠기는 0.42.0 반사광 퍼짐
    expect(pbrState(pbrSource({ metallic: 0.2 }), none, false)!.factors).toEqual([PBR_DEFAULT_ROUGHNESS, 0.2, 0]);
    // 그림 + 값: 값이 배율, 뒤집기는 거칠기 그림이 있을 때만
    const g = pbrSource({ roughnessTexture: 'r', roughness: 0.5, metallic: 0.25, roughnessInvert: true })!;
    expect(pbrState(g, all, true)!.factors).toEqual([0.5, 0.25, 1]);
    expect(pbrState(g, none, true)!.factors).toEqual([0.5, 0.25, 0]);
    expect(pbrDefines(null)).toEqual([]);
    expect(pbrDefines(pbrState(s, all, true))).toEqual(['UV', 'NMAP', 'PBR']);
    expect(pbrDefines(pbrState(s, (id) => id === 'n', true))).toEqual(['UV', 'NMAP']);
    expect(pbrDefines(pbrState(v, none, false))).toEqual(['UV', 'PBR']);
  });

  it('반사광 지수: α = r², 2/α² − 2 — 기본 거칠기는 0.42.0 지수 48, 아주 거칠면 0, 아주 매끈하면 상한', () => {
    expect(specExponent(PBR_DEFAULT_ROUGHNESS)).toBeCloseTo(48, 9);
    expect(specExponent(1)).toBe(0);
    expect(specExponent(0)).toBe(PBR_MAX_EXPONENT);
    expect(specExponent(0.5)).toBeCloseTo(30, 9);
    expect(specExponent(2)).toBe(0);
  });
});

// ───────────── 셰이더 ─────────────
/** #ifdef·#ifndef·#if defined(A) || defined(B)·#else·#endif를 정의 여부대로 펼친다 */
function preprocess(src: string, defs: readonly string[]): string {
  const out: string[] = [];
  const stack: boolean[] = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    let m: RegExpExecArray | null;
    if ((m = /^#if(n?)def (\w+)$/.exec(t))) stack.push(defs.includes(m[2]!) !== (m[1] === 'n'));
    else if ((m = /^#if (defined\(\w+\)(?: \|\| defined\(\w+\))*)$/.exec(t))) stack.push([...m[1]!.matchAll(/defined\((\w+)\)/g)].some((x) => defs.includes(x[1]!)));
    else if (t === '#else') stack.push(!stack.pop());
    else if (t === '#endif') stack.pop();
    else if (/^#define \w+$/.test(t)) continue;
    else if (stack.every(Boolean)) out.push(line);
  }
  expect(stack).toEqual([]);
  return out.join('\n');
}
const LEGACY = ['CLIP', 'CLIPN', 'TEX', 'SUN', 'SHADOW', 'FOG', 'BACK', 'BACKTEX', 'FLAT', 'INST'];
const hashAll = (src: string): string => {
  const parts: string[] = [];
  for (let k = 0; k < 1 << LEGACY.length; k++) {
    const defs = LEGACY.filter((_, i) => k & (1 << i));
    parts.push(preprocess(withDefines(src, ...defs), defs));
  }
  return fnv(new TextEncoder().encode(parts.join('\n\u0000\n')));
};

describe('그물 셰이더 변종(0.43.0 UV·NMAP·PBR)', () => {
  it('PBR 정의가 없는 변종은 전처리 뒤 0.42.0 원본과 글자까지 같다(예전 정의 10개의 부분 집합 1,024가지 — e4780f4에서 같은 식으로 잰 해시)', () => {
    expect(hashAll(MESH_VS)).toBe('b804fbcf');
    expect(hashAll(MESH_FS)).toBe('381a85af');
  });

  it('PBR 정의가 있으면 무늬 좌표·법선 그림·거칠기·금속 그림 줄이 들어간다', () => {
    const vs = preprocess(withDefines(MESH_VS, 'UV'), ['UV']);
    expect(vs).toContain('layout(location=3) in vec3 a_uv;');
    const fs = preprocess(withDefines(MESH_FS, 'UV', 'NMAP', 'PBR', 'SUN'), ['UV', 'NMAP', 'PBR', 'SUN']);
    for (const s of ['uniform sampler2D u_nmap;', 'uniform sampler2D u_rough;', 'uniform sampler2D u_metal;', 'texture(u_rough, puv).g', 'texture(u_metal, puv).b', 'u_sunCol * (s2 * nl)'])
      expect(fs).toContain(s);
    // 뒷면 변종과 함께면 뒷면 재질 쪽은 쓰지 않는다
    expect(preprocess(withDefines(MESH_FS, 'UV', 'PBR', 'BACK', 'BACKTEX'), ['UV', 'PBR', 'BACK', 'BACKTEX'])).toContain('pbrSide = false;');
  });
});

// ───────────── 뷰어(가짜 WebGL2) ─────────────
interface FakeBitmap {
  width: number;
  height: number;
  tag: string;
  closed: boolean;
  close(): void;
}
const fakeBitmap = (tag: string, width: number, height: number): FakeBitmap => ({
  width,
  height,
  tag,
  closed: false,
  close() {
    this.closed = true;
  },
});
let dom: ReturnType<typeof installDom>;
const g = globalThis as Record<string, unknown>;
let savedCib: unknown;
const decoded: string[] = [];
beforeAll(() => {
  dom = installDom();
  savedCib = g.createImageBitmap;
  g.createImageBitmap = async (src: unknown, o?: ImageBitmapOptions): Promise<FakeBitmap> => {
    if (src instanceof Blob) {
      const b = new Uint8Array(await src.arrayBuffer());
      const tag = new TextDecoder().decode(b);
      decoded.push(tag);
      return fakeBitmap(tag, o?.resizeWidth ?? 64, o?.resizeHeight ?? 64);
    }
    const s = src as FakeBitmap;
    if (s.closed) throw new Error('닫힌 그림');
    decoded.push(s.tag);
    return fakeBitmap(s.tag, o?.resizeWidth ?? s.width, o?.resizeHeight ?? s.height);
  };
});
const views: Viewer3d[] = [];
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  g.createImageBitmap = savedCib;
  dom.restore();
});

/** 그림 바이트 = 이름 글자(가짜 풀기가 그대로 꼬리표로 쓴다), 256 화소 */
const img = (id: string, o: Partial<Texture3d> = {}): Texture3d => ({ id, data: new TextEncoder().encode(id), mime: 'image/png', width: 256, height: 256, ...o });
/** 그물 색(그리기 기록에서 그물을 가린다) */
const COL = { box: [0.3, 0.4, 0.5, 1], a: [0.61, 0.62, 0.63, 1], b: [0.71, 0.72, 0.73, 1], c: [0.81, 0.82, 0.83, 1] } as const;

/**
 * 상자(0.42.0 그물), 판 a(법선 그림만 — 무늬 그림 없음), 판 b(무늬 + 법선 + 금속 거칠기, 뒷면 색), 판 c(값만 — 금속)
 */
function scene(o: { pbr?: boolean; pending?: boolean } = {}): Scene3d {
  const pbr = o.pbr !== false;
  const pend = (id: string): Texture3d => (o.pending ? { id, pending: true, width: 256, height: 256 } : img(id));
  const a: Mesh3d = { ...plateMesh('a', [-150, 0, 0], 100, COL.a), ...(pbr ? { normalTexture: 'nrm', normalScale: 0.75 } : {}) };
  const b: Mesh3d = {
    ...plateMesh('b', [0, 0, 0], 100, COL.b),
    texture: 'chk',
    backColor: [0.9, 0.1, 0.1, 1],
    ...(pbr ? { normalTexture: 'nrm', metallicRoughnessTexture: 'mr', roughness: 0.5 } : {}),
  };
  const c: Mesh3d = { ...plateMesh('c', [150, 0, 0], 100, COL.c), ...(pbr ? { metallic: 1, roughness: 0.2 } : {}) };
  return { name: 'pbr', units: 'mm', meshes: [boxMesh('box', [-40, 120, 0], [40, 200, 60], [...COL.box] as unknown as Mesh3d['color']), a, b, c], lines: [], textures: [img('chk'), pend('nrm'), pend('mr')] };
}

type W = { v: Viewer3d; gl: FakeGL };
function view(sc: Scene3d, opts: { textureBudget?: number } = {}, set: Parameters<Viewer3d['setScene']>[1] = {}): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded', viewCube: false, ...opts });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  gl.logDraws = true;
  gl.logTextures = true;
  v.setScene(sc, set);
  return { v, gl };
}
/** 그리기 때 무늬 단위 unit에 묶인 그림 꼬리표(가짜 문맥 상수는 이름마다 수라 TEXTURE0 + unit의 이름으로 찾는다) */
function unitTag(w: W, e: DrawEntry, unit: number): string | undefined {
  const v = (w.gl as unknown as Record<string, number>).TEXTURE0! + unit;
  const name = w.gl.nameOf(v) ?? String(v);
  return e.tex
    ?.split(',')
    .find((x) => x.startsWith(`${name}:`))
    ?.slice(name.length + 1);
}
const noTex = (d: DrawEntry[]): DrawEntry[] => d.map((e) => ({ ...e, tex: undefined }));
async function until(cond: () => boolean, ms = 10_000): Promise<void> {
  const end = performance.now() + ms;
  while (!cond()) {
    if (performance.now() > end) throw new Error('기다림 시간을 넘었습니다');
    await new Promise((r) => setTimeout(r, 1));
  }
}
function frame(w: W): DrawEntry[] {
  w.gl.draws = [];
  w.v.renderNow();
  return w.gl.draws;
}
function uni(e: DrawEntry, name: string): unknown[] | undefined {
  return new Map(JSON.parse(e.uniforms) as [string, unknown[]][]).get(name);
}
/** 그 색으로 그린 면 그리기(그물 하나) */
const drawOf = (d: DrawEntry[], c: readonly number[]): DrawEntry[] =>
  d.filter((e) => (e.op === 'drawElements' || e.op === 'drawArrays' || e.op === 'drawElementsInstanced') && JSON.stringify(uni(e, 'u_color')) === JSON.stringify(c));
const pbrKind = (e: DrawEntry): string => ['u_nscale', 'u_pbr'].filter((k) => uni(e, k) !== undefined).join('+') || 'legacy';
const lose = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextlost', {});
const restore = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextrestored', {});

describe('뷰어의 PBR 그림(0.43.0)', () => {
  it('PBR 그림도 무늬로 풀어 올리고(stats.textures·예산), 그물마다 맞는 변종·균일 변수·무늬 단위로 그린다', async () => {
    const w = view(scene());
    await until(() => w.v.stats.textures.ready === 3);
    expect(w.v.stats.textures).toMatchObject({ count: 3, ready: 3, failed: 0, missing: 0 });
    const d = frame(w);
    const [a] = drawOf(d, COL.a), [c] = drawOf(d, COL.c);
    const bs = drawOf(d, COL.b);
    expect(pbrKind(a!)).toBe('u_nscale');
    expect(uni(a!, 'u_nscale')).toEqual([0.75, 0.75]);
    expect(uni(a!, 'u_nmap')).toEqual([6]);
    expect(unitTag(w, a!, 6)).toBe('nrm');
    expect(uni(a!, 'u_uvq')).toEqual([0]);
    expect(pbrKind(bs[0]!)).toBe('u_nscale+u_pbr');
    expect(uni(bs[0]!, 'u_pbr')).toEqual([0.5, 1, 0]);
    expect(uni(bs[0]!, 'u_rough')).toEqual([7]);
    expect(uni(bs[0]!, 'u_metal')).toEqual([8]);
    expect([unitTag(w, bs[0]!, 0), unitTag(w, bs[0]!, 6), unitTag(w, bs[0]!, 7), unitTag(w, bs[0]!, 8)]).toEqual(['chk', 'nrm', 'mr', 'mr']);
    // 뒷면 색과 함께(BACK 변종) — 뒷면 균일 변수도
    expect(uni(bs[0]!, 'u_backColor')).toBeDefined();
    expect(pbrKind(c!)).toBe('u_pbr');
    expect(uni(c!, 'u_pbr')).toEqual([0.2, 1, 0]);
    // 그림 없는 쪽은 흰 1화소 그림(가짜 문맥에서는 9인자 texImage2D → 'empty' 꼬리표)
    expect([unitTag(w, c!, 7), unitTag(w, c!, 8)]).toEqual(['empty', 'empty']);
    // 상자(PBR 필드 없음)는 0.42.0 변종
    expect(pbrKind(drawOf(d, COL.box)[0]!)).toBe('legacy');
  });

  it('무늬 그림이 없어도 PBR 그림이 있으면 무늬 좌표를 올린다(PBR 필드가 없으면 0.42.0처럼 올리지 않는다)', () => {
    const on = view(scene());
    const off = view(scene({ pbr: false }));
    // 판 a·b의 무늬 좌표(판 b는 무늬 그림이 있어 늘 올린다 — a만 다르다: 정점 4 × 2값 × 4바이트)
    expect(on.v.stats.buffers.uvs - off.v.stats.buffers.uvs).toBe(4 * 2 * 4);
  });

  it('PBR 필드가 없는 그물의 그리기는 PBR 그물이 있어도 같다 — 끔·무늬 없음·단색·숨은 선·색 바꾸기는 0.42.0 변종', async () => {
    const w = view(scene());
    const o = view(scene({ pbr: false }));
    await until(() => w.v.stats.textures.ready === 3 && o.v.stats.textures.ready === 1);
    const d = frame(w), e = frame(o);
    expect(noTex(drawOf(d, COL.box))).toEqual(noTex(drawOf(e, COL.box)));
    // 끄면 PBR 그물도 0.42.0 변종(프로그램이 같다 — 판 a는 무늬 좌표 속성만 더 묶여 있다)
    w.v.setRenderOptions({ pbr: false });
    expect(w.v.renderOptions.pbr).toBe(false);
    const f = frame(w);
    for (const col of [COL.a, COL.b, COL.c]) {
      const x = drawOf(f, col), y = drawOf(e, col);
      expect(x.map(pbrKind)).toEqual(x.map(() => 'legacy'));
      expect(x.map((q) => q.prog)).toEqual(y.map((q) => q.prog));
      expect(x.map((q) => q.uniforms)).toEqual(y.map((q) => q.uniforms));
    }
    w.v.setRenderOptions({ pbr: true });
    for (const mode of ['noTexture', 'monochrome', 'hiddenLine'] as const) {
      w.v.setRenderMode(mode);
      const m = frame(w).filter((q) => q.op === 'drawElements');
      expect(m.some((q) => pbrKind(q) !== 'legacy')).toBe(false);
    }
    w.v.setRenderMode('shaded');
    w.v.setItemColor('a', '#ff0000');
    const h = frame(w);
    const red = h.filter((q) => q.op === 'drawElements' && JSON.stringify(uni(q, 'u_color')) === JSON.stringify([1, 0, 0, 1]));
    expect(red.length).toBe(1);
    expect(pbrKind(red[0]!)).toBe('legacy');
    expect(pbrKind(drawOf(h, COL.b)[0]!)).toBe('u_nscale+u_pbr');
    // X-ray(반투명 차례)에서도 쓴다
    w.v.clearItemLooks();
    w.v.setRenderMode('xray');
    expect(pbrKind(drawOf(frame(w), COL.c)[0]!)).toBe('u_pbr');
  });

  it('전체 예산을 넘으면 PBR 그림도 같은 비로 줄인다(무늬 그림과 한 예산)', async () => {
    // 256² 셋(밉맵 포함 어림)의 ¼ 예산 → 긴 변 반
    const w = view(scene(), { textureBudget: 3 * 128 * 128 * 4 * (4 / 3) });
    await until(() => w.v.stats.textures.ready === 3);
    const sides = ['chk', 'nrm', 'mr'].map((id) => (w.v as unknown as { renderer: { textures: Map<string, { side: number }> } }).renderer.textures.get(id)!.side);
    expect(sides).toEqual([128, 128, 128]);
  });

  it('나중에 주는 그림(pending) 여럿을 각각 기다리고 받는다 — 받은 것부터 쓴다', async () => {
    decoded.length = 0;
    const w = view(scene({ pending: true }));
    await until(() => w.v.stats.textures.ready === 1);
    expect(w.v.stats.textures).toMatchObject({ count: 3, ready: 1, missing: 2 });
    expect(w.v.restoreNeed).toEqual({ meshes: [], textures: ['nrm', 'mr'] });
    expect(decoded).toEqual(['chk']);
    // 기다리는 동안: 판 a는 0.42.0, 판 b는 금속·거칠기 그림 없이 값(거칠기 0.5)만, 판 c는 값
    let d = frame(w);
    expect(pbrKind(drawOf(d, COL.a)[0]!)).toBe('legacy');
    expect(pbrKind(drawOf(d, COL.b)[0]!)).toBe('u_pbr');
    expect(uni(drawOf(d, COL.b)[0]!, 'u_pbr')).toEqual([0.5, 0, 0]);
    expect(await w.v.restoreTexture('nrm', fakeBitmap('nrm2', 64, 64) as unknown as ImageBitmap)).toBe(true);
    expect(w.v.restoreNeed).toEqual({ meshes: [], textures: ['mr'] });
    d = frame(w);
    expect(pbrKind(drawOf(d, COL.a)[0]!)).toBe('u_nscale');
    expect(unitTag(w, drawOf(d, COL.a)[0]!, 6)).toBe('nrm2');
    expect(uni(drawOf(d, COL.b)[0]!, 'u_pbr')).toEqual([0.5, 0, 0]);
    expect(await w.v.restoreTexture('mr', new TextEncoder().encode('mr2'))).toBe(true);
    expect(w.v.restoreNeed).toBeNull();
    d = frame(w);
    // 금속·거칠기 그림이 오면 금속성 배율 1(glTF metallicFactor 기본)
    expect(uni(drawOf(d, COL.b)[0]!, 'u_pbr')).toEqual([0.5, 1, 0]);
    expect(unitTag(w, drawOf(d, COL.b)[0]!, 7)).toBe('mr2');
    expect(w.v.stats.textures).toMatchObject({ count: 3, ready: 3, missing: 0 });
  });

  it('놓기(release) 뒤 문맥을 잃었다 되찾으면 PBR 그림과 무늬 그림이 없는 판의 무늬 좌표도 다시 받는다', async () => {
    const s = scene();
    const w = view(s, {}, { release: true });
    await until(() => w.v.stats.textures.ready === 3);
    // 코어가 원본을 놓았다(PBR 그림 바이트·판 a 무늬 좌표)
    expect(s.textures!.map((t) => !!t.data)).toEqual([false, false, false]);
    expect(s.meshes[1]!.uvs).toBeUndefined();
    const needs: ContextRestoreNeed[] = [];
    w.v.onContextRestore((n) => void needs.push(n));
    lose(w.v);
    restore(w.v);
    expect([...needs[0]!.textures].sort()).toEqual(['chk', 'mr', 'nrm']);
    expect(needs[0]!.meshes.find((m) => m.id === 'a')).toMatchObject({ uvs: true });
    // 다시 주기 전에는 판 a를 0.42.0으로 그린다
    expect(pbrKind(drawOf(frame(w), COL.a)[0]!)).toBe('legacy');
    const src = scene();
    for (const m of src.meshes) w.v.restoreMeshArrays(m.id, { normals: m.normals, uvs: m.uvs });
    for (const t of src.textures!) expect(await w.v.restoreTexture(t.id, t.data!)).toBe(true);
    expect(w.v.restoreNeed).toBeNull();
    expect(pbrKind(drawOf(frame(w), COL.a)[0]!)).toBe('u_nscale');
  });

  it('같은 PBR 그물 12자리는 PBR 인스턴싱 변종으로 모아 그리고, 색을 바꾼 자리는 PBR 없이 따로 묶인다', async () => {
    const s = scene();
    const b = s.meshes[2]!;
    const meshes: Mesh3d[] = [];
    for (let i = 0; i < 12; i++) meshes.push({ ...b, id: `b${i}`, backColor: undefined, matrix: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i * 120, 300, 0, 1]) });
    const w = view({ ...s, meshes: [...s.meshes, ...meshes] });
    await until(() => w.v.stats.textures.ready === 3);
    w.v.setItemColor('b3', '#00ff00');
    const d = frame(w);
    const inst = d.filter((e) => e.op === 'drawElementsInstanced');
    expect(inst.map((e) => e.args[4]).sort()).toEqual([1, 11]);
    const big = inst.find((e) => e.args[4] === 11)!;
    expect(pbrKind(big)).toBe('u_nscale+u_pbr');
    expect(uni(big, 'u_pbr')).toEqual([0.5, 1, 0]);
    expect(unitTag(w, big, 6)).toBe('nrm');
    expect(pbrKind(inst.find((e) => e.args[4] === 1)!)).toBe('legacy');
    expect(w.v.stats.instanced.items).toBe(12);
  });
});
