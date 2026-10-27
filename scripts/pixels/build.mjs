// @ts-check
/**
 * 비교 페이지(scripts/pixels/page.html) 묶기. 페이지와 장면 목록은 늘 작업 트리 것이고, `src/`만 판마다 다르다:
 * commit을 주면 그 커밋의 src를 git에서 바로 읽고(gitsrc.mjs), 없으면 작업 트리 src를 그대로 쓴다.
 */
import { resolve } from 'node:path';
import { gitSource } from './gitsrc.mjs';

/**
 * @param {{ repo: string; outDir: string; commit?: string | null; cacheDir: string }} o
 * @returns {Promise<{ files: number | null }>} git에서 읽은 src 파일 수(작업 트리면 null)
 */
export async function buildPage({ repo, outDir, commit, cacheDir }) {
  const { build } = await import('vite');
  const plugin = commit ? gitSource({ repo, commit }) : null;
  const root = resolve(repo, 'scripts/pixels');
  await build({
    configFile: false,
    root,
    base: './',
    publicDir: false,
    cacheDir,
    logLevel: 'warn',
    plugins: plugin ? [plugin] : [],
    build: {
      outDir,
      emptyOutDir: true,
      // 줄이지 않는다: 두 판을 같은 방식으로 옮기기만 하고, 오류가 나면 읽을 수 있게
      minify: false,
      sourcemap: false,
      reportCompressedSize: false,
      modulePreload: false,
      target: 'es2022',
      rollupOptions: { input: resolve(root, 'page.html') },
    },
  });
  return { files: plugin ? plugin.loaded.size : null };
}
