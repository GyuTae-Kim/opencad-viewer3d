/**
 * 0.76.0 면 차례·선분 묶음 차례에서 같은 값으로 다시 보내던 GL 호출 빼기(그리는 차례·그린 도형은 그대로):
 *  - 그물(면) 프로그램 균일 변수 기억(UniMemo — 균일 변수 위치마다 그 프로그램에 마지막으로 보낸 값, 그리기 한 번 동안): 프로그램을 바꿀 때마다 고정 균일 변수
 *    (u_ortho·해·안개·무늬 단위)와 색·깃발·행렬을 다시 보내지 않는다(잘린 면 단위마다·뒷면 변종을 오갈 때·반투명 차례). 뒷면 버리기(CULL_FACE)는 이 그리기의
 *    상태를 들고 같으면 보내지 않고, 잘린 면 채우기의 면 밀기 값은 차례마다 한 번
 *  - 선분 묶음 차례(모형 모서리를 선분 묶음으로 주는 장면 — SKP)와 그 숨은 점선이 선 기억을 쓰고(0.75.0은 묶음마다 모두 보냈다), 섞기는 켠 묶음 뒤에만 끈다.
 *    선 기억은 그리기마다 값(시점 투영 · 모형·단면 평면·안개 눈 깊이 행·여러 단면 평면)도 비트까지 같으면 보내지 않는다
 * 한 프레임 안에서 같은 프로그램·같은 균일 변수에 앞서 보낸 값을 다시 보낸 수와 켠 상태를 다시 켜고 끈 수를 센다. 그린 도형(tests/drawexpand.ts)과 그리기마다의
 * 스텐실·섞기·자르기·보기 창·무늬 묶기 상태, clear 차례는 기억을 끈 그리기(faceMemoOff·lineMemoOff — 모두 보낸다)와 프레임마다 같다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL, FakeTexture } from './fakegl';
import { expandDraw } from './drawexpand';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, Rgba, Scene3d, Texture3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
/** 가짜 그림(가짜 GL이 올린 그림 꼬리표를 든다 — 0.25.0 시험 꼴) */
type FakeBitmap = { width: number; height: number; tag: string; close(): void };
const fakeBitmap = (tag: string, width: number, height: number): FakeBitmap => ({ width, height, tag, close() {} });
const g = globalThis as Record<string, unknown>;
let savedCib: unknown;
beforeAll(async () => {
  dom = installDom();
  savedCib = g.createImageBitmap;
  g.createImageBitmap = async (src: unknown, o?: ImageBitmapOptions): Promise<FakeBitmap> => {
    const s = src as FakeBitmap;
    return fakeBitmap(`bmp:${s.tag}`, o?.resizeWidth ?? s.width, o?.resizeHeight ?? s.height);
  };
  expect(await Viewer3d.preloadMerging()).toBe(true);
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  g.createImageBitmap = savedCib;
  dom.restore();
});

const MATS: Rgba[] = Array.from({ length: 6 }, (_, k) => [0.3 + (k % 3) * 0.2, 0.4 + (k % 2) * 0.3, 0.5, 1]);
const EDGE: Rgba = [0.1, 0.1, 0.12, 1];
const BACK: Rgba = [0.55, 0.6, 0.75, 1];

/** 상자 정점 8개의 무늬 좌표(2값) */
const BOX_UV = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1]);

/**
 * SKP 앱 꼴 장면: 그물마다 제 배열(배열을 함께 쓰지 않는다)·행렬 없음(절반은 원점, 절반은 세계 좌표 그대로)·윤곽선 없음(삼각형 변 끔)·그물마다 모형 모서리 선분 묶음
 * (숨은 점선 대상, 다섯째마다 굵기 2 선분 묶음 더하기, 일곱째 점선)·넷째마다 뒷면 색·둘씩 채우기 묶음·셋째마다 정점 색·열한째 한쪽 면·열셋째 반투명·
 * 아홉째 무늬(그 가운데 넷째마다 뒷면 무늬도)·열일곱째 거칠기·금속성(PBR 변종)
 */
function skpScene(n: number, withTex = true): Scene3d {
  const meshes: Mesh3d[] = [];
  const lines: LineSet3d[] = [];
  for (let i = 0; i < n; i++) {
    // 이웃 상자와 겹치게(어느 단면 평면도 상자를 자른다 — 잘린 면 채우기가 늘 있다)
    const x = (i % 20) * 7, y = Math.floor(i / 20) * 7;
    const w = 6 + (i % 5) * 0.75, d = 6 + (i % 7) * 0.5, h = 1 + (i % 9) * 0.6;
    const o = i % 2 === 0;
    const b = boxMesh(`m${i}`, o ? [0, 0, 0] : [x, y, 0], o ? [w, d, h] : [x + w, y + d, h], MATS[(i * 5) % MATS.length]!, `t${i % 4}`);
    const edges = b.edges!;
    delete b.edges;
    const m: Mesh3d = { ...b, closed: undefined, triangleEdges: false };
    if (o) m.origin = [x, y, 0];
    if (i % 4 === 0) m.backColor = BACK;
    if (i % 3 !== 2) m.capGroup = `c${i >> 1}`;
    if (i % 3 === 1) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7 + i) % 10) / 10));
    if (i % 11 === 5) m.doubleSided = false;
    if (i % 13 === 6) m.color = [0.8, 0.3, 0.2, 0.5];
    if (withTex && i % 9 === 4) {
      m.uvs = BOX_UV;
      m.texture = 'tx';
      if (i % 4 === 0) m.backTexture = 'tb';
    }
    if (i % 17 === 8) {
      m.roughness = 0.35;
      m.metallic = 0.6;
    }
    meshes.push(m);
    const at = o ? ([x, y, 0] as [number, number, number]) : undefined;
    lines.push({ id: `e${i}`, positions: edges, origin: at, color: EDGE, group: `t${i % 4}`, hiddenEdges: true, ...(i % 7 === 3 ? { dashed: true } : {}) });
    if (i % 5 === 0) lines.push({ id: `p${i}`, positions: edges.slice(0, 24), origin: at, color: EDGE, width: 2, group: `t${i % 4}` });
  }
  const tex = (id: string): Texture3d => ({ id, bitmap: fakeBitmap(id, 16, 16) as unknown as ImageBitmap, width: 16, height: 16 });
  return { name: 'skp', units: 'mm', meshes, lines, textures: withTex ? [tex('tx'), tex('tb')] : [] };
}

/** 0.75.0 시험 장면 꼴: 셋째마다 같은 꼴 둘(인스턴싱), 나머지는 제 배열(묶음 저장소), 아홉째마다 돌린 행렬 */
function mixScene(n: number): Scene3d {
  const A = boxMesh('A', [0, 0, 0], [5, 5, 3], MATS[2]!);
  const B = boxMesh('B', [0, 0, 0], [4, 7, 2], MATS[2]!);
  B.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7) % 10) / 10));
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const mine = i % 3 !== 0;
    const m: Mesh3d = mine
      ? boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`)
      : { ...(i % 2 ? A : B), id: `b${i}`, name: `b${i}`, group: `g${i % 4}`, color: MATS[i % 2]! };
    if (i % 9 === 0) m.matrix = placeAt((i % 30) * 10, Math.floor(i / 30) * 10, 0, i * 7, i % 18 === 0);
    else m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (mine && i % 4 === 1) m.backColor = BACK;
    return m;
  });
  return { name: 'mix', units: 'mm', meshes, lines: [] };
}

const kindOf = (vs: string): 'mesh' | 'line' | 'other' =>
  vs.includes('layout(location=1) in vec3 a_nrm;') ? 'mesh' : vs.includes('in vec3 a_p0;') || vs.includes('layout(location=1) in vec4 a_col;') ? 'line' : 'other';

type Cnt = { calls: number; meshDup: number; lineDup: number; stateDup: number; draws: number; dl: number; dlCalls: number; caps: number };
type Rnd = { r: Record<string, unknown> & { lineMemoOff: boolean; faceMemoOff: boolean } };
type W = Rnd & { v: Viewer3d; gl: FakeGL; frame(): { rec: string[]; c: Cnt } };
const zero = (): Cnt => ({ calls: 0, meshDup: 0, lineDup: 0, stateDup: 0, draws: 0, dl: 0, dlCalls: 0, caps: 0 });

/**
 * 뷰어와 렌더러 GL 호출 세기: 한 프레임 안에서 그물·선 프로그램 균일 변수를 앞서 같은 값으로 보낸 뒤 다시 보낸 수(meshDup·lineDup), 켠 상태와 같은 enable·disable과
 * 같은 값 polygonOffset(stateDup), 렌더러 drawLines 부른 수와 그 안의 GL 호출 수. frame()은 그 프레임의 펼친 도형 + 그리기마다 넓힌 상태 + clear 기록을 돌려준다
 */
async function view(sc: Scene3d, opts: { merging: boolean }): Promise<W> {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> & { lineMemoOff: boolean; faceMemoOff: boolean } }).renderer;
  let c = zero();
  let inDl = 0;
  // 잘린 면 채우기 단위 수(drawCaps에 넘긴 단위)
  const dcaps = (r.drawCaps as (...a: unknown[]) => unknown).bind(r);
  r.drawCaps = (...a: unknown[]) => {
    c.caps += (a[3] as unknown[]).length;
    return dcaps(...a);
  };
  const dl = (r.drawLines as (...a: unknown[]) => unknown).bind(r);
  r.drawLines = (...a: unknown[]) => {
    c.dl++;
    inDl++;
    try {
      return dl(...a);
    } finally {
      inDl--;
    }
  };
  const seen = new Map<string, string>();
  const caps = new Map<unknown, boolean>();
  const st2 = new Map<string, string>();
  let unit = 'TEXTURE0';
  const tex = new Map<string, FakeTexture | null>();
  let sink: string[] | null = null;
  const nm = (x: unknown): string => (typeof x === 'number' ? (gl.nameOf(x) ?? String(x)) : x && typeof x === 'object' ? String((x as { id?: number }).id ?? 'o') : String(x));
  const base = r.gl as Record<string | symbol, unknown>;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        c.calls++;
        if (inDl) c.dlCalls++;
        if (typeof k === 'string') {
          if (k.startsWith('draw')) c.draws++;
          if (k.startsWith('uniform')) {
            const l = a[0] as { p: { id: number; shaders: { src: string }[] }; name: string } | null;
            if (l) {
              const key = `${l.p.id}:${l.name}`;
              const val = JSON.stringify(a.slice(k.startsWith('uniformMatrix') ? 2 : 1).map((y) => (ArrayBuffer.isView(y) ? Array.from(y as Float32Array) : y)));
              if (seen.get(key) === val) {
                const kd = kindOf(l.p.shaders[0]?.src ?? '');
                if (kd === 'mesh') c.meshDup++;
                else if (kd === 'line') c.lineDup++;
              }
              seen.set(key, val);
            }
          } else if (k === 'enable' || k === 'disable') {
            if (caps.get(a[0]) === (k === 'enable')) c.stateDup++;
            caps.set(a[0], k === 'enable');
          } else if (k === 'activeTexture') unit = nm(a[0]);
          else if (k === 'bindTexture') tex.set(unit, (a[1] as FakeTexture | null) ?? null);
          else if (k === 'clear') sink?.push(`clear|${nm(a[0])}|${[...caps].some(([q, on]) => on && nm(q) === 'SCISSOR_TEST') ? st2.get('scissor') : '-'}|${st2.get('stencilMask')}`);
          else if (/^(stencil|blend|scissor|viewport|cullFace|frontFace|polygonOffset)/.test(k)) {
            const s = a.map(nm).join(',');
            if (k === 'polygonOffset' && st2.get(k) === s) c.stateDup++;
            st2.set(k, s);
          }
        }
        return (x as (...y: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  v.setRenderOptions({ merging: opts.merging });
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  v.renderNow();
  for (let i = 0; i < 100 && (v.stats.merged.pending > 0 || v.stats.instanced.pending > 0); i++) v.renderNow();
  // 무늬(가짜 그림 — 비동기로 풀린다)가 모두 올라갈 때까지(시간으로 기다린다)
  const end = performance.now() + 10_000;
  while (v.stats.textures.ready < v.stats.textures.count) {
    if (performance.now() > end) throw new Error('무늬 기다림 시간을 넘었습니다');
    await new Promise((r) => setTimeout(r, 1));
    v.renderNow();
  }
  v.renderNow();
  // 묶인 무늬는 객체 번호 대신 올린 그림 꼬리표·크기로(문맥을 되찾으면 같은 그림의 무늬를 새로 만든다)
  const ext = (): string =>
    `st|${['stencilFunc', 'stencilOp', 'stencilMask', 'blendFunc', 'blendFuncSeparate', 'scissor', 'viewport', 'cullFace'].map((k) => st2.get(k) ?? '-').join(';')}|${[...tex]
      .filter(([, t]) => t)
      .map(([u, t]) => `${u}:${t!.src}/${t!.w ?? ''}x${t!.h ?? ''}`)
      .sort()
      .join(',')}`;
  return {
    v,
    gl,
    r,
    frame: () => {
      const out: string[] = [];
      c = zero();
      seen.clear();
      sink = out;
      gl.onDraw = (d) => {
        expandDraw(gl, d, out);
        out.push(ext());
      };
      try {
        v.renderNow();
      } finally {
        gl.onDraw = null;
        sink = null;
      }
      const got = c;
      c = zero();
      return { rec: out, c: got };
    },
  };
}

/** 기억 켬·끔 그리기의 펼친 기록(도형 + 넓힌 상태 + clear)이 같고 그리기 수가 같다 — 켬·끔의 셈을 돌려준다 */
function both(w: W, label: string): { on: Cnt; off: Cnt } {
  w.r.faceMemoOff = false;
  w.r.lineMemoOff = false;
  const a = w.frame();
  w.r.faceMemoOff = true;
  w.r.lineMemoOff = true;
  const b = w.frame();
  w.r.faceMemoOff = false;
  w.r.lineMemoOff = false;
  expect(a.rec.length, label).toBe(b.rec.length);
  for (let i = 0; i < a.rec.length; i++) if (a.rec[i] !== b.rec[i]) expect(a.rec[i], `${label} #${i}`).toBe(b.rec[i]);
  expect(a.c.draws, label).toBe(b.c.draws);
  return { on: a.c, off: b.c };
}

const SO = { caps: 'closed', outline: true, plane: true } as const;

describe('0.76.0 면·선분 묶음 차례의 같은 값 GL 호출', () => {
  it('SKP 꼴(제 배열·선분 묶음 모서리·뒷면 색·무늬·PBR·채우기 묶음) — 상태마다 그물·선 프로그램에 같은 값을 다시 보내지 않고, 그린 도형·상태는 기억을 끈 그리기와 같다', async () => {
    const w = await view(skpScene(240), { merging: false });
    const v = w.v;
    expect(v.stats.merged.meshes).toBe(0);
    expect(v.stats.textures.ready).toBe(2);
    // 무늬·뒷면 무늬·PBR·뒷면 색 변종 그물이 든다(펼친 기록의 정의 칸)
    const f0 = w.frame().rec;
    for (const d of ['TEX', 'BACKTEX', 'PBR', 'BACK']) expect(f0.some((s) => s.startsWith('mesh|') && new RegExp(`[|,]${d}(,|\\|)`).test(s)), d).toBe(true);
    const ids = Array.from({ length: 240 }, (_, i) => `m${i}`);
    const cases: [string, () => void][] = [
      ['still', () => {}],
      ['section', () => v.setSectionAxis('x', 0.5, SO)],
      ['drag', () => v.setSectionPosition(0.43)],
      ['hide', () => (v.setItemVisible('m3', false), v.setItemVisible('e7', false))],
      ['hi', () => v.highlight(['m1', 'm4', 'm9', 'e10', 'p20'])],
      ['looks', () => (v.highlight(null), v.setItemOpacity('m5', 0.5), v.setItemColor('m8', [1, 0, 0, 1]), v.setItemColor('e8', [0, 0, 1, 1]))],
      ['ranges', () => (v.setHiddenRanges('e12', { prims: [{ start: 0, count: 3 }] }), v.setLineDrawRange('e14', 5, { ghost: 0.3 }))],
      ['hiddenLine', () => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 }))],
      ['mono', () => (v.setRenderOptions({ hiddenEdges: null }), v.setRenderMode('monochrome'))],
      ['xray', () => v.setRenderMode('xray')],
      ['sun', () => (v.setRenderMode('shadedEdges'), v.setLighting({ sun: { direction: [0.3, -0.5, 0.8] }, shadows: true }))],
      ['fog', () => (v.setLighting(null), v.setFog({ start: 20, end: 400 }))],
      ['profiles', () => (v.setFog(null), v.setRenderOptions({ profiles: true }), v.setItemProfileColor('m2', [0, 0.5, 0, 1]))],
      ['sections', () => (v.setRenderOptions({ profiles: null }), v.setSections([{ normal: [1, 0, 0], offset: 60, caps: 'closed' }, { normal: [0, 1, 0], offset: 40, caps: 'closed' }]))],
      ['tags', () => (v.setSection(null), ids.forEach((id, i) => v.setItemColor(id, MATS[i % 4]!)))],
    ];
    const rows: string[] = [];
    for (const [name, set] of cases) {
      set();
      v.renderNow();
      const { on, off } = both(w, name);
      rows.push(`${name} calls ${on.calls}/${off.calls} mesh ${on.meshDup}/${off.meshDup} line ${on.lineDup}/${off.lineDup} state ${on.stateDup}/${off.stateDup}`);
      const row = rows.at(-1)!;
      // 단면을 켠 상태(X-ray 빼고)는 잘린 면 채우기 단위가 있다(단위마다 홀짝·채우기 그리기 — 0.75.0은 단위마다 고정 균일 변수를 다시 보냈다)
      if (name !== 'still' && name !== 'xray' && name !== 'tags') expect(on.caps, row).toBeGreaterThan(4);
      // 같은 값 다시 보내기는 차례·프로그램마다 몇 번(새 기억의 처음 그리기 — 그물·선분 묶음 수와 상관없다). 0.75.0은 선분 묶음마다 일곱여덟·잘린 면 단위마다 열 남짓
      expect(on.meshDup, row).toBeLessThanOrEqual(16);
      expect(on.lineDup, row).toBeLessThanOrEqual(40);
      expect(on.stateDup, row).toBeLessThanOrEqual(12);
      expect(on.calls, row).toBeLessThan(off.calls);
      // 끔(0.75.0과 같은 길 — 모두 보낸다)은 선분 묶음·그물 수만큼 같은 값을 다시 보낸다
      expect(off.lineDup, row).toBeGreaterThan(200);
    }
  });

  it('SKP 꼴 단면 하나의 선분 묶음 차례: 선분 묶음 그리기 하나에 GL 다섯 이하(행렬·평면·VAO·그리기, 프로그램이 바뀌면 useProgram — 고정 균일 변수는 다를 때만)', async () => {
    const w = await view(skpScene(240), { merging: false });
    w.v.setSectionAxis('x', 0.5, SO);
    w.v.renderNow();
    const { on, off } = both(w, 'section-lines');
    // 선분 묶음 288개(+ 단면 테두리 하나): 원점이 다른 묶음은 행렬·로컬 평면이 다르고, 굵기 2·점선 묶음 앞뒤는 프로그램이 바뀐다(0.75.0은 그리기마다 고정 균일 변수까지 열하나 남짓)
    expect(on.dl).toBeGreaterThan(280);
    expect(on.caps).toBeGreaterThan(8);
    expect(on.dlCalls).toBeLessThanOrEqual(5 * on.dl);
    expect(off.dlCalls).toBeGreaterThan(2 * on.dlCalls);
  });

  it('인스턴싱·묶음 저장소·그물마다(뒷면 변종)가 섞인 장면 — 그림자·안개·단면·여러 단면에서 그물 프로그램에 같은 값을 다시 보내지 않는다', async () => {
    const w = await view(mixScene(300), { merging: true });
    const v = w.v;
    expect(v.stats.merged.meshes).toBeGreaterThan(0);
    expect(v.stats.instanced.items).toBeGreaterThan(0);
    const cases: [string, () => void][] = [
      ['still', () => {}],
      ['section', () => v.setSectionAxis('x', 0.5, SO)],
      ['drag', () => v.setSectionPosition(0.4)],
      ['hi', () => v.highlight(['b1', 'b4', 'b30', 'b31'])],
      ['looks', () => (v.highlight(null), v.setItemOpacity('b5', 0.5), v.setItemColor('b8', [1, 0, 0, 1]))],
      ['sun', () => v.setLighting({ sun: { direction: [0.3, -0.5, 0.8] }, shadows: true })],
      ['fog', () => (v.setLighting(null), v.setFog({ start: 50, end: 600 }))],
      ['hiddenLine', () => (v.setFog(null), v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: true }))],
      ['sections', () => (v.setRenderMode('shadedEdges'), v.setRenderOptions({ hiddenEdges: null }), v.setSections([{ normal: [1, 0, 0], offset: 150 }, { normal: [0, 1, 0], offset: 100 }]))],
    ];
    for (const [name, set] of cases) {
      set();
      v.renderNow();
      const { on, off } = both(w, name);
      const row = `${name} calls ${on.calls}/${off.calls} mesh ${on.meshDup}/${off.meshDup} line ${on.lineDup}/${off.lineDup} state ${on.stateDup}/${off.stateDup}`;
      expect(on.meshDup, row).toBeLessThanOrEqual(16);
      expect(on.lineDup, row).toBeLessThanOrEqual(24);
      expect(on.stateDup, row).toBeLessThanOrEqual(12);
      expect(on.calls, row).toBeLessThanOrEqual(off.calls);
    }
  });

  it('프레임 사이에 앱이 GL 상태를 바꾸거나 문맥을 잃었다 되찾아도 다음 그리기는 기억을 끈 그리기·바꾸기 전 그리기와 같다(기억은 그리기 한 번 동안만)', async () => {
    // 무늬 없이(되찾은 뒤 무늬 다시 올리기는 앱 몫 — 0.29.0 절)
    const w = await view(skpScene(120, false), { merging: false });
    const v = w.v;
    v.setSectionAxis('x', 0.5, SO);
    v.renderNow();
    const before = w.frame().rec;
    const g = w.gl as unknown as Record<string, (...a: unknown[]) => unknown> & Record<string, number>;
    const mess = (): void => {
      g.enable!(g.CULL_FACE);
      g.enable!(g.BLEND);
      g.polygonOffset!(7, 7);
      g.useProgram!(null);
      g.bindVertexArray!(null);
      g.depthMask!(false);
      g.colorMask!(false, true, false, true);
    };
    mess();
    const { rec: a } = w.frame();
    expect(a).toEqual(before);
    mess();
    both(w, 'after-mess');
    (v.canvas as unknown as { fire(t: string, e: object): void }).fire('webglcontextlost', {});
    (v.canvas as unknown as { fire(t: string, e: object): void }).fire('webglcontextrestored', {});
    for (let i = 0; i < 20; i++) v.renderNow();
    const { on } = both(w, 'restored');
    expect(w.frame().rec).toEqual(before);
    // 되찾은 뒤(새 프로그램)에도 기억은 그 그리기 안에서 같은 값을 다시 보내지 않는다
    expect(on.meshDup).toBeLessThanOrEqual(16);
    expect(on.lineDup).toBeLessThanOrEqual(40);
  });
});
