/**
 * 선분 강조용 순수 계산: 선분 묶음의 원본 번호(segmentIds, 예: NC 이동 번호)로 선분 쌍을 모은다.
 * 뷰어는 결과를 강조 선분으로 올려 깊이를 따져 그린다(Viewer3d.highlightSegmentIds).
 */
import type { LineSet3d } from './types';

/**
 * ids에 든 원본 번호를 가진 선분을 묶음들에서 모아 선분 쌍 xyz,xyz…로 돌려준다. 찾은 것이 없으면 null.
 * segmentIds가 없는 묶음과 accept가 거르는 묶음은 건너뛴다.
 * 결과 좌표는 base 기준이다(세계 = base + 결과). 묶음 원점(origin)은 더하고 base는 빼서 double로 계산한다.
 * 묶음 원점과 base가 모두 없으면 positions 값을 그대로 옮긴다(세계 좌표).
 */
export function segmentsById(
  lines: readonly LineSet3d[],
  ids: Iterable<number>,
  accept?: (l: LineSet3d) => boolean,
  base?: readonly number[] | null,
  /** 선분 하나를 건너뛸지(숨긴 구간 등) */
  skip?: (l: LineSet3d) => ((i: number) => boolean) | null | undefined,
): Float32Array | null {
  const want = new Set(ids);
  if (!want.size) return null;
  const hits: [LineSet3d, number][] = [];
  for (const l of lines) {
    const sid = l.segmentIds;
    if (!sid || (accept && !accept(l))) continue;
    const n = Math.min(sid.length, Math.floor(l.positions.length / 6));
    const sk = skip?.(l);
    for (let i = 0; i < n; i++) if (want.has(sid[i]!) && !(sk && sk(i))) hits.push([l, i]);
  }
  if (!hits.length) return null;
  const out = new Float32Array(hits.length * 6);
  hits.forEach(([l, i], k) => {
    const o = l.origin;
    if (!o && !base) {
      out.set(l.positions.subarray(i * 6, i * 6 + 6), k * 6);
      return;
    }
    const dx = (o?.[0] ?? 0) - (base?.[0] ?? 0), dy = (o?.[1] ?? 0) - (base?.[1] ?? 0), dz = (o?.[2] ?? 0) - (base?.[2] ?? 0);
    const P = l.positions;
    for (let e = 0; e < 2; e++) {
      const s = i * 6 + e * 3, d = k * 6 + e * 3;
      out[d] = P[s]! + dx;
      out[d + 1] = P[s + 1]! + dy;
      out[d + 2] = P[s + 2]! + dz;
    }
  });
  return out;
}
