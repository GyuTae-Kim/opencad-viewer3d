/**
 * 0.102.0 PBR 가림(AO) 그림(SKP 코어 요청 — glTF 2.0 occlusionTexture·strength, SketchUp 2025 재질 occlusion_texture·occlusionStrength):
 * - 순수 계산(pbr.ts): 필드 정리(무늬 id·세기 0~1 — 0이면 주지 않은 것), 올라간 그림만 쓰기, 변종 정의 OCC. 가림 칸이 없는 그물의 정리 결과는 0.101.0과 글자까지 같다
 * - 셰이더: OCC 변종만 원본 글을 바꿔 만든다(withOcclusion) — 간접광(고정 조명 바닥 0.30·해 조명 u_amb·금속이 되비추는 몫)에만 mix(1, 가림, 세기)를 곱하고
 *   해·보조광의 확산·반사광은 그대로, 뒷면 재질 쪽은 가림 1(PBR 그림과 같은 조건)
 * - 뷰어(가짜 WebGL2·가짜 그림 풀기): 가림 그림이 있으면 OCC 변종·무늬 단위 11·u_occStr, 세기 0·글 아닌 id는 가림 칸이 없는 장면과 그리기가 같고,
 *   장면에 없는 id·기다리는(pending) 그림은 가림 없음, restoreTexture·setTexture·문맥 복구로 나중에 온 그림도 같은 길, 인스턴싱·X-ray도. 끔·무늬 없음·단색·숨은 선·색 바꾸기는 쓰지 않는다.
 *   유한하지 않은 세기는 장면 알림 material(기본 1)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { PBR_DEFAULT_ROUGHNESS, pbrDefines, pbrNeedsUv, pbrSource, pbrState, pbrTextureIds } from '../src/pbr';
import { MESH_FS, withDefines, withOcclusion } from '../src/shaders';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d, Texture3d } from '../src/types';
import { type ContextRestoreNeed, Viewer3d } from '../src/viewer';
import { plateMesh } from '../scripts/pixels/pbr';

const all = (): boolean => true;
const none = (): boolean => false;

// ───────────── 순수 계산 ─────────────
describe('가림 그림 필드 정리와 상태(pbr.ts 0.102.0)', () => {
  it('occlusionTexture만 주어도 PBR 필드 — 세기 기본 1, 0~1로 자르고 유한하지 않거나 수가 아니면 1, 0 이하면 가림 칸을 넣지 않는다', () => {
    expect(pbrSource({ occlusionTexture: 'ao' })).toEqual({
      normal: null,
      rough: null,
      metal: null,
      normalScale: 1,
      flipY: false,
      roughness: null,
      metallic: null,
      invert: false,
      occ: 'ao',
      occStrength: 1,
    });
    const k = (x: unknown): number | undefined => pbrSource({ occlusionTexture: 'ao', occlusionStrength: x as number })?.occStrength;
    expect([k(0.25), k(1.5), k(Number.NaN), k(Number.POSITIVE_INFINITY), k('0.5'), k(null), k(undefined)]).toEqual([0.25, 1, 1, 1, 1, 1, 1]);
    // 세기 0(·음수는 0으로 자름)은 가림 그림을 주지 않은 것 — 다른 필드가 없으면 null
    expect(pbrSource({ occlusionTexture: 'ao', occlusionStrength: 0 })).toBeNull();
    expect(pbrSource({ occlusionTexture: 'ao', occlusionStrength: -1 })).toBeNull();
    expect('occ' in pbrSource({ normalTexture: 'n', occlusionTexture: 'ao', occlusionStrength: 0 })!).toBe(false);
    // 글이 아니거나 빈 id는 다른 PBR 그림 칸처럼 없는 것, 세기만은 PBR 필드가 아니다
    expect(pbrSource({ occlusionTexture: 5 as unknown as string })).toBeNull();
    expect(pbrSource({ occlusionTexture: '' })).toBeNull();
    expect(pbrSource({ occlusionStrength: 0.5 })).toBeNull();
  });

  it('가림 칸이 없는 그물의 정리 결과는 0.101.0과 글자까지 같다(같은 그물 열쇠 geo)', () => {
    expect(JSON.stringify(pbrSource({ normalTexture: 'n', metallic: 0.5 }))).toBe(
      '{"normal":"n","rough":null,"metal":null,"normalScale":1,"flipY":false,"roughness":null,"metallic":0.5,"invert":false}',
    );
  });

  it('그림 id 목록·무늬 좌표: 가림 그림도 든다(같은 그림을 여러 칸에 — glTF ORM 한 장 — 쓰면 한 번)', () => {
    expect(pbrTextureIds(pbrSource({ normalTexture: 'n', occlusionTexture: 'ao' }))).toEqual(['n', 'ao']);
    expect(pbrTextureIds(pbrSource({ metallicRoughnessTexture: 'orm', occlusionTexture: 'orm' }))).toEqual(['orm']);
    expect(pbrTextureIds(pbrSource({ occlusionTexture: 'ao', occlusionStrength: 0 }))).toEqual([]);
    expect(pbrNeedsUv({ occlusionTexture: 'ao' })).toBe(true);
    expect(pbrNeedsUv({ occlusionTexture: 'ao', occlusionStrength: 0 })).toBe(false);
  });

  it('올라간 가림 그림만 쓴다 — 변종 정의는 다른 PBR 정의 뒤에 OCC(가림이 없으면 0.101.0 정의 그대로)', () => {
    const s = pbrSource({ occlusionTexture: 'ao', occlusionStrength: 0.5 })!;
    expect(pbrState(s, all, true)).toEqual({ normal: null, scale: [1, 1], rough: null, metal: null, factors: [PBR_DEFAULT_ROUGHNESS, 0, 0], lit: false, occ: 'ao', occStrength: 0.5 });
    expect(pbrState(s, none, true)).toBeNull();
    expect(pbrState(s, all, false)).toBeNull();
    expect(pbrDefines(pbrState(s, all, true))).toEqual(['UV', 'OCC']);
    const orm = pbrSource({ normalTexture: 'n', metallicRoughnessTexture: 'orm', occlusionTexture: 'orm' })!;
    expect(pbrDefines(pbrState(orm, all, true))).toEqual(['UV', 'NMAP', 'PBR', 'OCC']);
    const onlyN = pbrState(orm, (id) => id === 'n', true)!;
    expect('occ' in onlyN).toBe(false);
    expect(pbrDefines(onlyN)).toEqual(['UV', 'NMAP']);
    // 값만 + 아직 오지 않은 가림 그림: 0.101.0 값 빛 식
    expect(pbrDefines(pbrState(pbrSource({ metallic: 1, occlusionTexture: 'ao' }), none, true))).toEqual(['UV', 'PBR']);
  });
});

// ───────────── 셰이더 ─────────────
/** #ifdef·#ifndef·#if defined(A) || defined(B)·#else·#endif를 정의 여부대로 펼친다(v0430pbr과 같은 도우미) */
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
const occFs = (...defs: string[]): string => preprocess(withOcclusion(withDefines(MESH_FS, 'UV', ...defs, 'OCC')), ['UV', ...defs, 'OCC']);
const READ = 'float pOcc = mix(1.0, texture(u_occ, v_uv.xy / v_uv.z).r, u_occStr);';

describe('가림 변종 셰이더(withOcclusion)', () => {
  it('정의 조합마다 글을 바꿀 수 있고(바꿀 자리를 늘 찾는다) 가림 그림 읽기가 버리기 앞에 든다', () => {
    const OPT = ['CLIP', 'SUN', 'SHADOW', 'FOG', 'BACK', 'BACKTEX', 'TEX', 'INST', 'NMAP', 'PBR', 'FLAT'];
    for (let k = 0; k < 1 << OPT.length; k++) {
      const defs = OPT.filter((_, i) => k & (1 << i));
      const fs = occFs(...defs);
      expect(fs).toContain('uniform sampler2D u_occ;');
      expect(fs).toContain(READ);
      if (defs.includes('CLIP')) expect(fs.indexOf(READ)).toBeLessThan(fs.indexOf('if (v_clip > 0.0) discard;'));
    }
    // 원본 글에는 가림 줄이 없다(가림 그림이 없는 길의 셰이더 원본은 0.101.0 그대로)
    expect(MESH_FS).not.toContain('pOcc');
    expect(MESH_FS).not.toContain('OCC');
  });

  it('간접광에만 곱한다 — 고정 조명 바닥 0.30·해 조명 u_amb·금속이 되비추는 몫. 확산(L1·L2·해)·반사광은 그대로', () => {
    const fixed = occFs('PBR');
    expect(fixed).toContain('float dif = 0.30 * pOcc + 0.60 * max(dot(n, L1), 0.0) + 0.20 * max(dot(n, L2), 0.0);');
    expect(fixed).toContain('float spec = pow(max(dot(n, normalize(L1 + V)), 0.0), 48.0) * 0.2;');
    expect(fixed).toContain('c = base.rgb * ((1.0 - mtl) * dif + mtl * 0.30 * pOcc) + f0 * (0.60 * s1 * max(dot(n, L1), 0.0) + 0.20 * s1b * max(dot(n, L2), 0.0));');
    const sun = occFs('SUN', 'PBR');
    expect(sun).toContain('c = base.rgb * (vec3(u_amb * pOcc) + u_sunCol * nl) + vec3(spec);');
    expect(sun).toContain('c = base.rgb * ((1.0 - mtl) * (vec3(u_amb * pOcc) + u_sunCol * nl) + mtl * vec3(u_amb * pOcc)) + f0 * u_sunCol * (s2 * nl);');
    expect(sun).not.toContain('vec3(u_amb)');
    expect(sun.split('pOcc').length - 1).toBe(6);
  });

  it('뒷면 재질 쪽(뒷면 무늬·뒷면 색)은 가림 1 — PBR 그림의 pbrSide와 같은 조건', () => {
    expect(occFs('BACK', 'BACKTEX')).toContain('    pOcc = 1.0;');
    expect(occFs('BACK')).toContain('    if (u_backColor.a >= 0.0) pOcc = 1.0;');
    expect(occFs()).not.toContain('gl_FrontFacing');
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
beforeAll(() => {
  dom = installDom();
  savedCib = g.createImageBitmap;
  g.createImageBitmap = async (src: unknown, o?: ImageBitmapOptions): Promise<FakeBitmap> => {
    if (src instanceof Blob) return fakeBitmap(new TextDecoder().decode(new Uint8Array(await src.arrayBuffer())), o?.resizeWidth ?? 64, o?.resizeHeight ?? 64);
    const s = src as FakeBitmap;
    if (s.closed) throw new Error('닫힌 그림');
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

const img = (id: string, o: Partial<Texture3d> = {}): Texture3d => ({ id, data: new TextEncoder().encode(id), mime: 'image/png', width: 256, height: 256, ...o });
const COL = { box: [0.3, 0.4, 0.5, 1], a: [0.61, 0.62, 0.63, 1], b: [0.71, 0.72, 0.73, 1], c: [0.81, 0.82, 0.83, 1] } as const;
/** 가림 그림 무늬 단위(0~4 그리기·5 인스턴싱·6~8 PBR·9 화면 가림·10 묶음 자리 자료 저장소 다음) */
const OCC_UNIT = 11;

type Occ = 'on' | 'off' | 'zero' | 'bad-id' | 'missing' | 'pending' | 'nan';
/**
 * 상자(PBR 없음), 판 a(가림 그림만 — 무늬 그림 없음), 판 b(무늬 + 법선 + 금속 거칠기 + 가림 세기 0.5, 뒷면 색), 판 c(값만 — 금속, 가림 세기 2 → 1).
 * 무늬 목록은 모든 꼴에서 같다(쓰지 않는 'ao'는 올리지 않는다)
 */
function scene(occ: Occ = 'on'): Scene3d {
  const id = occ === 'missing' ? 'nope' : occ === 'bad-id' ? (5 as unknown as string) : 'ao';
  const o = (strength?: number): Partial<Mesh3d> =>
    occ === 'off' ? {} : { occlusionTexture: id, ...(occ === 'zero' ? { occlusionStrength: 0 } : occ === 'nan' ? { occlusionStrength: Number.NaN } : strength !== undefined ? { occlusionStrength: strength } : {}) };
  const a: Mesh3d = { ...plateMesh('a', [-150, 0, 0], 100, COL.a), ...o() };
  const b: Mesh3d = { ...plateMesh('b', [0, 0, 0], 100, COL.b), texture: 'chk', backColor: [0.9, 0.1, 0.1, 1], normalTexture: 'nrm', metallicRoughnessTexture: 'mr', roughness: 0.5, ...o(0.5) };
  const c: Mesh3d = { ...plateMesh('c', [150, 0, 0], 100, COL.c), metallic: 1, roughness: 0.2, ...o(2) };
  const ao = occ === 'pending' ? { id: 'ao', pending: true, width: 256, height: 256 } : img('ao');
  return { name: 'occ', units: 'mm', meshes: [boxMesh('box', [-40, 120, 0], [40, 200, 60], [...COL.box] as unknown as Mesh3d['color']), a, b, c], lines: [], textures: [img('chk'), img('nrm'), img('mr'), ao] };
}

type W = { v: Viewer3d; gl: FakeGL };
function view(sc: Scene3d, set: Parameters<Viewer3d['setScene']>[1] = {}): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  gl.logDraws = true;
  gl.logTextures = true;
  v.setScene(sc, set);
  return { v, gl };
}
function unitTag(w: W, e: DrawEntry, unit: number): string | undefined {
  const v = (w.gl as unknown as Record<string, number>).TEXTURE0! + unit;
  const name = w.gl.nameOf(v) ?? String(v);
  return e.tex
    ?.split(',')
    .find((x) => x.startsWith(`${name}:`))
    ?.slice(name.length + 1);
}
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
const drawOf = (d: DrawEntry[], c: readonly number[]): DrawEntry[] =>
  d.filter((e) => (e.op === 'drawElements' || e.op === 'drawArrays' || e.op === 'drawElementsInstanced') && JSON.stringify(uni(e, 'u_color')) === JSON.stringify(c));
const occOf = (e: DrawEntry | undefined): unknown[] | undefined => (e ? uni(e, 'u_occStr') : undefined);
/** 렌더러가 번역한 그물 변종 글(열쇠 → [정점, 조각]) */
function meshVariants(w: W): Map<string, [string, string]> {
  const r = (w.v as unknown as { renderer: { variants: Map<string, { p: { shaders: { src: string }[] } }> } }).renderer;
  const out = new Map<string, [string, string]>();
  for (const [k, p] of r.variants) if (k.startsWith('mesh:')) out.set(k, [p.p.shaders[0]!.src, p.p.shaders[1]!.src]);
  return out;
}
const ready = (w: W, n: number): Promise<void> => until(() => w.v.stats.textures.ready === n);
const lose = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextlost', {});
const restore = (v: Viewer3d): void => (v.canvas as unknown as FakeElement).fire('webglcontextrestored', {});

describe('뷰어의 가림 그림(0.102.0)', () => {
  it('가림 그림을 무늬로 올리고 OCC 변종·무늬 단위 11·u_occStr(그물마다 세기)로 그린다 — 다른 PBR 그림·뒷면 색과 함께도', async () => {
    const w = view(scene());
    await ready(w, 4);
    expect(w.v.stats.textures).toMatchObject({ count: 4, ready: 4, failed: 0, missing: 0 });
    const d = frame(w);
    const [a] = drawOf(d, COL.a), [b] = drawOf(d, COL.b), [c] = drawOf(d, COL.c);
    expect(occOf(a)).toEqual([1]);
    expect(uni(a!, 'u_occ')).toEqual([OCC_UNIT]);
    expect(unitTag(w, a!, OCC_UNIT)).toBe('ao');
    expect([uni(a!, 'u_nscale'), uni(a!, 'u_pbr')]).toEqual([undefined, undefined]);
    expect(uni(a!, 'u_uvq')).toEqual([0]);
    expect(occOf(b)).toEqual([0.5]);
    expect(uni(b!, 'u_pbr')).toEqual([0.5, 1, 0]);
    expect(uni(b!, 'u_backColor')).toBeDefined();
    expect([unitTag(w, b!, 0), unitTag(w, b!, 6), unitTag(w, b!, 7), unitTag(w, b!, OCC_UNIT)]).toEqual(['chk', 'nrm', 'mr', 'ao']);
    expect(occOf(c)).toEqual([1]);
    expect(uni(c!, 'u_pbr')).toEqual([0.2, 1, 0]);
    expect(occOf(drawOf(d, COL.box)[0])).toBeUndefined();
    // 판 a의 변종 글 = 0.101.0 원본에 정의를 넣고 가림 줄만 바꾼 것
    const vs = meshVariants(w);
    expect(vs.get('mesh:OCC,UV')?.[1]).toBe(withOcclusion(withDefines(MESH_FS, 'UV', 'OCC')));
    // 가림이 없는 변종 글에는 가림 줄이 없다
    for (const [k, [, fs]] of vs) expect(fs.includes('u_occ')).toBe(k.split(':')[1]!.split(',').includes('OCC'));
  });

  it('세기 0·글이 아닌 id는 가림 칸이 없는 장면과 같다 — 그리기 기록(프로그램·균일 변수·속성·무늬 단위)·무늬·버퍼·장면 알림', async () => {
    const off = view(scene('off'));
    const ws = [view(scene('zero')), view(scene('bad-id'))];
    await ready(off, 3);
    for (const w of ws) await ready(w, 3);
    const base = frame(off);
    for (const w of ws) {
      expect(frame(w)).toEqual(base);
      expect(w.v.stats.textures).toEqual(off.v.stats.textures);
      expect(w.v.stats.buffers).toEqual(off.v.stats.buffers);
      expect(w.v.sceneIssues).toEqual(off.v.sceneIssues);
      expect([...meshVariants(w).keys()]).toEqual([...meshVariants(off).keys()]);
    }
  });

  it('장면에 없는 id·기다리는 그림은 가림 없음(프로그램·균일 변수가 가림 칸이 없는 장면과 같다) — restoreTexture·setTexture로 오면 그때부터 쓴다', async () => {
    const off = view(scene('off'));
    const miss = view(scene('missing'));
    const pend = view(scene('pending'));
    await ready(off, 3);
    await ready(miss, 3);
    await ready(pend, 3);
    expect(miss.v.stats.textures).toEqual(off.v.stats.textures);
    expect(pend.v.restoreNeed).toEqual({ meshes: [], textures: ['ao'] });
    const e = frame(off);
    for (const w of [miss, pend]) {
      const d = frame(w);
      for (const col of [COL.box, COL.a, COL.b, COL.c]) {
        // 판 a·c는 가림 그림 id 때문에 무늬 좌표 속성만 더 묶여 있다(다른 PBR 그림과 같다)
        expect(drawOf(d, col).map((q) => [q.prog, q.uniforms])).toEqual(drawOf(e, col).map((q) => [q.prog, q.uniforms]));
      }
    }
    expect(await pend.v.restoreTexture('ao', fakeBitmap('ao2', 64, 64) as unknown as ImageBitmap)).toBe(true);
    expect(pend.v.restoreNeed).toBeNull();
    let d = frame(pend);
    expect(occOf(drawOf(d, COL.a)[0])).toEqual([1]);
    expect(unitTag(pend, drawOf(d, COL.a)[0]!, OCC_UNIT)).toBe('ao2');
    // setTexture(0.95.0)로 바꾼 그림도 같은 단위에
    expect(await pend.v.setTexture('ao', { bitmap: fakeBitmap('ao3', 64, 64) as unknown as ImageBitmap })).toBe(true);
    d = frame(pend);
    expect(unitTag(pend, drawOf(d, COL.b)[0]!, OCC_UNIT)).toBe('ao3');
    expect(occOf(drawOf(d, COL.b)[0])).toEqual([0.5]);
    // 기다리는 그림을 setTexture로 처음 받아도
    const p2 = view(scene('pending'));
    await ready(p2, 3);
    expect(await p2.v.setTexture('ao', new TextEncoder().encode('ao4'))).toBe(true);
    expect(unitTag(p2, drawOf(frame(p2), COL.c)[0]!, OCC_UNIT)).toBe('ao4');
  });

  it('놓기(release) 뒤 문맥을 잃었다 되찾으면 가림 그림과 가림 그림만 쓰는 판의 무늬 좌표도 다시 받는다', async () => {
    const s = scene();
    const w = view(s, { release: true });
    await ready(w, 4);
    expect(s.textures!.map((t) => !!t.data)).toEqual([false, false, false, false]);
    expect(s.meshes[1]!.uvs).toBeUndefined();
    const needs: ContextRestoreNeed[] = [];
    w.v.onContextRestore((n) => void needs.push(n));
    lose(w.v);
    restore(w.v);
    expect([...needs[0]!.textures].sort()).toEqual(['ao', 'chk', 'mr', 'nrm']);
    expect(needs[0]!.meshes.find((m) => m.id === 'a')).toMatchObject({ uvs: true });
    expect(occOf(drawOf(frame(w), COL.a)[0])).toBeUndefined();
    const src = scene();
    for (const m of src.meshes) w.v.restoreMeshArrays(m.id, { normals: m.normals, uvs: m.uvs });
    for (const t of src.textures!) expect(await w.v.restoreTexture(t.id, t.data!)).toBe(true);
    expect(w.v.restoreNeed).toBeNull();
    const d = frame(w);
    expect(occOf(drawOf(d, COL.a)[0])).toEqual([1]);
    expect(unitTag(w, drawOf(d, COL.a)[0]!, OCC_UNIT)).toBe('ao');
  });

  it('PBR 끔·무늬 없음·단색·숨은 선·색 바꾸기는 가림 그림을 쓰지 않고, X-ray(반투명 차례)·해 조명·화면 공간 가림과는 함께 쓴다', async () => {
    const w = view(scene());
    await ready(w, 4);
    w.v.setRenderOptions({ pbr: false });
    expect(frame(w).some((q) => occOf(q) !== undefined)).toBe(false);
    w.v.setRenderOptions({ pbr: true });
    for (const mode of ['noTexture', 'monochrome', 'hiddenLine'] as const) {
      w.v.setRenderMode(mode);
      expect(frame(w).some((q) => occOf(q) !== undefined)).toBe(false);
    }
    w.v.setRenderMode('shaded');
    w.v.setItemColor('a', '#ff0000');
    const h = frame(w);
    expect(occOf(h.find((q) => q.op === 'drawElements' && JSON.stringify(uni(q, 'u_color')) === JSON.stringify([1, 0, 0, 1])))).toBeUndefined();
    expect(occOf(drawOf(h, COL.c)[0])).toEqual([1]);
    w.v.clearItemLooks();
    w.v.setRenderMode('xray');
    expect(occOf(drawOf(frame(w), COL.a)[0])).toEqual([1]);
    w.v.setRenderMode('shaded');
    // 해 조명: 해 변종 글의 주변광 몫(u_amb)에 곱하고, 화면 공간 가림(0.49.0)은 그대로 그 뒤 화면 단계에서 곱한다
    w.v.setLighting({ sun: { direction: [0.3, -0.4, 1] }, ambient: 0.4 });
    w.v.setAmbientOcclusion(true);
    const s = frame(w);
    const a = drawOf(s, COL.a)[0]!;
    expect([occOf(a), uni(a, 'u_amb')]).toEqual([[1], [0.4]]);
    const fsA = [...meshVariants(w).entries()].find(([k]) => k === 'mesh:OCC,SUN,UV')?.[1][1];
    expect(fsA).toContain('vec3(u_amb * pOcc)');
    expect(s.some((q) => uni(q, 'u_ao') !== undefined)).toBe(true);
  });

  it('같은 가림 그물 12자리는 OCC 인스턴싱 변종으로 모아 그린다', async () => {
    const s = scene();
    const a = s.meshes[1]!;
    const meshes: Mesh3d[] = [];
    for (let i = 0; i < 12; i++) meshes.push({ ...a, id: `a${i}`, matrix: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i * 120, 300, 0, 1]) });
    const w = view({ ...s, meshes: [...s.meshes.filter((m) => m.id !== 'a'), ...meshes] });
    await ready(w, 4);
    const inst = frame(w).filter((e) => e.op === 'drawElementsInstanced');
    expect(inst.map((e) => e.args[4])).toEqual([12]);
    expect(occOf(inst[0])).toEqual([1]);
    expect(unitTag(w, inst[0]!, OCC_UNIT)).toBe('ao');
    expect(w.v.stats.instanced.items).toBe(12);
  });

  it('유한하지 않은 세기는 장면 알림 material·ignored(기본 1로 그린다)', async () => {
    const w = view(scene('nan'));
    await ready(w, 4);
    expect(w.v.sceneIssues.filter((i) => i.field === 'occlusionStrength').map((i) => [i.code, i.action, i.id])).toEqual([
      ['material', 'ignored', 'a'],
      ['material', 'ignored', 'b'],
      ['material', 'ignored', 'c'],
    ]);
    const d = frame(w);
    expect([COL.a, COL.b, COL.c].map((c) => occOf(drawOf(d, c)[0]))).toEqual([[1], [1], [1]]);
  });
});
