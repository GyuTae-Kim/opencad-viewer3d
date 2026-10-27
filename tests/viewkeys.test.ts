/**
 * 0.10.0 표준 뷰 키 표(VIEW_KEYS)를 작은 모듈(opencad-viewer3d/camera)에서도 내보낸다: 입구·viewer와 같은 객체이고,
 * camera 모듈은 뷰어·그리기(WebGL)를 끌어오지 않아 코어 입구를 나눠 받는 앱이 첫 화면에서 쓸 수 있다
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VIEW_KEYS as camKeys, VIEW_DIRS } from '../src/camera';
import * as entry from '../src/index';
import { VIEW_KEYS as viewerKeys } from '../src/viewer';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** package.json exports로 하위 경로 하나를 푼다(문자열 대상과 "./*" 꼴만 — 이 저장소가 쓰는 것) */
function resolveExport(sub: string): string | null {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  const key = `./${sub}`;
  if (typeof pkg.exports[key] === 'string') return pkg.exports[key];
  for (const [k, v] of Object.entries(pkg.exports)) {
    const star = k.indexOf('*');
    if (star < 0 || typeof v !== 'string') continue;
    const pre = k.slice(0, star), post = k.slice(star + 1);
    if (key.startsWith(pre) && key.endsWith(post) && key.length >= pre.length + post.length) return v.replace('*', key.slice(pre.length, key.length - post.length));
  }
  return null;
}

/** 모듈이 값으로 가져오는 src 모듈 모두(import type은 빌드에서 지워지므로 뺀다) */
function valueImports(file: string, seen = new Set<string>()): Set<string> {
  if (seen.has(file)) return seen;
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/^\s*(import|export)\s+(type\s+)?([^;]*?)\s+from\s+'(\.[^']+)'/gm)) {
    if (m[2]) continue;
    // import { type A, type B } 처럼 모두 type인 것도 지워진다
    const names = /\{([^}]*)\}/.exec(m[3]!)?.[1];
    if (names !== undefined && names.split(',').every((n) => !n.trim() || /^type\s/.test(n.trim()))) continue;
    valueImports(join(dirname(file), `${m[4]}.ts`), seen);
  }
  return seen;
}

describe('VIEW_KEYS', () => {
  it('opencad-viewer3d/camera가 package.json exports로 src/camera.ts에 닿는다', () => {
    expect(resolveExport('camera')).toBe('./src/camera.ts');
  });

  it('camera·입구·viewer가 같은 표(같은 객체)를 내보내고, 1~7 표준 뷰 그대로다', () => {
    expect(entry.VIEW_KEYS).toBe(camKeys);
    expect(viewerKeys).toBe(camKeys);
    expect(camKeys).toEqual({ '1': 'front', '2': 'back', '3': 'left', '4': 'right', '5': 'top', '6': 'bottom', '7': 'seIso' });
    for (const v of Object.values(camKeys)) expect(VIEW_DIRS[v]).toBeDefined();
    expect(entry.VIEW_LABELS).toBeDefined();
  });

  it('camera 모듈은 뷰어·그리기·셰이더를 값으로 가져오지 않는다(작은 하위 경로)', () => {
    const mods = [...valueImports(join(root, 'src/camera.ts'))].map((f) => f.slice(root.length + 1)).sort();
    for (const heavy of ['src/viewer.ts', 'src/renderer.ts', 'src/shaders.ts', 'src/upload.ts', 'src/index.ts']) expect(mods).not.toContain(heavy);
    const bytes = mods.reduce((s, f) => s + readFileSync(join(root, f)).length, 0);
    // 지금 camera·bounds·math 셋(약 30 KB 원본). 크게 늘면 무엇이 끌려왔는지 본다
    expect(bytes).toBeLessThan(64 * 1024);
  });
});
