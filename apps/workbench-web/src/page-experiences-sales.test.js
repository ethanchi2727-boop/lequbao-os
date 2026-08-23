import { describe, expect, it } from 'vitest';
import { workbenchRevenueExperiences } from './page-experiences-revenue.mjs';
import { workbenchSalesExperiences } from './page-experiences-sales.mjs';

describe('乐趣宝商务与收益专属页面体验', () => {
  const experiences = [...workbenchSalesExperiences, ...workbenchRevenueExperiences];

  it('十二个页面拥有十二种独立布局', () => {
    expect(experiences).toHaveLength(12);
    expect(new Set(experiences.map((experience) => experience.page)).size).toBe(12);
    expect(new Set(experiences.map((experience) => experience.layout)).size).toBe(12);
  });

  it.each(experiences)('$page 具备四个任务区、双向入口和安全边界', (experience) => {
    expect(experience.panels).toHaveLength(4);
    expect(experience.actions).toHaveLength(2);
    expect(experience.guardrail).toMatch(/不|不能|必须|不可/u);
  });
});
