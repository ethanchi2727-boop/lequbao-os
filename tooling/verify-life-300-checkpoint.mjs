import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { frozenLifePageRoute } from '../apps/life-uniapp/src/services/life-discovery.js';
import { lifeSurfaceContract } from '../apps/life-uniapp/src/surface-contract.js';

const finalSlice = Object.freeze([
  '219',
  '242',
  '243',
  '245',
  '246',
  '248',
  '250',
  '252',
  '254',
  '255',
  '258',
  '259',
  '262',
  '264',
]);
const allLifeLeaves = Object.freeze([
  '198',
  '200',
  '201',
  '203',
  '204',
  '207',
  '209',
  '210',
  '211',
  '213',
  '216',
  '218',
  '219',
  '221',
  '224',
  '227',
  '228',
  '229',
  '231',
  '232',
  '235',
  '237',
  '238',
  '239',
  '240',
  '242',
  '243',
  '245',
  '246',
  '248',
  '250',
  '252',
  '254',
  '255',
  '258',
  '259',
  '262',
  '264',
]);

function check(condition, label, results) {
  if (!condition) throw new Error(`Life 300-checkpoint verification failed: ${label}`);
  results.push(label);
}

export async function verifyLife300Checkpoints() {
  const [pagesSource, serviceSource, matrixSource] = await Promise.all([
    readFile(new URL('../apps/life-uniapp/src/pages.json', import.meta.url), 'utf8'),
    readFile(
      new URL('../apps/life-uniapp/src/components/LifeServicePage.vue', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../docs/release/frontend-page-completion.json', import.meta.url), 'utf8'),
  ]);
  const pages = JSON.parse(pagesSource);
  const matrix = JSON.parse(matrixSource);
  const results = [];

  for (const id of finalSlice) {
    const wrapper = await readFile(
      new URL(`../apps/life-uniapp/src/pages/page-${id}/index.vue`, import.meta.url),
      'utf8',
    );
    const page = pages.pages.find((candidate) => candidate.path === `pages/page-${id}/index`);
    const row = matrix.pages.find((candidate) => candidate.pageId === `PAGE-${id}`);
    const contract = lifeSurfaceContract[`page${id}`];
    check(wrapper.length > 0, `${id}:wrapper`, results);
    check(wrapper.includes('LifeServicePage'), `${id}:shared-component`, results);
    check(wrapper.includes(`page-id="${id}"`), `${id}:page-id`, results);
    check(Boolean(page), `${id}:manifest-route`, results);
    check(Boolean(page?.style?.navigationBarTitleText), `${id}:navigation-title`, results);
    check(
      frozenLifePageRoute(`/life/page-${id}`) === `/pages/page-${id}/index`,
      `${id}:frozen-route`,
      results,
    );
    check(Boolean(contract), `${id}:surface-contract`, results);
    check(Boolean(row), `${id}:matrix-row`, results);
    check(row?.designed === true, `${id}:designed`, results);
    check(row?.interactive === true, `${id}:interactive`, results);
    check(row?.accepted === false, `${id}:acceptance-conservative`, results);
    check(serviceSource.includes(`${id}: [`), `${id}:page-metadata`, results);
    check(serviceSource.includes("state === 'loading'"), `${id}:loading-state`, results);
    check(serviceSource.includes("state === 'unauthenticated'"), `${id}:auth-state`, results);
    check(serviceSource.includes("state === 'recoverable-error'"), `${id}:retry-state`, results);
    check(
      Array.isArray(contract?.read) || contract?.blockedBy === 'MERCHANT_CONSUMER_SESSION_REQUIRED',
      `${id}:audience-boundary`,
      results,
    );
  }

  for (const id of allLifeLeaves) {
    const wrapper = await readFile(
      new URL(`../apps/life-uniapp/src/pages/page-${id}/index.vue`, import.meta.url),
      'utf8',
    );
    check(wrapper.length > 0, `${id}:all-leaf-wrapper`, results);
    check(
      frozenLifePageRoute(`/life/page-${id}`) === `/pages/page-${id}/index`,
      `${id}:all-leaf-route`,
      results,
    );
  }

  check(results.length === 300, `expected-300-got-${results.length}`, []);
  return results;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const results = await verifyLife300Checkpoints();
  console.log(`Life closure verified: ${results.length} executable checkpoints.`);
}
