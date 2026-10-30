/**
 * 무늬 그림 도구: 그림 머리 읽기(꼴·크기·알파 가능성), 크기 한도·전체 예산 나누기(순수 함수), 그림 풀기(createImageBitmap).
 * GL은 모른다(올리기는 renderer.ts). 풀기는 window·워커 어디서나 되는 createImageBitmap만 쓴다.
 *
 * 방향: 셰이더는 v가 위로 느는(0 = 그림 아래 끝) 무늬 좌표를 쓰므로, 풀 때 위아래를 뒤집어(imageOrientation 'flipY')
 * 첫 줄이 그림 아래 끝이 되게 올린다. ImageBitmap을 올릴 때는 UNPACK_FLIP_Y_WEBGL이 듣지 않아서 여기서 뒤집는다.
 */
import { uvAccepted } from './attribs';
import type { Mesh3d, Texture3d, UvArray } from './types';

/** 무늬 한 장의 긴 변 기본 한도(화소) */
export const TEXTURE_LIMIT = 2048;
/** GPU 무늬 전체 기본 예산(바이트, RGBA·밉맵 포함 어림) */
export const TEXTURE_BUDGET = 256 * 1024 * 1024;
/** 예산으로 줄여도 이보다 작게는 줄이지 않는다(화소) */
export const TEXTURE_MIN_SIDE = 64;

/**
 * 그물 무늬 좌표의 정점당 값 수(0 = 무늬 좌표 없음 또는 짧음). 0.26.0: 받지 않는 배열 꼴(Float32Array·Int16Array·Uint16Array가 아닌 것)도 0
 */
export function uvComponents(m: Pick<Mesh3d, 'positions' | 'uvs'>, uvs: UvArray | undefined = m.uvs): 0 | 2 | 3 {
  const nv = Math.floor(m.positions.length / 3);
  const uv = uvs;
  if (!uv || nv === 0 || !uvAccepted(uv)) return 0;
  if (uv.length >= nv * 3) return 3;
  if (uv.length >= nv * 2) return 2;
  return 0;
}

export interface ImageInfo {
  mime: string;
  width?: number;
  height?: number;
  /** 투명 화소를 담을 수 있는 꼴이면 true(PNG 알파·tRNS, GIF, WebP 알파). 실제로 쓰는지는 풀어야 안다 */
  alpha: boolean;
}

const be32 = (b: Uint8Array, o: number): number => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const be16 = (b: Uint8Array, o: number): number => (b[o]! << 8) | b[o + 1]!;
const le16 = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8);
const le24 = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);

/** 첫 바이트로 그림 꼴·크기 읽기(모르는 꼴이면 null). 크기를 못 읽으면 width·height 없이 */
export function imageInfo(b: Uint8Array): ImageInfo | null {
  // PNG: IHDR(가로·세로·색 형식). 색 형식 4·6은 알파, 그 밖은 IDAT 앞 tRNS 조각이 있으면 투명색
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    if (b.length < 26) return { mime: 'image/png', alpha: true };
    const type = b[25]!;
    let alpha = type === 4 || type === 6;
    for (let p = 8; !alpha && p + 8 <= b.length; ) {
      const len = be32(b, p);
      const t = String.fromCharCode(b[p + 4]!, b[p + 5]!, b[p + 6]!, b[p + 7]!);
      if (t === 'tRNS') alpha = true;
      if (t === 'IDAT' || t === 'IEND') break;
      p += 12 + len;
    }
    return { mime: 'image/png', width: be32(b, 16), height: be32(b, 20), alpha };
  }
  // JPEG: SOFn 조각의 세로·가로
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let p = 2;
    while (p + 4 <= b.length) {
      if (b[p] !== 0xff) {
        p++;
        continue;
      }
      const m = b[p + 1]!;
      if (m === 0xff) {
        p++;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        p += 2;
        continue;
      }
      const len = be16(b, p + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        if (p + 9 <= b.length) return { mime: 'image/jpeg', width: be16(b, p + 7), height: be16(b, p + 5), alpha: false };
        break;
      }
      p += 2 + len;
    }
    return { mime: 'image/jpeg', alpha: false };
  }
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return { mime: 'image/gif', width: le16(b, 6), height: le16(b, 8), alpha: true };
  if (b.length >= 26 && b[0] === 0x42 && b[1] === 0x4d) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { mime: 'image/bmp', width: Math.abs(dv.getInt32(18, true)), height: Math.abs(dv.getInt32(22, true)), alpha: false };
  }
  if (b.length >= 16 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const kind = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (kind === 'VP8 ' && b.length >= 30) return { mime: 'image/webp', width: le16(b, 26) & 0x3fff, height: le16(b, 28) & 0x3fff, alpha: false };
    if (kind === 'VP8L' && b.length >= 25) {
      const v = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { mime: 'image/webp', width: (v & 0x3fff) + 1, height: ((v >>> 14) & 0x3fff) + 1, alpha: ((v >>> 28) & 1) === 1 };
    }
    if (kind === 'VP8X' && b.length >= 30) return { mime: 'image/webp', width: le24(b, 24) + 1, height: le24(b, 27) + 1, alpha: (b[20]! & 0x10) !== 0 };
    return { mime: 'image/webp', alpha: true };
  }
  return null;
}

/** w × h를 긴 변 limit 안으로 줄인 크기(가로세로 비 유지). 이미 들어가면 null */
export function fitSize(w: number, h: number, limit: number): { width: number; height: number } | null {
  if (!(w > 0) || !(h > 0) || !(limit > 0) || Math.max(w, h) <= limit) return null;
  const k = limit / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/**
 * 무늬마다 긴 변 한도(화소). 한 장 한도(limit) 안으로 줄인 뒤에도 전체(RGBA·밉맵 4/3배 어림)가 budget을 넘으면
 * 모두를 같은 비로 줄인다(TEXTURE_MIN_SIDE 아래로는 줄이지 않는다). 크기를 모르는 그림은 limit × limit으로 어림한다.
 */
export function textureSides(textures: readonly Pick<Texture3d, 'id' | 'width' | 'height'>[], limit = TEXTURE_LIMIT, budget = TEXTURE_BUDGET): Map<string, number> {
  const out = new Map<string, number>();
  let bytes = 0;
  const sides: [string, number, number][] = [];
  for (const t of textures) {
    const w = t.width && t.width > 0 ? t.width : limit;
    const h = t.height && t.height > 0 ? t.height : limit;
    const f = fitSize(w, h, limit) ?? { width: w, height: h };
    bytes += f.width * f.height * 4 * (4 / 3);
    sides.push([t.id, Math.max(f.width, f.height), limit]);
  }
  const k = budget > 0 && bytes > budget ? Math.sqrt(budget / bytes) : 1;
  for (const [id, side] of sides) out.set(id, k < 1 ? Math.max(Math.min(TEXTURE_MIN_SIDE, side), Math.floor(side * k)) : limit);
  return out;
}

const DECODE: ImageBitmapOptions = { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' };

/**
 * 무늬 그림 풀기: 위아래를 뒤집고 긴 변 maxSide 안으로 줄인 ImageBitmap(새로 만든 것 — 다 쓰면 닫는다).
 * bitmap이 있으면 그것을, 없으면 data를 푼다. 크기를 알면 풀면서 줄이고, 모르면 푼 뒤 줄인다.
 */
export async function decodeTexture(t: Texture3d, maxSide: number): Promise<ImageBitmap> {
  if (typeof createImageBitmap !== 'function') throw new Error('createImageBitmap이 없습니다');
  if (t.bitmap) {
    const f = fitSize(t.bitmap.width, t.bitmap.height, maxSide);
    return createImageBitmap(t.bitmap, f ? { ...DECODE, resizeWidth: f.width, resizeHeight: f.height, resizeQuality: 'high' } : DECODE);
  }
  if (!t.data || !t.data.length) throw new Error('무늬 그림 바이트가 없습니다');
  const info = imageInfo(t.data);
  const mime = t.mime ?? info?.mime ?? 'application/octet-stream';
  const blob = new Blob([t.data as Uint8Array<ArrayBuffer>], { type: mime });
  const w = t.width ?? info?.width, h = t.height ?? info?.height;
  const known = w && h ? fitSize(w, h, maxSide) : null;
  if (known) return createImageBitmap(blob, { ...DECODE, resizeWidth: known.width, resizeHeight: known.height, resizeQuality: 'high' });
  const full = await createImageBitmap(blob, DECODE);
  const later = fitSize(full.width, full.height, maxSide);
  if (!later) return full;
  try {
    // 이미 뒤집었으므로 줄이기만 한다
    return await createImageBitmap(full, { premultiplyAlpha: 'none', colorSpaceConversion: 'none', resizeWidth: later.width, resizeHeight: later.height, resizeQuality: 'high' });
  } finally {
    full.close();
  }
}
