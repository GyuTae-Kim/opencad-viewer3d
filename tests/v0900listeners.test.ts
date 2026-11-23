/**
 * 0.90.0 알림 아홉의 한 규칙(90차 — 0.89.0 남은 한계): 0.89.0은 목록을 바로 도는 넷(onPick·onMeasure·onCameraChange·onSectionChange)과
 * 목록 사본을 도는 다섯(onSceneIssues·onContextLost·onContextRestore·onContextRestoreDone·onViewCubeExpandedChange)의 규칙이 달랐다.
 * 바로 도는 넷은 알림 동안 단 콜백을 그 알림에 불렀고(뗐다 다시 단 콜백은 끝 자리에서 또 — 자기를 그리하면 끝없이 되풀이), 사본 다섯은 알림 동안 뗀 콜백을 그 알림에 불렀다.
 * 0.90.0: 아홉 모두 브라우저 EventTarget.dispatchEvent처럼 — 알림을 시작할 때의 목록을 단 차례대로 돌되, 그 동안 뗀 콜백(뗐다 다시 단 것도)은 부르지 않고
 * 그 동안 단 콜백은 다음 알림부터 부른다. 알림 동안 dispose하면 남은 콜백을 부르지 않는다(0.89.0 그대로). 콜백을 하나만 단 앱의 차례·횟수·값은 그대로인지도 본다.
 * 0.89.0 dispose가 놓지 않던 앱 함수·자료(키보드 스냅 선택의 announce 등·가상 커서·덧그림·피할 상자·측정 글 꼴·미리 강조)도 놓는지,
 * 가상 커서 Enter로 찍은 측정 알림 안에서 앱이 dispose하거나 측정 모드를 꺼도 던지지 않는지 본다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { FakeElement, installDom } from './fakedom';
import { VIEW_DIRS, cameraBasis } from '../src/camera';
import { dot, normalize } from '../src/math';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { CUBE_BAND, cubeLayout, cubeTargets } from '../src/viewcube';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
});
afterAll(() => dom.restore());

const box = (): Scene3d => ({ name: 's', units: 'mm', meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1])], lines: [] });
/** 깨진 색 그물 하나(입력 알림 'mesh:c:color:fixed') */
const broken = (): Scene3d => ({ ...box(), meshes: [...box().meshes, boxMesh('c', [20, 0, 0], [30, 10, 10], [NaN, NaN, NaN, NaN])] });
interface View {
  v: Viewer3d;
  canvas: FakeElement;
  cube: FakeElement;
}
function view(): View {
  const host = dom.host();
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: true, viewCubeSize: 76 });
  views.push(v);
  v.setScene(box());
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement, cube: host.querySelector('.v3d-cube')! };
}
const lose = (c: FakeElement): void => c.fire('webglcontextlost', {});
const restore = (c: FakeElement): void => c.fire('webglcontextrestored', {});
const ptr = (w: View, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
function key(w: View, k: string): void {
  w.canvas.fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
  w.v.renderNow();
}
/** 상자 가운데의 화면 자리 */
function mid(v: Viewer3d): { x: number; y: number } {
  const s = v.project([5, 5, 5])!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
}
let pid = 100;
/** 손가락으로 큐브 위 면 자리를 한 번 누른다(접힌 큐브면 편다 — 0.44.0) */
function tapCube(v: Viewer3d, cube: FakeElement): void {
  const t = cubeTargets(cameraBasis(v.getCamera()), cubeLayout(76), CUBE_BAND).find((x) => dot(x.dir, normalize(VIEW_DIRS.top)) > 0.9999)!;
  const q = t.pieces[0]!;
  const ev = { clientX: (q[0]![0] + q[2]![0]) / 2, clientY: (q[0]![1] + q[2]![1]) / 2, pointerId: ++pid, pointerType: 'touch', button: 0, buttons: 1, isPrimary: true };
  cube.fire('pointerdown', ev);
  cube.fire('pointerup', { ...ev, buttons: 0 });
}

type Cb = (...a: unknown[]) => void;
/** 알림 하나: 다는 법, 그 알림을 한 번 부르는 법(n = 몇 번째), 부른 직후 뷰어에서 읽은 첫째 값 */
interface Kind {
  setup?: (w: View) => void;
  on: (v: Viewer3d, cb: Cb) => () => void;
  fire: (w: View, n: number) => void;
  value: (w: View) => unknown;
}
const loseRestore = (w: View): void => {
  lose(w.canvas);
  restore(w.canvas);
};
const KINDS: Record<string, Kind> = {
  onPick: {
    on: (v, cb) => v.onPick(cb),
    // 빈 곳 누르기(null)
    fire: (w) => {
      ptr(w, 'pointerdown', 3, 3, 1);
      ptr(w, 'pointerup', 3, 3, 0);
    },
    value: () => null,
  },
  onMeasure: {
    setup: (w) => w.v.setMeasureMode(true),
    on: (v, cb) => v.onMeasure(cb),
    // 첫 점을 찍고(알림 없음) 지운다(null 알림 하나)
    fire: (w) => {
      const s = mid(w.v);
      expect(w.v.commitMeasureCandidate(s.x, s.y, 0)).toBe(true);
      w.v.clearMeasure();
    },
    value: () => null,
  },
  onCameraChange: {
    on: (v, cb) => v.onCameraChange(cb),
    fire: (w, n) => {
      w.v.setCamera({ ...w.v.getCamera(), distance: 120 + n });
      w.v.renderNow();
    },
    value: (w) => w.v.getCamera(),
  },
  onSectionChange: {
    on: (v, cb) => v.onSectionChange(cb),
    fire: (w, n) => w.v.setSection({ normal: [0, 0, 1], offset: 2 + n }),
    value: (w) => w.v.section,
  },
  onSceneIssues: {
    on: (v, cb) => v.onSceneIssues(cb),
    fire: (w) => w.v.setScene(broken()),
    value: (w) => w.v.sceneIssues,
  },
  onContextLost: { on: (v, cb) => v.onContextLost(cb), fire: loseRestore, value: () => undefined },
  onContextRestore: { on: (v, cb) => v.onContextRestore(cb), fire: loseRestore, value: () => ({ meshes: [], textures: [] }) },
  onContextRestoreDone: { on: (v, cb) => v.onContextRestoreDone(cb), fire: loseRestore, value: () => undefined },
  onViewCubeExpandedChange: {
    on: (v, cb) => v.onViewCubeExpandedChange(cb),
    // 접혔으면 손가락으로 펴고, 폈으면 앱 선택 바꾸기로 접는다('option')
    fire: (w) => (w.v.viewCubeExpanded ? w.v.setViewCubeTouch(true) : tapCube(w.v, w.cube)),
    value: (w) => w.v.viewCubeExpanded,
  },
};
const make = (k: Kind): View => {
  const w = view();
  k.setup?.(w);
  return w;
};

describe.each(Object.entries(KINDS))('%s — 알림 동안 뗌·더함은 EventTarget 규칙', (_name, k) => {
  it('하나만 단 콜백: 알림마다 한 번, 부른 직후 뷰어 값과 같은 값(0.89.0 그대로)', () => {
    const w = make(k);
    const got: unknown[] = [];
    const want: unknown[] = [];
    k.on(w.v, (a) => got.push(a));
    for (const n of [1, 2]) {
      k.fire(w, n);
      want.push(k.value(w));
    }
    expect(got).toEqual(want);
  });

  it('같은 함수를 두 번 달면 처음 자리에서 한 번(0.89.0 그대로)', () => {
    const w = make(k);
    const heard: string[] = [];
    const a = (): number => heard.push('a');
    k.on(w.v, a);
    k.on(w.v, () => heard.push('b'));
    k.on(w.v, a);
    k.fire(w, 1);
    expect(heard).toEqual(['a', 'b']);
  });

  it('콜백 안에서 뒤 콜백을 떼면 이번 알림에도 부르지 않는다(0.89.0 사본을 도는 다섯은 불렀다)', () => {
    const w = make(k);
    const heard: string[] = [];
    let offB = (): void => {};
    k.on(w.v, () => {
      heard.push('a');
      offB();
    });
    offB = k.on(w.v, () => heard.push('b'));
    k.fire(w, 1);
    expect(heard).toEqual(['a']);
  });

  it('콜백 안에서 단 콜백은 이번 알림에 부르지 않고 다음 알림부터 끝 자리(0.89.0 바로 도는 넷은 이번에 불렀다)', () => {
    const w = make(k);
    const heard: string[] = [];
    let added = false;
    k.on(w.v, () => {
      heard.push('a');
      if (added) return;
      added = true;
      k.on(w.v, () => heard.push('c'));
    });
    k.on(w.v, () => heard.push('b'));
    k.fire(w, 1);
    expect(heard).toEqual(['a', 'b']);
    heard.length = 0;
    k.fire(w, 2);
    expect(heard).toEqual(['a', 'b', 'c']);
  });

  it('콜백 안에서 뗐다 다시 단 콜백은 이번 알림에 부르지 않고 다음 알림부터 끝 자리(0.89.0 사본 다섯은 처음 자리, 바로 도는 넷은 끝 자리에서 이번에도 불렀다)', () => {
    const w = make(k);
    const heard: string[] = [];
    const b = (): number => heard.push('b');
    let once = false;
    let offB = (): void => {};
    k.on(w.v, () => {
      heard.push('a');
      if (once) return;
      once = true;
      offB();
      offB = k.on(w.v, b);
    });
    offB = k.on(w.v, b);
    k.on(w.v, () => heard.push('c'));
    k.fire(w, 1);
    expect(heard).toEqual(['a', 'c']);
    heard.length = 0;
    k.fire(w, 2);
    expect(heard).toEqual(['a', 'c', 'b']);
  });

  it('자기를 뗐다 다시 다는 콜백도 알림마다 한 번(0.89.0 바로 도는 넷은 같은 알림 안에서 다시 불러 — 그만두지 않으면 끝없이 되풀이)', () => {
    const w = make(k);
    let n = 0;
    let off = (): void => {};
    const self = (): void => {
      n++;
      // 0.89.0에서 끝없이 돌지 않게 다섯 번째에서 그만둔다
      if (n >= 5) return;
      off();
      off = k.on(w.v, self);
    };
    off = k.on(w.v, self);
    k.fire(w, 1);
    expect(n).toBe(1);
    k.fire(w, 2);
    expect(n).toBe(2);
  });

  it('콜백 안에서 dispose하면 남은 콜백을 부르지 않는다(0.89.0 그대로)', () => {
    const w = make(k);
    const heard: string[] = [];
    k.on(w.v, () => {
      heard.push('a');
      w.v.dispose();
    });
    k.on(w.v, () => heard.push('b'));
    k.fire(w, 1);
    expect(heard).toEqual(['a']);
  });
});

describe('가상 커서 Enter로 찍은 측정 알림 안에서 dispose·측정 모드 끄기(0.89.0은 찍은 점을 읽다 TypeError — 코드 읽기)', () => {
  it.each(['dispose', 'measureOff'])('%s: 던지지 않고 그 찍기 알림 글은 없다', (how) => {
    const w = view();
    const { v } = w;
    const said: { reason: string }[] = [];
    v.setKeyboardSnap({ announce: (a) => said.push(a) });
    v.setMeasureMode(true);
    const got: unknown[] = [];
    v.onMeasure((m) => {
      got.push(m);
      if (!m) return;
      if (how === 'dispose') v.dispose();
      else v.setMeasureMode(false);
    });
    key(w, 'ArrowRight');
    key(w, 'Enter');
    expect(v.measurePointCount).toBe(1);
    expect(said.map((a) => a.reason)).toEqual(['start', 'commit']);
    expect(() => key(w, 'Enter')).not.toThrow();
    // 측정 결과 하나(측정 모드를 끄면 지우는 null도)
    expect(got.length).toBe(how === 'dispose' ? 1 : 2);
    expect(got[0]).not.toBeNull();
    expect(said.map((a) => a.reason)).toEqual(['start', 'commit']);
    expect(v.measurePointCount).toBe(0);
  });
});

describe('dispose가 앱 함수·덧그림·피할 상자도 놓는다(0.89.0은 들고 있었다)', () => {
  type Priv = { measureFmt: unknown; keySnap: unknown; keyCur: unknown; annos: unknown; labelAvoid: unknown; pickPrev: unknown };
  const priv = (v: Viewer3d): Priv => v as unknown as Priv;
  /** 키보드 스냅(announce)·가상 커서·덧그림·피할 상자·측정 글 꼴·미리 강조를 모두 건 뷰어 */
  function loaded(): { w: View; said: unknown[] } {
    const w = view();
    const { v } = w;
    const said: unknown[] = [];
    v.setKeyboardSnap({ announce: (a) => said.push(a) });
    key(w, 'ArrowRight');
    v.setAnnotations([{ kind: 'distance', a: [0, 0, 0], b: [10, 0, 0] }]);
    v.setMeasureLabelAvoid({ rects: [{ x: 1, y: 2, width: 30, height: 20 }] });
    v.setMeasureFormat(() => ['x']);
    const s = mid(v);
    v.setPickPreview(v.pick(s.x, s.y));
    v.renderNow();
    expect(v.keyboardSnap).not.toBeNull();
    expect(v.keyboardCursor).not.toBeNull();
    expect(v.annotations).toHaveLength(1);
    expect(v.annotationLabelRects).toHaveLength(1);
    expect(v.measureLabelAvoid).not.toBeNull();
    expect(priv(v).measureFmt).not.toBeNull();
    expect(v.pickPreview).not.toBeNull();
    expect(said.length).toBeGreaterThan(0);
    return { w, said };
  }
  /** 놓은 뒤: getter는 문서의 빈 값, 안쪽 자료도 비었다 */
  function released(v: Viewer3d): void {
    expect(v.keyboardSnap).toBeNull();
    expect(v.keyboardCursor).toBeNull();
    expect(v.annotations).toEqual([]);
    expect(v.annotationLabelRects).toEqual([]);
    expect(v.measureLabelAvoid).toBeNull();
    expect(v.pickPreview).toBeNull();
    const p = priv(v);
    expect([p.measureFmt, p.keySnap, p.keyCur, p.annos, p.labelAvoid, p.pickPrev]).toEqual([null, null, null, null, null, null]);
  }

  it('dispose가 놓고 getter는 빈 값 — 놓을 때 announce를 부르지 않는다', () => {
    const { w, said } = loaded();
    const n = said.length;
    w.v.dispose();
    released(w.v);
    expect(said).toHaveLength(n);
  });

  it('dispose 뒤 setKeyboardSnap·setMeasureLabelAvoid·setMeasureFormat은 아무것도 하지 않는다(0.89.0은 새 값을 쥐었다 — setAnnotations·setPickPreview는 그 전부터)', () => {
    const { w } = loaded();
    const { v } = w;
    const s = mid(v);
    const p = v.pick(s.x, s.y);
    v.dispose();
    v.setKeyboardSnap({ announce: () => {} });
    v.setMeasureLabelAvoid({ rects: [{ x: 1, y: 2, width: 30, height: 20 }], points: true });
    v.setMeasureFormat(() => ['y']);
    v.setAnnotations([{ kind: 'point', a: [1, 2, 3] }]);
    v.setPickPreview(p);
    released(v);
  });
});
