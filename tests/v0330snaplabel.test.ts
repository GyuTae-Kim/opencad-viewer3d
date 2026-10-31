/**
 * 0.33.0 그림 저장의 측정 거리 글상자도 측정 점 표식 비키기(setMeasureLabelAvoid의 snapshotPoints — points와 함께).
 * NC 33차 요청: 화면 글상자는 0.31.0 points로 표식을 비키지만 그림 저장(toBlob)은 기본 자리라 첫 점 표식을 덮는 자리가 그대로였다.
 * - 끄면(snapshotPoints 없음·points 없이 준 snapshotPoints) 그림 저장은 0.32.0처럼 기본 자리
 * - 켜면 그림 저장 글상자는 표식만 비킨다 — 앱 영역·커서 둘레가 없으면 화면 글상자와 같은 자리, 있으면 표식만 비킨 자리(points만 준 화면 자리와 같다)
 * - 두 점째를 찍은 결과, 화면 밖 그리기(toBlob 선택 — 배율 2), 표식을 덮지 않는 자리는 켜도 그대로
 * 가짜 DOM(375 × 560)에 실제 포인터 사건을 넣고, 2D 문맥은 rect·drawImage를 적는 가짜(글 폭은 글자 수 × 7화소)로 바꿔 본다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeElement, installDom } from './fakedom';
import { fake2d } from './fakegl';
import { Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import { LABEL_POINT_R, type MeasureLabelRect, placeMeasureLabel, rectHitsCircle } from '../src/measurelabel';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

/** 2D 문맥마다 rect·drawImage 부름을 적는다(글 폭은 글자 수 × 7화소) */
const logs = new Map<unknown, unknown[][]>();
let lastLog: unknown[][] = [];
function rec2d(el: unknown): CanvasRenderingContext2D {
  const log: unknown[][] = [];
  logs.set(el, log);
  lastLog = log;
  const base = fake2d() as unknown as Record<string | symbol, unknown>;
  return new Proxy(base, {
    get: (t, k) =>
      k === 'rect' || k === 'drawImage' ? (...a: unknown[]) => void log.push([k, ...a]) : k === 'measureText' ? (s: string) => ({ width: String(s).length * 7 }) : t[k],
    set: (t, k, v) => {
      t[k] = v;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  const orig = FakeElement.prototype.getContext;
  vi.spyOn(FakeElement.prototype, 'getContext').mockImplementation(function (this: FakeElement, type: string) {
    return type === '2d' ? rec2d(this) : orig.call(this, type);
  });
  (FakeElement.prototype as unknown as { toBlob: (cb: (b: unknown) => void) => void }).toBlob = (cb) => cb({});
  // 화면 밖 그리기(renderPixels)가 만드는 ImageData — Node에는 없다
  vi.stubGlobal(
    'ImageData',
    class {
      data: Uint8ClampedArray;
      constructor(
        readonly width: number,
        readonly height: number,
      ) {
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    },
  );
});
afterAll(() => {
  for (const v of views) v.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (FakeElement.prototype as unknown as { toBlob?: unknown }).toBlob;
  vi.useRealTimers();
  dom.restore();
});

const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number, pointerType = 'mouse'): void =>
  (v.canvas as unknown as FakeElement).fire(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType,
    button: type === 'pointermove' ? -1 : 0,
    buttons,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  });
const scene: Scene3d = { name: 'l', units: 'mm', meshes: [boxMesh('판', [0, 0, 0], [100, 100, 10], [0.6, 0.65, 0.7, 1])], lines: [], points: [] };
let host: FakeElement;
function make(): Viewer3d {
  host = dom.host();
  host.rect = { left: 0, top: 0, width: 375, height: 560 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.renderNow();
  v.setMeasureMode(true);
  return v;
}
const scr = (v: Viewer3d, p: readonly number[]): { x: number; y: number } => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
/** v0310label.test.ts와 같은 자리: 판 윗면의 첫 점 A(오른쪽 위)를 찍고 B(왼쪽 아래)를 가리킨다 — 기본 자리가 첫 점 표식을 덮는다 */
const A: V3 = [75.3, 61.7, 10];
const B: V3 = [44.1, 46.2, 10];
const AIM_R = 24;
const finger = (x: number, y: number): MeasureLabelRect => ({ x: x - 22, y: y + 64 - 22, width: 44, height: 44 });
function preview(v: Viewer3d, pointerType = 'mouse'): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const a = scr(v, A), b = scr(v, B);
  ptr(v, 'pointermove', a.x, a.y, 0);
  v.renderNow();
  ptr(v, 'pointerdown', a.x, a.y, 1);
  ptr(v, 'pointerup', a.x, a.y, 0);
  v.renderNow();
  expect(v.measurePointCount).toBe(1);
  ptr(v, 'pointermove', b.x, b.y, 0, pointerType);
  v.renderNow();
  return { a, b };
}
const covers = (r: MeasureLabelRect, p: { x: number; y: number }): boolean => rectHitsCircle(r, { x: p.x, y: p.y, r: LABEL_POINT_R });
/** 기록에서 마지막 거리 글상자(두 줄 — 높이 40) 사각형 */
const lastLabel = (log: unknown[][]): MeasureLabelRect | null => {
  for (let i = log.length - 1; i >= 0; i--) {
    const [k, x, y, width, height] = log[i]!;
    if (k === 'rect' && height === 40) return { x, y, width, height } as MeasureLabelRect;
  }
  return null;
};
/** 그림 저장(toBlob 문자열 — 화면 그림 위에 덧그림을 다시 그린다)의 거리 글상자 */
async function blobLabel(v: Viewer3d): Promise<MeasureLabelRect | null> {
  await v.toBlob('image/png');
  return lastLabel(lastLog);
}

describe('Viewer3d: 그림 저장의 측정 거리 글상자도 측정 점 표식 비키기(0.33.0 setMeasureLabelAvoid({ points, snapshotPoints }))', () => {
  it('끄면 0.32.0과 같다: points만 줬으면 화면은 표식을 비키고 그림 저장은 기본 자리(첫 점 표식을 덮는다), points 없이 준 snapshotPoints는 버린다', async () => {
    const v = make();
    const { a } = preview(v);
    const r0 = v.measureLabelRect!;
    expect(covers(r0, a)).toBe(true);
    expect(await blobLabel(v)).toBeNull(); // 피할 것이 없으면 화면 덧그림을 그대로 쓴다(다시 그리지 않는다)
    v.setMeasureLabelAvoid({ points: true });
    v.renderNow();
    expect(covers(v.measureLabelRect!, a)).toBe(false);
    const img = await blobLabel(v);
    expect(img).toEqual(r0);
    v.setMeasureLabelAvoid({ snapshotPoints: true });
    expect(v.measureLabelAvoid).toBeNull();
    v.setMeasureLabelAvoid({ points: true, snapshotPoints: 1 as unknown as boolean });
    expect(v.measureLabelAvoid).toEqual({ rects: [], points: true });
    expect(await blobLabel(v)).toEqual(r0);
  });

  it('켜면 그림 저장 글상자가 화면 글상자와 같은 자리(앱 영역·커서 둘레가 없을 때) — 두 표식을 덮지 않는다', async () => {
    const v = make();
    const { a, b } = preview(v);
    v.setMeasureLabelAvoid({ points: true, snapshotPoints: true });
    expect(v.measureLabelAvoid).toEqual({ rects: [], points: true, snapshotPoints: true });
    v.renderNow();
    const screen = v.measureLabelRect!;
    const img = (await blobLabel(v))!;
    expect(img).toEqual(screen);
    expect(covers(img, a)).toBe(false);
    expect(covers(img, b)).toBe(false);
    // 그림 저장이 화면 글상자 자리를 바꾸지 않는다
    expect(v.measureLabelRect).toEqual(screen);
    // 기본 자리를 앱이 정해도(setMeasureLabelSpot) 같은 자리
    v.setMeasureLabelSpot('topLeft');
    v.renderNow();
    expect(await blobLabel(v)).toEqual(v.measureLabelRect);
  });

  it('정밀 조준(펜 — 십자선·손가락): 화면은 셋을 모두 비키고, 그림 저장은 표식만 비킨 자리(points만 준 화면 자리와 같다)', async () => {
    const v = make();
    const { a, b } = preview(v, 'pen');
    v.setMeasureLabelAvoid({ points: true });
    v.renderNow();
    const onlyPoints = v.measureLabelRect!;
    v.setMeasureLabelAvoid({ pointerRadius: AIM_R, rects: [finger(b.x, b.y)], points: true, snapshotPoints: true });
    v.renderNow();
    const img = (await blobLabel(v))!;
    expect(img).toEqual(onlyPoints);
    expect(covers(img, a)).toBe(false);
    expect(covers(img, b)).toBe(false);
    // 순수 함수로 다시 세도 같다(기본 자리 → 표식을 피할 원으로)
    const at = [(a.x + b.x) / 2, (a.y + b.y) / 2];
    const soft = [a, b].map((p) => ({ x: p.x, y: p.y, r: LABEL_POINT_R }));
    const want = placeMeasureLabel(at, { width: img.width, height: img.height }, { width: 375, height: 560 }, { rects: [], circles: [], soft, softBlocks: true }, [
      [a.x, a.y],
      [b.x, b.y],
    ]);
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(img[k]).toBeCloseTo(want[k], 6);
  });

  it('두 점째를 찍은 결과·화면 밖 그리기(toBlob 선택 — 배율 2)도, 표식을 덮지 않는 자리는 켜도 그대로', async () => {
    const v = make();
    const { a, b } = preview(v);
    ptr(v, 'pointerdown', b.x, b.y, 1);
    ptr(v, 'pointerup', b.x, b.y, 0);
    v.renderNow();
    expect(v.measurePointCount).toBe(2);
    const r0 = v.measureLabelRect!;
    expect(covers(r0, a)).toBe(true);
    v.setMeasureLabelAvoid({ points: true, snapshotPoints: true });
    v.renderNow();
    expect(await blobLabel(v)).toEqual(v.measureLabelRect);
    expect(covers(v.measureLabelRect!, a)).toBe(false);
    // 화면 밖 그리기: 덧그림은 CSS 화소 그대로 적고 배율은 변환으로 건다 — 같은 자리
    await v.toBlob({ type: 'image/png', scale: 2 });
    expect(lastLabel(lastLog)).toEqual(v.measureLabelRect);
    v.setMeasureLabelAvoid({ points: true });
    await v.toBlob({ type: 'image/png', scale: 2 });
    expect(lastLabel(lastLog)).toEqual(r0);
    // 두 점이 왼쪽 위 → 오른쪽 아래(기본 자리가 표식을 덮지 않는다)면 켜도 그대로
    const w = make();
    const s = scr(w, [10.4, 70.2, 10]), t = scr(w, [90.3, 45.1, 10]);
    for (const p of [s, t]) {
      ptr(w, 'pointermove', p.x, p.y, 0);
      w.renderNow();
      ptr(w, 'pointerdown', p.x, p.y, 1);
      ptr(w, 'pointerup', p.x, p.y, 0);
      w.renderNow();
    }
    const q0 = w.measureLabelRect!;
    w.setMeasureLabelAvoid({ points: true, snapshotPoints: true });
    w.renderNow();
    expect(w.measureLabelRect).toEqual(q0);
    expect(await blobLabel(w)).toEqual(q0);
  });
});
