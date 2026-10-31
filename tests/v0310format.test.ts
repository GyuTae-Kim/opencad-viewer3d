/**
 * 0.31.0 측정 글 꼴에 코어 기본 꼴 넘기기(MeasureFormat 둘째 인자 MeasureFormatCore — 기본 줄·수 꼴·자릿수·단위 글·어느 글상자인지).
 * - 순수 measureDigits·measureNumber(opencad-viewer3d/annotate): 0.30.0까지 뷰어 안에 있던 셈과 같은 값
 * - 뷰어: 글 꼴이 없을 때 그린 글과 (m, c) => c.lines가 그린 글·글상자 자리가 같은지(미리 보기·찍은 결과·거리 덧그림), 한 인자 함수는 0.30.0처럼 되는지,
 *   c.num·digits·unit이 기본 줄의 수·단위와 같은지(장면 단위·범위를 바꾸면 따라 바뀌는지), 이름표만 옮기는 앱 함수(NC 꼴)가 기본 줄과 이름표만 다른지
 * 가짜 DOM·가짜 WebGL2로 만든 뷰어에 실제 포인터 사건을 넣고, 2D 문맥의 fillText를 모아 견준다(글 폭은 글자 수 × 7화소로 잰다).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FakeElement, installDom } from './fakedom';
import { Viewer3d } from '../src/viewer';
import type { MeasureFormat, MeasureFormatCore } from '../src/viewer';
import { boxMesh } from '../src/synth';
import { measureDigits, measureNumber } from '../src/annotate';
import type { V3 } from '../src/math';
import type { Scene3d } from '../src/types';

describe('measureDigits·measureNumber(순수)', () => {
  const box = (lo: number[], hi: number[]) => ({ min: lo, max: hi });
  /** 0.30.0까지 viewer.ts fmt의 셈 그대로 */
  const old = (b: { min: number[]; max: number[] }, v: number): string => {
    const diag = Math.max(Math.hypot(b.max[0]! - b.min[0]!, b.max[1]! - b.min[1]!, b.max[2]! - b.min[2]!) || 1, 1e-9);
    const digits = Math.max(0, Math.min(6, 5 - Math.floor(Math.log10(diag))));
    const s = v.toFixed(digits);
    return s === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : s;
  };

  it('자릿수: 범위 대각선이 클수록 적게 0~6자리, 크기 0은 5자리, 빈 범위는 0자리', () => {
    expect(measureDigits(box([0, 0, 0], [100, 100, 100]))).toBe(3);
    expect(measureDigits(box([0, 0, 0], [3000, 0, 0]))).toBe(2);
    expect(measureDigits(box([0, 0, 0], [0.5, 0, 0]))).toBe(6);
    expect(measureDigits(box([0, 0, 0], [1e-6, 0, 0]))).toBe(6);
    expect(measureDigits(box([0, 0, 0], [2e6, 0, 0]))).toBe(0);
    expect(measureDigits(box([5, 5, 5], [5, 5, 5]))).toBe(5);
    expect(measureDigits(box([Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]))).toBe(0);
  });

  it('수: 소수 자릿수 toFixed, "-0.000"은 "0.000" — 0.30.0 뷰어 셈과 같다', () => {
    expect(measureNumber(-0.0001, 3)).toBe('0.000');
    expect(measureNumber(-0.001, 3)).toBe('-0.001');
    expect(measureNumber(-0.4, 0)).toBe('0');
    expect(measureNumber(12.3456, 2)).toBe('12.35');
    const boxes = [box([0, 0, 0], [100, 60, 30]), box([-1e6, 0, 0], [1e6, 1, 1]), box([0, 0, 0], [0.02, 0.01, 0]), box([3, 3, 3], [3, 3, 3])];
    for (const b of boxes)
      for (const v of [0, -0, 1 / 3, -1e-7, -2.5e-4, 123456.789, -98.76543, 1e-12])
        expect(measureNumber(v, measureDigits(b)), `${JSON.stringify(b)} ${v}`).toBe(old(b, v));
  });
});

// ───────────── 뷰어 ─────────────
let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
/** 그린 글(fillText) — 모든 2D 문맥에서 */
const texts: string[] = [];
let saved: FakeElement['getContext'];
beforeAll(() => {
  dom = installDom();
  saved = FakeElement.prototype.getContext;
  FakeElement.prototype.getContext = function (this: FakeElement, type: string): unknown {
    const c = saved.call(this, type) as object | null;
    if (type !== '2d' || !c) return c;
    return new Proxy(c, {
      get: (o, k) =>
        k === 'fillText'
          ? (s: string) => void texts.push(String(s))
          : k === 'measureText'
            ? (s: string) => ({ width: String(s).length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 })
            : Reflect.get(o, k),
      set: (o, k, v) => Reflect.set(o, k, v),
    });
  };
});
afterAll(() => {
  for (const v of views) v.dispose();
  views.length = 0;
  FakeElement.prototype.getContext = saved;
  dom.restore();
});

const ptr = (v: Viewer3d, type: string, x: number, y: number, buttons: number): void =>
  (v.canvas as unknown as FakeElement).fire(type, {
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: type === 'pointermove' ? -1 : 0,
    buttons,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
  });
const scr = (v: Viewer3d, p: readonly number[]): { x: number; y: number } => {
  const s = v.project(p)!;
  expect(s.onScreen).toBe(true);
  return { x: s.x, y: s.y };
};
const hover = (v: Viewer3d, p: readonly number[]): void => {
  const s = scr(v, p);
  ptr(v, 'pointermove', s.x, s.y, 0);
  v.renderNow();
};
const click = (v: Viewer3d, p: readonly number[]): void => {
  const s = scr(v, p);
  hover(v, p);
  ptr(v, 'pointerdown', s.x, s.y, 1);
  ptr(v, 'pointerup', s.x, s.y, 0);
  v.renderNow();
};
/** 한 번 그린 글(그리기 전에 비운다) */
const drawn = (v: Viewer3d): string[] => {
  texts.length = 0;
  v.renderNow();
  return [...texts];
};

const scene = (units: Scene3d['units'], size: V3 = [100, 60, 30]): Scene3d => ({
  name: 'f',
  units,
  meshes: [boxMesh('상자', [0, 0, 0], size, [0.6, 0.65, 0.7, 1])],
  lines: [],
  points: [],
});
function make(units: Scene3d['units'] = 'mm'): Viewer3d {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, viewCube: false });
  views.push(v);
  v.setScene(scene(units));
  v.setView('seIso', false);
  v.fit(false);
  v.renderNow();
  return v;
}
/** 상자 윗면 앞 구석(꼭짓점)을 찍고 윗면 위 점을 가리킨다(붙잡지 않은 면 위 점 — 수가 끝자리까지 다르다) */
const A: V3 = [100, 0, 30];
const B: V3 = [37.3, 41.9, 30];
/** 측정 글상자 줄만(축 이름·뷰 큐브 글 등을 뺀다) */
const measureLines = (t: string[]): string[] => t.filter((s) => /^거리 |^ΔX |^Distance |^\d|^-?\d/.test(s));

describe('Viewer3d: 측정 글 꼴의 둘째 인자(0.31.0 MeasureFormatCore)', () => {
  it('(m, c) => c.lines는 글 꼴이 없을 때와 그린 글·글상자 자리가 같다(미리 보기·찍은 결과)', () => {
    for (const units of ['mm', 'inch', 'm', 'unknown'] as const) {
      const v = make(units);
      v.setMeasureMode(true);
      click(v, A);
      hover(v, B);
      const t0 = measureLines(drawn(v)), r0 = v.measureLabelRect;
      expect(t0.length, units).toBe(2);
      expect(t0[0]).toMatch(units === 'unknown' ? /^거리 \d+\.\d+$/ : new RegExp(`^거리 \\d+\\.\\d+ ${{ mm: 'mm', inch: 'in', m: 'm' }[units]}$`));
      const seen: MeasureFormatCore[] = [];
      v.setMeasureFormat((_m, c) => {
        seen.push(c);
        return c.lines;
      });
      expect(measureLines(drawn(v))).toEqual(t0);
      expect(v.measureLabelRect).toEqual(r0);
      const c = seen.at(-1)!;
      expect(c.source).toBe('measure');
      expect(c.unit).toBe({ mm: 'mm', inch: 'in', m: 'm', unknown: '' }[units]);
      // 상자 100 × 60 × 30: 대각선 120.4 → 3자리
      expect(c.digits).toBe(3);
      // 찍은 결과도
      click(v, B);
      v.setMeasureFormat(null);
      const t1 = measureLines(drawn(v)), r1 = v.measureLabelRect;
      v.setMeasureFormat((_m, k) => k.lines);
      expect(measureLines(drawn(v))).toEqual(t1);
      expect(v.measureLabelRect).toEqual(r1);
    }
  });

  it('c.num·digits·unit으로 다시 만든 줄이 기본 줄과 같다 — 이름표만 옮기는 앱 함수(NC 꼴)는 이름표만 다르다', () => {
    const v = make('mm');
    v.setMeasureMode(true);
    click(v, A);
    hover(v, B);
    const base = measureLines(drawn(v));
    let got: { m: Parameters<MeasureFormat>[0]; c: MeasureFormatCore } | null = null;
    v.setMeasureFormat((m, c) => {
      got = { m, c };
      const u = c.unit ? ` ${c.unit}` : '';
      return [`거리 ${c.num(m.distance)}${u}`, `ΔX ${c.num(m.dx)}  ΔY ${c.num(m.dy)}  ΔZ ${c.num(m.dz)}`];
    });
    expect(measureLines(drawn(v))).toEqual(base);
    const { m, c } = got!;
    expect(c.lines).toEqual(base);
    expect(c.num(m.distance)).toBe(measureNumber(m.distance, c.digits));
    expect(c.num(-1e-9)).toBe('0.000');
    // 이름표만 옮긴다(번역 사전 대신 바꾸기 — 앱은 사전으로)
    const tr = (ko: string): string => ({ 거리: 'Distance' })[ko] ?? ko;
    v.setMeasureFormat((mm, k) => (k.source === 'measure' ? [`${tr('거리')} ${k.num(mm.distance)}${k.unit ? ` ${k.unit}` : ''}`, k.lines[1]!] : k.lines));
    expect(measureLines(drawn(v))).toEqual([base[0]!.replace('거리', 'Distance'), base[1]]);
    // 앱이 받은 줄을 고쳐도 다음 그리기에는 새 줄이 온다
    const seen: string[][] = [];
    v.setMeasureFormat((_m, k) => {
      seen.push([...k.lines]);
      k.lines[0] = 'x';
      return k.lines;
    });
    drawn(v);
    drawn(v);
    expect(seen[0]).toEqual(base);
    expect(seen.at(-1)).toEqual(base);
  });

  it('한 인자 함수(0.30.0 꼴)는 그대로 된다 — 그린 글은 그 함수가 돌려준 줄', () => {
    const v = make('mm');
    v.setMeasureMode(true);
    click(v, A);
    hover(v, B);
    const one: MeasureFormat = (m) => [`d=${m.distance.toFixed(1)}`];
    v.setMeasureFormat(one);
    const t = drawn(v).filter((s) => s.startsWith('d='));
    expect(t).toEqual([`d=${Math.hypot(B[0] - A[0], B[1] - A[1], 0).toFixed(1)}`]);
    expect(v.measureLabelRect!.height).toBe(16 + 8);
  });

  it('자릿수는 장면 범위를 따른다(setScene·setMesh로 바꾼 범위)', () => {
    const v = make('mm');
    v.setMeasureMode(true);
    let c: MeasureFormatCore | null = null;
    v.setMeasureFormat((_m, k) => {
      c = k;
      return k.lines;
    });
    click(v, A);
    hover(v, B);
    expect(c!.digits).toBe(3);
    // 그물을 크게 바꾸면(대각선 1.1e4 → 1자리)
    v.setMesh(boxMesh('상자', [0, 0, 0], [10000, 5000, 30], [0.6, 0.65, 0.7, 1]));
    v.renderNow();
    hover(v, B);
    expect(c!.digits).toBe(1);
    expect(c!.lines[0]).toMatch(/^거리 \d+\.\d mm$/);
  });

  it('거리 덧그림(글을 주지 않은 것)은 source annotation과 기본 한 줄, 글을 준 덧그림·다른 종류는 부르지 않는다', () => {
    const v = make('inch');
    v.setAnnotations([
      { kind: 'distance', a: [0, 0, 30], b: [100, 0, 30] },
      { kind: 'distance', a: [0, 60, 30], b: [100, 60, 30], label: '앱 글' },
      { kind: 'radius', a: [50, 30, 30], b: [60, 30, 30] },
    ]);
    const t0 = drawn(v), r0 = v.annotationLabelRects;
    expect(t0).toContain('100.000 in');
    const seen: MeasureFormatCore[] = [];
    v.setMeasureFormat((_m, c) => {
      seen.push(c);
      return c.lines;
    });
    expect(drawn(v)).toEqual(t0);
    expect(v.annotationLabelRects).toEqual(r0);
    expect(seen.length).toBe(1);
    expect(seen[0]).toMatchObject({ lines: ['100.000 in'], digits: 3, unit: 'in', source: 'annotation' });
    expect(seen[0]!.num(-0.0002)).toBe('0.000');
  });
});
