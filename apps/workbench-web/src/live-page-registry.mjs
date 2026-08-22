const definitions = new Map();

function register(pages, definition) {
  for (const page of pages) definitions.set(page, definition);
}

function organizationCommands({
  userId,
  roleCode,
  storeId,
  validUntil,
  assignmentId,
  memberStatus,
}) {
  const storeBoundRole = ['STORE_MANAGER', 'CUSTOMER_SERVICE', 'MARKETER', 'VERIFIER'].includes(
    roleCode,
  );
  return [
    ...(userId && roleCode && (!storeBoundRole || storeId)
      ? [
          {
            id: 'organization-role-assign',
            label: '分配角色',
            path: '/api/v1/organization/role-assignments',
            body: {
              userId,
              roleCode,
              ...(storeId ? { storeId } : {}),
              ...(validUntil ? { validUntil } : {}),
            },
            confirm: `确认向成员 ${userId} 分配角色 ${roleCode}？高风险授权需要 MFA。`,
          },
        ]
      : []),
    ...(assignmentId
      ? [
          {
            id: 'organization-role-revoke',
            label: '撤销角色',
            path: `/api/v1/organization/role-assignments/${encodeURIComponent(assignmentId)}/actions/revoke`,
            body: {},
            confirm: '确认撤销此角色？系统禁止移除最后一个商户负责人。',
          },
        ]
      : []),
    ...(userId && ['ACTIVE', 'SUSPENDED'].includes(memberStatus)
      ? [
          {
            id: 'organization-member-status',
            label: memberStatus === 'SUSPENDED' ? '停用成员' : '恢复成员',
            path: `/api/v1/organization/members/${encodeURIComponent(userId)}/actions/change-status`,
            body: { status: memberStatus },
            confirm:
              memberStatus === 'SUSPENDED'
                ? '确认停用此成员并立即撤销其全部会话？'
                : '确认恢复此成员？角色有效期仍由服务端独立检查。',
          },
        ]
      : []),
  ];
}

const dateTimeInput = (name, label) => ({ name, label, type: 'datetime-local', required: true });
const uuidInput = (name, label, required = true) => ({
  name,
  label,
  type: 'text',
  required,
  placeholder: 'UUID',
});

function opportunityCreateCommand() {
  return {
    id: 'sales-opportunity-create',
    label: '创建商机',
    path: '/api/v1/sales/opportunities',
    body: {},
    inputs: [
      { name: 'legalSubjectName', label: '法律主体名称', required: true },
      { name: 'unifiedCreditCode', label: '统一信用代码', type: 'password' },
      { name: 'contactMobile', label: '联系人手机', type: 'password' },
      { name: 'storeAddress', label: '门店地址' },
      uuidInput('evidenceAssetId', '安全材料编号'),
      dateTimeInput('firstContactAt', '首次联系时间'),
      { name: 'nextAction', label: '下一步', required: true },
      { name: 'protectionDays', label: '保护天数', type: 'number' },
    ],
    confirm: '确认从已通过安全处理的材料创建商机？稳定标识只会以服务端 HMAC 保存。',
  };
}

function subscriptionDecisionCommand(changeId) {
  return {
    id: 'subscription-change-decide',
    label: '审批订阅变更',
    path: `/api/v1/subscription-lifecycle/changes/${encodeURIComponent(changeId)}/actions/decide`,
    body: {},
    inputs: [
      {
        name: 'decision',
        label: '审批决定',
        required: true,
        options: [
          { value: 'APPROVE', label: '批准' },
          { value: 'REJECT', label: '驳回' },
        ],
      },
      { name: 'reasonCode', label: '驳回原因代码' },
    ],
    confirm: '确认审批此订阅变更？申请人与审批人必须不同，且需要 MFA。',
  };
}

function intakeMaterialCommands(sessionId, { message = false, upload = false } = {}) {
  return [
    ...(message
      ? [
          {
            id: 'merchant-intake-message-add',
            label: '补充文字材料',
            path: `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}/messages`,
            body: {},
            inputs: [{ name: 'content', label: '材料内容', required: true }],
            confirm: '确认把这段材料写入当前建档会话？内容会进入安全处理流程。',
          },
        ]
      : []),
    ...(upload
      ? [
          {
            id: 'merchant-intake-upload-create',
            label: '申请安全上传',
            path: `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}/uploads`,
            body: {},
            inputs: [
              {
                name: 'assetType',
                label: '材料类型',
                required: true,
                options: [
                  { value: 'IMAGE', label: '图片' },
                  { value: 'DOCUMENT', label: '文档' },
                  { value: 'AUDIO', label: '语音' },
                ],
              },
              { name: 'sha256', label: '文件 SHA-256', required: true },
              { name: 'contentType', label: '文件类型', required: true },
              { name: 'maxBytes', label: '文件大小上限（字节）', type: 'number', required: true },
            ],
            confirm: '确认申请一次受限上传？服务端仍会校验类型、哈希、大小并先做恶意文件扫描。',
          },
        ]
      : []),
  ];
}

function intakeConfirmationCommand(sessionId) {
  return {
    id: 'merchant-intake-confirm',
    label: '确认字段变更',
    path: `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}/confirmations`,
    body: {},
    inputs: [
      {
        name: 'confirmationType',
        label: '确认类型',
        required: true,
        options: [
          { value: 'LEGAL_SUBJECT', label: '法律主体' },
          { value: 'PAYMENT', label: '支付配置' },
          { value: 'PRICE', label: '商品价格' },
          { value: 'REFUND_RULE', label: '退款规则' },
          { value: 'PUBLIC_CONTACT', label: '公开联系方式' },
          { value: 'PUBLISH_IMPACT', label: '发布影响' },
        ],
      },
      { name: 'candidateIds', label: '候选字段编号（逗号分隔）', type: 'csv', required: true },
      { name: 'confirmedPayload', label: '确认内容（JSON）', type: 'json', required: true },
      {
        name: 'confirmationChannel',
        label: '确认渠道',
        required: true,
        options: [
          { value: 'WEB_CLICK', label: '网页确认' },
          { value: 'MOBILE_CLICK', label: '移动端确认' },
          { value: 'WECOM_SECURE_CARD', label: '企业微信安全卡片' },
        ],
      },
      { name: 'expectedVersion', label: '当前会话版本', type: 'number', required: true },
    ],
    confirm: '确认提交这些字段？服务端会检查候选来源、字段类型、会话版本和 MFA。',
  };
}

function miniProgramPreviewCommand(miniProgramId) {
  return {
    id: 'mini-program-preview-create',
    label: '生成修正版预览',
    path: `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}/releases`,
    body: {},
    inputs: [
      { name: 'templateVersion', label: '模板版本', required: true },
      { name: 'configVersion', label: '配置版本', type: 'number', required: true },
      { name: 'config', label: '已确认配置（JSON）', type: 'json', required: true },
    ],
    confirm: '确认使用这份已核对配置生成正式预览？构建和冒烟测试证据会由服务端保存。',
  };
}

function employeeAgentTaskCommand(conversationId, mode) {
  return {
    id: `employee-agent-task-create-${mode.toLowerCase()}`,
    label: mode === 'NORMAL' ? '发送普通任务' : '创建复杂任务',
    path: '/api/v1/employee-agent/tasks',
    body: { conversationId, mode },
    inputs: [
      { name: 'prompt', label: '任务要求', required: true },
      { name: 'maxSteps', label: '最大步骤', type: 'number', required: true },
      { name: 'maxToolCalls', label: '最大工具次数', type: 'number', required: true },
      { name: 'maxCostMicros', label: '最大费用预算（微单位）', type: 'number', required: true },
      dateTimeInput('deadlineAt', '截止时间'),
    ],
    confirm: '确认按当前租户、门店、步骤、工具、费用和截止时间创建任务？',
  };
}

register(['page-012', 'page-195'], {
  kind: 'identity-context',
  path: () => '/api/v1/context',
});
register(['page-003'], {
  kind: 'employee-agent-conversations',
  path: () => '/api/v1/employee-agent/conversations',
  commands: () => [
    {
      id: 'employee-agent-conversation-create',
      label: '新建 AI 对话',
      path: '/api/v1/employee-agent/conversations',
      body: {},
      inputs: [
        { name: 'title', label: '对话标题', required: true },
        {
          name: 'mode',
          label: '对话模式',
          required: true,
          options: [
            { value: 'NORMAL', label: '普通对话' },
            { value: 'COMPLEX', label: '复杂任务' },
          ],
        },
        uuidInput('storeId', '门店编号（可选）', false),
      ],
      confirm: '确认在当前身份与空间中新建对话？',
    },
  ],
});
register(['page-004'], {
  kind: 'employee-agent-conversation',
  required: ['conversationId'],
  path: ({ conversationId }) =>
    `/api/v1/employee-agent/conversations/${encodeURIComponent(conversationId)}`,
  commands: ({ conversationId }) => [employeeAgentTaskCommand(conversationId, 'NORMAL')],
});
register(['page-005'], {
  kind: 'employee-agent-complex-task',
  required: ['conversationId'],
  path: ({ conversationId }) =>
    `/api/v1/employee-agent/conversations/${encodeURIComponent(conversationId)}`,
  commands: ({ conversationId }) => [employeeAgentTaskCommand(conversationId, 'COMPLEX')],
});
register(['page-006', 'page-007'], {
  kind: 'employee-agent-task-evidence',
  required: ['taskId'],
  path: ({ taskId }) => `/api/v1/employee-agent/tasks/${encodeURIComponent(taskId)}`,
});
register(['page-010', 'page-167'], {
  kind: 'employee-agent-task-queue',
  path: ({ status }) =>
    `/api/v1/employee-agent/tasks${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  commands: ({ taskId }) =>
    taskId
      ? [
          {
            id: 'employee-agent-task-pause',
            label: '暂停任务',
            path: `/api/v1/employee-agent/tasks/${encodeURIComponent(taskId)}/actions/pause`,
            body: {},
            confirm: '确认暂停此任务？已完成步骤和证据会保留。',
          },
          {
            id: 'employee-agent-task-resume',
            label: '恢复任务',
            path: `/api/v1/employee-agent/tasks/${encodeURIComponent(taskId)}/actions/resume`,
            body: {},
            confirm: '确认恢复任务？执行前仍会检查预算与权限。',
          },
          {
            id: 'employee-agent-task-cancel',
            label: '取消任务',
            path: `/api/v1/employee-agent/tasks/${encodeURIComponent(taskId)}/actions/cancel`,
            body: {},
            confirm: '确认取消任务？已发生的外部操作不会被伪装为回滚。',
          },
          {
            id: 'employee-agent-task-retry',
            label: '安全重试',
            path: `/api/v1/employee-agent/tasks/${encodeURIComponent(taskId)}/actions/retry`,
            body: {},
            confirm: '确认安全重试？未知结果、高风险动作和超限失败会被拒绝。',
          },
        ]
      : [],
});
register(['page-011', 'page-015', 'page-081'], {
  kind: 'merchant-intake-materials',
  required: ['sessionId'],
  path: ({ sessionId }) => `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}`,
  commands: ({ sessionId }) => intakeMaterialCommands(sessionId, { message: true, upload: true }),
});
register(['page-016', 'page-019', 'page-020', 'page-082'], {
  kind: 'merchant-intake-evidence',
  required: ['sessionId'],
  path: ({ sessionId }) => `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}`,
});
register(['page-017'], {
  kind: 'merchant-intake-missing-items',
  required: ['sessionId'],
  path: ({ sessionId }) => `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}`,
  commands: ({ sessionId }) => intakeMaterialCommands(sessionId, { message: true }),
});
register(['page-018', 'page-083'], {
  kind: 'merchant-intake-confirmation',
  required: ['sessionId'],
  path: ({ sessionId }) => `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}`,
  commands: ({ sessionId }) => [intakeConfirmationCommand(sessionId)],
});
register(['page-021', 'page-084'], {
  kind: 'merchant-intake-publish-impact',
  required: ['sessionId'],
  path: ({ sessionId }) => `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}`,
  commands: ({ sessionId }) => [
    {
      id: 'merchant-intake-commit',
      label: '提交建档并创建交付',
      path: `/api/v1/merchant-intake/sessions/${encodeURIComponent(sessionId)}/actions/commit`,
      body: {},
      inputs: [{ name: 'expectedVersion', label: '当前会话版本', type: 'number', required: true }],
      confirm: '确认提交已核对的资料？系统会再次检查缺项、冲突和所需确认，并保留审计证据。',
    },
  ],
});
register(['page-072', 'page-140'], {
  kind: 'organization-members',
  path: ({ status, query }) =>
    `/api/v1/organization/members?${new URLSearchParams({
      ...(status ? { status } : {}),
      ...(query ? { query } : {}),
    })}`,
  commands: organizationCommands,
});
register(['page-112', 'page-169'], {
  kind: 'organization-authorization-catalog',
  path: () => '/api/v1/organization/authorization-catalog',
  commands: organizationCommands,
});
register(['page-141', 'page-170'], {
  kind: 'organization-audit',
  path: ({ action, resourceType }) =>
    `/api/v1/organization/audit-logs?${new URLSearchParams({
      ...(action ? { action } : {}),
      ...(resourceType ? { resourceType } : {}),
    })}`,
});
register(['page-143'], {
  kind: 'organization-privacy-requests',
  path: ({ status }) =>
    `/api/v1/organization/privacy-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`,
});
register(['page-193'], {
  kind: 'organization-notifications',
  path: ({ status }) =>
    `/api/v1/organization/notifications${status ? `?status=${encodeURIComponent(status)}` : ''}`,
});
register(['page-024', 'page-037', 'page-183'], {
  kind: 'revenue-summary',
  path: ({ periodStart, periodEnd }) =>
    `/api/v1/revenue-operations/summary?${new URLSearchParams({
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
    })}`,
});
register(['page-159'], {
  kind: 'compute-pack-revenue-summary',
  path: ({ periodStart, periodEnd }) =>
    `/api/v1/revenue-operations/summary?${new URLSearchParams({
      sourceType: 'COMPUTE_PACK',
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
    })}`,
});
register(['page-038', 'page-152', 'page-157', 'page-184'], {
  kind: 'revenue-statements',
  path: ({ statementId, status, periodStart, periodEnd, sourceType }) =>
    statementId
      ? `/api/v1/revenue-operations/statements/${encodeURIComponent(statementId)}`
      : `/api/v1/revenue-operations/statements?${new URLSearchParams({
          ...(status ? { status } : {}),
          ...(periodStart ? { periodStart } : {}),
          ...(periodEnd ? { periodEnd } : {}),
          ...(sourceType ? { sourceType } : {}),
        })}`,
  commands: ({ subscriptionId, periodStart, periodEnd }) =>
    subscriptionId && periodStart && periodEnd
      ? [
          {
            id: 'distribution-statement-lock',
            label: '锁定月结分配单',
            path: `/api/v1/subscriptions/${encodeURIComponent(subscriptionId)}/distribution-statements:lock`,
            body: { periodStart, periodEnd },
            confirm: '确认按实收、退款和实际直接成本锁定本期分配单？锁定需要 MFA。',
          },
        ]
      : [],
});
register(['page-039', 'page-156', 'page-185'], {
  kind: 'revenue-costs',
  path: ({ status, periodStart, periodEnd }) =>
    `/api/v1/revenue-operations/costs?${new URLSearchParams({
      ...(status ? { status } : {}),
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
    })}`,
});
register(['page-040'], {
  kind: 'revenue-cost-evidence',
  required: ['costEntryId'],
  path: ({ costEntryId }) =>
    `/api/v1/revenue-operations/costs/${encodeURIComponent(costEntryId)}/evidence`,
});
register(['page-073'], {
  kind: 'subscription-plans',
  path: () => '/api/v1/revenue-operations/plans',
});
register(['page-137'], {
  kind: 'tenant-subscription',
  path: () => '/api/v1/revenue-operations/subscription',
});
register(['page-138'], {
  kind: 'tenant-usage',
  path: ({ periodStart, periodEnd }) =>
    `/api/v1/revenue-operations/usage?${new URLSearchParams({
      ...(periodStart ? { periodStart } : {}),
      ...(periodEnd ? { periodEnd } : {}),
    })}`,
});
register(['page-154'], {
  kind: 'revenue-rights',
  path: ({ status }) =>
    `/api/v1/revenue-operations/rights${status ? `?status=${encodeURIComponent(status)}` : ''}`,
});
register(['page-033', 'page-034'], {
  kind: 'revenue-rights',
  path: ({ status }) =>
    `/api/v1/revenue-operations/rights${status ? `?status=${encodeURIComponent(status)}` : ''}`,
});
register(['page-035'], {
  kind: 'revenue-right-governance',
  path: ({ status }) =>
    `/api/v1/revenue-operations/transfers${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  commands: ({ rightGroupId, claimantBeneficiaryIds, reasonCode }) => {
    const claimantIds = claimantBeneficiaryIds?.split(',').filter(Boolean) ?? [];
    return rightGroupId && claimantIds.length >= 2 && reasonCode
      ? [
          {
            id: 'revenue-right-dispute-open',
            label: '发起收益权争议',
            path: `/api/v1/revenue-right-groups/${encodeURIComponent(rightGroupId)}/disputes`,
            body: { claimantBeneficiaryIds: claimantIds, reasonCode, evidence: {} },
            confirm: '确认以当前双方和原因发起收益权争议？争议期间相关收益将按服务端规则冻结。',
          },
        ]
      : [];
  },
});
register(['page-043'], {
  kind: 'revenue-disputes',
  path: ({ statementId, status }) =>
    `/api/v1/revenue-operations/disputes?${new URLSearchParams({
      ...(statementId ? { statementId } : {}),
      ...(status ? { status } : {}),
    })}`,
  commands: () => [
    {
      id: 'revenue-dispute-submit',
      label: '提交收益申诉',
      path: '/api/v1/revenue-operations/disputes',
      body: {},
      inputs: [
        uuidInput('statementId', '收益分配单编号'),
        {
          name: 'disputeType',
          label: '申诉类型',
          required: true,
          options: [
            { value: 'REVENUE', label: '收益金额' },
            { value: 'COST', label: '直接成本' },
          ],
        },
        uuidInput('costEntryId', '成本条目编号（成本申诉必填）', false),
        { name: 'reasonCode', label: '原因代码', required: true },
        { name: 'description', label: '事实说明', required: true },
      ],
      confirm: '确认提交申诉？原始请求将不可篡改，商务人员不能直接修改收益或成本事实。',
    },
  ],
});
register(['page-155'], {
  kind: 'revenue-policies',
  path: ({ status }) =>
    `/api/v1/revenue-operations/policies${status ? `?status=${encodeURIComponent(status)}` : ''}`,
});
register(['page-160'], {
  kind: 'revenue-right-transfers',
  path: ({ status }) =>
    `/api/v1/revenue-operations/transfers${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  commands: ({ transferId }) =>
    transferId
      ? [
          {
            id: 'revenue-transfer-approve',
            label: '批准收益权转让',
            path: `/api/v1/revenue-right-transfers/${encodeURIComponent(transferId)}/actions/approve`,
            body: {},
            confirm: '确认批准已完成双方确认的收益权转让？该操作需要 MFA。',
          },
        ]
      : [],
});
register(['page-041'], {
  kind: 'revenue-statements',
  path: ({ status }) =>
    `/api/v1/revenue-operations/statements${status ? `?status=${encodeURIComponent(status)}` : ''}`,
});
register(['page-026'], {
  kind: 'sales-opportunities',
  path: ({ status, query }) =>
    `/api/v1/sales/opportunities?${new URLSearchParams({
      ...(status ? { status } : {}),
      ...(query ? { query } : {}),
    })}`,
});
register(['page-049'], {
  kind: 'sales-opportunities',
  path: ({ status, query }) =>
    `/api/v1/sales/opportunities?${new URLSearchParams({
      ...(status ? { status } : {}),
      ...(query ? { query } : {}),
    })}`,
  commands: () => [opportunityCreateCommand()],
});
register(['page-027'], {
  kind: 'sales-opportunity-detail',
  required: ['opportunityId'],
  path: ({ opportunityId }) => `/api/v1/sales/opportunities/${encodeURIComponent(opportunityId)}`,
});
register(['page-028'], {
  kind: 'sales-opportunity-detail',
  required: ['opportunityId'],
  path: ({ opportunityId }) => `/api/v1/sales/opportunities/${encodeURIComponent(opportunityId)}`,
  commands: ({ opportunityId }) => [
    {
      id: 'sales-duplicate-check',
      label: '执行重复与归属检查',
      path: `/api/v1/sales/opportunities/${encodeURIComponent(opportunityId)}/actions/check-duplicates`,
      body: {},
      inputs: [
        {
          name: 'decision',
          label: '人工决定（可选）',
          options: [
            { value: 'CLEAR', label: '确认非重复' },
            { value: 'CONFIRMED_DUPLICATE', label: '确认重复' },
          ],
        },
        { name: 'decisionReasonCode', label: '覆盖原因代码' },
      ],
      confirm: '确认执行服务端重复检查？人工覆盖自动结果必须提供原因。',
    },
  ],
});
register(['page-030'], {
  kind: 'sales-opportunity-detail',
  required: ['opportunityId'],
  path: ({ opportunityId }) => `/api/v1/sales/opportunities/${encodeURIComponent(opportunityId)}`,
  commands: ({ opportunityId }) => [
    {
      id: 'sales-quote-create',
      label: '签发套餐报价',
      path: `/api/v1/sales/opportunities/${encodeURIComponent(opportunityId)}/quotes`,
      body: {},
      inputs: [
        { name: 'planCode', label: '有效套餐代码', required: true },
        { name: 'quotedPriceCents', label: '报价（分）', type: 'number' },
        { name: 'discountReason', label: '折扣原因' },
        dateTimeInput('validUntil', '报价有效期'),
      ],
      confirm: '确认按服务端套餐目录签发报价？折扣必须保留原因，金额由服务端校验。',
    },
  ],
});
register(['page-031'], {
  kind: 'sales-opportunity-detail',
  required: ['opportunityId'],
  path: ({ opportunityId }) => `/api/v1/sales/opportunities/${encodeURIComponent(opportunityId)}`,
  commands: ({ opportunityId, contractId }) => [
    {
      id: 'sales-contract-create',
      label: '生成待签合同',
      path: `/api/v1/sales/opportunities/${encodeURIComponent(opportunityId)}/contracts`,
      body: {},
      inputs: [
        uuidInput('quoteId', '有效报价编号'),
        { name: 'contractNo', label: '合同编号', required: true },
        uuidInput('contractAssetId', '安全合同文件编号'),
        { name: 'privacyPolicyVersion', label: '隐私政策版本', required: true },
      ],
      confirm: '确认从有效报价和安全合同文件生成待签合同？该操作需要 MFA。',
    },
    ...(contractId
      ? [
          {
            id: 'sales-contract-sign',
            label: '确认合同签署',
            path: `/api/v1/sales/contracts/${encodeURIComponent(contractId)}/actions/sign`,
            body: {},
            inputs: [
              {
                name: 'merchantSignerReference',
                label: '商户签署凭证引用',
                type: 'password',
                required: true,
              },
              dateTimeInput('signedAt', '签署时间'),
            ],
            confirm: '确认合同已由商户真实签署？系统只保存签署凭证的 HMAC。',
          },
          {
            id: 'sales-collection-record',
            label: '财务复核到账',
            path: `/api/v1/sales/contracts/${encodeURIComponent(contractId)}/collections`,
            body: {},
            inputs: [
              { name: 'provider', label: '渠道', required: true },
              { name: 'externalEventId', label: '渠道事件编号', required: true },
              {
                name: 'providerReference',
                label: '到账凭证引用',
                type: 'password',
                required: true,
              },
              { name: 'amountCents', label: '到账金额（分）', type: 'number', required: true },
              { name: 'currency', label: '币种', required: true, placeholder: 'CNY' },
              dateTimeInput('occurredAt', '到账时间'),
            ],
            confirm: '确认财务已核对真实到账证据？记录不可修改，重复渠道事件不会重复入账。',
          },
        ]
      : []),
  ],
});
register(['page-045'], {
  kind: 'renewal-previews',
  path: ({ status }) =>
    `/api/v1/subscription-lifecycle/renewal-previews${status ? `?status=${encodeURIComponent(status)}` : ''}`,
});
register(['page-046'], {
  kind: 'renewal-preview-detail',
  required: ['previewId'],
  path: ({ previewId }) =>
    `/api/v1/subscription-lifecycle/renewal-previews/${encodeURIComponent(previewId)}`,
  commands: ({ previewId }) => [
    {
      id: 'renewal-preview-status',
      label: '记录续费沟通结果',
      path: `/api/v1/subscription-lifecycle/renewal-previews/${encodeURIComponent(previewId)}/actions/change-status`,
      body: {},
      inputs: [
        {
          name: 'status',
          label: '沟通结果',
          required: true,
          options: [
            { value: 'CONTACTED', label: '已联系' },
            { value: 'ACCEPTED', label: '接受建议' },
            { value: 'DECLINED', label: '拒绝建议' },
          ],
        },
      ],
      confirm: '确认记录本次续费沟通结果？接受建议不会绕过合同、到账和审批。',
    },
    {
      id: 'subscription-renew-request',
      label: '申请续费',
      path: '/api/v1/subscription-lifecycle/changes',
      body: { changeType: 'RENEW' },
      inputs: [
        uuidInput('subscriptionId', '订阅编号'),
        uuidInput('contractId', '续费合同编号'),
        dateTimeInput('effectiveAt', '续费生效时间'),
        { name: 'reasonCode', label: '续费原因代码', required: true },
      ],
      confirm: '确认申请续费？系统将校验合同、实际到账并进入不同人员审批。',
    },
  ],
});
register(['page-050'], {
  kind: 'subscription-changes',
  path: ({ status }) =>
    `/api/v1/subscription-lifecycle/changes${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  commands: ({ changeId }) => [
    {
      id: 'subscription-activation-request',
      label: '申请开通订阅',
      path: '/api/v1/subscription-lifecycle/changes',
      body: { changeType: 'ACTIVATE' },
      inputs: [
        uuidInput('contractId', '已收款合同编号'),
        { name: 'requestedPlanCode', label: '套餐代码', required: true },
        dateTimeInput('effectiveAt', '生效时间'),
        { name: 'reasonCode', label: '开通原因代码', required: true },
      ],
      confirm: '确认申请开通订阅？系统将校验签署合同和净到账，再等待另一人确认。',
    },
    ...(changeId ? [subscriptionDecisionCommand(changeId)] : []),
  ],
});
register(['page-145'], {
  kind: 'subscription-changes',
  path: ({ status }) =>
    `/api/v1/subscription-lifecycle/changes${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  commands: ({ changeId }) => [
    {
      id: 'subscription-cancel-request',
      label: '申请退订',
      path: '/api/v1/subscription-lifecycle/changes',
      body: { changeType: 'CANCEL' },
      inputs: [
        uuidInput('subscriptionId', '订阅编号'),
        dateTimeInput('effectiveAt', '退订生效时间'),
        { name: 'reasonCode', label: '退订原因代码', required: true },
      ],
      confirm: '确认申请退订？历史订单、售后、导出期和法定留存不会被删除。',
    },
    ...(changeId ? [subscriptionDecisionCommand(changeId)] : []),
  ],
});
register(['page-052'], {
  kind: 'delivery-projects',
  path: ({ status }) =>
    `/api/v1/delivery-projects?${new URLSearchParams({
      ...(status ? { status } : {}),
    })}`,
});
register(['page-053', 'page-055', 'page-076', 'page-180', 'page-181'], {
  kind: 'delivery-project',
  required: ['projectId'],
  path: ({ projectId }) => `/api/v1/delivery-projects/${encodeURIComponent(projectId)}`,
  commands: ({ projectId, stepCode }) => [
    {
      id: 'delivery-start',
      label: '开始交付',
      path: `/api/v1/delivery-projects/${encodeURIComponent(projectId)}/actions/start`,
      body: {},
      confirm: '确认开始此交付项目？',
    },
    {
      id: 'delivery-resume',
      label: '继续交付',
      path: `/api/v1/delivery-projects/${encodeURIComponent(projectId)}/actions/resume`,
      body: {},
      confirm: '确认从安全断点继续交付？',
    },
    {
      id: 'delivery-suspend',
      label: '暂停交付',
      path: `/api/v1/delivery-projects/${encodeURIComponent(projectId)}/actions/suspend`,
      body: {},
      confirm: '确认暂停此交付项目？已完成证据不会丢失。',
    },
    ...(stepCode
      ? [
          {
            id: 'delivery-step-execute',
            label: '执行当前步骤',
            path: `/api/v1/delivery-projects/${encodeURIComponent(projectId)}/steps/${encodeURIComponent(stepCode)}/actions/execute`,
            body: {},
            confirm: `确认执行步骤 ${stepCode}？`,
          },
          {
            id: 'delivery-step-retry',
            label: '重试当前步骤',
            path: `/api/v1/delivery-projects/${encodeURIComponent(projectId)}/steps/${encodeURIComponent(stepCode)}/actions/retry`,
            body: {},
            confirm: `确认从服务端断点重试步骤 ${stepCode}？`,
          },
        ]
      : []),
  ],
});
register(['page-054'], {
  kind: 'delivery-project',
  required: ['projectId'],
  path: ({ projectId }) => `/api/v1/delivery-projects/${encodeURIComponent(projectId)}`,
});
register(['page-149'], {
  kind: 'delivery-exceptions',
  path: ({ status = 'OPEN' }) => `/api/v1/delivery-exceptions?status=${encodeURIComponent(status)}`,
});
register(['page-058'], {
  kind: 'mini-program-authorization',
  path: () => '/api/v1/context',
  commands: () => [
    {
      id: 'mini-program-authorization-activate',
      label: '完成微信官方授权',
      path: '/api/v1/mini-program-authorizations/actions/activate',
      body: {},
      inputs: [
        uuidInput('merchantProfileId', '商户档案编号'),
        uuidInput('deliveryProjectId', '交付项目编号'),
        { name: 'merchantChosenName', label: '商户确认的小程序名称', required: true },
        { name: 'templateCode', label: '官方模板代码', required: true },
        { name: 'authorizationCode', label: '微信一次性授权码', type: 'password', required: true },
      ],
      confirm: '确认交换微信一次性授权码？授权码不会持久化，服务端只保存密钥系统引用。',
    },
  ],
});
register(['page-059', 'page-060', 'page-062', 'page-065'], {
  kind: 'mini-program-configuration-correction',
  required: ['miniProgramId'],
  path: ({ miniProgramId }) => `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}`,
  commands: ({ miniProgramId }) => [miniProgramPreviewCommand(miniProgramId)],
});
register(['page-057', 'page-061', 'page-063', 'page-064', 'page-066'], {
  kind: 'mini-program',
  required: ['miniProgramId'],
  path: ({ miniProgramId }) => `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}`,
  commands: ({ miniProgramId, releaseId }) => [
    ...(releaseId
      ? [
          {
            id: 'mini-program-submit-review',
            label: '提交微信审核',
            path: `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}/releases/${encodeURIComponent(releaseId)}/actions/submit-review`,
            body: {},
            confirm: '确认提交已完成正式预览确认的版本审核？',
          },
          {
            id: 'mini-program-publish',
            label: '发布已审核版本',
            path: `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}/releases/${encodeURIComponent(releaseId)}/actions/publish`,
            body: {},
            confirm: '确认发布此已审核版本？服务端仍会检查发布前置条件。',
          },
        ]
      : []),
    {
      id: 'mini-program-rollback',
      label: '回滚到稳定版',
      path: `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}/actions/rollback`,
      body: { reason: 'WORKBENCH_OPERATOR_REQUEST' },
      confirm: '确认发起回滚？系统会创建新发布记录并保留原版本证据。',
    },
  ],
});
register(['page-164'], {
  kind: 'mini-program-release-governance',
  required: ['miniProgramId'],
  path: ({ miniProgramId }) => `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}`,
  commands: ({ miniProgramId, releaseId }) => [
    ...(releaseId
      ? [
          {
            id: 'mini-program-submit-review',
            label: '提交微信审核',
            path: `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}/releases/${encodeURIComponent(releaseId)}/actions/submit-review`,
            body: {},
            confirm: '确认提交当前已核对预览到微信审核？',
          },
        ]
      : []),
    {
      id: 'mini-program-circuit-rollback',
      label: '熔断并回滚稳定版',
      path: `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}/actions/rollback`,
      body: { reason: 'WORKBENCH_RELEASE_GOVERNANCE' },
      confirm: '确认熔断当前发布并回滚到稳定版？服务端会创建新发布记录并保留全部证据。',
    },
  ],
});
register(['page-134'], {
  kind: 'mini-program-review',
  required: ['miniProgramId', 'releaseId'],
  path: ({ miniProgramId }) => `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}`,
  commands: ({ miniProgramId, releaseId }) => [
    {
      id: 'mini-program-submit-review',
      label: '提交微信审核',
      path: `/api/v1/mini-programs/${encodeURIComponent(miniProgramId)}/releases/${encodeURIComponent(releaseId)}/actions/submit-review`,
      body: {},
      confirm: '确认提交已完成正式预览确认的版本审核？',
    },
  ],
});
register(['page-009'], {
  kind: 'customer-service-queue',
  path: ({ status }) =>
    `/api/v1/customer-service/conversations${status ? `?status=${encodeURIComponent(status)}` : ''}`,
});
register(['page-099', 'page-187'], {
  kind: 'customer-service-queue',
  path: ({ status = 'HUMAN_QUEUED' }) =>
    `/api/v1/customer-service/conversations?status=${encodeURIComponent(status)}`,
});
register(['page-100', 'page-188'], {
  kind: 'customer-service-conversation',
  required: ['conversationId'],
  path: ({ conversationId }) =>
    `/api/v1/customer-service/conversations/${encodeURIComponent(conversationId)}`,
  commands: ({ conversationId }) => [
    {
      id: 'customer-service-accept',
      label: '认领会话',
      path: `/api/v1/customer-service/conversations/${encodeURIComponent(conversationId)}/actions/accept`,
      body: {},
      confirm: '确认认领此会话？同一会话只能由一名员工持有。',
    },
    {
      id: 'customer-service-return-ai',
      label: '交还 AI',
      path: `/api/v1/customer-service/conversations/${encodeURIComponent(conversationId)}/actions/return-to-ai`,
      body: {},
      confirm: '确认将会话交还 AI？服务端会检查当前归属和风险状态。',
    },
    {
      id: 'customer-service-close',
      label: '关闭会话',
      path: `/api/v1/customer-service/conversations/${encodeURIComponent(conversationId)}/actions/close`,
      body: { resolutionCode: 'RESOLVED_BY_AGENT' },
      confirm: '确认以人工已解决关闭会话？',
    },
  ],
});
register(['page-109'], {
  kind: 'knowledge-publications',
  path: ({ storeId }) =>
    `/api/v1/customer-service/knowledge-publications${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`,
});
register(['page-075'], {
  kind: 'knowledge-initialization',
  path: ({ storeId }) =>
    `/api/v1/customer-service/knowledge-publications${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`,
  commands: () => [
    {
      id: 'knowledge-publication-create',
      label: '发布已核验知识',
      path: '/api/v1/customer-service/knowledge-publications',
      body: {},
      inputs: [
        uuidInput('documentId', '知识文档编号'),
        uuidInput('storeId', '适用门店编号'),
        {
          name: 'sourceType',
          label: '来源类型',
          required: true,
          options: [
            { value: 'MERCHANT_RULE', label: '商户规则' },
            { value: 'MERCHANT_FILE', label: '商户文件' },
            { value: 'EMPLOYEE_CONFIRMED_QA', label: '员工确认问答' },
            { value: 'PUBLIC_REFERENCE', label: '公开参考' },
          ],
        },
        {
          name: 'trustLevel',
          label: '可信等级',
          required: true,
          options: [
            { value: 'AUTHORITATIVE', label: '权威' },
            { value: 'VERIFIED', label: '已核验' },
            { value: 'REFERENCE', label: '仅参考' },
          ],
        },
        dateTimeInput('validFrom', '生效时间'),
        { ...dateTimeInput('expiresAt', '失效时间'), required: false },
      ],
      confirm: '确认发布这份已核验知识？仅当前版本、门店范围和有效期内的内容可用于 AI 回答。',
    },
  ],
});
register(['page-105', 'page-116'], {
  kind: 'merchant-customers',
  path: ({ storeId, status, query }) =>
    `/api/v1/merchant-operations/customers?${new URLSearchParams({
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
      ...(query ? { query } : {}),
    })}`,
});
register(['page-106', 'page-189'], {
  kind: 'merchant-customer-detail',
  required: ['customerId'],
  path: ({ customerId }) =>
    `/api/v1/merchant-operations/customers/${encodeURIComponent(customerId)}`,
});
register(['page-119'], {
  kind: 'merchant-customer-rewards',
  required: ['customerId'],
  path: ({ customerId }) =>
    `/api/v1/merchant-operations/customers/${encodeURIComponent(customerId)}/rewards`,
});
register(['page-122', 'page-125'], {
  kind: 'monthly-value-report',
  required: ['month'],
  path: ({ month, storeId }) =>
    `/api/v1/reports/monthly-value?month=${encodeURIComponent(month)}${storeId ? `&storeId=${encodeURIComponent(storeId)}` : ''}`,
});
register(['page-129'], {
  kind: 'official-plugin-catalog',
  path: () => '/api/v1/plugins/catalog',
});
register(['page-068'], {
  kind: 'merchant-profile',
  path: () => '/api/v1/merchant-operations/profile',
});
register(['page-079', 'page-173'], {
  kind: 'operational-home-today',
  path: () => '/api/v1/operational-home/today',
});
register(['page-126'], {
  kind: 'geo-health-overview',
  path: ({ storeId }) =>
    `/api/v1/geo-operations/overview${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`,
});
register(['page-069'], {
  kind: 'geo-channel-publication',
  path: ({ storeId }) =>
    `/api/v1/geo-operations/overview${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`,
  commands: ({ profileId }) =>
    profileId
      ? [
          {
            id: 'geo-profile-publish',
            label: '授权并发布渠道',
            path: `/api/v1/geo/profiles/${encodeURIComponent(profileId)}/actions/publish`,
            body: { authorizationConfirmed: true, profile: {} },
            inputs: [
              { name: 'targetCode', label: '已启用目标代码', required: true },
              { name: 'channelAccount', label: '渠道账号', required: true },
              { name: 'profile', label: '商户确认的标准资料', type: 'json', required: true },
            ],
            confirm:
              '确认授权并提交此目标？仅承诺资料校验、提交和可访问性证据，不承诺外部收录、排名、流量或成交。',
          },
        ]
      : [],
});
register(['page-070'], {
  kind: 'geo-differences',
  path: ({ storeId, status = 'OPEN' }) =>
    `/api/v1/geo-operations/differences?${new URLSearchParams({
      status,
      ...(storeId ? { storeId } : {}),
    })}`,
  commands: ({ differenceId }) =>
    differenceId
      ? [
          {
            id: 'geo-difference-decide',
            label: '处理差异',
            path: `/api/v1/geo-operations/differences/${encodeURIComponent(differenceId)}/actions/decide`,
            body: {},
            inputs: [
              {
                name: 'decision',
                label: '处理结果',
                required: true,
                options: [
                  { value: 'RESOLVE', label: '确认已修正' },
                  { value: 'IGNORE', label: '确认忽略' },
                ],
              },
              { name: 'reasonCode', label: '原因代码', required: true },
            ],
            confirm: '确认处理此渠道差异？操作需要 MFA，并会记录真实操作者和原因。',
          },
        ]
      : [],
});
register(['page-103'], {
  kind: 'customer-service-shifts',
  path: ({ storeId, status }) =>
    `/api/v1/customer-service-operations/shifts?${new URLSearchParams({
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
    })}`,
  commands: () => [
    {
      id: 'customer-service-shift-create',
      label: '安排客服值班',
      path: '/api/v1/customer-service-operations/shifts',
      body: {},
      inputs: [
        { name: 'storeId', label: '门店 ID', required: true },
        { name: 'assigneeUserId', label: '值班员工 ID', required: true },
        { name: 'startsAt', label: '开始时间', required: true },
        { name: 'endsAt', label: '结束时间', required: true },
      ],
      confirm: '确认安排此值班？服务端会校验员工权限、值班时长和时间冲突，并记录审计。',
    },
  ],
});
register(['page-107'], {
  kind: 'customer-service-tasks',
  path: ({ storeId, status }) =>
    `/api/v1/customer-service-operations/tasks?${new URLSearchParams({
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
    })}`,
  commands: ({ taskId }) => [
    {
      id: 'customer-service-task-create',
      label: '创建客户任务',
      path: '/api/v1/customer-service-operations/tasks',
      body: { summaryRedacted: {} },
      inputs: [
        { name: 'storeId', label: '门店 ID', required: true },
        { name: 'customerId', label: '客户 ID' },
        { name: 'conversationId', label: '会话 ID' },
        {
          name: 'taskType',
          label: '任务类型',
          required: true,
          options: [
            { value: 'FOLLOW_UP', label: '客户回访' },
            { value: 'RETENTION', label: '客户挽留' },
            { value: 'COMPLAINT', label: '投诉处理' },
            { value: 'KNOWLEDGE_GAP', label: '知识补齐' },
            { value: 'SERVICE_RECOVERY', label: '服务补救' },
          ],
        },
        {
          name: 'priority',
          label: '优先级',
          required: true,
          options: [
            { value: 'NORMAL', label: '普通' },
            { value: 'HIGH', label: '高' },
            { value: 'URGENT', label: '紧急' },
          ],
        },
        { name: 'assignedUserId', label: '负责人 ID' },
        { name: 'dueAt', label: '截止时间', required: true },
        { name: 'summaryRedacted', label: '脱敏任务摘要', type: 'json', required: true },
      ],
      confirm: '确认创建此客户任务？客户或会话必须属于所选门店，摘要不得填写明文隐私。',
    },
    ...(taskId
      ? [
          {
            id: 'customer-service-task-complete',
            label: '完成客户任务',
            path: `/api/v1/customer-service-operations/tasks/${encodeURIComponent(taskId)}/actions/complete`,
            body: {},
            inputs: [
              { name: 'expectedVersion', label: '当前任务版本', type: 'number', required: true },
              { name: 'resolutionCode', label: '完成结果代码', required: true },
            ],
            confirm: '确认完成此任务？服务端会校验当前版本并保留完整审计。',
          },
        ]
      : []),
  ],
});
register(['page-110'], {
  kind: 'customer-service-quality-reviews',
  path: ({ storeId, status }) =>
    `/api/v1/customer-service-operations/quality-reviews?${new URLSearchParams({
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
    })}`,
  commands: ({ reviewId }) =>
    reviewId
      ? [
          {
            id: 'customer-service-quality-decide',
            label: '提交质检结论',
            path: `/api/v1/customer-service-operations/quality-reviews/${encodeURIComponent(reviewId)}/actions/decide`,
            body: { findingsRedacted: {} },
            inputs: [
              { name: 'expectedVersion', label: '当前质检版本', type: 'number', required: true },
              {
                name: 'decision',
                label: '质检结论',
                required: true,
                options: [
                  { value: 'REVIEWED', label: '通过复核' },
                  { value: 'REMEDIATION_REQUIRED', label: '要求整改' },
                ],
              },
              { name: 'accuracyScore', label: '准确性评分', type: 'number', required: true },
              { name: 'safetyScore', label: '安全评分', type: 'number', required: true },
              { name: 'policyScore', label: '规范评分', type: 'number', required: true },
              { name: 'findingsRedacted', label: '脱敏质检发现', type: 'json', required: true },
              { name: 'remediationDueAt', label: '整改截止时间' },
            ],
            confirm: '确认提交质检结论？要求整改时会自动生成可追踪的知识补齐任务。',
          },
        ]
      : [],
});
register(['page-113'], {
  kind: 'wecom-connection-health',
  path: () => '/api/v1/integrations/wecom/connection-health',
  commands: ({ connectorCode }) =>
    connectorCode
      ? [
          {
            id: 'wecom-connection-retry',
            label: '重新检查连接',
            path: '/api/v1/integrations/wecom/connection-health/actions/retry',
            body: { connectorCode },
            inputs: [
              { name: 'expectedVersion', label: '当前连接版本', type: 'number', required: true },
            ],
            confirm:
              '确认重新检查此企业微信连接？将创建一次可追踪任务，不会在页面中读取或显示密钥。',
          },
        ]
      : [],
});
register(['page-118'], {
  kind: 'reward-rules',
  path: () => '/api/v1/reward-rules',
  commands: () => [
    {
      id: 'reward-rule-publish',
      label: '发布奖励规则版本',
      path: '/api/v1/reward-rules/actions/publish',
      body: {},
      inputs: [
        { name: 'ruleCode', label: '规则代码', required: true },
        {
          name: 'expectedCurrentVersion',
          label: '当前版本（首次为 0）',
          type: 'number',
          required: true,
        },
        {
          name: 'fundingSource',
          label: '出资方',
          required: true,
          options: [
            { value: 'MERCHANT', label: '商户' },
            { value: 'PLATFORM_CAMPAIGN', label: '平台活动' },
            { value: 'PARTNER_CAMPAIGN', label: '伙伴活动' },
          ],
        },
        { name: 'triggerCode', label: '触发事件代码', required: true },
        { name: 'grantConfig', label: '发放配置', type: 'json', required: true },
        { name: 'reversalPolicy', label: '退款冲正规则', type: 'json', required: true },
      ],
      confirm: '确认发布新奖励规则？必须明确出资方、可用期、有效期以及全额和部分退款冲正规则。',
    },
  ],
});
register(['page-130'], {
  kind: 'official-plugin-detail',
  required: ['pluginCode'],
  path: ({ pluginCode }) => `/api/v1/plugins/catalog/${encodeURIComponent(pluginCode)}`,
  commands: ({ pluginVersionId }) =>
    pluginVersionId
      ? [
          {
            id: 'official-plugin-install',
            label: '确认安装插件',
            path: '/api/v1/plugins/installations',
            body: { pluginVersionId, responsibleOwnerConfirmed: true, resourceScope: {} },
            inputs: [
              {
                name: 'acceptedPermissions',
                label: '逐项接受的权限',
                type: 'json',
                required: true,
              },
              { name: 'resourceScope', label: '授权资源范围', type: 'json', required: true },
            ],
            confirm: '确认安装？请先核对权限、数据范围、外部域名、费用、限额和卸载影响。',
          },
        ]
      : [],
});
register(['page-132'], {
  kind: 'official-skill-catalog',
  path: ({ query }) =>
    `/api/v1/skills/catalog?${new URLSearchParams({ ...(query ? { query } : {}) })}`,
});
register(['page-148'], {
  kind: 'platform-merchants',
  path: ({ query, status }) =>
    `/api/v1/platform/merchants?${new URLSearchParams({
      ...(query ? { query } : {}),
      ...(status ? { status } : {}),
    })}`,
});
register(['page-151'], {
  kind: 'platform-plan-entitlements',
  path: () => '/api/v1/platform/plans',
  commands: ({ planCode }) =>
    planCode
      ? [
          {
            id: 'platform-plan-entitlements-update',
            label: '更新套餐权益',
            path: `/api/v1/platform/plans/${encodeURIComponent(planCode)}/actions/update-entitlements`,
            body: {},
            inputs: [
              { name: 'expectedVersion', label: '当前套餐版本', type: 'number', required: true },
              { name: 'entitlements', label: '公开权益配置', type: 'json', required: true },
            ],
            confirm:
              '确认更新套餐权益？新订阅使用新版本，已有订阅继续保留其版本快照。配置不得包含密钥。',
          },
        ]
      : [],
});
register(['page-158'], {
  kind: 'reconciliation-discrepancies',
  path: ({ status = 'OPEN' }) =>
    `/api/v1/finance/reconciliation-discrepancies?${new URLSearchParams({ status })}`,
  commands: ({ discrepancyId }) =>
    discrepancyId
      ? [
          {
            id: 'reconciliation-discrepancy-resolve',
            label: '提交差异结论',
            path: `/api/v1/finance/reconciliation-discrepancies/${encodeURIComponent(discrepancyId)}/actions/resolve`,
            body: {},
            inputs: [
              { name: 'expectedVersion', label: '当前差异版本', type: 'number', required: true },
              {
                name: 'decision',
                label: '处理结论',
                required: true,
                options: [
                  { value: 'RESOLVED', label: '已核实解决' },
                  { value: 'ACCEPTED_KNOWN', label: '已确认已知差异' },
                ],
              },
              { name: 'resolutionCode', label: '处理原因代码', required: true },
            ],
            confirm:
              '确认结束此差异单？操作只更新处理证据，不会改写支付、退款、订单或奖励账本事实。',
          },
        ]
      : [],
});
register(['page-162'], {
  kind: 'platform-channel-partners',
  path: ({ query, status }) =>
    `/api/v1/platform/channel-partners?${new URLSearchParams({
      ...(query ? { query } : {}),
      ...(status ? { status } : {}),
    })}`,
  commands: () => [
    {
      id: 'platform-channel-partner-save',
      label: '保存伙伴与区域',
      path: '/api/v1/platform/channel-partners/actions/save',
      body: {},
      inputs: [
        { name: 'partnerId', label: '伙伴 ID（新建留空）' },
        { name: 'expectedVersion', label: '当前版本（新建留空）', type: 'number' },
        { name: 'partnerCode', label: '伙伴代码', required: true },
        { name: 'partnerName', label: '伙伴名称', required: true },
        {
          name: 'partnerType',
          label: '伙伴类型',
          required: true,
          options: [
            { value: 'CHANNEL_PARTNER', label: '区县合作伙伴' },
            { value: 'INVESTMENT_OPERATOR', label: '招商公司运营' },
            { value: 'REGIONAL_PROVIDER', label: '区县服务商' },
          ],
        },
        { name: 'ownerUserId', label: '负责人用户 ID', required: true },
        {
          name: 'status',
          label: '伙伴状态',
          required: true,
          options: [
            { value: 'ACTIVE', label: '有效' },
            { value: 'SUSPENDED', label: '暂停' },
          ],
        },
        { name: 'region', label: '省市区授权范围', type: 'json', required: true },
      ],
      confirm: '确认保存伙伴及区域？负责人必须具有有效渠道角色，区域授权会被版本化和审计。',
    },
  ],
});
register(['page-166'], {
  kind: 'platform-model-route-budgets',
  path: ({ query, status }) =>
    `/api/v1/platform/model-route-budgets?${new URLSearchParams({
      ...(query ? { query } : {}),
      ...(status ? { status } : {}),
    })}`,
  commands: () => [
    {
      id: 'platform-model-route-budget-save',
      label: '保存模型路由预算',
      path: '/api/v1/platform/model-route-budgets/actions/save',
      body: {},
      inputs: [
        { name: 'routeCode', label: '路由代码', required: true },
        { name: 'expectedVersion', label: '当前版本（首次为 0）', type: 'number', required: true },
        { name: 'purpose', label: '用途', required: true },
        { name: 'modelKey', label: '模型标识（非密钥）', required: true },
        { name: 'perTaskBudgetCents', label: '单任务预算（分）', type: 'number', required: true },
        { name: 'monthlyBudgetCents', label: '月度预算（分）', type: 'number', required: true },
        { name: 'maxSteps', label: '最大步骤（不超过 12）', type: 'number', required: true },
        {
          name: 'maxToolCalls',
          label: '最大工具调用（不超过 20）',
          type: 'number',
          required: true,
        },
        {
          name: 'status',
          label: '路由状态',
          required: true,
          options: [
            { value: 'ACTIVE', label: '启用' },
            { value: 'SUSPENDED', label: '暂停' },
          ],
        },
      ],
      confirm: '确认保存模型路由与预算？只保存模型标识，不保存提供方密钥，并强制任务执行上限。',
    },
  ],
});
register(['page-086'], {
  kind: 'merchant-products',
  path: ({ storeId, status }) =>
    `/api/v1/merchant-operations/products?${new URLSearchParams({
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
    })}`,
});
register(['page-087'], {
  kind: 'merchant-group-buys',
  path: ({ storeId, status }) =>
    `/api/v1/merchant-operations/products?${new URLSearchParams({
      productType: 'GROUP_BUY',
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
    })}`,
});
register(['page-088'], {
  kind: 'merchant-group-buy-publication',
  path: ({ storeId }) =>
    `/api/v1/merchant-operations/products?${new URLSearchParams({
      productType: 'GROUP_BUY',
      ...(storeId ? { storeId } : {}),
    })}`,
  commands: ({ productId }) =>
    productId
      ? [
          {
            id: 'merchant-group-buy-publish',
            label: '确认发布活动',
            path: `/api/v1/merchant-operations/products/${encodeURIComponent(productId)}/actions/publish`,
            body: { confirmed: true },
            inputs: [
              {
                name: 'expectedVersion',
                label: '当前活动版本',
                type: 'number',
                required: true,
              },
            ],
            confirm: '确认发布此团购？服务端会重新检查门店、版本、价格、有效规格和可售库存。',
          },
        ]
      : [],
});
register(['page-090', 'page-124'], {
  kind: 'merchant-orders',
  path: ({ storeId, status }) =>
    `/api/v1/merchant-operations/orders?${new URLSearchParams({
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
    })}`,
});
register(['page-101'], {
  kind: 'merchant-order-detail',
  required: ['orderId'],
  path: ({ orderId }) => `/api/v1/merchant-operations/orders/${encodeURIComponent(orderId)}`,
});
register(['page-091'], {
  kind: 'merchant-order-detail',
  required: ['orderId'],
  path: ({ orderId }) => `/api/v1/merchant-operations/orders/${encodeURIComponent(orderId)}`,
});
register(['page-092', 'page-093', 'page-095', 'page-102'], {
  kind: 'merchant-refunds',
  path: ({ storeId, status }) =>
    `/api/v1/merchant-operations/refunds?${new URLSearchParams({
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
    })}`,
});
register(['page-042'], {
  kind: 'merchant-refunds',
  path: ({ storeId, status }) =>
    `/api/v1/merchant-operations/refunds?${new URLSearchParams({
      ...(storeId ? { storeId } : {}),
      ...(status ? { status } : {}),
    })}`,
});
register(['page-094', 'page-191'], {
  kind: 'merchant-verification-uses',
  path: ({ storeId }) =>
    `/api/v1/merchant-operations/verification-uses?${new URLSearchParams({
      ...(storeId ? { storeId } : {}),
    })}`,
});
register(['page-096'], {
  kind: 'merchant-reconciliations',
  path: ({ status }) =>
    `/api/v1/merchant-operations/reconciliations?${new URLSearchParams({
      ...(status ? { status } : {}),
    })}`,
});

export const livePageIds = new Set(definitions.keys());

export function resolveLivePageRequest(page, searchParams) {
  const definition = definitions.get(page);
  if (!definition) return { status: 'unsupported' };
  const values = Object.fromEntries(searchParams.entries());
  const missing = (definition.required ?? []).filter((name) => !values[name]);
  if (missing.length) return { status: 'missing-parameters', missing, kind: definition.kind };
  return {
    status: 'ready',
    kind: definition.kind,
    path: definition.path(values),
    commands: definition.commands?.(values) ?? [],
  };
}
