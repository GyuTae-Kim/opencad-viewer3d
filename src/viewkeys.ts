/**
 * 0.54.0 표준 뷰 이름·키 표(아주 작은 모듈 opencad-viewer3d/viewkeys — 다른 코어 모듈을 가져오지 않는다).
 *
 * 0.10.0부터 이 표는 camera 모듈에 있었다. 그런데 앱의 뷰어 조각(나눠 받는 Viewer3d)도 camera를 쓰므로, 첫 화면이 표 하나만 가져와도
 * 번들러는 모듈 단위로 조각을 정해 camera 모듈 전체(카메라 계산·bounds·math)를 첫 화면 JS에 두었다(STEP 63차 — 앱이 표를 복사해 우회했다).
 * 이제 표는 여기에 두고 camera·입구(opencad-viewer3d)·viewer가 같은 객체를 다시 내보낸다 — 첫 화면은 이 모듈에서 가져온다.
 */

export type ViewName = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'swIso' | 'seIso' | 'neIso' | 'nwIso';

/** 표준 뷰 한국어 이름(앱 번역은 이 표를 바꾸거나 제 사전으로) */
export const VIEW_LABELS: Record<ViewName, string> = {
  top: '위',
  bottom: '아래',
  front: '앞',
  back: '뒤',
  left: '왼쪽',
  right: '오른쪽',
  swIso: '남서 등각',
  seIso: '남동 등각',
  neIso: '북동 등각',
  nwIso: '북서 등각',
};

/**
 * 표준 뷰 키(1 앞 2 뒤 3 왼쪽 4 오른쪽 5 위 6 아래 7 남동 등각) — Viewer3d.handleKey의 규칙이고, 앱이 단추·메뉴 글에 같은 표를 쓰게 내보낸다.
 * 입구(opencad-viewer3d)·opencad-viewer3d/camera·opencad-viewer3d/viewer도 같은 객체를 내보낸다
 */
export const VIEW_KEYS: Readonly<Record<string, ViewName>> = { '1': 'front', '2': 'back', '3': 'left', '4': 'right', '5': 'top', '6': 'bottom', '7': 'seIso' };

/** 표준 뷰 → 그 뷰의 키(VIEW_KEYS에서 찾는다 — 메뉴·도움말 글의 단축키 표시). 키가 없는 뷰(남서·북동·북서 등각)는 undefined */
export function viewKeyOf(v: ViewName): string | undefined {
  for (const k in VIEW_KEYS) if (VIEW_KEYS[k] === v) return k;
  return undefined;
}
