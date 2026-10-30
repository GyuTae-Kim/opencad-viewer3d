/**
 * 놓기·문맥 복구(0.25.0) 순수 계산: 놓기 선택 정리, 코어가 지운 그물 배열의 올린 꼴(MeshLayout)에서 지금 GPU에 없는 것 고르기.
 * GL은 모른다(올리기·다시 받기는 renderer.ts, 공개 API는 viewer.ts의 setScene release·onContextRestore·restoreMeshArrays·restoreTexture).
 *
 * 코어는 놓기 선택을 받은 장면의 그물 법선·무늬 좌표와 무늬 원본을 GPU에 올린 뒤 장면 객체에서 지우고, 그 그물마다 올린 꼴만 기억한다.
 * 그래픽 문맥을 잃었다 되찾으면 그 꼴과 지금 가진 배열을 견주어 앱에서 다시 받을 것을 고른다.
 */

/** 놓아도 되는 것(true인 것만): 그물 법선(Mesh3d.normals), 앞·뒷면 무늬 좌표(uvs·backUvs), 무늬 원본(Texture3d.data·bitmap) */
export interface ReleaseFlags {
  normals: boolean;
  uvs: boolean;
  textures: boolean;
}

/**
 * 코어가 배열을 지운 그물의 올린 꼴: 정점 수, 지운 법선을 올렸는지, 지운 앞·뒷면 무늬 좌표의 정점당 값 수(0 = 없음),
 * 뒷면 무늬 좌표가 따로 준 backUvs였는지(아니면 uvs를 함께 썼다). 배열이 없어도 무늬 쓰임 셈·문맥 복구에 쓴다
 */
export interface MeshLayout {
  nv: number;
  normals: boolean;
  uv: 0 | 2 | 3;
  buv: 0 | 2 | 3;
  ownBack: boolean;
}

/** 앱이 다시 주는 그물 배열(뜻은 Mesh3d의 같은 이름 필드와 같다) */
export interface MeshArrays {
  normals?: Float32Array;
  uvs?: Float32Array;
  backUvs?: Float32Array;
}

/** 그물 하나에서 다시 받을 배열: uvs는 앞면 무늬 좌표(뒷면이 uvs를 함께 썼으면 뒷면도), backUvs는 따로 준 뒷면 무늬 좌표 */
export interface MeshMiss {
  normals: boolean;
  uvs: boolean;
  backUvs: boolean;
}

/** 다시 줄 것: 코어가 지운 배열·원본 가운데 지금 GPU에 없는 것(그물 id와 다시 줄 배열, 무늬 id) */
export interface RestoreNeed {
  meshes: ({ id: string } & MeshMiss)[];
  textures: string[];
}

/** setScene의 release 선택 → 놓을 것(true = 셋 모두, 객체는 true인 필드만). 놓을 것이 없으면 null */
export function releaseFlags(opt: boolean | Partial<ReleaseFlags> | null | undefined): ReleaseFlags | null {
  const f: ReleaseFlags =
    opt === true ? { normals: true, uvs: true, textures: true } : { normals: !!opt && opt.normals === true, uvs: !!opt && opt.uvs === true, textures: !!opt && opt.textures === true };
  return f.normals || f.uvs || f.textures ? f : null;
}

/**
 * 올린 꼴에서 지금 없는 것: have는 지금 GPU에 올라간(또는 올릴) 속성 — 법선·앞면 무늬 좌표·뒷면 무늬 좌표.
 * 뒷면이 uvs를 함께 썼으면(ownBack이 아님) 뒷면이 없을 때도 uvs를 다시 받는다. 다 있으면 null
 */
export function layoutMiss(lay: MeshLayout, have: { normals: boolean; uv: boolean; buv: boolean }): MeshMiss | null {
  const miss: MeshMiss = {
    normals: lay.normals && !have.normals,
    uvs: (lay.uv > 0 && !have.uv) || (lay.buv > 0 && !lay.ownBack && !have.buv),
    backUvs: lay.buv > 0 && lay.ownBack && !have.buv,
  };
  return miss.normals || miss.uvs || miss.backUvs ? miss : null;
}

/** 배열이 그 꼴에 맞는지(정점 수 × 값 수 이상 — 법선 3, 무늬 좌표 2 이상) */
export function fitsLayout(a: Float32Array | undefined | null, lay: Pick<MeshLayout, 'nv'>, per: number): a is Float32Array {
  return !!a && lay.nv > 0 && a.length >= lay.nv * per;
}

/**
 * 아직 올리지 않은 그물(나눠 올리는 중)이 차례가 왔을 때 없을 것: 그물 객체에 남은 배열과 앱이 미리 준 배열(given)을 꼴에 견준다
 */
export function arraysMiss(lay: MeshLayout, own: MeshArrays, given?: MeshArrays | null): MeshMiss | null {
  const uvs = given?.uvs ?? own.uvs;
  return layoutMiss(lay, {
    normals: fitsLayout(given?.normals ?? own.normals, lay, 3),
    uv: fitsLayout(uvs, lay, 2),
    buv: lay.ownBack ? fitsLayout(given?.backUvs ?? own.backUvs, lay, 2) : fitsLayout(uvs, lay, 2),
  });
}

/** 앱이 준 배열 가운데 miss에 들고 꼴에 맞는 것만(받을 것이 없으면 null) */
export function takeArrays(miss: MeshMiss, lay: Pick<MeshLayout, 'nv'>, a: MeshArrays): MeshArrays | null {
  const out: MeshArrays = {};
  if (miss.normals && fitsLayout(a.normals, lay, 3)) out.normals = a.normals;
  if (miss.uvs && fitsLayout(a.uvs, lay, 2)) out.uvs = a.uvs;
  if (miss.backUvs && fitsLayout(a.backUvs, lay, 2)) out.backUvs = a.backUvs;
  return out.normals || out.uvs || out.backUvs ? out : null;
}
