/**
 * 0.34.0 구멍 안에서 아주 가까이 본 벽의 면의 열린 교차(track.ts openFaceCandidates — NC 35차 결함 보고):
 * 판재 구멍 안 원근 거리 0.5~2에서 끌어온 점 안내 선(trackDirs { meets: { guides, open, openFaces } })이 원기둥 벽 칸을 비켜 가며(활꼴) 또는 칸을 뚫고 지나
 * 원기둥을 뚫는 두 점 M± 둘레를 가리키면 0.33.0은 면 위 만나는 점이 하나도 붙지 않았다(안내 선 위 커서 자리).
 * - 활꼴: 선과 커서 아래 벽 삼각형 사이(활꼴 높이 0.03)가 붙잡기 거리의 세계 길이(거리 1에서 0.012)보다 커서 후보에서 빠졌다 — 그 틈은 거의 눈 쪽이라 화면에서는 선이 커서 아래 삼각형을 지난다
 * - 칸을 뚫음: 선이 그물을 뚫는 자리(코어 점)와 원기둥을 뚫는 자리가 선을 따라 0.09 떨어져(거리 1에서 78화소) 곡면 위 교차 둘레를 가리키면 코어 점이 커서에서 멀었다
 * 이제 커서 광선이 그 삼각형을 맞으면 붙잡기 거리의 세계 길이를 보지 않고(활꼴), 칸을 뚫는 자리가 커서에서 붙잡기 거리 밖이고 커서 쪽 활꼴이 붙잡기 거리보다 두꺼우면 열린 후보로 본다.
 * - 순수: rayHitsTriangle, openFaceCandidates(아주 가까이·보통 거리, 커서 아래·아닌 삼각형, 뚫는 칸)
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 세운 구멍·누운 구멍 M± 둘레가 원기둥 위 다듬은 교차로 붙고(그 안내 선 위), refineFace가 null이면 붙지 않는다, 화면 격자에서
 *   refineFace 없는 뷰어와 다른 자리는 모두 그 안내 선 위·원기둥 위 다듬은 교차, 보통 거리(15)에서 칸을 뚫는 자리 둘레는 0.33.0 그대로(커서 쪽 활꼴이 얇다)
 * 장면: 판 400 × 300 × 18(반투명 0.35), 세운 구멍 (150, 150) 반지름 5 z 6~18(20토막 원기둥 고체 — 옆면 칸마다 두 삼각형·두 뚜껑, 테두리 윤곽선),
 * 누운 구멍 (0, 220, 9) X 방향 반지름 4 길이 30(16토막), 판 윗면의 기운 기준 선분(27°). 앱 refineFace = 그 직선과 원기둥 벽(높이 안)의 교차 가운데 point에 가까운 근.
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, screenRay, viewDepth, worldPerPixel } from '../src/camera';
import { openFaceCandidates, rayHitsTriangle, trackDirGuides } from '../src/track';
import { boxMesh } from '../src/synth';
import { type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { SnapRefineFaceInput } from '../src/snap';
import type { V3 } from '../src/math';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';

const D = Math.PI / 180;
const DEG = 27;
const DIR: V3 = [Math.cos(DEG * D), Math.sin(DEG * D), 0];
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

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
  let e1 = [d[1]! * t[2]! - d[2]! * t[1]!, d[2]! * t[0]! - d[0]! * t[2]!, d[0]! * t[1]! - d[1]! * t[0]!];
  const l1 = Math.hypot(e1[0]!, e1[1]!, e1[2]!);
  e1 = e1.map((x) => x / l1);
  const e2 = [d[1]! * e1[2]! - d[2]! * e1[1]!, d[2]! * e1[0]! - d[0]! * e1[2]!, d[0]! * e1[1]! - d[1]! * e1[0]!];
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
const HOLE = cylinder(VERT.id, [150, 150, 18], [0, 0, -1], 12, 5, 20);
const SCENE: Scene3d = {
  name: 'holes',
  units: 'mm',
  meshes: [boxMesh('판', [0, 0, 0], [400, 300, 18], [0.86, 0.74, 0.55, 0.35]), HOLE, cylinder(HOR.id, [0, 220, 9], [1, 0, 0], 30, 4, 16)],
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
/** 점 p와 직선(o, 단위 e) 사이 거리 */
const offLine = (p: readonly number[], o: readonly number[], e: readonly number[]): number => {
  const w = [p[0]! - o[0]!, p[1]! - o[1]!, p[2]! - o[2]!];
  const s = w[0]! * e[0]! + w[1]! * e[1]! + w[2]! * e[2]!;
  return Math.hypot(w[0]! - e[0]! * s, w[1]! - e[1]! * s, w[2]! - e[2]! * s);
};
/** 붙은 점이 그 안내 선(끌어온 점을 지나 기준 선분과 나란함 — 기준은 장면 float32 끝점) 위인지 */
const offGuide = (h: { point: readonly number[]; trackFrom?: readonly number[]; edge?: readonly (readonly number[])[] }): number => {
  const [a, b] = h.edge!;
  const g = [b![0]! - a![0]!, b![1]! - a![1]!, b![2]! - a![2]!];
  const l = Math.hypot(g[0]!, g[1]!, g[2]!);
  return offLine(h.point, h.trackFrom!, [g[0]! / l, g[1]! / l, g[2]! / l]);
};

/** 세운 구멍의 안내 선 자리: 구멍 중심에서 각 a 쪽으로 r − δ 떨어진 점 P0을 지나 기준과 나란한 선, 끌어온 점 T(구멍 밖), 두 교차 M±(sgn) */
function vertCase(a: number, z: number, delta: number, sgn: number): { T: V3; M: V3; P0: V3 } {
  const n = [Math.cos(a * D), Math.sin(a * D)];
  const P0: V3 = [VERT.cu + (VERT.r - delta) * n[0]!, VERT.cv + (VERT.r - delta) * n[1]!, z];
  const tt = Math.sqrt(VERT.r ** 2 - (VERT.r - delta) ** 2);
  return { P0, T: [P0[0] - 20 * DIR[0], P0[1] - 20 * DIR[1], z], M: [P0[0] + sgn * tt * DIR[0], P0[1] + sgn * tt * DIR[1], z] };
}
/** 구멍 안에서 벽 점(각 am)을 보는 방향: 구멍 중심 쪽 수평 + 위 0.3 */
const inside = (am: number): V3 => [-Math.cos(am), -Math.sin(am), 0.3];
function camAt(target: readonly number[], look: readonly number[], distance: number): CameraState {
  const a = dirToAngles(look);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [target[0]!, target[1]!, target[2]!], distance, projection: 'perspective' };
}
const SPHERE = { center: [200, 150, 9] as V3, radius: 260 };
/** 세운 구멍 옆면 삼각형(칸 k의 두 삼각형 2k·2k + 1) */
const wallTri = (i: number): V3[] => [0, 1, 2].map((k) => {
  const j = HOLE.indices![i * 3 + k]! * 3;
  return [HOLE.positions[j]!, HOLE.positions[j + 1]!, HOLE.positions[j + 2]!] as V3;
});
/** 원기둥 위 점 M이 놓인 옆면 삼각형 번호(그 점의 각·높이에서 커서 광선이 처음 맞는 것과 같다 — 칸 범위·대각선 쪽으로 가린다) */
function triUnder(f: ReturnType<typeof computeFrame>, x: number, y: number): number[] {
  const ray = screenRay(f, x, y);
  const out: number[] = [];
  for (let i = 0; i < 40; i++) if (rayHitsTriangle(ray, wallTri(i))) out.push(i);
  return out;
}

describe('rayHitsTriangle·openFaceCandidates(0.34.0 — 커서 아래 벽 삼각형)', () => {
  it('rayHitsTriangle: 앞쪽에서 맞으면 true, 비켜 가거나 뒤쪽이면 false', () => {
    const tri: V3[] = [
      [0, 0, 0],
      [2, 0, 0],
      [0, 2, 0],
    ];
    expect(rayHitsTriangle({ origin: [0.5, 0.5, 5], dir: [0, 0, -1] }, tri)).toBe(true);
    expect(rayHitsTriangle({ origin: [1.5, 1.5, 5], dir: [0, 0, -1] }, tri)).toBe(false);
    expect(rayHitsTriangle({ origin: [0.5, 0.5, -5], dir: [0, 0, -1] }, tri)).toBe(false);
    expect(rayHitsTriangle({ origin: [0.5, 0.5, 5], dir: [1, 0, 0] }, tri)).toBe(false);
  });

  it('활꼴(δ 0.03): 거리 1이면 선과 커서 아래 삼각형 사이가 붙잡기 거리의 세계 길이보다 크지만 후보다 — 커서 아래가 아닌 같은 칸 삼각형은 0.33.0 그대로 빠진다', () => {
    const { T, M } = vertCase(DEG + 270, 12, 0.03, 1);
    const am = Math.atan2(M[1] - VERT.cv, M[0] - VERT.cu);
    const f = computeFrame(camAt(M, inside(am), 1), 800, 600, SPHERE);
    const s = projectToScreen(f, M)!;
    const x = s[0] + 0.31, y = s[1] + 0.17;
    const under = triUnder(f, x, y);
    expect(under.length).toBe(1);
    const wpp = worldPerPixel(f, viewDepth(f, M));
    const tris = [under[0]!, under[0]! ^ 1].map((i) => ({ corners: wallTri(i), wpp, index: i }));
    const cands = openFaceCandidates(f, [{ from: T, dir: DIR }], tris, x, y, 10);
    expect(cands.map((c) => c.tri.index)).toEqual([under[0]]);
    // 활꼴 높이(선과 그 칸 평면 사이)는 붙잡기 거리의 세계 길이보다 크다
    expect(cands[0]!.gap).toBeGreaterThan(10 * wpp);
    expect(cands[0]!.gap).toBeLessThan(0.07);
    // 같은 자리를 거리 8에서 보면 0.33.0 규칙(붙잡기 거리 안)으로도 후보다
    const g = computeFrame(camAt(M, inside(am), 8), 800, 600, SPHERE);
    const s8 = projectToScreen(g, M)!;
    const wpp8 = worldPerPixel(g, viewDepth(g, M));
    expect(cands[0]!.gap).toBeLessThan(10 * wpp8);
    expect(openFaceCandidates(g, [{ from: T, dir: DIR }], [{ corners: wallTri(under[0]!), wpp: wpp8 }], s8[0] + 0.31, s8[1] + 0.17, 10).length).toBe(1);
  });

  it('칸을 뚫음(δ 0.1): 뚫는 자리가 커서에서 붙잡기 거리 밖이고 커서 쪽 활꼴이 두꺼우면(거리 1 — 뚫는 자리가 78화소쯤) 후보, 거리 8이면 뚫는 자리가 붙잡기 거리 안이라 0.33.0 그대로 없다(면의 만나는 점이 맡는다)', () => {
    const { T, M } = vertCase(DEG + 270, 12, 0.1, 1);
    const am = Math.atan2(M[1] - VERT.cv, M[0] - VERT.cu);
    for (const [d, want] of [
      [1, 1],
      [8, 0],
    ] as const) {
      const f = computeFrame(camAt(M, inside(am), d), 800, 600, SPHERE);
      const s = projectToScreen(f, M)!;
      const x = s[0] + 0.31, y = s[1] + 0.17;
      const under = triUnder(f, x, y);
      expect(under.length, `${d}`).toBe(1);
      const wpp = worldPerPixel(f, viewDepth(f, M));
      const cands = openFaceCandidates(f, [{ from: T, dir: DIR }], [{ corners: wallTri(under[0]!), wpp }], x, y, 10);
      expect(cands.length, `${d}`).toBe(want);
      if (want) expect(cands[0]!.gap).toBe(0);
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
/** 세운 구멍 경우(각 a, 높이 z, δ, 거리 d, sgn)의 뷰어와 M */
function vertView(refineFace: MeasureSnapOptions['refineFace'], a: number, z: number, delta: number, d: number, sgn: number): View & { M: V3; T: V3 } {
  const { T, M } = vertCase(a, z, delta, sgn);
  const am = Math.atan2(M[1] - VERT.cv, M[0] - VERT.cu);
  return { ...view(refineFace, T, M, inside(am), d), M, T };
}

describe('Viewer3d: 구멍 안 아주 가까이 본 벽의 안내 선 면 위 만나는 점(0.34.0)', () => {
  const CASES = [
    ['활꼴 δ 0.03', DEG + 270, 12, 0.03],
    ['활꼴 δ 0.01', DEG + 270, 12, 0.01],
    ['활꼴 높이 8', DEG + 270, 8, 0.03],
    ['맞은편 활꼴', DEG + 90, 12, 0.03],
    ['칸을 뚫음 δ 0.1', DEG + 270, 12, 0.1],
  ] as const;

  it('거리 0.5·1·2에서 M± 둘레를 가리키면 원기둥 위 다듬은 교차(그 안내 선 위 — 나란함·끌어온 점·벽 삼각형)에 붙는다', () => {
    for (const [name, a, z, delta] of CASES)
      for (const d of [0.5, 1, 2])
        for (const sgn of [-1, 1]) {
          const calls: SnapRefineFaceInput[] = [];
          const w = vertView(wallRefine(calls), a, z, delta, d, sgn);
          const s = at(w, w.M);
          ptr(w, s.x + 1.3, s.y + 2.1);
          const h = w.v.measureHoverSnap!;
          const k = `${name} d${d} ${sgn}`;
          expect(h, k).toMatchObject({ snap: 'parallel', refined: true, face: { id: VERT.id } });
          expect(h.trackFrom, k).toEqual(w.T);
          expect(h.segment, k).toBeUndefined();
          // 원기둥 위·그 안내 선 위(기준 방향은 float32 끝점이라 시험의 M과는 1e-4 안)
          expect(onWall(VERT, h.point), k).toBe(true);
          expect(offGuide(h), k).toBeLessThan(1e-9);
          expect(dist(h.point, w.M), k).toBeLessThan(1e-4);
          expect(calls.some((c) => c.kind === 'axisFace' && c.open), k).toBe(true);
          w.v.dispose();
        }
  });

  it('refineFace가 늘 null이면 붙지 않는다(안내 선 위 커서 자리 — 면 없음)', () => {
    for (const [name, a, z, delta] of CASES) {
      const w = vertView(() => null, a, z, delta, 1, 1);
      const s = at(w, w.M);
      ptr(w, s.x + 1.3, s.y + 2.1);
      const h = w.v.measureHoverSnap!;
      expect(h.snap, name).toBe('parallel');
      expect(h, name).not.toHaveProperty('face');
      expect(h, name).not.toHaveProperty('refined');
      w.v.dispose();
    }
  });

  it('M± 둘레 화면 격자(15 × 15, 1.37화소 칸 — 경계를 비킨 자리): 열린 후보에만 null을 주는 뷰어와 다른 자리는 모두 그 안내 선 위·원기둥 위 다듬은 교차이고, 교차 둘레에서는 바뀐다', () => {
    const closedOnly = (c: SnapRefineFaceInput): V3 | null => (c.open ? null : wallRefine()(c));
    for (const [name, a, z, delta] of [CASES[0], CASES[4]] as const)
      for (const sgn of [-1, 1]) {
        const on = vertView(wallRefine(), a, z, delta, 1, sgn);
        const off = vertView(closedOnly, a, z, delta, 1, sgn);
        const c = at(on, on.M);
        let changed = 0;
        for (let iy = -7; iy <= 7; iy++)
          for (let ix = -7; ix <= 7; ix++) {
            const x = c.x + ix * 1.37 + 0.211, y = c.y + iy * 1.37 - 0.173;
            ptr(on, x, y);
            ptr(off, x, y);
            const p = on.v.measureHoverSnap, q = off.v.measureHoverSnap;
            if (JSON.stringify(p) === JSON.stringify(q)) continue;
            changed++;
            const k = `${name} ${sgn} ${ix},${iy}`;
            expect(p, k).toMatchObject({ snap: 'parallel', refined: true, face: { id: VERT.id } });
            expect(onWall(VERT, p!.point), k).toBe(true);
            expect(offGuide(p!), k).toBeLessThan(1e-9);
          }
        expect(changed, `${name} ${sgn}`).toBeGreaterThan(100);
        on.v.dispose();
        off.v.dispose();
      }
  });

  it('누운 구멍(X 방향 반지름 4): 꼭대기 아래 δ를 지나는 안내 선이 벽을 뚫는 M± 둘레도 거리 0.5·1에서 원기둥 위 교차에 붙는다', () => {
    for (const delta of [0.002, 0.02, 0.05])
      for (const d of [0.5, 1])
        for (const sgn of [-1, 1]) {
          const z = HOR.cv + HOR.r - delta;
          const tt = Math.sqrt(HOR.r ** 2 - (z - HOR.cv) ** 2);
          const s0 = (sgn * tt) / DIR[1];
          const M: V3 = [15 + s0 * DIR[0], 220 + s0 * DIR[1], z];
          const T: V3 = [15 - 20 * DIR[0], 220 - 20 * DIR[1], z];
          const w = view(wallRefine(), T, M, [0.2, -0.6 * sgn, -1], d);
          const s = at(w, M);
          ptr(w, s.x + 1.3, s.y + 2.1);
          const h = w.v.measureHoverSnap!;
          const k = `${delta} d${d} ${sgn}`;
          expect(h, k).toMatchObject({ snap: 'parallel', refined: true, face: { id: HOR.id } });
          expect(onWall(HOR, h.point), k).toBe(true);
          expect(offGuide(h), k).toBeLessThan(1e-9);
          expect(dist(h.point, M), k).toBeLessThan(1e-4);
          w.v.dispose();
        }
  });

  it('보통 거리(바깥 비스듬히 15): 칸을 뚫는 자리가 커서에서 붙잡기 거리 밖인 M 둘레는 0.33.0 그대로 안내 선 위 커서 자리(커서 쪽 활꼴이 붙잡기 거리보다 얇다)', () => {
    const { T, M, P0 } = vertCase(DEG + 270, 12, 0.1, -1);
    const on = view(wallRefine(), T, [150, 150, 12], [0.3, -1, 0.5], 15);
    const off = view(() => null, T, [150, 150, 12], [0.3, -1, 0.5], 15);
    const c = at(on, M);
    let same = 0;
    for (const [ix, iy] of [
      [-4, -1],
      [-4, 0],
      [-4, 1],
      [-5, 0],
    ]) {
      const x = c.x + ix * 2 + 0.31, y = c.y + iy * 2 + 0.17;
      ptr(on, x, y);
      ptr(off, x, y);
      expect(on.v.measureHoverSnap, `${ix},${iy}`).toEqual(off.v.measureHoverSnap);
      if (on.v.measureHoverSnap?.snap === 'parallel' && !on.v.measureHoverSnap.face) same++;
    }
    expect(same).toBeGreaterThan(0);
    expect(offLine(P0, T, DIR)).toBeLessThan(1e-9);
    on.v.dispose();
    off.v.dispose();
  });
});

describe('안내 선 방향(시험 장면 전제)', () => {
  it('기준 선분을 지나간 끌어온 점의 나란한 안내 선은 기준 방향(27°)', () => {
    const g = trackDirGuides([0, 0, 0], [G0, G1]);
    expect(g[0]!.kind).toBe('parallel');
    expect(dist(g[0]!.dir, DIR)).toBeLessThan(1e-6);
  });
});
