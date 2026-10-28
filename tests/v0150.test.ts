/**
 * 0.15.0 열린 수직 발과 교차점 다듬기(MeasureSnapOptions.refine).
 * - 순수 함수: 토막 밖 발을 토막 끝으로 자르기(openFoot), 넓힌 교차(looseIntersection), 열린 후보 만들기(openCandidates),
 *   열린 후보 풀기(refineOpen — 기억·호출 한도·같은 점 하나로·코어 점 그대로 버림·단면), 기억(RefineMemo·openRefineKey),
 *   교차점 넘기기(refineTarget·inferenceCandidates의 other), 같은 입력(sameRefineInput의 other·open)
 * - 뷰어: 12토막 원 꺾은선 + 정확한 원 위로 다듬는 가짜 앱 함수. 첫 점이 원 밖 멀리 있어 꺾은선 발이 토막 밖일 때도 원 위 발을 붙잡고 거리가 정확한지,
 *   원과 곧은 선분·원과 세로 원의 교차점이 정확한지, null이면 열린 후보가 없고 refine 없는 뷰어와 같은지, 커서에서 먼 점은 버리는지,
 *   호출 한도·기억, 잠금 중에는 부르지 않는지
 * 가짜 DOM·가짜 WebGL2로 만든 뷰어에 실제 포인터 사건을 넣는다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import {
  type NearSegment,
  OPEN_INTERSECTION_CHORD,
  inferenceCandidates,
  looseIntersection,
  openCandidates,
  openFoot,
  perpendicularFoot,
  segmentIntersection,
  unitDir,
} from '../src/inference';
import {
  type MeasureSnapPick,
  type OpenSnapCandidate,
  type SnapRefineInput,
  type SnapSegment,
  OPEN_REFINE_CALLS,
  RefineMemo,
  chooseMeasureSnap,
  openRefineKey,
  refineOpen,
  refineTarget,
  sameRefineInput,
} from '../src/snap';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { LineSet3d, Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

// ───────────── 순수 함수 ─────────────
describe('openFoot(토막 밖 발을 토막 끝으로)', () => {
  const a: V3 = [0, 0, 0], b: V3 = [10, 0, 0];
  it('발이 토막 밖이면 발 쪽 끝점(복사본), 안쪽이면 null', () => {
    const r = openFoot([15, 7, 0], a, b, 0.01)!;
    expect(r).toEqual(b);
    expect(r).not.toBe(b);
    expect(openFoot([-3, 7, 2], a, b, 0.01)).toEqual(a);
    // 안쪽: 보통 수직 발(perpendicularFoot)이 맡는다
    expect(openFoot([4, 7, 0], a, b, 0.01)).toBeNull();
    expect(perpendicularFoot([4, 7, 0], a, b, 0.01)).not.toBeNull();
  });
  it('끝점 tol 안의 발은 그 끝점, 점이 직선 위거나 길이 0이면 null', () => {
    expect(openFoot([0.005, 7, 0], a, b, 0.01)).toEqual(a);
    expect(openFoot([9.995, -7, 0], a, b, 0.01)).toEqual(b);
    expect(perpendicularFoot([0.005, 7, 0], a, b, 0.01)).toBeNull();
    expect(openFoot([20, 0.001, 0], a, b, 0.01)).toBeNull();
    expect(openFoot([3, 3, 3], a, a, 0.01)).toBeNull();
  });
});

describe('looseIntersection(넓힌 교차)', () => {
  // 서로 엇갈려 지나는 두 선분: z = 0의 X 방향과 z = g의 Y 방향
  const a0: V3 = [-5, 0, 0], a1: V3 = [5, 0, 0];
  const at = (g: number): [V3, V3] => [[1, -5, g], [1, 5, g]];
  it('허용치로는 안 만나고 가장 가까운 두 점이 넓힌 허용치 안이면 그 가운데', () => {
    const [b0, b1] = at(0.4);
    expect(segmentIntersection(a0, a1, b0, b1, 0.01)).toBeNull();
    const m = looseIntersection(a0, a1, b0, b1, 0.01, 0.5)!;
    expect(dist(m, [1, 0, 0.2])).toBeLessThan(1e-12);
    expect(looseIntersection(a0, a1, b0, b1, 0.01, 0.3)).toBeNull();
  });
  it('허용치 안에서 만나면(보통 교차점) null, 나란함·끝점에서 만남·넓힌 허용치가 허용치 이하면 null', () => {
    const [b0, b1] = at(0.005);
    expect(segmentIntersection(a0, a1, b0, b1, 0.01)).not.toBeNull();
    expect(looseIntersection(a0, a1, b0, b1, 0.01, 0.5)).toBeNull();
    expect(looseIntersection(a0, a1, [-5, 0.2, 0], [5, 0.2, 0], 0.01, 0.5)).toBeNull();
    // 꼭짓점에서 만나는(끝점을 함께 쓰는) 이웃 토막
    expect(looseIntersection(a0, a1, [5, 0, 0], [8, 3, 0.1], 0.01, 0.5)).toBeNull();
    const [c0, c1] = at(0.4);
    expect(looseIntersection(a0, a1, c0, c1, 0.5, 0.5)).toBeNull();
  });
  it('선분 범위 밖으로 비켜 가면 잘린 가장 가까운 두 점으로 잰다', () => {
    // 직선끼리는 (1, 0, 0)·(1, 0, 0.4)에서 가장 가깝지만 둘째 선분은 y ≥ 0.3에서 시작한다
    const m = looseIntersection(a0, a1, [1, 0.3, 0.4], [1, 5, 0.4], 0.01, 1)!;
    expect(dist(m, [1, 0.15, 0.2])).toBeLessThan(1e-12);
    expect(looseIntersection(a0, a1, [1, 0.3, 0.4], [1, 5, 0.4], 0.01, 0.45)).toBeNull();
  });
});

/** 커서 둘레 선분(번호 있는 꼴) */
const near = (id: string, raw: number, a: V3, b: V3, wpp = 0.01, keep?: (p: readonly number[]) => boolean): NearSegment => ({ a, b, id, wpp, kind: 'line', index: 100 + raw, raw, ...(keep ? { keep } : {}) });

describe('openCandidates(열린 후보 만들기)', () => {
  it('토막 밖 수직 발은 토막 끝으로, 넓힌 교차점은 가운데로. 차례는 커서에 가까운 선분부터(교차점은 두 선분 가운데 늦은 것)', () => {
    const s0 = near('a', 0, [-5, 0, 0], [5, 0, 0], 0.05);
    const s1 = near('b', 3, [1, -5, 0.4], [1, 5, 0.4], 0.05);
    const s2 = near('a', 1, [5, 0, 0], [9, 3, 0], 0.05);
    const first: V3 = [40, 30, 0];
    const c = openCandidates([s0, s1, s2], first, { intersections: true, perpendicular: true }, 10);
    expect(c.map((q) => [q.kind, q.seg.raw, q.other?.raw ?? null])).toEqual([
      ['perpendicular', 0, null],
      ['intersection', 0, 3],
      ['perpendicular', 3, null],
      ['perpendicular', 1, null],
    ]);
    expect(c[0]!.p).toEqual([5, 0, 0]);
    expect(c[0]!.edge).toEqual([s0.a, s0.b]);
    expect(c[0]!.seg).toEqual({ kind: 'line', id: 'a', index: 100, raw: 0, ends: [s0.a, s0.b] });
    expect(dist(c[1]!.p, [1, 0, 0.2])).toBeLessThan(1e-12);
    expect(c[1]!.tol).toBe(0.025);
    // 넓힌 허용치는 토막 길이 합의 OPEN_INTERSECTION_CHORD배와 붙잡기 거리의 세계 길이 가운데 작은 것
    const only = (snapPx: number, wpp: number) =>
      openCandidates([near('a', 0, s0.a, s0.b, wpp), near('b', 3, s1.a, s1.b, wpp)], null, { intersections: true, perpendicular: true }, snapPx).length;
    expect(OPEN_INTERSECTION_CHORD * 20).toBeGreaterThan(0.4);
    expect(only(10, 0.01)).toBe(0); // 10화소 × 0.01 = 0.1 < 0.4
    expect(only(10, 0.05)).toBe(1); // 0.5
    expect(openCandidates([near('a', 0, [0, 0, 0], [1, 0, 0]), near('b', 3, [0.5, -1, 0.4], [0.5, 1, 0.4])], null, { intersections: true, perpendicular: false }, 10).length).toBe(0); // 0.1 × 3 = 0.3 < 0.4
  });
  it('번호가 없는 선분(0.13.0 꼴)·꺼진 종류·첫 점 없음은 후보가 없다', () => {
    const s0 = near('a', 0, [-5, 0, 0], [5, 0, 0]);
    const bare: NearSegment = { a: [1, -5, 0.4], b: [1, 5, 0.4], id: 'b', wpp: 0.05 };
    expect(openCandidates([{ ...s0, wpp: 0.05 }, bare], [40, 30, 0], { intersections: true, perpendicular: true }, 10).map((c) => c.seg.id)).toEqual(['a']);
    expect(openCandidates([s0], null, { intersections: true, perpendicular: true }, 10)).toEqual([]);
    expect(openCandidates([s0], [40, 30, 0], { intersections: true, perpendicular: false }, 10)).toEqual([]);
  });
});

describe('refineOpen(열린 후보 풀기)', () => {
  const seg = (raw: number): SnapSegment => ({ kind: 'edge', id: '판', index: raw, raw, ends: [[raw, 0, 0], [raw + 1, 0, 0]] });
  const cand = (raw: number, p: V3 = [raw + 1, 0, 0]): OpenSnapCandidate => ({ kind: 'perpendicular', p, id: '판', seg: seg(raw), edge: seg(raw).ends, tol: 0.01 });
  const ray = { origin: [0, 0, 100] as V3, dir: [0, 0, -1] as V3 };
  it('앱이 다듬은 점만 후보로(refined·core), 입력은 복사본·open, 같은 종류의 같은 점은 하나', () => {
    const calls: SnapRefineInput[] = [];
    const memo = new RefineMemo();
    const out = refineOpen([cand(0), cand(1), cand(2)], [9, 9, 0], ray, (i) => (calls.push(i), i.segment.raw === 2 ? null : [1.5, 0.3, 0]), memo, { calls: 10 });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({ kind: 'perpendicular', point: [1, 0, 0], segment: seg(0), first: [9, 9, 0], ray, open: true });
    expect(calls[0]!.segment).not.toBe(cand(0).seg);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ p: [1.5, 0.3, 0], kind: 'perpendicular', id: '판', refined: true, core: [1, 0, 0], seg: seg(0) });
    expect(memo.size).toBe(3);
  });
  it('기억에 있으면 부르지 않고, 기억에 없는 것은 남은 호출 수만큼만 부른다', () => {
    const memo = new RefineMemo();
    let n = 0;
    const f = (i: SnapRefineInput): V3 => (n++, [i.segment.raw + 0.5, 1, 0]);
    const cs = Array.from({ length: 10 }, (_, k) => cand(k));
    const b = { calls: 4 };
    expect(refineOpen(cs, null, ray, f, memo, b)).toHaveLength(4);
    expect([n, b.calls]).toEqual([4, 0]);
    // 다음 미리 보기: 앞 넷은 기억, 다음 넷을 부른다
    expect(refineOpen(cs, null, ray, f, memo, { calls: 4 })).toHaveLength(8);
    expect(n).toBe(8);
    expect(refineOpen(cs, null, ray, f, memo, { calls: 4 })).toHaveLength(10);
    expect(n).toBe(10);
    // 모두 기억 — 다시 부르지 않는다(광선이 달라도)
    expect(refineOpen(cs, null, { origin: [5, 5, 5], dir: [0, 1, 0] }, f, memo, { calls: 4 })).toHaveLength(10);
    expect(n).toBe(10);
    // 첫 점이 바뀌면 다른 열쇠
    refineOpen(cs.slice(0, 1), [1, 2, 3], ray, f, memo, { calls: 4 });
    expect(n).toBe(11);
  });
  it('코어 점 그대로(tol 안)·수가 아닌 값·단면에 잘린 쪽은 버린다', () => {
    const memo = new RefineMemo();
    expect(refineOpen([cand(0)], null, ray, (i) => [i.point[0] + 0.005, 0, 0], memo, { calls: 9 })).toEqual([]);
    expect(refineOpen([cand(1)], null, ray, () => [NaN, 0, 0], memo, { calls: 9 })).toEqual([]);
    expect(refineOpen([cand(2)], null, ray, () => 'abc', memo, { calls: 9 })).toEqual([]);
    const kept = { ...cand(3), keep: (p: readonly number[]) => p[1]! < 0 };
    expect(refineOpen([kept], null, ray, () => [3.5, 0.2, 0], memo, { calls: 9 })).toEqual([]);
    expect(refineOpen([{ ...kept, seg: seg(4) }], null, ray, () => [3.5, -0.2, 0], memo, { calls: 9 })).toHaveLength(1);
  });
  it('교차점은 둘째 선분(other)을 넘기고 후보에 싣는다', () => {
    const c: OpenSnapCandidate = { kind: 'intersection', p: [1, 0, 0.2], id: '판', seg: seg(0), other: seg(7), tol: 0.01 };
    const calls: SnapRefineInput[] = [];
    const out = refineOpen([c], null, ray, (i) => (calls.push(i), [1, 0, 0.5]), new RefineMemo(), { calls: 1 });
    expect(calls[0]!.other).toEqual(seg(7));
    expect(calls[0]!.kind).toBe('intersection');
    expect(out[0]).toMatchObject({ kind: 'intersection', other: seg(7), refined: true, core: [1, 0, 0.2] });
  });
  it('RefineMemo: 가장 오래 쓰지 않은 것부터 지우고, null도 기억한다', () => {
    const m = new RefineMemo(2);
    m.set('a', [1, 1, 1]);
    m.set('b', null);
    expect(m.get('a')).toEqual([1, 1, 1]);
    m.set('c', [3, 3, 3]);
    expect(m.get('b')).toBeUndefined();
    expect(m.get('a')).toEqual([1, 1, 1]);
    m.set('d', null);
    expect(m.get('c')).toBeUndefined();
    expect(m.get('d')).toBeNull();
    expect(m.size).toBe(2);
    // 열쇠: 광선은 넣지 않고 종류·점·선분·둘째 선분·첫 점은 넣는다
    const base = { kind: 'perpendicular' as const, point: [1, 2, 3] as V3, segment: seg(0), first: null };
    expect(openRefineKey(base)).toBe(openRefineKey({ ...base }));
    for (const v of [{ ...base, kind: 'intersection' as const }, { ...base, point: [1, 2, 4] as V3 }, { ...base, segment: seg(1) }, { ...base, other: seg(1) }, { ...base, first: [0, 0, 0] as V3 }])
      expect(openRefineKey(v)).not.toBe(openRefineKey(base));
  });
});

describe('교차점 넘기기(refineTarget·inferenceCandidates·sameRefineInput)', () => {
  const ends = (x: number): [V3, V3] => [[x, -5, 0], [x, 5, 0]];
  const sa: SnapSegment = { kind: 'line', id: 'l', index: 500, raw: 0, ends: ends(0) };
  const sb: SnapSegment = { kind: 'edge', id: 'm', index: 3, raw: 3, ends: ends(1) };
  it('코어 교차점은 두 선분 식별자가 있을 때만 intersection(복사본), 열린 후보(이미 다듬었다)는 넘기지 않는다', () => {
    const r: MeasureSnapPick = { p: [0, 0, 0], vertex: true, kind: 'intersection', seg: sa, other: sb };
    const t = refineTarget(r, null)!;
    expect(t).toEqual({ kind: 'intersection', segment: sa, other: sb });
    expect(t.other).not.toBe(sb);
    expect(refineTarget({ ...r, other: undefined }, null)).toBeNull();
    expect(refineTarget({ ...r, refined: true }, null)).toBeNull();
    expect(refineTarget({ p: [0, 0, 0], vertex: true, kind: 'perpendicular', seg: sa, refined: true }, null)).toBeNull();
  });
  it('inferenceCandidates: 두 선분 모두 번호가 있으면 교차점에 seg·other, 아니면 0.14.0 그대로', () => {
    const s0 = near('l', 0, [-5, 0, 0], [5, 0, 0]);
    const s1 = near('m', 3, [0, -5, 0], [0, 5, 0]);
    const c = inferenceCandidates([s0, s1], null, { intersections: true, perpendicular: false });
    expect(c).toHaveLength(1);
    expect(c[0]!.seg).toMatchObject({ id: 'l', raw: 0 });
    expect(c[0]!.other).toMatchObject({ id: 'm', raw: 3 });
    const old = inferenceCandidates([s0, { a: s1.a, b: s1.b, id: 'm', wpp: 0.01 }], null, { intersections: true, perpendicular: false });
    expect(old).toEqual([{ p: c[0]!.p, kind: 'intersection', id: 'l' }]);
  });
  it('sameRefineInput: 둘째 선분·open도 견준다', () => {
    const a: SnapRefineInput = { kind: 'intersection', point: [0, 0, 0], segment: sa, other: sb, first: null, ray: { origin: [0, 0, 9], dir: [0, 0, -1] } };
    const copy = (): SnapRefineInput => JSON.parse(JSON.stringify(a));
    expect(sameRefineInput(a, copy())).toBe(true);
    const variants: ((x: SnapRefineInput) => void)[] = [(x) => delete x.other, (x) => (x.other!.raw = 4), (x) => (x.other!.ends[0][1] = -6), (x) => (x.open = true)];
    for (const change of variants) {
      const b = copy();
      change(b);
      expect(sameRefineInput(a, b)).toBe(false);
    }
    expect(sameRefineInput({ ...a, open: false }, copy())).toBe(true);
  });
  it('chooseMeasureSnap: 열린 후보는 다듬은 점으로 견주고 refined·core·other를 싣는다. 거리가 같으면 앞의 것', () => {
    const iso = dirToAngles([1, -1, 0.8]);
    const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
    const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
    const q: V3 = [0, 0, 0];
    const [sx, sy] = projectToScreen(f, q)!;
    const r = chooseMeasureSnap(f, sx, sy, 10, null, [{ p: q, kind: 'intersection', id: 'l', seg: sa, other: sb, refined: true, core: [9, 9, 9] }], () => true)!;
    expect(r).toMatchObject({ kind: 'intersection', refined: true, core: [9, 9, 9], other: sb });
    const r2 = chooseMeasureSnap(f, sx, sy, 10, null, [{ p: q, kind: 'perpendicular', id: 'l' }, { p: q, kind: 'intersection', id: 'l', refined: true }], () => true)!;
    expect(r2.kind).toBe('perpendicular');
    expect('refined' in r2).toBe(false);
  });
});

// ───────────── 뷰어 ─────────────
let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

const deg = Math.PI / 180;
const f32 = (p: readonly number[]): V3 => [Math.fround(p[0]!), Math.fround(p[1]!), Math.fround(p[2]!)];
const lerp = (a: readonly number[], b: readonly number[], t: number): V3 => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];

/** 앱이 아는 원: 중심, 단위 법선, 반지름, 틀(u·v — 꺾은선 꼭짓점 자리), 꺾은선 토막 수와 시작 각 */
interface Circle {
  c: V3;
  n: V3;
  r: number;
  u: V3;
  v: V3;
  segs: number;
  start: number;
}
const circleAt = (k: Circle, a: number): V3 => {
  const cs = Math.cos(a * deg), sn = Math.sin(a * deg);
  return [k.c[0] + k.r * (k.u[0] * cs + k.v[0] * sn), k.c[1] + k.r * (k.u[1] * cs + k.v[1] * sn), k.c[2] + k.r * (k.u[2] * cs + k.v[2] * sn)];
};
const polyline = (id: string, k: Circle): LineSet3d => {
  const step = 360 / k.segs;
  const P: number[] = [];
  for (let i = 0; i < k.segs; i++) P.push(...circleAt(k, k.start + i * step), ...circleAt(k, k.start + (i + 1) * step));
  return { id, positions: new Float32Array(P), segmentIds: new Uint32Array(Array.from({ length: k.segs }, (_, i) => 100 + i)) };
};
/** 꺾은선 꼭짓점 i(float32) */
const vtx = (k: Circle, i: number): V3 => f32(circleAt(k, k.start + (i * 360) / k.segs));

/** 원 '고리': z = 0 평면, 중심 원점, 반지름 30, 12토막(꼭짓점 15° + 30°·i — (30, 0, 0)은 토막 가운데) */
const RING: Circle = { c: [0, 0, 0], n: [0, 0, 1], r: 30, u: [1, 0, 0], v: [0, 1, 0], segs: 12, start: 15 };
/** 원 '세로 원': y = 0 평면, 중심 (20, 0, 0), 반지름 10 — 고리와 (30, 0, 0) 한 점에서 3D로 만난다(꺾은선끼리는 현의 처짐만큼 비켜 간다) */
const UPRIGHT: Circle = { c: [20, 0, 0], n: [0, 1, 0], r: 10, u: [1, 0, 0], v: [0, 0, 1], segs: 12, start: 15 };
/** 촘촘한 작은 원(호출 한도): 96토막, 반지름 1.5 */
const DENSE: Circle = { c: [-60, -60, 0], n: [0, 0, 1], r: 1.5, u: [1, 0, 0], v: [0, 1, 0], segs: 96, start: 0 };
const X: V3 = [30, 0, 0];
/** 곧은 선분 '가로선': y = 15, z = 0 — 고리와 (±√675, 15, 0)에서 같은 평면으로 만난다 */
const LINE: [V3, V3] = [
  [-50, 15, 0],
  [50, 15, 0],
];
/** 첫 점: 고리 중심에서 20° 방향 80 mm(곧은 선분 '기준'의 끝). 그 방향 원 위 발(20°)은 꼭짓점 15°에서 5° — 둘레 토막으로 내린 꺾은선 발은 모두 토막 밖 */
const F: V3 = [80 * Math.cos(20 * deg), 80 * Math.sin(20 * deg), 0];
const scene: Scene3d = {
  name: 't',
  units: 'mm',
  meshes: [],
  lines: [
    polyline('고리', RING),
    polyline('세로 원', UPRIGHT),
    polyline('촘촘한 원', DENSE),
    { id: '가로선', positions: new Float32Array([...LINE[0], ...LINE[1]]), segmentIds: new Uint32Array([7]) },
    { id: '기준', positions: new Float32Array([...F, F[0] + 12, F[1] - 3, 0]) },
  ],
  points: [],
};
const CIRCLES: Record<string, Circle> = { 고리: RING, '세로 원': UPRIGHT, '촘촘한 원': DENSE };

const sub3 = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot3 = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross3 = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
/** 원 평면 위로 내린 뒤 지름 방향(원 위 가장 가까운 점) */
const radial = (k: Circle, p: readonly number[]): V3 => {
  const d = sub3(p, k.c);
  const h = dot3(d, k.n);
  const w: V3 = [d[0] - h * k.n[0], d[1] - h * k.n[1], d[2] - h * k.n[2]];
  const l = Math.hypot(...w);
  return [k.c[0] + (k.r * w[0]) / l, k.c[1] + (k.r * w[1]) / l, k.c[2] + (k.r * w[2]) / l];
};
/** 직선(점 o, 방향 d)과 원 k의 만남(원 평면 위 직선만 — 아니면 평면과의 만남이 원 위일 때) */
function lineCircle(o: readonly number[], d: readonly number[], k: Circle): V3[] {
  const dn = dot3(d, k.n);
  if (Math.abs(dn) > 1e-12) {
    const t = dot3(sub3(k.c, o), k.n) / dn;
    const p: V3 = [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t];
    return Math.abs(dist(p, k.c) - k.r) < 1e-9 ? [p] : [];
  }
  // 같은 평면: |o + t d − c|² = r²
  const w = sub3(o, k.c);
  const A = dot3(d, d), B = 2 * dot3(w, d), Cc = dot3(w, w) - k.r * k.r;
  const D = B * B - 4 * A * Cc;
  if (D < 0) return [];
  return [(-B - Math.sqrt(D)) / (2 * A), (-B + Math.sqrt(D)) / (2 * A)].map((t) => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t] as V3);
}
/** 두 원의 만남(평면이 다를 때 — 두 평면의 교선과 첫 원의 만남 가운데 둘째 원 위인 것) */
function circleCircle(a: Circle, b: Circle): V3[] {
  const d = cross3(a.n, b.n);
  if (Math.hypot(...d) < 1e-12) return [];
  // 두 평면 위의 한 점: n_a·p = n_a·c_a, n_b·p = n_b·c_b, d·p = 0
  const ha = dot3(a.n, a.c), hb = dot3(b.n, b.c);
  const dd = dot3(d, d);
  const o: V3 = cross3([hb * a.n[0] - ha * b.n[0], hb * a.n[1] - ha * b.n[1], hb * a.n[2] - ha * b.n[2]], d).map((x) => -x / dd) as V3;
  return lineCircle(o, d, a).filter((p) => Math.abs(dist(p, b.c) - b.r) < 1e-9);
}
const nearestTo = (ps: readonly V3[], q: readonly number[]): V3 | null => ps.reduce<V3 | null>((m, p) => (!m || dist(p, q) < dist(m, q) ? p : m), null);
/** 정확한 원·곧은 선분으로 다듬는 가짜 앱 함수(부른 입력을 모은다) */
function exactApp(calls: SnapRefineInput[]): (i: SnapRefineInput) => V3 | null {
  return (i) => {
    calls.push(i);
    const k = CIRCLES[i.segment.id];
    if (i.kind === 'intersection') {
      const o = i.other ? CIRCLES[i.other.id] : undefined;
      const lineOf = (s: SnapSegment): [V3, V3] | null => (s.id === '가로선' ? LINE : null);
      if (k && o) return nearestTo(circleCircle(k, o), i.point);
      const kk = k ?? o;
      const l = lineOf(i.segment) ?? (i.other ? lineOf(i.other) : null);
      return kk && l ? nearestTo(lineCircle(l[0], sub3(l[1], l[0]), kk), i.point) : null;
    }
    if (!k) return null;
    if (i.kind === 'onEdge') {
      const t = dot3(sub3(k.c, i.ray.origin), k.n) / dot3(i.ray.dir, k.n);
      return radial(k, [i.ray.origin[0] + i.ray.dir[0] * t, i.ray.origin[1] + i.ray.dir[1] * t, i.ray.origin[2] + i.ray.dir[2] * t]);
    }
    if (i.kind === 'midpoint') return radial(k, lerp(i.segment.ends[0], i.segment.ends[1], 0.5));
    // 수직 발: 첫 점의 지름 방향 두 점 가운데 코어 점에 가까운 것
    const q = radial(k, i.first!);
    const q2: V3 = [2 * k.c[0] - q[0], 2 * k.c[1] - q[1], 2 * k.c[2] - q[2]];
    return dist(q, i.point) <= dist(q2, i.point) ? q : q2;
  };
}

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement };
}
const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const clickAt = (w: View, p: readonly number[]): void => {
  const s = at(w, p);
  ptr(w, 'pointerdown', s.x, s.y, 1);
  ptr(w, 'pointerup', s.x, s.y, 0);
};
const hoverAt = (w: View, p: readonly number[], dx = 0): void => {
  const s = at(w, p);
  ptr(w, 'pointermove', s.x + dx, s.y, 0);
  w.v.renderNow();
};
const screenGap = (w: View, p: readonly number[], q: readonly number[]): number => {
  const a = at(w, p), b = at(w, q);
  return Math.hypot(a.x - b.x, a.y - b.y);
};
const onCircle = (k: Circle, p: readonly number[], tol = 1e-9): boolean => Math.abs(dist(p, k.c) - k.r) <= tol && Math.abs(dot3(sub3(p, k.c), k.n)) <= tol;
const opens = (calls: readonly SnapRefineInput[]): SnapRefineInput[] => calls.filter((c) => c.open);

/** 원 위 발(첫 점 A의 지름 방향 — 20°) */
const footOf = (A: readonly number[]): V3 => radial(RING, A);

describe('Viewer3d: 열린 수직 발(refine이 있을 때)', () => {
  it('첫 점이 원 밖 멀리 있어 꺾은선 발이 토막 밖이어도 원 위 발을 붙잡고 거리가 정확하다', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    const got: { b: V3; distance: number; snapB?: string | null; directionB?: V3 }[] = [];
    v.onMeasure((m) => m && got.push(m));
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { perpendicular: true }, refine: exactApp(calls) });
    clickAt(w, F);
    const A = v.measurePoints[0]!.point;
    expect(v.measurePoints[0]!.snap).toBe('endpoint');
    const T = footOf(A);
    // 둘레 토막(0: 345°–15°, 1: 15°–45°)으로 내린 꺾은선 발은 모두 토막 밖(0.14.0에서는 후보가 없다)
    expect(perpendicularFoot(A, vtx(RING, 11), vtx(RING, 12), 1e-6)).toBeNull();
    expect(perpendicularFoot(A, vtx(RING, 0), vtx(RING, 1), 1e-6)).toBeNull();
    // 꼭짓점 15°가 붙잡기 거리 안이지만 발이 더 가깝다
    expect(screenGap(w, T, vtx(RING, 0))).toBeLessThan(10);
    hoverAt(w, T);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('perpendicular');
    expect(h.refined).toBe(true);
    expect(dist(h.point, T)).toBeLessThan(1e-12);
    expect(onCircle(RING, h.point)).toBe(true);
    expect(h.direction).toEqual(unitDir(A, h.point));
    expect(h.edge).toBeDefined();
    // 열린 후보: 두 토막 모두 발 쪽 끝(꼭짓점 15°)을 코어 점으로 넘기고, 같은 발은 하나만 남는다
    const oc = opens(calls).filter((c) => c.segment.id === '고리');
    expect(oc.map((c) => c.segment.raw).sort()).toEqual([0, 11]);
    const nOpen = opens(calls).length;
    for (const c of oc) {
      expect(c).toMatchObject({ kind: 'perpendicular', open: true, segment: { kind: 'line', id: '고리' } });
      expect(c.point).toEqual(vtx(RING, 0));
      expect(c.first).toEqual(A);
    }
    clickAt(w, T);
    const m = got.at(-1)!;
    expect(Math.abs(m.distance - (dist(A, RING.c) - RING.r))).toBeLessThan(1e-9);
    expect(m.snapB).toBe('perpendicular');
    expect(m.directionB).toEqual(unitDir(A, m.b));
    expect(v.measurePoints[1]).toMatchObject({ snap: 'perpendicular', refined: true });
    // 같은 자리 미리 보기 뒤 누르기는 기억으로(열린 후보 앱 함수를 다시 부르지 않는다)
    expect(opens(calls)).toHaveLength(nOpen);
  });

  it('refine이 null이면 열린 후보가 없고, refine 없는 뷰어와 미리 보기·찍은 값이 같다', () => {
    const targets = (A: readonly number[]): V3[] => [footOf(A), lerp(vtx(RING, 0), vtx(RING, 1), 0.3), X, lerp(vtx(RING, 1), vtx(RING, 2), 0.5), [-25.98, 15, 0], vtx(RING, 4)];
    const run = (refine: ((i: SnapRefineInput) => unknown) | null): unknown[] => {
      const w = view();
      const { v } = w;
      const out: unknown[] = [];
      v.onMeasure((m) => out.push(m));
      v.setMeasureMode(true);
      v.setMeasureSnap({ midpoints: true, inference: { perpendicular: true, intersections: true, axes: true }, ...(refine ? { refine: refine as never } : {}) });
      for (const t of [null, ...targets(f32(F))]) {
        if (!t) {
          clickAt(w, F);
          out.push(v.measurePoints);
          continue;
        }
        hoverAt(w, t);
        out.push(v.measureHoverSnap);
        clickAt(w, t);
        out.push(v.measurePoints);
        v.clearMeasure();
        clickAt(w, F);
      }
      return out;
    };
    const plain = run(null);
    expect(JSON.stringify(plain)).not.toContain('"refined"');
    const calls: SnapRefineInput[] = [];
    expect(run((i) => (calls.push(i), null))).toEqual(plain);
    expect(opens(calls).length).toBeGreaterThan(0);
    expect(run(() => [NaN, 0, 0])).toEqual(plain);
    // 코어 점 그대로 돌려주면(앱이 모른다) 열린 후보가 아니다 — 0.14.0 종류만 refined
    const same = run((i) => (i.open ? i.point : null));
    expect(same).toEqual(plain);
  });

  it('커서에서 붙잡기 거리 밖이면 버린다(발에서 먼 토막·원의 맞은쪽을 돌려줌)', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { perpendicular: true }, refine: exactApp(calls) });
    clickAt(w, F);
    const A = v.measurePoints[0]!.point;
    // 토막 2(75°–105°) 가운데: 원 위 발(20°)은 화면에서 멀다
    const far = lerp(vtx(RING, 2), vtx(RING, 3), 0.5);
    expect(screenGap(w, far, footOf(A))).toBeGreaterThan(30);
    hoverAt(w, far);
    expect(v.measureHoverSnap!.snap).toBeNull();
    expect(opens(calls).length).toBeGreaterThan(0);
    // 맞은쪽 점을 돌려주는 앱
    v.setMeasureSnap({ inference: { perpendicular: true }, refine: (i) => (i.open ? [-i.point[0], -i.point[1], i.point[2]] : null) });
    hoverAt(w, footOf(A));
    expect(v.measureHoverSnap!.snap).not.toBe('perpendicular');
  });

  it('호출 한도와 기억: 미리 보기 한 번에 새로 부르는 열린 후보는 OPEN_REFINE_CALLS번까지, 같은 둘레에서는 다시 부르지 않는다', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { perpendicular: true }, refine: exactApp(calls) });
    clickAt(w, F);
    // 촘촘한 원 가운데: 커서 둘레 토막이 많다(24개까지)
    const counts: number[] = [];
    for (let k = 0; k < 6; k++) {
      const n = opens(calls).length;
      hoverAt(w, DENSE.c);
      counts.push(opens(calls).length - n);
    }
    expect(counts[0]).toBe(OPEN_REFINE_CALLS);
    expect(Math.max(...counts)).toBeLessThanOrEqual(OPEN_REFINE_CALLS);
    expect(counts.at(-1)).toBe(0);
    const total = opens(calls).length;
    expect(total).toBeLessThanOrEqual(24);
    // 같은 열쇠는 한 번만
    expect(new Set(opens(calls).map((c) => openRefineKey(c))).size).toBe(total);
  });

  it('잠금 중에는 부르지 않는다. 풀면 다시', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { perpendicular: true, axes: true, lock: true }, refine: exactApp(calls) });
    clickAt(w, F);
    const T = footOf(v.measurePoints[0]!.point);
    expect(v.setMeasureInferenceLock('y')).toBe(true);
    hoverAt(w, T);
    expect(v.measureHoverSnap!.locked).toBe(true);
    expect(calls).toHaveLength(0);
    v.setMeasureInferenceLock(false);
    hoverAt(w, T);
    expect(v.measureHoverSnap!.snap).toBe('perpendicular');
    expect(opens(calls).length).toBeGreaterThan(0);
  });
});

describe('Viewer3d: 교차점 다듬기', () => {
  it('원과 곧은 선분(같은 평면 — 꺾은선 교차점): 앱이 준 정확한 교차점, 식별자는 두 선분', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { intersections: true }, refine: exactApp(calls) });
    const core = segmentIntersection(vtx(RING, 0), vtx(RING, 1), f32(LINE[0]), f32(LINE[1]), 1e-6)!;
    expect(core).not.toBeNull();
    const exact: V3 = [Math.sqrt(900 - 225), 15, 0];
    expect(dist(core, exact)).toBeGreaterThan(0.5);
    hoverAt(w, core);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('intersection');
    expect(h.refined).toBe(true);
    expect(dist(h.point, exact)).toBeLessThan(1e-9);
    const c = calls.at(-1)!;
    expect(c.kind).toBe('intersection');
    expect('open' in c).toBe(false);
    expect([c.segment.id, c.other!.id].sort()).toEqual(['가로선', '고리']);
    const ring = c.segment.id === '고리' ? c.segment : c.other!;
    const line = c.segment.id === '고리' ? c.other! : c.segment;
    expect(ring).toMatchObject({ kind: 'line', index: 100, raw: 0 });
    expect(line).toMatchObject({ kind: 'line', index: 7, raw: 0 });
    expect(dist(c.point, core)).toBeLessThan(1e-9);
    // null이면 꺾은선 교차점 그대로(0.14.0과 같다)
    v.setMeasureSnap({ inference: { intersections: true }, refine: () => null });
    hoverAt(w, core);
    const g = v.measureHoverSnap!;
    expect(g.snap).toBe('intersection');
    expect('refined' in g).toBe(false);
    expect(dist(g.point, core)).toBeLessThan(1e-9);
  });

  it('두 원(다른 평면 — 꺾은선끼리 비켜 지나감): 넓힌 교차를 앱이 다듬은 점으로만 붙잡는다', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { intersections: true }, refine: exactApp(calls) });
    // 고리 토막 11(345°–15°)과 세로 원 토막 11은 3D로 만나지 않는다(현의 처짐만큼 떨어져 지나간다)
    expect(segmentIntersection(vtx(RING, 11), vtx(RING, 12), vtx(UPRIGHT, 11), vtx(UPRIGHT, 12), 0.05)).toBeNull();
    hoverAt(w, X);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('intersection');
    expect(h.refined).toBe(true);
    expect(dist(h.point, X)).toBeLessThan(1e-9);
    expect(onCircle(RING, h.point) && onCircle(UPRIGHT, h.point)).toBe(true);
    const oc = opens(calls).filter((c) => c.kind === 'intersection');
    expect(oc.length).toBeGreaterThan(0);
    expect([oc[0]!.segment.id, oc[0]!.other!.id].sort()).toEqual(['고리', '세로 원']);
    // refine이 null이면 그 자리에 교차점이 없다(refine 없는 뷰어와 같다)
    v.setMeasureSnap({ inference: { intersections: true } });
    hoverAt(w, X);
    const plain = v.measureHoverSnap;
    expect(plain?.snap).not.toBe('intersection');
    v.setMeasureSnap({ inference: { intersections: true }, refine: () => null });
    hoverAt(w, X);
    expect(v.measureHoverSnap).toEqual(plain);
    // 찍으면 정확한 교차점(거리도)
    v.setMeasureSnap({ inference: { intersections: true }, refine: exactApp(calls) });
    v.clearMeasure();
    clickAt(w, F);
    clickAt(w, X);
    expect(v.measurePoints[1]).toMatchObject({ snap: 'intersection', refined: true });
    expect(dist(v.measurePoints[1]!.point, X)).toBeLessThan(1e-12);
    expect(Math.abs(v.measurement()!.distance - dist(v.measurePoints[0]!.point, X))).toBeLessThan(1e-12);
  });
});
