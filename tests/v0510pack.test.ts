/**
 * 0.51.0 packNormals·packUvs 빠른 셈: hypot3(V8 Math.hypot과 비트 같은 할당 없는 셈)과 축을 풀어 쓴 packUvs가 0.50.0과 같은 출력 바이트·같은 uvTransform을 내는지
 * (무작위·극값·0 길이·NaN·무한대·−0·짧은 배열). 0.50.0 셈은 이 파일에 그대로 옮겨 견준다.
 */
import { describe, expect, it } from 'vitest';
import { packNormals, packUvs } from '../src/attribs';
import { hypot3 } from '../src/math';
import type { UvTransform } from '../src/types';

/** 0.50.0 packNormals 그대로(견줄 기준) */
function packNormals050(n: ArrayLike<number>, type: 'int8' | 'int16' = 'int8', per: 3 | 4 = 4): Int8Array | Int16Array {
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

/** 0.50.0 packUvs 그대로(견줄 기준) */
function packUvs050(uvs: ArrayLike<number>, nv: number, type: 'int16' | 'uint16' = 'int16'): { uvs: Int16Array | Uint16Array; transform: UvTransform } {
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

/** 되풀이되는 의사 난수(xorshift32 — 0~1) */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

const SPECIAL = [0, -0, 1, -1, NaN, Infinity, -Infinity, Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, 2.2250738585072014e-308, 1e-300, 1e300, 1e154, 1.4e-45, 3.4e38, 0.5, 1 / 3];

/** 넓은 범위 값(부호·지수 고르게, 가끔 특수 값) */
function wide(r: () => number): number {
  const p = r();
  if (p < 0.08) return SPECIAL[Math.floor(r() * SPECIAL.length)]!;
  const m = r() * 2 - 1;
  if (p < 0.5) return m;
  const e = Math.floor(r() * 2098) - 1074;
  return m * 2 ** Math.min(1023, e);
}

describe('0.51.0 hypot3 — V8 Math.hypot과 비트 같음', () => {
  it('무작위 단위 크기·넓은 지수·특수 값 30만 짝이 Object.is로 같다', () => {
    const r = rng(51);
    let n = 0;
    for (let i = 0; i < 300_000; i++) {
      const x = i % 3 ? r() * 2 - 1 : wide(r), y = i % 5 ? r() * 2 - 1 : wide(r), z = i % 7 ? wide(r) : r() * 2 - 1;
      const a = hypot3(x, y, z), b = Math.hypot(x, y, z);
      if (!Object.is(a, b)) n++;
    }
    expect(n).toBe(0);
  });

  it('특수 값 모든 짝(0·−0·NaN·무한대·가장 작은·가장 큰 수)', () => {
    for (const x of SPECIAL) for (const y of SPECIAL) for (const z of SPECIAL) expect(Object.is(hypot3(x, y, z), Math.hypot(x, y, z))).toBe(true);
  });

  it('같은 크기·두 값만 큰 값·넘칠 듯한 값(정규화로 넘치지 않는다)', () => {
    const cases: [number, number, number][] = [
      [1, 1, 1],
      [3, 4, 0],
      [1e308, 1e308, 1e308],
      [1e-320, 1e-320, 0],
      [5e-324, 5e-324, 5e-324],
      [1, 1e-17, 1e-17],
      [0.1, 0.2, 0.3],
      [-0, -0, -0],
    ];
    for (const [x, y, z] of cases) expect(Object.is(hypot3(x, y, z), Math.hypot(x, y, z))).toBe(true);
    expect(hypot3(1e308, 1e308, 1e308)).toBeCloseTo(Math.sqrt(3) * 1e308, -300);
  });
});

describe('0.51.0 packNormals — 0.50.0과 같은 출력 바이트', () => {
  it('무작위 단위 법선·넓은 값·특수 값(Float32Array·보통 배열, int8·int16, 정점 3·4값)', () => {
    const r = rng(7);
    for (const len of [0, 1, 2, 3, 4, 299, 3000, 30_001]) {
      const plain = Array.from({ length: len }, (_, i) => (i % 11 === 0 ? wide(r) : r() * 2 - 1));
      const f32 = new Float32Array(plain);
      for (const src of [plain, f32])
        for (const type of ['int8', 'int16'] as const)
          for (const per of [3, 4] as const) {
            const a = packNormals(src, type, per), b = packNormals050(src, type, per);
            expect(a.constructor).toBe(b.constructor);
            expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
          }
    }
  });

  it('0 길이·NaN·무한대 법선은 0, 0, 0(0.50.0과 같다)', () => {
    const n = [0, 0, 0, NaN, 0, 1, Infinity, 0, 0, -0, -0, -0, 1e-320, 0, 0, 3.4e38, 3.4e38, 0];
    const a = packNormals(n), b = packNormals050(n);
    expect([...a]).toEqual([...b]);
    expect([...a.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  });
});

describe('0.51.0 packUvs — 0.50.0과 같은 출력 바이트·같은 uvTransform', () => {
  const same = (a: { uvs: Int16Array | Uint16Array; transform: UvTransform }, b: { uvs: Int16Array | Uint16Array; transform: UvTransform }): void => {
    expect(a.uvs.constructor).toBe(b.uvs.constructor);
    expect(Buffer.from(a.uvs.buffer).equals(Buffer.from(b.uvs.buffer))).toBe(true);
    for (let i = 0; i < 4; i++) expect(Object.is(a.transform[i], b.transform[i])).toBe(true);
  };

  it('무작위 2값·원근 3값(int16·uint16, Float32Array·보통 배열, 짧은 배열)', () => {
    const r = rng(9);
    for (const nv of [0, 1, 2, 7, 500, 20_000])
      for (const k of [2, 3])
        for (const short of [false, true]) {
          const len = short ? Math.max(0, nv * k - 3) : nv * k;
          const plain = Array.from({ length: len }, (_, i) => {
            if (k === 3 && i % 3 === 2) return i % 97 === 2 ? wide(r) : 0.25 + r() * 3 * (r() < 0.2 ? -1 : 1);
            return i % 13 === 0 ? wide(r) : r() * 20 - 5;
          });
          for (const src of [plain, new Float32Array(plain)]) for (const type of ['int16', 'uint16'] as const) same(packUvs(src, nv, type), packUvs050(src, nv, type));
        }
  });

  it('특수 값: 모두 같은 값·±0만·NaN q·0 q·음수 q·무한대·한 축만 유한', () => {
    const sets: [number[], number][] = [
      [[0, 0, 0, 0, 0, 0], 3],
      [[-0, -0, 0, -0, -0, 0], 3],
      [[0, -0, -0, 0], 2],
      [[-0, 0, 0, -0], 2],
      [[1, 2, NaN, 3, 4, 1, 5, 6, 2], 3],
      [[1, 2, 0, 3, 4, 1], 2],
      [[1, 2, 0, 3, 4, -2, 5, 6, 1], 3],
      [[Infinity, 1, -Infinity, 2, NaN, 3], 3],
      [[NaN, 1, NaN, 2, NaN, 3], 3],
      [[5, 5, 5, 5, 5, 5, 5, 5], 4],
      [[-0, 3, 0, 3, -0, 3], 3],
      [[1e300, -1e300, 1e-300, -1e-300], 2],
    ];
    for (const [a, nv] of sets) for (const type of ['int16', 'uint16'] as const) same(packUvs(a, nv, type), packUvs050(a, nv, type));
  });
});
