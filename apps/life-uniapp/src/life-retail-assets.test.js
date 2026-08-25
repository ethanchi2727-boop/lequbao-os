import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const officialAssets = Object.freeze({
  '../../../docs/visual/assets/life-v63/category-sprite.png':
    '2EF935F843FA6D786C8DAEBF112D4A1C845280EEBF55260E8E98C7C87D5EDDAD',
  '../../../docs/visual/assets/life-v63/product-sprite.png':
    'C50EAC7BDAAEB01850E0822B9469781B61848F05134DD5F7A32D6F5E03A12291',
  '../../../docs/visual/assets/life-v63/summer-festival.png':
    '4AAC691FFC82A7629971EC1440EECE2C0DDB39AF79F43AADA264D7982E2816E3',
});

const runtimeAssets = Object.freeze({
  'assets/v63-retail/category-sprite.webp':
    '0B372A28BC2A7534EAB8A28E9E0657EA8BF6F9E7F0D27E23F4CB8B92348C56F2',
  'assets/v63-retail/product-sprite.webp':
    'E6B7052D856CA1B0EDDF5AEB9F7C342EACFDBDE1D1596F3324F35EC5B19FA1BE',
  'assets/v63-retail/summer-festival.webp':
    '6A6165C2A29AB0D539DBD06972BB96245BD3235DB740A80AB19F46061D28745F',
});

describe('乐趣生活 V6.3 official retail assets', () => {
  it.each(Object.entries(officialAssets))('preserves %s byte-for-byte', async (file, expected) => {
    const bytes = await readFile(new URL(file, import.meta.url));
    expect(bytes.byteLength).toBeGreaterThan(1_000_000);
    expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(expected);
  });

  it.each(Object.entries(runtimeAssets))(
    'ships deterministic pixel-lossless %s under the artifact limit',
    async (file, expected) => {
      const bytes = await readFile(new URL(file, import.meta.url));
      expect(bytes.byteLength).toBeLessThan(2 * 1024 * 1024);
      expect(createHash('sha256').update(bytes).digest('hex').toUpperCase()).toBe(expected);
    },
  );

  it('binds the official high-density composition to authoritative product data', async () => {
    const page = await readFile(new URL('pages/life/index.vue', import.meta.url), 'utf8');
    expect(page).toContain('../../assets/v63-retail/summer-festival.webp');
    expect(page).toContain('../../assets/v63-retail/category-sprite.webp');
    expect(page).toContain('../../assets/v63-retail/product-sprite.webp');
    expect(page).toContain('retailCategories');
    expect(page).toContain('今日热卖');
    expect(page).toContain('life-channels');
    expect(page).toContain('product-shelf');
    expect(page).toContain('product.salePriceCents');
    expect(page).toContain('product.availableQuantity');
    expect(page).toContain("lifeSession.request('/api/v1/life/cart/items'");
    expect(page).not.toMatch(/新人专享|会场5折|爆款直降|第二件半价/u);
  });
});
