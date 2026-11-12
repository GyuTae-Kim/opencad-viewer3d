/**
 * 0.63.0 숨김을 바꾼 그리기의 렌더러 몫(62차 남은 한계 "숨김을 프레임마다 바꾸면 렌더러가 보이는 목록·덩이 숨김 번호를 그물마다 다시 만든다").
 *  - 뷰어가 숨김 판마다 바꾼 항목 id를 적어 렌더러에 알린다(RenderState.visDelta — 묶음 숨김·장면 바꾸기·구간 숨김·기록이 넘치면 모른다 null)
 *  - 렌더러는 그 그물만 고친다(조각 visPatch): 보이는 목록(장면 차례)에 넣고 빼고, 덩이 숨긴 번호(오름차순)에 넣고 뺀다 — 처음부터 만든 목록·번호와 같다
 *  - 그린 도형은 끈 뷰어와 같다. 숨김을 하나 바꾼 그리기는 그물마다 보이는지 묻지 않는다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
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

/** 상자 n개(묶음 g0~g3, 정점 색 셋째마다, 37번째마다 반투명 — 묶음 밖, 마지막 둘은 같은 id) */
function grid(n: number): Scene3d {
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, i % 37 === 5 ? 0.5 : 1], `g${i % 4}`);
    m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
    return m;
  });
  meshes.push({ ...meshes[7]!, origin: [0, -20, 0] });
  return { name: 'g', units: 'mm', meshes, lines: [] };
}

type W = { v: Viewer3d; gl: FakeGL; asked: { n: number } };
type Rec = { src: Mesh3d; visAt?: number; mg?: unknown; mi?: number; bk?: number };
type Rend = { meshes: Rec[]; visMemo: { seq: number; list: Rec[] } | null; mgOrder: { blocks: { a: number; b: number; g: { recs: Rec[] }; hid: number[] }[] } | null };
const rend = (w: W): Rend => (w.v as unknown as { renderer: Rend }).renderer;

function view(sc: Scene3d, merging: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const asked = { n: 0 };
  // 렌더러가 RenderState.visible로 묻는 수를 센다(뷰어의 보이는 범위 셈은 빼고)
  const o = v as unknown as { renderState: (...a: unknown[]) => { visible: (id: string, g: string | undefined) => boolean } };
  const rs = o.renderState.bind(v);
  o.renderState = (...a) => {
    const s = rs(...a);
    const f = s.visible;
    s.visible = (id, g) => (asked.n++, f(id, g));
    return s;
  };
  v.setRenderOptions({ merging });
  v.setScene(sc);
  v.fit(false);
  return { v, gl, asked };
}

function bake(w: W): void {
  w.v.renderNow();
  for (let i = 0; i < 100 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}

const shot = (w: W): string[] => expandFrame(w.gl, () => w.v.renderNow());

/** 보이는 목록·덩이 숨긴 번호가 처음부터 만든 것과 같은지 */
function same(w: W, label: string): void {
  const r = rend(w), M = r.visMemo!;
  expect(M, label).not.toBeNull();
  const vis = (x: Rec): boolean => w.v.isVisible(x.src.id);
  expect(M.list, label).toEqual(r.meshes.filter(vis));
  for (const x of r.meshes) expect(x.visAt === M.seq, `${label} ${x.src.id}`).toBe(vis(x));
  for (const k of r.mgOrder!.blocks) {
    const hid: number[] = [];
    for (let i = k.a; i < k.b; i++) if (!vis(k.g.recs[i]!)) hid.push(i);
    expect(k.hid, label).toEqual(hid);
  }
}

describe('0.63.0 숨김 바꾸기 — 바꾼 그물만 고친다', () => {
  it('보이는 목록·덩이 숨긴 번호가 처음부터 만든 것과 같고, 그린 도형은 끈 뷰어와 같고, 그물마다 묻지 않는다', () => {
    const n = 1500;
    const on = view(grid(n), true), off = view(grid(n), false);
    bake(on);
    bake(off);
    const step = (label: string, fn: (v: Viewer3d) => void): number => {
      for (const w of [on, off]) fn(w.v);
      on.asked.n = 0;
      const b = shot(on);
      const asked = on.asked.n;
      const a = shot(off);
      expect(b.length, label).toBe(a.length);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
      same(on, label);
      return asked;
    };
    step('plain', () => undefined);
    // 하나 숨김(묶음 그물·덩이 첫·끝·묶음 밖 반투명 그물·같은 id 둘)
    for (const id of ['b10', 'b0', 'b1499', 'b5', 'b7', 'b1023', 'b1024']) expect(step(`hide ${id}`, (v) => v.setItemVisible(id, false)), id).toBeLessThan(20);
    // 여럿을 한 번에, 숨겼다 다시 보임(같은 그리기 안), 이미 숨긴 것 다시 숨김, 없는 id
    step('many', (v) => {
      for (let i = 100; i < 160; i += 3) v.setItemVisible(`b${i}`, false);
    });
    expect(step('flip', (v) => (v.setItemVisible('b11', false), v.setItemVisible('b11', true), v.setItemVisible('b10', false), v.setItemVisible('nope', false)))).toBeLessThan(20);
    // 다시 보임
    for (const id of ['b10', 'b0', 'b5', 'b7']) step(`show ${id}`, (v) => v.setItemVisible(id, true));
    // 묶음 숨김은 처음부터(그물마다 묻는다)
    expect(step('group', (v) => v.setGroupVisible('g2', false))).toBeGreaterThanOrEqual(n);
    step('in-group', (v) => (v.setItemVisible('b2', true), v.setItemVisible('b3', false)));
    step('group-back', (v) => v.setGroupVisible('g2', true));
    // 강조·단면·돌림과 겹침, 많이 바꾸기(한도 넘음 — 처음부터)
    step('hi', (v) => (v.highlight(['b12', 'b13', 'b100']), v.setItemVisible('b13', false)));
    step('section', (v) => (v.setSection({ normal: [1, 0, 0], offset: 120 }), v.setItemVisible('b14', false)));
    step('orbit', (v) => (v.orbitBy(0.3, 0.1), v.setItemVisible('b14', true)));
    step('lots', (v) => {
      for (let i = 0; i < n; i += 1) v.setItemVisible(`b${i}`, i % 2 === 0);
    });
    step('lots-back', (v) => {
      for (let i = 0; i < n; i += 1) v.setItemVisible(`b${i}`, true);
    });
    // 그물을 바꾸거나 장면을 바꾼 뒤(뼈대가 바뀐다)
    step('setMesh', (v) => (v.setMesh({ ...boxMesh('b20', [0, 0, 0], [3, 3, 3], [1, 0, 0, 1], 'g0'), origin: [200, 0, 0] }), v.setItemVisible('b21', false)));
    step('after', (v) => v.setItemVisible('b22', false));
    for (const w of [on, off]) {
      w.v.setScene(grid(n));
      w.v.fit(false);
      bake(w);
    }
    step('scene', () => undefined);
    expect(step('scene-hide', (v) => v.setItemVisible('b30', false))).toBeLessThan(20);
  });
});
