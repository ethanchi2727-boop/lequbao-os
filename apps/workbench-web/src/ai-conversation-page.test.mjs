import { describe, expect, it } from 'vitest';
import { renderConversationThread, renderConversationTopbar } from './ai-conversation-page.mjs';

const escapeHtml = (value) => String(value);
const icon = (name) => `<i>${name}</i>`;
const contract = { id: 'PAGE-004', title: '普通对话' };

describe('乐趣宝 AI 对话态', () => {
  it('演示态明确标注模拟边界并支持可输入的任务对话', () => {
    const html = renderConversationThread({
      contract,
      demoMode: true,
      livePageState: { request: null, data: null },
      view: { state: 'default' },
      conversationDraft: '准备七夕营销活动',
      demoConversationMessages: [],
      escapeHtml,
      icon,
    });
    expect(html).toContain('data-experience="conversation-thread"');
    expect(html).toContain('data-action="start-demo-task"');
    expect(html).toContain('演示模式 · 不写入业务系统');
    expect(html).toContain('筹备七夕营销活动');
  });

  it('生产态连接真实普通任务命令并提交显式安全预算', () => {
    const html = renderConversationThread({
      contract,
      demoMode: false,
      livePageState: {
        request: { commands: [{ id: 'employee-agent-task-create-normal' }] },
        data: { title: '门店经营复盘', status: 'ACTIVE' },
      },
      view: { state: 'default' },
      conversationDraft: '分析本周经营数据',
      demoConversationMessages: [],
      escapeHtml,
      icon,
    });
    expect(html).toContain('data-command="employee-agent-task-create-normal"');
    expect(html).toContain('data-command-field="maxSteps" value="6"');
    expect(html).toContain('data-command-field="maxToolCalls" value="12"');
    expect(html).toContain('提交后需确认当前租户、门店、费用与截止时间');
  });

  it('顶栏提供新对话和后台任务的可达入口', () => {
    const html = renderConversationTopbar({
      view: { title: '普通对话' },
      shell: { status: '服务正常' },
      escapeHtml,
      icon,
    });
    expect(html).toContain('data-route="page-003"');
    expect(html).toContain('data-route="page-010"');
  });

  it('复杂任务态展示计划、预算、来源和人工确认边界', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-005', title: '复杂任务' },
      demoMode: true,
      livePageState: { request: null, data: null },
      view: { page: 'page-005', state: 'default' },
      escapeHtml,
      icon,
    });
    expect(html).toContain('data-experience="task-plan"');
    expect(html).toContain('执行轨迹');
    expect(html).toContain('data-command-field="maxCostMicros"');
    expect(html).toContain('本次成果');
    expect(html).toContain('小满不会自动外发');
    expect(html).toContain('data-action="start-demo-task"');
  });

  it('复杂任务生产态连接真实命令且不展示模拟成果', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-005', title: '复杂任务' },
      demoMode: false,
      livePageState: {
        request: { commands: [{ id: 'employee-agent-task-create-complex' }] },
        data: { title: '管理层汇报', status: 'ACTIVE' },
      },
      view: { page: 'page-005', state: 'default' },
      escapeHtml,
      icon,
    });
    expect(html).toContain('data-command="employee-agent-task-create-complex"');
    expect(html).toContain('生产模式不展示模拟成果');
    expect(html).not.toContain('经营汇报_v1.pptx');
  });
});
