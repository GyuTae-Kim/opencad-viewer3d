/**
 * 뷰 큐브(오른쪽 위): 지금 카메라 방향으로 평행 투영한 정육면체.
 * 면 가운데를 누르면 그 면의 표준 뷰, 면 가장자리 띠는 모서리 뷰(두 면 사이 45°), 구석은 등각 뷰.
 * 면 글자는 그 면을 정면에서 볼 때 바로 읽히도록 면마다 (u = 화면 오른쪽, v = 화면 위) 축을 둔다.
 */
import type { CameraBasis } from './camera';
import { type V3, add, dot, normalize, scale } from './math';

export type CubeFace = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

export interface CubeFaceDef {
  name: CubeFace;
  /** 바깥 법선 */
  n: V3;
  /** 그 면의 표준 뷰에서 화면 오른쪽 */
  u: V3;
  /** 그 면의 표준 뷰에서 화면 위 */
  v: V3;
  label: string;
}

export const CUBE_FACES: readonly CubeFaceDef[] = [
  { name: 'front', n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], label: '앞' },
  { name: 'back', n: [0, 1, 0], u: [-1, 0, 0], v: [0, 0, 1], label: '뒤' },
  { name: 'right', n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], label: '오른쪽' },
  { name: 'left', n: [-1, 0, 0], u: [0, -1, 0], v: [0, 0, 1], label: '왼쪽' },
  { name: 'top', n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], label: '위' },
  { name: 'bottom', n: [0, 0, -1], u: [1, 0, 0], v: [0, -1, 0], label: '아래' },
];

/** 면 가장자리 띠 폭(면 한 변 대비) */
export const CUBE_BAND = 0.24;

/** 면 위 (s, t) ∈ [0, 1]² → 구역(−1 | 0 | 1, −1 | 0 | 1) */
export function cubeRegion(s: number, t: number, band = CUBE_BAND): [number, number] {
  const r = (x: number): number => (x < band ? -1 : x > 1 - band ? 1 : 0);
  return [r(s), r(t)];
}

/** 면과 구역 → 눈 방향(단위 벡터) */
export function cubeRegionDir(face: CubeFaceDef, ru: number, rv: number): V3 {
  return normalize(add(add(face.n, scale(face.u, ru)), scale(face.v, rv)));
}

export interface CubeLayout {
  /** 큐브 가운데(캔버스 화소) */
  cx: number;
  cy: number;
  /** 한 변 1인 정육면체의 화소 배율 */
  scale: number;
}

/** 캔버스 한 변 size에 맞는 배치 */
export function cubeLayout(size: number): CubeLayout {
  return { cx: size / 2, cy: size / 2, scale: (size / 2 - 4) / 0.95 };
}

function proj(b: CameraBasis, L: CubeLayout, p: readonly number[]): [number, number] {
  return [L.cx + dot(p, b.right) * L.scale, L.cy - dot(p, b.up) * L.scale];
}

function projLin(b: CameraBasis, L: CubeLayout, p: readonly number[]): [number, number] {
  return [dot(p, b.right) * L.scale, -dot(p, b.up) * L.scale];
}

export interface CubeHit {
  face: CubeFaceDef;
  s: number;
  t: number;
  region: [number, number];
  dir: V3;
}

/** 화면에 보이는 면(앞을 향한 면) */
export function visibleFaces(b: CameraBasis): CubeFaceDef[] {
  return CUBE_FACES.filter((f) => dot(f.n, b.back) > 0.02);
}

/**
 * 큐브 캔버스 위 점(x, y) → 누른 면·구역·눈 방향. band는 면 가장자리 띠 폭(0.44.0 — 손가락 큐브는 CUBE_TOUCH_BAND).
 * 0.119.0 snap(캔버스 화소, 기본 0 = 0.118.0): 보이는 면 어디에도 들지 않은 점이 큐브 윤곽에서 snap 안이면 가장 가까운 윤곽 점의 자리로 붙인다
 * (손가락 허용치 — 윤곽 위 점은 s나 t가 0·1이라 늘 모서리 띠·꼭짓점이고, 면 가운데로는 붙지 않는다). 윤곽 안은 snap과 무관하게 같다
 */
export function cubeHit(b: CameraBasis, L: CubeLayout, x: number, y: number, band = CUBE_BAND, snap = 0): CubeHit | null {
  for (const f of visibleFaces(b)) {
    const O = proj(b, L, add(scale(f.n, 0.5), add(scale(f.u, -0.5), scale(f.v, -0.5))));
    const A = projLin(b, L, f.u);
    const B = projLin(b, L, f.v);
    const det = A[0] * B[1] - A[1] * B[0];
    if (Math.abs(det) < 1e-9) continue;
    const px = x - O[0], py = y - O[1];
    const s = (px * B[1] - py * B[0]) / det;
    const t = (A[0] * py - A[1] * px) / det;
    if (s < 0 || s > 1 || t < 0 || t > 1) continue;
    const region = cubeRegion(s, t, band);
    return { face: f, s, t, region, dir: cubeRegionDir(f, region[0], region[1]) };
  }
  return snap > 0 ? cubeSnapHit(b, L, x, y, band, snap) : null;
}

/** 0.119.0 윤곽 밖 점(x, y)에서 snap 화소 안의 가장 가까운 보이는 면 테두리 점 → 그 자리(없으면 null). 이웃 면이 함께 쓰는 꼭짓점은 두 면에서 같은 방향이다 */
function cubeSnapHit(b: CameraBasis, L: CubeLayout, x: number, y: number, band: number, snap: number): CubeHit | null {
  let best: { f: CubeFaceDef; s: number; t: number; d: number } | null = null;
  for (const f of visibleFaces(b)) {
    const O = proj(b, L, add(scale(f.n, 0.5), add(scale(f.u, -0.5), scale(f.v, -0.5))));
    const A = projLin(b, L, f.u);
    const B = projLin(b, L, f.v);
    if (Math.abs(A[0] * B[1] - A[1] * B[0]) < 1e-9) continue;
    const px = x - O[0], py = y - O[1];
    const aa = A[0] * A[0] + A[1] * A[1], bb = B[0] * B[0] + B[1] * B[1];
    const clamp = (k: number): number => (k < 0 ? 0 : k > 1 ? 1 : k);
    // 테두리 넷: t = 0·1(A 방향), s = 0·1(B 방향) — 그 위 가장 가까운 점의 (s, t)
    for (const [s0, t0, alongA] of [[0, 0, true], [0, 1, true], [0, 0, false], [1, 0, false]] as const) {
      const qx = px - s0 * A[0] - t0 * B[0], qy = py - s0 * A[1] - t0 * B[1];
      const k = alongA ? clamp((qx * A[0] + qy * A[1]) / aa) : clamp((qx * B[0] + qy * B[1]) / bb);
      const s = alongA ? k : s0, t = alongA ? t0 : k;
      const d = Math.hypot(px - s * A[0] - t * B[0], py - s * A[1] - t * B[1]);
      if (!best || d < best.d) best = { f, s, t, d };
    }
  }
  if (!best || !(best.d <= snap)) return null;
  const region = cubeRegion(best.s, best.t, band);
  return { face: best.f, s: best.s, t: best.t, region, dir: cubeRegionDir(best.f, region[0], region[1]) };
}

// ───────────── 0.44.0 손가락 기기 뷰 큐브 ─────────────

/**
 * 0.44.0 손가락 누르는 자리 최소(CSS 화소): WCAG 2.2 2.5.8 "Target Size (Minimum)"(AA) 24 × 24. 2.5.5 "Target Size (Enhanced)"(AAA)·Apple HIG는 44 × 44.
 * 뷰 큐브는 면 여섯·모서리 열둘·구석 여덟(등각에서 보이는 것만 19)을 한 캔버스에 담아, 64~160화소 큐브에서는 모서리·구석 띠가 이보다 좁다(cubeTargets)
 */
export const CUBE_TOUCH_MIN = 24;
/**
 * 0.44.0 손가락으로 누를 때 펴 보이는 큐브 한 변(CSS 화소). 띠 CUBE_TOUCH_BAND와 함께 표준 뷰(면·모서리·등각)에서 보이는 누르는 자리가 모두
 * CUBE_TOUCH_MIN 이상이 되는 가장 작은 16의 배수(cubeTargets로 잰 값 — 면 뷰 가운데 45·띠 34, 등각 24.1 이상)
 */
export const CUBE_TOUCH_SIZE = 224;
/** 0.44.0 손가락 큐브의 면 가장자리 띠 폭(면 한 변 대비 — 기본 CUBE_BAND 0.24보다 넓혀 모서리·구석 자리를 키운다) */
export const CUBE_TOUCH_BAND = 0.3;

/** 0.44.0 큐브 누르는 자리 하나: 눈 방향과 화면 조각(면마다 평행사변형 — 모서리는 두 면, 구석은 세 면에 걸친다)·가장 좁은 폭 */
export interface CubeTarget {
  dir: V3;
  /** 면마다 조각(캔버스 화소 꼭짓점 넷) */
  pieces: [number, number][][];
  /** 조각 가운데 가장 넓은 조각의 가장 좁은 폭(평행사변형 높이의 작은 쪽 — 그 조각 안에 이 지름의 원이 든다. 걸친 조각을 합친 자리보다 작게 잰다) */
  width: number;
}

/** 평행사변형(꼭짓점 넷, 차례대로)의 두 높이 가운데 작은 것 */
function parallelogramWidth(q: readonly [number, number][]): number {
  const [a, b, , d] = q as [[number, number], [number, number], [number, number], [number, number]];
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = d[0] - a[0], vy = d[1] - a[1];
  const area = Math.abs(ux * vy - uy * vx);
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  if (!(lu > 0) || !(lv > 0)) return 0;
  return Math.min(area / lu, area / lv);
}

/**
 * 0.44.0 지금 카메라에서 보이는 누르는 자리(면 가운데·모서리·구석)와 그 폭 — 손가락 기기 큐브 크기를 정하고 시험한다.
 * 같은 눈 방향의 조각(이웃 면의 같은 모서리·구석)을 한 자리로 모은다
 */
export function cubeTargets(b: CameraBasis, L: CubeLayout, band = CUBE_BAND): CubeTarget[] {
  const out: CubeTarget[] = [];
  const cuts = [0, band, 1 - band, 1];
  for (const f of visibleFaces(b)) {
    const at = (s: number, t: number): [number, number] => proj(b, L, add(scale(f.n, 0.5), add(scale(f.u, s - 0.5), scale(f.v, t - 0.5))));
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const dir = cubeRegionDir(f, i - 1, j - 1);
        const q: [number, number][] = [at(cuts[i]!, cuts[j]!), at(cuts[i + 1]!, cuts[j]!), at(cuts[i + 1]!, cuts[j + 1]!), at(cuts[i]!, cuts[j + 1]!)];
        const w = parallelogramWidth(q);
        const t = out.find((x) => dot(x.dir, dir) > 0.9999);
        if (t) {
          t.pieces.push(q);
          t.width = Math.max(t.width, w);
        } else out.push({ dir, pieces: [q], width: w });
      }
  }
  return out;
}

export interface CubeColors {
  face: string;
  edge: string;
  text: string;
  hover: string;
}

/**
 * 큐브 그리기(ctx는 큐브 캔버스, dpr 배율은 부르는 쪽이 setTransform으로 건다).
 * 0.44.0 opts: band = 면 가장자리 띠 폭(가리킨 구역 칠하기 — 기본 CUBE_BAND), grid = 띠 경계를 옅은 선으로(손가락 큐브 — 가리키기가 없어 누르는 자리를 보인다).
 * opts를 주지 않으면 0.43.0과 같은 그리기
 */
export function drawViewCube(
  ctx: CanvasRenderingContext2D,
  b: CameraBasis,
  L: CubeLayout,
  colors: CubeColors,
  hoverDir: V3 | null,
  font: string,
  opts?: { band?: number; grid?: boolean },
): void {
  const faces = visibleFaces(b).sort((p, q) => dot(p.n, b.back) - dot(q.n, b.back));
  const band = opts?.band ?? CUBE_BAND;
  const bands = [0, band, 1 - band, 1];
  for (const f of faces) {
    const at = (s: number, t: number): [number, number] => proj(b, L, add(scale(f.n, 0.5), add(scale(f.u, s - 0.5), scale(f.v, t - 0.5))));
    const facing = dot(f.n, b.back);
    // 면 채우기(정면에 가까울수록 밝게)
    ctx.beginPath();
    const c = [at(0, 0), at(1, 0), at(1, 1), at(0, 1)];
    ctx.moveTo(c[0]![0], c[0]![1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i]![0], c[i]![1]);
    ctx.closePath();
    ctx.fillStyle = colors.face;
    ctx.globalAlpha = 0.78 + 0.22 * facing;
    ctx.fill();
    ctx.globalAlpha = 1;
    // 가리킨 구역
    if (hoverDir) {
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const d = cubeRegionDir(f, i - 1, j - 1);
          if (dot(d, hoverDir) < 0.9999) continue;
          const q = [at(bands[i]!, bands[j]!), at(bands[i + 1]!, bands[j]!), at(bands[i + 1]!, bands[j + 1]!), at(bands[i]!, bands[j + 1]!)];
          ctx.beginPath();
          ctx.moveTo(q[0]![0], q[0]![1]);
          for (let k = 1; k < 4; k++) ctx.lineTo(q[k]![0], q[k]![1]);
          ctx.closePath();
          ctx.fillStyle = colors.hover;
          ctx.fill();
        }
    }
    ctx.beginPath();
    ctx.moveTo(c[0]![0], c[0]![1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i]![0], c[i]![1]);
    ctx.closePath();
    ctx.strokeStyle = colors.edge;
    ctx.lineWidth = 1;
    ctx.stroke();
    // 0.44.0 손가락 큐브: 띠 경계(누르는 자리)를 옅게
    if (opts?.grid) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      for (const k of [band, 1 - band]) {
        const p0 = at(k, 0), p1 = at(k, 1), q0 = at(0, k), q1 = at(1, k);
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.moveTo(q0[0], q0[1]);
        ctx.lineTo(q1[0], q1[1]);
      }
      ctx.stroke();
      ctx.restore();
    }
    // 글자: 면 좌표(0..100, y 아래)를 화면으로 잇는 아핀 변환
    if (facing > 0.15) {
      const O = at(0, 1);
      const A = projLin(b, L, f.u);
      const B = projLin(b, L, f.v);
      ctx.save();
      ctx.transform(A[0] / 100, A[1] / 100, -B[0] / 100, -B[1] / 100, O[0], O[1]);
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font;
      ctx.fillText(f.label, 50, 52, 92);
      ctx.restore();
    }
  }
}
