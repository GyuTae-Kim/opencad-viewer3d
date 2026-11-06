/**
 * PBR 그림이 있는 장면(0.43.0 — SKP 40차 요청의 법선·거칠기·금속 그림. 화소 비교 페이지·시험이 함께 쓴다).
 * 비교 페이지는 base 판 src에 없는 것을 가져올 수 없어 그림 만들기(BMP)와 그물을 이 파일에 둔다.
 *
 * - 판 A(왼쪽): 회색 판(두 삼각형, 무늬 좌표 0~2 — 그림이 두 번 되풀이), 법선 그림만(둥근 돌기 넷과 위쪽으로 솟은 가로 띠)
 * - 판 B(가운데): 바둑판 무늬 + 같은 법선 그림(배율 0.6) + 금속·거칠기 그림(초록 = 거칠기 0.1~0.9 네 칸, 파랑 = 위 절반 금속)
 * - 구 C(오른쪽): 금색 금속(금속성 1, 거칠기 0.3 — 값만)에 법선 그림(배율 0.5, 구의 둘레·높이 무늬 좌표)
 * - 구 D(뒤): 흰 유전체에 따로 준 거칠기 그림(매끈함 그림 — roughnessInvert)과 DirectX 꼴 법선 그림(normalFlipY)
 */
import type { Mesh3d, Rgba, Scene3d, Texture3d } from '../../src/types';

/** 24비트 BMP(아래 줄부터). px(x, y) = 그림 위에서 잰 y의 [r, g, b] 0~255 */
export function bmp24(w: number, h: number, px: (x: number, y: number) => readonly number[]): Uint8Array {
  const stride = (w * 3 + 3) & ~3;
  const size = 54 + stride * h;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out[0] = 0x42;
  out[1] = 0x4d;
  dv.setUint32(2, size, true);
  dv.setUint32(10, 54, true);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true); // 양수 = 아래 줄부터
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, stride * h, true);
  for (let row = 0; row < h; row++) {
    const y = h - 1 - row;
    for (let x = 0; x < w; x++) {
      const c = px(x, y);
      const o = 54 + row * stride + x * 3;
      out[o] = c[2]!;
      out[o + 1] = c[1]!;
      out[o + 2] = c[0]!;
    }
  }
  return out;
}

/** 높이 마당(그림 위쪽이 +y — 무늬 v가 느는 쪽): 둥근 돌기 넷(한 칸 32화소의 가운데)과 위쪽 절반 가운데의 가로 띠 */
function height(x: number, yUp: number, n: number): number {
  const c = n / 2;
  const cx = (x % c) - c / 2, cy = (yUp % c) - c / 2;
  const r = Math.hypot(cx, cy) / (c * 0.38);
  let h = r < 1 ? Math.sqrt(1 - r * r) * 0.9 : 0;
  // 가로 띠: 위 절반 칸의 위쪽 끝 둘레에 솟은 등
  const by = Math.abs(yUp - n * 0.9) / (n * 0.05);
  if (by < 1) h = Math.max(h, 0.5 * (1 - by * by));
  return h;
}

/** 법선 그림 n × n(접선 공간 — X 오른쪽, Y 그림 위쪽(OpenGL 꼴), flipY면 Y를 뒤집어 담는다(DirectX 꼴)) */
export function normalMapBmp(n = 64, flipY = false): Uint8Array {
  const k = n / 6;
  return bmp24(n, n, (x, y) => {
    const yUp = n - 1 - y;
    const hx = (height(x + 1, yUp, n) - height(x - 1 + n, yUp, n)) / 2;
    const hy = (height(x, yUp + 1, n) - height(x, yUp - 1 + n, n)) / 2;
    let nx = -hx * k, ny = -hy * k;
    const l = Math.hypot(nx, ny, 1);
    nx /= l;
    ny /= l;
    const nz = 1 / l;
    if (flipY) ny = -ny;
    return [Math.round((nx * 0.5 + 0.5) * 255), Math.round((ny * 0.5 + 0.5) * 255), Math.round((nz * 0.5 + 0.5) * 255)];
  });
}

/** 금속·거칠기 그림 n × n(초록 = 거칠기: 가로 네 칸 0.1·0.35·0.6·0.9, 파랑 = 금속성: 위 절반 1, 아래 절반 0 — 빨강은 쓰지 않는다) */
export function metalRoughBmp(n = 64): Uint8Array {
  const g = [0.1, 0.35, 0.6, 0.9];
  return bmp24(n, n, (x, y) => [255, Math.round(g[Math.min(3, Math.floor((x / n) * 4))]! * 255), y < n / 2 ? 255 : 0]);
}

/** 매끈함 그림(회색조 — roughnessInvert로 거칠기 = 1 − 값): 동심원 띠(밝을수록 매끈) */
export function glossBmp(n = 64): Uint8Array {
  return bmp24(n, n, (x, y) => {
    const r = Math.hypot(x - n / 2, y - n / 2) / (n / 2);
    const v = Math.round((Math.floor(r * 4) % 2 ? 0.85 : 0.25) * 255);
    return [v, v, v];
  });
}

/** 바둑판(8칸, 왼쪽 아래 칸 빨강 — 방향 확인) */
function checker(n = 64): Uint8Array {
  const px = n / 8;
  return bmp24(n, n, (x, y) => {
    const cx = Math.floor(x / px), cy = Math.floor((n - 1 - y) / px);
    return cx === 0 && cy === 0 ? [220, 40, 40] : (cx + cy) % 2 ? [58, 92, 150] : [236, 236, 230];
  });
}

/** XY 평면 판(가운데 c, 한 변 s, 무늬 좌표 0~rep) — 두 삼각형, 법선 +Z */
export function plateMesh(id: string, c: readonly number[], s: number, color: Rgba, rep = 2): Mesh3d {
  const h = s / 2;
  const [x, y, z] = [c[0]!, c[1]!, c[2]!];
  return {
    id,
    name: id,
    positions: new Float32Array([x - h, y - h, z, x + h, y - h, z, x + h, y + h, z, x - h, y + h, z]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: new Float32Array([0, 0, rep, 0, rep, rep, 0, rep]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    color,
    group: 'PBR',
  };
}

/** 구(가운데 c, 반지름 r, 경도 seg × 위도 seg/2) — 매끈한 법선, 무늬 좌표 u = 경도 × 2바퀴, v = 위도 */
export function sphereMesh(id: string, c: readonly number[], r: number, seg: number, color: Rgba): Mesh3d {
  const rings = seg / 2;
  const nv = (seg + 1) * (rings + 1);
  const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), uvs = new Float32Array(nv * 2);
  const idx: number[] = [];
  for (let j = 0; j <= rings; j++)
    for (let i = 0; i <= seg; i++) {
      const th = (j / rings) * Math.PI, ph = (i / seg) * Math.PI * 2;
      const n = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), -Math.cos(th)];
      const k = j * (seg + 1) + i;
      normals.set(n, k * 3);
      positions.set([c[0]! + r * n[0]!, c[1]! + r * n[1]!, c[2]! + r * n[2]!], k * 3);
      uvs.set([(i / seg) * 2, j / rings], k * 2);
    }
  for (let j = 0; j < rings; j++)
    for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, d = a + seg + 1, e = d + 1;
      idx.push(a, b, e, a, e, d);
    }
  return { id, name: id, positions, normals, uvs, indices: new Uint32Array(idx), color, group: 'PBR', closed: true };
}

/** PBR 장면. pending이면 PBR 그림 셋(법선·금속 거칠기·매끈함)을 앱이 나중에 주는 것(Texture3d.pending)으로 둔다 */
export function pbrScene(o: { pending?: boolean } = {}): Scene3d {
  const tex = (id: string, data: Uint8Array): Texture3d => (o.pending ? { id, pending: true, width: 64, height: 64 } : { id, data, mime: 'image/bmp', width: 64, height: 64 });
  const textures: Texture3d[] = [
    { id: '바둑판', data: checker(), mime: 'image/bmp', width: 64, height: 64 },
    tex('법선', normalMapBmp()),
    tex('금속 거칠기', metalRoughBmp()),
    tex('매끈함', glossBmp()),
    { id: '법선 DX', data: normalMapBmp(64, true), mime: 'image/bmp', width: 64, height: 64 },
  ];
  const a: Mesh3d = { ...plateMesh('판 A', [-130, 0, 0], 110, [0.62, 0.64, 0.68, 1]), normalTexture: '법선' };
  const b: Mesh3d = {
    ...plateMesh('판 B', [0, 0, 0], 110, [0.6, 0.6, 0.6, 1]),
    texture: '바둑판',
    normalTexture: '법선',
    normalScale: 0.6,
    metallicRoughnessTexture: '금속 거칠기',
  };
  const c: Mesh3d = { ...sphereMesh('구 C', [125, 0, 45], 45, 32, [0.95, 0.74, 0.34, 1]), metallic: 1, roughness: 0.3, normalTexture: '법선', normalScale: 0.5 };
  const d: Mesh3d = {
    ...sphereMesh('구 D', [10, 120, 40], 40, 32, [0.92, 0.92, 0.9, 1]),
    roughnessTexture: '매끈함',
    roughnessInvert: true,
    normalTexture: '법선 DX',
    normalFlipY: true,
  };
  return { name: 'PBR 판', units: 'mm', meshes: [a, b, c, d], lines: [], textures };
}

/** 원본 PBR 그림 바이트(pending 장면에 restoreTexture로 줄 것) */
export function pbrImages(): Record<string, Uint8Array> {
  return { 법선: normalMapBmp(), '금속 거칠기': metalRoughBmp(), 매끈함: glossBmp() };
}
