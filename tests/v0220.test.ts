/**
 * 0.22.0 면의 열린 교차(refineFace — 'axisFace', open: track.ts openFaceCandidates·openFaceSnap, scenepick.ts trianglesNear),
 * 한 토막 활꼴의 두 교차(refine — 'axisEdge', open: openEdgeCandidates의 둘째 힌트 twin), 누르기 알림의 그물 면만 고르기(onPick meshesOnly).
 * - 순수 함수: 활꼴을 두 번 지나는 선(나란하지 않은·나란한)의 둘째 힌트와 두 교차, 둘째 힌트를 두지 않는 때(다른 평면·끝 둘레만·곡선 안쪽),
 *   구를 스치는 축과 삼각형의 열린 교차(무게중심 쪽 힌트·두 근·받기·버리기·빼는 것), trianglesNear(거리·숨김·단면·행렬·개수)
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 첫 점 Z축·잠근 Z축이 구를 스치는 자리, refineFace 없이·null이면 0.21.0과 같음, 기억·호출 한도,
 *   첫 점 X축이 원의 한 토막 활꼴을 두 번 지나는 두 교차, onPick의 meshesOnly
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, type ViewFrame, computeFrame, defaultCamera, dirToAngles, projectToScreen, viewDepth, worldPerPixel } from '../src/camera';
import { OPEN_REFINE_CALLS, type SnapRefineFaceInput, type SnapRefineInput } from '../src/snap';
import { OPEN_EDGE_CHORD, OPEN_FACE_CHORD, type TrackTriangle, axisFaceSnap, openEdgeCandidates, openEdgeSnap, openFaceCandidates, openFaceSnap } from '../src/track';
import { trianglesNear } from '../src/scenepick';
import { boxMesh, sphereMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Mesh3d, Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const deg = (a: number): number => (a * Math.PI) / 180;
const R = 30;
/** 원(중심 (0, 0, z), 반지름 30, z 평면)의 꼭짓점 — 15° + 30°·k. 토막 2(75°–105°)의 현은 X축과 나란하다(y = 30·sin75°) */
const vtx = (k: number, z = 0): V3 => [R * Math.cos(deg(15 + 30 * k)), R * Math.sin(deg(15 + 30 * k)), z];
/** 직선(o, d)과 그 원의 교차: 평면을 뚫으면 그 점(원 위일 때만), 평면 위 직선이면 point에 가까운 근(같으면 앞 근) */
function lineCircle(o: readonly number[], d: readonly number[], point: readonly number[], z = 0): V3 | null {
  if (Math.abs(d[2]!) > 1e-12) {
    const t = (z - o[2]!) / d[2]!;
    const p: V3 = [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t];
    return Math.abs(Math.hypot(p[0], p[1]) - R) < 1e-9 ? p : null;
  }
  if (Math.abs(o[2]! - z) > 1e-9) return null;
  const a = d[0]! * d[0]! + d[1]! * d[1]!, b = o[0]! * d[0]! + o[1]! * d[1]!, c = o[0]! * o[0]! + o[1]! * o[1]! - R * R;
  const disc = b * b - a * c;
  if (disc < 0) return null;
  const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]!]);
  return dist(ts[0]!, point) <= dist(ts[1]!, point) ? ts[0]! : ts[1]!;
}
/** 직선(o, d)과 구(중심 c, 반지름 r)의 교차 가운데 near에 가까운 근(같으면 앞 근, far면 먼 근) */
function lineSphere(o: readonly number[], d: readonly number[], c: readonly number[], r: number, near: readonly number[], far = false): V3 | null {
  const w = [o[0]! - c[0]!, o[1]! - c[1]!, o[2]! - c[2]!];
  const a = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!, b = w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!, k = w[0]! ** 2 + w[1]! ** 2 + w[2]! ** 2 - r * r;
  const disc = b * b - a * k;
  if (disc < 0) return null;
  const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t]);
  const i = dist(ts[0]!, near) <= dist(ts[1]!, near) ? 0 : 1;
  return ts[far ? 1 - i : i]!;
}

// ───────────── 순수 함수: 한 토막 활꼴의 두 교차 ─────────────
describe('openEdgeCandidates·openEdgeSnap: 한 토막 활꼴을 두 번 지나는 선의 둘째 힌트(0.22.0 twin)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 25, 0], distance: 90, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 50 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const seg = (a: V3, b: V3, keep?: (p: readonly number[]) => boolean) => ({ a, b, wpp: worldPerPixel(f, viewDepth(f, a)), keep });
  const ring = Array.from({ length: 12 }, (_, k) => seg(vtx(k), vtx(k + 1)));
  const S2 = ring[2]!;
  const SNAP = 10;
  const exact = (lines: readonly { from: readonly number[]; dir: readonly number[] }[]) => (c: { p: V3; line: number }) => lineCircle(lines[c.line]!.from, lines[c.line]!.dir, c.p);

  it('전제: 두 교차는 붙잡기 거리보다 멀리 떨어지고, 현 끝에서 붙잡기 거리보다 멀다(0.20.0 힌트 하나로는 하나만 — 그것도 힌트 둘레일 때만)', () => {
    const sag = R - R * Math.sin(deg(75));
    expect(sag).toBeLessThan(OPEN_EDGE_CHORD * dist(S2.a, S2.b));
    const lines = [{ from: [-50, 29.5, 0], dir: [1, 0, 0] }];
    const a = lineCircle(lines[0]!.from, lines[0]!.dir, [-1, 29.5, 0])!, b = lineCircle(lines[0]!.from, lines[0]!.dir, [1, 29.5, 0])!;
    const [ax, ay] = at(a), [bx, by] = at(b);
    expect(Math.hypot(ax - bx, ay - by)).toBeGreaterThan(2 * SNAP);
    const [ex, ey] = at(S2.a);
    expect(Math.hypot(bx - ex, by - ey)).toBeGreaterThan(SNAP);
  });

  it('나란한 선(현 y = 30·sin75°보다 조금 위 y = 29.5): 0.20.0 힌트(현 가운데의 발)에 두 끝의 발을 더하고, 커서 쪽 교차를 받는다', () => {
    const lines = [{ from: [-50, 29.5, 0], dir: [1, 0, 0] }];
    const plus: V3 = [Math.sqrt(R * R - 29.5 * 29.5), 29.5, 0];
    const minus: V3 = [-plus[0], 29.5, 0];
    for (const [Q, other] of [
      [plus, minus],
      [minus, plus],
    ] as const) {
      const [x, y] = at(Q);
      const cs = openEdgeCandidates(f, lines, ring, x + 1, y + 2, SNAP).filter((c) => c.seg === S2);
      expect(cs).toHaveLength(3);
      expect(cs.every((c) => c.twice)).toBe(true);
      const main = cs.filter((c) => !c.twin);
      expect(main.map((c) => c.p)).toEqual([[0, 29.5, 0]]);
      const twins = cs.filter((c) => c.twin).map((c) => c.p[0]).sort((p, q) => p - q);
      expect(twins[0]).toBeCloseTo(vtx(3)[0], 12);
      expect(twins[1]).toBeCloseTo(vtx(2)[0], 12);
      const asked: V3[] = [];
      const r = openEdgeSnap(f, lines, ring, x + 1, y + 2, SNAP, (c) => {
        asked.push(c.p);
        return exact(lines)(c);
      })!;
      expect(dist(r.p, Q)).toBeLessThan(1e-12);
      expect(r.p[1]).toBe(29.5);
      expect(r.p[2]).toBe(0);
      expect(r.seg).toBe(S2);
      // 가운데 힌트만이면(0.20.0) 앱은 같은 거리의 두 근 가운데 앞 근(−x 쪽)만 준다
      const only = openEdgeSnap(f, lines, ring, x + 1, y + 2, SNAP, (c) => (c.twin ? null : exact(lines)(c)));
      if (Q === plus) expect(only).toBeNull();
      else expect(dist(only!.p, minus)).toBeLessThan(1e-12);
      expect(dist(other, Q)).toBeGreaterThan(5);
    }
  });

  it('나란하지 않은 같은 평면 선: 가까운 끝의 발(0.20.0 자리)과 다른 끝의 발. 각 발에 가까운 교차가 따로 와서 두 교차 모두 붙는다', () => {
    const lines = [{ from: [-50, 29.2, 0], dir: [1, 0.01, 0] }];
    const L = lines[0]!;
    const near = lineCircle(L.from, L.dir, vtx(3))!, far = lineCircle(L.from, L.dir, vtx(2))!;
    expect(dist(near, far)).toBeGreaterThan(5);
    const [nx, ny] = at(near);
    const cs = openEdgeCandidates(f, lines, ring, nx + 1, ny + 2, SNAP).filter((c) => c.seg === S2);
    expect(cs).toHaveLength(2);
    // 기운 선이라 발은 꼭짓점 x에서 조금 비켜 있다(0.20.0 시험과 같은 자리)
    expect(cs.find((c) => !c.twin)!.p[0]).toBeCloseTo(vtx(3)[0], 1);
    expect(cs.find((c) => c.twin)!.p[0]).toBeCloseTo(vtx(2)[0], 1);
    for (const Q of [near, far]) {
      const [x, y] = at(Q);
      const r = openEdgeSnap(f, lines, ring, x + 1, y + 2, SNAP, exact(lines))!;
      expect(dist(r.p, Q)).toBeLessThan(1e-9);
      expect(r.seg).toBe(S2);
      expect(r.p[2]).toBe(0);
    }
  });

  it('둘째 힌트를 두지 않는 때: 다른 평면(엇갈린 선), 현 끝 둘레만 스치는 선(현 가운데에서 멀다), 곡선 안쪽을 지나는 선(이웃 토막으로 드러난다)', () => {
    // 원 평면보다 0.3 위(현의 직선과 엇갈린다) — 0.20.0 후보 하나, twice 없음
    const lifted = [{ from: [-50, 29.2, 0.3], dir: [1, 0.01, 0] }];
    const [x, y] = at(vtx(3));
    const a = openEdgeCandidates(f, lifted, ring, x + 1, y + 2, SNAP).filter((c) => c.seg === S2);
    expect(a).toHaveLength(1);
    expect(a[0]).not.toHaveProperty('twice');
    expect(a[0]).not.toHaveProperty('twin');
    expect(Object.keys(a[0]!).sort()).toEqual(['distPx', 'gap', 'line', 'p', 'seg']);
    // 토막 1(45°–75°)은 위 선이 75° 끝 둘레만 스친다(현 가운데에서는 활꼴 높이 한도보다 멀다)
    const flat = [{ from: [-50, 29.2, 0], dir: [1, 0.01, 0] }];
    const [x1, y1] = at(vtx(2));
    const b = openEdgeCandidates(f, flat, ring, x1 + 1, y1 + 2, SNAP).filter((c) => c.seg === ring[1]);
    expect(b.length).toBeLessThanOrEqual(1);
    expect(b.every((c) => !c.twice && !c.twin)).toBe(true);
    // 현 아래(원 안쪽)를 나란히 지나는 선: 짧은 이웃(105° 꼭짓점에서 안쪽으로 내려가는 — 선에 닿지 않는다)이 안쪽을 드러낸다
    const under = [{ from: [-50, 28.7, 0], dir: [1, 0, 0] }];
    const stub = seg(vtx(3), [vtx(3)[0] - 0.1, vtx(3)[1] - 0.15, 0]);
    const [ux, uy] = at([0, 28.7, 0]);
    const c = openEdgeCandidates(f, under, [S2, stub], ux + 1, uy + 2, SNAP).filter((q) => q.seg === S2);
    expect(c).toHaveLength(1);
    expect(c[0]).not.toHaveProperty('twin');
    // 그 이웃이 없으면 볼록한 쪽을 모르므로 두 끝의 발을 더한다
    expect(openEdgeCandidates(f, under, [S2], ux + 1, uy + 2, SNAP).filter((q) => q.twin)).toHaveLength(2);
  });

  it('둘째 힌트의 앱 점도 0.20.0과 같이 그 토막 곡선 조각 위여야 받는다(이웃 토막 곡선 위·선 밖·현에서 먼 점은 버린다)', () => {
    const lines = [{ from: [-50, 29.5, 0], dir: [1, 0, 0] }];
    const plus: V3 = [Math.sqrt(R * R - 29.5 * 29.5), 29.5, 0];
    const [x, y] = at(plus);
    for (const q of [
      [12, 29.5, 0], // 토막 범위 밖(이웃 토막 쪽)
      [5, 29.7, 0], // 선 밖
      [plus[0], 29.5, 3], // 현에서 먼(선 밖이기도 하다)
      null,
    ])
      expect(openEdgeSnap(f, lines, ring, x + 1, y + 2, SNAP, (c) => (c.twin ? (q as V3 | null) : null))).toBeNull();
  });
});

// ───────────── 순수 함수: 면의 열린 교차 ─────────────
/** 구(중심 0, 반지름 30, 경도 24칸·위도 12칸)를 나눈 삼각형들 */
const SPH = sphereMesh('구', [0, 0, 0], R, 24, 12, [0.6, 0.6, 0.7, 1]);
/** 적도 둘레 경도 7.5°(칸 가운데) — 적도 칸의 현은 반지름 30·cos7.5°에 있다. 그 바깥 RHO를 지나는 Z축은 그물을 비켜 가며 구를 ±ZH에서 뚫는다 */
const RHO = 29.85;
const AZ = deg(7.5);
const ZH = Math.sqrt(R * R - RHO * RHO);
const UP: V3 = [RHO * Math.cos(AZ), RHO * Math.sin(AZ), 40];
const HIT: V3 = [UP[0], UP[1], ZH];
const LOW: V3 = [UP[0], UP[1], -ZH];
function triangles(m: Mesh3d, f: ViewFrame): (TrackTriangle & { index: number })[] {
  const P = m.positions, I = m.indices!;
  const out: (TrackTriangle & { index: number })[] = [];
  for (let t = 0; t < I.length / 3; t++) {
    const corners = [0, 1, 2].map((k) => [P[I[t * 3 + k]! * 3]!, P[I[t * 3 + k]! * 3 + 1]!, P[I[t * 3 + k]! * 3 + 2]!] as V3);
    const c = [0, 1, 2].map((k) => (corners[0]![k]! + corners[1]![k]! + corners[2]![k]!) / 3);
    out.push({ corners, wpp: worldPerPixel(f, viewDepth(f, c)), index: t });
  }
  return out;
}

describe('openFaceCandidates·openFaceSnap(선과 삼각형의 열린 교차)', () => {
  const view = dirToAngles([Math.cos(deg(27.5)), Math.sin(deg(27.5)), 0.25]);
  const cam: CameraState = { ...defaultCamera(), yaw: view.yaw, pitch: view.pitch, target: [HIT[0], HIT[1], 0], distance: 40, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 40 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const all = triangles(SPH, f);
  /** 커서 둘레(뷰어의 trianglesNear처럼) — 무게중심이 HIT에서 12 안 */
  const near = all.filter((t) => dist([(t.corners[0]![0]! + t.corners[1]![0]! + t.corners[2]![0]!) / 3, (t.corners[0]![1]! + t.corners[1]![1]! + t.corners[2]![1]!) / 3, (t.corners[0]![2]! + t.corners[1]![2]! + t.corners[2]![2]!) / 3], [HIT[0], HIT[1], 0]) < 12);
  const SNAP = 10;
  const Z = [0, 0, 1];
  const lines = [{ from: UP, dir: Z }];
  const exact = (c: { p: V3; line: number }): V3 | null => lineSphere(lines[c.line]!.from, lines[c.line]!.dir, [0, 0, 0], R, c.p);
  /** 점 q를 삼각형 평면에 내린 발이 삼각형 안인지 */
  const over = (q: readonly number[], t: TrackTriangle): boolean => {
    const [A, B, C] = t.corners as V3[];
    const u = [B![0] - A![0], B![1] - A![1], B![2] - A![2]], v = [C![0] - A![0], C![1] - A![1], C![2] - A![2]];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const s = (a: readonly number[], b: readonly number[], c: readonly number[]): number => {
      const e = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], w = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      return n[0]! * (e[1]! * w[2]! - e[2]! * w[1]!) + n[1]! * (e[2]! * w[0]! - e[0]! * w[2]!) + n[2]! * (e[0]! * w[1]! - e[1]! * w[0]!);
    };
    return s(A!, B!, q) >= 0 && s(B!, C!, q) >= 0 && s(C!, A!, q) >= 0;
  };

  it('전제: Z축은 그물(삼각형)을 뚫지 않고 구만 두 번 뚫는다. 간격은 반 화소보다 크고 가장 긴 변의 0.1배·붙잡기 거리 안', () => {
    expect(ZH).toBeGreaterThan(2.5);
    const [x, y] = at(HIT);
    // 커서 아래 삼각형 평면으로 구한 축과 면의 교차(0.18.0)는 커서에서 멀다(적도 칸은 축과 거의 나란하다)
    for (const t of near) {
      const A = t.corners[0]!, B = t.corners[1]!, C = t.corners[2]!;
      const n = [(B[1]! - A[1]!) * (C[2]! - A[2]!) - (B[2]! - A[2]!) * (C[1]! - A[1]!), (B[2]! - A[2]!) * (C[0]! - A[0]!) - (B[0]! - A[0]!) * (C[2]! - A[2]!), (B[0]! - A[0]!) * (C[1]! - A[1]!) - (B[1]! - A[1]!) * (C[0]! - A[0]!)];
      const hit = { point: A, normal: n, origin: A };
      expect(axisFaceSnap(f, [{ from: UP, axis: 'z' }], x + 1, y + 2, SNAP, hit, () => null)).toBeNull();
    }
    const cs = openFaceCandidates(f, lines, near, x + 1, y + 2, SNAP);
    expect(cs.length).toBeGreaterThanOrEqual(2);
    for (const c of cs) {
      expect(c.gap).toBeGreaterThan(0.5 * c.tri.wpp);
      expect(c.gap).toBeLessThanOrEqual(OPEN_FACE_CHORD * Math.max(...[0, 1, 2].map((k) => dist(c.tri.corners[k]!, c.tri.corners[(k + 1) % 3]!))));
      // 코어 점은 축 위(남은 두 좌표는 지나는 점 그대로)이고 그 삼각형 무게중심 높이
      expect([c.p[0], c.p[1]]).toEqual([UP[0], UP[1]]);
      expect(c.p[2]).toBeCloseTo((c.tri.corners[0]![2]! + c.tri.corners[1]![2]! + c.tri.corners[2]![2]!) / 3, 9);
      expect(Object.keys(c).sort()).toEqual(['distPx', 'gap', 'line', 'p', 'tri']);
    }
    // 커서에 가까운 차례
    for (let i = 1; i < cs.length; i++) expect(cs[i]!.distPx).toBeGreaterThanOrEqual(cs[i - 1]!.distPx);
  });

  it('앱이 준 구 위 교차(무게중심 쪽 힌트에 가까운 근)를 받는다: 위 근은 위 칸 삼각형, 아래 근은 아래 칸 삼각형 — 커서 쪽 하나', () => {
    for (const Q of [HIT, LOW]) {
      const [x, y] = at(Q);
      const asked: number[] = [];
      const r = openFaceSnap(f, lines, near, x + 1, y + 2, SNAP, (c) => {
        asked.push(c.tri.index);
        return exact(c);
      })!;
      expect(r).not.toBeNull();
      expect(dist(r.p, Q)).toBeLessThan(1e-9);
      expect([r.p[0], r.p[1]]).toEqual([UP[0], UP[1]]);
      expect(Math.sign(r.p[2])).toBe(Math.sign(Q[2]));
      expect(over(r.p, r.tri)).toBe(true);
      expect(r.core[2]).toBeCloseTo((r.tri.corners[0]![2]! + r.tri.corners[1]![2]! + r.tri.corners[2]![2]!) / 3, 9);
      expect(Object.keys(r).sort()).toEqual(['core', 'distPx', 'line', 'p', 'tri']);
      expect(r.distPx).toBeLessThan(SNAP);
      expect(asked.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('받지 않는 것: null·수가 아닌 값, 선에서 벗어난 점, 그 삼각형 위가 아닌 점(이웃 칸·먼 근), 평면에서 0.1 × 가장 긴 변보다 먼 점, 단면에 잘린 쪽, 가린 점', () => {
    const [x, y] = at(HIT);
    const run = (fn: (c: { p: V3; line: number; tri: TrackTriangle }) => unknown, tris: readonly TrackTriangle[] = near, vis?: (p: V3) => boolean) =>
      openFaceSnap(f, lines, tris, x + 1, y + 2, SNAP, fn as never, vis);
    expect(run(() => null)).toBeNull();
    expect(run(() => [Number.NaN, 0, 0])).toBeNull();
    expect(run(() => 'x')).toBeNull();
    expect(run(() => [HIT[0] + 0.5, HIT[1], HIT[2]])).toBeNull();
    // 먼 근(아래 칸 위 점)은 위 칸 삼각형이 받지 않는다 — 커서는 위 근 둘레라 아래 칸 삼각형이 받아도 커서에서 멀다
    expect(run((c) => lineSphere(UP, Z, [0, 0, 0], R, c.p, true))).toBeNull();
    // 축 위지만 평면에서 먼 점(구 밖 높이)
    expect(run((c) => [UP[0], UP[1], c.p[2] + 0.1])).not.toBeNull();
    expect(run(() => [UP[0], UP[1], 30])).toBeNull();
    // 단면: x > HIT.x − 1 쪽을 자른 그물
    const cut = near.map((t) => ({ ...t, keep: (p: readonly number[]) => p[0]! < HIT[0] - 1 }));
    expect(run(exact, cut)).toBeNull();
    const seen: V3[] = [];
    expect(
      run(exact, near, (p) => {
        seen.push(p);
        return false;
      }),
    ).toBeNull();
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(dist(seen[0]!, HIT)).toBeLessThan(1e-9);
  });

  it('그물을 거의 수직으로 뚫는 선: 뚫는 삼각형과 함께 쓰는 테두리가 가장 가까운 이웃은 뺀다(곡면 위 교차가 뚫는 자리 둘레 — 0.19.0이 맡는다)', () => {
    // 경도 7.5°·높이 0.3에서 구 중심 쪽으로 가는 수평선 — 적도 위 칸 삼각형을 적도 변 가까이에서 거의 수직으로 뚫는다(아래 칸은 그 변이 가장 가깝다)
    const radial = [{ from: [40 * Math.cos(AZ), 40 * Math.sin(AZ), 0.3], dir: [-Math.cos(AZ), -Math.sin(AZ), 0] }];
    const Q = lineSphere(radial[0]!.from, radial[0]!.dir, [0, 0, 0], R, radial[0]!.from)!;
    // 이 확대(한 화소 0.075)에서는 처짐 한도(0.1 × 가장 긴 변 ≈ 1.1)가 붙잡기 거리보다 길어 이웃을 빼지 않는다 — 남은 후보의 앱 점(뚫는 자리 둘레)은 그 삼각형 위가 아니라 받지 않는다
    const [x0, y0] = at(Q);
    expect(openFaceSnap(f, radial, near, x0 + 1, y0 + 2, SNAP, (c) => lineSphere(radial[0]!.from, radial[0]!.dir, [0, 0, 0], R, c.p))).toBeNull();
    // 물러나면(한 화소 0.19 — 붙잡기 거리 1.9가 처짐 한도보다 길다) 뚫는 자리에서 곡면 위 교차까지가 붙잡기 거리 안이라 이웃을 뺀다
    const far: CameraState = { ...cam, distance: 100 };
    const g = computeFrame(far, 600, 400, { center: [0, 0, 0], radius: 40 });
    const tg = triangles(SPH, g).filter((t) => near.some((n) => n.index === t.index));
    const sg = projectToScreen(g, Q)!;
    const [x, y] = [sg[0], sg[1]];
    expect(openFaceCandidates(g, radial, tg, x + 1, y + 2, SNAP)).toEqual([]);
    // 같은 선이 뚫는 삼각형 둘레의 이웃(함께 쓰는 테두리가 가장 가깝다)은 처짐 한도 안을 지나도 빠진다 — 뚫는 삼각형을 목록에서 빼면 후보가 생긴다
    const pierced = tg.filter((t) => {
      const [A, B, C] = t.corners as V3[];
      const n = [(B![1] - A![1]) * (C![2] - A![2]) - (B![2] - A![2]) * (C![1] - A![1]), (B![2] - A![2]) * (C![0] - A![0]) - (B![0] - A![0]) * (C![2] - A![2]), (B![0] - A![0]) * (C![1] - A![1]) - (B![1] - A![1]) * (C![0] - A![0])];
      const o = radial[0]!.from, d = radial[0]!.dir;
      const tt = (n[0]! * (A![0] - o[0]!) + n[1]! * (A![1] - o[1]!) + n[2]! * (A![2] - o[2]!)) / (n[0]! * d[0]! + n[1]! * d[1]! + n[2]! * d[2]!);
      return over([o[0]! + d[0]! * tt, o[1]! + d[1]! * tt, o[2]! + d[2]! * tt], t) || over([o[0]! + d[0]! * tt, o[1]! + d[1]! * tt, o[2]! + d[2]! * tt], { ...t, corners: [C!, B!, A!] });
    });
    expect(pierced.length).toBeGreaterThanOrEqual(1);
    const rest = tg.filter((t) => !pierced.includes(t));
    expect(openFaceCandidates(g, radial, rest, x + 1, y + 2, SNAP).length).toBeGreaterThanOrEqual(1);
  });

  it('비스듬히 스치며 그물을 뚫는 선: 그물을 뚫는 자리(코어 교차)와 구를 뚫는 자리가 붙잡기 거리보다 떨어지면 이웃이어도 남겨 구 위 교차를 받는다', () => {
    // 적도 칸의 현(반지름 30·cos7.5° = 29.74)보다 조금 안쪽 — 높이 ±1.8 둘레에서 그물을 뚫고, 구는 ±5.45에서 뚫는다
    const P: V3 = [29.5 * Math.cos(AZ), 29.5 * Math.sin(AZ), 40];
    const inner = [{ from: P, dir: Z }];
    const zr = Math.sqrt(R * R - 29.5 * 29.5);
    const Q: V3 = [P[0], P[1], zr];
    const [x, y] = at(Q);
    const r = openFaceSnap(f, inner, near, x + 1, y + 2, SNAP, (c) => lineSphere(P, Z, [0, 0, 0], R, c.p))!;
    expect(r).not.toBeNull();
    expect(dist(r.p, Q)).toBeLessThan(1e-9);
    expect(over(r.p, r.tri)).toBe(true);
  });

  it('빼는 것: 구에서 먼 축, 커서가 지나는 점 둘레, 지나는 점이 삼각형 둘레(곡면 위 첫 점), 길이 0 방향, 빈 목록', () => {
    const [x, y] = at(HIT);
    const far = [{ from: [31.5 * Math.cos(AZ), 31.5 * Math.sin(AZ), 40], dir: Z }];
    expect(openFaceCandidates(f, far, near, x + 1, y + 2, SNAP)).toEqual([]);
    const [ux, uy] = at(UP);
    expect(openFaceCandidates(f, lines, near, ux + 1, uy + 2, SNAP)).toEqual([]);
    // 지나는 점이 구 위(그 칸의 활꼴 안) — 그 점에서 만난다
    expect(openFaceCandidates(f, [{ from: HIT, dir: Z }], near, x + 1, y + 20, SNAP).filter((c) => dist(c.p, HIT) < 0.05)).toEqual([]);
    expect(openFaceCandidates(f, [{ from: UP, dir: [0, 0, 0] }], near, x + 1, y + 2, SNAP)).toEqual([]);
    expect(openFaceCandidates(f, [], near, x + 1, y + 2, SNAP)).toEqual([]);
    expect(openFaceCandidates(f, lines, [], x + 1, y + 2, SNAP)).toEqual([]);
  });
});

describe('trianglesNear(커서 둘레 그물 삼각형)', () => {
  const box = boxMesh('상자', [0, 0, 0], [100, 80, 40], [0.6, 0.6, 0.7, 1]);
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [50, 40, 20], distance: 300, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [50, 40, 20], radius: 80 });
  const base = { bvh: () => null };
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  it('화면에 그린 삼각형 안이면 거리 0, 밖이면 가장 가까운 변까지(붙잡기 거리 안만), 눈 쪽 법선·그물 id·삼각형 번호', () => {
    const [x, y] = at([50, 40, 40]);
    const hs = trianglesNear(f, x + 0.3, y + 0.4, { meshes: [box], lines: [], points: [] }, base, 10);
    const top = hs.filter((h) => h.normal[2] > 0.99);
    expect(top.length).toBeGreaterThanOrEqual(1);
    expect(top[0]!.distPx).toBe(0);
    expect(top[0]!.id).toBe('상자');
    expect(top[0]!.depth).toBeCloseTo(viewDepth(f, [50, 40, 40]), 0);
    // 윗면 삼각형(눈 쪽 법선 +Z)과, 뒤 아랫면(법선은 눈 쪽으로 뒤집힌다 — 아랫면을 아래에서 보지 않는다) 등
    for (const h of hs) {
      expect(h.distPx).toBeLessThanOrEqual(10);
      const c = h.corners[0];
      expect(h.normal[0] * (f.eye[0] - c[0]) + h.normal[1] * (f.eye[1] - c[1]) + h.normal[2] * (f.eye[2] - c[2])).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < hs.length; i++) expect(hs[i]!.distPx).toBeGreaterThanOrEqual(hs[i - 1]!.distPx);
    // max개까지
    expect(trianglesNear(f, x, y, { meshes: [box], lines: [], points: [] }, base, 10, 1)).toHaveLength(1);
    // 멀면 없다
    expect(trianglesNear(f, 5, 5, { meshes: [box], lines: [], points: [] }, base, 10)).toEqual([]);
  });

  it('숨긴 삼각형·한 단면 평면에 모두 잘린 삼각형은 빼고, 묶음 행렬을 따른다', () => {
    const [x, y] = at([50, 40, 40]);
    const items = { meshes: [box], lines: [], points: [] };
    const all = trianglesNear(f, x + 0.3, y + 0.4, items, base, 10);
    const topIdx = all.filter((h) => h.normal[2] > 0.99).map((h) => h.index);
    const hidden = trianglesNear(f, x + 0.3, y + 0.4, items, { ...base, hidden: () => (i: number) => topIdx.includes(i) }, 10);
    expect(hidden.some((h) => topIdx.includes(h.index))).toBe(false);
    // z > 30 쪽을 자른다: 윗면(z 40)은 모두 잘린 쪽
    const clipped = trianglesNear(f, x + 0.3, y + 0.4, items, { ...base, clip: [0, 0, 1, -30] }, 10);
    expect(clipped.some((h) => topIdx.includes(h.index))).toBe(false);
    for (const h of clipped) expect(h.keep).toBeTypeOf('function');
    // 행렬로 x +1000 옮긴 상자
    const moved = { ...box, matrix: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1000, 0, 0, 1]) };
    const cam2: CameraState = { ...cam, target: [1050, 40, 20] };
    const f2 = computeFrame(cam2, 600, 400, { center: [1050, 40, 20], radius: 80 });
    const s2 = projectToScreen(f2, [1050, 40, 40])!;
    const hs2 = trianglesNear(f2, s2[0] + 0.3, s2[1] + 0.4, { meshes: [moved], lines: [], points: [] }, base, 10);
    expect(hs2.some((h) => h.distPx === 0 && h.corners.every((c) => c[0] >= 1000))).toBe(true);
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

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(sc: Scene3d, wire = false): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, ...(wire ? { renderMode: 'wireframe' as const } : {}) });
  v.setScene(sc);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement };
}
const ptr = (w: View, type: string, x: number, y: number, buttons: number, shiftKey = false): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const hoverXY = (w: View, x: number, y: number, shift = false): void => {
  ptr(w, 'pointermove', x, y, 0, shift);
  w.v.renderNow();
};
const clickXY = (w: View, x: number, y: number, shift = false): void => {
  hoverXY(w, x, y, shift);
  ptr(w, 'pointerdown', x, y, 1, shift);
  ptr(w, 'pointerup', x, y, 0, shift);
  w.v.renderNow();
};
type Snap = Parameters<Viewer3d['setMeasureSnap']>[0];
/** 카메라를 target에 dir 쪽에서 distance로 */
function look(w: View, target: readonly number[], dir: readonly number[], distance: number): void {
  const a = dirToAngles(dir);
  w.v.setCamera({ ...w.v.getCamera(), yaw: a.yaw, pitch: a.pitch, target: [target[0]!, target[1]!, target[2]!], distance, projection: 'perspective' });
  w.v.renderNow();
}

const globe: Scene3d = { name: 'g', units: 'mm', meshes: [SPH], lines: [], points: [] };
/** 앱의 정확한 구: 'axisFace'면 직선과 구의 교차(point에 가까운 근), 그 밖은 null */
const sphereRefine = (calls: SnapRefineFaceInput[] = []) => (c: SnapRefineFaceInput): V3 | null => {
  calls.push(c);
  return c.kind === 'axisFace' && c.face.id === '구' ? lineSphere(c.line.origin, c.line.dir, [0, 0, 0], R, c.point) : null;
};
/** UP(앱 붙잡기 점)을 첫 점으로 찍고 구를 스치는 자리 둘레로 다가간 뷰 */
function globeFirst(o: Snap): View {
  const w = view(globe);
  w.v.setMeasureMode(true);
  w.v.setMeasureSnap({ points: [{ point: UP, kind: 'point' }], ...o });
  const s = at(w, UP);
  clickXY(w, s.x + 1, s.y);
  expect(w.v.measurePoints[0]!.point).toEqual(UP);
  look(w, [HIT[0], HIT[1], 0], [Math.cos(deg(27.5)), Math.sin(deg(27.5)), 0.25], 40);
  return w;
}
const FACES = { inference: { axes: true, lock: true, axisFaces: true, lockFaces: true } } as const;

describe("Viewer3d: 면의 열린 교차(0.22.0 refineFace — 'axisFace', open)", () => {
  it('첫 점 Z축이 구를 스치는 자리(그물 삼각형은 비켜 간다)를 앱이 준 구 위 교차로 붙잡고, 찍은 거리는 정확하다', () => {
    const calls: SnapRefineFaceInput[] = [];
    const w = globeFirst({ ...FACES, refineFace: sphereRefine(calls) });
    const { v } = w;
    const s = at(w, HIT);
    hoverXY(w, s.x + 1, s.y + 2);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'axis', axis: 'z', direction: [0, 0, 1], refined: true, face: { id: '구' } });
    expect(dist(h.point, HIT)).toBeLessThan(1e-9);
    expect([h.point[0], h.point[1]]).toEqual([UP[0], UP[1]]);
    expect(h).not.toHaveProperty('trackFrom');
    expect(h).not.toHaveProperty('locked');
    expect(h.face!.normal[0]).toBeGreaterThan(0.9);
    const open = calls.filter((c) => c.open);
    expect(open.length).toBeGreaterThanOrEqual(1);
    expect(open.length).toBeLessThanOrEqual(OPEN_REFINE_CALLS);
    expect(open.every((c) => c.kind === 'axisFace' && c.face.id === '구' && c.first![2] === 40)).toBe(true);
    expect(open[0]).toMatchObject({ line: { origin: UP, dir: [0, 0, 1], axis: 'z' }, open: true });
    expect([open[0]!.point[0], open[0]!.point[1]]).toEqual([UP[0], UP[1]]);
    // 커서를 옮겨도(같은 선·삼각형) 다시 부르지 않고, 찍어도 부르지 않는다
    const n = calls.length;
    hoverXY(w, s.x + 3, s.y - 1);
    clickXY(w, s.x + 3, s.y - 1);
    expect(calls.filter((c) => c.open).length).toBe(open.length);
    expect(calls.length).toBe(n);
    const m = v.measurement()!;
    expect(m.distance).toBeCloseTo(40 - ZH, 9);
    expect([m.dx, m.dy, m.snapB, m.axisB, m.directionB]).toEqual([0, 0, 'axis', 'z', [0, 0, 1]]);
    expect(v.measurePoints[1]).toMatchObject({ snap: 'axis', axis: 'z', refined: true, face: { id: '구' } });
    v.dispose();
  });

  it('아래 근 둘레를 가리키면 아래 칸 삼각형 위의 교차 — 커서 쪽 근', () => {
    const w = globeFirst({ ...FACES, refineFace: sphereRefine() });
    const s = at(w, LOW);
    hoverXY(w, s.x + 1, s.y + 2);
    const h = w.v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'axis', axis: 'z', refined: true, face: { id: '구' } });
    expect(dist(h.point, LOW)).toBeLessThan(1e-9);
    w.v.dispose();
  });

  it('refineFace 없이·null·열린 후보를 거르는 앱·먼 근·축에서 벗어난 점이면 0.21.0과 같다(첫 점 Z축 위 커서 자리)', () => {
    const run = (o: Snap): unknown[] => {
      const w = globeFirst(o);
      const out: unknown[] = [];
      for (const Q of [HIT, LOW]) {
        const s = at(w, Q);
        hoverXY(w, s.x + 1, s.y + 2);
        out.push(w.v.measureHoverSnap);
      }
      w.v.dispose();
      return out;
    };
    const plain = run(FACES);
    expect((plain[0] as { refined?: boolean }).refined).toBeUndefined();
    expect((plain[0] as { snap: string }).snap).toBe('axis');
    for (const refineFace of [
      () => null,
      (c: SnapRefineFaceInput) => (c.open ? null : sphereRefine()(c)),
      (c: SnapRefineFaceInput) => lineSphere(c.line.origin, c.line.dir, [0, 0, 0], R, c.point, true),
      (c: SnapRefineFaceInput) => {
        const q = lineSphere(c.line.origin, c.line.dir, [0, 0, 0], R, c.point)!;
        return [q[0] + 0.3, q[1], q[2]];
      },
    ])
      expect(run({ ...FACES, refineFace })).toEqual(plain);
    // axisFaces를 끄면 부르지 않는다
    const calls: SnapRefineFaceInput[] = [];
    expect(run({ inference: { axes: true }, refineFace: sphereRefine(calls) })).toEqual(plain);
    expect(calls.filter((c) => c.kind === 'axisFace')).toEqual([]);
  });

  it('잠근 Z축(lockFaces)도 같은 자리에 붙고, 잠그기 전과 같은 입력이라 다시 부르지 않는다. lockFaces가 없으면 잠근 축 위 커서 자리', () => {
    const calls: SnapRefineFaceInput[] = [];
    const w = globeFirst({ ...FACES, refineFace: sphereRefine(calls) });
    const { v } = w;
    const s = at(w, HIT);
    hoverXY(w, s.x + 1, s.y + 2);
    const before = v.measureHoverSnap!;
    const n = calls.length;
    hoverXY(w, s.x + 1, s.y + 2, true);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'axis', axis: 'z', locked: true, refined: true, face: { id: '구' } });
    expect(h.point).toEqual(before.point);
    expect(calls.length).toBe(n);
    v.dispose();
    // 앱 단추로 처음부터 잠근 것도 같다. lockFaces를 끄면 0.21.0처럼 커서 쪽 잠근 축 위 점
    for (const lockFaces of [true, false]) {
      const w2 = globeFirst({ inference: { axes: true, lock: true, axisFaces: true, lockFaces }, refineFace: sphereRefine() });
      expect(w2.v.setMeasureInferenceLock('z')).toBe(true);
      const s2 = at(w2, HIT);
      hoverXY(w2, s2.x + 1, s2.y + 2);
      const h2 = w2.v.measureHoverSnap!;
      expect(h2.locked).toBe(true);
      if (lockFaces) expect(dist(h2.point, HIT)).toBeLessThan(1e-9);
      else {
        expect(h2).not.toHaveProperty('refined');
        expect(dist(h2.point, HIT)).toBeGreaterThan(1e-3);
      }
      w2.v.dispose();
    }
  });

  it('미리 보기 한 번에 새로 부르는 것은 OPEN_REFINE_CALLS번까지(0.15.0·0.20.0 열린 후보와 함께), 기억을 비우면 다시 부른다', () => {
    let n = 0;
    const w = globeFirst({
      ...FACES,
      refineFace: (c) => {
        if (c.open) n++;
        return sphereRefine()(c);
      },
    });
    const s = at(w, HIT);
    hoverXY(w, s.x + 1, s.y + 2);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(OPEN_REFINE_CALLS);
    const k = n;
    hoverXY(w, s.x + 2, s.y + 2);
    expect(n).toBe(k);
    expect(w.v.clearMeasureRefine()).toBeGreaterThanOrEqual(1);
    w.v.renderNow();
    expect(n).toBeGreaterThan(k);
    expect(dist(w.v.measureHoverSnap!.point, HIT)).toBeLessThan(1e-9);
    w.v.dispose();
  });
});

/** 12토막 원 '원'(z 0, 원본 번호 100 + k). 토막 2(75°–105°)의 현은 X축과 나란하다 */
function ringLine(id: string, z = 0): Scene3d['lines'][number] {
  const P: number[] = [];
  for (let k = 0; k < 12; k++) P.push(...vtx(k, z), ...vtx(k + 1, z));
  return { id, positions: new Float32Array(P), segmentIds: new Uint32Array(Array.from({ length: 12 }, (_, k) => 100 + k)) };
}
const A0: V3 = [-40, 29.5, 0];
const ring: Scene3d = { name: 'r', units: 'mm', meshes: [], lines: [ringLine('원')], points: [] };
const circleRefine = (calls: SnapRefineInput[] = []) => (c: SnapRefineInput): V3 | null => {
  calls.push(c);
  if (c.kind !== 'axisEdge' || !c.line || c.segment.id !== '원') return null;
  return lineCircle(c.line.origin, c.line.dir, c.point, c.segment.ends[0][2]);
};

describe("Viewer3d: 첫 점 축이 한 토막 활꼴을 두 번 지나는 두 교차(0.22.0 refine — 'axisEdge', open의 둘째 힌트)", () => {
  const PLUS: V3 = [Math.sqrt(R * R - 29.5 * 29.5), 29.5, 0];
  const MINUS: V3 = [-PLUS[0], 29.5, 0];
  function ringFirst(o: Snap): View {
    const w = view(ring, true);
    w.v.setMeasureMode(true);
    w.v.setMeasureSnap({ points: [{ point: A0, kind: 'point' }], ...o });
    const s = at(w, A0);
    clickXY(w, s.x + 1, s.y);
    expect(w.v.measurePoints[0]!.point).toEqual(A0);
    look(w, [0, 29.5, 0], [0.3, -1, 1.2], 60);
    return w;
  }
  const AX = { inference: { axes: true, lock: true, axisEdges: true, lockEdges: true } } as const;

  it('첫 점 X축(현과 나란히 활꼴 안)이 원과 만나는 두 자리 모두에 붙는다 — 0.20.0 힌트(현 가운데의 발)와 두 끝의 발로 따로 부른다', () => {
    const calls: SnapRefineInput[] = [];
    const w = ringFirst({ ...AX, refine: circleRefine(calls) });
    const { v } = w;
    for (const Q of [PLUS, MINUS]) {
      const s = at(w, Q);
      hoverXY(w, s.x + 1, s.y + 2);
      const h = v.measureHoverSnap!;
      expect(h).toMatchObject({ snap: 'axis', axis: 'x', direction: [1, 0, 0], refined: true, segment: { id: '원', index: 102 } });
      expect(dist(h.point, Q)).toBeLessThan(1e-12);
      expect([h.point[1], h.point[2]]).toEqual([29.5, 0]);
    }
    const open = calls.filter((c) => c.open && c.segment.index === 102);
    expect(open.length).toBe(3);
    const xs = open.map((c) => c.point[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(vtx(3)[0], 4);
    expect(xs[1]).toBe(0);
    expect(xs[2]).toBeCloseTo(vtx(2)[0], 4);
    expect(open.every((c) => c.point[1] === 29.5 && c.point[2] === 0 && c.line!.axis === 'x')).toBe(true);
    // 두 점째로 찍은 거리
    const s = at(w, PLUS);
    clickXY(w, s.x + 1, s.y + 2);
    expect(v.measurement()!.distance).toBeCloseTo(PLUS[0] + 40, 9);
    v.dispose();
  });

  it('Shift로 잠가도(lockEdges) 같은 선·토막이라 다시 부르지 않고 그 자리에 남는다', () => {
    const calls: SnapRefineInput[] = [];
    const w = ringFirst({ ...AX, refine: circleRefine(calls) });
    const s = at(w, PLUS);
    hoverXY(w, s.x + 1, s.y + 2);
    const n = calls.length;
    hoverXY(w, s.x + 1, s.y + 2, true);
    const h = w.v.measureHoverSnap!;
    expect(h).toMatchObject({ locked: true, refined: true, segment: { index: 102 } });
    expect(dist(h.point, PLUS)).toBeLessThan(1e-12);
    expect(calls.length).toBe(n);
    w.v.dispose();
  });
});

describe('Viewer3d.onPick: 그물 면만 받는 알림(0.22.0 meshesOnly)', () => {
  /** 상자(0~100, 0~80, 0~40) 윗면 위 선분 '금'((10, 40, 40) → (90, 40, 40))과 상자 밖 선분 '밖' */
  const sc: Scene3d = {
    name: 'p',
    units: 'mm',
    meshes: [boxMesh('상자', [0, 0, 0], [100, 80, 40], [0.6, 0.6, 0.7, 1])],
    lines: [
      { id: '금', positions: new Float32Array([10, 40, 40, 90, 40, 40]) },
      { id: '밖', positions: new Float32Array([50, -60, 0, 150, -60, 0]) },
    ],
    points: [],
  };

  it('같은 누르기에서 선택 없는 알림은 선분, meshesOnly 알림은 그 아래 면(pick meshesOnly와 같다) — 그물 면이 없으면 null', () => {
    const w = view(sc, true);
    const { v } = w;
    const log: [string, unknown][] = [];
    const off1 = v.onPick((p) => log.push(['plain', p]));
    const off2 = v.onPick((p) => log.push(['faces', p]), { meshesOnly: true });
    const s = at(w, [50, 40, 40]);
    clickXY(w, s.x + 0.5, s.y + 0.4);
    expect(log.map((e) => e[0])).toEqual(['plain', 'faces']);
    expect(log[0]![1]).toMatchObject({ kind: 'line', id: '금' });
    expect(log[1]![1]).toEqual(v.pick(s.x + 0.5, s.y + 0.4, { meshesOnly: true }));
    expect(log[1]![1]).toMatchObject({ kind: 'mesh', id: '상자', normal: [0, 0, 1] });
    log.length = 0;
    const o = at(w, [100, -60, 0]);
    clickXY(w, o.x + 0.5, o.y + 0.5);
    expect(log[0]![1]).toMatchObject({ kind: 'line', id: '밖' });
    expect(log[1]![1]).toBeNull();
    log.length = 0;
    clickXY(w, 3, 3);
    expect(log).toEqual([
      ['plain', null],
      ['faces', null],
    ]);
    // 끊은 알림은 부르지 않는다
    off2();
    log.length = 0;
    clickXY(w, s.x + 0.5, s.y + 0.4);
    expect(log.map((e) => e[0])).toEqual(['plain']);
    off1();
    v.dispose();
  });

  it('선택 없이(또는 false) 단 알림은 0.21.0 그대로이고, 같은 함수를 다시 달면 마지막 선택을 따른다', () => {
    const w = view(sc, true);
    const { v } = w;
    const got: unknown[] = [];
    const cb = (p: unknown): void => void got.push(p);
    v.onPick(cb, { meshesOnly: false });
    const s = at(w, [50, 40, 40]);
    clickXY(w, s.x + 0.5, s.y + 0.4);
    expect(got[0]).toEqual(v.pick(s.x + 0.5, s.y + 0.4));
    v.onPick(cb, { meshesOnly: true });
    clickXY(w, s.x + 0.5, s.y + 0.4);
    expect(got).toHaveLength(2);
    expect(got[1]).toMatchObject({ kind: 'mesh', id: '상자' });
    v.dispose();
  });
});
