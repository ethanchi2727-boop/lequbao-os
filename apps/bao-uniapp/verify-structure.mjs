import { access, readFile } from 'node:fs/promises';
import { baoMobilePages } from './src/mobile-page-registry.js';
const pages = JSON.parse(await readFile(new URL('./src/pages.json', import.meta.url), 'utf8'));
const tabs = pages.tabBar.list.map((item) => item.text);
const expected = ['对话', '工作', '任务', '消息', '我的'];
if (JSON.stringify(tabs) !== JSON.stringify(expected)) throw new Error('乐趣宝移动五栏漂移');
for (const item of pages.tabBar.list) {
  if (!item.iconPath || !item.selectedIconPath)
    throw new Error(`乐趣宝 ${item.text} 缺少正式图片图标`);
  await access(new URL(`./src/${item.iconPath}`, import.meta.url));
  await access(new URL(`./src/${item.selectedIconPath}`, import.meta.url));
}
if (!pages.pages.some((page) => page.path === 'pages/detail/index'))
  throw new Error('乐趣宝移动正式任务详情路由缺失');
if (baoMobilePages.length !== 11) throw new Error('乐趣宝移动专属叶子页未全量注册');
const visualFiles = [
  'App.vue',
  'components/BaoSurface.vue',
  'pages/workbench/index.vue',
  'pages/merchants/index.vue',
  'pages/orders/index.vue',
  'pages/service/index.vue',
  'pages/me/index.vue',
  'pages/detail/index.vue',
];
const visualSources = await Promise.all(
  visualFiles.map((file) => readFile(new URL(`./src/${file}`, import.meta.url), 'utf8')),
);
const definedTokens = new Set(
  [...visualSources[0].matchAll(/(--bao-mobile-[\w-]+)\s*:/gu)].map((match) => match[1]),
);
const usedTokens = new Set(
  [...visualSources.join('\n').matchAll(/var\((--bao-mobile-[\w-]+)/gu)].map((match) => match[1]),
);
const undefinedTokens = [...usedTokens].filter((token) => !definedTokens.has(token));
if (undefinedTokens.length)
  throw new Error(`乐趣宝移动视觉 Token 未定义: ${undefinedTokens.join(', ')}`);
if (!visualSources[0].includes('width: 430px')) throw new Error('乐趣宝 H5 未锁定移动画布');
for (const source of visualSources.slice(2)) {
  if (/#[\da-f]{3,8}|rgba?\(/iu.test(source)) throw new Error('乐趣宝页面出现散落颜色常量');
  if (source.includes('box-shadow:') || source.includes('border-radius:'))
    throw new Error('乐趣宝页面未复用正式圆角或阴影 Token');
}
console.log(
  '乐趣宝 UniApp 结构通过：V6.2 移动五栏图片图标与 11 个深层任务已接入 H5 和微信小程序。',
);
