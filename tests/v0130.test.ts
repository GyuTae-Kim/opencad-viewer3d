/**
 * 0.13.0 측정 거리 글상자 비켜 그리기.
 * - 순수 배치(placeMeasureLabel): 기본 자리(오른쪽 위)가 피할 영역(사각형·원)과 겹치면 왼쪽 위 → 오른쪽 아래 → 왼쪽 아래, 그다음 선분을 따라
 *   1/4·3/4·첫 점·둘째 점 자리의 네 귀. 모두 겹치면 기본 자리. 피할 것이 없으면 0.12.0 계산과 같다
 * - 뷰어(setMeasureLabelAvoid·measureLabelAvoid): 앱이 준 사각형과 커서 둘레(미리 보기가 있을 때만)를 비켜 그리고 measureLabelRect가 그 자리를 돌려준다.
 *   그림 저장(toBlob) 덧그림은 기본 자리. 같은 값이면 다시 그리지 않는다
 * 가짜 DOM·가짜 WebGL2로 만든 뷰어에 실제 포인터 사건을 넣고, 2D 문맥은 rect·drawImage를 적어 두는 가짜로 바꿔 본다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeElement, installDom } from './fakedom';
import { fake2d } from './fakegl';
import { Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import { type MeasureLabelRect, LABEL_ALONG, LABEL_POINT_R, avoidRect, hitsAvoid, placeMeasureLabel, rectHitsCircle, rectsOverlap } from '../src/measurelabel';
import type { V3 } from '../src/math';
import type { LineSet3d, Scene3d } from '../src/types';

// ───────────── 순수 배치 ─────────────
/** 0.12.0까지 viewer.ts가 하던 계산 그대로 */
const old = (at: readonly number[], w: number, h: number, vw: number, vh: number): MeasureLabelRect => {
  let x = at[0]! + 10, y = at[1]! - h - 8;
  x = Math.min(Math.max(4, x), vw - w - 4);
  y = Math.min(Math.max(4, y), vh - h - 4);
  return { x, y, width: w, height: h };
};
const VIEW = { width: 800, height: 600 };
const SIZE = { width: 100, height: 40 };
const R = (x: number, y: number, width = 100, height = 40): MeasureLabelRect => ({ x, y, width, height });

describe('placeMeasureLabel(거리 글상자 자리)', () => {
  it('피할 것이 없으면 0.12.0 계산과 같다(캔버스 가장자리에서 당기기 포함)', () => {
    for (const at of [
      [400, 300],
      [5, 5],
      [795, 595],
      [-50, 700],
      [123.456, 78.9],
    ])
      for (const avoid of [undefined, null, {}, { rects: [] }, { circles: [] }]) {
        expect(placeMeasureLabel(at, SIZE, VIEW, avoid, [[0, 0], [10, 10]])).toEqual(old(at, 100, 40, 800, 600));
        // 글상자가 캔버스보다 커도
        expect(placeMeasureLabel(at, { width: 900, height: 700 }, VIEW, avoid)).toEqual(old(at, 900, 700, 800, 600));
      }
  });

  it('기본 자리가 비어 있으면 다른 곳에 피할 영역이 있어도 기본 자리', () => {
    expect(placeMeasureLabel([400, 300], SIZE, VIEW, { rects: [R(0, 0, 50, 50)], circles: [{ x: 700, y: 500, r: 40 }] })).toEqual(R(410, 252));
  });

  it('차례: 기본(오른쪽 위) → 왼쪽 위 → 오른쪽 아래 → 왼쪽 아래', () => {
    const at = [400, 300];
    // 기본 자리를 막으면 왼쪽 위
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(410, 252)] })).toEqual(R(290, 252));
    // 위쪽 둘을 막으면 오른쪽 아래
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(280, 240, 240, 60)] })).toEqual(R(410, 308));
    // 오른쪽 둘을 막으면 왼쪽 위, 기본·왼쪽 위·오른쪽 아래를 막으면 왼쪽 아래
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(400, 240, 120, 120)] })).toEqual(R(290, 252));
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(280, 240, 240, 60), R(400, 300, 120, 60)] })).toEqual(R(290, 308));
  });

  it('네 귀가 모두 막히면 선분을 따라(1/4 → 3/4 → 첫 점 → 둘째 점) 같은 네 귀', () => {
    expect(LABEL_ALONG).toEqual([0.25, 0.75, 0, 1]);
    const at = [400, 300];
    const seg: [number[], number[]] = [
      [200, 300],
      [600, 300],
    ];
    // 기준점 둘레 240×120을 막는다: 1/4(300, 300)·3/4(500, 300)의 귀는 모두 걸리고, 첫 점(200, 300)의 왼쪽 위(90, 252)가 처음 빈다
    const block = R(280, 240, 240, 120);
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [block] }, seg)).toEqual(R(90, 252));
    // 선분 방향을 바꾸면 그 차례대로(첫 점이 오른쪽): 1/4(500, 300)·3/4(300, 300)도 걸리고, 첫 점(600, 300)의 오른쪽 위(610, 252)
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [block] }, [seg[1], seg[0]])).toEqual(R(610, 252));
    // 1/4 자리의 오른쪽 아래만 비게 하면 그것
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(180, 240, 340, 60), R(410, 300, 110, 60), R(180, 300, 120, 60)] }, seg)).toEqual(R(310, 308));
    // 선분이 없으면(한 끝이 눈 뒤) 네 귀 다음 막은 영역 바로 위(가로는 기본 자리 그대로)
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [block] }, null)).toEqual(R(410, 192));
    // 수가 아닌 끝은 건너뛴다
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [block] }, [[NaN, 300], [600, 300]])).toEqual(R(410, 192));
  });

  it('선분이 짧아 커서가 기준점 바로 옆이면(귀·선분 위 자리가 모두 걸림) 피할 영역 바로 위·아래', () => {
    const at = [400, 300];
    const seg: [number[], number[]] = [
      [390, 305],
      [410, 295],
    ];
    // 기준점 둘레 반지름 30: 귀는 기준점에서 10·8 띄우므로 모두 걸린다. 원 위(270 − 40 − 8 = 222)가 아래(338)보다 기본 자리(252)에 가깝다
    expect(placeMeasureLabel(at, SIZE, VIEW, { circles: [{ x: 400, y: 300, r: 30 }] }, seg)).toEqual(R(410, 222));
    // 위가 캔버스 밖으로 당겨져 다시 걸리면 아래
    expect(placeMeasureLabel([400, 60], SIZE, VIEW, { circles: [{ x: 400, y: 60, r: 30 }] }, null)).toEqual(R(410, 98));
    // 기본 가로 자리가 다른 영역에 걸리면 왼쪽 위의 가로 자리
    // (작은 네모 위·아래 243·167, 원 위·아래 222·338 가운데 243은 원에 걸리고, 222는 기본 가로 자리가 네모에 걸린다)
    expect(placeMeasureLabel(at, SIZE, VIEW, { circles: [{ x: 400, y: 300, r: 30 }], rects: [R(405, 215, 20, 20)] }, seg)).toEqual(R(290, 222));
    // 여러 영역이면 세로로 가까운 것부터: 십자선(원)과 그 아래 손가락(네모)
    const aim = { circles: [{ x: 400, y: 300, r: 24 }], rects: [R(378, 342, 44, 44)] };
    expect(placeMeasureLabel(at, SIZE, VIEW, aim, seg)).toEqual(R(410, 228));
  });

  it('모든 자리가 겹치면 기본 자리', () => {
    expect(placeMeasureLabel([400, 300], SIZE, VIEW, { rects: [R(0, 0, 800, 600)] }, [[200, 300], [600, 300]])).toEqual(R(410, 252));
  });

  it('원(커서 둘레): 겹치면 옮기고, 맞닿기만 하면 겹치지 않는다', () => {
    expect(placeMeasureLabel([400, 300], SIZE, VIEW, { circles: [{ x: 420, y: 270, r: 10 }] })).toEqual(R(290, 252));
    expect(placeMeasureLabel([400, 300], SIZE, VIEW, { circles: [{ x: 400, y: 270, r: 10 }] })).toEqual(R(410, 252));
    // 사각형과 원을 함께
    expect(placeMeasureLabel([400, 300], SIZE, VIEW, { rects: [R(290, 252)], circles: [{ x: 420, y: 270, r: 10 }] })).toEqual(R(410, 308));
  });

  it('soft(측정 점 표식): 옮길지는 정하지 않고, 옮길 자리는 그것까지 비켜 가는 곳을 먼저 고른다', () => {
    const at = [400, 300];
    // 피할 영역이 없거나 기본 자리가 비어 있으면 soft에 걸려도 기본 자리(0.12.0처럼 점 위에 그릴 수 있다)
    expect(placeMeasureLabel(at, SIZE, VIEW, { soft: [{ x: 420, y: 270, r: 6 }] })).toEqual(R(410, 252));
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(0, 0, 50, 50)], soft: [{ x: 420, y: 270, r: 6 }] })).toEqual(R(410, 252));
    // 기본 자리를 막으면 왼쪽 위가 다음이지만 거기 점이 있으면 오른쪽 아래
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(410, 252)], soft: [{ x: 380, y: 280, r: 6 }] })).toEqual(R(410, 308));
    // 맞닿기만 하면 겹치지 않는다
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(410, 252)], soft: [{ x: 380, y: 246, r: 6 }] })).toEqual(R(290, 252));
    // 빈 자리마다 점이 걸리면 피할 영역만 비켜 간 첫 자리
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(410, 252)], soft: [{ x: 400, y: 300, r: 1000 }] }, [[200, 300], [600, 300]])).toEqual(R(290, 252));
    // 피할 영역이 모든 자리를 막으면 soft와 상관없이 기본 자리
    expect(placeMeasureLabel(at, SIZE, VIEW, { rects: [R(0, 0, 800, 600)], soft: [{ x: 0, y: 0, r: 1 }] })).toEqual(R(410, 252));
  });

  it('캔버스 안으로 당긴 뒤에 겹침을 본다', () => {
    // 오른쪽 가장자리: 기본은 (696, 252), 왼쪽 위(685, 252)도 그것과 겹쳐 오른쪽 아래(696, 308)
    const d = placeMeasureLabel([795, 300], SIZE, VIEW);
    expect(d).toEqual(R(696, 252));
    expect(placeMeasureLabel([795, 300], SIZE, VIEW, { rects: [d] })).toEqual(R(696, 308));
  });

  it('겹침 판정과 사각형 고르기', () => {
    expect(rectsOverlap(R(0, 0, 10, 10), R(10, 0, 10, 10))).toBe(false);
    expect(rectsOverlap(R(0, 0, 10, 10), R(9.5, 9.5, 10, 10))).toBe(true);
    expect(rectHitsCircle(R(0, 0, 10, 10), { x: 13, y: 14, r: 5 })).toBe(false);
    expect(rectHitsCircle(R(0, 0, 10, 10), { x: 13, y: 13, r: 5 })).toBe(true);
    expect(rectHitsCircle(R(0, 0, 10, 10), { x: 5, y: 5, r: 0.1 })).toBe(true);
    expect(hitsAvoid(R(0, 0, 10, 10), {})).toBe(false);
    expect(avoidRect({ x: 1, y: 2, width: 3, height: 4, extra: 1 })).toEqual({ x: 1, y: 2, width: 3, height: 4 });
    for (const bad of [null, 5, {}, { x: 1, y: 2, width: 0, height: 4 }, { x: 1, y: 2, width: 3, height: -1 }, { x: NaN, y: 2, width: 3, height: 4 }, { x: '1', y: 2, width: 3, height: 4 }, { x: 1, y: 2, width: Infinity, height: 4 }])
      expect(avoidRect(bad)).toBeNull();
  });
});

// ───────────── 뷰어 ─────────────
/** 2D 문맥마다 rect·drawImage 부름을 적는다(가짜 2D 문맥 위에) */
const logs = new Map<unknown, unknown[][]>();
function rec2d(el: unknown): CanvasRenderingContext2D {
  const log: unknown[][] = [];
  logs.set(el, log);
  const base = fake2d() as unknown as Record<string | symbol, unknown>;
  return new Proxy(base, {
    get: (t, k) => (k === 'rect' || k === 'drawImage' ? (...a: unknown[]) => void log.push([k, ...a]) : t[k]),
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const orig = FakeElement.prototype.getContext;
  vi.spyOn(FakeElement.prototype, 'getContext').mockImplementation(function (this: FakeElement, type: string) {
    return type === '2d' ? rec2d(this) : orig.call(this, type);
  });
  (FakeElement.prototype as unknown as { toBlob: (cb: (b: unknown) => void) => void }).toBlob = (cb) => cb({});
});
afterAll(() => {
  vi.restoreAllMocks();
  delete (FakeElement.prototype as unknown as { toBlob?: unknown }).toBlob;
  vi.useRealTimers();
  dom.restore();
});

const A: V3 = [0, 0, 0], B: V3 = [60, 40, 0], C: V3 = [105, 40, 0];
const path: LineSet3d = { id: 'path', positions: new Float32Array([...A, ...B, ...B, ...C]) };
const box = boxMesh('box', [200, 0, 0], [260, 40, 30], [0.7, 0.7, 0.7, 1]);
const scene: Scene3d = { name: 't', units: 'mm', meshes: [box], lines: [path], points: [] };

interface View {
  v: Viewer3d;
  canvas: FakeElement;
  host: FakeElement;
}
function view(): View {
  const host = dom.host();
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.setMeasureMode(true);
  v.setMeasureSnap({ inference: { axes: true } });
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement, host };
}
const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const clickAt = (w: View, p: readonly number[]): void => {
  const s = at(w, p);
  ptr(w, 'pointerdown', s.x, s.y, 1);
  ptr(w, 'pointerup', s.x, s.y, 0);
};
const hoverAt = (w: View, p: readonly number[], dx = 0, dy = 0): void => {
  const s = at(w, p);
  ptr(w, 'pointermove', s.x + dx, s.y + dy, 0);
  w.v.renderNow();
};
/** 화면 덧그림 캔버스의 2D 기록 */
const overlayLog = (w: View): unknown[][] => {
  const find = (e: FakeElement): FakeElement | null => {
    for (const c of e.children) {
      if (c.className === 'v3d-overlay') return c;
      const r = find(c);
      if (r) return r;
    }
    return null;
  };
  return logs.get(find(w.host))!;
};
/** 기록에서 마지막 거리 글상자(두 줄 — 높이 40) 사각형 */
const lastLabel = (log: unknown[][]): MeasureLabelRect | null => {
  for (let i = log.length - 1; i >= 0; i--) {
    const [k, x, y, width, height] = log[i]!;
    if (k === 'rect' && height === 40) return { x, y, width, height } as MeasureLabelRect;
  }
  return null;
};
/** 두 사각형이 거의 같은지(project()와 그리기의 화면 자리는 마지막 자리까지 같지 않을 수 있다) */
const close = (r: MeasureLabelRect | null, want: MeasureLabelRect): void => {
  expect(r).not.toBeNull();
  for (const k of ['x', 'y', 'width', 'height'] as const) expect(r![k], k).toBeCloseTo(want[k], 6);
};
/** 두 측정 점 표식(옮길 때 될 수 있으면 가리지 않는다) */
const dots = (seg: [number[], number[]]): { x: number; y: number; r: number }[] => seg.map(([x, y]) => ({ x: x!, y: y!, r: LABEL_POINT_R }));
/** 첫 점 A를 찍고 B를 가리킨 글상자: 기본 자리·기준점(두 점 화면 가운데)·두 점 화면 자리 */
function firstAndHover(w: View): { r0: MeasureLabelRect; mid: number[]; seg: [number[], number[]] } {
  clickAt(w, A);
  hoverAt(w, B);
  const a = at(w, A), b = at(w, B);
  return { r0: w.v.measureLabelRect!, mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], seg: [[a.x, a.y], [b.x, b.y]] };
}

describe('Viewer3d.setMeasureLabelAvoid', () => {
  it('주지 않거나 빈 값이면 0.12.0 자리 그대로(measureLabelAvoid는 null)', () => {
    const w = view();
    const { v } = w;
    const { r0, mid } = firstAndHover(w);
    close(r0, old(mid, r0.width, 40, 800, 600));
    for (const empty of [null, [], {}, { rects: [] }, { pointerRadius: 0 }, { pointerRadius: -3, rects: [{ x: NaN, y: 0, width: 5, height: 5 }] }, { pointerRadius: NaN }]) {
      v.setMeasureLabelAvoid(empty as never);
      expect(v.measureLabelAvoid).toBeNull();
      v.renderNow();
      expect(v.measureLabelRect).toEqual(r0);
      expect(lastLabel(overlayLog(w))).toEqual(r0);
    }
  });

  it('앱 사각형(사각형 목록만 줘도 된다)과 겹치면 옮겨 그리고 measureLabelRect가 옮긴 자리를 돌려준다', () => {
    const w = view();
    const { v } = w;
    const { r0, mid, seg } = firstAndHover(w);
    const avoid = [{ ...r0 }];
    v.setMeasureLabelAvoid(avoid);
    avoid[0]!.x = -999;
    expect(v.measureLabelAvoid).toEqual({ rects: [r0] });
    v.renderNow();
    const r1 = v.measureLabelRect!;
    close(r1, placeMeasureLabel(mid, r0, { width: 800, height: 600 }, { rects: [r0], soft: dots(seg) }, seg));
    expect(rectsOverlap(r1, r0)).toBe(false);
    expect(lastLabel(overlayLog(w))).toEqual(r1);
    // 끄면 기본 자리
    v.setMeasureLabelAvoid(null);
    v.renderNow();
    expect(v.measureLabelRect).toEqual(r0);
  });

  it('커서 둘레(pointerRadius): 미리 보기가 있을 때만 보고, 커서가 떠나면 기본 자리', () => {
    const w = view();
    const { v } = w;
    clickAt(w, A);
    clickAt(w, B);
    v.renderNow();
    const r0 = v.measureLabelRect!;
    const a = at(w, A), b = at(w, B);
    const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    // 둘째 점 B 위에서 커서를 둔다(다음 측정의 첫 점 미리 보기) — 반지름은 B에서 기본 글상자까지보다 5 크게
    const dx = b.x - Math.min(Math.max(b.x, r0.x), r0.x + r0.width), dy = b.y - Math.min(Math.max(b.y, r0.y), r0.y + r0.height);
    const radius = Math.hypot(dx, dy) + 5;
    v.setMeasureLabelAvoid({ pointerRadius: radius });
    expect(v.measureLabelAvoid).toEqual({ rects: [], pointerRadius: radius });
    v.renderNow();
    // 미리 보기가 없으면 커서를 보지 않는다
    expect(v.measureLabelRect).toEqual(r0);
    hoverAt(w, B);
    expect(v.measureHoverSnap).not.toBeNull();
    const r1 = v.measureLabelRect!;
    const seg: [number[], number[]] = [
      [a.x, a.y],
      [b.x, b.y],
    ];
    const want = placeMeasureLabel(mid, r0, { width: 800, height: 600 }, { circles: [{ x: b.x, y: b.y, r: radius }], soft: dots(seg) }, seg);
    close(r1, want);
    expect(r1).not.toEqual(r0);
    expect(rectHitsCircle(r1, { x: b.x, y: b.y, r: radius })).toBe(false);
    // 커서가 캔버스를 떠나면(미리 보기 없음) 기본 자리
    w.canvas.fire('pointerleave', {});
    v.renderNow();
    expect(v.measureLabelRect).toEqual(r0);
  });

  it('같은 값이면 다시 그리지 않고, 바뀌면 측정 중일 때만 다시 그린다. 측정을 지워도 남는다', () => {
    const w = view();
    const { v } = w;
    const { r0 } = firstAndHover(w);
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    v.setMeasureLabelAvoid({ rects: [r0], pointerRadius: 12 });
    expect(raf).toHaveBeenCalledTimes(1);
    v.renderNow();
    v.setMeasureLabelAvoid({ rects: [{ ...r0 }], pointerRadius: 12 });
    expect(raf).toHaveBeenCalledTimes(1);
    v.setMeasureLabelAvoid({ rects: [{ ...r0, x: r0.x + 1 }], pointerRadius: 12 });
    expect(raf).toHaveBeenCalledTimes(2);
    v.renderNow();
    v.clearMeasure();
    v.renderNow();
    raf.mockClear();
    expect(v.measureLabelAvoid).toEqual({ rects: [{ ...r0, x: r0.x + 1 }], pointerRadius: 12 });
    // 찍은 점이 없으면 다시 그릴 글상자도 없다
    v.setMeasureLabelAvoid([r0]);
    expect(raf).not.toHaveBeenCalled();
    raf.mockRestore();
  });

  it('그림 저장(toBlob): 비켜 그렸으면 덧그림만 기본 자리로 다시 그리고, 아니면 화면 덧그림을 그대로 쓴다', async () => {
    const w = view();
    const { v } = w;
    const { r0 } = firstAndHover(w);
    const blobLog = (): unknown[][] => [...logs.values()].at(-1)!;
    await v.toBlob('image/png');
    let log = blobLog();
    expect(log.filter(([k]) => k === 'drawImage')).toHaveLength(2);
    expect(lastLabel(log)).toBeNull();
    v.setMeasureLabelAvoid([r0]);
    await v.toBlob('image/png');
    log = blobLog();
    expect(log.filter(([k]) => k === 'drawImage')).toHaveLength(1);
    expect(lastLabel(log)).toEqual(r0);
    // 화면은 옮긴 자리 그대로(그림 저장이 measureLabelRect를 바꾸지 않는다)
    const moved = v.measureLabelRect!;
    expect(moved).not.toEqual(r0);
    expect(lastLabel(overlayLog(w))).toEqual(moved);
  });
});
