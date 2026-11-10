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
 */
import type { AttribFormat } from './attribs';
import type { ViewFrame } from './camera';
import { mat4Mul, normalMatrix } from './math';
import { type MergeCand, type MergeSrc, mergeArrays, mergeBytes, mergeChunks, mergeChunksByKey, mergeSrcBytes } from './merge';
import { MERGE_DEAD_RATIO, MERGE_LINE_TEXELS, MERGE_LOOSE, MERGE_MESH_TEXELS, MERGE_UPLOAD_MESHES, MERGE_UPLOAD_VERTS, type MergingOptions } from './mergeopts';
import type { GpuBufferPart, MergeGroup, MeshRec } from './renderer';
import { NO_CLIP, type Plane4 } from './section';
import type { Rgba } from './types';

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
  mergeBakeMs: number;
  quadWide: WebGLBuffer;
  vaos: Set<WebGLVertexArrayObject>;
  keys: WeakMap<object, object>;
  instBuf: Float32Array;
  instM3: Float32Array;
  d4a: Float64Array;
  d4b: Float64Array;
  d4c: Float64Array;
  mergeSrcOf(r: MeshRec): { src: MergeSrc; key: string } | null;
  mergeBake(list: readonly MeshRec[]): void;
  mergeRelease(r: MeshRec): void;
  mergeWide(seg: WebGLBuffer, item: WebGLBuffer, first: number): void;
  newBuffer(target: number, src: ArrayBufferView | number, usage: number, part: GpuBufferPart): WebGLBuffer;
  glType(f: AttribFormat): number;
  dropParts(rec: object): void;
  freeKey(key: object, target: 'element'): void;
  release(slots: readonly unknown[]): void;
}

/**
 * 0.52.0 굽기를 기다리는 그물을 묶음으로 나눠 곧 굽는다(묶음에 들지 못한 그물은 그물마다 버퍼 그대로).
 * 0.53.0: 열쇠마다 굽기 단위로 고르게 나눈다(mergeChunksByKey — 정점이 많아 한 단위를 넘으면 끝 묶음이 그물 하나로 남아 그물마다 남지 않게)
 */
export function flushWait(h: MergeHost): void {
  const recs = h.mgWait;
  h.mgWait = [];
  h.mgWaitVerts = 0;
  if (recs.length < 2) return;
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
    h.mergeWide(segBuf, segItem, 0);
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
  if (r.mg) h.mergeRelease(r);
  else {
    gl.deleteVertexArray(r.vao);
    h.vaos.delete(r.vao);
    if (r.edges)
      for (const v of [r.edges.wide, r.edges.thin]) {
        gl.deleteVertexArray(v);
        h.vaos.delete(v);
      }
    h.release(r.slots);
  }
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
