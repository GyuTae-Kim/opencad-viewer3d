/**
 * 0.97.0 제자리 고침(setMesh의 vertices — 같은 배열 객체의 값을 바꾸고 알림) 뒤 배열 객체를 열쇠로 하는 셈 기억(99차 훑기).
 * 0.96.0은 제자리 고침 때 범위·BVH·면 표식 기억만 버려, 같은 배열을 열쇠로 하는 다음 둘이 고치기 전 값으로 보이는 결과를 냈다(가짜 DOM·가짜 WebGL로 재현).
 *  - 면 셈 조각(pickpreview)의 그물 꼴 기억(같은 위치 꼭짓점 짝·꼭짓점 → 삼각형 목록 — 마지막 그물 하나): 같은 자리에 있던 꼭짓점들이 갈라지거나 모이면
 *    같은 평면 면(planarFace)·앱 구간 테두리(rangesFace — 한도 안은 같은 위치 짝, 한도를 넘으면 이웃 찾기까지)를 낡은 짝으로 셌다(0.54.0부터)
 *  - 정점 색 검사 기억(유한하지 않은 값 수): 깨진 색을 고쳐도 계속 빼고 알림, 멀쩡한 색을 깨도 알림 없이 그 색으로 그렸다(0.50.0부터)
 * 이제 그 배열의 두 기억도 버린다 — 고친 뒤 덧그림·알림·GL 그리기 기록이 그 그물(값이 같은 새 배열)로 새로 만든 뷰어와 같다.
 * 새로 만든 뷰어는 고친 뷰어가 다 센 뒤에 센다(그물 꼴 기억은 모듈에 하나라 먼저 세면 고친 뷰어의 낡은 기억을 덮는다)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry } from './fakegl';
import { Viewer3d } from '../src/viewer';
import type { IndexRange } from '../src/ranges';
import type { SceneIssue } from '../src/sceneissues';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Pick3d } from '../src/types';

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

function make(meshes: Mesh3d[], target: [number, number, number]): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene({ name: 'p', units: 'mm', meshes, lines: [] });
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target });
  v.renderNow();
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 덧그림 한 번 그리기의 강조 색 칠하기·긋기 수와 moveTo 수(칠할 삼각형마다 하나, 테두리 변마다 둘 — 바탕·강조 두 번 긋는다) */
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
/** GL 그리기 한 번의 기록(버퍼 내용 해시·균일 변수 값 — 서로 다른 GPU 객체로 그린 두 뷰어를 값으로 견준다) */
function frame(v: Viewer3d): DrawEntry[] {
  const gl = cv(v).gl!;
  gl.draws = [];
  gl.logDraws = true;
  v.renderNow();
  gl.logDraws = false;
  return gl.draws;
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
/** A와 같은 카메라로 그 그물(값이 같은 새 배열)을 처음 받은 뷰어의 덧그림(같은 후보·같은 구간) */
function fresh(A: Viewer3d, m: Mesh3d, p: Pick3d, ranges: IndexRange[] | null): string[] {
  const B = make([{ ...m, positions: m.positions.slice(), indices: m.indices?.slice() }], A.getCamera().target as [number, number, number]);
  B.setCamera(A.getCamera());
  B.setPickPreview(p, ranges ? { ranges } : {});
  return trace(B);
}

/** 색인 없는 그물: z = 0 평면 삼각형 둘(0: (0,0)-(10,0)-(10,10), 1: (0,0)-(10,10)-(0,10) — 대각선을 위치로만 함께 쓴다), 삼각형 1은 x로 dx */
function pair(dx: number): Mesh3d {
  return { id: 'Q', positions: Float32Array.of(0, 0, 0, 10, 0, 0, 10, 10, 0, dx, 0, 0, 10 + dx, 10, 0, dx, 10, 0), color: [0.6, 0.6, 0.6, 1] };
}
/** 삼각형 1을 제자리에서 x로 d 옮기고 vertices로 알린다 */
function movePair(v: Viewer3d, m: Mesh3d, d: number): void {
  for (let i = 9; i < 18; i += 3) m.positions[i]! += d;
  expect(v.setMesh(m, { vertices: { start: 3, count: 3 } })).toBe(true);
}
const PAIR: IndexRange[] = [{ start: 0, count: 2 }];

describe('0.97.0 제자리 고침 뒤 면 셈 조각의 그물 꼴 기억', () => {
  it('같은 자리 꼭짓점이 갈라지면: 같은 평면 면은 맞은 삼각형 하나(0.96.0은 고치기 전 짝으로 둘), 앱 구간 테두리는 여섯 변(0.96.0은 넷)', async () => {
    const m = pair(0);
    const A = make([m], [5, 5, 0]);
    const none = marks(A);
    const p = pickAt(A, [7, 3, 0], 'Q');
    expect(p.index).toBe(0);
    A.setPickPreview(p);
    await ready(A);
    // 고치기 전: 두 삼각형이 한 면(칠하기 둘 + 테두리 네 변)
    expect(marks(A)).toEqual({ fills: 1, strokes: 1, moves: none.moves + 2 + 4 * 2 });
    movePair(A, m, 20);
    // 고친 뒤 같은 평면 면: 삼각형 0 하나 + 세 변
    const planar = trace(A);
    expect(marks(A)).toEqual({ fills: 1, strokes: 1, moves: none.moves + 1 + 3 * 2 });
    // 앱 구간(두 삼각형): 떨어진 두 삼각형의 여섯 변
    A.setPickPreview(p, { ranges: PAIR });
    const ranged = trace(A);
    expect(marks(A)).toEqual({ fills: 1, strokes: 1, moves: none.moves + 2 + 6 * 2 });
    expect(planar).toEqual(fresh(A, m, p, null));
    expect(ranged).toEqual(fresh(A, m, p, PAIR));
  });

  it('떨어진 꼭짓점이 같은 자리로 모이면: 같은 평면 면은 두 삼각형(0.96.0은 하나), 앱 구간 테두리는 네 변(0.96.0은 여섯)', async () => {
    const m = pair(20);
    const A = make([m], [15, 5, 0]);
    const none = marks(A);
    const p = pickAt(A, [7, 3, 0], 'Q');
    expect(p.index).toBe(0);
    A.setPickPreview(p);
    await ready(A);
    expect(marks(A)).toEqual({ fills: 1, strokes: 1, moves: none.moves + 1 + 3 * 2 });
    movePair(A, m, -20);
    const planar = trace(A);
    expect(marks(A)).toEqual({ fills: 1, strokes: 1, moves: none.moves + 2 + 4 * 2 });
    A.setPickPreview(p, { ranges: PAIR });
    const ranged = trace(A);
    expect(marks(A)).toEqual({ fills: 1, strokes: 1, moves: none.moves + 2 + 4 * 2 });
    expect(planar).toEqual(fresh(A, m, p, null));
    expect(ranged).toEqual(fresh(A, m, p, PAIR));
  });

  it('한도를 넘는 앱 면(이웃 찾기): 줄마다 꼭짓점을 따로 둔 격자에서 한 줄을 옆으로 밀면 그 줄 위아래 변도 테두리(0.96.0은 둘레 400변 그대로)', async () => {
    // z = 0 평면 100 × 100 칸 격자(삼각형 20,000개), 줄마다 꼭짓점 202개를 따로 둔다(줄 사이 변은 위치로만 함께 쓴다)
    const n = 100;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j < n; j++) {
      const b = j * (n + 1) * 2;
      for (let i = 0; i <= n; i++) pos.push(i, j, 0, i, j + 1, 0);
      for (let i = 0; i < n; i++) {
        const a = b + i * 2;
        idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
      }
    }
    const m: Mesh3d = { id: 'R', positions: Float32Array.from(pos), indices: Uint32Array.from(idx), color: [0.6, 0.6, 0.6, 1] };
    const FACE: IndexRange[] = [{ start: 0, count: n * n * 2 }];
    const A = make([m], [50.3, 50.6, 0]);
    const none = marks(A);
    const p = pickAt(A, [50.3, 20.6, 0], 'R');
    A.setPickPreview(p, { ranges: FACE });
    await ready(A);
    expect(marks(A)).toEqual({ fills: 0, strokes: 1, moves: none.moves + 400 * 2 });
    // 줄 50의 꼭짓점을 x로 0.5 민다 — 줄 49 윗변·줄 50 아랫변·윗변·줄 51 아랫변 400변이 더 테두리
    const row = 50 * (n + 1) * 2;
    for (let v = row; v < row + (n + 1) * 2; v++) m.positions[v * 3]! += 0.5;
    expect(A.setMesh(m, { vertices: { start: row, count: (n + 1) * 2 } })).toBe(true);
    const t = trace(A);
    expect(marks(A)).toEqual({ fills: 0, strokes: 1, moves: none.moves + 800 * 2 });
    expect(t).toEqual(fresh(A, m, p, FACE));
  });
});

const codes = (l: readonly SceneIssue[]): string[] => l.map((i) => `${i.kind}:${i.id ?? ''}:${i.code}:${i.action}${i.field ? `:${i.field}` : ''}:${i.count}`);

describe('0.97.0 제자리 고침 뒤 정점 색 검사 기억', () => {
  it('깨진 색을 고치면 알림에서 빠지고 그 색으로 그리며, 멀쩡한 색을 깨면 알리고 그 색을 쓰지 않는다 — 그 그물로 새로 만든 뷰어와 알림·GL 그리기 기록이 같다', () => {
    const box = boxMesh('C', [0, 0, 0], [10, 10, 10], [0.6, 0.6, 0.6, 1]);
    const nv = box.positions.length / 3;
    const C = new Float32Array(nv * 4);
    for (let v = 0; v < nv; v++) C.set([0.2 + v * 0.1, 0.5, 0.8 - v * 0.05, 1], v * 4);
    C[0] = NaN;
    const m: Mesh3d = { ...box, colors: C };
    const A = make([m], [5, 5, 5]);
    const heard: string[][] = [];
    A.onSceneIssues((l) => heard.push(codes(l)));
    expect(codes(A.sceneIssues)).toEqual(['mesh:C:colors:ignored:colors:1']);
    expect(A.scene!.meshes[0]!.colors).toBeUndefined();
    /** 그 그물(값이 같은 새 배열)을 처음 받은 뷰어: 알림과 GL 그리기 기록 */
    const freshGl = (): { issues: string[]; draws: DrawEntry[] } => {
      const B = make([{ ...m, positions: m.positions.slice(), indices: m.indices!.slice(), colors: C.slice() }], [5, 5, 5]);
      B.setCamera(A.getCamera());
      return { issues: codes(B.sceneIssues), draws: frame(B) };
    };
    const before = frame(A);
    // 고친다: 정점 0의 빨강
    C[0] = 0.2;
    expect(A.setMesh(m, { vertices: { start: 0, count: 1 } })).toBe(true);
    expect(codes(A.sceneIssues)).toEqual([]);
    expect(A.scene!.meshes[0]!.colors).toBe(C);
    const fixed = frame(A);
    expect(fixed).not.toEqual(before);
    expect({ issues: [], draws: fixed }).toEqual(freshGl());
    // 깬다: 정점 3의 초록
    C[3 * 4 + 1] = Infinity;
    expect(A.setMesh(m, { vertices: { start: 3, count: 1 } })).toBe(true);
    expect(codes(A.sceneIssues)).toEqual(['mesh:C:colors:ignored:colors:1']);
    expect(heard).toEqual([['mesh:C:colors:ignored:colors:1']]);
    expect(A.scene!.meshes[0]!.colors).toBeUndefined();
    const broken = frame(A);
    expect(broken).not.toEqual(fixed);
    expect({ issues: codes(A.sceneIssues), draws: broken }).toEqual(freshGl());
  });
});
