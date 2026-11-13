/**
 * 0.69.0 인스턴싱 뼈대 고치기(0.68.0 남은 한계 "고른 부품·숨긴 부품을 바꾼 첫 프레임은 뼈대를 다시 모은다 — 묶음을 그물 하나만큼 고치는 길은 넣지 않았다"):
 *  - 보이는 그물·강조가 몇 개만 바뀐 그리기는 같은 뼈대(id)를 그만큼 고쳐 다시 쓴다(고친 수 fix가 는다) — 하나씩 더 숨기기·다시 보이기·고른 부품 바꾸기·
 *    조립 줄 고르기(여럿)·숨김과 강조를 함께·setMesh·removeMesh, 단면 하나·숨은 선(숨은 점선)·외곽선(외곽선 깊이)·해 그림자·와이어프레임(삼각형 변)에서도
 *  - 그물 열쇠의 첫 자리가 빠져 그물 열쇠·묶음 차례가 바뀌는 고치기, 빈 묶음·새 묶음(강조로 갈라지는 묶음)
 *  - 하한을 넘나드는 숨김·색 객체를 바꿔 끼운 그물이 있으면 새로 모은다
 *  - 그린 도형(tests/drawexpand.ts)이 뼈대 없이 그리기마다 모으는 뷰어(0.67.0과 같은 모으기)와 프레임마다 같다(묶어 그리기 덩이가 섞인 장면도)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { boxMesh } from '../src/synth';
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

type Plan = { id: number; fix: number };
type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown>; up: { texels: number } };

/** 뷰어(자리 자료 그림 단위 5에 올린 텍셀을 센다). plan = false면 뼈대를 끄고 그리기마다 판을 잊는다(자리를 모두 다시 쓴다 — 0.67.0과 같은 모으기·쓰기) */
function view(sc: Scene3d, plan: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, r, up: { texels: 0 } };
  if (!plan) r.instPlanOff = true;
  const base = r.gl as Record<string | symbol, unknown> & { TEXTURE0: number };
  let unit = 0;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        if (k === 'activeTexture') unit = (a[0] as number) - base.TEXTURE0;
        if (k === 'texSubImage2D' && unit === 5) w.up.texels += (a[4] as number) * (a[5] as number);
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
  if (w.r.instPlanOff) (w.r.instSig as Map<string, unknown> | undefined)?.clear();
  return expandFrame(w.gl, () => w.v.renderNow());
};

/** 두 뷰어에 같은 일을 하고 한 프레임씩 그려 펼친 도형이 같은지 — 뼈대 뷰어가 올린 자리 자료 텍셀 수 */
function step(on: W, off: W, label: string, fn: (w: W) => void): number {
  for (const w of [on, off]) fn(w);
  on.up.texels = 0;
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
 * STEP 꼴: 꼴 셋(a — 윤곽선, b — 윤곽선·정점 색, c — 윤곽선 없음)을 16자리씩 장면 차례로 번갈아(a0 b0 c0 a1 b1 c1 … — a0을 숨기면 그물 열쇠 차례가 바뀐다,
 * 배열을 함께 쓴다 — 큰 원점, 둘째마다 회전 행렬), 색은 스타일 객체 셋을 자리마다 돌려(묶음 첫 자리가 빠지면 묶음 차례가 바뀐다), 제 배열 그물 셋(그물마다)
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
  for (let i = 0; i < 16; i++)
    S.forEach((s, k) => {
      const id = `${'abc'[k]}${i}`;
      const m = placeAt((i % 4) * 10 - 120000, Math.floor(i / 4) * 10 + 80000 + k * 50, -2500, i % 2 ? 30 * k + 45 : 0, i % 4 === 1);
      meshes.push({ ...s, id, name: id, group: `g${i % 3}`, color: PAL[(i + k) % 3]!, matrix: m });
    });
  for (let i = 0; i < 3; i++) meshes.push(boxMesh(`u${i}`, [i * 12, -30, 0], [i * 12 + 8, -22, 6], PAL[i]!, 'g0'));
  return { name: 's', units: 'mm', meshes, lines: [] };
}

const plan = (w: W): Plan | null => w.r.instPlan as Plan | null;

/** 뼈대 번호·고친 수 지켜보기: fixed — 같은 뼈대를 고쳤다, fresh — 새로 모았다, sync — 지금 뼈대부터 본다(상태를 바꾼 그리기 — 모으기 값이 바뀌면 새로, 아니면 고친다) */
function watch(on: W): { fixed: (label: string) => void; fresh: (label: string) => void; sync: () => void } {
  let id = plan(on)!.id, fx = plan(on)!.fix;
  return {
    sync: () => {
      id = plan(on)!.id;
      fx = plan(on)!.fix;
    },
    fixed: (label) => {
      expect(plan(on)?.id, label).toBe(id);
      expect(plan(on)!.fix, label).toBeGreaterThan(fx);
      fx = plan(on)!.fix;
    },
    fresh: (label) => {
      expect(plan(on)?.id, label).not.toBe(id);
      id = plan(on)!.id;
      fx = plan(on)!.fix;
    },
  };
}

describe('0.69.0 인스턴싱 뼈대 고치기', () => {
  it('숨김·보이기·강조가 바뀐 그리기는 같은 뼈대를 고쳐 다시 쓴다 — 그린 도형은 뼈대 없이 모으는 뷰어와 프레임마다 같다', () => {
    const sc1 = scene(), sc2 = scene();
    const on = view(sc1, true), off = view(sc2, false);
    expect(on.v.stats.instanced.draws).toBeGreaterThan(0);
    step(on, off, 'still', () => undefined);
    const { fixed, fresh } = watch(on);
    // 그물 열쇠 a의 첫 자리 a0을 숨긴다(새로 모으면 b가 a보다 앞선다 — 고친 뼈대도 그 차례로 그린다)
    step(on, off, 'hide-a0', (w) => w.v.setItemVisible('a0', false));
    fixed('hide-a0');
    expect(step(on, off, 'hide-a0-still', () => undefined)).toBe(0);
    step(on, off, 'hide-b0', (w) => w.v.setItemVisible('b0', false));
    fixed('hide-b0');
    step(on, off, 'show-a0', (w) => w.v.setItemVisible('a0', true));
    fixed('show-a0');
    // 고른 부품 하나 → 다른 하나(강조 묶음이 새로 생기고 비면 버린다)
    step(on, off, 'hi-b3', (w) => w.v.highlight(['b3']));
    fixed('hi-b3');
    step(on, off, 'hi-b5', (w) => w.v.highlight(['b5']));
    fixed('hi-b5');
    expect(step(on, off, 'hi-still', () => undefined)).toBe(0);
    // 조립 줄 고르기(여럿 — 꼴마다)·숨김과 강조를 함께
    step(on, off, 'hi-many', (w) => w.v.highlight(['a1', 'a4', 'a7', 'b2', 'c3', 'c9']));
    fixed('hi-many');
    step(on, off, 'hide-hi', (w) => (w.v.setItemVisible('a4', false), w.v.highlight(['c5', 'a2'])));
    fixed('hide-hi');
    // 부품을 하나씩 더 숨긴다(앱 목록에서 하나씩 끄기)
    for (const id of ['a9', 'b9', 'c1', 'a15', 'b12', 'c14']) {
      step(on, off, `hide-${id}`, (w) => w.v.setItemVisible(id, false));
      fixed(`hide-${id}`);
    }
    step(on, off, 'orbit', (w) => w.v.orbitBy(0.05, 0.02));
    expect(step(on, off, 'orbit-still', () => undefined)).toBe(0);
    // 다시 모두 보이기(한 번에 여럿)
    step(on, off, 'show-all', (w) => {
      for (const id of ['a4', 'a9', 'b9', 'c1', 'a15', 'b12', 'c14', 'b0']) w.v.setItemVisible(id, true);
      w.v.highlight(null);
    });
    fixed('show-all');
    // 묶음 숨김(장면의 ⅓)
    step(on, off, 'group-hide', (w) => w.v.setGroupVisible('g1', false));
    step(on, off, 'group-show', (w) => w.v.setGroupVisible('g1', true));
    // 같은 꼴 바꾸기(새 기록)·빼기
    step(on, off, 'set-mesh', (w) => {
      const m = (w === on ? sc1 : sc2).meshes.find((x) => x.id === 'b6')!;
      w.v.setMesh({ ...m, matrix: placeAt(5, 5, 5, 20, true) });
    });
    fixed('set-mesh');
    step(on, off, 'remove', (w) => w.v.removeMesh('a6'));
    fixed('remove');
    // 하한(8)을 넘나드는 숨김은 새로 모은다: c를 16 → 8까지는 고치고, 7이 되는 그리기·다시 8이 되는 그리기는 새로
    for (const k of [2, 4, 6, 8, 10, 11, 12, 13]) {
      step(on, off, `hide-c${k}`, (w) => w.v.setItemVisible(`c${k}`, false));
      fixed(`hide-c${k}`);
    }
    step(on, off, 'hide-c15-cross', (w) => w.v.setItemVisible('c15', false));
    fresh('hide-c15-cross');
    step(on, off, 'show-c15-cross', (w) => w.v.setItemVisible('c15', true));
    fresh('show-c15-cross');
    step(on, off, 'hide-a3-after', (w) => w.v.setItemVisible('a3', false));
    fixed('hide-a3-after');
  });

  it('단면 하나·숨은 선·외곽선·해 그림자·와이어프레임·X-ray에서도 고치고, 색 객체를 바꿔 끼우면 새로 모은다', () => {
    const sc1 = scene(), sc2 = scene();
    const on = view(sc1, true), off = view(sc2, false);
    step(on, off, 'still', () => undefined);
    const { fixed, fresh, sync } = watch(on);
    const flip = (label: string, k: number): void => {
      step(on, off, label, (w) => {
        w.v.setItemVisible(`a${k}`, false);
        w.v.setItemVisible(`a${k - 1}`, true);
        w.v.highlight([`b${k}`, `c${(k * 3) % 16}`]);
      });
      fixed(label);
      expect(step(on, off, `${label}-still`, () => undefined), label).toBe(0);
    };
    const states: [string, (w: W) => void][] = [
      ['section', (w) => w.v.setSection({ normal: [1, 0, 0], offset: -119985 })],
      ['hidden-line', (w) => (w.v.setSection(null), w.v.setRenderMode('hiddenLine'), w.v.setRenderOptions({ hiddenEdges: 0.4 }))],
      ['profiles', (w) => (w.v.setRenderMode('shadedEdges'), w.v.setRenderOptions({ profiles: { width: 1 } }))],
      ['shadow', (w) => (w.v.setRenderOptions({ profiles: null }), w.v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }))],
      ['wireframe', (w) => (w.v.setLighting(null), w.v.setRenderMode('wireframe'))],
      ['xray', (w) => w.v.setRenderMode('xray')],
      ['shaded', (w) => (w.v.setRenderMode('shaded'), w.v.setRenderOptions({ hiddenEdges: 0 }))],
    ];
    let k = 1;
    for (const [name, fn] of states) {
      // 모드·단면이 바뀌면 새로 모으고, 그림자·외곽선만 바뀌면(모으기 값이 같다) 고친다
      step(on, off, name, (w) => (fn(w), w.v.setItemVisible(`a${k - 1}`, true), w.v.highlight(null)));
      sync();
      flip(`${name}-1`, ++k);
      flip(`${name}-2`, ++k);
    }
    // 색 객체를 바꿔 끼운 그물이 있는 그리기는(숨김이 함께 바뀌어도) 새로 모은다
    step(on, off, 'color-object', (w) => {
      (w === on ? sc1 : sc2).meshes.find((m) => m.id === 'b11')!.color = [0.2, 0.9, 0.2, 1];
      w.v.setItemVisible('a12', false);
    });
    fresh('color-object');
    step(on, off, 'color-still', () => undefined);
    flip('after-color', 13);
  });

  it('묶어 그리기 덩이(그리기 뼈대)가 섞인 장면에서도 덩이 밖 차례로 고친다', async () => {
    expect(await Viewer3d.preloadMerging()).toBe(true);
    const mixed = (): Scene3d => {
      const sc = scene();
      const own: Mesh3d[] = [];
      for (let i = 0; i < 240; i++) {
        const m = boxMesh(`m${i}`, [0, 0, 0], [5, 5, 3 + (i % 4)], PAL[i % 3]!, `g${i % 3}`);
        m.origin = [(i % 20) * 8 - 50, Math.floor(i / 20) * 8 + 60, 0];
        own.push(m);
      }
      // 제 배열 그물을 같은 꼴 자리 사이에 끼운다(덩이와 자리가 장면 차례로 섞인다)
      sc.meshes.splice(24, 0, ...own.slice(0, 120));
      sc.meshes.push(...own.slice(120));
      return sc;
    };
    const mk = (p: boolean): W => {
      const w = view(mixed(), p);
      w.v.setRenderOptions({ merging: 'on' });
      for (let i = 0; i < 50 && w.v.stats.merged.pending > 0; i++) w.v.renderNow();
      w.v.renderNow();
      return w;
    };
    const on = mk(true), off = mk(false);
    expect(on.v.stats.merged.meshes).toBeGreaterThan(200);
    expect(on.r.mgOrder).not.toBeNull();
    step(on, off, 'still', () => undefined);
    const { fixed, sync } = watch(on);
    step(on, off, 'hide-a0', (w) => w.v.setItemVisible('a0', false));
    fixed('hide-a0');
    step(on, off, 'hide-m7-b2', (w) => (w.v.setItemVisible('m7', false), w.v.setItemVisible('b2', false)));
    fixed('hide-m7-b2');
    step(on, off, 'hi', (w) => w.v.highlight(['m9', 'a3', 'c4']));
    fixed('hi');
    step(on, off, 'show-a0-hi', (w) => (w.v.setItemVisible('a0', true), w.v.highlight(['b8'])));
    fixed('show-a0-hi');
    expect(step(on, off, 'still-2', () => undefined)).toBe(0);
    step(on, off, 'section', (w) => w.v.setSection({ normal: [0, 1, 0], offset: 80000 }));
    sync();
    step(on, off, 'section-hide', (w) => w.v.setItemVisible('c7', false));
    fixed('section-hide');
    step(on, off, 'hidden-line', (w) => (w.v.setSection(null), w.v.setRenderMode('hiddenLine'), w.v.setRenderOptions({ hiddenEdges: 0.4 })));
    sync();
    step(on, off, 'hidden-hide', (w) => (w.v.setItemVisible('b5', false), w.v.highlight(['a5'])));
    fixed('hidden-hide');
  });
});
