import { describe, expect, it } from 'vitest';
import { workbenchPageExperiences } from './page-experiences.mjs';

describe('乐趣宝 AI 工作区专属页面体验', () => {
  it('首批九个叶子页都有独立任务布局', () => {
    expect(workbenchPageExperiences.map((experience) => experience.page)).toEqual([
      'page-003',
      'page-004',
      'page-005',
      'page-006',
      'page-007',
      'page-009',
      'page-010',
      'page-011',
      'page-012',
    ]);
    expect(new Set(workbenchPageExperiences.map((experience) => experience.layout)).size).toBe(9);
  });

  it.each(workbenchPageExperiences)('$page 具备专属任务、操作和安全边界', (experience) => {
    expect(experience.headline.length).toBeGreaterThan(12);
    expect(experience.panels.length).toBeGreaterThanOrEqual(3);
    expect(experience.actions.length).toBeGreaterThanOrEqual(1);
    expect(experience.guardrail).toMatch(/不|不能|必须|不可/u);
  });
});
