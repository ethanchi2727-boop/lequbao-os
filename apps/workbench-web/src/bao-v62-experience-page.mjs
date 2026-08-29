const apiDomainLabels = Object.freeze({
  adapter: '渠道适配',
  agent: '智能体',
  analytics: '经营分析',
  aftersale: '售后',
  attachment: '材料',
  attribution: '归因',
  audit: '审计',
  business: '经营',
  confirmation: '人工确认',
  cost: '成本',
  'cost-allocation': '成本分摊',
  customer: '客户',
  delivery: '交付',
  entitlement: '权益',
  fulfillment: '履约',
  geo: 'GEO',
  job: '任务',
  knowledge: '知识库',
  memory: '客户记忆',
  'merchant-intake': '商户建档',
  'merchant-master': '商户主档',
  miniapp: '小程序',
  'miniapp-release': '小程序发布',
  order: '订单',
  payment: '支付',
  permission: '权限',
  privacy: '隐私',
  receipt: '回执',
  release: '发布',
  report: '报表',
  revenue: '收益',
  'revenue-right': '收益权',
  'revenue-share': '分润',
  'reward-ledger': '激励台账',
  secret: '密钥',
  service: '客服',
  'service-message': '客服消息',
  assignment: '派单',
  subscription: '订阅',
  'subscription-ledger': '订阅台账',
  tenant: '租户',
  usage: '用量',
  'wechat-open': '微信开放',
});
const apiDomainLabel = (domain) => apiDomainLabels[domain] ?? '业务';

const deepPages = new Map([
  ['page-019', 5],
  ['page-020', 6],
  ['page-039', 5],
  ['page-040', 6],
  ['page-064', 5],
  ['page-065', 6],
  ['page-092', 5],
  ['page-093', 6],
  ['page-101', 5],
  ['page-102', 6],
  ['page-158', 5],
]);

function familyFor(page) {
  const number = Number(page.slice(5));
  if (number < 26) return 'ai';
  if (number < 41) return 'business';
  if (number < 66) return 'delivery';
  if (number < 94) return 'operations';
  if (number < 125) return 'service';
  if (number < 175) return 'governance';
  return 'mobile';
}

const familyLabels = Object.freeze({
  ai: ['AI 执行', 'logo'],
  business: ['商务经营', 'money'],
  delivery: ['交付控制', 'task'],
  operations: ['商家经营', 'shop'],
  service: ['客户服务', 'message'],
  governance: ['平台治理', 'network'],
  mobile: ['移动任务', 'work'],
});

export function renderBaoV62ExperiencePage({
  experience,
  contract,
  liveData,
  liveRequestKind,
  demoMode,
  state,
  escapeHtml,
  icon,
  renderLiveData,
}) {
  const family = familyFor(experience.page);
  const [familyLabel, familyIcon] = familyLabels[family];
  const level = deepPages.get(experience.page) ?? 4;
  const blocked = ['loading', 'denied', 'stopped', 'recoverable-failure'].includes(state);
  const facts = liveData
    ? renderLiveData(liveData, liveRequestKind)
    : demoMode
      ? `<div class="v62-page__preview">${experience.panels
          .map(
            ([title, description], index) =>
              `<article><b>${String(index + 1).padStart(2, '0')}</b><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span></article>`,
          )
          .join('')}</div>`
      : state === 'loading'
        ? '<div class="loading-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>'
        : '<div class="v62-page__protected"><strong>等待权威业务数据</strong><p>当前页面不会展示演示记录。完成身份、租户、角色与资源范围校验后，服务端结果才会出现在这里。</p></div>';
  const actions = experience.actions
    .map(
      ([label, route], index) =>
        `<button class="${index === 0 ? 'primary' : ''}" data-route="${escapeHtml(route)}" ${blocked ? 'disabled' : ''}>${escapeHtml(label)} ${icon('back')}</button>`,
    )
    .join('');
  return `<section class="v62-page v62-page--${family}" data-page-id="${contract.id}" data-layout="${escapeHtml(experience.layout)}" data-level="${level}">
    <header class="v62-page__hero"><div class="v62-page__mark">${icon(familyIcon)}</div><div><small>${escapeHtml(experience.kicker)}</small><h1>${escapeHtml(experience.headline)}</h1><p>${escapeHtml(experience.description)}</p></div><span class="v62-page__mode">${demoMode ? '演示结构' : '权威数据模式'}</span></header>
    <div class="v62-page__scope"><b>${escapeHtml(familyLabel)}</b><span>${escapeHtml(contract.primaryRole)}</span>${contract.apiDomains.map((domain) => `<em>${escapeHtml(apiDomainLabel(domain))}</em>`).join('')}<i>服务端权限最终裁决</i></div>
    <div class="v62-page__workspace"><article class="v62-page__facts"><header><span><small>${liveData ? '实时业务事实' : '受保护内容区'}</small><strong>${escapeHtml(contract.title)}</strong></span><b>${String(level).padStart(2, '0')} 级任务</b></header>${facts}</article>
      <aside class="v62-page__path"><header><small>任务路径</small><strong>完成当前工作的关键步骤</strong></header><ol>${experience.panels
        .map(
          ([title, description], index) =>
            `<li><b>${String(index + 1).padStart(2, '0')}</b><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(description)}</small></span></li>`,
        )
        .join('')}</ol></aside></div>
    <aside class="v62-page__guardrail">${icon(level >= 5 ? 'warning' : 'check')}<span><small>${level >= 5 ? '深层任务控制' : '执行边界'}</small><strong>${escapeHtml(experience.guardrail)}</strong></span></aside>
    <footer class="v62-page__actions"><nav>${actions}</nav><a href="/bao/page-170${demoMode ? '?demo=1' : ''}">${icon('help')} 帮助与审计</a><small>${escapeHtml(contract.acceptance)}</small></footer>
  </section>`;
}
