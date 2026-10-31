/**
 * 0.35.0 꺾은선 토막의 열린 교차를 아주 가까이 확대할 때(track.ts openEdgeCandidates·cursorInLens):
 * 선과 현 사이(활꼴 안)가 붙잡기 거리의 세계 길이보다 넓으면 0.34.0까지 후보에서 빠졌다. 이제 커서가 그 토막의 활꼴 쪽(현과 선 위 가장 가까운 점이 놓인 평면을
 * 커서 광선이 맞는 자리가 현 범위 안·현에서 선 쪽으로 활꼴 높이 한도 안)이면 그 길이를 보지 않는다(0.34.0 면의 열린 교차와 같은 근거).
 * 토막은 여전히 커서 둘레(화면에서 붙잡기 거리 안 — segmentsAround)여야 한다.
 * - 순수: cursorInLens, openEdgeCandidates(12토막 원 — 활꼴 쪽·현 반대쪽 커서)
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 12토막 원의 활꼴을 지나는 첫 점 X축을 1화소 0.05로 위에서 보면 두 교차 모두 원 위로(0.34.0은 축 위 커서 자리),
 *   0.02면 현이 커서에서 붙잡기 거리 밖이라 그대로. NC 23차 재현의 앞 1단은 tests/v0230.test.ts·v0330ends.test.ts
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, projectToScreen, screenRay, viewDepth, worldPerPixel } from '../src/camera';
import { cursorInLens, openEdgeCandidates } from '../src/track';
import { type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { SnapRefineInput } from '../src/snap';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const D = Math.PI / 180;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const SNAP = 10;

/** 원(중심 0, 반지름 30, z 0)의 꼭짓점 15° + 30°·k — 꼭대기 토막(75°~105°)의 현은 y = 30·sin75° = 28.98, 활꼴 높이 1.02 */
const ringV = (k: number): V3 => [30 * Math.cos((15 + 30 * k) * D), 30 * Math.sin((15 + 30 * k) * D), 0];
const RING: Scene3d = {
  name: 'r',
  units: 'mm',
  meshes: [],
  lines: [
    {
      id: '원',
      positions: new Float32Array(Array.from({ length: 12 }, (_, k) => [...ringV(k), ...ringV(k + 1)]).flat()),
      segmentIds: new Uint32Array(Array.from({ length: 12 }, (_, k) => 100 + k)),
    },
  ],
  points: [],
};
/** 첫 점(앱 점)과 그 X축: y = 29.5(현과 원 사이 — 틈 0.52), 두 교차 x = ±√(900 − 29.5²) */
const A0: V3 = [-40, 29.5, 0];
const XI = Math.sqrt(900 - 29.5 * 29.5);
/** 직선(o, d)과 원(중심 0, 반지름 30 — z 평면에 비춤)의 교차 가운데 near에 가까운 근 */
function circleRoot(o: readonly number[], d: readonly number[], near: readonly number[]): V3 | null {
  const A = d[0]! * d[0]! + d[1]! * d[1]!, B = o[0]! * d[0]! + o[1]! * d[1]!, C = o[0]! * o[0]! + o[1]! * o[1]! - 900;
  const disc = B * B - A * C;
  if (!(A > 1e-12) || disc < 0) return null;
  const qs = [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A].map((s): V3 => [o[0]! + d[0]! * s, o[1]! + d[1]! * s, o[2]! + d[2]! * s]);
  return dist(qs[0]!, near) <= dist(qs[1]!, near) ? qs[0]! : qs[1]!;
}
/** 앱 refine: 원 토막과 같은 평면(z 0)의 직선이면 point에 가까운 원 위 근 */
const ringRefine = (c: SnapRefineInput): V3 | null =>
  c.kind !== 'axisEdge' || !c.line || c.segment.id !== '원' || Math.abs(c.line.dir[2]) > 1e-12 || Math.abs(c.line.origin[2]) > 1e-9 ? null : circleRoot(c.line.origin, c.line.dir, c.point);

describe('cursorInLens·openEdgeCandidates(0.35.0 — 커서가 토막의 활꼴 쪽)', () => {
  const a = ringV(2), b = ringV(3); // 꼭대기 토막 75° → 105°
  const m: V3 = [0, 29.5, 0]; // 선 위에서 현에 가장 가까운 점
  const h = 0.1 * dist(a, b);
  const down = (x: number, y: number) => ({ origin: [x, y, 10] as V3, dir: [0, 0, -1] as V3 });

  it('cursorInLens: 현과 선 쪽으로 활꼴 높이 한도 안·현 범위 안이면 true, 현 반대쪽·한도 밖·범위 밖·나란한 광선·현 위 점이면 false', () => {
    expect(cursorInLens(down(0.3, 29.3), a, b, m, h)).toBe(true);
    expect(cursorInLens(down(XI, 29.6), a, b, m, h)).toBe(true);
    expect(cursorInLens(down(0.3, 28.5), a, b, m, h)).toBe(false);
    expect(cursorInLens(down(0.3, 28.98 + h + 0.2), a, b, m, h)).toBe(false);
    expect(cursorInLens(down(9, 29.3), a, b, m, h)).toBe(false);
    expect(cursorInLens({ origin: [0, 29.3, 10], dir: [1, 0, 0] }, a, b, m, h)).toBe(false);
    expect(cursorInLens(down(0.3, 29.3), a, b, [0, (a[1] + b[1]) / 2, 0], h)).toBe(false);
  });

  it('openEdgeCandidates: 1화소 0.05(틈 0.52 = 10.4화소 > 붙잡기 거리)에서 커서가 활꼴 쪽이면 후보, 현 반대쪽이면 없다', () => {
    // 위에서 본 평행 투영, 꼭대기 둘레 1화소 = 0.05
    const cam: CameraState = { ...defaultCamera(), yaw: 0, pitch: Math.PI / 2 - 1e-9, target: [0, 29, 0], distance: 100, projection: 'orthographic' };
    const f0 = computeFrame(cam, 800, 600, { center: [0, 0, 0], radius: 50 });
    const w0 = worldPerPixel(f0, viewDepth(f0, [0, 29, 0]));
    const f = computeFrame({ ...cam, distance: (100 * 0.05) / w0 }, 800, 600, { center: [0, 0, 0], radius: 50 });
    const wpp = worldPerPixel(f, viewDepth(f, [0, 29, 0]));
    expect(wpp).toBeCloseTo(0.05, 6);
    const seg = { a, b, wpp };
    const line = [{ from: A0, dir: [1, 0, 0] as V3 }];
    const s = projectToScreen(f, [XI, 29.5, 0])!;
    // 0.34.0 규칙(틈 ≤ 붙잡기 거리의 세계 길이)으로는 없는 자리
    expect(0.52).toBeGreaterThan(SNAP * wpp);
    const cs = openEdgeCandidates(f, line, [seg], s[0] + 1, s[1] + 2, SNAP);
    expect(cs.length).toBeGreaterThanOrEqual(1);
    expect(cursorInLens(screenRay(f, s[0] + 1, s[1] + 2), a, b, cs[0]!.p, 0.1 * dist(a, b))).toBe(true);
    // 현 반대쪽(현 아래 3화소 — 현은 커서에서 붙잡기 거리 안이어도 활꼴 쪽이 아니다)
    const c = projectToScreen(f, [XI, 28.98 - 3 * wpp, 0])!;
    expect(openEdgeCandidates(f, line, [seg], c[0], c[1], SNAP)).toEqual([]);
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
const INF = { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true, axisFaces: true, lockEdges: true, lockFaces: true } as const;
/** A0(앱 점)을 첫 점으로 찍고 위에서 원 꼭대기 둘레를 1화소 = w로(zoomToRect) */
function ringView(refine: MeasureSnapOptions['refine'], w: number): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  const vw: View = { v, canvas: v.canvas as unknown as FakeElement };
  v.setScene(RING);
  v.setView('top', false);
  v.fit(false);
  v.setMeasureMode(true);
  v.setMeasureSnap({ points: [{ point: A0, kind: 'point' }], inference: INF, refine });
  v.renderNow();
  const s0 = at(vw, A0);
  hoverXY(vw, s0.x + 1, s0.y);
  ptr(vw, 'pointerdown', s0.x + 1, s0.y, 1);
  ptr(vw, 'pointerup', s0.x + 1, s0.y, 0);
  v.renderNow();
  expect(v.measurePoints[0]!.point).toEqual(A0);
  const hw = 400 * w;
  const p = v.project([-hw, 29.5 - 0.75 * hw, 0])!, q = v.project([hw, 29.5 + 0.75 * hw, 0])!;
  v.zoomToRect(Math.min(p.x, q.x), Math.min(p.y, q.y), Math.max(p.x, q.x), Math.max(p.y, q.y), false);
  v.renderNow();
  return vw;
}

describe('Viewer3d: 아주 가까이 본 12토막 원의 활꼴 열린 교차(0.35.0)', () => {
  it('1화소 0.05(틈 10.4화소)에서 두 교차 둘레(활꼴 쪽 2화소)를 가리키면 원 위 교차(첫 점 X축·꼭대기 토막·다듬음), refine이 null이면 축 위 커서 자리', () => {
    for (const sgn of [-1, 1]) {
      const w = ringView(ringRefine, 0.05);
      const Q: V3 = [sgn * XI, 29.5, 0];
      const s = at(w, Q);
      hoverXY(w, s.x + 1, s.y + 2);
      const h = w.v.measureHoverSnap!;
      expect(h, `${sgn}`).toMatchObject({ snap: 'axis', axis: 'x', refined: true, segment: { id: '원', index: 102 } });
      expect(dist(h.point, Q)).toBeLessThan(1e-9);
      w.v.setMeasureSnap({ points: [{ point: A0, kind: 'point' }], inference: INF, refine: () => null });
      hoverXY(w, s.x + 1.3, s.y + 2);
      expect(w.v.measureHoverSnap!).not.toHaveProperty('refined');
      w.v.dispose();
    }
  });

  it('1화소 0.02(틈 26화소)면 현이 커서에서 붙잡기 거리 밖이라 그대로 축 위 커서 자리(커서 둘레 선분이 없다)', () => {
    const w = ringView(ringRefine, 0.02);
    const s = at(w, [XI, 29.5, 0]);
    hoverXY(w, s.x + 1, s.y + 2);
    const h = w.v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h).not.toHaveProperty('segment');
    expect(h).not.toHaveProperty('refined');
    w.v.dispose();
  });
});
