/**
 * 0.50.0 주변 가림 다듬기: 카메라를 옮기는 동안(끌기·휠·flyTo) moving 선택 — 'keep'(기본·0.49.0과 같은 그리기), 'off'(그동안 가림 없음 — 끈 뷰어와 같은 그리기,
 * 그림은 놓지 않고 멈춘 첫 그림부터 다시), 'low'(가림 단계 ¼ 해상도 그림 — 반 해상도 그림과 따로 두어 다시 만들지 않는다)
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { AO_LOW_DIV, aoParams, aoSize } from '../src/ao';
import * as entry from '../src/index';
import { boxMesh } from '../src/synth';
import type { AmbientOcclusionOptions } from '../src/ao';
import type { Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

describe('순수: aoParams moving', () => {
  it("멈춘 그림·'keep'·없음은 0.49.0과 같은 값, 움직이는 동안 'off'는 hold·'low'는 ¼", () => {
    for (const o of [true, {}, { moving: 'keep' as const }, { moving: 'off' as const }, { moving: 'low' as const }]) expect(aoParams(o, 100)).toEqual({ radius: 3, intensity: 1 });
    for (const o of [true, {}, { moving: 'keep' as const }]) expect(aoParams(o, 100, true)).toEqual({ radius: 3, intensity: 1 });
    expect(aoParams({ moving: 'off', radius: 5 }, 100, true)).toEqual({ radius: 5, intensity: 1, hold: true });
    expect(aoParams({ moving: 'low', intensity: 2 }, 100, true)).toEqual({ radius: 3, intensity: 2, div: 4 });
    // 세기 0은 움직여도 끈 것
    expect(aoParams({ moving: 'low', intensity: 0 }, 100, true)).toBeNull();
    expect(AO_LOW_DIV).toBe(4);
    expect(aoSize(801, 599, 4)).toEqual([201, 150]);
    expect(aoSize(801, 599)).toEqual([401, 300]);
    expect(entry.AO_LOW_DIV).toBe(4);
  });
});

let dom: ReturnType<typeof installDom>;
const views: Viewer3d[] = [];
beforeAll(() => {
  dom = installDom();
});
afterEach(() => {
  for (const v of views) v.dispose();
  views.length = 0;
});
afterAll(() => dom.restore());

function scene(): Scene3d {
  return {
    name: 'ao',
    units: 'mm',
    meshes: [boxMesh('바닥', [-50, -50, -2], [50, 50, 0], [0.8, 0.8, 0.8, 1]), boxMesh('상자', [-20, -20, 0], [0, 0, 20], [0.6, 0.7, 0.8, 1])],
    lines: [{ id: '선', positions: new Float32Array([-50, 0, 30, 50, 0, 30]), color: [1, 1, 0, 1] }],
  };
}
type W = { v: Viewer3d; gl: FakeGL; canvas: FakeElement };
function view(ao: AmbientOcclusionOptions | null): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  const canvas = v.canvas as unknown as FakeElement;
  const gl = canvas.gl!;
  gl.logDraws = true;
  v.setScene(scene());
  v.setAmbientOcclusion(ao);
  return { v, gl, canvas };
}
function frame(w: W): DrawEntry[] {
  w.gl.draws = [];
  w.v.renderNow();
  return w.gl.draws.map((e) => ({ ...e, args: e.args.map((x, i) => (i === 0 || (e.op.startsWith('drawElements') && i === 2) ? (w.gl.nameOf(x) as unknown as number) : x)) }));
}
const json = (d: DrawEntry[]): string => JSON.stringify(d);
const uni = (e: DrawEntry, name: string): unknown[] | undefined => new Map(JSON.parse(e.uniforms) as [string, unknown[]][]).get(name);
const aoPasses = (d: DrawEntry[]): number => d.filter((e) => uni(e, 'u_pxPerUnit') !== undefined).length;
const MODS = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
const ptr = (w: W, type: string, x: number, y: number, buttons: number): void =>
  w.canvas.fire(type, { clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 0, buttons, ...MODS });
/** 끌기 시작(끌기 시작 거리를 넘겨 궤도 회전 중으로) */
const dragStart = (w: W): void => {
  ptr(w, 'pointerdown', 300, 300, 1);
  ptr(w, 'pointermove', 330, 310, 1);
  ptr(w, 'pointermove', 360, 320, 1);
};
const dragEnd = (w: W): void => ptr(w, 'pointerup', 360, 320, 0);
/** 9인자 texImage2D로 크기만 잡은 R8 그림들의 [가로, 세로] */
const sizes = (gl: FakeGL): string[] => gl.textures.filter((t) => !t.deleted && t.w).map((t) => `${t.w}x${t.h}`);

describe('뷰어: 움직이는 동안 주변 가림', () => {
  it("'keep'·없음: 끌기 중 그림이 0.49.0처럼 가림을 그린다(두 뷰어 그리기 기록 같음)", () => {
    const a = view({}), b = view({ moving: 'keep' });
    for (const w of [a, b]) dragStart(w);
    const fa = frame(a), fb = frame(b);
    expect(aoPasses(fa)).toBe(1);
    expect(json(fb)).toBe(json(fa));
  });

  it("'off': 끌기 중 그림은 가림을 끈 뷰어와 같은 그리기(깊이 그리기·화면 넷 없음), 놓은 첫 그림부터 다시 — 가림 그림은 다시 만들지 않는다", () => {
    const w = view({ moving: 'off' }), ref = view(null);
    const still = frame(w);
    expect(aoPasses(still)).toBe(1);
    const made = w.gl.textures.length;
    dragStart(w);
    dragStart(ref);
    const moving = frame(w);
    expect(aoPasses(moving)).toBe(0);
    expect(json(moving)).toBe(json(frame(ref)));
    dragEnd(w);
    const after = frame(w);
    expect(aoPasses(after)).toBe(1);
    expect(w.gl.textures.length).toBe(made);
    expect(w.gl.textures.filter((t) => t.deleted).length).toBe(0);
  });

  it("'low': 끌기 중 가림 단계는 ¼ 해상도 그림에, 놓으면 반 해상도 그림으로(둘 다 남아 다시 만들지 않는다) — 그 밖 그리기 차례는 같다", () => {
    const w = view({ moving: 'low' }), keep = view({});
    frame(w);
    dragStart(w);
    dragStart(keep);
    const lo = frame(w), hi = frame(keep);
    expect(aoPasses(lo)).toBe(1);
    // 가림 단계·흐림 균일 변수만 다르고(흐림 걸음이 ¼ 그림 화소) 그리기 수·차례는 같다
    expect(lo.length).toBe(hi.length);
    expect(lo.map((e) => e.op + e.prog)).toEqual(hi.map((e) => e.op + e.prog));
    const W0 = w.gl.canvas.width, H0 = w.gl.canvas.height;
    const [hw, hh] = aoSize(W0, H0), [qw, qh] = aoSize(W0, H0, 4);
    expect(sizes(w.gl).filter((s) => s === `${qw}x${qh}`).length).toBe(2);
    expect(sizes(w.gl).filter((s) => s === `${hw}x${hh}`).length).toBe(2);
    dragEnd(w);
    const made = w.gl.textures.length;
    frame(w);
    dragStart(w);
    frame(w);
    dragEnd(w);
    frame(w);
    expect(w.gl.textures.length).toBe(made);
    // 끄면 둘 다 놓는다
    w.v.setAmbientOcclusion(null);
    frame(w);
    expect(sizes(w.gl).filter((s) => s === `${qw}x${qh}` || s === `${hw}x${hh}`)).toEqual([]);
  });

  it("flyTo로 옮기는 동안도 움직임이다('off' — 끝 자리 그림부터 가림)", () => {
    const w = view({ moving: 'off' });
    w.v.setAnimate(true);
    const c = w.v.getCamera();
    void w.v.flyTo({ ...c, yaw: c.yaw + 1 }, true, { duration: 60_000 });
    expect(aoPasses(frame(w))).toBe(0);
    // 움직임을 끝 자리로 마친다(setAnimate(false) — 0.48.0)
    w.v.setAnimate(false);
    expect(aoPasses(frame(w))).toBe(1);
  });
});
