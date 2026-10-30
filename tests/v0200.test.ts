/**
 * 0.20.0 선과 꺾은선 토막의 열린 교차(refine — 'axisEdge', open), 축이 아닌 잠근 선의 다듬기(SnapRefineLine.axis 없음), 그물 면만 고르기(pick meshesOnly).
 * - 순수 함수: openEdgeCandidates(곡선 평면을 뚫는 축·같은 평면에서 활꼴만 지나는 선·이웃 토막을 지나는 선·빼는 것·차례), openEdgeSnap(받기·버리기 규칙),
 *   openRefineKey의 축 이름 없는 직선
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 첫 점 축·끌어온 축·잠근 축·축이 아닌 잠근 선의 열린 교차, refine 없이·null이면 0.19.0과 같음, 기억·호출 한도,
 *   축이 아닌 잠근 선과 선분의 교차 다듬기, pick의 meshesOnly
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, viewDepth, worldPerPixel } from '../src/camera';
import { OPEN_REFINE_CALLS, type SnapRefineInput, openRefineKey } from '../src/snap';
import { OPEN_EDGE_CHORD, axisEdgeSnap, lockEdgeSnap, openEdgeCandidates, openEdgeSnap } from '../src/track';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const R = 30;
const deg = (a: number): number => (a * Math.PI) / 180;
/** 원(중심 (0, 0, z), 반지름 30, z 평면)의 꼭짓점 — 15° + 30°·k(0°는 토막 11의 가운데) */
const vtx = (k: number, z = 0): V3 => [R * Math.cos(deg(15 + 30 * k)), R * Math.sin(deg(15 + 30 * k)), z];
/** 직선(o, d)과 그 원의 교차: 평면을 뚫으면 그 점(원 위일 때만), 평면 위 직선이면 point에 가까운 근 */
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

// ───────────── 순수 함수 ─────────────
describe('openEdgeCandidates·openEdgeSnap(선과 꺾은선 토막의 열린 교차)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [10, 0, 10], distance: 160, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 50 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const seg = (a: V3, b: V3, keep?: (p: readonly number[]) => boolean) => ({ a, b, wpp: worldPerPixel(f, viewDepth(f, a)), keep });
  const ring = Array.from({ length: 12 }, (_, k) => seg(vtx(k), vtx(k + 1)));
  const S11 = ring[11]!;
  const SNAP = 12;
  const T: V3 = [R, 0, 0];
  const P: V3 = [R, 0, 40];
  const Z: V3 = [0, 0, 1];
  const exact = (lines: readonly { from: readonly number[]; dir: readonly number[] }[]) => (c: { p: V3; line: number }) => lineCircle(lines[c.line]!.from, lines[c.line]!.dir, c.p);

  it('전제: 현은 원에서 처짐만큼 안쪽이라 Z축은 토막과 3D로 만나지 않는다(코어 교차 없음), 처짐은 토막 길이의 0.1배 안', () => {
    const sag = R - R * Math.cos(deg(15));
    expect(sag).toBeGreaterThan(0.5 * S11.wpp);
    expect(sag).toBeLessThan(OPEN_EDGE_CHORD * dist(S11.a, S11.b));
    expect(sag).toBeLessThan(SNAP * S11.wpp);
    const [x, y] = at(T);
    expect(axisEdgeSnap(f, P, ring, x + 2, y + 1, SNAP)).toBeNull();
    expect(lockEdgeSnap(f, P, Z, ring, x + 2, y + 1, SNAP)).toBeNull();
  });

  it('곡선 평면을 뚫는 축: 코어 점은 축 위에서 토막에 가장 가까운 점(남은 두 좌표는 지나는 점 그대로), 앱이 준 원 위 교차를 받는다', () => {
    const [x, y] = at(T);
    const lines = [{ from: P, dir: Z }];
    const cs = openEdgeCandidates(f, lines, ring, x + 2, y + 1, SNAP);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.seg).toBe(S11);
    expect(cs[0]!.p).toEqual([R, 0, 0]);
    expect(cs[0]!.line).toBe(0);
    expect(cs[0]!.gap).toBeCloseTo(R - R * Math.cos(deg(15)), 9);
    expect(Object.keys(cs[0]!).sort()).toEqual(['distPx', 'gap', 'line', 'p', 'seg']);
    const asked: unknown[] = [];
    const r = openEdgeSnap(f, lines, ring, x + 2, y + 1, SNAP, (c) => {
      asked.push(c);
      return exact(lines)(c);
    })!;
    expect(asked).toEqual([cs[0]]);
    expect(r.p).toEqual(T);
    expect(r.core).toEqual(T);
    expect(r.seg).toBe(S11);
    expect(r.line).toBe(0);
    expect(r.distPx).toBeCloseTo(Math.hypot(2, 1), 6);
    expect(Object.keys(r).sort()).toEqual(['core', 'distPx', 'line', 'p', 'seg']);
    // 방향 길이·부호는 상관없다, 축이 아닌 직선도 같은 계산(첫 점 (10, 0, 40)에서 T 쪽)
    expect(openEdgeSnap(f, [{ from: P, dir: [0, 0, -3] }], ring, x + 2, y + 1, SNAP, exact([{ from: P, dir: [0, 0, -3] }]))!.p).toEqual(T);
    const G: V3 = [10, 0, 40];
    const slant = [{ from: G, dir: [20, 0, -40] }];
    const s = openEdgeSnap(f, slant, ring, x + 2, y + 1, SNAP, exact(slant))!;
    expect(dist(s.p, T)).toBeLessThan(1e-9);
    expect(s.p[1]).toBe(0);
  });

  it('받지 않는 것: null·undefined·수가 아닌 값, 선에서 벗어난 점, 코어 점에서 먼 점, 현에서 처짐 한도보다 먼 점, 단면에 잘린 쪽, 가린 점', () => {
    const [x, y] = at(T);
    const lines = [{ from: P, dir: Z }];
    const run = (q: unknown, segs = ring, vis?: (p: V3) => boolean) => openEdgeSnap(f, lines, segs, x + 2, y + 1, SNAP, () => q as never, vis);
    for (const q of [null, undefined, [Number.NaN, 0, 0], 'x', [R + 0.5, 0, 0], [R, 0, -25], [R, 0, 1.6]]) expect(run(q)).toBeNull();
    // 코어 점 그대로는 받는다(축이 곡선 평면을 수직으로 뚫으면 코어 점이 곧 교차다)
    expect(run([R, 0, 0])!.p).toEqual(T);
    // 처짐 한도 안이면 선 위 다른 점도 받는다(곡선 평면이 기울었을 때)
    expect(dist(run([R, 0, 0.3])!.p, [R, 0, 0.3])).toBeLessThan(1e-12);
    const cut = ring.map((s) => seg(s.a, s.b, (p) => p[0]! < 29.5));
    expect(run([R, 0, 0], cut)).toBeNull();
    const asked: V3[] = [];
    expect(
      run([R, 0, 0], ring, (p) => {
        asked.push(p);
        return false;
      }),
    ).toBeNull();
    expect(asked).toEqual([T]);
  });

  it('같은 평면에서 활꼴만 지나는 선(현과 만나지 않고 곡선에 거의 닿듯 지나감): 토막 끝 쪽 코어 점, 앱이 준 그 토막 곡선 위 교차', () => {
    // 토막 2(75°–105°, 현은 y = 30·sin75°)를 (1, 0.01, 0) 방향 선이 위로 지나간다 — 원과는 그 토막 범위 안에서 두 번 만난다
    const S2 = ring[2]!;
    const Q: V3 = [-50, 29.2, 0];
    const lines = [{ from: Q, dir: [1, 0.01, 0] }];
    const near = lineCircle(Q, [1, 0.01, 0], vtx(3))!;
    expect(Math.atan2(near[1], near[0])).toBeGreaterThan(deg(90));
    expect(Math.atan2(near[1], near[0])).toBeLessThan(deg(105));
    const [x, y] = at(near);
    const cs = openEdgeCandidates(f, lines, ring, x + 1, y + 2, SNAP);
    // 가장 가까운 자리는 토막 끝(105° 꼭짓점) 쪽이다. 그 꼭짓점을 함께 쓰는 토막 3도 같은 코어 점의 후보다(앱 점이 토막 3 범위 밖이라 받지 않는다)
    expect(cs[0]!.seg).toBe(S2);
    expect(cs.every((c) => c.seg === S2 || c.seg === ring[3])).toBe(true);
    expect(cs[0]!.p[0]).toBeCloseTo(vtx(3)[0], 1);
    expect(cs[0]!.p[2]).toBe(0);
    const segsAsked: unknown[] = [];
    const r = openEdgeSnap(f, lines, ring, x + 1, y + 2, SNAP, (c) => {
      segsAsked.push(c.seg);
      return exact(lines)(c);
    })!;
    expect(dist(r.p, near)).toBeLessThan(1e-9);
    expect(r.seg).toBe(S2);
    expect(segsAsked[0]).toBe(S2);
    // 현과 만나는 선(코어 교차)은 열린 후보가 없다
    const cross = [{ from: [0, -50, 0], dir: [0, 1, 0] }];
    expect(openEdgeCandidates(f, cross, [S2], ...at([0, vtx(2)[1], 0]), SNAP)).toEqual([]);
    // 현과 나란히 바깥 반대쪽(원 안쪽)을 지나는 선은 양옆 토막을 3D로 지나므로(코어 교차) 빼고, 양옆 토막이 목록에 없으면 후보다
    const under = [{ from: [-50, 28.5, 0], dir: [1, 0, 0] }];
    const [ux, uy] = at([0, 28.5, 0]);
    expect(openEdgeCandidates(f, under, [ring[1]!, S2, ring[3]!], ux, uy + 1, SNAP).filter((c) => c.seg === S2)).toEqual([]);
    // 0.20.0 후보(나란하면 현 가운데의 발)는 그대로다. 0.22.0부터 나란한 선은 두 끝의 발을 둘째 힌트(twin)로 더한다(같은 평면 — 활꼴을 두 번 지날 수 있다)
    const only = openEdgeCandidates(f, under, [S2], ux, uy + 1, SNAP);
    expect(only.filter((c) => !c.twin).map((c) => c.p)).toEqual([[0, 28.5, 0]]);
    const twins = only.filter((c) => c.twin).sort((a, b) => a.p[0] - b.p[0]);
    expect(twins).toHaveLength(2);
    expect(twins[0]!.p[0]).toBeCloseTo(vtx(3)[0], 12);
    expect(twins[1]!.p[0]).toBeCloseTo(vtx(2)[0], 12);
    expect(twins.every((c) => c.p[1] === 28.5 && c.p[2] === 0 && c.seg === S2)).toBe(true);
  });

  it('토막 끝 밖에서 가장 가까운데 그 끝을 함께 쓰는 이웃 토막을 지나는 선은 빼고, 이웃 토막이 목록에 없어도 이웃 곡선 위 점(토막 범위 밖)은 받지 않는다', () => {
    // y = 7 선은 토막 11(현 x = 30·cos15°)을 지나고(코어 교차), 토막 0의 끝(15° 꼭짓점) 둘레를 비켜 간다
    const lines = [{ from: [-50, 7, 0], dir: [1, 0, 0] }];
    const X: V3 = [Math.sqrt(R * R - 49), 7, 0];
    const [x, y] = at(X);
    const S0 = ring[0]!;
    expect(openEdgeCandidates(f, lines, [S11, S0], x + 1, y + 2, SNAP)).toEqual([]);
    const only = openEdgeCandidates(f, lines, [S0], x + 1, y + 2, SNAP);
    expect(only).toHaveLength(1);
    expect(only[0]!.p[0]).toBeCloseTo(vtx(0)[0], 9);
    expect([only[0]!.p[1], only[0]!.p[2]]).toEqual([7, 0]);
    let n = 0;
    expect(
      openEdgeSnap(f, lines, [S0], x + 1, y + 2, SNAP, (c) => {
        n++;
        return exact(lines)(c);
      }),
    ).toBeNull();
    expect(n).toBe(1);
  });

  it('빼는 것: 커서가 지나는 점 둘레, 선이 지나는 점이 곡선 위(그 점에서 만난다), 먼 선, 코어 점이 커서에서 2 × 붙잡기 거리 밖, 길이 0 토막·방향', () => {
    const [x, y] = at(T);
    const [px, py] = at(P);
    expect(openEdgeCandidates(f, [{ from: P, dir: Z }], ring, px + 2, py + 1, SNAP)).toEqual([]);
    // 지나는 점이 곡선 위 T — 커서는 T에서 붙잡기 거리의 1.5배
    expect(openEdgeCandidates(f, [{ from: T, dir: Z }], ring, x + 1.5 * SNAP, y, SNAP)).toEqual([]);
    expect(openEdgeCandidates(f, [{ from: [R + 4, 0, 40], dir: Z }], ring, x + 2, y + 1, SNAP)).toEqual([]);
    expect(openEdgeCandidates(f, [{ from: P, dir: Z }], ring, x + 2.5 * SNAP, y, SNAP)).toEqual([]);
    expect(openEdgeCandidates(f, [{ from: P, dir: Z }], [seg(T, T)], x + 2, y + 1, SNAP)).toEqual([]);
    expect(openEdgeCandidates(f, [{ from: P, dir: [0, 0, 0] }], ring, x + 2, y + 1, SNAP)).toEqual([]);
    expect(openEdgeCandidates(f, [], ring, x + 2, y + 1, SNAP)).toEqual([]);
  });

  it('여러 선·토막이면 커서에 가까운 코어 점부터 묻고, 받은 것 가운데 커서에 가장 가까운 것', () => {
    // 높이가 다른 두 원(z 0·z −3)을 같은 Z축이 뚫는다
    const low = Array.from({ length: 12 }, (_, k) => seg(vtx(k, -3), vtx(k + 1, -3)));
    const T2: V3 = [R, 0, -3];
    const [x, y] = at(T2);
    const lines = [{ from: P, dir: Z }];
    const cs = openEdgeCandidates(f, lines, [...ring, ...low], x + 1, y + 1, SNAP);
    expect(cs.map((c) => c.p)).toEqual([T2, T]);
    const order: V3[] = [];
    const r = openEdgeSnap(f, lines, [...ring, ...low], x + 1, y + 1, SNAP, (c) => {
      order.push(c.p);
      return lineCircle(P, Z, c.p, c.p[2]);
    })!;
    expect(r.p).toEqual(T2);
    expect(order[0]).toEqual(T2);
  });

  it('openRefineKey: 축 이름 없는 직선은 "-"로(축 직선 열쇠는 0.19.0 그대로)', () => {
    const segment = { kind: 'line' as const, id: '원', index: 111, raw: 11, ends: [vtx(11), vtx(12)] as [V3, V3] };
    const base = { kind: 'axisEdge' as const, point: T, segment, first: P };
    const k1 = openRefineKey({ ...base, line: { origin: P, dir: [0, 0, 1], axis: 'z' } });
    const k2 = openRefineKey({ ...base, line: { origin: P, dir: [0, 0, 1] } });
    expect(k1.endsWith('#z|30,0,40|0,0,1')).toBe(true);
    expect(k2.endsWith('#-|30,0,40|0,0,1')).toBe(true);
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

/**
 * 장면: 12토막 원 '원'(z 0, 원본 번호 100 + k), 기둥 '기둥'(F = (30, 0, 40) → (30, 0, 60)) — F의 Z축은 원을 T = (30, 0, 0)(토막 11 가운데 바깥)에서 뚫는다(현과는 처짐만큼 떨어진다).
 * 비탈 '비탈'(G = (10, 0, 40) → (10, 0, 60)) — G에서 (20, 0, −40) 방향 선도 T를 지난다. 곧은 선분 '다'(x 60)
 */
const F: V3 = [R, 0, 40];
const G: V3 = [10, 0, 40];
const T: V3 = [R, 0, 0];
function ringLine(id: string, z = 0): Scene3d['lines'][number] {
  const P: number[] = [];
  for (let k = 0; k < 12; k++) P.push(...vtx(k, z), ...vtx(k + 1, z));
  return { id, positions: new Float32Array(P), segmentIds: new Uint32Array(Array.from({ length: 12 }, (_, k) => 100 + k)) };
}
const scene: Scene3d = {
  name: 't',
  units: 'mm',
  meshes: [],
  lines: [
    ringLine('원'),
    { id: '기둥', positions: new Float32Array([...F, R, 0, 60]) },
    { id: '비탈', positions: new Float32Array([...G, 10, 0, 60]) },
    { id: '다', positions: new Float32Array([60, -30, 0, 60, 50, 0]), segmentIds: new Uint32Array([7]) },
  ],
  points: [],
};

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(sc: Scene3d = scene, wire = true): View {
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
const clickAt = (w: View, p: readonly number[], dx = 0, dy = 0): void => {
  const s = at(w, p);
  clickXY(w, s.x + dx, s.y + dy);
};
type Snap = Parameters<Viewer3d['setMeasureSnap']>[0];
/** 첫 점(기둥·비탈 아래 끝 — 끝점)을 찍은 뷰 */
function withFirst(o: Snap, first: V3 = F, sc?: Scene3d): View {
  const w = view(sc);
  w.v.setMeasureMode(true);
  w.v.setMeasureSnap(o);
  clickAt(w, first, 1, 0);
  expect(w.v.measurePoints[0]!.point).toEqual([...first]);
  return w;
}
/** 앱의 정확한 원(z 평면): 'axisEdge'면 직선과 원의 교차, 그 밖은 null */
const exactRefine = (calls: SnapRefineInput[] = []) => (c: SnapRefineInput): V3 | null => {
  calls.push(c);
  if (c.kind !== 'axisEdge' || !c.line || c.segment.id !== '원') return null;
  return lineCircle(c.line.origin, c.line.dir, c.point, c.segment.ends[0][2]);
};
const AX = { inference: { axes: true, lock: true, axisEdges: true } } as const;

describe('Viewer3d: 첫 점 축과 꺾은선 토막의 열린 교차(0.20.0 refine — axisEdge, open)', () => {
  it('첫 점 Z축이 원 평면을 뚫는 자리(현과는 처짐만큼 떨어져 코어 교차가 없다)를 앱이 준 원 위 교차로 붙잡고, 찍은 거리는 정확하다', () => {
    const calls: SnapRefineInput[] = [];
    const w = withFirst({ ...AX, refine: exactRefine(calls) });
    const { v } = w;
    const s = at(w, T);
    hoverXY(w, s.x + 2, s.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ point: T, snap: 'axis', axis: 'z', direction: [0, 0, 1], refined: true });
    expect(h.segment).toEqual({ kind: 'line', id: '원', index: 111, raw: 11, ends: [vtx(11), vtx(12)].map((p) => Array.from(new Float32Array(p))) });
    expect(h).not.toHaveProperty('trackFrom');
    expect(h).not.toHaveProperty('locked');
    const open = calls.filter((c) => c.open);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ kind: 'axisEdge', point: T, first: F, line: { origin: F, dir: [0, 0, 1], axis: 'z' }, segment: { id: '원', index: 111 } });
    expect(open[0]!.ray.dir).toHaveLength(3);
    // 커서를 옮겨도(같은 선·토막) 다시 부르지 않고, 찍어도 부르지 않는다
    hoverXY(w, s.x + 4, s.y - 1);
    clickXY(w, s.x + 4, s.y - 1);
    expect(calls.filter((c) => c.open)).toHaveLength(1);
    const m = v.measurement()!;
    expect([m.distance, m.dx, m.dy, m.snapB, m.axisB, m.directionB]).toEqual([40, 0, 0, 'axis', 'z', [0, 0, 1]]);
    expect(v.measurePoints[1]).toMatchObject({ point: T, snap: 'axis', axis: 'z', refined: true, segment: { id: '원', index: 111 } });
    v.dispose();
  });

  it('refine 없이·null·선에서 벗어난 점·먼 점·이웃 곡선 위 점이면 0.19.0과 같다(첫 점 Z축 위 커서 자리)', () => {
    const plain = withFirst(AX);
    const s = at(plain, T);
    hoverXY(plain, s.x + 2, s.y + 1);
    const want = plain.v.measureHoverSnap!;
    plain.v.dispose();
    expect(want).toMatchObject({ snap: 'axis', axis: 'z' });
    expect(want).not.toHaveProperty('refined');
    expect(dist(want.point, T)).toBeGreaterThan(1e-3);
    const answers: ((c: SnapRefineInput) => readonly number[] | null)[] = [
      () => null,
      (c) => [c.point[0] + 0.6, c.point[1], c.point[2]],
      (c) => [c.point[0], c.point[1], c.point[2] - 30],
      () => [R * Math.cos(deg(20)), R * Math.sin(deg(20)), 0],
    ];
    for (const refine of answers) {
      const w = withFirst({ ...AX, refine });
      hoverXY(w, s.x + 2, s.y + 1);
      expect(w.v.measureHoverSnap).toEqual(want);
      w.v.dispose();
    }
  });

  it('Shift로 잠가도(lockEdges) 같은 선·토막이라 다시 부르지 않고 그 자리에 남는다. lockEdges가 없으면 0.19.0처럼 잠근 축 위 커서 자리', () => {
    for (const on of [true, false]) {
      const calls: SnapRefineInput[] = [];
      const w = withFirst({ inference: { ...AX.inference, ...(on ? { lockEdges: true } : {}) }, refine: exactRefine(calls) });
      const { v } = w;
      const s = at(w, T);
      hoverXY(w, s.x + 2, s.y + 1);
      expect(v.measureHoverSnap).toMatchObject({ point: T, refined: true });
      hoverXY(w, s.x + 2, s.y + 1, true);
      expect(v.measureInferenceLock).toMatchObject({ kind: 'axis', axis: 'z', source: 'shift' });
      const h = v.measureHoverSnap!;
      expect(h.locked).toBe(true);
      if (on) expect(h).toMatchObject({ point: T, refined: true, segment: { id: '원', index: 111 } });
      else {
        expect(h).not.toHaveProperty('refined');
        expect(h).not.toHaveProperty('segment');
      }
      expect(calls.filter((c) => c.open)).toHaveLength(1);
      v.dispose();
    }
  });

  it('앱 단추로 처음부터 잠그면(lockEdges) 그때 한 번 부르고, 입력은 잠그기 전 첫 점 축과 같은 열쇠다', () => {
    const calls: SnapRefineInput[] = [];
    const w = withFirst({ inference: { axes: true, lock: true, lockEdges: true }, refine: exactRefine(calls) });
    const { v } = w;
    v.setMeasureInferenceLock('z');
    const s = at(w, T);
    hoverXY(w, s.x + 2, s.y + 1);
    expect(v.measureHoverSnap).toMatchObject({ point: T, snap: 'axis', axis: 'z', locked: true, refined: true, segment: { id: '원' } });
    const open = calls.filter((c) => c.open);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ point: T, line: { origin: F, dir: [0, 0, 1], axis: 'z' } });
    v.dispose();
  });

  it('끌어온 축도(첫 점 전) — 끌어온 점을 trackFrom으로, 방향은 없다', () => {
    const calls: SnapRefineInput[] = [];
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { track: true }, refine: exactRefine(calls) });
    v.setMeasureTrackPoints([F]);
    const s = at(w, T);
    hoverXY(w, s.x + 2, s.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ point: T, snap: 'axis', axis: 'z', trackFrom: F, refined: true, segment: { id: '원' } });
    expect(h).not.toHaveProperty('direction');
    expect(calls.filter((c) => c.open)[0]).toMatchObject({ first: null, line: { origin: F, axis: 'z' } });
    v.dispose();
  });

  it('미리 보기 한 번에 앱 함수는 OPEN_REFINE_CALLS번까지만 새로 부르고, 남은 것은 다음 미리 보기에서 부른다', () => {
    // 높이를 조금씩 달리한 원 열 개를 같은 Z축이 뚫는다(모두 커서 둘레)
    const rings = Array.from({ length: 10 }, (_, i) => ringLine(`원${i}`, -0.08 * i));
    const sc: Scene3d = { ...scene, lines: [...rings, scene.lines[1]!] };
    let n = 0;
    const w = withFirst(
      {
        ...AX,
        refine: (c) => {
          if (c.open) n++;
          return null;
        },
      },
      F,
      sc,
    );
    const s = at(w, T);
    const per: number[] = [];
    for (let i = 0; i < 4; i++) {
      const k = n;
      hoverXY(w, s.x + 2, s.y + 1 + (i % 2));
      per.push(n - k);
    }
    expect(per[0]).toBe(OPEN_REFINE_CALLS);
    expect(per.reduce((a, b) => a + b, 0)).toBe(10);
    expect(per[3]).toBe(0);
    w.v.dispose();
  });
});

describe('Viewer3d: 축이 아닌 잠근 선의 다듬기(0.20.0 — SnapRefineLine.axis 없음)', () => {
  it('앱이 정한 방향으로 잠근 선이 원 평면을 뚫는 자리(열린 교차)를 원 위 교차로 붙잡는다', () => {
    const calls: SnapRefineInput[] = [];
    const w = withFirst({ inference: { lock: true, lockEdges: true }, refine: exactRefine(calls) }, G);
    const { v } = w;
    expect(v.setMeasureInferenceLock({ direction: [20, 0, -40] })).toBe(true);
    const s = at(w, T);
    hoverXY(w, s.x + 2, s.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'parallel', locked: true, refined: true, segment: { id: '원', index: 111 } });
    expect(dist(h.point, T)).toBeLessThan(1e-9);
    expect(h.point[1]).toBe(0);
    expect(h).not.toHaveProperty('axis');
    const open = calls.filter((c) => c.open);
    expect(open).toHaveLength(1);
    expect(open[0]!.line).not.toHaveProperty('axis');
    expect(open[0]!.line!.origin).toEqual(G);
    expect(dist(open[0]!.line!.dir, [1 / Math.sqrt(5), 0, -2 / Math.sqrt(5)])).toBeLessThan(1e-12);
    clickXY(w, s.x + 2, s.y + 1);
    const m = v.measurement()!;
    expect(m.distance).toBeCloseTo(Math.hypot(20, 40), 9);
    expect(m.lockedB).toBe(true);
    v.dispose();
  });

  it('축이 아닌 잠근 선이 곧은 선분과 3D로 만나는 점(lockEdges)도 축 이름 없는 직선으로 넘겨, 앱 점을 그 선 위로 내린 자리를 쓴다', () => {
    const calls: SnapRefineInput[] = [];
    // F에서 (1, 0, −4/3) 방향은 '다'(x 60)와 (60, 0, 0)에서
    const w = withFirst({
      inference: { lock: true, lockEdges: true },
      refine: (c) => {
        calls.push(c);
        return c.kind === 'axisEdge' && c.segment.id === '다' ? [c.point[0] + 0.03, c.point[1], c.point[2] - 0.04] : null;
      },
    });
    const { v } = w;
    expect(v.setMeasureInferenceLock({ direction: [30, 0, -40] })).toBe(true);
    const X: V3 = [60, 0, 0];
    const s = at(w, X);
    hoverXY(w, s.x + 1, s.y + 2);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'parallel', locked: true, refined: true, segment: { id: '다', index: 7 } });
    expect(dist(h.point, [60.03, 0, -0.04])).toBeLessThan(1e-9);
    const c0 = calls.find((c) => c.kind === 'axisEdge' && !c.open)!;
    expect(dist(c0.point, X)).toBeLessThan(1e-9);
    expect(c0.line).not.toHaveProperty('axis');
    expect(c0).not.toHaveProperty('open');
    // 같은 자리 Shift 없이 다시 가리켜도 같은 입력이라 다시 부르지 않는다
    const k = calls.length;
    hoverXY(w, s.x + 2, s.y + 1);
    expect(calls.slice(k).filter((c) => c.kind === 'axisEdge' && !c.open)).toHaveLength(0);
    v.dispose();
  });
});

describe('Viewer3d.pick: 그물 면만 고르기(0.20.0 meshesOnly)', () => {
  /** 상자(0~100, 0~80, 0~40) 윗면 위 선분 '금'((10, 40, 40) → (90, 40, 40))과 점, 상자 밖 선분 '밖' */
  const sc: Scene3d = {
    name: 'p',
    units: 'mm',
    meshes: [boxMesh('상자', [0, 0, 0], [100, 80, 40], [0.6, 0.6, 0.7, 1])],
    lines: [
      { id: '금', positions: new Float32Array([10, 40, 40, 90, 40, 40]) },
      { id: '밖', positions: new Float32Array([50, -60, 0, 150, -60, 0]) },
    ],
    points: [{ id: '점', positions: new Float32Array([50, 20, 40]) }],
  };

  it('면 위 선분·점 위에서도 그 아래 그물 면을 고르고(윤곽선 선택은 무시), 그물 면이 없으면 null', () => {
    // 와이어프레임(면이 선분·점을 가리지 않는다 — 보통 고르기는 선분·점이 먼저)
    const w = view(sc, true);
    const { v } = w;
    const s = at(w, [50, 40, 40]);
    const x = s.x + 0.5, y = s.y + 0.4;
    expect(v.pick(x, y)).toMatchObject({ kind: 'line', id: '금' });
    const m = v.pick(x, y, { meshesOnly: true })!;
    expect(m).toMatchObject({ kind: 'mesh', id: '상자', normal: [0, 0, 1] });
    expect(m.point[2]).toBeCloseTo(40, 6);
    expect(v.pick(x, y, { meshesOnly: true, edges: true })).toEqual(m);
    expect(v.pick(x, y, { meshesOnly: true, pointerType: 'touch' })).toMatchObject({ kind: 'mesh', id: '상자' });
    const p = at(w, [50, 20, 40]);
    expect(v.pick(p.x + 0.5, p.y + 0.5)).toMatchObject({ kind: 'point', id: '점' });
    expect(v.pick(p.x + 0.5, p.y + 0.5, { meshesOnly: true })).toMatchObject({ kind: 'mesh', id: '상자' });
    const o = at(w, [100, -60, 0]);
    expect(v.pick(o.x + 0.5, o.y + 0.5)).toMatchObject({ kind: 'line', id: '밖' });
    expect(v.pick(o.x + 0.5, o.y + 0.5, { meshesOnly: true })).toBeNull();
    v.dispose();
  });

  it('meshesOnly를 주지 않거나 false면 0.19.0 고르기 그대로(문자열·edges·touch)', () => {
    const w = view(sc, false);
    const { v } = w;
    const pts = [[50, 40, 40], [50, 20, 40], [100, -60, 0], [0, 0, 40], [60, 50, 40], [100, 80, 20]].map((q) => at(w, q));
    for (const { x, y } of pts)
      for (const [dx, dy] of [
        [0.5, 0.4],
        [3, -2],
      ]) {
        const X = x + dx!, Y = y + dy!;
        expect(v.pick(X, Y, { meshesOnly: false })).toEqual(v.pick(X, Y));
        expect(v.pick(X, Y, {})).toEqual(v.pick(X, Y));
        expect(v.pick(X, Y, { edges: true, meshesOnly: false })).toEqual(v.pick(X, Y, { edges: true }));
        expect(v.pick(X, Y, { pointerType: 'touch', meshesOnly: false })).toEqual(v.pick(X, Y, 'touch'));
      }
    v.dispose();
  });
});
