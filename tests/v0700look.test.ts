/**
 * 0.70.0 겉모습(부품 색·흐리게·분해 — setItemLooks)을 건 인스턴싱 묶음(0.69.0 남은 한계 "겉모습이 있으면 0.68.0 꼴"):
 *  - 겉모습 판(RenderState.lookKey)이 있으면 그물 기록마다 그 판의 겉모습을 적어 두고, 같은 판의 그리기는 뷰어 겉모습(look)을 다시 묻지 않는다
 *  - 행렬을 건 겉모습이 없으면(뷰어 lookMoved: false) 화면 밖 잘라내기를 겉모습이 없을 때처럼 덩어리로, 행렬이 있으면 그물마다(그 잘라내기 자료는 겉모습 모형 캐시에)
 *  - 판이 있으면 겉모습이 있어도 인스턴싱 회전 표 꼴(IROT): 돌린 프레임 올림 텍셀이 같은 색을 장면 색으로 준 장면(겉모습 없음)과 같고, 이동뿐인 분해 행렬도 같다
 *  - 그린 도형(tests/drawexpand.ts)이 0.68.0 꼴(회전 표 꼴 끔)·뼈대 없는 뷰어·판을 넘기지 않는 뷰어(0.69.0 길 — 기록 캐시·회전 표 꼴·뼈대·덩어리 잘라내기 모두 없이)와
 *    프레임마다 같다(돌림·숨김·강조·그림자·단면·안개·숨은 선·와이어프레임·외곽선·X-ray·분해·회전 겉모습·색 바꿈·확대)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Rgba, Scene3d } from '../src/types';
import { type ItemLookInput, Viewer3d } from '../src/viewer';
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

type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown>; up: { texels: number; looks: number } };
/** rot = 기본(0.70.0), full = 회전 표 꼴 끔(0.68.0 꼴), noplan = 뼈대도 끔, nokey = 렌더러에 겉모습 판·행렬 알림을 넘기지 않는다(0.69.0 길) */
type Mode = 'rot' | 'full' | 'noplan' | 'nokey';
type St = { look?: ((id: string) => unknown) | null; lookKey?: number; lookMoved?: boolean };

/** 뷰어(자리 자료 그림 단위 5에 올린 텍셀과 렌더러가 뷰어 겉모습을 물은 수를 센다). pre = 첫 그리기 전에 할 일(겉모습 걸기) */
function view(sc: Scene3d, mode: Mode, pre?: (v: Viewer3d) => void): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, r, up: { texels: 0, looks: 0 } };
  if (mode !== 'rot') r.instRotOff = mode !== 'nokey';
  if (mode === 'noplan') r.instPlanOff = true;
  const render = (r.render as (f: unknown, a: number, b: number, st: St) => void).bind(r);
  r.render = (f: unknown, a: number, b: number, st: St): void => {
    const look = st.look;
    const s: St = { ...st, look: look ? (id: string) => (w.up.looks++, look(id)) : look };
    if (mode === 'nokey') {
      delete s.lookKey;
      delete s.lookMoved;
    }
    render(f, a, b, s);
  };
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
  pre?.(v);
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

/** 뷰어들에 같은 일을 하고 한 프레임씩 그려 펼친 도형이 같은지 — 뷰어마다 올린 자리 자료 텍셀 수 */
function step(ws: W[], label: string, fn: (w: W) => void): number[] {
  for (const w of ws) fn(w);
  for (const w of ws) w.up.texels = w.up.looks = 0;
  const [a, ...rest] = ws.map(shot);
  for (const b of rest) {
    expect(b!.length, label).toBe(a!.length);
    for (let i = 0; i < a!.length; i++) if (a![i] !== b![i]) expect(b![i], `${label} #${i}`).toBe(a![i]);
  }
  return ws.map((w) => w.up.texels);
}

const PAL: Rgba[] = [
  [0.7, 0.4, 0.3, 1],
  [0.3, 0.6, 0.8, 1],
];
/** 부품 색(꼴마다 한 색 — STEP 앱 부품 색 구분처럼 같은 제품은 같은 색) */
const PART: Record<string, Rgba> = { a: [0.9, 0.3, 0.2, 1], b: [0.2, 0.7, 0.4, 1], c: [0.3, 0.4, 0.9, 1], d: [0.8, 0.8, 0.2, 1], e: [0.6, 0.3, 0.7, 1] };

/**
 * 0.69.0 시험과 같은 STEP 꼴(꼴 a·b(정점 색)는 24자리씩 회전 셋, c(윤곽선 없음)는 회전이 모두 다름, d는 원점만 12자리, e는 모형 없는 8자리, 큰 좌표).
 * part면 장면 색을 부품 색으로(겉모습 없이 같은 색 — 텍셀 기준), 아니면 색 둘을 번갈아
 */
function scene(part = false): Scene3d {
  const shape = (k: string, h: number, vc: boolean, edges: boolean): Mesh3d => {
    const m = boxMesh(k, [-3, -3, -2], [3, 3, h], PAL[0]!);
    if (vc) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7) % 10) / 10));
    if (!edges) delete m.edges;
    return m;
  };
  const S = { a: shape('a', 2, false, true), b: shape('b', 3, true, true), c: shape('c', 4, false, false), d: shape('d', 1, false, true), e: shape('e', 5, false, true) };
  const col = (k: keyof typeof S, i: number): Rgba => (part ? PART[k]! : PAL[i % 2]!);
  const meshes: Mesh3d[] = [];
  for (const k of ['a', 'b', 'c'] as const)
    for (let i = 0; i < 24; i++) {
      const id = `${k}${i}`;
      const deg = k === 'c' ? 7 * i + 3 : i % 3 === 0 ? 0 : 45;
      const m = placeAt((i % 6) * 10 - 120000, Math.floor(i / 6) * 10 + 80000 + 'abc'.indexOf(k) * 50, -2500, deg, i % 3 === 2);
      // 정점 색 꼴 b는 부품 색 기준 장면에서 정점 색을 뺀다(겉모습 색은 정점 색 대신 쓴다)
      const s = part && k === 'b' ? { ...S.b, colors: undefined } : S[k];
      meshes.push({ ...s, id, name: id, group: `g${i % 3}`, color: col(k, i), matrix: m, origin: [120000, -80000, 2500] });
    }
  for (let i = 0; i < 12; i++) meshes.push({ ...S.d, id: `d${i}`, name: `d${i}`, color: col('d', i), origin: [i * 9 - 40, 60, 0] });
  for (let i = 0; i < 8; i++) meshes.push({ ...S.e, id: `e${i}`, name: `e${i}`, color: col('e', i) });
  return { name: 's', units: 'mm', meshes, lines: [] };
}

/** STEP 앱 부품 색 겉모습(묶음마다 색, 불투명도·행렬 없음) */
const partLooks = (sc: Scene3d): [string, ItemLookInput][] => sc.meshes.map((m) => [m.id, { opacity: null, pickable: true, color: PART[m.id[0]!]!, matrix: null }]);
/** 분해(이동 행렬 — 묶음 g마다 다른 양) */
const explode = (sc: Scene3d, d: number): [string, ItemLookInput][] =>
  sc.meshes.map((m, i) => [m.id, { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, (i % 3) * d, 0, (i % 2) * d * 0.5, 1] }]);
/** 분해 이동을 장면 행렬에 더해 둔 부품 색 장면(겉모습 없음 — 분해한 상태에서 잘라내는 그물 수 기준). first개만 옮기면 나머지는 제자리 */
function baked(d: number, first = Infinity): Scene3d {
  const s = scene(true);
  s.meshes = s.meshes.map((m, i) => {
    if (i >= first) return m;
    const M = m.matrix ? Array.from(m.matrix) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    M[12] += (i % 3) * d;
    M[14] += (i % 2) * d * 0.5;
    return { ...m, matrix: new Float64Array(M) };
  });
  return s;
}

describe('0.70.0 겉모습을 건 인스턴싱 묶음', () => {
  it('겉모습 판이 같은 그리기는 뷰어 겉모습을 다시 묻지 않고, 행렬이 없으면 잘라내기를 덩어리로 — 그린 도형은 0.69.0 길과 같다', () => {
    const sc = scene();
    const looks = partLooks(sc);
    const pre = (v: Viewer3d): void => void v.setItemLooks(looks);
    const ws = [view(sc, 'rot', pre), view(sc, 'nokey', pre)];
    const [on, old] = ws;
    // 같은 색을 장면 색으로 준 장면(겉모습 없음 — 잘라내는 그물 수 기준)
    const ref = view(scene(true), 'rot');
    const n = sc.meshes.length;
    step(ws, 'still', () => undefined);
    // 판이 그대로면 묻지 않는다(판이 없으면 프레임마다 그물마다 여러 차례 — 잘라내기 행렬 보기·반투명 고르기)
    expect(on!.up.looks).toBe(0);
    expect(old!.up.looks).toBeGreaterThanOrEqual(2 * n);
    step(ws, 'orbit', (w) => w.v.orbitBy(0.05, 0.02));
    expect(on!.up.looks).toBe(0);
    ref.v.orbitBy(0.05, 0.02);
    step(ws, 'hide', (w) => w.v.setItemVisible('a4', false));
    ref.v.setItemVisible('a4', false);
    expect(on!.up.looks).toBe(0);
    step(ws, 'hi', (w) => w.v.highlight(['b7', 'c3']));
    expect(on!.up.looks).toBe(0);
    // 겉모습을 바꾸면 새 판 — 그물마다 한 번씩 다시 묻는다(보이는 그물만)
    step(ws, 'recolor', (w) => w.v.setItemLooks([['a5', { color: [0.1, 0.9, 0.9, 1] }], ['d3', { opacity: 0.5 }]]));
    expect(on!.up.looks).toBe(n - 1);
    step(ws, 'recolor-still', () => undefined);
    expect(on!.up.looks).toBe(0);
    // 확대(잘라내기): 행렬을 건 겉모습이 없으면 덩어리 잘라내기(겉모습이 없을 때의 길 — 0.69.0은 겉모습이 있으면 늘 그물마다라 덩어리를 만들지 않았다)
    step(ws, 'zoom', (w) => w.v.zoomBy(0.3));
    ref.v.zoomBy(0.3);
    ref.v.renderNow();
    expect(on!.v.stats.culled).toBeGreaterThan(0);
    expect(on!.v.stats.culled).toBe(ref.v.stats.culled);
    expect(old!.v.stats.culled).toBe(ref.v.stats.culled);
    const chunks = (w: W): number => (w.r.cullChunks as { recs: unknown[] }).recs.length;
    expect(chunks(on!)).toBeGreaterThan(0);
    // 분해(행렬): 덩어리 잘라내기에서 행렬을 건 그물만 따로(옮긴 자리로 — 잘라내기 자료는 겉모습 모형 캐시에). 분해 이동을 장면 행렬에 더한 장면과 같은 그물을 잘라낸다
    const cam = (w: W): ReturnType<Viewer3d['getCamera']> => w.v.getCamera();
    const refAt = (s: Scene3d): W => {
      const x = view(s, 'rot');
      x.v.setItemVisible('a4', false);
      x.v.setCamera(cam(on!));
      x.v.renderNow();
      return x;
    };
    const cases: [string, number, number][] = [
      ['explode', 40, Infinity],
      // 몇 개만 옮김(끌어 옮긴 부품 — 나머지는 덩어리째)
      ['explode-few', 25, 6],
    ];
    for (const [name, d, first] of cases) {
      step(ws, name, (w) => (w.v.clearItemLooks(), w.v.setItemLooks(Number.isFinite(first) ? explode(sc, d).slice(0, first) : explode(sc, d))));
      const bk = refAt(baked(d, first));
      expect(on!.v.stats.culled, name).toBeGreaterThan(0);
      expect(on!.v.stats.culled, name).toBe(bk.v.stats.culled);
      expect(old!.v.stats.culled, name).toBe(bk.v.stats.culled);
      expect(chunks(on!), name).toBeGreaterThan(0);
    }
    const recs = on!.r.meshes as { src: { id: string }; lookM?: { cull?: unknown } }[];
    expect(recs.find((x) => x.src.id === 'a1')!.lookM!.cull).toBeTruthy();
    step(ws, 'explode-orbit', (w) => w.v.orbitBy(-0.08, 0.01));
    expect(on!.up.looks).toBe(0);
    step(ws, 'explode-off', (w) => w.v.clearItemLooks());
    ref.v.setCamera(cam(on!));
    ref.v.renderNow();
    expect(on!.v.stats.culled).toBe(ref.v.stats.culled);
  });

  it('판이 있으면 겉모습이 있어도 회전 표 꼴 — 돌린 프레임 텍셀이 같은 색의 겉모습 없는 장면과 같고, 그린 도형은 0.68.0 꼴·뼈대 없음·0.69.0 길과 프레임마다 같다', () => {
    const sc = scene();
    // 첫 그리기 전에 부품 색을 건다(자리 자료 저장소의 자리가 처음부터 이 묶음들 — 올린 텍셀이 기준 장면과 견줄 수 있게)
    const pre = (v: Viewer3d): void => void v.setItemLooks(partLooks(sc));
    const ws = [view(sc, 'rot', pre), view(sc, 'full', pre), view(sc, 'noplan', pre), view(sc, 'nokey', pre)];
    // 같은 색을 장면 색으로 준 장면(겉모습 없음 — 묶음 나누기가 같다)
    const ref = view(scene(true), 'rot');
    ref.v.renderNow();
    ref.up.texels = 0;
    ref.v.orbitBy(0.05, 0.02);
    ref.v.renderNow();
    const refOrbit = ref.up.texels;
    // 꼴마다 묶음 하나: 면 a·b (표 3 × 9 + 24 × 2)·c (24 × 9 + 24 × 2)·d (9 + 12 × 2)·e (모형 없음 항목 9 + 8 × 2), 선 a·b (3 × 3 + 24 × 2)·d (3 + 12 × 2)·e (3 + 8 × 2)
    // = 150 + 264 + 33 + 25 + 160 = 632(0.69.0 시험의 색 둘 장면은 695)
    expect(refOrbit).toBe(632);
    expect(step(ws, 'parts-still', () => undefined)[0]).toBe(0);
    const keys = (): string[] => [...(ws[0]!.r.variants as Map<string, unknown>).keys()];
    expect(keys().some((k) => k.includes('IROT'))).toBe(true);
    const [t1, t0] = step(ws, 'parts-orbit', (w) => w.v.orbitBy(0.05, 0.02));
    expect(t1).toBe(refOrbit);
    // 0.68.0 꼴은 면 자리 92 × 11 + 선 자리 68 × 5
    expect(t0).toBe(92 * 11 + 68 * 5);
    // 이동뿐인 분해 행렬은 회전 열쇠가 같다(모형 0~2열이 그대로) — 같은 텍셀
    step(ws, 'explode', (w) => w.v.setItemLooks(explode(sc, 30)));
    expect(step(ws, 'explode-still', () => undefined)[0]).toBe(0);
    expect(step(ws, 'explode-orbit', (w) => w.v.orbitBy(0.05, 0.02))[0]).toBe(refOrbit);
    const cases: [string, (w: W) => void][] = [
      ['hide', (w) => w.v.setItemVisible('a4', false)],
      ['hi', (w) => w.v.highlight(['b7', 'c3', 'd2', 'e1'])],
      // 회전을 더한 겉모습 행렬(새 회전 열쇠)
      ['rot-look', (w) => w.v.setItemLooks([['a6', { matrix: placeAt(5, 0, 0, 30, false) }], ['d1', { matrix: placeAt(0, 4, 0, 90, true) }]])],
      ['recolor', (w) => w.v.setItemLooks([['b2', { color: [0.1, 0.1, 0.9, 1] }], ['c4', { color: null }], ['e2', { opacity: 0.4 }]])],
      ['shadow', (w) => w.v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true })],
      ['section', (w) => (w.v.setLighting(null), w.v.setSection({ normal: [1, 0, 0], offset: -119985 }))],
      ['section-shadow', (w) => w.v.setLighting({ sun: { direction: [0.3, -0.5, 0.8] }, shadows: true })],
      ['fog', (w) => (w.v.setLighting(null), w.v.setSection(null), w.v.setFog({ start: 50, end: 400 }))],
      ['hidden-line', (w) => (w.v.setFog(null), w.v.setRenderMode('hiddenLine'), w.v.setRenderOptions({ hiddenEdges: 0.4 }))],
      ['wireframe', (w) => w.v.setRenderMode('wireframe')],
      ['profiles', (w) => (w.v.setRenderMode('shadedEdges'), w.v.setRenderOptions({ profiles: { width: 1 } }))],
      ['xray', (w) => (w.v.setRenderOptions({ profiles: null }), w.v.setRenderMode('xray'))],
      ['explode-off', (w) => (w.v.setRenderMode('shadedEdges'), w.v.setItemLooks(sc.meshes.map((m) => [m.id, { matrix: null }])))],
      ['zoom', (w) => w.v.zoomBy(0.3)],
      ['explode-zoom', (w) => w.v.setItemLooks(explode(sc, 45))],
      ['clear', (w) => w.v.clearItemLooks()],
    ];
    for (const [name, fn] of cases) {
      step(ws, name, fn);
      expect(step(ws, `${name}-still`, () => undefined)[0], name).toBe(0);
      step(ws, `${name}-orbit`, (w) => w.v.orbitBy(0.04, 0.01));
      step(ws, `${name}-flip`, (w) => (w.v.setItemVisible('a4', true), w.v.setItemVisible('b9', false), w.v.highlight(['a8'])));
      step(ws, `${name}-flip-back`, (w) => (w.v.setItemVisible('b9', true), w.v.setItemVisible('a4', false), w.v.highlight(null)));
    }
    expect(ws[0]!.v.stats.culled).toBeGreaterThan(0);
  });

  it('화면 밖으로 잘라낸 그물이 있어도 가만히 프레임은 회전 표를 다시 세지 않고, 새로 모은 뼈대의 묶음은 같은 자리 묶음의 지난 표를 다시 쓴다(STEP 83차)', () => {
    const sc = scene();
    const ws = [view(sc, 'rot'), view(sc, 'full'), view(sc, 'noplan')];
    const on = ws[0]!;
    type B = { rt?: unknown; list?: unknown[] };
    const rts = (w: W): unknown[] => {
      const P = w.r.instPlan as { face: B[] | null; lines: Map<unknown, B[]> | null };
      return [...(P.face ?? []), ...[...(P.lines?.values() ?? [])].flat()].map((b) => b.rt);
    };
    // 잘라낸 그물이 있는 확대(0.69.0은 잘라낸 그물이 장면에 하나라도 있으면 묶음마다 프레임마다 새 목록이라 회전 표를 다시 셌다)
    step(ws, 'zoom', (w) => w.v.zoomBy(0.3));
    expect(on.v.stats.culled).toBeGreaterThan(0);
    for (const name of ['still', 'still-2', 'still-3']) {
      const seq = on.r.rotSeq as number, before = rts(on);
      expect(step(ws, name, () => undefined)[0], name).toBe(0);
      expect(on.r.rotSeq, name).toBe(seq);
      expect(rts(on), name).toEqual(before);
      expect(rts(on).every((x, i) => x === before[i]), name).toBe(true);
    }
    // 화면 밖이 바뀌면(돌림) 그 묶음만 다시 센다 — 그린 도형은 0.68.0 꼴·뼈대 없는 뷰어와 같다
    step(ws, 'zoom-orbit', (w) => w.v.orbitBy(0.05, 0.02));
    step(ws, 'zoom-hide', (w) => w.v.setItemVisible('a4', false));
    step(ws, 'zoom-out', (w) => (w.v.setItemVisible('a4', true), w.v.zoomBy(1 / 0.3)));
    expect(on.v.stats.culled).toBe(0);

    // 뼈대 고치기를 끈 뷰어(숨김·강조를 바꾼 그리기마다 뼈대를 새로 모은다): 새 묶음 객체도 같은 저장소 열쇠 자리의 지난 표를 쓰고, 목록이 바뀐 묶음만 다시 센다
    const fx = [view(sc, 'rot'), view(sc, 'full'), view(sc, 'noplan')];
    for (const w of fx) w.r.instFixOff = true;
    step(fx, 'fix-off-still', () => undefined);
    const nb = rts(fx[0]!).length;
    expect(nb).toBeGreaterThan(8);
    for (const [name, fn] of [
      ['hide', (w: W) => w.v.setItemVisible('a4', false)],
      ['hide-more', (w: W) => w.v.setItemVisible('b9', false)],
      ['hi', (w: W) => w.v.highlight(['d3'])],
      ['show', (w: W) => (w.v.setItemVisible('a4', true), w.v.setItemVisible('b9', true), w.v.highlight(null))],
    ] as const) {
      const seq = fx[0]!.r.rotSeq as number;
      step(fx, name, fn);
      // 표를 센 묶음마다 rotSeq가 둘 는다 — 바뀐 묶음(면·윤곽선 한두 개)만
      const counted = ((fx[0]!.r.rotSeq as number) - seq) / 2;
      expect(counted, name).toBeGreaterThan(0);
      expect(counted, name).toBeLessThan(nb / 2);
    }
  });
});
