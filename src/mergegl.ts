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
 * 0.61.0: 묶음 자리 자료 저장소(MergeStore — 묶음마다·종류마다 자리를 고정해 바뀐 자리만 쓰고 그 텍셀만 올린다)와 그리기 뼈대 길 도움(eachItem·blockRuns·RunList 등 —
 * 0.60.0 렌더러 render() 안에 있던 것)도 이 조각에 둔다
 */
import type { AttribFormat } from './attribs';
import type { ViewFrame } from './camera';
import { mat4Mul, normalMatrix } from './math';
import { type MergeCand, type MergeSrc, mergeArrays, mergeBytes, mergeChunks, mergeChunksByKey, mergeSrcBytes } from './merge';
import {
  MERGE_DEAD_RATIO,
  MERGE_LINE_TEXELS,
  MERGE_LITE_LINE_TEXELS,
  MERGE_LITE_MESH_TEXELS,
  MERGE_LOOSE,
  MERGE_MESH_TEXELS,
  MERGE_UPLOAD_MESHES,
  MERGE_UPLOAD_VERTS,
  type MergingOptions,
} from './mergeopts';
import type { MeshArrays, MeshLayout, ReleaseFlags } from './release';
import type { GpuBufferPart, LineMemo, LineRec, MergeBlock, MergeGroup, MergeOrder, MergeRun, MeshRec, Prog, RenderState, RenderStats } from './renderer';
import { NO_CLIP, type Plane4, boxStraddles } from './section';
import type { Box3, Mesh3d, Rgba } from './types';

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
  instM3: Float32Array;
  d4a: Float64Array;
  d4b: Float64Array;
  d4c: Float64Array;
  restoreQ: Map<string, MeshArrays>;
  laid: WeakMap<Mesh3d, MeshLayout>;
  rel: ReleaseFlags | null;
  mergeSrcOf(r: MeshRec): { src: MergeSrc; key: string } | null;
  mergeDirect(m: Mesh3d): boolean;
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
  drawLines(f: ViewFrame, r: LineRec, model: ArrayLike<number> | undefined, o: object, st: RenderState, stats: RenderStats, memo: LineMemo | null): void;
  /** 0.61.0 묶음 자리 자료 저장소(처음 묶어 그릴 때 만든다 — 묶음이 모두 없어지면 놓는다) */
  mgStore: MergeStore | null;
}

/** 0.61.0 자리 자료 저장소 그림 폭(텍셀 — 셰이더 k & 1023·k >> 10과 같다)과 줄을 늘리는 단위 */
const STORE_W = 1024, STORE_STEP = 64;
/** 0.61.0 자리 자료 저장소 그림을 묶어 두는 무늬 단위(렌더러가 쓰는 0~9와 겹치지 않는다 — WebGL2 정점 셰이더 무늬 단위는 16개 이상) */
export const STORE_UNIT = 10;

/**
 * 0.61.0 묶음 자리 자료 저장소: 묶음마다·종류마다(면 f·윤곽선 e·숨은 점선 d) 그물 번호 자리를 고정해 둔 RGBA32F 그림(STORE_UNIT, 폭 1024)과 그 CPU 사본(buf — 올린 것과 같다).
 * 0.60.0까지는 그리기 차례마다 구간 자리를 앞에서부터 이어 쓰고 모두 올렸다(8만 — 프레임마다 1,440,768텍셀, 23 MB). 이제 종류마다 프레임 값(sig — 시점·투영·그림자 행렬·
 * 단면 평면·안개·텍셀 수)이 같고 자리의 모형·색·정점 색 깃발이 같으면 그 자리는 다시 쓰지도 올리지도 않는다(바뀐 자리가 든 줄만 올린다). 그래서 카메라가 그대로인 프레임은
 * 강조·숨김·잘라냄이 바뀌어도(구간만 달라진다) 올리지 않고, 외곽선·주변 가림 깊이 차례는 면 차례가 쓴 자리를 그대로 읽는다
 */
export interface MergeStore {
  tex: WebGLTexture | null;
  /** 그림 줄 수·GPU 무늬 한도(줄) */
  rows: number;
  max: number;
  buf: Float32Array;
  /** 다음 빈 텍셀·살아 있는 자리 텍셀 수(버린 자리가 반을 넘으면 늘리지 않고 처음부터 다시 놓는다) */
  top: number;
  live: number;
  /** 자리를 처음부터 다시 놓을 때마다 1씩(앞 자리는 버린다) */
  ep: number;
  /** 종류마다 마지막 프레임 값과 판(값이 바뀌면 판이 올라 그 종류 자리가 모두 낡는다) */
  sig: Record<string, number[]>;
  gen: Record<string, number>;
  /** 이번 차례에 쓴 텍셀 구간 [시작, 끝, …] */
  dirty: number[];
}

/** 0.61.0 묶음 하나의 종류 하나 자리: 그물 번호 i의 자리는 base + i·stride 텍셀(base는 stride의 배수). at[i] = 그 자리를 쓴 판, mdl[i] = 쓴 모형 */
export interface MergeSlots {
  ep: number;
  base: number;
  stride: number;
  at: Uint32Array;
  mdl: (ArrayLike<number> | undefined)[];
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
  /** 0.60.0 겉모습이 있는지(없으면 mm은 그물 기록의 모형 그대로 — 묶음에 모아 둔 모형 3열을 쓴다) */
  look: boolean;
  /** 단면 하나(있으면 면 자리에 로컬 평면을 싣는다) */
  sec: object | null;
  clipOf(model: ArrayLike<number> | undefined): Readonly<Plane4> | null;
  shadowOn: boolean;
  shadowVp: ArrayLike<number> | null;
  meshExtra: readonly string[];
  hiTint: Rgba;
  /** 그 프로그램이 아니면 바꾼다(meshUse — 바꿨으면 true: 자리 자료 그림 단위를 다시 건다) */
  use(p: Prog): boolean;
  flagsNew(vcol: boolean, nrm: boolean, tint: number, alpha: number): boolean;
  /** 뒷면 버리기 켜고 끄기(기억이 다를 때만) */
  cullTo(c: boolean): void;
  drawParts(r: MeshRec, color: Rgba, alpha: number, tint: number, cull: boolean): void;
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

/**
 * 0.57.0 이 그물을 그물마다 GL 객체 없이 곧장 구울지(빛 기록 — 렌더러 meshRec light). 0.60.0 판단은 렌더러(mergeDirect — 조각을 받는 동안에도 빛 기록으로 들고 기다린다)
 */
export function direct(h: MergeHost, m: Mesh3d): boolean {
  return h.mergeDirect(m);
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

/**
 * 0.60.0 그리기 뼈대를 만든다: 장면 차례(meshes)를 같은 묶음의 잇단 번호 덩이와 묶음 밖 그물로 나누고, 기록마다 덩이 번호(bk — 밖은 −1)를 적는다.
 * 그리기는 뼈대가 맞는 동안(orderValid) 깨끗한 덩이(모두 보이고·잘라낸 그물·강조·겉모습·구간이 없음)를 그물마다 보지 않고 구간 하나로 더한다 —
 * 다 묶은 큰 장면에서 프레임마다 그물 기록을 차례대로 훑던 일(보임·잘라냄·강조·색 — 8만 그물에서 그리기 시간의 절반 가까이)이 덩이 수만큼으로 준다
 */
export function orderBuild(h: MergeHost): MergeOrder {
  const M = h.meshes;
  const items: (MergeBlock | MeshRec)[] = [];
  const at: number[] = [];
  const blocks: MergeBlock[] = [];
  const loose: MeshRec[] = [];
  let k: MergeBlock | null = null;
  for (let j = 0; j < M.length; j++) {
    const r = M[j]!;
    const g = r.mg;
    if (!g) {
      k = null;
      r.bk = -1;
      items.push(r);
      at.push(j);
      loose.push(r);
      continue;
    }
    const i = r.mi!;
    const plain = !r.transparent && !r.back && !r.pbr && !r.tex;
    if (k && k.g === g && k.b === i) {
      k.b++;
      if (!plain) k.ok = false;
      if (!r.edges) k.edges = false;
    } else {
      k = { g, a: i, b: i + 1, at: j, ok: plain, edges: !!g.thin && !!r.edges, cut: 0, hi: 0, np: false, npv: -1, hid: [], cutL: [], hiL: [], ex: 0, exA: [], exB: [] };
      items.push(k);
      at.push(j);
      blocks.push(k);
    }
    r.bk = blocks.length - 1;
  }
  return { n: M.length, items, at: Int32Array.from(at), blocks, loose };
}

/**
 * 0.60.0 뼈대가 지금 장면 차례와 맞는지(덩이·묶음 밖 그물 수만큼만 본다): meshes는 끝에 더하기·한 자리 빼기·한 자리 바꾸기·통째 비우기로만 바뀌고,
 * 묶음 그물이 빠지거나(leave — dead) 다른 묶음으로 옮기면(letGo — live) 그 묶음 수가 준다. 그래서 그물 수가 같고, 덩이마다 묶음의 그물이 모두 남았고
 * 덩이 첫·끝 자리가 같은 기록이며, 묶음 밖 그물이 그 자리에 그대로(묶이지 않고) 있으면 차례가 같다
 */
export function orderValid(h: MergeHost, o: MergeOrder): boolean {
  const M = h.meshes;
  if (M.length !== o.n) return false;
  const items = o.items, at = o.at;
  for (let j = 0; j < items.length; j++) {
    const x = items[j]!;
    const p = at[j]!;
    if ('src' in x) {
      if (M[p] !== x || x.mg) return false;
      continue;
    }
    const g = x.g;
    if (g.dead || g.live !== g.recs.length || M[p] !== g.recs[x.a] || M[p + x.b - x.a - 1] !== g.recs[x.b - 1]) return false;
  }
  return true;
}

/** 0.60.0 덩이를 나눈 토막의 그물 수(잘린 면 채우기 단위 거르기 — 장면 차례의 이웃 그물이 공간에서도 가까운 만큼 토막 상자가 평면을 덜 걸친다) */
export const BLOCK_BOX = 64;

/** 0.60.0 덩이 그물의 세계 범위(MeshRec.box — 그물 기록마다 그대로)를 BLOCK_BOX개 토막마다 합친 상자(처음 쓸 때) */
export function blockBoxes(k: MergeBlock): Box3[] {
  if (k.boxes) return k.boxes;
  const out: Box3[] = [];
  for (let s = k.a; s < k.b; s += BLOCK_BOX) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = s; i < Math.min(k.b, s + BLOCK_BOX); i++) {
      const b = k.g.recs[i]!.box;
      if (b.min[0] < x0) x0 = b.min[0];
      if (b.min[1] < y0) y0 = b.min[1];
      if (b.min[2] < z0) z0 = b.min[2];
      if (b.max[0] > x1) x1 = b.max[0];
      if (b.max[1] > y1) y1 = b.max[1];
      if (b.max[2] > z1) z1 = b.max[2];
    }
    out.push({ min: [x0, y0, z0], max: [x1, y1, z1] });
  }
  return (k.boxes = out);
}

/** 0.60.0 덩이 그물에 채우기 단위 묶음(Mesh3d.capGroup)이 없는지(처음 쓸 때) */
export function blockCapFree(k: MergeBlock): boolean {
  if (k.ncg === undefined) {
    let free = true;
    for (let i = k.a; free && i < k.b; i++) if (k.g.recs[i]!.src.capGroup !== undefined) free = false;
    k.ncg = free;
  }
  return k.ncg;
}

/** 0.60.0 강조 id → 덩이 번호 · 65536 + 묶음 그물 번호(덩이 그물만 — 같은 id가 여럿이면 목록). 강조를 처음 쓸 때 한 번 */
function orderIds(o: MergeOrder): Map<string, number | number[]> {
  const m = new Map<string, number | number[]>();
  o.blocks.forEach((k, j) => {
    for (let i = k.a; i < k.b; i++) {
      const id = k.g.recs[i]!.src.id;
      const v = j * 65536 + i;
      const x = m.get(id);
      if (x === undefined) m.set(id, v);
      else if (typeof x === 'number') m.set(id, [x, v]);
      else x.push(v);
    }
  });
  return m;
}

// ───── 0.61.0 그리기 뼈대 길 도움(0.60.0 렌더러 render() 안에 있던 것 — 묶어 그리기가 꺼진 장면은 쓰지 않아 코어 조각에서 이 조각으로 옮겼다. 셈·차례는 같다) ─────

/**
 * 0.60.0 뼈대 차례로 보이는 그물마다 fn(보이는 목록과 같은 차례 — 보이는 목록을 만든 번호 vis). 덩이마다 먼저 blk(덩이, fn)를 묻고, 덩이를 다뤘으면(true) 그 그물들은 건너뛴다
 * (blk는 예외 그물 — 숨김·잘라냄·강조 — 을 fn으로 넘기고 그 사이 구간을 통째로 더한다)
 */
export function eachItem(o: MergeOrder, vis: number, fn: (r: MeshRec) => void, blk: ((k: MergeBlock, fn: (r: MeshRec) => void) => boolean) | null): void {
  for (const x of o.items) {
    if ('src' in x) {
      if (x.visAt === vis) fn(x);
      continue;
    }
    if (blk && blk(x, fn)) continue;
    const R = x.g.recs;
    for (let i = x.a; i < x.b; i++) {
      const r = R[i]!;
      if (r.visAt === vis) fn(r);
    }
  }
}

/** 0.60.0 숨김 판이 바뀐 그리기에서 덩이마다 숨긴 그물 번호(보이는 목록을 만든 번호 seq가 아닌 그물) */
export function blockHid(o: MergeOrder, seq: number): void {
  for (const k of o.blocks) {
    const hid: number[] = [];
    for (let i = k.a; i < k.b; i++) if (k.g.recs[i]!.visAt !== seq) hid.push(i);
    k.hid = hid;
  }
}

/** 0.60.0 강조 모음이 든 덩이에 판 stamp와 강조한 묶음 그물 번호(모음·크기·뼈대가 바뀐 그리기에서) */
export function blockHi(o: MergeOrder, set: ReadonlySet<string>, stamp: number): void {
  const ids = (o.ids ??= orderIds(o));
  const mark = (v: number): void => {
    const k = o.blocks[Math.floor(v / 65536)]!;
    if (k.hi !== stamp) {
      k.hi = stamp;
      k.hiL = [];
    }
    k.hiL.push(v % 65536);
  };
  for (const id of set) {
    const x = ids.get(id);
    if (x === undefined) continue;
    if (typeof x === 'number') mark(x);
    else for (const v of x) mark(v);
  }
}

/** 0.60.0 오름차순 두 번호 목록을 합친다(겹친 번호는 하나 — 덩이 예외 그물) */
export function mergeSorted(a: readonly number[], b: readonly number[]): number[] {
  const out: number[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    const x = j >= b.length || (i < a.length && a[i]! <= b[j]!) ? a[i++]! : b[j++]!;
    if (out[out.length - 1] !== x) out.push(x);
  }
  return out;
}

/** 0.60.0 이 그리기의 번호들: 그리기 번호(잘라냄 표시)·강조 판(0이면 강조 없음)·보이는 목록 번호 */
export interface FrameMarks {
  frame: number;
  hi: number;
  vis: number;
}

/**
 * 0.60.0 덩이를 예외 그물(숨김·잘라냄 — withHi면 강조도) 사이 구간으로: 구간마다 add, 예외 그물은 보이면 fn(그물마다 길 그대로).
 * 예외 번호(오름차순·겹침 없음)는 그리기마다 한 번 합친다
 */
export function blockRuns(k: MergeBlock, fn: (r: MeshRec) => void, withHi: boolean, add: (a: number, b: number) => void, m: FrameMarks): void {
  if (k.ex !== m.frame) {
    k.ex = m.frame;
    const cutL = k.cut === m.frame ? k.cutL : null;
    k.exA = !cutL ? k.hid : !k.hid.length ? cutL : mergeSorted(k.hid, cutL);
    k.exB = m.hi !== 0 && k.hi === m.hi ? mergeSorted(k.exA, k.hiL.slice().sort((p, q) => p - q)) : k.exA;
  }
  const R = k.g.recs;
  let s = k.a;
  for (const x of withHi ? k.exB : k.exA) {
    if (x > s) add(s, x);
    const r = R[x]!;
    if (r.visAt === m.vis) fn(r);
    s = x + 1;
  }
  if (s < k.b) add(s, k.b);
}

/** 0.60.0 묶음 그물마다 면 색·정점 색 쓰기(렌더러 colOf·vcolOf와 같은 값 — 겉모습이 없을 때). flat = 숨은 선 모드 바탕 채움 색, mono = 단색 모드 색 */
export function faceCols(g: MergeGroup, flat: Rgba | null, mono: Rgba | null): [Rgba[], boolean[]] {
  const fc = (g.fc ??= { cols: g.recs.map((r) => r.src.color), vc: g.recs.map((r) => r.hasColors) });
  if (flat) return [oneCol(g, 'f', flat), noVc(g)];
  if (mono) {
    const key = `m${mono.join()}`;
    const c = (g.cc ??= {}).f;
    if (c && c.k === key) return [c.cols, noVc(g)];
    const cols = fc.cols.map((x): Rgba => [mono[0], mono[1], mono[2], x[3]]);
    g.cc.f = { k: key, cols };
    return [cols, noVc(g)];
  }
  return [fc.cols, fc.vc];
}

/** 0.60.0 묶음 그물 수만큼 같은 색(쓰는 곳 slot마다 마지막 값을 둔다 — 값이 같으면 다시 쓴다) */
export function oneCol(g: MergeGroup, slot: string, c: Rgba): Rgba[] {
  const key = `c${c[0]},${c[1]},${c[2]},${c[3]}`;
  const cc = (g.cc ??= {});
  const x = cc[slot];
  if (x && x.k === key) return x.cols;
  const cols = new Array<Rgba>(g.recs.length).fill(c);
  cc[slot] = { k: key, cols };
  return cols;
}

/** 0.60.0 묶음 그물 수만큼 정점 색 끔 */
export function noVc(g: MergeGroup): boolean[] {
  return (g.nv ??= new Array<boolean>(g.recs.length).fill(false));
}

/**
 * 0.60.0 묶음 그물마다 윤곽선 색(강조·그물마다 선 색이 없을 때 렌더러의 그물마다 col과 같은 값): map이 있으면(선 색 선택) 면 색마다 그 값, one이 있으면 모두 그 색,
 * 아니면 면 색에 불투명도 a(X-ray 0.9)
 */
export function edgeCols(g: MergeGroup, face: () => Rgba[], one: Rgba | null, a: number, map: ((c: Rgba) => Rgba) | null): Rgba[] {
  if (map) return face().map(map);
  if (one) return oneCol(g, 'e', one);
  const key = `w${a}`;
  const cc = (g.cc ??= {});
  const x = cc.e;
  if (x && x.k === key) return x.cols;
  const cols = face().map((c): Rgba => [c[0], c[1], c[2], a]);
  cc.e = { k: key, cols };
  return cols;
}

/** 0.60.0 덩이 그물의 윤곽선 구간 모음이 없는지(구간 모음 판 ver가 바뀐 뒤에만 다시 본다 — 있으면 그물마다 길이 지운다) */
export function npOf(k: MergeBlock, ver: number): boolean {
  if (k.npv !== ver) {
    let np = true;
    for (let i = k.a; np && i < k.b; i++) if (k.g.recs[i]!.edges?.parts) np = false;
    k.np = np;
    k.npv = ver;
  }
  return k.np;
}

/**
 * 0.60.0 단면 하나 채우기 단위 거르기: 채우기 단위 묶음이 없는 덩이에서 토막 상자가 평면을 걸치는 토막의 보이는 그물만 push(차례 그대로). 다룰 수 없는 덩이면 false
 */
export function capBlock(k: MergeBlock, plane: Readonly<Plane4>, vis: number, push: (r: MeshRec) => void): boolean {
  if (!k.ok || !blockCapFree(k)) return false;
  const B = blockBoxes(k), R = k.g.recs;
  for (let j = 0, s = k.a; s < k.b; j++, s += BLOCK_BOX) {
    if (!boxStraddles(B[j]!, plane)) continue;
    for (let i = s; i < Math.min(k.b, s + BLOCK_BOX); i++) if (R[i]!.visAt === vis) push(R[i]!);
  }
  return true;
}

/** 0.60.0 함께 쓰던 색 목록을 구간 제 목록으로(그물마다 늘이기 전에) */
function own(u: MergeRun): void {
  u.cols = u.cols.slice(u.a - u.o, u.b - u.o);
  u.vc = u.vc.slice(u.a - u.o, u.b - u.o);
  u.o = u.a;
  u.sh = false;
}

/**
 * 0.61.0 묶어 그리는 목록 모으기(0.52.0~0.60.0 render() 안 mergeAdd·mergeRange·mergeDo): 묶음 구간(MergeRun)과 그물마다 그리기(함수)를 장면 차례로.
 * 마지막 구간은 앞 구간의 다음 번호이고 구간 균일 변수(강조·불투명도)·굵기가 같으면 늘인다
 */
export class RunList {
  ops: MergeOp[] = [];
  private u: MergeRun | null = null;

  /** 묶음 그물 하나(w = 윤곽선 굵기 — 강조한 그물 2) */
  add(r: MeshRec, col: Rgba, vcol: boolean, tint: number, alpha: number, w = 1): void {
    const g = r.mg!, i = r.mi!;
    const u = this.u;
    if (u && u.g === g && u.b === i && u.tint === tint && u.alpha === alpha && u.w === w) {
      if (u.sh) own(u);
      u.b++;
      u.cols.push(col);
      u.vc.push(vcol);
      return;
    }
    this.ops.push((this.u = { g, a: i, b: i + 1, base: 0, cols: [col], vc: [vcol], o: i, sh: false, tint, alpha, w }));
  }

  /** 깨끗한 덩이 [a, b)(그물마다 add를 부른 것과 같은 구간 — cols·vc는 묶음 그물 번호로 찾는 묶음 전체 목록이라 늘이기만 하면 고치지 않는다) */
  range(g: MergeGroup, a: number, b: number, cols: Rgba[], vc: boolean[], tint: number, alpha: number): void {
    const u = this.u;
    if (u && u.g === g && u.b === a && u.tint === tint && u.alpha === alpha && u.w === 1) {
      if (u.sh && u.cols === cols && u.vc === vc) {
        u.b = b;
        return;
      }
      if (u.sh) own(u);
      for (let i = a; i < b; i++) {
        u.cols.push(cols[i]!);
        u.vc.push(vc[i]!);
      }
      u.b = b;
      return;
    }
    this.ops.push((this.u = { g, a, b, base: 0, cols, vc, o: 0, sh: true, tint, alpha, w: 1 }));
  }

  /** 그물마다 그리기 하나(앞 구간은 더 늘이지 않는다 — 뒤 그물이 이 그리기를 앞지르지 않게) */
  draw(fn: () => void): void {
    this.ops.push(fn);
    this.u = null;
  }
}

/**
 * 0.60.0 묶음 그물마다 모형 3열(이동뿐인 모형 — 처음 쓸 때 만든다. 그물 기록의 모형 행렬은 바뀌지 않는다). sft 1 = 이동뿐, 2 = 그 가운데 0~2열이 단위 행렬과
 * 비트까지 같은 것(−0이 없다 — 단면 로컬 평면 planeToLocal은 0에서 더해 가지 않아 칸의 부호가 남을 수 있다)
 */
function shiftsOf(g: MergeGroup): void {
  if (g.org) return;
  const n = g.recs.length;
  const org = new Float64Array(n * 4), sft = new Uint8Array(n);
  let mov = n > 0;
  let nom: Uint8Array | undefined;
  for (let i = 0; i < n; i++) {
    const m = g.recs[i]!.model;
    if (!m) {
      // 0.62.0 모형이 없는 그물(세계 좌표): 이동뿐 꼴에서 3열은 시점 투영·시점 행렬 3열 그대로(faceTexels·lineTexels와 같은 값 — 0~2열은 이동뿐 그물의 공통 열과 ±0만 다를 수 있다).
      // 0.60.0 공통 열 길(sft)은 타지 않는다
      (nom ??= new Uint8Array(n))[i] = 1;
      continue;
    }
    if (!shiftOnly(m)) {
      mov = false;
      continue;
    }
    let pure = true;
    for (let j = 0; j < 12; j++) if (Object.is(m[j], -0)) pure = false;
    sft[i] = pure ? 2 : 1;
    org[i * 4] = m[12]!;
    org[i * 4 + 1] = m[13]!;
    org[i * 4 + 2] = m[14]!;
    org[i * 4 + 3] = m[15]!;
  }
  g.org = org;
  g.sft = sft;
  g.nom = nom;
  g.mov = mov;
}

/** 0.62.0 이 그리기에서 묶음 g의 자리를 MSHIFT 꼴(이동뿐 — 면 3·선 2텍셀)로 쓰는지: 겉모습이 없고 그물 모형이 모두 이동뿐(모형이 없는 그물 포함) */
function lite(g: MergeGroup, look: boolean): boolean {
  if (look) return false;
  shiftsOf(g);
  return g.mov!;
}

/**
 * 0.52.0 묶음의 버퍼·VAO를 지운다(쓰는 그물 기록이 없을 때 — lost면 잊기만). 0.61.0 자리 자료 저장소의 그 묶음 자리를 놓고, 묶음이 모두 없어지면 저장소 그림도 놓는다
 */
export function free(h: MergeHost, g: MergeGroup, lost: boolean): void {
  if (!h.mgGroups.delete(g)) return;
  h.mgBytes -= g.bytes;
  const s = h.mgStore;
  if (s && g.ps) for (const k in g.ps) if (g.ps[k]!.ep === s.ep) s.live -= g.ps[k]!.at.length * g.ps[k]!.stride;
  g.ps = undefined;
  if (s && !h.mgGroups.size) {
    if (!lost && s.tex) h.gl.deleteTexture(s.tex);
    h.mgStore = null;
  }
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

/**
 * 0.61.0 구간의 자리 자료를 저장소에(구간마다 u_instBase = 그 묶음 kind 자리의 첫 텍셀): 자리를 마련하고(storeSlots), 프레임 값이 바뀌었으면 판을 올리고,
 * fill이 낡은 자리만 쓴 뒤 쓴 줄만 올린다. 저장소가 GPU 무늬 한도에 들지 않으면 false(그물마다 그린다 — 0.60.0까지 자리 자료 그림이 모자랄 때와 같다).
 * 0.60.0까지는 구간 차례로 자리 k = 0, 1, …에 이어 쓰고 그 차례 자리를 모두 올렸다
 */
function putRuns(h: MergeHost, runs: readonly MergeRun[], kind: string, strideOf: (g: MergeGroup) => number, sig: number[], fill: (fresh: boolean) => void): boolean {
  if (!runs.length) return false;
  const s = storeSlots(h, runs, kind, strideOf);
  if (!s) return false;
  const o = s.sig[kind];
  let same = !!o && o.length === sig.length;
  for (let i = 0; same && i < sig.length; i++) if (!Object.is(o![i], sig[i])) same = false;
  if (!same) {
    s.sig[kind] = sig;
    s.gen[kind] = (s.gen[kind] ?? 0) + 1;
  }
  for (const u of runs) u.base = u.g.ps![kind]!.base;
  // 0.62.0 판이 이 차례에 올랐으면(카메라를 돌린 프레임 등) 그 종류 자리는 모두 낡았다 — 자리마다 견주지 않고 구간째 쓴다
  fill(!same);
  storePut(h, s);
  return true;
}

/**
 * 0.61.0 이 차례 구간의 묶음마다 kind 자리(그물 수 × stride 텍셀)를 마련한다 — 없거나 텍셀 수가 다르면 저장소 끝에 새로. 늘려야 하는데 버린 자리(빠진 묶음·텍셀 수가 바뀐 자리)가
 * ¼ 이상이거나 GPU 무늬 한도를 넘으면 자리를 모두 버리고 처음부터 다시 놓는다(그 앞 차례가 이미 건 그리기는 GL 차례대로 그때 그림을 읽는다). 그래도 넘으면 null.
 * 0.62.0 텍셀 수는 묶음마다(strideOf — 이동뿐인 묶음은 MSHIFT 꼴)
 */
function storeSlots(h: MergeHost, runs: readonly MergeRun[], kind: string, strideOf: (g: MergeGroup) => number): MergeStore | null {
  const gl = h.gl;
  const s = (h.mgStore ??= {
    tex: null,
    rows: 0,
    max: Math.max(1, Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 2048),
    buf: new Float32Array(0),
    top: 0,
    live: 0,
    ep: 1,
    sig: {},
    gen: {},
    dirty: [],
  });
  const add = new Set<MergeGroup>();
  let need = 0;
  const want = (all: boolean): void => {
    add.clear();
    need = 0;
    for (const u of runs) {
      const g = u.g, R = g.ps?.[kind];
      if (add.has(g) || (!all && R && R.ep === s.ep && R.stride === strideOf(g))) continue;
      add.add(g);
      need += (g.recs.length + 1) * strideOf(g);
    }
  };
  want(false);
  if (!need) return s;
  const cap = s.max * STORE_W;
  // 텍셀 수가 바뀌어 다시 놓는 묶음의 옛 자리도 버린 자리로 센다(단면·그림자를 켜고 끌 때 — 버린 자리가 ¼을 넘으면 늘리지 않고 처음부터)
  let live = s.live;
  for (const g of add) {
    const old = g.ps?.[kind];
    if (old && old.ep === s.ep) live -= old.at.length * old.stride;
  }
  if (s.top + need > cap || (s.top + need > s.rows * STORE_W && 4 * (live + need) <= 3 * (s.top + need))) {
    s.ep++;
    s.top = 0;
    s.live = 0;
    want(true);
  }
  if (s.top + need > cap) return null;
  const keep = s.rows ? Math.ceil(s.top / STORE_W) : 0;
  for (const g of add) {
    const old = g.ps?.[kind];
    if (old && old.ep === s.ep) s.live -= old.at.length * old.stride;
    const stride = strideOf(g);
    const n = g.recs.length, base = Math.ceil(s.top / stride) * stride;
    (g.ps ??= {})[kind] = { ep: s.ep, base, stride, at: new Uint32Array(n), mdl: new Array(n) };
    s.top = base + n * stride;
    s.live += n * stride;
  }
  if (s.top > s.rows * STORE_W) {
    // 그림을 늘린다(줄 STORE_STEP 단위, 적어도 1.25배 — 앞서 쓴 줄은 새 그림에 다시 올린다)
    const rows = Math.min(s.max, Math.ceil(Math.max(s.top / STORE_W, s.rows * 1.25) / STORE_STEP) * STORE_STEP);
    const buf = new Float32Array(rows * STORE_W * 4);
    buf.set(s.buf);
    gl.activeTexture(gl.TEXTURE0 + STORE_UNIT);
    if (s.tex) gl.deleteTexture(s.tex);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, STORE_W, rows, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (keep) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, STORE_W, keep, gl.RGBA, gl.FLOAT, buf, 0);
    gl.activeTexture(gl.TEXTURE0);
    s.tex = tex;
    s.rows = rows;
    s.buf = buf;
  }
  return s;
}

/**
 * 0.61.0 이번 차례에 쓴 텍셀 구간을 저장소 그림에 올린다: 한 줄이 안 되는 틈으로 이어진 구간은 하나로 모아 그 텍셀만(첫 줄 조각·가운데 온 줄·끝 줄 조각 — 많아야 세 번).
 * 강조 하나를 바꾼 프레임은 그 그물 윤곽선 자리 6텍셀
 */
function storePut(h: MergeHost, s: MergeStore): void {
  const D = s.dirty;
  if (!D.length) return;
  const gl = h.gl;
  const ord = Array.from({ length: D.length / 2 }, (_, j) => j).sort((a, b) => D[a * 2]! - D[b * 2]!);
  gl.activeTexture(gl.TEXTURE0 + STORE_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, s.tex);
  const sub = (t: number, w: number, rows: number): void =>
    gl.texSubImage2D(gl.TEXTURE_2D, 0, t % STORE_W, Math.floor(t / STORE_W), w, rows, gl.RGBA, gl.FLOAT, s.buf, t * 4);
  let t0 = -1, t1 = -1;
  const up = (): void => {
    if (t0 < 0) return;
    let a = t0;
    if (a % STORE_W) {
      const e = Math.min(t1, (Math.floor(a / STORE_W) + 1) * STORE_W);
      sub(a, e - a, 1);
      a = e;
    }
    const full = Math.floor((t1 - a) / STORE_W);
    if (full) {
      sub(a, STORE_W, full);
      a += full * STORE_W;
    }
    if (a < t1) sub(a, t1 - a, 1);
  };
  for (const j of ord) {
    const a = D[j * 2]!, b = D[j * 2 + 1]!;
    if (t0 >= 0 && a <= t1 + STORE_W) {
      if (b > t1) t1 = b;
      continue;
    }
    up();
    t0 = a;
    t1 = b;
  }
  up();
  gl.activeTexture(gl.TEXTURE0);
  D.length = 0;
}

/** 0.61.0 자리 하나(텍셀 t부터 n개)를 이번 차례에 썼다고 적는다(앞 구간에 맞닿으면 늘인다) */
function dirty(D: number[], t: number, n: number): void {
  const e = D.length;
  if (e && D[e - 1] === t) D[e - 1] = t + n;
  else D.push(t, t + n);
}

/**
 * 0.61.0 프레임 값(같으면 자리를 다시 쓰지 않는다): 텍셀 수(+ 안개 깃발)·겉모습 유무·시점·투영·시점 투영(+ 그림자 행렬·단면 평면). 겉모습이 없으면 자리의 모형을 견주지 않으므로
 * 겉모습을 켜고 끌 때 판이 바뀌어야 한다
 */
function frameSig(c: MergeDrawCtx, head: number[], more: (ArrayLike<number> | null)[]): number[] {
  const v = [...head, c.look ? 1 : 0];
  for (const m of [c.f.view, c.f.proj, c.f.viewProj, ...more]) if (m) for (let i = 0; i < m.length; i++) v.push(m[i]!);
  return v;
}

/**
 * 0.52.0 면 목록을 그린다: 묶음 구간은 MERGE 변종으로 그 색인 구간 그리기 한 번, 그물마다는 그대로. 변종이 아직 번역 중이거나 자리 자료가 모자라면
 * 구간도 그물마다(plain — 그 그물을 그물마다 그릴 때의 프로그램)로 그린다(같은 그림). 0.53.0 그림자(SHADOW — 깊이 그림을 그린 뒤)·단면 하나(CLIP)도 묶음 변종으로:
 * 그물마다 그릴 때(progFor)와 같은 정의, 자리마다 그림자 행렬·로컬 평면을 자리 자료에. 0.57.0 render() 안에서 이 조각으로 옮김(GL 호출 차례는 같다)
 */
export function drawFaces(h: MergeHost, c: MergeDrawCtx, ops: readonly MergeOp[], plain: (r: MeshRec) => Prog): void {
  const gl = h.gl, stats = c.stats;
  const runs = ops.filter((o): o is MergeRun => typeof o !== 'function');
  const extra = (c.shadowOn ? 4 : 0) + (c.sec ? 1 : 0);
  const stride = MERGE_MESH_TEXELS + extra;
  // 0.62.0 이동뿐인 묶음은 MSHIFT 꼴(면 3텍셀 + 그림자 3열 1 + 단면 1 — 0~2열·법선 행렬은 균일 변수)
  const strideL = MERGE_LITE_MESH_TEXELS + (c.shadowOn ? 1 : 0) + (c.sec ? 1 : 0);
  const look = c.look;
  const full: MergeRun[] = [], thin: MergeRun[] = [];
  for (const u of runs) (lite(u.g, look) ? thin : full).push(u);
  const defs = [...c.meshExtra, ...(c.shadowOn ? ['SHADOW'] : []), ...(c.sec ? ['CLIP'] : [])];
  const pF = full.length ? h.mergeVariant('mesh', defs) : null;
  const pL = thin.length ? h.mergeVariant('mesh', [...defs, 'MSHIFT']) : null;
  const ok =
    (!!pF || !!pL) &&
    (!c.shadowOn || !!c.shadowVp) &&
    putRuns(
      h,
      runs,
      'f',
      (g) => (lite(g, look) ? strideL : stride),
      frameSig(c, [stride], [c.shadowOn ? c.shadowVp : null, c.sec ? c.clipOf(undefined) : null]),
      (fresh) => {
        if (full.length) faceFill(h, c, full, stride, 'f', fresh);
        if (thin.length) liteFaceFill(h, c, thin, strideL, fresh);
      },
    );
  /** 이 차례에서 자리 자료 그림 단위·공통 열을 건 프로그램(meshUse가 프로그램을 바꾸면 단위를 인스턴싱 단위로 되돌려 다시 건다) */
  const set = new Set<Prog>();
  let common: LiteMesh | null = null;
  for (const op of ops) {
    if (typeof op === 'function') {
      op();
      continue;
    }
    const L = lite(op.g, look);
    const p = L ? pL : pF;
    if (!ok || !p) {
      for (let i = op.a; i < op.b; i++) {
        const r = op.g.recs[i]!;
        c.use(plain(r));
        c.drawParts(r, op.cols[i - op.o]!, op.alpha, op.tint, op.g.cull);
      }
      continue;
    }
    // 자리 자료는 저장소 그림 단위에서(meshUse가 인스턴싱 단위로 건 것을 바꾼다)
    if (c.use(p) || !set.has(p)) {
      gl.uniform1i(h.loc(p, 'u_inst'), STORE_UNIT);
      if (L && !set.has(p)) {
        const m = (common ??= liteMesh(c));
        gl.uniformMatrix4fv(h.loc(p, 'u_mvp0'), false, m.mvp);
        gl.uniformMatrix4fv(h.loc(p, 'u_mv0'), false, m.mv);
        gl.uniformMatrix3fv(h.loc(p, 'u_nmat0'), false, m.nmat);
        if (m.shadow) gl.uniformMatrix4fv(h.loc(p, 'u_shadow0'), false, m.shadow);
      }
      set.add(p);
    }
    gl.uniform1i(h.loc(p, 'u_instBase'), op.base);
    if (p.shadow || p.clip1) gl.uniform1i(h.loc(p, 'u_instStride'), L ? strideL : stride);
    // 정점 색 쓰기는 자리 자료 깃발이라 균일 변수 u_vcol이 없다(기억에는 false로)
    if (c.flagsNew(false, op.g.hasNormals, op.tint, op.alpha)) {
      gl.uniform1f(h.loc(p, 'u_hasNrm'), op.g.hasNormals ? 1 : 0);
      gl.uniform4f(h.loc(p, 'u_tint'), c.hiTint[0], c.hiTint[1], c.hiTint[2], op.tint);
      gl.uniform1f(h.loc(p, 'u_alpha'), op.alpha);
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
 * 그 선분 구간 그리기 한 번. 변종이 번역 중이거나 자리 자료가 모자라면 구간도 그물마다 drawLines로. 0.57.0 render() 안에서 이 조각으로 옮김(GL 호출 차례는 같다).
 * 0.60.0 단면 하나(c.sec)도 묶어 그린다: 그물마다 그릴 때(drawLines의 clip — 그 그물 로컬 평면)와 같은 평면을 자리 자료 7번째 텍셀에(MCLIP — 가는 선은 CLIP도, 0.59.0까지는 단면이 있으면 윤곽선·숨은 점선을 모두 그물마다 그렸다).
 * 0.61.0 굵기는 구간마다(op.w — 강조한 그물 2): 굵은 선·가는 선 판정(drawLines와 같다)과 프로그램을 구간마다 고르고, 고정 균일 변수는 이 차례에서 프로그램마다 한 번
 * (프로그램의 균일 변수 값은 사이에 낀 그물마다 그리기가 바꾸지 않는다 — 다른 프로그램이다). 한쪽 변종이 번역 중이면 그 구간만 그물마다
 */
export function drawEdges(h: MergeHost, c: MergeDrawCtx, ops: readonly MergeOp[], o: { dashed: boolean; bias: number; capz: boolean }, memo: LineMemo | null): void {
  const gl = h.gl, st = c.st, stats = c.stats;
  const runs = ops.filter((x): x is MergeRun => typeof x !== 'function');
  const lineFog = st.fog ?? null;
  const clip = c.sec ? c.clipOf : null;
  const texels = MERGE_LINE_TEXELS + (clip ? 1 : 0);
  // 0.62.0 이동뿐인 묶음은 MSHIFT 꼴(선 2텍셀 + 안개 z 1 + 단면 1 — 0~2열·안개 z 행 앞 세 칸은 균일 변수)
  const texelsL = MERGE_LITE_LINE_TEXELS + (lineFog ? 1 : 0) + (clip ? 1 : 0);
  const look = c.look;
  const wideOf = (u: MergeRun): boolean => o.dashed || u.w * st.dpr > 1.01;
  const variant = (wide: boolean, L: boolean): Prog | null =>
    h.mergeVariant(wide ? 'wide' : 'thin', [
      ...(wide && o.capz ? ['CAPZ'] : []),
      ...(lineFog ? ['FOG'] : []),
      ...(clip ? (wide ? ['MCLIP'] : ['CLIP', 'MCLIP']) : []),
      ...(L ? ['MSHIFT'] : []),
    ]);
  /** 굵은 선·가는 선 × 온 꼴·이동뿐 꼴 변종(그 구간이 있을 때만 — 번호 wide·2 + lite) */
  const progs: (Prog | null)[] = [null, null, null, null];
  const asked = [false, false, false, false];
  const full: MergeRun[] = [], thin: MergeRun[] = [];
  for (const u of runs) {
    const L = lite(u.g, look);
    (L ? thin : full).push(u);
    const k = (wideOf(u) ? 2 : 0) + (L ? 1 : 0);
    if (!asked[k]) {
      asked[k] = true;
      progs[k] = variant(k >= 2, L);
    }
  }
  // 0.61.0 자리 종류: 윤곽선 e·숨은 점선 d(색이 달라 한 프레임에 둘 다 그리면 자리를 따로 둔다)
  const kind = o.dashed ? 'd' : 'e';
  const ok =
    progs.some((p) => !!p) &&
    putRuns(
      h,
      runs,
      kind,
      (g) => (lite(g, look) ? texelsL : texels),
      frameSig(c, [texels, lineFog ? 1 : 0], [clip ? clip(undefined) : null]),
      (fresh) => {
        if (full.length) lineFill(h, c, full, !!lineFog, texels, kind, fresh);
        if (thin.length) liteLineFill(h, c, thin, !!lineFog, texelsL, kind, fresh);
      },
    );
  /** 지금 쓰는 프로그램(사이에 그물마다 그리기가 끼면 null)·이 차례에서 고정 균일 변수를 보낸 프로그램과 그 굵기 */
  let P: Prog | null = null;
  const done = new Map<Prog, number>();
  let common: LiteLine | null = null;
  for (const op of ops) {
    if (typeof op === 'function') {
      op();
      P = null;
      continue;
    }
    const wide = wideOf(op);
    const L = lite(op.g, look);
    const Q = ok ? progs[(wide ? 2 : 0) + (L ? 1 : 0)]! : null;
    if (!Q) {
      for (let i = op.a; i < op.b; i++) {
        const r = op.g.recs[i]!;
        const model = c.mm(r);
        const e = { color: op.cols[i - op.o]!, vcol: false, width: op.w, dashed: o.dashed, alpha: op.alpha, clip: clip ? clip(model) : null, clips: null, first: 0, count: r.edges!.n };
        h.drawLines(c.f, r.edges!, model, o.capz ? { ...e, bias: o.bias, capz: true } : e, st, stats, memo);
      }
      P = null;
      continue;
    }
    if (Q !== P) {
      P = Q;
      gl.useProgram(Q.p);
      if (!done.has(Q)) {
        // drawLines와 같은 고정 균일 변수(선 색은 자리 자료 — 안개 깊이 행도)
        done.set(Q, -1);
        gl.uniform1i(h.loc(Q, 'u_inst'), STORE_UNIT);
        gl.uniform1f(h.loc(Q, 'u_vcol'), 0);
        gl.uniform4f(h.loc(Q, 'u_override'), 0, 0, 0, 0);
        gl.uniform1f(h.loc(Q, 'u_bias'), o.bias);
        if (wide) {
          const vw = st.viewport ? st.viewport[0] : gl.drawingBufferWidth, vh = st.viewport ? st.viewport[1] : gl.drawingBufferHeight;
          gl.uniform2f(h.loc(Q, 'u_viewport'), vw, vh);
          gl.uniform2f(h.loc(Q, 'u_dash'), o.dashed ? c.dash[0] * st.dpr : 0, c.dash[1] * st.dpr);
          // 단면이 있으면 평면은 자리 자료(균일 변수가 아니다)
          if (!clip) gl.uniform4f(h.loc(Q, 'u_clip'), NO_CLIP[0], NO_CLIP[1], NO_CLIP[2], NO_CLIP[3]);
        }
        if (lineFog) {
          gl.uniform4f(h.loc(Q, 'u_fogCol'), lineFog.color[0], lineFog.color[1], lineFog.color[2], 1);
          gl.uniform2f(h.loc(Q, 'u_fog'), lineFog.start, lineFog.end);
        }
        if (L) {
          // 0.62.0 이동뿐 꼴: 시점 투영 · 모형 0~2열(그물마다 같다)·안개 z 행 앞 세 칸
          const m = (common ??= liteLine(c));
          gl.uniformMatrix4fv(h.loc(Q, 'u_mvp0'), false, m.mvp);
          if (lineFog) gl.uniform3f(h.loc(Q, 'u_mvz0'), m.mvz[0]!, m.mvz[1]!, m.mvz[2]!);
        }
      }
    }
    // 굵은 선 굵기(장치 화소 — drawLines의 wDev)
    if (wide && done.get(Q) !== op.w * st.dpr) {
      done.set(Q, op.w * st.dpr);
      gl.uniform1f(h.loc(Q, 'u_width'), op.w * st.dpr);
    }
    gl.uniform1i(h.loc(Q, 'u_instBase'), op.base);
    gl.uniform1f(h.loc(Q, 'u_alpha'), op.alpha);
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
 * 0.52.0 묶음 면 자리 자료 하나(12텍셀): setMeshMatrix와 같은 double 곱(시점 · 모형, 투영 · 그것, 법선 행렬)을 float32로(instMeshes와 같은 셈)
 * + 그물 색(meshDraw의 u_color와 같은 값) + 정점 색 쓰기 깃발(meshDraw의 u_vcol — 법선 행렬 첫 텍셀의 w).
 * 0.53.0: stride(렌더러 mergeStride)·shadow(빛 투영·시점 — 그림자 행렬 4텍셀)·clip(모형 → 로컬 평면 — 맨 끝 1텍셀). 0.61.0 d의 o번째 값부터 쓴다(자리 자료 저장소)
 */
export function faceTexels(
  h: MergeHost,
  f: ViewFrame,
  model: ArrayLike<number> | undefined,
  c: Rgba,
  vcol: boolean,
  d: Float32Array,
  o: number,
  stride = MERGE_MESH_TEXELS,
  shadow: ArrayLike<number> | null = null,
  clip: ((model: ArrayLike<number> | undefined) => Readonly<Plane4> | null) | null = null,
): void {
  const m3 = h.instM3;
  const mv = model ? mat4Mul(f.view, model, h.d4a) : f.view;
  const mvp = model ? mat4Mul(f.proj, mv, h.d4b) : f.viewProj;
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
 * 0.52.0 묶음 선 자리 자료 하나(6텍셀): drawLines와 같은 시점·투영 · 모형, 안개면 setLineFog와 같은 시점 · 모형의 z 행(instLines와 같은 셈),
 * 선 색(drawLines의 u_color와 같은 값). 0.60.0: clip을 주면 단면 하나의 로컬 평면(drawLines의 u_clip과 같은 값 — 7번째 텍셀). 0.61.0 d의 o번째 값부터 쓴다
 */
export function lineTexels(
  h: MergeHost,
  f: ViewFrame,
  model: ArrayLike<number> | undefined,
  c: Rgba,
  fog: boolean,
  d: Float32Array,
  o: number,
  clip: ((model: ArrayLike<number> | undefined) => Readonly<Plane4> | null) | null = null,
): void {
  const mvp = model ? mat4Mul(f.viewProj, model, h.d4a) : f.viewProj;
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
  if (clip) putPlane(d, o + 24, clip(model));
}

function putPlane(d: Float32Array, q: number, p: Readonly<Plane4> | null): void {
  const x = p ?? NO_CLIP;
  d[q] = x[0];
  d[q + 1] = x[1];
  d[q + 2] = x[2];
  d[q + 3] = x[3];
}

/**
 * 0.60.0 이동뿐인 모형인지(왼쪽 위 3×3이 단위 행렬이고 그 세 열의 w 칸이 0 — 원점만 준 그물). mat4Mul의 열 c는 b의 열 c만 읽고 0에서 더해 가므로,
 * 이런 모형과의 곱은 0~2열이 단위 행렬과의 곱과 비트까지 같다(모형 칸의 −0도 — 0 + x·(±0)은 부호가 남지 않는다). 그래서 0~2열·법선 행렬(왼쪽 위 3×3만 읽는다)은
 * 한 그리기에 한 번 세고 그물마다 3열(이동)만 센다
 */
export function shiftOnly(m: ArrayLike<number>): boolean {
  return m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 0 && m[4] === 0 && m[5] === 1 && m[6] === 0 && m[7] === 0 && m[8] === 0 && m[9] === 0 && m[10] === 1 && m[11] === 0;
}

const ID4 = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** 0.60.0 a · (모형 3열 b12…b15)의 네 값을 o[at…at+3]에(mat4Mul의 c = 12와 같은 셈·같은 차례) */
function col3(a: ArrayLike<number>, b0: number, b1: number, b2: number, b3: number, o: Float64Array, at: number): void {
  o[at] = 0 + a[0]! * b0 + a[4]! * b1 + a[8]! * b2 + a[12]! * b3;
  o[at + 1] = 0 + a[1]! * b0 + a[5]! * b1 + a[9]! * b2 + a[13]! * b3;
  o[at + 2] = 0 + a[2]! * b0 + a[6]! * b1 + a[10]! * b2 + a[14]! * b3;
  o[at + 3] = 0 + a[3]! * b0 + a[7]! * b1 + a[11]! * b2 + a[15]! * b3;
}

/**
 * 0.60.0 묶음 면 자리 자료를 구간 차례로. 이동뿐인 모형(shiftOnly)은 이 그리기의 공통 텍셀(시점 · 모형·투영 · 그것의 0~2열, 법선 행렬, 그림자 행렬 0~2열)을 복사하고
 * 3열만 센다 — faceTexels와 같은 셈이라 float32 값이 비트까지 같다. 그 밖의 모형(회전·늘이기·겉모습 행렬)과 모형이 없는 그물은 faceTexels 그대로.
 * 0.61.0 자리 자료 저장소의 그 묶음 kind 자리에(그물 번호 i → base + i·stride) 낡은 자리만 쓴다: 판(프레임 값 — 겉모습 유무도)·정점 색 깃발·색(float32)이 지난번 쓴 것과 같으면
 * 건너뛴다. 모형은 겉모습이 있을 때만 견준다(없으면 그물 기록의 모형은 묶음이 사는 동안 그대로 — 그물 기록을 보지 않는다. 8만에서 기록을 그물마다 읽는 것이 프레임 대부분이었다).
 * 0.62.0 fresh(이 차례에 판이 올랐다 — 그 종류 자리가 모두 낡았다)면 자리마다 견주지 않고 구간째 쓴 것으로 적는다
 */
export function faceFill(h: MergeHost, c: MergeDrawCtx, runs: readonly MergeRun[], stride: number, kind = 'f', fresh = false): void {
  const f = c.f, shadow = c.shadowVp, clip = c.sec ? c.clipOf : null, look = c.look;
  const S = stride * 4;
  const V = f.view, P = f.proj;
  const t = h.d4c;
  const s = h.mgStore!, d = s.buf, D = s.dirty, gen = s.gen[kind]!, F = Math.fround;
  let tpl: Float32Array | null = null;
  let cw: [Readonly<Plane4>, Readonly<Plane4>] | undefined;
  for (const u of runs) {
    const g = u.g, recs = g.recs, cols = u.cols, vcs = u.vc, o0 = u.o;
    const R = g.ps![kind]!, at = R.at, mdl = R.mdl, base = R.base;
    // 겉모습이 없으면 모형은 그물 기록 것 그대로라 묶음에 모아 둔 3열을 쓴다(그물 기록을 그물마다 보지 않는다)
    if (!look) shiftsOf(g);
    const org = look ? null : g.org!, sft = look ? null : g.sft!;
    if (fresh && u.b > u.a) dirty(D, base + u.a * stride, (u.b - u.a) * stride);
    for (let i = u.a; i < u.b; i++) {
      const col = cols[i - o0]!, vcol = vcs[i - o0]!;
      const o = (base + i * stride) * 4;
      const lm = look ? c.mm(recs[i]!) : undefined;
      if (!fresh) {
        if (at[i] === gen && (!look || mdl[i] === lm) && d[o + 35] === (vcol ? 1 : 0) && d[o + 44] === F(col[0]) && d[o + 45] === F(col[1]) && d[o + 46] === F(col[2]) && d[o + 47] === F(col[3]))
          continue;
        dirty(D, base + i * stride, stride);
      }
      at[i] = gen;
      if (look) mdl[i] = lm;
      let b0: number, b1: number, b2: number, b3: number;
      let model: ArrayLike<number> | undefined;
      if (sft && sft[i]) {
        const q = i * 4;
        b0 = org![q]!;
        b1 = org![q + 1]!;
        b2 = org![q + 2]!;
        b3 = org![q + 3]!;
      } else {
        model = look ? lm : recs[i]!.model;
        if (!model || !shiftOnly(model)) {
          faceTexels(h, f, model, col, vcol, d, o, stride, shadow, clip);
          continue;
        }
        b0 = model[12]!;
        b1 = model[13]!;
        b2 = model[14]!;
        b3 = model[15]!;
      }
      if (!tpl) {
        tpl = new Float32Array(S);
        const mv = mat4Mul(V, ID4), mvp = mat4Mul(P, mv);
        for (let j = 0; j < 12; j++) {
          tpl[j] = mvp[j]!;
          tpl[16 + j] = mv[j]!;
        }
        const m3 = normalMatrix(mv, new Float32Array(9));
        for (let j = 0; j < 3; j++) {
          tpl[32 + j * 4] = m3[j * 3]!;
          tpl[33 + j * 4] = m3[j * 3 + 1]!;
          tpl[34 + j * 4] = m3[j * 3 + 2]!;
        }
        if (shadow) {
          const lv = mat4Mul(shadow, ID4);
          for (let j = 0; j < 12; j++) tpl[48 + j] = lv[j]!;
          for (let j = 0; j < 3; j++) for (let r = 0; r < 3; r++) tpl[48 + j * 4 + r] = lv[j * 4 + r]! * 0.5 + lv[j * 4 + 3]! * 0.5;
        }
      }
      d.set(tpl, o);
      // 시점 · 모형 3열(t[0…3]), 투영 · 그것 3열(t[4…7])
      col3(V, b0, b1, b2, b3, t, 0);
      col3(P, t[0]!, t[1]!, t[2]!, t[3]!, t, 4);
      d[o + 12] = t[4]!;
      d[o + 13] = t[5]!;
      d[o + 14] = t[6]!;
      d[o + 15] = t[7]!;
      d[o + 28] = t[0]!;
      d[o + 29] = t[1]!;
      d[o + 30] = t[2]!;
      d[o + 31] = t[3]!;
      d[o + 35] = vcol ? 1 : 0;
      d[o + 44] = col[0];
      d[o + 45] = col[1];
      d[o + 46] = col[2];
      d[o + 47] = col[3];
      if (shadow) {
        col3(shadow, b0, b1, b2, b3, t, 8);
        d[o + 60] = t[8]! * 0.5 + t[11]! * 0.5;
        d[o + 61] = t[9]! * 0.5 + t[11]! * 0.5;
        d[o + 62] = t[10]! * 0.5 + t[11]! * 0.5;
        d[o + 63] = t[11]!;
      }
      if (clip) {
        const q = o + (stride - 1) * 4;
        if (sft && sft[i] === 2) shiftPlane(d, q, cw ??= planes(clip), org!, i * 4);
        else putPlane(d, q, clip(sft ? recs[i]!.model : model));
      }
    }
  }
}

/** 0.60.0 단면 평면(세계 — planeToLocal(평면, 없음))과 단위 행렬 로컬 평면(0~2칸은 이동뿐인 sft 2 그물과 같은 값) */
function planes(clip: (model: ArrayLike<number> | undefined) => Readonly<Plane4> | null): [Readonly<Plane4>, Readonly<Plane4>] {
  return [clip(undefined) ?? NO_CLIP, clip(ID4) ?? NO_CLIP];
}

/** 0.60.0 이동뿐인(sft 2) 그물의 로컬 평면: 0~2칸은 공통, 3칸은 planeToLocal과 같은 셈(m12·a + m13·b + m14·c + m15·w — 모형 3열 org[q…]) */
function shiftPlane(d: Float32Array, at: number, cw: [Readonly<Plane4>, Readonly<Plane4>], org: Float64Array, q: number): void {
  const [w, l] = cw;
  d[at] = l[0];
  d[at + 1] = l[1];
  d[at + 2] = l[2];
  d[at + 3] = org[q]! * w[0] + org[q + 1]! * w[1] + org[q + 2]! * w[2] + org[q + 3]! * w[3];
}

/**
 * 0.60.0 묶음 선 자리 자료를 구간 차례로(faceFill과 같은 길 — 이동뿐인 모형은 시점·투영 · 모형의 0~2열·안개 z 행 앞 세 칸을 복사하고 3열만 센다).
 * 0.61.0 저장소의 그 묶음 kind 자리에 낡은 자리만(판·모형·색이 같으면 건너뛴다). 0.62.0 fresh면 견주지 않고 구간째(faceFill과 같다)
 */
export function lineFill(h: MergeHost, c: MergeDrawCtx, runs: readonly MergeRun[], fog: boolean, texels: number, kind = 'e', fresh = false): void {
  const f = c.f, clip = c.sec ? c.clipOf : null, look = c.look;
  const S = texels * 4;
  const Q = f.viewProj, V = f.view;
  const t = h.d4c;
  const s = h.mgStore!, d = s.buf, D = s.dirty, gen = s.gen[kind]!, F = Math.fround;
  let tpl: Float32Array | null = null;
  let cw: [Readonly<Plane4>, Readonly<Plane4>] | undefined;
  for (const u of runs) {
    const g = u.g, recs = g.recs, cols = u.cols, o0 = u.o;
    const R = g.ps![kind]!, at = R.at, mdl = R.mdl, base = R.base;
    if (!look) shiftsOf(g);
    const org = look ? null : g.org!, sft = look ? null : g.sft!;
    if (fresh && u.b > u.a) dirty(D, base + u.a * texels, (u.b - u.a) * texels);
    for (let i = u.a; i < u.b; i++) {
      const col = cols[i - o0]!;
      const o = (base + i * texels) * 4;
      const lm = look ? c.mm(recs[i]!) : undefined;
      if (!fresh) {
        if (at[i] === gen && (!look || mdl[i] === lm) && d[o + 20] === F(col[0]) && d[o + 21] === F(col[1]) && d[o + 22] === F(col[2]) && d[o + 23] === F(col[3])) continue;
        dirty(D, base + i * texels, texels);
      }
      at[i] = gen;
      if (look) mdl[i] = lm;
      let b0: number, b1: number, b2: number, b3: number;
      let model: ArrayLike<number> | undefined;
      if (sft && sft[i]) {
        const q = i * 4;
        b0 = org![q]!;
        b1 = org![q + 1]!;
        b2 = org![q + 2]!;
        b3 = org![q + 3]!;
      } else {
        model = look ? lm : recs[i]!.model;
        if (!model || !shiftOnly(model)) {
          lineTexels(h, f, model, col, fog, d, o, clip);
          continue;
        }
        b0 = model[12]!;
        b1 = model[13]!;
        b2 = model[14]!;
        b3 = model[15]!;
      }
      if (!tpl) {
        tpl = new Float32Array(S);
        const mvp = mat4Mul(Q, ID4);
        for (let j = 0; j < 12; j++) tpl[j] = mvp[j]!;
        if (fog) {
          const mv = mat4Mul(V, ID4);
          tpl[16] = mv[2]!;
          tpl[17] = mv[6]!;
          tpl[18] = mv[10]!;
        }
      }
      d.set(tpl, o);
      col3(Q, b0, b1, b2, b3, t, 0);
      d[o + 12] = t[0]!;
      d[o + 13] = t[1]!;
      d[o + 14] = t[2]!;
      d[o + 15] = t[3]!;
      if (fog) d[o + 19] = 0 + V[2]! * b0 + V[6]! * b1 + V[10]! * b2 + V[14]! * b3;
      d[o + 20] = col[0];
      d[o + 21] = col[1];
      d[o + 22] = col[2];
      d[o + 23] = col[3];
      if (clip) {
        if (sft && sft[i] === 2) shiftPlane(d, o + 24, cw ??= planes(clip), org!, i * 4);
        else putPlane(d, o + 24, clip(sft ? recs[i]!.model : model));
      }
    }
  }
}

/**
 * 0.62.0 이동뿐 꼴(MSHIFT) 면의 공통 균일 변수(그리기 차례마다 한 번): 시점 투영 · 모형·시점 · 모형의 0~2열(3열 칸은 0 — 셰이더가 읽지 않는다)·법선 행렬·
 * 그림자 행렬 0~2열. faceFill이 이동뿐인 모형에 복사하던 공통 텍셀(tpl)과 같은 float32 값이다
 */
export interface LiteMesh {
  mvp: Float32Array;
  mv: Float32Array;
  nmat: Float32Array;
  shadow: Float32Array | null;
}

export function liteMesh(c: Pick<MergeDrawCtx, 'f' | 'shadowVp'>): LiteMesh {
  const mv = mat4Mul(c.f.view, ID4), mvp = mat4Mul(c.f.proj, mv);
  const out: LiteMesh = { mvp: new Float32Array(16), mv: new Float32Array(16), nmat: normalMatrix(mv, new Float32Array(9)), shadow: null };
  for (let j = 0; j < 12; j++) {
    out.mvp[j] = mvp[j]!;
    out.mv[j] = mv[j]!;
  }
  if (c.shadowVp) {
    const lv = mat4Mul(c.shadowVp, ID4), s = new Float32Array(16);
    for (let j = 0; j < 3; j++) {
      for (let r = 0; r < 3; r++) s[j * 4 + r] = lv[j * 4 + r]! * 0.5 + lv[j * 4 + 3]! * 0.5;
      s[j * 4 + 3] = lv[j * 4 + 3]!;
    }
    out.shadow = s;
  }
  return out;
}

/** 0.62.0 이동뿐 꼴(MSHIFT) 선의 공통 균일 변수: 시점 투영 · 모형 0~2열·안개 z 행 앞 세 칸(lineFill의 공통 텍셀과 같은 float32 값) */
export interface LiteLine {
  mvp: Float32Array;
  mvz: Float32Array;
}

export function liteLine(c: Pick<MergeDrawCtx, 'f'>): LiteLine {
  const mvp = mat4Mul(c.f.viewProj, ID4), mv = mat4Mul(c.f.view, ID4);
  const out: LiteLine = { mvp: new Float32Array(16), mvz: new Float32Array([mv[2]!, mv[6]!, mv[10]!]) };
  for (let j = 0; j < 12; j++) out.mvp[j] = mvp[j]!;
  return out;
}

/**
 * 0.62.0 이동뿐 꼴(MSHIFT — 묶음 그물 모형이 모두 이동뿐이고 겉모습이 없을 때) 면 자리: 텍셀 0 = 시점 투영 · 모형 3열, 1 = 시점 · 모형 3열 xyz와 깃발(w — 정점 색 쓰기),
 * 2 = 색, 그다음 그림자 3열(그림자 — faceFill의 15번째 텍셀과 같은 값)·로컬 평면(단면). faceFill의 이동뿐 길과 같은 셈·같은 차례라 그 칸의 float32 값이 비트까지 같다
 * (0~2열·법선 행렬은 liteMesh 균일 변수). 판·깃발·색이 같으면 그 자리는 건너뛴다(fresh면 견주지 않는다). 시점·투영·그림자 행렬 칸은 고리 밖에서 한 번 읽는다
 */
export function liteFaceFill(h: MergeHost, c: MergeDrawCtx, runs: readonly MergeRun[], stride: number, fresh: boolean, kind = 'f'): void {
  const V = c.f.view, P = c.f.proj, L = c.shadowVp, clip = c.sec ? c.clipOf : null;
  const s = h.mgStore!, d = s.buf, D = s.dirty, gen = s.gen[kind]!, F = Math.fround;
  const v0 = V[0]!, v1 = V[1]!, v2 = V[2]!, v3 = V[3]!, v4 = V[4]!, v5 = V[5]!, v6 = V[6]!, v7 = V[7]!;
  const v8 = V[8]!, v9 = V[9]!, v10 = V[10]!, v11 = V[11]!, v12 = V[12]!, v13 = V[13]!, v14 = V[14]!, v15 = V[15]!;
  const p0 = P[0]!, p1 = P[1]!, p2 = P[2]!, p3 = P[3]!, p4 = P[4]!, p5 = P[5]!, p6 = P[6]!, p7 = P[7]!;
  const p8 = P[8]!, p9 = P[9]!, p10 = P[10]!, p11 = P[11]!, p12 = P[12]!, p13 = P[13]!, p14 = P[14]!, p15 = P[15]!;
  const sh = !!L, Z = L ?? ID4;
  const l0 = Z[0]!, l1 = Z[1]!, l2 = Z[2]!, l3 = Z[3]!, l4 = Z[4]!, l5 = Z[5]!, l6 = Z[6]!, l7 = Z[7]!;
  const l8 = Z[8]!, l9 = Z[9]!, l10 = Z[10]!, l11 = Z[11]!, l12 = Z[12]!, l13 = Z[13]!, l14 = Z[14]!, l15 = Z[15]!;
  const Q = c.f.viewProj;
  let cw: [Readonly<Plane4>, Readonly<Plane4>] | undefined;
  for (const u of runs) {
    const g = u.g, cols = u.cols, vcs = u.vc, o0 = u.o;
    const R = g.ps![kind]!, at = R.at, base = R.base;
    shiftsOf(g);
    const org = g.org!, sft = g.sft!, nom = g.nom;
    if (fresh && u.b > u.a) dirty(D, base + u.a * stride, (u.b - u.a) * stride);
    for (let i = u.a; i < u.b; i++) {
      const col = cols[i - o0]!, fl = vcs[i - o0] ? 1 : 0;
      const o = (base + i * stride) * 4;
      if (!fresh) {
        if (at[i] === gen && d[o + 7] === fl && d[o + 8] === F(col[0]) && d[o + 9] === F(col[1]) && d[o + 10] === F(col[2]) && d[o + 11] === F(col[3])) continue;
        dirty(D, base + i * stride, stride);
      }
      at[i] = gen;
      if (nom && nom[i]) {
        // 모형이 없는 그물: faceTexels와 같이 시점 투영·시점 행렬 3열 그대로, 그림자 행렬 3열(같은 맞춤), 세계 평면
        d[o] = Q[12]!;
        d[o + 1] = Q[13]!;
        d[o + 2] = Q[14]!;
        d[o + 3] = Q[15]!;
        d[o + 4] = v12;
        d[o + 5] = v13;
        d[o + 6] = v14;
        d[o + 7] = fl;
        d[o + 8] = col[0];
        d[o + 9] = col[1];
        d[o + 10] = col[2];
        d[o + 11] = col[3];
        let e = o + 12;
        if (sh) {
          d[e] = l12 * 0.5 + l15 * 0.5;
          d[e + 1] = l13 * 0.5 + l15 * 0.5;
          d[e + 2] = l14 * 0.5 + l15 * 0.5;
          d[e + 3] = l15;
          e += 4;
        }
        if (clip) putPlane(d, e, clip(undefined));
        continue;
      }
      const q = i * 4, b0 = org[q]!, b1 = org[q + 1]!, b2 = org[q + 2]!, b3 = org[q + 3]!;
      // 시점 · 모형 3열(col3(V, b)), 투영 · 그것 3열(col3(P, t)) — mat4Mul과 같은 차례로 0에서 더해 간다
      const t0 = 0 + v0 * b0 + v4 * b1 + v8 * b2 + v12 * b3;
      const t1 = 0 + v1 * b0 + v5 * b1 + v9 * b2 + v13 * b3;
      const t2 = 0 + v2 * b0 + v6 * b1 + v10 * b2 + v14 * b3;
      const t3 = 0 + v3 * b0 + v7 * b1 + v11 * b2 + v15 * b3;
      d[o] = 0 + p0 * t0 + p4 * t1 + p8 * t2 + p12 * t3;
      d[o + 1] = 0 + p1 * t0 + p5 * t1 + p9 * t2 + p13 * t3;
      d[o + 2] = 0 + p2 * t0 + p6 * t1 + p10 * t2 + p14 * t3;
      d[o + 3] = 0 + p3 * t0 + p7 * t1 + p11 * t2 + p15 * t3;
      d[o + 4] = t0;
      d[o + 5] = t1;
      d[o + 6] = t2;
      d[o + 7] = fl;
      d[o + 8] = col[0];
      d[o + 9] = col[1];
      d[o + 10] = col[2];
      d[o + 11] = col[3];
      let e = o + 12;
      if (sh) {
        const s0 = 0 + l0 * b0 + l4 * b1 + l8 * b2 + l12 * b3;
        const s1 = 0 + l1 * b0 + l5 * b1 + l9 * b2 + l13 * b3;
        const s2 = 0 + l2 * b0 + l6 * b1 + l10 * b2 + l14 * b3;
        const s3 = 0 + l3 * b0 + l7 * b1 + l11 * b2 + l15 * b3;
        d[e] = s0 * 0.5 + s3 * 0.5;
        d[e + 1] = s1 * 0.5 + s3 * 0.5;
        d[e + 2] = s2 * 0.5 + s3 * 0.5;
        d[e + 3] = s3;
        e += 4;
      }
      if (clip) {
        if (sft[i] === 2) shiftPlane(d, e, (cw ??= planes(clip)), org, q);
        else putPlane(d, e, clip(g.recs[i]!.model));
      }
    }
  }
}

/**
 * 0.62.0 이동뿐 꼴(MSHIFT) 선 자리: 텍셀 0 = 시점 투영 · 모형 3열, 1 = 색, 그다음 안개 z 행 끝 칸(x — 안개)·로컬 평면(단면). lineFill의 이동뿐 길과 같은 셈이라
 * 그 칸의 float32 값이 비트까지 같다(0~2열·z 행 앞 세 칸은 liteLine 균일 변수). 판·색이 같으면 건너뛴다(fresh면 견주지 않는다)
 */
export function liteLineFill(h: MergeHost, c: MergeDrawCtx, runs: readonly MergeRun[], fog: boolean, texels: number, kind: string, fresh: boolean): void {
  const Q = c.f.viewProj, V = c.f.view, clip = c.sec ? c.clipOf : null;
  const s = h.mgStore!, d = s.buf, D = s.dirty, gen = s.gen[kind]!, F = Math.fround;
  const q0 = Q[0]!, q1 = Q[1]!, q2 = Q[2]!, q3 = Q[3]!, q4 = Q[4]!, q5 = Q[5]!, q6 = Q[6]!, q7 = Q[7]!;
  const q8 = Q[8]!, q9 = Q[9]!, q10 = Q[10]!, q11 = Q[11]!, q12 = Q[12]!, q13 = Q[13]!, q14 = Q[14]!, q15 = Q[15]!;
  const v2 = V[2]!, v6 = V[6]!, v10 = V[10]!, v14 = V[14]!;
  let cw: [Readonly<Plane4>, Readonly<Plane4>] | undefined;
  for (const u of runs) {
    const g = u.g, cols = u.cols, o0 = u.o;
    const R = g.ps![kind]!, at = R.at, base = R.base;
    shiftsOf(g);
    const org = g.org!, sft = g.sft!, nom = g.nom;
    if (fresh && u.b > u.a) dirty(D, base + u.a * texels, (u.b - u.a) * texels);
    for (let i = u.a; i < u.b; i++) {
      const col = cols[i - o0]!;
      const o = (base + i * texels) * 4;
      if (!fresh) {
        if (at[i] === gen && d[o + 4] === F(col[0]) && d[o + 5] === F(col[1]) && d[o + 6] === F(col[2]) && d[o + 7] === F(col[3])) continue;
        dirty(D, base + i * texels, texels);
      }
      at[i] = gen;
      // 모형이 없는 그물: lineTexels와 같이 시점 투영 3열·시점 z 행 끝 칸 그대로
      const no = !!nom && nom[i] === 1;
      const q = i * 4, b0 = org[q]!, b1 = org[q + 1]!, b2 = org[q + 2]!, b3 = org[q + 3]!;
      d[o] = no ? q12 : 0 + q0 * b0 + q4 * b1 + q8 * b2 + q12 * b3;
      d[o + 1] = no ? q13 : 0 + q1 * b0 + q5 * b1 + q9 * b2 + q13 * b3;
      d[o + 2] = no ? q14 : 0 + q2 * b0 + q6 * b1 + q10 * b2 + q14 * b3;
      d[o + 3] = no ? q15 : 0 + q3 * b0 + q7 * b1 + q11 * b2 + q15 * b3;
      d[o + 4] = col[0];
      d[o + 5] = col[1];
      d[o + 6] = col[2];
      d[o + 7] = col[3];
      let e = o + 8;
      if (fog) {
        d[e] = no ? v14 : 0 + v2 * b0 + v6 * b1 + v10 * b2 + v14 * b3;
        d[e + 1] = 0;
        d[e + 2] = 0;
        d[e + 3] = 0;
        e += 4;
      }
      if (clip) {
        if (sft[i] === 2) shiftPlane(d, e, (cw ??= planes(clip)), org, q);
        else putPlane(d, e, clip(g.recs[i]!.model));
      }
    }
  }
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
 * 바꿀 자리를 하나로 찾지 못하면 예외(렌더러는 그 변종을 쓰지 않고 그물마다 그린다).
 * 0.62.0 이동뿐 꼴(MSHIFT): 0~2열(그물마다 같다)은 균일 변수 u_mvp0·u_mv0(그림자 u_shadow0 — 각 0~2열)·법선 행렬 u_nmat0, 자리에는 3열만 — 그물 자리 3텍셀
 * (시점 투영 · 모형 3열·시점 · 모형 3열 xyz와 정점 색 쓰기 w·색 — 그림자 3열·단면 평면은 그 뒤), 선 자리 2텍셀(시점 투영 · 모형 3열·색 — 안개 z 행 끝 칸 u_mvz0의 w·단면 평면은 그 뒤).
 * 행렬은 같은 float32 칸으로 이루어지고 아래 식은 그대로다(시점 · 모형 3열의 w는 시점 좌표 xyz에 들지 않는다)
 */
export function mergeShader(vs: string, kind: 'mesh' | 'line'): string {
  const lite = /^#define MSHIFT$/m.test(vs);
  const decl = !lite
    ? ''
    : kind === 'mesh'
      ? 'uniform mat4 u_mvp0;\nuniform mat4 u_mv0;\nuniform mat3 u_nmat0;\nuniform mat4 u_shadow0;\n'
      : 'uniform mat4 u_mvp0;\nuniform vec3 u_mvz0;\n';
  let s = replaceOnce(vs, 'uniform int u_instBase;\n', `uniform int u_instBase;\nlayout(location=5) in float a_item;\n${decl}`);
  s = replaceOnce(s, 'uniform vec4 u_color;\n', '');
  if (kind === 'mesh') {
    // 그물: 정점 색 쓰기(u_vcol)도 자리마다(법선 행렬 첫 텍셀의 w — 정점 색이 있는 그물과 없는 그물을 한 묶음에)
    s = replaceOnce(s, 'uniform float u_vcol;\n', '');
    s = replaceOnce(s, '  int k = u_instBase + gl_InstanceID * 11 + j;\n', `  int k = u_instBase + int(a_item) * ${lite ? 3 : 12} + j;\n`);
    // 0.53.0 그림자(SHADOW)·단면 하나(CLIP): 자리 텍셀 수 u_instStride(12 + 4 + 1)로 읽고, 그림자 행렬은 색 텍셀 뒤 12~15(단면 평면은 인스턴싱과 같이 맨 끝)
    s = replaceOnce(s, '  int k = u_instBase + gl_InstanceID * u_instStride + j;\n', '  int k = u_instBase + int(a_item) * u_instStride + j;\n');
    s = replaceOnce(
      s,
      '  mat4 u_shadowM = mat4(instAt(11), instAt(12), instAt(13), instAt(14));\n',
      lite ? '  mat4 u_shadowM = mat4(u_shadow0[0], u_shadow0[1], u_shadow0[2], instAt(3));\n' : '  mat4 u_shadowM = mat4(instAt(12), instAt(13), instAt(14), instAt(15));\n',
    );
    s = lite
      ? replaceOnce(
          s,
          '  mat4 u_mvp = mat4(instAt(0), instAt(1), instAt(2), instAt(3));\n  mat4 u_mv = mat4(instAt(4), instAt(5), instAt(6), instAt(7));\n  mat3 u_nmat = mat3(instAt(8).xyz, instAt(9).xyz, instAt(10).xyz);\n',
          '  mat4 u_mvp = mat4(u_mvp0[0], u_mvp0[1], u_mvp0[2], instAt(0));\n  vec4 m3 = instAt(1);\n  mat4 u_mv = mat4(u_mv0[0], u_mv0[1], u_mv0[2], vec4(m3.xyz, 1.0));\n  mat3 u_nmat = u_nmat0;\n  vec4 u_color = instAt(2);\n  float u_vcol = m3.w;\n',
        )
      : replaceOnce(
          s,
          '  mat3 u_nmat = mat3(instAt(8).xyz, instAt(9).xyz, instAt(10).xyz);\n',
          '  mat3 u_nmat = mat3(instAt(8).xyz, instAt(9).xyz, instAt(10).xyz);\n  vec4 u_color = instAt(11);\n  float u_vcol = instAt(8).w;\n',
        );
  } else {
    // 0.60.0 단면 하나(MCLIP): 자리마다 로컬 평면을 7번째 텍셀에서(같은 이름의 전역 변수 — 아래 식은 그대로, 굵은 선은 늘 있던 u_clip, 가는 선은 CLIP의 u_clip)
    const clip = /^#define MCLIP$/m.test(s);
    const fog = /^#define FOG$/m.test(s);
    const n = lite ? 2 + (fog ? 1 : 0) + (clip ? 1 : 0) : clip ? 7 : 6;
    s = replaceOnce(s, '  int k = u_instBase + (gl_InstanceID % u_instN) * 5 + j;\n', `  int k = u_instBase + int(a_item) * ${n} + j;\n`);
    s = replaceOnce(
      s,
      '  mat4 u_mvp = mat4(instAt(0), instAt(1), instAt(2), instAt(3));\n',
      lite
        ? `  mat4 u_mvp = mat4(u_mvp0[0], u_mvp0[1], u_mvp0[2], instAt(0));\n  vec4 u_color = instAt(1);\n${clip ? `  u_clip = instAt(${fog ? 3 : 2});\n` : ''}`
        : `  mat4 u_mvp = mat4(instAt(0), instAt(1), instAt(2), instAt(3));\n  vec4 u_color = instAt(5);\n${clip ? '  u_clip = instAt(6);\n' : ''}`,
    );
    if (lite) s = replaceOnce(s, '  vec4 u_mvz = instAt(4);\n', '  vec4 u_mvz = vec4(u_mvz0, instAt(2).x);\n');
    if (clip) s = replaceOnce(s, 'uniform vec4 u_clip;\n', 'vec4 u_clip;\n');
  }
  return s;
}
