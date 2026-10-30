/**
 * 0.28.0 끌어온 점의 나란함·수직 기준 선분 거르기(MeasureInference.trackDirs { edge }): 곡선을 나눈 현을 앱이 거르면 앞 기준 선분이 남는지, 앱 함수가 받는 값,
 * 0.10.0 나란함(첫 점) 기준은 그대로인지, 주지 않으면 0.27.0과 같은지(true·{}·모두 받는 함수의 미리 보기 값이 같다), 툴팁이 끌어온 점 안내를 가리는 값.
 * 글상자 자리 fallback은 v0280label, GPU 버퍼 성분별 바이트는 v0280buffers.
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { normalizeInference } from '../src/inference';
import type { V3 } from '../src/math';
import type { SnapSegment } from '../src/snap';
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

/**
 * 0.27.0 시험과 같은 자리: 끌어온 점 E = (80, 20, 0), 기준 선분 '기준' (20, 60, 0) → (60, 90, 0)(방향 (0.8, 0.6, 0)), 첫 점 A = (0, 0, 0)('가'의 끝).
 * 더해 원(가운데 (130, 30, 0), 반지름 12)을 −45°부터 45°씩 나눈 현 여덟('호' — segmentIds 201~208, 현 0의 방향 67.5° = (0.383, 0.924, 0))과
 * 윤곽선이 있는 삼각형 그물 '판'(기운 윤곽선 (100, −10) → (120, −25) — 방향 (0.8, −0.6, 0))
 */
const A: V3 = [0, 0, 0];
const E: V3 = [80, 20, 0];
const R0: V3 = [20, 60, 0], R1: V3 = [60, 90, 0];
const PAR: V3 = [0.8, 0.6, 0];
const along = (o: readonly number[], d: readonly number[], t: number): V3 => [o[0]! + d[0]! * t, o[1]! + d[1]! * t, o[2]! + d[2]! * t];
const ARC_C: V3 = [130, 30, 0];
const arcPt = (k: number): V3 => {
  const a = ((-45 + 45 * k) * Math.PI) / 180;
  return [ARC_C[0] + 12 * Math.cos(a), ARC_C[1] + 12 * Math.sin(a), 0];
};
const ARC_POS = new Float32Array(8 * 6);
for (let k = 0; k < 8; k++) ARC_POS.set([...arcPt(k), ...arcPt(k + 1)], k * 6);
/** 현 k의 끝점(Float32 반올림 뒤 — 코어가 주는 끝점과 같게) */
const chordEnds = (k: number): [V3, V3] => [Array.from(ARC_POS.subarray(k * 6, k * 6 + 3)) as V3, Array.from(ARC_POS.subarray(k * 6 + 3, k * 6 + 6)) as V3];
const chordDir = (k: number): V3 => {
  const [p, q] = chordEnds(k);
  const l = dist(p, q);
  return [(q[0] - p[0]) / l, (q[1] - p[1]) / l, (q[2] - p[2]) / l];
};
const LINE_GA: LineSet3d = { id: '가', positions: new Float32Array([...A, 0, -20, 0]) };
const LINE_REF: LineSet3d = { id: '기준', positions: new Float32Array([...R0, ...R1]) };
const LINE_NA: LineSet3d = { id: '나', positions: new Float32Array([...E, 80, 10, 0]) };
const LINE_ARC: LineSet3d = { id: '호', positions: ARC_POS, segmentIds: new Uint32Array([201, 202, 203, 204, 205, 206, 207, 208]) };
const PAN_EDGE: [V3, V3] = [
  [100, -10, 0],
  [120, -25, 0],
];
const PAN: Mesh3d = {
  id: '판',
  positions: new Float32Array([100, -10, 0, 140, -10, 0, 120, -25, 0]),
  indices: new Uint32Array([0, 2, 1]),
  edges: new Float32Array([...PAN_EDGE[0], ...PAN_EDGE[1], 120, -25, 0, 140, -10, 0, 140, -10, 0, 100, -10, 0]),
  color: [0.6, 0.65, 0.7, 1],
};
const dirScene: Scene3d = { name: 'd', units: 'mm', meshes: [PAN], lines: [LINE_GA, LINE_REF, LINE_NA, LINE_ARC], points: [] };

describe('끌어온 점의 나란함·수직 기준 선분 거르기(0.28.0 inference.trackDirs { edge })', () => {
  function make(): Viewer3d {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
    views.push(v);
    v.setScene(dirScene);
    v.setView('top', false);
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
    // 끌어온 점 E에서 기준 직선으로 내린 수직 발(t ≈ 0.48)에서 떨어진 자리
    pass(v, R0, R1, 0.8);
    expect(v.measureHoverSnap).toMatchObject({ segment: { id: '기준' } });
  };
  const passChord = (v: Viewer3d, k: number, t = 0.5): void => {
    const [p, q] = chordEnds(k);
    pass(v, p, q, t);
    expect(v.measureHoverSnap).toMatchObject({ segment: { id: '호', index: 201 + k, raw: k } });
  };
  const hoverAt = (v: Viewer3d, p: readonly number[]): MeasureHoverSnap | null => {
    const s = scr(v, p);
    hoverXY(v, s.x + 2, s.y + 1);
    return v.measureHoverSnap;
  };
  const PAR_AT = along(E, PAR, 30); // (104, 38, 0) — 기준과 나란한 선 위
  const CHORD_AT = along(E, chordDir(0), 30); // 현 0과 나란한 선 위
  const isRefParallel = (h: MeasureHoverSnap | null): boolean => !!h && h.snap === 'parallel' && !!h.trackFrom && !!h.edge && dist(h.edge[0], R0) < 1e-6 && dist(h.edge[1], R1) < 1e-6;
  const notArc = (seg: SnapSegment): boolean => seg.id !== '호';

  it('normalizeInference: edge 함수를 줬을 때만 { edge }, {}·edge 없음·함수가 아닌 값은 true(0.27.0과 같은 꼴), 끄면 열쇠가 없다', () => {
    const fn = (): boolean => true;
    expect(normalizeInference({ track: true, trackDirs: { edge: fn } })!.trackDirs).toEqual({ edge: fn });
    expect(normalizeInference({ trackDirs: { edge: fn } })!.trackDirs).toEqual({ edge: fn });
    for (const o of [true, {}, { edge: null }, { edge: 'x' as never }] as const) expect(normalizeInference({ track: true, trackDirs: o })!.trackDirs).toBe(true);
    for (const o of [false, null, undefined] as const) expect(normalizeInference({ track: true, trackDirs: o })).not.toHaveProperty('trackDirs');
    expect(normalizeInference(true)).not.toHaveProperty('trackDirs');
  });

  it('거르지 않으면(0.27.0) 원을 나눈 현을 지나면 그 현이 기준이 된다 — 기준과 나란한 자리는 끌어온 점 안내가 아니고, 현과 나란한 자리가 된다', () => {
    const v = make();
    v.setMeasureSnap({ edges: true, inference: { axes: true, track: true, trackDirs: true } });
    v.setMeasureTrackPoints([E]);
    passRef(v);
    expect(isRefParallel(hoverAt(v, PAR_AT))).toBe(true);
    passRef(v);
    passChord(v, 0);
    expect(isRefParallel(hoverAt(v, PAR_AT))).toBe(false);
    const h = hoverAt(v, CHORD_AT)!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: E, edge: chordEnds(0) });
  });

  it('거르면 현을 지나도 앞 기준 선분이 남는다(기준과 나란한 자리 그대로, 현과 나란한 자리는 없다). 받은 선분이 없으면 안내가 없다', () => {
    const v = make();
    v.setMeasureSnap({ edges: true, inference: { axes: true, track: true, trackDirs: { edge: notArc } } });
    v.setMeasureTrackPoints([E]);
    // 현만 지났다: 받은 기준이 없다
    passChord(v, 0);
    expect(isRefParallel(hoverAt(v, PAR_AT))).toBe(false);
    expect(hoverAt(v, CHORD_AT)?.snap === 'parallel').toBe(false);
    passRef(v);
    passChord(v, 0);
    passChord(v, 3);
    const h = hoverAt(v, PAR_AT)!;
    expect(isRefParallel(h)).toBe(true);
    expect(h).not.toHaveProperty('direction');
    expect(hoverAt(v, CHORD_AT)?.snap === 'parallel').toBe(false);
    // 다른 선분(받는 것 — 그물 '판'의 기운 윤곽선)을 지나면 그것이 새 기준
    pass(v, PAN_EDGE[0], PAN_EDGE[1], 0.47);
    expect(v.measureHoverSnap).toMatchObject({ segment: { kind: 'edge', id: '판' } });
    expect(isRefParallel(hoverAt(v, PAR_AT))).toBe(false);
    expect(hoverAt(v, along(E, [0.8, -0.6, 0], 25))).toMatchObject({ snap: 'parallel', trackFrom: E, edge: PAN_EDGE });
  });

  it('0.10.0 나란함(첫 점에서)의 기준은 거르지 않는다 — 현을 지나면 첫 점에서 현과 나란한 선, 끌어온 점에서는 걸러 남은 기준과 나란한 선', () => {
    const v = make();
    v.setMeasureSnap({ edges: true, inference: { parallel: true, track: true, trackDirs: { edge: notArc } } });
    const a = scr(v, A);
    clickXY(v, a.x + 0.4, a.y + 0.3);
    expect(v.measurePointCount).toBe(1);
    v.setMeasureTrackPoints([E]);
    passRef(v);
    passChord(v, 0);
    const d0 = chordDir(0);
    const p = hoverAt(v, along(A, d0, 40))!;
    expect(p).toMatchObject({ snap: 'parallel', edge: chordEnds(0) });
    expect(p).not.toHaveProperty('trackFrom');
    expect(Math.abs(p.direction![0] * d0[0] + p.direction![1] * d0[1])).toBeGreaterThan(1 - 1e-6);
    const q = hoverAt(v, PAR_AT)!;
    expect(isRefParallel(q)).toBe(true);
  });

  it('앱 함수가 받는 값: 선분 식별자(복사본 — 원본 번호 index·배열 안 번호 raw·세계 끝점)와 그 묶음 객체. 바로 앞에 물은 선분은 다시 묻지 않는다', () => {
    const v = make();
    const calls: [SnapSegment, LineSet3d | Mesh3d][] = [];
    const edge = vi.fn((seg: SnapSegment, item: LineSet3d | Mesh3d) => {
      calls.push([seg, item]);
      return seg.id !== '호';
    });
    v.setMeasureSnap({ edges: true, inference: { axes: true, track: true, trackDirs: { edge } } });
    v.setMeasureTrackPoints([E]);
    passRef(v);
    expect(calls.length).toBe(1);
    expect(calls[0]![0]).toEqual({ kind: 'line', id: '기준', index: 0, raw: 0, ends: [R0, R1] });
    expect(calls[0]![1]).toBe(LINE_REF);
    passRef(v);
    passChord(v, 0, 0.4);
    passChord(v, 0, 0.6);
    expect(calls.length).toBe(2);
    expect(calls[1]![0]).toEqual({ kind: 'line', id: '호', index: 201, raw: 0, ends: chordEnds(0) });
    expect(calls[1]![1]).toBe(LINE_ARC);
    passChord(v, 1);
    passChord(v, 0);
    expect(calls.length).toBe(4);
    expect(calls[2]![0]).toMatchObject({ index: 202, raw: 1 });
    // 받은 값은 복사본(고쳐도 코어 기준이 바뀌지 않는다)
    calls[0]![0].ends[0][0] = 999;
    expect(isRefParallel(hoverAt(v, PAR_AT))).toBe(true);
    // 그물 윤곽선: 종류 'edge', 묶음은 그 그물
    pass(v, PAN_EDGE[0], PAN_EDGE[1], 0.47);
    expect(v.measureHoverSnap).toMatchObject({ segment: { kind: 'edge', id: '판' } });
    const last = calls.at(-1)!;
    expect(last[0]).toMatchObject({ kind: 'edge', id: '판', index: 0, raw: 0, ends: PAN_EDGE });
    expect(last[1]).toBe(PAN);
    // 그 윤곽선을 받았으니 끌어온 점에서 그것과 나란한 선
    const h = hoverAt(v, along(E, [0.8, -0.6, 0], 25))!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: E, edge: PAN_EDGE });
  });

  it('앱 함수가 true가 아닌 값을 돌려주거나 던지면 받지 않는다', () => {
    const fns = [
      () => 1 as unknown as boolean,
      () => 'yes' as unknown as boolean,
      (): boolean => {
        throw new Error('x');
      },
    ];
    for (const edge of fns) {
      const v = make();
      v.setMeasureSnap({ edges: true, inference: { axes: true, track: true, trackDirs: { edge } } });
      v.setMeasureTrackPoints([E]);
      passRef(v);
      expect(isRefParallel(hoverAt(v, PAR_AT))).toBe(false);
    }
  });

  it('measureSnap은 { edge }를 돌려주고 그대로 다시 주면 같은 거르기다. setMeasureSnap을 다시 주면 받은 기준을 잊는다', () => {
    const v = make();
    const edge = (s: SnapSegment): boolean => s.id !== '호';
    v.setMeasureSnap({ edges: true, inference: { axes: true, track: true, trackDirs: { edge } } });
    const ms = v.measureSnap!;
    const td = (ms.inference as { trackDirs: unknown }).trackDirs as { edge: unknown };
    expect(td.edge).toBe(edge);
    v.setMeasureSnap(ms);
    v.setMeasureTrackPoints([E]);
    passRef(v);
    passChord(v, 0);
    expect(isRefParallel(hoverAt(v, PAR_AT))).toBe(true);
    v.setMeasureSnap(v.measureSnap);
    v.setMeasureTrackPoints([E]);
    expect(isRefParallel(hoverAt(v, PAR_AT))).toBe(false);
  });

  it('값: true·{}·{ edge: null }·모두 받는 함수는 같은 미리 보기(화면 격자 — 기준·현을 지난 뒤, 첫 점 전·뒤)', () => {
    const run = (trackDirs: boolean | { edge?: ((s: SnapSegment) => boolean) | null }): unknown[] => {
      const v = make();
      v.setMeasureSnap({ edges: true, inference: { axes: true, parallel: true, track: true, trackDirs } });
      v.setMeasureTrackPoints([E]);
      const out: unknown[] = [];
      const grid = (): void => {
        for (let j = 0; j < 7; j++)
          for (let i = 0; i < 9; i++) {
            hoverXY(v, ((i + 0.5) * 800) / 9 + 0.37, ((j + 0.5) * 600) / 7 + 0.21);
            out.push(v.measureHoverSnap);
          }
      };
      passRef(v);
      passChord(v, 2);
      grid();
      const a = scr(v, A);
      clickXY(v, a.x + 0.4, a.y + 0.3);
      passRef(v);
      grid();
      passChord(v, 5);
      grid();
      return out;
    };
    const want = run(true);
    expect(want.some((h) => (h as MeasureHoverSnap | null)?.trackFrom)).toBe(true);
    expect(run({})).toEqual(want);
    expect(run({ edge: null })).toEqual(want);
    expect(run({ edge: () => true })).toEqual(want);
  });

  it('README 예: 툴팁은 snap·trackFrom·locked로 끌어온 점 안내(나란함·수직)를 첫 점 방향·수직 발과 가른다', () => {
    /** 앱 툴팁 이름(예) */
    const tip = (h: MeasureHoverSnap | null): string | null => {
      if (!h) return null;
      const fromTrack = !!h.trackFrom && !h.locked && (h.snap === 'parallel' || h.snap === 'perpendicular');
      if (fromTrack) return h.snap === 'parallel' ? '끌어온 점에서 모서리와 나란함' : '끌어온 점에서 모서리에 수직';
      if (h.snap === 'parallel') return '나란한 방향';
      if (h.snap === 'perpendicular') return '수직 발';
      return h.snap ?? null;
    };
    const v = make();
    v.setMeasureSnap({ edges: true, inference: { parallel: true, perpendicular: true, track: true, trackDirs: { edge: notArc } } });
    v.setMeasureTrackPoints([E]);
    passRef(v);
    expect(tip(hoverAt(v, PAR_AT))).toBe('끌어온 점에서 모서리와 나란함');
    expect(tip(hoverAt(v, along(E, [-0.6, 0.8, 0], 25)))).toBe('끌어온 점에서 모서리에 수직');
    const a = scr(v, A);
    clickXY(v, a.x + 0.4, a.y + 0.3);
    passRef(v);
    expect(tip(hoverAt(v, along(A, PAR, 30)))).toBe('나란한 방향');
    // 첫 점에서 내린 수직 발(끌어온 점이 실리지 않는다)은 그대로 '수직 발'
    expect(tip({ point: [0, 0, 0], vertex: true, snap: 'perpendicular', direction: [1, 0, 0] } as MeasureHoverSnap)).toBe('수직 발');
  });
});
