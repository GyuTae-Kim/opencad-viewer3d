/**
 * 0.120.0 Shift+Tab을 누르려고 먼저 누른 Shift가 방향 후보를 잠근 것 되돌리기(0.116.0 남은 한계 — 미루지 않고 같은 누름 되돌리기):
 * Shift keydown이 방향을 잠근 뒤 그 같은 누름 동안 다른 키·누르기·4화소 넘는 이동·떠남·다른 길의 다시 구하기 없이 Shift+Tab이 오면, 잠금을 걸기 전으로 되돌리고
 * 앞 후보로 돌린다(마우스 미리 보기 tabCycle — 돌리던 차례의 앞, 돌리지 않았으면 잠그지 않은 그 자리 후보의 끝 / 가상 커서 — 누를 때 목록·차례의 앞).
 * 걸기 전 그 자리 후보가 하나면 받지 않고 잠근 그대로, 되돌린 같은 누름은 뗄 때까지 다시 잠그지 않고, 뗀 뒤 새 Shift는 잠근다.
 * keydown 없는 shiftKey 이동 잠금(0.10.0)·tabCycle 끔은 0.119.0과 같다(가짜 DOM·가짜 WebGL).
 * 장면은 0.116.0 시험 장면에 L4 (11,2)–(17,10)을 더한 것(z = 0, 위에서 봄): L1 (0,0)–(20,0), L2 (5,−5)–(5,8)(교차점 X (5,0)), L3 (30,−10)–(30,14),
 * 앱 점 A 'center' (5.4, 0.3), B 'point' low (4.5, −0.45). 카메라 대상 SPOT (5.1, 0.12)이 캔버스 가운데(400, 300). 첫 점은 L2 위 끝 (5, 8) —
 * SPOT 자리 후보에 첫 점 Y축(L2 방향)이 있고, L4가 첫 점 X축(y = 8)을 (15.5, 8)에서 가로지르는 자리는 첫 후보가 X축·둘째가 L4 위 점이다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type MeasureHoverSnap, type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { LineSet3d, Scene3d, SnapPoint } from '../src/types';

const seg = (id: string, a: V3, b: V3): LineSet3d => ({ id, name: id, positions: new Float32Array([...a, ...b]), color: [0.9, 0.9, 0.9, 1] });
const scene: Scene3d = {
  name: 'shiftundo',
  units: 'mm',
  meshes: [],
  lines: [seg('L1', [0, 0, 0], [20, 0, 0]), seg('L2', [5, -5, 0], [5, 8, 0]), seg('L3', [30, -10, 0], [30, 14, 0]), seg('L4', [11, 2, 0], [17, 10, 0])],
  points: [],
};
const A: V3 = [5.4, 0.3, 0];
const B: V3 = [4.5, -0.45, 0];
const SPOT: V3 = [5.1, 0.12, 0];
const APP: SnapPoint[] = [
  { point: A, kind: 'center' },
  { point: B, kind: 'point', priority: 'low' },
];
const INF = { intersections: true, perpendicular: true, axes: true };
const LOCK: Partial<MeasureSnapOptions> = { tabCycle: true, inference: { ...INF, lock: true } };

const g = globalThis as unknown as Record<string, unknown>;
/** 창 리스너(가짜 DOM의 창은 듣기를 버리므로 여기서 모은다 — Shift를 누른 동안의 창 keyup capture) */
const win = new Map<string, Set<(e: unknown) => void>>();
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  g.addEventListener = (type: string, fn: (e: unknown) => void): void => {
    let s = win.get(type);
    if (!s) win.set(type, (s = new Set()));
    s.add(fn);
  };
  g.removeEventListener = (type: string, fn: (e: unknown) => void): void => void win.get(type)?.delete(fn);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  for (const v of views) v.dispose();
  vi.useRealTimers();
  dom.restore();
});

const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number, shiftKey = false): void =>
  cv(v).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey, altKey: false, ctrlKey: false, metaKey: false });
const hoverXY = (v: Viewer3d, x: number, y: number, shiftKey = false): void => {
  ptr(v, 'pointermove', x, y, 0, shiftKey);
  v.renderNow();
};
/** 캔버스에 keydown을 보낸다. 기본 동작을 막았는지 돌려준다 */
function key(v: Viewer3d, k: string, shift = false): boolean {
  let prevented = false;
  cv(v).fire('keydown', {
    key: k,
    code: '',
    shiftKey: shift,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault() {
      prevented = true;
    },
  });
  v.renderNow();
  return prevented;
}
/** Shift 누름(캔버스 keydown — 기본 동작은 막지 않는다) */
const shiftDown = (v: Viewer3d): void => expect(key(v, 'Shift', true)).toBe(false);
/** Shift 뗌(캔버스 keyup) */
const shiftUp = (v: Viewer3d): void => {
  cv(v).fire('keyup', { key: 'Shift', code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
  v.renderNow();
};
/** 0.118.0 Tab으로 돌린 동안의 미리 보기 값: 후보 i에 차례·수 */
const cyc = (list: MeasureHoverSnap[], i: number): MeasureHoverSnap => ({ ...list[i]!, cycle: { index: i, count: list.length } });
const AXIS_Y = { kind: 'axis', axis: 'y', source: 'shift' };
const AXIS_X = { kind: 'axis', axis: 'x', source: 'shift' };

function make(o: Partial<MeasureSnapOptions> = LOCK): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
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
/** 첫 점을 L2 위 끝 (5, 8)에 찍는다 */
function first(v: Viewer3d): void {
  const top = v.project([5, 8, 0])!;
  hoverXY(v, top.x + 0.4, top.y + 0.3);
  ptr(v, 'pointerdown', top.x + 0.4, top.y + 0.3, 1);
  ptr(v, 'pointerup', top.x + 0.4, top.y + 0.3, 0);
  v.renderNow();
  expect(v.measurePointCount).toBe(1);
}
/** 첫 점 뒤 SPOT(400, 300)에서 Tab으로 첫 점 Y축 후보까지 돌린 뷰어와 그 자리 후보 목록·축 차례 */
function atAxis(o: Partial<MeasureSnapOptions> = LOCK): { v: Viewer3d; list: MeasureHoverSnap[]; ai: number } {
  const v = make(o);
  first(v);
  hoverXY(v, 400, 300);
  const list = v.measureCandidates(400, 300);
  const ai = list.findIndex((c) => c.snap === 'axis');
  expect(ai).toBeGreaterThan(0);
  expect(list[ai]!.axis).toBe('y');
  for (let i = 0; i < ai; i++) expect(key(v, 'Tab')).toBe(true);
  expect(v.measureHoverSnap).toEqual(cyc(list, ai));
  return { v, list, ai };
}
/** L4가 첫 점 X축을 가로지르는 자리 곁(L4 위 (15.68, 8.24) — 첫 후보 X축, 둘째 L4 위 점) */
const crossing = (v: Viewer3d): { x: number; y: number } => {
  const s = v.project([15.68, 8.24, 0])!;
  return { x: s.x + 0.2, y: s.y + 0.15 };
};

describe('Viewer3d: Shift+Tab 앞의 Shift 잠금을 같은 누름에서 되돌리기(0.120.0)', () => {
  it('돌린 방향 후보에서 Shift로 잠근 같은 누름의 Shift+Tab은 잠금을 되돌리고 돌리던 차례의 앞 후보 — 되풀이·4화소 안 shiftKey 이동은 다시 잠그지 않고, 뗀 뒤 새 Shift는 잠근다', () => {
    const { v, list, ai } = atAxis();
    const n = list.length;
    const seen: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => seen.push(s));
    shiftDown(v);
    expect(v.measureInferenceLock).toMatchObject(AXIS_Y);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'y', locked: true });
    expect(v.measureHoverSnap).not.toHaveProperty('cycle');
    // 같은 누름의 Shift+Tab: 걸기 전(잠금 없음)으로 되돌리고 돌리던 차례의 앞 후보(기본 동작을 막는다), 알림도 그 값
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.measureInferenceLock).toBeNull();
    expect(v.measureHoverSnap).toEqual(cyc(list, ai - 1));
    expect(seen.at(-1)).toEqual(cyc(list, ai - 1));
    expect(v.measureCandidates(400, 300)).toEqual(list);
    // 키 되풀이·같은 누름의 4화소 안 shiftKey 이동은 다시 잠그지 않는다(돌린 후보 그대로)
    shiftDown(v);
    hoverXY(v, 401.5, 300.5, true);
    expect(v.measureInferenceLock).toBeNull();
    expect(v.measureHoverSnap).toEqual(cyc(list, ai - 1));
    // 같은 누름의 다음 Shift+Tab은 돌리기를 잇는다
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, (ai - 2 + n) % n));
    expect(v.measureInferenceLock).toBeNull();
    // 뗀 뒤 Tab으로 축 후보에 돌아와 새로 누르면 잠그고, 그 누름의 Shift+Tab은 다시 되돌린다
    shiftUp(v);
    expect(key(v, 'Tab')).toBe(true);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, ai));
    shiftDown(v);
    expect(v.measureInferenceLock).toMatchObject(AXIS_Y);
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.measureInferenceLock).toBeNull();
    expect(v.measureHoverSnap).toEqual(cyc(list, ai - 1));
    shiftUp(v);
    expect(v.measureInferenceLock).toBeNull();
    // 뗀 뒤 그 자리 누르기는 보인 후보를 찍는다(잠그지 않은 점)
    ptr(v, 'pointerdown', 400, 300, 1);
    ptr(v, 'pointerup', 400, 300, 0);
    v.renderNow();
    expect(v.measurePointCount).toBe(2);
    expect(v.measurePoints[1]!.snap).toBe(list[ai - 1]!.snap);
    expect(v.measurePoints[1]!).not.toHaveProperty('locked');
  });

  it('돌리지 않던 방향 후보(그 자리 첫 후보)에서도 같은 누름의 Shift+Tab은 잠그지 않은 그 자리 후보의 끝 후보 — 걸기 전 후보가 하나면 받지 않고 잠근 그대로', () => {
    const v = make();
    first(v);
    const c = crossing(v);
    hoverXY(v, c.x, c.y);
    const list = v.measureCandidates(c.x, c.y);
    expect(list.length).toBeGreaterThan(1);
    expect(list[0]).toMatchObject({ snap: 'axis', axis: 'x' });
    expect(v.measureHoverSnap).toEqual(list[0]);
    shiftDown(v);
    expect(v.measureInferenceLock).toMatchObject(AXIS_X);
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.measureInferenceLock).toBeNull();
    expect(v.measureHoverSnap).toEqual(cyc(list, list.length - 1));
    shiftUp(v);
    // 빈 곳의 첫 점 X축(후보 하나): 받지 않고(기본 동작) 잠근 그대로
    const e = v.project([24, 8.25, 0])!;
    hoverXY(v, e.x + 0.3, e.y + 0.2);
    expect(v.measureCandidates(e.x + 0.3, e.y + 0.2)).toHaveLength(1);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x' });
    shiftDown(v);
    expect(v.measureInferenceLock).toMatchObject(AXIS_X);
    expect(key(v, 'Tab', true)).toBe(false);
    expect(v.measureInferenceLock).toMatchObject(AXIS_X);
    expect(v.measureHoverSnap).toMatchObject({ locked: true });
  });

  it('되돌리기를 버리는 차례는 0.119.0처럼 잠근 채: 4화소 넘는 이동·다른 키(캔버스·누른 동안 창 keyup)·떠남·다른 길의 다시 구하기, keydown 없는 shiftKey 이동 잠금', () => {
    const cases: [string, (v: Viewer3d) => void][] = [
      [
        '4화소 넘게 갔다 돌아옴',
        (v) => {
          hoverXY(v, 406, 300, true);
          hoverXY(v, 400, 300, true);
        },
      ],
      ['캔버스 다른 키', (v) => void key(v, 'A', true)],
      ['창 keyup 다른 키', () => win.get('keyup')!.forEach((fn) => fn({ key: '1', shiftKey: true }))],
      [
        '떠남',
        (v) => {
          cv(v).fire('pointerleave', {});
          hoverXY(v, 400, 300, true);
        },
      ],
      ['다른 길의 다시 구하기', (v) => void v.setMeasurePickThrough(true)],
    ];
    for (const [name, step] of cases) {
      const { v } = atAxis();
      shiftDown(v);
      expect(v.measureInferenceLock, name).toMatchObject(AXIS_Y);
      step(v);
      v.renderNow();
      key(v, 'Tab', true);
      expect(v.measureInferenceLock, name).toMatchObject(AXIS_Y);
      expect(v.measureHoverSnap, name).toMatchObject({ locked: true });
    }
    // keydown 없이 Shift를 누른 채 움직여 잠근 것(0.10.0)은 되돌리지 않는다
    const { v } = atAxis();
    hoverXY(v, 400, 300, true);
    expect(v.measureInferenceLock).toMatchObject(AXIS_Y);
    key(v, 'Tab', true);
    expect(v.measureInferenceLock).toMatchObject(AXIS_Y);
  });

  it('tabCycle 끔은 0.119.0과 같다: Shift로 잠근 같은 누름의 Shift+Tab은 기본 동작(초점 이동)이고 잠근 그대로', () => {
    const v = make({ inference: { ...INF, lock: true } });
    expect(v.measureSnap).not.toHaveProperty('tabCycle');
    first(v);
    const c = crossing(v);
    hoverXY(v, c.x, c.y);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x' });
    shiftDown(v);
    expect(v.measureInferenceLock).toMatchObject(AXIS_X);
    expect(key(v, 'Tab', true)).toBe(false);
    expect(v.measureInferenceLock).toMatchObject(AXIS_X);
    expect(v.measureHoverSnap).toMatchObject({ locked: true });
  });

  it('가상 커서: 방향 후보에서 Shift로 잠근 같은 누름의 Shift+Tab은 누를 때 후보 목록·차례로 되돌려 앞 후보를 알린다', () => {
    const v = make();
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => said.push(a) });
    first(v);
    expect(key(v, 'ArrowRight')).toBe(true);
    const kl = v.measureCandidates(400, 300, { pointerType: 'keyboard' });
    const ki = kl.findIndex((s) => s.snap === 'axis');
    expect(ki).toBeGreaterThan(0);
    expect(v.keyboardCursor).toMatchObject({ x: 400, y: 300, index: 0, count: kl.length });
    for (let i = 0; i < ki; i++) expect(key(v, 'Tab')).toBe(true);
    expect(v.keyboardCursor!.index).toBe(ki);
    expect(v.measureHoverSnap).toEqual(kl[ki]);
    shiftDown(v);
    expect(v.measureInferenceLock).toMatchObject(AXIS_Y);
    expect(said.at(-1)!.reason).toBe('refresh');
    expect(v.measureHoverSnap).toMatchObject({ locked: true });
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.measureInferenceLock).toBeNull();
    expect(v.keyboardCursor).toMatchObject({ index: ki - 1, count: kl.length });
    expect(v.measureHoverSnap).toEqual(kl[ki - 1]);
    expect(said.at(-1)).toMatchObject({ reason: 'cycle', index: ki - 1, count: kl.length });
    // 같은 누름의 다음 Shift+Tab은 그 목록을 잇는다(다시 잠그지 않는다)
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.keyboardCursor!.index).toBe((ki - 2 + kl.length) % kl.length);
    expect(v.measureInferenceLock).toBeNull();
  });
});
