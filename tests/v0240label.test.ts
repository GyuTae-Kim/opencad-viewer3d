/**
 * 0.24.0 덧그림 글상자끼리·측정 거리 글상자와 비키기(순수 placeLabelAmong — 화면 덧그림의 setAnnotations·측정 거리 글상자).
 * - 순수 함수: 먼저 놓인 글상자와 겹치지 않는 자리, 겹치지 않으면 0.23.0(placeMeasureLabel) 자리, 같은 입력에 같은 자리, 모두 막히면 0.23.0 자리, 가까운 것만 보기
 * - 뷰어(가짜 DOM — 실제 포인터 사건, 가짜 2D 글 너비 10): 겹치는 덧그림 글상자(덧그림 차례), 앱 사각형과 함께, 측정 거리 글상자가 덧그림 글상자를 비키기
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { LABEL_PLACED_MAX, type MeasureLabelRect, placeLabelAmong, placeMeasureLabel, rectsOverlap } from '../src/measurelabel';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import type { Scene3d } from '../src/types';

// ───────────── 순수 함수: placeLabelAmong ─────────────
describe('placeLabelAmong(0.24.0 — 먼저 놓인 글상자를 비킨다)', () => {
  const view = { width: 800, height: 600 };
  const size = { width: 60, height: 24 };

  it('먼저 놓인 것이 없거나 겹치지 않으면 placeMeasureLabel(0.23.0) 자리와 같다', () => {
    const at = [300, 300];
    const base = placeMeasureLabel(at, size, view);
    expect(placeLabelAmong(at, size, view, null, [])).toEqual(base);
    expect(placeLabelAmong(at, size, view, null, [{ x: 0, y: 0, width: 50, height: 50 }])).toEqual(base);
    // 앱 영역이 있으면 0.23.0처럼 그것을 비킨 자리(먼저 놓인 것과 겹치지 않으면)
    const band = { x: 0, y: base.y - 2, width: 800, height: 28 };
    const moved = placeMeasureLabel(at, size, view, { rects: [band] });
    expect(moved).not.toEqual(base);
    expect(placeLabelAmong(at, size, view, { rects: [band] }, [{ x: 700, y: 500, width: 50, height: 20 }])).toEqual(moved);
  });

  it('겹치면 같은 차례(네 귀 → 선분 위 → 피할 자리 위·아래)로 먼저 놓인 글상자와 앱 영역을 모두 비킨다. 같은 입력에 같은 자리', () => {
    const at = [300, 300];
    const base = placeMeasureLabel(at, size, view);
    const prev: MeasureLabelRect = { x: base.x + 5, y: base.y + 3, width: 60, height: 24 };
    const r = placeLabelAmong(at, size, view, null, [prev]);
    expect(rectsOverlap(r, prev)).toBe(false);
    // 둘째 자리(왼쪽 위)
    expect(r).toEqual(placeMeasureLabel(at, size, view, { rects: [{ x: base.x, y: base.y, width: 1, height: 1 }] }));
    expect(placeLabelAmong(at, size, view, null, [prev])).toEqual(r);
    // 왼쪽 위도 앱 영역이 막으면 그다음(오른쪽 아래)
    const wall = { x: 0, y: 0, width: 305, height: 300 };
    const r2 = placeLabelAmong(at, size, view, { rects: [wall] }, [prev]);
    expect(rectsOverlap(r2, prev) || rectsOverlap(r2, wall)).toBe(false);
    expect(r2.y).toBeGreaterThan(300);
  });

  it('옮길 때는 soft(점 표식)를 될 수 있으면 가리지 않는다. 모두 막히면 0.23.0 자리', () => {
    const at = [300, 300];
    const base = placeMeasureLabel(at, size, view);
    const prev: MeasureLabelRect = { x: base.x, y: base.y, width: 60, height: 24 };
    // 왼쪽 위 자리 가운데에 점 표식 — 그 자리를 건너뛴다
    const left = placeMeasureLabel(at, size, view, { rects: [prev] });
    const dot = { x: left.x + 30, y: left.y + 12, r: 6 };
    const r = placeLabelAmong(at, size, view, null, [prev], null, [dot]);
    expect(r).not.toEqual(left);
    expect(rectsOverlap(r, prev)).toBe(false);
    // 화면 전체를 덮는 먼저 놓인 글상자: 갈 곳이 없으면 0.23.0 자리
    expect(placeLabelAmong(at, size, view, null, [{ x: 0, y: 0, width: 800, height: 600 }])).toEqual(base);
  });

  it(`후보가 닿지 않는 가로 범위의 글상자는 더하지 않고, 가까운 ${LABEL_PLACED_MAX}개까지만 본다`, () => {
    const at = [300, 300];
    const base = placeMeasureLabel(at, size, view);
    const prev: MeasureLabelRect = { x: base.x + 5, y: base.y, width: 60, height: 24 };
    const far: MeasureLabelRect = { x: 700, y: base.y - 40, width: 60, height: 24 };
    expect(placeLabelAmong(at, size, view, null, [prev, far])).toEqual(placeLabelAmong(at, size, view, null, [prev]));
    // 많은 글상자가 겹쳐도 끝난다(같은 자리 — 가까운 것만 본다)
    const many = Array.from({ length: 200 }, (_, i): MeasureLabelRect => ({ x: base.x + (i % 7), y: base.y + 40 + i * 30, width: 60, height: 24 }));
    const r = placeLabelAmong(at, size, view, null, [prev, ...many]);
    expect(rectsOverlap(r, prev)).toBe(false);
    expect(placeLabelAmong(at, size, view, null, [prev, ...many])).toEqual(r);
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

const ptrEvent = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as { fire: (t: string, e: object) => void }).fire(type, {
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

describe('Viewer3d: 덧그림 글상자끼리·측정 거리 글상자와 비키기(0.24.0 — 화면 덧그림)', () => {
  const PLATE = boxMesh('판', [0, 0, 0], [100, 80, 20], [0.6, 0.6, 0.7, 1]);
  const sc: Scene3d = { name: 'a', units: 'mm', meshes: [PLATE], lines: [], points: [] };
  function make(): Viewer3d {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    v.setScene(sc);
    v.setView('seIso', false);
    v.fit(false);
    v.renderNow();
    return v;
  }
  const A = { kind: 'point' as const, a: [50, 40, 20], label: '가' };
  /** A 바로 옆(같은 높이 1 차이) — 기본 자리 글상자가 겹친다 */
  const B = { kind: 'point' as const, a: [50.5, 40.5, 20], label: '나' };
  /** 멀리 떨어진 글 — 겹치지 않는다 */
  const FAR = { kind: 'point' as const, a: [100, 0, 20], label: '다' };

  it('겹치지 않으면 0.23.0 자리, 겹치면 뒤 글상자가 앞 글상자를 비킨다(덧그림 차례 — 같은 입력에 같은 자리)', () => {
    const v = make();
    v.setAnnotations([A, FAR]);
    v.renderNow();
    const [ra, rf] = v.annotationLabelRects as MeasureLabelRect[];
    const sa = v.project(A.a)!, sf = v.project(FAR.a)!;
    const view = { width: 800, height: 600 }, size = { width: 24, height: 24 };
    expect(ra).toEqual(placeMeasureLabel([sa.x, sa.y], size, view));
    expect(rf).toEqual(placeMeasureLabel([sf.x, sf.y], size, view));
    v.setAnnotations([A, B, FAR]);
    v.renderNow();
    const rs = v.annotationLabelRects as MeasureLabelRect[];
    const sb = v.project(B.a)!;
    expect(rectsOverlap(placeMeasureLabel([sb.x, sb.y], size, view), ra!)).toBe(true);
    expect(rs[0]).toEqual(ra);
    expect(rectsOverlap(rs[1]!, rs[0]!)).toBe(false);
    expect(rs[2]).toEqual(rf);
    v.renderNow();
    expect(v.annotationLabelRects).toEqual(rs);
    // 차례를 바꾸면 B가 기본 자리, A가 비킨다
    v.setAnnotations([B, A]);
    v.renderNow();
    const [rb2, ra2] = v.annotationLabelRects as MeasureLabelRect[];
    expect(rb2).toEqual(placeMeasureLabel([sb.x, sb.y], size, view));
    expect(rectsOverlap(ra2!, rb2!)).toBe(false);
    v.dispose();
  });

  it('앱 사각형(setMeasureLabelAvoid)과 앞 글상자를 함께 비킨다', () => {
    const v = make();
    v.setAnnotations([A, B]);
    v.renderNow();
    const [ra] = v.annotationLabelRects as MeasureLabelRect[];
    // A 글상자 왼쪽에 띠 — B의 왼쪽 위 자리를 막는다
    const band = { x: ra!.x - 40, y: ra!.y - 4, width: 38, height: 40 };
    v.setMeasureLabelAvoid([band]);
    v.renderNow();
    const [a1, b1] = v.annotationLabelRects as MeasureLabelRect[];
    expect(a1).toEqual(ra);
    expect(rectsOverlap(b1!, a1!)).toBe(false);
    expect(rectsOverlap(b1!, band)).toBe(false);
    v.dispose();
  });

  it('측정 거리 글상자는 덧그림 글상자를 비킨다(덧그림이 먼저 — 덧그림 글상자는 커서를 따라 움직이지 않는다)', () => {
    const v = make();
    v.setMeasureMode(true);
    const p0 = scr(v, [20.3, 10.2, 20]);
    clickXY(v, p0.x, p0.y);
    const p1 = scr(v, [80.3, 70.2, 20]);
    hoverXY(v, p1.x, p1.y);
    const m0 = v.measureLabelRect!;
    expect(m0).not.toBeNull();
    // 측정 거리 글상자 기본 자리의 기준점(두 점 가운데)에 덧그림 — 그 글상자가 같은 자리 둘레(오른쪽 위)
    const a = v.measurePoints[0]!.point, b = v.measureHoverSnap!.point;
    const M = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    v.setAnnotations([{ kind: 'point', a: M, label: '가' }]);
    v.renderNow();
    const [ra] = v.annotationLabelRects as MeasureLabelRect[];
    const m1 = v.measureLabelRect!;
    expect(rectsOverlap(ra!, m0)).toBe(true);
    expect(rectsOverlap(m1, ra!)).toBe(false);
    expect([m1.width, m1.height]).toEqual([m0.width, m0.height]);
    // 덧그림을 지우면 0.23.0 자리
    v.setAnnotations(null);
    v.renderNow();
    expect(v.measureLabelRect).toEqual(m0);
    v.dispose();
  });
});
