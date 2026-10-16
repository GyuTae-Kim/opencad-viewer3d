import { describe, expect, it } from 'vitest';
import { segmentsById } from '../src/segments';
import type { LineSet3d } from '../src/types';

const set = (id: string, segs: number[][], segmentIds?: number[]): LineSet3d => ({
  id,
  positions: new Float32Array(segs.flat()),
  ...(segmentIds ? { segmentIds: new Uint32Array(segmentIds) } : {}),
});

describe('원본 번호로 선분 모으기', () => {
  const rapid = set('rapid', [[0, 0, 0, 1, 0, 0], [1, 0, 0, 1, 1, 0]], [3, 7]);
  const feed = set('feed', [[2, 0, 0, 3, 0, 0], [3, 0, 0, 4, 0, 0], [4, 0, 0, 5, 0, 0]], [7, 7, 9]);
  const plain = set('plain', [[9, 9, 9, 8, 8, 8]]);

  it('여러 묶음에 걸친 같은 번호의 선분을 묶음 차례대로 모은다', () => {
    const p = segmentsById([rapid, feed, plain], [7]);
    expect(Array.from(p!)).toEqual([1, 0, 0, 1, 1, 0, 2, 0, 0, 3, 0, 0, 3, 0, 0, 4, 0, 0]);
  });

  it('번호 여러 개를 함께 찾는다', () => {
    expect(segmentsById([rapid, feed], [3, 9])!.length).toBe(12);
  });

  it('없는 번호·빈 목록이면 null', () => {
    expect(segmentsById([rapid, feed], [42])).toBeNull();
    expect(segmentsById([rapid, feed], [])).toBeNull();
  });

  it('segmentIds가 없는 묶음과 accept가 거른 묶음은 건너뛴다', () => {
    expect(segmentsById([plain], [0])).toBeNull();
    const p = segmentsById([rapid, feed], [7], (l) => l.id !== 'rapid');
    expect(p!.length).toBe(12);
  });

  it('segmentIds가 선분 수보다 길어도 선분 범위 밖은 읽지 않는다', () => {
    const odd = set('odd', [[0, 0, 0, 1, 1, 1]], [5, 5, 5]);
    expect(segmentsById([odd], [5])!.length).toBe(6);
  });
});
