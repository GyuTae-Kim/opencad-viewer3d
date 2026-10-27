/** 0.9.0 앱 붙잡기 점 색인: 모두 훑을 때(0.8.0)와 고르는 점이 같다(원근·평행·큰 좌표·묶음 행렬), 수십만 점에서도 빠르다 */
import { describe, expect, it } from 'vitest';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { transformPoint } from '../src/math';
import { type SnapCandidate, chooseMeasureSnap } from '../src/snap';
import { SnapPointIndex } from '../src/snapindex';
import type { SnapKind } from '../src/types';

/** 결정적인 의사 난수 */
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
    // 격자에 몰린 점(같은 화면 자리 겹침·거리 같음도 생기게)과 흩어진 점
    const g = i % 3 === 0;
    for (let k = 0; k < 3; k++) xyz[i * 3 + k] = center[k]! + (g ? Math.round((r() - 0.5) * 20) * (size / 20) : (r() - 0.5) * size);
  }
  return xyz;
}

const KINDS: SnapKind[] = ['center', 'point', 'midpoint', 'endpoint'];

/** 0.8.0 그대로(모두 훑기)와 색인으로 고른 결과 */
function both(f: ReturnType<typeof computeFrame>, xyz: Float64Array, ids: (string | undefined)[], mats: Map<string, Float64Array>, x: number, y: number, snapPx: number, idx: SnapPointIndex) {
  const n = xyz.length / 3;
  const at = (i: number): SnapCandidate => {
    const id = ids[i];
    const m = id !== undefined ? mats.get(id) : undefined;
    const p = [xyz[i * 3]!, xyz[i * 3 + 1]!, xyz[i * 3 + 2]!];
    return { p: m ? transformPoint(m, p) : (p as [number, number, number]), kind: KINDS[i % 4]!, id };
  };
  function* linear(): Generator<SnapCandidate> {
    for (let i = 0; i < n; i++) yield at(i);
  }
  function* indexed(): Generator<SnapCandidate> {
    for (const i of idx.near(f, x, y, snapPx, (id) => mats.get(id), mats.keys())) yield at(i);
  }
  const vis = (p: readonly number[]) => p[2]! < 1e9; // 모두 보임(부른 차례가 같아야 하는 판정은 아니다)
  return [chooseMeasureSnap(f, x, y, snapPx, null, linear(), vis), chooseMeasureSnap(f, x, y, snapPx, null, indexed(), vis)];
}

describe('SnapPointIndex', () => {
  const iso = dirToAngles(VIEW_DIRS.seIso);
  for (const projection of ['perspective', 'orthographic'] as const)
    for (const center of [
      [0, 0, 0],
      [1e6, -5e5, 1e4],
    ])
      it(`모두 훑기와 같은 점(${projection}, 원점 ${center[0]})`, () => {
        const xyz = cloud(6000, center, 200, 7);
        const ids = Array.from({ length: 6000 }, (_, i) => (i % 5 === 0 ? undefined : `묶음${i % 7}`));
        const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [...center] as [number, number, number], distance: 260, projection };
        const f = computeFrame(cam, 640, 480, { center, radius: 180 });
        // 묶음 하나는 행렬로 옮기고(점이 많다 — 따로 나무), 하나는 돌린다
        const mats = new Map<string, Float64Array>([
          ['묶음3', new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 30, -10, 25, 1])],
          ['묶음5', new Float64Array([0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])],
        ]);
        const idx = new SnapPointIndex(xyz, ids);
        const r = rng(3);
        let hits = 0;
        for (let k = 0; k < 400; k++) {
          const x = r() * 640, y = r() * 480;
          const [a, b] = both(f, xyz, ids, mats, x, y, 10, idx);
          expect(b).toEqual(a);
          if (a) hits++;
        }
        // 화면 점 위에서도(거리 0·같음)
        for (let i = 0; i < 300; i += 7) {
          const id = ids[i];
          const m = id !== undefined ? mats.get(id) : undefined;
          const p = [xyz[i * 3]!, xyz[i * 3 + 1]!, xyz[i * 3 + 2]!];
          const s = projectToScreen(f, m ? transformPoint(m, p) : p);
          if (!s) continue;
          const [a, b] = both(f, xyz, ids, mats, s[0] + 0.5, s[1] - 0.25, 10, idx);
          expect(b).toEqual(a);
          expect(a).not.toBeNull();
        }
        expect(hits).toBeGreaterThan(20);
      });

  it('30만 점: 커서 둘레 질의가 모두 훑기보다 훨씬 빠르다', () => {
    const n = 300_000;
    const xyz = cloud(n, [0, 0, 0], 1000, 11);
    const ids: (string | undefined)[] = new Array(n).fill(undefined);
    const cam: CameraState = { ...defaultCamera(), target: [0, 0, 0], distance: 1500, projection: 'perspective' };
    const f = computeFrame(cam, 1280, 800, { center: [0, 0, 0], radius: 900 });
    const idx = new SnapPointIndex(xyz, ids);
    const t0 = performance.now();
    idx.build();
    const tBuild = performance.now() - t0;
    const r = rng(5);
    const q = Array.from({ length: 60 }, () => [r() * 1280, r() * 800] as const);
    const t1 = performance.now();
    let found = 0;
    for (const [x, y] of q) found += idx.near(f, x, y, 10, () => undefined, []).length;
    const tIdx = (performance.now() - t1) / q.length;
    const t2 = performance.now();
    let seen = 0;
    for (const [x, y] of q.slice(0, 6))
      for (let i = 0; i < n; i++) {
        const s = projectToScreen(f, [xyz[i * 3]!, xyz[i * 3 + 1]!, xyz[i * 3 + 2]!]);
        if (s && Math.hypot(s[0] - x, s[1] - y) <= 10) seen++;
      }
    const tLin = (performance.now() - t2) / 6;
    console.log(`앱 점 ${n}개: 색인 만들기 ${tBuild.toFixed(1)} ms, 이동 한 번 질의 ${tIdx.toFixed(3)} ms(후보 평균 ${(found / q.length).toFixed(1)}개), 모두 훑기 ${tLin.toFixed(1)} ms`);
    expect(seen).toBeGreaterThanOrEqual(0);
    expect(tIdx * 20).toBeLessThan(tLin);
  });
});
