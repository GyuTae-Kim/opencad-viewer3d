/**
 * 0.27.0
 * - 그물 일부 면만 판 너머 고르기에서 지나가게 하기(순수 pickScene의 pickThrough, Viewer3d.setItemPickThrough) — 포켓 뚜껑만 지나 바닥·그 아래 구멍을 고르고
 *   벽에서는 멈추는지, 불투명 그물도 그 면은 지나는지, 가림·throughTranslucent 없는 고르기·front는 그대로인지, BVH·나눠 올리기·setMesh·문맥 복구 뒤에도 남는지
 * - 끌어온 점의 나란함·수직을 뷰어 측정 붙잡기에(MeasureInference.trackDirs) — 차례·잠금·머무르기·그리기·찍은 값, 켜지 않으면 그대로
 * - 뷰어 글상자 기본 자리(Viewer3d.setMeasureLabelSpot) — 측정 거리 글상자·덧그림 글상자, 주지 않으면 그대로
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { buildBvh } from '../src/bvh';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { normalizeInference } from '../src/inference';
import type { V3 } from '../src/math';
import { labelSpotName, placeLabelAmong, placeMeasureLabel } from '../src/measurelabel';
import { type ScenePickOptions, pickScene } from '../src/scenepick';
import type { SnapRefineFaceInput } from '../src/snap';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import type { Mesh3d, Pick3d, Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

/**
 * NC 판재 꼴: 반투명 판(알파 0.35, z 0~20) 안 반투명 포켓(알파 0.75, z 6~16 — 그물 하나: 삼각형 0·1 바닥, 2·3 뚜껑, 4~11 벽),
 * 포켓 바닥 아래 불투명 구멍(z 1~5), 판 아래 불투명 바닥(z −20~−5), 포켓 안 선분(z 10)
 */
const BOARD = boxMesh('판', [0, 0, 0], [100, 80, 20], [0.86, 0.74, 0.55, 0.35]);
const POCKET = boxMesh('포켓', [30, 20, 6], [70, 60, 16], [0.55, 0.3, 0.7, 0.75]);
const HOLE = boxMesh('구멍', [44, 34, 1], [56, 46, 5], [0.3, 0.3, 0.35, 1]);
const BASE = boxMesh('바닥', [0, 0, -20], [100, 80, -5], [0.6, 0.6, 0.7, 1]);
const GROOVE_LINE = { id: '금', positions: new Float32Array([35, 40, 10, 65, 40, 10]) };
const LID = [{ start: 2, count: 2 }];
const LID_FLOOR = [{ start: 0, count: 4 }];

// ───────────── 1. 순수 함수: pickScene pickThrough ─────────────
describe('pickScene pickThrough(0.27.0 — throughTranslucent가 지나갈 그물의 일부 삼각형)', () => {
  // 위에서 조금 기울여 내려다본다(광선 방향 (−0.3, 0.4, −1) 쪽)
  const a = dirToAngles([0.3, -0.4, 1]);
  const cam: CameraState = { ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [50, 40, 0], distance: 260, projection: 'perspective' };
  const f = computeFrame(cam, 600, 400, { center: [50, 40, 0], radius: 90 });
  const at = (p: readonly number[]): [number, number] => {
    const s = projectToScreen(f, p)!;
    return [s[0], s[1]];
  };
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
  const items = { meshes: [BOARD, POCKET, HOLE, BASE], lines: [], points: [] };
  const pocketOpaque = (m: { id: string }): boolean => m.id === '포켓';
  const tester = (r: { start: number; count: number }[]) => (i: number) => r.some((x) => i >= x.start && i < x.start + x.count);
  const pass = (id: string, r: { start: number; count: number }[]) => (m: Mesh3d) => (m.id === id ? tester(r) : null);
  const thru = (o: Partial<ScenePickOptions> = {}): ScenePickOptions => opts({ throughTranslucent: true, pickOpaque: pocketOpaque, ...o });

  it('포켓 가운데: 뚜껑만 지나면 포켓 바닥, 바닥도 지나면 그 아래 구멍. 지나갈 것이 없으면 0.26.0처럼 뚜껑', () => {
    const [x, y] = at([50.3, 40.2, 16]);
    const lid = pickScene(f, x, y, items, thru())!.pick;
    expect(lid).toMatchObject({ kind: 'mesh', id: '포켓', normal: [0, 0, 1] });
    expect([2, 3]).toContain(lid.index);
    const floor = pickScene(f, x, y, items, thru({ pickThrough: pass('포켓', LID) }))!;
    expect(floor.pick).toMatchObject({ kind: 'mesh', id: '포켓' });
    expect([0, 1]).toContain(floor.pick.index);
    expect(floor.pick.point[2]).toBeCloseTo(6, 6);
    // 바닥의 면 법선은 눈 쪽(위)
    expect(floor.pick.normal![2]).toBeGreaterThan(0.99);
    expect(floor.corners!.every((c) => Math.abs(c[2] - 6) < 1e-9)).toBe(true);
    const hole = pickScene(f, x, y, items, thru({ pickThrough: pass('포켓', LID_FLOOR) }))!.pick;
    expect(hole).toMatchObject({ kind: 'mesh', id: '구멍' });
    expect(hole.point[2]).toBeCloseTo(5, 6);
    // 지나갈 것이 없는 함수는 0.26.0과 같다
    expect(pickScene(f, x, y, items, thru({ pickThrough: () => null }))).toEqual(pickScene(f, x, y, items, thru()));
    expect(pickScene(f, x, y, items, thru({ pickThrough: pass('없음', LID) }))).toEqual(pickScene(f, x, y, items, thru()));
  });

  it('벽 가까이: 뚜껑을 지난 광선이 안에서 벽을 맞으면 벽에서 멈춘다(벽은 지나지 않는다)', () => {
    const [x, y] = at([31, 40.2, 16]);
    const w = pickScene(f, x, y, items, thru({ pickThrough: pass('포켓', LID) }))!.pick;
    expect(w).toMatchObject({ kind: 'mesh', id: '포켓' });
    expect([10, 11]).toContain(w.index); // 왼쪽 벽(x = 30)
    expect(w.point[0]).toBeCloseTo(30, 6);
    expect(w.point[2]).toBeGreaterThan(6);
    expect(w.point[2]).toBeLessThan(16);
  });

  it('바닥까지 지나 구멍 밖이면 판을 지나 바닥 그물, 반투명 그물뿐이면 가장 앞 면(지나는 뚜껑일 수도)', () => {
    const [x, y] = at([65.3, 25.2, 16]);
    expect(pickScene(f, x, y, items, thru({ pickThrough: pass('포켓', LID_FLOOR) }))!.pick).toMatchObject({ kind: 'mesh', id: '바닥' });
    // 불투명 그물이 없는 장면: 모두 지나면 예전처럼 가장 앞의 면 — 판 윗면
    const only = { meshes: [BOARD, POCKET], lines: [], points: [] };
    const p = pickScene(f, x, y, only, thru({ pickThrough: pass('포켓', [{ start: 0, count: 12 }]) }))!.pick;
    expect(p).toEqual(pickScene(f, x, y, only, opts())!.pick);
    expect(p.id).toBe('판');
  });

  it('불투명 그물도 지나갈 삼각형에서는 지나 그 뒤(같은 그물의 안쪽 면)를 고른다. throughTranslucent가 없으면 보지 않는다', () => {
    const [x, y] = at([80.3, 15.2, -5]);
    const top = pickScene(f, x, y, items, thru())!.pick;
    expect(top).toMatchObject({ id: '바닥' });
    expect(top.point[2]).toBeCloseTo(-5, 6);
    const under = pickScene(f, x, y, items, thru({ pickThrough: pass('바닥', LID) }))!.pick;
    expect(under).toMatchObject({ kind: 'mesh', id: '바닥' });
    expect([0, 1]).toContain(under.index);
    expect(under.point[2]).toBeCloseTo(-20, 6);
    expect(pickScene(f, x, y, items, opts({ pickThrough: pass('바닥', LID) }))).toEqual(pickScene(f, x, y, items, opts()));
  });

  it('여러 단면 고르기 길도 같고, 숨긴 삼각형과 함께 건너뛴다', () => {
    const [x, y] = at([50.3, 40.2, 16]);
    const multi = { clips: () => [] };
    for (const r of [LID, LID_FLOOR])
      expect(pickScene(f, x, y, items, thru({ ...multi, pickThrough: pass('포켓', r) }))!.pick).toEqual(pickScene(f, x, y, items, thru({ pickThrough: pass('포켓', r) }))!.pick);
    // 바닥을 숨기고(구간 숨김) 뚜껑만 지나면 구멍
    const hidden = (it: { id: string }) => (it.id === '포켓' ? tester([{ start: 0, count: 2 }]) : null);
    expect(pickScene(f, x, y, items, thru({ hidden, pickThrough: pass('포켓', LID) }))!.pick.id).toBe('구멍');
    expect(pickScene(f, x, y, items, thru({ ...multi, hidden, pickThrough: pass('포켓', LID) }))!.pick.id).toBe('구멍');
  });

  it('가림은 그대로: 포켓 안 선분은 고르고, 불투명 그물 안 선분은 그 그물 면을 지나게 해도 가린다', () => {
    const [lx, ly] = at([50, 40, 10]);
    expect(pickScene(f, lx + 0.4, ly + 0.3, { ...items, lines: [GROOVE_LINE] }, thru({ pickThrough: pass('포켓', LID) }))!.pick).toMatchObject({ kind: 'line', id: '금' });
    const inner = { id: '속', positions: new Float32Array([75, 12, -12, 88, 12, -12]) };
    const [ix, iy] = at([81, 12, -12]);
    for (const o of [thru(), thru({ pickThrough: pass('바닥', LID) })]) expect(pickScene(f, ix + 0.3, iy + 0.4, { ...items, lines: [inner] }, o)!.pick.kind).toBe('mesh');
  });

  it('화면 격자: 지나갈 삼각형을 주지 않거나 throughTranslucent가 없으면 0.26.0 고르기와 모두 같다', () => {
    const lines = [GROOVE_LINE];
    const all = { ...items, lines };
    let n = 0;
    for (let y = 13; y < 400; y += 29)
      for (let x = 11; x < 600; x += 31) {
        expect(pickScene(f, x + 0.3, y + 0.4, all, thru({ pickThrough: () => undefined }))).toEqual(pickScene(f, x + 0.3, y + 0.4, all, thru()));
        expect(pickScene(f, x + 0.3, y + 0.4, all, opts({ pickThrough: pass('포켓', LID_FLOOR), edges: true }))).toEqual(pickScene(f, x + 0.3, y + 0.4, all, opts({ edges: true })));
        n++;
      }
    expect(n).toBeGreaterThan(200);
  });
});

// ───────────── 뷰어 공통 ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  for (const v of views) v.dispose();
  vi.useRealTimers();
  dom.restore();
});

const ptrEvent = (v: Viewer3d, type: string, x: number, y: number, buttons: number, shiftKey = false): void =>
  (v.canvas as unknown as { fire: (t: string, e: object) => void }).fire(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: type === 'pointermove' ? -1 : 0,
    buttons,
    shiftKey,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  });
const hoverXY = (v: Viewer3d, x: number, y: number, shiftKey = false): void => {
  ptrEvent(v, 'pointermove', x, y, 0, shiftKey);
  v.renderNow();
};
const clickXY = (v: Viewer3d, x: number, y: number): void => {
  hoverXY(v, x, y);
  ptrEvent(v, 'pointerdown', x, y, 1);
  ptrEvent(v, 'pointerup', x, y, 0);
  v.renderNow();
};
const scr = (v: Viewer3d, p: readonly number[]): { x: number; y: number } => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const fire = (v: Viewer3d, type: string): void => (v.canvas as unknown as FakeElement).fire(type, {});

// ───────────── 2. 뷰어: setItemPickThrough ─────────────
describe('Viewer3d: 그물 일부 면만 판 너머 고르기에서 지나가게 하기(0.27.0 setItemPickThrough)', () => {
  const sc: Scene3d = { name: 'p', units: 'mm', meshes: [BOARD, POCKET, HOLE, BASE], lines: [GROOVE_LINE], points: [] };
  function make(opts: Parameters<Viewer3d['setScene']>[1] = {}, pocket = true): Viewer3d {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    v.setScene(sc, opts);
    v.setCamera({ ...v.getCamera(), ...dirToAngles([0.3, -0.4, 1]) });
    v.fit(false);
    if (pocket) v.setItemPickOpaque('포켓', true);
    v.renderNow();
    return v;
  }
  const P: V3 = [50.3, 40.2, 16];

  it('pick: 뚜껑만 지나면 포켓 바닥, 바닥도 지나면 구멍. 주지 않은 고르기·끄면 그대로', () => {
    const v = make();
    const s = scr(v, P);
    const plain = v.pick(s.x, s.y), lid = v.pick(s.x, s.y, { throughTranslucent: true });
    expect(plain).toMatchObject({ id: '판' });
    expect(lid).toMatchObject({ id: '포켓', normal: [0, 0, 1] });
    v.setItemPickThrough('포켓', LID);
    const floor = v.pick(s.x, s.y, { throughTranslucent: true })!;
    expect(floor).toMatchObject({ kind: 'mesh', id: '포켓' });
    expect(floor.point[2]).toBeCloseTo(6, 6);
    expect([0, 1]).toContain(floor.index);
    expect(v.pick(s.x, s.y, { throughTranslucent: true, meshesOnly: true })).toEqual(floor);
    expect(v.pick(s.x, s.y)).toEqual(plain);
    v.setItemPickThrough('포켓', LID_FLOOR);
    expect(v.pick(s.x, s.y, { throughTranslucent: true })).toMatchObject({ id: '구멍' });
    // 포켓 안 선분은 그대로 고른다
    const l = scr(v, [50, 40, 10]);
    expect(v.pick(l.x + 0.4, l.y + 0.3, { throughTranslucent: true })).toMatchObject({ kind: 'line', id: '금' });
    v.setItemPickThrough('포켓', null);
    expect(v.pick(s.x, s.y, { throughTranslucent: true })).toEqual(lid);
    v.setItemPickThrough('포켓', LID);
    v.setItemPickThrough('포켓', []);
    expect(v.pick(s.x, s.y, { throughTranslucent: true })).toEqual(lid);
  });

  it('겉모습 상태: itemLook에 합친 구간(복사본), 같은 값은 그대로, 그물이 아닌 id는 무시, clearItemLooks·setScene·removeMesh로 비운다', () => {
    const v = make({}, false);
    expect(v.itemLook('포켓')).toBeNull();
    v.setItemPickThrough('포켓', [
      { start: 3, count: 1 },
      { start: 2, count: 1 },
      { start: 10, count: 9 },
    ]);
    const look = v.itemLook('포켓')!;
    expect(look).toEqual({
      pickable: true,
      pickThrough: [
        { start: 2, count: 2 },
        { start: 10, count: 2 },
      ],
    });
    look.pickThrough![0]!.count = 99;
    expect(v.itemLook('포켓')!.pickThrough![0]).toEqual({ start: 2, count: 2 });
    v.setItemPickOpaque('포켓', true);
    expect(v.itemLook('포켓')).toMatchObject({ pickOpaque: true, pickThrough: [{ start: 2, count: 2 }, { start: 10, count: 2 }] });
    v.setItemPickThrough('포켓', null);
    expect(v.itemLook('포켓')).toEqual({ pickable: true, pickOpaque: true });
    v.setItemPickOpaque('포켓', false);
    expect(v.itemLook('포켓')).toBeNull();
    // 선분 묶음·없는 id는 무시
    v.setItemPickThrough('금', LID);
    v.setItemPickThrough('없음', LID);
    expect(v.itemLook('금')).toBeNull();
    expect(v.itemLook('없음')).toBeNull();
    // 범위 밖만 주면 없다
    v.setItemPickThrough('포켓', [{ start: 50, count: 3 }]);
    expect(v.itemLook('포켓')).toBeNull();
    v.setItemPickThrough('포켓', LID);
    v.clearItemLooks();
    expect(v.itemLook('포켓')).toBeNull();
    v.setItemPickThrough('포켓', LID);
    v.setScene(sc, { keepView: true });
    expect(v.itemLook('포켓')).toBeNull();
    v.setItemPickThrough('포켓', LID);
    v.removeMesh('포켓');
    expect(v.itemLook('포켓')).toBeNull();
  });

  it('그림은 바뀌지 않는다(그리기 기록이 같다)', () => {
    const v = make();
    const gl = (v.canvas as unknown as FakeElement).gl as FakeGL;
    const frame = (): DrawEntry[] => {
      gl.draws = [];
      gl.logDraws = true;
      v.renderNow();
      gl.logDraws = false;
      return gl.draws;
    };
    v.setItemOpacity('바닥', 1);
    const before = frame();
    expect(before.length).toBeGreaterThan(0);
    v.setItemPickThrough('포켓', LID_FLOOR);
    v.setItemPickThrough('바닥', LID);
    expect(frame()).toEqual(before);
  });

  it('onPick: throughTranslucent 알림은 포켓 바닥, 같은 누르기의 front는 가장 앞(판), 선택 없이 단 알림은 판', () => {
    const v = make();
    v.setItemPickThrough('포켓', LID);
    const log: [string, Pick3d | null, Pick3d | null | undefined][] = [];
    v.onPick((p) => log.push(['plain', p, undefined]));
    v.onPick((p, e) => log.push(['thru', p, e.front]), { throughTranslucent: true, front: true });
    const s = scr(v, P);
    clickXY(v, s.x, s.y);
    expect(log.map((e) => [e[0], e[1]?.id])).toEqual([
      ['plain', '판'],
      ['thru', '포켓'],
    ]);
    expect(log[1]![1]!.point[2]).toBeCloseTo(6, 6);
    expect(log[1]![2]).toBe(log[0]![1]);
  });

  it('BVH를 만들기 전·뒤, 나눠 올리는 중, setMesh로 바꾼 뒤, 문맥을 잃었다 되찾은 뒤에도 같은 고르기', () => {
    const grid = (v: Viewer3d): unknown[] => {
      const out: unknown[] = [];
      for (const p of [P, [31, 40.2, 16], [65.3, 25.2, 16], [80.3, 15.2, -5]]) {
        const s = scr(v, p);
        out.push(v.pick(s.x + 0.3, s.y + 0.2, { throughTranslucent: true }));
      }
      return out;
    };
    // 기준: 한 번에 올리고 BVH를 다 만든 뒤
    const ref = make();
    ref.setItemPickThrough('포켓', LID);
    ref.setItemPickThrough('바닥', LID);
    vi.advanceTimersByTime(2000);
    const want = grid(ref);
    expect((want[0] as Pick3d).point[2]).toBeCloseTo(6, 6);
    expect((want[3] as Pick3d).point[2]).toBeCloseTo(-20, 6);
    // BVH 타이머 전(고르기가 바로 만든다)
    const v = make();
    v.setItemPickThrough('포켓', LID);
    v.setItemPickThrough('바닥', LID);
    expect(grid(v)).toEqual(want);
    vi.advanceTimersByTime(2000);
    expect(grid(v)).toEqual(want);
    // 나눠 올리는 중(그리기 전 — 그리면 올리기가 이어진다)
    const inc = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(inc);
    inc.setScene(sc, { incremental: { budgetMs: 0 } });
    inc.setCamera(ref.getCamera());
    inc.setItemPickOpaque('포켓', true);
    inc.setItemPickThrough('포켓', LID);
    inc.setItemPickThrough('바닥', LID);
    expect((inc as unknown as { renderer: { uploading: boolean } }).renderer.uploading).toBe(true);
    expect(grid(inc)).toEqual(want);
    // setMesh(같은 삼각형 수 — 색만): 남는다
    v.setMesh({ ...POCKET, color: [0.55, 0.3, 0.7, 0.7] });
    expect(v.itemLook('포켓')).toMatchObject({ pickOpaque: true, pickThrough: LID });
    expect(grid(v)).toEqual(want);
    // 문맥을 잃었다 되찾아도 남는다
    fire(v, 'webglcontextlost');
    fire(v, 'webglcontextrestored');
    v.renderNow();
    expect(v.itemLook('바닥')).toEqual({ pickable: true, pickThrough: LID });
    expect(grid(v)).toEqual(want);
    // 삼각형 수가 줄면 새 수로 자른다(모두 밖이면 지운다)
    const quad: Mesh3d = { id: '포켓', name: '포켓', positions: new Float32Array([30, 20, 16, 70, 20, 16, 70, 60, 16, 30, 60, 16]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]), color: [0.55, 0.3, 0.7, 0.75] };
    v.setItemPickThrough('포켓', [{ start: 1, count: 3 }]);
    v.setMesh(quad);
    expect(v.itemLook('포켓')!.pickThrough).toEqual([{ start: 1, count: 1 }]);
    v.setMesh({ ...quad, indices: new Uint32Array([0, 1, 2]) });
    expect(v.itemLook('포켓')).toEqual({ pickable: true, pickOpaque: true });
  });

  it('측정: 미리 보기·찍은 점·축이 면을 뚫는 점·onFace 다듬기·pointsFor가 지나간 뒤의 포켓 바닥을 본다', () => {
    // 첫 점(앱 점)은 포켓 안 선분(y = 40) 둘레를 피한 자리 위
    const C: V3 = [50, 30, 60];
    const v = make();
    v.setItemPickThrough('포켓', LID);
    v.setMeasureMode(true);
    const faces: SnapRefineFaceInput[] = [];
    const picks: Pick3d[] = [];
    v.setMeasureSnap({
      throughTranslucent: true,
      refineFace: (c) => (faces.push(c), null),
      pointsFor: (p) => (picks.push(p), null),
    });
    const s = scr(v, P);
    hoverXY(v, s.x, s.y);
    expect(v.measureHoverSnap!.point[2]).toBeCloseTo(6, 6);
    expect(faces.at(-1)).toMatchObject({ kind: 'onFace', face: { id: '포켓' } });
    expect([0, 1]).toContain(faces.at(-1)!.face.index);
    expect(picks.at(-1)).toMatchObject({ kind: 'mesh', id: '포켓' });
    expect(picks.at(-1)!.point[2]).toBeCloseTo(6, 6);
    clickXY(v, s.x, s.y);
    expect(v.measurePoints[0]!.point[2]).toBeCloseTo(6, 6);
    v.clearMeasure();
    v.setMeasureSnap({ points: [{ point: C, kind: 'point' }], inference: { axes: true, axisFaces: true }, throughTranslucent: true });
    const c = scr(v, C);
    clickXY(v, c.x + 1, c.y);
    expect(v.measurePoints[0]!.point).toEqual(C);
    const q = scr(v, [50, 30, 6]);
    hoverXY(v, q.x + 3, q.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'axis', axis: 'z', face: { id: '포켓' } });
    expect(dist(h.point, [50, 30, 6])).toBeLessThan(1e-9);
    // 지나갈 삼각형을 지우면 0.26.0처럼 뚜껑
    v.setItemPickThrough('포켓', null);
    const q2 = scr(v, [50, 30, 16]);
    hoverXY(v, q2.x + 3, q2.y + 1);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'z', face: { id: '포켓' } });
    expect(dist(v.measureHoverSnap!.point, [50, 30, 16])).toBeLessThan(1e-9);
  });
});

// ───────────── 3. 뷰어: 끌어온 점의 나란함·수직(inference.trackDirs) ─────────────
/**
 * 끌어온 점 E = (80, 20, 0), 기준 선분 '기준' (20, 60, 0) → (60, 90, 0)(방향 (0.8, 0.6, 0)), 첫 점 A = (0, 0, 0)('가'의 끝).
 * E에서 나란한 선: E + t·(0.8, 0.6, 0). E에서 기준 직선으로 내린 수직: 발 (39.2, 74.4, 0), 방향 (−0.6, 0.8, 0)
 */
const A: V3 = [0, 0, 0];
const E: V3 = [80, 20, 0];
const R0: V3 = [20, 60, 0], R1: V3 = [60, 90, 0];
const PAR: V3 = [0.8, 0.6, 0], PERP: V3 = [-0.6, 0.8, 0];
const along = (o: V3, d: V3, t: number): V3 => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
const lineDist = (p: readonly number[], o: V3, d: V3): number => {
  const w = [p[0]! - o[0], p[1]! - o[1], p[2]! - o[2]];
  const t = w[0]! * d[0] + w[1]! * d[1] + w[2]! * d[2];
  return Math.hypot(w[0]! - d[0] * t, w[1]! - d[1] * t, w[2]! - d[2] * t);
};
const dirScene: Scene3d = {
  name: 'd',
  units: 'mm',
  meshes: [],
  lines: [
    { id: '가', positions: new Float32Array([...A, 0, -20, 0]) },
    { id: '기준', positions: new Float32Array([...R0, ...R1]) },
    { id: '나', positions: new Float32Array([...E, 80, 10, 0]) },
  ],
  points: [],
};

describe('Viewer3d: 끌어온 점의 나란함·수직(0.27.0 inference.trackDirs)', () => {
  function make(): Viewer3d {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'wireframe' });
    views.push(v);
    v.setScene(dirScene);
    v.setView('top', false);
    v.fit(false);
    v.renderNow();
    v.setMeasureMode(true);
    return v;
  }
  /** 기준 선분 위를 지나가게 한다(나란함 기준 — 가운데쯤 옆) */
  const passRef = (v: Viewer3d): void => {
    const s = scr(v, [41, 75.75, 0]);
    hoverXY(v, s.x + 0.4, s.y + 0.3);
    expect(v.measureHoverSnap).toMatchObject({ segment: { id: '기준' } });
  };
  const PAR_AT = along(E, PAR, 30); // (104, 38, 0)
  const PERP_AT = along(E, PERP, 25); // (65, 40, 0)

  it('normalizeInference: 켰을 때만 trackDirs 열쇠(끄면 0.26.0과 같은 꼴), 이것만 켜도 null이 아니다', () => {
    expect(normalizeInference({ track: true })).not.toHaveProperty('trackDirs');
    expect(normalizeInference({ track: true, trackDirs: true })).toMatchObject({ trackDirs: true, track: { dwellMs: 500 } });
    expect(normalizeInference({ trackDirs: true })).toMatchObject({ trackDirs: true });
    expect(normalizeInference(true)).not.toHaveProperty('trackDirs');
  });

  it('첫 점 전: 끌어온 점에서 기준 선분과 나란한 선·수직인 선 위 점(방향·잠글 것 없음, 기준 선분과 끌어온 점이 실린다)', () => {
    const v = make();
    v.setMeasureSnap({ edges: true, inference: { axes: true, track: true, trackDirs: true } });
    v.setMeasureTrackPoints([E]);
    passRef(v);
    const p = scr(v, PAR_AT);
    hoverXY(v, p.x + 2, p.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'parallel', trackFrom: E, edge: [R0, R1] });
    expect(h).not.toHaveProperty('direction');
    expect(lineDist(h.point, E, PAR)).toBeLessThan(1e-9);
    expect(dist(h.point, PAR_AT)).toBeLessThan(1);
    const q = scr(v, PERP_AT);
    hoverXY(v, q.x + 2, q.y + 1);
    const g = v.measureHoverSnap!;
    expect(g).toMatchObject({ snap: 'perpendicular', trackFrom: E, edge: [R0, R1] });
    expect(lineDist(g.point, E, PERP)).toBeLessThan(1e-9);
    expect(g).not.toHaveProperty('direction');
    expect(g).not.toHaveProperty('segment');
  });

  it('켜지 않으면 그 자리는 끌어온 점 안내가 아니다(0.26.0 그대로), 기준 선분을 지나지 않았으면 없다', () => {
    const v = make();
    v.setMeasureSnap({ edges: true, inference: { axes: true, track: true } });
    v.setMeasureTrackPoints([E]);
    passRef(v);
    for (const at of [PAR_AT, PERP_AT]) {
      const p = scr(v, at);
      hoverXY(v, p.x + 2, p.y + 1);
      const h = v.measureHoverSnap;
      expect(h?.snap === 'parallel' || h?.snap === 'perpendicular').toBe(false);
    }
    const w = make();
    w.setMeasureSnap({ edges: true, inference: { axes: true, track: true, trackDirs: true } });
    w.setMeasureTrackPoints([E]);
    const p = scr(w, PAR_AT);
    hoverXY(w, p.x + 2, p.y + 1);
    expect(w.measureHoverSnap?.snap === 'parallel').toBe(false);
  });

  it('차례: 끌어온 점의 축이 더 가까우면 축, 첫 점 축이 먼저. 찍은 값에 끌어온 점, 잠글 방향 없음', () => {
    const v = make();
    const got: { snapB?: string | null; distance: number }[] = [];
    v.onMeasure((m) => m && got.push(m));
    v.setMeasureSnap({ edges: true, inference: { axes: true, track: true, trackDirs: true } });
    // 첫 점 A
    const a = scr(v, A);
    clickXY(v, a.x + 0.4, a.y + 0.3);
    expect(v.measurePointCount).toBe(1);
    v.setMeasureTrackPoints([E]);
    passRef(v);
    // E의 Y축 위(x = 80) — 끌어온 축
    const y = scr(v, [80, 50, 0]);
    hoverXY(v, y.x + 1, y.y + 0.5);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'y', trackFrom: E });
    // 첫 점 X축 위(y = 0)는 첫 점 축(끌어온 점의 수직 선이 지나도)
    const x = scr(v, [40, 0, 0]);
    hoverXY(v, x.x + 1, x.y + 0.5);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'axis', axis: 'x', direction: [1, 0, 0] });
    expect(v.measureHoverSnap).not.toHaveProperty('trackFrom');
    // 나란한 선 위: 잠글 방향이 없다
    const p = scr(v, PAR_AT);
    hoverXY(v, p.x + 2, p.y + 1);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'parallel', trackFrom: E });
    expect(v.measureHoverLock).toBeNull();
    const at = v.measureHoverSnap!.point;
    // 찍는다
    ptrEvent(v, 'pointerdown', p.x + 2, p.y + 1, 1);
    ptrEvent(v, 'pointerup', p.x + 2, p.y + 1, 0);
    v.renderNow();
    expect(v.measurePoints[1]).toMatchObject({ snap: 'parallel', trackFrom: E });
    expect(v.measurePoints[1]).not.toHaveProperty('direction');
    expect(dist(v.measurePoints[1]!.point, at)).toBe(0);
    expect(got.at(-1)).toMatchObject({ snapB: 'parallel' });
    expect(got.at(-1)!.distance).toBeCloseTo(dist(A, at), 9);
  });

  it('잠근 동안에는 보지 않는다(잠근 선 위 점), 수직 선 위에 머물러도 끌어온 점으로 기억하지 않는다', () => {
    const v = make();
    v.setMeasureSnap({ edges: true, inference: { axes: true, track: { dwellMs: 50 }, trackDirs: true } });
    const a = scr(v, A);
    clickXY(v, a.x + 0.4, a.y + 0.3);
    v.setMeasureTrackPoints([E]);
    passRef(v);
    const q = scr(v, PERP_AT);
    hoverXY(v, q.x + 2, q.y + 1);
    expect(v.measureHoverSnap).toMatchObject({ snap: 'perpendicular', trackFrom: E });
    vi.advanceTimersByTime(200);
    hoverXY(v, q.x + 2, q.y + 1);
    expect(v.measureTrackPoints).toEqual([E]);
    expect(v.setMeasureInferenceLock('y')).toBe(true);
    hoverXY(v, q.x + 2, q.y + 1);
    const h = v.measureHoverSnap!;
    expect(h).toMatchObject({ snap: 'axis', axis: 'y', locked: true });
    expect(h.snap === 'perpendicular' && !h.locked).toBe(false);
    v.setMeasureInferenceLock(false);
  });

  it('그리기: 끌어온 점에서 추론 색 쇄선과 기준 선분 점선(끌어온 축은 [4, 3] 점선 그대로)', () => {
    const v = make();
    v.setMeasureSnap({ edges: true, inference: { axes: true, track: true, trackDirs: true } });
    v.setMeasureTrackPoints([E]);
    passRef(v);
    const log: string[] = [];
    const real = (v as unknown as { octx: CanvasRenderingContext2D }).octx;
    (v as unknown as { octx: CanvasRenderingContext2D }).octx = new Proxy(real, {
      get: (t, k) => (k === 'setLineDash' ? (d: number[]) => d.length && log.push(`${String(t.strokeStyle)}:${d.join(',')}`) : (t as unknown as Record<string | symbol, unknown>)[k]),
      set: (t, k, val) => (((t as unknown as Record<string | symbol, unknown>)[k] = val), true),
    });
    const p = scr(v, PAR_AT);
    hoverXY(v, p.x + 2, p.y + 1);
    v.renderNow();
    const inferColor = (v as unknown as { theme: { inference?: string } }).theme.inference!;
    expect(log).toContain(`${inferColor}:8,3,2,3`);
    expect(log).toContain(`${inferColor}:5,3`);
    log.length = 0;
    const y = scr(v, [80, 50, 0]);
    hoverXY(v, y.x + 1, y.y + 0.5);
    v.renderNow();
    expect(log.some((s) => s.endsWith(':4,3'))).toBe(true);
    expect(log.some((s) => s.endsWith(':8,3,2,3'))).toBe(false);
  });
});

// ───────────── 4. 뷰어: 글상자 기본 자리(setMeasureLabelSpot) ─────────────
describe('Viewer3d: 뷰어 글상자 기본 자리(0.27.0 setMeasureLabelSpot)', () => {
  const box = boxMesh('상자', [0, 0, 0], [100, 60, 30], [0.6, 0.65, 0.7, 1]);
  const sc: Scene3d = { name: 'l', units: 'mm', meshes: [box], lines: [], points: [] };
  function make(): Viewer3d {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    views.push(v);
    v.setScene(sc);
    v.setView('seIso', false);
    v.fit(false);
    v.renderNow();
    return v;
  }
  // 가짜 DOM 캔버스는 800 × 600 CSS 화소
  const view = (_v: Viewer3d) => ({ width: 800, height: 600 });

  it('labelSpotName: 이름 자리만 받는다', () => {
    expect(['center', 'above', 'below', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'].map(labelSpotName)).toEqual(['center', 'above', 'below', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']);
    expect([{ x: 1, y: 2 }, 'middle', 3, null, undefined].map(labelSpotName)).toEqual([null, null, null, null, null]);
  });

  it('설정 값: 문자열은 둘 모두, 객체는 준 것만, 모르는 값은 뺀다, null·빈 객체는 끈다', () => {
    const v = make();
    expect(v.measureLabelSpot).toBeNull();
    v.setMeasureLabelSpot('center');
    expect(v.measureLabelSpot).toEqual({ measure: 'center', annotations: 'center' });
    v.setMeasureLabelSpot({ annotations: 'above' });
    expect(v.measureLabelSpot).toEqual({ annotations: 'above' });
    v.setMeasureLabelSpot({ measure: 'nowhere' as never, annotations: { x: 1, y: 2 } as never });
    expect(v.measureLabelSpot).toBeNull();
    v.setMeasureLabelSpot('below');
    v.setMeasureLabelSpot({});
    expect(v.measureLabelSpot).toBeNull();
    v.setMeasureLabelSpot('topLeft');
    const got = v.measureLabelSpot!;
    got.measure = 'below';
    expect(v.measureLabelSpot).toEqual({ measure: 'topLeft', annotations: 'topLeft' });
    v.setMeasureLabelSpot(null);
    expect(v.measureLabelSpot).toBeNull();
  });

  it('측정 거리 글상자: 주지 않으면 0.26.0 자리(오른쪽 위), 주면 그 기본 자리부터(피할 자리와 겹치면 같은 차례로 비킨다)', () => {
    const v = make();
    v.setMeasureMode(true);
    const a = scr(v, [10.3, 0, 30]), b = scr(v, [90.2, 0, 30]);
    clickXY(v, a.x, a.y);
    clickXY(v, b.x, b.y);
    v.renderNow();
    const r0 = v.measureLabelRect!;
    expect(r0).not.toBeNull();
    const pa = v.project(v.measurePoints[0]!.point)!, pb = v.project(v.measurePoints[1]!.point)!;
    const mid = [(pa.x + pb.x) / 2, (pa.y + pb.y) / 2];
    const size = { width: r0.width, height: r0.height };
    expect(r0).toEqual(placeMeasureLabel(mid, size, view(v)));
    for (const s of ['center', 'above', 'below', 'bottomLeft'] as const) {
      v.setMeasureLabelSpot({ measure: s });
      v.renderNow();
      expect(v.measureLabelRect).toEqual(placeMeasureLabel(mid, size, view(v), null, null, { first: s }));
    }
    // 피할 자리가 기본 자리를 덮으면 같은 차례(순수 placeLabelAmong first)로 비킨다
    v.setMeasureLabelSpot({ measure: 'center' });
    const c = placeMeasureLabel(mid, size, view(v), null, null, { first: 'center' });
    const avoid = { x: c.x - 2, y: c.y - 2, width: c.width + 4, height: c.height + 4 };
    v.setMeasureLabelAvoid([avoid]);
    v.renderNow();
    const seg: [V3, V3] = [
      [pa.x, pa.y, 0],
      [pb.x, pb.y, 0],
    ];
    const soft = seg.map((p) => ({ x: p[0], y: p[1], r: 6 }));
    const want = placeLabelAmong(mid, size, view(v), { rects: [avoid], circles: [], soft }, [], seg, soft, { first: 'center' });
    expect(v.measureLabelRect).toEqual(want);
    expect(want).not.toEqual(c);
    // 덧그림 몫만 주면 측정 거리 글상자는 0.26.0 자리
    v.setMeasureLabelAvoid(null);
    v.setMeasureLabelSpot({ annotations: 'center' });
    v.renderNow();
    expect(v.measureLabelRect).toEqual(r0);
  });

  it('덧그림 글상자: 주면 그 기본 자리, 끄면 0.26.0 자리', () => {
    const v = make();
    const list = [
      { kind: 'distance' as const, a: [10, 0, 30], b: [90, 0, 30] },
      { kind: 'point' as const, a: [100, 60, 0] },
    ];
    v.setAnnotations(list);
    v.renderNow();
    const r0 = v.annotationLabelRects;
    expect(r0.every((r) => !!r)).toBe(true);
    // 기준점 = 글자 상자 자리(거리는 두 점 가운데, 점은 그 점)의 화면 자리
    const ats = [
      [50, 0, 30],
      [100, 60, 0],
    ].map((p) => {
      const s = v.project(p)!;
      return [s.x, s.y];
    });
    for (let i = 0; i < 2; i++) expect(r0[i]).toEqual(placeMeasureLabel(ats[i]!, { width: r0[i]!.width, height: r0[i]!.height }, view(v)));
    v.setMeasureLabelSpot({ annotations: 'below' });
    v.renderNow();
    const r1 = v.annotationLabelRects;
    for (let i = 0; i < 2; i++) expect(r1[i]).toEqual(placeMeasureLabel(ats[i]!, { width: r0[i]!.width, height: r0[i]!.height }, view(v), null, null, { first: 'below' }));
    expect(r1[0]).not.toEqual(r0[0]);
    v.setMeasureLabelSpot({ measure: 'below' });
    v.renderNow();
    expect(v.annotationLabelRects).toEqual(r0);
  });
});
