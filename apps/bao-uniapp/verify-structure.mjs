import { access, readFile } from 'node:fs/promises';
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
console.log('乐趣宝 UniApp 结构通过：V6.2 移动五栏图片图标已接入 H5 与微信小程序。');
