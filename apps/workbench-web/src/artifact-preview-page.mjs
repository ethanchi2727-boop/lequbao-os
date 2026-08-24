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
