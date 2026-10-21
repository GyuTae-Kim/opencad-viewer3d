/** 포인터 종류별 문턱(끌기 시작·고르기 허용 거리·두 번 누르기)과 터치 허용 거리로 장면 고르기 */
import { describe, expect, it } from 'vitest';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles } from '../src/camera';
import * as entry from '../src/index';
import {
  DOUBLE_CLICK_PX,
  DRAG_START_PX,
  PICK_TOLERANCE_PX,
  SNAP_PX,
  TOUCH_DOUBLE_TAP_PX,
  TOUCH_DRAG_START_PX,
  TOUCH_PICK_TOLERANCE_PX,
  clickCount,
  doubleClickPx,
  dragStartPx,
  dragStarted,
  isTouch,
  pickTolerance,
} from '../src/pointer';
import { type ScenePickOptions, pickScene } from '../src/scenepick';
import type { LineSet3d } from '../src/types';

describe('끌기 시작 거리', () => {
  it('마우스·펜은 4화소(예전 그대로), 터치만 10화소', () => {
    expect(DRAG_START_PX).toBe(4);
    expect(TOUCH_DRAG_START_PX).toBe(10);
    expect(dragStartPx('mouse')).toBe(4);
    expect(dragStartPx('pen')).toBe(4);
    expect(dragStartPx('')).toBe(4);
    expect(dragStartPx(undefined)).toBe(4);
    expect(dragStartPx('touch')).toBe(10);
    expect(isTouch('touch')).toBe(true);
    expect(isTouch('pen')).toBe(false);
  });

  it('6·9화소 떨린 터치 누르기는 끌기가 아니다(마우스는 4화소부터 끌기)', () => {
    for (const d of [0, 3, 6, 9, 9.99]) expect(dragStarted(d, 0, 'touch')).toBe(false);
    expect(dragStarted(6, 8, 'touch')).toBe(true);
    expect(dragStarted(0, -10, 'touch')).toBe(true);
    expect(dragStarted(3.99, 0, 'mouse')).toBe(false);
    expect(dragStarted(4, 0, 'mouse')).toBe(true);
    expect(dragStarted(6, 0, 'mouse')).toBe(true);
    expect(dragStarted(6, 0, 'pen')).toBe(true);
  });

  it('패키지 입구에서 내보낸다(앱이 길게 누르기 판정을 맞춘다)', () => {
    expect(entry.TOUCH_DRAG_START_PX).toBe(TOUCH_DRAG_START_PX);
    expect(entry.DRAG_START_PX).toBe(DRAG_START_PX);
    expect(entry.TOUCH_PICK_TOLERANCE_PX).toBe(TOUCH_PICK_TOLERANCE_PX);
    expect(entry.dragStartPx('touch')).toBe(10);
  });
});

describe('고르기 허용 거리', () => {
  it('마우스·펜은 pickTolerance와 꼭짓점 붙잡기 10화소(예전 그대로)', () => {
    expect(PICK_TOLERANCE_PX).toBe(6);
    expect(SNAP_PX).toBe(10);
    expect(pickTolerance('mouse', 6, 14)).toEqual({ tol: 6, snap: 10 });
    expect(pickTolerance('pen', 6, 14)).toEqual({ tol: 6, snap: 10 });
    expect(pickTolerance(undefined, 3, 14)).toEqual({ tol: 3, snap: 10 });
  });

  it('터치는 touchPickTolerance, 붙잡기도 그만큼(10 아래로는 줄이지 않는다)', () => {
    expect(TOUCH_PICK_TOLERANCE_PX).toBe(14);
    expect(pickTolerance('touch', 6, 14)).toEqual({ tol: 14, snap: 14 });
    expect(pickTolerance('touch', 6, 20)).toEqual({ tol: 20, snap: 20 });
    expect(pickTolerance('touch', 6, 8)).toEqual({ tol: 8, snap: 10 });
  });
});

describe('두 번 누르기', () => {
  const first = { t: 1000, x: 100, y: 100, n: 1 };

  it('마우스는 0.45초·6화소 안(예전 그대로)', () => {
    expect(DOUBLE_CLICK_PX).toBe(6);
    expect(doubleClickPx('mouse')).toBe(6);
    expect(clickCount(first, 1200, 105, 100, 'mouse')).toBe(2);
    expect(clickCount(first, 1200, 106, 100, 'mouse')).toBe(1);
    expect(clickCount(first, 1450, 100, 100, 'mouse')).toBe(1);
    expect(clickCount(first, 1449, 100, 100, 'mouse')).toBe(2);
  });

  it('터치는 24화소 안이면 두 번 두드리기', () => {
    expect(TOUCH_DOUBLE_TAP_PX).toBe(24);
    expect(clickCount(first, 1200, 112, 109, 'touch')).toBe(2);
    expect(clickCount(first, 1200, 120, 112, 'touch')).toBe(2);
    expect(clickCount(first, 1200, 124, 100, 'touch')).toBe(1);
    expect(clickCount(first, 1500, 101, 100, 'touch')).toBe(1);
  });

  it('세 번째 누르기는 다시 1, 빈 기록도 1', () => {
    expect(clickCount({ ...first, n: 2 }, 1100, 100, 100, 'touch')).toBe(1);
    expect(clickCount({ t: 0, x: 0, y: 0, n: 0 }, 100, 0, 0, 'mouse')).toBe(1);
  });
});

describe('터치 허용 거리로 장면 고르기', () => {
  // 앞 뷰(평행), 반높이 10 → 400화소 화면에서 1단위 = 20화소. 선분은 화면 가운데 가로줄(y = 200), x 100~300화소
  const cam = (): CameraState => {
    const a = dirToAngles(VIEW_DIRS.front);
    return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, projection: 'orthographic', target: [0, 0, 0], distance: 10 / Math.tan(defaultCamera().fovY / 2) };
  };
  const f = computeFrame(cam(), 400, 400, { center: [0, 0, 0], radius: 20 });
  const line: LineSet3d = { id: '경로', positions: new Float32Array([-5, 0, 0, 5, 0, 0]), color: [1, 1, 1, 1] };
  const items = { meshes: [], lines: [line], points: [] };
  const opts = (pointerType: string): ScenePickOptions => {
    const t = pickTolerance(pointerType, PICK_TOLERANCE_PX, TOUCH_PICK_TOLERANCE_PX);
    return { tol: t.tol, snap: t.snap, occlude: false, bvh: () => null };
  };

  it('선에서 10·12화소 떨어진 터치는 그 선을 고르고, 마우스는 예전처럼 고르지 않는다', () => {
    for (const d of [10, 12]) {
      expect(pickScene(f, 200, 200 + d, items, opts('touch'))?.pick.id).toBe('경로');
      expect(pickScene(f, 200, 200 + d, items, opts('mouse'))).toBeNull();
    }
    expect(pickScene(f, 200, 200 + 5, items, opts('mouse'))?.pick.id).toBe('경로');
    // 터치도 허용 거리(14 + 선 굵기 절반) 밖은 고르지 않는다
    expect(pickScene(f, 200, 200 + 16, items, opts('touch'))).toBeNull();
  });

  it('끝점 붙잡기: 12화소 떨어진 끝점을 터치는 붙잡고 마우스는 그 자리 점, snap을 주지 않으면 10화소', () => {
    const t = pickScene(f, 300 - 12, 200, items, opts('touch'))!;
    expect(t.vertex).toBe(true);
    expect(t.snap[0]).toBeCloseTo(5, 6);
    const m = pickScene(f, 300 - 12, 200, items, opts('mouse'))!;
    expect(m.vertex).toBe(false);
    expect(m.snap[0]).toBeCloseTo(4.4, 6);
    const near = pickScene(f, 300 - 8, 200, items, { tol: 6, occlude: false, bvh: () => null })!;
    expect(near.vertex).toBe(true);
    expect(pickScene(f, 300 - 12, 200, items, { tol: 6, occlude: false, bvh: () => null })!.vertex).toBe(false);
  });
});

describe('걷기 키', () => {
  it('물리 키(code)를 먼저: 한글 입력기의 ㅈ(KeyW)도 앞으로, code가 없으면 key', async () => {
    const { walkKeyOf } = await import('../src/pointer');
    expect(walkKeyOf({ code: 'KeyW', key: 'ㅈ' })).toBe('w');
    expect(walkKeyOf({ code: 'KeyA', key: 'ㅁ' })).toBe('a');
    expect(walkKeyOf({ code: 'KeyD', key: 'D' })).toBe('d');
    expect(walkKeyOf({ code: 'ArrowLeft', key: 'ArrowLeft' })).toBe('ArrowLeft');
    expect(walkKeyOf({ code: 'KeyF', key: 'f' })).toBeNull();
    expect(walkKeyOf({ code: 'Digit1', key: '1' })).toBeNull();
    expect(walkKeyOf({ key: 'W' })).toBe('w');
    expect(walkKeyOf({ code: '', key: 'PageUp' })).toBe('PageUp');
    expect(walkKeyOf({ key: 'ㅈ' })).toBeNull();
  });
});
