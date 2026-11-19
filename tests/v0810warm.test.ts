/**
 * 0.81.0 단면 변종 미리 번역(KHR_parallel_shader_compile가 있을 때만): 단면이 없는 그리기가 쉬는 틈(나눠 올리기·기다리는 변종 번역·굽기가 없음)이면
 * 단면을 켠 첫 그리기가 곧바로 번역할(셰이더·연결 상태를 물어 기다리는) 변종 — 잘린 면 채우기(meshC), 그물 정의(모드·조명·그림자·안개)의 단면 변종,
 * 0.78.0 그물마다 선의 MVPC 굵은 선·가는 선, 숨은 점선의 CAPZ·MVPC — 을 걸어 두고 처음 쓸 때 끝낸다(79차 남은 한계 — 첫 단면 프레임의 MVPC 변종 번역).
 * 첫 단면 프레임의 그린 도형(tests/drawexpand.ts)·그리기·그리기마다 쓴 프로그램의 셰이더 글·만든 변종과 그 글은 미리 번역을 끈 길(secWarmOff — 0.80.0처럼)과 같고,
 * 그 프레임에 셰이더 상태를 묻는 기다림이 없다(인스턴싱 변종은 0.42.0처럼 기다리지 않고 걸어 둔다 — 그 프레임은 두 길 모두 그물마다). 확장이 없으면 미리 번역하지 않는다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, Rgba, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
const g = globalThis as { devicePixelRatio: number };
beforeAll(async () => {
  dom = installDom();
  expect(await Viewer3d.preloadMerging()).toBe(true);
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  g.devicePixelRatio = 1;
  dom.restore();
});

const MATS: Rgba[] = Array.from({ length: 5 }, (_, k) => [0.3 + (k % 3) * 0.2, 0.4 + (k % 2) * 0.3, 0.55, 1]);
const EDGE: Rgba = [0.1, 0.1, 0.12, 1];

/** 셋째마다 같은 꼴(인스턴싱 — 단면이면 그물마다 선), 나머지 제 배열, 아홉째마다 돌린 행렬, 일곱째 윤곽선 없음. 선분 묶음은 가는 선·점선·굵기 2가 차례로 */
function scene(n: number): Scene3d {
  const A = boxMesh('A', [0, 0, 0], [5, 5, 3], MATS[2]!);
  const B = boxMesh('B', [0, 0, 0], [4, 7, 2], MATS[2]!);
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const mine = i % 3 !== 0;
    const m: Mesh3d = mine
      ? boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], MATS[i % 5]!, `g${i % 4}`)
      : { ...(i % 2 ? A : B), id: `b${i}`, name: `b${i}`, group: `g${i % 4}`, color: MATS[i % 2]! };
    if (i % 9 === 0) m.matrix = placeAt((i % 30) * 10, Math.floor(i / 30) * 10, 0, i * 7, i % 18 === 0);
    else m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (mine && i % 7 === 3) delete m.edges;
    return m;
  });
  const lines: LineSet3d[] = [];
  for (let i = 0; i < 24; i++) {
    const e = boxMesh(`l${i}`, [i * 9, -30, 0], [i * 9 + 5, -24, 3 + (i % 4)], EDGE).edges!;
    lines.push({ id: `e${i}`, positions: e, color: EDGE, hiddenEdges: true, ...(i % 3 === 1 ? { dashed: true } : i % 3 === 2 ? { width: 2 } : {}) });
  }
  return { name: 'w', units: 'mm', meshes, lines, points: [] };
}

type R = Record<string, unknown> & { secWarmOff: boolean; warmCount: number; parallel: object | null; variants: Map<string, { p: { key: string } }>; meshC: { p: { key: string } } | null };
/** 프레임 하나의 GL 셈: 모든 호출, 셰이더 만들기, 셰이더 상태 묻기(곧바로 번역하는 길만 — 번역을 기다린다), 연결, 프로그램 지우기, 그리기마다 쓴 프로그램의 셰이더 글 해시 */
type Cnt = { calls: number; shader: number; status: number; link: number; delProg: number; srcs: string[] };
const zero = (): Cnt => ({ calls: 0, shader: 0, status: 0, link: 0, delProg: 0, srcs: [] });
type W = { v: Viewer3d; gl: FakeGL; r: R; c(): Cnt; frame(): { draws: string[]; c: Cnt }; keys(): string[]; settle(): void };

/** 뷰어(ext = 병렬 번역 확장, off = 미리 번역 끔 — 0.80.0 길) */
function view(sc: Scene3d, o: { mode?: 'shadedEdges' | 'hiddenLine'; ext: boolean; off?: boolean; set?: (v: Viewer3d) => void; keep?: boolean }): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: o.mode ?? 'shadedEdges', viewCube: false });
  if (!o.keep) views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: R }).renderer;
  if (o.ext) {
    // 문맥을 되찾아 init이 다시 물어도 확장이 있게
    gl.parallel = true;
    r.parallel = {};
  }
  r.secWarmOff = !!o.off;
  let c = zero();
  const base = r.gl as Record<string | symbol, unknown>;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        c.calls++;
        if (k === 'createShader') c.shader++;
        else if (k === 'getShaderParameter') c.status++;
        else if (k === 'linkProgram') c.link++;
        else if (k === 'deleteProgram') c.delProg++;
        else if (typeof k === 'string' && (k.startsWith('drawArrays') || k.startsWith('drawElements'))) c.srcs.push((t as { prog: { key: string } | null }).prog?.key ?? '');
        return (x as (...y: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  const settle = (): void => {
    v.renderNow();
    for (let i = 0; i < 100 && (v.stats.merged.pending > 0 || v.stats.instanced.pending > 0); i++) v.renderNow();
    v.renderNow();
  };
  o.set?.(v);
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  settle();
  return {
    v,
    gl,
    r,
    c: () => c,
    frame: () => {
      c = zero();
      const draws = expandFrame(gl, () => v.renderNow());
      return { draws, c };
    },
    keys: () => [...r.variants.keys(), ...(r.meshC ? ['meshC'] : [])].sort(),
    settle,
  };
}

const SO = { caps: 'closed', outline: true, plane: true } as const;

/** 두 뷰어(미리 번역 길·끈 길)의 한 프레임 — 그린 도형·그리기·그리기마다 쓴 프로그램의 셰이더 글이 같은지 보고 두 셈을 돌려준다 */
function step(a: W, b: W, label: string, set: (v: Viewer3d) => void): { on: Cnt; off: Cnt } {
  set(a.v);
  set(b.v);
  const x = a.frame(), y = b.frame();
  expect(x.draws.length, label).toBe(y.draws.length);
  for (let i = 0; i < x.draws.length; i++) if (x.draws[i] !== y.draws[i]) expect(x.draws[i], `${label} #${i}`).toBe(y.draws[i]);
  expect(x.c.srcs, label).toEqual(y.c.srcs);
  expect(a.v.stats.drawCalls, label).toBe(b.v.stats.drawCalls);
  return { on: x.c, off: y.c };
}

/** 두 뷰어가 만든 변종 열쇠가 같고 열쇠마다 셰이더 글(가짜 GL 프로그램 꼬리표 — 두 셰이더 글의 해시)이 같다 */
function sameProgs(a: W, b: W, label: string): void {
  expect(a.keys(), label).toEqual(b.keys());
  for (const k of a.keys()) {
    const pa = k === 'meshC' ? a.r.meshC! : a.r.variants.get(k)!;
    const pb = k === 'meshC' ? b.r.meshC! : b.r.variants.get(k)!;
    expect(pa.p.key, `${label} ${k}`).toBe(pb.p.key);
  }
}

const STATES: [string, 'shadedEdges' | 'hiddenLine', number, (v: Viewer3d) => void][] = [
  ['음영+윤곽·화소 비율 1', 'shadedEdges', 1, () => {}],
  ['음영+윤곽·화소 비율 2', 'shadedEdges', 2, () => {}],
  ['숨은 선 + 숨은 점선', 'hiddenLine', 1, (v) => v.setRenderOptions({ hiddenEdges: 0.4 })],
  ['해 그림자 + 안개', 'shadedEdges', 1, (v) => (v.setLighting({ sun: { direction: [0.3, -0.5, 0.8] }, shadows: true }), v.setFog({ start: 50, end: 600 }))],
];

describe('0.81.0 단면 변종 미리 번역(KHR_parallel_shader_compile)', () => {
  for (const [name, mode, dpr, set] of STATES)
    it(`${name}: 단면을 켠 첫 프레임은 미리 번역한 변종을 써서 셰이더 상태를 묻는 기다림이 없고, 그린 도형·그리기·셰이더 글·만든 변종은 끈 길과 같다`, () => {
      g.devicePixelRatio = dpr;
      try {
        const sc = scene(90);
        const a = view(sc, { mode, ext: true, set }), b = view(sc, { mode, ext: true, off: true, set });
        // 단면 없는 그리기의 쉬는 틈에 걸어 둔 수(끈 길은 걸지 않는다 — 아래 끝에서 본다)
        const warmed = a.r.warmCount;
        // 그 뒤 같은 상태의 그리기는 다시 걸지 않는다(GL 호출까지 끈 길과 같다)
        const idle = step(a, b, `${name} 가만히`, () => {});
        expect(idle.on.calls).toBe(idle.off.calls);
        expect(idle.on.shader + idle.off.shader).toBe(0);
        // 첫 단면 프레임과 그 뒤(가만히·돌림·끌기·강조): 끈 길이 곧바로 번역한 프로그램(셰이더 둘·상태 묻기 둘·연결 하나)마다 미리 번역한 길은 걸어 둔 것 하나를 쓴다
        let used = 0, offSync = 0;
        for (const [k, s] of [
          ['첫 단면', (v: Viewer3d) => v.setSectionAxis('x', 0.5, SO)],
          ['단면 가만히', () => {}],
          ['단면 돌림', (v: Viewer3d) => v.orbitBy(0.1, 0.05)],
          ['단면 끌기', (v: Viewer3d) => v.setSectionPosition(0.42)],
          ['강조', (v: Viewer3d) => v.highlight(['b1', 'b3', 'e2'])],
        ] as const) {
          const w0 = a.r.warmCount;
          const x = step(a, b, `${name} ${k}`, s);
          const u = w0 - a.r.warmCount;
          const row = `${name} ${k} 셰이더 ${x.on.shader}/${x.off.shader} 상태 ${x.on.status}/${x.off.status} 연결 ${x.on.link}/${x.off.link} 쓴 미리 번역 ${u} 남음 ${a.r.warmCount}`;
          // 미리 번역한 길은 셰이더 상태를 물어 기다리는 번역이 없다 — 남은 셰이더 만들기는 기다리지 않는 인스턴싱 변종(두 길 같은 수)뿐
          expect(x.on.status, row).toBe(0);
          expect(x.on.status, row).toBe(x.off.status - 2 * u);
          expect(x.on.shader, row).toBe(x.off.shader - 2 * u);
          expect(x.on.link, row).toBe(x.off.link - u);
          used += u;
          offSync += x.off.status / 2;
          if (k === '첫 단면') {
            // 끈 길(0.80.0)은 첫 단면 프레임에 단면 변종 둘 이상을 곧바로 번역하고 상태를 물어 기다린다
            expect(x.off.status, row).toBeGreaterThanOrEqual(4);
            sameProgs(a, b, `${name} 첫 단면`);
          }
        }
        // 끈 길이 곧바로 번역한 것은 모두 미리 번역한 것이었다
        expect(used).toBe(offSync);
        expect(warmed, name).toBeGreaterThanOrEqual(dpr === 1 ? 3 : 2);
        expect(used).toBeLessThanOrEqual(warmed);
        expect(b.r.warmCount).toBe(0);
        sameProgs(a, b, `${name} 끝`);
      } finally {
        g.devicePixelRatio = 1;
      }
    });

  it('미리 번역이 아직 끝나지 않았으면(완료 묻기 거짓) 첫 사용에서 연결 상태로 끝낸다 — 다시 번역하지 않고 그린 것은 같다', () => {
    const sc = scene(60);
    const a = view(sc, { ext: true }), b = view(sc, { ext: true, off: true });
    a.gl.compileDone = false;
    b.gl.compileDone = false;
    const w0 = a.r.warmCount;
    const x = step(a, b, '첫 단면(번역 중)', (v) => v.setSectionAxis('x', 0.5, SO));
    expect(x.off.status).toBeGreaterThanOrEqual(4);
    expect(x.on.status).toBe(0);
    expect(x.on.shader).toBe(x.off.shader - x.off.status);
    expect(w0).toBeGreaterThanOrEqual(3);
    expect(w0 - a.r.warmCount).toBe(x.off.status / 2);
    // 두 길 모두 인스턴싱 변종을 기다린다(그물마다 그린다)
    expect(a.v.stats.instanced.pending).toBe(b.v.stats.instanced.pending);
    a.gl.compileDone = true;
    b.gl.compileDone = true;
    a.settle();
    b.settle();
    step(a, b, '번역 끝', () => {});
    sameProgs(a, b, '번역 끝');
  });

  it('쉬는 틈에만 건다: 기다리는 인스턴싱 변종 번역이 남은 그리기 뒤에는 걸지 않고, 끝난 뒤의 그리기에서 건다', () => {
    const sc = scene(60);
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
    views.push(v);
    const gl = (v.canvas as unknown as FakeElement).gl!;
    const r = (v as unknown as { renderer: R }).renderer;
    gl.parallel = true;
    r.parallel = {};
    gl.compileDone = false;
    v.setScene(sc);
    v.fit(false);
    for (let i = 0; i < 5; i++) v.renderNow();
    expect(v.stats.instanced.pending).toBeGreaterThan(0);
    expect(r.warmCount).toBe(0);
    gl.compileDone = true;
    v.renderNow();
    for (let i = 0; i < 20 && (v.stats.merged.pending > 0 || v.stats.instanced.pending > 0); i++) v.renderNow();
    expect(v.stats.instanced.pending).toBe(0);
    v.renderNow();
    expect(r.warmCount).toBeGreaterThanOrEqual(3);
  });

  it('확장이 없으면 미리 번역하지 않는다 — GL 호출이 끈 길과 프레임마다 같다(0.80.0 그대로)', () => {
    const sc = scene(60);
    const a = view(sc, { ext: false }), b = view(sc, { ext: false, off: true });
    expect(a.r.warmCount).toBe(0);
    for (const [k, s] of [
      ['가만히', () => {}],
      ['첫 단면', (v: Viewer3d) => v.setSectionAxis('x', 0.5, SO)],
      ['단면 가만히', () => {}],
      ['단면 끔', (v: Viewer3d) => v.setSection(null)],
      ['끈 뒤 가만히', () => {}],
    ] as const) {
      const x = step(a, b, k, s);
      expect(x.on.calls, k).toBe(x.off.calls);
      expect(x.on.status, k).toBe(x.off.status);
    }
    expect(a.r.warmCount).toBe(0);
  });

  it('문맥을 잃었다 되찾으면 표를 비우고 새 문맥에서 다시 걸며, 되찾은 뒤 첫 단면 프레임도 같다. 뷰어를 닫으면 쓰지 않은 것을 지운다', () => {
    const sc = scene(60);
    const a = view(sc, { ext: true }), b = view(sc, { ext: true, off: true });
    expect(a.r.warmCount).toBeGreaterThanOrEqual(3);
    for (const w of [a, b]) {
      const cv = w.v.canvas as unknown as { fire(t: string, e: object): void };
      cv.fire('webglcontextlost', {});
      expect(w.r.warmCount).toBe(0);
      cv.fire('webglcontextrestored', {});
      for (let i = 0; i < 20; i++) w.v.renderNow();
      w.settle();
    }
    expect(a.r.parallel).not.toBeNull();
    expect(a.r.warmCount).toBeGreaterThanOrEqual(3);
    const x = step(a, b, '되찾은 뒤 첫 단면', (v) => v.setSectionAxis('x', 0.5, SO));
    expect(x.on.status).toBe(0);
    expect(x.off.status).toBeGreaterThanOrEqual(4);
    sameProgs(a, b, '되찾은 뒤');
    // 닫기: 쓰지 않은 미리 번역(화소 비율 1이면 굵은 선 MVPC 등)도 지운다
    const c = view(sc, { ext: true, keep: true }), d = view(sc, { ext: true, off: true, keep: true });
    const left = c.r.warmCount;
    expect(left).toBeGreaterThanOrEqual(3);
    c.v.dispose();
    d.v.dispose();
    expect(c.c().delProg - d.c().delProg).toBe(left);
    expect(c.r.warmCount).toBe(0);
  });
});
