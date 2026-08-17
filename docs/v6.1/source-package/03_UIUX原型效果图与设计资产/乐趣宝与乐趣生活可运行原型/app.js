const app = document.querySelector('#app');

function icon(name, cls = '') {
  const p = {
    logo:'<path d="M12 2.6 13.8 9l6.2 1.8-6.2 1.8L12 19l-1.8-6.4L4 10.8 10.2 9Z"/><circle cx="19" cy="5" r="1.2"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    chat:'<path d="M21 14.5a4 4 0 0 1-4 4H9l-5 3v-14a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4Z"/>',
    work:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 4V2M16 4V2M3 9h18M8 13h3M8 17h7"/>',
    store:'<path d="M4 10v11h16V10M3 4h18l-2 6a3 3 0 0 1-5 1 3 3 0 0 1-4 0 3 3 0 0 1-5-1Z"/><path d="M9 21v-6h6v6"/>',
    bag:'<path d="M6 8h12l1 13H5Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
    bot:'<rect x="4" y="7" width="16" height="13" rx="4"/><path d="M12 3v4M8 12h.01M16 12h.01M8 16h8"/>',
    map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',
    plug:'<path d="m8 12 8-8M14 2l8 8M3 21l6-6M4 11l9 9M9 16l-4 4"/>',
    skill:'<path d="M12 3a7 7 0 0 0-4 12.7V19h8v-3.3A7 7 0 0 0 12 3Z"/><path d="M9 22h6M9 19h6M12 7v5M9.5 9.5h5"/>',
    file:'<path d="M6 2h9l4 4v16H6Z"/><path d="M14 2v5h5M9 13h6M9 17h6"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    user:'<circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>',
    dots:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
    clip:'<path d="m21 11-8.8 8.8a6 6 0 0 1-8.4-8.4l9.5-9.5a4 4 0 0 1 5.6 5.6L9.4 17a2 2 0 0 1-2.8-2.8L15.4 5"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
    mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>',
    arrow:'<path d="m6 12 6-6 6 6M12 6v13"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    warning:'<path d="M10.3 3.8 2.6 17a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
    qr:'<path d="M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM15 14h2v2h-2ZM19 14h2v4h-2ZM14 19h3v2h-3ZM19 20h2v1h-2Z"/>',
    refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M6 9a7 7 0 0 1 12-2l2 4M18 15a7 7 0 0 1-12 2l-2-4"/>',
    pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    home:'<path d="m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    cart:'<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.5 11a2 2 0 0 0 2 1.6h8a2 2 0 0 0 2-1.6L21 8H7"/>',
    location:'<path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    scan:'<path d="M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 8h8v8H8Z"/>',
    left:'<path d="m15 18-6-6 6-6"/>',
    right:'<path d="m9 18 6-6-6-6"/>',
    star:'<path d="m12 2 3 6 6.5 1-4.7 4.6 1.1 6.5-5.9-3.1-5.9 3.1 1.1-6.5L2.5 9 9 8Z"/>',
    heart:'<path d="M20.8 5a5.2 5.2 0 0 0-7.4 0L12 6.4 10.6 5a5.2 5.2 0 0 0-7.4 7.4L12 21l8.8-8.6A5.2 5.2 0 0 0 20.8 5Z"/>',
    truck:'<path d="M10 17h4V5H2v12h3M14 9h4l4 4v4h-3"/><circle cx="7.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="17.5" r="2.5"/>'
  };
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${p[name] || p.logo}</svg>`;
}

function baoSidebar(active='交付中心', dark=false) {
  const items = [
    ['对话','chat'],['商户交付','work'],['门店经营','store'],['团购与核销','bag'],
    ['AI客服','bot'],['AI搜索获客','map'],['插件与技能','plug'],['成果文件','file']
  ];
  return `<aside class="bao-side ${dark?'dark-side':''}">
    <div class="bao-brand"><span>${icon('logo')}</span><div><b>乐趣宝</b><small>AI经营工作台</small></div></div>
    <button class="new-task">${icon('plus')} 新建任务 <kbd>Ctrl N</kbd></button>
    <div class="side-search">${icon('search')} 搜索 <kbd>Ctrl K</kbd></div>
    <nav>${items.map(([n,i])=>`<div class="side-link ${n.includes(active)||active===n?'active':''}">${icon(i)}<span>${n}</span>${n==='商户交付'?'<em>3</em>':''}</div>`).join('')}</nav>
    <div class="side-label">最近任务</div>
    <div class="recent active-dot"><i></i>拾味小馆一键开通</div>
    <div class="recent">南京茶里巷资料补齐</div>
    <div class="recent">本月商户价值报告</div>
    <div class="side-grow"></div>
    <div class="identity-card"><span class="avatar">周</span><div><b>周子涵</b><small>南京区商务 · 仅本区数据</small></div>${icon('dots')}</div>
  </aside>`;
}

function topbar(title, dark=false) {
  return `<header class="bao-top"><div class="crumb"><span>乐趣生活南京区</span><i>›</i><b>${title}</b></div>
    <div class="top-controls"><span class="saved">${icon('check')} 已保存</span><button class="mode-chip">快速执行⌄</button><button class="ghost-chip">${icon('clock')} 后台任务 2</button><button class="square">${icon('share')}</button><button class="square">${icon('dots')}</button></div></header>`;
}

function composer(text='继续输入要求，或使用 / 调用命令……') {
  return `<div class="composer"><p>${text}</p><div class="compose-bottom"><div><button>${icon('plus')}</button><button>${icon('clip')}</button><button class="tool-toggle on">${icon('globe')} 联网</button><button class="tool-toggle">${icon('skill')} 技能</button><button class="tool-toggle">${icon('plug')} 插件</button><button>${icon('mic')}</button></div><button class="send">${icon('arrow')}</button></div><span class="slash-note">支持 /命令、@引用、附件、语音与排队发送</span></div>`;
}

function deliveryPanel() {
  const services = [
    ['商家独立小程序','标准模板 · 商家自有 AppID','体验版已生成','bag','done'],
    ['AI搜索获客','公开信息页与GEO资料','资料 92%','map','running'],
    ['AI经营工作台','1名管理员 · 2名员工 · 6插件','待创建','work','wait'],
    ['小程序AI客服','知识42条 · 测试9/10','待测试','bot','wait']
  ];
  return `<section class="conversation">
    <div class="thread-head"><div><h1>为拾味小馆开通乐趣宝</h1><p><span class="live"></span>任务正在后台执行 · 离开页面也不会中断</p></div><button class="thread-menu">${icon('dots')}</button></div>
    <div class="user-message">帮我为拾味小馆开通898元基础版，用商家自己的 AppID 生成带团购和AI客服的小程序，完成GEO与AI工作台。发布前让我确认。</div>
    <div class="assistant-message"><div class="ai-mark">${icon('logo')}</div><div class="ai-content">
      <div class="ai-title"><b>已开始一键交付</b><span class="status-running"><i></i>执行中</span></div>
      <p>已核对订阅、营业执照、门店定位和商家授权。系统会自动创建组织、配置权限并生成体验版；商家确认后再提交微信审核，审核时间不计入自动配置时长。</p>
      <div class="merchant-summary"><div><span>商家</span><b>拾味小馆 · 新街口店</b></div><div><span>套餐</span><b>基础版 ¥898/月</b></div><div><span>授权</span><b class="green">已由商家确认</b></div><div><span>资料</span><b>完整度 96%</b></div></div>
      <div class="service-grid">${services.map(([n,d,s,i,st])=>`<div class="service-card ${st}"><span class="service-icon">${icon(i)}</span><div><b>${n}</b><p>${d}</p></div><em>${st==='done'?'✓ ':''}${s}</em></div>`).join('')}</div>
      <div class="exec-mini"><div class="exec-title"><b>执行轨迹</b><button>查看工具详情</button></div>
        ${[['创建商家组织','已完成','done'],['生成小程序体验版','已完成','done'],['建立GEO信息资产','发布中 8/12','run'],['配置小程序AI客服','等待测试','wait'],['创建经营工作台','等待执行','wait']].map(([n,s,c])=>`<div class="exec-row"><i class="${c}">${c==='done'?'✓':''}</i><b>${n}</b><span>${s}</span></div>`).join('')}
      </div>
      <div class="message-actions"><button>复制</button><button>查看来源</button><button>执行轨迹</button><button>重新生成</button><button>⋯</button></div>
    </div></div>
    ${composer('补充资料、修改交付范围，或告诉我发布后的通知方式……')}
  </section>`;
}

function taskResultPanel() {
  return `<aside class="task-panel"><div class="panel-tabs"><button class="active">任务 <em>1</em></button><button>成果 <em>4</em></button><button>来源 <em>12</em></button><button class="panel-close">×</button></div>
    <div class="panel-body"><div class="panel-title"><div><span>商户一键交付</span><h2>拾味小馆 · 基础版</h2></div><span class="progress-ring">58%</span></div>
      <div class="progress-line"><i></i></div><div class="progress-meta"><span>已完成 2 / 5 项</span><span>预计还需 4 分钟</span></div>
      <div class="panel-section"><div class="section-title"><b>已生成成果</b><span>随任务更新</span></div>
        <div class="artifact"><span class="artifact-icon green-bg">${icon('store')}</span><div><b>拾味小馆小程序体验版</b><small>商家 AppID · 团购 · 核销 · AI客服</small></div><button>预览</button></div>
        <div class="artifact"><span class="artifact-icon blue-bg">${icon('globe')}</span><div><b>公开商家信息页</b><small>结构化资料 · 地图 · 常见问答</small></div><button>查看</button></div>
        <div class="artifact dim"><span class="artifact-icon purple-bg">${icon('work')}</span><div><b>AI经营工作台</b><small>管理员、员工与6个插件待创建</small></div><button>生成中</button></div>
        <div class="artifact dim"><span class="artifact-icon orange-bg">${icon('bot')}</span><div><b>小程序AI客服测试入口</b><small>配置完成后自动出现</small></div><button>等待</button></div>
      </div>
      <div class="approval"><div class="approval-head">${icon('warning')} <b>提交微信审核前需要确认</b></div><p>确认后将提交小程序体验版、公开商家资料，并启用员工待办通知；微信是否通过及名称是否可用以官方审核为准。</p><dl><div><dt>执行对象</dt><dd>拾味小馆 · 商家自有 AppID</dd></div><div><dt>外部影响</dt><dd>微信审核、公开页面、员工通知</dd></div><div><dt>可撤销</dt><dd>发布后可回滚到上一稳定模板</dd></div></dl><button class="approve">商家已确认，提交审核</button><button class="secondary">先继续测试体验版</button></div>
      <div class="panel-foot">${icon('check')} 每一步均留存来源、权限与执行回执</div>
    </div>
  </aside>`;
}

function baoDelivery() {
  return `<section class="bao-app">${baoSidebar('商户交付')}<main class="bao-main">${topbar('拾味小馆一键开通')}<div class="workspace">${deliveryPanel()}${taskResultPanel()}</div></main></section>`;
}

function sparkBars(values, labels) {
  return `<div class="bars">${values.map((v,i)=>`<div class="bar-col"><i style="height:${v}%"><b>${i===values.length-1?'¥12,860':''}</b></i><span>${labels[i]}</span></div>`).join('')}</div>`;
}

function merchantPanel() {
  return `<section class="conversation merchant-convo"><div class="thread-head"><div><h1>本周经营复盘与周末团购</h1><p><span class="live"></span>福满楼餐饮 · 店主工作区</p></div><button class="thread-menu">${icon('dots')}</button></div>
    <div class="user-message">看看本周经营情况，找出复购下降原因，再给我做一个周末家庭团购。先给方案，不要直接发布。</div>
    <div class="assistant-message"><div class="ai-mark">${icon('logo')}</div><div class="ai-content"><div class="ai-title"><b>复购问题已定位，团购草案已生成</b><span class="status-done">${icon('check')} 已完成</span></div>
      <p>客流没有明显下降，问题主要发生在首次核销后的二次承接。18位高价值会员超过21天未回访，31位新客核销后没有收到二次到店提醒。</p>
      <div class="metric-grid"><div><span>本周实收</span><b>¥68,420</b><em class="up">↑ 6.8%</em></div><div><span>团购核销</span><b>326</b><em class="up">↑ 12.4%</em></div><div><span>会员复购</span><b>28.6%</b><em class="down">↓ 8.3%</em></div><div><span>客服接待</span><b>184</b><em>转人工 9</em></div></div>
      <div class="chart-card"><div><b>近7日实收趋势</b><span>订单 / 团购 / 消费奖励已核对</span></div>${sparkBars([42,55,48,72,61,76,88],['一','二','三','四','五','六','日'])}</div>
      <div class="recommend"><span class="rec-number">01</span><div><b>先补上核销后的承接</b><p>为31位新客生成二次到店提醒，按家庭、朋友聚餐两类内容分组。</p></div><button>加入执行计划</button></div>
      <div class="recommend"><span class="rec-number">02</span><div><b>周末家庭团购草案</b><p>4人套餐 ¥168，预计毛利34%，建议限量80份，周五17:00发布。</p></div><button>在成果中编辑</button></div>
      <div class="message-actions"><button>复制</button><button>查看来源</button><button>执行轨迹</button><button>继续</button><button>⋯</button></div>
    </div></div>${composer()}
  </section>`;
}

function merchantResult() {
  return `<aside class="task-panel merchant-result"><div class="panel-tabs"><button>任务 <em>2</em></button><button class="active">成果 <em>1</em></button><button>来源 <em>9</em></button><button class="panel-close">×</button></div><div class="panel-body">
    <div class="result-doc-head"><span>可编辑成果</span><h2>周末家庭欢聚套餐</h2><p>草案已保存 · 尚未发布</p></div>
    <div class="cover-card"><span>周末限定</span><h3>一家人，吃顿热乎的</h3><p>招牌4人餐 · 6菜1汤 · 到店核销</p><b><small>¥</small>168 <del>门市价 ¥238</del></b></div>
    <div class="doc-block"><div class="section-title"><b>活动设置</b><button>编辑</button></div><dl class="setting-list"><div><dt>销售时间</dt><dd>周五17:00—周日20:00</dd></div><div><dt>库存</dt><dd>80份 · 每桌限购1份</dd></div><div><dt>核销</dt><dd>购买后7天内到店使用</dd></div><div><dt>预计毛利</dt><dd>34% · 风险在可控范围</dd></div></dl></div>
    <div class="source-note">${icon('file')} 依据：近8周套餐核销、菜品成本、会员偏好与退款记录</div>
    <div class="bottom-actions"><button>继续修改</button><button class="primary">创建发布任务</button></div>
  </div></aside>`;
}

function baoMerchant() {
  return `<section class="bao-app">${baoSidebar('门店经营')}<main class="bao-main">${topbar('本周经营复盘')}<div class="workspace">${merchantPanel()}${merchantResult()}</div></main></section>`;
}

function ecosystemCards() {
  const cards = [
    ['商户一键交付','官方','把小程序、GEO、工作台与AI客服自动交付给商家','商家开通','4.9','12.6k','work','installed'],
    ['餐饮门店GEO增长包','乐趣认证','持续维护门店结构化信息，并监测智能搜索可检索状态','获客增长','4.8','6.2k','map',''],
    ['团购活动生成器','官方','结合成本、库存与客群，生成可审核的团购活动','团购经营','4.9','18.3k','bag','installed'],
    ['客服知识库体检','社区开发者','发现过期话术、低置信回答和应转人工的问题','客服接待','4.7','3.8k','bot',''],
    ['门店经营周报','社区开发者','把订单、会员、团购与消费奖励整理为经营周报','数据分析','4.8','9.1k','file',''],
    ['爆款短视频脚本','乐趣认证','按行业与门店卖点，批量生成短视频脚本草案','内容营销','4.6','2.9k','logo','pro']
  ];
  return `<div class="eco-grid">${cards.map(c=>`<div class="eco-card"><div class="eco-card-top"><span class="eco-icon">${icon(c[6])}</span><div><b>${c[0]}</b><small>${c[1]} · v2.4.1</small></div>${c[7]==='installed'?'<em class="installed">已安装</em>':c[7]==='pro'?'<em class="pro">专业版</em>':''}</div><p>${c[2]}</p><div class="eco-tags"><span>${c[3]}</span><span>低风险</span></div><div class="eco-card-bottom"><span>${icon('star')} ${c[4]} · ${c[5]}次使用</span><button>${c[7]==='installed'?'打开':'查看详情'}</button></div></div>`).join('')}</div>`;
}

function ecosystemDetail() {
  return `<aside class="eco-detail"><div class="eco-detail-head"><span class="eco-big-icon">${icon('map')}</span><div><span>乐趣认证</span><h2>餐饮门店GEO增长包</h2><p>版本 2.4.1 · 2026-08-10 更新</p></div><button>×</button></div>
    <div class="eco-rating"><b>4.8</b><span>${icon('star')}${icon('star')}${icon('star')}${icon('star')}${icon('star')}<small>1,286条评价</small></span><em>成功率 98.6%</em></div>
    <div class="eco-section"><h3>它会帮你做什么</h3><p>把商家名称、地址、营业时间、服务、团购与常见问答整理成适合智能搜索理解的信息资产，并持续监测资料一致性与可检索状态。</p></div>
    <div class="eco-section"><h3>需要的权限</h3><div class="permission"><i class="low"></i><div><b>读取门店公开资料</b><span>名称、电话、地址、营业时间、商品与服务</span></div></div><div class="permission"><i class="medium"></i><div><b>发布公开商家信息页</b><span>每次对外发布前均需要管理员确认</span></div></div><div class="permission"><i class="low"></i><div><b>定期运行收录监测</b><span>每周一次，不读取消费者隐私数据</span></div></div></div>
    <div class="eco-section compact"><h3>适用与计费</h3><dl><div><dt>适用行业</dt><dd>餐饮、茶饮、烘焙</dd></div><div><dt>套餐</dt><dd>基础版内含</dd></div><div><dt>算力</dt><dd>预计 6—12点/次</dd></div><div><dt>支持</dt><dd>开发者 7×12 小时</dd></div></dl></div>
    <div class="review-strip">${icon('check')} 已通过权限审查、沙箱测试与人工评测，可随时停用或回滚。</div>
    <div class="eco-actions"><button>查看更新记录</button><button class="primary">安装并授权</button></div>
  </aside>`;
}

function baoEcosystem() {
  return `<section class="bao-app eco-app">${baoSidebar('插件与技能',true)}<main class="bao-main">${topbar('插件与技能中心',true)}<div class="eco-workspace"><section class="eco-main"><div class="eco-title"><div><span>开放能力生态</span><h1>把好用的经营实践，变成所有人都能复用的能力</h1><p>插件连接真实业务，技能沉淀最佳实践；全部经过权限审查、评测和版本管理。</p></div><button>${icon('plus')} 发布我的技能</button></div><div class="eco-search">${icon('search')} 搜索插件、技能、行业方案和开发者 <kbd>Ctrl K</kbd></div><div class="eco-tabs"><button class="active">精选</button><button>商家开通</button><button>获客增长</button><button>客服接待</button><button>团购经营</button><button>内容营销</button><button>数据分析</button><button>已安装 12</button></div>${ecosystemCards()}</section>${ecosystemDetail()}</div></main></section>`;
}

function phoneStatus() { return `<div class="phone-status"><span>9:41</span><span>▮▮▮　Wi‑Fi　●</span></div>`; }

function baoMobileTop(title, sub='南京区商务') {
  return `<div class="m-top"><button>${icon('left')}</button><div><b>${title}</b><small>${sub}</small></div><button>${icon('plus')}</button></div>`;
}

function baoMobileBottom(active='工作') {
  const data=[['对话','chat'],['工作','work'],['任务','clock'],['消息','bell'],['我的','user']];
  return `<nav class="m-bottom">${data.map(([n,i])=>`<div class="${n===active?'active':''}">${icon(i)}<span>${n}</span></div>`).join('')}</nav>`;
}

function mobilePhone(content, active='工作') {
  return `<div class="bao-phone"><div class="bao-phone-screen">${phoneStatus()}${content}${baoMobileBottom(active)}</div></div>`;
}

function mCapture() {
  return mobilePhone(`${baoMobileTop('开通新商户')}<div class="m-scroll"><div class="m-step"><b>1</b><span>识别商户资料</span><em>预计1分钟</em></div><div class="capture-card"><div class="scan-corner tl"></div><div class="scan-corner tr"></div><div class="scan-corner bl"></div><div class="scan-corner br"></div><span>${icon('scan')}</span><b>拍营业执照或门店招牌</b><p>系统自动识别名称、地址、行业与经营范围</p><button>拍照识别</button></div><div class="or-line"><span>或</span></div><div class="m-option">${icon('location')}<div><b>转发微信门店定位</b><p>自动获取地址和坐标</p></div>${icon('right')}</div><div class="m-option">${icon('clip')}<div><b>上传已有商家资料</b><p>支持图片、PDF与表格</p></div>${icon('right')}</div><div class="smart-note">${icon('logo')} 缺少的资料会生成商家自助补充链接，无需你手工录入。</div></div>`, '工作');
}

function mConfirm() {
  const rows=[['商家独立小程序','自有AppID','bag'],['AI搜索获客','资料92%','map'],['AI经营工作台','6个插件','work'],['小程序AI客服','知识42条','bot']];
  return mobilePhone(`${baoMobileTop('拾味小馆','资料完整度 96%')}<div class="m-scroll"><div class="package-card"><span>乐趣宝基础版</span><b>¥898<small>/月</small></b><em>${icon('check')} 已订阅 · 商家已授权</em></div><h3 class="m-section-title">将开通4项核心服务</h3><div class="m-service-list">${rows.map(r=>`<div><span>${icon(r[2])}</span><b>${r[0]}</b><em>${r[1]}</em>${icon('check')}</div>`).join('')}</div><div class="m-summary"><div><span>管理员</span><b>陈海 · 138****6821</b></div><div><span>服务期</span><b>2026.08.15—09.14</b></div><div><span>自动配置</span><b>约6—10分钟</b></div></div><button class="m-primary">一键生成并配置</button><p class="m-fine">微信审核时间另计，发布前需要商家确认</p></div>`, '工作');
}

function mProgress() {
  const steps=[['创建商家组织','完成','done'],['生成小程序体验版','完成','done'],['建立GEO信息资产','8/12','run'],['配置小程序AI客服','等待','wait'],['创建经营工作台','等待','wait']];
  return mobilePhone(`${baoMobileTop('正在一键交付','后台任务 · 可离开')}<div class="m-scroll"><div class="m-progress-hero"><span class="m-progress-ring">58%</span><b>正在建立GEO信息资产</b><p>已完成2项，预计还需4分钟</p><div><i></i></div></div><div class="m-task-list">${steps.map(s=>`<div class="${s[2]}"><i>${s[2]==='done'?'✓':''}</i><b>${s[0]}</b><span>${s[1]}</span></div>`).join('')}</div><div class="m-drawer"><div class="m-drawer-tabs"><b class="active">任务</b><b>成果 2</b><b>来源 12</b></div><div class="m-current"><span>${icon('globe')}</span><div><b>公开信息页正在发布</b><p>第8项：生成常见问答结构</p></div><em>查看</em></div></div><div class="m-row-actions"><button>${icon('pause')} 暂停</button><button>${icon('clock')} 后台继续</button></div></div>`, '任务');
}

function mReceipt() {
  return mobilePhone(`${baoMobileTop('自动配置完成','回执 LQB-260815-028')}<div class="m-scroll"><div class="success-orb">${icon('check')}</div><div class="success-title"><b>体验版等待商家确认</b><p>基础配置已验收，确认后提交微信审核</p></div><div class="receipt-card"><div class="receipt-item"><span class="green-bg">${icon('store')}</span><div><b>拾味小馆小程序</b><p>体验版 · 商家自有 AppID</p></div><em>预览</em></div><div class="receipt-item"><span class="blue-bg">${icon('map')}</span><div><b>AI搜索获客</b><p>自有页面可访问 · 外部收录监测中</p></div><em>查看</em></div><div class="receipt-item"><span class="purple-bg">${icon('work')}</span><div><b>AI经营工作台</b><p>管理员与6个官方插件已启用</p></div><em>打开</em></div><div class="receipt-item"><span class="orange-bg">${icon('bot')}</span><div><b>小程序AI客服</b><p>10/10测试通过 · 待随小程序发布</p></div><em>测试</em></div></div><div class="care-strip">${icon('refresh')} 持续托管：监测授权、GEO、客服与模板版本</div><button class="m-primary">发给商家确认体验版</button><button class="m-secondary">查看完整交付回执</button></div>`, '任务');
}

function baoMobileBoard() {
  return `<section class="bao-mobile-board"><header><div><span>乐趣宝 · 移动端商务交付</span><h1>站在商家门店里，几分钟完成一套数字经营服务</h1><p>拍照识别 → 一次确认 → 后台自动执行 → 发给商家验收</p></div><em>关键操作 ≥ 44px · 任务可后台继续</em></header><div class="bao-phones">${mCapture()}${mConfirm()}${mProgress()}${mReceipt()}</div></section>`;
}

function categoryIcon(type, color='#168A65', bg='#E8F5EF') {
  const shapes = {
    vegetable:'<path d="M8 12c0-3 2-5 4-5s4 2 4 5"/><path d="M5 12h14l-1.6 7H6.6Z"/><circle cx="10" cy="14.5" r="1.7" fill="currentColor" opacity=".25"/><path d="M14 10c0-3 2-5 5-5-1 3-2 5-5 5Z" fill="currentColor" opacity=".28"/>',
    rice:'<path d="M5 11h14l-2 9H7Z"/><path d="M7 11c1-5 3-7 5-7s4 2 5 7"/><path d="M12 4v7M15 5l-3 6M9 5l3 6"/><path d="M19 4c2 2 2 4 0 6-2-2-2-4 0-6Z" fill="currentColor" opacity=".26"/>',
    clean:'<path d="M9 3h6M10 3v5l-3 3v9h10v-9l-3-3V3"/><path d="M7 14h10"/><path d="M19 6l.5 1.5L21 8l-1.5.5L19 10l-.5-1.5L17 8l1.5-.5Z" fill="currentColor" opacity=".3"/>',
    tissue:'<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M9 10V5c2-2 4 2 6 0v5"/><path d="M8 14h8"/><path d="M9 16h6" fill="none" opacity=".55"/>',
    baby:'<path d="M9 4h6l1 14H8Z"/><path d="M10 4V2h4v2M10 9h4"/><path d="M12 13c2-2 5 1 0 4-5-3-2-6 0-4Z" fill="currentColor" opacity=".28"/>',
    health:'<path d="M12 20s-7-4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 6-7 10-7 10Z"/><path d="M8 12h2l1-2 2 5 1-3h2"/><path d="M17 5c0-2 1-3 3-3 0 2-1 3-3 3Z" fill="currentColor" opacity=".25"/>',
    drink:'<path d="M7 4h5l-1 4v12H6V8Z"/><path d="M15 8h5l-1 10h-3Z"/><path d="M16 12h3M17 5c1-1 2-1 3 0"/><circle cx="18" cy="4" r="1" fill="currentColor" opacity=".28"/>',
    kitchen:'<path d="M4 12h11a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z"/><path d="M15 12h6M8 18v2M11 18v2M17 5v8M15 7h4"/><path d="M6 9c-1-2 1-3 0-5M10 9c-1-2 1-3 0-5"/>',
    home:'<path d="M5 12h14v7H5Z"/><path d="M5 12c0-3 2-5 4-5h6c2 0 4 2 4 5M8 19v2M16 19v2"/><path d="M19 5v5M17 5h4M18 2h2"/>',
    all:'<rect x="4" y="4" width="6" height="6" rx="2" fill="currentColor" opacity=".22"/><rect x="14" y="4" width="6" height="6" rx="2"/><rect x="4" y="14" width="6" height="6" rx="2"/><circle cx="17" cy="17" r="3" fill="currentColor" opacity=".25"/>',
    food:'<path d="M4 11h16a8 8 0 0 1-16 0Z"/><path d="M7 8c0-2 1-3 0-5M12 8c0-2 1-3 0-5M17 8c0-2 1-3 0-5"/>',
    relax:'<path d="M7 9h10a5 5 0 0 1 4 6l-1 4c-.4 1.6-2.4 2-3.4.8L15 18H9l-1.6 1.8C6.4 21 4.4 20.6 4 19l-1-4a5 5 0 0 1 4-6Z"/><path d="M8 12v4M6 14h4M16 13h.01M18 15h.01"/><circle cx="16" cy="13" r="1" fill="currentColor" opacity=".3"/>',
    child:'<circle cx="12" cy="9" r="4"/><path d="M5 21c0-5 3-8 7-8s7 3 7 8"/><path d="m5 6 2-3 2 3M15 5l3-2 1 3"/>',
    beauty:'<path d="M12 3v18M5 8c4 0 7-2 7-5M19 8c-4 0-7-2-7-5M5 16c4 0 7 2 7 5M19 16c-4 0-7 2-7 5"/><circle cx="12" cy="12" r="2" fill="currentColor" opacity=".25"/>',
    service:'<path d="M6 4h12v16H6Z"/><path d="M9 8h6M9 12h6M9 16h3"/><path d="m15 16 1 1 2-3"/>'
  };
  return `<span class="category-icon" style="--ci:${color};--cibg:${bg}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shapes[type] || shapes.all}</svg></span>`;
}

function lifeTop(title='') {
  return `<div class="life-top">${title?`<span class="top-spacer"></span><h2>${title}</h2>`:`<div class="life-location">${icon('location')} 上海市 · 静安区 <i>⌄</i></div>`}<div><button>${icon('scan')}</button><button>${icon('bell')}</button></div></div>`;
}

function lifeBottom(active='生活') {
  const data=[['生活','home'],['商城','store'],['生活圈','location'],['购物车','cart'],['我的','user']];
  return `<nav class="life-bottom">${data.map(([n,i])=>`<div class="${n===active?'active':''}">${icon(i)}${n==='购物车'?'<em>3</em>':''}<span>${n}</span></div>`).join('')}</nav>`;
}

function lifeSearch(text='搜生活所需、商品和附近好店') {
  return `<div class="life-search">${icon('search')}<span>${text}</span><button><i>${icon('logo')}</i>问小满</button></div>`;
}

function lifeBanner(kind='home', compact=false) {
  const data={
    home:['生活直供','一日所需，安心到家','产地可溯 · 品质严选 · 售后有保障'],
    mall:['本周精选','家庭焕新季','精选生活好物，满额配送到家'],
    local:['附近好店','今晚吃点好的','附近高分团购，双人餐88元起']
  }[kind];
  return `<div class="life-banner ${kind} ${compact?'compact':''}"><div class="banner-shade"></div><div class="banner-copy"><span>${data[0]}</span><h1>${data[1]}</h1><p>${data[2]}</p></div>${kind==='home'?'<div class="banner-dots"><i></i><i></i><i></i></div>':''}</div>`;
}

const homeCats=[
  ['生鲜果蔬','vegetable','#168A65','#E8F5EF'],['米面粮油','rice','#C9782E','#FFF1E4'],['日用清洁','clean','#397FC8','#EAF3FF'],['家庭纸品','tissue','#7557C5','#F0ECFF'],['母婴亲子','baby','#E87078','#FFF0F1'],
  ['健康养护','health','#178A72','#E8F5F1'],['酒水饮品','drink','#A45D9E','#F7ECF6'],['家庭厨房','kitchen','#E36B43','#FFF0EA'],['品质家居','home','#4F75B8','#EAF0FA'],['全部分类','all','#5D6561','#F0F2F0']
];
const localCats=[['附近美食','food','#E06442','#FFF0EA'],['休闲娱乐','relax','#8B62C6','#F1EDFB'],['亲子乐园','child','#E67B86','#FFF0F1'],['丽人美容','beauty','#C45A91','#F9EAF2'],['全部服务','service','#3F7FB5','#EAF3FB']];

function categoryGrid(items=homeCats, local=false) {
  return `<div class="category-grid ${local?'local-cats':''}">${items.map(c=>`<div>${categoryIcon(c[1],c[2],c[3])}<span>${c[0]}</span></div>`).join('')}</div>`;
}

function productArt(type='rice') {
  const art={
    rice:`<svg viewBox="0 0 140 100"><path d="M45 24h50l9 58H36Z" fill="#fff9ea" stroke="#cc762c" stroke-width="3"/><path d="M53 24c4-12 12-17 17-17s13 5 17 17" fill="none" stroke="#cc762c" stroke-width="3"/><path d="M48 47h44" stroke="#e9b96e" stroke-width="10"/><text x="70" y="52" text-anchor="middle" font-size="13" font-weight="700" fill="#93501f">五常香米</text><path d="M111 26c12 8 16 20 13 36" fill="none" stroke="#86a95f" stroke-width="3"/><path d="M118 39l8-5M120 48l8-3M119 57l8 0" stroke="#86a95f" stroke-width="2"/></svg>`,
    tissue:`<svg viewBox="0 0 140 100"><rect x="24" y="37" width="92" height="47" rx="12" fill="#ece6ff" stroke="#7655c5" stroke-width="3"/><path d="M50 37c2-23 37-28 41 0" fill="#fff" stroke="#7655c5" stroke-width="3"/><path d="M48 58h44" stroke="#b9a7ef" stroke-width="8"/><circle cx="70" cy="61" r="7" fill="#fff"/></svg>`,
    clean:`<svg viewBox="0 0 140 100"><path d="M49 21h31v11L91 44v42H38V44l11-12Z" fill="#e9f4ff" stroke="#397fc8" stroke-width="3"/><path d="M52 21h25" stroke="#397fc8" stroke-width="7"/><path d="M38 59h53" stroke="#9fc8eb" stroke-width="12"/><path d="M103 29l3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#63a0d7"/></svg>`,
    fruit:`<svg viewBox="0 0 140 100"><path d="M26 43h88l-10 43H36Z" fill="#f1dfbe" stroke="#af7c41" stroke-width="3"/><circle cx="50" cy="40" r="18" fill="#ef7856"/><circle cx="78" cy="34" r="20" fill="#f0c24d"/><circle cx="97" cy="47" r="17" fill="#78ad61"/><path d="M47 20c8-8 14-6 19-3" fill="none" stroke="#4c8c55" stroke-width="4"/></svg>`,
    oil:`<svg viewBox="0 0 140 100"><path d="M54 19h32v14l8 10v43H46V43l8-10Z" fill="#f9d667" stroke="#c9782e" stroke-width="3"/><path d="M57 19h26" stroke="#c9782e" stroke-width="7"/><path d="M48 58h44" stroke="#fff4c3" stroke-width="14"/><path d="M70 48c12 11 10 20 0 20s-12-9 0-20Z" fill="#d9912f"/></svg>`,
    care:`<svg viewBox="0 0 140 100"><rect x="34" y="25" width="72" height="61" rx="14" fill="#e9f5f1" stroke="#178a72" stroke-width="3"/><path d="M70 40v31M55 55h30" stroke="#178a72" stroke-width="8"/><path d="M45 25v-9h50v9" fill="none" stroke="#178a72" stroke-width="3"/></svg>`
  };
  return `<div class="product-art ${type}">${art[type] || art.rice}</div>`;
}

function productCard(name,sub,price,type,badge='家庭常备') {
  return `<div class="life-product">${productArt(type)}<div class="life-product-info"><span class="product-badge">${badge}</span><h3>${name}</h3><p>${sub}</p><div><b><small>¥</small>${price}</b><button class="cart-add">${icon('cart')}${icon('plus')}</button></div></div></div>`;
}

function homeContent() {
  return `${lifeTop()}${lifeSearch()}${lifeBanner('home')} ${categoryGrid()}<div class="trust-row"><span>${icon('check')}源头可溯</span><span>${icon('check')}品质严选</span><span>${icon('check')}售后保障</span></div>
    <div class="section-head"><div><h2>生活篮子</h2><p>按家庭消耗周期，提醒安心补货</p></div><button>管理清单 ${icon('right')}</button></div>
    <div class="basket-card"><div class="basket-thumbs">${productArt('rice')}${productArt('tissue')}${productArt('clean')}</div><div class="basket-copy"><b>本周建议补充 4 件</b><span>五常大米 · 家庭纸巾 · 洗衣凝珠等</span><em>${icon('clock')} 预计可用 12 天</em></div><button>加入购物车</button></div>
    <div class="section-head"><div><h2>家庭常备</h2><p>真实复购多，价格更稳定</p></div><button>更多 ${icon('right')}</button></div><div class="product-row">${productCard('东北五常香米','当季新米 · 5kg','69.9','rice','产地直供')}${productCard('家庭柔韧抽纸','24包整箱 · 无香','39.9','tissue')}${productCard('植物洗衣凝珠','52颗 · 温和护色','45.8','clean')}</div>`;
}

function lifePhone(content, active='生活', cls='') {
  return `<div class="life-phone ${cls}"><div class="life-screen">${phoneStatus()}<div class="life-scroll">${content}</div>${lifeBottom(active)}</div></div>`;
}

function lifeHomeBoard() {
  return `<section class="life-home-board"><div class="life-board-copy"><span>乐趣生活 · 消费者端</span><h1>把生活所需，做得安心又好看</h1><p>首页回到真实消费场景：数字供应链为核心，商城与本地生活自然承接。</p><div class="visual-points"><div><b>整块可点击 Banner</b><span>没有多余“去看看”按钮</span></div><div><b>10枚专属分类图标</b><span>每个品类拥有独立语义</span></div><div><b>消费级按钮与排版</b><span>44px操作区，不再文字错乱</span></div></div></div>${lifePhone(homeContent(),'生活','hero-phone')}</section>`;
}

function mallContent() {
  return `${lifeTop('商城')}${lifeSearch('搜商品、品类和品牌')}<div class="filter-chips"><button class="active">品质精选</button><button>食品饮料</button><button>家庭日用</button><button>健康养护</button></div>${lifeBanner('mall')}<div class="section-head"><div><h2>为你精选</h2><p>结合常购与家庭清单推荐</p></div><button>综合排序⌄</button></div><div class="two-products">${productCard('每日鲜蔬组合','6种搭配 · 次日达','39.8','fruit','今日鲜达')}${productCard('非转基因菜籽油','物理压榨 · 5L','79.9','oil','品质粮油')}${productCard('家庭柔韧抽纸','24包整箱 · 无香','39.9','tissue','家庭常备')}${productCard('家庭健康护理包','日常应急 · 16件','59.0','care','健康养护')}</div>`;
}

function localContent() {
  const shops=[
    ['江南小馆','苏浙菜 · 人民广场','4.8','820m','双人招牌餐','88','已售 326','营业中'],
    ['山野火锅','重庆火锅 · 静安寺','4.7','1.2km','双人牛油锅','128','已售 516','营业中']
  ];
  return `${lifeTop('生活圈')}${lifeSearch('搜附近美食、休闲和亲子')}${lifeBanner('local')} ${categoryGrid(localCats,true)}<div class="section-head"><div><h2>附近高分好店</h2><p>真实团购，线上买到店核销</p></div><button>离我最近⌄</button></div><div class="merchant-list">${shops.map((s,i)=>`<div class="merchant-card"><div class="merchant-photo ${i?'hotpot':''}"><span>${s[7]}</span></div><div class="merchant-info"><div><h3>${s[0]}</h3><span class="rating">${icon('star')} ${s[2]}</span></div><p>${s[1]} · ${s[3]}</p><div class="deal-line"><span>团</span><b>${s[4]}</b><em>¥${s[5]}</em></div><div class="merchant-meta"><span>随买随用 · 到店核销</span><i>${s[6]}</i></div></div></div>`).join('')}</div>`;
}

function cartContent() {
  const item=(type,name,sub,price,count=1)=>`<div class="cart-item"><button class="check-round">${icon('check')}</button>${productArt(type)}<div class="cart-info"><b>${name}</b><p>${sub}</p><em>¥${price}</em><div class="stepper"><button>−</button><span>${count}</span><button>＋</button></div></div></div>`;
  return `${lifeTop('购物车')}<div class="shipping-group"><div class="group-head"><b>${icon('truck')} 物流配送</b><span>上海仓 · 满69元包邮</span></div>${item('rice','东北五常香米','5kg · 当季新米','69.9',1)}${item('tissue','家庭柔韧抽纸','24包整箱 · 无香','39.9',2)}</div><div class="shipping-group"><div class="group-head"><b>${icon('location')} 到店核销</b><span>江南小馆 · 人民广场</span></div><div class="cart-deal"><button class="check-round">${icon('check')}</button><div class="deal-thumb">双人餐</div><div><b>双人招牌餐</b><p>购买后7天内到店使用</p><em>¥88</em></div></div></div><div class="coupon-row"><span>${icon('bag')} 优惠券</span><b>已省 ¥20 ${icon('right')}</b></div><div class="cart-spacer"></div><div class="checkout-bar"><button class="check-round">${icon('check')}</button><span>全选</span><div><small>优惠 ¥20</small><b>合计 <em>¥237.7</em></b></div><button class="checkout-btn">去结算 (4)</button></div>`;
}

function mineContent() {
  const orders=[['待付款','clock'],['待发货','bag'],['待收货','truck'],['待核销','qr'],['退款/售后','refresh']];
  const rows=[['我的团购','3张待使用','bag'],['生活篮子','4件建议补货','cart'],['地址管理','3个收货地址','location'],['发票与抬头','2个抬头','file'],['客服与帮助','小满在线','bot']];
  return `${lifeTop('我的')}<div class="member-card"><div class="member-avatar">禾</div><div><span>乐趣生活会员</span><h2>禾木同学</h2><p>安心值 2,860 · 已守护生活 326 天</p></div><em>生活会员</em><div class="member-stats"><div><b>12</b><span>优惠券</span></div><div><b>¥86.4</b><span>消费奖励</span></div><div><b>28</b><span>收藏</span></div></div></div><div class="my-card"><div class="my-head"><b>我的订单</b><span>全部订单 ${icon('right')}</span></div><div class="order-grid">${orders.map((o,i)=>`<div><span>${categoryIcon(i===0?'service':i===1?'clean':i===2?'all':i===3?'food':'health',['#C9782E','#397FC8','#178A72','#A45D9E','#E87078'][i],['#FFF1E4','#EAF3FF','#E8F5F1','#F7ECF6','#FFF0F1'][i])}</span><b>${o[0]}</b>${i===3?'<em>2</em>':''}</div>`).join('')}</div></div><div class="my-card menu-card">${rows.map(r=>`<div><span>${icon(r[2])}</span><b>${r[0]}</b><em>${r[1]}</em>${icon('right')}</div>`).join('')}</div><div class="care-banner"><span>${icon('logo')}</span><div><b>小满生活助手</b><p>查订单、比商品、找附近好店</p></div><button>问问小满</button></div>`;
}

function tabsBoard() {
  return `<section class="life-tabs-board"><header><div><span>乐趣生活 · 一级栏目</span><h1>五个入口，各自解决一种消费任务</h1></div><p>生活消费 · 商城 · 本地生活团购 · 购物车 · 个人中心</p></header><div class="five-phones">${lifePhone(homeContent(),'生活','compact-phone')}${lifePhone(mallContent(),'商城','compact-phone')}${lifePhone(localContent(),'生活圈','compact-phone')}${lifePhone(cartContent(),'购物车','compact-phone')}${lifePhone(mineContent(),'我的','compact-phone')}</div></section>`;
}

function detailHeader(title) {
  return `<div class="detail-top"><button>${icon('left')}</button><b>${title}</b><div><button>${icon('share')}</button><button>${icon('dots')}</button></div></div>`;
}

function productDetail() {
  return `${detailHeader('商品详情')}<div class="detail-product-hero">${productArt('rice')}<div class="photo-dots"><i></i><i></i><i></i></div></div><div class="detail-block product-title"><span>产地直供</span><h1>东北五常稻花香大米</h1><p>当季新米 · 5kg · 产地全程可溯</p><b><small>¥</small>69.9 <del>¥89</del></b></div><div class="detail-block trace-block"><div><b>安心溯源</b><span>查看完整报告 ${icon('right')}</span></div><div class="trace-steps"><span class="done"><i>${icon('check')}</i><b>产地</b><small>五常龙凤山</small></span><span class="done"><i>${icon('check')}</i><b>质检</b><small>12项合格</small></span><span class="done"><i>${icon('check')}</i><b>仓储</b><small>上海中心仓</small></span><span><i>${icon('truck')}</i><b>发货</b><small>预计明日</small></span></div></div><div class="detail-block"><div class="spec-row"><b>配送</b><span>上海仓 · 预计明日送达 ${icon('right')}</span></div><div class="spec-row"><b>服务</b><span>破损包赔 · 7天售后 ${icon('right')}</span></div></div><div class="detail-spacer"></div><div class="buy-bar"><button class="xiaoman-entry"><i>${icon('logo')}</i><span>小满</span></button><button class="soft-buy">加入购物车</button><button class="buy-now">立即购买</button></div>`;
}

function merchantDetail() {
  return `${detailHeader('商户详情')}<div class="merchant-detail-cover"><div><span>4.8分 · 上海苏浙菜热门榜</span><h1>江南小馆</h1><p>人民广场店 · 营业至22:00</p></div></div><div class="detail-block merchant-address"><span>${icon('location')}</span><div><b>西藏中路268号来福士6层</b><p>距你820m · 步行约12分钟</p></div><button>导航</button></div><div class="detail-block"><div class="detail-section-title"><b>到店团购</b><span>全部 6 ${icon('right')}</span></div><div class="detail-deal"><div class="deal-thumb">双人餐</div><div><b>江南招牌双人餐</b><p>5菜1汤 · 周末通用</p><span><em>¥88</em><del>¥138</del></span></div><button>抢购</button></div><div class="detail-deal"><div class="deal-thumb green-deal">家庭餐</div><div><b>家庭欢聚4人餐</b><p>6菜1汤 · 免预约</p><span><em>¥168</em><del>¥238</del></span></div><button>抢购</button></div></div><div class="detail-block"><div class="detail-section-title"><b>商家信息</b></div><p class="merchant-desc">地道本帮与苏浙家常菜，适合家庭聚会和朋友小聚。支持团购核销与消费奖励。</p></div><div class="detail-spacer"></div><div class="single-buy-bar"><button>${icon('bot')} 问小满</button><button class="buy-now">查看全部团购</button></div>`;
}

function checkoutDetail() {
  return `${detailHeader('确认订单')}<div class="address-card"><span>${icon('location')}</span><div><b>禾木同学 · 138****8652</b><p>上海市静安区南京西路1688号 8幢1202</p></div>${icon('right')}</div><div class="detail-block order-shop"><div class="detail-section-title"><b>乐趣生活自营</b></div><div class="order-line">${productArt('rice')}<div><b>东北五常稻花香大米</b><p>5kg · 当季新米</p><span>¥69.9 × 1</span></div></div><div class="order-setting"><span>配送方式</span><b>快递配送 · 明日送达</b></div><div class="order-setting"><span>优惠券</span><b class="orange">−¥10 ${icon('right')}</b></div><div class="order-setting"><span>消费奖励</span><b class="orange">抵扣 ¥6.4 ${icon('right')}</b></div></div><div class="detail-block amount-list"><div><span>商品金额</span><b>¥69.9</b></div><div><span>运费</span><b>¥0</b></div><div><span>优惠</span><b class="orange">−¥16.4</b></div><div class="amount-total"><span>实付款</span><b>¥53.5</b></div></div><div class="payment-note">${icon('check')} 提交即代表同意《购买与售后规则》</div><div class="detail-spacer"></div><div class="checkout-bottom"><div><small>已优惠 ¥16.4</small><b>合计 <em>¥53.5</em></b></div><button class="checkout-btn">提交订单</button></div>`;
}

function xiaomanDetail() {
  return `${detailHeader('小满生活助手')}<div class="xiaoman-chat"><div class="xiaoman-welcome"><span>${icon('logo')}</span><b>这两家团购，哪家更适合带孩子？</b><p>我会结合距离、菜品、儿童友好和核销规则比较。</p></div><div class="user-bubble">帮我比较江南小馆和山野火锅，周六一家三口，孩子6岁。</div><div class="xiaoman-answer"><span class="xiaoman-avatar">${icon('logo')}</span><div><b>更推荐江南小馆</b><p>距离更近，口味清淡，4人家庭餐可少辣处理；山野火锅的双人套餐更适合成人。</p><div class="compare-table"><div><span>江南小馆</span><b>亲子友好 4.8</b><em>820m · ¥168</em></div><div><span>山野火锅</span><b>亲子友好 3.7</b><em>1.2km · ¥128</em></div></div><small>${icon('file')} 已核对商户资料、套餐规则与128条真实评价</small></div></div></div><div class="xiaoman-sheet"><div></div><b>下一步</b><p>江南小馆周六18:00仍有团购库存，建议提前致电确认儿童椅。</p><div><button>继续比较</button><button class="primary">查看江南小馆</button></div></div>`;
}

function detailsBoard() {
  return `<section class="life-details-board"><header><div><span>乐趣生活 · 关键交易链路</span><h1>从商品与团购，到结算与小满辅助决策</h1></div><p>二级页不重复一级导航，操作固定、信息层级清晰。</p></header><div class="detail-phones">${lifePhone(productDetail(),'','detail-phone no-tab')}${lifePhone(merchantDetail(),'','detail-phone no-tab')}${lifePhone(checkoutDetail(),'','detail-phone no-tab')}${lifePhone(xiaomanDetail(),'','detail-phone no-tab')}</div></section>`;
}

function kitBoard() {
  const all=[...homeCats,...localCats];
  return `<section class="life-kit-board"><header><div><span>乐趣生活 · 视觉精修板</span><h1>Banner、分类图标与按钮，全部按可落地规范重绘</h1></div><p>此页用于确认视觉细节；最终总包会扩展为完整组件状态。</p></header><div class="kit-banners"><div>${lifeBanner('home',true)}<span>生活首页 · 整块点击</span></div><div>${lifeBanner('mall',true)}<span>商城活动 · 整块点击</span></div><div>${lifeBanner('local',true)}<span>本地团购 · 整块点击</span></div></div><div class="kit-content"><div class="icon-spec"><h2>15枚专属分类图标</h2><p>48×48圆角底座 · 双色图形 · 语义一一对应</p><div class="kit-icons">${all.map(c=>`<div>${categoryIcon(c[1],c[2],c[3])}<b>${c[0]}</b></div>`).join('')}</div></div><div class="button-spec"><h2>按钮系统</h2><p>重要操作44px高，文字单行，不再错位</p><button class="btn-primary">立即购买</button><button class="btn-soft">加入购物车</button><button class="btn-green">问小满</button><button class="btn-outline">查看详情</button><button class="btn-loading"><i></i>正在提交</button><button class="btn-disabled">已售罄</button><div class="button-note"><span><i class="orange-dot"></i>交易操作</span><span><i class="green-dot"></i>服务操作</span><span><i class="gray-dot"></i>次级操作</span></div></div></div></section>`;
}

function baoMiniprogram() {
  const steps = [
    ['商户资料与名称','已由商家确认','done'],
    ['微信第三方平台授权','AppID wx8d3f…92a1','done'],
    ['支付与类目配置','待补充结算账户','hold'],
    ['生成体验版','模板 1.8.6','done'],
    ['商家预览确认','2处待确认','run'],
    ['提交微信审核','尚未提交','wait'],
    ['发布与持续升级','审核通过后执行','wait']
  ];
  return `<section class="bao-app">${baoSidebar('商户交付')}<main class="bao-main">${topbar('拾味小馆小程序发布')}<div class="mp-workspace">
    <section class="mp-main"><div class="mp-hero"><div><span>标准独立小程序</span><h1>拾味小馆</h1><p>名称由商家填写 · AppID 归商家 · 乐趣宝负责模板、托管与升级</p></div><div class="mp-state"><i></i><b>体验版待确认</b><small>自动配置已完成</small></div></div>
      <div class="mp-alert">${icon('warning')}<div><b>还差一项商户资料</b><p>请商家绑定微信支付结算账户。乐趣宝不代收消费者交易资金。</p></div><button>发商家补充</button></div>
      <div class="mp-columns"><div class="mp-steps"><div class="mp-section-title"><b>发布进度</b><span>每一步都可暂停、重试和继续</span></div>
        ${steps.map((s,i)=>`<div class="mp-step ${s[2]}"><i>${s[2]==='done'?'✓':i+1}</i><div><b>${s[0]}</b><span>${s[1]}</span></div><button>${s[2]==='hold'?'处理':s[2]==='run'?'查看':'详情'}</button></div>`).join('')}
      </div><div class="mp-preview"><div class="mp-section-title"><b>体验版预览</b><span>扫码进入商家自己的小程序</span></div><div class="preview-device"><div class="preview-head"><b>拾味小馆</b><span>•••</span></div><div class="preview-cover"><small>本周到店</small><h3>一家人，吃顿热乎的</h3></div><div class="preview-cats"><span>招牌团购</span><span>门店菜单</span><span>订单核销</span><span>AI店员</span></div><div class="preview-deal"><b>家庭欢聚4人餐</b><span>¥168</span><button>立即抢购</button></div><div class="preview-ai">${icon('bot')} 问问拾味AI店员</div></div><div class="preview-actions"><button>打开体验版</button><button class="primary">生成确认链接</button></div></div></div>
    </section><aside class="mp-side"><h2>本次发布检查</h2><div class="check-card ok"><b>${icon('check')} 名称与主体</b><span>名称是否可用以微信审核为准</span></div><div class="check-card ok"><b>${icon('check')} 模板功能</b><span>团购、核销、订单、AI客服</span></div><div class="check-card warn"><b>${icon('warning')} 支付账户</b><span>必须由商家管理员补充</span></div><div class="check-card ok"><b>${icon('check')} 隐私与AI标识</b><span>已生成待商家确认文本</span></div><div class="mp-rule"><b>发布规则</b><p>一键交付不跳过微信授权和审核。审核驳回后保留原因，可修正后继续；上线后按灰度批次升级，可回滚上一稳定模板。</p></div><button class="mp-submit" disabled>资料齐全后提交审核</button></aside>
  </div></main></section>`;
}

function baoService() {
  const conversations = [
    ['林女士','团购券周日还能用吗？','刚刚','AI接待中',''],
    ['顾先生','我想申请部分退款','2分钟前','等待人工','urgent active'],
    ['夏先生','包间可以坐8个人吗？','8分钟前','AI已解决',''],
    ['周女士','儿童餐具需要预约吗？','16分钟前','等待顾客','']
  ];
  return `<section class="bao-app">${baoSidebar('AI客服')}<main class="bao-main">${topbar('AI客服与客户')}<div class="service-workspace">
    <aside class="service-list"><div class="service-list-head"><div><h2>会话</h2><span>今日 184 · 转人工 9</span></div><button>${icon('search')}</button></div><div class="service-filters"><button class="active">全部 23</button><button>待人工 3</button><button>我的 5</button></div>${conversations.map(c=>`<div class="conv-row ${c[4]}"><span class="conv-avatar">${c[0][0]}</span><div><b>${c[0]}</b><p>${c[1]}</p><em>${c[3]}</em></div><time>${c[2]}</time></div>`).join('')}</aside>
    <section class="service-chat"><div class="chat-customer-head"><div><span class="conv-avatar">顾</span><div><b>顾先生</b><small>小程序内咨询 · 会员 · 2个订单</small></div></div><span class="handoff-state"><i></i>等待人工 · 01:26</span><button>认领会话</button></div>
      <div class="chat-timeline"><span class="time-divider">今天 14:28</span><div class="customer-msg">昨天买的双人餐只用了一份菜，可以退一部分吗？</div><div class="ai-msg"><span>${icon('logo')}</span><div><b>拾味AI店员</b><p>我查到订单 LQ202608150238 已在昨晚完成整单核销。部分退款涉及商家确认，我已经为你转接人工客服。</p><div class="order-context"><span>已核销订单</span><b>江南招牌双人餐</b><em>实付 ¥88 · 2026-08-14 19:36</em><button>查看订单</button></div></div></div><div class="system-msg">${icon('warning')} 涉及退款，AI已停止自动回复并进入人工队列</div></div>
      <div class="agent-draft"><div><span>${icon('logo')} AI答复草稿</span><button>重新生成</button></div><p>您好，我看到了这笔已核销订单。部分退款需要门店核对实际使用情况，我先为您登记，预计30分钟内给出处理结果。</p><div><button>编辑后发送</button><button class="primary">认领并发送</button></div></div>
    </section>
    <aside class="customer-profile"><div class="profile-head"><span class="profile-avatar">顾</span><div><h2>顾先生</h2><p>持续客户档案 · 本商户内可见</p></div><button>⋯</button></div><div class="profile-tags"><span>会员</span><span>家庭聚餐</span><span>近30天到店2次</span></div><div class="profile-stats"><div><b>¥326</b><span>累计实付</span></div><div><b>4</b><span>订单</span></div><div><b>1</b><span>售后</span></div></div><div class="profile-section"><div><b>当前问题</b><button>查看来源</button></div><p>已核销订单申请部分退款。此类操作不能由AI自动执行。</p></div><div class="profile-section"><div><b>客户事实</b><button>管理</button></div><ul><li>手机号已授权，会员身份已绑定</li><li>偏好清淡口味 <em>来自2次主动表达</em></li><li>常在周末家庭用餐 <em>90天后复核</em></li></ul></div><div class="privacy-note">${icon('check')} 客户可查询、更正或删除非必须保留的信息；不同商户不会共享本档案。</div><button class="profile-action">创建售后工单</button></aside>
  </div></main></section>`;
}

function baoValue() {
  return `<section class="bao-app">${baoSidebar('门店经营')}<main class="bao-main">${topbar('7月商户价值报告')}<div class="value-workspace">
    <header class="value-head"><div><span>商户月度价值报告 · 拾味小馆 · 2026年7月</span><h1>这 898 元，本月具体帮你做了什么</h1><p>只展示可核对的接待、成交、交付与系统健康数据</p></div><button>${icon('share')} 发给商家</button></header>
    <div class="value-cards"><div><span>AI接待</span><b>1,284</b><em>独立顾客 736</em></div><div><span>AI独立解决率</span><b>78.6%</b><em class="good">较上月 +6.2%</em></div><div><span>咨询后成交</span><b>¥18,620</b><em>可归因订单 162</em></div><div><span>节省人工接待</span><b>64.2h</b><em>按3分钟/次估算</em></div></div>
    <div class="value-grid"><section class="value-panel wide"><div class="value-title"><div><b>从咨询到到店的完整流程</b><span>仅统计已关联会话和订单的数据</span></div><button>查看口径</button></div><div class="funnel"><div style="--w:100%"><b>1,284</b><span>AI咨询</span></div><div style="--w:82%"><b>736</b><span>有效顾客</span></div><div style="--w:58%"><b>214</b><span>点击商品/团购</span></div><div style="--w:42%"><b>162</b><span>完成支付</span></div><div style="--w:31%"><b>139</b><span>完成核销</span></div></div></section>
      <section class="value-panel"><div class="value-title"><div><b>系统健康</b><span>需要店主处理 2 项</span></div></div><div class="health-row ok"><i></i><div><b>商家小程序</b><span>在线 · 模板1.8.6</span></div><em>正常</em></div><div class="health-row ok"><i></i><div><b>GEO公开资料</b><span>12/12 可访问</span></div><em>正常</em></div><div class="health-row warn"><i></i><div><b>企业微信通知</b><span>1名员工授权将到期</span></div><em>处理</em></div><div class="health-row warn"><i></i><div><b>客服知识库</b><span>3条价格信息待复核</span></div><em>处理</em></div></section>
      <section class="value-panel"><div class="value-title"><div><b>AI服务额度</b><span>不展示上游模型成本</span></div></div><div class="quota-ring"><b>63%</b><span>本月已用</span></div><div class="quota-meta"><span>接待与自动任务</span><b>预计可用至月底</b></div><button class="quota-button">查看消耗明细</button></section>
      <section class="value-panel wide action-panel"><div><span>下月建议</span><h2>先补齐核销后的二次到店提醒</h2><p>31位新客核销后没有收到下一步服务提示。系统已生成两组草案，仍需店主确认后发布。</p></div><button>查看建议草案</button></section>
    </div><footer class="value-foot"><span>${icon('check')} 数据来自小程序、订单、核销、客服和任务回执，可逐项追溯</span><b>下次续费日：2026-08-15</b></footer>
  </div></main></section>`;
}

function serviceMobileBoard() {
  const phone = (title,body,theme='staff') => `<div class="svc-phone ${theme}"><div class="svc-screen">${phoneStatus()}<div class="svc-top"><button>${icon('left')}</button><b>${title}</b><button>${icon('dots')}</button></div>${body}</div></div>`;
  const consumer = phone('拾味小馆', `<div class="svc-store-cover"><span>周末家庭餐</span><h2>一家人，吃顿热乎的</h2><button>查看团购</button></div><div class="svc-float-sheet"><i></i><div class="svc-ai-title"><span>${icon('bot')}</span><div><b>拾味AI店员</b><small>由AI提供服务 · 可转人工</small></div></div><p>你好，我能帮你查套餐、订单、核销和售后。你现在想了解什么？</p><div class="svc-quick"><button>哪款适合一家三口</button><button>查我的团购券</button><button>怎么申请售后</button></div><div class="svc-input"><span>输入问题…</span><button>${icon('arrow')}</button></div></div>`, 'consumer');
  const fullChat = phone('拾味AI店员', `<div class="svc-notice">${icon('bot')} AI接待中 · 重要操作会转人工确认</div><div class="svc-chat-area"><div class="svc-user-bubble">我的双人餐周日还能用吗？</div><div class="svc-ai-bubble"><span>${icon('logo')}</span><div><p>可以。你的团购券有效期到周日22:00，门店当天营业到21:30，建议20:30前到店。</p><div class="svc-coupon"><b>江南招牌双人餐</b><span>待使用 · 周日22:00到期</span><button>查看券码</button></div><small>依据：订单与门店营业时间</small></div></div></div><div class="svc-bottom-input"><button>${icon('plus')}</button><span>继续提问</span><button>转人工</button></div>`, 'consumer');
  const queue = phone('待接管会话', `<div class="svc-staff-summary"><div><b>3</b><span>等待人工</span></div><div><b>01:26</b><span>最长等待</span></div><div><b>5</b><span>我的会话</span></div></div><div class="svc-mobile-filter"><button class="active">紧急</button><button>全部</button><button>我的</button></div><div class="svc-ticket urgent"><span>顾</span><div><b>顾先生 · 退款咨询</b><p>已核销订单申请部分退款</p><em>AI已停止自动回复</em></div><time>01:26</time></div><div class="svc-ticket"><span>林</span><div><b>林女士 · 团购规则</b><p>申请人工确认周日营业时间</p><em>等待人工</em></div><time>00:42</time></div><div class="svc-wecom-note">${icon('bell')} 若商家已授权企业微信，员工只会收到必要通知，点击后安全进入此客服台。</div>`);
  const takeover = phone('顾先生', `<div class="svc-take-state"><i></i>人工接待中 <button>交还AI</button></div><div class="svc-chat-area staff-area"><div class="svc-user-bubble">昨天的双人餐可以退一部分吗？</div><div class="svc-system-line">AI已停止回复 · 你在14:31接管</div><div class="svc-staff-draft"><span>${icon('logo')} AI草拟</span><p>我先为您登记并核对门店实际使用情况，预计30分钟内答复。</p><button>采用并编辑</button></div></div><div class="svc-bottom-input"><button>${icon('plus')}</button><span>输入人工回复</span><button class="send-text">发送</button></div>`);
  return `<section class="service-mobile-board"><header><div><span>自研在线AI客服 · 消费者与员工两端</span><h1>顾客留在小程序里问，员工在乐趣宝里接管</h1><p>企业微信只做内部通知和快捷入口，不读取员工外部私聊，也不冒充员工自动回复。</p></div><em>AI接待 → 风险识别 → 人工接管 → 明确交还AI</em></header><div class="svc-phones">${consumer}${fullChat}${queue}${takeover}</div></section>`;
}

const view = new URLSearchParams(location.search).get('view') || 'bao-delivery';
const views = {
  'bao-delivery': baoDelivery,
  'bao-merchant': baoMerchant,
  'bao-ecosystem': baoEcosystem,
  'bao-mobile': baoMobileBoard,
  'bao-miniprogram': baoMiniprogram,
  'bao-service': baoService,
  'bao-value': baoValue,
  'service-mobile': serviceMobileBoard,
  'life-home': lifeHomeBoard,
  'life-tabs': tabsBoard,
  'life-details': detailsBoard,
  'life-kit': kitBoard
};
app.innerHTML = (views[view] || views['bao-delivery'])();
