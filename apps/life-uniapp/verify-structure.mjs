import { access, readFile } from 'node:fs/promises';
const pages = JSON.parse(await readFile(new URL('./src/pages.json', import.meta.url), 'utf8'));
const tabs = pages.tabBar.list.map((item) => item.text);
const expected = ['首页', '商城', '生活圈', '购物车', '我的'];
if (JSON.stringify(tabs) !== JSON.stringify(expected)) throw new Error('乐趣生活五栏漂移');
for (const item of pages.tabBar.list) {
  if (!item.iconPath || !item.selectedIconPath)
    throw new Error(`乐趣生活 ${item.text} 缺少正式图片图标`);
  await access(new URL(`./src/${item.iconPath}`, import.meta.url));
  await access(new URL(`./src/${item.selectedIconPath}`, import.meta.url));
}
for (const pageId of [
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
])
  if (!pages.pages.some((page) => page.path === `pages/page-${pageId}/index`))
    throw new Error(`乐趣生活缺少 PAGE-${pageId} 独立页面`);
console.log('乐趣生活 UniApp 结构通过：V6.3 五栏图片图标和 38 个独立叶子页。');
