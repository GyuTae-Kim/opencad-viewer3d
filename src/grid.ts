/**
 * 바닥 격자(XY 면): 범위에 맞춘 간격(1·2·5×10ⁿ), 큰 칸·작은 칸, 원점을 지나는 X·Y축 선.
 * 0.101.0: X·Y축 선을 앱이 준 좌표축 틀(옮기거나 돌린 그리기 축)의 원점·방향으로도 낸다.
 */
import type { Box3 } from './types';
import { boxIsEmpty, emptyBox, okCoord } from './bounds';
import { type V3, dot, niceStep } from './math';

/**
 * 0.101.0 좌표축 틀(Viewer3d.setAxesFrame — 앱의 그리기 축): 세계 좌표 원점과 X·Y 방향(길이는 상관없다). Z는 X × Y(오른손)라 받지 않는다.
 * 배열·형식 배열 모두(앞 세 값만 읽는다)
 */
export interface AxesFrame {
  origin: ArrayLike<number>;
  x: ArrayLike<number>;
  y: ArrayLike<number>;
}

/** 0.101.0 단위 방향으로 맞춘 좌표축 틀(axesFrameOf — y는 x에 직교) */
export interface UnitAxesFrame {
  origin: V3;
  x: V3;
  y: V3;
}

/** 0.101.0 x·y 사잇각 사인이 이보다 작으면(나란함) 좌표축 틀이 아니다 */
export const AXES_FRAME_MIN_SIN = 1e-6;

/** 유한한 수 셋(lim이면 좌표 한도 안 — 원점)인 배열·형식 배열의 앞 세 값, 아니면 null(글·수로 읽히는 글도 아니다) */
function vec3Of(p: unknown, lim: boolean): V3 | null {
  if (p == null || typeof p !== 'object') return null;
  const a = p as ArrayLike<unknown>;
  if (!(a.length >= 3)) return null;
  const v = [a[0], a[1], a[2]];
  for (const c of v) if (typeof c !== 'number' || !Number.isFinite(c) || (lim && !okCoord(c))) return null;
  return v as V3;
}

/**
 * 0.101.0 좌표축 틀을 쓸 수 있으면 단위 방향 틀로(x는 그 방향, y는 x에 직교로 — 그람-슈미트), 아니면 null:
 * 객체가 아님, 유한한 수 셋이 아닌 원점·방향(원점은 좌표 한도 안), 길이 0이거나 넘치는 방향, x와 나란한 y(사잇각 사인 AXES_FRAME_MIN_SIN 아래)
 */
export function axesFrameOf(f: unknown): UnitAxesFrame | null {
  if (f == null || typeof f !== 'object') return null;
  const r = f as { origin?: unknown; x?: unknown; y?: unknown };
  const o = vec3Of(r.origin, true), x = vec3Of(r.x, false), y = vec3Of(r.y, false);
  if (!o || !x || !y) return null;
  const xl = Math.hypot(x[0], x[1], x[2]), yl = Math.hypot(y[0], y[1], y[2]);
  if (!(xl > 0 && xl < Infinity && yl > 0 && yl < Infinity)) return null;
  const ux: V3 = [x[0] / xl, x[1] / xl, x[2] / xl];
  const uy: V3 = [y[0] / yl, y[1] / yl, y[2] / yl];
  const d = dot(ux, uy);
  const py: V3 = [uy[0] - d * ux[0], uy[1] - d * ux[1], uy[2] - d * ux[2]];
  const pl = Math.hypot(py[0], py[1], py[2]);
  if (!(pl >= AXES_FRAME_MIN_SIN)) return null;
  return { origin: o, x: ux, y: [py[0] / pl, py[1] / pl, py[2] / pl] };
}

/**
 * 0.101.0 틀 축선 하나(세계 xyz,xyz — 없으면 빈 배열): 점 o를 지나는 단위 방향 d의 직선을 격자 사각 기둥(x0~x1·y0~y1)과 o 높이 ± 격자 한 변으로 자른 선분.
 * 끝점은 그 상자 안으로 자른다(셈 끝자리가 상자를 넘지 않게). 세계 축을 격자 높이에 주면 0.100.0 축선과 같은 선분, 기둥을 지나지 않으면 없음(0.100.0 규칙)
 */
function frameAxisLine(g: GridSpec, o: V3, d: V3): number[] {
  const H = Math.max(g.x1 - g.x0, g.y1 - g.y0);
  const lo = [g.x0, g.y0, o[2] - H], hi = [g.x1, g.y1, o[2] + H];
  let t0 = -Infinity, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    if (d[k] === 0) {
      if (!(o[k] >= lo[k]! && o[k] <= hi[k]!)) return [];
      continue;
    }
    const a = (lo[k]! - o[k]) / d[k], b = (hi[k]! - o[k]) / d[k];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (!(t1 > t0)) return [];
  const out: number[] = [];
  for (const t of [t0, t1]) for (let k = 0; k < 3; k++) out.push(Math.min(hi[k]!, Math.max(lo[k]!, o[k] + t * d[k])));
  return out;
}

/** 0.101.0 단위 좌표축 틀의 X·Y축선 세계 끝점(격자 g로 자름 — frameAxisLine, 없는 축선은 빈 배열) */
export function axesFrameLines(g: GridSpec, f: UnitAxesFrame): { x: number[]; y: number[] } {
  return { x: frameAxisLine(g, f.origin, f.x), y: frameAxisLine(g, f.origin, f.y) };
}

/** 격자를 놓을 높이: 'min' = 범위 바닥, 'zero' = Z 0, 수 = 그 높이 */
export type GridZ = 'min' | 'zero' | number;

export interface GridSpec {
  step: number;
  minorStep: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z: number;
}

export function gridSpec(box: Box3, zMode: GridZ = 'min', cells = 10): GridSpec {
  // 0.94.0 상자가 아니면(null·글·수·min·max가 없는 객체) 빈 범위(원점 둘레), 이름·수가 아닌 높이(null·글·객체)는 주지 않은 것('min') — 0.93.0은 TypeError·그 높이를 그대로
  if (!box?.min || !box.max) box = emptyBox();
  if (zMode !== 'min' && zMode !== 'zero' && typeof zMode !== 'number') zMode = 'min';
  let x0 = -10, x1 = 10, y0 = -10, y1 = 10, zMin = 0;
  if (!boxIsEmpty(box)) {
    x0 = box.min[0];
    x1 = box.max[0];
    y0 = box.min[1];
    y1 = box.max[1];
    zMin = box.min[2];
  }
  let ext = Math.max(x1 - x0, y1 - y0);
  if (!(ext > 0)) ext = boxIsEmpty(box) ? 20 : Math.max(box.max[2] - box.min[2], 1);
  const step = niceStep(ext / cells);
  const e = Math.floor(Math.log10(step) + 1e-9);
  const mant = Math.round(step / 10 ** e);
  const minorStep = step / (mant === 2 ? 4 : 5);
  const pad = Math.max(ext * 0.15, step);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const half = Math.max(x1 - x0, y1 - y0, ext) / 2 + pad;
  const z = zMode === 'min' ? zMin : zMode === 'zero' ? 0 : zMode;
  return {
    step,
    minorStep,
    x0: Math.floor((cx - half) / step) * step,
    x1: Math.ceil((cx + half) / step) * step,
    y0: Math.floor((cy - half) / step) * step,
    y1: Math.ceil((cy + half) / step) * step,
    z,
  };
}

export interface GridLines {
  major: Float32Array;
  minor: Float32Array;
  /** X축(y = 0) 선분, 격자 밖이면 빈 배열 */
  axisX: Float32Array;
  /** Y축(x = 0) 선분 */
  axisY: Float32Array;
}

/** 0.50.0 한 방향 격자 선 수 한도(gridSpec은 10칸 × 작은 칸 4~5 + 둘레라 백 남짓 — 이보다 많으면 범위가 깨진 것) */
export const GRID_MAX_LINES = 4096;

/**
 * 격자 선분(xyz,xyz…). origin을 주면 그 점 기준 좌표로 낸다(세계 = origin + 값 — 큰 좌표에서 float32 정밀도를 지킨다).
 * 0.101.0 frame(좌표축 틀)을 주면 X·Y축 선은 그 원점을 지나 그 방향으로(axesFrameLines — 원점 높이), 세계 원점 축 선이 없으므로 x = 0·y = 0 격자선도 낸다.
 * 쓸 수 없는 틀(axesFrameOf가 null)은 주지 않은 것과 같다
 */
export function gridLines(g: GridSpec, origin?: readonly number[] | null, frame?: AxesFrame | null): GridLines {
  // 0.94.0 명세가 없으면(null·undefined) 격자 없음 — 0.93.0은 TypeError(글·수·{}는 이미 격자 없음)
  g ??= {} as GridSpec;
  const f = frame == null ? null : axesFrameOf(frame);
  const major: number[] = [];
  const minor: number[] = [];
  const ox = origin?.[0] ?? 0, oy = origin?.[1] ?? 0, oz = origin?.[2] ?? 0;
  const X0 = g.x0 - ox, X1 = g.x1 - ox, Y0 = g.y0 - oy, Y1 = g.y1 - oy, Z = g.z - oz;
  const eps = g.minorStep * 1e-3;
  const hasX = g.y0 <= 0 && g.y1 >= 0;
  const hasY = g.x0 <= 0 && g.x1 >= 0;
  const nx = Math.round((g.x1 - g.x0) / g.minorStep);
  const ny = Math.round((g.y1 - g.y0) / g.minorStep);
  const ratio = Math.round(g.step / g.minorStep);
  // 0.50.0: 칸 수가 유한하지 않거나 터무니없이 많으면(유한하지 않은 범위·높이 — 0.49.0은 선분을 끝없이 쌓다 배열 길이 예외를 냈다) 격자 없이
  if (!(nx >= 0 && nx <= GRID_MAX_LINES && ny >= 0 && ny <= GRID_MAX_LINES && ratio >= 1) || !Number.isFinite(g.z)) {
    const none = new Float32Array(0);
    return { major: none, minor: none, axisX: none, axisY: none };
  }
  // 0.101.0 틀이 있으면 세계 원점 축 선을 그리지 않으므로 그 자리 격자선을 빼지 않는다
  const skipX = hasX && !f, skipY = hasY && !f;
  for (let i = 0; i <= nx; i++) {
    const x = g.x0 + i * g.minorStep;
    if (skipY && Math.abs(x) < eps) continue;
    const lx = origin ? X0 + i * g.minorStep : x;
    (i % ratio === 0 ? major : minor).push(lx, Y0, Z, lx, Y1, Z);
  }
  for (let j = 0; j <= ny; j++) {
    const y = g.y0 + j * g.minorStep;
    if (skipX && Math.abs(y) < eps) continue;
    const ly = origin ? Y0 + j * g.minorStep : y;
    (j % ratio === 0 ? major : minor).push(X0, ly, Z, X1, ly, Z);
  }
  if (f) {
    const { x, y } = axesFrameLines(g, f);
    const rel = (w: number[]): Float32Array => new Float32Array(w.map((v, i) => v - (i % 3 === 0 ? ox : i % 3 === 1 ? oy : oz)));
    return { major: new Float32Array(major), minor: new Float32Array(minor), axisX: rel(x), axisY: rel(y) };
  }
  return {
    major: new Float32Array(major),
    minor: new Float32Array(minor),
    axisX: new Float32Array(hasX ? [X0, -oy, Z, X1, -oy, Z] : []),
    axisY: new Float32Array(hasY ? [-ox, Y0, Z, -ox, Y1, Z] : []),
  };
}
