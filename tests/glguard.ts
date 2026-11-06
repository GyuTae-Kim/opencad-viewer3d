/**
 * 0.50.0 시험 도우미: 가짜 WebGL(FakeGL)의 그리기·균일 변수 호출을 감싸 실제 WebGL2가 문제 삼는 것을 센다.
 * - 그리기 개수가 음수·소수·NaN, 색인 버퍼 밖(offset + count), 정점 버퍼 밖(drawArrays first + count, 색인 최댓값 ≥ 정점 수), 인스턴스 버퍼 밖
 * - 행렬·색·크기 균일 변수에 유한하지 않은 값(그 그리기가 통째로 보이지 않거나 검게 칠해진다)
 * 0xffffffff 색인(WebGL2는 늘 도형 다시 시작으로 읽는다)도 정점 범위 밖으로 센다
 */
import type { FakeGL } from './fakegl';

const BPE: Record<string, number> = { FLOAT: 4, BYTE: 1, UNSIGNED_BYTE: 1, SHORT: 2, UNSIGNED_SHORT: 2, INT: 4, UNSIGNED_INT: 4 };

type Vao = {
  attribs: Map<number, { buf: { bytes: Uint8Array } | null; size: number; stride: number; offset: number; divisor: number; enabled: boolean; type: string }>;
  element: { bytes: Uint8Array } | null;
};

/** gl을 감싼다. 문제가 생길 때마다 bad(종류)를 부른다 */
export function guardGl(gl: FakeGL, bad: (what: string) => void): void {
  const g = gl as unknown as Record<string, unknown> & { vao: Vao };
  const avail = (div: 0 | 1): number => {
    let m = Infinity;
    for (const a of g.vao.attribs.values()) {
      if (!a.enabled || !a.buf || (a.divisor ? 1 : 0) !== div) continue;
      const bpe = BPE[a.type] ?? 4;
      const stride = a.stride || a.size * bpe;
      const room = a.buf.bytes.length - a.offset - a.size * bpe;
      m = Math.min(m, room < 0 ? 0 : Math.floor(room / stride) + 1);
    }
    return m;
  };
  const okCount = (n: number): boolean => Number.isInteger(n) && n >= 0;
  const elems = (count: number, offset: number): void => {
    const el = g.vao.element;
    if (!el) return bad('drawElements: 색인 버퍼 없음');
    if (offset + count * 4 > el.bytes.length) return bad('drawElements: 색인 버퍼 밖');
    const v = avail(0);
    if (v === Infinity || !count) return;
    const idx = new Uint32Array(el.bytes.buffer, el.bytes.byteOffset + offset, count);
    let mx = 0;
    for (let i = 0; i < idx.length; i++) if (idx[i]! > mx) mx = idx[i]!;
    if (mx >= v) bad('drawElements: 정점 범위 밖 색인');
  };
  const wrap = (name: string, f: (a: number[]) => void): void => {
    const orig = (g[name] as (...a: number[]) => void).bind(gl);
    g[name] = (...a: number[]) => {
      f(a);
      orig(...a);
    };
  };
  wrap('drawArrays', ([, first, count]) => {
    if (!okCount(first!) || !okCount(count!)) return bad('drawArrays: 개수');
    if (first! + count! > avail(0)) bad('drawArrays: 정점 버퍼 밖');
  });
  wrap('drawElements', ([, count, , offset]) => {
    if (!okCount(count!) || !okCount(offset!)) return bad('drawElements: 개수');
    elems(count!, offset!);
  });
  wrap('drawArraysInstanced', ([, first, count, n]) => {
    if (!okCount(first!) || !okCount(count!) || !okCount(n!)) return bad('drawArraysInstanced: 개수');
    if (first! + count! > avail(0)) bad('drawArraysInstanced: 정점 버퍼 밖');
    if (n! > avail(1)) bad('drawArraysInstanced: 인스턴스 버퍼 밖');
  });
  wrap('drawElementsInstanced', ([, count, , offset, n]) => {
    if (!okCount(count!) || !okCount(offset!) || !okCount(n!)) return bad('drawElementsInstanced: 개수');
    elems(count!, offset!);
    if (n! > avail(1)) bad('drawElementsInstanced: 인스턴스 버퍼 밖');
  });
  for (const u of ['uniformMatrix4fv', 'uniform4fv', 'uniformMatrix3fv']) {
    const orig = (g[u] as (...a: unknown[]) => void).bind(gl);
    g[u] = (loc: { name: string } | null, ...rest: unknown[]) => {
      const v = rest[rest.length - 1] as ArrayLike<number>;
      if (loc && v && Array.prototype.some.call(v, (x: number) => !Number.isFinite(x))) bad(`${loc.name}: 유한하지 않음`);
      orig(loc, ...rest);
    };
  }
  for (const u of ['uniform1f', 'uniform2f', 'uniform3f', 'uniform4f']) {
    const orig = (g[u] as (...a: unknown[]) => void).bind(gl);
    g[u] = (loc: { name: string } | null, ...v: number[]) => {
      if (loc && v.some((x) => !Number.isFinite(x))) bad(`${loc.name}: 유한하지 않음`);
      orig(loc, ...v);
    };
  }
}
