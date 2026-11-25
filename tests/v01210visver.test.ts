/**
 * 0.121.0 숨김 판 읽기 `visibilityVersion`(SKP 128차 코어 요청 — 110차 남은 한계): 앱 자체 측정 추정(SKP 줄자·각도기)이 다시 보이기·다른 개체 숨김으로
 * 커서 밑이 새로 드러난 것을 알 길이 없어 커서를 옮길 때까지 앞 추정이었다(코어 숨김 판 visVer는 비공개, 공개 보이기 알림 없음).
 *  - 처음 0, 숨김·다시 보이기·묶음·구간 숨김·구간 모두 풀기마다 하나 오르고 지금 상태와 같은 값 호출(0.64.0)은 그대로
 *  - setScene은 늘 하나(숨김을 모두 푸는 새 장면), setMesh·removeMesh·clear·겉모습·단면·그리기 모드·강조는 그대로
 *  - 읽기만(setter 없음 — 읽어도 다시 그리기를 걸지 않음), dispose 뒤에도 읽히고 그 뒤 보이기 호출은 오르지 않음
 *  - 앱 꼴: 추정을 구할 때 수를 두고 다음에 다르면 다시 구함
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installDom } from './fakedom';
import { boxMesh } from '../src/synth';
import type { Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

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

/** 상자 넷(묶음 a·a·b·없음) */
function scene(): Scene3d {
  const meshes: Mesh3d[] = [
    boxMesh('b0', [0, 0, 0], [4, 4, 4], [0.6, 0.6, 0.7, 1], 'a'),
    boxMesh('b1', [6, 0, 0], [10, 4, 4], [0.6, 0.7, 0.6, 1], 'a'),
    boxMesh('b2', [0, 6, 0], [4, 10, 4], [0.7, 0.6, 0.6, 1], 'b'),
    boxMesh('b3', [6, 6, 0], [10, 10, 4], [0.5, 0.5, 0.5, 1]),
  ];
  return { name: 'vis', units: 'mm', meshes, lines: [] };
}

function view(): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false });
  views.push(v);
  return v;
}

/** 다시 그리기 요청(rAF 번호 — 0이면 걸린 것이 없다) */
const raf = (v: Viewer3d): number => (v as unknown as { raf: number }).raf;

describe('0.121.0 숨김 판 읽기 visibilityVersion', () => {
  it('처음 0, 숨김·다시 보이기·묶음·구간 숨김마다 하나 오르고 같은 값 호출은 그대로', () => {
    const v = view();
    expect(v.visibilityVersion).toBe(0);
    v.setScene(scene());
    expect(v.visibilityVersion).toBe(1);
    v.renderNow();
    let k = v.visibilityVersion;
    const moved = (label: string, fn: () => void, by = 1): void => {
      fn();
      expect(v.visibilityVersion, label).toBe(k + by);
      k = v.visibilityVersion;
    };
    const still = (label: string, fn: () => void): void => {
      fn();
      expect(v.visibilityVersion, label).toBe(k);
    };
    still('모두 보임으로', () => ['b0', 'b1', 'b2', 'b3'].forEach((id) => v.setItemVisible(id, true)));
    still('묶음 보임', () => ['a', 'b'].forEach((g) => v.setGroupVisible(g, true)));
    still('구간 숨김 없음 → 없음', () => (v.setHiddenRanges('b0', null), v.setHiddenRanges('b0', [])));
    still('구간 모두 풀기(없음)', () => v.clearHiddenRanges());
    moved('항목 숨김', () => v.setItemVisible('b1', false));
    expect(v.isVisible('b1')).toBe(false);
    still('항목 숨김 다시', () => v.setItemVisible('b1', false));
    moved('다시 보이기', () => v.setItemVisible('b1', true));
    expect(v.isVisible('b1')).toBe(true);
    // 모든 항목에 부르되 하나만 바뀌면 하나, 둘이 바뀌면 둘(바뀐 호출마다)
    moved('모두에 부름 — 하나 바뀜', () => ['b0', 'b1', 'b2', 'b3'].forEach((id) => v.setItemVisible(id, id !== 'b2')));
    moved('모두에 부름 — 둘 바뀜', () => ['b0', 'b1', 'b2', 'b3'].forEach((id) => v.setItemVisible(id, id !== 'b0')), 2);
    moved('묶음 숨김', () => v.setGroupVisible('a', false));
    expect(v.isVisible('b1')).toBe(false);
    still('묶음 숨김 다시', () => v.setGroupVisible('a', false));
    moved('묶음 다시 보이기', () => v.setGroupVisible('a', true));
    moved('구간 숨김', () => v.setHiddenRanges('b3', [{ start: 0, count: 2 }]));
    still('같은 구간(합치면 같음)', () => v.setHiddenRanges('b3', [{ start: 1, count: 1 }, { start: 0, count: 1 }]));
    moved('윤곽선 구간 더함', () => v.setHiddenRanges('b3', { prims: [{ start: 0, count: 2 }], edges: [{ start: 0, count: 1 }] }));
    moved('구간 숨김 바꿈', () => v.setHiddenRanges('b2', [{ start: 4, count: 4 }]));
    moved('구간 모두 풀기', () => v.clearHiddenRanges());
    expect(v.hiddenRanges('b3')).toEqual([]);
    still('구간 모두 풀기 다시', () => v.clearHiddenRanges());
    // 없는 id·장면에 없는 묶음 이름도 기록이 바뀌면 오른다(그 이름으로 넣는 메시가 숨는다 — 0.64.0 그대로)
    moved('없는 id 숨김', () => v.setItemVisible('nope', false));
    still('없는 id 숨김 다시', () => v.setItemVisible('nope', false));
    moved('없는 묶음 숨김', () => v.setGroupVisible('zz', false));
    still('없는 id 구간(돌아감)', () => v.setHiddenRanges('nope', [{ start: 0, count: 1 }]));
  });

  it('setScene은 늘 하나, setMesh·removeMesh·clear·겉모습·단면·그리기 모드·강조는 그대로', () => {
    const v = view();
    v.setScene(scene());
    v.setItemVisible('b0', false);
    v.setHiddenRanges('b2', [{ start: 0, count: 2 }]);
    v.renderNow();
    let k = v.visibilityVersion;
    const still = (label: string, fn: () => void): void => {
      fn();
      expect(v.visibilityVersion, label).toBe(k);
    };
    // 메시 내용 바꾸기 — 숨김 기록은 그대로(숨긴 id로 바꿔 넣은 메시는 숨은 채)
    still('setMesh 바꾸기', () => expect(v.setMesh(boxMesh('b0', [0, 0, 0], [5, 5, 5], [1, 0, 0, 1], 'a'))).toBe(true));
    expect(v.isVisible('b0')).toBe(false);
    still('setMesh 더하기', () => expect(v.setMesh(boxMesh('b4', [12, 0, 0], [14, 2, 2], [0, 1, 0, 1], 'b'))).toBe(true));
    still('setMesh 같은 꼴(구간 자름)', () => expect(v.setMesh(boxMesh('b2', [0, 6, 0], [4, 10, 4], [0.7, 0.6, 0.6, 1], 'b'))).toBe(true));
    expect(v.hiddenRanges('b2')).toEqual([{ start: 0, count: 2 }]);
    still('removeMesh', () => expect(v.removeMesh('b4')).toBe(true));
    still('겉모습', () => (v.setItemOpacity('b1', 0.3), v.setItemColor('b3', [0, 0, 1, 1]), v.setItemOpacity('b1', null)));
    still('강조', () => (v.highlight(['b1']), v.highlight(null)));
    still('그리기 모드', () => (v.setRenderMode('wireframe'), v.setRenderMode('shaded')));
    still('단면', () => (v.setSectionAxis('x', 0.5), v.setSection(null)));
    v.renderNow();
    still('그리기', () => v.renderNow());
    // 장면 바꾸기: 숨김을 모두 풀고 하나 오른다(같은 장면·keepView·숨김이 없던 장면도)
    v.setScene(scene(), { keepView: true });
    expect(v.visibilityVersion).toBe(k + 1);
    expect(v.isVisible('b0')).toBe(true);
    expect(v.hiddenRanges('b2')).toEqual([]);
    k = v.visibilityVersion;
    v.setScene(v.scene!);
    expect(v.visibilityVersion).toBe(k + 1);
    k = v.visibilityVersion;
    // clear는 그대로(장면이 비어 보일 것이 없다 — 다음 setScene이 올린다), 빈 장면에 setMesh는 받지 않는다
    still('clear', () => v.clear());
    still('clear 뒤 setMesh', () => expect(v.setMesh(boxMesh('b9', [0, 0, 0], [1, 1, 1], [1, 1, 1, 1]))).toBe(false));
    v.setScene(scene());
    expect(v.visibilityVersion).toBe(k + 1);
  });

  it('읽기만 — setter가 없고 읽어도 다시 그리기를 걸지 않는다', () => {
    const v = view();
    v.setScene(scene());
    v.setItemVisible('b2', false);
    v.renderNow();
    const r0 = raf(v);
    const k = v.visibilityVersion;
    expect(k).toBe(2);
    for (let i = 0; i < 5; i++) expect(v.visibilityVersion).toBe(k);
    expect(raf(v)).toBe(r0);
    // 클래스 getter뿐이다(엄격 모드 대입은 TypeError, 값 그대로)
    const d = Object.getOwnPropertyDescriptor(Viewer3d.prototype, 'visibilityVersion');
    expect(typeof d?.get).toBe('function');
    expect(d?.set).toBeUndefined();
    expect(() => {
      (v as unknown as { visibilityVersion: number }).visibilityVersion = 99;
    }).toThrow(TypeError);
    expect(v.visibilityVersion).toBe(k);
    expect(raf(v)).toBe(r0);
    // 숨김을 바꾸면 다시 그리기가 걸린다(0.64.0 그대로 — 판과 함께)
    v.setItemVisible('b2', true);
    expect(v.visibilityVersion).toBe(k + 1);
    expect(raf(v)).not.toBe(0);
  });

  it('dispose 뒤에도 마지막 값을 읽고, 그 뒤 보이기 호출·장면 호출은 오르지 않는다', () => {
    const v = view();
    v.setScene(scene());
    v.setGroupVisible('b', false);
    v.setHiddenRanges('b3', [{ start: 0, count: 2 }]);
    const k = v.visibilityVersion;
    expect(k).toBe(3);
    v.dispose();
    expect(v.visibilityVersion).toBe(k);
    v.setItemVisible('b0', false);
    v.setItemVisible('nope', false);
    v.setGroupVisible('a', false);
    v.setGroupVisible('b', true);
    v.setHiddenRanges('b1', [{ start: 0, count: 1 }]);
    v.clearHiddenRanges();
    v.setScene(scene());
    v.clear();
    expect(v.visibilityVersion).toBe(k);
    expect(raf(v)).toBe(0);
    expect(v.isVisible('b0')).toBe(false);
    expect(v.groups()).toEqual([]);
  });

  it('앱 꼴: 추정을 구할 때 수를 두고 다음 그림에서 다르면 다시 구한다', () => {
    const v = view();
    v.setScene(scene());
    v.renderNow();
    // 앱 측정 도구 흉내 — 추정을 구할 때 판을 두고, 그림마다 견준다
    let seen = v.visibilityVersion;
    let recomputed = 0;
    const sweep = (): void => {
      if (v.visibilityVersion === seen) return;
      seen = v.visibilityVersion;
      recomputed++;
    };
    sweep();
    expect(recomputed).toBe(0);
    // 다른 개체 숨김 → 다시 구함, 같은 값으로 다시 숨김 → 그대로
    v.setItemVisible('b1', false);
    sweep();
    expect(recomputed).toBe(1);
    v.setItemVisible('b1', false);
    sweep();
    expect(recomputed).toBe(1);
    // 다시 보이기(커서 밑이 새로 드러남) → 다시 구함
    v.setItemVisible('b1', true);
    sweep();
    expect(recomputed).toBe(2);
    // 한 그림 사이에 여러 번 바뀌어도 견주기 한 번에 한 번
    v.setGroupVisible('a', false);
    v.setHiddenRanges('b2', [{ start: 0, count: 6 }]);
    v.setGroupVisible('a', true);
    sweep();
    expect(recomputed).toBe(3);
    // 겉모습·단면은 이 수로 보지 않는다(앱이 따로 — SKP 112·127차 길)
    v.setItemOpacity('b0', 0.2);
    v.setSectionAxis('z', 0.5);
    sweep();
    expect(recomputed).toBe(3);
  });
});
