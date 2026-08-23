import { describe, expect, it } from 'vitest';
import { workbenchEngagementExperiences } from './page-experiences-engagement.mjs';
describe('乐趣宝客户、连接、奖励与报告专属页面体验', () => {
  it('十个页面拥有十种独立布局', () => {
    expect(workbenchEngagementExperiences).toHaveLength(10);
    expect(new Set(workbenchEngagementExperiences.map((item) => item.page)).size).toBe(10);
    expect(new Set(workbenchEngagementExperiences.map((item) => item.layout)).size).toBe(10);
  });
  it.each(workbenchEngagementExperiences)('$page 具备四个任务区和业务安全边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
});
