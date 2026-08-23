import { describe, expect, it } from 'vitest';
import { workbenchDeliveryExperiences } from './page-experiences-delivery.mjs';

describe('乐趣宝收益生命周期与交付专属页面体验', () => {
  it('十个页面拥有十种独立布局', () => {
    expect(workbenchDeliveryExperiences).toHaveLength(10);
    expect(new Set(workbenchDeliveryExperiences.map((item) => item.page)).size).toBe(10);
    expect(new Set(workbenchDeliveryExperiences.map((item) => item.layout)).size).toBe(10);
  });

  it.each(workbenchDeliveryExperiences)('$page 具备四个任务区和安全边界', (experience) => {
    expect(experience.panels).toHaveLength(4);
    expect(experience.actions).toHaveLength(2);
    expect(experience.guardrail).toMatch(/不|不能|必须|不可/u);
  });
});
