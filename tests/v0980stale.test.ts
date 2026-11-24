/**
 * 0.98.0 장면 조각이 바뀐 뒤 커서를 옮기기 전까지 남던 가상 커서·측정 미리 보기 상태(100차 훑기 — README 0.98.0 절의 표).
 * 0.97.0은
 *  - 가상 커서 후보(측정 모드 후보 목록·고르기 모드 겹친 후보)를 켠 자리에서 그때의 장면으로 구한 채 두었다. 메시를 빼거나 바꾸거나 숨긴 뒤(구간 숨김·단면·행렬·setScene·clear도)
 *    커서를 옮기기 전 Tab은 없는·숨긴·잘린 메시와 옛 자리를 미리 보기로 그리고 알렸고, 고르기 모드 면·선분 표식은 다음 그림부터 옛 후보로 그렸다
 *  - 보이기·구간 숨김 뒤 측정 미리 보기(마우스)는 숨긴 메시의 붙잡기 표식을 그리고 measureHoverSnap으로 돌려주었다(메시 바꾸기·빼기는 그 자리에서 다시 구했다)
 *  - setScene은 앱 pointsFor 기억을 남겨 새 장면의 같은 고르기에 앞 장면의 앱 점을 붙였고, clear는 미리 강조 후보(pickPreview)를 남겼다
 * 이제 그 길에서 버리거나 다음 그림·Tab 앞에서 그 자리에서 다시 구한다 — 결과가 같은 자리에서 커서를 다시 켠(마우스면 다시 옮긴) 것과 같다.
 * 장면(위에서 봄): 아래 상자 L [0,0,0]–[100,100,20], 위 상자 U [20,20,40]–[80,80,50]
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, Pick3d, Scene3d, SnapPoint } from '../src/types';

const L = boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
/** 같은 id의 U를 x로 200 옮긴 새 메시(캔버스 가운데에서 비킨다) */
const U_AWAY = boxMesh('U', [220, 20, 40], [280, 80, 50], [0.7, 0.6, 0.5, 1]);
/** U 윗면 위 두 선분(가운데 (50, 50, 50)에서 만난다) */
const LINES: LineSet3d = { id: '선', name: '선', positions: new Float32Array([30, 50, 50, 70, 50, 50, 50, 30, 50, 50, 70, 50]), color: [0.9, 0.9, 0.2, 1] };
const scene = (meshes: Mesh3d[], lines: LineSet3d[] = []): Scene3d => ({ name: 'stale', units: 'mm', meshes, lines });
const move = (x: number, y: number, z: number): number[] => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

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

function make(sc: Scene3d, target: [number, number, number] = [50, 50, 50], distance = 400): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(sc);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target, distance });
  v.renderNow();
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 키 하나(그리지 않는다 — 장면 길 바로 뒤의 키가 그 길의 다음 그림보다 먼저 오는 때) */
function press(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
}
const key = (v: Viewer3d, k: string): void => {
  press(v, k);
  v.renderNow();
};
const hover = (v: Viewer3d, x: number, y: number): void => {
  cv(v).fire('pointermove', { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
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
/** 덧그림 한 번 그리기의 강조 색 칠하기 수(면 표식마다 하나 — 강조 색을 넣은 바로 다음 fill) */
function hiFills(v: Viewer3d): number {
  const hi = `fillStyle=${(v as unknown as { theme: { highlight: string } }).theme.highlight}`;
  return trace(v).filter((s, i, a) => s === 'fill()' && a[i - 1] === hi).length;
}

type Op = [string, (v: Viewer3d) => void];
/** 장면 조각을 바꾸는 공개 길(모두 캔버스 가운데에서 U를 뺀다) */
const OPS: Op[] = [
  ['removeMesh', (v) => void v.removeMesh('U')],
  ['setMesh 바꾸기', (v) => void v.setMesh(U_AWAY)],
  ['setItemVisible', (v) => v.setItemVisible('U', false)],
  ['setHiddenRanges', (v) => v.setHiddenRanges('U', [{ start: 0, count: 12 }])],
  ['setSection', (v) => v.setSection({ normal: [0, 0, 1], offset: 30 })],
  ['setItemMatrix', (v) => v.setItemMatrix('U', move(200, 0, 0))],
  ['setScene', (v) => v.setScene(scene([L]), { keepView: true })],
  ['clear', (v) => v.clear()],
];

describe('0.98.0 가상 커서 고르기 모드(pickCycle 기본)', () => {
  it.each(OPS)('%s 뒤 커서를 옮기지 않고 Tab: 지금 장면의 후보 차례 — 커서를 다시 켠 것과 같다(0.97.0은 앞 장면 후보·수를 알렸다)', (_name, op) => {
    const v = make(scene([L, U]));
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    expect(said[0]).toMatchObject({ reason: 'start', mode: 'pick', index: 0, pick: { kind: 'mesh', id: 'U' } });
    op(v);
    said.length = 0;
    press(v, 'Tab');
    const a = said.splice(0);
    const t = trace(v);
    const kc = v.keyboardCursor;
    key(v, 'Escape');
    key(v, 'Enter');
    said.length = 0;
    press(v, 'Tab');
    expect(a).toEqual(said.splice(0));
    expect(t).toEqual(trace(v));
    expect(kc).toEqual(v.keyboardCursor);
    expect(a).toHaveLength(1);
    expect(a[0]!.pick?.id ?? null).not.toBe('U');
  });
});

describe('0.98.0 가상 커서 고르기 모드 표식(facePreview)', () => {
  beforeAll(async () => {
    // 면 셈 조각(뷰어의 import() — 모듈에 하나)을 먼저 받아 둔다(그 뒤 면 표식은 같은 그림에서. setTimeout을 가짜로 두므로 setImmediate로 돌린다)
    const w = make(scene([L, U]));
    const s = w.project([50, 50, 50])!;
    w.setPickPreview(w.pick(s.x, s.y));
    for (let i = 0; i < 400 && !hiFills(w); i++) await new Promise((r) => setImmediate(r));
    expect(hiFills(w)).toBe(1);
  });

  it.each(OPS.filter(([n]) => n !== 'clear'))('%s 뒤 키 없이 다음 그림: 지금 장면 후보의 면 표식(0.97.0은 옮긴·숨긴·잘린 U 윗면을 그리거나 L 윗면을 그리지 않았다)', (_name, op) => {
    const v = make(scene([L, U]));
    v.setKeyboardSnap({ pickCycle: { facePreview: true } });
    key(v, 'Enter');
    expect(hiFills(v)).toBe(1);
    op(v);
    const t = trace(v);
    key(v, 'Escape');
    key(v, 'Enter');
    expect(t).toEqual(trace(v));
    expect(hiFills(v)).toBe(1);
  });

  it('선분 후보의 묶음을 행렬로 옮긴 뒤 키 없이 다음 그림: 옮긴 장면의 후보(0.97.0은 그때 구한 세계 끝점에 옛 선분을 그었다)', () => {
    const v = make(scene([L, U], [LINES]));
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ pickCycle: { facePreview: true }, announce: (a) => void said.push(a) });
    key(v, 'Enter');
    expect(said[0]!.pick).toMatchObject({ kind: 'line', id: '선' });
    v.setItemMatrix('선', move(0, 40, 0));
    const t = trace(v);
    key(v, 'Escape');
    key(v, 'Enter');
    expect(said.at(-1)!.pick).toMatchObject({ kind: 'mesh', id: 'U' });
    expect(t).toEqual(trace(v));
  });
});

describe('0.98.0 가상 커서 측정 모드', () => {
  it.each(OPS)('%s 뒤 커서를 옮기지 않고 Tab: 지금 장면의 측정 후보 — 커서를 다시 켠 것과 같다(0.97.0은 앞 장면의 점을 미리 보기로 그리고 알렸다)', (_name, op) => {
    const v = make(scene([L, U]), [22, 22, 50]);
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true });
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    expect(said[0]!.snap?.point[2]).toBeCloseTo(50, 3);
    op(v);
    said.length = 0;
    press(v, 'Tab');
    const a = said.splice(0);
    const t = trace(v);
    const st = [v.keyboardCursor, v.measureHoverSnap];
    key(v, 'Escape');
    key(v, 'Enter');
    said.length = 0;
    press(v, 'Tab');
    expect(a).toEqual(said.splice(0));
    expect(t).toEqual(trace(v));
    expect(st).toEqual([v.keyboardCursor, v.measureHoverSnap]);
    expect(a).toHaveLength(1);
    expect(a[0]!.snap?.point[2] ?? 0).toBeLessThan(45);
  });
});

describe('0.98.0 측정 미리 보기(마우스) — 보이기·구간 숨김', () => {
  const VIS: Op[] = OPS.filter(([n]) => n === 'setItemVisible' || n === 'setHiddenRanges');
  it.each(VIS)('%s 뒤 마우스를 옮기지 않고 다음 그림: 그 자리에서 다시 구한 미리 보기(0.97.0은 숨긴 U 꼭짓점을 그렸다)', (_name, op) => {
    const v = make(scene([L, U]), [22, 22, 50]);
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true });
    // U 윗면 안쪽(화면 아래로 가면 y가 준다) 꼭짓점 (20, 20, 50) 둘레
    const s = v.project([20, 20, 50])!;
    hover(v, s.x + 2, s.y - 1);
    expect(v.measureHoverSnap).toMatchObject({ point: [20, 20, 50] });
    op(v);
    const t = trace(v);
    const h = v.measureHoverSnap;
    expect(h?.point[2]).toBeCloseTo(20, 3);
    hover(v, s.x + 2, s.y - 1);
    expect(t).toEqual(trace(v));
    expect(h).toEqual(v.measureHoverSnap);
  });

  it('구간 숨김을 풀면 다음 그림에서 다시 U 꼭짓점(0.97.0은 U 아래 L 위 점을 그대로 그렸다)', () => {
    const v = make(scene([L, U]), [22, 22, 50]);
    v.setMeasureMode(true);
    v.setMeasureSnap({ midpoints: true });
    v.setHiddenRanges('U', [{ start: 0, count: 12 }]);
    const s = v.project([20, 20, 50])!;
    hover(v, s.x + 2, s.y - 1);
    expect(v.measureHoverSnap?.point[2]).toBeCloseTo(20, 3);
    v.clearHiddenRanges();
    const t = trace(v);
    expect(v.measureHoverSnap).toMatchObject({ point: [20, 20, 50] });
    hover(v, s.x + 2, s.y - 1);
    expect(t).toEqual(trace(v));
  });
});

describe('0.98.0 setScene·clear가 남기던 기억', () => {
  it('setScene: 앱 pointsFor 기억을 비운다 — 새 장면의 같은 고르기에 새 앱 점(0.97.0은 다시 묻지 않고 앞 장면의 앱 점)', () => {
    let app = [30.25, 40, 20];
    let asked = 0;
    const v = make(scene([L]), [30, 40, 20], 100);
    v.setMeasureMode(true);
    v.setMeasureSnap({
      pointsFor: (p: Pick3d): SnapPoint[] | null => {
        asked++;
        return p.id === 'L' ? [{ point: [...app], kind: 'center', id: 'L' }] : null;
      },
    });
    const s = v.project([30, 40, 20])!;
    hover(v, s.x, s.y);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'center', point: [30.25, 40, 20] });
    const n = asked;
    // 같은 꼴의 새 장면(앱 자료가 바뀌었다 — 같은 자리·같은 id·같은 삼각형을 고른다)
    app = [29.75, 40, 20];
    v.setScene(scene([boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1])]), { keepView: true });
    hover(v, s.x, s.y);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'center', point: [29.75, 40, 20] });
    expect(asked).toBe(n + 1);
  });

  it('clear: 고르기 후보 미리 강조도 푼다(setScene과 같다 — 0.97.0은 pickPreview가 남았다)', () => {
    const v = make(scene([L, U]));
    const s = v.project([50, 50, 50])!;
    v.setPickPreview(v.pick(s.x, s.y));
    expect(v.pickPreview).toMatchObject({ id: 'U' });
    v.clear();
    expect(v.pickPreview).toBeNull();
    v.setScene(scene([L, U]), { keepView: true });
    expect(v.pickPreview).toBeNull();
  });
});
