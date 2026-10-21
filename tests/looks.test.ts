/** 묶음 겉모습 고르기: 반투명으로 바꾼 그물은 가리지 않고, 묶음 행렬이 걸린 선분·점은 세계 위치로 고른다 */
import { describe, expect, it } from 'vitest';
import { buildBvh } from '../src/bvh';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { itemBounds, transformBox } from '../src/bounds';
import { transformPoint } from '../src/math';
import { pointCandidates } from '../src/pick';
import { type ScenePickOptions, pickScene } from '../src/scenepick';
import { boxMesh } from '../src/synth';
import type { LineSet3d, PointSet3d } from '../src/types';

const a = dirToAngles(VIEW_DIRS.front);
const cam: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [0, 0, 0], distance: 100, projection: 'perspective' };
const f = computeFrame(cam, 400, 400, { center: [0, 0, 0], radius: 40 });
const at = (p: readonly number[]): [number, number] => {
  const s = projectToScreen(f, p)!;
  return [s[0], s[1]];
};
const bvhs = new Map<Float32Array | Uint32Array, ReturnType<typeof buildBvh>>();
const o = (x: Partial<ScenePickOptions> = {}): ScenePickOptions => ({
  tol: 6,
  occlude: true,
  bvh: (kind, positions, indices) => {
    let b = bvhs.get(indices ?? positions);
    if (!b) bvhs.set(indices ?? positions, (b = buildBvh(kind, positions, indices)));
    return b;
  },
  ...x,
});
const box = boxMesh('상자', [-10, -10, -10], [10, 10, 10], [0.7, 0.7, 0.7, 1]);
// 상자 뒤(y = 20)를 가로지르는 선분
const line: LineSet3d = { id: '선', positions: new Float32Array([-30, 20, 0, 30, 20, 0]) };

describe('겉모습과 고르기', () => {
  it('불투명 그물은 뒤의 선분을 가리고, 반투명으로 바꾸면(opaque) 선분을 고른다', () => {
    const p = at([0, 20, 0]);
    expect(pickScene(f, ...p, { meshes: [box], lines: [line], points: [] }, o())!.pick.kind).toBe('mesh');
    expect(pickScene(f, ...p, { meshes: [box], lines: [line], points: [] }, o({ opaque: () => false }))!.pick.id).toBe('선');
  });

  it('묶음 행렬이 걸린 선분·점은 세계 위치로 고르고 결과 점도 세계', () => {
    const c = Math.cos(0.5), s = Math.sin(0.5);
    // z축 둘레로 돌리고 (5, 0, 12)만큼 옮김
    const M = new Float64Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 5, 0, 12, 1]);
    const pts: PointSet3d = { id: '점', positions: new Float32Array([8, -15, 0, -8, -15, 0]) };
    const lw = transformPoint(M, [10, 20, 0]);
    // 범위(bounds)도 세계(행렬 반영)로 준다 — 뷰어의 boundsOf와 같다
    const bounds = (it: Parameters<typeof itemBounds>[0]): ReturnType<typeof itemBounds> => (it.id === '선' ? transformBox(itemBounds(it), M) : itemBounds(it));
    const d = pickScene(f, ...at(lw), { meshes: [], lines: [line], points: [] }, o({ bounds, itemModel: (it) => (it.id === '선' ? M : undefined) }))!;
    expect(d.pick.id).toBe('선');
    expect(Math.hypot(d.pick.point[0] - lw[0], d.pick.point[1] - lw[1], d.pick.point[2] - lw[2])).toBeLessThan(1e-6);
    // 행렬 없이 고르면 그 자리에는 선분이 없다
    expect(pickScene(f, ...at(lw), { meshes: [], lines: [line], points: [] }, o())).toBeNull();
    const pw = transformPoint(M, [-8, -15, 0]);
    const dp = pickScene(f, ...at(pw), { meshes: [], lines: [], points: [pts] }, o({ itemModel: () => M }))!;
    expect(dp.pick.kind).toBe('point');
    expect(dp.pick.index).toBe(1);
    expect(dp.vertex).toBe(true);
    // BVH = 모두 훑기
    const viaBvh = pointCandidates(f, pts.positions, buildBvh('point', pts.positions), M, ...at(pw), 400).map((h) => h.index).sort();
    const scan = pointCandidates(f, pts.positions, null, M, ...at(pw), 400).map((h) => h.index).sort();
    expect(viaBvh).toEqual(scan);
    expect(scan).toEqual([0, 1]);
  });
});
