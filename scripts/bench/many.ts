/**
 * 같은 그물 자리가 아주 많은 장면 비용 재기 페이지(0.42.0 — scripts/bench/many.mjs가 base·head 두 판으로 묶어 헤드리스 Chrome에서 연다).
 * 장면: scripts/pixels/many.ts(정의 12개 × 자리 3,000, 삼각형 약 184만 — STEP 큰 조립 합성과 같은 꼴). 주소 인자 ?inst=0이면
 * 인스턴싱을 끈다(setRenderOptions({ instancing: false }) — 그 선택이 없는 판은 무시한다).
 *  - open: setScene(incremental { budgetMs }) → 다 올릴 때까지 프레임 수·벽시계·주 스레드 몫(프레임 JS 합·가장 긴 프레임·긴 작업 합)
 *  - steady: 다 올린 뒤 모드마다 조금씩 돌려 renderNow JS 시간·GPU 마침(1화소 읽기)까지·그리기 호출 수·GL 호출 수
 *    (0.43.0 모드 꼬리: +section = x 가운데 단면 하나(채우기 없음), +shadows = 해 그림자.
 *    0.44.0: +items = 그 평면이 열째 자리마다(300곳) 그물 통째, +secrange = 같은 자리의 앞 절반 삼각형 구간만)
 */
import { checkerBmp } from '../../src/synth';
import type { Mesh3d } from '../../src/types';
import { Viewer3d } from '../../src/viewer';
import { manyScene, type ManySpec } from '../pixels/many';
import { metalRoughBmp, normalMapBmp } from '../pixels/pbr';

const W = 960, H = 600;
const host = document.getElementById('view')!;
host.style.width = `${W}px`;
host.style.height = `${H}px`;
const q = new URLSearchParams(location.search);
const inst = q.get('inst');
/** 0.43.0 ?pbr=1: 셋째 정의마다 바둑판 무늬에 법선·금속 거칠기 그림(64²)을 단다(그 필드를 모르는 판은 바둑판만), ?pbroff=1이면 setRenderOptions({ pbr: false }) */
const pbr = q.get('pbr') === '1';
const pbrOff = q.get('pbroff') === '1';

/** 비용 재기 장면(?pbr=1이면 무늬 정의에 PBR 그림) */
function benchScene(spec: ManySpec): ReturnType<typeof manyScene> {
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

/** GL 호출 수(그리기 한 번) — 문맥 메서드를 잠깐 세는 함수로 덮는다 */
function countGl(v: Viewer3d, f: () => void): number {
  const gl = v.canvas.getContext('webgl2') as WebGL2RenderingContext & Record<string, any>;
  let n = 0;
  const names = Object.getOwnPropertyNames(WebGL2RenderingContext.prototype).filter((k) => {
    const d = Object.getOwnPropertyDescriptor(WebGL2RenderingContext.prototype, k);
    return d && typeof d.value === 'function' && k !== 'constructor';
  });
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

function newViewer(): V {
  const v = new Viewer3d(host, { animate: false, keyboard: false, viewCube: false, renderMode: 'shadedEdges' }) as V;
  if (inst === '0') v.setRenderOptions({ instancing: false } as never);
  if (pbrOff) v.setRenderOptions({ pbr: false } as never);
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

async function open(spec: ManySpec, budgetMs: number): Promise<OpenRes & { triangles: number; meshes: number; renderer: string }> {
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
    const [m, opt] = mode.split('+');
    v.setRenderMode(m as never);
    v.setRenderOptions({ profiles: opt === 'profiles' ? { width: 1 } : null });
    if (opt === 'highlight') v.highlight(['자리 0-0', '자리 3-7']);
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

(window as unknown as { bench: unknown }).bench = { ready: true, open, steady };
