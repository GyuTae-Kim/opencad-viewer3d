// @ts-check
/**
 * 화소 비교 조각(--shard) 무게 표 만들기: `node scripts/pixels/weights.mjs <summary.json>...`
 * 화소 비교 결과(summary.json — CI artifact `pixels-<조각>`을 모두 받아 주거나 한 번에 다 찍은 것 하나)의 장면·값 묶음별 찍는 시간(head 첫 번째, ms)을
 * scripts/pixels/weights.json(`shot:<이름>`·`value:<이름>` → ms, 이름 차례)에 쓴다. 같은 이름이 여러 파일에 있으면 큰 값.
 * 무게는 조각을 고르게 나누는 데만 쓰여 판정에는 닿지 않는다 — 장면을 더하거나 시간이 크게 바뀌었을 때 다시 만든다
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('쓰는 법: node scripts/pixels/weights.mjs <summary.json>...');
  process.exit(2);
}
/** @type {Record<string, number>} */
const w = {};
for (const f of files) {
  const s = JSON.parse(readFileSync(f, 'utf8'));
  for (const [kind, list] of /** @type {const} */ ([
    ['shot', s.shots],
    ['value', s.values],
  ]))
    for (const x of list ?? [])
      if (typeof x.ms === 'number' && Number.isFinite(x.ms) && x.ms > 0) {
        const key = `${kind}:${x.name}`;
        w[key] = Math.max(w[key] ?? 0, Math.round(x.ms));
      }
}
const sorted = Object.fromEntries(Object.keys(w).sort().map((k) => [k, w[k]]));
const out = join(resolve(dirname(fileURLToPath(import.meta.url))), 'weights.json');
writeFileSync(out, `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`${out}: ${Object.keys(sorted).length}개(장면·값 묶음), 합 ${(Object.values(sorted).reduce((a, b) => a + b, 0) / 1000).toFixed(1)}초`);
