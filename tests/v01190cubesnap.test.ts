/**
 * 0.119.0 손가락 뷰 큐브의 윤곽 밖 붙이기(SKP 휴대폰 손가락 표적 — 큐브 모서리·꼭짓점 누르기 자리가 44 CSS px 아래): cubeHit snap(손가락 허용치),
 * 뷰어(가짜 DOM): 손가락으로 편 큐브(224화소, 띠 0.3)의 윤곽 밖 touchPickTolerance(기본 14) 안을 누르면 가장 가까운 모서리·꼭짓점 뷰로 가고('pick'),
 * 더 먼 자리는 0.118.0처럼 접기만('cube'). 윤곽 안(면 가운데 포함)·마우스·펜·viewCubeTouch false는 0.118.0 그대로 — 0.118.0 src로는 실패
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { VIEW_DIRS, basisFromAngles, cameraBasis, dirToAngles } from '../src/camera';
import { type V3, dot, normalize } from '../src/math';
import { boxMesh } from '../src/synth';
import { TOUCH_PICK_TOLERANCE_PX } from '../src/pointer';
import { type ViewCubeExpandEvent, Viewer3d } from '../src/viewer';
import { CUBE_BAND, CUBE_TOUCH_BAND, CUBE_TOUCH_SIZE, cubeHit, cubeLayout } from '../src/viewcube';

const basisOf = (d: readonly number[]) => {
  const a = dirToAngles(d);
  return basisFromAngles(a.yaw, a.pitch);
};
const along = (d: readonly number[] | undefined, e: readonly number[]): boolean => !!d && dot(d, normalize(e)) > 0.9999;
/** 표준 뷰 26방향(면 6·모서리 12·구석 8) */
function standardDirs(): number[][] {
  const out: number[][] = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) out.push([x, y, z]);
  return out;
}
const SNAP = TOUCH_PICK_TOLERANCE_PX;

describe('cubeHit snap(손가락 허용치)', () => {
  it('윤곽 안은 snap과 무관하게 같고, 윤곽 밖에서 붙은 자리는 늘 모서리 띠·꼭짓점(면 가운데 아님) — 표준 뷰 26방향과 비스듬한 뷰, 76·112·224화소', () => {
    const dirs: number[][] = [...standardDirs(), [0.3, -1, 0.45], [-0.7, 0.2, 1], [1, 0.05, 0.02]];
    let inside = 0;
    let snapped = 0;
    for (const [size, band] of [
      [76, CUBE_BAND],
      [112, CUBE_BAND],
      [CUBE_TOUCH_SIZE, CUBE_TOUCH_BAND],
    ] as const) {
      const L = cubeLayout(size);
      for (const d of dirs) {
        const b = basisOf(d);
        for (let y = 0.5; y < size; y += 3)
          for (let x = 0.5; x < size; x += 3) {
            const h0 = cubeHit(b, L, x, y, band);
            const h = cubeHit(b, L, x, y, band, SNAP);
            if (h0) {
              inside++;
              expect(h).toEqual(h0);
            } else if (h) {
              snapped++;
              expect(h.region[0] !== 0 || h.region[1] !== 0).toBe(true);
              // 붙은 자리는 윤곽 위(s나 t가 0·1)
              expect([h.s, h.t].some((k) => k === 0 || k === 1)).toBe(true);
            }
          }
      }
    }
    expect(inside).toBeGreaterThan(10_000);
    expect(snapped).toBeGreaterThan(1_000);
  });

  it('면 뷰(편 큐브): 윤곽 위 바깥 14화소 안은 앞·위 모서리, 오른쪽 위 바깥 꼭짓점 둘레는 남동 등각, 14화소를 넘으면 null', () => {
    const b = basisOf(VIEW_DIRS.front);
    const L = cubeLayout(CUBE_TOUCH_SIZE);
    const top = L.cy - 0.5 * L.scale;
    const right = L.cx + 0.5 * L.scale;
    expect(cubeHit(b, L, L.cx, top - 10, CUBE_TOUCH_BAND)).toBeNull();
    const h = cubeHit(b, L, L.cx, top - 10, CUBE_TOUCH_BAND, SNAP)!;
    expect(h.face.name).toBe('front');
    expect(h.region).toEqual([0, 1]);
    expect(along(h.dir, [0, -1, 1])).toBe(true);
    expect(cubeHit(b, L, L.cx, top - 13.9, CUBE_TOUCH_BAND, SNAP)).not.toBeNull();
    expect(cubeHit(b, L, L.cx, top - 14.1, CUBE_TOUCH_BAND, SNAP)).toBeNull();
    // 꼭짓점 바깥 대각선 9.9화소 → 구석, 14.1화소 → 없음
    expect(along(cubeHit(b, L, right + 7, top - 7, CUBE_TOUCH_BAND, SNAP)?.dir, VIEW_DIRS.seIso)).toBe(true);
    expect(cubeHit(b, L, right + 10, top - 10, CUBE_TOUCH_BAND, SNAP)).toBeNull();
    // snap 0·음수·NaN은 0.118.0 그대로
    for (const s of [0, -5, Number.NaN]) expect(cubeHit(b, L, L.cx, top - 10, CUBE_TOUCH_BAND, s)).toBeNull();
  });

  it('면 뷰(편 큐브): 손가락 허용치 14로 모서리·꼭짓점 자리가 지름 44 원을 품는다(0.118.0은 띠 34.1 — 그 원의 윗부분이 윤곽 밖이라 고르지 못함)', () => {
    const b = basisOf(VIEW_DIRS.front);
    const L = cubeLayout(CUBE_TOUCH_SIZE);
    const top = L.cy - 0.5 * L.scale;
    const right = L.cx + 0.5 * L.scale;
    const band = CUBE_TOUCH_BAND * L.scale;
    expect(band + SNAP).toBeGreaterThanOrEqual(44);
    /** (cx, cy) 가운데 지름 44 원 안 점들이 모두 방향 e 자리인지(0.118.0 판정 = snap 0이면 윤곽 밖 점이 있어 false) */
    const disc = (cx: number, cy: number, e: readonly number[], snap: number): boolean => {
      for (const r of [0, 3, 6, 9, 12, 15, 18, 21, 21.99])
        for (let k = 0; k < 32; k++) {
          const a = (k / 32) * 2 * Math.PI;
          if (!along(cubeHit(b, L, cx + r * Math.cos(a), cy + r * Math.sin(a), CUBE_TOUCH_BAND, snap)?.dir, e)) return false;
        }
      return true;
    };
    // 앞·위 모서리: 띠 길이 0.4 × 배율(45.5) × 띠 34.1 + 14
    const edgeY = top - SNAP + (band + SNAP) / 2;
    expect(disc(L.cx, edgeY, [0, -1, 1], SNAP)).toBe(true);
    expect(disc(L.cx, edgeY, [0, -1, 1], 0)).toBe(false);
    // 남동 등각 꼭짓점(오른쪽 위)
    const cx = right + SNAP - (band + SNAP) / 2;
    expect(disc(cx, edgeY, VIEW_DIRS.seIso, SNAP)).toBe(true);
    expect(disc(cx, edgeY, VIEW_DIRS.seIso, 0)).toBe(false);
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

type CW = { v: Viewer3d; cube: FakeElement; got: [boolean, ViewCubeExpandEvent['reason']][] };
function cubeView(opts: ConstructorParameters<typeof Viewer3d>[1] = {}): CW {
  const host = dom.host();
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, viewCubeSize: 76, ...opts });
  views.push(v);
  v.setScene({ name: 't', units: 'mm', meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1])], lines: [] });
  const got: CW['got'] = [];
  v.onViewCubeExpandedChange((x, e) => got.push([x, e.reason]));
  return { v, cube: host.querySelector('.v3d-cube')!, got };
}
let pid = 40;
/** 큐브 캔버스 위 (x, y)(큐브 CSS 화소)를 눌렀다 뗀다 */
function tap(el: FakeElement, x: number, y: number, pointerType = 'touch'): void {
  const id = ++pid;
  const ev = { clientX: x, clientY: y, pointerId: id, pointerType, button: 0, buttons: 1, isPrimary: true, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
  el.fire('pointerdown', ev);
  el.fire('pointerup', { ...ev, buttons: 0 });
}
const eye = (v: Viewer3d): number[] => cameraBasis(v.getCamera()).back.map((x) => +x.toFixed(6) + 0);
const unit = (d: readonly number[]): number[] => normalize(d as V3).map((x) => +x.toFixed(6) + 0);
/** 앞 면 뷰에서 큐브 한 변 size의 윗변·오른변(큐브 CSS 화소) */
function frontEdges(size: number): { cx: number; top: number; right: number } {
  const L = cubeLayout(size);
  return { cx: L.cx, top: L.cy - 0.5 * L.scale, right: L.cx + 0.5 * L.scale };
}

describe('뷰어: 손가락 편 큐브의 윤곽 밖 붙이기', () => {
  it('손가락: 편 큐브 윤곽 위 10화소 → 앞·위 모서리 뷰(pick), 16화소 → 접기만(cube), 면 가운데는 그대로 앞 뷰', () => {
    const w = cubeView();
    void w.v.setView('front', false);
    expect(eye(w.v)).toEqual(unit(VIEW_DIRS.front));
    const E = frontEdges(CUBE_TOUCH_SIZE);
    tap(w.cube, 38, 38);
    expect(w.v.viewCubeExpanded).toBe(true);
    tap(w.cube, E.cx, E.top - 10);
    expect(w.v.viewCubeExpanded).toBe(false);
    expect(eye(w.v)).toEqual(unit([0, -1, 1]));
    expect(w.got).toEqual([
      [true, 'touch'],
      [false, 'pick'],
    ]);
    // 더 먼 자리(허용치 14 밖)는 0.118.0처럼 고르지 않고 접는다
    void w.v.setView('front', false);
    tap(w.cube, 38, 38);
    tap(w.cube, E.cx, E.top - 16);
    expect(w.got.at(-1)).toEqual([false, 'cube']);
    expect(eye(w.v)).toEqual(unit(VIEW_DIRS.front));
    // 꼭짓점 바깥 대각선 → 남동 등각
    tap(w.cube, 38, 38);
    tap(w.cube, E.right + 6, E.top - 6);
    expect(w.got.at(-1)).toEqual([false, 'pick']);
    expect(eye(w.v)).toEqual(unit(VIEW_DIRS.seIso));
    // 면 가운데(윤곽 안)는 0.118.0 그대로
    void w.v.setView('front', false);
    tap(w.cube, 38, 38);
    tap(w.cube, CUBE_TOUCH_SIZE / 2, CUBE_TOUCH_SIZE / 2);
    expect(eye(w.v)).toEqual(unit(VIEW_DIRS.front));
    expect(w.got.at(-1)).toEqual([false, 'pick']);
  });

  it('등각 뷰: 육각형 위 꼭짓점 위 8화소 → 그 꼭짓점 뷰(북서 등각)', () => {
    const w = cubeView();
    void w.v.setView('seIso', false);
    tap(w.cube, 38, 38);
    expect(w.v.viewCubeExpanded).toBe(true);
    const L = cubeLayout(CUBE_TOUCH_SIZE);
    const B = cameraBasis(w.v.getCamera());
    const P: V3 = [-0.5, 0.5, 0.5];
    const x = L.cx + dot(P, B.right) * L.scale;
    const y = L.cy - dot(P, B.up) * L.scale;
    // 이 꼭짓점이 육각형 맨 위
    expect(y).toBeLessThan(L.cy - 0.8 * L.scale);
    tap(w.cube, x, y - 8);
    expect(w.got.at(-1)).toEqual([false, 'pick']);
    expect(eye(w.v)).toEqual(unit([-1, 1, 1]));
  });

  it('마우스·펜(접힌 76 큐브)·viewCubeTouch false 손가락은 윤곽 밖을 고르지 않는다(0.118.0 그대로), 펴지 못해 바로 고르는 손가락은 붙인다', () => {
    const w = cubeView();
    void w.v.setView('front', false);
    const E = frontEdges(76);
    for (const t of ['mouse', 'pen']) {
      tap(w.cube, E.cx, E.top - 5, t);
      expect(w.v.viewCubeExpanded).toBe(false);
      expect(eye(w.v)).toEqual(unit(VIEW_DIRS.front));
    }
    // 마우스는 윤곽 안 위 띠를 그대로 고른다
    tap(w.cube, E.cx, E.top + 2, 'mouse');
    expect(eye(w.v)).toEqual(unit([0, -1, 1]));
    expect(w.got).toEqual([]);

    const off = cubeView({ viewCubeTouch: false });
    void off.v.setView('front', false);
    tap(off.cube, E.cx, E.top - 5);
    expect(off.v.viewCubeExpanded).toBe(false);
    expect(eye(off.v)).toEqual(unit(VIEW_DIRS.front));

    // 편 크기(150)가 큐브(160)보다 크지 않아 펴지 못하면 손가락은 접힌 큐브에서 바로 고르고, 윤곽 밖 14화소 안은 붙인다
    const small = cubeView({ viewCubeSize: 160, viewCubeTouch: { size: 150 } });
    void small.v.setView('front', false);
    const S = frontEdges(160);
    tap(small.cube, S.cx, S.top - 10);
    expect(small.v.viewCubeExpanded).toBe(false);
    expect(eye(small.v)).toEqual(unit([0, -1, 1]));
    expect(small.got).toEqual([]);
  });

  it('붙이는 거리는 touchPickTolerance: 6이면 윤곽 위 10화소는 접기만, 5화소는 모서리 뷰', () => {
    const w = cubeView({ touchPickTolerance: 6 });
    void w.v.setView('front', false);
    const E = frontEdges(CUBE_TOUCH_SIZE);
    tap(w.cube, 38, 38);
    tap(w.cube, E.cx, E.top - 10);
    expect(w.got.at(-1)).toEqual([false, 'cube']);
    expect(eye(w.v)).toEqual(unit(VIEW_DIRS.front));
    tap(w.cube, 38, 38);
    tap(w.cube, E.cx, E.top - 5);
    expect(w.got.at(-1)).toEqual([false, 'pick']);
    expect(eye(w.v)).toEqual(unit([0, -1, 1]));
  });
});
