/**
 * 같은 그물 자리가 아주 많은 장면 비용 재기 페이지(0.42.0 — scripts/bench/many.mjs가 base·head 두 판으로 묶어 헤드리스 Chrome에서 연다).
 * 장면: scripts/pixels/many.ts(정의 12개 × 자리 3,000, 삼각형 약 184만 — STEP 큰 조립 합성과 같은 꼴). 주소 인자 ?inst=0이면
 * 인스턴싱을 끈다(setRenderOptions({ instancing: false }) — 그 선택이 없는 판은 무시한다).
 *  - open: setScene(incremental { budgetMs }) → 다 올릴 때까지 프레임 수·벽시계·주 스레드 몫(프레임 JS 합·가장 긴 프레임·긴 작업 합)
 *  - steady: 다 올린 뒤 모드마다 조금씩 돌려 renderNow JS 시간·GPU 마침(1화소 읽기)까지·그리기 호출 수·GL 호출 수
 *    (0.43.0 모드 꼬리: +section = x 가운데 단면 하나(채우기 없음), +shadows = 해 그림자.
 *    0.44.0: +items = 그 평면이 열째 자리마다(300곳) 그물 통째, +secrange = 같은 자리의 앞 절반 삼각형 구간만.
 *    0.49.0: +ao = 주변 가림(기본 값), 꼬리 여럿 잇기 — 예 shadedEdges+profiles+ao.
 *    0.50.0: +aolow = 주변 가림 moving 'low'에 카메라를 옮기는 중으로 둔 그림 — ¼ 해상도 가림.
 *    0.51.0: +zoom = 맞춘 뒤 8배 확대(자리 대부분이 화면 밖 — 화면 밖 잘라내기))
 *  - 0.51.0 parts: 프레임 비용 나누기 — GL 호출을 종류별(그리기·uniform·묶기·상태)로 세고, 그 종류만 아무것도 하지 않는 함수로 바꿔 줄어든 JS 시간을 그 몫으로,
 *    모두 바꾼 시간을 JS 몫(GL 없이)으로, 뷰어 그리기(renderNow) − 렌더러 그리기를 뷰어 몫으로, 화면 가운데 고르기 시간(처음·그 뒤)을 고르기 몫으로 잰다.
 *  - 0.51.0 ?flat 꼴(scripts/bench/flat.ts — 자리 1만·8만, 서로 다른 배열·같은 배열 섞음·모두 같은 배열), ?cull=0이면 화면 밖 잘라내기를 끈다
 */
import { checkerBmp } from '../../src/synth';
import type { Mesh3d } from '../../src/types';
import { Viewer3d } from '../../src/viewer';
import { manyScene, type ManySpec } from '../pixels/many';
import { metalRoughBmp, normalMapBmp } from '../pixels/pbr';
import { flatScene, type FlatSpec } from './flat';

const W = 960, H = 600;
const host = document.getElementById('view')!;
host.style.width = `${W}px`;
host.style.height = `${H}px`;
const q = new URLSearchParams(location.search);
const inst = q.get('inst');
/** 0.43.0 ?pbr=1: 셋째 정의마다 바둑판 무늬에 법선·금속 거칠기 그림(64²)을 단다(그 필드를 모르는 판은 바둑판만), ?pbroff=1이면 setRenderOptions({ pbr: false }) */
const pbr = q.get('pbr') === '1';
const pbrOff = q.get('pbroff') === '1';
/** 0.51.0 ?cull=0이면 화면 밖 잘라내기를 끈다(setRenderOptions({ culling: false }) — 그 선택이 없는 판은 무시한다) */
const cullOff = q.get('cull') === '0';

/** 비용 재기 장면(?pbr=1이면 무늬 정의에 PBR 그림, 0.51.0 flat 꼴이면 자리가 많은 평평한 장면) */
function benchScene(spec: ManySpec | FlatSpec): ReturnType<typeof manyScene> {
  if ('flat' in spec) return flatScene(spec);
  if (!pbr) return manyScene(spec);
  const s = manyScene({ ...spec, texture: '바둑판' });
  s.textures = [
    { id: '바둑판', data: checkerBmp(), mime: 'image/bmp', width: 64, height: 64 },
    { id: '법선', data: normalMapBmp(), mime: 'image/bmp', width: 64, height: 64 },
    { id: '금속 거칠기', data: metalRoughBmp(), mime: 'image/bmp', width: 64, height: 64 },
  ];
  // 같은 정의 자리는 같은 PBR 필드(그물 열쇠가 같아 모아 그린다)
  s.meshes = s.meshes.map((m): Mesh3d => (m.texture ? { ...m, normalTexture: '법선', metallicRoughnessTexture: '금속 거칠기' } : m));
  return s;
}

type V = Viewer3d & Record<string, any>;

function syncGpu(v: Viewer3d): void {
  const gl = v.canvas.getContext('webgl2') as WebGL2RenderingContext;
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}

const frame = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

/** WebGL2 문맥 메서드 이름들 */
function glNames(): string[] {
  return Object.getOwnPropertyNames(WebGL2RenderingContext.prototype).filter((k) => {
    const d = Object.getOwnPropertyDescriptor(WebGL2RenderingContext.prototype, k);
    return d && typeof d.value === 'function' && k !== 'constructor';
  });
}

/** GL 호출 수(그리기 한 번) — 문맥 메서드를 잠깐 세는 함수로 덮는다 */
function countGl(v: Viewer3d, f: () => void): number {
  const gl = v.canvas.getContext('webgl2') as WebGL2RenderingContext & Record<string, any>;
  let n = 0;
  const names = glNames();
  for (const k of names) {
    const orig = gl[k] as (...a: unknown[]) => unknown;
    gl[k] = (...a: unknown[]) => {
      n++;
      return orig.apply(gl, a);
    };
  }
  try {
    f();
  } finally {
    for (const k of names) delete gl[k];
  }
  return n;
}

/** 0.51.0 GL 호출 종류(값을 돌려주지 않는 것만 — 만들기·읽기·묻기는 'other') */
type GlKind = 'draw' | 'uniform' | 'bind' | 'state' | 'upload' | 'other';
const BIND = new Set(['useProgram', 'bindVertexArray', 'bindTexture', 'activeTexture', 'bindFramebuffer', 'bindBuffer', 'vertexAttribDivisor', 'bindRenderbuffer']);
const STATE = new Set([
  'enable',
  'disable',
  'blendFunc',
  'blendFuncSeparate',
  'depthFunc',
  'depthMask',
  'colorMask',
  'polygonOffset',
  'cullFace',
  'stencilFunc',
  'stencilOp',
  'stencilMask',
  'scissor',
  'viewport',
  'clear',
  'clearColor',
  'clearDepth',
  'clearStencil',
]);
const UPLOAD = new Set(['texSubImage2D', 'bufferSubData', 'texImage2D']);
function glKind(k: string): GlKind {
  if (/^draw/.test(k)) return 'draw';
  if (/^uniform/.test(k)) return 'uniform';
  if (BIND.has(k)) return 'bind';
  if (STATE.has(k)) return 'state';
  if (UPLOAD.has(k)) return 'upload';
  return 'other';
}

/** 그리기 한 번의 GL 호출 수(종류별) */
function countKinds(v: Viewer3d, f: () => void): Record<GlKind, number> {
  const gl = v.canvas.getContext('webgl2') as WebGL2RenderingContext & Record<string, any>;
  const n: Record<GlKind, number> = { draw: 0, uniform: 0, bind: 0, state: 0, upload: 0, other: 0 };
  const names = glNames();
  for (const k of names) {
    const orig = gl[k] as (...a: unknown[]) => unknown;
    const kind = glKind(k);
    gl[k] = (...a: unknown[]) => {
      n[kind]++;
      return orig.apply(gl, a);
    };
  }
  try {
    f();
  } finally {
    for (const k of names) delete gl[k];
  }
  return n;
}

/** kinds 종류 GL 호출을 아무것도 하지 않는 함수로 바꾼 채 f(그 사이 GL 상태는 어긋나므로 되돌린 뒤 한 번 다시 그린다) */
function stubbed<T>(v: Viewer3d, kinds: readonly GlKind[], f: () => T): T {
  const gl = v.canvas.getContext('webgl2') as WebGL2RenderingContext & Record<string, any>;
  const names = glNames().filter((k) => kinds.includes(glKind(k)));
  const noop = (): undefined => undefined;
  for (const k of names) gl[k] = noop;
  try {
    return f();
  } finally {
    for (const k of names) delete gl[k];
  }
}

function newViewer(): V {
  const v = new Viewer3d(host, { animate: false, keyboard: false, viewCube: false, renderMode: 'shadedEdges' }) as V;
  if (inst === '0') v.setRenderOptions({ instancing: false } as never);
  if (pbrOff) v.setRenderOptions({ pbr: false } as never);
  if (cullOff) v.setRenderOptions({ culling: false } as never);
  return v;
}

interface OpenRes {
  callMs: number;
  doneMs: number;
  frames: number;
  drawSumMs: number;
  drawMaxMs: number;
  longSumMs: number;
  longCount: number;
  firstFrameMs: number;
  /** 모아 그리기 시작까지(변종 번역을 기다렸으면, 아니면 0) */
  instMs: number;
  /** 다 연 뒤 JS 힙·GPU 버퍼(MB) */
  heapMB: number;
  gpuMB: number;
}

async function open(spec: ManySpec | FlatSpec, budgetMs: number): Promise<OpenRes & { triangles: number; meshes: number; renderer: string }> {
  const scene = benchScene(spec);
  const v = newViewer();
  const gl = v.canvas.getContext('webgl2') as WebGL2RenderingContext;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  // 장면 없이 한 번 그려 셰이더를 데운다(두 판이 같게)
  v.renderNow();
  syncGpu(v);
  let frames = 0, drawSum = 0, drawMax = 0, firstFrame = 0;
  // 뷰어의 그리기(requestAnimationFrame이 부르는 비공개 draw)를 재는 함수로 잠깐 덮는다
  const vd = v as unknown as { draw: (t: number) => void };
  const draw = vd.draw;
  let t0 = 0;
  vd.draw = (t: number) => {
    const a = performance.now();
    draw.call(v, t);
    const d = performance.now() - a;
    frames++;
    drawSum += d;
    drawMax = Math.max(drawMax, d);
    if (frames === 1) firstFrame = performance.now() - t0;
  };
  let longSum = 0, longCount = 0;
  const po = new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      longSum += e.duration;
      longCount++;
    }
  });
  try {
    po.observe({ type: 'longtask', buffered: false });
  } catch {
    /* 긴 작업 관찰 없음 */
  }
  t0 = performance.now();
  let done = 0;
  const finished = new Promise<void>((res) => {
    v.setScene(scene, {
      incremental: { budgetMs },
      onProgress: (d: number, t: number) => {
        if (d >= t && !done) {
          done = performance.now() - t0;
          res();
        }
      },
    });
  });
  const callMs = performance.now() - t0;
  const timeout = new Promise<void>((res) => setTimeout(res, 600_000));
  await Promise.race([finished, timeout]);
  await frame();
  await frame();
  // 0.42.0: 인스턴싱 변종 번역을 기다리는 동안은 그물마다 그린다 — 모아 그리기 시작까지(그 선택이 없는 판·끔은 0)
  let instMs = 0;
  for (let i = 0; i < 600 && ((v.stats as { instanced?: { pending: number } }).instanced?.pending ?? 0) > 0; i++) {
    await frame();
    instMs = performance.now() - t0;
  }
  syncGpu(v);
  po.disconnect();
  vd.draw = draw;
  // 메모리: JS 힙(Chrome performance.memory — 쓰레기 수집 차이로 흔들린다)·GPU 버퍼 바이트(stats.buffers)
  const heapMB = +(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1048576).toFixed(1);
  const gpuMB = +(v.stats.buffers.bytes / 1048576).toFixed(1);
  (window as unknown as { last: V }).last = v;
  return { callMs, doneMs: done, frames, drawSumMs: drawSum, drawMaxMs: drawMax, longSumMs: longSum, longCount, firstFrameMs: firstFrame, instMs, heapMB, gpuMB, triangles: scene.triangles, meshes: scene.meshes.length, renderer };
}

interface SteadyRow {
  mode: string;
  js: number[];
  total: number[];
  drawCalls: number;
  glCalls: number;
}

/** 모드 하나 맞추기(꼬리 — 위 머리말) */
function setMode(v: V, mode: string): void {
  // 0.49.0: 꼬리를 여럿 이을 수 있다(예: shadedEdges+profiles+ao) — 단면·그림자·강조 갈래는 그 가운데 첫 것
  const [m, ...tails] = mode.split('+');
  const opt = tails.find((t) => t !== 'profiles' && t !== 'ao' && t !== 'aolow' && t !== 'zoom');
  v.setRenderMode(m as never);
  v.setRenderOptions({ profiles: tails.includes('profiles') ? { width: 1 } : null });
  // 0.49.0 +ao = 주변 가림(기본 값 — 그 API가 없는 판은 무시한다).
  // 0.50.0 +aolow = moving: 'low'를 켜고 카메라를 옮기는 중으로 둔 그림(¼ 해상도 가림 — 끌기 중 그림의 비용. 재는 동안만 뷰어 안 상태를 켠다)
  (v as { setAmbientOcclusion?: (o: object | null) => void }).setAmbientOcclusion?.(tails.includes('ao') ? {} : tails.includes('aolow') ? { moving: 'low' } : null);
  (v as unknown as { interacting: boolean }).interacting = tails.includes('aolow');
  if (opt === 'highlight') v.highlight(['자리 0-0', '자리 3-7', '자리 0', '자리 7']);
  else v.highlight(null);
  // 0.43.0: 단면 하나(채우기 없음 — 면 그리기만 견준다)·해 그림자
  if (opt === 'section') v.setSectionAxis('x', 0.5, { caps: 'none' });
  else if (opt === 'items' || opt === 'secrange') {
    // 0.44.0: x 가운데 평면(채우기 없음)이 열째 자리마다 그 그물 통째(items) 또는 앞 절반 삼각형 구간(secrange — 0.43.0 판은 구간을 몰라 아무것도 자르지 않는다)
    const ms = (v.scene!.meshes as Mesh3d[]).filter((_, i) => i % 10 === 0);
    const r = v.sectionRange('x');
    const tris = (m: Mesh3d): number => (m.indices ? m.indices.length / 3 : m.positions.length / 9);
    const items = opt === 'items' ? ms.map((m) => m.id) : ms.map((m) => ({ id: m.id, start: 0, count: Math.floor(tris(m) / 2) }));
    v.setSections([{ normal: [1, 0, 0], offset: (r.min + r.max) / 2, caps: 'none', items }]);
  } else v.setSection(null);
  v.setLighting(opt === 'shadows' ? { sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true } : null);
  v.fit(false);
  // 0.51.0 +zoom: 맞춘 뒤 8배 확대(자리 대부분이 화면 밖)
  if (tails.includes('zoom')) v.zoomBy(1 / 8);
}

async function steady(reps: number, modes: string[]): Promise<SteadyRow[]> {
  const v = (window as unknown as { last: V }).last;
  const rows: SteadyRow[] = [];
  // 무늬(?pbr=1의 그림)가 다 풀릴 때까지
  for (let i = 0; i < 500; i++) {
    const t = v.stats.textures;
    if (t.ready + (t.missing ?? 0) + t.failed >= t.count) break;
    await new Promise((res) => setTimeout(res, 10));
  }
  for (const mode of modes) {
    setMode(v, mode);
    for (let i = 0; i < 2; i++) {
      v.orbitBy(0.01, 0);
      v.renderNow();
      syncGpu(v);
    }
    const r: SteadyRow = { mode, js: [], total: [], drawCalls: 0, glCalls: 0 };
    for (let i = 0; i < reps; i++) {
      v.orbitBy(0.02, 0.005);
      const a = performance.now();
      v.renderNow();
      const b = performance.now();
      syncGpu(v);
      const c = performance.now();
      r.js.push(b - a);
      r.total.push(c - a);
      await new Promise((res) => setTimeout(res, 0));
    }
    r.drawCalls = v.stats.drawCalls;
    r.glCalls = countGl(v, () => v.renderNow());
    syncGpu(v);
    rows.push(r);
  }
  v.highlight(null);
  return rows;
}

interface PartsRow {
  mode: string;
  /** 보통 그리기: renderNow JS·GPU 마침까지·렌더러 그리기(render) JS */
  js: number[];
  total: number[];
  render: number[];
  /** 그 종류 GL 호출을 아무것도 하지 않게 바꾼 renderNow JS(all = 모두 — GL 없는 JS 몫) */
  stub: Record<string, number[]>;
  /** 종류별 GL 호출 수 */
  calls: Record<GlKind, number>;
  drawCalls: number;
  /** 0.51.0 화면 밖으로 잘라낸 그물 수(그 셈이 없는 판은 null) */
  culled: number | null;
  /** 화면 가운데·네 곳 고르기(처음 한 번 — BVH를 만들 수 있다 — 와 그 뒤 가운데값) */
  pickFirst: number;
  pick: number[];
}

/** 0.51.0 프레임 비용 나누기(머리말) */
async function parts(reps: number, modes: string[]): Promise<PartsRow[]> {
  const v = (window as unknown as { last: V }).last;
  const rows: PartsRow[] = [];
  const rr = (v as unknown as { renderer: { render: (...a: unknown[]) => void } }).renderer;
  const render0 = rr.render;
  let renderMs = 0;
  rr.render = function (this: unknown, ...a: unknown[]) {
    const t = performance.now();
    render0.apply(this, a);
    renderMs = performance.now() - t;
  };
  const kinds: (GlKind | 'all')[] = ['all', 'draw', 'uniform', 'bind', 'state'];
  try {
    for (const mode of modes) {
      setMode(v, mode);
      for (let i = 0; i < 2; i++) {
        v.orbitBy(0.01, 0);
        v.renderNow();
        syncGpu(v);
      }
      const row: PartsRow = { mode, js: [], total: [], render: [], stub: {}, calls: countKinds(v, () => v.renderNow()), drawCalls: v.stats.drawCalls, culled: (v.stats as { culled?: number }).culled ?? null, pickFirst: 0, pick: [] };
      syncGpu(v);
      for (let i = 0; i < reps; i++) {
        v.orbitBy(0.02, 0.005);
        const a = performance.now();
        v.renderNow();
        const b = performance.now();
        syncGpu(v);
        row.js.push(b - a);
        row.total.push(performance.now() - a);
        row.render.push(renderMs);
        await new Promise((res) => setTimeout(res, 0));
      }
      for (const k of kinds) {
        const arr: number[] = (row.stub[k] = []);
        for (let i = 0; i < reps; i++) {
          v.orbitBy(0.02, 0.005);
          const ms = stubbed(v, k === 'all' ? ['draw', 'uniform', 'bind', 'state', 'upload'] : [k], () => {
            const a = performance.now();
            v.renderNow();
            return performance.now() - a;
          });
          arr.push(ms);
          // 어긋난 GL 상태를 보통 그리기로 되돌린다
          v.renderNow();
          syncGpu(v);
          await new Promise((res) => setTimeout(res, 0));
        }
      }
      // 고르기: 처음(BVH를 만들 수 있다)과 그 뒤
      const pts: [number, number][] = [
        [W / 2, H / 2],
        [W / 3, H / 3],
        [(2 * W) / 3, H / 3],
        [W / 3, (2 * H) / 3],
        [(2 * W) / 3, (2 * H) / 3],
      ];
      let t = performance.now();
      v.pick(pts[0]![0], pts[0]![1]);
      row.pickFirst = performance.now() - t;
      for (let i = 0; i < reps; i++) {
        const p = pts[i % pts.length]!;
        t = performance.now();
        v.pick(p[0], p[1]);
        row.pick.push(performance.now() - t);
      }
      rows.push(row);
    }
  } finally {
    rr.render = render0;
  }
  v.highlight(null);
  return rows;
}

(window as unknown as { bench: unknown }).bench = { ready: true, open, steady, parts };
