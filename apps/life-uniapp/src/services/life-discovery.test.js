import { describe, expect, it } from 'vitest';
import {
  categoryById,
  filterLifeDiscovery,
  frozenLifePageRoute,
  lifeCategories,
  normalizeLifeQuery,
  recentLifeSearches,
} from './life-discovery.js';

describe('life discovery presentation policy', () => {
  it('normalizes bounded consumer search text', () => {
    expect(normalizeLifeQuery('  本地   早餐  ')).toBe('本地 早餐');
    expect(normalizeLifeQuery('x'.repeat(100))).toHaveLength(60);
  });

  it('filters products and stores without mutating source records', () => {
    const source = [
      { title: '有机番茄', storeName: '四季菜场' },
      { title: '家庭保洁', storeName: '安心到家' },
    ];
    expect(filterLifeDiscovery(source, '菜场')).toEqual([source[0]]);
    expect(filterLifeDiscovery(source, '')).not.toBe(source);
  });

  it('keeps one stable taxonomy mapped to server product types', () => {
    expect(lifeCategories).toHaveLength(6);
    expect(categoryById('dining').productType).toBe('GROUP_BUY');
    expect(categoryById('missing')).toEqual(lifeCategories[0]);
  });

  it('maps only implemented frozen public routes into UniApp pages', () => {
    expect(frozenLifePageRoute('/life/page-198')).toBe('/pages/page-198/index');
    expect(frozenLifePageRoute('/life/page-204/')).toBe('/pages/page-204/index');
    expect(frozenLifePageRoute('/life/page-209')).toBe('/pages/page-209/index');
    expect(frozenLifePageRoute('/life/page-213/')).toBe('/pages/page-213/index');
    expect(frozenLifePageRoute('/life/page-214')).toBeNull();
    expect(frozenLifePageRoute('/bao/page-198')).toBeNull();
  });

  it('deduplicates and bounds recent searches', () => {
    expect(recentLifeSearches(['早餐', '咖啡', '早餐'], ' 咖啡 ')).toEqual(['咖啡', '早餐']);
    expect(
      recentLifeSearches(
        Array.from({ length: 12 }, (_, index) => `词${index}`),
        '新词',
      ),
    ).toHaveLength(8);
  });
});
