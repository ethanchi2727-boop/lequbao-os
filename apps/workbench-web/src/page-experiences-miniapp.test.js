import { describe, expect, it } from 'vitest';
import { workbenchMiniappExperiences } from './page-experiences-miniapp.mjs';

describe('乐趣宝小程序交付专属页面体验', () => {
  it('十个页面拥有十种独立布局', () => {
    expect(workbenchMiniappExperiences).toHaveLength(10);
    expect(new Set(workbenchMiniappExperiences.map((item) => item.page)).size).toBe(10);
    expect(new Set(workbenchMiniappExperiences.map((item) => item.layout)).size).toBe(10);
  });

  it.each(workbenchMiniappExperiences)('$page 具备四个任务区和 provider 安全边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不可/u);
  });
});
