/**
 * 0.78.0 단면 하나일 때 그물마다 그리는 선(윤곽선·숨은 점선 — 렌더러 drawLines, 윤곽선 없는 그물의 삼각형 변)의 시점 투영 · 모형(u_mvp)과 로컬 평면(u_clip)을
 * 균일 변수 배열 하나(u_mvpc[5] — 정의 MVPC 변종)로 한 번에 보낸다: 그리기 하나에 GL 넷(행렬·평면·VAO·그리기) → 셋. 그리는 차례·프로그램(MVPC 정의 말고)·그리기 때
 * 행렬·평면 float 값은 0.77.0과 같다 — 그린 도형(tests/drawexpand.ts — MVPC면 u_mvpc 앞 16칸·뒤 4칸을 u_mvp·u_clip으로 읽는다)이 MVPC를 끈 그리기
 * (lineMvpcOff — 0.77.0 길)와 프레임마다 같은지 견준다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { THIN_VS, WIDE_VS, withDefines } from '../src/shaders';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Rgba, Scene3d } from '../src/types';
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

const PAL: Rgba[] = [
  [0.7, 0.4, 0.3, 1],
  [0.3, 0.6, 0.8, 1],
  [0.5, 0.5, 0.5, 1],
];

/**
 * n개(0.75.0 시험 꼴): 셋째마다 같은 꼴 둘(배열을 함께 쓴다 — 인스턴싱 길, 둘째 꼴은 정점 색), 나머지는 제 배열(묶음 저장소 — 정점 색·윤곽선 없는 그물이 섞인다).
 * 아홉째마다 돌린 행렬(눕힌 것 섞임), 나머지는 원점만. own이 false면 모두 같은 꼴(STEP 꼴 — 묶음 저장소 없음)
 */
function scene(n: number, own = true): Scene3d {
  const A = boxMesh('A', [0, 0, 0], [5, 5, 3], PAL[2]!);
  const B = boxMesh('B', [0, 0, 0], [4, 7, 2], PAL[2]!);
  B.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7) % 10) / 10));
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const mine = own && i % 3 !== 0;
    const shared = i % 2 ? A : B;
    const m: Mesh3d = mine
      ? boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`)
      : { ...shared, id: `b${i}`, name: `b${i}`, group: `g${i % 4}`, color: PAL[i % 2]! };
    if (i % 9 === 0) m.matrix = placeAt((i % 30) * 10, Math.floor(i / 30) * 10, 0, i * 7, i % 18 === 0);
    else m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (mine && i % 3 === 1) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
    if (mine && i % 13 === 2) delete m.edges;
    return m;
  });
  return { name: 's', units: 'mm', meshes, lines: [] };
}

type Cnt = { calls: number; draws: number; dl: number; dlCalls: number; mc: number; mvpc: number; mvp: number; clip: number };
type W = { v: Viewer3d; gl: FakeGL; r: { lineMvpcOff: boolean }; count(): Cnt };
const zero = (): Cnt => ({ calls: 0, draws: 0, dl: 0, dlCalls: 0, mc: 0, mvpc: 0, mvp: 0, clip: 0 });

/**
 * 뷰어(묶어 그리기 켬)와 렌더러 GL 호출 세기: 프레임 GL 호출·그리기, 렌더러 drawLines 부른 수(dl)와 그 안 GL 호출 수(dlCalls), 단면 하나 평면을 받은 drawLines 수(mc),
 * 선 프로그램에 보낸 u_mvpc·u_mvp·u_clip 수
 */
function view(sc: Scene3d): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> & { lineMvpcOff: boolean } }).renderer;
  let c = zero();
  let inDl = 0;
  const dl = (r.drawLines as (...a: unknown[]) => unknown).bind(r);
  r.drawLines = (...a: unknown[]) => {
    c.dl++;
    const o = a[3] as { clip?: unknown; clips?: unknown; count: number };
    if (o.clip && !o.clips && o.count > 0) c.mc++;
    inDl++;
    try {
      return dl(...a);
    } finally {
      inDl--;
    }
  };
  const base = r.gl as Record<string | symbol, unknown>;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        c.calls++;
        if (inDl) c.dlCalls++;
        if (typeof k === 'string' && k.startsWith('draw')) c.draws++;
        if (typeof k === 'string' && k.startsWith('uniform')) {
          const l = a[0] as { name: string } | null;
          if (l?.name === 'u_mvpc') c.mvpc++;
          else if (l?.name === 'u_mvp') c.mvp++;
          else if (l?.name === 'u_clip') c.clip++;
        }
        return (x as (...y: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  v.setRenderOptions({ merging: true });
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  v.renderNow();
  for (let i = 0; i < 100 && (v.stats.merged.pending > 0 || v.stats.instanced.pending > 0); i++) v.renderNow();
  v.renderNow();
  return {
    v,
    gl,
    r,
    count: () => {
      const out = (c = zero());
      v.renderNow();
      c = zero();
      return out;
    },
  };
}

/** MVPC 켬·끔 그리기의 펼친 도형·그리기 수가 같은지 보고 두 셈을 돌려준다(끝에 켬으로 둔다) */
function both(w: W, label: string): { on: Cnt; off: Cnt } {
  w.r.lineMvpcOff = false;
  const a = expandFrame(w.gl, () => w.v.renderNow());
  const on = w.count();
  w.r.lineMvpcOff = true;
  const b = expandFrame(w.gl, () => w.v.renderNow());
  const off = w.count();
  w.r.lineMvpcOff = false;
  expect(a.length, label).toBe(b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(a[i], `${label} #${i}`).toBe(b[i]);
  expect(on.draws, label).toBe(off.draws);
  expect(on.dl, label).toBe(off.dl);
  return { on, off };
}

/** #ifdef·#ifndef·#else·#endif만 정의 여부대로 펼친다(lines080 시험 꼴) */
const preprocess = (src: string, defs: readonly string[]): string => {
  const out: string[] = [];
  const stack: boolean[] = [];
  for (const line of src.split('\n')) {
    const t = line.trim();
    const m = /^#if(n?)def (\w+)$/.exec(t);
    if (m) stack.push(defs.includes(m[2]!) !== (m[1] === 'n'));
    else if (t === '#else') stack.push(!stack.pop());
    else if (t === '#endif') stack.pop();
    else if (/^#define \w+$/.test(t)) continue;
    else if (stack.every(Boolean)) out.push(line);
  }
  expect(stack).toEqual([]);
  return out.join('\n');
};

describe('0.78.0 단면 하나 선의 행렬·평면 한 배열(MVPC)', () => {
  it('묶음 구간·인스턴싱·그물마다가 섞인 장면의 여러 상태 — 그린 도형·그리기 수는 MVPC를 끈 그리기(0.77.0 길)와 같고, 단면 하나면 GL 호출이 그물마다 선 하나에 하나씩 준다', () => {
    const w = view(scene(300));
    const v = w.v;
    expect(v.stats.merged.meshes, '묶음 저장소').toBe(200);
    expect(v.stats.instanced.items, '인스턴싱').toBeGreaterThan(0);
    v.setSection({ normal: [1, 0, 0], offset: 150 });
    v.renderNow();
    const g = globalThis as { devicePixelRatio: number };
    const cases: [string, () => void, boolean][] = [
      ['section', () => {}, true],
      ['fog', () => v.setFog({ start: 50, end: 600 }), true],
      ['hi', () => (v.setFog(null), v.highlight(['b1', 'b3', 'b4', 'b6', 'b7', 'b30', 'b31', 'b32', 'b33', 'b200'])), true],
      ['looks', () => (v.highlight(null), v.setItemOpacity('b5', 0.5), v.setItemOpacity('b6', 0.3), v.setItemColor('b8', [1, 0, 0, 1]), v.setItemEdgeColor('b9', [0, 1, 0, 1])), true],
      ['ranges', () => (v.setHiddenRanges('b11', { prims: [{ start: 0, count: 2 }], edges: [{ start: 1, count: 3 }] }), v.setHiddenRanges('b12', { edges: [{ start: 0, count: 2 }] })), true],
      ['hidden', () => (v.setItemVisible('b15', false), v.setItemVisible('b18', false)), true],
      ['hiddenLine', () => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 })), true],
      ['hiddenLine-fog', () => v.setFog({ start: 50, end: 600 }), true],
      ['wireframe', () => (v.setFog(null), v.setRenderOptions({ hiddenEdges: null }), v.setRenderMode('wireframe')), true],
      ['xray', () => v.setRenderMode('xray'), true],
      ['shaded-back', () => (v.setRenderMode('shadedEdges'), v.setRenderOptions({ hiddenEdges: { opacity: 0.4, shaded: true } })), true],
      ['drag', () => v.setSectionPosition(0.43), true],
      ['dpr2', () => (g.devicePixelRatio = 2, v.setRenderOptions({ hiddenEdges: null })), true],
      ['dpr2-hi-fog', () => (v.highlight(['b2', 'b3', 'b40']), v.setFog({ start: 50, end: 600 })), true],
      ['sections', () => (g.devicePixelRatio = 1, v.setFog(null), v.highlight(null), v.setSections([{ normal: [1, 0, 0], offset: 150 }, { normal: [0, 1, 0], offset: 100 }])), false],
      ['none', () => v.setSection(null), false],
    ];
    try {
      for (const [name, set, single] of cases) {
        set();
        v.renderNow();
        const { on, off } = both(w, name);
        const s = `${name} calls ${on.calls}/${off.calls} dl ${on.dl} mc ${on.mc} mvpc ${on.mvpc} mvp ${on.mvp}/${off.mvp} clip ${on.clip}/${off.clip}`;
        if (single) {
          expect(on.mc, s).toBeGreaterThan(50);
          // 켬: 단면 하나 선 그리기는 u_mvp·u_clip을 보내지 않고 u_mvpc만, 끔(0.77.0 길)과의 GL 호출 차 = u_mvp·u_clip 둘을 한 번으로 줄인 그리기 수
          expect(on.mvpc, s).toBeGreaterThan(0);
          expect(on.calls, s).toBeLessThan(off.calls);
          expect(off.calls - on.calls, s).toBe(off.mvp + off.clip - (on.mvp + on.clip) - on.mvpc);
          expect(off.calls - on.calls, s).toBeGreaterThan(on.mc * 0.5);
        } else {
          // 여러 단면·단면 없음은 MVPC를 쓰지 않는다(0.77.0과 같은 GL 호출)
          expect(on.mc, s).toBe(0);
          expect(on.mvpc, s).toBe(0);
          expect(on.calls, s).toBe(off.calls);
        }
      }
    } finally {
      g.devicePixelRatio = 1;
    }
  });

  it('같은 꼴 부품만(STEP 꼴)의 단면 하나: 그물마다 윤곽선 그리기 하나에 GL 셋(행렬·평면 한 배열·VAO·그리기 — 0.77.0 넷), 안개 넷(0.77.0 다섯), 숨은 점선·화소 비율 2도 셋', () => {
    const w = view(scene(240, false));
    const v = w.v;
    expect(v.stats.merged.meshes).toBe(0);
    v.setSection({ normal: [1, 0, 0], offset: 150 });
    v.renderNow();
    const plain = w.count();
    const { off } = both(w, 'step');
    expect(plain.dl).toBeGreaterThan(200);
    expect(plain.dlCalls, 'step').toBeLessThanOrEqual(3 * plain.dl + 24);
    expect(off.dlCalls, 'step 0.77.0 길').toBeGreaterThanOrEqual(4 * off.dl - 24);
    v.setFog({ start: 50, end: 600 });
    v.renderNow();
    const fog = w.count();
    both(w, 'step-fog');
    expect(fog.dlCalls, 'fog').toBeLessThanOrEqual(4 * fog.dl + 32);
    v.setFog(null);
    v.setRenderMode('hiddenLine');
    v.setRenderOptions({ hiddenEdges: 0.4 });
    v.renderNow();
    const dash = w.count();
    both(w, 'step-dash');
    expect(dash.dl).toBeGreaterThan(2 * plain.dl - 10);
    expect(dash.dlCalls, 'dash').toBeLessThanOrEqual(3 * dash.dl + 32);
    v.setRenderMode('shadedEdges');
    v.setRenderOptions({ hiddenEdges: null });
    const g = globalThis as { devicePixelRatio: number };
    g.devicePixelRatio = 2;
    try {
      v.renderNow();
      const wide = w.count();
      both(w, 'step-dpr2');
      expect(wide.dlCalls, 'dpr2').toBeLessThanOrEqual(3 * wide.dl + 32);
    } finally {
      g.devicePixelRatio = 1;
    }
  });

  it('MVPC 변종 글: u_mvpc[5] 한 배열에서 같은 이름의 지역 u_mvp·u_clip(식은 그대로), 정의하지 않은 변종은 u_mvpc가 없는 예전 글', () => {
    for (const [src, defs] of [
      [THIN_VS, ['CLIP']],
      [THIN_VS, ['CLIP', 'FOG']],
      [WIDE_VS, []],
      [WIDE_VS, ['CAPZ', 'FOG']],
    ] as [string, string[]][]) {
      const m = preprocess(withDefines(src, ...defs, 'MVPC'), [...defs, 'MVPC']);
      expect(m).toContain('uniform vec4 u_mvpc[5];');
      expect(m).not.toContain('uniform mat4 u_mvp;');
      expect(m).not.toContain('uniform vec4 u_clip;');
      expect(m).toContain('  mat4 u_mvp = mat4(u_mvpc[0], u_mvpc[1], u_mvpc[2], u_mvpc[3]);\n');
      expect(m).toContain('  vec4 u_clip = u_mvpc[4];\n');
      const o = preprocess(withDefines(src, ...defs), defs);
      expect(o).not.toContain('u_mvpc');
      expect(o).toContain('uniform mat4 u_mvp;');
      expect(o).toContain('uniform vec4 u_clip;');
      // 두 글은 행렬·평면 선언과 지역 변수 두 줄만 다르다
      const strip = (s: string): string =>
        s
          .split('\n')
          .filter((l) => !/u_mvpc|^uniform mat4 u_mvp;$|^uniform vec4 u_clip;$/.test(l))
          .join('\n');
      expect(strip(m)).toBe(strip(o));
      // 인스턴싱 변종에는 들지 않는다(MVPC는 INST와 함께 쓰지 않는다 — 정의해도 INST 쪽 글은 그대로)
      expect(preprocess(withDefines(src, ...defs, 'INST'), [...defs, 'INST'])).not.toContain('u_mvpc');
    }
  });

  it('문맥을 잃었다 되찾아도(새 MVPC 프로그램) 다음 그리기는 잃기 전·MVPC를 끈 그리기와 같다', () => {
    const w = view(scene(120, false));
    const v = w.v;
    v.setSection({ normal: [1, 0, 0], offset: 120 });
    v.renderNow();
    const before = expandFrame(w.gl, () => v.renderNow());
    (v.canvas as unknown as { fire(t: string, e: object): void }).fire('webglcontextlost', {});
    (v.canvas as unknown as { fire(t: string, e: object): void }).fire('webglcontextrestored', {});
    for (let i = 0; i < 20; i++) v.renderNow();
    const after = expandFrame(w.gl, () => v.renderNow());
    expect(after).toEqual(before);
    const { on, off } = both(w, 'restored');
    expect(on.mvpc).toBeGreaterThan(50);
    // 단면 하나 선 그리기의 u_mvp·u_clip 둘이 u_mvpc 하나로(남은 u_mvp·u_clip은 단면 테두리·잘린 면 채우기 그물 프로그램 몫 — 끔과 같은 수만큼 빠진다)
    expect(off.mvp + off.clip - (on.mvp + on.clip)).toBe(2 * on.mvpc);
    expect(off.calls - on.calls).toBe(on.mvpc);
  });
});
