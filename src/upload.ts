/**
 * 큰 배열 나눠 올리기(0.9.0, 순수 계산 — WebGL은 sink로 받는다). Renderer3d.uploadSome이 쓴다.
 *
 * 0.8.0 나눠 올리기는 묶음 단위라 아주 큰 배열 하나(선분 수백만 개 한 묶음)가 한 프레임에 걸렸다.
 * 묶음 하나가 새로 올릴 배열이 CHUNK_MIN_BYTES를 넘으면 배열마다 GPU 버퍼를 크기만 잡고(bufferData(size) — 이것도 한 걸음) 걸음마다
 * CHUNK_BYTES씩 채운다(bufferSubData). 다 채운 묶음부터 그린다(채우는 동안 그 묶음은 아직 그리지 않는다).
 */

/** 한 번에 채우는 크기(바이트) — 보통 GPU에서 1~3 ms */
export const CHUNK_BYTES = 4 << 20;
/** 묶음 하나가 새로 올릴 배열이 이보다 크면 나눠 올린다 */
export const CHUNK_MIN_BYTES = 8 << 20;

export type BufferTarget = 'array' | 'element';
/** 올리는 배열: 정점 속성(Float32, 0.26.0부터 작은 법선·무늬 좌표 Int8·Int16·Uint16)과 색인(Uint32) */
export type UploadArray = Float32Array | Uint32Array | Int8Array | Int16Array | Uint16Array;

/** GPU 버퍼 만들기·채우기(WebGL2: bufferData(size)·bufferSubData(offset, src, srcOffset, length)) */
export interface BufferSink<B> {
  alloc(target: BufferTarget, byteLength: number): B;
  write(buf: B, target: BufferTarget, dstByteOffset: number, src: UploadArray, srcOffset: number, length: number): void;
}

/** 배열 [0, length)를 chunkBytes(요소 크기 배수로 내림, 적어도 요소 하나)씩 자른 [시작, 개수] 목록 */
export function chunkRanges(length: number, bytesPerElement: number, chunkBytes = CHUNK_BYTES): [number, number][] {
  const per = Math.max(1, Math.floor(chunkBytes / bytesPerElement));
  const out: [number, number][] = [];
  for (let s = 0; s < length; s += per) out.push([s, Math.min(per, length - s)]);
  return out;
}

/** 같은 배열은 한 번만, 비었거나 이미 올린(has) 배열은 뺀 새로 올릴 배열 */
export function newArrays(list: readonly ({ data: UploadArray; target: BufferTarget } | null | undefined)[], has: (data: UploadArray) => boolean): { data: UploadArray; target: BufferTarget }[] {
  const seen = new Set<UploadArray>();
  const out: { data: UploadArray; target: BufferTarget }[] = [];
  for (const a of list) {
    if (!a || !a.data.length || seen.has(a.data) || has(a.data)) continue;
    seen.add(a.data);
    out.push(a);
  }
  return out;
}

/**
 * 묶음 하나의 배열들을 조각으로 올리는 일. step()마다 배열 하나의 버퍼 잡기(onAlloc으로 알린다 — 부르는 쪽이 버퍼 목록에 넣어
 * 올리기가 끊겨도 지울 수 있게) 또는 조각 하나 채우기를 한다(버퍼 잡기는 크기만큼 0을 채우므로 따로 한 걸음)
 */
export class ChunkedUpload<B> {
  private readonly jobs: { data: UploadArray; target: BufferTarget; buf: B | null; ranges: [number, number][]; next: number }[];
  private j = 0;
  /** 채운 바이트 / 전체 바이트 */
  readonly totalBytes: number;
  doneBytes = 0;

  constructor(
    arrays: readonly { data: UploadArray; target: BufferTarget }[],
    private readonly sink: BufferSink<B>,
    private readonly onAlloc: (data: UploadArray, target: BufferTarget, buf: B) => void,
    chunkBytes = CHUNK_BYTES,
  ) {
    this.jobs = arrays.map((a) => ({ ...a, buf: null, ranges: chunkRanges(a.data.length, a.data.BYTES_PER_ELEMENT, chunkBytes), next: 0 }));
    this.totalBytes = arrays.reduce((s, a) => s + a.data.byteLength, 0);
  }

  get done(): boolean {
    return this.j >= this.jobs.length;
  }

  /** 다음 걸음이 버퍼 잡기인지(크기만큼 0을 채워 무겁다 — 부르는 쪽은 프레임 처음에만 한다) */
  get nextIsAlloc(): boolean {
    return !this.done && this.jobs[this.j]!.buf === null;
  }

  /** 한 걸음(버퍼 잡기 또는 조각 하나 채우기). 다 채웠으면 true */
  step(): boolean {
    if (this.done) return true;
    const job = this.jobs[this.j]!;
    if (job.buf === null) {
      job.buf = this.sink.alloc(job.target, job.data.byteLength);
      this.onAlloc(job.data, job.target, job.buf);
      if (!job.ranges.length) this.j++;
      return this.done;
    }
    const [s, n] = job.ranges[job.next++]!;
    this.sink.write(job.buf, job.target, s * job.data.BYTES_PER_ELEMENT, job.data, s, n);
    this.doneBytes += n * job.data.BYTES_PER_ELEMENT;
    if (job.next >= job.ranges.length) this.j++;
    return this.done;
  }
}
