/**
 * 측정 점 붙잡기 고르기(0.8.0, 순수 함수 — DOM·WebGL 없음). Viewer3d.setMeasureSnap이 쓴다.
 *
 * 고르기(pickScene)가 붙잡은 점(꼭짓점·끝점·가운데 점)과 앱 붙잡기 점(원 중심 등) 가운데 커서에서 붙잡기 거리 안이고
 * 화면에 가장 가까운 보이는 것을 고른다. 거리가 같으면 앞의 것(고르기가 붙잡은 점 → 앱 점 차례)을 지킨다.
 * 보이는지(단면·가림) 따지기는 비싸므로 지금 고른 것보다 가까운 후보에만 묻는다.
 *
 * 0.14.0 다듬기(MeasureSnapOptions.refine): 코어가 고른 수직 발·선분 가운데 점·붙잡지 않은 선분 위 점은 화면용 꺾은선 토막 위의 점이다.
 * 앱이 정확한 형상(B-rep 곡선 등) 위로 옮길 수 있게 무엇을 넘길지(refineTarget), 돌려받은 점을 받을지(acceptRefined)를 여기서 정한다.
 *
 * 0.15.0: 교차점(두 토막 — other)도 넘기고, 꺾은선으로는 후보가 없지만 곡선 위에는 있을 수 있는 "열린 후보"(토막 밖으로 떨어진 수직 발,
 * 허용치보다 조금 떨어져 지나가는 두 토막의 교차)는 앱이 다듬어 준 점으로 후보를 만든다(refineOpen — 호출 한도와 기억 RefineMemo).
 */
import type { Pick3d, SnapKind } from './types';
import { type ViewFrame, projectToScreen } from './camera';
import type { SnapAxis } from './inference';
import type { V3 } from './math';
import type { MeasureResult } from './viewer';

/**
 * 측정 점 고르기 결과: 찍을 점, 붙잡았는지, 붙잡은 종류(붙잡지 않았으면 null), 0.10.0부터 그 후보의 선분(수직 발 — 있을 때만),
 * 0.14.0부터 그 후보가 놓인 선분의 식별자(코어 수직 발 — 있을 때만), 0.15.0부터 교차점의 둘째 선분 식별자와
 * 열린 후보(앱이 이미 다듬은 점 — refined, 다듬기 전 코어 점 core)
 */
export interface MeasureSnapPick {
  p: V3;
  vertex: boolean;
  kind: SnapKind | null;
  edge?: [V3, V3];
  seg?: SnapSegment;
  other?: SnapSegment;
  refined?: boolean;
  core?: V3;
}

/**
 * 앱 붙잡기 후보(세계 점·종류·묶음 id, 0.10.0부터 추론 후보의 선분, 0.14.0부터 코어 수직 발이 놓인 선분의 식별자,
 * 0.15.0부터 코어 교차점의 둘째 선분 식별자, 열린 후보면 refined = true(p는 앱이 다듬은 점)와 다듬기 전 코어 점 core)
 */
export interface SnapCandidate {
  p: V3;
  kind: SnapKind;
  id?: string;
  edge?: [V3, V3];
  seg?: SnapSegment;
  other?: SnapSegment;
  refined?: boolean;
  core?: V3;
}

/**
 * 다듬을 점이 놓인 선분(0.14.0 — MeasureSnapOptions.refine에 넘긴다). 식별자는 고르기 결과(Pick3d)와 같은 뜻이라
 * 앱이 pointsFor에서 쓰던 찾기(그물 id와 윤곽선 선분 번호 → 앱의 모서리 표)를 그대로 쓴다
 */
export interface SnapSegment {
  /** 'line' = 선분 묶음(LineSet3d), 'edge' = 그물 윤곽선(Mesh3d.edges) — Pick3d.kind와 같다 */
  kind: 'line' | 'edge';
  /** 선분 묶음 id, 윤곽선이면 그 그물 id(Pick3d.id) */
  id: string;
  /** 원본 식별 번호: 선분 묶음은 segmentIds를 거친 값, 윤곽선은 Mesh3d.edges의 선분 번호(Pick3d.index) */
  index: number;
  /** 배열 안 선분 번호(Pick3d.raw): 선분 묶음 positions·윤곽선 edges에서 이 선분은 raw × 6부터 여섯 값 */
  raw: number;
  /** 세계 끝점 둘(묶음 origin·행렬을 거친 값, 단면으로 자르기 전 — 복사본) */
  ends: [V3, V3];
}

/**
 * 다듬을 점의 종류(0.14.0): 'perpendicular' = 첫 점에서 커서 둘레 선분으로 내린 수직 발(추론 붙잡기),
 * 'midpoint' = 코어가 붙잡은 선분 가운데 점(midpoints — 앱 점 pointsFor의 가운데 점은 아니다), 'onEdge' = 붙잡지 않은 선분·윤곽선 위 점.
 * 0.15.0: 'intersection' = 커서 둘레 두 선분의 교차점(추론 붙잡기 — 둘째 선분은 SnapRefineInput.other)
 */
export type SnapRefineKind = 'perpendicular' | 'midpoint' | 'onEdge' | 'intersection';

/** 다듬기 손잡이(MeasureSnapOptions.refine)가 받는 것(0.14.0 — 모두 복사본, 세계 좌표) */
export interface SnapRefineInput {
  kind: SnapRefineKind;
  /** 코어가 고른 점(꺾은선 토막 위). 열린 후보(open)면 아래 open의 뜻 */
  point: V3;
  /** 그 점이 놓인 선분(교차점이면 첫째 선분) */
  segment: SnapSegment;
  /** 0.15.0: 교차점('intersection')일 때만 — 둘째 선분 */
  other?: SnapSegment;
  /** 첫 측정 점(찍었으면 — 수직 발의 기준점), 없으면 null */
  first: V3 | null;
  /** 커서 광선(원점은 가까운 면 위, 방향은 단위) — 선분 위 점을 곡선에서 광선에 가장 가까운 점으로 다듬을 때 */
  ray: { origin: V3; dir: V3 };
  /**
   * 0.15.0 열린 후보면 true(아니면 이 필드가 없다): 꺾은선으로는 후보가 없지만 곡선 위에는 있을 수 있는 점이다.
   * 수직 발은 첫 점에서 그 토막으로 내린 발이 토막 밖(또는 끝점)이라 point는 그 발을 토막 범위로 자른 토막 끝(곡선 위 발이 그쪽에 있다),
   * 교차점은 두 토막이 허용치보다 조금 떨어져 지나가 point는 가장 가까운 두 점의 가운데다. 앱이 정확한 점을 모르면 null을 돌려준다 — 그러면 후보가 없다.
   * 결과는 종류·토막·첫 점으로만 정해져야 한다(뷰어가 커서 광선을 빼고 기억해 커서가 움직여도 다시 부르지 않는다)
   */
  open?: boolean;
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
  let best: { dist: number; c: SnapCandidate } | null = null;
  if (base && base.kind) {
    const s = projectToScreen(f, base.p);
    best = { c: { p: base.p, kind: base.kind }, dist: s ? Math.hypot(s[0] - x, s[1] - y) : 0 };
  }
  for (const c of cands) {
    const s = projectToScreen(f, c.p);
    if (!s || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) continue;
    const dist = Math.hypot(s[0] - x, s[1] - y);
    if (dist > snapPx || (best && dist >= best.dist)) continue;
    if (f.projection === 'perspective' && s[2] < f.near * 0.999) continue;
    if (!visible(c.p, s[0], s[1], c.id)) continue;
    best = { c, dist };
  }
  if (best) {
    const c = best.c;
    const r: MeasureSnapPick = { p: c.p, vertex: true, kind: c.kind };
    if (c.edge) r.edge = c.edge;
    if (c.seg) r.seg = c.seg;
    if (c.other) r.other = c.other;
    if (c.refined) r.refined = true;
    if (c.core) r.core = c.core;
    return r;
  }
  return base ? { p: base.p, vertex: false, kind: null } : null;
}

/**
 * 다듬을 후보(0.14.0): 고른 점 r이 코어 수직 발(선분 식별자가 실린 후보), 고르기가 붙잡은 선분 가운데 점, 붙잡지 않은 선분·윤곽선 위 점이면
 * 그 종류와 선분(복사본), 아니면 null. base = 고르기 결과(붙잡은 점 snap·종류·고른 것·고른 선분의 세계 끝점).
 * 0.15.0: 코어 교차점(두 선분 식별자가 실린 후보)도 — 둘째 선분은 other. 열린 후보(refined — 앱이 이미 다듬었다)는 넘기지 않는다.
 * 끝점·꼭짓점(꺾은선 꼭짓점은 곡선 위다), 앱 점(points·pointsFor — 앱이 이미 정확히 준다), 축·나란함(첫 점을 지나는 선)은 넘기지 않는다
 */
export function refineTarget(
  r: MeasureSnapPick | null,
  base: { snap: V3; snapKind: SnapKind | null; pick: Pick3d; ends?: [V3, V3] | undefined } | null,
): { kind: SnapRefineKind; segment: SnapSegment; other?: SnapSegment } | null {
  if (!r || r.refined) return null;
  if (r.kind === 'perpendicular') return r.seg ? { kind: 'perpendicular', segment: copySegment(r.seg) } : null;
  if (r.kind === 'intersection') return r.seg && r.other ? { kind: 'intersection', segment: copySegment(r.seg), other: copySegment(r.other) } : null;
  // 고르기가 고른 점 그대로일 때만(앱 점이 이기면 다른 객체다)
  if (!base || r.p !== base.snap || !base.ends) return null;
  const pk = base.pick;
  if (pk.kind !== 'line' && pk.kind !== 'edge') return null;
  const kind: SnapRefineKind | null = r.kind === null ? 'onEdge' : r.kind === 'midpoint' && base.snapKind === 'midpoint' ? 'midpoint' : null;
  if (!kind) return null;
  return { kind, segment: copySegment({ kind: pk.kind, id: pk.id, index: pk.index, raw: pk.raw ?? pk.index, ends: base.ends }) };
}

function copySegment(s: SnapSegment): SnapSegment {
  return { kind: s.kind, id: s.id, index: s.index, raw: s.raw, ends: [[s.ends[0][0], s.ends[0][1], s.ends[0][2]], [s.ends[1][0], s.ends[1][1], s.ends[1][2]]] };
}

/** 앱이 돌려준 값이 수 셋이 모두 유한한 점이면 그 복사본(0.14.0 — 배열·Float64Array 등), 아니면 null */
export function finitePoint(q: unknown): V3 | null {
  if (!q || typeof q !== 'object') return null;
  const a = q as ArrayLike<unknown>;
  const x = a[0], y = a[1], z = a[2];
  return typeof x === 'number' && typeof y === 'number' && typeof z === 'number' && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

/**
 * 앱이 다듬은 점 q를 받을지(0.14.0 안전장치): 화면에 투영되고(원근에서 가까운 면보다 앞·눈 뒤가 아님) 코어 점 core와 화면 거리가 maxPx(붙잡기 거리) 안이면 true.
 * 앱이 다른 모서리·곡선의 먼 점을 돌려주면 버리고 코어 점을 쓴다(미리 본 표식이 커서에서 튀지 않게)
 */
export function acceptRefined(f: ViewFrame, core: readonly number[], q: readonly number[], maxPx: number): boolean {
  const s = projectToScreen(f, q), c = projectToScreen(f, core);
  if (!s || !c || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) return false;
  if (f.projection === 'perspective' && s[2] < f.near * 0.999) return false;
  return Math.hypot(s[0] - c[0], s[1] - c[1]) <= maxPx;
}

const same3 = (a: readonly number[] | null, b: readonly number[] | null): boolean => (!a || !b ? a === b : a[0] === b[0] && a[1] === b[1] && a[2] === b[2]);

/** 같은 선분 식별자인지(종류·id·번호·끝점, 둘 다 없으면 같다) */
const sameSeg = (s: SnapSegment | undefined, t: SnapSegment | undefined): boolean =>
  !s || !t ? s === t : s.kind === t.kind && s.id === t.id && s.index === t.index && s.raw === t.raw && same3(s.ends[0], t.ends[0]) && same3(s.ends[1], t.ends[1]);

/**
 * 같은 다듬기 입력인지(0.14.0 — 같은 자리에서 미리 본 뒤 누르기, 한도가 바뀌어 다시 구하기): 종류·코어 점·선분(종류·id·번호·끝점)·첫 점·커서 광선이 모두 같으면 true.
 * 같으면 뷰어는 앱 함수를 다시 부르지 않고 앞 결과를 쓴다(미리 본 점이 그대로 찍힌다). 0.15.0: 둘째 선분(other)·열린 후보(open)도 견준다
 */
export function sameRefineInput(a: SnapRefineInput, b: SnapRefineInput): boolean {
  return (
    a.kind === b.kind &&
    same3(a.point, b.point) &&
    sameSeg(a.segment, b.segment) &&
    sameSeg(a.other, b.other) &&
    !!a.open === !!b.open &&
    same3(a.first, b.first) &&
    same3(a.ray.origin, b.ray.origin) &&
    same3(a.ray.dir, b.ray.dir)
  );
}

/** 열린 후보 다듬기(0.15.0)에서 미리 보기(측정 점 고르기) 한 번에 앱 함수를 새로 부르는 최대 횟수(기억에 있는 것은 세지 않는다) */
export const OPEN_REFINE_CALLS = 6;

/** 열린 후보 다듬기 기억(0.15.0)의 최대 항목 수(넘으면 가장 오래 쓰지 않은 것부터 지운다) */
export const OPEN_REFINE_MEMO = 256;

const segKey = (s: SnapSegment): string => `${s.kind}|${s.id.length}:${s.id}|${s.index}|${s.raw}|${s.ends[0].join(',')}|${s.ends[1].join(',')}`;

/**
 * 열린 후보 다듬기 기억의 열쇠(0.15.0): 종류·코어 점·선분(둘째 선분)·첫 점. 커서 광선은 넣지 않는다 —
 * 열린 후보의 코어 점은 토막과 첫 점으로만 정해지므로(커서와 상관없다) 커서가 그 둘레에서 움직이는 동안 같은 열쇠다
 */
export function openRefineKey(c: Pick<SnapRefineInput, 'kind' | 'point' | 'segment' | 'other' | 'first'>): string {
  return `${c.kind}#${c.point.join(',')}#${segKey(c.segment)}#${c.other ? segKey(c.other) : '-'}#${c.first ? c.first.join(',') : '-'}`;
}

/** 열린 후보 다듬기 기억(0.15.0): 열쇠 → 앱이 돌려준 점(받을 수 있는 수 셋의 복사본, 아니면 null). 가장 오래 쓰지 않은 것부터 지운다 */
export class RefineMemo {
  private readonly m = new Map<string, V3 | null>();
  constructor(readonly max = OPEN_REFINE_MEMO) {}
  /** 기억한 결과(없으면 undefined) */
  get(key: string): V3 | null | undefined {
    const v = this.m.get(key);
    if (v !== undefined) {
      this.m.delete(key);
      this.m.set(key, v);
    }
    return v;
  }
  set(key: string, v: V3 | null): void {
    this.m.delete(key);
    this.m.set(key, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  get size(): number {
    return this.m.size;
  }
}

/** 열린 후보(0.15.0 — inference.openCandidates가 만든다): 종류, 코어 점, 선분 식별자(교차점이면 둘째도), 기준 선분, 남는 쪽 판정, 같은 점으로 볼 거리 */
export interface OpenSnapCandidate {
  kind: 'perpendicular' | 'intersection';
  /** 코어 점(SnapRefineInput.open의 뜻) */
  p: V3;
  /** 붙잡기 후보 묶음 id(가림·단면 판정 — 첫째 선분의 묶음) */
  id: string;
  seg: SnapSegment;
  other?: SnapSegment;
  /** 수직 발이면 그 토막(잠글 때 기준 선분) */
  edge?: [V3, V3];
  /** 다듬은 점이 그 묶음(둘 다)의 단면에서 남는 쪽인지 */
  keep?: (p: readonly number[]) => boolean;
  /** 같은 점·코어 점 그대로로 볼 세계 거리(그 깊이에서 화면 반 화소) */
  tol: number;
}

/**
 * 열린 후보 풀기(0.15.0, 순수 — 앱 함수는 refine으로 받는다): 차례대로 기억(memo)을 먼저 보고, 없으면 남은 호출 수(budget.calls) 안에서만
 * 앱 다듬기를 불러(입력은 복사본, open = true) 기억한다. 받을 수 있는 점만 붙잡기 후보(refined = true, p = 다듬은 점, core = 코어 점)로 돌려준다:
 * 수 셋인 점이고, 코어 점에서 tol보다 멀고(그대로 돌려주면 앱이 정확한 점을 모른다는 뜻으로 본다), 그 묶음의 단면에서 남는 쪽이며,
 * 앞서 받은 같은 종류의 점과 tol 안에서 겹치지 않을 때(같은 곡선의 이웃 토막에서 같은 발·교차점이 여러 번 나오면 하나 — 커서에 가까운 토막 것).
 * 커서 거리·가림·눈 뒤는 붙잡기 고르기(chooseMeasureSnap)가 다듬은 점으로 따진다
 */
export function refineOpen(
  cands: Iterable<OpenSnapCandidate>,
  first: V3 | null,
  ray: { origin: V3; dir: V3 },
  refine: (c: SnapRefineInput) => unknown,
  memo: RefineMemo,
  budget: { calls: number },
): SnapCandidate[] {
  const out: SnapCandidate[] = [];
  for (const c of cands) {
    const key = openRefineKey({ kind: c.kind, point: c.p, segment: c.seg, other: c.other, first });
    let q = memo.get(key);
    if (q === undefined) {
      if (budget.calls <= 0) continue;
      budget.calls--;
      const input: SnapRefineInput = {
        kind: c.kind,
        point: [c.p[0], c.p[1], c.p[2]],
        segment: copySegment(c.seg),
        first: first ? [first[0], first[1], first[2]] : null,
        ray: { origin: [ray.origin[0], ray.origin[1], ray.origin[2]], dir: [ray.dir[0], ray.dir[1], ray.dir[2]] },
        open: true,
      };
      if (c.other) input.other = copySegment(c.other);
      q = finitePoint(refine(input));
      memo.set(key, q);
    }
    if (!q || dist3(q, c.p) <= c.tol || (c.keep && !c.keep(q))) continue;
    if (out.some((o) => o.kind === c.kind && dist3(o.p, q) <= c.tol)) continue;
    const s: SnapCandidate = { p: [q[0], q[1], q[2]], kind: c.kind, id: c.id, seg: c.seg, refined: true, core: c.p };
    if (c.other) s.other = c.other;
    if (c.edge) s.edge = c.edge;
    out.push(s);
  }
  return out;
}

const dist3 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

/**
 * 붙잡기 한도 값 고르기(0.10.0, setMeasureSnapLimit·setMeasureSnap({ limit })): 수(NaN 아님, +Infinity 아님)면 그대로, 아니면 null(한도 없음).
 * −Infinity는 차례 값이 있는 점을 모두 뺀다
 */
export function snapLimit(n: unknown): number | null {
  return typeof n === 'number' && !Number.isNaN(n) && n !== Infinity ? n : null;
}

/** 차례 값 order인 점이 한도 limit 안인지(차례가 없거나 한도가 없으면 늘 안) */
export function withinSnapLimit(order: number | undefined, limit: number | null): boolean {
  return limit === null || typeof order !== 'number' || Number.isNaN(order) || order < limit;
}

/**
 * 같은 고르기인지(0.10.0 — pointsFor 결과를 다시 쓸 때): 종류·묶음 id·번호(index·raw)·고른 점·법선·잘린 면이 모두 같으면 true.
 * 커서가 움직이면 고른 점이 달라지므로, 앱 점이 고른 점에 따라 달라도(가장 가까운 요소 찾기 등) 다시 쓴 결과가 부른 결과와 같다
 */
export function samePick(a: Pick3d, b: Pick3d): boolean {
  if (a.kind !== b.kind || a.id !== b.id || a.index !== b.index || a.raw !== b.raw || !!a.section !== !!b.section) return false;
  const p = a.point, q = b.point;
  if (p[0] !== q[0] || p[1] !== q[1] || p[2] !== q[2]) return false;
  const n = a.normal, m = b.normal;
  if (!n || !m) return !n && !m;
  return n[0] === m[0] && n[1] === m[1] && n[2] === m[2];
}

/**
 * 찍은 측정 점의 붙잡기: 종류(붙잡지 않았으면 null)와 축 붙잡기('axis')면 그 축,
 * 0.10.0부터 방향 추론(축·나란함·수직)이면 첫 점을 지나는 그 선의 단위 방향과 잠갔는지
 */
export interface MeasurePointSnap {
  kind: SnapKind | null;
  axis?: SnapAxis;
  direction?: V3;
  locked?: boolean;
  /** 0.14.0: 앱이 다듬은 점(MeasureSnapOptions.refine)이면 true — 측정 결과에는 싣지 않는다(measurePoints·measureHoverSnap에만) */
  refined?: boolean;
}

/**
 * 두 점 측정 결과(Viewer3d.measurement·onMeasure). snaps를 주면(붙잡기 선택을 켰을 때 — 찍은 점마다, 모르는 점은 undefined) snapA·snapB를 싣고,
 * 0.9.1부터 축 붙잡기('axis')인 점은 그 축을 axisA·axisB로 싣는다(다른 종류면 그 필드가 없다). snaps가 없으면 0.7.2 꼴(a·b·거리·dx dy dz).
 * 0.10.0: 방향 추론으로 찍은 점은 directionA·directionB(단위 방향 — 복사본), 잠금(Shift·setMeasureInferenceLock)으로 찍은 점은 lockedA·lockedB = true
 */
export function measureResult(a: V3, b: V3, snaps?: readonly [MeasurePointSnap | undefined, MeasurePointSnap | undefined] | null): MeasureResult {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const r: MeasureResult = { a, b, distance: Math.hypot(dx, dy, dz), dx, dy, dz };
  if (snaps) {
    const [sa, sb] = snaps;
    r.snapA = sa?.kind ?? null;
    r.snapB = sb?.kind ?? null;
    if (sa?.kind === 'axis' && sa.axis) r.axisA = sa.axis;
    if (sb?.kind === 'axis' && sb.axis) r.axisB = sb.axis;
    if (sa?.direction) r.directionA = [...sa.direction] as V3;
    if (sb?.direction) r.directionB = [...sb.direction] as V3;
    if (sa?.locked) r.lockedA = true;
    if (sb?.locked) r.lockedB = true;
  }
  return r;
}
