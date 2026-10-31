/**
 * 0.32.0 앱이 포인터를 맡는 훅(Viewer3d.setPointerClaim·claimPointer·heldPointers — 순수 기록 PointerHolds·takesBackTouches).
 * - 순수: 맡은 차례·자리 고치기·떼기·손가락만 돌려받기·처리기 떼기, 둘째 손가락 규칙
 * - 뷰어(가짜 DOM — 실제 포인터 사건): 처리기를 주지 않거나 늘 false인 처리기는 같은 몸짓 차례(마우스 궤도·이동·누르기·두 번 누르기·가운데 두 번,
 *   손가락 누르기·궤도·핀치·셋째 손가락, 취소, 펜, 휠, 측정 점 찍기)에서 카메라·고르기·측정이 같고, 묻는 때('down'은 누를 때마다, 'drag'는 한 포인터 끌기 시작 거리를 넘을 때만)가 맞는지.
 *   누른 순간·끌기 시작에서 맡으면 코어가 아무것도 하지 않는지(카메라·고르기·측정 점·측정 미리 보기), move·end 알림, 맡은 뒤 코어가 깨끗한지(다음 끌기·누르기가 처리기 없는 뷰어와 같다),
 *   둘째 손가락(앱이 맡지 않으면 돌려받아 핀치 — 그 자리에서 두 손가락을 누른 뷰어와 같은 카메라, 맡으면 둘 다 앱 것, 코어 손가락은 그대로 궤도),
 *   claimPointer(궤도·핀치 중 — 합성 pointercancel을 보낸 뷰어와 같다), 처리기 끄기('off'), 같은 id로 다시 누르기, 마우스를 맡은 동안 손가락, 휠, q.pick
 * 화면 좌표는 그물 경계를 정확히 가리키지 않는다(누르는 자리는 판·부품 면 안쪽).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { PointerHolds, takesBackTouches } from '../src/claim';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import type { HeldPointer, PointerClaimHandler, PointerClaimQuery, PointerHoldEnd } from '../src/viewer';
import type { Pick3d, Scene3d } from '../src/types';

// ───────────── 순수: PointerHolds·takesBackTouches ─────────────
describe('PointerHolds(순수)', () => {
  it('맡은 차례·자리 고치기·떼기·같은 id 다시 맡기', () => {
    const h = new PointerHolds<string>();
    h.hold(3, 'touch', 10, 20, 10, 20, 'a');
    h.hold(1, '', 5, 5, 6, 7, null);
    expect(h.size).toBe(2);
    expect(h.ids()).toEqual([3, 1]);
    expect(h.get(1)).toMatchObject({ id: 1, type: 'mouse', sx: 5, sy: 5, x: 6, y: 7, on: null });
    expect(h.move(3, 40, 50)).toMatchObject({ x: 40, y: 50, sx: 10, sy: 20 });
    expect(h.move(9, 1, 1)).toBeNull();
    // 같은 id를 다시 맡으면 끝으로
    h.hold(3, 'touch', 0, 0, 0, 0, 'b');
    expect(h.ids()).toEqual([1, 3]);
    expect(h.get(3)!.on).toBe('b');
    expect(h.release(1)).toMatchObject({ id: 1 });
    expect(h.release(1)).toBeNull();
    expect(h.has(3)).toBe(true);
    h.clear();
    expect(h.size).toBe(0);
  });

  it('손가락만 맡은 차례대로 돌려받고, 처리기는 그 처리기 것만 뗀다', () => {
    const h = new PointerHolds<string>();
    h.hold(1, 'mouse', 0, 0, 0, 0, 'a');
    h.hold(7, 'touch', 0, 0, 1, 1, 'a');
    h.hold(2, 'pen', 0, 0, 0, 0, 'b');
    h.hold(5, 'touch', 0, 0, 2, 2, 'b');
    expect(h.takeTouches().map((x) => x.id)).toEqual([7, 5]);
    expect(h.ids()).toEqual([1, 2]);
    expect(h.takeTouches()).toEqual([]);
    expect(h.detach('a').map((x) => x.id)).toEqual([1]);
    expect(h.get(1)!.on).toBeNull();
    expect(h.get(2)!.on).toBe('b');
    expect(h.detach('a')).toEqual([]);
    expect(h.list().map((x) => x.id)).toEqual([1, 2]);
  });

  it('둘째 손가락 규칙: 새 누르기가 손가락이고 앱이 손가락을 맡았을 때만 돌려받는다', () => {
    expect(takesBackTouches('touch', [{ type: 'touch' }])).toBe(true);
    expect(takesBackTouches('touch', [{ type: 'mouse' }, { type: 'touch' }])).toBe(true);
    expect(takesBackTouches('touch', [{ type: 'mouse' }, { type: 'pen' }])).toBe(false);
    expect(takesBackTouches('touch', [])).toBe(false);
    expect(takesBackTouches('mouse', [{ type: 'touch' }])).toBe(false);
    expect(takesBackTouches('pen', [{ type: 'touch' }])).toBe(false);
    expect(takesBackTouches('', [{ type: 'touch' }])).toBe(false);
  });
});

// ───────────── 뷰어(가짜 DOM, 800 × 600) ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

const scene: Scene3d = {
  name: 'c',
  units: 'mm',
  meshes: [boxMesh('판', [0, 0, 0], [100, 80, 10], [0.6, 0.65, 0.7, 1]), boxMesh('부품', [30, 20, 10], [60, 50, 30], [0.7, 0.5, 0.3, 1])],
  lines: [],
  points: [],
};

interface View {
  v: Viewer3d;
  c: FakeElement;
  picks: unknown[];
  measures: unknown[];
}

function make(): View {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  const w: View = { v, c: v.canvas as unknown as FakeElement, picks: [], measures: [] };
  v.onPick((p, e) => w.picks.push([p ? [p.kind, p.id, p.index, p.point.map((x) => +x.toPrecision(9))] : null, e.clicks, e.button, e.pointerType]));
  v.onMeasure((m) => w.measures.push(m ? +m.distance.toPrecision(9) : null));
  return w;
}

interface Ev {
  pointerType?: string;
  button?: number;
  buttons?: number;
  shiftKey?: boolean;
}
const fire = (w: View, type: string, id: number, x: number, y: number, o: Ev = {}): void =>
  w.c.fire(type, {
    clientX: x,
    clientY: y,
    pointerId: id,
    pointerType: o.pointerType ?? 'mouse',
    button: o.button ?? (type === 'pointermove' ? -1 : 0),
    buttons: o.buttons ?? (type === 'pointerdown' || type === 'pointermove' ? 1 : 0),
    shiftKey: !!o.shiftKey,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  });
const T = { pointerType: 'touch' } as const;
const wheel = (w: View, x: number, y: number, deltaY: number): void =>
  w.c.fire('wheel', { clientX: x, clientY: y, deltaY, deltaMode: 0, ctrlKey: false, shiftKey: false });

const r9 = (x: number): number => +x.toPrecision(9);
const cam = (v: Viewer3d): unknown => {
  const c = v.getCamera();
  return { ...c, target: c.target.map(r9), distance: r9(c.distance), yaw: r9(c.yaw), pitch: r9(c.pitch) };
};

/** 몸짓 차례(처리기 없이 0.31.0과 같은 조작) — 단계마다 카메라를 남긴다 */
const STEPS: [string, (w: View) => void][] = [
  [
    '마우스 왼쪽 끌기(궤도)',
    (w) => {
      fire(w, 'pointerdown', 1, 400, 300);
      fire(w, 'pointermove', 1, 402, 301);
      fire(w, 'pointermove', 1, 420, 310);
      fire(w, 'pointermove', 1, 460, 330);
      fire(w, 'pointerup', 1, 460, 330, { buttons: 0 });
    },
  ],
  [
    '마우스 누르기·두 번 누르기',
    (w) => {
      fire(w, 'pointerdown', 1, 401.3, 300.6);
      fire(w, 'pointerup', 1, 401.3, 300.6, { buttons: 0 });
      fire(w, 'pointerdown', 1, 402.1, 301.2);
      fire(w, 'pointerup', 1, 402.1, 301.2, { buttons: 0 });
    },
  ],
  [
    '오른쪽 끌기(이동)',
    (w) => {
      fire(w, 'pointerdown', 1, 380, 280, { button: 2, buttons: 2 });
      fire(w, 'pointermove', 1, 395, 290, { buttons: 2 });
      fire(w, 'pointermove', 1, 430, 300, { buttons: 2 });
      fire(w, 'pointerup', 1, 430, 300, { button: 2, buttons: 0 });
    },
  ],
  [
    'Shift+가운데 끌기(궤도)',
    (w) => {
      fire(w, 'pointerdown', 1, 380, 280, { button: 1, buttons: 4, shiftKey: true });
      fire(w, 'pointermove', 1, 360, 300, { buttons: 4, shiftKey: true });
      fire(w, 'pointerup', 1, 360, 300, { button: 1, buttons: 0, shiftKey: true });
    },
  ],
  [
    '가운데 두 번 누르기(전체 보기)',
    (w) => {
      fire(w, 'pointerdown', 1, 300, 300, { button: 1, buttons: 4 });
      fire(w, 'pointerup', 1, 300, 300, { button: 1, buttons: 0 });
      fire(w, 'pointerdown', 1, 301, 300, { button: 1, buttons: 4 });
      fire(w, 'pointerup', 1, 301, 300, { button: 1, buttons: 0 });
    },
  ],
  [
    '손가락 누르기',
    (w) => {
      fire(w, 'pointerdown', 11, 405.2, 310.4, T);
      fire(w, 'pointermove', 11, 409.1, 312.2, T);
      fire(w, 'pointerup', 11, 409.1, 312.2, { ...T, buttons: 0 });
    },
  ],
  [
    '손가락 끌기(궤도)',
    (w) => {
      fire(w, 'pointerdown', 11, 300, 300, T);
      fire(w, 'pointermove', 11, 305, 300, T);
      fire(w, 'pointermove', 11, 320, 305, T);
      fire(w, 'pointermove', 11, 350, 320, T);
      fire(w, 'pointerup', 11, 350, 320, { ...T, buttons: 0 });
    },
  ],
  [
    '두 손가락(이동·핀치) — 하나를 먼저 떼면 남은 손가락은 무시',
    (w) => {
      fire(w, 'pointerdown', 11, 300, 300, T);
      fire(w, 'pointerdown', 12, 420, 300, T);
      fire(w, 'pointermove', 12, 470, 305, T);
      fire(w, 'pointermove', 11, 280, 310, T);
      fire(w, 'pointerup', 11, 280, 310, { ...T, buttons: 0 });
      fire(w, 'pointermove', 12, 520, 320, T);
      fire(w, 'pointerup', 12, 520, 320, { ...T, buttons: 0 });
    },
  ],
  [
    '셋째 손가락',
    (w) => {
      fire(w, 'pointerdown', 11, 300, 300, T);
      fire(w, 'pointerdown', 12, 420, 300, T);
      fire(w, 'pointerdown', 13, 360, 400, T);
      fire(w, 'pointermove', 13, 380, 420, T);
      fire(w, 'pointerup', 13, 380, 420, { ...T, buttons: 0 });
      fire(w, 'pointermove', 12, 440, 290, T);
      fire(w, 'pointerup', 11, 300, 300, { ...T, buttons: 0 });
      fire(w, 'pointerup', 12, 440, 290, { ...T, buttons: 0 });
    },
  ],
  [
    '끄는 중 취소',
    (w) => {
      fire(w, 'pointerdown', 1, 400, 300);
      fire(w, 'pointermove', 1, 430, 300);
      fire(w, 'pointercancel', 1, 430, 300, { buttons: 0 });
      fire(w, 'pointermove', 1, 470, 300, { buttons: 0 });
    },
  ],
  [
    '펜 끌기',
    (w) => {
      fire(w, 'pointerdown', 21, 400, 300, { pointerType: 'pen' });
      fire(w, 'pointermove', 21, 402, 303, { pointerType: 'pen' });
      fire(w, 'pointermove', 21, 380, 320, { pointerType: 'pen' });
      fire(w, 'pointerup', 21, 380, 320, { pointerType: 'pen', buttons: 0 });
    },
  ],
  ['휠', (w) => wheel(w, 410, 290, -120)],
  [
    '측정 점 둘',
    (w) => {
      w.v.setMeasureMode(true);
      fire(w, 'pointermove', 1, 395.4, 305.3, { buttons: 0 });
      w.v.renderNow();
      fire(w, 'pointerdown', 1, 395.4, 305.3);
      fire(w, 'pointerup', 1, 395.4, 305.3, { buttons: 0 });
      fire(w, 'pointermove', 1, 430.2, 320.7, { buttons: 0 });
      w.v.renderNow();
      fire(w, 'pointerdown', 1, 430.2, 320.7);
      fire(w, 'pointerup', 1, 430.2, 320.7, { buttons: 0 });
      w.v.setMeasureMode(false);
    },
  ],
];

function runSteps(w: View): unknown[] {
  const out: unknown[] = [];
  for (const [name, f] of STEPS) {
    f(w);
    w.v.renderNow();
    out.push([name, cam(w.v), w.picks.length, w.measures.length]);
  }
  return [out, w.picks, w.measures];
}

describe('Viewer3d.setPointerClaim(0.32.0): 주지 않거나 맡지 않으면 0.31.0과 같다', () => {
  it('늘 false인 처리기 = 처리기 없음(카메라·고르기·측정) — 묻는 때는 누를 때마다와 한 포인터 끌기 시작', () => {
    const a = make();
    const b = make();
    const qs: PointerClaimQuery[] = [];
    b.v.setPointerClaim((q) => {
      qs.push(q);
      return false;
    });
    const ra = runSteps(a);
    const rb = runSteps(b);
    expect(rb).toEqual(ra);
    // 단계마다 카메라가 실제로 움직였는지(같은 것만 견주지 않게)
    const cams = (ra[0] as unknown[][]).map((s) => JSON.stringify(s[1]));
    expect(new Set(cams).size).toBeGreaterThan(8);
    // 누르기·두 번째 누르기(clicks 2)·손가락 누르기
    expect((ra[1] as unknown[][]).map((p) => [p[0] !== null, p[1], p[3]])).toEqual([
      [true, 1, 'mouse'],
      [true, 2, 'mouse'],
      [true, 1, 'touch'],
    ]);
    expect((ra[2] as unknown[]).filter((x) => typeof x === 'number').length).toBe(1);
    const phases = qs.map((q) => `${q.phase}:${q.pointerId}:${q.pointerType}:${q.button}:${q.pointers}`);
    expect(phases).toEqual([
      // 마우스 왼쪽 끌기
      'down:1:mouse:0:1',
      'drag:1:mouse:0:1',
      // 누르기·두 번 누르기
      'down:1:mouse:0:1',
      'down:1:mouse:0:1',
      // 오른쪽 끌기
      'down:1:mouse:2:1',
      'drag:1:mouse:2:1',
      // Shift+가운데
      'down:1:mouse:1:1',
      'drag:1:mouse:1:1',
      // 가운데 두 번
      'down:1:mouse:1:1',
      'down:1:mouse:1:1',
      // 손가락 누르기(10화소 안)
      'down:11:touch:0:1',
      // 손가락 끌기
      'down:11:touch:0:1',
      'drag:11:touch:0:1',
      // 두 손가락 — 핀치 중에는 'drag'를 묻지 않는다
      'down:11:touch:0:1',
      'down:12:touch:0:2',
      // 셋째 손가락
      'down:11:touch:0:1',
      'down:12:touch:0:2',
      'down:13:touch:0:3',
      // 취소
      'down:1:mouse:0:1',
      'drag:1:mouse:0:1',
      // 펜
      'down:21:pen:0:1',
      'drag:21:pen:0:1',
      // 측정 두 점
      'down:1:mouse:0:1',
      'down:1:mouse:0:1',
    ]);
    // 'drag'의 자리: 누른 자리와 끌기 시작 거리를 넘은 자리
    const d = qs.find((q) => q.phase === 'drag' && q.pointerType === 'touch')!;
    expect([d.x, d.y, d.at.x, d.at.y]).toEqual([300, 300, 320, 305]);
    expect(qs.every((q) => q.held === 0)).toBe(true);
    expect(b.v.heldPointers).toEqual([]);
  });
});

/** 처리기 기록: claim이 맡을 것을 정하고 move·end를 남긴다 */
function recorder(claim: (q: PointerClaimQuery) => boolean): PointerClaimHandler & { moves: HeldPointer[]; ends: [HeldPointer, PointerHoldEnd][]; qs: PointerClaimQuery[] } {
  const r = {
    moves: [] as HeldPointer[],
    ends: [] as [HeldPointer, PointerHoldEnd][],
    qs: [] as PointerClaimQuery[],
    claim: (q: PointerClaimQuery) => {
      r.qs.push(q);
      return claim(q);
    },
    move: (p: HeldPointer) => void r.moves.push(p),
    end: (p: HeldPointer, why: PointerHoldEnd) => void r.ends.push([p, why]),
  };
  return r;
}

describe('Viewer3d.setPointerClaim: 맡은 포인터', () => {
  it("누른 순간('down')에 맡으면 궤도·누르기·측정·측정 미리 보기를 하지 않고 move·end로 넘긴다", () => {
    const w = make();
    const h = recorder((q) => q.phase === 'down' && q.pointerType === 'mouse' && q.button === 0);
    w.v.setPointerClaim(h);
    const c0 = cam(w.v);
    fire(w, 'pointerdown', 1, 400, 300);
    expect(w.v.heldPointers).toEqual([1]);
    fire(w, 'pointermove', 1, 430, 310);
    fire(w, 'pointermove', 1, 470, 330);
    fire(w, 'pointerup', 1, 470, 330, { buttons: 0 });
    w.v.renderNow();
    expect(cam(w.v)).toEqual(c0);
    expect(w.picks).toEqual([]);
    expect(w.v.heldPointers).toEqual([]);
    expect(h.moves.map((p) => [p.pointerId, p.sx, p.sy, p.x, p.y, p.event?.type ?? null])).toEqual([
      [1, 400, 300, 430, 310, null],
      [1, 400, 300, 470, 330, null],
    ]);
    expect(h.moves[0]!.event).toBeDefined();
    expect(h.ends.map(([p, why]) => [p.pointerId, p.x, p.y, why])).toEqual([[1, 470, 330, 'up']]);
    // 오른쪽 단추는 맡지 않는다 — 코어가 이동한다
    fire(w, 'pointerdown', 1, 380, 280, { button: 2, buttons: 2 });
    fire(w, 'pointermove', 1, 430, 300, { buttons: 2 });
    fire(w, 'pointerup', 1, 430, 300, { button: 2, buttons: 0 });
    w.v.renderNow();
    expect(cam(w.v)).not.toEqual(c0);

    // 측정 중: 맡은 누르기는 점을 찍지 않고 미리 보기를 옮기지 않는다
    const m = make();
    m.v.setPointerClaim(h);
    m.v.setMeasureMode(true);
    fire(m, 'pointermove', 1, 395.4, 305.3, { buttons: 0 });
    m.v.renderNow();
    const hover = m.v.measureHoverSnap;
    expect(hover).not.toBeNull();
    fire(m, 'pointerdown', 1, 430.2, 320.7);
    fire(m, 'pointermove', 1, 450.6, 330.1);
    m.v.renderNow();
    expect(m.v.measureHoverSnap).toEqual(hover);
    fire(m, 'pointerup', 1, 450.6, 330.1, { buttons: 0 });
    m.v.renderNow();
    expect(m.v.measurePointCount).toBe(0);
    expect(m.measures).toEqual([]);
    // 놓은 뒤 움직이면 다시 미리 보기
    fire(m, 'pointermove', 1, 450.6, 330.1, { buttons: 0 });
    m.v.renderNow();
    expect(m.v.measureHoverSnap).not.toEqual(hover);
  });

  it("끌기 시작('drag')에 맡으면 궤도를 시작하지 않고, 그 움직임은 at으로 — 그냥 누르기는 예전처럼 고르기", () => {
    const w = make();
    const h = recorder((q) => q.phase === 'drag' && q.pick() !== null && q.pick()!.id === '부품');
    w.v.setPointerClaim(h);
    const part = w.v.project([45, 35, 30])!;
    const c0 = cam(w.v);
    // 그냥 누르기: 'down'에서 맡지 않으니 고르기
    fire(w, 'pointerdown', 1, part.x + 0.4, part.y + 0.3);
    fire(w, 'pointerup', 1, part.x + 0.4, part.y + 0.3, { buttons: 0 });
    expect(w.picks).toEqual([[['mesh', '부품', expect.any(Number), expect.any(Array)], 1, 0, 'mouse']]);
    expect(h.qs.map((q) => q.phase)).toEqual(['down']);
    // 끌기: 4화소를 넘는 순간 맡는다
    fire(w, 'pointerdown', 1, part.x + 0.4, part.y + 0.3);
    fire(w, 'pointermove', 1, part.x + 2.4, part.y + 0.3);
    expect(w.v.heldPointers).toEqual([]);
    fire(w, 'pointermove', 1, part.x + 6.4, part.y + 0.3);
    expect(w.v.heldPointers).toEqual([1]);
    const q = h.qs.at(-1)!;
    expect([q.phase, q.x, q.y, q.at.x, q.at.y]).toEqual(['drag', part.x + 0.4, part.y + 0.3, part.x + 6.4, part.y + 0.3]);
    expect(q.event).toMatchObject({ clientX: part.x + 6.4, pointerId: 1 });
    expect(h.moves).toEqual([]);
    fire(w, 'pointermove', 1, part.x + 40, part.y + 10);
    fire(w, 'pointerup', 1, part.x + 40, part.y + 10, { buttons: 0 });
    w.v.renderNow();
    expect(cam(w.v)).toEqual(c0);
    expect(w.picks.length).toBe(1);
    expect(h.moves.map((p) => [p.x, p.y])).toEqual([[part.x + 40, part.y + 10]]);
    expect(h.ends.map(([p, why]) => [p.sx, p.sy, p.x, p.y, why])).toEqual([[part.x + 0.4, part.y + 0.3, part.x + 40, part.y + 10, 'up']]);
    // 빈 곳 끌기는 맡지 않는다 — 코어 궤도
    fire(w, 'pointerdown', 1, 30, 30);
    fire(w, 'pointermove', 1, 80, 40);
    fire(w, 'pointerup', 1, 80, 40, { buttons: 0 });
    w.v.renderNow();
    expect(cam(w.v)).not.toEqual(c0);
  });

  it('손가락 끌기 시작(10화소)에 맡은 뒤에도 코어가 깨끗하다 — 다음 끌기·누르기는 처리기 없는 뷰어와 같다', () => {
    const a = make();
    const b = make();
    const h = recorder((q) => q.phase === 'drag');
    a.v.setPointerClaim(h);
    fire(a, 'pointerdown', 11, 300, 300, T);
    fire(a, 'pointermove', 11, 309, 300, T);
    expect(a.v.heldPointers).toEqual([]);
    fire(a, 'pointermove', 11, 311, 300, T);
    expect(a.v.heldPointers).toEqual([11]);
    fire(a, 'pointermove', 11, 360, 330, T);
    fire(a, 'pointerup', 11, 360, 330, { ...T, buttons: 0 });
    expect(h.ends.map(([p, why]) => [p.pointerId, p.pointerType, why])).toEqual([[11, 'touch', 'up']]);
    a.v.setPointerClaim(null);
    a.v.renderNow();
    b.v.renderNow();
    expect(cam(a.v)).toEqual(cam(b.v));
    // 그 뒤 같은 조작
    for (const w of [a, b]) {
      fire(w, 'pointerdown', 11, 300, 300, T);
      fire(w, 'pointermove', 11, 320, 305, T);
      fire(w, 'pointermove', 11, 350, 320, T);
      fire(w, 'pointerup', 11, 350, 320, { ...T, buttons: 0 });
      fire(w, 'pointerdown', 1, 401.3, 300.6);
      fire(w, 'pointerup', 1, 401.3, 300.6, { buttons: 0 });
      w.v.renderNow();
    }
    expect(cam(a.v)).toEqual(cam(b.v));
    expect(a.picks).toEqual(b.picks);
    expect(a.picks.length).toBe(1);
  });

  it('둘째 손가락: 앱이 맡지 않으면 앱 손가락을 돌려받아(end pinch) 지금 자리에서 두 손가락 — 그 자리에서 함께 누른 뷰어와 같다', () => {
    const a = make();
    const b = make();
    const h = recorder((q) => q.phase === 'drag' && q.pointers === 1);
    a.v.setPointerClaim(h);
    fire(a, 'pointerdown', 11, 300, 300, T);
    fire(a, 'pointermove', 11, 330, 300, T);
    fire(a, 'pointermove', 11, 350, 310, T);
    expect(a.v.heldPointers).toEqual([11]);
    fire(a, 'pointerdown', 12, 450, 300, T);
    const q = h.qs.at(-1)!;
    expect([q.phase, q.pointerId, q.pointers, q.held]).toEqual(['down', 12, 2, 1]);
    expect(h.ends.map(([p, why]) => [p.pointerId, p.x, p.y, p.event ?? null, why])).toEqual([[11, 350, 310, null, 'pinch']]);
    expect(a.v.heldPointers).toEqual([]);
    // 처리기 없는 뷰어: 11을 지금 자리에서, 12를 누른다
    fire(b, 'pointerdown', 11, 350, 310, T);
    fire(b, 'pointerdown', 12, 450, 300, T);
    for (const w of [a, b]) {
      fire(w, 'pointermove', 12, 490, 300, T);
      fire(w, 'pointermove', 11, 330, 320, T);
      fire(w, 'pointerup', 11, 330, 320, { ...T, buttons: 0 });
      fire(w, 'pointerup', 12, 490, 300, { ...T, buttons: 0 });
      w.v.renderNow();
    }
    expect(cam(a.v)).toEqual(cam(b.v));
    expect(cam(a.v)).not.toEqual(cam(make().v));
    // 핀치 뒤 다시 움직인 것은 알리지 않았다
    expect(h.moves.map((p) => [p.x, p.y])).toEqual([[350, 310]]);
    expect(a.picks).toEqual([]);
  });

  it('둘째 손가락도 맡으면 둘 다 앱 것(코어는 아무것도 하지 않는다), 코어 손가락이 있을 때 맡으면 코어는 제 손가락 궤도를 잇는다', () => {
    const a = make();
    const h = recorder((q) => q.pointerType === 'touch' && (q.phase === 'drag' || q.held > 0));
    a.v.setPointerClaim(h);
    const c0 = cam(a.v);
    fire(a, 'pointerdown', 11, 300, 300, T);
    fire(a, 'pointermove', 11, 330, 300, T);
    fire(a, 'pointerdown', 12, 450, 300, T);
    expect(a.v.heldPointers).toEqual([11, 12]);
    fire(a, 'pointermove', 12, 490, 300, T);
    fire(a, 'pointermove', 11, 300, 320, T);
    fire(a, 'pointerup', 11, 300, 320, { ...T, buttons: 0 });
    fire(a, 'pointerup', 12, 490, 300, { ...T, buttons: 0 });
    a.v.renderNow();
    expect(cam(a.v)).toEqual(c0);
    expect(h.ends.map(([p, why]) => [p.pointerId, why])).toEqual([
      [11, 'up'],
      [12, 'up'],
    ]);
    expect(h.moves.map((p) => p.pointerId)).toEqual([12, 11]);

    // 코어가 궤도 중인 손가락(11)이 있는데 앱이 12를 맡는다
    const c = make();
    const d = make();
    const h2 = recorder((q) => q.pointerId === 12);
    c.v.setPointerClaim(h2);
    fire(c, 'pointerdown', 11, 300, 300, T);
    fire(c, 'pointermove', 11, 330, 300, T);
    fire(c, 'pointerdown', 12, 450, 300, T);
    fire(c, 'pointermove', 12, 470, 300, T);
    fire(c, 'pointermove', 11, 360, 310, T);
    fire(c, 'pointerup', 12, 470, 300, { ...T, buttons: 0 });
    fire(c, 'pointerup', 11, 360, 310, { ...T, buttons: 0 });
    fire(d, 'pointerdown', 11, 300, 300, T);
    fire(d, 'pointermove', 11, 330, 300, T);
    fire(d, 'pointermove', 11, 360, 310, T);
    fire(d, 'pointerup', 11, 360, 310, { ...T, buttons: 0 });
    c.v.renderNow();
    d.v.renderNow();
    expect(cam(c.v)).toEqual(cam(d.v));
    expect(h2.qs.find((q) => q.pointerId === 12)).toMatchObject({ phase: 'down', pointers: 2, held: 0 });
    expect(h2.ends.map(([p, why]) => [p.pointerId, why])).toEqual([[12, 'up']]);
  });

  it('마우스·펜을 맡은 동안 손가락은 돌려받지 않는다(손가락 누르기는 그대로 고르기)', () => {
    const w = make();
    const h = recorder((q) => q.pointerType === 'mouse' && q.phase === 'down');
    w.v.setPointerClaim(h);
    fire(w, 'pointerdown', 1, 400, 300);
    fire(w, 'pointerdown', 11, 405.2, 310.4, T);
    fire(w, 'pointerup', 11, 405.2, 310.4, { ...T, buttons: 0 });
    expect(w.v.heldPointers).toEqual([1]);
    expect(w.picks).toEqual([[expect.any(Array), 1, 0, 'touch']]);
    expect(h.ends).toEqual([]);
    fire(w, 'pointerup', 1, 400, 300, { buttons: 0 });
    expect(h.ends.map(([, why]) => why)).toEqual(['up']);
  });

  it('claimPointer: 궤도 중·핀치 중에 맡으면 합성 pointercancel을 보낸 뷰어와 같고, 그 뒤 움직임·떼기는 on에만', () => {
    const a = make();
    const b = make();
    const h = recorder(() => false);
    expect(a.v.claimPointer(11, h)).toBe(false);
    for (const w of [a, b]) {
      fire(w, 'pointerdown', 11, 300, 300, T);
      fire(w, 'pointermove', 11, 330, 300, T);
      fire(w, 'pointermove', 11, 350, 310, T);
    }
    expect(a.v.claimPointer(11, h)).toBe(true);
    expect(a.v.claimPointer(11)).toBe(true);
    expect(a.v.heldPointers).toEqual([11]);
    fire(b, 'pointercancel', 11, 350, 310, { ...T, buttons: 0 });
    for (const w of [a, b]) {
      fire(w, 'pointermove', 11, 400, 330, T);
      fire(w, 'pointerup', 11, 400, 330, { ...T, buttons: 0 });
      w.v.renderNow();
    }
    expect(cam(a.v)).toEqual(cam(b.v));
    expect(h.moves.map((p) => [p.pointerId, p.sx, p.sy, p.x, p.y])).toEqual([[11, 300, 300, 400, 330]]);
    expect(h.ends.map(([p, why]) => [p.pointerId, why])).toEqual([[11, 'up']]);
    expect(a.picks).toEqual([]);
    expect(b.picks).toEqual([]);

    // 핀치 중 한 손가락을 맡으면 남은 손가락은 뗄 때까지 무시(0.31.0 손가락 하나를 뗀 것처럼)
    const c = make();
    const d = make();
    for (const w of [c, d]) {
      fire(w, 'pointerdown', 11, 300, 300, T);
      fire(w, 'pointerdown', 12, 420, 300, T);
      fire(w, 'pointermove', 12, 460, 300, T);
    }
    expect(c.v.claimPointer(11)).toBe(true);
    fire(d, 'pointercancel', 11, 300, 300, { ...T, buttons: 0 });
    const before = cam(c.v);
    for (const w of [c, d]) {
      fire(w, 'pointermove', 12, 520, 330, T);
      fire(w, 'pointermove', 11, 250, 280, T);
      w.v.renderNow();
    }
    expect(cam(c.v)).toEqual(before);
    expect(cam(c.v)).toEqual(cam(d.v));
    // 셋째 손가락: 앱 처리기가 없으니 맡은 11을 돌려받아 12·11로 핀치(맡은 손가락은 on이 없어 알림 없음)
    fire(c, 'pointerdown', 13, 380, 400, T);
    expect(c.v.heldPointers).toEqual([]);
  });

  it("처리기를 끄면 맡은 포인터에 end('off') — 뗄 때까지 무시하고 알리지 않는다", () => {
    const w = make();
    const h = recorder((q) => q.phase === 'down');
    w.v.setPointerClaim(h);
    const c0 = cam(w.v);
    fire(w, 'pointerdown', 1, 400, 300);
    fire(w, 'pointermove', 1, 420, 300);
    w.v.setPointerClaim(h); // 같은 처리기는 그대로
    expect(h.ends).toEqual([]);
    w.v.setPointerClaim(null);
    expect(h.ends.map(([p, why]) => [p.pointerId, p.x, p.y, why])).toEqual([[1, 420, 300, 'off']]);
    expect(w.v.heldPointers).toEqual([1]);
    fire(w, 'pointermove', 1, 480, 320);
    fire(w, 'pointerup', 1, 480, 320, { buttons: 0 });
    w.v.renderNow();
    expect(cam(w.v)).toEqual(c0);
    expect(h.moves.length).toBe(1);
    expect(h.ends.length).toBe(1);
    expect(w.picks).toEqual([]);
    expect(w.v.heldPointers).toEqual([]);
    // 함수만 준 처리기도 된다(move·end 없음)
    w.v.setPointerClaim(() => true);
    fire(w, 'pointerdown', 1, 400, 300);
    fire(w, 'pointermove', 1, 480, 320);
    fire(w, 'pointerup', 1, 480, 320, { buttons: 0 });
    w.v.renderNow();
    expect(cam(w.v)).toEqual(c0);
  });

  it('맡은 포인터 id로 다시 누르면 앞 맡기는 끝(cancel)으로 보고 새로 묻는다', () => {
    const w = make();
    let take = true;
    const h = recorder(() => take);
    w.v.setPointerClaim(h);
    fire(w, 'pointerdown', 5, 401.3, 300.6, { pointerType: 'pen' });
    take = false;
    fire(w, 'pointerdown', 5, 401.3, 300.6, { pointerType: 'pen' });
    expect(h.ends.map(([p, why]) => [p.pointerId, why])).toEqual([[5, 'cancel']]);
    fire(w, 'pointerup', 5, 401.3, 300.6, { pointerType: 'pen', buttons: 0 });
    expect(w.picks).toEqual([[expect.any(Array), 1, 0, 'pen']]);
  });

  it('휠은 막지 않는다(맡은 끌기 중에도 처리기 없는 뷰어의 휠과 같다), q.pick은 그 포인터 종류의 pick', () => {
    const a = make();
    const b = make();
    const seen: { v: [Pick3d | null, Pick3d | null, Pick3d | null] | null } = { v: null };
    a.v.setPointerClaim((q) => {
      if (q.phase === 'down' && q.pointerType === 'touch') seen.v = [q.pick(), a.v.pick(q.x, q.y, 'touch'), q.pick({ meshesOnly: true })];
      return q.phase === 'drag';
    });
    fire(a, 'pointerdown', 1, 400, 300);
    fire(a, 'pointermove', 1, 440, 300);
    expect(a.v.heldPointers).toEqual([1]);
    wheel(a, 410, 290, -120);
    wheel(b, 410, 290, -120);
    a.v.renderNow();
    b.v.renderNow();
    expect(cam(a.v)).toEqual(cam(b.v));
    expect(cam(a.v)).not.toEqual(cam(make().v));
    fire(a, 'pointerup', 1, 440, 300, { buttons: 0 });
    const part = a.v.project([45, 35, 30])!;
    fire(a, 'pointerdown', 11, part.x + 0.4, part.y + 0.3, T);
    fire(a, 'pointerup', 11, part.x + 0.4, part.y + 0.3, { ...T, buttons: 0 });
    const s = seen.v!;
    expect(s[0]).toEqual(s[1]);
    expect(s[0]!.id).toBe('부품');
    expect(s[2]!.id).toBe('부품');
  });
});
