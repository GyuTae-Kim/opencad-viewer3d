/**
 * 0.63.0 setMesh로 바꾼 묶음 그물(62차 남은 한계 "setMesh로 바꾼 그물은 다음 다시 굽기까지 그물마다 버퍼다").
 *  - 같은 꼴(정점·그리는 색인·윤곽선 선분 수와 묶음 열쇠가 같은) 그물로 바꾸면 묶음 자리에 그대로 갈아 쓴다: 버퍼·VAO·그리기 호출·묶음 그물 수가 그대로이고
 *    묶음 버퍼 바이트가 같은 장면을 새로 구운 뷰어와 같다. 바꾼 그물 자리만 자리 자료를 다시 쓴다
 *  - 그린 도형이 끈 뷰어와 같다(tests/drawexpand.ts): 크기·색·정점 색 켜고 끄기·원점·돌린 행렬·모형 없음으로 바꾸기, 같은 배열 제자리 고치기(vertices),
 *    돌림·강조·숨김·단면·그림자·안개·숨은 선·단색·겉모습
 *  - 꼴이 다르면(색인 수·윤곽선·법선·반투명·정점 색 없는 묶음에 정점 색) 0.62.0 길(그물마다 버퍼 — 묶음에서 빠진다) 그대로
 *  - 고르기는 바꾼 그물로(끈 뷰어와 같은 답)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Rgba, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';

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

/** 상자 i: 원점만, 9번째마다 돌린 행렬, 정점 색(3번째마다), 한쪽 면(10번째마다), 윤곽선 없음(13번째마다), 묶음 g0~g3 */
function box(i: number, k = 0, col?: Rgba): Mesh3d {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6 - k, 6 + k, 4 + (i % 3) - k], col ?? [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`);
  if (i % 9 === 0 && i % 2 === 0) m.matrix = placeAt((i % 30) * 10, Math.floor(i / 30) * 10, k, i * 7, i % 18 === 0);
  else m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, k];
  if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i + k) % 10) / 10));
  if (i % 10 === 0) m.doubleSided = false;
  if (i % 13 === 0) delete m.edges;
  return m;
}
const grid = (n: number): Scene3d => ({ name: 'g', units: 'mm', meshes: Array.from({ length: n }, (_, i) => box(i)), lines: [] });

type W = { v: Viewer3d; gl: FakeGL; up: { texels: number } };
type R = { mgGroups: Set<{ recs: { src: Mesh3d }[]; attrs: { pos: unknown; nrm: unknown; col: unknown }; ib: unknown; segBuf: unknown }>; meshes: { mg?: unknown; src: Mesh3d }[] };
const rend = (w: W): R => (w.v as unknown as { renderer: R }).renderer;

function view(sc: Scene3d, merging: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, up: { texels: 0 } };
  const base = r.gl as Record<string | symbol, unknown> & { TEXTURE0: number };
  let unit = 0;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        if (k === 'activeTexture') unit = (a[0] as number) - base.TEXTURE0;
        if (k === 'texSubImage2D' && unit === 10) w.up.texels += (a[4] as number) * (a[5] as number);
        return (x as (...y: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  v.setRenderOptions({ merging });
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  return w;
}

function bake(w: W): void {
  w.v.renderNow();
  for (let i = 0; i < 100 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}

const shot = (w: W): string[] => expandFrame(w.gl, () => w.v.renderNow());
const live = (w: W): [number, number] => [w.gl.liveBuffers, w.gl.vaos.filter((x) => !x.deleted).length];

/** 켬·끔에 같은 조작 뒤 첫 프레임의 펼친 도형이 같은지 — 켬 쪽 [올린 자리 텍셀, 그리기 호출] */
function step(on: W, off: W, label: string, fn: (v: Viewer3d) => void): [number, number] {
  for (const w of [on, off]) fn(w.v);
  on.up.texels = 0;
  const b = shot(on), a = shot(off);
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
  expect(on.v.stats.merged.draws, label).toBeGreaterThan(0);
  return [on.up.texels, on.v.stats.drawCalls];
}

/** 묶음 버퍼 바이트(위치·법선·색·색인·윤곽선 — 묶음 차례) */
function groupBytes(w: W): string[] {
  const hex = (b: unknown): string => (b ? Buffer.from((b as { bytes: Uint8Array }).bytes).toString('hex') : '-');
  return [...rend(w).mgGroups].map((g) => [g.recs.map((r) => r.src.id).join(','), hex(g.attrs.pos), hex(g.attrs.nrm), hex(g.attrs.col), hex(g.ib), hex(g.segBuf)].join('|'));
}

describe('0.63.0 같은 꼴 그물 바꾸기 — 묶음 자리에서 갈아 쓰기', () => {
  it('GL 객체·그리기 호출·묶음 그물 수가 그대로이고 묶음 버퍼가 새로 구운 뷰어와 바이트까지 같다, 그린 도형은 끈 뷰어와 같다', () => {
    const n = 1200;
    const on = view(grid(n), true), off = view(grid(n), false);
    bake(on);
    bake(off);
    const [, draws0] = step(on, off, 'plain', () => undefined);
    const live0 = live(on);
    expect(on.v.stats.merged.meshes).toBe(n);
    // 크기·색·원점(정점 색 그물·한쪽 면·윤곽선 없는 그물·돌린 행렬 그물), 정점 색 없던 그물에 정점 색(묶음에 색 버퍼가 있다), 정점 색을 뺌, 모형 없음
    const ids = [5, 6, 13, 18, 20, 26, 118, 400, 401, 1199];
    const [t1, d1] = step(on, off, 'swap', (v) => {
      for (const i of ids) {
        const m = box(i, 1, [0.9, 0.2 + (i % 7) * 0.1, 0.1, 1]);
        if (i === 118) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.3));
        if (i === 18) delete m.colors;
        if (i === 401) delete m.origin;
        expect(v.setMesh(m)).toBe(true);
      }
    });
    expect(live(on)).toEqual(live0);
    expect(d1).toBe(draws0);
    expect(on.v.stats.merged.meshes).toBe(n);
    expect(on.v.stats.merged.pending).toBe(0);
    // (장면 범위가 바뀌어 시점·투영 — 가까운·먼 면 — 이 바뀐 프레임은 0.62.0처럼 자리를 모두 다시 쓴다)
    expect(t1).toBeGreaterThan(0);
    expect(step(on, off, 'still', () => undefined)[0]).toBe(0);
    // 범위가 그대로인 바꾸기(색·정점 색만 — 원점·크기 그대로)는 바꾼 그물 자리만 다시 쓴다(면 + 윤곽선 자리 — 온 꼴이어도 18텍셀)
    const [t2, d2] = step(on, off, 'recolor', (v) => {
      for (const i of [26, 400, 702]) {
        const m = box(i, 0, [0.1, 0.9, 0.3, 1]);
        m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.15));
        v.setMesh(m);
      }
    });
    expect(t2).toBeGreaterThan(0);
    expect(t2).toBeLessThanOrEqual(3 * (12 + 6));
    expect(d2).toBe(draws0);
    expect(step(on, off, 'still2', () => undefined)[0]).toBe(0);
    // 같은 장면을 새로 구운 뷰어와 묶음 버퍼 바이트가 같다
    const fresh = view({ ...grid(n), meshes: on.v.scene!.meshes.map((m) => ({ ...m })) }, true);
    bake(fresh);
    expect(groupBytes(on)).toEqual(groupBytes(fresh));
    // 같은 배열 제자리 고치기(vertices — 같은 꼴): 묶음 자리를 다시 쓴다
    step(on, off, 'in-place', (v) => {
      const m = v.scene!.meshes.find((x) => x.id === 'b7')!;
      m.positions[0] = -2;
      m.positions[1] = -1;
      v.setMesh(m, { vertices: [{ start: 0, count: 1 }] });
    });
    expect(live(on)).toEqual(live0);
    expect(on.v.stats.merged.meshes).toBe(n);
    // 여러 상태에서 끈 뷰어와 같은 도형(바꾼 그물이 든 덩이 — 강조·숨김·잘라냄 예외 그물과 겹침)
    step(on, off, 'orbit', (v) => v.orbitBy(0.6, 0.1));
    step(on, off, 'hi-hide', (v) => (v.highlight(['b5', 'b6', 'b20', 'b300']), v.setItemVisible('b13', false), v.setItemVisible('b401', false)));
    step(on, off, 'zoom', (v) => v.zoomBy(4));
    step(on, off, 'fog', (v) => (v.zoomBy(0.25), v.setFog({ start: 50, end: 400 })));
    step(on, off, 'section', (v) => v.setSection({ normal: [1, 0, 0], offset: 60 }));
    step(on, off, 'shadow', (v) => v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }));
    step(on, off, 'plain2', (v) => (v.setFog(null), v.setSection(null), v.setLighting(null), v.highlight(null), v.setItemVisible('b13', true), v.setItemVisible('b401', true)));
    step(on, off, 'hidden-line', (v) => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 })));
    step(on, off, 'mono', (v) => (v.setRenderMode('monochrome'), v.setRenderOptions({ hiddenEdges: 0 })));
    step(on, off, 'look', (v) => (v.setRenderMode('shadedEdges'), v.setItemColor('b5', [0, 1, 0, 1])));
    step(on, off, 'look-off', (v) => v.setItemColor('b5', null));
    // 바꾼 뒤 다시 바꾸기(같은 그물을 거듭 — 돌린 행렬로 바꿔 그 묶음이 온 꼴이 되고, 다시 이동뿐으로). 숨은 선·그림자 등이 만든 GL 객체는 앞 단계 것이라 여기서 다시 센다
    const liveA = live(on);
    step(on, off, 'again', (v) => {
      const m = box(6, 2);
      m.matrix = placeAt(60, 0, 0, 30, false);
      delete m.origin;
      v.setMesh(m);
    });
    step(on, off, 'again2', (v) => v.setMesh(box(6, 0)));
    expect(live(on)).toEqual(liveA);
    expect(on.v.stats.merged.meshes).toBe(n);
    // 고르기: 바꾼 그물 가운데를 가리키면 그 그물(끈 뷰어와 같은 답)
    for (const id of ['b5', 'b118', 'b400']) {
      const m = on.v.scene!.meshes.find((x) => x.id === id)!;
      const o = m.origin ?? [0, 0, 0];
      const p = on.v.project([o[0]! + 2.5, o[1]! + 3.5, o[2]! + 2]);
      expect(p).not.toBeNull();
      const a = on.v.pick(p!.x, p!.y), b = off.v.pick(p!.x, p!.y);
      expect(a?.id, id).toBe(b?.id);
      expect(a?.id, id).toBe(id);
    }
  });

  it('꼴이 다르면 0.62.0 길: 그 그물만 묶음에서 빠지고(그물마다 버퍼) 그린 도형은 끈 뷰어와 같다', () => {
    const n = 400;
    const on = view(grid(n), true), off = view(grid(n), false);
    bake(on);
    bake(off);
    step(on, off, 'plain', () => undefined);
    const [b0, v0] = live(on);
    const swaps: [string, (i: number) => Mesh3d][] = [
      // 색인 수가 다르다
      ['tri', (i) => ({ ...box(i, 1), indices: box(i, 1).indices!.slice(0, 33) })],
      // 윤곽선이 없다(있던 그물)
      ['edges', (i) => ({ ...box(i, 1), edges: undefined })],
      // 법선을 준다(묶음 열쇠가 다르다)
      ['normals', (i) => ({ ...box(i, 1), normals: new Float32Array(24).fill(0.5) })],
      // 반투명
      ['alpha', (i) => box(i, 1, [0.2, 0.3, 0.9, 0.5])],
    ];
    let k = 0;
    for (const [label, make] of swaps) {
      const i = 31 + k * 4;
      step(on, off, label, (v) => expect(v.setMesh(make(i))).toBe(true));
      k++;
      expect(on.v.stats.merged.meshes, label).toBe(n - k);
    }
    const [b1, v1] = live(on);
    expect(b1).toBeGreaterThan(b0);
    expect(v1).toBeGreaterThan(v0);
    // 정점 색이 없는 묶음에 정점 색 그물: 그 묶음에는 색 버퍼가 없다 — 빠진다
    const plain = view({ name: 'p', units: 'mm', meshes: Array.from({ length: 300 }, (_, i) => ({ ...box(i * 3 + 1), group: undefined })), lines: [] }, true);
    const plainOff = view({ name: 'p', units: 'mm', meshes: Array.from({ length: 300 }, (_, i) => ({ ...box(i * 3 + 1), group: undefined })), lines: [] }, false);
    bake(plain);
    bake(plainOff);
    const m0 = plain.v.stats.merged.meshes;
    step(plain, plainOff, 'vcol', (v) => {
      const m = box(4, 1);
      m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.7));
      v.setMesh(m);
    });
    expect(plain.v.stats.merged.meshes).toBe(m0 - 1);
  });
});
