/**
 * 0.23.0 열린 교차의 받는 한도(track.ts openEdgeCandidates·openEdgeSnap·openFaceCandidates·openFaceSnap의 reachPx),
 * 반투명 그물을 지나 고르기(PickOptions·MeasureSnapOptions의 throughTranslucent), 덧그림 글상자 비키기(setAnnotations ↔ setMeasureLabelAvoid)와 뷰 큐브 화면 사각형(viewCubeRect).
 * - 순수 함수: 같은 평면에서 토막 끝 둘레로 들어와 활꼴을 두 번 지나는 선(두 번 지날 수 있는 토막의 조건 밖)의 먼 교차를 코어 점 거리와 상관없이 받기,
 *   그 토막 범위 밖·현에서 먼 점·커서에서 먼 근은 버리기, 그 토막 범위인 선 조각이 커서에서 붙잡기 거리 밖이면 묻지 않기
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 원호 꼭대기를 현과 거의 나란히 스치는 첫 점 X축(NC 23차 재현 — 확대 12단마다 붙는 것)
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, viewDepth, worldPerPixel } from '../src/camera';
import type { SnapRefineInput } from '../src/snap';
import { OPEN_EDGE_CHORD, openEdgeCandidates, openEdgeSnap } from '../src/track';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const deg = (a: number): number => (a * Math.PI) / 180;

// ───────────── 순수 함수: 열린 교차의 받는 한도 ─────────────
describe('openEdgeCandidates·openEdgeSnap: 토막 범위로 받고 그 범위의 선 조각으로 거른다(0.23.0 reachPx)', () => {
  const R = 30;
  /** 12토막 원(z 0)의 꼭짓점 15° + 30°·k. 토막 1은 45°–75°, 토막 2는 75°–105°(현 y = 30·sin75°) */
  const vtx = (k: number): V3 => [R * Math.cos(deg(15 + 30 * k)), R * Math.sin(deg(15 + 30 * k)), 0];
  const B = vtx(2);
  /** 같은 평면에서 토막 2의 75° 끝(B) 바로 바깥(0.05)을 지나 왼쪽 위로 12° 기운 선: 현 가운데에서 1.59(> 0.1 × 토막 길이) — 두 번 지날 수 있는 토막의 조건 밖 */
  const from: V3 = [B[0] + 0.05, B[1], 0];
  const dir: V3 = [-Math.cos(deg(12)), Math.sin(deg(12)), 0];
  const lines = [{ from, dir }];
  /** 선과 원의 두 교차(B 쪽 NEAR, 먼 FAR) — 둘 다 토막 2 범위(75°~105°) */
  const roots = ((): [V3, V3] => {
    const b = from[0] * dir[0] + from[1] * dir[1], c = from[0] ** 2 + from[1] ** 2 - R * R;
    const r = Math.sqrt(b * b - c);
    return [-b - r, -b + r].map((t): V3 => [from[0] + dir[0] * t, from[1] + dir[1] * t, 0]).sort((p, q) => dist(p, B) - dist(q, B)) as [V3, V3];
  })();
  const [NEAR, FAR] = roots;
  const view = dirToAngles([0.15, -0.25, 1]);
  const cam: CameraState = { ...defaultCamera(), yaw: view.yaw, pitch: view.pitch, target: [FAR[0], FAR[1], 0], distance: 8, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 50 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
  const seg = (a: V3, b: V3) => ({ a, b, wpp: worldPerPixel(f, viewDepth(f, a)) });
  const ring = Array.from({ length: 12 }, (_, k) => seg(vtx(k), vtx(k + 1)));
  const S2 = ring[2]!;
  const SNAP = 10;
  const px = (p: readonly number[], q: readonly number[]): number => {
    const [a, b] = at(p), [c, d] = at(q);
    return Math.hypot(a - c, b - d);
  };

  it('전제: 두 교차 모두 토막 2 범위이고, 먼 교차는 코어 점(B 쪽)에서 붙잡기 거리의 두 배보다 멀다. 선은 현 가운데에서 0.1 × 토막 길이보다 멀다', () => {
    for (const Q of [NEAR, FAR]) {
      const a = Math.atan2(Q[1], Q[0]);
      expect(a).toBeGreaterThan(deg(75));
      expect(a).toBeLessThan(deg(105));
    }
    const L = dist(S2.a, S2.b);
    // 현 가운데 M에서 선에 내린 발의 현에 수직인 성분(y — 현은 X축과 나란하다)
    const M = [(S2.a[0] + S2.b[0]) / 2, (S2.a[1] + S2.b[1]) / 2];
    const t = (M[0]! - from[0]) * dir[0] + (M[1]! - from[1]) * dir[1];
    expect(from[1] + dir[1] * t - M[1]!).toBeGreaterThan(OPEN_EDGE_CHORD * L + S2.wpp);
    expect(px(FAR, B)).toBeGreaterThan(2 * SNAP);
    expect(px(FAR, NEAR)).toBeGreaterThan(2 * SNAP);
  });

  it('먼 교차 둘레를 가리키면 토막 2 후보(코어 점은 B 쪽 — 커서에서 2 × 붙잡기 거리 밖, 0.22.0은 거르던 것)를 묻고, 앱이 준 먼 교차를 받는다', () => {
    const [x, y] = at(FAR);
    const cs = openEdgeCandidates(f, lines, ring, x + 1, y + 2, SNAP).filter((c) => c.seg === S2);
    expect(cs).toHaveLength(1);
    expect(cs[0]).not.toHaveProperty('twice');
    expect(cs[0]!.distPx).toBeGreaterThan(2 * SNAP);
    expect(cs[0]!.reachPx).toBeLessThan(3);
    expect(dist(cs[0]!.p, B)).toBeLessThan(0.1);
    // 커서 광선 쪽 근을 주는 앱(힌트 둘레가 아니어도 그 토막 곡선 위 교차)
    const r = openEdgeSnap(f, lines, ring, x + 1, y + 2, SNAP, (c) => (c.seg === S2 ? FAR : null))!;
    expect(r).not.toBeNull();
    expect(dist(r.p, FAR)).toBeLessThan(1e-9);
    expect(r.seg).toBe(S2);
    expect(r.p[2]).toBe(0);
    expect(px(r.core, r.p)).toBeGreaterThan(SNAP);
    expect(r.distPx).toBeLessThan(3);
  });

  it('버리는 것: 커서에서 먼 근(같은 토막의 가까운 교차), 토막 범위 밖 선 위 점, 현에서 0.1 × 토막 길이보다 먼 선 위 점, 선에서 벗어난 원 위 점', () => {
    const [x, y] = at(FAR);
    const run = (q: readonly number[]) => openEdgeSnap(f, lines, ring, x + 1, y + 2, SNAP, () => q);
    expect(run(NEAR)).toBeNull();
    // 선 위에서 B 바깥(토막 1 쪽 — 현에 내린 자리가 토막 2 범위 밖)
    expect(run([from[0] - dir[0] * 0.5, from[1] - dir[1] * 0.5, 0])).toBeNull();
    // 선 위에서 FAR보다 왼쪽 위(현에서 0.1 × 토막 길이보다 멀다)
    const t = (OPEN_EDGE_CHORD * dist(S2.a, S2.b) + 0.2) / dir[1];
    expect(run([from[0] + dir[0] * t, from[1] + dir[1] * t, 0])).toBeNull();
    // 원 위지만 선에서 벗어난 점(FAR에서 원을 따라 1°)
    const a = Math.atan2(FAR[1], FAR[0]) + deg(1);
    expect(run([R * Math.cos(a), R * Math.sin(a), 0])).toBeNull();
  });

  it('그 토막 범위인 선 조각이 커서에서 붙잡기 거리 밖이면 묻지 않는다: 곡선 평면을 뚫는 Z축을 옆으로 15화소(코어 점은 2 × 붙잡기 거리 안 — 0.22.0은 물었다)', () => {
    // 물러난 뷰(처짐 1.02가 붙잡기 거리 안이 되게)
    const g = computeFrame({ ...cam, target: [0, R, 0], distance: 70 }, 600, 400, { center: [0, 0, 0], radius: 50 });
    const gat = (p: readonly number[]): [number, number] => {
      const s = projectToScreen(g, p)!;
      return [s[0], s[1]];
    };
    const gring = Array.from({ length: 12 }, (_, k) => ({ a: vtx(k), b: vtx(k + 1), wpp: worldPerPixel(g, viewDepth(g, vtx(k))) }));
    const G2 = gring[2]!;
    const T: V3 = [0, R, 0];
    expect(R - R * Math.cos(deg(15))).toBeLessThan(SNAP * G2.wpp);
    // 토막 2 가운데(90°)의 원 위 점 위에서 내린 Z축 — 원 평면을 원 위에서 뚫는다(현과는 처짐만큼 떨어진다)
    const z = [{ from: [T[0], T[1], 5] as V3, dir: [0, 0, 1] as V3 }];
    const [x, y] = gat(T);
    const near = openEdgeCandidates(g, z, gring, x + 1, y + 2, SNAP).filter((c) => c.seg === G2);
    expect(near).toHaveLength(1);
    expect(near[0]!.reachPx).toBeLessThan(3);
    // 화면에서 Z축(눈 쪽으로 기운 선)에 수직으로 15화소 옆
    const [ux, uy] = gat([T[0], T[1], 1]);
    const n = Math.hypot(ux - x, uy - y);
    const sx = x - ((uy - y) / n) * 15, sy = y + ((ux - x) / n) * 15;
    let calls = 0;
    expect(openEdgeCandidates(g, z, gring, sx, sy, SNAP).filter((c) => c.seg === G2)).toEqual([]);
    expect(
      openEdgeSnap(g, z, gring, sx, sy, SNAP, () => {
        calls++;
        return T;
      }),
    ).toBeNull();
    expect(calls).toBe(0);
    // 0.22.0 규칙이면 물었을 자리다(코어 점이 커서에서 2 × 붙잡기 거리 안)
    expect(Math.hypot(gat(near[0]!.p)[0] - sx, gat(near[0]!.p)[1] - sy)).toBeLessThan(2 * SNAP);
  });

  it('받은 점보다 커서에 가까울 수 없는 후보(reachPx가 고른 거리 이상)는 부르지 않는다', () => {
    const [x, y] = at(FAR);
    // 토막 2 후보 하나와, 커서에서 먼 다른 선(같은 원의 토막 0 둘레를 지나는 Z축)을 함께 둔다
    const both = [...lines, { from: [R, 0, 5] as V3, dir: [0, 0, 1] as V3 }];
    const asked: number[] = [];
    const r = openEdgeSnap(f, both, ring, x + 1, y + 2, SNAP, (c) => {
      asked.push(c.line);
      return c.line === 0 ? FAR : null;
    });
    expect(dist(r!.p, FAR)).toBeLessThan(1e-9);
    expect(asked).toEqual([0]);
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

const ptrEvent = (v: Viewer3d, type: string, x: number, y: number, buttons: number, shiftKey = false): void =>
  (v.canvas as unknown as { fire: (t: string, e: object) => void }).fire(type, {
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
const hoverXY = (v: Viewer3d, x: number, y: number, shift = false): void => {
  ptrEvent(v, 'pointermove', x, y, 0, shift);
  v.renderNow();
};
const clickXY = (v: Viewer3d, x: number, y: number, shift = false): void => {
  hoverXY(v, x, y, shift);
  ptrEvent(v, 'pointerdown', x, y, 1, shift);
  ptrEvent(v, 'pointerup', x, y, 0, shift);
  v.renderNow();
};

/**
 * NC 23차 재현(원호 꼭대기를 스치는 축): 반지름 25 원호(152.5° → −12.49° 시계 방향, 33토막 — 꼭대기 90°가 92.504°~87.504° 토막 가운데쯤)와
 * (40, 25 − δ)까지 급속 이동. 첫 점 (40, 25 − δ)의 X축은 꼭대기 토막의 현과 거의 나란히 활꼴만 지나 현과 만나지 않는다.
 * 앱 refine은 축과 원의 교차 가운데 힌트(point)에 가까운 근(토막 길이 안)을 준다(NC 앱과 같은 계산)
 */
describe("Viewer3d: 원호 꼭대기를 현과 거의 나란히 스치는 첫 점 X축(NC 23차 재현 — refine 'axisEdge', open)", () => {
  const DEG = Math.PI / 180;
  const S = [25 * Math.cos(152.5 * DEG), 25 * Math.sin(152.5 * DEG)].map((v) => +v.toFixed(6));
  const E = [25 * Math.cos(-12.49 * DEG), 25 * Math.sin(-12.49 * DEG)].map((v) => +v.toFixed(6));
  const RA = Math.hypot(S[0]!, S[1]!);
  const N = 33;
  const a0 = Math.atan2(S[1]!, S[0]!), a1 = Math.atan2(E[1]!, E[0]!);
  const arcV = (k: number): V3 => [RA * Math.cos(a0 + ((a1 - a0) * k) / N), RA * Math.sin(a0 + ((a1 - a0) * k) / N), 0];
  const scene = (d: number): Scene3d => {
    const P: number[] = [];
    for (let k = 0; k < N; k++) P.push(...arcV(k), ...arcV(k + 1));
    return {
      name: 'apex',
      units: 'mm',
      meshes: [],
      lines: [
        { id: '호', positions: new Float32Array(P), segmentIds: new Uint32Array(Array.from({ length: N }, (_, k) => k)) },
        { id: '급속', positions: new Float32Array([E[0]!, E[1]!, 0, 40, 25 - d, 0]) },
      ],
      points: [],
    };
  };
  const refine = (calls: SnapRefineInput[]) => (c: SnapRefineInput): V3 | null => {
    calls.push(c);
    if (c.kind !== 'axisEdge' || !c.line || c.segment.id !== '호') return null;
    const o = c.line.origin, d = c.line.dir;
    if (Math.abs(d[2]) > 1e-12 || Math.abs(o[2]) > 1e-9) return null;
    const a = d[0] * d[0] + d[1] * d[1], b = o[0] * d[0] + o[1] * d[1], k = o[0] * o[0] + o[1] * o[1] - RA * RA;
    const disc = b * b - a * k;
    if (disc < 0) return null;
    const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t): V3 => [o[0] + d[0] * t, o[1] + d[1] * t, o[2]]);
    const q = dist(ts[0]!, c.point) <= dist(ts[1]!, c.point) ? ts[0]! : ts[1]!;
    return dist(q, c.point) <= dist(c.segment.ends[0], c.segment.ends[1]) * (1 + 1e-6) ? q : null;
  };
  /** NC 앱의 추론 선택(measure.ts MEASURE_INFERENCE와 같다) */
  const INF = { intersections: true, perpendicular: true, axes: true, parallel: true, lock: true, track: true, axisEdges: true, axisFaces: true, lockEdges: true, lockFaces: true } as const;
  /** 1화소의 세계 길이 0.002~0.1 사이 12단(곱 비 약 1.43) */
  const steps = Array.from({ length: 12 }, (_, k) => 0.002 * Math.pow(50, k / 11));

  /** 확대 단마다 붙은 것: o = 원 위 교차(열린 교차를 받음), v = 꼭짓점(끝점), a = 축 위 커서 자리, - = 그 밖 */
  function sweep(d: number): { plus: string; minus: string; calls: number } {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    v.setScene(scene(d));
    v.setView('top', false);
    v.fit(false);
    v.setMeasureMode(true);
    const calls: SnapRefineInput[] = [];
    v.setMeasureSnap({ points: [{ point: [0, 0, 0], kind: 'center' }], inference: INF, refine: refine(calls) });
    v.renderNow();
    const s0 = v.project([40, 25 - d, 0])!;
    clickXY(v, s0.x + 1, s0.y + 1);
    expect(v.measurePoints[0]).toMatchObject({ point: [40, Math.fround(25 - d), 0], snap: 'endpoint' });
    const yl = v.measurePoints[0]!.point[1];
    const xi = Math.sqrt(RA * RA - yl * yl);
    let plus = '', minus = '';
    for (const w of steps) {
      const hw = 400 * w;
      const a = v.project([-hw, 25 - 0.75 * hw, 0])!, b = v.project([hw, 25 + 0.75 * hw, 0])!;
      v.zoomToRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y), false);
      v.renderNow();
      for (const Q of [[xi, yl, 0] as V3, [-xi, yl, 0] as V3]) {
        const s = v.project(Q)!;
        hoverXY(v, s.x + 1, s.y + 2);
        const h = v.measureHoverSnap;
        let k = '-';
        if (h?.snap === 'endpoint') k = 'v';
        else if (h?.snap === 'axis' && h.axis === 'x' && h.segment && h.refined) {
          k = 'o';
          // 붙으면 원 위 그 교차(축 위 — 남은 두 좌표는 첫 점 그대로)
          expect(dist(h.point, Q)).toBeLessThan(1e-9);
          expect(h.point[1]).toBe(yl);
          expect(h.point[2]).toBe(0);
        } else if (h?.snap === 'axis' && h.axis === 'x' && !h.segment) k = 'a';
        if (Q[0] > 0) plus += k;
        else minus += k;
      }
    }
    v.dispose();
    return { plus, minus, calls: calls.filter((c) => c.open).length };
  }

  it('확대 12단 가운데 8단에서 두 교차 모두 붙는다(앞 1단은 틈이 붙잡기 거리보다 넓고, 뒤는 틈이 반 화소 아래거나 꼭짓점이 가깝다)', () => {
    // 0.20.0(NC 23차 기록)은 어느 단에서도 붙지 않았다 — 받는 점이 코어 점(꼭짓점 위)에서 붙잡기 거리 안이어야 해서 붙을 자리가 꼭짓점 둘레뿐이었다
    const got = [0.0001, 0.001, 0.003, 0.01].map(sweep);
    expect(got.map((g) => g.plus)).toEqual(['aooooooooaav', 'aooooooooaav', 'aooooooooavv', 'ooooooooavvv']);
    expect(got.map((g) => g.minus)).toEqual(['aooooooooaaa', 'aooooooooaav', 'aooooooooaav', 'ooooooooavvv']);
    // 앱 함수는 기억으로 단마다 몇 번만 불린다(12단 × 두 자리를 가리키는 동안)
    for (const g of got) expect(g.calls).toBeLessThanOrEqual(3 * 12);
  });
});
