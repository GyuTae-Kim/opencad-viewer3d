/** 0.58.0 measureFormatOf: 키보드 알림의 앱 수 꼴을 측정 거리 글상자에도(순수 함수 — 앱이 주지 않으면 코어 글과 글자까지 같다) */
import { describe, expect, it } from 'vitest';
import { measureNumber } from '../src/annotate';
import { type KeySnapNumberCore, measureFormatOf } from '../src/keysnap';
import type { MeasureFormatCore, MeasureResult } from '../src/viewer';

const m = { a: [0, 0, 0], b: [1, -2, 0], distance: 12.3456, dx: 1, dy: -2, dz: 0, units: 'mm' } as unknown as MeasureResult & { units: 'mm' };
const core = (source: MeasureFormatCore['source'], unit = 'mm', digits = 3): MeasureFormatCore => ({
  lines: source === 'annotation' ? [`12.346${unit ? ` ${unit}` : ''}`] : [`거리 12.346${unit ? ` ${unit}` : ''}`, 'ΔX 1.000  ΔY -2.000  ΔZ 0.000'],
  num: (v) => measureNumber(v, digits),
  digits,
  unit,
  source,
});

describe('0.58.0 measureFormatOf', () => {
  it.each(['measure', 'annotation'] as const)('fn이 글을 주지 않으면(null·빈 글·예외) 코어 글과 글자까지 같다(%s)', (source) => {
    for (const unit of ['mm', '']) {
      const c = core(source, unit);
      expect(measureFormatOf(() => null)(m, c)).toEqual(c.lines);
      expect(measureFormatOf(() => '  ')(m, c)).toEqual(c.lines);
      expect(
        measureFormatOf(() => {
          throw new Error('앱 오류(시험)');
        })(m, c),
      ).toEqual(c.lines);
    }
  });

  it('두 점 측정: 거리·차 자리를 앱 글로, 키보드 알림과 같은 종류·코어 글을 준다', () => {
    const seen: KeySnapNumberCore[] = [];
    const lines = measureFormatOf((v, c) => {
      seen.push(c);
      return `[${v}]`;
    })(m, core('measure'));
    expect(lines).toEqual(['거리 [12.3456]', 'ΔX [1]  ΔY [-2]  ΔZ [0]']);
    expect(seen.map((c) => c.kind)).toEqual(['distance', 'dx', 'dy', 'dz']);
    expect(seen[0]).toEqual({ kind: 'distance', text: '12.346 mm', digits: 3, unit: 'mm' });
    expect(seen[1]).toEqual({ kind: 'dx', text: '1.000', digits: 3, unit: 'mm' });
  });

  it('글을 주지 않은 거리 덧그림: 거리 한 줄', () => {
    expect(measureFormatOf(() => '41 ft')(m, core('annotation'))).toEqual(['41 ft']);
  });
});
