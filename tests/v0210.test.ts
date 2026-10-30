/**
 * 0.21.0 다듬기 기억만 비우기(Viewer3d.clearMeasureRefine), 잠근 선과 끌어온 축의 교차(MeasureInference.lockTracks — track.ts lockTrackSnap),
 * 붙잡지 않은 면 위 점 다듬기(refineFace — 'onFace', snap.ts acceptOnFace).
 * - 순수 함수: lockTrackSnap(축 잠금의 나란한 자리 — trackCrossSnap과 같은 수, 축이 아닌 잠근 선과 끌어온 축의 3D 교차, 빼는 것, 차례, 앱의 그리기 축),
 *   acceptOnFace(광선 위로 내리기·삼각형 크기로 자르기), RefineMemo.clear, normalizeInference의 lockTracks, openRefineKey의 'onFace'
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 잠근 축·축이 아닌 잠근 선과 끌어온 축의 교차, Shift로 잠가도 나란한 자리에 남음, 꺼져 있으면 0.20.0과 같음,
 *   잠근 선과 선분의 교차보다 먼저, 다듬기 기억만 비우기(잠금·끌어온 점·찍은 점은 그대로), 면 위 점 다듬기(받기·버리기·기억·잠금 중·점 붙잡기·구)
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { fake2d } from './fakegl';
import { DARK_THEME } from '../src/theme';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, screenRay, viewDepth, worldPerPixel } from '../src/camera';
import { normalizeInference } from '../src/inference';
import { ON_FACE_CHORD, RefineMemo, type SnapRefineFaceInput, type SnapRefineInput, acceptOnFace, openRefineKey } from '../src/snap';
import { lockTrackSnap, trackCrossSnap } from '../src/track';
import { boxMesh, sphereMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
/** 점 q에서 광선(o, 단위 d)까지 거리 */
const rayGap = (q: readonly number[], o: readonly number[], d: readonly number[]): number => {
  const w = [q[0]! - o[0]!, q[1]! - o[1]!, q[2]! - o[2]!];
  const t = w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!;
  return Math.hypot(w[0]! - d[0]! * t, w[1]! - d[1]! * t, w[2]! - d[2]! * t);
};

// ───────────── 순수 함수 ─────────────
describe('lockTrackSnap(잠근 선과 끌어온 축의 교차)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [30, 20, 0], distance: 220, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [30, 20, 0], radius: 60 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const A: V3 = [0, 0, 0];
  const X: V3 = [1, 0, 0];
  const SNAP = 10;

  it('축 잠금: 잠근 축 위 끌어온 점과 나란한 자리(trackCrossSnap과 같은 수). 끌어온 점이 첫 점과 좌표 하나를 함께 쓰면 그 자리를 지나는 끌어온 축이 실린다', () => {
    const Q: V3 = [40, 0, 0];
    const [x, y] = at(Q);
    // P가 첫 점과 z를 함께 쓴다 — P의 Y축이 잠근 X축과 (40, 0, 0)에서 3D로 만난다
    const P1: V3 = [40, 30, 0];
    const r1 = lockTrackSnap(f, A, X, [P1], x + 2, y + 1, SNAP)!;
    expect(r1.p).toEqual(Q);
    expect(r1).toMatchObject({ from: P1, axis: 'y' });
    expect(r1.distPx).toBeCloseTo(Math.hypot(2, 1), 9);
    expect(Object.keys(r1).sort()).toEqual(['axis', 'distPx', 'from', 'p']);
    expect(r1.p).toEqual(trackCrossSnap(f, A, [P1], x + 2, y + 1, SNAP)!.p);
    // y를 함께 쓰면 Z축
    expect(lockTrackSnap(f, A, X, [[40, 0, 25]], x + 2, y + 1, SNAP)).toMatchObject({ p: Q, axis: 'z' });
    // 함께 쓰는 좌표가 없으면 나란한 자리뿐(axis 없음 — 0.10.0 잠금에서 그 점을 가리킨 자리와 같다)
    const r3 = lockTrackSnap(f, A, X, [[40, 30, 25]], x + 2, y + 1, SNAP)!;
    expect(r3.p).toEqual(Q);
    expect(r3).not.toHaveProperty('axis');
    // 셈이 trackCrossSnap과 같은 수를 낸다(끝자리까지 — Shift로 잠가도 점이 같다)
    const odd: V3 = [37.123456789, 12.5, -3.25];
    const [ox, oy] = at([odd[0], 0, 0]);
    expect(lockTrackSnap(f, A, X, [odd], ox + 1, oy + 2, SNAP)!.p).toEqual(trackCrossSnap(f, A, [odd], ox + 1, oy + 2, SNAP)!.p);
    // 방향 길이·부호는 상관없다
    expect(lockTrackSnap(f, A, [-4, 0, 0], [P1], x + 2, y + 1, SNAP)!.p).toEqual(Q);
  });

  it('축이 아닌 잠근 선: 끌어온 점의 X·Y·Z 축과 3D로 만나는 점(잠근 선 위 — 방향 성분이 0인 좌표는 첫 점 그대로)', () => {
    const D: V3 = [1, 1, 0];
    const P: V3 = [40, 10, 0];
    // P의 Y축(x = 40)은 (40, 40, 0)에서, X축(y = 10)은 (10, 10, 0)에서 만난다
    const [x, y] = at([40, 40, 0]);
    const r = lockTrackSnap(f, A, D, [P], x + 2, y + 1, SNAP)!;
    expect(dist(r.p, [40, 40, 0])).toBeLessThan(1e-9);
    expect(r.p[2]).toBe(0);
    expect(r).toMatchObject({ from: P, axis: 'y' });
    const [x2, y2] = at([10, 10, 0]);
    expect(lockTrackSnap(f, A, D, [P], x2 + 1, y2 + 2, SNAP)).toMatchObject({ from: P, axis: 'x' });
    // 잠근 선 위 P에 가장 가까운 자리(25, 25, 0)는 P의 축 위가 아니다 — 축이 아닌 잠근 선은 나란한 자리를 두지 않는다
    const [x3, y3] = at([25, 25, 0]);
    expect(lockTrackSnap(f, A, D, [P], x3 + 1, y3 + 2, SNAP)).toBeNull();
    // 높이가 다른 점의 축은 3D로 만나지 않는다(화면에서만 엇갈린다)
    expect(lockTrackSnap(f, A, D, [[40, 10, 5]], x + 2, y + 1, SNAP)).toBeNull();
    // 바로 위의 점은 그 Z축이 잠근 선과 만난다
    const up: V3 = [30, 30, 20];
    const [ux, uy] = at([30, 30, 0]);
    const u = lockTrackSnap(f, A, D, [up], ux + 2, uy + 1, SNAP)!;
    expect(u).toMatchObject({ from: up, axis: 'z' });
    expect(dist(u.p, [30, 30, 0])).toBeLessThan(1e-9);
  });

  it('빼는 것: 커서가 첫 점·끌어온 점 둘레, 첫 점과 같은 점, 잠근 선 위의 점(교차가 그 점), 먼 자리, 끌어온 점이 없음, 길이 0·수가 아닌 방향', () => {
    const P: V3 = [40, 30, 0];
    const [x, y] = at([40, 0, 0]);
    const [ax, ay] = at(A);
    const [px, py] = at(P);
    expect(lockTrackSnap(f, A, X, [P], ax + 2, ay + 1, SNAP)).toBeNull();
    expect(lockTrackSnap(f, A, X, [P], px + 2, py + 1, SNAP)).toBeNull();
    expect(lockTrackSnap(f, A, X, [A], x + 2, y + 1, SNAP)).toBeNull();
    // 잠근 선 위의 점(교차가 그 점 — 점 붙잡기가 맡는다)
    expect(lockTrackSnap(f, A, X, [[40, 0, 0]], x + 2, y + 1, SNAP)).toBeNull();
    expect(lockTrackSnap(f, A, X, [P], x + 30, y, SNAP)).toBeNull();
    expect(lockTrackSnap(f, A, X, [], x + 2, y + 1, SNAP)).toBeNull();
    expect(lockTrackSnap(f, A, [0, 0, 0], [P], x + 2, y + 1, SNAP)).toBeNull();
    expect(lockTrackSnap(f, A, [Number.NaN, 0, 0], [P], x + 2, y + 1, SNAP)).toBeNull();
  });

  it('여러 점: 커서에 가까운 것, 같으면 앞 점(새것). 앱의 그리기 축(axes)으로 돌린 축도 같은 규칙', () => {
    const near: V3 = [40, 30, 0], far: V3 = [44, 30, 0];
    const [x, y] = at([40, 0, 0]);
    expect(lockTrackSnap(f, A, X, [far, near], x + 1, y + 1, SNAP)!.from).toEqual(near);
    expect(lockTrackSnap(f, A, X, [near, [40, -20, 0]], x + 1, y + 1, SNAP)!.from).toEqual(near);
    expect(lockTrackSnap(f, A, X, [[40, -20, 0], near], x + 1, y + 1, SNAP)!.from).toEqual([40, -20, 0]);
    // 모형 축을 Z 둘레 30° 돌렸다: 돌린 x 방향으로 잠근 선 위 끌어온 점과 나란한 자리
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
    const axes = { x: [c, s, 0], y: [-s, c, 0], z: [0, 0, 1] };
    const P: V3 = [40 * c - 30 * s, 40 * s + 30 * c, 0];
    const Q: V3 = [40 * c, 40 * s, 0];
    const [qx, qy] = at(Q);
    const r = lockTrackSnap(f, A, [c, s, 0], [P], qx + 2, qy + 1, SNAP, axes)!;
    expect(dist(r.p, Q)).toBeLessThan(1e-9);
    expect(r.axis).toBe('y');
    // 세계 축으로 보면 돌린 방향은 축이 아니다 — P의 세계 축과는 다른 자리에서 만난다
    expect(lockTrackSnap(f, A, [c, s, 0], [P], qx + 2, qy + 1, SNAP)).toBeNull();
  });
});

describe('acceptOnFace·RefineMemo.clear·normalizeInference(lockTracks)·openRefineKey(onFace)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
  const corners: V3[] = [
    [0, 0, 0],
    [50, 0, 0],
    [0, 30, 0],
  ];
  const core: V3 = [10, 10, 0];
  const s = projectToScreen(f, core)!;
  const ray = screenRay(f, s[0], s[1]);
  const along = (t: number): V3 => [core[0] + ray.dir[0] * t, core[1] + ray.dir[1] * t, core[2] + ray.dir[2] * t];

  it('광선 위 점은 받고(코어 점 그대로도), 광선을 벗어나거나 삼각형 가장 긴 변의 0.1배보다 멀거나 눈 뒤면 버린다', () => {
    const L = Math.hypot(50, 30);
    expect(ON_FACE_CHORD).toBe(0.1);
    expect(dist(acceptOnFace(f, core, along(-2), ray, corners, 10)!, along(-2))).toBeLessThan(1e-9);
    expect(dist(acceptOnFace(f, core, along(3), ray, corners, 10)!, along(3))).toBeLessThan(1e-9);
    expect(dist(acceptOnFace(f, core, core, ray, corners, 10)!, core)).toBeLessThan(1e-9);
    expect(acceptOnFace(f, core, along(-0.1 * L + 0.05), ray, corners, 10)).not.toBeNull();
    expect(acceptOnFace(f, core, along(-0.1 * L - 1), ray, corners, 10)).toBeNull();
    expect(acceptOnFace(f, core, [core[0] + 2, core[1], core[2]], ray, corners, 10)).toBeNull();
    expect(acceptOnFace(f, core, along(-500), ray, corners, 10)).toBeNull();
    expect(acceptOnFace(f, core, along(-2), ray, corners.slice(0, 2), 10)).toBeNull();
  });

  it('RefineMemo.clear는 모두 잊고 지운 수를 돌려준다', () => {
    const m = new RefineMemo(4);
    m.set('a', [1, 2, 3]);
    m.set('b', null);
    expect(m.size).toBe(2);
    expect(m.clear()).toBe(2);
    expect(m.size).toBe(0);
    expect(m.get('a')).toBeUndefined();
    expect(m.clear()).toBe(0);
  });

  it('lockTracks는 켰을 때만 true로 붙는다(true에 들지 않는다)', () => {
    expect(normalizeInference({ lockTracks: true })).toEqual({ intersections: false, perpendicular: false, axes: false, parallel: false, lock: false, lockTracks: true });
    expect(normalizeInference({ lock: true })).not.toHaveProperty('lockTracks');
    expect(normalizeInference(true)).not.toHaveProperty('lockTracks');
    expect(normalizeInference({ lockTracks: false })).toBeNull();
  });

  it("openRefineKey: 'onFace'도 면 열쇠(선 자리에 커서 광선 — 'axisFace' 열쇠는 0.19.0 그대로)", () => {
    const face = { id: '상자', index: 3, normal: [0, 0, 1] as V3 };
    const line = { origin: [1, 2, 3] as V3, dir: [0, 0, -1] as V3 };
    const a = openRefineKey({ kind: 'axisFace', point: core, face, first: null, line: { ...line, axis: 'z' } });
    const b = openRefineKey({ kind: 'onFace', point: core, face, first: null, line });
    expect(a).toBe('axisFace#10,10,0#face|2:상자|3|0,0,1#-#-#z|1,2,3|0,0,-1');
    expect(b).toBe('onFace#10,10,0#face|2:상자|3|0,0,1#-#-#-|1,2,3|0,0,-1');
  });
});

// ───────────── 뷰어 ─────────────
/** 덧그림 2D 문맥 기록(v0170.test.ts와 같다): 획마다 색·굵기·점선과 지난 점(화면) */
interface Stroke {
  style: string;
  width: number;
  dash: number[];
  pts: [number, number][];
}
let strokes: Stroke[] = [];
function rec2d(): CanvasRenderingContext2D {
  const base = fake2d() as unknown as Record<string, unknown>;
  let path: [number, number][] = [];
  let dash: number[] = [];
  const own: Record<string, unknown> = {
    beginPath: () => (path = []),
    moveTo: (x: number, y: number) => path.push([x, y]),
    lineTo: (x: number, y: number) => path.push([x, y]),
    setLineDash: (d: number[]) => (dash = [...d]),
    stroke: () => strokes.push({ style: String(base.strokeStyle), width: Number(base.lineWidth), dash: [...dash], pts: [...path] }),
  };
  return new Proxy(base, {
    get: (t, k) => (typeof k === 'string' && k in own ? own[k] : (t as Record<string | symbol, unknown>)[k]),
    set: (t, k, v) => {
      (t as Record<string | symbol, unknown>)[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
let dom: ReturnType<typeof installDom>;
let restoreCtx: () => void;
beforeAll(() => {
  dom = installDom();
  const proto = Object.getPrototypeOf(dom.host()) as { getContext: (type: string) => unknown };
  const orig = proto.getContext;
  proto.getContext = function (this: unknown, type: string) {
    return type === '2d' ? rec2d() : orig.call(this, type);
  };
  restoreCtx = () => (proto.getContext = orig);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  restoreCtx();
  dom.restore();
});

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(sc: Scene3d, wire = true): View {
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

/**
 * 잠근 선과 끌어온 축의 장면: 첫 점 A = (0, 0, 0)('가' (0, 0, 0) → (0, −30, 0)의 끝점), 끌어온 점 자리 '나' (60, 40, 30) → (60, 60, 30)·'다' (60, 40, 0) → (60, 60, 0),
 * 잠근 X축 위 Q = (60, 0, 0)을 지나는 금 '금' (60, −10, 0) → (60, 10, 0)(lockEdges 차례 보기 — 장면 둘째 판에만)
 */
const A: V3 = [0, 0, 0];
const Q: V3 = [60, 0, 0];
const trackScene: Scene3d = {
  name: 't',
  units: 'mm',
  meshes: [],
  lines: [
    { id: '가', positions: new Float32Array([...A, 0, -30, 0]) },
    { id: '나', positions: new Float32Array([60, 40, 30, 60, 60, 30]) },
    { id: '다', positions: new Float32Array([60, 40, 0, 60, 60, 0]) },
  ],
  points: [],
};
const crossScene: Scene3d = { ...trackScene, lines: [...trackScene.lines, { id: '금', positions: new Float32Array([60, -10, 0, 60, 10, 0]), segmentIds: new Uint32Array([5]) }] };
function trackFirst(o: Snap, sc: Scene3d = trackScene): View {
  const w = view(sc);
  w.v.setMeasureMode(true);
  w.v.setMeasureSnap(o);
  clickAt(w, A, 1, 0);
  expect(w.v.measurePoints[0]!.point).toEqual(A);
  return w;
}
const TRK = { inference: { axes: true, lock: true, track: true, lockTracks: true } } as const;

describe('Viewer3d: 잠근 선과 끌어온 축의 교차(0.21.0 lockTracks)', () => {
  it('잠근 X축이 끌어온 점의 Y축과 만나는 점에 찍고 그 끌어온 축(trackOther)이 실린다. 꺼져 있으면 0.20.0처럼 잠근 축 위 커서 자리', () => {
    for (const on of [true, false]) {
      const w = trackFirst({ inference: { ...TRK.inference, lockTracks: on } });
      const { v } = w;
      const P: V3 = [60, 40, 0];
      expect(v.setMeasureTrackPoints([P])).toBe(1);
      expect(v.setMeasureInferenceLock('x')).toBe(true);
      const s = at(w, Q);
      hoverXY(w, s.x + 3, s.y + 1);
      const h = v.measureHoverSnap!;
      expect(h).toMatchObject({ snap: 'axis', axis: 'x', direction: [1, 0, 0], locked: true });
      if (on) {
        expect(h.point).toEqual(Q);
        expect(h.trackOther).toEqual({ from: P, axis: 'y' });
        expect(h).not.toHaveProperty('trackFrom');
        expect(h).not.toHaveProperty('segment');
        clickXY(w, s.x + 3, s.y + 1);
        const m = v.measurement()!;
        expect([m.distance, m.dx, m.dy, m.dz, m.snapB, m.axisB, m.directionB, m.lockedB]).toEqual([60, 60, 0, 0, 'axis', 'x', [1, 0, 0], true]);
        expect(m).not.toHaveProperty('trackOther');
        expect(v.measurePoints[1]).toMatchObject({ point: Q, snap: 'axis', locked: true, trackOther: { from: P, axis: 'y' } });
      } else {
        expect(dist(h.point, Q)).toBeGreaterThan(1e-3);
        expect(h).not.toHaveProperty('trackOther');
        expect(h).not.toHaveProperty('trackFrom');
      }
      v.dispose();
    }
  });

  it('끌어온 점이 첫 점과 좌표를 함께 쓰지 않으면 잠근 축 위 나란한 자리(trackFrom) — Shift로 잠가도 잠그기 전 첫 점 축 위 나란한 자리와 같은 값에 locked만 더한다', () => {
    const w = trackFirst(TRK);
    const { v } = w;
    const P: V3 = [60, 40, 30];
    v.setMeasureTrackPoints([P]);
    const s = at(w, Q);
    hoverXY(w, s.x + 3, s.y + 1);
    const before = v.measureHoverSnap!;
    expect(before).toEqual({ point: Q, snap: 'axis', axis: 'x', direction: [1, 0, 0], trackFrom: P });
    hoverXY(w, s.x + 3, s.y + 1, true);
    expect(v.measureInferenceLock).toMatchObject({ kind: 'axis', axis: 'x', source: 'shift' });
    expect(v.measureHoverSnap).toEqual({ ...before, locked: true });
    // 잠근 채 축을 따라 조금 옮겨도(붙잡기 거리 안) 그 자리에 남는다
    hoverXY(w, s.x + 6, s.y + 2, true);
    expect(v.measureHoverSnap!.point).toEqual(Q);
    v.dispose();
  });

  it('좌표 하나를 함께 쓰면 Shift로 잠근 뒤 그 끌어온 축(trackOther)으로 — 점은 잠그기 전과 같다', () => {
    const w = trackFirst(TRK);
    const { v } = w;
    const P: V3 = [60, 40, 0];
    v.setMeasureTrackPoints([P]);
    const s = at(w, Q);
    hoverXY(w, s.x + 3, s.y + 1);
    expect(v.measureHoverSnap).toEqual({ point: Q, snap: 'axis', axis: 'x', direction: [1, 0, 0], trackFrom: P });
    hoverXY(w, s.x + 3, s.y + 1, true);
    expect(v.measureHoverSnap).toEqual({ point: Q, snap: 'axis', axis: 'x', direction: [1, 0, 0], locked: true, trackOther: { from: P, axis: 'y' } });
    v.dispose();
  });

  it('축이 아닌 잠근 선(앱이 정한 방향)과 끌어온 축의 교차, 끌어온 점이 없거나 track을 끄면 0.20.0과 같다', () => {
    const w = trackFirst(TRK);
    const { v } = w;
    const P: V3 = [80, 20, 0];
    v.setMeasureTrackPoints([P]);
    expect(v.setMeasureInferenceLock({ direction: [1, 1, 0] })).toBe(true);
    // P의 Y축(x = 80)과 (80, 80, 0)에서
    const M: V3 = [80, 80, 0];
    const s = at(w, M);
    hoverXY(w, s.x + 3, s.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'parallel', locked: true, trackOther: { from: P, axis: 'y' } });
    expect(dist(h.point, M)).toBeLessThan(1e-9);
    expect(h.point[2]).toBe(0);
    expect(h).not.toHaveProperty('axis');
    const want = (o: Snap, pts: V3[] | null): unknown => {
      const u = trackFirst(o);
      if (pts) u.v.setMeasureTrackPoints(pts);
      u.v.setMeasureInferenceLock({ direction: [1, 1, 0] });
      hoverXY(u, s.x + 3, s.y + 1);
      const r = u.v.measureHoverSnap;
      u.v.dispose();
      return r;
    };
    const plain = want({ inference: { axes: true, lock: true, track: true } }, [P]);
    expect(plain).not.toHaveProperty('trackOther');
    expect(want(TRK, null)).toEqual(plain);
    expect(want({ inference: { axes: true, lock: true, lockTracks: true } }, null)).toEqual(plain);
    v.dispose();
  });

  it('그리기: 첫 점에서 잠근 축 색 굵은 실선, 끌어온 점에서 그 자리까지 끌어온 축 색 점선(나란한 자리뿐이면 측정 색 점선)', () => {
    const w = trackFirst(TRK);
    const { v } = w;
    const near = (a: [number, number] | undefined, b: { x: number; y: number }): boolean => !!a && Math.hypot(a[0] - b.x, a[1] - b.y) < 1e-6;
    const s = at(w, Q), sa = at(w, A);
    for (const [P, color] of [
      [[60, 40, 0], DARK_THEME.axisY],
      [[60, 40, 30], DARK_THEME.measure],
    ] as const) {
      v.setMeasureTrackPoints([P]);
      v.setMeasureInferenceLock('x');
      strokes = [];
      hoverXY(w, s.x + 3, s.y + 1);
      expect(v.measureHoverSnap!.point).toEqual(Q);
      const sp = at(w, P);
      const dotted = strokes.filter((k) => k.dash.join() === '4,3' && near(k.pts[0], sp) && near(k.pts[1], s));
      expect(dotted.map((k) => k.style)).toEqual([color]);
      expect(strokes.some((k) => k.style === DARK_THEME.axisX && k.dash.length === 0 && near(k.pts[0], sa) && near(k.pts[1], s))).toBe(true);
      v.setMeasureInferenceLock(false);
    }
    v.dispose();
  });

  it('차례: 같은 자리면 잠근 선과 끌어온 축의 교차가 잠근 선과 선분의 교차(lockEdges)보다 먼저다(잠그기 전 첫 점 축 위 나란한 자리가 축과 선분의 교차보다 먼저인 것과 같다)', () => {
    const w = trackFirst({ inference: { ...TRK.inference, lockEdges: true } }, crossScene);
    const { v } = w;
    v.setMeasureInferenceLock('x');
    const s = at(w, Q);
    hoverXY(w, s.x + 3, s.y + 1);
    // 끌어온 점이 없으면 '금'과의 교차
    expect(v.measureHoverSnap).toMatchObject({ point: Q, locked: true, segment: { id: '금', index: 5 } });
    v.setMeasureTrackPoints([[60, 40, 0]]);
    hoverXY(w, s.x + 3, s.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ point: Q, locked: true, trackOther: { from: [60, 40, 0], axis: 'y' } });
    expect(h).not.toHaveProperty('segment');
    // 커서 아래 점 붙잡기는 그보다 먼저(0.10.0 — 그 점을 잠근 선에 내린 자리)
    const e = at(w, [60, 40, 30]);
    hoverXY(w, e.x + 1, e.y);
    expect(v.measureHoverSnap).toMatchObject({ point: Q, locked: true, from: [60, 40, 30], fromSnap: 'endpoint' });
    v.dispose();
  });
});

/**
 * 장면: 12토막 원 '원'(z 0, 반지름 30, 원본 번호 100 + k), 기둥 '기둥'(F = (30, 0, 40) → (30, 0, 60)) — F의 Z축은 원을 T = (30, 0, 0)에서 뚫는다
 * (현과는 처짐만큼 떨어진다 — 0.20.0 열린 교차, v0200.test.ts와 같은 자료)
 */
const R = 30;
const deg = (a: number): number => (a * Math.PI) / 180;
const vtx = (k: number, z = 0): V3 => [R * Math.cos(deg(15 + 30 * k)), R * Math.sin(deg(15 + 30 * k)), z];
const F: V3 = [R, 0, 40];
const T: V3 = [R, 0, 0];
const ringScene: Scene3d = {
  name: 'r',
  units: 'mm',
  meshes: [],
  lines: [
    {
      id: '원',
      positions: new Float32Array(Array.from({ length: 12 }, (_, k) => [...vtx(k), ...vtx(k + 1)]).flat()),
      segmentIds: new Uint32Array(Array.from({ length: 12 }, (_, k) => 100 + k)),
    },
    { id: '기둥', positions: new Float32Array([...F, R, 0, 60]) },
  ],
  points: [],
};
/** 앱의 정확한 원(z 0): 'axisEdge'면 직선이 원 평면을 뚫는 점이 원 위일 때 그 점. loaded가 false면(곡선 정의를 아직 받지 않았다) null */
function circleApp(): { refine: (c: SnapRefineInput) => V3 | null; calls: SnapRefineInput[]; load: () => void } {
  let loaded = false;
  const calls: SnapRefineInput[] = [];
  return {
    calls,
    load: () => (loaded = true),
    refine: (c) => {
      calls.push(c);
      if (!loaded || c.kind !== 'axisEdge' || !c.line || c.segment.id !== '원' || Math.abs(c.line.dir[2]) < 1e-12) return null;
      const t = -c.line.origin[2] / c.line.dir[2];
      const p: V3 = [c.line.origin[0] + c.line.dir[0] * t, c.line.origin[1] + c.line.dir[1] * t, 0];
      return Math.abs(Math.hypot(p[0], p[1]) - R) < 1e-9 ? p : null;
    },
  };
}

describe('Viewer3d: 다듬기 기억만 비우기(0.21.0 clearMeasureRefine)', () => {
  it('곡선 정의를 받기 전에 기억한 null을 비우면 다음 미리 보기에서 앱을 다시 부르고, 잠금·끌어온 점·찍은 점은 그대로다', () => {
    const app = circleApp();
    const w = view(ringScene);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, lock: true, track: true, axisEdges: true, lockEdges: true }, refine: app.refine });
    clickAt(w, F, 1, 0);
    expect(v.measurePoints[0]!.point).toEqual(F);
    const G: V3 = [-40, 30, 40];
    v.setMeasureTrackPoints([G]);
    v.setMeasureInferenceLock('z');
    const s = at(w, T);
    hoverXY(w, s.x + 2, s.y + 1);
    const open = (): number => app.calls.filter((c) => c.open).length;
    expect(open()).toBe(1);
    const off = v.measureHoverSnap!;
    expect(off).toMatchObject({ snap: 'axis', axis: 'z', locked: true });
    expect(dist(off.point, T)).toBeGreaterThan(1e-3);
    // 정의를 받았지만 코어는 기억한 null을 쓴다(0.20.0 — 같은 둘레에서 다시 부르지 않는다)
    app.load();
    hoverXY(w, s.x + 3, s.y + 2);
    expect(open()).toBe(1);
    expect(dist(v.measureHoverSnap!.point, T)).toBeGreaterThan(1e-3);
    const lock = v.measureInferenceLock, tracks = v.measureTrackPoints, pts = v.measurePoints, opts = v.measureSnap;
    expect(v.clearMeasureRefine()).toBeGreaterThanOrEqual(1);
    v.renderNow();
    expect(open()).toBe(2);
    expect(v.measureHoverSnap).toMatchObject({ point: T, snap: 'axis', axis: 'z', locked: true, refined: true, segment: { id: '원', index: 111 } });
    expect(v.measureInferenceLock).toEqual(lock);
    expect(v.measureTrackPoints).toEqual(tracks);
    expect(v.measurePoints).toEqual(pts);
    expect(v.measureSnap).toEqual(opts);
    // 그 뒤로는 다시 기억한다
    hoverXY(w, s.x + 2, s.y + 1);
    expect(open()).toBe(2);
    clickXY(w, s.x + 2, s.y + 1);
    expect(v.measurement()!.distance).toBe(40);
    v.dispose();
  });

  it('찍은 두 점과 측정 결과는 바꾸지 않는다. 붙잡기가 꺼져 있으면 0을 돌려주고 아무것도 하지 않는다', () => {
    const app = circleApp();
    app.load();
    const w = view(ringScene);
    const { v } = w;
    expect(v.clearMeasureRefine()).toBe(0);
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, axisEdges: true }, refine: app.refine });
    clickAt(w, F, 1, 0);
    const s = at(w, T);
    clickXY(w, s.x + 2, s.y + 1);
    const m = v.measurement()!, pts = v.measurePoints;
    expect(m.distance).toBe(40);
    const n = app.calls.length;
    expect(v.clearMeasureRefine()).toBeGreaterThanOrEqual(1);
    v.renderNow();
    expect(n).toBeGreaterThan(0);
    expect(v.measurement()).toEqual(m);
    expect(v.measurePoints).toEqual(pts);
    expect(v.measurePointCount).toBe(2);
    v.dispose();
  });

  it('refineFace 기억(축이 면을 뚫는 점)도 비운다', () => {
    const C: V3 = [60, 40, 90];
    const top: V3 = [60, 40, 40];
    const sc: Scene3d = { name: 'f', units: 'mm', meshes: [boxMesh('상자', [0, 0, 0], [120, 80, 40], [0.6, 0.6, 0.7, 1])], lines: [{ id: '기둥', positions: new Float32Array([...C, 60, 40, 120]) }], points: [] };
    let loaded = false;
    const kinds: string[] = [];
    const w = view(sc, false);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({
      inference: { axes: true, lock: true, axisFaces: true },
      refineFace: (c) => {
        kinds.push(c.kind);
        return loaded && c.kind === 'axisFace' ? [c.point[0], c.point[1], c.point[2] + 0.25] : null;
      },
    });
    clickAt(w, C, 1, 0);
    const s = at(w, top);
    hoverXY(w, s.x + 3, s.y + 1);
    expect(kinds).toEqual(['axisFace']);
    expect(v.measureHoverSnap!.point).toEqual(top);
    loaded = true;
    hoverXY(w, s.x + 4, s.y + 2);
    expect(v.measureHoverSnap!.point).toEqual(top);
    expect(kinds).toEqual(['axisFace']);
    v.clearMeasureRefine();
    v.renderNow();
    expect(kinds).toEqual(['axisFace', 'axisFace']);
    expect(v.measureHoverSnap).toMatchObject({ point: [60, 40, 40.25], refined: true, face: { id: '상자' } });
    v.dispose();
  });
});

/** 상자(0~120, 0~80, 0~40)와 기둥 선분 — 윗면 가운데 둘레를 가리킨다 */
const BOX_C: V3 = [60, 40, 90];
const boxScene: Scene3d = {
  name: 'f',
  units: 'mm',
  meshes: [boxMesh('상자', [0, 0, 0], [120, 80, 40], [0.6, 0.6, 0.7, 1])],
  lines: [{ id: '기둥', positions: new Float32Array([...BOX_C, 60, 40, 120]) }],
  points: [],
};
/** 앱 곡면 흉내: 코어 점에서 커서 광선을 따라 눈 쪽으로 lift만큼(곡면이 삼각형보다 볼록하다) */
const liftApp = (lift: number, calls: SnapRefineFaceInput[] = []) => (c: SnapRefineFaceInput): V3 => {
  calls.push(c);
  return [c.point[0] - c.line.dir[0] * lift, c.point[1] - c.line.dir[1] * lift, c.point[2] - c.line.dir[2] * lift];
};

describe("Viewer3d: 붙잡지 않은 면 위 점 다듬기(0.21.0 refineFace — 'onFace')", () => {
  const P1: V3 = [90, 20, 40];

  it('면·커서 광선(line)을 넘기고 앱 점을 광선 위로 내린 자리를 찍는다. 같은 자리 미리 보기 뒤 누르기는 다시 부르지 않는다', () => {
    const calls: SnapRefineFaceInput[] = [];
    const w = view(boxScene, false);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ refineFace: liftApp(3, calls) });
    const s = at(w, P1);
    hoverXY(w, s.x + 2, s.y + 1);
    expect(calls).toHaveLength(1);
    const c = calls[0]!;
    expect(c).toMatchObject({ kind: 'onFace', first: null, face: { id: '상자', normal: [0, 0, 1] } });
    expect(Number.isInteger(c.face.index)).toBe(true);
    expect(c.point[2]).toBeCloseTo(40, 6);
    expect(c.line).toEqual(c.ray);
    expect(c.line).not.toHaveProperty('axis');
    expect(c).not.toHaveProperty('segment');
    expect(rayGap(c.point, c.ray.origin, c.ray.dir)).toBeLessThan(1e-6);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: null, refined: true });
    expect(Object.keys(h).sort()).toEqual(['point', 'refined', 'snap']);
    const want: V3 = [c.point[0] - c.ray.dir[0] * 3, c.point[1] - c.ray.dir[1] * 3, c.point[2] - c.ray.dir[2] * 3];
    expect(dist(h.point, want)).toBeLessThan(1e-9);
    // 같은 자리에서 누르면 기억한 결과(다시 부르지 않는다), 찍은 점도 다듬은 점
    clickXY(w, s.x + 2, s.y + 1);
    expect(calls).toHaveLength(1);
    expect(v.measurePoints[0]).toMatchObject({ snap: null, refined: true });
    expect(dist(v.measurePoints[0]!.point, want)).toBeLessThan(1e-9);
    // 다른 자리는 새로 부른다(첫 점이 실린다)
    hoverXY(w, s.x + 9, s.y + 4);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.first).toEqual(v.measurePoints[0]!.point);
    v.dispose();
  });

  it('null·광선에서 벗어난 점·삼각형 크기보다 먼 점·수가 아닌 값·kind로 거르는 앱이면 삼각형 위 점 그대로 — 주지 않은 것과 같다', () => {
    const plain = view(boxScene, false);
    plain.v.setMeasureMode(true);
    plain.v.setMeasureSnap({ edges: false });
    const s = at(plain, P1);
    hoverXY(plain, s.x + 2, s.y + 1);
    const want = plain.v.measureHoverSnap!;
    plain.v.dispose();
    expect(want.snap).toBeNull();
    expect(want).not.toHaveProperty('refined');
    // 윗면 삼각형 가장 긴 변은 대각선(144.2) — 0.1배는 14.4
    const answers: ((c: SnapRefineFaceInput) => unknown)[] = [
      () => null,
      (c) => [c.point[0] + 3, c.point[1], c.point[2]],
      liftApp(20),
      () => [Number.NaN, 0, 0],
      () => 'x',
      (c) => (c.kind !== 'axisFace' ? null : liftApp(3)(c)),
    ];
    for (const refineFace of answers) {
      const w = view(boxScene, false);
      w.v.setMeasureMode(true);
      w.v.setMeasureSnap({ edges: false, refineFace: refineFace as never });
      hoverXY(w, s.x + 2, s.y + 1);
      expect(w.v.measureHoverSnap).toEqual(want);
      w.v.dispose();
    }
    // 한도 안이면 받는다
    const ok = view(boxScene, false);
    ok.v.setMeasureMode(true);
    ok.v.setMeasureSnap({ edges: false, refineFace: liftApp(12) });
    hoverXY(ok, s.x + 2, s.y + 1);
    expect(ok.v.measureHoverSnap!.refined).toBe(true);
    ok.v.dispose();
  });

  it('부르지 않는 때: 잠근 동안, 점 붙잡기(그물 꼭짓점·선분 끝점), 축이 면을 뚫는 점이 붙을 때(그때는 axisFace)', () => {
    const kinds: string[] = [];
    const w = view(boxScene, false);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({
      inference: { axes: true, lock: true, axisFaces: true },
      refineFace: (c) => {
        kinds.push(c.kind);
        return null;
      },
    });
    // 그물 꼭짓점(윗면 구석) 둘레 — 윗면 안쪽 1 mm
    const k = at(w, [119, 1, 40]);
    hoverXY(w, k.x, k.y);
    expect(v.measureHoverSnap!.snap).toBe('vertex');
    expect(kinds).toEqual([]);
    // 첫 점 전의 면 위 점은 onFace
    const s = at(w, P1);
    hoverXY(w, s.x + 2, s.y + 1);
    expect(v.measureHoverSnap).toMatchObject({ snap: null });
    expect(kinds).toEqual(['onFace']);
    // 기둥 끝점을 첫 점으로 — 윗면 가운데는 Z축이 뚫는 자리라 axisFace만
    clickAt(w, BOX_C, 1, 0);
    expect(kinds).toEqual(['onFace']);
    const t = at(w, [60, 40, 40]);
    hoverXY(w, t.x + 3, t.y + 1);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'z', face: { id: '상자' } });
    expect(kinds).toEqual(['onFace', 'axisFace']);
    // 잠근 동안은 부르지 않는다
    v.setMeasureInferenceLock('x');
    hoverXY(w, s.x + 4, s.y + 3);
    expect(v.measureHoverSnap!.locked).toBe(true);
    expect(kinds).toEqual(['onFace', 'axisFace']);
    v.dispose();
  });

  it('기억을 비우면 같은 자리에서도 다시 부른다(clearMeasureRefine)', () => {
    const calls: SnapRefineFaceInput[] = [];
    const w = view(boxScene, false);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ refineFace: liftApp(3, calls) });
    const s = at(w, P1);
    hoverXY(w, s.x + 2, s.y + 1);
    hoverXY(w, s.x + 2, s.y + 1);
    expect(calls).toHaveLength(1);
    expect(v.clearMeasureRefine()).toBe(1);
    v.renderNow();
    expect(calls).toHaveLength(2);
    expect(v.measureHoverSnap!.refined).toBe(true);
    v.dispose();
  });

  it("종류를 가리지 않는 앱(직선과 곡면의 교차 하나로 'axisFace'·'onFace'를 함께 푼다)은 커서 아래 정확한 구 위 점을 받는다", () => {
    const Kc: V3 = [0, 0, 0];
    const KR = 35;
    const sc: Scene3d = { name: 'g', units: 'mm', meshes: [sphereMesh('구', Kc, KR, 24, 12, [0.6, 0.6, 0.7, 1])], lines: [], points: [] };
    /** 직선 o + d·t와 구의 교차 가운데 near에 가까운 근 */
    const lineSphere = (c: SnapRefineFaceInput): V3 | null => {
      const o = c.line.origin, d = c.line.dir;
      const wv = [o[0] - Kc[0], o[1] - Kc[1], o[2] - Kc[2]];
      const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], b = wv[0]! * d[0] + wv[1]! * d[1] + wv[2]! * d[2], k = wv[0]! ** 2 + wv[1]! ** 2 + wv[2]! ** 2 - KR * KR;
      const disc = b * b - a * k;
      if (disc < 0) return null;
      const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t): V3 => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]);
      return dist(ts[0]!, c.point) <= dist(ts[1]!, c.point) ? ts[0]! : ts[1]!;
    };
    const calls: SnapRefineFaceInput[] = [];
    const w = view(sc, false);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({
      refineFace: (c) => {
        calls.push(c);
        return lineSphere(c);
      },
    });
    v.fitItems(['구'], false);
    v.renderNow();
    const s = at(w, [KR * 0.3, -KR * 0.6, KR * Math.sqrt(1 - 0.09 - 0.36)]);
    // 커서 둘레 격자에서 꼭짓점 붙잡기가 아닌 자리(면 위 점)마다
    let checked = 0;
    for (let dy = -12; dy <= 12; dy += 6)
      for (let dx = -12; dx <= 12; dx += 6) {
        const n = calls.length;
        hoverXY(w, s.x + dx + 0.3, s.y + dy + 0.4);
        const h = v.measureHoverSnap!;
        if (h.snap !== null) continue;
        expect(calls.length).toBe(n + 1);
        const c = calls[n]!;
        expect(c.kind).toBe('onFace');
        expect(h.refined).toBe(true);
        expect(Math.abs(dist(h.point, Kc) - KR)).toBeLessThan(1e-9);
        expect(rayGap(h.point, c.ray.origin, c.ray.dir)).toBeLessThan(1e-6);
        // 삼각형 위 점(코어 점)은 구 안쪽이다
        expect(dist(c.point, Kc)).toBeLessThan(KR);
        checked++;
      }
    expect(checked).toBeGreaterThanOrEqual(10);
    v.dispose();
  });
});

// 화면 거리(세계 단위)를 쓰는 판정이 이 시험의 카메라에서 붙잡기 거리보다 작은지 확인해 둔다(시험 전제)
describe('전제', () => {
  it('lockTrackSnap 시험 카메라에서 한 화소 세계 길이가 0.1 mm보다 크고 1 mm보다 작다', () => {
    const iso = dirToAngles([1, -1, 0.8]);
    const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [30, 20, 0], distance: 220, projection: 'perspective' };
    const f = computeFrame(cam, 600, 400, { center: [30, 20, 0], radius: 60 });
    const w = worldPerPixel(f, viewDepth(f, [40, 0, 0]));
    expect(w).toBeGreaterThan(0.1);
    expect(w).toBeLessThan(1);
  });
});
