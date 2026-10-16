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
  /** 해석 중 생긴 알림(지원하지 않는 요소 등) — 화면에 목록으로 보인다 */
  warnings?: string[];
  /** 형식별 추가 정보(뷰어는 보지 않는다. 화면 패널이 쓴다) */
  meta?: Record<string, unknown>;
}

/** 뷰어가 고르기 결과로 돌려주는 것 */
export interface Pick3d {
  kind: 'mesh' | 'line' | 'point';
  /** Mesh3d·LineSet3d·PointSet3d의 id */
  id: string;
  /** 선분·점의 원본 식별 번호(segmentIds·pointIds), 그물이면 삼각형 번호 */
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
