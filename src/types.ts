/**
 * 3D 뷰어의 장면 계약: 형식 해석기(opencad-nc·opencad-step·opencad-skp 저장소)가 이 꼴로 장면을 만들고, 뷰어(이 저장소)가 그린다.
 * 해석기는 DOM·WebGL에 기대지 않고 이 자료만 돌려준다(워커에서도 돌 수 있게 — 형식 배열은 이전 가능한 버퍼로 옮긴다).
 *
 * 좌표: 오른손 좌표계, Z 위. 단위는 Scene3d.units(뷰어는 표시·측정에만 쓴다).
 * 바꿀 때는 기존 필드의 뜻을 바꾸지 말고 선택 필드만 더한다(여러 해석기가 함께 쓴다).
 */

/** RGBA, 각 0~1 */
export type Rgba = readonly [number, number, number, number];

/** 축에 나란한 상자 */
export interface Box3 {
  min: [number, number, number];
  max: [number, number, number];
}

/** 삼각형 그물(면). 정점은 xyz 순서로 이어 붙인다 */
export interface Mesh3d {
  /** 고르기·강조·목록용 식별자(장면 안에서 유일) */
  id: string;
  /** 사람이 읽는 이름(부품·면 이름 등) */
  name?: string;
  /** 정점 좌표 xyz… */
  positions: Float32Array;
  /** 정점 법선 xyz…(없으면 뷰어가 면 법선으로 평면 음영) */
  normals?: Float32Array;
  /** 삼각형 정점 번호(없으면 positions를 세 개씩 끊어 삼각형으로 본다) */
  indices?: Uint32Array;
  /** 전체 색 */
  color: Rgba;
  /** 정점마다 색 rgba…(있으면 color 대신) */
  colors?: Float32Array;
  /** 윤곽선(모서리) 선분 쌍 xyz,xyz…(면과 함께 그리는 특징선) */
  edges?: Float32Array;
  /**
   * 윤곽선(edges)이 없을 때 와이어프레임·숨은 선 모드가 삼각형 변을 대신 그릴지(0.7.1, 선택 — 기본 true).
   * false면 이 그물은 어느 모드에서도 edges만 선으로 그린다(없으면 선 없음). 모서리가 따로 정해진 그물
   * (B-rep 면 — 매끈한 닫힌 면에는 모서리가 없다)이나 모서리를 선분 묶음으로 따로 주는 해석기(SketchUp)가 쓴다.
   * 고르기·측정·단면·그림자는 그대로다(면은 늘 고른다)
   */
  triangleEdges?: boolean;
  /** 4×4 변환(열 우선, 없으면 단위 행렬). 같은 그물을 여러 번 놓을 때 */
  matrix?: Float64Array;
  /** 묶음 이름(목록·켜고 끄기용, 예: 부품·도면층·태그) */
  group?: string;
  /** 양면으로 그릴지(얇은 판·열린 면). 기본 true */
  doubleSided?: boolean;
  /**
   * 좌표 원점(세계 좌표, 선택). 있으면 positions·edges는 이 점 기준 좌표다:
   * 세계 = origin + position(matrix가 있으면 matrix · (origin + position)).
   * 큰 좌표(예: 1e6 mm대)에서 float32 정밀도를 지키려고 쓴다 — 해석기는 묶음 가운데쯤을 원점으로 잡고 positions를 그만큼 빼서 채운다.
   */
  origin?: [number, number, number];
  /**
   * 닫힌 입체(모든 모서리를 삼각형 둘이 함께 쓰는 물 샐 틈 없는 껍질)면 true.
   * 단면 보기에서 잘린 면을 채운다. 열린 면·얇은 판·틈 있는 그물에는 두지 않는다(채우기가 어긋난다).
   */
  closed?: boolean;
  /**
   * 무늬 좌표(선택). 정점마다 (u, v) 2값, 또는 원근 무늬(사진 맞춤처럼 면 위에서 q가 바뀌는 투영)면 (u·q, v·q, q) 3값 —
   * 길이로 가린다(정점 수 × 3이면 3값). u는 그림 오른쪽, v는 그림 위쪽으로 늘고(0 = 그림 아래 끝) 0~1 밖은 되풀이한다.
   * texture와 함께 둔다(무늬 그림을 아직 풀지 못했거나 찾지 못하면 color로 칠한다).
   */
  uvs?: Float32Array;
  /** 무늬 그림 id(Scene3d.textures). 있으면 color·colors의 rgb 대신 무늬 그림을 칠하고, 불투명도는 color(colors) 알파를 따른다 */
  texture?: string;
  /**
   * 잘린 면을 함께 채우는 묶음 이름(0.7.0, 선택). 재질별로 나뉜 그물들이 함께 하나의 닫힌 입체를 이루면 같은 이름을 준다 —
   * 단면에서 그 그물들의 교차를 더해 안쪽을 한 번에 채운다(그물 하나하나는 closed가 아니어도 된다). 채운 면 색은 처음 그물 색
   */
  capGroup?: string;
  /**
   * 늘 카메라를 마주 보는 그물(0.7.0, 선택 — SketchUp "늘 나를 보기" 컴포넌트, 2D 나무·사람): 세계 Z축(origin을 지나는) 둘레로
   * 프레임마다 돌려 front(그물 앞 방향, 기본 [0, −1, 0] — 앞 뷰에서 보이는 쪽)가 카메라 쪽을 향하게 한다. origin은 세계 좌표(matrix·origin을 거친 뒤).
   * 고르기·측정도 돌린 자리로 한다. 범위는 원점 둘레 기둥(돌려도 변하지 않게)
   */
  billboard?: { origin: [number, number, number]; axis?: 'z'; front?: [number, number, number] };
  /**
   * 뒷면 색(0.7.0, 선택): 삼각형 감김이 화면에서 시계 방향인 쪽(바깥에서 반시계로 감은 그물의 안쪽)을 이 색으로(rgb, 불투명도는 color 알파).
   * SketchUp 면의 뒷면 재질처럼. matrix가 거울(행렬식 < 0)이면 앞뒤를 맞춰 뒤집는다
   */
  backColor?: Rgba;
  /** 뒷면 무늬 그림 id(Scene3d.textures). 좌표는 backUvs(없으면 uvs) */
  backTexture?: string;
  /** 뒷면 무늬 좌표(uvs와 같은 꼴 — 정점마다 2값 또는 3값) */
  backUvs?: Float32Array;
}

/**
 * 무늬 그림(Scene3d.textures). 같은 그림을 여러 그물이 id로 함께 쓴다.
 * 뷰어가 브라우저에서 풀어(createImageBitmap) 크기 한도 안으로 줄이고 되풀이(REPEAT)·밉맵으로 올린다.
 */
export interface Texture3d {
  id: string;
  /** 그림 파일 바이트(PNG·JPEG·GIF·WebP·BMP 등 브라우저가 풀 수 있는 꼴) */
  data?: Uint8Array;
  /** data의 MIME(없으면 첫 바이트로 가린다) */
  mime?: string;
  /** 이미 푼 그림(예: 워커에서 만들어 넘긴 ImageBitmap, 보통 방향 — 맨 위 줄이 먼저). 있으면 data 대신 쓴다 */
  bitmap?: ImageBitmap;
  /** 그림 화소 크기(알면 — 큰 그림을 풀면서 바로 줄인다) */
  width?: number;
  height?: number;
  /** 투명한 화소를 쓰는 그림이면 true — 이 무늬를 칠한 그물은 반투명 차례에 그린다(아니면 그림의 알파는 무시) */
  alpha?: boolean;
}

/** 선분 묶음(공구 경로·와이어프레임 등) */
export interface LineSet3d {
  id: string;
  name?: string;
  /** 선분 쌍 xyz,xyz…(선분 n개 = 길이 6n) */
  positions: Float32Array;
  /** 정점마다 색 rgba…(있으면 color 대신) */
  colors?: Float32Array;
  color?: Rgba;
  /** 점선(예: 급속 이송) */
  dashed?: boolean;
  /** 화면 화소 굵기(기본 1) */
  width?: number;
  group?: string;
  /** 선분마다 원본 식별 번호(예: NC 줄 번호) — 고르기 결과로 돌려준다 */
  segmentIds?: Uint32Array;
  /** 좌표 원점(세계 좌표, 선택). 있으면 positions는 이 점 기준(세계 = origin + position). Mesh3d.origin 참고 */
  origin?: [number, number, number];
  /**
   * 모형 모서리 묶음이면 true(0.7.1, 선택): 숨은 선 모드의 숨은 윤곽선 점선(Viewer3d.setRenderOptions({ hiddenEdges }))을
   * 그물 윤곽선(Mesh3d.edges)처럼 이 묶음에도 그린다 — 면 뒤로 가려진 부분만 흐린 점선으로. 모서리를 선분 묶음으로 주는 해석기(SketchUp)용
   */
  hiddenEdges?: boolean;
}

/** 점 묶음(구멍 중심·측정점 등) */
export interface PointSet3d {
  id: string;
  name?: string;
  /** xyz… */
  positions: Float32Array;
  color?: Rgba;
  /** 화소 크기(기본 4) */
  size?: number;
  group?: string;
  pointIds?: Uint32Array;
  /** 좌표 원점(세계 좌표, 선택). 있으면 positions는 이 점 기준(세계 = origin + position). Mesh3d.origin 참고 */
  origin?: [number, number, number];
}

/** 해석기가 돌려주는 장면 */
export interface Scene3d {
  name: string;
  units: 'mm' | 'inch' | 'm' | 'unknown';
  meshes: Mesh3d[];
  lines: LineSet3d[];
  points?: PointSet3d[];
  /** 알고 있으면(없으면 뷰어가 계산) */
  bounds?: Box3;
  /** 무늬 그림(Mesh3d.texture가 id로 가리킨다) */
  textures?: Texture3d[];
  /** 해석 중 생긴 알림(지원하지 않는 요소 등) — 화면에 목록으로 보인다 */
  warnings?: string[];
  /** 형식별 추가 정보(뷰어는 보지 않는다. 화면 패널이 쓴다) */
  meta?: Record<string, unknown>;
}

/** 뷰어가 고르기 결과로 돌려주는 것 */
export interface Pick3d {
  /** 'edge'는 그물 윤곽선(Mesh3d.edges) — 윤곽선 고르기를 켰을 때만(0.7.0, Viewer3dOptions.pickEdges·pick(x, y, { edges })) */
  kind: 'mesh' | 'line' | 'point' | 'edge';
  /** Mesh3d·LineSet3d·PointSet3d의 id('edge'면 그 윤곽선을 가진 그물 id) */
  id: string;
  /** 선분·점의 원본 식별 번호(segmentIds·pointIds), 그물이면 삼각형 번호, 'edge'면 Mesh3d.edges의 선분 번호 */
  index: number;
  /** 고른 세계 좌표(묶음 origin을 더한 값) */
  point: [number, number, number];
  /** 배열 안 번호(segmentIds·pointIds를 거치기 전 선분·점 번호, 그물이면 삼각형 번호) — setLineDrawRange와 짝 맞출 때 */
  raw?: number;
  /** 그물이면 맞은 면의 세계 법선(눈 쪽을 향함) */
  normal?: [number, number, number];
  /** 단면 보기에서 그물의 잘린 면(채운 면)을 골랐으면 true — 이때 point는 단면 평면 위, normal은 평면 법선, index·raw는 −1 */
  section?: boolean;
}
