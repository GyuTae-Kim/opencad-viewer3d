/**
 * 0.62.0 강조를 자리 깃발로(61차 남은 한계 "강조한 그물의 면은 구간 균일 변수라 강조한 그물마다 면 구간이 둘로 끊긴다").
 *  - 묶음 그물 자리의 정점 색 쓰기 깃발에 강조 2를 더하고(0~3), MERGE 그물 변종이 v_hi로 넘겨 조각 셰이더가 강조 섞기 몫(구간 균일 변수 u_tint.a — 면 차례 0.5)에 곱한다(mergeFrag)
 *  - 면 구간은 강조에서 끊기지 않는다: 강조한 그물이 늘어도 면 그리기(drawElements)는 그대로, 늘어나는 것은 굵은 윤곽선 구간뿐
 *  - 그린 도형(정점마다 강조 섞기 몫까지 — tests/drawexpand.ts)이 끈 뷰어와 같다: 흩어진·잇단 강조, 이동뿐·돌린 행렬 묶음, 안개·단면·그림자·숨은 선·단색 모드·외곽선과 주변 가림·겉모습
 *  - 깊이만 그리는 차례(외곽선·주변 가림)도 같은 깃발을 써 강조가 그대로인 프레임은 올리지 않는다. 강조를 바꾸면 바뀐 그물의 면·윤곽선 자리만
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { mergeFrag, mergeShader } from '../src/mergegl';
import { MESH_FS, MESH_VS, withDefines } from '../src/shaders';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(async () => {
  dom = installDom();
  expect(await Viewer3d.preloadMerging()).toBe(true);
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

/** 상자 n개: 원점만, 9번째마다 돌린 행렬(그 묶음은 온 꼴), 정점 색(3번째마다), 한쪽 면(10번째마다), 윤곽선 없음(13번째마다), 묶음 g0~g3 */
function grid(n: number): Scene3d {
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const m = boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`);
    if (i % 9 === 0 && i % 2 === 0) m.matrix = placeAt((i % 30) * 10, Math.floor(i / 30) * 10, 0, i * 7, i % 18 === 0);
    else m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (i % 3 === 0) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
    if (i % 10 === 0) m.doubleSided = false;
    if (i % 13 === 0) delete m.edges;
    return m;
  });
  return { name: 'g', units: 'mm', meshes, lines: [] };
}

type W = { v: Viewer3d; gl: FakeGL; up: { texels: number; faces: number } };

/** 뷰어(저장소 단위 10에 올린 텍셀·면 그리기 drawElements 수를 센다) */
function view(sc: Scene3d, merging: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
  const w: W = { v, gl, up: { texels: 0, faces: 0 } };
  const base = r.gl as Record<string | symbol, unknown> & { TEXTURE0: number };
  let unit = 0;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        if (k === 'activeTexture') unit = (a[0] as number) - base.TEXTURE0;
        if (k === 'texSubImage2D' && unit === 10) w.up.texels += (a[4] as number) * (a[5] as number);
        if (k === 'drawElements') w.up.faces++;
        return (x as (...y: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  v.setRenderOptions({ merging });
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  return w;
}

function bake(w: W): void {
  w.v.renderNow();
  for (let i = 0; i < 100 && (w.v.stats.merged.pending > 0 || w.v.stats.instanced.pending > 0); i++) w.v.renderNow();
  w.v.renderNow();
}

const shot = (w: W): string[] => expandFrame(w.gl, () => w.v.renderNow());

/** 켬·끔에 같은 조작 뒤 첫 프레임의 펼친 도형이 같은지 — 켬 쪽의 [올린 텍셀, 면 그리기 수, 그리기 호출] */
function step(on: W, off: W, label: string, fn: (v: Viewer3d) => void): [number, number, number] {
  for (const w of [on, off]) fn(w.v);
  on.up.texels = on.up.faces = 0;
  const b = shot(on), a = shot(off);
  expect(b.length, label).toBe(a.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(b[i], `${label} #${i}`).toBe(a[i]);
  expect(on.v.stats.merged.draws, label).toBeGreaterThan(0);
  return [on.up.texels, on.up.faces, on.v.stats.drawCalls];
}

const every = (n: number, k: number, o = 0): string[] => Array.from({ length: n }, (_, i) => `b${i}`).filter((_, i) => i % k === o);

describe('0.62.0 강조 깃발 셰이더 글', () => {
  it('정점 셰이더가 깃발을 풀어 v_hi로, 조각 셰이더가 강조 섞기 몫에 곱한다 — 바꿀 자리가 없으면 예외', () => {
    for (const lite of [false, true]) {
      const m = mergeShader(withDefines(MESH_VS, ...(lite ? ['MSHIFT'] : []), 'INST', 'MERGE'), 'mesh');
      expect(m).toContain('out vec4 v_col;\nflat out float v_hi;\n');
      expect(m).toContain(`  float fl = ${lite ? 'm3.w' : 'instAt(8).w'};\n  float u_vcol = fl > 1.5 ? fl - 2.0 : fl;\n  v_hi = fl > 1.5 ? 1.0 : 0.0;\n`);
    }
    const f = mergeFrag(withDefines(MESH_FS, 'INST', 'MERGE'));
    expect(f).toContain('uniform vec4 u_tint;\nflat in float v_hi;\n');
    expect(f).toContain('  c = mix(c, u_tint.rgb, u_tint.a * v_hi);\n');
    expect(f).not.toContain('  c = mix(c, u_tint.rgb, u_tint.a);\n');
    // 원본 조각 셰이더 글은 그대로
    expect(MESH_FS).toContain('  c = mix(c, u_tint.rgb, u_tint.a);\n');
    expect(() => mergeFrag('#version 300 es\nvoid main() {}')).toThrow();
  });
});

describe('0.62.0 강조 깃발 — 뷰어', () => {
  it('끈 뷰어와 같은 도형이고, 강조한 그물이 늘어도 면 그리기 수는 그대로다(늘어나는 것은 굵은 윤곽선 구간뿐)', () => {
    const n = 1200;
    const on = view(grid(n), true), off = view(grid(n), false);
    bake(on);
    bake(off);
    const [, faces0, draws0] = step(on, off, 'plain', () => undefined);
    for (const k of [97, 7, 3]) {
      const ids = every(n, k, 1);
      const [, faces, draws] = step(on, off, `hi/${k}`, (v) => v.highlight(ids));
      expect(faces, `hi/${k}`).toBe(faces0);
      // 강조한 그물 하나에 굵은 윤곽선 구간(가는 선 구간을 끊는다) 둘까지 — 0.61.0은 면 구간 둘이 더 들었다
      expect(draws - draws0, `hi/${k}`).toBeLessThanOrEqual(2 * ids.length);
    }
    // 잇단 강조·강조가 숨김과 겹침·화면 밖
    step(on, off, 'hi-run', (v) => (v.highlight(['b40', 'b41', 'b42', 'b43', 'b100', 'b101', 'b1199']), v.setItemVisible('b41', false)));
    step(on, off, 'hi-orbit', (v) => v.orbitBy(0.6, 0.1));
    step(on, off, 'hi-zoom', (v) => (v.highlight(every(n, 5)), v.zoomBy(4)));
    step(on, off, 'hi-fog', (v) => (v.zoomBy(0.25), v.setItemVisible('b41', true), v.setFog({ start: 50, end: 400 })));
    step(on, off, 'hi-section', (v) => v.setSection({ normal: [1, 0, 0], offset: 120 }));
    step(on, off, 'hi-shadow', (v) => v.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true }));
    step(on, off, 'hi-plain', (v) => (v.setFog(null), v.setSection(null), v.setLighting(null)));
    // 외곽선·주변 가림(깊이만 그리는 차례도 같은 깃발 — 강조가 그대로인 프레임은 올리지 않는다)
    step(on, off, 'hi-profiles-ao', (v) => (v.setRenderOptions({ profiles: { width: 1 } }), v.setAmbientOcclusion({})));
    expect(step(on, off, 'hi-profiles-still', () => undefined)[0]).toBe(0);
    // 강조를 바꾸면 바뀐 그물의 자리만(면 깃발 + 윤곽선 색)
    const [t] = step(on, off, 'hi-flip-one', (v) => v.highlight([...every(n, 5), 'b2']));
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(12 + 6);
    step(on, off, 'hi-off-ao', (v) => (v.setRenderOptions({ profiles: undefined }), v.setAmbientOcclusion(null)));
    // 숨은 선·단색·X-ray 모드, 겉모습(그물마다 길 — 구간을 그물마다 더한다)
    step(on, off, 'hi-hidden-line', (v) => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 })));
    step(on, off, 'hi-mono', (v) => (v.setRenderMode('monochrome'), v.setRenderOptions({ hiddenEdges: 0 })));
    step(on, off, 'hi-look', (v) => (v.setRenderMode('shadedEdges'), v.setItemColor('b10', [1, 0, 0, 1]), v.setItemColor('b11', [0, 1, 0, 1])));
    step(on, off, 'hi-look-orbit', (v) => v.orbitBy(0.05, 0));
    step(on, off, 'hi-look-off', (v) => (v.setItemColor('b10', null), v.setItemColor('b11', null)));
    step(on, off, 'hi-none', (v) => v.highlight(null));
    expect(step(on, off, 'none-still', () => undefined)[0]).toBe(0);
  });
});
