/**
 * 높이 격자 그물(0.11.0 그물 바꾸기 확인용 — 화소 비교 페이지·비용 재기·시험이 함께 쓴다).
 * 소재 깎기 시뮬레이션처럼 n × n 마디(행 우선)에 높이 하나씩, 정점 색은 높이 색, 법선은 이웃 마디 차분.
 * 비교 페이지는 base 판 src에 없는 것을 가져올 수 없어 이 파일에 둔다(src/types의 형식만 쓴다).
 */
import type { Mesh3d, Rgba } from '../../src/types';

export interface GridSpec {
  /** 한 변 마디 수(n × n 정점, 삼각형 2(n−1)²) */
  n: number;
  /** 한 변 길이(세계) */
  size: number;
  /** 왼쪽 아래 구석(세계) */
  x0: number;
  y0: number;
  /** 묶음 원점(세계, 선택) — 있으면 positions는 이 점 기준 */
  origin?: [number, number, number];
}

/** 격자 삼각형 번호(마디 행 우선, 칸마다 둘 — 위에서 보아 반시계) */
export function gridIndices(n: number): Uint32Array {
  const out = new Uint32Array((n - 1) * (n - 1) * 6);
  let o = 0;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      out[o++] = a;
      out[o++] = b;
      out[o++] = d;
      out[o++] = a;
      out[o++] = d;
      out[o++] = c;
    }
  return out;
}

/** 높이 → 색(얕으면 밝은 하늘색, 깊으면 짙은 남색 — 0 이상은 소재 색) */
export function heightColor(z: number, top: number, depth: number, out: Float32Array, o: number): void {
  if (z >= top - 1e-9) {
    out[o] = 0.74;
    out[o + 1] = 0.76;
    out[o + 2] = 0.8;
  } else {
    const f = Math.max(0, Math.min(1, (top - z) / depth));
    out[o] = 0.62 + (0.2 - 0.62) * f;
    out[o + 1] = 0.84 + (0.26 - 0.84) * f;
    out[o + 2] = 0.95 + (0.62 - 0.95) * f;
  }
  out[o + 3] = 1;
}

/** 마디 (i, j)의 세계 x·y */
export const gridX = (g: GridSpec, i: number): number => g.x0 + (i * g.size) / (g.n - 1);
export const gridY = (g: GridSpec, j: number): number => g.y0 + (j * g.size) / (g.n - 1);

/**
 * 높이 함수로 격자 그물을 만든다. indices를 주면 그 배열을 함께 쓴다(같은 크기 조각끼리 — 뷰어도 GPU에 한 번만 올린다).
 * normals: false면 법선 없이(뷰어가 면 법선으로 평면 음영)
 */
export function gridMesh(
  id: string,
  g: GridSpec,
  z: (x: number, y: number) => number,
  o: { indices?: Uint32Array; normals?: boolean; color?: Rgba; group?: string; top?: number; depth?: number } = {},
): Mesh3d {
  const n = g.n;
  const m: Mesh3d = {
    id,
    name: id,
    positions: new Float32Array(n * n * 3),
    colors: new Float32Array(n * n * 4),
    indices: o.indices ?? gridIndices(n),
    color: o.color ?? [0.74, 0.76, 0.8, 1],
    ...(o.normals === false ? {} : { normals: new Float32Array(n * n * 3) }),
    ...(g.origin ? { origin: g.origin } : {}),
    ...(o.group ? { group: o.group } : {}),
  };
  fillGrid(m, g, z, 0, n - 1, o.top ?? 0, o.depth ?? 10);
  return m;
}

/**
 * 격자 그물의 마디 줄 j0..j1(포함)을 높이 함수로 제자리에서 다시 채운다(위치·색, 법선은 이웃 줄까지).
 * 돌려주는 값: 바뀐 정점 구간(setMesh의 vertices) — 법선이 바뀌는 이웃 줄을 포함한다
 */
export function fillGrid(m: Mesh3d, g: GridSpec, z: (x: number, y: number) => number, j0: number, j1: number, top = 0, depth = 10): { start: number; count: number } {
  const n = g.n;
  const P = m.positions, C = m.colors!, N = m.normals;
  const ox = g.origin?.[0] ?? 0, oy = g.origin?.[1] ?? 0, oz = g.origin?.[2] ?? 0;
  for (let j = j0; j <= j1; j++)
    for (let i = 0; i < n; i++) {
      const v = j * n + i;
      const x = gridX(g, i), y = gridY(g, j);
      const h = z(x, y);
      P[v * 3] = x - ox;
      P[v * 3 + 1] = y - oy;
      P[v * 3 + 2] = h - oz;
      heightColor(h, top, depth, C, v * 4);
    }
  const a = Math.max(0, j0 - 1), b = Math.min(n - 1, j1 + 1);
  if (N) {
    const d = g.size / (n - 1);
    const H = (i: number, j: number): number => P[(Math.min(n - 1, Math.max(0, j)) * n + Math.min(n - 1, Math.max(0, i))) * 3 + 2]!;
    for (let j = a; j <= b; j++)
      for (let i = 0; i < n; i++) {
        const nx = -(H(i + 1, j) - H(i - 1, j)) / (2 * d);
        const ny = -(H(i, j + 1) - H(i, j - 1)) / (2 * d);
        const l = Math.hypot(nx, ny, 1);
        const v = (j * n + i) * 3;
        N[v] = nx / l;
        N[v + 1] = ny / l;
        N[v + 2] = 1 / l;
      }
  }
  return N ? { start: a * n, count: (b - a + 1) * n } : { start: j0 * n, count: (j1 - j0 + 1) * n };
}

/**
 * 깎기 흉내: 공구가 지나간 꺾은선(path) 둘레 반지름 r 안을 판다 — 바닥 높이 floor(공구 가운데), 가장자리로 갈수록 rise만큼 오른다(볼 엔드밀처럼).
 * 앞 높이보다 낮을 때만 판다(여러 번 깎기를 겹칠 수 있다)
 */
export function cutBy(base: (x: number, y: number) => number, path: readonly [number, number][], r: number, floor: number, rise = 0): (x: number, y: number) => number {
  return (x, y) => {
    let h = base(x, y);
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, ay] = path[k]!, [bx, by] = path[k + 1]!;
      const ex = bx - ax, ey = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
      const dx = x - (ax + ex * t), dy = y - (ay + ey * t);
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) h = Math.min(h, floor + (rise * d2) / (r * r));
    }
    return h;
  };
}
