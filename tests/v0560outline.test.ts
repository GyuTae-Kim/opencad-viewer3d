/**
 * 0.56.0 삼각형 수 한도(PICK_PREVIEW_MAX_TRIS 4,096)를 넘는 면 표식의 테두리(STEP 66차): 0.54.0은 한도까지 담은 삼각형들의 테두리를 그어
 * 잘린 자리 안쪽 변까지 테두리로 나와 큰 B-rep 면이 그물처럼 덮였다.
 *  - rangesFace: 구간이 한도를 넘으면 테두리는 구간의 모든 삼각형으로 센다(칠할 삼각형은 한도까지 — capped)
 *  - planarFace: 같은 평면 면이 한도를 넘으면 한도 × PICK_PREVIEW_OUTLINE_SCALE개까지 더 넓혀 본 면에서 센다. 거기서도 끝나지 않으면
 *    아직 보지 않은 같은 평면 이웃과 맞댄 변은 긋지 않는다(테두리 일부만 — 안쪽 선은 없다)
 *  - 한도 안의 면은 0.54.0과 같은 삼각형·같은 테두리(차례까지)
 *  - 뷰어: 한도에 걸린 면은 칠하지 않고 테두리만 긋는다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { Viewer3d } from '../src/viewer';
import { PICK_PREVIEW_MAX_TRIS, PICK_PREVIEW_OUTLINE_SCALE, planarFace, rangesFace } from '../src/pickpreview';
import type { Mesh3d, Scene3d } from '../src/types';

/** z = 0 평면의 n × n 칸 격자(칸마다 삼각형 둘, 줄마다 2n개 — 줄 j는 삼각형 [2nj, 2n(j+1))) + 한 변에 세운 벽 삼각형 하나(같은 평면 아님). split이면 꼭짓점을 삼각형마다 따로 */
function grid(n: number, split: boolean): { positions: Float32Array; indices: Uint32Array | undefined } {
  const tris: number[][] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      tris.push([i, j, 0, i + 1, j, 0, i + 1, j + 1, 0]);
      tris.push([i, j, 0, i + 1, j + 1, 0, i, j + 1, 0]);
    }
  tris.push([0, 0, 0, 1, 0, 0, 0, 0, 1]);
  if (split) return { positions: Float32Array.from(tris.flat()), indices: undefined };
  const keys = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const p = t.slice(k * 3, k * 3 + 3);
      const key = p.join(',');
      let v = keys.get(key);
      if (v === undefined) {
        keys.set(key, (v = keys.size));
        pos.push(...p);
      }
      idx.push(v);
    }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

/** 테두리 변을 [x0, y0, x1, y1] 글로(차례 없이 견주게 정렬) */
function segs(e: Float64Array): string[] {
  const out: string[] = [];
  for (let i = 0; i < e.length; i += 6) {
    const a = `${e[i]},${e[i + 1]}`, b = `${e[i + 3]},${e[i + 4]}`;
    out.push(a < b ? `${a}|${b}` : `${b}|${a}`);
  }
  return out.sort();
}
/** 직사각형 [0, w] × [0, h]의 둘레 단위 변 */
function rect(w: number, h: number): string[] {
  const out: string[] = [];
  const s = (x0: number, y0: number, x1: number, y1: number): void => {
    const a = `${x0},${y0}`, b = `${x1},${y1}`;
    out.push(a < b ? `${a}|${b}` : `${b}|${a}`);
  };
  for (let i = 0; i < w; i++) {
    s(i, 0, i + 1, 0);
    s(i, h, i + 1, h);
  }
  for (let j = 0; j < h; j++) {
    s(0, j, 0, j + 1);
    s(w, j, w, j + 1);
  }
  return out.sort();
}
/** 0.54.0 셈(담은 삼각형 가운데 한 번만 나오는 변 — 위치로 센다): 한도에 걸린 면에서 잘린 자리 안쪽 변이 나온다 */
function oldOutline(g: { positions: Float32Array; indices: Uint32Array | undefined }, tris: number[]): string[] {
  const P = g.positions, I = g.indices;
  const n = new Map<string, number>();
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const a = I ? I[t * 3 + k]! : t * 3 + k, b = I ? I[t * 3 + ((k + 1) % 3)]! : t * 3 + ((k + 1) % 3);
      const pa = `${P[a * 3]},${P[a * 3 + 1]}`, pb = `${P[b * 3]},${P[b * 3 + 1]}`;
      const key = pa < pb ? `${pa}|${pb}` : `${pb}|${pa}`;
      n.set(key, (n.get(key) ?? 0) + 1);
    }
  return [...n].filter(([, c]) => c === 1).map(([k]) => k);
}

describe('0.56.0 한도를 넘는 면의 테두리(pickpreview.ts)', () => {
  it('앱 구간: 칠할 삼각형은 한도까지, 테두리는 구간 전체 — 잘린 자리 안쪽 변이 없다(색인·나눈 꼭짓점 같은 결과)', () => {
    for (const split of [false, true]) {
      const g = grid(100, split);
      const half = rangesFace(g.positions, g.indices, [{ start: 0, count: 10_000 }])!;
      expect(half.tris.length).toBe(PICK_PREVIEW_MAX_TRIS);
      expect(half.capped).toBe(true);
      // 줄 0~49(100 × 50 직사각형)의 둘레 300변
      expect(segs(half.edges)).toEqual(rect(100, 50));
      // 0.54.0 셈은 담은 4,096개(20줄 남짓)의 테두리 — 잘린 자리 안쪽 변이 나왔다
      const old = oldOutline(g, half.tris);
      expect(old.some((k) => !rect(100, 50).includes(k))).toBe(true);
      const whole = rangesFace(g.positions, g.indices, [{ start: 0, count: 20_000 }])!;
      expect(whole.capped).toBe(true);
      expect(segs(whole.edges)).toEqual(rect(100, 100));
      // 구간이 겹치거나 나뉘어도 같은 면(줄 0~49를 두 구간으로, 겹쳐서)
      const two = rangesFace(g.positions, g.indices, [{ start: 5_000, count: 5_000 }, { start: 0, count: 6_000 }])!;
      expect(segs(two.edges)).toEqual(rect(100, 50));
    }
  });

  it('같은 평면 면: 한도 × 16까지 넓혀 본 면 전체의 테두리 — 그 안에서 끝나면 면 둘레 그대로', () => {
    expect(PICK_PREVIEW_OUTLINE_SCALE).toBe(16);
    for (const split of [false, true]) {
      const g = grid(100, split);
      const f = planarFace(g.positions, g.indices, 0)!;
      expect(f.capped).toBe(true);
      expect(f.tris.length).toBe(PICK_PREVIEW_MAX_TRIS);
      expect(new Set(f.tris).size).toBe(PICK_PREVIEW_MAX_TRIS);
      expect(segs(f.edges)).toEqual(rect(100, 100));
      // 0.54.0 셈은 담은 4,096개의 테두리라 면 안쪽(잘린 자리) 변이 나왔다
      const ring = new Set(rect(100, 100));
      expect(oldOutline(g, f.tris).filter((k) => !ring.has(k)).length).toBeGreaterThan(50);
      // 작은 한도도 같은 셈(3 × 3 격자 18개, 한도 5 — 넓혀 본 80개 안에서 끝난다)
      const s = grid(3, split);
      const c = planarFace(s.positions, s.indices, 0, 5)!;
      expect(c).toMatchObject({ capped: true });
      expect(c.tris.length).toBe(5);
      expect(segs(c.edges)).toEqual(rect(3, 3));
    }
  });

  it('넓혀 봐도 끝나지 않는 아주 큰 같은 평면: 둘레 변만(일부) — 아직 보지 않은 같은 평면 이웃과 맞댄 변은 긋지 않는다', () => {
    const g = grid(200, false);
    const f = planarFace(g.positions, g.indices, 0, 1024)!;
    // 넓혀 볼 한도 16,384 < 면 80,000
    expect(f.capped).toBe(true);
    expect(f.tris.length).toBe(1024);
    const s = segs(f.edges);
    const ring = new Set(rect(200, 200));
    expect(s.length).toBeGreaterThan(0);
    for (const k of s) expect(ring.has(k), k).toBe(true);
    expect(s.length).toBeLessThan(800);
  });

  it('한도 안의 면은 0.54.0과 같은 셈(담은 삼각형 가운데 한 번만 나오는 변)', () => {
    const g = grid(10, false);
    const f = planarFace(g.positions, g.indices, 7)!;
    expect(f.capped).toBe(false);
    expect(f.tris.length).toBe(200);
    expect(segs(f.edges)).toEqual(rect(10, 10));
    expect(segs(f.edges)).toEqual(oldOutline(g, f.tris).sort());
    const r = rangesFace(g.positions, g.indices, [{ start: 0, count: 200 }])!;
    expect(r.capped).toBe(false);
    expect(segs(r.edges)).toEqual(rect(10, 10));
  });
});

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  for (const v of views) v.dispose();
  vi.useRealTimers();
  dom.restore();
});

/** 덧그림 한 번 그리기의 강조 색 칠하기·긋기 수와 moveTo 수 */
function marks(v: Viewer3d): { fills: number; strokes: number; moves: number } {
  const hi = (v as unknown as { theme: { highlight: string } }).theme.highlight;
  const octx = (v as unknown as { octx: Record<string, unknown> }).octx;
  const out = { fills: 0, strokes: 0, moves: 0 };
  const save = { fill: octx.fill, stroke: octx.stroke, moveTo: octx.moveTo };
  octx.fill = (): void => void (octx.fillStyle === hi && out.fills++);
  octx.stroke = (): void => void (octx.strokeStyle === hi && out.strokes++);
  octx.moveTo = (): void => void out.moves++;
  v.renderNow();
  Object.assign(octx, save);
  return out;
}

describe('0.56.0 뷰어 면 표식', () => {
  it('한도에 걸린 면은 칠하지 않고 면 전체 테두리만(바탕 테·강조 두 번), 한도 안의 면은 0.54.0처럼 칠하고 테두리', async () => {
    const g = grid(100, false);
    const m: Mesh3d = { id: 'G', positions: g.positions, indices: g.indices, color: [0.6, 0.6, 0.6, 1] };
    const sc: Scene3d = { name: 'g', units: 'mm', meshes: [m], lines: [] };
    const host = dom.host();
    host.rect = { left: 0, top: 0, width: 800, height: 600 };
    const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
    views.push(v);
    v.setScene(sc);
    v.setView('top', false);
    v.fit(false);
    v.renderNow();
    const s = v.project([50.3, 50.6, 0])!;
    const p = v.pick(s.x, s.y)!;
    expect(p).toMatchObject({ kind: 'mesh', id: 'G' });
    const none = marks(v);
    v.setPickPreview(p, { ranges: [{ start: 0, count: 20_000 }] });
    for (let i = 0; i < 400 && marks(v).strokes === 0; i++) await new Promise((r) => setImmediate(r));
    const a = marks(v);
    expect(a.fills).toBe(0);
    expect(a.strokes).toBe(1);
    expect(a.moves - none.moves).toBe(400 * 2);
    // 한 줄(삼각형 200개 — 한도 안)은 칠하고 그 직사각형 둘레 202변
    v.setPickPreview(p, { ranges: [{ start: 200 * 50, count: 200 }] });
    const b = marks(v);
    expect(b.fills).toBe(1);
    expect(b.moves - none.moves).toBe(200 + 202 * 2);
  });
});
