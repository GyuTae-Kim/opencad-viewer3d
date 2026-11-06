/**
 * 0.39.0 refineSnapToExact(기본 꺼짐 — 앱이 고르는 선택): 선(첫 점 축·끌어온 축·잠근 선·끌어온 점 안내 선)이 꺾은선 토막(현)이나 그물 칸을 얕게 가로지르는
 * 코어 교차 X가 커서에서 붙잡기 거리 안이라 그 교차를 골랐는데, 앱 refine('axisEdge')·refineFace('axisFace')가 준 같은 교차의 정확한 자리 Q가 커서에서 붙잡기 거리 밖이면
 * (0.37.0 acceptFacePatch·0.38.0 acceptEdgePatch 넓힌 받기에서 빠지는 자리 — 커서가 X 쪽) 표식·결과를 Q로 옮긴다.
 * 같은 교차라는 판정은 넓힌 받기와 같은 조각 자리 규칙이고, X에서 Q까지 세계 거리는 그 토막 길이·칸 크기 안, 화면 거리는 EXACT_SNAP_SCALE × 붙잡기 거리 안이다.
 * - 순수: acceptEdgePatch·acceptFacePatch의 exactPx(받는 자리·화면 상한·세계 상한·다른 근·이웃 토막·같은 평면이 아닌 이웃 칸은 그대로 빠짐)
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 꺾은선 원(반지름 30·50토막)의 첫 점 X축·끌어온 점 X축·잠근 X축·안내 선, 낮은 원기둥(반지름 30·50토막)의 안내 선·첫 점 X축에서
 *   X 쪽을 가리키면 끄면 X(현 위 — 0.38.0과 같다), 켜면 Q(같은 토막·칸, 원·원기둥 위·그 선 위). 앱 호출 수는 같고, 찍은 점도 Q다.
 *   아주 가까이 확대해 X와 Q가 화면에서 상한보다 멀면 켜도 X 그대로, X 둘레 격자에서 켜고도 남은 현 위 점은 모두 X와 Q가 상한보다 먼 자리
 * 화면 좌표로 가리킬 때는 선·점을 정확히 가리키지 않고 몇 분의 일 화소 옆을 가리킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, type ViewFrame, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { EXACT_SNAP_SCALE, acceptEdgePatch, acceptFacePatch } from '../src/track';
import { type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { SnapRefineFaceInput } from '../src/snap';
import type { V3 } from '../src/math';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';

const D = Math.PI / 180;
const DEG = 27;
const SNAP = 10;
const EXACT_PX = EXACT_SNAP_SCALE * SNAP;
const sub = (a: readonly number[], b: readonly number[]): V3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const add = (a: readonly number[], b: readonly number[]): V3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const mul = (a: readonly number[], k: number): V3 => [a[0]! * k, a[1]! * k, a[2]! * k];
const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): V3 => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const norm = (a: readonly number[]): V3 => mul(a, 1 / Math.hypot(a[0]!, a[1]!, a[2]!));
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const lineGap = (p: readonly number[], o: readonly number[], e: readonly number[]): number => {
  const w = sub(p, o);
  return Math.hypot(...sub(w, mul(e, dot(w, e))));
};
function camAt(target: readonly number[], look: readonly number[], distance: number): CameraState {
  const a = dirToAngles(look);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [target[0]!, target[1]!, target[2]!], distance, projection: 'perspective' };
}
const scr = (f: ViewFrame, p: readonly number[]): [number, number] => {
  const s = projectToScreen(f, p)!;
  return [s[0], s[1]];
};
/** 화면에서 X 쪽(Q 반대쪽)으로 k화소 옮긴 자리(몇 분의 일 화소 옆) */
const beyondX = (sx: readonly number[], sq: readonly number[], k: number): [number, number] => {
  const l = Math.hypot(sx[0]! - sq[0]!, sx[1]! - sq[1]!);
  return [sx[0]! + ((sx[0]! - sq[0]!) / l) * k + 0.31, sx[1]! + ((sx[1]! - sq[1]!) / l) * k + 0.17];
};
const sgap = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!);

// ───────────── 꺾은선 원(반지름 30·50토막, z = 0) ─────────────
const R = 30, N = 50, HS = Math.PI / N;
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
function circleRoot(o: readonly number[], e: readonly number[], near: readonly number[]): V3 | null {
  if (Math.abs(e[2]!) > 1e-12 || Math.abs(o[2]!) > 1e-9) return null;
  const A = e[0]! * e[0]! + e[1]! * e[1]!, B = o[0]! * e[0]! + o[1]! * e[1]!, C = o[0]! * o[0]! + o[1]! * o[1]! - R * R;
  const disc = B * B - A * C;
  if (!(A > 1e-12) || disc < 0) return null;
  const qs = [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A].map((s): V3 => [o[0]! + e[0]! * s, o[1]! + e[1]! * s, 0]);
  return dist(qs[0]!, near) <= dist(qs[1]!, near) ? qs[0]! : qs[1]!;
}
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
const onCircle = (p: readonly number[]): boolean => Math.abs(Math.hypot(p[0]!, p[1]!) - R) < 1e-9 && Math.abs(p[2]!) < 1e-12;
const lookRing = (Q: readonly number[]): V3 => norm([Q[0]! / R, Q[1]! / R, 0.25]);
const RING90 = ring(-90 * D);
/** 토막 0의 현(−90°)과 나란히 중심에서 R·cos(m·반각)을 지나는 X축: 지나는 점 F, 근 Q(sgn 쪽), 현과 만나는 자리 X와 그 토막 */
function axisCase(m: number, sgn: number): { F: V3; Q: V3; X: V3; k: number } {
  const w = m * HS;
  const F: V3 = [-45, -R * Math.cos(w), 0];
  const Q: V3 = [sgn * R * Math.sin(w), -R * Math.cos(w), 0];
  return { F, Q, ...crossing(RING90, F, [1, 0, 0], Q) };
}

// ───────────── 낮은 원기둥(반지름 30·높이 60·50토막) ─────────────
const LH = 60, STEP = 2 * HS;
function lowCylinder(phi0: number): Mesh3d {
  const P: number[] = [], I: number[] = [];
  for (let k = 0; k <= N; k++) {
    const a = phi0 - STEP / 2 + STEP * k;
    P.push(R * Math.cos(a), R * Math.sin(a), 0, R * Math.cos(a), R * Math.sin(a), LH);
  }
  for (let k = 0; k < N; k++) I.push(2 * k, 2 * k + 2, 2 * k + 1, 2 * k + 1, 2 * k + 2, 2 * k + 3);
  return { id: '원기둥', positions: new Float32Array(P), indices: new Uint32Array(I), color: [0.6, 0.65, 0.7, 1] };
}
const triOf = (m: Mesh3d, i: number): V3[] =>
  [0, 1, 2].map((k) => {
    const j = m.indices![i * 3 + k]! * 3;
    return [m.positions[j]!, m.positions[j + 1]!, m.positions[j + 2]!] as V3;
  });
function cylRoot(o: readonly number[], d: readonly number[], near: readonly number[]): V3 | null {
  const A = d[0]! * d[0]! + d[1]! * d[1]!, B = o[0]! * d[0]! + o[1]! * d[1]!, C = o[0]! * o[0]! + o[1]! * o[1]! - R * R;
  const disc = B * B - A * C;
  if (!(A > 1e-12) || disc < 0) return null;
  const qs = [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A].map((s): V3 => [o[0]! + d[0]! * s, o[1]! + d[1]! * s, o[2]! + d[2]! * s]);
  const q = dist(qs[0]!, near) <= dist(qs[1]!, near) ? qs[0]! : qs[1]!;
  return q[2] >= -1e-9 && q[2] <= LH + 1e-9 ? q : null;
}
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
const onCyl = (p: readonly number[]): boolean => Math.abs(Math.hypot(p[0]!, p[1]!) - R) < 1e-9;
const G0: V3 = [60, -70, 0];
const REF: LineSet3d = { id: '기준', name: '기준', positions: new Float32Array([...G0, ...add(G0, mul([Math.cos(DEG * D), Math.sin(DEG * D), 0], 40))]), color: [0.2, 0.6, 0.9, 1] };
const GD = norm([REF.positions[3]! - REF.positions[0]!, REF.positions[4]! - REF.positions[1]!, REF.positions[5]! - REF.positions[2]!]);
const LOW27 = lowCylinder(-63 * D);
const LOW90 = lowCylinder(-90 * D);
/** 칸 0(−63°)의 현과 나란히 높이 z를 지나는 안내 선(칸 반각의 m배로 스친다): 끌어온 점 T, 근 Q(sgn 쪽), 그물을 뚫는 자리 X와 그 삼각형 */
function guideCase(m: number, z: number, sgn: number): { T: V3; Q: V3; X: V3; tri: number } {
  const n0: V3 = [Math.cos(-63 * D), Math.sin(-63 * D), 0];
  const w = m * HS;
  const P0 = add(mul(n0, R * Math.cos(w)), [0, 0, z]);
  const T = sub(P0, mul(GD, 45));
  const Q = cylRoot(T, GD, add(P0, mul(GD, sgn * R * Math.sin(w))))!;
  return { T, Q, ...pierce(LOW27, T, GD, Q) };
}

describe('acceptEdgePatch·acceptFacePatch의 exactPx(0.39.0 refineSnapToExact)', () => {
  it('선분: 커서가 X 쪽이라 Q가 커서에서 붙잡기 거리 밖이면 exactPx 없이는 버리고, X에서 화면 exactPx·토막 길이 안이면 Q를 받는다(exact)', () => {
    const { F, Q, X, k } = axisCase(4.4, -1);
    const f = computeFrame(camAt(Q, lookRing(Q), 15), 800, 600, { center: [0, 0, 0], radius: 60 });
    const sx = scr(f, X), sq = scr(f, Q);
    const line = { origin: F, dir: [1, 0, 0] };
    // 전제: X와 Q는 붙잡기 거리보다 멀고 상한(3 × 붙잡기 거리) 안
    const gap = sgap(sx, sq);
    expect(gap).toBeGreaterThan(SNAP);
    expect(gap).toBeLessThanOrEqual(EXACT_PX);
    const [x, y] = beyondX(sx, sq, 3);
    expect(sgap([x, y], sx)).toBeLessThan(SNAP);
    expect(acceptEdgePatch(f, X, Q, line, segOf(RING90, k), x, y, SNAP)).toBeNull();
    expect(acceptEdgePatch(f, X, Q, line, segOf(RING90, k), x, y, SNAP, null)).toBeNull();
    const r = acceptEdgePatch(f, X, Q, line, segOf(RING90, k), x, y, SNAP, EXACT_PX);
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(true);
    expect(dist(r!.p, Q)).toBeLessThan(1e-9);
    expect(r!.distPx).toBeGreaterThan(SNAP);
    // 커서에서 붙잡기 거리 안이면 0.38.0과 같다(exact 없음)
    const mid = acceptEdgePatch(f, X, Q, line, segOf(RING90, k), (sx[0] + sq[0]) / 2 + 0.31, (sx[1] + sq[1]) / 2 + 0.17, SNAP, EXACT_PX);
    expect(mid).not.toBeNull();
    expect(mid).not.toHaveProperty('exact');
    // 화면 상한: X와 Q 사이보다 작으면 받지 않는다
    expect(acceptEdgePatch(f, X, Q, line, segOf(RING90, k), x, y, SNAP, gap - 0.5)).toBeNull();
    // 세계 상한: 코어 점이 토막 길이보다 멀면(같은 선 위 — 화면 상한을 아주 크게 줘도) 받지 않는다
    const L = dist(...segOf(RING90, k));
    const far = add(X, mul(norm(sub(X, Q)), L + 0.01));
    expect(dist(far, Q)).toBeGreaterThan(L);
    expect(projectToScreen(f, far)).not.toBeNull();
    expect(acceptEdgePatch(f, far, Q, line, segOf(RING90, k), x, y, SNAP, 1e9)).toBeNull();
    expect(acceptEdgePatch(f, add(X, mul(norm(sub(X, Q)), 0.5)), Q, line, segOf(RING90, k), x, y, SNAP, 1e9)).not.toBeNull();
    // 같은 교차가 아니면(다른 근·이웃 토막) exactPx가 있어도 받지 않는다
    const other = circleRoot(F, [1, 0, 0], [-Q[0], Q[1], 0])!;
    expect(acceptEdgePatch(f, X, other, line, segOf(RING90, k), x, y, SNAP, 1e9)).toBeNull();
    expect(acceptEdgePatch(f, X, Q, line, segOf(RING90, k === N - 1 ? 0 : k + 1), x, y, SNAP, 1e9)).toBeNull();
  });

  it('면: 낮은 원기둥 칸을 얕게 뚫는 안내 선 — 커서가 X 쪽이면 exactPx로 Q를 받고(exact, 같은 칸), 다른 근·같은 평면이 아닌 이웃 칸은 받지 않는다', () => {
    const { T, Q, X, tri } = guideCase(4.4, 5, -1);
    const f = computeFrame(camAt(Q, lookRing(Q), 15), 800, 600, { center: [0, 0, 30], radius: 90 });
    const sx = scr(f, X), sq = scr(f, Q);
    const line = { origin: T, dir: GD };
    const gap = sgap(sx, sq);
    expect(gap).toBeGreaterThan(SNAP);
    expect(gap).toBeLessThanOrEqual(EXACT_PX);
    const [x, y] = beyondX(sx, sq, 3);
    expect(acceptFacePatch(f, X, Q, line, triOf(LOW27, tri), [], x, y, SNAP)).toBeNull();
    const r = acceptFacePatch(f, X, Q, line, triOf(LOW27, tri), [triOf(LOW27, tri ^ 1)], x, y, SNAP, EXACT_PX);
    expect(r).not.toBeNull();
    expect(r!.exact).toBe(true);
    expect(dist(r!.p, Q)).toBeLessThan(1e-9);
    expect(acceptFacePatch(f, X, Q, line, triOf(LOW27, tri), [], x, y, SNAP, gap - 0.5)).toBeNull();
    const other = cylRoot(T, GD, add(Q, mul(GD, 50)))!;
    expect(dist(other, Q)).toBeGreaterThan(1);
    expect(acceptFacePatch(f, X, other, line, triOf(LOW27, tri), [], x, y, SNAP, 1e9)).toBeNull();
    const nextCell = tri % 2 === 0 ? tri - 1 : tri + 1;
    expect(acceptFacePatch(f, X, Q, line, triOf(LOW27, nextCell), [], x, y, SNAP, 1e9)).toBeNull();
    // 세계 상한: 코어 점이 칸 크기(이 칸은 높이 60 — 가장 먼 꼭짓점 사이)보다 멀면 받지 않는다
    const span = Math.max(...triOf(LOW27, tri).flatMap((a) => triOf(LOW27, tri).map((b) => dist(a, b))));
    const far = add(X, mul(norm(sub(X, Q)), span + 0.5));
    expect(dist(far, Q)).toBeGreaterThan(span);
    expect(projectToScreen(f, far)).not.toBeNull();
    expect(acceptFacePatch(f, far, Q, line, triOf(LOW27, tri), [], x, y, SNAP, 1e9)).toBeNull();
    expect(acceptFacePatch(f, add(X, mul(norm(sub(X, Q)), 1)), Q, line, triOf(LOW27, tri), [], x, y, SNAP, 1e9)).not.toBeNull();
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
interface Calls {
  closed: number;
  open: number;
}
const circleRefine = (calls: Calls): MeasureSnapOptions['refine'] => (c) => {
  if (c.kind !== 'axisEdge' || !c.line || c.segment.id !== '원') return null;
  if (c.open) calls.open++;
  else calls.closed++;
  return circleRoot(c.line.origin, c.line.dir, c.point);
};
const cylRefine = (calls: Calls) => (c: SnapRefineFaceInput): V3 | null => {
  if (c.face.id !== '원기둥' || Math.abs(c.face.normal[2]) > 1e-3) return null;
  if (c.open) calls.open++;
  else calls.closed++;
  return cylRoot(c.line.origin, c.line.dir, c.point);
};
function snapOptions(o: { refine?: MeasureSnapOptions['refine']; refineFace?: MeasureSnapOptions['refineFace']; points: V3[]; exact: boolean }): MeasureSnapOptions {
  return {
    points: o.points.map((point) => ({ point, kind: 'point' as const })),
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
    ...(o.refine ? { refine: o.refine } : {}),
    ...(o.refineFace ? { refineFace: o.refineFace } : {}),
    ...(o.exact ? { refineSnapToExact: true } : {}),
  };
}
/** 장면을 주고 위에서 물러나 첫 점(앱 점 — 눌러 찍는다)·끌어온 점·기준 선분(지나간다)을 둔 뒤 cam으로 옮긴 뷰어 */
function view(scene: Scene3d, opts: MeasureSnapOptions, cam: CameraState, o: { tracks?: V3[]; first?: V3; refAt?: V3; lock?: boolean }): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  const w: View = { v, canvas: v.canvas as unknown as FakeElement };
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera(camAt([9, -12, 0], [0.05, -0.35, 1], 210));
  v.setMeasureMode(true);
  v.setMeasureSnap(opts);
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

describe('Viewer3d: refineSnapToExact(0.39.0) — 커서가 X 쪽인 얕은 교차를 같은 교차의 정확한 자리로', () => {
  it('꺾은선 원의 첫 점 X축·끌어온 점 X축·잠근 X축: 끄면 X(현 위, 0.38.0과 같다), 켜면 Q(같은 토막·원 위·그 축 위) — 앱 호출 수는 같다', () => {
    for (const sgn of [-1, 1])
      for (const how of ['first', 'track', 'lock'] as const) {
        const { F, Q, X, k } = axisCase(4.4, sgn);
        const res: { p: V3; refined: boolean; index?: number; calls: Calls }[] = [];
        for (const exact of [false, true]) {
          const calls: Calls = { closed: 0, open: 0 };
          const opts = snapOptions({ refine: circleRefine(calls), points: how === 'track' ? [] : [F], exact });
          const w = view(SC90, opts, camAt(Q, lookRing(Q), 15), how === 'track' ? { tracks: [F] } : { first: F, lock: how === 'lock' });
          const sx = at(w, X), sq = at(w, Q);
          expect(sgap(sx, sq)).toBeGreaterThan(SNAP);
          expect(sgap(sx, sq)).toBeLessThanOrEqual(EXACT_PX);
          hover(w, ...beyondX(sx, sq, 3));
          const h = w.v.measureHoverSnap!;
          const key = `${sgn} ${how} ${exact}`;
          expect(h, key).toMatchObject({ snap: 'axis', axis: 'x', segment: { id: '원' } });
          if (how === 'track') expect(h.trackFrom, key).toEqual(F);
          if (how === 'lock') expect(h.locked, key).toBe(true);
          expect([h.point[1], h.point[2]], key).toEqual([F[1], F[2]]);
          res.push({ p: h.point, refined: !!h.refined, index: h.segment?.index, calls });
          w.v.dispose();
        }
        const key = `${sgn} ${how}`;
        expect(res[0]!.refined, key).toBe(false);
        expect(dist(res[0]!.p, X), key).toBeLessThan(1e-6);
        expect(res[1]!.refined, key).toBe(true);
        expect(onCircle(res[1]!.p), key).toBe(true);
        expect(dist(res[1]!.p, Q), key).toBeLessThan(1e-9);
        expect(res[1]!.index, key).toBe(k);
        expect(res[0]!.index, key).toBe(k);
        expect(res[1]!.calls, key).toEqual(res[0]!.calls);
      }
  });

  it('찍으면 측정 둘째 점도 Q다(첫 점 X축 — 거리는 |F − Q|)', () => {
    const { F, Q, X } = axisCase(4.4, 1);
    const w = view(SC90, snapOptions({ refine: circleRefine({ closed: 0, open: 0 }), points: [F], exact: true }), camAt(Q, lookRing(Q), 15), { first: F });
    const [x, y] = beyondX(at(w, X), at(w, Q), 3);
    hover(w, x, y);
    ptr(w, 'pointerdown', x, y, 1);
    ptr(w, 'pointerup', x, y, 0);
    w.v.renderNow();
    expect(w.v.measurePoints.length).toBe(2);
    expect(dist(w.v.measurePoints[1]!.point, Q)).toBeLessThan(1e-9);
    expect(w.v.measureSnap?.refineSnapToExact).toBe(true);
    w.v.dispose();
  });

  it('끌어온 점 안내 선(27° 기준과 나란함)도 같다 — 켜면 그 안내 선 위 원 위 교차', () => {
    const ring27 = ring((DEG - 90) * D);
    const G: V3 = [66, -72, 0];
    const ref: LineSet3d = { id: '기준', name: '기준', positions: new Float32Array([...G, ...add(G, mul([Math.cos(DEG * D), Math.sin(DEG * D), 0], 39))]), color: [0.2, 0.6, 0.9, 1] };
    const gd = norm([ref.positions[3]! - ref.positions[0]!, ref.positions[4]! - ref.positions[1]!, 0]);
    const sc: Scene3d = { name: 'ring27', units: 'mm', meshes: [], lines: [ring27, ref], points: [] };
    for (const sgn of [-1, 1]) {
      const w0 = 4.4 * HS;
      const n0: V3 = [Math.cos((DEG - 90) * D), Math.sin((DEG - 90) * D), 0];
      const P0 = mul(n0, R * Math.cos(w0));
      const T = sub(P0, mul(gd, 45));
      const Q = circleRoot(T, gd, add(P0, mul(gd, sgn * R * Math.sin(w0))))!;
      const { X } = crossing(ring27, T, gd, Q);
      for (const exact of [false, true]) {
        const w = view(sc, snapOptions({ refine: circleRefine({ closed: 0, open: 0 }), points: [], exact }), camAt(Q, lookRing(Q), 15), { tracks: [T], refAt: add(G, mul(gd, 18.39)) });
        const sx = at(w, X), sq = at(w, Q);
        expect(sgap(sx, sq)).toBeGreaterThan(SNAP);
        hover(w, ...beyondX(sx, sq, 3));
        const h = w.v.measureHoverSnap!;
        const key = `${sgn} ${exact}`;
        expect(h, key).toMatchObject({ snap: 'parallel', segment: { id: '원' } });
        expect(lineGap(h.point, T, gd), key).toBeLessThan(1e-9);
        if (exact) {
          expect(h.refined, key).toBe(true);
          expect(onCircle(h.point), key).toBe(true);
          expect(dist(h.point, Q), key).toBeLessThan(1e-6);
        } else {
          expect(h, key).not.toHaveProperty('refined');
          expect(dist(h.point, X), key).toBeLessThan(1e-6);
        }
        w.v.dispose();
      }
    }
  });

  it('낮은 원기둥의 안내 선(칸 반각의 4.4배)·첫 점 X축: 켜면 칸 위 곡면 교차(원기둥 위·그 선 위), 끄면 X — 앱 호출 수는 같다', () => {
    const SC27: Scene3d = { name: 'low27', units: 'mm', meshes: [LOW27], lines: [REF], points: [] };
    const SCL90: Scene3d = { name: 'low90', units: 'mm', meshes: [LOW90], lines: [REF], points: [] };
    for (const sgn of [-1, 1]) {
      const g = guideCase(4.4, 5, sgn);
      const w0 = 4.4 * HS;
      const F: V3 = [-45, -R * Math.cos(w0), 5];
      const Qa: V3 = [sgn * R * Math.sin(w0), -R * Math.cos(w0), 5];
      const Xa = pierce(LOW90, F, [1, 0, 0], Qa).X;
      for (const kind of ['guide', 'axis'] as const) {
        const calls: Calls[] = [];
        for (const exact of [false, true]) {
          const c: Calls = { closed: 0, open: 0 };
          calls.push(c);
          const Q = kind === 'guide' ? g.Q : Qa, X = kind === 'guide' ? g.X : Xa;
          const opts = { ...snapOptions({ refine: () => null, refineFace: cylRefine(c), points: kind === 'axis' ? [F] : [], exact }), throughTranslucent: true };
          const w =
            kind === 'guide'
              ? view(SC27, opts, camAt(Q, lookRing(Q), 15), { tracks: [g.T], refAt: add(G0, mul(GD, 20.013)) })
              : view(SCL90, opts, camAt(Q, lookRing(Q), 15), { first: F });
          const sx = at(w, X), sq = at(w, Q);
          const key = `${sgn} ${kind} ${exact}`;
          expect(sgap(sx, sq), key).toBeGreaterThan(SNAP);
          expect(sgap(sx, sq), key).toBeLessThanOrEqual(EXACT_PX);
          hover(w, ...beyondX(sx, sq, 3));
          const h = w.v.measureHoverSnap!;
          expect(h, key).toMatchObject({ snap: kind === 'guide' ? 'parallel' : 'axis', face: { id: '원기둥' } });
          if (exact) {
            expect(h.refined, key).toBe(true);
            expect(onCyl(h.point), key).toBe(true);
            expect(dist(h.point, Q), key).toBeLessThan(1e-6);
          } else {
            expect(h, key).not.toHaveProperty('refined');
            expect(dist(h.point, X), key).toBeLessThan(1e-6);
          }
          w.v.dispose();
        }
        expect(calls[1], `${sgn} ${kind}`).toEqual(calls[0]);
      }
    }
  });

  it('아주 가까이 확대해 X와 Q가 화면에서 상한(3 × 붙잡기 거리)보다 멀면 켜도 X 그대로다', () => {
    const { F, Q, X } = axisCase(4.4, -1);
    let d = 15;
    let w: View | null = null;
    for (; d > 0.5; d *= 0.8) {
      w?.v.dispose();
      w = view(SC90, snapOptions({ refine: circleRefine({ closed: 0, open: 0 }), points: [F], exact: true }), camAt(Q, lookRing(Q), d), { first: F });
      if (sgap(at(w, X), at(w, Q)) > EXACT_PX + 2) break;
    }
    const sx = at(w!, X), sq = at(w!, Q);
    expect(sgap(sx, sq)).toBeGreaterThan(EXACT_PX);
    hover(w!, ...beyondX(sx, sq, 3));
    const h = w!.v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'axis', segment: { id: '원' } });
    expect(h).not.toHaveProperty('refined');
    expect(dist(h.point, X)).toBeLessThan(1e-6);
    w!.v.dispose();
  });

  it('X 둘레 화면 격자(11 × 11, 2화소 칸 — 칸 반각의 2.2·4.4배 × 두 근): 켜면 다듬은 점은 모두 그 축 위 원 위의 X에 가까운 근이고, 남은 현 위 점은 모두 X와 Q가 상한보다 멀다', () => {
    let moved = 0, left = 0;
    for (const m of [2.2, 4.4])
      for (const sgn of [-1, 1]) {
        const { F, Q, X } = axisCase(m, sgn);
        const ws = [false, true].map((exact) => view(SC90, snapOptions({ refine: circleRefine({ closed: 0, open: 0 }), points: [F], exact }), camAt(Q, lookRing(Q), 15), { first: F }));
        const c = at(ws[1]!, X);
        for (let iy = -5; iy <= 5; iy++)
          for (let ix = -5; ix <= 5; ix++) {
            const x = c[0] + ix * 2 + 0.211, y = c[1] + iy * 2 - 0.173;
            const hs = ws.map((w) => {
              hover(w, x, y);
              return w.v.measureHoverSnap;
            });
            const [off, on] = hs;
            const k = `${m} ${sgn} ${ix},${iy}`;
            if (JSON.stringify(off) === JSON.stringify(on)) {
              if (on?.snap === 'axis' && on.segment?.id === '원' && !on.refined) {
                left++;
                const q = circleRoot(F, [1, 0, 0], on.point)!;
                expect(sgap(at(ws[1]!, on.point), at(ws[1]!, q)), k).toBeGreaterThan(EXACT_PX);
              }
              continue;
            }
            // 바뀐 자리: 끄면 현 위 X(다듬지 않음), 켜면 같은 토막·그 X에 가장 가까운 원 위 근
            expect(off, k).toMatchObject({ snap: 'axis', segment: { id: '원' } });
            expect(off!.refined, k).toBeUndefined();
            expect(on!.refined, k).toBe(true);
            expect(on!.segment, k).toEqual(off!.segment);
            expect(dist(on!.point, circleRoot(F, [1, 0, 0], off!.point)!), k).toBeLessThan(1e-9);
            moved++;
          }
        for (const w of ws) w.v.dispose();
      }
    expect(moved).toBeGreaterThan(40);
    expect(left).toBeGreaterThanOrEqual(0);
  });

  it('refine·refineFace 없이 refineSnapToExact만 주면 붙잡기는 켜지지 않는다', () => {
    const host = dom.host();
    host.rect = { left: 0, top: 0, width: 800, height: 600 };
    const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
    v.setScene(SC90);
    v.setMeasureSnap({ refineSnapToExact: true });
    expect(v.measureSnap).toBeNull();
    v.dispose();
  });
});
