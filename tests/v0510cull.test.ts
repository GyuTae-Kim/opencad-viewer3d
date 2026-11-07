/**
 * 0.51.0 그물 많은 장면의 프레임 비용: 화면 밖 잘라내기(src/cull.ts — 시야 옆 네 평면 바깥 그물을 그리지 않는다)와 선 상태 기억(그물마다 잇단 윤곽선·숨은 점선의
 * 고정 균일 변수를 다시 보내지 않는다), 그물 색·깃발 기억을 수로.
 *  - 순수 계산: 평면·상자·float32 어긋남 한도(큰 원점을 되돌리는 행렬)·NaN·투영 행렬
 *  - 뷰어: 확대해 그물 몇이 화면 밖일 때 잘라내기 켬의 그리기 기록이 끔의 기록에서 잘라낸 그물의 것만 뺀 같은 차례·같은 값인지(모드·강조·색·반투명·외곽선·숨은 점선·
 *    단면·묶음 안 구간), 모아 그린 자리 수, 다 보이면 끔과 같은 기록, stats.culled, 선택 켬·끔
 *  - 선 상태 기억 끔(lineMemoOff — 0.50.0과 같은 GL 호출)과 그리기 기록(그리기마다 균일 변수 값까지)이 같은지
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { cullBox, cullOut, cullPlanes, segmentsBox } from '../src/cull';
import { mat4Mul, orthographic, perspective, translation } from '../src/math';
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

describe('0.51.0 cull.ts 순수 계산', () => {
  const box = (min: number[], max: number[]) => ({ min: min as [number, number, number], max: max as [number, number, number] });
  it('평행 투영: 왼쪽 바깥 상자는 뺀다, 걸치거나 여백 안이면 남긴다', () => {
    // x·y −10~10이 화면(NDC −1~1), 여백 0.1(= 세계 1)
    const vp = orthographic(-10, 10, -10, 10, 0.1, 100);
    const P = cullPlanes(vp, 0.1, 0.1);
    expect(cullOut(P, cullBox(box([-30, -1, -1], [-12, 1, 1]), undefined)!)).toBe(true);
    expect(cullOut(P, cullBox(box([-30, -1, -1], [-10.5, 1, 1]), undefined)!)).toBe(false);
    expect(cullOut(P, cullBox(box([-30, -1, -1], [-9, 1, 1]), undefined)!)).toBe(false);
    expect(cullOut(P, cullBox(box([12, 12, 0], [14, 14, 1]), undefined)!)).toBe(true);
    expect(cullOut(P, cullBox(box([-1, 11.5, 0], [1, 14, 1]), undefined)!)).toBe(true);
    // 앞·뒤 자르기 평면 밖(z)은 보지 않는다 — 남긴다
    expect(cullOut(P, cullBox(box([-1, -1, 500], [1, 1, 600]), undefined)!)).toBe(false);
  });

  it('원근 투영: 옆 평면 바깥·눈 뒤(옆 평면 넷의 사이가 아니다)는 빼고, 걸치면 남긴다', () => {
    // 눈은 원점, −z를 본다(시점 = 단위)
    const vp = perspective(Math.PI / 2, 1, 0.1, 1000);
    const P = cullPlanes(vp, 0.01, 0.01);
    expect(cullOut(P, cullBox(box([-1, -1, -11], [1, 1, -9]), undefined)!)).toBe(false);
    expect(cullOut(P, cullBox(box([20, -1, -11], [22, 1, -9]), undefined)!)).toBe(true);
    expect(cullOut(P, cullBox(box([-1, -1, 9], [1, 1, 11]), undefined)!)).toBe(true);
    // 눈을 감싸는 상자는 남긴다
    expect(cullOut(P, cullBox(box([-1, -1, -1], [1, 1, 1]), undefined)!)).toBe(false);
  });

  it('모형 행렬로 옮긴 상자(돌림·옮김) — 세계 상자가 바깥일 때만', () => {
    const vp = orthographic(-10, 10, -10, 10, 0.1, 100);
    const P = cullPlanes(vp, 0.05, 0.05);
    const local = box([0, 0, 0], [2, 2, 2]);
    expect(cullOut(P, cullBox(local, translation([-20, 0, 0]))!)).toBe(true);
    expect(cullOut(P, cullBox(local, translation([-11, 0, 0]))!)).toBe(false);
    // z둘레 90° 돌린 뒤 옮김: 로컬 x 0~2 → 세계 y 0~2(+ 옮김), 로컬 y 0~2 → 세계 x −2~0
    expect(cullOut(P, cullBox(local, placeAt(0, 9, 0, 90, false))!)).toBe(false);
    expect(cullOut(P, cullBox(local, placeAt(0, 13, 0, 90, false))!)).toBe(true);
    expect(cullOut(P, cullBox(local, placeAt(-10.2, 0, 0, 90, false))!)).toBe(false);
    expect(cullOut(P, cullBox(local, placeAt(-10.6, 0, 0, 90, false))!)).toBe(true);
  });

  it('큰 로컬 좌표를 행렬이 되돌리는 꼴은 float32 어긋남 한도만큼 남긴다(같은 세계 상자라도)', () => {
    const vp = orthographic(-1, 1, -1, 1, 0.1, 100);
    // 오른쪽 화면 끝(x = 1)에서 세계 1e−4 바깥 — 여백 0(크기 2인 값의 float32 어긋남 한도 약 3e−6보다 넉넉히 바깥)
    const P = cullPlanes(vp, 0, 0);
    const world = box([1 + 1e-4, 0, 0], [2, 0.5, 0.5]);
    expect(cullOut(P, cullBox(world, undefined)!)).toBe(true);
    // 한도 안(1e−6 바깥)은 남긴다
    expect(cullOut(P, cullBox(box([1 + 1e-6, 0, 0], [2, 0.5, 0.5]), undefined)!)).toBe(false);
    // 로컬 x 1e9 + … 를 행렬이 −1e9 옮긴다 — GPU float32 셈은 수십 단위 어긋날 수 있어 같은 세계 상자라도 남긴다
    const local = box([1e9 + 1 + 1e-4, 0, 0], [1e9 + 2, 0.5, 0.5]);
    expect(cullOut(P, cullBox(local, translation([-1e9, 0, 0]))!)).toBe(false);
    // 크게 바깥이면 뺀다
    expect(cullOut(P, cullBox(box([1e9 + 1e4, 0, 0], [1e9 + 2e4, 1, 1]), translation([-1e9, 0, 0]))!)).toBe(true);
  });

  it('빈 범위·수가 아닌 값·투영 성분 행렬은 null(빼지 않는다), 윤곽선 범위는 깨진 값을 뺀다', () => {
    expect(cullBox(box([Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]), undefined)).toBeNull();
    const m = translation([NaN, 0, 0]);
    expect(cullBox(box([0, 0, 0], [1, 1, 1]), m)).toBeNull();
    const proj = mat4Mul(perspective(1, 1, 0.1, 10), translation([0, 0, -5]));
    expect(cullBox(box([0, 0, 0], [1, 1, 1]), proj)).toBeNull();
    const b = segmentsBox(new Float32Array([0, 0, 0, 1, 2, 3, NaN, 5, 5, 1e30, 0, 0, -1, 0, 0]));
    expect(b).toEqual({ min: [-1, 0, 0], max: [1, 2, 3] });
  });
});

/** 서로 다른 상자 30개(x로 늘어섬 — 윤곽선 있음), 같은 상자 정의 12자리(인스턴싱 — y = 60 줄), 반투명 상자 하나, 윤곽선이 그물 밖으로 나간 상자 하나 */
function scene(): Scene3d {
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < 30; i++) meshes.push(boxMesh(`d${i}`, [i * 30, 0, 0], [i * 30 + 10, 10, 10 + (i % 4)], [0.3 + (i % 5) * 0.1, 0.6, 0.7, 1], `g${i % 3}`));
  const a = boxMesh('a', [-4, -4, 0], [4, 4, 8], [0.8, 0.5, 0.3, 1]);
  for (let i = 0; i < 12; i++) meshes.push({ ...a, id: `a${i}`, name: `a${i}`, matrix: placeAt(i * 70, 60, 0, i * 15, i % 2 === 1) });
  meshes.push(boxMesh('t', [400, -40, 0], [420, -20, 20], [0.2, 0.4, 0.9, 0.5]));
  // 윤곽선이 그물 밖(x로 −2,000까지)으로 나간 상자: 그물 범위는 화면 밖이어도 선이 화면을 지나면 남긴다
  const w = boxMesh('wide', [880, 0, 0], [890, 10, 10], [0.5, 0.5, 0.5, 1]);
  w.edges = new Float32Array([880, 5, 5, -2000, 5, 5, ...w.edges!]);
  meshes.push(w);
  return { name: 't', units: 'mm', meshes, lines: [] };
}

type W = { v: Viewer3d; gl: FakeGL };
function view(sc: Scene3d = scene(), mode: 'shaded' | 'shadedEdges' | 'wireframe' | 'hiddenLine' | 'xray' | 'monochrome' = 'shadedEdges'): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: mode, viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  gl.logDraws = true;
  v.setScene(sc);
  return { v, gl };
}
function frame(w: W): DrawEntry[] {
  w.gl.draws = [];
  w.v.renderNow();
  return w.gl.draws;
}
const key = (e: DrawEntry): string => JSON.stringify([e.op, e.args, e.prog, e.attribs, e.element, e.uniforms]);
const isInst = (e: DrawEntry): boolean => e.uniforms.includes('"u_instBase"');
/** b가 a의 차례를 지킨 부분 열인지(같은 기록) — 모아 그린 그리기는 뺀다(자리 수가 다르다) */
function subseq(a: DrawEntry[], b: DrawEntry[]): boolean {
  const A = a.filter((e) => !isInst(e)).map(key), B = b.filter((e) => !isInst(e)).map(key);
  let i = 0;
  for (const k of B) {
    while (i < A.length && A[i] !== k) i++;
    if (i === A.length) return false;
    i++;
  }
  return true;
}
const instItems = (d: DrawEntry[]): number => d.filter(isInst).reduce((s, e) => s + e.args[e.args.length - 1]!, 0);
/** 맞춘 뒤 확대(가운데 근처만 화면에) */
function zoomIn(w: W): void {
  w.v.fit(false);
  w.v.zoomBy(0.18);
}

describe('0.51.0 화면 밖 잘라내기 — 뷰어', () => {
  it('기본 켬: 확대하면 화면 밖 그물을 빼고, 남은 그리기는 끔과 같은 차례·같은 값(모드 여섯)', () => {
    for (const mode of ['shaded', 'shadedEdges', 'wireframe', 'hiddenLine', 'xray', 'monochrome'] as const) {
      const w = view(scene(), mode);
      expect(w.v.renderOptions.culling).toBe(true);
      zoomIn(w);
      const on = frame(w);
      const culled = w.v.stats.culled;
      w.v.setRenderOptions({ culling: false });
      const off = frame(w);
      expect(w.v.stats.culled).toBe(0);
      expect(culled, mode).toBeGreaterThan(5);
      expect(on.length, mode).toBeLessThan(off.length);
      expect(subseq(off, on), mode).toBe(true);
      // 모아 그린 자리 수는 잘라낸 같은 정의 자리만큼 준다
      expect(instItems(on), mode).toBeLessThanOrEqual(instItems(off));
      w.v.setRenderOptions({ culling: true });
      expect(frame(w).map(key)).toEqual(on.map(key));
    }
  });

  it('윤곽선이 화면을 지나는 그물은 남긴다(삼각형 범위가 화면 밖이어도)', () => {
    const w = view(scene(), 'shadedEdges');
    zoomIn(w);
    frame(w);
    const n = w.v.stats.culled;
    // 윤곽선을 그물 안으로 줄이면 그 그물도 잘라낸다
    const sc = scene();
    const m = sc.meshes.find((x) => x.id === 'wide')!;
    m.edges = boxMesh('x', [880, 0, 0], [890, 10, 10], [1, 1, 1, 1]).edges!;
    const w2 = view(sc, 'shadedEdges');
    zoomIn(w2);
    frame(w2);
    expect(w2.v.stats.culled).toBe(n + 1);
  });

  it('강조·묶음 색·반투명·윤곽선 색·외곽선(그물마다 색)·숨은 점선·단면·묶음 안 구간이 있어도 끔과 같은 차례·같은 값', () => {
    const w = view(scene(), 'shadedEdges');
    const v = w.v;
    v.highlight(['d14', 'd15', 'a5']);
    v.setItemColor('d13', [1, 0, 0, 1]);
    v.setItemOpacity('d16', 0.4);
    v.setItemEdgeColor('d12', [0, 1, 0, 1]);
    v.setItemProfileColor('d15', [0, 0, 1, 1]);
    v.setRenderOptions({ profiles: { width: 1 }, hiddenEdges: { opacity: 0.3, shaded: true } });
    v.setHiddenRanges('d14', [{ start: 0, count: 4 }]);
    v.setItemMatrix('d0', translation([420, 0, 0]));
    const cases: [string, () => void][] = [
      ['looks', () => undefined],
      ['section', () => v.setSection({ normal: [0, 1, 0], offset: 5 })],
      ['sections', () => v.setSections([{ normal: [0, 1, 0], offset: 5 }, { normal: [0, 0, 1], offset: 6 }])],
      ['hidden', () => (v.setSection(null), v.setRenderMode('hiddenLine'))],
    ];
    for (const [name, set] of cases) {
      set();
      zoomIn(w);
      v.setRenderOptions({ culling: true });
      const on = frame(w);
      const culled = v.stats.culled;
      v.setRenderOptions({ culling: false });
      const off = frame(w);
      expect(culled, name).toBeGreaterThan(5);
      expect(subseq(off, on), name).toBe(true);
    }
  });

  it('다 보이면(맞춤) 끔과 그리기 기록이 같고 culled = 0', () => {
    const w = view(scene(), 'shadedEdges');
    w.v.fit(false);
    const on = frame(w);
    expect(w.v.stats.culled).toBe(0);
    w.v.setRenderOptions({ culling: false });
    expect(frame(w).map(key)).toEqual(on.map(key));
  });

  it('옮긴 묶음(setItemMatrix)은 옮긴 자리로 판단한다', () => {
    const w = view(scene(), 'shaded');
    zoomIn(w);
    frame(w);
    const before = w.v.stats.culled;
    // 화면 가운데(맞춤 대상점) 근처로 끝 상자를 옮기면 남긴다
    const t = w.v.getCamera().target;
    w.v.setItemMatrix('d29', translation([t[0] - 29 * 30 - 5, t[1] - 5, 0]));
    frame(w);
    expect(w.v.stats.culled).toBe(before - 1);
  });
});

describe('0.51.0 선 상태 기억 — 끔(0.50.0 GL 호출)과 같은 그리기 기록', () => {
  it('모드·강조·색·반투명·구간·단면·안개·삼각형 변·숨은 점선에서 그리기마다 균일 변수 값까지 같다', () => {
    const sc = scene();
    // 윤곽선 없는 그물(삼각형 변) 몇
    for (const m of sc.meshes.slice(3, 6)) delete m.edges;
    const w = view(sc, 'shadedEdges');
    const v = w.v;
    const r = (v as unknown as { renderer: { lineMemoOff: boolean } }).renderer;
    v.highlight(['d4', 'd7', 'a3']);
    v.setItemColor('d8', [1, 0, 0, 1]);
    v.setItemOpacity('d9', 0.5);
    v.setItemEdgeColor('d10', [0, 1, 0, 1]);
    v.setHiddenRanges('d11', { prims: [{ start: 0, count: 2 }], edges: [{ start: 1, count: 3 }] });
    const cases: [string, () => void][] = [
      ['shadedEdges', () => v.setRenderMode('shadedEdges')],
      ['wireframe', () => v.setRenderMode('wireframe')],
      ['hiddenLine', () => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: true }))],
      ['shaded-back', () => (v.setRenderMode('shadedEdges'), v.setRenderOptions({ hiddenEdges: { opacity: 0.4, shaded: true } }))],
      ['xray', () => v.setRenderMode('xray')],
      ['section', () => (v.setRenderMode('shadedEdges'), v.setSection({ normal: [1, 0, 0], offset: 300 }))],
      ['sections', () => v.setSections([{ normal: [1, 0, 0], offset: 300 }, { normal: [0, 1, 0], offset: 5 }])],
      ['fog', () => (v.setSection(null), v.setFog({ start: 10, end: 2000 }))],
      ['instancing-off', () => (v.setFog(null), v.setRenderOptions({ instancing: false }))],
    ];
    for (const [name, set] of cases) {
      set();
      v.fit(false);
      r.lineMemoOff = false;
      const on = frame(w);
      r.lineMemoOff = true;
      const off = frame(w);
      r.lineMemoOff = false;
      expect(on.length, name).toBe(off.length);
      expect(on.map(key), name).toEqual(off.map(key));
    }
  });

  it('윤곽선이 같은 상태로 잇달면 GL 호출이 준다(그물 30개 — 그리기 수는 같다)', () => {
    const w = view(scene(), 'shadedEdges');
    const r = (w.v as unknown as { renderer: { lineMemoOff: boolean } }).renderer;
    w.v.fit(false);
    w.v.setRenderOptions({ instancing: false });
    const gl = w.gl as unknown as Record<string, (...a: unknown[]) => unknown>;
    const count = (): number => {
      let n = 0;
      const names = ['useProgram', 'uniform1f', 'uniform2f', 'uniform4f', 'uniformMatrix4fv'];
      const orig = names.map((k) => gl[k]!);
      names.forEach((k, i) => {
        gl[k] = (...a: unknown[]) => {
          n++;
          return orig[i]!.apply(w.gl, a);
        };
      });
      try {
        w.v.renderNow();
      } finally {
        names.forEach((k, i) => (gl[k] = orig[i]!));
      }
      return n;
    };
    const on = count();
    r.lineMemoOff = true;
    const off = count();
    r.lineMemoOff = false;
    // 그물 44개 윤곽선마다 useProgram·u_color·u_vcol·u_alpha·u_override·u_bias 여섯을 줄인다(첫 그물만 보낸다)
    expect(off - on).toBeGreaterThanOrEqual(40 * 5);
  });
});
