/**
 * 0.25.0 놓기·문맥 복구: setScene(scene, { release })로 코어가 올린 뒤 그물 법선·무늬 좌표·무늬 원본을 장면 객체에서 지우고,
 * 그래픽 문맥을 잃었다 되찾으면 위치·색으로 먼저 그린 뒤 onContextRestore·restoreMeshArrays·restoreTexture로 다시 받는다.
 * 가짜 DOM·가짜 WebGL2로 놓은 뷰어(A)와 놓지 않은 뷰어(B — 같은 장면의 복사본)가 그리기(버퍼 내용 해시·균일 변수·묶인 무늬)·고르기·범위·단면에서
 * 같은지 견주고, 놓은 배열을 GC가 거두는지(약한 참조) 본다. 순수 계산(release.ts)도 시험한다.
 */
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type DrawEntry, type FakeBuffer, type FakeGL, fnv } from './fakegl';
import { type ContextRestoreNeed, Viewer3d } from '../src/viewer';
import { syntheticScene } from '../src/synth';
import { arraysMiss, layoutMiss, releaseFlags, takeArrays } from '../src/release';
import type { Mesh3d, Scene3d, Texture3d } from '../src/types';

// ───────────── 가짜 그림 풀기(createImageBitmap) ─────────────
interface FakeBitmap {
  width: number;
  height: number;
  tag: string;
  closed: boolean;
  close(): void;
}
const fakeBitmap = (tag: string, width: number, height: number): FakeBitmap => ({
  width,
  height,
  tag,
  closed: false,
  close() {
    this.closed = true;
  },
});

let dom: ReturnType<typeof installDom>;
const g = globalThis as Record<string, unknown>;
let savedCib: unknown;
beforeAll(() => {
  dom = installDom();
  savedCib = g.createImageBitmap;
  // 바이트는 내용 해시로, 그림은 그 꼬리표로 이름 붙인 가짜 그림(가짜 GL이 올린 그림 꼬리표를 그리기 기록에 남긴다)
  g.createImageBitmap = async (src: unknown, o?: ImageBitmapOptions): Promise<FakeBitmap> => {
    if (src instanceof Blob) {
      const b = new Uint8Array(await src.arrayBuffer());
      return fakeBitmap(`bytes:${fnv(b)}`, o?.resizeWidth ?? 64, o?.resizeHeight ?? 64);
    }
    const s = src as FakeBitmap;
    if (s.closed) throw new Error('닫힌 그림');
    return fakeBitmap(`bmp:${s.tag}`, o?.resizeWidth ?? s.width, o?.resizeHeight ?? s.height);
  };
});
afterAll(() => {
  g.createImageBitmap = savedCib;
  dom.restore();
});

// ───────────── 장면 ─────────────
/**
 * 합성 장면(무늬 포함)에 뒷면 무늬 둘을 더한다: 무늬 상자는 뒷면이 uvs를 함께 쓰고(backUvs 없음), 원근 무늬 판은 따로 준 backUvs(2값).
 * '구 둘'은 '구'의 배열(위치·법선·색·색인)을 함께 쓰는 다른 그물(행렬로 옮김), '격자' 무늬는 푼 그림(bitmap)으로 준다
 */
function makeScene(): Scene3d {
  const s = syntheticScene({ segments: 400, sphereSeg: 24, textures: true });
  const grid: Texture3d = { id: '격자', bitmap: fakeBitmap('격자', 16, 16) as unknown as ImageBitmap, width: 16, height: 16 };
  s.textures!.push(grid);
  const box = s.meshes.find((m) => m.id === '무늬 상자')!;
  box.backTexture = '격자';
  const quad = s.meshes.find((m) => m.id === '원근 무늬')!;
  quad.backTexture = '격자';
  quad.backUvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const sphere = s.meshes.find((m) => m.id === '구')!;
  s.meshes.push({ ...sphere, id: '구 둘', name: '구 둘', matrix: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 90, 0, 1]) });
  return s;
}

/** 배열을 새로 복사한 같은 장면(함께 쓰던 배열은 복사본도 함께 쓴다 — B 뷰어용) */
function copyScene(s: Scene3d): Scene3d {
  const map = new Map<object, object>();
  const c = <T,>(a: T): T => {
    if (!a || !ArrayBuffer.isView(a)) return a;
    let b = map.get(a);
    if (!b) map.set(a, (b = (a as unknown as Float32Array).slice()));
    return b as T;
  };
  return {
    ...s,
    meshes: s.meshes.map((m) => ({ ...m, positions: c(m.positions), normals: c(m.normals), indices: c(m.indices), colors: c(m.colors), edges: c(m.edges), uvs: c(m.uvs), backUvs: c(m.backUvs) })),
    lines: s.lines.map((l) => ({ ...l, positions: c(l.positions), colors: c(l.colors), segmentIds: c(l.segmentIds) })),
    points: s.points?.map((p) => ({ ...p, positions: c(p.positions) })),
    textures: s.textures?.map((t) => ({ ...t, data: c(t.data), bitmap: t.bitmap ? (fakeBitmap((t.bitmap as unknown as FakeBitmap).tag, t.bitmap.width, t.bitmap.height) as unknown as ImageBitmap) : undefined })),
  };
}

// ───────────── 뷰어 ─────────────
interface View {
  v: Viewer3d;
  gl: FakeGL;
  canvas: FakeElement;
}
function view(): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  const canvas = v.canvas as unknown as FakeElement;
  return { v, gl: canvas.gl!, canvas };
}

/**
 * 그리기 한 번의 기록(묶인 무늬 포함). 그리기 꼴·색인 꼴 상수는 이름으로 바꾼다(가짜 GL 상수 값은 처음 쓴 차례로 정해져, 문맥 복구처럼
 * 부르는 차례가 다른 두 뷰어에서 다르다). 단면 테두리 선분은 모으는 차례만 다를 수 있어 정렬한 해시로 바꾼다(v0110과 같다)
 */
function frame({ v, gl }: View): DrawEntry[] {
  // 묶인 무늬는 앞 그리기에서 남은 것이 있으므로 한 번 그린 뒤의 그리기를 적는다(두 뷰어의 앞 상태가 같게)
  v.renderNow();
  gl.draws = [];
  gl.logDraws = true;
  gl.logTextures = true;
  v.renderNow();
  gl.logDraws = false;
  gl.logTextures = false;
  const named = gl.draws.map((d) => ({
    ...d,
    args: d.args.map((x, i) => (i === 0 || (d.op === 'drawElements' && i === 2) ? (gl.nameOf(x) ?? x) : x)) as unknown as number[],
  }));
  const cut = (v as unknown as { renderer: { cutSeg: { pos: FakeBuffer } | null } }).renderer.cutSeg?.pos;
  if (!cut) return named;
  const raw = `${cut.bytes.length}:${fnv(cut.bytes)}`;
  const segs: string[] = [];
  for (let o = 0; o < cut.bytes.length; o += 24) segs.push(Array.from(cut.bytes.subarray(o, o + 24)).join(','));
  const canon = `cut:${segs.length}:${fnv(new TextEncoder().encode(segs.sort().join(';')))}`;
  return named.map((d) => ({ ...d, attribs: d.attribs.map((a) => a.replace(raw, canon)) }));
}

/** 조건이 맞을 때까지 시간으로 기다린다(가짜 그림 풀기는 Blob 읽기를 거친다 — 부하가 높아도 흔들리지 않게 횟수가 아니라 시간으로) */
async function until(cond: () => boolean, ms = 10_000): Promise<void> {
  const end = performance.now() + ms;
  while (!cond()) {
    if (performance.now() > end) throw new Error('기다림 시간을 넘었습니다');
    await new Promise((r) => setTimeout(r, 1));
  }
}
const texturesReady = (...ws: View[]): Promise<void> => until(() => ws.every((w) => w.v.stats.textures.ready === w.v.stats.textures.count && w.v.stats.textures.count > 0));

/** 문맥 잃기·되찾기(캔버스 사건 — 브라우저의 WEBGL_lose_context와 같은 길) */
function loseAndRestore(w: View): void {
  w.canvas.fire('webglcontextlost', {});
  w.canvas.fire('webglcontextrestored', {});
}

/** 나눠 올리기를 다 마칠 때까지 그린다 */
async function drain(w: View): Promise<void> {
  const r = (w.v as unknown as { renderer: { uploading: boolean } }).renderer;
  await until(() => {
    w.v.renderNow();
    return !r.uploading;
  });
}

const r9 = (x: number): number => +x.toPrecision(9);
const r9s = (p: ArrayLike<number> | undefined | null): number[] | null => (p ? Array.from(p, r9) : null);
/** 화면 격자 고르기(마디 가운데 — 그물·선의 경계를 정확히 가리키지 않게 칸 가운데) */
function picks(v: Viewer3d): unknown[] {
  const out: unknown[] = [];
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 12; i++) {
      const p = v.pick(((i + 0.5) * 800) / 12, ((j + 0.5) * 600) / 9, { edges: i % 2 === 0 });
      out.push(p ? [p.kind, p.id, p.index, r9s(p.point), r9s(p.normal)] : null);
    }
  return out;
}

/** 렌더러 그물 기록(놓은 꼴·없는 것·속성 버퍼) */
type Rec = { src: Mesh3d; lay: unknown; miss: unknown; attrs: { nrm: FakeBuffer | null; uv: FakeBuffer | null; buv: FakeBuffer | null } };
const recOf = (v: Viewer3d, id: string): Rec => (v as unknown as { renderer: { meshes: Rec[] } }).renderer.meshes.find((r) => r.src.id === id)!;

/** 두 뷰어를 같은 장면(B는 복사본)으로: A는 놓기 선택을 준다 */
async function pair(release: Parameters<Viewer3d['setScene']>[1] = { release: true }): Promise<{ A: View; B: View; sa: Scene3d; sb: Scene3d; keep: Scene3d }> {
  const sa = makeScene();
  const sb = copyScene(sa);
  const keep = copyScene(sa);
  const A = view(), B = view();
  A.v.setScene(sa, release);
  B.v.setScene(sb);
  await texturesReady(A, B);
  return { A, B, sa, sb, keep };
}

// ───────────── 순수 계산 ─────────────
describe('release.ts 순수 계산', () => {
  it('releaseFlags: true = 셋 모두, 객체는 true인 필드만, 없으면 null', () => {
    expect(releaseFlags(true)).toEqual({ normals: true, uvs: true, textures: true });
    expect(releaseFlags({ normals: true })).toEqual({ normals: true, uvs: false, textures: false });
    expect(releaseFlags({ uvs: true, textures: false })).toEqual({ normals: false, uvs: true, textures: false });
    expect(releaseFlags({})).toBeNull();
    expect(releaseFlags(false)).toBeNull();
    expect(releaseFlags(undefined)).toBeNull();
    expect(releaseFlags({ normals: 1 as unknown as boolean })).toBeNull();
  });

  it('layoutMiss: 뒷면이 uvs를 함께 썼으면 뒷면이 없을 때 uvs를, 따로 준 backUvs면 backUvs를 다시 받는다', () => {
    const lay = { nv: 4, normals: true, uv: 2 as const, buv: 2 as const, ownBack: false };
    expect(layoutMiss(lay, { normals: true, uv: true, buv: true })).toBeNull();
    expect(layoutMiss(lay, { normals: false, uv: true, buv: true })).toEqual({ normals: true, uvs: false, backUvs: false });
    expect(layoutMiss(lay, { normals: true, uv: true, buv: false })).toEqual({ normals: false, uvs: true, backUvs: false });
    expect(layoutMiss({ ...lay, ownBack: true }, { normals: true, uv: true, buv: false })).toEqual({ normals: false, uvs: false, backUvs: true });
    expect(layoutMiss({ nv: 4, normals: false, uv: 0, buv: 0, ownBack: false }, { normals: false, uv: false, buv: false })).toBeNull();
  });

  it('arraysMiss·takeArrays: 꼴에 맞는 길이만 셈하고 받는다(앱이 미리 준 배열이 먼저)', () => {
    const lay = { nv: 4, normals: true, uv: 3 as const, buv: 2 as const, ownBack: true };
    const n = new Float32Array(12), u3 = new Float32Array(12), b2 = new Float32Array(8);
    expect(arraysMiss(lay, {})).toEqual({ normals: true, uvs: true, backUvs: true });
    expect(arraysMiss(lay, { normals: n }, { uvs: u3, backUvs: b2 })).toBeNull();
    expect(arraysMiss(lay, { normals: new Float32Array(11) })).toEqual({ normals: true, uvs: true, backUvs: true });
    const miss = { normals: true, uvs: false, backUvs: true };
    expect(takeArrays(miss, lay, { normals: n, uvs: u3, backUvs: b2 })).toEqual({ normals: n, backUvs: b2 });
    expect(takeArrays(miss, lay, { normals: new Float32Array(3), uvs: u3 })).toBeNull();
  });
});

// ───────────── 놓기 ─────────────
describe('0.25.0 놓기(setScene release)', () => {
  it('주지 않으면 장면 배열·무늬 원본을 그대로 두고 다시 받을 것도 없다', async () => {
    const s = makeScene();
    const A = view();
    A.v.setScene(s);
    await texturesReady(A);
    A.v.renderNow();
    const sp = s.meshes.find((m) => m.id === '구')!;
    expect(sp.normals).toBeInstanceOf(Float32Array);
    expect(s.meshes.find((m) => m.id === '원근 무늬')!.backUvs).toBeInstanceOf(Float32Array);
    expect(s.textures![0]!.data).toBeInstanceOf(Uint8Array);
    expect((s.textures![1]!.bitmap as unknown as FakeBitmap).closed).toBe(false);
    expect(A.v.restoreNeed).toBeNull();
    expect(recOf(A.v, '구').lay).toBeNull();
  });

  it('주면 올린 뒤 법선·무늬 좌표·무늬 원본을 지우고(푼 그림은 닫는다), 그림·다시 묶은 구간·모드는 놓지 않은 뷰어와 같다', async () => {
    const sa0 = makeScene();
    const grid = sa0.textures![1]!.bitmap as unknown as FakeBitmap;
    const sb0 = copyScene(sa0);
    const A = view(), B = view();
    A.v.setScene(sa0, { release: true });
    B.v.setScene(sb0);
    await texturesReady(A, B);
    expect(grid.closed).toBe(true);
    const sa = sa0;
    for (const m of sa.meshes) {
      expect(m.normals).toBeUndefined();
      expect(m.uvs).toBeUndefined();
      expect(m.backUvs).toBeUndefined();
      expect(m.positions).toBeInstanceOf(Float32Array);
    }
    expect(sa.textures![0]!.data).toBeUndefined();
    expect(sa.textures![1]!.bitmap).toBeUndefined();
    expect(A.v.stats.textures).toMatchObject({ count: 2, ready: 2, missing: 0 });
    expect(frame(A)).toEqual(frame(B));
    // 구간 숨김·강조(24구간 넘게 — 모은 색인으로 VAO를 다시 묶는다), 와이어프레임·X-ray·숨은 선·단색
    const band = Array.from({ length: 40 }, (_, k) => ({ start: k * 20, count: 9 }));
    for (const w of [A, B]) {
      w.v.setHiddenRanges('구', band);
      w.v.highlightRanges({ '구 둘': band, '무늬 상자': [{ start: 2, count: 4 }] });
    }
    expect(frame(A)).toEqual(frame(B));
    for (const mode of ['wireframe', 'xray', 'hiddenLine', 'monochrome', 'noTexture', 'shadedEdges'] as const) {
      for (const w of [A, B]) w.v.setRenderMode(mode);
      expect(frame(A)).toEqual(frame(B));
    }
  });

  it('붙잡지 않는다: 놓은 배열·무늬 바이트는 GC가 거두고, 놓지 않으면 장면이 쥔다(약한 참조)', async () => {
    setFlagsFromString('--expose-gc');
    const gc = ((g.gc as (() => void) | undefined) ?? runInNewContext('gc')) as () => void;
    const weak = (s: Scene3d): WeakRef<object>[] => {
      const out: WeakRef<object>[] = [];
      for (const m of s.meshes) for (const a of [m.normals, m.uvs, m.backUvs]) if (a) out.push(new WeakRef(a));
      for (const t of s.textures ?? []) if (t.data) out.push(new WeakRef(t.data));
      return out;
    };
    const A = view(), B = view();
    // 장면을 만든 함수 밖에서는 약한 참조만 든다(뷰어만 장면을 쥔다)
    const [ra, rb] = ((): [WeakRef<object>[], WeakRef<object>[]] => {
      const sa = makeScene(), sb = makeScene();
      const w = [weak(sa), weak(sb)] as [WeakRef<object>[], WeakRef<object>[]];
      A.v.setScene(sa, { release: true });
      B.v.setScene(sb);
      return w;
    })();
    await texturesReady(A, B);
    A.v.renderNow();
    B.v.renderNow();
    expect(ra.length).toBe(6); // 구·구 둘 법선(같은 배열을 둘이 씀), 무늬 상자 uvs, 원근 무늬 uvs·backUvs, 바둑판 바이트(격자는 푼 그림 — 닫는다)
    for (let k = 0; k < 3; k++) {
      await new Promise((r) => setTimeout(r, 5));
      gc();
    }
    expect(ra.filter((r) => r.deref() !== undefined).length).toBe(0);
    expect(rb.filter((r) => r.deref() === undefined).length).toBe(0);
  });

  it('배열을 비워도(제자리에서 0으로) 그림이 같다 — 코어는 올린 뒤 그 배열을 다시 읽지 않는다', async () => {
    const sa = makeScene();
    const held = sa.meshes.flatMap((m) => [m.normals, m.uvs, m.backUvs]).filter((a): a is Float32Array => !!a);
    const A = view();
    A.v.setScene(sa, { release: true });
    await texturesReady(A);
    const before = frame(A);
    for (const a of held) a.fill(0);
    expect(frame(A)).toEqual(before);
    // 기록을 다시 만드는 일(다른 그물 빼기·구간 숨김·와이어프레임)도 그 배열을 읽지 않는다 — 놓지 않은 뷰어와 같은 차례로
    const B = view();
    B.v.setScene(copyScene(makeScene()));
    await texturesReady(B);
    expect(frame(B)).toEqual(before);
    for (const w of [A, B]) {
      w.v.removeMesh('판');
      w.v.setHiddenRanges('구', Array.from({ length: 30 }, (_, k) => ({ start: k * 30, count: 5 })));
    }
    expect(frame(A)).toEqual(frame(B));
    for (const w of [A, B]) w.v.setRenderMode('wireframe');
    expect(frame(A)).toEqual(frame(B));
  });

  it('고르기·범위·단면 테두리·측정 붙잡기는 위치·색인만 써서 놓아도 같다', async () => {
    const { A, B } = await pair();
    expect(picks(A.v)).toEqual(picks(B.v));
    expect(A.v.sectionRange('x')).toEqual(B.v.sectionRange('x'));
    for (const w of [A, B]) {
      w.v.setSection({ normal: [0, 1, 0], offset: 40 });
      w.v.setMeasureMode(true);
      w.v.setMeasureSnap({ midpoints: true });
    }
    expect(frame(A)).toEqual(frame(B));
    expect(picks(A.v)).toEqual(picks(B.v));
    for (const w of [A, B]) {
      w.canvas.fire('pointermove', { clientX: 300, clientY: 260, pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      w.v.renderNow();
    }
    expect(A.v.measureHoverSnap).toEqual(B.v.measureHoverSnap);
  });

  it('켠 것만 놓는다: 법선만 주면 무늬 좌표·무늬 원본은 그대로이고 문맥 복구에서도 법선만 다시 받는다', async () => {
    const s = makeScene();
    const A = view();
    A.v.setScene(s, { release: { normals: true } });
    await texturesReady(A);
    expect(s.meshes.find((m) => m.id === '구')!.normals).toBeUndefined();
    expect(s.meshes.find((m) => m.id === '원근 무늬')!.uvs).toBeInstanceOf(Float32Array);
    expect(s.meshes.find((m) => m.id === '원근 무늬')!.backUvs).toBeInstanceOf(Float32Array);
    expect(s.textures![0]!.data).toBeInstanceOf(Uint8Array);
    const needs: ContextRestoreNeed[] = [];
    A.v.onContextRestore((n) => void needs.push(n));
    loseAndRestore(A);
    expect(needs).toEqual([
      {
        meshes: [
          { id: '구', normals: true, uvs: false, backUvs: false },
          { id: '구 둘', normals: true, uvs: false, backUvs: false },
        ],
        textures: [],
      },
    ]);
    // 무늬는 원본이 남아 있어 예전처럼 다시 푼다
    await texturesReady(A);
  });

  it('나눠 올리기에서도 그 그물 차례에 올린 뒤 지우고, 다 올린 그림이 같다', async () => {
    const sa = makeScene(), sb = copyScene(sa);
    const A = view(), B = view();
    A.v.setScene(sa, { release: true, incremental: { budgetMs: 0 } });
    B.v.setScene(sb);
    const sp = sa.meshes.find((m) => m.id === '구')!;
    expect(sp.normals).toBeInstanceOf(Float32Array);
    await drain(A);
    expect(sp.normals).toBeUndefined();
    await texturesReady(A, B);
    expect(frame(A)).toEqual(frame(B));
  });
});

// ───────────── 문맥 복구 ─────────────
describe('0.25.0 문맥을 잃었다 되찾기', () => {
  it('놓지 않은 앱: 장면 배열을 그대로 다시 올려 그림이 같고 알림은 없다(0.24.0과 같다)', async () => {
    const s = makeScene();
    const A = view();
    A.v.setScene(s);
    await texturesReady(A);
    const before = frame(A);
    const cb = vi.fn();
    A.v.onContextRestore(cb);
    loseAndRestore(A);
    await texturesReady(A);
    expect(frame(A)).toEqual(before);
    expect(cb).not.toHaveBeenCalled();
    expect(A.v.restoreNeed).toBeNull();
  });

  it('놓은 앱: 위치·색으로 먼저 그리고, 알림의 need를 앱이 주는 대로 되돌려 처음 그림과 같아진다', async () => {
    const { A, B, keep } = await pair();
    const want = frame(B);
    expect(frame(A)).toEqual(want);
    const needs: ContextRestoreNeed[] = [];
    A.v.onContextRestore((need) => {
      needs.push(need);
    });
    loseAndRestore(A);
    expect(needs.length).toBe(1);
    const need = needs[0]!;
    expect(need.textures).toEqual(['바둑판', '격자']);
    const byId = new Map(need.meshes.map((m) => [m.id, m]));
    expect(byId.get('구')).toEqual({ id: '구', normals: true, uvs: false, backUvs: false });
    expect(byId.get('구 둘')).toEqual({ id: '구 둘', normals: true, uvs: false, backUvs: false });
    expect(byId.get('무늬 상자')).toEqual({ id: '무늬 상자', normals: false, uvs: true, backUvs: false });
    expect(byId.get('원근 무늬')).toEqual({ id: '원근 무늬', normals: false, uvs: true, backUvs: true });
    expect(byId.size).toBe(4);
    expect(A.v.stats.textures).toMatchObject({ count: 2, ready: 0, missing: 2 });
    // 위치·색으로만: 구는 법선 속성 없이(평면 음영) 그린다
    const flat = frame(A);
    expect(flat).not.toEqual(want);
    expect(recOf(A.v, '구').attrs.nrm).toBeNull();
    // 앱이 주는 대로: 법선 먼저(구만) — 구 둘은 아직
    const of = (id: string): Mesh3d => keep.meshes.find((m) => m.id === id)!;
    expect(A.v.restoreMeshArrays('구', { normals: of('구').normals })).toBe(true);
    expect(A.v.restoreNeed!.meshes.map((m) => m.id)).toEqual(['무늬 상자', '원근 무늬', '구 둘']);
    // 없는 것만 받는다(이미 있는 법선·길이가 맞지 않는 배열은 false)
    expect(A.v.restoreMeshArrays('구', { normals: of('구').normals })).toBe(false);
    expect(A.v.restoreMeshArrays('구 둘', { normals: new Float32Array(3) })).toBe(false);
    for (const id of ['구 둘', '무늬 상자', '원근 무늬']) expect(A.v.restoreMeshArrays(id, { normals: of(id).normals, uvs: of(id).uvs, backUvs: of(id).backUvs })).toBe(true);
    expect(A.v.restoreNeed).toEqual({ meshes: [], textures: ['바둑판', '격자'] });
    // 무늬: 바이트·그림으로 다시 준다(받은 그림은 닫는다)
    const gb = fakeBitmap('격자', 16, 16);
    expect(await A.v.restoreTexture('바둑판', keep.textures![0]!.data!)).toBe(true);
    expect(await A.v.restoreTexture('격자', gb as unknown as ImageBitmap)).toBe(true);
    expect(gb.closed).toBe(true);
    expect(A.v.restoreNeed).toBeNull();
    expect(A.v.stats.textures).toMatchObject({ count: 2, ready: 2, missing: 0 });
    expect(frame(A)).toEqual(want);
    // 다시 받은 배열도 붙잡지 않는다(그물 객체에 넣지 않는다)
    expect(recOf(A.v, '구').src.normals).toBeUndefined();
    expect(await A.v.restoreTexture('바둑판', keep.textures![0]!.data!)).toBe(false);
  });

  it('주지 않은 무늬는 평균색(그물 color) 그대로이고, 다시 잃었다 되찾으면 또 알린다', async () => {
    const { A, keep } = await pair();
    let n = 0;
    A.v.onContextRestore(() => void n++);
    loseAndRestore(A);
    const of = (id: string): Mesh3d => keep.meshes.find((m) => m.id === id)!;
    for (const m of keep.meshes) A.v.restoreMeshArrays(m.id, { normals: of(m.id).normals, uvs: of(m.id).uvs, backUvs: of(m.id).backUvs });
    expect(A.v.restoreNeed).toEqual({ meshes: [], textures: ['바둑판', '격자'] });
    const C = view();
    // 무늬를 풀지 못한 그림(그물 color로 칠함)과 같은지: 무늬 원본이 없는 같은 장면
    const sc = copyScene(keep);
    for (const t of sc.textures!) {
      delete t.data;
      delete t.bitmap;
    }
    C.v.setScene(sc);
    await until(() => C.v.stats.textures.failed === 2);
    expect(frame(A)).toEqual(frame(C));
    loseAndRestore(A);
    expect(n).toBe(2);
    expect(A.v.restoreNeed!.meshes.length).toBe(4);
  });

  it('나눠 올리는 동안 되찾아도: 차례가 오기 전에 준 배열은 그 차례에 함께 올린다', async () => {
    const sa = makeScene(), sb = copyScene(sa), keep = copyScene(sa);
    const A = view(), B = view();
    A.v.setScene(sa, { release: true, incremental: { budgetMs: 0 } });
    B.v.setScene(sb);
    await drain(A);
    await texturesReady(A, B);
    const of = (id: string): Mesh3d => keep.meshes.find((m) => m.id === id)!;
    A.v.onContextRestore((need) => {
      for (const m of need.meshes) expect(A.v.restoreMeshArrays(m.id, { normals: of(m.id).normals, uvs: of(m.id).uvs, backUvs: of(m.id).backUvs })).toBe(true);
      void A.v.restoreTexture('바둑판', keep.textures![0]!.data!);
      void A.v.restoreTexture('격자', fakeBitmap('격자', 16, 16) as unknown as ImageBitmap);
    });
    loseAndRestore(A);
    // 다시 올리는 중(아직 차례가 오지 않은 그물이 남음)
    expect((A.v as unknown as { renderer: { uploading: boolean } }).renderer.uploading).toBe(true);
    await drain(A);
    await texturesReady(A);
    expect(A.v.restoreNeed).toBeNull();
    expect(frame(A)).toEqual(frame(B));
  });
});

// ───────────── 놓은 그물 바꾸기 ─────────────
describe('0.25.0 놓은 그물의 setMesh', () => {
  it('색만 바꿔 다시 주면(배열 없이) 올려 둔 법선을 그대로 쓴다', async () => {
    const { A, B, sa, sb } = await pair();
    const pa = sa.meshes.find((m) => m.id === '구')!, pb = sb.meshes.find((m) => m.id === '구')!;
    A.v.setMesh({ ...pa, color: [0.2, 0.7, 0.3, 1] });
    B.v.setMesh({ ...pb, color: [0.2, 0.7, 0.3, 1] });
    expect(frame(A)).toEqual(frame(B));
    expect(recOf(A.v, '구').attrs.nrm).not.toBeNull();
  });

  it('vertices 구간은 놓은 법선에 올리지 않고 알린다(위치·색 구간은 올리고, 함께 쓰는 그물도 다시 만든다)', async () => {
    const { A, B, sa, sb } = await pair();
    const pa = sa.meshes.find((m) => m.id === '구')!, pb = sb.meshes.find((m) => m.id === '구')!;
    const nrm = recOf(A.v, '구').attrs.nrm!;
    const calls = nrm.subCalls + nrm.dataCalls;
    for (const p of [pa.positions, pb.positions]) for (let k = 0; k < 30; k++) p[k * 3 + 2]! += 3;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      A.v.setMesh(pa, { vertices: { start: 0, count: 30 } });
      B.v.setMesh(pb, { vertices: { start: 0, count: 30 } });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain('normals');
    } finally {
      warn.mockRestore();
    }
    expect(nrm.subCalls + nrm.dataCalls).toBe(calls);
    expect(recOf(A.v, '구').attrs.nrm).toBe(nrm);
    expect(recOf(A.v, '구 둘').attrs.nrm).toBe(nrm);
    expect(frame(A)).toEqual(frame(B));
  });

  it('놓은 그물에 법선을 새로 주면 통째로 올리고(vertices가 있어도) 다시 지운다', async () => {
    const { A, B, sa, sb } = await pair();
    const pa = sa.meshes.find((m) => m.id === '구')!, pb = sb.meshes.find((m) => m.id === '구')!;
    const n2 = pb.normals!.slice();
    for (let k = 0; k < 10; k++) n2[k * 3] = 0.5;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const na = { ...pa, normals: n2.slice() };
      A.v.setMesh(na, { vertices: { start: 0, count: 10 } });
      B.v.setMesh({ ...pb, normals: n2.slice() }, { vertices: { start: 0, count: 10 } });
      expect(warn).not.toHaveBeenCalled();
      expect(na.normals).toBeUndefined();
    } finally {
      warn.mockRestore();
    }
    expect(frame(A)).toEqual(frame(B));
  });

  it('빼면 그 그물만 쓰던 버퍼를 지운다(함께 쓰는 법선은 마지막 그물을 뺄 때) — 남는 버퍼가 놓지 않은 뷰어와 같은 수', async () => {
    const { A, B } = await pair();
    const live = (w: View): number => w.gl.liveBuffers;
    const a0 = live(A), b0 = live(B);
    const nrm = recOf(A.v, '구').attrs.nrm!;
    A.v.removeMesh('구');
    B.v.removeMesh('구');
    expect(nrm.deleted).toBe(false);
    expect(a0 - live(A)).toBe(b0 - live(B));
    A.v.removeMesh('구 둘');
    B.v.removeMesh('구 둘');
    expect(nrm.deleted).toBe(true);
    expect(a0 - live(A)).toBe(b0 - live(B));
    expect(frame(A)).toEqual(frame(B));
  });
});
