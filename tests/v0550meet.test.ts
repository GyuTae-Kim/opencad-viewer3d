/**
 * 0.55.0 축·잠근 선·안내 선이 면을 뚫는 점의 평면·허용치(NC 57차 요청):
 *  - 순수: axisFaceSnap·lockFaceSnap·trackDirMeetSnap('face')이 찍을 점을 구한 평면(plane — 커서 아래 면의 평면)과 같은 자리 허용치(tol — 그 깊이 화면 반 화소)를 싣는다.
 *    얕게 접힌 면에서 다시 맞춘 면(hit — 이웃 칸)은 다르고 찍을 점은 그 칸 평면 밖이다(선이 곡면 벽을 스치는 자리와 같은 꼴). 점·면·거리는 0.54.0과 같다
 *  - 뷰어: refineFace 'axisFace'(열린 후보가 아닌 것) 입력에 plane·tol이 실리고(point가 plane 위, tol = 그 깊이 화면 반 화소), 'onFace'에는 없다.
 *    커서를 옮겨도 같은 코어 점이면 다시 부르지 않고, 확대하면(tol이 바뀐다) 다시 묻는다
 * 화면 좌표로 가리킬 때는 면·선의 경계를 정확히 가리키지 않고 몇 화소 옆을 가리킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, type ViewFrame, computeFrame, defaultCamera, dirToAngles, projectToScreen, screenRay, viewDepth, worldPerPixel } from '../src/camera';
import type { SnapRefineFaceInput } from '../src/snap';
import { boxMesh } from '../src/synth';
import { type TrackFaceHit, axisFaceSnap, lockFaceSnap, trackDirMeetSnap } from '../src/track';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
/** 점 p와 평면(점 q·법선 n) 사이 거리 */
const planeGap = (p: readonly number[], q: readonly number[], n: readonly number[]): number => Math.abs(dot(sub(p, q), n)) / Math.hypot(n[0]!, n[1]!, n[2]!);
const meetTolOf = (f: ViewFrame, m: readonly number[]): number => Math.max(0.5 * worldPerPixel(f, viewDepth(f, m)), 1e-9 * (1 + Math.max(...m.map(Math.abs))));

describe('면을 뚫는 점의 평면·허용치(순수)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [40, 30, 10], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [40, 30, 10], radius: 60 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  type Hit = TrackFaceHit & { name: string };
  /** 바닥(z = 0, x < 40)과 x = 40에서 아주 얕게 내려가는 칸(기울기 0.002) — 곡면을 나눈 이웃 칸처럼 */
  const s = 0.002;
  const parts = [
    { name: '바닥', q: [0, 0, 0] as V3, n: [0, 0, 1] as V3, inside: (p: V3) => p[0] >= 0 && p[0] < 40 && p[1] >= 0 && p[1] <= 80 },
    { name: '이웃 칸', q: [40, 0, 0] as V3, n: [s, 0, 1] as V3, inside: (p: V3) => p[0] >= 40 && p[0] <= 100 && p[1] >= 0 && p[1] <= 80 },
  ];
  const hitAt = (sx: number, sy: number): Hit | null => {
    const r = screenRay(f, sx, sy);
    let best: { t: number; h: Hit } | null = null;
    for (const q of parts) {
      const den = dot(q.n, r.dir);
      if (Math.abs(den) < 1e-12) continue;
      const t = dot(q.n, sub(q.q, r.origin)) / den;
      const p: V3 = [r.origin[0] + r.dir[0] * t, r.origin[1] + r.dir[1] * t, r.origin[2] + r.dir[2] * t];
      if (t > 0 && q.inside(p) && (!best || t < best.t)) best = { t, h: { point: p, normal: q.n, origin: q.q, name: q.name } };
    }
    return best?.h ?? null;
  };
  const O: V3 = [41, 30, 50];
  const M: V3 = [41, 30, 0];

  it('얕게 접힌 면: 커서 아래 면(바닥)의 평면으로 구한 점을 다시 맞춘 이웃 칸이 받는다 — plane은 바닥, hit는 이웃 칸, 점은 이웃 칸 평면 밖', () => {
    const [cx, cy] = at([39.6, 30, 0]);
    const under = hitAt(cx, cy)!;
    expect(under.name).toBe('바닥');
    const tol = meetTolOf(f, M);
    for (const r of [
      lockFaceSnap(f, O, [0, 0, 1], cx, cy, 25, under, hitAt)!,
      axisFaceSnap(f, [{ from: O, axis: 'z' }], cx, cy, 25, under, hitAt)!,
    ]) {
      expect(r.p).toEqual(M);
      expect(r.hit.name).toBe('이웃 칸');
      expect(r.plane).toEqual({ point: [0, 0, 0], normal: [0, 0, 1] });
      expect(r.tol).toBe(tol);
      // 찍을 점은 plane 위, 받은 칸의 평면에서는 s × 1만큼 밖(허용치 안이라 받았다)
      expect(planeGap(r.p, r.plane.point, r.plane.normal)).toBe(0);
      expect(planeGap(r.p, parts[1]!.q, parts[1]!.n)).toBeCloseTo(s / Math.hypot(s, 1), 12);
      expect(planeGap(r.p, parts[1]!.q, parts[1]!.n)).toBeLessThan(r.tol);
      // 복사본이다(면 맞음의 배열과 다른 객체)
      expect(r.plane.normal).not.toBe(under.normal);
    }
  });

  it('다시 구하면(가파르게 접힌 면) plane은 마지막으로 점을 구한 면의 평면이다 — 받은 면과 같다', () => {
    const steep = [parts[0]!, { ...parts[1]!, n: [Math.SQRT1_2, 0, Math.SQRT1_2] as V3 }];
    const fold = (sx: number, sy: number): Hit | null => {
      const r = screenRay(f, sx, sy);
      let best: { t: number; h: Hit } | null = null;
      for (const q of steep) {
        const t = dot(q.n, sub(q.q, r.origin)) / dot(q.n, r.dir);
        const p: V3 = [r.origin[0] + r.dir[0] * t, r.origin[1] + r.dir[1] * t, r.origin[2] + r.dir[2] * t];
        if (t > 0 && q.inside(p) && (!best || t < best.t)) best = { t, h: { point: p, normal: q.n, origin: q.q, name: q.name } };
      }
      return best?.h ?? null;
    };
    const A: V3 = [42, 30, 60];
    const [cx, cy] = at([39.5, 30, 0]);
    const r = lockFaceSnap(f, A, [0, 0, 1], cx, cy, 25, fold(cx, cy)!, fold)!;
    expect(r.hit.name).toBe('이웃 칸');
    expect(r.plane).toEqual({ point: [40, 0, 0], normal: [Math.SQRT1_2, 0, Math.SQRT1_2] });
    expect(r.p[2]).toBeCloseTo(-2, 9);
    expect(r.tol).toBe(meetTolOf(f, r.p));
  });

  it('안내 선이 면을 뚫는 점(trackDirMeetSnap face)도 plane·tol을 싣는다', () => {
    const P2: V3 = [30, 20, 15];
    const floor = (sx: number, sy: number): TrackFaceHit | null => {
      const ray = screenRay(f, sx, sy);
      const t = -ray.origin[2] / ray.dir[2];
      return t > 0 ? { point: [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t, 0], normal: [0, 0, 1], origin: [0, 0, 0] } : null;
    };
    const SEG: [V3, V3] = [
      [0, 0, 0],
      [10, 10, 0],
    ];
    const [x, y] = at([25, 25, 0]);
    const r = trackDirMeetSnap(f, [P2], SEG, x + 0.3, y + 0.2, 10, { under: floor(x + 0.3, y + 0.2)!, hitAt: floor })!;
    expect(r.meet.kind).toBe('face');
    if (r.meet.kind !== 'face') return;
    expect(r.meet.plane).toEqual({ point: [0, 0, 0], normal: [0, 0, 1] });
    expect(r.meet.tol).toBe(meetTolOf(f, r.p));
  });
});

describe('Viewer3d: refineFace 입력의 plane·tol(NC 57차)', () => {
  let dom: ReturnType<typeof installDom>;
  beforeAll(() => {
    dom = installDom();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });
  afterAll(() => {
    vi.useRealTimers();
    dom.restore();
  });

  /** 상자(0~120, 0~80, 0~40)와 기둥 선분 — 기둥 아래 끝 C의 Z축이 윗면을 T = (60, 40, 40)에서 뚫는다(v0190.test.ts와 같은 장면·같은 포인터 사건) */
  const C: V3 = [60, 40, 90];
  const T: V3 = [60, 40, 40];
  const scene: Scene3d = {
    name: 'f',
    units: 'mm',
    meshes: [boxMesh('상자', [0, 0, 0], [120, 80, 40], [0.6, 0.6, 0.7, 1])],
    lines: [{ id: '기둥', positions: new Float32Array([...C, 60, 40, 120]) }],
    points: [],
  };
  type View = { v: Viewer3d; canvas: FakeElement };
  const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
    w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
  const at = (w: View, p: readonly number[]): { x: number; y: number } => {
    const s = w.v.project(p)!;
    expect(s.onScreen).toBe(true);
    return { x: s.x, y: s.y };
  };
  const hoverXY = (w: View, x: number, y: number): void => {
    ptr(w, 'pointermove', x, y, 0);
    w.v.renderNow();
  };
  const clickXY = (w: View, x: number, y: number): void => {
    hoverXY(w, x, y);
    ptr(w, 'pointerdown', x, y, 1);
    ptr(w, 'pointerup', x, y, 0);
    w.v.renderNow();
  };

  it("'axisFace'에 plane(point가 그 위)·tol(그 깊이 화면 반 화소)이 실리고, 'onFace'에는 없다. 같은 코어 점이면 다시 묻지 않고 확대하면 다시 묻는다", () => {
    const calls: SnapRefineFaceInput[] = [];
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    v.setScene(scene);
    v.setView('seIso', false);
    v.fit(false);
    v.renderNow();
    const w: View = { v, canvas: v.canvas as unknown as FakeElement };
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, axisFaces: true }, refineFace: (c) => (calls.push(c), null) });
    const c0 = at(w, C);
    clickXY(w, c0.x + 1, c0.y);
    expect(v.measurePoints[0]!.point).toEqual(C);
    const s = at(w, T);
    hoverXY(w, s.x + 3, s.y + 1);
    const ax = calls.filter((c) => c.kind === 'axisFace' && !c.open);
    expect(ax).toHaveLength(1);
    const a = ax[0]!;
    expect(a.point).toEqual(T);
    expect(a.plane!.normal[0]).toBe(0);
    expect(a.plane!.normal[1]).toBe(0);
    expect(planeGap(a.point, a.plane!.point, a.plane!.normal)).toBeLessThan(1e-9);
    const f = (v as unknown as { frame: () => ViewFrame }).frame();
    expect(a.tol).toBe(meetTolOf(f, T));
    for (const c of calls.filter((c) => c.kind === 'onFace' || c.open)) {
      expect(c).not.toHaveProperty('plane');
      expect(c).not.toHaveProperty('tol');
    }
    // 커서를 옮겨도 같은 코어 점이면(같은 tol) 다시 묻지 않는다
    hoverXY(w, s.x + 5, s.y + 2);
    expect(calls.filter((c) => c.kind === 'axisFace' && !c.open)).toHaveLength(1);
    // 확대하면 tol이 바뀌어 다시 묻는다(코어 점·면·축은 같다)
    v.setCamera({ ...v.getCamera(), distance: v.getCamera().distance * 0.6 });
    v.renderNow();
    const s2 = at(w, T);
    hoverXY(w, s2.x + 3, s2.y + 1);
    const ax2 = calls.filter((c) => c.kind === 'axisFace' && !c.open);
    expect(ax2).toHaveLength(2);
    expect(ax2[1]!.point).toEqual(T);
    expect(ax2[1]!.tol).toBeLessThan(a.tol!);
    v.dispose();
  });
});
