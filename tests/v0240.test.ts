/**
 * 0.24.0 그물마다 고르기 불투명(Viewer3d.setItemPickOpaque — 순수 pickScene의 pickOpaque), 반투명 너머 고르기만 바꾸기(setMeasurePickThrough).
 * (덧그림 글상자끼리 비키기는 v0240label.test.ts)
 * - 순수 함수: 반투명 판 안 반투명 포켓·그 아래 불투명 바닥이 겹친 장면에서 throughTranslucent가 pickOpaque 그물에서 멈추는지(한 단면·여러 단면 길),
 *   가림·throughTranslucent 없는 고르기는 그대로인지
 * - 뷰어(가짜 DOM — 실제 포인터 사건): pick·onPick·측정 미리 보기·찍은 점·축이 면을 뚫는 점, 겉모습 상태·그리기 기록, 잠금·끌어온 점·찍은 점·다듬기 기억을 둔 채
 *   반투명 너머 고르기만 바꾸기
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom, type FakeElement } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { buildBvh } from '../src/bvh';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import { type ScenePickOptions, pickScene } from '../src/scenepick';
import type { SnapRefineFaceInput } from '../src/snap';
import { boxMesh } from '../src/synth';
import { Viewer3d } from '../src/viewer';
import type { V3 } from '../src/math';
import type { Pick3d, Scene3d } from '../src/types';

const dist = (p: readonly number[], q: readonly number[]): number => Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);

/**
 * NC 판재 꼴: 반투명 판(알파 0.35, z 0~20) 안에 반투명 포켓(알파 0.75, z 6~16 — 판 윗면 아래에 잠긴 입체), 판 아래 불투명 바닥(z −20~−5).
 * 포켓 안 선분(z 10)은 반투명 면에 가리지 않는다
 */
const BOARD = boxMesh('판', [0, 0, 0], [100, 80, 20], [0.86, 0.74, 0.55, 0.35]);
const POCKET = boxMesh('포켓', [30, 20, 6], [70, 60, 16], [0.55, 0.3, 0.7, 0.75]);
const BASE = boxMesh('바닥', [0, 0, -20], [100, 80, -5], [0.6, 0.6, 0.7, 1]);
const GROOVE_LINE = { id: '금', positions: new Float32Array([35, 40, 10, 65, 40, 10]) };

// ───────────── 순수 함수: pickScene pickOpaque ─────────────
describe('pickScene pickOpaque(0.24.0 — throughTranslucent가 지나가지 않을 그물)', () => {
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
  const items = { meshes: [BOARD, POCKET, BASE], lines: [], points: [] };
  const pocketOpaque = (m: { id: string }): boolean => m.id === '포켓';

  it('포켓 위를 누르면: 기본은 판 윗면, throughTranslucent는 바닥, pickOpaque(포켓)와 함께면 포켓 윗면', () => {
    const [x, y] = at([50.3, 40.2, 16]);
    expect(pickScene(f, x, y, items, opts())!.pick).toMatchObject({ kind: 'mesh', id: '판' });
    const thru = pickScene(f, x, y, items, opts({ throughTranslucent: true }))!.pick;
    expect(thru).toMatchObject({ kind: 'mesh', id: '바닥', normal: [0, 0, 1] });
    expect(thru.point[2]).toBeCloseTo(-5, 6);
    const stop = pickScene(f, x, y, items, opts({ throughTranslucent: true, pickOpaque: pocketOpaque }))!.pick;
    expect(stop).toMatchObject({ kind: 'mesh', id: '포켓', normal: [0, 0, 1] });
    expect(dist(stop.point, [50.3, 40.2, 16])).toBeLessThan(1e-6);
    // 묶음 차례와 상관없다
    expect(pickScene(f, x, y, { ...items, meshes: [BASE, POCKET, BOARD] }, opts({ throughTranslucent: true, pickOpaque: pocketOpaque }))!.pick.id).toBe('포켓');
    // throughTranslucent가 없으면 보지 않는다(0.23.0과 같다)
    expect(pickScene(f, x, y, items, opts({ pickOpaque: pocketOpaque }))).toEqual(pickScene(f, x, y, items, opts()));
    // 아무것도 고르지 않는 함수는 0.23.0과 같다
    expect(pickScene(f, x, y, items, opts({ throughTranslucent: true, pickOpaque: () => false }))).toEqual(pickScene(f, x, y, items, opts({ throughTranslucent: true })));
  });

  it('포켓 밖(판만)은 그대로 바닥, 여러 단면 고르기 길도 같다, 반투명 판도 pickOpaque면 판에서 멈춘다', () => {
    // 판 윗면 위 포켓 밖(광선이 포켓 옆을 지나 바닥 윗면에 닿는 자리)
    const [ox, oy] = at([90.3, 15.2, 20]);
    expect(pickScene(f, ox, oy, items, opts({ throughTranslucent: true, pickOpaque: pocketOpaque }))!.pick.id).toBe('바닥');
    const [x, y] = at([50.3, 40.2, 16]);
    const multi = { clips: () => [] };
    expect(pickScene(f, x, y, items, opts({ ...multi, throughTranslucent: true }))!.pick.id).toBe('바닥');
    expect(pickScene(f, x, y, items, opts({ ...multi, throughTranslucent: true, pickOpaque: pocketOpaque }))!.pick.id).toBe('포켓');
    expect(pickScene(f, x, y, items, opts({ throughTranslucent: true, pickOpaque: (m) => m.id !== '바닥' }))!.pick.id).toBe('판');
    // 바닥을 아래에서 자르는 평면(z > −6 쪽을 잘라냄 — 바닥만): 포켓이 앞이면 포켓
    const cut = opts({ throughTranslucent: true, pickOpaque: pocketOpaque, clips: (it) => (it.id === '바닥' ? [[0, 0, 1, 6]] : []) });
    expect(pickScene(f, x, y, items, cut)!.pick.id).toBe('포켓');
  });

  it('가림은 그대로: 포켓 안 선분은 pickOpaque여도 고른다(반투명 면은 그리기에서 뒤를 가리지 않는다)', () => {
    const withLine = { meshes: items.meshes, lines: [GROOVE_LINE], points: [] };
    const [x, y] = at([50, 40, 10]);
    for (const o of [opts(), opts({ throughTranslucent: true }), opts({ throughTranslucent: true, pickOpaque: pocketOpaque })])
      expect(pickScene(f, x + 0.4, y + 0.3, withLine, o)!.pick).toMatchObject({ kind: 'line', id: '금' });
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
const hoverXY = (v: Viewer3d, x: number, y: number): void => {
  ptrEvent(v, 'pointermove', x, y, 0);
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

describe('Viewer3d: 그물마다 고르기 불투명(0.24.0 setItemPickOpaque)', () => {
  const sc: Scene3d = { name: 'p', units: 'mm', meshes: [BOARD, POCKET, BASE], lines: [GROOVE_LINE], points: [] };
  function make(): Viewer3d {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    v.setScene(sc);
    v.setView('seIso', false);
    v.fit(false);
    v.renderNow();
    return v;
  }
  const P: V3 = [50.3, 40.2, 16];

  it('pick: throughTranslucent는 바닥, 포켓을 켜면 포켓 윗면(판 밖은 그대로 바닥). 주지 않은 고르기·끄면 0.23.0 그대로', () => {
    const v = make();
    const s = scr(v, P);
    const plain = v.pick(s.x, s.y), thru = v.pick(s.x, s.y, { throughTranslucent: true });
    expect(plain).toMatchObject({ kind: 'mesh', id: '판' });
    expect(thru).toMatchObject({ kind: 'mesh', id: '바닥' });
    v.setItemPickOpaque('포켓', true);
    const t = v.pick(s.x, s.y, { throughTranslucent: true })!;
    expect(t).toMatchObject({ kind: 'mesh', id: '포켓', normal: [0, 0, 1] });
    expect(dist(t.point, P)).toBeLessThan(1e-6);
    expect(v.pick(s.x, s.y, { throughTranslucent: true, meshesOnly: true })).toEqual(t);
    expect(v.pick(s.x, s.y)).toEqual(plain);
    const o = scr(v, [90.3, 15.2, 20]);
    expect(v.pick(o.x, o.y, { throughTranslucent: true })).toMatchObject({ id: '바닥' });
    // 포켓 안 선분은 그대로 고른다(가림은 그림대로)
    const l = scr(v, [50, 40, 10]);
    expect(v.pick(l.x + 0.4, l.y + 0.3, { throughTranslucent: true })).toMatchObject({ kind: 'line', id: '금' });
    v.setItemPickOpaque('포켓', false);
    expect(v.pick(s.x, s.y, { throughTranslucent: true })).toEqual(thru);
    v.dispose();
  });

  it('겉모습 상태: itemLook에 pickOpaque, 끄면·clearItemLooks·setScene으로 비우고 setMesh로는 남는다. 다른 겉모습과 함께 둔다', () => {
    const v = make();
    expect(v.itemLook('포켓')).toBeNull();
    v.setItemPickOpaque('포켓', true);
    expect(v.itemLook('포켓')).toEqual({ pickable: true, pickOpaque: true });
    v.setItemOpacity('포켓', 0.5);
    expect(v.itemLook('포켓')).toEqual({ pickable: true, opacity: 0.5, pickOpaque: true });
    v.setItemOpacity('포켓', null);
    v.setItemPickOpaque('포켓', false);
    expect(v.itemLook('포켓')).toBeNull();
    // 없는 묶음은 무시
    v.setItemPickOpaque('없음', true);
    expect(v.itemLook('없음')).toBeNull();
    v.setItemPickOpaque('포켓', true);
    v.setMesh({ ...POCKET, color: [0.55, 0.3, 0.7, 0.7] });
    expect(v.itemLook('포켓')).toEqual({ pickable: true, pickOpaque: true });
    const s = scr(v, P);
    expect(v.pick(s.x, s.y, { throughTranslucent: true })).toMatchObject({ id: '포켓' });
    v.clearItemLooks();
    expect(v.itemLook('포켓')).toBeNull();
    v.setItemPickOpaque('포켓', true);
    v.setScene(sc, { keepView: true });
    expect(v.itemLook('포켓')).toBeNull();
    v.dispose();
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
    v.setItemPickOpaque('포켓', true);
    v.setItemPickOpaque('판', true);
    expect(frame()).toEqual(before);
    v.dispose();
  });

  it('onPick: throughTranslucent 알림은 포켓을 켜면 포켓, 선택 없이 단 알림은 판', () => {
    const v = make();
    const log: [string, Pick3d | null][] = [];
    v.onPick((p) => log.push(['plain', p]));
    v.onPick((p) => log.push(['thru', p]), { throughTranslucent: true });
    v.setItemPickOpaque('포켓', true);
    const s = scr(v, P);
    clickXY(v, s.x, s.y);
    expect(log.map((e) => [e[0], e[1]?.id])).toEqual([
      ['plain', '판'],
      ['thru', '포켓'],
    ]);
    expect(log[1]![1]).toEqual(v.pick(s.x, s.y, { throughTranslucent: true }));
    v.dispose();
  });

  it('측정: 미리 보기·찍은 점·축이 면을 뚫는 점(axisFaces)이 포켓 윗면을 본다(켜지 않으면 바닥)', () => {
    const C: V3 = [50, 40, 60];
    const run = (pocket: boolean): { face: V3; first: V3; axis: { point: V3; face: string | null } | null } => {
      const v = make();
      if (pocket) v.setItemPickOpaque('포켓', true);
      v.setMeasureMode(true);
      v.setMeasureSnap({ throughTranslucent: true });
      const s = scr(v, P);
      hoverXY(v, s.x, s.y);
      const face = v.measureHoverSnap!.point;
      clickXY(v, s.x, s.y);
      const first = v.measurePoints[0]!.point;
      v.clearMeasure();
      v.setMeasureSnap({ points: [{ point: C, kind: 'point' }], inference: { axes: true, axisFaces: true }, throughTranslucent: true });
      const c = scr(v, C);
      clickXY(v, c.x + 1, c.y);
      expect(v.measurePoints[0]!.point).toEqual(C);
      const q = scr(v, [50, 40, 16]);
      hoverXY(v, q.x + 3, q.y + 1);
      const h = v.measureHoverSnap;
      v.dispose();
      return { face, first, axis: h && h.snap === 'axis' ? { point: h.point, face: h.face?.id ?? null } : null };
    };
    const t = run(true);
    expect(t.face[2]).toBeCloseTo(16, 6);
    expect(t.first[2]).toBeCloseTo(16, 6);
    expect(t.axis).toMatchObject({ face: '포켓' });
    expect(dist(t.axis!.point, [50, 40, 16])).toBeLessThan(1e-9);
    const p = run(false);
    expect(p.face[2]).toBeCloseTo(-5, 6);
    expect(p.first[2]).toBeCloseTo(-5, 6);
    expect(p.axis?.face ?? null).not.toBe('포켓');
  });
});

describe('Viewer3d: 반투명 너머 고르기만 바꾸기(0.24.0 setMeasurePickThrough)', () => {
  const PLATE = boxMesh('판', [0, 0, 0], [100, 80, 20], [0.6, 0.6, 0.7, 1]);
  const COVER = boxMesh('덮개', [-10, -10, 25], [110, 90, 40], [0.4, 0.7, 1, 0.35]);
  const sc: Scene3d = { name: 't', units: 'mm', meshes: [COVER, PLATE], lines: [], points: [] };
  function make(): Viewer3d {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
    v.setScene(sc);
    v.setView('seIso', false);
    v.fit(false);
    v.renderNow();
    return v;
  }
  const C: V3 = [50, 40, 70];
  const G: V3 = [10, 10, 40];
  const P20: V3 = [50, 40, 20];

  it('잠금·끌어온 점·찍은 점을 둔 채 다음 미리 보기부터 판 너머 면을 보고, 다듬기 기억도 남는다(setMeasureSnap은 예전처럼 잠금·끌어온 점·기억을 새로)', () => {
    const v = make();
    const calls: string[] = [];
    const refineFace = (c: SnapRefineFaceInput): null => {
      calls.push(`${c.kind}:${c.face.id}`);
      return null;
    };
    v.setMeasureMode(true);
    const opts = { points: [{ point: C, kind: 'point' as const }], inference: { axes: true, lock: true, track: true, axisFaces: true, lockFaces: true }, refineFace };
    v.setMeasureSnap(opts);
    const c = scr(v, C);
    clickXY(v, c.x + 1, c.y);
    expect(v.measurePoints[0]!.point).toEqual(C);
    expect(v.setMeasureTrackPoints([G])).toBe(1);
    expect(v.setMeasureInferenceLock('z')).toBe(true);
    const s = scr(v, P20);
    hoverXY(v, s.x + 3, s.y + 1);
    const h0 = v.measureHoverSnap!;
    expect(h0).toMatchObject({ snap: 'axis', axis: 'z', locked: true });
    expect(h0.face?.id).not.toBe('판');
    const lock = v.measureInferenceLock, tracks = v.measureTrackPoints, pts = v.measurePoints, snap0 = v.measureSnap!;
    // 켠다 — 다음 미리 보기(같은 자리)부터 판 윗면을 뚫는 점
    expect(v.setMeasurePickThrough(true)).toBe(true);
    v.renderNow();
    const h1 = v.measureHoverSnap!;
    expect(h1).toMatchObject({ snap: 'axis', axis: 'z', locked: true, face: { id: '판' } });
    expect(dist(h1.point, P20)).toBeLessThan(1e-9);
    expect(v.measureInferenceLock).toEqual(lock);
    expect(v.measureTrackPoints).toEqual(tracks);
    expect(v.measurePoints).toEqual(pts);
    expect(v.measureSnap).toEqual({ ...snap0, throughTranslucent: true });
    const n1 = calls.filter((k) => k === 'axisFace:판').length;
    expect(n1).toBe(1);
    // 끄면 다시 덮개 쪽, 다시 켜면 기억한 판 결과를 쓴다(앱을 다시 부르지 않는다)
    expect(v.setMeasurePickThrough(false)).toBe(true);
    v.renderNow();
    expect(v.measureHoverSnap!.face?.id).not.toBe('판');
    expect(v.measureSnap).toEqual(snap0);
    expect(v.setMeasurePickThrough(true)).toBe(true);
    v.renderNow();
    expect(v.measureHoverSnap).toMatchObject({ locked: true, face: { id: '판' } });
    expect(calls.filter((k) => k === 'axisFace:판').length).toBe(n1);
    expect(v.measureInferenceLock).toEqual(lock);
    expect(v.measureTrackPoints).toEqual(tracks);
    // 같은 값이면 그대로
    expect(v.setMeasurePickThrough(true)).toBe(true);
    // 두 점째는 판 위
    clickXY(v, s.x + 3, s.y + 1);
    expect(v.measurement()!.distance).toBeCloseTo(50, 9);
    // setMeasureSnap은 0.23.0 그대로: 잠금·끌어온 점을 풀고 다듬기 기억을 새로 한다
    v.clearMeasure();
    clickXY(v, c.x + 1, c.y);
    v.setMeasureTrackPoints([G]);
    v.setMeasureInferenceLock('z');
    v.setMeasureSnap({ ...opts, throughTranslucent: true });
    expect(v.measureInferenceLock).toBeNull();
    expect(v.measureTrackPoints).toEqual([]);
    expect(v.measurePoints.map((p) => p.point)).toEqual([C]);
    v.setMeasureInferenceLock('z');
    hoverXY(v, s.x + 3, s.y + 1);
    expect(v.measureHoverSnap).toMatchObject({ locked: true, face: { id: '판' } });
    expect(calls.filter((k) => k === 'axisFace:판').length).toBe(n1 + 1);
    v.dispose();
  });

  it('붙잡기가 꺼져 있으면 false(아무것도 하지 않는다). 이것만 줘서 켠 붙잡기를 꺼도 붙잡기는 켜진 채다', () => {
    const v = make();
    expect(v.setMeasurePickThrough(true)).toBe(false);
    expect(v.measureSnap).toBeNull();
    v.setMeasureMode(true);
    v.setMeasureSnap({ throughTranslucent: true });
    expect(v.setMeasurePickThrough(false)).toBe(true);
    expect(v.measureSnap).toEqual({});
    const s = scr(v, [50.3, 40.2, 20]);
    hoverXY(v, s.x, s.y);
    expect(v.measureHoverSnap!.point[2]).toBeCloseTo(40, 6);
    expect(v.setMeasurePickThrough(true)).toBe(true);
    v.renderNow();
    expect(v.measureHoverSnap!.point[2]).toBeCloseTo(20, 6);
    v.dispose();
  });
});
