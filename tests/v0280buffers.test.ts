/**
 * 0.28.0 GPU 버퍼 성분별 바이트(Viewer3d.stats.buffers): 가짜 WebGL의 살아 있는 버퍼와 같은지(그리기 모드·구간·덧그림·놓기·작은 정수 배열·나눠 올리기·
 * 그물 바꾸기·빼기·문맥 복구·끝내기), 성분마다 장면 배열 바이트와 같은지
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type FakeGL, fnv } from './fakegl';
import { normalFormat } from '../src/attribs';
import { type GpuBufferStats, hasMeshEdges } from '../src/renderer';
import { boxMesh, syntheticScene } from '../src/synth';
import { uvComponents } from '../src/texture';
import { Viewer3d } from '../src/viewer';
import type { Mesh3d, Scene3d } from '../src/types';

let dom: ReturnType<typeof installDom>;
const g = globalThis as Record<string, unknown>;
let savedCib: unknown;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  savedCib = g.createImageBitmap;
  g.createImageBitmap = async (src: unknown, o?: ImageBitmapOptions): Promise<{ width: number; height: number; tag: string; close(): void }> => {
    const b = src instanceof Blob ? new Uint8Array(await src.arrayBuffer()) : new Uint8Array(0);
    return { width: o?.resizeWidth ?? 64, height: o?.resizeHeight ?? 64, tag: `bytes:${fnv(b)}`, close() {} };
  };
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  g.createImageBitmap = savedCib;
  dom.restore();
});

type BufView = { v: Viewer3d; gl: FakeGL; canvas: FakeElement };
function bview(renderMode: 'shaded' | 'wireframe' = 'shaded'): BufView {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode });
  views.push(v);
  const canvas = v.canvas as unknown as FakeElement;
  return { v, gl: canvas.gl!, canvas };
}
/** 가짜 GL의 살아 있는 버퍼 바이트·수(from번째 버퍼부터 — 문맥을 잃은 뒤에는 그 전 버퍼를 뺀다) */
const live = (gl: FakeGL, from = 0): { bytes: number; count: number } => {
  let bytes = 0, count = 0;
  for (const b of gl.buffers.slice(from))
    if (!b.deleted) {
      bytes += b.bytes.length;
      count++;
    }
  return { bytes, count };
};
const PARTS = ['positions', 'normals', 'colors', 'uvs', 'backUvs', 'indices', 'edges', 'lines', 'lineColors', 'points', 'wireframe', 'ranges', 'overlay'] as const;
type Part = (typeof PARTS)[number];
const SCENE_PARTS = PARTS.filter((p) => p !== 'wireframe' && p !== 'ranges' && p !== 'overlay');
/** 합이 성분의 합이고 가짜 GL과 같은지 */
function expectLive(w: BufView, from = 0): GpuBufferStats {
  const s = w.v.stats.buffers;
  expect(s.bytes).toBe(PARTS.reduce((n, p) => n + s[p], 0));
  expect({ bytes: s.bytes, count: s.count }).toEqual(live(w.gl, from));
  for (const p of PARTS) expect(s[p]).toBeGreaterThanOrEqual(0);
  return s;
}
/**
 * 장면이 올리는 배열의 성분별 바이트(렌더러와 같은 조건 — 그물 차례로 위치·법선·색·무늬 좌표·뒷면 무늬 좌표·색인·윤곽선, 선분, 점. 같은 배열은 처음 한 번)
 */
function sceneParts(s: Scene3d): Record<Part, number> {
  const out = Object.fromEntries(PARTS.map((p) => [p, 0])) as Record<Part, number>;
  const seen = new Set<object>();
  const add = (p: Part, a: ArrayBufferView | undefined | null | false): void => {
    if (!a || seen.has(a)) return;
    seen.add(a);
    out[p] += a.byteLength;
  };
  for (const m of s.meshes) {
    const nv = Math.floor(m.positions.length / 3);
    add('positions', m.positions);
    add('normals', !!m.normals && !!normalFormat(m.normals, nv) && m.normals);
    add('colors', !!m.colors && m.colors.length >= nv * 4 && m.colors);
    add('uvs', !!m.texture && !!uvComponents(m) && m.uvs);
    const b = m.backTexture ? (m.backUvs ?? m.uvs) : undefined;
    add('backUvs', !!b && !!uvComponents(m, b) && b);
    add('indices', m.indices);
    add('edges', hasMeshEdges(m) && m.edges);
  }
  for (const l of s.lines) {
    add('lines', l.positions);
    add('lineColors', !!l.colors && l.colors.length >= Math.floor(l.positions.length / 6) * 8 && l.colors);
  }
  for (const p of s.points ?? []) add('points', p.positions);
  return out;
}
/** 장면 성분만(코어가 만든 와이어프레임 색인·구간 모음·덧그림은 뺀다) */
const sceneOnly = (s: GpuBufferStats): Record<string, number> => Object.fromEntries(SCENE_PARTS.map((p) => [p, s[p]]));
const partsOf = (s: Scene3d): Record<string, number> => {
  const e = sceneParts(s);
  return Object.fromEntries(SCENE_PARTS.map((p) => [p, e[p]]));
};

/** 무늬·뒷면 무늬(따로 준 backUvs 하나, uvs를 함께 쓰는 것 하나)·배열을 함께 쓰는 그물(구 둘)이 있는 합성 장면 */
function texScene(compact = false): Scene3d {
  const s = syntheticScene({ segments: 300, sphereSeg: 20, textures: true, compact });
  const box = s.meshes.find((m) => m.id === '무늬 상자')!;
  box.backTexture = '바둑판';
  const quad = s.meshes.find((m) => m.id === '원근 무늬')!;
  quad.backTexture = '바둑판';
  quad.backUvs = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  const sphere = s.meshes.find((m) => m.id === '구')!;
  s.meshes.push({ ...sphere, id: '구 둘', name: '구 둘', matrix: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 90, 0, 1]) });
  return s;
}

describe('GPU 버퍼 성분별 바이트(0.28.0 Viewer3d.stats.buffers)', () => {
  it('장면 성분마다 올린 배열 바이트(함께 쓰는 배열은 한 번, 뒷면이 uvs를 함께 쓰면 uvs에만), 합·버퍼 수는 가짜 GL의 살아 있는 버퍼와 같다', () => {
    const w = bview();
    const sc = texScene();
    // 빈 뷰어: 덧그림(공용 사각형·잘린 면 다각형·격자)뿐
    const empty = expectLive(w);
    expect(Object.values(sceneOnly(empty)).every((n) => n === 0)).toBe(true);
    expect(empty.overlay).toBeGreaterThan(0);
    w.v.setScene(sc);
    w.v.renderNow();
    const s = expectLive(w);
    expect(sceneOnly(s)).toEqual(partsOf(sc));
    expect(s.normals).toBeGreaterThan(0);
    expect(s.uvs).toBeGreaterThan(0);
    // 따로 준 backUvs는 원근 무늬 판 하나(정점 넷 × 2값 × 4바이트) — 무늬 상자의 뒷면은 uvs를 함께 쓴다
    expect(s.backUvs).toBe(4 * 2 * 4);
    expect(s.lines).toBeGreaterThan(0);
    expect(s.lineColors).toBeGreaterThan(0);
    expect(s.points).toBeGreaterThan(0);
    expect(s.wireframe + s.ranges).toBe(0);
    // stats는 복사본
    s.positions = -1;
    expect(w.v.stats.buffers.positions).toBe(partsOf(sc).positions);
  });

  it('작은 정수 배열: 법선 Int8 4값은 정점마다 4바이트(Float32 12바이트), 무늬 좌표 Int16은 절반', () => {
    const a = bview(), b = bview();
    const sf = texScene(), sc = texScene(true);
    a.v.setScene(sf);
    b.v.setScene(sc);
    const fa = expectLive(a), fb = expectLive(b);
    expect(sceneOnly(fb)).toEqual(partsOf(sc));
    expect(fb.normals * 3).toBe(fa.normals);
    expect(fb.uvs * 2).toBe(fa.uvs);
    expect(fb.positions).toBe(fa.positions);
    expect(fb.indices).toBe(fa.indices);
  });

  it('놓기(release)는 GPU 버퍼를 지우지 않는다 — 성분별 바이트가 놓지 않은 장면과 같다', () => {
    const a = bview(), b = bview();
    a.v.setScene(texScene(), { release: true });
    b.v.setScene(texScene());
    expect(expectLive(a)).toEqual(expectLive(b));
  });

  it('와이어프레임 색인·구간 모음·강조 선분·단면 테두리·덧그림 선·표식도 가짜 GL과 같고, 지우면 줄어든다', () => {
    const w = bview('wireframe');
    const sc = texScene();
    w.v.setScene(sc);
    w.v.renderNow();
    const s = expectLive(w);
    expect(s.wireframe).toBeGreaterThan(0);
    const recs = (w.v as unknown as { renderer: { meshes: { wire: { idx: Uint32Array } | null }[] } }).renderer.meshes;
    expect(s.wireframe).toBe(recs.reduce((n, r) => n + (r.wire ? r.wire.idx.byteLength : 0), 0));
    // 구간 숨김(구간 25개 넘게 — 모은 자료): 그물과 선분 묶음
    w.v.setHiddenRanges('구', Array.from({ length: 30 }, (_, i) => ({ start: i * 4, count: 2 })));
    w.v.setHiddenRanges(sc.lines[0]!.id, Array.from({ length: 30 }, (_, i) => ({ start: i * 5, count: 2 })));
    w.v.renderNow();
    const r = expectLive(w);
    expect(r.ranges).toBeGreaterThan(0);
    // 강조 선분·단면·덧그림·표식
    w.v.setHighlightSegments(new Float32Array([0, 0, 0, 10, 10, 10, 5, 5, 5, 20, 0, 0]));
    w.v.setSection({ normal: [0, 0, 1], offset: 10 });
    w.v.setAnnotations([{ kind: 'distance', a: [0, 0, 0], b: [50, 0, 0] }]);
    w.v.setMarker([0, 0, 0], 'cone');
    w.v.renderNow();
    const o = expectLive(w);
    expect(o.overlay).toBeGreaterThan(r.overlay);
    w.v.clearHiddenRanges();
    w.v.setHighlightSegments(null);
    w.v.setSection(null);
    w.v.setAnnotations(null);
    w.v.setMarker(null);
    w.v.setRenderMode('shaded');
    w.v.renderNow();
    const z = expectLive(w);
    expect(z.ranges).toBe(0);
    expect(z.overlay).toBeLessThan(o.overlay);
    expect(sceneOnly(z)).toEqual(partsOf(sc));
  });

  it('나눠 올리기: 크기를 잡는 순간부터 그 성분으로 센다(채우는 중에도 가짜 GL과 같다), 다 올리면 장면 성분과 같다', () => {
    const w = bview();
    // 9.6 MB 위치 + 3.2 MB Int8 법선 — 조각 올리기(CHUNK_MIN_BYTES 8 MiB 넘음)
    const nv = 800_000;
    const positions = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) positions.set([(i % 1000) * 0.1, Math.floor(i / 1000) * 0.1, (i % 7) * 0.01], i * 3);
    const normals = new Int8Array(nv * 4);
    for (let i = 0; i < nv; i++) normals[i * 4 + 2] = 127;
    const big: Mesh3d = { id: '큰 판', positions, normals, color: [0.7, 0.7, 0.7, 1] };
    const sc: Scene3d = { name: 'b', units: 'mm', meshes: [boxMesh('상자', [0, 0, 0], [10, 10, 10], [0.5, 0.5, 0.5, 1]), big], lines: [], points: [] };
    // 시계를 부를 때마다 0.3 ms씩 가게 해 한 번의 uploadSome(1)이 기계 빠르기와 무관하게 두어 걸음만 한다(시간 예산 시험이 부하에 흔들리지 않게)
    let clock = 0;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 0.3));
    let calls = 0, sawPartial = false;
    try {
      w.v.setScene(sc, { incremental: true });
      const r = (w.v as unknown as { renderer: { uploadSome(ms: number): boolean; uploading: boolean } }).renderer;
      while (r.uploading && calls < 1000) {
        r.uploadSome(1);
        calls++;
        const s = expectLive(w);
        // 위치 버퍼는 잡는 순간(채우기 전)부터 그 크기로 센다
        if (r.uploading && s.positions >= positions.byteLength && s.normals === 0) sawPartial = true;
      }
      expect(r.uploading).toBe(false);
    } finally {
      spy.mockRestore();
    }
    expect(calls).toBeGreaterThan(2);
    expect(sawPartial).toBe(true);
    const s = expectLive(w);
    expect(sceneOnly(s)).toEqual(partsOf(sc));
    expect(s.normals).toBe(nv * 4);
  });

  it('그물 바꾸기·빼기: 같은 크기 새 배열(버퍼 물려받기)·정점 구간·다른 크기·빼기 뒤에도 가짜 GL과 같고, 함께 쓰는 배열은 남는다', () => {
    const w = bview();
    const sc = texScene();
    w.v.setScene(sc);
    const before = expectLive(w);
    const sphere = sc.meshes.find((m) => m.id === '구')!;
    const box = sc.meshes.find((m) => m.id === '무늬 상자')!;
    // 같은 크기 새 위치 배열(앞 버퍼를 물려받지 않는다 — 구 둘이 함께 쓴다) → 위치가 늘어난다
    const moved = { ...sphere, positions: sphere.positions.map((x) => x + 1) };
    w.v.setMesh(moved);
    const s1 = expectLive(w);
    expect(s1.positions).toBe(before.positions + sphere.positions.byteLength);
    // 무늬 상자의 같은 크기 새 위치(혼자 쓰므로 물려받는다 — 바이트 그대로), 정점 구간만
    const box2 = { ...box, positions: box.positions.map((x) => x * 1.01) };
    w.v.setMesh(box2, { vertices: { start: 0, count: 4 } });
    const s2 = expectLive(w);
    expect(s2.positions).toBe(s1.positions);
    // 다른 크기(원근 무늬 판을 색인 없는 삼각형 하나로)
    const quad = sc.meshes.find((m) => m.id === '원근 무늬')!;
    const tri: Mesh3d = { ...quad, positions: quad.positions.slice(0, 9), indices: undefined, uvs: quad.uvs!.slice(0, (quad.uvs!.length / 4) * 3), backUvs: quad.backUvs!.slice(0, 6) };
    w.v.setMesh(tri);
    const s3 = expectLive(w);
    const now: Scene3d = { ...sc, meshes: sc.meshes.map((m) => (m.id === '구' ? moved : m.id === '무늬 상자' ? box2 : m.id === '원근 무늬' ? tri : m)) };
    expect(sceneOnly(s3)).toEqual(partsOf(now));
    // 빼기: 구는 구 둘과 법선·색·색인을 함께 쓰므로 그것은 남고, 구만의 새 위치 배열은 지운다
    w.v.removeMesh('구');
    const s4 = expectLive(w);
    const after: Scene3d = { ...now, meshes: now.meshes.filter((m) => m.id !== '구') };
    expect(sceneOnly(s4)).toEqual(partsOf(after));
    expect(s4.normals).toBe(s3.normals);
    expect(s4.positions).toBe(s3.positions - moved.positions.byteLength);
  });

  it('문맥을 잃으면 0, 되찾으면 다시 올린 것만. 놓은 장면은 앱이 법선·무늬 좌표를 다시 줄 때까지 그 성분이 0이다. 끝내면 모두 지운다', () => {
    const w = bview();
    const sc = texScene();
    const keep = texScene();
    w.v.setScene(sc, { release: true });
    const full = expectLive(w);
    w.canvas.fire('webglcontextlost', {});
    expect(w.v.stats.buffers).toMatchObject({ bytes: 0, count: 0, positions: 0, overlay: 0 });
    const from = w.gl.buffers.length;
    w.canvas.fire('webglcontextrestored', {});
    w.v.renderNow();
    const s = expectLive(w, from);
    expect(s.normals).toBe(0);
    expect(s.uvs).toBe(0);
    expect(s.backUvs).toBe(0);
    expect(s.positions).toBe(full.positions);
    expect(s.indices).toBe(full.indices);
    expect(s.lines).toBe(full.lines);
    for (const m of keep.meshes) w.v.restoreMeshArrays(m.id, { normals: m.normals, uvs: m.uvs, backUvs: m.backUvs });
    expect(w.v.restoreNeed?.meshes ?? []).toEqual([]);
    const back = expectLive(w, from);
    expect(sceneOnly(back)).toEqual(sceneOnly(full));
    // 놓지 않은 장면: 되찾으면 장면 배열을 다시 올려 처음과 같다
    const u = bview();
    u.v.setScene(texScene());
    const first = expectLive(u);
    u.canvas.fire('webglcontextlost', {});
    const from2 = u.gl.buffers.length;
    u.canvas.fire('webglcontextrestored', {});
    u.v.renderNow();
    expect(sceneOnly(expectLive(u, from2))).toEqual(sceneOnly(first));
    // 끝내기: 모두 지운다(가짜 GL에도 남은 버퍼가 없다)
    const z = bview('wireframe');
    z.v.setScene(texScene());
    z.v.setHiddenRanges('구', Array.from({ length: 30 }, (_, i) => ({ start: i * 4, count: 2 })));
    z.v.setHighlightSegments(new Float32Array([0, 0, 0, 10, 10, 10]));
    z.v.setMarker([0, 0, 0], 'cone');
    z.v.renderNow();
    expect(expectLive(z).bytes).toBeGreaterThan(0);
    z.v.dispose();
    expect(z.v.stats.buffers).toMatchObject({ bytes: 0, count: 0 });
    expect(live(z.gl)).toEqual({ bytes: 0, count: 0 });
  });

  it('setScene으로 장면을 바꾸면 앞 장면 버퍼를 지우고 새 장면만 센다(표식·격자는 남는다)', () => {
    const w = bview();
    w.v.setMarker([0, 0, 0], 'cone');
    w.v.setScene(texScene());
    w.v.renderNow();
    const a = expectLive(w);
    const sc2 = syntheticScene({ segments: 50, sphereSeg: 8 });
    w.v.setScene(sc2);
    w.v.renderNow();
    const b = expectLive(w);
    expect(sceneOnly(b)).toEqual(partsOf(sc2));
    expect(b.overlay).toBeGreaterThan(0);
    expect(b.bytes).toBeLessThan(a.bytes);
  });
});
