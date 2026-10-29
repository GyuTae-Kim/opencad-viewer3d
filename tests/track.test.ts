/**
 * 0.16.0 다른 점에서 끌어온 축(MeasureInference.track).
 * - 순수 함수: 선택 펴기(normalizeInference·normalizeTrack), 끌어온 점 목록과 머무르기(MeasureTracker),
 *   첫 점 축 위 나란한 자리(trackCrossSnap)와 끌어온 점을 지나는 축(trackAxisSnap)
 * - 뷰어: 머무르기(시간·2화소·떠남·누르기·터치), 끌어온 축과 첫 점 축 위 나란한 자리, 차례(점 붙잡기 → 나란한 자리 → 첫 점 축 → 끌어온 축),
 *   잠금, 지우기 규칙, 꺼져 있으면 상태도 후보도 없는지
 * 가짜 DOM·가짜 WebGL2로 만든 뷰어에 실제 포인터 사건을 넣고, 머무르기 시간은 가짜 타이머로 잰다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { TRACK_DWELL_MS, normalizeInference, normalizeTrack } from '../src/inference';
import { MeasureTracker, TRACK_DWELL_PX, TRACK_MAX, sameTrackPoint, trackAxisSnap, trackCrossSnap } from '../src/track';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

// ───────────── 순수 함수 ─────────────
describe('끌어온 축 선택(normalizeInference·normalizeTrack)', () => {
  it('track은 따로 켜고(true에 들지 않는다), 켰을 때만 열쇠가 있다', () => {
    expect(normalizeInference(true)).toEqual({ intersections: true, perpendicular: true, axes: true, parallel: false, lock: false });
    expect(normalizeInference({ axes: true })).not.toHaveProperty('track');
    expect(normalizeInference({ track: true })).toEqual({ intersections: false, perpendicular: false, axes: false, parallel: false, lock: false, track: { dwellMs: TRACK_DWELL_MS } });
    expect(normalizeInference({ axes: true, track: { dwellMs: 120 } })!.track).toEqual({ dwellMs: 120 });
    expect(normalizeInference({ track: false })).toBeNull();
  });
  it('머무는 시간은 0 이상의 수만, 아니면 기본 500 ms', () => {
    expect(TRACK_DWELL_MS).toBe(500);
    expect(normalizeTrack(true)).toEqual({ dwellMs: 500 });
    expect(normalizeTrack({})).toEqual({ dwellMs: 500 });
    expect(normalizeTrack({ dwellMs: 0 })).toEqual({ dwellMs: 0 });
    for (const bad of [-1, NaN, Infinity, '300' as unknown as number]) expect(normalizeTrack({ dwellMs: bad })).toEqual({ dwellMs: 500 });
    expect(normalizeTrack(null)).toBeNull();
    expect(normalizeTrack(false)).toBeNull();
  });
});

describe('MeasureTracker(끌어온 점 목록과 머무르기)', () => {
  const P: V3 = [10, 20, 30], Q: V3 = [-5, 0, 2];
  it('같은 점에서 2화소 안이면 이어 머물고, 벗어나거나 다른 점이면 새로 시작, 점이 없으면 버린다', () => {
    const t = new MeasureTracker();
    expect(TRACK_DWELL_PX).toBe(2);
    expect(t.hover(P, 100, 100)).toBe('start');
    expect(t.hover([10, 20, 30], 101.2, 101.5)).toBe('keep');
    expect(t.hover(P, 100, 102)).toBe('keep');
    expect(t.hover(P, 102.5, 100)).toBe('start');
    expect(t.hover(Q, 102.5, 100)).toBe('start');
    expect(t.dwelling).toEqual(Q);
    expect(t.hover(null, 102.5, 100)).toBe('none');
    expect(t.dwelling).toBeNull();
    expect(t.commit()).toBeNull();
    expect(t.size).toBe(0);
  });
  it('commit은 머문 점을 앞에 기억하고(복사본), 가장 최근 점 위에서는 다시 머물지 않는다. 셋까지, 같은 점은 앞으로', () => {
    const t = new MeasureTracker();
    t.hover(P, 0, 0);
    const c = t.commit()!;
    expect(c).toEqual(P);
    expect(t.points).toEqual([P]);
    expect(t.points[0]).not.toBe(t.view[0]);
    expect(t.hover(P, 0, 0)).toBe('none');
    for (const p of [Q, [1, 1, 1], [2, 2, 2]] as V3[]) {
      t.hover(p, 0, 0);
      t.commit();
    }
    expect(TRACK_MAX).toBe(3);
    expect(t.points).toEqual([[2, 2, 2], [1, 1, 1], Q]);
    t.add(Q);
    expect(t.points).toEqual([Q, [2, 2, 2], [1, 1, 1]]);
    expect(t.add([NaN, 0, 0])).toBe(false);
    expect(t.set([P, [Infinity, 0, 0], Q, P, [3, 3, 3], [4, 4, 4]])).toBe(3);
    expect(t.points).toEqual([P, Q, [3, 3, 3]]);
    expect(t.clear()).toBe(true);
    expect(t.clear()).toBe(false);
  });
  it('같은 점 판정은 좌표 크기에 비례한 아주 작은 허용치', () => {
    expect(sameTrackPoint([1e6, 2e6, 3], [1e6 + 1e-4, 2e6, 3])).toBe(true);
    expect(sameTrackPoint([1, 2, 3], [1, 2, 3.001])).toBe(false);
  });
});

describe('trackCrossSnap·trackAxisSnap(끌어온 축 붙잡기)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const A: V3 = [0, 0, 0], P: V3 = [30, 20, 15];
  it('첫 점 축 위 나란한 자리: P를 그 축에 내린 점, 방향은 축, 커서가 첫 점 위면 없다', () => {
    const [x, y] = at([30, 0, 0]);
    const r = trackCrossSnap(f, A, [P], x + 2, y - 1, 10)!;
    expect(r.axis).toBe('x');
    expect(r.p).toEqual([30, 0, 0]);
    expect(r.from).toEqual(P);
    expect(r.from).not.toBe(P);
    expect(r.direction).toEqual([1, 0, 0]);
    const [zx, zy] = at([0, 0, 15]);
    expect(trackCrossSnap(f, A, [P], zx, zy, 10)!.axis).toBe('z');
    const [ax, ay] = at(A);
    expect(trackCrossSnap(f, A, [P], ax + 3, ay, 10)).toBeNull();
    // P가 첫 점이거나 기억한 점이 없으면 없다
    expect(trackCrossSnap(f, A, [A], x, y, 10)).toBeNull();
    expect(trackCrossSnap(f, A, [], x, y, 10)).toBeNull();
    // 멀면 없다
    expect(trackCrossSnap(f, A, [P], x + 30, y, 10)).toBeNull();
  });
  it('끌어온 점을 지나는 축: 광선에 가장 가까운 점, 방향 없음, P 둘레·첫 점과 같은 P는 뺀다', () => {
    const W: V3 = [30, 20, -10];
    const [x, y] = at(W);
    const r = trackAxisSnap(f, [P], x, y, 10)!;
    expect(r.axis).toBe('z');
    expect(dist(r.p, W)).toBeLessThan(1e-9);
    expect(r.from).toEqual(P);
    expect(r).not.toHaveProperty('direction');
    const [px, py] = at(P);
    expect(trackAxisSnap(f, [P], px + 4, py, 10)).toBeNull();
    expect(trackAxisSnap(f, [P], x, y, 10, P)).toBeNull();
    // 여럿이면 커서에 가까운 축(앞 점이 멀면 뒤 점)
    const P2: V3 = [-30, -20, 40];
    expect(trackAxisSnap(f, [P2], x, y, 10)).toBeNull();
    expect(trackAxisSnap(f, [P2, P], x, y, 10)!.from).toEqual(P);
    // 커서가 P2의 X축 위면 P2
    const [x2, y2] = at([0, -20, 40]);
    expect(trackAxisSnap(f, [P, P2], x2, y2, 10)).toMatchObject({ from: P2, axis: 'x' });
  });
  it('앱의 그리기 축(세계 축과 다를 때 — 길이 상관없음, 길이 0인 축은 뺀다)', () => {
    const s = Math.SQRT1_2;
    const axes = { x: [2, 2, 0], y: [-1, 1, 0], z: [0, 0, 1] };
    const R: V3 = [40, 0, 0];
    // 첫 점 원점, R을 X′ 축에 내린 자리는 (20, 20, 0)
    const [x, y] = at([20, 20, 0]);
    const c = trackCrossSnap(f, A, [R], x + 1, y, 10, axes)!;
    expect(c.axis).toBe('x');
    expect(dist(c.p, [20, 20, 0])).toBeLessThan(1e-12);
    expect(dist(c.direction!, [s, s, 0])).toBeLessThan(1e-12);
    // 세계 축이면 X축 위 나란한 자리는 R 자체(40, 0, 0)라 이 커서에서는 없다
    expect(trackCrossSnap(f, A, [R], x + 1, y, 10)).toBeNull();
    // R을 지나는 X′ 축 위
    const W: V3 = [40 + 7 * s, 7 * s, 0];
    const [wx, wy] = at(W);
    const t = trackAxisSnap(f, [R], wx, wy, 10, null, axes)!;
    expect(t.axis).toBe('x');
    expect(dist(t.p, W)).toBeLessThan(1e-9);
    expect(trackAxisSnap(f, [R], wx, wy, 10, null, { x: [0, 0, 0], y: [-1, 1, 0], z: [0, 0, 1] })?.axis ?? null).not.toBe('x');
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

/** 끌어온 축 장면: 첫 점 A = (0,0,0)('가'의 끝), 끌어올 점 E = (50, 40, 25)('나'의 끝), 멀리 X 방향 선분 '다'(첫 점 X축과 나란히 1 위) */
const A: V3 = [0, 0, 0];
const E: V3 = [50, 40, 25];
const trackScene: Scene3d = {
  name: 't',
  units: 'mm',
  meshes: [],
  lines: [
    { id: '가', positions: new Float32Array([...A, 0, -20, 0]) },
    { id: '나', positions: new Float32Array([...E, 60, 40, 25]) },
    { id: '다', positions: new Float32Array([100, 0, 1, 110, 0, 1]) },
  ],
  points: [],
};

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(scene: Scene3d): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement };
}
const ptr = (w: View, type: string, x: number, y: number, buttons: number, pointerType = 'mouse'): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: pointerType === 'mouse' ? 1 : 2, pointerType, button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const hoverXY = (w: View, x: number, y: number, pointerType = 'mouse'): void => {
  ptr(w, 'pointermove', x, y, 0, pointerType);
  w.v.renderNow();
};
const hoverAt = (w: View, p: readonly number[], dx = 0, dy = 0): void => {
  const s = at(w, p);
  hoverXY(w, s.x + dx, s.y + dy);
};
const clickAt = (w: View, p: readonly number[], dx = 0, dy = 0): void => {
  const s = at(w, p);
  ptr(w, 'pointerdown', s.x + dx, s.y + dy, 1);
  ptr(w, 'pointerup', s.x + dx, s.y + dy, 0);
  w.v.renderNow();
};
/** 화면에서 세계 점 p에서 q 쪽으로 n화소 옮긴 자리 */
const toward = (w: View, p: readonly number[], q: readonly number[], n: number): { x: number; y: number } => {
  const a = at(w, p), b = at(w, q);
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + ((b.x - a.x) * n) / l, y: a.y + ((b.y - a.y) * n) / l };
};
const key = (k: string) => ({ key: k, code: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} }) as unknown as KeyboardEvent;

describe('Viewer3d: 다른 점에서 끌어온 축(inference.track)', () => {
  const W: V3 = [50, 40, 10]; // E를 지나는 Z축 위
  const QX: V3 = [50, 0, 0]; // 첫 점 A의 X축 위에서 E와 나란한 자리
  it('점 붙잡기 위에 dwellMs 머물면 기억하고, 그 점을 지나는 축에 붙잡는다(방향 없음)', () => {
    const w = view(trackScene);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, track: true } });
    expect(v.measureSnap!.inference).toMatchObject({ track: { dwellMs: 500 } });
    hoverAt(w, E);
    expect(v.measureHoverSnap!.snap).toBe('endpoint');
    vi.advanceTimersByTime(499);
    expect(v.measureTrackPoints).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(v.measureTrackPoints).toEqual([E]);
    // E를 지나는 Z축 위
    hoverAt(w, W);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.axis).toBe('z');
    expect(dist(h.point, W)).toBeLessThan(1e-6);
    expect(h.trackFrom).toEqual(E);
    expect(h).not.toHaveProperty('direction');
    expect(h).not.toHaveProperty('segment');
    // 첫 점으로 찍으면 측정 점에도 끌어온 점이 실린다(측정 결과에는 없다)
    clickAt(w, W);
    expect(v.measurePoints[0]).toMatchObject({ snap: 'axis', axis: 'z', trackFrom: E });
    expect(v.measureTrackPoints).toEqual([E]);
    v.dispose();
  });

  it('첫 점 축 위에서 끌어온 점과 나란한 자리가 첫 점 축보다 먼저고, 방향이 있어 잠글 수 있다. 두 점째에서 잊는다', () => {
    const w = view(trackScene);
    const { v } = w;
    const got: unknown[] = [];
    v.onMeasure((m) => m && got.push(m));
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, track: true } });
    clickAt(w, A);
    expect(v.setMeasureTrackPoints([E])).toBe(1);
    // 첫 점 X축 위 E와 나란한 자리에서 3화소 옆: 첫 점 축 붙잡기라면 커서 쪽 점이지만 나란한 자리 그대로
    const c = toward(w, QX, [60, 0, 0], 3);
    hoverXY(w, c.x, c.y);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.axis).toBe('x');
    expect(h.point).toEqual(QX);
    expect(h.direction).toEqual([1, 0, 0]);
    expect(h.trackFrom).toEqual(E);
    expect(v.measureHoverLock).toMatchObject({ kind: 'axis', axis: 'x' });
    // 끌어온 축이 없는 자리는 첫 점 축 그대로
    const c2 = toward(w, [25, 0, 0], [30, 0, 0], 1);
    hoverXY(w, c2.x, c2.y);
    expect(v.measureHoverSnap!.snap).toBe('axis');
    expect(v.measureHoverSnap).not.toHaveProperty('trackFrom');
    // 끌어온 점을 지나는 축(첫 점 축이 아니다)은 잠글 방향이 없다
    hoverAt(w, W);
    expect(v.measureHoverSnap!.trackFrom).toEqual(E);
    expect(v.measureHoverLock).toBeNull();
    // 찍으면 두 점째 — 거리는 X 방향 50, 끌어온 점은 잊는다
    hoverXY(w, c.x, c.y);
    ptr(w, 'pointerdown', c.x, c.y, 1);
    ptr(w, 'pointerup', c.x, c.y, 0);
    const m = got.at(-1) as { distance: number; snapB: string; axisB: string; directionB: V3 };
    expect(m.distance).toBe(50);
    expect([m.snapB, m.axisB, m.directionB]).toEqual(['axis', 'x', [1, 0, 0]]);
    expect(v.measurePoints[1]).toMatchObject({ trackFrom: E, axis: 'x' });
    expect(v.measureTrackPoints).toEqual([]);
    v.dispose();
  });

  it('차례: 점 붙잡기 → 첫 점 축 → 끌어온 축, 잠금 중에는 끌어온 축을 쓰지 않는다', () => {
    const w = view(trackScene);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, track: true } });
    clickAt(w, A);
    // E 위는 끝점(끌어온 점이어도 점 붙잡기가 먼저)
    v.setMeasureTrackPoints([E]);
    hoverAt(w, E);
    expect(v.measureHoverSnap!.snap).toBe('endpoint');
    // '다' 둘레: 첫 점 X축(z = 0)과 그 끝을 지나는 X축(z = 1)이 모두 붙잡기 거리 안 — 첫 점 축이 먼저
    const D: V3 = [100, 0, 1];
    v.setMeasureTrackPoints([D]);
    hoverAt(w, [70, 0, 0.5]);
    let h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h).not.toHaveProperty('trackFrom');
    // 첫 점 축을 끄면 끌어온 축
    v.setMeasureSnap({ inference: { track: true } });
    v.setMeasureTrackPoints([D]);
    hoverAt(w, [70, 0, 0.5]);
    h = v.measureHoverSnap!;
    expect(h.trackFrom).toEqual(D);
    expect(h.axis).toBe('x');
    // 잠그면 잠근 선 위 점(끌어온 축 없음)
    v.setMeasureSnap({ inference: { axes: true, track: true } });
    v.clearMeasure();
    clickAt(w, A);
    v.setMeasureTrackPoints([E]);
    expect(v.setMeasureInferenceLock('z')).toBe(true);
    hoverAt(w, QX);
    h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h).not.toHaveProperty('trackFrom');
    v.dispose();
  });

  it('머무르기: 2화소 안은 이어 재고, 벗어나면 새로, 캔버스를 떠나거나 누르거나 터치면 기억하지 않는다', () => {
    const w = view(trackScene);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { track: { dwellMs: 300 } } });
    const e = at(w, E);
    hoverXY(w, e.x, e.y);
    vi.advanceTimersByTime(200);
    hoverXY(w, e.x + 1.2, e.y - 1.2);
    vi.advanceTimersByTime(100);
    expect(v.measureTrackPoints).toEqual([E]);
    // 벗어나면(3화소 — 아직 같은 끝점에 붙잡혀도) 새로 잰다
    v.setMeasureTrackPoints(null);
    hoverXY(w, e.x, e.y);
    vi.advanceTimersByTime(200);
    hoverXY(w, e.x + 3, e.y);
    expect(v.measureHoverSnap!.point).toEqual(E);
    vi.advanceTimersByTime(200);
    expect(v.measureTrackPoints).toEqual([]);
    vi.advanceTimersByTime(100);
    expect(v.measureTrackPoints).toEqual([E]);
    // 캔버스를 떠나면 버린다
    v.setMeasureTrackPoints(null);
    hoverXY(w, e.x, e.y);
    vi.advanceTimersByTime(100);
    w.canvas.fire('pointerleave', { pointerId: 1, pointerType: 'mouse' });
    vi.advanceTimersByTime(500);
    expect(v.measureTrackPoints).toEqual([]);
    // 누르면 버린다(첫 점으로 찍힌다)
    hoverXY(w, e.x, e.y);
    vi.advanceTimersByTime(100);
    clickAt(w, E);
    vi.advanceTimersByTime(500);
    expect(v.measurePointCount).toBe(1);
    expect(v.measureTrackPoints).toEqual([]);
    // 터치 포인터는 머무르지 않는다
    v.clearMeasure();
    hoverXY(w, e.x, e.y, 'touch');
    expect(v.measureHoverSnap!.snap).toBe('endpoint');
    vi.advanceTimersByTime(1000);
    expect(v.measureTrackPoints).toEqual([]);
    v.dispose();
  });

  it('지우기: 측정 지우기·Esc(첫 점 전에도)·붙잡기 선택 다시 주기·측정 모드 끄기. 셋까지, 측정 모드가 아니면 앱이 줄 수 없다', () => {
    const w = view(trackScene);
    const { v } = w;
    v.setMeasureSnap({ inference: { track: true } });
    expect(v.setMeasureTrackPoints([E])).toBe(0);
    v.setMeasureMode(true);
    expect(v.setMeasureTrackPoints([E, [1, 2, 3], [4, 5, 6], [7, 8, 9]])).toBe(3);
    expect(v.measureTrackPoints).toEqual([E, [1, 2, 3], [4, 5, 6]]);
    v.clearMeasure();
    expect(v.measureTrackPoints).toEqual([]);
    v.setMeasureTrackPoints([E]);
    expect(v.handleKey(key('Escape'))).toBe(true);
    expect(v.measureTrackPoints).toEqual([]);
    expect(v.handleKey(key('Escape'))).toBe(false);
    v.setMeasureTrackPoints([E]);
    v.setMeasureSnap({ inference: { track: true } });
    expect(v.measureTrackPoints).toEqual([]);
    v.setMeasureTrackPoints([E]);
    v.setMeasureMode(false);
    expect(v.measureTrackPoints).toEqual([]);
    v.dispose();
  });

  it('꺼져 있으면 상태도 후보도 없다(머물러도 기억하지 않고, 앱이 줘도 0)', () => {
    const w = view(trackScene);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true } });
    expect(v.measureSnap!.inference).not.toHaveProperty('track');
    hoverAt(w, E);
    vi.advanceTimersByTime(2000);
    expect(v.measureTrackPoints).toEqual([]);
    expect(v.setMeasureTrackPoints([E])).toBe(0);
    hoverAt(w, W);
    expect(v.measureHoverSnap?.snap ?? null).not.toBe('axis');
    clickAt(w, A);
    const c = toward(w, QX, [60, 0, 0], 3);
    hoverXY(w, c.x, c.y);
    // 첫 점 축 붙잡기 그대로(커서 쪽 점 — 나란한 자리로 당기지 않는다)
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h).not.toHaveProperty('trackFrom');
    expect(h.point).not.toEqual(QX);
    v.dispose();
  });
});
