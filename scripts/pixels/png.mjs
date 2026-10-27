// @ts-check
/**
 * 의존성 없는 PNG 쓰기·읽기(8비트 RGB·RGBA, 비월 없음)와 두 그림 차이.
 * 화소 비교 도구가 화면 밖 그림의 RGBA를 그대로 PNG로 남기고, 다른 장면만 다시 읽어 차이 그림을 만든다.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** @type {Uint32Array | null} */
let crcTable = null;
/** @param {Uint8Array} buf */
export function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {string} type @param {Uint8Array} data */
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/**
 * RGBA(위에서 아래 줄) → PNG. 줄마다 왼쪽 차이(Sub) 거르기 — 단색 바탕·가로 기울기가 잘 줄어든다.
 * @param {number} width @param {number} height @param {Uint8Array} rgba
 */
export function encodePng(width, height, rgba) {
  if (rgba.length !== width * height * 4) throw new Error(`RGBA 길이 ${rgba.length} ≠ ${width}×${height}×4`);
  const row = width * 4;
  const raw = Buffer.alloc((row + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (row + 1), s = y * row;
    raw[o] = 1;
    for (let i = 0; i < row; i++) raw[o + 1 + i] = (rgba[s + i] - (i >= 4 ? rgba[s + i - 4] : 0)) & 0xff;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 비트 깊이
  ihdr[9] = 6; // RGBA
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}

/** @param {number} a @param {number} b @param {number} c */
function paeth(a, b, c) {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * PNG → { width, height, data: RGBA }. 8비트 RGB(2)·RGBA(6), 비월 없음만(이 도구와 Chrome이 쓰는 꼴).
 * @param {Uint8Array} buf
 * @returns {{ width: number; height: number; data: Uint8Array }}
 */
export function decodePng(buf) {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (!b.subarray(0, 8).equals(SIGNATURE)) throw new Error('PNG가 아닙니다');
  let pos = 8, width = 0, height = 0, ctype = 0;
  /** @type {Buffer[]} */
  const idat = [];
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString('ascii', pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      ctype = data[9];
      if (data[8] !== 8 || (ctype !== 2 && ctype !== 6) || data[12] !== 0) throw new Error(`지원하지 않는 PNG(깊이 ${data[8]}, 색 ${ctype}, 비월 ${data[12]})`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = ctype === 6 ? 4 : 3;
  const row = width * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length < (row + 1) * height) throw new Error('PNG 자료가 모자랍니다');
  const px = new Uint8Array(row * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (row + 1)];
    if (f > 4) throw new Error(`PNG 거르기 ${f}`);
    const src = y * (row + 1) + 1, dst = y * row, up = dst - row;
    for (let i = 0; i < row; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? px[dst + i - bpp] : 0;
      const u = y > 0 ? px[up + i] : 0;
      const c = i >= bpp && y > 0 ? px[up + i - bpp] : 0;
      px[dst + i] = (f === 0 ? x : f === 1 ? x + a : f === 2 ? x + u : f === 3 ? x + ((a + u) >> 1) : x + paeth(a, u, c)) & 0xff;
    }
  }
  if (bpp === 4) return { width, height, data: px };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    data[j] = px[i];
    data[j + 1] = px[i + 1];
    data[j + 2] = px[i + 2];
    data[j + 3] = 255;
  }
  return { width, height, data };
}

/**
 * 두 RGBA 그림의 차이. 크기가 다르면 sizeMismatch(차이 화소 = 큰 쪽 넓이).
 * 반환 그림: 같은 화소는 a를 흐린 회색으로, 다른 화소는 빨강(차이가 클수록 밝게)으로.
 * @param {{ width: number; height: number; data: Uint8Array }} a
 * @param {{ width: number; height: number; data: Uint8Array }} b
 */
export function diffImages(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { sizeMismatch: true, diffPixels: Math.max(a.width * a.height, b.width * b.height), maxDelta: 255, box: null, image: null };
  }
  const { width, height } = a;
  const out = new Uint8Array(width * height * 4);
  let diffPixels = 0, maxDelta = 0;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let i = 0, p = 0; i < a.data.length; i += 4, p++) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
      Math.abs(a.data[i + 3] - b.data[i + 3]),
    );
    if (d) {
      diffPixels++;
      if (d > maxDelta) maxDelta = d;
      const x = p % width, y = (p - x) / width;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      out[i] = 255;
      out[i + 1] = out[i + 2] = Math.max(0, 140 - d);
    } else {
      const g = Math.round((a.data[i] * 0.299 + a.data[i + 1] * 0.587 + a.data[i + 2] * 0.114) * 0.35 + 40);
      out[i] = out[i + 1] = out[i + 2] = g;
    }
    out[i + 3] = 255;
  }
  return {
    sizeMismatch: false,
    diffPixels,
    maxDelta,
    box: diffPixels ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null,
    image: { width, height, data: out },
  };
}
