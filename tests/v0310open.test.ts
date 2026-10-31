/**
 * 0.31.0 안내 선의 열린 교차(MeasureInference.trackDirs { meets: { open: true } }): 끌어온 점의 나란함·수직 선이 원을 나눈 꺾은선 토막과 3D로 만나지 않고
 * 활꼴(현과 곡선 사이)만 지날 때 앱 refine('axisEdge', open — 축 이름 없는 그 선)이 준 원 위 교차에 붙는다(0.20.0 잠근 선의 열린 교차와 같은 규칙).
 * - 값(snap·trackFrom·edge·segment·refined, 잠글 방향 없음), 두 교차(한 토막 활꼴을 두 번 지난다 — 0.22.0 둘째 힌트), 기억(같은 자리 다시 부르지 않음)·호출 한도,
 *   찍은 점과 거리, 잠근 동안 보지 않음
 * - 켜지 않으면(또는 refine이 없거나 null만 주면) 0.30.0과 같은지(화면 격자·안내 선을 따라 — 첫 점 전·뒤), 켜면 바뀐 자리는 모두 원 위 교차인지
 * - 커서 이동 한 번에 드는 시간(가짜 WebGL — { meets: true }와 견준다)
 * 장면(위에서 본 평면): 반지름 60 원(12토막, 꼭짓점 φ − 15° + 30°·k, φ = atan2(3, 4) = 36.87°), 끌어온 점 P = (101.2, −36.6, 0), 기준 선분 '기준'(방향 D = (−0.6, 0.8, 0) —
 * 끝점이 정수라 float32 그대로), 첫 점은 선분 '가'의 끝 (−45, 45, 0).
 * P의 나란한 선(방향 D)은 원 중심에서 59 떨어져 토막 0(φ ± 15°)의 현(중심에서 57.96)과 원 사이를 지나 원과 φ ∓ 10.47°에서 만난다.
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { normalizeInference } from '../src/inference';
import type { V3 } from '../src/math';
import { OPEN_REFINE_CALLS, type SnapRefineInput } from '../src/snap';
import { type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import type { LineSet3d, Scene3d } from '../src/types';

const R = 60;
const deg = (a: number): number => (a * Math.PI) / 180;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const along = (o: readonly number[], d: readonly number[], t: number): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t];
/** 점에서 직선(o, d — d는 단위)까지 거리 */
const offLine = (p: readonly number[], o: readonly number[], d: readonly number[]): number => {
  const t = (p[0]! - o[0]!) * d[0]! + (p[1]! - o[1]!) * d[1]! + (p[2]! - o[2]!) * d[2]!;
  return dist(p, along(o, d, t));
};
/** 토막 0의 가운데 방향(cos 0.8, sin 0.6) */
const PHI = (Math.atan2(3, 4) * 180) / Math.PI;
const vtx = (k: number): V3 => [R * Math.cos(deg(PHI - 15 + 30 * k)), R * Math.sin(deg(PHI - 15 + 30 * k)), 0];
const D: V3 = [-0.6, 0.8, 0];
/** P의 나란한 선이 원 중심에서 떨어진 거리(현 57.96과 원 60 사이)와 그 발 */
const H = 59;
const M: V3 = [H * 0.8, H * 0.6, 0];
const P: V3 = along(M, D, -90);
const HALF = Math.sqrt(R * R - H * H);
/** 원과 만나는 두 점(φ ∓ 10.47° — 둘 다 토막 0 범위) */
const XA: V3 = along(M, D, -HALF);
const XB: V3 = along(M, D, HALF);
const R0: V3 = [-20, -30, 0];
const R1: V3 = along(R0, D, 30);
/** 첫 점(선분 '가'의 끝) */
const A: V3 = [-45, 45, 0];

const circle: LineSet3d = {
  id: '원',
  positions: new Float32Array(Array.from({ length: 12 }, (_, k) => [...vtx(k), ...vtx(k + 1)]).flat()),
  segmentIds: new Uint32Array(Array.from({ length: 12 }, (_, k) => 100 + k)),
};
const refLine: LineSet3d = { id: '기준', positions: new Float32Array([...R0, ...R1]) };
const lineGa: LineSet3d = { id: '가', positions: new Float32Array([...A, -45, 60, 0]) };
const scene: Scene3d = { name: 'o', units: 'mm', meshes: [], lines: [circle, refLine, lineGa], points: [], bounds: { min: [-70, -70, 0], max: [105, 70, 0] } };

/** 앱의 정확한 원: 'axisEdge'면 평면 위 직선과 원의 교차 가운데 point에 가까운 것(만나지 않으면 null), 그 밖은 null */
const exactRefine =
  (calls: SnapRefineInput[] = []) =>
  (c: SnapRefineInput): V3 | null => {
    calls.push(c);
    if (c.kind !== 'axisEdge' || !c.line || c.segment.id !== '원') return null;
    const o = c.line.origin, d = c.line.dir;
    if (Math.abs(d[2]) > 1e-12 || Math.abs(o[2]) > 1e-9) return null;
    const a = d[0] * d[0] + d[1] * d[1], b = o[0] * d[0] + o[1] * d[1], k = o[0] * o[0] + o[1] * o[1] - R * R;
    const disc = b * b - a * k;
    if (disc < 0) return null;
    const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t): V3 => [o[0] + d[0] * t, o[1] + d[1] * t, 0]);
    return dist(ts[0]!, c.point) <= dist(ts[1]!, c.point) ? ts[0]! : ts[1]!;
  };

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
const hoverAt = (v: Viewer3d, p: readonly number[], dx = 2, dy = 1): MeasureHoverSnap | null => {
  const s = scr(v, p);
  hoverXY(v, s.x + dx, s.y + dy);
  return v.measureHoverSnap;
};
const isRef = (e: readonly (readonly number[])[] | undefined): boolean => !!e && dist(e[0]!, R0) < 1e-4 && dist(e[1]!, R1) < 1e-4;

function make(): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  return v;
}
/** 기준 선분 위를 지나간다(그 선분이 끌어온 점 안내의 기준이 된다) */
const passRef = (v: Viewer3d): void => {
  const h = hoverAt(v, along(R0, D, 21), 0.4, 0.3);
  expect(h).toMatchObject({ segment: { id: '기준' } });
};
type Meets = boolean | { guides?: boolean; open?: boolean } | null;
type Refine = ((c: SnapRefineInput) => readonly number[] | null | undefined) | null;
const opts = (meets: Meets, refine: Refine = null) => ({ edges: true, refine, inference: { axes: true, parallel: true, track: true, lock: true, trackDirs: { meets } } });
const OPEN = { open: true };

describe('안내 선의 열린 교차(0.31.0 inference.trackDirs { meets: { open: true } })', () => {
  it('전제: 안내 선은 토막 0의 현과 만나지 않고(현에서 1.04) 두 교차는 토막 0 범위, 꼭짓점에서 화면 붙잡기 거리 밖', () => {
    const v = make();
    expect(H - R * Math.cos(deg(15))).toBeGreaterThan(1);
    expect(H - R * Math.cos(deg(15))).toBeLessThan(0.1 * dist(vtx(0), vtx(1)));
    for (const X of [XA, XB]) {
      expect(Math.abs(Math.hypot(X[0], X[1]) - R)).toBeLessThan(1e-9);
      const a = (Math.atan2(X[1], X[0]) * 180) / Math.PI;
      expect(a).toBeGreaterThan(PHI - 15);
      expect(a).toBeLessThan(PHI + 15);
      const s = scr(v, X);
      for (const k of [0, 1]) {
        const q = scr(v, vtx(k));
        expect(Math.hypot(s.x - q.x, s.y - q.y)).toBeGreaterThan(12);
      }
    }
  });

  it('normalizeInference: meets 객체의 open이 true일 때만 meetOpen도(guides·edge와 함께도)', () => {
    const fn = (): boolean => true;
    expect(normalizeInference({ track: true, trackDirs: { meets: OPEN } })!.trackDirs).toEqual({ meets: true, meetOpen: true });
    expect(normalizeInference({ track: true, trackDirs: { edge: fn, meets: { guides: true, open: true } } })!.trackDirs).toEqual({ edge: fn, meets: true, meetGuides: true, meetOpen: true });
    for (const m of [{ open: false }, { open: 1 as unknown as boolean }, {}]) expect(normalizeInference({ track: true, trackDirs: { meets: m } })!.trackDirs).toEqual({ meets: true });
    const v = make();
    v.setMeasureSnap(opts(OPEN));
    expect((v.measureSnap!.inference as { trackDirs: unknown }).trackDirs).toEqual({ meets: true, meetOpen: true });
  });

  it('두 교차: 앱이 준 원 위 점(그 안내 선 위로 — 정확히), snap·trackFrom·edge(기준 선분)·segment(토막 0)·refined, 잠글 방향 없음. 같은 자리는 다시 부르지 않는다', () => {
    const calls: SnapRefineInput[] = [];
    const v = make();
    v.setMeasureSnap(opts(OPEN, exactRefine(calls)));
    v.setMeasureTrackPoints([P]);
    passRef(v);
    for (const X of [XA, XB]) {
      const n0 = X === XA ? calls.length : 0;
      const h = hoverAt(v, X)!;
      expect(h).toMatchObject({ snap: 'parallel', trackFrom: P, refined: true, segment: { kind: 'line', id: '원', index: 100, raw: 0 } });
      expect(isRef(h.edge)).toBe(true);
      expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - R)).toBeLessThan(1e-9);
      expect(offLine(h.point, P, D)).toBeLessThan(1e-9);
      expect(dist(h.point, X)).toBeLessThan(1e-9);
      expect(h.point[2]).toBe(0);
      expect(h).not.toHaveProperty('direction');
      expect(h).not.toHaveProperty('trackGuide');
      expect(v.measureHoverLock).toBeNull();
      // 둘째 교차의 힌트(현의 다른 끝에서 내린 발 — 0.22.0 twin)는 첫째 자리에서 이미 물었을 수 있다(기억) — 둘을 합쳐 본다
      const asked = calls.slice(n0).filter((c) => c.open);
      expect(asked.length).toBeGreaterThan(0);
      expect(asked.length).toBeLessThanOrEqual(2 * OPEN_REFINE_CALLS);
      for (const c of asked) {
        expect(c).toMatchObject({ kind: 'axisEdge', open: true, first: null, segment: { id: '원' } });
        expect(c.line!.origin).toEqual(P);
        expect(c.line).not.toHaveProperty('axis');
        expect(Math.abs(Math.abs(c.line!.dir[0] * D[0] + c.line!.dir[1] * D[1]) - 1)).toBeLessThan(1e-12);
      }
      // 커서를 조금 옮겨도(같은 선·토막) 다시 부르지 않는다
      const n1 = calls.length;
      expect(hoverAt(v, X, -1.5, 2)).toMatchObject({ refined: true, segment: { id: '원' } });
      expect(calls.length).toBe(n1);
    }
    // 붙은 뒤에도 기준은 그대로(토막 0의 현을 지나갔어도)
    const back = hoverAt(v, along(P, D, 30))!;
    expect(back).toMatchObject({ snap: 'parallel', trackFrom: P });
    expect(isRef(back.edge)).toBe(true);
  });

  it('켜지 않거나 refine이 없으면 같은 자리는 안내 선 위 커서 자리(원 위가 아니다), null만 주면 그대로', () => {
    for (const [meets, refine] of [
      [true, exactRefine()],
      [{ open: false }, exactRefine()],
      [OPEN, null],
      [OPEN, () => null],
    ] as [Meets, Refine][]) {
      const v = make();
      v.setMeasureSnap(opts(meets, refine));
      v.setMeasureTrackPoints([P]);
      passRef(v);
      const h = hoverAt(v, XA)!;
      expect(h.refined).toBeUndefined();
      expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - R)).toBeGreaterThan(1e-3);
    }
  });

  it('첫 점 뒤 찍은 점(measurePoints)에도 같은 값, 거리는 정확한 원 위 점까지. 잠근 동안에는 보지 않는다', () => {
    const calls: SnapRefineInput[] = [];
    const v = make();
    v.setMeasureSnap(opts(OPEN, exactRefine(calls)));
    const a = scr(v, A);
    clickXY(v, a.x + 0.4, a.y + 0.3);
    expect(v.measurePointCount).toBe(1);
    expect(v.measurePoints[0]!.point).toEqual(A);
    v.setMeasureTrackPoints([P]);
    passRef(v);
    const s = scr(v, XA);
    clickXY(v, s.x + 2, s.y + 1);
    const pts = v.measurePoints;
    expect(pts.length).toBe(2);
    expect(pts[1]).toMatchObject({ snap: 'parallel', trackFrom: P, refined: true, segment: { id: '원', index: 100 } });
    expect(dist(pts[1]!.point, XA)).toBeLessThan(1e-9);
    expect(Math.abs(v.measurement()!.distance - dist(pts[0]!.point, XA))).toBeLessThan(1e-9);
    // 다시 첫 점을 찍고 X축에 잠그면 안내 선의 열린 교차를 묻지 않는다
    v.clearMeasure();
    clickXY(v, a.x + 0.4, a.y + 0.3);
    v.setMeasureTrackPoints([P]);
    passRef(v);
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    const n = calls.length;
    const h = hoverAt(v, XA, 2, 1);
    expect(h?.locked).toBe(true);
    expect(calls.slice(n).some((c) => c.open && !c.line?.axis)).toBe(false);
  });

  it('켜지 않으면 0.30.0과 같다(화면 격자·안내 선을 따라 — 첫 점 전·뒤), 켜면 바뀐 자리는 모두 원 위 교차이고 이동 한 번에 앱을 새로 부르는 것은 한도 안', () => {
    const run = (meets: Meets, refine: Refine): { out: (MeasureHoverSnap | null)[]; most: number } => {
      const v = make();
      let n = 0;
      v.setMeasureSnap(opts(meets, refine ? (c) => (n++, refine(c)) : null));
      v.setMeasureTrackPoints([P, [-60, 60, 0]]);
      const out: (MeasureHoverSnap | null)[] = [];
      let most = 0;
      const at = (x: number, y: number): void => {
        n = 0;
        hoverXY(v, x, y);
        most = Math.max(most, n);
        out.push(v.measureHoverSnap);
      };
      const grid = (): void => {
        for (let j = 0; j < 9; j++) for (let i = 0; i < 12; i++) at(((i + 0.5) * 800) / 12 + 0.37, ((j + 0.5) * 600) / 9 + 0.21);
      };
      const lines = (): void => {
        for (const d of [D, [D[1], -D[0], 0] as V3])
          for (let t = -40; t <= 110; t += 1.5) {
            const sp = v.project(along(P, d, t));
            if (sp?.onScreen) at(sp.x + 0.7, sp.y + 0.4);
          }
      };
      passRef(v);
      grid();
      lines();
      const a = scr(v, A);
      clickXY(v, a.x + 0.4, a.y + 0.3);
      expect(v.measurePointCount).toBe(1);
      passRef(v);
      grid();
      lines();
      return { out, most };
    };
    const want = run(true, null).out;
    expect(run({ open: false }, null).out).toEqual(want);
    expect(run(OPEN, null).out).toEqual(want);
    expect(run(OPEN, () => null).out).toEqual(want);
    // refine을 주고 열린 교차를 켜지 않은 것과 견준다(0.29.0 만나는 점의 다듬기 등은 그대로)
    const base = run(true, exactRefine()).out;
    expect(run({ open: false }, exactRefine()).out).toEqual(base);
    const { out: got, most } = run(OPEN, exactRefine());
    expect(got.length).toBe(base.length);
    let changed = 0;
    for (let i = 0; i < got.length; i++) {
      if (JSON.stringify(got[i]) === JSON.stringify(base[i])) continue;
      changed++;
      const h = got[i]!;
      expect(h).toMatchObject({ refined: true, segment: { id: '원' } });
      expect(h.snap === 'parallel' || h.snap === 'perpendicular').toBe(true);
      expect(h.trackFrom).toBeDefined();
      expect(Math.abs(Math.hypot(h.point[0], h.point[1]) - R)).toBeLessThan(1e-9);
      // 안내 선은 그때의 기준 선분(edge — 앞서 지나간 토막 0의 현일 수도 있다)에 나란하거나 수직
      const [e0, e1] = h.edge!;
      const el = dist(e0, e1);
      const u: V3 = [(e1[0] - e0[0]) / el, (e1[1] - e0[1]) / el, 0];
      const off = Math.min(offLine(h.point, h.trackFrom!, u), offLine(h.point, h.trackFrom!, [u[1], -u[0], 0]));
      expect(off, JSON.stringify([h, base[i]])).toBeLessThan(1e-9);
    }
    expect(changed).toBeGreaterThan(0);
    expect(most).toBeLessThanOrEqual(OPEN_REFINE_CALLS);
  });

  it('커서 이동 한 번에 드는 시간(안내 선을 따라 400자리 — { meets: true }와 견준다)', () => {
    const cost = (meets: Meets): { mean: number; p95: number } => {
      const v = make();
      v.setMeasureSnap(opts(meets, exactRefine()));
      v.setMeasureTrackPoints([P, [-60, 60, 0], [80, 60, 0]]);
      const a = scr(v, A);
      clickXY(v, a.x + 0.4, a.y + 0.3);
      passRef(v);
      const xy: [number, number][] = [];
      for (let i = 0; i < 400; i++) {
        const sp = v.project(along(P, D, -30 + (140 * i) / 399))!;
        xy.push([sp.x + 0.7 + (i % 3), sp.y + 0.4 - (i % 2)]);
      }
      // 한 번 지나가며 기억을 채운 뒤 잰다(같은 길을 다시 지나가는 미리 보기)
      // 미리 보기 한 번 = 그리기 때 부르는 측정 점 고르기(measureAt — 0.30.0 README 비용과 같은 재기)
      const at = (v as unknown as { measureAt(x: number, y: number, t: string): unknown }).measureAt.bind(v);
      for (const [x, y] of xy) at(x, y, 'mouse');
      const ms: number[] = [];
      for (const [x, y] of xy) {
        const t0 = performance.now();
        at(x, y, 'mouse');
        ms.push(performance.now() - t0);
      }
      ms.sort((p, q) => p - q);
      return { mean: ms.reduce((s, x) => s + x, 0) / ms.length, p95: ms[Math.floor(ms.length * 0.95)]! };
    };
    const off = cost(true);
    const on = cost(OPEN);
    console.log(`안내 선 열린 교차 비용(미리 보기 한 번): { meets: true } 평균 ${off.mean.toFixed(3)} ms·p95 ${off.p95.toFixed(3)} ms → { meets: { open: true } } 평균 ${on.mean.toFixed(3)} ms·p95 ${on.p95.toFixed(3)} ms`);
    // 부하가 높은 기계에서도 넉넉한 한도(400자리 합 2초)
    expect(on.mean * 400).toBeLessThan(2000);
  });
});
