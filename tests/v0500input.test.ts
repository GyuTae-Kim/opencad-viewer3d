/**
 * 0.50.0 장면 입력 견고성: 앱이 깨진 파일에서 만든 값(NaN·무한대·1e38 좌표, 정점 수 밖·0xffffffff 색인, 길이가 맞지 않는 배열, 유한하지 않은 색·원점·행렬·굵기·크기·범위)
 * - 순수 checkScene·triangleFix·segmentFix·boundsBroken·sceneIssueText: 멀쩡한 장면은 같은 객체·알림 없음, 깨진 값마다 알림 종류·조치
 * - 가짜 WebGL 뷰어: 예외 없음, 카메라·범위 유한, 색인·정점 버퍼 밖 그리기 없음(0xffffffff 포함), 균일 변수 유한, 고르기 결과가 한도 안,
 *   놓을 자리 모르는 항목은 빼고 알림(sceneIssues·onSceneIssues), setMesh·removeMesh 알림, 같은 id 둘의 구간 단면
 * - 빠른 퍼징 700경우(씨앗 고정 — tests/fuzzscene.ts): 깨진 종류 하나씩 400경우 + 섞은 300경우를 공개 함수 차례로 두드려 문제 0
 * - BVH 일 줄: 일이 많아도 앞 자리 번호로 꺼내고(0.49.0 shift — O(n²)), 차례가 0.49.0과 같다(중간에 setMesh로 일을 더해도)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { guardGl } from './glguard';
import { LINE_FAULTS, MESH_FAULTS, POINT_FAULTS, SCENE_FAULTS, cleanScene, fuzzScene, hugeMesh } from './fuzzscene';
import { COORD_LIMIT, positionsBad, positionsBox, sceneBounds } from '../src/bounds';
import { buildBvh } from '../src/bvh';
import { GRID_MAX_LINES, gridLines, gridSpec } from '../src/grid';
import * as entry from '../src/index';
import { SCENE_ISSUE_MESSAGES, type SceneIssue, boundsBroken, checkScene, sceneIssueText, segmentFix, triangleFix } from '../src/sceneissues';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

const codes = (l: readonly SceneIssue[]): string[] => l.map((i) => `${i.kind}:${i.id ?? ''}:${i.code}:${i.action}${i.field ? `:${i.field}` : ''}:${i.count}`);

describe('순수: 장면 검사', () => {
  it('멀쩡한 장면은 같은 객체·알림 없음, 입구에서 내보낸다', () => {
    for (let s = 1; s <= 40; s++) {
      const sc = cleanScene(s);
      const c = checkScene(sc);
      expect(c.scene).toBe(sc);
      expect(c.issues).toEqual([]);
    }
    expect(entry.checkScene).toBe(checkScene);
    expect(entry.sceneIssueText).toBe(sceneIssueText);
    expect(entry.COORD_LIMIT).toBe(1e15);
    expect(entry.SCENE_ISSUE_MESSAGES).toBe(SCENE_ISSUE_MESSAGES);
  });

  it('깨진 값마다 알림 종류·조치, 빼는 항목만 빠지고 고친 항목은 얕은 사본(배열은 같은 객체)', () => {
    const b = boxMesh('b', [0, 0, 0], [10, 10, 10], [0.5, 0.5, 0.5, 1]);
    const nv = b.positions.length / 3;
    const idx = b.indices!.slice();
    idx[4] = 0xffffffff;
    idx[9] = nv + 3;
    const pos = b.positions.slice();
    pos[0] = NaN;
    pos[5] = 1e38;
    const line: LineSet3d = { id: 'l', positions: new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2, 3e20, 0, 0, 5]), width: NaN, color: [NaN, 0, 0, 1], segmentIds: new Uint32Array(1) };
    const sc: Scene3d = {
      name: 't',
      units: 'mm',
      meshes: [
        { ...b, id: 'idx', indices: idx },
        { ...b, id: 'pos', positions: pos },
        { ...b, id: 'org', origin: [NaN, 0, 0] },
        { ...b, id: 'mat', matrix: Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]) },
        { ...b, id: 'big', matrix: Float64Array.from([1e30, 0, 0, 0, 0, 1e30, 0, 0, 0, 0, 1e30, 0, 0, 0, 0, 1]) },
        { ...b, id: 'col', color: [0.5, 0.5, 0.5] as unknown as Mesh3d['color'], backColor: [NaN, 0, 0, 1], roughness: NaN, normals: new Float32Array(5) },
        { ...b, id: 'vc', colors: new Float32Array(nv * 4).fill(NaN) },
      ],
      lines: [line],
      points: [{ id: 'p', positions: new Float32Array([0, 0, 0, Infinity, 0, 0]), size: Infinity }],
      bounds: { min: [-Infinity, 0, 0], max: [Infinity, 1, 1] },
    };
    const c = checkScene(sc);
    expect(codes(c.issues)).toEqual([
      'mesh:idx:indices:fixed:indices:2',
      'mesh:pos:positions:fixed:positions:2',
      'mesh:org:placement:skipped:origin:1',
      'mesh:mat:placement:skipped:matrix:1',
      'mesh:big:placement:skipped:matrix:1',
      'mesh:col:normals:ignored:normals:1',
      'mesh:col:color:fixed:color:1',
      'mesh:col:color:ignored:backColor:1',
      'mesh:col:material:ignored:roughness:1',
      'mesh:vc:colors:ignored:colors:' + nv * 4,
      'line:l:length:ignored:positions:1',
      'line:l:positions:fixed:positions:1',
      'line:l:color:fixed:color:1',
      'line:l:width:fixed:width:1',
      'line:l:ids:kept:segmentIds:1',
      'point:p:positions:fixed:positions:1',
      'point:p:size:fixed:size:1',
      'scene::bounds:ignored:bounds:1',
    ]);
    expect(c.scene).not.toBe(sc);
    expect(c.scene.meshes.map((m) => m.id)).toEqual(['idx', 'pos', 'col', 'vc']);
    // 고칠 필드가 없는 항목은 같은 객체, 고친 항목은 배열을 함께 쓰는 사본
    expect(c.scene.meshes[0]).toBe(sc.meshes[0]);
    const col = c.scene.meshes[2]!;
    expect(col).not.toBe(sc.meshes[5]);
    expect(col.positions).toBe(b.positions);
    expect(col.color).toEqual([0.5, 0.5, 0.5, 1]);
    expect(col.backColor).toBeUndefined();
    expect(col.roughness).toBeUndefined();
    expect(c.scene.meshes[3]!.colors).toBeUndefined();
    expect(c.scene.lines[0]!.width).toBe(1);
    expect(c.scene.lines[0]!.color).toBeUndefined();
    expect(c.scene.points![0]!.size).toBe(4);
    // 알림 글
    expect(sceneIssueText(c.issues[0]!)).toBe('idx: 정점 수 밖 색인이 든 삼각형 2개를 그리지 않았습니다');
    expect(sceneIssueText(c.issues[2]!, { placement: '{id} skipped ({field})' })).toBe('org skipped (origin)');
  });

  it('범위: 한도 밖·NaN·무한대 정점은 건너뛰고 센다, 깨진 Scene3d.bounds만 알린다(빈 상자·뒤집힌 상자는 0.49.0처럼 조용히 다시 셈)', () => {
    const p = new Float32Array([1, 2, 3, NaN, 0, 0, 1e38, 0, 0, -4, 5, 6, 2e15, 0, 0]);
    expect(positionsBox(p)).toEqual({ min: [-4, 2, 3], max: [1, 5, 6] });
    expect(positionsBad(p)).toBe(3);
    expect(COORD_LIMIT).toBe(1e15);
    // 한도 바로 안은 넣는다
    expect(positionsBox(new Float32Array([1e15, 0, 0])).max[0]).toBe(new Float32Array([1e15])[0]);
    expect(boundsBroken(undefined)).toBe(false);
    expect(boundsBroken({ min: [0, 0, 0], max: [1, 1, 1] })).toBe(false);
    expect(boundsBroken({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] })).toBe(false);
    expect(boundsBroken({ min: [5, 5, 5], max: [1, 1, 1] })).toBe(false);
    expect(boundsBroken({ min: [NaN, 0, 0], max: [1, 1, 1] })).toBe(true);
    expect(boundsBroken({ min: [-Infinity, 0, 0], max: [Infinity, 1, 1] })).toBe(true);
    expect(boundsBroken({ min: [-1e38, 0, 0], max: [1, 1, 1] })).toBe(true);
    const sc: Scene3d = { name: 'b', units: 'mm', meshes: [{ id: 'm', positions: p, color: [1, 1, 1, 1] }], lines: [] };
    expect(sceneBounds(sc)).toEqual({ min: [-4, 2, 3], max: [1, 5, 6] });
  });

  it('삼각형 고침: 정점 수 밖(0xffffffff 포함)·깨진 정점 삼각형만 넓이 0, 번호·길이 그대로, 멀쩡하면 null·캐시', () => {
    const b = boxMesh('b', [0, 0, 0], [1, 1, 1], [1, 1, 1, 1]);
    expect(triangleFix(b.positions, b.indices)).toBeNull();
    const I = b.indices!.slice();
    I[3] = 0xffffffff;
    const f = triangleFix(b.positions, I)!;
    expect(f.bad).toBe(1);
    expect(f.indices.length).toBe(I.length);
    expect([...f.indices.subarray(3, 6)]).toEqual([0, 0, 0]);
    expect([...f.indices.subarray(0, 3)]).toEqual([...I.subarray(0, 3)]);
    expect([...f.indices.subarray(6)]).toEqual([...I.subarray(6)]);
    expect(triangleFix(b.positions, I)).toBe(f);
    // 색인 없는 그물: 깨진 정점 삼각형만, 첫 멀쩡한 정점으로
    const P = new Float32Array([NaN, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0]);
    const g = triangleFix(P)!;
    expect([...g.indices]).toEqual([1, 1, 1, 3, 4, 5]);
    // 선분: 깨진 끝점 선분만 NaN, 멀쩡하면 null
    const L = new Float32Array([0, 0, 0, 1, 1, 1, 0, 0, 0, 1e30, 0, 0]);
    const s = segmentFix(L);
    expect(s.bad).toBe(1);
    expect([...s.fix!.subarray(0, 6)]).toEqual([0, 0, 0, 1, 1, 1]);
    expect(s.fix!.subarray(6).every((x) => Number.isNaN(x))).toBe(true);
    expect(segmentFix(new Float32Array([0, 0, 0, 1, 1, 1])).fix).toBeNull();
  });

  it('BVH는 깨진 기본 도형을 빼고 만든다(멀쩡하면 0.49.0과 같은 나무)', () => {
    const b = boxMesh('b', [0, 0, 0], [1, 1, 1], [1, 1, 1, 1]);
    const t = buildBvh('triangle', b.positions, b.indices);
    expect([t.count, t.prims]).toEqual([12, 12]);
    const I = b.indices!.slice();
    I[0] = 0xffffffff;
    const u = buildBvh('triangle', b.positions, I);
    expect([u.count, u.prims]).toEqual([11, 12]);
    expect([...u.order]).not.toContain(0);
  });

  it('격자: 칸 수가 유한하지 않거나 한도 넘으면 빈 격자(0.49.0은 배열 길이 예외)', () => {
    const g = gridSpec({ min: [-Infinity, 0, 0], max: [Infinity, 1, 1] });
    const l = gridLines(g);
    expect([l.major.length, l.minor.length, l.axisX.length, l.axisY.length]).toEqual([0, 0, 0, 0]);
    expect(GRID_MAX_LINES).toBe(4096);
    const ok = gridLines(gridSpec({ min: [0, 0, 0], max: [100, 50, 10] }));
    expect(ok.major.length).toBeGreaterThan(0);
  });
});

// ───────────── 뷰어(가짜 WebGL) ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  vi.restoreAllMocks();
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

interface W {
  v: Viewer3d;
  canvas: FakeElement;
  bad: string[];
}
function view(): W {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 400, height: 300 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: true });
  views.push(v);
  const canvas = v.canvas as unknown as FakeElement;
  const bad: string[] = [];
  guardGl(canvas.gl!, (w) => bad.push(w));
  return { v, canvas, bad };
}
const camOk = (v: Viewer3d): boolean => {
  const c = v.getCamera();
  return [...c.target, c.distance, c.yaw, c.pitch].every(Number.isFinite) && c.distance > 0 && c.distance < 1e12;
};
const NO_MODS = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
const sane = (p: readonly number[] | undefined): boolean => !p || p.every((x) => Number.isFinite(x) && Math.abs(x) <= COORD_LIMIT);

describe('뷰어: 깨진 장면', () => {
  it('무한 Scene3d.bounds: 예외 없이 열고 그물에서 다시 센 범위·유한한 카메라(0.49.0 RangeError)', () => {
    const w = view();
    const sc: Scene3d = { ...cleanScene(3), bounds: { min: [-Infinity, 0, 0], max: [Infinity, 1, 1] } };
    expect(() => w.v.setScene(sc)).not.toThrow();
    w.v.renderNow();
    expect(camOk(w.v)).toBe(true);
    expect(codes(w.v.sceneIssues)).toEqual(['scene::bounds:ignored:bounds:1']);
    const c0 = w.v.getCamera();
    w.v.setScene(cleanScene(3));
    expect(w.v.getCamera()).toEqual(c0);
    expect(w.bad).toEqual([]);
  });

  it('1e38 정점 하나·한도 밖 원점·1e30배 행렬: 카메라는 나머지에 맞고(0.49.0 화면 전체가 빔) 그 정점·항목은 그리지 않는다', () => {
    const w = view();
    const clean = cleanScene(5);
    w.v.setScene(clean);
    const c0 = w.v.getCamera();
    const m0 = clean.meshes[0]!;
    const P = m0.positions.slice();
    P[1] = 1e38;
    const side = boxMesh('곁', [0, 0, 0], [5, 5, 5], [1, 0, 0, 1]);
    w.v.setScene({ ...clean, meshes: [{ ...m0, positions: P }, ...clean.meshes.slice(1), { ...side, origin: [1e38, 0, 0] }, { ...side, id: '곁2', matrix: Float64Array.from([1e30, 0, 0, 0, 0, 1e30, 0, 0, 0, 0, 1e30, 0, 0, 0, 0, 1]) }] });
    w.v.renderNow();
    expect(camOk(w.v)).toBe(true);
    const c1 = w.v.getCamera();
    // 그 정점 하나를 뺀 범위라 카메라는 거의 같다(꼭짓점 하나가 빠진 만큼만)
    expect(Math.abs(c1.distance - c0.distance) / c0.distance).toBeLessThan(0.5);
    expect(w.v.scene!.meshes.map((m) => m.id)).toEqual(clean.meshes.map((m) => m.id));
    expect(w.v.sceneIssues.map((i) => `${i.id}:${i.code}:${i.action}`)).toEqual([`${m0.id}:positions:fixed`, '곁:placement:skipped', '곁2:placement:skipped']);
    expect(w.bad).toEqual([]);
  });

  it('0xffffffff·정점 수 밖 색인: 올린 색인 버퍼에 정점 수 밖 값이 없고(WebGL2 도형 다시 시작) 삼각형 수·번호는 그대로', () => {
    const w = view();
    const b = boxMesh('b', [0, 0, 0], [10, 10, 10], [0.6, 0.6, 0.6, 1]);
    const I = b.indices!.slice();
    I[6] = 0xffffffff;
    I[20] = 99;
    w.v.setScene({ name: 'i', units: 'mm', meshes: [{ ...b, indices: I }], lines: [] });
    for (const m of ['shadedEdges', 'wireframe', 'hiddenLine', 'xray'] as const) {
      w.v.setRenderMode(m);
      w.v.renderNow();
    }
    // 구간 숨김·강조(구간 모으기 사본)도
    w.v.setHiddenRanges('b', [{ start: 1, count: 1 }, { start: 3, count: 1 }, { start: 5, count: 1 }, { start: 7, count: 1 }, { start: 9, count: 1 }]);
    w.v.renderNow();
    expect(w.bad).toEqual([]);
    expect(codes(w.v.sceneIssues)).toEqual(['mesh:b:indices:fixed:indices:2']);
    // 고르기는 나머지 삼각형으로 — 결과 삼각형 번호는 원래 번호
    w.v.clearHiddenRanges();
    vi.advanceTimersByTime(1000);
    const h = w.v.pick(200, 150);
    if (h) expect(h.index).not.toBe(2);
  });

  it('유한하지 않은 원점·행렬 항목은 빼고(그리기·고르기·범위), 색·굵기·크기는 기본으로 그린다 — 균일 변수 모두 유한', () => {
    const w = view();
    const b = boxMesh('b', [0, 0, 0], [10, 10, 10], [0.6, 0.6, 0.6, 1]);
    const sc: Scene3d = {
      name: 'o',
      units: 'mm',
      meshes: [b, { ...boxMesh('o', [-5, -5, -5], [5, 5, 5], [1, 0, 0, 1]), origin: [NaN, 0, 0] }, { ...boxMesh('c', [20, 0, 0], [30, 10, 10], [NaN, NaN, NaN, NaN]), backColor: [Infinity, 0, 0, 1] }],
      lines: [{ id: 'l', positions: new Float32Array([0, 0, 0, 10, 10, 10]), width: NaN, color: [NaN, 0, 0, 1] }],
      points: [{ id: 'p', positions: new Float32Array([1, 1, 1]), size: NaN, color: [1, 1, 1, NaN] }],
    };
    const heard: (readonly SceneIssue[])[] = [];
    const off = w.v.onSceneIssues((l) => heard.push(l));
    w.v.setScene(sc);
    for (const m of ['shadedEdges', 'wireframe', 'monochrome'] as const) {
      w.v.setRenderMode(m);
      w.v.renderNow();
    }
    expect(w.bad).toEqual([]);
    expect(heard.length).toBe(1);
    expect(heard[0]).toBe(w.v.sceneIssues);
    expect(w.v.scene!.meshes.map((m) => m.id)).toEqual(['b', 'c']);
    expect(w.v.scene!.meshes[1]!.color).toEqual([0.7, 0.7, 0.7, 1]);
    expect(codes(w.v.sceneIssues)).toEqual([
      'mesh:o:placement:skipped:origin:1',
      'mesh:c:color:fixed:color:1',
      'mesh:c:color:ignored:backColor:1',
      'line:l:color:fixed:color:1',
      'line:l:width:fixed:width:1',
      'point:p:color:fixed:color:1',
      'point:p:size:fixed:size:1',
    ]);
    // 멀쩡한 장면이면 부르지 않고 알림은 빈 배열, 장면은 받은 객체 그대로
    const clean = cleanScene(7);
    w.v.setScene(clean);
    expect(heard.length).toBe(1);
    expect(w.v.sceneIssues).toEqual([]);
    expect(w.v.scene).toBe(clean);
    off();
    w.v.setScene(sc);
    expect(heard.length).toBe(1);
  });

  it('setMesh·removeMesh: 그 그물의 알림만 바꾸고, 놓을 자리 모르는 그물은 넣지 않고 false', () => {
    const w = view();
    const b = boxMesh('b', [0, 0, 0], [10, 10, 10], [0.6, 0.6, 0.6, 1]);
    const heard: string[][] = [];
    w.v.onSceneIssues((l) => heard.push(codes(l)));
    w.v.setScene({ name: 's', units: 'mm', meshes: [b], lines: [], bounds: { min: [NaN, 0, 0], max: [1, 1, 1] } });
    expect(codes(w.v.sceneIssues)).toEqual(['scene::bounds:ignored:bounds:1']);
    const P = b.positions.slice();
    P[3] = Infinity;
    expect(w.v.setMesh({ ...boxMesh('n', [20, 0, 0], [30, 10, 10], [1, 1, 1, 1]), positions: P })).toBe(true);
    expect(codes(w.v.sceneIssues)).toEqual(['scene::bounds:ignored:bounds:1', 'mesh:n:positions:fixed:positions:1']);
    expect(w.v.setMesh({ ...b, matrix: new Float64Array(16).fill(NaN) })).toBe(false);
    expect(w.v.scene!.meshes[0]).toBe(b);
    expect(w.v.removeMesh('n')).toBe(true);
    expect(codes(w.v.sceneIssues)).toEqual(['scene::bounds:ignored:bounds:1']);
    expect(heard).toEqual([['scene::bounds:ignored:bounds:1'], ['mesh:n:positions:fixed:positions:1'], ['mesh:b:placement:skipped:matrix:1']]);
    w.v.renderNow();
    expect(w.bad).toEqual([]);
    w.v.clear();
    expect(w.v.sceneIssues).toEqual([]);
  });

  it('같은 id가 둘(그물·선분)인 장면의 구간 단면: 그 항목의 기본 도형 수로 잘라 그린다(0.49.0 색인 버퍼 밖 — GL 오류)', () => {
    const w = view();
    const b = boxMesh('x', [0, 0, 0], [10, 10, 10], [0.6, 0.6, 0.6, 1]);
    const l: LineSet3d = { id: 'x', positions: new Float32Array(Array.from({ length: 600 }, (_, i) => (i % 7) * 3)) };
    w.v.setScene({ name: 'd', units: 'mm', meshes: [b], lines: [l] });
    expect(codes(w.v.sceneIssues)).toEqual(['scene:x:duplicate-id:kept:1']);
    w.v.setSections([{ normal: [1, 0, 0], offset: 5, items: [{ id: 'x', start: 3, count: 80 }] }]);
    w.v.renderNow();
    w.v.setHiddenRanges('x', [{ start: 50, count: 30 }]);
    w.v.renderNow();
    expect(w.bad).toEqual([]);
  });

  it('고르기·붙잡기는 그리지 않는 선분·점(1e38)을 맞히지 않는다, 앱 붙잡기 점도 한도 밖은 건너뛴다', () => {
    const w = view();
    const l: LineSet3d = { id: 'l', positions: new Float32Array([-10, 0, 0, 10, 0, 0, 0, 0, 0, 1e38, 1e38, 0]) };
    w.v.setScene({ name: 'p', units: 'mm', meshes: [], lines: [l], points: [{ id: 'p', positions: new Float32Array([0, 5, 0, 3e38, 0, 0]) }] });
    w.v.setView('top', false);
    vi.advanceTimersByTime(1000);
    w.v.renderNow();
    for (let x = 0; x <= 400; x += 20)
      for (let y = 0; y <= 300; y += 20) {
        const h = w.v.pick(x, y);
        expect(sane(h?.point)).toBe(true);
        for (const c of w.v.pickCandidates(x, y)) expect(sane(c.point)).toBe(true);
      }
    w.v.setMeasureMode(true);
    w.v.setMeasureSnap({ points: [{ point: [2e15, 0, 0] }, { point: [0, 0, 0], kind: 'center' }] });
    w.canvas.fire('pointermove', { clientX: 200, clientY: 150, pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, ...NO_MODS });
    w.v.renderNow();
    expect(sane(w.v.measureHoverSnap?.point)).toBe(true);
    expect(w.bad).toEqual([]);
  });

  it('API 인자: setMarker(NaN 자리)는 끈 것과 같고, setItemColor(NaN 색)는 되돌림과 같다', () => {
    const w = view();
    w.v.setScene(cleanScene(9));
    w.v.setMarker([NaN, 0, 0]);
    w.v.setItemColor('m0', [NaN, 1, 1, 1]);
    w.v.renderNow();
    expect(w.v.itemLook('m0')?.color).toBeUndefined();
    expect(w.bad).toEqual([]);
  });

  it('아주 큰 그물(정점 30만, 깨진 좌표·색인 여덟씩): 열고 그리고 고른다', () => {
    const w = view();
    const s = cleanScene(11);
    w.v.setScene({ ...s, meshes: [...s.meshes, hugeMesh(4, 300_000)] });
    w.v.renderNow();
    vi.advanceTimersByTime(2000);
    w.v.pick(200, 150);
    expect(camOk(w.v)).toBe(true);
    expect(w.bad).toEqual([]);
    expect(w.v.sceneIssues.map((i) => `${i.id}:${i.code}`)).toEqual(['huge:positions', 'huge:indices']);
  });
});

// ───────────── 빠른 퍼징 ─────────────
const ALL = [...MESH_FAULTS, ...LINE_FAULTS, ...POINT_FAULTS, ...SCENE_FAULTS];
describe('빠른 퍼징(씨앗 고정)', () => {
  it('깨진 종류 하나씩 400경우 + 섞은 300경우: 예외·버퍼 밖 그리기·유한하지 않은 균일 변수·카메라·고른 점 문제 0', () => {
    const problems = new Map<string, number[]>();
    const grid: [number, number][] = [];
    for (const x of [60, 200, 340]) for (const y of [50, 150, 250]) grid.push([x, y]);
    const cases: number[] = [];
    for (let s = 1; s <= 400; s++) cases.push(s);
    for (let s = 20001; s <= 20300; s++) cases.push(s);
    for (const seed of cases) {
      const c = seed <= 400 ? fuzzScene(seed, [ALL[seed % ALL.length]!]) : fuzzScene(seed);
      const host = dom.host();
      host.rect = { left: 0, top: 0, width: 400, height: 300 };
      const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: true });
      const canvas = v.canvas as unknown as FakeElement;
      let op = '';
      const note = (what: string): void => {
        const k = `${op} ${what}`;
        const l = problems.get(k) ?? [];
        if (l.length < 5) l.push(seed);
        problems.set(k, l);
      };
      guardGl(canvas.gl!, note);
      const ptr = (type: string, x: number, y: number, buttons: number): void =>
        canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, ...NO_MODS });
      const step = (name: string, f: () => void): void => {
        op = name;
        try {
          f();
        } catch (e) {
          note(`예외 ${String((e as Error)?.message ?? e).slice(0, 60)}`);
        }
        if (!camOk(v)) note('카메라');
      };
      step('setScene', () => v.setScene(c.scene));
      step('render', () => v.renderNow());
      step('bvh', () => vi.advanceTimersByTime(1000));
      step('pick', () => {
        for (const [x, y] of grid) {
          const h = v.pick(x, y);
          if (!sane(h?.point) || !sane(h?.normal)) note('고른 점');
        }
        for (const h of v.pickCandidates(200, 150)) if (!sane(h.point)) note('후보 점');
      });
      step('measure', () => {
        v.setMeasureMode(true);
        v.setMeasureSnap({ midpoints: true, inference: { intersections: true, perpendicular: true, axes: true } });
        for (const [x, y] of [grid[4]!, grid[0]!]) {
          ptr('pointermove', x, y, 0);
          ptr('pointerdown', x, y, 1);
          ptr('pointerup', x, y, 0);
          v.renderNow();
        }
        const m = v.measurement();
        if (m && (!sane(m.a) || !sane(m.b))) note('측정');
        v.setMeasureMode(false);
      });
      step('section', () => {
        v.setSectionAxis('x', 0.5, { caps: 'closed' });
        v.renderNow();
        v.setSection(null);
      });
      step('modes', () => {
        for (const m of ['wireframe', 'hiddenLine', 'shadedEdges'] as const) {
          v.setRenderMode(m);
          v.renderNow();
        }
      });
      step('incremental', () => {
        v.setScene(c.scene, { incremental: { budgetMs: 1 } });
        for (let i = 0; i < 6; i++) v.renderNow();
      });
      v.dispose();
    }
    expect([...problems].map(([k, s]) => `${k}: ${s.join(',')}`)).toEqual([]);
  });
});

// ───────────── BVH 일 줄 ─────────────
describe('BVH 일 줄(STEP 58차 — 부품 자리 8만)', () => {
  it('일이 많아도 앞 자리 번호로 꺼내고, 차례는 0.49.0(앞에서 shift)과 같다 — 중간에 setMesh로 일을 더해도', () => {
    const w = view();
    const meshes: Mesh3d[] = [];
    // 크기가 겹치는(같은 n) 그물 3,000개: 정렬은 안정이라 같은 크기는 장면 차례
    for (let i = 0; i < 3000; i++) {
      const k = 1 + ((i * 7919) % 13);
      meshes.push({ id: `g${i}`, positions: new Float32Array(9 * k).fill(i % 5), color: [1, 1, 1, 1] });
    }
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const ran: number[] = [];
    const byPos = new Map<Float32Array, number>();
    const mv = w.v as unknown as { bvhFor: (...a: unknown[]) => unknown };
    const orig = mv.bvhFor.bind(w.v);
    mv.bvhFor = (...a: unknown[]) => {
      if (a[3] === true) {
        ran.push(byPos.get(a[1] as Float32Array) ?? -1);
        clock += 1;
      }
      return orig(...a);
    };
    meshes.forEach((m, i) => byPos.set(m.positions, i));
    w.v.setScene({ name: 'many', units: 'mm', meshes, lines: [] });
    // 첫 틈(200 ms 뒤) 한 번 — 가짜 시계로 일 10개
    vi.advanceTimersByTime(200);
    expect(ran.length).toBe(10);
    // 중간에 그물 하나를 더한다(줄 끝에 더해 남은 일과 함께 다시 정렬)
    const add: Mesh3d = { id: 'added', positions: new Float32Array(9 * 4).fill(1), color: [1, 1, 1, 1] };
    byPos.set(add.positions, 3000);
    w.v.setMesh(add);
    vi.advanceTimersByTime(200 + 16 * 400);
    // 0.49.0 줄(shift)로 흉내 낸 차례
    const task = (i: number): { i: number; n: number } => ({ i, n: (i === 3000 ? add : meshes[i]!).positions.length });
    let q = meshes.map((_, i) => task(i)).sort((a, b) => a.n - b.n);
    const want: number[] = [];
    for (let k = 0; k < 10; k++) want.push(q.shift()!.i);
    q.push(task(3000));
    q = q.sort((a, b) => a.n - b.n);
    while (q.length) want.push(q.shift()!.i);
    expect(ran).toEqual(want);
  });

  it('일 16만(그물 8만 + 윤곽선 8만): 줄 처리 시간이 일 수에 비례한다(0.49.0 shift는 제곱)', () => {
    const host = dom.host();
    host.rect = { left: 0, top: 0, width: 400, height: 300 };
    const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false, pickEdges: true });
    views.push(v);
    const mv = v as unknown as { bvhFor: (...a: unknown[]) => unknown };
    let calls = 0;
    mv.bvhFor = () => {
      calls++;
      return null;
    };
    const P = new Float32Array(9);
    const E = new Float32Array(6);
    const meshes: Mesh3d[] = [];
    for (let i = 0; i < 80_000; i++) meshes.push({ id: `p${i}`, positions: P, edges: E, color: [1, 1, 1, 1] });
    v.setScene({ name: 'asm', units: 'mm', meshes, lines: [] });
    const t0 = Date.now();
    vi.advanceTimersByTime(200 + 16 * 2000);
    const ms = Date.now() - t0;
    expect(calls).toBe(160_000);
    // 이 기계에서 수십 ms(0.49.0 shift는 수 초) — 부하를 넉넉히 보고 2초
    expect(ms).toBeLessThan(2000);
  });
});
