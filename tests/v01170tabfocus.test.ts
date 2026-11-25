/**
 * 0.117.0 마우스 미리 보기 Tab 돌리기(0.116.0 setMeasureSnap({ tabCycle: true }))가 받은 Tab은 누르기로 받은 캔버스 초점 표시(data-v3d-focus="pointer" — 0.9.1)를 떼지 않는다:
 * 초점이 캔버스에 그대로라(기본 동작을 막음) 마우스로 후보를 돌리는 동안 키보드 초점 테두리가 나오지 않게. 받지 않은 Tab(후보 하나·tabCycle 끔·Esc로 푼 뒤 — 초점 이동)과
 * 가상 커서 Tab은 0.116.0처럼 뗀다. keyboard: false 앱이 capture 단계에서 handleKey로 넘겨 받은 Tab(같은 사건)도 둔다(가짜 DOM·가짜 WebGL).
 * 장면은 0.116.0 시험과 같다(z = 0, 위에서 봄): L1 (0,0)–(20,0), L2 (5,−5)–(5,8)(교차점 X (5,0)), L3 (30,−10)–(30,14),
 * 앱 점 A 'center' (5.4, 0.3), B 'point' low (4.5, −0.45). 카메라 대상 SPOT (5.1, 0.12)이 캔버스 가운데(400, 300) — 그 자리 후보는 넷이다.
 * 0.118.0: 돌린 동안의 미리 보기 값에는 차례·수(cycle)가 실려 견주는 값에 더한다(cyc).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type MeasureHoverSnap, type MeasureSnapOptions, type Viewer3dOptions, Viewer3d } from '../src/viewer';
import { POINTER_FOCUS_ATTR } from '../src/theme';
import type { V3 } from '../src/math';
import type { LineSet3d, Scene3d, SnapPoint } from '../src/types';

const seg = (id: string, a: V3, b: V3): LineSet3d => ({ id, name: id, positions: new Float32Array([...a, ...b]), color: [0.9, 0.9, 0.9, 1] });
const scene: Scene3d = {
  name: 'tabfocus',
  units: 'mm',
  meshes: [],
  lines: [seg('L1', [0, 0, 0], [20, 0, 0]), seg('L2', [5, -5, 0], [5, 8, 0]), seg('L3', [30, -10, 0], [30, 14, 0])],
  points: [],
};
const SPOT: V3 = [5.1, 0.12, 0];
const APP: SnapPoint[] = [
  { point: [5.4, 0.3, 0], kind: 'center' },
  { point: [4.5, -0.45, 0], kind: 'point', priority: 'low' },
];
const INF = { intersections: true, perpendicular: true, axes: true };

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
const mark = (v: Viewer3d): string | null => cv(v).getAttribute(POINTER_FOCUS_ATTR);
/** 0.118.0 Tab으로 돌린 동안의 미리 보기 값: 후보 i에 차례·수 */
const cyc = (list: MeasureHoverSnap[], i: number): MeasureHoverSnap => ({ ...list[i]!, cycle: { index: i, count: list.length } });
const ptr = (v: Viewer3d, type: string, x: number, y: number, button: number, buttons: number): void =>
  cv(v).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const hoverXY = (v: Viewer3d, x: number, y: number): void => {
  ptr(v, 'pointermove', x, y, -1, 0);
  v.renderNow();
};
/** 오른쪽 단추로 움직이지 않고 누른다 — 누르기 초점(data-v3d-focus="pointer")만 주고 측정 점은 찍지 않는다 */
const rightPress = (v: Viewer3d, x: number, y: number): void => {
  ptr(v, 'pointerdown', x, y, 2, 2);
  ptr(v, 'pointerup', x, y, 2, 0);
  v.renderNow();
};
/** 캔버스에 keydown을 보낸다. 기본 동작을 막았는지 돌려준다 */
function key(v: Viewer3d, k: string, shift = false, ctrl = false): boolean {
  let prevented = false;
  cv(v).fire('keydown', {
    key: k,
    code: '',
    shiftKey: shift,
    altKey: false,
    ctrlKey: ctrl,
    metaKey: false,
    preventDefault() {
      prevented = true;
    },
  });
  v.renderNow();
  return prevented;
}

function make(o: Partial<MeasureSnapOptions> = { tabCycle: true }, vo: Viewer3dOptions = {}): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, ...vo });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [...SPOT], distance: 80 });
  v.setMeasureMode(true);
  v.setMeasureSnap({ points: APP, midpoints: true, inference: INF, ...o });
  v.renderNow();
  return v;
}

describe('Viewer3d: 마우스 미리 보기 Tab 돌리기와 누르기 초점 표시(0.117.0)', () => {
  it('켬: 받은 Tab·Shift+Tab과 돌리기를 푸는 Esc는 누르기 초점 표시를 두고, 푼 뒤 Tab(초점 이동)은 뗀다', () => {
    const v = make();
    rightPress(v, 400, 300);
    expect(v.measurePointCount).toBe(0);
    expect(mark(v)).toBe('pointer');
    hoverXY(v, 400, 300);
    const list = v.measureCandidates(400, 300);
    expect(list).toHaveLength(4);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, 1));
    expect(mark(v)).toBe('pointer');
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, 0));
    expect(mark(v)).toBe('pointer');
    // 뷰어가 쓰지 않는 다른 키도 그대로(0.9.1)
    expect(key(v, 'x')).toBe(false);
    expect(mark(v)).toBe('pointer');
    expect(key(v, 'Tab')).toBe(true);
    expect(key(v, 'Escape')).toBe(true);
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(mark(v)).toBe('pointer');
    // 푼 뒤 Tab은 받지 않는다(초점 이동) — 0.9.1처럼 뗀다
    expect(key(v, 'Tab')).toBe(false);
    expect(mark(v)).toBeNull();
  });

  it('받지 않은 Tab은 0.116.0처럼 뗀다 — 후보가 하나인 자리, tabCycle을 켜지 않은 뷰어(Shift+Tab도). Ctrl+Tab은 두 판 모두 그대로', () => {
    const v = make();
    const s = v.project([30, 9, 0])!;
    const one = { x: s.x + 0.4, y: s.y + 0.3 };
    rightPress(v, one.x, one.y);
    hoverXY(v, one.x, one.y);
    expect(v.measureCandidates(one.x, one.y)).toHaveLength(1);
    expect(mark(v)).toBe('pointer');
    expect(key(v, 'Tab')).toBe(false);
    expect(mark(v)).toBeNull();
    const off = make({});
    expect(off.measureSnap).not.toHaveProperty('tabCycle');
    for (const shift of [false, true]) {
      rightPress(off, 400, 300);
      hoverXY(off, 400, 300);
      expect(off.measureCandidates(400, 300)).toHaveLength(4);
      expect(mark(off)).toBe('pointer');
      expect(key(off, 'Tab', shift)).toBe(false);
      expect(mark(off)).toBeNull();
    }
    rightPress(off, 400, 300);
    expect(key(off, 'Tab', false, true)).toBe(false);
    expect(mark(off)).toBe('pointer');
  });

  it('가상 커서가 켜진 동안의 Tab(가상 커서 후보 돌리기)은 0.116.0처럼 뗀다 — tabCycle을 켜도', () => {
    const v = make();
    v.setKeyboardSnap({});
    rightPress(v, 400, 300);
    hoverXY(v, 400, 300);
    expect(key(v, 'Enter')).toBe(true);
    expect(v.keyboardCursor).toMatchObject({ x: 400, y: 300, index: 0, count: 4 });
    expect(mark(v)).toBe('pointer');
    expect(key(v, 'Tab')).toBe(true);
    expect(v.keyboardCursor!.index).toBe(1);
    expect(mark(v)).toBeNull();
  });

  it('keyboard: false 앱이 capture 단계에서 handleKey로 넘겨 받은 Tab도 표시를 둔다(같은 사건) — 넘기지 않으면 코어는 키를 처리하지 않고 뗀다', () => {
    const v = make({ tabCycle: true }, { keyboard: false });
    const set = cv(v).listeners.get('keydown')!;
    const core = [...set];
    // 앱의 창 capture 리스너를 흉내 낸다 — 코어 캔버스 리스너보다 먼저, 같은 사건 객체로
    const app = (e: unknown): void => void v.handleKey(e as KeyboardEvent);
    set.clear();
    set.add(app);
    for (const f of core) set.add(f);
    rightPress(v, 400, 300);
    hoverXY(v, 400, 300);
    const list = v.measureCandidates(400, 300);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, 1));
    expect(mark(v)).toBe('pointer');
    set.delete(app);
    expect(key(v, 'Tab')).toBe(false);
    expect(v.measureHoverSnap).toEqual(cyc(list, 1));
    expect(mark(v)).toBeNull();
  });
});
