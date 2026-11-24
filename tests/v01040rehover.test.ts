/**
 * 0.104.0 같은 프레임의 포인터 이동과 측정 미리 보기 다시 구하기(rehover — 106차): 장면 길(메시 바꾸기·보이기·그리기 범위가 줄 때 — 0.98.0·0.100.0)과
 * 잠금·Shift 키·붙잡기 한도 등은 미리 보기를 다음 그림에서 마지막으로 구한 커서 자리(lastHoverAt)에서 다시 구한다. 0.103.0은 같은 프레임(다음 그림 전)에
 * 포인터 이동이 먼저 와서 새 자리를 적어 두었어도 그 자리를 앞 자리로 덮어, NC 재생(프레임마다 setMesh·그리기 범위) 중 마우스를 움직이면 그 프레임 미리 보기와
 * onMeasureHoverChange가 앞 자리의 것이었다(재생 걸음이 프레임마다 이동 뒤에 오면 처음 자리에 머물고, 재생 걸음 뒤에 온 이동에서야 따라왔다).
 * 이제 다음 그림에서 구할 때 가장 늦은 포인터 자리를 쓴다(그 상태로 장면 길 뒤 그 자리로 옮긴 것과 같다).
 * 그 사이 포인터가 캔버스를 떠났으면 0.103.0처럼 미리 보기가 없고, 포인터가 움직이지 않은 프레임의 장면 길·가상 커서 길은 0.103.0 그대로다.
 * 장면(위에서 봄): 아래 상자 L [0,0,0]–[100,100,20], 위 상자 U [20,20,40]–[80,80,50], 재생 선분 묶음 P(원본 번호 10·20·30 — 화면 밖 쪽 x 120~200, z 30)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';

type P3 = [number, number, number];
const L = boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
/** 같은 id의 U를 x로 200 옮긴 새 메시(A 자리에서 비킨다 — 그 자리는 L 윗면) */
const U_AWAY = boxMesh('U', [220, 20, 40], [280, 80, 50], [0.7, 0.6, 0.5, 1]);
const P: LineSet3d = {
  id: 'P',
  name: 'P',
  positions: new Float32Array([120, 0, 30, 160, 0, 30, 160, 0, 30, 200, 40, 30, 200, 40, 30, 200, 100, 30]),
  segmentIds: new Uint32Array([10, 20, 30]),
  color: [0.9, 0.9, 0.2, 1],
};
const scene = (meshes: Mesh3d[]): Scene3d => ({ name: 'rehover', units: 'mm', meshes, lines: [P] });
/** 앞 자리(U 윗면), 새 자리(U 밖 L 윗면), 그 사이 지나간 자리(U 윗면 다른 곳) */
const A: P3 = [50, 50, 50];
const B: P3 = [10, 50, 20];
const C: P3 = [30, 60, 50];

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
  v.setScene(scene([L, U]));
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [50, 50, 50], distance: 400 });
  v.renderNow();
  return v;
}
/** 측정 모드 + 붙잡기 선택 */
function measuring(): Viewer3d {
  const v = make();
  v.setMeasureMode(true);
  v.setMeasureSnap({ midpoints: true });
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 세계 점의 화면 자리(조금 비켜 — 경계를 정확히 가리키지 않는다) */
function at(v: Viewer3d, p: P3): { x: number; y: number } {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x + 0.37, y: s.y - 0.21 };
}
/** 포인터 이동 하나(그리지 않는다 — 다음 그림 전 같은 프레임) */
const pmove = (v: Viewer3d, p: P3, shiftKey = false): void => {
  const s = at(v, p);
  cv(v).fire('pointermove', { clientX: s.x, clientY: s.y, pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, shiftKey, altKey: false, ctrlKey: false, metaKey: false });
};
const hover = (v: Viewer3d, p: P3): void => {
  pmove(v, p);
  v.renderNow();
};
const leave = (v: Viewer3d): void => void cv(v).fire('pointerleave', {});
function click(v: Viewer3d, p: P3): void {
  const s = at(v, p);
  const e = { clientX: s.x, clientY: s.y, pointerId: 1, pointerType: 'mouse', button: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  cv(v).fire('pointerdown', { ...e, buttons: 1 });
  cv(v).fire('pointerup', { ...e, buttons: 0 });
  v.renderNow();
}
const z = (s: MeasureHoverSnap | null | undefined): number | null => (s ? Math.round(s.point[2] * 1000) / 1000 : null);
/** 미리 보기 상태(점·종류·잠금 — Shift가 잠글 방향·지금 잠금도) */
const st = (v: Viewer3d): string => JSON.stringify([v.measureHoverSnap, v.measureHoverLock, v.measureInferenceLock]);

type Op = (v: Viewer3d) => void;
/** 미리 보기를 다음 그림에서 다시 구하는 장면 길 */
const OPS: [string, Op][] = [
  ['메시 바꾸기', (v) => v.setMesh(U_AWAY)],
  ['보이기', (v) => v.setItemVisible('U', false)],
  ['그리기 범위 줄이기', (v) => void v.setDrawLimitBySegmentId(10)],
];
/** A를 가리켜 그린 뒤 장면 길을 지나 그린 다음 B로 옮긴 상태(= 고친 뒤 기대하는 값) */
const wanted = new Map<Op, string>();
function want(op: Op): string {
  let s = wanted.get(op);
  if (s === undefined) {
    const w = measuring();
    hover(w, A);
    op(w);
    w.renderNow();
    hover(w, B);
    s = st(w);
    wanted.set(op, s);
  }
  return s;
}
/** A를 가리켜 그린 뒤 장면 길만 지나 그린 상태(= 0.103.0이 이동 뒤 장면 길에서 낸 앞 자리 값) */
function stale(op: Op): string {
  const w = measuring();
  hover(w, A);
  op(w);
  w.renderNow();
  return st(w);
}

describe('0.104.0 같은 프레임의 포인터 이동과 장면 길', () => {
  it('이동 뒤 장면 길(0.103.0은 앞 자리)·장면 길 뒤 이동·사이에 낀 것 모두 다음 그림에서 가장 늦은 포인터 자리의 미리 보기', () => {
    const orders: [string, (v: Viewer3d, op: Op) => void][] = [
      ['이동 뒤 장면 길', (v, op) => {
        pmove(v, B);
        op(v);
      }],
      ['두 이동 뒤 장면 길', (v, op) => {
        pmove(v, C);
        pmove(v, B);
        op(v);
      }],
      ['장면 길 뒤 이동', (v, op) => {
        op(v);
        pmove(v, B);
      }],
      ['두 이동 사이 장면 길', (v, op) => {
        pmove(v, C);
        op(v);
        pmove(v, B);
      }],
    ];
    for (const [name, op] of OPS) {
      // 앞 자리 값과 새 자리 값이 다른 장면이어야 가린다
      expect(stale(op), name).not.toBe(want(op));
      for (const [order, steps] of orders) {
        const v = measuring();
        hover(v, A);
        expect(z(v.measureHoverSnap)).toBe(50);
        steps(v, op);
        v.renderNow();
        expect(st(v), `${name} — ${order}`).toBe(want(op));
      }
    }
  });

  it('재생 꼴(프레임마다 포인터 이동 뒤 메시 바꾸기): 미리 보기가 프레임마다 그 프레임의 포인터 자리(0.103.0은 처음 자리에 머물렀다)', () => {
    const v = measuring();
    const w = measuring();
    hover(v, A);
    hover(w, A);
    for (let i = 0; i < 4; i++) {
      const p: P3 = [4 + 3 * i, 30 + 10 * i, 20];
      const m = i % 2 ? U : U_AWAY;
      pmove(v, p);
      v.setMesh(m);
      v.renderNow();
      w.setMesh(m);
      w.renderNow();
      hover(w, p);
      expect(st(v), `걸음 ${i}`).toBe(st(w));
    }
  });

  it('포인터가 움직이지 않은 프레임의 장면 길은 0.103.0 그대로 — 마지막으로 구한 자리에서 새 장면으로', () => {
    for (const [name, op] of OPS) {
      const v = measuring();
      hover(v, A);
      op(v);
      v.renderNow();
      const w = measuring();
      hover(w, A);
      op(w);
      w.renderNow();
      hover(w, A);
      expect(st(v), name).toBe(st(w));
      expect(v.measureHoverSnap).not.toBeNull();
    }
  });

  it('그 사이 포인터가 캔버스를 떠났으면 0.103.0처럼 미리 보기 없음, 떠난 뒤 다시 들어온 자리는 그 자리', () => {
    const orders: [string, (v: Viewer3d, op: Op) => void][] = [
      ['이동·떠남·장면 길', (v, op) => {
        pmove(v, B);
        leave(v);
        op(v);
      }],
      ['이동·장면 길·떠남', (v, op) => {
        pmove(v, B);
        op(v);
        leave(v);
      }],
      ['장면 길·이동·떠남', (v, op) => {
        op(v);
        pmove(v, B);
        leave(v);
      }],
    ];
    for (const [name, op] of OPS) {
      for (const [order, steps] of orders) {
        const v = measuring();
        hover(v, A);
        steps(v, op);
        v.renderNow();
        expect(v.measureHoverSnap, `${name} — ${order}`).toBeNull();
      }
      const v = measuring();
      hover(v, A);
      leave(v);
      pmove(v, B);
      op(v);
      v.renderNow();
      expect(st(v), `${name} — 떠남·다시 들어옴·장면 길`).toBe(want(op));
    }
  });

  it('onMeasureHoverChange는 그 그림 뒤 새 자리 값으로 한 번 — 다음에 같은 자리로 옮겨도 다시 알리지 않는다(0.103.0은 앞 자리 값 뒤 한 번 더)', () => {
    const v = measuring();
    hover(v, A);
    const got: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void got.push(s));
    pmove(v, B);
    v.setMesh(U_AWAY);
    expect(got).toEqual([]);
    v.renderNow();
    expect(got).toHaveLength(1);
    expect(got[0]).toEqual(v.measureHoverSnap);
    expect(JSON.stringify([got[0], v.measureHoverLock, v.measureInferenceLock])).toBe(want(OPS[0]![1]));
    v.renderNow();
    hover(v, B);
    expect(got).toHaveLength(1);
  });
});

describe('0.104.0 장면 길 밖에서 다시 구하는 길', () => {
  /** 첫 점(U 윗면 가운데)을 찍고 x 축 쪽으로 가리킨 뷰어 */
  function first(): { v: Viewer3d; p0: P3 } {
    const v = make();
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, lock: true } });
    click(v, A);
    expect(v.measurePointCount).toBe(1);
    const p0 = v.measurePoints[0]!.point as P3;
    hover(v, [p0[0] + 15, p0[1] + 0.4, 50]);
    expect(v.measureHoverSnap?.locked).toBeUndefined();
    return { v, p0 };
  }

  it('같은 프레임 앞 이동 뒤 앱 단추 잠금: 새 자리에서 잠근 선 위 점(그 상태로 잠근 뒤 옮긴 것과 같다)', () => {
    const { v, p0 } = first();
    const c2: P3 = [p0[0] + 25, p0[1] + 0.6, 50];
    pmove(v, c2);
    expect(v.setMeasureInferenceLock('x')).toBe(true);
    v.renderNow();
    const { v: w } = first();
    w.setMeasureInferenceLock('x');
    w.renderNow();
    const before = st(w);
    hover(w, c2);
    expect(st(w)).not.toBe(before);
    expect(v.measureHoverSnap?.locked).toBe(true);
    expect(st(v)).toBe(st(w));
  });

  it('같은 프레임 앞 이동 뒤 Shift 키: 앞 미리 보기의 방향을 잠그고 새 자리에서 구한다(Shift를 누른 채 옮긴 포인터 이동과 같다)', () => {
    const { v, p0 } = first();
    expect(v.measureHoverLock?.axis).toBe('x');
    const c2: P3 = [p0[0] + 25, p0[1] + 0.6, 50];
    pmove(v, c2);
    cv(v).fire('keydown', { key: 'Shift', code: 'ShiftLeft', shiftKey: true, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
    v.renderNow();
    const { v: w } = first();
    pmove(w, c2, true);
    w.renderNow();
    expect(v.measureInferenceLock?.source).toBe('shift');
    expect(v.measureHoverSnap?.locked).toBe(true);
    expect(st(v)).toBe(st(w));
  });
});
