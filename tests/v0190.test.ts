/**
 * 0.19.0 잠근 선 위의 교차(MeasureInference.lockEdges·lockFaces)와 축이 면을 뚫는 점 다듬기(MeasureSnapOptions.refineFace — 'axisFace').
 * - 순수 함수: lockEdgeSnap(축·축이 아닌 방향, 끝점·나란함·첫 점 자리·단면·가림·커서가 첫 점 둘레·길이 0 방향), lockFaceSnap(축·비스듬한 방향·나란함·접힌 면),
 *   openRefineKey의 면 열쇠, normalizeInference의 lockEdges·lockFaces
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 잠근 X·Y·Z축과 선분의 교차·찍은 결과·선분 식별자, 꺼져 있으면 0.18.0과 같음, Shift로 잠가도 첫 점 축 교차 자리에 남음,
 *   점 붙잡기가 먼저(0.10.0 옮겨 오기), 축이 아닌 잠근 선, 잠근 Z축이 면을 뚫는 점, 선분 → 면 차례
 * - 다듬기: 잠근 축과 선분의 교차('axisEdge' — 잠그기 전과 기억을 함께), 축이 면을 뚫는 점(refineFace — 받기·버리기·기억, 잠근 축, 축이 아닌 잠근 선은 부르지 않음)
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, type ViewFrame, computeFrame, defaultCamera, dirToAngles, projectToScreen, screenRay, viewDepth, worldPerPixel } from '../src/camera';
import { normalizeInference } from '../src/inference';
import { type SnapRefineFaceInput, type SnapRefineInput, openRefineKey } from '../src/snap';
import { lockEdgeSnap, lockFaceSnap } from '../src/track';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

// ───────────── 순수 함수 ─────────────
describe('lockEdgeSnap(잠근 선과 선분의 교차)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const seg = (a: V3, b: V3, keep?: (p: readonly number[]) => boolean) => ({ a, b, wpp: worldPerPixel(f, viewDepth(f, a)), keep });
  const A: V3 = [0, 0, 0];

  it('잠근 축이 선분과 3D로 만나는 점(남은 두 좌표는 첫 점 그대로)·받은 선분 그대로, 방향 길이는 상관없다', () => {
    const S1 = seg([40, -20, 0], [40, 30, 0]);
    const S2 = seg([45, -20, 0], [45, 30, 0]);
    const [x, y] = at([40, 0, 0]);
    const r = lockEdgeSnap(f, A, [1, 0, 0], [S2, S1], x + 2, y + 1, 10)!;
    expect(r.p).toEqual([40, 0, 0]);
    expect(r.seg).toBe(S1);
    expect(r.distPx).toBeCloseTo(Math.hypot(2, 1), 9);
    expect(Object.keys(r).sort()).toEqual(['distPx', 'p', 'seg']);
    expect(lockEdgeSnap(f, A, [5, 0, 0], [S1], x + 2, y + 1, 10)!.p).toEqual([40, 0, 0]);
    // 멀면 없다, 선분이 없으면 없다, 길이 0·수가 아닌 방향이면 없다
    expect(lockEdgeSnap(f, A, [1, 0, 0], [S1], x + 30, y, 10)).toBeNull();
    expect(lockEdgeSnap(f, A, [1, 0, 0], [], x + 2, y + 1, 10)).toBeNull();
    expect(lockEdgeSnap(f, A, [0, 0, 0], [S1], x + 2, y + 1, 10)).toBeNull();
    expect(lockEdgeSnap(f, A, [Number.NaN, 0, 0], [S1], x + 2, y + 1, 10)).toBeNull();
  });

  it('축이 아닌 잠근 선(나란함·앱이 정한 방향)도 같은 계산', () => {
    // A에서 (1, 1, 0) 방향 선이 x = 40 선분과 (40, 40, 0)에서
    const S = seg([40, -10, 0], [40, 60, 0]);
    const [x, y] = at([40, 40, 0]);
    const r = lockEdgeSnap(f, A, [1, 1, 0], [S], x + 2, y + 1, 10)!;
    expect(dist(r.p, [40, 40, 0])).toBeLessThan(1e-9);
    expect(r.p[2]).toBe(0);
    // 같은 자리를 X축으로 잠그면 교차가 없다(그 선분과는 (40, 0, 0)에서 — 커서에서 멀다)
    expect(lockEdgeSnap(f, A, [1, 0, 0], [S], x + 2, y + 1, 10)).toBeNull();
  });

  it('비켜 지나가는 선분·선분 끝점·잠근 선과 나란한 선분·첫 점을 지나는 선분·단면에 잘린 쪽·가린 점·커서가 첫 점 둘레면 뺀다', () => {
    const [x, y] = at([40, 0, 0]);
    const X: V3 = [1, 0, 0];
    expect(lockEdgeSnap(f, A, X, [seg([40, -20, 3], [40, 30, 3])], x + 2, y + 1, 10)).toBeNull();
    expect(lockEdgeSnap(f, A, X, [seg([40, 0, 0], [40, 30, 0])], x + 2, y + 1, 10)).toBeNull();
    expect(lockEdgeSnap(f, A, X, [seg([20, 0, 0], [60, 0, 0])], x + 2, y + 1, 10)).toBeNull();
    const [dx, dy] = at([30, 30, 0]);
    expect(lockEdgeSnap(f, A, [1, 1, 0], [seg([-20, -20, 0], [40, 40, 0])], dx + 1, dy + 1, 10)).toBeNull();
    expect(lockEdgeSnap(f, A, X, [seg([40, -20, 0], [40, 30, 0], (q) => q[0]! < 20)], x + 2, y + 1, 10)).toBeNull();
    const asked: V3[] = [];
    expect(
      lockEdgeSnap(f, A, X, [seg([40, -20, 0], [40, 30, 0])], x + 2, y + 1, 10, (q) => {
        asked.push(q);
        return false;
      }),
    ).toBeNull();
    expect(asked).toEqual([[40, 0, 0]]);
    const S = seg([3, -20, 0], [3, 20, 0]);
    const [sx, sy] = at([3, 0, 0]);
    expect(lockEdgeSnap(f, A, X, [S], sx + 1, sy + 1, 25)).toBeNull();
    expect(lockEdgeSnap(f, A, X, [S], sx + 1, sy + 1, 3)).toMatchObject({ p: [3, 0, 0] });
  });

  it('여러 선분이면 커서에 가까운 것, 같으면 앞 선분', () => {
    const S1 = seg([40, -10, 0], [40, 40, 0]);
    const S1b = seg([40, -20, 0], [40, 30, 0]);
    const [x, y] = at([40, 0, 0]);
    expect(lockEdgeSnap(f, A, [1, 0, 0], [S1, S1b], x + 2, y + 1, 10)!.seg).toBe(S1);
    expect(lockEdgeSnap(f, A, [1, 0, 0], [S1b, S1], x + 2, y + 1, 10)!.seg).toBe(S1b);
  });
});

describe('lockFaceSnap(잠근 선과 면의 교차)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [40, 30, 10], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [40, 30, 10], radius: 60 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  type Hit = { point: V3; normal: V3; name: string };
  const surface =
    (parts: { name: string; q: V3; n: V3; inside: (p: V3) => boolean }[]) =>
    (frame: ViewFrame, sx: number, sy: number): Hit | null => {
      const r = screenRay(frame, sx, sy);
      let best: { t: number; h: Hit } | null = null;
      for (const s of parts) {
        const den = s.n[0] * r.dir[0] + s.n[1] * r.dir[1] + s.n[2] * r.dir[2];
        if (Math.abs(den) < 1e-12) continue;
        const t = (s.n[0] * (s.q[0] - r.origin[0]) + s.n[1] * (s.q[1] - r.origin[1]) + s.n[2] * (s.q[2] - r.origin[2])) / den;
        const p: V3 = [r.origin[0] + r.dir[0] * t, r.origin[1] + r.dir[1] * t, r.origin[2] + r.dir[2] * t];
        if (t > 0 && s.inside(p) && (!best || t < best.t)) best = { t, h: { point: p, normal: s.n, name: s.name } };
      }
      return best?.h ?? null;
    };
  const floor = { name: '바닥', q: [0, 0, 0] as V3, n: [0, 0, 1] as V3, inside: (p: V3) => p[0] >= 0 && p[0] <= 100 && p[1] >= 0 && p[1] <= 80 };
  const flat = surface([floor]);
  const O: V3 = [40, 30, 50];
  const M: V3 = [40, 30, 0];

  it('잠근 Z축이 커서 아래 면을 뚫는 점(정확히 축 위)·면 맞음 그대로', () => {
    const [x, y] = at(M);
    const under = flat(f, x + 2, y + 1)!;
    const r = lockFaceSnap(f, O, [0, 0, 1], x + 2, y + 1, 10, under, (sx, sy) => flat(f, sx, sy))!;
    expect(r.p).toEqual(M);
    expect(r.hit.name).toBe('바닥');
    expect(r.distPx).toBeCloseTo(Math.hypot(2, 1), 6);
    expect(Object.keys(r).sort()).toEqual(['distPx', 'hit', 'p']);
    // 방향 길이·부호는 상관없다
    expect(lockFaceSnap(f, O, [0, 0, -4], x + 2, y + 1, 10, under, (sx, sy) => flat(f, sx, sy))!.p).toEqual(M);
  });

  it('비스듬한 잠근 선도 같은 계산이고, 면과 나란한 선·커서 아래 면 없음·커서가 첫 점 둘레·면 밖·멀면 없다', () => {
    // O에서 (1, 0, −1) 방향은 바닥을 (90, 30, 0)에서 뚫는다
    const N: V3 = [90, 30, 0];
    const [nx, ny] = at(N);
    const r = lockFaceSnap(f, O, [1, 0, -1], nx + 2, ny + 1, 10, flat(f, nx + 2, ny + 1), (sx, sy) => flat(f, sx, sy))!;
    expect(dist(r.p, N)).toBeLessThan(1e-9);
    const [x, y] = at(M);
    const under = flat(f, x + 2, y + 1)!;
    expect(lockFaceSnap(f, O, [1, 0, 0], x + 2, y + 1, 10, under, (sx, sy) => flat(f, sx, sy))).toBeNull();
    expect(lockFaceSnap(f, O, [0, 0, 1], x + 2, y + 1, 10, null, (sx, sy) => flat(f, sx, sy))).toBeNull();
    expect(lockFaceSnap(f, O, [0, 0, 1], x + 30, y, 10, flat(f, x + 30, y), (sx, sy) => flat(f, sx, sy))).toBeNull();
    const small = surface([{ ...floor, inside: (p: V3) => p[0] >= 0 && p[0] <= 30 }]);
    expect(lockFaceSnap(f, O, [0, 0, 1], x + 2, y + 1, 10, under, (sx, sy) => small(f, sx, sy))).toBeNull();
    const [ox, oy] = at(O);
    const reach = Math.hypot(ox - x - 2, oy - y - 1);
    expect(lockFaceSnap(f, O, [0, 0, 1], x + 2, y + 1, reach + 1, under, (sx, sy) => flat(f, sx, sy))).toBeNull();
    expect(lockFaceSnap(f, O, [0, 0, 1], x + 2, y + 1, reach - 1, under, (sx, sy) => flat(f, sx, sy))).not.toBeNull();
    // 첫 점이 면 위(교차가 그 점)면 없다
    expect(lockFaceSnap(f, M, [0, 0, 1], x + 2, y + 1, 10, under, (sx, sy) => flat(f, sx, sy))).toBeNull();
  });

  it('접힌 면: 커서 아래 면의 평면으로 구한 점이 다른 면 위면 그 면으로 다시 구한다(steps번까지)', () => {
    const ramp = { name: '내리막', q: [40, 0, 0] as V3, n: [Math.SQRT1_2, 0, Math.SQRT1_2] as V3, inside: (p: V3) => p[0] >= 40 && p[0] <= 100 && p[1] >= 0 && p[1] <= 80 };
    const fold = surface([{ ...floor, inside: (p: V3) => p[0] >= 0 && p[0] < 40 && p[1] >= 0 && p[1] <= 80 }, ramp]);
    const A: V3 = [42, 30, 60];
    const [cx, cy] = at([39.5, 30, 0]);
    const under = fold(f, cx, cy)!;
    expect(under.name).toBe('바닥');
    const r = lockFaceSnap(f, A, [0, 0, 1], cx, cy, 25, under, (sx, sy) => fold(f, sx, sy))!;
    expect(r.hit.name).toBe('내리막');
    expect(r.p[0]).toBe(42);
    expect(r.p[2]).toBeCloseTo(-2, 9);
    expect(lockFaceSnap(f, A, [0, 0, 1], cx, cy, 25, under, (sx, sy) => fold(f, sx, sy), 1)).toBeNull();
  });
});

describe('openRefineKey(면)·normalizeInference.lockEdges·lockFaces', () => {
  it('면 열쇠는 그물 id·삼각형 번호·법선·축 직선·첫 점마다 다르고 커서 광선은 없다. 선분 열쇠는 0.18.0 그대로', () => {
    const base: SnapRefineFaceInput = {
      kind: 'axisFace',
      point: [1, 2, 3],
      face: { id: '상자', index: 4, normal: [0, 0, 1] },
      line: { origin: [1, 2, 9], dir: [0, 0, 1], axis: 'z' },
      first: [1, 2, 9],
      ray: { origin: [9, 9, 9], dir: [0, 0, -1] },
    };
    const k = openRefineKey(base);
    expect(k.startsWith('axisFace#1,2,3#face|')).toBe(true);
    const moved: SnapRefineFaceInput = { ...base, ray: { origin: [0, 0, 0], dir: [1, 0, 0] } };
    expect(openRefineKey(moved)).toBe(k);
    for (const c of [
      { ...base, face: { ...base.face, id: '상자2' } },
      { ...base, face: { ...base.face, index: 5 } },
      { ...base, face: { ...base.face, normal: [0, 0, -1] as V3 } },
      { ...base, line: { ...base.line, origin: [1, 2, 8] as V3 } },
      { ...base, line: { ...base.line, axis: 'x' as const, dir: [1, 0, 0] as V3 } },
      { ...base, first: null },
      { ...base, point: [1, 2, 3.5] as V3 },
    ])
      expect(openRefineKey(c)).not.toBe(k);
    // 그물 id에 구분 글자가 있어도 다른 열쇠
    expect(openRefineKey({ ...base, face: { ...base.face, id: '가|4' }, point: [1, 2, 3] })).not.toBe(openRefineKey({ ...base, face: { ...base.face, id: '가' } }));
    const seg = { kind: 'line' as const, id: 's', index: 3, raw: 3, ends: [[0, 0, 0], [1, 0, 0]] as [V3, V3] };
    const edge: SnapRefineInput = { kind: 'axisEdge', point: [1, 2, 3], segment: seg, first: [0, 0, 0], ray: { origin: [9, 9, 9], dir: [0, 0, -1] }, line: { origin: [0, 0, 0], dir: [1, 0, 0], axis: 'x' } };
    expect(openRefineKey(edge)).toBe('axisEdge#1,2,3#line|1:s|3|3|0,0,0|1,0,0#-#0,0,0#x|0,0,0|1,0,0');
  });

  it('lockEdges·lockFaces는 켰을 때만 붙고(true에 들지 않는다), 그것만 켜도 선택이 남는다', () => {
    expect(normalizeInference(true)).not.toHaveProperty('lockEdges');
    expect(normalizeInference(true)).not.toHaveProperty('lockFaces');
    expect(normalizeInference({ lock: true, lockEdges: false, lockFaces: false })).toEqual({ intersections: false, perpendicular: false, axes: false, parallel: false, lock: true });
    expect(normalizeInference({ lockEdges: true })).toEqual({ intersections: false, perpendicular: false, axes: false, parallel: false, lock: false, lockEdges: true });
    expect(normalizeInference({ lockFaces: true })).toEqual({ intersections: false, perpendicular: false, axes: false, parallel: false, lock: false, lockFaces: true });
    expect(normalizeInference({ axes: true, axisEdges: true, lockEdges: true, lockFaces: true })).toMatchObject({ axisEdges: true, lockEdges: true, lockFaces: true });
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
 * 장면(0.18.0 시험과 같다): 첫 점 A = (0,0,0)('가'의 끝). X축이 '다'(x 100, 원본 번호 7)와 XE = (100, 0, 0)에서, Y축이 '사'(y 60)와 YE에서,
 * Z축이 '자'(z 50)와 ZE에서 만난다
 */
const A: V3 = [0, 0, 0];
const XE: V3 = [100, 0, 0];
const YE: V3 = [0, 60, 0];
const ZE: V3 = [0, 0, 50];
const scene: Scene3d = {
  name: 't',
  units: 'mm',
  meshes: [],
  lines: [
    { id: '가', positions: new Float32Array([...A, 0, -20, 0]) },
    { id: '다', positions: new Float32Array([100, -30, 0, 100, 50, 0]), segmentIds: new Uint32Array([7]) },
    { id: '사', positions: new Float32Array([-40, 60, 0, 40, 60, 0]) },
    { id: '자', positions: new Float32Array([-20, 0, 50, 20, 0, 50]) },
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
/** 화면에서 세계 점 p에서 q 쪽으로 n화소, 그 옆으로 0.5화소 옮긴 자리(선 위를 정확히 가리키지 않게) */
const toward = (w: View, p: readonly number[], q: readonly number[], n: number): { x: number; y: number } => {
  const a = at(w, p), b = at(w, q);
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
  return { x: a.x + ux * n - uy * 0.5, y: a.y + uy * n + ux * 0.5 };
};
const LOCK_EDGES = { inference: { axes: true, lock: true, lockEdges: true } } as const;
function withFirst(o: Parameters<Viewer3d['setMeasureSnap']>[0], sc?: Scene3d, first: readonly number[] = A, wire = true): View {
  const w = view(sc, wire);
  w.v.setMeasureMode(true);
  w.v.setMeasureSnap(o);
  clickAt(w, first, 0, 1);
  expect(w.v.measurePoints[0]!.point).toEqual([...first]);
  return w;
}

describe('Viewer3d: 잠근 선과 선분의 교차(0.19.0 lockEdges)', () => {
  it('잠근 X축이 선분과 만나는 자리에 찍고 잠근 값과 그 선분이 실린다. 두 점째 결과는 잠근 X축', () => {
    const w = withFirst(LOCK_EDGES);
    const { v } = w;
    expect(v.measureSnap!.inference).toMatchObject({ lockEdges: true });
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    const c = toward(w, XE, [100, 40, 0], 3);
    hoverXY(w, c.x, c.y);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ point: XE, snap: 'axis', axis: 'x', direction: [1, 0, 0], locked: true });
    expect(h.segment).toEqual({ kind: 'line', id: '다', index: 7, raw: 0, ends: [[100, -30, 0], [100, 50, 0]] });
    expect(h).not.toHaveProperty('from');
    expect(h).not.toHaveProperty('face');
    expect(h).not.toHaveProperty('refined');
    clickXY(w, c.x, c.y);
    const m = v.measurement()!;
    expect([m.distance, m.snapB, m.axisB, m.directionB, m.lockedB, m.dy, m.dz]).toEqual([100, 'axis', 'x', [1, 0, 0], true, 0, 0]);
    expect(v.measurePoints[1]).toMatchObject({ point: XE, snap: 'axis', axis: 'x', locked: true, segment: { id: '다', index: 7 } });
    v.dispose();
  });

  it('잠근 Y·Z축도 — 꺼져 있으면(lock만) 0.18.0처럼 잠근 축 위 커서 자리이고 선분이 없다', () => {
    const rows: unknown[] = [];
    for (const on of [true, false]) {
      const w = withFirst({ inference: { axes: true, lock: true, ...(on ? { lockEdges: true } : {}) } });
      const { v } = w;
      v.setMeasureInferenceLock('y');
      const c = toward(w, YE, [30, 60, 0], 3);
      hoverXY(w, c.x, c.y);
      const hy = v.measureHoverSnap!;
      v.setMeasureInferenceLock('z');
      const c2 = toward(w, ZE, [20, 0, 50], 3);
      hoverXY(w, c2.x, c2.y);
      const hz = v.measureHoverSnap!;
      if (on) {
        expect(hy).toMatchObject({ point: YE, axis: 'y', locked: true, segment: { id: '사' } });
        expect(hz).toMatchObject({ point: ZE, axis: 'z', locked: true, segment: { id: '자' } });
      } else {
        for (const h of [hy, hz]) {
          expect(h.locked).toBe(true);
          expect(h).not.toHaveProperty('segment');
        }
        expect(hy.point).not.toEqual(YE);
        expect(hy.point[0]).toBe(0);
        expect(hy.point[2]).toBe(0);
        expect(hz.point).not.toEqual(ZE);
      }
      rows.push(on);
      v.dispose();
    }
    expect(rows).toEqual([true, false]);
  });

  it('Shift로 잠가도 첫 점 축 교차 자리에 남는다(axisEdges 미리 보기 → 잠금 — 0.18.0은 축 위 커서 자리로 옮겨 갔다)', () => {
    const pts: V3[] = [];
    for (const on of [true, false]) {
      const w = withFirst({ inference: { axes: true, lock: true, axisEdges: true, ...(on ? { lockEdges: true } : {}) } });
      const { v } = w;
      const c = toward(w, XE, [100, 40, 0], 3);
      hoverXY(w, c.x, c.y);
      expect(v.measureHoverSnap).toMatchObject({ point: XE, segment: { id: '다' } });
      hoverXY(w, c.x, c.y, true);
      expect(v.measureInferenceLock).toMatchObject({ kind: 'axis', axis: 'x', source: 'shift' });
      const h = v.measureHoverSnap!;
      expect(h.locked).toBe(true);
      if (on) expect(h).toMatchObject({ point: XE, segment: { id: '다' } });
      else expect(h).not.toHaveProperty('segment');
      pts.push(h.point);
      hoverXY(w, c.x, c.y, false);
      expect(v.measureInferenceLock).toBeNull();
      v.dispose();
    }
    expect(pts[0]).toEqual(XE);
    expect(pts[1]).not.toEqual(XE);
  });

  it('차례: 커서 아래 점 붙잡기가 있으면 0.10.0처럼 그 점을 잠근 선에 내린 자리, 커서가 첫 점 둘레면 교차를 보지 않는다', () => {
    const w = withFirst(LOCK_EDGES);
    const { v } = w;
    v.setMeasureInferenceLock('x');
    // '다'의 끝점 (100, 50, 0) — X축에 내리면 (100, 0, 0)
    const e = at(w, [100, 50, 0]);
    hoverXY(w, e.x + 1, e.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ point: XE, locked: true, from: [100, 50, 0], fromSnap: 'endpoint' });
    expect(h).not.toHaveProperty('segment');
    // 첫 점 둘레('가' 위): 교차 없이 잠근 선 위 커서 자리
    const g = toward(w, A, [0, -20, 0], 4);
    hoverXY(w, g.x, g.y);
    expect(v.measureHoverSnap!.locked).toBe(true);
    expect(v.measureHoverSnap).not.toHaveProperty('segment');
    v.dispose();
  });

  it('축이 아닌 잠근 선(앱이 정한 방향)도 선분과 만나는 자리에 찍는다(0.20.0부터 다듬기도 부른다 — null이면 그 자리 그대로, v0200.test.ts)', () => {
    let n = 0;
    const w = withFirst({
      ...LOCK_EDGES,
      refine: (c) => {
        if (c.kind === 'axisEdge') n++;
        return null;
      },
    });
    const { v } = w;
    // (1, 0.4, 0) 방향이 '다'와 (100, 40, 0)에서
    expect(v.setMeasureInferenceLock({ direction: [1, 0.4, 0] })).toBe(true);
    const P: V3 = [100, 40, 0];
    const c = toward(w, P, [100, 0, 0], 3);
    hoverXY(w, c.x, c.y);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('parallel');
    expect(h.locked).toBe(true);
    expect(dist(h.point, P)).toBeLessThan(1e-9);
    expect(h.point[2]).toBe(0);
    expect(h.segment).toMatchObject({ id: '다', index: 7 });
    expect(h).not.toHaveProperty('axis');
    expect(h).not.toHaveProperty('refined');
    // 0.19.0은 0번(축이 아닌 잠근 선은 넘기지 않았다), 0.20.0은 축 이름 없는 직선으로 한 번
    expect(n).toBe(1);
    v.dispose();
  });
});

describe('Viewer3d: 잠근 선과 면의 교차(0.19.0 lockFaces)', () => {
  /** 상자(0~120, 0~80, 0~40)와 기둥 선분((60, 40, 90) → (60, 40, 120)) — 기둥 아래 끝 C의 Z축이 윗면을 T = (60, 40, 40)에서 뚫는다 */
  const C: V3 = [60, 40, 90];
  const T: V3 = [60, 40, 40];
  const faceScene: Scene3d = {
    name: 'f',
    units: 'mm',
    meshes: [boxMesh('상자', [0, 0, 0], [120, 80, 40], [0.6, 0.6, 0.7, 1])],
    lines: [{ id: '기둥', positions: new Float32Array([...C, 60, 40, 120]) }],
    points: [],
  };
  const faceFirst = (o: Parameters<Viewer3d['setMeasureSnap']>[0], sc = faceScene): View => {
    const w = view(sc, false);
    w.v.setMeasureMode(true);
    w.v.setMeasureSnap(o);
    clickAt(w, C, 1, 0);
    expect(w.v.measurePoints[0]!.point).toEqual(C);
    return w;
  };

  it('잠근 Z축이 상자 윗면을 뚫는 점에 찍고 그 면이 실린다. 꺼져 있으면 0.18.0처럼 잠근 축 위 커서 자리', () => {
    for (const on of [true, false]) {
      const w = faceFirst({ inference: { axes: true, lock: true, ...(on ? { lockFaces: true } : {}) } });
      const { v } = w;
      v.setMeasureInferenceLock('z');
      const s = at(w, T);
      hoverXY(w, s.x + 3, s.y + 1);
      const h = v.measureHoverSnap!;
      expect(h).toMatchObject({ snap: 'axis', axis: 'z', direction: [0, 0, 1], locked: true });
      expect(h).not.toHaveProperty('segment');
      if (on) {
        expect(h.point).toEqual(T);
        expect(h.face).toMatchObject({ id: '상자', normal: [0, 0, 1] });
        clickXY(w, s.x + 3, s.y + 1);
        const m = v.measurement()!;
        expect([m.distance, m.snapB, m.axisB, m.lockedB]).toEqual([50, 'axis', 'z', true]);
        expect(v.measurePoints[1]).toMatchObject({ point: T, locked: true, face: { id: '상자', normal: [0, 0, 1] } });
      } else {
        expect(h.point).not.toEqual(T);
        expect(h).not.toHaveProperty('face');
      }
      v.dispose();
    }
  });

  it('Shift로 잠가도 축이 면을 뚫는 자리에 남는다(axisFaces 미리 보기 → 잠금)', () => {
    const w = faceFirst({ inference: { axes: true, lock: true, axisFaces: true, lockFaces: true } });
    const { v } = w;
    const s = at(w, T);
    hoverXY(w, s.x + 3, s.y + 1);
    expect(v.measureHoverSnap).toMatchObject({ point: T, face: { id: '상자' } });
    expect(v.measureHoverSnap).not.toHaveProperty('locked');
    hoverXY(w, s.x + 3, s.y + 1, true);
    expect(v.measureHoverSnap).toMatchObject({ point: T, locked: true, face: { id: '상자' } });
    v.dispose();
  });

  it('차례: 선분 교차가 면보다 먼저(같은 자리면 선분 — 면의 테두리·면 위 금이 더 구체적이다)', () => {
    // 윗면 위 금 (30, 40, 40) → (90, 40, 40)이 T를 지난다
    const sc = { ...faceScene, lines: [...faceScene.lines, { id: '금', positions: new Float32Array([30, 40, 40, 90, 40, 40]) }] };
    const w = faceFirst({ inference: { axes: true, lock: true, lockEdges: true, lockFaces: true } }, sc);
    const { v } = w;
    v.setMeasureInferenceLock('z');
    const c = toward(w, T, [90, 40, 40], 3);
    hoverXY(w, c.x, c.y);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ point: T, locked: true, segment: { id: '금' } });
    expect(h).not.toHaveProperty('face');
    v.dispose();
  });

  it('축이 면을 뚫는 점 다듬기(refineFace): 면·축 직선을 넘기고 앱 점을 축 위로 내린 자리를 찍는다. 커서 광선을 뺀 입력으로 기억한다', () => {
    const calls: SnapRefineFaceInput[] = [];
    const kinds: string[] = [];
    const w = faceFirst({
      inference: { axes: true, lock: true, axisFaces: true, lockFaces: true },
      refine: (c) => {
        kinds.push(c.kind);
        return null;
      },
      refineFace: (c) => {
        calls.push(c);
        // 앱 곡면과 Z축의 교차(축에서 셈 오차만큼 벗어난 값)
        return [c.point[0] + 1e-12, c.point[1] - 1e-12, c.point[2] + 0.25];
      },
    });
    const { v } = w;
    expect(typeof v.measureSnap!.refineFace).toBe('function');
    const s = at(w, T);
    hoverXY(w, s.x + 3, s.y + 1);
    expect(calls).toHaveLength(1);
    const c0 = calls[0]!;
    expect(c0).toMatchObject({ kind: 'axisFace', point: T, first: C, line: { origin: C, dir: [0, 0, 1], axis: 'z' }, face: { id: '상자', normal: [0, 0, 1] } });
    expect(Number.isInteger(c0.face.index)).toBe(true);
    expect(c0).not.toHaveProperty('segment');
    expect(c0.ray.dir).toHaveLength(3);
    expect(kinds).not.toContain('axisFace');
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ point: [60, 40, 40.25], refined: true, snap: 'axis', axis: 'z', direction: [0, 0, 1], face: { id: '상자' } });
    // 커서를 옮겨도(같은 코어 점·면·축) 다시 부르지 않고, Shift로 잠가도 같은 입력이라 부르지 않는다
    hoverXY(w, s.x + 5, s.y + 2);
    hoverXY(w, s.x + 5, s.y + 2, true);
    expect(v.measureHoverSnap).toMatchObject({ point: [60, 40, 40.25], refined: true, locked: true, face: { id: '상자' } });
    expect(calls).toHaveLength(1);
    clickXY(w, s.x + 5, s.y + 2, true);
    expect(calls).toHaveLength(1);
    const m = v.measurement()!;
    expect(m.distance).toBeCloseTo(49.75, 12);
    expect([m.dx, m.dy]).toEqual([0, 0]);
    expect(v.measurePoints[1]).toMatchObject({ point: [60, 40, 40.25], refined: true, locked: true });
    v.dispose();
  });

  it('refineFace가 null·축에서 벗어난 점·먼 점·수가 아닌 값이면 삼각형 위 점 그대로 — 주지 않은 것과 같다', () => {
    const o = { inference: { axes: true, lock: true, axisFaces: true } } as const;
    const plain = faceFirst(o);
    const s = at(plain, T);
    hoverXY(plain, s.x + 3, s.y + 1);
    const want = plain.v.measureHoverSnap;
    plain.v.dispose();
    expect(want).toMatchObject({ point: T });
    for (const refineFace of [() => null, () => [65, 40, 40.25], () => [60, 40, -300], () => [Number.NaN, 0, 0], () => 'x' as never]) {
      const w = faceFirst({ ...o, refineFace });
      hoverXY(w, s.x + 3, s.y + 1);
      expect(w.v.measureHoverSnap).toEqual(want);
      w.v.dispose();
    }
  });

  it('끌어온 축이 면을 뚫는 점도 그 끌어온 점을 지나는 축 직선으로 넘긴다(0.20.0부터 축이 아닌 잠근 선도 넘긴다)', () => {
    const calls: SnapRefineFaceInput[] = [];
    const w = view(faceScene, false);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({
      inference: { axes: true, lock: true, track: true, axisFaces: true, lockFaces: true },
      refineFace: (c) => {
        calls.push(c);
        return [c.point[0], c.point[1], c.point[2] + 0.25];
      },
    });
    const P: V3 = [100, 20, 70];
    v.setMeasureTrackPoints([P]);
    const s = at(w, [100, 20, 40]);
    hoverXY(w, s.x + 3, s.y + 1);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ point: [100, 20, 40], first: null, line: { origin: P, dir: [0, 0, 1], axis: 'z' } });
    expect(v.measureHoverSnap).toMatchObject({ point: [100, 20, 40.25], refined: true, trackFrom: P, face: { id: '상자' } });
    // 첫 점 C에서 (0.2, 0, −1) 방향으로 잠근 선은 윗면을 (70, 40, 40)에서 뚫는다 — 0.19.0은 다듬지 않았고, 0.20.0은 축 이름 없는 직선으로 넘긴다
    v.setMeasureTrackPoints(null);
    clickAt(w, C, 1, 0);
    expect(v.measurePoints[0]!.point).toEqual(C);
    expect(v.setMeasureInferenceLock({ direction: [0.2, 0, -1] })).toBe(true);
    const q = at(w, [70, 40, 40]);
    hoverXY(w, q.x + 3, q.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'parallel', locked: true, face: { id: '상자' } });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.line).not.toHaveProperty('axis');
    expect(dist(calls[1]!.point, [70, 40, 40])).toBeLessThan(1e-9);
    v.dispose();
  });

  it('refineFace만 줘도 붙잡기가 켜지고(measureSnap에 그대로), 면 교차를 켜지 않으면 축이 면을 뚫는 점으로는 부르지 않는다(0.21.0부터 면 위 점은 onFace — v0210.test.ts)', () => {
    let n = 0;
    const kinds: string[] = [];
    const fnc = (c: SnapRefineFaceInput): null => {
      kinds.push(c.kind);
      if (c.kind === 'axisFace') n++;
      return null;
    };
    const w = faceFirst({ refineFace: fnc });
    const { v } = w;
    expect(v.measureSnap).not.toBeNull();
    expect(v.measureSnap!.refineFace).toBe(fnc);
    const s = at(w, T);
    hoverXY(w, s.x + 3, s.y + 1);
    expect(n).toBe(0);
    // 0.19.0·0.20.0은 한 번도 부르지 않았고, 0.21.0은 붙잡지 않은 면 위 점을 'onFace'로 한 번 넘긴다
    expect(kinds).toEqual(['onFace']);
    v.setMeasureSnap({ inference: { axes: true } });
    expect(v.measureSnap).not.toHaveProperty('refineFace');
    v.dispose();
  });
});

describe('Viewer3d: 잠근 축과 선분의 교차 다듬기(0.19.0 refine — axisEdge)', () => {
  it('잠근 X축이 선분과 만나는 점을 축 직선과 함께 넘기고, 잠그기 전 첫 점 축 교차와 같은 입력이라 다시 부르지 않는다', () => {
    const calls: SnapRefineInput[] = [];
    const w = withFirst({
      inference: { axes: true, lock: true, axisEdges: true, lockEdges: true },
      refine: (c) => {
        calls.push(c);
        return c.kind === 'axisEdge' ? [c.point[0] + 0.3, c.point[1], c.point[2]] : null;
      },
    });
    const { v } = w;
    const c = toward(w, XE, [100, 40, 0], 3);
    hoverXY(w, c.x, c.y);
    expect(calls.filter((k) => k.kind === 'axisEdge')).toHaveLength(1);
    expect(v.measureHoverSnap).toMatchObject({ point: [100.3, 0, 0], refined: true });
    hoverXY(w, c.x, c.y, true);
    expect(v.measureHoverSnap).toMatchObject({ point: [100.3, 0, 0], refined: true, locked: true, segment: { id: '다' } });
    expect(calls.filter((k) => k.kind === 'axisEdge')).toHaveLength(1);
    v.dispose();
    // 앱 단추로 처음부터 잠그면 그때 한 번 부른다(입력은 같은 축 직선)
    const got: SnapRefineInput[] = [];
    const w2 = withFirst({
      ...LOCK_EDGES,
      refine: (k) => {
        got.push(k);
        return k.kind === 'axisEdge' ? [k.point[0] + 0.3, k.point[1], k.point[2]] : null;
      },
    });
    w2.v.setMeasureInferenceLock('x');
    hoverXY(w2, c.x, c.y);
    const ae = got.filter((k) => k.kind === 'axisEdge');
    expect(ae).toHaveLength(1);
    expect(ae[0]).toMatchObject({ point: XE, first: A, line: { origin: A, dir: [1, 0, 0], axis: 'x' }, segment: { id: '다', index: 7 } });
    expect(w2.v.measureHoverSnap).toMatchObject({ point: [100.3, 0, 0], refined: true, locked: true });
    // 꺼져 있으면(lockEdges 없음) 0.18.0처럼 잠근 동안 부르지 않는다
    w2.v.dispose();
    let n = 0;
    const w3 = withFirst({
      inference: { axes: true, lock: true, axisEdges: true },
      refine: (k) => {
        if (k.kind === 'axisEdge') n++;
        return null;
      },
    });
    w3.v.setMeasureInferenceLock('x');
    hoverXY(w3, c.x, c.y);
    expect(w3.v.measureHoverSnap!.locked).toBe(true);
    expect(n).toBe(0);
    w3.v.dispose();
  });
});
