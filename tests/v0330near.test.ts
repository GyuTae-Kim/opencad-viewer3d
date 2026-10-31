/**
 * 0.33.0 꼭짓점이 눈 뒤인 삼각형도 커서 둘레 삼각형으로 모으기(scenepick.ts trianglesNear·nearClipRing — STEP 36차 선택 요청):
 * 원근에서 아주 가까이 확대하면 키 큰 옆면 칸의 삼각형은 꼭짓점이 눈 뒤로 넘어간다. 0.32.0까지는 그런 삼각형을 모으지 않아 선이 그 칸을 비켜 가며
 * 곡면만 뚫는 자리(면의 열린 교차 — 0.22.0 'axisFace' open, 0.32.0 openFaces)가 붙지 않았다. 이제 가까운 면으로 자른 화면 다각형으로 본다.
 * - 순수 함수: nearClipRing(눈 뒤 꼭짓점 하나·둘·셋, 평행 투영), trianglesNear가 그 칸을 거리 0으로 모으는지(꼭짓점이 모두 눈앞인 삼각형은 예전 셈 그대로)
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 첫 점 X축이 원기둥 옆면 칸을 비켜 가며 원기둥만 두 번 뚫는 자리를 가까이 보면 두 교차 모두 원기둥 위로 붙고,
 *   refineFace 없이·null이면 붙지 않으며(커서 자리 그대로), 화면 격자에서 바뀐 자리는 모두 X축 위·원기둥 위 다듬은 교차다
 * 장면: 반지름 30 원기둥 옆면(24토막, 토막 꼭짓점 −97.5° + 15°·k — 남쪽 토막이 −90°를 가운데에 둔다), 높이 −200 ~ 200 한 칸을 대각선 하나로 나눈 두 삼각형.
 * 첫 점 P = (−45, −d, 0)의 X축(d = 30·cos5°)은 남쪽 토막의 현(30·cos7.5°)보다 바깥·원기둥보다 안을 지나 그물은 비켜 가며 원기둥을 x = ±30·sin5°에서 뚫고,
 * 두 교차는 대각선을 사이에 두고 두 삼각형에 하나씩 든다.
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, viewDepth } from '../src/camera';
import { nearClipRing, trianglesNear } from '../src/scenepick';
import type { SnapRefineFaceInput } from '../src/snap';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Mesh3d, Scene3d } from '../src/types';

const R = 30;
const N = 24;
const Z0 = -200;
const Z1 = 200;
const deg = (a: number): number => (a * Math.PI) / 180;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
/** 토막 k의 시작 각(남쪽 토막 k = 0이 −97.5° ~ −82.5°) */
const ang = (k: number): number => deg(-97.5 + 15 * k);

/** 원기둥 옆면(뚜껑 없음): 토막마다 칸 하나를 대각선 (θk, Z0) – (θk+1, Z1)로 나눈 두 삼각형 — 삼각형 2k는 θk+1 쪽, 2k + 1은 θk 쪽 */
function tube(): Mesh3d {
  const P: number[] = [];
  const I: number[] = [];
  for (let k = 0; k <= N; k++) {
    const a = ang(k);
    P.push(R * Math.cos(a), R * Math.sin(a), Z0, R * Math.cos(a), R * Math.sin(a), Z1);
  }
  for (let k = 0; k < N; k++) {
    const a0 = 2 * k, a1 = 2 * k + 1, b0 = 2 * k + 2, b1 = 2 * k + 3;
    I.push(a0, b0, b1, a0, b1, a1);
  }
  return { id: '원기둥', positions: new Float32Array(P), indices: new Uint32Array(I), color: [0.6, 0.65, 0.7, 1] };
}
const TUBE = tube();
const W = deg(5);
const D = R * Math.cos(W);
const XI = R * Math.sin(W);
const P0: V3 = [-45, -D, 0];
/** 두 교차: 첫 점 쪽(−x, θ0 쪽 삼각형 1)과 먼 쪽(+x, θ1 쪽 삼각형 0) */
const M1: V3 = [-XI, -D, 0];
const M2: V3 = [XI, -D, 0];
/** 앞에서 보는 방향(남쪽 조금 동쪽, 위에서 16°쯤 내려다본다) — 거리 22에서 위 꼭짓점(z 200)은 눈 뒤, 아래 꼭짓점은 눈앞 */
const LOOK: V3 = [0.25, -1, 0.3];
const DIST = 22;

/** 직선(o, d)과 원기둥(Z축, 반지름 R)의 교차 가운데 near에 가까운 근 */
function lineTube(o: readonly number[], d: readonly number[], near: readonly number[]): V3 | null {
  const a = d[0]! * d[0]! + d[1]! * d[1]!, b = o[0]! * d[0]! + o[1]! * d[1]!, k = o[0]! * o[0]! + o[1]! * o[1]! - R * R;
  const disc = b * b - a * k;
  if (!(a > 0) || disc < 0) return null;
  const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t]);
  return dist(ts[0]!, near) <= dist(ts[1]!, near) ? ts[0]! : ts[1]!;
}

function cameraAt(target: readonly number[]): CameraState {
  const a = dirToAngles(LOOK);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [target[0]!, target[1]!, target[2]!], distance: DIST, projection: 'perspective' };
}
const FRAME_SCENE = { center: [0, 0, 0] as V3, radius: Math.hypot(R, Z1) };

describe('nearClipRing·trianglesNear(꼭짓점이 눈 뒤인 삼각형)', () => {
  const f = computeFrame(cameraAt(M1), 600, 400, FRAME_SCENE);
  const corners = (t: number): [V3, V3, V3] =>
    [0, 1, 2].map((k) => {
      const i = TUBE.indices![t * 3 + k]! * 3;
      return [TUBE.positions[i]!, TUBE.positions[i + 1]!, TUBE.positions[i + 2]!] as V3;
    }) as [V3, V3, V3];

  it('전제: 남쪽 칸 두 삼각형의 위 꼭짓점(z 200)은 눈 뒤(projectToScreen null), 아래 꼭짓점은 눈앞이고, 두 교차는 화면 안이다', () => {
    for (const t of [0, 1]) {
      const cs = corners(t);
      for (const c of cs) expect(projectToScreen(f, c) === null, `${t} ${c[2]}`).toBe(c[2] > 0);
    }
    for (const M of [M1, M2]) {
      const s = projectToScreen(f, M)!;
      expect(s[0]).toBeGreaterThan(0);
      expect(s[0]).toBeLessThan(600);
      expect(s[1]).toBeGreaterThan(0);
      expect(s[1]).toBeLessThan(400);
    }
  });

  it('nearClipRing: 눈 뒤 꼭짓점 하나면 사각형, 둘이면 삼각형(가까운 면 위 두 점과 남은 꼭짓점), 셋이면 null, 평행 투영이면 null', () => {
    // 삼각형 0 = (θ0, Z0), (θ1, Z0), (θ1, Z1): 위 꼭짓점 하나가 눈 뒤
    const r0 = nearClipRing(f, corners(0))!;
    expect(r0.length).toBe(4);
    // 남은 두 꼭짓점은 projectToScreen과 같은 자리
    const s00 = projectToScreen(f, corners(0)[0])!, s01 = projectToScreen(f, corners(0)[1])!;
    expect(r0[0]![0]).toBeCloseTo(s00[0], 6);
    expect(r0[0]![1]).toBeCloseTo(s00[1], 6);
    expect(r0[1]![0]).toBeCloseTo(s01[0], 6);
    expect(r0[1]![1]).toBeCloseTo(s01[1], 6);
    // 삼각형 1 = (θ0, Z0), (θ1, Z1), (θ0, Z1): 위 꼭짓점 둘이 눈 뒤
    expect(nearClipRing(f, corners(1))!.length).toBe(3);
    // 모두 눈 뒤
    const back: [V3, V3, V3] = [
      [0, -D, 400],
      [10, -D, 400],
      [0, -D + 5, 400],
    ];
    expect(back.every((c) => projectToScreen(f, c) === null)).toBe(true);
    expect(nearClipRing(f, back)).toBeNull();
    const fo = computeFrame({ ...cameraAt(M1), projection: 'orthographic' }, 600, 400, FRAME_SCENE);
    expect(nearClipRing(fo, corners(0))).toBeNull();
  });

  it('trianglesNear: 커서가 두 교차 둘레면 그 칸의 삼각형을 거리 0(커서가 그 위)으로 모은다 — 깊이는 커서 광선이 그 평면을 맞는 자리', () => {
    const items = { meshes: [TUBE], lines: [], points: [] };
    for (const [M, tri] of [
      [M1, 1],
      [M2, 0],
    ] as const) {
      const s = projectToScreen(f, M)!;
      const hs = trianglesNear(f, s[0] + 1.3, s[1] + 2.1, items, { bvh: () => null }, 10);
      const h = hs.find((x) => x.index === tri);
      expect(h, `${tri}`).toBeDefined();
      expect(h!.distPx).toBe(0);
      expect(h!.depth).toBeGreaterThan(0);
      expect(Math.abs(h!.depth - viewDepth(f, M))).toBeLessThan(1);
      // 눈 쪽 법선(남쪽 칸 — −Y 쪽)
      expect(h!.normal[1]).toBeLessThan(-0.9);
    }
  });

  it('꼭짓점이 모두 눈앞인 삼각형(멀리서 본 같은 칸)은 예전 셈 그대로 — 커서가 위면 거리 0, 밖이면 변까지', () => {
    const far: CameraState = { ...cameraAt(M1), distance: 900 };
    const g = computeFrame(far, 600, 400, FRAME_SCENE);
    for (const t of [0, 1]) for (const c of corners(t)) expect(projectToScreen(g, c)).not.toBeNull();
    const items = { meshes: [TUBE], lines: [], points: [] };
    const s = projectToScreen(g, [0, -R * Math.cos(deg(7.5)), 0])!;
    const hs = trianglesNear(g, s[0] + 0.3, s[1] + 0.4, items, { bvh: () => null }, 10);
    expect(hs.some((h) => (h.index === 0 || h.index === 1) && h.distPx === 0)).toBe(true);
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
const scene: Scene3d = { name: 't', units: 'mm', meshes: [TUBE], lines: [], points: [] };
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
type Snap = Parameters<Viewer3d['setMeasureSnap']>[0];
const tubeRefine = (calls: SnapRefineFaceInput[] = []) => (c: SnapRefineFaceInput): V3 | null => {
  calls.push(c);
  return c.kind === 'axisFace' && c.face.id === '원기둥' ? lineTube(c.line.origin, c.line.dir, c.point) : null;
};
const FACES = { inference: { axes: true, lock: true, axisFaces: true, lockFaces: true } } as const;
/** P0(앱 점)을 첫 점으로 찍고 target 둘레로 아주 가까이 다가간 뷰 */
function firstAt(o: Snap, target: readonly number[] = M1): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  v.setScene(scene);
  v.setView('front', false);
  v.fit(false);
  v.renderNow();
  const w: View = { v, canvas: v.canvas as unknown as FakeElement };
  v.setMeasureMode(true);
  v.setMeasureSnap({ points: [{ point: P0, kind: 'point' }], ...o });
  const s = at(w, P0);
  hoverXY(w, s.x + 1, s.y);
  ptr(w, 'pointerdown', s.x + 1, s.y, 1);
  ptr(w, 'pointerup', s.x + 1, s.y, 0);
  v.renderNow();
  expect(v.measurePoints[0]!.point).toEqual(P0);
  v.setCamera(cameraAt(target));
  v.renderNow();
  return w;
}

describe("Viewer3d: 아주 가까이 본 키 큰 옆면 칸의 면의 열린 교차(0.22.0 refineFace — 'axisFace', open)", () => {
  it('첫 점 X축이 칸을 비켜 가며 원기둥만 뚫는 두 자리 모두 원기둥 위 교차로 붙는다(그 칸 삼각형은 위 꼭짓점이 눈 뒤)', () => {
    for (const M of [M1, M2]) {
      const calls: SnapRefineFaceInput[] = [];
      const w = firstAt({ ...FACES, refineFace: tubeRefine(calls) }, M);
      const s = at(w, M);
      hoverXY(w, s.x + 1, s.y + 2);
      const h = w.v.measureHoverSnap!;
      expect(h, `${M[0]}`).toMatchObject({ snap: 'axis', axis: 'x', refined: true, face: { id: '원기둥' } });
      expect(dist(h.point, M)).toBeLessThan(1e-9);
      expect([h.point[1], h.point[2]]).toEqual([P0[1], P0[2]]);
      const open = calls.filter((c) => c.open);
      expect(open.length).toBeGreaterThanOrEqual(1);
      expect(open.every((c) => c.kind === 'axisFace' && c.face.id === '원기둥' && c.line.axis === 'x')).toBe(true);
      w.v.dispose();
    }
  });

  it('refineFace 없이·늘 null이면 붙지 않고 X축 위 커서 자리(0.32.0과 같은 꼴)', () => {
    for (const o of [FACES, { ...FACES, refineFace: () => null }] as Snap[]) {
      const w = firstAt(o);
      const s = at(w, M1);
      hoverXY(w, s.x + 1, s.y + 2);
      const h = w.v.measureHoverSnap!;
      expect(h.snap).toBe('axis');
      expect(h).not.toHaveProperty('refined');
      expect(h).not.toHaveProperty('face');
      w.v.dispose();
    }
  });

  it('두 교차 둘레 화면 격자(21 × 21, 1.37화소 칸 — 경계를 비킨 자리): refineFace 없는 뷰어와 다른 자리는 모두 X축 위·원기둥 위 다듬은 교차이고, 교차 둘레에서는 바뀐다', () => {
    for (const M of [M1, M2]) {
      const on = firstAt({ ...FACES, refineFace: tubeRefine() }, M);
      const off = firstAt(FACES, M);
      const c = at(on, M);
      let changed = 0;
      for (let iy = -10; iy <= 10; iy++)
        for (let ix = -10; ix <= 10; ix++) {
          const x = c.x + ix * 1.37 + 0.211, y = c.y + iy * 1.37 - 0.173;
          hoverXY(on, x, y);
          hoverXY(off, x, y);
          const a = on.v.measureHoverSnap, b = off.v.measureHoverSnap;
          if (JSON.stringify(a) === JSON.stringify(b)) continue;
          changed++;
          const k = `${M[0]} ${ix},${iy}`;
          expect(a, k).toBeTruthy();
          expect(a!.refined, k).toBe(true);
          expect(a!.face?.id, k).toBe('원기둥');
          expect(Math.abs(Math.hypot(a!.point[0], a!.point[1]) - R), k).toBeLessThan(1e-9);
          expect([a!.point[1], a!.point[2]], k).toEqual([P0[1], P0[2]]);
          expect(dist(a!.point, M), k).toBeLessThan(1e-9);
        }
      expect(changed, `${M[0]}`).toBeGreaterThan(20);
      on.v.dispose();
      off.v.dispose();
    }
  });
});
