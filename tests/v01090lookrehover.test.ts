/**
 * 0.109.0 겉모습·setPickEdges·단면 뒤 측정 미리 보기(111차): 0.98.0부터 장면 길(메시 바꾸기·보이기·구간 숨김 …)·0.100.0 그리기 범위·0.106.0 음영 가림은
 * 측정 미리 보기를 다음 그림에서 그 커서 자리(rehover — 0.104.0 가장 늦은 포인터 자리)로 다시 구하지만, 겉모습(setItemOpacity·setItemMatrix·setItemLooks …)·setPickEdges·
 * 단면(setSection·setSections·setSectionAxis …)은 미리 보기를 버려(0.108.0) 마우스를 멈춘 채 바꾸면 붙잡기 표식이 사라지고 onMeasureHoverChange가 null을 받았다가
 * 마우스를 움직여야 돌아왔다. 이제 이 세 길도 마우스·펜 커서가 미리 보기를 둔 채 그대로 있으면 다음 그림에서 그 자리에서 다시 구한다 — 결과는 그 상태에서 같은 자리로
 * 커서를 다시 옮긴 것과 같고, 알림은 값이 바뀌었을 때만 한 번(잘려 붙잡을 것이 없으면 null).
 * 측정이 꺼졌거나 미리 보기가 없거나(포인터가 떠남 포함) 끌기 중·앱이 맡은 포인터가 있으면 0.108.0 그대로 버리고(다시 구하지 않는다), 가상 커서는 0.98.0·0.99.0 그대로
 * 알리지 않고 다음 그림에서 다시 구한다.
 * 0.111.0: 미리 보기가 null이어도 마우스·펜 커서가 그 자리에 그대로 있으면 다시 구한다(v01110stillhover) — 아래 「미리 보기가 없으면」은 커서를 둔 적 없는 뷰어다.
 * 장면(위에서 봄): 아래 상자 L [-100,-100,0]–[200,200,20], 위 상자 U [20,20,40]–[80,80,50], U 아래 선분 B (30,50,30)–(70,50,30)
 * (가운데 점 (50,50,30) — U 윗면에 가린다. U를 고르지 않게 하거나 반투명으로 하거나 옮기거나 잘라 내면 보인다)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Scene3d } from '../src/types';

type P3 = [number, number, number];
const L = boxMesh('L', [-100, -100, 0], [200, 200, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
const B: LineSet3d = { id: 'B', name: 'B', positions: new Float32Array([30, 50, 30, 70, 50, 30]), color: [0.9, 0.9, 0.2, 1] };
const scene: Scene3d = { name: 'look', units: 'mm', meshes: [L, U], lines: [B] };
/** U 윗면 가운데(그 아래 B 가운데 점), U 앞 윗모서리 바로 안쪽(윤곽선 고르기를 켜면 그 모서리 가운데 점 (50,20,50)), U에서 먼 L 윗면 */
const A: P3 = [50, 50, 50];
const E: P3 = [50, 20.8, 50];
const C: P3 = [150, 50, 20];
/** 옮기기 행렬(열 우선) */
const move = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
/** z > 35를 잘라 내는 평면(U를 통째로 — B·L은 남는다), 모두 잘라 내는 평면 */
const CUT35 = { normal: [0, 0, 1], offset: 35 };
const CUT_ALL = { normal: [0, 0, 1], offset: -10 };

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

function make(): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  // 캔버스 가운데(가상 커서를 켜는 자리)가 B 가운데 점을 정확히 가리키지 않게 조금 비킨다
  v.setCamera({ ...v.getCamera(), target: [50.4, 50.3, 40], distance: 400 });
  v.renderNow();
  return v;
}
/** 측정 모드 + 붙잡기 선택(가운데 점 — 윤곽선은 setPickEdges를 따른다) + 준비 */
function measuring(prep: (v: Viewer3d) => void = () => undefined): Viewer3d {
  const v = make();
  v.setMeasureMode(true);
  v.setMeasureSnap({ midpoints: true });
  prep(v);
  v.renderNow();
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 세계 점의 화면 자리(조금 비켜 — 경계를 정확히 가리키지 않는다) */
function at(v: Viewer3d, p: P3): { x: number; y: number } {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x + 0.37, y: s.y - 0.21 };
}
/** 포인터 사건 하나(그리지 않는다) */
const ptr = (v: Viewer3d, type: string, p: P3, buttons: number): void => {
  const s = at(v, p);
  cv(v).fire(type, { clientX: s.x, clientY: s.y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
};
const pmove = (v: Viewer3d, p: P3): void => ptr(v, 'pointermove', p, 0);
const hover = (v: Viewer3d, p: P3): void => {
  pmove(v, p);
  v.renderNow();
};
/** 키 하나(그리지 않는다) */
function press(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
}
const key = (v: Viewer3d, k: string): void => {
  press(v, k);
  v.renderNow();
};
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
const z = (s: MeasureHoverSnap | null | undefined): number | null => (s ? Math.round(s.point[2] * 1000) / 1000 : null);
/** 미리 보기 상태(점·종류·잠글 방향) */
const st = (v: Viewer3d): string => JSON.stringify([v.measureHoverSnap, v.measureHoverLock]);

/** [이름, 커서 자리, 준비(커서를 놓기 전), 바꾸기, 다시 구한 값의 z(undefined면 견주지 않음), 붙잡기 종류(주면 견줌)] */
type Case = [string, P3, (v: Viewer3d) => void, (v: Viewer3d) => void, (number | null)?, (string | null)?];
const none = (): void => undefined;
const SECTION: Case[] = [
  ['setSection', A, none, (v) => v.setSection(CUT35), 30, 'midpoint'],
  ['setSections', A, none, (v) => v.setSections([CUT35]), 30, 'midpoint'],
  ['setSectionAxis', A, none, (v) => v.setSectionAxis('z', 35, { world: true }), 30, 'midpoint'],
  ['setSectionPosition', A, (v) => v.setSectionAxis('z', 60, { world: true }), (v) => v.setSectionPosition(35, { world: true }), 30, 'midpoint'],
  ['flipSection', A, (v) => v.setSectionAxis('z', 35, { world: true, flip: true }), (v) => v.flipSection(), 30, 'midpoint'],
  ['setSectionOptions', A, (v) => v.setSection({ normal: [0, 0, 1], offset: 45 }), (v) => v.setSectionOptions({ caps: 'none' })],
  ['moveSectionByPixels', A, (v) => v.setSectionAxis('z', 60, { world: true }), (v) => void v.moveSectionByPixels(0, 60)],
  ['setSection(null)', A, (v) => v.setSection(CUT35), (v) => v.setSection(null), 50],
  ['모두 잘라 냄', A, none, (v) => v.setSection(CUT_ALL), null],
];
const LOOKS: Case[] = [
  ['setItemOpacity(pickable: false)', A, none, (v) => v.setItemOpacity('U', 0.4, { pickable: false }), 30, 'midpoint'],
  ['setItemOpacity(반투명)', A, none, (v) => v.setItemOpacity('U', 0.4)],
  ['setItemMatrix', A, none, (v) => v.setItemMatrix('U', move(200, 0, 0)), 30, 'midpoint'],
  ['setItemMatrices', A, none, (v) => void v.setItemMatrices([['U', move(200, 0, 0)]]), 30, 'midpoint'],
  ['setItemLooks', A, none, (v) => void v.setItemLooks([['U', { opacity: 0.4, pickable: false }]]), 30, 'midpoint'],
  ['clearItemLooks', A, (v) => v.setItemMatrix('U', move(200, 0, 0)), (v) => v.clearItemLooks(), 50],
  ['setItemColor(같은 값)', A, none, (v) => v.setItemColor('U', '#ff0000'), 50],
  ['setItemEdgeColor(같은 값)', A, none, (v) => v.setItemEdgeColor('U', '#00ff00'), 50],
  ['setItemProfileColor(같은 값)', A, none, (v) => v.setItemProfileColor('U', '#0000ff'), 50],
  ['setItemPickOpaque(같은 값)', A, none, (v) => v.setItemPickOpaque('U', true), 50],
  ['setItemPickThrough(같은 값)', A, none, (v) => v.setItemPickThrough('U', [{ start: 0, count: 2 }]), 50],
];
const EDGES: Case[] = [
  ['setPickEdges(true)', E, none, (v) => v.setPickEdges(true), 50, 'midpoint'],
  ['setPickEdges(false)', E, (v) => v.setPickEdges(true), (v) => v.setPickEdges(false), 50],
  ['setPickEdges — 붙잡기가 윤곽선을 정함(같은 값)', E, (v) => v.setMeasureSnap({ midpoints: true, edges: true }), (v) => v.setPickEdges(true), 50, 'midpoint'],
];

describe('0.109.0 측정 미리 보기(마우스)를 둔 채 바꾸기 — 다음 그림에서 그 자리에서 다시 구한다', () => {
  it.each([...SECTION, ...LOOKS, ...EDGES])('%s 뒤 마우스를 옮기지 않고 다음 그림: 바뀐 상태의 미리 보기 — 그 자리로 다시 옮긴 것과 같다(0.108.0은 버림)', (_name, p, prep, op, wantZ, wantSnap) => {
    const v = measuring(prep);
    hover(v, p);
    expect(v.measureHoverSnap).not.toBeNull();
    const n = calls(v, 'measureAt');
    op(v);
    const t = trace(v);
    expect(n.n).toBe(1);
    const w = measuring(prep);
    op(w);
    hover(w, p);
    expect(st(v)).toBe(st(w));
    expect(t).toEqual(trace(w));
    if (wantZ !== undefined) expect(z(v.measureHoverSnap)).toBe(wantZ);
    if (wantSnap !== undefined) expect(v.measureHoverSnap?.snap ?? null).toBe(wantSnap);
  });

  it('onMeasureHoverChange: 다음 그림 뒤 값이 바뀌었을 때만 한 번(0.108.0은 null 다음 마우스를 옮겨야 새 값) — 잘려 붙잡을 것이 없으면 null', () => {
    const v = measuring();
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void heard.push(s));
    hover(v, A);
    expect(heard.map(z)).toEqual([50]);
    v.setSection(CUT35);
    // 다시 구하기 전까지는 앞 값(장면 길과 같다), 알림은 그 그림 뒤
    expect(z(v.measureHoverSnap)).toBe(50);
    expect(heard).toHaveLength(1);
    v.renderNow();
    expect(heard.map(z)).toEqual([50, 30]);
    expect(heard[1]).toEqual(v.measureHoverSnap);
    expect(heard[1]?.snap).toBe('midpoint');
    v.setSection(null);
    v.renderNow();
    expect(heard.map(z)).toEqual([50, 30, 50]);
    // 고르기에 닿지 않는 겉모습·커서에서 먼 윤곽선: 다시 구하지만 같은 값 — 알리지 않는다
    const n = calls(v, 'measureAt');
    v.setItemColor('U', '#ff0000');
    v.renderNow();
    v.setPickEdges(true);
    v.renderNow();
    expect(n.n).toBe(2);
    expect(heard).toHaveLength(3);
    v.setItemOpacity('U', 0.4, { pickable: false });
    v.renderNow();
    expect(heard.map(z)).toEqual([50, 30, 50, 30]);
    // 한 프레임에 세 길이 와도 한 번(마지막 값)
    v.setItemOpacity('U', null);
    v.setPickEdges(false);
    v.setSection(CUT35);
    v.renderNow();
    expect(heard.map(z)).toEqual([50, 30, 50, 30]);
    v.setSection(CUT_ALL);
    v.renderNow();
    expect(heard.map(z)).toEqual([50, 30, 50, 30, null]);
    expect(v.measureHoverSnap).toBeNull();
    // 0.111.0 미리 보기가 null이 된 뒤에도 커서가 그 자리에 그대로 있으면 다시 구한다(0.109.0·0.110.0은 장면 길과 같은 규칙으로 다음 포인터 이동까지 null — v01110stillhover)
    const m = calls(v, 'measureAt');
    v.setSection(null);
    v.renderNow();
    expect(m.n).toBe(1);
    expect(z(v.measureHoverSnap)).toBe(50);
    expect(heard.map(z)).toEqual([50, 30, 50, 30, null, 50]);
    hover(v, A);
    expect(heard.map(z)).toEqual([50, 30, 50, 30, null, 50]);
  });

  it('같은 프레임에 먼저 온 포인터 이동: 가장 늦은 포인터 자리에서 바뀐 상태로(0.104.0 규칙 그대로)', () => {
    const orders: [string, (v: Viewer3d) => void][] = [
      ['이동 뒤 단면', (v) => (pmove(v, C), v.setSection(CUT35))],
      ['단면 뒤 이동', (v) => (v.setSection(CUT35), pmove(v, C))],
      ['이동 뒤 겉모습', (v) => (pmove(v, C), v.setSection(CUT35), v.setItemMatrix('U', move(0, 0, 0)))],
    ];
    const w = measuring((x) => x.setSection(CUT35));
    hover(w, C);
    for (const [name, steps] of orders) {
      const v = measuring();
      hover(v, A);
      steps(v);
      v.renderNow();
      expect(st(v), name).toBe(st(w));
    }
  });
});

/** 세 길 하나씩(마우스 미리 보기가 있었다면 값이 바뀌는 것) */
const OPS: [string, (v: Viewer3d) => void][] = [
  ['단면', (v) => v.setSection(CUT35)],
  ['setPickEdges', (v) => v.setPickEdges(true)],
  ['겉모습', (v) => v.setItemOpacity('U', 0.4, { pickable: false })],
];

describe('0.109.0 0.108.0 그대로인 길', () => {
  it.each(OPS)('%s: 측정이 꺼졌거나 미리 보기가 없으면(움직이지 않음·포인터가 떠남) 다시 구하지 않는다', (_name, op) => {
    const off = make();
    hover(off, A);
    const still = measuring();
    const left = measuring();
    hover(left, A);
    cv(left).fire('pointerleave', {});
    left.renderNow();
    for (const v of [off, still, left]) {
      const n = calls(v, 'measureAt');
      const k = calls(v, 'keyRecompute');
      op(v);
      v.renderNow();
      expect([n.n, k.n]).toEqual([0, 0]);
      expect(v.measureHoverSnap).toBeNull();
    }
  });

  it.each(OPS)('%s: 끌기 중(누른 채)·앱이 맡은 포인터면 곧 버리고 다시 구하지 않는다(0.10.0·0.32.0 그대로)', (_name, op) => {
    const d = measuring();
    hover(d, A);
    ptr(d, 'pointerdown', A, 1);
    const n = calls(d, 'measureAt');
    op(d);
    expect(d.measureHoverSnap).toBeNull();
    d.renderNow();
    expect(n.n).toBe(0);
    expect(d.measureHoverSnap).toBeNull();
    ptr(d, 'pointercancel', A, 0);
    const h = measuring((x) => x.setPointerClaim(() => true));
    hover(h, A);
    expect(z(h.measureHoverSnap)).toBe(50);
    ptr(h, 'pointerdown', A, 1);
    expect(h.heldPointers).toEqual([1]);
    const m = calls(h, 'measureAt');
    op(h);
    expect(h.measureHoverSnap).toBeNull();
    h.renderNow();
    expect(m.n).toBe(0);
    expect(h.measureHoverSnap).toBeNull();
  });

  it.each(OPS)("%s: 가상 커서 측정 모드는 알리지 않고 다음 그림에서 다시 구한다 — 커서를 다시 켠 것과 같다('refresh' 없음 — 0.98.0·0.99.0 그대로)", (_name, op) => {
    const v = measuring();
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    expect(v.measureHoverSnap).not.toBeNull();
    said.length = 0;
    const k = calls(v, 'keyRecompute');
    op(v);
    const t = trace(v);
    const s = [v.keyboardCursor, v.measureHoverSnap];
    expect(said).toEqual([]);
    expect(k.n).toBe(1);
    key(v, 'Escape');
    key(v, 'Enter');
    expect(t).toEqual(trace(v));
    expect(s).toEqual([v.keyboardCursor, v.measureHoverSnap]);
  });
});
