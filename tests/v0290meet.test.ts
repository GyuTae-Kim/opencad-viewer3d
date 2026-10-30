/**
 * 0.29.0 끌어온 점의 나란함·수직 선이 만나는 점(MeasureInference.trackDirs { meets: true }): 뷰어 측정 붙잡기가 그 선과 첫 점 축·첫 점의 나란함·다른 끌어온 점의 축,
 * 커서 둘레 선분, 커서 아래 그물 면이 만나는 점에 붙는지, 실리는 값(snap·trackFrom·edge와 만난 것), 첫 점 축과 만나면 Shift·잠금 단추가 그 축에 잠그는지,
 * 앱 refine('axisEdge')·refineFace('axisFace')가 그 선(축 이름 없음)으로 다듬는지, 켜지 않으면 0.28.0과 같은지(true·{}·{ meets: false }의 화면 격자 미리 보기),
 * 켜면 바뀐 자리는 모두 만나는 점인지.
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { normalizeInference } from '../src/inference';
import type { V3 } from '../src/math';
import type { SnapRefineFaceInput, SnapRefineInput } from '../src/snap';
import { type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';

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
const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
const along = (o: readonly number[], d: readonly number[], t: number): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t];

/**
 * 평면 장면(0.28.0 시험과 같은 자리): 끌어온 점 E = (80, 20, 0), 기준 선분 '기준' (20, 60, 0) → (60, 90, 0)(방향 (0.8, 0.6, 0)), 첫 점 A = (0, 0, 0)('가'의 끝).
 * E에서 기준과 나란한 선은 첫 점 X축과 (53.33, 0, 0), Y축과 (0, −40, 0)에서, 수직인 선(방향 (0.6, −0.8, 0))은 X축과 (95, 0, 0)에서 만난다.
 * '십' (30, −20, 0) → (60, 10, 0)은 E에서 나란한 선과 (40, −10, 0)에서 만난다(가운데 점 (45, −5)과 떨어진 자리).
 * 다른 끌어온 점 Q = (30, −30, 0)의 X축은 E에서 나란한 선과 (13.33, −30, 0)에서 만난다
 */
const A: V3 = [0, 0, 0];
const E: V3 = [80, 20, 0];
const Q: V3 = [30, -30, 0];
const R0: V3 = [20, 60, 0], R1: V3 = [60, 90, 0];
const PAR: V3 = [0.8, 0.6, 0];
const PERP: V3 = [0.6, -0.8, 0];
const MEET_X = along(E, PAR, -100 / 3); // (53.33, 0, 0)
const MEET_PERP_X = along(E, PERP, 25); // (95, 0, 0)
const MEET_SEG = along(E, PAR, -50); // (40, −10, 0)
const MEET_Q = along(E, PAR, -250 / 3); // (13.33, −30, 0)
const LINE_GA: LineSet3d = { id: '가', positions: new Float32Array([...A, 0, -20, 0]) };
const LINE_REF: LineSet3d = { id: '기준', positions: new Float32Array([...R0, ...R1]) };
const LINE_SIP: LineSet3d = { id: '십', positions: new Float32Array([30, -20, 0, 60, 10, 0]) };
/** 범위는 만나는 자리가 모두 화면 안에 들게 넓게 준다 */
const flatScene: Scene3d = { name: 'm', units: 'mm', meshes: [], lines: [LINE_GA, LINE_REF, LINE_SIP], points: [], bounds: { min: [-30, -60, 0], max: [120, 100, 0] } };

/**
 * 면 장면: 바닥 '판'(z = 0, −40~40), 떠 있는 끌어온 점 F = (0, 0, 10), 기준 선분 '빗' (20, 20, 0) → (40, 20, 20)(방향 (1, 0, 1)/√2).
 * F에서 기준과 나란한 선은 바닥을 (−10, 0, 0)에서 뚫는다
 */
const F: V3 = [0, 0, 10];
const S0: V3 = [20, 20, 0], S1: V3 = [40, 20, 20];
const SQ = Math.SQRT1_2;
const MEET_FLOOR = along(F, [SQ, 0, SQ], -10 / SQ); // (−10, 0, 0)
const FLOOR: Mesh3d = {
  id: '판',
  positions: new Float32Array([-40, -40, 0, 40, -40, 0, 40, 40, 0, -40, 40, 0]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  color: [0.6, 0.65, 0.7, 1],
};
const LINE_SLANT: LineSet3d = { id: '빗', positions: new Float32Array([...S0, ...S1]) };
const faceScene: Scene3d = { name: 'f', units: 'mm', meshes: [FLOOR], lines: [LINE_SLANT], points: [] };

function make(scene: Scene3d = flatScene, mode: 'wireframe' | 'shaded' = 'wireframe'): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: mode });
  views.push(v);
  v.setScene(scene);
  v.setView(scene === flatScene ? 'top' : 'swIso', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  return v;
}
/** 선분 p–q의 t 자리 옆(0.4·0.3화소)을 가리킨다 — 지나간 선분 */
const pass = (v: Viewer3d, p: readonly number[], q: readonly number[], t = 0.5): void => {
  const s = scr(v, along(p, [q[0]! - p[0]!, q[1]! - p[1]!, q[2]! - p[2]!], t));
  hoverXY(v, s.x + 0.4, s.y + 0.3);
};
const passRef = (v: Viewer3d): void => {
  pass(v, R0, R1, 0.8);
  expect(v.measureHoverSnap).toMatchObject({ segment: { id: '기준' } });
};
const hoverAt = (v: Viewer3d, p: readonly number[], dx = 2, dy = 1): MeasureHoverSnap | null => {
  const s = scr(v, p);
  hoverXY(v, s.x + dx, s.y + dy);
  return v.measureHoverSnap;
};
const clickA = (v: Viewer3d): void => {
  const a = scr(v, A);
  clickXY(v, a.x + 0.4, a.y + 0.3);
  expect(v.measurePointCount).toBe(1);
};
const isRef = (e: readonly (readonly number[])[] | undefined, p: V3 = R0, q: V3 = R1): boolean => !!e && dist(e[0]!, p) < 1e-6 && dist(e[1]!, q) < 1e-6;
const MEETS = { edges: true, inference: { axes: true, parallel: true, track: true, trackDirs: { meets: true } } } as const;

describe('끌어온 점 안내 선이 만나는 점(0.29.0 inference.trackDirs { meets })', () => {
  it('normalizeInference: meets가 true일 때만 { meets: true }(edge와 함께도), false·없음·{}는 true(0.28.0과 같은 꼴)', () => {
    const fn = (): boolean => true;
    expect(normalizeInference({ track: true, trackDirs: { meets: true } })!.trackDirs).toEqual({ meets: true });
    expect(normalizeInference({ track: true, trackDirs: { edge: fn, meets: true } })!.trackDirs).toEqual({ edge: fn, meets: true });
    expect(normalizeInference({ track: true, trackDirs: { edge: fn, meets: false } })!.trackDirs).toEqual({ edge: fn });
    for (const o of [{}, { meets: false }, { meets: 1 as unknown as boolean }, { edge: null, meets: undefined }]) expect(normalizeInference({ track: true, trackDirs: o })!.trackDirs).toBe(true);
    const v = make();
    v.setMeasureSnap(MEETS);
    expect((v.measureSnap!.inference as { trackDirs: unknown }).trackDirs).toEqual({ meets: true });
  });

  it('첫 점 축과 만나는 점: snap은 안내 종류, trackFrom·edge(기준 선분)에 axis·direction — 점은 축 위 그대로(y·z가 정확히 0)', () => {
    const v = make();
    v.setMeasureSnap(MEETS);
    clickA(v);
    v.setMeasureTrackPoints([E]);
    passRef(v);
    const h = hoverAt(v, MEET_X)!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: E, axis: 'x', direction: [1, 0, 0] });
    expect(isRef(h.edge)).toBe(true);
    expect(h.point[1]).toBe(0);
    expect(h.point[2]).toBe(0);
    expect(dist(h.point, MEET_X)).toBeLessThan(1e-9);
    expect(h).not.toHaveProperty('locked');
    expect(v.measureHoverLock).toEqual({ kind: 'axis', axis: 'x', direction: [1, 0, 0] });
    // 수직인 선과 X축
    const p = hoverAt(v, MEET_PERP_X)!;
    expect(p).toMatchObject({ snap: 'perpendicular', trackFrom: E, axis: 'x', direction: [1, 0, 0] });
    expect(dist(p.point, MEET_PERP_X)).toBeLessThan(1e-9);
    // 나란한 선과 Y축
    const y = hoverAt(v, along(E, PAR, -100))!;
    expect(y).toMatchObject({ snap: 'parallel', trackFrom: E, axis: 'y', direction: [0, 1, 0] });
    expect(y.point[0]).toBe(0);
  });

  it('잠금 단추·Shift는 그 축에 잠그고(잠근 동안은 만나는 점을 보지 않는다), 찍은 점에도 같은 값이 실린다', () => {
    const v = make();
    v.setMeasureSnap({ ...MEETS, inference: { ...MEETS.inference, lock: true } });
    clickA(v);
    v.setMeasureTrackPoints([E]);
    passRef(v);
    hoverAt(v, MEET_X);
    expect(v.setMeasureInferenceLock(true)).toBe(true);
    expect(v.measureInferenceLock).toMatchObject({ kind: 'axis', axis: 'x', direction: [1, 0, 0], source: 'api' });
    // 잠근 X축 위 — 끌어온 점 안내는 없다
    const l = hoverAt(v, MEET_X, 2, 6)!;
    expect(l).toMatchObject({ snap: 'axis', axis: 'x', locked: true });
    expect(l).not.toHaveProperty('trackFrom');
    v.setMeasureInferenceLock(false);
    let got: unknown = null;
    v.onMeasure((m) => void (got = m));
    const s = scr(v, MEET_X);
    clickXY(v, s.x + 2, s.y + 1);
    const pts = v.measurePoints;
    expect(pts.length).toBe(2);
    expect(pts[1]).toMatchObject({ snap: 'parallel', trackFrom: E, axis: 'x', direction: [1, 0, 0] });
    expect(dist(pts[1]!.point, MEET_X)).toBeLessThan(1e-9);
    expect(got).toMatchObject({ snapB: 'parallel' });
  });

  it('다른 끌어온 점의 축과 만나는 점(trackOther), 첫 점 전에도', () => {
    const v = make();
    v.setMeasureSnap(MEETS);
    v.setMeasureTrackPoints([E, Q]);
    passRef(v);
    const h = hoverAt(v, MEET_Q)!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: E, trackOther: { from: Q, axis: 'x' } });
    expect(h).not.toHaveProperty('direction');
    expect(h.point[1]).toBe(-30);
    expect(dist(h.point, MEET_Q)).toBeLessThan(1e-9);
    expect(v.measureHoverLock).toBeNull();
  });

  it('커서 둘레 선분과 만나는 점(segment) — 앱 refine은 그 선(축 이름 없음)과 선분을 받고, 다듬은 점을 쓴다', () => {
    const v = make();
    const calls: SnapRefineInput[] = [];
    v.setMeasureSnap({
      ...MEETS,
      refine: (c) => {
        if (c.kind !== 'axisEdge') return null;
        calls.push(c);
        return along(E, PAR, -50.2);
      },
    });
    v.setMeasureTrackPoints([E]);
    passRef(v);
    const h = hoverAt(v, MEET_SEG)!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: E, segment: { kind: 'line', id: '십' }, refined: true });
    expect(dist(h.point, along(E, PAR, -50.2))).toBeLessThan(1e-6);
    expect(calls.length).toBe(1);
    const c = calls[0]!;
    expect(c.line).not.toHaveProperty('axis');
    expect(dist(c.line!.origin, E)).toBe(0);
    expect(Math.abs(c.line!.dir[0] * PAR[0] + c.line!.dir[1] * PAR[1])).toBeGreaterThan(1 - 1e-9);
    expect(dist(c.point, MEET_SEG)).toBeLessThan(1e-6);
    expect(c.segment).toMatchObject({ id: '십' });
    // 만나는 점에 붙은 동안 커서 아래 선분('십')은 기준이 되지 않는다 — 다시 나란한 선 위를 가리키면 기준은 그대로
    const back = hoverAt(v, along(E, PAR, 15))!;
    expect(back).toMatchObject({ snap: 'parallel', trackFrom: E });
    expect(isRef(back.edge)).toBe(true);
    // null이면 코어 점(꺾은선과의 교차)
    const w = make();
    w.setMeasureSnap({ ...MEETS, refine: () => null });
    w.setMeasureTrackPoints([E]);
    passRef(w);
    const g = hoverAt(w, MEET_SEG)!;
    expect(g).toMatchObject({ snap: 'parallel', segment: { id: '십' } });
    expect(g).not.toHaveProperty('refined');
    expect(dist(g.point, MEET_SEG)).toBeLessThan(1e-4);
  });

  it('커서 아래 그물 면을 뚫는 점(face) — 앱 refineFace는 그 선과 면을 받는다', () => {
    const v = make(faceScene, 'shaded');
    const calls: SnapRefineFaceInput[] = [];
    v.setMeasureSnap({
      edges: true,
      inference: { track: true, trackDirs: { meets: true } },
      refineFace: (c) => {
        if (c.kind === 'axisFace') calls.push(c);
        return null;
      },
    });
    v.setMeasureTrackPoints([F]);
    pass(v, S0, S1, 0.7);
    expect(v.measureHoverSnap).toMatchObject({ segment: { id: '빗' } });
    const h = hoverAt(v, MEET_FLOOR)!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: F, face: { id: '판' } });
    expect(h.point[2]).toBeCloseTo(0, 9);
    expect(dist(h.point, MEET_FLOOR)).toBeLessThan(1e-6);
    expect(calls.length).toBe(1);
    expect(calls[0]!.line).not.toHaveProperty('axis');
    expect(calls[0]!.face).toMatchObject({ id: '판' });
    // 켜지 않으면 면 위 점(안내 선 위 점이 아니다 — 면 위에서는 그 선을 보지 않는다)
    const w = make(faceScene, 'shaded');
    w.setMeasureSnap({ edges: true, inference: { track: true, trackDirs: true } });
    w.setMeasureTrackPoints([F]);
    pass(w, S0, S1, 0.7);
    const g = hoverAt(w, MEET_FLOOR)!;
    expect(g.face).toBeUndefined();
  });

  it('켜지 않으면 0.28.0과 같다(true·{}·{ meets: false }·모두 받는 edge의 화면 격자 미리 보기 — 첫 점 전·뒤), 켜면 바뀐 자리는 모두 만나는 점이다', () => {
    const run = (trackDirs: boolean | { edge?: (() => boolean) | null; meets?: boolean }): (MeasureHoverSnap | null)[] => {
      const v = make();
      v.setMeasureSnap({ edges: true, inference: { axes: true, parallel: true, track: true, trackDirs } });
      v.setMeasureTrackPoints([E, Q]);
      const out: (MeasureHoverSnap | null)[] = [];
      const grid = (): void => {
        for (let j = 0; j < 9; j++)
          for (let i = 0; i < 12; i++) {
            hoverXY(v, ((i + 0.5) * 800) / 12 + 0.37, ((j + 0.5) * 600) / 9 + 0.21);
            out.push(v.measureHoverSnap);
          }
      };
      passRef(v);
      grid();
      clickA(v);
      passRef(v);
      grid();
      // 안내 선을 따라(만나는 자리가 드는 몫)
      for (let t = -110; t <= 20; t += 2.5) {
        const s = scr(v, along(E, PAR, t));
        hoverXY(v, s.x + 0.7, s.y + 0.4);
        out.push(v.measureHoverSnap);
      }
      return out;
    };
    const want = run(true);
    expect(want.some((h) => h?.trackFrom)).toBe(true);
    expect(run({})).toEqual(want);
    expect(run({ meets: false })).toEqual(want);
    expect(run({ edge: () => true, meets: false })).toEqual(want);
    const got = run({ meets: true });
    expect(got.length).toBe(want.length);
    let changed = 0;
    for (let i = 0; i < got.length; i++) {
      if (JSON.stringify(got[i]) === JSON.stringify(want[i])) continue;
      changed++;
      const h = got[i]!;
      expect(h.trackFrom).toBeDefined();
      expect(h.snap === 'parallel' || h.snap === 'perpendicular').toBe(true);
      expect(!!(h.direction || h.trackOther || h.segment || h.face)).toBe(true);
    }
    expect(changed).toBeGreaterThan(0);
  });

  it('기준 선분 거르기(edge)와 함께: 거른 선분을 지나도 받은 기준으로 만나는 점', () => {
    const v = make();
    v.setMeasureSnap({ ...MEETS, inference: { ...MEETS.inference, trackDirs: { edge: (s) => s.id !== '십', meets: true } } });
    clickA(v);
    v.setMeasureTrackPoints([E]);
    passRef(v);
    // 안내 선에서 떨어진 자리(가까우면 안내 선 위 점이 먼저다)
    pass(v, [30, -20, 0], [60, 10, 0], 0.9);
    expect(v.measureHoverSnap).toMatchObject({ segment: { id: '십' } });
    const h = hoverAt(v, MEET_X)!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: E, axis: 'x' });
    expect(isRef(h.edge)).toBe(true);
  });
});
