/**
 * 0.67.0 선분 묶음 맞춤 상자(LineSet3d.fitBox — NC 70차 요청: 공구 경로 묶음 안 추정 안전 높이에서 출발한 이송은 묶음 안 일부 선분이라 fit: false로 뺄 수 없어,
 * 다른 묶음을 숨기면 맞춤이 추정 높이까지 넓어졌다):
 *  - fitBox를 준 선분 묶음은 맞춤 범위에 묶음 범위 대신 그 상자(묶음의 보이는 범위와 겹친 곳 — 구간 숨김·겉모습 행렬을 따른다)를 넣는다(두 규칙 모두 묶음 범위 합에서 —
 *    기본 규칙에서 아무것도 숨기지 않았으면 Scene3d.bounds 그대로). fit: false가 앞선다. 깨진 상자(유한하지 않음·뒤집힘)는 없는 것으로 본다
 *  - 보이는 범위(가까운·먼 면 등)·fitItems(id로 준 묶음)는 묶음 범위 그대로. 주지 않은 장면은 0.66.0과 같다
 *  - 묶음이 많은 장면(보이는 범위 덩어리 — 0.66.0)도 묶음마다 합친 값과 비트까지 같다
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { installDom } from './fakedom';
import { boxMesh } from '../src/synth';
import type { Box3, FitRange, LineSet3d, Scene3d } from '../src/types';
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

const box = (a: number[], b: number[]): Box3 => ({ min: a as Box3['min'], max: b as Box3['max'] });
/**
 * NC 꼴: 공작물 [0,0,0]–[100,50,20], 공구 T1 이송(맞춤에 넣음 — z 25까지), 급속 묶음(첫 선분이 추정 안전 높이 z 125에서 출발 — G28 뒤 진입, 맞춤 상자는 그 출발점을 뺀다),
 * 기계 원점 쪽 추정 이동(fit: false). Scene3d.bounds = 공작물 ∪ 이송 ∪ 급속(출발점 뺌)
 */
function scene(fitRange?: FitRange, withBox = true): Scene3d {
  const work = boxMesh('work', [0, 0, 0], [100, 50, 20], [0.6, 0.6, 0.7, 1], 'work');
  const cut: LineSet3d = { id: 'cut', positions: Float32Array.of(10, 10, 25, 90, 10, 15, 90, 10, 15, 90, 40, 15), group: 'T1' };
  const rapid: LineSet3d = { id: 'rapid', positions: Float32Array.of(10, 10, 125, 10, 10, 25, 90, 40, 15, 95, 45, 25, 95, 45, 25, 5, 5, 25), group: 'rapid', dashed: true };
  if (withBox) rapid.fitBox = box([5, 5, 15], [95, 45, 25]);
  const mach: LineSet3d = { id: 'mach', positions: Float32Array.of(10, 10, 125, 10, 10, 400), group: 'mach', fit: false };
  const s: Scene3d = { name: 'nc', units: 'mm', meshes: [work], lines: [cut, rapid, mach], bounds: box([0, 0, 0], [100, 50, 25]) };
  if (fitRange) s.fitRange = fitRange;
  return s;
}
function view(sc: Scene3d): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  v.setScene(sc);
  return v;
}
type Inner = { visibleBox(): Box3 };

describe('0.67.0 선분 묶음 맞춤 상자', () => {
  it('기본 규칙: 숨김이 없으면 Scene3d.bounds, 숨기면 fitBox 묶음은 그 상자만 — 주지 않으면 0.66.0처럼 추정 높이까지', () => {
    const v = view(scene());
    expect(v.fitBounds).toEqual(box([0, 0, 0], [100, 50, 25]));
    // 공구 하나를 숨겨도 맞춤이 추정 안전 높이(125)로 넓어지지 않는다
    v.setGroupVisible('T1', false);
    expect(v.fitBounds).toEqual(box([0, 0, 0], [100, 50, 25]));
    // 보이는 범위(가까운·먼 면)는 묶음 범위 그대로(추정 이동도)
    expect((v as unknown as Inner).visibleBox()).toEqual(box([0, 0, 0], [100, 50, 400]));
    // fitItems로 그 id를 주면 묶음 범위로 맞춘다
    const c0 = v.getCamera();
    v.fitItems(['rapid'], false);
    expect(v.getCamera()).not.toEqual(c0);
    const w = view(scene(undefined, false));
    w.setGroupVisible('T1', false);
    expect(w.fitBounds).toEqual(box([0, 0, 0], [100, 50, 125]));
  });

  it("'visible' 규칙·구간 숨김·겉모습 행렬·fit: false·깨진 상자", () => {
    const v = view(scene('visible'));
    expect(v.fitBounds).toEqual(box([0, 0, 0], [100, 50, 25]));
    // 공작물을 숨기면 이송 ∪ 급속 상자
    v.setGroupVisible('work', false);
    expect(v.fitBounds).toEqual(box([5, 5, 15], [95, 45, 25]));
    // 급속 구간 숨김: 보이는 범위(셋째 선분 — [5,5,25]–[95,45,25])와 상자가 겹친 곳
    v.setGroupVisible('T1', false);
    v.setHiddenRanges('rapid', [{ start: 0, count: 2 }]);
    expect(v.fitBounds).toEqual(box([5, 5, 25], [95, 45, 25]));
    v.setHiddenRanges('rapid', null);
    expect(v.fitBounds).toEqual(box([5, 5, 15], [95, 45, 25]));
    // 겉모습 행렬로 옮기면 상자도 옮긴다
    v.setItemMatrix('rapid', [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 100, 1]);
    expect(v.fitBounds).toEqual(box([5, 5, 115], [95, 45, 125]));
    v.setItemMatrix('rapid', null);
    // fit: false가 앞선다
    const s = scene('visible');
    s.lines[1]!.fit = false;
    const f = view(s);
    expect(f.fitBounds).toEqual(box([0, 0, 0], [100, 50, 25]));
    f.setGroupVisible('work', false);
    expect(f.fitBounds).toEqual(box([10, 10, 15], [90, 40, 25]));
    // 깨진 상자는 없는 것으로(묶음 범위)
    for (const bad of [box([NaN, 0, 0], [1, 1, 1]), box([5, 5, 30], [95, 45, 25]), box([0, 0, 0], [Infinity, 1, 1])]) {
      const t = scene('visible');
      t.lines[1]!.fitBox = bad;
      const b = view(t);
      b.setGroupVisible('work', false);
      expect(b.fitBounds).toEqual(box([5, 5, 15], [95, 45, 125]));
    }
    // 묶음 범위와 겹치지 않는 상자는 그 묶음을 넣지 않는다
    const o = scene('visible');
    o.lines[1]!.fitBox = box([500, 500, 500], [600, 600, 600]);
    const x = view(o);
    x.setGroupVisible('work', false);
    expect(x.fitBounds).toEqual(box([10, 10, 15], [90, 40, 25]));
  });

  it('묶음이 많은 장면(보이는 범위 덩어리)도 묶음마다 합친 값과 비트까지 같다', () => {
    const lines: LineSet3d[] = [];
    for (let i = 0; i < 300; i++) {
      const x = (i % 20) * 7.25, y = Math.floor(i / 20) * 3.5;
      // 맞춤 상자를 준 묶음(셋째마다)만 높이 뻗는다(상자는 z 10~13까지 — 맞춤 범위 높이가 상자를 따른다)
      const l: LineSet3d = { id: `l${i}`, positions: Float32Array.of(x, y, 0, x + 3, y + 1, i % 3 === 0 ? 50 + (i % 7) * 11 : 8), group: `g${i % 5}` };
      if (i % 3 === 0) l.fitBox = box([x, y, 0], [x + 3, y + 1, 10 + (i % 4)]);
      if (i % 37 === 0) l.fit = false;
      lines.push(l);
    }
    const sc: Scene3d = { name: 'many', units: 'mm', meshes: [], lines, fitRange: 'visible' };
    const v = view(sc);
    const hid = new Set<string>();
    const expected = (): Box3 => {
      let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const [i, l] of lines.entries()) {
        if (l.fit === false || hidden.has(i % 5) || hid.has(l.id)) continue;
        const p = l.positions;
        let lo = [Math.min(p[0]!, p[3]!), Math.min(p[1]!, p[4]!), Math.min(p[2]!, p[5]!)], hi = [Math.max(p[0]!, p[3]!), Math.max(p[1]!, p[4]!), Math.max(p[2]!, p[5]!)];
        if (l.fitBox) {
          lo = lo.map((a, k) => Math.max(a, l.fitBox!.min[k]!));
          hi = hi.map((a, k) => Math.min(a, l.fitBox!.max[k]!));
        }
        min = min.map((a, k) => Math.min(a, lo[k]!));
        max = max.map((a, k) => Math.max(a, hi[k]!));
      }
      return box(min, max);
    };
    const hidden = new Set<number>();
    expect(v.fitBounds).toEqual(expected());
    for (const g of [1, 3, 0]) {
      v.setGroupVisible(`g${g}`, false);
      hidden.add(g);
      expect(v.fitBounds, `g${g}`).toEqual(expected());
    }
    for (const id of ['l7', 'l9', 'l42']) {
      v.setItemVisible(id, false);
      hid.add(id);
      expect(v.fitBounds, id).toEqual(expected());
    }
  });
});
