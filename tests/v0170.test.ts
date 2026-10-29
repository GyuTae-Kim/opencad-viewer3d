/**
 * 0.17.0 끌어온 축끼리의 교차·끌어온 축과 선분의 교차(MeasureInference.track).
 * - 순수 함수: trackPairSnap(두 축이 만남·만나지 않음·같은 점의 두 축·허용치·앱의 그리기 축), trackEdgeSnap(선분 교차·끝점·나란함·단면·가림),
 *   chooseTrackPoint(뒤 차례는 TRACK_YIELD_PX 넘게 가까워야)
 * - 뷰어: 머무르기로 기억한 두 점의 축 교차(첫 점 전에도)·찍은 점의 trackOther, 만나지 않으면 한 축만, 선분 교차의 segment·찍은 결과,
 *   차례(점 붙잡기 → 점 후보 → 첫 점 축 → 끌어온 축), 잠금 중에는 없음, 꺼져 있으면 상태 없음, 두 점에서 그 자리까지 축 색 점선 둘
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { fake2d } from './fakegl';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, viewDepth, worldPerPixel } from '../src/camera';
import { TRACK_YIELD_PX, chooseTrackPoint, trackAlongFirst, trackAxisSnap, trackEdgeSnap, trackPairSnap } from '../src/track';
import { DARK_THEME } from '../src/theme';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
/** 점 q에서 p를 지나는 단위 방향 e 직선까지 거리 */
const lineDist = (q: readonly number[], p: readonly number[], e: readonly number[]): number => {
  const w = [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!];
  const t = w[0]! * e[0]! + w[1]! * e[1]! + w[2]! * e[2]!;
  return Math.hypot(w[0]! - e[0]! * t, w[1]! - e[1]! * t, w[2]! - e[2]! * t);
};

// ───────────── 순수 함수 ─────────────
describe('trackPairSnap(끌어온 축끼리의 교차)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  /** 두 3D 선(점·방향)이 화면에서 엇갈리는 자리 */
  const screenCross = (p: readonly number[], e: readonly number[], q: readonly number[], g: readonly number[]): [number, number] => {
    const [a0, a1] = at(p), [b0, b1] = at([p[0]! + e[0]! * 10, p[1]! + e[1]! * 10, p[2]! + e[2]! * 10]);
    const [c0, c1] = at(q), [d0, d1] = at([q[0]! + g[0]! * 10, q[1]! + g[1]! * 10, q[2]! + g[2]! * 10]);
    const ux = b0 - a0, uy = b1 - a1, vx = d0 - c0, vy = d1 - c1;
    const t = ((c0 - a0) * vy - (c1 - a1) * vx) / (ux * vy - uy * vx);
    return [a0 + ux * t, a1 + uy * t];
  };
  const P: V3 = [30, 20, 15], Q: V3 = [-20, -10, 15];

  it('두 점이 남은 좌표 하나를 함께 쓰면 서로 다른 축이 만나는 점(정확히 그 좌표), from·axis는 앞 점, other는 뒤 점', () => {
    const [x, y] = at([-20, 20, 15]);
    const r = trackPairSnap(f, [P, Q], x + 2, y - 1, 10)!;
    expect(r.p).toEqual([-20, 20, 15]);
    expect(r.axis).toBe('x');
    expect(r.from).toEqual(P);
    expect(r.from).not.toBe(P);
    expect(r.other).toEqual({ from: Q, axis: 'y' });
    expect(r.distPx).toBeCloseTo(Math.hypot(2, 1), 9);
    expect(r).not.toHaveProperty('direction');
    // 다른 짝: P의 Y축과 Q의 X축
    const [x2, y2] = at([30, -10, 15]);
    expect(trackPairSnap(f, [P, Q], x2 - 1, y2 + 2, 10)).toMatchObject({ p: [30, -10, 15], axis: 'y', from: P, other: { from: Q, axis: 'x' } });
    // 차례를 바꾸면 from·other도 바뀐다(앞 점이 from)
    expect(trackPairSnap(f, [Q, P], x + 2, y - 1, 10)).toMatchObject({ axis: 'y', from: Q, other: { from: P, axis: 'x' } });
    // 멀면 없다
    expect(trackPairSnap(f, [P, Q], x + 30, y, 10)).toBeNull();
  });

  it('만나지 않으면(높이가 다르다) 화면에서 엇갈려 보이는 자리에도 없다 — 그 자리는 한 축만 붙잡는다', () => {
    const Q2: V3 = [-20, -10, 40];
    const [cx, cy] = screenCross(P, [1, 0, 0], Q2, [0, 1, 0]);
    expect(Number.isFinite(cx) && Number.isFinite(cy)).toBe(true);
    expect(trackPairSnap(f, [P, Q2], cx + 1, cy + 1, 10)).toBeNull();
    const a = trackAxisSnap(f, [P, Q2], cx + 1, cy + 1, 10)!;
    expect(a).not.toBeNull();
    expect(a).not.toHaveProperty('other');
  });

  it('허용치는 그 자리 깊이에서 화면 반 화소: 그 안의 높이 차는 만나고(가운데), 몇 화소면 만나지 않는다', () => {
    const m: V3 = [-20, 20, 15];
    const wpp = worldPerPixel(f, viewDepth(f, m));
    const [x, y] = at(m);
    const near = trackPairSnap(f, [P, [-20, -10, 15 + 0.4 * wpp]], x + 2, y, 10)!;
    expect(near).not.toBeNull();
    expect(near.p[2]).toBeCloseTo(15 + 0.2 * wpp, 12);
    expect(trackPairSnap(f, [P, [-20, -10, 15 + 3 * wpp]], x + 2, y, 10)).toBeNull();
  });

  it('같은 점의 두 축·같은 축 둘·한 점이 다른 점의 축 위면 없다. 첫 점과 같은 점, 커서가 끌어온 점 둘레면 그 쌍은 보지 않는다', () => {
    const [x, y] = at(P);
    // 한 점만(같은 점의 두 축은 그 점에서 만난다 — 점 붙잡기가 맡는다), 같은 점 둘
    expect(trackPairSnap(f, [P], x + 15, y, 30)).toBeNull();
    expect(trackPairSnap(f, [P, [30, 20, 15]], x + 15, y, 30)).toBeNull();
    // Q가 P의 X축 위(같은 X축 둘은 나란하고, 다른 축끼리는 P나 Q에서 만난다)
    const R: V3 = [-10, 20, 15];
    for (const p of [P, R, [10, 20, 15]] as V3[]) {
      const [px, py] = at(p);
      expect(trackPairSnap(f, [P, R], px + 3, py + 3, 10)).toBeNull();
    }
    // 첫 점(skip)과 같은 점은 쌍에 넣지 않는다
    const [mx, my] = at([-20, 20, 15]);
    expect(trackPairSnap(f, [P, Q], mx + 2, my, 10, Q)).toBeNull();
    expect(trackPairSnap(f, [P, Q], mx + 2, my, 10, [0, 0, 0])).not.toBeNull();
    // 교차점이 첫 점 자리면 뺀다
    expect(trackPairSnap(f, [P, Q], mx + 2, my, 10, [-20, 20, 15])).toBeNull();
    // 커서가 Q 둘레(붙잡기 거리)면 Q가 낀 쌍은 보지 않는다 — 교차점이 Q 가까이 있어도
    const S: V3 = [-20, 14, 15];
    const [sx, sy] = at([-20, 20, 15]);
    expect(Math.hypot(sx - at(S)[0], sy - at(S)[1])).toBeLessThan(25);
    expect(trackPairSnap(f, [P, S], sx, sy + 1, 25)).toBeNull();
    expect(trackPairSnap(f, [P, S], sx, sy + 1, 5)).toMatchObject({ p: [-20, 20, 15] });
  });

  it('앱의 그리기 축(세계 축과 다를 때): 나란하지 않은 두 축이 만나는 점', () => {
    const s = Math.SQRT1_2;
    const axes = { x: [1, 1, 0], y: [-1, 1, 0], z: [0, 0, 1] };
    const A: V3 = [10, 0, 5], B: V3 = [-10, 30, 5];
    // A의 X′축과 B의 Y′축: (10 + u, u, 5) = (−10 − v, 30 + v, 5) → u = 5, v = −25 → (15, 5, 5)
    const m: V3 = [15, 5, 5];
    const [x, y] = at(m);
    const r = trackPairSnap(f, [A, B], x + 1, y + 1, 10, null, axes)!;
    expect(r).toMatchObject({ axis: 'x', other: { axis: 'y' } });
    expect(dist(r.p, m)).toBeLessThan(1e-9);
    expect(lineDist(r.p, A, [s, s, 0])).toBeLessThan(1e-9);
    expect(lineDist(r.p, B, [-s, s, 0])).toBeLessThan(1e-9);
    // 세계 축으로는 그 자리에 교차가 없다
    expect(trackPairSnap(f, [A, B], x + 1, y + 1, 10)).toBeNull();
  });
});

describe('trackEdgeSnap(끌어온 축과 선분의 교차)·chooseTrackPoint', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const seg = (a: V3, b: V3, keep?: (p: readonly number[]) => boolean) => ({ a, b, wpp: worldPerPixel(f, viewDepth(f, a)), keep, name: `${a}|${b}` });
  const P: V3 = [30, 20, 15];

  it('P의 축이 선분과 3D로 만나는 점(선분 안쪽), seg는 받은 선분 그대로', () => {
    const S1 = seg([0, 20, 0], [60, 20, 0]);
    const S2 = seg([0, 25, 0], [60, 25, 0]);
    const [x, y] = at([30, 20, 0]);
    const r = trackEdgeSnap(f, [P], [S2, S1], x + 2, y + 1, 10)!;
    expect(r.p).toEqual([30, 20, 0]);
    expect(r.axis).toBe('z');
    expect(r.from).toEqual(P);
    expect(r.seg).toBe(S1);
    expect(r).not.toHaveProperty('other');
    // 비켜 지나가는 선분(높이 5 차)만 있으면 없다
    expect(trackEdgeSnap(f, [P], [S2], x + 2, y + 1, 10)).toBeNull();
    // 멀면 없다
    expect(trackEdgeSnap(f, [P], [S1], x + 30, y, 10)).toBeNull();
  });

  it('선분 끝점·축과 나란한 선분·P 자리·첫 점 자리·단면에 잘린 쪽·가린 점은 뺀다', () => {
    const [x, y] = at([30, 20, 0]);
    // 교차가 선분 끝점
    expect(trackEdgeSnap(f, [P], [seg([30, 20, 0], [60, 20, 0])], x + 2, y + 1, 10)).toBeNull();
    // P가 선분 위(X축은 나란하고, 다른 축은 P에서 만난다)
    const [px, py] = at([40, 20, 15]);
    expect(trackEdgeSnap(f, [P], [seg([0, 20, 15], [60, 20, 15])], px + 1, py + 3, 10)).toBeNull();
    // 첫 점 자리
    const S1 = seg([0, 20, 0], [60, 20, 0]);
    expect(trackEdgeSnap(f, [P], [S1], x + 2, y + 1, 10, [30, 20, 0])).toBeNull();
    // 첫 점이 P면 P는 뺀다
    expect(trackEdgeSnap(f, [P], [S1], x + 2, y + 1, 10, P)).toBeNull();
    // 단면에 잘린 쪽(z ≥ 0이 남는 쪽이면 남고, x < 20만 남으면 잘린다)
    expect(trackEdgeSnap(f, [P], [seg([0, 20, 0], [60, 20, 0], (q) => q[2]! >= 0)], x + 2, y + 1, 10)).not.toBeNull();
    expect(trackEdgeSnap(f, [P], [seg([0, 20, 0], [60, 20, 0], (q) => q[0]! < 20)], x + 2, y + 1, 10)).toBeNull();
    // 가림: 지금 고른 것보다 가까운 후보에만 묻는다
    const asked: V3[] = [];
    expect(
      trackEdgeSnap(f, [P], [S1], x + 2, y + 1, 10, null, null, (q) => {
        asked.push(q);
        return false;
      }),
    ).toBeNull();
    expect(asked).toEqual([[30, 20, 0]]);
  });

  it('여러 점·선분이면 커서에 가까운 것', () => {
    const Q: V3 = [10, -10, 15];
    const S1 = seg([0, 20, 0], [60, 20, 0]);
    // Q의 Z축은 S1과 만나지 않고(y −10), Q의 Y축(x 10, z 15)도 S1(z 0)과 만나지 않는다. S3(바닥 y축 방향 x 10)와 Q의 Z축은 (10, −10, 0)에서
    const S3 = seg([10, -30, 0], [10, 30, 0]);
    const [x, y] = at([10, -10, 0]);
    expect(trackEdgeSnap(f, [P, Q], [S1, S3], x + 1, y + 2, 10)).toMatchObject({ p: [10, -10, 0], axis: 'z', from: Q, seg: S3 });
    // P의 X축(y 20, z 15)은 S3(z 0)와 만나지 않는다. P의 Z축과 S3도(x 30 ≠ 10)
    const [x1, y1] = at([30, 20, 0]);
    expect(trackEdgeSnap(f, [P, Q], [S1, S3], x1 + 1, y1 + 2, 10)).toMatchObject({ from: P, seg: S1 });
  });

  it('trackAlongFirst: 끌어온 점의 축 선이 첫 점을 지나면 그 축 방향(화면 반 화소 안), 아니면 null', () => {
    const a: V3 = [0, 0, 0];
    expect(trackAlongFirst(f, a, [40, 0, 0], 'x')).toEqual([1, 0, 0]);
    expect(trackAlongFirst(f, a, [40, 0, 0], 'y')).toBeNull();
    expect(trackAlongFirst(f, a, [0, 0, -30], 'z')).toEqual([0, 0, 1]);
    const wpp = worldPerPixel(f, viewDepth(f, a));
    expect(trackAlongFirst(f, a, [40, 0.3 * wpp, 0], 'x')).toEqual([1, 0, 0]);
    expect(trackAlongFirst(f, a, [40, 2 * wpp, 0], 'x')).toBeNull();
    // 앱의 그리기 축
    const s = Math.SQRT1_2;
    const d = trackAlongFirst(f, a, [10, 10, 0], 'x', { x: [1, 1, 0], y: [-1, 1, 0], z: [0, 0, 1] })!;
    expect(dist(d, [s, s, 0])).toBeLessThan(1e-12);
  });

  it('chooseTrackPoint: 가까운 것, 뒤 차례는 TRACK_YIELD_PX 넘게 가까워야 이긴다', () => {
    expect(TRACK_YIELD_PX).toBe(1);
    const a = { distPx: 3 }, b = { distPx: 2.5 }, c = { distPx: 1.5 };
    expect(chooseTrackPoint([a, b, c])).toBe(c);
    expect(chooseTrackPoint([a, b])).toBe(a);
    expect(chooseTrackPoint([null, b, undefined, c])).toBe(b);
    expect(chooseTrackPoint([null, null])).toBeNull();
    expect(chooseTrackPoint([a, b], 0)).toBe(b);
  });
});

// ───────────── 뷰어 ─────────────
/** 덧그림 2D 문맥 기록: 획마다 색·굵기·점선과 지난 점(화면) */
interface Stroke {
  style: string;
  width: number;
  dash: number[];
  pts: [number, number][];
}
let strokes: Stroke[] = [];
function rec2d(): CanvasRenderingContext2D {
  const base = fake2d() as unknown as Record<string, unknown>;
  let path: [number, number][] = [];
  let dash: number[] = [];
  const own: Record<string, unknown> = {
    beginPath: () => (path = []),
    moveTo: (x: number, y: number) => path.push([x, y]),
    lineTo: (x: number, y: number) => path.push([x, y]),
    setLineDash: (d: number[]) => (dash = [...d]),
    stroke: () => strokes.push({ style: String(base.strokeStyle), width: Number(base.lineWidth), dash: [...dash], pts: [...path] }),
  };
  return new Proxy(base, {
    get: (t, k) => (typeof k === 'string' && k in own ? own[k] : (t as Record<string | symbol, unknown>)[k]),
    set: (t, k, v) => {
      (t as Record<string | symbol, unknown>)[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

let dom: ReturnType<typeof installDom>;
let restoreCtx: () => void;
beforeAll(() => {
  dom = installDom();
  // 덧그림 문맥을 기록하는 것으로(그 밖은 가짜 DOM 그대로)
  const proto = Object.getPrototypeOf(dom.host()) as { getContext: (type: string) => unknown };
  const orig = proto.getContext;
  proto.getContext = function (this: unknown, type: string) {
    return type === '2d' ? rec2d() : orig.call(this, type);
  };
  restoreCtx = () => (proto.getContext = orig);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  restoreCtx();
  dom.restore();
});

/**
 * 장면: 첫 점 A = (0,0,0)('가'의 끝), 끌어올 점 P = (50, 40, 0)·Q = (−30, 10, 0)(같은 높이 — '나'·'라'의 끝, 아래로 선 선분),
 * 높이가 다른 Q2 = (−30, 10, 25)('마'의 끝), Y 방향 선분 '다'(x 100, 바닥 — P의 X축이 (100, 40, 0)에서 만난다),
 * 대각 선분 '바'((20, −60, 0) → (60, −20, 0) — P의 Y축이 (50, −30, 0)에서 만난다)
 */
const A: V3 = [0, 0, 0];
const P: V3 = [50, 40, 0];
const Q: V3 = [-30, 10, 0];
const Q2: V3 = [-30, 10, 25];
const scene: Scene3d = {
  name: 't',
  units: 'mm',
  meshes: [],
  lines: [
    { id: '가', positions: new Float32Array([...A, 0, -20, 0]) },
    { id: '나', positions: new Float32Array([...P, 50, 40, -10]) },
    { id: '라', positions: new Float32Array([...Q, -30, 10, -10]) },
    { id: '마', positions: new Float32Array([...Q2, -30, 10, 35]) },
    { id: '다', positions: new Float32Array([100, 0, 0, 100, 80, 0]), segmentIds: new Uint32Array([7]) },
    { id: '바', positions: new Float32Array([20, -60, 0, 60, -20, 0]) },
  ],
  points: [],
};

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement };
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
const hoverAt = (w: View, p: readonly number[], dx = 0, dy = 0): void => {
  const s = at(w, p);
  hoverXY(w, s.x + dx, s.y + dy);
};
const clickXY = (w: View, x: number, y: number): void => {
  hoverXY(w, x, y);
  ptr(w, 'pointerdown', x, y, 1);
  ptr(w, 'pointerup', x, y, 0);
  w.v.renderNow();
};
const clickAt = (w: View, p: readonly number[], dx = 0, dy = 0): void => {
  const s = at(w, p);
  clickXY(w, s.x + dx, s.y + dy);
};
/** 점 위에 머물러 기억시킨다(실제 포인터 사건 — 끝점에서 1화소 옆, 가짜 타이머 500 ms) */
const dwellOn = (w: View, p: readonly number[]): void => {
  hoverAt(w, p, 1, 0);
  expect(w.v.measureHoverSnap!.snap).toBe('endpoint');
  vi.advanceTimersByTime(500);
};
/** 화면에서 세계 점 p에서 q 쪽으로 n화소 옮긴 자리 */
const toward = (w: View, p: readonly number[], q: readonly number[], n: number): { x: number; y: number } => {
  const a = at(w, p), b = at(w, q);
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + ((b.x - a.x) * n) / l, y: a.y + ((b.y - a.y) * n) / l };
};
const TRACK = { inference: { axes: true, track: true } } as const;

describe('Viewer3d: 끌어온 축끼리의 교차(0.17.0)', () => {
  const M: V3 = [-30, 40, 0]; // P의 X축과 Q의 Y축이 만나는 점
  it('머물러 기억한 두 점의 축이 만나는 점을 첫 점 전에도 붙잡고, 찍은 점에 둘째 끌어온 축이 실린다', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap(TRACK);
    dwellOn(w, P);
    dwellOn(w, Q);
    expect(v.measureTrackPoints).toEqual([Q, P]);
    const c = toward(w, M, [-30, 60, 0], 3);
    hoverXY(w, c.x, c.y);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.point).toEqual(M);
    // 앞(더 최근) 점 Q의 Y축이 첫째, P의 X축이 둘째
    expect(h.axis).toBe('y');
    expect(h.trackFrom).toEqual(Q);
    expect(h.trackOther).toEqual({ from: P, axis: 'x' });
    expect(h).not.toHaveProperty('direction');
    expect(h).not.toHaveProperty('segment');
    expect(v.measureHoverLock).toBeNull();
    // 복사본
    h.trackOther!.from[0] = 999;
    expect(v.measureHoverSnap!.trackOther!.from).toEqual(P);
    clickXY(w, c.x, c.y);
    expect(v.measurePoints[0]).toMatchObject({ point: M, snap: 'axis', axis: 'y', trackFrom: Q, trackOther: { from: P, axis: 'x' } });
    v.dispose();
  });

  it('그리기: 두 끌어온 점에서 그 자리까지 각 축 색 점선 둘', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap(TRACK);
    v.setMeasureTrackPoints([Q, P]);
    const c = toward(w, M, [-30, 60, 0], 3);
    strokes = [];
    hoverXY(w, c.x, c.y);
    const m = at(w, M), sp = at(w, P), sq = at(w, Q);
    const dotted = strokes.filter((s) => s.dash.join() === '4,3' && s.pts.length === 2);
    const near = (a: [number, number], b: { x: number; y: number }): boolean => Math.hypot(a[0] - b.x, a[1] - b.y) < 1e-6;
    const fromQ = dotted.find((s) => near(s.pts[0]!, sq) && near(s.pts[1]!, m));
    const fromP = dotted.find((s) => near(s.pts[0]!, sp) && near(s.pts[1]!, m));
    expect(fromQ?.style).toBe(DARK_THEME.axisY);
    expect(fromP?.style).toBe(DARK_THEME.axisX);
    v.dispose();
  });

  it('높이가 다른 두 점의 축은 화면에서 엇갈려 보여도 붙잡지 않는다(한 축만)', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap(TRACK);
    // R은 P보다 25 높다(장면 밖의 점 — 앱이 준 끌어올 점). P의 Y축과 R의 X축이 화면에서 엇갈리는 자리는 빈 곳이다
    const R: V3 = [60, -40, 25];
    v.setMeasureTrackPoints([R, P]);
    const a0 = at(w, P), a1 = at(w, [50, 30, 0]), b0 = at(w, R), b1 = at(w, [70, -40, 25]);
    const ux = a1.x - a0.x, uy = a1.y - a0.y, vx = b1.x - b0.x, vy = b1.y - b0.y;
    const t = ((b0.x - a0.x) * vy - (b0.y - a0.y) * vx) / (ux * vy - uy * vx);
    const cx = a0.x + ux * t, cy = a0.y + uy * t;
    // 빈 곳인지(끝점·끌어온 점에서 붙잡기 거리의 두 배 넘게)
    for (const l of scene.lines)
      for (let k = 0; k < l.positions.length; k += 3) {
        const e = at(w, [l.positions[k]!, l.positions[k + 1]!, l.positions[k + 2]!]);
        expect(Math.hypot(e.x - cx, e.y - cy)).toBeGreaterThan(14);
      }
    for (const q of [P, R]) expect(Math.hypot(at(w, q).x - cx, at(w, q).y - cy)).toBeGreaterThan(20);
    hoverXY(w, cx + 1, cy + 1);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h).not.toHaveProperty('trackOther');
    expect(h.trackFrom).toBeDefined();
    v.dispose();
  });

  it('차례: 끌어온 축끼리의 교차가 첫 점 축보다 먼저, 첫 점 축이 끌어온 축보다 먼저. 잠근 동안에는 없다', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap(TRACK);
    clickAt(w, A, 0, 1);
    expect(v.measurePointCount).toBe(1);
    // Q3 = (−30, 2, 0): Q3의 X축(y 2)이 첫 점 X축(y 0) 바로 옆. P의 Y축과 (50, 2, 0)에서 만난다
    const Q3: V3 = [-30, 2, 0];
    const M3: V3 = [50, 2, 0];
    v.setMeasureTrackPoints([Q3, P]);
    // 화면에서 M3와 첫 점 X축 위 나란한 자리(50, 0, 0) 사이: 1화소 옆 커서에서 교차가 TRACK_YIELD_PX 넘게 가깝고, 첫 점 X축도 붙잡기 거리 안
    const gap = Math.hypot(at(w, M3).x - at(w, [50, 0, 0]).x, at(w, M3).y - at(w, [50, 0, 0]).y);
    expect(gap).toBeGreaterThan(3.5);
    expect(gap).toBeLessThan(9);
    const c = toward(w, M3, [50, 0, 0], 1);
    hoverXY(w, c.x, c.y);
    let h = v.measureHoverSnap!;
    expect(h.point).toEqual(M3);
    expect(h.trackOther).toBeDefined();
    // 끌어온 점이 하나면 같은 자리는 첫 점 X축(끌어온 축 Q3의 X축보다 먼저)
    v.setMeasureTrackPoints([Q3]);
    hoverXY(w, c.x, c.y);
    h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.axis).toBe('x');
    expect(h).not.toHaveProperty('trackFrom');
    expect(h.direction).toEqual([1, 0, 0]);
    // 잠그면 잠근 선 위 점(교차 없음)
    v.setMeasureTrackPoints([Q, P]);
    expect(v.setMeasureInferenceLock('z')).toBe(true);
    hoverAt(w, M, 0, 3);
    h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h).not.toHaveProperty('trackOther');
    expect(h).not.toHaveProperty('trackFrom');
    v.dispose();
  });
});

describe('Viewer3d: 끌어온 축과 선분의 교차(0.17.0)', () => {
  const X: V3 = [100, 40, 0]; // P의 X축이 '다'와 만나는 점
  it('선분 위에서 끌어온 축이 만나는 자리에 붙고, 그 선분 식별자가 실린다. 두 점째로 찍으면 결과는 축 붙잡기', () => {
    const w = view();
    const { v } = w;
    const got: { distance: number; snapB: unknown; axisB: unknown; directionB?: unknown }[] = [];
    v.onMeasure((m) => m && got.push(m as never));
    v.setMeasureMode(true);
    v.setMeasureSnap(TRACK);
    clickAt(w, A, 0, 1);
    dwellOn(w, P);
    expect(v.measureTrackPoints).toEqual([P]);
    // '다'를 따라 3화소 옆
    const c = toward(w, X, [100, 60, 0], 3);
    hoverXY(w, c.x, c.y);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.axis).toBe('x');
    expect(h.point).toEqual(X);
    expect(h.trackFrom).toEqual(P);
    expect(h).not.toHaveProperty('trackOther');
    expect(h.segment).toEqual({ kind: 'line', id: '다', index: 7, raw: 0, ends: [[100, 0, 0], [100, 80, 0]] });
    expect(h).not.toHaveProperty('direction');
    // '다' 직선은 첫 점을 지나지 않는다 — 잠글 방향 없음
    expect(v.measureHoverLock).toBeNull();
    clickXY(w, c.x, c.y);
    const m = got.at(-1)!;
    expect(m.distance).toBeCloseTo(Math.hypot(100, 40), 9);
    expect([m.snapB, m.axisB, m.directionB]).toEqual(['axis', 'x', undefined]);
    expect(v.measurePoints[1]).toMatchObject({ snap: 'axis', axis: 'x', trackFrom: P, segment: { id: '다', index: 7 } });
    v.dispose();
  });

  it('선분 위 점 붙잡기(가운데 점)가 먼저고, 끌어온 축이 비켜 지나가면 선분 위 보통 점', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    // '다'의 가운데 점이 곧 교차 자리 — 가운데 점을 켜면 점 붙잡기가 먼저
    v.setMeasureSnap({ midpoints: true, ...TRACK });
    v.setMeasureTrackPoints([P]);
    const c = toward(w, X, [100, 60, 0], 3);
    hoverXY(w, c.x, c.y);
    expect(v.measureHoverSnap!.snap).toBe('midpoint');
    // 높이가 다른 끌어온 점(Q2의 X축은 z 25)은 '다'와 만나지 않는다 — 선분 위 보통 점(붙잡지 않음)
    v.setMeasureSnap(TRACK);
    v.setMeasureTrackPoints([Q2]);
    const c2 = toward(w, [100, 10, 0], [100, 30, 0], 3);
    hoverXY(w, c2.x, c2.y);
    const h = v.measureHoverSnap!;
    expect(h.trackFrom ?? null).toBeNull();
    // 같은 높이 Q의 X축은 (100, 10, 0)에서 만난다
    v.setMeasureTrackPoints([Q]);
    hoverXY(w, c2.x, c2.y);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x', point: [100, 10, 0], trackFrom: Q, segment: { id: '다' } });
    v.dispose();
  });

  it('선분 직선이 첫 점을 지나면 0.12.0처럼 그 방향으로 잠글 수 있다', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap(TRACK);
    // 첫 점 = '바'의 아래 끝(20, −60, 0) — '바' 직선이 첫 점을 지난다
    const B0: V3 = [20, -60, 0], B1: V3 = [60, -20, 0], Y: V3 = [50, -30, 0];
    clickAt(w, B0, -1, 0);
    expect(v.measurePoints[0]!.point).toEqual(B0);
    v.setMeasureTrackPoints([P]);
    const c = toward(w, Y, B1, 3);
    hoverXY(w, c.x, c.y);
    expect(v.measureHoverSnap).toMatchObject({ point: Y, axis: 'y', trackFrom: P, segment: { id: '바', index: 0 } });
    const s = Math.SQRT1_2;
    const l = v.measureHoverLock!;
    expect(l.kind).toBe('parallel');
    expect(dist(l.direction, [s, s, 0])).toBeLessThan(1e-7);
    expect(l.edge).toEqual([B0, B1]);
    // 첫 점 축 위 나란한 자리가 같은 점이면 그것이 먼저(0.16.0 그대로 — 첫 점 '다'의 아래 끝에서 P와 나란한 Y축 위 자리 = P의 X축이 '다'와 만나는 자리)
    v.clearMeasure();
    clickAt(w, [100, 0, 0], 1, 0);
    v.setMeasureTrackPoints([P]);
    const c2 = toward(w, X, [100, 60, 0], 3);
    hoverXY(w, c2.x, c2.y);
    expect(v.measureHoverSnap).toMatchObject({ point: X, axis: 'y', direction: [0, 1, 0], trackFrom: P });
    expect(v.measureHoverSnap).not.toHaveProperty('segment');
    v.dispose();
  });

  it('끌어온 점이 첫 점 축 위면 그 축과 선분의 교차는 첫 점 축 위 점이기도 하다 — 방향을 싣고 잠근다', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap(TRACK);
    // 첫 점 = Q(−30, 10, 0), 끌어온 점 = (40, 10, 0)(Q의 X축 위 — 장면 밖의 점). 그 X축이 '다'와 (100, 10, 0)에서 만난다
    clickAt(w, Q, 1, 0);
    expect(v.measurePoints[0]!.point).toEqual(Q);
    v.setMeasureTrackPoints([[40, 10, 0]]);
    const c = toward(w, [100, 10, 0], [100, 30, 0], 3);
    hoverXY(w, c.x, c.y);
    expect(v.measureHoverSnap).toMatchObject({ point: [100, 10, 0], axis: 'x', direction: [1, 0, 0], trackFrom: [40, 10, 0], segment: { id: '다' } });
    expect(v.measureHoverLock).toEqual({ kind: 'axis', axis: 'x', direction: [1, 0, 0] });
    // 끌어온 점이 첫 점 축 위가 아니면 방향이 없다(P의 X축 — y 40)
    v.setMeasureTrackPoints([P]);
    const c2 = toward(w, X, [100, 60, 0], 3);
    hoverXY(w, c2.x, c2.y);
    expect(v.measureHoverSnap).toMatchObject({ point: X, trackFrom: P });
    expect(v.measureHoverSnap).not.toHaveProperty('direction');
    v.dispose();
  });

  it('꺼져 있으면 두 점의 축 교차도 선분 교차도 없다(머물러도 기억하지 않는다)', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true } });
    hoverAt(w, P, 1, 0);
    vi.advanceTimersByTime(2000);
    expect(v.measureTrackPoints).toEqual([]);
    expect(v.setMeasureTrackPoints([Q, P])).toBe(0);
    const c = toward(w, X, [100, 60, 0], 3);
    hoverXY(w, c.x, c.y);
    expect(v.measureHoverSnap?.trackFrom ?? null).toBeNull();
    expect(v.measureHoverSnap?.snap ?? null).toBeNull();
    const c2 = toward(w, M0, [-30, 60, 0], 3);
    hoverXY(w, c2.x, c2.y);
    expect(v.measureHoverSnap?.snap ?? null).not.toBe('axis');
    v.dispose();
  });
});
const M0: V3 = [-30, 40, 0];
