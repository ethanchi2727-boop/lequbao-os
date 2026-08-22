import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const states = ['默认', '加载中', '空数据', '局部错误', '无权限', '停用', '成功', '可恢复失败'];
const configurations = {
  'consumer-miniapp': {
    product: '乐趣生活',
    expectedLeaves: 38,
    requiredTabs: ['生活', '商城', '生活圈', '购物车', '我的'],
  },
  'merchant-miniapp': {
    product: '商家独立小程序模板实例',
    expectedLeaves: 24,
    requiredTabs: ['首页', '商品', '团购', '订单', '我的'],
  },
};

function rows(source) {
  const [header, ...lines] = source
    .replace(/^\uFEFF/u, '')
    .trim()
    .split(/\r?\n/u);
  const keys = header.split(',');
  return lines.map((line) =>
    Object.fromEntries(line.split(',').map((value, index) => [keys[index], value])),
  );
}

function pngSize(buffer) {
  if (buffer.subarray(1, 4).toString('ascii') !== 'PNG') throw new Error('visual asset is not PNG');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

export async function verifyMiniapp(name) {
  const configuration = configurations[name];
  if (!configuration) throw new Error(`unknown mini-program package: ${name}`);
  const appRoot = join(root, 'apps', name);
  const treePath = join(
    root,
    'docs/v6.1/source-package/02_完整PRD页面树与状态机/页面树与页面契约/页面树.csv',
  );
  const tree = rows(await readFile(treePath, 'utf8'));
  const leaves = tree.filter(
    (page) => page.product === configuration.product && page.is_leaf === 'true',
  );
  if (leaves.length !== configuration.expectedLeaves)
    throw new Error(`${name} leaf count drifted: ${leaves.length}`);
  for (const page of leaves) {
    if (page.states.split(';').join('|') !== states.join('|'))
      throw new Error(`${page.page_id} lacks the frozen eight UI states`);
    if (!page.route?.startsWith(name === 'consumer-miniapp' ? '/life/' : '/merchant/'))
      throw new Error(`${page.page_id} route is invalid`);
  }
  const app = JSON.parse(await readFile(join(appRoot, 'src/app.json'), 'utf8'));
  const tabs = app.tabBar?.list?.map((tab) => tab.text) ?? [];
  if (tabs.join('|') !== configuration.requiredTabs.join('|'))
    throw new Error(`${name} tab contract drifted`);
  const apiSource = await readFile(join(appRoot, 'src/lib/api.js'), 'utf8');
  if (
    !apiSource.includes('/api/v1/consumer/storefront') ||
    !apiSource.includes('/api/v1/consumer/products') ||
    !(name === 'consumer-miniapp'
      ? apiSource.includes('/api/v1/life/cart')
      : apiSource.includes('/api/v1/merchant-consumer/cart')) ||
    !apiSource.includes('LIFE_CONSUMER_SESSION_REQUIRED') ||
    !apiSource.includes('CONSUMER_SESSION_REQUIRED')
  )
    throw new Error(`${name} catalog client must fail closed and use authoritative APIs`);
  const routeSource = await readFile(join(appRoot, 'src/pages/route/index.js'), 'utf8');
  if (
    !routeSource.includes('demoMode') ||
    !routeSource.includes('loadAuthoritative') ||
    !routeSource.includes('setCartItem') ||
    routeSource.includes('setTimeout(')
  )
    throw new Error(`${name} generic routes must fail closed outside explicit demo mode`);
  const componentPath =
    name === 'consumer-miniapp'
      ? 'src/components/life-experience/index.js'
      : 'src/components/merchant-experience/index.js';
  const componentSource = await readFile(join(appRoot, componentPath), 'utf8');
  if (
    !componentSource.includes('listProducts') ||
    componentSource.includes('setTimeout(') ||
    /云南高原蓝莓|招牌家庭餐|已售 386/u.test(componentSource)
  )
    throw new Error(`${name} launch surfaces must not fall back to static commerce results`);
  if (name === 'consumer-miniapp') {
    const cartSource = await readFile(join(appRoot, 'src/pages/cart/index.js'), 'utf8');
    if (
      !cartSource.includes('getCart') ||
      !cartSource.includes('removeCartItem') ||
      !cartSource.includes('quoteCheckout') ||
      !apiSource.includes('/api/v1/life/checkouts/quote') ||
      !routeSource.includes('submitCheckout') ||
      !apiSource.includes('/actions/submit') ||
      !routeSource.includes('createLifePayment') ||
      !apiSource.includes('/api/v1/life/payment-intents') ||
      !routeSource.includes('getLifeOrder') ||
      !routeSource.includes('saveAddress') ||
      !apiSource.includes('/api/v1/life/addresses')
    )
      throw new Error('consumer cart page must use the authoritative cross-merchant cart API');
    const profileSource = await readFile(join(appRoot, 'src/pages/profile/index.js'), 'utf8');
    if (!apiSource.includes('/api/v1/life/orders') || !profileSource.includes('listLifeOrders'))
      throw new Error('consumer order surfaces must use the authoritative platform order API');
    if (
      !routeSource.includes('liveProductListRoutes') ||
      !routeSource.includes("route === '/life/page-218'") ||
      !routeSource.includes("route === '/life/page-235'") ||
      !routeSource.includes("'/life/page-258'") ||
      !routeSource.includes("route === '/life/page-264'") ||
      !routeSource.includes("'/life/page-254'") ||
      !routeSource.includes("route === '/life/page-259'") ||
      !apiSource.includes('/api/v1/customer-service/conversations') ||
      !apiSource.includes('/api/v1/customer-profile/privacy-requests') ||
      !apiSource.includes('/api/v1/consumer/membership') ||
      !routeSource.includes('requestHumanService') ||
      !routeSource.includes('changeLifeConsent') ||
      !routeSource.includes("'/life/page-198'") ||
      !routeSource.includes('locateNearbyStores') ||
      !routeSource.includes('openStoreMap') ||
      !apiSource.includes('/api/v1/life/discovery/stores') ||
      !routeSource.includes("route === '/life/page-211'") ||
      !apiSource.includes('/trace-report') ||
      !routeSource.includes("route === '/life/page-250'") ||
      !apiSource.includes('/api/v1/life/invoice-profiles')
    )
      throw new Error('consumer discovery, service and privacy routes must use authoritative APIs');
  } else if (
    !apiSource.includes("'x-life-authorization'") ||
    !apiSource.includes('/api/v1/merchant-consumer/checkouts/quote') ||
    !apiSource.includes('/actions/submit') ||
    !routeSource.includes("route === '/merchant/page-280'") ||
    !routeSource.includes("route === '/merchant/page-269'") ||
    !routeSource.includes("route === '/merchant/page-270'") ||
    !routeSource.includes("route === '/merchant/page-302'") ||
    !apiSource.includes('/api/v1/consumer/session/actions/switch-store') ||
    !apiSource.includes('/api/v1/consumer/membership') ||
    !routeSource.includes("route === '/merchant/page-282'") ||
    !routeSource.includes('submitMerchantCheckout') ||
    !apiSource.includes('/api/v1/customer-service/conversations') ||
    !routeSource.includes("'/merchant/page-297'") ||
    !routeSource.includes("route === '/merchant/page-307'") ||
    !routeSource.includes('requestHumanService') ||
    !apiSource.includes('/api/v1/customer-profile/privacy-requests') ||
    !routeSource.includes("route === '/merchant/page-304'") ||
    !routeSource.includes("route === '/merchant/page-305'") ||
    !routeSource.includes('requestFullRefund')
  ) {
    throw new Error(
      'merchant transaction, service and privacy journeys must use authoritative APIs',
    );
  }
  const visualRoot = join(
    root,
    'docs/v6.1/source-package/03_UIUX原型效果图与设计资产/乐趣宝与乐趣生活可运行原型/assets',
  );
  const sprite = pngSize(await readFile(join(visualRoot, '生活分类立体图标精灵.png')));
  if (sprite.width !== 1254 || sprite.height !== 1254)
    throw new Error('UI-003 category sprite dimensions drifted');
  for (const asset of ['生活首页Banner-V2.png', '生活商品静物.png', '本地生活聚餐.png']) {
    const metadata = pngSize(await readFile(join(visualRoot, asset)));
    if (metadata.width < 600 || metadata.height < 300) throw new Error(`${asset} is undersized`);
  }
  const optimizedRoot = join(root, 'assets/miniapp');
  const optimizedAssets = [
    'life-banner.webp',
    'life-product.webp',
    'local-dining.webp',
    'life-category-sprite.webp',
  ];
  let optimizedBytes = 0;
  for (const asset of optimizedAssets)
    optimizedBytes += (await stat(join(optimizedRoot, asset))).size;
  if (optimizedBytes > 1_000_000)
    throw new Error('mini-program visual assets exceed the main-package budget');
  return { appRoot, leaves, optimizedRoot, optimizedAssets };
}

export async function buildMiniapp(name) {
  const { appRoot, leaves, optimizedRoot, optimizedAssets } = await verifyMiniapp(name);
  const output = join(appRoot, 'dist');
  if (!isSafeMiniappOutput(appRoot, output)) throw new Error('refusing unsafe mini-program clean');
  await rm(output, { recursive: true, force: true });
  await cp(join(appRoot, 'src'), output, { recursive: true });
  await mkdir(join(output, 'assets'), { recursive: true });
  for (const asset of optimizedAssets)
    await cp(join(optimizedRoot, asset), join(output, 'assets', asset));
  await mkdir(join(output, 'generated'), { recursive: true });
  const contracts = leaves.map((page) => ({
    id: page.page_id,
    title: page.title,
    route: page.route,
    purpose: page.purpose,
    actions: page.primary_actions.split(';').filter(Boolean),
    states,
    domains: page.api_domains.split(';').filter(Boolean),
  }));
  await writeFile(
    join(output, 'generated/page-contracts.json'),
    JSON.stringify(contracts, null, 2),
  );
  await writeFile(
    join(output, 'generated/page-contracts.js'),
    `module.exports = ${JSON.stringify(contracts)};\n`,
  );
  const project = JSON.parse(await readFile(join(appRoot, 'project.config.json'), 'utf8'));
  project.miniprogramRoot = 'dist/';
  await writeFile(join(appRoot, 'project.config.json'), `${JSON.stringify(project, null, 2)}\n`);
  const size = (await stat(join(output, 'generated/page-contracts.json'))).size;
  return { leaves: contracts.length, manifestBytes: size };
}

export function isSafeMiniappOutput(appRoot, output) {
  return resolve(output) === resolve(appRoot, 'dist');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  const verified = process.argv.includes('--verify');
  const result = verified ? await verifyMiniapp(name) : await buildMiniapp(name);
  console.log(
    `${name} ${verified ? 'verified' : 'built'}: ${result.leaves.length ?? result.leaves} leaf contracts.`,
  );
}
