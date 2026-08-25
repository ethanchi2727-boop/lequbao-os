import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { renderBaoV62CanonicalPage } from './bao-v62-canonical-pages.mjs';

const icon = (name) => `<svg data-icon="${name}"></svg>`;

describe('乐趣宝 V6.2 PC 三张正式母版', () => {
  it.each([
    ['page-004', 'PC_CANONICAL_AI_WORKSPACE', '涉及付款、发布和公开内容时'],
    ['page-026', 'PC_CANONICAL_BUSINESS_CENTER', '持续服务的每一家商户'],
    ['page-053', 'PC_CANONICAL_DELIVERY_TOWER', '每一次交付都可视、可控、可验收'],
  ])('%s 输出母版 %s', (page, master, safetyCopy) => {
    const html = renderBaoV62CanonicalPage({ page, icon });
    expect(html).toContain(`data-v62-master="${master}"`);
    expect(html).toContain(safetyCopy);
  });

  it('非母版路由不劫持现有真实业务页面', () => {
    expect(renderBaoV62CanonicalPage({ page: 'page-079', icon })).toBeNull();
  });

  it('母版样式只使用 V6.2 Theme Namespace，不散落颜色字面量', async () => {
    const css = await readFile(new URL('./bao-v62-canonical.css', import.meta.url), 'utf8');
    expect(css).toContain('var(--bao-pc-gradient-dark)');
    expect(css).toContain('var(--bao-mobile-line)');
    expect(css.match(/#[\da-f]{3,8}|rgba?\(/giu)).toBeNull();
  });
});
