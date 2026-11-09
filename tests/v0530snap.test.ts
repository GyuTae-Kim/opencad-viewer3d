/**
 * 0.53.0 앱 요청(덧붙임):
 *  - NC 56·STEP 62차: 고르기 후보 묶음 열쇠(pickCandidates·키보드 pickCycle의 group) — 같은 묶음은 한 후보(가장 앞의 것), 후보 한도·알림 count·onPick cycle은 묶음 수.
 *    주지 않거나 열쇠가 문자열·수가 아니거나 함수가 던지면 0.47.0 그대로
 *  - NC 56차: 축이 면을 뚫는 점 다듬기의 넓힌 받기(axisFaceRefined)가 커서 광선이 맞은 삼각형이 X 삼각형의 같은 평면 짝이거나 그 자리에 겹친 다른 그물 삼각형일 때도 본다
 *    (합성 판 1235 × 500 × 3 — 판 윗면·아랫면에서 같은 자리를 뚫은 Ø5 구멍, 끌어온 점에서 X축이 벽을 반지름의 6 %로 지나는 옆 15 보기. 0.52.0은 Q 둘레 9 × 9 격자 가운데
 *    T 양쪽 4자리씩 X 그대로 "면 위"였다 — 변 가운데 둘레 삼각형 모으기가 겹친 다른 그물 삼각형으로 차 같은 평면 짝을 놓쳤다)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type MeasureSnapOptions, type PickEvent, type PickGroupKey, Viewer3d } from '../src/viewer';
import { samePickTarget } from '../src/scenepick';
import { defaultCamera, dirToAngles } from '../src/camera';
import type { SnapRefineFaceInput } from '../src/snap';
import { boxMesh } from '../src/synth';
import type { LineSet3d, Mesh3d, Pick3d, Scene3d } from '../src/types';

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
function key(v: Viewer3d, k: string): void {
  cv(v).fire('keydown', { key: k, code: '', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
  v.renderNow();
}

// ───────────── 묶음 열쇠 ─────────────
// 0.47.0 시험 장면(L·U 상자와 선분 셋이 만나는 자리) + 그 자리를 지나는 짧은 공구 경로 토막 24개(코드 줄 7·8 — segmentIds 7xx·8xx)
const L = boxMesh('L', [0, 0, 0], [100, 100, 20], [0.6, 0.65, 0.7, 1]);
const U = boxMesh('U', [20, 20, 40], [80, 80, 50], [0.7, 0.6, 0.5, 1]);
const LINES: LineSet3d = { id: '선', name: '선', positions: new Float32Array([30, 50, 50, 70, 50, 50, 30, 50, 50, 70, 50, 50, 50, 30, 50, 50, 70, 50]), color: [0.9, 0.9, 0.2, 1] };
const PATH: LineSet3d = (() => {
  const P: number[] = [], ids: number[] = [];
  for (let i = 0; i < 24; i++) {
    const a = ((i + 0.5) * Math.PI) / 24;
    P.push(50 - 6 * Math.cos(a), 50 - 6 * Math.sin(a), 50, 50 + 6 * Math.cos(a), 50 + 6 * Math.sin(a), 50);
    ids.push((i < 12 ? 700 : 800) + i);
  }
  return { id: '경로', name: '경로', positions: new Float32Array(P), segmentIds: new Uint32Array(ids), color: [0.2, 0.5, 0.9, 1] };
})();
const scene: Scene3d = { name: 'group', units: 'mm', meshes: [L, U], lines: [LINES, PATH], points: [] };
/** 앱 묶음 열쇠: 공구 경로는 코드 줄, 그물은 묶음(면 둘 — 윗면·아랫면 — 을 하나로), 선분 묶음 '선'은 묶지 않는다 */
const group: PickGroupKey = (p) => (p.kind === 'line' && p.id === '경로' ? `경로:${Math.floor(p.index / 100)}` : p.kind === 'mesh' ? `그물:${p.id}` : undefined);
const sig = (p: Pick3d): string => (p.kind === 'line' && p.id === '경로' ? `경로:${Math.floor(p.index / 100)}` : `${p.kind}:${p.id}`);
function make(): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(scene);
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [50, 50, 50], distance: 400 });
  v.renderNow();
  return v;
}

describe('0.53.0 고르기 후보 묶음 열쇠(group)', () => {
  it('pickCandidates: 주지 않으면 공구 경로 토막이 한도 16을 채우고, 주면 묶음마다 하나 — 뒤의 선분·그물 면까지 든다', () => {
    const v = make();
    const s = v.project([50, 50, 50])!;
    const plain = v.pickCandidates(s.x, s.y);
    expect(plain.length).toBe(16);
    expect(plain.every((p) => p.kind === 'line')).toBe(true);
    const g = v.pickCandidates(s.x, s.y, { group });
    expect(g.map(sig).sort()).toEqual(['line:선', 'line:선', 'line:선', 'mesh:L', 'mesh:U', '경로:7', '경로:8']);
    // 첫째는 pick과 같다(묶어도 가장 앞의 것)
    expect(samePickTarget(g[0]!, v.pick(s.x, s.y)!)).toBe(true);
    expect(samePickTarget(g[0]!, plain[0]!)).toBe(true);
    // 묶음 열쇠가 같은 후보는 둘이 아니다(묶지 않은 '선'은 토막마다)
    const keys = g.map((p) => group(p)).filter((k) => k !== undefined);
    expect(new Set(keys).size).toBe(keys.length);
    // 한도는 묶음 수
    expect(v.pickCandidates(s.x, s.y, { group, max: 3 }).length).toBe(3);
    // 열쇠가 글·수가 아니면(모두 undefined)·함수가 던지면 0.47.0 그대로
    expect(v.pickCandidates(s.x, s.y, { group: () => undefined })).toEqual(plain);
    expect(
      v.pickCandidates(s.x, s.y, {
        group: () => {
          throw new Error('app');
        },
      }),
    ).toEqual(plain);
    expect(v.pickCandidates(s.x, s.y, { group: null })).toEqual(plain);
    // 수 열쇠와 글 열쇠는 다르다(1 ≠ '1')
    const mixed = v.pickCandidates(s.x, s.y, { group: (p) => (p.kind === 'mesh' ? (p.id === 'U' ? 1 : '1') : undefined), max: 40 });
    expect(mixed.filter((p) => p.kind === 'mesh').map((p) => p.id)).toEqual(['U', 'L']);
  });

  it('키보드 pickCycle { group }: 알림 count·Tab 차례·onPick cycle이 묶음 수, keyboardSnap 읽기에 남는다', () => {
    const v = make();
    const said: KeyboardSnapAnnouncement[] = [];
    v.setKeyboardSnap({ pickCycle: { group }, announce: (a) => said.push(a) });
    expect(typeof (v.keyboardSnap!.pickCycle as { group?: unknown }).group).toBe('function');
    const got: [Pick3d | null, PickEvent][] = [];
    v.onPick((p, e) => got.push([p, e]));
    key(v, 'Enter');
    const list = v.pickCandidates(400, 300, { pointerType: 'keyboard', group });
    expect(list.length).toBe(7);
    expect(said.at(-1)).toMatchObject({ reason: 'start', index: 0, count: 7 });
    for (let i = 1; i <= 7; i++) {
      key(v, 'Tab');
      expect(said.at(-1)!.index).toBe(i % 7);
      expect(samePickTarget(said.at(-1)!.pick!, list[i % 7]!)).toBe(true);
    }
    key(v, 'Tab');
    key(v, 'Enter');
    expect(samePickTarget(got.at(-1)![0]!, list[1]!)).toBe(true);
    expect(got.at(-1)![1].cycle).toEqual({ index: 1, count: 7 });
    // 묶음 열쇠 없이 다시 켜면 0.47.0 그대로(토막이 16을 채운다)
    v.setKeyboardSnap({ pickCycle: true, announce: (a) => said.push(a) });
    key(v, 'Escape');
    key(v, 'Enter');
    expect(said.at(-1)).toMatchObject({ reason: 'start', count: 16 });
  });
});

// ───────────── 축이 면을 뚫는 점 다듬기 — 겹친 구멍 벽 ─────────────
const C: [number, number] = [68, 1];
const R = 2.5;
const SEG = 12;
/** 앱이 만드는 꼴의 원기둥(시작 a, 방향 d, 길이 len — 옆면 + 두 뚜껑, 꼭짓점 법선, 테두리 윤곽선). 방향이 반대인 두 구멍은 둘레를 반대로 돌아 칸 번호가 다르다 */
function drill(id: string, a: [number, number, number], d: [number, number, number], len: number): Mesh3d {
  const t = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  let e1 = [d[1] * t[2]! - d[2] * t[1]!, d[2] * t[0]! - d[0] * t[2]!, d[0] * t[1]! - d[1] * t[0]!];
  const l1 = Math.hypot(e1[0]!, e1[1]!, e1[2]!) || 1;
  e1 = e1.map((x) => x / l1);
  const e2 = [d[1] * e1[2]! - d[2] * e1[1]!, d[2] * e1[0]! - d[0] * e1[2]!, d[0] * e1[1]! - d[1] * e1[0]!];
  const b = [a[0] + d[0] * len, a[1] + d[1] * len, a[2] + d[2] * len];
  const ring = (c: readonly number[], k: number): number[] => {
    const th = (k / SEG) * Math.PI * 2;
    return [0, 1, 2].map((i) => c[i]! + R * (Math.cos(th) * e1[i]! + Math.sin(th) * e2[i]!));
  };
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [], edges: number[] = [];
  for (let k = 0; k <= SEG; k++) {
    const th = (k / SEG) * Math.PI * 2;
    const n = [0, 1, 2].map((i) => Math.cos(th) * e1[i]! + Math.sin(th) * e2[i]!);
    pos.push(...ring(a, k), ...ring(b, k));
    nrm.push(...n, ...n);
  }
  for (let k = 0; k < SEG; k++) idx.push(k * 2, k * 2 + 2, k * 2 + 1, k * 2 + 1, k * 2 + 2, k * 2 + 3);
  for (const [c, sgn] of [
    [a, -1],
    [b, 1],
  ] as const) {
    const cb = pos.length / 3;
    pos.push(...c);
    nrm.push(sgn * d[0], sgn * d[1], sgn * d[2]);
    for (let k = 0; k < SEG; k++) {
      pos.push(...ring(c, k));
      nrm.push(sgn * d[0], sgn * d[1], sgn * d[2]);
    }
    for (let k = 0; k < SEG; k++) {
      const i1 = cb + 1 + k, i2 = cb + 1 + ((k + 1) % SEG);
      if (sgn > 0) idx.push(cb, i1, i2);
      else idx.push(cb, i2, i1);
    }
    for (let k = 0; k < SEG; k++) edges.push(...ring(c, k), ...ring(c, k + 1));
  }
  return { id, name: id, positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint32Array(idx), edges: new Float32Array(edges), color: [0.75, 0.2, 0.15, 1] };
}
/** 직선과 구멍 원기둥(높이 0~3)의 교차 가운데 near에 가까운 근 */
function cylRoot(o: readonly number[], d: readonly number[], near: readonly number[]): [number, number, number] | null {
  const ou = o[0]! - C[0], ov = o[1]! - C[1];
  const A = d[0]! * d[0]! + d[1]! * d[1]!, B = ou * d[0]! + ov * d[1]!, Cc = ou * ou + ov * ov - R * R;
  const disc = B * B - A * Cc;
  if (!(A > 1e-12) || disc < 0) return null;
  const qs = [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A].map((s): [number, number, number] => [o[0]! + d[0]! * s, o[1]! + d[1]! * s, o[2]! + d[2]! * s]);
  const dd = (p: readonly number[]): number => Math.hypot(p[0]! - near[0]!, p[1]! - near[1]!, p[2]! - near[2]!);
  const q = dd(qs[0]!) <= dd(qs[1]!) ? qs[0]! : qs[1]!;
  return q[2] >= -1e-9 && q[2] <= 3 + 1e-9 ? q : null;
}
const BOARD = { ...boxMesh('판', [0, 0, 0], [1235, 500, 3], [0.86, 0.74, 0.55, 0.35]), doubleSided: true };
// 판 두께에서 잘려 둘 다 깊이 3 — 같은 자리 벽(윗면 구멍은 둘레를 시계 방향, 아랫면 구멍은 반시계 방향으로 돈다)
const HOLES: Scene3d = { name: '판', units: 'mm', meshes: [BOARD, drill('윗면 구멍', [68, 1, 3], [0, 0, -1], 3), drill('아랫면 구멍', [68, 1, 0], [0, 0, 1], 3)], lines: [], points: [] };

describe('0.53.0 축이 면을 뚫는 점 다듬기 — 커서 광선이 맞은 삼각형이 같은 평면 짝·겹친 다른 그물(NC 56차)', () => {
  it('Q 둘레 9 × 9 격자: 다듬지 않은 면 위 만나는 점이 없다(0.52.0은 4자리) — 그 자리는 커서 아래 삼각형(같은 평면 짝·겹친 그물)으로 받는다. refineFace가 null이면 그대로', () => {
    const yRel = -2.35, y = C[1] + yRel, z = 1.5;
    const Q: [number, number, number] = [C[0] - Math.sqrt(R * R - yRel * yRel), y, z];
    const run = (app: boolean): { counts: Record<string, number>; faces: Set<string> } => {
      const host = dom.host();
      host.rect = { left: 0, top: 0, width: 800, height: 600 };
      const v = new Viewer3d(host as unknown as HTMLElement, { animate: false, keyboard: false });
      views.push(v);
      v.setScene(HOLES);
      v.setMeasureMode(true);
      const calls: SnapRefineFaceInput[] = [];
      const o: MeasureSnapOptions = {
        edges: true,
        inference: { axes: true, track: true, axisFaces: true, axisEdges: true, intersections: true, perpendicular: true, parallel: true },
        refine: () => null,
        refineFace: (c) => (calls.push(c), app && c.face.id.endsWith('구멍') ? cylRoot(c.line.origin, c.line.dir, c.point) : null),
        refineSnapToExact: true,
        throughTranslucent: true,
      };
      v.setMeasureSnap(o);
      expect(v.setMeasureTrackPoints([[C[0] + 20, y, z]])).toBe(1);
      const a = dirToAngles([0.3, -1, 0.5]);
      v.setCamera({ ...defaultCamera(), yaw: a.yaw, pitch: a.pitch, target: [C[0], C[1], 1.5], distance: 15, projection: 'perspective' });
      v.renderNow();
      const s = v.project(Q)!;
      const counts: Record<string, number> = {};
      const faces = new Set<string>();
      for (let gy = -4; gy <= 4; gy++)
        for (let gx = -4; gx <= 4; gx++) {
          cv(v).fire('pointermove', { clientX: s.x + gx * 2 + 0.31, clientY: s.y + gy * 2 + 0.17, pointerId: 1, pointerType: 'mouse', button: -1, buttons: 0, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
          v.renderNow();
          const h = v.measureHoverSnap;
          if (!h || h.snap !== 'axis' || !h.face) continue;
          const onQ = Math.hypot(h.point[0] - Q[0], h.point[1] - Q[1], h.point[2] - Q[2]) < 1e-6;
          const k = h.refined ? (onQ ? 'Q' : 'refined-other') : 'X';
          counts[k] = (counts[k] ?? 0) + 1;
          if (h.refined) faces.add(`${h.face.id}#${h.face.index}`);
        }
      expect(calls.length).toBeGreaterThan(0);
      return { counts, faces };
    };
    const app = run(true);
    expect(app.counts.X ?? 0).toBe(0);
    expect(app.counts['refined-other'] ?? 0).toBe(0);
    expect(app.counts.Q).toBe(74);
    // 받은 면에는 X 삼각형(아랫면 구멍 11)의 같은 평면 짝(아랫면 구멍 10)이 든다
    expect(app.faces.has('아랫면 구멍#10')).toBe(true);
    const none = run(false);
    expect(none.counts.Q ?? 0).toBe(0);
    expect(none.counts.X).toBeGreaterThan(0);
  });
});
