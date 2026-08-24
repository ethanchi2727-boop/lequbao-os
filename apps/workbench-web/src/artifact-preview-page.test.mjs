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
});
