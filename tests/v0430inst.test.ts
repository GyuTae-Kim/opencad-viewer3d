/**
 * 0.43.0 단면 하나·그림자를 켠 상태의 인스턴싱(42차 남은 한계): 같은 그물 12자리의 면을 그리기 한 번으로 모으고, 자리 자료 그림에
 * 자리마다 그물마다 그릴 때의 균일 변수와 같은 float 값(u_mvp·u_mv·u_nmat 11텍셀 + 그림자면 u_shadowM 4텍셀 + 단면이면 로컬 평면 u_clip 1텍셀)을 쓰는지,
 * 텍셀 수(u_instStride)·변종(INST+SHADOW·INST+CLIP), 윤곽선은 단면이 있으면 그물마다(0.42.0 그대로)·그림자에서는 모으는지, 여러 단면은 모두 그물마다인지.
 * 가짜 WebGL2(0.42.0 시험과 같은 장면 — 같은 상자 정의 12자리, 홀수는 눕힘)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

/** 같은 상자 정의 12자리(a0~a11)와 따로 하나(c) */
function scene(): Scene3d {
  const a = boxMesh('a', [-5, -5, 0], [5, 5, 10], [0.6, 0.7, 0.8, 1]);
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < 12; i++) meshes.push({ ...a, id: `a${i}`, name: `a${i}`, matrix: placeAt((i % 4) * 30, Math.floor(i / 4) * 30, 0, i * 30, i % 2 === 1) });
  meshes.push(boxMesh('c', [150, 0, 0], [170, 20, 20], [0.4, 0.8, 0.4, 1]));
  return { name: 't', units: 'mm', meshes, lines: [] };
}
type W = { v: Viewer3d; gl: FakeGL };
function view(mode: 'shaded' | 'shadedEdges' = 'shaded'): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: mode, viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  gl.logDraws = true;
  v.setScene(scene());
  return { v, gl };
}
function frame(w: W): DrawEntry[] {
  w.gl.draws = [];
  w.v.renderNow();
  return w.gl.draws;
}
function uni(e: DrawEntry, name: string): unknown[] | undefined {
  return new Map(JSON.parse(e.uniforms) as [string, unknown[]][]).get(name);
}
const mat = (e: DrawEntry, name: string): number[] => uni(e, name)![0] as number[];
/** 자리 자료 그림(단위 5)의 텍셀 [k, k + n) 값(−0을 0으로) */
function texels(w: W, k: number, n: number): number[] {
  const t = w.gl.textureAt(5);
  return Array.from(t!.floats!.subarray(k * 4, (k + n) * 4), (x) => x + 0);
}
const faceInst = (d: DrawEntry[]): DrawEntry[] => d.filter((e) => e.op === 'drawElementsInstanced');

/**
 * 모아 그린 자리 자료(12자리 × stride)를 그물마다 그린 면 그리기(인스턴싱 끔 — 화면 그리기만: pick으로 고른 것)의 균일 변수와 견준다
 */
function sameAsPerMesh(w: W, stride: number, pick: (e: DrawEntry) => boolean, o: { shadow: boolean; clip: boolean }): void {
  const d = frame(w);
  const inst = faceInst(d);
  expect(inst.map((e) => e.args[4])).toEqual([12]);
  expect(uni(inst[0]!, 'u_instStride')).toEqual([stride]);
  const base = uni(inst[0]!, 'u_instBase')![0] as number;
  const data = Array.from({ length: 12 }, (_, i) => texels(w, base + i * stride, stride));
  w.v.setRenderOptions({ instancing: false });
  const per = frame(w).filter((e) => e.op === 'drawElements' && pick(e));
  expect(faceInst(frame(w))).toEqual([]);
  w.v.setRenderOptions({ instancing: true });
  for (let i = 0; i < 12; i++) {
    const e = per[i]!, t = data[i]!;
    expect(t.slice(0, 16)).toEqual(mat(e, 'u_mvp'));
    expect(t.slice(16, 32)).toEqual(mat(e, 'u_mv'));
    expect([t[32], t[33], t[34], t[36], t[37], t[38], t[40], t[41], t[42]]).toEqual(mat(e, 'u_nmat'));
    if (o.shadow) expect(t.slice(44, 60)).toEqual(mat(e, 'u_shadowM'));
    // u_clip은 uniform4f(double — GL이 float32로 바꾼다)라 같은 반올림으로 견준다
    if (o.clip) expect(t.slice((stride - 1) * 4, stride * 4)).toEqual((uni(e, 'u_clip') as number[]).map((x) => Math.fround(x) + 0));
  }
}

describe('0.43.0 단면 하나·그림자를 켠 인스턴싱', () => {
  it('단면 하나: 면은 INST+CLIP 변종 한 번(자리 12텍셀 — 맨 끝이 로컬 평면), 자리 자료 = 그물마다 그릴 때의 u_mvp·u_mv·u_nmat·u_clip', () => {
    const w = view();
    w.v.setSection({ normal: [1, 0, 0], offset: 40 });
    sameAsPerMesh(w, 12, (e) => uni(e, 'u_clip') !== undefined, { shadow: false, clip: true });
    // 자리마다 로컬 평면이 다르다(돌린 자리 — 같은 값이면 자리 자료가 필요 없었다)
    const d = frame(w);
    const base = uni(faceInst(d)[0]!, 'u_instBase')![0] as number;
    const planes = Array.from({ length: 12 }, (_, i) => texels(w, base + i * 12 + 11, 1).join());
    expect(new Set(planes).size).toBeGreaterThan(1);
  });

  it('그림자: 면은 INST+SHADOW 변종 한 번(자리 15텍셀 — 11~14가 그림자 행렬), 자리 자료 = 그물마다 그릴 때의 u_shadowM', () => {
    const w = view();
    w.v.setLighting({ sun: { direction: [0, -0.5, 1] }, shadows: true });
    sameAsPerMesh(w, 15, (e) => uni(e, 'u_shadowM') !== undefined, { shadow: true, clip: false });
  });

  it('단면 하나 + 그림자: 자리 16텍셀(그림자 행렬 11~14, 로컬 평면 15)', () => {
    const w = view();
    w.v.setLighting({ sun: { direction: [0.2, -0.5, 1] }, shadows: true });
    w.v.setSection({ normal: [0, 1, 0], offset: 30 }, { caps: 'none' });
    sameAsPerMesh(w, 16, (e) => uni(e, 'u_shadowM') !== undefined && uni(e, 'u_clip') !== undefined, { shadow: true, clip: true });
  });

  it('윤곽선: 단면이 있으면 그물마다(0.42.0 그대로), 그림자에서는 모은다 — 여러 단면은 면·선 모두 그물마다', () => {
    const w = view('shadedEdges');
    const n = (): [number[], number[]] => {
      const d = frame(w);
      return [faceInst(d).map((e) => e.args[4]!), d.filter((e) => e.op === 'drawArraysInstanced' && uni(e, 'u_instBase') !== undefined).map((e) => e.args[3]!)];
    };
    w.v.setSection({ normal: [1, 0, 0], offset: 40 });
    expect(n()).toEqual([[12], []]);
    w.v.setSection(null);
    w.v.setLighting({ sun: { direction: [0, -0.5, 1] }, shadows: true });
    expect(n()).toEqual([[12], [12]]);
    w.v.setLighting(null);
    w.v.setSections([
      { normal: [1, 0, 0], offset: 40 },
      { normal: [0, 1, 0], offset: 30 },
    ]);
    expect(n()).toEqual([[], []]);
  });

  it('외곽선 깊이 그림도 단면 하나에서 모은다(같은 INST+CLIP 변종 — 깊이만)', () => {
    const w = view();
    w.v.setRenderOptions({ profiles: true });
    w.v.setSection({ normal: [1, 0, 0], offset: 40 }, { caps: 'none' });
    const d = frame(w);
    // 화면 면 한 번 + 외곽선 깊이 그림 한 번(stats에는 0.42.0처럼 깊이 그림을 세지 않는다)
    const inst = faceInst(d);
    expect(inst.map((e) => e.args[4])).toEqual([12, 12]);
    expect(inst.every((e) => uni(e, 'u_instStride')![0] === 12)).toBe(true);
    expect(w.v.stats.instanced).toMatchObject({ draws: 1, items: 12 });
  });
});
