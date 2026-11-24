/**
 * 0.112.0 고르기 모드 가상 커서 — 카메라가 멈춘 그림에서 후보 다시 구하기(114차): 0.110.0은 3D 보기 안 사용자 입력(휠·보기 키·뷰 큐브·걷기)·3D 보기 크기·setProjection으로
 * 카메라가 바뀌면 카메라가 멈춘 첫 그림에서 가상 커서 후보를 다시 구했지만(camSettle — 0.98.0 keySceneChanged 꼴) 측정 중일 때만이었다. 그래서 고르기 모드 가상 커서
 * (SKP 고르기 도구·STEP 개체 고르기 — 측정 꺼짐)는 커서를 옮길 때까지 앞 화면에서 구한 겹친 고르기 후보(Tab 차례·수·알림·표식)를 들고 있었다(커서 표식은 화면 그 자리인데
 * 후보 표식은 앞 후보의 새 투영). 이제 가상 커서가 켜져 있으면 측정 밖에서도 같은 길로 다시 구한다 — 알리지 않고(0.98.0 장면 길과 같다), 같은 후보가 남으면 그 차례.
 * 움직이는 동안(움직임 가운데 프레임·휠 160 ms 안·큐브 끄는 동안)은 고르지 않는다. 가상 커서가 꺼져 있으면 0.111.0과 같고, 측정 모드 가상 커서는 0.110.0 그대로.
 * 장면(위에서 봄): 아래 상자 L [-100,-100,0]–[200,200,20], 위 상자 U [20,20,40]–[80,80,50], U 아래 선분 B (30,50,30)–(70,50,30) — 0.110.0 시험과 같다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type KeyboardSnapOptions, Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Pick3d, Scene3d } from '../src/types';

const L = boxMesh('L', [-100, -100, 0], [200, 200, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
const B: LineSet3d = { id: 'B', name: 'B', positions: new Float32Array([30, 50, 30, 70, 50, 30]), color: [0.9, 0.9, 0.2, 1] };
const scene: Scene3d = { name: 'pickcam', units: 'mm', meshes: [L, U], lines: [B] };

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
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 키 하나(그리지 않는다) */
function press(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
}
const key = (v: Viewer3d, k: string): void => {
  press(v, k);
  v.renderNow();
};
const wheel = (v: Viewer3d, x: number, y: number, deltaY: number): void => cv(v).fire('wheel', { clientX: x, clientY: y, deltaY, deltaMode: 0, ctrlKey: false, shiftKey: false });
/** 뷰 큐브 포인터 사건(큐브 자리 기준 화소) */
const cube = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v as unknown as { cube: FakeElement }).cube.fire(type, { clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons });
/** 큐브를 끌어 돌린다(끄는 동안 그림 둘 — 떼지 않는다) */
function cubeDrag(v: Viewer3d): void {
  cube(v, 'pointerdown', 30, 30, 1);
  cube(v, 'pointermove', 40, 34, 1);
  v.renderNow();
  cube(v, 'pointermove', 52, 40, 1);
  v.renderNow();
}
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
/** 뷰어 안 함수 부름 수(가상 커서 후보 셈 keyRecompute·겹친 고르기 후보 셈 pickList — 다시 구했는지, 몇 번 골랐는지) */
function calls(v: Viewer3d, name: 'keyRecompute' | 'pickList'): { n: number } {
  const o = v as unknown as Record<string, (...a: unknown[]) => unknown>;
  const real = o[name]!;
  const c = { n: 0 };
  o[name] = function (this: unknown, ...a: unknown[]): unknown {
    c.n++;
    return real.apply(this, a);
  };
  return c;
}
type KC = { x: number; y: number; index: number; picks: { pick: Pick3d }[]; pick: Pick3d | null };
const kc = (v: Viewer3d): KC => (v as unknown as { keyCur: KC | null }).keyCur!;
const sig = (p: Pick3d | null | undefined): string | null => (p ? `${p.kind}:${p.id}:${p.index}${p.section ? ':cut' : ''}` : null);
const sigs = (v: Viewer3d): (string | null)[] => kc(v).picks.map((d) => sig(d.pick));
/** 가상 커서 상태(자리·차례·겹친 후보·고른 것·공개 상태) */
const st = (v: Viewer3d): string => {
  const c = kc(v);
  return JSON.stringify({ x: c.x, y: c.y, index: c.index, picks: sigs(v), pick: sig(c.pick), cur: v.keyboardCursor });
};
/** 고르기 모드 가상 커서를 켠다(캔버스 가운데 — 알림은 said에) */
function cursor(v: Viewer3d, o: KeyboardSnapOptions = {}): KeyboardSnapAnnouncement[] {
  const said: KeyboardSnapAnnouncement[] = [];
  v.setKeyboardSnap({ ...o, announce: (a) => void said.push(a) });
  key(v, 'Enter');
  expect(v.keyboardCursor?.mode).toBe('pick');
  return said;
}
/** 같은 카메라의 새 뷰어에서 가상 커서를 켠 것과 상태·덧그림(t — v의 다시 구한 그림)·다음 Tab 알림이 같은지 */
function sameAsFresh(v: Viewer3d, said: KeyboardSnapAnnouncement[], t: string[], o: KeyboardSnapOptions = {}): void {
  const w = make();
  w.setCamera(v.getCamera());
  w.renderNow();
  const heard = cursor(w, o);
  expect(st(v)).toBe(st(w));
  expect(t).toEqual(trace(w));
  said.length = 0;
  heard.length = 0;
  key(v, 'Tab');
  key(w, 'Tab');
  expect(said).toEqual(heard);
  expect(said).toHaveLength(1);
  expect(st(v)).toBe(st(w));
}

/** [이름, 카메라만 바꾸기(한 번에 — 움직임 없음)] */
const ONE_SHOT: [string, (v: Viewer3d) => void][] = [
  ['setProjection', (v) => v.setProjection('orthographic')],
  ['보기 키 F(전체 보기)', (v) => press(v, 'f')],
  ['보기 키 1(앞)', (v) => press(v, '1')],
  ['보기 키 7(앱이 창 키를 넘김 — handleKey)', (v) => void v.handleKey({ key: '7', code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, target: v.canvas } as unknown as KeyboardEvent)],
];

describe('0.112.0 고르기 모드 가상 커서 — 카메라가 멈춘 첫 그림에서 알리지 않고 다시 구한다', () => {
  it.each(ONE_SHOT)('%s 뒤 다음 그림에서 한 번 — 같은 카메라에서 커서를 켠 것과 후보·표식·Tab이 같다(0.111.0은 앞 화면 후보)', (_name, op) => {
    const v = make();
    const said = cursor(v);
    said.length = 0;
    const c0 = JSON.stringify(v.getCamera());
    const k = calls(v, 'keyRecompute');
    const p = calls(v, 'pickList');
    op(v);
    expect(JSON.stringify(v.getCamera())).not.toBe(c0);
    // 그리기 전에는 다시 구하지 않는다(카메라가 멈춘 그림에서)
    expect([k.n, p.n]).toEqual([0, 0]);
    const t = trace(v);
    expect([k.n, p.n]).toEqual([1, 1]);
    expect(said).toEqual([]);
    v.renderNow();
    expect([k.n, p.n]).toEqual([1, 1]);
    sameAsFresh(v, said, t);
  });

  it('보기 키 1(앞): 앞 화면의 겹친 후보(U 윗면·아랫면·L)가 아니라 새 화면의 그 자리 후보로 바뀐다 — 커서 자리는 화면 그 자리', () => {
    const v = make();
    cursor(v);
    const before = sigs(v);
    const at = [kc(v).x, kc(v).y];
    expect(before.length).toBeGreaterThanOrEqual(2);
    expect(before.some((s) => s?.startsWith('mesh:U:'))).toBe(true);
    press(v, '1');
    v.renderNow();
    expect([kc(v).x, kc(v).y]).toEqual(at);
    // 앞에서 본 가운데(상자 사이 높이)는 U를 지나지 않는다
    expect(sigs(v).some((s) => s?.startsWith('mesh:U:'))).toBe(false);
    expect(v.keyboardCursor!.count).toBe(sigs(v).length);
    expect(sigs(v)).toEqual(v.pickCandidates(at[0]!, at[1]!, 'keyboard').map(sig));
  });

  it('같은 후보가 남으면 그 차례(setProjection — 가운데 시선은 같다): Tab으로 둘째 후보를 둔 채 다시 구해도 둘째', () => {
    const v = make();
    const said = cursor(v);
    expect(v.keyboardCursor!.count).toBeGreaterThanOrEqual(2);
    key(v, 'Tab');
    expect(v.keyboardCursor!.index).toBe(1);
    const shown = sigs(v)[1];
    said.length = 0;
    const k = calls(v, 'keyRecompute');
    v.setProjection('orthographic');
    v.renderNow();
    expect(k.n).toBe(1);
    expect(said).toEqual([]);
    const c = kc(v);
    expect(sigs(v)).toEqual(v.pickCandidates(c.x, c.y, 'keyboard').map(sig));
    expect(c.index).toBe(1);
    expect(sigs(v)[1]).toBe(shown);
  });

  it('휠: 굴리는 동안(사건마다 그림, 마지막 사건 160 ms 안)은 고르지 않고 멈춘 뒤 그림에서 한 번 — 커서 자리에서 굴리면 같은 후보·차례', () => {
    const v = make();
    const said = cursor(v);
    key(v, 'Tab');
    const shown = sigs(v)[1];
    said.length = 0;
    const c = kc(v);
    const k = calls(v, 'keyRecompute');
    const p = calls(v, 'pickList');
    const c0 = JSON.stringify(v.getCamera());
    wheel(v, c.x, c.y, -120);
    v.renderNow();
    vi.advanceTimersByTime(100);
    wheel(v, c.x, c.y, -120);
    v.renderNow();
    vi.advanceTimersByTime(159);
    v.renderNow();
    expect(JSON.stringify(v.getCamera())).not.toBe(c0);
    expect([k.n, p.n]).toEqual([0, 0]);
    expect(pending(v)).toBe(false);
    vi.advanceTimersByTime(1);
    // 휠 타이머가 이미 그 그림을 건다(더 거는 그림 없음)
    expect(pending(v)).toBe(true);
    v.renderNow();
    expect([k.n, p.n]).toEqual([1, 1]);
    expect(said).toEqual([]);
    expect(kc(v).index).toBe(1);
    expect(sigs(v)[1]).toBe(shown);
    expect(sigs(v)).toEqual(v.pickCandidates(c.x, c.y, 'keyboard').map(sig));
  });

  it('보기 키 움직임(0.32초): 가운데 프레임에서는 고르지 않고 끝 프레임에서 한 번 — 같은 카메라에서 커서를 켠 것과 같다', () => {
    const v = make(true);
    const said = cursor(v);
    said.length = 0;
    const k = calls(v, 'keyRecompute');
    const p = calls(v, 'pickList');
    const c0 = JSON.stringify(v.getCamera());
    press(v, '1');
    for (let i = 0; i < 3; i++) {
      clock += 100;
      v.renderNow();
    }
    expect(JSON.stringify(v.getCamera())).not.toBe(c0);
    expect([k.n, p.n]).toEqual([0, 0]);
    clock += 100;
    const t = trace(v);
    expect([k.n, p.n]).toEqual([1, 1]);
    expect(said).toEqual([]);
    clock += 100;
    v.renderNow();
    expect([k.n, p.n]).toEqual([1, 1]);
    sameAsFresh(v, said, t);
  });

  it('뷰 큐브 끌기: 끄는 동안은 고르지 않고 뗀 뒤 한 장을 걸어 한 번(0.111.0은 측정 중일 때만 걸었다)', () => {
    const v = make();
    const said = cursor(v);
    said.length = 0;
    const k = calls(v, 'keyRecompute');
    const c0 = JSON.stringify(v.getCamera());
    cubeDrag(v);
    expect(JSON.stringify(v.getCamera())).not.toBe(c0);
    expect(k.n).toBe(0);
    expect(pending(v)).toBe(false);
    cube(v, 'pointerup', 52, 40, 0);
    expect(pending(v)).toBe(true);
    const t = trace(v);
    expect(k.n).toBe(1);
    expect(said).toEqual([]);
    expect(v.keyboardCursor).not.toBeNull();
    sameAsFresh(v, said, t);
  });

  it('3D 보기 크기: 다음 그림에서 한 번 — 커서는 화면 그 자리, 후보는 새 크기의 그 자리 겹친 후보', () => {
    const v = make();
    const said = cursor(v);
    said.length = 0;
    const at = [kc(v).x, kc(v).y];
    const k = calls(v, 'keyRecompute');
    resize(v, 700, 500);
    v.renderNow();
    expect(k.n).toBe(1);
    expect(said).toEqual([]);
    expect([kc(v).x, kc(v).y]).toEqual(at);
    expect(sigs(v)).toEqual(v.pickCandidates(at[0]!, at[1]!, 'keyboard').map(sig));
  });

  it('pickCycle false(후보 돌리기 없음 — 커서 자리만 쓰는 앱 도구): 고른 것 하나를 알리지 않고 다시 구한다 — 같은 카메라에서 켠 것과 같다', () => {
    const v = make();
    const said = cursor(v, { pickCycle: false });
    const before = sig(kc(v).pick);
    expect(before?.startsWith('mesh:U:')).toBe(true);
    said.length = 0;
    const k = calls(v, 'keyRecompute');
    press(v, '1');
    v.renderNow();
    expect(k.n).toBe(1);
    expect(said).toEqual([]);
    expect(sig(kc(v).pick)).not.toBe(before);
    const w = make();
    w.setCamera(v.getCamera());
    w.renderNow();
    cursor(w, { pickCycle: false });
    expect(st(v)).toBe(st(w));
  });
});

/** 사용자 입력 카메라(가상 커서가 켜져 있으면 다시 구하는 것) */
const TRIGGERS: [string, (v: Viewer3d) => void][] = [
  ['setProjection', (v) => v.setProjection('orthographic')],
  ['보기 키 F', (v) => press(v, 'f')],
  [
    '휠',
    (v) => {
      wheel(v, 400, 300, -120);
      v.renderNow();
      vi.advanceTimersByTime(200);
    },
  ],
];

describe('0.112.0 0.111.0 그대로인 길', () => {
  it.each(TRIGGERS)('%s: 가상 커서가 꺼져 있으면(키보드 스냅 꺼짐·켜고 커서를 켜지 않음·커서를 Esc로 끔) 고르지 않는다', (_name, op) => {
    const plain = make();
    const idle = make();
    idle.setKeyboardSnap({ announce: () => undefined });
    const ended = make();
    cursor(ended);
    key(ended, 'Escape');
    expect(ended.keyboardCursor).toBeNull();
    for (const v of [plain, idle, ended]) {
      const k = calls(v, 'keyRecompute');
      const p = calls(v, 'pickList');
      const c0 = JSON.stringify(v.getCamera());
      op(v);
      v.renderNow();
      v.renderNow();
      expect(JSON.stringify(v.getCamera())).not.toBe(c0);
      expect([k.n, p.n]).toEqual([0, 0]);
      expect(v.keyboardCursor).toBeNull();
    }
  });

  it('뷰 큐브 끌기(가상 커서 꺼짐·측정 꺼짐): 뗄 때 그림을 걸지 않는다', () => {
    const idle = make();
    idle.setKeyboardSnap({ announce: () => undefined });
    const ended = make();
    cursor(ended);
    key(ended, 'Escape');
    for (const v of [idle, ended]) {
      cubeDrag(v);
      cube(v, 'pointerup', 52, 40, 0);
      expect(pending(v)).toBe(false);
    }
  });

  it("가상 커서 측정 모드: 0.110.0 그대로 — setProjection 뒤 다음 그림에서 알리지 않고 한 번('refresh' 없음), 그 자리 측정 후보", () => {
    const v = make();
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true });
    v.renderNow();
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    expect(v.keyboardCursor?.mode).toBe('measure');
    said.length = 0;
    const k = calls(v, 'keyRecompute');
    v.setProjection('orthographic');
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
});
