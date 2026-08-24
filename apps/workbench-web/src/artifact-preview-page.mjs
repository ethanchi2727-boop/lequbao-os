const read = (record, snake, camel = snake) => record?.[snake] ?? record?.[camel];
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value, fallback = '暂无') => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    const preferred = value.summary ?? value.headline ?? value.title ?? value.message;
    if (preferred) return String(preferred);
    return Object.values(value)
      .filter((item) => typeof item === 'string' || typeof item === 'number')
      .slice(0, 4)
      .join(' · ');
  }
  return fallback;
};
const dateText = (value) =>
  value
    ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : '尚未生成';

export function renderConversationTopbar({ view, shell, escapeHtml, icon }) {
  return `<header class="topbar artifact-topbar"><div class="mobile-title"><button data-action="back" aria-label="返回">${icon('back')}</button><strong>${escapeHtml(view.title)}</strong><small>${escapeHtml(shell.status)}</small></div><div class="crumb">乐趣宝 <b>›</b> AI 工作台 <b>›</b> <strong>${escapeHtml(view.title)}</strong></div><div class="top-actions"><span>${escapeHtml(shell.status)}</span><button data-route="page-003">${icon('plus')} 新任务</button><button data-route="page-010">${icon('clock')} 后台任务</button></div></header>`;
}

export function renderConversationThread({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (view.page === 'page-009')
    return renderSessionInbox({ contract, demoMode, livePageState, view, escapeHtml });
  if (view.page === 'page-007')
    return renderProvenance({ contract, demoMode, livePageState, view, escapeHtml });
  if (!demoMode && !livePageState.data) return renderUnavailable(contract, view, escapeHtml);
  const task = demoMode
    ? {
        id: 'demo-task',
        conversation_id: 'demo-conversation',
        status: 'SUCCEEDED',
        plan_version: 3,
        completed_at: '2026-08-24T12:18:00.000Z',
        result_summary_redacted:
          '本周营收环比增长 12.4%，到店转化提升；晚间履约时长和两项异常退款需要管理层关注。',
        artifacts: [
          {
            name: '本周经营复盘_v3.pptx',
            content_type:
              'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            size_bytes: 1468000,
            status: 'READY',
            sha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef',
          },
          {
            name: '经营数据核验表.xlsx',
            content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size_bytes: 286720,
            status: 'READY',
            sha256: 'b2c3d4e5f60718293a4b5c6d7e8f901234567890abcdef1234567890abcdef1',
          },
        ],
        evidence: [
          {
            evidence_type: 'BUSINESS_RECORD',
            label: '门店经营日报',
            summary_redacted: '覆盖 7 天订单、核销与退款事实',
            reference_hash: 'ev-41f8a731',
          },
          {
            evidence_type: 'HUMAN_CONFIRMATION',
            label: '财务口径确认',
            summary_redacted: '收入与退款按锁定口径复核',
            reference_hash: 'ev-9cc2d018',
          },
          {
            evidence_type: 'TOOL_RESULT',
            label: '周环比计算',
            summary_redacted: '输入范围与计算版本已记录',
            reference_hash: 'ev-d7125a44',
          },
        ],
        steps: [
          { status: 'SUCCEEDED' },
          { status: 'SUCCEEDED' },
          { status: 'SUCCEEDED' },
          { status: 'SUCCEEDED' },
        ],
      }
    : livePageState.data;
  const artifacts = list(task.artifacts);
  const evidence = list(task.evidence);
  const steps = list(task.steps);
  const readyArtifacts = artifacts.filter((item) => item.status === 'READY').length;
  const succeededSteps = steps.filter((item) => item.status === 'SUCCEEDED').length;
  const taskId = read(task, 'id') ?? 'task';
  const conversationId = read(task, 'conversation_id', 'conversationId');
  const taskHref = conversationId
    ? `/bao/page-005?${demoMode ? 'demo=1&' : ''}conversationId=${encodeURIComponent(conversationId)}`
    : `/bao/page-010${demoMode ? '?demo=1' : ''}`;
  const status = read(task, 'status') ?? 'UNKNOWN';
  const summary = text(
    read(task, 'result_summary_redacted', 'resultSummaryRedacted'),
    '任务尚未生成可预览的脱敏摘要。',
  );
  const completedAt = read(task, 'completed_at', 'completedAt');
  const planVersion = read(task, 'plan_version', 'planVersion') ?? 1;
  return `<section class="artifact-page" data-page-id="${contract.id}" data-experience="artifact-preview">
    <header class="artifact-heading"><div><small>${demoMode ? '演示成果 · 非真实业务数据' : '权威任务成果'}</small><h1>本周经营复盘</h1><p>先核对版本、摘要、来源和交付边界，再进入任何发布动作。</p></div><div class="artifact-heading-actions"><span class="artifact-status">${escapeHtml(status)}</span><a href="${taskHref}">返回任务</a></div></header>
    <div class="artifact-layout">
      <main class="artifact-canvas">
        <div class="artifact-toolbar"><div><b>成果预览</b><span>版本 ${escapeHtml(planVersion)} · ${escapeHtml(dateText(completedAt))}</span></div><span>${readyArtifacts}/${artifacts.length} 个成果就绪</span></div>
        <article class="report-paper" aria-label="成果脱敏摘要预览">
          <header><small>WEEKLY OPERATIONS REVIEW</small><h2>本周经营复盘</h2><p>${escapeHtml(summary)}</p></header>
          <div class="report-kpis"><span><small>执行步骤</small><b>${succeededSteps}/${steps.length}</b><em>以任务记录为准</em></span><span><small>来源证据</small><b>${evidence.length}</b><em>可追溯记录</em></span><span><small>成果文件</small><b>${artifacts.length}</b><em>${readyArtifacts} 个可用</em></span></div>
          <section><h3>管理层摘要</h3><p>${escapeHtml(summary)}</p></section>
          <section class="report-focus"><div><h3>本版核验重点</h3><p>版本差异、数据口径、敏感信息和目标渠道必须在交付前逐项确认。</p></div><span>人工确认后再发布</span></section>
        </article>
        <p class="artifact-disclaimer">当前页面只预览服务端脱敏摘要和成果元数据，不会把未授权文件正文或演示内容冒充生产成果。</p>
      </main>
      <aside class="artifact-inspector">
        <section><header><div><small>版本摘要</small><strong>计划版本 ${escapeHtml(planVersion)}</strong></div><span>${escapeHtml(status)}</span></header><dl><div><dt>任务编号</dt><dd>${escapeHtml(taskId)}</dd></div><div><dt>完成时间</dt><dd>${escapeHtml(dateText(completedAt))}</dd></div><div><dt>执行结果</dt><dd>${succeededSteps}/${steps.length} 步成功</dd></div></dl></section>
        <section><header><div><small>成果文件</small><strong>${artifacts.length || '暂无'} 项</strong></div></header><div class="artifact-files">${artifacts.length ? artifacts.map((item) => renderArtifact(item, escapeHtml)).join('') : '<p>服务端尚未返回成果元数据。</p>'}</div></section>
        <section><header><div><small>来源覆盖</small><strong>${evidence.length || '暂无'} 条证据</strong></div><a href="/bao/page-007?taskId=${encodeURIComponent(taskId)}">查看完整轨迹</a></header><div class="evidence-list">${evidence.length ? evidence.map((item) => renderEvidence(item, escapeHtml)).join('') : '<p>没有可展示的脱敏证据摘要。</p>'}</div></section>
        <section class="delivery-check"><header><div><small>交付准备</small><strong>仍需人工核验</strong></div></header><ul><li class="done">成果版本与哈希已记录</li><li class="done">来源摘要可追溯</li><li>接收人、渠道与发布时间待确认</li></ul><button disabled>核验后进入发布确认</button><p>当前接口不提供文件下载或自动外发，避免越权读取和未确认发布。</p></section>
      </aside>
    </div>
  </section>`;
}

export function handlePageInput(target) {
  if (!(target instanceof HTMLInputElement) || target.dataset.action !== 'conversation-search')
    return false;
  const query = target.value.trim().toLocaleLowerCase('zh-CN');
  let visible = 0;
  for (const row of document.querySelectorAll('[data-conversation-row]')) {
    const matches = !query || (row.dataset.search ?? '').includes(query);
    row.hidden = !matches;
    if (matches) visible += 1;
  }
  const count = document.querySelector('[data-conversation-count]');
  if (count) count.textContent = `${visible} 个会话`;
  return true;
}

function renderSessionInbox({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data && view.state !== 'empty')
    return renderUnavailable(contract, view, escapeHtml);
  const conversations = demoMode
    ? [
        {
          id: 'demo-conversation-1',
          storeId: 'store-east',
          customerId: 'customer-731802',
          channel: 'WECHAT_MINI_PROGRAM',
          status: 'HUMAN_QUEUED',
          riskLevel: 'HIGH',
          contextType: 'ORDER',
          contextId: 'order-240824',
          updatedAt: '2026-08-24T14:26:00.000Z',
          ticket: {
            reasonCode: 'REFUND_DISPUTE',
            priority: 'URGENT',
            status: 'OPEN',
            dueAt: '2026-08-24T15:00:00.000Z',
          },
        },
        {
          id: 'demo-conversation-2',
          storeId: 'store-east',
          customerId: 'customer-184529',
          channel: 'H5',
          status: 'HUMAN_ACTIVE',
          riskLevel: 'NORMAL',
          contextType: 'PRODUCT',
          contextId: 'product-18',
          updatedAt: '2026-08-24T14:18:00.000Z',
          ticket: {
            reasonCode: 'PRODUCT_QUESTION',
            priority: 'NORMAL',
            status: 'ASSIGNED',
            dueAt: '2026-08-24T16:30:00.000Z',
          },
        },
        {
          id: 'demo-conversation-3',
          storeId: 'store-west',
          customerId: 'customer-650417',
          channel: 'WECHAT_MINI_PROGRAM',
          status: 'WAITING_CUSTOMER',
          riskLevel: 'NORMAL',
          contextType: 'GROUP_BUY',
          contextId: 'group-07',
          updatedAt: '2026-08-24T13:55:00.000Z',
          ticket: {
            reasonCode: 'VOUCHER_USE',
            priority: 'HIGH',
            status: 'ASSIGNED',
            dueAt: '2026-08-24T17:00:00.000Z',
          },
        },
        {
          id: 'demo-conversation-4',
          storeId: 'store-west',
          customerId: 'customer-905163',
          channel: 'H5',
          status: 'HUMAN_QUEUED',
          riskLevel: 'SENSITIVE',
          contextType: 'ORDER',
          contextId: 'order-240817',
          updatedAt: '2026-08-24T13:36:00.000Z',
          ticket: {
            reasonCode: 'PRIVACY_REQUEST',
            priority: 'URGENT',
            status: 'OPEN',
            dueAt: '2026-08-24T14:45:00.000Z',
          },
        },
      ]
    : list(livePageState.data);
  const urgent = conversations.filter((item) => item.ticket?.priority === 'URGENT').length;
  const queued = conversations.filter((item) => item.status === 'HUMAN_QUEUED').length;
  const active = conversations.filter((item) => item.status === 'HUMAN_ACTIVE').length;
  return `<section class="session-inbox-page" data-page-id="${contract.id}" data-experience="session-inbox">
    <header class="session-inbox-heading"><div><small>${demoMode ? '演示队列 · 非真实客户数据' : '权威客服队列'}</small><h1>会话列表</h1><p>按责任范围处理待接入、进行中和等待客户的会话。</p></div><button data-route="page-003">＋ 新对话</button></header>
    <nav class="session-filters" aria-label="会话状态筛选"><a class="active" href="/bao/page-009${demoMode ? '?demo=1' : ''}">待我处理 <b>${queued}</b></a><a href="/bao/page-009?${demoMode ? 'demo=1&' : ''}status=HUMAN_ACTIVE">进行中 <b>${active}</b></a><a href="/bao/page-009?${demoMode ? 'demo=1&' : ''}status=WAITING_CUSTOMER">等待对方</a><a href="/bao/page-009?${demoMode ? 'demo=1&' : ''}status=CLOSED">已完成</a></nav>
    <div class="session-inbox-layout">
      <main>
        <div class="session-list-tools"><label><span>⌕</span><input type="search" data-action="conversation-search" placeholder="搜索客户尾号、状态、渠道或工单原因" autocomplete="off"/></label><span data-conversation-count>${conversations.length} 个会话</span></div>
        <section class="session-list" aria-live="polite">${conversations.length ? conversations.map((item) => renderConversationRow(item, demoMode, escapeHtml)).join('') : '<div class="session-list-empty"><strong>当前筛选下没有会话</strong><p>服务端没有返回当前身份与门店范围内的记录。</p></div>'}</section>
      </main>
      <aside class="session-queue-summary"><section><small>队列概览</small><h2>优先处理高风险与临期会话</h2><div><span><b>${queued}</b><small>等待接入</small></span><span><b>${active}</b><small>处理中</small></span><span><b>${urgent}</b><small>紧急工单</small></span></div></section><section><small>数据边界</small><h2>服务端决定可见范围</h2><ul><li>租户与门店范围逐条校验</li><li>列表不预取消息正文</li><li>客户标识只显示安全尾号</li><li>搜索不会扩大授权范围</li></ul></section><section><small>处理流程</small><ol><li>核对风险和截止时间</li><li>进入会话读取授权消息</li><li>接入、回复或等待客户</li><li>关闭时记录解决代码</li></ol></section></aside>
    </div>
  </section>`;
}

function renderConversationRow(item, demoMode, escapeHtml) {
  const customer = String(item.customerId ?? 'unknown');
  const ticket = item.ticket;
  const statusCopy =
    {
      HUMAN_QUEUED: '等待接入',
      HUMAN_ACTIVE: '处理中',
      WAITING_CUSTOMER: '等待客户',
      CLOSED: '已完成',
    }[item.status] ?? item.status;
  const search = [customer, item.status, item.channel, ticket?.reasonCode, item.riskLevel]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('zh-CN');
  const href = `/bao/page-100?${demoMode ? 'demo=1&' : ''}conversationId=${encodeURIComponent(item.id)}`;
  return `<article data-conversation-row data-search="${escapeHtml(search)}"><div class="session-avatar">客</div><div class="session-row-main"><header><strong>客户 · ${escapeHtml(customer.slice(-6))}</strong><time>${escapeHtml(dateText(item.updatedAt))}</time></header><p>${escapeHtml(ticket?.reasonCode ?? 'GENERAL_SUPPORT')} · 内容需进入会话后按权限读取</p><footer><span>${escapeHtml(item.channel)}</span><span>${escapeHtml(item.contextType ?? 'NONE')}</span>${item.riskLevel !== 'NORMAL' ? `<span class="risk">${escapeHtml(item.riskLevel)}</span>` : ''}</footer></div><div class="session-row-status"><b>${escapeHtml(statusCopy)}</b>${ticket ? `<small class="priority-${String(ticket.priority).toLowerCase()}">${escapeHtml(ticket.priority)} · ${escapeHtml(ticket.status)}</small><time>${escapeHtml(ticket.dueAt ? `截止 ${dateText(ticket.dueAt)}` : '无截止时间')}</time>` : '<small>无转人工工单</small>'}<a href="${href}" aria-label="打开客户 ${escapeHtml(customer.slice(-6))} 的会话">打开会话</a></div></article>`;
}

function renderProvenance({ contract, demoMode, livePageState, view, escapeHtml }) {
  if (!demoMode && !livePageState.data) return renderUnavailable(contract, view, escapeHtml);
  const task = demoMode
    ? {
        id: 'demo-task',
        status: 'SUCCEEDED',
        updated_at: '2026-08-24T12:18:00.000Z',
        steps: [
          {
            step_number: 1,
            action_code: 'READ_OPERATION_FACTS',
            tool_code: 'merchant-operations',
            risk_level: 'READ',
            status: 'SUCCEEDED',
            attempt_count: 1,
            output_summary_redacted: '读取 7 天门店订单、核销与退款摘要',
          },
          {
            step_number: 2,
            action_code: 'CALCULATE_WEEKLY_CHANGE',
            tool_code: 'analytics',
            risk_level: 'READ',
            status: 'SUCCEEDED',
            attempt_count: 1,
            output_summary_redacted: '完成周环比计算并保存输入范围',
          },
          {
            step_number: 3,
            action_code: 'GENERATE_REPORT',
            tool_code: 'document',
            risk_level: 'CONFIRM',
            status: 'SUCCEEDED',
            attempt_count: 1,
            output_summary_redacted: '生成管理层汇报与数据核验表',
          },
        ],
        evidence: [
          {
            evidence_type: 'BUSINESS_RECORD',
            label: '门店经营日报',
            summary_redacted: '订单、核销与退款事实摘要',
            reference_hash: 'ev-41f8a731',
            created_at: '2026-08-24T11:42:00.000Z',
          },
          {
            evidence_type: 'TOOL_RESULT',
            label: '周环比计算',
            summary_redacted: '计算版本与输入范围已锁定',
            reference_hash: 'ev-d7125a44',
            created_at: '2026-08-24T11:55:00.000Z',
          },
          {
            evidence_type: 'HUMAN_CONFIRMATION',
            label: '财务口径确认',
            summary_redacted: '收入与退款口径已经人工复核',
            reference_hash: 'ev-9cc2d018',
            created_at: '2026-08-24T12:08:00.000Z',
          },
        ],
        artifacts: [{ id: 'artifact-1' }, { id: 'artifact-2' }],
      }
    : livePageState.data;
  const steps = list(task.steps);
  const evidence = list(task.evidence);
  const taskId = read(task, 'id') ?? 'task';
  const toolSteps = steps.filter((step) => read(step, 'tool_code', 'toolCode'));
  const confirmSteps = steps.filter((step) =>
    ['CONFIRM', 'DUAL_CONFIRM'].includes(read(step, 'risk_level', 'riskLevel')),
  );
  return `<section class="provenance-page" data-page-id="${contract.id}" data-experience="provenance-timeline">
    <header class="provenance-heading"><div><small>${demoMode ? '演示轨迹 · 非真实业务数据' : '权威任务轨迹'}</small><h1>来源与工具轨迹</h1><p>按执行顺序核对读取范围、工具结果、权限边界和人工确认。</p></div><span>${escapeHtml(read(task, 'status') ?? 'UNKNOWN')}</span></header>
    <div class="provenance-layout">
      <main>
        <section class="trace-summary"><span><small>任务步骤</small><b>${steps.length}</b></span><span><small>工具调用</small><b>${toolSteps.length}</b></span><span><small>确认步骤</small><b>${confirmSteps.length}</b></span><span><small>证据记录</small><b>${evidence.length}</b></span></section>
        <section class="step-ledger"><header><div><small>执行账本</small><h2>任务步骤与工具结果</h2></div><span>只读</span></header>${steps.length ? steps.map((step) => renderStep(step, escapeHtml)).join('') : '<p class="trace-empty">服务端尚未返回执行步骤。</p>'}</section>
        <section class="evidence-timeline"><header><div><small>证据时间线</small><h2>不可变来源记录</h2></div><span>${evidence.length} 条</span></header>${evidence.length ? evidence.map((item) => renderTimelineEvidence(item, escapeHtml)).join('') : '<p class="trace-empty">没有可展示的脱敏证据。</p>'}</section>
      </main>
      <aside class="trace-inspector">
        <section><small>轨迹完整性</small><h2>${steps.length && evidence.length ? '已建立可追溯链' : '等待完整记录'}</h2><p>步骤、成果和证据均以服务端任务编号关联；页面不读取模型提示词、秘密凭据或原始客户载荷。</p><dl><div><dt>任务编号</dt><dd>${escapeHtml(taskId)}</dd></div><div><dt>最近更新</dt><dd>${escapeHtml(dateText(read(task, 'updated_at', 'updatedAt')))}</dd></div><div><dt>关联成果</dt><dd>${list(task.artifacts).length} 项</dd></div></dl></section>
        <section><small>安全边界</small><h2>审计记录不可改写</h2><ul><li>修正内容必须产生新版本</li><li>失败步骤保留原因与尝试次数</li><li>权限裁决只展示脱敏摘要</li><li>人工确认保留对象与引用哈希</li></ul></section>
        <nav><a href="/bao/page-006?${demoMode ? 'demo=1&' : ''}taskId=${encodeURIComponent(taskId)}">查看成果预览</a><a href="/bao/page-011${demoMode ? '?demo=1' : ''}">查看原始材料</a></nav>
      </aside>
    </div>
  </section>`;
}

function renderStep(step, escapeHtml) {
  const number = read(step, 'step_number', 'stepNumber') ?? '—';
  const action = read(step, 'action_code', 'actionCode') ?? '未记录动作';
  const tool = read(step, 'tool_code', 'toolCode');
  const risk = read(step, 'risk_level', 'riskLevel') ?? 'READ';
  const status = read(step, 'status') ?? 'UNKNOWN';
  const attempts = read(step, 'attempt_count', 'attemptCount') ?? 0;
  const output = text(
    read(step, 'output_summary_redacted', 'outputSummaryRedacted'),
    '尚无脱敏输出摘要',
  );
  const failure = read(step, 'failure_code', 'failureCode');
  return `<article class="step-record"><b>${escapeHtml(number)}</b><div><header><strong>${escapeHtml(action)}</strong><span>${escapeHtml(status)}</span></header><p>${escapeHtml(output)}</p><footer><code>${escapeHtml(tool ?? 'NO_TOOL')}</code><small>风险 ${escapeHtml(risk)} · 尝试 ${escapeHtml(attempts)} 次${failure ? ` · 失败 ${escapeHtml(failure)}` : ''}</small></footer></div></article>`;
}

function renderTimelineEvidence(item, escapeHtml) {
  return `<article><time>${escapeHtml(dateText(read(item, 'created_at', 'createdAt')))}</time><i></i><div><small>${escapeHtml(read(item, 'evidence_type', 'evidenceType') ?? 'EVIDENCE')}</small><h3>${escapeHtml(item.label ?? '未命名证据')}</h3><p>${escapeHtml(text(read(item, 'summary_redacted', 'summaryRedacted'), '无可展示的脱敏摘要'))}</p><code>${escapeHtml(String(read(item, 'reference_hash', 'referenceHash') ?? '').slice(0, 24))}</code></div></article>`;
}

function renderUnavailable(contract, view, escapeHtml) {
  const copy = {
    loading: ['正在读取任务成果', '服务端正在校验身份、租户和任务范围。'],
    empty: ['缺少任务编号', '请从复杂任务或后台任务进入成果预览。'],
    denied: ['无法访问任务成果', '当前会话未通过身份或任务归属校验。'],
    'partial-error': ['部分成果读取失败', '未展示不完整内容，请稍后重新读取权威任务记录。'],
    'recoverable-failure': ['成果读取失败', '任务事实没有被改写，可以安全刷新后重试。'],
    stopped: ['成果预览已停用', '当前环境没有可用的权威任务读取能力。'],
  }[view.state] ?? ['等待任务成果', '生产模式不会展示演示成果。'];
  return `<section class="artifact-page artifact-unavailable" data-page-id="${contract.id}" data-experience="artifact-preview"><div><small>权威数据模式</small><h1>${escapeHtml(copy[0])}</h1><p>${escapeHtml(copy[1])}</p><button data-route="page-005">返回复杂任务</button></div></section>`;
}

function renderArtifact(item, escapeHtml) {
  const size = Number(read(item, 'size_bytes', 'sizeBytes') ?? 0);
  const hash = String(read(item, 'sha256') ?? '未返回');
  return `<article><b>${escapeHtml(
    String(item.name ?? '未命名成果')
      .split('.')
      .at(-1)
      ?.toUpperCase(),
  )}</b><div><strong>${escapeHtml(item.name ?? '未命名成果')}</strong><small>${escapeHtml(item.status ?? 'UNKNOWN')} · ${size ? `${Math.ceil(size / 1024)} KB` : '大小未知'}</small><code>SHA ${escapeHtml(hash.slice(0, 12))}</code></div></article>`;
}

function renderEvidence(item, escapeHtml) {
  return `<details><summary><span><small>${escapeHtml(read(item, 'evidence_type', 'evidenceType') ?? 'EVIDENCE')}</small><strong>${escapeHtml(item.label ?? '未命名证据')}</strong></span><b>＋</b></summary><p>${escapeHtml(text(read(item, 'summary_redacted', 'summaryRedacted'), '无可展示的脱敏摘要'))}</p><code>${escapeHtml(String(read(item, 'reference_hash', 'referenceHash') ?? '').slice(0, 20))}</code></details>`;
}
