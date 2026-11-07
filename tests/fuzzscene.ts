/**
 * 0.50.0 장면 입력 견고성 퍼징(시험 도우미): 씨앗 고정으로 멀쩡한 장면(상자·삼각형 무리·선분·점)을 만들고, 앱이 깨진 파일에서 만들 수 있는 값
 * (NaN·±Infinity·1e38 넘는 좌표, 범위 밖·음수 색인, 길이가 3의 배수가 아닌 배열, 빈 배열, 법선 0, 짧은 색·식별 번호 배열, 이상한 행렬·원점·굵기)을
 * 한두 가지씩 넣는다. 같은 씨앗은 늘 같은 장면이다(시험이 실패하면 그 씨앗으로 다시 만든다).
 */
import type { Box3, LineSet3d, Mesh3d, PointSet3d, Rgba, Scene3d } from '../src/types';

/** mulberry32 — 씨앗 하나로 [0, 1) 수열 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 깨진 수(좌표 자리에 넣는다) */
export const BAD_NUMBERS = [NaN, Infinity, -Infinity, 1e38, -1e38, 3.4e38, -3.4e38, 1e300, -1e300, 1e-45] as const;

/** 그물·선분·점·장면에 넣는 깨진 값 종류 */
export const MESH_FAULTS = [
  'pos-nan',
  'pos-inf',
  'pos-big',
  'pos-allnan',
  'pos-len',
  'pos-empty',
  'idx-range',
  'idx-huge',
  'idx-len',
  'idx-empty',
  'nrm-zero',
  'nrm-nan',
  'nrm-len',
  'nrm-int8-len',
  'col-len',
  'col-nan',
  'col-range',
  'color-nan',
  'color-alpha',
  'color-short',
  'back-nan',
  'edges-len',
  'edges-nan',
  'uvs-len',
  'uvs-nan',
  'matrix-nan',
  'matrix-zero',
  'matrix-short',
  'matrix-inf',
  'matrix-big',
  'origin-nan',
  'origin-big',
  'origin-short',
  'billboard-nan',
  'closed-open',
  'degenerate',
  'dup-id',
] as const;
export const LINE_FAULTS = ['line-len', 'line-nan', 'line-inf', 'line-big', 'line-empty', 'line-ids-short', 'line-col-short', 'line-col-nan', 'line-width', 'line-origin-nan', 'line-allnan'] as const;
export const POINT_FAULTS = ['pt-len', 'pt-nan', 'pt-inf', 'pt-big', 'pt-empty', 'pt-ids-short', 'pt-size', 'pt-origin-nan', 'pt-allnan'] as const;
export const SCENE_FAULTS = ['bounds-nan', 'bounds-inv', 'bounds-inf', 'bounds-big', 'empty-scene'] as const;
export type Fault = (typeof MESH_FAULTS)[number] | (typeof LINE_FAULTS)[number] | (typeof POINT_FAULTS)[number] | (typeof SCENE_FAULTS)[number];

export interface FuzzCase {
  seed: number;
  scene: Scene3d;
  /** 넣은 깨진 값(항목 id:종류) */
  faults: string[];
}

type R = () => number;
const pick = <T>(r: R, a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
const int = (r: R, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

/** 축 나란 상자 그물(색인·법선·윤곽선) */
function box(id: string, r: R): Mesh3d {
  const c = [int(r, -50, 50), int(r, -50, 50), int(r, -10, 10)];
  const s = [int(r, 2, 30), int(r, 2, 30), int(r, 2, 30)];
  const P: number[] = [];
  for (let i = 0; i < 8; i++) P.push(c[0]! + (i & 1 ? s[0]! : 0), c[1]! + (i & 2 ? s[1]! : 0), c[2]! + (i & 4 ? s[2]! : 0));
  const I = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5];
  const N: number[] = [];
  for (let i = 0; i < 8; i++) N.push(i & 1 ? 0.577 : -0.577, i & 2 ? 0.577 : -0.577, i & 4 ? 0.577 : -0.577);
  const E: number[] = [];
  for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const)
    E.push(P[a * 3]!, P[a * 3 + 1]!, P[a * 3 + 2]!, P[b * 3]!, P[b * 3 + 1]!, P[b * 3 + 2]!);
  return {
    id,
    positions: new Float32Array(P),
    indices: new Uint32Array(I),
    normals: new Float32Array(N),
    edges: new Float32Array(E),
    color: [0.3 + r() * 0.6, 0.3 + r() * 0.6, 0.3 + r() * 0.6, r() < 0.15 ? 0.5 : 1],
    closed: true,
  };
}

/** 색인 없는 삼각형 무리(정점 색) */
function soup(id: string, r: R): Mesh3d {
  const n = int(r, 1, 40);
  const P = new Float32Array(n * 9);
  const C = new Float32Array(n * 3 * 4);
  for (let i = 0; i < n; i++) {
    const o = [int(r, -60, 60), int(r, -60, 60), int(r, -20, 20)];
    for (let k = 0; k < 3; k++) for (let a = 0; a < 3; a++) P[i * 9 + k * 3 + a] = o[a]! + r() * 10;
  }
  for (let i = 0; i < C.length; i++) C[i] = (i & 3) === 3 ? 1 : r();
  return { id, positions: P, colors: C, color: [0.7, 0.7, 0.7, 1], triangleEdges: r() < 0.5 };
}

function lines(id: string, r: R): LineSet3d {
  const n = int(r, 1, 60);
  const P = new Float32Array(n * 6);
  for (let i = 0; i < P.length; i++) P[i] = (r() - 0.5) * 120;
  const ids = new Uint32Array(n);
  for (let i = 0; i < n; i++) ids[i] = 100 + i;
  const l: LineSet3d = { id, positions: P, color: [0.2, 0.8, 1, 1], segmentIds: ids, width: pick(r, [1, 1, 2, 3]), dashed: r() < 0.2 };
  if (r() < 0.3) {
    const C = new Float32Array(n * 8);
    for (let i = 0; i < C.length; i++) C[i] = (i & 3) === 3 ? 1 : r();
    l.colors = C;
  }
  return l;
}

function points(id: string, r: R): PointSet3d {
  const n = int(r, 1, 50);
  const P = new Float32Array(n * 3);
  for (let i = 0; i < P.length; i++) P[i] = (r() - 0.5) * 100;
  const ids = new Uint32Array(n);
  for (let i = 0; i < n; i++) ids[i] = i * 2;
  return { id, positions: P, color: [1, 0.3, 0.2, 1], size: pick(r, [4, 6]), pointIds: ids };
}

/** 배열의 몇 자리(k개, 적어도 하나)를 v()로 바꾼 새 배열 */
function poke<T extends Float32Array | Float64Array>(a: T, r: R, v: () => number, k = 1 + Math.floor(r() * 4)): T {
  const b = a.slice() as T;
  if (!b.length) return b;
  for (let i = 0; i < k; i++) b[Math.floor(r() * b.length)] = v();
  return b;
}

function meshFault(m: Mesh3d, f: (typeof MESH_FAULTS)[number], r: R, other: string): Mesh3d {
  const nv = Math.floor(m.positions.length / 3);
  switch (f) {
    case 'pos-nan':
      return { ...m, positions: poke(m.positions, r, () => NaN) };
    case 'pos-inf':
      return { ...m, positions: poke(m.positions, r, () => pick(r, [Infinity, -Infinity, 1e300])) };
    case 'pos-big':
      return { ...m, positions: poke(m.positions, r, () => pick(r, [1e38, -1e38, 3.4e38, -3.4e38])) };
    case 'pos-allnan':
      return { ...m, positions: new Float32Array(m.positions.length).fill(NaN) };
    case 'pos-len':
      return { ...m, positions: m.positions.slice(0, Math.max(0, m.positions.length - int(r, 1, 2))) };
    case 'pos-empty':
      return { ...m, positions: new Float32Array(0) };
    case 'idx-range': {
      const I = (m.indices ?? Uint32Array.from({ length: nv - (nv % 3) }, (_, i) => i)).slice();
      for (let k = 0; k < 3 && I.length; k++) I[int(r, 0, I.length - 1)] = pick(r, [nv, nv + 1, nv + 1000, 0xffffffff, 0x7fffffff]);
      return { ...m, indices: I };
    }
    case 'idx-huge': {
      // −1을 Uint32로 넣은 것(0xffffffff)으로 모두 채운 색인
      const I = new Uint32Array(m.indices?.length ?? 36).fill(0xffffffff);
      return { ...m, indices: I };
    }
    case 'idx-len': {
      const I = m.indices ?? Uint32Array.from({ length: nv }, (_, i) => i);
      return { ...m, indices: I.slice(0, Math.max(0, I.length - int(r, 1, 2))) };
    }
    case 'idx-empty':
      return { ...m, indices: new Uint32Array(0) };
    case 'nrm-zero':
      return { ...m, normals: new Float32Array(nv * 3) };
    case 'nrm-nan':
      return { ...m, normals: poke(m.normals instanceof Float32Array ? m.normals : new Float32Array(nv * 3).fill(0.5), r, () => pick(r, [NaN, Infinity, 1e38]), 6) };
    case 'nrm-len':
      return { ...m, normals: new Float32Array(Math.max(0, nv * 3 - int(r, 1, 5))).fill(0.577) };
    case 'nrm-int8-len':
      return { ...m, normals: new Int8Array(Math.max(0, nv * 3 + pick(r, [-2, -1, 1, 2]))).fill(127) };
    case 'col-len':
      return { ...m, colors: new Float32Array(Math.max(0, nv * 4 - int(r, 1, 6))).fill(0.5) };
    case 'col-nan':
      return { ...m, colors: poke(m.colors ?? new Float32Array(nv * 4).fill(0.6), r, () => pick(r, [NaN, Infinity, -Infinity]), 6) };
    case 'col-range':
      return { ...m, colors: poke(m.colors ?? new Float32Array(nv * 4).fill(0.6), r, () => pick(r, [-5, 7, 1e38]), 6) };
    case 'color-nan':
      return { ...m, color: [NaN, NaN, NaN, NaN] };
    case 'color-alpha':
      return { ...m, color: [m.color[0], m.color[1], m.color[2], pick(r, [NaN, -1, 2, Infinity])] };
    case 'color-short':
      return { ...m, color: [0.5, 0.5, 0.5] as unknown as Rgba };
    case 'back-nan':
      return { ...m, backColor: [NaN, 0.5, Infinity, 1] };
    case 'edges-len':
      return { ...m, edges: (m.edges ?? new Float32Array(12).fill(1)).slice(0, Math.max(0, (m.edges?.length ?? 12) - int(r, 1, 5))) };
    case 'edges-nan':
      return { ...m, edges: poke(m.edges ?? new Float32Array([0, 0, 0, 1, 1, 1]), r, () => pick(r, BAD_NUMBERS), 4) };
    case 'uvs-len':
      return { ...m, uvs: new Float32Array(Math.max(0, nv * 2 - int(r, 1, 3))).fill(0.5), texture: 'tex-missing' };
    case 'uvs-nan':
      return { ...m, uvs: poke(new Float32Array(nv * 2).fill(0.5), r, () => NaN, 4), texture: 'tex-missing', normalTexture: 'tex-missing' };
    case 'matrix-nan':
      return { ...m, matrix: poke(Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), r, () => NaN, 2) };
    case 'matrix-zero':
      return { ...m, matrix: new Float64Array(16) };
    case 'matrix-short':
      return { ...m, matrix: Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]) };
    case 'matrix-inf':
      return { ...m, matrix: Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, Infinity, 0, -Infinity, 1]) };
    case 'matrix-big':
      return { ...m, matrix: Float64Array.from([1e30, 0, 0, 0, 0, 1e30, 0, 0, 0, 0, 1e30, 0, 0, 0, 0, 1]) };
    case 'origin-nan':
      return { ...m, origin: [NaN, 0, 0] };
    case 'origin-big':
      return { ...m, origin: [1e38, -1e38, 3.4e38] };
    case 'origin-short':
      return { ...m, origin: [5, 5] as unknown as [number, number, number] };
    case 'billboard-nan':
      return { ...m, billboard: { origin: [NaN, 0, Infinity], front: [0, 0, 0] } };
    case 'closed-open': {
      const I = (m.indices ?? Uint32Array.from({ length: nv - (nv % 3) }, (_, i) => i)).slice(0, -6);
      return { ...m, indices: I, closed: true, capGroup: 'cg' };
    }
    case 'degenerate': {
      const P = new Float32Array(m.positions.length);
      for (let i = 0; i < P.length; i++) P[i] = m.positions[i % 3]!;
      return { ...m, positions: P };
    }
    case 'dup-id':
      return { ...m, id: other };
  }
}

function lineFault(l: LineSet3d, f: (typeof LINE_FAULTS)[number], r: R): LineSet3d {
  const n = Math.floor(l.positions.length / 6);
  switch (f) {
    case 'line-len':
      return { ...l, positions: l.positions.slice(0, Math.max(0, l.positions.length - int(r, 1, 5))) };
    case 'line-nan':
      return { ...l, positions: poke(l.positions, r, () => NaN) };
    case 'line-inf':
      return { ...l, positions: poke(l.positions, r, () => pick(r, [Infinity, -Infinity, 1e300])) };
    case 'line-big':
      return { ...l, positions: poke(l.positions, r, () => pick(r, [1e38, -3.4e38])) };
    case 'line-empty':
      return { ...l, positions: new Float32Array(0) };
    case 'line-ids-short':
      return { ...l, segmentIds: l.segmentIds?.slice(0, Math.max(0, n - int(r, 1, 3))) ?? new Uint32Array(0) };
    case 'line-col-short':
      return { ...l, colors: new Float32Array(Math.max(0, n * 8 - int(r, 1, 7))).fill(0.4) };
    case 'line-col-nan':
      return { ...l, colors: poke(l.colors ?? new Float32Array(n * 8).fill(0.4), r, () => NaN, 4), color: [NaN, 0, 0, NaN] };
    case 'line-width':
      return { ...l, width: pick(r, [NaN, -1, 0, 1e9, Infinity]) };
    case 'line-origin-nan':
      return { ...l, origin: [0, NaN, 0] };
    case 'line-allnan':
      return { ...l, positions: new Float32Array(l.positions.length).fill(NaN) };
  }
}

function pointFault(p: PointSet3d, f: (typeof POINT_FAULTS)[number], r: R): PointSet3d {
  const n = Math.floor(p.positions.length / 3);
  switch (f) {
    case 'pt-len':
      return { ...p, positions: p.positions.slice(0, Math.max(0, p.positions.length - int(r, 1, 2))) };
    case 'pt-nan':
      return { ...p, positions: poke(p.positions, r, () => NaN) };
    case 'pt-inf':
      return { ...p, positions: poke(p.positions, r, () => pick(r, [Infinity, -Infinity])) };
    case 'pt-big':
      return { ...p, positions: poke(p.positions, r, () => pick(r, [1e38, -3.4e38])) };
    case 'pt-empty':
      return { ...p, positions: new Float32Array(0) };
    case 'pt-ids-short':
      return { ...p, pointIds: p.pointIds?.slice(0, Math.max(0, n - int(r, 1, 3))) ?? new Uint32Array(0) };
    case 'pt-size':
      return { ...p, size: pick(r, [NaN, -5, 0, 1e9, Infinity]) };
    case 'pt-origin-nan':
      return { ...p, origin: [Infinity, 0, 0] };
    case 'pt-allnan':
      return { ...p, positions: new Float32Array(p.positions.length).fill(NaN) };
  }
}

function sceneFault(s: Scene3d, f: (typeof SCENE_FAULTS)[number], r: R): Scene3d {
  switch (f) {
    case 'bounds-nan':
      return { ...s, bounds: { min: [NaN, 0, 0], max: [1, NaN, 1] } };
    case 'bounds-inv':
      return { ...s, bounds: { min: [10, 10, 10], max: [-10, -10, -10] } };
    case 'bounds-inf':
      return { ...s, bounds: { min: [-Infinity, 0, 0], max: [Infinity, 1, 1] } };
    case 'bounds-big':
      return { ...s, bounds: { min: [-3.4e38, -1e38, 0], max: [3.4e38, 1e38, r() * 10] } as Box3 };
    case 'empty-scene':
      return { ...s, meshes: [], lines: [], points: [] };
  }
}

/** 멀쩡한 장면(씨앗 고정) */
export function cleanScene(seed: number): Scene3d {
  const r = rng(seed * 7919 + 13);
  const meshes: Mesh3d[] = [];
  const nm = int(r, 1, 3);
  for (let i = 0; i < nm; i++) meshes.push(r() < 0.65 ? box(`m${i}`, r) : soup(`m${i}`, r));
  const ls: LineSet3d[] = [];
  for (let i = 0, n = int(r, 0, 2); i < n; i++) ls.push(lines(`l${i}`, r));
  const ps: PointSet3d[] = [];
  for (let i = 0, n = int(r, 0, 1); i < n; i++) ps.push(points(`p${i}`, r));
  return { name: `fuzz-${seed}`, units: 'mm', meshes, lines: ls, points: ps };
}

/**
 * 씨앗 하나 → 깨진 장면 하나: 멀쩡한 장면의 항목 하나~셋에 깨진 값 하나~둘씩, 가끔(10%) 장면 범위(bounds)·빈 장면.
 * only를 주면 그 종류만 고른다(원인별로 다시 만들 때)
 */
export function fuzzScene(seed: number, only?: readonly Fault[]): FuzzCase {
  const r = rng(seed);
  const s = cleanScene(seed);
  const faults: string[] = [];
  const allow = (f: string): boolean => !only || only.includes(f as Fault);
  const mf = MESH_FAULTS.filter(allow), lf = LINE_FAULTS.filter(allow), pf = POINT_FAULTS.filter(allow), sf = SCENE_FAULTS.filter(allow);
  const hits = int(r, 1, 3);
  for (let h = 0; h < hits; h++) {
    const kinds: ('m' | 'l' | 'p')[] = [];
    if (mf.length && s.meshes.length) kinds.push('m', 'm');
    if (lf.length && s.lines.length) kinds.push('l');
    if (pf.length && s.points?.length) kinds.push('p');
    if (!kinds.length) break;
    const k = pick(r, kinds);
    for (let j = 0, nf = int(r, 1, 2); j < nf; j++) {
      if (k === 'm') {
        const i = int(r, 0, s.meshes.length - 1);
        const f = pick(r, mf);
        const other = s.lines[0]?.id ?? s.meshes[(i + 1) % s.meshes.length]!.id;
        s.meshes[i] = meshFault(s.meshes[i]!, f, r, other);
        faults.push(`m${i}:${f}`);
      } else if (k === 'l') {
        const i = int(r, 0, s.lines.length - 1);
        const f = pick(r, lf);
        s.lines[i] = lineFault(s.lines[i]!, f, r);
        faults.push(`l${i}:${f}`);
      } else {
        const i = int(r, 0, s.points!.length - 1);
        const f = pick(r, pf);
        s.points![i] = pointFault(s.points![i]!, f, r);
        faults.push(`p${i}:${f}`);
      }
    }
  }
  if (sf.length && (r() < 0.1 || (only && !mf.length && !lf.length && !pf.length))) {
    const f = pick(r, sf);
    const t = sceneFault(s, f, r);
    s.meshes = t.meshes;
    s.lines = t.lines;
    s.points = t.points;
    if (t.bounds) s.bounds = t.bounds;
    faults.push(`scene:${f}`);
  }
  return { seed, scene: s, faults };
}

/** 아주 큰 그물(정점 n개 — 수백만): 좌표 몇 자리에 깨진 값, 색인 몇 자리가 범위 밖 */
export function hugeMesh(seed: number, n: number): Mesh3d {
  const r = rng(seed);
  const P = new Float32Array(n * 3);
  for (let i = 0; i < P.length; i++) P[i] = (r() - 0.5) * 1000;
  for (let k = 0; k < 8; k++) P[int(r, 0, P.length - 1)] = pick(r, BAD_NUMBERS);
  const I = new Uint32Array(n - (n % 3));
  for (let i = 0; i < I.length; i++) I[i] = i;
  for (let k = 0; k < 8; k++) I[int(r, 0, I.length - 1)] = n + k;
  return { id: 'huge', positions: P, indices: I, color: [0.6, 0.6, 0.6, 1] };
}
