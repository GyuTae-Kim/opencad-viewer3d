/**
 * 0.74.0 단면 끌기 프레임의 남은 몫(0.72.0·0.73.0 남은 한계 — 단면 끌기의 뷰어 테두리 updateCut·인스턴싱 자리마다 로컬 평면):
 *  - 뷰어 단면 테두리는 걸침 몫(cutSpan — 묶음 표 차례 그물마다 평면 법선에 대한 범위 끝 곱, boxStraddles와 같은 곱)으로 걸친 그물만 고른다. 평면을 옮기기만 한 프레임은
 *    묶음마다 범위·보이는지를 다시 묻지 않는다(0.73.0은 프레임마다 묶음 모두). 묶음 표·범위 캐시·판·법선이 바뀌면 새로 — 0.73.0과 같은 그물·같은 차례·같은 선분
 *  - 인스턴싱 회전 표 꼴(IROT) 자리 자료는 판에 단면 평면을 넣지 않고 따로 견준다 — 평면만 바뀐 그리기는 표·3열(그림자 칸)을 다시 쓰지 않고 자리마다 평면 텍셀만
 *    planeToLocal과 같은 셈으로 다시 쓴다(0.73.0은 표와 자리를 모두 다시 썼다). 그린 도형은 0.68.0 꼴(자리마다 온 행렬) 뷰어와 프레임마다 같다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { boxCenter, boxIsEmpty } from '../src/bounds';
import { type Plane4, boxStraddles, planeToLocal } from '../src/section';
import { boxMesh } from '../src/synth';
import type { Box3, LineSet3d, Mesh3d, Rgba, Scene3d } from '../src/types';
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

const PAL: Rgba[] = [
  [0.7, 0.4, 0.3, 1],
  [0.3, 0.6, 0.8, 1],
  [0.5, 0.5, 0.5, 1],
];

/**
 * STEP 꼴: 꼴 a(윤곽선)·b(윤곽선·정점 색)는 24자리씩 회전 셋(0°·45°·누운 45°), c(윤곽선 없음)는 회전이 모두 다르다, d는 행렬 없이 원점만 12자리, e는 행렬도 원점도 없는 8자리.
 * 큰 좌표, 색 둘, 이름 셋. withLine이면 선분 묶음 하나(묶음 표에 그물이 아닌 것)
 */
function scene(withLine = false): Scene3d {
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
      meshes.push({ ...S[k], id, name: id, group: `g${i % 3}`, color: PAL[i % 2]!, matrix: m, origin: [120000, -80000, 2500], closed: true });
    }
  for (let i = 0; i < 12; i++) meshes.push({ ...S.d, id: `d${i}`, name: `d${i}`, color: PAL[i % 2]!, origin: [i * 9 - 40, 60, 0], closed: true });
  for (let i = 0; i < 8; i++) meshes.push({ ...S.e, id: `e${i}`, name: `e${i}`, color: PAL[0]! });
  const lines: LineSet3d[] = withLine ? [{ id: 'l0', name: 'l0', positions: new Float32Array([-10, 0, 0, 60, 30, 5, 5, 5, 5, 40, 70, 2]), color: PAL[2]! }] : [];
  return { name: 's', units: 'mm', meshes, lines };
}

type VP = {
  boundsOf(m: Mesh3d): Box3;
  visible(id: string, g: string | undefined): boolean;
  modelOf(m: Mesh3d): ArrayLike<number> | undefined;
  meshCut(m: Mesh3d, p: Plane4): Float32Array;
  sectionPlane(): Plane4 | null;
  items: Map<string, { kind: string; item: Mesh3d }>;
  allBox: Box3;
  cutSpan: object | null;
  renderer: Record<string, unknown>;
};

/** 0.73.0 updateCut과 같은 셈(묶음 표 차례 — 보이고 범위가 평면을 걸친 그물마다 로컬 평면 교선을 세계 − 장면 가운데로, float32) */
function cut073(v: VP): number[] {
  const plane = v.sectionPlane()!;
  const origin = boxIsEmpty(v.allBox) ? [0, 0, 0] : boxCenter(v.allBox);
  const out: number[] = [];
  for (const it of v.items.values()) {
    if (it.kind !== 'mesh') continue;
    const m = it.item;
    if (!v.visible(m.id, m.group) || !boxStraddles(v.boundsOf(m), plane)) continue;
    const M = v.modelOf(m);
    const segs = v.meshCut(m, planeToLocal(plane, M));
    for (let i = 0; i < segs.length; i += 3) {
      const x = segs[i]!, y = segs[i + 1]!, z = segs[i + 2]!;
      if (M) {
        out.push(Math.fround(M[0]! * x + M[4]! * y + M[8]! * z + M[12]! - origin[0]!));
        out.push(Math.fround(M[1]! * x + M[5]! * y + M[9]! * z + M[13]! - origin[1]!));
        out.push(Math.fround(M[2]! * x + M[6]! * y + M[10]! * z + M[14]! - origin[2]!));
      } else out.push(Math.fround(x - origin[0]!), Math.fround(y - origin[1]!), Math.fround(z - origin[2]!));
    }
  }
  return out;
}

describe('0.74.0 단면 테두리 걸침 몫', () => {
  it('평면을 옮기기만 한 프레임은 묶음마다 범위를 묻지 않고(boundsOf 0번) 걸친 그물만 — 테두리 선분은 0.73.0 셈과 비트까지 같고, 법선·범위·묶음 표가 바뀌면 몫을 새로', () => {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
    views.push(v);
    const V = v as unknown as VP;
    // 렌더러에 넘긴 테두리 선분(마지막 값)과 그리기 안 boundsOf 부른 수
    let last: number[] = [];
    let sent = 0;
    const R = V.renderer as { setSectionLines(p: Float32Array | null, o?: readonly number[] | null): void };
    const sl = R.setSectionLines.bind(R);
    R.setSectionLines = (p, o) => {
      last = p ? Array.from(p) : [];
      sent++;
      sl(p, o);
    };
    let counting = false;
    let bounds = 0;
    const bo = V.boundsOf.bind(V);
    V.boundsOf = (m: Mesh3d) => {
      if (counting) bounds++;
      return bo(m);
    };
    v.setScene(scene(true));
    v.fit(false);
    v.orbitBy(0.4, 0.2);
    for (let i = 0; i < 20 && v.stats.instanced.pending > 0; i++) v.renderNow();
    v.renderNow();
    let nonEmpty = 0;
    /** 한 일을 하고 한 프레임 — 테두리를 다시 모았으면(sent) 0.73.0 셈과 같은지, 이 프레임의 boundsOf 수 */
    const frame = (label: string, fn: () => void, cmp = true): number => {
      fn();
      sent = 0;
      bounds = 0;
      counting = true;
      v.renderNow();
      counting = false;
      if (V.sectionPlane() && sent && cmp) {
        const want = cut073(V);
        expect(last.length, label).toBe(want.length);
        for (let i = 0; i < want.length; i++) if (!Object.is(last[i], want[i])) expect(last[i], `${label} #${i}`).toBe(want[i]);
        if (want.length) nonEmpty++;
      }
      return bounds;
    };
    /** 그물 id의 세계 범위 축 k에서 f 자리(평면이 그 그물을 걸치게 — 장면 범위는 회전한 큰 원점 자리 때문에 넓고 듬성하다) */
    const at = (id: string, k: number, f = 0.5): number => {
      const b = V.boundsOf(V.items.get(id)!.item);
      return b.min[k]! + (b.max[k]! - b.min[k]!) * f;
    };
    const world = { world: true };
    expect(frame('켜기 x', () => v.setSectionAxis('x', at('d3', 0, 0.4), world))).toBeGreaterThan(0);
    const span0 = V.cutSpan;
    expect(span0).not.toBeNull();
    // 평면만 옮긴 프레임: 몫을 다시 쓰고 묶음마다 범위를 묻지 않는다(걸친 그물이 없는 자리 포함)
    for (const [id, f] of [['d3', 0.6], ['a0', 0.5], ['b7', 0.3], ['e2', 0.5], ['e2', 0.50001], ['c11', 0.5], ['d7', 0.55], ['d7', 1.7]] as const) {
      const x = at(id, 0, f);
      expect(frame(`끌기 ${id} ${f}`, () => v.setSectionPosition(x, world)), `끌기 ${id} ${f}`).toBe(0);
      expect(V.cutSpan, `끌기 ${id} ${f}`).toBe(span0);
    }
    // 숨김·보이기는 몫을 그대로 쓴다(보이는지는 걸친 그물만 그리기 때 묻는다 — 숨긴 프레임의 boundsOf는 보이는 범위 셈)
    frame('숨김', () => (v.setSectionPosition(at('e2', 0, 0.45), world), v.setItemVisible('e1', false), v.setItemVisible('e5', false)));
    expect(frame('숨긴 채 끌기', () => v.setSectionPosition(at('e2', 0, 0.55), world))).toBe(0);
    frame('이름 숨김', () => v.setGroupVisible('g2', false));
    expect(frame('이름 숨긴 채 끌기', () => v.setSectionPosition(at('a0', 0, 0.4), world))).toBe(0);
    expect(V.cutSpan).toBe(span0);
    frame('보이기', () => (v.setGroupVisible('g2', true), v.setItemVisible('e1', true)));
    expect(V.cutSpan).toBe(span0);
    // 겉모습 행렬로 그물을 옮기면(범위 판) 몫을 새로
    frame('겉모습 행렬', () => (v.setSectionPosition(at('e2', 0, 0.5), world), v.setItemLooks([['e4', { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 2.5, 0, 0, 1] }]])));
    const span1 = V.cutSpan;
    expect(span1).not.toBe(span0);
    expect(frame('옮긴 뒤 끌기', () => v.setSectionPosition(at('e2', 0, 0.9), world))).toBe(0);
    expect(V.cutSpan).toBe(span1);
    // 그물 바꾸기·빼기(묶음 표·범위 판)
    frame('바꾸기', () => v.setMesh({ ...v.scene!.meshes.find((m) => m.id === 'd3')!, origin: [3, 60, 0] }));
    expect(V.cutSpan).not.toBe(span1);
    frame('빼기', () => v.removeMesh('e3'));
    expect(frame('뺀 뒤 끌기', () => v.setSectionPosition(at('d3', 0, 0.3), world))).toBe(0);
    // 법선이 바뀌면(뒤집기·축 바꾸기) 새로
    const span2 = V.cutSpan;
    frame('뒤집기', () => v.flipSection());
    expect(V.cutSpan).not.toBe(span2);
    expect(frame('뒤집은 채 끌기', () => v.setSectionPosition(at('e2', 0, 0.2), world))).toBe(0);
    frame('축 y', () => v.setSectionAxis('y', at('a0', 1, 0.5), world));
    const span3 = V.cutSpan;
    for (const [id, f] of [['b5', 0.4], ['e2', 0.5], ['c9', 0.7]] as const) expect(frame(`y 끌기 ${id} ${f}`, () => v.setSectionPosition(at(id, 1, f), world))).toBe(0);
    expect(V.cutSpan).toBe(span3);
    // 테두리를 끄거나 여러 단면이거나 단면을 끄면 몫을 놓는다
    frame('테두리 끔', () => v.setSectionOptions({ outline: false }), false);
    expect(V.cutSpan).toBeNull();
    expect(last).toEqual([]);
    frame('테두리 켬', () => v.setSectionOptions({ outline: true }));
    expect(V.cutSpan).not.toBeNull();
    // 여러 단면의 테두리는 평면마다 다른 평면들로 다시 자른다(0.73.0 셈 cut073은 하나일 때만 — 견주지 않는다)
    frame('여러 단면', () => v.setSections([{ normal: [1, 0, 0], offset: at('e2', 0) }, { normal: [0, 1, 0], offset: at('e2', 1) }]), false);
    expect(V.cutSpan).toBeNull();
    frame('하나로', () => v.setSectionAxis('x', at('e2', 0, 0.6), world));
    expect(V.cutSpan).not.toBeNull();
    frame('끔', () => v.setSection(null));
    expect(V.cutSpan).toBeNull();
    expect(last).toEqual([]);
    // 걸친 그물이 있는 프레임이 여럿이다(빈 테두리만 견주지 않았다)
    expect(nonEmpty).toBeGreaterThan(14);
  });
});

type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown> };
/** 뷰어(full = 회전 표 꼴을 끈다 — 0.68.0 꼴: 자리마다 온 행렬과 clipOf로 받은 로컬 평면) */
function view(full: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  if (full) r.instRotOff = true;
  v.setScene(scene());
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  for (let i = 0; i < 20 && v.stats.instanced.pending > 0; i++) v.renderNow();
  v.renderNow();
  return { v, gl, r };
}

/** 뷰어 w의 그물 id 세계 범위 축 k에서 f 자리 */
function at(w: W, id: string, k: number, f: number): number {
  const V = w.v as unknown as VP;
  const b = V.boundsOf(V.items.get(id)!.item);
  return b.min[k]! + (b.max[k]! - b.min[k]!) * f;
}

type Slot = { base: number; st: number; kind: string; n: number; mdl: (ArrayLike<number> | undefined)[]; tk: readonly number[] | null };
/** 회전 표 꼴 면 자리 가운데 단면 평면을 쓴 것(종류 r3 — 그림자 없음, r4 — 그림자) */
const clipSlots = (r: Record<string, unknown>): Slot[] => [...(r.instSlots as Map<string, Slot>).values()].filter((q) => (q.kind === 'r3' || q.kind === 'r4') && q.n > 0 && q.tk);
const SENT = 12345.5;

describe('0.74.0 인스턴싱 자리마다 로컬 평면', () => {
  it('그린 도형은 0.68.0 꼴 뷰어와 프레임마다 같다(끌기·그림자·겉모습 판·숨김·돌리며 끌기)', () => {
    const ws = [view(false), view(true)];
    let cuts = 0;
    const step = (label: string, fn: (v: Viewer3d) => void): void => {
      for (const w of ws) fn(w.v);
      const [a, b] = ws.map((w) => expandFrame(w.gl, () => w.v.renderNow()));
      expect(b!.length, label).toBe(a!.length);
      for (let i = 0; i < a!.length; i++) if (a![i] !== b![i]) expect(b![i], `${label} #${i}`).toBe(a![i]);
      // 평면이 그물을 걸친 프레임 수(테두리가 있다)
      const V = ws[0]!.v as unknown as VP;
      if (V.sectionPlane() && cut073(V).length) cuts++;
    };
    const x = (id: string, f = 0.5): number => at(ws[0]!, id, 0, f);
    const xs = (id: string, f = 0.5) => (v: Viewer3d) => v.setSection({ normal: [1, 0, 0], offset: x(id, f) });
    step('켜기', xs('a0'));
    // 회전 표 꼴이 단면 평면을 쓴다
    expect(clipSlots(ws[0]!.r).length).toBeGreaterThan(0);
    for (const [id, f] of [['a0', 0.3], ['b6', 0.5], ['c2', 0.4], ['d4', 0.5], ['a1', 0.6]] as const) step(`끌기 ${id} ${f}`, xs(id, f));
    step('그림자', (v) => v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }));
    expect(clipSlots(ws[0]!.r).some((q) => q.kind === 'r4')).toBe(true);
    for (const [id, f] of [['a1', 0.5], ['b0', 0.6], ['c3', 0.5]] as const) step(`그림자 끌기 ${id} ${f}`, xs(id, f));
    step('겉모습', (v) => (v.setLighting(null), v.setItemLooks([['a5', { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1] }], ['b2', { color: [0.9, 0.1, 0.1, 1] }]])));
    for (const [id, f] of [['a5', 0.5], ['b2', 0.4], ['e0', 0.5]] as const) step(`겉모습 끌기 ${id} ${f}`, xs(id, f));
    step('숨김', (v) => (v.clearItemLooks(), v.setItemVisible('a4', false)));
    step('숨긴 채 끌기', xs('a4', 0.5));
    step('돌리며 끌기', (v) => (v.orbitBy(0.05, 0.02), xs('c7', 0.5)(v)));
    const oc = (id: string, f: number): number => 0.6 * at(ws[0]!, id, 0, f) + 0.8 * at(ws[0]!, id, 1, f);
    step('비스듬한 평면', (v) => v.setSection({ normal: [0.6, 0.8, 0], offset: oc('b3', 0.5) }));
    step('비스듬히 끌기', (v) => v.setSection({ normal: [0.6, 0.8, 0], offset: oc('b3', 0.35) }));
    expect(cuts).toBeGreaterThan(15);
    step('끔', (v) => v.setSection(null));
  });

  it('평면만 바뀐 그리기는 표·3열을 다시 쓰지 않고 자리마다 평면 텍셀만 planeToLocal과 같은 값으로 쓴다(시점이 바뀌면 모두 다시)', () => {
    for (const shadow of [false, true]) {
      const w = view(false);
      const ref = view(true);
      const both = (fn: (v: Viewer3d) => void): void => {
        fn(w.v);
        fn(ref.v);
        w.v.renderNow();
        ref.v.renderNow();
      };
      if (shadow) both((v) => v.setLighting({ sun: { direction: [0.3, -0.5, 0.8] }, shadows: true }));
      const offs = [at(w, 'a0', 0, 0.5), at(w, 'a1', 0, 0.45), at(w, 'b6', 0, 0.4)];
      both((v) => v.setSection({ normal: [1, 0, 0], offset: offs[0]! }));
      const d = w.r.instBuf as Float32Array;
      const slots = clipSlots(w.r);
      expect(slots.length, `${shadow}`).toBeGreaterThan(0);
      const T = shadow ? 12 : 9, st = shadow ? 4 : 3;
      for (const q of slots) expect(q.st, `${shadow} 자리 텍셀`).toBe(st);
      // 표·3열(·그림자) 텍셀에 표지 값을 써 둔다
      for (const q of slots) {
        const ib = q.base + q.tk!.length * T;
        d.fill(SENT, q.base * 4, ib * 4);
        for (let i = 0; i < q.n; i++) d.fill(SENT, (ib + i * st) * 4, (ib + i * st + st - 1) * 4);
      }
      // 평면만 옮긴다: 표지 값은 그대로, 평면 텍셀은 새 평면의 로컬 평면
      for (const off of offs.slice(1)) {
        w.v.setSection({ normal: [1, 0, 0], offset: off });
        w.v.renderNow();
        const plane = (w.v as unknown as VP).sectionPlane()!;
        let n = 0;
        for (const q of clipSlots(w.r)) {
          const ib = q.base + q.tk!.length * T;
          for (let t = q.base * 4; t < ib * 4; t++) if (d[t] !== SENT) expect(d[t], `${shadow} ${off} 표 ${t}`).toBe(SENT);
          for (let i = 0; i < q.n; i++) {
            const o = (ib + i * st) * 4;
            for (let j = 0; j < (st - 1) * 4; j++) if (d[o + j] !== SENT) expect(d[o + j], `${shadow} ${off} 3열 ${i}.${j}`).toBe(SENT);
            const c = planeToLocal(plane, q.mdl[i]);
            const e = o + (st - 1) * 4;
            for (let j = 0; j < 4; j++) if (!Object.is(d[e + j], Math.fround(c[j]!))) expect(d[e + j], `${shadow} ${off} 평면 ${i}.${j}`).toBe(Math.fround(c[j]!));
            n++;
          }
        }
        expect(n, `${shadow} ${off} 자리 수`).toBeGreaterThan(40);
      }
      // 시점이 바뀌면 표·3열을 모두 다시 쓴다(표지 값이 남지 않는다) — 그린 도형이 0.68.0 꼴 뷰어와 같다
      both((v) => (v.setSection({ normal: [1, 0, 0], offset: offs[2]! }), v.orbitBy(0.03, 0.01)));
      for (const q of clipSlots(w.r)) {
        const ib = q.base + q.tk!.length * T;
        for (let t = q.base * 4; t < (ib + q.n * st) * 4; t++) if (d[t] === SENT) expect(d[t], `${shadow} 돌린 뒤 ${t}`).not.toBe(SENT);
      }
      const a = expandFrame(w.gl, () => w.v.renderNow()), b = expandFrame(ref.gl, () => ref.v.renderNow());
      expect(a.length, `${shadow} 돌린 뒤`).toBe(b.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(a[i], `${shadow} 돌린 뒤 #${i}`).toBe(b[i]);
    }
  });
});
