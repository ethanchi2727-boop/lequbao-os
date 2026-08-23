import { describe, expect, it } from 'vitest';
import { workbenchIntakeExperiences } from './page-experiences-intake.mjs';

describe('乐趣宝建档与今日经营专属页面体验', () => {
  it('八个后续叶子页都有独立任务布局', () => {
    expect(workbenchIntakeExperiences.map((experience) => experience.page)).toEqual([
      'page-015',
      'page-016',
      'page-017',
      'page-018',
      'page-019',
      'page-020',
      'page-021',
      'page-024',
    ]);
    expect(new Set(workbenchIntakeExperiences.map((experience) => experience.layout)).size).toBe(8);
  });

  it.each(workbenchIntakeExperiences)('$page 具备四个专属任务区和安全边界', (experience) => {
    expect(experience.panels).toHaveLength(4);
    expect(experience.actions.length).toBeGreaterThanOrEqual(2);
    expect(experience.guardrail).toMatch(/不|不能|必须|不可/u);
  });
});
