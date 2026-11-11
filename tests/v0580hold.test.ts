/**
 * 0.58.0 빛 기록을 걸음 사이에 들고 있기(57차 남은 일): 나눠 올리기에서 묶지 않을 그물이 끼어도, 걸음 몫을 넘어도 묶일 그물이 그물 버퍼로 돌아가지 않는다.
 *  - 끼어든 그물이 있어도 걸음 안 버퍼 가장 큰 값이 끝값을 넘지 않고, 묶음 나누기·끝값·그림이 한 번에 올린 뷰어와 같다(장면 차례를 지킨다)
 *  - 들고 있는 동안 그리기·고르기가 보는 목록에 GL 객체 없는 기록이 없다
 *  - 걸음 사이에 앱이 그물을 바꾸거나 빼거나 묶어 그리기를 끄면 들고 있던 기록을 그물 버퍼로 돌린다(끝값·그림이 그 장면을 한 번에 올린 뷰어와 같다)
 *  - 굽기는 걸음 앞쪽에서 시작한다(몫을 절반 넘긴 뒤에 시작하지 않는다 — 시계는 시험이 돌린다)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { MERGE_UPLOAD_MESHES } from '../src/mergeopts';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(async () => {
  dom = installDom();
  expect(await Viewer3d.preloadMerging()).toBe(true);
});
afterEach(() => {
  vi.restoreAllMocks();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

const box = (i: number): Mesh3d => {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1]);
  m.origin = [(i % 60) * 10, Math.floor(i / 60) * 10, 0];
  if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.5));
  return m;
};
/** k번째마다 반투명(묶지 않을 그물) */
const scene = (n: number, k = 0, skip?: (i: number) => boolean, swap?: (m: Mesh3d, i: number) => Mesh3d): Scene3d => {
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < n; i++) {
    if (skip?.(i)) continue;
    let m = box(i);
    if (k && i % k === k - 1) m.color = [m.color[0], m.color[1], m.color[2], 0.5];
    if (swap) m = swap(m, i);
    meshes.push(m);
  }
  return { name: 'h', units: 'mm', meshes, lines: [] };
};

type Rec = { light?: boolean; src: Mesh3d };
type Rend = { uploadSome: (b: number) => boolean; uploading: boolean; meshes: Rec[]; mgLight: number; mgHold: Rec[]; mergeBake: (l: readonly unknown[]) => void };
type W = { v: Viewer3d; gl: FakeGL; r: Rend; peak: { buffers: number } };

function make(): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  v.fit(false);
  v.renderNow();
  let b = gl.liveBuffers;
  const b0 = b;
  const peak = { buffers: 0 };
  const cb = gl.createBuffer.bind(gl), db = gl.deleteBuffer.bind(gl);
  gl.createBuffer = () => {
    peak.buffers = Math.max(peak.buffers, ++b - b0);
    return cb();
  };
  gl.deleteBuffer = (q) => {
    if (q && !q.deleted) b--;
    db(q);
  };
  return { v, gl, r: (v as unknown as { renderer: Rend }).renderer, peak };
}
function bake(w: W): void {
  for (let i = 0; i < 60_000 && w.r.uploading; i++) w.v.renderNow();
  for (let i = 0; i < 2000 && w.v.stats.merged.pending > 0; i++) w.v.renderNow();
  w.v.renderNow();
}
const shot = (w: W): string[] => expandFrame(w.gl, () => w.v.renderNow());
const liveVaos = (gl: FakeGL): number => gl.vaos.filter((q) => !q.deleted).length;
/** 몫 0 — 한 걸음에 그물 하나씩(들고 있는 동안을 또렷이) */
function stepped(w: W, sc: Scene3d, upto: number): void {
  w.v.setScene(sc, { incremental: { budgetMs: 8 } });
  w.v.fit(false);
  while (w.r.mgHold.length + w.r.meshes.length < upto) w.r.uploadSome(0);
}
function expectSame(w: W, ref: W): void {
  expect(w.r.mgHold.length).toBe(0);
  expect(w.r.mgLight).toBe(0);
  expect(w.r.meshes.some((r) => r.light)).toBe(false);
  expect(w.v.stats.merged.meshes).toBe(ref.v.stats.merged.meshes);
  expect(w.v.stats.merged.groups).toBe(ref.v.stats.merged.groups);
  expect(w.v.stats.drawCalls).toBe(ref.v.stats.drawCalls);
  expect(w.gl.liveBuffers).toBe(ref.gl.liveBuffers);
  expect(liveVaos(w.gl)).toBe(liveVaos(ref.gl));
  expect(shot(w)).toEqual(shot(ref));
}
function whole(sc: Scene3d): W {
  const ref = make();
  ref.v.setScene(sc);
  ref.v.fit(false);
  bake(ref);
  return ref;
}

describe('0.58.0 빛 기록을 걸음 사이에 들고 있기', () => {
  it.each([500, 50, 5])('묶지 않을 그물이 %i번째마다 끼어도(몫 0) 버퍼 가장 큰 값은 끝값을 넘지 않고 끝이 한 번에 올린 뷰어와 같다', (k) => {
    const N = 3000;
    const ref = whole(scene(N, k));
    const w = make();
    const before = w.gl.liveBuffers;
    w.v.setScene(scene(N, k), { incremental: { budgetMs: 0 } });
    w.v.fit(false);
    for (let i = 0; i < 40_000 && w.r.uploading; i++) {
      w.r.uploadSome(0);
      expect(w.r.meshes.some((r) => r.light)).toBe(false);
    }
    bake(w);
    expect(w.peak.buffers).toBeLessThanOrEqual(w.gl.liveBuffers - before);
    expectSame(w, ref);
  });

  it('들고 있는 동안: 그리기 목록에 빛 기록이 없고 장면 차례를 지키며(끼어든 그물도 앞선 빛 기록을 기다린다) 올리는 중이다', () => {
    const w = make();
    stepped(w, scene(MERGE_UPLOAD_MESHES + 100, 25), 50);
    expect(w.r.uploading).toBe(true);
    expect(w.r.meshes.length).toBe(0);
    expect(w.r.mgHold.length).toBe(50);
    expect(w.r.mgHold[24]!.light).toBe(false);
    expect(w.r.mgLight).toBe(50 - 2);
    w.v.renderNow();
    bake(w);
    expect(w.r.meshes.map((r) => r.src.id)).toEqual(scene(MERGE_UPLOAD_MESHES + 100).meshes.map((m) => m.id));
  });

  it('들고 있는 그물을 setMesh로 바꾸면 곧 그물 버퍼로 돌리고 바꾼 그물로 — 끝이 그 장면을 올린 뷰어와 같은 그림', () => {
    const N = MERGE_UPLOAD_MESHES + 100;
    const changed = (): Mesh3d => {
      const m = box(10);
      m.color = [1, 0, 0, 1];
      return m;
    };
    const sc = scene(N);
    const w = make();
    stepped(w, sc, 40);
    expect(w.r.mgHold.length).toBe(40);
    const next = { ...sc, meshes: sc.meshes.map((m, i) => (i === 10 ? changed() : m)) };
    w.v.setMesh(next.meshes[10]!);
    expect(w.r.mgHold.length).toBe(0);
    expect(w.r.mgLight).toBe(0);
    expect(w.r.meshes.length).toBe(40);
    expect(w.r.meshes[10]!.src).toBe(next.meshes[10]);
    bake(w);
    expect(w.r.meshes.map((r) => r.src.id)).toEqual(sc.meshes.map((m) => m.id));
    const ref = whole(scene(N, 0, undefined, (m, i) => (i === 10 ? changed() : m)));
    // 바꾼 그물은 다음 다시 굽기까지 그물마다일 수 있어 묶음 수 대신 그림만 견준다(0.53.0과 같은 길)
    expect(shot(w)).toEqual(shot(ref));
  });

  it('아직 올리지 않은 그물을 바꾸면 들고 있는 기록을 건드리지 않는다', () => {
    const sc = scene(MERGE_UPLOAD_MESHES + 100);
    const w = make();
    stepped(w, sc, 40);
    const m = box(500);
    m.color = [0, 1, 0, 1];
    w.v.setMesh(m);
    expect(w.r.mgHold.length).toBe(40);
    expect(w.r.mgLight).toBe(40);
    bake(w);
    expect(w.r.meshes[500]!.src).toBe(m);
  });

  it('들고 있는 그물을 빼면 그 그물만 빠지고 끝이 그 장면을 올린 뷰어와 같은 그림', () => {
    const N = MERGE_UPLOAD_MESHES + 100;
    const w = make();
    stepped(w, scene(N), 40);
    w.v.removeMesh('b10');
    expect(w.r.mgHold.length).toBe(0);
    expect(w.r.meshes.length).toBe(39);
    bake(w);
    expect(w.r.meshes.some((r) => r.src.id === 'b10')).toBe(false);
    expect(w.r.meshes.length).toBe(N - 1);
    expect(shot(w)).toEqual(shot(whole(scene(N, 0, (i) => i === 10))));
  });

  it('묶어 그리기를 끄면 들고 있던 기록을 그물 버퍼로 돌려 그린다(끈 뷰어와 같은 그림)', () => {
    const N = MERGE_UPLOAD_MESHES + 100;
    const w = make();
    stepped(w, scene(N), 40);
    w.v.setRenderOptions({ merging: false });
    expect(w.r.mgHold.length).toBe(0);
    expect(w.r.meshes.length).toBe(40);
    bake(w);
    expect(w.v.stats.merged.groups).toBe(0);
    const off = make();
    off.v.setRenderOptions({ merging: false });
    off.v.setScene(scene(N));
    off.v.fit(false);
    bake(off);
    expect(shot(w)).toEqual(shot(off));
  });

  it('들고 있는 동안 장면을 바꾸거나 없애면 기록이 남지 않는다', () => {
    const w = make();
    stepped(w, scene(MERGE_UPLOAD_MESHES + 100), 40);
    expect(w.r.mgHold.length).toBe(40);
    w.v.setScene(scene(10));
    expect(w.r.mgHold.length).toBe(0);
    expect(w.r.mgLight).toBe(0);
    expect(w.r.meshes.length).toBe(10);
  });

  it('다 올리라는 걸음(그림 저장 — 몫 Infinity)이 들고 있던 기록까지 모두 그린다', () => {
    const N = MERGE_UPLOAD_MESHES + 100;
    const w = make();
    stepped(w, scene(N, 25), 40);
    expect(w.r.mgHold.length).toBe(40);
    expect(w.r.uploadSome(Infinity)).toBe(true);
    expect(w.r.mgHold.length).toBe(0);
    expect(w.r.meshes.length).toBe(N);
    expect(w.r.meshes.some((r) => r.light)).toBe(false);
  });

  it('굽기는 걸음 앞쪽에서만 시작한다: 다음 그물이 굽기를 부르고 몫을 절반 넘겼으면 다음 걸음 처음으로 미룬다(시계는 시험이 돌린다)', () => {
    const N = MERGE_UPLOAD_MESHES + 10;
    const w = make();
    w.v.setScene(scene(N), { incremental: { budgetMs: 8 } });
    w.v.fit(false);
    let t = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => t);
    const start: number[] = [];
    const bakeReal = w.r.mergeBake;
    w.r.mergeBake = function (this: unknown, l: readonly unknown[]) {
      start.push(t);
      return bakeReal.call(this, l);
    };
    // 단위 앞까지 시계가 멈춘 채 한 걸음에 올린다(몫을 넘지 않는다) — 그다음 그물을 올리려 할 때 몫의 절반을 넘긴 시계
    const realRun = w.r.uploadSome;
    t = 0;
    const r0 = w.r as unknown as { sceneMeshRec: (m: Mesh3d, o: object) => Rec };
    const rec0 = r0.sceneMeshRec;
    let made = 0;
    r0.sceneMeshRec = function (this: unknown, m: Mesh3d, o: object) {
      if (++made === MERGE_UPLOAD_MESHES - 1) t = 5;
      return rec0.call(this, m, o);
    };
    realRun.call(w.r, 8);
    expect(w.r.mgHold.length).toBe(MERGE_UPLOAD_MESHES - 1);
    expect(start).toEqual([]);
    expect(w.r.uploading).toBe(true);
    // 다음 걸음은 새 몫의 맨 앞에서 굽는다
    t = 100;
    realRun.call(w.r, 8);
    expect(start.length).toBeGreaterThan(0);
    expect(start.every((x) => x === 100)).toBe(true);
    expect(w.r.meshes.length).toBeGreaterThanOrEqual(MERGE_UPLOAD_MESHES);
  });
});
