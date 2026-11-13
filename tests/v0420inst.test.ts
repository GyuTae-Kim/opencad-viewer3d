/**
 * 0.42.0 같은 그물 자리 모아 그리기(인스턴싱): 같은 배열을 함께 쓰는 자리가 하한(8) 이상이면 그리기 한 번(drawElementsInstanced·drawArraysInstanced),
 * 자리 자료 그림의 자리마다 값이 그물마다 그릴 때의 균일 행렬(u_mvp·u_mv·u_nmat, 선은 u_mvp)과 같은 float인지, 굵은 선은 선분 나눔 수를 자리 수로 걸었다가
 * 되돌리는지, 그물마다로 돌아가는 경우(여러 단면·단면의 선·묶음 안 구간·반투명·끔·하한 — 0.43.0부터 단면 하나·그림자의 면은 모은다: v0430inst)와
 * 묶음 나누기(자리 색·강조), 켬·끔 삼각형·선분 수, 병렬 번역을 기다리는 동안
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { INSTANCE_MIN } from '../src/renderer';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { manyScene, placeAt } from '../scripts/pixels/many';

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

/** 같은 상자 정의를 12자리(a0~a11 — 홀수는 눕힘), 다른 정의를 3자리(b0~b2 — 하한 아래), 따로 하나(c) */
function scene(o: { edges?: boolean } = {}): Scene3d {
  const a = boxMesh('a', [-5, -5, 0], [5, 5, 10], [0.6, 0.7, 0.8, 1]);
  const b = boxMesh('b', [-3, -3, 0], [3, 3, 6], [0.8, 0.5, 0.3, 1]);
  if (o.edges === false) {
    delete a.edges;
    delete b.edges;
  }
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < 12; i++) meshes.push({ ...a, id: `a${i}`, name: `a${i}`, group: `g${i % 3}`, matrix: placeAt((i % 4) * 30, Math.floor(i / 4) * 30, 0, i * 30, i % 2 === 1) });
  for (let i = 0; i < 3; i++) meshes.push({ ...b, id: `b${i}`, name: `b${i}`, matrix: placeAt(i * 30, -40, 0, 0, false) });
  meshes.push(boxMesh('c', [150, 0, 0], [170, 20, 20], [0.4, 0.8, 0.4, 1]));
  return { name: 't', units: 'mm', meshes, lines: [] };
}

type W = { v: Viewer3d; gl: FakeGL };
function view(sc: Scene3d = scene(), mode: 'shaded' | 'shadedEdges' | 'wireframe' | 'hiddenLine' | 'xray' = 'shaded'): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: mode, viewCube: false });
  views.push(v);
  // 0.69.0 이 시험은 자리마다 온 행렬 꼴(겉모습이 있을 때 쓰는 꼴)의 자리 자료를 본다 — 회전 표 꼴(기본)은 v0690rot이 본다
  (v as unknown as { renderer: { instRotOff: boolean } }).renderer.instRotOff = true;
  const gl = (v.canvas as unknown as FakeElement).gl!;
  gl.logDraws = true;
  v.setScene(sc);
  return { v, gl };
}
/** 한 번 그린 그리기 기록 */
function frame(w: W): DrawEntry[] {
  w.gl.draws = [];
  w.v.renderNow();
  return w.gl.draws;
}
const opName = (w: W, e: DrawEntry): string => w.gl.nameOf(e.args[0]!) ?? '';
const instanced = (d: DrawEntry[]): DrawEntry[] => d.filter((e) => e.op === 'drawElementsInstanced' || (e.op === 'drawArraysInstanced' && e.uniforms.includes('"u_instBase"')));
/** 그리기 기록의 균일 변수 값(행렬은 배열 하나, 나머지는 값들) */
function uni(e: DrawEntry, name: string): unknown[] {
  const m = new Map(JSON.parse(e.uniforms) as [string, unknown[]][]);
  return m.get(name)!;
}
const mat = (e: DrawEntry, name: string): number[] => uni(e, name)[0] as number[];
/** 자리 자료 그림(단위 5)의 텍셀 [k, k + n) 값(기록의 균일 변수는 JSON이라 −0을 0으로 견준다) */
function texels(w: W, k: number, n: number): number[] {
  const t = w.gl.textureAt(5);
  return Array.from(t!.floats!.subarray(k * 4, (k + n) * 4), (x) => x + 0);
}

describe('0.42.0 같은 그물 자리 모아 그리기', () => {
  it('같은 정의 12자리는 그리기 한 번, 3자리(하한 아래)·하나뿐인 그물은 그물마다', () => {
    expect(INSTANCE_MIN).toBe(8);
    const w = view();
    const d = frame(w);
    const inst = instanced(d);
    expect(inst.map((e) => e.args[4])).toEqual([12]);
    expect(opName(w, inst[0]!)).toBe('TRIANGLES');
    expect(d.filter((e) => e.op === 'drawElements').length).toBe(4);
    const st = w.v.stats;
    // 그리기 호출 = 면 5(모아서 1 + 그물마다 4) + 격자 4
    expect([st.drawCalls, st.triangles]).toEqual([5 + 4, 16 * 12]);
    expect(st.instanced).toEqual({ draws: 1, items: 12, pending: 0 });
    expect(w.v.renderOptions.instancing).toEqual({ on: true, min: 8 });
  });

  it('자리 자료 = 그물마다 그릴 때의 균일 행렬(u_mvp·u_mv·u_nmat, 같은 float 값·장면 차례)', () => {
    const w = view();
    frame(w);
    const data = Array.from({ length: 12 }, (_, i) => texels(w, i * 11, 11));
    w.v.setRenderOptions({ instancing: false });
    const per = frame(w).filter((e) => e.op === 'drawElements');
    expect(instanced(per)).toEqual([]);
    for (let i = 0; i < 12; i++) {
      const e = per[i]!;
      const t = data[i]!;
      expect(t.slice(0, 16)).toEqual(mat(e, 'u_mvp'));
      expect(t.slice(16, 32)).toEqual(mat(e, 'u_mv'));
      expect([t[32], t[33], t[34], t[36], t[37], t[38], t[40], t[41], t[42]]).toEqual(mat(e, 'u_nmat'));
    }
  });

  it('윤곽선(화소 비율 1 — 가는 선)도 묶음마다 한 번, 자리 자료는 그물마다 그릴 때의 u_mvp', () => {
    const w = view(scene(), 'shadedEdges');
    const d = frame(w);
    const lines = instanced(d).filter((e) => e.op === 'drawArraysInstanced');
    expect(lines.map((e) => [opName(w, e), e.args[1], e.args[2], e.args[3]])).toEqual([['LINES', 0, 24, 12]]);
    // 선 자료는 그 그리기의 u_instBase부터 5텍셀씩(0.68.0 자리 자료 저장소 — 그물 자료 12 × 11텍셀 바로 뒤, 0.67.0까지는 둘째 줄 텍셀 1024부터)
    const at = uni(lines[0]!, 'u_instBase')[0] as number;
    expect(at).toBe(12 * 11);
    const data = Array.from({ length: 12 }, (_, i) => texels(w, at + i * 5, 4));
    w.v.setRenderOptions({ instancing: false });
    // 그물 윤곽선 16개(가는 선) 뒤에 격자 넷
    const per = frame(w).filter((e) => e.op === 'drawArrays' && w.gl.nameOf(e.args[0]!) === 'LINES');
    expect(per.length).toBe(16 + 4);
    for (let i = 0; i < 12; i++) expect(data[i]).toEqual(mat(per[i]!, 'u_mvp'));
  });

  it('강조 윤곽선(굵기 2 — 굵은 선)은 선분 속성 나눔 수를 자리 수로 걸고 그린 뒤 1로 되돌린다', () => {
    const w = view(scene(), 'shadedEdges');
    w.v.highlight(['a0', 'a5']);
    const d = instanced(frame(w)).filter((e) => e.op === 'drawArraysInstanced');
    const wide = d.find((e) => opName(w, e) === 'TRIANGLE_STRIP')!;
    expect(wide.args.slice(1)).toEqual([0, 4, 12 * 2]);
    expect(wide.attribs.filter((a) => /^[12]:/.test(a)).map((a) => a.split(':')[1])).toEqual(['3/24/0/2', '3/24/12/2']);
    expect(uni(wide, 'u_instN')).toEqual([2]);
    expect(uni(wide, 'u_width')).toEqual([2]);
    // 같은 VAO를 그물마다 그릴 때는 나눔 수 1
    w.v.setRenderOptions({ instancing: false });
    const per = frame(w).filter((e) => e.op === 'drawArraysInstanced' && opName(w, e) === 'TRIANGLE_STRIP');
    expect(per.length).toBe(2);
    for (const e of per) expect(e.attribs.filter((a) => /^[12]:/.test(a)).map((a) => a.split(':')[1])).toEqual(['3/24/0/1', '3/24/12/1']);
  });

  it('그물마다로 돌아가는 경우: 여러 단면·단면의 선·묶음 안 구간·반투명·끔·하한, 자리 색은 묶음을 나눈다(0.43.0: 단면 하나·그림자의 면은 모은다)', () => {
    const w = view(scene(), 'shadedEdges');
    // [면 묶음 자리 수…] | [선 묶음 자리 수…](각각 작은 차례로)
    const n = (): string => {
      const d = instanced(frame(w));
      const f = d.filter((e) => e.op === 'drawElementsInstanced').map((e) => e.args[4]!);
      const l = d.filter((e) => e.op === 'drawArraysInstanced').map((e) => e.args[3]!);
      return `${f.sort((x, y) => x - y).join(',')}|${l.sort((x, y) => x - y).join(',')}`;
    };
    expect(n()).toBe('12|12');
    // 0.43.0 단면 하나: 면은 모으고(자리마다 로컬 평면을 자리 자료에), 윤곽선은 그물마다(0.42.0 그대로)
    w.v.setSection({ normal: [1, 0, 0], offset: 40 });
    expect(n()).toBe('12|');
    w.v.setSection(null);
    // 여러 단면은 모두 그물마다
    w.v.setSections([{ normal: [1, 0, 0], offset: 40 }, { normal: [0, 1, 0], offset: 30 }]);
    expect(n()).toBe('|');
    w.v.setSections(null);
    w.v.setLighting({ sun: { direction: [0, -0.5, 1] }, shadows: true });
    // 0.43.0 그림자: 면도 모은다(자리마다 그림자 행렬을 자리 자료에), 윤곽선은 0.42.0처럼 모아서
    expect(n()).toBe('12|12');
    w.v.setLighting(null);
    // 묶음 안 구간이 있는 a0은 면·윤곽선 모두 그물마다, 반투명 a1은 면이 반투명 차례(그물마다)·윤곽선은 불투명도가 달라 따로 한 묶음
    w.v.setHiddenRanges('a0', [{ start: 0, count: 2 }]);
    w.v.setItemOpacity('a1', 0.5);
    expect(n()).toBe('10|1,10');
    // 자리 색이 다르면 면 묶음이 나뉜다(음영+윤곽 윤곽선 색은 그물 색과 상관없다)
    w.v.setItemColor('a2', '#ff0000');
    expect(n()).toBe('1,9|1,10');
    // 하한은 보이는 같은 그물 자리 수(12)와 견준다
    w.v.setRenderOptions({ instancing: { min: 13 } });
    expect(n()).toBe('|');
    w.v.setRenderOptions({ instancing: { min: 12 } });
    expect(n()).toBe('1,9|1,10');
    w.v.setGroupVisible('g0', false);
    expect(n()).toBe('|');
    w.v.setGroupVisible('g0', true);
    w.v.setRenderOptions({ instancing: false });
    expect(n()).toBe('|');
    expect(w.v.renderOptions.instancing).toEqual({ on: false, min: 8 });
    w.v.setRenderOptions({ instancing: true });
    expect(w.v.renderOptions.instancing).toEqual({ on: true, min: 8 });
  });

  it('켬·끔 삼각형·선분 수가 같다(음영·음영+윤곽·와이어프레임 삼각형 변·숨은 선 점선·X-ray), 그리기 호출만 준다', () => {
    for (const [mode, edges] of [
      ['shaded', true],
      ['shadedEdges', true],
      ['wireframe', false],
      ['hiddenLine', true],
      ['xray', true],
    ] as const) {
      const w = view(scene({ edges }), mode);
      w.v.setRenderOptions({ hiddenEdges: true });
      frame(w);
      const on = w.v.stats;
      w.v.setRenderOptions({ instancing: false });
      frame(w);
      const off = w.v.stats;
      expect([mode, on.triangles, on.segments]).toEqual([mode, off.triangles, off.segments]);
      expect(on.instanced.draws).toBeGreaterThan(0);
      expect(on.drawCalls).toBeLessThan(off.drawCalls);
      expect(off.instanced).toEqual({ draws: 0, items: 0, pending: 0 });
    }
  });

  it('윤곽선 없는 그물의 와이어프레임 삼각형 변은 묶음 첫 그물의 색인 하나로 그린다', () => {
    const w = view(scene({ edges: false }), 'wireframe');
    const d = instanced(frame(w));
    const lines = d.filter((e) => e.op === 'drawElementsInstanced' && opName(w, e) === 'LINES');
    expect(lines.map((e) => [e.args[1], e.args[4]])).toEqual([[12 * 6, 12]]);
  });

  it('병렬 번역(KHR_parallel_shader_compile): 다 될 때까지 그물마다 그리고 기다리는 수를 알린 뒤, 다 되면 모아 그린다', () => {
    const w = view();
    const r = (w.v as unknown as { renderer: { parallel: object | null } }).renderer;
    r.parallel = {};
    w.gl.compileDone = false;
    // 같은 장면을 새로(이미 만든 변종은 남으므로 다른 모드로 새 변종을 부른다)
    w.v.setRenderMode('monochrome');
    expect(instanced(frame(w))).toEqual([]);
    // 면·윤곽선 변종 둘을 기다리는 동안 그물마다(면 16 + 윤곽선 16 + 격자 4)
    expect(w.v.stats.instanced.pending).toBe(2);
    expect(w.v.stats.drawCalls).toBe(16 + 16 + 4);
    w.gl.compileDone = true;
    expect(instanced(frame(w)).map((e) => e.args[e.op === 'drawElementsInstanced' ? 4 : 3])).toEqual([12, 12]);
    expect(w.v.stats.instanced.pending).toBe(0);
    expect(w.v.stats.drawCalls).toBe(5 + 5 + 4);
  });

  it('비용 재기 합성 장면(정의 12 × 자리 3,000)은 정의마다 배열을 함께 쓴다', () => {
    const s = manyScene({ defs: 12, modules: 30, perModule: 100, triangles: 613 });
    expect([s.meshes.length, s.triangles]).toEqual([3000, 1_820_000]);
    expect(new Set(s.meshes.map((m) => m.positions)).size).toBe(12);
    expect(new Set(s.meshes.map((m) => m.edges)).size).toBe(12);
  });
});
