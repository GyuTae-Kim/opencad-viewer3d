/** 묶음 원점(origin, 큰 좌표 정밀도): 범위·모형 행렬·옮긴 프레임·고르기·강조 선분 모으기·격자 */
import { describe, expect, it } from 'vitest';
import { boxSphere, itemBounds, lineBounds, meshBounds, pointBounds, sceneBounds } from '../src/bounds';
import { buildBvh } from '../src/bvh';
import { type CameraState, computeFrame, defaultCamera, fitCamera, projectToScreen, screenRay, shiftFrame } from '../src/camera';
import { gridLines, gridSpec } from '../src/grid';
import { hasOrigin, mat4Mul, modelMatrix, placeMatrix, transformPoint } from '../src/math';
import { type ScenePickItems, pickScene } from '../src/scenepick';
import { segmentsById } from '../src/segments';
import { syntheticScene } from '../src/synth';
import type { Box3, LineSet3d, Scene3d } from '../src/types';

const O: [number, number, number] = [1e6, -5e5, 1e4];

const items = (s: Scene3d): ScenePickItems => ({ meshes: s.meshes, lines: s.lines, points: s.points ?? [] });
const shiftBox = (b: Box3, o: readonly number[]): Box3 => ({ min: [b.min[0] + o[0]!, b.min[1] + o[1]!, b.min[2] + o[2]!], max: [b.max[0] + o[0]!, b.max[1] + o[1]!, b.max[2] + o[2]!] });

describe('원점 범위', () => {
  it('그물·선분·점·장면 범위 = 원점 없는 범위 + 원점(행렬은 원점 뒤)', () => {
    const s0 = syntheticScene({ segments: 500, sphereSeg: 16 });
    const s1 = syntheticScene({ segments: 500, sphereSeg: 16, offset: O });
    // 원점 방식은 positions를 건드리지 않는다
    expect(s1.meshes.every((m, i) => m.origin && m.positions.every((v, k) => v === s0.meshes[i]!.positions[k]))).toBe(true);
    const near = (a: Box3, b: Box3): void => {
      for (let k = 0; k < 3; k++) {
        expect(a.min[k]).toBeCloseTo(b.min[k]!, 6);
        expect(a.max[k]).toBeCloseTo(b.max[k]!, 6);
      }
    };
    near(sceneBounds(s1), shiftBox(sceneBounds(s0), O));
    s1.meshes.forEach((m, i) => near(meshBounds(m), shiftBox(meshBounds(s0.meshes[i]!), O)));
    near(lineBounds(s1.lines[0]!), shiftBox(lineBounds(s0.lines[0]!), O));
    near(pointBounds(s1.points![0]!), shiftBox(pointBounds(s0.points![0]!), O));
    near(itemBounds(s1.meshes[2]!), meshBounds(s1.meshes[2]!));
    // 원점이 없으면 예전과 똑같다
    expect(meshBounds(s0.meshes[0]!)).toEqual({ min: [0, 0, 0], max: [120, 80, 40] });
  });

  it('모형 행렬 = matrix · T(origin), 원점이 없으면 matrix 그대로', () => {
    const M = placeMatrix([5, 6, 7], [0, 1, 1], 2);
    const m = modelMatrix(M, O)!;
    const p = [1.5, -2, 3];
    const a = transformPoint(m, p), b = transformPoint(M, [p[0]! + O[0], p[1]! + O[1], p[2]! + O[2]]);
    for (let k = 0; k < 3; k++) expect(a[k]).toBeCloseTo(b[k]!, 6);
    expect(modelMatrix(M, undefined)).toBe(M);
    expect(modelMatrix(M, [0, 0, 0])).toBe(M);
    expect(modelMatrix(undefined, undefined)).toBeUndefined();
    expect(hasOrigin([0, 0, 0])).toBe(false);
    expect(hasOrigin([0, 1e-9, 0])).toBe(true);
  });
});

describe('옮긴 프레임', () => {
  it('shiftFrame(f, o)에서 로컬 점 = f에서 세계 점(화면·깊이), 광선은 o만큼 옮겨진다', () => {
    const c: CameraState = { ...defaultCamera(), target: [O[0] + 3, O[1] - 2, O[2] + 1], distance: 50 };
    const f = computeFrame(c, 800, 600, { center: c.target, radius: 30 });
    const g = shiftFrame(f, O);
    const p = [4, -7, 2.5];
    const a = projectToScreen(g, p)!, b = projectToScreen(f, [p[0]! + O[0], p[1]! + O[1], p[2]! + O[2]])!;
    expect(a[0]).toBeCloseTo(b[0], 6);
    expect(a[1]).toBeCloseTo(b[1], 6);
    expect(a[2]).toBeCloseTo(b[2], 6);
    const r0 = screenRay(f, 300, 200), r1 = screenRay(g, 300, 200);
    for (let k = 0; k < 3; k++) {
      expect(r1.origin[k]! + O[k]!).toBeCloseTo(r0.origin[k]!, 4);
      expect(r1.dir[k]).toBeCloseTo(r0.dir[k]!, 9);
    }
    expect(shiftFrame(f, undefined)).toBe(f);
    expect(shiftFrame(f, [0, 0, 0])).toBe(f);
  });
});

describe('원점 고르기', () => {
  it('1e6대 장면을 원점으로 올리면 고른 것·점이 원점 0 장면 + 이동량과 같다(그물·선분·점)', () => {
    const s0 = syntheticScene({ segments: 3000, sphereSeg: 24 });
    const s1 = syntheticScene({ segments: 3000, sphereSeg: 24, offset: O });
    const b0 = sceneBounds(s0), b1 = sceneBounds(s1);
    const c0 = fitCamera({ ...defaultCamera() }, b0, 4 / 3);
    const c1: CameraState = { ...c0, target: [c0.target[0] + O[0], c0.target[1] + O[1], c0.target[2] + O[2]] };
    const f0 = computeFrame(c0, 800, 600, boxSphere(b0));
    const f1 = computeFrame(c1, 800, 600, boxSphere(b1));
    const cache = new Map<Float32Array, ReturnType<typeof buildBvh>>();
    const bvh = (kind: 'triangle' | 'segment' | 'point', p: Float32Array, i: Uint32Array | undefined): ReturnType<typeof buildBvh> => {
      let b = cache.get(p);
      if (!b) cache.set(p, (b = buildBvh(kind, p, i)));
      return b;
    };
    const kinds = new Set<string>();
    let hits = 0;
    for (let y = 60; y < 600; y += 45)
      for (let x = 60; x < 800; x += 55) {
        const a = pickScene(f0, x, y, items(s0), { tol: 6, occlude: true, bvh });
        const b = pickScene(f1, x, y, items(s1), { tol: 6, occlude: true, bvh });
        expect(!!b).toBe(!!a);
        if (!a || !b) continue;
        hits++;
        kinds.add(a.pick.kind);
        expect(b.pick.id).toBe(a.pick.id);
        expect(b.pick.kind).toBe(a.pick.kind);
        for (let k = 0; k < 3; k++) {
          expect(b.pick.point[k]! - O[k]!).toBeCloseTo(a.pick.point[k]!, 4);
          expect(b.snap[k]! - O[k]!).toBeCloseTo(a.snap[k]!, 4);
        }
      }
    expect(hits).toBeGreaterThan(30);
    expect(kinds.has('mesh')).toBe(true);
    expect(kinds.has('line')).toBe(true);
  });

  it('원점 장면과 같은 위치에 구워 넣은(float32) 장면은 1e6에서 어긋난다 — 원점 방식이 필요한 까닭', () => {
    const s = syntheticScene({ segments: 10, sphereSeg: 8, offset: O, bake: true });
    const raw = s.meshes[1]!.positions; // 구
    const s0 = syntheticScene({ segments: 10, sphereSeg: 8 });
    let maxErr = 0;
    for (let i = 0; i < raw.length; i++) maxErr = Math.max(maxErr, Math.abs(raw[i]! - O[i % 3]! - s0.meshes[1]!.positions[i]!));
    expect(maxErr).toBeGreaterThan(1e-3); // float32 간격(1e6에서 0.0625)만큼 반올림된다
  });
});

describe('원점 강조 선분·격자', () => {
  it('segmentsById: 묶음 원점은 더하고 base는 빼서 모은다', () => {
    const a: LineSet3d = { id: 'a', positions: new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0]), segmentIds: new Uint32Array([1, 2]), origin: [1e6, 0, 0] };
    const b: LineSet3d = { id: 'b', positions: new Float32Array([0, 0, 0, 0, 0, 2]), segmentIds: new Uint32Array([2]), origin: [1e6 + 5, 3, 0] };
    const out = segmentsById([a, b], [2], undefined, [1e6, 0, 0])!;
    expect([...out]).toEqual([1, 0, 0, 1, 1, 0, 5, 3, 0, 5, 3, 2]);
    // 원점도 base도 없으면 그대로
    const c: LineSet3d = { id: 'c', positions: new Float32Array([7, 8, 9, 1, 2, 3]), segmentIds: new Uint32Array([4]) };
    expect([...segmentsById([c], [4])!]).toEqual([7, 8, 9, 1, 2, 3]);
  });

  it('gridLines(g, origin) + origin = gridLines(g)', () => {
    const g = gridSpec({ min: [-30, 10, -5], max: [170, 90, 40] });
    const o = [70, 50, -5];
    const a = gridLines(g), b = gridLines(g, o);
    for (const k of ['major', 'minor', 'axisX', 'axisY'] as const) {
      expect(b[k].length).toBe(a[k].length);
      for (let i = 0; i < a[k].length; i++) expect(b[k][i]! + o[i % 3]!).toBeCloseTo(a[k][i]!, 4);
    }
    // 원점이 없으면 값이 똑같다
    expect(gridLines(g, null)).toEqual(a);
  });

  it('모형 행렬 곱하기: out을 주면 그 배열에 쓴다', () => {
    const A = placeMatrix([1, 2, 3], [0, 0, 1], 2), B = placeMatrix([4, 5, 6], [1, 0, 0], 1);
    const out = new Float64Array(16);
    expect(mat4Mul(A, B, out)).toBe(out);
    expect([...out]).toEqual([...mat4Mul(A, B)]);
  });
});
