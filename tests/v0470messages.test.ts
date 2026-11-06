/**
 * 0.47.0 키보드 알림 글 바꾸기(46차가 남긴 것 — 코어 알림 글은 한국어 하나): setKeyboardSnap({ messages })에 열쇠 → 틀 글({0}·{1} 자리 — 앱 다국어 사전과 같은 꼴)을 주면
 * 그 틀로 알림 글을 만든다. 주지 않은 열쇠는 기본(한국어 KEY_SNAP_MESSAGES) — 0.46.0 글과 바이트까지 같다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type KeyboardSnapOptions, Viewer3d } from '../src/viewer';
import {
  KEY_SNAP_KEYS,
  KEY_SNAP_MESSAGES,
  PICK_KIND_LABELS,
  SNAP_KIND_LABELS,
  candidateText,
  formatKeySnapMessage,
  keySnapHint,
  keySnapMessages,
  pointText,
  snapKindText,
} from '../src/keysnap';
import * as entry from '../src/index';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Scene3d } from '../src/types';

/** 영어 틀(앱이 제 사전에서 주는 꼴의 예) */
const EN = {
  start: 'Virtual cursor on. {0}. {1}',
  end: 'Virtual cursor off',
  only: '{0} (only candidate)',
  candidate: '{0}: {1}',
  candidateDistance: '{0}: {1}, distance {2}',
  order: '{0} {1} of {2}',
  point: 'X {0}, Y {1}, Z {2}',
  noSnap: 'Nothing to snap',
  pickItem: '{1} of {0}',
  noPick: 'Nothing to pick',
  picked: 'Picked: {0}',
  pickedNothing: 'Picked empty space',
  noPoint: 'No point to place',
  firstPoint: 'First point placed. {0}: {1}',
  secondPoint: 'Second point placed. Distance {0}, dX {1}, dY {2}, dZ {3}',
  axisKind: '{0} axis',
  lockedKind: '{0} on locked line',
  hintMove: 'move {0}',
  hintNext: 'candidates {0}',
  hintCommit: 'place {0}',
  hintPick: 'pick {0}',
  hintExit: 'exit {0}',
  hintJoin: ', ',
  'snap.vertex': 'vertex',
  'snap.endpoint': 'endpoint',
  'snap.midpoint': 'midpoint',
  'snap.center': 'center',
  'snap.point': 'point',
  'snap.intersection': 'intersection',
  'snap.perpendicular': 'perpendicular',
  'snap.axis': 'axis',
  'snap.parallel': 'parallel',
  'snap.tangent': 'tangent',
  'snap.none': 'free point',
  'pick.mesh': 'face',
  'pick.line': 'segment',
  'pick.edge': 'edge',
  'pick.point': 'point',
  'pick.section': 'cut face',
} as const;

describe('키 붙잡기 글 틀(순수)', () => {
  it('formatKeySnapMessage: {n} 자리를 차례대로 바꾸고 없는 자리는 그대로', () => {
    expect(formatKeySnapMessage('{0} {1}/{2}', ['끝점', 1, 3])).toBe('끝점 1/3');
    expect(formatKeySnapMessage('{1} of {0}', ['a', 'b'])).toBe('b of a');
    expect(formatKeySnapMessage('{0}{0} {3}', ['x'])).toBe('xx {3}');
    expect(formatKeySnapMessage('{0}', ['$&$1'])).toBe('$&$1');
  });

  it('keySnapMessages: 준 열쇠만 바꾸고 글이 아닌 값·모르는 열쇠는 뺀다(기본 = KEY_SNAP_MESSAGES)', () => {
    expect(keySnapMessages()).toEqual(KEY_SNAP_MESSAGES);
    const m = keySnapMessages({ end: 'off', start: 3 as unknown as string, nope: 'x' } as never);
    expect(m.end).toBe('off');
    expect(m.start).toBe(KEY_SNAP_MESSAGES.start);
    expect('nope' in m).toBe(false);
    // 종류 이름 기본은 0.46.0 표와 같다
    for (const [k, v] of Object.entries(SNAP_KIND_LABELS)) expect(KEY_SNAP_MESSAGES[`snap.${k}` as keyof typeof KEY_SNAP_MESSAGES]).toBe(v);
    for (const [k, v] of Object.entries(PICK_KIND_LABELS)) expect(KEY_SNAP_MESSAGES[`pick.${k}` as keyof typeof KEY_SNAP_MESSAGES]).toBe(v);
  });

  it('기본 틀은 0.46.0 글과 같고, 틀을 주면 그 말로', () => {
    const num = (v: number): string => v.toFixed(1);
    expect(snapKindText('endpoint')).toBe('끝점');
    expect(snapKindText('axis', 'x', true)).toBe('잠근 선 위 X축');
    expect(snapKindText(null)).toBe('붙잡지 않은 점');
    expect(candidateText({ kind: 'endpoint', point: [1, 2, 3] }, 0, 3, num, 5, 'mm')).toBe('끝점 1/3: X 1.0, Y 2.0, Z 3.0, 거리 5.0 mm');
    expect(candidateText(null, 0, 0, num, null, '')).toBe('붙잡을 점이 없습니다');
    expect(keySnapHint(KEY_SNAP_KEYS, 'measure')).toBe('옮기기 ←→↑↓ · 후보 Tab · 찍기 Enter · 끄기 Esc');
    const en = keySnapMessages(EN);
    expect(snapKindText('axis', 'x', true, en)).toBe('X axis on locked line');
    expect(candidateText({ kind: 'endpoint', point: [1, 2, 3] }, 0, 3, num, 5, 'mm', en)).toBe('endpoint 1 of 3: X 1.0, Y 2.0, Z 3.0, distance 5.0 mm');
    expect(candidateText({ kind: 'center', point: [1, 2, 3] }, 0, 1, num, null, '', en)).toBe('center: X 1.0, Y 2.0, Z 3.0');
    expect(candidateText(null, 0, 0, num, null, '', en)).toBe('Nothing to snap');
    expect(pointText([1, 2, 3], num, en)).toBe('X 1.0, Y 2.0, Z 3.0');
    expect(keySnapHint(KEY_SNAP_KEYS, 'measure', false, en)).toBe('move ←→↑↓, candidates Tab, place Enter, exit Esc');
    expect(keySnapHint(KEY_SNAP_KEYS, 'pick', true, en)).toBe('move ←→↑↓, candidates Tab, pick Enter, exit Esc');
  });

  it('입구에서 내보낸다', () => {
    expect(entry.KEY_SNAP_MESSAGES).toBe(KEY_SNAP_MESSAGES);
    expect(entry.keySnapMessages).toBe(keySnapMessages);
    expect(entry.formatKeySnapMessage).toBe(formatKeySnapMessage);
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
function make(measuring: boolean, o: KeyboardSnapOptions): KeyboardSnapAnnouncement[] {
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
  return said;
}

describe('setKeyboardSnap messages(0.47.0)', () => {
  it('측정 모드: 켜기·찍기·끄기 글이 준 틀(영어)로, 값은 그대로', () => {
    const said = make(true, { messages: EN });
    const ko = make(true, {});
    for (const s of [said, ko]) {
      const v = views.at(s === said ? -2 : -1)!;
      key(v, 'Enter');
      key(v, 'Enter');
      key(v, 'Escape');
      key(v, 'Escape');
    }
    expect(said.map((a) => a.reason)).toEqual(ko.map((a) => a.reason));
    expect(said.map((a) => [a.index, a.count, a.snap, a.point, a.measurement])).toEqual(ko.map((a) => [a.index, a.count, a.snap, a.point, a.measurement]));
    expect(said[0]!.text).toMatch(/^Virtual cursor on\. endpoint: X -20(\.0+)?, Y 0(\.0+)?, Z 0(\.0+)?\. move ←→↑↓, candidates Tab, place Enter, exit Esc$/);
    expect(ko[0]!.text).toMatch(/^가상 커서를 켰습니다\. 끝점: X -20(\.0+)?, Y 0(\.0+)?, Z 0(\.0+)?\. 옮기기 ←→↑↓ · 후보 Tab · 찍기 Enter · 끄기 Esc$/);
    expect(said[1]!.text).toMatch(/^First point placed\. endpoint: X /);
    expect(ko[1]!.text).toMatch(/^첫 점을 찍었습니다\. 끝점: X /);
    expect(said.at(-1)!.text).toBe('Virtual cursor off');
    expect(ko.at(-1)!.text).toBe('가상 커서를 껐습니다');
  });

  it('고르기 모드: 고른 것 글(이름·종류 차례를 틀이 정한다)', () => {
    const said = make(false, { messages: EN });
    const v = views.at(-1)!;
    key(v, 'Enter');
    expect(said[0]!.text).toMatch(/^Virtual cursor on\. segment of Rail: X /);
    expect(said[0]!.text.endsWith('move ←→↑↓, candidates Tab, pick Enter, exit Esc')).toBe(true);
    key(v, 'Enter');
    expect(said[1]!.text).toBe('Picked: segment of Rail');
    // 일부 열쇠만 주면 나머지는 한국어 기본
    v.setKeyboardSnap({ messages: { picked: 'OK {0}' }, announce: (a) => said.push(a) });
    key(v, 'Enter');
    expect(said.at(-1)!.text).toBe('OK Rail 선분');
    expect(v.keyboardSnap!.messages).toEqual({ picked: 'OK {0}' });
  });
});
