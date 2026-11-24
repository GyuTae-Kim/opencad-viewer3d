/**
 * 0.103.0 측정 미리 보기 바뀜 알림(onMeasureHoverChange — 105차): measureHoverSnap 값이 바뀐 그림 뒤 한 번 알린다.
 * 0.102.0은 코어가 포인터 이동 밖에서(메시 바꾸기·보이기·그리기 범위·붙잡기 한도·다듬기 비우기·잠금 — 다음 그림에 다시 구함, 겉모습·단면·새 장면·붙잡기 선택·측정 지우기 — 곧 버림)
 * 미리 보기를 바꿔도 마우스에는 알리지 않아('refresh'는 가상 커서 + 다시 구하는 길만) NC 97차·STEP 106차가 장면 길 목록을 들고 다음 프레임에 다시 읽었다.
 * 이제 값이 바뀐 그림 뒤(그 그림을 다 그린 뒤) 한 번 — 한 프레임에 여러 길이 와도 한 번, 값이 같으면 없음, 버려 null이 되면 앞 값이 있었을 때만, 포인터 이동으로 바뀐 것도
 * (프레임마다 많아야 한 번). 비교는 measureHoverSnap과 measureHoverLock(Shift가 잠글 방향)의 모든 필드. 듣는 쪽이 있어도 그리기·덧그림·다른 알림은 같다.
 * 알림 규칙은 다른 on*와 같다(0.90.0 — 단 차례, 알림 동안 단 쪽은 다음부터·뗀 쪽은 곧, dispose하면 멈춤. 0.89.0 dispose 뒤·0.93.0 함수가 아닌 값은 걸지 않는다).
 * 장면(위에서 봄): 아래 상자 L [0,0,0]–[100,100,20], 위 상자 U [20,20,40]–[80,80,50]
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';

const L = boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
/** 같은 id의 U를 x로 200 옮긴 새 메시(캔버스 가운데에서 비킨다 — 그 자리는 L 윗면) */
const U_AWAY = boxMesh('U', [220, 20, 40], [280, 80, 50], [0.7, 0.6, 0.5, 1]);
const scene = (meshes: Mesh3d[]): Scene3d => ({ name: 'hover', units: 'mm', meshes, lines: [] });

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

function make(): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(scene([L, U]));
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [50, 50, 50], distance: 400 });
  v.renderNow();
  return v;
}
/** 측정 모드 + 붙잡기 선택 */
function measuring(): Viewer3d {
  const v = make();
  v.setMeasureMode(true);
  v.setMeasureSnap({ midpoints: true });
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 세계 점의 화면 자리(조금 비켜 — 경계를 정확히 가리키지 않는다) */
function at(v: Viewer3d, p: [number, number, number]): { x: number; y: number } {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x + 0.37, y: s.y - 0.21 };
}
const pmove = (v: Viewer3d, s: { x: number; y: number }): void =>
  cv(v).fire('pointermove', { clientX: s.x, clientY: s.y, pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const hover = (v: Viewer3d, s: { x: number; y: number }): void => {
  pmove(v, s);
  v.renderNow();
};
function click(v: Viewer3d, s: { x: number; y: number }): void {
  const e = { clientX: s.x, clientY: s.y, pointerId: 1, pointerType: 'mouse', button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  cv(v).fire('pointerdown', { ...e, buttons: 1 });
  cv(v).fire('pointerup', { ...e, buttons: 0 });
  v.renderNow();
}
const key = (v: Viewer3d, k: string): void => {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
  v.renderNow();
};
function listen(v: Viewer3d): (MeasureHoverSnap | null)[] {
  const got: (MeasureHoverSnap | null)[] = [];
  v.onMeasureHoverChange((s) => void got.push(s));
  return got;
}
const z = (s: MeasureHoverSnap | null | undefined): number | null => (s ? Math.round(s.point[2] * 1000) / 1000 : null);
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

describe('0.103.0 포인터 밖에서 바뀐 미리 보기', () => {
  it('메시를 바꾸면 그리기 전에는 알리지 않고 다음 그림 뒤 한 번 — 그 그림의 measureHoverSnap(달 때의 값은 알리지 않는다)', () => {
    const v = measuring();
    hover(v, at(v, [50, 50, 50]));
    expect(z(v.measureHoverSnap)).toBe(50);
    const got = listen(v);
    v.renderNow();
    expect(got).toEqual([]);
    v.setMesh(U_AWAY);
    expect(got).toEqual([]);
    v.renderNow();
    expect(got.map(z)).toEqual([20]);
    expect(got[0]).toEqual(v.measureHoverSnap);
    v.renderNow();
    expect(got).toHaveLength(1);
  });

  it('다시 구해도 같은 값이면 알리지 않는다 — 같은 꼴로 바꾼 메시·숨긴 아래 메시·붙잡기 한도·다듬기 비우기·같은 자리로 다시 옮김', () => {
    const v = measuring();
    const c = at(v, [50, 50, 50]);
    hover(v, c);
    const got = listen(v);
    v.setMesh(boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]));
    v.renderNow();
    v.setItemVisible('L', false);
    v.renderNow();
    v.setMeasureSnapLimit(3);
    v.renderNow();
    v.clearMeasureRefine();
    v.renderNow();
    hover(v, c);
    expect(got).toEqual([]);
    expect(z(v.measureHoverSnap)).toBe(50);
  });

  it('붙잡기 선택·측정 모드 끄기로 버리면 다음 그림 뒤 null 한 번(앞 값이 있을 때만), 다시 가리키면 그 값 — 0.109.0 겉모습·단면은 다음 그림에서 다시 구한다', () => {
    const v = measuring();
    const c = at(v, [50, 50, 50]);
    hover(v, c);
    const got = listen(v);
    v.setItemOpacity('U', 0.5);
    // 0.109.0: 장면 길처럼 다음 그림에서 그 자리에서 다시 구한다(0.102.0~0.108.0은 곧 버려 null을 알렸다) — 반투명 U도 고르므로 같은 값, 알리지 않는다
    expect(z(v.measureHoverSnap)).toBe(50);
    v.renderNow();
    expect(got).toEqual([]);
    expect(z(v.measureHoverSnap)).toBe(50);
    // U를 잘라 내면 그 아래 L 윗면 — 그 그림 뒤 한 번(0.108.0은 null 다음 포인터 이동에서)
    v.setSection({ normal: [0, 0, 1], offset: 30 });
    v.renderNow();
    expect(got.map(z)).toEqual([20]);
    // 붙잡기 선택은 곧 버린다 — 알림은 그 그림 뒤
    v.setMeasureSnap({ midpoints: true });
    expect(v.measureHoverSnap).toBeNull();
    expect(got).toHaveLength(1);
    v.renderNow();
    expect(got.map(z)).toEqual([20, null]);
    hover(v, c);
    expect(got.map(z)).toEqual([20, null, 20]);
    v.setMeasureMode(false);
    v.renderNow();
    expect(got.map(z)).toEqual([20, null, 20, null]);
  });

  it('한 프레임에 여러 길이 와도 한 번(마지막 값), 버린 뒤 그리기 전에 같은 자리로 옮겨 같은 값이면 없음', () => {
    const v = measuring();
    const c = at(v, [50, 50, 50]);
    hover(v, c);
    const got = listen(v);
    v.setMesh(U_AWAY);
    v.clearMeasureRefine();
    v.setMeasurePickThrough(true);
    v.setMeasureSnapLimit(2);
    v.renderNow();
    expect(got.map(z)).toEqual([20]);
    const before = v.measureHoverSnap;
    v.setMeasureSnap({ midpoints: true });
    expect(v.measureHoverSnap).toBeNull();
    pmove(v, c);
    v.renderNow();
    expect(v.measureHoverSnap).toEqual(before);
    expect(got).toHaveLength(1);
  });

  it('앱 단추 잠금·풀기: 잠근 선 위 점(locked)으로 다시 구한 그림 뒤 한 번씩', () => {
    const v = make();
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, lock: true } });
    click(v, at(v, [50, 50, 50]));
    expect(v.measurePointCount).toBe(1);
    const p0 = v.measurePoints[0]!.point;
    hover(v, at(v, [p0[0] + 15, p0[1] + 0.4, 50]));
    expect(v.measureHoverSnap?.locked).toBeUndefined();
    const got = listen(v);
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    expect(got).toEqual([]);
    v.renderNow();
    expect(got).toHaveLength(1);
    expect(got[0]?.locked).toBe(true);
    expect(got[0]?.point[1]).toBeCloseTo(p0[1], 6);
    v.setMeasureInferenceLock(false);
    v.renderNow();
    expect(got).toHaveLength(2);
    expect(got[1]?.locked).toBeUndefined();
    v.renderNow();
    expect(got).toHaveLength(2);
  });
});

describe('0.103.0 포인터·가상 커서로 바뀐 미리 보기', () => {
  it('포인터 이동: 값이 바뀐 그림 뒤 한 번, 같은 값이면 없음, 한 그림 앞 두 이동은 한 번, 떠나면 null', () => {
    const v = measuring();
    const got = listen(v);
    const c = at(v, [50, 50, 50]);
    hover(v, c);
    expect(got.map(z)).toEqual([50]);
    hover(v, c);
    expect(got).toHaveLength(1);
    pmove(v, at(v, [30, 50, 50]));
    pmove(v, at(v, [10, 50, 20]));
    expect(got).toHaveLength(1);
    v.renderNow();
    expect(got.map(z)).toEqual([50, 20]);
    expect(got[1]).toEqual(v.measureHoverSnap);
    cv(v).fire('pointerleave', {});
    v.renderNow();
    expect(got.map(z)).toEqual([50, 20, null]);
  });

  it("가상 커서: 키 이동은 announce 다음 그 그림 뒤, 장면 길의 'refresh'도 그 다음에 이 알림, 알림이 없던 길(단면 뒤 다시 구함)도 이 알림", () => {
    const v = measuring();
    const log: string[] = [];
    v.setKeyboardSnap({ announce: (a) => void log.push(`announce:${a.reason}`) });
    key(v, 'Enter');
    expect(z(v.measureHoverSnap)).toBe(50);
    v.onMeasureHoverChange((s) => void log.push(`hover:${z(s)}`));
    log.length = 0;
    key(v, 'ArrowRight');
    expect(log).toEqual(['announce:move', 'hover:50']);
    log.length = 0;
    v.setMesh(U_AWAY);
    v.renderNow();
    expect(log).toEqual(['announce:refresh', 'hover:20']);
    log.length = 0;
    v.setMesh(U);
    v.renderNow();
    expect(log).toEqual(['announce:refresh', 'hover:50']);
    log.length = 0;
    // 단면은 미리 보기를 곧 버리고 가상 커서 후보를 다음 그림에서 알리지 않고 다시 구한다(0.98.0) — 이 알림은 그 값
    v.setSection({ normal: [0, 0, 1], offset: 30 });
    v.renderNow();
    expect(log).toEqual(['hover:20']);
  });
});

describe('0.103.0 그리기·알림 규칙', () => {
  it('듣는 쪽이 있어도 그리기·덧그림·측정 알림·돌려준 값은 같은 걸음의 듣지 않는 뷰어와 같다', () => {
    const A = measuring();
    const B = measuring();
    const heard = listen(A);
    const meas: unknown[][] = [[], []];
    A.onMeasure((m) => void meas[0]!.push(m));
    B.onMeasure((m) => void meas[1]!.push(m));
    const steps: [string, (v: Viewer3d) => void][] = [
      ['가리킴', (v) => pmove(v, at(v, [50, 50, 50]))],
      ['메시 바꾸기', (v) => v.setMesh(U_AWAY)],
      ['보이기', (v) => v.setItemVisible('U', false)],
      ['겉모습', (v) => v.setItemOpacity('L', 0.5)],
      ['다시 가리킴', (v) => pmove(v, at(v, [30, 60, 20]))],
      ['첫 점', (v) => click(v, at(v, [30, 60, 20]))],
      ['옮김', (v) => pmove(v, at(v, [70, 60, 20]))],
      ['붙잡기 한도', (v) => v.setMeasureSnapLimit(1)],
      ['둘째 점', (v) => click(v, at(v, [70, 60, 20]))],
      ['단면', (v) => v.setSection({ normal: [0, 0, 1], offset: 10 })],
      ['단면 뒤 가리킴', (v) => pmove(v, at(v, [60, 40, 10]))],
      ['떠남', (v) => cv(v).fire('pointerleave', {})],
      ['측정 끔', (v) => v.setMeasureMode(false)],
    ];
    for (const [name, op] of steps) {
      const rec = (v: Viewer3d): string => {
        op(v);
        const gl = cv(v).gl!;
        gl.draws = [];
        gl.logDraws = true;
        const ov = trace(v);
        gl.logDraws = false;
        return `${name}\n${JSON.stringify(gl.draws)}\n${ov.join('\n')}\n${JSON.stringify([v.measureHoverSnap, v.measureHoverLock, v.measurePoints, v.measureLabelRect])}`;
      };
      expect(rec(A)).toBe(rec(B));
    }
    expect(meas[0]).toEqual(meas[1]);
    expect(meas[0]!.length).toBeGreaterThan(0);
    expect(heard.length).toBeGreaterThan(3);
  });

  it('알림 규칙(0.90.0): 단 차례, 알림 동안 단 쪽은 다음 알림부터·뗀 쪽은 그 알림에 부르지 않음, 같은 함수는 한 번, 해제 함수로 그만', () => {
    const v = measuring();
    hover(v, at(v, [50, 50, 50]));
    const log: string[] = [];
    const late = (): void => void log.push('late');
    const b = (): void => void log.push('b');
    let offB = (): void => {};
    const a = (): void => {
      log.push('a');
      v.onMeasureHoverChange(late);
      offB();
    };
    const offA = v.onMeasureHoverChange(a);
    offB = v.onMeasureHoverChange(b);
    v.onMeasureHoverChange(a);
    v.setMesh(U_AWAY);
    v.renderNow();
    expect(log).toEqual(['a']);
    log.length = 0;
    v.setMesh(U);
    v.renderNow();
    expect(log).toEqual(['a', 'late']);
    log.length = 0;
    offA();
    v.setMesh(U_AWAY);
    v.renderNow();
    expect(log).toEqual(['late']);
  });

  it('알림 안에서 dispose하면 남은 쪽을 부르지 않고 던지지 않는다, dispose 뒤 등록·함수가 아닌 값(0.93.0)은 걸지 않는다', () => {
    const v = measuring();
    hover(v, at(v, [50, 50, 50]));
    const log: string[] = [];
    v.onMeasureHoverChange(() => {
      log.push('a');
      v.dispose();
    });
    v.onMeasureHoverChange(() => void log.push('b'));
    v.setMesh(U_AWAY);
    expect(() => v.renderNow()).not.toThrow();
    expect(log).toEqual(['a']);
    const off = v.onMeasureHoverChange(() => void log.push('c'));
    expect(() => off()).not.toThrow();
    expect(() => v.renderNow()).not.toThrow();
    expect(log).toEqual(['a']);
    const w = measuring();
    hover(w, at(w, [50, 50, 50]));
    for (const bad of ['foo', null, undefined, {}, 1]) expect(() => (w.onMeasureHoverChange as (cb: unknown) => () => void)(bad)()).not.toThrow();
    for (const bad of ['foo', null, {}, 1]) (w.onMeasureHoverChange as (cb: unknown) => () => void)(bad);
    w.setMesh(U_AWAY);
    expect(() => w.renderNow()).not.toThrow();
    expect(z(w.measureHoverSnap)).toBe(20);
  });
});
