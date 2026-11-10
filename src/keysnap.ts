/**
 * 키보드로 3D 붙잡기·고르기(0.46.0, 순수 함수 — DOM·WebGL 없음). Viewer3d.setKeyboardSnap이 쓰고, 앱이 같은 키 표·글을 쓰도록 입구에서 내보낸다.
 *
 * - 가상 커서: 3D 보기(캔버스)에 초점이 있을 때 화살표로 커서를 옮긴다(한 번에 step CSS 화소, Shift를 함께 누르면 bigStep).
 *   마우스 커서와 같은 자리 규칙으로 측정 점을 붙잡는다(포인터 종류 KEY_POINTER — 터치가 아니므로 마우스·펜 허용 거리).
 * - 후보 돌리기: Tab·Shift+Tab(AutoCAD 객체 스냅의 Tab 돌리기). 커서가 켜진 동안만 Tab을 받는다 — 켜기 전·끈 뒤 Tab은 브라우저 초점 이동 그대로(WCAG 2.1.2)
 * - 찍기: Enter(측정 점 — 측정 모드, 고르기 — 측정 모드가 아닐 때). 끄기: Esc(뷰 큐브 접기·측정 지우기가 먼저)
 *
 * 키 글(KeyboardEvent.key)은 앞에 'Shift+'·'Alt+'·'Ctrl+'·'Meta+'를 붙일 수 있다. 옮기기·찍기는 Shift를 적지 않아도 Shift와 함께 받는다(옮기기는 크게, 찍기는 Shift가
 * 고르기 알림의 shiftKey로 간다). 그 밖은 적은 수정 키와 꼭 같아야 한다.
 */
import type { SnapAxis } from './inference';
import type { SnapKind } from './types';

/** 키보드 붙잡기 할 일: 커서 옮기기 넷, 다음·앞 후보, 찍기(고르기), 커서 끄기 */
export type KeySnapAction = 'left' | 'right' | 'up' | 'down' | 'next' | 'prev' | 'commit' | 'exit';

/** 할 일 → 키 글 목록(빈 목록이면 그 할 일을 끈다) */
export type KeySnapKeys = Readonly<Record<KeySnapAction, readonly string[]>>;

/**
 * 기본 키 표. 화살표·Enter는 WAI-ARIA 복합 위젯(초점 안에서 화살표로 옮기고 Enter로 고른다), Tab·Shift+Tab은 AutoCAD 객체 스냅 돌리기,
 * Esc는 코어 측정 지우기 뒤 커서 끄기다. F·1~7(뷰어 키)·H·I·Home·F7·Space·T·PageUp·PageDown(세 앱 키)과 겹치지 않는다
 */
export const KEY_SNAP_KEYS: KeySnapKeys = {
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  next: ['Tab'],
  prev: ['Shift+Tab'],
  commit: ['Enter'],
  exit: ['Escape'],
};

/** 화살표 한 번에 가상 커서가 움직이는 CSS 화소(붙잡기 거리 SNAP_PX 10의 절반 — 걸음 사이로 붙잡을 점을 건너뛰지 않는다) */
export const KEY_STEP_PX = 5;
/** Shift+화살표 한 번(걸음의 10배) */
export const KEY_BIG_STEP_PX = 50;
/** 한 자리에서 돌리는 후보 수 한도 */
export const KEY_CANDIDATES_MAX = 16;
/** 가상 커서가 고르기·붙잡기에 넘기는 포인터 종류(터치가 아니므로 마우스·펜 허용 거리, 고르기 알림의 pointerType) */
export const KEY_POINTER = 'keyboard';

const ACTIONS: readonly KeySnapAction[] = ['left', 'right', 'up', 'down', 'next', 'prev', 'commit', 'exit'];

/** 키 글 하나를 푼 것 */
export interface KeyDesc {
  key: string;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  meta: boolean;
}

/** 'Shift+Tab' 같은 키 글 → 키와 수정 키(키가 비었거나 모르는 수정 키면 null). 마지막 '+' 뒤가 키다('Shift++'는 Shift와 '+') */
export function parseKeyDesc(s: string): KeyDesc | null {
  if (typeof s !== 'string' || !s) return null;
  const parts = s.split('+');
  let key = parts.pop()!;
  // 'Shift++'·'+': 끝이 '+'면 그것이 키
  if (key === '' && parts.length && parts[parts.length - 1] === '') {
    parts.pop();
    key = '+';
  }
  if (!key) return null;
  const d: KeyDesc = { key, shift: false, alt: false, ctrl: false, meta: false };
  for (const m of parts) {
    const n = m.toLowerCase();
    if (n === 'shift') d.shift = true;
    else if (n === 'alt' || n === 'option') d.alt = true;
    else if (n === 'ctrl' || n === 'control') d.ctrl = true;
    else if (n === 'meta' || n === 'cmd' || n === 'command') d.meta = true;
    else return null;
  }
  return d;
}

/** 앱이 준 키 표를 기본 표와 합친다(할 일마다 준 목록이 기본을 바꾼다 — 빈 목록·null은 끔, 글이 아닌 것·풀 수 없는 글은 뺀다) */
export function normalizeKeySnapKeys(keys?: Partial<Record<KeySnapAction, readonly string[] | null>> | null): KeySnapKeys {
  const out = {} as Record<KeySnapAction, readonly string[]>;
  for (const a of ACTIONS) {
    const given = keys && Object.prototype.hasOwnProperty.call(keys, a) ? keys[a] : undefined;
    if (given === undefined) out[a] = KEY_SNAP_KEYS[a];
    else out[a] = Array.isArray(given) ? given.filter((s): s is string => !!parseKeyDesc(s as string)) : [];
  }
  return out;
}

const sameKey = (want: string, got: string): boolean => (want.length === 1 && got.length === 1 ? want.toLowerCase() === got.toLowerCase() : want === got);

/** Shift를 적지 않아도 Shift와 함께 받는 할 일(옮기기 = 크게, 찍기 = 고르기 알림의 shiftKey) */
const SHIFT_OK = new Set<KeySnapAction>(['left', 'right', 'up', 'down', 'commit']);

/**
 * 키 사건 → 할 일과 크게 옮기는지(없으면 null). 수정 키를 꼭 같게 적은 키가 먼저다(예: 앱이 'Shift+ArrowRight'를 다른 할 일에 두면 그것) —
 * 그다음 옮기기·찍기는 Shift를 적지 않은 키도 Shift와 함께 받는다(옮기기면 big)
 */
export function keySnapAction(
  e: { key?: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean },
  keys: KeySnapKeys = KEY_SNAP_KEYS,
): { action: KeySnapAction; big: boolean } | null {
  const k = e.key;
  if (typeof k !== 'string' || !k) return null;
  const shift = !!e.shiftKey, alt = !!e.altKey, ctrl = !!e.ctrlKey, meta = !!e.metaKey;
  for (const loose of [false, true])
    for (const a of ACTIONS) {
      if (loose && !SHIFT_OK.has(a)) continue;
      for (const s of keys[a]) {
        const d = parseKeyDesc(s);
        if (!d || !sameKey(d.key, k) || d.alt !== alt || d.ctrl !== ctrl || d.meta !== meta) continue;
        if (!loose && d.shift === shift) return { action: a, big: false };
        if (loose && !d.shift && shift) return { action: a, big: a !== 'commit' };
      }
    }
  return null;
}

/** 가상 커서를 한 걸음 옮긴 자리(캔버스 0 ~ width·height 안으로 당긴다). 옮기는 할 일이 아니면 그대로 */
export function moveKeyCursor(
  at: { x: number; y: number },
  action: KeySnapAction,
  big: boolean,
  step: number,
  bigStep: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const s = big ? bigStep : step;
  const dx = action === 'left' ? -s : action === 'right' ? s : 0;
  const dy = action === 'up' ? -s : action === 'down' ? s : 0;
  const clamp = (v: number, hi: number): number => Math.min(Math.max(v, 0), Math.max(0, hi));
  return { x: clamp(at.x + dx, width), y: clamp(at.y + dy, height) };
}

/** 붙잡은 종류의 한국어 이름(코어 기본 알림 글) */
export const SNAP_KIND_LABELS: Readonly<Record<SnapKind, string>> = {
  vertex: '꼭짓점',
  endpoint: '끝점',
  midpoint: '가운데 점',
  center: '중심',
  point: '점',
  intersection: '교차점',
  perpendicular: '수직 발',
  axis: '축',
  parallel: '나란한 선',
  tangent: '접점',
};

/**
 * 0.47.0 키보드 알림 글 틀(코어 기본 — 한국어). 앱은 setKeyboardSnap({ messages })로 열쇠마다 제 언어 틀을 준다({0}·{1}… 자리 — 세 앱 다국어 사전과 같은 꼴, 자리 차례는 틀이 정한다).
 * 0.53.0: 틀 대신 글 함수(KeySnapMessageFn — 열쇠·값 → 글)도 받는다.
 * 이 기본 틀로 만든 글은 0.46.0 글과 바이트까지 같다
 */
export const KEY_SNAP_MESSAGES = {
  /** 켰다: {0} 지금 후보 글, {1} 키 안내 */
  start: '가상 커서를 켰습니다. {0}. {1}',
  end: '가상 커서를 껐습니다',
  /** 후보가 하나뿐인 자리에서 돌렸다: {0} 후보 글 */
  only: '{0} (후보 하나)',
  /** 후보 글: {0} 종류(차례가 있으면 order), {1} 점 글 */
  candidate: '{0}: {1}',
  /** 측정 첫 점 뒤 후보 글: {0} 종류, {1} 점 글, {2} 첫 점에서 거리(단위 포함) */
  candidateDistance: '{0}: {1}, 거리 {2}',
  /** 차례: {0} 종류(고른 것), {1} 차례(1부터), {2} 수 */
  order: '{0} {1}/{2}',
  /** 점 글: {0}·{1}·{2} X·Y·Z(측정 글과 같은 수 꼴) */
  point: 'X {0}, Y {1}, Z {2}',
  noSnap: '붙잡을 점이 없습니다',
  /** 고른 것: {0} 묶음 이름(없으면 id), {1} 종류(pick.*) */
  pickItem: '{0} {1}',
  noPick: '고를 것이 없습니다',
  /** 고르기 모드 Enter: {0} 고른 것(pickItem) */
  picked: '골랐습니다: {0}',
  pickedNothing: '빈 곳을 골랐습니다',
  noPoint: '찍을 점이 없습니다',
  /** 측정 첫 점을 찍었다: {0} 종류, {1} 점 글 */
  firstPoint: '첫 점을 찍었습니다. {0}: {1}',
  /** 둘째 점: {0} 거리(단위 포함), {1}·{2}·{3} X·Y·Z 차 */
  secondPoint: '둘째 점을 찍었습니다. 거리 {0}, X 차 {1}, Y 차 {2}, Z 차 {3}',
  /** 축 위 점: {0} 'X'·'Y'·'Z' */
  axisKind: '{0}축',
  /** 잠근 선 위: {0} 종류 */
  lockedKind: '잠근 선 위 {0}',
  /** 키 안내: {0} 키 */
  hintMove: '옮기기 {0}',
  hintNext: '후보 {0}',
  hintCommit: '찍기 {0}',
  hintPick: '고르기 {0}',
  hintExit: '끄기 {0}',
  /** 키 안내 사이 */
  hintJoin: ' · ',
  'snap.vertex': '꼭짓점',
  'snap.endpoint': '끝점',
  'snap.midpoint': '가운데 점',
  'snap.center': '중심',
  'snap.point': '점',
  'snap.intersection': '교차점',
  'snap.perpendicular': '수직 발',
  'snap.axis': '축',
  'snap.parallel': '나란한 선',
  'snap.tangent': '접점',
  /** 붙잡지 않은 점 */
  'snap.none': '붙잡지 않은 점',
  'pick.mesh': '면',
  'pick.line': '선분',
  'pick.edge': '모서리',
  'pick.point': '점',
  /** 단면의 잘린 면 */
  'pick.section': '잘린 면',
} as const;

/** 키보드 알림 글 틀 열쇠(0.47.0) */
export type KeySnapMessageKey = keyof typeof KEY_SNAP_MESSAGES;
/** 키보드 알림 글 틀 전체(0.47.0 — 열쇠마다 틀 글) */
export type KeySnapMessages = Readonly<Record<KeySnapMessageKey, string>>;

/** 앱이 준 틀을 기본 틀과 합친다(0.47.0 — 준 열쇠만 바꾸고, 글이 아닌 값·모르는 열쇠는 뺀다) */
export function keySnapMessages(m?: Partial<Record<KeySnapMessageKey, string>> | null): KeySnapMessages {
  const out: Record<string, string> = { ...KEY_SNAP_MESSAGES };
  if (m && typeof m === 'object')
    for (const k of Object.keys(KEY_SNAP_MESSAGES)) {
      const v = (m as Record<string, unknown>)[k];
      if (typeof v === 'string') out[k] = v;
    }
  return out as KeySnapMessages;
}

/** 틀 글의 {0}·{1}… 자리를 값으로 바꾼다(0.47.0 — 값이 없는 자리는 그대로, 값 글의 '$' 등은 그대로 넣는다) */
export function formatKeySnapMessage(t: string, args: readonly (string | number)[]): string {
  return t.replace(/\{(\d+)\}/g, (s, n: string) => (Number(n) < args.length ? String(args[Number(n)]) : s));
}

/**
 * 0.53.0 알림 글 함수(setKeyboardSnap({ messages }) — 열쇠마다 틀 객체 대신): 열쇠와 값(그 열쇠 틀의 {0}·{1}… 자리 차례 그대로 — 종류 이름 같은 조각 글은
 * 이 함수가 앞서 만든 글이 값으로 들어온다)으로 글 하나를 만든다. 앱이 제 번역 함수(ICU 메시지·복수형)로 잇는다 — 짧은 틀('{0}: {1}' 같은 것)을 앱 번역 사전에 넣지 않아도 된다.
 * 글(string)이 아닌 값을 돌려주거나 던지면 그 열쇠의 기본 틀(한국어)로 만든다
 */
export type KeySnapMessageFn = (key: KeySnapMessageKey, values: readonly (string | number)[]) => string | null | undefined;

/** 0.53.0 알림 글 원천: 기본과 합친 틀(KeySnapMessages — 0.47.0) 또는 글 함수(KeySnapMessageFn) */
export type KeySnapText = KeySnapMessages | KeySnapMessageFn;

/** 0.53.0 열쇠 하나의 글: 틀이면 formatKeySnapMessage(틀, 값)(0.47.0과 같은 글), 함수면 그 함수의 글(글이 아니거나 던지면 기본 틀) */
export function keySnapText(msgs: KeySnapText, key: KeySnapMessageKey, values: readonly (string | number)[] = []): string {
  if (typeof msgs !== 'function') return formatKeySnapMessage(msgs[key], values);
  try {
    const s = msgs(key, values);
    if (typeof s === 'string') return s;
  } catch {
    /* 앱 함수의 오류는 기본 글로(키 처리를 끊지 않는다) */
  }
  return formatKeySnapMessage(KEY_SNAP_MESSAGES[key], values);
}

/** 붙잡은 종류 글: 축이면 'X축', 붙잡지 않았으면 '붙잡지 않은 점', 잠근 선 위면 '잠근 선 위 …'(0.47.0 msgs = 글 틀, 0.53.0 글 함수도 — 주지 않으면 기본) */
export function snapKindText(kind: SnapKind | null, axis?: SnapAxis, locked?: boolean, msgs: KeySnapText = KEY_SNAP_MESSAGES): string {
  const k = `snap.${kind}`;
  const base =
    kind === null
      ? keySnapText(msgs, 'snap.none')
      : kind === 'axis' && axis
        ? keySnapText(msgs, 'axisKind', [axis.toUpperCase()])
        : k in KEY_SNAP_MESSAGES
          ? keySnapText(msgs, k as KeySnapMessageKey)
          : String(kind);
  return locked ? keySnapText(msgs, 'lockedKind', [base]) : base;
}

/** 키 글 하나를 읽기 쉬운 글로('ArrowLeft' → '←', 'Escape' → 'Esc', ' ' → 'Space', 수정 키는 그대로) */
export function keyLabel(s: string): string {
  const d = parseKeyDesc(s);
  if (!d) return s;
  const names: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', ' ': 'Space' };
  const mods = `${d.ctrl ? 'Ctrl+' : ''}${d.alt ? 'Alt+' : ''}${d.meta ? 'Meta+' : ''}${d.shift ? 'Shift+' : ''}`;
  return mods + (names[d.key] ?? d.key);
}

/**
 * 키 안내 글(가상 커서를 켤 때 알림 끝에 붙인다): '옮기기 ←→↑↓ · 후보 Tab · 찍기 Enter · 끄기 Esc'. 할 일마다 첫 키, 끈 할 일은 뺀다.
 * mode가 'pick'이면 찍기 대신 고르기이고, 후보 돌리기는 pickCycle일 때만 넣는다(0.47.0 — 주지 않으면 0.46.0처럼 뺀다). msgs = 글 틀(0.47.0)·글 함수(0.53.0 — 주지 않으면 기본)
 */
export function keySnapHint(keys: KeySnapKeys, mode: 'measure' | 'pick', pickCycle = false, msgs: KeySnapText = KEY_SNAP_MESSAGES): string {
  const first = (a: KeySnapAction): string | null => (keys[a].length ? keyLabel(keys[a][0]!) : null);
  const move = (['left', 'right', 'up', 'down'] as const).map(first).filter((s): s is string => !!s);
  const parts: string[] = [];
  if (move.length) parts.push(keySnapText(msgs, 'hintMove', [move.every((s) => s.length === 1) ? move.join('') : move.join(' ')]));
  const nx = mode === 'measure' || pickCycle ? first('next') : null;
  if (nx) parts.push(keySnapText(msgs, 'hintNext', [nx]));
  const cm = first('commit');
  if (cm) parts.push(keySnapText(msgs, mode === 'measure' ? 'hintCommit' : 'hintPick', [cm]));
  const ex = first('exit');
  if (ex) parts.push(keySnapText(msgs, 'hintExit', [ex]));
  return parts.join(keySnapText(msgs, 'hintJoin'));
}

/**
 * 0.56.0 키보드 알림 수의 종류(KeySnapNumberFn 둘째 인자): 'x'·'y'·'z' 점 좌표(세계 좌표 — 장면 단위), 'distance' 거리(측정 첫 점에서 후보까지·둘째 점을 찍은 거리),
 * 'dx'·'dy'·'dz' 둘째 점을 찍은 X·Y·Z 차
 */
export type KeySnapNumberKind = 'x' | 'y' | 'z' | 'distance' | 'dx' | 'dy' | 'dz';

/** 0.56.0 코어 기본 수 글(KeySnapNumberFn 둘째 인자): 종류, 코어 글(측정 글과 같은 소수 자리 — 거리는 단위 글을 붙인 것), 소수 자릿수, 장면 단위 글('mm' 등 — 모르면 빈 글) */
export interface KeySnapNumberCore {
  kind: KeySnapNumberKind;
  text: string;
  digits: number;
  unit: string;
}

/**
 * 0.56.0 키보드 알림 수 꼴(KeyboardSnapOptions.formatNumber — SKP 59·60차 요청): 값과 코어 기본 글 → 앱 글(앱 단위·소수 자리 — 피트·인치 같은 앱 꼴).
 * 돌려준 글을 그 자리에 그대로 넣는다(거리도 — 코어가 단위를 붙이지 않는다). 글이 아니거나 빈 글·예외면 코어 기본 글(core.text)
 */
export type KeySnapNumberFn = (value: number, core: KeySnapNumberCore) => string | null | undefined;

/**
 * 세계 점 글: 'X 1, Y 2, Z 3'(num = 수 꼴 — 뷰어는 측정 글과 같은 자릿수, 0.47.0 msgs = 글 틀, 0.53.0 글 함수도).
 * 0.56.0: num 둘째 인자로 좌표 종류('x'·'y'·'z')를 준다(한 인수 함수는 그대로)
 */
export function pointText(p: readonly number[], num: (v: number, kind: KeySnapNumberKind) => string, msgs: KeySnapText = KEY_SNAP_MESSAGES): string {
  return keySnapText(msgs, 'point', [num(p[0]!, 'x'), num(p[1]!, 'y'), num(p[2]!, 'z')]);
}

/** 후보 글(0.47.0 — 측정·고르기가 함께 쓴다): label에 차례(수가 둘 이상이면 order)를 붙이고 점 글과 거리를 잇는다 */
export function orderedText(label: string, index: number, count: number, point: string, distance: string | null, msgs: KeySnapText = KEY_SNAP_MESSAGES): string {
  const l = count > 1 ? keySnapText(msgs, 'order', [label, index + 1, count]) : label;
  return distance === null ? keySnapText(msgs, 'candidate', [l, point]) : keySnapText(msgs, 'candidateDistance', [l, point, distance]);
}

/**
 * 측정 후보 알림 글: '끝점 1/3: X 1, Y 2, Z 3'(첫 점에서 거리가 있으면 ', 거리 5 mm'). 후보가 없으면 '붙잡을 점이 없습니다'(0.47.0 msgs = 글 틀, 0.53.0 글 함수도).
 * 0.56.0: num 둘째 인자로 수 종류('x'·'y'·'z'·'distance')를 준다. 거리 글은 num(거리, 'distance') 뒤에 unit을 붙인다(뷰어는 단위까지 num이 만들고 unit을 비운다)
 */
export function candidateText(
  c: { kind: SnapKind | null; axis?: SnapAxis | undefined; locked?: boolean | undefined; point: readonly number[] } | null,
  index: number,
  count: number,
  num: (v: number, kind: KeySnapNumberKind) => string,
  distance: number | null,
  unit: string,
  msgs: KeySnapText = KEY_SNAP_MESSAGES,
): string {
  if (!c) return keySnapText(msgs, 'noSnap');
  const u = unit ? ` ${unit}` : '';
  return orderedText(snapKindText(c.kind, c.axis, c.locked, msgs), index, count, pointText(c.point, num, msgs), distance === null ? null : `${num(distance, 'distance')}${u}`, msgs);
}

/** 세 수가 꼭 같은 점인지 */
export function samePoint3(a: readonly number[], b: readonly number[]): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** 점 목록에 꼭 같은 점이 있는지 */
export function inPoints(list: readonly (readonly number[])[], p: readonly number[]): boolean {
  for (const q of list) if (samePoint3(q, p)) return true;
  return false;
}

/** 후보 가운데 뺄 점(skip)과 꼭 같은 자리가 아닌 것만(차례 그대로) */
export function* skipPoints<T extends { p: readonly number[] }>(cands: Iterable<T>, skip: readonly (readonly number[])[]): Generator<T> {
  for (const c of cands) if (!inPoints(skip, c.p)) yield c;
}

/** 고른 것의 종류 이름(그물 = 면, 선분 묶음 = 선분, 그물 윤곽선 = 모서리, 점 묶음 = 점) */
export const PICK_KIND_LABELS: Readonly<Record<'mesh' | 'line' | 'edge' | 'point', string>> = { mesh: '면', line: '선분', edge: '모서리', point: '점' };
