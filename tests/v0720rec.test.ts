/**
 * 0.72.0 그물 기록의 칸·단면 끌기의 잘린 면 채우기 단위(0.71.0 남은 한계):
 *  - 렌더러 그물 기록(MeshRec)은 그리기·묶어 그리기·인스턴싱 뼈대·잘라내기·겉모습이 나중에 적던 칸(visAt·visNo·culledAt·cull·bk·si·ipf·ipz·ipe·ipd·ipm·ipc·lookM·
 *    parts·mg·mi·first·vbase·dropped)을 글자 객체에 처음부터 가진다 — 0.71.0은 흐름마다 다른 차례로 늦게 더해 기록의 숨은 꼴이 2개(올린 뒤 — 묶음·인스턴싱)에서
 *    7개(숨김·확대 잘라내기·숨은 선·외곽선·분해·빼기와 더하기 뒤)까지 갈렸다. 윤곽선 기록은 first(묶음 선분 시작)를 처음부터
 *  - 단면 하나에서 평면이나 숨김만 바뀌는 그리기(단면 끌기)는 평면에 기대지 않는 몫(채우기 후보·범위·capGroup — 장면 그물 기록·겉모습 판·숨은 선 모드·채우기가 같으면 같다)을
 *    다시 쓰고 평면 걸침만 센다(capPrep). 단위는 다시 쓰지 않고 센 단위(capUnits 그대로)와 프레임마다 같고, 그린 도형(tests/drawexpand.ts)은 캐시를 끈 뷰어와 같다
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

type Unit = { meshes: unknown[]; box: { min: number[]; max: number[] }; plane: number[]; others: unknown[]; color: number[]; group: boolean; cuts?: unknown[] };
type CapUnits = (meshes: unknown[], sec: unknown, multi: unknown, lk: unknown, pre?: unknown) => Unit[];
type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown>; caps: number; preps: number; slices: number; units: number };
type Sec = { setSectionAxis(a: string, t: number, o?: { caps?: 'closed' | 'all' | 'none'; world?: boolean }): void };

const PAL: Rgba[] = [
  [0.7, 0.4, 0.3, 1],
  [0.3, 0.6, 0.8, 1],
  [0.5, 0.5, 0.5, 1],
];

/** 두 채우기 단위 목록이 같은지(그물 기록은 같은 객체, 범위·평면·색은 값) */
function sameUnits(a: readonly Unit[], b: readonly Unit[], label: string): void {
  expect(a.length, `${label} 단위 수`).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!, y = b[i]!;
    expect(x.meshes.length, `${label} #${i} 그물 수`).toBe(y.meshes.length);
    x.meshes.forEach((r, j) => expect(r === y.meshes[j], `${label} #${i} 그물 ${j}`).toBe(true));
    expect([...x.box.min, ...x.box.max], `${label} #${i} 범위`).toEqual([...y.box.min, ...y.box.max]);
    expect([...x.plane], `${label} #${i} 평면`).toEqual([...y.plane]);
    expect([...x.color], `${label} #${i} 색`).toEqual([...y.color]);
    expect(x.group, `${label} #${i} 묶음`).toBe(y.group);
    expect(x.others.length, `${label} #${i} 다른 평면`).toBe(y.others.length);
    expect(x.cuts, `${label} #${i} 갈래`).toBe(y.cuts);
  }
}

/**
 * 뷰어(cap = false면 채우기 단위 캐시를 끈다). 렌더러 capUnits를 부른 수와, 평면 걸침만 센 단위(다섯째 인자 — 0.72.0)는 그 자리에서 다섯째 인자 없이 센 단위와
 * 같은지 견준다. capPrepare(평면에 기대지 않는 몫을 만든 수)를 센다
 */
function view(sc: Scene3d, cap: boolean, merging = false): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, r, caps: 0, preps: 0, slices: 0, units: 0 };
  if (!cap) r.capMemoOff = true;
  const cu = (r.capUnits as CapUnits).bind(r);
  r.capUnits = (meshes: unknown[], sec: unknown, multi: unknown, lk: unknown, pre?: unknown) => {
    w.caps++;
    const out = cu(meshes, sec, multi, lk, pre);
    if (pre !== undefined) {
      w.slices++;
      sameUnits(out, cu(meshes, sec, multi, lk), `slice ${w.slices}`);
    }
    w.units = out.length;
    return out;
  };
  // (0.71.0 src에는 없다 — 그때는 만든 수가 0으로 남아 아래 기대가 실패한다)
  if (typeof r.capPrepare === 'function') {
    const cp = (r.capPrepare as (...a: unknown[]) => unknown).bind(r);
    r.capPrepare = (...a: unknown[]) => {
      w.preps++;
      return cp(...a);
    };
  }
  if (merging) v.setRenderOptions({ merging: 'on' });
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  for (let i = 0; i < 50 && (v.stats.instanced.pending > 0 || v.stats.merged.pending > 0); i++) v.renderNow();
  v.renderNow();
  return w;
}

/** 두 뷰어에 같은 일을 하고 한 프레임씩 그려 펼친 도형이 같은지 — 첫 뷰어의 이 그리기 [capUnits 부른 수, capPrepare 부른 수, 평면 걸침만 센 수] */
function step(on: W, off: W, label: string, fn: (w: W) => void): [number, number, number] {
  for (const w of [on, off]) fn(w);
  const c0 = on.caps, p0 = on.preps, s0 = on.slices;
  const b = expandFrame(on.gl, () => on.v.renderNow()), a = expandFrame(off.gl, () => off.v.renderNow());
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
  return [on.caps - c0, on.preps - p0, on.slices - s0];
}

/**
 * STEP 꼴 반복 부품(꼴 셋 — 배열을 함께 씀, 큰 원점, 둘째마다 회전, 넷째마다 누움, 닫힌 그물)과 제 배열 상자: capGroup 'cg' 둘(u0·u1 — 높이 0~6),
 * 반투명 닫힌 상자 t0, 열린 상자 o0. own이면 제 배열 상자 240개를 장면 차례에 끼운다(묶어 그리기 덩이)
 */
function scene(n = 18, own = 0): Scene3d {
  const shape = (k: string, h: number, vc: boolean): Mesh3d => {
    const m = boxMesh(k, [-3, -3, -2], [3, 3, h], PAL[0]!);
    m.origin = [120000, -80000, 2500];
    if (vc) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7) % 10) / 10));
    return m;
  };
  const S = [shape('a', 2, false), shape('b', 3, true), shape('c', 4, false)];
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < n; i++)
    S.forEach((s, k) => {
      const id = `${'abc'[k]}${i}`;
      const m = placeAt((i % 6) * 10 - 120000, Math.floor(i / 6) * 10 + 80000 + k * 60, -2500, i % 2 ? 30 * k + 45 : 0, i % 4 === 1);
      meshes.push({ ...s, id, name: id, group: `g${i % 3}`, color: PAL[(i + k) % 3]!, matrix: m, closed: true });
    });
  meshes.push({ ...boxMesh('u0', [0, -30, 0], [8, -22, 6], PAL[0]!, 'g0'), closed: true, capGroup: 'cg' });
  meshes.push({ ...boxMesh('u1', [12, -30, 0], [20, -22, 6], PAL[1]!, 'g0'), closed: true, capGroup: 'cg' });
  meshes.push({ ...boxMesh('t0', [24, -30, 0], [32, -22, 6], [0.2, 0.7, 0.3, 0.5], 'g1'), closed: true });
  meshes.push({ ...boxMesh('o0', [36, -30, 0], [44, -22, 6], PAL[2]!, 'g1'), closed: false });
  for (let i = 0; i < own; i++) {
    const m = boxMesh(`m${i}`, [0, 0, 0], [5, 5, 3 + (i % 4)], PAL[i % 3]!, `g${i % 3}`);
    m.origin = [(i % 20) * 8 - 50, Math.floor(i / 20) * 8 + 60, -1];
    meshes.splice(i % 2 ? meshes.length : 24, 0, { ...m, closed: true });
  }
  return { name: 's', units: 'mm', meshes, lines: [] };
}

describe('0.72.0 그물 기록 칸·단면 끌기 채우기 단위', () => {
  it('그물·윤곽선 기록은 흔한 흐름 뒤에도 칸 차례가 모두 같다(늦게 더하는 칸이 없다)', async () => {
    expect(await Viewer3d.preloadMerging()).toBe(true);
    const w = view(scene(18, 240), true, true);
    const v = w.v;
    expect(v.stats.merged.meshes).toBeGreaterThan(200);
    const recs = (): Record<string, unknown>[] => (w.r as unknown as { meshes: Record<string, unknown>[] }).meshes;
    const keysOf = (o: object): string => Object.keys(o).join(',');
    const check = (label: string): void => {
      const R = recs();
      const k0 = keysOf(R[0]!);
      for (const r of R) expect(keysOf(r), `${label} ${(r.src as { id: string }).id}`).toBe(k0);
      const E = R.map((r) => r.edges as object | null).filter((e): e is object => !!e);
      const e0 = keysOf(E[0]!);
      for (const e of E) expect(keysOf(e), `${label} 윤곽선`).toBe(e0);
    };
    check('올린 뒤');
    // 묶어 그리기 덩이·인스턴싱 묶음이 함께 있다
    expect(recs().some((r) => !!r.mg)).toBe(true);
    expect(recs().some((r) => !r.mg && (r.ipf as number) > 0)).toBe(true);
    const flows: [string, () => void][] = [
      ['숨김', () => (v.setItemVisible('a3', false), v.setItemVisible('m7', false))],
      ['보이기', () => v.setItemVisible('a3', true)],
      ['강조', () => v.highlight(['a2', 'm9', 'b4'])],
      ['확대', () => v.zoomBy(0.05)],
      ['단면', () => v.setSection({ normal: [0, 1, 0], offset: 80030 })],
      ['숨은 선', () => (v.setSection(null), v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 }))],
      ['외곽선', () => (v.setRenderMode('shadedEdges'), v.setRenderOptions({ hiddenEdges: 0, profiles: { width: 1 } } as never))],
      ['분해', () => v.setItemLooks([['b5', { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 30, 1] }], ['m11', { color: [0.9, 0.1, 0.1, 1] }]])],
      ['빼기·더하기·바꾸기', () => {
        v.removeMesh('m5');
        v.setMesh({ ...v.scene!.meshes.find((m) => m.id === 'm6')!, id: 'n0', name: 'n0', origin: [400, 400, 0] });
        v.setMesh({ ...v.scene!.meshes.find((m) => m.id === 'c4')!, color: [0.2, 0.9, 0.2, 1] });
      }],
    ];
    for (const [label, fn] of flows) {
      fn();
      for (let i = 0; i < 3; i++) v.renderNow();
      check(label);
    }
    // 흐름이 그 칸들을 실제로 적었다(확대 잘라내기·숨김·숨은 점선·외곽선 깊이·분해 겉모습 모형)
    expect(recs().some((r) => (r.culledAt as number) > 0), 'culledAt').toBe(true);
    expect(recs().some((r) => (r.visNo as number) > 0), 'visNo').toBe(true);
    expect(recs().some((r) => (r.ipd as number) > 0 || (r.ipz as number) > 0), 'ipd·ipz').toBe(true);
    expect(recs().some((r) => r.lookM !== undefined), 'lookM').toBe(true);
  });

  it('단면 끌기·숨김은 평면에 기대지 않는 몫을 다시 쓰고 평면 걸침만 센다 — 단위는 다시 센 것과, 그린 도형은 캐시를 끈 뷰어와 같다', () => {
    const on = view(scene(), true), off = view(scene(), false);
    const sec = (w: W, axis: string, t: number): void => (w.v as unknown as Sec).setSectionAxis(axis, t, { world: true });
    // 끌기: 앱 단면 막대처럼 방향은 두고 위치만(setSectionPosition — 채우기 선택은 그대로)
    const z = (t: number) => (w: W) => w.v.setSectionPosition(t, { world: true });
    // [capUnits, capPrepare, 평면 걸침만]
    expect(step(on, off, 'sec', (w) => sec(w, 'z', 0.5)), 'sec').toEqual([1, 0, 0]);
    expect(off.units).toBeGreaterThan(0);
    expect(step(on, off, 'still', () => undefined), 'still').toEqual([0, 0, 0]);
    // 끌기 첫 프레임: 지난 단위와 판·모드·채우기가 같아 몫을 만든다 → 다음 프레임부터 다시 쓴다
    expect(step(on, off, 'drag1', z(0.3)), 'drag1').toEqual([1, 1, 1]);
    for (const [k, t] of [0.1, -1, 2.5, 5, 7, 3.5].entries()) expect(step(on, off, `drag${k + 2}`, z(t)), `drag${k + 2}`).toEqual([1, 0, 1]);
    // capGroup 묶음 단위(u0·u1 — 높이 0~6): z = 5에서 단위가 있고 z = 7에서는 없다
    expect(step(on, off, 'drag-still', () => undefined), 'drag-still').toEqual([0, 0, 0]);
    // 숨김·보이기도 몫을 다시 쓴다(숨긴 그물까지 든 몫 — 보이는지는 그리기마다)
    expect(step(on, off, 'hide', (w) => (w.v.setItemVisible('a3', false), w.v.setItemVisible('u0', false))), 'hide').toEqual([1, 0, 1]);
    expect(step(on, off, 'hide-drag', z(1)), 'hide-drag').toEqual([1, 0, 1]);
    expect(step(on, off, 'show', (w) => (w.v.setItemVisible('a3', true), w.v.setItemVisible('u0', true))), 'show').toEqual([1, 0, 1]);
    // 강조·단색은 단위가 같다(0.71.0 — 다시 세지 않는다)
    expect(step(on, off, 'hi', (w) => w.v.highlight(['a2', 'u1'])), 'hi').toEqual([0, 0, 0]);
    expect(step(on, off, 'hi-drag', z(1.5)), 'hi-drag').toEqual([1, 0, 1]);
    expect(step(on, off, 'mono', (w) => (w.v.highlight(null), w.v.setRenderMode('monochrome'))), 'mono').toEqual([0, 0, 0]);
    expect(step(on, off, 'mono-drag', z(1.2)), 'mono-drag').toEqual([1, 0, 1]);
    // 평면 법선을 바꿔도(축 x — 세계 x = 2는 u0과 돌리지 않은 첫 줄 부품, 12.5는 u1을 가로지른다 — capGroup 묶음 cg) 같은 몫(법선 곱만 다시)
    expect(step(on, off, 'axis-x', (w) => sec(w, 'x', 2)), 'axis-x').toEqual([1, 0, 1]);
    expect(on.units, 'axis-x 단위').toBeGreaterThan(0);
    expect(step(on, off, 'axis-x-drag', (w) => w.v.setSectionPosition(12.5, { world: true })), 'axis-x-drag').toEqual([1, 0, 1]);
    expect(on.units, 'axis-x-drag 단위').toBeGreaterThan(0);
    expect(step(on, off, 'axis-z', (w) => sec(w, 'z', 0.5)), 'axis-z').toEqual([1, 0, 1]);
    // 숨은 선 모드(반투명 판단이 다르다)·겉모습 판·채우기가 바뀌면 다시 센 뒤 다음 끌기에서 몫을 새로 만든다
    const again = (label: string, fn: (w: W) => void, t: number, first: [number, number, number] = [1, 0, 0]): void => {
      expect(step(on, off, label, fn), label).toEqual(first);
      if (first[1] === 0) expect(step(on, off, `${label}-drag`, z(t)), `${label}-drag`).toEqual([1, 1, 1]);
      expect(step(on, off, `${label}-drag2`, z(t + 0.25)), `${label}-drag2`).toEqual([1, 0, 1]);
    };
    again('hidden', (w) => w.v.setRenderMode('hiddenLine'), 0.4);
    again('shaded', (w) => w.v.setRenderMode('shadedEdges'), 0.6);
    again('look-color', (w) => w.v.setItemColor('a2', [0.9, 0.1, 0.1, 1]), 0.2);
    again('look-alpha', (w) => w.v.setItemLooks([['b3', { opacity: 0.4 }], ['t0', { opacity: null }]]), 1.1);
    again('look-matrix', (w) => w.v.setItemLooks([['c5', { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1.5, 1] }]]), 2.2);
    again('caps-all', (w) => w.v.setSectionOptions({ caps: 'all' }), 0.9);
    // 그물을 바꾸거나 빼면(장면 그물 기록이 바뀐다) 판·모드·채우기는 같아 그 그리기에서 몫을 새로 만든다
    again('setMesh', (w) => w.v.setMesh({ ...w.v.scene!.meshes.find((x) => x.id === 'c4')!, color: [0.2, 0.9, 0.2, 1] }), 1.3, [1, 1, 1]);
    again('removeMesh', (w) => w.v.removeMesh('b7'), 0.7, [1, 1, 1]);
    // 단면을 끄면 몫을 놓는다(지난 장면 그물 기록을 쥐지 않는다)
    expect(step(on, off, 'sec-off', (w) => w.v.setSection(null)), 'sec-off').toEqual([0, 0, 0]);
    expect(on.r.capPrep).toBeNull();
    expect(step(on, off, 'sec-again', (w) => sec(w, 'z', 0.5)), 'sec-again').toEqual([1, 0, 0]);
    expect(step(on, off, 'sec-again-drag', z(0.35)), 'sec-again-drag').toEqual([1, 1, 1]);
  });

  it('묶어 그리기 덩이가 있는 장면(덩이 범위로 거른 목록)에서도 단면 끌기 단위가 같다', async () => {
    expect(await Viewer3d.preloadMerging()).toBe(true);
    const on = view(scene(18, 240), true, true), off = view(scene(18, 240), false, true);
    expect(on.v.stats.merged.meshes).toBeGreaterThan(200);
    const y = (t: number) => (w: W) => w.v.setSectionPosition(t, { world: true });
    expect(step(on, off, 'sec', (w) => (w.v as unknown as Sec).setSectionAxis('y', 80, { world: true })), 'sec').toEqual([1, 0, 0]);
    expect(step(on, off, 'drag1', y(85)), 'drag1').toEqual([1, 1, 1]);
    for (const [k, t] of [92, 101, 140, 60, 79].entries()) expect(step(on, off, `drag${k + 2}`, y(t)), `drag${k + 2}`).toEqual([1, 0, 1]);
    expect(step(on, off, 'hide', (w) => w.v.setItemVisible('m40', false)), 'hide').toEqual([1, 0, 1]);
    expect(step(on, off, 'hide-drag', y(83)), 'hide-drag').toEqual([1, 0, 1]);
    expect(step(on, off, 'still', () => undefined), 'still').toEqual([0, 0, 0]);
  });
});
