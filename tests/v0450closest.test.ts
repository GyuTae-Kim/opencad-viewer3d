/**
 * 0.45.0 면별(구간별) 최근접점(STEP 45차 선택 요청 — 앱이 따로 둔 삼각형 사이 거리 코드를 대신): closestPoints·closestPointsAsync의 rangeA·rangeB.
 * - closestPart(순수): 이어진 구간 하나는 배열의 subarray(복사 없음), 여럿이면 모은 번호·정점, 묶음 밖은 자르고 빈 구간은 null
 * - 같은 짝을 앱이 그 면 삼각형만 따로 그물로 만들어 잰 값과 바이트까지 같다(번호는 묶음 번호 — 구간 시작을 더한 값), 삼각형 쌍을 모두 잰 최솟값과 같은 거리
 * - 구간 없이 부른 결과는 그대로(묶음 통째 구간을 준 것과도 바이트까지 같다)
 * - 뷰어: 행렬·원점·숨긴 구간(묶음 번호로)·indexA·indexB(segmentIds), 나눠 돌리기(구간 BVH 기억 — 다시 찾지 않는다), 그물을 바꾸면 구간 BVH를 다시 만든다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { buildBvh } from '../src/bvh';
import { type ClosestResult, type ClosestShape, type ClosestSliceStats, closestBetween, closestPart, closestTriTri } from '../src/closest';
import type { V3 } from '../src/math';
import type { IndexRange } from '../src/ranges';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

const bytes = (r: ClosestResult | null | undefined): string => JSON.stringify(r, (_k, v) => (typeof v === 'number' ? (Object.is(v, -0) ? '-0' : v.toString()) : v));
const stats = (): ClosestSliceStats => ({ slices: 0, longest: 0, visited: 0, restarts: 0 });

/**
 * 원기둥 부품(STEP 꼴 면 표 — 면마다 이어진 삼각형 구간): 옆면(둘레 seg × 높이 rows칸), 윗면·아랫면(부채꼴 seg개씩).
 * 정점은 옆면 격자 seg × (rows + 1)개와 윗면·아랫면 가운데 둘 — 면끼리 정점을 함께 쓴다(번호 그물)
 */
function cylinder(id: string, c: readonly number[], r: number, h: number, seg: number, rows: number): { mesh: Mesh3d; faces: IndexRange[] } {
  const nv = seg * (rows + 1) + 2;
  const P = new Float32Array(nv * 3);
  for (let j = 0; j <= rows; j++)
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2, v = (j * seg + i) * 3;
      P[v] = c[0]! + r * Math.cos(a);
      P[v + 1] = c[1]! + r * Math.sin(a);
      P[v + 2] = c[2]! + (h * j) / rows;
    }
  const top = nv - 2, bot = nv - 1;
  P.set([c[0]!, c[1]!, c[2]! + h], top * 3);
  P.set([c[0]!, c[1]!, c[2]!], bot * 3);
  const I: number[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * seg + i, b = j * seg + ((i + 1) % seg), d = a + seg, e = b + seg;
      I.push(a, b, e, a, e, d);
    }
  const side = I.length / 3;
  for (let i = 0; i < seg; i++) I.push(rows * seg + i, rows * seg + ((i + 1) % seg), top);
  for (let i = 0; i < seg; i++) I.push(((i + 1) % seg), i, bot);
  return {
    mesh: { id, name: id, positions: P, indices: new Uint32Array(I), color: [0.7, 0.7, 0.75, 1], closed: true },
    faces: [
      { start: 0, count: side },
      { start: side, count: seg },
      { start: side + seg, count: seg },
    ],
  };
}

/** 앱이 그 면만 따로 담은 그물(쓰는 정점만 모아 번호를 다시 매긴다 — 같은 삼각형, 같은 차례) */
function faceMesh(m: Mesh3d, r: IndexRange, id: string): Mesh3d {
  const I = m.indices!.subarray(r.start * 3, (r.start + r.count) * 3);
  const remap = new Map<number, number>();
  const pos: number[] = [];
  const out = new Uint32Array(I.length);
  I.forEach((v, k) => {
    let n = remap.get(v);
    if (n === undefined) {
      n = remap.size;
      remap.set(v, n);
      pos.push(m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!);
    }
    out[k] = n;
  });
  return { ...m, id, name: id, positions: new Float32Array(pos), indices: out };
}

const shape = (m: Mesh3d, model?: number[]): ClosestShape => ({ kind: 'triangle', positions: m.positions, indices: m.indices!, bvh: buildBvh('triangle', m.positions, m.indices), ...(model ? { model } : {}) });
const partShape = (m: Mesh3d, r: IndexRange | IndexRange[], model?: number[], skip?: (i: number) => boolean): ClosestShape => {
  const p = closestPart('triangle', m.positions, m.indices, Array.isArray(r) ? r : [r])!;
  return { kind: 'triangle', positions: p.positions, ...(p.indices ? { indices: p.indices } : {}), bvh: p.bvh, offset: p.offset, map: p.map, ...(model ? { model } : {}), ...(skip ? { skip } : {}) };
};
const ROT = (x: number, y: number, z: number): number[] => [0.8, 0.6, 0, 0, -0.6, 0.8, 0, 0, 0, 0, 1, 0, x, y, z, 1];

/** 같은 축 핀–구멍(핀 반지름 1.91, 구멍 원기둥 반지름 2)과 옆 상자 */
const PIN = cylinder('핀', [0, 0, -1], 1.91, 6, 48, 8);
const HOLE = cylinder('구멍', [0, 0, 0], 2, 4, 64, 6);

describe('closestPart(0.45.0 순수)', () => {
  it('이어진 구간 하나는 subarray(복사 없음 — 새 바이트는 BVH만), 여럿이면 모은 번호와 번호 표, 이웃 구간은 합쳐 하나로', () => {
    const m = PIN.mesh;
    const one = closestPart('triangle', m.positions, m.indices, [PIN.faces[1]!])!;
    expect(one.offset).toBe(PIN.faces[1]!.start);
    expect(one.map).toBeNull();
    expect(one.positions).toBe(m.positions);
    expect(one.indices!.buffer).toBe(m.indices!.buffer);
    expect(one.indices!.length).toBe(48 * 3);
    expect(one.count).toBe(48);
    expect(one.bytes).toBe(one.bvh.box.byteLength + one.bvh.node.byteLength + one.bvh.order.byteLength);
    // 옆면 + 윗면은 이웃이라 하나로
    const two = closestPart('triangle', m.positions, m.indices, [PIN.faces[1]!, PIN.faces[0]!])!;
    expect(two.map).toBeNull();
    expect(two.offset).toBe(0);
    expect(two.count).toBe(PIN.faces[0]!.count + 48);
    // 옆면 + 아랫면은 떨어져 있어 모은다
    const gap = closestPart('triangle', m.positions, m.indices, [PIN.faces[2]!, PIN.faces[0]!])!;
    expect(gap.map!.length).toBe(PIN.faces[0]!.count + 48);
    expect(gap.map![PIN.faces[0]!.count]).toBe(PIN.faces[2]!.start);
    expect(gap.indices!.buffer).not.toBe(m.indices!.buffer);
    expect(Array.from(gap.indices!.subarray(gap.indices!.length - 3))).toEqual(Array.from(m.indices!.subarray(m.indices!.length - 3)));
    // 묶음 밖은 자르고, 남는 것이 없으면 null
    const n = m.indices!.length / 3;
    expect(closestPart('triangle', m.positions, m.indices, [{ start: n - 2, count: 10 }])!.count).toBe(2);
    expect(closestPart('triangle', m.positions, m.indices, [{ start: n, count: 3 }])).toBeNull();
    expect(closestPart('triangle', m.positions, m.indices, [])).toBeNull();
    expect(closestPart('triangle', m.positions, m.indices, [{ start: 2, count: 0 }])).toBeNull();
  });

  it('번호 없는 그물·선분·점: 하나면 정점 배열의 subarray, 여럿이면 번호 없는 그물은 정점 번호를, 선분·점은 정점을 모은다', () => {
    const tri = new Float32Array(Array.from({ length: 9 * 6 }, (_, i) => i));
    const a = closestPart('triangle', tri, undefined, [{ start: 2, count: 3 }])!;
    expect(a.indices).toBeUndefined();
    expect(a.positions.buffer).toBe(tri.buffer);
    expect(a.positions[0]).toBe(18);
    const b = closestPart('triangle', tri, undefined, [{ start: 0, count: 1 }, { start: 4, count: 1 }])!;
    expect(Array.from(b.indices!)).toEqual([0, 1, 2, 12, 13, 14]);
    expect(b.positions).toBe(tri);
    const seg = new Float32Array(Array.from({ length: 6 * 5 }, (_, i) => i));
    const s = closestPart('segment', seg, undefined, [{ start: 0, count: 1 }, { start: 3, count: 2 }])!;
    expect(Array.from(s.map!)).toEqual([0, 3, 4]);
    expect(Array.from(s.positions.subarray(6, 12))).toEqual([18, 19, 20, 21, 22, 23]);
    const pts = new Float32Array(Array.from({ length: 3 * 4 }, (_, i) => i));
    const p = closestPart('point', pts, undefined, [{ start: 3, count: 1 }, { start: 1, count: 1 }])!;
    expect(Array.from(p.map!)).toEqual([1, 3]);
    expect(Array.from(p.positions)).toEqual([3, 4, 5, 9, 10, 11]);
  });
});

describe('면별 최근접점(0.45.0)', () => {
  /** 면 짝마다: 구간 모양 ↔ 앱이 따로 만든 면 그물(행렬 있음·없음) */
  const cases: [string, number[] | undefined, number[] | undefined][] = [
    ['행렬 없음', undefined, undefined],
    ['행렬', ROT(0.03, -0.02, 0.5), ROT(0, 0, 0)],
  ];
  for (const [name, ma, mb] of cases)
    it(`앱이 면만 따로 그물로 만들어 잰 것과 바이트까지 같다(${name} — 번호는 구간 시작을 더한 묶음 번호), 삼각형 쌍을 모두 잰 최솟값과 같은 거리`, () => {
      let n = 0;
      for (const fa of PIN.faces)
        for (const fb of HOLE.faces) {
          const r = closestBetween(partShape(PIN.mesh, fa, ma), partShape(HOLE.mesh, fb, mb), { indices: true })!;
          const s = closestBetween(shape(faceMesh(PIN.mesh, fa, 'a'), ma), shape(faceMesh(HOLE.mesh, fb, 'b'), mb), { indices: true })!;
          expect(bytes({ ...r, rawA: r.rawA! - fa.start, rawB: r.rawB! - fb.start })).toBe(bytes(s));
          expect(r.rawA).toBeGreaterThanOrEqual(fa.start);
          expect(r.rawA).toBeLessThan(fa.start + fa.count);
          expect(r.rawB).toBeGreaterThanOrEqual(fb.start);
          expect(r.rawB).toBeLessThan(fb.start + fb.count);
          // 삼각형 쌍을 모두 잰 최솟값
          if (!ma) {
            let best = Infinity;
            const tri = (m: Mesh3d, t: number): V3[] => [0, 1, 2].map((k) => {
              const v = m.indices![t * 3 + k]!;
              return [m.positions[v * 3]!, m.positions[v * 3 + 1]!, m.positions[v * 3 + 2]!] as V3;
            });
            for (let i = fa.start; i < fa.start + fa.count; i++) for (let j = fb.start; j < fb.start + fb.count; j++) best = Math.min(best, closestTriTri(tri(PIN.mesh, i) as [V3, V3, V3], tri(HOLE.mesh, j) as [V3, V3, V3]).d2);
            expect(r.distance).toBe(best === 0 ? 0 : Math.sqrt(best));
          }
          n++;
        }
      expect(n).toBe(9);
    });

  it('구간 없이 부른 결과는 그대로 — 묶음 통째 구간을 준 것과도 바이트까지 같다(같은 나무)', () => {
    const nA = PIN.mesh.indices!.length / 3, nB = HOLE.mesh.indices!.length / 3;
    for (const [ma, mb] of [[undefined, undefined], [ROT(0.03, -0.02, 0.5), undefined]] as const) {
      const plain = closestBetween(shape(PIN.mesh, ma), shape(HOLE.mesh, mb), { indices: true });
      const whole = closestBetween(partShape(PIN.mesh, { start: 0, count: nA }, ma), partShape(HOLE.mesh, { start: 0, count: nB }, mb), { indices: true });
      expect(bytes(whole)).toBe(bytes(plain));
    }
  });

  it('숨김(skip)은 묶음 번호로 묻는다 — 모은 구간(map)도', () => {
    const side = PIN.faces[0]!, bot = PIN.faces[2]!;
    const asked: number[] = [];
    const skip = (i: number): boolean => {
      asked.push(i);
      return i % 2 === 0;
    };
    const r = closestBetween(partShape(PIN.mesh, [side, bot], undefined, skip), shape(HOLE.mesh), { indices: true })!;
    expect(asked.every((i) => (i >= side.start && i < side.start + side.count) || (i >= bot.start && i < bot.start + bot.count))).toBe(true);
    expect(r.rawA! % 2).toBe(1);
  });
});

describe('Viewer3d.closestPoints·closestPointsAsync의 rangeA·rangeB(0.45.0)', () => {
  let dom: ReturnType<typeof installDom>;
  const views: Viewer3d[] = [];
  beforeAll(() => {
    dom = installDom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });
  afterAll(() => {
    for (const v of views) v.dispose();
    vi.useRealTimers();
    dom.restore();
  });

  /** 선분 묶음: 핀 둘레를 도는 고리 셋(번호 0~47, 48~95, 96~143 — segmentIds는 번호 + 1000) */
  const rings = (): LineSet3d => {
    const P: number[] = [];
    for (const z of [0.5, 1.5, 2.5])
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2, b = ((i + 1) / 48) * Math.PI * 2;
        P.push(2.3 * Math.cos(a), 2.3 * Math.sin(a), z, 2.3 * Math.cos(b), 2.3 * Math.sin(b), z);
      }
    return { id: '고리', positions: new Float32Array(P), segmentIds: Uint32Array.from({ length: 144 }, (_, i) => 1000 + i), origin: [0.1, 0, 0] };
  };
  function make(split: boolean): Viewer3d {
    const host = dom.host();
    host.rect = { left: 0, top: 0, width: 640, height: 480 };
    const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    const meshes: Mesh3d[] = [
      { ...PIN.mesh, matrix: Float64Array.from(ROT(0.03, -0.02, 0)) },
      { ...HOLE.mesh },
      boxMesh('상자', [3, -1, 0], [5, 1, 2], [0.5, 0.5, 0.5, 1]),
    ];
    if (split) PIN.faces.forEach((f, k) => meshes.push({ ...faceMesh(PIN.mesh, f, `핀 면 ${k}`), matrix: Float64Array.from(ROT(0.03, -0.02, 0)) }));
    if (split) HOLE.faces.forEach((f, k) => meshes.push(faceMesh(HOLE.mesh, f, `구멍 면 ${k}`)));
    const s: Scene3d = { name: 'pin', units: 'mm', meshes, lines: [rings()] };
    v.setScene(s);
    return v;
  }

  it('면 짝마다 앱이 면을 따로 묶음으로 둔 장면과 같은 답(번호는 묶음 번호), 구간 없이는 그대로', () => {
    const v = make(true);
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++) {
        const fa = PIN.faces[a]!, fb = HOLE.faces[b]!;
        const r = v.closestPoints('핀', '구멍', { rangeA: fa, rangeB: [fb], indices: true })!;
        const s = v.closestPoints(`핀 면 ${a}`, `구멍 면 ${b}`, { indices: true })!;
        expect(bytes({ ...r, rawA: r.rawA! - fa.start, rawB: r.rawB! - fb.start, indexA: r.indexA! - fa.start, indexB: r.indexB! - fb.start })).toBe(bytes(s));
        // 번호 없이 부르면 0.44.0 필드만
        expect(Object.keys(v.closestPoints('핀', '구멍', { rangeA: fa, rangeB: fb })!).sort()).toEqual(['a', 'b', 'distance']);
      }
    // 한쪽만 구간
    const side = PIN.faces[0]!;
    expect(bytes(v.closestPoints('핀', '상자', { rangeA: side }))).toBe(bytes(v.closestPoints('핀 면 0', '상자')));
    // 구간 없이는 0.44.0 그대로(통째 구간과도 같다)
    const n = PIN.mesh.indices!.length / 3;
    expect(bytes(v.closestPoints('핀', '구멍', { indices: true }))).toBe(bytes(v.closestPoints('핀', '구멍', { rangeA: { start: 0, count: n }, rangeB: null, indices: true })));
  });

  it('선분 묶음 구간: 번호는 묶음 번호(rawA)와 segmentIds를 거친 번호(indexA), 원점 반영', () => {
    const v = make(false);
    const r = v.closestPoints('고리', '핀', { rangeA: { start: 96, count: 48 }, indices: true })!;
    expect(r.rawA).toBeGreaterThanOrEqual(96);
    expect(r.indexA).toBe(1000 + r.rawA!);
    expect(r.a[2]).toBeCloseTo(2.5, 5);
    const all = v.closestPoints('고리', '핀', { indices: true })!;
    expect(r.distance).toBeGreaterThanOrEqual(all.distance);
    // 묶음 밖·빈 구간은 null
    expect(v.closestPoints('고리', '핀', { rangeA: { start: 500, count: 3 } })).toBeNull();
    expect(v.closestPoints('고리', '핀', { rangeA: [] })).toBeNull();
  });

  it('숨긴 구간은 묶음 번호로 뺀다', () => {
    const v = make(false);
    const side = PIN.faces[0]!;
    const r0 = v.closestPoints('핀', '구멍', { rangeA: side, rangeB: HOLE.faces[0]!, indices: true })!;
    v.setHiddenRanges('핀', [{ start: r0.rawA!, count: 1 }]);
    const r1 = v.closestPoints('핀', '구멍', { rangeA: side, rangeB: HOLE.faces[0]!, indices: true })!;
    expect(r1.rawA).not.toBe(r0.rawA);
    expect(r1.distance).toBeGreaterThanOrEqual(r0.distance);
  });

  it('나눠 돌리기: 같은 답, 구간 BVH를 기억해 다시 찾지 않는다 — 도는 동안 그물을 바꾸면 처음부터(새 구간 BVH)', async () => {
    const v = make(false);
    const o = { rangeA: PIN.faces[0]!, rangeB: HOLE.faces[0]!, indices: true };
    const st = stats();
    const r = await v.closestPointsAsync('핀', '구멍', { ...o, sliceMs: 0.01, stats: st });
    expect(bytes(r)).toBe(bytes(v.closestPoints('핀', '구멍', o)));
    expect(st.slices).toBeGreaterThan(1);
    expect(st.restarts).toBe(0);
    // 그물을 바꾸면(같은 모양 — 배열 객체만 새것) 처음부터
    const st2 = stats();
    const p = v.closestPointsAsync('핀', '구멍', { ...o, sliceMs: 0.01, stats: st2 });
    v.setMesh({ ...HOLE.mesh, positions: HOLE.mesh.positions.slice(), indices: HOLE.mesh.indices!.slice() });
    const r2 = await p;
    expect(st2.restarts).toBeGreaterThanOrEqual(1);
    expect(bytes(r2)).toBe(bytes(r));
    // 빈 구간·없는 id는 null
    expect(await v.closestPointsAsync('핀', '구멍', { rangeA: { start: 99999, count: 1 } })).toBeNull();
    expect(await v.closestPointsAsync('핀', '없음', { rangeA: PIN.faces[0]! })).toBeNull();
  });
});
