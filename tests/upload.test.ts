/** 0.9.0 큰 배열 나눠 올리기: 조각 자르기, 새로 올릴 배열 고르기, 가짜 GPU 버퍼에 조각으로 채운 결과가 원본과 같다 */
import { describe, expect, it } from 'vitest';
import { type BufferSink, type BufferTarget, CHUNK_BYTES, CHUNK_MIN_BYTES, ChunkedUpload, chunkRanges, newArrays } from '../src/upload';

describe('chunkRanges', () => {
  it('요소 크기 배수로 자르고 마지막 조각은 남은 만큼', () => {
    expect(chunkRanges(10, 4, 16)).toEqual([
      [0, 4],
      [4, 4],
      [8, 2],
    ]);
    expect(chunkRanges(0, 4, 16)).toEqual([]);
    // 조각이 요소 하나보다 작아도 적어도 하나씩
    expect(chunkRanges(3, 4, 2)).toEqual([
      [0, 1],
      [1, 1],
      [2, 1],
    ]);
  });
  it('기본 조각은 4 MiB, 나눠 올리는 기준은 8 MiB', () => {
    expect(CHUNK_BYTES).toBe(4 << 20);
    expect(CHUNK_MIN_BYTES).toBe(8 << 20);
    expect(chunkRanges(3_000_000 * 6, 4)).toHaveLength(Math.ceil((3_000_000 * 6 * 4) / CHUNK_BYTES));
  });
});

describe('newArrays', () => {
  it('같은 배열은 한 번, 빈 배열·이미 올린 배열·없는 것은 뺀다', () => {
    const a = new Float32Array(6), b = new Float32Array(3), up = new Float32Array(3), e = new Uint32Array(3);
    const r = newArrays(
      [{ data: a, target: 'array' }, null, { data: a, target: 'array' }, { data: new Float32Array(0), target: 'array' }, { data: up, target: 'array' }, { data: b, target: 'array' }, { data: e, target: 'element' }],
      (d) => d === up,
    );
    expect(r.map((x) => x.data)).toEqual([a, b, e]);
  });
});

describe('ChunkedUpload', () => {
  /** 가짜 GPU: 버퍼마다 바이트 배열, 쓰기 기록 */
  function fakeSink() {
    const bufs: { target: BufferTarget; bytes: Uint8Array }[] = [];
    const writes: number[] = [];
    const sink: BufferSink<number> = {
      alloc: (target, n) => bufs.push({ target, bytes: new Uint8Array(n) }) - 1,
      write: (b, target, off, src, srcOffset, length) => {
        expect(bufs[b]!.target).toBe(target);
        const bytes = new Uint8Array(src.buffer, src.byteOffset + srcOffset * src.BYTES_PER_ELEMENT, length * src.BYTES_PER_ELEMENT);
        bufs[b]!.bytes.set(bytes, off);
        writes.push(length * src.BYTES_PER_ELEMENT);
      },
    };
    return { sink, bufs, writes };
  }

  it('step()마다 배열 하나의 버퍼 잡기 또는 조각 하나 채우기 — 끝나면 원본과 바이트까지 같다', () => {
    const pos = new Float32Array(1000).map((_, i) => i * 0.5 - 7);
    const col = new Float32Array(1500).map((_, i) => (i % 17) / 16);
    const idx = new Uint32Array(999).map((_, i) => (i * 7) % 333);
    const { sink, bufs, writes } = fakeSink();
    const alloc: [unknown, BufferTarget, number][] = [];
    const up = new ChunkedUpload(
      [
        { data: pos, target: 'array' },
        { data: col, target: 'array' },
        { data: idx, target: 'element' },
      ],
      sink,
      (d, t, b) => alloc.push([d, t, b]),
      1024,
    );
    // 버퍼는 그 배열을 채우기 시작할 때 잡는다(한 걸음에 크게 0을 채우지 않게)
    expect(alloc).toHaveLength(0);
    expect(up.nextIsAlloc).toBe(true);
    expect(up.step()).toBe(false);
    expect(up.nextIsAlloc).toBe(false);
    expect(alloc.map((a) => a[1])).toEqual(['array']);
    expect(up.totalBytes).toBe(13996);
    let steps = 1;
    while (!up.step()) steps++;
    steps++;
    expect(alloc.map((a) => a[1])).toEqual(['array', 'array', 'element']);
    expect(bufs.map((b) => b.bytes.length)).toEqual([4000, 6000, 3996]);
    // 버퍼 잡기 3 + 조각(4000/1024 → 4, 6000/1024 → 6, 3996/1024 → 4)
    expect(steps).toBe(17);
    expect(writes.every((n) => n <= 1024)).toBe(true);
    expect(up.doneBytes).toBe(up.totalBytes);
    expect(up.done).toBe(true);
    expect(up.step()).toBe(true);
    expect(new Float32Array(bufs[0]!.bytes.buffer)).toEqual(pos);
    expect(new Float32Array(bufs[1]!.bytes.buffer)).toEqual(col);
    expect(new Uint32Array(bufs[2]!.bytes.buffer)).toEqual(idx);
  });

  it('부분 배열(subarray)도 제 자리부터 읽는다', () => {
    const big = new Float32Array(100).map((_, i) => i);
    const sub = big.subarray(10, 60);
    const { sink, bufs } = fakeSink();
    const up = new ChunkedUpload([{ data: sub, target: 'array' }], sink, () => undefined, 64);
    while (!up.step());
    expect(new Float32Array(bufs[0]!.bytes.buffer)).toEqual(sub);
  });
});
