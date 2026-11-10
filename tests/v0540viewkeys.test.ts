/**
 * 0.54.0 작은 모듈 viewkeys(STEP 63차 요청 — 첫 화면이 표만 쓰는데 camera 모듈이 통째로 끌려왔다):
 * 표·viewKeyOf, 다른 코어 모듈을 가져오지 않는다, camera·입구·viewer가 같은 객체를 다시 내보낸다(0.10.0~0.53.0 가져오기 그대로)
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as camera from '../src/camera';
import * as entry from '../src/index';
import * as viewer from '../src/viewer';
import { VIEW_KEYS, VIEW_LABELS, viewKeyOf } from '../src/viewkeys';

describe('0.54.0 작은 모듈 viewkeys', () => {
  it('표·viewKeyOf — camera·입구·viewer가 같은 객체를 내보내고, viewkeys는 아무 모듈도 가져오지 않는다', () => {
    expect(VIEW_KEYS).toEqual({ '1': 'front', '2': 'back', '3': 'left', '4': 'right', '5': 'top', '6': 'bottom', '7': 'seIso' });
    expect(VIEW_LABELS.front).toBe('앞');
    expect(Object.keys(VIEW_LABELS)).toHaveLength(10);
    expect(viewKeyOf('front')).toBe('1');
    expect(viewKeyOf('seIso')).toBe('7');
    expect(viewKeyOf('swIso')).toBeUndefined();
    for (const m of [camera, entry, viewer] as unknown as { VIEW_KEYS: unknown }[]) expect(m.VIEW_KEYS).toBe(VIEW_KEYS);
    expect(camera.VIEW_LABELS).toBe(VIEW_LABELS);
    expect(entry.VIEW_LABELS).toBe(VIEW_LABELS);
    expect(entry.viewKeyOf).toBe(viewKeyOf);
    expect(camera.viewKeyOf).toBe(viewKeyOf);
    const text = readFileSync(new URL('../src/viewkeys.ts', import.meta.url), 'utf8');
    expect(/^\s*(import|export\s[^\n]*\sfrom)\s/m.test(text)).toBe(false);
  });
});
