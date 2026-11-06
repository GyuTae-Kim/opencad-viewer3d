/**
 * 0.47.0 겹친 것 고르기 돌리기(46차가 남긴 것 — AutoCAD 선택 돌리기): pickCandidates와 setKeyboardSnap 고르기 모드의 Tab·Enter(pickCycle — 기본 켬).
 * 장면(위에서 봄): 아래 상자 L [0,0,0]–[100,100,20], 위 상자 U [20,20,40]–[80,80,50](윗면 대각선이 (20,20)–(80,80)),
 * U 윗면(z 50) 위 선분 묶음 '선' S0 (30,50)–(70,50)·S1(S0과 꼭 겹침)·S2 (50,30)–(50,70), U 안 점 P (60,60,45)(윗면에 가림).
 * 카메라 대상 (50,50,50) — 캔버스 가운데(가상 커서를 켜는 자리)가 세 선분이 만나는 점이다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type KeyboardSnapOptions, type PickEvent, Viewer3d } from '../src/viewer';
import { PICK_CANDIDATES_MAX, samePickTarget } from '../src/scenepick';
import { keySnapHint, KEY_SNAP_KEYS } from '../src/keysnap';
import * as entry from '../src/index';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Pick3d, Scene3d } from '../src/types';

const L = boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
const LINES: LineSet3d = {
  id: '선',
  name: '선',
  positions: new Float32Array([30, 50, 50, 70, 50, 50, 30, 50, 50, 70, 50, 50, 50, 30, 50, 50, 70, 50]),
  color: [0.9, 0.9, 0.2, 1],
};
const scene: Scene3d = {
  name: 'cycle',
  units: 'mm',
  meshes: [L, U],
  lines: [LINES],
  points: [{ id: 'P', name: 'P', positions: new Float32Array([60, 60, 45]), color: [1, 0.3, 0.3, 1], size: 6 }],
};

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

const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  cv(v).fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
const clickXY = (v: Viewer3d, x: number, y: number): void => {
  ptr(v, 'pointermove', x, y, 0);
  ptr(v, 'pointerdown', x, y, 1);
  ptr(v, 'pointerup', x, y, 0);
  v.renderNow();
};
function key(v: Viewer3d, k: string, mods: { shift?: boolean } = {}): boolean {
  let prevented = false;
  cv(v).fire('keydown', {
    key: k,
    code: '',
    shiftKey: !!mods.shift,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    preventDefault() {
      prevented = true;
    },
  });
  v.renderNow();
  return prevented;
}
function make(opts: { pickEdges?: boolean } = {}): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, ...opts });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [50, 50, 50], distance: 400 });
  v.renderNow();
  return v;
}
function withKeys(v: Viewer3d, o: KeyboardSnapOptions = {}): KeyboardSnapAnnouncement[] {
  const said: KeyboardSnapAnnouncement[] = [];
  v.setKeyboardSnap({ ...o, announce: (a) => said.push(a) });
  return said;
}
const sig = (p: Pick3d): string => `${p.kind}:${p.id}${p.section ? ':cut' : ''}`;
const depthZ = (p: Pick3d): number => Math.round(p.point[2] * 1000) / 1000;

describe('pickCandidates(0.47.0 — 겹친 고르기 후보)', () => {
  it('세 선분이 만나는 자리: 선분 셋 → U 윗면(대각선 위 두 삼각형은 하나) → U 아랫면 → L 윗면 → L 아랫면', () => {
    const v = make();
    const s = v.project([50, 50, 50])!;
    const list = v.pickCandidates(s.x, s.y);
    expect(list.map(sig)).toEqual(['line:선', 'line:선', 'line:선', 'mesh:U', 'mesh:U', 'mesh:L', 'mesh:L']);
    expect(new Set(list.slice(0, 3).map((p) => p.index)).size).toBe(3);
    expect(list.slice(3).map(depthZ)).toEqual([50, 40, 20, 0]);
    // 첫째는 pick과 같다
    expect(samePickTarget(list[0]!, v.pick(s.x, s.y)!)).toBe(true);
    // 상태를 바꾸지 않는다 — 다시 불러도 같고, 고르기도 그대로
    expect(v.pickCandidates(s.x, s.y)).toEqual(list);
    expect(samePickTarget(v.pick(s.x, s.y)!, list[0]!)).toBe(true);
    // 한도
    expect(v.pickCandidates(s.x, s.y, { max: 2 }).map(sig)).toEqual(['line:선', 'line:선']);
    expect(PICK_CANDIDATES_MAX).toBe(16);
  });

  it('앞 면에 가린 점은 그 면을 걷어 낸 뒤에 나온다(깊이 벗기기). 빈 곳은 빈 배열', () => {
    const v = make();
    const s = v.project([60, 60, 45])!;
    expect(v.pick(s.x, s.y)).toMatchObject({ kind: 'mesh', id: 'U' });
    const list = v.pickCandidates(s.x, s.y);
    expect(list.map(sig)).toEqual(['mesh:U', 'point:P', 'mesh:U', 'mesh:L', 'mesh:L']);
    const far = v.project([150, 150, 0])!;
    expect(v.pickCandidates(far.x, far.y)).toEqual([]);
    expect(v.pickCandidates(Number.NaN, 3)).toEqual([]);
  });

  it('첫째 후보는 같은 선택의 pick과 같다(격자 — 기본·윤곽선·그물 면만·반투명 지나기)', () => {
    const v = make();
    v.setItemOpacity('U', 0.4);
    for (const o of [{}, { edges: true }, { meshesOnly: true }, { throughTranslucent: true }, { meshesOnly: true, throughTranslucent: true }]) {
      let n = 0;
      for (let y = 150; y <= 450; y += 37)
        for (let x = 250; x <= 550; x += 41) {
          const p = v.pick(x + 0.31, y + 0.17, o);
          const list = v.pickCandidates(x + 0.31, y + 0.17, o);
          if (!p) expect(list).toEqual([]);
          else {
            expect(samePickTarget(list[0]!, p)).toBe(true);
            n++;
          }
          if ((o as { meshesOnly?: boolean }).meshesOnly) expect(list.every((q) => q.kind === 'mesh')).toBe(true);
        }
      expect(n).toBeGreaterThan(10);
    }
  });

  it('반투명 지나기: 반투명 U는 점을 가리지 않아 점이 먼저, 그다음 불투명 면(L)이 앞에서부터, 반투명 U 면은 그 뒤', () => {
    const v = make();
    v.setItemOpacity('U', 0.4);
    const s = v.project([60, 60, 45])!;
    const list = v.pickCandidates(s.x, s.y, { throughTranslucent: true });
    expect(list.map(sig)).toEqual(['point:P', 'mesh:L', 'mesh:L', 'mesh:U', 'mesh:U']);
    expect(list.slice(1).map(depthZ)).toEqual([20, 0, 50, 40]);
    // 지나지 않으면 반투명 U 윗면이 먼저(점은 원래 가리지 않는다)
    expect(v.pickCandidates(s.x, s.y).map(sig)).toEqual(['point:P', 'mesh:U', 'mesh:U', 'mesh:L', 'mesh:L']);
  });

  it('단면: 잘린 면이 먼저 하나만, 그 뒤 면들(걷어 낸 삼각형이 없는 잘린 면을 만들지 않는다)', () => {
    const v = make();
    v.setSection({ normal: [0, 0, 1], offset: 45 });
    v.renderNow();
    const s = v.project([35, 65, 45])!;
    const list = v.pickCandidates(s.x, s.y);
    expect(list.map(sig)).toEqual(['mesh:U:cut', 'mesh:U', 'mesh:L', 'mesh:L']);
    expect(list.map(depthZ)).toEqual([45, 40, 20, 0]);
    expect(list.filter((p) => p.section).length).toBe(1);
  });

  it('윤곽선을 켜면 윤곽선도 후보(선분 다음, 면 앞)', () => {
    const v = make({ pickEdges: true });
    const s = v.project([80, 35, 50])!;
    const list = v.pickCandidates(s.x + 0.4, s.y);
    expect(list[0]).toMatchObject({ kind: 'edge', id: 'U' });
    expect(list.findIndex((p) => p.kind === 'mesh')).toBeGreaterThan(0);
  });

  it('입구에서 내보낸다', () => {
    expect(entry.PICK_CANDIDATES_MAX).toBe(16);
    expect(entry.samePickTarget).toBe(samePickTarget);
  });
});

describe('setKeyboardSnap 고르기 모드 후보 돌리기(0.47.0 pickCycle)', () => {
  it('켜면(기본) 커서 자리의 겹친 후보 수·차례를 알리고 Tab·Shift+Tab으로 돌린다', () => {
    const v = make();
    const said = withKeys(v);
    expect(key(v, 'Enter')).toBe(true); // 커서를 켠다(가운데)
    const list = v.pickCandidates(400, 300, 'keyboard');
    expect(list.length).toBe(7);
    expect(v.keyboardCursor).toMatchObject({ mode: 'pick', index: 0, count: 7 });
    expect(said.at(-1)!.text).toMatch(/^가상 커서를 켰습니다\. 선 선분 1\/7: X 50\.0+, Y 50\.0+, Z 50\.0+\. /);
    expect(said.at(-1)!.text).toContain('후보 Tab');
    expect(said.at(-1)!).toMatchObject({ reason: 'start', index: 0, count: 7 });
    for (let i = 1; i <= 7; i++) {
      expect(key(v, 'Tab')).toBe(true);
      const a = said.at(-1)!;
      expect(a.reason).toBe('cycle');
      expect(a.index).toBe(i % 7);
      expect(samePickTarget(a.pick!, list[i % 7]!)).toBe(true);
    }
    expect(key(v, 'Tab', { shift: true })).toBe(true);
    expect(v.keyboardCursor!.index).toBe(6);
    expect(said.at(-1)!.text).toMatch(/^L 면 7\/7: /);
    // Esc로 끄면 Tab은 초점 이동
    expect(key(v, 'Escape')).toBe(true);
    expect(key(v, 'Tab')).toBe(false);
  });

  it('Enter: 첫째 후보는 누르기와 같은 고르기(cycle 없음), 둘째 이후는 그 후보 — 모든 알림, front도 그 후보, 그물 면만 받는 알림은 그 알림의 보통 고르기', () => {
    const v = make();
    withKeys(v);
    const got: [string, Pick3d | null, PickEvent][] = [];
    v.onPick((p, e) => got.push(['plain', p, e]));
    v.onPick((p, e) => got.push(['front', p, e]), { throughTranslucent: true, front: true });
    v.onPick((p, e) => got.push(['faces', p, e]), { meshesOnly: true });
    key(v, 'Enter');
    key(v, 'Enter');
    const first = got.splice(0);
    clickXY(v, 400, 300);
    const mouse = got.splice(0);
    expect(first.map(([k, p, e]) => [k, p && sig(p), e.cycle ?? null, e.pointerType])).toEqual([
      ['plain', 'line:선', null, 'keyboard'],
      ['front', 'line:선', null, 'keyboard'],
      ['faces', 'mesh:U', null, 'keyboard'],
    ]);
    expect(first.map(([, p]) => p)).toEqual(mouse.map(([, p]) => p));
    // 둘째 선분(차례 1) — 누르기가 끈 커서를 Enter로 다시 켠다(가운데)
    key(v, 'Enter');
    expect(v.keyboardCursor).toMatchObject({ x: 400, y: 300, index: 0 });
    key(v, 'Tab');
    const second = v.pickCandidates(400, 300, 'keyboard')[1]!;
    key(v, 'Enter');
    const [a, b, c] = got.splice(0);
    expect(samePickTarget(a![1]!, second)).toBe(true);
    expect(a![2].cycle).toEqual({ index: 1, count: 7 });
    expect(samePickTarget(b![1]!, second)).toBe(true);
    expect(samePickTarget(b![2].front!, second)).toBe(true);
    expect(c![1]).toMatchObject({ kind: 'mesh', id: 'U' });
    expect(c![2].cycle).toEqual({ index: 1, count: 7 });
    // 차례 4(U 아랫면)를 고르면 그물 면만 받는 알림도 그 후보
    for (let i = 0; i < 3; i++) key(v, 'Tab');
    expect(v.keyboardCursor!.index).toBe(4);
    key(v, 'Enter');
    const four = got.splice(0);
    expect(four.map(([, p]) => p && depthZ(p))).toEqual([40, 40, 40]);
    // 고른 뒤에도 차례를 지킨다
    expect(v.keyboardCursor!.index).toBe(4);
  });

  it('pickCycle 객체: 후보를 고를 선택(그물 면만)', () => {
    const v = make();
    const said = withKeys(v, { pickCycle: { meshesOnly: true } });
    key(v, 'Enter');
    expect(v.keyboardCursor).toMatchObject({ count: 4 });
    expect(said.at(-1)!.pick).toMatchObject({ kind: 'mesh', id: 'U' });
    expect(v.keyboardSnap!.pickCycle).toEqual({ meshesOnly: true });
    // 켜진 커서에서 선택을 바꾸면 다시 구한다
    v.setKeyboardSnap({ pickCycle: true });
    expect(v.keyboardCursor).toMatchObject({ count: 7, index: 0 });
    v.setKeyboardSnap({ pickCycle: false });
    expect(v.keyboardCursor).toMatchObject({ count: 0, index: 0 });
    expect(key(v, 'Tab')).toBe(false);
  });

  it('pickCycle false면 0.46.0 고르기 모드 그대로(알림 글·키 안내·후보 수)', () => {
    const v = make();
    const said = withKeys(v, { pickCycle: false });
    key(v, 'Enter');
    expect(said.at(-1)!.text).toMatch(/^가상 커서를 켰습니다\. 선 선분: X 50\.0+, Y 50\.0+, Z 50\.0+\. /);
    expect(said.at(-1)!.text.endsWith(`. ${keySnapHint(KEY_SNAP_KEYS, 'pick')}`)).toBe(true);
    expect(keySnapHint(KEY_SNAP_KEYS, 'pick')).toBe('옮기기 ←→↑↓ · 고르기 Enter · 끄기 Esc');
    expect(keySnapHint(KEY_SNAP_KEYS, 'pick', true)).toBe('옮기기 ←→↑↓ · 후보 Tab · 고르기 Enter · 끄기 Esc');
    expect(said.at(-1)!).toMatchObject({ index: 0, count: 0 });
  });

  it('후보 표식: 선분·점 후보는 화면 덧그림에 강조 색 선·고리, 그물 면 후보·pickCycle false·측정 모드는 없다', () => {
    const v = make();
    withKeys(v);
    const hi = (v as unknown as { theme: { highlight: string } }).theme.highlight;
    const octx = (v as unknown as { octx: Record<string, unknown> }).octx;
    let strokes = 0;
    const real = octx.stroke as () => void;
    octx.stroke = (): void => {
      if (octx.strokeStyle === hi) strokes++;
      real();
    };
    key(v, 'Enter');
    expect(strokes).toBe(1);
    for (let i = 0; i < 3; i++) key(v, 'Tab');
    strokes = 0;
    v.renderNow();
    expect(strokes).toBe(0); // U 윗면
    v.setKeyboardSnap({ pickCycle: false });
    strokes = 0;
    v.renderNow();
    expect(strokes).toBe(0);
    v.setKeyboardSnap(true);
    v.setMeasureMode(true);
    strokes = 0;
    v.renderNow();
    expect(strokes).toBe(0);
  });

  it('켜 두고 쓰지 않으면 마우스 고르기 알림이 끈 것과 같다', () => {
    const run = (keys: boolean): unknown[] => {
      const v = make();
      if (keys) v.setKeyboardSnap(true);
      const out: unknown[] = [];
      v.onPick((p, e) => out.push([p, e]));
      for (let y = 200; y < 420; y += 31) for (let x = 250; x < 560; x += 29) clickXY(v, x + 0.37, y + 0.23);
      return out;
    };
    expect(JSON.stringify(run(true))).toBe(JSON.stringify(run(false)));
  });
});
