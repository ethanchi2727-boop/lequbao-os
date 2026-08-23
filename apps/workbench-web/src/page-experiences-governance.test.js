import { describe, expect, it } from 'vitest';
import { workbenchGovernanceExperiences } from './page-experiences-governance.mjs';
describe('乐趣宝隐私、平台与结算治理专属页面体验', () => {
  it('十个页面拥有十种独立布局', () => {
    expect(workbenchGovernanceExperiences).toHaveLength(10);
    expect(new Set(workbenchGovernanceExperiences.map((i) => i.page)).size).toBe(10);
    expect(new Set(workbenchGovernanceExperiences.map((i) => i.layout)).size).toBe(10);
  });
  it.each(workbenchGovernanceExperiences)('$page 具备四个任务区和治理边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
});
