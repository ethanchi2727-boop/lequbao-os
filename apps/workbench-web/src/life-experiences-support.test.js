import { describe, expect, it } from 'vitest';
import { lifeSupportExperiences } from './life-experiences-support.mjs';

describe('乐趣生活设置助手客服叶子页', () => {
  it('八页八布局且全部会话保护', () => {
    expect(lifeSupportExperiences).toHaveLength(8);
    expect(new Set(lifeSupportExperiences.map((item) => item.layout)).size).toBe(8);
    expect(lifeSupportExperiences.every((item) => item.requiresSession)).toBe(true);
  });

  it.each(lifeSupportExperiences)('$page 具备四区和明确服务边界', (item) => {
    expect(item.panels).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.guardrail).toMatch(/不|不能|必须|不得/u);
  });
});
