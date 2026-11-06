/**
 * 0.48.0 카메라 움직임 설정(STEP 55·SKP 47차 요청 — WCAG 2.3.3): 순수(normalizeAnimate·resolveAnimate·watchReducedMotion — change 사건·옛 addListener·matchMedia 없음),
 * 뷰어(가짜 DOM·matchMedia 흉내): 주지 않으면 0.47.0(부드럽게·움직임 질의 없음), false, 'auto'가 연 뒤 선호 바뀜을 따르기 — 뷰 큐브·키 F·1~7·가운데 단추 두 번·
 * fit·fitItems·setView·setViewDir·zoomToRect·flyTo 모두, 옮기는 중 줄이기로 바뀌면 끝 자리로, setAnimate, 인자가 이김, dispose가 듣기를 푼다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type CameraState, VIEW_DIRS, cameraBasis, defaultCamera, dirToAngles } from '../src/camera';
import * as entry from '../src/index';
import { dot, normalize } from '../src/math';
import { type MotionQueryList, REDUCED_MOTION_QUERY, normalizeAnimate, resolveAnimate, watchReducedMotion } from '../src/motion';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import { CUBE_BAND, cubeLayout, cubeTargets } from '../src/viewcube';

/** 움직임 줄이기 질의 흉내: modern = change 사건, legacy = 옛 addListener만 */
class FakeQuery {
  matches: boolean;
  fns = new Set<() => void>();
  constructor(matches: boolean) {
    this.matches = matches;
  }
  set(m: boolean): void {
    this.matches = m;
    for (const f of [...this.fns]) f();
  }
  modern(): MotionQueryList {
    const self = this;
    return {
      get matches() {
        return self.matches;
      },
      addEventListener: (_t: 'change', fn: () => void) => void self.fns.add(fn),
      removeEventListener: (_t: 'change', fn: () => void) => void self.fns.delete(fn),
    };
  }
  legacy(): MotionQueryList {
    const self = this;
    return {
      get matches() {
        return self.matches;
      },
      addListener: (fn: () => void) => void self.fns.add(fn),
      removeListener: (fn: () => void) => void self.fns.delete(fn),
    };
  }
}

describe('순수: normalizeAnimate·resolveAnimate', () => {
  it("주지 않으면 true(0.47.0), 'auto'는 그대로, 그 밖은 참·거짓으로", () => {
    expect([undefined, true, false, 'auto', 0, 1, null, 'reduce'].map(normalizeAnimate)).toEqual([true, true, false, 'auto', false, true, false, true]);
  });

  it("'auto'만 선호를 본다", () => {
    expect([resolveAnimate(true, false), resolveAnimate(true, true), resolveAnimate(false, false), resolveAnimate(false, true)]).toEqual([true, true, false, false]);
    expect([resolveAnimate('auto', false), resolveAnimate('auto', true)]).toEqual([true, false]);
  });
});

describe('순수: watchReducedMotion', () => {
  it('change 사건: 지금 값을 돌려주고, 값이 바뀔 때만 알리고, off로 그만 듣는다(질의는 prefers-reduced-motion: reduce)', () => {
    const fq = new FakeQuery(false);
    const asked: string[] = [];
    const got: boolean[] = [];
    const w = watchReducedMotion((s) => (asked.push(s), fq.modern()), (r) => got.push(r));
    expect(asked).toEqual([REDUCED_MOTION_QUERY]);
    expect(REDUCED_MOTION_QUERY).toBe('(prefers-reduced-motion: reduce)');
    expect(w.reduce).toBe(false);
    fq.set(true);
    fq.set(true);
    fq.set(false);
    expect(got).toEqual([true, false]);
    expect(fq.fns.size).toBe(1);
    w.off();
    expect(fq.fns.size).toBe(0);
    fq.set(true);
    expect(got).toEqual([true, false]);
  });

  it('옛 addListener(Safari 13 이하)로도 듣고 푼다, 처음부터 줄이기면 reduce true', () => {
    const fq = new FakeQuery(true);
    const got: boolean[] = [];
    const w = watchReducedMotion(() => fq.legacy(), (r) => got.push(r));
    expect(w.reduce).toBe(true);
    fq.set(false);
    expect(got).toEqual([false]);
    w.off();
    expect(fq.fns.size).toBe(0);
  });

  it('matchMedia가 없거나 던지거나 null이면 선호 없음(false)·듣지 않음, 듣는 함수가 없는 목록은 지금 값만', () => {
    for (const mm of [null, undefined, () => null, () => { throw new Error('no'); }]) {
      const w = watchReducedMotion(mm as never, () => { throw new Error('불리면 안 됨'); });
      expect(w.reduce).toBe(false);
      w.off();
    }
    const w = watchReducedMotion(() => ({ matches: true }), () => undefined);
    expect(w.reduce).toBe(true);
    w.off();
  });

  it('입구에서 내보낸다', () => {
    expect(entry.REDUCED_MOTION_QUERY).toBe(REDUCED_MOTION_QUERY);
    expect(entry.normalizeAnimate).toBe(normalizeAnimate);
    expect(entry.resolveAnimate).toBe(resolveAnimate);
    expect(entry.watchReducedMotion).toBe(watchReducedMotion);
  });
});

// ───────────── 뷰어 ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
let clock = 1000;
/** 움직임 질의 흉내(시험마다 새로) — 다른 질의(화소 비율)는 듣기만 하는 빈 목록 */
let motionQuery = new FakeQuery(false);
let legacyQuery = false;
let asked: string[] = [];
beforeAll(() => {
  dom = installDom();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  (globalThis as Record<string, unknown>).matchMedia = (s: string) => {
    asked.push(s);
    if (s === REDUCED_MOTION_QUERY) return legacyQuery ? motionQuery.legacy() : motionQuery.modern();
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  };
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  motionQuery = new FakeQuery(false);
  legacyQuery = false;
  asked = [];
});
afterAll(() => {
  vi.restoreAllMocks();
  dom.restore();
});

type W = { v: Viewer3d; cube: FakeElement; canvas: FakeElement };
function view(opts: ConstructorParameters<typeof Viewer3d>[1] = {}): W {
  const host = dom.host();
  const v = new Viewer3d(host as unknown as HTMLElement, { keyboard: true, viewCubeSize: 112, ...opts });
  views.push(v);
  v.setScene({ name: 't', units: 'mm', meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [30, 0, 0], [34, 4, 4], [0.8, 0.6, 0.5, 1])], lines: [] });
  return { v, cube: host.querySelector('.v3d-cube')!, canvas: v.canvas as unknown as FakeElement };
}

/** 시험마다 같은 처음 카메라(멀리서 비스듬히 — 어느 길로 가도 카메라가 바뀐다) */
function start(): CameraState {
  const a = dirToAngles([-0.3, -1, 0.4]);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [3, -2, 1], distance: 400, projection: 'perspective' };
}
const key = (c: CameraState): string => JSON.stringify(c, (_k, x) => (typeof x === 'number' ? +x.toFixed(9) : x));
let pid = 50;
const ptr = (el: FakeElement, type: string, x: number, y: number, button: number, buttons: number): void =>
  el.fire(type, { clientX: x, clientY: y, pointerId: pid, pointerType: 'mouse', button, buttons, isPrimary: true, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const press = (w: W, k: string): void =>
  void w.v.handleKey({ key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, target: w.canvas } as unknown as KeyboardEvent);

/** 카메라를 날리는 길 모두(이름 → 할 일). 저장된 보기 = flyTo, 홈 보기 = 키 7(남동 등각)·F */
const PATHS: Record<string, (w: W) => void> = {
  '뷰 큐브(위 면)': (w) => {
    const L = cubeLayout(112);
    const t = cubeTargets(cameraBasis(w.v.getCamera()), L, CUBE_BAND).find((x) => dot(x.dir, normalize(VIEW_DIRS.top)) > 0.9999)!;
    const q = t.pieces[0]!;
    const x = (q[0]![0] + q[2]![0]) / 2, y = (q[0]![1] + q[2]![1]) / 2;
    pid++;
    ptr(w.cube, 'pointerdown', x, y, 0, 1);
    ptr(w.cube, 'pointerup', x, y, 0, 0);
  },
  '키 F(전체 보기)': (w) => press(w, 'f'),
  '키 5(위 뷰)': (w) => press(w, '5'),
  '키 7(홈 — 남동 등각)': (w) => press(w, '7'),
  '가운데 단추 두 번(전체 보기)': (w) => {
    for (let i = 0; i < 2; i++) {
      pid++;
      ptr(w.canvas, 'pointerdown', 400, 300, 1, 4);
      ptr(w.canvas, 'pointerup', 400, 300, 1, 0);
    }
  },
  'fit()': (w) => w.v.fit(),
  'fitItems(b)': (w) => w.v.fitItems(['b']),
  "setView('front')": (w) => w.v.setView('front'),
  'setViewDir([1, 1, 1])': (w) => w.v.setViewDir([1, 1, 1]),
  'zoomToRect': (w) => w.v.zoomToRect(300, 200, 500, 400),
  'flyTo(저장된 보기)': (w) => {
    const a = dirToAngles([1, 0.2, 0.3]);
    w.v.flyTo({ ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [5, 5, 5], distance: 60, projection: 'perspective' });
  },
};

/** 길 하나를 처음 카메라에서 돌린다: 바로 바뀌면 'instant', 그림 한 장(0.32초 넘게 뒤)을 그린 뒤 바뀌면 'animated' */
function run(w: W, act: (w: W) => void): { kind: 'instant' | 'animated' | 'none'; to: string } {
  w.v.setCamera(start());
  const before = key(w.v.getCamera());
  act(w);
  const right = key(w.v.getCamera());
  if (right !== before) return { kind: 'instant', to: right };
  clock += 1000;
  w.v.renderNow();
  const after = key(w.v.getCamera());
  return { kind: after === before ? 'none' : 'animated', to: after };
}
/** 모든 길의 종류(이름 → 종류) */
function kinds(w: W): Record<string, string> {
  return Object.fromEntries(Object.entries(PATHS).map(([n, act]) => [n, run(w, act).kind]));
}
const all = (k: string): Record<string, string> => Object.fromEntries(Object.keys(PATHS).map((n) => [n, k]));

describe('뷰어: animate 설정', () => {
  it('주지 않으면 0.47.0 그대로: 모든 길이 부드럽게, 움직임 질의를 부르지 않는다, animate true·animateSetting true', () => {
    const w = view();
    expect(w.v.animate).toBe(true);
    expect(w.v.animateSetting).toBe(true);
    expect(kinds(w)).toEqual(all('animated'));
    expect(asked).not.toContain(REDUCED_MOTION_QUERY);
    expect(motionQuery.fns.size).toBe(0);
  });

  it('animate false: 모든 길이 바로, 움직이고 끝난 자리는 true와 같다', () => {
    const a = view();
    const b = view({ animate: false });
    expect(b.v.animate).toBe(false);
    expect(kinds(b)).toEqual(all('instant'));
    for (const [n, act] of Object.entries(PATHS)) expect(run(b, act).to, n).toBe(run(a, act).to);
  });

  it("'auto': 연 뒤 선호가 줄이기로 바뀌면 모든 길이 바로, 되돌리면 다시 부드럽게(새로 고침 없이)", () => {
    const w = view({ animate: 'auto' });
    expect(asked.filter((s) => s === REDUCED_MOTION_QUERY).length).toBe(1);
    expect(motionQuery.fns.size).toBe(1);
    expect(w.v.animateSetting).toBe('auto');
    expect(w.v.animate).toBe(true);
    expect(kinds(w)).toEqual(all('animated'));
    motionQuery.set(true);
    expect(w.v.animate).toBe(false);
    expect(w.v.animateSetting).toBe('auto');
    expect(kinds(w)).toEqual(all('instant'));
    motionQuery.set(false);
    expect(w.v.animate).toBe(true);
    expect(kinds(w)).toEqual(all('animated'));
    // 다시 묻지 않는다(한 질의를 계속 듣는다)
    expect(asked.filter((s) => s === REDUCED_MOTION_QUERY).length).toBe(1);
  });

  it("'auto': 처음부터 줄이기면 바로, 옛 addListener 목록도 따른다", () => {
    motionQuery = new FakeQuery(true);
    legacyQuery = true;
    const w = view({ animate: 'auto' });
    expect(w.v.animate).toBe(false);
    expect(kinds(w)).toEqual(all('instant'));
    motionQuery.set(false);
    expect(kinds(w)).toEqual(all('animated'));
  });

  it('옮기는 중 줄이기로 바뀌면 그 자리에서 끝 자리로 마친다(바로 옮긴 것과 같다)', () => {
    const ref = view({ animate: false });
    for (const [n, act] of Object.entries(PATHS)) {
      const target = run(ref, act).to;
      const w = view({ animate: 'auto' });
      w.v.setCamera(start());
      const before = key(w.v.getCamera());
      act(w);
      clock += 100;
      w.v.renderNow();
      const mid = key(w.v.getCamera());
      expect(mid, n).not.toBe(before);
      expect(mid, n).not.toBe(target);
      motionQuery.set(true);
      expect(key(w.v.getCamera()), n).toBe(target);
      motionQuery = new FakeQuery(false);
    }
  });

  it('인자를 주면 그 값이 이긴다(줄이기여도 fit(true)는 부드럽게, 기본이어도 fit(false)는 바로)', () => {
    motionQuery = new FakeQuery(true);
    const w = view({ animate: 'auto' });
    expect(run(w, (x) => x.v.fit(true)).kind).toBe('animated');
    expect(run(w, (x) => x.v.setView('top', true)).kind).toBe('animated');
    const d = view();
    expect(run(d, (x) => x.v.fit(false)).kind).toBe('instant');
    expect(run(d, (x) => x.v.flyTo(start(), false)).kind).toBe('none');
  });

  it('setCamera는 늘 바로(움직임 없음 — 0.47.0 그대로), flyTo는 setCamera와 같은 끝 자리', () => {
    const w = view();
    const a = dirToAngles([1, 0.2, 0.3]);
    const saved: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [5, 5, 5], distance: 60, projection: 'orthographic', roll: 0.1 };
    expect(run(w, (x) => x.v.setCamera(saved)).kind).toBe('instant');
    const viaFly = run(w, (x) => x.v.flyTo(saved)).to;
    w.v.setCamera(saved);
    expect(viaFly).toBe(key(w.v.getCamera()));
  });

  it('setAnimate: 연 뒤 false·true·auto로 바꾸기, auto일 때만 듣고 풀기, 바꾼 값이 움직이지 않음이면 옮기던 것을 끝 자리로', () => {
    const w = view();
    w.v.setAnimate(false);
    expect([w.v.animate, w.v.animateSetting]).toEqual([false, false]);
    expect(kinds(w)).toEqual(all('instant'));
    expect(asked).not.toContain(REDUCED_MOTION_QUERY);
    motionQuery.set(true);
    w.v.setAnimate('auto');
    expect([w.v.animate, w.v.animateSetting]).toEqual([false, 'auto']);
    expect(motionQuery.fns.size).toBe(1);
    w.v.setAnimate('auto');
    expect(motionQuery.fns.size).toBe(1);
    expect(kinds(w)).toEqual(all('instant'));
    w.v.setAnimate(true);
    expect(motionQuery.fns.size).toBe(0);
    expect([w.v.animate, w.v.animateSetting]).toEqual([true, true]);
    expect(kinds(w)).toEqual(all('animated'));
    // 옮기는 중 setAnimate(false) → 끝 자리
    const ref = view({ animate: false });
    const target = run(ref, (x) => x.v.setView('top')).to;
    w.v.setCamera(start());
    w.v.setView('top');
    clock += 100;
    w.v.renderNow();
    expect(key(w.v.getCamera())).not.toBe(target);
    w.v.setAnimate(false);
    expect(key(w.v.getCamera())).toBe(target);
  });

  it('dispose는 움직임 질의 듣기를 풀고, 그 뒤 setAnimate·선호 바뀜은 아무것도 하지 않는다', () => {
    const w = view({ animate: 'auto' });
    expect(motionQuery.fns.size).toBe(1);
    w.v.dispose();
    expect(motionQuery.fns.size).toBe(0);
    w.v.setAnimate('auto');
    expect(motionQuery.fns.size).toBe(0);
    motionQuery.set(true);
    expect(w.v.animateSetting).toBe('auto');
  });
});
