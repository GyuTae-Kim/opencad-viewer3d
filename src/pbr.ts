/**
 * 0.43.0 PBR 그림(법선·거칠기·금속 — SKP 40차 요청) 순수 계산: 그물의 PBR 필드에서 셰이더가 쓸 것(올린 그림 id·배율)을 고른다.
 * GL은 모른다(무늬 올리기·셰이더는 renderer.ts·shaders.ts).
 *
 * 빛 식과의 맞물림(전면 PBR이 아니라 지금 음영 셰이더의 빛 식에 거칠기·금속성만 넣는다 — 둘레 빛(IBL)이 없는 어림):
 * - 법선 그림은 조각 법선만 바꾼다(빛 식은 그대로). 접선은 위치·무늬 좌표의 화면 미분으로 만든다(평면 면의 고른 무늬 좌표에서는 MikkTSpace 접선과 같은 틀)
 * - 거칠기 r → α = r²(glTF "alphaRoughness"), 반사광 Blinn-Phong 지수 n = 2/α² − 2(Beckmann α와 같은 퍼짐 — Walter 외 2007),
 *   세기는 정규화 (n + 8)/8(Blinn-Phong 에너지 보존 어림)에 F0 = mix(0.04, 바탕색, 금속성)와 그 빛의 확산 세기·n·l을 곱한다.
 *   0.42.0 고정 지수 48은 r = √0.2 ≈ 0.447과 같다(PBR_DEFAULT_ROUGHNESS)
 * - 금속성 m: 확산광을 (1 − m)배로, 주변광 몫은 금속이 바탕색으로 되비춘다고 보고 m·주변광·바탕색을 더한다(검게 꺼지지 않게)
 */
import type { Mesh3d } from './types';

/** 0.42.0까지의 고정 반사광(Blinn-Phong 지수 48)과 같은 퍼짐의 거칠기: α = r², 2/α² − 2 = 48 → r = √0.2 */
export const PBR_DEFAULT_ROUGHNESS = Math.sqrt(0.2);
/** 반사광 지수 상한(아주 매끈한 면의 반짝임이 화소 아래로 줄어 깜빡이지 않게 — 셰이더와 같다) */
export const PBR_MAX_EXPONENT = 2048;

/** 그물의 PBR 필드(MeshRec이 올릴 때 한 번 정리해 둔다 — 그 뒤 장면 객체를 다시 보지 않는다) */
export interface PbrSource {
  normal: string | null;
  /** 거칠기를 읽을 그림(roughnessTexture, 없으면 metallicRoughnessTexture) */
  rough: string | null;
  /** 금속성을 읽을 그림(metallicTexture, 없으면 metallicRoughnessTexture) */
  metal: string | null;
  normalScale: number;
  flipY: boolean;
  /** 준 값(0~1로 자른 것, 없으면 null) */
  roughness: number | null;
  metallic: number | null;
  invert: boolean;
}

/** 셰이더가 이번 그리기에 쓸 것(쓸 것이 없으면 pbrState가 null — 0.42.0 셰이더 그대로) */
export interface PbrState {
  /** 법선 그림 id(올린 것만 — 없으면 법선 그림 없이) */
  normal: string | null;
  /** 법선 그림 X·Y 배율(Y는 flipY면 음수) */
  scale: [number, number];
  /** 거칠기·금속성 그림 id(올린 것만, 없으면 null — 셰이더는 흰 1화소 그림을 읽어 배율이 곧 값이다) */
  rough: string | null;
  metal: string | null;
  /** 거칠기 배율·금속성 배율·거칠기 뒤집기(0 또는 1) — 셰이더 u_pbr */
  factors: [number, number, number];
  /** 거칠기·금속성 빛 식(PBR 변종)을 쓰는지 — 법선 그림만이면 false(0.42.0 빛 식) */
  lit: boolean;
}

const str = (x: unknown): string | null => (typeof x === 'string' && x.length > 0 ? x : null);
const unit = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : null);

/** 그물의 PBR 필드를 정리한다(PBR 필드가 하나도 없으면 null — 0.42.0 그물) */
export function pbrSource(
  m: Pick<Mesh3d, 'normalTexture' | 'normalScale' | 'normalFlipY' | 'roughness' | 'metallic' | 'metallicRoughnessTexture' | 'roughnessTexture' | 'metallicTexture' | 'roughnessInvert'>,
): PbrSource | null {
  const mr = str(m.metallicRoughnessTexture);
  const s: PbrSource = {
    normal: str(m.normalTexture),
    rough: str(m.roughnessTexture) ?? mr,
    metal: str(m.metallicTexture) ?? mr,
    normalScale: typeof m.normalScale === 'number' && Number.isFinite(m.normalScale) ? m.normalScale : 1,
    flipY: m.normalFlipY === true,
    roughness: unit(m.roughness),
    metallic: unit(m.metallic),
    invert: m.roughnessInvert === true,
  };
  return s.normal || s.rough || s.metal || s.roughness !== null || s.metallic !== null ? s : null;
}

/** 그물이 PBR 그림으로 쓰는 무늬 id(법선·거칠기·금속 — 겹친 것은 한 번) */
export function pbrTextureIds(s: PbrSource | null): string[] {
  if (!s) return [];
  const out: string[] = [];
  for (const id of [s.normal, s.rough, s.metal]) if (id && !out.includes(id)) out.push(id);
  return out;
}

/** 그물에 PBR 그림 id가 있는지(그러면 무늬 그림이 없어도 무늬 좌표를 올린다) */
export function pbrNeedsUv(m: Parameters<typeof pbrSource>[0]): boolean {
  return pbrTextureIds(pbrSource(m)).length > 0;
}

/**
 * 이번 그리기의 PBR 상태: ready(id) = 그 그림이 올라갔는지, uv = 무늬 좌표가 GPU에 있는지(없으면 그림은 쓰지 않는다).
 * 아직 올라가지 않은(기다리는·푸는 중·놓은) 그림은 없는 것처럼 본다 — 법선 그림이면 법선을 바꾸지 않고, 거칠기·금속 그림이면 값을 준 것만 쓴다.
 * 거칠기 값: 그림이 있으면 배율(없으면 1), 없으면 준 값(없으면 PBR_DEFAULT_ROUGHNESS). 금속성: 그림이 있으면 배율(없으면 1), 없으면 준 값(없으면 0).
 * 거칠기·금속성 그림도 값도 없으면 빛 식은 0.42.0 그대로(lit false)이고, 법선 그림까지 없으면 null
 */
export function pbrState(s: PbrSource | null, ready: (id: string) => boolean, uv: boolean): PbrState | null {
  if (!s) return null;
  const tex = (id: string | null): string | null => (uv && id && ready(id) ? id : null);
  const normal = tex(s.normal);
  const rough = tex(s.rough);
  const metal = tex(s.metal);
  const lit = !!rough || !!metal || s.roughness !== null || s.metallic !== null;
  if (!normal && !lit) return null;
  return {
    normal,
    scale: [s.normalScale, s.flipY ? -s.normalScale : s.normalScale],
    rough,
    metal,
    factors: [rough ? (s.roughness ?? 1) : (s.roughness ?? PBR_DEFAULT_ROUGHNESS), metal ? (s.metallic ?? 1) : (s.metallic ?? 0), rough && s.invert ? 1 : 0],
    lit,
  };
}

/** 셰이더 변종 정의(NMAP·PBR, 무늬 좌표를 읽는 UV) — 상태가 없으면 빈 목록 */
export function pbrDefines(st: PbrState | null): string[] {
  if (!st) return [];
  const d = ['UV'];
  if (st.normal) d.push('NMAP');
  if (st.lit) d.push('PBR');
  return d;
}

/** 거칠기 → 반사광 Blinn-Phong 지수(셰이더와 같은 식: α = r², 2/α² − 2, [0, PBR_MAX_EXPONENT]) */
export function specExponent(roughness: number): number {
  const r = Math.min(1, Math.max(0, roughness));
  const a2 = r * r * r * r;
  return Math.min(2 / Math.max(a2, 1e-6) - 2, PBR_MAX_EXPONENT);
}
