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
    // ===== 官方 sprite 资产预算绑定（kimi 真理资产 runtime 源码引用） =====
    expect(page).toContain('../../assets/v63-retail/summer-festival.webp');
    expect(page).toContain('../../assets/v63-retail/category-sprite.webp');
    expect(page).toContain('../../assets/v63-retail/product-sprite.webp');
    expect(page).toContain('retailCategories');
    // ===== kimi 真理首页 class 结构锚点（concept-f index.html 真实 class：一个都不能自创） =====
    expect(page).toMatch(/class="[^"]*\btop\b/);               // 顶部渐变头（定位+搜索+bell+胶囊）
    expect(page).toMatch(/class="[^"]*\bbans\b/);              // 三图轮播横幅（充值/大牌/出行）
    expect(page).toMatch(/class="[^"]*\bod\b/);                // 进行中订单（.od-hd/.od-it/.oic/.ot/.ob）
    expect(page).toMatch(/class="[^"]*\bgw\b/);                // 金刚位 5 列 gic 3D PNG 真图
    expect(page).toMatch(/class="[^"]*\bnotice\b/);            // 优惠公告横向滚
    expect(page).toMatch(/class="[^"]*\bnow\b/);               // 此刻推荐 3 宫格
    expect(page).toMatch(/class="[^"]*\baisle\b/);             // 分区货架×5（吃喝/服务/出行/娱乐/定制）
    expect(page).toMatch(/class="[^"]*\bwf\b/);                // 精选瀑布流 2 列
    // ===== 真实 API/字段（kimi JS chunk 真理：lifeSession cart/items PUT + 价格库存） =====
    expect(page).toContain('product.salePriceCents');
    expect(page).toContain('product.availableQuantity');
    expect(page).toContain("lifeSession.request('/api/v1/life/cart/items'");
    // ===== 永不伪造促销词（V6.1 天下摄影假优惠严格禁用） =====
    expect(page).not.toMatch(/新人专享|会场5折|爆款直降|第二件半价/u);
    // ===== 严禁 display:none 锚点作弊 + 严禁 V6.1 旧伪锚点 life-channels/product-shelf =====
    expect(page).not.toContain('style="display:none"');
    expect(page).not.toContain('life-channels');
    expect(page).not.toContain('product-shelf');
  });

  it('shares the official retail card across mall and community without fabricating offers', async () => {
    const [card, mall, community] = await Promise.all(
      [
        'components/LifeRetailProductCard.vue',
        'pages/mall/index.vue',
        'pages/community/index.vue',
      ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
    );
    expect(card).toContain('../assets/v63-retail/product-sprite.webp');
    expect(card).toContain('product.salePriceCents');
    expect(card).toContain('product.availableQuantity');
    for (const page of [mall, community]) {
      // ===== 真理前端都直接引用 LifeRetailProductCard；cart/items API 冻结不变 =====
      expect(page).toContain('LifeRetailProductCard');
      expect(page).toContain('/api/v1/life/cart/items');
      expect(page).not.toMatch(/新人专享|会场5折|爆款直降|第二件半价/u);
      // ===== 严禁 display:none 作弊锚点 =====
      expect(page).not.toContain('style="display:none"');
    }
    // ===== kimi 真理 mall=绿 ramp（index/mall/me 统一绿；community=蓝 ramp）不是旧 V6.1 theme-color 伪属性 =====
    expect(mall).toContain('--hd1:#009146');
    expect(mall).toContain('--hd2:#006b36');
    expect(mall).toMatch(/class="[^"]*\bbans\b/);   // mall.html 三图轮播
    expect(mall).toMatch(/class="[^"]*\bsk\b/);     // mall.html 秒杀减重版
    expect(mall).toMatch(/class="[^"]*\bcats\b/);   // mall.html 4 列金刚 badge
    expect(mall).toMatch(/class="[^"]*\btg\b/);     // mall.html 团购进度
    expect(mall).toMatch(/class="[^"]*\bwf\b/);     // mall.html 瀑布流
    expect(community).toContain('--hd1:#1a4fb0');
    expect(community).toContain('--hd2:#0c2a80');
    expect(community).toMatch(/class="[^"]*\bbans\b/);    // quan.html 三图（团购/丽人/亲子）
    expect(community).toMatch(/class="[^"]*\bqic\b/);     // quan.html 场景 4 宫格
    expect(community).toMatch(/class="[^"]*\bshops\b/);   // quan.html 附近门店密列表
    expect(community).toMatch(/class="[^"]*\bdeals\b/);   // quan.html 团购卡片列表
  });
});
