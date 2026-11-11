/**
 * 0.54.0 묶어 그리기 굽기 조각(나눠 받는다 — 렌더러가 묶어 그리기를 켤 수 있는 장면에서만 import()로 받는다, SKP 57차 요청).
 *
 * 0.52.0~0.53.0에는 이 코드(묶음 나누기·다시 굽기 차례·이은 배열·묶음 GL 객체 만들기·자리 자료·MERGE 변종 정점 셰이더 글)가 렌더러에 있어
 * 문턱(묶을 수 있는 그물 2,000개)을 넘지 않는 앱도 첫 화면 코어 조각에 그만큼을 받았다. 이제 렌더러에는 상태(묶음·굽기 기다림)와 그리기 구간 모으기·
 * 훑기·묶을 수 있는지 판단만 두고, 굽기와 차례 정하기는 이 모듈 함수가 렌더러 상태(MergeHost — 렌더러 자신)를 받아 한다. 계산·GL 호출 차례는 0.53.0과 같다.
 *
 * 렌더러가 조각을 받는 때: 'on'이거나 'auto'에서 장면 그물이 문턱 이상일 때(setScene — 훑기 전, 받기와 첫 올리기 걸음이 겹친다), 'on'으로 바꿀 때,
 * 다 올린 뒤 묶음 밖 그물이 문턱만큼 모일 수 있을 때. 받는 동안은 그물마다 그리고(그림이 같다), 나눠 올리기는 굽지 못한 그물이 굽기 단위에 닿으면 멈춰
 * 기다린다(그물마다 GL 객체가 쌓이는 한도는 0.53.0과 같다). Viewer3d.preloadMerging()으로 미리 받을 수 있다.
 * 0.55.0: 'auto'는 setScene이 아니라 묶을 수 있는 그물이 문턱에 닿을 수 있다고 센 때(나눠 올리기는 올린 그물의 위 한계 셈 — 첫 걸음 안, 한 번에 올리기는 장면 훑기,
 * 다 올린 뒤에는 mergeStep이 planLoose와 같은 셈으로) 받기를 건다. 받기가
 * MERGE_KIT_WAIT_MS 안에 끝나지 않으면 그 페이지는 기다리지 않고 그물마다 이어 올린다(늦게 오면 그때부터 굽고, 기다리지 않고 올린 그물은 다 올린 뒤 planLoose가 묶는다).
 * 0.57.0: 곧장 굽기(direct·run·feed)·그리기 구간 그리기(drawFaces·drawEdges)·묶음 상태 지우기(free·leave·step)도 이 조각으로 옮겼다 — 렌더러에는 켤지 정하는 훑기·셈(mergeScan·mergeSrcOf)과 조각을 부르는 얇은 길만 둔다
 * 0.58.0: 곧장 구울 빛 기록을 걸음 사이에 들고 있다(mgHold — run·drain·unhold). 묶지 않을 그물이 끼어도, 걸음 몫을 넘어도 그물 버퍼로 돌아가지 않고, 굽기는 걸음 앞쪽에서 시작한다
 */
import type { AttribFormat } from './attribs';
import type { ViewFrame } from './camera';
import { mat4Mul, normalMatrix } from './math';
import { type MergeCand, type MergeSrc, mergeArrays, mergeBytes, mergeChunks, mergeChunksByKey, mergeSrcBytes } from './merge';
import {
  MERGE_DEAD_RATIO,
  MERGE_LINE_TEXELS,
  MERGE_LOOSE,
  MERGE_MESH_SEGMENTS,
  MERGE_MESH_TEXELS,
  MERGE_MESH_VERTS,
  MERGE_UPLOAD_MESHES,
  MERGE_UPLOAD_VERTS,
  type MergingOptions,
} from './mergeopts';
import { pbrSource } from './pbr';
import type { MeshArrays, MeshLayout, ReleaseFlags } from './release';
import type { GpuBufferPart, LineMemo, LineRec, MergeGroup, MergeRun, MeshRec, Prog, RenderState, RenderStats } from './renderer';
import { NO_CLIP, type Plane4 } from './section';
import type { Mesh3d, Rgba } from './types';
import { CHUNK_MIN_BYTES } from './upload';

/** 이 모듈이 쓰는 렌더러 상태·도움 함수(렌더러가 자신을 넘긴다 — 이름은 Renderer3d 멤버와 같다) */
export interface MergeHost {
  readonly gl: WebGL2RenderingContext;
  merging: MergingOptions;
  mgActive: boolean;
  meshes: MeshRec[];
  mgGroups: Set<MergeGroup>;
  mgQueue: MeshRec[][];
  mgBytes: number;
  mgWait: MeshRec[];
  mgWaitVerts: number;
  mgLight: number;
  mgHold: MeshRec[];
  mgDirty: boolean;
  readonly mgOff: boolean;
  mgScan: object | null;
  mgShared: WeakSet<object>;
  mergeBakeMs: number;
  mergeBudgetMs: number;
  renderMs: number;
  mergeStats: { draws: number; items: number };
  quadWide: WebGLBuffer;
  vaos: Set<WebGLVertexArrayObject>;
  keys: WeakMap<object, object>;
  instBuf: Float32Array;
  instM3: Float32Array;
  d4a: Float64Array;
  d4b: Float64Array;
  d4c: Float64Array;
  restoreQ: Map<string, MeshArrays>;
  laid: WeakMap<Mesh3d, MeshLayout>;
  rel: ReleaseFlags | null;
  mergeSrcOf(r: MeshRec): { src: MergeSrc; key: string } | null;
  mergeBake(list: readonly MeshRec[]): void;
  mergeVariant(base: 'mesh' | 'wide' | 'thin', defs: readonly string[]): Prog | null;
  mergeOffer(r: MeshRec): void;
  mergeUploadEnd(): void;
  meshRec(m: Mesh3d): MeshRec;
  sceneMeshRec(m: Mesh3d, o: { give?: MeshArrays | null; light?: boolean }): MeshRec;
  newBuffer(target: number, src: ArrayBufferView | number, usage: number, part: GpuBufferPart): WebGLBuffer;
  dropBuffer(b: WebGLBuffer): void;
  glType(f: AttribFormat): number;
  dropParts(rec: object): void;
  freeKey(key: object, target: 'element'): void;
  release(slots: readonly unknown[]): void;
  loc(p: Prog, name: string): WebGLUniformLocation | null;
  instReserve(texels: number): boolean;
  instPut(texels: number): number;
  drawLines(f: ViewFrame, r: LineRec, model: ArrayLike<number> | undefined, o: object, st: RenderState, stats: RenderStats, memo: LineMemo | null): void;
}

/** 0.57.0 묶어 그리는 목록의 항목 하나 — 묶음 구간(MergeRun) 또는 그물마다 그리기 */
export type MergeOp = MergeRun | (() => void);

/**
 * 0.57.0 구간 그리기(drawFaces·drawEdges)가 render()에서 받는 것: 프레임 값과 프로그램·뒷면 버리기 기억을 건드리는 함수.
 * GL 호출 차례는 0.56.0 render() 안의 mergeFaces·mergeLines와 같다
 */
export interface MergeDrawCtx {
  f: ViewFrame;
  st: RenderState;
  stats: RenderStats;
  mm(r: MeshRec): ArrayLike<number> | undefined;
  /** 단면 하나(있으면 면 자리에 로컬 평면을 싣는다) */
  sec: object | null;
  clipOf(model: ArrayLike<number> | undefined): Readonly<Plane4> | null;
  shadowOn: boolean;
  shadowVp: ArrayLike<number> | null;
  meshExtra: readonly string[];
  hiTint: Rgba;
  /** 그 프로그램이 아니면 바꾼다(meshUse) */
  use(p: Prog): void;
  flagsNew(vcol: boolean, nrm: boolean, tint: number, alpha: number): boolean;
  /** 뒷면 버리기 켜고 끄기(기억이 다를 때만) */
  cullTo(c: boolean): void;
  drawParts(r: MeshRec, color: Rgba, alpha: number, tint: number, cull: boolean): void;
  instUnit: number;
  dash: readonly [number, number];
}

/**
 * 0.52.0 굽기를 기다리는 그물을 묶음으로 나눠 곧 굽는다(묶음에 들지 못한 그물은 그물마다 버퍼 그대로).
 * 0.53.0: 열쇠마다 굽기 단위로 고르게 나눈다(mergeChunksByKey — 정점이 많아 한 단위를 넘으면 끝 묶음이 그물 하나로 남아 그물마다 남지 않게).
 * 0.57.0: 묶음에 들지 못한 빛 기록(그물 하나뿐인 묶음·열쇠가 다른 그물 — 0.56.0과 같은 판정)은 여기서 그물 버퍼를 만든다
 */
export function flushWait(h: MergeHost): void {
  const recs = h.mgWait;
  h.mgWait = [];
  h.mgWaitVerts = 0;
  if (recs.length >= 2) {
    const t0 = performance.now();
    const keep: MeshRec[] = [];
    const cands: MergeCand[] = [];
    for (const r of recs) {
      const s = r.dropped || r.mg ? null : h.mergeSrcOf(r);
      if (!s) continue;
      keep.push(r);
      cands.push({ key: s.key, nv: s.src.nv, bytes: mergeSrcBytes(s.src) });
    }
    for (const g of mergeChunksByKey(cands)) h.mergeBake(g.map((i) => keep[i]!));
    h.gl.bindVertexArray(null);
    h.mergeBakeMs += performance.now() - t0;
  }
  if (h.mgLight) settle(h, recs);
}

/**
 * 0.52.0 장면을 올리는 동안 올린 그물 하나: 이 장면에서 묶어 그리기를 켰고 묶을 수 있으면 굽기 기다림에 넣고, 그물 2,048개·정점 262,144개만큼 모이면 곧 굽는다.
 * 0.53.0: 정점 한도는 넘기 전에(이 그물을 더하면 넘을 때 먼저) 굽는다 — 기다림 하나가 늘 굽기 단위 안이라 열쇠마다 묶음 하나.
 * 0.57.0: 곧장 굽겠다던 기록(빛 기록)이 묶을 수 없는 그물로 드러나면(정점 색 반투명 등 — direct의 어림 밖) 그때 그물 버퍼를 만든다
 */
export function feed(h: MergeHost, r: MeshRec): void {
  const s = h.mgActive && !h.mgOff ? h.mergeSrcOf(r) : null;
  if (!s) {
    if (r.light) solid(h, r);
    return;
  }
  if (h.mgWait.length && h.mgWaitVerts + s.src.nv > MERGE_UPLOAD_VERTS) flushWait(h);
  h.mgWait.push(r);
  h.mgWaitVerts += s.src.nv;
  if (r.light) h.mgLight++;
  if (h.mgWait.length >= MERGE_UPLOAD_MESHES || h.mgWaitVerts >= MERGE_UPLOAD_VERTS) flushWait(h);
}

/** 0.57.0 빛 기록에 그물 버퍼·VAO를 만들어 준다(묶음에 들지 못해 그물마다 그리는 길로 떨어질 때 — 같은 배열로 만들어 기록 값·쓰는 기록 수는 그대로) */
function solid(h: MergeHost, r: MeshRec): void {
  Object.assign(r, h.meshRec(r.src), { light: false });
  h.gl.bindVertexArray(null);
}

/** 0.57.0 목록의 남은 빛 기록을 모두 그물 버퍼로(flushWait 뒤·run을 묶음 전에 끝낼 때) */
function settle(h: MergeHost, list: readonly MeshRec[]): void {
  h.mgLight = 0;
  for (const r of list) if (r.light) solid(h, r);
}

/** 0.57.0 그물 배열 바이트 합이 조각 올리기 문턱 안인지(uploadSome이 chunkFor로 나눠 올리지 않을 크기 — 같은 배열·이미 올린 배열을 빼지 않은 위 한계) */
function small(m: Mesh3d): boolean {
  let n = 0;
  for (const a of [m.positions, m.normals, m.colors, m.uvs, m.backUvs, m.indices, m.edges]) n += a?.byteLength ?? 0;
  return n <= CHUNK_MIN_BYTES;
}

/**
 * 0.57.0 이 그물을 그물마다 GL 객체 없이 곧장 구울지(빛 기록 — 렌더러 meshRec light): 이 장면에서 켜졌고 훑기를 마쳤을 때(훑기 전·중은 묶일지 모른다 — 첫 그림을 그물마다 그린다).
 * 앱이 다시 준 배열을 함께 올릴 그물(restoreQ)·코어가 전에 지운 그물(laid — 올린 꼴과 다시 받을 것을 세는 길)·놓기가 법선을 지울 그물(0.56.0도 묶이지 않는다)은 그물마다 길로,
 * 조각 올리기(CHUNK_MIN_BYTES)를 탈 크기가 아니고 훑기가 묶을 수 있어 보인다고 세는 그물일 때만. 어림과 mergeSrcOf(정점 색 반투명 등)가 갈리면 feed가 그 자리에서 그물 버퍼를 만든다.
 * 조각이 있을 때만 부른다(받기 전·늦음·실패는 렌더러가 그물마다 길로)
 */
export function direct(h: MergeHost, m: Mesh3d): boolean {
  if (!h.mgActive || h.mgScan || h.mgOff || h.restoreQ.has(m.id) || h.laid.has(m) || (h.rel?.normals && m.normals)) return false;
  const nv = Math.floor(m.positions.length / 3);
  if (!nv || nv > MERGE_MESH_VERTS || m.texture || m.backTexture || m.backColor || pbrSource(m) || !(m.color[3] >= 0.999)) return false;
  if ((m.edges ? m.edges.length / 6 : 0) > MERGE_MESH_SEGMENTS) return false;
  return ![m.positions, m.normals, m.indices, m.colors, m.edges].some((a) => !!a && h.mgShared.has(a)) && small(m);
}

/**
 * 0.58.0 mgHold의 맨 앞부터 구웠거나 그물 버퍼가 된 기록을 보이는 목록(meshes)으로 옮긴다. 맨 앞이 아직 빛 기록이면 그대로 둔다 —
 * 들고 있는 기록은 장면 차례 그대로라, 차례를 지키려면 앞선 빛 기록이 구워질 때까지 뒤의 그물 버퍼 기록도 함께 기다린다
 */
export function drain(h: MergeHost): void {
  const H = h.mgHold;
  if (!H.length || H[0]!.light) return;
  let n = 1;
  while (n < H.length && !H[n]!.light) n++;
  for (let i = 0; i < n; i++) h.meshes.push(H[i]!);
  if (n === H.length) H.length = 0;
  else H.splice(0, n);
}

/**
 * 0.58.0 들고 있던 빛 기록을 모두 그물 버퍼로 돌리고 보이는 목록으로 옮긴다(걸음 사이에 앱이 setMesh·removeMesh·restoreMeshArrays를 부를 때, 묶어 그리기를 끌 때 —
 * 렌더러의 그물 기록을 찾는 길은 모두 meshes를 본다). 그물들은 기다림에 남아 다음 굽기가 그대로 묶는다(묶음 나누기가 같다)
 */
export function unhold(h: MergeHost): void {
  if (!h.mgHold.length) return;
  settle(h, h.mgHold);
  h.gl.bindVertexArray(null);
  drain(h);
}

/**
 * 0.57.0 나눠 올리는 걸음에서 곧장 구울 그물(direct)을 잇는다: 빛 기록을 만들어 기다림에 넣고 단위가 차면 곧 굽는다.
 * 0.58.0: 빛 기록을 걸음 사이에 들고 있는다(mgHold — 그리기·고르기가 보는 meshes 밖). 0.57.0은 몫을 넘었거나 큰 그물·묶지 않을 그물이 끼면 그때까지의 기록을 그물 버퍼로 돌렸다
 * (반투명 500개마다 하나로 1만 걸음 안 버퍼 6,523). 이제 몫이 다하면 들고 돌아가고, 다음 걸음이 잇는다. 끼어든 그물은 렌더러의 그물마다 길로 올라가 차례를 지켜 함께 기다린다.
 * 다음 그물이 굽기를 부를 듯하고 이 걸음 몫을 절반 넘게 썼으면(fresh가 아닐 때) 다음 걸음 처음으로 미룬다(굽기가 걸음 몫 끝에 겹치지 않게 — 버퍼 잡기를 미루는 것과 같은 판단).
 * 미뤘으면 true(이번 걸음에서 더 올리지 않는다). 다 올리면 남은 기다림을 굽고 들고 있던 기록이 모두 보인다
 */
export function run(h: MergeHost, p: { scene: { meshes: readonly Mesh3d[] }; mi: number }, t0: number, budgetMs: number, fresh: boolean): boolean {
  const ms = p.scene.meshes;
  let m = ms[p.mi]!;
  let light = direct(h, m);
  for (;;) {
    if (!fresh && willBake(h, m, p.mi + 1 >= ms.length) && performance.now() - t0 > budgetMs / 2) return true;
    fresh = false;
    const give = h.restoreQ.get(m.id) ?? null;
    h.restoreQ.delete(m.id);
    const r = h.sceneMeshRec(m, { give, light });
    (light || h.mgHold.length ? h.mgHold : h.meshes).push(r);
    p.mi++;
    h.mergeOffer(r);
    if (p.mi >= ms.length) h.mergeUploadEnd();
    drain(h);
    if (p.mi >= ms.length || performance.now() - t0 >= budgetMs) return false;
    m = ms[p.mi]!;
    light = direct(h, m);
    if (!light) return false;
  }
}

/** 0.58.0 다음 그물을 올리면 굽기가 일어날 듯한지(단위가 차거나 장면 끝 — feed·mergeUploadEnd와 같은 셈, 미루는 판단에만 쓴다. 묶음 나누기를 바꾸지 않는다) */
function willBake(h: MergeHost, next: Mesh3d, last: boolean): boolean {
  if (!h.mgWait.length) return false;
  return last || h.mgWait.length + 1 >= MERGE_UPLOAD_MESHES || h.mgWaitVerts + Math.floor(next.positions.length / 3) >= MERGE_UPLOAD_VERTS;
}

/** 0.54.0 다 올린 장면의 프레임마다 굽기(렌더러 mergeStep — 조각이 있을 때): 살필 것이 있으면 먼저 차례를 정하고 몫(mergeBudgetMs와 지난 그리기 시간 가운데 큰 것 — 적어도 묶음 하나) 안에서 굽는다 */
export function step(h: MergeHost): void {
  if (h.mgDirty && !h.mgQueue.length) {
    h.mgDirty = false;
    planLoose(h);
  }
  if (!h.mgQueue.length) return;
  const t0 = performance.now();
  let first = true;
  // 몫은 지난 장면 그리기 시간보다 짧지 않게(굽기를 기다리는 그물은 그물마다 그리므로 그리기가 비싼 큰 장면일수록 한 번에 더 굽는다 — 프레임 수가 그리기 시간에 묶이지 않게)
  const budget = Math.max(h.mergeBudgetMs, h.renderMs);
  while (h.mgQueue.length && (first || performance.now() - t0 < budget)) {
    first = false;
    h.mergeBake(h.mgQueue.shift()!);
  }
  h.gl.bindVertexArray(null);
  h.mergeBakeMs += performance.now() - t0;
}

/** 0.52.0 묶음의 버퍼·VAO를 지운다(쓰는 그물 기록이 없을 때 — lost면 잊기만) */
export function free(h: MergeHost, g: MergeGroup, lost: boolean): void {
  if (!h.mgGroups.delete(g)) return;
  h.mgBytes -= g.bytes;
  if (lost) return;
  const gl = h.gl;
  for (const v of [g.vao, g.thin, g.wide]) if (v) gl.deleteVertexArray(v);
  for (const b of g.bufs) h.dropBuffer(b);
}

/** 0.52.0 그물 기록 하나가 묶음 저장소를 그만 쓴다(장면에서 빠지거나 다른 묶음·그물마다 버퍼로 옮김) — 쓰는 기록이 없으면 묶음을 지운다 */
function letGo(h: MergeHost, r: MeshRec): void {
  const g = r.mg;
  if (!g) return;
  r.mg = null;
  if (--g.live <= 0) free(h, g, false);
}

/** 0.52.0 묶음에 든 그물 기록이 장면에서 빠진다(그물을 바꾸거나 뺄 때): 묶음의 빠진 그물 수를 세고 놓는다(다시 굽기는 planLoose가 장면 차례 토막으로) */
export function leave(h: MergeHost, r: MeshRec): void {
  r.mg!.dead++;
  letGo(h, r);
}

/** 0.52.0 묶음 굵은 선 VAO(묶여 있어야 함)의 인스턴스 속성을 first번째 선분부터로 건다(bindWide와 같은 꼴 + 선분마다 그물 번호 — 위치 5) */
function wideAt(h: MergeHost, seg: WebGLBuffer, item: WebGLBuffer, first: number): void {
  const gl = h.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, seg);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, first * 24);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 24, first * 24 + 12);
  gl.vertexAttribDivisor(2, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, item);
  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 1, gl.UNSIGNED_SHORT, false, 4, first * 4);
  gl.vertexAttribDivisor(5, 1);
}

/** 자리 자료를 구간 차례로 이어 instBuf에 쓰고 한 번에 올린다(구간마다 u_instBase). 자리 자료 그림에 들어가지 않으면 false(그물마다 그린다) */
function putRuns(h: MergeHost, runs: readonly MergeRun[], texels: number, put: (u: MergeRun, i: number, k: number) => void): boolean {
  let n = 0;
  for (const u of runs) n += u.b - u.a;
  if (!n || !h.instReserve(n * texels)) return false;
  let k = 0;
  for (const u of runs) for (let i = u.a; i < u.b; i++, k++) put(u, i, k);
  const base = h.instPut(n * texels);
  k = 0;
  for (const u of runs) {
    u.base = base + (k - u.a) * texels;
    k += u.b - u.a;
  }
  return true;
}

/**
 * 0.52.0 면 목록을 그린다: 묶음 구간은 MERGE 변종으로 그 색인 구간 그리기 한 번, 그물마다는 그대로. 변종이 아직 번역 중이거나 자리 자료가 모자라면
 * 구간도 그물마다(plain — 그 그물을 그물마다 그릴 때의 프로그램)로 그린다(같은 그림). 0.53.0 그림자(SHADOW — 깊이 그림을 그린 뒤)·단면 하나(CLIP)도 묶음 변종으로:
 * 그물마다 그릴 때(progFor)와 같은 정의, 자리마다 그림자 행렬·로컬 평면을 자리 자료에. 0.57.0 render() 안에서 이 조각으로 옮김(GL 호출 차례는 같다)
 */
export function drawFaces(h: MergeHost, c: MergeDrawCtx, ops: readonly MergeOp[], plain: (r: MeshRec) => Prog): void {
  const gl = h.gl, stats = c.stats;
  const runs = ops.filter((o): o is MergeRun => typeof o !== 'function');
  const stride = MERGE_MESH_TEXELS + (c.shadowOn ? 4 : 0) + (c.sec ? 1 : 0);
  const p = runs.length ? h.mergeVariant('mesh', [...c.meshExtra, ...(c.shadowOn ? ['SHADOW'] : []), ...(c.sec ? ['CLIP'] : [])]) : null;
  const ok =
    !!p &&
    (!c.shadowOn || !!c.shadowVp) &&
    putRuns(h, runs, stride, (u, i, k) => faceTexels(h, c.f, c.mm(u.g.recs[i]!), u.cols[i - u.a]!, u.vc[i - u.a]!, k, stride, c.shadowVp, c.sec ? c.clipOf : null));
  for (const op of ops) {
    if (typeof op === 'function') {
      op();
      continue;
    }
    if (!ok) {
      for (let i = op.a; i < op.b; i++) {
        const r = op.g.recs[i]!;
        c.use(plain(r));
        c.drawParts(r, op.cols[i - op.a]!, op.alpha, op.tint, op.g.cull);
      }
      continue;
    }
    c.use(p!);
    gl.uniform1i(h.loc(p!, 'u_instBase'), op.base);
    if (p!.shadow || p!.clip1) gl.uniform1i(h.loc(p!, 'u_instStride'), stride);
    // 정점 색 쓰기는 자리 자료 깃발이라 균일 변수 u_vcol이 없다(기억에는 false로)
    if (c.flagsNew(false, op.g.hasNormals, op.tint, op.alpha)) {
      gl.uniform1f(h.loc(p!, 'u_hasNrm'), op.g.hasNormals ? 1 : 0);
      gl.uniform4f(h.loc(p!, 'u_tint'), c.hiTint[0], c.hiTint[1], c.hiTint[2], op.tint);
      gl.uniform1f(h.loc(p!, 'u_alpha'), op.alpha);
    }
    c.cullTo(op.g.cull);
    const t0 = op.g.tri[op.a]!, t1 = op.g.tri[op.b]!;
    gl.bindVertexArray(op.g.vao);
    gl.drawElements(gl.TRIANGLES, t1 - t0, gl.UNSIGNED_INT, t0 * 4);
    stats.drawCalls++;
    stats.triangles += (t1 - t0) / 3;
    h.mergeStats.draws++;
    h.mergeStats.items += op.b - op.a;
  }
}

/**
 * 0.52.0 선 목록을 그린다(그물 윤곽선 — 1화소 굵기 1, 숨은 점선이면 dash): 묶음 구간은 MERGE 변종(가는 선·굵은 선 — drawLines와 같은 판정·균일 변수, 선 색은 자리 자료)으로
 * 그 선분 구간 그리기 한 번. 변종이 번역 중이거나 자리 자료가 모자라면 구간도 그물마다 drawLines로. 0.57.0 render() 안에서 이 조각으로 옮김(GL 호출 차례는 같다)
 */
export function drawEdges(h: MergeHost, c: MergeDrawCtx, ops: readonly MergeOp[], o: { dashed: boolean; bias: number; capz: boolean }, memo: LineMemo | null): void {
  const gl = h.gl, st = c.st, stats = c.stats;
  const runs = ops.filter((x): x is MergeRun => typeof x !== 'function');
  const wDev = st.dpr;
  const wide = o.dashed || wDev > 1.01;
  const lineFog = st.fog ?? null;
  const p = runs.length ? h.mergeVariant(wide ? 'wide' : 'thin', [...(wide && o.capz ? ['CAPZ'] : []), ...(lineFog ? ['FOG'] : [])]) : null;
  const ok = !!p && putRuns(h, runs, MERGE_LINE_TEXELS, (u, i, k) => lineTexels(h, c.f, c.mm(u.g.recs[i]!), u.cols[i - u.a]!, !!lineFog, k));
  let set = false;
  for (const op of ops) {
    if (typeof op === 'function') {
      op();
      set = false;
      continue;
    }
    if (!ok) {
      for (let i = op.a; i < op.b; i++) {
        const r = op.g.recs[i]!;
        const e = { color: op.cols[i - op.a]!, vcol: false, width: 1, dashed: o.dashed, alpha: op.alpha, clip: null, clips: null, first: 0, count: r.edges!.n };
        h.drawLines(c.f, r.edges!, c.mm(r), o.capz ? { ...e, bias: o.bias, capz: true } : e, st, stats, memo);
      }
      continue;
    }
    const P = p!;
    if (!set) {
      // drawLines와 같은 고정 균일 변수(선 색은 자리 자료 — 안개 깊이 행도)
      set = true;
      gl.useProgram(P.p);
      gl.uniform1i(h.loc(P, 'u_inst'), c.instUnit);
      gl.uniform1f(h.loc(P, 'u_vcol'), 0);
      gl.uniform4f(h.loc(P, 'u_override'), 0, 0, 0, 0);
      gl.uniform1f(h.loc(P, 'u_bias'), o.bias);
      if (wide) {
        const vw = st.viewport ? st.viewport[0] : gl.drawingBufferWidth, vh = st.viewport ? st.viewport[1] : gl.drawingBufferHeight;
        gl.uniform2f(h.loc(P, 'u_viewport'), vw, vh);
        gl.uniform1f(h.loc(P, 'u_width'), wDev);
        gl.uniform2f(h.loc(P, 'u_dash'), o.dashed ? c.dash[0] * st.dpr : 0, c.dash[1] * st.dpr);
        gl.uniform4f(h.loc(P, 'u_clip'), NO_CLIP[0], NO_CLIP[1], NO_CLIP[2], NO_CLIP[3]);
      }
      if (lineFog) {
        gl.uniform4f(h.loc(P, 'u_fogCol'), lineFog.color[0], lineFog.color[1], lineFog.color[2], 1);
        gl.uniform2f(h.loc(P, 'u_fog'), lineFog.start, lineFog.end);
      }
    }
    gl.uniform1i(h.loc(P, 'u_instBase'), op.base);
    gl.uniform1f(h.loc(P, 'u_alpha'), op.alpha);
    const g = op.g;
    const s0 = g.seg[op.a]!, s1 = g.seg[op.b]!;
    if (wide) {
      gl.bindVertexArray(g.wide);
      wideAt(h, g.segBuf!, g.segItem!, s0);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, s1 - s0);
    } else {
      gl.bindVertexArray(g.thin);
      gl.drawArrays(gl.LINES, s0 * 2, (s1 - s0) * 2);
    }
    if (memo) memo.p = null;
    stats.drawCalls++;
    stats.segments += s1 - s0;
    h.mergeStats.draws++;
    h.mergeStats.items += op.b - op.a;
  }
}

/**
 * 0.52.0 묶을 그물을 장면 차례로 훑어 굽기 줄을 정한다. 'auto'에서 아직 켜지지 않았으면 묶을 수 있는 그물이 문턱 이상일 때 켠다.
 * 0.53.0 다시 굽기 차례: 52차는 묶음 밖 그물(바꾼 그물·새 그물)끼리 새 묶음을 구워 옛 묶음과 장면 차례로 엇갈렸다(구간이 짧아져 1만에서 20%를 바꾸면 그리기 4,006).
 * 이제 열쇠마다 장면 차례 줄(묶을 수 있는 그물 — 묶음 안·밖)을 훑어, 깨끗한 묶음(빠진 그물이 없고, 그 묶음 그물 사이에 다른 그물이 끼지 않았고, 묶음 밖 그물을
 * 거느리지 않은 것 — 묶음 밖 그물은 줄에서 바로 앞 묶음이, 줄 맨 앞 것은 첫 묶음이 거느린다)은 두고, 나머지(더럽혀진 묶음의 산 그물과 묶음 밖 그물)를 잇단 토막마다
 * 굽기 단위(그물 2,048개·정점 262,144개 — 장면을 올리는 걸음과 같다)로 고르게 나눠(mergeChunks) 줄에 넣는다. 묶음 합치기: 토막 양옆의 깨끗한 묶음은 함께 다시 구워도
 * 묶음 수가 늘지 않으면(토막만 나누면 끝 묶음이 하나 더 생길 때) 토막에 붙인다. 그래서 묶음이 장면 차례로 엇갈리지 않아 구간·그리기 호출·GL 객체 수가 처음 굽기 수준으로 돌아온다.
 * 다시 굽는 때: 묶음이 없으면 모두, 묶음 밖 그물 + 빠진 그물이 MERGE_LOOSE(256)개 이상이면 더럽혀진 토막 모두, 아니면 한 묶음의 빠진·낀·거느린 그물이
 * ¼을 넘는 토막만(바꾼 그물 몇 개로 굽기를 되풀이하지 않게). 굽기 하나는 단위 안이라 프레임마다 굽기 몫(적어도 묶음 하나)이 처음 굽기와 같다
 */
export function planLoose(h: MergeHost): void {
  const mode = h.merging.mode;
  if (mode === 'off' || (mode === 'auto' && !h.mgActive && h.meshes.length < h.merging.min)) return;
  // 1) 열쇠마다 줄 번호를 매기며 묶음마다 셈(낀 그물·거느린 그물·차례 거스름·산 그물 수와 정점 수), 묶음 밖 그물의 열쇠·정점 수
  type Lane = { seq: number; last: MergeGroup | null; head: number };
  const lanes = new Map<string, Lane>();
  const lane = (key: string): Lane => {
    let l = lanes.get(key);
    if (!l) lanes.set(key, (l = { seq: 0, last: null, head: 0 }));
    return l;
  };
  const loose = new Map<MeshRec, { key: string; nv: number }>();
  for (const g of h.mgGroups) g.plan = { seq: -1, mi: -1, gaps: 0, own: 0, broken: false, n: 0, nv: 0 };
  for (const r of h.meshes) {
    const g = r.mg;
    if (g) {
      const l = lane(g.key), p = g.plan!, i = r.mi!;
      if (p.seq >= 0) {
        p.gaps += l.seq - p.seq - 1;
        if (i <= p.mi) p.broken = true;
      } else if (!l.last && l.head) {
        p.own += l.head;
        l.head = 0;
      }
      p.seq = l.seq++;
      p.mi = i;
      p.n++;
      p.nv += g.vStart[i + 1]! - g.vStart[i]!;
      l.last = g;
      continue;
    }
    const s = h.mergeSrcOf(r);
    if (!s) continue;
    loose.set(r, { key: s.key, nv: s.src.nv });
    const l = lane(s.key);
    l.seq++;
    if (l.last) l.last.plan!.own++;
    else l.head++;
  }
  if (!h.mgActive && loose.size >= (mode === 'on' ? 2 : h.merging.min)) h.mgActive = true;
  if (!h.mgActive) return;
  // 2) 더럽혀진 묶음, ¼을 넘는 묶음, 다시 굽는 때
  let dead = 0;
  const dirty = new Set<MergeGroup>(), over = new Set<MergeGroup>();
  for (const g of h.mgGroups) {
    const p = g.plan!;
    dead += g.dead;
    if (g.dead || p.gaps || p.own || p.broken || g.rebuild) dirty.add(g);
    if (p.broken || g.rebuild || g.dead + p.gaps + p.own > g.recs.length * MERGE_DEAD_RATIO) over.add(g);
  }
  const all = !h.mgGroups.size || loose.size + dead >= MERGE_LOOSE;
  if (!all && !over.size) return;
  // 3) 열쇠마다 줄을 덩이로: 더럽혀진 그물 하나씩(묶음 밖 그물·더럽혀진 묶음 그물)과 깨끗한 묶음 하나씩
  type Blk = { g: MergeGroup | null; r: MeshRec | null; nv: number; dirty: boolean };
  const rows = new Map<string, Blk[]>();
  const row = (key: string): Blk[] => {
    let b = rows.get(key);
    if (!b) rows.set(key, (b = []));
    return b;
  };
  for (const r of h.meshes) {
    const g = r.mg;
    if (g) {
      const b = row(g.key);
      if (dirty.has(g)) b.push({ g, r, nv: g.vStart[r.mi! + 1]! - g.vStart[r.mi!]!, dirty: true });
      else if (b.at(-1)?.g !== g) b.push({ g, r: null, nv: 0, dirty: false });
      continue;
    }
    const s = loose.get(r);
    if (s) row(s.key).push({ g: null, r, nv: s.nv, dirty: true });
  }
  // 4) 잇단 더럽혀진 덩이(토막)마다: 다시 굽는 토막이면 양옆 깨끗한 묶음을 묶음 수가 늘지 않는 동안 붙이고, 굽기 단위로 고르게 나눠 줄에 넣는다
  const need = (n: number, v: number): number => Math.max(Math.ceil(n / MERGE_UPLOAD_MESHES), Math.ceil(v / MERGE_UPLOAD_VERTS));
  for (const b of rows.values()) {
    let i = 0;
    while (i < b.length) {
      if (!b[i]!.dirty) {
        i++;
        continue;
      }
      let lo = i, hi = i, n = 0, v = 0, pick = all;
      const take = (x: Blk): void => {
        n += x.r ? 1 : x.g!.plan!.n;
        v += x.r ? x.nv : x.g!.plan!.nv;
        if (x.g && over.has(x.g)) pick = true;
      };
      while (hi < b.length && b[hi]!.dirty) take(b[hi++]!);
      if (pick)
        for (let grew = true; grew; ) {
          grew = false;
          // 왼쪽 깨끗한 묶음(그 너머는 앞에서 다룬 토막 — 넘지 않는다)
          const L = b[lo - 1];
          if (L && !L.dirty && need(n + L.g!.plan!.n, v + L.g!.plan!.nv) <= need(n, v)) {
            L.dirty = true;
            take(L);
            lo--;
            grew = true;
          }
          // 오른쪽 깨끗한 묶음(그 너머가 더럽혀진 토막이면 이어 붙는다)
          const R = b[hi];
          if (R && !R.dirty && need(n + R.g!.plan!.n, v + R.g!.plan!.nv) <= need(n, v)) {
            R.dirty = true;
            take(b[hi++]!);
            while (hi < b.length && b[hi]!.dirty) take(b[hi++]!);
            grew = true;
          }
        }
      i = hi;
      if (!pick) continue;
      const recs: MeshRec[] = [], nvs: { nv: number }[] = [], gs = new Set<MergeGroup>();
      for (let k = lo; k < hi; k++) {
        const x = b[k]!;
        if (x.g) gs.add(x.g);
        if (x.r) {
          recs.push(x.r);
          nvs.push({ nv: x.nv });
          continue;
        }
        const g = x.g!;
        for (let j = 0; j < g.recs.length; j++) {
          const r = g.recs[j]!;
          if (r.mg !== g) continue;
          recs.push(r);
          nvs.push({ nv: g.vStart[j + 1]! - g.vStart[j]! });
        }
      }
      const chunks = mergeChunks(nvs);
      if (!chunks.length) continue;
      for (const g of gs) g.rebuild = true;
      for (const c of chunks) h.mgQueue.push(c.map((j) => recs[j]!));
    }
  }
}

/**
 * 0.52.0 묶음 하나 굽기: 그동안 바뀌거나 빠진 그물·첫 그물과 열쇠가 다른 그물은 빼고 잇는다(둘 이상일 때만). 버퍼는 그물 버퍼와 같은 성분으로 센다
 * (stats.buffers — 그물 번호는 'indices'·'edges'). VAO는 그물 VAO와 같은 속성 꼴에 그물 번호(위치 5)를 더한다.
 * 구운 뒤 그물마다 버퍼·VAO(그리고 구간 모음·삼각형 변 — 다시 쓸 때 묶음 것으로 다시 만든다)를 놓고 그물 기록이 묶음 저장소를 가리키게 한다(attach).
 * 다시 굽는 묶음(rebuild)의 그물은 옛 묶음에서 옮긴다
 */
export function bake(h: MergeHost, list: readonly MeshRec[]): void {
  const srcs: MergeSrc[] = [];
  const recs: MeshRec[] = [];
  let key: string | null = null;
  for (const r of list) {
    if ((r.mg && !r.mg.rebuild) || r.dropped) continue;
    const s = h.mergeSrcOf(r);
    if (!s || (key !== null && s.key !== key)) continue;
    key = s.key;
    srcs.push(s.src);
    recs.push(r);
  }
  if (recs.length < 2) return;
  const a = mergeArrays(srcs);
  const gl = h.gl;
  const bufs: WebGLBuffer[] = [];
  const buf = (target: number, data: ArrayBufferView, part: GpuBufferPart): WebGLBuffer => {
    const b = h.newBuffer(target, data, gl.STATIC_DRAW, part);
    bufs.push(b);
    return b;
  };
  const r0 = recs[0]!;
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const posBuf = buf(gl.ARRAY_BUFFER, a.pos, 'positions');
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
  const nrmF = a.nrm ? r0.attrs.nrmF : null;
  let nrmBuf: WebGLBuffer | null = null;
  if (a.nrm) {
    nrmBuf = buf(gl.ARRAY_BUFFER, a.nrm, 'normals');
    gl.enableVertexAttribArray(1);
    if (nrmF) gl.vertexAttribPointer(1, 3, h.glType(nrmF), nrmF.normalized, nrmF.stride, 0);
    else gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 12, 0);
  }
  let colBuf: WebGLBuffer | null = null;
  if (a.col) {
    colBuf = buf(gl.ARRAY_BUFFER, a.col, 'colors');
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 16, 0);
  }
  buf(gl.ARRAY_BUFFER, a.item, 'indices');
  gl.enableVertexAttribArray(5);
  gl.vertexAttribPointer(5, 1, gl.UNSIGNED_SHORT, false, 2, 0);
  buf(gl.ELEMENT_ARRAY_BUFFER, a.idx, 'indices');
  let thin: WebGLVertexArrayObject | null = null, wide: WebGLVertexArrayObject | null = null;
  let segBuf: WebGLBuffer | null = null, segItem: WebGLBuffer | null = null;
  if (a.seg && a.segItem) {
    segBuf = buf(gl.ARRAY_BUFFER, a.seg, 'edges');
    segItem = buf(gl.ARRAY_BUFFER, a.segItem, 'edges');
    // 가는 선: 윤곽선 기록의 thin VAO와 같은 위치 속성 + 끝점마다 그물 번호
    thin = gl.createVertexArray()!;
    gl.bindVertexArray(thin);
    gl.bindBuffer(gl.ARRAY_BUFFER, segBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, segItem);
    gl.enableVertexAttribArray(5);
    gl.vertexAttribPointer(5, 1, gl.UNSIGNED_SHORT, false, 2, 0);
    // 굵은 선: 윤곽선 기록의 wide VAO와 같은 모서리·끝점 인스턴스 속성 + 선분마다 그물 번호
    wide = gl.createVertexArray()!;
    gl.bindVertexArray(wide);
    gl.bindBuffer(gl.ARRAY_BUFFER, h.quadWide);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    wideAt(h, segBuf, segItem, 0);
  }
  gl.bindVertexArray(null);
  const g: MergeGroup = {
    recs,
    vao,
    tri: a.tri,
    vStart: a.vStart,
    thin,
    wide,
    seg: a.segStart,
    segBuf,
    segItem,
    attrs: { pos: posBuf, nrm: nrmBuf, col: colBuf, uv: null, uvN: 0, buv: null, buvN: 0, nrmF, uvF: null, buvF: null },
    bufs,
    bytes: mergeBytes(a),
    dead: 0,
    live: 0,
    rebuild: false,
    hasNormals: !!a.nrm,
    hasColors: !!a.col,
    cull: r0.src.doubleSided === false,
    key: key!,
  };
  h.mgGroups.add(g);
  h.mgBytes += g.bytes;
  recs.forEach((r, i) => attach(h, r, g, i));
}

/**
 * 0.52.0 그물 기록을 묶음 저장소로 옮긴다: 그물마다 버퍼·VAO·윤곽선 VAO(또는 옛 묶음)를 놓고, 구간 모음·삼각형 변(그물 버퍼를 가리킨다)을 지운 뒤
 * vao·attrs·윤곽선을 묶음 것으로, 색인 시작(first)·정점 시작(vbase)·선분 시작을 그 그물 자리로 둔다. 색인은 묶음 정점 번호라 그릴 때 늘 색인으로 그린다(indexed)
 */
function attach(h: MergeHost, r: MeshRec, g: MergeGroup, i: number): void {
  const gl = h.gl;
  h.dropParts(r);
  if (r.edges) h.dropParts(r.edges);
  if (r.wire) {
    gl.deleteVertexArray(r.wire.vao);
    h.vaos.delete(r.wire.vao);
    const k = h.keys.get(r.wire.idx);
    if (k) h.freeKey(k, 'element');
    r.wire = null;
  }
  if (r.mg) letGo(h, r);
  else {
    // 0.57.0 빛 기록(그물마다 GL 객체를 만들지 않고 곧장 구운 그물)은 지울 VAO가 없다(쓰는 기록 수만 — 버퍼도 없어 놓을 것이 없다)
    if (!r.light) {
      gl.deleteVertexArray(r.vao);
      h.vaos.delete(r.vao);
      if (r.edges)
        for (const v of [r.edges.wide, r.edges.thin]) {
          gl.deleteVertexArray(v);
          h.vaos.delete(v);
        }
    }
    h.release(r.slots);
  }
  r.light = false;
  r.slots = [];
  r.vao = g.vao;
  r.attrs = g.attrs;
  r.indexed = true;
  r.first = g.tri[i]!;
  r.vbase = g.vStart[i]!;
  if (r.edges) r.edges = { id: r.edges.id, group: r.edges.group, n: r.edges.n, pos: g.segBuf!, col: null, wide: g.wide!, thin: g.thin!, first: g.seg[i]! };
  r.mg = g;
  r.mi = i;
  g.live++;
}

/**
 * 0.52.0 묶음 면 자리 자료 하나(instBuf의 i번째 자리 — 12텍셀): setMeshMatrix와 같은 double 곱(시점 · 모형, 투영 · 그것, 법선 행렬)을 float32로(instMeshes와 같은 셈)
 * + 그물 색(meshDraw의 u_color와 같은 값) + 정점 색 쓰기 깃발(meshDraw의 u_vcol — 법선 행렬 첫 텍셀의 w).
 * 0.53.0: stride(렌더러 mergeStride)·shadow(빛 투영·시점 — 그림자 행렬 4텍셀)·clip(모형 → 로컬 평면 — 맨 끝 1텍셀)
 */
export function faceTexels(
  h: MergeHost,
  f: ViewFrame,
  model: ArrayLike<number> | undefined,
  c: Rgba,
  vcol: boolean,
  i: number,
  stride = MERGE_MESH_TEXELS,
  shadow: ArrayLike<number> | null = null,
  clip: ((model: ArrayLike<number> | undefined) => Readonly<Plane4> | null) | null = null,
): void {
  const d = h.instBuf, m3 = h.instM3;
  const mv = model ? mat4Mul(f.view, model, h.d4a) : f.view;
  const mvp = model ? mat4Mul(f.proj, mv, h.d4b) : f.viewProj;
  const o = i * stride * 4;
  for (let k = 0; k < 16; k++) {
    d[o + k] = mvp[k]!;
    d[o + 16 + k] = mv[k]!;
  }
  normalMatrix(mv, m3);
  for (let k = 0; k < 3; k++) {
    d[o + 32 + k * 4] = m3[k * 3]!;
    d[o + 33 + k * 4] = m3[k * 3 + 1]!;
    d[o + 34 + k * 4] = m3[k * 3 + 2]!;
    d[o + 35 + k * 4] = 0;
  }
  d[o + 35] = vcol ? 1 : 0;
  d[o + 44] = c[0];
  d[o + 45] = c[1];
  d[o + 46] = c[2];
  d[o + 47] = c[3];
  // 0.53.0 그림자(12~15 — setMeshMatrix의 u_shadowM과 같은 식, instMeshes와 같은 셈)·단면 하나(맨 끝 — setMeshMatrix의 u_clip과 같은 로컬 평면)
  if (shadow) {
    const lv = model ? mat4Mul(shadow, model, h.d4c) : shadow;
    for (let k = 0; k < 16; k++) d[o + 48 + k] = lv[k]!;
    for (let j = 0; j < 4; j++) for (let r = 0; r < 3; r++) d[o + 48 + j * 4 + r] = lv[j * 4 + r]! * 0.5 + lv[j * 4 + 3]! * 0.5;
  }
  if (clip) {
    const p = clip(model) ?? NO_CLIP;
    const q = o + (stride - 1) * 4;
    d[q] = p[0];
    d[q + 1] = p[1];
    d[q + 2] = p[2];
    d[q + 3] = p[3];
  }
}

/**
 * 0.52.0 묶음 선 자리 자료 하나(instBuf의 i번째 자리 — 6텍셀): drawLines와 같은 시점·투영 · 모형, 안개면 setLineFog와 같은 시점 · 모형의 z 행(instLines와 같은 셈),
 * 선 색(drawLines의 u_color와 같은 값)
 */
export function lineTexels(h: MergeHost, f: ViewFrame, model: ArrayLike<number> | undefined, c: Rgba, fog: boolean, i: number): void {
  const d = h.instBuf;
  const mvp = model ? mat4Mul(f.viewProj, model, h.d4a) : f.viewProj;
  const o = i * MERGE_LINE_TEXELS * 4;
  for (let k = 0; k < 16; k++) d[o + k] = mvp[k]!;
  if (fog) {
    const mv = model ? mat4Mul(f.view, model, h.d4b) : f.view;
    d[o + 16] = mv[2]!;
    d[o + 17] = mv[6]!;
    d[o + 18] = mv[10]!;
    d[o + 19] = mv[14]!;
  } else d.fill(0, o + 16, o + 20);
  d[o + 20] = c[0];
  d[o + 21] = c[1];
  d[o + 22] = c[2];
  d[o + 23] = c[3];
}

/** 한 번만 나오는 글을 바꾼다(없거나 둘 이상이면 예외 — 바꿀 자리를 잘못 찾지 않게) */
function replaceOnce(src: string, from: string, to: string): string {
  const i = src.indexOf(from);
  if (i < 0 || src.indexOf(from, i + 1) >= 0) throw new Error(`mergeShader: 바꿀 자리를 하나로 찾지 못했다 — ${from.trim()}`);
  return src.slice(0, i) + to + src.slice(i + from.length);
}

/**
 * 0.52.0 묶어 그리기 변종(MERGE)의 정점 셰이더(0.54.0 shaders.ts에서 이 조각으로 옮김): INST 변종 글(정의 INST를 넣은 그물·가는 선·굵은 선 정점 셰이더)에서 자리 번호를 gl_InstanceID 대신
 * 정점 속성 a_item(위치 5 — 묶음 안 그물 번호, Uint16을 실수로 읽어 정확한 정수)으로 읽고, 색 u_color(그물은 정점 색 쓰기 u_vcol — 법선 행렬 첫 텍셀의 w도)를 자리 자료 텍셀에서 읽게 바꾼다.
 * 그물 자리 하나 = 12텍셀(u_mvp 4·u_mv 4·u_nmat 3·u_color 1), 선 자리 하나 = 6텍셀(u_mvp 4·u_mvz 1·u_color 1). 예전 균일 변수와 같은 이름의 지역 변수로 두어
 * 아래 식은 한 글자도 바뀌지 않는다. 0.53.0 그물은 그림자(SHADOW)·단면 하나(CLIP)와도 쓴다 — 자리 텍셀 수 u_instStride(12·13·16·17), 그림자 행렬 12~15, 단면 평면 맨 끝
 * (선은 단면이 있으면 그물마다 — 렌더러). 원본 셰이더 글자도 그대로라 MERGE가 아닌 변종은 0.51.0과 같다.
 * 바꿀 자리를 하나로 찾지 못하면 예외(렌더러는 그 변종을 쓰지 않고 그물마다 그린다)
 */
export function mergeShader(vs: string, kind: 'mesh' | 'line'): string {
  let s = replaceOnce(vs, 'uniform int u_instBase;\n', 'uniform int u_instBase;\nlayout(location=5) in float a_item;\n');
  s = replaceOnce(s, 'uniform vec4 u_color;\n', '');
  if (kind === 'mesh') {
    // 그물: 정점 색 쓰기(u_vcol)도 자리마다(법선 행렬 첫 텍셀의 w — 정점 색이 있는 그물과 없는 그물을 한 묶음에)
    s = replaceOnce(s, 'uniform float u_vcol;\n', '');
    s = replaceOnce(s, '  int k = u_instBase + gl_InstanceID * 11 + j;\n', '  int k = u_instBase + int(a_item) * 12 + j;\n');
    // 0.53.0 그림자(SHADOW)·단면 하나(CLIP): 자리 텍셀 수 u_instStride(12 + 4 + 1)로 읽고, 그림자 행렬은 색 텍셀 뒤 12~15(단면 평면은 인스턴싱과 같이 맨 끝)
    s = replaceOnce(s, '  int k = u_instBase + gl_InstanceID * u_instStride + j;\n', '  int k = u_instBase + int(a_item) * u_instStride + j;\n');
    s = replaceOnce(s, '  mat4 u_shadowM = mat4(instAt(11), instAt(12), instAt(13), instAt(14));\n', '  mat4 u_shadowM = mat4(instAt(12), instAt(13), instAt(14), instAt(15));\n');
    s = replaceOnce(
      s,
      '  mat3 u_nmat = mat3(instAt(8).xyz, instAt(9).xyz, instAt(10).xyz);\n',
      '  mat3 u_nmat = mat3(instAt(8).xyz, instAt(9).xyz, instAt(10).xyz);\n  vec4 u_color = instAt(11);\n  float u_vcol = instAt(8).w;\n',
    );
  } else {
    s = replaceOnce(s, '  int k = u_instBase + (gl_InstanceID % u_instN) * 5 + j;\n', '  int k = u_instBase + int(a_item) * 6 + j;\n');
    s = replaceOnce(s, '  mat4 u_mvp = mat4(instAt(0), instAt(1), instAt(2), instAt(3));\n', '  mat4 u_mvp = mat4(instAt(0), instAt(1), instAt(2), instAt(3));\n  vec4 u_color = instAt(5);\n');
  }
  return s;
}
