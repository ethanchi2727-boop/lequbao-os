import { describe, expect, it } from 'vitest';
import {
  canCommit,
  escapeHtml,
  mobileNavigationPage,
  nextSearchResultIndex,
  nextResultTab,
  parseCommandInput,
  primaryNavigationPage,
  resolvePage,
  searchWorkbenchPages,
  statusAnnouncement,
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
  it('主导航按当前业务分区高亮而不是永久停在 AI 对话', () => {
    expect(primaryNavigationPage('page-014')).toBe('page-003');
    expect(primaryNavigationPage('page-078')).toBe('page-053');
    expect(primaryNavigationPage('page-122')).toBe('page-100');
    expect(primaryNavigationPage('page-174')).toBe('page-137');
    expect(primaryNavigationPage('page-178')).toBe('page-003');
  });
  it('移动导航只对五个固定入口设置当前项', () => {
    expect(mobileNavigationPage('page-026')).toBe('page-026');
    expect(mobileNavigationPage('page-178')).toBe('page-003');
  });
  it('错误与拒绝状态立即播报，普通进度礼貌播报', () => {
    expect(statusAnnouncement('recoverable-failure')).toEqual({
      role: 'alert',
      live: 'assertive',
    });
    expect(statusAnnouncement('loading')).toEqual({ role: 'status', live: 'polite' });
  });
  it('静态页面搜索可以按名称和职责定位页面且限制结果数量', () => {
    expect(searchWorkbenchPages('月度价值报告')[0]).toMatchObject({
      id: 'page-122',
      title: '月度价值报告',
    });
    expect(searchWorkbenchPages('商户', 3)).toHaveLength(3);
    expect(searchWorkbenchPages('   ')).toEqual([]);
  });
  it('命令字段解析返回可展示的具体错误而不是静默失败', () => {
    expect(parseCommandInput({ label: '数量', required: true }, '')).toEqual({
      ok: false,
      message: '请填写数量',
    });
    expect(parseCommandInput({ label: '数量', type: 'number' }, '2')).toMatchObject({
      ok: true,
      value: 2,
    });
    expect(parseCommandInput({ label: '配置', type: 'json' }, '[]')).toEqual({
      ok: false,
      message: '配置必须是 JSON 对象',
    });
    expect(parseCommandInput({ label: '范围', type: 'csv' }, 'a, b')).toMatchObject({
      ok: true,
      value: ['a', 'b'],
    });
  });
  it('页面搜索结果支持上下箭头循环移动', () => {
    expect(nextSearchResultIndex(-1, 2, 'ArrowDown')).toBe(0);
    expect(nextSearchResultIndex(0, 2, 'ArrowDown')).toBe(1);
    expect(nextSearchResultIndex(1, 2, 'ArrowDown')).toBe(0);
    expect(nextSearchResultIndex(0, 2, 'ArrowUp')).toBe(1);
    expect(nextSearchResultIndex(-1, 0, 'ArrowDown')).toBe(-1);
  });
  it('任务与成果页签支持左右循环和首尾键', () => {
    expect(nextResultTab('task', 'ArrowLeft')).toBe('source');
    expect(nextResultTab('source', 'ArrowRight')).toBe('task');
    expect(nextResultTab('source', 'Home')).toBe('task');
    expect(nextResultTab('task', 'End')).toBe('source');
  });
});
