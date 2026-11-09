/**
 * 0.52.0 서로 다른 작은 정적 그물 묶어 그리기(MERGE — setRenderOptions({ merging })).
 *  - 순수 계산(merge.ts): 묶음 나누기(열쇠·한도·바이트 한도·하나뿐인 묶음), 이은 배열(색인 옮기기·색인 없는 그물·정수 법선 4값·정점 색·윤곽선·그물 번호), 바이트 어림
 *  - 셰이더(mergeShader): 바꾼 글, 원본 셰이더 글자 그대로, 바꿀 자리가 없으면 예외
 *  - 뷰어: 켜면 그린 도형(정점마다 클립 좌표·시점 좌표·법선·색과 그리기 상태 — tests/drawexpand.ts)이 끔과 같은 차례·같은 값이고 그리기 호출은 준다
 *    (모드 일곱·외곽선·안개·해·강조·겉모습 색·불투명도·행렬·숨김·묶음 안 구간·화면 밖·화소 비율 2·숨은 점선·단면·그림자·인스턴싱과 섞임·놓은 법선·정수 법선·정점 색·한쪽 면),
 *    그물 바꾸기·빼기·더하기(묶음에서 빠지고 몫이 크면 다시 굽기), 문맥 잃음·되찾음, 나눠 올리기, 바이트 한도, 끄기(버퍼 놓기), 고르기는 그대로
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { MERGE_ITEMS, mergeArrays, mergeBytes, mergePlan, mergeSrcBytes, type MergeSrc } from '../src/merge';
import { MESH_VS, THIN_VS, WIDE_VS, mergeShader, withDefines } from '../src/shaders';
import { packNormals } from '../src/attribs';
import { translation } from '../src/math';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { cylinderDef, placeAt } from '../scripts/pixels/many';

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

describe('0.52.0 merge.ts 순수 계산', () => {
  it('mergePlan: 열쇠마다 장면 차례로 열린 묶음에, 한도를 넘으면 새 묶음, 하나뿐인 묶음은 버리고 바이트 한도에서 멈춘다', () => {
    const c = (key: string, nv = 10, bytes = 100) => ({ key, nv, bytes });
    const r = mergePlan([c('a'), c('b'), c('a'), c('a'), c('c'), c('b'), c('a')], Infinity, { items: 3, verts: 1000 });
    expect(r.groups).toEqual([[0, 2, 3], [1, 5], [6]].filter((g) => g.length >= 2));
    expect(r.bytes).toBe(500);
    // 정점 한도
    expect(mergePlan([c('a', 600), c('a', 600), c('a', 300)], Infinity, { items: 10, verts: 1000 }).groups).toEqual([[1, 2]]);
    // 바이트 한도: 넘을 후보부터 넣지 않는다
    expect(mergePlan([c('a'), c('a'), c('a'), c('a')], 250).groups).toEqual([[0, 1]]);
    // 그릴 정점이 없거나 한도보다 큰 후보는 건너뛴다
    expect(mergePlan([c('a', 0), c('a', 5000), c('a'), c('a')], Infinity, { items: 10, verts: 1000 }).groups).toEqual([[2, 3]]);
  });

  it('mergeArrays: 위치·법선(정수 4값)·색을 잇고 색인은 앞 정점 수만큼, 색인 없는 그물은 0, 1, 2…, 윤곽선과 그물 번호, 시작 표', () => {
    const s = (nv: number, k: number, indexed: boolean, edges: number): MergeSrc => ({
      positions: Float32Array.from({ length: nv * 3 + 2 }, (_, i) => k * 100 + i),
      nv,
      normals: Int8Array.from({ length: nv * 4 }, (_, i) => (k * 7 + i) % 100),
      per: 4,
      colors: Float32Array.from({ length: nv * 4 }, (_, i) => k + i / 1000),
      indices: indexed ? Uint32Array.from({ length: 6 }, (_, i) => (i * 2) % nv) : null,
      count: indexed ? 6 : nv - (nv % 3),
      edges: edges ? Float32Array.from({ length: edges * 6 }, (_, i) => -k - i) : null,
      ns: edges,
    });
    const list = [s(4, 1, true, 2), s(7, 2, false, 0), s(3, 3, true, 1)];
    const a = mergeArrays(list);
    expect(a.pos.length).toBe(14 * 3);
    expect(Array.from(a.pos.subarray(12, 15))).toEqual([200, 201, 202]);
    expect(a.nrm).toBeInstanceOf(Int8Array);
    expect(a.nrm!.length).toBe(14 * 4);
    expect(Array.from(a.nrm!.subarray(16, 20))).toEqual(Array.from(list[1]!.normals!.subarray(0, 4)));
    expect(Array.from(a.item)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2]);
    expect(Array.from(a.tri)).toEqual([0, 6, 12, 18]);
    expect(Array.from(a.idx.subarray(0, 6))).toEqual([0, 2, 0, 2, 0, 2]);
    expect(Array.from(a.idx.subarray(6, 12))).toEqual([4, 5, 6, 7, 8, 9]);
    expect(Array.from(a.idx.subarray(12, 18))).toEqual([11, 13, 12, 11, 13, 12]);
    expect(Array.from(a.segStart)).toEqual([0, 2, 2, 3]);
    expect(Array.from(a.segItem!)).toEqual([0, 0, 0, 0, 2, 2]);
    expect(a.seg![12]).toBe(-3);
    expect(mergeBytes(a)).toBe(list.reduce((n, x) => n + mergeSrcBytes(x), 0));
    expect(() => mergeArrays(Array.from({ length: MERGE_ITEMS + 1 }, () => s(3, 0, false, 0)))).toThrow();
  });
});

describe('0.52.0 mergeShader', () => {
  it('INST 글에서 자리 번호를 a_item으로, 색을 자리 자료에서 — 원본 셰이더 글자는 그대로', () => {
    const before = [MESH_VS, THIN_VS, WIDE_VS].join('\n');
    const m = mergeShader(withDefines(MESH_VS, 'INST', 'MERGE'), 'mesh');
    expect(m).toContain('layout(location=5) in float a_item;');
    expect(m).toContain('int k = u_instBase + int(a_item) * 12 + j;');
    expect(m).toContain('  vec4 u_color = instAt(11);\n');
    expect(m).not.toContain('uniform vec4 u_color;');
    expect(m).not.toContain('gl_InstanceID * 11');
    for (const vs of [THIN_VS, WIDE_VS]) {
      const l = mergeShader(withDefines(vs, 'INST', 'MERGE'), 'line');
      expect(l).toContain('int k = u_instBase + int(a_item) * 6 + j;');
      expect(l).toContain('  vec4 u_color = instAt(5);\n');
      expect(l).not.toContain('uniform vec4 u_color;');
    }
    expect([MESH_VS, THIN_VS, WIDE_VS].join('\n')).toBe(before);
    expect(() => mergeShader('#version 300 es\nvoid main() {}', 'mesh')).toThrow();
  });
});

/**
 * 서로 다른 그물 장면: 상자 40개(줄마다 색, 넷째마다 matrix, 다섯째마다 정점 색, 여섯째마다 한쪽 면, 일곱째는 윤곽선 없음),
 * 법선이 있는 원기둥 12개(Float32 법선 6개·Int8 4값 법선 6개 — 서로 다른 배열), 같은 정의 상자 12자리(인스턴싱), 반투명 상자 하나
 */
function scene(): Scene3d {
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < 40; i++) {
    const x = (i % 10) * 30, y = Math.floor(i / 10) * 30;
    const m = boxMesh(`d${i}`, [0, 0, 0], [10, 10, 8 + (i % 4)], [0.3 + (i % 5) * 0.1, 0.6, 0.7 - (i % 3) * 0.1, 1], `g${i % 3}`);
    if (i % 4 === 0) m.matrix = placeAt(x, y, 0, i * 9, i % 8 === 0);
    else m.origin = [x, y, 0];
    if (i % 5 === 0) m.colors = Float32Array.from({ length: 32 }, (_, k) => (k % 4 === 3 ? 1 : ((k * 37 + i) % 100) / 100));
    if (i % 6 === 0) m.doubleSided = false;
    if (i % 7 === 3) delete m.edges;
    meshes.push(m);
  }
  for (let i = 0; i < 12; i++) {
    const d = cylinderDef(3 + (i % 3), 2, 4, 6);
    const normals = i % 2 ? packNormals(d.normals!, 'int8') : d.normals!.slice();
    meshes.push({ id: `c${i}`, name: `c${i}`, positions: d.positions.slice(), normals, indices: d.indices!.slice(), edges: d.edges!.slice(), color: [0.8, 0.5 + i * 0.03, 0.3, 1], matrix: placeAt(i * 25, -40, 4, i * 30, i % 3 === 1) });
  }
  const a = boxMesh('a', [-4, -4, 0], [4, 4, 8], [0.8, 0.5, 0.3, 1]);
  for (let i = 0; i < 12; i++) meshes.push({ ...a, id: `a${i}`, name: `a${i}`, matrix: placeAt(i * 25, 150, 0, i * 15, i % 2 === 1) });
  meshes.push(boxMesh('t', [100, -80, 0], [120, -60, 20], [0.2, 0.4, 0.9, 0.5]));
  return { name: 'm', units: 'mm', meshes, lines: [] };
}

type W = { v: Viewer3d; gl: FakeGL };
function view(sc: Scene3d = scene(), merging = true, opts: { incremental?: boolean; release?: boolean | { normals?: boolean } } = {}): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  v.setRenderOptions({ merging });
  v.setScene(sc, { incremental: opts.incremental ? { budgetMs: 1 } : undefined, release: opts.release } as never);
  return { v, gl };
}
/** 묶음 굽기를 마칠 때까지 그린다 */
function bake(w: W): void {
  for (let i = 0; i < 100 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}
const shot = (w: W): string[] => expandFrame(w.gl, () => w.v.renderNow());

/** 같은 설정의 켬·끔 두 뷰어에서 펼친 도형이 같은지(그리기 호출은 켬이 적다) */
function same(set: (v: Viewer3d) => void, label: string, o: { mode?: string; zoom?: number; sc?: () => Scene3d } = {}): { on: W; off: W; mergedDraws: number } {
  const on = view(o.sc?.() ?? scene(), true);
  const off = view(o.sc?.() ?? scene(), false);
  for (const w of [on, off]) {
    if (o.mode) w.v.setRenderMode(o.mode as never);
    set(w.v);
    w.v.fit(false);
    w.v.orbitBy(0.4, 0.2);
    if (o.zoom) w.v.zoomBy(o.zoom);
  }
  bake(on);
  bake(off);
  const a = shot(off), b = shot(on);
  const dOff = off.v.stats.drawCalls;
  const st = on.v.stats;
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++)
    if (a[i] !== b[i]) {
      if (process.env.MERGE_DEBUG) console.log(`OFF ${a[i]}\nON  ${b[i]}`);
      expect(b[i], `${label} #${i}`).toBe(a[i]);
    }
  expect(st.drawCalls, label).toBeLessThanOrEqual(dOff);
  return { on, off, mergedDraws: st.merged.draws };
}

describe('0.52.0 묶어 그리기 — 뷰어', () => {
  it("기본 'auto': 묶을 수 있는 그물이 문턱(2,000)보다 적은 장면은 켜지 않는다 — 묶음·MERGE 변종 없음, 끔과 같은 그리기 기록", () => {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
    views.push(v);
    const gl = (v.canvas as unknown as FakeElement).gl!;
    v.setScene(scene());
    v.fit(false);
    v.renderNow();
    expect(v.renderOptions.merging).toEqual({ mode: 'auto', min: 2000 });
    expect(v.stats.merged).toMatchObject({ active: false, draws: 0, items: 0, groups: 0, meshes: 0, bytes: 0, pending: 0 });
    let merge = 0;
    gl.onDraw = (d) => void (d.prog?.vs.includes('a_item') && merge++);
    const auto = expandFrame(gl, () => v.renderNow());
    gl.onDraw = null;
    expect(merge).toBe(0);
    const off = view(scene(), false);
    off.v.fit(false);
    expect(auto).toEqual(shot(off));
    // 문턱을 낮추면(min) 같은 장면도 켜진다 — 'auto'는 다음 그리기에서 살핀다
    v.setRenderOptions({ merging: { min: 30 } });
    bake({ v, gl });
    expect(v.stats.merged.active).toBe(true);
    expect(v.stats.merged.meshes).toBeGreaterThan(40);
    expect(expandFrame(gl, () => v.renderNow())).toEqual(shot(off));
  });

  it('켜면 다 올린 뒤 굽고 그린 도형이 끔과 같다(모드 일곱) — 그리기 호출은 준다', () => {
    for (const mode of ['shadedEdges', 'shaded', 'wireframe', 'hiddenLine', 'xray', 'monochrome', 'noTexture']) {
      const r = same(() => undefined, mode, { mode });
      const st = r.on.v.stats;
      expect(st.merged.groups, mode).toBeGreaterThan(0);
      // 상자 40개는 정점 색·한쪽 면·법선 꼴로 나뉘고 원기둥(Float32·Int8 법선)·같은 정의 자리(인스턴싱)·반투명은 묶지 않거나 따로
      expect(st.merged.meshes, mode).toBeGreaterThan(40);
      if (mode !== 'xray') expect(r.mergedDraws, mode).toBeGreaterThan(0);
      if (mode !== 'xray' && mode !== 'wireframe') expect(st.drawCalls, mode).toBeLessThan(r.off.v.stats.drawCalls - 10);
      expect(st.merged.pending).toBe(0);
    }
  });

  it('외곽선·안개·해·숨은 점선·강조·겉모습(색·불투명도·행렬·윤곽선 색)·숨김·묶음 안 구간·화면 밖에서도 같다', () => {
    const cases: [string, (v: Viewer3d) => void, { mode?: string; zoom?: number }?][] = [
      ['profiles', (v) => v.setRenderOptions({ profiles: { width: 1 } })],
      ['profiles-color', (v) => (v.setRenderOptions({ profiles: { width: 2 } }), v.setItemProfileColor('d3', [1, 0, 0, 1]))],
      ['fog-sun', (v) => (v.setFog({ start: 50, end: 400 }), v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] } }))],
      ['hidden-dash', (v) => v.setRenderOptions({ hiddenEdges: 0.4 }), { mode: 'hiddenLine' }],
      ['shaded-dash', (v) => v.setRenderOptions({ hiddenEdges: { opacity: 0.3, shaded: true } })],
      ['highlight', (v) => v.highlight(['d1', 'd2', 'd12', 'c3', 'a2'])],
      [
        'looks',
        (v) => {
          v.setItemColor('d5', [1, 0, 0, 1]);
          v.setItemColor('d10', [0, 1, 0, 1]);
          v.setItemOpacity('d6', 0.5);
          v.setItemMatrix('d7', translation([0, 0, 30]));
          v.setItemEdgeColor('d8', [0, 0, 1, 1]);
          v.setItemVisible('d9', false);
          v.setGroupVisible('g2', false);
        },
      ],
      ['ranges', (v) => (v.setHiddenRanges('d11', [{ start: 0, count: 4 }]), v.highlightRanges({ d13: [{ start: 2, count: 2 }] }))],
      ['zoom', () => undefined, { zoom: 0.25 }],
      ['zoom-hidden', (v) => v.setRenderOptions({ hiddenEdges: 0.4 }), { mode: 'hiddenLine', zoom: 0.3 }],
      ['ao', (v) => v.setAmbientOcclusion({})],
      ['ortho', (v) => v.setProjection('orthographic')],
    ];
    for (const [name, set, o] of cases) {
      const r = same(set, name, o);
      expect(r.mergedDraws, name).toBeGreaterThan(0);
    }
  });

  it('화소 비율 2(굵은 선 — 윤곽선·숨은 점선)에서도 같다', () => {
    const g = globalThis as { devicePixelRatio: number };
    g.devicePixelRatio = 2;
    try {
      same(() => undefined, 'dpr2');
      same((v) => v.setRenderOptions({ hiddenEdges: 0.4 }), 'dpr2-hidden', { mode: 'hiddenLine' });
    } finally {
      g.devicePixelRatio = 1;
    }
  });

  it('단면이 있으면 그물마다(묶음 구간 0), 그림자를 쓰면 면은 그물마다·윤곽선은 묶음 — 둘 다 끔과 같다', () => {
    const a = same((v) => v.setSection({ normal: [1, 0, 0], offset: 120 }, { caps: 'all' }), 'section');
    expect(a.mergedDraws).toBe(0);
    const b = same((v) => v.setSections([{ normal: [1, 0, 0], offset: 120 }, { normal: [0, 1, 0], offset: 40 }]), 'sections');
    expect(b.mergedDraws).toBe(0);
    // 구간 단면(0.44.0 — 묶음 안 삼각형·선분 구간만 자르는 평면)도 그물마다
    const r = same(
      (v) =>
        v.setSections([
          { normal: [0, 0, 1], offset: 5, caps: 'all', items: [{ id: 'd3', start: 0, count: 6 }, { id: 'c2', start: 0, count: 8, edges: true }, 'd5'] },
          { normal: [1, 0, 0], offset: 200, caps: 'none' },
        ]),
      'secrange',
    );
    expect(r.mergedDraws).toBe(0);
    const c = same((v) => v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }), 'shadows');
    expect(c.mergedDraws).toBeGreaterThan(0);
    // 면은 그물마다: 묶어 그린 그물 수가 윤곽선 차례만큼
    const d = same(() => undefined, 'plain');
    expect(c.on.v.stats.merged.items).toBeLessThan(d.on.v.stats.merged.items);
  });

  it('같은 배열 자리(인스턴싱)는 묶지 않고 모은다 — 끄면(instancing: false) 그 자리도 묶지 않는다(배열을 함께 쓴다)', () => {
    const r = same(() => undefined, 'inst');
    expect(r.on.v.stats.instanced.items).toBeGreaterThan(0);
    const s = same((v) => v.setRenderOptions({ instancing: false }), 'noinst');
    expect(s.on.v.stats.instanced.items).toBe(0);
    expect(s.on.v.stats.merged.meshes).toBe(r.on.v.stats.merged.meshes);
  });

  it('그물 바꾸기·빼기·더하기: 바꾼 그물은 묶음에서 빠지고(그물마다), 빠진 몫이 ¼을 넘으면 묶음을 풀어 다시 굽는다 — 늘 끔과 같다', () => {
    const on = view(scene(), true), off = view(scene(), false);
    const both = (f: (v: Viewer3d) => void): void => {
      f(on.v);
      f(off.v);
      bake(on);
      bake(off);
      expect(shot(on)).toEqual(shot(off));
    };
    both((v) => v.fit(false));
    const n0 = on.v.stats.merged.meshes;
    // 바꾸기(같은 id, 새 배열): 그 그물만 빠진다
    both((v) => v.setMesh({ ...boxMesh('d2', [0, 0, 0], [12, 12, 12], [1, 0.5, 0, 1]), origin: [60, 0, 0] }));
    expect(on.v.stats.merged.meshes).toBe(n0 - 1);
    // 제자리 고치기(vertices): 앞 기록을 바로 뺀다
    both((v) => {
      const m = v.scene!.meshes.find((x) => x.id === 'd4')!;
      m.positions[0] = -3;
      v.setMesh(m, { vertices: [{ start: 0, count: 1 }] });
    });
    expect(on.v.stats.merged.meshes).toBe(n0 - 2);
    // 많이 빼면 그 묶음을 풀고 남은 그물로 다시 굽는다
    const g0 = on.v.stats.merged.groups;
    both((v) => {
      for (let i = 14; i < 34; i++) if (i % 7 !== 3 && i % 5 && i % 6) v.removeMesh(`d${i}`);
    });
    expect(on.v.stats.merged.groups).toBeLessThanOrEqual(g0 + 1);
    // 새 그물(묶음 밖 — 몇 개뿐이면 그물마다)
    both((v) => v.setMesh(boxMesh('new', [0, 0, 60], [5, 5, 65], [0.1, 0.9, 0.1, 1])));
    expect(on.v.stats.merged.pending).toBe(0);
  });

  it('문맥을 잃었다 되찾으면 다시 올린 뒤 다시 굽는다(같은 그림)', () => {
    const on = view(scene(), true), off = view(scene(), false);
    for (const w of [on, off]) w.v.fit(false);
    bake(on);
    const g = on.v.stats.merged.groups;
    expect(g).toBeGreaterThan(0);
    for (const w of [on, off]) {
      (w.v.canvas as unknown as FakeElement).fire('webglcontextlost', {});
      (w.v.canvas as unknown as FakeElement).fire('webglcontextrestored', {});
    }
    bake(on);
    bake(off);
    expect(on.v.stats.merged.groups).toBe(g);
    expect(shot(on)).toEqual(shot(off));
  });

  it('나눠 올리는 동안은 그물마다, 다 올린 뒤 굽는다', () => {
    const w = view(scene(), true, { incremental: true });
    w.v.renderNow();
    expect(w.v.stats.merged.groups).toBe(0);
    for (let i = 0; i < 500 && (w.v as unknown as { renderer: { uploading: boolean } }).renderer.uploading; i++) w.v.renderNow();
    bake(w);
    expect(w.v.stats.merged.groups).toBeGreaterThan(0);
    const off = view(scene(), false);
    w.v.fit(false);
    off.v.fit(false);
    expect(shot(w)).toEqual(shot(off));
  });

  it('놓은 법선(release)은 묶지 않는다 — 법선 없는 상자만 묶고 그림은 같다', () => {
    const on = view(scene(), true, { release: { normals: true } });
    const off = view(scene(), false, { release: { normals: true } });
    for (const w of [on, off]) w.v.fit(false);
    bake(on);
    expect(shot(on)).toEqual(shot(off));
    const all = view(scene(), true);
    all.v.fit(false);
    bake(all);
    expect(on.v.stats.merged.meshes).toBeLessThan(all.v.stats.merged.meshes);
  });

  it('켜면 묶음 그물의 그물마다 버퍼를 놓아 버퍼 바이트가 늘지 않고(그물 번호만큼), 끄면 그물마다 버퍼로 되돌려 끔과 같은 바이트·같은 그림', () => {
    const w = view(scene(), false);
    w.v.fit(false);
    w.v.renderNow();
    const b0 = w.v.stats.buffers.bytes, n0 = w.v.stats.buffers.count;
    const before = shot(w);
    w.v.setRenderOptions({ merging: true });
    bake(w);
    const m = w.v.stats.merged;
    expect(m.bytes).toBeGreaterThan(0);
    // 묶음 버퍼 = 그물 버퍼 사본 + 정점마다 그물 번호 2바이트·선분마다 4바이트 — 놓은 그물 버퍼만큼 빠져 합은 그물 번호만큼만 는다
    const st = w.v.stats.buffers;
    expect(st.bytes).toBeGreaterThan(b0);
    expect(st.bytes).toBeLessThan(b0 * 1.25);
    expect(st.count).toBeLessThan(n0);
    expect(shot(w)).toEqual(before);
    w.v.setRenderOptions({ merging: false });
    w.v.renderNow();
    expect(w.v.stats.merged).toMatchObject({ groups: 0, meshes: 0, bytes: 0, active: false });
    expect(w.v.stats.buffers.bytes).toBe(b0);
    expect(w.v.stats.buffers.count).toBe(n0);
    expect(shot(w)).toEqual(before);
    expect(w.v.renderOptions.merging).toEqual({ mode: 'off', min: 2000 });
  });

  it('GPU 객체: 프레임을 거듭해도 늘지 않고, 굽기·다시 굽기(빼기·바꾸기)·끄고 켜기·문맥 복구·dispose에서 만든 묶음 버퍼·VAO를 모두 지운다(그물 2,000)', () => {
    // 그물 1만으로 같은 셈(0.51.0 판과 견줌)은 시험 시간이 길어 52차 .runtime 하네스로 쟀다(README 0.52.0 "확인")
    const N = 2000;
    const big = (): Scene3d => {
      const meshes: Mesh3d[] = [];
      for (let i = 0; i < N; i++) {
        const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1]);
        m.origin = [(i % 100) * 10, Math.floor(i / 100) * 10, 0];
        if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, k) => (k % 4 === 3 ? 1 : 0.5));
        meshes.push(m);
      }
      return { name: 'big', units: 'mm', meshes, lines: [] };
    };
    const on = view(big(), true), off = view(big(), false);
    type G = { bufs: unknown[]; thin: unknown; wide: unknown };
    type R = { src: { id: string }; mg?: unknown; slots: ({ key: object } | null)[]; edges: unknown };
    const rend = (w: W): { mgGroups: Set<G>; meshes: R[] } => (w.v as unknown as { renderer: { mgGroups: Set<G>; meshes: R[] } }).renderer;
    const groups = (w: W): G[] => [...rend(w).mgGroups];
    const live = (w: W): { b: number; v: number } => ({ b: w.gl.liveBuffers, v: w.gl.vaos.filter((x) => !x.deleted).length });
    const made: number[] = [];
    /** 켠 뷰어에 있어야 할 GL 객체 수 = 끈 뷰어 − 묶음에 든 그물의 그물마다 버퍼·VAO(끈 뷰어의 같은 그물 기록으로 센다) + 묶음 버퍼·VAO */
    const expected = (): { b: number; v: number } => {
      const offRec = new Map(rend(off).meshes.map((r) => [r.src.id, r]));
      const b0 = live(off);
      let b = b0.b, v = b0.v;
      for (const r of rend(on).meshes) {
        if (!r.mg) continue;
        const o = offRec.get(r.src.id)!;
        b -= new Set(o.slots.filter(Boolean).map((s) => s!.key)).size;
        v -= 1 + (o.edges ? 2 : 0);
      }
      for (const g of groups(on)) {
        b += g.bufs.length;
        v += 1 + (g.thin ? 1 : 0) + (g.wide ? 1 : 0);
      }
      return { b, v };
    };
    /** 가짜 문맥은 잃어도 객체를 지우지 않는다 — 잃기 직전 두 뷰어의 객체 수 차(그 뒤 견줄 때 더한다) */
    let lostDiff = { b: 0, v: 0 };
    const check = (label: string): void => {
      bake(on);
      off.v.renderNow();
      const a = live(on), e = expected();
      made.push(groups(on).length);
      expect(a.b, label).toBe(e.b + lostDiff.b);
      expect(a.v, label).toBe(e.v + lostDiff.v);
    };
    const both = (f: (v: Viewer3d) => void): void => {
      f(on.v);
      f(off.v);
    };
    both((v) => v.fit(false));
    check('baked');
    expect(on.v.stats.merged.meshes).toBe(N);
    // 그물 2,000개: 끈 뷰어는 그물마다 버퍼·VAO(그물 하나에 7개 남짓), 켠 뷰어는 묶음 몇 개 몫뿐
    expect(live(on).b + live(on).v).toBeLessThan((live(off).b + live(off).v) / 20);
    // 프레임을 거듭 그려도(돌리기·모드·외곽선·주변 가림·숨은 점선·확대) GL 객체가 늘지 않는다 — 켬·끔 모두(무늬 = 자리 자료 그림·깊이 그림 포함)
    const objs = (w: W): string => JSON.stringify([live(w), w.gl.textures.filter((t) => !t.deleted).length]);
    const spin = (w: W): void => {
      for (const [mode, f] of [
        ['shadedEdges', () => w.v.setRenderOptions({ profiles: { width: 1 } })],
        ['hiddenLine', () => w.v.setRenderOptions({ profiles: null, hiddenEdges: 0.4 })],
        ['shaded', () => w.v.setAmbientOcclusion({})],
        ['shadedEdges', () => (w.v.setAmbientOcclusion(null), w.v.zoomBy(0.3))],
      ] as const) {
        w.v.setRenderMode(mode as never);
        f();
        for (let i = 0; i < 5; i++) {
          w.v.orbitBy(0.05, 0.01);
          w.v.renderNow();
        }
      }
      w.v.fit(false);
      w.v.renderNow();
    };
    for (const w of [on, off]) {
      spin(w);
      const first = objs(w);
      for (let k = 0; k < 3; k++) spin(w);
      expect(objs(w), w === on ? 'on frames' : 'off frames').toBe(first);
    }
    // 많이 빼기(묶음마다 빠진 몫 ¼ 넘음 — 풀고 남은 그물로 다시 굽기)
    both((v) => {
      for (let i = 0; i < N; i++) if (i % 10 < 3) v.removeMesh(`b${i}`);
    });
    check('removed');
    expect(on.v.stats.merged.meshes).toBe(N * 0.7);
    // 많이 바꾸기(같은 id에 새 배열 — 바꾼 그물은 빠지고 다시 굽기)
    both((v) => {
      for (let i = 0; i < N; i++) if (i % 10 === 5 || i % 10 === 6) v.setMesh({ ...boxMesh(`b${i}`, [0, 0, 0], [5, 5, 5], [0.9, 0.3, 0.2, 1]), origin: [(i % 100) * 10, Math.floor(i / 100) * 10, 0] });
    });
    check('replaced');
    expect(on.v.stats.merged.meshes).toBe(N * 0.7);
    // 끄면 묶음 버퍼·VAO가 모두 없어져 끈 뷰어와 같은 수, 다시 켜면 다시 굽는다(세 번)
    for (let k = 0; k < 3; k++) {
      on.v.setRenderOptions({ merging: false });
      on.v.renderNow();
      off.v.renderNow();
      expect(live(on), `off ${k}`).toEqual(live(off));
      on.v.setRenderOptions({ merging: true });
      check(`on ${k}`);
    }
    // 문맥 잃음·되찾음: 잃은 객체는 잊고 다시 올린 뒤 다시 굽는다(그 뒤로 묶음 수가 잃기 전과 같다)
    const lostOn = live(on), lostOff = live(off);
    lostDiff = { b: lostOn.b - lostOff.b, v: lostOn.v - lostOff.v };
    const before = made.at(-1);
    both((v) => {
      (v.canvas as unknown as FakeElement).fire('webglcontextlost', {});
      (v.canvas as unknown as FakeElement).fire('webglcontextrestored', {});
    });
    check('restored');
    expect(made.at(-1)).toBe(before);
    expect(made.every((n) => n > 0)).toBe(true);
    // dispose: 두 뷰어 모두 묶음·그물 버퍼·VAO를 남기지 않는다(같은 수 — 가짜 문맥이 잃은 뒤 쥔 옛 객체만 빼고)
    expect(live(off).b).toBeGreaterThan(0);
    on.v.dispose();
    off.v.dispose();
    const a = live(on), b = live(off);
    expect(a).toEqual({ b: b.b + lostDiff.b, v: b.v + lostDiff.v });
  });

  it('고르기·후보·키보드 후보 돌리기(pickCycle)는 그대로(CPU) — 켬·끔 같은 결과', () => {
    const on = view(scene(), true), off = view(scene(), false);
    for (const w of [on, off]) w.v.fit(false);
    bake(on);
    expect(on.v.stats.merged.meshes).toBeGreaterThan(40);
    for (let y = 60; y < 600; y += 90)
      for (let x = 60; x < 800; x += 110) {
        expect(JSON.stringify(on.v.pick(x, y))).toBe(JSON.stringify(off.v.pick(x, y)));
        expect(JSON.stringify(on.v.pick(x, y, { meshesOnly: true, throughTranslucent: true }))).toBe(JSON.stringify(off.v.pick(x, y, { meshesOnly: true, throughTranslucent: true })));
        expect(JSON.stringify(on.v.pickCandidates(x, y))).toBe(JSON.stringify(off.v.pickCandidates(x, y)));
      }
    // 키보드 고르기 모드(keyboard 켠 뷰어): Enter로 가상 커서(가운데)를 켜고 Tab으로 겹친 후보를 돌린다 — 알림 차례·후보가 같다
    const said = (merging: boolean): string[] => {
      const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: true, renderMode: 'shadedEdges', viewCube: false });
      views.push(v);
      v.setRenderOptions({ merging });
      v.setScene(scene());
      v.fit(false);
      bake({ v, gl: (v.canvas as unknown as FakeElement).gl! });
      const out: string[] = [];
      v.setKeyboardSnap({ announce: (a) => out.push(`${a.reason}|${a.index}/${a.count}|${a.pick ? `${a.pick.kind}:${a.pick.id}` : '-'}`) });
      const fire = (k: string): void => (v.canvas as unknown as FakeElement).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
      fire('Enter');
      for (let i = 0; i < 4; i++) fire('Tab');
      out.push(`merged ${v.stats.merged.meshes > 0}`);
      return out;
    };
    const a = said(true), b = said(false);
    expect(a.length).toBeGreaterThan(2);
    expect(a.slice(0, -1)).toEqual(b.slice(0, -1));
    expect([a.at(-1), b.at(-1)]).toEqual(['merged true', 'merged false']);
  });
});
