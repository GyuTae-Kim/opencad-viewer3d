/**
 * 0.105.0 한도(PICK_PREVIEW_MAX_TRIS 4,096)를 넘고 테두리가 없는 닫힌 면의 표식(107차 — STEP README 남은 한계): 0.56.0부터 한도를 넘는 면은 칠하지 않고 면 전체로 센
 * 테두리만 긋는데, 구 전체·원환처럼 B-rep 면 하나가 닫혀 테두리 변이 없으면 0.104.0은 가상 커서·setPickPreview로 그 면을 가리켜도 덧그림에 아무것도 그리지 않았다
 * (칠 없음·빈 경로 긋기뿐 — moveTo 수가 면 표식 없는 덧그림과 같다).
 * 이제 그런 면만 면 전체에서 고르게 고른 삼각형(FaceOutline.sparse — 면 차례로 ⌈면 삼각형 수 / 한도⌉개마다 하나, 한도까지)을 한도 아래 칠과 같은 꼴로 칠한다.
 *  - pickpreview: 앱 구간(rangesFace)·같은 평면 면(planarFace — 끝까지 넓혀 본 면만)이 한도를 넘고 테두리가 비면 sparse.
 *    그 밖(한도 안·테두리 있음·넓혀 볼 한도에서도 끝나지 않은 같은 평면)은 sparse가 없다(0.104.0과 같은 값)
 *  - 뷰어: 닫힌 면은 칠 한 번(sparse 삼각형 — 면의 화면 범위를 거의 다 덮는다). 한도 안 닫힌 면·한도를 넘고 테두리 있는 면은 0.104.0과 같은 칠·긋기·moveTo 수
 *  - 면 셈 기억(0.96.0): sparse는 카메라와 상관없어 기억에 함께 담긴다 — 같은 면이면 다시 세지 않는다
 * 장면: 반지름 50 구(경도 64 × 위도 41 띠 — 삼각형 5,120개, 위치가 같은 꼭짓점은 하나)·작은 구(1,280개)·60 × 60 칸 격자(7,200개), 위에서 본다(가짜 DOM·가짜 WebGL)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { Viewer3d } from '../src/viewer';
import { PICK_PREVIEW_MAX_TRIS, planarFace, rangesFace } from '../src/pickpreview';
import type { Mesh3d, Pick3d } from '../src/types';

/** 면 셈 부름 수(뷰어는 면 셈 조각을 import()로 받는다 — 그 조각을 감싼다) */
const calls = vi.hoisted(() => ({ ranges: 0, planar: 0 }));
vi.mock('../src/pickpreview', async (importOriginal) => {
  const m = await importOriginal<typeof import('../src/pickpreview')>();
  return {
    ...m,
    rangesFace: (...a: Parameters<typeof m.rangesFace>) => {
      calls.ranges++;
      return m.rangesFace(...a);
    },
    planarFace: (...a: Parameters<typeof m.planarFace>) => {
      calls.planar++;
      return m.planarFace(...a);
    },
  };
});
const resetCalls = (): void => void (calls.ranges = calls.planar = 0);

type Geo = { positions: Float32Array; indices: Uint32Array | undefined };

/** 삼각형 목록(꼭짓점 셋 — 좌표 9개)을 그물로: 위치가 같은 꼭짓점은 하나(split이면 삼각형마다 따로) */
function meshOfTris(tris: number[][], split: boolean): Geo {
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

/**
 * 반지름 r 구(경도 nLon × 위도 nLat 띠, 극 둘 — 삼각형 2·nLon·(nLat − 1)개, 바깥 감김). 차례: 위 극 부채 → 띠마다 칸(삼각형 둘)씩 → 아래 극 부채.
 * 이음매(경도 nLon = 0)와 극은 같은 좌표라 닫힌 면이다(변마다 삼각형 둘)
 */
function sphere(nLon: number, nLat: number, r: number, split = false): Geo {
  const f = Math.fround;
  const pt = (i: number, j: number): number[] => {
    if (i === 0) return [0, 0, r];
    if (i === nLat) return [0, 0, -r];
    const th = (Math.PI * i) / nLat, ph = (2 * Math.PI * (j % nLon)) / nLon;
    return [f(r * Math.sin(th) * Math.cos(ph)), f(r * Math.sin(th) * Math.sin(ph)), f(r * Math.cos(th))];
  };
  const tris: number[][] = [];
  for (let j = 0; j < nLon; j++) tris.push([...pt(0, 0), ...pt(1, j), ...pt(1, j + 1)]);
  for (let i = 1; i < nLat - 1; i++)
    for (let j = 0; j < nLon; j++) {
      tris.push([...pt(i, j), ...pt(i + 1, j), ...pt(i + 1, j + 1)]);
      tris.push([...pt(i, j), ...pt(i + 1, j + 1), ...pt(i, j + 1)]);
    }
  for (let j = 0; j < nLon; j++) tris.push([...pt(nLat, 0), ...pt(nLat - 1, j + 1), ...pt(nLat - 1, j)]);
  return meshOfTris(tris, split);
}

/** z = 0 평면의 n × n 칸 격자(칸마다 삼각형 둘). twoSided면 뒤집은 감김의 삼각형을 뒤에 한 벌 더(변마다 앞뒤 삼각형이 함께 써 테두리가 없다) */
function sheet(n: number, twoSided: boolean): Geo {
  const tris: number[][] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      tris.push([i, j, 0, i + 1, j, 0, i + 1, j + 1, 0]);
      tris.push([i, j, 0, i + 1, j + 1, 0, i, j + 1, 0]);
    }
  if (twoSided) for (const t of tris.slice()) tris.push([...t.slice(0, 3), ...t.slice(6, 9), ...t.slice(3, 6)]);
  return meshOfTris(tris, false);
}

const BIG = sphere(64, 41, 50);
const SMALL = sphere(32, 21, 50);
const GRID = sheet(60, false);

describe('0.105.0 한도를 넘는 닫힌 면의 고르게 고른 칠(pickpreview.ts)', () => {
  it('구 전체(5,120개 — 한도를 넘고 테두리 없음): rangesFace는 capped·테두리 0개에 sparse = 면 차례로 2개마다 하나(2,560개, 구 전체에 흩어짐) — 나눈 꼭짓점도 같다', () => {
    expect(PICK_PREVIEW_MAX_TRIS).toBe(4096);
    for (const split of [false, true]) {
      const g = sphere(64, 41, 50, split);
      const f = rangesFace(g.positions, g.indices, [{ start: 0, count: 5120 }])!;
      expect(f.capped).toBe(true);
      expect(f.edges.length).toBe(0);
      expect(f.tris.length).toBe(PICK_PREVIEW_MAX_TRIS);
      expect(f.sparse).toEqual(Array.from({ length: 2560 }, (_, i) => i * 2));
      // 구 전체에 흩어진다: 팔분공간 여덟 모두, 위·아래 극 둘레까지
      const oct = new Set<number>();
      let zl = Infinity, zh = -Infinity;
      for (const t of f.sparse!) {
        const c = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          const v = g.indices ? g.indices[t * 3 + k]! : t * 3 + k;
          for (let i = 0; i < 3; i++) c[i]! += g.positions[v * 3 + i]! / 3;
        }
        oct.add((c[0]! > 0 ? 1 : 0) + (c[1]! > 0 ? 2 : 0) + (c[2]! > 0 ? 4 : 0));
        zl = Math.min(zl, c[2]!);
        zh = Math.max(zh, c[2]!);
      }
      expect(oct.size).toBe(8);
      expect(zl).toBeLessThan(-45);
      expect(zh).toBeGreaterThan(45);
    }
    // 구간이 나뉘어도 면 차례(구간 차례)로 2개마다 하나
    const two = rangesFace(BIG.positions, BIG.indices, [{ start: 2560, count: 2560 }, { start: 0, count: 2560 }])!;
    expect(two.edges.length).toBe(0);
    expect(two.sparse).toEqual([...Array.from({ length: 1280 }, (_, i) => 2560 + i * 2), ...Array.from({ length: 1280 }, (_, i) => i * 2)]);
    // 같은 평면 면(앱 구간 없음)은 맞은 칸 하나(삼각형 둘 — 한도 안)
    const p = planarFace(BIG.positions, BIG.indices, 1000)!;
    expect(p.capped).toBe(false);
    expect('sparse' in p).toBe(false);
  });

  it('평면 앞뒤 한 벌(40 × 40 칸 — 6,400개, 테두리 없음): planarFace도 끝까지 넓혀 본 면이면 sparse. 넓혀 볼 한도에서 끝나지 않은 면은 0.104.0 그대로 sparse 없음', () => {
    const g = sheet(40, true);
    const f = planarFace(g.positions, g.indices, 0)!;
    expect(f.capped).toBe(true);
    expect(f.edges.length).toBe(0);
    expect(f.tris.length).toBe(PICK_PREVIEW_MAX_TRIS);
    expect(f.sparse!.length).toBe(3200);
    expect(new Set(f.sparse).size).toBe(3200);
    for (const t of f.sparse!) expect(t >= 0 && t < 6400).toBe(true);
    // 판 전체에 흩어진다: 10 × 10 칸 묶음 열여섯 모두에 고른 삼각형이 있다(앞뒤는 같은 자리라 가리지 않는다)
    const blocks = new Set<number>();
    for (const t of f.sparse!) {
      let cx = 0, cy = 0;
      for (let k = 0; k < 3; k++) {
        const v = g.indices![t * 3 + k]!;
        cx += g.positions[v * 3]! / 3;
        cy += g.positions[v * 3 + 1]! / 3;
      }
      blocks.add(Math.floor(cx / 10) * 4 + Math.floor(cy / 10));
    }
    expect(blocks.size).toBe(16);
    // 한도 64(넓혀 볼 한도 1,024)로 한 겹 격자 가운데에서: 끝나지 않아 테두리가 비어도 면 끝을 모른다 — sparse 없음(0.104.0과 같은 값)
    const one = sheet(40, false);
    const mid = (20 * 40 + 20) * 2;
    const c = planarFace(one.positions, one.indices, mid, 64)!;
    expect(c.capped).toBe(true);
    expect(c.tris.length).toBe(64);
    expect(c.edges.length).toBe(0);
    expect('sparse' in c).toBe(false);
  });

  it('한도 안의 닫힌 면·한도를 넘고 테두리 있는 면은 sparse 없음(0.104.0과 같은 값)', () => {
    const s = rangesFace(SMALL.positions, SMALL.indices, [{ start: 0, count: 1280 }])!;
    expect(s.capped).toBe(false);
    expect(s.edges.length).toBe(0);
    expect(s.tris).toEqual(Array.from({ length: 1280 }, (_, i) => i));
    expect('sparse' in s).toBe(false);
    const r = rangesFace(GRID.positions, GRID.indices, [{ start: 0, count: 7200 }])!;
    expect(r.capped).toBe(true);
    expect(r.edges.length).toBe(240 * 6);
    expect('sparse' in r).toBe(false);
    const p = planarFace(GRID.positions, GRID.indices, 3601)!;
    expect(p.capped).toBe(true);
    expect(p.edges.length).toBe(240 * 6);
    expect('sparse' in p).toBe(false);
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

const meshOf = (id: string, g: Geo): Mesh3d => ({ id, positions: g.positions, indices: g.indices, color: [0.6, 0.6, 0.6, 1] });
function make(m: Mesh3d, target: [number, number, number]): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene({ name: 'c', units: 'mm', meshes: [m], lines: [] });
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target });
  v.renderNow();
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
function key(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
  v.renderNow();
}
const hiOf = (v: Viewer3d): string => (v as unknown as { theme: { highlight: string } }).theme.highlight;
/** 덧그림 한 번 그리기의 강조 색 칠하기·긋기 수와 moveTo 수 */
function marks(v: Viewer3d): { fills: number; strokes: number; moves: number } {
  const hi = hiOf(v);
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
/** 덧그림 한 번 그리기의 ctx 호출·값 넣기 기록 */
function trace(v: Viewer3d): string[] {
  const o = v as unknown as { octx: CanvasRenderingContext2D };
  const real = o.octx as unknown as Record<string | symbol, unknown>;
  const log: string[] = [];
  o.octx = new Proxy(real, {
    get: (t, k) => {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]): unknown => {
        log.push(`${String(k)}(${a.join(',')})`);
        return (x as (...b: unknown[]) => unknown).apply(t, a);
      };
    },
    set: (t, k, val) => {
      log.push(`${String(k)}=${String(val)}`);
      t[k] = val;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  v.renderNow();
  o.octx = real as unknown as CanvasRenderingContext2D;
  return log;
}
/** 강조 색으로 칠한 경로(그 fill 앞 beginPath부터)의 삼각형 수(moveTo)와 화면 범위. 칠이 없으면 null */
function fillBox(v: Viewer3d): { n: number; x0: number; x1: number; y0: number; y1: number } | null {
  const log = trace(v);
  const hi = `fillStyle=${hiOf(v)}`;
  const f = log.findIndex((s, i) => s === 'fill()' && log[i - 1] === hi);
  if (f < 0) return null;
  const out = { n: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const s of log.slice(log.lastIndexOf('beginPath()', f), f)) {
    const m = /^(moveTo|lineTo)\(([^,]+),([^,]+)\)$/.exec(s);
    if (!m) continue;
    if (m[1] === 'moveTo') out.n++;
    const x = Number(m[2]), y = Number(m[3]);
    out.x0 = Math.min(out.x0, x);
    out.x1 = Math.max(out.x1, x);
    out.y0 = Math.min(out.y0, y);
    out.y1 = Math.max(out.y1, y);
  }
  return out;
}
/** 반지름 50 구(가운데 원점)의 적도 화면 범위 */
function sphereBox(v: Viewer3d): { x0: number; x1: number; y0: number; y1: number } {
  const s = [[-50, 0, 0], [50, 0, 0], [0, -50, 0], [0, 50, 0]].map((p) => v.project(p as [number, number, number])!);
  return { x0: Math.min(...s.map((q) => q.x)), x1: Math.max(...s.map((q) => q.x)), y0: Math.min(...s.map((q) => q.y)), y1: Math.max(...s.map((q) => q.y)) };
}
/** 칠한 범위가 구의 화면 범위를 가로·세로 90% 넘게 덮고 그 밖으로 크게 나가지 않는다 */
function expectCovers(b: { x0: number; x1: number; y0: number; y1: number }, s: { x0: number; x1: number; y0: number; y1: number }): void {
  const w = s.x1 - s.x0, h = s.y1 - s.y0;
  expect(w).toBeGreaterThan(200);
  expect(b.x1 - b.x0).toBeGreaterThan(w * 0.9);
  expect(b.y1 - b.y0).toBeGreaterThan(h * 0.9);
  expect(b.x0).toBeGreaterThan(s.x0 - w * 0.1);
  expect(b.x1).toBeLessThan(s.x1 + w * 0.1);
  expect(b.y0).toBeGreaterThan(s.y0 - h * 0.1);
  expect(b.y1).toBeLessThan(s.y1 + h * 0.1);
}
/** 면 셈 조각(뷰어의 import())이 와서 면 표식이 그려질 때까지 이벤트 고리를 돌린다(setTimeout을 가짜로 두므로 setImmediate로) */
async function ready(v: Viewer3d): Promise<void> {
  for (let i = 0; i < 400 && marks(v).strokes === 0; i++) await new Promise((r) => setImmediate(r));
}
function pickAt(v: Viewer3d, p: [number, number, number], id: string): Pick3d {
  const s = v.project(p)!;
  const k = v.pick(s.x, s.y)!;
  expect(k).toMatchObject({ kind: 'mesh', id });
  return k;
}

describe('0.105.0 뷰어 — 한도를 넘는 닫힌 면의 표식', () => {
  it('가상 커서(facePreview·faceRanges = 구 전체 5,120개): 칠 한 번 — 고르게 고른 2,560개가 구의 화면 범위를 덮는다(0.104.0은 면 표식 없는 커서 덧그림과 같았다). 같은 면의 다른 삼각형으로 옮겨도 rangesFace 한 번', async () => {
    const target: [number, number, number] = [3.3, 4.1, 0];
    // 견줄 덧그림: 같은 자리 가상 커서(면 표식 없음)
    const n = make(meshOf('B', BIG), target);
    n.setKeyboardSnap({});
    key(n, 'Enter');
    const none = marks(n);
    expect(none.fills).toBe(0);
    const v = make(meshOf('B', BIG), target);
    v.setKeyboardSnap({ pickCycle: { facePreview: true, faceRanges: () => [{ start: 0, count: 5120 }] } });
    resetCalls();
    key(v, 'Enter');
    await ready(v);
    const cur = (): Pick3d => {
      const kc = (v as unknown as { keyCur: { index: number; picks: { pick: Pick3d }[] } }).keyCur;
      return kc.picks[kc.index]!.pick;
    };
    expect(cur()).toMatchObject({ kind: 'mesh', id: 'B' });
    const a = marks(v);
    expect(a).toMatchObject({ fills: 1, strokes: 1 });
    expect(a.moves - none.moves).toBe(2560);
    const box = fillBox(v)!;
    expect(box.n).toBe(2560);
    expectCovers(box, sphereBox(v));
    const tris = new Set<number>([cur().index]);
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown']) {
      key(v, k);
      expect(cur()).toMatchObject({ kind: 'mesh', id: 'B' });
      tris.add(cur().index);
      expect(marks(v)).toEqual(a);
    }
    expect(tris.size).toBeGreaterThan(1);
    expect(calls).toEqual({ ranges: 1, planar: 0 });
  });

  it('setPickPreview(구 전체 구간)도 같은 칠(끄면 없음)', async () => {
    const b = make(meshOf('B', BIG), [3.3, 4.1, 0]);
    const bn = marks(b);
    const pb = pickAt(b, [3.3, 4.1, 49.7], 'B');
    b.setPickPreview(pb, { ranges: [{ start: 0, count: 5120 }] });
    await ready(b);
    const m = marks(b);
    expect(m).toMatchObject({ fills: 1, strokes: 1 });
    expect(m.moves - bn.moves).toBe(2560);
    expectCovers(fillBox(b)!, sphereBox(b));
    b.setPickPreview(null);
    expect(marks(b)).toEqual(bn);
  });

  it('한도 안 구(1,280개 — 모두 칠, 테두리 없음)·한도를 넘고 테두리 있는 격자(구간·같은 평면 — 칠 없이 둘레 240변)는 0.104.0과 같은 칠·긋기·moveTo 수', async () => {
    const s = make(meshOf('S', SMALL), [3.3, 4.1, 0]);
    const sn = marks(s);
    s.setPickPreview(pickAt(s, [3.3, 4.1, 49.7], 'S'), { ranges: [{ start: 0, count: 1280 }] });
    await ready(s);
    const sm = marks(s);
    expect(sm).toMatchObject({ fills: 1, strokes: 1 });
    expect(sm.moves - sn.moves).toBe(1280);

    const g = make(meshOf('G', GRID), [30.3, 30.6, 0]);
    const gn = marks(g);
    const pg = pickAt(g, [30.3, 30.6, 0], 'G');
    for (const opts of [{ ranges: [{ start: 0, count: 7200 }] }, {}]) {
      g.setPickPreview(pg, opts);
      const gm = marks(g);
      expect(gm).toMatchObject({ fills: 0, strokes: 1 });
      expect(gm.moves - gn.moves).toBe(240 * 2);
      expect(fillBox(g)).toBeNull();
    }
  });
});
