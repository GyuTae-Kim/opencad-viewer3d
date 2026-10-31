/**
 * 0.36.0 칸을 얕게 뚫는 선의 면의 열린 교차(track.ts openFaceCandidates — NC 37차 요청):
 * 중간 거리(판재 구멍 안 원근 거리 3·4 등)에서 안내 선·축이 원기둥 벽 칸을 뚫고 지나 커서 쪽 활꼴이 붙잡기 거리의 세계 길이보다 얇으면
 * 0.34.0 pierced 셋째 조건에 걸려 면 위 만나는 점이 붙지 않았다(뚫는 자리는 커서에서 붙잡기 거리 밖이라 코어 교차도 맡지 못한다).
 * 이제 셋째 조건을 빼고(보통 거리에서도 — 기본 동작이 바뀐다), 뚫는 삼각형의 힌트를 뚫는 자리로 둔다(선을 따라 긴 칸이면 무게중심 쪽 자리가 다른 근에 가깝다).
 * - 순수: openFaceCandidates(거리 3에서 셋째 조건에 걸리던 자리, 누운 구멍 옆면 칸을 따라가는 안내 선의 힌트)
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 세운 구멍 거리 1~8·누운 구멍 거리 1~4의 M± 둘레가 원기둥 위 다듬은 교차(그 안내 선 위)에 붙고,
 *   보통 거리(옆 15·위 30) 화면 격자에서 refineFace 없는 뷰어와 다른 자리는 모두 그 안내 선 위·원기둥 위 다듬은 교차,
 *   open일 때와 아닐 때 다른 답을 주는 앱이면 뚫는 칸의 열린 후보와 코어 'axisFace'(같은 점·면·선)를 어느 차례로 물어도 각자 제 답(openRefineKey의 '#open')
 * 장면은 tests/v0340hole.test.ts와 같다: 판 400 × 300 × 18(반투명 0.35), 세운 구멍 (150, 150) 반지름 5 z 6~18(20토막), 누운 구멍 (0, 220, 9) X 방향 반지름 4
 * 길이 30(16토막), 판 윗면의 기운 기준 선분(27°). 앱 refineFace = 그 직선과 원기둥 벽(범위 안)의 교차 가운데 point에 가까운 근.
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, screenRay, viewDepth, worldPerPixel } from '../src/camera';
import { openFaceCandidates, rayHitsTriangle } from '../src/track';
import { rayLinePoint } from '../src/inference';
import { boxMesh } from '../src/synth';
import { type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import { type SnapRefineFaceInput, openRefineKey } from '../src/snap';
import type { V3 } from '../src/math';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';

const D = Math.PI / 180;
const DEG = 27;
const DIR: V3 = [Math.cos(DEG * D), Math.sin(DEG * D), 0];
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

/** 원기둥 벽: 축 성분 a2, 단면 성분 a0·a1과 중심 (cu, cv), 반지름 r, 축 범위 lo~hi */
interface Wall {
  id: string;
  a0: number;
  a1: number;
  a2: number;
  cu: number;
  cv: number;
  r: number;
  lo: number;
  hi: number;
}
const VERT: Wall = { id: '세운 구멍', a0: 0, a1: 1, a2: 2, cu: 150, cv: 150, r: 5, lo: 6, hi: 18 };
const HOR: Wall = { id: '누운 구멍', a0: 1, a1: 2, a2: 0, cu: 220, cv: 9, r: 4, lo: 0, hi: 30 };

/** 원기둥 고체: 시작 중심 a에서 방향 d(단위)로 len, 반지름 r, 둘레 seg(옆면 칸마다 두 삼각형, 두 뚜껑 부채꼴, 두 테두리 윤곽선) */
function cylinder(id: string, a: readonly number[], d: readonly number[], len: number, r: number, seg: number): Mesh3d {
  const t = Math.abs(d[2]!) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e1: number[] = cross(d, t);
  const l1 = Math.hypot(e1[0]!, e1[1]!, e1[2]!);
  e1 = e1.map((x) => x / l1);
  const e2 = cross(d, e1);
  const b = [a[0]! + d[0]! * len, a[1]! + d[1]! * len, a[2]! + d[2]! * len];
  const ring = (c: readonly number[], k: number): number[] => {
    const th = (k / seg) * Math.PI * 2;
    return [0, 1, 2].map((i) => c[i]! + r * (Math.cos(th) * e1[i]! + Math.sin(th) * e2[i]!));
  };
  const P: number[] = [], I: number[] = [], E: number[] = [];
  for (let k = 0; k <= seg; k++) P.push(...ring(a, k), ...ring(b, k));
  for (let k = 0; k < seg; k++) I.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
  for (const [c, sgn] of [
    [a, -1],
    [b, 1],
  ] as const) {
    const cb = P.length / 3;
    P.push(...c);
    for (let k = 0; k < seg; k++) P.push(...ring(c, k));
    for (let k = 0; k < seg; k++) {
      const i1 = cb + 1 + k, i2 = cb + 1 + ((k + 1) % seg);
      if (sgn > 0) I.push(cb, i1, i2);
      else I.push(cb, i2, i1);
    }
    for (let k = 0; k < seg; k++) E.push(...ring(c, k), ...ring(c, k + 1));
  }
  return { id, name: id, positions: new Float32Array(P), indices: new Uint32Array(I), edges: new Float32Array(E), color: [0.8, 0.35, 0.2, 1], closed: true };
}
const OFF = [-Math.sin(DEG * D) * 4, Math.cos(DEG * D) * 4];
const G0 = [250 + OFF[0]!, 50 + OFF[1]!, 18];
const G1 = [250 + 100 * DIR[0] + OFF[0]!, 50 + 100 * DIR[1] + OFF[1]!, 18];
/** 기준 선분 위 한 자리(가운데에서 조금 비킨 — 커서가 지나가 기준으로 삼는다) */
const MID = [(G0[0]! + G1[0]!) / 2 + 0.013, (G0[1]! + G1[1]!) / 2 + 0.011, 18];
const VMESH = cylinder(VERT.id, [150, 150, 18], [0, 0, -1], 12, 5, 20);
const HMESH = cylinder(HOR.id, [0, 220, 9], [1, 0, 0], 30, 4, 16);
const SCENE: Scene3d = {
  name: 'holes',
  units: 'mm',
  meshes: [boxMesh('판', [0, 0, 0], [400, 300, 18], [0.86, 0.74, 0.55, 0.35]), VMESH, HMESH],
  lines: [{ id: '기준', name: '기준', positions: new Float32Array([...G0, ...G1]), color: [0.2, 0.6, 0.9, 1] } as LineSet3d],
  points: [],
};

/** 직선(o, d)을 벽 단면에 비춘 원과의 교차 가운데 near에 가까운 근(축 방향은 직선을 따라). 축과 나란하면 null */
function wallRoot(w: Wall, o: readonly number[], d: readonly number[], near: readonly number[]): V3 | null {
  const ou = o[w.a0]! - w.cu, ov = o[w.a1]! - w.cv, du = d[w.a0]!, dv = d[w.a1]!;
  const A = du * du + dv * dv;
  if (!(A > 1e-12)) return null;
  const B = ou * du + ov * dv, C = ou * ou + ov * ov - w.r * w.r;
  const disc = B * B - A * C;
  if (disc < 0) return null;
  const qs = [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A].map((s): V3 => [o[0]! + d[0]! * s, o[1]! + d[1]! * s, o[2]! + d[2]! * s]);
  return dist(qs[0]!, near) <= dist(qs[1]!, near) ? qs[0]! : qs[1]!;
}
/** 앱 refineFace: 구멍 옆면 삼각형이면 그 직선과 원기둥(벽 범위 안)의 교차 가운데 point에 가까운 근 */
const wallRefine = (calls: SnapRefineFaceInput[] = []) => (c: SnapRefineFaceInput): V3 | null => {
  calls.push(c);
  const w = c.kind === 'axisFace' || c.kind === 'onFace' ? [VERT, HOR].find((x) => x.id === c.face.id) : undefined;
  if (!w || Math.abs(c.face.normal[w.a2]) > 1e-3) return null;
  const q = wallRoot(w, c.line.origin, c.line.dir, c.point);
  return q && q[w.a2] >= w.lo - 1e-9 && q[w.a2] <= w.hi + 1e-9 ? q : null;
};
const onWall = (w: Wall, p: readonly number[]): boolean => Math.abs(Math.hypot(p[w.a0]! - w.cu, p[w.a1]! - w.cv) - w.r) < 1e-9 && p[w.a2]! >= w.lo && p[w.a2]! <= w.hi;
/** 붙은 점이 그 안내 선(끌어온 점을 지나 기준 선분과 나란함 — 기준은 장면 float32 끝점) 위인지 */
const offGuide = (h: { point: readonly number[]; trackFrom?: readonly number[]; edge?: readonly (readonly number[])[] }): number => {
  const [a, b] = h.edge!;
  const g = sub(b!, a!);
  const l = Math.hypot(g[0], g[1], g[2]);
  const e = [g[0] / l, g[1] / l, g[2] / l];
  const w = sub(h.point, h.trackFrom!);
  const s = dot(w, e);
  return Math.hypot(w[0] - e[0]! * s, w[1] - e[1]! * s, w[2] - e[2]! * s);
};

/** 세운 구멍의 안내 선 자리: 구멍 중심에서 각 a 쪽으로 r − δ 떨어진 점 P0을 지나 기준과 나란한 선, 끌어온 점 T(구멍 밖), 두 교차 M±(sgn) */
function vertCase(a: number, z: number, delta: number, sgn: number): { T: V3; M: V3 } {
  const n = [Math.cos(a * D), Math.sin(a * D)];
  const P0: V3 = [VERT.cu + (VERT.r - delta) * n[0]!, VERT.cv + (VERT.r - delta) * n[1]!, z];
  const tt = Math.sqrt(VERT.r ** 2 - (VERT.r - delta) ** 2);
  return { T: [P0[0] - 20 * DIR[0], P0[1] - 20 * DIR[1], z], M: [P0[0] + sgn * tt * DIR[0], P0[1] + sgn * tt * DIR[1], z] };
}
/** 누운 구멍 꼭대기 아래 δ를 지나는 안내 선(x 15·y 220 자리를 지나 기준과 나란함): 끌어온 점 T, 두 교차 M±(sgn) */
function horCase(delta: number, sgn: number): { T: V3; M: V3 } {
  const z = HOR.cv + HOR.r - delta;
  const k = Math.sqrt(HOR.r ** 2 - (z - HOR.cv) ** 2) / DIR[1];
  return { T: [15 - 20 * DIR[0], 220 - 20 * DIR[1], z], M: [15 + sgn * k * DIR[0], 220 + sgn * k * DIR[1], z] };
}
/** 구멍 안에서 벽 점 M을 보는 방향: 단면에서 축 쪽 + 입구 쪽 0.3(세운 구멍은 위, 누운 구멍은 x 0 쪽) */
function inward(w: Wall, M: readonly number[]): V3 {
  const l: V3 = [0, 0, 0];
  l[w.a0] = -(M[w.a0]! - w.cu) / w.r;
  l[w.a1] = -(M[w.a1]! - w.cv) / w.r;
  l[w.a2] = w === VERT ? 0.3 : -0.3;
  return l;
}
function camAt(target: readonly number[], look: readonly number[], distance: number): CameraState {
  const a = dirToAngles(look);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [target[0]!, target[1]!, target[2]!], distance, projection: 'perspective' };
}
const SPHERE = { center: [200, 150, 9] as V3, radius: 260 };
/** 원기둥 그물 mesh의 옆면 삼각형 i */
const triOf = (mesh: Mesh3d, i: number): V3[] =>
  [0, 1, 2].map((k) => {
    const j = mesh.indices![i * 3 + k]! * 3;
    return [mesh.positions[j]!, mesh.positions[j + 1]!, mesh.positions[j + 2]!] as V3;
  });
/** 커서 광선이 맞는 옆면 삼각형 번호 */
function triUnder(mesh: Mesh3d, sides: number, f: ReturnType<typeof computeFrame>, x: number, y: number): number[] {
  const ray = screenRay(f, x, y);
  const out: number[] = [];
  for (let i = 0; i < sides; i++) if (rayHitsTriangle(ray, triOf(mesh, i))) out.push(i);
  return out;
}
/** 선(P + s·e)이 삼각형 c 평면을 뚫는 자리 */
function pierceAt(P: readonly number[], e: readonly number[], c: readonly V3[]): V3 {
  const n = cross(sub(c[1]!, c[0]!), sub(c[2]!, c[0]!));
  const s = dot(n, sub(c[0]!, P)) / dot(n, e);
  return [P[0]! + e[0]! * s, P[1]! + e[1]! * s, P[2]! + e[2]! * s];
}
/** 점 p와 삼각형 c 평면 사이 거리 */
function planeGap(p: readonly number[], c: readonly V3[]): number {
  const n = cross(sub(c[1]!, c[0]!), sub(c[2]!, c[0]!));
  return Math.abs(dot(n, sub(p, c[0]!))) / Math.hypot(n[0], n[1], n[2]);
}

describe('openFaceCandidates(0.36.0 — 칸을 얕게 뚫는 선)', () => {
  it('세운 구멍 δ 0.1 거리 3: 뚫는 자리가 커서에서 붙잡기 거리 밖이고 커서 쪽 활꼴이 붙잡기 거리의 세계 길이보다 얇아도(0.34.0 셋째 조건에 걸리던 자리) 후보 — 코어 점은 뚫는 자리', () => {
    const { T, M } = vertCase(DEG + 270, 12, 0.1, 1);
    const am = Math.atan2(M[1] - VERT.cv, M[0] - VERT.cu);
    const f = computeFrame(camAt(M, inside(am), 3), 800, 600, SPHERE);
    const s = projectToScreen(f, M)!;
    const x = s[0] + 0.31, y = s[1] + 0.17;
    const under = triUnder(VMESH, 40, f, x, y);
    expect(under.length).toBe(1);
    const tri = triOf(VMESH, under[0]!);
    const wpp = worldPerPixel(f, viewDepth(f, M));
    const X = pierceAt(T, DIR, tri);
    // 전제: 선이 그 칸을 뚫는 자리는 화면에서 커서 붙잡기 거리 밖, 커서 쪽 선 위 점은 그 칸 평면에서 붙잡기 거리의 세계 길이 안(0.35.0이면 빠진다)
    const sx = projectToScreen(f, X)!;
    expect(Math.hypot(sx[0] - x, sx[1] - y)).toBeGreaterThan(10);
    const ray = screenRay(f, x, y);
    const near = rayLinePoint(ray.origin, ray.dir, T, DIR)!;
    expect(planeGap(near, tri)).toBeLessThan(10 * wpp);
    const cands = openFaceCandidates(f, [{ from: T, dir: DIR }], [{ corners: tri, wpp }], x, y, 10);
    expect(cands.length).toBe(1);
    expect(cands[0]!.gap).toBe(0);
    expect(dist(cands[0]!.p, X)).toBeLessThan(1e-9);
    // 앱이 그 힌트 둘레에서 줄 근은 M(커서 아래 곡면 위 교차)
    expect(dist(wallRoot(VERT, T, DIR, cands[0]!.p)!, M)).toBeLessThan(1e-4);
  });

  it('누운 구멍 옆면 칸을 따라가는 안내 선(δ 0.24): 뚫는 삼각형의 힌트는 뚫는 자리라 그 칸 위 근에 가깝다 — 무게중심 쪽 자리는 다른 근에 더 가깝다', () => {
    const { T, M } = horCase(0.24, 1);
    const f = computeFrame(camAt(M, inward(HOR, M), 3), 800, 600, SPHERE);
    const s = projectToScreen(f, M)!;
    const x = s[0] + 0.31, y = s[1] + 0.17;
    const under = triUnder(HMESH, 32, f, x, y);
    expect(under.length).toBe(1);
    const tri = triOf(HMESH, under[0]!);
    const wpp = worldPerPixel(f, viewDepth(f, M));
    const cands = openFaceCandidates(f, [{ from: T, dir: DIR }], [{ corners: tri, wpp }], x, y, 10);
    expect(cands.length).toBe(1);
    expect(cands[0]!.gap).toBe(0);
    expect(dist(cands[0]!.p, pierceAt(T, DIR, tri))).toBeLessThan(1e-9);
    expect(dist(wallRoot(HOR, T, DIR, cands[0]!.p)!, M)).toBeLessThan(1e-4);
    // 0.35.0의 힌트(선 위에서 무게중심에 가장 가까운 점)로 물으면 다른 근(M−)이 온다
    const g = [(tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3, (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3, (tri[0]![2] + tri[1]![2] + tri[2]![2]) / 3];
    const foot = [T[0] + DIR[0] * dot(sub(g, T), DIR), T[1] + DIR[1] * dot(sub(g, T), DIR), T[2] + DIR[2] * dot(sub(g, T), DIR)];
    expect(dist(wallRoot(HOR, T, DIR, foot)!, horCase(0.24, -1).M)).toBeLessThan(1e-4);
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
const edgeOk = (_s: unknown, item: { id: string }): boolean => item.id === '기준';
function snapOptions(refineFace: MeasureSnapOptions['refineFace']): MeasureSnapOptions {
  return {
    points: [
      { point: [150, 150, 18], kind: 'center' },
      { point: [150, 150, 6], kind: 'center' },
    ],
    edges: true,
    inference: {
      intersections: true,
      perpendicular: true,
      axes: true,
      parallel: true,
      lock: true,
      track: true,
      axisEdges: true,
      axisFaces: true,
      lockEdges: true,
      lockFaces: true,
      lockTracks: true,
      parallelEdge: edgeOk,
      trackDirs: { edge: edgeOk, meets: { guides: true, open: true, openFaces: true } },
    },
    refine: () => null,
    refineFace,
    throughTranslucent: true,
  };
}
const ptr = (w: View, x: number, y: number): void => {
  w.canvas.fire('pointermove', { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
  w.v.renderNow();
};
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
/** 끌어온 점 T, 기준 선분을 지나가 안내 선을 켠 뒤 target을 look 쪽 거리 d에서 보는 뷰어 */
function view(refineFace: MeasureSnapOptions['refineFace'], T: readonly number[], target: readonly number[], look: readonly number[], d: number): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  const w: View = { v, canvas: v.canvas as unknown as FakeElement };
  v.setScene(SCENE);
  v.setView('seIso', false);
  v.fit(false);
  v.setMeasureMode(true);
  v.setMeasureSnap(snapOptions(refineFace));
  v.renderNow();
  expect(v.setMeasureTrackPoints([T])).toBe(1);
  const s = at(w, MID);
  ptr(w, s.x + 0.3, s.y + 0.2);
  v.setCamera(camAt(target, look, d));
  v.renderNow();
  return w;
}
const inside = (am: number): V3 => [-Math.cos(am), -Math.sin(am), 0.3];

describe('Viewer3d: 칸을 얕게 뚫는 안내 선의 면 위 만나는 점(0.36.0)', () => {
  it('세운 구멍 거리 1·2·3·4·8(δ 0.03·0.1·0.3): M± 둘레를 가리키면 원기둥 위 다듬은 교차(그 안내 선 위)에 붙는다', () => {
    for (const delta of [0.03, 0.1, 0.3])
      for (const d of [1, 2, 3, 4, 8])
        for (const sgn of [-1, 1]) {
          const { T, M } = vertCase(DEG + 270, 12, delta, sgn);
          const am = Math.atan2(M[1] - VERT.cv, M[0] - VERT.cu);
          const w = view(wallRefine(), T, M, inside(am), d);
          const s = at(w, M);
          ptr(w, s.x + 1.3, s.y + 2.1);
          const h = w.v.measureHoverSnap!;
          const k = `${delta} d${d} ${sgn}`;
          expect(h, k).toMatchObject({ snap: 'parallel', refined: true, face: { id: VERT.id } });
          expect(h.trackFrom, k).toEqual(T);
          expect(h.segment, k).toBeUndefined();
          expect(onWall(VERT, h.point), k).toBe(true);
          expect(offGuide(h), k).toBeLessThan(1e-9);
          expect(dist(h.point, M), k).toBeLessThan(1e-4);
          w.v.dispose();
        }
  });

  it('누운 구멍 옆면 칸을 따라가는 안내 선(δ 0.24) 거리 1·2·3·4: M± 둘레가 원기둥 위 교차에 붙는다(뚫는 자리 힌트)', () => {
    for (const d of [1, 2, 3, 4])
      for (const sgn of [-1, 1]) {
        const { T, M } = horCase(0.24, sgn);
        const calls: SnapRefineFaceInput[] = [];
        const w = view(wallRefine(calls), T, M, inward(HOR, M), d);
        const s = at(w, M);
        ptr(w, s.x + 1.3, s.y + 2.1);
        const h = w.v.measureHoverSnap!;
        const k = `d${d} ${sgn}`;
        expect(h, k).toMatchObject({ snap: 'parallel', refined: true, face: { id: HOR.id } });
        expect(onWall(HOR, h.point), k).toBe(true);
        expect(offGuide(h), k).toBeLessThan(1e-9);
        expect(dist(h.point, M), k).toBeLessThan(1e-4);
        w.v.dispose();
      }
  });

  it('보통 거리(옆 15·위 30) M± 둘레 화면 격자(13 × 13, 1.53화소 칸): 다듬은 면 점은 모두 원기둥 위(안내 선 위 자리면 그 안내 선 위)이고, refineFace 없는 뷰어의 안내 선 위 커서 자리가 면 위 만나는 점으로 바뀐다', () => {
    for (const [look, d] of [
      [[0.3, -1, 0.5], 15],
      [[0.2, -0.3, 1], 30],
    ] as const)
      for (const delta of [0.1, 0.3])
        for (const sgn of [-1, 1]) {
          const { T, M } = vertCase(DEG + 270, 12, delta, sgn);
          const on = view(wallRefine(), T, [150, 150, 12], look, d);
          const off = view(() => null, T, [150, 150, 12], look, d);
          const c = at(on, M);
          let meets = 0;
          for (let iy = -6; iy <= 6; iy++)
            for (let ix = -6; ix <= 6; ix++) {
              const x = c.x + ix * 1.53 + 0.211, y = c.y + iy * 1.53 - 0.173;
              ptr(on, x, y);
              ptr(off, x, y);
              const p = on.v.measureHoverSnap, q = off.v.measureHoverSnap;
              const k = `${look} ${delta} ${sgn} ${ix},${iy}`;
              if (!p?.refined || !p.face) continue;
              expect(p.face.id, k).toBe(VERT.id);
              expect(onWall(VERT, p.point), k).toBe(true);
              if (p.snap !== 'parallel') continue;
              expect(offGuide(p), k).toBeLessThan(1e-9);
              expect(dist(p.point, M), k).toBeLessThan(1e-4);
              if (q?.snap === 'parallel' && !q.face) meets++;
            }
          expect(meets, `${look} ${delta} ${sgn}`).toBeGreaterThan(8);
          on.v.dispose();
          off.v.dispose();
        }
  });

  it("open일 때와 아닐 때 다른 답을 주는 앱(닫힌 'axisFace'는 코어 점 그대로, 열린 후보는 원기둥 위 근): 같은 점·면·선을 어느 차례로 물어도 각자 제 답을 쓴다", () => {
    // 세운 구멍 δ 0.1 거리 3: 뚫는 칸의 열린 후보 힌트(뚫는 자리)가 코어 'axisFace'(커서가 뚫는 자리 둘레일 때)의 점과 같다
    const { T, M } = vertCase(DEG + 270, 12, 0.1, 1);
    const am = Math.atan2(M[1] - VERT.cv, M[0] - VERT.cu);
    const f = computeFrame(camAt(M, inside(am), 3), 800, 600, SPHERE);
    const sm = projectToScreen(f, M)!;
    const under = triUnder(VMESH, 40, f, sm[0] + 1.3, sm[1] + 2.1);
    expect(under.length).toBe(1);
    const X = pierceAt(T, DIR, triOf(VMESH, under[0]!));
    const twoWay = (calls: SnapRefineFaceInput[]) => (c: SnapRefineFaceInput): V3 | null => {
      calls.push(c);
      if (c.kind !== 'axisFace' || c.face.id !== VERT.id || Math.abs(c.face.normal[2]) > 1e-3) return null;
      return c.open ? wallRoot(VERT, c.line.origin, c.line.dir, c.point) : [c.point[0], c.point[1], c.point[2]];
    };
    const wallCalls = (calls: SnapRefineFaceInput[], open: boolean): SnapRefineFaceInput[] =>
      calls.filter((c) => c.kind === 'axisFace' && c.face.id === VERT.id && !!c.open === open && dist(c.point, X) < 1e-4);
    // 뚫는 자리 둘레: 코어 'axisFace'(닫힌 물음)의 답 — 코어 점 그대로
    const atX = (w: View, calls: SnapRefineFaceInput[], k: string): void => {
      const s = at(w, X);
      ptr(w, s.x + 0.31, s.y + 0.17);
      const h = w.v.measureHoverSnap!;
      const closed = wallCalls(calls, false);
      expect(closed.length, k).toBe(1);
      expect(h, k).toMatchObject({ refined: true, face: { id: VERT.id } });
      expect(dist(h.point, closed[0]!.point), k).toBeLessThan(1e-12);
    };
    // 곡면 위 교차 둘레: 뚫는 칸의 열린 후보(열린 물음)의 답 — 원기둥 위 근
    const atM = (w: View, calls: SnapRefineFaceInput[], k: string): void => {
      const s = at(w, M);
      ptr(w, s.x + 1.3, s.y + 2.1);
      const h = w.v.measureHoverSnap!;
      expect(wallCalls(calls, true).length, k).toBe(1);
      expect(h, k).toMatchObject({ snap: 'parallel', refined: true, face: { id: VERT.id } });
      expect(onWall(VERT, h.point), k).toBe(true);
      expect(dist(h.point, M), k).toBeLessThan(1e-4);
    };
    for (const order of ['closed-first', 'open-first'] as const) {
      const calls: SnapRefineFaceInput[] = [];
      const w = view(twoWay(calls), T, M, inside(am), 3);
      if (order === 'closed-first') {
        atX(w, calls, `${order} X`);
        atM(w, calls, `${order} M`);
      } else {
        atM(w, calls, `${order} M`);
        atX(w, calls, `${order} X`);
      }
      // 두 물음은 open 말고 같은 입력이다(그래서 open이 열쇠에 없으면 먼저 물은 쪽 답을 다른 쪽이 썼다)
      const [c1] = wallCalls(calls, false), [c2] = wallCalls(calls, true);
      expect(c1!.point, order).toEqual(c2!.point);
      expect(c1!.face, order).toEqual(c2!.face);
      expect(c1!.line, order).toEqual(c2!.line);
      w.v.dispose();
    }
  });
});

describe('openRefineKey(0.36.0 — open)', () => {
  it("열린 후보면 열쇠 끝에 '#open'이 붙는다(닫힌 열쇠는 그대로)", () => {
    const face = { id: VERT.id, index: 3, normal: [1, 0, 0] as V3 };
    const base: SnapRefineFaceInput = { kind: 'axisFace', point: [1, 2, 3], face, line: { origin: [0, 0, 0], dir: [1, 0, 0] }, first: null, ray: { origin: [0, 0, 9], dir: [0, 0, -1] } };
    const k = openRefineKey(base);
    expect(k.endsWith('#open')).toBe(false);
    expect(openRefineKey({ ...base, open: true })).toBe(`${k}#open`);
    expect(openRefineKey({ ...base, open: false })).toBe(k);
    // 선분('axisEdge' — refine)도 같다
    const segment = { kind: 'line' as const, id: '테두리', index: 4, raw: 4, ends: [[0, 0, 0], [1, 0, 0]] as [V3, V3] };
    const edge = { kind: 'axisEdge' as const, point: [1, 2, 3] as V3, segment, first: null, line: { origin: [0, 0, 0] as V3, dir: [0, 1, 0] as V3, axis: 'y' as const } };
    const ke = openRefineKey(edge);
    expect(ke.endsWith('#open')).toBe(false);
    expect(openRefineKey({ ...edge, open: true })).toBe(`${ke}#open`);
  });
});
