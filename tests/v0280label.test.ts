/**
 * 0.28.0 글상자 자리 고르기의 fallback 'topRight'(placeMeasureLabel·placeLabelAmong — 기본 자리가 막히면 0.25.0 차례 그대로):
 * SketchUp 결과 글 자리(기본은 가운데, 막히면 코어 0.25.0 차례) 계산 사본과 무작위 입력으로 견주고, 주지 않으면 0.27.0 계산 사본과 같은지 본다
 */
import { describe, expect, it } from 'vitest';
import {
  LABEL_ALONG,
  LABEL_GAP_X,
  LABEL_GAP_Y,
  LABEL_MARGIN,
  LABEL_PLACED_MAX,
  type LabelAvoidAreas,
  type LabelCircle,
  type LabelSpot,
  type MeasureLabelRect,
  hitsAvoid,
  placeLabelAmong,
  placeMeasureLabel,
  rectsOverlap,
} from '../src/measurelabel';

/** 0.27.0 placeMeasureLabel·placeLabelAmong(opts.first) 계산 사본 — fallback을 주지 않으면 이것과 같아야 한다 */
const ref27 = (() => {
  const corner = (sx: number, sy: number, w: number, h: number, vw: number, vh: number, k: number): MeasureLabelRect => {
    let x = k & 1 ? sx - LABEL_GAP_X - w : sx + LABEL_GAP_X;
    let y = k & 2 ? sy + LABEL_GAP_Y : sy - h - LABEL_GAP_Y;
    x = Math.min(Math.max(LABEL_MARGIN, x), vw - w - LABEL_MARGIN);
    y = Math.min(Math.max(LABEL_MARGIN, y), vh - h - LABEL_MARGIN);
    return { x, y, width: w, height: h };
  };
  const SPOT: Record<string, number> = { topRight: 0, topLeft: 1, bottomRight: 2, bottomLeft: 3 };
  const spotRect = (spot: LabelSpot | undefined, sx: number, sy: number, w: number, h: number, vw: number, vh: number): { r: MeasureLabelRect; corner: number } => {
    if (spot && typeof spot === 'object') {
      if (Number.isFinite(spot.x) && Number.isFinite(spot.y)) return { r: { x: spot.x, y: spot.y, width: w, height: h }, corner: -1 };
    } else if (spot === 'center' || spot === 'above' || spot === 'below') {
      const x = Math.min(Math.max(LABEL_MARGIN, sx - w / 2), vw - w - LABEL_MARGIN);
      const y0 = spot === 'center' ? sy - h / 2 : spot === 'above' ? sy - h - LABEL_GAP_Y : sy + LABEL_GAP_Y;
      const y = Math.min(Math.max(LABEL_MARGIN, y0), vh - h - LABEL_MARGIN);
      return { r: { x, y, width: w, height: h }, corner: -1 };
    } else if (typeof spot === 'string' && SPOT[spot] !== undefined) return { r: corner(sx, sy, w, h, vw, vh, SPOT[spot]!), corner: SPOT[spot]! };
    return { r: corner(sx, sy, w, h, vw, vh, 0), corner: 0 };
  };
  type Seg = readonly [readonly number[], readonly number[]] | null | undefined;
  type Size = { width: number; height: number };
  const place = (at: readonly number[], size: Size, view: Size, avoid?: LabelAvoidAreas | null, segment?: Seg, spot?: LabelSpot): MeasureLabelRect => {
    const w = size.width, h = size.height, vw = view.width, vh = view.height;
    const { r: first, corner: c0 } = spotRect(spot, at[0]!, at[1]!, w, h, vw, vh);
    if (!avoid || (!avoid.rects?.length && !avoid.circles?.length) || !hitsAvoid(first, avoid)) return first;
    const cands: MeasureLabelRect[] = [];
    for (let k = 0; k < 4; k++) if (k !== c0) cands.push(corner(at[0]!, at[1]!, w, h, vw, vh, k));
    if (segment) {
      const [a, b] = segment;
      for (const t of LABEL_ALONG) {
        const sx = a[0]! + (b[0]! - a[0]!) * t, sy = a[1]! + (b[1]! - a[1]!) * t;
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
        for (let k = 0; k < 4; k++) cands.push(corner(sx, sy, w, h, vw, vh, k));
      }
    }
    const ys: number[] = [];
    for (const b of [...(avoid.rects ?? []), ...(avoid.circles ?? []).map((c) => ({ x: c.x - c.r, y: c.y - c.r, width: 2 * c.r, height: 2 * c.r }))])
      ys.push(b.y - h - LABEL_GAP_Y, b.y + b.height + LABEL_GAP_Y);
    const left = corner(at[0]!, at[1]!, w, h, vw, vh, 1).x;
    const xs = c0 === 0 ? [first.x, left] : [first.x, corner(at[0]!, at[1]!, w, h, vw, vh, 0).x, left];
    ys.map((y, i) => ({ y, i }))
      .filter((e) => Number.isFinite(e.y))
      .sort((p, q) => Math.abs(p.y - first.y) - Math.abs(q.y - first.y) || p.i - q.i)
      .forEach(({ y }) => {
        const cy = Math.min(Math.max(LABEL_MARGIN, y), vh - h - LABEL_MARGIN);
        for (const x of xs) cands.push({ x, y: cy, width: w, height: h });
      });
    const free = cands.filter((r) => !hitsAvoid(r, avoid));
    const soft = avoid.soft?.length ? { circles: avoid.soft } : null;
    return (soft && free.find((r) => !hitsAvoid(r, soft))) || free[0] || first;
  };
  const among = (
    at: readonly number[],
    size: Size,
    view: Size,
    avoid: LabelAvoidAreas | null | undefined,
    placed: readonly MeasureLabelRect[],
    segment?: Seg,
    soft?: readonly LabelCircle[] | null,
    spot?: LabelSpot,
  ): MeasureLabelRect => {
    const base = place(at, size, view, avoid, segment, spot);
    if (!placed.length || !placed.some((r) => rectsOverlap(base, r))) return base;
    const w = size.width, h = size.height;
    const first = spotRect(spot, at[0]!, at[1]!, w, h, view.width, view.height).r;
    let x0 = Infinity, x1 = -Infinity;
    if (Number.isFinite(first.x)) {
      x0 = first.x;
      x1 = first.x + w;
    }
    const take = (sx: number, sy: number): void => {
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
      for (let k = 0; k < 4; k++) {
        const r = corner(sx, sy, w, h, view.width, view.height, k);
        x0 = Math.min(x0, r.x);
        x1 = Math.max(x1, r.x + w);
      }
    };
    take(at[0]!, at[1]!);
    if (segment) for (const t of LABEL_ALONG) take(segment[0][0]! + (segment[1][0]! - segment[0][0]!) * t, segment[0][1]! + (segment[1][1]! - segment[0][1]!) * t);
    const cx = base.x + w / 2, cy = base.y + h / 2;
    const near = placed
      .map((r, i) => ({ r, i, d: Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy) }))
      .filter((e) => e.r.x < x1 && x0 < e.r.x + e.r.width)
      .sort((p, q) => p.d - q.d || p.i - q.i)
      .slice(0, LABEL_PLACED_MAX)
      .sort((p, q) => p.i - q.i)
      .map((e) => e.r);
    const hard: LabelAvoidAreas = { rects: [...(avoid?.rects ?? []), ...near], circles: avoid?.circles ?? [] };
    const s = avoid?.soft?.length ? avoid.soft : (soft ?? []);
    const r = place(at, size, view, { ...hard, soft: s }, segment, spot);
    return hitsAvoid(r, hard) ? base : r;
  };
  return { place, among };
})();

/**
 * SketchUp 앱의 결과 글 자리(labelSpot — 기본은 기준점 가운데, 막히면 코어 0.25.0 차례) 계산 사본: 옮기지 않으면 null(가운데 그대로).
 * 앱이 코어 placeMeasureLabel·placeLabelAmong을 opts 없이 부르는 그대로다
 */
function skpLabelSpot(
  x: number,
  y: number,
  width: number,
  height: number,
  view: { width: number; height: number },
  avoid: LabelAvoidAreas,
  seg?: readonly [readonly number[], readonly number[]] | null,
  soft?: readonly LabelCircle[],
  placed: readonly MeasureLabelRect[] = [],
): { x: number; y: number } | null {
  if (!(width > 0 && height > 0)) return null;
  const c = { x: x - width / 2, y: y - height / 2, width, height };
  const hit = hitsAvoid(c, avoid);
  if (!hit && !placed.some((p) => rectsOverlap(c, p))) return null;
  const a = soft?.length ? { ...avoid, soft } : avoid;
  const r = placed.length ? placeLabelAmong([x, y], { width, height }, view, a, placed, seg) : placeMeasureLabel([x, y], { width, height }, view, a, seg);
  if (hitsAvoid(r, avoid) || (!hit && placed.some((p) => rectsOverlap(r, p)))) return null;
  return { x: r.x, y: r.y };
}

/** 결정적 의사 난수(시험마다 같은 입력) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** SketchUp 결과 글 같은 무작위 입력: 정밀 조준 십자선·손가락·툴팁·측정 띠, 화면 선분, 측정 점 표식, 먼저 놓인 글상자(모형 라벨·앞 결과 글 — 기준점 둘레에 몰리게) */
function skpCase(r: () => number): {
  x: number;
  y: number;
  w: number;
  h: number;
  view: { width: number; height: number };
  avoid: LabelAvoidAreas;
  seg: readonly [readonly number[], readonly number[]] | null;
  soft: LabelCircle[] | undefined;
  placed: MeasureLabelRect[];
} {
  const R = (a: number, b: number): number => a + (b - a) * r();
  const view = { width: Math.round(R(360, 1200)), height: Math.round(R(300, 800)) };
  const x = R(-30, view.width + 30), y = R(-30, view.height + 30);
  const w = Math.round(R(36, 150)), h = Math.round(R(16, 34));
  const rects: MeasureLabelRect[] = [];
  const circles: LabelCircle[] = [];
  if (r() < 0.45) {
    // 정밀 조준: 커서 둘레 원과 그 아래 손가락 자리
    const cx = x + R(-40, 40), cy = y + R(-30, 30);
    circles.push({ x: cx, y: cy, r: 30 });
    rects.push({ x: cx - 22, y: cy + 60 - 22, width: 44, height: 44 });
  }
  if (r() < 0.5) rects.push({ x: x + R(-60, 30), y: y + R(-40, 20), width: Math.round(R(60, 220)), height: Math.round(R(20, 40)) }); // 툴팁
  if (r() < 0.4) rects.push({ x: 0, y: 0, width: view.width, height: Math.round(R(30, 60)) }); // 위 띠
  if (r() < 0.3) rects.push({ x: R(0, view.width - 100), y: R(0, view.height - 60), width: R(40, 300), height: R(20, 120) });
  const seg = r() < 0.7 ? ([[x + R(-200, 0), y + R(-120, 120)], [x + R(0, 200), y + R(-120, 120)]] as const) : null;
  const soft = seg && r() < 0.8 ? [seg[0], seg[1]].map((p) => ({ x: p[0]!, y: p[1]!, r: 6 })) : undefined;
  const n = r() < 0.4 ? 0 : Math.floor(R(1, LABEL_PLACED_MAX + 6));
  const placed = Array.from({ length: n }, () => ({ x: x + R(-160, 120), y: y + R(-80, 60), width: Math.round(R(30, 120)), height: Math.round(R(14, 28)) }));
  return { x, y, w, h, view, avoid: { rects, circles }, seg, soft, placed };
}

describe("글상자 자리 고르기 fallback(0.28.0 — 'topRight'면 기본 자리가 막혔을 때 0.25.0 차례)", () => {
  const view = { width: 640, height: 400 };
  const size = { width: 58, height: 22 };

  it('SketchUp 결과 글 자리 계산과 무작위 3,000가지 모두 같다(first = 당기지 않은 가운데 { x, y } + fallback topRight). first만으로는 다른 자리가 있다', () => {
    const r = rng(28);
    let same026 = 0, moved = 0, withPlaced = 0;
    const N = 3000;
    for (let n = 0; n < N; n++) {
      const c = skpCase(r);
      const want = skpLabelSpot(c.x, c.y, c.w, c.h, c.view, c.avoid, c.seg, c.soft, c.placed);
      const wantXY = want ?? { x: c.x - c.w / 2, y: c.y - c.h / 2 };
      if (want) moved++;
      if (c.placed.length) withPlaced++;
      // 앱이 바꿀 부르기: 측정 점 표식은 avoid.soft로(앱 코드와 같게), 먼저 놓인 글상자가 없으면 placeMeasureLabel과 같다
      const a = c.soft?.length ? { ...c.avoid, soft: c.soft } : c.avoid;
      const first = { x: c.x - c.w / 2, y: c.y - c.h / 2 };
      const got = placeLabelAmong([c.x, c.y], { width: c.w, height: c.h }, c.view, a, c.placed, c.seg, null, { first, fallback: 'topRight' });
      expect({ x: got.x, y: got.y }).toEqual(wantXY);
      if (!c.placed.length) {
        const m = placeMeasureLabel([c.x, c.y], { width: c.w, height: c.h }, c.view, a, c.seg, { first, fallback: 'topRight' });
        expect({ x: m.x, y: m.y }).toEqual(wantXY);
      }
      const old = placeLabelAmong([c.x, c.y], { width: c.w, height: c.h }, c.view, a, c.placed, c.seg, null, { first });
      if (old.x === wantXY.x && old.y === wantXY.y) same026++;
    }
    // 입력이 옮기는 경우·먼저 놓인 글상자가 있는 경우를 고루 덮는다(이 입력에서 옮김 2,574·먼저 놓인 글상자 1,847, 0.26.0 first만으로 같은 자리 2,425 — 81%)
    expect(moved).toBeGreaterThan(N * 0.3);
    expect(withPlaced).toBeGreaterThan(N * 0.4);
    // 0.26.0 first만으로는 SketchUp 자리와 다른 경우가 있다(앱 요청의 까닭)
    expect(same026).toBeLessThan(N);
  });

  it('주지 않거나 first·모르는 값이면 0.27.0 계산 사본과 같은 자리(무작위 800가지 — 기본 자리 이름·앱 자리·피할 영역·먼저 놓인 글상자)', () => {
    const r = rng(2827);
    const R = (a: number, b: number): number => a + (b - a) * r();
    const spots: (LabelSpot | undefined)[] = [undefined, 'topRight', 'topLeft', 'bottomRight', 'bottomLeft', 'center', 'above', 'below', { x: 100, y: 50 }];
    for (let n = 0; n < 800; n++) {
      const at = [R(-20, 660), R(-20, 420)];
      const rects = Array.from({ length: Math.floor(R(0, 4)) }, () => ({ x: R(0, 600), y: R(0, 380), width: R(10, 200), height: R(10, 60) }));
      const circles = Array.from({ length: Math.floor(R(0, 2)) }, () => ({ x: R(0, 640), y: R(0, 400), r: R(5, 40) }));
      const soft = r() < 0.5 ? [{ x: at[0]!, y: at[1]!, r: 6 }] : undefined;
      const avoid: LabelAvoidAreas | null = r() < 0.15 ? null : { rects, circles, ...(soft ? { soft } : {}) };
      const seg = r() < 0.5 ? ([[R(0, 640), R(0, 400)], [R(0, 640), R(0, 400)]] as const) : null;
      const placed = Array.from({ length: Math.floor(R(0, 6)) }, () => ({ x: R(0, 600), y: R(0, 380), width: 58, height: 22 }));
      const spot = spots[Math.floor(R(0, spots.length))];
      const want = ref27.place(at, size, view, avoid, seg, spot);
      const wantA = ref27.among(at, size, view, avoid, placed, seg, soft, spot);
      for (const o of [{ first: spot }, { first: spot, fallback: 'first' as const }, { first: spot, fallback: 'x' as never }]) {
        expect(placeMeasureLabel(at, size, view, avoid, seg, o)).toEqual(want);
        expect(placeLabelAmong(at, size, view, avoid, placed, seg, soft, o)).toEqual(wantA);
      }
    }
  });

  it("오른쪽 위가 기본 자리면 fallback 'topRight'도 0.25.0과 같다(placeMeasureLabel — 무작위 400가지)", () => {
    const r = rng(25);
    const R = (a: number, b: number): number => a + (b - a) * r();
    for (let n = 0; n < 400; n++) {
      const at = [R(-20, 660), R(-20, 420)];
      const rects = Array.from({ length: Math.floor(R(0, 4)) }, () => ({ x: R(0, 600), y: R(0, 380), width: R(10, 200), height: R(10, 60) }));
      const soft = r() < 0.5 ? [{ x: at[0]!, y: at[1]!, r: 6 }] : undefined;
      const avoid: LabelAvoidAreas = { rects, ...(soft ? { soft } : {}) };
      const seg = r() < 0.5 ? ([[R(0, 640), R(0, 400)], [R(0, 640), R(0, 400)]] as const) : null;
      const want = placeMeasureLabel(at, size, view, avoid, seg);
      expect(placeMeasureLabel(at, size, view, avoid, seg, { fallback: 'topRight' })).toEqual(want);
      expect(placeMeasureLabel(at, size, view, avoid, seg, { first: 'topRight', fallback: 'topRight' })).toEqual(want);
    }
  });

  it("가운데가 막히면: 'first'는 측정 점 표식(soft)이 있는 오른쪽 위를 건너뛰지만 'topRight'는 0.25.0처럼 오른쪽 위", () => {
    const at = [300, 200];
    const c = placeMeasureLabel(at, size, view, null, null, { first: 'center' });
    const tr = placeMeasureLabel(at, size, view);
    // 가운데만 막는 작은 사각형, 오른쪽 위 글상자 안에 측정 점 표식
    const block = { x: 295, y: 195, width: 10, height: 10 };
    const avoid: LabelAvoidAreas = { rects: [block], soft: [{ x: tr.x + 20, y: tr.y + 10, r: 6 }] };
    const first = placeMeasureLabel(at, size, view, avoid, null, { first: 'center' });
    expect(first).not.toEqual(tr);
    expect(hitsAvoid(first, { circles: avoid.soft })).toBe(false);
    expect(placeMeasureLabel(at, size, view, avoid, null, { first: 'center', fallback: 'topRight' })).toEqual(tr);
    // 0.25.0 자리도 막히면 기본 자리(가운데)
    const all = { x: 0, y: 0, width: 640, height: 400 };
    expect(placeMeasureLabel(at, size, view, { rects: [all] }, [[100, 100], [500, 300]], { first: 'center', fallback: 'topRight' })).toEqual(c);
    // 막히지 않으면 가운데
    expect(placeMeasureLabel(at, size, view, { rects: [{ x: 0, y: 0, width: 5, height: 5 }] }, null, { first: 'center', fallback: 'topRight' })).toEqual(c);
  });

  it('placeLabelAmong: 먼저 놓인 글상자와만 겹치면 0.25.0 자리가 그것도 비켜야 받고, 피할 영역과 겹쳤으면 피할 영역만 비키면 받는다', () => {
    const at = [300, 200];
    const o = { first: 'center' as const, fallback: 'topRight' as const };
    const c = placeMeasureLabel(at, size, view, null, null, { first: 'center' });
    const tr = placeMeasureLabel(at, size, view);
    // 가운데에만 걸치는 먼저 놓인 글상자: 오른쪽 위
    const prev = { x: c.x + 3, y: c.y + 2, width: 20, height: 10 };
    expect(placeLabelAmong(at, size, view, null, [prev], null, null, o)).toEqual(tr);
    // 모든 자리를 덮는 먼저 놓인 글상자: 가운데(0.25.0 자리가 그것과 겹친다)
    const wall = { x: 0, y: 0, width: 640, height: 400 };
    expect(placeLabelAmong(at, size, view, null, [wall], null, null, o)).toEqual(c);
    // 가운데가 피할 영역과 겹치고 먼저 놓인 글상자가 모든 자리를 덮으면: 피할 영역만 비킨 0.25.0 자리(먼저 놓인 글상자와 겹쳐도)
    const block = { x: 295, y: 195, width: 10, height: 10 };
    const r = placeLabelAmong(at, size, view, { rects: [block] }, [wall], null, null, o);
    expect(r).toEqual(tr);
    expect(hitsAvoid(r, { rects: [block] })).toBe(false);
    // 먼저 놓인 글상자가 없으면 placeMeasureLabel과 같다
    expect(placeLabelAmong(at, size, view, { rects: [block] }, [], null, null, o)).toEqual(placeMeasureLabel(at, size, view, { rects: [block] }, null, o));
  });
});
