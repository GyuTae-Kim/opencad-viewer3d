/**
 * 0.67.0 회전 표 꼴 자리 자료(셰이더 MROT — 62차 남은 한계 "회전·늘이기 모형이 든 묶음은 온 꼴(면 12·선 6텍셀)이라 돌리면 모두 다시 쓴다").
 *  - 모형 0~2열이 같은 그물끼리 표 항목 하나(시점 투영 · 모형·시점 · 모형의 0~2열, 법선 행렬, 그림자 0~2열 / 선은 0~2열·안개 z 행 앞 세 칸)를 묶음 자리 앞에 두고,
 *    그물 자리에는 이동뿐 꼴과 같은 텍셀 수(3열·깃발 + 4·표 번호·색 — 선은 3열·색·안개 z 끝 칸과 표 번호)만
 *  - 순수 셈: rotFaceFill·rotLineFill의 표·자리 칸이 faceFill·lineFill(온 꼴)의 칸과 비트까지 같다(같은 회전 다른 이동·늘이기·거울·−0 칸·큰 원점·모형 없음)
 *  - 셰이더 글: 표 번호를 풀고 표에서 0~2열을 읽는 줄
 *  - 뷰어: 그린 도형(tests/drawexpand.ts)이 끈 뷰어(그물마다)와 프레임마다 같다(돌림·강조·숨김·단면·그림자·안개·숨은 선·화소 비율 2·겉모습·갈아 쓰기로 표 항목 더하기·
 *    빼기·더하기). 회전이 모두 다른 묶음은 온 꼴 그대로, 돌리는 프레임 텍셀이 표 항목 + 그물마다 면 3·선 3 안쪽
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { mat4Mul, perspective, translation } from '../src/math';
import { faceFill, lineFill, mergeShader, rotFaceFill, rotLineFill } from '../src/mergegl';
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

/** 회전 k(z축 둘레 k·35° — k가 홀수면 눕힘)·이동(x, y, z)·늘이기(s — 첫 열만) */
function rotAt(k: number, x: number, y: number, z: number, s = 1): Float64Array {
  const m = placeAt(x, y, z, k * 35, k % 2 === 1);
  for (let j = 0; j < 3; j++) m[j] = m[j]! * s;
  return m;
}

describe('0.67.0 회전 표 셈', () => {
  const host = (): Record<string, unknown> => ({
    instM3: new Float32Array(9),
    d4a: new Float64Array(16),
    d4b: new Float64Array(16),
    d4c: new Float64Array(16),
    mgStore: { buf: new Float32Array(8192 * 4), dirty: [], gen: { f: 1, e: 1 } },
  });
  const slots = (g: MergeGroup, kind: string, at: number, stride: number, tb = 0): void => {
    const n = g.recs.length;
    (g as { ps?: unknown }).ps = { [kind]: { ep: 1, base: at, stride, at: new Uint32Array(n), mdl: new Array(n), tb, tg: 0 } };
  };
  const frame = (rtc: boolean) => {
    const view0 = mat4Mul(translation([-1e5 - 0.3, 7.7, -4e4]), mat4Mul(placeAt(0, 0, 0, 33, true), translation([3.1, -2.2, 0.7])));
    const proj = perspective(0.8, 1.3, 0.1, 5e5);
    if (!rtc) return { view: view0, proj, viewProj: mat4Mul(proj, view0) };
    const t = translation([98765.4, -4321.25, 17.5]);
    return { view: mat4Mul(view0, t), proj, viewProj: mat4Mul(mat4Mul(proj, view0), t) };
  };
  /** 같은 회전·다른 이동(큰 원점), 늘인 회전, 거울, 이동뿐(−0 칸 — 단위 항목과 같은 항목), 단위 행렬, 모형 없음(마지막) */
  const models = (): (Float64Array | undefined)[] => {
    const out: (Float64Array | undefined)[] = [];
    out.push(rotAt(1, 1e5, -3e4, 7.25), rotAt(2, 0.5, 0.25, -1), rotAt(1, -7, 0, 1e6), rotAt(2, 123456.789, 0.5, -98765.4321), rotAt(3, 10, 20, 30, 2.5));
    const mir = rotAt(4, 1, 2, 3);
    mir[0] = -mir[0]!;
    mir[1] = -mir[1]!;
    mir[2] = -mir[2]!;
    out.push(mir, translation([5, -6, 7]) as Float64Array);
    const neg = translation([5, 6, 7]) as Float64Array;
    neg[1] = -0;
    neg[9] = -0;
    out.push(neg, rotAt(3, -4, 4, 4, 2.5), undefined);
    return out;
  };
  const same = (label: string, a: ArrayLike<number>, b: ArrayLike<number>, loose = false): void => {
    expect(a.length, label).toBe(b.length);
    for (let i = 0; i < a.length; i++) if (loose ? a[i] !== b[i] : !Object.is(a[i], b[i])) expect([label, i, a[i]]).toEqual([label, i, b[i]]);
  };
  const texel = (d: Float32Array, k: number): number[] => Array.from(d.subarray(k * 4, k * 4 + 4));

  it('rotFaceFill·rotLineFill의 표·자리 칸이 온 꼴(faceFill·lineFill) 칸과 비트까지 같고, 같은 판은 표도 자리도 다시 쓰지 않는다', () => {
    for (const rtc of [false, true]) fills(rtc);
  });

  function fills(rtc: boolean): void {
    const f = frame(rtc) as never;
    const ms = models();
    const nm = ms.length - 1;
    const cols: Rgba[] = ms.map((_, i) => [0.1 * (i % 10), 0.2, 0.3, 1 - 0.05 * i]);
    const vc = ms.map((_, i) => i % 2 === 0);
    const plane = [0.6, -0.8, 0, 1234.5] as const;
    const clipOf = (m: ArrayLike<number> | undefined) => planeToLocal(plane, m);
    const shadow = mat4Mul(translation([0.5, -0.25, 0.1]), perspective(0.5, 1, 1, 100));
    const group = (): MergeGroup => ({ recs: ms.map((model) => ({ model, src: { id: 'x' } }) as unknown as MeshRec) }) as unknown as MergeGroup;
    const runsOf = (g: MergeGroup): MergeRun[] => [
      { g, a: 0, b: 3, base: 0, cols, vc, o: 0, sh: true, tint: 0, alpha: 1, w: 1, hl: [1] },
      { g, a: 3, b: ms.length, base: 0, cols: cols.slice(3), vc: vc.slice(3), o: 3, sh: false, tint: 0, alpha: 1, w: 1 },
    ];
    // 항목: 회전 1(둘)·회전 2(둘)·늘인 회전 3(둘)·거울·단위(이동뿐·−0 칸 이동뿐·모형 없음) = 5
    const NR = 5;
    for (const sec of [false, true])
      for (const sh of [false, true]) {
        const c = { f, mm: (r: MeshRec) => r.model, look: false, sec: sec ? {} : null, clipOf, shadowVp: sh ? shadow : null } as never;
        const stride = 12 + (sh ? 4 : 0) + (sec ? 1 : 0), strideR = 3 + (sh ? 1 : 0) + (sec ? 1 : 0), T = 9 + (sh ? 3 : 0);
        const ga = group(), gb = group();
        slots(ga, 'f', 0, stride);
        const base = Math.ceil((40 + NR * T) / strideR) * strideR;
        slots(gb, 'f', base, strideR, NR * T);
        const a = host(), b = host();
        faceFill(a as never, c, runsOf(ga), stride);
        rotFaceFill(b as never, c, runsOf(gb), strideR, T, false);
        const rt = (gb as { rt?: { rid: Uint32Array; rm: number[] } }).rt!;
        expect(rt.rm.length / 12).toBe(NR);
        const A = (a.mgStore as { buf: Float32Array }).buf, B = (b.mgStore as { buf: Float32Array }).buf;
        ms.forEach((_, i) => {
          const at = (j: number): number[] => texel(A, i * stride + j);
          const bt = (j: number): number[] => texel(B, base + i * strideR + j);
          const r = rt.rid[i]!;
          const tb = (j: number): number[] => texel(B, base - (r + 1) * T + j);
          const L = `${rtc}${sec}${sh}#${i}`;
          same(`${L} mvp3`, bt(0), at(3));
          same(`${L} mv3`, bt(1).slice(0, 3), at(7).slice(0, 3));
          // 깃발 칸 = 깃발(정점 색 + 강조 2 — 둘째 그물) + 4·표 번호
          expect(bt(1)[3]! - 4 * r, `${L} flag`).toBe(at(8)[3]!);
          if (i === 1) expect(at(8)[3]!, `${L} hi`).toBeGreaterThan(1.5);
          same(`${L} col`, bt(2), at(11));
          if (sh) same(`${L} shadow3`, bt(3), at(15));
          if (sec) same(`${L} plane`, bt(strideR - 1), at(stride - 1));
          // 표 항목: 0~2열·법선 행렬(모형 없는 그물은 시점 투영 그대로라 0의 부호만 다를 수 있다)
          const lo = i === nm;
          same(`${L} mvp012`, [...tb(0), ...tb(1), ...tb(2)], [...at(0), ...at(1), ...at(2)], lo);
          same(`${L} mv012`, [...tb(3), ...tb(4), ...tb(5)], [...at(4), ...at(5), ...at(6)], lo);
          same(`${L} nmat`, [...tb(6).slice(0, 3), ...tb(7).slice(0, 3), ...tb(8).slice(0, 3)], [...at(8).slice(0, 3), ...at(9).slice(0, 3), ...at(10).slice(0, 3)], lo);
          if (sh) same(`${L} shadow012`, [...tb(9), ...tb(10), ...tb(11)], [...at(12), ...at(13), ...at(14)], lo);
        });
        // 쓴 자리: 표(자리 바로 앞)와 두 구간(이어져 한 범위)
        const D = (b.mgStore as { dirty: number[] }).dirty;
        expect(D).toEqual([base - NR * T, base + ms.length * strideR]);
        D.length = 0;
        rotFaceFill(b as never, c, runsOf(gb), strideR, T, false);
        expect(D).toEqual([]);
        // fresh는 견주지 않고 같은 값(표는 판이 같으면 그대로 — 판이 오르면 다시)
        const B0 = B.slice();
        rotFaceFill(b as never, c, runsOf(gb), strideR, T, true);
        same(`${sec}${sh} fresh`, B, B0);
        expect(D).toEqual([base, base + ms.length * strideR]);
        D.length = 0;
        (b.mgStore as { gen: Record<string, number> }).gen.f = 2;
        rotFaceFill(b as never, c, runsOf(gb), strideR, T, true);
        same(`${sec}${sh} gen2`, B, B0);
        expect(D).toEqual([base - NR * T, base + ms.length * strideR]);
        // 선
        for (const fog of [false, true]) {
          const t = sec ? 7 : 6, tR = 3 + (sec ? 1 : 0), TL = 3 + (fog ? 1 : 0);
          const gc = group(), gd = group();
          slots(gc, 'e', 0, t);
          const lb = Math.ceil((40 + NR * TL) / tR) * tR;
          slots(gd, 'e', lb, tR, NR * TL);
          const p = host(), q = host();
          lineFill(p as never, c, runsOf(gc), fog, t, 'e');
          rotLineFill(q as never, c, runsOf(gd), fog, tR, TL, 'e', false);
          const P = (p.mgStore as { buf: Float32Array }).buf, Q = (q.mgStore as { buf: Float32Array }).buf;
          const lt = (gd as { rt?: { rid: Uint32Array } }).rt!;
          ms.forEach((_, i) => {
            const at = (j: number): number[] => texel(P, i * t + j);
            const bt = (j: number): number[] => texel(Q, lb + i * tR + j);
            const r = lt.rid[i]!;
            const tb = (j: number): number[] => texel(Q, lb - (r + 1) * TL + j);
            const L = `${rtc}${sec}${fog}#${i}`;
            const lo = i === nm;
            same(`${L} mvp3`, bt(0), at(3));
            same(`${L} col`, bt(1), at(5));
            same(`${L} rid`, bt(2).slice(1), [r, 0, 0]);
            same(`${L} mvp012`, [...tb(0), ...tb(1), ...tb(2)], [...at(0), ...at(1), ...at(2)], lo);
            if (fog) {
              same(`${L} mvz`, [...tb(3).slice(0, 3), bt(2)[0]!], at(4), lo);
              same(`${L} mvz3`, [bt(2)[0]!], [at(4)[3]!]);
            } else expect(bt(2)[0], `${L} nofog`).toBe(0);
            if (sec) same(`${L} plane`, bt(tR - 1), at(6));
          });
          const DL = (q.mgStore as { dirty: number[] }).dirty;
          expect(DL).toEqual([lb - NR * TL, lb + ms.length * tR]);
          DL.length = 0;
          rotLineFill(q as never, c, runsOf(gd), fog, tR, TL, 'e', false);
          expect(DL).toEqual([]);
        }
      }
  }

  it('MROT 셰이더 글: 표 번호를 풀고 0~2열·법선 행렬·그림자 0~2열·안개 z 행을 표에서 — 아래 식은 그대로', () => {
    for (const [defs, T] of [
      [[], 9],
      [['SHADOW', 'CLIP'], 12],
    ] as const) {
      const m = mergeShader(withDefines(MESH_VS, ...defs, 'MROT', 'INST', 'MERGE'), 'mesh');
      expect(m).toContain('vec4 storeAt(int k) {\n  return texelFetch(u_inst, ivec2(k & 1023, k >> 10), 0);\n}\n');
      expect(m).toContain(defs.length ? '  int k = u_instBase + int(a_item) * u_instStride + j;\n' : '  int k = u_instBase + int(a_item) * 3 + j;\n');
      expect(m).toContain(`  vec4 m3 = instAt(1);\n  float rr = floor(m3.w * 0.25);\n  float fl = m3.w - rr * 4.0;\n  int kt = u_instBase - (int(rr) + 1) * ${T};\n`);
      expect(m).toContain('  mat4 u_mvp = mat4(storeAt(kt), storeAt(kt + 1), storeAt(kt + 2), instAt(0));\n');
      expect(m).toContain('  mat4 u_mv = mat4(storeAt(kt + 3), storeAt(kt + 4), storeAt(kt + 5), vec4(m3.xyz, 1.0));\n');
      expect(m).toContain('  mat3 u_nmat = mat3(storeAt(kt + 6).xyz, storeAt(kt + 7).xyz, storeAt(kt + 8).xyz);\n  vec4 u_color = instAt(2);\n');
      expect(m).toContain('  mat4 u_shadowM = mat4(storeAt(kt + 9), storeAt(kt + 10), storeAt(kt + 11), instAt(3));\n');
      expect(m).toContain('  gl_Position = u_mvp * vec4(a_pos, 1.0);\n  v_vpos = (u_mv * vec4(a_pos, 1.0)).xyz;\n');
      expect(m).not.toContain('u_mvp0');
    }
    for (const [vs, defs, n, T, clip] of [
      [THIN_VS, [], 3, 3, false],
      [THIN_VS, ['FOG'], 3, 4, false],
      [THIN_VS, ['CLIP', 'MCLIP'], 4, 3, true],
      [WIDE_VS, ['FOG', 'MCLIP'], 4, 4, true],
      [WIDE_VS, ['CAPZ'], 3, 3, false],
    ] as const) {
      const s = mergeShader(withDefines(vs, ...defs, 'MROT', 'INST', 'MERGE'), 'line');
      expect(s).toContain(`  int k = u_instBase + int(a_item) * ${n} + j;\n`);
      expect(s).toContain(
        `  vec4 m2 = instAt(2);\n  int kt = u_instBase - (int(m2.y) + 1) * ${T};\n  mat4 u_mvp = mat4(storeAt(kt), storeAt(kt + 1), storeAt(kt + 2), instAt(0));\n  vec4 u_color = instAt(1);\n${clip ? '  u_clip = instAt(3);\n' : ''}`,
      );
      expect(s).toContain('  vec4 u_mvz = vec4(storeAt(kt + 3).xyz, m2.x);\n');
      expect(s).not.toContain('u_mvp0');
    }
  });
});

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

function step(on: W, off: W, label: string, fn: (w: W) => void): number {
  for (const w of [on, off]) fn(w);
  on.up.texels = 0;
  const b = shot(on), a = shot(off);
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
  expect(on.v.stats.merged.draws, label).toBeGreaterThan(0);
  return on.up.texels;
}

/**
 * STEP 꼴 상자 n개(그물마다 제 배열 — 묶어 그리기 길): 4번째마다 회전 행렬(같은 회전 5가지·다른 이동 — 둘째마다 늘인 것), 그 밖은 원점만(이동뿐)이나 세계 좌표(모형 없음 — 7번째마다),
 * 정점 색(3번째마다), 윤곽선 없음(13번째마다), 묶음 g0~g3. 한쪽 면 그물(10번째마다 — 열쇠가 달라 따로 묶인다)은 회전이 모두 다르다(온 꼴로 남는다)
 */
function scene(n: number): Scene3d {
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const at: [number, number, number] = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    const col: Rgba = [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1];
    if (i % 7 === 3) {
      const m = boxMesh(`b${i}`, at, [at[0] + 6, at[1] + 6, 4 + (i % 3)], col, `g${i % 4}`);
      if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
      return m;
    }
    const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], col, `g${i % 4}`);
    if (i % 10 === 0) {
      m.doubleSided = false;
      m.matrix = placeAt(at[0], at[1], 0, i * 7 + i / 1000, i % 20 === 0);
    } else if (i % 4 === 1) m.matrix = rotAt(i % 5, at[0] + 3, at[1] + 3, 2, i % 8 === 1 ? 1.5 : 1);
    else m.origin = at;
    if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
    if (i % 13 === 0) delete m.edges;
    return m;
  });
  return { name: 'r', units: 'mm', meshes, lines: [] };
}

/** 묶음마다 kind 자리 텍셀 수와 표 텍셀 수 */
const forms = (w: W, kind: string): { stride: number; tb: number; n: number }[] =>
  [...(w.r.mgGroups as Set<MergeGroup>)].map((g) => ({ stride: g.ps?.[kind]?.stride ?? 0, tb: g.ps?.[kind]?.tb ?? 0, n: g.recs.length }));

describe('0.67.0 회전 표 꼴 — 뷰어', () => {
  it('그린 도형이 끈 뷰어와 프레임마다 같고, 돌리는 프레임은 회전 표 묶음에 표 항목 + 그물마다 면 3·선 3만 올린다', () => {
    const n = 600;
    const on = view(scene(n), true), off = view(scene(n), false);
    bake(on);
    bake(off);
    expect(step(on, off, 'still', () => undefined)).toBe(0);
    // 회전 표 묶음(면 3 + 표, 선 3 + 표)과 회전이 모두 다른 한쪽 면 묶음(온 꼴 12·6)
    const F = forms(on, 'f'), E = forms(on, 'e');
    const rotF = F.filter((x) => x.tb > 0), fullF = F.filter((x) => x.tb === 0);
    expect(rotF.length).toBeGreaterThan(0);
    expect(new Set(rotF.map((x) => x.stride))).toEqual(new Set([3]));
    expect(new Set(fullF.map((x) => x.stride))).toEqual(new Set([12]));
    expect(new Set(E.filter((x) => x.tb > 0).map((x) => x.stride))).toEqual(new Set([3]));
    // 표 항목은 회전 5가지 × 늘이기 둘 + 단위(이동뿐·모형 없음) 안쪽
    for (const x of rotF) expect(x.tb / 9).toBeLessThanOrEqual(11);
    const rotN = rotF.reduce((s, x) => s + x.n, 0), fullN = fullF.reduce((s, x) => s + x.n, 0);
    const tabF = rotF.reduce((s, x) => s + x.tb, 0), tabE = E.reduce((s, x) => s + x.tb, 0);
    const t = step(on, off, 'orbit', (w) => w.v.orbitBy(0.05, 0));
    // 표 + 회전 표 묶음 면 3·선 3 + 온 꼴 묶음 면 12·선 6 — 윤곽선 없는 그물·화면 밖은 빠지고, 한 줄이 안 되는 틈은 함께 올린다
    expect(t).toBeGreaterThan(rotN * 3 + fullN * 12);
    expect(t).toBeLessThanOrEqual(tabF + tabE + rotN * 6 + fullN * 18 + 4 * 1024);
    expect(step(on, off, 'still-2', () => undefined)).toBe(0);
    step(on, off, 'hover', (w) => w.v.highlight(['b1', 'b20']));
    step(on, off, 'hide', (w) => w.v.setItemVisible('b5', false));
    step(on, off, 'orbit-hi', (w) => w.v.orbitBy(0.05, 0.01));
    step(on, off, 'group-hide', (w) => (w.v.setGroupVisible('g1', false), w.v.highlight(null)));
    step(on, off, 'section', (w) => w.v.setSection({ normal: [1, 0, 0], offset: 120 }));
    step(on, off, 'section-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'sun-shadow', (w) => w.v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }));
    step(on, off, 'shadow-orbit', (w) => w.v.orbitBy(0.05, 0));
    expect(new Set(forms(on, 'f').filter((x) => x.tb > 0).map((x) => x.stride))).toEqual(new Set([3 + 1 + 1]));
    step(on, off, 'fog', (w) => w.v.setFog({ start: 50, end: 400 }));
    step(on, off, 'fog-orbit', (w) => w.v.orbitBy(0.05, 0));
    // 겉모습이 있으면 온 꼴로 갔다가 없어지면 회전 표 꼴로 돌아온다
    step(on, off, 'look-on', (w) => w.v.setItemColor('b16', [1, 0, 0, 1]));
    expect(forms(on, 'f').every((x) => x.tb === 0)).toBe(true);
    step(on, off, 'look-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'look-off', (w) => w.v.setItemColor('b16', null));
    expect(forms(on, 'f').some((x) => x.tb > 0)).toBe(true);
    step(on, off, 'profiles-ao', (w) => (w.v.setRenderOptions({ profiles: { width: 1 } }), w.v.setAmbientOcclusion({})));
    step(on, off, 'plain', (w) => (w.v.setSection(null), w.v.setLighting(null), w.v.setFog(null), w.v.setAmbientOcclusion(null), w.v.setGroupVisible('g1', true)));
    step(on, off, 'hidden-line', (w) => (w.v.setRenderMode('hiddenLine'), w.v.setRenderOptions({ hiddenEdges: 0.4 })));
    step(on, off, 'hidden-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'shaded', (w) => (w.v.setRenderMode('shadedEdges'), w.v.highlight(['b7', 'b9', 'b13'])));
    const g = globalThis as { devicePixelRatio: number };
    g.devicePixelRatio = 2;
    try {
      step(on, off, 'dpr2', (w) => w.v.highlight(['b4', 'b9']));
      step(on, off, 'dpr2-orbit', (w) => w.v.orbitBy(0.05, 0));
    } finally {
      g.devicePixelRatio = 1;
    }
    // 같은 꼴 갈아 쓰기: 표에 없는 회전(항목을 더한다 — 그 묶음 자리를 다시 놓는다)·있는 회전·이동뿐·모형 없음, 빼기·더하기
    const box = (id: string, m: Float64Array | null, at?: [number, number, number]): Mesh3d => {
      const b = boxMesh(id, [0, 0, 0], [6, 6, 4 + (Number(id.slice(1)) % 3)], [0.9, 0.2, 0.2, 1], `g${Number(id.slice(1)) % 4}`);
      if (m) b.matrix = m;
      if (at) b.origin = at;
      return b;
    };
    step(on, off, 'swap-new', (w) => w.v.setMesh(box('b25', rotAt(9, 50, 40, 3))));
    step(on, off, 'swap-old', (w) => (w.v.setMesh(box('b33', rotAt(2, 80, 30, 1))), w.v.setMesh(box('b26', null, [0, 0, 40]))));
    step(on, off, 'swap-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'edit', (w) => (w.v.removeMesh('b29'), w.v.setMesh(box('b9', rotAt(1, 3, 3, 3)))));
    bake(on);
    bake(off);
    expect(step(on, off, 'edit-still', () => undefined)).toBe(0);
    step(on, off, 'edit-orbit', (w) => w.v.orbitBy(0.05, 0));
  });

  it('갈아 쓰기가 쌓여 표 항목이 그물 수를 넘으면 표를 처음부터 다시 세고(쓰지 않는 항목을 버린다) 그린 도형은 끈 뷰어와 같다', () => {
    const n = 40;
    const on = view(scene(n), true), off = view(scene(n), false);
    bake(on);
    bake(off);
    step(on, off, 'still', () => undefined);
    const gOf = (id: string): MergeGroup => (on.r.meshes as MeshRec[]).find((r) => r.src.id === id)!.mg!;
    const g = gOf('b1');
    const n0 = g.recs.length;
    // 같은 그물 자리에 새 회전을 거듭 준다(항목이 하나씩 는다 — 그물 수를 넘으면 버리고 다음 그리기가 다시 센다)
    for (let k = 0; k < n0 + 3; k++) {
      step(on, off, `swap-${k}`, (w) => w.v.setMesh({ ...boxMesh('b1', [0, 0, 0], [6, 6, 5], [0.4, 0.5, 0.6, 1], 'g1'), matrix: rotAt(20 + k, 13, 3, 2) }));
      const rt = gOf('b1').rt;
      if (rt) expect(rt.rm.length / 12).toBeLessThanOrEqual(gOf('b1').recs.length + 1);
    }
    step(on, off, 'orbit', (w) => w.v.orbitBy(0.05, 0));
  });
});
