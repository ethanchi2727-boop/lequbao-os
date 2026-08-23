import { describe, expect, it } from 'vitest';
import experiences from '../generated/merchant-experiences-service.json';

describe('商家小程序券码客服会员隐私体验', () => {
  it('八页八布局并且路由唯一', () => {
    expect(experiences).toHaveLength(8);
    expect(new Set(experiences.map((item) => item.id)).size).toBe(8);
    expect(new Set(experiences.map((item) => item.layout)).size).toBe(8);
  });

  it.each(experiences)('$id 具备四项事实、双动作和服务边界', (item) => {
    expect(item.facts).toHaveLength(4);
    expect(item.actions).toHaveLength(2);
    expect(item.actions.every((action) => action.route.startsWith('/merchant/page-'))).toBe(true);
    expect(item.guardrail).toMatch(/不|不能|不得|必须/u);
  });

  it('AI、人工和隐私页保持身份与授权边界', () => {
    expect(experiences.find((item) => item.id === 'PAGE-298').guardrail).toContain(
      'AI 不得冒充人工',
    );
    expect(experiences.find((item) => item.id === 'PAGE-299').guardrail).toContain('身份必须明确');
    expect(experiences.find((item) => item.id === 'PAGE-307').guardrail).toContain('不得');
  });
});
