/**
 * 0.46.0 키보드로 3D 붙잡기·고르기(STEP 53차 요청 — WCAG 2.1.1): setKeyboardSnap(기본 꺼짐)을 켜면 캔버스에 초점이 있을 때 화살표로 가상 커서를 옮기고,
 * Tab·Shift+Tab으로 그 자리의 붙잡기 후보를 돌리고(AutoCAD 객체 스냅 Tab 돌리기), Enter로 찍는다(측정 모드가 아니면 고르기 — onPick). Esc는 뷰어 Esc 뒤에 커서를 끈다.
 * 후보 차례 = 같은 measureAt을 앞 후보 자리를 빼고 다시 부른 차례(measureCandidates — 순수 API와 같다).
 * 장면(z = 0, 위에서 봄): L1 (0,0)–(20,0), L2 (5,−5)–(5,8)(L1과 교차점 X (5,0)), L3 (30,−10)–(30,14). 앱 점 A 'center' (5.4, 0.3), B 'point' low (4.5, −0.45).
 * 카메라 대상을 SPOT (5.1, 0.12)에 두어 캔버스 가운데(가상 커서를 켜는 자리)가 SPOT이다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type KeyboardSnapOptions, type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import {
  KEY_BIG_STEP_PX,
  KEY_CANDIDATES_MAX,
  KEY_POINTER,
  KEY_SNAP_KEYS,
  KEY_STEP_PX,
  candidateText,
  keyLabel,
  keySnapAction,
  keySnapHint,
  moveKeyCursor,
  normalizeKeySnapKeys,
  parseKeyDesc,
  snapKindText,
} from '../src/keysnap';
import { VIEW_KEYS } from '../src/camera';
import * as entry from '../src/index';
import type { V3 } from '../src/math';
import type { LineSet3d, Pick3d, Scene3d, SnapPoint } from '../src/types';

const seg = (id: string, a: V3, b: V3): LineSet3d => ({ id, name: id, positions: new Float32Array([...a, ...b]), color: [0.9, 0.9, 0.9, 1] });
const scene: Scene3d = {
  name: 'keysnap',
  units: 'mm',
  meshes: [],
  lines: [seg('L1', [0, 0, 0], [20, 0, 0]), seg('L2', [5, -5, 0], [5, 8, 0]), seg('L3', [30, -10, 0], [30, 14, 0])],
  points: [],
};
const X: V3 = [5, 0, 0];
const A: V3 = [5.4, 0.3, 0];
const B: V3 = [4.5, -0.45, 0];
const SPOT: V3 = [5.1, 0.12, 0];
const APP: SnapPoint[] = [
  { point: A, kind: 'center' },
  { point: B, kind: 'point', priority: 'low' },
];

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
const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number, pointerType = 'mouse'): void =>
  cv(v).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType, button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const hoverXY = (v: Viewer3d, x: number, y: number): void => {
  ptr(v, 'pointermove', x, y, 0);
  v.renderNow();
};
const clickXY = (v: Viewer3d, x: number, y: number): void => {
  hoverXY(v, x, y);
  ptr(v, 'pointerdown', x, y, 1);
  ptr(v, 'pointerup', x, y, 0);
  v.renderNow();
};
/** 캔버스에 keydown을 보낸다. 기본 동작을 막았는지 돌려준다 */
function key(v: Viewer3d, k: string, mods: { shift?: boolean; alt?: boolean; ctrl?: boolean; meta?: boolean } = {}): boolean {
  let prevented = false;
  cv(v).fire('keydown', {
    key: k,
    code: '',
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    preventDefault() {
      prevented = true;
    },
  });
  v.renderNow();
  return prevented;
}
const r6 = (p: readonly number[]): number[] => p.map((x) => Math.round(x * 1e6) / 1e6);

function make(o: Partial<MeasureSnapOptions> | null = {}, measuring = true): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [...SPOT], distance: 80 });
  if (measuring) v.setMeasureMode(true);
  if (o) v.setMeasureSnap({ points: APP, midpoints: true, inference: { intersections: true, perpendicular: true, axes: true }, ...o });
  v.renderNow();
  return v;
}
function withKeys(v: Viewer3d, o: KeyboardSnapOptions = {}): KeyboardSnapAnnouncement[] {
  const said: KeyboardSnapAnnouncement[] = [];
  v.setKeyboardSnap({ ...o, announce: (a) => said.push(a) });
  return said;
}

describe('keysnap 순수 함수', () => {
  it('parseKeyDesc: 수정 키와 키, 끝의 +, 모르는 수정 키·빈 글은 null', () => {
    expect(parseKeyDesc('Tab')).toEqual({ key: 'Tab', shift: false, alt: false, ctrl: false, meta: false });
    expect(parseKeyDesc('Shift+Tab')).toEqual({ key: 'Tab', shift: true, alt: false, ctrl: false, meta: false });
    expect(parseKeyDesc('ctrl+alt+ArrowLeft')).toEqual({ key: 'ArrowLeft', shift: false, alt: true, ctrl: true, meta: false });
    expect(parseKeyDesc('Cmd+k')).toEqual({ key: 'k', shift: false, alt: false, ctrl: false, meta: true });
    expect(parseKeyDesc('Shift++')).toEqual({ key: '+', shift: true, alt: false, ctrl: false, meta: false });
    expect(parseKeyDesc('+')).toEqual({ key: '+', shift: false, alt: false, ctrl: false, meta: false });
    for (const bad of ['', 'Hyper+x', 'Shift+', 3 as unknown as string]) expect(parseKeyDesc(bad)).toBeNull();
  });

  it('normalizeKeySnapKeys: 준 할 일만 바꾸고 빈 목록·null은 끄고 풀 수 없는 글은 뺀다', () => {
    expect(normalizeKeySnapKeys()).toEqual(KEY_SNAP_KEYS);
    const k = normalizeKeySnapKeys({ next: ['n', 'Hyper+q'], prev: null, exit: [] });
    expect(k.next).toEqual(['n']);
    expect(k.prev).toEqual([]);
    expect(k.exit).toEqual([]);
    expect(k.left).toEqual(['ArrowLeft']);
    expect(k.commit).toEqual(['Enter']);
  });

  it('keySnapAction: 기본 표(옮기기는 Shift면 크게, 찍기는 Shift를 받는다, 그 밖은 수정 키가 꼭 같아야)', () => {
    expect(keySnapAction({ key: 'ArrowLeft' })).toEqual({ action: 'left', big: false });
    expect(keySnapAction({ key: 'ArrowDown', shiftKey: true })).toEqual({ action: 'down', big: true });
    expect(keySnapAction({ key: 'Tab' })).toEqual({ action: 'next', big: false });
    expect(keySnapAction({ key: 'Tab', shiftKey: true })).toEqual({ action: 'prev', big: false });
    expect(keySnapAction({ key: 'Enter' })).toEqual({ action: 'commit', big: false });
    expect(keySnapAction({ key: 'Enter', shiftKey: true })).toEqual({ action: 'commit', big: false });
    expect(keySnapAction({ key: 'Escape' })).toEqual({ action: 'exit', big: false });
    for (const e of [{ key: 'ArrowLeft', ctrlKey: true }, { key: 'Tab', altKey: true }, { key: 'Enter', metaKey: true }, { key: 'Escape', shiftKey: true }, { key: 'Shift', shiftKey: true }, { key: '' }])
      expect(keySnapAction(e)).toBeNull();
  });

  it('기본 키는 뷰어 키(F·1~7)·세 앱 키(H·I·Home·F7·Space·T·PageUp·PageDown·?·Delete·Backspace)와 겹치지 않는다', () => {
    const others = ['f', 'F', ...Object.keys(VIEW_KEYS), 'h', 'H', 'i', 'I', 'Home', 'End', 'F7', ' ', 't', 'T', 'PageUp', 'PageDown', '?', 'Delete', 'Backspace', 'w', 'a', 's', 'd', 'q', 'e'];
    for (const k of others) for (const shiftKey of [false, true]) expect(keySnapAction({ key: k, shiftKey })).toBeNull();
  });

  it('keySnapAction: 수정 키를 꼭 같게 적은 키가 먼저(앱이 Shift+→를 다음 후보로), 한 글자 키는 대소문자를 가리지 않는다', () => {
    const keys = normalizeKeySnapKeys({ next: ['Shift+ArrowRight', 'n'], prev: ['P'] });
    expect(keySnapAction({ key: 'ArrowRight', shiftKey: true }, keys)).toEqual({ action: 'next', big: false });
    expect(keySnapAction({ key: 'ArrowRight' }, keys)).toEqual({ action: 'right', big: false });
    // 'n'은 Shift 없이 — Caps Lock의 'N'도 같은 키, Shift+N은 다른 키(다음 후보는 Shift를 받지 않는다)
    expect(keySnapAction({ key: 'N' }, keys)).toEqual({ action: 'next', big: false });
    expect(keySnapAction({ key: 'N', shiftKey: true }, keys)).toBeNull();
    expect(keySnapAction({ key: 'n' }, keys)).toEqual({ action: 'next', big: false });
    expect(keySnapAction({ key: 'p' }, keys)).toEqual({ action: 'prev', big: false });
    expect(keySnapAction({ key: 'Tab' }, keys)).toBeNull();
  });

  it('moveKeyCursor: 걸음·큰 걸음, 캔버스 안으로 당긴다', () => {
    expect(moveKeyCursor({ x: 10, y: 10 }, 'right', false, 5, 50, 100, 80)).toEqual({ x: 15, y: 10 });
    expect(moveKeyCursor({ x: 10, y: 10 }, 'up', true, 5, 50, 100, 80)).toEqual({ x: 10, y: 0 });
    expect(moveKeyCursor({ x: 98, y: 79 }, 'right', true, 5, 50, 100, 80)).toEqual({ x: 100, y: 79 });
    expect(moveKeyCursor({ x: 98, y: 79 }, 'down', false, 5, 50, 100, 80)).toEqual({ x: 98, y: 80 });
    expect(moveKeyCursor({ x: 3, y: 4 }, 'next', false, 5, 50, 100, 80)).toEqual({ x: 3, y: 4 });
    expect(KEY_STEP_PX).toBe(5);
    expect(KEY_BIG_STEP_PX).toBe(50);
    expect(KEY_CANDIDATES_MAX).toBe(16);
    expect(KEY_POINTER).toBe('keyboard');
  });

  it('글: 종류 이름·키 이름·안내·후보 글', () => {
    expect(snapKindText('endpoint')).toBe('끝점');
    expect(snapKindText('axis', 'y')).toBe('Y축');
    expect(snapKindText(null)).toBe('붙잡지 않은 점');
    expect(snapKindText('axis', 'x', true)).toBe('잠근 선 위 X축');
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('Shift+Tab')).toBe('Shift+Tab');
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keySnapHint(KEY_SNAP_KEYS, 'measure')).toBe('옮기기 ←→↑↓ · 후보 Tab · 찍기 Enter · 끄기 Esc');
    expect(keySnapHint(KEY_SNAP_KEYS, 'pick')).toBe('옮기기 ←→↑↓ · 고르기 Enter · 끄기 Esc');
    expect(keySnapHint(normalizeKeySnapKeys({ left: ['Alt+ArrowLeft'], next: [], exit: null }), 'measure')).toBe('옮기기 Alt+← → ↑ ↓ · 찍기 Enter');
    const num = (v: number): string => String(Math.round(v * 100) / 100);
    expect(candidateText({ kind: 'center', point: [1, 2.5, 0] }, 1, 3, num, null, 'mm')).toBe('중심 2/3: X 1, Y 2.5, Z 0');
    expect(candidateText({ kind: 'endpoint', point: [1, 2, 3] }, 0, 1, num, 4.5, 'mm')).toBe('끝점: X 1, Y 2, Z 3, 거리 4.5 mm');
    expect(candidateText(null, 0, 0, num, null, '')).toBe('붙잡을 점이 없습니다');
  });

  it('입구가 같은 값을 내보낸다', () => {
    expect(entry.KEY_SNAP_KEYS).toBe(KEY_SNAP_KEYS);
    expect(entry.keySnapAction).toBe(keySnapAction);
    expect(entry.KEY_POINTER).toBe(KEY_POINTER);
  });
});

describe('뷰어 — 측정 후보 목록(measureCandidates·commitMeasureCandidate)', () => {
  it('차례 = 교차점 → 중심(앱) → low 앱 점 → 붙잡지 않은 점, 첫째는 같은 자리 마우스 미리 보기와 같고 뷰어 상태를 바꾸지 않는다', () => {
    const v = make();
    hoverXY(v, 400, 300);
    const mouse = v.measureHoverSnap;
    const list = v.measureCandidates(400, 300);
    expect(list.map((c) => c.snap)).toEqual(['intersection', 'center', 'point', null]);
    expect(list[0]).toEqual(mouse);
    expect(r6(list[1]!.point)).toEqual(r6(A));
    expect(r6(list[2]!.point)).toEqual(r6(B));
    // 붙잡지 않은 점은 L1·L2 위(고르기가 고른 선분 위 점 — 선분 식별자가 실린다)
    expect(list[3]!.segment).toBeDefined();
    expect(Math.abs(list[3]!.point[2])).toBeLessThan(1e-9);
    // 상태 그대로: 미리 보기·찍은 점
    expect(v.measureHoverSnap).toEqual(mouse);
    expect(v.measurePointCount).toBe(0);
    expect(v.measureCandidates(400, 300, { max: 2 }).map((c) => c.snap)).toEqual(['intersection', 'center']);
    // 측정 모드가 아니면 빈 목록
    v.setMeasureMode(false);
    expect(v.measureCandidates(400, 300)).toEqual([]);
  });

  it('commitMeasureCandidate는 그 차례 후보를 찍는다(누르기와 같은 onMeasure), 없는 차례는 false', () => {
    const v = make();
    const got: unknown[] = [];
    v.onMeasure((m) => got.push(m));
    expect(v.commitMeasureCandidate(400, 300, 1)).toBe(true);
    expect(v.measurePoints[0]!.snap).toBe('center');
    expect(r6(v.measurePoints[0]!.point)).toEqual(r6(A));
    expect(v.commitMeasureCandidate(400, 300, 9)).toBe(false);
    expect(v.commitMeasureCandidate(400, 300, -1)).toBe(false);
    expect(v.commitMeasureCandidate(400, 300, 0)).toBe(true);
    expect(got.length).toBe(1);
    expect((got[0] as { snapA: string; snapB: string }).snapA).toBe('center');
    expect((got[0] as { snapA: string; snapB: string }).snapB).toBe('intersection');
  });

  it('첫 점 뒤 점 붙잡기가 없는 자리: 선 추론(축) → fallback 앱 점 → 붙잡지 않은 점', () => {
    const v = make({ points: [{ point: [5.3, 3.2, 0], kind: 'point', priority: 'fallback' }] });
    v.commitMeasureCandidate(400, 300, 0); // 첫 점 = 교차점 X
    expect(r6(v.measurePoints[0]!.point)).toEqual(r6(X));
    const s = v.project([5, 3, 0])!;
    const list = v.measureCandidates(s.x + 0.31, s.y + 0.17);
    expect(list.map((c) => c.snap)).toEqual(['axis', 'point', null]);
    expect(list[0]!.axis).toBe('y');
    hoverXY(v, s.x + 0.31, s.y + 0.17);
    expect(v.measureHoverSnap).toEqual(list[0]);
  });

  it('다듬기(refine)와 잠금도 같은 규칙: 붙잡지 않은 선분 위 점은 onEdge로 다듬고, 잠근 동안은 모든 후보가 잠근 선 위다', () => {
    const asked: string[] = [];
    const v = make({
      refine: (inp) => {
        asked.push(inp.kind);
        return inp.kind === 'onEdge' ? [inp.point[0], inp.point[1] + 0.01, inp.point[2]] : null;
      },
    });
    const list = v.measureCandidates(400, 300);
    expect(list.map((c) => c.snap)).toEqual(['intersection', 'center', 'point', null]);
    expect(list.map((c) => c.refined ?? false)).toEqual([false, false, false, true]);
    expect(asked).toContain('onEdge');
    v.commitMeasureCandidate(400, 300, 0);
    expect(v.setMeasureInferenceLock('y')).toBe(true);
    const locked = v.measureCandidates(400, 300);
    expect(locked.length).toBe(4);
    for (const c of locked) {
      expect(c.locked).toBe(true);
      expect(c.axis).toBe('y');
      expect(Math.abs(c.point[0] - 5)).toBeLessThan(1e-9);
    }
    // 교차점 X는 잠근 선 위 그 점(내린 자리가 같아 from이 없다), 중심·low 앱 점은 잠근 선에 내린 자리, 끝은 커서를 내린 자리
    expect(locked.map((c) => c.fromSnap)).toEqual([undefined, 'center', 'point', undefined]);
    expect(r6(locked[0]!.point)).toEqual(r6(X));
    expect(r6(locked[1]!.point)).toEqual([5, 0.3, 0]);
    expect(r6(locked[2]!.point)).toEqual([5, -0.45, 0]);
    expect(Math.abs(locked[3]!.point[1] - SPOT[1])).toBeLessThan(0.02);
  });

  it('붙잡기 선택이 없으면(0.7.2 규칙) 끝점 → 고른 자리', () => {
    const v = make(null);
    const s = v.project([20, 0, 0])!;
    const list = v.measureCandidates(s.x - 2.31, s.y + 0.17);
    expect(list.map((c) => c.snap)).toEqual(['endpoint', null]);
    expect(r6(list[0]!.point)).toEqual([20, 0, 0]);
    expect(list[1]!.point[0]).toBeLessThan(20);
  });
});

describe('뷰어 — 키보드 붙잡기(setKeyboardSnap)', () => {
  it('끄면(기본) 화살표·Tab·Enter를 받지 않고 기본 동작도 막지 않는다', () => {
    const v = make();
    expect(v.keyboardSnap).toBeNull();
    expect(key(v, 'ArrowRight')).toBe(false);
    expect(key(v, 'Tab')).toBe(false);
    expect(key(v, 'Enter')).toBe(false);
    expect(v.keyboardCursor).toBeNull();
    expect(v.measureHoverSnap).toBeNull();
    expect(v.measurePointCount).toBe(0);
  });

  it('화살표로 켜고(캔버스 가운데) Tab·Shift+Tab으로 후보를 돌리며 알린다 — 차례는 measureCandidates와 같다', () => {
    const v = make();
    const said = withKeys(v);
    const list = v.measureCandidates(400, 300);
    expect(key(v, 'ArrowRight')).toBe(true);
    expect(v.keyboardCursor).toEqual({ x: 400, y: 300, mode: 'measure', index: 0, count: 4 });
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(said.at(-1)!.reason).toBe('start');
    // 수는 측정 글과 같은 꼴(이 장면은 소수 넷째 자리)
    expect(said.at(-1)!.text).toBe(`가상 커서를 켰습니다. 교차점 1/4: X 5.0000, Y 0.0000, Z 0.0000. 옮기기 ←→↑↓ · 후보 Tab · 찍기 Enter · 끄기 Esc`);
    const seen: (string | null)[] = [];
    for (let i = 0; i < 5; i++) {
      expect(key(v, 'Tab')).toBe(true);
      seen.push(v.measureHoverSnap!.snap);
      expect(said.at(-1)!.reason).toBe('cycle');
      expect(said.at(-1)!.snap).toEqual(v.measureHoverSnap);
    }
    expect(seen).toEqual(['center', 'point', null, 'intersection', 'center']);
    expect(v.measureHoverSnap).toEqual(list[1]);
    expect(key(v, 'Tab', { shift: true })).toBe(true);
    expect(v.measureHoverSnap).toEqual(list[0]);
    expect(key(v, 'Tab', { shift: true })).toBe(true);
    expect(v.measureHoverSnap).toEqual(list[3]);
    expect(said.at(-1)!.index).toBe(3);
    expect(said.at(-1)!.count).toBe(4);
    expect(said.at(-1)!.text.startsWith('붙잡지 않은 점 4/4: X ')).toBe(true);
  });

  it('Enter로 찍은 첫째 후보는 같은 자리 마우스 누르기와 같은 점·같은 onMeasure다', () => {
    const m = make();
    clickXY(m, 400, 300);
    // 둘째 점: (12, 0) 둘레의 걸음 자리(키보드가 닿는 화소 — 첫 점 X축 위)
    const steps = Math.round((m.project([12, 0, 0])!.x - 400) / KEY_STEP_PX);
    clickXY(m, 400 + steps * KEY_STEP_PX, 300);
    expect(m.measurePoints.map((p) => p.snap)).toEqual(['intersection', 'axis']);
    const k = make();
    const kSaid = withKeys(k);
    const res: unknown[] = [];
    k.onMeasure((r) => res.push(r));
    key(k, 'ArrowRight');
    key(k, 'Enter');
    expect(k.measurePoints).toEqual([m.measurePoints[0]]);
    expect(kSaid.at(-1)!.reason).toBe('commit');
    expect(kSaid.at(-1)!.point).toEqual(m.measurePoints[0]);
    expect(kSaid.at(-1)!.text).toMatch(/^첫 점을 찍었습니다\. 교차점: X 5(\.0+)?, Y 0(\.0+)?, Z 0(\.0+)?$/);
    for (let i = 0; i < steps; i++) key(k, 'ArrowRight');
    expect(k.keyboardCursor!.x).toBe(400 + steps * KEY_STEP_PX);
    // 첫 점 X축 → 붙잡지 않은 L1 위 점(두 후보)
    expect(kSaid.at(-1)!.text).toMatch(/^X축 1\/2: X [\d.]+, Y 0\.0000, Z 0\.0000, 거리 [\d.]+ mm$/);
    expect(k.measureCandidates(k.keyboardCursor!.x, 300).map((c) => c.snap)).toEqual(['axis', null]);
    key(k, 'Enter');
    expect(res.length).toBe(1);
    expect(k.measurePoints).toEqual(m.measurePoints);
    expect(k.measurement()).toEqual(m.measurement());
    const last = kSaid.at(-1)!;
    expect(last.measurement).toEqual(m.measurement());
    expect(last.text).toMatch(/^둘째 점을 찍었습니다\. 거리 [\d.]+ mm, X 차 [\d.]+, Y 차 0(\.0+)?, Z 차 0(\.0+)?$/);
  });

  it('Tab으로 고른 후보를 Enter로 찍는다(low 앱 점)', () => {
    const v = make();
    withKeys(v);
    key(v, 'ArrowUp');
    key(v, 'Tab');
    key(v, 'Tab');
    expect(v.measureHoverSnap!.snap).toBe('point');
    key(v, 'Enter');
    expect(v.measurePoints[0]!.snap).toBe('point');
    expect(r6(v.measurePoints[0]!.point)).toEqual(r6(B));
    // 찍은 뒤에도 커서는 켜져 있고 같은 자리에서 다음 미리 보기(차례 처음)
    expect(v.keyboardCursor).toMatchObject({ x: 400, y: 300, index: 0 });
    expect(v.measureHoverSnap).not.toBeNull();
  });

  it('화살표 걸음: 5화소, Shift면 50화소, 캔버스 가장자리에서 멈춘다', () => {
    const v = make();
    const o = { step: undefined as number | undefined };
    withKeys(v, o);
    key(v, 'ArrowLeft');
    key(v, 'ArrowLeft');
    expect(v.keyboardCursor).toMatchObject({ x: 395, y: 300 });
    key(v, 'ArrowDown', { shift: true });
    expect(v.keyboardCursor).toMatchObject({ x: 395, y: 350 });
    for (let i = 0; i < 10; i++) key(v, 'ArrowUp', { shift: true });
    expect(v.keyboardCursor).toMatchObject({ x: 395, y: 0 });
    v.setKeyboardSnap({ step: 2, bigStep: 7 });
    expect(v.keyboardSnap).toMatchObject({ step: 2, bigStep: 7 });
    key(v, 'ArrowRight');
    key(v, 'ArrowRight', { shift: true });
    expect(v.keyboardCursor).toMatchObject({ x: 404, y: 0 });
  });

  it('Tab은 커서가 켜진 측정 모드에서만 받는다(켜기 전·고르기 모드·끈 뒤는 초점 이동 그대로)', () => {
    const v = make();
    withKeys(v);
    expect(key(v, 'Tab')).toBe(false);
    expect(key(v, 'Tab', { shift: true })).toBe(false);
    expect(v.keyboardCursor).toBeNull();
    key(v, 'ArrowRight');
    expect(key(v, 'Tab')).toBe(true);
    v.setMeasureMode(false);
    expect(v.keyboardCursor).toMatchObject({ mode: 'pick', count: 0 });
    expect(key(v, 'Tab')).toBe(false);
    v.setMeasureMode(true);
    expect(v.keyboardCursor).toMatchObject({ mode: 'measure', count: 4 });
    expect(key(v, 'Escape')).toBe(true);
    expect(v.keyboardCursor).toBeNull();
    expect(key(v, 'Tab')).toBe(false);
  });

  it('Esc 차례: 찍은 점이 있으면 측정을 지우고(커서·미리 보기는 그대로), 지울 것이 없으면 커서를 끄고, 그다음은 받지 않는다', () => {
    const v = make();
    const said = withKeys(v);
    key(v, 'ArrowRight');
    key(v, 'Enter');
    expect(v.measurePointCount).toBe(1);
    expect(key(v, 'Escape')).toBe(true);
    expect(v.measurePointCount).toBe(0);
    expect(v.keyboardCursor).not.toBeNull();
    expect(v.measureHoverSnap!.snap).toBe('intersection');
    expect(key(v, 'Escape')).toBe(true);
    expect(v.keyboardCursor).toBeNull();
    expect(v.measureHoverSnap).toBeNull();
    expect(said.at(-1)).toMatchObject({ reason: 'end', text: '가상 커서를 껐습니다' });
    expect(key(v, 'Escape')).toBe(false);
  });

  it('캔버스가 아닌 대상의 키(앱이 다른 칸에서 넘긴 것)·앱이 이미 막은 키·걷기 중 화살표는 받지 않는다', () => {
    const v = make();
    withKeys(v);
    const other = dom.host();
    const ev = (k: string, extra: Record<string, unknown> = {}): KeyboardEvent =>
      ({ key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, ...extra }) as unknown as KeyboardEvent;
    expect(v.handleKey(ev('ArrowRight', { target: other }))).toBe(false);
    expect(v.handleKey(ev('ArrowRight', { target: v.canvas, defaultPrevented: true }))).toBe(false);
    expect(v.keyboardCursor).toBeNull();
    // 대상이 없는 합성 사건(앱이 만든 키)은 받는다
    expect(v.handleKey(ev('ArrowRight'))).toBe(true);
    expect(v.keyboardCursor).not.toBeNull();
    // 켠 뒤에도 다른 칸의 Tab·Enter는 받지 않는다
    expect(v.handleKey(ev('Tab', { target: other }))).toBe(false);
    expect(v.handleKey(ev('Enter', { target: other }))).toBe(false);
    expect(v.measurePointCount).toBe(0);
    v.setMeasureMode(false);
    v.setNavigation('walk');
    expect(v.handleKey(ev('ArrowUp', { target: v.canvas }))).toBe(true); // 걷기 키
    expect(v.keyboardCursor).toBeNull();
    v.handleKeyUp(ev('ArrowUp', { target: v.canvas }));
    v.setNavigation('orbit');
  });

  it('포인터: 켤 때 자리에서 4화소 넘게 움직이거나 누르면 끄고, 그 안의 제자리 사건은 넘긴다. 초점이 문서 안 다른 곳으로 가면 끈다', () => {
    const v = make();
    const said = withKeys(v);
    hoverXY(v, 100, 100);
    key(v, 'ArrowRight');
    const kc = v.measureHoverSnap;
    hoverXY(v, 102, 101);
    expect(v.keyboardCursor).not.toBeNull();
    expect(v.measureHoverSnap).toEqual(kc);
    // 포인터가 캔버스를 떠나도 가상 커서 미리 보기는 둔다
    cv(v).fire('pointerleave', {});
    v.renderNow();
    expect(v.measureHoverSnap).toEqual(kc);
    hoverXY(v, 110, 100);
    expect(v.keyboardCursor).toBeNull();
    expect(said.at(-1)!.reason).toBe('end');
    // 다시 켜고 누르면 끈다
    key(v, 'ArrowRight');
    expect(v.keyboardCursor).not.toBeNull();
    ptr(v, 'pointerdown', 110, 100, 1);
    ptr(v, 'pointerup', 110, 100, 0);
    expect(v.keyboardCursor).toBeNull();
    // 창만 흐려지면 두고(문서 초점은 캔버스), 초점이 다른 곳으로 가면 끈다
    key(v, 'ArrowRight');
    dom.doc.activeElement = v.canvas;
    cv(v).fire('blur', {});
    expect(v.keyboardCursor).not.toBeNull();
    dom.doc.activeElement = dom.host();
    cv(v).fire('blur', {});
    expect(v.keyboardCursor).toBeNull();
  });

  it('고르기 모드: Enter = 그 자리 누르기(onPick — pointerType keyboard, 늘 clicks 1, Shift+Enter면 shiftKey)', () => {
    const v = make({}, false);
    const said = withKeys(v);
    const picks: { p: Pick3d | null; ev: { clicks: number; pointerType: string; shiftKey: boolean } }[] = [];
    v.onPick((p, ev) => picks.push({ p, ev }));
    key(v, 'ArrowRight');
    expect(said.at(-1)!.mode).toBe('pick');
    expect(said.at(-1)!.pick?.id).toMatch(/^L[12]$/);
    expect(said.at(-1)!.text.startsWith('가상 커서를 켰습니다. L')).toBe(true);
    key(v, 'Enter');
    key(v, 'Enter');
    key(v, 'Enter', { shift: true });
    expect(picks.length).toBe(3);
    expect(picks.map((x) => x.ev.clicks)).toEqual([1, 1, 1]);
    expect(picks.map((x) => x.ev.pointerType)).toEqual(['keyboard', 'keyboard', 'keyboard']);
    expect(picks.map((x) => x.ev.shiftKey)).toEqual([false, false, true]);
    expect(picks[0]!.p).toEqual(v.pick(400, 300));
    expect(said.at(-1)!.reason).toBe('commit');
    expect(said.at(-1)!.text.startsWith('골랐습니다: L')).toBe(true);
    // 빈 곳
    for (let i = 0; i < 8; i++) key(v, 'ArrowUp', { shift: true });
    expect(v.keyboardCursor).toMatchObject({ y: 0 });
    key(v, 'Enter');
    expect(picks.at(-1)!.p).toBeNull();
    expect(said.at(-1)!.text).toBe('빈 곳을 골랐습니다');
  });

  it('Shift 잠금: 지금 후보(첫 점 Y축)의 방향을 잠그고 후보를 다시 구해 알린다(refresh)', () => {
    const v = make({ inference: { intersections: true, perpendicular: true, axes: true, lock: true } });
    const said = withKeys(v);
    key(v, 'ArrowRight');
    key(v, 'Enter'); // 첫 점 X
    const s = v.project([5, 3, 0])!;
    const up = Math.round((300 - s.y) / KEY_STEP_PX);
    for (let i = 0; i < up; i++) key(v, 'ArrowUp');
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'y' });
    expect(key(v, 'Shift', { shift: true })).toBe(false);
    v.renderNow();
    expect(v.measureInferenceLock).toMatchObject({ axis: 'y', source: 'shift' });
    expect(said.at(-1)!.reason).toBe('refresh');
    expect(said.at(-1)!.snap).toMatchObject({ locked: true });
    expect(said.at(-1)!.text.startsWith('잠근 선 위 Y축')).toBe(true);
    // 잠근 동안 옮기면 잠근 선 위 점만
    key(v, 'ArrowRight', { shift: true });
    expect(v.measureHoverSnap).toMatchObject({ locked: true, axis: 'y' });
    expect(Math.abs(v.measureHoverSnap!.point[0] - 5)).toBeLessThan(1e-9);
    cv(v).fire('keyup', { key: 'Shift', shiftKey: false, code: '' });
  });

  it('키 바꾸기: 앱이 준 키만 받고 끈 할 일은 받지 않는다', () => {
    const v = make();
    withKeys(v, { keys: { left: ['Alt+ArrowLeft'], next: ['n'], prev: ['p'], exit: ['q'] } });
    expect(key(v, 'ArrowLeft')).toBe(false);
    expect(key(v, 'ArrowLeft', { alt: true })).toBe(true);
    expect(v.keyboardCursor).toMatchObject({ x: 400 });
    key(v, 'ArrowLeft', { alt: true, shift: true });
    expect(v.keyboardCursor).toMatchObject({ x: 350 });
    key(v, 'ArrowRight', { shift: true });
    expect(v.keyboardCursor).toMatchObject({ x: 400 });
    expect(key(v, 'Tab')).toBe(false);
    expect(key(v, 'n')).toBe(true);
    expect(v.measureHoverSnap!.snap).toBe('center');
    expect(key(v, 'p')).toBe(true);
    expect(v.measureHoverSnap!.snap).toBe('intersection');
    expect(v.keyboardSnap!.keys.next).toEqual(['n']);
    expect(key(v, 'Escape')).toBe(false);
    expect(key(v, 'q')).toBe(true);
    expect(v.keyboardCursor).toBeNull();
  });

  it('가상 커서 표식은 화면 덧그림에만(그림 저장·꺼짐에는 없다), 끄면 알리지 않고 끈다', () => {
    const v = make();
    const said = withKeys(v);
    const octx = (v as unknown as { octx: Record<string, unknown> }).octx;
    let arms = 0;
    octx.moveTo = (x: number, y: number): void => {
      if (x === 400 - 13 && y === 300) arms++;
    };
    v.renderNow();
    expect(arms).toBe(0);
    key(v, 'ArrowRight');
    arms = 0;
    v.renderNow();
    expect(arms).toBe(2); // 바탕 테 + 측정 색
    v.setKeyboardSnap(false);
    expect(v.keyboardSnap).toBeNull();
    expect(v.keyboardCursor).toBeNull();
    expect(said.at(-1)!.reason).toBe('start');
    arms = 0;
    v.renderNow();
    expect(arms).toBe(0);
  });

  it('켜 두고 쓰지 않으면 마우스 미리 보기·누르기·앱 호출 수가 끈 것과 같다', () => {
    const calls = [0, 0];
    const run = (i: number, keys: boolean): unknown[] => {
      const v = make({
        pointsFor: (p: Pick3d) => {
          calls[i]!++;
          return p.kind === 'line' ? [{ point: [p.point[0] + 0.2, p.point[1] + 0.2, 0], kind: 'point' }] : null;
        },
      });
      if (keys) v.setKeyboardSnap(true);
      const out: unknown[] = [];
      for (let y = 200; y < 420; y += 13) for (let x = 250; x < 560; x += 11) {
        hoverXY(v, x + 0.37, y + 0.23);
        const s = v.measureHoverSnap;
        out.push(s ? [s.snap, r6(s.point)] : null);
      }
      clickXY(v, 400.37, 300.23);
      out.push(v.measurePoints);
      return out;
    };
    const a = run(0, false), b = run(1, true);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(calls[1]).toBe(calls[0]);
    expect(calls[0]).toBeGreaterThan(10);
  });
});
