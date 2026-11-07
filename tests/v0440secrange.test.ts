/**
 * 0.44.0 묶음 안 구간 단면(SKP 42차 요청 — setSections items의 { id, start, count, edges? }): 평면이 묶음의 그 구간만 자른다.
 * - 순수 함수: 갈래 구간(cutRuns)·보이는 구간 나누기(cutParts)·갈래 값·번호 → 비트
 * - 뷰어(가짜 WebGL2): 그리기를 갈래마다 나누고 그 갈래 평면들을 균일 변수(u_clips·u_nclip)로 올리는지, 고르기·잘린 면 고르기·단면 테두리·
 *   잘린 면 채우기·선분 묶음·윤곽선 구간·숨긴 구간과의 맞물림, 인스턴싱(구간 단면이 있으면 그물마다), 상태(sections.ranges)
 * 화면 좌표로 가리킬 때는 그물 경계를 정확히 가리키지 않는다.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { cutBits, cutMaskAt, cutParts, cutRuns, partCuts, partsOf } from '../src/ranges';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';

// ───────────── 순수 함수 ─────────────
describe('갈래 구간(ranges.ts)', () => {
  it('cutRuns: 평면마다 구간을 번호 차례 갈래로(겹치면 비트 합, 같은 비트 이웃은 합침)', () => {
    expect(cutRuns([])).toEqual([]);
    const runs = cutRuns([
      { bit: 1, ranges: [{ start: 2, count: 4 }] },
      { bit: 4, ranges: [{ start: 4, count: 4 }, { start: 10, count: 2 }] },
    ]);
    expect(runs).toEqual([
      { start: 2, end: 4, mask: 1 },
      { start: 4, end: 6, mask: 5 },
      { start: 6, end: 8, mask: 4 },
      { start: 10, end: 12, mask: 4 },
    ]);
    const at = cutMaskAt(runs);
    expect([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(at)).toEqual([0, 1, 1, 5, 5, 4, 4, 0, 0, 4, 4, 0]);
    expect(cutMaskAt([])(5)).toBe(0);
    expect(cutBits(5)).toEqual([0, 2]);
    expect(cutBits(0)).toEqual([]);
    expect(cutBits(32)).toEqual([5]);
  });

  it('cutParts: 숨김·강조 구간을 갈래로 더 나눈다 — 갈래가 없으면 같은 배열', () => {
    const parts = [
      { start: 0, count: 5, hi: false },
      { start: 5, count: 3, hi: true },
      { start: 10, count: 6, hi: false },
    ];
    expect(cutParts(parts, [])).toBe(parts);
    expect(cutParts(parts, [{ bit: 2, ranges: [] }])).toBe(parts);
    const c = cutParts(parts, [{ bit: 2, ranges: [{ start: 3, count: 9 }] }]);
    expect(c).toEqual([
      { start: 0, count: 3, hi: false },
      { start: 3, count: 2, hi: false, cut: 2 },
      { start: 5, count: 3, hi: true, cut: 2 },
      { start: 10, count: 2, hi: false, cut: 2 },
      { start: 12, count: 4, hi: false },
    ]);
    expect(partCuts(c)).toEqual([0, 2]);
    expect(partCuts(parts)).toEqual([0]);
    expect(partCuts([])).toEqual([]);
    // 갈래를 주면 그 갈래만, 주지 않으면 0.43.0처럼 종류만
    expect(partsOf(c, false, 2)).toEqual([
      { start: 3, count: 2 },
      { start: 10, count: 2 },
    ]);
    expect(partsOf(c, false, 0)).toEqual([
      { start: 0, count: 3 },
      { start: 12, count: 4 },
    ]);
    expect(partsOf(c, false)).toEqual([
      { start: 0, count: 3 },
      { start: 3, count: 2 },
      { start: 10, count: 2 },
      { start: 12, count: 4 },
    ]);
    // 이웃한 같은 갈래는 합친다(구간 하나 안의 갈래 경계만 나눈다)
    expect(cutParts([{ start: 0, count: 10, hi: false }], [{ bit: 1, ranges: [{ start: 0, count: 10 }] }])).toEqual([{ start: 0, count: 10, hi: false, cut: 1 }]);
  });
});

// ───────────── 뷰어 ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

/** 상자 둘(삼각형 0~11 = 왼쪽 A, 12~23 = 오른쪽 B)을 한 그물로 합친 판 — SketchUp 그룹 둘을 재질 묶음 하나로 구운 꼴 */
function mergedPlate(): Mesh3d {
  const a = boxMesh('a', [0, 0, 0], [40, 40, 20], [0.7, 0.7, 0.75, 1]);
  const b = boxMesh('b', [60, 0, 0], [100, 40, 20], [0.7, 0.7, 0.75, 1]);
  const positions = new Float32Array(48);
  positions.set(a.positions, 0);
  positions.set(b.positions, 24);
  const indices = new Uint32Array(72);
  indices.set(a.indices!, 0);
  for (let i = 0; i < 36; i++) indices[36 + i] = b.indices![i]! + 8;
  const edges = new Float32Array(a.edges!.length * 2);
  edges.set(a.edges!, 0);
  edges.set(b.edges!, a.edges!.length);
  return { id: '판', name: '판', positions, indices, edges, color: [0.7, 0.7, 0.75, 1], closed: true };
}
/** 세로 선분 둘(0번은 A 위, 1번은 B 위 — z 0~30) */
const POLES: LineSet3d = { id: '기둥', positions: new Float32Array([20, 20, 0, 20, 20, 30, 80, 20, 0, 80, 20, 30]) };
function scene(): Scene3d {
  return { name: 't', units: 'mm', meshes: [mergedPlate()], lines: [POLES] };
}
/** B만 z > 10 쪽을 잘라 내는 평면(판의 삼각형 12~23, 기둥의 선분 1) */
const CUT_B = { normal: [0, 0, 1], offset: 10, items: [{ id: '판', start: 12, count: 12 }, { id: '기둥', start: 1, count: 1 }] };

type W = { v: Viewer3d; gl: FakeGL };
function view(mode: 'shaded' | 'shadedEdges' | 'wireframe' = 'shaded'): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: mode, viewCube: false, grid: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  gl.logDraws = true;
  v.setScene(scene());
  v.setView('top', false);
  v.fit(false);
  return { v, gl };
}
function frame(w: W): DrawEntry[] {
  w.gl.draws = [];
  w.v.renderNow();
  return w.gl.draws;
}
function uni(e: DrawEntry, name: string): unknown[] | undefined {
  return new Map(JSON.parse(e.uniforms) as [string, unknown[]][]).get(name);
}
/** 가짜 GL 상수(이름마다 고유 값) */
const K = (w: W, name: string): number => (w.gl as unknown as Record<string, number>)[name]!;
/** 여러 단면 그물 면 그리기(CLIPN 그물 프로그램 — 잘린 면 홀짝(CLIP)·채운 다각형은 아니다)의 [색인 수, 바이트 자리, 평면 수, 첫 평면] */
function faceDraws(w: W, d: DrawEntry[]): [number, number, number, number[]][] {
  return d
    .filter((e) => e.op === 'drawElements' && e.args[0] === K(w, 'TRIANGLES') && uni(e, 'u_nclip') !== undefined && uni(e, 'u_m') !== undefined)
    .map((e) => [e.args[1]!, e.args[3]!, (uni(e, 'u_nclip') as number[])[0]!, ((uni(e, 'u_clips') as number[][])[0] ?? []).slice(0, 4)]);
}
const at = (w: W, p: readonly number[]): [number, number] => {
  const s = w.v.project(p)!;
  return [s.x, s.y];
};

describe('setSections items의 묶음 안 구간(0.44.0)', () => {
  it('그리기: 그물을 갈래마다 나눠 그리고 그 갈래 평면만 올린다(A = 평면 0개, B = z > 10 평면 하나)', () => {
    const w = view();
    w.v.setSections([CUT_B]);
    const f = faceDraws(w, frame(w));
    expect(f).toEqual([
      [36, 0, 0, [0, 0, 0, 0]],
      [36, 144, 1, [0, 0, 1, -10]],
    ]);
    // 묶음 통째로 주면 0.43.0처럼 한 번(평면 하나)
    w.v.setSections([{ normal: [0, 0, 1], offset: 10, items: ['판'] }]);
    expect(faceDraws(w, frame(w))).toEqual([[72, 0, 1, [0, 0, 1, -10]]]);
    // 통째와 구간을 함께 주면 통째
    w.v.setSections([{ ...CUT_B, items: ['판', ...CUT_B.items] }]);
    expect(faceDraws(w, frame(w))).toEqual([[72, 0, 1, [0, 0, 1, -10]]]);
  });

  it('상태: sections의 items는 통째 묶음만, ranges는 묶음·종류마다 합친 구간', () => {
    const w = view();
    w.v.setSections([{ ...CUT_B, items: [...CUT_B.items, { id: '판', start: 18, count: 10 }, { id: '판', start: 2, count: 3, edges: true }, '없는 묶음'] }]);
    const st = w.v.sections[0]!;
    expect(st.items).toEqual(['없는 묶음']);
    expect(st.ranges).toEqual([
      { id: '판', start: 12, count: 16 },
      { id: '판', start: 2, count: 3, edges: true },
      { id: '기둥', start: 1, count: 1 },
    ]);
    // 묶음 수 밖은 쓸 때 자른다(삼각형 24개 — 그리기는 12~23)
    expect(faceDraws(w, frame(w)).map((x) => x.slice(0, 3))).toEqual([
      [36, 0, 0],
      [36, 144, 1],
    ]);
  });

  it('고르기: A 윗면은 그대로, B는 잘린 쪽을 지나 잘린 면(z = 10)을 고른다 — 구간을 주지 않은 그물은 단면이 없는 것과 같다', () => {
    const w = view();
    // 기둥(x 20·80, y 20)에서 떨어진 자리
    const [ax, ay] = at(w, [10.3, 30.2, 20]);
    const [bx, by] = at(w, [70.3, 30.2, 20]);
    const before = [w.v.pick(ax, ay), w.v.pick(bx, by)];
    for (const p of before) {
      expect(p).toMatchObject({ kind: 'mesh', id: '판' });
      expect(p!.point[2]).toBeCloseTo(20, 6);
    }
    w.v.setSections([CUT_B]);
    const pa = w.v.pick(ax, ay)!;
    expect(pa).toMatchObject({ kind: 'mesh', id: '판' });
    expect(pa).toEqual(before[0]);
    const pb = w.v.pick(bx, by)!;
    expect(pb).toMatchObject({ kind: 'mesh', id: '판', section: true, index: -1 });
    expect(pb.point[2]).toBeCloseTo(10, 6);
    // 잘린 면 채우기를 끄면 B 바닥(z = 0) 안쪽 면 — 광선은 B의 남은 아래 반 안을 지난다
    w.v.setSections([{ ...CUT_B, caps: 'none' }]);
    const pn = w.v.pick(bx, by)!;
    expect(pn.section).toBeUndefined();
    expect(pn.point[2]).toBeCloseTo(0, 6);
    expect(pn.raw).toBeGreaterThanOrEqual(12);
    expect(w.v.pick(ax, ay)).toEqual(before[0]);
  });

  it('측정: 잘린 B 위를 찍으면 잘린 면 위 점, A 윗면 구석은 꼭짓점(B의 잘린 윗면 구석은 붙잡지 않는다)', () => {
    const w = view();
    w.v.setSections([{ ...CUT_B, caps: 'all' }]);
    w.v.setMeasureMode(true);
    const canvas = w.v.canvas as unknown as FakeElement;
    const click = (p: readonly number[]): void => {
      const [x, y] = at(w, p);
      const e = { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
      canvas.fire('pointerdown', { ...e, buttons: 1 });
      canvas.fire('pointerup', { ...e, buttons: 0 });
    };
    click([70.3, 30.2, 20]);
    click([39.2, 38.9, 20]);
    const pts = w.v.measurePoints;
    expect(pts.length).toBe(2);
    expect(pts[0]!.point[2]).toBeCloseTo(10, 6);
    expect(pts[1]).toMatchObject({ point: [40, 40, 20], snap: 'vertex' });
    // B 윗면 구석(60, 40, 20)은 잘린 쪽 — 그 자리를 찍으면 꼭짓점이 아니라 잘린 면(z = 10) 아래 B 안쪽
    w.v.clearMeasure();
    click([61.2, 37.1, 20]);
    const b = w.v.measurePoints[0]!;
    expect(b.snap).not.toBe('vertex');
    expect(b.point[2]).toBeLessThan(10 + 1e-6);
  });

  it('선분 묶음 구간: 기둥 1(B 위)만 z > 10이 잘린다 — 고르기·그리기', () => {
    const w = view();
    w.v.setRenderMode('shaded');
    w.v.setView('front', false);
    w.v.fit(false);
    const [x0, y0] = at(w, [20, 20, 26]);
    const [x1, y1] = at(w, [80, 20, 26]);
    expect(w.v.pick(x0, y0)).toMatchObject({ kind: 'line', id: '기둥', raw: 0 });
    expect(w.v.pick(x1, y1)).toMatchObject({ kind: 'line', id: '기둥', raw: 1 });
    w.v.setSections([CUT_B]);
    expect(w.v.pick(x0, y0)).toMatchObject({ kind: 'line', id: '기둥', raw: 0 });
    expect(w.v.pick(x1, y1)?.kind).not.toBe('line');
    // 선분 그리기: 갈래마다(선분 0 — 평면 0개, 선분 1 — 평면 하나)
    const lines = frame(w).filter((e) => e.op === 'drawArrays' && e.args[0] === K(w, 'LINES') && uni(e, 'u_nclip') !== undefined);
    expect(lines.map((e) => [e.args[1], e.args[2], (uni(e, 'u_nclip') as number[])[0]])).toEqual([
      [0, 2, 0],
      [2, 2, 1],
    ]);
  });

  it('단면 테두리: 구간(B)의 삼각형만 — 묶음 통째로 자르면 A·B 둘 다', () => {
    const w = view();
    const lines = (): number => (w.v as unknown as { renderer: { cutSeg: { n: number } | null } }).renderer.cutSeg?.n ?? 0;
    w.v.setSections([CUT_B]);
    frame(w);
    const one = lines();
    expect(one).toBeGreaterThan(0);
    w.v.setSections([{ normal: [0, 0, 1], offset: 10, items: ['판'] }]);
    frame(w);
    expect(lines()).toBe(one * 2);
    // 테두리를 끄면 없음
    w.v.setSections([{ ...CUT_B, outline: false }]);
    frame(w);
    expect(lines()).toBe(0);
  });

  it('잘린 면 채우기: 구간 갈래만 홀짝을 세고(B의 삼각형 12개) 채운 면 하나', () => {
    const w = view();
    w.v.setSections([{ ...CUT_B, caps: 'all' }]);
    const d = frame(w);
    // 홀짝 그리기(CLIP 변종 — u_clip) = B 구간만
    const stencil = d.filter((e) => e.op === 'drawElements' && uni(e, 'u_clip') !== undefined && uni(e, 'u_nclip') === undefined);
    expect(stencil.map((e) => [e.args[1], e.args[3]])).toEqual([[36, 144]]);
    expect(d.filter((e) => e.op === 'drawArrays' && e.args[0] === K(w, 'TRIANGLE_FAN')).length).toBe(1);
    // 묶음 통째면 그물 통째로 한 번 홀짝
    w.v.setSections([{ normal: [0, 0, 1], offset: 10, items: ['판'], caps: 'all' }]);
    const d2 = frame(w);
    expect(d2.filter((e) => e.op === 'drawElements' && uni(e, 'u_clip') !== undefined && uni(e, 'u_nclip') === undefined).map((e) => [e.args[1], e.args[3]])).toEqual([[72, 0]]);
  });

  it('두 평면: 모형 전체 평면(x > 90) + 구간 평면 — 갈래마다 평면 합, 모형 평면의 채운 면은 갈래마다', () => {
    const w = view();
    w.v.setSections([{ normal: [1, 0, 0], offset: 90, caps: 'all' }, { ...CUT_B, caps: 'all' }]);
    const f = faceDraws(w, frame(w));
    expect(f.map((x) => x.slice(0, 3))).toEqual([
      [36, 0, 1],
      [36, 144, 2],
    ]);
    const d = frame(w);
    // 갈래 단위의 범위는 그 갈래 정점의 범위: 평면 0(x > 90)은 A 갈래(x 0~40)에 걸치지 않아 B 갈래만, 평면 1(z > 10)도 B 갈래 — 채운 면 둘
    expect(d.filter((e) => e.op === 'drawArrays' && e.args[0] === K(w, 'TRIANGLE_FAN')).length).toBe(2);
    // 홀짝 그리기: 평면마다 B 갈래(12~23)만
    const stencil = d.filter((e) => e.op === 'drawElements' && uni(e, 'u_clip') !== undefined && uni(e, 'u_nclip') === undefined);
    expect(stencil.map((e) => [e.args[1], e.args[3], (uni(e, 'u_clip') as number[]).join()])).toEqual([
      [36, 144, '1,0,0,-90'],
      [36, 144, '0,0,1,-10'],
    ]);
    // B의 x > 90·z > 10 모두 잘린 자리: 위에서 누르면 z = 10 잘린 면(x ≤ 90 쪽)
    const [bx, by] = at(w, [70.3, 30.2, 20]);
    expect(w.v.pick(bx, by)!.point[2]).toBeCloseTo(10, 6);
  });

  it('숨긴 구간과 함께: 숨긴 삼각형은 어느 갈래에도 그리지 않는다', () => {
    const w = view();
    w.v.setSections([CUT_B]);
    w.v.setHiddenRanges('판', [{ start: 10, count: 4 }]);
    expect(faceDraws(w, frame(w)).map((x) => x.slice(0, 3))).toEqual([
      [30, 0, 0],
      [30, 168, 1],
    ]);
    // 강조 구간도 갈래마다(갈래 0: 강조 0~11 / 갈래 1: 보통 14~23 → 강조 12~13)
    w.v.setHiddenRanges('판', null);
    w.v.highlightRanges({ 판: [{ start: 0, count: 14 }] });
    expect(faceDraws(w, frame(w)).map((x) => x.slice(0, 3))).toEqual([
      [36, 0, 0],
      [30, 168, 1],
      [6, 144, 1],
    ]);
  });

  it('윤곽선 구간(edges: true): 그 윤곽선만 자른다 — 주지 않으면 윤곽선은 통째 평면만', () => {
    const w = view('shadedEdges');
    w.v.setSections([CUT_B]);
    const thin = (): [number, number, number][] =>
      frame(w)
        .filter((e) => e.op === 'drawArrays' && e.args[0] === K(w, 'LINES') && uni(e, 'u_nclip') !== undefined)
        .map((e) => [e.args[1]!, e.args[2]!, (uni(e, 'u_nclip') as number[])[0]!]);
    // 윤곽선 24개(A 12 + B 12)는 통째 평면만(평면 0개) 한 번, 기둥 선분은 갈래마다
    expect(thin()).toContainEqual([0, 48, 0]);
    w.v.setSections([{ ...CUT_B, items: [...CUT_B.items, { id: '판', start: 12, count: 12, edges: true }] }]);
    const t = thin();
    expect(t).toContainEqual([0, 24, 0]);
    expect(t).toContainEqual([24, 24, 1]);
  });

  it('인스턴싱: 구간 단면이 있으면 그물마다(같은 그물 12자리 — 구간 단면을 지우면 다시 모은다)', () => {
    const a = boxMesh('a', [-5, -5, 0], [5, 5, 10], [0.6, 0.7, 0.8, 1]);
    const meshes: Mesh3d[] = [];
    for (let i = 0; i < 12; i++) meshes.push({ ...a, id: `a${i}`, name: `a${i}`, matrix: placeAt((i % 4) * 30, Math.floor(i / 4) * 30, 0, i * 30, i % 2 === 1) });
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false, renderMode: 'shaded', grid: false });
    views.push(v);
    v.setScene({ name: 'm', units: 'mm', meshes, lines: [] });
    v.renderNow();
    expect(v.stats.instanced).toMatchObject({ draws: 1, items: 12 });
    v.setSections([{ normal: [0, 0, 1], offset: 5, items: [{ id: 'a3', start: 0, count: 6 }], caps: 'none', outline: false }]);
    v.renderNow();
    expect(v.stats.instanced).toMatchObject({ draws: 0, items: 0 });
    // a3만 두 갈래(그리기 둘), 나머지 11자리는 하나씩
    expect(v.stats.drawCalls).toBe(13);
    v.setSections(null);
    v.renderNow();
    expect(v.stats.instanced).toMatchObject({ draws: 1, items: 12 });
  });

  it('장면을 바꾸면(keepView 아님) 단면과 함께 꺼지고, setMesh로 삼각형이 줄면 쓸 때 자른다', () => {
    const w = view();
    w.v.setSections([CUT_B]);
    expect(faceDraws(w, frame(w)).length).toBe(2);
    // B를 뺀 그물(삼각형 12개)로 바꾸면 구간 12~23은 묶음 밖 — 갈래가 없어 0.43.0 길(평면 0개 한 번)
    const m = mergedPlate();
    w.v.setMesh({ ...m, indices: m.indices!.slice(0, 36) });
    expect(faceDraws(w, frame(w))).toEqual([[36, 0, 0, [0, 0, 0, 0]]]);
    w.v.setScene(scene());
    expect(w.v.sections).toEqual([]);
  });
});
