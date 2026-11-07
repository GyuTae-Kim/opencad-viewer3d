/**
 * 묶음 안 구간(순수 계산): 그물의 삼각형 번호·선분 묶음의 선분 번호·점 묶음의 점 번호 범위를 다룬다.
 * 뷰어는 숨긴 구간과 강조한 구간을 합쳐 "보이는 구간 목록(종류 표시)"으로 바꿔 그리고, 고르기·범위·단면 테두리에서 숨긴 구간을 건너뛴다.
 */

/** 번호 범위 [start, start + count) */
export interface IndexRange {
  start: number;
  count: number;
}

/** 보이는 구간 하나: hi면 강조 */
export interface RangePart {
  start: number;
  count: number;
  hi: boolean;
  /**
   * 0.44.0 구간 단면 갈래: 이 구간만 더 자르는 단면 평면 비트(평면 번호 k → 1 << k)의 합. 0·없으면 묶음 통째를 자르는 평면만(0.43.0 그대로).
   * 렌더러는 갈래마다 그 평면들을 균일 변수로 올리고 그 갈래의 구간만 그린다
   */
  cut?: number;
}

/** 0.44.0 구간 단면: 평면 하나(비트 1 << 평면 번호)가 그 묶음에서 자르는 구간(mergeRanges로 합친 것) */
export interface CutRanges {
  bit: number;
  ranges: readonly IndexRange[];
}

/** 0.44.0 구간 단면 갈래의 번호 구간 [start, end)와 그 구간을 자르는 평면 비트 합(0인 구간은 넣지 않는다) */
export interface CutRun {
  start: number;
  end: number;
  mask: number;
}

/** 0.44.0 평면마다의 구간들을 번호 차례의 갈래 구간으로(겹치면 비트를 합치고, 같은 비트의 이웃은 합친다) */
export function cutRuns(cuts: readonly CutRanges[]): CutRun[] {
  const out: CutRun[] = [];
  if (!cuts.length) return out;
  const set = new Set<number>();
  for (const c of cuts)
    for (const r of c.ranges) {
      set.add(r.start);
      set.add(r.start + r.count);
    }
  const pts = [...set].sort((a, b) => a - b);
  const at = cuts.map(() => 0);
  for (let j = 0; j + 1 < pts.length; j++) {
    const s = pts[j]!, e = pts[j + 1]!;
    let mask = 0;
    for (let k = 0; k < cuts.length; k++) {
      const R = cuts[k]!.ranges;
      while (at[k]! < R.length && R[at[k]!]!.start + R[at[k]!]!.count <= s) at[k]!++;
      if (at[k]! < R.length && R[at[k]!]!.start <= s) mask |= cuts[k]!.bit;
    }
    if (!mask) continue;
    const last = out[out.length - 1];
    if (last && last.end === s && last.mask === mask) last.end = e;
    else out.push({ start: s, end: e, mask });
  }
  return out;
}

/**
 * 0.44.0 보이는 구간 목록을 구간 단면 갈래로 더 나눈다: 구간마다 그 구간을 자르는 평면 비트의 합(cut — 0이면 두지 않는다)을 붙이고,
 * 같은 종류(hi)·같은 갈래의 이웃은 합친다. 갈래가 없으면 parts를 그대로(같은 배열) 돌려준다
 */
export function cutParts(parts: readonly RangePart[], cuts: readonly CutRanges[]): readonly RangePart[] {
  const runs = cutRuns(cuts);
  if (!runs.length) return parts;
  const out: RangePart[] = [];
  const push = (s: number, e: number, hi: boolean, cut: number): void => {
    if (e <= s) return;
    const last = out[out.length - 1];
    if (last && last.hi === hi && (last.cut ?? 0) === cut && last.start + last.count === s) last.count += e - s;
    else out.push(cut ? { start: s, count: e - s, hi, cut } : { start: s, count: e - s, hi });
  };
  let j = 0;
  for (const p of parts) {
    let s = p.start;
    const e = p.start + p.count;
    while (j < runs.length && runs[j]!.end <= s) j++;
    let k = j;
    while (s < e) {
      const r = runs[k];
      if (!r || r.start >= e) {
        push(s, e, p.hi, 0);
        break;
      }
      if (r.start > s) {
        push(s, r.start, p.hi, 0);
        s = r.start;
      }
      const t = Math.min(e, r.end);
      push(s, t, p.hi, r.mask);
      s = t;
      if (r.end <= e) k++;
    }
  }
  return out;
}

/** 0.44.0 구간 목록의 갈래(cut — 없으면 0) 값들(작은 것부터, 겹치지 않게). 구간이 없으면 빈 목록 */
export function partCuts(parts: readonly RangePart[]): number[] {
  const s = new Set<number>();
  for (const p of parts) s.add(p.cut ?? 0);
  return [...s].sort((a, b) => a - b);
}

/** 0.44.0 번호 → 그 번호를 자르는 평면 비트 합(갈래 구간 밖이면 0 — 이분 탐색). 갈래가 없으면 늘 0 */
export function cutMaskAt(runs: readonly CutRun[]): (i: number) => number {
  if (!runs.length) return () => 0;
  return (i: number): number => {
    let lo = 0, hi = runs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (runs[mid]!.start <= i) lo = mid + 1;
      else hi = mid;
    }
    const r = runs[lo - 1];
    return r && i < r.end ? r.mask : 0;
  };
}

/** 0.44.0 평면 비트 합 → 평면 번호들(작은 것부터) */
export function cutBits(mask: number): number[] {
  const out: number[] = [];
  for (let k = 0; mask >> k; k++) if (mask & (1 << k)) out.push(k);
  return out;
}

/** [0, n) 안으로 자르고, 정렬하고, 겹치거나 맞닿은 구간을 합친다(빈 구간·NaN은 버린다) */
export function mergeRanges(ranges: readonly IndexRange[] | null | undefined, n: number): IndexRange[] {
  if (!ranges?.length || !(n > 0)) return [];
  const tmp: [number, number][] = [];
  for (const r of ranges) {
    const s = Math.max(0, Math.floor(r.start)), e = Math.min(n, Math.floor(r.start) + Math.floor(r.count));
    if (Number.isFinite(s) && Number.isFinite(e) && e > s) tmp.push([s, e]);
  }
  tmp.sort((a, b) => a[0] - b[0]);
  const out: IndexRange[] = [];
  let cs = -1, ce = -1;
  for (const [s, e] of tmp) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      if (ce > cs) out.push({ start: cs, count: ce - cs });
      cs = s;
      ce = e;
    }
  }
  if (ce > cs) out.push({ start: cs, count: ce - cs });
  return out;
}

/** 구간들이 덮는 개수 */
export function rangesTotal(r: readonly IndexRange[]): number {
  let t = 0;
  for (const x of r) t += x.count;
  return t;
}

/**
 * [0, n)에서 숨긴 구간을 빼고, 남는 것을 강조 구간 안·밖으로 나눈 보이는 구간 목록(번호 차례, 같은 종류의 이웃은 합침).
 * hidden·hi는 mergeRanges로 합친 것.
 */
export function partitionRanges(n: number, hidden: readonly IndexRange[], hi: readonly IndexRange[]): RangePart[] {
  const out: RangePart[] = [];
  if (!(n > 0)) return out;
  // 경계점: 0, n, 모든 구간의 시작·끝 — 경계 사이 칸마다 종류가 하나다
  const cuts = new Set<number>([0, n]);
  for (const r of hidden) {
    cuts.add(r.start);
    cuts.add(r.start + r.count);
  }
  for (const r of hi) {
    cuts.add(r.start);
    cuts.add(r.start + r.count);
  }
  const pts = [...cuts].filter((v) => v >= 0 && v <= n).sort((a, b) => a - b);
  let ih = 0, ii = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const s = pts[k]!, e = pts[k + 1]!;
    if (e <= s) continue;
    while (ih < hidden.length && hidden[ih]!.start + hidden[ih]!.count <= s) ih++;
    while (ii < hi.length && hi[ii]!.start + hi[ii]!.count <= s) ii++;
    const isHidden = ih < hidden.length && hidden[ih]!.start <= s;
    if (isHidden) continue;
    const isHi = ii < hi.length && hi[ii]!.start <= s;
    const last = out[out.length - 1];
    if (last && last.hi === isHi && last.start + last.count === s) last.count += e - s;
    else out.push({ start: s, count: e - s, hi: isHi });
  }
  return out;
}

/** 보이는 구간 목록에서 한 종류만(차례대로). 0.44.0: cut을 주면 그 구간 단면 갈래만(cut이 없는 구간은 0) */
export function partsOf(parts: readonly RangePart[], hi: boolean, cut?: number): IndexRange[] {
  const out: IndexRange[] = [];
  for (const p of parts) if (p.hi === hi && (cut === undefined || (p.cut ?? 0) === cut)) out.push({ start: p.start, count: p.count });
  return out;
}

/** 구간들을 [lo, hi)로 자른다 */
export function clipRanges(r: readonly IndexRange[], lo: number, hi: number): IndexRange[] {
  const out: IndexRange[] = [];
  for (const x of r) {
    const s = Math.max(lo, x.start), e = Math.min(hi, x.start + x.count);
    if (e > s) out.push({ start: s, count: e - s });
  }
  return out;
}

/** 구간들(차례대로) 가운데 번호가 limit보다 작은 것의 개수 */
export function countBelow(r: readonly IndexRange[], limit: number): number {
  let t = 0;
  for (const x of r) {
    if (x.start >= limit) break;
    t += Math.min(x.count, limit - x.start);
  }
  return t;
}

/**
 * 합친 구간 안인지 판정하는 함수(이분 탐색, 구간이 없으면 null). 고르기에서 숨긴 기본 도형을 건너뛸 때 쓴다.
 */
export function rangeTester(r: readonly IndexRange[]): ((i: number) => boolean) | null {
  if (!r.length) return null;
  const starts = new Float64Array(r.length), ends = new Float64Array(r.length);
  r.forEach((x, k) => {
    starts[k] = x.start;
    ends[k] = x.start + x.count;
  });
  const m = r.length;
  return (i: number): boolean => {
    // starts[k] ≤ i 인 마지막 k
    let lo = 0, hi = m;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (starts[mid]! <= i) lo = mid + 1;
      else hi = mid;
    }
    return lo > 0 && i < ends[lo - 1]!;
  };
}

/**
 * 삼각형 구간들의 정점 번호를 한 배열로 모은다(그리기 호출 하나로 그리려고). indices가 없으면 정점 번호는 삼각형 번호 × 3 + k.
 * wire면 삼각형마다 변 세 개(a b, b c, c a)를 낸다.
 */
export function compactTriIndices(indices: Uint32Array | undefined, runs: readonly IndexRange[], wire = false): Uint32Array {
  const per = wire ? 6 : 3;
  const out = new Uint32Array(rangesTotal(runs) * per);
  let o = 0;
  for (const r of runs)
    for (let t = r.start, e = r.start + r.count; t < e; t++) {
      const a = indices ? indices[t * 3]! : t * 3;
      const b = indices ? indices[t * 3 + 1]! : t * 3 + 1;
      const c = indices ? indices[t * 3 + 2]! : t * 3 + 2;
      if (wire) {
        out[o++] = a;
        out[o++] = b;
        out[o++] = b;
        out[o++] = c;
        out[o++] = c;
        out[o++] = a;
      } else {
        out[o++] = a;
        out[o++] = b;
        out[o++] = c;
      }
    }
  return out;
}

/** 기본 도형 하나가 stride개 값인 배열(선분 위치 6, 선분 색 8, 점 3)에서 구간들만 이어 붙인 새 배열 */
export function compactStride(src: Float32Array, runs: readonly IndexRange[], stride: number): Float32Array {
  const out = new Float32Array(rangesTotal(runs) * stride);
  let o = 0;
  for (const r of runs) {
    const a = r.start * stride, b = Math.min(src.length, (r.start + r.count) * stride);
    if (b > a) out.set(src.subarray(a, b), o);
    o += r.count * stride;
  }
  return out;
}
