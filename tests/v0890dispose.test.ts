/**
 * 0.89.0 dispose 뒤 알림 등록·그림 저장(89차 — 0.88.0 남은 한계): 0.88.0의 dispose는 알림 목록 아홉을 비웠지만, 그 뒤 on* 등록은 콜백을 목록에 다시 넣어 들고 있었다
 * (부르지는 않는다 — 앱 클로저와 그 클로저가 쥔 자료가 없앤 뷰어 객체와 함께 남는다. 돌려준 해제 함수도 뷰어·콜백을 쥔다).
 * 알림을 부르는 도중 앞 콜백이 dispose하면 목록 사본을 도는 다섯(onSceneIssues·onContextLost·onContextRestore·onContextRestoreDone·onViewCubeExpandedChange)은
 * 뒤 콜백을 dispose 뒤에도 불렀다(onViewCubeExpandedChange 문서는 「dispose 뒤에는 부르지 않는다」). 목록을 바로 도는 넷(onPick·onMeasure·onCameraChange·onSectionChange)은
 * dispose가 목록을 비워 돌기가 멈췄다. toBlob()(선택 없이)은 dispose 뒤에도 캔버스 그대로를 그림으로 풀어 주었다(선택을 준 toBlob은 Error로 거절).
 * 0.89.0: dispose 뒤 on*는 아무것도 걸지 않고 아무것도 하지 않는 해제 함수를 돌려주며, 부르는 도중 dispose하면 남은 알림을 부르지 않고,
 * toBlob()은 선택을 준 toBlob과 같은 Error로 거절한다. 살아 있는 뷰어의 알림 차례·횟수·값은 0.88.0 그대로인지도 본다
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FakeElement, installDom } from './fakedom';
import { VIEW_DIRS, cameraBasis } from '../src/camera';
import { dot, normalize } from '../src/math';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { CUBE_BAND, cubeLayout, cubeTargets } from '../src/viewcube';
import { Viewer3d } from '../src/viewer';

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
type Blobby = { toBlob?: (cb: (b: unknown) => void) => void };
beforeAll(() => {
  dom = installDom();
  // 가짜 캔버스의 그림 파일(0.13.0 시험과 같은 꼴 — 빈 객체로 푼다)
  (FakeElement.prototype as unknown as Blobby).toBlob = (cb) => cb({});
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const v of views) v.dispose();
  views.length = 0;
});
afterAll(() => {
  delete (FakeElement.prototype as unknown as Blobby).toBlob;
  dom.restore();
});

const box = (): Scene3d => ({ name: 's', units: 'mm', meshes: [boxMesh('a', [0, 0, 0], [10, 10, 10], [0.6, 0.7, 0.8, 1])], lines: [] });
/** 깨진 색 그물 하나(입력 알림 'mesh:c:color:fixed') */
const broken = (): Scene3d => ({ ...box(), meshes: [...box().meshes, boxMesh('c', [20, 0, 0], [30, 10, 10], [NaN, NaN, NaN, NaN])] });
function view(): { v: Viewer3d; canvas: FakeElement; cube: FakeElement } {
  const host = dom.host();
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: true, viewCubeSize: 76 });
  views.push(v);
  v.setScene(box());
  v.renderNow();
  return { v, canvas: v.canvas as unknown as FakeElement, cube: host.querySelector('.v3d-cube')! };
}
const lose = (c: FakeElement): void => c.fire('webglcontextlost', {});
const restore = (c: FakeElement): void => c.fire('webglcontextrestored', {});
let pid = 100;
/** 손가락으로 큐브 위 면 자리를 한 번 누른다(접힌 큐브면 편다 — 0.44.0) */
function tapCube(v: Viewer3d, cube: FakeElement): void {
  const t = cubeTargets(cameraBasis(v.getCamera()), cubeLayout(76), CUBE_BAND).find((x) => dot(x.dir, normalize(VIEW_DIRS.top)) > 0.9999)!;
  const q = t.pieces[0]!;
  const ev = { clientX: (q[0]![0] + q[2]![0]) / 2, clientY: (q[0]![1] + q[2]![1]) / 2, pointerId: ++pid, pointerType: 'touch', button: 0, buttons: 1, isPrimary: true };
  cube.fire('pointerdown', ev);
  cube.fire('pointerup', { ...ev, buttons: 0 });
}

/** 알림 목록 아홉(등록 차례와 같은 차례) */
const LISTS = ['pickCbs', 'measureCbs', 'camCbs', 'sectionCbs', 'issueCbs', 'restoreCbs', 'lostCbs', 'restoreDoneCbs', 'cubeCbs'] as const;
const sizes = (v: Viewer3d): number[] => LISTS.map((k) => (v as unknown as Record<string, { size: number }>)[k]!.size);
function listenAll(v: Viewer3d, heard: string[]): (() => void)[] {
  return [
    v.onPick(() => heard.push('pick'), { front: true }),
    v.onMeasure(() => heard.push('measure')),
    v.onCameraChange(() => heard.push('camera')),
    v.onSectionChange(() => heard.push('section')),
    v.onSceneIssues(() => heard.push('issues')),
    v.onContextRestore(() => void heard.push('restore')),
    v.onContextLost(() => heard.push('lost')),
    v.onContextRestoreDone(() => heard.push('done')),
    v.onViewCubeExpandedChange(() => heard.push('cube')),
  ];
}

describe('dispose와 알림 목록', () => {
  it('dispose가 아홉 목록을 모두 비운다(0.88.0 그대로)', () => {
    const { v } = view();
    listenAll(v, []);
    expect(sizes(v)).toEqual(LISTS.map(() => 1));
    v.dispose();
    expect(sizes(v)).toEqual(LISTS.map(() => 0));
  });

  it('dispose 뒤 등록: 목록에 넣지 않고 해제 함수는 아무것도 하지 않는다(0.88.0은 아홉 모두 넣어 들었다) — 그 뒤 사건에도 부르지 않는다', () => {
    const { v, canvas, cube } = view();
    v.dispose();
    const heard: string[] = [];
    const offs = listenAll(v, heard);
    expect(sizes(v)).toEqual(LISTS.map(() => 0));
    // 같은 함수 하나 — 콜백·뷰어를 쥐지 않는다
    for (const off of offs) {
      expect(off).toBe(offs[0]);
      expect(off()).toBeUndefined();
    }
    lose(canvas);
    restore(canvas);
    v.setScene(broken());
    v.setSection({ normal: [0, 0, 1], offset: 5 });
    v.setCamera({ ...v.getCamera(), distance: 99 });
    v.renderNow();
    tapCube(v, cube);
    expect(heard).toEqual([]);
    expect(sizes(v)).toEqual(LISTS.map(() => 0));
  });
});

describe('알림을 부르는 도중 앞 콜백이 dispose하면 남은 알림을 부르지 않는다(0.88.0은 목록 사본을 도는 다섯이 불렀다)', () => {
  /** 앞 콜백은 dispose, 뒤 콜백은 듣기만 */
  const pair = (heard: string[], v: Viewer3d): [() => void, () => void] => [
    () => {
      heard.push('a');
      v.dispose();
    },
    () => heard.push('b'),
  ];

  it('onSceneIssues(setScene 안)', () => {
    const { v } = view();
    const heard: string[] = [];
    for (const cb of pair(heard, v)) v.onSceneIssues(cb);
    v.setScene(broken());
    expect(heard).toEqual(['a']);
  });

  it('onContextLost', () => {
    const { v, canvas } = view();
    const heard: string[] = [];
    for (const cb of pair(heard, v)) v.onContextLost(cb);
    lose(canvas);
    expect(heard).toEqual(['a']);
  });

  it('onContextRestore(뒤 끝 알림도 없다)', () => {
    const { v, canvas } = view();
    const heard: string[] = [];
    for (const cb of pair(heard, v)) v.onContextRestore(cb);
    v.onContextRestoreDone(() => heard.push('done'));
    lose(canvas);
    restore(canvas);
    expect(heard).toEqual(['a']);
  });

  it('onContextRestoreDone', () => {
    const { v, canvas } = view();
    const heard: string[] = [];
    for (const cb of pair(heard, v)) v.onContextRestoreDone(cb);
    lose(canvas);
    restore(canvas);
    expect(heard).toEqual(['a']);
  });

  it('onViewCubeExpandedChange(손가락 큐브 펴기)', () => {
    const { v, cube } = view();
    const heard: string[] = [];
    for (const cb of pair(heard, v)) v.onViewCubeExpandedChange(cb);
    tapCube(v, cube);
    expect(heard).toEqual(['a']);
  });

  it('목록을 바로 도는 onSectionChange·onCameraChange는 0.88.0도 멈췄다(그대로)', () => {
    const s = view();
    const heard: string[] = [];
    for (const cb of pair(heard, s.v)) s.v.onSectionChange(cb);
    s.v.setSection({ normal: [0, 0, 1], offset: 5 });
    expect(heard).toEqual(['a']);

    const c = view();
    heard.length = 0;
    for (const cb of pair(heard, c.v)) c.v.onCameraChange(cb);
    c.v.setCamera({ ...c.v.getCamera(), distance: 99 });
    c.v.renderNow();
    expect(heard).toEqual(['a']);
  });
});

describe('살아 있는 뷰어의 알림은 0.88.0 그대로', () => {
  it('둘씩 단 다섯 알림: 단 차례대로 한 번씩, 같은 값', () => {
    const { v, canvas, cube } = view();
    const heard: string[] = [];
    const vals: unknown[] = [];
    for (const n of [1, 2]) {
      v.onSceneIssues((l) => {
        heard.push(`issues${n}`);
        vals.push(l);
      });
      v.onContextLost(() => heard.push(`lost${n}`));
      v.onContextRestore((need) => {
        heard.push(`restore${n}`);
        vals.push(need);
      });
      v.onContextRestoreDone(() => heard.push(`done${n}`));
      v.onViewCubeExpandedChange((x) => heard.push(`cube${n}:${x}`));
    }
    v.setScene(broken());
    lose(canvas);
    restore(canvas);
    tapCube(v, cube);
    expect(heard).toEqual(['issues1', 'issues2', 'lost1', 'lost2', 'restore1', 'restore2', 'done1', 'done2', 'cube1:true', 'cube2:true']);
    expect(vals[0]).toBe(v.sceneIssues);
    expect(vals[1]).toBe(vals[0]);
    expect(vals[2]).toEqual({ meshes: [], textures: [] });
    expect(vals[3]).toBe(vals[2]);
  });
});

describe('dispose 뒤 toBlob()', () => {
  it('선택 없이도 선택을 준 toBlob과 같은 Error로 거절하고 캔버스를 만들지 않는다(0.88.0은 캔버스 그대로를 풀어 주었다) — 살아 있으면 그대로 그림', async () => {
    const live = view();
    await expect(live.v.toBlob()).resolves.toEqual({});

    const { v } = view();
    v.dispose();
    const made = vi.spyOn(dom.doc, 'createElement');
    await expect(v.toBlob({ scale: 1 })).rejects.toThrow('3D 보기 문맥이 없어 그림을 만들 수 없습니다');
    await expect(v.toBlob()).rejects.toThrow('3D 보기 문맥이 없어 그림을 만들 수 없습니다');
    await expect(v.toBlob('image/jpeg', 0.9)).rejects.toThrow('3D 보기 문맥이 없어 그림을 만들 수 없습니다');
    expect(made).not.toHaveBeenCalled();
  });
});
