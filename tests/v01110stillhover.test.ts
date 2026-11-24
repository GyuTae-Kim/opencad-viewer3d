/**
 * 0.111.0 미리 보기가 null인 커서 자리에서도 다시 구하기(113차): 0.98.0부터 코어는 장면 길 뒤 측정 미리 보기를 그 커서 자리에서 다시 구하는데 미리 보기가 있을 때만이었고,
 * 0.109.0(단면·겉모습·setPickEdges)·0.110.0(카메라가 멈춘 그림)·0.106.0(음영 가림 setRenderMode)도 같은 조건이라, 커서가 빈 곳(미리 보기 null) 위에 있으면 단면을 끄거나
 * 겉모습을 되돌리거나 윤곽선 고르기를 켜거나 휠로 축소해 형상이 커서 아래(붙잡기 거리 안)로 와도 마우스를 움직일 때까지 붙잡기 표식·onMeasureHoverChange가 없었다.
 * 이제 이 한 번씩 오는 길은 측정 중이고 마우스·펜 커서가 마지막으로 미리 보기를 구한 자리에 그대로 있으면(떠나지 않음·옮기지 않음) 미리 보기가 null이어도 다음 그림에서
 * 그 자리에서 다시 구한다 — 결과는 그 상태에서 같은 자리로 커서를 옮긴 것과 같고, 알림은 값이 바뀌었을 때만(null → 값이면 한 번).
 * 그대로인 것: 프레임마다 올 수 있는 길(setMesh·보이기 — NC 재생·보이기 애니메이션은 0.98.0 규칙대로 미리 보기가 있을 때만), 측정이 꺼진 길, 커서가 떠났거나 옮겼거나
 * 끌기 중·앱이 맡은 포인터, 측정을 껐다 켠 뒤(다음 포인터 이동까지), 가상 커서(알리지 않고 다시 구한다).
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
const scene: Scene3d = { name: 'still', units: 'mm', meshes: [L, U], lines: [B] };
/** U 윗면 가운데, U·B에서 먼 L 윗면 */
const A: P3 = [50, 50, 50];
const C: P3 = [150, 50, 20];
/** z > 35를 잘라 내는 평면(U를 통째로), 모두 잘라 내는 평면(잘린 면 채움도 없다) */
const CUT35 = { normal: [0, 0, 1], offset: 35 };
const CUT_ALL = { normal: [0, 0, 1], offset: -10 };

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.spyOn(performance, 'now').mockImplementation(() => 1000);
});
afterAll(() => {
  for (const v of views) v.dispose();
  vi.restoreAllMocks();
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
  v.setCamera({ ...v.getCamera(), target: [50.4, 50.3, 40], distance: 400 });
  v.renderNow();
  return v;
}
const none = (): void => undefined;
/** 측정 모드 + 붙잡기 선택(가운데 점 — 윤곽선은 setPickEdges를 따른다) + 준비 */
function measuring(prep: (v: Viewer3d) => void = none): Viewer3d {
  const v = make();
  v.setMeasureMode(true);
  v.setMeasureSnap({ midpoints: true });
  prep(v);
  v.renderNow();
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 세계 점의 화면 자리(조금 비켜 — 경계를 정확히 가리키지 않는다) */
function spot(v: Viewer3d, p: P3): At {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x + 0.37, y: s.y - 0.21 };
}
/** 마우스 포인터 사건 하나(그리지 않는다) */
const ptr = (v: Viewer3d, type: string, p: At, buttons = 0): void =>
  cv(v).fire(type, { clientX: p.x, clientY: p.y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const hover = (v: Viewer3d, p: At): void => {
  ptr(v, 'pointermove', p);
  v.renderNow();
};
function press(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
}
const wheel = (v: Viewer3d, p: At, deltaY: number): void => cv(v).fire('wheel', { clientX: p.x, clientY: p.y, deltaY, deltaMode: 0, ctrlKey: false, shiftKey: false });
/**
 * L 윗면 오른쪽 모서리(x = 200, z = 20) 위 y = 120 자리에서 화면 바깥쪽으로 0.5화소씩 커서를 옮겨(그때마다 그림), 미리 보기가 처음 null이 되는 자리에서 extra화소 더 간 자리.
 * 윤곽선 고르기를 끄면 면 바로 밖, 켜면 윤곽선 허용 거리 밖이다(모서리 가운데 점·구석은 130화소 넘게 떨어져 있다). 거기로 커서를 둔 채 돌려준다
 */
function outside(v: Viewer3d, extra = 0): At {
  const a = v.project([200, 120, 20])!, b = v.project([210, 120, 20])!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
  let seen = false;
  for (let d = -3; d <= 30; d += 0.5) {
    hover(v, { x: a.x + ux * d, y: a.y + uy * d });
    if (v.measureHoverSnap) {
      seen = true;
      continue;
    }
    if (!seen) break;
    const q = { x: a.x + ux * (d + extra), y: a.y + uy * (d + extra) };
    if (extra) hover(v, q);
    expect(v.measureHoverSnap).toBeNull();
    return q;
  }
  throw new Error('면 위에서 빈 곳으로 넘어가는 자리를 찾지 못했다');
}
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
/** 같은 상태·같은 카메라의 새 뷰어에서 그 자리로 커서를 옮긴 것과 미리 보기·덧그림이 같은지 */
function sameAsFresh(v: Viewer3d, p: At, t: string[], prep: (w: Viewer3d) => void): void {
  const w = measuring(prep);
  w.setCamera(v.getCamera());
  w.renderNow();
  hover(w, p);
  expect(st(v)).toBe(st(w));
  expect(t).toEqual(trace(w));
}
/** 커서를 둔 채 부르는 한 번씩 오는 길(바꾼 뒤 상태를 새 뷰어에 거는 준비와 짝) */
const OPS: [string, (v: Viewer3d) => void][] = [
  ['단면', (v) => v.setSection(CUT35)],
  ['겉모습', (v) => v.setItemOpacity('U', 0.4, { pickable: false })],
  ['setPickEdges', (v) => v.setPickEdges(true)],
  ['setRenderMode(가림 바뀜)', (v) => v.setRenderMode('wireframe')],
  ['setProjection(카메라가 멈춘 그림)', (v) => v.setProjection('orthographic')],
];

describe('0.111.0 빈 곳 위 커서(미리 보기 null) — 한 번씩 오는 길 뒤 다음 그림에서 그 자리에서 다시 구한다', () => {
  it.each(OPS)('%s 뒤 마우스를 옮기지 않고 다음 그림: 한 번 다시 구한다 — 그 상태에서 그 자리로 옮긴 것과 같다(0.110.0은 다시 구하지 않음)', (_name, op) => {
    const v = measuring();
    const p = outside(v);
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void heard.push(s));
    const n = calls(v, 'measureAt');
    op(v);
    const t = trace(v);
    expect(n.n).toBe(1);
    sameAsFresh(v, p, t, op);
    // 알림은 값이 바뀌었을 때만(그대로 null이면 없다)
    expect(heard).toEqual(v.measureHoverSnap ? [v.measureHoverSnap] : []);
  });

  it('단면 끄기: 모두 잘라 낸 채 가리킨 자리(null)에서 끄면 그 자리의 값 — null → 값 알림 한 번', () => {
    const v = measuring((x) => x.setSection(CUT_ALL));
    const p = spot(v, A);
    hover(v, p);
    expect(v.measureHoverSnap).toBeNull();
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void heard.push(s));
    const n = calls(v, 'measureAt');
    v.setSection(null);
    // 다시 구하기 전까지는 앞 값(null), 알림은 그 그림 뒤
    expect(v.measureHoverSnap).toBeNull();
    expect(heard).toEqual([]);
    const t = trace(v);
    expect(n.n).toBe(1);
    expect(z(v.measureHoverSnap)).toBe(50);
    expect(heard).toHaveLength(1);
    expect(heard[0]).toEqual(v.measureHoverSnap);
    sameAsFresh(v, p, t, none);
  });

  it('단면으로 잘려 null이 된 뒤 단면을 다시 끄면 다시 값(0.109.0·0.110.0은 다음 포인터 이동까지 null)', () => {
    const v = measuring();
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void heard.push(s));
    hover(v, spot(v, A));
    v.setSection(CUT35);
    v.renderNow();
    v.setSection(CUT_ALL);
    v.renderNow();
    expect(heard.map(z)).toEqual([50, 30, null]);
    const n = calls(v, 'measureAt');
    v.setSection(null);
    v.renderNow();
    expect(n.n).toBe(1);
    expect(heard.map(z)).toEqual([50, 30, null, 50]);
    // 다시 잘라 null, 다시 켜도 같은 규칙
    v.setSection(CUT_ALL);
    v.renderNow();
    v.setSectionAxis('z', 35, { world: true });
    v.renderNow();
    expect(heard.map(z)).toEqual([50, 30, null, 50, null, 30]);
    expect(n.n).toBe(3);
  });

  it('겉모습 되돌리기: 고르지 않게 한 L 위(null)에서 clearItemLooks — 그 자리 L 윗면 값, 알림 한 번', () => {
    const v = measuring((x) => x.setItemOpacity('L', 0.4, { pickable: false }));
    const p = spot(v, C);
    hover(v, p);
    expect(v.measureHoverSnap).toBeNull();
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void heard.push(s));
    const n = calls(v, 'measureAt');
    v.clearItemLooks();
    const t = trace(v);
    expect(n.n).toBe(1);
    expect(z(v.measureHoverSnap)).toBe(20);
    expect(heard).toEqual([v.measureHoverSnap]);
    sameAsFresh(v, p, t, none);
  });

  it('setPickEdges(true): 면 바로 밖(null)에서 켜면 그 자리 윤곽선 값, 알림 한 번', () => {
    const v = measuring();
    const p = outside(v);
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void heard.push(s));
    const n = calls(v, 'measureAt');
    v.setPickEdges(true);
    const t = trace(v);
    expect(n.n).toBe(1);
    expect(v.measureHoverSnap).not.toBeNull();
    expect(z(v.measureHoverSnap)).toBe(20);
    expect(heard).toEqual([v.measureHoverSnap]);
    sameAsFresh(v, p, t, (w) => w.setPickEdges(true));
  });

  it('휠 축소: 굴리는 동안은 고르지 않고, 멈춘 그림에서 한 번 — 윤곽선 허용 거리 밖(null)이던 자리에 윤곽선이 들어오면 그 값, 알림 한 번', () => {
    const edges = (x: Viewer3d): void => x.setPickEdges(true);
    const v = measuring(edges);
    const p = outside(v, 1);
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void heard.push(s));
    const n = calls(v, 'measureAt');
    wheel(v, p, 400);
    v.renderNow();
    wheel(v, p, 400);
    v.renderNow();
    expect(n.n).toBe(0);
    expect(heard).toEqual([]);
    vi.advanceTimersByTime(160);
    const t = trace(v);
    expect(n.n).toBe(1);
    expect(v.measureHoverSnap).not.toBeNull();
    expect(heard).toEqual([v.measureHoverSnap]);
    sameAsFresh(v, p, t, edges);
  });
});

describe('0.111.0 0.110.0 그대로인 길', () => {
  it('프레임마다 올 수 있는 길(setMesh·보이기): 빈 곳 위 커서는 다시 구하지 않는다(0.98.0 규칙 — 다음 포인터 이동에서)', () => {
    const m = measuring();
    const p = outside(m);
    const n = calls(m, 'measureAt');
    // U를 커서 아래로 옮긴 그물로 바꾼다(다시 구했다면 그 윗면 값)
    m.setMesh(boxMesh('U', [150, 60, 30], [260, 180, 45], [0.7, 0.6, 0.5, 1]));
    m.renderNow();
    m.renderNow();
    expect(n.n).toBe(0);
    expect(m.measureHoverSnap).toBeNull();
    hover(m, p);
    expect(n.n).toBe(1);
    expect(z(m.measureHoverSnap)).toBe(45);

    const s = measuring((x) => x.setItemVisible('L', false));
    const q = spot(s, C);
    hover(s, q);
    expect(s.measureHoverSnap).toBeNull();
    const k = calls(s, 'measureAt');
    s.setItemVisible('L', true);
    s.renderNow();
    expect(k.n).toBe(0);
    expect(s.measureHoverSnap).toBeNull();
    hover(s, q);
    expect(z(s.measureHoverSnap)).toBe(20);
  });

  it.each(OPS)('%s: 측정 꺼짐·커서가 떠남·껐다 켬(움직이지 않음)이면 다시 구하지 않는다', (_name, op) => {
    const p = outside(measuring());
    const off = make();
    hover(off, p);
    const left = measuring();
    hover(left, p);
    cv(left).fire('pointerleave', {});
    left.renderNow();
    const again = measuring();
    hover(again, p);
    again.setMeasureMode(false);
    again.renderNow();
    again.setMeasureMode(true);
    again.renderNow();
    for (const v of [off, left, again]) {
      const n = calls(v, 'measureAt');
      const k = calls(v, 'keyRecompute');
      op(v);
      v.renderNow();
      v.renderNow();
      expect([n.n, k.n]).toEqual([0, 0]);
      expect(v.measureHoverSnap).toBeNull();
    }
  });

  it.each(OPS)('%s: 끌기 중(누른 채)·끌어 돌린 뒤·앱이 맡은 포인터면 다시 구하지 않는다', (_name, op) => {
    const p = outside(measuring());
    const held = measuring();
    hover(held, p);
    ptr(held, 'pointerdown', p, 1);
    const dragged = measuring();
    hover(dragged, p);
    ptr(dragged, 'pointerdown', p, 1);
    ptr(dragged, 'pointermove', { x: p.x - 40, y: p.y + 10 }, 1);
    ptr(dragged, 'pointerup', { x: p.x - 40, y: p.y + 10 }, 0);
    dragged.renderNow();
    const claimed = measuring((x) => x.setPointerClaim(() => true));
    hover(claimed, p);
    ptr(claimed, 'pointerdown', p, 1);
    expect(claimed.heldPointers).toEqual([1]);
    for (const v of [held, dragged, claimed]) {
      expect(v.measureHoverSnap).toBeNull();
      const n = calls(v, 'measureAt');
      op(v);
      v.renderNow();
      v.renderNow();
      expect(n.n).toBe(0);
      expect(v.measureHoverSnap).toBeNull();
    }
  });

  it("가상 커서 측정 모드(후보 없음): 알리지 않고 다음 그림에서 다시 구한다('refresh' 없음 — 0.98.0·0.110.0 그대로)", () => {
    const v = measuring((x) => x.setSection(CUT_ALL));
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    press(v, 'Enter');
    v.renderNow();
    expect(v.measureHoverSnap).toBeNull();
    said.length = 0;
    const k = calls(v, 'keyRecompute');
    v.setSection(null);
    v.renderNow();
    expect(said).toEqual([]);
    expect(k.n).toBe(1);
  });
});
