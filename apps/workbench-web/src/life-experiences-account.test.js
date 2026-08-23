import { describe, expect, it } from 'vitest';
import { lifeAccountExperiences } from './life-experiences-account.mjs';
describe('乐趣生活会员订单售后叶子页', () => {
  it('十页十布局且全部会话保护', () => {
    expect(lifeAccountExperiences).toHaveLength(10);
    expect(new Set(lifeAccountExperiences.map((i) => i.layout)).size).toBe(10);
    expect(lifeAccountExperiences.every((i) => i.requiresSession)).toBe(true);
  });
  it.each(lifeAccountExperiences)('$page 具备四区和隐私交易边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
});
