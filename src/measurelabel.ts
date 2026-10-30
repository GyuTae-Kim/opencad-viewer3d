/**
 * 측정 거리 글상자 자리(0.13.0): 기본 자리(두 점 화면 가운데에서 오른쪽 10·위 8, 캔버스 안으로 당김)가 앱이 알려 준 영역
 * (손가락 위 십자선·커서 옆 툴팁)이나 커서 둘레와 겹치면, 정해진 차례로 겹치지 않는 첫 자리를 고른다. 순수 계산이라 뷰어 밖에서도 쓴다.
 * 0.24.0: 글상자 여러 개를 차례로 놓을 때 먼저 놓인 글상자도 비킨다(placeLabelAmong — 앱 측정 덧그림 글상자끼리, 덧그림 글상자와 측정 거리 글상자).
 * 0.26.0: 앱이 정한 기본 자리(가운데·네 귀·위·아래, 또는 앱이 구한 왼쪽 위 자리)를 받는다(LabelPlaceOptions.first — 주지 않으면 0.25.0과 같은 오른쪽 위).
 */

/** 화면 사각형: 캔버스 왼쪽 위 기준 CSS 화소 */
export interface MeasureLabelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 화면 원(가운데·반지름, CSS 화소) — 커서 둘레 */
export interface LabelCircle {
  x: number;
  y: number;
  r: number;
}

/** 글상자가 피할 영역 */
export interface LabelAvoidAreas {
  rects?: readonly MeasureLabelRect[];
  circles?: readonly LabelCircle[];
  /**
   * 옮길 때만 될 수 있으면 가리지 않을 것(측정 점 표식 등). 기본 자리를 옮길지는 rects·circles로만 정하고,
   * 옮길 자리는 이것까지 비켜 가는 자리를 먼저 찾는다(없으면 rects·circles만 비켜 가는 자리)
   */
  soft?: readonly LabelCircle[];
}

/** 기준점에서 글상자까지 가로·세로 간격과 캔버스 가장자리 여백(0.12.0까지의 기본 자리와 같다) */
export const LABEL_GAP_X = 10;
export const LABEL_GAP_Y = 8;
export const LABEL_MARGIN = 4;
/** 네 귀 다음에 기준점을 옮겨 볼 선분 위 자리(첫 점 0 → 둘째 점 1). 가운데에 가까운 것부터, 같으면 첫 점 쪽부터 */
export const LABEL_ALONG: readonly number[] = [0.25, 0.75, 0, 1];
/** 글상자를 옮길 때 될 수 있으면 가리지 않을 측정 점 표식의 반지름(화소 — 점 4와 테 1.5에 조금 더) */
export const LABEL_POINT_R = 6;

/**
 * 글상자 기본 자리(0.26.0): 'topRight'(기본 — 0.25.0까지의 자리)·'topLeft'·'bottomRight'·'bottomLeft'는 기준점 네 귀(간격 LABEL_GAP_X·LABEL_GAP_Y),
 * 'center'는 기준점이 글상자 가운데, 'above'·'below'는 기준점 바로 위·아래 가운데(간격 LABEL_GAP_Y) — 이름 자리는 모두 캔버스 안으로 당긴다(여백 LABEL_MARGIN).
 * { x, y }는 앱이 구한 글상자 왼쪽 위(당기지 않고 그대로 쓴다)
 */
export type LabelSpot = 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft' | 'center' | 'above' | 'below' | { x: number; y: number };

/** 이름으로 정한 기본 자리(0.27.0 — 기준점을 따라 움직이는 뷰어 글상자가 받는 꼴: LabelSpot에서 앱 자리 { x, y }를 뺀 것) */
export type LabelSpotName = Exclude<LabelSpot, { x: number; y: number }>;

const SPOT_NAMES: readonly string[] = ['topRight', 'topLeft', 'bottomRight', 'bottomLeft', 'center', 'above', 'below'];

/** 이름 자리인지 고른다(0.27.0): LabelSpotName이면 그 값, 아니면(모르는 문자열·{ x, y }·그 밖) null */
export function labelSpotName(v: unknown): LabelSpotName | null {
  return typeof v === 'string' && SPOT_NAMES.includes(v) ? (v as LabelSpotName) : null;
}

/** placeMeasureLabel·placeLabelAmong 선택(0.26.0) */
export interface LabelPlaceOptions {
  /**
   * 기본 자리(차례의 첫 자리 — 피할 것과 겹치지 않으면 이 자리, 모두 막히면 이 자리). 그다음 차례는 0.25.0과 같다(기준점 네 귀 → 선분 위 자리의 네 귀 →
   * 피할 영역 위·아래 — 위·아래 자리의 가로는 기본 자리 → 오른쪽 위 → 왼쪽 위). 없으면 'topRight'(0.25.0과 같은 자리·차례)
   */
  first?: LabelSpot;
}

/** 두 사각형이 겹치는지(변이 맞닿기만 하면 겹치지 않는다) */
export function rectsOverlap(a: MeasureLabelRect, b: MeasureLabelRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** 사각형이 원과 겹치는지(원 가운데에서 사각형의 가장 가까운 점까지가 반지름보다 짧다) */
export function rectHitsCircle(a: MeasureLabelRect, c: LabelCircle): boolean {
  const dx = c.x - Math.min(Math.max(c.x, a.x), a.x + a.width);
  const dy = c.y - Math.min(Math.max(c.y, a.y), a.y + a.height);
  return dx * dx + dy * dy < c.r * c.r;
}

/** 피할 영역 가운데 하나라도 겹치는지 */
export function hitsAvoid(r: MeasureLabelRect, avoid: LabelAvoidAreas): boolean {
  for (const a of avoid.rects ?? []) if (rectsOverlap(r, a)) return true;
  for (const c of avoid.circles ?? []) if (rectHitsCircle(r, c)) return true;
  return false;
}

/**
 * 기준점(sx, sy) 둘레 귀 하나에 둔 글상자(캔버스 안으로 당김). corner 0 = 오른쪽 위(기본), 1 = 왼쪽 위, 2 = 오른쪽 아래, 3 = 왼쪽 아래.
 * 0은 0.12.0까지의 계산과 한 줄씩 같다(그래서 피할 것이 없으면 화소까지 같다)
 */
function cornerRect(sx: number, sy: number, w: number, h: number, vw: number, vh: number, corner: number): MeasureLabelRect {
  let x = corner & 1 ? sx - LABEL_GAP_X - w : sx + LABEL_GAP_X;
  let y = corner & 2 ? sy + LABEL_GAP_Y : sy - h - LABEL_GAP_Y;
  x = Math.min(Math.max(LABEL_MARGIN, x), vw - w - LABEL_MARGIN);
  y = Math.min(Math.max(LABEL_MARGIN, y), vh - h - LABEL_MARGIN);
  return { x, y, width: w, height: h };
}

/** 이름 자리 → 기준점 귀 번호(cornerRect) */
const SPOT_CORNER: Readonly<Record<string, number>> = { topRight: 0, topLeft: 1, bottomRight: 2, bottomLeft: 3 };

/**
 * 기본 자리(0.26.0 LabelSpot) 사각형과, 그것이 기준점 귀면 그 번호(아니면 −1). 없거나 모르는 값이면 오른쪽 위(0.25.0과 같다).
 * 'center'·'above'·'below'는 캔버스 안으로 당기고, { x, y }는 그대로(수가 아니면 오른쪽 위)
 */
function spotRect(spot: LabelSpot | undefined, sx: number, sy: number, w: number, h: number, vw: number, vh: number): { r: MeasureLabelRect; corner: number } {
  if (spot && typeof spot === 'object') {
    if (Number.isFinite(spot.x) && Number.isFinite(spot.y)) return { r: { x: spot.x, y: spot.y, width: w, height: h }, corner: -1 };
  } else if (spot === 'center' || spot === 'above' || spot === 'below') {
    const x = Math.min(Math.max(LABEL_MARGIN, sx - w / 2), vw - w - LABEL_MARGIN);
    const y0 = spot === 'center' ? sy - h / 2 : spot === 'above' ? sy - h - LABEL_GAP_Y : sy + LABEL_GAP_Y;
    const y = Math.min(Math.max(LABEL_MARGIN, y0), vh - h - LABEL_MARGIN);
    return { r: { x, y, width: w, height: h }, corner: -1 };
  } else if (typeof spot === 'string' && SPOT_CORNER[spot] !== undefined) {
    const k = SPOT_CORNER[spot]!;
    return { r: cornerRect(sx, sy, w, h, vw, vh, k), corner: k };
  }
  return { r: cornerRect(sx, sy, w, h, vw, vh, 0), corner: 0 };
}

/**
 * 측정 거리 글상자 자리(0.13.0): at = 기준점(두 점 화면 가운데), size = 글상자 크기, view = 캔버스 크기(CSS 화소).
 * 피할 영역(rects·circles)이 없거나 기본 자리(오른쪽 위)가 그것과 겹치지 않으면 기본 자리다. 겹치면 왼쪽 위 → 오른쪽 아래 → 왼쪽 아래, 그다음
 * segment(두 점의 화면 자리 — 없으면 건너뛴다)를 따라 LABEL_ALONG 자리마다 같은 네 귀, 그다음 피할 영역 하나하나의 바로 위·아래
 * (기본 자리·왼쪽 위의 가로 자리, 기본 자리에서 세로로 가까운 것부터 — 선분이 짧아 커서·십자선이 기준점 바로 옆일 때)를 차례로 보고,
 * 피할 영역과 soft(측정 점 표식)에 모두 겹치지 않는 첫 자리를 고른다. 그런 자리가 없으면 피할 영역에만 겹치지 않는 첫 자리, 그것도 없으면 기본 자리.
 * 0.26.0 opts.first: 기본 자리를 앱이 정한다(예: SketchUp 결과 글처럼 'center'). 그 뒤 차례는 기준점 네 귀(기본 자리와 같은 귀는 빼고) → 선분 위 자리 →
 * 피할 영역 위·아래(가로는 기본 자리 → 오른쪽 위 → 왼쪽 위)이고, 모두 막히면 그 기본 자리다. 주지 않으면 0.25.0과 같다
 */
export function placeMeasureLabel(
  at: readonly number[],
  size: { width: number; height: number },
  view: { width: number; height: number },
  avoid?: LabelAvoidAreas | null,
  segment?: readonly [readonly number[], readonly number[]] | null,
  opts?: LabelPlaceOptions | null,
): MeasureLabelRect {
  const w = size.width, h = size.height, vw = view.width, vh = view.height;
  const { r: first, corner } = spotRect(opts?.first, at[0]!, at[1]!, w, h, vw, vh);
  if (!avoid || (!avoid.rects?.length && !avoid.circles?.length) || !hitsAvoid(first, avoid)) return first;
  const cands: MeasureLabelRect[] = [];
  for (let k = 0; k < 4; k++) if (k !== corner) cands.push(cornerRect(at[0]!, at[1]!, w, h, vw, vh, k));
  if (segment) {
    const [a, b] = segment;
    for (const t of LABEL_ALONG) {
      const sx = a[0]! + (b[0]! - a[0]!) * t, sy = a[1]! + (b[1]! - a[1]!) * t;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      for (let k = 0; k < 4; k++) cands.push(cornerRect(sx, sy, w, h, vw, vh, k));
    }
  }
  // 피할 영역(원은 둘레 네모) 바로 위·아래: 세로 자리는 기본 자리에서 가까운 것부터(같으면 앞 영역의 위부터), 가로는 기본 자리 → 왼쪽 위
  // (0.26.0: 기본 자리가 오른쪽 위가 아니면 기본 자리 → 오른쪽 위 → 왼쪽 위)
  const ys: number[] = [];
  for (const b of [...(avoid.rects ?? []), ...(avoid.circles ?? []).map((c) => ({ x: c.x - c.r, y: c.y - c.r, width: 2 * c.r, height: 2 * c.r }))])
    ys.push(b.y - h - LABEL_GAP_Y, b.y + b.height + LABEL_GAP_Y);
  const left = cornerRect(at[0]!, at[1]!, w, h, vw, vh, 1).x;
  const xs = corner === 0 ? [first.x, left] : [first.x, cornerRect(at[0]!, at[1]!, w, h, vw, vh, 0).x, left];
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
}

/** 0.24.0: 먼저 놓인 글상자 가운데 피할 사각형에 더할 것의 수 한도(0.23.0 자리에 가까운 것부터 — 덧그림이 아주 많아도 한 글상자의 비용을 묶는다) */
export const LABEL_PLACED_MAX = 24;

/**
 * 글상자 자리 후보(placeMeasureLabel의 차례 — 기본 자리, 기준점 네 귀, 선분 위 자리의 네 귀, 피할 자리 위·아래)가 놓일 수 있는 가로 범위 [x0, x1].
 * 위·아래 자리는 기본 자리·오른쪽 위·왼쪽 위의 가로 자리라 기본 자리와 기준점 네 귀 안에 든다(first = 0.26.0 기본 자리 사각형)
 */
function labelReachX(
  at: readonly number[],
  w: number,
  h: number,
  vw: number,
  vh: number,
  segment: readonly [readonly number[], readonly number[]] | null | undefined,
  first: MeasureLabelRect,
): [number, number] {
  let x0 = Infinity, x1 = -Infinity;
  if (Number.isFinite(first.x)) {
    x0 = first.x;
    x1 = first.x + w;
  }
  const take = (sx: number, sy: number): void => {
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
    for (let k = 0; k < 4; k++) {
      const r = cornerRect(sx, sy, w, h, vw, vh, k);
      x0 = Math.min(x0, r.x);
      x1 = Math.max(x1, r.x + w);
    }
  };
  take(at[0]!, at[1]!);
  if (segment) {
    const [a, b] = segment;
    for (const t of LABEL_ALONG) take(a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t);
  }
  return [x0, x1];
}

/**
 * 글상자 하나를 먼저 놓인 글상자들(placed — 놓은 차례)과 겹치지 않게 놓는다(0.24.0 — 앱 측정 덧그림 글상자끼리, 덧그림 글상자와 측정 거리 글상자).
 * 먼저 placeMeasureLabel(at, size, view, avoid, segment)의 자리(0.23.0 자리 — 앱 영역만 비킨다)를 구해, 그것이 먼저 놓인 글상자와 겹치지 않으면 그 자리다
 * (피할 것이 없거나 겹치지 않으면 0.23.0과 같은 자리). 겹치면 먼저 놓인 글상자를 피할 사각형에 더해(앱 사각형 뒤에) 같은 차례로 다시 고른다 —
 * 옮길 때 될 수 있으면 가리지 않을 것은 avoid.soft, 그것이 없으면 soft(그 글상자의 점 표식). 그래도 모두 막히면 0.23.0 자리다.
 * 더하는 것은 이 글상자의 후보가 닿을 수 있는 가로 범위와 겹치는 먼저 놓인 글상자 가운데 0.23.0 자리 가운데에 가까운 LABEL_PLACED_MAX개
 * (거리가 같으면 먼저 놓인 것부터)다. 같은 입력이면 같은 자리다.
 * 0.26.0 opts.first: 앱이 정한 기본 자리(placeMeasureLabel과 같다 — 두 번 고르기 모두 그 자리부터). 주지 않으면 0.25.0과 같다
 */
export function placeLabelAmong(
  at: readonly number[],
  size: { width: number; height: number },
  view: { width: number; height: number },
  avoid: LabelAvoidAreas | null | undefined,
  placed: readonly MeasureLabelRect[],
  segment?: readonly [readonly number[], readonly number[]] | null,
  soft?: readonly LabelCircle[] | null,
  opts?: LabelPlaceOptions | null,
): MeasureLabelRect {
  const base = placeMeasureLabel(at, size, view, avoid, segment, opts);
  if (!placed.length || !placed.some((r) => rectsOverlap(base, r))) return base;
  const w = size.width, h = size.height;
  const first = spotRect(opts?.first, at[0]!, at[1]!, w, h, view.width, view.height).r;
  const [x0, x1] = labelReachX(at, w, h, view.width, view.height, segment, first);
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
  const r = placeMeasureLabel(at, size, view, { ...hard, soft: s }, segment, opts);
  return hitsAvoid(r, hard) ? base : r;
}

/** 앱이 준 사각형 하나를 고른다(수가 아니거나 너비·높이가 0 이하면 null). 복사본 */
export function avoidRect(r: unknown): MeasureLabelRect | null {
  if (!r || typeof r !== 'object') return null;
  const { x, y, width, height } = r as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}
