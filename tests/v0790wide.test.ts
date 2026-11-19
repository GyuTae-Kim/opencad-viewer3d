/**
 * 0.79.0 굵은 선 VAO의 인스턴스 속성 자리: 묶음 저장소의 굵은 선(구간 그리기·그물마다 그리기)은 그리기마다 그 선분 자리로 속성을 다시 건다(WebGL2에는 첫 인스턴스 인자가 없다).
 * 0.78.0까지는 묶음 구간마다 켜기·위치·나누개를 모두(GL 11) 걸고, 그물마다 그리기는 그린 뒤 0으로 되돌렸다. 이제 렌더러가 VAO마다 지금 가리키는 자리(끝점 위치·묶음 그물 번호)를
 * 적어 다를 때만 그 속성의 vertexAttribPointer만 다시 건다. 그리기 때 VAO 상태가 같아 그린 도형(tests/drawexpand.ts)이 0.78.0 길(wideOffOff)과 프레임마다 같다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { FakeGL } from './fakegl';
import { expandFrame } from './drawexpand';
import { type MergeHost, wideAt } from '../src/mergegl';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Rgba, Scene3d } from '../src/types';
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

const PAL: Rgba[] = [
  [0.7, 0.4, 0.3, 1],
  [0.3, 0.6, 0.8, 1],
  [0.5, 0.5, 0.5, 1],
];

/**
 * n개(0.78.0 시험 꼴): 셋째마다 같은 꼴 둘(배열을 함께 쓴다 — 단면이면 그물마다, 아니면 인스턴싱), 나머지는 제 배열(묶음 저장소 — 단면 하나에서는 그 사이에 낀 짧은 구간).
 * 아홉째마다 돌린 행렬, 열셋째마다 윤곽선 없는 그물. vary면 제 배열 상자 크기가 그물마다 다르다(다른 그물 자리의 선분을 읽으면 다른 도형이 되게)
 */
function scene(n: number, vary = false): Scene3d {
  const A = boxMesh('A', [0, 0, 0], [5, 5, 3], PAL[2]!);
  const B = boxMesh('B', [0, 0, 0], [4, 7, 2], PAL[2]!);
  B.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 7) % 10) / 10));
  const meshes = Array.from({ length: n }, (_, i): Mesh3d => {
    const mine = i % 3 !== 0;
    const shared = i % 2 ? A : B;
    const m: Mesh3d = mine
      ? boxMesh(`b${i}`, [0, 0, 0], vary ? [6 + (i % 11) * 0.25, 6 + (i % 7) * 0.5, 4 + (i % 13) * 0.125] : [6, 6, 4 + (i % 3)], [0.4 + (i % 5) * 0.1, 0.5, 0.6, 1], `g${i % 4}`)
      : { ...shared, id: `b${i}`, name: `b${i}`, group: `g${i % 4}`, color: PAL[i % 2]! };
    if (i % 9 === 0) m.matrix = placeAt((i % 30) * 10, Math.floor(i / 30) * 10, 0, i * 7, i % 18 === 0);
    else m.origin = [(i % 30) * 10, Math.floor(i / 30) * 10, 0];
    if (mine && i % 3 === 1) m.colors = Float32Array.from({ length: 32 }, (_, j) => (j % 4 === 3 ? 1 : ((j * 13 + i) % 10) / 10));
    if (mine && i % 13 === 2) delete m.edges;
    return m;
  });
  return { name: 's', units: 'mm', meshes, lines: [] };
}

type Cnt = { calls: number; draws: number; en: number; div: number; ptr: number; mWide: number; mWideCalls: number };
const zero = (): Cnt => ({ calls: 0, draws: 0, en: 0, div: 0, ptr: 0, mWide: 0, mWideCalls: 0 });
type R = Record<string, unknown> & { wideOffOff: boolean; mgGroups: Set<{ wide?: unknown }>; meshes: { src: { id: string }; mg?: unknown; mi?: number; edges?: unknown }[] };
type W = { v: Viewer3d; gl: FakeGL; r: R; frame(): { draws: string[]; c: Cnt } };

/** 뷰어(묶어 그리기 켬)와 GL 호출 세기(켜기·나누개·속성 자리 수, 묶음 굵은 선 VAO 그리기와 그 앞 GL 몫) */
function view(sc: Scene3d, off: boolean, merging = true): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  const r = (v as unknown as { renderer: R }).renderer;
  r.wideOffOff = off;
  let c = zero();
  let vao: unknown = null;
  let since = 0;
  const base = r.gl as Record<string | symbol, unknown>;
  r.gl = new Proxy(base, {
    get(t, k) {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]) => {
        c.calls++;
        since++;
        if (k === 'bindVertexArray') vao = a[0];
        else if (k === 'enableVertexAttribArray') c.en++;
        else if (k === 'vertexAttribDivisor') c.div++;
        else if (k === 'vertexAttribPointer') c.ptr++;
        if (typeof k === 'string' && k.startsWith('draw')) {
          c.draws++;
          let mw = false;
          for (const q of r.mgGroups) if (q.wide && q.wide === vao) mw = true;
          if (mw) {
            c.mWide++;
            c.mWideCalls += since;
          }
          since = 0;
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
      since = 0;
      const draws = expandFrame(gl, () => v.renderNow());
      return { draws, c };
    },
  };
}

/** 두 뷰어(0.79.0 길·0.78.0 길)에 같은 상태를 걸고 프레임마다 펼친 도형·그리기 수가 같은지 보고 두 셈을 돌려준다 */
function step(a: W, b: W, label: string, set: (v: Viewer3d) => void): { on: Cnt; off: Cnt } {
  set(a.v);
  set(b.v);
  const x = a.frame(), y = b.frame();
  expect(x.draws.length, label).toBe(y.draws.length);
  for (let i = 0; i < x.draws.length; i++) if (x.draws[i] !== y.draws[i]) expect(x.draws[i], `${label} #${i}`).toBe(y.draws[i]);
  expect(x.c.draws, label).toBe(y.c.draws);
  expect(x.c.mWide, label).toBe(y.c.mWide);
  return { on: x.c, off: y.c };
}

describe('0.79.0 굵은 선 VAO 인스턴스 속성 자리', () => {
  it('묶음 구간·인스턴싱·그물마다가 섞인 장면(화소 비율 2·숨은 점선·강조·구간·끌기·안개·X-ray·여러 단면·단면 없음) — 그린 도형·그리기는 0.78.0 길과 같고, 묶음 굵은 선 구간은 켜기·나누개 없이 위치만', () => {
    g.devicePixelRatio = 2;
    try {
      const sc = scene(300);
      const a = view(sc, false), b = view(sc, true);
      expect(a.v.stats.merged.meshes, '묶음 저장소').toBe(200);
      // 묶음의 첫 그물(구간 그리기의 자리 0 — 아래 구간 숨김 상태가 고르지 않게, 0.78.0 길은 그 그물을 그물마다 그릴 때 앞 구간이 옮긴 자리를 쓴다 — 다음 시험)
      const first = new Set(a.r.meshes.filter((m) => m.mg && m.mi === 0).map((m) => m.src.id));
      const pick = (ids: string[]): string[] => ids.filter((id) => !first.has(id));
      const cases: [string, (v: Viewer3d) => void, 'wide' | 'multi' | 'less'][] = [
        ['plain', () => {}, 'less'],
        ['section', (v) => v.setSection({ normal: [1, 0, 0], offset: 150 }), 'wide'],
        ['section-2', () => {}, 'wide'],
        ['hiddenLine', (v) => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 })), 'wide'],
        ['hi', (v) => (v.setRenderMode('shadedEdges'), v.setRenderOptions({ hiddenEdges: null }), v.highlight(pick(['b1', 'b3', 'b4', 'b6', 'b7', 'b30', 'b31', 'b32', 'b200']))), 'wide'],
        ['ranges', (v) => (v.highlight(null), v.setHiddenRanges(pick(['b11'])[0]!, { prims: [{ start: 0, count: 2 }], edges: [{ start: 1, count: 3 }] }), v.setHiddenRanges(pick(['b12'])[0]!, { edges: [{ start: 2, count: 2 }] }), v.setHiddenRanges('b9', { edges: [{ start: 3, count: 2 }] })), 'wide'],
        ['drag', (v) => v.setSectionPosition(0.43), 'wide'],
        ['fog', (v) => v.setFog({ start: 50, end: 600 }), 'wide'],
        ['xray', (v) => (v.setFog(null), v.setRenderMode('xray')), 'wide'],
        // 와이어프레임(윤곽선 없는 그물은 삼각형 변 — 가는 선) · 겉모습(색·불투명도)
        ['wireframe', (v) => v.setRenderMode('wireframe'), 'less'],
        ['looks', (v) => (v.setRenderMode('shadedEdges'), v.setItemColor(pick(['b13'])[0]!, [1, 0, 0, 1]), v.setItemOpacity(pick(['b14'])[0]!, 0.5)), 'less'],
        // 여러 단면: 묶음 그물도 그물마다(묶음 자리로) — 0.78.0 길은 그리기마다 자리를 걸고(켜기·위치·나누개 일곱) 되돌렸다(일곱), 0.79.0은 위치 셋
        ['sections', (v) => (v.setRenderMode('shadedEdges'), v.setSections([{ normal: [1, 0, 0], offset: 150 }, { normal: [0, 1, 0], offset: 100 }])), 'multi'],
        // 단면을 끈 뒤: 그물마다 그리기(구간 숨김 — 같은 꼴 b9)가 옮긴 자리를 인스턴싱 그리기가 0으로 되돌려 쓴다
        ['none', (v) => v.setSection(null), 'less'],
        ['none-hiddenLine', (v) => (v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 })), 'less'],
        ['section-again', (v) => (v.setRenderMode('shadedEdges'), v.setRenderOptions({ hiddenEdges: null }), v.setSection({ normal: [1, 0, 0], offset: 150 })), 'wide'],
      ];
      for (const [name, set, kind] of cases) {
        const { on, off } = step(a, b, name, set);
        const s = `${name} calls ${on.calls}/${off.calls} 묶음 굵은 선 ${on.mWide} (앞 GL ${on.mWideCalls}/${off.mWideCalls}) 켜기 ${on.en}/${off.en} 나누개 ${on.div}/${off.div} 자리 ${on.ptr}/${off.ptr}`;
        expect(on.calls, s).toBeLessThanOrEqual(off.calls);
        if (kind === 'wide') {
          // 단면 하나 + 화소 비율 2: 묶음 그물이 그물마다 그리기 사이에 짧은 구간으로 끼고 모두 굵은 선이다
          expect(on.mWide, s).toBeGreaterThan(50);
          // 0.78.0 길은 구간마다 켜기 셋·나누개 셋을 더 부른다(같은 자리여도 위치 셋도). 0.79.0은 묶음 굵은 선 구간 앞에 켜기·나누개가 없다
          expect(off.mWideCalls - on.mWideCalls, s).toBeGreaterThanOrEqual(6 * on.mWide);
          expect(on.mWideCalls, s).toBeLessThanOrEqual(9 * on.mWide);
        }
        if (kind === 'multi') {
          expect(on.mWide, s).toBeGreaterThan(50);
          expect(off.calls - on.calls, s).toBeGreaterThanOrEqual(10 * on.mWide);
          expect(on.en + on.div, s).toBeLessThan(off.en + off.div);
        }
      }
    } finally {
      g.devicePixelRatio = 1;
    }
  });

  it('숨은 점선(화소 비율 1) 단면 하나: 묶음 그물의 점선 구간 하나(프로그램·VAO·자리·그리기)에 GL이 0.78.0의 14 남짓에서 9 이하로(자리는 위치 셋·그물 번호 둘 — 같은 자리면 그도 없다)', () => {
    const sc = scene(240);
    const a = view(sc, false), b = view(sc, true);
    const { on, off } = step(a, b, 'sechl', (v) => (v.setSection({ normal: [1, 0, 0], offset: 150 }), v.setRenderMode('hiddenLine'), v.setRenderOptions({ hiddenEdges: 0.4 })));
    const again = step(a, b, 'sechl-2', () => {});
    for (const [x, y] of [
      [on, off],
      [again.on, again.off],
    ] as const) {
      const s = `calls ${x.calls}/${y.calls} 묶음 굵은 선 ${x.mWide} 앞 GL ${x.mWideCalls}/${y.mWideCalls}`;
      expect(x.mWide, s).toBeGreaterThan(50);
      expect(y.mWideCalls, s).toBeGreaterThanOrEqual(13 * y.mWide);
      expect(x.mWideCalls, s).toBeLessThanOrEqual(9 * x.mWide);
      expect(y.calls - x.calls, s).toBeGreaterThanOrEqual(6 * x.mWide);
    }
  });

  it('묶음의 첫 그물을 그물마다(구간 숨김) 굵은 선으로 그려도 묶어 그리지 않은 그림과 같다(0.78.0은 그 그물의 첫 구간을 앞 묶음 구간이 옮겨 둔 자리에서 읽어 다른 그물의 선분을 그렸다)', () => {
    g.devicePixelRatio = 2;
    try {
      const sc = scene(150, true);
      const a = view(sc, false), u = view(sc, false, false);
      expect(a.v.stats.merged.meshes).toBe(100);
      expect(u.v.stats.merged.meshes).toBe(0);
      // 묶음마다 첫 그물(윤곽선이 있는 것) 하나에 앞 선분이 보이는 구간 숨김 — 그물마다 그리기의 첫 구간이 묶음 선분 자리 0부터
      const first = a.r.meshes.filter((m) => m.mg && m.mi === 0 && m.edges).map((m) => m.src.id);
      expect(first.length).toBeGreaterThan(0);
      for (const v of [a.v, u.v]) {
        v.setSection({ normal: [1, 0, 0], offset: 150 });
        for (const id of first) v.setHiddenRanges(id, { edges: [{ start: 2, count: 3 }] });
      }
      for (let k = 0; k < 3; k++) {
        const x = a.frame().draws, y = u.frame().draws;
        // 묶음 구간·묶음 그물 자리·그리기 차례가 달라 기록 수는 다를 수 있다 — 그 그물들의 펼친 선분은 같아야 한다: 두 그림의 선분 기록 모음이 같다
        const segs = (d: string[]): string[] => d.filter((s) => s.startsWith('wide|')).sort();
        expect(segs(x).length).toBeGreaterThan(500);
        expect(segs(x)).toEqual(segs(y));
      }
    } finally {
      g.devicePixelRatio = 1;
    }
  });

  it('묶음 구간 자리 걸기(wideAt): 같은 자리면 GL 없음, 다른 자리면 위치 셋·그물 번호 둘, VAO가 없으면(문맥을 잃은 뒤 구운 묶음) 기록 없이 켜기·자리·나누개 모두(던지지 않는다)', () => {
    const calls: string[] = [];
    const gl = new Proxy({ ARRAY_BUFFER: 0x8892, FLOAT: 0x1406, UNSIGNED_SHORT: 0x1403 } as Record<string, unknown>, {
      get(t, k) {
        if (typeof k === 'string' && k in t) return t[k];
        return () => void calls.push(String(k));
      },
    });
    const h = { gl, wideOff: new WeakMap<object, { pos: number; item: number }>(), wideOffOff: false } as unknown as MergeHost;
    const seg = {} as WebGLBuffer, item = {} as WebGLBuffer, vao = {} as WebGLVertexArrayObject;
    const n = (f: () => void): string[] => {
      calls.length = 0;
      f();
      return [...calls];
    };
    // 처음 보는 VAO는 만들 때 건 자리 0 — 0이면 부르지 않는다
    expect(n(() => wideAt(h, vao, seg, item, 0))).toEqual([]);
    expect(n(() => wideAt(h, vao, seg, item, 7))).toEqual(['bindBuffer', 'vertexAttribPointer', 'vertexAttribPointer', 'bindBuffer', 'vertexAttribPointer']);
    expect(n(() => wideAt(h, vao, seg, item, 7))).toEqual([]);
    // 그물마다 그리기가 위치만 옮겨 둔 자리(렌더러 wideTo — pos만): 그물 번호는 그대로라 위치만 다시
    h.wideOff.get(vao)!.pos = 3;
    expect(n(() => wideAt(h, vao, seg, item, 7))).toEqual(['bindBuffer', 'vertexAttribPointer', 'vertexAttribPointer']);
    // VAO 없음: 0.78.0처럼 모두(적지 않는다 — 약한 표 열쇠가 될 수 없다)
    const all = n(() => wideAt(h, null, seg, item, 7));
    expect(all.filter((x) => x === 'enableVertexAttribArray').length).toBe(3);
    expect(all.filter((x) => x === 'vertexAttribDivisor').length).toBe(3);
    expect(all.filter((x) => x === 'vertexAttribPointer').length).toBe(3);
  });

  it('나눠 올리는 동안과 그물을 빼고 바꾼 뒤 다시 구울 때도 단면 하나·화소 비율 2 그림이 0.78.0 길과 프레임마다 같다', () => {
    g.devicePixelRatio = 2;
    // 두 뷰어가 프레임마다 같은 시계 차례를 보게(걸음·굽기 몫이 시계에 기댄다): 프레임 앞마다 0부터, 부를 때마다 0.01 ms
    let t = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (t += 0.01));
    try {
      const sc = scene(600, true);
      const mk = (off: boolean): W => {
        const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shadedEdges', viewCube: false });
        views.push(v);
        const gl = (v.canvas as unknown as FakeElement).gl!;
        const r = (v as unknown as { renderer: R }).renderer;
        r.wideOffOff = off;
        v.setRenderOptions({ merging: true });
        v.setSection({ normal: [1, 0, 0], offset: 150 });
        v.setScene(sc, { incremental: { budgetMs: 4 } } as never);
        v.fit(false);
        return { v, gl, r, frame: () => ({ draws: expandFrame(gl, () => v.renderNow()), c: zero() }) };
      };
      const a = mk(false), b = mk(true);
      const same = (label: string): void => {
        t = 0;
        const x = a.frame().draws;
        t = 0;
        const y = b.frame().draws;
        expect(x.length, label).toBe(y.length);
        for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) expect(x[i], `${label} #${i}`).toBe(y[i]);
      };
      const groups: number[] = [];
      for (let k = 0; k < 80; k++) {
        same(`올리기 ${k}`);
        groups.push(a.v.stats.merged.groups);
        if (!(a.r as unknown as { uploading: boolean }).uploading && a.v.stats.merged.pending === 0 && k > 3) break;
      }
      // 여러 걸음에 나눠 올렸고 끝에는 묶음이 있다(곧장 굽기 — 0.57.0 — 로 첫 걸음부터 묶음이 있을 수 있다)
      expect(groups.length, groups.join(',')).toBeGreaterThan(2);
      expect(groups[groups.length - 1], groups.join(',')).toBeGreaterThan(0);
      // 그물 넷째마다 빼고 여덟째마다 바꾼 뒤(다시 굽기 — 바꾼 그물은 다른 배열·옮긴 자리)
      for (const w of [a, b]) {
        for (let i = 0; i < 600; i += 4) w.v.removeMesh(`b${i}`);
        for (let i = 2; i < 600; i += 8) {
          const m = sc.meshes[i]!;
          w.v.setMesh({ ...m, positions: m.positions.slice(), edges: m.edges?.slice(), origin: [(m.origin?.[0] ?? 0) + 3, m.origin?.[1] ?? 0, 0] });
        }
      }
      for (let k = 0; k < 20; k++) {
        same(`다시 굽기 ${k}`);
        if (a.v.stats.merged.pending === 0 && k > 2) break;
      }
      expect(a.v.stats.merged.groups).toBeGreaterThan(0);
    } finally {
      clock.mockRestore();
      g.devicePixelRatio = 1;
    }
  });
});
