/**
 * 앱이 맡은 포인터 기록(0.32.0 — Viewer3d.setPointerClaim·claimPointer가 쓴다). 순수(DOM 없음).
 *
 * 맡은 포인터마다 종류·누른 자리·지금 자리·알릴 곳(앱 처리기 — 처리기를 바꾸거나 끄면 떼어 null)을 맡은 차례대로 둔다.
 * 맡은 포인터의 움직임·떼기는 코어가 끌기·고르기에 쓰지 않고 알릴 곳에만 넘긴다.
 * 앱이 맡지 않은 손가락이 닿으면 코어가 앱이 맡은 손가락을 모두 돌려받아 두 손가락 몸짓을 한다(takesBackTouches).
 */
import { isTouch } from './pointer';

/** 맡은 포인터 하나(좌표는 캔버스 기준 CSS 화소) */
export interface PointerHold<H> {
  readonly id: number;
  /** 포인터 종류('mouse'·'touch'·'pen' — 빈 값은 'mouse') */
  readonly type: string;
  /** 누른 자리(코어가 먼저 받았던 포인터를 맡았으면 그때 누른 자리) */
  readonly sx: number;
  readonly sy: number;
  /** 마지막으로 본 자리 */
  x: number;
  y: number;
  /** 알릴 곳(없으면 알리지 않고 뗄 때까지 무시만 한다) */
  on: H | null;
}

export class PointerHolds<H> {
  private readonly m = new Map<number, PointerHold<H>>();

  /** 맡은 포인터 수 */
  get size(): number {
    return this.m.size;
  }

  has(id: number): boolean {
    return this.m.has(id);
  }

  get(id: number): PointerHold<H> | null {
    return this.m.get(id) ?? null;
  }

  /** 맡은 포인터 id(맡은 차례) */
  ids(): number[] {
    return [...this.m.keys()];
  }

  /** 맡은 기록(맡은 차례 — 사본 목록, 기록 객체는 같다) */
  list(): PointerHold<H>[] {
    return [...this.m.values()];
  }

  /** 맡는다(같은 id를 다시 맡으면 앞 기록을 버리고 끝에 둔다) */
  hold(id: number, type: string, sx: number, sy: number, x: number, y: number, on: H | null): PointerHold<H> {
    this.m.delete(id);
    const h: PointerHold<H> = { id, type: type || 'mouse', sx, sy, x, y, on };
    this.m.set(id, h);
    return h;
  }

  /** 맡은 포인터가 움직였으면 자리를 고치고 그 기록을, 아니면 null */
  move(id: number, x: number, y: number): PointerHold<H> | null {
    const h = this.m.get(id);
    if (!h) return null;
    h.x = x;
    h.y = y;
    return h;
  }

  /** 뗐다(맡은 포인터였으면 빼고 그 기록을, 아니면 null) */
  release(id: number): PointerHold<H> | null {
    const h = this.m.get(id);
    if (!h) return null;
    this.m.delete(id);
    return h;
  }

  /** 맡은 손가락(터치)을 모두 빼서 맡은 차례대로 돌려준다(코어가 돌려받을 때) */
  takeTouches(): PointerHold<H>[] {
    const out: PointerHold<H>[] = [];
    for (const h of this.m.values()) if (isTouch(h.type)) out.push(h);
    for (const h of out) this.m.delete(h.id);
    return out;
  }

  /** 알릴 곳이 on인 기록에서 알릴 곳을 떼고(뗄 때까지 무시만 한다) 그 기록들을 돌려준다 */
  detach(on: H): PointerHold<H>[] {
    const out: PointerHold<H>[] = [];
    for (const h of this.m.values())
      if (h.on === on) {
        h.on = null;
        out.push(h);
      }
    return out;
  }

  clear(): void {
    this.m.clear();
  }
}

/**
 * 새로 누른 포인터를 앱이 맡지 않았을 때 코어가 앱이 맡은 손가락을 돌려받는지:
 * 새 누르기가 손가락이고 앱이 맡은 포인터 가운데 손가락이 하나라도 있으면 true(마우스·펜 누르기, 앱이 마우스·펜만 맡았을 때는 false)
 */
export function takesBackTouches(pointerType: string | null | undefined, held: Iterable<{ readonly type: string }>): boolean {
  if (!isTouch(pointerType)) return false;
  for (const h of held) if (isTouch(h.type)) return true;
  return false;
}
