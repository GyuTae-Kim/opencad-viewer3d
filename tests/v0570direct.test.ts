/**
 * 0.57.0 곧장 굽기(56차 남은 일): 묶일 그물은 그물마다 GL 버퍼·VAO를 만들지 않고 장면 배열에서 바로 묶음 버퍼로 굽는다(빛 기록 — MeshRec.light).
 *  - 조각을 받은 뒤 한 번에 올리기·나눠 올리기(훑기가 짧은 장면은 첫 걸음부터): 올리는 동안 GL 버퍼·VAO가 묶음 수만큼만 늘고 끝 그림이 끈 뷰어와 같다
 *  - 큰 장면(MERGE_SCAN_FIRST 초과)의 첫 단위는 첫 그림을 그물마다 그린다(훑기 전 — 묶일지 모른다), 그 뒤는 곧장 굽는다
 *  - 묶음에 못 든 빛 기록(정점 색 반투명·그물 하나뿐인 열쇠)은 그때 그물 버퍼를 만든다
 *  - 빛 기록은 한 동기 구간 안에서만 있다(걸음 사이·그리기가 보지 못한다) — 몫을 넘긴 나눠 올리기는 그물마다 길로 돌아가 묶음 나누기가 같다
 *  - 조각 올리기를 탈 큰 그물이 사이에 있어도 묶음 나누기·끝값이 한 번에 올린 뷰어와 같다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packNormals } from '../src/attribs';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { MERGE_SCAN_FIRST, MERGE_UPLOAD_MESHES } from '../src/mergeopts';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(async () => {
  dom = installDom();
  expect(await Viewer3d.preloadMerging()).toBe(true);
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

/** 서로 다른 부품(배열을 함께 쓰지 않는 상자 — 셋째마다 정점 색, 윤곽선 있음) */
const box = (i: number): Mesh3d => {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1]);
  m.origin = [(i % 60) * 10, Math.floor(i / 60) * 10, 0];
  if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.5));
  return m;
};
const boxes = (n: number, each?: (m: Mesh3d, i: number) => void): Scene3d => ({
  name: 'b',
  units: 'mm',
  meshes: Array.from({ length: n }, (_, i) => {
    const m = box(i);
    each?.(m, i);
    return m;
  }),
  lines: [],
});

type Rec = { light?: boolean; mg?: unknown; vao: unknown; src: Mesh3d };
type Rend = { uploadSome: (b: number) => boolean; uploading: boolean; meshes: Rec[]; mgLight: number };
type W = { v: Viewer3d; gl: FakeGL; r: Rend; peak: { buffers: number; vaos: number; reset: () => void } };

/** 살아 있는 GL 버퍼·VAO 수의 가장 큰 값(만들 때마다 — 한 호출 안에서 만들고 지운 것도) */
function make(merging: boolean | 'auto' = 'auto'): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  v.setRenderOptions({ merging });
  const gl = (v.canvas as unknown as FakeElement).gl!;
  v.fit(false);
  v.renderNow();
  let b = gl.liveBuffers, x = gl.vaos.filter((q) => !q.deleted).length;
  const peak = { buffers: 0, vaos: 0, reset: () => void ((peak.buffers = 0), (peak.vaos = 0)) };
  const b0 = b, x0 = x;
  const cb = gl.createBuffer.bind(gl), db = gl.deleteBuffer.bind(gl), cv = gl.createVertexArray.bind(gl), dv = gl.deleteVertexArray.bind(gl);
  gl.createBuffer = () => {
    peak.buffers = Math.max(peak.buffers, ++b - b0);
    return cb();
  };
  gl.deleteBuffer = (q) => {
    if (q && !q.deleted) b--;
    db(q);
  };
  gl.createVertexArray = () => {
    peak.vaos = Math.max(peak.vaos, ++x - x0);
    return cv();
  };
  gl.deleteVertexArray = (q) => {
    if (q && !q.deleted) x--;
    dv(q);
  };
  return { v, gl, r: (v as unknown as { renderer: Rend }).renderer, peak };
}
const liveVaos = (gl: FakeGL): number => gl.vaos.filter((q) => !q.deleted).length;
function bake(w: W): void {
  for (let i = 0; i < 2000 && w.r.uploading; i++) w.v.renderNow();
  for (let i = 0; i < 2000 && w.v.stats.merged.pending > 0; i++) w.v.renderNow();
  w.v.renderNow();
}
const shot = (w: W): string[] => expandFrame(w.gl, () => w.v.renderNow());
/** 그물마다 그린 뷰어(묶어 그리기 끔 — 끝 그림 기준)와 같은 장면·카메라로 견준다 */
function offShot(sc: () => Scene3d): string[] {
  const off = make(false);
  off.v.setScene(sc());
  off.v.fit(false);
  bake(off);
  return shot(off);
}

describe('0.57.0 곧장 굽기', () => {
  it('한 번에 올리기: 그물마다 버퍼·VAO를 만들지 않고(가장 큰 값 = 묶음 몫만) 끝이 끈 뷰어와 같은 그림', () => {
    const N = 3000;
    const w = make();
    w.peak.reset();
    w.v.setScene(boxes(N));
    expect(w.r.uploading).toBe(false);
    expect(w.r.mgLight).toBe(0);
    expect(w.r.meshes.some((r) => r.light)).toBe(false);
    expect(w.peak.buffers).toBeLessThan(32);
    expect(w.peak.vaos).toBeLessThan(16);
    w.v.fit(false);
    bake(w);
    expect(w.v.stats.merged.meshes).toBe(N);
    expect(shot(w)).toEqual(offShot(() => boxes(N)));
  });

  it('나눠 올리기(훑기가 짧은 장면 — 첫 걸음부터 곧장): 걸음 사이에도 가장 큰 값은 묶음 몫, 끝이 끈 뷰어와 같은 그림', () => {
    const N = MERGE_UPLOAD_MESHES * 2 + 200;
    const w = make();
    w.peak.reset();
    w.v.setScene(boxes(N), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    w.v.renderNow();
    expect(w.v.stats.merged.groups).toBeGreaterThan(0);
    bake(w);
    expect(w.peak.buffers).toBeLessThan(40);
    expect(w.peak.vaos).toBeLessThan(20);
    expect(w.v.stats.merged.meshes).toBe(N);
    expect(shot(w)).toEqual(offShot(() => boxes(N)));
  });

  it('큰 장면(그물 MERGE_SCAN_FIRST 초과)의 나눠 올리기: 첫 단위는 그물마다(첫 그림 — 훑기 전), 그 뒤는 곧장 구워 그물마다 버퍼가 쌓이지 않는다', () => {
    const N = MERGE_SCAN_FIRST + 100;
    const w = make();
    w.peak.reset();
    w.v.setScene(boxes(N), { incremental: { budgetMs: 600_000 } });
    w.r.uploadSome(600_000);
    expect(w.r.meshes.length).toBe(MERGE_UPLOAD_MESHES - 1);
    expect(w.r.meshes.every((r) => !r.light && !r.mg)).toBe(true);
    w.v.fit(false);
    bake(w);
    expect(w.v.stats.merged.meshes).toBe(N);
    expect(w.peak.buffers).toBeLessThan(MERGE_UPLOAD_MESHES * 5 + 40);
    expect(w.peak.vaos).toBeLessThan(MERGE_UPLOAD_MESHES * 3 + 20);
  });

  it('묶음에 못 든 빛 기록은 그때 그물 버퍼를 만든다(정점 색 반투명 — 어림 밖·그물 하나뿐인 열쇠) — 그물마다 그리고 그림이 끈 뷰어와 같다', () => {
    const N = 2600;
    const vary = (m: Mesh3d, i: number): void => {
      if (i === 40) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 0.4 : 0.5));
      if (i === 41) {
        // 이 그물만 법선이 있다(묶음 열쇠가 혼자 — 그물 하나뿐인 묶음은 굽지 않는다)
        const n = new Float32Array(m.positions.length);
        for (let k = 2; k < n.length; k += 3) n[k] = 1;
        m.normals = packNormals(n, 'int8');
      }
    };
    const w = make();
    w.peak.reset();
    w.v.setScene(boxes(N, vary));
    w.v.fit(false);
    bake(w);
    const a = w.r.meshes[40]!, b = w.r.meshes[41]!;
    for (const r of [a, b]) {
      expect(r.light).toBe(false);
      expect(r.mg ?? null).toBeNull();
      expect(w.gl.vaos.includes(r.vao as never)).toBe(true);
    }
    expect(w.v.stats.merged.meshes).toBe(N - 2);
    expect(w.peak.buffers).toBeLessThan(40);
    expect(shot(w)).toEqual(offShot(() => boxes(N, vary)));
  });

  it('빛 기록은 걸음 사이에 남지 않는다 — 묶지 않을 그물이 낀 장면을 몫 0으로 나눠 올려도 묶음 나누기·끝값이 같다', () => {
    const N = 3000;
    const vary = (m: Mesh3d, i: number): void => {
      if (i % 5 === 0) m.color = [m.color[0], m.color[1], m.color[2], 0.5];
    };
    const ref = make();
    ref.v.setScene(boxes(N, vary));
    ref.v.fit(false);
    bake(ref);
    const w = make();
    w.v.setScene(boxes(N, vary), { incremental: { budgetMs: 0 } });
    for (let i = 0; i < 40_000 && w.r.uploading; i++) {
      w.r.uploadSome(0);
      expect(w.r.mgLight).toBe(0);
      expect(w.r.meshes.some((r) => r.light)).toBe(false);
    }
    w.v.fit(false);
    bake(w);
    expect(w.v.stats.merged.meshes).toBe(ref.v.stats.merged.meshes);
    expect(w.v.stats.merged.groups).toBe(ref.v.stats.merged.groups);
    expect(w.v.stats.drawCalls).toBe(ref.v.stats.drawCalls);
    expect(w.gl.liveBuffers).toBe(ref.gl.liveBuffers);
    expect(liveVaos(w.gl)).toBe(liveVaos(ref.gl));
    expect(shot(w)).toEqual(shot(ref));
  });

  it('조각 올리기를 탈 큰 그물이 사이에 있어도(빛 기록은 그물 버퍼로 돌아가고 다음 걸음에 잇는다) 끝값·그림이 한 번에 올린 뷰어와 같다', () => {
    const N = 2400;
    // 색인 220만 개(8 MiB 넘음 — 삼각형은 넓이 0)
    const vary = (m: Mesh3d, i: number): void => {
      if (i === 700) m.indices = new Uint32Array(2_200_000);
    };
    const ref = make();
    ref.v.setScene(boxes(N, vary));
    ref.v.fit(false);
    bake(ref);
    const w = make();
    w.v.setScene(boxes(N, vary), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    bake(w);
    expect(w.r.mgLight).toBe(0);
    expect(w.v.stats.merged.meshes).toBe(ref.v.stats.merged.meshes);
    expect(w.v.stats.merged.groups).toBe(ref.v.stats.merged.groups);
    expect(w.v.stats.drawCalls).toBe(ref.v.stats.drawCalls);
    expect(w.gl.liveBuffers).toBe(ref.gl.liveBuffers);
    expect(shot(w)).toEqual(shot(ref));
  });
});
