import { describe, expect, it } from 'vitest';
import { workbenchRiskExperiences } from './page-experiences-risk.mjs';
describe('乐趣宝平台风险与移动待办专属页面体验', () => {
  it('十页十种布局', () => {
    expect(workbenchRiskExperiences).toHaveLength(10);
    expect(new Set(workbenchRiskExperiences.map((i) => i.page)).size).toBe(10);
    expect(new Set(workbenchRiskExperiences.map((i) => i.layout)).size).toBe(10);
  });
  it.each(workbenchRiskExperiences)('$page 具备四区和风险边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
});
