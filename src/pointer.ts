/**
 * 포인터 종류별 조작 문턱(순수 상수·함수, DOM 없음). Viewer3d가 쓰고, 앱이 같은 값에 맞추도록 패키지 입구에서 내보낸다.
 *
 * 손가락은 누르는 동안 몇 화소 떨리고 닿는 자리도 커서보다 부정확하므로 터치('touch')만 넓게 잡는다.
 * 마우스·펜(그 밖의 모든 종류, 빈 문자열 포함)은 0.5.0까지의 값 그대로다.
 */

/** 마우스·펜: 누른 자리에서 이만큼(화소) 움직이면 끌기(궤도·이동)로 본다. 그 안에서 떼면 누르기 */
export const DRAG_START_PX = 4;
/** 터치: 누른 자리에서 이만큼(화소) 움직이면 끌기로 본다. 앱의 길게 누르기 판정(정밀 조준 등)도 이 값에 맞춘다 */
export const TOUCH_DRAG_START_PX = 10;
/** 마우스·펜 고르기 허용 거리 기본값(화면 화소, Viewer3dOptions.pickTolerance) */
export const PICK_TOLERANCE_PX = 6;
/** 터치 고르기 허용 거리 기본값(화면 화소, Viewer3dOptions.touchPickTolerance) */
export const TOUCH_PICK_TOLERANCE_PX = 14;
/** 측정 점을 꼭짓점·끝점에 붙잡는 거리(화면 화소, 마우스·펜) */
export const SNAP_PX = 10;
/** 두 번 누르기: 바로 앞 누르기와 이 시간(ms) 안 */
export const DOUBLE_CLICK_MS = 450;
/** 두 번 누르기: 바로 앞 누르기와 이 거리(화소) 안 — 마우스·펜 */
export const DOUBLE_CLICK_PX = 6;
/** 두 번 누르기: 바로 앞 누르기와 이 거리(화소) 안 — 터치(두 번 두드리면 손가락이 조금 다른 곳에 닿는다) */
export const TOUCH_DOUBLE_TAP_PX = 24;

/** 터치 포인터인지('touch'만. 펜·마우스·모르는 종류는 아니다) */
export const isTouch = (pointerType: string | null | undefined): boolean => pointerType === 'touch';

/** 끌기 시작 거리(화소): 터치는 TOUCH_DRAG_START_PX, 그 밖은 DRAG_START_PX */
export function dragStartPx(pointerType: string | null | undefined): number {
  return isTouch(pointerType) ? TOUCH_DRAG_START_PX : DRAG_START_PX;
}

/** 누른 자리에서 (dx, dy)만큼 움직였을 때 끌기가 시작됐는지 */
export function dragStarted(dx: number, dy: number, pointerType: string | null | undefined): boolean {
  return Math.hypot(dx, dy) >= dragStartPx(pointerType);
}

/** 고르기 허용 거리: tol = 선분·점 고르기, snap = 측정 점을 꼭짓점·끝점에 붙잡는 거리(화면 화소) */
export interface PickTolerance {
  tol: number;
  snap: number;
}

/**
 * 포인터 종류별 고르기 허용 거리. 마우스·펜은 { mouse, SNAP_PX }, 터치는 { touch, max(SNAP_PX, touch) }.
 * 같은 포인터 종류면 마우스 위 미리 보기(측정 붙잡을 점)와 누르기가 같은 점을 고른다.
 */
export function pickTolerance(pointerType: string | null | undefined, mouse: number, touch: number): PickTolerance {
  if (!isTouch(pointerType)) return { tol: mouse, snap: SNAP_PX };
  return { tol: touch, snap: Math.max(SNAP_PX, touch) };
}

/** 두 번 누르기 거리(화소): 터치는 TOUCH_DOUBLE_TAP_PX, 그 밖은 DOUBLE_CLICK_PX */
export function doubleClickPx(pointerType: string | null | undefined): number {
  return isTouch(pointerType) ? TOUCH_DOUBLE_TAP_PX : DOUBLE_CLICK_PX;
}

/** 바로 앞 누르기(시각 ms·자리·횟수) */
export interface LastClick {
  t: number;
  x: number;
  y: number;
  n: number;
}

/**
 * 이번 누르기의 횟수: 바로 앞이 한 번 누르기였고 DOUBLE_CLICK_MS·doubleClickPx 안이면 2, 아니면 1
 * (세 번째 누르기는 다시 1 — 두 번 누르기가 잇달아 겹치지 않게).
 */
export function clickCount(last: LastClick, t: number, x: number, y: number, pointerType: string | null | undefined): 1 | 2 {
  return last.n === 1 && t - last.t < DOUBLE_CLICK_MS && Math.hypot(x - last.x, y - last.y) < doubleClickPx(pointerType) ? 2 : 1;
}

/** 걷기 키 이름(소문자 글자 또는 키 이름) */
export type WalkKey = 'w' | 'a' | 's' | 'd' | 'q' | 'e' | 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | 'PageUp' | 'PageDown';

const WALK_CODES: Readonly<Record<string, WalkKey>> = {
  KeyW: 'w',
  KeyA: 'a',
  KeyS: 's',
  KeyD: 'd',
  KeyQ: 'q',
  KeyE: 'e',
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
};

/**
 * 걷기 키 찾기: 물리 키(code — 한글 입력기에서 ㅈㅁㄴㅇㅂㄷ가 나와도 W·A·S·D·Q·E 자리)를 먼저 보고, code가 없으면 key(대소문자 무시)로.
 * 걷기 키가 아니면 null
 */
export function walkKeyOf(e: { code?: string; key?: string }): WalkKey | null {
  const c = e.code ? WALK_CODES[e.code] : undefined;
  if (c) return c;
  if (e.code && e.code !== 'Unidentified') return null;
  const k = e.key ?? '';
  const n = k.length === 1 ? k.toLowerCase() : k;
  return (Object.values(WALK_CODES) as string[]).includes(n) ? (n as WalkKey) : null;
}
