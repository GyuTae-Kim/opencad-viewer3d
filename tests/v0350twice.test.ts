/**
 * 0.35.0 한 칸을 나눈 두 삼각형 위를 두 번 스치는 선의 둘째 힌트(track.ts openFaceCandidates의 cellTwice — STEP 37차 선택 요청):
 * 원기둥 옆면 칸을 대각선으로 나누면 삼각형마다 휘는 변이 하나뿐이라, 칸과 나란히 지나는 선의 두 교차가 한 삼각형에 다 들어도 0.24.0 faceTwice는 부호 하나만 얻어
 * 둘째 힌트를 두지 않았다(무게중심 쪽 교차만 붙었다). 이제 같은 평면 이웃과 묶은 칸의 두 휘는 변으로 곡면(원호)을 어림해 두 근이 다 그 삼각형 위면 둘째 힌트를 둔다.
 * 두 근이 칸의 두 삼각형에 나뉘면 0.24.0 그대로다(tests/v0240face.test.ts 높이 3).
 * - 순수: openFaceCandidates(낮은 원기둥 칸 — 두 근이 아래 삼각형에 다 들 때·나뉠 때)
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 낮은 원기둥(반지름 30, 높이 60, 50토막) 칸 아래쪽 한 삼각형 위를 두 번 스치는 첫 점 X축의 두 교차 모두 원기둥 위로,
 *   화면 격자에서 열린 후보에 null을 주는 뷰어와 다른 자리는 모두 그 축 위·원기둥 위 다듬은 교차
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, projectToScreen, viewDepth, worldPerPixel } from '../src/camera';
import { openFaceCandidates } from '../src/track';
import { type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { SnapRefineFaceInput } from '../src/snap';
import type { V3 } from '../src/math';
import type { Mesh3d, Scene3d } from '../src/types';

const D = Math.PI / 180;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const SNAP = 10;
const LR = 30, LH = 60, LN = 50;
const STEP = (360 / LN) * D;
/** 칸 k의 시작 각 — 칸 0이 −90°를 가운데에 둔다(−93.6° ~ −86.4°) */
const lowAng = (k: number): number => -90 * D - STEP / 2 + STEP * k;
/** 원기둥 옆면(뚜껑 없음): 칸마다 [아래 k, 아래 k + 1, 위 k](아래 변 전체를 가진 쪽 — 짝수)·[위 k, 아래 k + 1, 위 k + 1](홀수). 대각선은 (아래 k + 1) – (위 k) */
function lowCylinder(): Mesh3d {
  const P: number[] = [];
  const I: number[] = [];
  for (let k = 0; k <= LN; k++) {
    const a = lowAng(k);
    P.push(LR * Math.cos(a), LR * Math.sin(a), 0, LR * Math.cos(a), LR * Math.sin(a), LH);
  }
  for (let k = 0; k < LN; k++) I.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
  return { id: '원기둥', positions: new Float32Array(P), indices: new Uint32Array(I), color: [0.6, 0.65, 0.7, 1] };
}
const LOW = lowCylinder();
const LOWSC: Scene3d = { name: 'low', units: 'mm', meshes: [LOW], lines: [], points: [] };
/** 첫 점(앱 점)과 그 X축: 칸 0의 현과 나란히 높이 z, 중심에서 d = R·cos(w)(w = 칸 반각의 ½) — 두 교차 x = ±R·sin(w) */
const W = STEP / 4;
const LD = LR * Math.cos(W);
const lowFirst = (z: number): V3 => [-45, -LD, z];
const lowRoots = (z: number): [V3, V3] => [
  [-LR * Math.sin(W), -LD, z],
  [LR * Math.sin(W), -LD, z],
];
/** 앱 refineFace: 원기둥 옆면이면 그 직선과 원기둥(높이 안)의 교차 가운데 point에 가까운 근 */
const cylRefine = (calls: SnapRefineFaceInput[] = []) => (c: SnapRefineFaceInput): V3 | null => {
  calls.push(c);
  if ((c.kind !== 'axisFace' && c.kind !== 'onFace') || c.face.id !== '원기둥') return null;
  const o = c.line.origin, d = c.line.dir;
  const A = d[0] * d[0] + d[1] * d[1], B = o[0] * d[0] + o[1] * d[1], C = o[0] * o[0] + o[1] * o[1] - LR * LR;
  const disc = B * B - A * C;
  if (!(A > 1e-12) || disc < 0) return null;
  const qs = [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A].map((s): V3 => [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s]);
  const q = dist(qs[0]!, c.point) <= dist(qs[1]!, c.point) ? qs[0]! : qs[1]!;
  return q[2] >= 0 && q[2] <= LH ? q : null;
};
const lowTri = (i: number): V3[] =>
  [0, 1, 2].map((k) => {
    const j = LOW.indices![i * 3 + k]! * 3;
    return [LOW.positions[j]!, LOW.positions[j + 1]!, LOW.positions[j + 2]!] as V3;
  });
/** 바깥 남쪽에서 거리 15로 비스듬히(칸이 모두 눈앞) */
const camAt = (target: readonly number[]): CameraState => ({ ...defaultCamera(), yaw: Math.PI / 18, pitch: 0.25, target: [target[0]!, target[1]!, target[2]!], distance: 15, projection: 'perspective' });

describe('openFaceCandidates의 칸 둘째 힌트(0.35.0 cellTwice)', () => {
  const tris = (f: ReturnType<typeof computeFrame>, at: readonly number[]) =>
    [0, 1, 2, 3, LN * 2 - 1, LN * 2 - 2].map((i) => ({ corners: lowTri(i), wpp: worldPerPixel(f, viewDepth(f, at)), index: i }));

  it('높이 5: 두 근이 칸 0의 아래 삼각형(0)에 다 들면 그 삼각형에 둘째 힌트 둘(0.34.0은 무게중심 쪽 하나)', () => {
    const [, R] = lowRoots(5);
    const f = computeFrame(camAt(R), 800, 600, { center: [0, 0, 30], radius: 60 });
    const s = projectToScreen(f, R)!;
    const cs = openFaceCandidates(f, [{ from: lowFirst(5), dir: [1, 0, 0] }], tris(f, R), s[0] + 1, s[1] + 2, SNAP).filter((c) => c.tri.index === 0);
    expect(cs.length).toBe(3);
    expect(cs.every((c) => c.twice)).toBe(true);
    expect(cs.filter((c) => c.twin).length).toBe(2);
    // 전제: 두 근 모두 칸 0(−93.6° ~ −86.4°)의 높이 5에서 대각선(−87.0°)보다 왼쪽 — 아래 삼각형
    for (const Q of lowRoots(5)) {
      const a = Math.atan2(Q[1], Q[0]);
      expect(a).toBeGreaterThan(lowAng(0));
      expect(a).toBeLessThan(lowAng(1) - (5 / LH) * STEP);
    }
  });

  it('높이 30: 두 근이 칸 0의 두 삼각형에 나뉘면(대각선이 −90°) 둘째 힌트를 두지 않는다(0.24.0 그대로)', () => {
    const [, R] = lowRoots(30);
    const f = computeFrame(camAt(R), 800, 600, { center: [0, 0, 30], radius: 60 });
    const s = projectToScreen(f, R)!;
    const cs = openFaceCandidates(f, [{ from: lowFirst(30), dir: [1, 0, 0] }], tris(f, R), s[0] + 1, s[1] + 2, SNAP);
    expect(cs.length).toBeGreaterThanOrEqual(1);
    expect(cs.some((c) => c.twice || c.twin)).toBe(false);
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
/** 첫 점(앱 점)을 찍고 target을 거리 15에서 비스듬히 보는 뷰어 */
function lowView(refineFace: MeasureSnapOptions['refineFace'], target: readonly number[], z: number): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  const w: View = { v, canvas: v.canvas as unknown as FakeElement };
  v.setScene(LOWSC);
  v.setView('seIso', false);
  v.fit(false);
  v.setMeasureMode(true);
  v.setMeasureSnap({ points: [{ point: lowFirst(z), kind: 'point' }], inference: INF, refineFace });
  v.renderNow();
  const s = at(w, lowFirst(z));
  hoverXY(w, s.x + 1, s.y);
  ptr(w, 'pointerdown', s.x + 1, s.y, 1);
  ptr(w, 'pointerup', s.x + 1, s.y, 0);
  v.renderNow();
  expect(v.measurePoints[0]!.point).toEqual(lowFirst(z));
  v.setCamera(camAt(target));
  v.renderNow();
  return w;
}

describe('Viewer3d: 칸 아래쪽 한 삼각형 위를 두 번 스치는 첫 점 X축(0.35.0 — STEP 37차 재현 꼴)', () => {
  it('높이 5: 두 교차 둘레를 가리키면 둘 다 원기둥 위 다듬은 교차(0.34.0은 무게중심 쪽이 아닌 교차가 축 위 커서 자리)', () => {
    for (const Q of lowRoots(5)) {
      const calls: SnapRefineFaceInput[] = [];
      const w = lowView(cylRefine(calls), Q, 5);
      const s = at(w, Q);
      hoverXY(w, s.x + 1.3, s.y + 2.1);
      const h = w.v.measureHoverSnap!;
      expect(h, `${Q[0]}`).toMatchObject({ snap: 'axis', axis: 'x', refined: true, face: { id: '원기둥', index: 0 } });
      expect(dist(h.point, Q)).toBeLessThan(1e-9);
      expect(calls.some((c) => c.open)).toBe(true);
      w.v.dispose();
    }
  });

  it('두 교차 둘레 화면 격자(13 × 13, 1.37화소 칸): 열린 후보에 null을 주는 뷰어와 다른 자리는 모두 그 축 위·원기둥 위 다듬은 교차이고, 두 교차 둘레 모두 바뀐다', () => {
    const closedOnly = (c: SnapRefineFaceInput): V3 | null => (c.open ? null : cylRefine()(c));
    for (const Q of lowRoots(5)) {
      const on = lowView(cylRefine(), Q, 5);
      const off = lowView(closedOnly, Q, 5);
      const c = at(on, Q);
      let changed = 0;
      for (let iy = -6; iy <= 6; iy++)
        for (let ix = -6; ix <= 6; ix++) {
          const x = c.x + ix * 1.37 + 0.211, y = c.y + iy * 1.37 - 0.173;
          hoverXY(on, x, y);
          hoverXY(off, x, y);
          const p = on.v.measureHoverSnap, q = off.v.measureHoverSnap;
          if (JSON.stringify(p) === JSON.stringify(q)) continue;
          changed++;
          const k = `${Q[0]} ${ix},${iy}`;
          expect(p, k).toMatchObject({ snap: 'axis', axis: 'x', refined: true });
          expect(Math.abs(Math.hypot(p!.point[0], p!.point[1]) - LR), k).toBeLessThan(1e-9);
          expect([p!.point[1], p!.point[2]], k).toEqual([-LD, 5]);
        }
      expect(changed, `${Q[0]}`).toBeGreaterThan(40);
      on.v.dispose();
      off.v.dispose();
    }
  });
});
