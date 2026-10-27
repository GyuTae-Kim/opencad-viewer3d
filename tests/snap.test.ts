/** 0.8.0 측정 붙잡기: 선분·윤곽선 가운데 점(midpoints), 붙잡은 종류(snapKind), 앱 붙잡기 점 고르기(chooseMeasureSnap) */
import { describe, expect, it } from 'vitest';
import { buildBvh } from '../src/bvh';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { snapToNearestKind } from '../src/pick';
import { type ScenePickOptions, pickScene } from '../src/scenepick';
import { type SnapCandidate, chooseMeasureSnap } from '../src/snap';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, PointSet3d } from '../src/types';

const a = dirToAngles(VIEW_DIRS.front);
const cam: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [0, 0, 0], distance: 100, projection: 'perspective' };
const f = computeFrame(cam, 400, 400, { center: [0, 0, 0], radius: 40 });
const box = boxMesh('상자', [-10, -10, -10], [10, 10, 10], [0.7, 0.7, 0.7, 1]);
// 앞 뷰에서 화면 가로로 놓인 선분 하나(y = −20 — 상자 앞)
const seg: LineSet3d = { id: '선', positions: new Float32Array([-15, -20, 15, 15, -20, 15]) };
const dot: PointSet3d = { id: '점', positions: new Float32Array([-15, -20, -15]) };
const bvhs = new Map<Float32Array, ReturnType<typeof buildBvh>>();
const opts = (o: Partial<ScenePickOptions> = {}): ScenePickOptions => ({
  tol: 6,
  occlude: true,
  bvh: (kind, positions, indices) => {
    let b = bvhs.get(positions);
    if (!b) bvhs.set(positions, (b = buildBvh(kind, positions, indices)));
    return b;
  },
  ...o,
});
const at = (p: readonly number[]): [number, number] => {
  const s = projectToScreen(f, p)!;
  return [s[0], s[1]];
};
const items = (o: { meshes?: Mesh3d[]; lines?: LineSet3d[]; points?: PointSet3d[] } = {}) => ({ meshes: o.meshes ?? [box], lines: o.lines ?? [seg], points: o.points ?? [] });

describe('가운데 점 붙잡기(midpoints)', () => {
  it('선분: 가운데 가까이면 midpoint, 끝 가까이면 endpoint, 끄면 0.7.2처럼 고른 점 그대로', () => {
    const [mx, my] = at([0, -20, 15]);
    const on = pickScene(f, mx + 3, my + 2, items(), opts({ midpoints: true }))!;
    expect(on.pick.kind).toBe('line');
    expect(on.snapKind).toBe('midpoint');
    expect(on.vertex).toBe(true);
    expect(on.snap[0]).toBeCloseTo(0, 9);
    expect(on.snap[2]).toBeCloseTo(15, 9);
    const off = pickScene(f, mx + 3, my + 2, items(), opts())!;
    expect(off.snapKind).toBeNull();
    expect(off.vertex).toBe(false);
    expect(off.snap).toEqual(off.pick.point);
    const [ex, ey] = at([15, -20, 15]);
    const end = pickScene(f, ex - 4, ey, items(), opts({ midpoints: true }))!;
    expect(end.snapKind).toBe('endpoint');
    expect(end.snap[0]).toBeCloseTo(15, 6);
    // 끄면 같은 자리에서도 끝점 붙잡기는 그대로(종류는 endpoint)
    expect(pickScene(f, ex - 4, ey, items(), opts())!.snapKind).toBe('endpoint');
  });

  it('가운데 점은 끝점보다 2화소(MIDPOINT_YIELD_PX) 넘게 가까울 때만 — 화면에서 아주 짧은 선분은 끝점', () => {
    const short: LineSet3d = { id: '짧은 선', positions: new Float32Array([0, -20, 0, 0.02, -20, 0]) };
    const [x, y] = at([0.01, -20, 0]);
    const d = pickScene(f, x, y + 1, items({ meshes: [], lines: [short] }), opts({ midpoints: true }))!;
    expect(d.snapKind).toBe('endpoint');
  });

  it('윤곽선(edges)도: 앞 위 모서리 가운데 → midpoint, 단면에 잘린 가운데 점은 붙잡지 않는다', () => {
    const [x, y] = at([0, -10, 10]);
    const d = pickScene(f, x + 2, y + 3, items({ lines: [] }), opts({ edges: true, midpoints: true }))!;
    expect(d.pick.kind).toBe('edge');
    expect(d.snapKind).toBe('midpoint');
    expect(d.snap[0]).toBeCloseTo(0, 6);
    expect(d.snap[1]).toBeCloseTo(-10, 6);
    expect(d.snap[2]).toBeCloseTo(10, 6);
    // x > −2 쪽을 잘라 내면 가운데 점(x = 0)은 잘린 쪽 — 고른 점은 남는 쪽(x ≤ −2)에서
    const [lx, ly] = at([-3, -10, 10]);
    const c = pickScene(f, lx, ly + 3, items({ lines: [] }), opts({ edges: true, midpoints: true, clip: [1, 0, 0, 2] }))!;
    expect(c.pick.kind).toBe('edge');
    expect(c.snapKind).not.toBe('midpoint');
  });

  it('붙잡은 종류: 점 묶음의 점·그물 꼭짓점은 vertex, 잘린 면·면 위 아무 데는 null', () => {
    const [px, py] = at([-15, -20, -15]);
    expect(pickScene(f, px + 1, py, items({ points: [dot] }), opts())!.snapKind).toBe('vertex');
    const [cx, cy] = at([10, -10, -10]);
    const corner = pickScene(f, cx - 5, cy - 5, items({ lines: [] }), opts())!;
    expect(corner.pick.kind).toBe('mesh');
    expect(corner.snapKind).toBe('vertex');
    const [fx, fy] = at([0, -10, 0]);
    const face = pickScene(f, fx, fy, items({ lines: [] }), opts())!;
    expect(face.snapKind).toBeNull();
  });
});

describe('snapToNearestKind', () => {
  it('허용 거리 안 가장 가까운 것, 같으면 앞의 것, 없으면 null', () => {
    const [x, y] = at([0, 0, 0]);
    const c = [
      { p: [0, 0, 0.1] as [number, number, number], kind: 'endpoint' },
      { p: [0, 0, 0.1] as [number, number, number], kind: 'midpoint' },
      { p: [0, 0, 5] as [number, number, number], kind: 'center' },
    ];
    expect(snapToNearestKind(f, c, x, y, 10)!.kind).toBe('endpoint');
    expect(snapToNearestKind(f, c.slice(1), x, y, 10)!.kind).toBe('midpoint');
    expect(snapToNearestKind(f, [c[2]!], x, y, 3)).toBeNull();
  });
});

describe('앱 붙잡기 점 고르기(chooseMeasureSnap)', () => {
  const all = (): boolean => true;
  const [x, y] = at([0, -10, 0]);

  it('붙잡기 거리 안의 앱 점은 아무것도 고르지 않은 자리(base null)에서도 붙잡는다', () => {
    const r = chooseMeasureSnap(f, x + 3, y, 10, null, [{ p: [0, -10, 0], kind: 'center' }], all)!;
    expect(r).toEqual({ p: [0, -10, 0], vertex: true, kind: 'center' });
    expect(chooseMeasureSnap(f, x + 30, y, 10, null, [{ p: [0, -10, 0], kind: 'center' }], all)).toBeNull();
  });

  it('고른 점이 붙잡은 끝점보다 가까운 앱 점이 이기고, 같은 거리면 고른 점(끝점)이 이긴다', () => {
    const [ex, ey] = at([1, -10, 0]);
    const base = { p: [1, -10, 0] as [number, number, number], kind: 'endpoint' as const };
    const near = chooseMeasureSnap(f, x + 1, y, 10, base, [{ p: [0, -10, 0], kind: 'center' }], all)!;
    expect(near.kind).toBe('center');
    const tie = chooseMeasureSnap(f, ex, ey, 10, base, [{ p: [1, -10, 0], kind: 'center' }], all)!;
    expect(tie.kind).toBe('endpoint');
  });

  it('보이지 않는 점은 건너뛰고, 보이는지는 지금 것보다 가까운 후보에만 묻는다', () => {
    const asked: string[] = [];
    const cands: SnapCandidate[] = [
      { p: [0, -10, 0], kind: 'center', id: '가림' },
      { p: [0.2, -10, 0], kind: 'point', id: '보임' },
      { p: [3, -10, 0], kind: 'midpoint', id: '멂' },
    ];
    const r = chooseMeasureSnap(f, x, y, 40, null, cands, (_p, _x, _y, id) => {
      asked.push(id!);
      return id !== '가림';
    })!;
    expect(r.kind).toBe('point');
    expect(asked).toEqual(['가림', '보임']);
  });

  it('붙잡지 않은 고른 점은 앱 점이 없으면 그대로(vertex false, kind null)', () => {
    const base = { p: [0, -10, 0] as [number, number, number], kind: null };
    expect(chooseMeasureSnap(f, x, y, 10, base, [], all)).toEqual({ p: [0, -10, 0], vertex: false, kind: null });
  });

  it('원근에서 눈 뒤·가까운 면 앞의 점은 뺀다', () => {
    const behind: SnapCandidate = { p: [f.eye[0], f.eye[1] - 5, f.eye[2]], kind: 'center' };
    expect(chooseMeasureSnap(f, 200, 200, 1e9, null, [behind], all)).toBeNull();
  });
});
