/**
 * 0.38.0 현을 얕게 가로지르는 선의 닫힌 선분 교차 다듬기 넓힌 받기(track.ts acceptEdgePatch — 37차 남은 꼴):
 * 축·끌어온 축·잠근 선·끌어온 점 안내 선이 곡선을 나눈 꺾은선 토막(현)과 3D로 만나는 자리(코어 교차 X)가 커서에서 붙잡기 거리 안이면 코어는 X(현 위)를 고르고
 * 앱 refine('axisEdge')에 그 선·그 토막을 넘기는데, 앱이 준 곡선 위 교점 Q가 X에서 화면 붙잡기 거리 밖이면(0.18.0 acceptOnLine) 받지 않아 현 위 X 그대로 "모서리 위"였다
 * (0.37.0 acceptFacePatch가 고친 면 교차와 같은 꼴). 이제 Q가 그 선 위·그 토막 곡선 조각 자리·커서에서 붙잡기 거리 안이면 받는다(열린 교차와 같은 규칙).
 * - 순수: acceptEdgePatch(받는 자리·커서에서 멀면·선 밖·다른 근·이웃 토막 활꼴·토막 끝·지나는 점)
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 꺾은선 원(반지름 30·50토막, z = 0)에 칸 반각의 4.4배로 스치는 첫 점 X축·끌어온 점 X축·잠근 X축·끌어온 점 안내 선(27°)에서
 *   X와 Q 사이를 가리키면 원 위·그 선 위 다듬은 교차, refine이 null이면 X 그대로, Q 둘레 화면 격자의 남은 다듬지 않은 현 위 점은 모두 Q가 커서에서 붙잡기 거리 밖
 * 화면 좌표로 가리킬 때는 선·점을 정확히 가리키지 않고 몇 분의 일 화소 옆을 가리킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { acceptEdgePatch } from '../src/track';
import { acceptOnLine } from '../src/snap';
import { type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { LineSet3d, Scene3d } from '../src/types';

const D = Math.PI / 180;
const SNAP = 10;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const mul = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const norm = (a: readonly number[]): V3 => mul(a, 1 / Math.hypot(a[0]!, a[1]!, a[2]!));
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

const R = 30, N = 50, HS = Math.PI / N;
/** 꺾은선 원(중심 원점, z = 0, 토막 0의 가운데 각 phi0) — 토막 k는 [phi0 − HS + 2HS·k, phi0 + HS + 2HS·k] */
function ring(phi0: number): LineSet3d {
  const P: number[] = [];
  for (let k = 0; k < N; k++) {
    const a = phi0 - HS + 2 * HS * k, b = a + 2 * HS;
    P.push(R * Math.cos(a), R * Math.sin(a), 0, R * Math.cos(b), R * Math.sin(b), 0);
  }
  return { id: '원', name: '원', positions: new Float32Array(P), color: [0.9, 0.9, 0.9, 1] };
}
const segOf = (l: LineSet3d, k: number): [V3, V3] => {
  const P = l.positions, i = k * 6;
  return [
    [P[i]!, P[i + 1]!, P[i + 2]!],
    [P[i + 3]!, P[i + 4]!, P[i + 5]!],
  ];
};
/** 직선(o, e — z = 0 평면 안)과 정확한 원의 교차 가운데 near에 가까운 근 */
function circleRoot(o: readonly number[], e: readonly number[], near: readonly number[]): V3 | null {
  if (Math.abs(e[2]!) > 1e-12 || Math.abs(o[2]!) > 1e-9) return null;
  const A = e[0]! * e[0]! + e[1]! * e[1]!, B = o[0]! * e[0]! + o[1]! * e[1]!, C = o[0]! * o[0]! + o[1]! * o[1]! - R * R;
  const disc = B * B - A * C;
  if (!(A > 1e-12) || disc < 0) return null;
  const qs = [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A].map((s): V3 => [o[0]! + e[0]! * s, o[1]! + e[1]! * s, 0]);
  return dist(qs[0]!, near) <= dist(qs[1]!, near) ? qs[0]! : qs[1]!;
}
/** 선(o, e)이 꺾은선 토막과 만나는 자리 가운데 near에 가장 가까운 것과 그 토막 */
function crossing(l: LineSet3d, o: readonly number[], e: readonly number[], near: readonly number[]): { X: V3; k: number } {
  let best: { X: V3; k: number } | null = null;
  for (let k = 0; k < N; k++) {
    const [a, b] = segOf(l, k);
    const g = sub(b, a);
    const den = e[0]! * g[1]! - e[1]! * g[0]!;
    if (Math.abs(den) < 1e-12) continue;
    const w = sub(a, o);
    const s = (w[0] * g[1]! - w[1] * g[0]!) / den, u = (w[0] * e[1]! - w[1] * e[0]!) / den;
    if (u < 0 || u > 1) continue;
    const X = add(o, mul(e, s));
    if (!best || dist(X, near) < dist(best.X, near)) best = { X, k };
  }
  return best!;
}
const lineGap = (p: readonly number[], o: readonly number[], e: readonly number[]): number => {
  const w = sub(p, o);
  return Math.hypot(...sub(w, mul(e, dot(w, e))));
};
const onCircle = (p: readonly number[]): boolean => Math.abs(Math.hypot(p[0]!, p[1]!) - R) < 1e-9 && Math.abs(p[2]!) < 1e-12;
function camAt(target: readonly number[], look: readonly number[], distance: number): CameraState {
  const a = dirToAngles(look);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [target[0]!, target[1]!, target[2]!], distance, projection: 'perspective' };
}
const look = (Q: readonly number[]): V3 => norm([Q[0]! / R, Q[1]! / R, 0.25]);
const RING90 = ring(-90 * D);
/** 토막 0의 현(−90°)과 나란히 중심에서 R·cos(w)(w = 칸 반각의 m배)를 지나는 X축: 지나는 점 F(원 밖 왼쪽), 근 Q(sgn 쪽), 현과 만나는 자리 X와 그 토막 */
function axisCase(m: number, sgn: number): { F: V3; Q: V3; X: V3; k: number } {
  const w = m * HS;
  const F: V3 = [-45, -R * Math.cos(w), 0];
  const Q: V3 = [sgn * R * Math.sin(w), -R * Math.cos(w), 0];
  return { F, Q, ...crossing(RING90, F, [1, 0, 0], Q) };
}

describe('acceptEdgePatch(0.38.0 — 현을 얕게 가로지르는 선의 닫힌 선분 교차 다듬기)', () => {
  const { F, Q, X, k } = axisCase(4.4, -1);
  const f = computeFrame(camAt(Q, look(Q), 15), 800, 600, { center: [0, 0, 0], radius: 60 });
  const s = (p: readonly number[]): [number, number] => {
    const v = projectToScreen(f, p)!;
    return [v[0], v[1]];
  };
  const sx = s(X), sq = s(Q);
  const line = { origin: F, dir: [1, 0, 0] };
  const x = (sx[0] + sq[0]) / 2 + 0.31, y = (sx[1] + sq[1]) / 2 + 0.17;

  it('X와 Q가 화면에서 붙잡기 거리보다 떨어진 자리(전제)에서 둘 사이를 가리키면 Q를 받는다 — 0.18.0 규칙(코어 점에서 붙잡기 거리 안)으로는 버렸다', () => {
    expect(Math.hypot(sx[0] - sq[0], sx[1] - sq[1])).toBeGreaterThan(SNAP);
    expect(acceptOnLine(f, X, Q, line, SNAP)).toBeNull();
    const r = acceptEdgePatch(f, X, Q, line, segOf(RING90, k), x, y, SNAP);
    expect(r).not.toBeNull();
    expect(dist(r!.p, Q)).toBeLessThan(1e-9);
    expect(r!.distPx).toBeLessThanOrEqual(SNAP);
  });

  it('커서에서 붙잡기 거리 밖·선 밖·다른 근·이웃 토막 활꼴·토막 끝·지나는 점이면 받지 않는다', () => {
    // 커서가 X 쪽 멀리(Q가 커서에서 붙잡기 거리 밖)
    const fx = sx[0] + (sx[0] - sq[0]) * 0.4, fy = sx[1] + (sx[1] - sq[1]) * 0.4;
    expect(acceptEdgePatch(f, X, Q, line, segOf(RING90, k), fx, fy, SNAP)).toBeNull();
    // 선에서 벗어난 점(화면 반 화소 넘게)
    expect(acceptEdgePatch(f, X, add(Q, [0, 0.05, 0]), line, segOf(RING90, k), x, y, SNAP)).toBeNull();
    // 다른 근(원의 맞은쪽 — 그 토막 활꼴 밖)
    const far = circleRoot(F, [1, 0, 0], [-Q[0], Q[1], 0])!;
    expect(dist(far, Q)).toBeGreaterThan(1);
    expect(acceptEdgePatch(f, X, far, line, segOf(RING90, k), x, y, SNAP)).toBeNull();
    // 이웃 토막을 주면(그 토막 활꼴이 아니다) 받지 않는다
    const nb = k === N - 1 ? 0 : k + 1;
    expect(acceptEdgePatch(f, X, Q, line, segOf(RING90, nb), x, y, SNAP)).toBeNull();
    // 토막 끝 자리(꼭짓점 — 끝점 붙잡기가 맡는다)
    const [a] = segOf(RING90, k);
    const sa = s(a);
    expect(acceptEdgePatch(f, X, a, { origin: [a[0] - 45, a[1], a[2]], dir: [1, 0, 0] }, segOf(RING90, k), sa[0] + 0.3, sa[1] + 0.2, SNAP)).toBeNull();
    // 선이 지나는 점 자리
    expect(acceptEdgePatch(f, X, Q, { origin: Q, dir: [1, 0, 0] }, segOf(RING90, k), x, y, SNAP)).toBeNull();
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
const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const hover = (w: View, x: number, y: number): void => {
  ptr(w, 'pointermove', x, y, 0);
  w.v.renderNow();
};
const at = (w: View, p: readonly number[]): [number, number] => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return [s.x, s.y];
};
const DEG = 27;
const edgeOk = (_s: unknown, item: { id: string }): boolean => item.id === '기준';
/** 앱 refine: 원 토막의 'axisEdge'면 그 직선과 정확한 원의 교차 가운데 point에 가까운 근 */
const circleRefine = (calls: { closed: number; open: number } = { closed: 0, open: 0 }): MeasureSnapOptions['refine'] => (c) => {
  if (c.kind !== 'axisEdge' || !c.line || c.segment.id !== '원') return null;
  if (c.open) calls.open++;
  else calls.closed++;
  return circleRoot(c.line.origin, c.line.dir, c.point);
};
function snapOptions(refine: MeasureSnapOptions['refine'], points: V3[]): MeasureSnapOptions {
  return {
    points: points.map((point) => ({ point, kind: 'point' as const })),
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
      trackDirs: { edge: edgeOk, meets: { guides: true, open: true } },
    },
    refine,
  };
}
/** 장면을 주고 위에서 물러나 첫 점(앱 점 — 눌러 찍는다)·끌어온 점·기준 선분(지나간다)을 둔 뒤 cam으로 옮긴 뷰어 */
function view(scene: Scene3d, refine: MeasureSnapOptions['refine'], cam: CameraState, o: { tracks?: V3[]; first?: V3; refAt?: V3; lock?: boolean }): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  const w: View = { v, canvas: v.canvas as unknown as FakeElement };
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera(camAt([9, -12, 0], [0.05, -0.35, 1], 210));
  v.setMeasureMode(true);
  v.setMeasureSnap(snapOptions(refine, o.first ? [o.first] : []));
  v.renderNow();
  if (o.first) {
    const [x, y] = at(w, o.first);
    hover(w, x + 0.31, y + 0.17);
    ptr(w, 'pointerdown', x + 0.31, y + 0.17, 1);
    ptr(w, 'pointerup', x + 0.31, y + 0.17, 0);
    v.renderNow();
    expect(v.measurePoints[0]!.point).toEqual(o.first);
  }
  if (o.tracks) expect(v.setMeasureTrackPoints(o.tracks)).toBe(o.tracks.length);
  if (o.refAt) {
    const [x, y] = at(w, o.refAt);
    hover(w, x + 0.3, y + 0.2);
  }
  if (o.lock) expect(v.setMeasureInferenceLock('x')).toBe(true);
  v.setCamera(cam);
  v.renderNow();
  return w;
}
const SC90: Scene3d = { name: 'ring90', units: 'mm', meshes: [], lines: [RING90], points: [] };

describe('Viewer3d: 현을 얕게 가로지르는 선의 모서리 위 만나는 점을 앱 곡선 교점으로(0.38.0)', () => {
  it('첫 점 X축·끌어온 점 X축·잠근 X축(칸 반각의 4.4배로 스친다): X와 Q 사이를 가리키면 원 위·그 축 위 다듬은 교차(0.37.0은 X 그대로 현 위)', () => {
    for (const sgn of [-1, 1])
      for (const how of ['first', 'track', 'lock'] as const) {
        const { F, Q, X, k } = axisCase(4.4, sgn);
        const w = view(SC90, circleRefine(), camAt(Q, look(Q), 15), how === 'track' ? { tracks: [F] } : { first: F, lock: how === 'lock' });
        const sx = at(w, X), sq = at(w, Q);
        const key = `${sgn} ${how}`;
        // 전제: X와 Q는 화면에서 붙잡기 거리보다 떨어져 있다(0.18.0 규칙으로는 Q를 버렸다)
        expect(Math.hypot(sx[0] - sq[0], sx[1] - sq[1]), key).toBeGreaterThan(SNAP);
        hover(w, (sx[0] + sq[0]) / 2 + 0.31, (sx[1] + sq[1]) / 2 + 0.17);
        const h = w.v.measureHoverSnap!;
        expect(h, key).toMatchObject({ snap: 'axis', axis: 'x', refined: true, segment: { id: '원', index: k } });
        if (how === 'track') expect(h.trackFrom, key).toEqual(F);
        if (how === 'lock') expect(h.locked, key).toBe(true);
        expect(onCircle(h.point), key).toBe(true);
        expect([h.point[1], h.point[2]], key).toEqual([F[1], F[2]]);
        expect(dist(h.point, Q), key).toBeLessThan(1e-9);
        w.v.dispose();
      }
  });

  it('끌어온 점 안내 선(27° 기준과 나란함)도 같다 — 그 안내 선 위 원 위 교차', () => {
    const ring27 = ring((DEG - 90) * D);
    const G0: V3 = [66, -72, 0];
    const ref: LineSet3d = { id: '기준', name: '기준', positions: new Float32Array([...G0, ...add(G0, mul([Math.cos(DEG * D), Math.sin(DEG * D), 0], 39))]), color: [0.2, 0.6, 0.9, 1] };
    const gd = norm([ref.positions[3]! - ref.positions[0]!, ref.positions[4]! - ref.positions[1]!, 0]);
    const sc: Scene3d = { name: 'ring27', units: 'mm', meshes: [], lines: [ring27, ref], points: [] };
    for (const sgn of [-1, 1]) {
      const w0 = 4.4 * HS;
      const n0: V3 = [Math.cos((DEG - 90) * D), Math.sin((DEG - 90) * D), 0];
      const P0 = mul(n0, R * Math.cos(w0));
      const T = sub(P0, mul(gd, 45));
      const Q = circleRoot(T, gd, add(P0, mul(gd, sgn * R * Math.sin(w0))))!;
      const { X } = crossing(ring27, T, gd, Q);
      const w = view(sc, circleRefine(), camAt(Q, look(Q), 15), { tracks: [T], refAt: add(G0, mul(gd, 18.39)) });
      const sx = at(w, X), sq = at(w, Q);
      expect(Math.hypot(sx[0] - sq[0], sx[1] - sq[1]), `${sgn}`).toBeGreaterThan(SNAP);
      hover(w, (sx[0] + sq[0]) / 2 + 0.31, (sx[1] + sq[1]) / 2 + 0.17);
      const h = w.v.measureHoverSnap!;
      expect(h, `${sgn}`).toMatchObject({ snap: 'parallel', refined: true, segment: { id: '원' } });
      expect(h.trackFrom, `${sgn}`).toEqual(T);
      expect(onCircle(h.point), `${sgn}`).toBe(true);
      expect(lineGap(h.point, T, gd), `${sgn}`).toBeLessThan(1e-9);
      expect(dist(h.point, Q), `${sgn}`).toBeLessThan(1e-6);
      w.v.dispose();
    }
  });

  it('refine이 늘 null이면(앱이 곡선을 모른다) 같은 자리는 X 그대로(현 위 — 0.37.0과 같다), 앱 호출 수는 받는 규칙과 상관없이 같다', () => {
    const { F, Q, X } = axisCase(4.4, -1);
    const calls: number[] = [];
    for (const refine of [() => (calls.push(0), null), null] as MeasureSnapOptions['refine'][]) {
      const w = view(SC90, refine, camAt(Q, look(Q), 15), { first: F });
      const sx = at(w, X), sq = at(w, Q);
      hover(w, (sx[0] + sq[0]) / 2 + 0.31, (sx[1] + sq[1]) / 2 + 0.17);
      const h = w.v.measureHoverSnap!;
      expect(h).toMatchObject({ snap: 'axis', segment: { id: '원' } });
      expect(h).not.toHaveProperty('refined');
      expect(dist(h.point, X)).toBeLessThan(1e-6);
      w.v.dispose();
    }
    expect(calls.length).toBeGreaterThan(0);
    // 다듬는 앱: 같은 자리 닫힌 호출은 한 번(기억)이다 — 넓힌 받기는 이미 부른 닫힌 답을 받는다
    const cnt = { closed: 0, open: 0 };
    const w = view(SC90, circleRefine(cnt), camAt(Q, look(Q), 15), { first: F });
    const sx = at(w, X), sq = at(w, Q);
    for (const t of [0.35, 0.5, 0.65]) hover(w, sx[0] + (sq[0] - sx[0]) * t + 0.31, sx[1] + (sq[1] - sx[1]) * t + 0.17);
    expect(cnt.closed).toBe(1);
    expect(w.v.measureHoverSnap?.refined).toBe(true);
    w.v.dispose();
  });

  it('Q 둘레 화면 격자(11 × 11, 2화소 칸 — 칸 반각의 2.2·4.4배 × 두 근): 다듬은 현 위 점은 모두 원 위·그 축 위이고, 남은 다듬지 않은 현 위 점은 모두 Q가 커서에서 붙잡기 거리 밖', () => {
    let refined = 0, left = 0;
    for (const m of [2.2, 4.4])
      for (const sgn of [-1, 1]) {
        const { F, Q } = axisCase(m, sgn);
        const w = view(SC90, circleRefine(), camAt(Q, look(Q), 15), { first: F });
        const c = at(w, Q);
        for (let iy = -5; iy <= 5; iy++)
          for (let ix = -5; ix <= 5; ix++) {
            const x = c[0] + ix * 2 + 0.211, y = c[1] + iy * 2 - 0.173;
            hover(w, x, y);
            const h = w.v.measureHoverSnap;
            if (h?.snap !== 'axis' || h.segment?.id !== '원') continue;
            const k = `${m} ${sgn} ${ix},${iy}`;
            expect(lineGap(h.point, F, [1, 0, 0]), k).toBeLessThan(1e-9);
            if (h.refined) {
              refined++;
              expect(onCircle(h.point), k).toBe(true);
              continue;
            }
            left++;
            const q = circleRoot(F, [1, 0, 0], h.point)!;
            const s = at(w, q);
            expect(Math.hypot(s[0] - x, s[1] - y), k).toBeGreaterThan(SNAP);
          }
        w.v.dispose();
      }
    expect(refined).toBeGreaterThan(40);
    expect(left).toBeGreaterThan(0);
  });
});
