import { describe, expect, it } from 'vitest';
import { lifeCheckoutExperiences } from './life-experiences-checkout.mjs';
describe('乐趣生活附近与结算叶子页', () => {
  it('十页十布局', () => {
    expect(lifeCheckoutExperiences).toHaveLength(10);
    expect(new Set(lifeCheckoutExperiences.map((i) => i.page)).size).toBe(10);
    expect(new Set(lifeCheckoutExperiences.map((i) => i.layout)).size).toBe(10);
  });
  it.each(lifeCheckoutExperiences)('$page 具备四区和交易边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
  it('购物车到支付结果均要求消费者会话', () => {
    expect(lifeCheckoutExperiences.slice(4).every((i) => i.requiresSession)).toBe(true);
  });
});
