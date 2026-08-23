import { describe, expect, it } from 'vitest';
import { workbenchMobileExperiences } from './page-experiences-mobile.mjs';
describe('乐趣宝移动专属页面体验', () => {
  it('十页十布局', () => {
    expect(workbenchMobileExperiences).toHaveLength(10);
    expect(new Set(workbenchMobileExperiences.map((i) => i.page)).size).toBe(10);
    expect(new Set(workbenchMobileExperiences.map((i) => i.layout)).size).toBe(10);
  });
  it.each(workbenchMobileExperiences)('$page 具备四区和移动安全边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
});
