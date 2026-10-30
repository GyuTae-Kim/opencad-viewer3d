/**
 * 0.29.0 뷰어 글상자 기본 자리가 막히면 0.25.0 차례(Viewer3d.setMeasureLabelSpot의 fallback): 측정 거리 글상자·덧그림 글상자가 순수 placeLabelAmong의
 * { first, fallback: 'topRight' }(0.28.0)와 같은 자리에 놓이는지, 'first'·주지 않으면 0.28.0과 같은지, 설정 값(모르는 값·기본 자리 없이 준 fallback은 뺀다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { V3 } from '../src/math';
import { type MeasureLabelRect, placeLabelAmong, placeMeasureLabel } from '../src/measurelabel';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import type { Scene3d } from '../src/types';

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
const clickXY = (v: Viewer3d, x: number, y: number): void => {
  ptrEvent(v, 'pointermove', x, y, 0);
  v.renderNow();
  ptrEvent(v, 'pointerdown', x, y, 1);
  ptrEvent(v, 'pointerup', x, y, 0);
  v.renderNow();
};
const scr = (v: Viewer3d, p: readonly number[]): { x: number; y: number } => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};

const box = boxMesh('상자', [0, 0, 0], [100, 60, 30], [0.6, 0.65, 0.7, 1]);
const sc: Scene3d = { name: 'l', units: 'mm', meshes: [box], lines: [], points: [] };
function make(): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  v.setScene(sc);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return v;
}
// 가짜 DOM 캔버스는 800 × 600 CSS 화소
const VIEW = { width: 800, height: 600 };
/** 기준점·두 점 화면 자리를 덮는 가로 띠(기본 자리·네 귀·선분 위 자리가 모두 막혀 피할 영역 위·아래로 간다 — 그 가로 자리가 차례마다 다르다) */
function band(pts: readonly (readonly number[])[], h: number): MeasureLabelRect {
  const ys = pts.map((p) => p[1]!);
  const y0 = Math.min(...ys) - h - 12, y1 = Math.max(...ys) + h + 12;
  return { x: 0, y: y0, width: 800, height: y1 - y0 };
}

describe('Viewer3d: 뷰어 글상자 기본 자리가 막히면 0.25.0 차례(0.29.0 setMeasureLabelSpot fallback)', () => {
  it('설정 값: 객체 꼴의 fallback만, 모르는 값·기본 자리 없이 준 fallback은 뺀다, 바꾸지 않으면 같은 값', () => {
    const v = make();
    v.setMeasureLabelSpot({ measure: 'center', fallback: 'topRight' });
    expect(v.measureLabelSpot).toEqual({ measure: 'center', fallback: 'topRight' });
    v.setMeasureLabelSpot({ annotations: 'below', fallback: 'first' });
    expect(v.measureLabelSpot).toEqual({ annotations: 'below', fallback: 'first' });
    v.setMeasureLabelSpot({ measure: 'center', fallback: 'nowhere' as never });
    expect(v.measureLabelSpot).toEqual({ measure: 'center' });
    v.setMeasureLabelSpot({ fallback: 'topRight' });
    expect(v.measureLabelSpot).toBeNull();
    v.setMeasureLabelSpot({ measure: 'nowhere' as never, fallback: 'topRight' });
    expect(v.measureLabelSpot).toBeNull();
    v.setMeasureLabelSpot('center');
    expect(v.measureLabelSpot).toEqual({ measure: 'center', annotations: 'center' });
  });

  it('측정 거리 글상자: fallback topRight면 순수 { first, fallback: topRight } 자리, first·주지 않으면 0.28.0 자리(둘은 다르다)', () => {
    const v = make();
    v.setMeasureMode(true);
    const a = scr(v, [10.3, 0, 30]), b = scr(v, [90.2, 0, 30]);
    clickXY(v, a.x, a.y);
    clickXY(v, b.x, b.y);
    v.renderNow();
    const r0 = v.measureLabelRect!;
    const pa = v.project(v.measurePoints[0]!.point)!, pb = v.project(v.measurePoints[1]!.point)!;
    const mid = [(pa.x + pb.x) / 2, (pa.y + pb.y) / 2];
    const size = { width: r0.width, height: r0.height };
    const seg: [V3, V3] = [
      [pa.x, pa.y, 0],
      [pb.x, pb.y, 0],
    ];
    const soft = seg.map((p) => ({ x: p[0], y: p[1], r: 6 }));
    const rect = band([mid, seg[0], seg[1]], size.height);
    v.setMeasureLabelAvoid([rect]);
    const avoid = { rects: [rect], circles: [], soft };
    const old = placeLabelAmong(mid, size, VIEW, avoid, [], seg, soft, { first: 'center' });
    const fb = placeLabelAmong(mid, size, VIEW, avoid, [], seg, soft, { first: 'center', fallback: 'topRight' });
    expect(fb).not.toEqual(old);
    v.setMeasureLabelSpot({ measure: 'center' });
    v.renderNow();
    expect(v.measureLabelRect).toEqual(old);
    v.setMeasureLabelSpot({ measure: 'center', fallback: 'first' });
    v.renderNow();
    expect(v.measureLabelRect).toEqual(old);
    v.setMeasureLabelSpot({ measure: 'center', fallback: 'topRight' });
    v.renderNow();
    expect(v.measureLabelRect).toEqual(fb);
    // 막히지 않으면 기본 자리 그대로
    v.setMeasureLabelAvoid(null);
    v.renderNow();
    expect(v.measureLabelRect).toEqual(placeMeasureLabel(mid, size, VIEW, null, null, { first: 'center' }));
  });

  it('덧그림 글상자: fallback topRight면 순수 { first, fallback: topRight } 자리(첫 덧그림 — 먼저 놓인 글상자 없음), 끄면 0.28.0 자리', () => {
    const v = make();
    v.setAnnotations([{ kind: 'distance', a: [10, 0, 30], b: [90, 0, 30] }]);
    v.renderNow();
    const r0 = v.annotationLabelRects[0]!;
    const at = (() => {
      const s = v.project([50, 0, 30])!;
      return [s.x, s.y];
    })();
    const ds = [
      [10, 0, 30],
      [90, 0, 30],
    ].map((p) => {
      const s = v.project(p)!;
      return [s.x, s.y, 0] as V3;
    });
    const seg: [V3, V3] = [ds[0]!, ds[1]!];
    const soft = ds.map((s) => ({ x: s[0], y: s[1], r: 6 }));
    const size = { width: r0.width, height: r0.height };
    const rect = band([at, ds[0]!, ds[1]!], size.height);
    v.setMeasureLabelAvoid([rect]);
    const avoid = { rects: [rect], soft };
    const old = placeLabelAmong(at, size, VIEW, avoid, [], seg, soft, { first: 'center' });
    const fb = placeLabelAmong(at, size, VIEW, avoid, [], seg, soft, { first: 'center', fallback: 'topRight' });
    expect(fb).not.toEqual(old);
    v.setMeasureLabelSpot({ annotations: 'center' });
    v.renderNow();
    expect(v.annotationLabelRects[0]).toEqual(old);
    v.setMeasureLabelSpot({ annotations: 'center', fallback: 'topRight' });
    v.renderNow();
    expect(v.annotationLabelRects[0]).toEqual(fb);
    v.setMeasureLabelSpot(null);
    v.setMeasureLabelAvoid(null);
    v.renderNow();
    expect(v.annotationLabelRects[0]).toEqual(r0);
  });
});
