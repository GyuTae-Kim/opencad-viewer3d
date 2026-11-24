/**
 * 0.100.0 0.99.0이 남긴 한계(102차 — README 0.100.0 절의 표): 선분 그리기 범위(setLineDrawRange·setDrawLimitBySegmentId — NC 재생이 프레임마다 부른다).
 * 범위 밖 선분(배열 안 번호 ≥ 그리는 개수)은 0.99.0도 고르기·측정 붙잡기·커서 둘레 선분에서 뺐다(흐린 나머지 ghost를 그려도). 그런데 범위가 줄어
 * 범위 밖이 된 선분이 그 전에 낸 상태는 남겼다:
 *  - 지나간 기준 선분(첫 점 나란함·끌어온 점 방향) — 범위를 줄인 뒤 선분을 지나지 않고 첫 점을 찍으면 그리지 않는 선분과 나란한 안내선·'parallel'
 *  - 가상 커서 후보(고르기 모드 겹친 후보·측정 모드 후보) — 커서를 옮기기 전 Tab이 그리지 않는 선분 후보를 알리고 표식·미리 보기로 그렸다
 *  - 측정 미리 보기(마우스) — 마우스를 옮길 때까지 그리지 않는 선분 위 점을 measureHoverSnap으로 돌려주고 그렸다
 * 이제 범위가 줄면 범위 밖이 된 선분이 낸 기준만 버리고(다른 선분·묶음이 낸 기준과 범위가 늘 때는 그대로), 측정 미리 보기와 가상 커서 후보를 그 자리에서 다시 구한다
 * (그 상태로 새로 만든 뷰어·커서를 다시 켠 것·마우스를 다시 옮긴 것과 같다).
 * 장면(위에서 봄): 아래 상자 L [0,0,0]–[100,100,20], 재생 선분 묶음 P(원본 번호 10·20·30 — 가로 (120,0)–(160,0), 빗변 (160,0)–(200,40), 세로 (200,40)–(200,100), z 30),
 * P 세로 선분 아래 상자 E [180,50,0]–[220,80,10], 다른 선분 묶음 Q(번호 없음 — (130,90,30)–(170,90,30))
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type MeasureResult, Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Scene3d } from '../src/types';

const L = boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]);
const E = boxMesh('E', [180, 50, 0], [220, 80, 10], [0.5, 0.5, 0.8, 1]);
const P: LineSet3d = {
  id: 'P',
  name: 'P',
  positions: new Float32Array([120, 0, 30, 160, 0, 30, 160, 0, 30, 200, 40, 30, 200, 40, 30, 200, 100, 30]),
  segmentIds: new Uint32Array([10, 20, 30]),
  color: [0.9, 0.9, 0.2, 1],
};
const Q: LineSet3d = { id: 'Q', name: 'Q', positions: new Float32Array([130, 90, 30, 170, 90, 30]), color: [0.2, 0.9, 0.9, 1] };
const scene = (): Scene3d => ({ name: 'range', units: 'mm', meshes: [L, E], lines: [P, Q] });

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

function make(target: [number, number, number]): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(scene());
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

/** 첫 점(L 윗면 안쪽 — 선분·꼭짓점에서 먼 자리)과 그 점에서 P 빗변과 나란한 자리, 빗변 가운데 */
const F1: [number, number, number] = [30, 60, 20];
const F2: [number, number, number] = [50, 80, 20];
const DIAG: [number, number, number] = [180, 20, 30];
const DIAG_EDGE = [[160, 0, 30], [200, 40, 30]];

type Op = [string, (v: Viewer3d) => void];
/** 빗변(배열 안 번호 1·원본 번호 20)을 범위 밖으로 보내는 길 */
const CUT: Op[] = [
  ['setLineDrawRange(P, 1)', (v) => v.setLineDrawRange('P', 1)],
  ['setLineDrawRange(P, 0, ghost) — 흐리게 그려도', (v) => v.setLineDrawRange('P', 0, { ghost: 0.3 })],
  ['setDrawLimitBySegmentId(10)', (v) => void v.setDrawLimitBySegmentId(10)],
  ['setDrawLimitBySegmentId(15, ghost)', (v) => void v.setDrawLimitBySegmentId(15, { ghost: 0.2 })],
  [
    '범위 3에서 1로',
    (v) => {
      v.setLineDrawRange('P', 3);
      v.setLineDrawRange('P', 1);
    },
  ],
];
/** 빗변을 범위 안에 남기거나 범위를 늘리는 길·다른 묶음만 줄이는 길(기준 선분은 그대로) */
const KEEP: Op[] = [
  ['setLineDrawRange(P, 2) — 빗변은 안', (v) => v.setLineDrawRange('P', 2)],
  ['setDrawLimitBySegmentId(20) — 빗변은 안', (v) => void v.setDrawLimitBySegmentId(20)],
  ['setLineDrawRange(P, null) — 늘림', (v) => v.setLineDrawRange('P', null)],
  ['setLineDrawRange(P, 3, ghost) — 전부·흐림만', (v) => v.setLineDrawRange('P', 3, { ghost: 0.5 })],
  ['다른 묶음 setLineDrawRange(Q, 0)', (v) => v.setLineDrawRange('Q', 0)],
];

/** 측정 모드·윤곽선 붙잡기·첫 점 나란함 뷰어(같은 상태 둘 — 하나만 P 빗변을 지난다) */
function measuring(): { v: Viewer3d; got: MeasureResult[] } {
  const v = make([100, 50, 20]);
  v.setMeasureMode(true);
  v.setMeasureSnap({ edges: true, inference: { parallel: true } });
  const got: MeasureResult[] = [];
  v.onMeasure((m) => void (m && got.push(m)));
  return { v, got };
}
/** 첫 점을 찍고 나란한 자리로 옮겨 둘째 점까지: 그 자리 덧그림·미리 보기·측정 결과 */
function run(v: Viewer3d, got: MeasureResult[]): { t: string[]; snap: unknown; m: MeasureResult | undefined } {
  hover(v, F1);
  tap(v, F1);
  hover(v, F2);
  const t = trace(v);
  const snap = v.measureHoverSnap;
  tap(v, F2);
  return { t, snap, m: got.at(-1) };
}

describe('0.100.0 지나간 기준 선분 — 낸 선분이 그리기 범위 밖이 되면 버린다', () => {
  it.each(CUT)('%s 뒤 선분을 지나지 않고 첫 점: 나란함이 없다 — 빗변을 지나지 않은 같은 뷰어와 같다(0.99.0은 그리지 않는 빗변과 나란한 안내선·결과)', (_name, op) => {
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

  it.each(KEEP)('%s 뒤에는 기준 선분이 남는다(0.99.0과 같다)', (_name, op) => {
    const { v, got } = measuring();
    hover(v, DIAG);
    op(v);
    const r = run(v, got);
    const s = Math.SQRT1_2;
    expect(r.snap).toMatchObject({ snap: 'parallel', edge: DIAG_EDGE });
    expect(r.m?.snapB).toBe('parallel');
    expect(r.m?.directionB?.[0]).toBeCloseTo(s, 6);
    expect(r.m?.directionB?.[1]).toBeCloseTo(s, 6);
  });

  it('범위를 줄였다 다시 늘려도 버린 기준은 돌아오지 않는다 — 다시 지나면 새 기준', () => {
    const { v, got } = measuring();
    hover(v, DIAG);
    v.setDrawLimitBySegmentId(10);
    v.setDrawLimitBySegmentId(null);
    const r = run(v, got);
    expect(r.snap).toMatchObject({ snap: null });
    v.clearMeasure();
    hover(v, DIAG);
    expect(run(v, got).snap).toMatchObject({ snap: 'parallel', edge: DIAG_EDGE });
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
    v.setLineDrawRange('P', 1);
    // 끌어온 점 (60, 20, 20)에서 빗변과 수직인 선 위(빗변 방향 (1, 1)에 수직 — (−15, 15))
    hover(v, [45, 35, 20]);
    const t = trace(v);
    const s = v.measureHoverSnap;
    const w = setup();
    w.setLineDrawRange('P', 1);
    hover(w, [45, 35, 20]);
    expect(t).toEqual(trace(w));
    expect(s).toEqual(w.measureHoverSnap);
    expect(s).toMatchObject({ snap: null });
  });
});

/** P 세로 선분(배열 안 번호 2·원본 번호 30)을 범위 밖으로 보내는 길 — 가상 커서·마우스는 그 선분 위(아래에 E) */
const CUT2: Op[] = [
  ['setLineDrawRange(P, 2)', (v) => v.setLineDrawRange('P', 2)],
  ['setLineDrawRange(P, 2, ghost)', (v) => v.setLineDrawRange('P', 2, { ghost: 0.3 })],
  ['setDrawLimitBySegmentId(20)', (v) => void v.setDrawLimitBySegmentId(20)],
  ['setDrawLimitBySegmentId(25, ghost)', (v) => void v.setDrawLimitBySegmentId(25, { ghost: 0.2 })],
];
const CURSOR: [number, number, number] = [200.2, 64.7, 30];

describe('0.100.0 가상 커서 후보 — 범위 밖이 된 선분 후보', () => {
  const start = (meas: boolean): { v: Viewer3d; said: KeyboardSnapAnnouncement[] } => {
    const v = make(CURSOR);
    if (meas) {
      v.setMeasureMode(true);
      v.setMeasureSnap({ midpoints: true });
    }
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    if (meas) expect(said[0]!.snap?.point[2]).toBeCloseTo(30, 3);
    else expect(said[0]).toMatchObject({ reason: 'start', mode: 'pick', index: 0, pick: { kind: 'line', id: 'P', index: 30 } });
    return { v, said };
  };
  const state = (v: Viewer3d): unknown => [v.keyboardCursor, v.measureHoverSnap];
  const CASES: [string, boolean, (v: Viewer3d) => void][] = CUT2.flatMap(([n, op]): [string, boolean, (v: Viewer3d) => void][] => [
    [`고르기 모드 ${n}`, false, op],
    [`측정 모드 ${n}`, true, op],
  ]);

  it.each(CASES)('%s 뒤 그리기 전 Tab: 지금 범위의 후보 차례 — 커서를 다시 켠 것과 같다(0.99.0은 그리지 않는 선분 후보를 알렸다)', (_name, meas, op) => {
    const { v, said } = start(meas);
    op(v);
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
    expect(a[0]!.pick?.id ?? null).not.toBe('P');
    expect(a[0]!.snap?.point[2] ?? 0).toBeLessThan(15);
  });

  it.each(CASES)('%s 뒤 키 없이 다음 그림: 지금 범위의 후보 표식·미리 보기 — 커서를 다시 켠 것과 같다(0.99.0은 그리지 않는 선분 후보를 그렸다)', (_name, meas, op) => {
    const { v, said } = start(meas);
    op(v);
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

describe('0.100.0 측정 미리 보기(마우스) — 범위 밖이 된 선분 위 점', () => {
  it.each(CUT2)('%s 뒤 마우스를 옮기지 않고 다음 그림: 그 자리에서 다시 구한 미리 보기(0.99.0은 그리지 않는 세로 선분 위 점을 그렸다)', (_name, op) => {
    const v = make([150, 50, 20]);
    v.setMeasureMode(true);
    v.setMeasureSnap({});
    hover(v, [200, 60, 30]);
    expect(v.measureHoverSnap?.point[2]).toBeCloseTo(30, 3);
    op(v);
    const t = trace(v);
    const h = v.measureHoverSnap;
    expect(h?.point[2]).toBeCloseTo(10, 3);
    hover(v, [200, 60, 30]);
    expect(t).toEqual(trace(v));
    expect(h).toEqual(v.measureHoverSnap);
  });

  it('범위를 늘려 그 선분을 다시 그리면 다음 이동에서 다시 그 선분 위 점', () => {
    const v = make([150, 50, 20]);
    v.setMeasureMode(true);
    v.setMeasureSnap({});
    v.setLineDrawRange('P', 2);
    hover(v, [200, 60, 30]);
    expect(v.measureHoverSnap?.point[2]).toBeCloseTo(10, 3);
    v.setLineDrawRange('P', 3);
    v.renderNow();
    hover(v, [200, 60, 30]);
    expect(v.measureHoverSnap?.point[2]).toBeCloseTo(30, 3);
  });
});
