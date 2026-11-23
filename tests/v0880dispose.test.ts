/**
 * 0.88.0 dispose 뒤 부름의 수명(88차 — 82차 후보 「수명」): 0.87.0은 없앤 뷰어에 앱이 창 키를 넘기거나(handleKey·handleKeyUp) 측정 붙잡기·묶어 그리기 선택을 주면
 * 창·문서 리스너(걷기 키 — 창 keyup·blur와 문서 visibilitychange, Shift 추론 잠금 — 창 keyup·blur)·타이머(측정 붙잡기 점 색인, 묶어 그리기 조각 받기)를 다시 걸고,
 * 아무것도 하지 않는 키(F·1~7·걷기 키)에 true를 돌려 기본 동작을 막았다(앱이 넘긴 키를 삼킨다). dispose가 측정 붙잡기 선택(앱 점 배열·색인)을 놓지 않아
 * setMeasurePickThrough·setMeasureInferenceLock은 true였다. 0.88.0은 dispose 뒤 이 넷이 아무것도 하지 않고(키는 false, 기본 동작 그대로) dispose가 붙잡기 선택도 놓는다.
 * 가짜 DOM(창·문서 리스너 수를 센다)·setTimeout 부름 수. 살아 있는 뷰어의 같은 부름은 0.87.0 그대로인지도 본다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { mergeKitState } from '../src/renderer';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

const g = globalThis as unknown as Record<string, unknown>;
/** 창 리스너(가짜 DOM의 창은 듣기를 버리므로 여기서 센다) */
const win = new Map<string, Set<unknown>>();
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  g.addEventListener = (type: string, fn: unknown): void => {
    let s = win.get(type);
    if (!s) win.set(type, (s = new Set()));
    s.add(fn);
  };
  g.removeEventListener = (type: string, fn: unknown): void => void win.get(type)?.delete(fn);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const v of views) v.dispose();
  views.length = 0;
  win.clear();
});
afterAll(() => {
  dom.restore();
});

/** 창·문서에 걸린 리스너 수 */
function listeners(): number {
  let n = 0;
  for (const s of win.values()) n += s.size;
  for (const s of dom.doc.listeners.values()) n += s.size;
  return n;
}

const scene = (): Scene3d => ({
  name: 's',
  units: 'mm',
  meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [16, 2, 0], [26, 8, 6], [0.8, 0.6, 0.5, 1])],
  lines: [],
});
function view(): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 400, height: 300 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: true, viewCube: false });
  views.push(v);
  v.setScene(scene());
  v.renderNow();
  return v;
}

type Key = KeyboardEvent & { prevented: boolean };
/** 앱이 넘기는 창 키(기본 동작을 막았는지 prevented로 본다) */
function key(k: string, code: string, shift = false): Key {
  const e = {
    key: k,
    code,
    shiftKey: shift,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    repeat: false,
    prevented: false,
    preventDefault(): void {
      e.prevented = true;
    },
    stopPropagation(): void {},
  };
  return e as unknown as Key;
}
/** 색인 문턱(512)을 넘는 앱 붙잡기 점 */
const points = (): { point: number[] }[] => Array.from({ length: 600 }, (_, i) => ({ point: [i * 0.01, 0, 10] }));

describe('dispose 뒤 handleKey·handleKeyUp: 리스너를 걸지 않고 false(기본 동작 그대로)', () => {
  it('걷기 키(W·ArrowUp): 0.87.0은 창 keyup·blur·문서 visibilitychange 셋을 다시 걸고 true였다', () => {
    const v = view();
    v.setNavigation('walk');
    v.dispose();
    const n0 = listeners();
    for (const [k, code] of [
      ['w', 'KeyW'],
      ['ArrowUp', 'ArrowUp'],
    ] as const) {
      const e = key(k, code);
      expect(v.handleKey(e), k).toBe(false);
      expect(e.prevented, k).toBe(false);
      expect(listeners(), k).toBe(n0);
      expect(v.handleKeyUp(key(k, code)), k).toBe(false);
    }
  });

  it('살아 있는 뷰어의 걷기 키는 0.87.0 그대로(누르는 동안 셋을 듣고 떼면 놓는다, true)', () => {
    const v = view();
    v.setNavigation('walk');
    const n0 = listeners();
    const e = key('w', 'KeyW');
    expect(v.handleKey(e)).toBe(true);
    expect(e.prevented).toBe(true);
    expect(listeners()).toBe(n0 + 3);
    expect(v.handleKeyUp(key('w', 'KeyW'))).toBe(true);
    expect(listeners()).toBe(n0);
  });

  it('누르는 동안 dispose하면 셋을 놓는다(0.87.0 그대로)', () => {
    const v = view();
    v.setNavigation('walk');
    const n0 = listeners();
    v.handleKey(key('w', 'KeyW'));
    expect(listeners()).toBe(n0 + 3);
    v.dispose();
    expect(listeners()).toBe(n0);
  });

  it('Shift(측정 추론 잠금 inference.lock): 0.87.0은 창 keyup·blur 둘을 다시 걸었다 — 살아 있으면 0.87.0 그대로 둘을 듣고 떼면 놓는다', () => {
    const live = view();
    live.setMeasureMode(true);
    live.setMeasureSnap({ inference: { lock: true } });
    const n0 = listeners();
    expect(live.handleKey(key('Shift', 'ShiftLeft', true))).toBe(false);
    expect(listeners()).toBe(n0 + 2);
    live.handleKeyUp(key('Shift', 'ShiftLeft'));
    expect(listeners()).toBe(n0);

    const v = view();
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { lock: true } });
    v.dispose();
    const n1 = listeners();
    expect(v.handleKey(key('Shift', 'ShiftLeft', true))).toBe(false);
    expect(listeners()).toBe(n1);
    expect(v.handleKeyUp(key('Shift', 'ShiftLeft'))).toBe(false);
  });

  it('F·1·Esc: 아무것도 하지 않으니 false(0.87.0 F·1은 true로 기본 동작을 막았다)', () => {
    const v = view();
    v.setMeasureMode(true);
    v.dispose();
    for (const [k, code] of [
      ['f', 'KeyF'],
      ['1', 'Digit1'],
      ['Escape', 'Escape'],
    ] as const) {
      const e = key(k, code);
      expect(v.handleKey(e), k).toBe(false);
      expect(e.prevented, k).toBe(false);
    }
  });
});

describe('dispose 뒤 측정 붙잡기·묶어 그리기 선택', () => {
  it('setMeasureSnap: 0.87.0은 붙잡기를 켜고 점 색인을 만들며 타이머를 걸었다 — 0.88.0은 아무것도 하지 않는다(살아 있으면 0.87.0 그대로 타이머 하나)', () => {
    const live = view();
    let t = vi.spyOn(globalThis, 'setTimeout');
    live.setMeasureSnap({ points: points() });
    expect(t).toHaveBeenCalledTimes(1);
    expect(live.measureSnap).not.toBeNull();
    t.mockRestore();

    const v = view();
    v.dispose();
    t = vi.spyOn(globalThis, 'setTimeout');
    v.setMeasureSnap({ points: points() });
    expect(t).not.toHaveBeenCalled();
    expect(v.measureSnap).toBeNull();
  });

  it('dispose가 앞 붙잡기 선택(앱 점 배열·색인)도 놓는다: measureSnap null, setMeasurePickThrough·setMeasureInferenceLock은 문서대로 false(0.87.0 true)', () => {
    const v = view();
    v.setMeasureMode(true);
    v.setMeasureSnap({ points: points(), midpoints: true });
    expect(v.setMeasurePickThrough(true)).toBe(true);
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    v.dispose();
    expect(v.measureSnap).toBeNull();
    expect(v.setMeasurePickThrough(false)).toBe(false);
    expect(v.setMeasureInferenceLock('y')).toBe(false);
    expect(v.measureInferenceLock).toBeNull();
  });

  it("setRenderOptions({ merging: 'on' }): 0.87.0은 없앤 렌더러로 묶어 그리기 조각 받기(import·기다림 타이머)를 걸었다 — 0.88.0은 아무것도 하지 않는다", () => {
    expect(mergeKitState()).toBe('idle');
    const v = view();
    const before = v.renderOptions;
    v.dispose();
    const t = vi.spyOn(globalThis, 'setTimeout');
    v.setRenderOptions({ merging: 'on', profiles: true });
    expect(t).not.toHaveBeenCalled();
    expect(mergeKitState()).toBe('idle');
    expect(v.renderOptions).toEqual(before);
  });
});
