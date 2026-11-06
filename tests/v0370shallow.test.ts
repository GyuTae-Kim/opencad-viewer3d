/**
 * 0.37.0 칸을 얕게 뚫는 선의 닫힌 면 교차 다듬기 넓힌 받기(track.ts acceptFacePatch — STEP 42차 요청):
 * 안내 선·축·잠근 선이 그물 칸을 얕게 뚫는 자리(0.29.0 면의 만나는 점·0.18.0 축과 면의 교차 — 코어 교차 X)가 커서에서 붙잡기 거리 안이면 코어는 X(현 위)를 고르고
 * 앱 refineFace('axisFace')에 그 선·그 칸을 넘기는데, 앱이 준 곡면 위 교점 Q가 X에서 화면 붙잡기 거리 밖이면(0.14.0 acceptRefined) 받지 않아 삼각형 위 X 그대로 "면 위"였다.
 * 이제 Q가 그 선 위·그 칸(뚫은 삼각형이나 같은 평면 짝) 위 곡면 조각 자리·커서에서 붙잡기 거리 안이면 받는다(열린 면 교차와 같은 규칙).
 * - 순수: acceptFacePatch(낮은 원기둥 칸 — 받는 자리·같은 평면 짝·커서에서 멀면·선 밖·다른 근·같은 평면이 아닌 이웃)
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 낮은 원기둥을 바깥 거리 15에서 본 안내 선(STEP 42차 꼴 — 칸 반각의 4.4배로 스친다)·첫 점 X축·잠근 X축,
 *   세운 구멍 안 거리 2의 안내 선에서 X와 Q 사이를 가리키면 원기둥 위·그 선 위 다듬은 교차, refineFace가 null이면 X 그대로, Q가 같은 평면 짝 위면 face가 그 삼각형,
 *   Q 둘레 화면 격자에서 남은 "다듬지 않은 면 위 만나는 점"은 모두 Q가 커서에서 붙잡기 거리 밖인 자리
 * 장면: 낮은 원기둥(반지름 30·높이 60·50토막, 옆면만 — 칸 0의 가운데가 −63°(현이 기준 27°와 나란) 또는 −90°(첫 점 X축)), 기준 선분(27°),
 * 판 400 × 300 × 18(반투명)의 세운 구멍 (150, 150) 반지름 5 z 6~18(20토막). 앱 refineFace = 그 직선과 원기둥(높이 안)의 교차 가운데 point에 가까운 근.
 * 화면 좌표로 가리킬 때는 선·그물의 경계를 정확히 가리키지 않고 몇 분의 일 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, type ViewFrame, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { acceptFacePatch } from '../src/track';
import { acceptOnLine } from '../src/snap';
import { boxMesh } from '../src/synth';
import { type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { SnapRefineFaceInput } from '../src/snap';
import type { V3 } from '../src/math';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';

const D = Math.PI / 180;
const DEG = 27;
const SNAP = 10;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const mul = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const norm = (a: readonly number[]): V3 => mul(a, 1 / Math.hypot(a[0]!, a[1]!, a[2]!));
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

const LR = 30, LH = 60, LN = 50;
const STEP = (360 / LN) * D;
/** 낮은 원기둥 옆면(칸 0의 가운데가 세계 각 phi0): 칸 k = [아래 k, 아래 k + 1, 위 k]·[위 k, 아래 k + 1, 위 k + 1] — 대각선은 (아래 k + 1) – (위 k) */
function lowCylinder(phi0: number): Mesh3d {
  const P: number[] = [], I: number[] = [];
  for (let k = 0; k <= LN; k++) {
    const a = phi0 - STEP / 2 + STEP * k;
    P.push(LR * Math.cos(a), LR * Math.sin(a), 0, LR * Math.cos(a), LR * Math.sin(a), LH);
  }
  for (let k = 0; k < LN; k++) I.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
  return { id: '원기둥', positions: new Float32Array(P), indices: new Uint32Array(I), color: [0.6, 0.65, 0.7, 1] };
}
const triOf = (m: Mesh3d, i: number): V3[] =>
  [0, 1, 2].map((k) => {
    const j = m.indices![i * 3 + k]! * 3;
    return [m.positions[j]!, m.positions[j + 1]!, m.positions[j + 2]!] as V3;
  });
/** 직선(o, d)과 축이 z인 원기둥(중심 c·반지름 r, 높이 lo~hi)의 교차 가운데 near에 가까운 근 */
function cylRoot(c: readonly number[], r: number, lo: number, hi: number, o: readonly number[], d: readonly number[], near: readonly number[]): V3 | null {
  const ou = o[0]! - c[0]!, ov = o[1]! - c[1]!;
  const A = d[0]! * d[0]! + d[1]! * d[1]!, B = ou * d[0]! + ov * d[1]!, C = ou * ou + ov * ov - r * r;
  const disc = B * B - A * C;
  if (!(A > 1e-12) || disc < 0) return null;
  const qs = [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A].map((s): V3 => [o[0]! + d[0]! * s, o[1]! + d[1]! * s, o[2]! + d[2]! * s]);
  const q = dist(qs[0]!, near) <= dist(qs[1]!, near) ? qs[0]! : qs[1]!;
  return q[2] >= lo - 1e-9 && q[2] <= hi + 1e-9 ? q : null;
}
/** 선(o, 단위 e)이 그물을 뚫는 자리 가운데 near에 가장 가까운 것과 그 삼각형 번호 */
function pierce(m: Mesh3d, o: readonly number[], e: readonly number[], near: readonly number[]): { X: V3; tri: number } {
  let best: { X: V3; tri: number } | null = null;
  for (let i = 0; i < m.indices!.length / 3; i++) {
    const c = triOf(m, i);
    const n = cross(sub(c[1]!, c[0]!), sub(c[2]!, c[0]!));
    const den = dot(n, e);
    if (Math.abs(den) < 1e-12) continue;
    const X = add(o, mul(e, dot(n, sub(c[0]!, o)) / den));
    let inside = true;
    for (let k = 0; k < 3; k++) if (dot(cross(sub(c[(k + 1) % 3]!, c[k]!), sub(X, c[k]!)), n) < 0) inside = false;
    if (inside && (!best || dist(X, near) < dist(best.X, near))) best = { X, tri: i };
  }
  return best!;
}
/** 점 q를 삼각형 c 평면에 내린 발이 그 안인지 */
function footIn(q: readonly number[], c: readonly V3[]): boolean {
  const n = norm(cross(sub(c[1]!, c[0]!), sub(c[2]!, c[0]!)));
  const f = sub(q, mul(n, dot(sub(q, c[0]!), n)));
  let ok = true;
  for (let k = 0; k < 3; k++) if (dot(cross(sub(c[(k + 1) % 3]!, c[k]!), sub(f, c[k]!)), n) < -1e-12) ok = false;
  return ok;
}
function camAt(target: readonly number[], look: readonly number[], distance: number): CameraState {
  const a = dirToAngles(look);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [target[0]!, target[1]!, target[2]!], distance, projection: 'perspective' };
}
const scr = (f: ViewFrame, p: readonly number[]): [number, number] => {
  const s = projectToScreen(f, p)!;
  return [s[0], s[1]];
};

// 기준 선분(27°)과 낮은 원기둥(칸 0 가운데 −63° — 그 칸의 현이 기준과 나란)
const G0: V3 = [60, -70, 0];
const REF: LineSet3d = { id: '기준', name: '기준', positions: new Float32Array([...G0, ...add(G0, mul([Math.cos(DEG * D), Math.sin(DEG * D), 0], 40))]), color: [0.2, 0.6, 0.9, 1] };
const GD = norm([REF.positions[3]! - REF.positions[0]!, REF.positions[4]! - REF.positions[1]!, REF.positions[5]! - REF.positions[2]!]);
const LOW27 = lowCylinder(-63 * D);
const LOW90 = lowCylinder(-90 * D);
const SC27: Scene3d = { name: 'low27', units: 'mm', meshes: [LOW27], lines: [REF], points: [] };
const SC90: Scene3d = { name: 'low90', units: 'mm', meshes: [LOW90], lines: [REF], points: [] };
const SPHERE = { center: [0, 0, 30], radius: 90 };
/** 칸 0의 현과 나란히 중심에서 R·cos(w)(w = 칸 반각의 k배)로 높이 z를 지나는 안내 선: 끌어온 점 T, 근 Q(sgn 쪽), 그물을 뚫는 자리 X(Q에 가까운 것)와 그 삼각형 */
function guideCase(k: number, z: number, sgn: number): { T: V3; Q: V3; X: V3; tri: number } {
  const n0: V3 = [Math.cos(-63 * D), Math.sin(-63 * D), 0];
  const w = (k * STEP) / 2;
  const P0 = add(mul(n0, LR * Math.cos(w)), [0, 0, z]);
  const T = sub(P0, mul(GD, 45));
  const Q = cylRoot([0, 0], LR, 0, LH, T, GD, add(P0, mul(GD, sgn * LR * Math.sin(w))))!;
  return { T, Q, ...pierce(LOW27, T, GD, Q) };
}
const look = (Q: readonly number[]): V3 => norm([Q[0]! / LR, Q[1]! / LR, 0.25]);
const onCyl = (p: readonly number[]): boolean => Math.abs(Math.hypot(p[0]!, p[1]!) - LR) < 1e-9;
/** 점과 직선(o, 단위 e) 사이 거리 */
const lineGap = (p: readonly number[], o: readonly number[], e: readonly number[]): number => {
  const w = sub(p, o);
  return Math.hypot(...sub(w, mul(e, dot(w, e))));
};

describe('acceptFacePatch(0.37.0 — 칸을 얕게 뚫는 선의 닫힌 면 교차 다듬기)', () => {
  const { T, Q, X, tri } = guideCase(4.4, 5, -1);
  const f = computeFrame(camAt(Q, look(Q), 15), 800, 600, SPHERE);
  const sx = scr(f, X), sq = scr(f, Q);
  const line = { origin: T, dir: GD };

  it('X와 Q가 화면에서 붙잡기 거리보다 떨어진 자리(전제)에서 둘 사이를 가리키면 Q를 받는다 — 0.14.0 규칙(코어 점에서 붙잡기 거리 안)으로는 버렸다', () => {
    expect(Math.hypot(sx[0] - sq[0], sx[1] - sq[1])).toBeGreaterThan(SNAP);
    expect(footIn(Q, triOf(LOW27, tri))).toBe(true);
    const x = (sx[0] + sq[0]) / 2 + 0.31, y = (sx[1] + sq[1]) / 2 + 0.17;
    expect(acceptOnLine(f, X, Q, line, SNAP)).toBeNull();
    const r = acceptFacePatch(f, X, Q, line, triOf(LOW27, tri), [], x, y, SNAP);
    expect(r).not.toBeNull();
    expect(r!.cell).toBe(0);
    expect(dist(r!.p, Q)).toBeLessThan(1e-9);
    expect(r!.distPx).toBeLessThanOrEqual(SNAP);
  });

  it('커서가 X 쪽이라 Q가 커서에서 붙잡기 거리 밖이면, 앱 점이 선 밖이면, 다른 근이면 받지 않는다', () => {
    const away = [sx[0] + (sx[0] - sq[0]) * 0.3 + 0.31, sx[1] + (sx[1] - sq[1]) * 0.3 + 0.17];
    expect(Math.hypot(sq[0] - away[0]!, sq[1] - away[1]!)).toBeGreaterThan(SNAP);
    expect(acceptFacePatch(f, X, Q, line, triOf(LOW27, tri), [], away[0]!, away[1]!, SNAP)).toBeNull();
    const x = (sx[0] + sq[0]) / 2 + 0.31, y = (sx[1] + sq[1]) / 2 + 0.17;
    // 선에서 0.01 비킨 원기둥 위 점(화면 반 화소보다 멀다)
    const off = add(Q, mul(norm(cross(GD, [0, 0, 1])), 0.01));
    expect(acceptFacePatch(f, X, off, line, triOf(LOW27, tri), [], x, y, SNAP)).toBeNull();
    // 같은 선의 다른 근(맞은편 칸 — 그 칸 위가 아니다)
    const other = cylRoot([0, 0], LR, 0, LH, T, GD, add(Q, mul(GD, 50)))!;
    expect(dist(other, Q)).toBeGreaterThan(1);
    expect(acceptFacePatch(f, X, other, line, triOf(LOW27, tri), [], x, y, SNAP)).toBeNull();
  });

  it('Q가 한 칸을 나눈 같은 평면 짝 위면 그 짝(around의 번호 + 1)으로 받고, 같은 평면이 아닌 이웃 칸이면 받지 않는다', () => {
    const x = (sx[0] + sq[0]) / 2 + 0.31, y = (sx[1] + sq[1]) / 2 + 0.17;
    const mate = tri ^ 1;
    const nextCell = tri % 2 === 0 ? tri - 1 : tri + 1;
    // Q가 놓인 삼각형(tri)을 짝으로, 그 짝(mate)을 뚫은 삼각형으로 주면 짝 쪽으로 받는다
    const r = acceptFacePatch(f, X, Q, line, triOf(LOW27, mate), [triOf(LOW27, nextCell), triOf(LOW27, tri)], x, y, SNAP);
    expect(r).not.toBeNull();
    expect(r!.cell).toBe(2);
    // 이웃 칸(같은 평면이 아니다)만 주면 받지 않는다
    expect(acceptFacePatch(f, X, Q, line, triOf(LOW27, nextCell), [triOf(LOW27, tri)], x, y, SNAP)).toBeNull();
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
const edgeOk = (_s: unknown, item: { id: string }): boolean => item.id === '기준';
/** 앱 refineFace: 원기둥 옆면이면 그 직선과 원기둥(높이 안)의 교차 가운데 point에 가까운 근(c·r·lo·hi는 그물 id로) */
const WALLS: Record<string, { c: [number, number]; r: number; lo: number; hi: number }> = { 원기둥: { c: [0, 0], r: LR, lo: 0, hi: LH }, '세운 구멍': { c: [150, 150], r: 5, lo: 6, hi: 18 } };
const cylRefine = (calls: SnapRefineFaceInput[] = []) => (c: SnapRefineFaceInput): V3 | null => {
  calls.push(c);
  const w = WALLS[c.face.id];
  if (!w || Math.abs(c.face.normal[2]) > 1e-3) return null;
  return cylRoot(w.c, w.r, w.lo, w.hi, c.line.origin, c.line.dir, c.point);
};
function snapOptions(refineFace: MeasureSnapOptions['refineFace'], points: V3[] = []): MeasureSnapOptions {
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
      trackDirs: { edge: edgeOk, meets: { guides: true, open: true, openFaces: true } },
    },
    refine: () => null,
    refineFace,
    throughTranslucent: true,
  };
}
/** 장면을 주고 맞춰 보기에서 첫 점(앱 점 — 눌러 찍는다)·끌어온 점·기준 선분(지나간다)을 둔 뒤 cam으로 옮긴 뷰어 */
function view(scene: Scene3d, refineFace: MeasureSnapOptions['refineFace'], cam: CameraState, o: { tracks?: V3[]; first?: V3; refAt?: V3 }): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  const w: View = { v, canvas: v.canvas as unknown as FakeElement };
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.setMeasureMode(true);
  v.setMeasureSnap(snapOptions(refineFace, o.first ? [o.first] : []));
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
  v.setCamera(cam);
  v.renderNow();
  return w;
}
const REF_AT = add(G0, mul(GD, 20.013));

describe('Viewer3d: 칸을 얕게 뚫는 선의 면 위 만나는 점을 앱 곡면 교점으로(0.37.0 — STEP 42차 요청)', () => {
  it('낮은 원기둥 바깥 거리 15 안내 선(칸 반각의 4.4배로 스친다): X와 Q 사이를 가리키면 원기둥 위·그 안내 선 위 다듬은 교차(0.36.0은 X 그대로 "면 위")', () => {
    for (const sgn of [-1, 1]) {
      const { T, Q, X } = guideCase(4.4, 5, sgn);
      const w = view(SC27, cylRefine(), camAt(Q, look(Q), 15), { tracks: [T], refAt: REF_AT });
      const sx = at(w, X), sq = at(w, Q);
      // 전제: X와 Q는 화면에서 붙잡기 거리보다 떨어져 있다(0.14.0 규칙으로는 Q를 버렸다)
      expect(Math.hypot(sx[0] - sq[0], sx[1] - sq[1]), `${sgn}`).toBeGreaterThan(SNAP);
      hover(w, (sx[0] + sq[0]) / 2 + 0.31, (sx[1] + sq[1]) / 2 + 0.17);
      const h = w.v.measureHoverSnap!;
      expect(h, `${sgn}`).toMatchObject({ snap: 'parallel', refined: true, face: { id: '원기둥' } });
      expect(h.trackFrom, `${sgn}`).toEqual(T);
      expect(onCyl(h.point), `${sgn}`).toBe(true);
      expect(lineGap(h.point, T, GD), `${sgn}`).toBeLessThan(1e-9);
      expect(dist(h.point, Q), `${sgn}`).toBeLessThan(1e-6);
      w.v.dispose();
    }
  });

  it('refineFace가 늘 null이면(앱이 곡면을 모른다) 같은 자리는 X 그대로(면 위 만나는 점 — 0.36.0과 같다)', () => {
    const { T, Q, X } = guideCase(4.4, 5, -1);
    const w = view(SC27, () => null, camAt(Q, look(Q), 15), { tracks: [T], refAt: REF_AT });
    const sx = at(w, X), sq = at(w, Q);
    hover(w, (sx[0] + sq[0]) / 2 + 0.31, (sx[1] + sq[1]) / 2 + 0.17);
    const h = w.v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'parallel', face: { id: '원기둥' } });
    expect(h).not.toHaveProperty('refined');
    expect(dist(h.point, X)).toBeLessThan(1e-6);
    w.v.dispose();
  });

  it('Q가 한 칸을 나눈 같은 평면 짝 위면(높이 21 — 칸의 대각선이 X와 Q 사이) face가 Q 아래 삼각형이다', () => {
    let mates = 0;
    for (const sgn of [-1, 1]) {
      const { T, Q, X, tri } = guideCase(4.4, 21, sgn);
      const under = footIn(Q, triOf(LOW27, tri)) ? tri : tri ^ 1;
      expect(footIn(Q, triOf(LOW27, under)), `${sgn}`).toBe(true);
      if (under !== tri) mates++;
      const w = view(SC27, cylRefine(), camAt(Q, look(Q), 15), { tracks: [T], refAt: REF_AT });
      const sx = at(w, X), sq = at(w, Q);
      hover(w, (sx[0] + sq[0]) / 2 + 0.31, (sx[1] + sq[1]) / 2 + 0.17);
      const h = w.v.measureHoverSnap!;
      expect(h, `${sgn}`).toMatchObject({ snap: 'parallel', refined: true, face: { id: '원기둥', index: under } });
      expect(onCyl(h.point), `${sgn}`).toBe(true);
      expect(dist(h.point, Q), `${sgn}`).toBeLessThan(1e-6);
      w.v.dispose();
    }
    expect(mates).toBeGreaterThan(0);
  });

  it('첫 점 X축(축과 면의 교차)과 잠근 X축(잠근 선과 면의 교차)도 같다 — 칸 0이 −90°인 원기둥', () => {
    const w0 = (4.4 * STEP) / 2;
    for (const sgn of [-1, 1]) {
      const F: V3 = [-45, -LR * Math.cos(w0), 5];
      const Q: V3 = [sgn * LR * Math.sin(w0), -LR * Math.cos(w0), 5];
      const { X } = pierce(LOW90, F, [1, 0, 0], Q);
      for (const locked of [false, true]) {
        const w = view(SC90, cylRefine(), camAt(Q, look(Q), 15), { first: F });
        if (locked) expect(w.v.setMeasureInferenceLock('x')).toBe(true);
        const sx = at(w, X), sq = at(w, Q);
        expect(Math.hypot(sx[0] - sq[0], sx[1] - sq[1])).toBeGreaterThan(SNAP);
        hover(w, (sx[0] + sq[0]) / 2 + 0.31, (sx[1] + sq[1]) / 2 + 0.17);
        const h = w.v.measureHoverSnap!;
        const k = `${sgn} ${locked}`;
        expect(h, k).toMatchObject({ snap: 'axis', axis: 'x', refined: true, face: { id: '원기둥' } });
        if (locked) expect(h.locked, k).toBe(true);
        expect(onCyl(h.point), k).toBe(true);
        expect([h.point[1], h.point[2]], k).toEqual([F[1], F[2]]);
        expect(dist(h.point, Q), k).toBeLessThan(1e-6);
        w.v.dispose();
      }
    }
  });

  it('세운 구멍 안 거리 2(오목 — 앱 점이 그 칸 뒤): 안내 선이 칸을 얕게 뚫는 X와 Q 사이를 가리키면 원기둥 위 다듬은 교차', () => {
    const plate = boxMesh('판', [0, 0, 0], [400, 300, 18], [0.86, 0.74, 0.55, 0.35]);
    const hole = (() => {
      // 세운 구멍(20토막 옆면 — 0.34.0 시험과 같은 나눔), 뚜껑 없음
      const P: number[] = [], I: number[] = [];
      for (let k = 0; k <= 20; k++) {
        const th = (k / 20) * Math.PI * 2;
        // 0.34.0 시험의 틀(축 −z: e1 = −y·…)과 상관없이 x축에서 시작하는 고른 나눔
        for (const z of [18, 6]) P.push(150 + 5 * Math.cos(th), 150 + 5 * Math.sin(th), z);
      }
      for (let k = 0; k < 20; k++) I.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
      return { id: '세운 구멍', positions: new Float32Array(P), indices: new Uint32Array(I), color: [0.8, 0.35, 0.2, 1] } as Mesh3d;
    })();
    const OFF = [-Math.sin(DEG * D) * 4, Math.cos(DEG * D) * 4];
    const H0: V3 = [250 + OFF[0]!, 50 + OFF[1]!, 18];
    const ref: LineSet3d = { id: '기준', name: '기준', positions: new Float32Array([...H0, ...add(H0, mul([Math.cos(DEG * D), Math.sin(DEG * D), 0], 100))]), color: [0.2, 0.6, 0.9, 1] };
    const gd = norm([ref.positions[3]! - ref.positions[0]!, ref.positions[4]! - ref.positions[1]!, ref.positions[5]! - ref.positions[2]!]);
    const sc: Scene3d = { name: 'hole', units: 'mm', meshes: [plate, hole], lines: [ref], points: [] };
    const nA: V3 = [Math.cos(-63 * D), Math.sin(-63 * D), 0];
    let checked = 0;
    // X와 Q가 화면에서 붙잡기 거리의 1~2배 떨어진 경우만(그보다 멀면 둘 사이 어디도 둘 다 붙잡기 거리 안이 아니고, 가까우면 0.14.0 규칙이 받는다)
    for (const delta of [0.1, 0.3, 0.6])
      for (const d of [2, 4])
        for (const sgn of [-1, 1]) {
          const P0 = add([150, 150, 12], mul(nA, 5 - delta));
          const T = sub(P0, mul(gd, 20));
          const Q = cylRoot([150, 150], 5, 6, 18, T, gd, add(P0, mul(gd, sgn * Math.sqrt(25 - (5 - delta) ** 2))))!;
          const { X } = pierce(hole, T, gd, Q);
          const lk = norm([-(Q[0] - 150) / 5, -(Q[1] - 150) / 5, 0.3]);
          const w = view(sc, cylRefine(), camAt(Q, lk, d), { tracks: [T], refAt: add(H0, mul(gd, 50.013)) });
          const px = w.v.project(X), pq = w.v.project(Q);
          const gap = px?.onScreen && pq?.onScreen ? Math.hypot(px.x - pq.x, px.y - pq.y) : 0;
          if (!(gap > SNAP + 0.5 && gap < 2 * SNAP - 0.5)) {
            w.v.dispose();
            continue;
          }
          checked++;
          const k = `δ${delta} d${d} ${sgn}`;
          hover(w, (px!.x + pq!.x) / 2 + 0.31, (px!.y + pq!.y) / 2 + 0.17);
          const h = w.v.measureHoverSnap!;
          expect(h, k).toMatchObject({ snap: 'parallel', refined: true, face: { id: '세운 구멍' } });
          expect(Math.abs(Math.hypot(h.point[0] - 150, h.point[1] - 150) - 5), k).toBeLessThan(1e-9);
          expect(lineGap(h.point, T, gd), k).toBeLessThan(1e-9);
          expect(dist(h.point, Q), k).toBeLessThan(1e-6);
          w.v.dispose();
        }
    expect(checked).toBeGreaterThan(0);
  });

  it('Q 둘레 화면 격자(11 × 11, 2화소 칸 — 높이 5·20·45 × 두 근): 다듬은 면 점은 모두 원기둥 위·그 안내 선 위이고, 남은 다듬지 않은 면 위 만나는 점은 모두 Q가 커서에서 붙잡기 거리 밖', () => {
    let refined = 0, left = 0;
    for (const z of [5, 20, 45])
      for (const sgn of [-1, 1]) {
        const { T, Q } = guideCase(4.4, z, sgn);
        const w = view(SC27, cylRefine(), camAt(Q, look(Q), 15), { tracks: [T], refAt: REF_AT });
        const c = at(w, Q);
        for (let iy = -5; iy <= 5; iy++)
          for (let ix = -5; ix <= 5; ix++) {
            const x = c[0] + ix * 2 + 0.211, y = c[1] + iy * 2 - 0.173;
            hover(w, x, y);
            const h = w.v.measureHoverSnap;
            if (!h?.face || h.snap !== 'parallel') continue;
            const k = `${z} ${sgn} ${ix},${iy}`;
            expect(lineGap(h.point, T, GD), k).toBeLessThan(1e-9);
            if (h.refined) {
              refined++;
              expect(onCyl(h.point), k).toBe(true);
              continue;
            }
            // 다듬지 않은 면 위 만나는 점: 앱이 그 점에 줄 근이 커서에서 붙잡기 거리 밖이어야 한다
            left++;
            const q = cylRoot([0, 0], LR, 0, LH, T, GD, h.point)!;
            const s = at(w, q);
            expect(Math.hypot(s[0] - x, s[1] - y), k).toBeGreaterThan(SNAP);
          }
        w.v.dispose();
      }
    expect(refined).toBeGreaterThan(300);
    expect(left).toBeGreaterThan(0);
  });
});
