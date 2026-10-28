/**
 * 0.12.0 측정 잠금 보완.
 * - 선분 방향 잠금(edgeLineLock): 모서리 끝(첫 점)에서 그 모서리를 따라 다른 끝·가운데 점·교차점·선 위를 가리키면 Shift·setMeasureInferenceLock(true)가
 *   그 모서리 방향으로 잠근다(축과 나란하면 그 축). 첫 점 자리·첫 점을 지나지 않는 선분이면 잠그지 않는다
 * - 앱이 정한 방향 잠금(directionLock — setMeasureInferenceLock({ direction, edge?, kind? }))
 * - 찍은 측정 점(measurePoints), 미리 보기에서 잠글 방향(measureHoverLock), 측정 거리 글상자 자리(measureLabelRect)
 * 순수 함수와, 가짜 DOM·가짜 WebGL2로 만든 뷰어에 실제 포인터 사건을 넣어 본다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { Viewer3d } from '../src/viewer';
import { boxMesh } from '../src/synth';
import { axisLock, directionLock, edgeLineLock, unitDir } from '../src/inference';
import type { V3 } from '../src/math';
import type { LineSet3d, Scene3d } from '../src/types';

// ───────────── 순수 함수 ─────────────
describe('edgeLineLock(선분 방향 잠금)', () => {
  const A: V3 = [0, 0, 0], B: V3 = [60, 40, 0];
  const S1: [V3, V3] = [A, B];
  const u = unitDir(A, B)!;

  it('첫 점을 지나는 선분 위의 점: 축과 나란하면 그 축, 아니면 그 선분과 나란히(기준 선분은 복사본)', () => {
    expect(edgeLineLock([0, 0, 0], [0, 0, 30], [[[0, 0, 0], [0, 0, 30]]], 1e-9)).toEqual(axisLock('z'));
    // 선분 방향이 −축이어도 축 잠금은 +축
    expect(edgeLineLock([5, 0, 0], [0, 0, 0], [[[5, 0, 0], [0, 0, 0]]], 1e-9)).toEqual(axisLock('x'));
    const l = edgeLineLock(A, B, [S1], 1e-9)!;
    expect(l).toEqual({ kind: 'parallel', direction: u, edge: [A, B] });
    expect(l.edge![0]).not.toBe(A);
    // 가운데 점·선 위 아무 점, 선분의 다른 끝이 첫 점이어도
    expect(edgeLineLock(A, [30, 20, 0], [S1], 1e-9)).toEqual(l);
    expect(edgeLineLock(B, [12, 8, 0], [S1], 1e-9)).toEqual(l);
  });

  it('같은 직선 위 떨어진 선분도 된다(허용치 안 — float32 좌표)', () => {
    const f = new Float32Array([0.3, 0.7, 0.1].flatMap((v) => [v * 37, v * 41]));
    // 직선 (k·0.3, k·0.7, k·0.1) 위의 첫 점(k = 13)과 떨어진 선분(k = 37(float32) .. 90)
    const a: V3 = [0.3 * 13, 0.7 * 13, 0.1 * 13];
    const seg: [V3, V3] = [
      [f[0]!, f[2]!, f[4]!],
      [0.3 * 90, 0.7 * 90, 0.1 * 90],
    ];
    expect(edgeLineLock(a, seg[1], [seg], 1e-3)!.kind).toBe('parallel');
    // 허용치가 아주 작으면(float32 반올림만큼도 못 견디면) 잠그지 않는다
    expect(edgeLineLock(a, seg[1], [seg], 1e-12)).toBeNull();
  });

  it('첫 점 자리(여러 모서리가 만나는 꼭짓점)·첫 점을 지나지 않는 선분·선분 밖의 점이면 잠그지 않는다', () => {
    expect(edgeLineLock(A, A, [S1], 1e-6)).toBeNull();
    expect(edgeLineLock(A, [1e-9, 0, 0], [S1], 1e-6)).toBeNull();
    // 선분 직선이 첫 점을 지나지 않는다
    expect(edgeLineLock(A, [105, 40, 40], [[[105, 40, 0], [105, 40, 40]]], 1e-6)).toBeNull();
    // 첫 점을 지나지만 점이 그 선 위가 아니다
    expect(edgeLineLock(A, [105, 40, 40], [S1], 1e-6)).toBeNull();
    // 길이 0·수가 아닌 선분은 건너뛴다
    expect(edgeLineLock(A, B, [[A, A], [[NaN, 0, 0], B]], 1e-6)).toBeNull();
    expect(edgeLineLock(A, [NaN, 0, 0], [S1], 1e-6)).toBeNull();
  });

  it('맞는 선분 가운데 앞의 것(맞지 않는 선분은 건너뛴다). tolP를 따로 줄 수 있다', () => {
    const other: [V3, V3] = [
      [60, 40, 0],
      [105, 40, 0],
    ];
    expect(edgeLineLock(A, B, [other, S1], 1e-9)).toEqual({ kind: 'parallel', direction: u, edge: [A, B] });
    // 점이 직선에서 0.01 떨어짐: tolP가 받으면 잠근다
    const p: V3 = [30, 20, 0.01];
    expect(edgeLineLock(A, p, [S1], 1e-9)).toBeNull();
    expect(edgeLineLock(A, p, [S1], 1e-9, 0.02)!.kind).toBe('parallel');
  });
});

describe('directionLock(앱이 정한 방향 잠금)', () => {
  it('축과 나란한 방향은 그 축(+축), 아니면 나란함(단위 방향)', () => {
    expect(directionLock({ direction: [0, 0, 5] })).toEqual(axisLock('z'));
    expect(directionLock({ direction: [0, -2, 0] })).toEqual(axisLock('y'));
    expect(directionLock({ direction: new Float32Array([3, 4, 0]) as unknown as number[] })).toEqual({ kind: 'parallel', direction: [0.6, 0.8, 0] });
  });
  it('종류를 주면 따른다(축은 축과 나란할 때만)', () => {
    expect(directionLock({ direction: [3, 4, 0], kind: 'perpendicular' })).toEqual({ kind: 'perpendicular', direction: [0.6, 0.8, 0] });
    expect(directionLock({ direction: [1, 0, 0], kind: 'parallel' })).toEqual({ kind: 'parallel', direction: [1, 0, 0] });
    expect(directionLock({ direction: [3, 4, 0], kind: 'axis' })).toBeNull();
    expect(directionLock({ direction: [0, 0, -1], kind: 'axis' })).toEqual(axisLock('z'));
    expect(directionLock({ direction: [1, 0, 0], kind: 'twisted' as never })).toBeNull();
  });
  it('기준 선분: 방향이 없으면 그 방향, 있으면 함께 싣는다(복사본)', () => {
    const e: [V3, V3] = [
      [1, 1, 0],
      [4, 5, 0],
    ];
    const l = directionLock({ edge: e })!;
    expect(l).toEqual({ kind: 'parallel', direction: [0.6, 0.8, 0], edge: e });
    expect(l.edge![0]).not.toBe(e[0]);
    expect(directionLock({ direction: [0, 0, 1], edge: e })).toEqual({ ...axisLock('z'), edge: e });
  });
  it('잘못된 값은 null', () => {
    expect(directionLock(null)).toBeNull();
    expect(directionLock({})).toBeNull();
    expect(directionLock({ direction: [0, 0, 0] })).toBeNull();
    expect(directionLock({ direction: [NaN, 1, 0] })).toBeNull();
    expect(directionLock({ direction: [1, 2] as unknown as number[] })).toBeNull();
    expect(directionLock({ edge: [[0, 0, 0], [0, 0, 0]] })).toBeNull();
    expect(directionLock({ direction: [1, 0, 0], edge: [[0, 0, 0], [1, NaN, 0]] })).toBeNull();
  });
});

// ───────────── 뷰어 ─────────────
let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

/**
 * 선분: S1 대각 A → B, S2 B → C(X 방향), S3 C → D(Z 방향), S4 = S1과 (35.45…, 23.6…, 0)에서 엇갈리는 선분.
 * 상자(윤곽선 있음)는 오른쪽에 따로
 */
const A: V3 = [0, 0, 0], B: V3 = [60, 40, 0], C: V3 = [105, 40, 0], D: V3 = [105, 40, 40];
const E: V3 = [40, 10, 0], F: V3 = [30, 40, 0];
// S1과 S4의 교차점: S1 = A + t(B − A), S4 = E + s(F − E) — 60t = 40 − 10s, 40t = 10 + 30s → s = 5/11, t = 13/22
const X: V3 = [(60 * 13) / 22, (40 * 13) / 22, 0];
const path: LineSet3d = { id: 'path', positions: new Float32Array([...A, ...B, ...B, ...C, ...C, ...D, ...E, ...F]) };
const box = boxMesh('box', [200, 0, 0], [260, 40, 30], [0.7, 0.7, 0.7, 1]);
const scene: Scene3d = { name: 't', units: 'mm', meshes: [box], lines: [path], points: [] };
const uS1 = unitDir(A, B)!;

interface View {
  v: Viewer3d;
  canvas: FakeElement;
}
function view(mode: 'wireframe' | 'shaded' = 'wireframe'): View {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: mode });
  v.setScene(scene);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement };
}
const ptr = (w: View, type: string, x: number, y: number, buttons: number, shiftKey = false): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey, altKey: false, ctrlKey: false, metaKey: false });
const at = (w: View, p: readonly number[]): { x: number; y: number } => {
  const s = w.v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
/** 세계 점 자리에서 누르기(Shift를 누른 채면 shift) */
const clickAt = (w: View, p: readonly number[], shift = false): void => {
  const s = at(w, p);
  ptr(w, 'pointerdown', s.x, s.y, 1, shift);
  ptr(w, 'pointerup', s.x, s.y, 0, shift);
};
/** 세계 점 자리(화면에서 dx, dy 어긋나게)로 커서를 옮기고 그린다 */
const hoverAt = (w: View, p: readonly number[], shift = false, dx = 0, dy = 0): void => {
  const s = at(w, p);
  ptr(w, 'pointermove', s.x + dx, s.y + dy, 0, shift);
  w.v.renderNow();
};
const near = (p: readonly number[] | undefined, q: readonly number[], tol = 1e-4): boolean => !!p && Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!) <= tol;
/** 점 p에서 a를 지나는 단위 방향 e의 직선까지 거리 */
const lineDist = (p: readonly number[], a: readonly number[], e: readonly number[]): number => {
  const t = (p[0]! - a[0]!) * e[0]! + (p[1]! - a[1]!) * e[1]! + (p[2]! - a[2]!) * e[2]!;
  return Math.hypot(p[0]! - a[0]! - e[0]! * t, p[1]! - a[1]! - e[1]! * t, p[2]! - a[2]! - e[2]! * t);
};
const S1_LOCK = { kind: 'parallel', direction: uS1, edge: [A, B] };

describe('Viewer3d: 모서리 끝에서 그 모서리를 따라 가리킨 점 붙잡기로 잠그기', () => {
  it('Shift: 첫 점(대각 선분 끝)에서 다른 끝을 가리키면 그 선분 방향으로 잠그고, 선 밖을 가리켜도 그 선 위에 찍는다', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    // 나란함은 켜지 않는다(선분 방향 잠금은 나란함 추론과 따로 된다)
    v.setMeasureSnap({ midpoints: true, inference: { axes: true, lock: true } });
    clickAt(w, A);
    expect(v.measurePoints).toEqual([{ point: A, snap: 'endpoint' }]);
    hoverAt(w, B);
    const h = v.measureHoverSnap!;
    expect(h.snap).toBe('endpoint');
    expect(h.direction).toBeUndefined();
    expect('lineLock' in h).toBe(false);
    expect(v.measureHoverLock).toEqual(S1_LOCK);
    // Shift를 누른 채 같은 자리 → 잠금, 선 밖(C 쪽)으로
    hoverAt(w, B, true);
    expect(v.measureInferenceLock).toEqual({ ...S1_LOCK, source: 'shift' });
    hoverAt(w, C, true, 0, 30);
    const g = v.measureHoverSnap!;
    expect(g.locked).toBe(true);
    expect(g.snap).toBe('parallel');
    expect(lineDist(g.point, A, uS1)).toBeLessThan(1e-6);
    // 떼면 푼다
    hoverAt(w, B);
    expect(v.measureInferenceLock).toBeNull();
    // 다시 잠가 찍기
    hoverAt(w, B, true);
    const got: unknown[] = [];
    v.onMeasure((m) => got.push(m));
    hoverAt(w, [80, 70, 0], true);
    const s = at(w, [80, 70, 0]);
    ptr(w, 'pointerdown', s.x, s.y, 1, true);
    ptr(w, 'pointerup', s.x, s.y, 0, true);
    const m = got[0] as { b: V3; snapB: string; lockedB: boolean; directionB: V3 };
    expect(m.snapB).toBe('parallel');
    expect(m.lockedB).toBe(true);
    expect(m.directionB).toEqual(uS1);
    expect(lineDist(m.b, A, uS1)).toBeLessThan(1e-6);
    // 두 점째에서 풀린다. 찍은 점 둘은 measurement()와 같다
    expect(v.measureInferenceLock).toBeNull();
    const pts = v.measurePoints;
    expect(pts).toHaveLength(2);
    expect(pts[1]).toEqual({ point: m.b, snap: 'parallel', direction: uS1, locked: true });
    expect(pts.map((p) => p.point)).toEqual([v.measurement()!.a, v.measurement()!.b]);
  });

  it('가운데 점·교차점·붙잡지 않은 선 위 점도(앱 단추 setMeasureInferenceLock(true))', () => {
    for (const [name, p, inference] of [
      ['가운데 점', [30, 20, 0], { axes: true }],
      ['교차점', X, { intersections: true, axes: true }],
      ['선 위', [42, 28, 0], { axes: true }],
      ['선 위(추론 없이)', [42, 28, 0], null],
    ] as const) {
      const w = view();
      const { v } = w;
      v.setMeasureMode(true);
      v.setMeasureSnap({ midpoints: true, inference: inference ?? undefined });
      clickAt(w, A);
      hoverAt(w, p);
      const h = v.measureHoverSnap!;
      expect(h.snap, name).toBe(name === '가운데 점' ? 'midpoint' : name === '교차점' ? 'intersection' : null);
      expect(near(h.point, p, 1e-3), name).toBe(true);
      expect(v.measureHoverLock, name).toEqual(S1_LOCK);
      expect(v.setMeasureInferenceLock(true), name).toBe(true);
      expect(v.measureInferenceLock, name).toEqual({ ...S1_LOCK, source: 'api' });
    }
  });

  it('여러 선분이 만나는 끝점에서: 첫 점을 지나는 선분 방향(축과 나란하면 그 축)', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { lock: true } });
    // C는 S2(X)·S3(Z)의 끝
    clickAt(w, C);
    hoverAt(w, D);
    expect(v.measureHoverSnap!.snap).toBe('endpoint');
    expect(v.measureHoverLock).toEqual(axisLock('z'));
    hoverAt(w, B);
    expect(v.measureHoverLock).toEqual(axisLock('x'));
    hoverAt(w, B, true);
    expect(v.measureInferenceLock).toEqual({ ...axisLock('x'), source: 'shift' });
  });

  it('그물 윤곽선: 상자 구석에서 세 모서리가 만나는 다른 구석을 가리키면 그 둘을 잇는 모서리 방향', () => {
    for (const mode of ['wireframe', 'shaded'] as const) {
      const w = view(mode);
      const { v } = w;
      v.setMeasureMode(true);
      v.setMeasureSnap({ edges: true, inference: { axes: true, lock: true } });
      clickAt(w, [260, 0, 30]);
      expect(v.measurePoints[0]!.point).toEqual([260, 0, 30]);
      hoverAt(w, [260, 40, 30]);
      expect(v.measureHoverSnap!.snap, mode).toBe('endpoint');
      expect(v.measureHoverLock, mode).toEqual(axisLock('y'));
      // 커서를 다른 모서리(X·Z) 쪽으로 3화소 옮겨 고르기가 그 모서리를 골라도(구석 끝점 붙잡기는 그대로) 첫 점을 지나는 모서리 방향
      const c = at(w, [260, 40, 30]);
      for (const toward of [
        [200, 40, 30],
        [260, 40, 0],
      ]) {
        const o = at(w, toward);
        const l = Math.hypot(o.x - c.x, o.y - c.y);
        hoverAt(w, [260, 40, 30], false, (3 * (o.x - c.x)) / l, (3 * (o.y - c.y)) / l);
        expect(v.measureHoverSnap!.snap, mode).toBe('endpoint');
        expect(v.measureHoverSnap!.point, mode).toEqual([260, 40, 30]);
        expect(v.measureHoverLock, `${mode} ${toward}`).toEqual(axisLock('y'));
      }
      hoverAt(w, [200, 0, 30]);
      expect(v.measureHoverLock, mode).toEqual(axisLock('x'));
      // 첫 점을 지나는 모서리가 없는 구석(대각 건너편)
      hoverAt(w, [200, 40, 30]);
      expect(v.measureHoverSnap!.snap, mode).toBe('endpoint');
      expect(v.measureHoverLock, mode).toBeNull();
    }
  });

  it('잠그지 않는 경우: 첫 점 자리, 첫 점을 지나지 않는 선분의 끝', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, lock: true } });
    clickAt(w, A);
    hoverAt(w, A);
    expect(v.measureHoverSnap!.snap).toBe('endpoint');
    expect(v.measureHoverLock).toBeNull();
    hoverAt(w, A, true);
    expect(v.measureInferenceLock).toBeNull();
    hoverAt(w, D);
    expect(v.measureHoverSnap!.snap).toBe('endpoint');
    expect(v.measureHoverLock).toBeNull();
    hoverAt(w, D, true);
    expect(v.measureInferenceLock).toBeNull();
    expect(v.setMeasureInferenceLock(true)).toBe(false);
  });

  it('기존 동작: 선분 몸통 위 방향 추론(축)이 먼저, 첫 점 전에는 없다, 커서가 떠난 뒤 true는 마지막으로 본 방향', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true, lock: true } });
    hoverAt(w, B);
    expect(v.measureHoverLock).toBeNull();
    clickAt(w, C);
    // S3 몸통: 축 붙잡기(0.9.0) — 잠금도 그 축
    hoverAt(w, [105, 40, 13]);
    expect(v.measureHoverSnap!.snap).toBe('axis');
    expect(v.measureHoverLock).toEqual(axisLock('z'));
    // 첫 점 A에서 B(선분 방향 잠금)를 보고 캔버스를 떠난 뒤
    v.clearMeasure();
    clickAt(w, A);
    hoverAt(w, B);
    w.canvas.fire('pointerleave', {});
    w.v.renderNow();
    expect(v.measureHoverSnap).toBeNull();
    expect(v.measureHoverLock).toBeNull();
    expect(v.setMeasureInferenceLock(true)).toBe(true);
    expect(v.measureInferenceLock).toEqual({ ...S1_LOCK, source: 'api' });
  });

  it('Shift 잠금 선택(lock)이 없으면 Shift는 그대로 아무것도 잠그지 않는다', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true } });
    clickAt(w, A);
    hoverAt(w, B);
    expect(v.measureHoverLock).toEqual(S1_LOCK);
    hoverAt(w, B, true);
    expect(v.measureInferenceLock).toBeNull();
  });
});

describe('Viewer3d: 앱이 정한 방향 잠금·찍은 점·글상자 자리', () => {
  it('setMeasureInferenceLock({ direction }): 첫 점 전에 줘도 되고, 첫 점을 지나는 그 선 위에 찍는다', () => {
    const w = view();
    const { v } = w;
    expect(v.setMeasureInferenceLock({ direction: [1, 1, 0] })).toBe(false); // 측정 모드·붙잡기 선택이 없다
    v.setMeasureMode(true);
    expect(v.setMeasureInferenceLock({ direction: [1, 1, 0] })).toBe(false);
    v.setMeasureSnap({ midpoints: true });
    expect(v.setMeasureInferenceLock({ direction: [0, 0, 0] })).toBe(false);
    expect(v.measureInferenceLock).toBeNull();
    const e = unitDir([0, 0, 0], [1, 1, 0])!;
    expect(v.setMeasureInferenceLock({ direction: [1, 1, 0] })).toBe(true);
    expect(v.measureInferenceLock).toEqual({ kind: 'parallel', direction: e, source: 'api' });
    clickAt(w, A);
    expect(v.measureInferenceLock).not.toBeNull();
    hoverAt(w, C, false, 10, -20);
    const h = v.measureHoverSnap!;
    expect(h.locked).toBe(true);
    expect(h.snap).toBe('parallel');
    expect(lineDist(h.point, A, e)).toBeLessThan(1e-6);
    // 점 붙잡기(C)면 그 점을 선에 수직으로 내린 자리(from)
    hoverAt(w, C);
    expect(v.measureHoverSnap!.from).toEqual(C);
    expect(lineDist(v.measureHoverSnap!.point, A, e)).toBeLessThan(1e-6);
    // 축 방향은 축 잠금, 기준 선분은 미리 보기에 실린다
    const edge: [V3, V3] = [
      [200, 0, 0],
      [200, 0, 30],
    ];
    expect(v.setMeasureInferenceLock({ direction: [0, 0, -3], edge })).toBe(true);
    expect(v.measureInferenceLock).toEqual({ ...axisLock('z'), edge, source: 'api' });
    hoverAt(w, B, false, 0, -40);
    expect(v.measureHoverSnap!.axis).toBe('z');
    expect(v.measureHoverSnap!.edge).toEqual(edge);
    // 잘못된 값은 앞 잠금을 그대로 두고 false
    expect(v.setMeasureInferenceLock({ direction: [3, 4, 0], kind: 'axis' })).toBe(false);
    expect(v.measureInferenceLock?.axis).toBe('z');
    expect(v.setMeasureInferenceLock(false)).toBe(false);
    expect(v.measureInferenceLock).toBeNull();
  });

  it('measurePoints: 붙잡기 선택이 없어도 0.7.2 규칙의 종류, 지우면 빈 목록, 복사본', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    expect(v.measurePoints).toEqual([]);
    clickAt(w, A);
    const p = v.measurePoints;
    expect(p).toEqual([{ point: A, snap: 'endpoint' }]);
    p[0]!.point[0] = 99;
    expect(v.measurePoints[0]!.point).toEqual(A);
    // 빈 곳(붙잡지 않은 점)은 종류 null
    clickAt(w, [30, 20, 0]);
    expect(v.measurePoints[1]!.snap).toBeNull();
    expect(v.measurePoints[1]!.point.map((x) => +x.toFixed(3))).toEqual([30, 20, 0]);
    v.clearMeasure();
    expect(v.measurePoints).toEqual([]);
  });

  it('measureLabelRect: 거리 글상자를 그린 자리(캔버스 안), 그리지 않으면 null', () => {
    const w = view();
    const { v } = w;
    v.setMeasureMode(true);
    v.setMeasureSnap({ inference: { axes: true } });
    expect(v.measureLabelRect).toBeNull();
    clickAt(w, A);
    v.renderNow();
    // 첫 점만(미리 보기 없음)이면 글상자도 없다
    expect(v.measureLabelRect).toBeNull();
    hoverAt(w, B);
    const r = v.measureLabelRect!;
    expect(r.width).toBeGreaterThan(14);
    expect(r.height).toBe(2 * 16 + 8);
    expect(r.x).toBeGreaterThanOrEqual(4);
    expect(r.y).toBeGreaterThanOrEqual(4);
    expect(r.x + r.width).toBeLessThanOrEqual(800 - 4);
    expect(r.y + r.height).toBeLessThanOrEqual(600 - 4);
    // 글상자는 A·B 화면 가운데의 오른쪽 위
    const a = at(w, A), b = at(w, B);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    expect(r.x).toBeCloseTo(Math.min(Math.max(4, mx + 10), 800 - r.width - 4), 6);
    expect(r.y).toBeCloseTo(Math.min(Math.max(4, my - r.height - 8), 600 - r.height - 4), 6);
    r.x = -1;
    expect(v.measureLabelRect!.x).not.toBe(-1);
    // 글 꼴이 세 줄이면 높이도
    v.setMeasureFormat(() => ['a', 'b', 'c']);
    v.renderNow();
    expect(v.measureLabelRect!.height).toBe(3 * 16 + 8);
    v.clearMeasure();
    v.renderNow();
    expect(v.measureLabelRect).toBeNull();
  });
});
