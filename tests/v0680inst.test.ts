/**
 * 0.68.0 인스턴싱 길(같은 꼴 부품이 배열을 함께 쓰는 자리 — STEP 반복 부품)의 자리 자료 저장소와 인스턴싱 뼈대(0.67.0 남은 한계 "프레임마다(가만히도) 자리 자료를
 * 모두 다시 쓰고 올리며, 묶음 나누기·같은 그물 세기를 프레임마다 한다").
 *  - 저장소: 가만히 있는 프레임은 자리 자료를 올리지 않고(단위 5 texSubImage2D 0텍셀), 카메라를 돌린 프레임은 자리 텍셀만(묶음마다 줄을 채우지 않는다), 숨김 하나·강조 하나를
 *    바꾼 프레임은 바뀐 묶음의 바뀐 자리부터만 올린다
 *  - 뼈대: 같은 상태의 프레임은 같은 뼈대를 다시 쓰고, 숨김·강조·모드·Mesh3d.color 값·색 객체·장면·인스턴싱 하한·겉모습(판)이 바뀌면 새로 모은다(강조만 바뀌면 같은 그물 수는
 *    다시 쓴다). 묶음 안 구간이 있으면 뼈대 없이(0.67.0 길), 무늬 그물이 든 묶음은 다시 쓰지 않는다. 묶어 그리기 덩이(그리기 뼈대)가 섞인 장면도
 *  - 그린 도형(tests/drawexpand.ts)이 뼈대를 끄고 자리를 모두 다시 쓰는 뷰어(0.67.0과 같은 모으기·쓰기)와 프레임마다 같다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { boxMesh, checkerBmp } from '../src/synth';
import type { Mesh3d, Rgba, Scene3d } from '../src/types';
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

type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown>; up: { texels: number; calls: number } };

/** 뷰어(자리 자료 그림 단위 5에 올린 texSubImage2D 텍셀·호출 수를 센다). plan = false면 뼈대를 끄고 그리기마다 판을 잊는다(자리를 모두 다시 쓴다 — 0.67.0과 같은 모으기·쓰기) */
function view(sc: Scene3d, plan: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, r, up: { texels: 0, calls: 0 } };
  if (!plan) r.instPlanOff = true;
  const base = r.gl as Record<string | symbol, unknown> & { TEXTURE0: number };
  let unit = 0;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        if (k === 'activeTexture') unit = (a[0] as number) - base.TEXTURE0;
        if (k === 'texSubImage2D' && unit === 5) {
          w.up.texels += (a[4] as number) * (a[5] as number);
          w.up.calls++;
        }
        return (x as (...y: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  for (let i = 0; i < 20 && v.stats.instanced.pending > 0; i++) v.renderNow();
  v.renderNow();
  return w;
}

const shot = (w: W): string[] => {
  // 뼈대를 끈 뷰어는 판도 잊는다(모든 자리를 다시 쓴다)
  if (w.r.instPlanOff) (w.r.instSig as Map<string, unknown> | undefined)?.clear();
  return expandFrame(w.gl, () => w.v.renderNow());
};

/** 두 뷰어에 같은 일을 하고 한 프레임씩 그려 펼친 도형이 같은지 — 뼈대 뷰어가 올린 자리 자료 텍셀 수 */
function step(on: W, off: W, label: string, fn: (w: W) => void): number {
  for (const w of [on, off]) fn(w);
  on.up.texels = 0;
  on.up.calls = 0;
  const b = shot(on), a = shot(off);
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
  return on.up.texels;
}

const PAL: Rgba[] = [
  [0.7, 0.4, 0.3, 1],
  [0.3, 0.6, 0.8, 1],
  [0.5, 0.5, 0.5, 1],
];

/**
 * STEP 꼴: 꼴 셋(a — 윤곽선, b — 윤곽선·정점 색, c — 윤곽선 없음)을 12자리씩(배열을 함께 쓴다 — 큰 원점, 둘째마다 회전 행렬), 색은 스타일 객체 셋을 함께(a11만 반투명 새 색),
 * 제 배열 그물 셋(u0~u2 — 그물마다)
 */
function scene(): Scene3d {
  const shape = (k: string, h: number, vc: boolean, edges: boolean): Mesh3d => {
    const m = boxMesh(k, [-3, -3, -2], [3, 3, h], PAL[0]!);
    m.origin = [120000, -80000, 2500];
    if (vc) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7) % 10) / 10));
    if (!edges) delete m.edges;
    return m;
  };
  const S = [shape('a', 2, false, true), shape('b', 3, true, true), shape('c', 4, false, false)];
  const meshes: Mesh3d[] = [];
  S.forEach((s, k) => {
    for (let i = 0; i < 12; i++) {
      const id = `${'abc'[k]}${i}`;
      const m = placeAt((i % 4) * 10 - 120000, Math.floor(i / 4) * 10 + 80000 + k * 40, -2500, i % 2 ? 30 * k + 45 : 0, i % 4 === 1);
      meshes.push({ ...s, id, name: id, group: `g${i % 3}`, color: id === 'a11' ? [0.9, 0.9, 0.2, 0.5] : PAL[i % 3]!, matrix: m });
    }
  });
  for (let i = 0; i < 3; i++) meshes.push(boxMesh(`u${i}`, [i * 12, -30, 0], [i * 12 + 8, -22, 6], PAL[i]!, 'g0'));
  return { name: 's', units: 'mm', meshes, lines: [] };
}

const plan = (w: W): { id: number; volatile: boolean; fix: number } | null => w.r.instPlan as { id: number; volatile: boolean; fix: number } | null;

describe('0.68.0 인스턴싱 자리 자료 저장소·뼈대', () => {
  it('가만히 있는 프레임은 올리지 않고, 돌린 프레임은 자리 텍셀만, 숨김·강조 하나는 바뀐 자리부터만 — 그린 도형은 뼈대를 끈 뷰어와 같다', () => {
    const on = view(scene(), true), off = view(scene(), false);
    expect(on.v.stats.instanced.draws).toBeGreaterThan(0);
    expect(step(on, off, 'still', () => undefined)).toBe(0);
    expect(on.up.calls).toBe(0);
    // 면 35자리(a11 반투명은 그물마다) × 11 + 윤곽선 24자리(a·b) × 5 — 줄 맞춤 없이(0.67.0은 묶음마다 1,024텍셀 줄).
    // 0.69.0 회전 표 꼴(묶음마다 회전 셋 이하 — 0°·돈 것·누운 것): 면 묶음 아홉 = 회전 26항목 × 9 + 35자리 × 2, 윤곽선 묶음 둘 = 회전 셋씩 × 3 + 24자리 × 2
    expect(step(on, off, 'orbit', (w) => w.v.orbitBy(0.05, 0))).toBe(26 * 9 + 35 * 2 + 6 * 3 + 24 * 2);
    expect(step(on, off, 'still-2', () => undefined)).toBe(0);
    const id0 = plan(on)!.id;
    expect(step(on, off, 'still-3', () => undefined)).toBe(0);
    expect(plan(on)!.id).toBe(id0);
    // 숨김 하나: 그 그물이 든 면·윤곽선 묶음의 그 자리부터만(a4 — 색 PAL[1] 묶음 a1·a4·a7·a10의 둘째)
    const hide = step(on, off, 'hide', (w) => w.v.setItemVisible('a4', false));
    expect(hide).toBeGreaterThan(0);
    expect(hide).toBeLessThanOrEqual(2 * 11 + 2 * 5 + 11 * 5);
    // 0.69.0 숨김 하나는 뼈대를 고쳐 다시 쓴다(같은 뼈대 — 0.68.0은 새로 모았다)
    expect(plan(on)!.id).toBe(id0);
    expect(step(on, off, 'hide-still', () => undefined)).toBe(0);
    const hi = step(on, off, 'highlight', (w) => w.v.highlight(['b5']));
    expect(hi).toBeGreaterThan(0);
    expect(hi).toBeLessThan(26 * 9 + 35 * 2 + 6 * 3 + 24 * 2);
    expect(step(on, off, 'highlight-still', () => undefined)).toBe(0);
    step(on, off, 'show', (w) => w.v.setItemVisible('a4', true));
    // 강조한 b5는 따로 묶인다(자리 수는 같다) — 차례마다 자리 사이 한 줄이 안 되는 틈은 함께 올린다(0.67.0은 묶음마다 1,024텍셀 줄 — 묶음 열 남짓)
    const oh = step(on, off, 'orbit-hi', (w) => w.v.orbitBy(0.05, 0.01));
    // 0.69.0 회전 표 꼴: 혼자 남은 b5는 자리가 하나라 0.68.0 꼴(면 11·윤곽선 5)
    expect(oh).toBeGreaterThanOrEqual(26 * 9 + 34 * 2 + 11 + 6 * 3 + 23 * 2 + 5);
    expect(oh).toBeLessThan(2 * (26 * 9 + 35 * 2 + 6 * 3 + 24 * 2));
    step(on, off, 'group-hide', (w) => (w.v.setGroupVisible('g1', false), w.v.highlight(null)));
    step(on, off, 'section', (w) => w.v.setSection({ normal: [1, 0, 0], offset: -119985 }));
    expect(step(on, off, 'section-still', () => undefined)).toBe(0);
    step(on, off, 'section-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'sun-shadow', (w) => (w.v.setSection(null), w.v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true })));
    expect(step(on, off, 'shadow-still', () => undefined)).toBe(0);
    step(on, off, 'shadow-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'fog', (w) => (w.v.setLighting(null), w.v.setFog({ start: 50, end: 400 })));
    step(on, off, 'fog-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'profiles-ao', (w) => (w.v.setFog(null), w.v.setRenderOptions({ profiles: { width: 1 } }), w.v.setAmbientOcclusion({})));
    expect(step(on, off, 'profiles-still', () => undefined)).toBe(0);
    step(on, off, 'profiles-orbit', (w) => w.v.orbitBy(0.05, 0));
    step(on, off, 'plain', (w) => (w.v.setAmbientOcclusion(null), w.v.setRenderOptions({ profiles: null }), w.v.setGroupVisible('g1', true)));
    for (const mode of ['hiddenLine', 'wireframe', 'xray', 'monochrome', 'shaded'] as const) {
      step(on, off, mode, (w) => (w.v.setRenderMode(mode), w.v.setRenderOptions({ hiddenEdges: 0.4 })));
      expect(step(on, off, `${mode}-still`, () => undefined), mode).toBe(0);
      step(on, off, `${mode}-hi`, (w) => w.v.highlight(['c2', 'a7']));
      step(on, off, `${mode}-orbit`, (w) => w.v.orbitBy(0.05, 0));
    }
    step(on, off, 'shaded-edges', (w) => (w.v.setRenderMode('shadedEdges'), w.v.highlight(null)));
    // 확대해 화면 밖 자리를 뺀다(묶음은 그대로 — 남은 자리만)
    step(on, off, 'zoom', (w) => w.v.zoomBy(0.25));
    expect(on.v.stats.culled).toBeGreaterThan(0);
    expect(step(on, off, 'zoom-still', () => undefined)).toBe(0);
    step(on, off, 'zoom-orbit', (w) => w.v.orbitBy(0.02, 0));
    step(on, off, 'fit', (w) => w.v.fit(false));
  });

  it('뼈대는 같은 상태면 다시 쓰고, 색 값·색 객체·장면·하한·겉모습이 바뀌면 새로 모으며 구간이 있으면 뼈대 없이(그린 도형은 같다)', () => {
    const sc1 = scene(), sc2 = scene();
    const on = view(sc1, true), off = view(sc2, false);
    step(on, off, 'still', () => undefined);
    let id = plan(on)!.id;
    const same = (label: string): void => {
      expect(plan(on)?.id, label).toBe(id);
    };
    // 0.69.0 뼈대를 고쳐 다시 쓴다(같은 뼈대 — 고친 수가 는다)
    let fx = plan(on)!.fix;
    const fresh = (label: string): void => {
      expect(plan(on)?.id, label).not.toBe(id);
      id = plan(on)!.id;
      fx = plan(on)!.fix;
    };
    const fixed = (label: string): void => {
      expect(plan(on)?.id, label).toBe(id);
      expect(plan(on)!.fix, label).toBeGreaterThan(fx);
      fx = plan(on)!.fix;
    };
    step(on, off, 'still-2', () => undefined);
    same('still-2');
    // 0.69.0 강조·숨김만 바뀌면 뼈대를 고친다(같은 그물 수는 더하고 뺀다 — 0.68.0은 새로 모았다). 모드만 바뀌면 새로 모으되 같은 그물 수는 다시 세지 않는다(보이는 그물·차례가 같다)
    const counts = (): Map<string, number> => (on.r.instPlan as { geoN: Map<string, number> }).geoN;
    const n0 = counts();
    step(on, off, 'hi-only', (w) => w.v.highlight(['a2', 'b7']));
    fixed('hi-only');
    expect(counts()).toBe(n0);
    const sum = (): number => [...counts().values()].reduce((a, b) => a + b, 0);
    const c0 = sum();
    step(on, off, 'hide-count', (w) => w.v.setItemVisible('c3', false));
    fixed('hide-count');
    expect(sum()).toBe(c0 - 1);
    step(on, off, 'show-count', (w) => (w.v.setItemVisible('c3', true), w.v.highlight(null)));
    fixed('show-count');
    expect(sum()).toBe(c0);
    step(on, off, 'mode-only', (w) => w.v.setRenderMode('shaded'));
    fresh('mode-only');
    expect(counts()).toBe(n0);
    step(on, off, 'mode-back', (w) => w.v.setRenderMode('shadedEdges'));
    fresh('mode-back');
    // Mesh3d.color 값을 제자리에서 고친다(스타일 객체 — 그 색을 쓰는 자리 모두)
    const tint = (sc: Scene3d, i: number, v: number): void => {
      (sc.meshes.find((m) => m.id === 'a1')!.color as unknown as number[])[i] = v;
    };
    on.v.renderNow();
    tint(sc1, 0, 0.1);
    tint(sc2, 0, 0.1);
    step(on, off, 'color-value', () => undefined);
    fresh('color-value');
    // 두 스타일 색을 같은 값으로 — 0.67.0처럼 값이 같은 색은 한 묶음
    for (const sc of [sc1, sc2]) {
      const c = sc.meshes.find((m) => m.id === 'a1')!.color as unknown as number[];
      const d = sc.meshes.find((m) => m.id === 'a2')!.color as unknown as number[];
      for (let k = 0; k < 4; k++) c[k] = d[k]!;
    }
    const draws0 = on.v.stats.instanced.draws;
    step(on, off, 'color-merge', () => undefined);
    fresh('color-merge');
    expect(on.v.stats.instanced.draws).toBeLessThan(draws0);
    // 색 객체를 바꿔 끼운다(setMesh 없이)
    for (const sc of [sc1, sc2]) sc.meshes.find((m) => m.id === 'b3')!.color = [0.2, 0.9, 0.2, 1];
    step(on, off, 'color-object', () => undefined);
    fresh('color-object');
    step(on, off, 'color-still', () => undefined);
    same('color-still');
    // 장면 고치기: 같은 꼴 바꾸기(새 기록)·빼기 — 0.69.0 보이는 그물이 바뀐 것이라 뼈대를 고친다
    step(on, off, 'set-mesh', (w) => {
      const m = (w === on ? sc1 : sc2).meshes.find((x) => x.id === 'a6')!;
      w.v.setMesh({ ...m, matrix: placeAt(5, 5, 5, 20, true) });
    });
    fixed('set-mesh');
    step(on, off, 'remove', (w) => w.v.removeMesh('c5'));
    fixed('remove');
    step(on, off, 'min', (w) => w.v.setRenderOptions({ instancing: { min: 11 } }));
    fresh('min');
    step(on, off, 'min-back', (w) => w.v.setRenderOptions({ instancing: true }));
    fresh('min-back');
    // 겉모습(분해 행렬·부품 색·흐리게·윤곽선 색)은 겉모습 판(lookKey)이 같으면 뼈대를 다시 쓰고, 바꾸면 새로 모은다(겉모습 객체를 제자리에서 고친 setItem…도)
    step(on, off, 'look', (w) => w.v.setItemLooks([['a3', { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1] }]]));
    fresh('look');
    expect(step(on, off, 'look-still', () => undefined)).toBe(0);
    same('look-still');
    step(on, off, 'look-orbit', (w) => w.v.orbitBy(0.05, 0));
    same('look-orbit');
    step(on, off, 'look-color', (w) => w.v.setItemLooks([['b4', { color: [0.1, 0.2, 0.9, 1] }], ['c1', { opacity: 0.4 }], ['a8', { edgeColor: [1, 0, 1, 1] }]]));
    fresh('look-color');
    step(on, off, 'look-color-still', () => undefined);
    same('look-color-still');
    step(on, off, 'look-move', (w) => w.v.setItemMatrix('a3', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 45, 1]));
    fresh('look-move');
    step(on, off, 'look-dim', (w) => w.v.setItemOpacity('b4', 0.3));
    fresh('look-dim');
    step(on, off, 'look-hi', (w) => w.v.highlight(['a3', 'b4']));
    fixed('look-hi');
    step(on, off, 'look-off', (w) => w.v.clearItemLooks());
    fresh('look-off');
    step(on, off, 'look-off-still', () => undefined);
    same('look-off-still');
    // 묶음 안 구간(구간 강조)이 있으면 뼈대 없이(0.67.0 길 — 저장소는 그대로 쓴다)
    step(on, off, 'ranges', (w) => w.v.highlightRanges({ b2: [{ start: 0, count: 4 }] }));
    expect(plan(on)).toBeNull();
    expect(step(on, off, 'ranges-still', () => undefined)).toBe(0);
    step(on, off, 'ranges-off', (w) => w.v.highlightRanges(null));
    expect(plan(on)).not.toBeNull();
  });

  it('묶어 그리기 묶음(그리기 뼈대 덩이)과 섞인 장면에서도 뼈대를 다시 쓰고 그린 도형은 같다', async () => {
    expect(await Viewer3d.preloadMerging()).toBe(true);
    // 제 배열 그물 240개(묶음 — 강제로 켠다)와 같은 꼴 자리 36개
    const mixed = (): Scene3d => {
      const sc = scene();
      for (let i = 0; i < 240; i++) {
        const m = boxMesh(`m${i}`, [0, 0, 0], [5, 5, 3 + (i % 4)], PAL[i % 3]!, `g${i % 3}`);
        m.origin = [(i % 20) * 8 - 50, Math.floor(i / 20) * 8 + 60, 0];
        sc.meshes.push(m);
      }
      return sc;
    };
    const mk = (plan: boolean): W => {
      const w = view(mixed(), plan);
      w.v.setRenderOptions({ merging: 'on' });
      for (let i = 0; i < 50 && w.v.stats.merged.pending > 0; i++) w.v.renderNow();
      w.v.renderNow();
      return w;
    };
    const on = mk(true), off = mk(false);
    expect(on.v.stats.merged.meshes).toBeGreaterThan(200);
    expect(on.r.mgOrder).not.toBeNull();
    step(on, off, 'still', () => undefined);
    const id = plan(on)!.id;
    expect(step(on, off, 'still-2', () => undefined)).toBe(0);
    expect(plan(on)!.id).toBe(id);
    // 0.69.0 회전 표 꼴: 둘째 시험이 PAL[1] 값을 PAL[2]와 같게 바꿔 면 묶음이 꼴마다 둘(4·7·4·8·4·8자리, 회전 셋씩)이다 — 18항목 × 9 + 35 × 2, 윤곽선 6 × 3 + 24 × 2
    expect(step(on, off, 'orbit', (w) => w.v.orbitBy(0.05, 0))).toBe(18 * 9 + 35 * 2 + 6 * 3 + 24 * 2);
    step(on, off, 'hide', (w) => (w.v.setItemVisible('m7', false), w.v.setItemVisible('b2', false)));
    step(on, off, 'hide-still', () => undefined);
    step(on, off, 'highlight', (w) => w.v.highlight(['m9', 'a3']));
    step(on, off, 'section', (w) => w.v.setSection({ normal: [0, 1, 0], offset: 80000 }));
    step(on, off, 'hidden-line', (w) => (w.v.setSection(null), w.v.setRenderMode('hiddenLine')));
    step(on, off, 'hidden-orbit', (w) => w.v.orbitBy(0.05, 0));
  });

  it('무늬 그물이 든 같은 꼴 묶음은 뼈대를 다시 쓰지 않는다(무늬가 올라오면 묶음이 바뀐다)', () => {
    const tex = (): Scene3d => {
      const sc = scene();
      const uv = new Float32Array(16).map((_, j) => (j % 2 ? 0.25 : 0.75) * ((j >> 1) % 2));
      const a = sc.meshes.filter((m) => m.id.startsWith('a'));
      const shared = { ...a[0]!, uvs: uv, texture: 'chk' };
      for (const m of a) Object.assign(m, { positions: shared.positions, indices: shared.indices, edges: shared.edges, uvs: uv, texture: 'chk' });
      sc.textures = [{ id: 'chk', data: checkerBmp(), mime: 'image/bmp' }];
      return sc;
    };
    const on = view(tex(), true), off = view(tex(), false);
    step(on, off, 'still', () => undefined);
    expect(plan(on)!.volatile).toBe(true);
    const id = plan(on)!.id;
    step(on, off, 'still-2', () => undefined);
    expect(plan(on)!.id).not.toBe(id);
  });
});
