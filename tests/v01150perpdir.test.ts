/**
 * 0.115.0 첫 점에서 지나간 모서리에 수직인 방향(MeasureInference.perpendicularDirs — SketchUp 「모서리에 수직」):
 * 순수 perpendicularDirSnap(끌어온 점 수직 선과 같은 trackDirGuides 규칙 — 내린 수직·축을 비친 방향), 켰을 때 첫 점·기준 선분 뒤 수직 방향 근처 커서가
 * snap 'perpendicular'·direction·edge·perpendicularDir로 붙잡히는지, 첫 점이 기준 직선 위일 때, 기준 거르기(parallelEdge), 축·나란함과의 차례, 수직 발과 가름,
 * Shift·앱 잠금, 찍은 값, 그리기, 머무르기, 끄면 0.114.0과 같은지, 꼴이 틀린 인자(가짜 DOM·가짜 WebGL, 화면 격자 미리 보기).
 * 화면 좌표로 가리킬 때는 선의 경계를 정확히 가리키지 않고 몇 화소 옆을 가리킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { normalizeInference } from '../src/inference';
import type { V3 } from '../src/math';
import { perpendicularDirSnap } from '../src/track';
import { type MeasureHoverSnap, type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { Scene3d } from '../src/types';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  vi.useRealTimers();
  dom.restore();
});

const s2 = Math.SQRT1_2;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const along = (o: readonly number[], d: readonly number[], t: number): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t];
const lineDist = (p: readonly number[], o: readonly number[], d: readonly number[]): number => {
  const w = [p[0]! - o[0]!, p[1]! - o[1]!, p[2]! - o[2]!];
  const t = w[0]! * d[0]! + w[1]! * d[1]! + w[2]! * d[2]!;
  return Math.hypot(w[0]! - d[0]! * t, w[1]! - d[1]! * t, w[2]! - d[2]! * t);
};
/** 같은 선 방향(부호는 상관없다)인지 */
const sameDir = (a: readonly number[] | undefined, b: readonly number[]): boolean =>
  !!a && Math.abs(Math.abs(a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!) - 1) < 1e-9;

// ───────────── 1. 순수 함수 perpendicularDirSnap ─────────────
describe('perpendicularDirSnap(0.115.0 — 첫 점에서 기준 선분에 수직인 방향, 순수)', () => {
  // 비스듬히 본다(눈 쪽 (1, −0.3, 0.8) — 두 수직 안내가 놓인 평면 x + y = 0 밖이라 화면에서 다른 선이다)
  const iso = dirToAngles([1, -0.3, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const seg: [V3, V3] = [[0, 0, 0], [10, 10, 0]];
  /** 첫 점 P(기준 직선 밖 — 위로 15): 내린 수직 P → 발(원점), 축 X·Y를 비친 수평 수직 (√½, −√½, 0). Z는 축이라 뺀다 */
  const P: V3 = [5, -5, 15];
  const l = Math.hypot(5, 5, 15);
  const DROP: V3 = [-5 / l, 5 / l, -15 / l];
  const FLAT: V3 = [s2, -s2, 0];

  it('내린 수직·비친 축 방향 위 점(광선에 가장 가까운 점), 나란한 선·첫 점 둘레·기준 없음·먼 커서는 없다', () => {
    const [fx, fy] = at(along(P, DROP, 12));
    const r = perpendicularDirSnap(f, P, seg, fx + 0.3, fy - 0.2, 10)!;
    expect(r.distPx).toBeLessThan(1);
    expect(dist(r.direction, DROP)).toBeLessThan(1e-12);
    expect(lineDist(r.p, P, DROP)).toBeLessThan(1e-9);
    const [hx, hy] = at(along(P, FLAT, 12));
    const h = perpendicularDirSnap(f, P, seg, hx + 0.2, hy + 0.3, 10)!;
    expect(dist(h.direction, FLAT)).toBeLessThan(1e-12);
    expect(lineDist(h.p, P, FLAT)).toBeLessThan(1e-9);
    // 나란한 선(첫 점 나란함 parallelSnap이 맡는다) 위는 없다
    const [wx, wy] = at(along(P, [s2, s2, 0], -20));
    expect(perpendicularDirSnap(f, P, seg, wx, wy, 10)).toBeNull();
    const [px, py] = at(P);
    expect(perpendicularDirSnap(f, P, seg, px + 4, py, 10)).toBeNull();
    expect(perpendicularDirSnap(f, P, null, fx, fy, 10)).toBeNull();
    expect(perpendicularDirSnap(f, P, [[1, 2, 3], [1, 2, 3]], fx, fy, 10)).toBeNull();
    expect(perpendicularDirSnap(f, P, seg, fx + 60, fy + 40, 10)).toBeNull();
  });

  it('첫 점이 기준 직선 위(모서리 끝)면 내린 수직은 없고 비친 축 방향만 — 축과 같은 선(Z)은 뺀다', () => {
    const Q: V3 = [5, 5, 0];
    const [hx, hy] = at(along(Q, FLAT, 12));
    const h = perpendicularDirSnap(f, Q, seg, hx + 0.2, hy + 0.3, 10)!;
    expect(dist(h.direction, FLAT)).toBeLessThan(1e-12);
    const [zx, zy] = at(along(Q, [0, 0, 1], 12));
    expect(perpendicularDirSnap(f, Q, seg, zx + 0.2, zy + 0.3, 10)).toBeNull();
  });
});

// ───────────── 2. 뷰어: inference.perpendicularDirs ─────────────
/**
 * 첫 점 A = (0, 0, 0)('가'의 끝), 기준 '기준' (20, 60, 0) → (60, 90, 0)(방향 (0.8, 0.6, 0)), 축과 나란한 '다' (100, −10, 0) → (100, 30, 0).
 * A에서 기준 직선으로 내린 수직: 발 (−21.6, 28.8, 0)(선분 밖), 방향 (−0.6, 0.8, 0). 축 X·Y를 비친 방향은 같은 선이라 하나, Z는 축이라 뺀다
 */
const A: V3 = [0, 0, 0];
const R0: V3 = [20, 60, 0], R1: V3 = [60, 90, 0];
const D0: V3 = [100, -10, 0], D1: V3 = [100, 30, 0];
const PAR: V3 = [0.8, 0.6, 0], PERP: V3 = [-0.6, 0.8, 0];
const PERP_AT = along(A, PERP, 30); // (−18, 24, 0)
const PERP_NEG = along(A, PERP, -20); // (12, −16, 0)
const PAR_AT = along(A, PAR, 30); // (24, 18, 0)
const scene: Scene3d = {
  name: 'q',
  units: 'mm',
  meshes: [],
  lines: [
    { id: '가', positions: new Float32Array([...A, 0, -20, 0]) },
    { id: '기준', positions: new Float32Array([...R0, ...R1]) },
    { id: '다', positions: new Float32Array([...D0, ...D1]) },
  ],
  points: [],
};

const ptrEvent = (v: Viewer3d, type: string, x: number, y: number, buttons: number, shiftKey = false): void =>
  (v.canvas as unknown as FakeElement).fire(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: type === 'pointermove' ? -1 : 0,
    buttons,
    shiftKey,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  });
const hoverXY = (v: Viewer3d, x: number, y: number, shiftKey = false): void => {
  ptrEvent(v, 'pointermove', x, y, 0, shiftKey);
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
function make(snap: MeasureSnapOptions, first: V3 | null = A): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  v.setMeasureSnap(snap);
  if (first) {
    const a = scr(v, first);
    clickXY(v, a.x + 0.4, a.y + 0.3);
    expect(v.measurePointCount).toBe(1);
  }
  return v;
}
/** 선분 위 t 자리 옆을 지나간다(나란함·수직 기준) */
const pass = (v: Viewer3d, p: readonly number[], q: readonly number[], t: number): void => {
  const s = scr(v, along(p, [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!], t));
  hoverXY(v, s.x + 0.4, s.y + 0.3);
};
const passRef = (v: Viewer3d): void => {
  pass(v, R0, R1, 0.8);
  expect(v.measureHoverSnap).toMatchObject({ segment: { id: '기준' } });
};
const hoverAt = (v: Viewer3d, p: readonly number[]): MeasureHoverSnap | null => {
  const s = scr(v, p);
  hoverXY(v, s.x + 2, s.y + 1);
  return v.measureHoverSnap;
};
/** 첫 점 A에서 화면 거리 r, 세계 방향 각 deg(XY 평면 — 위에서 본 화면에서 각이 그대로다) 자리 */
const aroundA = (v: Viewer3d, deg: number, r: number): { x: number; y: number } => {
  const s = scr(v, A);
  const e = scr(v, [20 * Math.cos((deg * Math.PI) / 180), 20 * Math.sin((deg * Math.PI) / 180), 0]);
  const l = Math.hypot(e.x - s.x, e.y - s.y);
  return { x: s.x + ((e.x - s.x) / l) * r, y: s.y + ((e.y - s.y) / l) * r };
};
const firstPerp = (h: MeasureHoverSnap | null, dir: readonly number[], e: [V3, V3]): boolean =>
  !!h &&
  h.snap === 'perpendicular' &&
  h.perpendicularDir === true &&
  sameDir(h.direction, dir) &&
  !h.trackFrom &&
  !h.segment &&
  !h.locked &&
  !!h.edge &&
  dist(h.edge[0], e[0]) < 1e-6 &&
  dist(h.edge[1], e[1]) < 1e-6;

describe('Viewer3d: 첫 점에서 지나간 모서리에 수직인 방향(0.115.0 inference.perpendicularDirs)', () => {
  it('normalizeInference·measureSnap: true일 때만 열쇠(이것만 켜도 null이 아니다), true에 들지 않고 꼴이 틀린 값은 주지 않은 것', () => {
    expect(normalizeInference({ perpendicularDirs: true })).toMatchObject({ perpendicularDirs: true, parallel: false, axes: false });
    expect(normalizeInference({ axes: true, perpendicularDirs: true })!.perpendicularDirs).toBe(true);
    expect(normalizeInference({ axes: true })).not.toHaveProperty('perpendicularDirs');
    expect(normalizeInference(true)).not.toHaveProperty('perpendicularDirs');
    for (const bad of [false, null, 1, 'yes', {}, [true]]) {
      expect(normalizeInference({ perpendicularDirs: bad as never })).toBeNull();
      expect(normalizeInference({ axes: true, perpendicularDirs: bad as never })).not.toHaveProperty('perpendicularDirs');
    }
    const v = make({ edges: true, inference: { axes: true, perpendicularDirs: true } }, null);
    expect(v.measureSnap!.inference).toMatchObject({ perpendicularDirs: true });
    v.setMeasureSnap({ inference: { perpendicularDirs: 'yes' as never } });
    expect(v.measureSnap).toBeNull();
  });

  it('켜면: 기준 선분을 지난 뒤 첫 점에서 내린 수직 방향(양쪽) 근처가 수직으로 붙잡힌다 — 그 선 위 점, 잠글 방향', () => {
    const v = make({ edges: true, inference: { axes: true, perpendicularDirs: true } });
    // 기준 선분을 지나기 전에는 없다
    expect(hoverAt(v, PERP_AT)?.snap === 'perpendicular').toBe(false);
    passRef(v);
    for (const at of [PERP_AT, PERP_NEG]) {
      const h = hoverAt(v, at)!;
      expect(firstPerp(h, PERP, [R0, R1])).toBe(true);
      expect(lineDist(h.point, A, PERP)).toBeLessThan(1e-9);
      expect(dist(h.point, at)).toBeLessThan(1);
      const lk = v.measureHoverLock!;
      expect(lk).toMatchObject({ kind: 'perpendicular', edge: [R0, R1] });
      expect(sameDir(lk.direction, PERP)).toBe(true);
    }
  });

  it('첫 점이 기준 직선 위(모서리 끝 R0)면 축을 비친 방향(수평 수직)', () => {
    const v = make({ edges: true, inference: { axes: true, perpendicularDirs: true } }, R0);
    pass(v, R0, R1, 0.8);
    const at = along(R0, [0.6, -0.8, 0], 25);
    const h = hoverAt(v, at)!;
    expect(firstPerp(h, [0.6, -0.8, 0], [R0, R1])).toBe(true);
    expect(lineDist(h.point, R0, [0.6, -0.8, 0])).toBeLessThan(1e-9);
  });

  it('기준은 첫 점 나란함과 같다: 거르지 않으면 마지막으로 지나간 선분(축과 나란한 다 — 수직이 모두 축이라 없다), parallelEdge로 거르면 앞 기준이 남는다', () => {
    const v = make({ edges: true, inference: { axes: true, perpendicularDirs: true } });
    passRef(v);
    pass(v, D0, D1, 0.5);
    expect(hoverAt(v, PERP_AT)?.snap === 'perpendicular').toBe(false);
    const asked: string[] = [];
    const w = make({ edges: true, inference: { axes: true, perpendicularDirs: true, parallelEdge: (s) => (asked.push(s.id), s.id === '기준') } });
    passRef(w);
    pass(w, D0, D1, 0.5);
    expect(firstPerp(hoverAt(w, PERP_AT), PERP, [R0, R1])).toBe(true);
    expect(asked).toContain('다');
  });

  it('차례: 나란함·축과 화면에서 가까운 것(축을 끄고 나란함과, 켜고 Y축과). 점 붙잡기(수직 발)가 먼저이고 수직 발에는 perpendicularDir이 없다', () => {
    const v = make({ edges: true, inference: { parallel: true, perpendicularDirs: true } });
    passRef(v);
    // A에서 12화소, 나란함 (36.87°)과 수직 (126.87°) 사이: 40° 쪽은 나란함이 7.7화소·수직이 9.2화소, 50° 쪽은 거꾸로
    const c40 = aroundA(v, 36.87 + 40, 12);
    hoverXY(v, c40.x, c40.y);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'parallel', edge: [R0, R1] });
    expect(v.measureHoverSnap).not.toHaveProperty('perpendicularDir');
    const c50 = aroundA(v, 36.87 + 50, 12);
    hoverXY(v, c50.x, c50.y);
    expect(firstPerp(v.measureHoverSnap, PERP, [R0, R1])).toBe(true);
    // 축을 켜면 Y축(90°)과 견준다: 100°는 Y축 2.1화소·수직 5.4화소 → 축, 120°는 Y축 6화소·수직 1.4화소 → 수직
    const w = make({ edges: true, inference: { axes: true, parallel: true, perpendicular: true, perpendicularDirs: true } });
    passRef(w);
    const c100 = aroundA(w, 100, 12);
    hoverXY(w, c100.x, c100.y);
    expect(w.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'y' });
    const c120 = aroundA(w, 120, 12);
    hoverXY(w, c120.x, c120.y);
    expect(firstPerp(w.measureHoverSnap, PERP, [R0, R1])).toBe(true);
    // 수직 발: A에서 '다'로 내린 발 (100, 0, 0)은 점 붙잡기 — perpendicularDir 없음
    const foot = hoverAt(w, [100, 0, 0])!;
    expect(foot).toMatchObject({ snap: 'perpendicular', direction: [1, 0, 0] });
    expect(foot).not.toHaveProperty('perpendicularDir');
  });

  it('Shift 잠금·앱 잠금: 그 수직 방향에 잠그고 잠근 선 위에 찍는다(잠근 값에는 perpendicularDir이 없다)', () => {
    const v = make({ edges: true, inference: { axes: true, perpendicularDirs: true, lock: true } });
    passRef(v);
    expect(firstPerp(hoverAt(v, PERP_AT), PERP, [R0, R1])).toBe(true);
    // 수직 선에서 6(세계 길이) 떨어진 자리 — 붙잡기 거리 밖
    const far = scr(v, [-12, 6, 0]);
    hoverXY(v, far.x, far.y, true);
    const lk = v.measureInferenceLock!;
    expect(lk).toMatchObject({ kind: 'perpendicular', edge: [R0, R1], source: 'shift' });
    expect(sameDir(lk.direction, PERP)).toBe(true);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'perpendicular', locked: true });
    expect(h).not.toHaveProperty('perpendicularDir');
    expect(lineDist(h.point, A, PERP)).toBeLessThan(1e-9);
    hoverXY(v, far.x, far.y, false);
    expect(v.measureInferenceLock).toBeNull();
    hoverAt(v, PERP_AT);
    expect(v.setMeasureInferenceLock(true)).toBe(true);
    expect(v.measureInferenceLock).toMatchObject({ kind: 'perpendicular', source: 'api' });
    v.setMeasureInferenceLock(false);
  });

  it('찍은 값: measurePoints에 perpendicularDir·방향, 측정 결과에는 snapB·directionB만', () => {
    const v = make({ edges: true, inference: { axes: true, perpendicularDirs: true } });
    const got: Record<string, unknown>[] = [];
    v.onMeasure((m) => m && got.push(m as unknown as Record<string, unknown>));
    passRef(v);
    const s = scr(v, PERP_AT);
    clickXY(v, s.x + 2, s.y + 1);
    expect(v.measurePointCount).toBe(2);
    const p = v.measurePoints[1]!;
    expect(p).toMatchObject({ snap: 'perpendicular', perpendicularDir: true });
    expect(sameDir(p.direction, PERP)).toBe(true);
    expect(lineDist(p.point, A, PERP)).toBeLessThan(1e-9);
    expect(got.at(-1)).toMatchObject({ snapB: 'perpendicular' });
    expect(sameDir(got.at(-1)!.directionB as V3, PERP)).toBe(true);
    expect(got.at(-1)).not.toHaveProperty('perpendicularDir');
  });

  it('그리기: 첫 점에서 추론 색 안내선·기준 선분 추론 색 점선·추론 색 표식(끄면 그 자리에 추론 색이 없다)', () => {
    const logOf = (v: Viewer3d): string[] => {
      const log: string[] = [];
      const real = (v as unknown as { octx: CanvasRenderingContext2D }).octx;
      (v as unknown as { octx: CanvasRenderingContext2D }).octx = new Proxy(real, {
        get: (t, k) =>
          k === 'setLineDash' ? (d: number[]) => d.length && log.push(`${String(t.strokeStyle)}:${d.join(',')}`) : (t as unknown as Record<string | symbol, unknown>)[k],
        set: (t, k, val) => {
          if (k === 'fillStyle') log.push(`fill:${String(val)}`);
          (t as unknown as Record<string | symbol, unknown>)[k] = val;
          return true;
        },
      });
      return log;
    };
    const v = make({ edges: true, inference: { axes: true, perpendicularDirs: true } });
    const inferColor = (v as unknown as { theme: { inference?: string } }).theme.inference!;
    passRef(v);
    const log = logOf(v);
    hoverAt(v, PERP_AT);
    v.renderNow();
    expect(log).toContain(`${inferColor}:6,4`);
    expect(log).toContain(`${inferColor}:5,3`);
    expect(log).toContain(`fill:${inferColor}`);
    const w = make({ edges: true, inference: { axes: true } });
    passRef(w);
    const wlog = logOf(w);
    hoverAt(w, PERP_AT);
    w.renderNow();
    expect(wlog.some((s) => s.includes(inferColor))).toBe(false);
  });

  it('머무르기: 수직 방향 위 점은 끌어온 점으로 기억하지 않는다(끝점은 기억한다)', () => {
    const v = make({ edges: true, inference: { axes: true, track: { dwellMs: 50 }, perpendicularDirs: true } });
    passRef(v);
    expect(firstPerp(hoverAt(v, PERP_AT), PERP, [R0, R1])).toBe(true);
    vi.advanceTimersByTime(200);
    hoverAt(v, PERP_AT);
    expect(v.measureTrackPoints).toEqual([]);
    const e = scr(v, R1);
    hoverXY(v, e.x + 0.4, e.y + 0.3);
    vi.advanceTimersByTime(200);
    hoverXY(v, e.x + 0.4, e.y + 0.3);
    expect(v.measureTrackPoints).toEqual([R1]);
  });

  it('끄면 0.114.0과 같다: 그 자리는 수직이 아니고, 다른 자리(나란함·축·기준 선분 위·빈 곳)의 미리 보기는 켠 뷰어와 같다', () => {
    const on = make({ edges: true, inference: { axes: true, parallel: true, perpendicularDirs: true } });
    const off = make({ edges: true, inference: { axes: true, parallel: true } });
    for (const v of [on, off]) passRef(v);
    expect(hoverAt(off, PERP_AT)?.snap === 'perpendicular').toBe(false);
    for (const at of [PAR_AT, [0, 40, 0] as V3, along(R0, [0.8, 0.6, 0], 30), [50, 20, 0] as V3]) {
      const a = hoverAt(on, at), b = hoverAt(off, at);
      expect(a).toEqual(b);
      expect(on.measureHoverLock).toEqual(off.measureHoverLock);
    }
    expect(hoverAt(off, PAR_AT)).toMatchObject({ snap: 'parallel' });
    expect(hoverAt(off, [0, 40, 0])).toMatchObject({ snap: 'axis', axis: 'y' });
  });
});
