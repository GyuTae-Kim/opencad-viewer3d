/**
 * 0.56.0 키보드 고르기·알림(SKP 59·60차 요청):
 *  - 고르기 후보 묶음 열쇠 group(p, index): 둘째 인수 = 이 후보가 들 차례(앞서 더한 후보 수). 첫 후보와 둘째 이후를 다른 열쇠로 묶는다. 한 인수 함수는 0.55.0 그대로
 *  - setKeyboardSnap({ pickName(p, index) }): 둘째 인수 = 그 고른 것의 후보 차례(알림 index와 같다 — 'commit'의 picked 글도)
 *  - setKeyboardSnap({ formatNumber }): 알림 글의 좌표·거리·차를 앱 수 꼴로(종류·코어 기본 글을 받는다). 글이 아니거나 빈 글·예외면 코어 기본 글, 주지 않으면 0.55.0과 같은 글
 * 장면은 0.54.0 시험과 같다: 아래 상자 L [0,0,0]–[100,100,20], 위 상자 U [20,20,40]–[80,80,50], U 윗면 위 선분 묶음 '선', 위에서 본다
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import { type KeyboardSnapAnnouncement, type KeyboardSnapOptions, Viewer3d } from '../src/viewer';
import { type KeySnapNumberCore, type KeySnapNumberKind, candidateText, pointText } from '../src/keysnap';
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
const scene = (): Scene3d => ({ name: 'keyfmt', units: 'mm', meshes: [L, U], lines: [LINES] });

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
function make(measuring = false): Viewer3d {
  const host = dom.host();
  host.rect = { left: 0, top: 0, width: 800, height: 600 };
  const v = new Viewer3d(host as unknown as HTMLElement, { animate: false });
  views.push(v);
  v.setScene(scene());
  v.setView('top', false);
  v.fit(false);
  v.setCamera({ ...v.getCamera(), target: [50, 50, 50], distance: 400 });
  if (measuring) v.setMeasureMode(true);
  v.renderNow();
  return v;
}
function withKeys(v: Viewer3d, o: KeyboardSnapOptions = {}): KeyboardSnapAnnouncement[] {
  const said: KeyboardSnapAnnouncement[] = [];
  v.setKeyboardSnap({ ...o, announce: (a) => said.push(a) });
  return said;
}

describe('0.56.0 고르기 후보 묶음 열쇠의 후보 차례', () => {
  it('group(p, index): index는 이 후보가 들 차례(앞서 더한 후보 수) — 첫 후보와 둘째 이후를 다른 열쇠로', () => {
    const v = make();
    const all = v.pickCandidates(400, 300);
    expect(all.length).toBe(7);
    // 열쇠 없음(null): 모든 후보가 더해지므로 차례는 0, 1, 2…
    // (꼴에서 index는 고르는 인수 — 코어는 늘 준다)
    const seen: (number | undefined)[] = [];
    expect(v.pickCandidates(400, 300, { group: (_p, i) => (seen.push(i), null) })).toEqual(all);
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // 첫 후보는 제 묶음 이름, 둘째 이후는 한 묶음: 후보 둘(첫 후보 + 그 뒤 가장 앞의 것), 셋째부터는 차례 2로 묻고 걷어 내기만
    const asked: [string, number | undefined][] = [];
    const two = v.pickCandidates(400, 300, { group: (p, i) => (asked.push([p.id, i]), i === 0 ? `first:${p.id}` : 'rest') });
    expect(two).toEqual(all.slice(0, 2));
    expect(asked.slice(0, 2).map((a) => a[1])).toEqual([0, 1]);
    expect(asked.length).toBeGreaterThan(2);
    for (const a of asked.slice(2)) expect(a[1]).toBe(2);
    // 한 인수 함수(0.55.0)는 그대로 — id마다 하나
    const byId = v.pickCandidates(400, 300, { group: (p: Pick3d) => p.id });
    expect(byId.map((p) => p.id)).toEqual([...new Set(all.map((p) => p.id))]);
  });

  it('키보드 pickCycle의 group도 같은 차례 — 알림 count·onPick cycle이 그 묶음 수', () => {
    const v = make();
    const said = withKeys(v, { pickCycle: { group: (_p, i) => (i === 0 ? null : 'rest') } });
    key(v, 'Enter');
    expect(said.at(-1)!.count).toBe(2);
    key(v, 'Tab');
    expect(said.at(-1)!).toMatchObject({ index: 1, count: 2 });
    const cycles: unknown[] = [];
    v.onPick((_p, e) => cycles.push(e.cycle));
    key(v, 'Enter');
    expect(cycles).toEqual([{ index: 1, count: 2 }]);
  });
});

describe('0.56.0 pickName 후보 차례', () => {
  it('pickName(p, index): 알림의 후보 차례(index)와 같은 값 — 후보 글·Enter의 picked 글', () => {
    const v = make();
    const calls: [string, number | undefined][] = [];
    const said = withKeys(v, { pickName: (p, i) => (calls.push([p.id, i]), `${p.id}#${i}`) });
    key(v, 'Enter');
    expect(said.at(-1)!.text).toMatch(/^가상 커서를 켰습니다\. 선#0 선분 1\/7: /);
    for (let i = 0; i < 3; i++) key(v, 'Tab');
    expect(said.at(-1)!.index).toBe(3);
    expect(said.at(-1)!.text).toMatch(/^U#3 면 4\/7: /);
    key(v, 'Enter');
    expect(said.at(-1)!.text).toBe('골랐습니다: U#3 면');
    // 첫 후보로 돌아와 Enter(누르기와 같은 고르기)는 0
    for (let i = 0; i < 4; i++) key(v, 'Tab');
    expect(said.at(-1)!.index).toBe(0);
    key(v, 'Enter');
    expect(said.at(-1)!.text).toBe('골랐습니다: 선#0 선분');
    for (const [, i] of calls) expect(i).toBeGreaterThanOrEqual(0);
    // pickCycle을 끄면 늘 0(0.46.0 — 후보 수 0)
    const w = make();
    const t = withKeys(w, { pickCycle: false, pickName: (p, i) => `${p.id}@${i}` });
    key(w, 'Enter');
    expect(t.at(-1)!.text).toMatch(/^가상 커서를 켰습니다\. 선@0 선분: /);
  });
});

describe('0.56.0 알림 수 꼴(formatNumber)', () => {
  it('순수 함수: pointText·candidateText가 num에 수 종류를 준다(한 인수 num은 0.55.0과 같은 글)', () => {
    const kinds: KeySnapNumberKind[] = [];
    const num = (v: number, k: KeySnapNumberKind): string => (kinds.push(k), `${k}=${v}`);
    expect(pointText([1, 2, 3], num)).toBe('X x=1, Y y=2, Z z=3');
    expect(candidateText({ kind: 'endpoint', point: [1, 2, 3] }, 0, 1, num, 5, 'mm')).toBe('끝점: X x=1, Y y=2, Z z=3, 거리 distance=5 mm');
    expect(kinds).toEqual(['x', 'y', 'z', 'x', 'y', 'z', 'distance']);
    expect(candidateText({ kind: 'endpoint', point: [1, 2, 3] }, 0, 1, (v) => v.toFixed(1), 5, 'mm')).toBe('끝점: X 1.0, Y 2.0, Z 3.0, 거리 5.0 mm');
  });

  /** 측정 모드: 커서를 켜고 첫 점을 찍은 뒤 오른쪽으로 옮겨 둘째 점을 찍는다 — 알림 글 차례 */
  function measureRun(o: KeyboardSnapOptions): KeyboardSnapAnnouncement[] {
    const v = make(true);
    const said = withKeys(v, o);
    key(v, 'ArrowRight');
    key(v, 'Enter');
    for (let i = 0; i < 6; i++) key(v, 'ArrowRight');
    key(v, 'Enter');
    return said;
  }

  it('측정 알림의 좌표·거리·차를 앱 글로 — 종류와 코어 기본 글(거리는 단위까지)을 받는다', () => {
    const plain = measureRun({});
    const cores: [number, KeySnapNumberCore][] = [];
    const fmt = measureRun({ formatNumber: (v, c) => (cores.push([v, c]), `〈${c.kind}|${(v / 25.4).toFixed(3)} in|${c.text}〉`) });
    expect(fmt.length).toBe(plain.length);
    const kinds = new Set(cores.map(([, c]) => c.kind));
    expect([...kinds].sort()).toEqual(['distance', 'dx', 'dy', 'dz', 'x', 'y', 'z']);
    for (const [v, c] of cores) {
      expect(c.unit).toBe('mm');
      expect(c.digits).toBeGreaterThanOrEqual(0);
      if (c.kind === 'distance') expect(c.text).toBe(`${v.toFixed(c.digits)} mm`);
      else expect(c.text).toMatch(/^-?[\d.]+$/);
    }
    // 앱 글 자리에 코어 기본 글을 되넣으면 0.55.0 글(앱 글로 바꾼 것 말고는 같다)
    for (let i = 0; i < fmt.length; i++) expect(fmt[i]!.text.replace(/〈\w+\|[^|]*\|([^〉]*)〉/g, '$1')).toBe(plain[i]!.text);
    const last = fmt.at(-1)!;
    expect(last.text).toMatch(/^둘째 점을 찍었습니다\. 거리 〈distance\|[\d.]+ in\|[\d.]+ mm〉, X 차 〈dx\|-?[\d.]+ in\|[^〉]+〉, Y 차 〈dy\|[^〉]+〉, Z 차 〈dz\|[^〉]+〉$/);
    // 알림 값(측정 결과·점)은 그대로
    expect(last.measurement).toEqual(plain.at(-1)!.measurement);
    expect(last.point).toEqual(plain.at(-1)!.point);
  });

  it('글이 아니거나 빈 글·예외면 그 수는 코어 기본 글 — 주지 않은 것과 같다', () => {
    const plain = measureRun({});
    const a = measureRun({ formatNumber: (_v, c) => (c.kind === 'x' ? null : c.kind === 'y' ? '  ' : c.text) });
    expect(a.map((s) => s.text)).toEqual(plain.map((s) => s.text));
    const b = measureRun({
      formatNumber: () => {
        throw new Error('앱 오류');
      },
    });
    expect(b.map((s) => s.text)).toEqual(plain.map((s) => s.text));
  });

  it('고르기 모드 후보 글의 점 좌표도 앱 글로', () => {
    const v = make();
    const said = withKeys(v, { formatNumber: (_v, c) => `[${c.kind}]` });
    key(v, 'Enter');
    expect(said.at(-1)!.text).toMatch(/^가상 커서를 켰습니다\. 선 선분 1\/7: X \[x\], Y \[y\], Z \[z\]\. /);
  });
});
