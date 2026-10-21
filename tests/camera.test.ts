/** 3D 카메라: 기저·표준 뷰 방향·행렬·전체 보기·궤도·이동·확대가 화면에서 약속을 지키는지 */
import { describe, expect, it } from 'vitest';
import {
  type CameraState,
  type ViewName,
  VIEW_DIRS,
  basisFromAngles,
  cameraEye,
  computeFrame,
  defaultCamera,
  dirToAngles,
  fitCamera,
  lerpCamera,
  orbitCamera,
  panCamera,
  projectToScreen,
  rayAtDepth,
  screenRay,
  viewCamera,
  viewDepth,
  wrapAngle,
  zoomCamera,
} from '../src/camera';
import type { Box3 } from '../src/types';
import { boxCorners, boxSphere } from '../src/bounds';
import { cross, dot, length, normalize, sub, transformPoint } from '../src/math';

const close = (a: readonly number[], b: readonly number[], eps = 1e-9): void => {
  expect(a.length).toBe(b.length);
  a.forEach((v, i) => expect(Math.abs(v - b[i]!)).toBeLessThan(eps));
};

const box: Box3 = { min: [-10, 5, 0], max: [30, 25, 8] };
const sphere = boxSphere(box);

function cam(view: ViewName, projection: CameraState['projection'] = 'perspective'): CameraState {
  const a = dirToAngles(VIEW_DIRS[view]);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, projection };
}

describe('카메라 기저', () => {
  it('직교·오른손(right × up = back)', () => {
    for (const yaw of [-3, -1.2, 0, 0.4, 2.9])
      for (const pitch of [-Math.PI / 2, -0.7, 0, 0.3, Math.PI / 2]) {
        const b = basisFromAngles(yaw, pitch);
        expect(length(b.right)).toBeCloseTo(1, 12);
        expect(length(b.up)).toBeCloseTo(1, 12);
        expect(length(b.back)).toBeCloseTo(1, 12);
        expect(dot(b.right, b.up)).toBeCloseTo(0, 12);
        expect(dot(b.up, b.back)).toBeCloseTo(0, 12);
        close(cross(b.right, b.up), b.back, 1e-12);
      }
  });

  it('표준 뷰: 화면 오른쪽·위가 CAD 관례와 같다', () => {
    const expectView = (v: ViewName, right: number[], up: number[]): void => {
      const a = dirToAngles(VIEW_DIRS[v]);
      const b = basisFromAngles(a.yaw, a.pitch);
      close(b.back, normalize(VIEW_DIRS[v]), 1e-12);
      close(b.right, right, 1e-12);
      close(b.up, up, 1e-12);
    };
    expectView('front', [1, 0, 0], [0, 0, 1]);
    expectView('back', [-1, 0, 0], [0, 0, 1]);
    expectView('right', [0, 1, 0], [0, 0, 1]);
    expectView('left', [0, -1, 0], [0, 0, 1]);
    expectView('top', [1, 0, 0], [0, 1, 0]);
    expectView('bottom', [1, 0, 0], [0, -1, 0]);
  });

  it('등각 뷰: 눈 방향과 Z 위', () => {
    for (const v of ['seIso', 'swIso', 'neIso', 'nwIso'] as const) {
      const a = dirToAngles(VIEW_DIRS[v]);
      const b = basisFromAngles(a.yaw, a.pitch);
      close(b.back, normalize(VIEW_DIRS[v]), 1e-12);
      expect(b.up[2]).toBeGreaterThan(0.8);
      expect(b.right[2]).toBeCloseTo(0, 12);
      expect((a.pitch * 180) / Math.PI).toBeCloseTo(35.26439, 4);
    }
    // 남동 등각: +X는 오른쪽 아래, +Y는 오른쪽 위
    const a = dirToAngles(VIEW_DIRS.seIso);
    const b = basisFromAngles(a.yaw, a.pitch);
    expect(dot([1, 0, 0], b.right)).toBeGreaterThan(0);
    expect(dot([1, 0, 0], b.up)).toBeLessThan(0);
    expect(dot([0, 1, 0], b.right)).toBeGreaterThan(0);
    expect(dot([0, 1, 0], b.up)).toBeGreaterThan(0);
  });

  it('각도 감싸기', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(0.5 + Math.PI * 4)).toBeCloseTo(0.5, 12);
  });
});

describe('보기 행렬', () => {
  it('눈은 원점, 대상점은 −Z로 distance 앞', () => {
    const c: CameraState = { ...cam('seIso'), target: [3, -2, 7], distance: 50 };
    const f = computeFrame(c, 800, 600, sphere);
    close(transformPoint(f.view, cameraEye(c)), [0, 0, 0], 1e-9);
    close(transformPoint(f.view, c.target), [0, 0, -50], 1e-9);
  });

  it('대상점은 화면 한가운데(원근·평행)', () => {
    for (const p of ['perspective', 'orthographic'] as const) {
      const c: CameraState = { ...cam('neIso', p), target: [10, 15, 4], distance: 80 };
      const f = computeFrame(c, 640, 480, sphere);
      const s = projectToScreen(f, c.target)!;
      close([s[0], s[1]], [320, 240], 1e-6);
      expect(s[2]).toBeCloseTo(80, 9);
    }
  });

  it('위 뷰: +X는 화면 오른쪽, +Y는 화면 위', () => {
    const c: CameraState = { ...cam('top', 'orthographic'), target: [0, 0, 0], distance: 10 };
    const f = computeFrame(c, 400, 400, { center: [0, 0, 0], radius: 5 });
    const o = projectToScreen(f, [0, 0, 0])!;
    const x = projectToScreen(f, [1, 0, 0])!;
    const y = projectToScreen(f, [0, 1, 0])!;
    expect(x[0]).toBeGreaterThan(o[0]);
    expect(x[1]).toBeCloseTo(o[1], 9);
    expect(y[1]).toBeLessThan(o[1]);
    expect(y[0]).toBeCloseTo(o[0], 9);
  });

  it('가까운·먼 면이 장면 구를 감싼다', () => {
    const c = fitCamera(cam('seIso'), box, 4 / 3);
    const f = computeFrame(c, 800, 600, sphere);
    for (const p of boxCorners(box)) {
      const d = viewDepth(f, p);
      expect(d).toBeGreaterThanOrEqual(f.near);
      expect(d).toBeLessThanOrEqual(f.far);
    }
  });

  it('화면 광선은 투영한 점을 지난다', () => {
    for (const p of ['perspective', 'orthographic'] as const) {
      const c = fitCamera(cam('swIso', p), box, 1.5);
      const f = computeFrame(c, 900, 600, sphere);
      for (const w of [
        [0, 10, 3],
        [25, 20, 8],
        [-10, 5, 0],
      ]) {
        const s = projectToScreen(f, w)!;
        const r = screenRay(f, s[0], s[1]);
        const rel = sub(w, r.origin);
        const along = dot(rel, r.dir);
        const perp = length(sub(rel, r.dir.map((v) => v * along)));
        expect(perp).toBeLessThan(1e-6);
        // 같은 깊이 면과 만나는 점 = 원래 점
        close(rayAtDepth(f, r, s[2]), w, 1e-6);
      }
    }
  });
});

describe('전체 보기', () => {
  const ndcOf = (c: CameraState, w: number, h: number): number[][] => {
    const f = computeFrame(c, w, h, sphere);
    return boxCorners(box).map((p) => {
      const s = projectToScreen(f, p)!;
      return [(s[0] / w) * 2 - 1, 1 - (s[1] / h) * 2];
    });
  };
  for (const p of ['perspective', 'orthographic'] as const)
    for (const v of ['top', 'front', 'right', 'seIso', 'nwIso', 'bottom'] as ViewName[])
      for (const [w, h] of [
        [800, 600],
        [400, 900],
      ] as const)
        it(`${p} ${v} ${w}×${h}: 모든 꼭짓점이 화면 안, 여유는 크지 않음`, () => {
          const c = viewCamera({ ...defaultCamera(), projection: p }, v, box, w / h);
          const n = ndcOf(c, w, h);
          let m = 0;
          for (const [x, y] of n) {
            expect(Math.abs(x!)).toBeLessThanOrEqual(1 + 1e-9);
            expect(Math.abs(y!)).toBeLessThanOrEqual(1 + 1e-9);
            m = Math.max(m, Math.abs(x!), Math.abs(y!));
          }
          expect(m).toBeGreaterThan(0.7);
        });

  it('점 하나·빈 상자', () => {
    const c = fitCamera(defaultCamera(), { min: [5, 5, 5], max: [5, 5, 5] }, 1);
    close(c.target, [5, 5, 5], 1e-9);
    expect(c.distance).toBeGreaterThan(0);
    const e = fitCamera(defaultCamera(), { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, 1);
    expect(e.distance).toBe(defaultCamera().distance);
  });
});

describe('조작', () => {
  const base = (p: CameraState['projection']): CameraState => fitCamera(cam('seIso', p), box, 4 / 3);
  for (const p of ['perspective', 'orthographic'] as const) {
    it(`${p}: 궤도 회전 중심은 화면에서 제자리`, () => {
      const c0 = base(p);
      const pivot = [25, 20, 8];
      const s0 = projectToScreen(computeFrame(c0, 800, 600, sphere), pivot)!;
      let c = c0;
      for (let i = 0; i < 5; i++) c = orbitCamera(c, 0.3, -0.17, pivot);
      const s1 = projectToScreen(computeFrame(c, 800, 600, sphere), pivot)!;
      close([s1[0], s1[1]], [s0[0], s0[1]], 1e-6);
      expect(c.yaw).not.toBeCloseTo(c0.yaw, 3);
    });

    it(`${p}: 확대 기준점은 화면에서 제자리`, () => {
      const c0 = base(p);
      const anchor = [-5, 8, 2];
      const s0 = projectToScreen(computeFrame(c0, 800, 600, sphere), anchor)!;
      const c1 = zoomCamera(c0, 0.5, anchor);
      const s1 = projectToScreen(computeFrame(c1, 800, 600, sphere), anchor)!;
      close([s1[0], s1[1]], [s0[0], s0[1]], 1e-6);
      expect(c1.distance).toBeCloseTo(c0.distance * 0.5, 9);
    });

    it(`${p}: 이동은 대상점 깊이의 점을 화소만큼 옮긴다`, () => {
      const c0 = base(p);
      const f0 = computeFrame(c0, 800, 600, sphere);
      const s0 = projectToScreen(f0, c0.target)!;
      const c1 = panCamera(c0, f0, 37, -12);
      const s1 = projectToScreen(computeFrame(c1, 800, 600, sphere), c0.target)!;
      close([s1[0] - s0[0], s1[1] - s0[1]], [37, -12], 1e-6);
    });
  }

  it('앙각은 ±90°에서 멈춘다', () => {
    let c = cam('front');
    for (let i = 0; i < 20; i++) c = orbitCamera(c, 0, 0.3);
    expect(c.pitch).toBeCloseTo(Math.PI / 2, 12);
    for (let i = 0; i < 40; i++) c = orbitCamera(c, 0, -0.3);
    expect(c.pitch).toBeCloseTo(-Math.PI / 2, 12);
  });

  it('확대 한계', () => {
    const c = zoomCamera({ ...defaultCamera(), distance: 10 }, 1e-9, [0, 0, 0], { min: 1, max: 100 });
    expect(c.distance).toBe(1);
  });

  it('보간은 짧은 쪽으로 돈다', () => {
    const a: CameraState = { ...defaultCamera(), yaw: Math.PI - 0.1 };
    const b: CameraState = { ...defaultCamera(), yaw: -Math.PI + 0.1 };
    const m = lerpCamera(a, b, 0.5);
    expect(Math.abs(Math.abs(m.yaw) - Math.PI)).toBeLessThan(1e-9);
    expect(lerpCamera(a, b, 1).yaw).toBeCloseTo(b.yaw, 12);
  });
});

describe('창 확대', () => {
  it('사각형 가운데 깊이의 점이 화면 가운데로, 사각형 모서리가 화면 가장자리로', async () => {
    const { rectZoomCamera, computeFrame, projectToScreen, rayAtDepth, screenRay, defaultCamera } = await import('../src/camera');
    for (const projection of ['perspective', 'orthographic'] as const) {
      const c = { ...defaultCamera(), target: [10, 5, 2] as [number, number, number], distance: 80, projection };
      const f = computeFrame(c, 800, 600, { center: [10, 5, 2], radius: 40 });
      const depth = 75;
      const [x0, y0, x1, y1] = [500, 120, 660, 240];
      const mid = rayAtDepth(f, screenRay(f, 580, 180), depth);
      const corner = rayAtDepth(f, screenRay(f, 660, 180), depth);
      const c2 = rectZoomCamera(c, f, x0, y0, x1, y1, depth);
      const f2 = computeFrame(c2, 800, 600, { center: [10, 5, 2], radius: 40 });
      const m = projectToScreen(f2, mid)!;
      expect(m[0]).toBeCloseTo(400, 6);
      expect(m[1]).toBeCloseTo(300, 6);
      // 폭이 더 꽉 찬다(160/800 > 120/600): 사각형 오른쪽 가운데가 화면 오른쪽 끝
      expect(projectToScreen(f2, corner)![0]).toBeCloseTo(800, 4);
      expect(c2.yaw).toBe(c.yaw);
      expect(c2.distance).toBeLessThan(c.distance);
    }
  });
});

describe('걷기 카메라', () => {
  it('둘러보기는 눈을 제자리에 두고, 앙각은 ±89°에서 멈춘다', async () => {
    const { lookCamera, cameraEye, defaultCamera, LOOK_PITCH_LIMIT } = await import('../src/camera');
    const c = { ...defaultCamera(), target: [5, 6, 7] as [number, number, number], distance: 12 };
    const e0 = cameraEye(c);
    const c2 = lookCamera(c, 0.7, -0.3);
    const e1 = cameraEye(c2);
    for (let k = 0; k < 3; k++) expect(e1[k]).toBeCloseTo(e0[k]!, 9);
    expect(c2.yaw).toBeCloseTo(c.yaw + 0.7, 12);
    expect(c2.distance).toBe(12);
    expect(lookCamera(c, 0, 10).pitch).toBeCloseTo(LOOK_PITCH_LIMIT, 12);
  });

  it('걷기는 수평 앞·오른쪽과 위로 눈·대상점을 함께 옮기고, 서기는 눈을 바닥 점 위 눈높이에', async () => {
    const { walkCamera, standCamera, cameraEye, cameraBasis, defaultCamera } = await import('../src/camera');
    const c = { ...defaultCamera(), yaw: 0.4, pitch: -0.2, target: [0, 0, 0] as [number, number, number], distance: 10 };
    const w = walkCamera(c, 3, 0, 0);
    const b = cameraBasis(c).back;
    const h = Math.hypot(b[0], b[1]);
    // 앞으로 3 = 보는 방향(−back)의 수평 성분 방향으로 3
    expect(w.target[0]).toBeCloseTo((-b[0] / h) * 3, 9);
    expect(w.target[1]).toBeCloseTo((-b[1] / h) * 3, 9);
    expect(w.target[2]).toBe(0);
    const r = walkCamera(c, 0, 2, 1);
    expect(r.target[0]).toBeCloseTo(Math.cos(0.4) * 2, 9);
    expect(r.target[2]).toBe(1);
    const s = standCamera(c, [100, 200, 5], 1.6);
    const e = cameraEye(s);
    expect(e[0]).toBeCloseTo(100, 9);
    expect(e[1]).toBeCloseTo(200, 9);
    expect(e[2]).toBeCloseTo(6.6, 9);
    expect(s.yaw).toBe(c.yaw);
  });
});

describe('굴림·렌즈 이동', () => {
  it('굴림은 화면 오른쪽·위를 보는 축 둘레로 돌리고 보는 방향은 그대로', async () => {
    const { cameraBasis, defaultCamera } = await import('../src/camera');
    const c = defaultCamera();
    const b0 = cameraBasis(c);
    const b1 = cameraBasis({ ...c, roll: Math.PI / 2 });
    for (let k = 0; k < 3; k++) {
      expect(b1.back[k]).toBeCloseTo(b0.back[k]!, 12);
      expect(b1.right[k]).toBeCloseTo(b0.up[k]!, 12);
      expect(b1.up[k]).toBeCloseTo(-b0.right[k]!, 12);
    }
    // 굴림이 없으면 예전 틀과 같다
    expect(cameraBasis({ ...c, roll: 0 })).toEqual(b0);
  });

  it('렌즈 이동은 대상점을 화면에서 반폭·반높이의 그 배수만큼 옮기고, 광선과 투영이 서로 맞는다', async () => {
    const { computeFrame, projectToScreen, screenRay, defaultCamera, lerpCamera } = await import('../src/camera');
    for (const projection of ['perspective', 'orthographic'] as const) {
      const c = { ...defaultCamera(), target: [1, 2, 3] as [number, number, number], distance: 50, projection };
      const f0 = computeFrame(c, 800, 600, { center: [1, 2, 3], radius: 20 });
      const f1 = computeFrame({ ...c, shiftX: 0.25, shiftY: -0.5 }, 800, 600, { center: [1, 2, 3], radius: 20 });
      const p0 = projectToScreen(f0, [1, 2, 3])!, p1 = projectToScreen(f1, [1, 2, 3])!;
      expect(p1[0] - p0[0]).toBeCloseTo(0.25 * 400, 6);
      expect(p1[1] - p0[1]).toBeCloseTo(0.5 * 300, 6);
      expect(f1.shift).toEqual([0.25, -0.5]);
      expect(f0.shift).toBeUndefined();
      // 화면 점 → 광선 위 점 → 화면 점
      const r = screenRay(f1, 123, 456);
      const q = projectToScreen(f1, [r.origin[0] + r.dir[0] * 30, r.origin[1] + r.dir[1] * 30, r.origin[2] + r.dir[2] * 30])!;
      expect(q[0]).toBeCloseTo(123, 6);
      expect(q[1]).toBeCloseTo(456, 6);
    }
    // 보간: 둘 다 없으면 키가 없다
    const a = defaultCamera();
    expect('roll' in lerpCamera(a, a, 0.5)).toBe(false);
    expect(lerpCamera(a, { ...a, roll: 1 }, 0.5).roll).toBeCloseTo(0.5, 12);
  });
});
