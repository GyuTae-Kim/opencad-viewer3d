/**
 * 0.66.0 fit: false가 있을 때의 맞춤 범위·그림자 깊이 그림 범위(65차 남은 한계):
 *  - 맞춤 범위를 보이는 범위처럼 덩어리째: 보이는 범위 덩어리가 있으면 숨긴 묶음·맞춤에서 뺀 묶음이 든 덩어리만 묶음마다 합친다(0.65.0은 맞출 때마다 묶음마다 —
 *    그물 수에 비례). 묶음마다 합친 값과 비트까지 같다(두 규칙 × 숨김·묶음 숨김·겉모습 행렬·구간 숨김·마주 보는 그물·더하기·빼기·바꾸기)
 *  - 그림자 깊이 그림 범위는 그림자를 드리우고 받는 것 — 보이는 그물(fit: false 그물도)의 범위 합이다. 선분·점(멀리 뻗은 보조선 등)은 넣지 않는다
 *    (0.65.0은 보이는 범위라 선분·점·Scene3d.bounds까지 덮어 깊이 그림 한 칸이 컸다). 보이는 그물이 없으면 보이는 범위
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installDom } from './fakedom';
import { boxMesh } from '../src/synth';
import { emptyBox, sceneBounds, unionBox } from '../src/bounds';
import type { Box3, FitRange, LineSet3d, Mesh3d, PointSet3d, Scene3d } from '../src/types';
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

/**
 * 그물 n개(가로 30개 격자, 묶음 이름은 300개씩 g0~g4 — 부품 묶음처럼 장면 차례로 잇단다, every번째마다 fit: false로 멀리, 0번째는 −0 좌표),
 * 선분 30개(5번째마다 fit: false로 멀리), 점 묶음 6개(둘은 fit: false)
 */
function scene(n: number, fitRange?: FitRange, every = 37): Scene3d {
  const meshes: Mesh3d[] = [];
  for (let i = 0; i < n; i++) {
    const far = i % every === 5;
    const m = boxMesh(`m${i}`, [0, 0, 0], [6, 6, 3 + (i % 4)], [0.5, 0.6, 0.7, 1], `g${Math.floor(i / 300) % 5}`);
    m.origin = far ? [-4000 - i, 2000, 500] : [(i % 30) * 10, Math.floor(i / 30) * 10, i === 0 ? -0 : 0];
    if (far) m.fit = false;
    meshes.push(m);
  }
  const lines: LineSet3d[] = Array.from({ length: 30 }, (_, i) => ({
    id: `l${i}`,
    positions: i % 5 === 2 ? Float32Array.of(-9000, i, 0, 9000, i, 4000) : Float32Array.of(i * 10, -20, 0, i * 10 + 5, -10, 1),
    group: `lg${i % 3}`,
    ...(i % 5 === 2 ? { fit: false } : {}),
  }));
  const points: PointSet3d[] = Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, positions: Float32Array.of(i * 20, 400, i < 2 ? 3000 : 2), ...(i < 2 ? { fit: false } : {}) }));
  const s: Scene3d = { name: 'f', units: 'mm', meshes, lines, points, bounds: { min: [0, 0, 0], max: [300, 300, 6] } };
  if (fitRange) s.fitRange = fitRange;
  return s;
}

type Inner = {
  visibleBox(): Box3;
  fitBox(): Box3;
  shadowBox(): Box3;
  fitBx: Box3 | null;
  shBx: Box3 | null;
  chunkedVisibleBox(...a: unknown[]): Box3 | null;
  visibleBoundsOf(...a: unknown[]): Box3;
  boundsOf(...a: unknown[]): Box3;
  renderer: { render(...a: unknown[]): void };
};
const inner = (v: Viewer3d): Inner => v as unknown as Inner;
const bits = (b: Box3): string => [...b.min, ...b.max].map((x) => (Object.is(x, -0) ? '-0' : String(x))).join(',');

function view(sc: Scene3d, slow = false): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false });
  views.push(v);
  // slow: 보이는 범위·맞춤 범위를 늘 묶음마다(덩어리째 길을 끈다 — 0.62.0 앞 보이는 범위·0.65.0 맞춤 범위와 같은 셈)
  if (slow) inner(v).chunkedVisibleBox = () => null;
  v.setScene(sc);
  return v;
}

describe('0.66.0 맞춤 범위를 덩어리째', () => {
  it('숨김·겉모습·구간·편집마다 맞춤 범위가 묶음마다 합친 값과 비트까지 같고, 보이는 범위 덩어리가 있으면 맞춤에서 묶음마다 다시 합치지 않는다', () => {
    const n = 1200;
    for (const rule of [undefined, 'visible'] as const) {
      // 맞춤에서 뺀 그물은 셋(m5·m405·m805 — 보조 묶음처럼 드물다)
      const fast = view(scene(n, rule, 400)), slow = view(scene(n, rule, 400), true);
      const steps: [string, (v: Viewer3d) => void][] = [
        ['처음', () => {}],
        ['항목 숨김', (v) => v.setItemVisible('m40', false)],
        ['묶음 숨김', (v) => v.setGroupVisible('g2', false)],
        ['선분 숨김', (v) => v.setItemVisible('l7', false)],
        ['맞춤에서 뺀 그물 숨김', (v) => v.setItemVisible('m805', false)],
        ['겉모습 행렬', (v) => v.setItemMatrix('m300', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 900, 1])],
        ['겉모습 풀기', (v) => v.setItemMatrix('m300', null)],
        ['구간 숨김', (v) => v.setHiddenRanges('m301', [{ start: 0, count: 6 }])],
        ['구간 풀기', (v) => v.setHiddenRanges('m301', null)],
        ['그물 바꾸기', (v) => void v.setMesh({ ...boxMesh('m500', [0, 0, 0], [6, 6, 60], [1, 0, 0, 1], 'g0'), origin: [10, 20, 0] })],
        ['fit: false로 바꾸기', (v) => void v.setMesh({ ...boxMesh('m501', [0, 0, 0], [6, 6, 6], [1, 0, 0, 1], 'g1'), origin: [7000, 0, 0], fit: false })],
        ['그물 빼기', (v) => void v.removeMesh('m405')],
        ['그물 더하기', (v) => void v.setMesh({ ...boxMesh('a1', [0, 0, 0], [3, 3, 3], [0, 1, 0, 1]), origin: [-50, -50, -50] })],
        ['숨김 풀기', (v) => (v.setItemVisible('m40', true), v.setGroupVisible('g2', true), v.setItemVisible('l7', true))],
        ['모두 숨김', (v) => ['g0', 'g1', 'g2', 'g3', 'g4', 'lg0', 'lg1', 'lg2'].forEach((g) => v.setGroupVisible(g, false))],
      ];
      let chunked = 0;
      const log: string[] = [];
      for (const [label0, fn] of steps) {
        const label = `${rule ?? 'bounds'} ${label0}`;
        fn(fast);
        fn(slow);
        const F = inner(fast), S = inner(slow);
        F.visibleBox();
        F.fitBx = null;
        // 맞춤 범위만 셀 때 묶음 범위를 묻는 수(보이는 범위 덩어리는 먼저 만든다)
        let asked = 0;
        const vb = F.visibleBoundsOf, bo = F.boundsOf;
        F.visibleBoundsOf = (...a: unknown[]) => (asked++, vb.apply(fast, a));
        F.boundsOf = (...a: unknown[]) => (asked++, bo.apply(fast, a));
        const fb = F.fitBox();
        F.visibleBoundsOf = vb;
        F.boundsOf = bo;
        expect(bits(fb), label).toBe(bits(S.fitBox()));
        expect(bits(F.visibleBox()), label).toBe(bits(S.visibleBox()));
        expect(fast.fitBounds, label).toEqual(slow.fitBounds);
        // 묶음마다 합치면 묶음마다 두 번(visibleBoundsOf → boundsOf) 묻는다
        if (asked < n / 2) chunked++;
        log.push(`${label0}:${asked}`);
      }
      // 숨긴 것이 있는 단계(보이는 범위 덩어리가 있다)는 덩어리째 — 묶음마다 묻는 수가 숨긴·맞춤에서 뺀 묶음이 든 덩어리 몫
      expect(chunked, `${rule ?? 'bounds'} 덩어리째 센 단계 ${log.join(' ')}`).toBeGreaterThanOrEqual(8);
    }
  });
});

describe('0.66.0 그림자 깊이 그림 범위', () => {
  /** 렌더러가 받은 그림자 범위(그리기 한 번) */
  function shadowOf(v: Viewer3d): Box3 | null {
    const R = inner(v).renderer;
    let got: Box3 | null = null;
    const r0 = R.render;
    R.render = (...a: unknown[]) => {
      got = (a[3] as { shadow: { box: Box3 } | null }).shadow?.box ?? null;
      return r0.apply(R, a);
    };
    v.renderNow();
    R.render = r0;
    return got;
  }
  /** 보이는 그물 범위 합(장면 차례 — 겉모습 행렬은 옮겨서) */
  const meshUnion = (s: Scene3d, keep: (m: Mesh3d) => boolean, moved: Record<string, Box3> = {}): Box3 => {
    let b = emptyBox();
    for (const m of s.meshes) if (keep(m)) b = unionBox(b, moved[m.id] ?? sceneBounds({ ...s, meshes: [m], lines: [], points: [] }));
    return b;
  };

  it('보이는 그물(fit: false 그물도)만 덮고 선분·점·Scene3d.bounds는 넣지 않는다 — 숨김·겉모습·편집을 따른다', () => {
    for (const rule of [undefined, 'visible'] as const) {
      const sc = scene(400, rule);
      const v = view(sc), slow = view(scene(400, rule), true);
      for (const w of [v, slow]) w.setLighting({ sun: { direction: [-0.4, -0.6, 0.8] }, shadows: true });
      const label = rule ?? 'bounds';
      const s0 = shadowOf(v)!;
      expect(bits(s0), label).toBe(bits(meshUnion(sc, () => true)));
      // 보이는 범위는 'visible' 규칙이면 멀리 뻗은 선분까지(그림자 범위보다 넓다), 기본 규칙이면 Scene3d.bounds(멀리 둔 fit: false 그물이 빠져 그 그림자가 잘렸다)
      const vb = inner(v).visibleBox();
      if (rule) expect(vb.max[0], label).toBe(9000);
      else expect(bits(vb), label).toBe('0,0,0,300,300,6');
      expect(s0.min[0], label).toBe(-4375);
      expect(s0.max[0], label).toBe(296);
      expect(bits(shadowOf(slow)!), label).toBe(bits(s0));
      const hid = new Set(['m5', 'm375']);
      for (const w of [v, slow]) {
        w.setItemVisible('m5', false);
        w.setItemVisible('m375', false);
      }
      const s1 = shadowOf(v)!;
      expect(bits(s1), `${label} 숨김`).toBe(bits(meshUnion(sc, (m) => !hid.has(m.id))));
      expect(bits(shadowOf(slow)!), `${label} 숨김`).toBe(bits(s1));
      // 숨긴 그물(m375)이 가장 멀리 둔 fit: false 그물이라 범위가 준다(다음은 m338)
      expect(s1.min[0], `${label} 숨김`).toBe(-4338);
      expect(s0.min[0], label).toBe(-4375);
      for (const w of [v, slow]) w.setItemMatrix('m100', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 800, 1]);
      const s2 = shadowOf(v)!;
      expect(s2.max[2], `${label} 겉모습`).toBe(803);
      expect(bits(shadowOf(slow)!), `${label} 겉모습`).toBe(bits(s2));
      for (const w of [v, slow]) w.setItemMatrix('m100', null);
      for (const w of [v, slow]) w.removeMesh('m79');
      expect(bits(shadowOf(v)!), `${label} 빼기`).toBe(bits(shadowOf(slow)!));
      // 그물을 모두 숨기면 보이는 범위(선분·점)
      for (const w of [v, slow]) for (const g of ['g0', 'g1', 'g2', 'g3', 'g4']) w.setGroupVisible(g, false);
      expect(bits(shadowOf(v)!), `${label} 그물 모두 숨김`).toBe(bits(inner(v).visibleBox()));
    }
  });
});
