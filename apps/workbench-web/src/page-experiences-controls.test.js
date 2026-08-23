import { describe, expect, it } from 'vitest';
import {
  workbenchControlExperienceById,
  workbenchControlExperiences,
} from './page-experiences-controls.mjs';
describe('乐趣宝分析、生态、套餐与权限专属页面体验', () => {
  it('十个页面拥有十种独立布局', () => {
    expect(workbenchControlExperiences).toHaveLength(10);
    expect(new Set(workbenchControlExperiences.map((i) => i.page)).size).toBe(10);
    expect(new Set(workbenchControlExperiences.map((i) => i.layout)).size).toBe(10);
  });
  it.each(workbenchControlExperiences)('$page 具备四个任务区和控制边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
  it('AI 用量使用产品术语 Token', () => {
    expect(workbenchControlExperienceById.get('page-138').headline).toContain('Token');
  });
});
