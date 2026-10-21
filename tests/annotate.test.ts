/** 앱 측정 덧그림 모양·글, 화면 점 가림 깊이 */
import { describe, expect, it } from 'vitest';
import { ARC_STEPS, CIRCLE_STEPS, angleAt, annotationGeometry, annotationText } from '../src/annotate';
import { buildBvh } from '../src/bvh';
import { type CameraState, VIEW_DIRS, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { occludingDepth } from '../src/scenepick';
import { boxMesh } from '../src/synth';

const fmt = (v: number): string => v.toFixed(2);

describe('덧그림 모양', () => {
  it('거리: 선분 하나, 두 점, 가운데 글자, 값 = 길이', () => {
    const g = annotationGeometry({ kind: 'distance', a: [0, 0, 0], b: [3, 4, 0] })!;
    expect(g.segs).toEqual([0, 0, 0, 3, 4, 0]);
    expect(g.dots).toEqual([
      [0, 0, 0],
      [3, 4, 0],
    ]);
    expect(g.labelAt).toEqual([1.5, 2, 0]);
    expect(g.value).toBe(5);
    expect(annotationText({ kind: 'distance', a: [0, 0, 0], b: [3, 4, 0] }, g, fmt, 'mm')).toEqual(['5.00 mm']);
  });

  it('각: 두 팔 + 호(꼭짓점 둘레, 짧은 팔 0.3배), 값 = 라디안', () => {
    const an = { kind: 'angle' as const, a: [0, 0, 0], b: [10, 0, 0], c: [0, 20, 0] };
    const g = annotationGeometry(an)!;
    expect(g.value).toBeCloseTo(Math.PI / 2, 12);
    expect(g.segs.length).toBe((2 + ARC_STEPS) * 6);
    // 호 점은 모두 꼭짓점에서 3(= 10 × 0.3) 떨어진다
    for (let i = 12; i < g.segs.length; i += 3) expect(Math.hypot(g.segs[i]!, g.segs[i + 1]!, g.segs[i + 2]!)).toBeCloseTo(3, 9);
    // 글자는 호 가운데(45°)
    expect(g.labelAt[0]).toBeCloseTo(3 * Math.SQRT1_2, 9);
    expect(g.labelAt[1]).toBeCloseTo(3 * Math.SQRT1_2, 9);
    expect(annotationText(an, g, fmt, 'mm')).toEqual(['90.0°']);
    expect(angleAt([0, 0, 0], [1, 0, 0], [-1, 1e-12, 0])).toBeCloseTo(Math.PI, 9);
    expect(angleAt([0, 0, 0], [0, 0, 0], [1, 0, 0])).toBe(0);
  });

  it('반지름: 중심–원 위 점, normal을 주면 원 전체(모든 점이 반지름 위)', () => {
    const g = annotationGeometry({ kind: 'radius', a: [1, 1, 1], b: [4, 1, 5] })!;
    expect(g.value).toBe(5);
    expect(g.segs.length).toBe(6);
    const c = annotationGeometry({ kind: 'radius', a: [0, 0, 0], b: [5, 0, 0], normal: [0, 0, 2] })!;
    expect(c.segs.length).toBe((1 + CIRCLE_STEPS) * 6);
    for (let i = 6; i < c.segs.length; i += 3) {
      expect(Math.hypot(c.segs[i]!, c.segs[i + 1]!)).toBeCloseTo(5, 9);
      expect(c.segs[i + 2]).toBeCloseTo(0, 12);
    }
    expect(annotationText({ kind: 'radius', a: [0, 0, 0], b: [5, 0, 0] }, c, fmt, '')).toEqual(['R 5.00']);
  });

  it('점·글 지정·빈 글·잘못된 점', () => {
    const g = annotationGeometry({ kind: 'point', a: [1, 2, 3] })!;
    expect(g.segs).toEqual([]);
    expect(annotationText({ kind: 'point', a: [1, 2, 3] }, g, fmt, 'mm')).toEqual(['X 1.00  Y 2.00  Z 3.00']);
    expect(annotationText({ kind: 'point', a: [1, 2, 3], label: '구멍 A\nØ6' }, g, fmt, 'mm')).toEqual(['구멍 A', 'Ø6']);
    expect(annotationText({ kind: 'point', a: [1, 2, 3], label: '' }, g, fmt, 'mm')).toEqual([]);
    expect(annotationGeometry({ kind: 'distance', a: [0, 0, 0] })).toBeNull();
    expect(annotationGeometry({ kind: 'angle', a: [0, 0, 0], b: [1, 0, 0] })).toBeNull();
    expect(annotationGeometry({ kind: 'point', a: [NaN, 0, 0] })).toBeNull();
  });
});

describe('가림 깊이', () => {
  it('앞 뷰에서 상자 앞면까지의 깊이, 상자 밖은 Infinity, 단면 뒤는 잘린 면', () => {
    const a = dirToAngles(VIEW_DIRS.front);
    const cam: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [0, 0, 0], distance: 100, projection: 'perspective' };
    const f = computeFrame(cam, 400, 400, { center: [0, 0, 0], radius: 30 });
    const box = boxMesh('상자', [-10, -10, -10], [10, 10, 10], [1, 1, 1, 1]);
    const items = { meshes: [box], lines: [], points: [] };
    const bvh = (): ReturnType<typeof buildBvh> => buildBvh('triangle', box.positions, box.indices);
    const at = projectToScreen(f, [0, -10, 0])!;
    // 눈은 (0, −100, 0): 앞면(y = −10)까지 깊이 90
    expect(occludingDepth(f, at[0], at[1], items, { bvh })).toBeCloseTo(90, 6);
    expect(occludingDepth(f, 5, 5, items, { bvh })).toBe(Infinity);
    // y > −5 쪽을 잘라 내면(앞면이 남음) 그대로 90, y < 0 쪽을 남기는 평면 y = −20이면 상자 전체가 잘린다
    expect(occludingDepth(f, at[0], at[1], items, { bvh, clip: [0, 1, 0, 5] })).toBeCloseTo(90, 6);
    expect(occludingDepth(f, at[0], at[1], items, { bvh, clip: [0, 1, 0, 20] })).toBe(Infinity);
    // 반투명 그물은 가리지 않는다
    expect(occludingDepth(f, at[0], at[1], { meshes: [{ ...box, color: [1, 1, 1, 0.5] }], lines: [], points: [] }, { bvh })).toBe(Infinity);
    // 앞면 쪽을 잘라 내고(y < 0 남김이 아니라 y > 0 남김: −y 법선) 닫힌 그물 채우기면 잘린 면(y = 0)까지 100
    expect(occludingDepth(f, at[0], at[1], items, { bvh, clip: [0, -1, 0, 0], caps: () => true })).toBeCloseTo(100, 6);
  });
});
