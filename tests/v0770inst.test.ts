/**
 * 0.77.0 남은 기억 밖 차례의 같은 값 GL 호출 빼기(그리는 차례·그린 도형은 그대로):
 *  - 인스턴싱 모서리 선(drawLinesInst — 같은 꼴 윤곽선·삼각형 변을 자리 여럿에 그리기 하나로): 차례 안에서 잇단 묶음은 프로그램이 같으면 useProgram을 다시 부르지 않고,
 *    고정 균일 변수(u_inst·u_color·u_vcol·u_alpha·u_override·u_bias·안개 색·범위·굵은 선 값)와 자리 시작·자리 수를 그물(면) 프로그램과 같은 균일 변수 기억(UniMemo)과 견준다
 *  - 점 묶음: 행렬·평면·안개·u_size·u_color·u_ring을 같은 기억과 견주고, 섞기는 반투명 점 앞에서 켜고 켠 채로 불투명 점을 만나면 끈다(0.76.0은 점마다 껐다)
 *  - 외곽선 색 깊이(u_pcol·행렬·평면)·해 그림자 깊이 그림(행렬·평면)도 같은 기억과 견준다
 * 한 프레임 안에서 같은 프로그램·같은 균일 변수에 앞서 보낸 값을 다시 보낸 수(프로그램 꼴마다)와 켠 상태를 다시 켜고 끈 수를 센다. 그린 도형(tests/drawexpand.ts)과 그리기마다
 * 스텐실·섞기·자르기·보기 창·무늬 묶기 상태, clear 차례는 기억을 끈 그리기(faceMemoOff·lineMemoOff — 모두 보낸다)와 프레임마다 같다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL, FakeTexture } from './fakegl';
import { expandDraw } from './drawexpand';
import { boxMesh } from '../src/synth';
import type { Mesh3d, PointSet3d, Rgba, Scene3d } from '../src/types';
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
  [0.6, 0.7, 0.3, 1],
];
const PT: Rgba = [0.9, 0.2, 0.1, 1];

/**
 * STEP 앱 꼴 장면 + 점 묶음: 꼴 K개(상자 크기가 다르다 — 꼴마다 배열을 함께 써 인스턴싱, 넷째 꼴은 정점 색, 다섯째 꼴은 윤곽선 없음 — 와이어프레임·숨은 선에서 삼각형 변 묶음),
 * 자리마다 행렬(돌림·눕힘 섞임). 열째마다 제 배열(묶음 저장소 — 묶어 그리기), 열한 개 가운데 잇단 둘은 세계 좌표 그대로(행렬·원점 없음 — 깊이 그림 행렬·평면이 같은 그물),
 * 열셋째 반투명. 점 묶음 P개(점 여섯씩): 같은 크기·색, 다섯째마다 반투명, 셋째마다 원점(모형 행렬), 일곱째 크기 6
 */
function stepScene(n: number, k: number, p: number): Scene3d {
  const shapes = Array.from({ length: k }, (_, j) => {
    const b = boxMesh(`S${j}`, [0, 0, 0], [3 + j, 4 + (j % 3), 2 + (j % 2)], PAL[j % PAL.length]!);
    if (j % 4 === 3) b.colors = Float32Array.from({ length: 32 }, (_, q) => (q % 4 === 3 ? 1 : ((q * 7 + j) % 10) / 10));
    if (j % 5 === 4) delete b.edges;
    return b;
  });
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const x = (i % 25) * 9, y = Math.floor(i / 25) * 9;
    if (i % 11 === 5 || i % 11 === 6) return boxMesh(`b${i}`, [x, y, 0], [x + 5, y + 6, 3 + (i % 4)], PAL[i % 3]!, `g${i % 4}`);
    if (i % 10 === 3) {
      const m = boxMesh(`b${i}`, [0, 0, 0], [6, 5, 2 + (i % 5)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`);
      m.origin = [x, y, 0];
      return m;
    }
    const s = shapes[i % k]!;
    const m: Mesh3d = { ...s, id: `b${i}`, name: `b${i}`, group: `g${i % 4}`, color: i % 13 === 6 ? [0.8, 0.3, 0.2, 0.5] : PAL[i % PAL.length]! };
    m.matrix = placeAt(x, y, 0, (i * 37) % 360, i % 6 === 0);
    return m;
  });
  const points: PointSet3d[] = Array.from({ length: p }, (_, j) => {
    const x = (j % 10) * 22, y = Math.floor(j / 10) * 22;
    const o = j % 3 === 0;
    const pos = new Float32Array(18);
    for (let q = 0; q < 6; q++) pos.set([(o ? 0 : x) + q, (o ? 0 : y) + (q % 2), 5 + (q % 3)], q * 3);
    return { id: `p${j}`, positions: pos, color: j % 5 === 2 ? [0.2, 0.3, 0.9, 0.5] : PT, size: j % 7 === 4 ? 6 : 4, group: `g${j % 4}`, ...(o ? { origin: [x, y, 0] as [number, number, number] } : {}) };
  });
  return { name: 'step', units: 'mm', meshes, lines: [], points };
}

type Kind = 'mesh' | 'line' | 'point' | 'depth' | 'other';
const kindOf = (vs: string): Kind =>
  vs.includes('layout(location=1) in vec3 a_nrm;')
    ? 'mesh'
    : vs.includes('in vec3 a_p0;') || vs.includes('layout(location=1) in vec4 a_col;')
      ? 'line'
      : vs.includes('layout(location=1) in vec3 a_pos;')
        ? 'point'
        : vs.includes('layout(location=0) in vec3 a_pos;') && vs.includes('uniform mat4 u_mvp;')
          ? 'depth'
          : 'other';

type Cnt = {
  calls: number;
  dup: Record<Kind, number>;
  stateDup: number;
  draws: number;
  /** drawLinesInst 부른 수·그 안 GL 호출 */
  il: number;
  ilCalls: number;
  /** 점 프로그램이 묶인 동안 GL 호출·그리기 */
  ptCalls: number;
  ptDraws: number;
  /** 깊이 그림 프로그램(해 그림자·외곽선 색 깊이)이 묶인 동안 그리기 */
  depthDraws: number;
};
const zero = (): Cnt => ({ calls: 0, dup: { mesh: 0, line: 0, point: 0, depth: 0, other: 0 }, stateDup: 0, draws: 0, il: 0, ilCalls: 0, ptCalls: 0, ptDraws: 0, depthDraws: 0 });
type W = { v: Viewer3d; gl: FakeGL; r: Record<string, unknown> & { lineMemoOff: boolean; faceMemoOff: boolean }; frame(): { rec: string[]; c: Cnt } };

/**
 * 뷰어와 렌더러 GL 호출 세기(0.76.0 시험 꼴 — 프로그램 꼴을 점·깊이 그림까지 나눈다): 한 프레임 안에서 같은 프로그램·같은 균일 변수에 같은 값을 다시 보낸 수(dup),
 * 켠 상태와 같은 enable·disable과 같은 값 polygonOffset(stateDup), drawLinesInst 부른 수와 그 안의 GL 호출, 점 프로그램이 묶인 동안의 GL 호출·그리기
 */
function view(sc: Scene3d): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: W['r'] }).renderer;
  let c = zero();
  let inIl = 0;
  const dli = (r.drawLinesInst as (...a: unknown[]) => unknown).bind(r);
  r.drawLinesInst = (...a: unknown[]) => {
    c.il++;
    inIl++;
    try {
      return dli(...a);
    } finally {
      inIl--;
    }
  };
  const seen = new Map<string, string>();
  const caps = new Map<unknown, boolean>();
  const st2 = new Map<string, string>();
  let unit = 'TEXTURE0';
  let bound: Kind = 'other';
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
        if (inIl) c.ilCalls++;
        if (typeof k === 'string') {
          if (k === 'useProgram') bound = a[0] ? kindOf((a[0] as { shaders: { src: string }[] }).shaders[0]?.src ?? '') : 'other';
          if (bound === 'point') c.ptCalls++;
          if (k.startsWith('draw')) {
            c.draws++;
            if (bound === 'point') c.ptDraws++;
            if (bound === 'depth') c.depthDraws++;
          }
          if (k.startsWith('uniform')) {
            const l = a[0] as { p: { id: number; shaders: { src: string }[] }; name: string } | null;
            if (l) {
              const key = `${l.p.id}:${l.name}`;
              const val = JSON.stringify(a.slice(k.startsWith('uniformMatrix') ? 2 : 1).map((y) => (ArrayBuffer.isView(y) ? Array.from(y as Float32Array) : y)));
              if (seen.get(key) === val) c.dup[kindOf(l.p.shaders[0]?.src ?? '')]++;
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
  v.setRenderOptions({ merging: true });
  v.setScene(sc);
  v.fit(false);
  v.orbitBy(0.4, 0.2);
  v.renderNow();
  for (let i = 0; i < 100 && (v.stats.merged.pending > 0 || v.stats.instanced.pending > 0); i++) v.renderNow();
  v.renderNow();
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

/** 기억 켬·끔 그리기의 펼친 기록(도형 + 넓힌 상태 + clear)이 같고 그리기 수가 같다 — pre는 그리기마다 앞에 부른다(해 그림자 깊이 그림을 다시 그리게) */
function both(w: W, label: string, pre?: () => void): { on: Cnt; off: Cnt } {
  w.r.faceMemoOff = false;
  w.r.lineMemoOff = false;
  pre?.();
  const a = w.frame();
  w.r.faceMemoOff = true;
  w.r.lineMemoOff = true;
  pre?.();
  const b = w.frame();
  w.r.faceMemoOff = false;
  w.r.lineMemoOff = false;
  expect(a.rec.length, label).toBe(b.rec.length);
  for (let i = 0; i < a.rec.length; i++) if (a.rec[i] !== b.rec[i]) expect(a.rec[i], `${label} #${i}`).toBe(b.rec[i]);
  expect(a.c.draws, label).toBe(b.c.draws);
  expect(a.c.il, label).toBe(b.c.il);
  return { on: a.c, off: b.c };
}

const SO = { caps: 'closed', outline: true, plane: true } as const;
const SUN = { sun: { direction: [0.3, -0.5, 0.8] as [number, number, number] }, shadows: true };
const row = (name: string, on: Cnt, off: Cnt): string =>
  `${name} calls ${on.calls}/${off.calls} il ${on.il} ilCalls ${on.ilCalls}/${off.ilCalls} pt ${on.ptDraws} ptCalls ${on.ptCalls}/${off.ptCalls} depth ${on.depthDraws} dup ${JSON.stringify(on.dup)}/${JSON.stringify(off.dup)} state ${on.stateDup}/${off.stateDup}`;

describe('0.77.0 인스턴싱 모서리 선·점 묶음·깊이 그림 차례의 같은 값 GL 호출', () => {
  it('STEP 꼴(꼴마다 배열을 함께 쓰는 인스턴싱 + 묶음 저장소 + 점 묶음) — 상태마다 같은 값을 다시 보내지 않고, 그린 도형·상태는 기억을 끈 그리기와 같다', () => {
    const w = view(stepScene(600, 10, 60));
    const v = w.v;
    expect(v.stats.instanced.items).toBeGreaterThan(300);
    expect(v.stats.merged.meshes).toBeGreaterThan(0);
    const cases: [string, () => void, (() => void)?][] = [
      ['still', () => {}],
      ['hi', () => v.highlight(['b1', 'b2', 'b14', 'b40', 'b77', 'p3'])],
      ['hide', () => (v.highlight(null), v.setItemVisible('b7', false), v.setItemVisible('p8', false))],
      ['looks', () => (v.setItemOpacity('b21', 0.5), v.setItemColor('b22', [1, 0, 0, 1]), v.setItemColor('p9', [0, 1, 0, 1]))],
      ['hiddenLine', () => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 }))],
      ['wireframe', () => (v.setRenderOptions({ hiddenEdges: null }), v.setRenderMode('wireframe'))],
      ['section', () => (v.setRenderMode('shadedEdges'), v.setSectionAxis('x', 0.5, SO))],
      ['drag', () => v.setSectionPosition(0.43)],
      ['secHidden', () => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 }))],
      ['sun', () => (v.setRenderOptions({ hiddenEdges: null }), v.setRenderMode('shadedEdges'), v.setLighting(SUN)), () => v.setLighting(SUN)],
      ['sunNoSec', () => v.setSection(null), () => v.setLighting(SUN)],
      ['fog', () => (v.setLighting(null), v.setFog({ start: 20, end: 400 }))],
      ['profiles', () => (v.setFog(null), v.setRenderOptions({ profiles: true }), v.setItemProfileColor('b2', [0, 0.5, 0, 1]))],
      ['profSec', () => v.setSectionAxis('y', 0.5, SO)],
      ['sections', () => (v.setRenderOptions({ profiles: null }), v.setSections([{ normal: [1, 0, 0], offset: 60, caps: 'closed' }, { normal: [0, 1, 0], offset: 40, caps: 'closed' }]))],
      ['mono', () => (v.setSection(null), v.setRenderMode('monochrome'))],
    ];
    let ilSeen = 0, ptSeen = 0, depthSeen = 0;
    for (const [name, set, pre] of cases) {
      set();
      v.renderNow();
      const { on, off } = both(w, name, pre);
      const s = row(name, on, off);
      ilSeen += on.il;
      ptSeen += on.ptDraws;
      depthSeen += on.depthDraws;
      // 점은 상태마다 그린다(숨긴 것 빼고 — 반투명 점 섞임)
      expect(on.ptDraws, s).toBeGreaterThan(40);
      // 같은 값 다시 보내기는 차례·프로그램마다 몇 번(그리기 처음·새 기억의 처음 보냄 — 묶음·점·그물 수와 상관없다)
      expect(on.dup.line, s).toBeLessThanOrEqual(24);
      expect(on.dup.point, s).toBeLessThanOrEqual(4);
      expect(on.dup.depth, s).toBeLessThanOrEqual(4);
      expect(on.dup.mesh, s).toBeLessThanOrEqual(16);
      expect(on.stateDup, s).toBeLessThanOrEqual(12);
      expect(on.calls, s).toBeLessThan(off.calls);
      // 점 그리기 하나에 GL 다섯 이하(VAO·그리기 + 값이 바뀐 것만 — 원점이 있는 묶음과 그 다음 묶음의 행렬·평면·안개 눈 깊이 행, 반투명·크기가 다른 묶음 앞뒤의 색·테 색·크기·섞기)
      // + 차례 처음 고정 값. 끔(0.76.0과 같은 길 — 모두 보낸다)은 점마다 크기·색·테 색과 섞기 끄기를 다시 보낸다
      expect(on.ptCalls, s).toBeLessThanOrEqual(5 * on.ptDraws + 12);
      expect(off.ptCalls - on.ptCalls, s).toBeGreaterThanOrEqual(2 * on.ptDraws);
      expect(off.dup.point, s).toBeGreaterThan(60);
      // 깊이 그림: 끔은 잇단 세계 좌표 그물마다 같은 행렬(해 그림자)·같은 외곽선 색(외곽선 색 깊이)을 다시 보낸다
      if (name === 'sunNoSec' || name === 'profiles') expect(off.dup.depth, s).toBeGreaterThan(40);
      // 인스턴싱 모서리 선 묶음 그리기 하나에 GL 넷(자리 시작·자리 수·VAO·그리기 — 굵은 선은 나눔 수 바꾸고 되돌리기 넷 더) + 차례마다 처음 고정 값.
      // 끔은 묶음마다 useProgram과 고정 균일 변수 일곱(+ 안개 둘·굵은 선 넷)
      if (on.il) expect(on.ilCalls, s).toBeLessThanOrEqual(8 * on.il + 32);
      if (on.il >= 6) expect(off.ilCalls, s).toBeGreaterThan(on.ilCalls + 5 * on.il);
    }
    // 인스턴싱 모서리 선(윤곽선·삼각형 변·숨은 점선)·깊이 그림(해 그림자·외곽선 색 깊이)을 그린 상태가 있다
    expect(ilSeen).toBeGreaterThan(40);
    expect(ptSeen).toBeGreaterThan(500);
    expect(depthSeen).toBeGreaterThan(600);
  });

  it('인스턴싱 모서리 선 차례: 같은 프로그램 묶음이 잇달면 useProgram·고정 균일 변수 없이 묶음마다 자리 시작·VAO·그리기만(가만히·안개·숨은 점선)', () => {
    const w = view(stepScene(600, 10, 0));
    const v = w.v;
    for (const [name, set] of [
      ['still', () => {}],
      ['fog', () => v.setFog({ start: 20, end: 400 })],
      ['dash', () => (v.setFog(null), v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 }))],
    ] as [string, () => void][]) {
      set();
      v.renderNow();
      const { on, off } = both(w, name);
      const s = row(name, on, off);
      // 꼴 10개 가운데 윤곽선 있는 꼴 여덟 — 묶음마다 그리기 하나(숨은 선은 삼각형 변 묶음·숨은 점선 묶음도)
      expect(on.il, s).toBeGreaterThanOrEqual(6);
      // 0.76.0은 묶음마다 useProgram·u_inst·u_instBase·u_instN·u_color·u_vcol·u_alpha·u_override·u_bias(+ 안개 둘·굵은 선 넷)를 모두 보냈다
      expect(on.ilCalls, s).toBeLessThanOrEqual(name === 'dash' ? 9 * on.il + 48 : 5 * on.il + 20);
      expect(off.ilCalls, s).toBeGreaterThanOrEqual(10 * on.il);
      expect(on.dup.line, s).toBeLessThanOrEqual(12);
    }
  });

  it('프레임 사이에 앱이 GL 상태(섞기·프로그램·VAO·깊이·색 쓰기)를 바꾸거나 문맥을 잃었다 되찾아도 다음 그리기는 기억을 끈 그리기·바꾸기 전 그리기와 같다', () => {
    const w = view(stepScene(300, 6, 40));
    const v = w.v;
    v.setFog({ start: 20, end: 400 });
    v.setRenderOptions({ profiles: true });
    v.setItemProfileColor('b2', [0, 0.5, 0, 1]);
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
    expect(w.frame().rec).toEqual(before);
    mess();
    both(w, 'after-mess');
    (v.canvas as unknown as { fire(t: string, e: object): void }).fire('webglcontextlost', {});
    (v.canvas as unknown as { fire(t: string, e: object): void }).fire('webglcontextrestored', {});
    for (let i = 0; i < 20; i++) v.renderNow();
    const { on } = both(w, 'restored');
    expect(w.frame().rec).toEqual(before);
    // 되찾은 뒤(새 프로그램)에도 기억은 그 그리기 안에서 같은 값을 다시 보내지 않는다
    expect(on.dup.line).toBeLessThanOrEqual(24);
    expect(on.dup.point).toBeLessThanOrEqual(4);
    expect(on.dup.depth).toBeLessThanOrEqual(4);
  });
});
