/**
 * 0.61.0 묶음 자리 자료 저장소(조각 mergegl — 묶음마다·종류마다 그물 번호 자리를 고정해 둔 RGBA32F 그림, 무늬 단위 10, 60차 남은 한계 "자리 자료를 프레임마다 모두 쓰고 올린다").
 *  - 그린 도형(tests/drawexpand.ts — 정점마다 클립 좌표·시점 좌표·법선·색)이 끈 뷰어(그물마다)와 프레임마다 같다:
 *    가만히·돌림·강조·숨김(항목·묶음)·제자리 색 고치기·겉모습(색·행렬)과 해제·단면 하나·그림자·안개·외곽선·주변 가림·숨은 점선·그물 바꾸기·빼기
 *  - 바뀐 것이 없는 프레임은 올리지 않는다: 가만히·숨김 바꿈·외곽선과 주변 가림 켜기는 0텍셀, 강조 바꿈(굵은 윤곽선 선 색)·제자리 색 고치기·겉모습은 그 자리 텍셀만,
 *    카메라·단면·그림자·안개가 바뀌면 다시 쓴다
 *  - 무늬 한도가 작으면 자리를 처음부터 다시 놓고(같은 그림), 그래도 넘으면 그 차례는 그물마다(같은 그림). 단면·그림자를 켜고 꺼도 그림이 끝없이 늘지 않는다.
 *    묶음이 모두 없어지면 저장소 그림을 놓고, 문맥을 잃으면 잊는다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL, FakeTexture } from './fakegl';
import { expandFrame } from './drawexpand';
import { translation } from '../src/math';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
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

/** 상자 n개: 원점만(이동뿐)·돌린 행렬(9번째마다)·정점 색(3번째마다)·한쪽 면(10번째마다)·윤곽선 없음(13번째마다), 묶음 g0~g3 */
function grid(n: number): Scene3d {
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`);
    if (i % 9 === 0) m.matrix = placeAt((i % 30) * 10, Math.floor(i / 30) * 10, 0, i * 7, i % 18 === 0);
    else m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
    if (i % 10 === 0) m.doubleSided = false;
    if (i % 13 === 0) delete m.edges;
    return m;
  });
  return { name: 'g', units: 'mm', meshes, lines: [] };
}

type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown>; sc: Scene3d; up: { calls: number; texels: number } };

/** 뷰어(렌더러 GL을 감싸 저장소 단위 10에 올린 texSubImage2D 호출·텍셀을 센다) */
function view(sc: Scene3d, merging: boolean, maxRows = 0): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, r, sc, up: { calls: 0, texels: 0 } };
  const base = r.gl as Record<string | symbol, unknown> & { TEXTURE0: number; MAX_TEXTURE_SIZE: number };
  let unit = 0;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        if (k === 'activeTexture') unit = (a[0] as number) - base.TEXTURE0;
        if (k === 'texSubImage2D' && unit === 10) {
          w.up.calls++;
          w.up.texels += (a[4] as number) * (a[5] as number);
        }
        // 무늬 한도(줄)를 줄인 뷰어(자리 자료 저장소 다시 놓기·그물마다 시험)
        if (k === 'getParameter' && maxRows && a[0] === base.MAX_TEXTURE_SIZE) return maxRows;
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

/** 켬·끔 두 뷰어에 같은 조작 뒤 첫 프레임: 펼친 도형이 같은지, 켬 쪽이 저장소에 올린 텍셀 수(want — 'zero'·'some'·[아래, 위]) */
function step(on: W, off: W, label: string, fn: (w: W) => void, want: 'zero' | 'some' | [number, number]): void {
  for (const w of [on, off]) fn(w);
  on.up.calls = on.up.texels = 0;
  const b = shot(on), a = shot(off);
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
  const t = on.up.texels;
  if (want === 'zero') expect(t, label).toBe(0);
  else if (want === 'some') expect(t, label).toBeGreaterThan(0);
  else {
    expect(t, label).toBeGreaterThanOrEqual(want[0]);
    expect(t, label).toBeLessThanOrEqual(want[1]);
  }
  expect(on.v.stats.merged.draws, label).toBeGreaterThan(0);
}

describe('0.61.0 묶음 자리 자료 저장소', () => {
  it('바뀐 것이 없는 프레임은 올리지 않고, 그린 도형은 끈 뷰어와 프레임마다 같다', () => {
    const on = view(grid(600), true), off = view(grid(600), false);
    bake(on);
    bake(off);
    expect(on.v.stats.merged.groups).toBeGreaterThan(1);
    const rows = (k: number): [number, number] => [1, k * 1024];
    step(on, off, 'still', () => undefined, 'zero');
    step(on, off, 'orbit', (w) => w.v.orbitBy(0.05, 0), 'some');
    step(on, off, 'still-2', () => undefined, 'zero');
    // 강조: 굵은 윤곽선 구간(0.61.0 — 묶어 그린다)의 선 색은 그 그물 윤곽선 자리에, 0.62.0 강조 깃발은 그 그물 면 자리에(0.61.0은 면 자리 그대로 — 강조는 구간 균일 변수).
    // 쓴 자리 텍셀만 올린다(윤곽선 자리 6·면 자리 12 — 한 줄이 안 되는 틈으로 이어진 자리는 그 사이도 함께)
    step(on, off, 'hover', (w) => w.v.highlight(['b3']), [18, 18]);
    step(on, off, 'hover-2', (w) => w.v.highlight(['b4', 'b5', 'b77', 'b300']), rows(10));
    step(on, off, 'hide', (w) => w.v.setItemVisible('b10', false), 'zero');
    step(on, off, 'group-hide', (w) => w.v.setGroupVisible('g1', false), 'zero');
    step(on, off, 'group-show', (w) => (w.v.setGroupVisible('g1', true), w.v.highlight(null)), rows(8));
    // 제자리 색 고치기(같은 배열 안 값 — 0.60.0처럼 보인다): 그 면 자리 텍셀만(12텍셀)
    step(on, off, 'color-in-place', (w) => void ((w.sc.meshes[14]!.color as unknown as number[])[0] = 0.95), [12, 12]);
    // 겉모습을 처음 켜면 판이 바뀐다(겉모습이 없으면 자리의 모형을 견주지 않는다) — 그 뒤 겉모습 하나 더는 그 자리만
    step(on, off, 'look-on', (w) => w.v.setItemColor('b16', [1, 0, 0, 1]), 'some');
    step(on, off, 'look-color', (w) => w.v.setItemColor('b18', [0, 1, 0, 1]), [12, 12]);
    // 겉모습 행렬: 그 그물의 면·윤곽선 자리(장면 범위 안에서 옮겨 투영이 그대로 — 범위를 넘으면 투영이 바뀌어 모두 다시 쓴다)
    step(on, off, 'look-matrix', (w) => w.v.setItemMatrix('b47', translation([1, 0, 0])), [18, 18]);
    step(on, off, 'look-matrix-off', (w) => w.v.setItemMatrix('b47', null), [18, 18]);
    step(on, off, 'looks-off', (w) => (w.v.setItemColor('b16', null), w.v.setItemColor('b18', null)), 'some');
    step(on, off, 'look-matrix-far', (w) => w.v.setItemMatrix('b17', translation([0, 0, 20])), 'some');
    step(on, off, 'look-matrix-far-off', (w) => w.v.setItemMatrix('b17', null), 'some');
    step(on, off, 'still-3', () => undefined, 'zero');
    step(on, off, 'section', (w) => w.v.setSection({ normal: [1, 0, 0], offset: 120 }), 'some');
    step(on, off, 'section-still', () => undefined, 'zero');
    step(on, off, 'section-move', (w) => w.v.setSection({ normal: [1, 0, 0], offset: 140 }), 'some');
    step(on, off, 'sun-shadow', (w) => w.v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }), 'some');
    step(on, off, 'shadow-still', () => undefined, 'zero');
    step(on, off, 'fog', (w) => w.v.setFog({ start: 50, end: 400 }), 'some');
    step(on, off, 'fog-still', () => undefined, 'zero');
    // 외곽선·주변 가림 깊이 차례는 면 차례가 쓴 자리를 그대로 읽는다(올리지 않는다)
    step(on, off, 'profiles-ao', (w) => (w.v.setRenderOptions({ profiles: { width: 1 } }), w.v.setAmbientOcclusion({})), 'zero');
    step(on, off, 'plain', (w) => (w.v.setSection(null), w.v.setLighting(null), w.v.setFog(null), w.v.setAmbientOcclusion(null)), 'some');
    // 숨은 선 모드: 바탕색 면·윤곽선·숨은 점선(자리 종류 셋)
    step(on, off, 'hidden-line', (w) => (w.v.setRenderMode('hiddenLine'), w.v.setRenderOptions({ hiddenEdges: 0.4 })), 'some');
    step(on, off, 'hidden-still', () => undefined, 'zero');
    step(on, off, 'hidden-orbit', (w) => w.v.orbitBy(0.05, 0), 'some');
    step(on, off, 'shaded', (w) => w.v.setRenderMode('shadedEdges'), 'some');
    // 그물 바꾸기·빼기(묶음에서 빠지고 다음 다시 굽기까지 그물마다)
    step(on, off, 'edit', (w) => (w.v.setMesh({ ...boxMesh('b20', [0, 0, 0], [6, 6, 9], [0.9, 0.2, 0.2, 1]), origin: [0, 0, 40] }), w.v.removeMesh('b21')), 'some');
    bake(on);
    bake(off);
    step(on, off, 'edit-still', () => undefined, 'zero');
    // 묶어 그리기를 끄면 묶음이 모두 없어져 저장소 그림을 놓는다
    const s = on.r.mgStore as { tex: FakeTexture } | null;
    expect(s).not.toBeNull();
    on.v.setRenderOptions({ merging: false });
    bake(on);
    expect(on.r.mgStore).toBeNull();
    expect(s!.tex.deleted).toBe(true);
    expect(shot(on)).toEqual(shot(off));
  });

  it('무늬 한도가 작으면 자리를 처음부터 다시 놓고(같은 그림), 그래도 넘으면 그 차례는 그물마다 그린다', () => {
    // 300개: 면 자리 3,600텍셀 남짓·윤곽선 1,800텍셀 남짓 — 5줄(5,120)이면 하나씩만 들어 차례마다 다시 놓는다, 3줄이면 면은 그물마다
    for (const rows of [5, 3]) {
      const on = view(grid(300), true, rows), off = view(grid(300), false);
      bake(on);
      bake(off);
      expect(shot(on), `${rows}`).toEqual(shot(off));
      on.v.orbitBy(0.05, 0);
      off.v.orbitBy(0.05, 0);
      expect(shot(on), `${rows} orbit`).toEqual(shot(off));
      const s = on.r.mgStore as { ep: number; rows: number; max: number };
      expect(s.max, `${rows}`).toBe(rows);
      expect(s.rows, `${rows}`).toBeLessThanOrEqual(rows);
      expect(on.v.stats.merged.draws, `${rows}`).toBeGreaterThan(0);
      if (rows === 5) expect(s.ep).toBeGreaterThan(3);
      else expect(on.v.stats.drawCalls).toBeGreaterThan(300);
    }
  });

  it('단면·그림자를 켜고 끄면(자리 텍셀 수가 바뀐다) 버린 자리를 걷어 그림이 끝없이 늘지 않는다', () => {
    const w = view(grid(3000), true);
    bake(w);
    type S = { top: number; live: number; rows: number; ep: number };
    const s0 = w.r.mgStore as S;
    const ep0 = s0.ep;
    // 면 12·윤곽선 6텍셀 — 묶음마다 맞춤 자리 하나씩
    expect(s0.live).toBeGreaterThanOrEqual(3000 * 18 - 13 * 6 * 18);
    let peak = 0;
    for (let k = 0; k < 3; k++)
      for (const set of [
        () => w.v.setSection({ normal: [1, 0, 0], offset: 120 }),
        () => w.v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }),
        () => w.v.setSection(null),
        () => w.v.setLighting(null),
      ]) {
        set();
        w.v.renderNow();
        w.v.renderNow();
        const s = w.r.mgStore as S;
        peak = Math.max(peak, s.live);
        expect(s.top).toBeLessThanOrEqual(s.rows * 1024);
        expect(s.rows * 1024).toBeLessThanOrEqual(2 * peak + 64 * 1024);
      }
    expect((w.r.mgStore as S).ep).toBeGreaterThan(ep0);
  });

  it('문맥을 잃으면 저장소를 잊고, 되찾아 다시 구우면 같은 그림이다', () => {
    const on = view(grid(400), true), off = view(grid(400), false);
    bake(on);
    bake(off);
    expect(on.r.mgStore).not.toBeNull();
    for (const w of [on, off]) {
      (w.v.canvas as unknown as FakeElement).fire('webglcontextlost', {});
      expect(w.r.mgStore).toBeNull();
      (w.v.canvas as unknown as FakeElement).fire('webglcontextrestored', {});
    }
    bake(on);
    bake(off);
    expect(on.r.mgStore).not.toBeNull();
    expect(shot(on)).toEqual(shot(off));
    // 장면을 비우면 놓는다
    on.v.setScene({ name: 'e', units: 'mm', meshes: [], lines: [] });
    expect(on.r.mgStore).toBeNull();
  });
});
