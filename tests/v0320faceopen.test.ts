/**
 * 0.32.0 안내 선의 면의 열린 교차(MeasureInference.trackDirs { meets: { openFaces: true } }): 끌어온 점의 나란함·수직 선이 구를 나눈 삼각형을 뚫지 않고
 * 삼각형과 곡면 사이만 지날 때 앱 refineFace('axisFace', open — 축 이름 없는 그 선)가 준 구 위 교차에 붙는다(0.22.0 축의 면의 열린 교차와 같은 규칙).
 * - 값(snap·trackFrom·edge·face·refined, 잠글 방향 없음), 두 근(커서 쪽), 기억·호출 한도, 찍은 점
 * - 켜지 않으면(또는 refineFace가 없거나 null만 주면) 0.31.0과 같은지(화면 격자·안내 선을 따라), 켜면 바뀐 자리는 모두 구 위 교차인지, open(토막)과 함께 줘도 같은지
 * 장면: 반지름 30 구(경도 24칸·위도 12칸)를 Z축 둘레로 −7.5° 돌려 적도 칸 가운데가 경도 0°에 오게 하고, 기준 선분 '기준'(방향 D = (0, 1, 2)/√5 — 끝점이 정수),
 * 끌어온 점 P = (29.85, 20, 40). P의 나란한 선(방향 D)은 x = 29.85 평면 위에서 중심에서 29.85(적도 칸 현 30·cos7.5° = 29.74보다 바깥, 구 30보다 안)를 지나
 * 그물은 비켜 가며 구를 C0 ± D·ZH에서 뚫는다(C0 = (29.85, 0, 0)).
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { dirToAngles } from '../src/camera';
import { normalizeInference, normalizeTrackDirs } from '../src/inference';
import type { V3 } from '../src/math';
import { OPEN_REFINE_CALLS, type SnapRefineFaceInput } from '../src/snap';
import { sphereMesh } from '../src/synth';
import { type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';

const R = 30;
const deg = (a: number): number => (a * Math.PI) / 180;
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const along = (o: readonly number[], d: readonly number[], t: number): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t];
const offLine = (p: readonly number[], o: readonly number[], d: readonly number[]): number => {
  const t = (p[0]! - o[0]!) * d[0]! + (p[1]! - o[1]!) * d[1]! + (p[2]! - o[2]!) * d[2]!;
  return dist(p, along(o, d, t));
};
/** 직선(o, d)과 구(중심 0, 반지름 R)의 교차 가운데 near에 가까운 근(far면 먼 근) */
function lineSphere(o: readonly number[], d: readonly number[], near: readonly number[], far = false): V3 | null {
  const a = d[0]! * d[0]! + d[1]! * d[1]! + d[2]! * d[2]!, b = o[0]! * d[0]! + o[1]! * d[1]! + o[2]! * d[2]!, k = o[0]! ** 2 + o[1]! ** 2 + o[2]! ** 2 - R * R;
  const disc = b * b - a * k;
  if (disc < 0) return null;
  const ts = [(-b - Math.sqrt(disc)) / a, (-b + Math.sqrt(disc)) / a].map((t) => along(o, d, t));
  const i = dist(ts[0]!, near) <= dist(ts[1]!, near) ? 0 : 1;
  return ts[far ? 1 - i : i]!;
}

/** 구를 Z축 둘레로 a만큼 돌린 그물(위치·법선) */
function rotated(m: Mesh3d, a: number): Mesh3d {
  const c = Math.cos(a), s = Math.sin(a);
  const rot = (src: Float32Array): Float32Array => {
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      out[i] = c * src[i]! - s * src[i + 1]!;
      out[i + 1] = s * src[i]! + c * src[i + 1]!;
      out[i + 2] = src[i + 2]!;
    }
    return out;
  };
  return { ...m, positions: rot(m.positions), normals: m.normals ? rot(m.normals as Float32Array) : undefined };
}
const SPH = rotated(sphereMesh('구', [0, 0, 0], R, 24, 12, [0.6, 0.6, 0.7, 1]), deg(-7.5));
const D: V3 = [0, 1 / Math.sqrt(5), 2 / Math.sqrt(5)];
const RHO = 29.85;
const C0: V3 = [RHO, 0, 0];
const ZH = Math.sqrt(R * R - RHO * RHO);
const P: V3 = [RHO, 20, 40];
const HIT = along(C0, D, ZH);
const LOW = along(C0, D, -ZH);
const R0: V3 = [60, -40, -20];
const R1: V3 = [60, -30, 0];
const refLine: LineSet3d = { id: '기준', positions: new Float32Array([...R0, ...R1]) };
const scene: Scene3d = { name: 'f', units: 'mm', meshes: [SPH], lines: [refLine], points: [] };

/** 앱의 정확한 구: 'axisFace'면 그 직선과 구의 교차(point에 가까운 근), 그 밖은 null */
const sphereRefine =
  (calls: SnapRefineFaceInput[] = []) =>
  (c: SnapRefineFaceInput): V3 | null => {
    calls.push(c);
    return c.kind === 'axisFace' && c.face.id === '구' ? lineSphere(c.line.origin, c.line.dir, c.point) : null;
  };

// ───────────── 순수: 선택 펴기 ─────────────
describe('normalizeTrackDirs: meets.openFaces(0.32.0)', () => {
  it('openFaces가 true일 때만 meetOpenFaces — meets도 켠다, open과 따로', () => {
    expect(normalizeTrackDirs({ meets: { openFaces: true } })).toEqual({ meets: true, meetOpenFaces: true });
    expect(normalizeTrackDirs({ meets: { openFaces: false } })).toEqual({ meets: true });
    expect(normalizeTrackDirs({ meets: { open: true, openFaces: true, guides: true } })).toEqual({ meets: true, meetGuides: true, meetOpen: true, meetOpenFaces: true });
    expect(normalizeTrackDirs({ meets: { open: true } })).toEqual({ meets: true, meetOpen: true });
    expect(normalizeInference({ track: true, trackDirs: { meets: { openFaces: true } } })!.trackDirs).toEqual({ meets: true, meetOpenFaces: true });
  });
});

// ───────────── 뷰어 ─────────────
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

const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as FakeElement).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const hoverXY = (v: Viewer3d, x: number, y: number): MeasureHoverSnap | null => {
  ptr(v, 'pointermove', x, y, 0);
  v.renderNow();
  return v.measureHoverSnap;
};
const clickXY = (v: Viewer3d, x: number, y: number): void => {
  hoverXY(v, x, y);
  ptr(v, 'pointerdown', x, y, 1);
  ptr(v, 'pointerup', x, y, 0);
  v.renderNow();
};
const scr = (v: Viewer3d, p: readonly number[]): { x: number; y: number } => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
type Meets = boolean | { guides?: boolean; open?: boolean; openFaces?: boolean };
type RefineFace = ((c: SnapRefineFaceInput) => readonly number[] | null | undefined) | null;
const opts = (meets: Meets, refineFace: RefineFace = null) => ({ refineFace, refine: null, inference: { track: true, trackDirs: { meets } } });
const FACES = { openFaces: true };
const isRef = (e: readonly (readonly number[])[] | undefined): boolean => !!e && dist(e[0]!, R0) < 1e-6 && dist(e[1]!, R1) < 1e-6;

/** 기준 선분을 지나간 뒤 끌어온 점 P를 주고 구를 스치는 자리 둘레로 다가간 뷰 */
function make(meets: Meets, refineFace: RefineFace = null): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  v.setMeasureSnap(opts(meets, refineFace));
  const m = scr(v, along(R0, [0, 0.5, 1], 11));
  expect(hoverXY(v, m.x + 0.4, m.y + 0.3)).toMatchObject({ segment: { id: '기준' } });
  v.setMeasureTrackPoints([P]);
  const a = dirToAngles([Math.cos(deg(20)), Math.sin(deg(20)), 0.25]);
  v.setCamera({ ...v.getCamera(), yaw: a.yaw, pitch: a.pitch, target: [HIT[0], HIT[1], 0], distance: 40, projection: 'perspective' });
  v.renderNow();
  return v;
}

describe('안내 선의 면의 열린 교차(0.32.0 inference.trackDirs { meets: { openFaces: true } })', () => {
  it('전제: 안내 선(P, D)은 그물을 뚫지 않고(적도 칸 현 바깥) 구를 두 점에서 뚫는다', () => {
    expect(RHO).toBeGreaterThan(R * Math.cos(deg(7.5)));
    expect(dist(HIT, [0, 0, 0])).toBeCloseTo(R, 12);
    expect(offLine(P, C0, D)).toBeLessThan(1e-12);
    // 적도 칸(경도 −7.5°~7.5°, 위도 0°~15°) 안
    expect(Math.abs(Math.atan2(HIT[1], HIT[0]))).toBeLessThan(deg(7.5));
    expect(Math.asin(HIT[2] / R)).toBeGreaterThan(0);
    expect(Math.asin(HIT[2] / R)).toBeLessThan(deg(15));
  });

  it('구를 스치는 자리를 앱이 준 구 위 교차로 붙잡는다 — snap·trackFrom·edge·face·refined, 잠글 방향 없음, 기억·호출 한도', () => {
    const calls: SnapRefineFaceInput[] = [];
    const v = make(FACES, sphereRefine(calls));
    const s = scr(v, HIT);
    const h = hoverXY(v, s.x + 1, s.y + 2)!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: P, refined: true, face: { id: '구' } });
    expect(isRef(h.edge)).toBe(true);
    expect(dist(h.point, HIT)).toBeLessThan(1e-9);
    expect(h).not.toHaveProperty('direction');
    expect(h).not.toHaveProperty('axis');
    expect(h.face!.normal[0]).toBeGreaterThan(0.9);
    const open = calls.filter((c) => c.open);
    expect(open.length).toBeGreaterThanOrEqual(1);
    expect(open.length).toBeLessThanOrEqual(OPEN_REFINE_CALLS);
    expect(open.every((c) => c.kind === 'axisFace' && c.face.id === '구' && c.first === null && !('axis' in c.line))).toBe(true);
    const hit = open.find((c) => offLine(c.line.origin, P, D) < 1e-9 && Math.abs(Math.abs(c.line.dir[1] * D[1] + c.line.dir[2] * D[2]) - 1) < 1e-12)!;
    expect(hit).toBeDefined();
    // 같은 자리 둘레를 다시 가리켜도 다시 부르지 않는다
    const n = calls.length;
    hoverXY(v, s.x + 2, s.y + 1);
    expect(calls.length).toBe(n);
    // 찍으면 그 점(면·끌어온 점·기준)
    clickXY(v, s.x + 2, s.y + 1);
    const p0 = v.measurePoints[0]!;
    expect(p0).toMatchObject({ snap: 'parallel', trackFrom: P, refined: true, face: { id: '구' } });
    expect(dist(p0.point, HIT)).toBeLessThan(1e-9);
  });

  it('아래 근 둘레를 가리키면 아래 칸 삼각형 위의 교차 — 커서 쪽 근', () => {
    const v = make(FACES, sphereRefine());
    const s = scr(v, LOW);
    const h = hoverXY(v, s.x + 1, s.y + 2)!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: P, refined: true, face: { id: '구' } });
    expect(dist(h.point, LOW)).toBeLessThan(1e-9);
  });

  it('켜지 않거나 refineFace가 없거나 null·먼 근·선에서 벗어난 점만 주면 0.31.0과 같다(화면 격자·안내 선을 따라), 켜면 바뀐 자리는 모두 구 위 교차', () => {
    const sweep = (meets: Meets, refineFace: RefineFace): (MeasureHoverSnap | null)[] => {
      const v = make(meets, refineFace);
      const out: (MeasureHoverSnap | null)[] = [];
      for (let j = 0; j < 9; j++) for (let i = 0; i < 12; i++) out.push(hoverXY(v, 40 + i * 62.3, 30 + j * 61.7));
      for (let t = -6; t <= 6; t += 0.25) {
        const s = scr(v, along(C0, D, t));
        out.push(hoverXY(v, s.x + 1, s.y + 2));
      }
      v.dispose();
      return out;
    };
    const plain = sweep(true, null);
    // 0.31.0 꼴 선택(meets: true·{ open: true }·openFaces: false)과 refineFace가 있어도 openFaces를 켜지 않으면 같다
    expect(sweep({ open: true }, sphereRefine())).toEqual(plain);
    expect(sweep({ openFaces: false }, sphereRefine())).toEqual(plain);
    expect(sweep(true, sphereRefine())).toEqual(plain);
    // 켜도 앱이 받을 점을 주지 않으면 같다(먼 근·선에서 벗어난 점 — 'axisFace'만 답한다: 'onFace'는 0.21.0 면 위 점 다듬기라 따로)
    for (const refineFace of [
      null,
      () => null,
      (c: SnapRefineFaceInput) => (c.kind === 'axisFace' ? lineSphere(c.line.origin, c.line.dir, c.point, true) : null),
      (c: SnapRefineFaceInput) => {
        const q = c.kind === 'axisFace' ? lineSphere(c.line.origin, c.line.dir, c.point) : null;
        return q ? [q[0] + 0.3, q[1], q[2]] : null;
      },
    ] as RefineFace[])
      expect(sweep(FACES, refineFace)).toEqual(plain);
    const on = sweep(FACES, sphereRefine());
    let moved = 0;
    for (let i = 0; i < on.length; i++) {
      if (JSON.stringify(on[i]) === JSON.stringify(plain[i])) continue;
      moved++;
      const h = on[i]!;
      expect(h).toMatchObject({ snap: 'parallel', trackFrom: P, refined: true, face: { id: '구' } });
      expect(dist(h.point, [0, 0, 0])).toBeCloseTo(R, 9);
      expect(offLine(h.point, P, D)).toBeLessThan(1e-9);
    }
    expect(moved).toBeGreaterThan(4);
    // open(토막)과 함께 줘도 같다(이 장면에는 꺾은선이 없다)
    expect(sweep({ open: true, openFaces: true }, sphereRefine())).toEqual(on);
  });
});
