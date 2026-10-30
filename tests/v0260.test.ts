/**
 * 0.26.0
 * - 한 누르기의 두 고르기(onPick의 front — 판 너머 고르기와 가장 앞 고르기를 한 알림에서), 알림 차례·같은 사건 객체(약속)
 * - 글상자 기본 자리(placeMeasureLabel·placeLabelAmong의 opts.first) — 주지 않으면 0.25.0과 같은 자리(0.25.0 계산 사본과 견준다)
 * - 작은 법선·무늬 좌표 배열(attribs.ts 순수 계산, 렌더러의 속성 꼴·버퍼 바이트, Float32 장면과 고르기·범위·측정이 같은지, 놓기·문맥 복구·그물 바꾸기 구간)
 * - 끌어온 점에서 나란함·수직 방향(순수 trackDirGuides·trackDirSnap)
 * 화면 좌표로 가리킬 때는 선·그물의 경계나 바깥 구석을 정확히 가리키지 않고 몇 화소 옆을 가리킨다(Node 판마다 마지막 자리 반올림이 다르다).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type DrawEntry, type FakeBuffer, type FakeGL, fnv } from './fakegl';
import { attribType, normalFormat, packNormals, packUvs, unpackValue, uvAccepted, uvFormat, uvTransformOf } from '../src/attribs';
import { type CameraState, computeFrame, defaultCamera, dirToAngles, projectToScreen } from '../src/camera';
import type { V3 } from '../src/math';
import { trackDirGuides, trackDirSnap } from '../src/track';
import { LABEL_ALONG, LABEL_GAP_X, LABEL_GAP_Y, LABEL_MARGIN, type LabelAvoidAreas, type LabelCircle, type MeasureLabelRect, hitsAvoid, placeLabelAmong, placeMeasureLabel, rectsOverlap } from '../src/measurelabel';
import { arraysMiss, fitsLayout, takeArrays } from '../src/release';
import { boxMesh, compactMesh, syntheticScene } from '../src/synth';
import { uvComponents } from '../src/texture';
import { type PickEvent, Viewer3d } from '../src/viewer';
import type { Mesh3d, Pick3d, Scene3d } from '../src/types';

// ───────────── 가짜 DOM·그림 풀기 ─────────────
interface FakeBitmap {
  width: number;
  height: number;
  tag: string;
  close(): void;
}
let dom: ReturnType<typeof installDom>;
const g = globalThis as Record<string, unknown>;
let savedCib: unknown;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  savedCib = g.createImageBitmap;
  g.createImageBitmap = async (src: unknown, o?: ImageBitmapOptions): Promise<FakeBitmap> => {
    const b = src instanceof Blob ? new Uint8Array(await src.arrayBuffer()) : new Uint8Array(0);
    return { width: o?.resizeWidth ?? 64, height: o?.resizeHeight ?? 64, tag: `bytes:${fnv(b)}`, close() {} };
  };
});
afterAll(() => {
  for (const v of views) v.dispose();
  g.createImageBitmap = savedCib;
  dom.restore();
});

function viewer(scene: Scene3d, opts: Parameters<Viewer3d['setScene']>[1] = {}): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, renderMode: 'shaded' });
  views.push(v);
  v.setScene(scene, opts);
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return v;
}
const glOf = (v: Viewer3d): FakeGL => (v.canvas as unknown as FakeElement).gl as FakeGL;
const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number, mods: { shiftKey?: boolean; altKey?: boolean } = {}): void =>
  (v.canvas as unknown as { fire: (t: string, e: object) => void }).fire(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: type === 'pointermove' ? -1 : 0,
    buttons,
    shiftKey: !!mods.shiftKey,
    altKey: !!mods.altKey,
    ctrlKey: false,
    metaKey: false,
  });
const clickXY = (v: Viewer3d, x: number, y: number, mods: { shiftKey?: boolean; altKey?: boolean } = {}): void => {
  ptr(v, 'pointermove', x, y, 0);
  ptr(v, 'pointerdown', x, y, 1, mods);
  ptr(v, 'pointerup', x, y, 0, mods);
  v.renderNow();
};
const scr = (v: Viewer3d, p: readonly number[]): { x: number; y: number } => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};

// ───────────── 1. 한 누르기의 두 고르기(onPick front) ─────────────
/** NC 판재 꼴(0.24.0 시험과 같다): 반투명 판(알파 0.35) 안 반투명 포켓, 판 아래 불투명 바닥, 포켓 안 선분 */
const BOARD = boxMesh('판', [0, 0, 0], [100, 80, 20], [0.86, 0.74, 0.55, 0.35]);
const POCKET = boxMesh('포켓', [30, 20, 6], [70, 60, 16], [0.55, 0.3, 0.7, 0.75]);
const BASE = boxMesh('바닥', [0, 0, -20], [100, 80, -5], [0.6, 0.6, 0.7, 1]);
const GROOVE_LINE = { id: '금', positions: new Float32Array([35, 40, 10, 65, 40, 10]) };
const BOARD_SCENE: Scene3d = { name: 'p', units: 'mm', meshes: [BOARD, POCKET, BASE], lines: [GROOVE_LINE], points: [] };

describe('onPick front(0.26.0 — 판 너머 고르기와 가장 앞 고르기를 한 알림에서)', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  const EVENT_KEYS = ['altKey', 'ctrlKey', 'shiftKey', 'metaKey', 'clicks', 'button', 'pointerType'];

  it('front를 준 알림의 사건에 throughTranslucent만 뺀 같은 누르기의 고르기 — 선택 없이 단 알림이 받은 고르기와 같은 객체', () => {
    const v = viewer(BOARD_SCENE);
    const log: { name: string; p: Pick3d | null; e: PickEvent }[] = [];
    const add = (name: string, o?: Parameters<Viewer3d['onPick']>[1]): void => void v.onPick((p, e) => log.push({ name, p, e }), o);
    add('plain');
    add('thru-front', { throughTranslucent: true, front: true });
    add('thru', { throughTranslucent: true });
    add('mesh-thru-front', { meshesOnly: true, throughTranslucent: true, front: true });
    add('front', { front: true });
    add('mesh-front', { meshesOnly: true, front: true });
    const s = scr(v, [50.3, 40.2, 20]);
    clickXY(v, s.x, s.y, { altKey: true });
    const by = (n: string): { p: Pick3d | null; e: PickEvent } => log.find((x) => x.name === n)!;
    expect(log.map((x) => x.name)).toEqual(['plain', 'thru-front', 'thru', 'mesh-thru-front', 'front', 'mesh-front']);
    expect(by('plain').p).toMatchObject({ kind: 'mesh', id: '판' });
    expect(by('thru-front').p).toMatchObject({ kind: 'mesh', id: '바닥' });
    // front = 같은 누르기의 가장 앞 고르기(선택 없이 단 알림과 같은 객체)
    expect(by('thru-front').e.front).toBe(by('plain').p);
    expect(by('mesh-thru-front').p).toMatchObject({ id: '바닥' });
    expect(by('mesh-thru-front').e.front).toMatchObject({ kind: 'mesh', id: '판' });
    expect(by('mesh-thru-front').e.front).toEqual(v.pick(s.x, s.y, { meshesOnly: true }));
    // throughTranslucent 없이 front만이면 front = 첫 인자
    expect(by('front').e.front).toBe(by('front').p);
    expect(by('front').p).toBe(by('plain').p);
    expect(by('mesh-front').e.front).toBe(by('mesh-front').p);
    // 사건: front를 준 알림만 사본(나머지 필드는 같다), 선택 없이·front 없이 단 알림은 같은 객체이고 front 열쇠가 없다(0.25.0 그대로)
    expect(by('thru').e).toBe(by('plain').e);
    expect(Object.keys(by('plain').e)).toEqual(EVENT_KEYS);
    expect(by('thru-front').e).not.toBe(by('plain').e);
    expect({ ...by('thru-front').e, front: undefined }).toEqual({ ...by('plain').e, front: undefined });
    expect(by('plain').e).toMatchObject({ altKey: true, clicks: 1, button: 0, pointerType: 'mouse' });
    expect(by('thru').p).toEqual(by('thru-front').p);
  });

  it('선분(포켓 안 금)·빈 곳: 선분은 판 너머 고르기도 선분, 빈 곳은 모두 null', () => {
    const v = viewer(BOARD_SCENE);
    const got: [Pick3d | null, Pick3d | null | undefined][] = [];
    v.onPick((p, e) => got.push([p, e.front]), { throughTranslucent: true, front: true });
    const l = scr(v, [50, 40, 10]);
    clickXY(v, l.x + 0.4, l.y + 0.3);
    expect(got[0]![0]).toMatchObject({ kind: 'line', id: '금' });
    expect(got[0]![1]).toMatchObject({ kind: 'line', id: '금' });
    clickXY(v, 3.3, 4.6);
    expect(got[1]).toEqual([null, null]);
  });

  it('setItemPickOpaque와 함께: 판 너머는 포켓 윗면, front는 판', () => {
    const v = viewer(BOARD_SCENE);
    v.setItemPickOpaque('포켓', true);
    let got: [Pick3d | null, Pick3d | null | undefined] | null = null;
    v.onPick((p, e) => (got = [p, e.front]), { throughTranslucent: true, front: true });
    const s = scr(v, [50.3, 40.2, 20]);
    clickXY(v, s.x, s.y);
    expect(got![0]).toMatchObject({ id: '포켓' });
    expect(got![1]).toMatchObject({ id: '판' });
  });

  it('차례 약속: 단 차례대로, 같은 함수를 다시 달면 처음 자리(마지막 선택), 끊었다 다시 달면 끝. 사건은 누르기마다 새 객체', () => {
    const v = viewer(BOARD_SCENE);
    const order: string[] = [];
    const evs: PickEvent[] = [];
    const a = (_p: Pick3d | null, e: PickEvent): void => void (order.push('a'), evs.push(e));
    const b = (): void => void order.push('b');
    const c = (_p: Pick3d | null, e: PickEvent): void => void (order.push(`c${e.front === undefined ? '' : 'f'}`), evs.push(e));
    v.onPick(a);
    v.onPick(b);
    const offC = v.onPick(c);
    v.onPick(a, { throughTranslucent: true });
    const s = scr(v, [50.3, 40.2, 20]);
    clickXY(v, s.x, s.y);
    expect(order).toEqual(['a', 'b', 'c']);
    expect(evs[0]).toBe(evs[1]);
    offC();
    v.onPick(c, { front: true });
    order.length = 0;
    evs.length = 0;
    clickXY(v, s.x + 2, s.y + 1);
    expect(order).toEqual(['a', 'b', 'cf']);
    expect(evs[0]).not.toBe(evs[1]);
  });
});

// ───────────── 2. 글상자 기본 자리 ─────────────
/** 0.25.0 placeMeasureLabel·placeLabelAmong 계산 사본(기본 자리를 주지 않으면 이것과 같아야 한다) */
const ref = (() => {
  const corner = (sx: number, sy: number, w: number, h: number, vw: number, vh: number, k: number): MeasureLabelRect => {
    let x = k & 1 ? sx - LABEL_GAP_X - w : sx + LABEL_GAP_X;
    let y = k & 2 ? sy + LABEL_GAP_Y : sy - h - LABEL_GAP_Y;
    x = Math.min(Math.max(LABEL_MARGIN, x), vw - w - LABEL_MARGIN);
    y = Math.min(Math.max(LABEL_MARGIN, y), vh - h - LABEL_MARGIN);
    return { x, y, width: w, height: h };
  };
  type Seg = readonly [readonly number[], readonly number[]] | null | undefined;
  const place = (at: readonly number[], size: { width: number; height: number }, view: { width: number; height: number }, avoid?: LabelAvoidAreas | null, segment?: Seg): MeasureLabelRect => {
    const w = size.width, h = size.height, vw = view.width, vh = view.height;
    const first = corner(at[0]!, at[1]!, w, h, vw, vh, 0);
    if (!avoid || (!avoid.rects?.length && !avoid.circles?.length) || !hitsAvoid(first, avoid)) return first;
    const cands: MeasureLabelRect[] = [];
    for (let k = 1; k < 4; k++) cands.push(corner(at[0]!, at[1]!, w, h, vw, vh, k));
    if (segment) {
      const [a, b] = segment;
      for (const t of LABEL_ALONG) {
        const sx = a[0]! + (b[0]! - a[0]!) * t, sy = a[1]! + (b[1]! - a[1]!) * t;
        if (!Number.isFinite(sx) || !Number.isFinite(sy)) continue;
        for (let k = 0; k < 4; k++) cands.push(corner(sx, sy, w, h, vw, vh, k));
      }
    }
    const ys: number[] = [];
    for (const b of [...(avoid.rects ?? []), ...(avoid.circles ?? []).map((c) => ({ x: c.x - c.r, y: c.y - c.r, width: 2 * c.r, height: 2 * c.r }))])
      ys.push(b.y - h - LABEL_GAP_Y, b.y + b.height + LABEL_GAP_Y);
    const left = corner(at[0]!, at[1]!, w, h, vw, vh, 1).x;
    ys.map((y, i) => ({ y, i }))
      .filter((e) => Number.isFinite(e.y))
      .sort((p, q) => Math.abs(p.y - first.y) - Math.abs(q.y - first.y) || p.i - q.i)
      .forEach(({ y }) => {
        const cy = Math.min(Math.max(LABEL_MARGIN, y), vh - h - LABEL_MARGIN);
        cands.push({ x: first.x, y: cy, width: w, height: h }, { x: left, y: cy, width: w, height: h });
      });
    const free = cands.filter((r) => !hitsAvoid(r, avoid));
    const soft = avoid.soft?.length ? { circles: avoid.soft } : null;
    return (soft && free.find((r) => !hitsAvoid(r, soft))) || free[0] || first;
  };
  const among = (
    at: readonly number[],
    size: { width: number; height: number },
    view: { width: number; height: number },
    avoid: LabelAvoidAreas | null | undefined,
    placed: readonly MeasureLabelRect[],
    segment?: Seg,
    soft?: readonly LabelCircle[] | null,
  ): MeasureLabelRect => {
    const base = place(at, size, view, avoid, segment);
    if (!placed.length || !placed.some((r) => rectsOverlap(base, r))) return base;
    const w = size.width, h = size.height;
    let x0 = Infinity, x1 = -Infinity;
    const take = (sx: number, sy: number): void => {
      if (!Number.isFinite(sx) || !Number.isFinite(sy)) return;
      for (let k = 0; k < 4; k++) {
        const r = corner(sx, sy, w, h, view.width, view.height, k);
        x0 = Math.min(x0, r.x);
        x1 = Math.max(x1, r.x + w);
      }
    };
    take(at[0]!, at[1]!);
    if (segment) for (const t of LABEL_ALONG) take(segment[0][0]! + (segment[1][0]! - segment[0][0]!) * t, segment[0][1]! + (segment[1][1]! - segment[0][1]!) * t);
    const cx = base.x + w / 2, cy = base.y + h / 2;
    const near = placed
      .map((r, i) => ({ r, i, d: Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy) }))
      .filter((e) => e.r.x < x1 && x0 < e.r.x + e.r.width)
      .sort((p, q) => p.d - q.d || p.i - q.i)
      .slice(0, 24)
      .sort((p, q) => p.i - q.i)
      .map((e) => e.r);
    const hard: LabelAvoidAreas = { rects: [...(avoid?.rects ?? []), ...near], circles: avoid?.circles ?? [] };
    const s = avoid?.soft?.length ? avoid.soft : (soft ?? []);
    const r = place(at, size, view, { ...hard, soft: s }, segment);
    return hitsAvoid(r, hard) ? base : r;
  };
  return { place, among };
})();

/** 결정적 의사 난수(시험마다 같은 입력) */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

describe('글상자 기본 자리(0.26.0 opts.first)', () => {
  const view = { width: 640, height: 400 };
  const size = { width: 58, height: 22 };

  it('주지 않거나 {}·topRight면 0.25.0 계산 사본과 같은 자리(무작위 600가지 — 피할 영역·원·soft·선분·먼저 놓인 글상자)', () => {
    const r = rng(26);
    const R = (a: number, b: number): number => a + (b - a) * r();
    for (let n = 0; n < 600; n++) {
      const at = [R(-20, 660), R(-20, 420)];
      const rects = Array.from({ length: Math.floor(R(0, 4)) }, () => ({ x: R(0, 600), y: R(0, 380), width: R(10, 200), height: R(10, 60) }));
      const circles = Array.from({ length: Math.floor(R(0, 2)) }, () => ({ x: R(0, 640), y: R(0, 400), r: R(5, 40) }));
      const soft = r() < 0.5 ? [{ x: at[0]!, y: at[1]!, r: 6 }] : undefined;
      const avoid: LabelAvoidAreas | null = r() < 0.15 ? null : { rects, circles, ...(soft ? { soft } : {}) };
      const seg = r() < 0.5 ? ([[R(0, 640), R(0, 400)], [R(0, 640), R(0, 400)]] as const) : null;
      const placed = Array.from({ length: Math.floor(R(0, 5)) }, () => ({ x: R(0, 600), y: R(0, 380), width: 58, height: 22 }));
      const want = ref.place(at, size, view, avoid, seg);
      expect(placeMeasureLabel(at, size, view, avoid, seg)).toEqual(want);
      expect(placeMeasureLabel(at, size, view, avoid, seg, {})).toEqual(want);
      expect(placeMeasureLabel(at, size, view, avoid, seg, { first: 'topRight' })).toEqual(want);
      const wantA = ref.among(at, size, view, avoid, placed, seg, soft);
      expect(placeLabelAmong(at, size, view, avoid, placed, seg, soft)).toEqual(wantA);
      expect(placeLabelAmong(at, size, view, avoid, placed, seg, soft, { first: 'topRight' })).toEqual(wantA);
    }
  });

  it("'center': 피할 것이 없으면 기준점 가운데(캔버스 안으로 당김), 겹치면 네 귀(오른쪽 위부터) → 선분 위 → 위·아래, 모두 막히면 가운데", () => {
    const at = [300, 200];
    const c = placeMeasureLabel(at, size, view, null, null, { first: 'center' });
    expect(c).toEqual({ x: 300 - 29, y: 200 - 11, width: 58, height: 22 });
    // 가장자리: 캔버스 안으로 당긴다
    expect(placeMeasureLabel([5, 395], size, view, null, null, { first: 'center' })).toEqual({ x: LABEL_MARGIN, y: 400 - 22 - LABEL_MARGIN, width: 58, height: 22 });
    // 가운데를 막으면 오른쪽 위(0.25.0 기본 자리)
    const block = { x: 295, y: 195, width: 10, height: 10 };
    expect(placeMeasureLabel(at, size, view, { rects: [block] }, null, { first: 'center' })).toEqual(placeMeasureLabel(at, size, view));
    // 오른쪽 위도 막으면 왼쪽 위
    const tr = placeMeasureLabel(at, size, view);
    const r2 = placeMeasureLabel(at, size, view, { rects: [block, { x: tr.x + 5, y: tr.y + 5, width: 4, height: 4 }] }, null, { first: 'center' });
    expect(r2).toEqual({ x: 300 - LABEL_GAP_X - 58, y: 200 - 22 - LABEL_GAP_Y, width: 58, height: 22 });
    // 모두 막히면 가운데
    const all = { x: 0, y: 0, width: 640, height: 400 };
    expect(placeMeasureLabel(at, size, view, { rects: [all] }, [[100, 100], [500, 300]], { first: 'center' })).toEqual(c);
    // soft(점 표식)는 옮길 때만 본다: 가운데가 표식 위여도 피할 것과 겹치지 않으면 가운데
    expect(placeMeasureLabel(at, size, view, { rects: [{ x: 0, y: 0, width: 5, height: 5 }], soft: [{ x: 300, y: 200, r: 6 }] }, null, { first: 'center' })).toEqual(c);
  });

  it("'above'·'below'·네 귀 이름·앱 자리 { x, y }(당기지 않는다). 모르는 값·수가 아닌 자리는 오른쪽 위", () => {
    const at = [300, 200];
    expect(placeMeasureLabel(at, size, view, null, null, { first: 'above' })).toEqual({ x: 271, y: 200 - 22 - LABEL_GAP_Y, width: 58, height: 22 });
    expect(placeMeasureLabel(at, size, view, null, null, { first: 'below' })).toEqual({ x: 271, y: 200 + LABEL_GAP_Y, width: 58, height: 22 });
    expect(placeMeasureLabel(at, size, view, null, null, { first: 'bottomLeft' })).toEqual({ x: 300 - LABEL_GAP_X - 58, y: 200 + LABEL_GAP_Y, width: 58, height: 22 });
    expect(placeMeasureLabel(at, size, view, null, null, { first: { x: -10, y: 390 } })).toEqual({ x: -10, y: 390, width: 58, height: 22 });
    const tr = placeMeasureLabel(at, size, view);
    expect(placeMeasureLabel(at, size, view, null, null, { first: 'middle' as never })).toEqual(tr);
    expect(placeMeasureLabel(at, size, view, null, null, { first: { x: NaN, y: 3 } })).toEqual(tr);
    // 'bottomLeft'를 막으면 오른쪽 위(남은 귀 차례: 오른쪽 위 → 왼쪽 위 → 오른쪽 아래)
    const bl = placeMeasureLabel(at, size, view, null, null, { first: 'bottomLeft' });
    expect(placeMeasureLabel(at, size, view, { rects: [{ x: bl.x + 2, y: bl.y + 2, width: 3, height: 3 }] }, null, { first: 'bottomLeft' })).toEqual(tr);
  });

  it('피할 영역 위·아래 자리: 가로는 기본 자리 → 오른쪽 위 → 왼쪽 위(기준점 둘레 네 귀가 모두 막힐 때)', () => {
    const at = [300, 200];
    // 기준점 둘레를 세로 띠로 막는다(네 귀 모두 겹침) — 위·아래 자리도 띠 안이면 막히므로 띠는 기준점 위아래 60화소만
    const band = { x: 0, y: 150, width: 640, height: 100 };
    const r = placeMeasureLabel(at, size, view, { rects: [band] }, null, { first: 'center' });
    expect(hitsAvoid(r, { rects: [band] })).toBe(false);
    // 세로는 기본 자리(가운데)에서 가까운 띠 위, 가로는 기본 자리(가운데)
    expect(r).toEqual({ x: 271, y: 150 - 22 - LABEL_GAP_Y, width: 58, height: 22 });
  });

  it('placeLabelAmong + center: 먼저 놓인 글상자와 겹치지 않으면 가운데, 겹치면 비키고, 모두 막히면 가운데', () => {
    const at = [300, 200];
    const c = placeMeasureLabel(at, size, view, null, null, { first: 'center' });
    expect(placeLabelAmong(at, size, view, null, [{ x: 0, y: 0, width: 30, height: 20 }], null, null, { first: 'center' })).toEqual(c);
    // 가운데에만 걸치는 작은 글상자: 다음 차례 = 오른쪽 위
    const prev = { x: c.x + 3, y: c.y + 2, width: 20, height: 10 };
    const r = placeLabelAmong(at, size, view, null, [prev], null, null, { first: 'center' });
    expect(rectsOverlap(r, prev)).toBe(false);
    expect(r).toEqual(placeMeasureLabel(at, size, view));
    // 네 귀에도 걸치는 큰 글상자: 그 글상자 바로 위(가로는 기본 자리 — 가운데)
    const big = { x: c.x + 3, y: c.y + 2, width: 58, height: 22 };
    expect(placeLabelAmong(at, size, view, null, [big], null, null, { first: 'center' })).toEqual({ x: c.x, y: big.y - 22 - LABEL_GAP_Y, width: 58, height: 22 });
    const wall = { x: 0, y: 0, width: 640, height: 400 };
    expect(placeLabelAmong(at, size, view, null, [wall], null, null, { first: 'center' })).toEqual(c);
    // 앱 자리 { x, y }가 기준점 네 귀 밖이어도 그 가로 범위의 먼저 놓인 글상자를 본다
    const far = { x: 520, y: 40 };
    const blocker = { x: 530, y: 45, width: 58, height: 22 };
    const rf = placeLabelAmong(at, size, view, null, [blocker], null, null, { first: far });
    expect(rectsOverlap(rf, blocker)).toBe(false);
  });
});

// ───────────── 3. 작은 법선·무늬 좌표 ─────────────
describe('attribs 순수 계산(0.26.0)', () => {
  it('배열 꼴·법선 꼴(Float32 3값, 정수 3·4값)·무늬 좌표 꼴', () => {
    expect(attribType(new Float32Array(1))).toBe('float');
    expect(attribType(new Int8Array(1))).toBe('byte');
    expect(attribType(new Int16Array(1))).toBe('short');
    expect(attribType(new Uint16Array(1))).toBe('ushort');
    expect(attribType(new Uint8Array(1))).toBeNull();
    expect(attribType([1, 2, 3])).toBeNull();
    expect(normalFormat(new Float32Array(12), 4)).toEqual({ type: 'float', normalized: false, size: 3, per: 3, stride: 12 });
    // Float32는 0.25.0처럼 늘 3값(길이 ≥ 정점 × 3)
    expect(normalFormat(new Float32Array(16), 4)).toEqual({ type: 'float', normalized: false, size: 3, per: 3, stride: 12 });
    expect(normalFormat(new Int8Array(12), 4)).toEqual({ type: 'byte', normalized: true, size: 3, per: 3, stride: 3 });
    expect(normalFormat(new Int8Array(16), 4)).toEqual({ type: 'byte', normalized: true, size: 3, per: 4, stride: 4 });
    expect(normalFormat(new Int16Array(16), 4)).toEqual({ type: 'short', normalized: true, size: 3, per: 4, stride: 8 });
    expect(normalFormat(new Int16Array(13), 4)).toEqual({ type: 'short', normalized: true, size: 3, per: 3, stride: 6 });
    expect(normalFormat(new Int8Array(11), 4)).toBeNull();
    expect(normalFormat(new Uint16Array(12), 4)).toBeNull();
    expect(normalFormat(new Uint8Array(16), 4)).toBeNull();
    expect(uvFormat(new Float32Array(8), 2)).toEqual({ type: 'float', normalized: false, size: 2, per: 2, stride: 8 });
    expect(uvFormat(new Int16Array(8), 2)).toEqual({ type: 'short', normalized: true, size: 2, per: 2, stride: 4 });
    expect(uvFormat(new Uint16Array(9), 3)).toEqual({ type: 'ushort', normalized: true, size: 3, per: 3, stride: 6 });
    expect(uvFormat(new Int8Array(8), 2)).toBeNull();
    expect(uvAccepted(new Uint8Array(4))).toBe(false);
    expect(uvTransformOf([2, 3, 0.5, -1])).toEqual([2, 3, 0.5, -1]);
    expect(uvTransformOf([2, 3, NaN, 1])).toBeNull();
    expect(uvTransformOf([2, 3, 1])).toBeNull();
    expect(uvTransformOf(undefined)).toBeNull();
    const positions = new Float32Array(9);
    expect(uvComponents({ positions, uvs: new Int16Array(6) })).toBe(2);
    expect(uvComponents({ positions, uvs: new Uint16Array(9) })).toBe(3);
    expect(uvComponents({ positions, uvs: new Uint8Array(6) as never })).toBe(0);
    expect(uvComponents({ positions, uvs: new Float32Array(6) })).toBe(2);
  });

  it('packNormals: 단위 길이로 맞춰 반올림(int8 오차 < 1/127·4값 넷째 0), 길이 0은 0', () => {
    const n = new Float32Array([0, 0, 2, 0.6, 0.8, 0, 0, 0, 0, -1, 1, 1]);
    const p = packNormals(n);
    expect(p).toBeInstanceOf(Int8Array);
    expect(Array.from(p)).toEqual([0, 0, 127, 0, 76, 102, 0, 0, 0, 0, 0, 0, -73, 73, 73, 0]);
    const q = packNormals(n, 'int16', 3);
    expect(q).toBeInstanceOf(Int16Array);
    expect(q.length).toBe(12);
    for (let i = 0; i < 4; i++) {
      const l = Math.hypot(n[i * 3]!, n[i * 3 + 1]!, n[i * 3 + 2]!) || 1;
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(unpackValue(p[i * 4 + c]!, 'byte') - n[i * 3 + c]! / l)).toBeLessThan(1 / 127);
        expect(Math.abs(unpackValue(q[i * 3 + c]!, 'short') - n[i * 3 + c]! / l)).toBeLessThan(1 / 32767);
      }
    }
  });

  it('packUvs: 2값·원근 3값을 int16·uint16과 축척·이동으로 — 펴면 범위 ÷ 65534 안', () => {
    const nv = 50;
    const r = rng(7);
    const uv2 = new Float32Array(nv * 2).map(() => -3 + 13 * r());
    const uv3 = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      const q = 0.2 + r();
      uv3.set([(-1 + 4 * r()) * q, (2 + 3 * r()) * q, q], i * 3);
    }
    for (const type of ['int16', 'uint16'] as const) {
      const t = type === 'int16' ? 'short' : 'ushort';
      const a = packUvs(uv2, nv, type);
      expect(a.uvs.length).toBe(nv * 2);
      const [su, sv, ou, ov] = a.transform;
      for (let i = 0; i < nv; i++) {
        expect(Math.abs(su * unpackValue(a.uvs[i * 2]!, t) + ou - uv2[i * 2]!)).toBeLessThanOrEqual(13 / 65534 + 1e-6);
        expect(Math.abs(sv * unpackValue(a.uvs[i * 2 + 1]!, t) + ov - uv2[i * 2 + 1]!)).toBeLessThanOrEqual(13 / 65534 + 1e-6);
      }
      const b = packUvs(uv3, nv, type);
      expect(b.uvs.length).toBe(nv * 3);
      const [tu, tv, pu, pv] = b.transform;
      for (let i = 0; i < nv; i++) {
        // 셰이더와 같은 식: (su·s + ou·q, sv·t + ov·q, q)를 q로 나눈다
        const s = unpackValue(b.uvs[i * 3]!, t), tt = unpackValue(b.uvs[i * 3 + 1]!, t), q = unpackValue(b.uvs[i * 3 + 2]!, t);
        const u = (tu * s + pu * q) / q, w = (tv * tt + pv * q) / q;
        const q0 = uv3[i * 3 + 2]!;
        expect(Math.abs(u - uv3[i * 3]! / q0)).toBeLessThan(1e-3);
        expect(Math.abs(w - uv3[i * 3 + 1]! / q0)).toBeLessThan(1e-3);
      }
    }
    // 한 축 값이 모두 같으면 축척 1
    const flat = packUvs(new Float32Array([2, 0, 2, 1]), 2);
    expect(flat.transform[0]).toBe(1);
    expect(flat.transform[2]).toBe(2);
  });

  it('release: fitsLayout·takeArrays·arraysMiss가 작은 배열을 받고 받지 않는 꼴은 뺀다', () => {
    const lay = { nv: 4, normals: true, uv: 2 as const, buv: 0 as const, ownBack: false };
    expect(fitsLayout(new Int8Array(16), lay, 3)).toBe(true);
    expect(fitsLayout(new Int8Array(12), lay, 3)).toBe(true);
    expect(fitsLayout(new Uint8Array(16) as never, lay, 3)).toBe(false);
    expect(fitsLayout(new Int16Array(8), lay, 2)).toBe(true);
    expect(fitsLayout(new Int8Array(8) as never, lay, 2)).toBe(false);
    const miss = { normals: true, uvs: true, backUvs: false };
    const n = new Int8Array(16), u = new Uint16Array(8);
    expect(takeArrays(miss, lay, { normals: n, uvs: u })).toEqual({ normals: n, uvs: u });
    expect(takeArrays(miss, lay, { normals: new Uint8Array(16) as never })).toBeNull();
    expect(arraysMiss(lay, { normals: n, uvs: u })).toBeNull();
    expect(arraysMiss(lay, { normals: n })).toEqual({ normals: false, uvs: true, backUvs: false });
  });
});

// ───────────── 3b. 렌더러·뷰어(가짜 WebGL) ─────────────
/** 렌더러 그물 기록 */
type Rec = { src: Mesh3d; vao: unknown; attrs: { nrm: FakeBuffer | null; uv: FakeBuffer | null; buv: FakeBuffer | null }; uvT: unknown; hasNormals: boolean };
const recOf = (v: Viewer3d, id: string): Rec => (v as unknown as { renderer: { meshes: Rec[] } }).renderer.meshes.find((r) => r.src.id === id)!;
const bytesOf = (a: ArrayBufferView): Uint8Array => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/** 무늬 장면(뒷면 무늬 — 상자는 uvs를 함께, 원근 판은 따로 준 backUvs)과 그 작은 배열 판 */
function texScene(compact: boolean): Scene3d {
  const s = syntheticScene({ segments: 300, sphereSeg: 24, textures: true });
  const quad = s.meshes.find((m) => m.id === '원근 무늬')!;
  quad.backTexture = '바둑판';
  quad.backUvs = new Float32Array([0, 0, 2, 0, 2, 3, 0, 3]);
  s.meshes.find((m) => m.id === '무늬 상자')!.backTexture = '바둑판';
  if (compact) s.meshes = s.meshes.map(compactMesh);
  return s;
}
async function until(cond: () => boolean, ms = 10_000): Promise<void> {
  const end = performance.now() + ms;
  while (!cond()) {
    if (performance.now() > end) throw new Error('기다림 시간을 넘었습니다');
    await new Promise((r) => setTimeout(r, 1));
  }
}
const texReady = (v: Viewer3d): Promise<void> => until(() => v.stats.textures.count > 0 && v.stats.textures.ready === v.stats.textures.count);
const r9 = (x: number): number => +x.toPrecision(9);
const r9s = (p: ArrayLike<number> | undefined | null): number[] | null => (p ? Array.from(p, r9) : null);
function picks(v: Viewer3d): unknown[] {
  const out: unknown[] = [];
  for (let j = 0; j < 9; j++)
    for (let i = 0; i < 12; i++) {
      const p = v.pick(((i + 0.5) * 800) / 12, ((j + 0.5) * 600) / 9, { edges: i % 2 === 0 });
      out.push(p ? [p.kind, p.id, p.index, r9s(p.point), r9s(p.normal)] : null);
    }
  return out;
}
/** 그리기 한 번의 기록(한 번 그린 뒤 — 묶인 무늬 상태가 같게) */
function frame(v: Viewer3d): DrawEntry[] {
  const gl = glOf(v);
  v.renderNow();
  gl.draws = [];
  gl.logDraws = true;
  gl.logTextures = true;
  v.renderNow();
  gl.logDraws = false;
  gl.logTextures = false;
  return gl.draws.map((d) => ({ ...d, args: d.args.map((x, i) => (i === 0 || (d.op === 'drawElements' && i === 2) ? (gl.nameOf(x) ?? x) : x)) as unknown as number[] }));
}

describe('작은 법선·무늬 좌표를 그대로 올린다(0.26.0 — 가짜 WebGL)', () => {
  it('속성 꼴: Int8 법선(4값)은 BYTE·정규화·4바이트, Int16 무늬 좌표는 SHORT·정규화, Float32 그물은 0.25.0과 같은 FLOAT 꼴', async () => {
    const vf = viewer(texScene(false));
    const vc = viewer(texScene(true));
    await texReady(vf);
    await texReady(vc);
    const gf = glOf(vf), gc = glOf(vc);
    const sf = recOf(vf, '구'), sc = recOf(vc, '구');
    const nv = sf.src.positions.length / 3;
    expect(gf.attribOf(sf.vao as never, 1)).toMatchObject({ size: 3, stride: 12, offset: 0, type: 'FLOAT', norm: false });
    expect(gc.attribOf(sc.vao as never, 1)).toMatchObject({ size: 3, stride: 4, offset: 0, type: 'BYTE', norm: true });
    expect(sf.attrs.nrm!.bytes.length).toBe(nv * 12);
    expect(sc.attrs.nrm!.bytes.length).toBe(nv * 4);
    expect(sc.attrs.nrm!.bytes).toEqual(bytesOf(sc.src.normals!));
    expect(sc.hasNormals).toBe(true);
    const bf = recOf(vf, '무늬 상자'), bc = recOf(vc, '무늬 상자');
    expect(gf.attribOf(bf.vao as never, 3)).toMatchObject({ size: 2, stride: 8, type: 'FLOAT', norm: false });
    expect(gc.attribOf(bc.vao as never, 3)).toMatchObject({ size: 2, stride: 4, type: 'SHORT', norm: true });
    // 뒷면이 uvs를 함께 쓰면 같은 버퍼·같은 꼴
    expect(bc.attrs.buv).toBe(bc.attrs.uv);
    expect(gc.attribOf(bc.vao as never, 4)).toMatchObject({ size: 2, stride: 4, type: 'SHORT', norm: true });
    expect(bc.uvT).toEqual(bc.src.uvTransform);
    expect(bf.uvT).toBeNull();
    // 원근 무늬(3값)와 따로 준 뒷면 무늬 좌표(backUvTransform)
    const qc = recOf(vc, '원근 무늬');
    expect(gc.attribOf(qc.vao as never, 3)).toMatchObject({ size: 3, stride: 6, type: 'SHORT', norm: true });
    expect(gc.attribOf(qc.vao as never, 4)).toMatchObject({ size: 2, stride: 4, type: 'SHORT', norm: true });
    expect((qc as unknown as { back: { uvT: unknown } }).back.uvT).toEqual(qc.src.backUvTransform);
    // 균일 변수: 작은 배열 그물은 그 변환, Float32 그물은 (1, 1, 0, 0)
    const df = frame(vf), dc = frame(vc);
    const uvtOf = (ds: DrawEntry[]): unknown[] => ds.filter((d) => d.uniforms.includes('"u_uvt"')).map((d) => (JSON.parse(d.uniforms) as [string, unknown][]).find((u) => u[0] === 'u_uvt')![1]);
    expect(uvtOf(df).length).toBeGreaterThan(0);
    for (const u of uvtOf(df)) expect(u).toEqual([1, 1, 0, 0]);
    expect(uvtOf(dc).some((u) => JSON.stringify(u) === JSON.stringify(bc.src.uvTransform))).toBe(true);
    // 그리기 수·프로그램·그리기 인자는 같다(속성 꼴·버퍼·u_uvt만 다르다)
    expect(dc.map((d) => [d.op, d.args, d.prog])).toEqual(df.map((d) => [d.op, d.args, d.prog]));
  });

  it('고르기·범위·전체 보기·측정·단면은 Float32 장면과 같다(법선·무늬 좌표를 읽지 않는다)', async () => {
    const vf = viewer(texScene(false));
    const vc = viewer(texScene(true));
    expect(picks(vc)).toEqual(picks(vf));
    for (const a of ['x', 'y', 'z'] as const) expect(vc.sectionRange(a)).toEqual(vf.sectionRange(a));
    expect(vc.getCamera()).toEqual(vf.getCamera());
    vf.setSectionAxis('z', 0.4);
    vc.setSectionAxis('z', 0.4);
    expect(picks(vc)).toEqual(picks(vf));
    expect(vc.section).toEqual(vf.section);
    const meas = (v: Viewer3d): unknown => {
      const out: unknown[] = [];
      v.onMeasure((m) => m && out.push([r9s(m.a), r9s(m.b), r9(m.distance), m.snapA ?? null, m.snapB ?? null]));
      v.setMeasureMode(true);
      v.setMeasureSnap({ midpoints: true });
      const a = scr(v, [-80, 0, 50]), b = scr(v, [-20, 60, 50]);
      clickXY(v, a.x + 1, a.y + 1);
      clickXY(v, b.x - 1, b.y + 1);
      const c = scr(v, [190, 40, 70]);
      clickXY(v, c.x + 0.4, c.y + 0.3);
      clickXY(v, c.x + 20.4, c.y + 10.3);
      return out;
    };
    expect(meas(vc)).toEqual(meas(vf));
  });

  it('받지 않는 꼴(Uint8Array 법선)은 법선 없이(평면 음영) — 0.25.0에서 길이가 모자란 법선과 같다', () => {
    const m = boxMesh('상자', [0, 0, 0], [10, 10, 10], [0.5, 0.5, 0.5, 1]);
    const v = viewer({ name: 'u8', units: 'mm', meshes: [{ ...m, normals: new Uint8Array(32) as never }], lines: [] });
    const r = recOf(v, '상자');
    expect(r.attrs.nrm).toBeNull();
    expect(r.hasNormals).toBe(false);
    expect(glOf(v).attribOf(r.vao as never, 1)).toBeUndefined();
  });

  it('놓기·문맥 복구: 작은 배열을 놓고 되찾은 뒤 작은 배열로 다시 주면 놓지 않은 뷰어와 같은 그림', async () => {
    const a = texScene(true), b = texScene(true), keep = texScene(true);
    const A = viewer(a, { release: true });
    const B = viewer(b);
    await texReady(A);
    await texReady(B);
    expect(a.meshes.find((m) => m.id === '구')!.normals).toBeUndefined();
    expect(a.meshes.find((m) => m.id === '무늬 상자')!.uvs).toBeUndefined();
    // 변환은 놓지 않는다(다시 준 배열을 펴는 데 쓴다)
    expect(a.meshes.find((m) => m.id === '무늬 상자')!.uvTransform).toEqual(keep.meshes.find((m) => m.id === '무늬 상자')!.uvTransform);
    expect(frame(A)).toEqual(frame(B));
    const needs: unknown[] = [];
    A.onContextRestore((need) => {
      needs.push(need);
      for (const n of need.meshes) {
        const o = keep.meshes.find((m) => m.id === n.id)!;
        A.restoreMeshArrays(n.id, { normals: o.normals, uvs: o.uvs, backUvs: o.backUvs });
      }
      for (const id of need.textures) void A.restoreTexture(id, keep.textures!.find((t) => t.id === id)!.data!);
    });
    const cv = A.canvas as unknown as FakeElement;
    cv.fire('webglcontextlost', {});
    cv.fire('webglcontextrestored', {});
    await until(() => A.restoreNeed === null && A.stats.textures.missing === 0);
    await texReady(A);
    expect(needs.length).toBe(1);
    expect((needs[0] as { meshes: { id: string }[] }).meshes.map((m) => m.id).sort()).toEqual(['구', '무늬 상자', '원근 무늬'].sort());
    expect(glOf(A).attribOf(recOf(A, '구').vao as never, 1)).toMatchObject({ type: 'BYTE', norm: true, stride: 4 });
    expect(frame(A)).toEqual(frame(B));
  });

  it('그물 바꾸기 구간(setMesh vertices): 제자리에서 고친 Int8 법선·Int16 무늬 좌표 구간을 값 크기대로 올린다', () => {
    const s = texScene(true);
    const v = viewer(s);
    const sphere = s.meshes.find((m) => m.id === '구')!;
    const n = sphere.normals as Int8Array;
    for (let i = 10 * 4; i < 14 * 4; i++) n[i] = (n[i]! + 37) & 0x7f;
    expect(v.setMesh(sphere, { vertices: { start: 10, count: 4 } })).toBe(true);
    const r = recOf(v, '구');
    expect(r.attrs.nrm!.bytes).toEqual(bytesOf(n));
    expect(r.attrs.nrm!.subCalls).toBe(1);
    const box = s.meshes.find((m) => m.id === '무늬 상자')!;
    const u = box.uvs as Int16Array;
    u[5 * 2] = 1234;
    u[6 * 2 + 1] = -4321;
    v.setMesh(box, { vertices: [{ start: 5, count: 2 }] });
    expect(recOf(v, '무늬 상자').attrs.uv!.bytes).toEqual(bytesOf(u));
  });
});

// ───────────── 4. 끌어온 점에서 나란함·수직 방향(순수) ─────────────
describe('trackDirGuides·trackDirSnap(0.26.0 — 끌어온 점에서 기준 선분과 나란함·수직)', () => {
  const near = (a: readonly number[], b: readonly number[], tol = 1e-12): boolean => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!) <= tol;
  const P: V3 = [30, 20, 15];
  const s2 = Math.SQRT1_2;

  it('기울어진 기준 선분: 나란함 → P에서 내린 수직 → 축을 수직 평면에 비친 방향(같은 선·축과 같은 선은 뺀다)', () => {
    const g = trackDirGuides(P, [[0, 0, 0], [10, 10, 0]]);
    expect(g.map((x) => x.kind)).toEqual(['parallel', 'perpendicular', 'perpendicular']);
    expect(near(g[0]!.dir, [s2, s2, 0])).toBe(true);
    // 직선 위 발 (25, 25, 0)로 — (−5, 5, −15) 방향
    const l = Math.hypot(5, 5, 15);
    expect(near(g[1]!.dir, [-5 / l, 5 / l, -15 / l])).toBe(true);
    // X를 비친 (1, −1, 0)/√2 — Y를 비친 것은 같은 선이라 빼고, Z는 축과 같은 선이라 뺀다(끌어온 축이 맡는다)
    expect(near(g[2]!.dir, [s2, -s2, 0])).toBe(true);
  });

  it('축과 나란한 기준 선분은 나란함을 빼고(끌어온 축), 내린 수직만. P가 직선 위면 내린 수직이 없다. 길이 0인 선분은 빈 목록', () => {
    const g = trackDirGuides(P, [[0, 0, 0], [5, 0, 0]]);
    expect(g).toEqual([{ kind: 'perpendicular', dir: [0, -0.8, -0.6] }]);
    expect(trackDirGuides([5, 5, 0], [[0, 0, 0], [10, 10, 0]]).map((x) => x.kind)).toEqual(['parallel', 'perpendicular']);
    expect(trackDirGuides(P, [[1, 2, 3], [1, 2, 3]])).toEqual([]);
    expect(trackDirGuides([NaN, 0, 0], [[0, 0, 0], [1, 1, 0]])).toEqual([]);
  });

  it('앱의 그리기 축(축을 그 축으로 본다 — 세계 X와 같은 기준 선분도 앱 축이 아니면 나란함)', () => {
    const axes = { x: [s2, s2, 0], y: [-s2, s2, 0], z: [0, 0, 1] };
    const g = trackDirGuides(P, [[0, 0, 0], [5, 0, 0]], axes);
    expect(g[0]).toEqual({ kind: 'parallel', dir: [1, 0, 0] });
    // 앱 X축과 나란한 기준 선분은 나란함을 뺀다
    expect(trackDirGuides(P, [[0, 0, 0], [3, 3, 0]], axes)[0]!.kind).toBe('perpendicular');
  });

  it('trackDirSnap: 나란한 선·내린 수직 위 점(광선에 가장 가까운 점), P 둘레·첫 점과 같은 P·기준 선분 없음·먼 커서는 없다', () => {
    const iso = dirToAngles([1, -1, 0.8]);
    const cam: CameraState = { ...defaultCamera(), yaw: iso.yaw, pitch: iso.pitch, target: [0, 0, 0], distance: 200, projection: 'perspective' };
    const f = computeFrame(cam, 600, 400, { center: [0, 0, 0], radius: 60 });
    const at = (p: readonly number[]): [number, number] => {
      const s = projectToScreen(f, p)!;
      return [s[0], s[1]];
    };
    const seg: [V3, V3] = [[0, 0, 0], [10, 10, 0]];
    const W: V3 = [P[0] - 20 * s2, P[1] - 20 * s2, P[2]];
    const [x, y] = at(W);
    const r = trackDirSnap(f, [P], seg, x + 0.3, y - 0.2, 10)!;
    expect(r.kind).toBe('parallel');
    expect(r.from).toEqual(P);
    expect(r.from).not.toBe(P);
    expect(r.distPx).toBeLessThan(1);
    // 찍을 점은 그 선 위
    const t = (r.p[0] - P[0]) * s2 + (r.p[1] - P[1]) * s2;
    expect(near(r.p, [P[0] + t * s2, P[1] + t * s2, P[2]], 1e-9)).toBe(true);
    const l = Math.hypot(5, 5, 15);
    const F: V3 = [P[0] - (5 / l) * 12, P[1] + (5 / l) * 12, P[2] - (15 / l) * 12];
    const [fx, fy] = at(F);
    expect(trackDirSnap(f, [P], seg, fx + 0.2, fy + 0.3, 10)).toMatchObject({ kind: 'perpendicular' });
    const [px, py] = at(P);
    expect(trackDirSnap(f, [P], seg, px + 4, py, 10)).toBeNull();
    expect(trackDirSnap(f, [P], seg, x, y, 10, P)).toBeNull();
    expect(trackDirSnap(f, [P], null, x, y, 10)).toBeNull();
    expect(trackDirSnap(f, [], seg, x, y, 10)).toBeNull();
    expect(trackDirSnap(f, [P], seg, x + 60, y + 40, 10)).toBeNull();
  });
});
