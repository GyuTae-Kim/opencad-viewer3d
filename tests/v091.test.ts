/** 0.9.1: 누르기로 받은 초점의 테두리 감추기(키보드로 먼저 초점을 준 캔버스) */
import { describe, expect, it } from 'vitest';
import { CANVAS_FOCUS_CSS, type FocusRingTarget, POINTER_FOCUS_ATTR, focusKey, focusLeft, pointerFocus } from '../src/theme';

/** 가짜 캔버스: 초점 호출·속성만 기록한다 */
function fakeCanvas(): FocusRingTarget & { attrs: Map<string, string>; focusCalls: (FocusOptions | undefined)[]; doc: { activeElement: unknown } } {
  const doc: { activeElement: unknown } = { activeElement: null };
  const el = {
    attrs: new Map<string, string>(),
    focusCalls: [] as (FocusOptions | undefined)[],
    doc,
    ownerDocument: doc,
    focus(o?: FocusOptions) {
      el.focusCalls.push(o);
      doc.activeElement = el;
    },
    setAttribute(n: string, v: string) {
      el.attrs.set(n, v);
    },
    removeAttribute(n: string) {
      el.attrs.delete(n);
    },
  };
  return el;
}

/** 규칙 하나의 선택자 구체성(이 파일의 단순한 선택자만 — :where() 안은 0) */
function specificity(sel: string): [number, number, number] {
  const s = sel.replace(/:where\([^)]*\)/g, '');
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const cls = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) ?? []).length;
  const types = (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [ids, cls, types];
}

const rules = (css: string): { sel: string; body: string }[] => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1]!.trim(), body: m[2]! }));

describe('초점 테두리: 누르기로 받은 초점', () => {
  it('보이기 규칙 뒤에 누르기 초점(data-v3d-focus="pointer")에서 감추는 규칙이 있고, !important는 없다', () => {
    const r = rules(CANVAS_FOCUS_CSS);
    expect(r.map((x) => x.sel)).toEqual([':where(canvas.v3d-gl)', ':where(canvas.v3d-gl):focus-visible', `canvas.v3d-gl[${POINTER_FOCUS_ATTR}=pointer]:focus-visible`]);
    expect(r[1]!.body).toMatch(/outline:2px solid var\(--v3d-focus,/);
    expect(r[2]!.body).toBe('outline:none');
    expect(CANVAS_FOCUS_CSS).not.toMatch(/!important/);
    expect(POINTER_FOCUS_ATTR).toBe('data-v3d-focus');
  });

  it('기본 규칙은 구체성이 낮아(0,1,0) 앱이 바꾸기 쉽고, 감추는 규칙(0,3,1)은 앱의 .v3d-gl:focus-visible·전역 :focus-visible을 이긴다', () => {
    const r = rules(CANVAS_FOCUS_CSS);
    expect(specificity(r[1]!.sel)).toEqual([0, 1, 0]);
    expect(specificity(r[2]!.sel)).toEqual([0, 3, 1]);
    const app = specificity('.v3d-gl:focus-visible');
    expect(app).toEqual([0, 2, 0]);
    const cmp = (a: number[], b: number[]): number => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!;
    expect(cmp(specificity(r[2]!.sel), app)).toBeGreaterThan(0);
    expect(cmp(specificity(r[2]!.sel), specificity(':focus-visible'))).toBeGreaterThan(0);
  });

  it('누르면 테두리 없이(focusVisible: false, 화면 스크롤 없이) 초점을 주고 누르기 표시를 단다 — 이미 초점이 있어도', () => {
    const c = fakeCanvas();
    pointerFocus(c);
    expect(c.focusCalls).toEqual([{ preventScroll: true, focusVisible: false }]);
    expect(c.attrs.get(POINTER_FOCUS_ATTR)).toBe('pointer');
    // 키보드(Tab)로 초점을 받은 캔버스: 초점은 그대로라 브라우저가 :focus-visible을 지키므로 표시가 감춘다
    c.attrs.clear();
    c.doc.activeElement = c;
    pointerFocus(c);
    expect(c.attrs.get(POINTER_FOCUS_ATTR)).toBe('pointer');
  });

  it('Tab·Shift+Tab을 누르면 표시를 뗀다. 다른 키(F·숫자·걷기 키)와 Ctrl·⌘·Alt+Tab은 그대로', () => {
    const c = fakeCanvas();
    for (const e of [{ key: 'f' }, { key: '1' }, { key: 'w' }, { key: 'Escape' }, { key: 'Shift' }, { key: 'Tab', ctrlKey: true }, { key: 'Tab', metaKey: true }, { key: 'Tab', altKey: true }]) {
      pointerFocus(c);
      focusKey(c, e);
      expect(c.attrs.has(POINTER_FOCUS_ATTR), e.key).toBe(true);
    }
    focusKey(c, { key: 'Tab' });
    expect(c.attrs.has(POINTER_FOCUS_ATTR)).toBe(false);
    pointerFocus(c);
    focusKey(c, { key: 'Tab', shiftKey: true } as { key: string });
    expect(c.attrs.has(POINTER_FOCUS_ATTR)).toBe(false);
  });

  it('초점이 문서 안 다른 곳으로 가면 떼고, 창만 흐려지면(문서 초점은 캔버스 그대로) 둔다', () => {
    const c = fakeCanvas();
    pointerFocus(c);
    focusLeft(c); // 다른 앱·탭으로: document.activeElement는 캔버스 그대로
    expect(c.attrs.get(POINTER_FOCUS_ATTR)).toBe('pointer');
    c.doc.activeElement = { id: 'body' }; // 문서 안에서 옮김: blur 때 activeElement는 body(Chrome 156에서 확인)
    focusLeft(c);
    expect(c.attrs.has(POINTER_FOCUS_ATTR)).toBe(false);
  });
});
