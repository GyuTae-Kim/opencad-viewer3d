/**
 * 작은 정점 속성 배열(0.26.0, 순수 계산 — GL은 모른다). 그물 법선(Mesh3d.normals)은 Float32Array 말고도 Int8Array·Int16Array(정규화 — 값 ÷ 127·32767),
 * 앞·뒷면 무늬 좌표(uvs·backUvs)는 Int16Array·Uint16Array(정규화 — 값 ÷ 32767은 −1~1, ÷ 65535는 0~1)를 받아 축척·이동(Mesh3d.uvTransform)으로 편다.
 * 렌더러는 배열을 바꾸지 않고 그대로 GPU에 올려 WebGL2 정점 속성 꼴(vertexAttribPointer의 BYTE·SHORT·UNSIGNED_SHORT, normalized)로 읽는다.
 *
 * 법선: 정수 배열은 정점마다 3값, 또는 길이가 정점 수 × 4와 같으면 4값(넷째 값은 읽지 않는다 — 한 정점이 4·8바이트라 GPU 백엔드가 줄을 다시 맞추지 않는다).
 * 무늬 좌표: 꼴과 무관하게 정점마다 2값 또는 원근 무늬 3값(길이로 가린다 — Float32와 같다). uvTransform [su, sv, ou, ov]가 있으면
 * 정규화 값 (s, t)에서 u = su·s + ou, v = sv·t + ov(원근 무늬 (s, t, q)면 q로 나눈 뒤의 u·v에 같은 변환 — (su·s + ou·q, sv·t + ov·q, q)).
 * 고르기·측정·범위·단면은 위치·색인만 쓰므로 법선·무늬 좌표 꼴과 무관하다.
 *
 * packNormals·packUvs는 앱(해석 워커)과 시험이 Float32 배열을 줄일 때 쓰는 도우미다.
 */

import type { NormalArray, UvArray, UvTransform } from './types';

export type { NormalArray, UvArray, UvTransform };
/** 렌더러가 올리는 정점 속성 배열(위치·색은 Float32) */
export type VertexArray = Float32Array | Int8Array | Int16Array | Uint16Array;

/** GL 정점 속성 값 꼴 */
export type AttribType = 'float' | 'byte' | 'short' | 'ushort';

/** 정점 속성 하나의 꼴(vertexAttribPointer의 꼴·정규화·읽는 값 수·한 정점 바이트) */
export interface AttribFormat {
  type: AttribType;
  normalized: boolean;
  /** 셰이더가 읽는 값 수 */
  size: number;
  /** 정점마다 배열에서 차지하는 값 수(법선 4면 넷째 값은 읽지 않는다) */
  per: number;
  /** 한 정점 바이트(per × 값 바이트) */
  stride: number;
}

/** 배열의 정점 속성 값 꼴(받지 않는 꼴이면 null). 다른 실행 환경(워커·vm)에서 만든 배열도 이름으로 가린다 */
export function attribType(a: unknown): AttribType | null {
  if (!a || !ArrayBuffer.isView(a)) return null;
  switch (Object.prototype.toString.call(a)) {
    case '[object Float32Array]':
      return 'float';
    case '[object Int8Array]':
      return 'byte';
    case '[object Int16Array]':
      return 'short';
    case '[object Uint16Array]':
      return 'ushort';
    default:
      return null;
  }
}

const BYTES: Readonly<Record<AttribType, number>> = { float: 4, byte: 1, short: 2, ushort: 2 };

/**
 * 법선 배열의 꼴(nv = 정점 수). Float32Array는 정점마다 3값(길이 ≥ nv × 3 — 0.25.0과 같다), Int8Array·Int16Array는 길이가 nv × 4와 같으면 4값,
 * 아니면 길이 ≥ nv × 3일 때 3값(정규화). 짧거나 다른 꼴(Uint8Array 등)이면 null — 그 그물은 법선 없이(평면 음영) 그린다
 */
export function normalFormat(a: unknown, nv: number): AttribFormat | null {
  const t = attribType(a);
  if (!t || t === 'ushort' || nv <= 0) return null;
  const n = (a as ArrayLike<number>).length;
  const per = t !== 'float' && n === nv * 4 ? 4 : n >= nv * 3 ? 3 : 0;
  if (!per) return null;
  return { type: t, normalized: t !== 'float', size: 3, per, stride: per * BYTES[t] };
}

/** 무늬 좌표 배열이 받는 꼴인지(Float32Array·Int16Array·Uint16Array) */
export function uvAccepted(a: unknown): a is UvArray {
  const t = attribType(a);
  return t === 'float' || t === 'short' || t === 'ushort';
}

/** 정점마다 n값(2·3)인 무늬 좌표 배열의 꼴(받지 않는 꼴이면 null) */
export function uvFormat(a: unknown, n: 2 | 3): AttribFormat | null {
  const t = attribType(a);
  if (t !== 'float' && t !== 'short' && t !== 'ushort') return null;
  return { type: t, normalized: t !== 'float', size: n, per: n, stride: n * BYTES[t] };
}

/** 앱이 준 uvTransform이 쓸 만한지(수 넷, 모두 유한) — 아니면 null(변환 없음 = [1, 1, 0, 0]) */
export function uvTransformOf(t: unknown): UvTransform | null {
  if (!t || typeof (t as ArrayLike<number>).length !== 'number' || (t as ArrayLike<number>).length < 4) return null;
  const a = t as ArrayLike<unknown>;
  for (let i = 0; i < 4; i++) if (typeof a[i] !== 'number' || !Number.isFinite(a[i] as number)) return null;
  return [a[0] as number, a[1] as number, a[2] as number, a[3] as number];
}

/** 정규화 정수 값 → 실수(WebGL2·GLES 3.0 규칙: 부호 있는 값은 max(c ÷ (2^(b−1) − 1), −1), 부호 없는 값은 c ÷ (2^b − 1)) */
export function unpackValue(c: number, t: AttribType): number {
  if (t === 'byte') return Math.max(c / 127, -1);
  if (t === 'short') return Math.max(c / 32767, -1);
  if (t === 'ushort') return c / 65535;
  return c;
}

/**
 * 법선을 정규화 정수 배열로 줄인다(앱·시험용). 정점마다 단위 길이로 맞춘 뒤 반올림한다(길이 0이면 0, 0, 0).
 * type 'int8'(정점 4값이면 한 정점 4바이트 — 기본) 또는 'int16'(더 곱다 — 4값이면 8바이트), per 3·4(4면 넷째 값은 0)
 */
export function packNormals(n: ArrayLike<number>, type: 'int8' | 'int16' = 'int8', per: 3 | 4 = 4): Int8Array | Int16Array {
  const nv = Math.floor(n.length / 3);
  const max = type === 'int8' ? 127 : 32767;
  const out = type === 'int8' ? new Int8Array(nv * per) : new Int16Array(nv * per);
  for (let i = 0; i < nv; i++) {
    const x = n[i * 3]!, y = n[i * 3 + 1]!, z = n[i * 3 + 2]!;
    const l = Math.hypot(x, y, z);
    if (!(l > 0) || !Number.isFinite(l)) continue;
    out[i * per] = Math.round((x / l) * max);
    out[i * per + 1] = Math.round((y / l) * max);
    out[i * per + 2] = Math.round((z / l) * max);
  }
  return out;
}

/**
 * 무늬 좌표를 정규화 정수 배열과 uvTransform으로 줄인다(앱·시험용 — nv = 정점 수, 정점마다 2값 또는 원근 무늬 3값은 길이로 가린다).
 * 'int16'은 가운데·반폭(−1~1), 'uint16'은 최소·폭(0~1)으로 u·v를 따로 맞춘다. 원근 무늬는 q를 가장 큰 |q|로 나눠 맞추고 u·q, v·q는 그 q를 곱해 둔다.
 * 한 축 값이 모두 같으면 그 축 축척은 1. 정밀도는 그 그물의 u·v 범위 ÷ 65535(예: 0~10 되풀이면 약 0.00015 — 512 화소 무늬의 0.08 화소)
 */
export function packUvs(uvs: ArrayLike<number>, nv: number, type: 'int16' | 'uint16' = 'int16'): { uvs: Int16Array | Uint16Array; transform: UvTransform } {
  const k: 2 | 3 = nv > 0 && uvs.length >= nv * 3 ? 3 : 2;
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  let qmax = 0;
  for (let i = 0; i < nv; i++) {
    const q = k === 3 ? uvs[i * 3 + 2]! : 1;
    if (k === 3) qmax = Math.max(qmax, Math.abs(q));
    for (let c = 0; c < 2; c++) {
      const u = uvs[i * k + c]! / q;
      if (!Number.isFinite(u)) continue;
      lo[c] = Math.min(lo[c]!, u);
      hi[c] = Math.max(hi[c]!, u);
    }
  }
  const signed = type === 'int16';
  const scale = [0, 1].map((c) => {
    const w = hi[c]! - lo[c]!;
    return Number.isFinite(w) && w > 0 ? (signed ? w / 2 : w) : 1;
  });
  const off = [0, 1].map((c) => (Number.isFinite(lo[c]!) ? (signed ? (lo[c]! + hi[c]!) / 2 : lo[c]!) : 0));
  const max = signed ? 32767 : 65535;
  const lim = (x: number): number => (signed ? Math.min(32767, Math.max(-32767, x)) : Math.min(65535, Math.max(0, x)));
  const out = signed ? new Int16Array(nv * k) : new Uint16Array(nv * k);
  for (let i = 0; i < nv; i++) {
    const q = k === 3 ? uvs[i * 3 + 2]! : 1;
    const qn = k === 3 && qmax > 0 ? q / qmax : 1;
    for (let c = 0; c < 2; c++) {
      const u = uvs[i * k + c]! / q;
      const s = Number.isFinite(u) ? (u - off[c]!) / scale[c]! : 0;
      out[i * k + c] = lim(Math.round(s * qn * max));
    }
    if (k === 3) out[i * 3 + 2] = lim(Math.round(qn * max));
  }
  return { uvs: out, transform: [scale[0]!, scale[1]!, off[0]!, off[1]!] };
}
