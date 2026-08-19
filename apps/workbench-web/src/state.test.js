import { describe, expect, it } from 'vitest';
import {
  canCommit,
  escapeHtml,
  resolvePage,
  statusCopy,
  updateResultPanel,
  viewFor,
} from './state.mjs';

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
    expect(statusCopy('recoverable-failure')?.[1]).toContain('安全断点');
  });
  it('全部135个乐趣宝叶子路由都有稳定页面契约和八种状态', async () => {
    const { workbenchPageContracts } = await import('./page-contracts.mjs');
    expect(workbenchPageContracts).toHaveLength(135);
    expect(new Set(workbenchPageContracts.map((page) => page.route)).size).toBe(135);
    expect(workbenchPageContracts.every((page) => page.states.length === 8)).toBe(true);
    expect(resolvePage('/bao/page-122')).toBe('page-122');
    expect(viewFor('page-122', 'recoverable-failure').title).toBe('月度价值报告');
  });
  it('服务端候选值进入模板前必须转义', () => {
    expect(escapeHtml('<img src=x onerror="steal()">')).toBe(
      '&lt;img src=x onerror=&quot;steal()&quot;&gt;',
    );
  });
  it('UI-005 任务、成果、来源三页签与关闭操作可恢复', () => {
    let panel = { open: true, tab: 'task' };
    panel = updateResultPanel(panel, 'tab', 'source');
    expect(panel).toEqual({ open: true, tab: 'source' });
    panel = updateResultPanel(panel, 'close');
    expect(panel.open).toBe(false);
    expect(updateResultPanel(panel, 'open').open).toBe(true);
  });
});
