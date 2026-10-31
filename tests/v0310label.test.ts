/**
 * 0.31.0 측정 거리 글상자가 첫 점 표식을 덮는 자리(NC 관찰 — 휴대폰 375화소 정밀 조준 미리 보기).
 * - 원인 재현(가짜 DOM, 375 × 560 캔버스, 글 폭은 글자 수 × 7화소): 첫 점이 두 점 가운데의 오른쪽 위에 있으면 기본 자리(가운데 오른쪽 위, 화면 폭의 절반을 넘는 글상자는
 *   캔버스 안으로 당긴다)가 첫 점 표식을 덮는다. 십자선(커서 둘레)·손가락 자리와는 겹치지 않아 기본 자리가 그대로다 — 표식(soft)은 옮길 때만 보기 때문(0.13.0 규칙)
 * - 순수 LabelAvoidAreas.softBlocks: 고른 자리가 표식을 덮으면 표식도 피할 원으로 다시 고르기, 받지 못하면 처음 자리, 켜지 않으면 0.30.0과 같은지(무작위 입력)
 * - 뷰어 MeasureLabelAvoid.points: 켜면 그 자리에서 표식·십자선·손가락을 모두 비키고, 켜지 않으면 0.30.0과 같다. 이것만 줘도 켠다. 값 읽기
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeElement, installDom } from './fakedom';
import { Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import {
  LABEL_POINT_R,
  type LabelAvoidAreas,
  type LabelCircle,
  type MeasureLabelRect,
  hitsAvoid,
  placeLabelAmong,
  placeMeasureLabel,
  rectHitsCircle,
  rectsOverlap,
} from '../src/measurelabel';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

const VIEW = { width: 375, height: 560 };
const SIZE = { width: 231, height: 40 };
const R = (x: number, y: number, width = 231, height = 40): MeasureLabelRect => ({ x, y, width, height });
const dot = (x: number, y: number): LabelCircle => ({ x, y, r: LABEL_POINT_R });

describe('placeMeasureLabel·placeLabelAmong의 softBlocks(0.31.0, 순수)', () => {
  // 휴대폰 폭: 첫 점 A(250, 200)·미리 보기 점 B(180, 260), 기준점은 가운데(215, 230). 글상자 폭 231은 캔버스 안으로 당겨져 x 140
  const A = [250, 200], B = [180, 260];
  const at = [(A[0]! + B[0]!) / 2, (A[1]! + B[1]!) / 2];
  const seg: [number[], number[]] = [A, B];
  const aim = (): LabelAvoidAreas => ({ circles: [{ x: B[0]!, y: B[1]!, r: 24 }], rects: [{ x: B[0]! - 22, y: B[1]! + 64 - 22, width: 44, height: 44 }], soft: [dot(A[0]!, A[1]!), dot(B[0]!, B[1]!)] });

  it('원인: 기본 자리는 십자선·손가락과 겹치지 않아 그대로이고(표식은 옮길 때만 본다), 첫 점 표식을 덮는다', () => {
    const r = placeMeasureLabel(at, SIZE, VIEW, aim(), seg);
    expect(r).toEqual(R(140, 182));
    expect(hitsAvoid(r, { rects: aim().rects, circles: aim().circles })).toBe(false);
    expect(rectHitsCircle(r, dot(A[0]!, A[1]!))).toBe(true);
    // 피할 것이 없어도(마우스) 같은 자리
    expect(placeMeasureLabel(at, SIZE, VIEW, null, seg)).toEqual(r);
  });

  it('softBlocks: 표식을 덮으면 표식도 피할 원으로 다시 고른다 — 십자선·손가락·두 표식을 모두 비킨 첫 자리', () => {
    const r = placeMeasureLabel(at, SIZE, VIEW, { ...aim(), softBlocks: true }, seg);
    const all: LabelAvoidAreas = { rects: aim().rects, circles: [...aim().circles!, ...aim().soft!] };
    expect(hitsAvoid(r, all)).toBe(false);
    // 차례: 기본 자리(막힘) → 왼쪽 위(140 − 10 − 231 → 4로 당겨져 첫 점 쪽으로 넓어 A를 덮지는 않는다)
    expect(r).toEqual(R(4, 182));
    // 피할 영역 없이 표식만 줘도
    const m = placeMeasureLabel(at, SIZE, VIEW, { soft: aim().soft, softBlocks: true }, seg);
    expect(hitsAvoid(m, { circles: aim().soft })).toBe(false);
    // 표식이 없으면 그대로
    expect(placeMeasureLabel(at, SIZE, VIEW, { ...aim(), soft: [], softBlocks: true }, seg)).toEqual(R(140, 182));
  });

  it('받지 못하면 처음 자리: 다시 고른 자리가 피할 영역이나 표식과 겹친다(모든 자리가 막힘)', () => {
    const big = { ...aim(), soft: [{ x: 187, y: 280, r: 1000 }], softBlocks: true };
    expect(placeMeasureLabel(at, SIZE, VIEW, big, seg)).toEqual(placeMeasureLabel(at, SIZE, VIEW, { ...big, softBlocks: false }, seg));
  });

  it('켜지 않으면 0.30.0과 같고, 켜도 처음 자리가 표식을 덮지 않으면 같다 — 덮으면 피할 영역·표식을 모두 비키거나 처음 자리(무작위 입력, 기본 자리·fallback·먼저 놓인 글상자)', () => {
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const spots = [undefined, { first: 'center' as const }, { first: 'below' as const, fallback: 'topRight' as const }, { first: 'topLeft' as const, fallback: 'first' as const }];
    let moved = 0;
    for (let n = 0; n < 1500; n++) {
      const p = [rnd() * 375, rnd() * 560], q = [p[0]! + (rnd() - 0.5) * 300, p[1]! + (rnd() - 0.5) * 200];
      const c = [(p[0]! + q[0]!) / 2, (p[1]! + q[1]!) / 2];
      const size = { width: 60 + rnd() * 200, height: rnd() < 0.5 ? 24 : 40 };
      const rects = rnd() < 0.5 ? [{ x: rnd() * 375, y: rnd() * 560, width: 20 + rnd() * 80, height: 20 + rnd() * 80 }] : [];
      const circles = rnd() < 0.5 ? [{ x: q[0]!, y: q[1]!, r: 24 }] : [];
      const avoid: LabelAvoidAreas = { rects, circles, soft: [dot(p[0]!, p[1]!), dot(q[0]!, q[1]!)] };
      const opts = spots[n % spots.length];
      const placed = rnd() < 0.4 ? [{ x: rnd() * 300, y: rnd() * 500, width: 80, height: 24 }] : [];
      const marks = { circles: avoid.soft };
      const strict = { rects, circles: [...circles, ...avoid.soft!] };
      const old = placeMeasureLabel(c, size, VIEW, avoid, [p, q], opts);
      const now = placeMeasureLabel(c, size, VIEW, { ...avoid, softBlocks: true }, [p, q], opts);
      if (!hitsAvoid(old, marks)) expect(now).toEqual(old);
      else if (JSON.stringify(now) !== JSON.stringify(old)) {
        moved++;
        expect(hitsAvoid(now, strict)).toBe(false);
      }
      const oldA = placeLabelAmong(c, size, VIEW, avoid, placed, [p, q], null, opts);
      const nowA = placeLabelAmong(c, size, VIEW, { ...avoid, softBlocks: true }, placed, [p, q], null, opts);
      if (!hitsAvoid(oldA, marks)) expect(nowA).toEqual(oldA);
      else if (JSON.stringify(nowA) !== JSON.stringify(oldA)) {
        expect(hitsAvoid(nowA, strict)).toBe(false);
        expect(placed.some((r) => rectsOverlap(nowA, r)) && !placed.some((r) => rectsOverlap(oldA, r))).toBe(false);
      }
      // softBlocks: false·없음은 같다
      expect(placeMeasureLabel(c, size, VIEW, { ...avoid, softBlocks: false }, [p, q], opts)).toEqual(old);
    }
    expect(moved).toBeGreaterThan(50);
  });
});

// ───────────── 뷰어(가짜 DOM, 375 × 560) ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
let saved: FakeElement['getContext'];
beforeAll(() => {
  dom = installDom();
  saved = FakeElement.prototype.getContext;
  // 글 폭을 글자 수 × 7화소로(12px 글꼴 숫자 폭쯤 — 가짜 2D 문맥은 늘 10을 돌려준다)
  FakeElement.prototype.getContext = function (this: FakeElement, type: string): unknown {
    const c = saved.call(this, type) as object | null;
    if (type !== '2d' || !c) return c;
    return new Proxy(c, {
      get: (o, k) => (k === 'measureText' ? (s: string) => ({ width: String(s).length * 7 }) : Reflect.get(o, k)),
      set: (o, k, v) => Reflect.set(o, k, v),
    });
  };
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  FakeElement.prototype.getContext = saved;
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
function make(): Viewer3d {
  const host = dom.host();
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
/** 판 윗면의 첫 점 A(오른쪽 위)를 찍고 B(왼쪽 아래)를 가리킨다(pointerType — 정밀 조준은 펜) */
const A: V3 = [75.3, 61.7, 10];
const B: V3 = [44.1, 46.2, 10];
const AIM_R = 24;
const finger = (x: number, y: number): MeasureLabelRect => ({ x: x - 22, y: y + 64 - 22, width: 44, height: 44 });
function preview(v: Viewer3d, pointerType: string): { a: { x: number; y: number }; b: { x: number; y: number } } {
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

describe('Viewer3d: 측정 점 표식을 덮는 거리 글상자 옮기기(0.31.0 setMeasureLabelAvoid({ points }))', () => {
  it('재현: 375화소 정밀 조준 미리 보기(펜, 십자선 24화소·손가락 44화소)에서 기본 자리가 첫 점 표식을 덮는다 — 십자선·손가락과는 겹치지 않는다', () => {
    const v = make();
    const { a, b } = preview(v, 'pen');
    v.setMeasureLabelAvoid({ pointerRadius: AIM_R, rects: [finger(b.x, b.y)] });
    v.renderNow();
    const r = v.measureLabelRect!;
    // 글상자가 화면 폭의 절반을 넘어(231화소) 캔버스 안으로 당겨진 기본 자리
    expect(r.width).toBeGreaterThan(375 / 2);
    expect(r.x).toBeCloseTo(375 - r.width - 4, 9);
    expect(covers(r, a)).toBe(true);
    expect(rectHitsCircle(r, { x: b.x, y: b.y, r: AIM_R })).toBe(false);
    expect(rectsOverlap(r, finger(b.x, b.y))).toBe(false);
    // 마우스(피할 것 없음)도 같은 자리
    const w = make();
    preview(w, 'mouse');
    expect(w.measureLabelRect).toEqual(r);
  });

  it('points: true면 첫 점·미리 보기 점 표식, 십자선, 손가락을 모두 비킨 자리. 끄면 다시 0.30.0 자리', () => {
    const v = make();
    const { a, b } = preview(v, 'pen');
    v.setMeasureLabelAvoid({ pointerRadius: AIM_R, rects: [finger(b.x, b.y)] });
    v.renderNow();
    const r0 = v.measureLabelRect!;
    v.setMeasureLabelAvoid({ pointerRadius: AIM_R, rects: [finger(b.x, b.y)], points: true });
    expect(v.measureLabelAvoid).toEqual({ pointerRadius: AIM_R, rects: [finger(b.x, b.y)], points: true });
    v.renderNow();
    const r = v.measureLabelRect!;
    expect(r).not.toEqual(r0);
    expect(covers(r, a)).toBe(false);
    expect(covers(r, b)).toBe(false);
    expect(rectHitsCircle(r, { x: b.x, y: b.y, r: AIM_R })).toBe(false);
    expect(rectsOverlap(r, finger(b.x, b.y))).toBe(false);
    expect(r.x).toBeGreaterThanOrEqual(4);
    expect(r.x + r.width).toBeLessThanOrEqual(375 - 4);
    v.setMeasureLabelAvoid({ pointerRadius: AIM_R, rects: [finger(b.x, b.y)] });
    v.renderNow();
    expect(v.measureLabelRect).toEqual(r0);
  });

  it('points만 줘도 켠다(마우스 — 피할 영역 없음), false·빈 값은 0.30.0과 같은 꺼짐', () => {
    const v = make();
    const { a, b } = preview(v, 'mouse');
    const r0 = v.measureLabelRect!;
    expect(covers(r0, a)).toBe(true);
    v.setMeasureLabelAvoid({ points: true });
    expect(v.measureLabelAvoid).toEqual({ rects: [], points: true });
    v.renderNow();
    const r = v.measureLabelRect!;
    expect(covers(r, a)).toBe(false);
    expect(covers(r, b)).toBe(false);
    v.setMeasureLabelAvoid({ points: false });
    expect(v.measureLabelAvoid).toBeNull();
    v.renderNow();
    expect(v.measureLabelRect).toEqual(r0);
    v.setMeasureLabelAvoid({ points: 1 as unknown as boolean });
    expect(v.measureLabelAvoid).toBeNull();
  });

  it('두 점째를 찍은 결과 글상자도(표식 둘), 표식을 덮지 않는 자리는 켜도 그대로', () => {
    const v = make();
    const { a, b } = preview(v, 'mouse');
    ptr(v, 'pointerdown', b.x, b.y, 1);
    ptr(v, 'pointerup', b.x, b.y, 0);
    v.renderNow();
    expect(v.measurePointCount).toBe(2);
    expect(covers(v.measureLabelRect!, a)).toBe(true);
    v.setMeasureLabelAvoid({ points: true });
    v.renderNow();
    expect(covers(v.measureLabelRect!, a)).toBe(false);
    // 두 점이 왼쪽 위 → 오른쪽 아래(어느 점도 가운데의 오른쪽 위가 아니라 기본 자리가 표식을 덮지 않는다)면 켜도 그대로
    const w = make();
    const s = scr(w, [10.4, 70.2, 10]), t = scr(w, [90.3, 45.1, 10]);
    for (const [p, down] of [
      [s, true],
      [t, true],
    ] as const) {
      ptr(w, 'pointermove', p.x, p.y, 0);
      w.renderNow();
      if (down) {
        ptr(w, 'pointerdown', p.x, p.y, 1);
        ptr(w, 'pointerup', p.x, p.y, 0);
        w.renderNow();
      }
    }
    const q0 = w.measureLabelRect!;
    expect(covers(q0, s) || covers(q0, t)).toBe(false);
    w.setMeasureLabelAvoid({ points: true });
    w.renderNow();
    expect(w.measureLabelRect).toEqual(q0);
  });
});
