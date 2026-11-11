/**
 * 0.61.0 강조한 묶음 그물의 굵은 윤곽선(굵기 2 — 60차 남은 한계 "강조한 그물은 그물마다", 8만 강조 825개 GL 호출 7만 남짓)을 묶음 구간으로:
 *  - 그린 도형(tests/drawexpand.ts)이 끈 뷰어(그물마다)와 같다 — 화소 비율 1·2, 안개, 단면 하나, 선 색('contrast'), 그물마다 윤곽선 색, 숨은 점선(음영)·숨은 선 모드, 강조 바꾸기
 *  - 강조한 그물 수만큼 GL 호출이 그물마다 길(그물마다 drawLines — 프로그램·고정 균일 변수·선분 속성 다시 걸기) 몫으로 늘지 않는다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
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

/** 상자 n개(원점·돌린 행렬·정점 색·한쪽 면·윤곽선 없음이 섞인 — v0610store와 같은 꼴) */
function grid(n: number): Scene3d {
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`);
    if (i % 9 === 0) m.matrix = placeAt((i % 30) * 10, Math.floor(i / 30) * 10, 0, i * 7, i % 18 === 0);
    else m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
    if (i % 10 === 0) m.doubleSided = false;
    if (i % 13 === 0) delete m.edges;
    return m;
  });
  return { name: 'g', units: 'mm', meshes, lines: [] };
}

type W = { v: Viewer3d; gl: FakeGL; calls: number };
function view(sc: Scene3d, merging: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, calls: 0 };
  const base = r.gl as Record<string | symbol, unknown>;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        w.calls++;
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

/** 켬·끔 두 뷰어에 같은 설정 뒤 펼친 도형이 같은지 */
function same(label: string, set: (v: Viewer3d) => void, n = 400): W {
  const on = view(grid(n), true), off = view(grid(n), false);
  for (const w of [on, off]) set(w.v);
  bake(on);
  bake(off);
  const b = shot(on), a = shot(off);
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
  return on;
}

const hiIds = (n: number, k: number): string[] => Array.from({ length: Math.floor(n / k) }, (_, i) => `b${i * k + 1}`);

describe('0.61.0 강조한 그물의 굵은 윤곽선을 묶음 구간으로', () => {
  it('끈 뷰어와 같은 도형(화소 비율 1·2·안개·단면·선 색·그물마다 윤곽선 색·숨은 점선·숨은 선 모드)', () => {
    same('hi', (v) => v.highlight(hiIds(400, 7)));
    same('hi-run', (v) => v.highlight(['b40', 'b41', 'b42', 'b43', 'b100', 'b101', 'b399']));
    same('hi-fog', (v) => (v.highlight(hiIds(400, 11)), v.setFog({ start: 50, end: 400 })));
    same('hi-section', (v) => (v.highlight(hiIds(400, 5)), v.setSection({ normal: [1, 0, 0], offset: 120 })));
    same('hi-contrast', (v) => (v.highlight(hiIds(400, 6)), v.setRenderOptions({ edgeColor: 'contrast' })));
    same('hi-item-edge', (v) => (v.highlight(hiIds(400, 6)), v.setItemEdgeColor('b7', [0, 0, 1, 1]), v.setItemEdgeColor('b8', [1, 0, 0, 1])));
    same('hi-dash', (v) => (v.highlight(hiIds(400, 4)), v.setRenderOptions({ hiddenEdges: { opacity: 0.3, shaded: true } })));
    same('hi-hidden-line', (v) => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 }), v.highlight(hiIds(400, 9))));
    const g = globalThis as { devicePixelRatio: number };
    g.devicePixelRatio = 2;
    try {
      same('hi-dpr2', (v) => v.highlight(hiIds(400, 7)));
      same('hi-dpr2-section', (v) => (v.highlight(hiIds(400, 3)), v.setSection({ normal: [0, 1, 0], offset: 60 })));
    } finally {
      g.devicePixelRatio = 1;
    }
  });

  it('강조 바꾸기 프레임마다 같은 도형이고, GL 호출이 강조한 그물 수만큼 그물마다 길 몫으로 늘지 않는다', () => {
    const on = view(grid(1200), true), off = view(grid(1200), false);
    bake(on);
    bake(off);
    on.calls = 0;
    on.v.renderNow();
    const plain = on.calls;
    for (const k of [97, 13, 5]) {
      const ids = hiIds(1200, k);
      for (const w of [on, off]) w.v.highlight(ids);
      const b = shot(on), a = shot(off);
      expect(b, `${k}`).toEqual(a);
      on.calls = 0;
      on.v.renderNow();
      // 강조한 그물 하나에 면 구간 둘(강조·그 뒤 보통)과 윤곽선 구간 둘(굵은 선·그 뒤 가는 선) 몫 — 그물마다 길(하나에 90개 남짓)보다 훨씬 적다
      expect(on.calls - plain, `${k}`).toBeLessThan(ids.length * 40);
      expect(on.v.stats.merged.items, `${k}`).toBeGreaterThan(2 * 1200 - 200);
    }
  });
});
