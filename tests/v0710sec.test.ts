/**
 * 0.71.0 단면 하나 가만히 프레임(STEP 84차 — 반복 부품 1만 꼴 200 단면 가만히가 0.69.0부터 0.68.0보다 무거웠다):
 *  - 잘린 면 채우기 단위(capUnits — 보이는 그물마다 반투명·범위·평면 걸침)는 그물 기록 목록·평면·채우기·겉모습 판·숨은 선 모드가 지난 그리기와 같으면 다시 세지 않는다
 *    (단위 색은 그리기마다). 평면을 옮기거나 숨김·겉모습·모드·채우기·그물이 바뀐 그리기는 다시 센다
 *  - 뼈대를 고쳐(숨겼다 다시 보이기·강조 바꿈) 차례 rest에 넣은 그물을 그 차례가 묶음에 모으면 rest에서 뺀다 — 0.69.0·0.70.0은 남겨 가만히 프레임마다 그 그물들을
 *    첫 줄 검사로 다시 훑었다(다 올린 STEP 반복 부품 1만 — 면·윤곽선 차례 rest 8,349개씩)
 *  - 그린 도형(tests/drawexpand.ts)이 캐시를 끈 뷰어·뼈대 없이 그리기마다 모으는 뷰어와 프레임마다 같다
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

type Mark = 'ipf' | 'ipz' | 'ipe' | 'ipd';
type Plan = { id: number; fix: number; rest: Partial<Record<Mark, Record<Mark, number | undefined>[]>> };
type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown>; caps: number; units: number };
type Sec = { setSectionAxis(a: string, t: number, o?: { caps?: 'closed' | 'all' | 'none'; world?: boolean }): void };

/** 뷰어(off = 'plan'이면 뼈대를 끄고 그리기마다 판을 잊는다, 'cap'이면 채우기 단위 캐시를 끈다). 렌더러 capUnits를 부른 수를 센다 */
function view(sc: Scene3d, off: 'plan' | 'cap' | null, mode: 'shadedEdges' | 'hiddenLine' = 'shadedEdges'): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: mode, viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, r, caps: 0, units: 0 };
  if (off === 'plan') r.instPlanOff = true;
  if (off === 'cap') r.capMemoOff = true;
  const cu = (r.capUnits as (...a: unknown[]) => unknown).bind(r);
  r.capUnits = (...a: unknown[]) => {
    w.caps++;
    const out = cu(...a) as unknown[];
    w.units = out.length;
    return out;
  };
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

/** 두 뷰어에 같은 일을 하고 한 프레임씩 그려 펼친 도형이 같은지 — 첫 뷰어가 이 그리기에서 capUnits를 부른 수 */
function step(on: W, off: W, label: string, fn: (w: W) => void): number {
  for (const w of [on, off]) fn(w);
  const c0 = on.caps;
  const b = shot(on), a = shot(off);
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
  return on.caps - c0;
}

const PAL: Rgba[] = [
  [0.7, 0.4, 0.3, 1],
  [0.3, 0.6, 0.8, 1],
  [0.5, 0.5, 0.5, 1],
];

/** STEP 꼴 반복 부품: 꼴 셋(a — 윤곽선, b — 윤곽선·정점 색, c — 윤곽선 없음)을 n자리씩 장면 차례로 번갈아(배열을 함께 씀 — 큰 원점, 둘째마다 회전, 닫힌 그물), 제 배열 그물 셋 */
function scene(n = 24): Scene3d {
  const shape = (k: string, h: number, vc: boolean, edges: boolean): Mesh3d => {
    const m = boxMesh(k, [-3, -3, -2], [3, 3, h], PAL[0]!);
    m.origin = [120000, -80000, 2500];
    if (vc) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7) % 10) / 10));
    if (!edges) delete m.edges;
    return m;
  };
  const S = [shape('a', 2, false, true), shape('b', 3, true, true), shape('c', 4, false, false)];
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < n; i++)
    S.forEach((s, k) => {
      const id = `${'abc'[k]}${i}`;
      const m = placeAt((i % 6) * 10 - 120000, Math.floor(i / 6) * 10 + 80000 + k * 60, -2500, i % 2 ? 30 * k + 45 : 0, i % 4 === 1);
      meshes.push({ ...s, id, name: id, group: `g${i % 3}`, color: PAL[(i + k) % 3]!, matrix: m, closed: true });
    });
  for (let i = 0; i < 3; i++) meshes.push({ ...boxMesh(`u${i}`, [i * 12, -30, 0], [i * 12 + 8, -22, 6], PAL[i]!, 'g0'), closed: true });
  return { name: 's', units: 'mm', meshes, lines: [] };
}

const plan = (w: W): Plan => w.r.instPlan as Plan;

/** 뼈대 차례 rest에 그 차례 묶음에 든(표시가 이 뼈대인) 그물 수 */
function staleRest(w: W): number {
  const P = plan(w);
  let n = 0;
  for (const k of ['ipf', 'ipz', 'ipe', 'ipd'] as const) for (const x of P.rest[k] ?? []) if (x[k] === P.id) n++;
  return n;
}

describe('0.71.0 단면 하나 가만히 프레임', () => {
  it('가만히 프레임은 잘린 면 채우기 단위를 다시 세지 않고, 평면·숨김·겉모습·모드·채우기·그물이 바뀌면 다시 센다 — 그린 도형은 캐시를 끈 뷰어와 같다', () => {
    const on = view(scene(), null), off = view(scene(), 'cap');
    // 세계 높이(z = t) 단면 — 서 있는 상자(높이 −2~2·3·4)와 제 배열 상자(0~6)를 가로지른다
    const sec = (w: W, t: number, caps?: 'closed' | 'all'): void => (w.v as unknown as Sec).setSectionAxis('z', t, { world: true, ...(caps ? { caps } : {}) });
    expect(step(on, off, 'sec', (w) => sec(w, 0.5)), 'sec').toBe(1);
    // 채우기 단위가 있는 장면이다(잘린 면 채우기 그리기가 있다)
    expect(off.units).toBeGreaterThan(0);
    for (let j = 0; j < 3; j++) expect(step(on, off, `still${j}`, () => undefined), `still${j}`).toBe(0);
    expect(step(on, off, 'move', (w) => sec(w, 0.42)), 'move').toBe(1);
    expect(step(on, off, 'move-still', () => undefined), 'move-still').toBe(0);
    expect(step(on, off, 'hide', (w) => w.v.setItemVisible('a3', false)), 'hide').toBe(1);
    expect(step(on, off, 'show', (w) => w.v.setItemVisible('a3', true)), 'show').toBe(1);
    // 강조는 단위를 바꾸지 않는다(채운 면 강조 섞기는 그리기마다)
    expect(step(on, off, 'hi', (w) => w.v.highlight(['a2', 'b2'])), 'hi').toBe(0);
    expect(step(on, off, 'hi-off', (w) => w.v.highlight(null)), 'hi-off').toBe(0);
    // 겉모습(색 — 채운 면 바탕색, 불투명도 — 반투명 그물은 단위에서 빠진다)
    expect(step(on, off, 'look-color', (w) => w.v.setItemColor('a2', [0.9, 0.1, 0.1, 1])), 'look-color').toBe(1);
    expect(step(on, off, 'look-still', () => undefined), 'look-still').toBe(0);
    expect(step(on, off, 'look-alpha', (w) => w.v.setItemLooks([['b3', { opacity: 0.4 }]])), 'look-alpha').toBe(1);
    expect(step(on, off, 'look-off', (w) => w.v.setItemLooks([['b3', { opacity: null }], ['a2', { color: null }]])), 'look-off').toBe(1);
    // 단색 모드는 단위가 같고 색만 다르다(그리기마다 다시 센 색), 숨은 선 모드는 다시 센다(반투명 판단이 다르다)
    expect(step(on, off, 'mono', (w) => w.v.setRenderMode('monochrome')), 'mono').toBe(0);
    expect(step(on, off, 'hidden', (w) => w.v.setRenderMode('hiddenLine')), 'hidden').toBe(1);
    expect(step(on, off, 'shaded', (w) => w.v.setRenderMode('shadedEdges')), 'shaded').toBe(1);
    expect(step(on, off, 'caps-all', (w) => sec(w, 0.42, 'all')), 'caps-all').toBe(1);
    expect(step(on, off, 'caps-all-still', () => undefined), 'caps-all-still').toBe(0);
    // 그물 바꾸기(새 기록)
    const swap = (w: W): void => {
      const m = w.v.scene!.meshes.find((x) => x.id === 'c4')!;
      w.v.setMesh({ ...m, color: [0.2, 0.9, 0.2, 1] });
    };
    expect(step(on, off, 'setMesh', swap), 'setMesh').toBe(1);
    expect(step(on, off, 'setMesh-still', () => undefined), 'setMesh-still').toBe(0);
    // 단면을 끄면 단위가 없다
    expect(step(on, off, 'sec-off', (w) => w.v.setSection(null)), 'sec-off').toBe(0);
    expect(step(on, off, 'sec-again', (w) => sec(w, 0.42)), 'sec-again').toBe(1);
  });

  it('그물 기록은 회전 표 열쇠 칸(rk·rkm·rke)을 처음부터 같은 차례로 가진다 — 회전 표를 센 묶음 그물·그물마다 그리는 그물·바꾼 그물 모두', () => {
    const on = view(scene(), null);
    (on.v as unknown as Sec).setSectionAxis('z', 0.5, { world: true });
    on.v.renderNow();
    on.v.setItemVisible('a3', false);
    on.v.renderNow();
    const m = on.v.scene!.meshes.find((x) => x.id === 'c4')!;
    on.v.setMesh({ ...m, color: [0.2, 0.9, 0.2, 1] });
    on.v.renderNow();
    const recs = (on.r as unknown as { meshes: Record<string, unknown>[] }).meshes;
    // 글자 객체 칸(늦게 더하는 칸 앞까지)이 모든 기록에서 같은 차례 — 0.69.0·0.70.0은 rotKey가 묶음 그물에만 rk·rkm·rke를 늦게 더했다(제 배열 그물에는 없다)
    const head = (r: Record<string, unknown>): string => {
      const ks = Object.keys(r);
      return ks.slice(0, ks.indexOf('rke') + 1).join(',');
    };
    const h0 = head(recs[0]!);
    expect(h0.endsWith('lkv,lko,rk,rkm,rke'), h0).toBe(true);
    for (const r of recs) expect(head(r), String((r.src as { id: string }).id)).toBe(h0);
    // 회전 표를 센 묶음 그물과 그물마다 그리는 제 배열 그물이 함께 있다
    expect(recs.some((r) => typeof r.rkm === 'object')).toBe(true);
    expect(recs.some((r) => (r.src as { id: string }).id === 'u0' && r.rkm === undefined)).toBe(true);
  });

  it('숨겼다 다시 보인 그물을 묶음에 모은 뒤 뼈대 rest에 남기지 않는다 — 그린 도형은 뼈대 없이 모으는 뷰어와 같다', () => {
    for (const mode of ['shadedEdges', 'hiddenLine'] as const) {
      const on = view(scene(), null, mode), off = view(scene(), 'plan', mode);
      step(on, off, `${mode} still`, () => undefined);
      const id0 = plan(on).id;
      const ids = ['a3', 'b5', 'a7', 'b9', 'c11'];
      step(on, off, `${mode} hide`, (w) => {
        for (const id of ids) w.v.setItemVisible(id, false);
      });
      step(on, off, `${mode} show`, (w) => {
        for (const id of ids) w.v.setItemVisible(id, true);
      });
      // 같은 뼈대를 고쳐 다시 썼다(새로 모으지 않았다) — 다시 보인 그물은 그 차례 묶음에 모였다
      expect(plan(on).id, mode).toBe(id0);
      expect(plan(on).fix, mode).toBeGreaterThan(0);
      step(on, off, `${mode} still2`, () => undefined);
      expect(staleRest(on), `${mode} rest에 남은 묶음 그물`).toBe(0);
      // 강조를 바꿔도(면·윤곽선 표시를 지운 그물을 rest에 넣고 다시 모은다)
      step(on, off, `${mode} hi`, (w) => w.v.highlight(['a3', 'a4']));
      step(on, off, `${mode} hi-off`, (w) => w.v.highlight(null));
      step(on, off, `${mode} still3`, () => undefined);
      expect(plan(on).id, `${mode} 강조`).toBe(id0);
      expect(staleRest(on), `${mode} 강조 뒤 rest`).toBe(0);
      // 단면을 켠 뒤에도(윤곽선은 그물마다 — rest에 그대로)
      for (const w of [on, off]) (w.v as unknown as Sec).setSectionAxis('y', 0.4);
      step(on, off, `${mode} sec`, () => undefined);
      step(on, off, `${mode} sec-hide`, (w) => w.v.setItemVisible('a2', false));
      step(on, off, `${mode} sec-show`, (w) => w.v.setItemVisible('a2', true));
      step(on, off, `${mode} sec-still`, () => undefined);
      expect(staleRest(on), `${mode} 단면 rest`).toBe(0);
    }
  });
});
