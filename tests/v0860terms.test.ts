/**
 * 0.86.0 코어 기본 글의 현장 용어(86차 — 앱 화면 글을 현장 용어로 바꿀 때 「이번엔 앱만」으로 미룬 코어 몫): 앱이 틀을 주지 않으면 화면 읽기 프로그램·알림에 나오는
 * 키보드 스냅 기본 글(SNAP_KIND_LABELS·KEY_SNAP_MESSAGES)과 장면 경고 기본 글(SCENE_ISSUE_MESSAGES)을 앱과 같은 말로 —
 * 가운데 점 → 중간점, 수직 발 → 수직점, 붙잡을 점이 없습니다 → 스냅할 점이 없습니다, 붙잡지 않은 점 → 스냅하지 않은 점, 그물 → 메시.
 * 바뀌는 것은 기본 값뿐이다 — 열쇠·공개 API 이름은 그대로라 앱이 주는 틀·글 함수는 그대로 맞는다
 */
import { describe, expect, it } from 'vitest';
import * as entry from '../src/index';
import {
  KEY_SNAP_MESSAGES,
  type KeySnapMessageFn,
  PICK_KIND_LABELS,
  SNAP_KIND_LABELS,
  candidateText,
  formatKeySnapMessage,
  keySnapMessages,
  keySnapText,
  snapKindText,
} from '../src/keysnap';
import { SCENE_ISSUE_MESSAGES } from '../src/sceneissues';

/** 앱 화면 글에서 바꾼 옛 용어(이 낱말이 든 기본 글은 없어야 한다) */
const OLD = ['가운데 점', '수직 발', '붙잡', '그물', '단추', '평문', '방언', '제품 나무', '몸체'];

const num = (v: number): string => String(v);

describe('기본 글 표·틀에 옛 용어가 없다', () => {
  it('SNAP_KIND_LABELS·KEY_SNAP_MESSAGES·PICK_KIND_LABELS·SCENE_ISSUE_MESSAGES의 모든 값', () => {
    const tables: Record<string, Readonly<Record<string, string>>> = { SNAP_KIND_LABELS, KEY_SNAP_MESSAGES, PICK_KIND_LABELS, SCENE_ISSUE_MESSAGES };
    for (const [name, t] of Object.entries(tables))
      for (const [k, v] of Object.entries(t)) for (const w of OLD) expect(v, `${name}.${k}`).not.toContain(w);
  });

  it('바꾼 값은 앱의 새 글(중간점·수직점·스냅)이고, 종류 이름 표와 snap.* 틀은 같은 글이다', () => {
    expect(SNAP_KIND_LABELS.midpoint).toBe('중간점');
    expect(SNAP_KIND_LABELS.perpendicular).toBe('수직점');
    expect(KEY_SNAP_MESSAGES['snap.midpoint']).toBe('중간점');
    expect(KEY_SNAP_MESSAGES['snap.perpendicular']).toBe('수직점');
    expect(KEY_SNAP_MESSAGES.noSnap).toBe('스냅할 점이 없습니다');
    expect(KEY_SNAP_MESSAGES['snap.none']).toBe('스냅하지 않은 점');
    expect(SCENE_ISSUE_MESSAGES.bounds).toBe('장면 범위(bounds)가 유한하지 않아 메시에서 다시 셌습니다');
    for (const [k, v] of Object.entries(SNAP_KIND_LABELS)) expect(KEY_SNAP_MESSAGES[`snap.${k}` as keyof typeof KEY_SNAP_MESSAGES], k).toBe(v);
  });

  it('열쇠는 그대로다(종류 열 가지, 틀 39개 — 한글이 든 틀 수도 그대로)', () => {
    expect(Object.keys(SNAP_KIND_LABELS)).toEqual(['vertex', 'endpoint', 'midpoint', 'center', 'point', 'intersection', 'perpendicular', 'axis', 'parallel', 'tangent']);
    const keys = Object.keys(KEY_SNAP_MESSAGES);
    expect(keys).toHaveLength(39);
    for (const k of ['noSnap', 'snap.midpoint', 'snap.perpendicular', 'snap.none']) expect(keys, k).toContain(k);
    expect(keys.filter((k) => /[가-힣]/.test(KEY_SNAP_MESSAGES[k as keyof typeof KEY_SNAP_MESSAGES]))).toHaveLength(34);
    expect(Object.keys(SCENE_ISSUE_MESSAGES)).toContain('bounds');
  });
});

describe('앱이 틀을 주지 않을 때의 알림 글', () => {
  it('종류 이름·잠근 선 위·스냅하지 않은 점·후보 없음', () => {
    expect(snapKindText('midpoint')).toBe('중간점');
    expect(snapKindText('perpendicular')).toBe('수직점');
    expect(snapKindText('perpendicular', undefined, true)).toBe('잠근 선 위 수직점');
    expect(snapKindText(null)).toBe('스냅하지 않은 점');
    expect(candidateText({ kind: 'midpoint', point: [1, 2, 3] }, 0, 2, num, null, '')).toBe('중간점 1/2: X 1, Y 2, Z 3');
    expect(candidateText({ kind: null, point: [1, 2, 3] }, 1, 2, num, 4, 'mm')).toBe('스냅하지 않은 점 2/2: X 1, Y 2, Z 3, 거리 4 mm');
    expect(candidateText(null, 0, 0, num, null, '')).toBe('스냅할 점이 없습니다');
  });

  it('앱이 같은 열쇠로 준 틀은 그대로 이긴다', () => {
    const en = keySnapMessages({ 'snap.midpoint': 'Midpoint', 'snap.perpendicular': 'Perpendicular', 'snap.none': 'Unsnapped point', noSnap: 'No point to snap to' });
    expect(snapKindText('midpoint', undefined, false, en)).toBe('Midpoint');
    expect(snapKindText('perpendicular', undefined, false, en)).toBe('Perpendicular');
    expect(snapKindText(null, undefined, false, en)).toBe('Unsnapped point');
    expect(candidateText(null, 0, 0, num, null, '', en)).toBe('No point to snap to');
  });

  it('코어 기본 한국어 틀을 앱 사전 열쇠로 찾는 글 함수는 새 글 열쇠로 옮기고, 사전에 없는 열쇠는 코어 기본 글', () => {
    const dict: Record<string, string> = { 중간점: 'Midpoint', 수직점: 'Perpendicular', '스냅할 점이 없습니다': 'No point to snap to', '스냅하지 않은 점': 'Unsnapped point' };
    const fn: KeySnapMessageFn = (key, values) => {
      const t = dict[KEY_SNAP_MESSAGES[key]];
      return t === undefined ? undefined : formatKeySnapMessage(t, values);
    };
    expect(keySnapText(fn, 'snap.midpoint')).toBe('Midpoint');
    expect(keySnapText(fn, 'snap.perpendicular')).toBe('Perpendicular');
    expect(snapKindText(null, undefined, false, fn)).toBe('Unsnapped point');
    expect(candidateText(null, 0, 0, num, null, '', fn)).toBe('No point to snap to');
    expect(keySnapText(fn, 'snap.endpoint')).toBe('끝점');
  });

  it('입구가 같은 표를 내보낸다', () => {
    expect(entry.SNAP_KIND_LABELS).toBe(SNAP_KIND_LABELS);
    expect(entry.KEY_SNAP_MESSAGES).toBe(KEY_SNAP_MESSAGES);
    expect(entry.SCENE_ISSUE_MESSAGES).toBe(SCENE_ISSUE_MESSAGES);
  });
});
