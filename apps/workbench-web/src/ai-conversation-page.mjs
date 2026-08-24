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

export function renderConversationThread(input) {
  if (input.view.page === 'page-005') return renderComplexTask(input);
  const { contract, demoMode, livePageState, view, escapeHtml, icon } = input;
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

function renderComplexTask({ contract, demoMode, livePageState, view, escapeHtml, icon }) {
  const command = livePageState.request?.commands?.find((item) =>
    item.id.startsWith('employee-agent-task-create-'),
  );
  const blocked = !demoMode && (!command || ['loading', 'denied', 'stopped'].includes(view.state));
  const record = livePageState.data ?? {};
  const created = view.state === 'success' && typeof record.id === 'string';
  const action = demoMode
    ? 'data-action="start-demo-task"'
    : `data-command="${escapeHtml(command?.id ?? '')}"`;
  const latestDemoPrompt = demoConversationMessages.findLast((message) => message.role === 'user');
  const prompt =
    latestDemoPrompt?.content ?? '把本周经营数据做成管理层汇报，重点说明增长、风险和下周动作。';
  const steps = demoMode
    ? [
        ['读取经营数据与周环比', '已完成'],
        ['识别增长点与风险项', '已完成'],
        ['生成管理层汇报初稿', latestDemoPrompt ? '进行中 · 35%' : '进行中 · 78%'],
        ['核验数字与引用来源', '等待'],
      ]
    : [
        ['确认任务范围与预算', created ? '已完成' : '待创建'],
        ['生成服务端执行计划', created ? '等待执行' : '待创建'],
        ['执行工具并保存证据', '等待'],
        ['核验成果与人工确认', '等待'],
      ];
  return `<section class="complex-task" data-page-id="${contract.id}" data-experience="task-plan">
    <header class="complex-heading"><div><small>${demoMode ? '复杂任务 · 演示结构' : '复杂任务 · 权威执行'}</small><h1>${escapeHtml(demoMode ? '本周经营数据管理层汇报' : record.title || contract.title)}</h1><p>${demoMode ? '已自动保存 · 私密工作区' : '服务端按当前身份和会话范围裁决'}</p></div><span>${escapeHtml(created ? record.status || 'CREATED' : demoMode ? '正在执行' : '等待创建')}</span></header>
    <div class="complex-layout">
      <main class="complex-main">
        <article class="complex-request"><small>任务要求</small><p>${escapeHtml(prompt)}</p></article>
        <article class="complex-assistant"><b>满</b><div><strong>小满 <em>${demoMode ? '正在执行' : created ? '任务已创建' : '等待提交'}</em></strong><p>${demoMode ? '我会读取你有权限的经营数据，并将先核对口径，再生成可编辑汇报。' : '提交前请核对步骤、工具、预算和截止时间；创建后可从证据页跟踪执行。'}</p></div></article>
        <section class="execution-trace"><header><strong>执行轨迹</strong><small>${demoMode ? '演示进度' : '权威状态'}</small></header><ol>${steps.map(([label, status], index) => `<li class="${status.includes('已完成') ? 'done' : status.includes('进行中') ? 'running' : ''}"><b>${index + 1}</b><span>${label}</span><em>${status}</em></li>`).join('')}</ol></section>
        <section class="task-result-preview"><b>PPT</b><div><strong>${demoMode ? '本周经营复盘｜管理层汇报' : created ? '任务已创建，成果生成后将在此呈现' : '尚未创建成果'}</strong><small>${demoMode ? '12 页 · 可编辑 · 数据口径已锁定' : '生产模式不展示模拟成果'}</small></div>${created ? `<a href="/bao/page-006?taskId=${encodeURIComponent(record.id)}">查看任务证据</a>` : ''}</section>
        <div class="complex-composer command-form" data-command-form="${escapeHtml(command?.id ?? '')}">
          <label for="complex-task-prompt"><span>任务要求</span><textarea id="complex-task-prompt" data-command-field="prompt" maxlength="20000" placeholder="描述目标、输出格式、材料和限制条件……" ${blocked ? 'disabled' : ''}>${escapeHtml(conversationDraft)}</textarea></label>
          <div class="task-budget-grid">
            <label><span>最大步骤</span><input data-command-field="maxSteps" type="number" min="1" max="12" value="10"/></label>
            <label><span>工具次数</span><input data-command-field="maxToolCalls" type="number" min="0" max="100" value="24"/></label>
            <label><span>预算上限</span><input data-command-field="maxCostMicros" type="number" min="0" max="100000000" value="10000000"/></label>
            <label><span>截止时间</span><input data-command-field="deadlineAt" type="datetime-local" value="${new Date(Date.now() + 3600000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}"/></label>
          </div>
          <div class="complex-actions"><small>发布、资金、权限与不可逆操作仍需单独确认</small><button class="thread-send" type="button" ${action} ${blocked || !conversationDraft.trim() ? 'disabled' : ''}>${demoMode ? '演示创建' : '创建复杂任务'} ${icon('send')}</button></div>
        </div>
      </main>
      <aside class="task-workspace"><header><strong>工作区</strong><span>${created || demoMode ? '成果' : '任务'}</span></header><section><small>${demoMode ? '正在生成' : created ? '已进入队列' : '等待创建'}</small><h2>管理层经营汇报</h2><progress value="${demoMode ? 78 : created ? 10 : 0}" max="100"></progress><p>${demoMode ? '78% · 约 1 分钟' : created ? '服务端任务已建立' : '提交后显示真实进度'}</p></section><div class="workspace-files"><strong>本次成果</strong>${demoMode ? '<span>经营汇报_v1.pptx <em>生成中</em></span><span>经营数据核验表.xlsx <em>已完成</em></span><span>演讲备注.md <em>已完成</em></span>' : '<p>生产成果和来源只在服务端生成后展示。</p>'}</div><div class="confirmation-card"><small>需要你的确认</small><strong>完成后发送给管理层群</strong><p>小满不会自动外发。请核验数据、接收人和发送时间。</p><button disabled>核验后发送</button></div></aside>
    </div>
  </section>`;
}
