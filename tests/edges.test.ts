/** 그물 윤곽선(Mesh3d.edges) 고르기: 면보다 먼저, 가린 윤곽선은 빼고, 행렬·숨김·단면·끝점 붙잡기 */
import { describe, expect, it } from 'vitest';
import { buildBvh } from '../src/bvh';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { transformPoint } from '../src/math';
import { normBound3, segmentCandidates } from '../src/pick';
import { type ScenePickOptions, pickScene } from '../src/scenepick';
import { boxMesh } from '../src/synth';
import type { Mesh3d } from '../src/types';

const a = dirToAngles(VIEW_DIRS.front);
const cam: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [0, 0, 0], distance: 100, projection: 'perspective' };
const f = computeFrame(cam, 400, 400, { center: [0, 0, 0], radius: 40 });
const box = boxMesh('상자', [-10, -10, -10], [10, 10, 10], [0.7, 0.7, 0.7, 1]);
// 상자 모서리 순서: 0 = 아래 앞(y0) x 방향, … 4 = 위 앞(z1, y0) x 방향, 6 = 위 뒤(z1, y1)
const FRONT_TOP = 4, BACK_TOP = 6;
const bvhs = new Map<Float32Array, ReturnType<typeof buildBvh>>();
const opts = (o: Partial<ScenePickOptions> = {}): ScenePickOptions => ({
  tol: 6,
  occlude: true,
  bvh: (kind, positions, indices) => {
    let b = bvhs.get(positions);
    if (!b) bvhs.set(positions, (b = buildBvh(kind, positions, indices)));
    return b;
  },
  edges: true,
  ...o,
});
const at = (p: readonly number[]): [number, number] => {
  const s = projectToScreen(f, p)!;
  return [s[0], s[1]];
};
const scene = (m: Mesh3d = box): { meshes: Mesh3d[]; lines: []; points: [] } => ({ meshes: [m], lines: [], points: [] });

describe('윤곽선 고르기', () => {
  it('윤곽선 가까이 누르면 kind edge(그물 id, edges 번호), 끄면 면', () => {
    const [x, y] = at([3, -10, 10]);
    const d = pickScene(f, x, y + 3, scene(), opts())!;
    expect(d.pick.kind).toBe('edge');
    expect(d.pick.id).toBe('상자');
    expect(d.pick.index).toBe(FRONT_TOP);
    expect(d.pick.raw).toBe(FRONT_TOP);
    expect(d.pick.point[1]).toBeCloseTo(-10, 6);
    expect(d.pick.point[2]).toBeCloseTo(10, 6);
    expect(pickScene(f, x, y + 3, scene(), opts({ edges: false }))!.pick.kind).toBe('mesh');
    // 면 한가운데(윤곽선에서 멀리)는 면
    const [cx, cy] = at([0, -10, 0]);
    expect(pickScene(f, cx, cy, scene(), opts())!.pick.kind).toBe('mesh');
  });

  it('음영 모드에서는 앞면에 가린 뒤쪽 윤곽선을 고르지 않고, 가림을 보지 않으면 고른다', () => {
    const [x, y] = at([0, 10, 10]);
    const d = pickScene(f, x, y, scene(), opts())!;
    expect(d.pick.kind).toBe('mesh');
    const w = pickScene(f, x, y, scene(), opts({ occlude: false }))!;
    expect(w.pick.kind).toBe('edge');
    expect(w.pick.index).toBe(BACK_TOP);
  });

  it('끝점 가까이면 끝점에 붙잡는다(측정)', () => {
    const [x, y] = at([10, -10, 10]);
    const d = pickScene(f, x - 4, y + 2, scene(), opts())!;
    expect(d.pick.kind).toBe('edge');
    expect(d.vertex).toBe(true);
    expect(d.snap).toEqual([10, -10, 10]);
  });

  it('숨긴 윤곽선·단면에 잘린 부분은 고르지 않는다', () => {
    const [x, y] = at([3, -10, 10]);
    expect(pickScene(f, x, y + 3, scene(), opts({ edgeHidden: () => (i) => i === FRONT_TOP }))!.pick.kind).toBe('mesh');
    // x > 0 쪽을 잘라 내면 x = 3 자리의 앞 위 윤곽선은 없다(잘린 쪽) — 면도 잘려 아무것도 없다
    expect(pickScene(f, x, y + 3, scene(), opts({ clip: [1, 0, 0, 0] }))).toBeNull();
    // x < 0 쪽 자리는 그대로 윤곽선
    const [x2, y2] = at([-3, -10, 10]);
    expect(pickScene(f, x2, y2 + 3, scene(), opts({ clip: [1, 0, 0, 0] }))!.pick.kind).toBe('edge');
  });

  it('행렬(돌림·배율)이 걸린 그물도 세계 위치로 고른다', () => {
    const c = Math.cos(0.4), s = Math.sin(0.4), k = 0.5;
    const M = new Float64Array([c * k, 0, s * k, 0, 0, k, 0, 0, -s * k, 0, c * k, 0, 2, 0, -1, 1]);
    const m: Mesh3d = { ...box, id: '돌린 상자', matrix: M };
    const p = transformPoint(M, [0, -10, 10]);
    const [x, y] = at(p);
    const d = pickScene(f, x, y, scene(m), opts())!;
    expect(d.pick.kind).toBe('edge');
    expect(d.pick.index).toBe(FRONT_TOP);
    expect(Math.hypot(d.pick.point[0] - p[0], d.pick.point[1] - p[1], d.pick.point[2] - p[2])).toBeLessThan(1e-6);
    // BVH 질의 = 모두 훑기
    const viaBvh = segmentCandidates(f, m.edges!, buildBvh('segment', m.edges!), M, x, y, 30).map((h) => h.index).sort();
    const scan = segmentCandidates(f, m.edges!, null, M, x, y, 30).map((h) => h.index).sort();
    expect(viaBvh).toEqual(scan);
    expect(scan.length).toBeGreaterThan(1);
  });

  it('행렬 노름 위 한계', () => {
    expect(normBound3(new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 6, 7, 1]))).toBeCloseTo(1, 12);
    expect(normBound3(new Float64Array([2, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1]))).toBeGreaterThanOrEqual(3);
  });
});
