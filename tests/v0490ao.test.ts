/**
 * 0.49.0 주변 가림(SSAO — SKP 45차 요청, 기본 꺼짐): 순수 aoParams·aoSize, 가짜 WebGL 뷰어에서
 * 끄면(기본·켰다 끈 뒤·세기 0) 그리기 기록이 켜 본 적 없는 뷰어와 바이트까지 같고, 켜면 불투명 그물 깊이(그리기 수에 세지 않음)와 화면 전체 삼각형 넷
 * (가림·가로 흐림·세로 흐림·곱하기)을 불투명 면 뒤·선 앞에 더 그린다. 음영 계열(음영·음영+윤곽·단색·무늬 없음)만 — 와이어프레임·X-ray·숨은 선·반투명 그물만이면 없음.
 * 외곽선을 켜면 같은 깊이 그림을 다시 그리지 않는다. 균일 변수(가림 거리 기본 = 보이는 범위 대각선의 3%·세기·평행 투영), 셰이더 원문 확인, dispose
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type FakeElement, installDom } from './fakedom';
import type { DrawEntry, FakeGL } from './fakegl';
import { AO_MAX_INTENSITY, AO_MAX_PIXELS, AO_RADIUS_RATIO, AO_SAMPLES, aoParams, aoSize } from '../src/ao';
import { boxSphere, sceneBounds } from '../src/bounds';
import * as entry from '../src/index';
import { AO_BLUR_FS, AO_FS, AO_MIX_FS } from '../src/shaders';
import { boxMesh } from '../src/synth';
import type { Scene3d } from '../src/types';
import { Viewer3d } from '../src/viewer';

describe('순수: aoParams·aoSize', () => {
  it('끔(null·undefined·false·세기 0 이하), 기본(true·{}) = 대각선의 3%·세기 1, 거리·세기 읽기', () => {
    for (const o of [null, undefined, false, { intensity: 0 }, { intensity: -1 }]) expect(aoParams(o, 100)).toBeNull();
    expect(AO_RADIUS_RATIO).toBe(0.03);
    expect(aoParams(true, 100)).toEqual({ radius: 3, intensity: 1 });
    expect(aoParams({}, 250)).toEqual({ radius: 7.5, intensity: 1 });
    expect(aoParams({ radius: 7, intensity: 2 }, 100)).toEqual({ radius: 7, intensity: 2 });
    // 이상한 거리는 기본, 세기는 0~4로 자르고 유한하지 않으면 1
    for (const r of [0, -3, NaN, Infinity]) expect(aoParams({ radius: r }, 100)!.radius).toBe(3);
    expect(aoParams({ intensity: 99 }, 100)!.intensity).toBe(AO_MAX_INTENSITY);
    expect(aoParams({ intensity: NaN }, 100)!.intensity).toBe(1);
    // 빈 범위(대각선 0·NaN)는 1로 본다
    expect(aoParams({}, 0)!.radius).toBe(0.03);
    expect(aoParams({}, NaN)!.radius).toBe(0.03);
  });

  it('반 해상도는 올림 반(1 이상), 입구에서 내보낸다, 셰이더 상수가 순수 상수와 같다', () => {
    expect([aoSize(800, 600), aoSize(801, 599), aoSize(1, 1), aoSize(0, 0)]).toEqual([[400, 300], [401, 300], [1, 1], [1, 1]]);
    expect(entry.aoParams).toBe(aoParams);
    expect(entry.aoSize).toBe(aoSize);
    expect(AO_FS).toContain(`for (int i = 0; i < ${AO_SAMPLES}; i++)`);
    expect(AO_FS).toContain(`sum / ${AO_SAMPLES}.0`);
    expect(AO_MAX_PIXELS).toBeGreaterThan(0);
    // 곱하기는 깊이 그림 값으로 깊이를 두어 그림 깊이와 견준다(잘린 면 채우기에 곱하지 않게), 흐리기는 가림 거리로 이웃을 거른다
    expect(AO_MIX_FS).toContain('gl_FragDepth = d;');
    expect(AO_BLUR_FS).toContain('/ u_radius');
  });
});

// ───────────── 뷰어(가짜 WebGL) ─────────────
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

/** 바닥 판 위 상자 둘(구석이 있는 장면) + 반투명 상자 하나 + 선 하나 */
function scene(): Scene3d {
  return {
    name: 'ao',
    units: 'mm',
    meshes: [
      boxMesh('바닥', [-50, -50, -2], [50, 50, 0], [0.8, 0.8, 0.8, 1]),
      boxMesh('상자', [-20, -20, 0], [0, 0, 20], [0.6, 0.7, 0.8, 1]),
      boxMesh('기둥', [10, 10, 0], [16, 16, 40], [0.8, 0.6, 0.5, 1]),
      boxMesh('유리', [20, -40, 0], [40, -20, 10], [0.5, 0.8, 1, 0.4]),
    ],
    lines: [{ id: '선', positions: new Float32Array([-50, 0, 30, 50, 0, 30]), color: [1, 1, 0, 1] }],
  };
}
const OPAQUE = 3;
type W = { v: Viewer3d; gl: FakeGL };
function view(sc: Scene3d = scene()): W {
  const v = new Viewer3d(dom.host() as unknown as HTMLElement, { animate: false, keyboard: false });
  views.push(v);
  const gl = (v.canvas as unknown as FakeElement).gl!;
  gl.logDraws = true;
  v.setScene(sc);
  return { v, gl };
}
/**
 * 그림 한 장의 그리기 기록. 가짜 문맥의 GL 상수는 처음 읽은 차례대로 수를 매기므로(주변 가림이 R8·RED 같은 상수를 먼저 읽으면 LINES의 수가 달라진다)
 * 그리기 인자의 상수(그리기 꼴·색인 꼴)는 이름으로 바꿔 견준다
 */
function frame(w: W): DrawEntry[] {
  w.gl.draws = [];
  w.v.renderNow();
  return w.gl.draws.map((e) => ({ ...e, args: e.args.map((x, i) => (i === 0 || (e.op.startsWith('drawElements') && i === 2) ? (w.gl.nameOf(x) as unknown as number) : x)) }));
}
const json = (d: DrawEntry[]): string => JSON.stringify(d);
/** 화면 전체 삼각형(속성 없는 drawArrays 0, 3) */
const fullScreen = (d: DrawEntry[]): DrawEntry[] => d.filter((e) => e.op === 'drawArrays' && e.args[1] === 0 && e.args[2] === 3 && e.attribs.length === 0);
const uni = (e: DrawEntry, name: string): unknown[] | undefined => new Map(JSON.parse(e.uniforms) as [string, unknown[]][]).get(name);
/** 가림 단계(그 균일 변수가 있는 그리기) */
const aoPass = (d: DrawEntry[]): DrawEntry | undefined => d.find((e) => uni(e, 'u_pxPerUnit') !== undefined);

describe('뷰어: 주변 가림', () => {
  it('끄면 그리기 기록이 켜 본 적 없는 뷰어와 같다(기본·켰다 끈 뒤·false·세기 0), 읽기 ambientOcclusion', () => {
    const ref = view();
    const a = json(frame(ref));
    const w = view();
    expect(w.v.ambientOcclusion).toBeNull();
    expect(json(frame(w))).toBe(a);
    w.v.setAmbientOcclusion({ radius: 4 });
    expect(w.v.ambientOcclusion).toEqual({ radius: 4 });
    expect(json(frame(w))).not.toBe(a);
    for (const off of [null, false, { intensity: 0 }] as const) {
      w.v.setAmbientOcclusion(true);
      frame(w);
      w.v.setAmbientOcclusion(off);
      expect(json(frame(w)), JSON.stringify(off)).toBe(a);
    }
    // 읽기는 사본
    w.v.setAmbientOcclusion({ intensity: 2 });
    const o = w.v.ambientOcclusion!;
    o.intensity = 3;
    expect(w.v.ambientOcclusion).toEqual({ intensity: 2 });
  });

  it('켜면 불투명 그물 깊이(그물 셋)와 화면 전체 넷을 더 그리고 그 밖 그리기는 그대로 — 넷은 불투명 면 뒤·선 앞, 그리기 수는 넷만 는다', () => {
    const off = view(), on = view();
    on.v.setAmbientOcclusion({});
    const a = frame(off), b = frame(on);
    expect(b.length).toBe(a.length + OPAQUE + 4);
    expect(on.v.stats.drawCalls).toBe(off.v.stats.drawCalls + 4);
    // 가림 단계 앞 셋은 불투명 그물 깊이(면 그리기와 같은 프로그램·값 — 색만 쓰지 않는다), 가림부터 넷이 화면 전체 — 둘을 빼면 끈 그리기와 같은 차례
    const i0 = b.indexOf(aoPass(b)!);
    expect(fullScreen(b.slice(i0, i0 + 4)).length).toBe(4);
    expect(json(b.slice(i0 - OPAQUE, i0))).toBe(json(a.slice(0, OPAQUE)));
    expect(json([...b.slice(0, i0 - OPAQUE), ...b.slice(i0 + 4)])).toBe(json(a));
    // 넷은 불투명 면 셋(바닥·상자·기둥 — 끈 그리기의 처음 셋) 뒤, 반투명 상자·선 앞
    expect(i0 - OPAQUE).toBe(OPAQUE);
    const lineAt = b.findIndex((e) => JSON.stringify(uni(e, 'u_color')) === JSON.stringify([1, 1, 0, 1]));
    const glassAt = b.findIndex((e) => JSON.stringify(uni(e, 'u_color')) === JSON.stringify([0.5, 0.8, 1, 0.4]));
    for (const at of [lineAt, glassAt]) if (at >= 0) expect(at).toBeGreaterThan(i0 + 3);
  });

  it('가림 단계 균일 변수: 기본 거리 = 보이는 범위 대각선의 3%, 세기, 원근·평행, 화면 반지름 한도', () => {
    const w = view();
    w.v.setAmbientOcclusion({});
    const diag = 2 * boxSphere(sceneBounds(scene())).radius;
    let p = aoPass(frame(w))!;
    expect(uni(p, 'u_radius')![0]).toBeCloseTo(diag * 0.03, 9);
    expect(uni(p, 'u_intensity')).toEqual([1]);
    expect(uni(p, 'u_ortho')).toEqual([0]);
    expect(uni(p, 'u_maxPx')).toEqual([AO_MAX_PIXELS]);
    w.v.setAmbientOcclusion({ radius: 5, intensity: 2.5 });
    w.v.setProjection('orthographic');
    p = aoPass(frame(w))!;
    expect([uni(p, 'u_radius'), uni(p, 'u_intensity'), uni(p, 'u_ortho')]).toEqual([[5], [2.5], [1]]);
    // 숨겨 보이는 범위가 바뀌면 기본 거리도 따른다
    w.v.setAmbientOcclusion({});
    w.v.setItemVisible('바닥', false);
    const small = 2 * boxSphere(sceneBounds({ ...scene(), meshes: scene().meshes.slice(1) })).radius;
    expect(uni(aoPass(frame(w))!, 'u_radius')![0]).toBeCloseTo(small * 0.03, 9);
  });

  it('음영 계열만: 음영·단색·무늬 없음은 가리고, 와이어프레임·X-ray·숨은 선은 끈 것과 같다', () => {
    for (const mode of ['shaded', 'shadedEdges', 'monochrome', 'noTexture', 'wireframe', 'xray', 'hiddenLine'] as const) {
      const off = view(), on = view();
      off.v.setRenderMode(mode);
      on.v.setRenderMode(mode);
      on.v.setAmbientOcclusion({});
      const a = frame(off), b = frame(on);
      if (['wireframe', 'xray', 'hiddenLine'].includes(mode)) expect(json(b), mode).toBe(json(a));
      else expect(b.length, mode).toBe(a.length + OPAQUE + 4);
    }
  });

  it('반투명 그물만 보이면 그리지 않는다', () => {
    const off = view(), on = view();
    for (const w of [off, on]) for (const id of ['바닥', '상자', '기둥']) w.v.setItemVisible(id, false);
    on.v.setAmbientOcclusion({});
    expect(json(frame(on))).toBe(json(frame(off)));
  });

  it('외곽선을 켜면 같은 깊이 그림을 다시 그리지 않는다(깊이 그리기는 한 번 — 더한 것은 넷뿐)', () => {
    const off = view(), on = view();
    for (const w of [off, on]) w.v.setRenderOptions({ profiles: { width: 1 } });
    on.v.setAmbientOcclusion({});
    const a = frame(off), b = frame(on);
    expect(b.length).toBe(a.length + 4);
    expect(on.v.stats.drawCalls).toBe(off.v.stats.drawCalls + 4);
  });

  it('그림 저장(renderImage)도 같은 길로 가리고, dispose 뒤에 바꿔도 던지지 않는다', () => {
    // 화면 밖 그리기(renderPixels)가 만드는 ImageData — Node에는 없다(v0330snaplabel과 같다)
    vi.stubGlobal(
      'ImageData',
      class {
        data: Uint8ClampedArray;
        constructor(
          readonly width: number,
          readonly height: number,
        ) {
          this.data = new Uint8ClampedArray(width * height * 4);
        }
      },
    );
    const w = view();
    w.v.setAmbientOcclusion({});
    w.gl.draws = [];
    w.v.renderImage({ scale: 2 });
    vi.unstubAllGlobals();
    expect(aoPass(w.gl.draws)).toBeTruthy();
    w.v.dispose();
    expect(() => w.v.setAmbientOcclusion(null)).not.toThrow();
    expect(() => w.v.setAmbientOcclusion({})).not.toThrow();
  });
});
