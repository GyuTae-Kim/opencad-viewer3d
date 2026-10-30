/**
 * 0.24.0 면의 열린 교차 둘째 힌트(track.ts openFaceCandidates의 twice·twin — refineFace 'axisFace', open).
 * NC 25차 재현 꼴: 판 외곽선 볼록 호(중심 (200, 260), R50, 37°→121°, 17토막 — 꼭대기 90°가 86.412°~91.353° 토막 안)를 높이 0~18로 세운 벽(토막마다 삼각형 둘 —
 * 오른쪽 아래·왼쪽 위, 대각선은 왼쪽 아래 → 오른쪽 위)과 첫 점 (100, 309.995, z)의 X축. 축은 꼭대기 토막의 현과 거의 나란히 활꼴만 지나 원기둥을 두 번(x ≈ 199.293·200.707) 뚫는다.
 * - 높이 9: 두 근 모두 꼭대기 토막 왼쪽 위 삼각형 위 — 0.22.0 힌트(무게중심 쪽)로는 x ≈ 200.707 하나만, 둘째 힌트(그 조각의 두 끝)로 199.293도 온다
 * - 높이 3: 두 근이 두 삼각형에 나뉜다 — 오른쪽 아래 삼각형(근 하나)에는 둘째 힌트를 두지 않는다
 * - 구(48×24칸)의 적도를 스치는 Z축: 두 근이 위·아래 칸에 나뉜다(적도 변 법선이 축과 수직) — 둘째 힌트를 두지 않는다(0.22.0 값 묶음 globe-measure-face-open이 그대로)
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, viewDepth, worldPerPixel } from '../src/camera';
import type { SnapRefineFaceInput } from '../src/snap';
import { sphereMesh } from '../src/synth';
import { type OpenFaceCandidate, type TrackTriangle, openFaceCandidates, openFaceSnap } from '../src/track';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Mesh3d, Scene3d } from '../src/types';

const D = Math.PI / 180;
const R = 50, CU = 200, CV = 260, H = 18;
const YL = 309.995;
const ang = (k: number): number => (37 + (84 * k) / 17) * D;
const vtx = (k: number, z: number): V3 => [CU + R * Math.cos(ang(k)), CV + R * Math.sin(ang(k)), z];
/** 꼭대기 토막(오른쪽 끝 k = 10 — 86.412°, 왼쪽 끝 11 — 91.353°) */
const APEX = 10;
/** 축(y = yl, 높이 z)이 원기둥을 뚫는 두 근(왼쪽 L, 오른쪽 R) */
const roots = (yl: number, z: number): [V3, V3] => {
  const s = Math.sqrt(R * R - (yl - CV) ** 2);
  return [
    [CU - s, yl, z],
    [CU + s, yl, z],
  ];
};

/** 벽 삼각형(토막 k: 오른쪽 아래 [a0, b0, b1], 왼쪽 위 [a0, b1, a1] — a = 왼쪽 끝 k + 1, b = 오른쪽 끝 k) */
function wallTriangles(): { corners: V3[]; strip: number; upper: boolean }[] {
  const out: { corners: V3[]; strip: number; upper: boolean }[] = [];
  for (let k = 0; k < 17; k++) {
    const a0 = vtx(k + 1, 0), a1 = vtx(k + 1, H), b0 = vtx(k, 0), b1 = vtx(k, H);
    out.push({ corners: [a0, b0, b1], strip: k, upper: false }, { corners: [a0, b1, a1], strip: k, upper: true });
  }
  return out;
}
function wallMesh(): Mesh3d {
  const positions: number[] = [];
  for (let k = 0; k <= 17; k++) positions.push(...vtx(k, 0), ...vtx(k, H));
  const indices: number[] = [];
  for (let k = 0; k < 17; k++) {
    const b0 = 2 * k, b1 = 2 * k + 1, a0 = 2 * (k + 1), a1 = 2 * (k + 1) + 1;
    indices.push(a0, b0, b1, a0, b1, a1);
  }
  return { id: '벽', positions: new Float32Array(positions), indices: new Uint32Array(indices), color: [0.86, 0.74, 0.55, 1] };
}
/** 앱(NC 열린 후보 길과 같은 셈): 직선과 원기둥의 교차 가운데 벽 높이·호 각 범위 안이고 힌트(point)에 가까운 근 */
function cylinderApp(): { refine: (c: SnapRefineFaceInput) => V3 | null; calls: SnapRefineFaceInput[] } {
  const calls: SnapRefineFaceInput[] = [];
  return {
    calls,
    refine: (c) => {
      calls.push(c);
      if (c.kind !== 'axisFace') return null;
      const o = c.line.origin, d = c.line.dir;
      const ou = o[0] - CU, ov = o[1] - CV;
      const A = d[0] * d[0] + d[1] * d[1];
      if (!(A > 1e-12)) return null;
      const B = ou * d[0] + ov * d[1], C = ou * ou + ov * ov - R * R;
      const disc = B * B - A * C;
      if (disc < 0) return null;
      let best: V3 | null = null;
      for (const s of [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A]) {
        const q: V3 = [o[0] + d[0] * s, o[1] + d[1] * s, o[2] + d[2] * s];
        const a = Math.atan2(q[1] - CV, q[0] - CU);
        if (q[2] < 0 || q[2] > H || a < 37 * D || a > 121 * D) continue;
        const dist = (p: readonly number[]): number => Math.hypot(p[0]! - c.point[0], p[1]! - c.point[1], p[2]! - c.point[2]);
        if (!best || dist(q) < dist(best)) best = q;
      }
      return best;
    },
  };
}

// ───────────── 순수 함수 ─────────────
describe('openFaceCandidates·openFaceSnap: 한 삼각형 위 곡면 조각을 두 번 지나는 선의 둘째 힌트(0.24.0)', () => {
  const view = dirToAngles([0, 1, 0.05]);
  const cam: CameraState = { ...defaultCamera(), yaw: view.yaw, pitch: view.pitch, target: [199.6, YL, 9], distance: 3.6, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [200, 300, 9], radius: 120 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  type Tri = TrackTriangle & { strip: number; upper: boolean };
  const tris: Tri[] = wallTriangles().map((t) => {
    const c = [0, 1, 2].map((i) => (t.corners[0]![i]! + t.corners[1]![i]! + t.corners[2]![i]!) / 3);
    return { corners: t.corners, wpp: worldPerPixel(f, viewDepth(f, c)), strip: t.strip, upper: t.upper };
  });
  const SNAP = 10;
  const line = (z: number) => [{ from: [100, YL, z] as V3, dir: [1, 0, 0] as V3 }];
  const isApex = (c: OpenFaceCandidate<Tri>, upper: boolean): boolean => c.tri.strip === APEX && c.tri.upper === upper;

  it('전제: 1화소가 0.01보다 작고, 두 근은 꼭대기 토막 범위에서 붙잡기 거리의 두 배보다 멀리 떨어진다', () => {
    const [L, Rt] = roots(YL, 9);
    expect(tris[2 * APEX]!.wpp).toBeLessThan(0.01);
    const [lx, ly] = at(L), [rx, ry] = at(Rt);
    expect(Math.hypot(lx - rx, ly - ry)).toBeGreaterThan(2 * SNAP);
    for (const q of [L, Rt]) {
      const a = Math.atan2(q[1] - CV, q[0] - CU);
      expect(a).toBeGreaterThan(ang(APEX));
      expect(a).toBeLessThan(ang(APEX + 1));
    }
  });

  it('높이 9: 왼쪽 근 둘레를 가리키면 꼭대기 토막 왼쪽 위 삼각형에 둘째 힌트 둘(그 조각의 두 끝 — 왼쪽 세로 변·대각선)을 더한다', () => {
    const [L] = roots(YL, 9);
    const [x, y] = at(L);
    const cs = openFaceCandidates(f, line(9), tris, x + 1, y + 2, SNAP).filter((c) => isApex(c, true));
    expect(cs.length).toBe(3);
    expect(cs.every((c) => c.twice)).toBe(true);
    const base = cs.find((c) => !c.twin)!;
    // 0.22.0 힌트는 그대로(무게중심 쪽 — x ≈ 200.26)
    expect(base.p[0]).toBeCloseTo((2 * vtx(APEX + 1, 0)[0] + vtx(APEX, 0)[0]) / 3, 9);
    const twins = cs.filter((c) => c.twin).map((c) => c.p[0]).sort((a, b) => a - b);
    expect(twins).toHaveLength(2);
    // 왼쪽 세로 변(x = 198.819 — 1화소만큼 바깥으로 민 경계) 둘레와 대각선(높이 9 — 현 가운데) 둘레
    expect(Math.abs(twins[0]! - vtx(APEX + 1, 0)[0])).toBeLessThan(0.05);
    expect(Math.abs(twins[1]! - (vtx(APEX + 1, 0)[0] + vtx(APEX, 0)[0]) / 2)).toBeLessThan(0.05);
    // 모두 선 위(y·z 그대로)
    for (const c of cs) expect([c.p[1], c.p[2]]).toEqual([YL, 9]);
  });

  it('높이 9: 앱이 힌트 둘레 근 하나를 주면 왼쪽 근을 받는다(둘째 힌트 없이는 오른쪽 근만 와서 커서에서 멀어 버린다)', () => {
    const [L, Rt] = roots(YL, 9);
    const [x, y] = at(L);
    const app = cylinderApp();
    const r = openFaceSnap(f, line(9), tris, x + 1, y + 2, SNAP, (c) => app.refine({ kind: 'axisFace', point: c.p, face: { id: '벽', index: 0, normal: [0, 1, 0] }, line: { origin: line(9)[0]!.from, dir: [1, 0, 0] }, first: null, ray: { origin: [0, 0, 0], dir: [0, 0, 1] }, open: true }))!;
    expect(r).not.toBeNull();
    expect(r.tri.strip).toBe(APEX);
    expect(Math.abs(r.p[0] - L[0])).toBeLessThan(1e-9);
    // 둘째 힌트를 빼면(0.23.0) 오른쪽 근이 와서 버린다
    const old = openFaceSnap(f, line(9), tris, x + 1, y + 2, SNAP, (c) => (c.twin ? null : app.refine({ kind: 'axisFace', point: c.p, face: { id: '벽', index: 0, normal: [0, 1, 0] }, line: { origin: line(9)[0]!.from, dir: [1, 0, 0] }, first: null, ray: { origin: [0, 0, 0], dir: [0, 0, 1] }, open: true })));
    expect(old === null || Math.abs(old.p[0] - L[0]) > 1e-3).toBe(true);
    // 오른쪽 근 둘레는 0.22.0 힌트로 그대로 받는다
    const [rx, ry] = at(Rt);
    const rr = openFaceSnap(f, line(9), tris, rx + 1, ry + 2, SNAP, (c) => app.refine({ kind: 'axisFace', point: c.p, face: { id: '벽', index: 0, normal: [0, 1, 0] }, line: { origin: line(9)[0]!.from, dir: [1, 0, 0] }, first: null, ray: { origin: [0, 0, 0], dir: [0, 0, 1] }, open: true }))!;
    expect(Math.abs(rr.p[0] - Rt[0])).toBeLessThan(1e-9);
  });

  it('높이 3: 오른쪽 근 둘레의 꼭대기 토막 오른쪽 아래 삼각형(근 하나 — 접하는 방향이 그 삼각형 밖)에는 둘째 힌트를 두지 않는다', () => {
    const [, Rt] = roots(YL, 3);
    const [x, y] = at(Rt);
    const cs = openFaceCandidates(f, line(3), tris, x + 1, y + 2, SNAP).filter((c) => isApex(c, false));
    expect(cs.length).toBe(1);
    expect(cs[0]).not.toHaveProperty('twice');
    expect(cs[0]).not.toHaveProperty('twin');
  });

  it('구의 적도를 스치는 Z축: 위·아래 칸 후보 모두 둘째 힌트가 없다(두 근이 두 칸에 나뉜다)', () => {
    const SR = 35;
    const sph = sphereMesh('구', [0, 0, 0], SR, 48, 24, [0.8, 0.5, 0.3, 1]);
    const lon = 3.75 * D, rho = 0.999 * SR;
    const P: V3 = [rho * Math.cos(lon), rho * Math.sin(lon), 20];
    const zr = Math.sqrt(SR * SR - rho * rho);
    const sv = dirToAngles([1, 0.07, 0.02]);
    const g = computeFrame({ ...defaultCamera(), yaw: sv.yaw, pitch: sv.pitch, target: [P[0], P[1], 0], distance: 12, projection: 'perspective' }, 600, 400, { center: [0, 0, 0], radius: 60 });
    const pos = sph.positions, idx = sph.indices!;
    const st: TrackTriangle[] = [];
    for (let i = 0; i < idx.length; i += 3) {
      const corners = [0, 1, 2].map((k): V3 => [pos[idx[i + k]! * 3]!, pos[idx[i + k]! * 3 + 1]!, pos[idx[i + k]! * 3 + 2]!]);
      const c: V3 = [(corners[0]![0] + corners[1]![0] + corners[2]![0]) / 3, (corners[0]![1] + corners[1]![1] + corners[2]![1]) / 3, (corners[0]![2] + corners[1]![2] + corners[2]![2]) / 3];
      if (Math.hypot(c[0] - P[0], c[1] - P[1], c[2]) > 12) continue;
      st.push({ corners, wpp: worldPerPixel(g, viewDepth(g, c)) });
    }
    for (const z of [zr, -zr]) {
      const s = projectToScreen(g, [P[0], P[1], z])!;
      const cs = openFaceCandidates(g, [{ from: P, dir: [0, 0, 1] }], st, s[0] + 1, s[1] + 2, SNAP);
      expect(cs.length).toBeGreaterThan(0);
      expect(cs.some((c) => c.twice || c.twin)).toBe(false);
    }
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

const ptrEvent = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as { fire: (t: string, e: object) => void }).fire(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: type === 'pointermove' ? -1 : 0,
    buttons,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  });
const hoverXY = (v: Viewer3d, x: number, y: number): void => {
  ptrEvent(v, 'pointermove', x, y, 0);
  v.renderNow();
};
const clickXY = (v: Viewer3d, x: number, y: number): void => {
  hoverXY(v, x, y);
  ptrEvent(v, 'pointerdown', x, y, 1);
  ptrEvent(v, 'pointerup', x, y, 0);
  v.renderNow();
};

describe("Viewer3d: 볼록 호 꼭대기를 얕게 스치는 X축의 두 근(0.24.0 — refineFace 'axisFace', open의 둘째 힌트)", () => {
  const sc: Scene3d = { name: 'w', units: 'mm', meshes: [wallMesh()], lines: [], points: [] };
  const F: V3 = [100, YL, 9];
  function make(): { v: Viewer3d; app: ReturnType<typeof cylinderApp> } {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    v.setScene(sc);
    v.setMeasureMode(true);
    const app = cylinderApp();
    v.setMeasureSnap({ points: [{ point: F, kind: 'point' }], inference: { axes: true, axisFaces: true }, refineFace: app.refine });
    const view = dirToAngles([0, 1, 0.05]);
    // 첫 점 둘레에서 찍고 꼭대기 둘레로 다가간다(1화소 ≈ 0.006)
    v.setCamera({ ...v.getCamera(), yaw: view.yaw, pitch: view.pitch, target: F, distance: 60, projection: 'perspective' });
    v.renderNow();
    const s = v.project(F)!;
    clickXY(v, s.x + 1, s.y);
    expect(v.measurePoints[0]!.point).toEqual(F);
    v.setCamera({ ...v.getCamera(), target: [199.6, YL, 9], distance: 5 });
    v.renderNow();
    return { v, app };
  }

  it('왼쪽 근 둘레를 가리키면 원기둥 위 왼쪽 근(둘째 힌트), 오른쪽 근 둘레는 오른쪽 근(0.22.0 힌트)', () => {
    const [L, Rt] = roots(YL, 9);
    const { v, app } = make();
    const sl = v.project(L)!;
    hoverXY(v, sl.x + 1, sl.y + 2);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'axis', axis: 'x', refined: true, face: { id: '벽' } });
    expect(Math.abs(h.point[0] - L[0])).toBeLessThan(1e-9);
    expect([h.point[1], h.point[2]]).toEqual([YL, 9]);
    // 앱이 받은 열린 후보 가운데 왼쪽 세로 변 둘레 힌트(둘째 힌트)가 있다
    expect(app.calls.some((c) => c.open && Math.abs(c.point[0] - vtx(APEX + 1, 0)[0]) < 0.05)).toBe(true);
    const sr = v.project(Rt)!;
    hoverXY(v, sr.x + 1, sr.y + 2);
    const g = v.measureHoverSnap!;
    expect(g).toMatchObject({ snap: 'axis', axis: 'x', refined: true });
    expect(Math.abs(g.point[0] - Rt[0])).toBeLessThan(1e-9);
    // 두 점째로 찍은 거리
    clickXY(v, sl.x + 1, sl.y + 2);
    expect(Math.abs(v.measurement()!.distance - (L[0] - 100))).toBeLessThan(1e-9);
    v.dispose();
  });
});
