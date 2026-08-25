const FROZEN_PAGES = new Set([
  '198',
  '200',
  '201',
  '203',
  '204',
  '207',
  '209',
  '210',
  '211',
  '213',
  '216',
  '218',
  '221',
  '224',
  '227',
  '228',
  '229',
  '231',
  '232',
  '235',
  '237',
  '238',
  '239',
  '240',
  '219',
  '242',
  '243',
  '245',
  '246',
  '248',
  '250',
  '252',
  '254',
  '255',
  '258',
  '259',
  '262',
  '264',
]);

export const lifeCategories = Object.freeze([
  { id: 'fresh', label: '果蔬生鲜', productType: 'PHYSICAL', accent: 'green' },
  { id: 'home', label: '家庭日用', productType: 'PHYSICAL', accent: 'orange' },
  { id: 'dining', label: '餐饮团购', productType: 'GROUP_BUY', accent: 'red' },
  { id: 'leisure', label: '休闲娱乐', productType: 'SERVICE', accent: 'blue' },
  { id: 'stay', label: '住宿旅行', productType: 'SERVICE', accent: 'purple' },
  { id: 'digital', label: '数字好物', productType: 'DIGITAL_SUPPLY', accent: 'gold' },
]);

export function normalizeLifeQuery(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/gu, ' ')
    .slice(0, 60);
}

export function filterLifeDiscovery(records, query) {
  const keyword = normalizeLifeQuery(query).toLocaleLowerCase('zh-CN');
  if (!keyword) return [...records];
  return records.filter((record) =>
    [record.title, record.name, record.storeName, record.variantTitle, record.cityCode]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(keyword)),
  );
}

export function categoryById(categoryId) {
  return lifeCategories.find((category) => category.id === categoryId) ?? lifeCategories[0];
}

export function frozenLifePageRoute(pathname, search = '') {
  const match = String(pathname).match(/\/life\/page-(\d{3})\/?$/u);
  if (!match || !FROZEN_PAGES.has(match[1])) return null;
  const safe = new URLSearchParams();
  const incoming = new URLSearchParams(String(search).replace(/^\?/u, ''));
  for (const name of ['merchantTenantId', 'storeId', 'orderId', 'conversationId']) {
    if (name === 'conversationId' && !['258', '262', '264'].includes(match[1])) continue;
    const value = incoming.get(name);
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        value ?? '',
      )
    )
      safe.set(name, value);
  }
  const suffix = safe.toString();
  return `/pages/page-${match[1]}/index${suffix ? `?${suffix}` : ''}`;
}

export function recentLifeSearches(values, nextValue) {
  const next = normalizeLifeQuery(nextValue);
  return [next, ...values.map(normalizeLifeQuery)]
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 8);
}
