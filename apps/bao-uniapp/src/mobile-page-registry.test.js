import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { baoMobilePageById, baoMobilePages, mobilePagesForFamily } from './mobile-page-registry.js';

describe('乐趣宝 V6.2 移动深层任务', () => {
  it('覆盖页面树中的全部 11 个移动专属叶子页', () => {
    expect(baoMobilePages.map((page) => page.id)).toEqual([
      'page-180',
      'page-181',
      'page-183',
      'page-184',
      'page-185',
      'page-187',
      'page-188',
      'page-189',
      'page-191',
      'page-193',
      'page-195',
    ]);
    for (const page of baoMobilePages) {
      expect(page.steps).toHaveLength(4);
      expect(page.guardrail.length).toBeGreaterThan(8);
      expect(baoMobilePageById.get(page.id)).toBe(page);
    }
  });

  it('从五栏业务入口可达全部移动深层任务', async () => {
    const sources = await Promise.all(
      [
        ['delivery', 'pages/workbench/index.vue'],
        ['revenue', 'pages/merchants/index.vue'],
        ['orders', 'pages/orders/index.vue'],
        ['service', 'pages/service/index.vue'],
        ['identity', 'pages/me/index.vue'],
      ].map(async ([family, path]) => [
        family,
        await readFile(new URL(path, import.meta.url), 'utf8'),
      ]),
    );
    for (const [family, source] of sources) {
      expect(mobilePagesForFamily(family).length).toBeGreaterThan(0);
      expect(source).toContain(`family="${family}"`);
    }
    expect(sources.flatMap(([family]) => mobilePagesForFamily(family))).toHaveLength(11);
  });

  it('注册正式详情路由并安全关闭未知页面', async () => {
    const [pages, detail] = await Promise.all([
      readFile(new URL('./pages.json', import.meta.url), 'utf8').then(JSON.parse),
      readFile(new URL('./pages/detail/index.vue', import.meta.url), 'utf8'),
    ]);
    expect(pages.pages.map((page) => page.path)).toContain('pages/detail/index');
    expect(detail).toContain('服务端权限最终裁决');
    expect(detail).toContain('页面标识不存在或不属于当前移动端正式任务范围');
    expect(detail).not.toMatch(/#[\da-f]{3,8}|rgba?\(/iu);
  });
});
