/**
 * 0.75.0 선 차례에서 같은 값으로 다시 보내던 GL 호출 빼기(그리는 차례·그린 도형은 그대로 — 0.70.0 절: 윤곽선 그리는 차례가 화소에 드러난다):
 *  - 선 기억(LineMemo)이 프로그램마다 그 프로그램에 보낸 고정 균일 변수 값을 들고 다른 것만 보낸다. 묶음 구간 그리기(묶음 변종 프로그램)가 낀 뒤 그물마다 윤곽선은
 *    useProgram만 다시(0.74.0은 고정 균일 변수 다섯도), 안개 색·범위는 고정 값으로(0.74.0은 그물마다)
 *  - 묶음 구간 그리기는 프로그램마다 굵기·자리 시작(u_instBase)·불투명도를 들고 다를 때만 보낸다(0.74.0은 구간마다)
 * 선 프로그램(가는 선·굵은 선 — 묶음 변종 포함)의 균일 변수 호출 가운데 그 프레임에서 앞서 같은 프로그램·같은 균일 변수에 같은 값을 보낸 것을 센다.
 * 그린 도형(tests/drawexpand.ts)은 선 기억을 끈 그리기(lineMemoOff — 그물마다 모두 보낸다)와 프레임마다 같다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { mat4Mul } from '../src/math';
import { mulF32 } from '../src/renderer';
import { type Plane4, planeToLocal, planeToLocalTo } from '../src/section';
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
 * n개: 셋째마다 같은 꼴 둘(배열을 함께 쓴다 — 인스턴싱 길, 둘째 꼴은 정점 색), 나머지는 제 배열(묶음 저장소 — 정점 색·윤곽선 없는 그물이 섞인다).
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

/** 선 프로그램(가는 선·굵은 선 정점 셰이더 — 묶음·인스턴싱 변종 포함, 점 프로그램은 뺀다) */
const isLine = (vs: string): boolean => vs.includes('in vec3 a_p0;') || vs.includes('layout(location=1) in vec4 a_col;');

type Cnt = { calls: number; progs: number; lineU: number; dup: number; draws: number; dl: number; dlCalls: number };
type W = { v: Viewer3d; gl: FakeGL; r: { lineMemoOff: boolean }; count(): Cnt };

/**
 * 뷰어(묶어 그리기 켬)와 렌더러 GL 호출 세기: 한 프레임 안에서 선 프로그램 균일 변수를 앞서 같은 값으로 보낸 뒤 다시 보낸 수(dup),
 * 렌더러 drawLines 부른 수(dl)와 그 안에서 부른 GL 호출 수(dlCalls)
 */
function view(sc: Scene3d): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: Record<string, unknown> & { lineMemoOff: boolean } }).renderer;
  let c: Cnt = { calls: 0, progs: 0, lineU: 0, dup: 0, draws: 0, dl: 0, dlCalls: 0 };
  let inDl = 0;
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
  const base = r.gl as Record<string | symbol, unknown>;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        c.calls++;
        if (inDl) c.dlCalls++;
        if (k === 'useProgram') c.progs++;
        if (typeof k === 'string' && k.startsWith('draw')) c.draws++;
        if (typeof k === 'string' && k.startsWith('uniform')) {
          const l = a[0] as { p: { id: number; shaders: { src: string }[] }; name: string } | null;
          if (l && isLine(l.p.shaders[0]?.src ?? '')) {
            c.lineU++;
            const key = `${l.p.id}:${l.name}`;
            const val = JSON.stringify(a.slice(1).map((y) => (ArrayBuffer.isView(y) ? Array.from(y as Float32Array) : y)));
            if (seen.get(key) === val) c.dup++;
            seen.set(key, val);
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
  return {
    v,
    gl,
    r,
    count: () => {
      const out: Cnt = (c = { calls: 0, progs: 0, lineU: 0, dup: 0, draws: 0, dl: 0, dlCalls: 0 });
      seen.clear();
      v.renderNow();
      // 다음 프레임들은 버리는 칸에 센다
      c = { calls: 0, progs: 0, lineU: 0, dup: 0, draws: 0, dl: 0, dlCalls: 0 };
      return out;
    },
  };
}

/** 선 기억 켬·끔 그리기의 펼친 도형이 같고, 켬의 같은 값 다시 보내기·선 균일 변수 수를 돌려준다 */
function both(w: W, label: string): { on: Cnt; off: Cnt } {
  w.r.lineMemoOff = false;
  const a = expandFrame(w.gl, () => w.v.renderNow());
  const on = w.count();
  w.r.lineMemoOff = true;
  const b = expandFrame(w.gl, () => w.v.renderNow());
  const off = w.count();
  w.r.lineMemoOff = false;
  expect(a.length, label).toBe(b.length);
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) expect(a[i], `${label} #${i}`).toBe(b[i]);
  expect(on.draws, label).toBe(off.draws);
  return { on, off };
}

describe('0.75.0 선 차례의 같은 값 균일 변수', () => {
  it('묶음 구간·인스턴싱·그물마다가 섞인 단면 하나 — 선 프로그램에 같은 값을 다시 보내지 않고(프레임 안), 그린 도형은 선 기억을 끈 그리기와 같다', () => {
    const w = view(scene(300));
    const v = w.v;
    expect(v.stats.merged.meshes, '묶음 저장소').toBe(200);
    expect(v.stats.instanced.items, '인스턴싱').toBeGreaterThan(0);
    v.setSection({ normal: [1, 0, 0], offset: 150 });
    v.renderNow();
    const cases: [string, () => void][] = [
      ['section', () => {}],
      ['fog', () => v.setFog({ start: 50, end: 600 })],
      ['hi', () => (v.setFog(null), v.highlight(['b1', 'b4', 'b7', 'b30', 'b31', 'b32', 'b33', 'b200']))],
      ['looks', () => (v.highlight(null), v.setItemOpacity('b5', 0.5), v.setItemColor('b8', [1, 0, 0, 1]), v.setItemEdgeColor('b10', [0, 1, 0, 1]))],
      ['ranges', () => v.setHiddenRanges('b11', { prims: [{ start: 0, count: 2 }], edges: [{ start: 1, count: 3 }] })],
      ['hiddenLine', () => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: true }))],
      ['wireframe', () => (v.setRenderOptions({ hiddenEdges: null }), v.setRenderMode('wireframe'))],
      ['shaded-back', () => (v.setRenderMode('shadedEdges'), v.setRenderOptions({ hiddenEdges: { opacity: 0.4, shaded: true } }))],
      ['drag', () => v.setSectionPosition(0.43)],
      ['sections', () => v.setSections([{ normal: [1, 0, 0], offset: 150 }, { normal: [0, 1, 0], offset: 100 }])],
    ];
    const rows: string[] = [];
    for (const [name, set] of cases) {
      set();
      v.renderNow();
      const { on, off } = both(w, name);
      rows.push(`${name} ${on.calls}/${off.calls} dup ${on.dup}/${off.dup}`);
      // 같은 값 다시 보내기는 프로그램·차례마다 몇 번(차례 처음 그리기 — 그물 수와 상관없다). 0.74.0은 묶음 구간이 낀 그물마다 다섯·구간마다 둘(이 장면 수백)
      expect(on.dup, `${name} ${rows.at(-1)}`).toBeLessThanOrEqual(24);
      expect(on.lineU, name).toBeLessThan(off.lineU);
    }
  });

  it('같은 꼴 부품만(STEP 꼴 — 묶음 저장소 없음)의 단면 하나: 그물마다 윤곽선 그리기 하나에 GL 넷(행렬·평면·VAO·그리기), 안개면 다섯(0.74.0은 안개 색·범위도 그물마다)', () => {
    const w = view(scene(240, false));
    const v = w.v;
    expect(v.stats.merged.meshes).toBe(0);
    expect(v.stats.instanced.items).toBeGreaterThan(0);
    v.setSection({ normal: [1, 0, 0], offset: 150 });
    v.renderNow();
    const plain = w.count();
    both(w, 'step');
    v.setFog({ start: 50, end: 600 });
    v.renderNow();
    const fog = w.count();
    both(w, 'step-fog');
    // 보이는 그물마다 윤곽선 그리기 하나(drawLines — 단면 테두리 하나 더): 처음 그리기(프로그램·고정 균일 변수) 몫 말고는 그리기 하나에 넷·다섯
    expect(plain.dl).toBeGreaterThan(200);
    expect(plain.dlCalls).toBeLessThanOrEqual(4 * plain.dl + 24);
    expect(fog.dl).toBe(plain.dl);
    expect(fog.dlCalls).toBeLessThanOrEqual(5 * fog.dl + 32);
    expect(fog.dup).toBeLessThanOrEqual(12);
  });
});

describe('0.75.0 그물마다 윤곽선의 그리기 선택·로컬 평면·시점 투영 행렬', () => {
  it('planeToLocalTo·mulF32는 planeToLocal·mat4Mul(float32로 옮긴 값)과 비트까지 같다(−0·큰 좌표·행렬 없음 포함)', () => {
    const mats: (Float64Array | undefined)[] = [undefined];
    for (let k = 0; k < 40; k++) {
      const m = placeAt(((k * 37) % 23) * 1e4 - 1.2e5, ((k * 11) % 7) * 3e3 + 8e4, -2500 + k, k * 13, k % 3 === 0);
      if (k % 5 === 0) for (let i = 0; i < 12; i++) m[i] = -m[i]!;
      mats.push(m);
    }
    const planes: Plane4[] = [[1, 0, 0, -150], [0, -1, 0, 0], [-0, 0, 1, -0], [0.6, 0.8, 0, 12345.678], [-0.36, 0.48, 0.8, -1e5]];
    const out: Plane4 = [9, 9, 9, 9];
    const f32 = new Float32Array(16);
    const vp = mat4Mul(new Float64Array([1.3, 0, 0, 0, 0, 1.7, 0, 0, 0, 0, -1.0002, -1, 0, 0, -0.2, 0]), new Float64Array([0.8, -0.3, 0.5, 0, 0.6, 0.4, -0.7, 0, -0, 0.86, 0.51, 0, 3e4, -2e3, -9e4, 1]));
    let n = 0;
    for (const m of mats) {
      for (const p of planes) {
        const want = planeToLocal(p, m);
        expect(planeToLocalTo(p, m, out)).toBe(out);
        for (let i = 0; i < 4; i++) expect(Object.is(out[i], want[i]), `평면 ${n} ${i}`).toBe(true);
        n++;
      }
      if (!m) continue;
      const want = Float32Array.from(mat4Mul(vp, m));
      expect(mulF32(vp, m, f32)).toBe(f32);
      for (let i = 0; i < 16; i++) expect(Object.is(f32[i], want[i]), `행렬 ${i}`).toBe(true);
    }
    // −0 칸: mat4Mul은 0 + …로 −0을 +0으로(float32로 옮겨도 +0) — mulF32도 같다
    const z = mulF32(new Float64Array(16), new Float64Array(16).fill(-1), new Float32Array(16));
    for (let i = 0; i < 16; i++) expect(Object.is(z[i], 0)).toBe(true);
  });

  it('단면 하나의 바로 그리는 그물마다 윤곽선·숨은 점선은 그리기 선택·로컬 평면 배열을 그물마다 새로 만들지 않는다(0.74.0은 그물마다 새로) — 그린 도형은 같다', () => {
    const w = view(scene(240, false));
    const v = w.v;
    v.setRenderMode('hiddenLine');
    v.setRenderOptions({ hiddenEdges: true });
    v.setSection({ normal: [1, 0, 0], offset: 150 });
    v.renderNow();
    const r = (v as unknown as { renderer: Record<string, unknown> }).renderer;
    const opts = new Set<object>(), clips = new Set<unknown>();
    let calls = 0;
    const dl = (r.drawLines as (...a: unknown[]) => unknown).bind(r);
    r.drawLines = (...a: unknown[]) => {
      const o = a[3] as { clip?: unknown };
      calls++;
      opts.add(o);
      if (o.clip) clips.add(o.clip);
      return dl(...a);
    };
    v.renderNow();
    r.drawLines = dl;
    // 보이는 그물마다 윤곽선·숨은 점선 + 단면 테두리 — 선택은 차례마다 하나(+ 테두리), 평면 배열은 차례마다 하나
    expect(calls).toBeGreaterThan(400);
    expect(opts.size).toBeLessThanOrEqual(4);
    expect(clips.size).toBeLessThanOrEqual(2);
    both(w, 'hiddenLine-section');
  });
});
