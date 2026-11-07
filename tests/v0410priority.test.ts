/**
 * 0.41.0 앱 점의 우선(SnapPoint.priority — STEP 46차 요청): 앱이 준 곡선–면 교차점이 커서에 더 가까우면 가운데 점·수직 발·축 방향보다 먼저 붙어
 * 기존 붙잡기 차례가 바뀌었다. 앱이 점마다 고른다.
 * - 'low': 다른 점 붙잡기보다 LOW_PRIORITY_YIELD_PX(반 화소) 넘게 가까울 때만 — 같은 화면 거리면 뒤(뒤 차례인 교차점·수직 발에도 진다)
 * - 'fallback': 다른 붙잡기(점 붙잡기·축 등 선 붙잡기)가 하나도 없을 때만 — 붙잡지 않은 자리보다만 먼저. 잠근 동안에는 잠근 선에 내린 자리
 * - 없음·'normal': 0.40.0 그대로(고르는 점·보이는지 묻는 차례까지 같다)
 * 장면(z = 0, 위에서 봄): L1 (0,0)–(20,0)(가운데 점 (10,0)), L2 (30,−10)–(30,14), L3 (5,−5)–(5,8)(L1과 교차점 (5,0)).
 * 화면 좌표로 가리킬 때는 점을 정확히 가리키지 않고 몇 분의 일 화소 옆을 가리킨다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom, type FakeElement } from './fakedom';
import { type MeasureSnapOptions, Viewer3d } from '../src/viewer';
import { LOW_PRIORITY_YIELD_PX, type SnapCandidate, chooseMeasureSnap, snapPriority } from '../src/snap';
import { type ViewFrame, projectToScreen } from '../src/camera';
import type { V3 } from '../src/math';
import type { LineSet3d, Pick3d, Scene3d, SnapPoint, SnapPriority } from '../src/types';

const seg = (id: string, a: V3, b: V3): LineSet3d => ({ id, name: id, positions: new Float32Array([...a, ...b]), color: [0.9, 0.9, 0.9, 1] });
const scene: Scene3d = {
  name: 'prio',
  units: 'mm',
  meshes: [],
  lines: [seg('L1', [0, 0, 0], [20, 0, 0]), seg('L2', [30, -10, 0], [30, 14, 0]), seg('L3', [5, -5, 0], [5, 8, 0])],
  points: [],
};
const MID: V3 = [10, 0, 0];
const X: V3 = [5, 0, 0];
const FOOT: V3 = [30, 0, 0];
const ISO: V3 = [15, 6, 0];

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  for (const v of views) v.dispose();
  vi.useRealTimers();
  dom.restore();
});

const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as FakeElement).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const scr = (v: Viewer3d, p: readonly number[]): [number, number] => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return [s.x, s.y];
};
const hoverXY = (v: Viewer3d, x: number, y: number): void => {
  ptr(v, 'pointermove', x, y, 0);
  v.renderNow();
};
const hover = (v: Viewer3d, p: readonly number[]): void => {
  const [x, y] = scr(v, p);
  hoverXY(v, x + 0.31, y + 0.17);
};
const click = (v: Viewer3d, p: readonly number[]): void => {
  const [x, y] = scr(v, p);
  hoverXY(v, x + 0.31, y + 0.17);
  ptr(v, 'pointerdown', x + 0.31, y + 0.17, 1);
  ptr(v, 'pointerup', x + 0.31, y + 0.17, 0);
  v.renderNow();
};
const near = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

function make(o: Partial<MeasureSnapOptions>): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [15, 2, 0], distance: 80 });
  v.setMeasureMode(true);
  v.setMeasureSnap({ midpoints: true, inference: { intersections: true, perpendicular: true, axes: true }, ...o });
  v.renderNow();
  return v;
}
/** 화면에서 점 p를 위(−y 화면 방향 = 세계 +y)로 px 화소 옮긴 세계 점 */
function upPx(v: Viewer3d, p: V3, px: number): V3 {
  const a = v.project(p)!, b = v.project([p[0], p[1] + 1, p[2]])!;
  const per = Math.hypot(b.x - a.x, b.y - a.y);
  return [p[0], p[1] + px / per, p[2]];
}
/** 앱 점 하나(우선 pr)와 나머지(늘 보통) */
const pts = (list: [V3, SnapPoint['kind'], SnapPriority | undefined][]): SnapPoint[] =>
  list.map(([point, kind, pr]) => ({ point, kind: kind ?? 'point', ...(pr ? { priority: pr } : {}) }));

describe('snapPriority·chooseMeasureSnap(0.41.0 — 순수)', () => {
  it('snapPriority는 low·fallback만 그대로, 그 밖은 null(보통)', () => {
    expect(snapPriority('low')).toBe('low');
    expect(snapPriority('fallback')).toBe('fallback');
    for (const v of ['normal', undefined, null, 'LOW', 1, {}]) expect(snapPriority(v)).toBeNull();
    expect(LOW_PRIORITY_YIELD_PX).toBe(0.5);
  });

  // 평행 투영 단위 틀: 세계 (x, y) → 화면 (x, −y)를 흉내 내지 않고 projectToScreen이 쓰는 틀을 하나 만든다
  const frame = (): ViewFrame => {
    const host = dom.host();
    host.rect = { left: 0, top: 0, width: 400, height: 300 };
    const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    v.setScene(scene);
    v.setView('top', false);
    v.fit(false);
    return (v as unknown as { frame(): ViewFrame }).frame();
  };

  /** 0.40.0 chooseMeasureSnap(우선 없음) 그대로 — 견줄 기준 */
  function old(f: ViewFrame, x: number, y: number, snapPx: number, base: { p: V3; kind: SnapCandidate['kind'] | null } | null, cands: Iterable<SnapCandidate>, visible: (p: V3, sx: number, sy: number, id: string | undefined) => boolean) {
    let best: { dist: number; c: SnapCandidate } | null = null;
    if (base && base.kind) {
      const s = projectToScreen(f, base.p);
      best = { c: { p: base.p, kind: base.kind }, dist: s ? Math.hypot(s[0] - x, s[1] - y) : 0 };
    }
    for (const c of cands) {
      const s = projectToScreen(f, c.p);
      if (!s || !Number.isFinite(s[0]) || !Number.isFinite(s[1])) continue;
      const dist = Math.hypot(s[0] - x, s[1] - y);
      if (dist > snapPx || (best && dist >= best.dist)) continue;
      if (f.projection === 'perspective' && s[2] < f.near * 0.999) continue;
      if (!visible(c.p, s[0], s[1], c.id)) continue;
      best = { c, dist };
    }
    return best ? { p: best.c.p, kind: best.c.kind } : base ? { p: base.p, kind: null } : null;
  }

  it('우선이 없으면 0.40.0과 같은 점·같은 보이는지 물음(차례까지) — 무작위 3,000가지', () => {
    const f = frame();
    let seed = 7;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let t = 0; t < 3000; t++) {
      const n = 1 + Math.floor(rnd() * 8);
      const cands: SnapCandidate[] = [];
      for (let i = 0; i < n; i++) {
        // 겹친 점(같은 거리)도 섞는다
        const p: V3 = i > 0 && rnd() < 0.3 ? [...cands[Math.floor(rnd() * i)]!.p] as V3 : [10 + rnd() * 4, rnd() * 4 - 2, 0];
        cands.push({ p, kind: rnd() < 0.5 ? 'point' : 'center' });
      }
      const s = projectToScreen(f, [12, 0, 0])!;
      const x = s[0] + (rnd() - 0.5) * 30, y = s[1] + (rnd() - 0.5) * 30;
      const base = rnd() < 0.5 ? { p: [12 + rnd(), rnd() - 0.5, 0] as V3, kind: rnd() < 0.5 ? ('endpoint' as const) : null } : null;
      const hide = new Set(cands.filter(() => rnd() < 0.2));
      const asked1: V3[] = [], asked2: V3[] = [];
      const a = old(f, x, y, 10, base, cands, (p) => (asked1.push(p), !hide.has(cands.find((c) => c.p === p)!)));
      const b = chooseMeasureSnap(f, x, y, 10, base, cands, (p) => (asked2.push(p), !hide.has(cands.find((c) => c.p === p)!)));
      expect(b?.p ?? null, `${t}`).toBe(a?.p ?? null);
      expect(b?.kind ?? null, `${t}`).toBe(a?.kind ?? null);
      expect(asked2, `${t}`).toEqual(asked1);
    }
  });

  it("'low'는 반 화소 넘게 가까울 때만 이기고(앞에 있어도), 'fallback'은 다른 후보가 없을 때만", () => {
    const f = frame();
    const at = (p: V3): [number, number] => projectToScreen(f, p)!.slice(0, 2) as [number, number];
    const P: V3 = [10, 0, 0];
    const [px, py] = at(P);
    const per = Math.hypot(...(at([11, 0, 0]).map((v, i) => v - [px, py][i]!) as [number, number]));
    const Q = (dpx: number): V3 => [10 + dpx / per, 0, 0];
    const vis = (): boolean => true;
    // 커서는 P에서 왼쪽 3화소. 보통 N = P, 'low' L은 N보다 k화소 가깝다
    const x = px - 3 * 1, y = py;
    for (const [k, win] of [
      [0, 'N'],
      [0.4, 'N'],
      [0.6, 'L'],
      [2, 'L'],
    ] as const) {
      const N: SnapCandidate = { p: P, kind: 'midpoint' };
      const L: SnapCandidate = { p: Q(-k), kind: 'intersection', priority: 'low' };
      for (const order of [
        [L, N],
        [N, L],
      ]) {
        const r = chooseMeasureSnap(f, x, y, 10, null, order, vis)!;
        expect(r.kind, `${k} ${order[0] === L ? 'L 먼저' : 'N 먼저'}`).toBe(win === 'N' ? 'midpoint' : 'intersection');
      }
      // base(고르기 끝점)에도 같다
      const r = chooseMeasureSnap(f, x, y, 10, { p: P, kind: 'endpoint' }, [L], vis)!;
      expect(r.kind, `base ${k}`).toBe(win === 'N' ? 'endpoint' : 'intersection');
    }
    // 'low'끼리는 0.8.0 규칙(가까운 것, 같으면 앞의 것)
    const l1: SnapCandidate = { p: Q(-1), kind: 'point', priority: 'low' }, l2: SnapCandidate = { p: Q(-1), kind: 'center', priority: 'low' };
    expect(chooseMeasureSnap(f, x, y, 10, null, [l1, l2], vis)!.kind).toBe('point');
    // 'fallback': 보통·'low'·base 붙잡기가 하나라도 있으면 진다(더 가까워도). 없으면 가장 가까운 것, base가 붙잡지 않은 점이면 그보다 먼저
    const F: SnapCandidate = { p: Q(-2.9), kind: 'intersection', priority: 'fallback' };
    expect(chooseMeasureSnap(f, x, y, 10, null, [F, { p: P, kind: 'center' }], vis)!.kind).toBe('center');
    expect(chooseMeasureSnap(f, x, y, 10, null, [F, { p: P, kind: 'center', priority: 'low' }], vis)!.kind).toBe('center');
    expect(chooseMeasureSnap(f, x, y, 10, { p: P, kind: 'vertex' }, [F], vis)!.kind).toBe('vertex');
    const u = chooseMeasureSnap(f, x, y, 10, { p: P, kind: null }, [F], vis)!;
    expect(u.kind).toBe('intersection');
    expect(u.p).toBe(F.p);
    // 붙잡기 거리 밖·보이지 않는 fallback은 없다
    expect(chooseMeasureSnap(f, x, y, 10, { p: P, kind: null }, [{ ...F, p: Q(-20) }], vis)!.kind).toBeNull();
    expect(chooseMeasureSnap(f, x, y, 10, null, [F], () => false)).toBeNull();
    // 보이지 않는 보통 점은 fallback을 막지 않는다
    expect(chooseMeasureSnap(f, x, y, 10, null, [{ p: P, kind: 'center', id: 'h' }, F], (_p, _x, _y, id) => id !== 'h')!.kind).toBe('intersection');
  });
});

describe('Viewer3d SnapPoint.priority(0.41.0 — STEP 46차 요청)', () => {
  it("우선이 없으면·'normal'이면 0.40.0 그대로 — 가운데 점보다 가까운 앱 점, 교차점과 겹친 앱 점이 이긴다", () => {
    for (const pr of [undefined, 'normal'] as const) {
      const v0 = make({});
      const A = upPx(v0, MID, 4);
      const v = make({ points: pts([[A, 'intersection', pr], [X, 'point', pr]]) });
      hover(v, A);
      expect(v.measureHoverSnap?.snap, `${pr}`).toBe('intersection');
      expect(near(v.measureHoverSnap!.point, A)).toBeLessThan(1e-9);
      hover(v, X);
      expect(v.measureHoverSnap?.snap, `${pr}`).toBe('point');
    }
  });

  it("'low': 같은 화면 거리면 뒤 차례 교차점에도 지고, 반 화소 넘게 가까우면 이긴다", () => {
    const v0 = make({});
    const A = upPx(v0, MID, 4);
    // 교차점에서 화면 아래로 0.3화소(가리키는 자리가 X2 오른쪽 아래 0.35화소라 교차점보다 0.2화소쯤 가깝다) — 같은 화면 거리로 본다
    const X2 = upPx(v0, X, -0.3);
    const v = make({ points: pts([[A, 'intersection', 'low'], [X, 'point', 'low']]) });
    hover(v, A);
    expect(v.measureHoverSnap?.snap).toBe('intersection');
    expect(near(v.measureHoverSnap!.point, A)).toBeLessThan(1e-9);
    hover(v, X);
    expect(v.measureHoverSnap?.snap).toBe('intersection');
    expect(near(v.measureHoverSnap!.point, X)).toBeLessThan(1e-5);
    const w = make({ points: pts([[X2, 'point', 'low']]) });
    hover(w, X2);
    expect(w.measureHoverSnap?.snap).toBe('intersection');
    // 보통이면 0.40.0처럼 앱 점
    const u = make({ points: pts([[X2, 'point', undefined]]) });
    hover(u, X2);
    expect(u.measureHoverSnap?.snap).toBe('point');
  });

  it("'fallback': 가운데 점·교차점이 있으면 더 가까워도 지고, 다른 붙잡기가 없는 자리에서만 붙는다(측정 결과 종류도 그 점)", () => {
    const v0 = make({});
    const A = upPx(v0, MID, 4);
    const v = make({ points: pts([[A, 'intersection', 'fallback'], [ISO, 'point', 'fallback'], [X, 'center', 'fallback']]) });
    hover(v, A);
    expect(v.measureHoverSnap?.snap).toBe('midpoint');
    expect(near(v.measureHoverSnap!.point, MID)).toBeLessThan(1e-5);
    hover(v, X);
    expect(v.measureHoverSnap?.snap).toBe('intersection');
    hover(v, ISO);
    expect(v.measureHoverSnap?.snap).toBe('point');
    expect(near(v.measureHoverSnap!.point, ISO)).toBeLessThan(1e-9);
    click(v, ISO);
    click(v, A);
    const m = v.measurement()!;
    expect(m.snapA).toBe('point');
    expect(m.snapB).toBe('midpoint');
  });

  it("'fallback': 첫 점 축 위 자리에서는 축이, 수직 발 자리에서는 수직 발이 먼저 — 축에서 먼 자리면 그 점(보통이면 0.40.0처럼 앱 점)", () => {
    const v0 = make({});
    const first: V3 = [20, 0, 0];
    const G = upPx(v0, [25, 0, 0], 2); // 첫 점 X축(y = 0)에서 2화소 — 다른 점 붙잡기 없음
    const H = upPx(v0, FOOT, 2.5); // 수직 발 (30, 0)에서 2.5화소(L2 위)
    const K: V3 = [24, -6, 0]; // 축·선분에서 먼 자리
    const res: Record<string, (string | null)[]> = {};
    for (const pr of ['fallback', undefined] as const) {
      const v = make({ points: pts([[G, 'point', pr], [H, 'center', pr], [K, 'point', pr]]) });
      click(v, first);
      const out: (string | null)[] = [];
      for (const p of [G, H, K]) {
        hover(v, p);
        out.push(v.measureHoverSnap?.snap ?? null);
      }
      res[String(pr)] = out;
    }
    expect(res['fallback']).toEqual(['axis', 'perpendicular', 'point']);
    expect(res['undefined']).toEqual(['point', 'center', 'point']);
  });

  it("'fallback': 잠근 동안 점 붙잡기가 없으면 그 점을 잠근 선에 내린 자리(from — 보통 점과 같다), 다른 점 붙잡기가 있으면 그 점", () => {
    const v0 = make({});
    const A = upPx(v0, MID, 4);
    const res: unknown[] = [];
    for (const pr of ['fallback', undefined] as const) {
      const v = make({ points: pts([[ISO, 'point', pr], [A, 'intersection', pr]]) });
      click(v, [20, 0, 0]);
      expect(v.setMeasureInferenceLock('y')).toBe(true);
      hover(v, ISO);
      const h = v.measureHoverSnap!;
      expect(h.locked).toBe(true);
      expect(h.fromSnap).toBe('point');
      expect(near(h.from!, ISO)).toBeLessThan(1e-9);
      expect(near(h.point, [20, 6, 0])).toBeLessThan(1e-9);
      hover(v, A);
      res.push(v.measureHoverSnap?.fromSnap);
    }
    expect(res).toEqual(['midpoint', 'intersection']);
  });

  it("pointsFor 점·색인(앱 점 512개 이상) 길도 같은 규칙이고, 'low'·'fallback'이 없는 점 목록은 우선을 단 목록과 고르는 점이 같다(보통 점 자리)", () => {
    const v0 = make({});
    const A = upPx(v0, MID, 4);
    const far = Array.from({ length: 600 }, (_, i): SnapPoint => ({ point: [200 + i, 300, 0], kind: 'point' }));
    const pf = (pick: Pick3d): SnapPoint[] | null => (pick.id === 'L1' ? [{ point: A, kind: 'intersection', priority: 'fallback' }] : null);
    for (const opts of [{ pointsFor: pf }, { points: [...far, { point: A, kind: 'intersection' as const, priority: 'fallback' as const }, { point: ISO, kind: 'point' as const, priority: 'fallback' as const }] }]) {
      const v = make(opts);
      hover(v, A);
      expect(v.measureHoverSnap?.snap).toBe('midpoint');
      if ('points' in opts) {
        hover(v, ISO);
        expect(v.measureHoverSnap?.snap).toBe('point');
      }
    }
    // 우선 없는 목록과 모두 'normal'인 목록: 커서 격자 미리 보기가 같다(색인 길 포함)
    const plain = [...far, { point: A, kind: 'intersection' as const }, { point: X, kind: 'point' as const }];
    const a = make({ points: plain }), b = make({ points: plain.map((p) => ({ ...p, priority: 'normal' as const })) });
    const [cx, cy] = scr(a, MID);
    for (let dy = -30; dy <= 30; dy += 3.7)
      for (let dx = -60; dx <= 60; dx += 4.3) {
        hoverXY(a, cx + dx, cy + dy);
        hoverXY(b, cx + dx, cy + dy);
        expect(JSON.stringify(b.measureHoverSnap), `${dx} ${dy}`).toBe(JSON.stringify(a.measureHoverSnap));
      }
  });
});
