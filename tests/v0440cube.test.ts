/**
 * 0.44.0 손가락 기기 뷰 큐브(STEP 50차 요청): 누르는 자리 폭(cubeTargets — WCAG 2.2 2.5.8 AA 24 CSS px), 띠를 넓힌 고르기(cubeHit band),
 * 뷰어(가짜 DOM): 손가락으로 누르면 펴기 → 편 큐브를 눌러 고르고 접기, 큐브 밖·3D 보기·Esc로 접기, 끔·좁은 뷰어, 마우스·펜은 0.43.0 그대로
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { VIEW_DIRS, basisFromAngles, cameraBasis, dirToAngles } from '../src/camera';
import { dot, normalize } from '../src/math';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import { CUBE_BAND, CUBE_TOUCH_BAND, CUBE_TOUCH_MIN, CUBE_TOUCH_SIZE, cubeHit, cubeLayout, cubeTargets } from '../src/viewcube';

const basisOf = (d: readonly number[]) => {
  const a = dirToAngles(d);
  return basisFromAngles(a.yaw, a.pitch);
};
/** 표준 뷰 26방향(면 6·모서리 12·구석 8) */
function standardDirs(): number[][] {
  const out: number[][] = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) out.push([x, y, z]);
  return out;
}
const minWidth = (d: readonly number[], size: number, band: number): number => Math.min(...cubeTargets(basisOf(d), cubeLayout(size), band).map((t) => t.width));

describe('누르는 자리 폭(cubeTargets)', () => {
  it('보이는 자리 수: 면 뷰 9, 모서리 뷰 15, 등각 19 — 같은 방향 조각은 한 자리', () => {
    expect(cubeTargets(basisOf(VIEW_DIRS.front), cubeLayout(112)).length).toBe(9);
    expect(cubeTargets(basisOf([0, -1, 1]), cubeLayout(112)).length).toBe(15);
    const iso = cubeTargets(basisOf(VIEW_DIRS.seIso), cubeLayout(112));
    expect(iso.length).toBe(19);
    // 가운데 구석(남동 위)은 세 면 조각
    expect(iso.find((t) => dot(t.dir, normalize(VIEW_DIRS.seIso)) > 0.9999)!.pieces.length).toBe(3);
  });

  it('0.43.0 크기(64~160, 띠 0.24)에서는 표준 뷰마다 24 CSS px보다 좁은 자리가 있다(면 뷰 띠 = 띠 × 배율)', () => {
    for (const size of [64, 76, 112, 160]) for (const d of standardDirs()) expect(minWidth(d, size, CUBE_BAND)).toBeLessThan(CUBE_TOUCH_MIN);
    // 면 뷰 76화소: 가운데 18.6·띠 8.6
    const front = cubeTargets(basisOf(VIEW_DIRS.front), cubeLayout(76)).map((t) => +t.width.toFixed(1));
    expect(Math.max(...front)).toBe(18.6);
    expect(Math.min(...front)).toBe(8.6);
  });

  it('편 큐브(224화소, 띠 0.3): 26 표준 뷰 모두 보이는 자리가 24 CSS px 이상, 면 뷰 가운데는 44 이상(2.5.5·HIG) — 208화소면 모자란다', () => {
    for (const d of standardDirs()) expect(minWidth(d, CUBE_TOUCH_SIZE, CUBE_TOUCH_BAND)).toBeGreaterThanOrEqual(CUBE_TOUCH_MIN);
    expect(Math.min(...standardDirs().map((d) => minWidth(d, 208, CUBE_TOUCH_BAND)))).toBeLessThan(CUBE_TOUCH_MIN);
    const front = cubeTargets(basisOf(VIEW_DIRS.front), cubeLayout(CUBE_TOUCH_SIZE), CUBE_TOUCH_BAND);
    expect(Math.max(...front.map((t) => t.width))).toBeGreaterThanOrEqual(44);
  });

  it('cubeHit의 띠: 주지 않으면 0.24(0.43.0), 0.3이면 면 한 변의 0.27 자리가 모서리', () => {
    const b = basisOf(VIEW_DIRS.front);
    const L = cubeLayout(112);
    // 면 가운데에서 오른쪽으로 0.23 × 배율 — s = 0.73(0.24 띠 안쪽, 0.3 띠 바깥)
    const x = L.cx + 0.23 * L.scale;
    expect(cubeHit(b, L, x, L.cy)!.region).toEqual([0, 0]);
    expect(cubeHit(b, L, x, L.cy, CUBE_BAND)!.region).toEqual([0, 0]);
    expect(cubeHit(b, L, x, L.cy, CUBE_TOUCH_BAND)!.region).toEqual([1, 0]);
  });
});

// ───────────── 뷰어 ─────────────
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

type W = { v: Viewer3d; cube: FakeElement; canvas: FakeElement };
function view(opts: ConstructorParameters<typeof Viewer3d>[1] = {}): W {
  const host = dom.host();
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCubeSize: 76, ...opts });
  views.push(v);
  v.setScene({ name: 't', units: 'mm', meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1])], lines: [] });
  return { v, cube: host.querySelector('.v3d-cube')!, canvas: v.canvas as unknown as FakeElement };
}
let pid = 10;
/** 큐브 캔버스 위 (x, y)(큐브 CSS 화소)를 눌렀다 뗀다. move면 그만큼 끌고 뗀다 */
function tap(el: FakeElement, x: number, y: number, pointerType = 'touch', move = 0): void {
  const id = ++pid;
  const ev = (cx: number) => ({ clientX: cx, clientY: y, pointerId: id, pointerType, button: 0, buttons: 1, isPrimary: true, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
  el.fire('pointerdown', ev(x));
  if (move) el.fire('pointermove', { ...ev(x + move), button: -1 });
  el.fire('pointerup', { ...ev(x + move), buttons: 0 });
}
/** 큐브 요소의 CSS 폭(처음엔 cssText에만 있다) */
const cssSize = (el: FakeElement): string => {
  const s = el.style as unknown as Record<string, string>;
  return s.width || /width:(\d+px)/.exec(s.cssText ?? '')?.[1] || '';
};
const eye = (v: Viewer3d): number[] => cameraBasis(v.getCamera()).back.map((x) => +x.toFixed(6) + 0);
/** 지금 카메라·큐브 크기에서 방향 d 자리의 가운데(큐브 CSS 화소) */
function targetAt(v: Viewer3d, size: number, band: number, d: readonly number[]): [number, number] {
  const t = cubeTargets(cameraBasis(v.getCamera()), cubeLayout(size), band).find((x) => dot(x.dir, normalize(d)) > 0.9999)!;
  // 가장 넓은 조각의 가운데
  const q = t.pieces.reduce((a, b) => (Math.abs((b[1]![0] - b[0]![0]) * (b[3]![1] - b[0]![1]) - (b[1]![1] - b[0]![1]) * (b[3]![0] - b[0]![0])) > Math.abs((a[1]![0] - a[0]![0]) * (a[3]![1] - a[0]![1]) - (a[1]![1] - a[0]![1]) * (a[3]![0] - a[0]![0])) ? b : a));
  return [(q[0]![0] + q[2]![0]) / 2, (q[0]![1] + q[2]![1]) / 2];
}

describe('손가락 뷰 큐브(viewCubeTouch — 기본 켬)', () => {
  it('마우스는 0.43.0 그대로 바로 고른다(펴지 않음)', () => {
    const w = view();
    const before = eye(w.v);
    const [x, y] = targetAt(w.v, 76, CUBE_BAND, VIEW_DIRS.top);
    tap(w.cube, x, y, 'mouse');
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(cssSize(w.cube)).toBe('76px');
    expect(eye(w.v)).not.toEqual(before);
    expect(eye(w.v)).toEqual([0, 0, 1]);
    // 펜도(위 뷰에서 보이는 위·앞 모서리)
    const [fx, fy] = targetAt(w.v, 76, CUBE_BAND, [0, -1, 1]);
    tap(w.cube, fx, fy, 'pen');
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(eye(w.v)).toEqual(normalize([0, -1, 1]).map((x) => +x.toFixed(6) + 0));
  });

  it('손가락: 처음 누르면 펴기만(카메라 그대로, 큐브 224화소·viewCubeRect도), 편 큐브의 자리를 누르면 그 뷰로 가고 접는다', () => {
    const w = view();
    const before = eye(w.v);
    const [x, y] = targetAt(w.v, 76, CUBE_BAND, VIEW_DIRS.top);
    tap(w.cube, x, y);
    expect(w.v.viewCubeExpanded).toBe(true);
    expect(eye(w.v)).toEqual(before);
    expect(cssSize(w.cube)).toBe(`${CUBE_TOUCH_SIZE}px`);
    expect(w.v.viewCubeRect).toMatchObject({ width: CUBE_TOUCH_SIZE, height: CUBE_TOUCH_SIZE, y: 8 });
    // 편 큐브: 남동 등각 구석(띠 0.3)
    const [cx, cy] = targetAt(w.v, CUBE_TOUCH_SIZE, CUBE_TOUCH_BAND, [1, -1, 1]);
    tap(w.cube, cx, cy);
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(cssSize(w.cube)).toBe('76px');
    expect(w.v.viewCubeRect).toMatchObject({ width: 76 });
    expect(eye(w.v)).toEqual(normalize([1, -1, 1]).map((x) => +x.toFixed(6) + 0));
  });

  it('편 큐브 밖(큐브 캔버스 구석)·3D 보기·Esc는 고르지 않고 접는다', () => {
    const w = view({ keyboard: true });
    const before = eye(w.v);
    const [x, y] = targetAt(w.v, 76, CUBE_BAND, VIEW_DIRS.top);
    tap(w.cube, x, y);
    expect(w.v.viewCubeExpanded).toBe(true);
    tap(w.cube, 3, 3);
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(eye(w.v)).toEqual(before);
    tap(w.cube, x, y);
    expect(w.v.viewCubeExpanded).toBe(true);
    w.canvas.fire('pointerdown', { clientX: 300, clientY: 300, pointerId: 99, pointerType: 'touch', button: 0, buttons: 1, isPrimary: true });
    w.canvas.fire('pointerup', { clientX: 300, clientY: 300, pointerId: 99, pointerType: 'touch', button: 0, buttons: 0, isPrimary: true });
    expect(w.v.viewCubeExpanded).toBe(false);
    tap(w.cube, x, y);
    expect(w.v.handleKey({ key: 'Escape', preventDefault() {} } as unknown as KeyboardEvent)).toBe(true);
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(eye(w.v)).toEqual(before);
  });

  it('손가락 끌기: 10화소 안이면 누르기(펴기), 넘으면 0.43.0처럼 돌리기', () => {
    const w = view();
    const [x, y] = targetAt(w.v, 76, CUBE_BAND, VIEW_DIRS.top);
    tap(w.cube, x, y, 'touch', 8);
    expect(w.v.viewCubeExpanded).toBe(true);
    w.v.setViewCubeTouch(true);
    expect(w.v.viewCubeExpanded).toBe(false);
    const before = eye(w.v);
    tap(w.cube, x, y, 'touch', 14);
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(eye(w.v)).not.toEqual(before);
    // 마우스는 3화소부터 돌리기(0.43.0)
    const b2 = eye(w.v);
    tap(w.cube, x, y, 'mouse', 4);
    expect(eye(w.v)).not.toEqual(b2);
  });

  it('끔(false)이면 손가락도 바로 고른다, { size, band }로 바꾸고, 뷰어 짧은 변 − 16으로 자르며 큐브보다 크지 않으면 펴지 않는다', () => {
    const w = view({ viewCubeTouch: false });
    expect(w.v.viewCubeTouch).toBe(false);
    const [x, y] = targetAt(w.v, 76, CUBE_BAND, VIEW_DIRS.top);
    tap(w.cube, x, y);
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(eye(w.v)).toEqual([0, 0, 1]);
    w.v.setViewCubeTouch({ size: 300, band: 0.9 });
    expect(w.v.viewCubeTouch).toEqual({ size: 300, band: 0.4 });
    tap(w.cube, x, y);
    expect(cssSize(w.cube)).toBe('300px');
    w.v.setViewCubeTouch({ size: 2000 });
    expect(w.v.viewCubeTouch).toEqual({ size: 480, band: CUBE_TOUCH_BAND });
    tap(w.cube, x, y);
    // 뷰어 800 × 600 — 짧은 변 600 − 16
    expect(cssSize(w.cube)).toBe('480px');
    w.v.setViewCubeSize(160);
    expect(w.v.viewCubeExpanded).toBe(false);
    w.v.setViewCubeTouch({ size: 150 });
    const before = eye(w.v);
    // 위 뷰에서 보이는 위·앞 모서리
    const [tx, ty] = targetAt(w.v, 160, CUBE_BAND, [0, -1, 1]);
    tap(w.cube, tx, ty);
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(eye(w.v)).not.toEqual(before);
    // 큐브를 감추면 접는다
    w.v.setViewCubeTouch(true);
    tap(w.cube, tx, ty);
    expect(w.v.viewCubeExpanded).toBe(true);
    w.v.setViewCubeVisible(false);
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(w.v.viewCubeRect).toBeNull();
  });
});
