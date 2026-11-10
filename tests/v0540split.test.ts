/**
 * 0.54.0 나눠 받는 묶어 그리기 조각(SKP 57차 요청), 나눠 올리기 첫 그림 앞 훑기·굽기 미루기(STEP 63차):
 *  - 정적 가져오기 길: 입구(index.ts)에서 값으로 가져오는 길에 merge.ts·mergegl.ts가 없다(렌더러는 import()로만 — 번들러가 코어 조각에서 뺀다)
 *  - 받는 때: 문턱 아래 장면·끔은 받기를 걸지 않는다('idle'), 문턱을 넘는 장면은 setScene에서 건다
 *  - 나눠 올리기: setScene은 장면을 훑지 않고, 첫 그림 앞에서는 굽지 않으며 굽지 못한 그물이 굽기 단위에 닿으면 걸음을 멈춘다(그물마다 GL 객체가 쌓이는 한도는 0.53.0과 같다).
 *    다 올린 뒤 묶음 수·그리기 호출·GL 객체·그린 도형이 조각을 미리 받고 한 번에 올린 뷰어와 같다
 * 이 파일의 시험은 차례대로 돈다(조각 받기 상태는 모듈마다 하나 — 앞 시험이 'idle'을 본다)
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { MERGE_AUTO_MIN, MERGE_UPLOAD_MESHES } from '../src/mergeopts';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

const src = (rel: string): string => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');

/**
 * 모듈 글에서 값으로 가져오는 상대 경로(import·export … from, import './x'). `import type`·`export type`과 꼴 이름만 가져오는 것(모두 `type X`)은 뺀다 —
 * 번들러(esbuild·TypeScript)가 지우는 가져오기. import('./x')(나눠 받기)는 세지 않는다
 */
function valueImports(text: string): string[] {
  const out: string[] = [];
  const re = /^(?:import|export)\s+(type\s+)?([^'";]*?)\s*from\s+'(\.[^']+)'|^import\s+'(\.[^']+)'/gm;
  for (const m of text.matchAll(re)) {
    if (m[4]) {
      out.push(m[4]);
      continue;
    }
    if (m[1]) continue;
    const spec = m[2]!.trim();
    const braces = /^\{([\s\S]*)\}$/.exec(spec);
    if (braces) {
      const names = braces[1]!.split(',').map((s) => s.trim()).filter(Boolean);
      if (names.length && names.every((s) => s.startsWith('type '))) continue;
    }
    out.push(m[3]!);
  }
  return out;
}

/** 입구에서 값으로 닿는 모듈 파일 이름 */
function reach(start: string): Set<string> {
  const seen = new Set<string>();
  const todo = [start];
  while (todo.length) {
    const f = todo.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const p of valueImports(src(f))) todo.push(`${p.slice(2)}.ts`);
  }
  return seen;
}

describe('0.54.0 묶어 그리기 조각 나눠 받기', () => {
  it('입구에서 값으로 가져오는 길에 merge.ts·mergegl.ts가 없고(렌더러는 import()로만), 조각은 렌더러 import() 하나로 받는다', () => {
    const all = reach('index.ts');
    // 작은 모듈 viewkeys는 아무것도 가져오지 않는다(첫 화면이 표만 가져와도 다른 코어 모듈이 끌려오지 않는다)
    expect([...reach('viewkeys.ts')]).toEqual(['viewkeys.ts']);
    expect(all.has('viewkeys.ts')).toBe(true);
    expect(all.has('renderer.ts')).toBe(true);
    expect(all.has('viewer.ts')).toBe(true);
    expect(all.has('mergeopts.ts')).toBe(true);
    expect(all.has('merge.ts')).toBe(false);
    expect(all.has('mergegl.ts')).toBe(false);
    // 가져오기 글 찾기가 제대로 도는지: 조각 안에서는 merge.ts를 값으로 가져온다
    expect(reach('mergegl.ts').has('merge.ts')).toBe(true);
    const dyn = [...src('renderer.ts').matchAll(/(?<!typeof\s)import\('(\.[^']+)'\)/g)].map((m) => m[1]);
    expect(dyn).toEqual(['./mergegl']);
    // shaders.ts에서 MERGE 셰이더 글 바꾸기가 빠졌다(조각으로)
    expect(src('shaders.ts')).not.toMatch(/export function mergeShader/);
  });

  it('문턱 아래 장면과 끔은 받기를 걸지 않는다(idle)', async () => {
    expect(Viewer3d.mergingState()).toBe('idle');
    const small = view(boxes(MERGE_AUTO_MIN - 1));
    small.v.renderNow();
    const off = view(boxes(MERGE_AUTO_MIN + 600), false);
    off.v.renderNow();
    await settle();
    small.v.renderNow();
    off.v.renderNow();
    expect(Viewer3d.mergingState()).toBe('idle');
    expect(small.v.stats.merged.pending).toBe(0);
    expect(off.v.stats.merged.groups).toBe(0);
  });

  it('문턱을 넘는 장면 나눠 올리기: setScene은 훑지 않고 받기를 걸며, 첫 그림 앞에서는 굽지 않고 굽기 단위에서 걸음을 멈춘다 — 다 올린 뒤는 미리 받은 뷰어와 같다', async () => {
    const N = MERGE_UPLOAD_MESHES + 600;
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
    views.push(v);
    const gl = (v.canvas as unknown as FakeElement).gl!;
    const r = (v as unknown as { renderer: Record<string, unknown> }).renderer as unknown as Rend;
    const baked = countBakes(r);
    let firstBaked = -1;
    const render0 = r.render;
    r.render = function (this: unknown, ...a: unknown[]) {
      if (firstBaked < 0) firstBaked = baked.length;
      return render0.apply(this, a);
    };
    // 몫이 아주 커도(한 걸음에 다 올릴 몫) 첫 걸음은 굽기 단위 − 1에서 멈춘다
    v.setScene(boxes(N), { incremental: { budgetMs: 600_000 } });
    expect(Viewer3d.mergingState()).toBe('loading');
    expect(r.mgScan).not.toBeNull();
    expect(r.uploadSome(600_000)).toBe(false);
    expect(r.meshes.length).toBe(MERGE_UPLOAD_MESHES - 1);
    expect(baked.length).toBe(0);
    let maxVaos = 0;
    for (let i = 0; i < 400 && (r.uploading || v.stats.merged.pending > 0); i++) {
      v.renderNow();
      maxVaos = Math.max(maxVaos, liveVaos(gl));
      await settle();
    }
    v.renderNow();
    expect(firstBaked).toBe(0);
    expect(Viewer3d.mergingState()).toBe('ready');
    expect(r.uploading).toBe(false);
    // 그물마다 GL 객체(그물·윤곽선 VAO 셋)는 굽기 단위 안
    expect(maxVaos).toBeLessThanOrEqual(MERGE_UPLOAD_MESHES * 3 + 32);
    for (const n of baked) expect(n).toBeLessThanOrEqual(MERGE_UPLOAD_MESHES);
    const st = v.stats;
    expect(st.merged.meshes).toBe(N);
    // 조각을 받은 뒤 한 번에 올린 뷰어(0.53.0 길)와 같은 끝값·같은 그림
    const ref = view(boxes(N));
    bake(ref);
    for (const w of [v, ref.v]) w.fit(false);
    bake({ v, gl });
    expect(v.stats.merged.groups).toBe(ref.v.stats.merged.groups);
    expect(v.stats.drawCalls).toBe(ref.v.stats.drawCalls);
    expect(gl.liveBuffers).toBe(ref.gl.liveBuffers);
    expect(liveVaos(gl)).toBe(liveVaos(ref.gl));
    expect(expandFrame(gl, () => v.renderNow())).toEqual(expandFrame(ref.gl, () => ref.v.renderNow()));
  });

  it('조각을 받은 뒤에도 나눠 올리기의 첫 그림 앞에는 굽지 않는다(첫 걸음 몫이 커도) — 훑기는 첫 그림 뒤 걸음에서', () => {
    const N = MERGE_UPLOAD_MESHES * 2 + 100;
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
    views.push(v);
    const r = (v as unknown as { renderer: Record<string, unknown> }).renderer as unknown as Rend;
    const baked = countBakes(r);
    v.setScene(boxes(N), { incremental: { budgetMs: 600_000 } });
    expect(r.mgScan).not.toBeNull();
    r.uploadSome(600_000);
    expect(r.meshes.length).toBe(MERGE_UPLOAD_MESHES - 1);
    expect(baked.length).toBe(0);
    v.renderNow();
    expect(baked.length).toBe(0);
    // 첫 그림 뒤 걸음: 훑기를 마치고 모아 둔 그물부터 굽는다
    v.renderNow();
    expect(r.mgScan).toBeNull();
    expect(baked.length).toBeGreaterThan(0);
    bake({ v, gl: (v.canvas as unknown as FakeElement).gl! });
    expect(v.stats.merged.meshes).toBe(N);
  });
});

type Rend = {
  render: (...a: unknown[]) => void;
  uploadSome: (b: number) => boolean;
  uploading: boolean;
  meshes: unknown[];
  mgScan: unknown;
  mergeBake: (list: readonly unknown[]) => void;
};

/** 렌더러 mergeBake를 감싸 굽기마다 그 묶음 그물 수를 센다 */
function countBakes(r: Rend): number[] {
  const out: number[] = [];
  const orig = r.mergeBake;
  r.mergeBake = function (this: unknown, list: readonly unknown[]) {
    out.push(list.length);
    return orig.call(this, list);
  };
  return out;
}

/** 서로 다른 상자 그물 n개(셋째마다 정점 색, 윤곽선 있음 — 52·53차 시험과 같은 꼴) */
const box = (i: number): Mesh3d => {
  const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1]);
  m.origin = [(i % 60) * 10, Math.floor(i / 60) * 10, 0];
  if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : 0.5));
  return m;
};
const boxes = (n: number): Scene3d => ({ name: 'b', units: 'mm', meshes: Array.from({ length: n }, (_, i) => box(i)), lines: [] });

type W = { v: Viewer3d; gl: FakeGL };
function view(sc: Scene3d, merging: boolean | 'auto' = 'auto'): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  v.setRenderOptions({ merging });
  v.setScene(sc);
  v.fit(false);
  return { v, gl };
}
function bake(w: W): void {
  for (let i = 0; i < 200 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}
const liveVaos = (gl: FakeGL): number => gl.vaos.filter((x) => !x.deleted).length;
/** import()로 받는 조각이 올 수 있게 이벤트 고리를 돌린다 */
const settle = (): Promise<void> => new Promise((res) => setTimeout(res, 5));
