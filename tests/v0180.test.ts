/**
 * 0.18.0 첫 점 축과 선분의 교차(MeasureInference.axisEdges)와 축과 선분의 교차 다듬기(SnapRefineKind 'axisEdge').
 * - 순수 함수: axisEdgeSnap(교차·끝점·나란함·첫 점 자리·단면·가림·커서가 첫 점 둘레·앱의 그리기 축), acceptOnLine(축 위로 내리기·축에서 벗어난 점·먼 점),
 *   openRefineKey·sameRefineInput의 축 직선, normalizeInference의 axisEdges
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 첫 점 X·Y·Z축과 선분의 교차·찍은 결과·선분 식별자·Shift 잠금, 꺼져 있으면 0.17.0과 같음, 차례(점 붙잡기 → 점 후보 → 첫 점 축),
 *   비켜 지나가는 선분·첫 점 둘레, 그리기(첫 점에서 축 색 안내선), 다듬기(축 직선을 넘기고 축 위로 내린 점, 버리기, 기억, 끌어온 축과 선분의 교차도)
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { fake2d } from './fakegl';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, viewDepth, worldPerPixel } from '../src/camera';
import { normalizeInference } from '../src/inference';
import { type SnapRefineInput, acceptOnLine, openRefineKey, sameRefineInput } from '../src/snap';
import { axisEdgeSnap } from '../src/track';
import { DARK_THEME } from '../src/theme';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

// ───────────── 순수 함수 ─────────────
describe('axisEdgeSnap(첫 점 축과 선분의 교차)', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const seg = (a: V3, b: V3, keep?: (p: readonly number[]) => boolean) => ({ a, b, wpp: worldPerPixel(f, viewDepth(f, a)), keep, name: `${a}|${b}` });
  const A: V3 = [0, 0, 0];

  it('첫 점의 축이 선분과 3D로 만나는 점(선분 안쪽) — 축·단위 방향·받은 선분 그대로', () => {
    const S1 = seg([40, -20, 0], [40, 30, 0]);
    const S2 = seg([45, -20, 0], [45, 30, 0]);
    const [x, y] = at([40, 0, 0]);
    const r = axisEdgeSnap(f, A, [S2, S1], x + 2, y + 1, 10)!;
    expect(r.p).toEqual([40, 0, 0]);
    expect(r.axis).toBe('x');
    expect(r.direction).toEqual([1, 0, 0]);
    expect(r.seg).toBe(S1);
    expect(r.distPx).toBeCloseTo(Math.hypot(2, 1), 9);
    expect(r).not.toHaveProperty('from');
    // Y·Z축도
    const S3 = seg([-30, 25, 0], [30, 25, 0]);
    const [x3, y3] = at([0, 25, 0]);
    expect(axisEdgeSnap(f, A, [S3], x3 + 1, y3 + 2, 10)).toMatchObject({ p: [0, 25, 0], axis: 'y', direction: [0, 1, 0] });
    const S4 = seg([-10, 0, 30], [10, 0, 30]);
    const [x4, y4] = at([0, 0, 30]);
    // S4는 X축과 나란하다 — Z축하고만 만난다
    expect(axisEdgeSnap(f, A, [S4], x4 + 2, y4 + 1, 10)).toMatchObject({ p: [0, 0, 30], axis: 'z', direction: [0, 0, 1] });
    // 멀면 없다
    expect(axisEdgeSnap(f, A, [S1], x + 30, y, 10)).toBeNull();
    // 선분이 없으면 없다
    expect(axisEdgeSnap(f, A, [], x + 2, y + 1, 10)).toBeNull();
  });

  it('비켜 지나가는 선분·선분 끝점·축과 나란한 선분·첫 점을 지나는 선분·단면에 잘린 쪽·가린 점은 뺀다', () => {
    const [x, y] = at([40, 0, 0]);
    // 높이 3 차(비켜 지나간다)
    expect(axisEdgeSnap(f, A, [seg([40, -20, 3], [40, 30, 3])], x + 2, y + 1, 10)).toBeNull();
    // 교차가 선분 끝점
    expect(axisEdgeSnap(f, A, [seg([40, 0, 0], [40, 30, 0])], x + 2, y + 1, 10)).toBeNull();
    // X축과 나란한(같은 직선 위) 선분
    expect(axisEdgeSnap(f, A, [seg([20, 0, 0], [60, 0, 0])], x + 2, y + 1, 10)).toBeNull();
    // 첫 점을 지나는 선분(교차가 첫 점 자리) — 커서는 그 선분 위 먼 곳
    const [dx, dy] = at([30, 30, 0]);
    expect(axisEdgeSnap(f, A, [seg([-20, -20, 0], [40, 40, 0])], dx + 1, dy + 1, 10)).toBeNull();
    // 단면
    expect(axisEdgeSnap(f, A, [seg([40, -20, 0], [40, 30, 0], (q) => q[2]! >= 0)], x + 2, y + 1, 10)).not.toBeNull();
    expect(axisEdgeSnap(f, A, [seg([40, -20, 0], [40, 30, 0], (q) => q[0]! < 20)], x + 2, y + 1, 10)).toBeNull();
    // 가림: 지금 고른 것보다 가까운 후보에만 묻는다
    const asked: V3[] = [];
    const S1 = seg([40, -20, 0], [40, 30, 0]);
    expect(
      axisEdgeSnap(f, A, [S1], x + 2, y + 1, 10, null, (q) => {
        asked.push(q);
        return false;
      }),
    ).toBeNull();
    expect(asked).toEqual([[40, 0, 0]]);
  });

  it('커서가 첫 점의 화면 자리 둘레(붙잡기 거리)면 없다 — 세 축이 모두 지나는 곳', () => {
    // 첫 점 바로 옆 선분(X축과 (3, 0, 0)에서 만난다)
    const S = seg([3, -20, 0], [3, 20, 0]);
    const [x, y] = at([3, 0, 0]);
    const [ax, ay] = at(A);
    expect(Math.hypot(x - ax, y - ay)).toBeLessThan(25);
    expect(axisEdgeSnap(f, A, [S], x + 1, y + 1, 25)).toBeNull();
    expect(axisEdgeSnap(f, A, [S], x + 1, y + 1, 3)).toMatchObject({ p: [3, 0, 0] });
  });

  it('여러 선분이면 커서에 가까운 것, 같으면 축 차례 → 선분 차례', () => {
    const S1 = seg([40, -20, 0], [40, 30, 0]);
    const S3 = seg([-30, 25, 0], [30, 25, 0]);
    const [x, y] = at([0, 25, 0]);
    expect(axisEdgeSnap(f, A, [S1, S3], x + 1, y + 2, 10)).toMatchObject({ axis: 'y', seg: S3 });
    // 같은 자리 두 선분(같은 교차점)이면 앞 선분
    const S1b = seg([40, -10, 0], [40, 40, 0]);
    const [x1, y1] = at([40, 0, 0]);
    expect(axisEdgeSnap(f, A, [S1b, S1], x1 + 2, y1 + 1, 10)!.seg).toBe(S1b);
  });

  it('앱의 그리기 축(세계 축과 다를 때): 그 축 방향 직선과 선분의 교차, 방향은 그 축 단위 방향', () => {
    const s = Math.SQRT1_2;
    const axes = { x: [1, 1, 0], y: [-1, 1, 0], z: [0, 0, 1] };
    // X′축(1, 1, 0) 방향이 x = 30 선분과 (30, 30, 0)에서
    const S = seg([30, -10, 0], [30, 50, 0]);
    const [x, y] = at([30, 30, 0]);
    const r = axisEdgeSnap(f, A, [S], x + 2, y + 1, 10, axes)!;
    expect(r.axis).toBe('x');
    expect(dist(r.p, [30, 30, 0])).toBeLessThan(1e-9);
    expect(dist(r.direction, [s, s, 0])).toBeLessThan(1e-12);
    // 세계 축으로는 그 자리에 교차가 없다
    expect(axisEdgeSnap(f, A, [S], x + 2, y + 1, 10)).toBeNull();
  });
});

describe('acceptOnLine·다듬기 입력의 축 직선·normalizeInference.axisEdges', () => {
  const iso = dirToAngles([1, -1, 0.8]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
  const line = { origin: [5, -7, 3] as V3, dir: [1, 0, 0] as V3 };

  it('앱 점을 축 직선 위로 내린 자리(세계 축이면 남은 두 좌표가 지나는 점과 정확히 같다)', () => {
    const core: V3 = [40, -7, 3];
    const wpp = worldPerPixel(f, viewDepth(f, core));
    const p = acceptOnLine(f, core, [40.25, -7 + 0.2 * wpp, 3 - 0.1 * wpp], line, 10)!;
    expect(p[1]).toBe(-7);
    expect(p[2]).toBe(3);
    expect(p[0]).toBeCloseTo(40.25, 12);
    // 방향 길이는 상관없다
    expect(acceptOnLine(f, core, [40.25, -7, 3], { origin: line.origin, dir: [3, 0, 0] }, 10)).toEqual([40.25, -7, 3]);
  });

  it('축에서 화면 반 화소 넘게 벗어난 점·코어 점에서 붙잡기 거리 밖·수가 아닌 축은 버린다', () => {
    const core: V3 = [40, -7, 3];
    const wpp = worldPerPixel(f, viewDepth(f, core));
    expect(acceptOnLine(f, core, [40.2, -7 + 2 * wpp, 3], line, 10)).toBeNull();
    // 축 위지만 코어 점에서 멀다(화면 10화소 넘게)
    expect(acceptOnLine(f, core, [40 + 30 * wpp, -7, 3], line, 10)).toBeNull();
    expect(acceptOnLine(f, core, [40 + 3 * wpp, -7, 3], line, 10)).not.toBeNull();
    expect(acceptOnLine(f, core, [40.2, -7, 3], { origin: line.origin, dir: [0, 0, 0] }, 10)).toBeNull();
    expect(acceptOnLine(f, core, [40.2, -7, 3], { origin: [Number.NaN, 0, 0], dir: [1, 0, 0] }, 10)).toBeNull();
  });

  it('openRefineKey는 축 직선이 있으면 끝에 붙고(축·지나는 점·방향마다 다르다) 없으면 0.15.0 열쇠 그대로, sameRefineInput도 견준다', () => {
    const seg = { kind: 'line' as const, id: 's', index: 3, raw: 3, ends: [[0, 0, 0], [1, 0, 0]] as [V3, V3] };
    const base: SnapRefineInput = { kind: 'axisEdge', point: [1, 2, 3], segment: seg, first: [0, 0, 0], ray: { origin: [9, 9, 9], dir: [0, 0, -1] } };
    const withLine: SnapRefineInput = { ...base, line: { origin: [0, 0, 0], dir: [1, 0, 0], axis: 'x' } };
    expect(openRefineKey(withLine).startsWith(openRefineKey(base))).toBe(true);
    expect(openRefineKey(withLine)).not.toBe(openRefineKey(base));
    for (const l of [
      { origin: [0, 0, 1], dir: [1, 0, 0], axis: 'x' },
      { origin: [0, 0, 0], dir: [0, 1, 0], axis: 'x' },
      { origin: [0, 0, 0], dir: [1, 0, 0], axis: 'y' },
    ] as const)
      expect(openRefineKey({ ...base, line: { origin: [...l.origin] as V3, dir: [...l.dir] as V3, axis: l.axis } })).not.toBe(openRefineKey(withLine));
    // 커서 광선은 열쇠에 없다
    const moved: SnapRefineInput = { ...withLine, ray: { origin: [1, 1, 1], dir: [1, 0, 0] } };
    expect(openRefineKey(moved)).toBe(openRefineKey(withLine));
    expect(sameRefineInput(moved, withLine)).toBe(false);
    expect(sameRefineInput(withLine, { ...withLine, line: { origin: [0, 0, 0], dir: [1, 0, 0], axis: 'x' } })).toBe(true);
    expect(sameRefineInput(withLine, base)).toBe(false);
    expect(sameRefineInput(withLine, { ...withLine, line: { origin: [0, 0, 0], dir: [1, 0, 0], axis: 'z' } })).toBe(false);
  });

  it('normalizeInference: axisEdges는 켰을 때만 붙고(true에 들지 않는다), 그것만 켜도 선택이 남는다', () => {
    expect(normalizeInference(true)).not.toHaveProperty('axisEdges');
    expect(normalizeInference({ axes: true })).toEqual({ intersections: false, perpendicular: false, axes: true, parallel: false, lock: false });
    expect(normalizeInference({ axes: true, axisEdges: false })).not.toHaveProperty('axisEdges');
    expect(normalizeInference({ axisEdges: true })).toEqual({ intersections: false, perpendicular: false, axes: false, parallel: false, lock: false, axisEdges: true });
    expect(normalizeInference({ axes: true, axisEdges: true, track: true })).toMatchObject({ axes: true, axisEdges: true, track: { dwellMs: 500 } });
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
 * 장면: 첫 점 A = (0,0,0)('가'의 끝). 첫 점 X축이 '다'(x 100, 바닥 Y 방향 — 원본 번호 7)와 XE = (100, 0, 0)에서, Y축이 '사'(y 60, 바닥 X 방향)와
 * YE = (0, 60, 0)에서, Z축이 '자'(z 50, X 방향)와 ZE = (0, 0, 50)에서 만난다. '아'(x 60, 높이 5)는 X축 위를 비켜 지나간다
 */
const A: V3 = [0, 0, 0];
const XE: V3 = [100, 0, 0];
const YE: V3 = [0, 60, 0];
const ZE: V3 = [0, 0, 50];
const scene: Scene3d = {
  name: 't',
  units: 'mm',
  meshes: [],
  lines: [
    { id: '가', positions: new Float32Array([...A, 0, -20, 0]) },
    { id: '다', positions: new Float32Array([100, -30, 0, 100, 50, 0]), segmentIds: new Uint32Array([7]) },
    { id: '사', positions: new Float32Array([-40, 60, 0, 40, 60, 0]) },
    { id: '자', positions: new Float32Array([-20, 0, 50, 20, 0, 50]) },
    { id: '아', positions: new Float32Array([60, -30, 5, 60, 30, 5]) },
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
const ptr = (w: View, type: string, x: number, y: number, buttons: number, shiftKey = false): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const hoverXY = (w: View, x: number, y: number, shift = false): void => {
  ptr(w, 'pointermove', x, y, 0, shift);
  w.v.renderNow();
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
/** 화면에서 세계 점 p에서 q 쪽으로 n화소, 그 옆으로 0.5화소 옮긴 자리(선 위를 정확히 가리키지 않게) */
const toward = (w: View, p: readonly number[], q: readonly number[], n: number): { x: number; y: number } => {
  const a = at(w, p), b = at(w, q);
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / l, uy = (b.y - a.y) / l;
  return { x: a.x + ux * n - uy * 0.5, y: a.y + uy * n + ux * 0.5 };
};
const EDGES = { inference: { axes: true, lock: true, axisEdges: true } } as const;
/** 첫 점을 찍은 뷰어(측정 모드, 붙잡기 선택 o) */
function withFirst(o: Parameters<Viewer3d['setMeasureSnap']>[0]): View {
  const w = view();
  w.v.setMeasureMode(true);
  w.v.setMeasureSnap(o);
  clickAt(w, A, 0, 1);
  expect(w.v.measurePoints[0]!.point).toEqual(A);
  return w;
}

describe('Viewer3d: 첫 점 축과 선분의 교차(0.18.0)', () => {
  it('첫 점 X축이 선분과 만나는 자리에 붙고 방향·선분 식별자가 실린다. 두 점째로 찍으면 결과는 X축 붙잡기', () => {
    const w = withFirst(EDGES);
    const { v } = w;
    const got: { distance: number; snapB: unknown; axisB: unknown; directionB?: unknown; dy: number; dz: number }[] = [];
    v.onMeasure((m) => m && got.push(m as never));
    const c = toward(w, XE, [100, 40, 0], 3);
    hoverXY(w, c.x, c.y);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h.axis).toBe('x');
    expect(h.point).toEqual(XE);
    expect(h.direction).toEqual([1, 0, 0]);
    expect(h.segment).toEqual({ kind: 'line', id: '다', index: 7, raw: 0, ends: [[100, -30, 0], [100, 50, 0]] });
    expect(h).not.toHaveProperty('trackFrom');
    expect(h).not.toHaveProperty('refined');
    expect(v.measureHoverLock).toEqual({ kind: 'axis', axis: 'x', direction: [1, 0, 0] });
    clickXY(w, c.x, c.y);
    const m = got.at(-1)!;
    expect(m.distance).toBe(100);
    expect([m.snapB, m.axisB, m.directionB, m.dy, m.dz]).toEqual(['axis', 'x', [1, 0, 0], 0, 0]);
    expect(v.measurePoints[1]).toMatchObject({ point: XE, snap: 'axis', axis: 'x', direction: [1, 0, 0], segment: { id: '다', index: 7 } });
    v.dispose();
  });

  it('Y·Z축도 — 그 선분 식별자와 방향', () => {
    const w = withFirst(EDGES);
    const { v } = w;
    const c = toward(w, YE, [30, 60, 0], 3);
    hoverXY(w, c.x, c.y);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'y', point: YE, direction: [0, 1, 0], segment: { id: '사' } });
    const c2 = toward(w, ZE, [20, 0, 50], 3);
    hoverXY(w, c2.x, c2.y);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'z', point: ZE, direction: [0, 0, 1], segment: { id: '자' } });
    v.dispose();
  });

  it('Shift를 누르면 그 축으로 잠근다(잠근 동안에는 X축 위 커서 자리)', () => {
    const w = withFirst(EDGES);
    const { v } = w;
    const c = toward(w, XE, [100, 40, 0], 3);
    hoverXY(w, c.x, c.y);
    hoverXY(w, c.x, c.y, true);
    expect(v.measureInferenceLock).toMatchObject({ kind: 'axis', axis: 'x', direction: [1, 0, 0], source: 'shift' });
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.point[1]).toBe(0);
    expect(h.point[2]).toBe(0);
    expect(h).not.toHaveProperty('segment');
    hoverXY(w, c.x, c.y, false);
    expect(v.measureInferenceLock).toBeNull();
    v.dispose();
  });

  it('꺼져 있으면(axes만) 0.17.0과 같다 — 같은 자리는 첫 점 X축 위 커서 자리이고 선분 식별자가 없다', () => {
    const rows: unknown[] = [];
    for (const o of [{ inference: { axes: true, lock: true } }, { inference: { axes: true, lock: true, axisEdges: false } }] as const) {
      const w = withFirst(o);
      const { v } = w;
      expect(v.measureSnap!.inference).not.toHaveProperty('axisEdges');
      const c = toward(w, XE, [100, 40, 0], 3);
      hoverXY(w, c.x, c.y);
      const h = v.measureHoverSnap!;
      expect(h.snap).toBe('axis');
      expect(h.axis).toBe('x');
      expect(h).not.toHaveProperty('segment');
      expect(h.point).not.toEqual(XE);
      rows.push(h);
      v.dispose();
    }
    expect(rows[1]).toEqual(rows[0]);
  });

  it('차례: 점 붙잡기(앱 점)가 먼저, 비켜 지나가는 선분은 교차가 없다', () => {
    const w = withFirst({ ...EDGES, points: [{ point: [100, 2, 0] }] });
    const { v } = w;
    const c = toward(w, XE, [100, 40, 0], 3);
    hoverXY(w, c.x, c.y);
    expect(v.measureHoverSnap!.snap).toBe('point');
    v.setMeasureSnap(EDGES);
    v.clearMeasure();
    clickAt(w, A, 0, 1);
    expect(v.measurePoints.map((q) => q.point)).toEqual([A]);
    // '아'(높이 5)가 X축과 화면에서 엇갈리는 자리 둘레: 교차가 아니라 첫 점 X축 위 커서 자리
    const a0 = at(w, A), a1 = at(w, [100, 0, 0]), b0 = at(w, [60, -30, 5]), b1 = at(w, [60, 30, 5]);
    const ux = a1.x - a0.x, uy = a1.y - a0.y, vx = b1.x - b0.x, vy = b1.y - b0.y;
    const t = ((b0.x - a0.x) * vy - (b0.y - a0.y) * vx) / (ux * vy - uy * vx);
    hoverXY(w, a0.x + ux * t + 1, a0.y + uy * t + 1);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('axis');
    expect(h).not.toHaveProperty('segment');
    v.dispose();
  });

  it('끌어온 점 후보와 함께: 같은 점이면 끌어온 축 교차(앞 차례)가 남는다', () => {
    const w = withFirst({ inference: { axes: true, lock: true, track: true, axisEdges: true } });
    const { v } = w;
    // 끌어온 점 T = (40, 0, 0)은 첫 점 X축 위 — T의 X축과 '다'의 교차가 곧 첫 점 X축과 '다'의 교차
    v.setMeasureTrackPoints([[40, 0, 0]]);
    const c = toward(w, XE, [100, 40, 0], 3);
    hoverXY(w, c.x, c.y);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x', point: XE, direction: [1, 0, 0], trackFrom: [40, 0, 0], segment: { id: '다' } });
    // 끌어온 점이 없으면 첫 점 축 교차
    v.setMeasureTrackPoints(null);
    hoverXY(w, c.x, c.y);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'axis', axis: 'x', point: XE, direction: [1, 0, 0], segment: { id: '다' } });
    expect(h).not.toHaveProperty('trackFrom');
    v.dispose();
  });

  it('그리기: 첫 점에서 교차 자리까지 X축 색 안내선과 축 색 동그라미', () => {
    const w = withFirst(EDGES);
    const { v } = w;
    const c = toward(w, XE, [100, 40, 0], 3);
    strokes = [];
    hoverXY(w, c.x, c.y);
    const a = at(w, A), e = at(w, XE);
    const near = (p: [number, number], q: { x: number; y: number }): boolean => Math.hypot(p[0] - q.x, p[1] - q.y) < 1e-6;
    const guide = strokes.find((s) => s.pts.length === 2 && near(s.pts[0]!, a) && near(s.pts[1]!, e));
    expect(guide?.style).toBe(DARK_THEME.axisX);
    expect(guide?.dash).toEqual([6, 4]);
    v.dispose();
  });
});

describe('Viewer3d: 축과 선분의 교차 다듬기(0.18.0 refine — axisEdge)', () => {
  it('축 직선을 넘기고, 앱 점을 축 위로 내린 자리를 찍는다(refined). 결과는 커서 광선을 뺀 입력으로 기억한다', () => {
    const calls: SnapRefineInput[] = [];
    const w = withFirst({
      ...EDGES,
      refine: (c) => {
        calls.push(c);
        // 앱 곡선과 X축의 교차(축에서 아주 조금 — 셈 오차만큼 — 벗어난 값)
        return c.kind === 'axisEdge' ? [c.point[0] + 0.3, c.point[1] + 1e-12, c.point[2] - 1e-12] : null;
      },
    });
    const { v } = w;
    const got: { distance: number; dy: number; dz: number }[] = [];
    v.onMeasure((m) => m && got.push(m as never));
    const c = toward(w, XE, [100, 40, 0], 3);
    hoverXY(w, c.x, c.y);
    const ae = calls.filter((k) => k.kind === 'axisEdge');
    expect(ae).toHaveLength(1);
    expect(ae[0]).toMatchObject({ kind: 'axisEdge', point: XE, first: A, line: { origin: A, dir: [1, 0, 0], axis: 'x' }, segment: { id: '다', index: 7 } });
    expect(ae[0]!.ray.dir).toHaveLength(3);
    const h = v.measureHoverSnap!;
    expect(h.point).toEqual([100.3, 0, 0]);
    expect(h.refined).toBe(true);
    expect(h).toMatchObject({ snap: 'axis', axis: 'x', direction: [1, 0, 0], segment: { id: '다' } });
    // 커서를 그 둘레에서 옮겨도(같은 코어 점·토막·축) 다시 부르지 않는다
    const c2 = toward(w, XE, [100, 40, 0], 5);
    hoverXY(w, c2.x, c2.y);
    expect(calls.filter((k) => k.kind === 'axisEdge')).toHaveLength(1);
    clickXY(w, c2.x, c2.y);
    expect(calls.filter((k) => k.kind === 'axisEdge')).toHaveLength(1);
    const m = got.at(-1)!;
    expect(m.distance).toBeCloseTo(100.3, 12);
    expect([m.dy, m.dz]).toEqual([0, 0]);
    expect(v.measurePoints[1]).toMatchObject({ point: [100.3, 0, 0], refined: true, snap: 'axis', axis: 'x' });
    v.dispose();
  });

  it('null·축에서 벗어난 점(모서리 위 점처럼 푼 값)·먼 점은 버리고 코어 점 그대로 — refine 없이와 같다', () => {
    const plain = withFirst(EDGES);
    const c = toward(plain, XE, [100, 40, 0], 3);
    hoverXY(plain, c.x, c.y);
    const want = plain.v.measureHoverSnap;
    plain.v.dispose();
    expect(want).toMatchObject({ point: XE });
    for (const refine of [() => null, () => [100, 4, 0], () => [180, 0, 0], () => [Number.NaN, 0, 0], () => 'x' as never]) {
      const w = withFirst({ ...EDGES, refine });
      hoverXY(w, c.x, c.y);
      expect(w.v.measureHoverSnap).toEqual(want);
      w.v.dispose();
    }
  });

  it('잠근 동안에는 부르지 않는다', () => {
    let n = 0;
    const w = withFirst({
      ...EDGES,
      refine: (c) => {
        if (c.kind === 'axisEdge') n++;
        return null;
      },
    });
    const { v } = w;
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    const c = toward(w, XE, [100, 40, 0], 3);
    hoverXY(w, c.x, c.y);
    expect(v.measureHoverSnap!.locked).toBe(true);
    expect(n).toBe(0);
    v.dispose();
  });

  it('끌어온 축과 선분의 교차도 그 끌어온 점을 지나는 축 직선으로 넘긴다', () => {
    const calls: SnapRefineInput[] = [];
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({
      inference: { axes: true, track: true },
      refine: (c) => {
        calls.push(c);
        return c.kind === 'axisEdge' ? [c.point[0] + 0.3, c.point[1], c.point[2]] : null;
      },
    });
    // 첫 점 전 — 끌어온 점 P(50, 40, 0)의 X축이 '다'와 (100, 40, 0)에서
    const P: V3 = [50, 40, 0];
    v.setMeasureTrackPoints([P]);
    const X: V3 = [100, 40, 0];
    const c = toward(w, X, [100, 10, 0], 3);
    hoverXY(w, c.x, c.y);
    const ae = calls.filter((k) => k.kind === 'axisEdge');
    expect(ae).toHaveLength(1);
    expect(ae[0]).toMatchObject({ point: X, first: null, line: { origin: P, dir: [1, 0, 0], axis: 'x' }, segment: { id: '다' } });
    // 앱 점은 끌어온 X축(y 40, z 0) 위 — 그 자리를 찍는다
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x', point: [100.3, 40, 0], refined: true, trackFrom: P, segment: { id: '다' } });
    clickXY(w, c.x, c.y);
    expect(v.measurePoints[0]).toMatchObject({ point: [100.3, 40, 0], refined: true, trackFrom: P });
    v.dispose();
  });
});
