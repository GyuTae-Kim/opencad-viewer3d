/**
 * 0.99.0 0.98.0이 남긴 한계 둘(101차 — README 0.99.0 절의 표).
 * 0.98.0은
 *  - 지나간 기준 선분(첫 점 나란함·끌어온 점 나란함·수직의 기준 — 측정 중 커서가 마지막으로 지나간 선분·윤곽선의 세계 끝점)을 장면 길에서 남겼다.
 *    그 선분을 낸 메시를 빼거나 바꾸거나 숨기거나(묶음·숨긴 구간도) 행렬로 옮기거나 단면으로 자르거나 새 장면을 준 뒤, 선분을 지나지 않고 첫 점을 찍으면
 *    없는 선분과 나란한 안내선·옛 자리 기준 선분 점선을 그리고 measureHoverSnap·onMeasure에 'parallel'과 그 방향을 실었다
 *  - 붙잡기·고르기 선택을 바꾸는 setMeasureSnap·setPickEdges 뒤 가상 커서 후보를 다시 구하지 않았다 — Tab이 옛 선택의 후보(가운데 점·윤곽선)를 그리고 알렸고,
 *    고르기 모드 윤곽선 표식을 옛 후보로 그렸다(측정 모드는 다음 그림에 미리 보기가 없었다)
 * 이제 기준 선분은 그것을 낸 묶음이 장면 길에서 빠지거나 바뀌면 버리고(그 상태로 새로 만든 뷰어와 같다 — 다른 묶음만 바뀌면 그대로 남긴다),
 * 선택 setter 뒤 가상 커서 후보는 다음 그림·Tab 앞에서 그 자리에서 다시 구한다(커서를 다시 켠 것과 같다).
 * 장면(위에서 봄): 아래 상자 L [0,0,0]–[100,100,20], 위 상자 U [20,20,40]–[80,80,50], 삼각형 D(윤곽선은 빗변 (120,0,30)–(160,40,30) 하나, 묶음 g), 상자 E(묶음 h)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type MeasureResult, Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';

const L = boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
const tri = (id: string, dy: number): Mesh3d => ({
  id,
  name: id,
  positions: new Float32Array([120, dy, 30, 160, 40 + dy, 30, 160, dy, 30]),
  indices: new Uint32Array([0, 2, 1]),
  edges: new Float32Array([120, dy, 30, 160, 40 + dy, 30]),
  color: [0.5, 0.7, 0.5, 1],
  group: 'g',
});
const D = tri('D', 0);
/** 같은 id의 D를 y로 200 옮긴 새 메시 */
const D_AWAY = tri('D', 200);
const E = boxMesh('E', [120, 60, 0], [150, 90, 10], [0.5, 0.5, 0.8, 1], 'h');
const scene = (meshes: Mesh3d[]): Scene3d => ({ name: 'refs', units: 'mm', meshes, lines: [] });
const move = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

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

function make(sc: Scene3d, target: [number, number, number], pickEdges = false): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, pickEdges });
  views.push(v);
  v.setScene(sc);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target, distance: 400 });
  v.renderNow();
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 키 하나(그리지 않는다 — 바로 뒤의 키가 다음 그림보다 먼저 오는 때) */
function press(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
}
const key = (v: Viewer3d, k: string): void => {
  press(v, k);
  v.renderNow();
};
const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  cv(v).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
/** 세계 점의 화면 자리(꼭 그 화소가 아니게 조금 비킨다) */
const at = (v: Viewer3d, p: [number, number, number]): { x: number; y: number } => {
  const s = v.project(p)!;
  return { x: s.x + 0.37, y: s.y - 0.21 };
};
const hover = (v: Viewer3d, p: [number, number, number]): void => {
  const s = at(v, p);
  ptr(v, 'pointermove', s.x, s.y, 0);
  v.renderNow();
};
const tap = (v: Viewer3d, p: [number, number, number]): void => {
  const s = at(v, p);
  ptr(v, 'pointerdown', s.x, s.y, 1);
  ptr(v, 'pointerup', s.x, s.y, 0);
  v.renderNow();
};
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

/** 첫 점(L 윗면 안쪽 — 선분·꼭짓점에서 먼 자리)과 그 점에서 D 빗변과 나란한 자리 */
const F1: [number, number, number] = [30, 60, 20];
const F2: [number, number, number] = [50, 80, 20];
const DIAG: [number, number, number] = [140, 20, 30];

type Op = [string, (v: Viewer3d) => void];
/** 기준 선분(D 빗변)을 낸 묶음을 장면에서 빼거나 바꾸는 길 */
const GONE: Op[] = [
  ['removeMesh', (v) => void v.removeMesh('D')],
  ['setMesh 바꾸기', (v) => void v.setMesh(D_AWAY)],
  ['setItemVisible', (v) => v.setItemVisible('D', false)],
  ['setGroupVisible', (v) => v.setGroupVisible('g', false)],
  ['setHiddenRanges(윤곽선)', (v) => v.setHiddenRanges('D', { edges: [{ start: 0, count: 1 }] })],
  ['setSection', (v) => v.setSection({ normal: [0, 0, 1], offset: 25 })],
  ['setItemMatrix', (v) => v.setItemMatrix('D', move(0, 200, 0))],
  ['setScene', (v) => v.setScene(scene([L]), { keepView: true })],
  [
    'clear 뒤 setScene',
    (v) => {
      v.clear();
      v.setScene(scene([L]), { keepView: true });
    },
  ],
];
/** 다른 묶음만 바꾸거나 빗변을 남기는 길(기준 선분은 그대로) */
const KEEP: Op[] = [
  ['다른 묶음 setItemVisible', (v) => v.setItemVisible('E', false)],
  ['다른 묶음 setGroupVisible', (v) => v.setGroupVisible('h', false)],
  ['다른 묶음 removeMesh', (v) => void v.removeMesh('E')],
  ['다른 묶음 setItemMatrix', (v) => v.setItemMatrix('E', move(0, 200, 0))],
  ['D 삼각형만 setHiddenRanges(윤곽선은 그대로)', (v) => v.setHiddenRanges('D', [{ start: 0, count: 1 }])],
];

/** 측정 모드·윤곽선 붙잡기·첫 점 나란함 뷰어(같은 상태 둘 — 하나만 D 빗변을 지난다) */
function measuring(): { v: Viewer3d; got: MeasureResult[] } {
  const v = make(scene([L, D, E]), [80, 50, 20]);
  v.setMeasureMode(true);
  v.setMeasureSnap({ edges: true, inference: { parallel: true } });
  const got: MeasureResult[] = [];
  v.onMeasure((m) => void (m && got.push(m)));
  return { v, got };
}
/** 첫 점을 찍고 나란한 자리로 옮겨 둘째 점까지: 그 자리 덧그림·미리 보기·측정 결과 */
function run(v: Viewer3d, got: MeasureResult[], a = F1, b = F2): { t: string[]; snap: unknown; m: MeasureResult | undefined } {
  hover(v, a);
  tap(v, a);
  hover(v, b);
  const t = trace(v);
  const snap = v.measureHoverSnap;
  tap(v, b);
  return { t, snap, m: got.at(-1) };
}

describe('0.99.0 지나간 기준 선분 — 낸 묶음이 장면 길에서 빠지거나 바뀌면 버린다', () => {
  it.each(GONE)('%s 뒤 선분을 지나지 않고 첫 점: 나란함이 없다 — 빗변을 지나지 않은 같은 뷰어와 같다(0.98.0은 없는 빗변과 나란한 안내선·결과)', (_name, op) => {
    const { v, got } = measuring();
    hover(v, DIAG);
    expect(v.measureHoverSnap?.point[2]).toBeCloseTo(30, 3);
    op(v);
    const r = run(v, got);
    const w = measuring();
    op(w.v);
    expect(r).toEqual(run(w.v, w.got));
    expect(r.snap).toMatchObject({ snap: null });
    expect(r.m?.snapB ?? null).toBeNull();
  });

  it.each(KEEP)('%s 뒤에는 기준 선분이 남는다(0.98.0과 같다)', (_name, op) => {
    const { v, got } = measuring();
    hover(v, DIAG);
    op(v);
    const r = run(v, got);
    const s = Math.SQRT1_2;
    expect(r.snap).toMatchObject({ snap: 'parallel', edge: [[120, 0, 30], [160, 40, 30]] });
    expect(r.m?.snapB).toBe('parallel');
    expect(r.m?.directionB?.[0]).toBeCloseTo(s, 6);
    expect(r.m?.directionB?.[1]).toBeCloseTo(s, 6);
  });

  it('거르기로 받은 첫 점 나란함 기준(parallelEdge)도 버린다', () => {
    const setup = (): { v: Viewer3d; got: MeasureResult[] } => {
      const r = measuring();
      r.v.setMeasureSnap({ edges: true, inference: { parallel: true, parallelEdge: () => true } });
      return r;
    };
    const { v, got } = setup();
    hover(v, DIAG);
    v.removeMesh('D');
    const r = run(v, got);
    const w = setup();
    w.v.removeMesh('D');
    expect(r).toEqual(run(w.v, w.got));
    expect(r.snap).toMatchObject({ snap: null });
  });

  it('거르기로 받은 끌어온 점 기준(trackDirs { edge })도 버린다 — 첫 점 전 끌어온 점에서 수직인 자리', () => {
    const setup = (): Viewer3d => {
      const { v } = measuring();
      v.setMeasureSnap({ edges: true, inference: { track: true, trackDirs: { edge: () => true } } });
      v.setMeasureTrackPoints([[60, 20, 20]]);
      return v;
    };
    const v = setup();
    hover(v, DIAG);
    v.removeMesh('D');
    // 끌어온 점 (60, 20, 20)에서 빗변과 수직인 선 위(빗변 방향 (1, 1)에 수직 — (−15, 15))
    hover(v, [45, 35, 20]);
    const t = trace(v);
    const s = v.measureHoverSnap;
    const w = setup();
    w.removeMesh('D');
    hover(w, [45, 35, 20]);
    expect(t).toEqual(trace(w));
    expect(s).toEqual(w.measureHoverSnap);
    expect(s).toMatchObject({ snap: null });
  });
});

type Case = [string, boolean, (v: Viewer3d) => void, (v: Viewer3d) => void, (a: KeyboardSnapAnnouncement) => void];
/** [이름, 측정 모드, 준비(커서를 켜기 전), 바꾸기, 켤 때 알림 확인] — 커서는 U 윗면 앞 모서리 가운데 (50, 20, 50) */
const CASES: Case[] = [
  [
    '고르기 모드 setPickEdges(false)',
    false,
    (v) => v.setPickEdges(true),
    (v) => v.setPickEdges(false),
    (a) => expect(a.pick).toMatchObject({ kind: 'edge', id: 'U' }),
  ],
  [
    '측정 모드 setMeasureSnap(가운데 점 끔)',
    true,
    (v) => v.setMeasureSnap({ midpoints: true, edges: true }),
    (v) => v.setMeasureSnap({ edges: true }),
    (a) => expect(a.snap).toMatchObject({ snap: 'midpoint', point: [50, 20, 50] }),
  ],
  [
    '측정 모드 setMeasureSnap(null)',
    true,
    (v) => v.setMeasureSnap({ midpoints: true, edges: true }),
    (v) => v.setMeasureSnap(null),
    (a) => expect(a.snap).toMatchObject({ snap: 'midpoint', point: [50, 20, 50] }),
  ],
  [
    '측정 모드 setPickEdges(false)',
    true,
    (v) => {
      v.setPickEdges(true);
      v.setMeasureSnap({ midpoints: true });
    },
    (v) => v.setPickEdges(false),
    (a) => expect(a.snap).toMatchObject({ snap: 'midpoint', point: [50, 20, 50] }),
  ],
];

describe('0.99.0 선택 setter 뒤 가상 커서 후보', () => {
  const start = (c: Case): { v: Viewer3d; said: KeyboardSnapAnnouncement[] } => {
    const [, meas, prep, , check] = c;
    const v = make(scene([L, U]), [50, 20, 50]);
    if (meas) v.setMeasureMode(true);
    prep(v);
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    check(said[0]!);
    return { v, said };
  };
  const state = (v: Viewer3d): unknown => [v.keyboardCursor, v.measureHoverSnap];

  it.each(CASES)('%s 뒤 그리기 전 Tab: 새 선택의 후보 차례 — 커서를 다시 켠 것과 같다(0.98.0은 옛 선택의 후보를 알렸다)', (...c) => {
    const { v, said } = start(c);
    c[3](v);
    said.length = 0;
    press(v, 'Tab');
    const a = said.splice(0);
    const t = trace(v);
    const st = state(v);
    key(v, 'Escape');
    key(v, 'Enter');
    said.length = 0;
    press(v, 'Tab');
    expect(a).toEqual(said.splice(0));
    expect(t).toEqual(trace(v));
    expect(st).toEqual(state(v));
    expect(a).toHaveLength(1);
  });

  it.each(CASES)('%s 뒤 키 없이 다음 그림: 새 선택의 후보 표식·미리 보기 — 커서를 다시 켠 것과 같다(0.98.0은 옛 후보를 그렸거나 미리 보기가 없었다)', (...c) => {
    const { v, said } = start(c);
    c[3](v);
    const t = trace(v);
    const st = state(v);
    said.length = 0;
    key(v, 'Tab');
    const a = said.splice(0);
    key(v, 'Escape');
    key(v, 'Enter');
    expect(t).toEqual(trace(v));
    expect(st).toEqual(state(v));
    said.length = 0;
    key(v, 'Tab');
    expect(a).toEqual(said.splice(0));
  });
});
