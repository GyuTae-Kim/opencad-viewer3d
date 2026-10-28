/**
 * 0.14.0 측정 붙잡기 다듬기(MeasureSnapOptions.refine).
 * - 순수 함수: 무엇을 넘길지(refineTarget), 돌려받은 값(finitePoint·acceptRefined), 같은 입력(sameRefineInput),
 *   커서 둘레 선분의 종류·번호(segmentsNear)와 수직 발 후보의 선분 식별자(inferenceCandidates)
 * - 뷰어: 12토막 원 꺾은선(선분 묶음)과 12토막 원판 윤곽선(그물)에 앱이 정확한 원 위로 다듬는 가짜 함수를 주고,
 *   수직 발·모서리 위 점·가운데 점이 원 위에 오는지, 거리 값이 정확한지, null이면 그대로인지, 멀면 버리는지, 잠금 중에는 부르지 않는지 본다.
 * 가짜 DOM·가짜 WebGL2로 만든 뷰어에 실제 포인터 사건을 넣는다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { buildBvh } from '../src/bvh';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { inferenceCandidates, perpendicularFoot, unitDir } from '../src/inference';
import { segmentsNear } from '../src/scenepick';
import { type MeasureSnapPick, type SnapRefineInput, acceptRefined, finitePoint, refineTarget, sameRefineInput } from '../src/snap';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { LineSet3d, Mesh3d, Pick3d, Scene3d } from '../src/types';

// ───────────── 순수 함수 ─────────────
const iso = dirToAngles([1, -1, 0.8]);
const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });

describe('refineTarget(다듬을 후보)', () => {
  const ends: [V3, V3] = [
    [0, 0, 0],
    [10, 0, 0],
  ];
  const snap: V3 = [4, 0, 0];
  const pick: Pick3d = { kind: 'line', id: 'nc', index: 42, raw: 7, point: snap };
  const base = { snap, snapKind: null, pick, ends };

  it('붙잡지 않은 선분 위 점: onEdge와 고른 선분(식별자는 Pick3d 그대로, 끝점은 복사본)', () => {
    const t = refineTarget({ p: snap, vertex: false, kind: null }, base)!;
    expect(t).toEqual({ kind: 'onEdge', segment: { kind: 'line', id: 'nc', index: 42, raw: 7, ends } });
    expect(t.segment.ends[0]).not.toBe(ends[0]);
    // 윤곽선, raw가 없으면 index
    const e = refineTarget({ p: snap, vertex: false, kind: null }, { ...base, pick: { kind: 'edge', id: '판', index: 3, point: snap } })!;
    expect(e.segment).toEqual({ kind: 'edge', id: '판', index: 3, raw: 3, ends });
  });

  it('고르기가 붙잡은 선분 가운데 점은 midpoint, 앱 점이 이긴 가운데 점(다른 객체)·끝점·그물 면·교차점은 넘기지 않는다', () => {
    const mid: V3 = [5, 0, 0];
    const b = { ...base, snap: mid, snapKind: 'midpoint' as const };
    expect(refineTarget({ p: mid, vertex: true, kind: 'midpoint' }, b)!.kind).toBe('midpoint');
    expect(refineTarget({ p: [5, 0, 0], vertex: true, kind: 'midpoint' }, b)).toBeNull();
    const end: V3 = [0, 0, 0];
    expect(refineTarget({ p: end, vertex: true, kind: 'endpoint' }, { ...base, snap: end, snapKind: 'endpoint' })).toBeNull();
    const face: Pick3d = { kind: 'mesh', id: '상자', index: 0, point: snap, normal: [0, 0, 1] };
    expect(refineTarget({ p: snap, vertex: false, kind: null }, { snap, snapKind: null, pick: face })).toBeNull();
    expect(refineTarget({ p: [1, 1, 0], vertex: true, kind: 'intersection' }, base)).toBeNull();
    expect(refineTarget(null, base)).toBeNull();
    expect(refineTarget({ p: snap, vertex: false, kind: null }, null)).toBeNull();
    // 선분 끝점을 모르면(점 묶음 등) 넘기지 않는다
    expect(refineTarget({ p: snap, vertex: false, kind: null }, { snap, snapKind: null, pick })).toBeNull();
  });

  it('수직 발: 선분 식별자가 실린 후보만(앱이 준 수직 발 종류의 점은 아니다)', () => {
    const seg = { kind: 'line' as const, id: 'nc', index: 42, raw: 7, ends };
    const r: MeasureSnapPick = { p: [3, 0, 0], vertex: true, kind: 'perpendicular', edge: ends, seg };
    expect(refineTarget(r, null)).toEqual({ kind: 'perpendicular', segment: seg });
    expect(refineTarget(r, null)!.segment).not.toBe(seg);
    expect(refineTarget({ p: [3, 0, 0], vertex: true, kind: 'perpendicular' }, base)).toBeNull();
  });
});

describe('finitePoint·acceptRefined(돌려받은 점 받기)', () => {
  it('수 셋이 유한한 배열·형식 배열만(복사본)', () => {
    const a = [1, 2, 3];
    expect(finitePoint(a)).toEqual([1, 2, 3]);
    expect(finitePoint(a)).not.toBe(a);
    expect(finitePoint(new Float64Array([1, 2, 3, 4]))).toEqual([1, 2, 3]);
    for (const bad of [null, undefined, 3, 'abc', [1, 2], [1, NaN, 3], [1, Infinity, 3], { 0: 1, 1: 2 }, ['1', '2', '3']]) expect(finitePoint(bad)).toBeNull();
  });

  it('코어 점에서 화면 거리가 한도 안일 때만, 눈 뒤는 버린다', () => {
    const core: V3 = [10, 5, 3];
    const s = projectToScreen(f, core)!;
    // 화면에서 오른쪽으로 n화소쯤 떨어진 세계 점: 같은 깊이에서 화면 x만 옮긴다
    const shifted = (px: number): V3 => {
      const q: V3 = [core[0] + f.basis.right[0] * px * 0.01, core[1] + f.basis.right[1] * px * 0.01, core[2] + f.basis.right[2] * px * 0.01];
      return q;
    };
    let near = shifted(1);
    const d1 = Math.hypot(projectToScreen(f, near)![0] - s[0], projectToScreen(f, near)![1] - s[1]);
    // 한도를 그 거리 바로 위·아래로
    expect(acceptRefined(f, core, near, d1 + 1e-6)).toBe(true);
    expect(acceptRefined(f, core, near, d1 - 1e-6)).toBe(false);
    near = core;
    expect(acceptRefined(f, core, near, 0)).toBe(true);
    // 눈 뒤
    const behind: V3 = [f.eye[0] - f.basis.back[0] * -50, f.eye[1] - f.basis.back[1] * -50, f.eye[2] - f.basis.back[2] * -50];
    expect(acceptRefined(f, core, behind, 1e9)).toBe(false);
  });

  it('sameRefineInput: 종류·점·선분·첫 점·광선이 모두 같을 때만', () => {
    const a: SnapRefineInput = {
      kind: 'onEdge',
      point: [1, 2, 3],
      segment: { kind: 'line', id: 's', index: 9, raw: 2, ends: [[0, 0, 0], [5, 0, 0]] },
      first: null,
      ray: { origin: [0, 0, 100], dir: [0, 0, -1] },
    };
    const copy = (): SnapRefineInput => JSON.parse(JSON.stringify(a));
    expect(sameRefineInput(a, copy())).toBe(true);
    const variants: ((x: SnapRefineInput) => void)[] = [
      (x) => (x.kind = 'midpoint'),
      (x) => (x.point[2] = 3 + 1e-12),
      (x) => (x.segment.kind = 'edge'),
      (x) => (x.segment.id = 't'),
      (x) => (x.segment.index = 10),
      (x) => (x.segment.raw = 3),
      (x) => (x.segment.ends[1][0] = 6),
      (x) => (x.first = [0, 0, 0]),
      (x) => (x.ray.origin[0] = 1e-9),
      (x) => (x.ray.dir = [0, 1e-9, -1]),
    ];
    for (const change of variants) {
      const b = copy();
      change(b);
      expect(sameRefineInput(a, b)).toBe(false);
    }
  });
});

describe('segmentsNear·inferenceCandidates: 선분 종류와 번호', () => {
  const bvhs = new Map<Float32Array, ReturnType<typeof buildBvh>>();
  const bvh = (kind: 'triangle' | 'segment' | 'point', positions: Float32Array, indices?: Uint32Array) => {
    let b = bvhs.get(positions);
    if (!b) bvhs.set(positions, (b = buildBvh(kind, positions, indices)));
    return b;
  };
  it('선분 묶음은 segmentIds를 거친 index와 배열 번호 raw, 윤곽선은 Mesh3d.edges 번호. 수직 발 후보에 선분 식별자가 실린다', () => {
    const line: LineSet3d = { id: 'l', positions: new Float32Array([-20, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0]), segmentIds: new Uint32Array([500, 501]) };
    const s = projectToScreen(f, [10, 0, 0])!;
    const segs = segmentsNear(f, s[0], s[1], { meshes: [], lines: [line], points: [] }, { bvh }, 10);
    expect(segs[0]).toMatchObject({ id: 'l', kind: 'line', index: 501, raw: 1 });
    const c = inferenceCandidates([{ ...segs[0]!, wpp: 0.01 }], [10, 30, 0], { intersections: false, perpendicular: true });
    expect(c).toHaveLength(1);
    expect(c[0]!.seg).toEqual({ kind: 'line', id: 'l', index: 501, raw: 1, ends: [segs[0]!.a, segs[0]!.b] });
    // 번호 없는 선분(0.13.0 꼴 입력)은 seg 없이 예전 그대로
    const old = inferenceCandidates([{ a: segs[0]!.a, b: segs[0]!.b, id: 'l', wpp: 0.01 }], [10, 30, 0], { intersections: false, perpendicular: true });
    expect('seg' in old[0]!).toBe(false);
    const m: Mesh3d = {
      id: 'm',
      // 범위(positions)가 윤곽선을 덮게
      positions: new Float32Array([-30, 0, 0, 20, 0, 0, -30, 40, 0]),
      indices: new Uint32Array([0, 1, 2]),
      color: [1, 1, 1, 1],
      edges: new Float32Array([-30, 20, 0, -30, 40, 0, -20, 0, 0, 20, 0, 0]),
    };
    const e = segmentsNear(f, s[0], s[1], { meshes: [m], lines: [], points: [] }, { bvh, edges: true }, 10);
    expect(e[0]).toMatchObject({ id: 'm', kind: 'edge', index: 1, raw: 1 });
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
/** 원(중심 c, 반지름 r, xy 평면)의 각 a(도) 자리 */
const onCircle = (c: readonly number[], r: number, a: number): V3 => [c[0]! + r * Math.cos(a * deg), c[1]! + r * Math.sin(a * deg), c[2]!];
const f32 = (p: readonly number[]): V3 => [Math.fround(p[0]!), Math.fround(p[1]!), Math.fround(p[2]!)];

/** 선분 묶음 '원': 중심 C, 반지름 30, 12토막(꼭짓점 30°마다), 원본 번호 100 + k */
const C: V3 = [0, 0, 0];
const RC = 30;
const N = 12;
const ring: LineSet3d = {
  id: '원',
  positions: new Float32Array(Array.from({ length: N }, (_, k) => [...onCircle(C, RC, k * 30), ...onCircle(C, RC, (k + 1) * 30)]).flat()),
  segmentIds: new Uint32Array(Array.from({ length: N }, (_, k) => 100 + k)),
};
/** 원 밖 40° 방향 80 mm 자리에서 시작하는 곧은 선분(첫 점 — 수직 발의 기준) */
const P0 = onCircle(C, 80, 40);
const straight: LineSet3d = { id: '직선', positions: new Float32Array([...P0, P0[0] + 25, P0[1] + 10, 0]) };
/** 그물 '원판': 중심 D, 반지름 25, 12토막 부채꼴(꼭짓점 15° + 30°·k), 윤곽선 = 둘레 */
const D: V3 = [-100, 0, 0];
const RD = 25;
const diskPts = Array.from({ length: N }, (_, k) => onCircle(D, RD, 15 + k * 30));
const disk: Mesh3d = {
  id: '원판',
  positions: new Float32Array([...D, ...diskPts.flat()]),
  indices: new Uint32Array(Array.from({ length: N }, (_, k) => [0, 1 + k, 1 + ((k + 1) % N)]).flat()),
  color: [0.7, 0.7, 0.7, 1],
  edges: new Float32Array(Array.from({ length: N }, (_, k) => [...diskPts[k]!, ...diskPts[(k + 1) % N]!]).flat()),
};
const scene: Scene3d = { name: 't', units: 'mm', meshes: [disk], lines: [ring, straight], points: [] };

/** 앱이 아는 정확한 원(묶음 id → 중심·반지름) */
const CIRCLES: Record<string, { c: V3; r: number }> = { 원: { c: C, r: RC }, 원판: { c: D, r: RD } };
const radial = (c: readonly number[], r: number, p: readonly number[]): V3 => {
  const dx = p[0]! - c[0]!, dy = p[1]! - c[1]!, l = Math.hypot(dx, dy);
  return [c[0]! + (r * dx) / l, c[1]! + (r * dy) / l, c[2]!];
};
/** 정확한 원 위로 다듬는 가짜 앱 함수(부른 입력을 모은다). 원이 아닌 묶음은 null */
function exactCircle(calls: SnapRefineInput[]): (i: SnapRefineInput) => V3 | null {
  return (i) => {
    calls.push(i);
    const k = CIRCLES[i.segment.id];
    if (!k) return null;
    if (i.kind === 'onEdge') {
      // 커서 광선과 원 평면(z = 중심 z)의 만남을 원 위로
      const o = i.ray.origin, d = i.ray.dir;
      const t = (k.c[2] - o[2]) / d[2];
      return radial(k.c, k.r, [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]);
    }
    if (i.kind === 'midpoint') {
      const [a, b] = i.segment.ends;
      return radial(k.c, k.r, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    }
    // 수직 발: 첫 점에서 원으로 내린 수직선의 발은 지름 위 두 점 — 코어 점에 가까운 것
    const q = radial(k.c, k.r, i.first!);
    const q2: V3 = [2 * k.c[0] - q[0], 2 * k.c[1] - q[1], q[2]];
    return Math.hypot(q[0] - i.point[0], q[1] - i.point[1]) <= Math.hypot(q2[0] - i.point[0], q2[1] - i.point[1]) ? q : q2;
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
const hoverAt = (w: View, p: readonly number[]): void => {
  const s = at(w, p);
  ptr(w, 'pointermove', s.x, s.y, 0);
  w.v.renderNow();
};
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
/** 원 위인지: 중심에서 반지름(평면 위) */
const onRing = (p: readonly number[], k: { c: V3; r: number }, tol = 1e-9): boolean => Math.abs(dist(p, k.c) - k.r) <= tol && Math.abs(p[2]! - k.c[2]) <= tol;
/** float32 꺾은선 꼭짓점 */
const ringV = (k: number): V3 => f32(onCircle(C, RC, k * 30));
const lerp = (a: readonly number[], b: readonly number[], t: number): V3 => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
/** 화면에서 p가 두 끝점과 붙잡기 거리(10화소)보다 넉넉히 먼지 — 끝점에 붙잡히지 않는 자리인지 */
const farFromEnds = (w: View, p: readonly number[], a: readonly number[], b: readonly number[]): void => {
  const s = at(w, p);
  for (const e of [a, b]) {
    const q = at(w, e);
    expect(Math.hypot(q.x - s.x, q.y - s.y)).toBeGreaterThan(12);
  }
};

describe('Viewer3d: 측정 붙잡기 다듬기(refine)', () => {
  it('모서리 위 점(onEdge): 원 꺾은선 토막 위 점이 정확한 원 위로, 식별자는 고르기와 같다', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    v.setMeasureMode(true);
    v.setMeasureSnap({ refine: exactCircle(calls) });
    // 토막 1(30°–60°)의 가운데 — 끝점에서 붙잡기 거리(10화소)보다 멀다(가운데 점 붙잡기는 켜지 않았다)
    const pc = lerp(ringV(1), ringV(2), 0.5);
    farFromEnds(w, pc, ringV(1), ringV(2));
    hoverAt(w, pc);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBeNull();
    expect(h.refined).toBe(true);
    expect(onRing(h.point, CIRCLES.원!)).toBe(true);
    // 꺾은선과 원 사이(현의 처짐 ≤ 30·(1 − cos 15°) ≈ 1.02 mm)만큼 옮겼다
    expect(dist(h.point, pc)).toBeGreaterThan(0.3);
    expect(dist(h.point, pc)).toBeLessThan(1.05);
    const c = calls.at(-1)!;
    expect(c.kind).toBe('onEdge');
    expect(c.segment).toMatchObject({ kind: 'line', id: '원', index: 101, raw: 1 });
    expect(c.segment.ends).toEqual([ringV(1), ringV(2)]);
    expect(c.first).toBeNull();
    expect(dist(c.point, pc)).toBeLessThan(0.05);
    expect(Math.hypot(...c.ray.dir)).toBeCloseTo(1, 12);
    // 같은 자리를 누르면 앱 함수를 다시 부르지 않고 미리 본 점 그대로 찍는다
    const n = calls.length;
    clickAt(w, pc);
    expect(calls.length).toBe(n);
    expect(v.measurePoints).toEqual([{ point: h.point, snap: null, refined: true }]);
  });

  it('가운데 점(midpoints): 토막 현의 가운데가 그 토막 호의 가운데로. 곧은 선분은 앱이 null이라 그대로', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true, refine: exactCircle(calls) });
    hoverAt(w, lerp(ringV(3), ringV(4), 0.5));
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('midpoint');
    expect(h.refined).toBe(true);
    const want = onCircle(C, RC, 105);
    expect(dist(h.point, want)).toBeLessThan(1e-5);
    expect(calls.at(-1)).toMatchObject({ kind: 'midpoint', segment: { id: '원', index: 103, raw: 3 } });
    // 곧은 선분 가운데: 앱이 null → 코어 점, refined 없음
    const sm = lerp(f32(P0), f32([P0[0] + 25, P0[1] + 10, 0]), 0.5);
    hoverAt(w, sm);
    const g = v.measureHoverSnap!;
    expect(g.snap).toBe('midpoint');
    expect('refined' in g).toBe(false);
    expect(dist(g.point, sm)).toBeLessThan(1e-9);
    expect(calls.at(-1)!.segment.id).toBe('직선');
  });

  it('수직 발: 첫 점에서 원으로 내린 발이 원 위에 오고 거리 값이 정확하다(꺾은선 발과 견줘)', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    const got: { b: V3; distance: number; snapB?: string | null; directionB?: V3 }[] = [];
    v.onMeasure((m) => m && got.push(m));
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { perpendicular: true }, refine: exactCircle(calls) });
    // 첫 점: 곧은 선분 끝(원 밖 40° 방향 80 mm)
    clickAt(w, P0);
    const first = v.measurePoints[0]!;
    expect(first.snap).toBe('endpoint');
    const A = first.point;
    // 코어 수직 발: 첫 점에서 토막 1(30°–60°)로 내린 발
    const foot = perpendicularFoot(A, ringV(1), ringV(2), 1e-6)!;
    expect(foot).not.toBeNull();
    hoverAt(w, foot);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('perpendicular');
    expect(h.refined).toBe(true);
    expect(onRing(h.point, CIRCLES.원!)).toBe(true);
    // 원 위 발은 첫 점의 지름 방향(40°)
    expect(dist(h.point, radial(C, RC, A))).toBeLessThan(1e-12);
    expect(h.direction).toEqual(unitDir(A, h.point));
    const c = calls.at(-1)!;
    expect(c).toMatchObject({ kind: 'perpendicular', segment: { kind: 'line', id: '원', index: 101, raw: 1 } });
    expect(c.first).toEqual(A);
    expect(dist(c.point, foot)).toBeLessThan(1e-9);
    clickAt(w, foot);
    const m = got.at(-1)!;
    // 정확한 값: 첫 점에서 원까지 = |A − C| − R(같은 평면)
    expect(Math.abs(m.distance - (dist(A, C) - RC))).toBeLessThan(1e-9);
    // 꺾은선 발까지의 거리는 현의 처짐만큼 길다
    expect(dist(A, foot) - m.distance).toBeGreaterThan(0.5);
    expect(m.snapB).toBe('perpendicular');
    expect(m.directionB).toEqual(unitDir(A, m.b));
    expect(v.measurePoints[1]).toMatchObject({ snap: 'perpendicular', refined: true });
  });

  it('그물 윤곽선(edges): 원판 둘레 토막 위 점, 식별자는 윤곽선 번호', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    v.setMeasureMode(true);
    v.setMeasureSnap({ edges: true, refine: exactCircle(calls) });
    const pc = lerp(f32(diskPts[4]!), f32(diskPts[5]!), 0.5);
    farFromEnds(w, pc, f32(diskPts[4]!), f32(diskPts[5]!));
    hoverAt(w, pc);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBeNull();
    expect(h.refined).toBe(true);
    expect(onRing(h.point, CIRCLES.원판!, 1e-6)).toBe(true);
    expect(calls.at(-1)!.segment).toMatchObject({ kind: 'edge', id: '원판', index: 4, raw: 4 });
  });

  it('null·수가 아닌 값이면 코어 점 그대로, refine 없는 뷰어와 미리 보기·찍은 값이 같다', () => {
    const targets = [
      lerp(ringV(1), ringV(2), 0.3),
      lerp(ringV(1), ringV(2), 0.42),
      lerp(ringV(3), ringV(4), 0.5),
      lerp(ringV(7), ringV(8), 0.8),
      f32(P0),
      lerp(f32(diskPts[4]!), f32(diskPts[5]!), 0.5),
      lerp(f32(diskPts[6]!), f32(diskPts[7]!), 0.58),
    ];
    const run = (refine: ((i: SnapRefineInput) => unknown) | null): unknown[] => {
      const w = view();
      const { v } = w;
      const out: unknown[] = [];
      v.onMeasure((m) => out.push(m));
      v.setMeasureMode(true);
      v.setMeasureSnap({ midpoints: true, edges: true, inference: { perpendicular: true, intersections: true }, ...(refine ? { refine: refine as never } : {}) });
      for (const t of targets) {
        hoverAt(w, t);
        out.push(v.measureHoverSnap);
        clickAt(w, t);
        out.push(v.measurePoints);
      }
      return out;
    };
    const plain = run(null);
    expect(run(() => null)).toEqual(plain);
    expect(run(() => undefined)).toEqual(plain);
    expect(run(() => [NaN, 0, 0])).toEqual(plain);
    expect(run(() => [1, 2])).toEqual(plain);
    expect(run(() => 'abc')).toEqual(plain);
  });

  it('안전장치: 코어 점에서 화면 붙잡기 거리를 넘는 점, 그 묶음 단면에 잘린 점은 버린다', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    const pc = lerp(ringV(1), ringV(2), 0.5);
    farFromEnds(w, pc, ringV(1), ringV(2));
    // 원의 맞은쪽(60 mm — 화면 수십 화소)
    v.setMeasureSnap({ refine: (i) => [2 * C[0] - i.point[0], 2 * C[1] - i.point[1], i.point[2]] });
    hoverAt(w, pc);
    let h = v.measureHoverSnap!;
    expect('refined' in h).toBe(false);
    expect(dist(h.point, pc)).toBeLessThan(0.05);
    // 코어 점에서 아주 조금(화면 1화소 안): 받는다
    v.setMeasureSnap({ refine: (i) => [i.point[0] + 0.01, i.point[1], i.point[2]] });
    hoverAt(w, pc);
    h = v.measureHoverSnap!;
    expect(h.refined).toBe(true);
    // 단면: 다듬은 점(원 위 — 지름 바깥쪽)만 잘리는 평면
    const calls: SnapRefineInput[] = [];
    v.setMeasureSnap({ refine: exactCircle(calls) });
    hoverAt(w, pc);
    const q = v.measureHoverSnap!.point;
    const core = calls.at(-1)!.point;
    const u = unitDir(C, q)!;
    const dot = (p: readonly number[]): number => p[0]! * u[0] + p[1]! * u[1] + p[2]! * u[2];
    v.setSection({ normal: u, offset: (dot(core) + dot(q)) / 2 });
    hoverAt(w, pc);
    h = v.measureHoverSnap!;
    expect('refined' in h).toBe(false);
    expect(dist(h.point, core)).toBeLessThan(1e-9);
  });

  it('잠금 중에는 부르지 않고 잠근 선 위 점이 먼저다. 풀면 다시 다듬는다', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true, inference: { perpendicular: true, axes: true, lock: true }, refine: exactCircle(calls) });
    clickAt(w, P0);
    const pc = lerp(ringV(3), ringV(4), 0.5);
    farFromEnds(w, pc, ringV(3), ringV(4));
    hoverAt(w, pc);
    expect(v.measureHoverSnap!.refined).toBe(true);
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    const n = calls.length;
    hoverAt(w, lerp(ringV(3), ringV(4), 0.45));
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.snap).toBe('axis');
    expect('refined' in h).toBe(false);
    // 첫 점을 지나는 X 방향 선 위
    expect(Math.abs(h.point[1] - v.measurePoints[0]!.point[1])).toBeLessThan(1e-9);
    expect(calls.length).toBe(n);
    v.setMeasureInferenceLock(false);
    hoverAt(w, lerp(ringV(3), ringV(4), 0.55));
    expect(v.measureHoverSnap!.refined).toBe(true);
    expect(calls.length).toBe(n + 1);
  });

  it('refine만 줘도 붙잡기가 켜지고(measureSnap에 실린다), 다른 종류(끝점·면 위)는 넘기지 않는다', () => {
    const w = view();
    const { v } = w;
    const calls: SnapRefineInput[] = [];
    const refine = exactCircle(calls);
    v.setMeasureMode(true);
    v.setMeasureSnap({ refine });
    expect(v.measureSnap).toEqual({ refine });
    // 끝점(꼭짓점은 원 위다)
    hoverAt(w, ringV(5));
    expect(v.measureHoverSnap!.snap).toBe('endpoint');
    // 원판 면 위(윤곽선을 고르지 않는다 — 면)
    hoverAt(w, [-100, 5, 0]);
    expect(v.measureHoverSnap!.snap).toBeNull();
    expect(calls).toHaveLength(0);
    // refine 없이 주면 measureSnap에 열쇠가 없다
    v.setMeasureSnap({ midpoints: true, refine: null });
    expect(v.measureSnap).toEqual({ midpoints: true });
  });
});
