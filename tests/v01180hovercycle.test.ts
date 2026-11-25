/**
 * 0.118.0 마우스 미리 보기 Tab 돌리기의 차례·수(MeasureHoverSnap.cycle — setMeasureSnap({ tabCycle: true })로 돌린 동안만):
 * Tab·Shift+Tab마다 measureHoverSnap.cycle과 onMeasureHoverChange 값의 차례·수(= measureCandidates 차례·길이), 한 바퀴 돌아 첫 후보에서도 알림과 칸,
 * 첫 후보에서 Esc로 풀어 같은 미리 보기에서 칸만 없어져도 알림 한 번(0.117.0은 없었다), Esc로 푼 뒤·포인터가 자리를 벗어난 뒤·다른 길이 다시 구한 뒤·찍은 뒤 칸 없음,
 * tabCycle 끔·가상 커서 Tab(알림 snap도)에서 칸 없음, 찍은 MeasurePoint·measureCandidates·commitMeasureCandidate 결과에 칸이 새지 않음(가짜 DOM·가짜 WebGL).
 * 장면은 0.116.0 시험과 같다(z = 0, 위에서 봄): L1 (0,0)–(20,0), L2 (5,−5)–(5,8)(교차점 X (5,0)), L3 (30,−10)–(30,14),
 * 앱 점 A 'center' (5.4, 0.3), B 'point' low (4.5, −0.45). 카메라 대상 SPOT (5.1, 0.12)이 캔버스 가운데(400, 300) — 그 자리 후보는 교차점·중심·점·붙잡지 않은 자리 넷이다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type MeasureHoverSnap, type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import { keySnapMessages, keySnapText, snapKindText } from '../src/keysnap';
import type { V3 } from '../src/math';
import type { LineSet3d, Scene3d, SnapPoint } from '../src/types';

const seg = (id: string, a: V3, b: V3): LineSet3d => ({ id, name: id, positions: new Float32Array([...a, ...b]), color: [0.9, 0.9, 0.9, 1] });
const scene: Scene3d = {
  name: 'hovercycle',
  units: 'mm',
  meshes: [],
  lines: [seg('L1', [0, 0, 0], [20, 0, 0]), seg('L2', [5, -5, 0], [5, 8, 0]), seg('L3', [30, -10, 0], [30, 14, 0])],
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
const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  cv(v).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const hoverXY = (v: Viewer3d, x: number, y: number): void => {
  ptr(v, 'pointermove', x, y, 0);
  v.renderNow();
};
/** 움직이지 않고 누른다(브라우저처럼 누르기 앞에 포인터 이동이 없다) */
const pressXY = (v: Viewer3d, x: number, y: number): void => {
  ptr(v, 'pointerdown', x, y, 1);
  ptr(v, 'pointerup', x, y, 0);
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

function make(o: Partial<MeasureSnapOptions> = { tabCycle: true }): Viewer3d {
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
/** 후보 i에 차례·수를 실은 값(0.118.0 돌린 동안의 measureHoverSnap) */
const at = (list: MeasureHoverSnap[], i: number): MeasureHoverSnap => ({ ...list[i]!, cycle: { index: i, count: list.length } });
/** 듣는 쪽을 단 뒤 그 자리에 올린다(받은 값 목록) */
function listen(v: Viewer3d): (MeasureHoverSnap | null)[] {
  const seen: (MeasureHoverSnap | null)[] = [];
  v.onMeasureHoverChange((s) => seen.push(s));
  hoverXY(v, 400, 300);
  return seen;
}

describe('Viewer3d: 마우스 미리 보기 Tab 돌리기의 차례·수(0.118.0 MeasureHoverSnap.cycle)', () => {
  it('Tab·Shift+Tab마다 measureHoverSnap과 onMeasureHoverChange 값에 차례·수(measureCandidates 차례·길이) — 한 바퀴 돌아 첫 후보에서도 알림과 칸, 첫 Tab 전에는 없음', () => {
    const v = make();
    const seen = listen(v);
    const list = v.measureCandidates(400, 300);
    expect(list.map((c) => c.snap)).toEqual(['intersection', 'center', 'point', null]);
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(v.measureHoverSnap).not.toHaveProperty('cycle');
    expect(seen.at(-1)).not.toHaveProperty('cycle');
    const n0 = seen.length;
    [1, 2, 3, 0, 1].forEach((i, k) => {
      expect(key(v, 'Tab')).toBe(true);
      expect(v.measureHoverSnap!.cycle).toEqual({ index: i, count: 4 });
      expect(v.measureHoverSnap).toEqual(at(list, i));
      expect(seen).toHaveLength(n0 + k + 1);
      expect(seen.at(-1)).toEqual(at(list, i));
    });
    // Shift+Tab은 앞으로(1 → 0 → 3)
    for (const i of [0, 3]) {
      expect(key(v, 'Tab', true)).toBe(true);
      expect(v.measureHoverSnap).toEqual(at(list, i));
      expect(seen.at(-1)).toEqual(at(list, i));
    }
    expect(seen).toHaveLength(n0 + 7);
    // 앱이 「중심 2/4」를 만드는 꼴(가상 커서 알림 글과 같은 틀 열쇠 'order')
    expect(key(v, 'Tab', true)).toBe(true);
    const s = v.measureHoverSnap!;
    expect(keySnapText(keySnapMessages(), 'order', [snapKindText(s.snap, s.axis, s.locked), s.cycle!.index + 1, s.cycle!.count])).toBe('점 3/4');
    expect(key(v, 'Tab', true)).toBe(true);
    const c = v.measureHoverSnap!;
    expect(keySnapText(keySnapMessages(), 'order', [snapKindText(c.snap, c.axis, c.locked), c.cycle!.index + 1, c.cycle!.count])).toBe('중심 2/4');
  });

  it('첫 후보에서 Esc로 풀면 같은 미리 보기에서 칸만 없어져도 한 번 알린다 — 푼 뒤 Tab(초점 이동)·다른 차례에서 푼 뒤도 칸 없음', () => {
    const v = make();
    const seen = listen(v);
    const list = v.measureCandidates(400, 300);
    for (let i = 0; i < 4; i++) expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(at(list, 0));
    const n = seen.length;
    expect(key(v, 'Escape')).toBe(true);
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(v.measureHoverSnap).not.toHaveProperty('cycle');
    expect(seen).toHaveLength(n + 1);
    expect(seen.at(-1)).toEqual(list[0]);
    // 푼 뒤 그 자리 Tab은 받지 않는다 — 칸·알림 없음
    expect(key(v, 'Tab')).toBe(false);
    expect(v.measureHoverSnap).not.toHaveProperty('cycle');
    expect(seen).toHaveLength(n + 1);
    // 4화소 넘게 옮겼다 돌아와 다시 돌리고, 다른 차례(2)에서 Esc — 첫 후보로·칸 없음
    hoverXY(v, 410, 300);
    hoverXY(v, 400, 300);
    expect(v.measureHoverSnap).not.toHaveProperty('cycle');
    expect(key(v, 'Tab')).toBe(true);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(at(list, 2));
    const m = seen.length;
    expect(key(v, 'Escape')).toBe(true);
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(seen).toHaveLength(m + 1);
    expect(seen.at(-1)).toEqual(list[0]);
  });

  it('4화소 안 이동은 칸을 두고, 벗어나거나 다른 길이 다시 구하거나(붙잡기 한도) 찍으면 칸이 없다 — 찍은 점에도', () => {
    const v = make();
    const seen = listen(v);
    const list = v.measureCandidates(400, 300);
    key(v, 'Tab');
    key(v, 'Tab');
    expect(v.measureHoverSnap).toEqual(at(list, 2));
    // 손 떨림(2.2화소): 그대로·알림 없음
    const n = seen.length;
    hoverXY(v, 402, 301);
    expect(v.measureHoverSnap).toEqual(at(list, 2));
    expect(seen).toHaveLength(n);
    // 4화소 넘게: 새 자리 미리 보기(칸 없음)
    hoverXY(v, 406, 300);
    expect(v.measureHoverSnap).toEqual(v.measureCandidates(406, 300)[0]);
    expect(v.measureHoverSnap).not.toHaveProperty('cycle');
    expect(seen.at(-1)).not.toHaveProperty('cycle');
    // 다른 길이 다시 구함(붙잡기 한도 — rehover)
    hoverXY(v, 400, 300);
    key(v, 'Tab');
    expect(v.measureHoverSnap).toEqual(at(list, 1));
    v.setMeasureSnapLimit(100);
    v.renderNow();
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(seen.at(-1)).toEqual(list[0]);
    // 찍기: 돌린 후보(점 B)를 누르면 찍은 점·찍은 뒤 미리 보기에 칸이 없다
    key(v, 'Tab');
    key(v, 'Tab');
    expect(v.measureHoverSnap).toEqual(at(list, 2));
    pressXY(v, 401, 300);
    expect(v.measurePointCount).toBe(1);
    const p = v.measurePoints[0]!;
    expect(p.snap).toBe('point');
    expect(p).not.toHaveProperty('cycle');
    expect(v.measureHoverSnap ?? {}).not.toHaveProperty('cycle');
    hoverXY(v, 400, 300);
    expect(v.measureHoverSnap).not.toBeNull();
    expect(v.measureHoverSnap).not.toHaveProperty('cycle');
    expect(seen.at(-1)).not.toHaveProperty('cycle');
  });

  it('돌리는 동안 measureCandidates·commitMeasureCandidate·찍은 점에는 칸이 새지 않는다(후보 목록은 상태를 바꾸지 않아 돌린 미리 보기·칸 그대로)', () => {
    const v = make();
    hoverXY(v, 400, 300);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap!.cycle).toEqual({ index: 1, count: 4 });
    const list = v.measureCandidates(400, 300);
    expect(list).toHaveLength(4);
    for (const c of list) expect(c).not.toHaveProperty('cycle');
    expect(v.measureHoverSnap).toEqual(at(list, 1));
    expect(v.commitMeasureCandidate(400, 300, 1)).toBe(true);
    expect(v.measurePointCount).toBe(1);
    expect(v.measurePoints[0]!.snap).toBe('center');
    expect(v.measurePoints[0]).not.toHaveProperty('cycle');
    expect(v.measureHoverSnap ?? {}).not.toHaveProperty('cycle');
    // 두 점째도 돌린 후보를 눌러 찍는다 — 두 점 모두 칸 없음
    hoverXY(v, 401, 300);
    const two = v.measureCandidates(401, 300);
    expect(two.length).toBeGreaterThan(1);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap!.cycle).toEqual({ index: 1, count: two.length });
    pressXY(v, 401, 300);
    expect(v.measurePointCount).toBe(2);
    for (const q of v.measurePoints) expect(q).not.toHaveProperty('cycle');
  });

  it('tabCycle을 켜지 않으면·가상 커서 Tab에서는 칸이 없다(키보드 붙잡기 알림 snap도) — 켠 뷰어의 마우스 Tab만 싣는다', () => {
    const off = make({});
    hoverXY(off, 400, 300);
    expect(off.measureCandidates(400, 300)).toHaveLength(4);
    expect(key(off, 'Tab')).toBe(false);
    expect(key(off, 'Tab', true)).toBe(false);
    expect(off.measureHoverSnap).not.toHaveProperty('cycle');

    const v = make();
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => said.push(a) });
    hoverXY(v, 400, 300);
    const list = v.measureCandidates(400, 300);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(at(list, 1));
    expect(said).toHaveLength(0);
    // 가상 커서를 켜면 그 커서의 후보 — 칸 없음(차례는 keyboardCursor·알림 index·count)
    expect(key(v, 'ArrowRight')).toBe(true);
    expect(v.keyboardCursor).toMatchObject({ x: 400, y: 300, index: 0, count: 4 });
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(key(v, 'Tab')).toBe(true);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.keyboardCursor!.index).toBe(2);
    expect(v.measureHoverSnap).toEqual(list[2]);
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.measureHoverSnap).toEqual(list[1]);
    expect(said.at(-1)).toMatchObject({ reason: 'cycle', index: 1, count: 4 });
    expect(said.length).toBeGreaterThan(3);
    for (const a of said) expect(a.snap ?? {}).not.toHaveProperty('cycle');
  });
});
