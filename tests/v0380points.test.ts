/**
 * 0.38.0 pointsFor의 첫 점(STEP 43차 요청 (a))과 접점 붙잡기 종류(요청 (b)).
 * STEP 43차는 측정 첫 점에서 곡선에 그은 접선이 닿는 점(접점)을 앱 점 pointsFor로 주는데, 코어는 같은 고르기면 앞 pointsFor 결과를 다시 쓰므로(0.10.0 기억 —
 * 비우는 길은 setMeasureSnap뿐이고 그러면 잠금·끌어온 점이 풀린다) 앱이 첫 점이 바뀔 때마다 세대를 올려 SnapPoint.order·setMeasureSnapLimit로 앞 첫 점의 접점을 걸렀다.
 * - pointsFor 둘째 인자 ctx.first(측정 첫 점 — 복사본)를 늘 넘긴다. pointsForFirst를 켜면 기억 열쇠에 첫 점이 들어 첫 점을 찍거나 지우면 같은 고르기도 다시 부른다
 * - 끄면 0.37.0과 같다(첫 점이 바뀌어도 같은 고르기면 앞 결과 — 부른 횟수도 같다)
 * - clearMeasurePointsFor: pointsFor 기억만 비운다(잠금·끌어온 점·찍은 점은 그대로)
 * - SnapKind 'tangent': 앱 점에 달면 미리 보기·측정 결과에 그대로 실리고, 표식은 동그라미 테 + 꼭대기 가로선(다른 종류의 그림은 그대로)
 * 장면: z = 0 평면의 48토막 원 꺾은선(반지름 10, 선분 묶음)과 앱 점 F1 (30, 0, 0)·F2 (0, −25, 0). 앱 pointsFor = 첫 점에서 정확한 원에 그은 접선의 접점(kind 'tangent').
 * 화면 좌표로 가리킬 때는 점을 정확히 가리키지 않고 몇 분의 일 화소 옆을 가리킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeElement, installDom } from './fakedom';
import { fake2d } from './fakegl';
import { type MeasureSnapOptions, type PointsForContext, Viewer3d } from '../src/viewer';
import { sameFirst } from '../src/snap';
import type { V3 } from '../src/math';
import type { LineSet3d, Pick3d, Scene3d, SnapPoint } from '../src/types';

const R = 10, N = 48;
function circle(): LineSet3d {
  const P: number[] = [];
  for (let k = 0; k < N; k++) {
    const a = (2 * Math.PI * k) / N + 0.01, b = (2 * Math.PI * (k + 1)) / N + 0.01;
    P.push(R * Math.cos(a), R * Math.sin(a), 0, R * Math.cos(b), R * Math.sin(b), 0);
  }
  return { id: '원', name: '원', positions: new Float32Array(P), color: [0.9, 0.9, 0.9, 1] };
}
const F1: V3 = [30, 0, 0];
const F2: V3 = [0, -25, 0];
const scene: Scene3d = { name: 'tan', units: 'mm', meshes: [], lines: [circle()], points: [] };
/** 점 F에서 원(중심 원점·반지름 R, z = 0)에 그은 접선의 두 접점 */
function tangentsFrom(F: readonly number[]): V3[] {
  const d = Math.hypot(F[0]!, F[1]!);
  if (!(d > R)) return [];
  const ux = F[0]! / d, uy = F[1]! / d;
  const a = (R * R) / d, h = (R * Math.sqrt(d * d - R * R)) / d;
  return [
    [ux * a - uy * h, uy * a + ux * h, 0],
    [ux * a + uy * h, uy * a - ux * h, 0],
  ];
}

/** 2D 문맥마다 arc·moveTo·lineTo(그때의 strokeStyle)를 적는다 */
const logs: unknown[][][] = [];
function rec2d(): CanvasRenderingContext2D {
  const log: unknown[][] = [];
  logs.push(log);
  const base = fake2d() as unknown as Record<string | symbol, unknown>;
  return new Proxy(base, {
    get: (t, k) => (k === 'arc' || k === 'moveTo' || k === 'lineTo' || k === 'rect' ? (...a: unknown[]) => void log.push([k, t.strokeStyle, ...a]) : t[k]),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const orig = FakeElement.prototype.getContext;
  vi.spyOn(FakeElement.prototype, 'getContext').mockImplementation(function (this: FakeElement, type: string) {
    return type === '2d' ? rec2d() : orig.call(this, type);
  });
});
afterAll(() => {
  for (const v of views) v.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
  dom.restore();
});

const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as FakeElement).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const scr = (v: Viewer3d, p: readonly number[]): [number, number] => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return [s.x, s.y];
};
const hover = (v: Viewer3d, p: readonly number[]): void => {
  const [x, y] = scr(v, p);
  ptr(v, 'pointermove', x + 0.31, y + 0.17, 0);
  v.renderNow();
};
const click = (v: Viewer3d, p: readonly number[]): void => {
  const [x, y] = scr(v, p);
  ptr(v, 'pointermove', x + 0.31, y + 0.17, 0);
  v.renderNow();
  ptr(v, 'pointerdown', x + 0.31, y + 0.17, 1);
  ptr(v, 'pointerup', x + 0.31, y + 0.17, 0);
  v.renderNow();
};
const near = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

/** 앱 pointsFor(접점 — 첫 점이 있고 원을 골랐을 때만)와 부른 기록 */
function tangentApp(): { pointsFor: (pick: Pick3d, ctx?: PointsForContext) => SnapPoint[] | null; calls: { pick: Pick3d; first: V3 | null }[] } {
  const calls: { pick: Pick3d; first: V3 | null }[] = [];
  return {
    calls,
    pointsFor: (pick, ctx) => {
      const first = ctx?.first ?? null;
      calls.push({ pick, first: first ? [first[0], first[1], first[2]] : null });
      if (pick.kind !== 'line' || !first) return null;
      return tangentsFrom(first).map((point) => ({ point, kind: 'tangent' as const, id: '원' }));
    },
  };
}
function make(o: Partial<MeasureSnapOptions>): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [5, -5, 0], distance: 120 });
  v.setMeasureMode(true);
  v.setMeasureSnap({ points: [F1, F2].map((point) => ({ point, kind: 'point' as const })), inference: { intersections: true, perpendicular: true, axes: true }, ...o });
  v.renderNow();
  return v;
}

describe('sameFirst(0.38.0 — pointsForFirst 기억 열쇠)', () => {
  it('둘 다 없거나 세 좌표가 같으면 같다(배열 객체가 달라도)', () => {
    expect(sameFirst(null, null)).toBe(true);
    expect(sameFirst([1, 2, 3], null)).toBe(false);
    expect(sameFirst(null, [1, 2, 3])).toBe(false);
    expect(sameFirst([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(sameFirst([1, 2, 3], [1, 2, 3.0000001])).toBe(false);
    expect(sameFirst([0, -0, 5], [0, 0, 5])).toBe(true);
  });
});

describe('Viewer3d pointsFor 둘째 인자와 pointsForFirst(0.38.0 — STEP 43차 요청 (a))', () => {
  const T1 = tangentsFrom(F1)[0]!;

  it('켜면 첫 점을 찍은 뒤 같은 고르기도 다시 불러 그 첫 점의 접점에 붙는다 — 찍은 결과 snapB = tangent', () => {
    const app = tangentApp();
    const v = make({ pointsFor: app.pointsFor, pointsForFirst: true });
    // 첫 점 전: 같은 자리 원 위(접점 자리) — 앱은 첫 점이 없어 아무것도 주지 않는다
    hover(v, T1);
    expect(app.calls.length).toBe(1);
    expect(app.calls[0]!.first).toBeNull();
    expect(v.measureHoverSnap?.snap).not.toBe('tangent');
    click(v, F1);
    expect(v.measurePointCount).toBe(1);
    // 첫 점을 찍은 뒤 같은 자리: 고르기는 같아도 첫 점이 바뀌었으니 다시 부른다(ctx.first = F1)
    const before = app.calls.length;
    hover(v, T1);
    const mine = app.calls.slice(before).filter((c) => c.pick.kind === 'line');
    expect(mine.length).toBe(1);
    expect(mine[0]!.first).toEqual(F1);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('tangent');
    expect(near(h.point, T1)).toBeLessThan(1e-9);
    // 같은 첫 점·같은 자리 미리 보기 뒤 누르기는 앞 결과를 다시 쓴다(0.10.0 그대로)
    const n = app.calls.length;
    const [x, y] = scr(v, T1);
    ptr(v, 'pointerdown', x + 0.31, y + 0.17, 1);
    ptr(v, 'pointerup', x + 0.31, y + 0.17, 0);
    v.renderNow();
    expect(app.calls.length).toBe(n);
    const m = v.measurement()!;
    expect(m.snapA).toBe('point');
    expect(m.snapB).toBe('tangent');
    expect(near(m.b, T1)).toBeLessThan(1e-9);
  });

  it('켜면 Esc(측정 지우기) 뒤 같은 자리는 첫 점이 없어 접점이 없다 — 끄면 앞 첫 점의 접점을 다시 쓴다(0.37.0과 같다: STEP이 세대로 거르던 자리)', () => {
    for (const on of [true, false]) {
      const app = tangentApp();
      const v = make({ pointsFor: app.pointsFor, ...(on ? { pointsForFirst: true } : {}) });
      click(v, F1);
      hover(v, T1);
      expect(v.measureHoverSnap?.snap, `${on}`).toBe('tangent');
      const n = app.calls.length;
      v.clearMeasure();
      hover(v, T1);
      if (on) {
        expect(app.calls.length, `${on}`).toBe(n + 1);
        expect(app.calls[n]!.first, `${on}`).toBeNull();
        expect(v.measureHoverSnap?.snap, `${on}`).not.toBe('tangent');
      } else {
        // 0.37.0 기억: 같은 고르기라 부르지 않고 앞 결과(앞 첫 점 F1의 접점)를 그대로 쓴다
        expect(app.calls.length, `${on}`).toBe(n);
        expect(v.measureHoverSnap?.snap, `${on}`).toBe('tangent');
      }
    }
  });

  it('켜면 다른 첫 점(F2)을 찍고 같은 자리를 가리키면 그 첫 점의 접점으로 다시 구한다', () => {
    const app = tangentApp();
    const v = make({ pointsFor: app.pointsFor, pointsForFirst: true });
    click(v, F1);
    hover(v, T1);
    expect(v.measureHoverSnap?.snap).toBe('tangent');
    v.clearMeasure();
    click(v, F2);
    hover(v, T1);
    const last = app.calls[app.calls.length - 1]!;
    expect(last.first).toEqual(F2);
    // F2의 접점은 T1에서 멀다 — T1 자리에서는 접점에 붙지 않는다
    expect(v.measureHoverSnap?.snap).not.toBe('tangent');
    const T2 = tangentsFrom(F2)[1]!;
    hover(v, T2);
    expect(v.measureHoverSnap?.snap).toBe('tangent');
    expect(near(v.measureHoverSnap!.point, T2)).toBeLessThan(1e-9);
  });

  it('ctx.first는 복사본이다(앱이 바꿔도 찍은 점이 그대로) — 끈 앱에도 늘 넘긴다', () => {
    const seen: (V3 | null)[] = [];
    const v = make({
      pointsFor: (_p, ctx) => {
        seen.push(ctx ? ctx.first : null);
        if (ctx?.first) ctx.first[0] = 999;
        return null;
      },
    });
    click(v, F1);
    hover(v, T1);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((s) => s !== null)).toBe(true);
    expect(v.measurePoints[0]!.point).toEqual(F1);
  });

  it('끄면 부른 횟수가 0.37.0 규칙 그대로다(첫 점이 바뀌어도 같은 고르기면 다시 쓴다 — 고르기가 바뀔 때만 부른다)', () => {
    const app = tangentApp();
    const v = make({ pointsFor: app.pointsFor });
    hover(v, T1);
    expect(app.calls.length).toBe(1);
    click(v, F1);
    hover(v, T1);
    // F1 위 고르기는 원이 아니다(앱 점) — 원 고르기는 처음 하나 그대로 다시 쓴다
    expect(app.calls.filter((c) => c.pick.kind === 'line').length).toBe(1);
  });

  it('setMeasureSnap마다 새로(pointsForFirst도 다시 정한다) — measureSnap에 그대로 실린다', () => {
    const app = tangentApp();
    const v = make({ pointsFor: app.pointsFor, pointsForFirst: true });
    expect(v.measureSnap?.pointsForFirst).toBe(true);
    v.setMeasureSnap({ pointsFor: app.pointsFor });
    expect(v.measureSnap?.pointsForFirst).toBeUndefined();
  });
});

describe('Viewer3d.clearMeasurePointsFor(0.38.0)', () => {
  const T1 = tangentsFrom(F1)[0]!;
  it('pointsFor 기억만 비우고 그 자리에서 다시 구한다 — 잠금·찍은 점·끌어온 점은 그대로, 비운 것이 있었는지 돌려준다', () => {
    let gen = 0;
    const calls: number[] = [];
    const v = make({
      pointsFor: (pick) => {
        calls.push(gen);
        return pick.kind === 'line' ? [{ point: gen ? tangentsFrom(F1)[0]! : [0, 0, 0], kind: 'tangent' as const }] : null;
      },
      inference: { intersections: true, perpendicular: true, axes: true, lock: true, track: true },
    });
    expect(v.clearMeasurePointsFor()).toBe(false);
    click(v, F1);
    expect(v.setMeasureTrackPoints([[0, 20, 0]])).toBe(1);
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    expect(v.setMeasureInferenceLock(false)).toBe(false);
    hover(v, T1);
    expect(v.measureHoverSnap?.snap).not.toBe('tangent');
    const n = calls.length;
    // 앱 자료가 바뀌었다(접점을 알게 됐다) — 기억만 비우면 같은 자리에서 다시 부른다
    gen = 1;
    expect(v.clearMeasurePointsFor()).toBe(true);
    v.renderNow();
    expect(calls.length).toBe(n + 1);
    expect(v.measureHoverSnap?.snap).toBe('tangent');
    expect(v.measurePointCount).toBe(1);
    expect(v.measureTrackPoints.length).toBe(1);
    // 잠금도 풀리지 않는다
    expect(v.setMeasureInferenceLock('y')).toBe(true);
    expect(v.clearMeasurePointsFor()).toBe(true);
    expect(v.measureInferenceLock?.axis).toBe('y');
    v.setMeasureSnap(null);
    expect(v.clearMeasurePointsFor()).toBe(false);
  });
});

describe('SnapKind tangent 표식(0.38.0 — STEP 43차 요청 (b))', () => {
  const T1 = tangentsFrom(F1)[0]!;
  it('동그라미 테(반지름 6)와 꼭대기에 닿는 가로선(±10) — 바탕 테 위 측정 색, 점은 동그라미 가운데', () => {
    const app = tangentApp();
    const v = make({ pointsFor: app.pointsFor, pointsForFirst: true });
    click(v, F1);
    for (const l of logs) l.length = 0;
    hover(v, T1);
    expect(v.measureHoverSnap?.snap).toBe('tangent');
    const [x, y] = scr(v, v.measureHoverSnap!.point);
    const hits = logs.flatMap((log) =>
      log.flatMap((e, i) => {
        if (e[0] !== 'arc' || Math.abs((e[2] as number) - x) > 1e-6 || Math.abs((e[3] as number) - y) > 1e-6 || e[4] !== 6) return [];
        const m = log[i + 1], l = log[i + 2];
        return m && l && m[0] === 'moveTo' && l[0] === 'lineTo' && Math.abs((m[2] as number) - (x - 10)) < 1e-6 && Math.abs((m[3] as number) - (y - 6)) < 1e-6 && Math.abs((l[2] as number) - (x + 10)) < 1e-6 && Math.abs((l[3] as number) - (y - 6)) < 1e-6
          ? [e[1]]
          : [];
      }),
    );
    // 바탕 테 한 번, 측정 색 한 번
    expect(hits.length).toBe(2);
    expect(hits[0]).not.toBe(hits[1]);
  });

  it('같은 점을 kind point(마름모)로 주면 그 표식 그대로다(다른 종류의 그림은 바뀌지 않는다)', () => {
    const v = make({ pointsFor: (pick, ctx) => (pick.kind === 'line' && ctx?.first ? tangentsFrom(ctx.first).map((point) => ({ point, kind: 'point' as const })) : null), pointsForFirst: true });
    click(v, F1);
    for (const l of logs) l.length = 0;
    hover(v, T1);
    expect(v.measureHoverSnap?.snap).toBe('point');
    const [x, y] = scr(v, v.measureHoverSnap!.point);
    const flat = logs.flat();
    expect(flat.some((e) => e[0] === 'arc' && e[4] === 6 && Math.abs((e[2] as number) - x) < 1e-6 && Math.abs((e[3] as number) - y) < 1e-6)).toBe(false);
    // 마름모 꼭대기(x, y − 6)에서 시작해 오른쪽(x + 6, y)으로
    expect(flat.some((e, i) => e[0] === 'moveTo' && Math.abs((e[2] as number) - x) < 1e-6 && Math.abs((e[3] as number) - (y - 6)) < 1e-6 && flat[i + 1]?.[0] === 'lineTo' && Math.abs((flat[i + 1]![2] as number) - (x + 6)) < 1e-6)).toBe(true);
  });
});
