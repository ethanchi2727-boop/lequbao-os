import { describe, expect, it } from 'vitest';
import { canCommit, resolvePage, statusCopy, viewFor } from './state.mjs';

describe('乐趣宝建档页面状态', () => {
  it('只接受已实现页面路由', () => {
    expect(resolvePage('/bao/page-178')).toBe('page-178');
    expect(resolvePage('/bao/unknown')).toBe('page-014');
  });
  it('PC 与移动页面共享状态模型', () => {
    expect(viewFor('page-014').mobile).toBe(false);
    expect(viewFor('page-175').mobile).toBe(true);
  });
  it('未确认高风险字段或冲突阻止提交', () => {
    expect(canCommit([{ risk: 'HIGH', status: 'PROPOSED' }])).toBe(false);
    expect(canCommit([{ risk: 'LOW', status: 'CONFLICT' }])).toBe(false);
    expect(canCommit([{ risk: 'HIGH', status: 'CONFIRMED' }])).toBe(true);
  });
  it('可恢复错误明确承诺不丢原材料', () => {
    expect(statusCopy('error')?.[1]).toContain('原材料已保留');
  });
});
