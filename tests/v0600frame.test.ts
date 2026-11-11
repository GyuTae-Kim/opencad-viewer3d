/**
 * 0.60.0 다 묶은 뒤 프레임의 CPU 비용(59차 남은 한계 — 가짜 WebGL 8만 그물을 다 묶은 뒤 프레임 100 ms 안팎).
 *  - 그리기 뼈대(장면 차례의 묶음 덩이 — 조각 orderBuild): 덩이를 예외 그물(숨김·잘라냄·강조) 사이 구간으로 통째로 더하고, 숨김 판(visKey)이 같으면 보이는 목록을 다시 쓴다.
 *    뼈대 길과 끈 길(renderer.orderOff — 0.59.0처럼 그물마다 훑기)의 GL 호출이 인자·올린 자리 자료까지 같다
 *    (모드 일곱·강조·숨김·화면 밖·단면 하나·여러 단면·겉모습·묶음 안 구간과 그 해제·선 색·외곽선·주변 가림·그림자·안개·화소 비율 2, 그물 바꾸기·빼기·더하기·장면 바꾸기)
 *  - 단면 하나에서도 묶음 선(윤곽선·숨은 점선 — 자리마다 로컬 평면): 끔과 같은 도형(drawexpand), GL 호출이 그물 수만큼 늘지 않는다
 *  - 자리 자료 공통 열(이동뿐인 모형): faceTexels·lineTexels와 비트까지 같다(−0 칸·큰 원점·그림자·단면·안개)
 *  - 숨김 판이 같으면 그물마다 보이는지 묻지 않는다, 묶은 그물은 인스턴싱 셈(그물 열쇠 Map)에 넣지 않는다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type FakeGL, fnv } from './fakegl';
import { expandFrame } from './drawexpand';
import { faceFill, faceTexels, lineFill, lineTexels, mergeShader, orderBuild, orderValid, shiftOnly } from '../src/mergegl';
import { mergeSorted, type MergeGroup, type MergeRun, type MeshRec } from '../src/renderer';
import { THIN_VS, WIDE_VS, withDefines } from '../src/shaders';
import { mat4Mul, perspective, translation } from '../src/math';
import { planeToLocal } from '../src/section';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Rgba, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';
import { packNormals } from '../src/attribs';
import { cylinderDef } from '../scripts/pixels/many';

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

/** v0520merge와 같은 꼴의 섞인 장면(행렬·원점·정점 색·한쪽 면·윤곽선 없음·정수 법선 원기둥·같은 정의 자리·반투명) */
function mixed(): Scene3d {
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
    meshes.push({ id: `c${i}`, name: `c${i}`, positions: d.positions.slice(), normals, indices: d.indices!.slice(), edges: d.edges!.slice(), color: [0.8, 0.5 + i * 0.03, 0.3, 1], origin: [i * 25, -40, 4] });
  }
  const a = boxMesh('a', [-4, -4, 0], [4, 4, 8], [0.8, 0.5, 0.3, 1]);
  for (let i = 0; i < 12; i++) meshes.push({ ...a, id: `a${i}`, name: `a${i}`, matrix: placeAt(i * 25, 150, 0, i * 15, i % 2 === 1) });
  meshes.push(boxMesh('t', [100, -80, 0], [120, -60, 20], [0.2, 0.4, 0.9, 0.5]));
  for (let i = 0; i < 30; i++) {
    const m = boxMesh(`e${i}`, [0, 0, 0], [6, 6, 6], [0.5, 0.3 + (i % 4) * 0.1, 0.4, 1], `g${i % 2}`);
    m.origin = [(i % 6) * 12 - 100, Math.floor(i / 6) * 12 + 60, 0];
    meshes.push(m);
  }
  return { name: 'm', units: 'mm', meshes, lines: [] };
}

/** 같은 열쇠 상자 n개(줄 300개) — 묶음 단위(2,048)를 넘는 덩이 */
function grid(n: number): Scene3d {
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`);
    m.origin = [(i % 60) * 10, Math.floor(i / 60) * 10, 0];
    if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.5));
    return m;
  });
  return { name: 'g', units: 'mm', meshes, lines: [] };
}

type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown>; log: string[] | null };

/** GL 호출 한 줄(이름·인자 — 객체는 번호, 배열은 바이트 해시, 자리 자료 올리기는 올린 영역만) */
function line(k: string, a: unknown[]): string {
  const f = (x: unknown): string => {
    if (x === null || x === undefined || typeof x === 'number' || typeof x === 'boolean') return String(x);
    if (typeof x === 'string') return `s${fnv(new TextEncoder().encode(x))}`;
    if (ArrayBuffer.isView(x)) return `${x.constructor.name}:${fnv(new Uint8Array(x.buffer, x.byteOffset, x.byteLength))}`;
    const o = x as { id?: number; p?: { id: number }; name?: string };
    if (o.p && o.name) return `u${o.p.id}.${o.name}`;
    if (o.id !== undefined) return `#${o.id}`;
    return JSON.stringify(x);
  };
  if (k === 'texSubImage2D') {
    const src = a[8] as Float32Array, off = (a[9] as number | undefined) ?? 0, n = (a[4] as number) * (a[5] as number) * 4;
    return `${k}(${a.slice(0, 8).map(f).join(',')},${f(src.subarray(off, off + n))})`;
  }
  return `${k}(${a.map(f).join(',')})`;
}

function view(sc: Scene3d, orderOff: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  r.orderOff = orderOff;
  const w: W = { v, gl, r, log: null };
  // 렌더러가 쓰는 문맥을 GL 호출 기록으로 감싼다(조각도 렌더러의 gl을 쓴다)
  const base = r.gl as Record<string | symbol, unknown>;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        if (w.log && typeof k === 'string') w.log.push(line(k, a));
        return (x as (...y: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  v.setRenderOptions({ merging: true });
  v.setScene(sc);
  return w;
}

function bake(w: W): void {
  w.v.renderNow();
  for (let i = 0; i < 100 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}

/** 한 프레임의 GL 호출 기록 */
function calls(w: W): string[] {
  w.log = [];
  w.v.renderNow();
  const out = w.log;
  w.log = null;
  return out;
}

/** 뼈대 켬·끔 두 뷰어에서 같은 조작 뒤 프레임마다 GL 호출이 같은지(steps마다 조작 → 프레임 둘: 그대로·돌려서). 켬 쪽 뼈대를 썼는지도 */
function sameCalls(label: string, sc: () => Scene3d, steps: ((v: Viewer3d) => void)[], o: { zoom?: number; mode?: string } = {}): { on: W; off: W } {
  const on = view(sc(), false), off = view(sc(), true);
  for (const w of [on, off]) {
    if (o.mode) w.v.setRenderMode(o.mode as never);
    w.v.fit(false);
    w.v.orbitBy(0.4, 0.2);
    if (o.zoom) w.v.zoomBy(o.zoom);
    bake(w);
  }
  let k = 0;
  for (const step of steps) {
    for (const w of [on, off]) step(w.v);
    for (const turn of [0, 0.05]) {
      for (const w of [on, off]) if (turn) w.v.orbitBy(turn, 0);
      for (const w of [on, off]) bake(w);
      const a = calls(off), b = calls(on);
      expect(b.length, `${label} #${k} 호출 수`).toBe(a.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${k} 호출 ${i}`).toBe(a[i]);
      // 그리기 수·묶음·잘라낸 수 등(시간 값 frameMs·bakeMs는 뺀다)
      const st = (w: W): unknown => JSON.parse(JSON.stringify(w.v.stats, (key, x) => (key === 'frameMs' || key === 'bakeMs' ? undefined : x)));
      expect(st(on), `${label} #${k}`).toEqual(st(off));
      expect(on.gl.liveBuffers, `${label} #${k} 버퍼`).toBe(off.gl.liveBuffers);
      k++;
    }
  }
  expect(on.r.mgOrder, label).not.toBeNull();
  expect(off.r.mgOrder, label).toBeNull();
  return { on, off };
}

describe('0.60.0 그리기 뼈대 — 끈 길(0.59.0 그물마다 훑기)과 GL 호출이 같다', () => {
  it('모드 일곱(가만히·돌린 프레임)', () => {
    for (const mode of ['shadedEdges', 'shaded', 'wireframe', 'hiddenLine', 'xray', 'monochrome', 'noTexture']) sameCalls(mode, mixed, [() => undefined], { mode });
  });

  it('강조·숨김(항목·묶음)·화면 밖 — 덩이를 예외 사이 구간으로', () => {
    sameCalls('hi-hide', mixed, [
      (v) => v.highlight(['d1', 'd2', 'd12', 'c3', 'a2', 'e5', 'e6', 'e29']),
      (v) => (v.setItemVisible('d9', false), v.setItemVisible('e7', false)),
      (v) => v.setGroupVisible('g1', false),
      (v) => (v.setGroupVisible('g1', true), v.highlight(null)),
    ]);
    sameCalls('zoom', mixed, [() => undefined, (v) => v.highlight(['e3', 'e4']), (v) => v.zoomBy(2)], { zoom: 0.25 });
    // 묶음 단위를 넘는 덩이: 7번째마다 숨김·11번째마다 강조·화면 밖
    sameCalls(
      'grid',
      () => grid(3000),
      [
        () => undefined,
        (v) => {
          for (let i = 0; i < 3000; i += 7) v.setItemVisible(`b${i}`, false);
        },
        (v) => v.highlight(Array.from({ length: 273 }, (_, i) => `b${i * 11}`)),
        (v) => v.zoomBy(0.3),
        (v) => v.setGroupVisible('g2', false),
      ],
    );
  });

  it('단면 하나(채우기·화소 비율 2·숨은 점선·안개·그림자)·여러 단면', () => {
    sameCalls('section', mixed, [(v) => v.setSection({ normal: [1, 0, 0], offset: 120 }, { caps: 'all' }), (v) => v.setSection({ normal: [0, 1, 0], offset: 40 })]);
    sameCalls('section-grid', () => grid(3000), [(v) => v.setSection({ normal: [1, 0, 0], offset: 302 }, { caps: 'all' }), (v) => v.highlight(['b5', 'b77'])]);
    sameCalls('section-dash', mixed, [(v) => (v.setRenderOptions({ hiddenEdges: 0.4 }), v.setSection({ normal: [1, 0, 0], offset: 120 }))], { mode: 'hiddenLine' });
    sameCalls('section-fog-sun', mixed, [(v) => (v.setSection({ normal: [1, 0, 0], offset: 120 }), v.setFog({ start: 50, end: 400 }), v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }))]);
    sameCalls('sections', mixed, [(v) => v.setSections([{ normal: [1, 0, 0], offset: 120 }, { normal: [0, 1, 0], offset: 40 }])]);
    const g = globalThis as { devicePixelRatio: number };
    g.devicePixelRatio = 2;
    try {
      sameCalls('section-dpr2', mixed, [(v) => v.setSection({ normal: [1, 0, 0], offset: 120 }), (v) => v.setRenderOptions({ hiddenEdges: { opacity: 0.3, shaded: true } })]);
    } finally {
      g.devicePixelRatio = 1;
    }
  });

  it('겉모습·묶음 안 구간과 그 해제(구간 모음을 지운다)·선 색·외곽선·주변 가림', () => {
    sameCalls('looks', mixed, [
      (v) => (v.setItemColor('d5', [1, 0, 0, 1]), v.setItemOpacity('e6', 0.5), v.setItemMatrix('e7', translation([0, 0, 30])), v.setItemEdgeColor('e8', [0, 0, 1, 1])),
      (v) => (v.setItemColor('d5', null), v.setItemOpacity('e6', 1), v.setItemMatrix('e7', null), v.setItemEdgeColor('e8', null)),
    ]);
    sameCalls('ranges', mixed, [
      (v) => (v.setHiddenRanges('e11', { prims: [{ start: 0, count: 4 }], edges: [{ start: 0, count: 3 }] }), v.highlightRanges({ e13: { prims: [{ start: 2, count: 2 }], edges: [{ start: 1, count: 2 }] } })),
      (v) => (v.setHiddenRanges('e11', null), v.highlightRanges(null)),
      () => undefined,
    ]);
    sameCalls('edge-colors', mixed, [(v) => v.setRenderOptions({ edgeColor: [1, 0, 0, 1] }), (v) => v.setRenderOptions({ edgeColor: 'contrast' })]);
    sameCalls('edge-colors-wire', mixed, [(v) => v.setRenderOptions({ edgeColor: 'contrast' })], { mode: 'wireframe' });
    sameCalls('profiles-ao', mixed, [(v) => v.setRenderOptions({ profiles: { width: 1 } }), (v) => v.setAmbientOcclusion({})]);
  });

  it('그물 바꾸기·빼기·더하기·장면 바꾸기 — 뼈대를 다시 만든다', () => {
    const { on } = sameCalls('edit', mixed, [
      (v) => v.setMesh({ ...boxMesh('e3', [0, 0, 0], [6, 6, 9], [0.9, 0.2, 0.2, 1]), origin: [0, 0, 40] }),
      (v) => v.removeMesh('e10'),
      (v) => v.setMesh({ ...boxMesh('n1', [0, 0, 0], [5, 5, 5], [0.2, 0.9, 0.2, 1]), origin: [50, 50, 50] }),
      (v) => v.setScene(grid(500)),
      (v) => v.setItemVisible('b3', false),
    ]);
    expect(on.v.stats.merged.groups).toBeGreaterThan(0);
  });
});

describe('0.60.0 단면 하나에서 묶음 선', () => {
  it('끔과 같은 도형이고 GL 호출이 그물 수만큼 늘지 않는다', () => {
    const shot = (n: number, merging: boolean): { s: string[]; calls: number; draws: number } => {
      const w = view(grid(n), false);
      w.v.setRenderOptions({ merging });
      w.v.fit(false);
      w.v.setSection({ normal: [1, 0, 0], offset: 302 });
      bake(w);
      const s = expandFrame(w.gl, () => w.v.renderNow());
      return { s, calls: calls(w).length, draws: w.v.stats.drawCalls };
    };
    const on = shot(600, true), off = shot(600, false);
    expect(on.s).toEqual(off.s);
    expect(on.draws).toBeLessThan(off.draws / 10);
    // 그물 수를 네 배로 늘려도 GL 호출은 그물 수만큼 늘지 않는다(채우기 단위는 평면을 걸친 그물만큼)
    const big = shot(2400, true);
    expect(big.calls - on.calls).toBeLessThan(1800);
  });

  it('mergeShader MCLIP: 자리 텍셀 7개·7번째에서 평면(굵은 선은 늘 있던 u_clip, 가는 선은 CLIP의 u_clip) — 바꿀 자리가 없으면 예외', () => {
    for (const [vs, defs] of [
      [WIDE_VS, ['MCLIP']],
      [THIN_VS, ['CLIP', 'MCLIP']],
    ] as const) {
      const s = mergeShader(withDefines(vs, ...defs, 'INST', 'MERGE'), 'line');
      expect(s).toContain('int k = u_instBase + int(a_item) * 7 + j;');
      expect(s).toContain('  vec4 u_color = instAt(5);\n  u_clip = instAt(6);\n');
      expect(s).toContain('\nvec4 u_clip;\n');
      expect(s).not.toContain('uniform vec4 u_clip;');
    }
    // 단면이 없으면 0.59.0 글 그대로(자리 텍셀 6개, u_clip은 균일 변수)
    const plain = mergeShader(withDefines(WIDE_VS, 'INST', 'MERGE'), 'line');
    expect(plain).toContain('* 6 + j;');
    expect(plain).toContain('uniform vec4 u_clip;');
    expect(plain).not.toContain('u_clip = instAt');
  });
});

describe('0.60.0 자리 자료 공통 열', () => {
  /** faceTexels·lineTexels만 쓰는 최소 렌더러 상태(0.61.0 자리 자료 저장소 사본 — 판 1) */
  const host = (): Record<string, unknown> => ({
    instM3: new Float32Array(9),
    d4a: new Float64Array(16),
    d4b: new Float64Array(16),
    d4c: new Float64Array(16),
    mgStore: { buf: new Float32Array(4096 * 4), dirty: [], gen: { f: 1, e: 1 } },
  });
  /** 0.61.0 묶음 g의 kind 자리를 저장소 텍셀 at부터(그물 번호 i → at + i·stride) */
  const slots = (g: MergeGroup, kind: string, at: number, stride: number): void => {
    const n = g.recs.length;
    (g as { ps?: unknown }).ps = { [kind]: { ep: 1, base: at, stride, at: new Uint32Array(n), mdl: new Array(n) } };
  };
  const frame = () => {
    const view = mat4Mul(translation([-1e5 - 0.3, 7.7, -4e4]), mat4Mul(placeAt(0, 0, 0, 33, true), translation([3.1, -2.2, 0.7])));
    const proj = perspective(0.8, 1.3, 0.1, 5e5);
    return { view, proj, viewProj: mat4Mul(proj, view) };
  };
  const models = (): (Float64Array | undefined)[] => {
    const out: (Float64Array | undefined)[] = [undefined];
    for (const o of [[0, 0, 0], [1e5, -3e4, 7.25], [-0.1, 1e-7, 3], [123456.789, 0.5, -98765.4321]]) out.push(translation(o) as Float64Array);
    const neg = translation([5, 6, 7]) as Float64Array;
    neg[1] = -0;
    neg[9] = -0;
    out.push(neg);
    out.push(placeAt(10, 20, 30, 17, false) as Float64Array);
    return out;
  };

  it('shiftOnly: 왼쪽 위 3×3 단위·세 열 w 칸 0(−0도)', () => {
    expect(shiftOnly(translation([1, 2, 3]))).toBe(true);
    const m = translation([1, 2, 3]);
    m[4] = -0;
    expect(shiftOnly(m)).toBe(true);
    m[4] = 1e-30;
    expect(shiftOnly(m)).toBe(false);
    expect(shiftOnly(placeAt(0, 0, 0, 10, false))).toBe(false);
  });

  it('faceFill·lineFill이 그물마다 faceTexels·lineTexels와 비트까지 같다(겉모습 있음·없음 — 그림자·단면·안개)', () => {
    const f = frame() as never;
    const ms = models();
    const recs = ms.map((model) => ({ model, src: { id: 'x' } }) as unknown as MeshRec);
    const g = { recs } as unknown as MergeGroup;
    const cols: Rgba[] = ms.map((_, i) => [0.1 * i, 0.2, 0.3, 1 - 0.1 * i]);
    const vc = ms.map((_, i) => i % 2 === 0);
    const plane = [0.6, -0.8, 0, 1234.5] as const;
    const clipOf = (m: ArrayLike<number> | undefined) => planeToLocal(plane, m);
    const shadow = mat4Mul(translation([0.5, -0.25, 0.1]), perspective(0.5, 1, 1, 100));
    for (const look of [false, true])
      for (const sec of [false, true])
        for (const sh of [false, true]) {
          const stride = 12 + (sh ? 4 : 0) + (sec ? 1 : 0);
          // 구간 둘(o·sh 꼴 둘 — 묶음 전체 목록과 구간 제 목록)
          const runs: MergeRun[] = [
            { g, a: 0, b: 3, base: 0, cols, vc, o: 0, sh: true, tint: 0, alpha: 1, w: 1 },
            { g, a: 3, b: ms.length, base: 0, cols: cols.slice(3), vc: vc.slice(3), o: 3, sh: false, tint: 0, alpha: 1, w: 1 },
          ];
          const c = { f, mm: (r: MeshRec) => r.model, look, sec: sec ? {} : null, clipOf, shadowVp: sh ? shadow : null } as never;
          const a = host(), b = host();
          // 0.61.0 저장소 자리(묶음 자리가 텍셀 3·stride부터 — 그물 번호 i의 자리는 3·stride + i·stride)
          slots(g, 'f', 3 * stride, stride);
          faceFill(a as never, c, runs, stride);
          delete (g as { org?: unknown }).org;
          const B = new Float32Array(4096 * 4);
          ms.forEach((m, i) => faceTexels(b as never, f, m, cols[i]!, vc[i]!, B, i * stride * 4, stride, sh ? shadow : null, sec ? clipOf : null));
          const A = (a.mgStore as { buf: Float32Array }).buf.subarray(3 * stride * 4);
          for (let i = 0; i < ms.length * stride * 4; i++) if (!Object.is(A[i], B[i])) expect([look, sec, sh, i, A[i]]).toEqual([look, sec, sh, i, B[i]]);
          // 쓴 자리는 한 구간으로 적힌다(판·모형·색이 같은 두 번째 쓰기는 아무것도 쓰지 않는다)
          expect((a.mgStore as { dirty: number[] }).dirty).toEqual([3 * stride, (3 + ms.length) * stride]);
          (a.mgStore as { dirty: number[] }).dirty.length = 0;
          faceFill(a as never, c, runs, stride);
          expect((a.mgStore as { dirty: number[] }).dirty).toEqual([]);
          for (const fog of [false, true]) {
            const t = sec ? 7 : 6;
            const p = host(), q = host();
            slots(g, 'e', 0, t);
            lineFill(p as never, c, runs, fog, t);
            const Q = new Float32Array(4096 * 4);
            ms.forEach((m, i) => lineTexels(q as never, f, m, cols[i]!, fog, Q, i * t * 4, sec ? clipOf : null));
            const P = (p.mgStore as { buf: Float32Array }).buf;
            for (let i = 0; i < ms.length * t * 4; i++) if (!Object.is(P[i], Q[i])) expect([look, sec, fog, i, P[i]]).toEqual([look, sec, fog, i, Q[i]]);
          }
          delete (g as { org?: unknown }).org;
        }
  });
});

describe('0.60.0 그물마다 훑지 않는다', () => {
  it('숨김 판이 같으면 보이는지 묻지 않고, 바꾸면 다시 묻는다', () => {
    const w = view(grid(3000), false);
    w.v.fit(false);
    bake(w);
    const V = w.v as unknown as { visible: (id: string, g: string | undefined) => boolean };
    const orig = V.visible.bind(w.v);
    let n = 0;
    V.visible = (id, g) => (n++, orig(id, g));
    w.v.renderNow();
    w.v.orbitBy(0.1, 0);
    w.v.renderNow();
    expect(n).toBe(0);
    // 숨김을 바꾼 첫 그리기만 그물마다 묻는다(보이는 범위 등 뷰어 몫도 함께) — 그 뒤 프레임·강조는 묻지 않는다
    w.v.setItemVisible('b1', false);
    w.v.renderNow();
    const n1 = n;
    expect(n1).toBeGreaterThanOrEqual(3000);
    w.v.orbitBy(0.1, 0);
    w.v.renderNow();
    w.v.highlight(['b2']);
    w.v.renderNow();
    expect(n).toBe(n1);
  });

  it('뼈대: 덩이·묶음 밖 그물, 맞는지(그물 수·덩이 끝·묶음 수·묶음 밖 그물 자리)', () => {
    const g1 = { recs: [] as MeshRec[], dead: 0, live: 0, thin: {} } as unknown as MergeGroup;
    const g2 = { recs: [] as MeshRec[], dead: 0, live: 0, thin: null } as unknown as MergeGroup;
    const rec = (g: MergeGroup | null, i: number): MeshRec => {
      const r = { src: { id: `r${i}` }, mg: g, mi: g ? g.recs.length : undefined, edges: {} } as unknown as MeshRec;
      if (g) {
        g.recs.push(r);
        (g as { live: number }).live++;
      }
      return r;
    };
    const M = [rec(g1, 0), rec(g1, 1), rec(null, 2), rec(g1, 3), rec(g2, 4), rec(g2, 5), rec(g1, 6)];
    const h = { meshes: M } as never;
    const o = orderBuild(h);
    expect(o.items.map((x) => ('src' in x ? 'r' : `${x.g === g1 ? 1 : 2}[${x.a},${x.b})@${x.at}`))).toEqual(['1[0,2)@0', 'r', '1[2,3)@3', '2[0,2)@4', '1[3,4)@6']);
    expect(o.loose).toEqual([M[2]]);
    expect(M.map((r) => r.bk)).toEqual([0, 0, -1, 1, 2, 2, 3]);
    expect(o.blocks[2]!.edges).toBe(false);
    expect(orderValid(h, o)).toBe(true);
    M.push(rec(null, 7));
    expect(orderValid(h, o)).toBe(false);
    M.pop();
    (g2 as { dead: number }).dead = 1;
    expect(orderValid(h, o)).toBe(false);
    (g2 as { dead: number }).dead = 0;
    M[2] = rec(null, 8);
    expect(orderValid(h, o)).toBe(false);
    expect(mergeSorted([1, 4, 9], [2, 4, 10, 11])).toEqual([1, 2, 4, 9, 10, 11]);
    expect(mergeSorted([], [3])).toEqual([3]);
  });
});
