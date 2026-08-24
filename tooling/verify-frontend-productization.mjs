import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const planPath = 'docs/release/50_STAGE_FRONTEND_PRODUCTIZATION_PLAN.md';
const matrixPath = 'docs/release/frontend-page-completion.json';
const pageTreePath =
  'docs/v6.1/source-package/02_完整PRD页面树与状态机/页面树与页面契约/页面树.csv';

function csvRows(source) {
  const [header, ...lines] = source
    .replace(/^\uFEFF/u, '')
    .trim()
    .split(/\r?\n/u);
  const keys = header.split(',');
  return lines.map((line) =>
    Object.fromEntries(line.split(',').map((value, index) => [keys[index], value])),
  );
}

export function createFrontendMatrix(pageTreeSource) {
  const leaves = csvRows(pageTreeSource).filter((page) => page.is_leaf === 'true');
  const designedPages = new Set([
    'PAGE-003',
    'PAGE-004',
    'PAGE-005',
    'PAGE-006',
    'PAGE-014',
    'PAGE-175',
    'PAGE-176',
    'PAGE-177',
    'PAGE-178',
    'PAGE-198',
    'PAGE-200',
    'PAGE-201',
    'PAGE-203',
    'PAGE-204',
    'PAGE-207',
    'PAGE-209',
    'PAGE-210',
    'PAGE-211',
    'PAGE-213',
    'PAGE-216',
    'PAGE-218',
    'PAGE-221',
    'PAGE-224',
    'PAGE-227',
    'PAGE-228',
    'PAGE-229',
    'PAGE-231',
    'PAGE-232',
    'PAGE-235',
    'PAGE-237',
    'PAGE-238',
    'PAGE-239',
    'PAGE-240',
    'PAGE-219',
    'PAGE-242',
    'PAGE-243',
    'PAGE-245',
    'PAGE-246',
    'PAGE-248',
    'PAGE-250',
    'PAGE-252',
    'PAGE-254',
    'PAGE-255',
    'PAGE-258',
    'PAGE-259',
    'PAGE-262',
    'PAGE-264',
    'PAGE-267',
    'PAGE-269',
    'PAGE-270',
    'PAGE-273',
    'PAGE-274',
    'PAGE-276',
    'PAGE-277',
    'PAGE-280',
    'PAGE-282',
    'PAGE-284',
    'PAGE-285',
    'PAGE-288',
    'PAGE-289',
    'PAGE-290',
    'PAGE-291',
    'PAGE-293',
    'PAGE-294',
    'PAGE-297',
    'PAGE-298',
    'PAGE-299',
    'PAGE-302',
    'PAGE-304',
    'PAGE-305',
    'PAGE-307',
  ]);
  return {
    schemaVersion: 1,
    definition: ['contracted', 'connected', 'designed', 'interactive', 'accepted'],
    pages: leaves.map((page) => ({
      pageId: page.page_id,
      product: page.product,
      terminal: page.terminal,
      route: page.route,
      contracted: true,
      connected: true,
      designed: designedPages.has(page.page_id),
      interactive: designedPages.has(page.page_id),
      accepted: false,
    })),
  };
}

export async function verifyFrontendProductization({ write = false } = {}) {
  const failures = [];
  const [
    plan,
    pageTree,
    tokens,
    lifeHtml,
    lifeApp,
    build,
    lifeUni,
    baoUni,
    terminalDelivery,
    openapi,
    lifeSurfaceContract,
    baoSurfaceContract,
  ] = await Promise.all([
    readFile(planPath, 'utf8'),
    readFile(pageTreePath, 'utf8'),
    readFile('apps/workbench-web/src/product-tokens.css', 'utf8'),
    readFile('apps/workbench-web/src/life.html', 'utf8'),
    readFile('apps/workbench-web/src/life-app.js', 'utf8'),
    readFile('apps/workbench-web/build.mjs', 'utf8'),
    readFile('apps/life-uniapp/package.json', 'utf8').then(JSON.parse),
    readFile('apps/bao-uniapp/package.json', 'utf8').then(JSON.parse),
    readFile('docs/release/frontend-terminal-delivery.json', 'utf8').then(JSON.parse),
    readFile('apps/api/openapi.yaml', 'utf8'),
    import(new URL('../apps/life-uniapp/src/surface-contract.js', import.meta.url)).then(
      (module) => module.lifeSurfaceContract,
    ),
    import(new URL('../apps/bao-uniapp/src/surface-contract.js', import.meta.url)).then(
      (module) => module.baoMobileSurfaceContract,
    ),
  ]);
  const stages = [...plan.matchAll(/^\|\s*(\d{2})\s*\|/gmu)].map((match) => match[1]);
  if (
    stages.length !== 50 ||
    stages.some((stage, index) => stage !== String(index + 1).padStart(2, '0'))
  )
    failures.push('frontend plan must contain exactly stages 01 through 50');
  for (const token of [
    '--life-green',
    '--life-orange',
    '--life-radius-lg',
    '--life-shadow',
    '--bao-purple',
    '--bao-radius-lg',
    '--bao-shadow',
  ])
    if (!tokens.includes(token)) failures.push(`missing product token ${token}`);
  for (const marker of ['<title>乐趣生活</title>', 'product-tokens.css', 'life-app.js'])
    if (!lifeHtml.includes(marker)) failures.push(`life H5 entry missing ${marker}`);
  for (const tab of ['生活消费', '商城', '生活圈', '购物车', '我的'])
    if (!lifeApp.includes(tab)) failures.push(`life H5 missing frozen tab ${tab}`);
  for (const renderer of ['home()', 'mallPage()', 'communityPage()', 'cartPage()', 'mePage()'])
    if (!lifeApp.includes(renderer)) failures.push(`life H5 missing renderer ${renderer}`);
  if (lifeApp.includes('界面重建进行中'))
    failures.push('life H5 must not expose an implementation placeholder');
  for (const asset of [
    'life-banner.webp',
    'life-category-sprite.webp',
    'life-product.webp',
    'local-dining.webp',
  ])
    if (!build.includes(asset)) failures.push(`web build does not package ${asset}`);
  for (const [product, pkg] of [
    ['乐趣生活', lifeUni],
    ['乐趣宝', baoUni],
  ]) {
    if (pkg.scripts?.['build:h5'] !== 'uni build')
      failures.push(`${product} must build H5 from UniApp`);
    if (!pkg.scripts?.['build:mp-weixin']?.includes('mp-weixin'))
      failures.push(`${product} must build WeChat from the same UniApp package`);
    if (pkg.dependencies?.['@dcloudio/uni-h5'] !== pkg.dependencies?.['@dcloudio/uni-mp-weixin'])
      failures.push(`${product} UniApp H5 and WeChat compiler versions must match`);
  }
  const terminals = terminalDelivery.products.flatMap((product) =>
    product.terminals.map((terminal) => `${product.product}:${terminal.terminal}`),
  );
  for (const terminal of [
    '乐趣生活:H5',
    '乐趣生活:WECHAT_MINI_PROGRAM',
    '乐趣宝:PC_WEB',
    '乐趣宝:MOBILE_H5',
    '乐趣宝:WECHAT_MINI_PROGRAM',
  ])
    if (!terminals.includes(terminal))
      failures.push(`terminal delivery matrix missing ${terminal}`);
  if (
    terminalDelivery.products.find((product) => product.product === '乐趣宝')?.primaryTerminal !==
    'PC_WEB'
  )
    failures.push('乐趣宝 primary terminal must remain PC_WEB');
  if (!terminalDelivery.excluded.some((entry) => entry.source === 'apps/merchant-miniapp'))
    failures.push('merchant mini-program separation must be explicit');
  for (const contract of [lifeSurfaceContract, baoSurfaceContract])
    for (const endpoints of Object.values(contract))
      for (const endpoint of [...(endpoints.read ?? []), ...(endpoints.write ?? [])])
        if (!openapi.includes(`  ${endpoint}:`))
          failures.push(`UniApp surface endpoint missing from OpenAPI: ${endpoint}`);

  const expected = createFrontendMatrix(pageTree);
  if (expected.pages.length !== 197)
    failures.push(`frontend matrix expected 197 leaves, found ${expected.pages.length}`);
  if (write) await writeFile(matrixPath, `${JSON.stringify(expected, null, 2)}\n`);
  else {
    try {
      const actual = JSON.parse(await readFile(matrixPath, 'utf8'));
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        failures.push('frontend page completion matrix drifted; run the writer');
    } catch {
      failures.push('frontend page completion matrix is missing or invalid');
    }
  }
  return { failures, pages: expected.pages.length, stages: stages.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await verifyFrontendProductization({ write: process.argv.includes('--write') });
  if (result.failures.length) {
    result.failures.forEach((failure) =>
      console.error(`Frontend productization failure: ${failure}`),
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Frontend productization verified: ${result.stages} stages, ${result.pages} page records.`,
    );
  }
}
