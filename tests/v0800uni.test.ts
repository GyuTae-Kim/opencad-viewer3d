/**
 * 0.80.0 균일 변수 위치 기억(그리기·차례·프레임을 넘어): 렌더러·묶어 그리기 조각의 모든 균일 변수 보내기가 위치마다 GL에 마지막으로 보낸 값과 견주어 비트까지 같으면 부르지 않는다.
 * 0.76.0 그물 기억·0.75.0 선 기억은 그리기 한 번·차례 하나 안에서만 견주어, 프레임마다 처음 쓰는 프로그램의 고정 균일 변수(u_ortho·선 색·굵기·보기 창·점선·치우침 등)와
 * 차례마다(윤곽선·선분 묶음·숨은 점선·격자·단면 테두리) 같은 선 프로그램에 같은 값을 다시 보냈다 — 실제 STEP·SKP 표본 프레임 GL 호출에서 그 몫을 쟀다(README 0.80.0 절).
 * GL은 균일 변수 값을 프로그램마다 들고 있어(다른 프로그램을 쓴 뒤·다음 프레임에도 남는다) 보내지 않아도 그리기 때 값이 같다 — 그린 도형(tests/drawexpand.ts)·그리기 수는
 * 기억을 끈 길(uniLastOff — 0.79.0처럼 늘 보낸다)과 프레임마다 같다
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, PointSet3d, Rgba, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';
import { placeAt } from '../scripts/pixels/many';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
const g = globalThis as { devicePixelRatio: number };
beforeAll(async () => {
  dom = installDom();
  expect(await Viewer3d.preloadMerging()).toBe(true);
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  g.devicePixelRatio = 1;
  dom.restore();
});

const MATS: Rgba[] = Array.from({ length: 5 }, (_, k) => [0.3 + (k % 3) * 0.2, 0.4 + (k % 2) * 0.3, 0.55, 1]);
const EDGE: Rgba = [0.1, 0.1, 0.12, 1];

/**
 * 길이 섞인 장면: 셋째마다 같은 꼴 둘(배열을 함께 쓴다 — 인스턴싱·단면이면 그물마다), 나머지 제 배열(merging이면 묶음 저장소), 아홉째마다 돌린 행렬,
 * 넷째마다 뒷면 색, 다섯째마다 정점 색, 열한째 반투명, 일곱째 윤곽선 없음. 선분 묶음(모형 모서리 — 가는 선·점선·굵기 2가 차례로 섞인다)·점 묶음 둘
 */
function scene(n: number): Scene3d {
  const A = boxMesh('A', [0, 0, 0], [5, 5, 3], MATS[2]!);
  const B = boxMesh('B', [0, 0, 0], [4, 7, 2], MATS[2]!);
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const mine = i % 3 !== 0;
    const m: Mesh3d = mine
      ? boxMesh(`b${i}`, [0, 0, 0], [6, 6, 4 + (i % 3)], MATS[i % 5]!, `g${i % 4}`)
      : { ...(i % 2 ? A : B), id: `b${i}`, name: `b${i}`, group: `g${i % 4}`, color: MATS[i % 2]! };
    if (i % 9 === 0) m.matrix = placeAt((i % 30) * 10, Math.floor(i / 30) * 10, 0, i * 7, i % 18 === 0);
    else m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (mine && i % 4 === 1) m.backColor = [0.55, 0.6, 0.75, 1];
    if (mine && i % 5 === 2) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7 + i) % 10) / 10));
    if (mine && i % 11 === 4) m.color = [0.8, 0.3, 0.2, 0.5];
    if (mine && i % 7 === 3) delete m.edges;
    return m;
  });
  const lines: LineSet3d[] = [];
  for (let i = 0; i < 40; i++) {
    const e = boxMesh(`l${i}`, [i * 9, -30, 0], [i * 9 + 5, -24, 3 + (i % 4)], EDGE).edges!;
    lines.push({ id: `e${i}`, positions: e, color: EDGE, group: `g${i % 4}`, hiddenEdges: true, ...(i % 3 === 1 ? { dashed: true } : i % 3 === 2 ? { width: 2 } : {}) });
  }
  const points: PointSet3d[] = [
    { id: 'p0', positions: new Float32Array([0, -40, 0, 50, -40, 2, 100, -40, 4]), color: [0.9, 0.2, 0.2, 1] },
    { id: 'p1', positions: new Float32Array([0, -45, 0, 60, -45, 1]), color: [0.2, 0.2, 0.9, 1], size: 6 },
  ];
  return { name: 'u', units: 'mm', meshes, lines, points };
}

type R = Record<string, unknown> & { uniLastOff: boolean; faceMemoOff: boolean; lineMemoOff: boolean };
/** 프레임 하나의 GL 셈: 모든 호출, 균일 변수 호출, 그리기, 그 위치에 앞서 보낸 값과 같은 값을 다시 보낸 수(프레임을 넘어), 지금 묶인 프로그램이 아닌 위치에 보낸 수 */
type Cnt = { calls: number; uni: number; draws: number; dup: number; foreign: number };
const zero = (): Cnt => ({ calls: 0, uni: 0, draws: 0, dup: 0, foreign: 0 });
type W = { v: Viewer3d; gl: FakeGL; r: R; frame(): { draws: string[]; c: Cnt } };

/** 뷰어와 GL 호출 세기(균일 변수 부른 수, 그 위치에 앞서 보낸 값과 같은 값을 다시 보낸 수 — 프레임을 넘어) */
function view(sc: Scene3d, off: boolean, merging: boolean): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: R }).renderer;
  r.uniLastOff = off;
  let c = zero();
  const last = new Map<string, unknown[]>();
  /** 비트까지 같은 값(Object.is — −0과 +0은 다르게, 기억의 sameNum과 같은 견줌. NaN은 보내지 않는다) */
  const same = (x: unknown[] | undefined, y: unknown[]): boolean => !!x && x.length === y.length && x.every((q, i) => Object.is(q, y[i]));
  const base = r.gl as Record<string | symbol, unknown>;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        c.calls++;
        if (typeof k === 'string') {
          if (k.startsWith('draw')) c.draws++;
          if (k.startsWith('uniform')) {
            c.uni++;
            const l = a[0] as { p: { id: number }; name: string } | null;
            if (l) {
              // 기억은 보낸 값을 적는다 — 묶이지 않은 프로그램의 위치에 보내면(실제 WebGL은 INVALID_OPERATION으로 버린다) 기억이 GL과 갈린다
              if (l.p !== (t as { prog: unknown }).prog) c.foreign++;
              const key = `${l.p.id}:${l.name}`;
              const val = a.slice(k.startsWith('uniformMatrix') ? 2 : 1).flatMap((y) => (ArrayBuffer.isView(y) ? Array.from(y as Float32Array) : [y]));
              if (same(last.get(key), val)) c.dup++;
              last.set(key, val);
            }
          }
        }
        return (x as (...y: unknown[]) => unknown).apply(t, a);
      };
    },
  });
  v.setRenderOptions({ merging });
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
    frame: () => {
      c = zero();
      const draws = expandFrame(gl, () => v.renderNow());
      return { draws, c };
    },
  };
}

/** 두 뷰어(0.80.0 길·기억 끔)에 같은 상태를 걸고 프레임마다 펼친 도형·그리기 수가 같은지 보고 두 셈을 돌려준다 */
function step(a: W, b: W, label: string, set: (v: Viewer3d) => void): { on: Cnt; off: Cnt } {
  set(a.v);
  set(b.v);
  const x = a.frame(), y = b.frame();
  expect(x.draws.length, label).toBe(y.draws.length);
  for (let i = 0; i < x.draws.length; i++) if (x.draws[i] !== y.draws[i]) expect(x.draws[i], `${label} #${i}`).toBe(y.draws[i]);
  expect(x.c.draws, label).toBe(y.c.draws);
  expect(x.c.foreign, label).toBe(0);
  expect(y.c.foreign, label).toBe(0);
  return { on: x.c, off: y.c };
}

const SO = { caps: 'closed', outline: true, plane: true } as const;

/** 상태 차례(이름, 거는 함수, 가만히 — 앞 프레임과 같은 그리기면 true) */
const CASES: [string, (v: Viewer3d) => void, boolean][] = [
  ['still', () => {}, true],
  ['still2', () => {}, true],
  ['orbit', (v) => v.orbitBy(0.3, 0.1), false],
  ['orbitStill', () => {}, true],
  ['hi', (v) => v.highlight(['b1', 'b4', 'b30', 'e3', 'p0']), false],
  ['hiStill', () => {}, true],
  ['section', (v) => (v.highlight(null), v.setSectionAxis('x', 0.5, SO)), false],
  ['secStill', () => {}, true],
  ['drag', (v) => v.setSectionPosition(0.42), false],
  ['dragStill', () => {}, true],
  ['secOrbit', (v) => v.orbitBy(0.2, 0.05), false],
  ['hidden', (v) => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4, profiles: { width: 1 } })), false],
  ['hiddenStill', () => {}, true],
  ['looks', (v) => (v.setRenderMode('shadedEdges'), v.setRenderOptions({ hiddenEdges: null, profiles: null }), v.setItemColor('b8', [1, 0, 0, 1]), v.setItemOpacity('b5', 0.5)), false],
  ['looksStill', () => {}, true],
  ['sun', (v) => v.setLighting({ sun: { direction: [0.3, -0.5, 0.8] }, shadows: true }), false],
  ['sunStill', () => {}, true],
  ['fog', (v) => (v.setLighting(null), v.setFog({ start: 50, end: 600 })), false],
  ['fogStill', () => {}, true],
  ['profiles', (v) => (v.setFog(null), v.setRenderOptions({ profiles: true })), false],
  ['xray', (v) => (v.setRenderOptions({ profiles: null }), v.setRenderMode('xray')), false],
  ['wire', (v) => v.setRenderMode('wireframe'), false],
  ['sections', (v) => (v.setRenderMode('shadedEdges'), v.setSections([{ normal: [1, 0, 0], offset: 150, caps: 'closed' }, { normal: [0, 1, 0], offset: 100, caps: 'closed' }])), false],
  ['sectionsStill', () => {}, true],
  ['off', (v) => v.setSection(null), false],
  ['offStill', () => {}, true],
];

describe('0.80.0 균일 변수 위치 기억(그리기·차례·프레임을 넘어)', () => {
  it('렌더러·묶어 그리기 조각의 균일 변수 보내기는 모두 위치 기억을 거친다(gl.uniform*를 바로 부르는 곳이 없다)', () => {
    const rs = readFileSync(new URL('../src/renderer.ts', import.meta.url), 'utf8');
    const mg = readFileSync(new URL('../src/mergegl.ts', import.meta.url), 'utf8');
    // 위치 기억 메서드(uniF·uniI·uniM·uniV) 안의 여덟 곳만(1f·2f·3f·4f·1i·행렬 셋·넷·4fv)
    expect(rs.match(/\.uniform\w+\(/g)?.length).toBe(8);
    const body = rs.slice(rs.indexOf('\n  uniF('), rs.indexOf('\n  uniV(') + 400);
    expect(body.match(/\.uniform\w+\(/g)?.length).toBe(8);
    expect(mg.match(/\.uniform\w+\(/g) ?? []).toEqual([]);
  });

  for (const [dpr, merging] of [
    [1, true],
    [2, false],
  ] as const)
    it(`길이 섞인 장면(인스턴싱·${merging ? '묶음 저장소' : '그물마다'}·선분 묶음 가는 선·점선·굵은 선·점·격자, 화소 비율 ${dpr}) — 상태마다 그린 도형·그리기는 기억을 끈 길과 같고, GL 호출은 같은 값 다시 보냄만 빠진다`, () => {
      g.devicePixelRatio = dpr;
      try {
        const sc = scene(300);
        const a = view(sc, false, merging), b = view(sc, true, merging);
        if (merging) expect(a.v.stats.merged.meshes).toBeGreaterThan(0);
        expect(a.v.stats.instanced.items).toBeGreaterThan(0);
        let on = 0, off = 0;
        const rows: string[] = [];
        for (const [name, set, still] of CASES) {
          const x = step(a, b, name, set);
          const row = `${name} calls ${x.on.calls}/${x.off.calls} uni ${x.on.uni}/${x.off.uni} dup ${x.on.dup}/${x.off.dup}`;
          rows.push(row);
          on += x.on.calls;
          off += x.off.calls;
          // 프레임을 넘어 같은 값을 다시 보내지 않는다(0.79.0 길은 프레임마다 처음 쓰는 프로그램·차례마다 선 프로그램에 다시 보낸다)
          expect(x.on.dup, row).toBe(0);
          // 0.80.0 길의 GL 호출은 기억을 끈 길에서 같은 값 다시 보냄만 빠진 것이다(보내는 값·차례는 같다 — 그물마다 바뀌는 행렬·색은 그대로 보낸다)
          expect(x.on.uni, row).toBe(x.off.uni - x.off.dup);
          expect(x.on.calls, row).toBe(x.off.calls - x.off.dup);
          // 앞 프레임과 같은 그리기: 프레임마다 처음 쓰는 프로그램의 고정 값·차례마다 선 프로그램 값이 그 프로그램에 남아 있다
          if (still) expect(x.off.dup, row).toBeGreaterThan(20);
        }
        expect(on, rows.join('\n')).toBeLessThan(off);
      } finally {
        g.devicePixelRatio = 1;
      }
    });

  it('문맥을 잃었다 되찾으면(새 프로그램 — 새 위치) 다시 보내 그린 도형이 기억을 끈 길과 같고, 앱이 프레임 사이에 GL 상태를 바꿔도 같다', () => {
    const sc = scene(120);
    const a = view(sc, false, false), b = view(sc, true, false);
    a.v.setSectionAxis('x', 0.5, SO);
    b.v.setSectionAxis('x', 0.5, SO);
    step(a, b, 'sec', () => {});
    step(a, b, 'secStill', () => {});
    for (const w of [a, b]) {
      const cv = w.v.canvas as unknown as { fire(t: string, e: object): void };
      cv.fire('webglcontextlost', {});
      cv.fire('webglcontextrestored', {});
      for (let i = 0; i < 20; i++) w.v.renderNow();
    }
    const x = step(a, b, 'restored', () => {});
    expect(x.on.dup).toBe(0);
    expect(x.on.uni).toBe(x.off.uni - x.off.dup);
    const mess = (w: W): void => {
      const q = w.gl as unknown as Record<string, (...y: unknown[]) => unknown> & Record<string, number>;
      q.useProgram!(null);
      q.bindVertexArray!(null);
      q.enable!(q.BLEND);
      q.depthMask!(false);
    };
    mess(a);
    mess(b);
    const m = step(a, b, 'mess', () => {});
    const y = step(a, b, 'messStill', () => {});
    for (const q of [m, y]) {
      expect(q.on.dup).toBe(0);
      expect(q.on.uni).toBe(q.off.uni - q.off.dup);
      expect(q.off.dup).toBeGreaterThan(20);
    }
  });

  it('0.76.0·0.75.0 시험용 기억 끔(faceMemoOff·lineMemoOff)이면 위치 기억도 건너뛴다(그 길은 0.75.0처럼 모두 보낸다 — 값은 적는다)', () => {
    const sc = scene(60);
    const a = view(sc, false, false);
    a.frame();
    const x = a.frame();
    a.r.faceMemoOff = true;
    a.r.lineMemoOff = true;
    const y = a.frame();
    a.r.faceMemoOff = false;
    a.r.lineMemoOff = false;
    const z = a.frame();
    expect(y.draws).toEqual(x.draws);
    expect(z.draws).toEqual(x.draws);
    expect(x.c.dup).toBe(0);
    // 기억 끔: 그 프로그램에 남은 값과 같은 값도 다시 보낸다(위치 기억을 건너뛴다)
    expect(y.c.dup).toBeGreaterThan(100);
    expect(y.c.uni).toBeGreaterThan(2 * x.c.uni);
    // 끈 동안에도 값을 적어 다시 켜면 앞과 같다
    expect(z.c.uni).toBe(x.c.uni);
    expect(z.c.dup).toBe(0);
    expect(x.c.foreign + y.c.foreign + z.c.foreign).toBe(0);
  });
});
