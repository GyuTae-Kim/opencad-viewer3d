/**
 * 0.30.0 두 끌어온 점의 나란함·수직 선끼리 만나는 점: 순수 trackDirPairSnap(같은 기준 선분에 대한 두 점의 안내 선이 3D로 만나는 점 — 0.17.0 끌어온 축끼리와 같은 허용치·빼는 규칙·차례)과
 * 뷰어 측정 붙잡기 MeasureInference.trackDirs { meets: { guides: true } }(값 — snap·trackFrom·edge·trackGuide, 찍은 점, 잠그지 않음, 켜지 않으면 0.29.0과 같은지,
 * 켜면 바뀐 자리는 모두 안내 선끼리 만나는 점인지).
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { normalizeInference } from '../src/inference';
import type { V3 } from '../src/math';
import { trackDirGuides, trackDirPairSnap } from '../src/track';
import { type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import type { LineSet3d, Scene3d } from '../src/types';

const near = (a: readonly number[], b: readonly number[], tol = 1e-9): boolean => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) <= tol;
const sameLine = (a: readonly number[], b: readonly number[]): boolean => Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) > 1 - 1e-9;
const s2 = Math.SQRT1_2;

describe('trackDirPairSnap(0.30.0 — 두 끌어온 점의 안내 선끼리 만나는 점, 순수)', () => {
  /**
   * 기준 선분 (0, 0, 0) → (10, 10, 0)(방향 (√½, √½, 0)), 끌어온 점 P = (30, 20, 0)(앞 — 더 최근)·Q = (80, 0, 0).
   * 두 점 모두 안내는 나란함 (√½, √½, 0)과 기준 직선으로 내린 수직 (−√½, √½, 0). P의 나란한 선 × Q의 수직인 선 = (45, 35, 0), P의 수직 × Q의 나란함 = (65, −15, 0)
   */
  const P: V3 = [30, 20, 0];
  const Q: V3 = [80, 0, 0];
  const SEG: [V3, V3] = [
    [0, 0, 0],
    [10, 10, 0],
  ];
  const M1: V3 = [45, 35, 0];
  const M2: V3 = [65, -15, 0];
  const iso = dirToAngles([0.6, -1, 1.4]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [50, 15, 0], distance: 260, projection: 'perspective' };
  const f = computeFrame(cam, 800, 600, { center: [50, 15, 0], radius: 70 });
  const at = (p: readonly number[], dx = 0.3, dy = -0.2): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0] + dx, s[1] + dy];
  };

  it('안내 선 둘(나란함·내린 수직)이고, 두 구석에서 만난다 — 점은 첫째 점의 선 위, 둘째는 other(점·종류·방향), 평면 좌표는 그대로(z가 정확히 0)', () => {
    expect(trackDirGuides(P, SEG).map((g) => g.kind)).toEqual(['parallel', 'perpendicular']);
    const cases: [V3, 'parallel' | 'perpendicular', 'parallel' | 'perpendicular'][] = [
      [M1, 'parallel', 'perpendicular'],
      [M2, 'perpendicular', 'parallel'],
    ];
    for (const [want, k1, k2] of cases) {
      const [x, y] = at(want);
      const r = trackDirPairSnap(f, [P, Q], SEG, x, y, 10)!;
      expect(r).toMatchObject({ kind: k1, from: P, other: { from: Q, kind: k2 } });
      expect(near(r.p, want, 1e-9)).toBe(true);
      expect(r.p[2]).toBe(0);
      expect(r.distPx).toBeLessThan(1);
      expect(sameLine(r.dir, k1 === 'parallel' ? [s2, s2, 0] : [-s2, s2, 0])).toBe(true);
      expect(sameLine(r.other.dir, k2 === 'parallel' ? [s2, s2, 0] : [-s2, s2, 0])).toBe(true);
      // 그 점은 두 선 위
      for (const [o, d] of [
        [r.from, r.dir],
        [r.other.from, r.other.dir],
      ] as const) {
        const t = (r.p[0] - o[0]) * d[0] + (r.p[1] - o[1]) * d[1] + (r.p[2] - o[2]) * d[2];
        expect(near(r.p, [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], 1e-9)).toBe(true);
      }
    }
    // 차례를 바꿔 주면 첫째가 Q
    const [x, y] = at(M1);
    expect(trackDirPairSnap(f, [Q, P], SEG, x, y, 10)).toMatchObject({ kind: 'perpendicular', from: Q, other: { from: P, kind: 'parallel' } });
  });

  it('빼는 것: 만나지 않는 두 선(높이가 다른 점 — 엇갈림), 첫 점과 같은 점, 커서가 그 점 둘레, 점 하나·기준 없음, 붙잡기 거리 밖', () => {
    const [x, y] = at(M1);
    // 높이가 다른 Q(z = 5): Q의 나란함·비친 수직은 z = 5 평면, 내린 수직은 기준 직선(z = 0)에서 끝나 P의 선과 만나지 않는다
    const Qz: V3 = [80, 0, 5];
    expect(trackDirGuides(Qz, SEG).length).toBe(3);
    expect(trackDirPairSnap(f, [P, Qz], SEG, x, y, 10)).toBeNull();
    const [xz, yz] = at([45, 35, 5]);
    expect(trackDirPairSnap(f, [P, Qz], SEG, xz, yz, 10)).toBeNull();
    // 첫 점(skip)과 같은 점은 쌍에 넣지 않는다
    expect(trackDirPairSnap(f, [P, Q], SEG, x, y, 10, Q)).toBeNull();
    // 커서가 그 점의 화면 자리 둘레면 그 쌍은 보지 않는다
    const [px, py] = at(P, 1, 1);
    expect(trackDirPairSnap(f, [P, Q], SEG, px, py, 10)).toBeNull();
    expect(trackDirPairSnap(f, [P], SEG, x, y, 10)).toBeNull();
    expect(trackDirPairSnap(f, [P, Q], null, x, y, 10)).toBeNull();
    const [fx, fy] = at(M1, 14, 0);
    expect(trackDirPairSnap(f, [P, Q], SEG, fx, fy, 10)).toBeNull();
    // 같은 자리 두 점·수가 아닌 점
    expect(trackDirPairSnap(f, [P, [30, 20, 0]], SEG, x, y, 10)).toBeNull();
    expect(trackDirPairSnap(f, [P, [Number.NaN, 0, 0]], SEG, x, y, 10)).toBeNull();
    // 교차가 첫 점 자리면 뺀다
    expect(trackDirPairSnap(f, [P, Q], SEG, x, y, 10, M1)).toBeNull();
  });

  it('점이 셋이면 쌍마다 보고 커서에서 가까운 것(같은 자리면 앞 쌍)', () => {
    // R = (0, 60, 0): P·R 쌍은 (35, 25, 0)·(−5, 55, 0), R·Q 쌍은 (10, 70, 0)·(70, −10, 0)에서 만난다 — M1 둘레에서는 P·Q 쌍
    const R: V3 = [0, 60, 0];
    const [x, y] = at(M1);
    expect(trackDirPairSnap(f, [P, R, Q], SEG, x, y, 10)).toMatchObject({ from: P, other: { from: Q } });
    // P의 수직 선(x + y = 50)과 R의 나란한 선(y − x = 60)은 (−5, 55, 0)
    const [x2, y2] = at([-5, 55, 0]);
    const r = trackDirPairSnap(f, [P, R, Q], SEG, x2, y2, 10)!;
    expect(r).toMatchObject({ kind: 'perpendicular', from: P, other: { from: R, kind: 'parallel' } });
    expect(near(r.p, [-5, 55, 0], 1e-9)).toBe(true);
  });
});

// ───────────── 뷰어(가짜 DOM) ─────────────

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

const ptrEvent = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as FakeElement).fire(type, {
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
const scr = (v: Viewer3d, p: readonly number[]): { x: number; y: number } => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const along = (o: readonly number[], d: readonly number[], t: number): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t];
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

/**
 * 0.29.0 시험과 같은 평면 장면: 끌어온 점 E = (80, 20, 0)(앞)·Q = (30, −30, 0), 기준 선분 '기준' (20, 60, 0) → (60, 90, 0)(나란함 (0.8, 0.6, 0), 수직 (0.6, −0.8, 0)),
 * 첫 점 A = (0, 0, 0)('가'의 끝). E의 나란한 선 × Q의 수직인 선 = (24, −22, 0), E의 수직인 선 × Q의 나란한 선 = (86, 12, 0)
 */
const A: V3 = [0, 0, 0];
const E: V3 = [80, 20, 0];
const Q: V3 = [30, -30, 0];
const R0: V3 = [20, 60, 0], R1: V3 = [60, 90, 0];
const PAR: V3 = [0.8, 0.6, 0];
const PERP: V3 = [0.6, -0.8, 0];
const MEET_1: V3 = [24, -22, 0];
const MEET_2: V3 = [86, 12, 0];
const LINE_GA: LineSet3d = { id: '가', positions: new Float32Array([...A, 0, -20, 0]) };
const LINE_REF: LineSet3d = { id: '기준', positions: new Float32Array([...R0, ...R1]) };
const LINE_SIP: LineSet3d = { id: '십', positions: new Float32Array([30, -20, 0, 60, 10, 0]) };
const flatScene: Scene3d = { name: 'm', units: 'mm', meshes: [], lines: [LINE_GA, LINE_REF, LINE_SIP], points: [], bounds: { min: [-30, -60, 0], max: [120, 100, 0] } };

function make(): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  views.push(v);
  v.setScene(flatScene);
  v.setView('top', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  return v;
}
const passRef = (v: Viewer3d): void => {
  const s = scr(v, along(R0, [R1[0] - R0[0], R1[1] - R0[1], 0], 0.8));
  hoverXY(v, s.x + 0.4, s.y + 0.3);
  expect(v.measureHoverSnap).toMatchObject({ segment: { id: '기준' } });
};
const hoverAt = (v: Viewer3d, p: readonly number[], dx = 2, dy = 1): MeasureHoverSnap | null => {
  const s = scr(v, p);
  hoverXY(v, s.x + dx, s.y + dy);
  return v.measureHoverSnap;
};
const isRef = (e: readonly (readonly number[])[] | undefined): boolean => !!e && dist(e[0]!, R0) < 1e-6 && dist(e[1]!, R1) < 1e-6;
type TrackDirsOpt = boolean | { edge?: (() => boolean) | null; meets?: boolean | { guides?: boolean } | null };
const opts = (trackDirs: TrackDirsOpt) => ({ edges: true, inference: { axes: true, parallel: true, track: true, trackDirs } });
const GUIDES = opts({ meets: { guides: true } });

describe('두 끌어온 점의 안내 선끼리 만나는 점(0.30.0 inference.trackDirs { meets: { guides: true } })', () => {
  it('normalizeInference: meets 객체는 meets: true, guides가 true일 때만 meetGuides도(edge와 함께도)', () => {
    const fn = (): boolean => true;
    expect(normalizeInference({ track: true, trackDirs: { meets: { guides: true } } })!.trackDirs).toEqual({ meets: true, meetGuides: true });
    expect(normalizeInference({ track: true, trackDirs: { edge: fn, meets: { guides: true } } })!.trackDirs).toEqual({ edge: fn, meets: true, meetGuides: true });
    for (const m of [{}, { guides: false }, { guides: 1 as unknown as boolean }]) expect(normalizeInference({ track: true, trackDirs: { meets: m } })!.trackDirs).toEqual({ meets: true });
    expect(normalizeInference({ track: true, trackDirs: { meets: null } })!.trackDirs).toBe(true);
    const v = make();
    v.setMeasureSnap(GUIDES);
    expect((v.measureSnap!.inference as { trackDirs: unknown }).trackDirs).toEqual({ meets: true, meetGuides: true });
  });

  it('두 구석: snap은 앞 점(E)의 안내 종류, trackFrom·edge(기준 선분)에 trackGuide(Q의 선) — 점은 정확히(z = 0), 잠글 방향 없음. 첫 점 전에도', () => {
    const v = make();
    v.setMeasureSnap(GUIDES);
    v.setMeasureTrackPoints([E, Q]);
    passRef(v);
    const h = hoverAt(v, MEET_1)!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: E, trackGuide: { from: Q, kind: 'perpendicular' } });
    expect(isRef(h.edge)).toBe(true);
    expect(dist(h.point, MEET_1)).toBeLessThan(1e-9);
    expect(h.point[2]).toBe(0);
    expect(sameLine(h.trackGuide!.dir, PERP)).toBe(true);
    expect(h).not.toHaveProperty('direction');
    expect(h).not.toHaveProperty('trackOther');
    expect(v.measureHoverLock).toBeNull();
    const k = hoverAt(v, MEET_2)!;
    expect(k).toMatchObject({ snap: 'perpendicular', trackFrom: E, trackGuide: { from: Q, kind: 'parallel' } });
    expect(sameLine(k.trackGuide!.dir, PAR)).toBe(true);
    expect(dist(k.point, MEET_2)).toBeLessThan(1e-9);
    // 만나는 점에 붙은 뒤에도 기준은 그대로(다시 안내 선 위)
    const back = hoverAt(v, along(E, PAR, 15))!;
    expect(back).toMatchObject({ snap: 'parallel', trackFrom: E });
    expect(isRef(back.edge)).toBe(true);
    // 0.29.0 { meets: true }만이면 그 자리는 안내 선끼리 만나는 점이 아니다
    const w = make();
    w.setMeasureSnap(opts({ meets: true }));
    w.setMeasureTrackPoints([E, Q]);
    passRef(w);
    expect(hoverAt(w, MEET_1)?.trackGuide).toBeUndefined();
  });

  it('첫 점 뒤 찍은 점(measurePoints)에도 같은 값이 실리고, 측정 결과의 snapB는 안내 종류', () => {
    const v = make();
    v.setMeasureSnap(GUIDES);
    const a = scr(v, A);
    clickXY(v, a.x + 0.4, a.y + 0.3);
    expect(v.measurePointCount).toBe(1);
    v.setMeasureTrackPoints([E, Q]);
    passRef(v);
    expect(hoverAt(v, MEET_1)).toMatchObject({ snap: 'parallel', trackGuide: { from: Q } });
    let got: unknown = null;
    v.onMeasure((m) => void (got = m));
    const s = scr(v, MEET_1);
    clickXY(v, s.x + 2, s.y + 1);
    const pts = v.measurePoints;
    expect(pts.length).toBe(2);
    expect(pts[1]).toMatchObject({ snap: 'parallel', trackFrom: E, trackGuide: { from: Q, kind: 'perpendicular' } });
    expect(dist(pts[1]!.point, MEET_1)).toBeLessThan(1e-9);
    expect(got).toMatchObject({ snapB: 'parallel' });
    expect(got).not.toHaveProperty('directionB');
  });

  it('켜지 않으면 0.29.0과 같다({ meets: true }·{}·{ guides: false }의 화면 격자·두 안내 선을 따라 — 첫 점 전·뒤), 켜면 바뀐 자리는 모두 안내 선끼리 만나는 점', () => {
    const run = (trackDirs: TrackDirsOpt): (MeasureHoverSnap | null)[] => {
      const v = make();
      v.setMeasureSnap(opts(trackDirs));
      v.setMeasureTrackPoints([E, Q]);
      const out: (MeasureHoverSnap | null)[] = [];
      const grid = (): void => {
        for (let j = 0; j < 9; j++)
          for (let i = 0; i < 12; i++) {
            hoverXY(v, ((i + 0.5) * 800) / 12 + 0.37, ((j + 0.5) * 600) / 9 + 0.21);
            out.push(v.measureHoverSnap);
          }
      };
      const lines = (): void => {
        for (const [o, d] of [
          [E, PAR],
          [Q, PERP],
          [E, PERP],
          [Q, PAR],
        ] as const)
          for (let t = -90; t <= 60; t += 2.5) {
            const p = along(o, d, t);
            const sp = v.project(p);
            if (!sp?.onScreen) continue;
            hoverXY(v, sp.x + 0.7, sp.y + 0.4);
            out.push(v.measureHoverSnap);
          }
      };
      passRef(v);
      grid();
      lines();
      const a = scr(v, A);
      clickXY(v, a.x + 0.4, a.y + 0.3);
      passRef(v);
      grid();
      lines();
      return out;
    };
    const want = run({ meets: true });
    expect(run({ meets: {} })).toEqual(want);
    expect(run({ meets: { guides: false } })).toEqual(want);
    const got = run({ meets: { guides: true } });
    expect(got.length).toBe(want.length);
    let changed = 0;
    for (let i = 0; i < got.length; i++) {
      if (JSON.stringify(got[i]) === JSON.stringify(want[i])) continue;
      changed++;
      const h = got[i]!;
      expect(h.trackFrom).toBeDefined();
      expect(h.trackGuide).toBeDefined();
      expect(h.snap === 'parallel' || h.snap === 'perpendicular').toBe(true);
      expect(near(h.point, MEET_1, 1e-6) || near(h.point, MEET_2, 1e-6)).toBe(true);
    }
    expect(changed).toBeGreaterThan(0);
  });
});
