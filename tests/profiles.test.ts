/** 외곽선(RenderState.profiles)을 그리는 모드(0.7.2 와이어프레임) */
import { describe, expect, it } from 'vitest';
import { type RenderMode, drawsProfiles, isShadedLike } from '../src/renderer';

const MODES: RenderMode[] = ['shaded', 'shadedEdges', 'wireframe', 'xray', 'hiddenLine', 'monochrome', 'noTexture'];
const table = (f: (m: RenderMode) => boolean): Record<string, boolean> => Object.fromEntries(MODES.map((m) => [m, f(m)]));

describe('외곽선을 그리는 모드', () => {
  it('음영 계열은 0.7.1 그대로, 와이어프레임은 0.7.2부터 그리고, X-ray는 그리지 않는다', () => {
    expect(table(drawsProfiles)).toEqual({ shaded: true, shadedEdges: true, wireframe: true, xray: false, hiddenLine: true, monochrome: true, noTexture: true });
  });

  it('음영 계열(면을 채워 서로 가리는 모드)에는 와이어프레임·X-ray가 들지 않는다', () => {
    expect(table(isShadedLike)).toEqual({ shaded: true, shadedEdges: true, wireframe: false, xray: false, hiddenLine: true, monochrome: true, noTexture: true });
    // 와이어프레임만 음영 계열 밖에서 외곽선을 그린다
    expect(MODES.filter((m) => drawsProfiles(m) && !isShadedLike(m))).toEqual(['wireframe']);
  });
});
