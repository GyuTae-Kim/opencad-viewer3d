/**
 * 0.55.0 점 둘레 기본 도형 묻기(STEP 64차 요청): primsWithin(순수 — BVH로 먼 마디를 버린다)·Viewer3d.trianglesNear.
 *  - 전수와 같은 답: 무작위 그물(번호 있음·없음)·선분·점 × 모형 행렬(없음·회전과 옮김·고르지 않은 늘림과 기울임) × 점(꼭짓점 위·삼각형 안·둘레·먼 곳) ×
 *    반지름(0·작은 것·큰 것·아주 큰 1e9·Infinity) — 모든 기본 도형을 같은 셈(closestPtTri·closestPtSeg, 세계 double 정점)으로 잰 목록과 바이트까지 같다
 *  - 깨진 정점의 도형(BVH에서 빠진다)·skip·구간 모양(closestPart — 묶음 번호)
 *  - 뷰어: 세계(묶음 원점·setItemMatrix)·local·숨긴 구간·range, 잘못된 입력은 null
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installDom } from './fakedom';
import { buildBvh, primCount, type PrimKind } from '../src/bvh';
import { type ClosestShape, closestPart, closestPtSeg, closestPtTri, primsWithin } from '../src/closest';
import type { V3 } from '../src/math';
import { boxMesh } from '../src/synth';
import type { Mesh3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

/** 결정된 난수(시험마다 같은 값) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const LIM = 1e15;

/** 전수: 모든 기본 도형을 primsWithin과 같은 셈으로 잰다(깨진 정점·정점 수 밖 번호의 도형과 skip은 뺀다) */
function brute(s: ClosestShape, p: readonly number[], r: number): number[] {
  const out: number[] = [];
  if (!(r >= 0) || !p.slice(0, 3).every(Number.isFinite)) return out;
  const P = s.positions, I = s.indices, M = s.model ?? null;
  const nv = Math.floor(P.length / 3);
  const n = primCount(s.kind, P, I);
  const q: V3 = [p[0]!, p[1]!, p[2]!];
  const vid = (i: number, k: number): number => (s.kind === 'triangle' ? (I ? I[i * 3 + k]! : i * 3 + k) : s.kind === 'segment' ? i * 2 + k : i);
  const per = s.kind === 'triangle' ? 3 : s.kind === 'segment' ? 2 : 1;
  const vert = (v: number): V3 => {
    const x = P[v * 3]!, y = P[v * 3 + 1]!, z = P[v * 3 + 2]!;
    return M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
  };
  for (let i = 0; i < n; i++) {
    let ok = true;
    for (let k = 0; k < per; k++) {
      const v = vid(i, k);
      if (!(v < nv)) ok = false;
      else for (let c = 0; c < 3; c++) if (!(P[v * 3 + c]! >= -LIM && P[v * 3 + c]! <= LIM)) ok = false;
    }
    if (!ok) continue;
    const raw = s.map ? s.map[i]! : (s.offset ?? 0) + i;
    if (s.skip && s.skip(raw)) continue;
    const c = s.kind === 'triangle' ? closestPtTri(q, vert(vid(i, 0)), vert(vid(i, 1)), vert(vid(i, 2))) : s.kind === 'segment' ? closestPtSeg(q, vert(vid(i, 0)), vert(vid(i, 1))) : vert(vid(i, 0));
    const dx = c[0] - q[0], dy = c[1] - q[1], dz = c[2] - q[2];
    if (dx * dx + dy * dy + dz * dz <= r * r) out.push(raw);
  }
  return out.sort((a, b) => a - b);
}

/** 무작위 표면 그물: 물결 격자(w × h칸) — 번호 있음이면 꼭짓점을 함께 쓴다, 없으면 삼각형마다 세 꼭짓점 */
function waveMesh(rand: () => number, w: number, h: number, indexed: boolean): { positions: Float32Array; indices?: Uint32Array } {
  const at = (i: number, j: number): V3 => [i * 1.3 + rand() * 0.4, j * 0.9 + rand() * 0.4, Math.sin(i * 0.7) * Math.cos(j * 0.5) * 2 + rand() * 0.3];
  const grid: V3[] = [];
  for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) grid.push(at(i, j));
  const tris: number[] = [];
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const a = j * (w + 1) + i, b = a + 1, c = a + w + 1, d = c + 1;
      tris.push(a, b, d, a, d, c);
    }
  if (indexed) return { positions: Float32Array.from(grid.flat()), indices: Uint32Array.from(tris) };
  return { positions: Float32Array.from(tris.flatMap((v) => grid[v]!)) };
}

const MATS: [string, number[] | null][] = [
  ['없음', null],
  // z축 둘레 30도 회전 + 옮김
  ['회전·옮김', [Math.cos(0.52), Math.sin(0.52), 0, 0, -Math.sin(0.52), Math.cos(0.52), 0, 0, 0, 0, 1, 0, 120.5, -40.25, 7, 1]],
  // 고르지 않은 늘림·기울임 + 큰 옮김
  ['늘림·기울임', [2, 0.3, 0, 0, 0.4, 0.5, 0.1, 0, 0, -0.2, 3, 0, 1e5, 2e5, -3e4, 1]],
];

function points(rand: () => number, s: ClosestShape): number[][] {
  const P = s.positions, M = s.model ?? null;
  const nv = Math.floor(P.length / 3);
  const w = (x: number, y: number, z: number): number[] =>
    M ? [M[0]! * x + M[4]! * y + M[8]! * z + M[12]!, M[1]! * x + M[5]! * y + M[9]! * z + M[13]!, M[2]! * x + M[6]! * y + M[10]! * z + M[14]!] : [x, y, z];
  const out: number[][] = [];
  for (let k = 0; k < 12; k++) {
    const v = Math.floor(rand() * nv);
    // 꼭짓점 위(r 0에서 그 꼭짓점을 쓰는 도형), 둘레, 먼 곳
    out.push(w(P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!));
    out.push(w(P[v * 3]! + (rand() - 0.5) * 2, P[v * 3 + 1]! + (rand() - 0.5) * 2, P[v * 3 + 2]! + (rand() - 0.5) * 2));
  }
  out.push(w(1e4, -1e4, 50));
  // 삼각형 안(두 꼭짓점 가운데)
  if (s.kind === 'triangle') {
    const I = s.indices;
    const t = Math.floor(rand() * primCount('triangle', P, I));
    const a = I ? I[t * 3]! : t * 3, b = I ? I[t * 3 + 1]! : t * 3 + 1;
    out.push(w((P[a * 3]! + P[b * 3]!) / 2, (P[a * 3 + 1]! + P[b * 3 + 1]!) / 2, (P[a * 3 + 2]! + P[b * 3 + 2]!) / 2));
  }
  return out;
}

const RADII = [0, 0.05, 0.6, 2.5, 9, 1e9, Infinity];

describe('0.55.0 primsWithin(순수 — 전수와 같은 답)', () => {
  it('무작위 그물(번호 있음·없음) × 모형 행렬 × 점 × 반지름(0·작은·큰·1e9·Infinity)', () => {
    const rand = rng(55);
    let cases = 0, hits = 0, zeroHits = 0;
    for (const indexed of [true, false]) {
      const m = waveMesh(rand, 40, 30, indexed);
      const bvh = buildBvh('triangle', m.positions, m.indices);
      for (const [, model] of MATS) {
        const s: ClosestShape = { kind: 'triangle', positions: m.positions, bvh, model };
        if (m.indices) s.indices = m.indices;
        for (const [pi, p] of points(rand, s).entries())
          for (const r of RADII) {
            const want = brute(s, p, r);
            expect(primsWithin(s, p, r)).toEqual(want);
            cases++;
            hits += want.length;
            // 꼭짓점 위 점(짝수 번째)은 r 0에서 그 꼭짓점을 쓰는 삼각형을 찾는다(행렬 없을 때 — float32 정점 그대로)
            if (r === 0 && !model && pi % 2 === 0 && pi < 24) {
              expect(want.length).toBeGreaterThan(0);
              zeroHits++;
            }
          }
      }
    }
    expect(cases).toBe(2 * MATS.length * 26 * RADII.length);
    expect(hits).toBeGreaterThan(10_000);
    expect(zeroHits).toBe(24);
  });

  it('선분·점 묶음, 깨진 정점의 도형(BVH에서 빠진다)·정점 수 밖 번호, skip', () => {
    const rand = rng(7);
    for (const kind of ['segment', 'point'] as PrimKind[]) {
      const P = Float32Array.from({ length: (kind === 'segment' ? 600 : 300) * 3 }, () => (rand() - 0.5) * 40);
      P[30] = NaN;
      P[61] = 2e15;
      const bvh = buildBvh(kind, P);
      for (const [, model] of MATS) {
        const s: ClosestShape = { kind, positions: P, bvh, model, skip: (i) => i % 7 === 3 };
        for (const p of points(rand, s)) for (const r of RADII) expect(primsWithin(s, p, r)).toEqual(brute(s, p, r));
      }
    }
    // 그물: NaN 꼭짓점·정점 수 밖 번호
    const m = waveMesh(rand, 20, 20, true);
    m.positions[3 * 17 + 1] = NaN;
    const I = Uint32Array.from(m.indices!);
    I[50] = 1e6;
    const s: ClosestShape = { kind: 'triangle', positions: m.positions, indices: I, bvh: buildBvh('triangle', m.positions, I) };
    expect(s.bvh.count).toBeLessThan(primCount('triangle', m.positions, I));
    for (const p of points(rand, s)) for (const r of RADII) expect(primsWithin(s, p, r)).toEqual(brute(s, p, r));
  });

  it('구간 모양(closestPart — 이어진 구간 하나·여러 구간)은 묶음 번호로, 그 구간 전수와 같다', () => {
    const rand = rng(11);
    const m = waveMesh(rand, 30, 20, true);
    const n = primCount('triangle', m.positions, m.indices);
    for (const ranges of [[{ start: 100, count: 300 }], [{ start: 5, count: 40 }, { start: 600, count: 200 }, { start: n - 10, count: 50 }]]) {
      const part = closestPart('triangle', m.positions, m.indices, ranges)!;
      for (const [, model] of MATS) {
        const s: ClosestShape = { kind: 'triangle', positions: part.positions, bvh: part.bvh, model, offset: part.offset, map: part.map };
        if (part.indices) s.indices = part.indices;
        const inRange = (i: number): boolean => ranges.some((g) => i >= g.start && i < g.start + g.count);
        const whole: ClosestShape = { kind: 'triangle', positions: m.positions, indices: m.indices, bvh: buildBvh('triangle', m.positions, m.indices), model, skip: (i) => !inRange(i) };
        for (const p of points(rand, whole)) for (const r of RADII) expect(primsWithin(s, p, r)).toEqual(brute(whole, p, r));
      }
    }
  });

  it('잘못된 입력은 빈 목록(유한하지 않은 점·0보다 작거나 NaN인 반지름·빈 나무)', () => {
    const m = waveMesh(rng(3), 4, 4, true);
    const s: ClosestShape = { kind: 'triangle', positions: m.positions, indices: m.indices, bvh: buildBvh('triangle', m.positions, m.indices) };
    expect(primsWithin(s, [0, 0, 0], 1e9).length).toBe(32);
    for (const [p, r] of [
      [[NaN, 0, 0], 1],
      [[0, Infinity, 0], 1],
      [[0, 0, 0], -1],
      [[0, 0, 0], NaN],
    ] as [number[], number][])
      expect(primsWithin(s, p, r)).toEqual([]);
    const empty: ClosestShape = { kind: 'triangle', positions: new Float32Array(0), bvh: buildBvh('triangle', new Float32Array(0)) };
    expect(primsWithin(empty, [0, 0, 0], Infinity)).toEqual([]);
  });
});

describe('0.55.0 Viewer3d.trianglesNear', () => {
  let dom: ReturnType<typeof installDom>;
  beforeAll(() => {
    dom = installDom();
  });
  afterAll(() => dom.restore());

  it('세계(묶음 원점·행렬)·local·숨긴 구간·range가 전수와 같고, 잘못된 입력은 null', () => {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false });
    const rand = rng(21);
    const w = waveMesh(rand, 24, 16, true);
    const mesh: Mesh3d = { id: 'w', positions: w.positions, indices: w.indices!, color: [0.6, 0.6, 0.6, 1], origin: [1000, -500, 20] };
    const box = boxMesh('box', [0, 0, 0], [5, 5, 5], [0.5, 0.5, 0.5, 1]);
    v.setScene({ name: 'n', units: 'mm', meshes: [mesh, box], lines: [{ id: 'l', positions: new Float32Array([0, 0, 0, 1, 1, 1]), color: [0, 0, 0, 1] }] });
    const mat = [Math.cos(0.3), 0, -Math.sin(0.3), 0, 0, 1, 0, 0, Math.sin(0.3), 0, Math.cos(0.3), 0, 10, 20, 30, 1];
    v.setItemMatrix('w', mat);
    const model = (v as unknown as { modelOf: (m: Mesh3d) => ArrayLike<number> | undefined }).modelOf(mesh) ?? null;
    expect(model).not.toBeNull();
    const bvh = buildBvh('triangle', w.positions, w.indices);
    const world: ClosestShape = { kind: 'triangle', positions: w.positions, indices: w.indices!, bvh, model };
    const local: ClosestShape = { kind: 'triangle', positions: w.positions, indices: w.indices!, bvh };
    v.setHiddenRanges('w', [{ start: 40, count: 60 }]);
    const hidden = (i: number): boolean => i >= 40 && i < 100;
    let total = 0;
    for (const p of points(rand, world))
      for (const r of [0, 0.5, 3, 1e9]) {
        const want = brute({ ...world, skip: hidden }, p, r);
        expect(v.trianglesNear('w', p, r)).toEqual(want);
        expect(v.trianglesNear('w', p, r, { hidden: true })).toEqual(brute(world, p, r));
        expect(v.trianglesNear('w', p, r, { range: { start: 200, count: 300 } })).toEqual(brute({ ...world, skip: (i) => hidden(i) || i < 200 || i >= 500 }, p, r));
        total += want.length;
      }
    for (const p of points(rand, local)) for (const r of [0, 0.5, 3]) expect(v.trianglesNear('w', p, r, { local: true, hidden: true })).toEqual(brute(local, p, r));
    expect(total).toBeGreaterThan(1000);
    // 상자(묶음 행렬 없음): 모서리 위 점은 그 모서리를 끼는 두 면의 삼각형, 가운데에서 면까지 2.5
    expect(v.trianglesNear('box', [5, 2.5, 5], 1e-9)).toEqual([2, 7]);
    expect(v.trianglesNear('box', [2.5, 2.5, 2.5], 2.4)).toEqual([]);
    expect(v.trianglesNear('box', [2.5, 2.5, 2.5], 2.6)!.length).toBe(12);
    // 잘못된 입력
    expect(v.trianglesNear('nope', [0, 0, 0], 1)).toBeNull();
    expect(v.trianglesNear('l', [0, 0, 0], 1)).toBeNull();
    expect(v.trianglesNear('w', [NaN, 0, 0], 1)).toBeNull();
    expect(v.trianglesNear('w', [0, 0, 0], -1)).toBeNull();
    expect(v.trianglesNear('w', [0, 0, 0], 1, { range: { start: 1e6, count: 5 } })).toEqual([]);
    v.dispose();
  });
});
