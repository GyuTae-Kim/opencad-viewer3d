/**
 * 선분 강조용 순수 계산: 선분 묶음의 원본 번호(segmentIds, 예: NC 이동 번호)로 선분 쌍을 모은다.
 * 뷰어는 결과를 강조 선분으로 올려 깊이를 따져 그린다(Viewer3d.highlightSegmentIds).
 */
import type { LineSet3d } from './types';

/**
 * ids에 든 원본 번호를 가진 선분을 묶음들에서 모아 선분 쌍 xyz,xyz…로 돌려준다. 찾은 것이 없으면 null.
 * segmentIds가 없는 묶음과 accept가 거르는 묶음은 건너뛴다.
 */
export function segmentsById(lines: readonly LineSet3d[], ids: Iterable<number>, accept?: (l: LineSet3d) => boolean): Float32Array | null {
  const want = new Set(ids);
  if (!want.size) return null;
  const hits: [LineSet3d, number][] = [];
  for (const l of lines) {
    const sid = l.segmentIds;
    if (!sid || (accept && !accept(l))) continue;
    const n = Math.min(sid.length, Math.floor(l.positions.length / 6));
    for (let i = 0; i < n; i++) if (want.has(sid[i]!)) hits.push([l, i]);
  }
  if (!hits.length) return null;
  const out = new Float32Array(hits.length * 6);
  hits.forEach(([l, i], k) => out.set(l.positions.subarray(i * 6, i * 6 + 6), k * 6));
  return out;
}
