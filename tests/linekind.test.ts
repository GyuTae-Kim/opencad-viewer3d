/** 그물을 선으로 그리는 규칙(0.7.1 Mesh3d.triangleEdges)과, 그 선택이 고르기·측정에 손대지 않는지 */
import { describe, expect, it } from 'vitest';
import { buildBvh } from '../src/bvh';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { type RenderMode, hasMeshEdges, meshLineKind } from '../src/renderer';
import { type ScenePickOptions, pickScene } from '../src/scenepick';
import { boxMesh, sphereMesh } from '../src/synth';
import type { LineSet3d, Mesh3d } from '../src/types';

const MODES: RenderMode[] = ['shaded', 'shadedEdges', 'wireframe', 'xray', 'hiddenLine', 'monochrome', 'noTexture'];
const box = boxMesh('상자', [-10, -10, -10], [10, 10, 10], [0.7, 0.7, 0.7, 1]);
const bare: Mesh3d = { ...box, id: '맨 상자', edges: undefined };
const kinds = (m: Mesh3d): Record<string, string | null> => Object.fromEntries(MODES.map((mode) => [mode, meshLineKind(m, mode)]));

describe('그물 선 그리기 규칙', () => {
  it('기본(triangleEdges 없음)은 0.7.0 그대로: 윤곽선이 없으면 와이어프레임·숨은 선에서만 삼각형 변', () => {
    const want = { shaded: null, shadedEdges: null, wireframe: 'triangles', xray: null, hiddenLine: 'triangles', monochrome: null, noTexture: null };
    expect(kinds(bare)).toEqual(want);
    expect(kinds({ ...bare, triangleEdges: true })).toEqual(want);
  });

  it('윤곽선이 있으면 음영 말고 모든 모드에서 윤곽선(triangleEdges와 상관없이)', () => {
    const want = { shaded: null, shadedEdges: 'edges', wireframe: 'edges', xray: 'edges', hiddenLine: 'edges', monochrome: 'edges', noTexture: 'edges' };
    expect(kinds(box)).toEqual(want);
    expect(kinds({ ...box, triangleEdges: false })).toEqual(want);
  });

  it('triangleEdges: false면 윤곽선이 없는 그물은 어느 모드에서도 선이 없다', () => {
    for (const mode of MODES) expect(meshLineKind({ ...bare, triangleEdges: false }, mode)).toBeNull();
    // 매끈한 닫힌 면(구 — 윤곽선 없음)도
    const s = sphereMesh('구', [0, 0, 0], 5, 16, 8, [1, 1, 1, 1]);
    expect(meshLineKind(s, 'hiddenLine')).toBe('triangles');
    expect(meshLineKind({ ...s, triangleEdges: false }, 'hiddenLine')).toBeNull();
    expect(meshLineKind({ ...s, triangleEdges: false }, 'wireframe')).toBeNull();
  });

  it('선분 하나(6값)가 안 되는 윤곽선은 없는 것과 같다(예전 꼼수 — 길이 0 선분 하나·빈 배열)', () => {
    expect(hasMeshEdges({ edges: new Float32Array(0) })).toBe(false);
    expect(hasMeshEdges({ edges: new Float32Array(5) })).toBe(false);
    expect(hasMeshEdges({ edges: new Float32Array(6) })).toBe(true);
    expect(hasMeshEdges({})).toBe(false);
    expect(meshLineKind({ ...bare, edges: new Float32Array(3) }, 'wireframe')).toBe('triangles');
    expect(meshLineKind({ ...bare, edges: new Float32Array(3), triangleEdges: false }, 'wireframe')).toBeNull();
    // 길이 0 선분(점 하나)은 선분이다 — 0.7.0의 SketchUp 꼼수는 이것을 숨겨야 했다. 이제는 triangleEdges: false로 둔다
    expect(meshLineKind({ ...bare, edges: new Float32Array(6) }, 'wireframe')).toBe('edges');
  });
});

describe('triangleEdges는 고르기·측정에 손대지 않는다', () => {
  const a = dirToAngles(VIEW_DIRS.front);
  const cam: CameraState = { ...defaultCamera(), yaw: a.yaw + 0.3, pitch: a.pitch + 0.2, target: [0, 0, 0], distance: 100, projection: 'perspective' };
  const f = computeFrame(cam, 400, 400, { center: [0, 0, 0], radius: 40 });
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
  // SketchUp 꼴: 모서리는 따로 선분 묶음
  const lines: LineSet3d[] = [{ id: '모서리', positions: box.edges! }];

  it('면·꼭짓점 붙잡기·선분 고르기 결과가 같다(음영·와이어프레임 가림 판정 모두)', () => {
    const pts: [number, number][] = [];
    // 상자가 보이는 화면 범위(가운데 둘레 약 100화소)를 촘촘히
    for (let i = 0; i < 15; i++) for (let j = 0; j < 15; j++) pts.push([130 + i * 10, 130 + j * 10]);
    // 꼭짓점 가까이도
    for (const p of [[10, -10, 10], [-10, -10, -10], [10, 10, 10]]) {
      const s = projectToScreen(f, p)!;
      pts.push([s[0] + 3, s[1] - 2]);
    }
    const key = (m: Mesh3d, occlude: boolean): string =>
      pts
        .map(([x, y]) => {
          const d = pickScene(f, x, y, { meshes: [m], lines, points: [] }, opts({ occlude }));
          return d ? `${d.pick.kind}:${d.pick.id}:${d.pick.index}:${d.pick.point.map((v) => v.toFixed(6))}:${d.snap.map((v) => v.toFixed(6))}:${d.vertex}` : '-';
        })
        .join('|');
    for (const occlude of [true, false]) {
      const base = key(bare, occlude);
      expect(base.split('|').filter((s) => s !== '-').length).toBeGreaterThan(20);
      expect(key({ ...bare, triangleEdges: false }, occlude)).toBe(base);
    }
  });
});
