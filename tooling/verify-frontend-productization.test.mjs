import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createFrontendMatrix,
  verifyFrontendProductization,
} from './verify-frontend-productization.mjs';

describe('frontend productization gate', () => {
  it('covers every frozen executable leaf without claiming visual acceptance', async () => {
    const source = await readFile(
      'docs/v6.1/source-package/02_完整PRD页面树与状态机/页面树与页面契约/页面树.csv',
      'utf8',
    );
    const matrix = createFrontendMatrix(source);
    expect(matrix.pages).toHaveLength(197);
    expect(matrix.pages.every((page) => page.contracted && page.connected)).toBe(true);
    expect(matrix.pages.filter((page) => page.designed)).toHaveLength(67);
    expect(
      matrix.pages
        .filter((page) => ['PAGE-198', 'PAGE-211', 'PAGE-227', 'PAGE-240'].includes(page.pageId))
        .every((page) => page.interactive && !page.accepted),
    ).toBe(true);
    expect(
      matrix.pages
        .filter((page) => page.product === '商家独立小程序模板实例')
        .every((page) => page.designed && page.interactive && !page.accepted),
    ).toBe(true);
    expect(matrix.pages.some((page) => page.accepted)).toBe(false);
  });

  it('keeps the stage plan, assets, tokens and generated matrix synchronized', async () => {
    await expect(verifyFrontendProductization()).resolves.toEqual({
      failures: [],
      pages: 197,
      stages: 50,
    });
  });

  it('records five product terminals without counting the merchant storefront as 乐趣宝', async () => {
    const delivery = JSON.parse(
      await readFile('docs/release/frontend-terminal-delivery.json', 'utf8'),
    );
    expect(delivery.products.flatMap((product) => product.terminals)).toHaveLength(5);
    expect(delivery.products.find((product) => product.product === '乐趣宝').primaryTerminal).toBe(
      'PC_WEB',
    );
    expect(delivery.excluded).toContainEqual(
      expect.objectContaining({ source: 'apps/merchant-miniapp' }),
    );
  });
});
