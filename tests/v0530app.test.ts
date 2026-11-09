/**
 * 0.53.0 앱 요청 둘:
 *  - NC 55차: 키보드 알림 messages를 열쇠별 틀 대신 글 함수 (key, values) => string 으로도 받기(짧은 틀을 앱 번역 사전에 넣지 않게) — 틀 객체는 0.47.0 그대로
 *  - STEP 61차: 손가락 뷰 큐브를 펴고 접을 때 알림(onViewCubeExpandedChange — 앱이 pointerup·keyup에서 viewCubeExpanded를 다시 읽지 않게)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type KeyboardSnapOptions, type ViewCubeExpandEvent, Viewer3d } from '../src/viewer';
import { KEY_SNAP_KEYS, KEY_SNAP_MESSAGES, type KeySnapMessageKey, candidateText, keySnapHint, keySnapMessages, keySnapText, pointText, snapKindText } from '../src/keysnap';
import * as entry from '../src/index';
import { VIEW_DIRS, cameraBasis } from '../src/camera';
import { dot, normalize } from '../src/math';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Scene3d } from '../src/types';
import { CUBE_BAND, CUBE_TOUCH_BAND, CUBE_TOUCH_SIZE, cubeLayout, cubeTargets } from '../src/viewcube';

/** 앱 번역 함수의 예: 열쇠마다 앱 사전 글(자리 차례를 앱이 정한다) — 조각 틀(candidate·order·hintJoin 등)은 사전에 두지 않고 함수가 잇는다 */
const DICT: Partial<Record<KeySnapMessageKey, (v: readonly (string | number)[]) => string>> = {
  start: (v) => `Cursor on — ${v[0]} (${v[1]})`,
  end: () => 'Cursor off',
  candidate: (v) => `${v[0]} at ${v[1]}`,
  candidateDistance: (v) => `${v[0]} at ${v[1]}, ${v[2]} away`,
  order: (v) => `${v[0]} #${v[1]}/${v[2]}`,
  point: (v) => `(${v.join(', ')})`,
  pickItem: (v) => `${v[1]} “${v[0]}”`,
  picked: (v) => `Picked ${v[0]}`,
  firstPoint: (v) => `First: ${v[0]} ${v[1]}`,
  hintJoin: () => ' / ',
  'snap.endpoint': () => 'end',
  'pick.line': () => 'line',
  axisKind: (v) => `${v[0]}-axis`,
};
const fn = (key: KeySnapMessageKey, values: readonly (string | number)[]): string | undefined => DICT[key]?.(values);

describe('0.53.0 알림 글 함수(순수)', () => {
  it('keySnapText: 틀이면 0.47.0과 같은 글, 함수면 함수 글 — 글이 아니거나 던지면 그 열쇠의 기본 틀', () => {
    const num = (v: number): string => v.toFixed(1);
    expect(keySnapText(KEY_SNAP_MESSAGES, 'order', ['끝점', 1, 3])).toBe('끝점 1/3');
    expect(keySnapText(keySnapMessages({ order: '{0} {1} of {2}' }), 'order', ['a', 1, 3])).toBe('a 1 of 3');
    expect(keySnapText(fn, 'order', ['a', 1, 3])).toBe('a #1/3');
    // 함수가 모르는 열쇠(undefined) · 글이 아닌 값 · 던짐 → 기본 틀
    expect(keySnapText(fn, 'noSnap')).toBe(KEY_SNAP_MESSAGES.noSnap);
    expect(keySnapText(() => 3 as unknown as string, 'lockedKind', ['X축'])).toBe('잠근 선 위 X축');
    expect(
      keySnapText(() => {
        throw new Error('app');
      }, 'order', ['b', 2, 2]),
    ).toBe('b 2/2');
    // 함수는 열쇠와 그 틀의 자리 값 차례를 받는다(조각 글은 함수가 먼저 만든 것)
    const seen: [string, (string | number)[]][] = [];
    const rec = (k: KeySnapMessageKey, v: readonly (string | number)[]): string | undefined => (seen.push([k, [...v]]), fn(k, v));
    expect(candidateText({ kind: 'endpoint', point: [1, 2, 3] }, 1, 3, num, 5, 'mm', rec)).toBe('end #2/3 at (1.0, 2.0, 3.0), 5.0 mm away');
    expect(seen).toEqual([
      ['snap.endpoint', []],
      ['point', ['1.0', '2.0', '3.0']],
      ['order', ['end', 2, 3]],
      ['candidateDistance', ['end #2/3', '(1.0, 2.0, 3.0)', '5.0 mm']],
    ]);
    expect(snapKindText('axis', 'y', true, fn)).toBe('잠근 선 위 Y-axis');
    expect(snapKindText('weird' as never, undefined, false, fn)).toBe('weird');
    expect(pointText([0, 1, 2], num, fn)).toBe('(0.0, 1.0, 2.0)');
    expect(keySnapHint(KEY_SNAP_KEYS, 'measure', false, fn)).toBe('옮기기 ←→↑↓ / 후보 Tab / 찍기 Enter / 끄기 Esc');
    // 틀 객체·기본은 0.47.0 글 그대로
    expect(candidateText({ kind: 'endpoint', point: [1, 2, 3] }, 0, 3, num, 5, 'mm')).toBe('끝점 1/3: X 1.0, Y 2.0, Z 3.0, 거리 5.0 mm');
    expect(entry.keySnapText).toBe(keySnapText);
  });
});

// ───────────── 뷰어 ─────────────
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
function key(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
  v.renderNow();
}
const LINE: LineSet3d = { id: 'L', name: 'Rail', positions: new Float32Array([-20, 0, 0, 20, 0, 0]), color: [0.9, 0.9, 0.9, 1] };
const scene: Scene3d = { name: 'msg', units: 'mm', meshes: [boxMesh('B', [-10, -10, -30], [10, 10, -20], [0.6, 0.6, 0.6, 1])], lines: [LINE], points: [] };
function make(measuring: boolean, o: KeyboardSnapOptions): { v: Viewer3d; said: KeyboardSnapAnnouncement[] } {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [-20, 0, 0], distance: 120 });
  if (measuring) {
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true });
  }
  v.renderNow();
  const said: KeyboardSnapAnnouncement[] = [];
  v.setKeyboardSnap({ ...o, announce: (a) => said.push(a) });
  return { v, said };
}

describe('0.53.0 setKeyboardSnap({ messages: 함수 })', () => {
  it('측정 모드: 켜기·찍기·끄기 글을 함수가 만들고(모르는 열쇠는 한국어 기본), 값·차례는 틀·기본과 같다', () => {
    const a = make(true, { messages: fn }), b = make(true, {});
    for (const w of [a, b]) {
      key(w.v, 'Enter');
      key(w.v, 'Enter');
      key(w.v, 'Escape');
      key(w.v, 'Escape');
    }
    expect(a.said.map((x) => [x.reason, x.index, x.count, x.snap, x.point, x.measurement])).toEqual(b.said.map((x) => [x.reason, x.index, x.count, x.snap, x.point, x.measurement]));
    expect(a.said[0]!.text).toMatch(/^Cursor on — end at \(-20(\.0+)?, 0(\.0+)?, 0(\.0+)?\) \(옮기기 ←→↑↓ \/ 후보 Tab \/ 찍기 Enter \/ 끄기 Esc\)$/);
    expect(a.said[1]!.text).toMatch(/^First: end \(-20/);
    expect(a.said.at(-1)!.text).toBe('Cursor off');
    // 읽기 keyboardSnap.messages는 준 함수 그대로
    expect(a.v.keyboardSnap!.messages).toBe(fn);
  });

  it('고르기 모드: 고른 것 글(이름·종류)과 찍기 글, 틀 객체로 바꾸면 0.47.0 글', () => {
    const { v, said } = make(false, { messages: fn });
    key(v, 'Enter');
    expect(said[0]!.text).toMatch(/^Cursor on — line “Rail” at \(/);
    key(v, 'Enter');
    expect(said[1]!.text).toBe('Picked line “Rail”');
    v.setKeyboardSnap({ messages: { picked: 'OK {0}' }, announce: (a) => said.push(a) });
    key(v, 'Enter');
    expect(said.at(-1)!.text).toBe('OK Rail 선분');
    v.setKeyboardSnap({ messages: () => null, announce: (a) => said.push(a) });
    key(v, 'Enter');
    expect(said.at(-1)!.text).toBe('골랐습니다: Rail 선분');
  });
});

// 뷰 큐브(0.44.0 시험과 같은 누르기 도우미)
type CW = { v: Viewer3d; cube: FakeElement; canvas: FakeElement; got: [boolean, ViewCubeExpandEvent][] };
function cubeView(opts: ConstructorParameters<typeof Viewer3d>[1] = {}): CW {
  const host = dom.host();
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: true, viewCubeSize: 76, ...opts });
  views.push(v);
  v.setScene({ name: 't', units: 'mm', meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1])], lines: [] });
  const got: [boolean, ViewCubeExpandEvent][] = [];
  v.onViewCubeExpandedChange((x, e) => got.push([x, e]));
  return { v, cube: host.querySelector('.v3d-cube')!, canvas: v.canvas as unknown as FakeElement, got };
}
let pid = 100;
function tap(el: FakeElement, x: number, y: number, pointerType = 'touch'): void {
  const id = ++pid;
  const ev = { clientX: x, clientY: y, pointerId: id, pointerType, button: 0, buttons: 1, isPrimary: true, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  el.fire('pointerdown', ev);
  el.fire('pointerup', { ...ev, buttons: 0 });
}
function targetAt(v: Viewer3d, size: number, band: number, d: readonly number[]): [number, number] {
  const t = cubeTargets(cameraBasis(v.getCamera()), cubeLayout(size), band).find((x) => dot(x.dir, normalize(d)) > 0.9999)!;
  const q = t.pieces[0]!;
  return [(q[0]![0] + q[2]![0]) / 2, (q[0]![1] + q[2]![1]) / 2];
}

describe('0.53.0 손가락 뷰 큐브 펴기·접기 알림(onViewCubeExpandedChange)', () => {
  it('펴기(touch)·고르기(pick)·고를 것 없는 자리(cube)·3D 보기(canvas)·Esc(escape)·선택 바꾸기(option) — 바뀔 때만, 그때 viewCubeRect와 함께', () => {
    const w = cubeView();
    const [x, y] = targetAt(w.v, 76, CUBE_BAND, VIEW_DIRS.top);
    tap(w.cube, x, y);
    expect(w.got).toEqual([[true, { reason: 'touch', rect: w.v.viewCubeRect }]]);
    expect(w.got[0]![1].rect).toMatchObject({ width: CUBE_TOUCH_SIZE });
    // 편 큐브 자리 고르기 → 접힘('pick'), 카메라는 그 뷰로
    const [cx, cy] = targetAt(w.v, CUBE_TOUCH_SIZE, CUBE_TOUCH_BAND, [1, -1, 1]);
    tap(w.cube, cx, cy);
    expect(w.got.at(-1)).toEqual([false, { reason: 'pick', rect: w.v.viewCubeRect }]);
    expect(w.v.viewCubeRect).toMatchObject({ width: 76, height: 76 });
    expect(cameraBasis(w.v.getCamera()).back.map((v) => +v.toFixed(6))).toEqual(normalize([1, -1, 1]).map((v) => +v.toFixed(6)));
    expect(w.v.viewCubeExpanded).toBe(false);
    const reasons = (): string[] => w.got.map(([e, r]) => `${e ? '펴' : '접'}:${r.reason}`);
    tap(w.cube, x, y);
    tap(w.cube, 3, 3);
    tap(w.cube, x, y);
    w.canvas.fire('pointerdown', { clientX: 300, clientY: 300, pointerId: 999, pointerType: 'touch', button: 0, buttons: 1, isPrimary: true });
    w.canvas.fire('pointerup', { clientX: 300, clientY: 300, pointerId: 999, pointerType: 'touch', button: 0, buttons: 0, isPrimary: true });
    tap(w.cube, x, y);
    expect(w.v.handleKey({ key: 'Escape', preventDefault() {} } as unknown as KeyboardEvent)).toBe(true);
    tap(w.cube, x, y);
    w.v.setViewCubeSize(90);
    tap(w.cube, x, y);
    w.v.setViewCubeTouch({ size: 260 });
    tap(w.cube, x, y);
    w.v.setViewCubeVisible(false);
    expect(reasons()).toEqual([
      '펴:touch',
      '접:pick',
      '펴:touch',
      '접:cube',
      '펴:touch',
      '접:canvas',
      '펴:touch',
      '접:escape',
      '펴:touch',
      '접:option',
      '펴:touch',
      '접:option',
      '펴:touch',
      '접:option',
    ]);
    // 이미 접혀 있으면(바뀌지 않음) 알리지 않는다 — 마우스는 펴지 않는다
    const n = w.got.length;
    w.v.setViewCubeVisible(true);
    w.v.setViewCubeSize(76);
    w.v.handleKey({ key: 'Escape', preventDefault() {} } as unknown as KeyboardEvent);
    tap(w.cube, x, y, 'mouse');
    expect(w.got.length).toBe(n);
  });

  it('그만 받기·dispose 뒤에는 부르지 않는다, 끔(viewCubeTouch false)이면 펴지 않아 알림도 없다', () => {
    const w = cubeView();
    const other: boolean[] = [];
    const off = w.v.onViewCubeExpandedChange((x) => other.push(x));
    const [x, y] = targetAt(w.v, 76, CUBE_BAND, VIEW_DIRS.top);
    tap(w.cube, x, y);
    off();
    tap(w.cube, 3, 3);
    expect(other).toEqual([true]);
    expect(w.got.map((g) => g[0])).toEqual([true, false]);
    tap(w.cube, x, y);
    w.v.dispose();
    expect(w.got.length).toBe(3);
    const t = cubeView({ viewCubeTouch: false });
    tap(t.cube, x, y);
    expect(t.got).toEqual([]);
    expect(t.v.viewCubeExpanded).toBe(false);
  });
});
