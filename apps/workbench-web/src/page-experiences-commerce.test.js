import { describe, expect, it } from 'vitest';
import { workbenchCommerceExperiences } from './page-experiences-commerce.mjs';

describe('乐趣宝资料、商品与订单专属页面体验', () => {
  it('十个页面拥有十种独立布局', () => {
    expect(workbenchCommerceExperiences).toHaveLength(10);
    expect(new Set(workbenchCommerceExperiences.map((item) => item.page)).size).toBe(10);
    expect(new Set(workbenchCommerceExperiences.map((item) => item.layout)).size).toBe(10);
  });

  it.each(workbenchCommerceExperiences)('$page 具备四个任务区和交易安全边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
});
