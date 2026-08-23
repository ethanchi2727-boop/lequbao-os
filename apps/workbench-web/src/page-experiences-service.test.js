import { describe, expect, it } from 'vitest';
import { workbenchServiceExperiences } from './page-experiences-service.mjs';

describe('乐趣宝履约、客服与客户专属页面体验', () => {
  it('十个页面拥有十种独立布局', () => {
    expect(workbenchServiceExperiences).toHaveLength(10);
    expect(new Set(workbenchServiceExperiences.map((item) => item.page)).size).toBe(10);
    expect(new Set(workbenchServiceExperiences.map((item) => item.layout)).size).toBe(10);
  });
  it.each(workbenchServiceExperiences)('$page 具备四个任务区和服务安全边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
});
