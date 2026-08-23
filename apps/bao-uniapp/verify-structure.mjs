import { readFile } from 'node:fs/promises';
const pages = JSON.parse(await readFile(new URL('./src/pages.json', import.meta.url), 'utf8'));
const tabs = pages.tabBar.list.map((item) => item.text);
const expected = ['工作台', '商户', '订单', '客服', '我的'];
if (JSON.stringify(tabs) !== JSON.stringify(expected)) throw new Error('乐趣宝移动五栏漂移');
console.log('乐趣宝 UniApp 结构通过：移动 H5 与微信小程序共享员工任务入口。');
