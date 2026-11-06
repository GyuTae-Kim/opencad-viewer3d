/**
 * 0.41.0 최근접점 나눠 돌리기(STEP 46차 요청 — 같은 짝에서 70~95 ms 긴 작업)와 기본 도형 번호(indices).
 * - ClosestSearch.step(n): 마디 쌍 n개씩 이어 돌려도 한 번에 돌린 closestBetween과 같은 답(두 점·거리·번호 — 바이트까지)
 * - closestBetweenAsync(순수): 시계·쉬는 길을 받아 조각으로, 멈추기(signal)
 * - Viewer3d.closestPointsAsync: closestPoints와 같은 답, 조각 기록, 모양이 바뀌면 처음부터, 멈추기·닫기·없는 id
 * - indices: 끄면 0.40.0과 같은 필드(a·b·distance), 켜면 rawA·rawB(배열 안 번호)·indexA·indexB(segmentIds·pointIds를 거친 번호)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { buildBvh } from '../src/bvh';
import { CLOSEST_SLICE_MS, type ClosestResult, ClosestSearch, type ClosestShape, type ClosestSliceStats, closestBetween, closestBetweenAsync, closestPtSeg, closestPtTri, sliceRange } from '../src/closest';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import { boxMesh, helixPath, sphereMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, PointSet3d, Scene3d } from '../src/types';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const shapeOf = (m: Mesh3d, model?: ArrayLike<number> | null, skip?: ((i: number) => boolean) | null): ClosestShape => ({
  kind: 'triangle',
  positions: m.positions,
  ...(m.indices ? { indices: m.indices } : {}),
  bvh: buildBvh('triangle', m.positions, m.indices),
  ...(model ? { model } : {}),
  ...(skip ? { skip } : {}),
});
const T = (x: number, y: number, z: number, s = 1): number[] => [s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, y, z, 1];
const stats = (): ClosestSliceStats => ({ slices: 0, longest: 0, visited: 0, restarts: 0 });
const bytes = (r: ClosestResult | null | undefined): string => JSON.stringify(r, (_k, v) => (typeof v === 'number' ? Object.is(v, -0) ? '-0' : v.toString() : v));

/** 무작위 짝(구·상자·나선·삼각형 무리, 행렬·숨김·maxDistance·걸침) */
function pairs(): { name: string; A: ClosestShape; B: ClosestShape; opts: { maxDistance?: number } }[] {
  const rand = rng(41);
  const soup = (n: number, c: V3): Float32Array => {
    const p = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const x = c[0] + rand() * 20, y = c[1] + rand() * 20, z = c[2] + rand() * 20;
      for (let k = 0; k < 9; k++) p[i * 9 + k] = [x, y, z][k % 3]! + rand() * 2;
    }
    return p;
  };
  const out: { name: string; A: ClosestShape; B: ClosestShape; opts: { maxDistance?: number } }[] = [];
  const sph = sphereMesh('구', [0, 0, 0], 10, 48, 24, [1, 1, 1, 1]);
  const sph2 = sphereMesh('구2', [0, 0, 0], 4, 32, 16, [1, 1, 1, 1]);
  const box = boxMesh('상자', [12, -3, -3], [20, 3, 3], [1, 1, 1, 1]);
  const hx = helixPath('나선', [0, 0, 0], 12, 30, 900);
  const L: ClosestShape = { kind: 'segment', positions: hx.positions, bvh: buildBvh('segment', hx.positions) };
  const pa = soup(400, [0, 0, 0]), pb = soup(400, [17, 4, -2]);
  out.push({ name: '구–상자', A: shapeOf(sph), B: shapeOf(box), opts: {} });
  out.push({ name: '구–상자 행렬', A: shapeOf(sph, T(1, 2, 3, 1.2)), B: shapeOf(box, [0.8, 0.6, 0, 0, -0.6, 0.8, 0, 0, 0, 0, 1, 0, 5, -1, 0, 1]), opts: {} });
  out.push({ name: '구 안 구(오목 — 안쪽 벽까지)', A: shapeOf(sph), B: shapeOf(sph2, T(3, 1, -2)), opts: {} });
  out.push({ name: '구–나선', A: shapeOf(sph, T(0, 0, 0, 1.05)), B: L, opts: {} });
  out.push({ name: '무리 둘', A: { kind: 'triangle', positions: pa, bvh: buildBvh('triangle', pa) }, B: { kind: 'triangle', positions: pb, bvh: buildBvh('triangle', pb) }, opts: {} });
  out.push({ name: '무리 둘 숨김', A: { kind: 'triangle', positions: pa, bvh: buildBvh('triangle', pa), skip: (i) => i % 3 === 0 }, B: { kind: 'triangle', positions: pb, bvh: buildBvh('triangle', pb) }, opts: {} });
  out.push({ name: '걸침(거리 0)', A: shapeOf(sph), B: shapeOf(box, T(-6, 0, 0)), opts: {} });
  out.push({ name: 'maxDistance 밖', A: shapeOf(sph), B: shapeOf(box), opts: { maxDistance: 1 } });
  out.push({ name: 'maxDistance 안', A: shapeOf(sph), B: shapeOf(box), opts: { maxDistance: 2.5 } });
  return out;
}

describe('ClosestSearch·closestBetweenAsync(0.41.0 — 순수)', () => {
  it('step(n)으로 나눠도 closestBetween과 바이트까지 같다(n = 1·3·64·∞, indices 켬·끔)', () => {
    for (const { name, A, B, opts } of pairs())
      for (const indices of [false, true]) {
        const one = closestBetween(A, B, { ...opts, indices });
        for (const n of [1, 3, 64, Infinity]) {
          const s = new ClosestSearch(A, B, { ...opts, indices });
          let k = 0;
          while (!s.step(n)) k++;
          expect(bytes(s.result), `${name} ${indices} ${n}`).toBe(bytes(one));
          if (n === 1 && one && one.distance > 0) expect(k, name).toBeGreaterThan(10);
        }
        // 끄면 0.40.0 필드만
        if (one && !indices) expect(Object.keys(one).sort(), name).toEqual(['a', 'b', 'distance']);
        if (one && indices) expect(Object.keys(one).sort(), name).toEqual(['a', 'b', 'distance', 'rawA', 'rawB']);
      }
  });

  it('indices: 두 점은 그 번호의 기본 도형 위(세계), 거리 0이면 처음 찾은 걸친 쌍', () => {
    for (const { name, A, B, opts } of pairs()) {
      const r = closestBetween(A, B, { ...opts, indices: true });
      if (!r) continue;
      for (const [S, i, p] of [
        [A, r.rawA!, r.a],
        [B, r.rawB!, r.b],
      ] as const) {
        const M = S.model;
        const v = (k: number): V3 => {
          const P = S.positions;
          const x = P[k * 3]!, y = P[k * 3 + 1]!, z = P[k * 3 + 2]!;
          return M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
        };
        const I = S.indices;
        const q = S.kind === 'triangle' ? closestPtTri(p, v(I ? I[i * 3]! : i * 3), v(I ? I[i * 3 + 1]! : i * 3 + 1), v(I ? I[i * 3 + 2]! : i * 3 + 2)) : closestPtSeg(p, v(i * 2), v(i * 2 + 1));
        expect(Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), `${name} ${i}`).toBeLessThan(1e-9);
        if (S.skip) expect(S.skip(i)).toBe(false);
      }
    }
  });

  it('closestBetweenAsync: 시계가 조각 시간을 넘기면 쉬고 이어 가며, 답은 같다 — 멈추면 그 reason으로 거절', async () => {
    const { A, B } = pairs()[2]!;
    const one = closestBetween(A, B, { indices: true });
    let t = 0;
    const st = stats();
    let waits = 0;
    const r = await closestBetweenAsync(A, B, { indices: true, sliceMs: 5, now: () => (t += 1), wait: async () => void waits++, stats: st });
    expect(bytes(r)).toBe(bytes(one));
    expect(st.slices).toBeGreaterThan(3);
    expect(waits).toBe(st.slices - 1);
    expect(st.longest).toBeLessThanOrEqual(6);
    const ac = new AbortController();
    let n = 0;
    await expect(
      closestBetweenAsync(A, B, { sliceMs: 5, now: () => (t += 1), signal: ac.signal, wait: async () => void (++n === 2 && ac.abort(new Error('그만'))) }),
    ).rejects.toThrow('그만');
    expect(n).toBe(2);
    const pre = new AbortController();
    pre.abort();
    await expect(closestBetweenAsync(A, B, { signal: pre.signal, wait: async () => {} })).rejects.toMatchObject({ name: 'AbortError' });
    expect(sliceRange(undefined)).toBe(CLOSEST_SLICE_MS);
    expect(sliceRange(0)).toBe(CLOSEST_SLICE_MS);
    expect(sliceRange(-3)).toBe(CLOSEST_SLICE_MS);
    expect(sliceRange(2.5)).toBe(2.5);
    expect(sliceRange(5000)).toBe(1000);
  });
});

describe('Viewer3d.closestPointsAsync·indices(0.41.0)', () => {
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

  const sph = sphereMesh('구', [0, 0, 0], 10, 96, 48, [1, 1, 1, 1]);
  const inner = sphereMesh('안 구', [2, 1, -1], 5, 64, 32, [1, 1, 1, 1]);
  const box = boxMesh('상자', [14, -3, -3], [22, 3, 3], [1, 1, 1, 1]);
  const hx: LineSet3d = { ...helixPath('나선', [0, 0, 0], 13, 30, 900), origin: [0, 0, 1], segmentIds: new Uint32Array(900).map((_, i) => 5000 + i * 2) };
  const pts: PointSet3d = { id: '점', name: '점', positions: new Float32Array([30, 0, 0, 25, 5, 1, 40, -2, 0]), color: [1, 1, 1, 1], pointIds: new Uint32Array([70, 71, 72]) };
  const scene: Scene3d = { name: 'closest', units: 'mm', meshes: [sph, inner, box], lines: [hx], points: [pts] };
  const make = (): Viewer3d => {
    const host = dom.host();
    host.rect = { left: 0, top: 0, width: 400, height: 300 };
    const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    v.setScene(scene);
    return v;
  };
  const PAIRS: [string, string][] = [
    ['구', '상자'],
    ['구', '안 구'],
    ['나선', '구'],
    ['점', '상자'],
    ['점', '나선'],
  ];

  it('closestPoints와 바이트까지 같은 답(indices 켬·끔), 작은 조각이면 여러 조각으로', async () => {
    const v = make();
    v.setItemMatrix('상자', T(-1, 2, 0));
    for (const [a, b] of PAIRS)
      for (const indices of [false, true]) {
        const st = stats();
        const r = await v.closestPointsAsync(a, b, { indices, sliceMs: 0.01, stats: st });
        const s = v.closestPoints(a, b, { indices });
        expect(r, `${a}–${b}`).not.toBeNull();
        expect(bytes(r), `${a}–${b} ${indices}`).toBe(bytes(s));
        if (a === '구' && b === '안 구') expect(st.slices, `${a}–${b}`).toBeGreaterThan(1);
        expect(st.restarts).toBe(0);
      }
    // 끄면 0.40.0 필드만, 켜면 번호 넷 — 선분·점 묶음은 segmentIds·pointIds를 거친 번호
    expect(Object.keys(v.closestPoints('구', '상자')!).sort()).toEqual(['a', 'b', 'distance']);
    const r = v.closestPoints('점', '나선', { indices: true })!;
    expect(r.indexA).toBe(pts.pointIds![r.rawA!]);
    expect(r.indexB).toBe(hx.segmentIds![r.rawB!]);
    const m = v.closestPoints('구', '상자', { indices: true })!;
    expect(m.indexA).toBe(m.rawA);
    expect(m.indexB).toBe(m.rawB);
  });

  it('BVH가 아직 없으면 만들고 쉬었다가 같은 답, 없는 id·maxDistance 밖은 null', async () => {
    const v = make();
    const st = stats();
    expect(bytes(await v.closestPointsAsync('구', '안 구', { stats: st }))).toBe(bytes(v.closestPoints('구', '안 구')));
    expect(await v.closestPointsAsync('구', '없음')).toBeNull();
    expect(await v.closestPointsAsync('없음', '구')).toBeNull();
    expect(await v.closestPointsAsync('구', '상자', { maxDistance: 0.5 })).toBeNull();
  });

  it('도는 동안 묶음 행렬·숨긴 구간이 바뀌면 처음부터 다시 — 답은 끝날 때의 closestPoints', async () => {
    const v = make();
    v.closestPoints('구', '안 구'); // BVH를 미리
    const st = stats();
    const p = v.closestPointsAsync('구', '안 구', { sliceMs: 0.01, stats: st, indices: true });
    // 첫 조각은 부른 자리에서 돈다 — 그 뒤 바꾼다
    v.setItemMatrix('안 구', T(3, 0, 0));
    const r = await p;
    expect(st.restarts).toBeGreaterThanOrEqual(1);
    expect(bytes(r)).toBe(bytes(v.closestPoints('구', '안 구', { indices: true })));
    // 같은 값의 행렬을 다시 걸면(객체만 새것) 다시 찾지 않는다
    const st2 = stats();
    const p2 = v.closestPointsAsync('구', '안 구', { sliceMs: 0.01, stats: st2 });
    v.setItemMatrix('안 구', T(3, 0, 0));
    expect(bytes(await p2)).toBe(bytes(v.closestPoints('구', '안 구')));
    expect(st2.restarts).toBe(0);
    // 숨긴 구간(setHiddenRanges)이 바뀌어도
    const st3 = stats();
    const p3 = v.closestPointsAsync('구', '안 구', { sliceMs: 0.01, stats: st3 });
    v.setHiddenRanges('구', [{ start: 0, count: 2000 }]);
    expect(bytes(await p3)).toBe(bytes(v.closestPoints('구', '안 구')));
    expect(st3.restarts).toBeGreaterThanOrEqual(1);
  });

  it('멈추면 signal.reason으로 거절, 닫으면 null', async () => {
    const v = make();
    v.closestPoints('구', '안 구');
    const ac = new AbortController();
    const p = v.closestPointsAsync('구', '안 구', { sliceMs: 0.01, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
    const pre = new AbortController();
    pre.abort(new Error('먼저'));
    await expect(v.closestPointsAsync('구', '상자', { signal: pre.signal })).rejects.toThrow('먼저');
    const q = v.closestPointsAsync('구', '안 구', { sliceMs: 0.01 });
    v.dispose();
    expect(await q).toBeNull();
  });
});
