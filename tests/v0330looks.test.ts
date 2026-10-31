/**
 * 0.33.0 여러 묶음 겉모습을 한 번에 걸기(Viewer3d.setItemLooks)와 행렬을 바꾼 묶음만 범위·모형 행렬을 다시 세기.
 * - 같은 목록(불투명도·고르기 빼기·색(CSS 글·RGBA)·행렬·윤곽선 색·외곽선 색·고르기 불투명·지나갈 면, 필드 null 되돌림, 항목 null(모두 되돌림), 없는 id,
 *   잘못된 행렬(그 행렬만 건너뛴다), 같은 id 둘, 객체가 아닌 항목)을 하나씩 부르는 함수로 건 뷰어와 setItemLooks 한 번으로 건 뷰어가 그리기 기록(가짜 WebGL2 — 해·그림자·
 *   단면 테두리 포함)·화면 격자 고르기(반투명 너머 고르기 포함)·전체 보기·묶음 보기·최근접점·itemLook에서 같은지, 두 번째 목록·그물 빼기·clearItemLooks 뒤에도
 * - 행렬을 하나씩 여러 번 옮기며(사이사이 그리기·고르기로 범위·모형 행렬 기억을 채운다) 숨긴 구간·선분·점 묶음까지 바꾼 뷰어가, 마지막 겉모습만 처음부터 건 뷰어와 같은지
 *   (행렬을 바꾼 묶음만 버린 기억이 다른 묶음 값을 낡게 두지 않는다)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type DrawEntry, type FakeBuffer, type FakeGL, fnv } from './fakegl';
import { boxMesh } from '../src/synth';
import { type ItemLookInput, Viewer3d } from '../src/viewer';
import type { LineSet3d, Mesh3d, PointSet3d, Scene3d } from '../src/types';

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

const N = 24;
const parts: Mesh3d[] = [];
for (let i = 0; i < N; i++) {
  const x = (i % 6) * 22, y = Math.floor(i / 6) * 22;
  parts.push(boxMesh(`p${i}`, [x, y, 0], [x + 14, y + 14, 10 + (i % 3) * 4], [0.5 + (i % 4) * 0.1, 0.6, 0.7, 1]));
}
const line: LineSet3d = { id: '선', positions: new Float32Array([0, -10, 5, 130, -10, 5, 130, -10, 5, 130, 90, 5]), origin: [0.5, 0.25, 0] };
const pts: PointSet3d = { id: '점', positions: new Float32Array([10, 95, 2, 60, 95, 2, 110, 95, 2]) };
const scene: Scene3d = { name: 'm', units: 'mm', meshes: parts, lines: [line], points: [pts] };
const IDS = [...parts.map((m) => m.id), '선', '점'];

interface View {
  v: Viewer3d;
  gl: FakeGL;
}
/** looks를 주면 장면을 준 바로 뒤(범위·모형 행렬을 세기 전)에 건다 */
function make(looks?: Iterable<readonly [string, ItemLookInput | null]>): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  views.push(v);
  v.setScene(scene);
  if (looks) v.setItemLooks(looks);
  v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true });
  v.setSection({ normal: [0, 1, 0], offset: 30 });
  v.setHiddenRanges('p3', [{ start: 0, count: 2 }]);
  v.setHiddenRanges('선', [{ start: 1, count: 1 }]);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return { v, gl: (v.canvas as unknown as FakeElement).gl! };
}

/** 그리기 한 번의 기록(단면 테두리 선분은 모으는 차례가 BVH에 따라 달라 정렬한 해시로 — v0320matrices.test.ts와 같다) */
function frame({ v, gl }: View): DrawEntry[] {
  gl.draws = [];
  gl.logDraws = true;
  v.renderNow();
  gl.logDraws = false;
  const cut = (v as unknown as { renderer: { cutSeg: { pos: FakeBuffer } | null } }).renderer.cutSeg?.pos;
  if (!cut) return gl.draws;
  const raw = `${cut.bytes.length}:${fnv(cut.bytes)}`;
  const segs: string[] = [];
  for (let o = 0; o < cut.bytes.length; o += 24) segs.push(Array.from(cut.bytes.subarray(o, o + 24)).join(','));
  const canon = `cut:${segs.length}:${fnv(new TextEncoder().encode(segs.sort().join(';')))}`;
  return gl.draws.map((d) => ({ ...d, attribs: d.attribs.map((a) => a.replace(raw, canon)) }));
}

const r9 = (x: number): number => +x.toPrecision(9);
const r9s = (p: ArrayLike<number> | undefined | null): number[] | null => (p ? Array.from(p, r9) : null);

/** 겉으로 보이는 값 모두(그리기 기록은 따로) — 반투명 너머 고르기도 */
function state(v: Viewer3d): unknown {
  const picks: unknown[] = [];
  for (const opts of [{ pointerType: 'mouse' }, { pointerType: 'touch' }, { throughTranslucent: true }])
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 14; i++) {
        const p = v.pick(((i + 0.37) * 800) / 14, ((j + 0.41) * 600) / 10, opts);
        picks.push(p ? [p.kind, p.id, p.index, r9s(p.point), r9s(p.normal)] : null);
      }
  const looks = IDS.map((id) => {
    const l = v.itemLook(id);
    return l ? { ...l, matrix: r9s(l.matrix) } : null;
  });
  const c0 = v.getCamera();
  v.fit(false);
  const fit = v.getCamera();
  v.fitItems(['p0', 'p7', '선', '점'], false);
  const items = v.getCamera();
  v.fitItems(['p3'], false);
  const ranged = v.getCamera();
  const single = ['p5', '선', '점'].map((id) => {
    v.fitItems([id], false);
    return v.getCamera();
  });
  v.setCamera(c0);
  const close = [v.closestPoints('p0', 'p1'), v.closestPoints('선', 'p2'), v.closestPoints('점', 'p20'), v.closestPoints('p3', 'p4')].map((r) => (r ? [r9(r.distance), r9s(r.a), r9s(r.b)] : null));
  return { picks, looks, fit, items, ranged, single, close, section: v.section };
}

const T = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const R = (a: number, x: number, y: number, z: number): number[] => [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** 한 항목을 하나씩 부르는 함수로(setItemLooks가 약속한 차례 — opacity → color → matrix → edgeColor → profileColor → pickOpaque → pickThrough, null 항목은 모두 되돌림) */
function applyEach(v: Viewer3d, id: string, l: ItemLookInput | null): void {
  if (l === null) {
    v.setItemOpacity(id, null);
    v.setItemColor(id, null);
    v.setItemMatrix(id, null);
    v.setItemEdgeColor(id, null);
    v.setItemProfileColor(id, null);
    v.setItemPickOpaque(id, false);
    v.setItemPickThrough(id, null);
    return;
  }
  if (typeof l !== 'object') return;
  if (l.opacity !== undefined) v.setItemOpacity(id, l.opacity, l.pickable !== undefined ? { pickable: l.pickable } : {});
  if (l.color !== undefined) v.setItemColor(id, l.color);
  if (l.matrix !== undefined) v.setItemMatrix(id, l.matrix);
  if (l.edgeColor !== undefined) v.setItemEdgeColor(id, l.edgeColor);
  if (l.profileColor !== undefined) v.setItemProfileColor(id, l.profileColor);
  if (l.pickOpaque !== undefined) v.setItemPickOpaque(id, l.pickOpaque);
  if (l.pickThrough !== undefined) v.setItemPickThrough(id, l.pickThrough);
}

/** 첫 목록: 부품마다 겉모습 여럿, 선·점, 없는 id, 잘못된 행렬(다른 필드는 건다), 같은 id 둘(뒤의 것이 덮는다), 객체가 아닌 항목 */
function first(): [string, ItemLookInput | null][] {
  const out: [string, ItemLookInput | null][] = parts.map((m, i) => {
    const l: ItemLookInput = {};
    if (i % 2 === 0) l.opacity = 0.3 + (i % 5) * 0.1;
    if (i % 6 === 2) l.pickable = false;
    if (i % 3 === 1) l.color = i % 2 ? '#ff8800' : [0.2, 0.4, 0.9, 0.8];
    if (i % 4 !== 3) l.matrix = i % 5 === 4 ? R(0.3 * i, i, 2, i % 7) : T(i % 3, -(i % 2), 2 + i * 1.5);
    if (i % 7 === 0) l.edgeColor = '#00aa55';
    if (i % 8 === 5) l.profileColor = [0.9, 0.1, 0.1, 1];
    if (i % 5 === 0) l.pickOpaque = true;
    if (i % 6 === 4) l.pickThrough = [{ start: 2, count: 4 }];
    return [m.id, l];
  });
  out.push(['선', { matrix: T(3, 4, 20), color: '#123456', opacity: 0.5, pickThrough: [{ start: 0, count: 1 }] }], ['점', { matrix: new Float32Array(R(0.2, 1, 1, 8)), pickOpaque: true }]);
  out.push(['없는 묶음', { matrix: T(1, 1, 1), opacity: 0.2 }]);
  out.push(['p2', { matrix: [...T(0, 0, 1).slice(0, 15), Number.NaN], color: '#00ff00' }], ['p6', { matrix: [1, 0, 0], opacity: 0.6 }]);
  out.push(['p9', { matrix: T(0, 0, 40), opacity: 0.9 }], ['p9', { matrix: T(5, 5, 9) }]);
  out.push(['p10', 5 as unknown as ItemLookInput], ['p11', undefined as unknown as ItemLookInput]);
  return out;
}
/** 둘째 목록: 필드 되돌리기(null), 항목 되돌리기(null), 다시 옮기기 */
function second(): [string, ItemLookInput | null][] {
  return parts
    .map((m, i): [string, ItemLookInput | null] => [
      m.id,
      i % 4 === 0 ? null : i % 4 === 1 ? { opacity: null, color: null, matrix: T(-(i % 4), i % 5, 6 + i) } : i % 4 === 2 ? { matrix: null, edgeColor: null, pickOpaque: false, pickThrough: null } : { profileColor: null, opacity: 0.7, pickable: true },
    ])
    .concat([
      ['선', null],
      ['점', { matrix: null }],
    ]);
}

describe('Viewer3d.setItemLooks(0.33.0)', () => {
  it('차례대로 하나씩 부른 것과 그리기·고르기·범위·단면·최근접점·겉모습이 같다(두 번 걸고, 되돌리고, 그물을 빼도)', () => {
    const a = make();
    const b = make();
    expect(frame(b)).toEqual(frame(a));
    const L1 = first();
    for (const [id, l] of L1) applyEach(a.v, id, l);
    // 건 것: 부품 24 + 선 + 점 + p2·p6(잘못된 행렬 — 다른 필드는 건다) + p9 둘 — 없는 id·객체가 아닌 항목 둘은 건너뛴다
    expect(b.v.setItemLooks(L1)).toBe(N + 2 + 2 + 2);
    const fa = frame(a), fb = frame(b);
    expect(fb).toEqual(fa);
    expect(fa.length).toBeGreaterThan(N);
    expect(state(b.v)).toEqual(state(a.v));
    expect(b.v.itemLook('p9')).toMatchObject({ opacity: 0.9 });
    expect(b.v.itemLook('p9')!.matrix![14]).toBe(9);
    expect(b.v.itemLook('p2')).toMatchObject({ color: [0, 1, 0, 1] });
    expect(b.v.itemLook('p2')!.matrix![14]).toBe(2 + 2 * 1.5);
    expect(b.v.itemLook('p6')).toMatchObject({ opacity: 0.6, pickable: true });
    expect(b.v.itemLook('p8')).toMatchObject({ pickable: false });
    expect(b.v.itemLook('p8')!.opacity).toBeCloseTo(0.6, 12);
    expect(b.v.itemLook('p4')!.pickThrough).toEqual([{ start: 2, count: 4 }]);
    // 선분 묶음의 지나갈 면은 무시한다(setItemPickThrough와 같다)
    expect(b.v.itemLook('선')).not.toHaveProperty('pickThrough');

    const L2 = second();
    for (const [id, l] of L2) applyEach(a.v, id, l);
    expect(b.v.setItemLooks(new Map(L2))).toBe(N + 2);
    expect(frame(b)).toEqual(frame(a));
    expect(state(b.v)).toEqual(state(a.v));
    expect(b.v.itemLook('p0')).toBeNull();
    expect(b.v.itemLook('선')).toBeNull();

    a.v.removeMesh('p1');
    b.v.removeMesh('p1');
    expect(frame(b)).toEqual(frame(a));
    expect(state(b.v)).toEqual(state(a.v));
    a.v.clearItemLooks();
    b.v.clearItemLooks();
    expect(frame(b)).toEqual(frame(a));
    expect(state(b.v)).toEqual(state(a.v));
  });

  it('빈 목록·건너뛸 것만이면 아무것도 바꾸지 않는다, 빈 겉모습({})은 센다(바꾸지 않는다)', () => {
    const a = make();
    const before = frame(a);
    const s0 = state(a.v);
    expect(a.v.setItemLooks([])).toBe(0);
    expect(a.v.setItemLooks([['없는 묶음', { opacity: 0.1 }], ['p0', 'x' as unknown as ItemLookInput]])).toBe(0);
    expect(frame(a)).toEqual(before);
    expect(a.v.setItemLooks([['p0', {}], ['p1', null]])).toBe(2);
    expect(a.v.itemLook('p0')).toBeNull();
    expect(state(a.v)).toEqual(s0);
  });
});

describe('행렬을 바꾼 묶음만 범위·모형 행렬을 다시 센다(0.33.0)', () => {
  it('하나씩 여러 번 옮긴 뷰어(사이사이 그리기·고르기·전체 보기)가 마지막 겉모습만 처음부터 건 뷰어와 같다 — 숨긴 구간·선분·점 묶음도', () => {
    const a = make();
    const moves: [string, number[] | null][] = [];
    for (let r = 0; r < 30; r++) {
      const id = IDS[(r * 7) % IDS.length]!;
      moves.push([id, r % 9 === 8 ? null : T((r % 5) - 2, (r % 3) - 1, r % 4)]);
    }
    // p3(숨긴 구간)·선(숨긴 구간·원점)·점·p5는 꼭, 장면 범위 밖으로 크게 옮긴다(낡은 범위가 남으면 전체 보기·묶음 보기·고르기가 달라진다)
    moves.push(['p3', T(4, 0, 6)], ['선', R(0.1, 0, 2, 3)], ['점', T(0, -3, 1)], ['p5', T(1, 1, 1)]);
    moves.push(['p3', T(200, 0, 6)], ['선', R(0.1, 0, 2, 120)], ['점', T(0, -150, 1)], ['p5', T(0, 0, 300)]);
    let k = 0;
    for (const [id, m] of moves) {
      // 하나씩·묶어서·겉모습 한 번에를 섞는다
      if (k % 3 === 0) a.v.setItemMatrix(id, m);
      else if (k % 3 === 1) a.v.setItemMatrices([[id, m]]);
      else a.v.setItemLooks([[id, { matrix: m, opacity: 0.8 }]]);
      k++;
      a.v.renderNow();
      a.v.pick(400 + (k % 9) * 7, 300 - (k % 5) * 11);
      if (k % 4 === 0) state(a.v);
    }
    // 마지막 겉모습을 처음부터(범위·모형 행렬을 한 번도 세기 전에) 건 뷰어
    const b = make(
      IDS.map((id): [string, ItemLookInput | null] => {
        const l = a.v.itemLook(id);
        if (!l) return [id, null];
        const o: ItemLookInput = { matrix: l.matrix ?? null };
        if (l.opacity !== undefined) o.opacity = l.opacity;
        return [id, o];
      }),
    );
    expect(IDS.map((id) => a.v.itemLook(id))).toEqual(IDS.map((id) => b.v.itemLook(id)));
    // 같은 카메라에서 견준다(처음 전체 보기는 겉모습을 건 뒤라 다르다)
    b.v.setCamera(a.v.getCamera());
    // 크게 옮긴 묶음의 묶음 보기는 옮긴 자리
    expect((state(b.v) as { single: { target: number[] }[] }).single[0]!.target[2]).toBeGreaterThan(250);
    expect(state(a.v)).toEqual(state(b.v));
    // 겉모습이 바뀌면 그림자 깊이 그림을 다시 그린다 — 두 뷰어 모두 한 번 바꾼 뒤(빈 겉모습 — 그대로) 견준다
    for (const w of [a, b]) expect(w.v.setItemLooks([['p23', {}]])).toBe(1);
    expect(frame(a)).toEqual(frame(b));
  });
});
