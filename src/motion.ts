/**
 * 카메라 움직임 설정(0.48.0, 순수 함수 — WebGL 없음). Viewer3d의 animate 선택·setAnimate가 쓰고 입구에서도 내보낸다.
 *
 * - true(기본 — 0.47.0 그대로): 표준 뷰·전체 보기·맞춰 보기·뷰 큐브·키 F·1~7·창 확대·flyTo를 0.32초 동안 부드럽게 옮긴다
 * - false: 바로 옮긴다
 * - 'auto': 사용자의 움직임 줄이기 선호(CSS 미디어 질의 prefers-reduced-motion: reduce — OS·브라우저 설정)면 바로, 아니면 부드럽게.
 *   뷰어를 연 뒤 설정을 바꿔도 matchMedia의 change 사건으로 따라간다(WCAG 2.3.3 상호 작용으로 생긴 움직임 끄기)
 */

/** 카메라 움직임 설정 */
export type AnimateSetting = boolean | 'auto';

/** 움직임 줄이기 선호 미디어 질의 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * 설정을 읽는다: 'auto'는 그대로, 주지 않으면(undefined) 기본 true, 그 밖은 참·거짓으로(0.47.0까지 animate를 참·거짓으로만 읽었다 — JS에서 0·1을 주어도 같다)
 */
export function normalizeAnimate(v: unknown): AnimateSetting {
  return v === 'auto' ? 'auto' : v === undefined ? true : !!v;
}

/** 설정과 지금 움직임 줄이기 선호로 카메라를 부드럽게 옮길지 */
export function resolveAnimate(setting: AnimateSetting, reduce: boolean): boolean {
  return setting === 'auto' ? !reduce : setting;
}

/** watchReducedMotion이 쓰는 MediaQueryList 꼴(옛 Safari 13 이하는 addListener·removeListener만 있다) */
export interface MotionQueryList {
  readonly matches: boolean;
  addEventListener?(type: 'change', fn: () => void): void;
  removeEventListener?(type: 'change', fn: () => void): void;
  addListener?(fn: () => void): void;
  removeListener?(fn: () => void): void;
}

/** watchReducedMotion이 쓰는 matchMedia 꼴(시험에서 흉내 낸다) */
export type MotionMatchMedia = (query: string) => MotionQueryList | null | undefined;

/**
 * 움직임 줄이기 선호를 듣는다: 지금 값(reduce)을 돌려주고, 바뀔 때마다 cb(새 값)를 부른다. 돌려준 off로 그만 듣는다.
 * matchMedia가 없거나 던지면(서버·옛 환경) 선호 없음(false)으로 보고 듣지 않는다. 값은 사건 객체가 아니라 질의 목록의 matches로 다시 읽는다
 * (옛 addListener는 사건 대신 목록을 넘긴다)
 */
export function watchReducedMotion(mm: MotionMatchMedia | null | undefined, cb: (reduce: boolean) => void): { reduce: boolean; off: () => void } {
  let mql: MotionQueryList | null | undefined = null;
  try {
    mql = typeof mm === 'function' ? mm(REDUCED_MOTION_QUERY) : null;
  } catch {
    mql = null;
  }
  if (!mql) return { reduce: false, off: () => undefined };
  const list = mql;
  let last = !!list.matches;
  const on = (): void => {
    const now = !!list.matches;
    if (now === last) return;
    last = now;
    cb(now);
  };
  if (typeof list.addEventListener === 'function') {
    list.addEventListener('change', on);
    return { reduce: last, off: () => list.removeEventListener?.('change', on) };
  }
  if (typeof list.addListener === 'function') {
    list.addListener(on);
    return { reduce: last, off: () => list.removeListener?.(on) };
  }
  return { reduce: last, off: () => undefined };
}
