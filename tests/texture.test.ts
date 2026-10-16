/** 무늬: 무늬 좌표 값 수, 그림 머리 읽기, 크기 한도·예산 나누기, 셰이더 변종, 합성 무늬 그물 */
import { describe, expect, it } from 'vitest';
import { TEXTURE_MIN_SIDE, fitSize, imageInfo, textureSides, uvComponents } from '../src/texture';
import { MESH_FS, MESH_VS, withClip, withDefines } from '../src/shaders';
import { checkerBmp, projectiveQuadMesh, syntheticScene, texturedBoxMesh } from '../src/synth';

const bytes = (...v: number[]): Uint8Array => new Uint8Array(v);
const be32 = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];

/** PNG 머리(서명 + IHDR + 덧붙일 조각) */
function pngHead(w: number, h: number, colorType: number, extra: string[] = []): Uint8Array {
  const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, colorType, 0, 0, 0, 0, 0, 0, 0];
  for (const t of extra) out.push(...be32(1), ...[...t].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, 0);
  out.push(...be32(0), 0x49, 0x44, 0x41, 0x54, 0, 0, 0, 0);
  return new Uint8Array(out);
}

describe('무늬 좌표', () => {
  it('정점 수에 맞춰 2값·3값을 가린다', () => {
    const positions = new Float32Array(9);
    expect(uvComponents({ positions })).toBe(0);
    expect(uvComponents({ positions, uvs: new Float32Array(6) })).toBe(2);
    expect(uvComponents({ positions, uvs: new Float32Array(9) })).toBe(3);
    expect(uvComponents({ positions, uvs: new Float32Array(5) })).toBe(0);
    expect(uvComponents({ positions: new Float32Array(0), uvs: new Float32Array(6) })).toBe(0);
  });
});

describe('그림 머리', () => {
  it('PNG: 크기와 알파(색 형식·tRNS)', () => {
    expect(imageInfo(pngHead(640, 480, 2))).toEqual({ mime: 'image/png', width: 640, height: 480, alpha: false });
    expect(imageInfo(pngHead(64, 32, 6))!.alpha).toBe(true);
    expect(imageInfo(pngHead(64, 32, 4))!.alpha).toBe(true);
    expect(imageInfo(pngHead(64, 32, 3, ['PLTE', 'tRNS']))!.alpha).toBe(true);
    expect(imageInfo(pngHead(64, 32, 3, ['PLTE']))!.alpha).toBe(false);
  });

  it('JPEG: SOF의 크기(앞 조각을 건너뛴다)', () => {
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46];
    const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03];
    expect(imageInfo(bytes(0xff, 0xd8, ...app0, ...sof))).toEqual({ mime: 'image/jpeg', width: 640, height: 480, alpha: false });
    expect(imageInfo(bytes(0xff, 0xd8, 0xff))).toEqual({ mime: 'image/jpeg', alpha: false });
  });

  it('BMP·GIF·WebP, 모르는 꼴은 null', () => {
    expect(imageInfo(checkerBmp(2, 4))).toEqual({ mime: 'image/bmp', width: 8, height: 8, alpha: false });
    expect(imageInfo(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x00, 0x10, 0x00))).toEqual({ mime: 'image/gif', width: 32, height: 16, alpha: true });
    const riff = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
    // VP8X: 깃발 알파(0x10), 가로−1·세로−1(24비트)
    const vp8x = [...riff, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0, 0x10, 0, 0, 0, 99, 0, 0, 49, 0, 0];
    expect(imageInfo(bytes(...vp8x))).toEqual({ mime: 'image/webp', width: 100, height: 50, alpha: true });
    expect(imageInfo(bytes(1, 2, 3, 4))).toBeNull();
  });
});

describe('크기 한도', () => {
  it('긴 변을 한도 안으로(비 유지), 들어가면 null', () => {
    expect(fitSize(4096, 1024, 2048)).toEqual({ width: 2048, height: 512 });
    expect(fitSize(1000, 3000, 1500)).toEqual({ width: 500, height: 1500 });
    expect(fitSize(512, 512, 2048)).toBeNull();
    expect(fitSize(0, 10, 100)).toBeNull();
  });

  it('예산 안이면 한 장 한도 그대로, 넘으면 같은 비로 줄인다', () => {
    const t = (id: string, w?: number, h?: number) => ({ id, width: w, height: h });
    const fits = textureSides([t('a', 512, 512), t('b', 1024, 256)], 2048, 64 * 1024 * 1024);
    expect(fits.get('a')).toBe(2048);
    expect(fits.get('b')).toBe(2048);
    // 1024² 열여섯 장 ≈ 89 MB(밉맵 포함) → 예산 16 MB면 √(16/89.5) ≈ 0.42배
    const many = Array.from({ length: 16 }, (_, i) => t(`m${i}`, 1024, 1024));
    const sides = textureSides(many, 2048, 16 * 1024 * 1024);
    for (const v of sides.values()) {
      expect(v).toBeLessThan(1024);
      expect(v).toBeGreaterThan(400);
    }
    // 크기를 모르면 한도 × 한도로 어림, 아주 작은 예산이라도 최소 변 아래로는 줄이지 않는다
    const tiny = textureSides([t('u'), t('v', 32, 32)], 4096, 1000);
    expect(tiny.get('u')).toBe(TEXTURE_MIN_SIDE);
    expect(tiny.get('v')).toBe(32);
  });
});

describe('셰이더 변종', () => {
  it('#define을 판 줄 바로 뒤에 넣는다(무늬 없는 기본 셰이더는 그대로)', () => {
    expect(withDefines(MESH_VS)).toBe(MESH_VS);
    expect(withDefines(MESH_FS, 'CLIP', 'TEX').startsWith('#version 300 es\n#define CLIP\n#define TEX\n')).toBe(true);
    expect(withClip(MESH_VS)).toBe(withDefines(MESH_VS, 'CLIP'));
    expect(MESH_VS).toContain('#ifdef TEX');
    expect(MESH_FS).toContain('texture(u_tex, v_uv.xy / v_uv.z)');
  });
});

describe('합성 무늬 그물', () => {
  it('무늬 상자: 정점 24개, 옆면 v는 바닥에서 위로', () => {
    const m = texturedBoxMesh('b', [0, 0, 0], [40, 20, 10], [1, 1, 1, 1], 't', 10);
    expect(m.positions.length).toBe(72);
    expect(uvComponents(m)).toBe(2);
    // 앞면(−Y) 네 점: (0,0) (4,0) (4,1) (0,1)
    expect([...m.uvs!.subarray(0, 8)]).toEqual([0, 0, 4, 0, 4, 1, 0, 1]);
    // 모든 u는 0 이상(뒤·왼쪽 면도 바깥에서 볼 때 왼쪽이 0)
    for (let f = 0; f < 4; f++) for (let k = 0; k < 4; k++) expect(m.uvs![(f * 4 + k) * 2]).toBeGreaterThanOrEqual(0);
  });

  it('원근 무늬 판: (u·q, v·q, q) 3값', () => {
    const m = projectiveQuadMesh('q', [0, 0, 0], 100, 80, 't');
    expect(uvComponents(m)).toBe(3);
    expect([...m.uvs!.subarray(6, 9)]).toEqual([2, 2, 0.5]);
  });

  it('textures 선택이면 장면에 무늬와 그것을 쓰는 그물이 들어간다', () => {
    const s = syntheticScene({ segments: 10, sphereSeg: 8, textures: true });
    expect(s.textures!.map((t) => t.id)).toEqual(['바둑판']);
    expect(s.meshes.filter((m) => m.texture === '바둑판').length).toBe(2);
    expect(syntheticScene({ segments: 10, sphereSeg: 8 }).textures).toBeUndefined();
  });
});
