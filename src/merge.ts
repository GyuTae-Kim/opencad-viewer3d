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
 * 여기에는 묶음 나누기(mergePlan)와 이은 배열 만들기(mergeArrays)만 둔다.
 */
import type { VertexArray } from './attribs';

/** 묶음 하나의 그물 수 한도(정점마다 그물 번호를 Uint16으로 둔다) */
export const MERGE_ITEMS = 65535;
/** 묶음 하나의 정점 수 한도(묶음 하나 굽기 — 이은 배열 만들기·올리기 — 가 한 프레임을 오래 붙잡지 않게) */
export const MERGE_VERTS = 262144;
/** 묶을 작은 그물의 정점 수 한도(이보다 큰 그물은 그물마다 — 그리기 호출 몫이 작다) */
export const MERGE_MESH_VERTS = 65536;
/** 묶을 그물의 윤곽선 선분 수 한도 */
export const MERGE_MESH_SEGMENTS = 65536;
/**
 * 'auto'(기본)에서 묶어 그리기를 켜는 문턱: 장면에 묶을 수 있는 그물이 이만큼 이상이면 켠다. 그물마다 GL 객체가 7개 남짓(버퍼 넷·VAO 셋)이라 2,000개면 1만 4천 개,
 * 그리기 호출은 면·윤곽선 4,000번(GPU 프로세스가 하나에 2.5 µs 남짓 — 프레임마다 10 ms)이다. 화소 회귀 장면은 모두 이보다 훨씬 작다(그림이 0.51.0과 같다)
 */
export const MERGE_AUTO_MIN = 2000;
/** 묶음 밖에 남은 묶을 수 있는 그물(바꾼 그물·새 그물)이 이만큼 모이면 그것들로 새 묶음을 굽는다 */
export const MERGE_LOOSE = 256;
/**
 * 장면을 올리는 동안 묶음을 굽는 단위: 기다리는 그물이 이만큼(또는 정점 MERGE_UPLOAD_VERTS개) 모이면 올리는 걸음 안에서 굽고 그물 버퍼·VAO를 놓는다 —
 * 그물마다 GL 객체(7개 남짓)가 한꺼번에 쌓이는 것은 이 수 × 7(1만 4천 개) 안쪽이다
 */
export const MERGE_UPLOAD_MESHES = 2048;
export const MERGE_UPLOAD_VERTS = 262144;
/** 묶음 안 바꾼·뺀 그물 몫이 이보다 크면 그 묶음을 풀고(남은 그물은 묶음 밖으로) 다시 굽는다 */
export const MERGE_DEAD_RATIO = 0.25;
/** 자리 자료 텍셀 수: 면 그물 하나 12(u_mvp 4·u_mv 4·u_nmat 3·u_color 1), 선 그물 하나 6(u_mvp 4·u_mvz 1·u_color 1) — 셰이더 mergeShader와 같다 */
export const MERGE_MESH_TEXELS = 12;
export const MERGE_LINE_TEXELS = 6;

/** 0.52.0 묶어 그리기 방식: 'auto' = 묶을 수 있는 그물이 문턱(min) 이상인 장면만, 'on' = 늘, 'off' = 끔(0.51.0 길) */
export type MergingMode = 'auto' | 'on' | 'off';

/** 0.52.0 묶어 그리기 선택(Renderer3d.merging — Viewer3d.setRenderOptions({ merging })) */
export interface MergingOptions {
  mode: MergingMode;
  /** 'auto' 문턱(묶을 수 있는 그물 수) */
  min: number;
}

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
  const col = list[0]?.colors ? new Float32Array(nv * 4) : null;
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
    if (col) {
      if (!s.colors) throw new Error('mergeArrays: 정점 색이 없는 그물');
      col.set(s.colors.subarray(0, s.nv * 4), v * 4);
    }
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
