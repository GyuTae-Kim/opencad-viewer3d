/**
 * 0.62.0 이동뿐 꼴 자리 자료(셰이더 MSHIFT — 61차 남은 한계 "돌리는 프레임은 자리 자료를 모두 다시 쓰고 올린다(8만 23 MB)").
 *  - 묶음 그물 모형이 모두 이동뿐이고 겉모습이 없으면 자리에는 3열만(면 3텍셀 — 시점 투영 · 모형 3열·시점 · 모형 3열과 깃발·색, 선 2텍셀 — 3열·색, 그림자·안개·단면은 하나씩 더),
 *    0~2열·법선 행렬은 그리기마다 균일 변수로 한 번(u_mvp0·u_mv0·u_nmat0·u_shadow0·u_mvz0)
 *  - 순수 셈: liteFaceFill·liteLineFill의 칸이 faceFill·lineFill(0.61.0 온 꼴)의 3열·색·그림자·평면 칸과, liteMesh·liteLine이 그 0~2열과 비트까지 같다(−0 칸·큰 원점)
 *  - 셰이더 글: 자리 텍셀 수·0~2열을 균일 변수에서 읽는 줄, 바꿀 자리가 없으면 예외
 *  - 뷰어: 그린 도형(tests/drawexpand.ts)이 끈 뷰어(그물마다)와 프레임마다 같다 — 이동뿐 묶음·돌린 행렬 묶음이 섞인 장면, 돌림·강조·숨김·단면·그림자·안개·
 *    숨은 선 모드·화소 비율 2·겉모습 켜고 끄기(온 꼴로 갔다 돌아온다). 돌리는 프레임에 올린 텍셀이 이동뿐 묶음 그물마다 면 3 + 선 2(0.61.0은 12 + 6)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { mat4Mul, perspective, translation } from '../src/math';
import { faceFill, lineFill, liteFaceFill, liteLine, liteLineFill, liteMesh, mergeShader } from '../src/mergegl';
import type { MergeGroup, MergeRun, MeshRec } from '../src/renderer';
import { planeToLocal } from '../src/section';
import { MESH_VS, THIN_VS, WIDE_VS, withDefines } from '../src/shaders';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Rgba, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(async () => {
  dom = installDom();
  expect(await Viewer3d.preloadMerging()).toBe(true);
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

describe('0.62.0 이동뿐 꼴 셈', () => {
  /** 저장소 자리 셈만 쓰는 최소 렌더러 상태(판 1) */
  const host = (): Record<string, unknown> => ({
    instM3: new Float32Array(9),
    d4a: new Float64Array(16),
    d4b: new Float64Array(16),
    d4c: new Float64Array(16),
    mgStore: { buf: new Float32Array(4096 * 4), dirty: [], gen: { f: 1, e: 1 } },
  });
  const slots = (g: MergeGroup, kind: string, at: number, stride: number): void => {
    const n = g.recs.length;
    (g as { ps?: unknown }).ps = { [kind]: { ep: 1, base: at, stride, at: new Uint32Array(n), mdl: new Array(n) } };
  };
  /** 시점·투영(rtc면 묶음 원점 쪽으로 옮긴 그리기 틀 — 시점 · 옮김과 (투영 · 시점) · 옮김, camera.ts 원점 틀과 같은 셈) */
  const frame = (rtc: boolean) => {
    const view0 = mat4Mul(translation([-1e5 - 0.3, 7.7, -4e4]), mat4Mul(placeAt(0, 0, 0, 33, true), translation([3.1, -2.2, 0.7])));
    const proj = perspective(0.8, 1.3, 0.1, 5e5);
    if (!rtc) return { view: view0, proj, viewProj: mat4Mul(proj, view0) };
    const t = translation([98765.4, -4321.25, 17.5]);
    return { view: mat4Mul(view0, t), proj, viewProj: mat4Mul(mat4Mul(proj, view0), t) };
  };
  /** 이동뿐인 모형(−0 칸·큰 원점·작은 원점 — sft 1·2)과 모형이 없는 그물(세계 좌표 — 마지막) */
  const models = (): (Float64Array | undefined)[] => {
    const out: (Float64Array | undefined)[] = [];
    for (const o of [[0, 0, 0], [1e5, -3e4, 7.25], [-0.1, 1e-7, 3], [123456.789, 0.5, -98765.4321], [-7, 0, 1e6]]) out.push(translation(o) as Float64Array);
    const neg = translation([5, 6, 7]) as Float64Array;
    neg[1] = -0;
    neg[9] = -0;
    out.push(neg);
    out.push(undefined);
    return out;
  };
  /** 비트까지 같은지(loose면 ±0은 같다고 — 모형이 없는 그물의 0~2열은 시점 투영 그대로라 이동뿐 공통 열과 0의 부호만 다를 수 있다) */
  const same = (label: string, a: ArrayLike<number>, b: ArrayLike<number>, loose = false): void => {
    expect(a.length, label).toBe(b.length);
    for (let i = 0; i < a.length; i++) if (loose ? a[i] !== b[i] : !Object.is(a[i], b[i])) expect([label, i, a[i]]).toEqual([label, i, b[i]]);
  };
  const texel = (d: Float32Array, k: number): number[] => Array.from(d.subarray(k * 4, k * 4 + 4));

  it('liteFaceFill·liteLineFill 칸과 liteMesh·liteLine 균일 변수가 0.61.0 온 꼴(faceFill·lineFill)의 칸과 비트까지 같다', () => {
    for (const rtc of [false, true]) fills(rtc);
  });

  function fills(rtc: boolean): void {
    const f = frame(rtc) as never;
    const ms = models();
    const nm = ms.length - 1;
    const cols: Rgba[] = ms.map((_, i) => [0.1 * i, 0.2, 0.3, 1 - 0.1 * i]);
    const vc = ms.map((_, i) => i % 2 === 0);
    const plane = [0.6, -0.8, 0, 1234.5] as const;
    const clipOf = (m: ArrayLike<number> | undefined) => planeToLocal(plane, m);
    const shadow = mat4Mul(translation([0.5, -0.25, 0.1]), perspective(0.5, 1, 1, 100));
    const group = (): MergeGroup => ({ recs: ms.map((model) => ({ model, src: { id: 'x' } }) as unknown as MeshRec) }) as unknown as MergeGroup;
    const runsOf = (g: MergeGroup): MergeRun[] => [
      { g, a: 0, b: 2, base: 0, cols, vc, o: 0, sh: true, tint: 0, alpha: 1, w: 1 },
      { g, a: 2, b: ms.length, base: 0, cols: cols.slice(2), vc: vc.slice(2), o: 2, sh: false, tint: 0, alpha: 1, w: 1 },
    ];
    for (const sec of [false, true])
      for (const sh of [false, true]) {
        const c = { f, mm: (r: MeshRec) => r.model, look: false, sec: sec ? {} : null, clipOf, shadowVp: sh ? shadow : null } as never;
        const stride = 12 + (sh ? 4 : 0) + (sec ? 1 : 0), strideL = 3 + (sh ? 1 : 0) + (sec ? 1 : 0);
        const ga = group(), gb = group();
        slots(ga, 'f', 0, stride);
        slots(gb, 'f', 2 * strideL, strideL);
        const a = host(), b = host();
        faceFill(a as never, c, runsOf(ga), stride);
        liteFaceFill(b as never, c, runsOf(gb), strideL, false);
        const A = (a.mgStore as { buf: Float32Array }).buf, B = (b.mgStore as { buf: Float32Array }).buf;
        const m = liteMesh(c);
        ms.forEach((_, i) => {
          const at = (j: number): number[] => texel(A, i * stride + j);
          const bt = (j: number): number[] => texel(B, (2 + i) * strideL + j);
          const L = `${rtc}${sec}${sh}#${i}`;
          same(`${L} mvp3`, bt(0), at(3));
          same(`${L} mv3`, bt(1).slice(0, 3), at(7).slice(0, 3));
          same(`${L} flag`, [bt(1)[3]!], [at(8)[3]!]);
          same(`${L} col`, bt(2), at(11));
          if (sh) same(`${L} shadow3`, bt(3), at(15));
          if (sec) same(`${L} plane`, bt(strideL - 1), at(stride - 1));
          // 0~2열·법선 행렬은 그물마다 같다 — 균일 변수 값
          const lo = i === nm;
          same(`${L} mvp012`, m.mvp.subarray(0, 12), [...at(0), ...at(1), ...at(2)], lo);
          same(`${L} mv012`, m.mv.subarray(0, 12), [...at(4), ...at(5), ...at(6)], lo);
          same(`${L} nmat`, m.nmat, [...at(8).slice(0, 3), ...at(9).slice(0, 3), ...at(10).slice(0, 3)], lo);
          if (sh) same(`${L} shadow012`, m.shadow!.subarray(0, 12), [...at(12), ...at(13), ...at(14)], lo);
        });
        // 쓴 자리는 구간째(이어진 두 구간 — 한 범위), 같은 판·값의 두 번째 쓰기는 아무것도 쓰지 않는다
        const D = (b.mgStore as { dirty: number[] }).dirty;
        expect(D).toEqual([2 * strideL, (2 + ms.length) * strideL]);
        D.length = 0;
        liteFaceFill(b as never, c, runsOf(gb), strideL, false);
        expect(D).toEqual([]);
        // fresh(판이 막 올랐다)는 견주지 않고 같은 값을 쓰고 구간째 적는다
        const B0 = B.slice();
        liteFaceFill(b as never, c, runsOf(gb), strideL, true);
        same(`${sec}${sh} fresh`, B, B0);
        expect(D).toEqual([2 * strideL, (2 + ms.length) * strideL]);
        // 선
        for (const fog of [false, true]) {
          const t = sec ? 7 : 6, tL = 2 + (fog ? 1 : 0) + (sec ? 1 : 0);
          const gc = group(), gd = group();
          slots(gc, 'e', 0, t);
          slots(gd, 'e', 0, tL);
          const p = host(), q = host();
          lineFill(p as never, c, runsOf(gc), fog, t, 'e');
          liteLineFill(q as never, c, runsOf(gd), fog, tL, 'e', false);
          const P = (p.mgStore as { buf: Float32Array }).buf, Q = (q.mgStore as { buf: Float32Array }).buf;
          const l = liteLine(c);
          ms.forEach((_, i) => {
            const at = (j: number): number[] => texel(P, i * t + j);
            const bt = (j: number): number[] => texel(Q, i * tL + j);
            const L = `${rtc}${sec}${fog}#${i}`;
            const lo = i === nm;
            same(`${L} mvp3`, bt(0), at(3));
            same(`${L} col`, bt(1), at(5));
            same(`${L} mvp012`, l.mvp.subarray(0, 12), [...at(0), ...at(1), ...at(2)], lo);
            if (fog) {
              same(`${L} mvz`, [...l.mvz, bt(2)[0]!], at(4), lo);
              same(`${L} mvz3`, [bt(2)[0]!], [at(4)[3]!]);
              same(`${L} mvz pad`, bt(2).slice(1), [0, 0, 0]);
            }
            if (sec) same(`${L} plane`, bt(tL - 1), at(6));
          });
        }
      }
  }

  it('MSHIFT 셰이더 글: 자리 텍셀 수와 0~2열을 균일 변수에서 — 아래 식은 그대로', () => {
    const m = mergeShader(withDefines(MESH_VS, 'MSHIFT', 'INST', 'MERGE'), 'mesh');
    expect(m).toContain('uniform mat4 u_mvp0;\nuniform mat4 u_mv0;\nuniform mat3 u_nmat0;\nuniform mat4 u_shadow0;\n');
    expect(m).toContain('  int k = u_instBase + int(a_item) * 3 + j;\n');
    expect(m).toContain('  mat4 u_mvp = mat4(u_mvp0[0], u_mvp0[1], u_mvp0[2], instAt(0));\n');
    expect(m).toContain('  mat4 u_mv = mat4(u_mv0[0], u_mv0[1], u_mv0[2], vec4(m3.xyz, 1.0));\n  mat3 u_nmat = u_nmat0;\n  vec4 u_color = instAt(2);\n  float fl = m3.w;\n');
    expect(m).toContain('  mat4 u_shadowM = mat4(u_shadow0[0], u_shadow0[1], u_shadow0[2], instAt(3));\n');
    expect(m).toContain('  gl_Position = u_mvp * vec4(a_pos, 1.0);\n  v_vpos = (u_mv * vec4(a_pos, 1.0)).xyz;\n');
    expect(m).not.toContain('instAt(4)');
    // 선: 2 + 안개 + 단면 텍셀
    for (const [vs, defs, n, clipAt] of [
      [THIN_VS, [], 2, -1],
      [THIN_VS, ['FOG'], 3, -1],
      [THIN_VS, ['CLIP', 'MCLIP'], 3, 2],
      [WIDE_VS, ['FOG', 'MCLIP'], 4, 3],
      [WIDE_VS, ['CAPZ'], 2, -1],
    ] as const) {
      const s = mergeShader(withDefines(vs, ...defs, 'MSHIFT', 'INST', 'MERGE'), 'line');
      expect(s).toContain(`  int k = u_instBase + int(a_item) * ${n} + j;\n`);
      expect(s).toContain('uniform mat4 u_mvp0;\nuniform vec3 u_mvz0;\n');
      expect(s).toContain(`  mat4 u_mvp = mat4(u_mvp0[0], u_mvp0[1], u_mvp0[2], instAt(0));\n  vec4 u_color = instAt(1);\n${clipAt >= 0 ? `  u_clip = instAt(${clipAt});\n` : ''}`);
      expect(s).toContain('  vec4 u_mvz = vec4(u_mvz0, instAt(2).x);\n');
    }
    // MSHIFT가 없으면 0.61.0 글 그대로
    expect(mergeShader(withDefines(MESH_VS, 'INST', 'MERGE'), 'mesh')).toContain('  int k = u_instBase + int(a_item) * 12 + j;\n');
    expect(mergeShader(withDefines(MESH_VS, 'INST', 'MERGE'), 'mesh')).not.toContain('u_mvp0');
    expect(() => mergeShader('#version 300 es\n#define MSHIFT\nvoid main() {}', 'mesh')).toThrow();
  });
});

/**
 * 상자 n개: 원점만(이동뿐), 정점 색(3번째마다), 윤곽선 없음(13번째마다), 묶음 g0~g3. 한쪽 면 그물(10번째마다 — 열쇠가 달라 따로 묶인다)은 rot면 돌린 행렬(온 꼴 묶음).
 * world면 홀수 그물은 원점 없이(세계 좌표 — 모형이 없다, 정점을 옮겨 둔다)
 */
function boxes(n: number, rot: boolean, world = false): Scene3d {
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const at: [number, number, number] = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (world && i % 2 === 1 && i % 10 !== 0) {
      const m = boxMesh(`b${i}`, at, [at[0] + 6, at[1] + 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`);
      if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
      return m;
    }
    const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`);
    if (i % 10 === 0) {
      m.doubleSided = false;
      if (rot) m.matrix = placeAt(at[0], at[1], 0, i * 7, i % 20 === 0);
      else m.origin = at;
    } else m.origin = at;
    if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
    if (i % 13 === 0) delete m.edges;
    return m;
  });
  return { name: 'b', units: 'mm', meshes, lines: [] };
}

type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown>; up: { texels: number } };

/** 뷰어(저장소 단위 10에 올린 texSubImage2D 텍셀을 센다) */
function view(sc: Scene3d, merging: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, r, up: { texels: 0 } };
  const base = r.gl as Record<string | symbol, unknown> & { TEXTURE0: number };
  let unit = 0;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        if (k === 'activeTexture') unit = (a[0] as number) - base.TEXTURE0;
        if (k === 'texSubImage2D' && unit === 10) w.up.texels += (a[4] as number) * (a[5] as number);
        return (x as (...y: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  v.setRenderOptions({ merging });
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  return w;
}

function bake(w: W): void {
  w.v.renderNow();
  for (let i = 0; i < 100 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}

const shot = (w: W): string[] => expandFrame(w.gl, () => w.v.renderNow());

/** 켬·끔 두 뷰어에 같은 조작 뒤 첫 프레임의 펼친 도형이 같은지 — 켬 쪽이 저장소에 올린 텍셀 수 */
function step(on: W, off: W, label: string, fn: (w: W) => void): number {
  for (const w of [on, off]) fn(w);
  on.up.texels = 0;
  const b = shot(on), a = shot(off);
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
  expect(on.v.stats.merged.draws, label).toBeGreaterThan(0);
  return on.up.texels;
}

/** 묶음마다 면 자리 텍셀 수(이동뿐 꼴 3 + …, 온 꼴 12 + …) */
const strides = (w: W, kind: string): number[] => [...(w.r.mgGroups as Set<MergeGroup>)].map((g) => g.ps?.[kind]?.stride ?? 0).sort((x, y) => x - y);

describe('0.62.0 이동뿐 꼴 — 뷰어', () => {
  it('그린 도형이 끈 뷰어와 프레임마다 같고, 돌리는 프레임은 이동뿐 묶음 그물마다 면 3 + 선 2텍셀만 올린다', () => {
    const n = 600;
    const on = view(boxes(n, true), true), off = view(boxes(n, true), false);
    bake(on);
    bake(off);
    const gs = [...(on.r.mgGroups as Set<MergeGroup>)];
    expect(gs.some((g) => g.mov)).toBe(true);
    expect(gs.some((g) => !g.mov)).toBe(true);
    expect(step(on, off, 'still', () => undefined)).toBe(0);
    // 이동뿐 묶음 면 3·선 2, 돌린 행렬 묶음 면 12·선 6
    expect(new Set(strides(on, 'f'))).toEqual(new Set([3, 12]));
    expect(new Set(strides(on, 'e'))).toEqual(new Set([2, 6]));
    const movN = gs.filter((g) => g.mov).reduce((s, g) => s + g.recs.length, 0), rotN = n - movN;
    const t = step(on, off, 'orbit', (w) => w.v.orbitBy(0.05, 0));
    // 면 3·선 2(이동뿐) + 면 12·선 6(돌린 행렬 묶음) — 윤곽선 없는 그물·화면 밖은 빠지고, 한 줄이 안 되는 틈은 함께 올린다
    expect(t).toBeGreaterThan(movN * 3 + rotN * 12);
    expect(t).toBeLessThanOrEqual(movN * 5 + rotN * 18 + 4 * 1024);
    expect(step(on, off, 'still-2', () => undefined)).toBe(0);
    step(on, off, 'hover', (w) => w.v.highlight(['b3', 'b20']));
    step(on, off, 'hide', (w) => w.v.setItemVisible('b11', false));
    step(on, off, 'orbit-hi', (w) => w.v.orbitBy(0.05, 0.01));
    step(on, off, 'group-hide', (w) => (w.v.setGroupVisible('g1', false), w.v.highlight(null)));
    step(on, off, 'section', (w) => w.v.setSection({ normal: [1, 0, 0], offset: 120 }));
    step(on, off, 'section-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'sun-shadow', (w) => w.v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }));
    step(on, off, 'shadow-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'fog', (w) => w.v.setFog({ start: 50, end: 400 }));
    step(on, off, 'fog-orbit', (w) => w.v.orbitBy(0.05, 0));
    // 겉모습이 있으면 온 꼴(자리 모형을 견준다)로 갔다가, 없어지면 이동뿐 꼴로 돌아온다
    step(on, off, 'look-on', (w) => w.v.setItemColor('b16', [1, 0, 0, 1]));
    expect(new Set(strides(on, 'f'))).toEqual(new Set([12 + 4 + 1]));
    step(on, off, 'look-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'look-off', (w) => w.v.setItemColor('b16', null));
    expect(new Set(strides(on, 'f'))).toEqual(new Set([3 + 1 + 1, 12 + 4 + 1]));
    step(on, off, 'profiles-ao', (w) => (w.v.setRenderOptions({ profiles: { width: 1 } }), w.v.setAmbientOcclusion({})));
    step(on, off, 'plain', (w) => (w.v.setSection(null), w.v.setLighting(null), w.v.setFog(null), w.v.setAmbientOcclusion(null), w.v.setGroupVisible('g1', true)));
    step(on, off, 'hidden-line', (w) => (w.v.setRenderMode('hiddenLine'), w.v.setRenderOptions({ hiddenEdges: 0.4 })));
    step(on, off, 'hidden-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'shaded', (w) => (w.v.setRenderMode('shadedEdges'), w.v.highlight(['b7', 'b8', 'b9'])));
    step(on, off, 'edit', (w) => (w.v.setMesh({ ...boxMesh('b25', [0, 0, 0], [6, 6, 9], [0.9, 0.2, 0.2, 1]), origin: [0, 0, 40] }), w.v.removeMesh('b26')));
    bake(on);
    bake(off);
    expect(step(on, off, 'edit-still', () => undefined)).toBe(0);
    step(on, off, 'edit-orbit', (w) => w.v.orbitBy(0.05, 0));
  });

  it('모두 이동뿐인 장면(원점 없는 세계 좌표 그물이 섞여도): 돌리는 프레임 텍셀이 그물마다 면 3 + 선 2 안쪽이고 화소 비율 2(굵은 선 변종)에서도 끈 뷰어와 같다', () => {
    const n = 900;
    const on = view(boxes(n, false, true), true), off = view(boxes(n, false, true), false);
    bake(on);
    bake(off);
    const gs = [...(on.r.mgGroups as Set<MergeGroup>)];
    expect(gs.every((g) => g.mov)).toBe(true);
    expect(gs.some((g) => g.nom)).toBe(true);
    for (const s of ['shadow', 'section']) {
      step(on, off, s, (w) => (s === 'shadow' ? w.v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }) : w.v.setSection({ normal: [1, 0, 0], offset: 120 })));
      step(on, off, `${s}-orbit`, (w) => w.v.orbitBy(0.05, 0));
    }
    step(on, off, 'fog', (w) => (w.v.setFog({ start: 50, end: 400 }), w.v.setRenderOptions({ hiddenEdges: { opacity: 0.3, shaded: true } })));
    step(on, off, 'plain', (w) => (w.v.setLighting(null), w.v.setSection(null), w.v.setFog(null), w.v.setRenderOptions({ hiddenEdges: 0 })));
    const t = step(on, off, 'orbit', (w) => w.v.orbitBy(0.05, 0));
    expect(t).toBeGreaterThan(n * 3);
    expect(t).toBeLessThanOrEqual(n * 5 + 2 * 1024);
    const g = globalThis as { devicePixelRatio: number };
    g.devicePixelRatio = 2;
    try {
      step(on, off, 'dpr2', (w) => w.v.highlight(['b4']));
      step(on, off, 'dpr2-orbit', (w) => w.v.orbitBy(0.05, 0));
    } finally {
      g.devicePixelRatio = 1;
    }
  });
});
