import { describe, expect, it } from 'vitest';
import { lifeDiscoveryExperiences } from './life-experiences-discovery.mjs';
describe('乐趣生活发现与商品叶子页', () => {
  it('十页十布局', () => {
    expect(lifeDiscoveryExperiences).toHaveLength(10);
    expect(new Set(lifeDiscoveryExperiences.map((i) => i.page)).size).toBe(10);
    expect(new Set(lifeDiscoveryExperiences.map((i) => i.layout)).size).toBe(10);
  });
  it.each(lifeDiscoveryExperiences)('$page 具备四区与消费边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
});
