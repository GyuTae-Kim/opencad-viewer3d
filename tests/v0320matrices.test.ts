/**
 * 0.32.0 여러 묶음 행렬을 한 번에 걸기(Viewer3d.setItemMatrices)와 묶음 행렬 수를 세지 않고 모아 두기(하나 바꿀 때 겉모습 전체를 훑지 않는다).
 * 같은 목록(행렬·되돌림 null·없는 id·잘못된 행렬·같은 id 둘)을 차례대로 setItemMatrix로 건 뷰어와 setItemMatrices 한 번으로 건 뷰어가
 * 그리기 기록(가짜 WebGL2 — 해·그림자·단면 테두리 포함)·화면 격자 고르기·측정·전체 보기 카메라·묶음 보기·최근접점·itemLook에서 같은지,
 * 모두 되돌리면 겉모습을 준 적 없는 뷰어와 같은지(보이는 범위), 그물 빼기·clearItemLooks 뒤에도 같은지, 돌려주는 수와 Map 입력.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type DrawEntry, type FakeBuffer, type FakeGL, fnv } from './fakegl';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
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

interface View {
  v: Viewer3d;
  gl: FakeGL;
}
function make(): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  views.push(v);
  v.setScene(scene);
  v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true });
  v.setSection({ normal: [0, 1, 0], offset: 30 });
  v.setHiddenRanges('p3', [{ start: 0, count: 2 }]);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return { v, gl: (v.canvas as unknown as FakeElement).gl! };
}

/** 그리기 한 번의 기록(단면 테두리 선분은 모으는 차례가 BVH에 따라 달라 정렬한 해시로 — v0110.test.ts와 같다) */
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

/** 겉으로 보이는 값 모두(그리기 기록은 따로) */
function state(v: Viewer3d): unknown {
  const picks: unknown[] = [];
  for (const pointerType of ['mouse', 'touch'])
    for (let j = 0; j < 10; j++)
      for (let i = 0; i < 14; i++) {
        const p = v.pick(((i + 0.37) * 800) / 14, ((j + 0.41) * 600) / 10, { pointerType });
        picks.push(p ? [p.kind, p.id, p.index, r9s(p.point), r9s(p.normal)] : null);
      }
  const looks = [...parts.map((m) => m.id), '선', '점'].map((id) => {
    const l = v.itemLook(id);
    return l ? { ...l, matrix: r9s(l.matrix) } : null;
  });
  const c0 = v.getCamera();
  v.fit(false);
  const fit = v.getCamera();
  v.fitItems(['p0', 'p7', '선'], false);
  const items = v.getCamera();
  v.setCamera(c0);
  const close = [v.closestPoints('p0', 'p1'), v.closestPoints('선', 'p2'), v.closestPoints('점', 'p20')].map((r) => (r ? [r9(r.distance), r9s(r.a), r9s(r.b)] : null));
  return { picks, looks, fit, items, close, section: v.section };
}

const T = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const R = (a: number, x: number, y: number, z: number): number[] => [Math.cos(a), Math.sin(a), 0, 0, -Math.sin(a), Math.cos(a), 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** 첫 목록: 부품마다 위로·옆으로, 선·점, 없는 id, 잘못된 행렬(유한하지 않은 값·짧은 배열·문자열), 같은 id 둘(뒤의 것) */
function first(): [string, ArrayLike<number> | null][] {
  const out: [string, ArrayLike<number> | null][] = parts.map((m, i) => [m.id, i % 5 === 4 ? R(0.3 * i, i, 2, i % 7) : T(i % 3, -(i % 2), 2 + i * 1.5)]);
  out.push(['선', T(3, 4, 20)], ['점', new Float32Array(R(0.2, 1, 1, 8))], ['없는 묶음', T(1, 1, 1)]);
  out.push(['p2', [...T(0, 0, 1).slice(0, 15), Number.NaN]], ['p6', [1, 0, 0]], ['p8', ['1', 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 5, 1] as unknown as number[]]);
  out.push(['p9', T(0, 0, 40)], ['p9', T(5, 5, 9)]);
  return out;
}
/** 둘째 목록: 일부 되돌리기(null)와 다시 옮기기 */
function second(): [string, ArrayLike<number> | null][] {
  return parts.map((m, i) => [m.id, i % 3 === 0 ? null : T(-(i % 4), i % 5, 6 + i)] as [string, ArrayLike<number> | null]).concat([['선', null]]);
}

describe('Viewer3d.setItemMatrices(0.32.0)', () => {
  it('차례대로 setItemMatrix를 부른 것과 그리기·고르기·범위·단면·최근접점·겉모습이 같다(두 번 걸고, 되돌리고, 그물을 빼도)', () => {
    const a = make();
    const b = make();
    expect(frame(b)).toEqual(frame(a));
    const L1 = first();
    for (const [id, m] of L1) a.v.setItemMatrix(id, m);
    // 걸린 것: 부품 24 + 선 + 점 + p9 둘(같은 id 둘도 하나씩 센다) — 없는 id·잘못된 행렬 넷은 건너뛴다
    expect(b.v.setItemMatrices(L1)).toBe(N + 2 + 2);
    const fa = frame(a), fb = frame(b);
    expect(fb).toEqual(fa);
    expect(fa.length).toBeGreaterThan(N);
    expect(state(b.v)).toEqual(state(a.v));
    expect(b.v.itemLook('p9')!.matrix![14]).toBe(9);
    expect(b.v.itemLook('p2')!.matrix![14]).toBe(2 + 2 * 1.5);

    const L2 = second();
    for (const [id, m] of L2) a.v.setItemMatrix(id, m);
    expect(b.v.setItemMatrices(new Map(L2))).toBe(N + 1);
    expect(frame(b)).toEqual(frame(a));
    expect(state(b.v)).toEqual(state(a.v));
    expect(b.v.itemLook('p0')).toBeNull();

    a.v.removeMesh('p1');
    b.v.removeMesh('p1');
    expect(frame(b)).toEqual(frame(a));
    expect(state(b.v)).toEqual(state(a.v));
    a.v.clearItemLooks();
    b.v.clearItemLooks();
    expect(frame(b)).toEqual(frame(a));
    expect(state(b.v)).toEqual(state(a.v));
  });

  it('모두 되돌리면(null) 행렬을 건 적 없는 뷰어와 같고, 빈 목록·건너뛸 것만이면 아무것도 바꾸지 않는다', () => {
    const a = make();
    const c = make();
    expect(a.v.setItemMatrices(first())).toBe(N + 4);
    expect(state(a.v)).not.toEqual(state(c.v));
    expect(a.v.setItemMatrices([...parts.map((m) => [m.id, null] as [string, null]), ['선', null], ['점', null]])).toBe(N + 2);
    // 겉모습이 바뀌면 그림자 깊이 그림을 다시 그린다 — 견줄 뷰어도 한 번 바꾼다(되돌림만 — 그대로)
    c.v.setItemMatrix('p0', null);
    expect(frame(a)).toEqual(frame(c));
    expect(state(a.v)).toEqual(state(c.v));
    const before = frame(a);
    expect(a.v.setItemMatrices([])).toBe(0);
    expect(a.v.setItemMatrices([['없는 묶음', T(1, 2, 3)], ['p0', [1, 2]], ['p0', undefined as unknown as null], ['p0', 'x' as unknown as number[]]])).toBe(0);
    expect(frame(a)).toEqual(before);
    expect(a.v.itemLook('p0')).toBeNull();
  });

  it('다른 겉모습(불투명도·색)은 그대로 두고 행렬만 바꾼다 — 하나씩 건 것과 같은 itemLook', () => {
    const a = make();
    const b = make();
    for (const w of [a, b]) {
      w.v.setItemOpacity('p4', 0.4);
      w.v.setItemColor('p5', '#ff8800');
      w.v.setItemMatrix('p5', T(0, 0, 3));
    }
    a.v.setItemMatrix('p4', T(1, 1, 1));
    a.v.setItemMatrix('p5', null);
    expect(b.v.setItemMatrices([['p4', T(1, 1, 1)], ['p5', null]])).toBe(2);
    expect(b.v.itemLook('p4')).toEqual(a.v.itemLook('p4'));
    expect(b.v.itemLook('p5')).toEqual(a.v.itemLook('p5'));
    expect(b.v.itemLook('p5')!.color).toBeDefined();
    expect(b.v.itemLook('p5')!.matrix).toBeUndefined();
    expect(frame(b)).toEqual(frame(a));
    expect(state(b.v)).toEqual(state(a.v));
  });
});
