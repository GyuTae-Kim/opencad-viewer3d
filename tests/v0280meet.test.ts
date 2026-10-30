/**
 * 0.28.0 끌어온 점의 나란함·수직 선이 다른 것과 만나는 점(순수 trackDirMeetSnap — 뷰어 측정 붙잡기에는 아직 넣지 않았다):
 * 다른 직선(첫 점 축·다른 끌어온 점의 축 — 부르는 쪽이 준다)·선분·커서 아래 면과 3D로 만나는 점, 빼는 것(만나지 않는 직선·지나는 점 자리·선분 끝점·
 * 가림·끌어온 점 둘레·첫 점과 같은 끌어온 점), 차례(가까운 것)
 * 화면 좌표로 가리킬 때는 만나는 점에서 조금 옆(0.2~0.4화소)을 가리킨다.
 */
import { describe, expect, it } from 'vitest';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen, screenRay, viewDepth, worldPerPixel } from '../src/camera';
import type { V3 } from '../src/math';
import { type TrackFaceHit, type TrackSegment, trackDirMeetSnap, trackDirSnap } from '../src/track';

const near = (a: readonly number[], b: readonly number[], tol = 1e-9): boolean => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) <= tol;
const s2 = Math.SQRT1_2;

/**
 * 끌어온 점 P = (30, 20, 0), 기준 선분 (0, 0, 0) → (10, 10, 0): 안내는 나란함 (√½, √½, 0)과 P에서 기준 직선으로 내린 수직 (−√½, √½, 0)
 * (축을 비친 방향은 그 수직과 같은 선이거나 Z축이라 뺀다). 첫 점 A = (0, 50, 0), 다른 끌어온 점 Q = (80, 0, 0)
 */
const P: V3 = [30, 20, 0];
const SEG: [V3, V3] = [
  [0, 0, 0],
  [10, 10, 0],
];
const A: V3 = [0, 50, 0];
const Q: V3 = [80, 0, 0];
const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0];

describe('trackDirMeetSnap(0.28.0 — 끌어온 점의 나란함·수직 선이 다른 직선·선분·면과 만나는 점)', () => {
  const iso = dirToAngles([0.6, -1, 1.4]);
  const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [40, 30, 0], distance: 260, projection: 'perspective' };
  const f = computeFrame(cam, 800, 600, { center: [40, 30, 0], radius: 70 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0] + 0.3, s[1] - 0.2];
  };
  const seg = (a: V3, b: V3): TrackSegment => ({ a, b, wpp: worldPerPixel(f, viewDepth(f, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2])) });
  const lines = [
    { from: A, dir: X, tag: 'A-x' },
    { from: A, dir: Y, tag: 'A-y' },
    { from: Q, dir: X, tag: 'Q-x' },
    { from: Q, dir: Y, tag: 'Q-y' },
  ];

  it('첫 점 축·다른 끌어온 점의 축과 만나는 점: 나란한 선 × A의 X축 (60, 50, 0), × Q의 Y축 (80, 70, 0), 수직인 선 × Q의 X축 (50, 0, 0)', () => {
    const cases: [V3, string, 'parallel' | 'perpendicular'][] = [
      [[60, 50, 0], 'A-x', 'parallel'],
      [[0, -10, 0], 'A-y', 'parallel'],
      [[80, 70, 0], 'Q-y', 'parallel'],
      [[10, 0, 0], 'Q-x', 'parallel'],
      [[50, 0, 0], 'Q-x', 'perpendicular'],
    ];
    for (const [want, tag, kind] of cases) {
      const [x, y] = at(want);
      const r = trackDirMeetSnap(f, [P], SEG, x, y, 10, { lines })!;
      expect(r).toMatchObject({ kind, from: P, meet: { kind: 'line', tag } });
      expect(near(r.p, want)).toBe(true);
      expect(r.distPx).toBeLessThan(1);
      // 찍는 점의 축에 수직인 좌표는 그 축 직선 값 그대로(X축이면 y·z, Y축이면 x·z)
      const L = lines.find((l) => l.tag === tag)!;
      if (L.dir === X) expect([r.p[1], r.p[2]]).toEqual([L.from[1], L.from[2]]);
      else expect([r.p[0], r.p[2]]).toEqual([L.from[0], L.from[2]]);
      // 그 점은 끌어온 점의 안내 선 위
      const d = r.dir;
      const t = (r.p[0] - P[0]) * d[0] + (r.p[1] - P[1]) * d[1] + (r.p[2] - P[2]) * d[2];
      expect(near(r.p, [P[0] + d[0] * t, P[1] + d[1] * t, P[2] + d[2] * t], 1e-9)).toBe(true);
    }
  });

  it('빼는 것: 만나지 않는 직선(높이가 다르다), 교차가 그 직선이 지나는 점 자리(수직인 선이 A를 지난다), 끌어온 점 둘레, 첫 점과 같은 끌어온 점, 기준 선분 없음', () => {
    const [x, y] = at([60, 50, 0]);
    // A를 10 위로 올린 X축: 화면에서는 가까워도 3D로 만나지 않는다
    expect(trackDirMeetSnap(f, [P], SEG, x, y, 10, { lines: [{ from: [0, 50, 10], dir: X }] })).toBeNull();
    // 수직인 선은 A 자리 (0, 50, 0)에서 A의 X축과 만난다 — 그 직선이 지나는 점이라 뺀다(점 붙잡기가 맡는다)
    const [ax, ay] = at(A);
    expect(trackDirMeetSnap(f, [P], SEG, ax, ay, 10, { lines: [lines[0]!] })).toBeNull();
    const [px, py] = at(P);
    expect(trackDirMeetSnap(f, [P], SEG, px + 3, py, 10, { lines })).toBeNull();
    expect(trackDirMeetSnap(f, [P], SEG, x, y, 10, { lines, skip: P })).toBeNull();
    expect(trackDirMeetSnap(f, [P], null, x, y, 10, { lines })).toBeNull();
    expect(trackDirMeetSnap(f, [], SEG, x, y, 10, { lines })).toBeNull();
    // 먼 커서·주지 않은 것
    expect(trackDirMeetSnap(f, [P], SEG, x + 40, y + 30, 10, { lines })).toBeNull();
    expect(trackDirMeetSnap(f, [P], SEG, x, y, 10)).toBeNull();
    // 꼬리표가 없으면 meet에 tag 열쇠가 없다
    const r = trackDirMeetSnap(f, [P], SEG, x, y, 10, { lines: [{ from: A, dir: [2, 0, 0] }] })!;
    expect(r.meet).toEqual({ kind: 'line', line: 0 });
  });

  it('선분과 만나는 점(trackEdgeSnap과 같은 규칙): 선분 안이면 그 선분 객체, 끝점·가린 점은 뺀다', () => {
    const s1 = seg([40, 20, 0], [40, 60, 0]);
    const [x, y] = at([40, 30, 0]);
    const r = trackDirMeetSnap(f, [P], SEG, x, y, 10, { segs: [s1] })!;
    expect(r).toMatchObject({ kind: 'parallel', meet: { kind: 'edge' } });
    expect(r.meet.kind === 'edge' && r.meet.seg).toBe(s1);
    expect(near(r.p, [40, 30, 0], 1e-6)).toBe(true);
    expect(trackDirMeetSnap(f, [P], SEG, x, y, 10, { segs: [s1], visible: () => false })).toBeNull();
    // 나란한 선이 (50, 40, 0)에서 선분 끝점을 지난다 — 끝점 붙잡기가 맡는다
    const s2e = seg([50, 40, 0], [60, 40, 0]);
    const [ex, ey] = at([50, 40, 0]);
    expect(trackDirMeetSnap(f, [P], SEG, ex, ey, 10, { segs: [s2e] })).toBeNull();
    // 단면에서 잘린 쪽
    expect(trackDirMeetSnap(f, [P], SEG, x, y, 10, { segs: [{ ...s1, keep: () => false }] })).toBeNull();
  });

  it('면을 뚫는 점(axisFaceSnap과 같은 규칙): 공중의 끌어온 점에서 기준 직선으로 내린 수직이 바닥 면 z = 0을 뚫는 자리', () => {
    const P2: V3 = [30, 20, 15];
    // 내린 수직의 발 (25, 25, 0)이 바닥 면 위
    const floor = (sx: number, sy: number): TrackFaceHit | null => {
      const ray = screenRay(f, sx, sy);
      if (Math.abs(ray.dir[2]) < 1e-12) return null;
      const t = -ray.origin[2] / ray.dir[2];
      return t > 0 ? { point: [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t, 0], normal: [0, 0, 1], origin: [0, 0, 0] } : null;
    };
    const [x, y] = at([25, 25, 0]);
    const under = floor(x, y)!;
    const r = trackDirMeetSnap(f, [P2], SEG, x, y, 10, { under, hitAt: floor })!;
    expect(r).toMatchObject({ kind: 'perpendicular', from: P2, meet: { kind: 'face' } });
    expect(near(r.p, [25, 25, 0], 1e-6)).toBe(true);
    // 커서 아래 면이 없거나 hitAt이 없으면 면을 보지 않는다
    expect(trackDirMeetSnap(f, [P2], SEG, x, y, 10, { under: null, hitAt: floor })).toBeNull();
    expect(trackDirMeetSnap(f, [P2], SEG, x, y, 10, { under })).toBeNull();
    // 면 위에 놓인 끌어온 점의 안내는 면과 나란해 뚫지 않는다
    const [qx, qy] = at([60, 50, 0]);
    expect(trackDirMeetSnap(f, [P], SEG, qx, qy, 10, { under: floor(qx, qy)!, hitAt: floor })).toBeNull();
  });

  it('차례: 가까운 것(같은 자리면 직선 → 선분 → 면 차례로 앞의 것), 끌어온 점 여럿은 앞 점부터. 안내 선 위 점(trackDirSnap)과 같은 선 위', () => {
    // A의 X축과 선분이 같은 자리 (60, 50, 0)에서 나란한 선과 만난다: 직선이 먼저
    const sAt = seg([60, 40, 0], [60, 70, 0]);
    const [x, y] = at([60, 50, 0]);
    const r = trackDirMeetSnap(f, [P], SEG, x, y, 10, { lines: [lines[0]!], segs: [sAt] })!;
    expect(r.meet.kind).toBe('line');
    expect(trackDirMeetSnap(f, [P], SEG, x, y, 10, { segs: [sAt] })!.meet.kind).toBe('edge');
    // 끌어온 점 둘: 뒤 점(R)의 나란한 선도 A의 X축과 만나지만 다른 자리 — 커서에 가까운 쪽
    const R: V3 = [50, 20, 0];
    const [rx, ry] = at([80, 50, 0]);
    expect(trackDirMeetSnap(f, [P, R], SEG, rx, ry, 10, { lines: [lines[0]!] })).toMatchObject({ from: R, kind: 'parallel' });
    expect(trackDirMeetSnap(f, [P, R], SEG, x, y, 10, { lines: [lines[0]!] })).toMatchObject({ from: P });
    // 같은 자리 trackDirSnap(안내 선 위 커서에 가까운 점)도 그 선 위다
    const d = trackDirSnap(f, [P], SEG, x, y, 10)!;
    expect(d.kind).toBe('parallel');
    expect(near(d.dir, [s2, s2, 0], 1e-12)).toBe(true);
  });
});
