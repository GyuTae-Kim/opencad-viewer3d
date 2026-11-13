/**
 * 0.69.0 인스턴싱 회전 표 꼴(IROT — 0.68.0 남은 한계 "카메라를 돌린 프레임은 자리 자료를 모두 다시 쓴다(값이 시점·투영을 곱한 것 — 그물 11텍셀·선 5텍셀)"):
 *  - 자리마다 시점에 달린 값 가운데 모형 0~2열(회전)에만 기대는 몫(시점 투영 · 모형·시점 · 모형 0~2열, 법선 행렬, 그림자 행렬 0~2열, 안개 z 행 앞 세 칸)은 묶음 앞 표 항목에
 *    회전마다 한 번, 자리에는 3열(이동)만(그물 2텍셀 + 그림자 1 + 단면 1, 선 2텍셀) — 0.67.0 묶어 그리기 회전 표 꼴(MROT)과 같은 셈이라 float32 값이 비트까지 같다
 *  - 회전이 모두 다른 묶음도 같은 꼴(텍셀은 0.68.0 꼴과 같다 — 묶음 사이에 프로그램을 바꾸지 않게), 겉모습이 있으면 0.68.0 꼴(자리마다 온 행렬)
 *  - 그린 도형(tests/drawexpand.ts)이 회전 표 꼴을 끈 뷰어(0.68.0 꼴)·뼈대 없이 모으는 뷰어와 프레임마다 같다(돌림·그림자·단면·안개·숨은 선·와이어프레임·외곽선·X-ray·
 *    겉모습·확대(화면 밖 잘라내기)·숨김·강조)
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

type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown>; up: { texels: number } };
type Mode = 'rot' | 'full' | 'noplan';

/** 뷰어(자리 자료 그림 단위 5에 올린 텍셀을 센다). full = 회전 표 꼴을 끈다(0.68.0 꼴), noplan = 뼈대도 끄고 그리기마다 판을 잊는다 */
function view(sc: Scene3d, mode: Mode): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, r, up: { texels: 0 } };
  if (mode !== 'rot') r.instRotOff = true;
  if (mode === 'noplan') r.instPlanOff = true;
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

/** 뷰어들에 같은 일을 하고 한 프레임씩 그려 펼친 도형이 같은지 — [회전 표 꼴, 0.68.0 꼴] 뷰어가 올린 자리 자료 텍셀 수 */
function step(ws: W[], label: string, fn: (w: W) => void): number[] {
  for (const w of ws) fn(w);
  for (const w of ws) w.up.texels = 0;
  const [a, ...rest] = ws.map(shot);
  for (const b of rest) {
    expect(b!.length, label).toBe(a!.length);
    for (let i = 0; i < a!.length; i++) if (a![i] !== b![i]) expect(b![i], `${label} #${i}`).toBe(a![i]);
  }
  return [ws[0]!.up.texels, ws[1]!.up.texels];
}

const PAL: Rgba[] = [
  [0.7, 0.4, 0.3, 1],
  [0.3, 0.6, 0.8, 1],
];

/**
 * STEP 꼴: 꼴 a(윤곽선)·b(윤곽선·정점 색)는 24자리씩 회전 셋(0°·45°·누운 45°), c(윤곽선 없음)는 회전이 모두 다르다(표 항목이 많아 0.68.0 꼴),
 * d(윤곽선)는 행렬 없이 원점만(모형 = 원점 이동 — 회전은 하나) 12자리, e(윤곽선)는 행렬도 원점도 없는 8자리(모형 없음). 큰 좌표, 색 둘
 */
function scene(): Scene3d {
  const shape = (k: string, h: number, vc: boolean, edges: boolean): Mesh3d => {
    const m = boxMesh(k, [-3, -3, -2], [3, 3, h], PAL[0]!);
    if (vc) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7) % 10) / 10));
    if (!edges) delete m.edges;
    return m;
  };
  const S = { a: shape('a', 2, false, true), b: shape('b', 3, true, true), c: shape('c', 4, false, false), d: shape('d', 1, false, true), e: shape('e', 5, false, true) };
  const meshes: Mesh3d[] = [];
  for (const k of ['a', 'b', 'c'] as const)
    for (let i = 0; i < 24; i++) {
      const id = `${k}${i}`;
      const deg = k === 'c' ? 7 * i + 3 : i % 3 === 0 ? 0 : 45;
      const m = placeAt((i % 6) * 10 - 120000, Math.floor(i / 6) * 10 + 80000 + 'abc'.indexOf(k) * 50, -2500, deg, i % 3 === 2);
      meshes.push({ ...S[k], id, name: id, group: `g${i % 3}`, color: PAL[i % 2]!, matrix: m, origin: [120000, -80000, 2500] });
    }
  for (let i = 0; i < 12; i++) meshes.push({ ...S.d, id: `d${i}`, name: `d${i}`, color: PAL[i % 2]!, origin: [i * 9 - 40, 60, 0] });
  for (let i = 0; i < 8; i++) meshes.push({ ...S.e, id: `e${i}`, name: `e${i}`, color: PAL[0]! });
  return { name: 's', units: 'mm', meshes, lines: [] };
}

describe('0.69.0 인스턴싱 회전 표 꼴', () => {
  it('돌린 프레임은 회전마다 표 한 번과 자리마다 3열만 쓴다 — 그린 도형은 0.68.0 꼴·뼈대 없는 뷰어와 프레임마다 같다', () => {
    const ws = [view(scene(), 'rot'), view(scene(), 'full'), view(scene(), 'noplan')];
    const on = ws[0]!;
    // 회전 표 변종(IROT)을 쓴다
    const keys = (): string[] => [...(on.r.variants as Map<string, unknown>).keys()];
    expect(keys().some((k) => k.includes('IROT'))).toBe(true);
    expect(step(ws, 'still', () => undefined)[0]).toBe(0);
    // 돌린 프레임 올림 텍셀: 0.68.0 꼴은 면 자리 92 × 11 + 선 자리 68 × 5 = 1,352. 회전 표 꼴은 면 a·b 묶음 넷 × (표 3 × 9 + 12 × 2), c는 회전이 모두 달라
    // 묶음 둘 × (12 × 9 + 12 × 2 — 0.68.0 꼴과 같은 텍셀), d 묶음 둘 × (9 + 6 × 2), e (모형 없음 항목 9 + 8 × 2), 선 a·b × (3 × 3 + 24 × 2)·d (3 + 12 × 2)·e (3 + 8 × 2)
    // = 204 + 264 + 42 + 25 + 160 = 695
    const [t1, t0] = step(ws, 'orbit', (w) => w.v.orbitBy(0.05, 0.02));
    expect(t0).toBe(92 * 11 + 68 * 5);
    expect(t1).toBe(695);
    expect(step(ws, 'still-2', () => undefined)[0]).toBe(0);
    const cases: [string, (w: W) => void][] = [
      ['hide', (w) => w.v.setItemVisible('a4', false)],
      ['hi', (w) => w.v.highlight(['b7', 'c3', 'd2', 'e1'])],
      ['shadow', (w) => w.v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true })],
      ['section', (w) => (w.v.setLighting(null), w.v.setSection({ normal: [1, 0, 0], offset: -119985 }))],
      ['section-shadow', (w) => w.v.setLighting({ sun: { direction: [0.3, -0.5, 0.8] }, shadows: true })],
      ['fog', (w) => (w.v.setLighting(null), w.v.setSection(null), w.v.setFog({ start: 50, end: 400 }))],
      ['hidden-line', (w) => (w.v.setFog(null), w.v.setRenderMode('hiddenLine'), w.v.setRenderOptions({ hiddenEdges: 0.4 }))],
      ['wireframe', (w) => w.v.setRenderMode('wireframe')],
      ['profiles', (w) => (w.v.setRenderMode('shadedEdges'), w.v.setRenderOptions({ profiles: { width: 1 } }))],
      ['xray', (w) => (w.v.setRenderOptions({ profiles: null }), w.v.setRenderMode('xray'))],
      ['look', (w) => (w.v.setRenderMode('shadedEdges'), w.v.setItemLooks([['a5', { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1] }]]))],
      ['look-off', (w) => w.v.clearItemLooks()],
      ['zoom', (w) => w.v.zoomBy(0.3)],
    ];
    for (const [name, fn] of cases) {
      step(ws, name, fn);
      expect(step(ws, `${name}-still`, () => undefined)[0], name).toBe(0);
      step(ws, `${name}-orbit`, (w) => w.v.orbitBy(0.04, 0.01));
      step(ws, `${name}-flip`, (w) => (w.v.setItemVisible('a4', true), w.v.setItemVisible('b9', false), w.v.highlight(['a8'])));
      step(ws, `${name}-flip-back`, (w) => (w.v.setItemVisible('b9', true), w.v.setItemVisible('a4', false), w.v.highlight(null)));
    }
    expect(on.v.stats.culled).toBeGreaterThan(0);
  });
});
