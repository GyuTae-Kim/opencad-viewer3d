/**
 * 0.10.0 앱 붙잡기 점 차례 한도(SnapPoint.order·setMeasureSnapLimit): 색인을 다시 만들지 않고 꺼낼 때 거른 결과가
 * 그 점들만으로 만든 목록(0.9.1 앱이 slice로 다시 주던 것)과 같다. 비용은 질의 한 번에 거르기만 더한다
 */
import { describe, expect, it } from 'vitest';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles } from '../src/camera';
import { transformPoint } from '../src/math';
import { type SnapCandidate, chooseMeasureSnap, snapLimit, withinSnapLimit } from '../src/snap';
import { SnapPointIndex } from '../src/snapindex';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function cloud(n: number, center: readonly number[], size: number, seed: number): Float64Array {
  const r = rng(seed);
  const xyz = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const g = i % 3 === 0;
    for (let k = 0; k < 3; k++) xyz[i * 3 + k] = center[k]! + (g ? Math.round((r() - 0.5) * 20) * (size / 20) : (r() - 0.5) * size);
  }
  return xyz;
}

describe('snapLimit·withinSnapLimit', () => {
  it('수면 한도, NaN·+Infinity·수가 아닌 것은 한도 없음(null)', () => {
    expect(snapLimit(10)).toBe(10);
    expect(snapLimit(0)).toBe(0);
    expect(snapLimit(-Infinity)).toBe(-Infinity);
    expect(snapLimit(Infinity)).toBeNull();
    expect(snapLimit(NaN)).toBeNull();
    expect(snapLimit(null)).toBeNull();
    expect(snapLimit(undefined)).toBeNull();
    expect(snapLimit('3')).toBeNull();
  });
  it('차례 < 한도만 든다. 차례가 없는 점과 한도가 없을 때는 늘 든다', () => {
    expect(withinSnapLimit(4, 5)).toBe(true);
    expect(withinSnapLimit(5, 5)).toBe(false);
    expect(withinSnapLimit(undefined, 5)).toBe(true);
    expect(withinSnapLimit(NaN, 5)).toBe(true);
    expect(withinSnapLimit(1e9, null)).toBe(true);
    expect(withinSnapLimit(0, -Infinity)).toBe(false);
  });
});

describe('SnapPointIndex.near(…, limit)', () => {
  const iso = dirToAngles(VIEW_DIRS.seIso);
  for (const projection of ['perspective', 'orthographic'] as const)
    it(`한도로 거른 결과 = 걸러 낸 점만 다시 준 목록(${projection}, 묶음 행렬 포함)`, () => {
      const n = 6000;
      const xyz = cloud(n, [0, 0, 0], 200, 7);
      const ids = Array.from({ length: n }, (_, i) => (i % 5 === 0 ? undefined : `묶음${i % 7}`));
      // 차례: 앞 3/4은 번호 차례(NC 이동 번호처럼 오름차순), 나머지는 뒤섞임, 몇 점은 차례 없음
      const r0 = rng(17);
      const order = new Float64Array(n);
      for (let i = 0; i < n; i++) order[i] = i % 97 === 0 ? -Infinity : i < (n * 3) / 4 ? i : Math.floor(r0() * n);
      const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 260, projection };
      const f = computeFrame(cam, 640, 480, { center: [0, 0, 0], radius: 180 });
      const mats = new Map<string, Float64Array>([
        ['묶음3', new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, -10, 25, 1])],
        ['묶음5', new Float64Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])],
      ]);
      const idx = new SnapPointIndex(xyz, ids, order);
      const at = (i: number): SnapCandidate => {
        const id = ids[i];
        const m = id !== undefined ? mats.get(id) : undefined;
        const p = [xyz[i * 3]!, xyz[i * 3 + 1]!, xyz[i * 3 + 2]!];
        return { p: m ? transformPoint(m, p) : (p as [number, number, number]), kind: 'center', id };
      };
      const vis = (): boolean => true;
      const r = rng(3);
      let hits = 0;
      for (const limit of [0, 1, 500, 2999, 4500, 5999, 6000, -Infinity]) {
        // 걸러 낸 점만으로 만든 색인(앱이 slice로 다시 주던 것) — 번호는 원래 번호로 되돌린다
        const keep: number[] = [];
        for (let i = 0; i < n; i++) if (order[i]! < limit) keep.push(i);
        const sx = new Float64Array(keep.length * 3);
        keep.forEach((i, k) => sx.set(xyz.subarray(i * 3, i * 3 + 3), k * 3));
        const sub = new SnapPointIndex(sx, keep.map((i) => ids[i]));
        for (let k = 0; k < 120; k++) {
          const x = r() * 640, y = r() * 480;
          // 후보(붙잡기 거리 안일 수 있는 점 — 나무 모양에 따라 넉넉함이 다르다)는 한도 없는 후보를 거른 것과 같고,
          // 고른 점은 걸러 낸 점만의 색인·모두 훑기와 같다
          const a = idx.near(f, x, y, 10, (id) => mats.get(id), mats.keys(), limit);
          expect(a).toEqual(idx.near(f, x, y, 10, (id) => mats.get(id), mats.keys()).filter((i) => order[i]! < limit));
          const b = sub.near(f, x, y, 10, (id) => mats.get(id), mats.keys()).map((j) => keep[j]!);
          const pa = chooseMeasureSnap(f, x, y, 10, null, a.map(at), vis);
          expect(chooseMeasureSnap(f, x, y, 10, null, b.map(at), vis)).toEqual(pa);
          expect(chooseMeasureSnap(f, x, y, 10, null, keep.map(at), vis)).toEqual(pa);
          if (pa) hits++;
        }
      }
      expect(hits).toBeGreaterThan(40);
      // 한도 null·undefined는 거르지 않는다
      expect(idx.near(f, 320, 240, 10, () => undefined, [], null)).toEqual(idx.near(f, 320, 240, 10, () => undefined, []));
    });

  it('NC 재생 꼴(원호 중심 10만 개, 차례 = 처음 그린 이동 번호): 한도 바꾸기는 다시 만들기보다 훨씬 싸다', () => {
    const n = 100_000;
    const xyz = cloud(n, [0, 0, 0], 1000, 11);
    const ids: (string | undefined)[] = Array.from({ length: n }, (_, i) => `nc-cut-${i % 4}`);
    const order = Float64Array.from({ length: n }, (_, i) => i * 3);
    const cam: CameraState = { ...defaultCamera(), target: [0, 0, 0], distance: 1500, projection: 'perspective' };
    const f = computeFrame(cam, 1280, 800, { center: [0, 0, 0], radius: 900 });
    // 0.9.1 꼴: 한도가 바뀔 때마다 점 목록을 잘라 새 색인을 만든다(setMeasureSnap({ points: slice }) — 목록 복사·묶음 표·나무)
    const tR0 = performance.now();
    const reps = 5;
    for (let k = 1; k <= reps; k++) {
      const m = Math.floor((n * k) / reps);
      const sx = xyz.slice(0, m * 3);
      new SnapPointIndex(sx, ids.slice(0, m)).build();
    }
    const tRebuild = (performance.now() - tR0) / reps;
    const idx = new SnapPointIndex(xyz, ids, order);
    idx.build();
    const r = rng(5);
    const q = Array.from({ length: 200 }, () => [r() * 1280, r() * 800] as const);
    const time = (lim: number | null): { ms: number; found: number } => {
      // 한 번 데운 뒤 잰다
      for (const [x, y] of q.slice(0, 20)) idx.near(f, x, y, 10, () => undefined, [], lim);
      const t = performance.now();
      let found = 0;
      for (const [x, y] of q) found += idx.near(f, x, y, 10, () => undefined, [], lim).length;
      return { ms: (performance.now() - t) / q.length, found: found / q.length };
    };
    const none = time(null);
    const all = time(n * 3);
    const half = time(n * 1.5);
    const tiny = time(300);
    console.log(
      `원호 중심 ${n}개: 한도마다 다시 만들기 ${tRebuild.toFixed(1)} ms(0.9.1 꼴, 목록 자르기·색인), 이동 한 번 질의 ` +
        `한도 없음 ${none.ms.toFixed(3)} ms(후보 ${none.found.toFixed(1)}개)·모두 드는 한도 ${all.ms.toFixed(3)} ms(${all.found.toFixed(1)}개)·` +
        `한도 절반 ${half.ms.toFixed(3)} ms(${half.found.toFixed(1)}개)·한도 100개 ${tiny.ms.toFixed(3)} ms(${tiny.found.toFixed(1)}개)`,
    );
    expect(all.found).toBe(none.found);
    expect(half.found).toBeLessThan(none.found);
    // 거르기는 질의 값을 크게 늘리지 않는다(기계 부하를 견디게 넉넉히): 한도 질의가 다시 만들기보다 수십 배 싸다
    expect(half.ms * 20).toBeLessThan(tRebuild);
  });
});
