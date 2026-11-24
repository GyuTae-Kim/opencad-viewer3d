/**
 * 0.107.0 끌어온 점 목록이 바뀐 그림 뒤에도 onMeasureHoverChange(109차 — NC 99차 남은 빈칸): 0.103.0 알림은 measureHoverSnap·measureHoverLock 값만 견주어,
 * 끌어온 점 목록(measureTrackPoints)만 바뀌고 미리 보기 값이 그대로인 그림 — 머무르기 끝(타이머가 그림 밖에서 점을 더하고 미리 보기는 다시 구하지 않는다),
 * 값이 그대로인 setMeasureTrackPoints, 끌어온 점만 있던 측정 지우기·Esc·붙잡기 선택·측정 모드 끄기·새 장면 — 에는 알림이 없었다.
 * 그래서 NC는 상태 줄·측정 띠의 끌어온 점 수와 다시 재기 버튼을 다음 포인터 이동에서야 맞추려고 포인터 길(pointermove 뒤 두 프레임 읽기)을 남겼다.
 * 이제 같은 알림의 비교 열쇠에 끌어온 점 목록을 넣는다: 목록이 바뀐 그림 뒤 한 번(한 프레임에 여러 번 바뀌어도, 미리 보기 값과 함께 바뀌어도 한 번), 같은 목록이면 없음.
 * 받는 값은 그대로 그 그림의 measureHoverSnap(목록만 바뀐 그림에서는 앞 알림과 같은 값 — null 다음 null도)이고 앱은 콜백에서 measureTrackPoints를 읽는다.
 * 듣는 쪽이 없으면 0.106.0과 같다(그리기·덧그림·돌려준 값·다른 알림).
 * 장면(끌어온 축 — track.test와 같은 꼴): 첫 점 A = (0,0,0), 끌어올 점 E = (50, 40, 25), D = (100, 0, 1)은 선분 끝, W = (50, 40, 10)은 E를 지나는 Z축 위
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { boxMesh } from '../src/synth';
import { type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

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

const A: V3 = [0, 0, 0];
const E: V3 = [50, 40, 25];
const D: V3 = [100, 0, 1];
const W: V3 = [50, 40, 10];
const trackScene: Scene3d = {
  name: 't',
  units: 'mm',
  meshes: [],
  lines: [
    { id: '가', positions: new Float32Array([...A, 0, -20, 0]) },
    { id: '나', positions: new Float32Array([...E, 60, 40, 25]) },
    { id: '다', positions: new Float32Array([...D, 110, 0, 1]) },
  ],
  points: [],
};

function view(): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
  views.push(v);
  v.setScene(trackScene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return v;
}
/** 측정 모드 + 끌어온 축(머무르기 300 ms) */
function measuring(): Viewer3d {
  const v = view();
  v.setMeasureMode(true);
  v.setMeasureSnap({ inference: { axes: true, track: { dwellMs: 300 } } });
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
const ptr = (v: Viewer3d, type: string, s: { x: number; y: number }, buttons: number): void =>
  cv(v).fire(type, { clientX: s.x, clientY: s.y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
function at(v: Viewer3d, p: readonly number[]): { x: number; y: number } {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
}
const hover = (v: Viewer3d, p: readonly number[]): void => {
  ptr(v, 'pointermove', at(v, p), 0);
  v.renderNow();
};
function click(v: Viewer3d, p: readonly number[]): void {
  const s = at(v, p);
  ptr(v, 'pointerdown', s, 1);
  ptr(v, 'pointerup', s, 0);
  v.renderNow();
}
const leave = (v: Viewer3d): void => void cv(v).fire('pointerleave', { pointerId: 1, pointerType: 'mouse' });
const esc = { key: 'Escape', code: 'Escape', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, preventDefault() {} } as unknown as KeyboardEvent;
/** 다음 그림이 걸려 있는지(requestAnimationFrame) */
const pending = (v: Viewer3d): boolean => (v as unknown as { raf: number }).raf !== 0;

interface Heard {
  snap: MeasureHoverSnap | null;
  tracks: V3[];
}
/** 알림마다 받은 값과 그때 앱이 읽는 끌어온 점 목록 */
function listen(v: Viewer3d): Heard[] {
  const got: Heard[] = [];
  v.onMeasureHoverChange((snap) => void got.push({ snap, tracks: v.measureTrackPoints }));
  return got;
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

describe('0.107.0 끌어온 점 목록이 바뀐 그림 뒤 알림', () => {
  it('머무르기 끝(타이머 — 그림 밖): 미리 보기 값은 그대로이고 다음 그림을 걸며, 그 그림 뒤 한 번 — 콜백에서 새 목록을 읽는다', () => {
    const v = measuring();
    hover(v, E);
    const before = v.measureHoverSnap;
    expect(before?.snap).toBe('endpoint');
    const got = listen(v);
    vi.advanceTimersByTime(299);
    expect(v.measureTrackPoints).toEqual([]);
    expect(pending(v)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(v.measureTrackPoints).toEqual([E]);
    // 그림 밖에서 더했다 — 알림은 그 그림 뒤
    expect(got).toEqual([]);
    expect(pending(v)).toBe(true);
    v.renderNow();
    expect(got).toEqual([{ snap: before, tracks: [E] }]);
    expect(v.measureHoverSnap).toEqual(before);
    v.renderNow();
    expect(got).toHaveLength(1);
    // 그 자리로 다시 옮겨 다시 구해도 같은 값(점 붙잡기가 끌어온 축보다 먼저 — 머무르기 끝에 미리 보기를 다시 구하지 않아도 된다). 알림 없음
    hover(v, E);
    expect(v.measureHoverSnap).toEqual(before);
    expect(got).toHaveLength(1);
    // 끌어온 축 위로 옮기면 미리 보기 값이 바뀐 그림 뒤(0.103.0 그대로)
    hover(v, W);
    expect(got).toHaveLength(2);
    expect(got[1]!.snap).toMatchObject({ snap: 'axis', axis: 'z', trackFrom: E });
    expect(got[1]!.tracks).toEqual([E]);
  });

  it('setMeasureTrackPoints: 미리 보기 값이 그대로여도 그 그림 뒤 한 번 — 같은 목록·한 프레임에 바꿨다 되돌리면 없음, 여러 번 바꿔도 한 번, 미리 보기가 없으면 받는 값은 null', () => {
    const v = measuring();
    hover(v, A);
    const snap0 = v.measureHoverSnap;
    expect(snap0?.snap).toBe('endpoint');
    const got = listen(v);
    expect(v.setMeasureTrackPoints([E])).toBe(1);
    expect(got).toEqual([]);
    v.renderNow();
    expect(got).toEqual([{ snap: snap0, tracks: [E] }]);
    // 같은 목록
    v.setMeasureTrackPoints([E]);
    v.renderNow();
    expect(got).toHaveLength(1);
    // 한 프레임에 두 번 — 마지막 목록으로 한 번
    v.setMeasureTrackPoints([D]);
    v.setMeasureTrackPoints([D, E]);
    v.renderNow();
    expect(got.map((g) => g.tracks)).toEqual([[E], [D, E]]);
    // 한 프레임에 바꿨다 되돌리면 없음
    v.setMeasureTrackPoints([E]);
    v.setMeasureTrackPoints([D, E]);
    v.renderNow();
    expect(got).toHaveLength(2);
    v.setMeasureTrackPoints(null);
    v.renderNow();
    expect(got.map((g) => g.tracks)).toEqual([[E], [D, E], []]);
    expect(got.every((g) => JSON.stringify(g.snap) === JSON.stringify(snap0))).toBe(true);
    // 커서가 떠난 뒤(손가락 단추처럼 미리 보기가 없을 때) 앱이 준 점: 받는 값은 null(앞 알림도 null)
    leave(v);
    v.renderNow();
    expect(got.at(-1)).toEqual({ snap: null, tracks: [] });
    v.setMeasureTrackPoints([E]);
    v.renderNow();
    expect(got.at(-1)).toEqual({ snap: null, tracks: [E] });
    expect(got).toHaveLength(5);
  });

  it('찍기: 첫 점은 목록을 두고, 두 점째(목록을 지운다)는 미리 보기와 함께 바뀐 그림 뒤 한 번', () => {
    const v = measuring();
    const measures: unknown[] = [];
    v.onMeasure((m) => void measures.push(m));
    click(v, A);
    hover(v, E);
    vi.advanceTimersByTime(300);
    v.renderNow();
    expect(v.measureTrackPoints).toEqual([E]);
    const got = listen(v);
    hover(v, W);
    expect(got).toHaveLength(1);
    expect(got[0]!.snap?.trackFrom).toEqual(E);
    click(v, W);
    expect(measures).toHaveLength(1);
    expect(v.measureTrackPoints).toEqual([]);
    expect(got).toHaveLength(2);
    expect(got[1]).toEqual({ snap: v.measureHoverSnap, tracks: [] });
    v.renderNow();
    expect(got).toHaveLength(2);
  });

  it('끌어온 점만 있던 측정 지우기·Esc·붙잡기 선택·측정 모드 끄기·새 장면도 그 그림 뒤 한 번(onMeasure는 찍은 점이 없어 오지 않는다), 달 때의 목록·빈 목록 → 빈 목록은 없음', () => {
    const v = measuring();
    const measures: unknown[] = [];
    v.onMeasure((m) => void measures.push(m));
    v.setMeasureTrackPoints([E]);
    v.renderNow();
    const got = listen(v);
    v.renderNow();
    expect(got).toEqual([]);
    const again = (): void => {
      expect(v.setMeasureTrackPoints([E])).toBe(1);
      v.renderNow();
    };
    v.clearMeasure();
    expect(got).toEqual([]);
    v.renderNow();
    again();
    expect(v.handleKey(esc)).toBe(true);
    v.renderNow();
    again();
    v.setMeasureSnap({ inference: { axes: true, track: { dwellMs: 300 } } });
    v.renderNow();
    again();
    v.setMeasureMode(false);
    v.renderNow();
    v.setMeasureMode(true);
    again();
    v.setScene(trackScene);
    v.renderNow();
    expect(got.map((g) => g.tracks)).toEqual([[], [E], [], [E], [], [E], [], [E], []]);
    expect(got.every((g) => g.snap === null)).toBe(true);
    // 지울 것이 없으면(빈 목록 → 빈 목록 — 새 끌어온 점 상태도) 없음
    v.clearMeasure();
    v.setMeasureSnap({ inference: { axes: true, track: { dwellMs: 300 } } });
    v.renderNow();
    expect(got).toHaveLength(9);
    expect(measures).toEqual([]);
  });

  it("가상 커서: setMeasureTrackPoints 뒤 announce('refresh')가 먼저, 미리 보기 값이 같아도 그 그림 뒤 이 알림", () => {
    const host = dom.host();
    host.rect = { left: 0, top: 0, width: 800, height: 600 };
    const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
    views.push(v);
    v.setScene({
      name: 'box',
      units: 'mm',
      meshes: [boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]), boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1])],
      lines: [],
    });
    v.setView('top', false);
    v.fit(false);
    v.setCamera({ ...v.getCamera(), target: [50, 50, 50], distance: 400 });
    v.renderNow();
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true, inference: { track: true } });
    const log: string[] = [];
    v.setKeyboardSnap({ announce: (a) => void log.push(`announce:${a.reason}`) });
    cv(v).fire('keydown', { key: 'Enter', code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
    v.renderNow();
    const snap0 = v.measureHoverSnap;
    expect(snap0?.point[2]).toBeCloseTo(50, 6);
    v.onMeasureHoverChange((s) => void log.push(`hover:${JSON.stringify(s) === JSON.stringify(snap0)}:${v.measureTrackPoints.length}`));
    log.length = 0;
    expect(v.setMeasureTrackPoints([[20, 20, 50]])).toBe(1);
    v.renderNow();
    expect(log).toEqual(['announce:refresh', 'hover:true:1']);
    expect(v.measureHoverSnap).toEqual(snap0);
  });

  it('듣는 쪽이 있어도 그리기·덧그림·돌려준 값·측정 알림은 같은 걸음의 듣지 않는 뷰어와 같다(머무르기·앱이 준 점·찍기·지우기)', () => {
    const P = measuring();
    const Q = measuring();
    const heard = listen(P);
    const meas: unknown[][] = [[], []];
    P.onMeasure((m) => void meas[0]!.push(m));
    Q.onMeasure((m) => void meas[1]!.push(m));
    const steps: [string, (v: Viewer3d) => unknown][] = [
      [
        '가리킴·머무르기',
        (v) => {
          hover(v, E);
          vi.advanceTimersByTime(300);
        },
      ],
      ['끌어온 축 위', (v) => ptr(v, 'pointermove', at(v, W), 0)],
      ['첫 점', (v) => click(v, A)],
      ['앱이 준 끌어온 점', (v) => v.setMeasureTrackPoints([D, E])],
      ['같은 목록', (v) => v.setMeasureTrackPoints([D, E])],
      ['둘째 점', (v) => click(v, W)],
      [
        '떠난 뒤 앱이 준 점',
        (v) => {
          leave(v);
          return v.setMeasureTrackPoints([E]);
        },
      ],
      ['측정 지우기', (v) => v.clearMeasure()],
      [
        '붙잡기 선택',
        (v) => {
          v.setMeasureTrackPoints([E]);
          v.setMeasureSnap({ inference: { axes: true, track: { dwellMs: 300 } } });
        },
      ],
      ['측정 끔', (v) => v.setMeasureMode(false)],
    ];
    for (const [name, op] of steps) {
      const rec = (v: Viewer3d): string => {
        const ret = op(v);
        const gl = cv(v).gl!;
        gl.draws = [];
        gl.logDraws = true;
        const ov = trace(v);
        gl.logDraws = false;
        return `${name}\n${JSON.stringify(ret ?? null)}\n${JSON.stringify(gl.draws)}\n${ov.join('\n')}\n${JSON.stringify([v.measureHoverSnap, v.measureHoverLock, v.measurePoints, v.measureTrackPoints, v.measureLabelRect])}`;
      };
      expect(rec(P)).toBe(rec(Q));
    }
    expect(meas[0]).toEqual(meas[1]);
    expect(meas[0]!.length).toBeGreaterThan(0);
    expect(heard.length).toBeGreaterThan(3);
  });
});
