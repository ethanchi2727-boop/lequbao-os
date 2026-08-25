import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const vueFiles = [
  'App.vue',
  'components/BaoSurface.vue',
  'components/BaoTaskDirectory.vue',
  'pages/workbench/index.vue',
  'pages/merchants/index.vue',
  'pages/orders/index.vue',
  'pages/service/index.vue',
  'pages/me/index.vue',
  'pages/detail/index.vue',
];

async function sources() {
  return Promise.all(vueFiles.map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
}

describe('乐趣宝 V6.2 移动正式视觉契约', () => {
  it('所有使用中的移动 Token 均已定义', async () => {
    const [app, ...rest] = await sources();
    const defined = new Set(
      [...app.matchAll(/(--bao-mobile-[\w-]+)\s*:/gu)].map((match) => match[1]),
    );
    const used = new Set(
      [...[app, ...rest].join('\n').matchAll(/var\((--bao-mobile-[\w-]+)/gu)].map(
        (match) => match[1],
      ),
    );
    expect([...used].filter((token) => !defined.has(token))).toEqual([]);
  });

  it('页面只消费共享圆角与阴影，不重新散落视觉常量', async () => {
    const [, , , ...pages] = await sources();
    for (const page of pages) {
      expect(page).not.toMatch(/#[\da-f]{3,8}|rgba?\(/iu);
      expect(page).not.toContain('box-shadow:');
      expect(page).not.toContain('border-radius:');
      expect(page).not.toMatch(/\/?>\s+><\/BaoSurface>/u);
    }
  });

  it('还原两张移动母版的共享结构并锁定 H5 手机画布', async () => {
    const [app, surface, , workbench, merchants, orders] = await sources();
    for (const marker of [
      'width: 430px',
      '.m-context',
      '.m-agent',
      '.m-progress-hero',
      '.income-hero',
    ])
      expect(app).toContain(marker);
    for (const marker of ['mobile-top', 'app-grid', 'new-action', 'mobile-content'])
      expect(surface).toContain(marker);
    for (const marker of ['m-context', 'm-user', 'm-agent', 'm-composer'])
      expect(workbench).toContain(marker);
    for (const marker of ['income-hero', 'm-stats', 'm-action-card'])
      expect(merchants).toContain(marker);
    expect(orders).toContain('m-progress-hero');
    expect(orders).toContain('m-timeline');
  });
});
