/**
 * 주변 가림(0.49.0 — SKP 45차 요청 "주변 가림(AO)", 순수 함수 — WebGL 없음). Viewer3d.setAmbientOcclusion이 쓰고 입구에서도 내보낸다.
 *
 * 화면 공간 가림(SSAO): 불투명 그물의 맨 앞 깊이 그림(외곽선과 같은 그림)에서 화소마다 눈 공간 자리·법선을 다시 세우고, 그 둘레 원반의 깊이 표본이
 * 법선 쪽으로 솟아 있으면 가린 것으로 센다(가린 표본의 법선과 이룬 각의 코사인 × 거리 감쇠의 평균). 반 해상도로 셈하고 깊이를 따져 가로·세로로 흐린 뒤
 * 장치 화소 그림에 곱한다(불투명 면을 그린 뒤, 선·점·격자·반투명 면 앞). 끄면(기본) 그림·GL 호출이 0.48.0과 같다.
 */

/** setAmbientOcclusion 선택 */
export interface AmbientOcclusionOptions {
  /** 가림을 보는 거리(세계 단위). 주지 않거나 0 이하·유한하지 않으면 보이는 범위 대각선의 AO_RADIUS_RATIO */
  radius?: number;
  /** 세기(0~AO_MAX_INTENSITY, 기본 1 — 0이면 끈 것과 같다) */
  intensity?: number;
  /**
   * 0.50.0 카메라를 옮기는 동안(끌기·휠·손가락 몸짓·flyTo·fit 등 카메라 움직임): 'keep'(기본 — 0.49.0 그대로 같은 가림), 'off'(그동안 가림을 그리지 않는다 —
   * 깊이 그리기·화면 단계 모두 빠지고 멈추면 다시 그린다), 'low'(가림 단계를 ¼ 해상도로 — 흐림·곱하기는 같다)
   */
  moving?: AoMoving;
}

/** 0.50.0 카메라를 옮기는 동안의 주변 가림(AmbientOcclusionOptions.moving) */
export type AoMoving = 'keep' | 'off' | 'low';

/** 기본 가림 거리: 보이는 범위 대각선에 대한 비 */
export const AO_RADIUS_RATIO = 0.03;
/** 화소마다 깊이 표본 수(나선 — 셰이더 상수와 같다) */
export const AO_SAMPLES = 12;
/** 세기 위 한도 */
export const AO_MAX_INTENSITY = 4;
/** 가림 원반의 화면 반지름 위 한도(장치 화소 — 아주 가까이 본 자리에서 표본이 화면 끝까지 흩어지지 않게) */
export const AO_MAX_PIXELS = 160;

/** 그리기에 넘기는 값: 세계 단위 거리·세기. 끄면 null */
export interface AoParams {
  radius: number;
  intensity: number;
  /** 0.50.0 가림 단계 해상도 나누개(없으면 2 = 반 해상도, 움직이는 동안 'low'면 4 = ¼) */
  div?: 4;
  /** 0.50.0 움직이는 동안 'off': 이 그림에서는 가림을 그리지 않는다(가림 그림은 놓지 않고 둔다 — 멈추면 다시 그린다) */
  hold?: true;
}

/** 0.50.0 'low'에서 움직이는 동안 가림 단계 해상도 나누개(¼) */
export const AO_LOW_DIV = 4;

/**
 * 선택 → 그리기 값. o가 null·undefined·false면 null(끔), true·{}면 기본. diagonal은 보이는 범위 대각선(세계 단위 — 비었거나 0이면 1로 본다).
 * 세기 0은 끈 것(null)으로 — 그리기 단계를 아예 돌지 않는다. 0.50.0 moving = 카메라를 옮기는 중인지: o.moving이 'off'면 hold, 'low'면 div 4를 붙인다
 * ('keep'·없음·멈춘 그림은 0.49.0과 같은 값)
 */
export function aoParams(o: AmbientOcclusionOptions | boolean | null | undefined, diagonal: number, moving = false): AoParams | null {
  if (!o) return null;
  const opt = o === true ? {} : o;
  const diag = Number.isFinite(diagonal) && diagonal > 0 ? diagonal : 1;
  const r = opt.radius;
  const radius = typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : diag * AO_RADIUS_RATIO;
  const k = opt.intensity;
  const intensity = typeof k === 'number' && Number.isFinite(k) ? Math.min(Math.max(k, 0), AO_MAX_INTENSITY) : 1;
  if (!(intensity > 0)) return null;
  if (moving && opt.moving === 'off') return { radius, intensity, hold: true };
  if (moving && opt.moving === 'low') return { radius, intensity, div: AO_LOW_DIV };
  return { radius, intensity };
}

/** 가림 단계 크기(장치 화소 w·h → 올림 1/div, 1 이상 — 기본 반 해상도) */
export function aoSize(w: number, h: number, div = 2): [number, number] {
  return [Math.max(1, Math.ceil(w / div)), Math.max(1, Math.ceil(h / div))];
}
