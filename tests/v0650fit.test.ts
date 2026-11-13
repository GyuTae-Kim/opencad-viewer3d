/**
 * 0.65.0 화면 맞춤 범위(SKP 73차 — 뷰어 맞춤이 아무것도 숨기지 않으면 Scene3d.bounds, 무엇이든 하나 숨기면 보이는 묶음 범위의 합이라 숨김 하나로 맞춤 거리가
 * 크게 바뀌었다. 앱은 어떤 묶음도 쓰지 않는 그룹을 늘 숨겨 두는 우회를 썼다):
 *  - Scene3d.fitRange 'visible'이면 숨김과 상관없이 늘 보이는 묶음 범위의 합으로 맞춘다(Scene3d.bounds는 격자·단면·위치 범위에만)
 *  - 묶음마다 fit: false면 맞춤 범위에서 뺀다(두 규칙 모두 묶음 범위 합에서 — 기본 규칙에서 아무것도 숨기지 않았으면 Scene3d.bounds 그대로)
 *  - 맞춤을 쓰는 모든 길(fit·키 F·가운데 단추 두 번·setView·setViewDir·뷰 키·뷰 큐브·fitItems의 전체 보기·첫 장면 맞춤·크기를 안 뒤 맞춤·걷기 눈높이·빠르기)이 같은 범위
 *  - 기본 규칙에서 fit 표시가 없는 장면은 0.64.0과 같다. 가까운·먼 면 등 보이는 범위는 fit: false 묶음도 넣는다
 *  - setMesh·removeMesh가 fit: false 묶음 기록을 고친다(같은 객체를 제자리에서 고쳐도)
 * 좌표는 정수라 범위 값을 손으로 적은 값과 비트까지 견준다. 맞춘 카메라는 그 범위로 다시 맞춰도 같은 카메라다(fitCamera는 방향을 두고 대상점·거리만 정한다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { boxMesh } from '../src/synth';
import { cameraBasis, fitCamera, VIEW_DIRS, type CameraState } from '../src/camera';
import { boxSphere } from '../src/bounds';
import { dot, normalize } from '../src/math';
import { CUBE_BAND, cubeLayout, cubeTargets } from '../src/viewcube';
import type { Box3, FitRange, LineSet3d, Mesh3d, PointSet3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  dom.restore();
});

const C = [0.6, 0.65, 0.7, 1] as const;
/** 형상 G = [0,0,0]–[24,8,6](Scene3d.bounds), 주석 선 ann(맞춤에 넣음), 보조선·보조점·멀리 둔 그물(fit: false) */
function scene(fitRange?: FitRange, flags = true): Scene3d {
  const geo = boxMesh('geo', [0, 0, 0], [10, 8, 6], C, 'geo');
  const geo2 = boxMesh('geo2', [20, 0, 0], [24, 4, 4], C, 'geo');
  const far = boxMesh('far', [100, 100, 100], [101, 101, 101], C, 'guide');
  const ann: LineSet3d = { id: 'ann', positions: Float32Array.of(0, -5, 0, 40, -5, 0, 40, 1, 0, 40, 2, 0), group: 'ann' };
  const guide: LineSet3d = { id: 'guide', positions: Float32Array.of(-500, 3, 0, 500, 3, 0), group: 'guide', dashed: true };
  const gpt: PointSet3d = { id: 'gpt', positions: Float32Array.of(0, 0, 300), group: 'guide' };
  if (flags) far.fit = guide.fit = gpt.fit = false;
  const s: Scene3d = { name: 'fit', units: 'unknown', meshes: [geo, geo2, far], lines: [ann, guide], points: [gpt], bounds: { min: [0, 0, 0], max: [24, 8, 6] } };
  if (fitRange) s.fitRange = fitRange;
  return s;
}
const box = (a: number[], b: number[]): Box3 => ({ min: a as Box3['min'], max: b as Box3['max'] });
/** 형상(Scene3d.bounds) */
const G = box([0, 0, 0], [24, 8, 6]);
/** 맞춤에 넣는 보이는 묶음(형상·주석) */
const F = box([0, -5, 0], [40, 8, 6]);
/** 보이는 묶음 모두(보조선·보조점·멀리 둔 그물 포함) */
const V = box([-500, -5, 0], [500, 101, 300]);
/** 보조 묶음만 */
const GUIDE = box([-500, 0, 0], [500, 101, 300]);
const ASPECT = 800 / 600;

function view(sc: Scene3d, o: { host?: FakeElement } = {}): Viewer3d {
  const host = o.host ?? dom.host();
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCubeSize: 76 });
  views.push(v);
  v.setScene(sc);
  return v;
}
type Inner = { visibleBox(): Box3; fitBox(): Box3; frame(): { near: number; far: number }; walkSpeed(): number; noFit: Set<unknown>; grid: unknown };
const inner = (v: Viewer3d): Inner => v as unknown as Inner;
const cam = (v: Viewer3d): CameraState => v.getCamera();
/** 카메라가 범위 b로 맞춘 자리인지(같은 방향으로 b에 다시 맞춰도 대상점·거리가 비트까지 같다) */
const fitted = (c: CameraState, b: Box3): boolean => {
  const f = fitCamera(c, b, ASPECT);
  return f.distance === c.distance && f.target.every((x, i) => x === c.target[i]);
};
/** 맞춤 범위 이름(F·G·V·GUIDE 가운데 맞은 것 — 없으면 '?') */
const which = (c: CameraState, named: Record<string, Box3> = { F, G, V, GUIDE }): string => Object.keys(named).find((k) => fitted(c, named[k]!)) ?? '?';
/** 다른 곳을 보게 카메라를 옮겨 둔다(맞춘 뒤 그대로 남은 것과 구별) */
const away = (v: Viewer3d): void => v.setCamera({ ...cam(v), target: [3, 2, 1], distance: 7 });
const key = (v: Viewer3d, k: string): boolean =>
  v.handleKey({ key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {}, target: v.canvas } as unknown as KeyboardEvent);
let pid = 40;
function middleTwice(v: Viewer3d): void {
  const c = v.canvas as unknown as FakeElement;
  const id = ++pid;
  const ev = (type: string, x: number, buttons: number) =>
    c.fire(type, { clientX: x, clientY: 300, pointerId: id, pointerType: 'mouse', button: 1, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
  ev('pointerdown', 300, 4);
  ev('pointerup', 300, 0);
  ev('pointerdown', 301, 4);
  ev('pointerup', 301, 0);
}
/** 뷰 큐브에서 방향 d 자리를 마우스로 누른다 */
function cubeTap(v: Viewer3d, host: FakeElement, d: readonly number[]): void {
  const cube = host.querySelector('.v3d-cube')!;
  const t = cubeTargets(cameraBasis(cam(v)), cubeLayout(76), CUBE_BAND).find((x) => dot(x.dir, normalize(d)) > 0.9999)!;
  const area = (q: number[][]): number => Math.abs((q[1]![0]! - q[0]![0]!) * (q[3]![1]! - q[0]![1]!) - (q[1]![1]! - q[0]![1]!) * (q[3]![0]! - q[0]![0]!));
  const q = t.pieces.reduce((a, b) => (area(b as number[][]) > area(a as number[][]) ? b : a)) as number[][];
  const x = (q[0]![0]! + q[2]![0]!) / 2, y = (q[0]![1]! + q[2]![1]!) / 2;
  const ev = { clientX: x, clientY: y, pointerId: ++pid, pointerType: 'mouse', button: 0, buttons: 1, isPrimary: true, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  cube.fire('pointerdown', ev);
  cube.fire('pointerup', { ...ev, buttons: 0 });
}

/** 맞춤 길마다(카메라를 옮겨 둔 뒤) 맞춘 범위 이름 */
function paths(sc: () => Scene3d, prep: (v: Viewer3d) => void = () => {}): Record<string, string> {
  const out: Record<string, string> = {};
  const host = dom.host();
  const v = view(sc(), { host });
  prep(v);
  const run = (name: string, act: () => unknown): void => {
    away(v);
    act();
    out[name] = which(cam(v));
  };
  run('fit', () => v.fit(false));
  run('키 F', () => expect(key(v, 'f')).toBe(true));
  run('가운데 두 번', () => middleTwice(v));
  run("setView('top')", () => v.setView('top', false));
  run('setViewDir', () => v.setViewDir([1, -2, 3], false));
  run('뷰 키 5', () => expect(key(v, '5')).toBe(true));
  run('뷰 큐브', () => {
    // 남동 등각에서 보이는 윗면을 누른다(맞춘 뒤 카메라를 다시 옮겨 둔다)
    v.setView('seIso', false);
    away(v);
    cubeTap(v, host, VIEW_DIRS.top);
    expect(cameraBasis(cam(v)).back.map((x) => Math.round(x * 1e6) / 1e6 + 0)).toEqual([0, 0, 1]);
  });
  run('fitItems([])', () => v.fitItems([], false));
  run('fitItems(없는 id)', () => v.fitItems(['없음'], false));
  out['fitBounds'] = which(fitCamera(cam(v), v.fitBounds, ASPECT));
  // 첫 장면 맞춤(크기를 아는 뷰어 — setScene이 남동 등각으로 맞춘다)
  const w = view(sc());
  prep(w);
  out['첫 장면 맞춤(prep 전)'] = which(cam(w));
  // 걷기: 눈높이(단위 모름 — 맞춤 범위 반지름 × 0.1)·빠르기(× 0.4)
  const r = boxSphere(v.fitBounds).radius;
  out['걷기 빠르기'] = inner(v).walkSpeed() === r * 0.4 ? 'fitBounds' : String(inner(v).walkSpeed());
  v.setNavigation('walk');
  out['걷기 눈높이'] = cam(v).distance === r * 0.1 ? 'fitBounds' : String(cam(v).distance);
  v.setNavigation('orbit');
  return out;
}
const all = (x: string, extra: Record<string, string> = {}): Record<string, string> => ({
  fit: x,
  '키 F': x,
  '가운데 두 번': x,
  "setView('top')": x,
  setViewDir: x,
  '뷰 키 5': x,
  '뷰 큐브': x,
  'fitItems([])': x,
  'fitItems(없는 id)': x,
  fitBounds: x,
  '걷기 빠르기': 'fitBounds',
  '걷기 눈높이': 'fitBounds',
  ...extra,
});

describe('0.65.0 화면 맞춤 범위', () => {
  it("'visible' 규칙: 숨김과 상관없이 모든 맞춤 길이 보이는 묶음(fit: false 뺌) 범위 — 숨긴 것을 바꾸면 그만큼", () => {
    expect(paths(() => scene('visible'))).toEqual(all('F', { '첫 장면 맞춤(prep 전)': 'F' }));
    // 어떤 묶음도 쓰지 않는 그룹을 숨겨도 같다(앱의 FIT_GROUP 우회가 하던 것)
    expect(paths(() => scene('visible'), (v) => v.setGroupVisible('\u0000fit', false))).toEqual(all('F', { '첫 장면 맞춤(prep 전)': 'F' }));
    // 주석을 숨기면 형상만, 형상을 숨기면 주석만, 맞출 묶음을 모두 숨기면 보이는 보조 묶음, 모두 숨기면 장면 범위
    expect(paths(() => scene('visible'), (v) => v.setGroupVisible('ann', false))).toEqual(all('G', { '첫 장면 맞춤(prep 전)': 'F' }));
    const v = view(scene('visible'));
    v.setGroupVisible('geo', false);
    expect(v.fitBounds).toEqual(box([0, -5, 0], [40, 2, 0]));
    v.setGroupVisible('ann', false);
    expect(v.fitBounds).toEqual(GUIDE);
    v.setGroupVisible('guide', false);
    expect(v.fitBounds).toEqual(G);
    v.setGroupVisible('geo', true);
    v.setItemVisible('geo2', false);
    expect(v.fitBounds).toEqual(box([0, 0, 0], [10, 8, 6]));
    // 구간 숨김(주석 선의 둘째 선분만 남김)·겉모습 행렬로 옮긴 묶음
    v.setGroupVisible('ann', true);
    v.setHiddenRanges('ann', [{ start: 0, count: 1 }]);
    expect(v.fitBounds).toEqual(box([0, 0, 0], [40, 8, 6]));
    v.setItemVisible('geo2', true);
    v.setItemMatrix('geo2', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 50, 1]);
    expect(v.fitBounds).toEqual(box([0, 0, 0], [40, 8, 54]));
    v.setHiddenRanges('ann', null);
    expect(v.fitBounds).toEqual(box([0, -5, 0], [40, 8, 54]));
  });

  it('기본 규칙: fit 표시가 없으면 0.64.0 그대로(숨김 없음 = Scene3d.bounds, 숨김 = 보이는 묶음 모두), fit: false는 숨김이 있을 때 뺀다', () => {
    // fit 표시 없음 — 0.64.0과 같은 값
    expect(paths(() => scene(undefined, false))).toEqual(all('G', { '첫 장면 맞춤(prep 전)': 'G' }));
    expect(paths(() => scene(undefined, false), (v) => v.setGroupVisible('\u0000fit', false))).toEqual(all('V', { '첫 장면 맞춤(prep 전)': 'G' }));
    // fit: false — 숨김이 없으면 Scene3d.bounds 그대로, 있으면 뺀다
    expect(paths(() => scene('bounds'))).toEqual(all('G', { '첫 장면 맞춤(prep 전)': 'G' }));
    expect(paths(() => scene())).toEqual(all('G', { '첫 장면 맞춤(prep 전)': 'G' }));
    expect(paths(() => scene(), (v) => v.setGroupVisible('\u0000fit', false))).toEqual(all('F', { '첫 장면 맞춤(prep 전)': 'G' }));
    // Scene3d.bounds가 없으면 숨김이 없어도 묶음 범위 합에서 뺀다
    const s = scene();
    delete s.bounds;
    expect(paths(() => s)).toEqual(all('F', { '첫 장면 맞춤(prep 전)': 'F' }));
  });

  it('fitItems는 fit: false 묶음도 id로 주면 맞추고, 숨긴 것은 뺀다', () => {
    const v = view(scene('visible'));
    away(v);
    v.fitItems(['guide', 'gpt'], false);
    expect(which(cam(v), { L: box([-500, 0, 0], [500, 3, 300]) })).toBe('L');
    v.setGroupVisible('guide', false);
    away(v);
    v.fitItems(['guide', 'gpt'], false);
    expect(which(cam(v))).toBe('F');
  });

  it('크기를 모를 때 올린 장면은 크기를 안 뒤 같은 맞춤 범위로 맞춘다', () => {
    const g = globalThis as unknown as { ResizeObserver: unknown };
    const saved = g.ResizeObserver;
    let cb: ((e: { contentRect: { width: number; height: number } }[]) => void) | null = null;
    g.ResizeObserver = class {
      constructor(f: typeof cb) {
        cb = f;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };
    try {
      for (const [sc, want] of [
        [scene('visible'), 'F'],
        [scene(), 'G'],
      ] as const) {
        const host = dom.host();
        host.rect = { left: 0, top: 0, width: 0, height: 0 };
        const v = view(sc, { host });
        away(v);
        cb!([{ contentRect: { width: 800, height: 600 } }]);
        expect(which(cam(v))).toBe(want);
      }
    } finally {
      g.ResizeObserver = saved;
    }
  });

  it("보이는 범위(가까운·먼 면 등)는 fit: false 묶음도 넣고, 'visible' 규칙이어도 격자·단면 위치 범위는 Scene3d.bounds", () => {
    const a = view(scene('visible'));
    const b = view(scene());
    const c = view(scene('visible', false));
    expect(inner(a).visibleBox()).toEqual(V);
    expect(inner(b).visibleBox()).toEqual(G);
    expect(inner(c).visibleBox()).toEqual(V);
    // 가까운·먼 면은 fit 표시가 없는 장면과 같다(보조 묶음까지 덮는다 — 맞춘 카메라는 a의 것)
    a.setView('bottom', false);
    const c0 = cam(a);
    for (const w of [a, b, c]) w.setCamera(c0);
    expect(inner(a).frame().far).toBe(inner(c).frame().far);
    expect(inner(a).frame().near).toBe(inner(c).frame().near);
    expect(inner(a).frame().far).toBeGreaterThan(inner(b).frame().far + 290);
    expect(a.sectionRange('x')).toEqual(b.sectionRange('x'));
    expect(a.sectionRange('x')).toEqual({ min: 0, max: 24 });
    expect(inner(a).grid).toEqual(inner(b).grid);
  });

  it('setMesh·removeMesh가 fit: false 기록을 고친다(바꾸기·더하기·같은 객체 제자리·빼기)', () => {
    const v = view(scene('visible'));
    const far = v.scene!.meshes.find((m) => m.id === 'far')!;
    expect(inner(v).noFit.size).toBe(3);
    // fit: false 그물을 표시 없는 그물로 바꾸면 넣는다
    v.setMesh({ ...far, fit: undefined });
    expect(v.fitBounds).toEqual(box([0, -5, 0], [101, 101, 101]));
    expect(inner(v).noFit.size).toBe(2);
    // fit: false 그물을 더하면 뺀다
    const add: Mesh3d = { ...boxMesh('add', [-90, 0, 0], [-80, 1, 1], C), fit: false };
    v.setMesh(add);
    expect(v.fitBounds).toEqual(box([0, -5, 0], [101, 101, 101]));
    expect(inner(v).noFit.size).toBe(3);
    // 같은 객체를 제자리에서 고쳐 알린다
    const geo2 = v.scene!.meshes.find((m) => m.id === 'geo2')!;
    geo2.fit = false;
    v.setMesh(geo2);
    expect(inner(v).noFit.size).toBe(4);
    v.removeMesh('far');
    expect(v.fitBounds).toEqual(box([0, -5, 0], [40, 8, 6]));
    geo2.fit = true;
    v.setMesh(geo2);
    expect(inner(v).noFit.size).toBe(3);
    expect(v.fitBounds).toEqual(F);
    v.removeMesh('add');
    expect(inner(v).noFit.size).toBe(2);
    // 선분·점 묶음만 남은 fit: false — 맞춤 범위는 그대로
    expect(v.fitBounds).toEqual(F);
    v.clear();
    expect(inner(v).noFit.size).toBe(0);
    expect(v.fitBounds.min[0]).toBe(Infinity);
  });

  it('기본 규칙에서 숨김이 없으면 fit: false 그물을 바꿔도 Scene3d.bounds, 맞춤 범위는 다시 묻기 전까지 기억한다', () => {
    const v = view(scene());
    v.setMesh({ ...boxMesh('add', [-90, 0, 0], [-80, 1, 1], C), fit: false });
    expect(v.fitBounds).toEqual(G);
    const w = view(scene('visible'));
    const f1 = inner(w).fitBox();
    expect(inner(w).fitBox()).toBe(f1);
    w.renderNow();
    expect(inner(w).fitBox()).toBe(f1);
    w.setItemVisible('ann', false);
    expect(inner(w).fitBox()).not.toBe(f1);
    expect(inner(w).fitBox()).toEqual(G);
  });
});
