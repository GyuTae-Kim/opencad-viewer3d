/**
 * 0.106.0 그리기 모드를 바꾼 뒤 측정 미리 보기·가상 커서 후보(108차): 고르기·측정 붙잡기는 음영 계열 모드(shaded·shadedEdges·hiddenLine·monochrome·noTexture)에서
 * 불투명 면이 그 뒤 선분·점·윤곽선을 가리고, 와이어프레임·X-ray에서는 가리지 않는다. 0.105.0의 setRenderMode는 모드만 바꿔, 마우스를 멈춘 채(가상 커서를 켠 채)
 * 가림이 바뀌는 모드로 바꾸면 측정 미리 보기·onMeasureHoverChange·가상 커서 Tab 후보·고르기 모드 표식이 커서를 옮길 때까지 앞 모드의 가림으로 남았다.
 * 이제 가림이 바뀌면 장면 길(0.98.0)처럼 측정 미리 보기는 다음 그림에서 그 자리에서 다시 구하고(rehover — 미리 보기가 있을 때만, 0.104.0 가장 늦은 포인터 자리),
 * 가상 커서 후보는 다음 그림·Tab 앞에서 다시 구한다(keySceneChanged). 결과는 그 모드에서 같은 자리로 커서를 다시 옮긴(켠) 것과 같다.
 * 같은 모드·같은 가림 계열 안에서 바꾸기, 측정·가상 커서가 꺼졌거나 미리 보기가 없을 때는 0.105.0 그대로다(다시 구하지 않는다).
 * 장면(위에서 봄): 아래 상자 L [-100,-100,0]–[200,200,20], 위 상자 U [20,20,40]–[80,80,50], U 아래 선분 B (30,50,30)–(70,50,30)
 * (가운데 점 (50,50,30) — 음영 계열에서는 U 윗면에 가린다)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type MeasureHoverSnap, Viewer3d } from '../src/viewer';
import type { RenderMode } from '../src/renderer';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Scene3d } from '../src/types';

type P3 = [number, number, number];
const L = boxMesh('L', [-100, -100, 0], [200, 200, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
const B: LineSet3d = { id: 'B', name: 'B', positions: new Float32Array([30, 50, 30, 70, 50, 30]), color: [0.9, 0.9, 0.2, 1] };
const scene: Scene3d = { name: 'mode', units: 'mm', meshes: [L, U], lines: [B] };
/** U 윗면 가운데(음영 계열 미리 보기 = 면 위 점, 와이어프레임·X-ray = 그 아래 B 가운데 점), U에서 먼 L 윗면(가림이 바뀌어도 같은 값) */
const A: P3 = [50, 50, 50];
const C: P3 = [150, 50, 20];
/** 가림이 바뀌는 모드 짝(앞 → 뒤) */
const CROSS: [RenderMode, RenderMode][] = [
  ['shaded', 'wireframe'],
  ['shadedEdges', 'xray'],
  ['hiddenLine', 'wireframe'],
  ['wireframe', 'shaded'],
  ['xray', 'monochrome'],
  ['wireframe', 'noTexture'],
];

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

function make(mode: RenderMode = 'shaded'): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, renderMode: mode });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  // 캔버스 가운데(가상 커서를 켜는 자리)가 B 가운데 점을 정확히 가리키지 않게 조금 비킨다
  v.setCamera({ ...v.getCamera(), target: [50.4, 50.3, 40], distance: 400 });
  v.renderNow();
  return v;
}
/** 측정 모드 + 붙잡기 선택 */
function measuring(mode: RenderMode = 'shaded'): Viewer3d {
  const v = make(mode);
  v.setMeasureMode(true);
  v.setMeasureSnap({ midpoints: true });
  return v;
}
const cv = (v: Viewer3d): FakeElement => v.canvas as unknown as FakeElement;
/** 세계 점의 화면 자리(조금 비켜 — 경계를 정확히 가리키지 않는다) */
function at(v: Viewer3d, p: P3): { x: number; y: number } {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x + 0.37, y: s.y - 0.21 };
}
/** 포인터 이동 하나(그리지 않는다) */
const pmove = (v: Viewer3d, p: P3): void => {
  const s = at(v, p);
  cv(v).fire('pointermove', { clientX: s.x, clientY: s.y, pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
};
const hover = (v: Viewer3d, p: P3): void => {
  pmove(v, p);
  v.renderNow();
};
/** 키 하나(그리지 않는다 — 모드를 바꾼 바로 뒤의 키가 다음 그림보다 먼저 오는 때) */
function press(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
}
const key = (v: Viewer3d, k: string): void => {
  press(v, k);
  v.renderNow();
};
/** 덧그림 한 번 그리기의 ctx 호출·값 넣기 기록 */
function trace(v: Viewer3d): string[] {
  const o = v as unknown as { octx: CanvasRenderingContext2D };
  const real = o.octx as unknown as Record<string | symbol, unknown>;
  const log: string[] = [];
  o.octx = new Proxy(real, {
    get: (t, k) => {
      const x = t[k];
      if (typeof x !== 'function') return x;
      return (...a: unknown[]): unknown => {
        log.push(`${String(k)}(${a.join(',')})`);
        return (x as (...b: unknown[]) => unknown).apply(t, a);
      };
    },
    set: (t, k, val) => {
      log.push(`${String(k)}=${String(val)}`);
      t[k] = val;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  v.renderNow();
  o.octx = real as unknown as CanvasRenderingContext2D;
  return log;
}
/** 뷰어 안 함수 부름 수(측정 붙잡기 셈 measureAt·가상 커서 후보 셈 keyRecompute — 다시 구했는지) */
function calls(v: Viewer3d, name: 'measureAt' | 'keyRecompute'): { n: number } {
  const o = v as unknown as Record<string, (...a: unknown[]) => unknown>;
  const real = o[name]!;
  const c = { n: 0 };
  o[name] = function (this: unknown, ...a: unknown[]): unknown {
    c.n++;
    return real.apply(this, a);
  };
  return c;
}
const z = (s: MeasureHoverSnap | null | undefined): number | null => (s ? Math.round(s.point[2] * 1000) / 1000 : null);
/** 미리 보기 상태(점·종류·잠글 방향) */
const st = (v: Viewer3d): string => JSON.stringify([v.measureHoverSnap, v.measureHoverLock]);

describe('0.106.0 측정 미리 보기(마우스) — 가림이 바뀌는 모드 바꾸기', () => {
  it.each(CROSS)('%s → %s 뒤 마우스를 옮기지 않고 다음 그림: 그 모드의 미리 보기 — 그 자리로 다시 옮긴 것과 같다(0.105.0은 앞 모드 것)', (from, to) => {
    const v = measuring(from);
    hover(v, A);
    const before = st(v);
    const n = calls(v, 'measureAt');
    v.setRenderMode(to);
    const t = trace(v);
    expect(n.n).toBe(1);
    const w = measuring(to);
    hover(w, A);
    expect(before).not.toBe(st(w));
    expect(st(v)).toBe(st(w));
    expect(t).toEqual(trace(w));
    // 음영 계열은 U 윗면 점, 와이어프레임·X-ray는 그 아래 B 가운데 점
    const occl = to !== 'wireframe' && to !== 'xray';
    expect(z(v.measureHoverSnap)).toBe(occl ? 50 : 30);
    if (!occl) expect(v.measureHoverSnap?.snap).toBe('midpoint');
  });

  it('onMeasureHoverChange: 다음 그림 뒤 한 번 새 값(0.105.0은 알리지 않았다) — 다시 구한 값이 같으면 알리지 않는다', () => {
    const v = measuring('shaded');
    const heard: (MeasureHoverSnap | null)[] = [];
    v.onMeasureHoverChange((s) => void heard.push(s));
    hover(v, A);
    expect(heard.map(z)).toEqual([50]);
    v.setRenderMode('wireframe');
    v.renderNow();
    expect(heard.map(z)).toEqual([50, 30]);
    expect(heard[1]).toEqual(v.measureHoverSnap);
    v.setRenderMode('shaded');
    v.renderNow();
    expect(heard.map(z)).toEqual([50, 30, 50]);
    // U에서 먼 L 윗면: 와이어프레임에서도 같은 면 위 점 — 다시 구하지만 알리지 않는다
    hover(v, C);
    heard.length = 0;
    const n = calls(v, 'measureAt');
    v.setRenderMode('wireframe');
    v.renderNow();
    expect(n.n).toBe(1);
    expect(heard).toEqual([]);
    expect(z(v.measureHoverSnap)).toBe(20);
  });

  it('같은 프레임에 먼저 온 포인터 이동: 가장 늦은 포인터 자리에서 새 모드로(0.104.0 규칙 그대로)', () => {
    const orders: [string, (v: Viewer3d) => void][] = [
      ['이동 뒤 모드 바꾸기', (v) => {
        pmove(v, C);
        v.setRenderMode('wireframe');
      }],
      ['모드 바꾸기 뒤 이동', (v) => {
        v.setRenderMode('wireframe');
        pmove(v, C);
      }],
    ];
    const w = measuring('wireframe');
    hover(w, C);
    for (const [name, steps] of orders) {
      const v = measuring('shaded');
      hover(v, A);
      steps(v);
      v.renderNow();
      expect(st(v), name).toBe(st(w));
    }
  });
});

describe('0.106.0 0.105.0 그대로인 길', () => {
  it('같은 모드·같은 가림 계열 안 바꾸기: 다시 구하지 않는다(미리 보기·덧그림 그대로)', () => {
    for (const [first, rest] of [
      ['shaded', ['shaded', 'shadedEdges', 'hiddenLine', 'monochrome', 'noTexture', 'shaded']],
      ['wireframe', ['wireframe', 'xray', 'wireframe']],
    ] as [RenderMode, RenderMode[]][]) {
      const v = measuring(first);
      hover(v, A);
      const s0 = st(v);
      const n = calls(v, 'measureAt');
      for (const m of rest) {
        v.setRenderMode(m);
        v.renderNow();
        expect(st(v), `${first} → ${m}`).toBe(s0);
      }
      expect(n.n).toBe(0);
    }
  });

  it('측정 모드가 아니거나 미리 보기가 없으면(움직이지 않음·포인터가 떠남) 다시 구하지 않는다', () => {
    const off = make('shaded');
    hover(off, A);
    const still = measuring('shaded');
    const left = measuring('shaded');
    hover(left, A);
    cv(left).fire('pointerleave', {});
    left.renderNow();
    for (const v of [off, still, left]) {
      const n = calls(v, 'measureAt');
      const k = calls(v, 'keyRecompute');
      v.setRenderMode('wireframe');
      v.renderNow();
      v.setRenderMode('shaded');
      v.renderNow();
      expect([n.n, k.n]).toEqual([0, 0]);
      expect(v.measureHoverSnap).toBeNull();
    }
  });
});

describe('0.106.0 가상 커서', () => {
  it('측정 모드: 가림이 바뀐 뒤 커서를 옮기지 않고 Tab — 그 모드의 측정 후보, 커서를 다시 켠 것과 같다(0.105.0은 앞 모드 후보를 알렸다)', () => {
    for (const [from, to] of [
      ['shaded', 'wireframe'],
      ['wireframe', 'shaded'],
    ] as [RenderMode, RenderMode][]) {
      const v = measuring(from);
      const said: KeyboardSnapAnnouncement[] = [];
      v.setKeyboardSnap({ announce: (a) => void said.push(a) });
      key(v, 'Enter');
      expect(z(said[0]!.snap)).toBe(from === 'shaded' ? 50 : 30);
      v.setRenderMode(to);
      said.length = 0;
      press(v, 'Tab');
      const a = said.splice(0);
      const t = trace(v);
      const s = [v.keyboardCursor, v.measureHoverSnap];
      key(v, 'Escape');
      key(v, 'Enter');
      said.length = 0;
      press(v, 'Tab');
      expect(a, `${from} → ${to}`).toEqual(said.splice(0));
      expect(t).toEqual(trace(v));
      expect(s).toEqual([v.keyboardCursor, v.measureHoverSnap]);
      expect(a).toHaveLength(1);
    }
  });

  it('측정 모드: 키 없이 다음 그림 — 그 모드의 첫 후보를 미리 보기로(장면 길처럼 refresh로 알린다)', () => {
    const v = measuring('shaded');
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    said.length = 0;
    v.setRenderMode('wireframe');
    const t = trace(v);
    const a = said.splice(0);
    const s = [v.keyboardCursor, v.measureHoverSnap];
    key(v, 'Escape');
    key(v, 'Enter');
    expect(a.map((x) => x.reason)).toEqual(['refresh']);
    expect(a[0]!.snap).toEqual(said.at(-1)!.snap);
    expect(z(a[0]!.snap)).toBe(30);
    expect(t).toEqual(trace(v));
    expect(s).toEqual([v.keyboardCursor, v.measureHoverSnap]);
  });

  it('고르기 모드(pickCycle 기본): 가림이 바뀐 뒤 키 없이 다음 그림·Tab — 그 모드의 겹친 고르기 후보 목록, 남은 같은 후보(U)는 그 차례(0.98.0 규칙 — 0.105.0은 앞 모드 목록)', () => {
    const v = make('shaded');
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    expect(said[0]).toMatchObject({ reason: 'start', mode: 'pick', index: 0, pick: { kind: 'mesh', id: 'U' } });
    v.setRenderMode('wireframe');
    const t = trace(v);
    const kc = v.keyboardCursor!;
    said.length = 0;
    press(v, 'Tab');
    const a = said.splice(0);
    // 와이어프레임에서 다시 켜면 첫 후보는 U 아래 선분 B, U는 그 뒤 차례 — 그 차례까지 Tab으로 간 상태와 같다
    key(v, 'Escape');
    key(v, 'Enter');
    expect(said.at(-1)!.pick).toMatchObject({ kind: 'line', id: 'B' });
    expect(kc.index).toBeGreaterThan(0);
    for (let i = 0; i < kc.index; i++) key(v, 'Tab');
    expect(said.at(-1)!.pick).toMatchObject({ kind: 'mesh', id: 'U' });
    expect(v.keyboardCursor).toEqual(kc);
    expect(trace(v)).toEqual(t);
    said.length = 0;
    press(v, 'Tab');
    expect(a).toEqual(said.splice(0));
    expect(a).toHaveLength(1);
  });

  it('같은 가림 계열 안 바꾸기: 후보를 다시 구하지 않는다(알림·차례 그대로)', () => {
    const v = measuring('shaded');
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ announce: (a) => void said.push(a) });
    key(v, 'Enter');
    key(v, 'Tab');
    const kc = v.keyboardCursor;
    said.length = 0;
    const k = calls(v, 'keyRecompute');
    v.setRenderMode('hiddenLine');
    v.renderNow();
    v.setRenderMode('shadedEdges');
    v.renderNow();
    expect(k.n).toBe(0);
    expect(said).toEqual([]);
    expect(v.keyboardCursor).toEqual(kc);
  });
});
