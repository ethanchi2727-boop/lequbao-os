import { escapeHtml, resolvePage, statusCopy, updateResultPanel, viewFor } from './state.mjs';
import { ApiError, createMerchantIntakeApi, createWorkbenchApi } from './api-client.js';
import { resolveLivePageRequest } from './live-page-registry.mjs';
import {
  resolveIntakeMutationMode,
  resolveIntakeProjection,
  resolveWorkbenchShell,
} from './production-ui-policy.mjs';

const params = new URLSearchParams(location.search);
let view = viewFor(resolvePage(location.pathname), params.get('state') ?? 'default');
const app = document.querySelector('#app');
const demoMode = params.get('demo') === '1';
const sessionToken = sessionStorage.getItem('lequbao.employee-session');
const apiBaseUrl = location.origin;
const intakeApi =
  demoMode || !sessionToken
    ? null
    : createMerchantIntakeApi({
        baseUrl: apiBaseUrl,
        expectedOrigin: location.origin,
        token: sessionToken,
      });
const workbenchApi =
  demoMode || !sessionToken
    ? null
    : createWorkbenchApi({
        baseUrl: apiBaseUrl,
        expectedOrigin: location.origin,
        token: sessionToken,
      });
let liveSession = null;
let livePageState = { request: null, data: null };
let resultPanel = { open: true, tab: 'result' };

const demoFields = [
  ['主体名称', '南京拾味餐饮管理有限公司', '99%', '已识别'],
  ['门店名称', '拾味小馆 · 新街口店', '96%', '已识别'],
  ['统一信用代码', '91320105MA••••729Q', '99%', '已识别'],
  ['门店地址', '秦淮区中山南路 18 号', '91%', '待确认'],
];
const fieldLabels = {
  'merchant.legal_subject_name': '主体名称',
  'merchant.store_name': '门店名称',
  'merchant.industry_code': '行业分类',
  'merchant.business_license_object_key': '营业执照',
  'merchant.public_contact.phone': '公开电话',
};
function displayedFields() {
  return resolveIntakeProjection({ demoMode, session: liveSession, demoFields }).fields.map(
    (field) =>
      Array.isArray(field)
        ? field
        : [
            escapeHtml(fieldLabels[field.fieldPath] ?? field.fieldPath),
            escapeHtml(
              typeof field.candidateValue === 'string'
                ? field.candidateValue
                : JSON.stringify(field.candidateValue),
            ),
            field.confidence === null ? '待核对' : `${Math.round(field.confidence * 100)}%`,
            field.decisionStatus === 'CONFLICT'
              ? '有冲突'
              : field.decisionStatus === 'CONFIRMED'
                ? '已确认'
                : '已识别',
          ],
  );
}

function intakeProjection() {
  return resolveIntakeProjection({ demoMode, session: liveSession, demoFields });
}

function icon(name) {
  const paths = {
    plus: 'M12 5v14M5 12h14',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4 4',
    chat: 'M5 5h14v10H9l-4 4V5Z',
    work: 'M4 7h16v13H4V7Zm5 0V4h6v3M4 12h16',
    shop: 'M4 10h16l-2-6H6l-2 6Zm2 0v10h12V10M9 20v-6h6v6',
    geo: 'M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Zm0-8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    tools: 'M14 6a4 4 0 0 0-5 5L4 16l4 4 5-5a4 4 0 0 0 5-5l-3 2-3-3 2-3Z',
    money: 'M12 3v18M8 7h6a3 3 0 0 1 0 6h-4a3 3 0 0 0 0 6h6',
    mic: 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 7a6 6 0 0 0 12 0M12 18v3M9 21h6',
    file: 'M7 3h7l4 4v14H7V3Zm7 0v5h4M10 13h5M10 17h5',
    camera: 'M4 8h4l2-3h4l2 3h4v11H4V8Zm8 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    send: 'm4 12 16-8-6 16-3-6-7-2Zm7 2 9-10',
    back: 'm15 5-7 7 7 7',
    logo: 'M12 3c2 0 3 2 3 4 2-1 5 0 5 3s-3 4-5 3c1 2 0 5-3 5s-4-3-3-5c-2 1-5 0-5-3s3-4 5-3c0-2 1-4 3-4Z',
    task: 'M5 4h14v16H5V4Zm3 8 3 3 5-6',
    message: 'M4 5h16v12H8l-4 4V5Zm4 4h8M8 13h5',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0',
    network: 'M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18M4 7h16M4 17h16',
    skill:
      'm12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3ZM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16Z',
    plugin: 'M9 4h6v4h3a2 2 0 1 1 0 4h-3v8H9v-3a2 2 0 1 0-4 0v3H3v-8h3a2 2 0 1 0 0-4H3V4h6Z',
    clock: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4v5l3 2',
    share: 'M8 12 16 5M8 12l8 7M16 5v5M16 19v-5',
    check: 'm5 12 4 4 10-10',
    warning: 'M12 3 3 20h18L12 3Zm0 6v5M12 18h.01',
    help: 'M9 9a3 3 0 1 1 4 2.8c-1 .4-1 1.2-1 2.2M12 18h.01',
    menu: 'M5 12h.01M12 12h.01M19 12h.01',
    close: 'm6 6 12 12M18 6 6 18',
  };
  const path = paths[name] ?? paths.help;
  return `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${path}"/></svg>`;
}

function statePanel() {
  const copy = statusCopy(view.state, intakePages.has(view.page) ? 'intake' : 'generic');
  if (!copy) return '';
  return `<section class="state-panel state-${view.state}" role="status"><div class="state-symbol">${icon(view.state === 'success' ? 'check' : 'warning')}</div><div><h2>${copy[0]}</h2><p>${copy[1]}</p></div>${['partial-error', 'recoverable-failure'].includes(view.state) ? '<button data-action="recover">重试失败部分</button>' : ''}</section>`;
}

function sidebar() {
  const shell = resolveWorkbenchShell(demoMode);
  const routeSuffix = demoMode ? '?demo=1' : '';
  const demoSearch = demoMode
    ? `<label class="search">${icon('search')}<input aria-label="搜索页面、商户或任务" placeholder="搜页面、商户或任务"/><kbd>Ctrl K</kbd></label>`
    : '';
  const recent = shell.recentServices.length
    ? `<section class="recent"><small>我的持续服务</small>${shell.recentServices.map((item) => `<a href="#">${escapeHtml(item)}</a>`).join('')}</section>`
    : '<section class="recent"><small>我的持续服务</small><span>从当前页面的权威结果进入相关服务</span></section>';
  return `<aside class="sidebar" aria-label="主导航">
    <a class="brand" href="/bao/page-014${routeSuffix}"><b>${icon('logo')}</b><span><strong>乐趣宝</strong><small>AI 经营工作台</small></span></a>
    <button class="new-task" data-route="page-003">${icon('plus')} 新建 AI 任务 <kbd>Ctrl N</kbd></button>
    ${demoSearch}
    <nav>${[
      ['chat', 'AI 对话', 'page-003'],
      ['work', '商务中心', 'page-026'],
      ['shop', '商户交付', 'page-053'],
      ['shop', '商家经营', 'page-079'],
      ['chat', 'AI 客服', 'page-100'],
      ['geo', 'GEO 获客', 'page-126'],
      ['tools', '插件与技能', 'page-129'],
      ['money', '收益结算', 'page-137'],
    ]
      .map(
        ([i, t, page], n) =>
          `<a class="${n === 0 ? 'active' : ''}" href="/bao/${page}${routeSuffix}">${icon(i)} ${t}${demoMode && t === '商户交付' ? '<em>3</em>' : ''}</a>`,
      )
      .join('')}</nav>
    ${recent}
    <button class="identity" ${demoMode ? '' : 'disabled'}><b>${demoMode ? escapeHtml(shell.identityInitial) : icon('user')}</b><span>${escapeHtml(shell.identityLabel)}<small>${escapeHtml(shell.identityScope)}</small></span>${demoMode ? icon('menu') : ''}</button>
  </aside>`;
}

function topbar() {
  const shell = resolveWorkbenchShell(demoMode);
  const demoActions = demoMode
    ? `<button>快速执行</button><button data-action="open-results">${icon('clock')} 后台任务 ${shell.backgroundTaskCount}</button><button aria-label="分享">${icon('share')}</button>`
    : '';
  return `<header class="topbar"><div class="mobile-title"><button data-action="back" aria-label="返回">${icon('back')}</button><strong>${escapeHtml(view.title)}</strong><small>${escapeHtml(shell.status)}</small></div><div class="crumb">乐趣宝 <b>›</b> <strong>${escapeHtml(view.title)}</strong></div><div class="top-actions"><span>${escapeHtml(shell.status)}</span>${demoActions}</div></header>`;
}

const intakePages = new Set(['page-014', 'page-175', 'page-176', 'page-177', 'page-178']);
function genericWorkbenchPage() {
  const contract = view.contract;
  if (!contract) return '';
  const domains = contract.apiDomains.length ? contract.apiDomains : ['无外部数据'];
  const stateContent = livePageState.data
    ? renderLiveData(livePageState.data, livePageState.request?.kind)
    : !demoMode &&
        ['loading', 'denied', 'partial-error', 'recoverable-failure'].includes(view.state)
      ? '<div class="generic-empty"><b>未展示业务数据</b><span>只有服务端完成身份、租户和资源范围校验后才会呈现记录。</span></div>'
      : view.state === 'empty'
        ? `<div class="generic-empty"><b>暂无数据</b><span>${livePageState.request?.status === 'missing-parameters' ? `需要链接参数：${livePageState.request.missing.map(escapeHtml).join('、')}` : '调整筛选或完成前置步骤后再试。'}</span></div>`
        : !demoMode && livePageState.request?.status === 'unsupported'
          ? '<div class="generic-empty"><b>此页面尚未连接权威 API</b><span>生产模式不会展示模拟业务数据；完成服务端契约和权限验收后才能启用。</span></div>'
          : `<div class="generic-grid">${contract.components
              .map(
                (component, index) =>
                  `<article><small>${index + 1}</small><strong>${escapeHtml(component)}</strong><span>仅显示当前身份与资源范围允许的数据</span></article>`,
              )
              .join('')}</div>`;
  return `<section class="generic-page" data-page-id="${contract.id}" data-priority="${contract.priority}">
    <header><div><small>${escapeHtml(contract.primaryRole)}</small><h1>${escapeHtml(contract.title)}</h1><p>${escapeHtml(contract.purpose)}</p></div><a href="/bao/page-170${demoMode ? '?demo=1' : ''}" aria-label="帮助与审计">${icon('help')} 帮助与审计</a></header>
    <div class="generic-scope"><span>数据域</span>${domains.map((domain) => `<b>${escapeHtml(domain)}</b>`).join('')}<em>服务端权限与租户范围最终裁决</em></div>
    ${stateContent}
    <footer>${renderLiveCommands(contract)}<small>${escapeHtml(contract.acceptance)}</small></footer>
  </section>`;
}

function renderLiveCommands(contract) {
  const commands = livePageState.request?.commands ?? [];
  if (commands.length)
    return commands
      .map((command, index) => {
        const inputs = (command.inputs ?? [])
          .map((input) => {
            const options = input.options ?? [];
            const control = options.length
              ? `<select data-command-field="${escapeHtml(input.name)}" ${input.required ? 'required' : ''}><option value="">请选择</option>${options.map((option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`).join('')}</select>`
              : `<input data-command-field="${escapeHtml(input.name)}" type="${escapeHtml(input.type ?? 'text')}" ${input.required ? 'required' : ''} ${input.placeholder ? `placeholder="${escapeHtml(input.placeholder)}"` : ''}/>`;
            return `<label><span>${escapeHtml(input.label)}</span>${control}</label>`;
          })
          .join('');
        return `<div class="command-form" data-command-form="${escapeHtml(command.id)}">${inputs}<button class="${index === 0 ? 'primary' : ''}" data-command="${escapeHtml(command.id)}" ${['denied', 'stopped', 'loading'].includes(view.state) ? 'disabled' : ''}>${escapeHtml(command.label)}</button></div>`;
      })
      .join('');
  return contract.actions
    .map(
      (action) =>
        `<button disabled title="此操作尚未连接权威写接口">${escapeHtml(action)}</button>`,
    )
    .join('');
}

const visibleFields = {
  'identity-context': ['tenantId', 'userId', 'sessionId', 'roles', 'permissions', 'storeIds'],
  'sales-opportunities': [
    'id',
    'ownerUserId',
    'legalSubjectName',
    'status',
    'firstContactAt',
    'nextAction',
    'protectionUntil',
    'hasEvidence',
    'updatedAt',
  ],
  'sales-opportunity-detail': [
    'id',
    'ownerUserId',
    'legalSubjectName',
    'status',
    'firstContactAt',
    'nextAction',
    'protectionUntil',
    'hasEvidence',
    'checks',
    'quotes',
    'contracts',
    'version',
    'updatedAt',
  ],
  'subscription-changes': [
    'id',
    'changeType',
    'requestedPlanCode',
    'effectiveAt',
    'reasonCode',
    'status',
    'requestedBy',
    'approvedBy',
    'decisionReasonCode',
    'appliedSubscriptionId',
    'updatedAt',
  ],
  'renewal-previews': [
    'id',
    'subscriptionId',
    'reportMonth',
    'recommendedPlanCode',
    'recommendationReason',
    'status',
    'dueAt',
    'issueSnapshot',
    'updatedAt',
  ],
  'renewal-preview-detail': [
    'id',
    'subscriptionId',
    'reportMonth',
    'metricsSnapshot',
    'issueSnapshot',
    'recommendedPlanCode',
    'recommendationReason',
    'status',
    'dueAt',
    'generatedAt',
    'updatedAt',
  ],
  'delivery-project': [
    'id',
    'status',
    'workflowCode',
    'merchantProfileId',
    'storeId',
    'waitingFor',
    'version',
    'updatedAt',
  ],
  'delivery-exceptions': ['id', 'projectId', 'status', 'reasonCode', 'summary', 'updatedAt'],
  'mini-program': [
    'id',
    'status',
    'appIdMasked',
    'authorizationStatus',
    'currentReleaseId',
    'stableReleaseId',
    'updatedAt',
  ],
  'customer-service-queue': ['id', 'storeId', 'status', 'riskLevel', 'assignedUserId', 'updatedAt'],
  'customer-service-conversation': [
    'id',
    'storeId',
    'status',
    'riskLevel',
    'assignedUserId',
    'version',
    'updatedAt',
  ],
  'knowledge-publications': [
    'id',
    'storeId',
    'title',
    'status',
    'trustLevel',
    'validFrom',
    'expiresAt',
  ],
  'monthly-value-report': [
    'id',
    'month',
    'storeId',
    'status',
    'generatedAt',
    'metricVersion',
    'metrics',
  ],
  'official-plugin-catalog': [
    'id',
    'code',
    'name',
    'version',
    'status',
    'permissions',
    'domains',
    'fee',
  ],
  'merchant-profile': [
    'id',
    'legalSubjectName',
    'industryCode',
    'serviceRegionCodes',
    'status',
    'verifiedAt',
    'version',
    'updatedAt',
  ],
  'merchant-products': [
    'id',
    'storeId',
    'productType',
    'title',
    'status',
    'salePriceCents',
    'marketPriceCents',
    'variantCount',
    'onHand',
    'reserved',
    'updatedAt',
  ],
  'merchant-group-buys': [
    'id',
    'storeId',
    'title',
    'status',
    'salePriceCents',
    'variantCount',
    'onHand',
    'reserved',
    'updatedAt',
  ],
  'merchant-orders': [
    'id',
    'orderNo',
    'storeId',
    'status',
    'payableAmountCents',
    'paidAmountCents',
    'refundedAmountCents',
    'currency',
    'paidAt',
    'updatedAt',
  ],
  'merchant-order-detail': [
    'id',
    'orderNo',
    'storeId',
    'status',
    'payableAmountCents',
    'paidAmountCents',
    'refundedAmountCents',
    'currency',
    'items',
    'refunds',
    'updatedAt',
  ],
  'merchant-refunds': [
    'id',
    'refundNo',
    'orderId',
    'storeId',
    'amountCents',
    'reasonCode',
    'status',
    'requestedBy',
    'approvedBy',
    'succeededAt',
    'updatedAt',
  ],
  'merchant-verification-uses': [
    'id',
    'entitlementId',
    'storeId',
    'quantity',
    'verifierUserId',
    'usedAt',
    'reversedById',
    'reversalReason',
  ],
  'merchant-reconciliations': [
    'id',
    'businessDate',
    'provider',
    'status',
    'orderPaidCents',
    'providerPaidCents',
    'orderRefundedCents',
    'providerRefundedCents',
    'rewardNetCents',
    'verificationCount',
    'differenceCents',
    'completedAt',
  ],
};

function displayValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return `${value.length} 项`;
  if (typeof value === 'object') return `${Object.keys(value).length} 项指标`;
  return escapeHtml(value);
}

function renderLiveData(data, kind) {
  const records = Array.isArray(data) ? data : [data];
  if (records.length === 0)
    return '<div class="generic-empty"><b>当前没有记录</b><span>服务端已确认当前权限范围内为空。</span></div>';
  const allowed = visibleFields[kind] ?? [];
  return `<div class="live-data" data-live-kind="${escapeHtml(kind ?? 'unknown')}">${records
    .slice(0, 50)
    .map((record, index) => {
      const entries = allowed
        .filter((key) => Object.hasOwn(record ?? {}, key))
        .map(
          (key) =>
            `<div><small>${escapeHtml(key)}</small><strong>${displayValue(record[key])}</strong></div>`,
        )
        .join('');
      return `<article><header><b>${index + 1}</b><span>权威服务端记录</span></header>${entries || '<p>记录存在，但没有可在此页面公开展示的字段。</p>'}</article>`;
    })
    .join('')}</div>`;
}

function composer() {
  const demoTools = demoMode
    ? `<button type="button">${icon('network')} 联网</button><button type="button">${icon('skill')} 技能</button><button type="button">${icon('plugin')} 插件</button>`
    : '';
  return `<form class="composer" data-form="message"><textarea aria-label="补充资料" placeholder="继续说、拍照或把资料直接丢进来…"></textarea><input id="intake-file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,audio/mpeg,audio/wav,audio/mp4,audio/amr" hidden/><div class="tools"><button type="button" data-action="choose-file" aria-label="添加">${icon('plus')}</button><button type="button" data-action="choose-file">${icon('file')} 文件</button>${demoTools}<button type="button" data-route="page-177">${icon('mic')}<span class="tool-label"> 语音</span></button><button class="send" type="submit" aria-label="发送">${icon('send')}</button></div><small>${demoMode ? '演示模式 · 支持内容、图片、PDF、语音与相关链接' : '生产模式 · 原材料将安全上传并进入识别队列'}</small></form>`;
}

function conversation() {
  if (view.state === 'empty') return '';
  const intro = `<div class="intro"><div class="agent">${icon('logo')}</div><div><strong>把商家资料直接发给我</strong><p>营业执照、门头照、定位、PDF 或语音都可以。</p></div></div>`;
  if (!demoMode && !liveSession)
    return `<section class="conversation" aria-label="建档对话">${intro}<div class="generic-empty"><b>等待权威会话</b><span>只有服务端创建或恢复建档会话后，资料和识别结果才会显示。</span></div></section>`;
  const fields = displayedFields();
  const projection = intakeProjection();
  const demoEvidence = demoMode
    ? `<div class="user-bubble">我在拾味小馆门店，要给他开通 898 基础版。这是营业执照、门头和微信定位，店长叫陈海。</div><div class="attachments"><article class="asset photo"><small>营业执照</small><strong>统一社会信用代码</strong><span>JPG · 2.8MB</span><i>安全</i></article><article class="asset storefront"><small>门头照片</small><strong>拾味小馆</strong><span>HEIC · 4.1MB</span><i>安全</i></article><article class="asset location"><b>${icon('geo')}</b><span><small>微信门店定位</small><strong>拾味小馆</strong><em>南京市秦淮区中山南路 18 号</em></span><i>${icon('check')}</i></article></div>`
    : '';
  const missingCopy = projection.missingItems.length
    ? `当前还有 ${projection.missingItems.length} 项资料缺失，请继续补充。`
    : '当前没有服务端报告的缺失项；提交前仍需核对全部待确认字段。';
  return `<section class="conversation" aria-label="建档对话">${intro}${demoEvidence}
    <article class="agent-result"><header><div class="agent">${icon('logo')}</div><div><h2>已识别并合并商户资料 <span>${icon('check')} ${fields.length} 个字段有来源</span></h2><p>冲突和低置信度字段不会自动写入正式档案，必须由有权限的负责人核对。</p></div></header><div class="field-grid">${fields
      .map(
        ([k, v, c, s]) =>
          `<button data-route="page-178"><small>${k}</small><strong>${v}</strong><span>${s} ${c}</span></button>`,
      )
      .join(
        '',
      )}</div><div class="voice"><b>${icon('mic')}</b><span><strong>资料完整性</strong><small>${escapeHtml(missingCopy)}</small></span><button data-route="page-177">语音补充</button></div></article>
  </section>`;
}

function results() {
  if (!resultPanel.open) return '';
  const projection = intakeProjection();
  const fields = displayedFields();
  const tabs = [
    ['task', '待补充', String(projection.missingItems.length)],
    ['result', '成果', String(fields.length)],
    ['source', '来源', String(projection.sourceCount)],
  ]
    .map(
      ([code, label, count]) =>
        `<button class="${resultPanel.tab === code ? 'active' : ''}" data-action="result-tab" data-tab="${code}">${label} <sup>${count}</sup></button>`,
    )
    .join('');
  const missingRows = projection.missingItems.length
    ? projection.missingItems
        .map(
          (item, index) =>
            `<article class="warning"><b>${index + 1}</b><span><strong>待补充资料</strong><small>${escapeHtml(item)}</small></span><button data-route="page-175">继续</button></article>`,
        )
        .join('')
    : '<p class="safe-note">服务端当前没有报告缺失项；仍须完成冲突和授权检查。</p>';
  const task = `<section class="progress"><div><small>资料完整度</small><strong>${projection.completeness}%</strong></div><progress value="${projection.completeness}" max="100">${projection.completeness}%</progress><small>进度只按服务端字段和缺失项计算。</small></section><h3>安全断点</h3>${missingRows}`;
  const result = `<section class="progress"><div><small>商户资料完整度</small><strong>${projection.completeness}%</strong></div><progress value="${projection.completeness}" max="100">${projection.completeness}%</progress><small>每一项成果都保留来源和修正历史。</small></section><h3>已识别成果</h3>${
    fields
      .map(
        ([k, v, c]) =>
          `<div class="result-row"><span><small>${k}</small><strong>${v}</strong></span><em>${c}</em><button data-route="page-178">修正</button></div>`,
      )
      .join('') || '<p class="safe-note">当前没有服务端确认的识别成果。</p>'
  }`;
  const sourceRows = liveSession
    ? liveSession.fields
        .filter((field) => field.sourceAssetId)
        .map(
          (field) =>
            `<div class="result-row"><span><small>${escapeHtml(fieldLabels[field.fieldPath] ?? field.fieldPath)}</small><strong>来源证据已由服务端绑定</strong></span><em>可追溯</em></div>`,
        )
        .join('')
    : demoMode
      ? '<div class="result-row"><span><small>营业执照原图</small><strong>安全扫描通过 · SHA-256 已留证</strong></span><em>原件</em></div><div class="result-row"><span><small>微信门店定位</small><strong>南京市秦淮区中山南路 18 号</strong></span><em>定位</em></div><div class="result-row"><span><small>店长语音</small><strong>营业时间转写与原音共同保留</strong></span><em>语音</em></div>'
      : '';
  const source = `<h3>可信来源</h3>${sourceRows || '<p class="safe-note">当前没有服务端绑定的来源证据。</p>'}<p class="safe-note">${icon('check')} 来源只用于已声明目的；修正不会覆盖原始证据。</p>`;
  return `<aside class="results" aria-label="任务与成果"><nav>${tabs}<button data-action="close-results" aria-label="关闭任务与成果">${icon('close')}</button></nav>${resultPanel.tab === 'task' ? task : resultPanel.tab === 'source' ? source : result}</aside>`;
}

function mobileSheet() {
  if (view.page === 'page-176')
    return `<section class="mobile-sheet"><h2>添加门店材料</h2><p>原始文件会先安全检查，再进入识别。</p><div class="capture-grid"><button data-action="choose-file">${icon('camera')}<strong>拍营业执照</strong><small>JPG、PNG、WEBP</small></button><button data-action="choose-file">${icon('file')}<strong>选择文件</strong><small>PDF、DOCX</small></button></div><div class="upload-item"><span>${demoMode ? '营业执照.jpg' : '等待选择文件'}</span><progress value="${demoMode ? 68 : 0}" max="100">${demoMode ? 68 : 0}%</progress><b>${demoMode ? '68%' : '0%'}</b></div><button class="primary" data-route="page-175">完成并返回对话</button></section>`;
  if (view.page === 'page-177')
    return `<section class="mobile-sheet voice-sheet"><h2>用语音补充资料</h2><p>松开后自动转写，原语音与文字会一起保留。</p><button class="record" data-action="record">${icon('mic')}<strong>按住说话</strong><small>最长 60 秒</small></button><div class="transcript"><small>实时转写</small><p>${demoMode ? '每天上午十点到晚上十点，周末不休息。' : '尚未收到服务端转写结果'}</p><button ${demoMode ? '' : 'disabled'}>修正文字</button></div><button class="primary" data-route="page-175">返回建档会话</button></section>`;
  if (view.page === 'page-178') {
    const projection = intakeProjection();
    return `<section class="mobile-sheet confirm-sheet"><h2>识别确认</h2><div class="completion"><b>${projection.completeness}%</b><span><strong>资料完整度</strong><small>${displayedFields().length} 项已有可追溯来源</small></span></div>${displayedFields()
      .map(
        ([k, v, c], i) =>
          `<label><span><small>${k}</small><input value="${v}" ${i < 3 ? 'readonly' : ''}/></span><em>${c}</em></label>`,
      )
      .join(
        '',
      )}<article class="impact"><b>${icon('warning')}</b><span><strong>确认会影响对外展示</strong><small>主体、公开电话和发布范围确认后才会进入交付。</small></span></article><label class="check"><input type="checkbox" data-action="consent"/> 我已核对主体、联系方式和发布影响</label><button class="primary" data-action="confirm" disabled>确认并进入交付</button></section>`;
  }
  return '';
}

function bottomNav() {
  const suffix = demoMode ? '?demo=1' : '';
  return `<nav class="bottom-nav"><a class="active" href="/bao/page-003${suffix}">${icon('chat')}<small>对话</small></a><a href="/bao/page-026${suffix}">${icon('work')}<small>工作</small></a><a href="/bao/page-004${suffix}">${icon('task')}<small>任务</small></a><a href="/bao/page-009${suffix}">${icon('message')}<small>消息</small></a><a href="/bao/page-012${suffix}">${icon('user')}<small>我的</small></a></nav>`;
}

function render() {
  document.body.dataset.mobilePage = String(view.mobile);
  const intake = intakePages.has(view.page);
  app.innerHTML = `<div class="shell">${sidebar()}<main>${topbar()}${statePanel()}${intake ? `<div class="workspace ${resultPanel.open ? '' : 'results-closed'}"><section class="chat"><div class="chat-heading"><div><h1>新商户资料建档</h1><p><i></i> 支持图片、PDF、门店定位与语音，系统自动整理</p></div>${demoMode ? `<button aria-label="更多">${icon('menu')}</button>` : ''}</div>${conversation()}${mobileSheet()}${composer()}</section>${results()}</div>` : genericWorkbenchPage()}${bottomNav()}</main></div>`;
  if (['denied', 'stopped', 'success'].includes(view.state))
    document.querySelector('.workspace')?.setAttribute('inert', '');
}

app.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!target) return;
  if (target.dataset.command) {
    void executeLiveCommand(target.dataset.command);
    return;
  }
  const route = target.dataset.route;
  if (route) {
    history.pushState({}, '', `/bao/${route}${location.search}`);
    view = viewFor(route);
    livePageState = { request: null, data: null };
    render();
    if (!demoMode && !intakePages.has(view.page)) void bootstrapLivePage();
    return;
  }
  if (target.dataset.action === 'back') {
    history.back();
    return;
  }
  if (target.dataset.action === 'open-results') {
    resultPanel = updateResultPanel(resultPanel, 'open');
    render();
    return;
  }
  if (target.dataset.action === 'close-results') {
    resultPanel = updateResultPanel(resultPanel, 'close');
    render();
    return;
  }
  if (target.dataset.action === 'result-tab') {
    resultPanel = updateResultPanel(resultPanel, 'tab', target.dataset.tab);
    render();
    return;
  }
  if (target.dataset.action === 'recover') {
    if (intakePages.has(view.page) && intakeApi) void bootstrapLive();
    else if (!demoMode) void bootstrapLivePage();
    else {
      view = { ...view, state: 'default' };
      render();
    }
    return;
  }
  if (target.dataset.action === 'choose-file') {
    document.querySelector('#intake-file')?.click();
    return;
  }
  if (target.dataset.action === 'record') {
    target.classList.toggle('recording');
    target.querySelector('strong').textContent = target.classList.contains('recording')
      ? '正在录音…'
      : '按住说话';
  }
  if (target.dataset.action === 'consent') return;
  if (target.dataset.action === 'confirm') {
    if (!intakeApi || !liveSession) {
      view = { ...view, state: demoMode ? 'success' : 'recoverable-failure' };
      render();
      return;
    }
    void confirmLiveSession(target);
  }
});
app.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.dataset.action === 'consent') {
    const confirm = document.querySelector('[data-action="confirm"]');
    if (confirm instanceof HTMLButtonElement) confirm.disabled = !event.target.checked;
  }
  if (event.target instanceof HTMLInputElement && event.target.id === 'intake-file') {
    const file = event.target.files?.[0];
    if (file) void uploadLiveFile(file);
  }
});
app.addEventListener('submit', (event) => {
  event.preventDefault();
  const textarea = document.querySelector('textarea');
  if (textarea?.value.trim()) void submitMessage(textarea);
});
addEventListener('popstate', () => {
  view = viewFor(resolvePage(location.pathname));
  livePageState = { request: null, data: null };
  render();
  if (!demoMode && !intakePages.has(view.page)) void bootstrapLivePage();
});
render();
if (!demoMode) {
  if (!sessionToken) {
    view = { ...view, state: 'denied' };
    render();
  } else if (intakePages.has(view.page)) {
    void bootstrapLive();
  } else {
    void bootstrapLivePage();
  }
}

async function bootstrapLivePage() {
  const request = resolveLivePageRequest(view.page, new URLSearchParams(location.search));
  livePageState = { request, data: null };
  if (!workbenchApi) {
    view = { ...view, state: 'denied' };
    render();
    return;
  }
  if (request.status === 'unsupported') {
    view = { ...view, state: 'stopped' };
    render();
    return;
  }
  if (request.status === 'missing-parameters') {
    view = { ...view, state: 'empty' };
    render();
    return;
  }
  view = { ...view, state: 'loading' };
  render();
  try {
    const data = await workbenchApi.get(request.path);
    livePageState = { request, data };
    view = {
      ...view,
      state: Array.isArray(data) && data.length === 0 ? 'empty' : 'default',
    };
  } catch (error) {
    livePageState = { request, data: null };
    view = {
      ...view,
      state:
        error instanceof ApiError && [401, 403].includes(error.status)
          ? 'denied'
          : error instanceof ApiError && error.status === 404
            ? 'empty'
            : 'recoverable-failure',
    };
  }
  render();
}

async function executeLiveCommand(commandId) {
  const command = (livePageState.request?.commands ?? []).find((item) => item.id === commandId);
  if (!command || !workbenchApi || view.state === 'loading') return;
  const commandForm = document.querySelector(`[data-command-form="${CSS.escape(commandId)}"]`);
  const inputBody = {};
  for (const input of command.inputs ?? []) {
    const control = commandForm?.querySelector(`[data-command-field="${CSS.escape(input.name)}"]`);
    const rawValue =
      control instanceof HTMLInputElement || control instanceof HTMLSelectElement
        ? control.value.trim()
        : '';
    if (!rawValue && input.required) {
      control?.focus();
      return;
    }
    if (!rawValue) continue;
    if (input.type === 'number') {
      const value = Number(rawValue);
      if (!Number.isSafeInteger(value)) {
        control?.focus();
        return;
      }
      inputBody[input.name] = value;
    } else if (input.type === 'datetime-local') {
      const value = new Date(rawValue);
      if (Number.isNaN(value.getTime())) {
        control?.focus();
        return;
      }
      inputBody[input.name] = value.toISOString();
    } else if (input.type === 'csv') {
      const values = rawValue
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      if (!values.length) {
        control?.focus();
        return;
      }
      inputBody[input.name] = values;
    } else if (input.type === 'json') {
      try {
        const value = JSON.parse(rawValue);
        if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
        inputBody[input.name] = value;
      } catch {
        control?.focus();
        return;
      }
    } else inputBody[input.name] = rawValue;
  }
  if (command.confirm && !globalThis.confirm(command.confirm)) return;
  view = { ...view, state: 'loading' };
  render();
  try {
    const data = await workbenchApi.post(command.path, { ...command.body, ...inputBody });
    livePageState = { ...livePageState, data };
    view = { ...view, state: 'success' };
  } catch (error) {
    view = {
      ...view,
      state:
        error instanceof ApiError && [401, 403].includes(error.status)
          ? 'denied'
          : 'recoverable-failure',
    };
  }
  render();
}

async function bootstrapLive() {
  if (!intakeApi) return;
  view = { ...view, state: 'loading' };
  render();
  try {
    const sessionId = params.get('sessionId');
    liveSession = sessionId
      ? await intakeApi.getSession(sessionId)
      : await intakeApi.createSession(view.mobile ? 'MOBILE_H5' : 'WEB');
    view = { ...view, state: liveSession.status === 'COMPLETED' ? 'success' : 'default' };
  } catch (error) {
    view = {
      ...view,
      state: error instanceof ApiError && [401, 403].includes(error.status) ? 'denied' : 'error',
    };
  }
  render();
}

async function submitMessage(textarea) {
  const content = textarea.value.trim();
  if (!content) return;
  const status = document.querySelector('.composer > small');
  if (status) status.textContent = '正在保存…';
  try {
    const mode = resolveIntakeMutationMode({
      demoMode,
      serviceAvailable: Boolean(intakeApi),
      sessionAvailable: Boolean(liveSession),
    });
    if (mode === 'blocked') throw new Error('authoritative intake session is unavailable');
    if (mode === 'live') await intakeApi.addMessage(liveSession.id, content);
    textarea.value = '';
    if (status)
      status.textContent =
        mode === 'simulate' ? '演示模式 · 未写入业务系统' : '已保存并进入识别队列';
  } catch {
    if (status) status.textContent = '保存失败，原内容仍在输入框，可重试';
  }
}

async function uploadLiveFile(file) {
  const item = document.querySelector('.upload-item');
  if (item)
    item.innerHTML = `<span>${escapeHtml(file.name)}</span><progress value="25" max="100">25%</progress><b>校验中</b>`;
  try {
    const mode = resolveIntakeMutationMode({
      demoMode,
      serviceAvailable: Boolean(intakeApi),
      sessionAvailable: Boolean(liveSession),
    });
    if (mode === 'blocked') throw new Error('authoritative intake session is unavailable');
    if (mode === 'live') await intakeApi.upload(liveSession.id, file);
    if (item)
      item.innerHTML = `<span>${escapeHtml(file.name)}</span><progress value="100" max="100">100%</progress><b>${mode === 'simulate' ? '仅演示' : '已入队'}</b>`;
    const status = document.querySelector('.composer > small');
    if (status)
      status.textContent =
        mode === 'simulate' ? '演示模式 · 文件未上传业务系统' : '文件已安全登记并进入扫描队列';
  } catch {
    if (item)
      item.innerHTML = `<span>${escapeHtml(file.name)}</span><progress value="0" max="100">0%</progress><b>可重试</b>`;
  }
}

async function confirmLiveSession(button) {
  const hasConflict = liveSession.fields.some((field) => field.decisionStatus === 'CONFLICT');
  if (hasConflict) {
    button.textContent = '请先修正冲突字段';
    return;
  }
  const legalCandidates = liveSession.fields.filter(
    (field) =>
      field.fieldPath.startsWith('merchant.') &&
      !field.fieldPath.startsWith('merchant.public_contact.') &&
      field.decisionStatus === 'PROPOSED',
  );
  if (legalCandidates.length === 0) return;
  button.disabled = true;
  button.textContent = '正在确认…';
  try {
    liveSession = await intakeApi.confirm(liveSession.id, {
      confirmationType: 'LEGAL_SUBJECT',
      confirmedPayload: Object.fromEntries(
        legalCandidates.map((field) => [field.fieldPath, field.candidateValue]),
      ),
      candidateIds: legalCandidates.map((field) => field.id),
      confirmationChannel: view.mobile ? 'MOBILE_CLICK' : 'WEB_CLICK',
      expectedVersion: liveSession.version,
    });
    const unresolved = liveSession.fields.some((field) =>
      ['PROPOSED', 'CONFLICT'].includes(field.decisionStatus),
    );
    if (unresolved || liveSession.missingItems.length > 0) {
      button.disabled = false;
      button.textContent = '仍有待确认或缺失字段';
      return;
    }
    await intakeApi.commit(liveSession.id, liveSession.version);
    view = { ...view, state: 'success' };
    render();
  } catch {
    button.disabled = false;
    button.textContent = '确认失败，请刷新后重试';
  }
}
