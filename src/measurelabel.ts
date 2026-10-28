/**
 * 측정 거리 글상자 자리(0.13.0): 기본 자리(두 점 화면 가운데에서 오른쪽 10·위 8, 캔버스 안으로 당김)가 앱이 알려 준 영역
 * (손가락 위 십자선·커서 옆 툴팁)이나 커서 둘레와 겹치면, 정해진 차례로 겹치지 않는 첫 자리를 고른다. 순수 계산이라 뷰어 밖에서도 쓴다.
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

/**
 * 측정 거리 글상자 자리(0.13.0): at = 기준점(두 점 화면 가운데), size = 글상자 크기, view = 캔버스 크기(CSS 화소).
 * 피할 영역(rects·circles)이 없거나 기본 자리(오른쪽 위)가 그것과 겹치지 않으면 기본 자리다. 겹치면 왼쪽 위 → 오른쪽 아래 → 왼쪽 아래, 그다음
 * segment(두 점의 화면 자리 — 없으면 건너뛴다)를 따라 LABEL_ALONG 자리마다 같은 네 귀, 그다음 피할 영역 하나하나의 바로 위·아래
 * (기본 자리·왼쪽 위의 가로 자리, 기본 자리에서 세로로 가까운 것부터 — 선분이 짧아 커서·십자선이 기준점 바로 옆일 때)를 차례로 보고,
 * 피할 영역과 soft(측정 점 표식)에 모두 겹치지 않는 첫 자리를 고른다. 그런 자리가 없으면 피할 영역에만 겹치지 않는 첫 자리, 그것도 없으면 기본 자리
 */
export function placeMeasureLabel(
  at: readonly number[],
  size: { width: number; height: number },
  view: { width: number; height: number },
  avoid?: LabelAvoidAreas | null,
  segment?: readonly [readonly number[], readonly number[]] | null,
): MeasureLabelRect {
  const w = size.width, h = size.height, vw = view.width, vh = view.height;
  const first = cornerRect(at[0]!, at[1]!, w, h, vw, vh, 0);
  if (!avoid || (!avoid.rects?.length && !avoid.circles?.length) || !hitsAvoid(first, avoid)) return first;
  const cands: MeasureLabelRect[] = [];
  for (let k = 1; k < 4; k++) cands.push(cornerRect(at[0]!, at[1]!, w, h, vw, vh, k));
  if (segment) {
    const [a, b] = segment;
    for (const t of LABEL_ALONG) {
      const sx = a[0]! + (b[0]! - a[0]!) * t, sy = a[1]! + (b[1]! - a[1]!) * t;
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
      for (let k = 0; k < 4; k++) cands.push(cornerRect(sx, sy, w, h, vw, vh, k));
    }
  }
  // 피할 영역(원은 둘레 네모) 바로 위·아래: 세로 자리는 기본 자리에서 가까운 것부터(같으면 앞 영역의 위부터), 가로는 기본 자리 → 왼쪽 위
  const ys: number[] = [];
  for (const b of [...(avoid.rects ?? []), ...(avoid.circles ?? []).map((c) => ({ x: c.x - c.r, y: c.y - c.r, width: 2 * c.r, height: 2 * c.r }))])
    ys.push(b.y - h - LABEL_GAP_Y, b.y + b.height + LABEL_GAP_Y);
  const left = cornerRect(at[0]!, at[1]!, w, h, vw, vh, 1).x;
  ys.map((y, i) => ({ y, i }))
    .filter((e) => Number.isFinite(e.y))
    .sort((p, q) => Math.abs(p.y - first.y) - Math.abs(q.y - first.y) || p.i - q.i)
    .forEach(({ y }) => {
      const cy = Math.min(Math.max(LABEL_MARGIN, y), vh - h - LABEL_MARGIN);
      cands.push({ x: first.x, y: cy, width: w, height: h }, { x: left, y: cy, width: w, height: h });
    });
  const free = cands.filter((r) => !hitsAvoid(r, avoid));
  const soft = avoid.soft?.length ? { circles: avoid.soft } : null;
  return (soft && free.find((r) => !hitsAvoid(r, soft))) || free[0] || first;
}

/** 앱이 준 사각형 하나를 고른다(수가 아니거나 너비·높이가 0 이하면 null). 복사본 */
export function avoidRect(r: unknown): MeasureLabelRect | null {
  if (!r || typeof r !== 'object') return null;
  const { x, y, width, height } = r as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}
