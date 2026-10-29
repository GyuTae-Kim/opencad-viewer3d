/**
 * 0.16.0 붙잡은 선분 식별자(MeasureHoverSnap·MeasurePoint의 segment·other).
 * - 순수 함수: 그 점이 놓인 선분 식별자(snapSegmentsOf — 종류별로 실리는지·복사본인지)
 * - 뷰어: 끝점(꺾은선 꼭짓점이면 고른 쪽)·가운데 점·선분 위 점·교차점·수직 발·윤곽선 끝점·다듬은 점에 식별자가 실리고
 *   그물 꼭짓점·앱 점·축·잠금·붙잡기 선택 없음에는 없는지, measurePoints에도 실리는지(복사본), 측정 결과에는 없는지
 * 가짜 DOM·가짜 WebGL2로 만든 뷰어에 실제 포인터 사건을 넣는다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type MeasureSnapPick, type SnapSegment, snapSegmentsOf } from '../src/snap';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { LineSet3d, Mesh3d, Pick3d, Scene3d } from '../src/types';

// ───────────── 순수 함수 ─────────────
describe('snapSegmentsOf(붙잡은 점이 놓인 선분)', () => {
  const seg = (raw: number, id = '선'): SnapSegment => ({ kind: 'line', id, index: 100 + raw, raw, ends: [[raw, 0, 0], [raw + 1, 0, 0]] });
  const linePick: Pick3d = { kind: 'line', id: '선', index: 501, raw: 1, point: [1.5, 0, 0] };
  const ends: [V3, V3] = [[1, 0, 0], [2, 0, 0]];
  it('수직 발·교차점·열린 후보는 후보에 실린 선분(교차점은 둘째도), 복사본', () => {
    const s = seg(3), o = seg(4, '다른 선');
    const perp: MeasureSnapPick = { p: [3.5, 0, 0], vertex: true, kind: 'perpendicular', seg: s };
    const r = snapSegmentsOf(perp, null)!;
    expect(r).toEqual({ segment: s });
    expect(r.segment).not.toBe(s);
    expect(r.segment.ends[0]).not.toBe(s.ends[0]);
    const x = snapSegmentsOf({ p: [3.5, 0, 0], vertex: true, kind: 'intersection', seg: s, other: o }, null)!;
    expect(x).toEqual({ segment: s, other: o });
    expect(x.other).not.toBe(o);
    // 열린 후보(앱이 다듬은 점)도 같은 선분
    expect(snapSegmentsOf({ p: [3.6, 0.1, 0], vertex: true, kind: 'perpendicular', seg: s, refined: true, core: [4, 0, 0] }, null)).toEqual({ segment: s });
  });
  it('고르기가 고른 점 그대로(끝점·가운데 점·선분 위 점)면 고른 선분, 앱 점·그물·점 묶음·면은 null', () => {
    const snap: V3 = [2, 0, 0];
    const base = { snap, pick: linePick, ends };
    for (const kind of ['endpoint', 'midpoint', null] as const) {
      const r = snapSegmentsOf({ p: snap, vertex: !!kind, kind }, base)!;
      expect(r).toEqual({ segment: { kind: 'line', id: '선', index: 501, raw: 1, ends } });
      expect(r.segment.ends[0]).not.toBe(ends[0]);
    }
    // 윤곽선: index·raw 모두 윤곽선 번호
    const edge = snapSegmentsOf({ p: snap, vertex: true, kind: 'endpoint' }, { snap, pick: { kind: 'edge', id: '판', index: 7, raw: 7, point: [2, 0, 0] }, ends })!;
    expect(edge.segment).toEqual({ kind: 'edge', id: '판', index: 7, raw: 7, ends });
    // 같은 자리라도 다른 객체(앱 점이 이겼다)면 없다
    expect(snapSegmentsOf({ p: [2, 0, 0], vertex: true, kind: 'center' }, base)).toBeNull();
    // 그물 꼭짓점·점 묶음의 점(선분이 아니다), 고르기 없음
    expect(snapSegmentsOf({ p: snap, vertex: true, kind: 'vertex' }, { snap, pick: { kind: 'mesh', id: '면', index: 0, raw: 0, point: [2, 0, 0] } })).toBeNull();
    expect(snapSegmentsOf({ p: snap, vertex: true, kind: 'vertex' }, { snap, pick: { kind: 'point', id: '점', index: 0, raw: 0, point: [2, 0, 0] }, ends })).toBeNull();
    expect(snapSegmentsOf({ p: snap, vertex: false, kind: null }, null)).toBeNull();
    expect(snapSegmentsOf(null, base)).toBeNull();
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

/** 선분 '꺾은선': (0,0,0)–(40,0,0)–(40,30,0), 원본 번호 500·501 */
const L: LineSet3d = { id: '꺾은선', positions: new Float32Array([0, 0, 0, 40, 0, 0, 40, 0, 0, 40, 30, 0]), segmentIds: new Uint32Array([500, 501]) };
/** 선분 '가로지름': x = 12에서 꺾은선 첫 토막과 (12, 0, 0)에서 만난다(가운데 점은 (12, 8, 0)) */
const M: LineSet3d = { id: '가로지름', positions: new Float32Array([12, -4, 0, 12, 20, 0]), segmentIds: new Uint32Array([7]) };
/** 선분 '기준': 첫 점 F = (30, 40, 0) — 꺾은선 첫 토막으로 내린 발은 (30, 0, 0) */
const T: LineSet3d = { id: '기준', positions: new Float32Array([30, 40, 0, 30, 60, 0]) };
/** 그물 '판': 바닥의 사각형(윤곽선 넷) */
const Q: Mesh3d = {
  id: '판',
  positions: new Float32Array([-40, -40, 0, -20, -40, 0, -20, -20, 0, -40, -20, 0]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
  color: [0.7, 0.7, 0.7, 1],
  edges: new Float32Array([-40, -40, 0, -20, -40, 0, -20, -40, 0, -20, -20, 0, -20, -20, 0, -40, -20, 0, -40, -20, 0, -40, -40, 0]),
};
const segScene: Scene3d = { name: 's', units: 'mm', meshes: [Q], lines: [L, M, T], points: [] };
const F: V3 = [30, 40, 0];
const APP: V3 = [-10, 30, 0];

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(scene: Scene3d): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement };
}
const ptr = (w: View, type: string, x: number, y: number, buttons: number, pointerType = 'mouse'): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: pointerType === 'mouse' ? 1 : 2, pointerType, button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const hoverXY = (w: View, x: number, y: number, pointerType = 'mouse'): void => {
  ptr(w, 'pointermove', x, y, 0, pointerType);
  w.v.renderNow();
};
const hoverAt = (w: View, p: readonly number[], dx = 0, dy = 0): void => {
  const s = at(w, p);
  hoverXY(w, s.x + dx, s.y + dy);
};
const clickAt = (w: View, p: readonly number[], dx = 0, dy = 0): void => {
  const s = at(w, p);
  ptr(w, 'pointerdown', s.x + dx, s.y + dy, 1);
  ptr(w, 'pointerup', s.x + dx, s.y + dy, 0);
  w.v.renderNow();
};
/** 화면에서 세계 점 p에서 q 쪽으로 n화소 옮긴 자리 */
const toward = (w: View, p: readonly number[], q: readonly number[], n: number): { x: number; y: number } => {
  const a = at(w, p), b = at(w, q);
  const l = Math.hypot(b.x - a.x, b.y - a.y);
  return { x: a.x + ((b.x - a.x) * n) / l, y: a.y + ((b.y - a.y) * n) / l };
};
describe('Viewer3d: 붙잡은 선분 식별자(segment·other)', () => {
  it('끝점(고른 쪽 선분)·가운데 점·붙잡지 않은 선분 위 점·교차점에 실리고, 복사본이다', () => {
    const w = view(segScene);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true, inference: true });
    // 꺾은선 꼭짓점 (40,0,0): 둘째 토막 쪽으로 3화소 — 고르기가 고른 둘째 토막
    const c = toward(w, [40, 0, 0], [40, 30, 0], 3);
    hoverXY(w, c.x, c.y);
    let h = v.measureHoverSnap!;
    expect(h.snap).toBe('endpoint');
    expect(h.point).toEqual([40, 0, 0]);
    expect(h.segment).toEqual({ kind: 'line', id: '꺾은선', index: 501, raw: 1, ends: [[40, 0, 0], [40, 30, 0]] });
    expect(h).not.toHaveProperty('other');
    // 첫 토막 쪽으로 3화소면 첫 토막
    const c2 = toward(w, [40, 0, 0], [0, 0, 0], 3);
    hoverXY(w, c2.x, c2.y);
    expect(v.measureHoverSnap!.segment).toMatchObject({ index: 500, raw: 0 });
    // 가운데 점
    hoverAt(w, [40, 15, 0]);
    h = v.measureHoverSnap!;
    expect(h.snap).toBe('midpoint');
    expect(h.segment).toMatchObject({ kind: 'line', id: '꺾은선', index: 501, raw: 1 });
    // 붙잡지 않은 선분 위 점
    hoverAt(w, [30, 0, 0]);
    h = v.measureHoverSnap!;
    expect(h.snap).toBeNull();
    expect(h.segment).toMatchObject({ id: '꺾은선', index: 500, raw: 0 });
    // 교차점: 두 선분
    hoverAt(w, [12, 0, 0]);
    h = v.measureHoverSnap!;
    expect(h.snap).toBe('intersection');
    const ids = [h.segment!, h.other!].map((s) => [s.id, s.index, s.raw]).sort();
    expect(ids).toEqual([
      ['가로지름', 7, 0],
      ['꺾은선', 500, 0],
    ]);
    // 복사본: 고쳐도 다음 읽기는 그대로
    h.segment!.ends[0][0] = 999;
    h.segment!.id = '고침';
    expect(v.measureHoverSnap!.segment!.ends[0][0]).not.toBe(999);
    expect(v.measureHoverSnap!.segment!.id).not.toBe('고침');
    v.dispose();
  });

  it('수직 발과 찍은 점(measurePoints)에도 실리고, 측정 결과(MeasureResult)에는 없다', () => {
    const w = view(segScene);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true, inference: { perpendicular: true } });
    clickAt(w, F);
    const [p0] = v.measurePoints;
    expect(p0!.snap).toBe('endpoint');
    expect(p0!.segment).toEqual({ kind: 'line', id: '기준', index: 0, raw: 0, ends: [[30, 40, 0], [30, 60, 0]] });
    hoverAt(w, [30, 0, 0], 2);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('perpendicular');
    expect(h.point).toEqual([30, 0, 0]);
    expect(h.segment).toMatchObject({ id: '꺾은선', index: 500, raw: 0 });
    clickAt(w, [30, 0, 0], 2);
    const pts = v.measurePoints;
    expect(pts[1]!.snap).toBe('perpendicular');
    expect(pts[1]!.segment).toEqual(h.segment);
    pts[1]!.segment!.ends[1][0] = -1;
    expect(v.measurePoints[1]!.segment!.ends[1][0]).toBe(40);
    const m = v.measurement()!;
    expect(Object.keys(m).some((k) => /segment|other|track/i.test(k))).toBe(false);
    v.dispose();
  });

  it('그물 꼭짓점·앱 점·축·잠근 선 위 점에는 없고, 윤곽선을 고르면 윤곽선 끝점에 실린다', () => {
    const w = view(segScene);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ points: [{ point: APP, kind: 'center' }], inference: { axes: true } });
    // 그물 바깥 구석을 정확히 가리키면 광선이 면(두께 0인 BVH 상자)의 모서리에 한 점으로 닿아 맞음 여부가 마지막 자리 반올림에 달린다
    // (Node 20·22와 23·24의 fit 거리가 마지막 자리에서 달라 갈렸다). 면 안쪽으로 3화소 — 꼭짓점은 붙잡기 거리 안이다
    const inside = toward(w, [-20, -20, 0], [-30, -30, 0], 3);
    hoverXY(w, inside.x, inside.y);
    expect(v.measureHoverSnap!.snap).toBe('vertex');
    expect(v.measureHoverSnap!.point).toEqual([-20, -20, 0]);
    expect(v.measureHoverSnap).not.toHaveProperty('segment');
    hoverAt(w, APP);
    expect(v.measureHoverSnap!.snap).toBe('center');
    expect(v.measureHoverSnap).not.toHaveProperty('segment');
    clickAt(w, F);
    hoverAt(w, [30, 40, 25]);
    expect(v.measureHoverSnap!.snap).toBe('axis');
    expect(v.measureHoverSnap).not.toHaveProperty('segment');
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    hoverAt(w, [40, 0, 0]);
    expect(v.measureHoverSnap!.locked).toBe(true);
    expect(v.measureHoverSnap).not.toHaveProperty('segment');
    // 윤곽선을 고르면 그 꼭짓점은 윤곽선 끝점(윤곽선 번호 1 또는 2 — 고른 쪽)
    v.setMeasureSnap({ edges: true });
    v.clearMeasure();
    hoverXY(w, inside.x, inside.y);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('endpoint');
    expect(h.segment!.kind).toBe('edge');
    expect(h.segment!.id).toBe('판');
    expect([1, 2]).toContain(h.segment!.raw);
    expect(h.segment!.index).toBe(h.segment!.raw);
    v.dispose();
  });

  it('다듬은 점도 같은 식별자이고, 붙잡기 선택이 없으면(0.7.2 규칙) 싣지 않는다', () => {
    const w = view(segScene);
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ refine: (c) => (c.kind === 'onEdge' ? [c.point[0], c.point[1] + 0.01, c.point[2]] : null) });
    hoverAt(w, [30, 0, 0]);
    const h = v.measureHoverSnap!;
    expect(h.refined).toBe(true);
    expect(h.segment).toMatchObject({ id: '꺾은선', index: 500, raw: 0 });
    v.setMeasureSnap(null);
    clickAt(w, [40, 0, 0]);
    expect(v.measurePoints[0]!.snap).toBe('endpoint');
    expect(v.measurePoints[0]).not.toHaveProperty('segment');
    v.dispose();
  });
});
