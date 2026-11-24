/**
 * 0.96.0 면 표식 기억(faceMemo)의 열쇠(97차 관찰): 앱 구간(pickCycle.faceRanges·setPickPreview ranges)이 있으면 면 셈(rangesFace)은 맞은 삼각형과 상관없는데
 * 0.95.0은 열쇠에 맞은 삼각형 번호를 넣어, 가상 커서·미리 강조가 같은 면의 새 삼각형을 맞힐 때마다 경계 변을 다시 셌다(한도를 넘는 면은 boundaryOf까지).
 * 이제 앱 구간이면 열쇠는 그물 배열 + 구간 내용이다 — 같은 면은 한 번만 센다. 셈 수는 면 셈 조각을 감싸 rangesFace·planarFace 부름 수로 센다(가짜 DOM·가짜 WebGL).
 *  - 그린 표식은 0.95.0과 같다(같은 순수 함수에 같은 입력): 칠하기·긋기·moveTo 수, 그 그물로 새로 만든 뷰어와 덧그림 호출이 같다
 *  - 앱 구간이 없으면(같은 평면으로 이어진 삼각형) 0.95.0 그대로 맞은 삼각형마다 센다
 *  - 낡은 기억 없음: 구간이 바뀌면·새 배열로 setMesh·setScene이면 다시 세고, 제자리 고침(setMesh vertices)이면 그 위치 배열의 기억을 버린다
 *    (0.95.0은 같은 삼각형을 다시 맞히면 고치기 전 테두리를 그렸다 — 열쇠가 넓어져 낡은 테두리가 같은 면 다른 삼각형으로 번지지 않게)
 * 장면: z = 0 평면 100 × 100 칸 격자(삼각형 20,000개 — 한 앱 면, 한도 4,096을 넘는다) + 세운 벽 삼각형 하나, 위에서 본다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { Viewer3d } from '../src/viewer';
import type { IndexRange } from '../src/ranges';
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

/** z = 0 평면의 n × n 칸 격자(칸마다 삼각형 둘, 줄마다 2n개) + 한 변에 세운 벽 삼각형 하나(같은 평면 아님), x로 dx 옮김 */
function grid(n: number, dx = 0): { positions: Float32Array; indices: Uint32Array } {
  const tris: number[][] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      tris.push([i, j, 0, i + 1, j, 0, i + 1, j + 1, 0]);
      tris.push([i, j, 0, i + 1, j + 1, 0, i, j + 1, 0]);
    }
  tris.push([0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const keys = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  for (const t of tris)
    for (let k = 0; k < 3; k++) {
      const p = [t[k * 3]! + dx, t[k * 3 + 1]!, t[k * 3 + 2]!];
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
const meshOf = (id: string, g: { positions: Float32Array; indices: Uint32Array }, matrix?: Float64Array): Mesh3d => ({
  id,
  positions: g.positions,
  indices: g.indices,
  color: [0.6, 0.6, 0.6, 1],
  ...(matrix ? { matrix } : {}),
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

const G = grid(100);
const FACE: IndexRange = { start: 0, count: 20_000 };
const ROW: IndexRange = { start: 200 * 50, count: 200 };

function make(meshes: Mesh3d[], target: [number, number, number] = [50.3, 50.6, 0]): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene({ name: 'g', units: 'mm', meshes, lines: [] });
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
/** 덧그림 한 번 그리기의 ctx 호출·값 넣기 기록(그 그물로 새로 만든 뷰어와 견준다) */
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

describe('0.96.0 면 표식 기억 — 앱 구간이면 같은 면은 한 번만 센다', () => {
  it('가상 커서: 같은 앱 면(한도를 넘는 20,000개)의 삼각형 여섯을 차례로 맞혀도 rangesFace 한 번(0.95.0은 여섯 번), 표식은 매 걸음 둘레 400변', async () => {
    // 견줄 덧그림: 같은 자리 가상 커서(면 표식 없음)
    const n = make([meshOf('G', G)]);
    n.setKeyboardSnap({});
    key(n, 'Enter');
    const none = marks(n);
    expect(none.fills).toBe(0);
    const v = make([meshOf('G', G)]);
    // 앱 함수는 부를 때마다 새 배열을 준다(같은 내용이면 같은 열쇠)
    let asked = 0;
    v.setKeyboardSnap({ pickCycle: { facePreview: true, faceRanges: () => (asked++, [{ ...FACE }]) } });
    resetCalls();
    key(v, 'Enter');
    await ready(v);
    const cur = (): Pick3d => {
      const kc = (v as unknown as { keyCur: { index: number; picks: { pick: Pick3d }[] } }).keyCur;
      return kc.picks[kc.index]!.pick;
    };
    const tris = new Set<number>([cur().index]);
    for (const k of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft']) {
      key(v, k);
      expect(cur()).toMatchObject({ kind: 'mesh', id: 'G' });
      tris.add(cur().index);
      const m = marks(v);
      expect(m).toMatchObject({ fills: 0, strokes: 1 });
      expect(m.moves - none.moves).toBe(400 * 2);
    }
    expect(tris.size).toBe(6);
    expect(asked).toBeGreaterThan(6);
    expect(calls).toEqual({ ranges: 1, planar: 0 });
  });

  it('setPickPreview: 같은 면의 다른 삼각형·같은 내용의 새 구간 배열이면 한 번(표식 같음), 구간이 바뀌면 다시 세고 돌아오면 기억에서', async () => {
    const v = make([meshOf('G', G)]);
    const none = marks(v);
    const ps = [pickAt(v, [50.3, 50.6, 0], 'G'), pickAt(v, [30.3, 70.6, 0], 'G'), pickAt(v, [70.6, 20.3, 0], 'G')];
    expect(new Set(ps.map((p) => p.index)).size).toBe(3);
    resetCalls();
    v.setPickPreview(ps[0]!, { ranges: [{ ...FACE }] });
    await ready(v);
    const a = marks(v);
    expect(a).toMatchObject({ fills: 0, strokes: 1 });
    expect(a.moves - none.moves).toBe(400 * 2);
    for (const p of [ps[1]!, ps[2]!, ps[0]!]) {
      v.setPickPreview(p, { ranges: [{ ...FACE }] });
      expect(marks(v)).toEqual(a);
    }
    expect(calls.ranges).toBe(1);
    // 구간이 바뀌면(한 줄 — 한도 안) 다시 세어 그 줄을 칠하고 둘레 202변
    v.setPickPreview(ps[1]!, { ranges: [{ ...ROW }] });
    const r = marks(v);
    expect(r).toMatchObject({ fills: 1, strokes: 1 });
    expect(r.moves - none.moves).toBe(200 + 202 * 2);
    v.setPickPreview(ps[2]!, { ranges: [{ ...ROW }] });
    expect(marks(v)).toEqual(r);
    expect(calls.ranges).toBe(2);
    // 앞 구간으로 돌아오면 기억에서(넷까지)
    v.setPickPreview(ps[2]!, { ranges: [{ ...FACE }] });
    expect(marks(v)).toEqual(a);
    expect(calls).toEqual({ ranges: 2, planar: 0 });
  });

  it('앱 구간이 없으면 0.95.0 그대로 맞은 삼각형마다 센다(같은 삼각형은 기억에서)', async () => {
    const v = make([meshOf('G', G)]);
    const none = marks(v);
    const p1 = pickAt(v, [50.3, 50.6, 0], 'G'), p2 = pickAt(v, [30.3, 70.6, 0], 'G');
    resetCalls();
    v.setPickPreview(p1);
    await ready(v);
    const a = marks(v);
    expect(a).toMatchObject({ fills: 0, strokes: 1 });
    expect(a.moves - none.moves).toBe(400 * 2);
    v.setPickPreview(p2);
    expect(marks(v)).toEqual(a);
    v.setPickPreview(p1);
    expect(marks(v)).toEqual(a);
    expect(calls).toEqual({ ranges: 0, planar: 2 });
  });

  it('낡은 기억 없음: 새 배열로 setMesh·제자리 고침(vertices)·setScene이면 다시 세고, 그린 덧그림은 그 그물로 새로 만든 뷰어와 같다', async () => {
    const g1 = grid(100);
    const A = make([meshOf('G', g1)]);
    const p = pickAt(A, [50.3, 50.6, 0], 'G');
    /** A와 같은 카메라로 그 그물(값이 같은 새 배열)을 처음 받은 뷰어의 덧그림(같은 후보·같은 구간) */
    const fresh = (g: { positions: Float32Array; indices: Uint32Array }, ranges: IndexRange[] | null): string[] => {
      const B = make([meshOf('G', { positions: Float32Array.from(g.positions), indices: g.indices })]);
      B.setCamera(A.getCamera());
      B.setPickPreview(p, ranges ? { ranges } : {});
      return trace(B);
    };
    /** A 덧그림 한 번과 그 사이 A의 면 셈 수 */
    const traceA = (): { t: string[]; ranges: number; planar: number } => {
      resetCalls();
      const t = trace(A);
      return { t, ranges: calls.ranges, planar: calls.planar };
    };
    A.setPickPreview(p, { ranges: [{ ...FACE }] });
    await ready(A);
    const t0 = traceA();
    expect(t0).toMatchObject({ ranges: 0, planar: 0 });
    // 새 배열(같은 id — x로 3 옮긴 격자)
    const g2 = grid(100, 3);
    expect(A.setMesh(meshOf('G', g2))).toBe(true);
    const t1 = traceA();
    expect(t1).toMatchObject({ ranges: 1, planar: 0 });
    expect(t1.t).not.toEqual(t0.t);
    expect(t1.t).toEqual(fresh(g2, [{ ...FACE }]));
    // 제자리 고침: 같은 위치 배열을 y로 2 옮기고 vertices로 알린다 — 같은 후보(같은 삼각형)도 고친 뒤 테두리(0.95.0은 고치기 전 테두리)
    for (let i = 1; i < g2.positions.length; i += 3) g2.positions[i]! += 2;
    expect(A.setMesh(meshOf('G', g2), { vertices: { start: 0, count: g2.positions.length / 3 } })).toBe(true);
    const t2 = traceA();
    expect(t2).toMatchObject({ ranges: 1, planar: 0 });
    expect(t2.t).not.toEqual(t1.t);
    expect(t2.t).toEqual(fresh(g2, [{ ...FACE }]));
    // 같은 평면 면(앱 구간 없음)의 기억도 버린다
    A.setPickPreview(p);
    const t3 = traceA();
    expect(t3).toMatchObject({ ranges: 0, planar: 1 });
    expect(t3.t).toEqual(fresh(g2, null));
    for (let i = 1; i < g2.positions.length; i += 3) g2.positions[i]! -= 2;
    expect(A.setMesh(meshOf('G', g2), { vertices: { start: 0, count: g2.positions.length / 3 } })).toBe(true);
    const t4 = traceA();
    expect(t4).toMatchObject({ ranges: 0, planar: 1 });
    expect(t4.t).not.toEqual(t3.t);
    expect(t4.t).toEqual(fresh(g2, null));
    // setScene이면 비운다(같은 배열로 다시 주어도 다시 센다)
    A.setPickPreview(p, { ranges: [{ ...FACE }] });
    A.renderNow();
    expect(traceA()).toMatchObject({ ranges: 0, planar: 0 });
    A.setScene(A.scene!, { keepView: true });
    A.setPickPreview(p, { ranges: [{ ...FACE }] });
    const t5 = traceA();
    expect(t5).toMatchObject({ ranges: 1, planar: 0 });
    expect(t5.t).toEqual(fresh(g2, [{ ...FACE }]));
  });

  it('배열을 함께 쓰는 두 그물은 한 번 센 테두리를 각자 자리에 긋고, 보이기를 끄고 켜도 기억은 그대로(그리지 않을 뿐)', async () => {
    const g = grid(10);
    const R: IndexRange = { start: 0, count: 200 };
    const scene = (): Mesh3d[] => [meshOf('S1', g), meshOf('S2', g, Float64Array.of(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 20, 0, 0, 1))];
    const v = make(scene(), [15, 5, 0]);
    const none = marks(v);
    const p1 = pickAt(v, [5.3, 5.6, 0], 'S1'), p2 = pickAt(v, [22.6, 3.3, 0], 'S2');
    resetCalls();
    v.setPickPreview(p1, { ranges: [{ ...R }] });
    await ready(v);
    const a = marks(v);
    expect(a).toMatchObject({ fills: 1, strokes: 1 });
    expect(a.moves - none.moves).toBe(200 + 40 * 2);
    v.setPickPreview(p2, { ranges: [{ ...R }] });
    const t2 = trace(v);
    v.setPickPreview(p1, { ranges: [{ ...R }] });
    expect(trace(v)).not.toEqual(t2);
    v.setPickPreview(p2, { ranges: [{ ...R }] });
    v.setItemVisible('S2', false);
    expect(marks(v)).toEqual(none);
    v.setItemVisible('S2', true);
    expect(trace(v)).toEqual(t2);
    expect(calls).toEqual({ ranges: 1, planar: 0 });
    // S2 자리에 그었다 — S2 후보를 처음 받은 뷰어와 같다
    const F = make(scene(), [15, 5, 0]);
    F.setCamera(v.getCamera());
    F.setPickPreview(p2, { ranges: [{ ...R }] });
    expect(trace(F)).toEqual(t2);
  });
});
