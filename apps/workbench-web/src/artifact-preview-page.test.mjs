import { describe, expect, it } from 'vitest';
import { renderConversationThread, renderConversationTopbar } from './artifact-preview-page.mjs';

const escapeHtml = (value) => String(value);
const icon = (name) => `<i>${name}</i>`;
const contract = { id: 'PAGE-006', title: '成果预览' };

describe('乐趣宝成果预览', () => {
  it('演示态提供版本、摘要、成果、来源和人工发布边界', () => {
    const html = renderConversationThread({
      contract,
      demoMode: true,
      livePageState: { data: null },
      view: { state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="artifact-preview"');
    expect(html).toContain('演示成果 · 非真实业务数据');
    expect(html).toContain('本周经营复盘_v3.pptx');
    expect(html).toContain('门店经营日报');
    expect(html).toContain('核验后进入发布确认');
  });

  it('生产态只映射服务端脱敏摘要、成果元数据和证据', () => {
    const html = renderConversationThread({
      contract,
      demoMode: false,
      livePageState: {
        data: {
          id: 'task-1',
          conversation_id: 'conversation-1',
          status: 'SUCCEEDED',
          plan_version: 2,
          result_summary_redacted: '服务端脱敏摘要',
          steps: [{ status: 'SUCCEEDED' }],
          artifacts: [
            { name: '真实成果.pdf', status: 'READY', size_bytes: 2048, sha256: 'abcdef1234567890' },
          ],
          evidence: [
            { evidence_type: 'TOOL_RESULT', label: '真实证据', summary_redacted: '已脱敏' },
          ],
        },
      },
      view: { state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('服务端脱敏摘要');
    expect(html).toContain('真实成果.pdf');
    expect(html).toContain('真实证据');
    expect(html).not.toContain('本周经营复盘_v3.pptx');
    expect(html).toContain('/bao/page-007?taskId=task-1');
    expect(html).toContain('/bao/page-005?conversationId=conversation-1');
  });

  it('缺少任务编号时失败关闭且不展示演示成果', () => {
    const html = renderConversationThread({
      contract,
      demoMode: false,
      livePageState: { data: null },
      view: { state: 'empty' },
      escapeHtml,
    });
    expect(html).toContain('缺少任务编号');
    expect(html).not.toContain('本周经营复盘_v3.pptx');
  });

  it('顶栏可新建任务和进入后台队列', () => {
    const html = renderConversationTopbar({
      view: { title: '成果预览' },
      shell: { status: '服务正常' },
      escapeHtml,
      icon,
    });
    expect(html).toContain('data-route="page-003"');
    expect(html).toContain('data-route="page-010"');
  });

  it('来源轨迹展示步骤、工具、证据和不可改写边界', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-007', title: '来源与工具轨迹' },
      demoMode: true,
      livePageState: { data: null },
      view: { page: 'page-007', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="provenance-timeline"');
    expect(html).toContain('merchant-operations');
    expect(html).toContain('HUMAN_CONFIRMATION');
    expect(html).toContain('审计记录不可改写');
    expect(html).toContain('/bao/page-006?demo=1&taskId=demo-task');
  });

  it('来源轨迹生产态不展示演示步骤', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-007', title: '来源与工具轨迹' },
      demoMode: false,
      livePageState: {
        data: {
          id: 'task-live',
          status: 'FAILED',
          steps: [
            {
              step_number: 1,
              action_code: 'LIVE_STEP',
              status: 'FAILED',
              failure_code: 'UPSTREAM_TIMEOUT',
            },
          ],
          evidence: [],
          artifacts: [],
        },
      },
      view: { page: 'page-007', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('LIVE_STEP');
    expect(html).toContain('UPSTREAM_TIMEOUT');
    expect(html).not.toContain('READ_OPERATION_FACTS');
  });

  it('会话列表展示责任队列、风险、截止时间和授权详情入口', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-009', title: '会话列表' },
      demoMode: true,
      livePageState: { data: null },
      view: { page: 'page-009', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="session-inbox"');
    expect(html).toContain('data-action="conversation-search"');
    expect(html).toContain('REFUND_DISPUTE');
    expect(html).toContain('URGENT · OPEN');
    expect(html).toContain('/bao/page-100?demo=1&conversationId=demo-conversation-1');
    expect(html).toContain('列表不预取消息正文');
  });

  it('会话列表生产态只展示服务端授权记录', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-009', title: '会话列表' },
      demoMode: false,
      livePageState: {
        data: [
          {
            id: 'live-1',
            customerId: 'customer-live-998877',
            channel: 'H5',
            status: 'HUMAN_ACTIVE',
            riskLevel: 'NORMAL',
            contextType: 'ORDER',
            updatedAt: '2026-08-24T13:00:00.000Z',
            ticket: null,
          },
        ],
      },
      view: { page: 'page-009', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('998877');
    expect(html).toContain('/bao/page-100?conversationId=live-1');
    expect(html).not.toContain('REFUND_DISPUTE');
  });

  it('后台任务队列区分运行、等待、失败和完成状态', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-010', title: '后台任务' },
      demoMode: true,
      livePageState: { data: null },
      view: { page: 'page-010', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="job-queue"');
    expect(html).toContain('data-action="task-search"');
    expect(html).toContain('WAITING_APPROVAL');
    expect(html).toContain('UPSTREAM_TIMEOUT');
    expect(html).toContain('未知外部结果不允许直接重试');
  });

  it('后台任务生产态只展示服务端返回的当前用户任务', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-010', title: '后台任务' },
      demoMode: false,
      livePageState: {
        data: [
          {
            id: 'live-task-7',
            conversation_id: 'live-conversation-3',
            mode: 'COMPLEX',
            status: 'FAILED',
            retry_count: 1,
            unknown_result: false,
            failure_code: 'PROVIDER_TIMEOUT',
            updated_at: '2026-08-25T00:00:00.000Z',
          },
        ],
      },
      view: { page: 'page-010', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('live-task-7');
    expect(html).toContain('PROVIDER_TIMEOUT');
    expect(html).not.toContain('UPSTREAM_TIMEOUT');
  });
});
