// @ts-check
/**
 * 비교할 판(base)의 소스를 git 개체 저장소에서 바로 묶는 Vite 플러그인.
 * 작업 트리를 새로 만들거나 소스를 디스크에 복사하지 않는다: `git ls-tree`로 그 판의 파일 목록을 얻고,
 * 묶음이 `src/` 아래 파일을 찾을 때마다 `git cat-file blob <커밋>:<경로>`로 내용만 읽어 넘긴다.
 */
import { execFileSync } from 'node:child_process';
import { dirname, relative, resolve, sep } from 'node:path';

/** @param {string} repo @param {string[]} args */
export function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * 판 이름(브랜치·태그·SHA·HEAD^1 …) → 커밋 SHA. 없으면 무엇을 하면 되는지 적은 Error.
 * @param {string} repo @param {string} ref
 */
export function resolveCommit(repo, ref) {
  try {
    return git(repo, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
  } catch {
    throw new Error(`git에서 판 "${ref}"를 찾지 못했습니다(얕은 clone이면 git fetch로 그 커밋을 받아 두세요)`);
  }
}

/**
 * 그 커밋의 dir 아래 파일 목록(저장소 기준 '/' 경로)
 * @param {string} repo @param {string} commit @param {string} dir
 */
export function listTree(repo, commit, dir) {
  const out = git(repo, ['ls-tree', '-r', '--name-only', '-z', commit, '--', dir]);
  return out.split('\0').filter(Boolean);
}

const EXTS = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.js'];

/**
 * @param {{ repo: string; commit: string; dir?: string }} o
 * @returns {import('vite').Plugin & { files: Set<string>; loaded: Set<string> }}
 */
export function gitSource({ repo, commit, dir = 'src' }) {
  const root = resolve(repo, dir);
  const files = new Set(listTree(repo, commit, dir));
  if (!files.size) throw new Error(`커밋 ${commit.slice(0, 12)}에 ${dir}/가 없습니다`);
  /** 읽은 파일(보고·시험용) */
  const loaded = new Set();
  /** @param {string} abs */
  const relOf = (abs) => relative(repo, abs).split(sep).join('/');
  /** @param {string} abs */
  const inside = (abs) => abs === root || abs.startsWith(root + sep);

  return {
    name: 'pixels-git-source',
    enforce: 'pre',
    files,
    loaded,
    resolveId(source, importer) {
      if (!importer || !(source.startsWith('./') || source.startsWith('../'))) return null;
      const abs = resolve(dirname(importer.split('?')[0]), source);
      if (!inside(abs)) return null;
      // TS식 './x.js' → './x.ts'도 본다
      const stems = /\.[cm]?js$/.test(abs) ? [abs, abs.replace(/\.([cm]?)js$/, '.$1ts')] : [abs];
      for (const stem of stems)
        for (const ext of EXTS) {
          const cand = stem + ext;
          if (files.has(relOf(cand))) return cand;
        }
      this.error(`커밋 ${commit.slice(0, 12)}에 ${relOf(abs)}가 없습니다(가져온 곳: ${relOf(importer)})`);
    },
    load(id) {
      const [file, query] = id.split('?');
      if (!inside(file)) return null;
      const rel = relOf(file);
      if (query) this.error(`git 판 소스에는 주소 인자 가져오기를 지원하지 않습니다: ${rel}?${query}`);
      if (!files.has(rel)) this.error(`커밋 ${commit.slice(0, 12)}에 ${rel}가 없습니다`);
      loaded.add(rel);
      return git(repo, ['cat-file', 'blob', `${commit}:${rel}`]);
    },
  };
}
