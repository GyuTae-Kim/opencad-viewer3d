/**
 * 0.45.0 구간 단면(0.44.0 setSections items의 { id, start, count })과 앱 붙잡기 점·project의 맞물림:
 * - SnapPoint.raw(+ edges): 그 기본 도형이 든 구간 단면의 평면으로도 자르고, 숨긴 구간이면 뺀다. 없으면 0.44.0 그대로(묶음 통째 평면만)
 * - pointsFor 점은 raw가 없으면 고른 것의 raw를 받는다(id가 없거나 고른 것과 같을 때)
 * - project(p, { id, raw, edges })
 * - 다듬은 점(refine)의 잘림도 그 선분 번호로
 * - 같은 규칙: 한 그물로 합친 판 + 구간 단면 + raw를 단 앱 점 = 묶음으로 나눈 판 + 묶음 단면 + id만 단 앱 점(화면 격자 미리 보기가 같다)
 * - 구간 단면이 없으면 raw를 달아도 0.44.0과 같은 결과
 * 화면 좌표로 가리킬 때는 그물 경계를 정확히 가리키지 않는다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { snapRaw } from '../src/snap';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, Scene3d, SnapPoint } from '../src/types';
import { type MeasureSnapOptions, type SectionPlane, Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  vi.useRealTimers();
  dom.restore();
});

const GRAY: [number, number, number, number] = [0.7, 0.7, 0.75, 1];
/** 상자 둘(삼각형 0~11 = 왼쪽 A, 12~23 = 오른쪽 B, 윤곽선도 0~11 A·12~23 B)을 한 그물로 합친 판 — SketchUp 그룹 둘을 재질 묶음 하나로 구운 꼴 */
function mergedPlate(): Mesh3d {
  const a = boxMesh('a', [0, 0, 0], [40, 40, 20], GRAY);
  const b = boxMesh('b', [60, 0, 0], [100, 40, 20], GRAY);
  const positions = new Float32Array(48);
  positions.set(a.positions, 0);
  positions.set(b.positions, 24);
  const indices = new Uint32Array(72);
  indices.set(a.indices!, 0);
  for (let i = 0; i < 36; i++) indices[36 + i] = b.indices![i]! + 8;
  const edges = new Float32Array(a.edges!.length * 2);
  edges.set(a.edges!, 0);
  edges.set(b.edges!, a.edges!.length);
  return { id: '판', name: '판', positions, indices, edges, color: GRAY, closed: true };
}
/** 세로 선분 둘(0번은 A 위, 1번은 B 위 — z 0~30) */
const POLE = [20, 20, 0, 20, 20, 30, 80, 20, 0, 80, 20, 30];
function scene(split = false): Scene3d {
  if (split) {
    const a = boxMesh('a', [0, 0, 0], [40, 40, 20], GRAY);
    const b = boxMesh('b', [60, 0, 0], [100, 40, 20], GRAY);
    const lines: LineSet3d[] = [
      { id: '기둥 0', positions: new Float32Array(POLE.slice(0, 6)) },
      { id: '기둥 1', positions: new Float32Array(POLE.slice(6)) },
    ];
    return { name: 'split', units: 'mm', meshes: [{ ...a, closed: true }, { ...b, closed: true }], lines };
  }
  return { name: 't', units: 'mm', meshes: [mergedPlate()], lines: [{ id: '기둥', positions: new Float32Array(POLE) }] };
}
/** B만 z > 10 쪽을 잘라 내는 평면(판의 삼각형 12~23·윤곽선 12~23, 기둥의 선분 1) — split이면 같은 것을 묶음 id로 */
const cutB = (split = false, extra: Partial<SectionPlane> = {}): SectionPlane =>
  split
    ? { normal: [0, 0, 1], offset: 10, items: ['b', '기둥 1'], ...extra }
    : {
        normal: [0, 0, 1],
        offset: 10,
        items: [
          { id: '판', start: 12, count: 12 },
          { id: '판', start: 12, count: 12, edges: true },
          { id: '기둥', start: 1, count: 1 },
        ],
        ...extra,
      };

const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as FakeElement).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const scr = (v: Viewer3d, p: readonly number[]): [number, number] => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return [s.x, s.y];
};
const hoverXY = (v: Viewer3d, x: number, y: number): void => {
  ptr(v, 'pointermove', x, y, 0);
  v.renderNow();
};
const hover = (v: Viewer3d, p: readonly number[]): void => {
  const [x, y] = scr(v, p);
  hoverXY(v, x + 0.31, y + 0.17);
};

function make(o: Partial<MeasureSnapOptions>, opts: { split?: boolean; view?: 'top' | 'front' | 'swIso' | 'neIso'; caps?: 'none' | 'all' } = {}): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false, grid: false, renderMode: 'shaded' });
  views.push(v);
  v.setScene(scene(opts.split));
  v.setView(opts.view ?? 'top', false);
  v.fit(false);
  v.setMeasureMode(true);
  v.setMeasureSnap(o as MeasureSnapOptions);
  return v;
}

/** B 윗면 가운데(잘린 쪽)·A 윗면 가운데(남는 쪽) — 기둥(x 20·80, y 20)에서 떨어진 자리 */
const B_TOP = [70.4, 30.3, 20];
const A_TOP = [10.4, 30.3, 20];

describe('snapRaw(0.45.0)', () => {
  it('0 이상 정수(2³¹ 아래)만, 그 밖은 null', () => {
    expect([0, 5, 2 ** 31 - 1].map(snapRaw)).toEqual([0, 5, 2 ** 31 - 1]);
    expect([undefined, null, -1, 1.5, NaN, Infinity, 2 ** 31, '3'].map((x) => snapRaw(x))).toEqual([null, null, null, null, null, null, null, null]);
  });
});

describe('구간 단면과 앱 붙잡기 점(0.45.0)', () => {
  it('늘 후보인 점: raw가 B 삼각형이면 잘린 쪽 점을 붙잡지 않는다 — raw가 없으면 0.44.0 그대로(통째 평면만), A면 붙잡는다', () => {
    const pts: SnapPoint[] = [
      { point: B_TOP, kind: 'center', id: '판', raw: 12 },
      { point: A_TOP, kind: 'center', id: '판', raw: 3 },
    ];
    const v = make({ points: pts });
    v.setSections([cutB(false, { caps: 'none' })]);
    hover(v, B_TOP);
    expect(v.measureHoverSnap?.snap).not.toBe('center');
    hover(v, A_TOP);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'center', point: A_TOP });
    // raw 없음(구간을 모르는 점) — 0.44.0처럼 통째 평면만 보므로 잘린 쪽이어도 붙잡는다
    const u = make({ points: [{ point: B_TOP, kind: 'center', id: '판' }] });
    u.setSections([cutB(false, { caps: 'none' })]);
    hover(u, B_TOP);
    expect(u.measureHoverSnap).toMatchObject({ snap: 'center', point: B_TOP });
    // raw가 A의 삼각형이면(앱이 그 점을 A라고 하면) 자르지 않는다
    const w = make({ points: [{ point: B_TOP, kind: 'center', id: '판', raw: 0 }] });
    w.setSections([cutB(false, { caps: 'none' })]);
    hover(w, B_TOP);
    expect(w.measureHoverSnap).toMatchObject({ snap: 'center', point: B_TOP });
    // 구간을 잘못 준 값(음수·소수)은 raw가 없는 점과 같다
    const z = make({ points: [{ point: B_TOP, kind: 'center', id: '판', raw: -1 }, { point: A_TOP, kind: 'center', id: '판', raw: 1.5 }] });
    z.setSections([cutB(false, { caps: 'none' })]);
    hover(z, B_TOP);
    expect(z.measureHoverSnap).toMatchObject({ snap: 'center', point: B_TOP });
  });

  it('윤곽선 번호(edges: true): 윤곽선 구간(edges)으로 준 평면만 — 삼각형 구간만 준 평면은 그 점을 자르지 않는다', () => {
    const pts: SnapPoint[] = [{ point: B_TOP, kind: 'center', id: '판', raw: 14, edges: true }];
    const v = make({ points: pts });
    v.setSections([{ normal: [0, 0, 1], offset: 10, caps: 'none', items: [{ id: '판', start: 12, count: 12 }] }]);
    hover(v, B_TOP);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'center' });
    v.setSections([cutB(false, { caps: 'none' })]);
    hover(v, B_TOP);
    expect(v.measureHoverSnap?.snap).not.toBe('center');
    // 선분 묶음에 edges를 달면 아무 구간에도 들지 않는다(윤곽선은 그물에만)
    expect(v.project([80, 20, 25], { id: '기둥', raw: 1, edges: true })!.visible).toBe(true);
  });

  it('색인 길(앱 점 SNAP_INDEX_MIN개 이상)도 같다', () => {
    const many: SnapPoint[] = [];
    for (let i = 0; i < 300; i++) many.push({ point: [200 + i, 200, 0], kind: 'point', id: '판', raw: 0 });
    const v = make({ points: [{ point: B_TOP, kind: 'center', id: '판', raw: 12 }, { point: A_TOP, kind: 'center', id: '판', raw: 3 }, ...many] });
    v.setSections([cutB(false, { caps: 'none' })]);
    hover(v, B_TOP);
    expect(v.measureHoverSnap?.snap).not.toBe('center');
    hover(v, A_TOP);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'center', point: A_TOP });
  });

  it('pointsFor 점은 raw가 없으면 고른 것의 raw를 받는다 — 잘린 B를 지나 B 바닥 안쪽을 고르면 B 윗면 가운데 점(잘린 쪽)을 붙잡지 않는다', () => {
    const calls: { raw: number | undefined }[] = [];
    const pointsFor = (pick: { raw?: number }): SnapPoint[] => {
      calls.push({ raw: pick.raw });
      return [{ point: B_TOP, kind: 'center' }];
    };
    // 잘린 면 채우기를 끄면 위에서 B 자리를 가리킬 때 B의 남은 바닥 안쪽(z = 0, 삼각형 12~23)을 고른다
    const v = make({ pointsFor: pointsFor as MeasureSnapOptions['pointsFor'] });
    v.setSections([cutB(false, { caps: 'none' })]);
    hover(v, B_TOP);
    expect(calls.at(-1)!.raw).toBeGreaterThanOrEqual(12);
    expect(v.measureHoverSnap?.snap).not.toBe('center');
    // 앱이 raw(A)를 달면 그것을 쓴다
    const u = make({ pointsFor: ((): SnapPoint[] => [{ point: B_TOP, kind: 'center', raw: 2 }]) as MeasureSnapOptions['pointsFor'] });
    u.setSections([cutB(false, { caps: 'none' })]);
    hover(u, B_TOP);
    expect(u.measureHoverSnap).toMatchObject({ snap: 'center', point: B_TOP });
    // 다른 묶음 id를 단 점은 고른 것의 raw를 받지 않는다(그 묶음은 구간 단면이 없어 통째 평면만)
    const w = make({ pointsFor: ((): SnapPoint[] => [{ point: B_TOP, kind: 'center', id: '기둥' }]) as MeasureSnapOptions['pointsFor'] });
    w.setSections([cutB(false, { caps: 'none' })]);
    hover(w, B_TOP);
    expect(w.measureHoverSnap).toMatchObject({ snap: 'center', point: B_TOP });
  });

  it('숨긴 구간: raw가 숨긴 삼각형이면 뺀다(단면 없이도) — raw가 없으면 0.44.0 그대로', () => {
    const v = make({ points: [{ point: B_TOP, kind: 'center', id: '판', raw: 12 }, { point: A_TOP, kind: 'center', id: '판' }] });
    v.setHiddenRanges('판', [{ start: 12, count: 12 }]);
    hover(v, B_TOP);
    expect(v.measureHoverSnap?.snap).not.toBe('center');
    v.setHiddenRanges('판', [{ start: 0, count: 12 }]);
    hover(v, B_TOP);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'center', point: B_TOP });
    hover(v, A_TOP);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'center', point: A_TOP });
  });

  it('project(p, { id, raw, edges }): 앱 점과 같은 잘림 — 주지 않으면 0.44.0 그대로(모든 묶음을 자르는 평면만)', () => {
    const v = make({});
    v.setSections([cutB()]);
    const vis = (p: readonly number[], o?: Parameters<Viewer3d['project']>[1]): boolean => v.project(p, o)!.visible;
    expect(vis(B_TOP)).toBe(true);
    expect(vis(B_TOP, { id: '판' })).toBe(true);
    expect(vis(B_TOP, { id: '판', raw: 12 })).toBe(false);
    expect(vis(B_TOP, { id: '판', raw: 0 })).toBe(true);
    expect(vis(B_TOP, { id: '판', raw: 12, edges: true })).toBe(false);
    expect(vis(B_TOP, { id: '판', raw: 3, edges: true })).toBe(true);
    expect(vis([70, 30, 5], { id: '판', raw: 12 })).toBe(true);
    expect(vis([80, 20, 25], { id: '기둥', raw: 1 })).toBe(false);
    expect(vis([20, 20, 25], { id: '기둥', raw: 0 })).toBe(true);
    expect(vis(B_TOP, { id: '없는 묶음', raw: 12 })).toBe(true);
    // 묶음 통째로 자르는 범위 평면: id를 주면 그 평면도 본다(주지 않으면 0.44.0처럼 보지 않는다)
    v.setSections([{ normal: [0, 0, 1], offset: 10, items: ['판'] }]);
    expect(vis(A_TOP)).toBe(true);
    expect(vis(A_TOP, { id: '판' })).toBe(false);
    expect(vis(A_TOP, { id: '기둥' })).toBe(true);
    // 모든 묶음을 자르는 평면은 id와 상관없이
    v.setSections([{ normal: [0, 0, 1], offset: 10 }]);
    expect(vis(A_TOP)).toBe(false);
    expect(vis(A_TOP, { id: '기둥', raw: 0 })).toBe(false);
    expect(v.project(A_TOP, { id: '판', raw: 0 })).toMatchObject({ onScreen: true, visible: false, occluded: false });
  });

  it('다듬은 점(refine onEdge): 잘린 기둥 1 위로 옮긴 점은 받지 않고, 기둥 0은 받는다', () => {
    const inputs: number[] = [];
    // 커서 둘레 선분 위 점을 위로 0.6 옮긴 자리(앱 곡선 위 점이라고 친다)
    const refine = (i: { point: readonly number[]; segment: { raw: number } }): number[] => {
      inputs.push(i.segment.raw);
      return [i.point[0]!, i.point[1]!, i.point[2]! + 0.6];
    };
    const v = make({ refine: refine as unknown as MeasureSnapOptions['refine'] }, { view: 'front' });
    // 기둥 1만 z > 25를 자른다(상자 위로 드러난 자리)
    v.setSections([{ normal: [0, 0, 1], offset: 25, caps: 'none', items: [{ id: '기둥', start: 1, count: 1 }] }]);
    hover(v, [80, 20, 24.8]);
    expect(inputs.at(-1)).toBe(1);
    const h1 = v.measureHoverSnap!;
    expect(h1.refined).toBeUndefined();
    expect(h1.point[2]).toBeLessThan(25);
    hover(v, [20, 20, 24.8]);
    expect(inputs.at(-1)).toBe(0);
    expect(v.measureHoverSnap).toMatchObject({ refined: true });
    expect(v.measureHoverSnap!.point[2]).toBeGreaterThan(25);
  });
});

describe('같은 규칙(0.45.0): 합친 그물 + 구간 단면 + raw = 나눈 묶음 + 묶음 단면 + id', () => {
  /** A·B 윗면 구석·가운데, 기둥 위·옆 점 — 합친 쪽은 id '판'·'기둥' + raw, 나눈 쪽은 묶음 id */
  function appPoints(split: boolean): SnapPoint[] {
    const out: SnapPoint[] = [];
    const add = (p: number[], b: boolean, kind: SnapPoint['kind']): void => {
      out.push(split ? { point: p, kind, id: b ? 'b' : 'a' } : { point: p, kind, id: '판', raw: b ? 12 + (out.length % 12) : out.length % 12 });
    };
    for (const [x0, b] of [
      [0, false],
      [60, true],
    ] as const) {
      add([x0 + 20, 10, 20], b, 'center');
      add([x0 + 30, 30, 20], b, 'point');
      add([x0 + 10, 35, 5], b, 'center');
      add([x0 + 35, 5, 15], b, 'point');
    }
    // 기둥 위 점(선분 번호)
    out.push(split ? { point: [80, 20, 25], kind: 'center', id: '기둥 1' } : { point: [80, 20, 25], kind: 'center', id: '기둥', raw: 1 });
    out.push(split ? { point: [20, 20, 25], kind: 'center', id: '기둥 0' } : { point: [20, 20, 25], kind: 'center', id: '기둥', raw: 0 });
    return out;
  }
  const hoverOut = (v: Viewer3d): unknown => {
    const h = v.measureHoverSnap;
    return h ? [h.snap, h.point.map((c) => Math.round(c * 1e6) / 1e6)] : null;
  };
  /**
   * 화면 격자(23화소 — 경계를 정확히 가리키지 않게 소수 화소 어긋남). 앞 뷰는 쓰지 않는다: 상자 옆면이 시선과 나란해(옆면을 스치는 광선) 그 면 위 윤곽선의
   * 가림 판정이 합친 그물과 나눈 묶음에서 다르다(잘린 면 채우기 'all' — 구간 단면과 상관없이 모든 묶음 단면·통째 단면에서도, 0.44.0 그대로)
   */
  function grid(v: Viewer3d): unknown[] {
    const out: unknown[] = [];
    for (let y = 12; y < 600; y += 23)
      for (let x = 15; x < 800; x += 23) {
        hoverXY(v, x + 0.37, y + 0.23);
        out.push(hoverOut(v));
      }
    return out;
  }
  /** 앱 점마다 그 화면 자리(소수 화소 어긋남)에서 미리 보기 */
  function atPoints(v: Viewer3d, pts: readonly SnapPoint[]): unknown[] {
    return pts.map((sp) => {
      hover(v, sp.point);
      return hoverOut(v);
    });
  }
  for (const view of ['top', 'swIso', 'neIso'] as const)
    for (const caps of ['none', 'all'] as const)
      it(`${view} · 채우기 ${caps}: 화면 격자 미리 보기가 같다`, () => {
        const res: unknown[][] = [];
        for (const split of [false, true]) {
          const v = make({ points: appPoints(split), midpoints: true, edges: true }, { split, view });
          v.setSections([cutB(split, { caps })]);
          res.push([...grid(v), ...atPoints(v, appPoints(false))]);
        }
        const [m, s] = res as [unknown[], unknown[]];
        expect(m.length).toBe(s.length);
        expect(m).toEqual(s);
        // 앱 점(가운데·점)을 붙잡은 자리와 잘려서 붙잡지 않은 자리가 모두 있다
        const own = m.slice(-appPoints(false).length);
        expect(own.filter((r) => Array.isArray(r) && (r[0] === 'center' || r[0] === 'point')).length).toBeGreaterThan(2);
        expect(own.filter((r) => !Array.isArray(r) || (r[0] !== 'center' && r[0] !== 'point')).length).toBeGreaterThan(0);
      });

  it('구간 단면이 없으면 raw를 달아도 0.44.0과 같다(달지 않은 목록과 화면 격자 미리 보기가 같다 — 묶음 단면만 있을 때도)', () => {
    const strip = (pts: SnapPoint[]): SnapPoint[] => pts.map(({ raw: _r, edges: _e, ...rest }) => rest);
    for (const sec of [null, [{ normal: [0, 0, 1], offset: 10, items: ['판'] }], [{ normal: [1, 0, 0], offset: 50 }]] as (SectionPlane[] | null)[]) {
      const res: unknown[][] = [];
      for (const withRaw of [true, false]) {
        const pts = appPoints(false);
        const v = make({ points: withRaw ? pts : strip(pts), midpoints: true, edges: true });
        v.setSections(sec);
        res.push(grid(v));
      }
      expect(res[0]).toEqual(res[1]);
    }
  });
});
