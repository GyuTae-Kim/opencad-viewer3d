/**
 * 0.54.0 고르기 후보 미리 강조(SKP 56·57차 요청):
 *  - 순수 계산(pickpreview.ts): 맞은 삼각형과 같은 평면에서 변을 맞대고 이어진 삼각형(위치가 같은 꼭짓점은 번호가 달라도 같은 점)·테두리 변·한도, 앱 삼각형 구간
 *  - setPickPreview: 그물 면은 그 면을 옅게 칠하고 테두리, 선분·윤곽선은 그 선분, 점은 고리(화면 덧그림만 — 깊이를 따지지 않는다). 숨긴 묶음·새 장면은 그리지 않는다
 *  - 키보드 고르기 후보 돌리기: pickCycle.facePreview를 켜면 그물 면 후보도 같은 표식(기본은 0.53.0처럼 없음), faceRanges로 앱 면
 *  - setKeyboardSnap({ pickName }): 알림 글의 고른 것 이름을 앱 이름으로(글이 아니거나 빈 글·예외면 기본 이름)
 * 장면은 0.47.0 시험과 같다: 아래 상자 L [0,0,0]–[100,100,20], 위 상자 U [20,20,40]–[80,80,50], U 윗면 위 선분 묶음 '선', 위에서 본다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type KeyboardSnapOptions, Viewer3d } from '../src/viewer';
import * as entry from '../src/index';
import { PICK_PREVIEW_MAX_TRIS, planarFace, rangesFace } from '../src/pickpreview';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Scene3d } from '../src/types';

const L = boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
const LINES: LineSet3d = {
  id: '선',
  name: '선',
  positions: new Float32Array([30, 50, 50, 70, 50, 50, 30, 50, 50, 70, 50, 50, 50, 30, 50, 50, 70, 50]),
  color: [0.9, 0.9, 0.2, 1],
};
const scene = (): Scene3d => ({ name: 'preview', units: 'mm', meshes: [L, U], lines: [LINES] });

/** z = 0 평면의 n × n 칸 격자(칸마다 삼각형 둘) + 한 변에 세운 벽 삼각형 하나(같은 평면 아님). split이면 삼각형마다 꼭짓점을 따로(색인 없음) */
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

describe('0.54.0 그물 면 미리 강조 셈(pickpreview.ts)', () => {
  it('같은 평면에서 변을 맞대고 이어진 삼각형과 테두리 — 색인·나눈 꼭짓점 같은 결과, 세운 벽·떨어진 같은 평면은 빼고 한도에서 멈춘다', () => {
    for (const split of [false, true]) {
      const g = grid(3, split);
      const f = planarFace(g.positions, g.indices, 4)!;
      expect(f.tris.length, `split ${split}`).toBe(18);
      expect(new Set(f.tris).size).toBe(18);
      expect(f.tris).not.toContain(18);
      expect(f.capped).toBe(false);
      // 3 × 3 격자 둘레 12변
      expect(f.edges.length / 6).toBe(12);
      for (let i = 0; i < f.edges.length; i += 3) expect(f.edges[i + 2]).toBe(0);
      // 벽 삼각형은 제 평면만
      expect(planarFace(g.positions, g.indices, 18)!.tris).toEqual([18]);
      const c = planarFace(g.positions, g.indices, 0, 5)!;
      expect(c.tris.length).toBe(5);
      expect(c.capped).toBe(true);
    }
    // 떨어진 같은 평면 사각형 둘(한 그물): 맞은 쪽만
    const two = Float32Array.from([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 5, 0, 0, 6, 0, 0, 6, 1, 0, 5, 0, 0, 6, 1, 0, 5, 1, 0]);
    expect(planarFace(two, undefined, 3)!.tris.sort()).toEqual([2, 3]);
    // 상자: 면 하나 = 삼각형 둘, 테두리 4변
    const b = planarFace(U.positions, U.indices, 0)!;
    expect(b.tris.length).toBe(2);
    expect(b.edges.length / 6).toBe(4);
    // 그물 밖 번호·넓이 없는 삼각형
    expect(planarFace(U.positions, U.indices, 99)).toBeNull();
    expect(planarFace(U.positions, U.indices, -1)).toBeNull();
    expect(planarFace(Float32Array.from([0, 0, 0, 1, 0, 0, 2, 0, 0]), undefined, 0)!.tris).toEqual([0]);
    expect(PICK_PREVIEW_MAX_TRIS).toBe(4096);
  });

  it('rangesFace: 앱 구간의 삼각형(겹침·그물 밖·잘못된 값은 버림)과 테두리, 없으면 null', () => {
    const g = grid(2, false);
    const f = rangesFace(g.positions, g.indices, [{ start: 0, count: 2 }, { start: 1, count: 1 }, { start: 50, count: 3 }, { start: Number.NaN, count: 2 }])!;
    expect(f.tris).toEqual([0, 1]);
    expect(f.edges.length / 6).toBe(4);
    expect(rangesFace(g.positions, g.indices, [{ start: 100, count: 1 }])).toBeNull();
    expect(rangesFace(g.positions, g.indices, [{ start: 0, count: 8 }], 3)).toMatchObject({ tris: [0, 1, 2], capped: true });
    expect(entry.planarFace).toBe(planarFace);
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

const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
function key(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
  v.renderNow();
}
function make(opts: { pickEdges?: boolean } = {}): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, ...opts });
  views.push(v);
  v.setScene(scene());
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [50, 50, 50], distance: 400 });
  v.renderNow();
  return v;
}
function withKeys(v: Viewer3d, o: KeyboardSnapOptions = {}): KeyboardSnapAnnouncement[] {
  const said: KeyboardSnapAnnouncement[] = [];
  v.setKeyboardSnap({ ...o, announce: (a) => said.push(a) });
  return said;
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

describe('0.54.0 setPickPreview', () => {
  it('그물 면: 같은 평면 면(삼각형 둘)을 칠하고 테두리 4변(바탕 테·강조 두 번), ranges면 그 삼각형만, null이면 지운다', () => {
    const v = make();
    const s = v.project([35, 65, 50])!;
    const p = v.pick(s.x, s.y)!;
    expect(p).toMatchObject({ kind: 'mesh', id: 'U' });
    const none = marks(v);
    expect(none.fills).toBe(0);
    v.setPickPreview(p);
    expect(v.pickPreview).toEqual(p);
    expect(v.pickPreview).not.toBe(p);
    const a = marks(v);
    expect(a.fills).toBe(1);
    expect(a.strokes).toBe(1);
    expect(a.moves - none.moves).toBe(2 + 4 * 2);
    v.setPickPreview(p, { ranges: [{ start: p.index, count: 1 }] });
    const r = marks(v);
    expect(r.fills).toBe(1);
    expect(r.moves - none.moves).toBe(1 + 3 * 2);
    v.setPickPreview(null);
    expect(v.pickPreview).toBeNull();
    expect(marks(v)).toEqual(none);
  });

  it('선분은 그 선분, 숨긴 묶음은 그리지 않고, 새 장면이면 지운다', () => {
    const v = make();
    const s = v.project([40, 50, 50])!;
    const p = v.pick(s.x, s.y)!;
    expect(p).toMatchObject({ kind: 'line', id: '선' });
    const none = marks(v);
    v.setPickPreview(p);
    const a = marks(v);
    expect(a).toMatchObject({ fills: 0, strokes: 1 });
    expect(a.moves - none.moves).toBe(2);
    v.setItemVisible('선', false);
    expect(marks(v).strokes).toBe(0);
    v.setItemVisible('선', true);
    v.setScene(scene());
    expect(v.pickPreview).toBeNull();
  });

  it('윤곽선(pickEdges)도 그 선분', () => {
    const v = make({ pickEdges: true });
    const s = v.project([20, 50, 50])!;
    const p = v.pick(s.x, s.y)!;
    expect(p.kind).toBe('edge');
    v.setPickPreview(p);
    expect(marks(v)).toMatchObject({ fills: 0, strokes: 1 });
  });
});

describe('0.54.0 키보드 고르기 후보 면 표식·pickName', () => {
  it('facePreview를 켜면 그물 면 후보도 칠하고 테두리(기본은 0.53.0처럼 없음), faceRanges면 앱 면', () => {
    /** 커서를 켜고 Tab 세 번 — U 윗면(넷째 후보) */
    const toTop = (o: KeyboardSnapOptions): Viewer3d => {
      const v = make();
      withKeys(v, o);
      key(v, 'Enter');
      for (let i = 0; i < 3; i++) key(v, 'Tab');
      expect(v.keyboardCursor).toMatchObject({ index: 3, count: 7 });
      return v;
    };
    expect(marks(toTop({})).fills).toBe(0);
    let asked = 0;
    const a = marks(
      toTop({
        pickCycle: {
          facePreview: true,
          faceRanges: (p) => {
            asked++;
            return p.id === 'U' ? null : undefined;
          },
        },
      }),
    );
    expect(a).toMatchObject({ fills: 1, strokes: 1 });
    expect(asked).toBeGreaterThan(0);
    const b = marks(toTop({ pickCycle: { facePreview: true, faceRanges: (p) => [{ start: p.index, count: 1 }] } }));
    expect(b.fills).toBe(1);
    expect(a.moves - b.moves).toBe(3);
    // 앱 함수가 던지면 같은 평면 면
    const c = marks(
      toTop({
        pickCycle: {
          facePreview: true,
          faceRanges: () => {
            throw new Error('앱 오류');
          },
        },
      }),
    );
    expect(c).toEqual(a);
  });

  it('pickName: 알림 글의 고른 것 이름 — 글이 아니거나 빈 글·예외면 기본 이름', () => {
    const v = make();
    const said = withKeys(v, { pickName: (p) => (p.kind === 'mesh' ? `부품 ${p.id}` : p.kind === 'line' ? '  ' : null) });
    key(v, 'Enter');
    expect(said.at(-1)!.text).toMatch(/^가상 커서를 켰습니다\. 선 선분 1\/7: /);
    for (let i = 0; i < 3; i++) key(v, 'Tab');
    expect(said.at(-1)!.text).toMatch(/^부품 U 면 4\/7: /);
    key(v, 'Enter');
    expect(said.at(-1)!.text).toBe('골랐습니다: 부품 U 면');
    // 새 선택이면 그 자리 후보를 처음부터 다시 돌린다
    const t = withKeys(v, {
      pickName: () => {
        throw new Error('앱 오류');
      },
    });
    for (let i = 0; i < 3; i++) key(v, 'Tab');
    expect(t.at(-1)!.text).toMatch(/^U 면 4\/7: /);
  });
});
