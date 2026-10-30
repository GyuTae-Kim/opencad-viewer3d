/**
 * 0.11.0 그물 하나 넣기·바꾸기·빼기(Viewer3d.setMesh·removeMesh).
 * 가짜 DOM·가짜 WebGL2로 뷰어 둘을 만들어, 그물을 setMesh로 바꾼 뷰어(A)와 처음부터 바뀐 장면을 setScene으로 준 뷰어(B)가
 * 그리기(그리기 호출마다 버퍼 내용 해시·균일 변수)·고르기·측정 붙잡기·측정 미리 보기·장면 범위·보이기에서 같은지 값으로 견주고,
 * 바꾸는 동안 다른 묶음의 GPU 버퍼에 아무 호출도 없었는지 가짜 GL 호출 수로 확인한다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type DrawEntry, type FakeBuffer, type FakeGL, fnv } from './fakegl';
import { Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, PointSet3d, Scene3d } from '../src/types';
import type { CameraState } from '../src/camera';
import { type GridSpec, cutBy, fillGrid, gridIndices, gridMesh, gridX, gridY } from '../scripts/pixels/grid';

let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  // BVH를 쉬는 틈에 만드는 타이머만 멈춘다(performance.now는 그대로 — 나눠 올리기 몫을 잰다)
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

// ───────────── 장면 ─────────────
const G: GridSpec = { n: 33, size: 64, x0: 40, y0: -20, origin: [72, 12, 0] };
const flat = (): number => 0;
const PATH: [number, number][] = [
  [50, -10],
  [90, 30],
  [60, 30],
];
const cut1 = cutBy(flat, PATH, 6, -4, 2.4);
const cut2 = cutBy(cut1, [
  [44, 40],
  [100, 0],
], 5, -3, 1.8);

function toolPath(): LineSet3d {
  const n = 400;
  const positions = new Float32Array(n * 6);
  const colors = new Float32Array(n * 8);
  const segmentIds = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const a = i * 0.05, b = (i + 1) * 0.05;
    positions.set([20 * Math.cos(a) + 15, 20 * Math.sin(a) + 15, 25 + i * 0.02, 20 * Math.cos(b) + 15, 20 * Math.sin(b) + 15, 25 + (i + 1) * 0.02], i * 6);
    colors.set([0.9, 0.5, 0.1, 1, 0.9, 0.5, 0.1, 1], i * 8);
    segmentIds[i] = i + 1;
  }
  return { id: 'path', positions, colors, segmentIds, group: '공구 경로' };
}

function points(): PointSet3d {
  return { id: 'pts', positions: new Float32Array([5, 5, 30, 25, 25, 30, 100, 40, 2]), size: 6 };
}

const box = boxMesh('box', [0, 0, 0], [30, 30, 20], [0.8, 0.5, 0.3, 1], '부품');
const plate = boxMesh('plate', [-20, -30, -8], [120, 60, -6], [0.5, 0.6, 0.7, 1]);
const path = toolPath();
const pts = points();

function scene(meshes: Mesh3d[]): Scene3d {
  return { name: 't', units: 'mm', meshes, lines: [path], points: [pts] };
}

/** 배열을 새로 복사한 같은 그물(B 뷰어용 — 같은 배열 객체를 쓰지 않게) */
function copyMesh(m: Mesh3d): Mesh3d {
  return { ...m, positions: m.positions.slice(), colors: m.colors?.slice(), normals: m.normals?.slice(), indices: m.indices?.slice() };
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
 * 그리기 한 번의 기록. 단면 테두리 선분은 BVH가 있을 때와 없을 때 모으는 차례만 다르고(한 색 실선이라 그림은 같다)
 * 고르기가 BVH를 만든 때에 따라 달라지므로, 그 버퍼 해시는 선분을 정렬한 해시로 바꿔 견준다
 */
function frame({ v, gl }: View): DrawEntry[] {
  gl.draws = [];
  gl.logDraws = true;
  v.renderNow();
  gl.logDraws = false;
  const cut = (v as unknown as { renderer: { cutSeg: { pos: FakeBuffer } | null } }).renderer.cutSeg?.pos;
  if (!cut) return gl.draws;
  const raw = `${cut.bytes.length}:${fnv(cut.bytes)}`;
  const segs: string[] = [];
  for (let o = 0; o < cut.bytes.length; o += 24) segs.push(Array.from(cut.bytes.subarray(o, o + 24)).join(','));
  const canon = `cut:${segs.length}:${fnv(new TextEncoder().encode(segs.sort().join(';')))}`;
  return gl.draws.map((d) => ({ ...d, attribs: d.attribs.map((a) => a.replace(raw, canon)) }));
}

const ptr = (c: FakeElement, type: string, x: number, y: number, buttons: number): void =>
  c.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const click = (w: View, x: number, y: number): void => {
  ptr(w.canvas, 'pointerdown', x, y, 1);
  ptr(w.canvas, 'pointerup', x, y, 0);
};
const hover = (w: View, x: number, y: number): void => ptr(w.canvas, 'pointermove', x, y, 0);

const r9 = (x: number): number => +x.toPrecision(9);
const r9s = (p: ArrayLike<number> | undefined | null): number[] | null => (p ? Array.from(p, r9) : null);

/** 화면 격자에서 고르기(종류·id·번호·점) */
function picks(v: Viewer3d): unknown[] {
  const out: unknown[] = [];
  for (const pointerType of ['mouse', 'touch'])
    for (let j = 0; j < 9; j++)
      for (let i = 0; i < 12; i++) {
        const p = v.pick(((i + 0.5) * 800) / 12, ((j + 0.5) * 600) / 9, { pointerType, edges: i % 2 === 0 });
        out.push(p ? [p.kind, p.id, p.index, r9s(p.point), r9s(p.normal)] : null);
      }
  return out;
}

/** 측정·보기 상태 값 */
function state(v: Viewer3d): unknown {
  return {
    cam: v.getCamera(),
    z: v.sectionRange('z'),
    x: v.sectionRange('x'),
    section: v.section,
    groups: v.groups(),
    vis: ['box', 'grid', 'plate', 'path', 'pts', 'new'].map((id) => v.isVisible(id)),
    looks: ['box', 'grid', 'plate'].map((id) => v.itemLook(id)),
    stats: { ...v.stats, frameMs: 0 },
    snap: v.measureHoverSnap,
    measure: v.measurement(),
  };
}

/** 두 뷰어에 같은 보기 상태(숨김·강조·겉모습·단면·조명·외곽선) */
function applyState(v: Viewer3d): void {
  v.setRenderMode('shadedEdges');
  v.setItemVisible('pts', false);
  v.highlight(['box']);
  v.setItemColor('plate', '#3366aa');
  v.setItemEdgeColor('box', '#00ff00');
  v.setSection({ normal: [0, 1, 0], offset: 25 });
  v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true });
  v.setRenderOptions({ profiles: { width: 2 } });
  v.setMeasureMode(true);
}

/** 세계 점의 화면 자리 */
function at(v: Viewer3d, p: readonly number[]): { x: number; y: number } {
  const s = v.project(p)!;
  return { x: s.x, y: s.y };
}

/** 격자 마디 (i, j)의 세계 좌표 */
const node = (m: Mesh3d, i: number, j: number): number[] => {
  const k = (j * G.n + i) * 3;
  return [m.positions[k]! + G.origin![0], m.positions[k + 1]! + G.origin![1], m.positions[k + 2]! + G.origin![2]];
};

/** 버퍼마다 호출 수 */
const snapshot = (gl: FakeGL): Map<FakeBuffer, string> => new Map(gl.buffers.map((b) => [b, `${b.dataCalls}/${b.subCalls}/${b.deleted}`]));
/** 전부터 있던 버퍼 가운데 호출이 있었던 것(새로 만든 버퍼는 빼고) */
const changed = (gl: FakeGL, before: Map<FakeBuffer, string>): FakeBuffer[] => gl.buffers.filter((b) => before.has(b) && before.get(b) !== `${b.dataCalls}/${b.subCalls}/${b.deleted}`);
/** 렌더러가 그 배열에 쓰는 GPU 버퍼(0.25.0부터 버퍼 표는 배열과 무관한 열쇠 — 배열 → 열쇠는 약한 표) */
const bufOf = (v: Viewer3d, a: ArrayBufferView): FakeBuffer | undefined => {
  const r = (v as unknown as { renderer: { keys: WeakMap<object, object>; arrayBufs: Map<unknown, FakeBuffer>; elemBufs: Map<unknown, FakeBuffer> } }).renderer;
  const k = r.keys.get(a);
  return k === undefined ? undefined : (r.arrayBufs.get(k) ?? r.elemBufs.get(k));
};
const meshRecs = (v: Viewer3d): { src: Mesh3d; wire: unknown }[] => (v as unknown as { renderer: { meshes: { src: Mesh3d; wire: unknown }[] } }).renderer.meshes;
const bytesOf = (a: ArrayBufferView): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/**
 * A: setScene(before) → 상태 → 첫 점·미리 보기 → edit(A) / B: setScene(after) → 같은 카메라·상태. 두 뷰어의 그리기·값을 견준다
 */
function compare(before: Scene3d, after: Scene3d, edit: (a: View) => void, o: { vertex?: number[] } = {}): { A: View; B: View } {
  const A = view();
  A.v.setScene(before);
  applyState(A.v);
  A.v.renderNow();
  const first = at(A.v, [30, 0, 20]);
  click(A, first.x, first.y);
  const hv = at(A.v, o.vertex ?? [70, 10, 0]);
  hover(A, hv.x, hv.y);
  A.v.renderNow();
  const cam: CameraState = A.v.getCamera();
  edit(A);
  expect(A.v.getCamera()).toEqual(cam);
  expect(A.v.measurePointCount).toBe(1);
  const da = frame(A);

  const B = view();
  B.v.setScene(after);
  B.v.setCamera(cam);
  applyState(B.v);
  click(B, first.x, first.y);
  hover(B, hv.x, hv.y);
  const db = frame(B);
  expect(da.length).toBeGreaterThan(10);
  expect(da).toEqual(db);
  // 측정 미리 보기: A는 바꾸기 전 커서 자리에서 바뀐 그물로 다시 구했다
  expect(A.v.measureHoverSnap).toEqual(B.v.measureHoverSnap);
  expect(state(A.v)).toEqual(state(B.v));
  expect(picks(A.v)).toEqual(picks(B.v));
  // 두 점째: 바꾼 그물의 꼭짓점
  const got: unknown[] = [];
  A.v.onMeasure((m) => got.push(m));
  B.v.onMeasure((m) => got.push(m));
  click(A, hv.x, hv.y);
  click(B, hv.x, hv.y);
  expect(got).toHaveLength(2);
  expect(got[0]).toEqual(got[1]);
  if (o.vertex) {
    const m = got[0] as { b: number[] };
    expect(m.b.map((x) => +x.toFixed(4))).toEqual(o.vertex.map((x) => +x.toFixed(4)));
  }
  expect(state(A.v)).toEqual(state(B.v));
  return { A, B };
}

describe('setMesh: 그물 하나 바꾸기', () => {
  it('새 배열로 바꾼 그물: 그리기·고르기·측정·범위·상태가 setScene으로 다시 준 것과 같고, 다른 묶음 버퍼에는 호출이 없다', () => {
    const g0 = gridMesh('grid', G, flat);
    const g1 = gridMesh('grid', G, cut1, { indices: g0.indices });
    const v15 = node(g1, 15, 15);
    expect(v15[2]).toBeCloseTo(-4, 5);
    let calls: FakeBuffer[] = [];
    const { A } = compare(
      scene([box, g0, plate]),
      scene([box, copyMesh(g1), plate]),
      (a) => {
        const before = snapshot(a.gl);
        const old = { pos: bufOf(a.v, g0.positions)!, col: bufOf(a.v, g0.colors!)!, nrm: bufOf(a.v, g0.normals!)!, idx: bufOf(a.v, g0.indices!)! };
        const n = a.gl.buffers.length;
        expect(a.v.setMesh(g1)).toBe(true);
        calls = changed(a.gl, before);
        // 같은 크기 새 배열은 앞 버퍼에 bufferSubData(새 버퍼·bufferData·지우기 없음), 색인은 같은 배열이라 손대지 않는다
        expect(a.gl.buffers.length).toBe(n);
        expect(new Set(calls)).toEqual(new Set([old.pos, old.col, old.nrm]));
        for (const b of calls) expect(before.get(b)!.split('/')[0]).toBe(String(b.dataCalls));
        expect(bufOf(a.v, g1.positions)).toBe(old.pos);
        expect(bufOf(a.v, g1.indices!)).toBe(old.idx);
        expect(old.pos.bytes).toEqual(bytesOf(g1.positions));
        expect(old.col.bytes).toEqual(bytesOf(g1.colors!));
        expect(bufOf(a.v, g0.positions)).toBeUndefined();
      },
      { vertex: v15 },
    );
    expect(calls).toHaveLength(3);
    // 앱이 준 장면 객체는 그대로, viewer.scene은 바꾼 새 장면
    expect(A.v.scene!.meshes.map((m) => m.id)).toEqual(['box', 'grid', 'plate']);
    expect(A.v.scene!.meshes[1]).toBe(g1);
  });

  it('크기가 다른 새 배열: 새 버퍼로 올리고 앞 버퍼는 지운다(색인도 새 배열)', () => {
    const g0 = gridMesh('grid', G, flat);
    const G2: GridSpec = { ...G, n: 41 };
    const g1 = gridMesh('grid', G2, cut1);
    compare(scene([box, g0, plate]), scene([box, copyMesh(g1), plate]), (a) => {
      const before = snapshot(a.gl);
      const old = [g0.positions, g0.colors!, g0.normals!, g0.indices!].map((x) => bufOf(a.v, x)!);
      const others = [box.positions, box.indices!, box.edges!, plate.positions, path.positions, path.colors!, pts.positions].map((x) => bufOf(a.v, x)!);
      a.v.setMesh(g1);
      for (const b of old) expect(b.deleted).toBe(true);
      const fresh = [g1.positions, g1.colors!, g1.normals!, g1.indices!].map((x) => bufOf(a.v, x)!);
      for (const b of fresh) expect(before.has(b)).toBe(false);
      for (const b of others) expect(changed(a.gl, before)).not.toContain(b);
    });
  });

  it('제자리에서 고친 배열 + vertices: 바뀐 정점 구간만 bufferSubData로 올리고, 범위·BVH도 새로 센다', () => {
    const g0 = gridMesh('grid', G, flat);
    const ref = gridMesh('grid', G, flat);
    const rows: [number, number] = [8, 14];
    const r = fillGrid(ref, G, cut1, rows[0], rows[1]);
    const v10 = node(ref, 20, 12);
    compare(
      scene([box, g0, plate]),
      scene([box, copyMesh(ref), plate]),
      (a) => {
        // 고르기로 BVH·범위를 먼저 만들어 둔다(옛 캐시가 남으면 값이 달라진다)
        a.v.pick(400, 300);
        const before = snapshot(a.gl);
        const bufs = { pos: bufOf(a.v, g0.positions)!, col: bufOf(a.v, g0.colors!)!, nrm: bufOf(a.v, g0.normals!)! };
        const pre = { ...bufs.pos };
        const rr = fillGrid(g0, G, cut1, rows[0], rows[1]);
        expect(rr).toEqual(r);
        expect(a.v.setMesh(g0, { vertices: rr })).toBe(true);
        expect(new Set(changed(a.gl, before))).toEqual(new Set([bufs.pos, bufs.col, bufs.nrm]));
        expect(bufs.pos.dataCalls).toBe(pre.dataCalls);
        expect(bufs.pos.subCalls).toBe(pre.subCalls + 1);
        expect(bufs.pos.uploaded - pre.uploaded).toBe(rr.count * 12);
        expect(bufs.pos.bytes).toEqual(bytesOf(g0.positions));
        expect(bufs.col.bytes).toEqual(bytesOf(g0.colors!));
        expect(bufs.nrm.bytes).toEqual(bytesOf(g0.normals!));
      },
      { vertex: v10 },
    );
  });

  it('새 배열 + vertices: 물려받은 버퍼에 그 구간만 올린다', () => {
    const g0 = gridMesh('grid', G, flat);
    const g1 = { ...g0, positions: g0.positions.slice(), colors: g0.colors!.slice(), normals: g0.normals!.slice() };
    const rr = fillGrid(g1, G, cut1, 10, 13);
    compare(scene([box, g0, plate]), scene([box, copyMesh(g1), plate]), (a) => {
      const pos = bufOf(a.v, g0.positions)!;
      const u0 = pos.uploaded;
      a.v.setMesh(g1, { vertices: [rr] });
      expect(bufOf(a.v, g1.positions)).toBe(pos);
      expect(pos.uploaded - u0).toBe(rr.count * 12);
      expect(pos.bytes).toEqual(bytesOf(g1.positions));
    });
  });

  it('와이어프레임 삼각형 변 색인은 색인이 같으면 넘겨 쓴다', () => {
    const g0 = gridMesh('grid', G, flat, { normals: false });
    const g1 = gridMesh('grid', G, cut2, { normals: false, indices: g0.indices });
    const A = view();
    A.v.setScene(scene([box, g0, plate]));
    A.v.setRenderMode('wireframe');
    A.v.renderNow();
    const w = meshRecs(A.v)[1]!.wire;
    expect(w).toBeTruthy();
    const n = A.gl.buffers.length;
    A.v.setMesh(g1);
    const da = frame(A);
    expect(meshRecs(A.v)[1]!.wire).toBe(w);
    expect(A.gl.buffers.length).toBe(n);
    const B = view();
    B.v.setScene(scene([box, copyMesh(g1), plate]));
    B.v.setCamera(A.v.getCamera());
    B.v.setRenderMode('wireframe');
    expect(da).toEqual(frame(B));
  });
});

describe('setMesh·removeMesh: 넣기·빼기', () => {
  it('새 id는 장면 그물 끝에 더한다(setScene 차례와 같다)', () => {
    const g0 = gridMesh('new', G, cut1);
    compare(scene([box, plate]), scene([box, plate, copyMesh(g0)]), (a) => {
      const before = snapshot(a.gl);
      const others = [box.positions, box.indices!, box.edges!, plate.positions, plate.indices!, path.positions, path.colors!, pts.positions].map((x) => bufOf(a.v, x)!);
      expect(a.v.setMesh(g0)).toBe(true);
      // 새 그물 배열만 새 버퍼로(다른 묶음 버퍼에는 호출이 없다)
      for (const b of others) expect(changed(a.gl, before)).not.toContain(b);
      for (const x of [g0.positions, g0.colors!, g0.normals!, g0.indices!]) expect(before.has(bufOf(a.v, x)!)).toBe(false);
      expect(a.v.scene!.meshes.map((m) => m.id)).toEqual(['box', 'plate', 'new']);
    }, { vertex: node(g0, 15, 15) });
  });

  it('빼면 그 그물만 쓰던 버퍼를 지우고 장면 범위가 줄어든다', () => {
    const g0 = gridMesh('grid', G, cut1);
    const big = boxMesh('far', [300, 300, 0], [320, 320, 10], [1, 1, 1, 1]);
    compare(scene([box, g0, plate, big]), scene([box, g0, plate]), (a) => {
      const zr = a.v.sectionRange('x');
      const before = snapshot(a.gl);
      const mine = [big.positions, big.indices!, big.edges!].map((x) => bufOf(a.v, x)!);
      const others = [box.positions, box.indices!, box.edges!, g0.positions, g0.colors!, g0.normals!, g0.indices!, plate.positions, path.positions, path.colors!, pts.positions].map((x) => bufOf(a.v, x)!);
      expect(a.v.removeMesh('far')).toBe(true);
      expect(a.v.removeMesh('far')).toBe(false);
      // 장면 범위가 줄어 바닥 격자 선은 다시 만든다 — 묶음 버퍼 가운데는 뺀 그물 것만 지운다
      const ch = changed(a.gl, before);
      for (const b of others) expect(ch).not.toContain(b);
      for (const b of mine) expect(b.deleted).toBe(true);
      expect(a.v.sectionRange('x').max).toBeLessThan(zr.max);
    });
  });

  it('같은 크기 조각이 함께 쓰는 색인 버퍼는 마지막 조각을 뺄 때만 지운다', () => {
    const idx = gridIndices(G.n);
    const t1 = gridMesh('t1', G, flat, { indices: idx });
    const t2 = gridMesh('t2', { ...G, x0: G.x0 + 64, origin: [136, 12, 0] }, flat, { indices: idx });
    const A = view();
    A.v.setScene(scene([box, t1, t2]));
    A.v.renderNow();
    const ib = bufOf(A.v, idx)!;
    const n0 = ib.dataCalls + ib.subCalls;
    const t1b = gridMesh('t1', G, cut1, { indices: idx });
    A.v.setMesh(t1b);
    expect(ib.dataCalls + ib.subCalls).toBe(n0);
    expect(A.v.removeMesh('t1')).toBe(true);
    expect(ib.deleted).toBe(false);
    A.v.renderNow();
    expect(A.v.removeMesh('t2')).toBe(true);
    expect(ib.deleted).toBe(true);
    A.v.renderNow();
  });

  it('선분·점 id·장면 없음은 false, 잇달아 바꿔도 GPU 버퍼가 새지 않는다', () => {
    const A = view();
    expect(A.v.setMesh(box)).toBe(false);
    A.v.setScene(scene([box, plate]));
    expect(A.v.setMesh({ ...box, id: 'path' })).toBe(false);
    expect(A.v.removeMesh('path')).toBe(false);
    let g = gridMesh('grid', G, flat);
    for (let k = 0; k < 12; k++) {
      const n = k % 3 ? 33 : 21 + k;
      g = gridMesh('grid', { ...G, n }, k % 2 ? cut1 : cut2, k % 4 === 1 && n === G.n && g.positions.length === n * n * 3 ? { indices: g.indices } : {});
      A.v.setMesh(g);
      A.v.renderNow();
    }
    const B = view();
    B.v.setScene(scene([box, plate, copyMesh(g)]));
    B.v.setCamera(A.v.getCamera());
    B.v.renderNow();
    expect(A.gl.liveBuffers).toBe(B.gl.liveBuffers);
    expect(frame(A)).toEqual(frame(B));
  });
});

describe('setMesh와 나눠 올리기', () => {
  it('incremental: 큰 그물은 조각으로 새 버퍼에 채우는 동안 앞 그물을 그리고, 다 채우면 바꾼다', () => {
    const GB: GridSpec = { n: 520, size: 120, x0: -10, y0: -40, origin: [50, 20, 0] };
    const b0 = gridMesh('grid', GB, flat);
    const b1 = gridMesh('grid', GB, cut1, { indices: b0.indices });
    const A = view();
    A.v.setScene(scene([box, b0, plate]));
    A.v.renderNow();
    const old = bufOf(A.v, b0.positions)!;
    const others = [box.positions, plate.positions, path.positions, path.colors!, b0.indices!].map((x) => bufOf(A.v, x)!);
    const before = snapshot(A.gl);
    expect(A.v.setMesh(b1, { incremental: { budgetMs: 1 } })).toBe(true);
    const r = (A.v as unknown as { renderer: { uploadSome(ms: number): boolean } }).renderer;
    // 조각 하나씩(uploadSome(0)은 한 걸음 — 배열 셋 10.8 MB: 버퍼 잡기 셋 + 4 MB 조각 넷): 다 채울 때까지 앞 그물 기록(앞 버퍼로 그린다)
    expect(r.uploadSome(0)).toBe(false);
    expect(r.uploadSome(0)).toBe(false);
    expect(meshRecs(A.v)[1]!.src).toBe(b0);
    // 그리는 중에도 앞 버퍼가 살아 있다(가짜 GL은 지운 버퍼로 그리면 던진다)
    A.v.renderNow();
    while (!r.uploadSome(0)) {
      expect(meshRecs(A.v)[1]!.src).toBe(b0);
      expect(old.deleted).toBe(false);
    }
    expect(meshRecs(A.v)[1]!.src).toBe(b1);
    for (const b of others) expect(changed(A.gl, before)).not.toContain(b);
    expect(old.deleted).toBe(true);
    expect(bufOf(A.v, b1.positions)!.bytes).toEqual(bytesOf(b1.positions));
    const B = view();
    B.v.setScene(scene([box, copyMesh(b1), plate]));
    B.v.setCamera(A.v.getCamera());
    expect(frame(A)).toEqual(frame(B));
    expect(A.gl.liveBuffers).toBe(B.gl.liveBuffers);
  });

  it('장면을 나눠 올리는 중에 바꾸거나 빼도(올린 것·아직 안 올린 것) 끝난 뒤가 같다', () => {
    const g0 = gridMesh('grid', G, flat);
    const g1 = gridMesh('grid', G, cut1);
    const extra = boxMesh('extra', [-10, 40, 0], [0, 50, 5], [0.2, 0.9, 0.2, 1]);
    for (const steps of [0, 1, 2, 3, 6]) {
      const A = view();
      A.v.setScene(scene([box, g0, plate, extra]), { incremental: true });
      const r = (A.v as unknown as { renderer: { uploadSome(ms: number): boolean } }).renderer;
      for (let i = 0; i < steps; i++) r.uploadSome(0);
      A.v.setMesh(g1);
      A.v.removeMesh('box');
      A.v.setMesh(extra);
      A.v.renderNow();
      while (!r.uploadSome(0));
      const B = view();
      B.v.setScene(scene([g1, plate, extra]));
      B.v.setCamera(A.v.getCamera());
      expect(meshRecs(A.v).map((x) => x.src.id), `steps ${steps}`).toEqual(['grid', 'plate', 'extra']);
      expect(frame(A), `steps ${steps}`).toEqual(frame(B));
      expect(A.gl.liveBuffers, `steps ${steps}`).toBe(B.gl.liveBuffers);
    }
  });
});

describe('setMesh가 지키는 것', () => {
  it('숨김·강조·묶음 겉모습·측정 점·카메라는 그대로, 그 그물의 구간 숨김은 새 삼각형 수로 자른다', () => {
    const g0 = gridMesh('grid', G, flat);
    const A = view();
    A.v.setScene(scene([box, g0, plate]));
    A.v.setItemVisible('grid', false);
    A.v.setItemOpacity('grid', 0.5);
    A.v.highlight(['grid']);
    A.v.setHiddenRanges('grid', [{ start: 500, count: 5000 }]);
    expect(A.v.hiddenRanges('grid')).toEqual([{ start: 500, count: 32 * 32 * 2 - 500 }]);
    const cam = A.v.getCamera();
    const small = gridMesh('grid', { ...G, n: 21 }, cut1);
    A.v.setMesh(small);
    expect(A.v.isVisible('grid')).toBe(false);
    expect(A.v.itemLook('grid')?.opacity).toBe(0.5);
    expect(A.v.hiddenRanges('grid')).toEqual([{ start: 500, count: 20 * 20 * 2 - 500 }]);
    expect(A.v.getCamera()).toEqual(cam);
    A.v.setItemVisible('grid', true);
    A.v.renderNow();
    expect(A.v.removeMesh('grid')).toBe(true);
    expect(A.v.itemLook('grid')).toBeNull();
    expect(A.v.hiddenRanges('grid')).toEqual([]);
  });

  it('Scene3d.bounds를 준 장면은 그 범위 그대로(setScene과 같다)', () => {
    const g0 = gridMesh('grid', G, flat);
    const s = { ...scene([box, g0]), bounds: { min: [-50, -50, -50] as [number, number, number], max: [200, 200, 50] as [number, number, number] } };
    const A = view();
    A.v.setScene(s);
    const r0 = A.v.sectionRange('x');
    A.v.setMesh(boxMesh('far', [400, 0, 0], [410, 10, 10], [1, 1, 1, 1]));
    expect(A.v.sectionRange('x')).toEqual(r0);
    expect(A.v.scene!.bounds).toBe(s.bounds);
    const B = view();
    B.v.setScene(s);
    B.v.setMesh(boxMesh('far', [400, 0, 0], [410, 10, 10], [1, 1, 1, 1]));
    B.v.removeMesh('far');
    expect(B.v.sectionRange('x')).toEqual(r0);
  });

  it('격자 마디 좌표 도우미', () => {
    expect(gridX(G, 0)).toBe(40);
    expect(gridY(G, G.n - 1)).toBe(44);
  });
});
