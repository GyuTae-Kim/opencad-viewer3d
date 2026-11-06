/**
 * 0.47.0 가려진 앱 측정 덧그림 글상자의 글 대비(WCAG 1.4.3): 상자 바탕·글은 불투명하게 두고 가려짐은 점선 테두리로.
 * - 순수 annotationLabelLook: 보임 = 실선, 가려짐 = 점선, hidden 0 = 그리지 않음, hidden 1 = 보이는 것과 같음
 * - 대비 계산(두 테마 · 테마 바탕과 검정·흰색 바탕): 0.46.0(불투명도 max(hidden, 0.5))은 4.5:1 아래, 0.47.0은 모두 4.5:1 이상
 * - 뷰어(가짜 DOM — 2D 호출 기록): 가려진 글상자는 globalAlpha 1로 바탕·글을 칠하고 테두리만 [4, 3] 점선, 보이는 글상자는 0.46.0과 같은 호출
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDom } from './fakedom';
import { HIDDEN_LABEL_DASH, annotationLabelLook } from '../src/annotate';
import { boxMesh } from '../src/synth';
import { DARK_THEME, LIGHT_THEME, type Viewer3dTheme, contrastRatio, overBackground, parseColor } from '../src/theme';
import type { Rgba, Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

describe('annotationLabelLook(0.47.0 — 가려진 글상자 꼴)', () => {
  it('보이면 실선, 가려졌으면 점선, hidden 0이면 그리지 않고 hidden 1이면 보이는 것과 같다', () => {
    expect(annotationLabelLook(false, 0.35)).toEqual({ dash: [] });
    expect(annotationLabelLook(false, 0)).toEqual({ dash: [] });
    expect(annotationLabelLook(true, 0.35)).toEqual({ dash: [4, 3] });
    expect(annotationLabelLook(true, 0.6)!.dash).toBe(HIDDEN_LABEL_DASH);
    expect(annotationLabelLook(true, 0)).toBeNull();
    expect(annotationLabelLook(true, Number.NaN)).toBeNull();
    expect(annotationLabelLook(true, 1)).toEqual({ dash: [] });
  });
});

// ───────────── 대비 계산 ─────────────
const rgb = (s: string): Rgba => parseColor(s)!;
/** 글상자 바탕(테마 textBg × 불투명도)을 backdrop 위에 얹은 색과, 그 위에 글(테마 text × 불투명도)을 얹은 색의 대비 */
function labelContrast(th: Viewer3dTheme, alpha: number, backdrop: Rgba): number {
  const bg = rgb(th.textBg);
  const box = overBackground([bg[0], bg[1], bg[2], bg[3] * alpha], backdrop);
  const tx = rgb(th.text);
  return contrastRatio([tx[0], tx[1], tx[2], tx[3] * alpha], box);
}
const THEMES: [string, Viewer3dTheme][] = [
  ['dark', DARK_THEME],
  ['light', LIGHT_THEME],
];
const BACKDROPS = (th: Viewer3dTheme): [string, Rgba][] => [
  ['theme', rgb(th.background)],
  ['black', [0, 0, 0, 1]],
  ['white', [1, 1, 1, 1]],
  ['grey', [0.5, 0.5, 0.5, 1]],
];

describe('가려진 글상자 글 대비(테마 바탕·검정·흰색·회색 바탕 위)', () => {
  it('0.46.0(기본 hidden 0.35 → 불투명도 0.5)은 테마 바탕에서 두 테마 모두 4.5:1 아래(앱 보고 밝게 3.1·어둡게 4.4와 같은 범위)', () => {
    const old = THEMES.map(([, th]) => labelContrast(th, Math.max(0.35, 0.5), rgb(th.background)));
    expect(old[0]).toBeGreaterThan(4);
    expect(old[0]).toBeLessThan(4.5);
    expect(old[1]).toBeGreaterThan(3);
    expect(old[1]).toBeLessThan(3.6);
  });

  it('0.47.0(불투명)은 두 테마·네 바탕 모두 4.5:1 이상 — 보이는 글상자와 같은 값', () => {
    for (const [, th] of THEMES)
      for (const [, bd] of BACKDROPS(th)) {
        const r = labelContrast(th, 1, bd);
        expect(r).toBeGreaterThanOrEqual(4.5);
      }
  });

  it('점선 테두리(측정 색)는 글상자 바탕과 3:1 이상(WCAG 1.4.11 — 테마 바탕 위)', () => {
    for (const [, th] of THEMES) {
      const bg = rgb(th.textBg);
      const box = overBackground(bg, rgb(th.background));
      expect(contrastRatio(rgb(th.measure), box)).toBeGreaterThanOrEqual(3);
    }
  });
});

// ───────────── 뷰어 ─────────────
let dom: ReturnType<typeof installDom>;
beforeAll(() => {
  dom = installDom();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterAll(() => {
  vi.useRealTimers();
  dom.restore();
});

interface Op {
  op: 'fillText' | 'stroke' | 'fill';
  alpha: number;
  dash: string;
  style: string;
  text?: string;
}

/** 덧그림 2D 문맥을 호출 기록 대리로 바꾼다(가짜 2D는 그리지 않는다) */
function record(v: Viewer3d): Op[] {
  const ops: Op[] = [];
  const holder = v as unknown as { octx: CanvasRenderingContext2D };
  const real = holder.octx as unknown as Record<string | symbol, unknown>;
  let dash = '';
  holder.octx = new Proxy(real, {
    get: (t, k) => {
      if (k === 'setLineDash') return (d: number[]) => void (dash = d.join(','));
      if (k === 'fillText') return (s: string) => void ops.push({ op: 'fillText', alpha: t.globalAlpha as number, dash, style: String(t.fillStyle), text: s });
      if (k === 'stroke') return () => void ops.push({ op: 'stroke', alpha: t.globalAlpha as number, dash, style: String(t.strokeStyle) });
      if (k === 'fill') return () => void ops.push({ op: 'fill', alpha: t.globalAlpha as number, dash, style: String(t.fillStyle) });
      if (k === 'save' || k === 'restore') return () => void (dash = k === 'restore' ? '' : dash);
      return t[k];
    },
    set: (t, k, val) => ((t[k] = val), true),
  }) as unknown as CanvasRenderingContext2D;
  return ops;
}

describe('Viewer3d: 가려진 덧그림 글상자(0.47.0)', () => {
  const box = boxMesh('상자', [0, 0, 0], [100, 60, 30], [0.6, 0.65, 0.7, 1]);
  const sc: Scene3d = { name: 'h', units: 'mm', meshes: [box], lines: [], points: [] };
  /** 상자 안(가려짐)과 상자 위(보임) 거리 덧그림 — 글은 앱이 준다 */
  const HID = { kind: 'distance' as const, a: [20, 30, 15], b: [80, 30, 15], label: '안' };
  const VIS = { kind: 'distance' as const, a: [0, 0, 60], b: [100, 0, 60], label: '위' };
  function make(theme: 'dark' | 'light' = 'dark'): Viewer3d {
    const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false, theme });
    v.setScene(sc);
    v.setView('seIso', false);
    v.fit(false);
    // 덧그림 가림은 이미 만든 BVH만 쓴다(쉬는 틈에 만든다 — 가짜 시계를 돌린다)
    vi.advanceTimersByTime(2000);
    v.renderNow();
    return v;
  }
  const labelOps = (ops: Op[], text: string): Op[] => {
    // 글상자 하나 = 바탕 fill → 테두리 stroke → 글 fillText(점 표식 fill·stroke 뒤)
    const i = ops.findIndex((o) => o.op === 'fillText' && o.text === text);
    expect(i).toBeGreaterThanOrEqual(2);
    return ops.slice(i - 2, i + 1);
  };

  it('기본(hidden 0.35): 가려진 글상자는 불투명 바탕·글에 [4, 3] 점선 테두리, 보이는 글상자는 실선(0.46.0과 같은 호출)', () => {
    for (const theme of ['dark', 'light'] as const) {
      const v = make(theme);
      v.setAnnotations([HID, VIS]);
      const ops = record(v);
      v.renderNow();
      const th = theme === 'dark' ? DARK_THEME : LIGHT_THEME;
      const [hf, hs, ht] = labelOps(ops, '안');
      expect(hf).toMatchObject({ op: 'fill', alpha: 1, style: th.textBg });
      expect(hs).toMatchObject({ op: 'stroke', alpha: 1, dash: '4,3', style: th.measure });
      expect(ht).toMatchObject({ op: 'fillText', alpha: 1, dash: '', style: th.text });
      const [vf, vs, vt] = labelOps(ops, '위');
      expect(vf).toMatchObject({ op: 'fill', alpha: 1, style: th.textBg });
      expect(vs).toMatchObject({ op: 'stroke', alpha: 1, dash: '', style: th.measure });
      expect(vt).toMatchObject({ op: 'fillText', alpha: 1, style: th.text });
      // 가려진 점 표식은 그대로 흐리게(글이 아니다)
      const dots = ops.filter((o) => o.op === 'fill' && o.style === th.measure);
      expect(dots.map((o) => o.alpha).sort()).toEqual([0.35, 0.35, 1, 1]);
      v.dispose();
    }
  });

  it('hidden 1이면 가려진 글상자도 실선(보이는 것과 같다), hidden 0이면 그리지 않는다(0.46.0 그대로)', () => {
    const v = make();
    v.setAnnotations([HID, VIS], { hidden: 1 });
    let ops = record(v);
    v.renderNow();
    expect(labelOps(ops, '안')[1]).toMatchObject({ op: 'stroke', alpha: 1, dash: '' });
    v.setAnnotations([HID, VIS], { hidden: 0 });
    ops = record(v);
    v.renderNow();
    expect(ops.some((o) => o.text === '안')).toBe(false);
    expect(ops.some((o) => o.text === '위')).toBe(true);
    v.dispose();
  });

  it('선 모드(가림을 따지지 않는다)에서는 모두 실선', () => {
    const v = make();
    v.setRenderMode('wireframe');
    v.setAnnotations([HID, VIS]);
    const ops = record(v);
    v.renderNow();
    expect(labelOps(ops, '안')[1]).toMatchObject({ dash: '' });
    expect(labelOps(ops, '위')[1]).toMatchObject({ dash: '' });
    v.dispose();
  });
});
