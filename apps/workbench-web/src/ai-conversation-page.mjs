const deadlineValue = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();
let conversationDraft = '';
let demoConversationMessages = [];

export function updateConversationDraft(control) {
  conversationDraft = control.value;
  control.removeAttribute('aria-invalid');
  const send = document.querySelector('.thread-send');
  if (send instanceof HTMLButtonElement) send.disabled = !conversationDraft.trim();
}

export function submitDemoTask() {
  if (!conversationDraft.trim()) return false;
  demoConversationMessages = [
    ...demoConversationMessages,
    { role: 'user', content: conversationDraft },
    {
      role: 'assistant',
      content: '演示任务已进入队列。生产模式会按当前身份、预算和确认边界创建真实任务。',
    },
  ];
  conversationDraft = '';
  return true;
}

export function clearDraft() {
  conversationDraft = '';
}

export function renderConversationTopbar({ view, shell, escapeHtml, icon }) {
  return `<header class="topbar thread-topbar"><div class="mobile-title"><button data-action="back" aria-label="返回">${icon('back')}</button><strong>${escapeHtml(view.title)}</strong><small>${escapeHtml(shell.status)}</small></div><div class="crumb">乐趣宝 <b>›</b> <strong>${escapeHtml(view.title)}</strong></div><div class="top-actions"><span>${escapeHtml(shell.status)}</span><button data-route="page-003">${icon('plus')} 新对话</button><button data-route="page-010">${icon('clock')} 后台任务</button></div></header>`;
}

export function renderConversationThread({
  contract,
  demoMode,
  livePageState,
  view,
  escapeHtml,
  icon,
}) {
  const command = livePageState.request?.commands?.find((item) =>
    item.id.startsWith('employee-agent-task-create-'),
  );
  const blocked = !demoMode && (!command || ['loading', 'denied', 'stopped'].includes(view.state));
  const conversation = livePageState.data ?? {};
  const title = demoMode ? '筹备七夕营销活动' : conversation.title || contract.title;
  const messages = demoConversationMessages.length
    ? demoConversationMessages
        .map(
          (message) =>
            `<article class="thread-message ${message.role}"><b>${message.role === 'user' ? '我' : '满'}</b><div><small>${message.role === 'user' ? '当前用户' : '小满 · 演示回复'}</small><p>${escapeHtml(message.content)}</p></div></article>`,
        )
        .join('')
    : `<article class="thread-message assistant"><b>满</b><div><small>小满</small><p>${demoMode ? '你好，我已经准备好。请告诉我这次经营任务的目标与完成标准。' : '会话已建立。提交任务前请核对执行目标；服务端会再次检查身份、预算与权限。'}</p></div></article>`;
  const action = demoMode
    ? 'data-action="start-demo-task"'
    : `data-command="${escapeHtml(command?.id ?? '')}"`;
  return `<section class="ai-thread" data-page-id="${contract.id}" data-experience="conversation-thread">
    <header class="thread-heading"><div><small>${demoMode ? '演示会话' : '权威会话'}</small><h1>${escapeHtml(title)}</h1></div><span>${escapeHtml(conversation.status || 'ACTIVE')}</span></header>
    <div class="thread-timeline" aria-live="polite">${messages}${view.state === 'success' && !demoMode ? `<article class="thread-message system"><b>${icon('check')}</b><div><small>任务状态</small><p>任务已由服务端创建，可前往后台任务查看执行与证据。</p></div></article>` : ''}</div>
    <div class="thread-composer command-form" data-command-form="${escapeHtml(command?.id ?? '')}">
      <label class="sr-only" for="conversation-task-prompt">输入任务要求</label>
      <textarea id="conversation-task-prompt" data-command-field="prompt" maxlength="20000" placeholder="继续描述任务，或补充目标、材料与限制条件……" ${blocked ? 'disabled' : ''}>${escapeHtml(conversationDraft)}</textarea>
      <input type="hidden" data-command-field="maxSteps" value="6"/>
      <input type="hidden" data-command-field="maxToolCalls" value="12"/>
      <input type="hidden" data-command-field="maxCostMicros" value="5000000"/>
      <input type="hidden" data-command-field="deadlineAt" value="${deadlineValue()}"/>
      <div class="thread-actions"><span>${icon('file')} 附件</span><span>${icon('network')} 联网</span><small>默认：6 步 · 12 次工具 · 1 小时</small><button class="thread-send" type="button" ${action} aria-label="创建任务" ${blocked || !conversationDraft.trim() ? 'disabled' : ''}>${icon('send')}</button></div>
    </div>
    <p class="thread-note">${demoMode ? '演示模式 · 不写入业务系统' : '提交后需确认当前租户、门店、费用与截止时间；高风险动作仍会二次确认。'}</p>
  </section>`;
}
