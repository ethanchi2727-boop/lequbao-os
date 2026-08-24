export function renderAiTopbar({ view, shell, aiMode, aiMenuOpen, escapeHtml, icon }) {
  return `<header class="topbar ai-topbar"><div class="mobile-title"><button data-action="back" aria-label="返回">${icon('back')}</button><strong>${escapeHtml(view.title)}</strong><small>${escapeHtml(shell.status)}</small></div><div class="crumb">乐趣宝 <b>›</b> <strong>${escapeHtml(view.title)}</strong></div><div class="top-actions"><span>${escapeHtml(shell.status)}</span><button data-action="execution-mode" aria-pressed="${aiMode === 'COMPLEX'}">${aiMode === 'COMPLEX' ? '深度执行' : '普通对话'}⌄</button><button data-action="share-ai-task">${icon('share')} 分享</button><button data-action="ai-menu" aria-label="更多操作" aria-expanded="${aiMenuOpen}">${icon('menu')}</button>${aiMenuOpen ? `<div class="ai-overflow-menu"><button data-route="page-010">后台任务</button><button data-route="page-170">帮助与审计</button></div>` : ''}</div></header>`;
}

export async function shareAiTask(button) {
  let feedback;
  try {
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: document.title, url: location.href });
      feedback = '分享面板已打开。';
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(location.href);
      feedback = '当前页面链接已复制。';
      button.textContent = '已复制';
    } else {
      throw new Error('share is unavailable');
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return '';
    feedback = '此浏览器暂不支持自动分享，请复制地址栏链接。';
  }
  const status = document.querySelector('#ai-start-status');
  if (status) status.textContent = feedback;
  return feedback;
}

export function toggleAiCapability(button) {
  const pressed = button.getAttribute('aria-pressed') === 'true';
  button.setAttribute('aria-pressed', String(!pressed));
  const label = button.textContent.trim();
  const feedback = pressed ? `已关闭${label}。` : `${label}将在创建任务后按账号权限启用。`;
  const status = document.querySelector('#ai-start-status');
  if (status) status.textContent = feedback;
  return feedback;
}

export function renderAiConversationStart({
  contract,
  demoMode,
  livePageState,
  view,
  aiDraft,
  aiMode,
  aiFeedback,
  escapeHtml,
  icon,
}) {
  const createCommand = livePageState.request?.commands?.find(
    (command) => command.id === 'employee-agent-conversation-create',
  );
  const blocked =
    !demoMode && (!createCommand || ['loading', 'denied', 'stopped'].includes(view.state));
  const recentConversations =
    !demoMode && Array.isArray(livePageState.data) && livePageState.data.length
      ? `<section class="ai-recent-conversations" aria-label="最近对话"><h2>继续最近对话</h2>${livePageState.data
          .slice(0, 4)
          .map(
            (conversation) =>
              `<a href="/bao/page-004?conversationId=${encodeURIComponent(conversation.id)}"><strong>${escapeHtml(conversation.title)}</strong><small>${conversation.mode === 'COMPLEX' ? '复杂任务' : '普通对话'}</small></a>`,
          )
          .join('')}</section>`
      : '';
  const primaryAction = demoMode
    ? 'data-action="start-demo-conversation"'
    : 'data-command="employee-agent-conversation-create"';
  return `<section class="ai-start" data-page-id="${contract.id}" data-experience="conversation-start">
    <div class="ai-start-intro"><h1>你好，我是小满</h1><p>把工作交给我，我会调用公司知识、工具和业务插件完成它。</p></div>
    <div class="ai-start-composer command-form" data-command-form="employee-agent-conversation-create">
      <label class="sr-only" for="ai-task-title">告诉小满你想完成什么</label>
      <textarea id="ai-task-title" data-command-field="title" maxlength="500" placeholder="告诉小满你想完成什么……" ${blocked ? 'disabled' : ''}>${escapeHtml(aiDraft)}</textarea>
      <input type="hidden" data-command-field="mode" value="${aiMode}"/>
      <div class="ai-capabilities" aria-label="对话能力">
        <button type="button" data-action="ai-capability" data-capability="attachment" aria-pressed="false">${icon('file')} 附件</button>
        <button type="button" data-action="ai-capability" data-capability="network" aria-pressed="false">${icon('network')} 联网</button>
        <button type="button" data-action="ai-capability" data-capability="skill" aria-pressed="false">${icon('skill')} 技能</button>
        <button type="button" data-action="ai-capability" data-capability="plugin" aria-pressed="false">${icon('plugin')} 插件</button>
        <button type="button" data-route="page-177">${icon('mic')} 语音</button>
        <button class="ai-send" type="button" ${primaryAction} aria-label="开始对话" ${blocked || !aiDraft.trim() ? 'disabled' : ''}>${icon('send')}</button>
      </div>
      <small id="ai-start-status" class="ai-start-status" role="status" aria-live="polite">${escapeHtml(aiFeedback || (demoMode ? '演示模式 · 不写入业务系统' : '创建对话前不会读取业务数据或执行写操作'))}</small>
    </div>
    <section class="ai-quick-start" aria-label="快捷任务">
      ${[
        ['开始商户建档', '上传资料并识别商户、门店和联系人', 'page-014'],
        ['查看今日经营', '读取当前权限内的经营指标与异常', 'page-024'],
        ['处理客服待办', '进入人工接管与客户问题队列', 'page-100'],
        ['查看收益月结', '核对到账、退款、直接成本和持续收益', 'page-037'],
      ]
        .map(
          ([title, description, route]) =>
            `<button data-route="${route}"><strong>${title}</strong><small>${description}</small><span>›</span></button>`,
        )
        .join('')}
    </section>
    ${recentConversations}
    <p class="ai-start-note">可上传文件、语音输入，或进入全部能力；关键业务操作仍需按权限确认。</p>
  </section>`;
}
