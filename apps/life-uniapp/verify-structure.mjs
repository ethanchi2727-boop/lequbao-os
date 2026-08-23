import { readFile } from 'node:fs/promises';
const pages = JSON.parse(await readFile(new URL('./src/pages.json', import.meta.url), 'utf8'));
const tabs = pages.tabBar.list.map((item) => item.text);
const expected = ['生活消费', '商城', '生活圈', '购物车', '我的'];
if (JSON.stringify(tabs) !== JSON.stringify(expected)) throw new Error('乐趣生活五栏漂移');
console.log('乐趣生活 UniApp 结构通过：H5 与微信小程序共享 5 个一级栏目。');
