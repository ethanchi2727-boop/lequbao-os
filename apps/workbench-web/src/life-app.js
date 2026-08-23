import { createLifeApi, LifeApiError } from './life-api.js';

const root = document.querySelector('#life-app');
const params = new URLSearchParams(location.search);
const demoMode = params.get('demo') === '1';
const api = createLifeApi({ token: sessionStorage.getItem('lequlife.consumer-session') });

const categories = [
  ['果蔬', '新鲜果蔬'],
  ['肉蛋', '肉禽蛋水产'],
  ['粮油', '米面粮油'],
  ['烘焙', '乳品烘焙'],
  ['饮品', '酒水饮料'],
  ['零食', '休闲零食'],
  ['快手菜', '快手好菜'],
  ['休闲', '影视休闲'],
  ['住宿', '酒店住宿'],
  ['清洁', '纸品清洁'],
  ['养车', '洗车养护'],
  ['健康', '健康养护'],
  ['亲子', '亲子教育'],
  ['鲜花', '鲜花礼品'],
  ['缴费', '生活缴费'],
  ['好券', '会员好券'],
];

const demoProducts = [
  {
    id: 'demo-1',
    title: '云南高原蓝莓',
    detail: '125g × 4盒 · 冷链到家',
    salePriceCents: 3990,
    tag: '今日鲜选',
  },
  {
    id: 'demo-2',
    title: '原切谷饲牛排',
    detail: '180g × 3片 · 顺丰冷链',
    salePriceCents: 8990,
    tag: '家庭常备',
  },
  {
    id: 'demo-3',
    title: '低温鲜牛乳',
    detail: '950ml · 当日配送',
    salePriceCents: 2190,
    tag: '本地直送',
  },
  {
    id: 'demo-4',
    title: '时令蔬菜组合',
    detail: '6种搭配 · 约2.5kg',
    salePriceCents: 2990,
    tag: '产地可查',
  },
];

const tabs = [
  ['life', '生活消费', 'home'],
  ['mall', '商城', 'bag'],
  ['community', '生活圈', 'pin'],
  ['cart', '购物车', 'cart'],
  ['me', '我的', 'user'],
];

const icons = {
  home: 'M4 11 12 4l8 7v9H5v-9Zm5 9v-6h6v6',
  bag: 'M5 8h14l-1 12H6L5 8Zm4 0V6a3 3 0 0 1 6 0v2',
  pin: 'M12 21s6-5 6-11a6 6 0 1 0-12 0c0 6 6 11 6 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  cart: 'M3 5h2l2 10h10l3-7H6M9 20h.01M17 20h.01',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4 4',
  spark: 'm12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z',
  shield: 'M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Zm-3 9 2 2 4-5',
  order: 'M6 3h12v18H6V3Zm3 5h6M9 12h6M9 16h4',
  ticket: 'M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V6Z',
  heart: 'M12 20S4 15 4 9a4 4 0 0 1 7-3 4 4 0 0 1 7 3c0 6-6 11-6 11Z',
  headset: 'M4 13v-2a8 8 0 0 1 16 0v2M4 13h3v6H4v-6Zm13 0h3v6h-3v-6ZM17 19c0 2-2 2-5 2',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4',
  arrow: 'm9 5 7 7-7 7',
  back: 'm15 5-7 7 7 7',
  truck:
    'M3 6h11v11H3V6Zm11 4h4l3 4v3h-7v-7ZM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  leaf: 'M19 4C10 4 5 8 5 14c0 3 2 5 5 5 6 0 9-6 9-15ZM5 20c2-5 6-8 11-11',
  check: 'm5 12 4 4 10-10',
};

const icon = (name) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[name]}"/></svg>`;
const money = (cents) => (Number(cents || 0) / 100).toFixed(2);
const safe = (value) =>
  String(value ?? '').replace(
    /[&<>'"]/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char],
  );

function currentTab() {
  const segment = location.pathname.split('/').filter(Boolean)[1] || 'life';
  return tabs.some(([id]) => id === segment) ? segment : 'life';
}

function shell(content, active = currentTab()) {
  return `<div class="life-shell">
    ${demoMode ? '<div class="preview-ribbon">开发预览 · 页面数据为 Mock，不产生真实订单</div>' : ''}
    <header class="life-top"><button class="location" type="button"><b>上海</b><span>黄浦区</span></button><a class="assistant" href="/life/assistant${demoMode ? '?demo=1' : ''}">${icon('spark')}<span>小满助手</span></a></header>
    <main id="life-main">${content}</main>
    <nav class="life-tabs" aria-label="乐趣生活主导航">${tabs.map(([id, label, glyph]) => `<a href="/life/${id}${demoMode ? '?demo=1' : ''}" class="${active === id ? 'active' : ''}" data-route><span>${icon(glyph)}</span><b>${label}</b></a>`).join('')}</nav>
  </div>`;
}

function stateCard(kind, title, detail, action = '') {
  return `<section class="life-state ${kind}" role="status"><span>${icon(kind === 'error' ? 'shield' : 'spark')}</span><h1>${safe(title)}</h1><p>${safe(detail)}</p>${action}</section>`;
}

function productCard(product) {
  return `<article class="product-card"><a href="/life/product/${safe(product.id)}${demoMode ? '?demo=1' : ''}" data-route aria-label="查看${safe(product.title)}"><img src="/life-assets/life-product.webp" alt="${safe(product.title)}"/><div class="product-copy"><small>${safe(product.tag || '真实在售')}</small><h3>${safe(product.title)}</h3><p>${safe(product.detail || '规格和履约规则请查看详情')}</p><div><strong><i>¥</i>${money(product.salePriceCents)}</strong><button type="button" aria-label="加入购物车" data-add-cart="${safe(product.id)}">+</button></div></div></a></article>`;
}

async function home() {
  root.innerHTML = shell(stateCard('loading', '正在准备今天的好生活', '附近、商城和优惠正在加载'));
  try {
    const products = demoMode ? demoProducts : await api.products('PHYSICAL');
    const items = Array.isArray(products) ? products : products.items || [];
    const body = `<section class="search-wrap"><button type="button" class="search-box">${icon('search')}<span>搜索商品、团购和附近门店</span></button></section>
      <section class="hero-card"><img src="/life-assets/life-banner.webp" alt="新鲜生活，今天送到"/><div class="hero-shade"></div><div class="hero-copy"><small>今日生活直供</small><h1>把新鲜和附近<br/>装进生活篮子</h1><p>当日达 · 来源可查 · 售后有入口</p><a href="/life/mall${demoMode ? '?demo=1' : ''}" data-route>去逛逛 <span>→</span></a></div></section>
      <section class="category-section" aria-labelledby="category-title"><div class="section-title"><div><small>生活分类</small><h2 id="category-title">今天想找什么</h2></div><a href="/life/categories${demoMode ? '?demo=1' : ''}" data-route>全部分类</a></div><div class="category-grid">${categories
        .slice(0, 10)
        .map(
          ([short, label], index) =>
            `<a href="/life/categories?index=${index}${demoMode ? '&demo=1' : ''}" data-route><span class="category-icon category-${index}"><img src="/life-assets/life-category-sprite.webp" alt=""/></span><b>${safe(short)}</b><small>${safe(label)}</small></a>`,
        )
        .join('')}</div></section>
      <section class="fresh-strip"><span>${icon('shield')}</span><div><b>放心消费保障</b><small>来源可查 · 规则透明 · 售后有门</small></div><strong>查看保障</strong></section>
      <section class="content-section"><div class="section-title"><div><small>今日严选</small><h2>值得买的生活好物</h2></div><a href="/life/mall${demoMode ? '?demo=1' : ''}" data-route>更多</a></div>${items.length ? `<div class="product-grid">${items.slice(0, 4).map(productCard).join('')}</div>` : stateCard('empty', '今天的货架还在整理', '换个分类或稍后再来看看')}</section>
      <section class="nearby-section"><div class="section-title"><div><small>附近热团</small><h2>下班后，和喜欢的人吃顿好的</h2></div></div><a class="nearby-card" href="/life/community${demoMode ? '?demo=1' : ''}" data-route><img src="/life-assets/local-dining.webp" alt="附近聚餐团购"/><div><small>距你 1.2km</small><h3>双人精选晚餐</h3><p>到店规则和有效期，下单前一次说清</p><strong>¥168 <i>门市价 ¥238</i></strong></div></a></section>`;
    root.innerHTML = shell(body, 'life');
  } catch (error) {
    const unauthorized = error instanceof LifeApiError && error.status === 401;
    root.innerHTML = shell(
      stateCard(
        unauthorized ? 'locked' : 'error',
        unauthorized ? '登录后继续' : '内容没有加载出来',
        unauthorized
          ? '浏览不收集你的手机号；下单和查看个人订单时再授权。'
          : '网络恢复后可以安全重试。',
        '<button type="button" data-retry>重新加载</button>',
      ),
      'life',
    );
  }
}

function requiresPreview(active) {
  if (demoMode) return false;
  root.innerHTML = shell(
    stateCard('locked', '登录后继续', '当前页面包含个人交易或服务数据，需要先建立消费者会话。'),
    active,
  );
  return true;
}

function innerHeader(title, detail) {
  return `<header class="inner-head"><button type="button" data-back aria-label="返回">${icon('back')}</button><div><h1>${safe(title)}</h1><small>${safe(detail)}</small></div><a href="/life/cart${demoMode ? '?demo=1' : ''}" data-route aria-label="购物车">${icon('cart')}</a></header>`;
}

function categoriesPage() {
  if (requiresPreview('life')) return;
  const selected = Math.max(
    0,
    Math.min(categories.length - 1, Number(paramsForLocation().get('index') || 0)),
  );
  root.innerHTML = shell(
    `${innerHeader('全部分类', '16 个生活场景')}<section class="category-browser"><aside>${categories.map(([short], index) => `<a class="${selected === index ? 'active' : ''}" href="/life/categories?index=${index}${demoMode ? '&demo=1' : ''}" data-route>${safe(short)}</a>`).join('')}</aside><div><section class="category-feature"><span class="category-icon category-${selected}"><img src="/life-assets/life-category-sprite.webp" alt=""/></span><div><small>生活严选</small><h2>${safe(categories[selected][1])}</h2><p>价格、规格、来源和履约规则清楚可查</p></div></section><h3>热门推荐</h3><div class="category-products">${demoProducts.map((item) => `<a href="/life/product/${item.id}${demoMode ? '?demo=1' : ''}" data-route><img src="/life-assets/life-product.webp" alt="${safe(item.title)}"/><span><b>${safe(item.title)}</b><small>${safe(item.detail)}</small><strong>¥${money(item.salePriceCents)}</strong></span></a>`).join('')}</div></div></section>`,
    'life',
  );
}

function productPage() {
  if (requiresPreview('mall')) return;
  const productId = location.pathname.split('/').filter(Boolean)[2];
  const product = demoProducts.find((item) => item.id === productId) || demoProducts[0];
  root.innerHTML = shell(
    `${innerHeader('商品详情', '价格与履约规则')}<article class="product-detail"><div class="product-gallery"><img src="/life-assets/life-product.webp" alt="${safe(product.title)}"/><span>1 / 3</span></div><section class="product-primary"><div class="product-price"><strong><i>¥</i>${money(product.salePriceCents)}</strong><small>会员预计再省 ¥3.00</small></div><h1>${safe(product.title)}</h1><p>${safe(product.detail)} · 图片与实物以规格说明为准</p><div class="product-badges"><span>${icon('leaf')}来源可查</span><span>${icon('truck')}履约透明</span><span>${icon('shield')}售后有门</span></div></section><section class="detail-row"><span>优惠</span><p><b>满 99 元免基础运费</b><small>优惠不影响消费奖励单独记账</small></p>${icon('arrow')}</section><section class="detail-row"><span>配送</span><p><b>预计明日 09:00–12:00</b><small>冷链配送，签收前可查看实时状态</small></p>${icon('arrow')}</section><section class="detail-row"><span>规格</span><p><b>${safe(product.detail)}</b><small>库存以提交订单时服务端确认为准</small></p>${icon('arrow')}</section><section class="trace-card"><header><span>${icon('leaf')}</span><div><small>版本化溯源报告</small><h2>从产地到交付，全程有据可查</h2></div></header><ol><li><span>${icon('check')}</span><p><b>供应商资质已核验</b><small>报告版本 2026.08</small></p></li><li><span>${icon('check')}</span><p><b>冷链温控记录完整</b><small>本批次运输轨迹可追溯</small></p></li><li><span>${icon('check')}</span><p><b>售后责任主体明确</b><small>乐趣生活平台提供处理入口</small></p></li></ol></section></article><footer class="purchase-bar"><a href="/life/me${demoMode ? '?demo=1' : ''}" data-route>${icon('headset')}<small>客服</small></a><a href="/life/cart${demoMode ? '?demo=1' : ''}" data-route>${icon('cart')}<small>购物车</small></a><button class="secondary-buy">加入购物车</button><button class="primary-buy">立即购买</button></footer>`,
    'mall',
  );
}

function paramsForLocation() {
  return new URLSearchParams(location.search);
}

function mallPage() {
  if (requiresPreview('mall')) return;
  root.innerHTML = shell(
    `<section class="subpage-head mall-head"><small>精选商城</small><h1>把好品质带回家</h1><p>价格、规格、配送与售后规则，下单前一次讲清。</p></section>
    <section class="filter-row" aria-label="商城筛选"><button class="active">全部</button><button>生鲜冷链</button><button>家庭常备</button><button>健康生活</button></section>
    <section class="mall-promo"><div><small>本周家庭采购</small><h2>满 199 元免基础运费</h2><p>不同商家仍按履约能力分组配送</p></div><img src="/life-assets/life-product.webp" alt="家庭采购精选商品"/></section>
    <section class="content-section"><div class="section-title"><div><small>真实在售</small><h2>精选商品</h2></div><button class="sort-button">综合排序</button></div><div class="product-grid">${[...demoProducts, ...demoProducts.map((item, index) => ({ ...item, id: `${item.id}-more`, title: ['有机胚芽米', '深海鳕鱼块', '每日坚果礼盒', '原味酸奶'][index] }))].map(productCard).join('')}</div></section>`,
    'mall',
  );
}

function communityPage() {
  if (requiresPreview('community')) return;
  const deals = [
    ['周末双人精选晚餐', '静安区 · 1.2km', '168', '238'],
    ['亲子手作体验课', '徐汇区 · 2.8km', '79', '128'],
    ['汽车精洗养护套餐', '浦东新区 · 4.1km', '99', '168'],
  ];
  root.innerHTML = shell(
    `<section class="subpage-head community-head"><small>附近好生活</small><h1>今天，在城市里发现点新鲜</h1><p>真实门店、实际距离、适用时段和退款规则清晰可见。</p></section>
    <section class="community-topics"><button class="active">离我最近</button><button>美食聚会</button><button>亲子休闲</button><button>洗车养护</button></section>
    <section class="deal-list">${deals.map(([title, place, price, market], index) => `<a href="/life/deal/demo-${index}${demoMode ? '?demo=1' : ''}" data-route class="deal-card"><img src="/life-assets/local-dining.webp" alt="${safe(title)}"/><div><small>${safe(place)}</small><h2>${safe(title)}</h2><p>到店即用 · 未使用随时退 · 过期自动退</p><footer><strong>¥${price}</strong><i>门市价 ¥${market}</i><span>去看看 ${icon('arrow')}</span></footer></div></a>`).join('')}</section>`,
    'community',
  );
}

function cartPage() {
  if (requiresPreview('cart')) return;
  root.innerHTML = shell(
    `<section class="subpage-head cart-head"><small>分组结算</small><h1>购物车</h1><p>配送、优惠、奖励与实付逐项算清。</p></section>
    <section class="cart-store"><header><div><b>乐趣生活严选</b><small>冷链配送 · 预计明日送达</small></div><span>已选 2 件</span></header>${demoProducts
      .slice(0, 2)
      .map(
        (item, index) =>
          `<article class="cart-item"><input type="checkbox" checked aria-label="选择${safe(item.title)}"/><img src="/life-assets/life-product.webp" alt="${safe(item.title)}"/><div><h2>${safe(item.title)}</h2><p>${safe(item.detail)}</p><footer><strong>¥${money(item.salePriceCents)}</strong><span><button aria-label="减少数量">−</button><b>${index + 1}</b><button aria-label="增加数量">＋</button></span></footer></div></article>`,
      )
      .join(
        '',
      )}<div class="delivery-note"><span>${icon('shield')}</span><p><b>冷链商品独立配送</b><small>满 99 元免基础运费，预计明日 09:00–12:00 送达</small></p></div></section>
    <section class="price-summary"><div><span>商品金额</span><b>¥129.80</b></div><div><span>配送费</span><b>¥0.00</b></div><div><span>优惠</span><b class="discount">−¥10.00</b></div><footer><span>合计 <small>已优惠 ¥10</small></span><strong>¥119.80</strong><button>去结算</button></footer></section>`,
    'cart',
  );
}

function mePage() {
  if (requiresPreview('me')) return;
  const services = [
    ['order', '全部订单', '查看每笔履约'],
    ['ticket', '我的券', '到店出示核销'],
    ['heart', '会员权益', '奖励与成长值'],
    ['headset', '客服售后', 'AI 与人工服务'],
    ['pin', '收货地址', '管理配送地址'],
    ['settings', '隐私设置', '授权可随时撤回'],
  ];
  root.innerHTML = shell(
    `<section class="profile-hero"><div class="avatar">乐</div><div><small>开发预览账户</small><h1>晚上好，生活家</h1><p>消费记录、售后和权益都在这里</p></div><button aria-label="账户设置">${icon('settings')}</button></section>
    <section class="member-card"><div><small>乐趣生活会员</small><h2>本月已为你节省 ¥36.80</h2><p>奖励单独记账，每一笔都可追溯</p></div><span>查看权益 ${icon('arrow')}</span></section>
    <section class="order-panel"><header><h2>我的订单</h2><a href="/life/orders${demoMode ? '?demo=1' : ''}" data-route>全部订单 ${icon('arrow')}</a></header><div>${[
      ['待付款', '1'],
      ['待发货', '0'],
      ['待收货', '2'],
      ['待评价', '3'],
      ['退款/售后', ''],
    ]
      .map(
        ([label, count], index) =>
          `<a href="/life/orders?status=${index}${demoMode ? '&demo=1' : ''}" data-route><span>${icon(index === 4 ? 'headset' : 'order')}${count ? `<i>${count}</i>` : ''}</span><b>${label}</b></a>`,
      )
      .join('')}</div></section>
    <section class="service-panel"><h2>常用服务</h2><div>${services.map(([glyph, title, detail]) => `<a href="/life/service/${glyph}${demoMode ? '?demo=1' : ''}" data-route><span>${icon(glyph)}</span><p><b>${title}</b><small>${detail}</small></p>${icon('arrow')}</a>`).join('')}</div></section>`,
    'me',
  );
}

async function render() {
  if (location.pathname === '/life/categories') return categoriesPage();
  if (location.pathname.startsWith('/life/product/')) return productPage();
  const active = currentTab();
  if (active === 'life') return home();
  if (active === 'mall') return mallPage();
  if (active === 'community') return communityPage();
  if (active === 'cart') return cartPage();
  return mePage();
}

document.addEventListener('click', (event) => {
  const route = event.target.closest('[data-route]');
  if (route && route.origin === location.origin) {
    event.preventDefault();
    history.pushState({}, '', route.href);
    window.scrollTo({ top: 0, behavior: 'instant' });
    void render();
    return;
  }
  if (event.target.closest('[data-retry]')) void render();
  if (event.target.closest('[data-back]')) history.back();
  if (event.target.closest('[data-add-cart]')) {
    event.preventDefault();
    root.querySelector('.toast')?.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = demoMode ? '已加入 Mock 购物车' : '正在加入购物车';
    root.append(toast);
    setTimeout(() => toast.remove(), 1800);
  }
});
window.addEventListener('popstate', () => void render());
void render();
