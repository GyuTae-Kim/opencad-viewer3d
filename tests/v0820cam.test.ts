/**
 * 0.82.0 카메라 API 인자 견고성(82차): 0.81.0은 앱이 준 카메라·이동량을 그대로 써서 NaN·무한대 하나로 카메라가 그릴 수 없는 값이 됐다
 * (orbitBy(NaN, 0)·lookBy(Infinity, 0)·setCamera({ yaw: NaN })·fovY 빠짐·flyTo({ pitch: NaN }) → 그리기마다 u_mvp NaN — 화면이 비고
 * 전체 보기(fit·키 F)도 방향을 그대로 써서 돌아오지 않았다. 거리 0 이하면 확대가 멈췄다).
 * - 상대 이동(orbitBy·lookBy·walkBy)은 유한하지 않은 인자를 받지 않는다(setRoll·setFov·setLensShift와 같은 규칙 — 옮기던 움직임도 그대로)
 * - 절대 카메라(setCamera·flyTo)는 그릴 수 있는 값만 받는다: 대상점 유한한 수 셋, 거리 유한 > 0, 방위각·앙각 유한, 시야각 (0, π), 굴림·렌즈 이동은 없거나 유한.
 *   아니면 setCamera는 아무것도 하지 않고 flyTo는 곧 false(옮기던 움직임 그대로)
 * - 정상 값(getCamera를 되준 것, 큰 유한 값, 굴림·렌즈 이동)은 0.81.0과 같은 카메라다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { guardGl } from './glguard';
import { type CameraState, defaultCamera, dirToAngles, lookCamera, orbitCamera, walkCamera } from '../src/camera';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
let clock = 1000;
beforeAll(() => {
  dom = installDom();
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
});
afterAll(() => {
  vi.restoreAllMocks();
  dom.restore();
});

const scene = (): Scene3d => ({
  name: 'c',
  units: 'mm',
  meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1]), boxMesh('b', [30, 0, 0], [34, 4, 4], [0.8, 0.6, 0.5, 1])],
  lines: [],
});
/** 시험마다 같은 처음 카메라(멀리서 비스듬히) */
function start(): CameraState {
  const a = dirToAngles([-0.3, -1, 0.4]);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [3, -2, 1], distance: 400, projection: 'perspective' };
}
/** 저장된 보기 */
function saved(): CameraState {
  const a = dirToAngles([1, 0.2, 0.3]);
  return { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [5, 5, 5], distance: 60, projection: 'perspective' };
}

interface W {
  v: Viewer3d;
  bad: string[];
}
function view(animate = false): W {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 400, height: 300 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate, keyboard: false, viewCube: false });
  views.push(v);
  const bad: string[] = [];
  guardGl((v.canvas as unknown as FakeElement).gl!, (x) => bad.push(x));
  v.setScene(scene());
  v.setCamera(start());
  v.renderNow();
  return { v, bad };
}
const camOk = (c: CameraState): boolean =>
  [...c.target, c.distance, c.yaw, c.pitch, c.fovY, c.roll ?? 0, c.shiftX ?? 0, c.shiftY ?? 0].every(Number.isFinite) && c.distance > 0;
/** Promise가 지금 풀렸는지(풀렸으면 그 값, 아니면 'pending') */
async function state<T>(p: Promise<T>): Promise<T | 'pending'> {
  const PENDING = Symbol('pending');
  const r = await Promise.race([p, Promise.resolve(PENDING)]);
  return r === PENDING ? 'pending' : (r as T);
}

type Call = readonly [string, (v: Viewer3d) => void];
const RELATIVE: readonly Call[] = [
  ['orbitBy(NaN, 0)', (v) => v.orbitBy(NaN, 0)],
  ['orbitBy(0, NaN)', (v) => v.orbitBy(0, NaN)],
  ['orbitBy(Infinity, 0)', (v) => v.orbitBy(Infinity, 0)],
  ['orbitBy(0, -Infinity)', (v) => v.orbitBy(0, -Infinity)],
  ['lookBy(NaN, 0)', (v) => v.lookBy(NaN, 0)],
  ['lookBy(Infinity, 0)', (v) => v.lookBy(Infinity, 0)],
  ['lookBy(0, NaN)', (v) => v.lookBy(0, NaN)],
  ['walkBy(NaN, 0)', (v) => v.walkBy(NaN, 0)],
  ['walkBy(0, Infinity)', (v) => v.walkBy(0, Infinity)],
  ['walkBy(0, 0, NaN)', (v) => v.walkBy(0, 0, NaN)],
];

/** 그릴 수 없는 카메라(start()의 한 필드만 깨뜨린다) */
const BROKEN: readonly (readonly [string, Partial<Record<keyof CameraState, unknown>> | null])[] = [
  ['카메라 없음(null)', null],
  ['target NaN', { target: [NaN, 0, 0] }],
  ['target 둘', { target: [1, 2] }],
  ['target 없음', { target: undefined }],
  ['distance NaN', { distance: NaN }],
  ['distance 0', { distance: 0 }],
  ['distance −5', { distance: -5 }],
  ['distance Infinity', { distance: Infinity }],
  ['yaw NaN', { yaw: NaN }],
  ['pitch Infinity', { pitch: Infinity }],
  ['fovY 없음', { fovY: undefined }],
  ['fovY 0', { fovY: 0 }],
  ['fovY NaN', { fovY: NaN }],
  ['fovY π', { fovY: Math.PI }],
  ['fovY 4', { fovY: 4 }],
  ['roll NaN', { roll: NaN }],
  ['shiftX Infinity', { shiftX: Infinity }],
  ['shiftY NaN', { shiftY: NaN }],
];
const broken = (p: Partial<Record<keyof CameraState, unknown>> | null): CameraState => (p ? ({ ...start(), ...p } as CameraState) : (null as unknown as CameraState));

describe('뷰어: 상대 이동 인자', () => {
  it('orbitBy·lookBy·walkBy의 유한하지 않은 인자는 받지 않는다 — 카메라 그대로·균일 변수 유한, 그 뒤 전체 보기·궤도가 된다', () => {
    for (const [name, f] of RELATIVE) {
      const w = view();
      const c0 = w.v.getCamera();
      f(w.v);
      expect(w.v.getCamera(), name).toEqual(c0);
      w.v.renderNow();
      void w.v.fit(false);
      w.v.renderNow();
      const c1 = w.v.getCamera();
      expect(camOk(c1), name).toBe(true);
      w.v.orbitBy(0.2, -0.1);
      expect(w.v.getCamera(), name).toEqual(orbitCamera(c1, 0.2, -0.1));
      w.v.renderNow();
      expect(w.bad, name).toEqual([]);
    }
  });

  it('받지 않은 부름은 옮기던 움직임을 끝 자리로 마치지 않는다(setRoll(NaN)과 같다)', async () => {
    for (const [name, f] of RELATIVE) {
      const w = view(true);
      const p = w.v.flyTo(saved());
      clock += 100;
      w.v.renderNow();
      const mid = w.v.getCamera();
      f(w.v);
      expect(await state(p), name).toBe('pending');
      expect(w.v.getCamera(), name).toEqual(mid);
      clock += 220;
      w.v.renderNow();
      expect(await state(p), name).toBe(true);
      expect(w.v.getCamera(), name).toEqual(saved());
      expect(w.bad, name).toEqual([]);
    }
  });

  it('유한한 인자는 0.81.0과 같다(궤도·둘러보기·걷기 — 중력·부딪힘 없음)', () => {
    const w = view();
    let c = w.v.getCamera();
    w.v.orbitBy(0.3, -0.2);
    expect(w.v.getCamera()).toEqual(orbitCamera(c, 0.3, -0.2));
    c = w.v.getCamera();
    w.v.orbitBy(0, 1e9);
    expect(w.v.getCamera()).toEqual(orbitCamera(c, 0, 1e9));
    c = w.v.getCamera();
    w.v.lookBy(0.1, 0.05);
    expect(w.v.getCamera()).toEqual(lookCamera(c, 0.1, 0.05));
    c = w.v.getCamera();
    w.v.walkBy(5, -3, 1);
    expect(w.v.getCamera()).toEqual(walkCamera(c, 5, -3, 1));
    w.v.renderNow();
    expect(w.bad).toEqual([]);
  });
});

describe('뷰어: 절대 카메라', () => {
  it('setCamera: 그릴 수 없는 카메라는 받지 않는다 — 카메라 그대로·균일 변수 유한, 확대·전체 보기가 된다', () => {
    for (const [name, p] of BROKEN) {
      const w = view();
      const c0 = w.v.getCamera();
      expect(() => w.v.setCamera(broken(p)), name).not.toThrow();
      expect(w.v.getCamera(), name).toEqual(c0);
      w.v.renderNow();
      w.v.zoomBy(0.5);
      expect(w.v.getCamera().distance, name).toBe(c0.distance * 0.5);
      void w.v.fit(false);
      w.v.renderNow();
      expect(camOk(w.v.getCamera()), name).toBe(true);
      expect(w.bad, name).toEqual([]);
    }
  });

  it('flyTo: 그릴 수 없는 카메라는 곧 false — 카메라·옮기던 움직임 그대로(움직임을 쓰든 안 쓰든)', async () => {
    for (const [name, p] of BROKEN) {
      const w = view(true);
      const c0 = w.v.getCamera();
      expect(await state(w.v.flyTo(broken(p), false)), name).toBe(false);
      expect(await state(w.v.flyTo(broken(p))), name).toBe(false);
      expect(w.v.getCamera(), name).toEqual(c0);
      const go = w.v.flyTo(saved());
      clock += 100;
      w.v.renderNow();
      const mid = w.v.getCamera();
      expect(await state(w.v.flyTo(broken(p))), name).toBe(false);
      expect(await state(go), name).toBe('pending');
      expect(w.v.getCamera(), name).toEqual(mid);
      clock += 220;
      w.v.renderNow();
      expect(await state(go), name).toBe(true);
      expect(w.v.getCamera(), name).toEqual(saved());
      expect(w.bad, name).toEqual([]);
    }
  });

  it('정상 값은 0.81.0과 같다: getCamera를 되준 것(굴림·렌즈 이동 포함), 큰 유한 값·범위 밖 앙각, 평행 투영', async () => {
    const w = view();
    w.v.setRoll(0.3);
    w.v.setLensShift(0.2, -0.1);
    const c = w.v.getCamera();
    w.v.setCamera(start());
    w.v.setCamera(c);
    expect(w.v.getCamera()).toEqual(c);
    const odd: CameraState[] = [
      { ...start(), pitch: 3, yaw: 1e300 },
      { ...start(), target: [1e20, -1e20, 0], distance: 1e20 },
      { ...start(), fovY: 3, roll: -7, shiftX: 40 },
      { ...start(), projection: 'orthographic', distance: 1e-9 },
    ];
    for (const o of odd) {
      w.v.setCamera(o);
      expect(w.v.getCamera()).toEqual(o);
      w.v.setCamera(start());
      expect(await state(w.v.flyTo(o, false))).toBe(true);
      expect(w.v.getCamera()).toEqual(o);
    }
  });
});
