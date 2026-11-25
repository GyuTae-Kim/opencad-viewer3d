/**
 * 0.116.0 마우스 미리 보기에서 Tab으로 같은 자리 후보 돌리기(setMeasureSnap({ tabCycle: true }) — AutoCAD 객체 스냅 Tab 돌리기):
 * 켰을 때 겹친 후보 자리에서 Tab·Shift+Tab이 미리 보기를 measureCandidates 차례로 돌리고(기본 동작을 막고 onMeasureHoverChange 한 번씩), 누르면 그 후보를 찍고,
 * 4화소 안 이동은 돌린 미리 보기를 두고 넘으면 첫 후보부터, 돌리는 중 Esc는 돌리기를 풀고(측정 지우기보다 먼저) 푼 뒤 Tab은 초점 이동,
 * 후보 하나·빈 곳·캔버스가 아닌 대상·막힌 키는 Tab 기본 동작, 가상 커서가 켜진 동안은 가상 커서 Tab, 돌린 방향 후보의 Shift 잠금,
 * 끄면 0.115.0과 같고 꼴이 틀린 값은 주지 않은 것(가짜 DOM·가짜 WebGL).
 * 장면은 0.46.0 키보드 붙잡기 시험과 같다(z = 0, 위에서 봄): L1 (0,0)–(20,0), L2 (5,−5)–(5,8)(교차점 X (5,0)), L3 (30,−10)–(30,14),
 * 앱 점 A 'center' (5.4, 0.3), B 'point' low (4.5, −0.45). 카메라 대상 SPOT (5.1, 0.12)이 캔버스 가운데(400, 300) — 그 자리 후보는 교차점·중심·점·붙잡지 않은 자리 넷이다.
 * 0.118.0: 돌린 동안의 미리 보기 값에는 차례·수(cycle)가 실려 견주는 값에 더한다(cyc — 칸 자체는 v01180hovercycle 시험).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type MeasureHoverSnap, type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { LineSet3d, Scene3d, SnapPoint } from '../src/types';

const seg = (id: string, a: V3, b: V3): LineSet3d => ({ id, name: id, positions: new Float32Array([...a, ...b]), color: [0.9, 0.9, 0.9, 1] });
const scene: Scene3d = {
  name: 'tabcycle',
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
const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number, shiftKey = false): void =>
  cv(v).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey, altKey: false, ctrlKey: false, metaKey: false });
const hoverXY = (v: Viewer3d, x: number, y: number, shiftKey = false): void => {
  ptr(v, 'pointermove', x, y, 0, shiftKey);
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
const r6 = (p: readonly number[]): number[] => p.map((x) => Math.round(x * 1e6) / 1e6);
/** 0.118.0 Tab으로 돌린 동안의 미리 보기 값: 후보 i에 차례·수 */
const cyc = (list: MeasureHoverSnap[], i: number): MeasureHoverSnap => ({ ...list[i]!, cycle: { index: i, count: list.length } });

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
/** L3 위 (30, 9)(후보가 하나뿐인 자리 — 붙잡지 않은 선분 위 점)의 화면 자리(경계를 비켜 조금 옆) */
const lonely = (v: Viewer3d): { x: number; y: number } => {
  const s = v.project([30, 9, 0])!;
  expect(s.onScreen).toBe(true);
  return { x: s.x + 0.4, y: s.y + 0.3 };
};

describe('Viewer3d: 마우스 미리 보기 Tab 돌리기(0.116.0 setMeasureSnap tabCycle)', () => {
  it('measureSnap: true일 때만 열쇠, 꼴이 틀린 값은 주지 않은 것(Tab 기본 동작), 이것만으로는 붙잡기를 켜지 않는다', () => {
    const v = make();
    expect(v.measureSnap!.tabCycle).toBe(true);
    for (const bad of [false, null, 1, 'yes', {}, [true]]) {
      v.setMeasureSnap({ points: APP, midpoints: true, inference: INF, tabCycle: bad as never });
      expect(v.measureSnap).not.toHaveProperty('tabCycle');
      hoverXY(v, 400, 300);
      const before = v.measureHoverSnap;
      expect(key(v, 'Tab')).toBe(false);
      expect(key(v, 'Tab', true)).toBe(false);
      expect(v.measureHoverSnap).toEqual(before);
    }
    v.setMeasureSnap({ tabCycle: true });
    expect(v.measureSnap).toBeNull();
    hoverXY(v, 402, 300);
    expect(key(v, 'Tab')).toBe(false);
  });

  it('켜면: 겹친 후보 자리에서 Tab·Shift+Tab이 미리 보기를 measureCandidates 차례로 돌리고 기본 동작을 막는다 — onMeasureHoverChange는 한 번씩', () => {
    const v = make();
    hoverXY(v, 400, 300);
    const list = v.measureCandidates(400, 300);
    expect(list.map((c) => c.snap)).toEqual(['intersection', 'center', 'point', null]);
    expect(v.measureHoverSnap).toEqual(list[0]);
    const seen: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => seen.push(s));
    for (let i = 1; i <= 5; i++) {
      expect(key(v, 'Tab')).toBe(true);
      expect(v.measureHoverSnap).toEqual(cyc(list, i % 4));
      expect(seen).toHaveLength(i);
      expect(seen.at(-1)).toEqual(cyc(list, i % 4));
    }
    // Shift+Tab은 앞으로(1 → 0 → 3)
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, 0));
    expect(key(v, 'Tab', true)).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, 3));
    expect(seen).toHaveLength(7);
    // 대상이 없는 합성 키(앱이 만든 키)도 받는다
    const ev = { key: 'Tab', code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} } as unknown as KeyboardEvent;
    expect(v.handleKey(ev)).toBe(true);
    v.renderNow();
    expect(v.measureHoverSnap).toEqual(cyc(list, 0));
  });

  it('누르면 보인 후보를 찍는다 — 4화소 안 이동은 돌린 미리 보기를 두고, 넘으면 돌리기를 버린다(새 자리 미리 보기 = 첫 후보)', () => {
    const v = make();
    hoverXY(v, 400, 300);
    const list = v.measureCandidates(400, 300);
    key(v, 'Tab');
    key(v, 'Tab');
    expect(v.measureHoverSnap).toEqual(cyc(list, 2));
    // 손 떨림(2.2화소)에는 그대로
    hoverXY(v, 402, 301);
    expect(v.measureHoverSnap).toEqual(cyc(list, 2));
    pressXY(v, 402, 301);
    expect(v.measurePointCount).toBe(1);
    const p = v.measurePoints[0]!;
    expect(p.snap).toBe('point');
    expect(r6(p.point)).toEqual(r6(B));
    // 찍은 뒤 돌리기는 끝 — 다음 이동은 보통 미리 보기
    hoverXY(v, 401, 300);
    expect(v.measureHoverSnap).toEqual(v.measureCandidates(401, 300)[0]);

    const w = make();
    hoverXY(w, 400, 300);
    key(w, 'Tab');
    expect(w.measureHoverSnap).toEqual(cyc(list, 1));
    hoverXY(w, 406, 300);
    expect(w.measureHoverSnap).toEqual(w.measureCandidates(406, 300)[0]);
    hoverXY(w, 400, 300);
    expect(w.measureCandidates(400, 300)).toEqual(list);
    expect(w.measureHoverSnap).toEqual(list[0]);
    // 다시 처음부터 돈다
    expect(key(w, 'Tab')).toBe(true);
    expect(w.measureHoverSnap).toEqual(cyc(list, 1));
    // 4화소 넘게 옮긴 자리를 누르면 그 자리 보통 찍기(돌린 후보가 아니다)
    key(w, 'Tab');
    pressXY(w, 408, 300);
    expect(w.measurePointCount).toBe(1);
    expect(w.measurePoints[0]!.snap).not.toBe('point');
  });

  it('미리 보기를 다른 길이 다시 구하면(붙잡기 한도 — rehover) 돌리기도 끝나 Tab은 첫 후보부터', () => {
    const v = make();
    hoverXY(v, 400, 300);
    const list = v.measureCandidates(400, 300);
    key(v, 'Tab');
    key(v, 'Tab');
    expect(v.measureHoverSnap).toEqual(cyc(list, 2));
    v.setMeasureSnapLimit(100);
    v.renderNow();
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, 1));
  });

  it('Esc: 돌리는 중이면 풀고 첫 후보로(측정 지우기보다 먼저) — 푼 뒤 그 자리 Tab은 초점 이동, 다음 Esc는 측정 지우기, 포인터를 옮기면 다시 돈다', () => {
    const v = make();
    const one = lonely(v);
    hoverXY(v, one.x, one.y);
    pressXY(v, one.x, one.y);
    expect(v.measurePointCount).toBe(1);
    hoverXY(v, 400, 300);
    const list = v.measureCandidates(400, 300);
    expect(list.length).toBeGreaterThan(1);
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, 1));
    expect(key(v, 'Escape')).toBe(true);
    expect(v.measurePointCount).toBe(1);
    expect(v.measureHoverSnap).toEqual(list[0]);
    // 푼 뒤: Tab은 기본 동작(초점 이동 — 키보드 덫 없음), 4화소 안 이동에도 그대로
    expect(key(v, 'Tab')).toBe(false);
    expect(key(v, 'Tab', true)).toBe(false);
    hoverXY(v, 401, 301);
    expect(key(v, 'Tab')).toBe(false);
    expect(v.measurePointCount).toBe(1);
    // 돌리지 않을 때의 Esc는 뷰어 Esc 그대로(측정 지우기)
    expect(key(v, 'Escape')).toBe(true);
    expect(v.measurePointCount).toBe(0);
    expect(key(v, 'Escape')).toBe(false);
    // 4화소 넘게 옮겼다 돌아오면 다시 돈다
    hoverXY(v, 410, 300);
    hoverXY(v, 400, 300);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap!.snap).toBe('center');
  });

  it('Tab 기본 동작 그대로: 후보 하나·빈 곳·포인터가 떠난 뒤·캔버스가 아닌 대상·막힌 키·측정 밖(preventDefault 안 함)', () => {
    const v = make();
    const one = lonely(v);
    expect(v.measureCandidates(one.x, one.y)).toHaveLength(1);
    hoverXY(v, one.x, one.y);
    const h1 = v.measureHoverSnap;
    expect(h1).not.toBeNull();
    expect(key(v, 'Tab')).toBe(false);
    expect(key(v, 'Tab', true)).toBe(false);
    expect(v.measureHoverSnap).toEqual(h1);
    expect(v.measureCandidates(700, 520).length).toBeLessThan(2);
    hoverXY(v, 700, 520);
    expect(key(v, 'Tab')).toBe(false);
    hoverXY(v, 400, 300);
    cv(v).fire('pointerleave', {});
    v.renderNow();
    expect(key(v, 'Tab')).toBe(false);
    hoverXY(v, 400, 300);
    const other = dom.host();
    const ev = (extra: Record<string, unknown>): KeyboardEvent =>
      ({ key: 'Tab', code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, ...extra }) as unknown as KeyboardEvent;
    expect(v.handleKey(ev({ target: other }))).toBe(false);
    expect(v.handleKey(ev({ target: v.canvas, defaultPrevented: true }))).toBe(false);
    expect(v.handleKey(ev({ target: v.canvas, ctrlKey: true }))).toBe(false);
    expect(v.measureHoverSnap!.snap).toBe('intersection');
    v.setMeasureMode(false);
    expect(key(v, 'Tab')).toBe(false);
  });

  it('가상 커서: 켜지 않은 동안은 마우스 Tab 돌리기(알림 없음), 켜진 동안은 가상 커서 Tab이 앞선다', () => {
    const v = make();
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => said.push(a) });
    hoverXY(v, 400, 300);
    const list = v.measureCandidates(400, 300);
    expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, 1));
    expect(said).toHaveLength(0);
    expect(v.keyboardCursor).toBeNull();
    expect(key(v, 'ArrowRight')).toBe(true);
    expect(v.keyboardCursor).toMatchObject({ x: 400, y: 300, index: 0, count: 4 });
    expect(key(v, 'Tab')).toBe(true);
    expect(v.keyboardCursor!.index).toBe(1);
    expect(said.at(-1)!.reason).toBe('cycle');
    expect(v.measureHoverSnap).toEqual(list[1]);
    // 가상 커서 Esc(지울 측정이 없으면 커서 끄기)
    expect(key(v, 'Escape')).toBe(true);
    expect(v.keyboardCursor).toBeNull();
  });

  it('돌린 방향 후보(첫 점 Y축)는 잠글 방향이고 Shift로 그 방향에 잠근다(inference.lock)', () => {
    const v = make({ tabCycle: true, inference: { ...INF, lock: true } });
    const top = v.project([5, 8, 0])!;
    hoverXY(v, top.x + 0.4, top.y + 0.3);
    pressXY(v, top.x + 0.4, top.y + 0.3);
    expect(v.measurePointCount).toBe(1);
    expect(r6(v.measurePoints[0]!.point)).toEqual([5, 8, 0]);
    hoverXY(v, 400, 300);
    const list = v.measureCandidates(400, 300);
    const ai = list.findIndex((c) => c.snap === 'axis');
    expect(ai).toBeGreaterThan(0);
    expect(list[ai]!.axis).toBe('y');
    for (let i = 0; i < ai; i++) expect(key(v, 'Tab')).toBe(true);
    expect(v.measureHoverSnap).toEqual(cyc(list, ai));
    expect(v.measureHoverLock).toMatchObject({ kind: 'axis', axis: 'y' });
    // Shift를 누른 채 제자리 이동 → 지금(돌린) 미리 보기의 방향으로 잠근다
    hoverXY(v, 400, 300, true);
    expect(v.measureInferenceLock).toMatchObject({ kind: 'axis', axis: 'y' });
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'y', locked: true });
  });

  it('끄면 0.115.0과 같다: Tab은 기본 동작이고 미리 보기·찍기·Esc가 켠 뷰어(Tab을 누르지 않음)와 같다', () => {
    const off = make({});
    const on = make();
    expect(off.measureSnap).not.toHaveProperty('tabCycle');
    for (const [x, y] of [
      [400, 300],
      [403, 297],
      [700, 520],
    ] as const) {
      hoverXY(off, x, y);
      hoverXY(on, x, y);
      expect(off.measureHoverSnap).toEqual(on.measureHoverSnap);
    }
    hoverXY(off, 400, 300);
    const h = off.measureHoverSnap;
    expect(key(off, 'Tab')).toBe(false);
    expect(key(off, 'Tab', true)).toBe(false);
    expect(off.measureHoverSnap).toEqual(h);
    pressXY(off, 400, 300);
    hoverXY(on, 400, 300);
    pressXY(on, 400, 300);
    expect(off.measurePoints).toEqual(on.measurePoints);
    expect(off.measurePoints[0]!.snap).toBe('intersection');
    expect(key(off, 'Escape')).toBe(true);
    expect(key(on, 'Escape')).toBe(true);
    expect(off.measurePointCount).toBe(0);
    expect(on.measurePointCount).toBe(0);
  });
});
