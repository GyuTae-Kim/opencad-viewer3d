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

/** 붙잡은 종류 글: 축이면 'X축', 붙잡지 않았으면 '붙잡지 않은 점', 잠근 선 위면 '잠근 선 위 …' */
export function snapKindText(kind: SnapKind | null, axis?: SnapAxis, locked?: boolean): string {
  const base = kind === null ? '붙잡지 않은 점' : kind === 'axis' && axis ? `${axis.toUpperCase()}축` : SNAP_KIND_LABELS[kind] ?? String(kind);
  return locked ? `잠근 선 위 ${base}` : base;
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
 * mode가 'pick'이면 찍기 대신 고르기이고, 후보 돌리기는 pickCycle일 때만 넣는다(0.47.0 — 주지 않으면 0.46.0처럼 뺀다)
 */
export function keySnapHint(keys: KeySnapKeys, mode: 'measure' | 'pick', pickCycle = false): string {
  const first = (a: KeySnapAction): string | null => (keys[a].length ? keyLabel(keys[a][0]!) : null);
  const move = (['left', 'right', 'up', 'down'] as const).map(first).filter((s): s is string => !!s);
  const parts: string[] = [];
  if (move.length) parts.push(`옮기기 ${move.every((s) => s.length === 1) ? move.join('') : move.join(' ')}`);
  const nx = mode === 'measure' || pickCycle ? first('next') : null;
  if (nx) parts.push(`후보 ${nx}`);
  const cm = first('commit');
  if (cm) parts.push(`${mode === 'measure' ? '찍기' : '고르기'} ${cm}`);
  const ex = first('exit');
  if (ex) parts.push(`끄기 ${ex}`);
  return parts.join(' · ');
}

/** 세계 점 글: 'X 1, Y 2, Z 3'(num = 수 꼴 — 뷰어는 측정 글과 같은 자릿수) */
export function pointText(p: readonly number[], num: (v: number) => string): string {
  return `X ${num(p[0]!)}, Y ${num(p[1]!)}, Z ${num(p[2]!)}`;
}

/** 측정 후보 알림 글: '끝점 1/3: X 1, Y 2, Z 3'(첫 점에서 거리가 있으면 ', 거리 5 mm'). 후보가 없으면 '붙잡을 점이 없습니다' */
export function candidateText(
  c: { kind: SnapKind | null; axis?: SnapAxis | undefined; locked?: boolean | undefined; point: readonly number[] } | null,
  index: number,
  count: number,
  num: (v: number) => string,
  distance: number | null,
  unit: string,
): string {
  if (!c) return '붙잡을 점이 없습니다';
  const u = unit ? ` ${unit}` : '';
  const n = count > 1 ? ` ${index + 1}/${count}` : '';
  return `${snapKindText(c.kind, c.axis, c.locked)}${n}: ${pointText(c.point, num)}${distance === null ? '' : `, 거리 ${num(distance)}${u}`}`;
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
