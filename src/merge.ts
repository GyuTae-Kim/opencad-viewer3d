/**
 * 0.52.0 서로 다른 작은 정적 그물 묶어 그리기(MERGE — 순수 계산, GL은 모른다. 올리기·그리기는 renderer.ts).
 *
 * 서로 다른 배열을 가진 그물(서로 다른 부품 — 인스턴싱이 묶지 못한다)이 아주 많으면 맞춘 화면의 프레임은 그물마다 그리기 호출 몫이 대부분이다
 * (0.51.0 단계 나누기 — GPU 프로세스가 그리기 하나에 2.5 µs 남짓). 같은 꼴(법선 값 꼴·정점 색 유무·한쪽 면)의 작은 그물을 장면 차례로 버퍼 하나에 잇고
 * (로컬 좌표 그대로) 정점마다 묶음 안 그물 번호를 두면, 자리 행렬·색은 인스턴싱(INST)처럼 자리 자료 그림에서 읽어 잇단 그물들을 그리기 한 번으로 그린다.
 * 정점 값·삼각형 차례·행렬 float 값이 그물마다 그릴 때와 같아 그림이 같다(셰이더가 자료 그림에서 만든 행렬과 균일 행렬의 곱이 GPU에 따라 마지막 자리가
 * 다를 수 있는 것은 인스턴싱과 같다 — README 0.52.0). 묶은 그물의 그물마다 버퍼·VAO는 놓고 묶음 버퍼가 그 그물의 저장소가 된다(그물마다 그리는 길도 묶음 버퍼의
 * 그 그물 자리 — 색인 시작·정점 시작 — 로 그린다). 그래서 그물이 아주 많은 장면의 GL 객체 수가 그물 수가 아니라 묶음 수만큼이다.
 *
 * 여기에는 묶음 나누기(mergePlan, 0.53.0 굽기 단위로 고르게 나누기 mergeChunks)와 이은 배열 만들기(mergeArrays)만 둔다.
 * 0.54.0: 상수·선택 꼴은 작은 모듈 mergeopts.ts로 옮기고 여기서 다시 내보낸다 — 이 모듈은 굽기 조각(mergegl.ts)과 함께 렌더러가 import()로 받는다
 * (렌더러·뷰어·입구는 이 모듈의 값을 가져오지 않는다 — 가져오면 번들러가 이 모듈을 첫 화면 코어 조각에 둔다)
 */
import type { VertexArray } from './attribs';
import { MERGE_ITEMS, MERGE_UPLOAD_MESHES, MERGE_UPLOAD_VERTS, MERGE_VERTS } from './mergeopts';

export {
  MERGE_AUTO_MIN,
  MERGE_DEAD_RATIO,
  MERGE_ITEMS,
  MERGE_LINE_TEXELS,
  MERGE_LOOSE,
  MERGE_MESH_SEGMENTS,
  MERGE_MESH_TEXELS,
  MERGE_MESH_VERTS,
  MERGE_UPLOAD_MESHES,
  MERGE_UPLOAD_VERTS,
  MERGE_VERTS,
  type MergingMode,
  type MergingOptions,
} from './mergeopts';

/** 묶음 후보 하나(장면 차례): 묶음 열쇠(같은 열쇠끼리만 잇는다)·정점 수·묶음 버퍼 바이트 */
export interface MergeCand {
  key: string;
  nv: number;
  bytes: number;
}

/**
 * 장면 차례 후보를 열쇠마다 열린 묶음에 차례로 넣는다(그물 수·정점 수 한도를 넘으면 그 열쇠의 새 묶음). 버퍼 바이트 합이 maxBytes를 넘을 후보부터는 넣지 않는다.
 * 그물 하나뿐인 묶음은 버린다(묶어도 그리기 호출이 줄지 않는다). 돌려주는 것: 묶음마다 후보 번호(오름차순 — 장면 차례), 넣은 바이트 합
 */
export function mergePlan(cands: readonly MergeCand[], maxBytes: number, lim: { items: number; verts: number } = { items: MERGE_ITEMS, verts: MERGE_VERTS }): { groups: number[][]; bytes: number } {
  const open = new Map<string, { list: number[]; nv: number; bytes: number }>();
  const done: { list: number[]; bytes: number }[] = [];
  let total = 0;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i]!;
    if (!(c.nv > 0) || c.nv > lim.verts || !(c.bytes >= 0)) continue;
    if (total + c.bytes > maxBytes) break;
    let g = open.get(c.key);
    if (g && (g.list.length >= lim.items || g.nv + c.nv > lim.verts)) {
      done.push(g);
      g = undefined;
    }
    if (!g) open.set(c.key, (g = { list: [], nv: 0, bytes: 0 }));
    g.list.push(i);
    g.nv += c.nv;
    g.bytes += c.bytes;
    total += c.bytes;
  }
  for (const g of open.values()) done.push(g);
  const groups: number[][] = [];
  let bytes = 0;
  for (const g of done)
    if (g.list.length >= 2) {
      groups.push(g.list);
      bytes += g.bytes;
    }
  // 장면 차례(묶음 첫 그물)로 — 굽는 차례가 장면 차례를 따르게
  groups.sort((a, b) => a[0]! - b[0]!);
  return { groups, bytes };
}

/**
 * 0.53.0 한 열쇠의 장면 차례 토막을 굽기 단위(그물 lim.items개·정점 lim.verts개 — 기본 MERGE_UPLOAD_MESHES·MERGE_UPLOAD_VERTS, 장면을 올리는 걸음이 굽는 단위와 같다)로
 * 고르게 나눈다: 몇 묶음이 드는지(그물 수·정점 수 가운데 묶는 쪽으로 ⌈합 / 한도⌉) 센 뒤 그 수로 고르게 끊는다(그물마다 몫은 묶는 쪽 — 그물 1 또는 정점 수,
 * 그물의 가운데가 k번째 끊는 자리를 넘으면 다음 묶음). 묶음 하나는 늘 두 한도 안이다. 52차처럼 앞에서부터 꽉 채우면 끝 묶음이 그물 몇 개로 남아
 * (하나뿐이면 그물마다) 다시 굽기마다 작은 묶음·묶음 밖 그물이 는다. 정점이 없거나 정점 한도보다 큰 후보는 건너뛰고, 그물 하나뿐인 묶음은 버린다.
 * 돌려주는 것: 묶음마다 후보 번호(오름차순 — 장면 차례)
 */
export function mergeChunks(cands: readonly { nv: number }[], lim: { items: number; verts: number } = { items: MERGE_UPLOAD_MESHES, verts: MERGE_UPLOAD_VERTS }): number[][] {
  const ok: number[] = [];
  let items = 0, verts = 0;
  for (let i = 0; i < cands.length; i++) {
    const nv = cands[i]!.nv;
    if (!(nv > 0) || nv > lim.verts) continue;
    ok.push(i);
    items++;
    verts += nv;
  }
  if (items < 2) return [];
  const n = Math.max(1, Math.ceil(items / lim.items), Math.ceil(verts / lim.verts));
  const byVerts = verts / lim.verts > items / lim.items;
  const W = byVerts ? verts : items;
  const out: number[][] = [];
  let cur: number[] = [];
  let ci = 0, cv = 0, acc = 0, k = 1;
  for (const i of ok) {
    const nv = cands[i]!.nv;
    const x = byVerts ? nv : 1;
    const mid = acc + x / 2;
    if (cur.length && (ci + 1 > lim.items || cv + nv > lim.verts || (k < n && mid > (k * W) / n))) {
      out.push(cur);
      cur = [];
      ci = 0;
      cv = 0;
      while (k < n && mid > (k * W) / n) k++;
    }
    cur.push(i);
    ci++;
    cv += nv;
    acc += x;
  }
  if (cur.length) out.push(cur);
  return out.filter((g) => g.length >= 2);
}

/** 0.53.0 여러 열쇠가 섞인 장면 차례 후보를 열쇠마다 mergeChunks로 나눈다(묶음은 첫 후보 차례 — 장면 차례). 장면을 올리는 걸음의 굽기가 쓴다 */
export function mergeChunksByKey(cands: readonly MergeCand[], lim?: { items: number; verts: number }): number[][] {
  const byKey = new Map<string, number[]>();
  cands.forEach((c, i) => {
    let l = byKey.get(c.key);
    if (!l) byKey.set(c.key, (l = []));
    l.push(i);
  });
  const groups: number[][] = [];
  for (const idx of byKey.values()) for (const g of mergeChunks(idx.map((i) => cands[i]!), lim)) groups.push(g.map((j) => idx[j]!));
  groups.sort((a, b) => a[0]! - b[0]!);
  return groups;
}

/** 묶을 그물 하나의 자료(렌더러가 그물마다 올린 것과 같은 배열 — 위치·법선·색은 정점 nv개, 색인은 그리는 count개, 윤곽선은 선분 ns개) */
export interface MergeSrc {
  positions: Float32Array;
  nv: number;
  /** 법선(정점마다 per값 — 정수 법선 4값이면 넷째 값도 그대로 옮긴다). 없으면 null */
  normals: VertexArray | null;
  per: number;
  colors: Float32Array | null;
  /** 그리는 색인(깨진 삼각형을 고친 사본이면 그것). 없으면 0, 1, 2… */
  indices: Uint32Array | null;
  count: number;
  /** 윤곽선 선분 배열(깨진 끝점을 고친 사본이면 그것)과 선분 수 */
  edges: Float32Array | null;
  ns: number;
}

/** 이은 배열: 묶음 하나의 정점·색인·윤곽선과 그물마다 시작(n + 1개 — 그물 i는 [시작[i], 시작[i + 1])) */
export interface MergeArrays {
  pos: Float32Array;
  nrm: VertexArray | null;
  col: Float32Array | null;
  /** 정점마다 묶음 안 그물 번호 */
  item: Uint16Array;
  /** 묶음 정점 번호로 옮긴 색인(그물 차례·삼각형 차례 그대로) */
  idx: Uint32Array;
  /** 그물마다 색인 시작(색인 수 단위) */
  tri: Uint32Array;
  /** 그물마다 정점 시작(묶음 정점 번호 — 그물마다 그리기가 그물 색인을 묶음 정점으로 옮길 때) */
  vStart: Uint32Array;
  /** 윤곽선 선분(없으면 null)과 선분 끝점마다 그물 번호(선분 하나 = 두 값 — 가는 선은 정점마다, 굵은 선은 4바이트 간격으로 선분마다 읽는다) */
  seg: Float32Array | null;
  segItem: Uint16Array | null;
  /** 그물마다 선분 시작(선분 수 단위) */
  segStart: Uint32Array;
}

/**
 * 같은 꼴 그물들을 장면 차례로 잇는다: 위치·법선·색은 그대로 붙이고, 색인은 앞 그물들의 정점 수만큼 더한다(색인 없는 그물은 0, 1, 2…를 만든다).
 * 법선은 모두 같은 값 꼴이어야 한다(첫 그물의 배열 꼴로 만든다). 윤곽선은 있는 그물만 선분을 붙인다
 */
export function mergeArrays(list: readonly MergeSrc[]): MergeArrays {
  const n = list.length;
  let nv = 0, ni = 0, ns = 0;
  for (const s of list) {
    nv += s.nv;
    ni += s.count;
    ns += s.edges ? s.ns : 0;
  }
  if (n > MERGE_ITEMS) throw new Error(`mergeArrays: 그물 ${n}개는 한도(${MERGE_ITEMS}) 밖`);
  const pos = new Float32Array(nv * 3);
  const n0 = list[0]?.normals ?? null;
  const per = list[0]?.per ?? 3;
  const nrm: VertexArray | null = n0 ? new (n0.constructor as new (k: number) => VertexArray)(nv * per) : null;
  // 정점 색은 한 그물이라도 있으면 묶음 모두에(없는 그물 자리는 0 — 그 그물은 정점 색을 쓰지 않는다: 자리 자료의 정점 색 깃발·그물마다 u_vcol 0)
  const col = list.some((s) => !!s.colors) ? new Float32Array(nv * 4) : null;
  const item = new Uint16Array(nv);
  const idx = new Uint32Array(ni);
  const tri = new Uint32Array(n + 1);
  const vStart = new Uint32Array(n + 1);
  const seg = ns ? new Float32Array(ns * 6) : null;
  const segItem = ns ? new Uint16Array(ns * 2) : null;
  const segStart = new Uint32Array(n + 1);
  let v = 0, k = 0, e = 0;
  for (let i = 0; i < n; i++) {
    const s = list[i]!;
    pos.set(s.positions.subarray(0, s.nv * 3), v * 3);
    if (nrm) {
      if (!s.normals || s.per !== per) throw new Error('mergeArrays: 법선 꼴이 다른 그물');
      nrm.set(s.normals.subarray(0, s.nv * per) as never, v * per);
    }
    if (col && s.colors) col.set(s.colors.subarray(0, s.nv * 4), v * 4);
    item.fill(i, v, v + s.nv);
    tri[i] = k;
    vStart[i] = v;
    const I = s.indices;
    if (I) for (let j = 0; j < s.count; j++) idx[k + j] = I[j]! + v;
    else for (let j = 0; j < s.count; j++) idx[k + j] = v + j;
    k += s.count;
    segStart[i] = e;
    if (s.edges && seg && segItem) {
      seg.set(s.edges.subarray(0, s.ns * 6), e * 6);
      segItem.fill(i, e * 2, (e + s.ns) * 2);
      e += s.ns;
    }
    v += s.nv;
  }
  tri[n] = k;
  vStart[n] = v;
  segStart[n] = e;
  return { pos, nrm, col, item, idx, tri, vStart, seg, segItem, segStart };
}

/** 이은 배열의 GPU 버퍼 바이트(위치·법선·색·그물 번호·색인·윤곽선·선분 그물 번호) */
export function mergeBytes(a: Pick<MergeArrays, 'pos' | 'nrm' | 'col' | 'item' | 'idx' | 'seg' | 'segItem'>): number {
  return a.pos.byteLength + (a.nrm?.byteLength ?? 0) + (a.col?.byteLength ?? 0) + a.item.byteLength + a.idx.byteLength + (a.seg?.byteLength ?? 0) + (a.segItem?.byteLength ?? 0);
}

/** 그물 하나를 묶으면 더할 GPU 버퍼 바이트 어림(mergeBytes와 같은 셈 — 묶음 나누기 한도용) */
export function mergeSrcBytes(s: Pick<MergeSrc, 'nv' | 'normals' | 'per' | 'colors' | 'count' | 'edges' | 'ns'>): number {
  const nb = s.normals ? s.per * ((s.normals as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 4) : 0;
  return s.nv * (12 + nb + (s.colors ? 16 : 0) + 2) + s.count * 4 + (s.edges ? s.ns * 28 : 0);
}
