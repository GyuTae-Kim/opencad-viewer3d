/**
 * 0.110.0 카메라만 바뀐 뒤 측정 미리 보기(112차): 0.109.0까지 코어는 측정 미리 보기를 포인터 이동과 장면 길·그리기 범위·음영 가림·겉모습·setPickEdges·단면 뒤
 * 그 커서 자리에서 다시 구했지만, 카메라만 바뀌는 길(휠·보기 키·뷰 큐브·전체 보기·setProjection·3D 보기 크기·걷기)은 다시 구하지 않아 미리 보기가 앞 화면에서 고른
 * 세계 점 그대로였다(표식은 그 점의 새 투영 — 커서 아래가 아닌 자리, 붙잡기 거리 안 후보가 바뀌어도 앞 것). 가상 커서 후보도 앞 화면 것이었다.
 * 이제 3D 보기 안 사용자 입력(휠·보기 키 F·1~7·가운데 두 번 누르기·뷰 큐브 누르기·끌기·걷기 키)·3D 보기 크기·setProjection으로 카메라가 바뀌면 카메라가 멈춘 첫 그림
 * (움직임 끝 프레임·휠 160 ms 뒤·걷기를 멈춘 그림·큐브를 뗀 그림, 한 번에 옮겼으면 다음 그림)에서 그 커서 자리에서 한 번 다시 구한다 — 움직이는 동안은 고르지 않는다.
 * 앱 API 카메라 함수(setCamera·flyTo·fit·setView·zoomToRect·orbitBy …)와 측정이 꺼진 길·미리 보기가 없는 길·앱이 맡은 포인터는 0.109.0 그대로.
 * 장면(위에서 봄): 아래 상자 L [-100,-100,0]–[200,200,20], 위 상자 U [20,20,40]–[80,80,50], U 아래 선분 B (30,50,30)–(70,50,30)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Scene3d } from '../src/types';

type P3 = [number, number, number];
type At = { x: number; y: number };
const L = boxMesh('L', [-100, -100, 0], [200, 200, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
const B: LineSet3d = { id: 'B', name: 'B', positions: new Float32Array([30, 50, 30, 70, 50, 30]), color: [0.9, 0.9, 0.2, 1] };
const scene: Scene3d = { name: 'cam', units: 'mm', meshes: [L, U], lines: [B] };
/** U 윗면 가운데(붙잡을 점이 없는 면 위 점 — 카메라가 바뀌면 같은 커서 자리의 점이 바뀐다), U에서 먼 L 윗면 */
const A: P3 = [50, 50, 50];
const C: P3 = [150, 50, 20];

type RoCb = (e: { contentRect: { width: number; height: number } }[]) => void;
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
let clock = 1000;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  // 3D 보기 크기 바뀜을 시험이 부른다(가짜 DOM의 ResizeObserver는 부르지 않는다)
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    cb: RoCb;
    constructor(cb: RoCb) {
      this.cb = cb;
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});
afterAll(() => {
  for (const v of views) v.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
  dom.restore();
});

function make(animate = false): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [50.4, 50.3, 40], distance: 400 });
  v.renderNow();
  return v;
}
const none = (): void => undefined;
/** 측정 모드 + 붙잡기 선택(가운데 점) + 준비 */
function measuring(prep: (v: Viewer3d) => void = none, animate = false): Viewer3d {
  const v = make(animate);
  v.setMeasureMode(true);
  v.setMeasureSnap({ midpoints: true });
  prep(v);
  v.renderNow();
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 세계 점의 화면 자리(조금 비켜 — 경계를 정확히 가리키지 않는다) */
function spot(v: Viewer3d, p: P3 = A): At {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x + 0.37, y: s.y - 0.21 };
}
/** 마우스 포인터 사건 하나(그리지 않는다) */
const ptr = (v: Viewer3d, type: string, p: At, buttons = 0, button = type === 'pointermove' ? -1 : 0): void =>
  cv(v).fire(type, { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse', button, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const hover = (v: Viewer3d, p: At): void => {
  ptr(v, 'pointermove', p);
  v.renderNow();
};
/** 키 하나(그리지 않는다) */
function press(v: Viewer3d, k: string, code = ''): void {
  cv(v).fire('keydown', { key: k, code, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
}
const key = (v: Viewer3d, k: string): void => {
  press(v, k);
  v.renderNow();
};
const wheel = (v: Viewer3d, p: At, deltaY: number): void => cv(v).fire('wheel', { clientX: p.x, clientY: p.y, deltaY, deltaMode: 0, ctrlKey: false, shiftKey: false });
/** 뷰 큐브 포인터 사건(큐브 자리 기준 화소) */
const cube = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v as unknown as { cube: FakeElement }).cube.fire(type, { clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons });
/** 다음 그림이 걸려 있는지(requestAnimationFrame) */
const pending = (v: Viewer3d): boolean => (v as unknown as { raf: number }).raf !== 0;
const resize = (v: Viewer3d, width: number, height: number): void => (v as unknown as { ro: { cb: RoCb } }).ro.cb([{ contentRect: { width, height } }]);
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
/** 뷰어 안 함수 부름 수(측정 붙잡기 셈 measureAt·가상 커서 후보 셈 keyRecompute — 다시 구했는지) */
function calls(v: Viewer3d, name: 'measureAt' | 'keyRecompute'): { n: number } {
  const o = v as unknown as Record<string, (...a: unknown[]) => unknown>;
  const real = o[name]!;
  const c = { n: 0 };
  o[name] = function (this: unknown, ...a: unknown[]): unknown {
    c.n++;
    return real.apply(this, a);
  };
  return c;
}
/** 미리 보기 상태(점·종류·잠글 방향) */
const st = (v: Viewer3d): string => JSON.stringify([v.measureHoverSnap, v.measureHoverLock]);
/** 같은 카메라의 새 뷰어에서 그 자리로 커서를 옮긴 것과 미리 보기·덧그림이 같은지 */
function sameAsFresh(v: Viewer3d, p: At, t: string[]): void {
  const w = measuring();
  w.setCamera(v.getCamera());
  w.renderNow();
  hover(w, p);
  expect(st(v)).toBe(st(w));
  expect(t).toEqual(trace(w));
}

/** [이름, 카메라만 바꾸기(한 번에 — 움직임 없음)] */
const ONE_SHOT: [string, (v: Viewer3d, p: At) => void][] = [
  ['setProjection', (v) => v.setProjection('orthographic')],
  ['보기 키 F(전체 보기)', (v) => press(v, 'f')],
  ['보기 키 1(앞)', (v) => press(v, '1')],
  ['보기 키 7(앱이 창 키를 넘김 — handleKey)', (v) => void v.handleKey({ key: '7', code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, target: v.canvas } as unknown as KeyboardEvent)],
  [
    '가운데 두 번 누르기(전체 보기)',
    (v, p) => {
      for (let i = 0; i < 2; i++) {
        ptr(v, 'pointerdown', p, 4, 1);
        ptr(v, 'pointerup', p, 0, 1);
      }
    },
  ],
];

describe('0.110.0 카메라만 바뀐 뒤 측정 미리 보기(마우스) — 카메라가 멈춘 첫 그림에서 그 커서 자리에서 한 번 다시 구한다', () => {
  it.each(ONE_SHOT)('%s 뒤 다음 그림에서 한 번 — 같은 카메라에서 그 자리로 옮긴 것과 같다(0.109.0은 앞 화면의 세계 점 그대로)', (_name, op) => {
    const v = measuring();
    const p = spot(v);
    hover(v, p);
    const before = v.measureHoverSnap;
    expect(before).not.toBeNull();
    const c0 = JSON.stringify(v.getCamera());
    const n = calls(v, 'measureAt');
    op(v, p);
    // 그리기 전에는 앞 값 그대로(다른 다시 구하기 길과 같다)
    expect(v.measureHoverSnap).toEqual(before);
    const t = trace(v);
    expect(JSON.stringify(v.getCamera())).not.toBe(c0);
    expect(n.n).toBe(1);
    v.renderNow();
    expect(n.n).toBe(1);
    sameAsFresh(v, p, t);
  });

  it('휠: 굴리는 동안(사건마다 그림, 마지막 사건 160 ms 안)은 다시 구하지 않고 멈춘 뒤 그림(interacting을 내리는 그림)에서 한 번', () => {
    const v = measuring();
    const p = spot(v);
    hover(v, p);
    const n = calls(v, 'measureAt');
    wheel(v, p, -120);
    v.renderNow();
    vi.advanceTimersByTime(100);
    wheel(v, p, -120);
    v.renderNow();
    vi.advanceTimersByTime(159);
    v.renderNow();
    expect(n.n).toBe(0);
    expect(pending(v)).toBe(false);
    vi.advanceTimersByTime(1);
    // 휠 타이머가 이미 그 그림을 건다(더 거는 그림 없음)
    expect(pending(v)).toBe(true);
    const t = trace(v);
    expect(n.n).toBe(1);
    v.renderNow();
    expect(n.n).toBe(1);
    sameAsFresh(v, p, t);
  });

  it('보기 키 움직임(0.32초): 가운데 프레임에서는 고르지 않고 끝 프레임에서 한 번 — onCameraChange 다음 onMeasureHoverChange(값이 바뀌었을 때만)', () => {
    const v = measuring(none, true);
    const p = spot(v);
    hover(v, p);
    const ev: string[] = [];
    v.onCameraChange(() => void ev.push('camera'));
    v.onMeasureHoverChange(() => void ev.push('hover'));
    const before = JSON.stringify(v.measureHoverSnap);
    const n = calls(v, 'measureAt');
    press(v, '1');
    for (let i = 0; i < 3; i++) {
      clock += 100;
      v.renderNow();
    }
    expect(n.n).toBe(0);
    expect(ev).toEqual(['camera', 'camera', 'camera']);
    expect(JSON.stringify(v.measureHoverSnap)).toBe(before);
    clock += 100;
    const t = trace(v);
    expect(n.n).toBe(1);
    const changed = JSON.stringify(v.measureHoverSnap) !== before;
    expect(ev).toEqual(['camera', 'camera', 'camera', 'camera', ...(changed ? ['hover'] : [])]);
    clock += 100;
    v.renderNow();
    expect(n.n).toBe(1);
    expect(ev).toHaveLength(changed ? 5 : 4);
    sameAsFresh(v, p, t);
  });

  it('움직이는 동안 포인터를 옮겨 구한 미리 보기도 끝 프레임에서 맞춘다(0.109.0은 가운데 카메라의 값 그대로) — 같은 프레임 포인터 이동은 그 자리 한 번', () => {
    const v = measuring(none, true);
    const p = spot(v);
    hover(v, p);
    const q = { x: p.x + 40.3, y: p.y + 20.1 };
    const n = calls(v, 'measureAt');
    press(v, 'f');
    clock += 100;
    v.renderNow();
    ptr(v, 'pointermove', q);
    clock += 100;
    v.renderNow();
    expect(n.n).toBe(1);
    clock += 100;
    v.renderNow();
    expect(n.n).toBe(1);
    clock += 100;
    const t = trace(v);
    expect(n.n).toBe(2);
    sameAsFresh(v, q, t);
    // 한 번에 옮기는 길에서 같은 프레임에 먼저 온 포인터 이동: 가장 늦은 포인터 자리에서 한 번(0.104.0 규칙)
    const u = measuring();
    hover(u, p);
    const m = calls(u, 'measureAt');
    ptr(u, 'pointermove', q);
    u.setProjection('orthographic');
    const t2 = trace(u);
    expect(m.n).toBe(1);
    sameAsFresh(u, q, t2);
  });

  it('걷기 키: 걷는 동안(프레임마다 움직임)은 다시 구하지 않고 뗀 뒤 첫 그림에서 한 번 — 그 자리 measureCandidates 첫째와 같다', () => {
    const v = measuring((x) => x.setNavigation('walk'));
    const p = spot(v);
    hover(v, p);
    const n = calls(v, 'measureAt');
    const c0 = JSON.stringify(v.getCamera());
    press(v, 'e', 'KeyE');
    for (let i = 0; i < 3; i++) {
      clock += 16;
      v.renderNow();
    }
    expect(JSON.stringify(v.getCamera())).not.toBe(c0);
    expect(n.n).toBe(0);
    cv(v).fire('keyup', { key: 'e', code: 'KeyE', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
    clock += 16;
    v.renderNow();
    expect(n.n).toBe(1);
    v.renderNow();
    expect(n.n).toBe(1);
    expect(v.measureHoverSnap).toEqual(v.measureCandidates(p.x, p.y)[0] ?? null);
  });

  it('3D 보기 크기: 커서가 안이면 다음 그림에서 한 번(그 자리 measureCandidates 첫째와 같다), 커서가 밖이 되면 다시 구하지 않는다(0.109.0 그대로)', () => {
    for (const [width, want] of [
      [700, 1],
      [300, 0],
    ] as const) {
      const v = measuring();
      const p = spot(v);
      hover(v, p);
      const before = v.measureHoverSnap;
      const n = calls(v, 'measureAt');
      resize(v, width, 560);
      v.renderNow();
      expect(n.n, `너비 ${width}`).toBe(want);
      if (want) expect(v.measureHoverSnap).toEqual(v.measureCandidates(p.x, p.y)[0] ?? null);
      else expect(v.measureHoverSnap).toEqual(before);
    }
  });

  it('onMeasureHoverChange: 카메라가 멈춘 그림 뒤 값이 바뀌었을 때만 한 번(같은 그림의 onCameraChange 다음) — 같은 카메라로 다시 맞추면 다시 구해도 알리지 않는다', () => {
    const v = measuring();
    const p = spot(v);
    const ev: string[] = [];
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onCameraChange(() => void ev.push('camera'));
    v.onMeasureHoverChange((s) => {
      ev.push('hover');
      heard.push(s);
    });
    hover(v, p);
    expect(ev).toEqual(['hover']);
    const n = calls(v, 'measureAt');
    v.setProjection('orthographic');
    expect(ev).toEqual(['hover']);
    v.renderNow();
    expect(n.n).toBe(1);
    expect(ev).toEqual(['hover', 'camera', 'hover']);
    expect(heard[1]).toEqual(v.measureHoverSnap);
    expect(heard[1]).not.toEqual(heard[0]);
    // 전체 보기 두 번: 둘째는 같은 카메라(대상점·거리를 다시 정한다) — 다시 구하지만 같은 값이라 알림 없음
    key(v, 'f');
    expect(n.n).toBe(2);
    const k = ev.length;
    key(v, 'f');
    expect(n.n).toBe(3);
    expect(ev).toHaveLength(k);
  });
});

describe('0.110.0 가상 커서(측정 모드) — 카메라가 멈춘 그림에서 알리지 않고 다시 구한다(0.98.0 keySceneChanged 꼴)', () => {
  it.each([
    ['setProjection', (v: Viewer3d) => v.setProjection('orthographic')],
    ['보기 키 F', (v: Viewer3d) => press(v, 'f')],
  ])("%s 뒤 다음 그림에서 한 번 — 새 카메라의 그 자리 후보('refresh' 알림 없음 — 0.109.0은 앞 화면 후보)", (_name, op) => {
    const v = measuring();
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    expect(v.measureHoverSnap).not.toBeNull();
    said.length = 0;
    const k = calls(v, 'keyRecompute');
    op(v);
    v.renderNow();
    expect(k.n).toBe(1);
    expect(said).toEqual([]);
    v.renderNow();
    expect(k.n).toBe(1);
    const c = v.keyboardCursor!;
    const list = v.measureCandidates(c.x, c.y, { pointerType: 'keyboard' });
    expect(c.count).toBe(list.length);
    expect(v.measureHoverSnap).toEqual(list[c.index] ?? null);
  });

  it('뷰 큐브: 끄는 동안은 다시 구하지 않고 뗀 뒤 한 장을 걸어 한 번(다시 구할 것이 없으면 그 한 장을 걸지 않는다), 누르기 움직임은 끝 프레임에서 한 번', () => {
    const drag = (v: Viewer3d): void => {
      cube(v, 'pointerdown', 30, 30, 1);
      cube(v, 'pointermove', 40, 34, 1);
      v.renderNow();
      cube(v, 'pointermove', 52, 40, 1);
      v.renderNow();
    };
    const v = measuring();
    v.setKeyboardSnap({ announce: () => undefined });
    key(v, 'Enter');
    const k = calls(v, 'keyRecompute');
    const c0 = JSON.stringify(v.getCamera());
    drag(v);
    expect(JSON.stringify(v.getCamera())).not.toBe(c0);
    expect(k.n).toBe(0);
    expect(pending(v)).toBe(false);
    cube(v, 'pointerup', 52, 40, 0);
    expect(pending(v)).toBe(true);
    v.renderNow();
    expect(k.n).toBe(1);
    expect(v.keyboardCursor).not.toBeNull();
    // 측정 미리 보기·가상 커서가 없으면 뗄 때 그리지 않는다(0.109.0 그대로)
    const w = measuring();
    drag(w);
    cube(w, 'pointerup', 52, 40, 0);
    expect(pending(w)).toBe(false);
    // 큐브 누르기(움직임): 가운데 프레임 없이 끝 프레임에서 한 번
    const a = measuring(none, true);
    a.setKeyboardSnap({ announce: () => undefined });
    key(a, 'Enter');
    const m = calls(a, 'keyRecompute');
    const s = (a as unknown as { cubeSizeNow(): number }).cubeSizeNow() / 2;
    const c1 = JSON.stringify(a.getCamera());
    cube(a, 'pointerdown', s, s, 1);
    cube(a, 'pointerup', s, s, 0);
    for (let i = 0; i < 3; i++) {
      clock += 100;
      a.renderNow();
    }
    expect(JSON.stringify(a.getCamera())).not.toBe(c1);
    expect(m.n).toBe(0);
    clock += 100;
    a.renderNow();
    expect(m.n).toBe(1);
  });
});

/** 사용자 입력 카메라(마우스 미리 보기가 있었다면 다시 구하는 것) */
const TRIGGERS: [string, (v: Viewer3d, p: At) => void][] = [
  ['setProjection', (v) => v.setProjection('orthographic')],
  ['보기 키 F', (v) => press(v, 'f')],
  [
    '휠',
    (v, p) => {
      wheel(v, p, -120);
      v.renderNow();
      vi.advanceTimersByTime(160);
    },
  ],
];
/** 앱 API 카메라 함수(0.109.0 그대로 — 화소 값 묶음이 미리 보기를 둔 채 이 길로 카메라를 옮긴 뒤 그 기억으로 잰다) */
const API: [string, (v: Viewer3d) => unknown][] = [
  ['setCamera', (v) => v.setCamera({ ...v.getCamera(), distance: 300 })],
  ['flyTo(움직임 없이)', (v) => v.flyTo({ ...v.getCamera(), distance: 300 }, false)],
  ['fit(false)', (v) => v.fit(false)],
  ['setView(false)', (v) => v.setView('front', false)],
  ['zoomToRect(false)', (v) => v.zoomToRect(300, 200, 500, 400, false)],
  ['orbitBy', (v) => v.orbitBy(0.3, 0.1)],
  ['zoomBy', (v) => v.zoomBy(0.8)],
  ['setRoll', (v) => v.setRoll(0.2)],
  ['setFov', (v) => v.setFov(30)],
];

describe('0.110.0 0.109.0 그대로인 길', () => {
  it.each(TRIGGERS)('%s: 측정이 꺼졌거나 미리 보기가 없으면(움직이지 않음·포인터가 떠남) 다시 구하지 않는다', (_name, op) => {
    const off = make();
    hover(off, spot(off));
    const still = measuring();
    const left = measuring();
    hover(left, spot(left));
    cv(left).fire('pointerleave', {});
    left.renderNow();
    for (const v of [off, still, left]) {
      const n = calls(v, 'measureAt');
      const k = calls(v, 'keyRecompute');
      op(v, spot(v, C));
      v.renderNow();
      expect([n.n, k.n]).toEqual([0, 0]);
      expect(v.measureHoverSnap).toBeNull();
    }
  });

  it.each(API)('%s(앱 API): 다시 구하지 않고 앞 화면의 세계 점 그대로·알림 없음', (_name, op) => {
    const v = measuring();
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void heard.push(s));
    hover(v, spot(v));
    const before = v.measureHoverSnap;
    const c0 = JSON.stringify(v.getCamera());
    const n = calls(v, 'measureAt');
    op(v);
    v.renderNow();
    v.renderNow();
    expect(JSON.stringify(v.getCamera())).not.toBe(c0);
    expect(n.n).toBe(0);
    expect(v.measureHoverSnap).toEqual(before);
    expect(heard).toHaveLength(1);
  });

  it('끌기 중(누른 채)에는 기다렸다 뗀 뒤 한 번, 앱이 맡은 포인터면 다시 구하지 않는다(앞 화면의 세계 점 그대로)', () => {
    const d = measuring();
    const p = spot(d);
    hover(d, p);
    ptr(d, 'pointerdown', p, 1);
    const n = calls(d, 'measureAt');
    press(d, 'f');
    d.renderNow();
    d.renderNow();
    expect(n.n).toBe(0);
    ptr(d, 'pointercancel', p, 0);
    d.renderNow();
    expect(n.n).toBe(1);
    const h = measuring((x) => x.setPointerClaim(() => true));
    const q = spot(h);
    hover(h, q);
    const before = h.measureHoverSnap;
    ptr(h, 'pointerdown', q, 1);
    expect(h.heldPointers).toEqual([1]);
    const m = calls(h, 'measureAt');
    press(h, 'f');
    h.renderNow();
    expect(m.n).toBe(0);
    ptr(h, 'pointerup', q, 0);
    h.renderNow();
    expect(m.n).toBe(0);
    expect(h.measureHoverSnap).toEqual(before);
  });

  it('가상 커서 고르기 모드(측정 꺼짐): 다시 구하지 않는다', () => {
    const v = make();
    v.setKeyboardSnap({ announce: () => undefined });
    key(v, 'Enter');
    expect(v.keyboardCursor?.mode).toBe('pick');
    const k = calls(v, 'keyRecompute');
    press(v, 'f');
    v.renderNow();
    v.setProjection('orthographic');
    v.renderNow();
    expect(k.n).toBe(0);
  });
});
