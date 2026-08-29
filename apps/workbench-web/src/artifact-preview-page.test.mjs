import { describe, expect, it, vi } from 'vitest';
import {
  renderConversationThread,
  renderConversationTopbar,
  switchWorkbenchTenant,
} from './artifact-preview-page.mjs';

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
    expect(html).toContain('人工确认记录');
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
    expect(html).toContain('上游服务超时');
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
    expect(html).toContain('退款纠纷');
    expect(html).toContain('紧急 · 待处理');
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
    expect(html).toContain('等待审批');
    expect(html).toContain('上游服务超时');
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
    expect(html).toContain('供应商超时');
    expect(html).not.toContain('UPSTREAM_TIMEOUT');
  });

  it('材料库展示扫描状态、哈希、字段引用与安全上传边界', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-011', title: '材料与来源' },
      demoMode: true,
      livePageState: { data: null },
      view: { page: 'page-011', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="source-library"');
    expect(html).toContain('data-action="material-search"');
    expect(html).toContain('营业执照.jpg');
    expect(html).toContain('检测到恶意文件');
    expect(html).toContain('2 个字段引用');
    expect(html).toContain('不向浏览器返回对象存储地址');
  });

  it('材料库生产态只展示服务端返回的脱敏元数据', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-011', title: '材料与来源' },
      demoMode: false,
      livePageState: {
        data: {
          id: 'session-live',
          status: 'EXTRACTING',
          channel: 'WEB',
          fields: [{ sourceAssetId: 'asset-live' }],
          assets: [
            {
              id: 'asset-live',
              sourceChannel: 'WEB',
              assetType: 'DOCUMENT',
              originalFilename: '合同.pdf',
              mimeType: 'application/pdf',
              sha256: 'e'.repeat(64),
              securityStatus: 'SAFE',
              processingStatus: 'SUCCEEDED',
              errorCode: null,
              createdAt: '2026-08-25T00:00:00.000Z',
            },
          ],
        },
      },
      view: { page: 'page-011', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('合同.pdf');
    expect(html).toContain('1 个字段引用');
    expect(html).toContain('data-command="merchant-intake-message-add"');
    expect(html).not.toContain('object_key');
    expect(html).not.toContain('objectKey');
  });

  it('材料与语音页提供类型、扫描、转写和安全采集闭环', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-015', title: '材料与语音' },
      demoMode: true,
      livePageState: { data: null },
      view: { page: 'page-015', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="material-capture"');
    expect(html).toContain('MP3 / WAV / M4A / AMR');
    expect(html).toContain('店长补充说明.wav');
    expect(html).toContain('选择文件并安全上传');
    expect(html).toContain('处理中');
    expect(html).toContain('/bao/page-011?demo=1&sessionId=demo-intake-session');
  });

  it('识别结果并列字段候选、置信度、冲突和原始来源', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-016', title: '识别结果' },
      demoMode: true,
      livePageState: { data: null },
      view: { page: 'page-016', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="recognition-review"');
    expect(html).toContain('merchant.legalName');
    expect(html).toContain('99%');
    expect(html).toContain('冲突');
    expect(html).toContain('店长补充说明.wav');
    expect(html).toContain('/bao/page-018?demo=1&sessionId=demo-intake-session');
    expect(html).not.toContain('AI 自动确认');
  });

  it('缺项追问区分阻断与建议，并保留原会话恢复边界', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-017', title: '缺项追问' },
      demoMode: true,
      livePageState: { data: null },
      view: { page: 'page-017', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="missing-items"');
    expect(html).toContain('merchant.publicContact');
    expect(html).toContain('product.refundRule');
    expect(html).toContain('暂不提供');
    expect(html).toContain('继续原任务');
    expect(html).toContain('/bao/page-016?demo=1&sessionId=demo-intake-session');
    expect(html).not.toContain('data-command="merchant-intake-message-add"');
  });

  it('确认变更逐字段展示候选、影响、资格和版本绑定', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-018', title: '确认变更' },
      demoMode: true,
      livePageState: { data: null },
      view: { page: 'page-018', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="change-confirmation"');
    expect(html).toContain('尚未写入正式档案');
    expect(html).toContain('merchant.public_contact.phone');
    expect(html).toContain('不同风险类型必须分别提交');
    expect(html).toContain('服务端最终裁决');
    expect(html).toContain('/bao/page-021?demo=1&sessionId=demo-intake-session');
    expect(html).not.toContain('data-command="merchant-intake-confirm"');
  });

  it('字段来源保留候选历史、材料哈希和未暴露证据边界', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-019', title: '字段来源' },
      demoMode: true,
      livePageState: { data: null },
      view: { page: 'page-019', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="field-provenance"');
    expect(html).toContain('store.address');
    expect(html).toContain('店长补充说明.wav');
    expect(html).toContain('SHA-256');
    expect(html).toContain('不在客户端推测');
    expect(html).toContain('/bao/page-020?demo=1&sessionId=demo-intake-session');
  });

  it('身份空间展示服务端会话范围和真实切换边界', () => {
    const html = renderConversationThread({
      contract: { id: 'PAGE-012', title: '身份与空间切换' },
      demoMode: false,
      livePageState: {
        data: {
          tenantId: 'tenant-live',
          userId: 'user-live',
          roleCodes: ['STORE_MANAGER'],
          storeIds: ['store-live'],
          sessionId: 'session-live',
          authLevel: 'MFA',
        },
      },
      view: { page: 'page-012', state: 'default' },
      escapeHtml,
    });
    expect(html).toContain('data-experience="identity-switcher"');
    expect(html).toContain('门店店长');
    expect(html).toContain('tenant-live');
    expect(html).toContain('data-tenant-switch');
    expect(html).not.toContain('accessToken');
    expect(html).not.toContain('refreshToken');
  });

  it('工作台切换只提交目标租户和设备绑定', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accessToken: 'new-access', identity: { tenantId: 'tenant-2' } }),
    });
    await expect(
      switchWorkbenchTenant({
        tenantId: 'tenant-2',
        token: 'current-access',
        deviceId: 'workbench-device-1',
        request,
      }),
    ).resolves.toMatchObject({ accessToken: 'new-access' });
    expect(request).toHaveBeenCalledWith(
      '/api/v1/auth/sessions/switch-tenant',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer current-access' }),
        body: JSON.stringify({ tenantId: 'tenant-2', deviceId: 'workbench-device-1' }),
      }),
    );
  });

  it('工作台不接受缺少有效新会话的切换响应', async () => {
    await expect(
      switchWorkbenchTenant({
        tenantId: 'tenant-2',
        token: 'current-access',
        deviceId: 'workbench-device-1',
        request: async () => ({ ok: true, json: async () => ({}) }),
      }),
    ).rejects.toThrow('SESSION_RESPONSE_INVALID');
  });
});
