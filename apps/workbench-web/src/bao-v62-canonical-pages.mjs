const merchantRows = [
  ['拾味小馆', '餐饮', '正常订阅', '¥1,263.40', '交付中'],
  ['云峰会所', '生活服务', '企业诊断', '¥2,480.00', '待确认'],
  ['江南小馆', '餐饮', '正常订阅', '¥2,698.51', '持续运营'],
  ['叶子花店', '零售', '资料待补', '¥1,118.73', 'AI跟进中'],
];

function ring(value, label) {
  return `<div class="v62-ring" style="--v62-progress:${value * 3.6}deg"><div><b>${value}%</b><small>${label}</small></div></div>`;
}

function pageHeader(kicker, title, description, action = '') {
  return `<header class="v62-page-header"><div><small>${kicker}</small><h1>${title}</h1><p>${description}</p></div>${action}</header>`;
}

function aiWorkspace(icon) {
  return `<section class="v62-canonical v62-ai-workspace" data-v62-master="PC_CANONICAL_AI_WORKSPACE">
    <div class="v62-ai-main">
      ${pageHeader('AI 执行会话 · 自动保存', '为拾味小馆完成上线前核验', '小满正在调用商户资料、微信开放平台与 GEO 工具', '<span class="v62-source-chip">12 个来源</span>')}
      <div class="v62-thread"><time>今天 10:24</time><p class="v62-user-bubble">检查拾味小馆的开通资料，把缺项补齐。可以自动完成的直接做，需要商家决定的再让我确认。</p>
        <article class="v62-agent-result"><i>${icon('logo')}</i><div><span class="v62-agent-name">乐趣宝 AI <em>执行完成</em></span><h2>上线前核验已完成，2 项需要确认</h2><p>系统已交叉核对营业执照、门店定位、套餐权益和公开资料。未发现主体冲突，支付账户仍需商家本人授权。</p>
          <div class="v62-metrics"><div><small>资料完整度</small><b>92%</b><em>+18%</em></div><div><small>已核验来源</small><b>12</b><em>4 类文件</em></div><div><small>自动完成</small><b>7 项</b><em>均可回滚</em></div><div><small>风险项目</small><b>2 项</b><em class="warning">等待确认</em></div></div>
          <div class="v62-decision"><i>${icon('check')}</i><span><small>关键确认</small><b>商家支付账户与小程序名称</b><p>这两项涉及主体授权和对外展示，AI 不会代替商家决定。</p></span><button data-route="page-054">打开确认单 ${icon('back')}</button></div>
        </div></article>
      </div>
      <div class="v62-composer"><span>继续说，或把新资料直接拖进来…</span><button aria-label="发送">${icon('send')}</button><small>涉及付款、发布和公开内容时，系统会再次要求确认</small></div>
    </div>
    <aside class="v62-context"><nav><b>任务</b><span>成果 4</span><span>来源 12</span></nav><div class="v62-progress-card"><span><small>商户开通任务</small><b>拾味小馆 · 基础版</b><em>预计还需 6 分钟</em></span>${ring(72, '总体进度')}</div>
      <ol class="v62-timeline"><li class="done"><i>${icon('check')}</i><span><b>资料识别与合并</b><small>21 项字段 · 10:25</small></span></li><li class="done"><i>${icon('check')}</i><span><b>主体与套餐核验</b><small>规则版本 6.2 · 10:27</small></span></li><li class="active"><i>3</i><span><b>商家关键确认</b><small>正在等待商家授权</small></span></li><li><i>4</i><span><b>生成体验版</b><small>确认后自动继续</small></span></li><li><i>5</i><span><b>发布与交付</b><small>支持一键回滚</small></span></li></ol>
      <div class="v62-confirm"><small>需要你的确认</small><b>是否向商家发送授权链接？</b><p>链接 24 小时有效，只允许企业管理员本人操作。</p><div><button>稍后处理</button><button class="primary" data-route="page-054">确认发送</button></div></div>
    </aside>
  </section>`;
}

function businessCenter(icon) {
  const bars = [42, 54, 49, 67, 76, 92]
    .map(
      (height, index) =>
        `<i style="--v62-bar:${height}%"><b>${index === 5 ? '¥43,736' : ''}</b><small>${index + 3}月</small></i>`,
    )
    .join('');
  return `<section class="v62-canonical v62-business" data-v62-master="PC_CANONICAL_BUSINESS_CENTER">
    ${pageHeader('商务经营中心', '持续服务的每一家商户，都成为你的长期收益', '商户归属权、服务状态和月度收益在同一套账本中清晰可追溯。', `<button class="v62-primary" data-route="page-049">${icon('logo')} AI 开通新商户</button>`)}
    <div class="v62-kpis"><article class="dark"><small>本月预计商务收益</small><b>¥43,736.00</b><span>较上月 +8.6% · 待财务锁定</span></article><article><small>持续订阅商户</small><b>48</b><span>本月净增 6 家</span></article><article><small>本月可分配净收入</small><b>¥62,480</b><span>已扣除直接成本</span></article><article><small>需要跟进</small><b>4</b><span class="warning">2 家即将到期</span></article></div>
    <div class="v62-business-charts"><article><header><span><b>持续收益趋势</b><small>近 6 个月 · 已扣除退款与直接成本</small></span><button data-route="page-037">查看完整报表</button></header><div class="v62-bars">${bars}</div></article><article><header><span><b>本月分配结构</b><small>净收入池 ¥62,480</small></span></header><div class="v62-allocation">${ring(70, '商务份额')}<ul><li><i class="ai"></i><span>商务人员</span><b>¥43,736</b></li><li><i></i><span>尚智</span><b>¥6,248</b></li><li><i class="warning"></i><span>平台主体</span><b>¥12,496</b></li></ul></div><footer>${icon('check')} 永久收益权与数据访问权相互独立</footer></article></div>
    <article class="v62-merchant-table"><header><span><b>我的商户组合</b><small>共 52 家已确权商户</small></span><nav><b>全部 52</b><span>正常订阅 48</span><span>待跟进 4</span></nav></header><div class="head"><span>商户</span><span>行业</span><span>订阅状态</span><span>本月我的预估</span><span>当前进展</span></div>${merchantRows.map((row) => `<button data-route="page-027"><span class="merchant"><i>${row[0][0]}</i><b>${row[0]}<small>永久归属 · 经营 Agent 已启用</small></b></span><span>${row[1]}</span><span>${row[2]}</span><b>${row[3]}</b><em>${row[4]} ›</em></button>`).join('')}</article>
  </section>`;
}

function deliveryTower(icon) {
  const projects = [
    ['拾味小馆', 72, '进行中'],
    ['云峰会所', 46, '待确认'],
    ['江南小馆', 100, '已上线'],
  ];
  return `<section class="v62-canonical v62-delivery" data-v62-master="PC_CANONICAL_DELIVERY_TOWER">
    ${pageHeader('AI 交付控制中心', '每一次交付都可视、可控、可验收', '标准商户交付与企业 AI 升级，共用同一套任务、权限、成本和验收底座。', '<button class="v62-primary" data-route="page-052">+ 新建项目</button>')}
    <div class="v62-delivery-grid"><aside class="v62-projects"><h2>进行中的项目 <small>3 项需要处理</small></h2>${projects.map(([name, progress, status], index) => `<button class="${index === 0 ? 'active' : ''}" data-route="page-053"><span><i>${name[0]}</i><b>${name}<small>标准云端交付</small></b><em>${status}</em></span><progress max="100" value="${progress}">${progress}%</progress><footer><b>${progress}%</b><small>${progress === 100 ? '8 月 18 日已上线' : '预计今天完成'}</small></footer></button>`).join('')}</aside>
      <main class="v62-project-focus"><header><span><small>标准云端交付 · LQ-260825-018</small><h2>拾味小馆 · 基础版开通</h2><p>已完成资料建档和 GEO 初稿，等待商家完成支付账户授权。</p><em>预计今天 16:30 完成 · 可随时回滚</em></span>${ring(72, '交付进度')}</header><article><h3>自动交付流水线 <small>5 个阶段 · 18 个自动任务</small></h3><ol class="v62-timeline"><li class="done"><i>${icon('check')}</i><span><b>AI 资料建档</b><small>21 项信息已核验</small></span></li><li class="done"><i>${icon('check')}</i><span><b>经营知识生成</b><small>菜单、问答与门店画像</small></span></li><li class="active"><i>3</i><span><b>商家授权确认</b><small>支付账户等待本人授权</small></span><button data-route="page-054">发送提醒</button></li><li><i>4</i><span><b>小程序与 GEO 生成</b><small>确认后自动继续</small></span></li><li><i>5</i><span><b>验收与正式发布</b><small>发布前必须人工确认</small></span></li></ol></article><div class="v62-assets"><span><i>商</i><b>商家小程序<small>体验版已生成</small></b></span><span><i class="ai">AI</i><b>AI 经营工作台<small>3 个 Agent 已配置</small></b></span><span><i>↑</i><b>GEO 增长资料<small>完成度 84%</small></b></span></div></main>
      <aside class="v62-gates"><h2>发布门禁 <em>4/5</em><small>任何红线未通过都禁止发布</small></h2><ul><li>${icon('check')}<span><b>主体与名称</b><small>已与商家确认证照关系</small></span></li><li>${icon('check')}<span><b>公开内容</b><small>菜单、电话与价格已确认</small></span></li><li>${icon('check')}<span><b>隐私与 AI 标识</b><small>AI 生成内容已明确标注</small></span></li><li class="blocked">${icon('clock')}<span><b>支付账户</b><small>等待商家管理员授权</small></span></li><li>${icon('check')}<span><b>回滚与审计</b><small>已生成发布前快照</small></span></li></ul><div><small>当前未通过</small><b>支付账户未授权</b><p>系统不会跳过主体授权，也不会代收商家消费款。</p></div><button disabled>门禁全部通过后发布</button><button data-route="page-054">打开商家确认链接</button></aside></div>
  </section>`;
}

export function renderBaoV62CanonicalPage({ page, icon }) {
  if (page === 'page-004') return aiWorkspace(icon);
  if (page === 'page-026') return businessCenter(icon);
  if (page === 'page-053') return deliveryTower(icon);
  return null;
}
