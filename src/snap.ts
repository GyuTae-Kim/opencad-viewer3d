/**
 * 측정 점 붙잡기 고르기(0.8.0, 순수 함수 — DOM·WebGL 없음). Viewer3d.setMeasureSnap이 쓴다.
 *
 * 고르기(pickScene)가 붙잡은 점(꼭짓점·끝점·가운데 점)과 앱 붙잡기 점(원 중심 등) 가운데 커서에서 붙잡기 거리 안이고
 * 화면에 가장 가까운 보이는 것을 고른다. 거리가 같으면 앞의 것(고르기가 붙잡은 점 → 앱 점 차례)을 지킨다.
 * 보이는지(단면·가림) 따지기는 비싸므로 지금 고른 것보다 가까운 후보에만 묻는다.
 */
import type { SnapKind } from './types';
import { type ViewFrame, projectToScreen } from './camera';
import type { V3 } from './math';

/** 측정 점 고르기 결과: 찍을 점, 붙잡았는지, 붙잡은 종류(붙잡지 않았으면 null) */
export interface MeasureSnapPick {
  p: V3;
  vertex: boolean;
  kind: SnapKind | null;
}

/** 앱 붙잡기 후보(세계 점·종류·묶음 id) */
export interface SnapCandidate {
  p: V3;
  kind: SnapKind;
  id?: string;
}

/**
 * base = 고르기 결과(붙잡은 점이면 kind가 있다, 아무것도 고르지 않았으면 null), cands = 앱 붙잡기 후보,
 * visible(p, 화면 x, y, id) = 그 점이 보이는지(단면에 잘리지 않고 가리지 않음).
 * 원근에서 가까운 면(near)보다 앞의 점(눈 뒤 포함)은 뺀다
 */
export function chooseMeasureSnap(
  f: ViewFrame,
  x: number,
  y: number,
  snapPx: number,
  base: { p: V3; kind: SnapKind | null } | null,
  cands: Iterable<SnapCandidate>,
  visible: (p: V3, sx: number, sy: number, id: string | undefined) => boolean,
): MeasureSnapPick | null {
  let best: { p: V3; kind: SnapKind; dist: number } | null = null;
  if (base && base.kind) {
    const s = projectToScreen(f, base.p);
    best = { p: base.p, kind: base.kind, dist: s ? Math.hypot(s[0] - x, s[1] - y) : 0 };
  }
  for (const c of cands) {
    const s = projectToScreen(f, c.p);
    if (!s || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) continue;
    const dist = Math.hypot(s[0] - x, s[1] - y);
    if (dist > snapPx || (best && dist >= best.dist)) continue;
    if (f.projection === 'perspective' && s[2] < f.near * 0.999) continue;
    if (!visible(c.p, s[0], s[1], c.id)) continue;
    best = { p: c.p, kind: c.kind, dist };
  }
  if (best) return { p: best.p, vertex: true, kind: best.kind };
  return base ? { p: base.p, vertex: false, kind: null } : null;
}
