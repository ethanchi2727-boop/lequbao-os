/* 乐趣宝与乐趣生活 V6.1 冻结效果图。本文件只增量覆盖，便于与 V5/V6 原型对照。 */

function baoSidebarV61(active = '商务中心', role = '南京区商务') {
  const items = [
    ['AI对话', 'chat'], ['商务中心', 'work'], ['商户交付', 'store'], ['商家经营', 'bag'],
    ['AI客服', 'bot'], ['GEO获客', 'map'], ['插件与技能', 'plug'], ['收益结算', 'file']
  ];
  return `<aside class="bao-side v61-side">
    <div class="bao-brand"><span>${icon('logo')}</span><div><b>乐趣宝</b><small>AI经营工作台</small></div></div>
    <button class="new-task">${icon('plus')} 新建AI任务 <kbd>Ctrl N</kbd></button>
    <div class="side-search">${icon('search')} 搜页面、商户或任务 <kbd>Ctrl K</kbd></div>
    <nav>${items.map(([name, glyph]) => `<div class="side-link ${name === active ? 'active' : ''}">${icon(glyph)}<span>${name}</span>${name === '商户交付' ? '<em>3</em>' : ''}</div>`).join('')}</nav>
    <div class="side-label">我的持续服务</div>
    <div class="recent active-dot"><i></i>拾味小馆·交付中</div>
    <div class="recent">叶子花店·资料待确认</div>
    <div class="recent">七月永久收益月结</div>
    <div class="side-grow"></div>
    <div class="identity-card"><span class="avatar">周</span><div><b>周子涵</b><small>${role} · 仅授权范围</small></div>${icon('dots')}</div>
  </aside>`;
}

function intakeRightPanel() {
  return `<aside class="task-panel intake-side"><div class="panel-tabs"><button class="active">建档 <em>6</em></button><button>来源 <em>4</em></button><button>执行记录</button><button class="panel-close">×</button></div>
    <div class="panel-body">
      <div class="intake-progress"><div><span>商户资料完整度</span><b>82%</b></div><i><em></em></i><p>AI已自动填好 21/25 个字段，还有 4 项需商家补充或确认。</p></div>
      <div class="field-group"><h3>已识别</h3>
        ${[['主体名称','南京拾味餐饮管理有限公司','99%'],['门店名称','拾味小馆（新街口店）','96%'],['统一信用代码','91320105MA•••729Q','99%'],['门店地址','秦淮区中山南路 18 号','91%']].map(x=>`<div class="field-row"><div><span>${x[0]}</span><b>${x[1]}</b></div><em>${x[2]}</em><button>修正</button></div>`).join('')}
      </div>
      <div class="field-group missing"><h3>待补充</h3><div class="missing-card"><span>${icon('warning')}</span><div><b>小程序名称由商家填写</b><p>系统可以给建议，不能代商家决定；最终以微信审核为准。</p></div><button>发补充链接</button></div><div class="missing-card"><span>${icon('warning')}</span><div><b>结算账户</b><p>需商家管理员自行授权，平台不代收消费款。</p></div><button>稍后处理</button></div></div>
      <div class="audit-note">${icon('check')} 每个字段保留原图、语音或定位来源；修正后不覆盖历史。</div>
    </div></aside>`;
}

function baoIntakeV61() {
  return `<section class="bao-app">${baoSidebarV61('AI对话')}<main class="bao-main">${topbar('拾味小馆·AI对话建档')}<div class="workspace">
    <section class="conversation intake-conversation"><div class="thread-head"><div><h1>新商户资料建档</h1><p><span class="live"></span>支持图片、PDF、门店定位与语音，系统自动整理</p></div><button class="thread-menu">${icon('dots')}</button></div>
      <div class="intake-date">今天 10:24</div>
      <div class="user-message intake-user">我在拾味小馆门店，要给他开通 898 基础版。这是营业执照、门头和微信定位，店长叫陈海。</div>
      <div class="upload-strip"><div class="upload-thumb license"><span>营业执照</span><b>统一社会信用代码</b><em>JPG · 2.8MB</em></div><div class="upload-thumb storefront"><span>门头照片</span><b>拾味小馆</b><em>HEIC · 4.1MB</em></div><div class="upload-file">${icon('location')}<div><b>微信门店定位</b><small>南京市秦淮区中山南路 18 号</small></div>${icon('check')}</div></div>
      <div class="assistant-message"><div class="ai-mark">${icon('logo')}</div><div class="ai-content"><div class="ai-title"><b>已识别并合并商户资料</b><span class="status-done">${icon('check')} 4个来源已核对</span></div><p>执照名称和门头名不一致属于正常品牌名情况。地址与定位相差 23 米，已按微信定位经纬度保留。</p>
        <div class="ai-extract-grid"><div><span>主体</span><b>南京拾味餐饮管理有限公司</b><em>置信度 99%</em></div><div><span>品牌/门店</span><b>拾味小馆·新街口店</b><em>置信度 96%</em></div><div><span>行业建议</span><b>中餐·家庭聚餐</b><em>来自门头与执照</em></div><div><span>联系人</span><b>陈海·店长</b><em>手机号待补充</em></div></div>
        <div class="ai-question"><span>${icon('mic')}</span><div><b>还差两件事</b><p>1. 请说一下营业时间；2. 把店长手机号发给我。小程序名称和公开联系方式稍后让商家点击确认。</p></div><button>按住说话</button></div>
        <div class="message-actions"><button>复制</button><button>查看来源</button><button>修正识别</button><button>查看建档</button><button>⋯</button></div>
      </div></div>${composer('继续说、拍照或把资料直接丢进来……')}
    </section>${intakeRightPanel()}</div></main></section>`;
}

function merchantRowsV61() {
  const rows = [
    ['拾味小馆','898基础版','2026-03-12','正常订阅','¥1,263.40','交付中'],
    ['叶子花店','898基础版','2026-04-08','正常订阅','¥1,118.73','资料待确认'],
    ['江南小馆','1980专业版','2026-01-19','正常订阅','¥2,698.51','持续运营'],
    ['青屿民宿','898基础版','2026-05-22','暂停续费','¥0.00','等待续费'],
    ['日光便利','1980专业版','2025-12-03','正常订阅','¥2,442.80','持续运营']
  ];
  return rows.map(r=>`<div class="business-row"><div class="merchant-cell"><span>${r[0][0]}</span><div><b>${r[0]}</b><small>永久归属权·只要续费就持续</small></div></div><span>${r[1]}</span><span>${r[2]}</span><span class="${r[3].includes('正常')?'status-ok':'status-pause'}">${r[3]}</span><b>${r[4]}</b><button>${r[5]} ${icon('right')}</button></div>`).join('');
}

function baoBusinessV61() {
  return `<section class="bao-app">${baoSidebarV61('商务中心')}<main class="bao-main">${topbar('商务中心·我的商户与收益')}<div class="business-workspace">
    <header class="business-head"><div><span>商务人员工作台</span><h1>商户开通、持续服务和永久收益，在一个地方看清楚</h1><p>权益归属与系统访问权分开；员工离岗后，按已确权规则继续结算。</p></div><button class="business-create">${icon('plus')} AI对话开通新商户</button></header>
    <div class="business-metrics"><div class="metric-feature"><span>本月预计可分配净收入</span><b>¥62,480.00</b><em>已扣除已约定直接成本</em><i>待财务锁定</i></div><div><span>我的商务份额 70%</span><b>¥43,736.00</b><em class="positive">较上月 +8.6%</em></div><div><span>持续订阅商户</span><b>48</b><em>2 家需要续费跟进</em></div><div><span>当月新签</span><b>6</b><em>已完成交付 4 家</em></div></div>
    <div class="business-grid"><section class="business-panel trend-panel"><div class="panel-title-v61"><div><b>近6个月持续收益</b><span>按月结单口径，退款按原订单冲回</span></div><button>查看口径</button></div><div class="trend-chart">${[42,55,48,66,74,88].map((h,i)=>`<div><span style="height:${h}%"><em>${i===5?'¥43,736':''}</em></span><b>${['3月','4月','5月','6月','7月','8月'][i]}</b></div>`).join('')}</div></section>
      <section class="business-panel share-panel"><div class="panel-title-v61"><div><b>本月分配结构</b><span>净收入池 ¥62,480</span></div><button>明细</button></div><div class="share-donut"><i></i><div><b>70%</b><span>商务人员</span></div></div><div class="share-legend"><span><i class="biz"></i>商务 70% <b>¥43,736</b></span><span><i class="zs"></i>尚智 10% <b>¥6,248</b></span><span><i class="life"></i>乐趣生活 20% <b>¥12,496</b></span></div></section></div>
    <section class="merchant-rights"><div class="rights-head"><div><span>商户永久归属权</span><h2>我的商户</h2></div><div class="rights-filters"><button class="active">全部 52</button><button>正常订阅 48</button><button>待跟进 4</button><button>${icon('search')} 搜商户</button></div></div><div class="business-table"><div class="business-table-head"><span>商户</span><span>套餐</span><span>确权日</span><span>订阅状态</span><span>本月我的预估</span><span>当前任务</span></div>${merchantRowsV61()}</div></section>
  </div></main></section>`;
}

function costLine(name, amount, note, tone='') {
  return `<div class="cost-line ${tone}"><div><b>${name}</b><span>${note}</span></div><em>${amount}</em></div>`;
}

function baoRevenueV61() {
  return `<section class="bao-app">${baoSidebarV61('收益结算')}<main class="bao-main">${topbar('2026年8月·订阅收益月结')}<div class="revenue-workspace">
    <header class="revenue-head"><div><span>结算单 LQ-RS-202608-0007</span><h1>2026年8月商户订阅收益</h1><p>口径：实际到账 − 退款 − 已约定可扣直接成本 = 可分配净收入池</p></div><div class="statement-state"><i></i><b>待财务锁定</b><span>8月31日 23:59 截止</span></div></header>
    <div class="formula-strip"><div><span>商户实际到账</span><b>¥80,820.00</b></div><i>−</i><div><span>退款</span><b>¥1,796.00</b></div><i>−</i><div><span>直接成本</span><b>¥16,544.00</b></div><i>=</i><div class="pool-result"><span>可分配净收入池</span><b>¥62,480.00</b></div></div>
    <div class="revenue-columns"><section class="revenue-card"><div class="revenue-card-head"><div><b>本月直接成本</b><span>仅扣合同已约定且可追溯到商户的实际发生数</span></div><button>导出凭证</button></div>${costLine('支付通道与税费','¥2,467.00','按到账流水逐笔归集')}${costLine('实际AI模型调用','¥8,842.00','按租户与任务用量计入；未用额度不计成本')}${costLine('云服务器与存储','¥2,115.00','按租户实际用量分摊')}${costLine('第三方接口','¥798.00','短信、OCR、地图与已授权服务')}${costLine('消费奖励实际成本','¥2,322.00','仅计入当月实际发生且归属本套餐的部分')}<div class="not-cost"><b>不允许在分配前扣除</b><span>未使用AI额度、通用研发、行政、品牌、办公与不可追溯公共成本。</span></div></section>
      <section class="revenue-card allocation-card"><div class="revenue-card-head"><div><b>分配结果</b><span>当净收入池小于0时按0计，不产生负分配</span></div><button>查看规则版本</button></div><div class="allocation-total"><span>可分配合计</span><b>¥62,480.00</b><em>100%</em></div><div class="allocation-line business"><i>70%</i><div><b>商务人员·周子涵</b><span>52家已确权商户，持续订阅就持续获得</span></div><em>¥43,736.00</em></div><div class="allocation-line zs"><i>10%</i><div><b>尚智招商公司</b><span>商业组织与区域招商支持</span></div><em>¥6,248.00</em></div><div class="allocation-line life"><i>20%</i><div><b>乐趣生活运营主体</b><span>产品、商户交付与持续服务</span></div><em>¥12,496.00</em></div><div class="refund-rule">${icon('refresh')} 后续发生退款，按原订单、原政策、原受益人比例冲回，不改写历史结算单。</div></section></div>
    <footer class="revenue-actions"><div>${icon('file')} 当前 178 笔到账、7 笔退款、314 条成本凭证已对账</div><button>退回更正</button><button class="primary">财务锁定并生成应付</button></footer>
  </div></main></section>`;
}

function baoMobileV61() {
  const chat = mobilePhone(`${baoMobileTop('AI对话建档','新商户·自动保存')}<div class="m-scroll v61-mobile-chat"><div class="mobile-ai-hello"><span>${icon('logo')}</span><div><b>把商家资料直接发给我</b><p>营业执照、门头照、定位、PDF或语音都可以。</p></div></div><div class="mobile-files"><div class="mini-license"><b>营业执照</b><span>JPG·2.8MB</span></div><div class="mini-location">${icon('location')}<b>拾味小馆</b><span>中山南路18号</span></div></div><div class="mobile-user-voice">3\" <i></i><span>店长叫陈海，早上十点到晚上十点。</span></div><div class="mobile-ai-answer"><span>${icon('logo')}</span><div><b>已填好 21/25 项</b><p>主体、地址、行业和营业时间已合并。还需店长手机号和商家确认的小程序名称。</p><button>查看建档</button></div></div><div class="mobile-composer"><button>${icon('plus')}</button><span>继续说或发资料……</span><button>${icon('mic')}</button><button class="send">${icon('arrow')}</button></div></div>`, '对话');
  const confirm = mobilePhone(`${baoMobileTop('商家确认','拾味小馆')}<div class="m-scroll v61-confirm"><div class="confirm-hero"><span>82%</span><div><b>资料基本齐全</b><p>确认以下关键信息后，AI再开始自动交付。</p></div></div>${[['订阅套餐','898元/月·基础版'],['小程序名称','拾味小馆优选'],['运营主体','南京拾味餐饮管理有限公司'],['公开联系电话','025-86•••6821']].map(x=>`<div class="confirm-field"><span>${x[0]}</span><b>${x[1]}</b><button>修改</button></div>`).join('')}<div class="confirm-warning">${icon('warning')} 小程序名称最终是否可用，以微信公众平台审核为准。</div><label class="confirm-check"><i>${icon('check')}</i><span>商家已核对主体、价格、公开信息和发布范围</span></label><button class="m-primary">确认并开始一键交付</button></div>`, '工作');
  const income = mobilePhone(`${baoMobileTop('我的持续收益','2026年8月')}<div class="m-scroll v61-income"><div class="income-mobile-card"><span>本月预估·商务 70%</span><b>¥43,736.00</b><em>净收入池待财务锁定</em><div><span>持续商户 48</span><span>新签 6</span></div></div><h3 class="m-section-title">我的商户</h3>${[['拾味小馆','¥1,263.40','正常订阅'],['江南小馆','¥2,698.51','正常订阅'],['叶子花店','¥1,118.73','待补资料'],['青屿民宿','¥0.00','暂停续费']].map(x=>`<div class="income-merchant"><span>${x[0][0]}</span><div><b>${x[0]}</b><p>永久归属权·${x[2]}</p></div><em>${x[1]}</em>${icon('right')}</div>`).join('')}<div class="mobile-right-note">${icon('check')} 只要商户持续订阅，已确权的 70% 商务份额持续有效；系统访问权可单独关闭。</div></div>`, '我的');
  const statement = mobilePhone(`${baoMobileTop('月结明细','LQ-RS-202608-0007')}<div class="m-scroll v61-statement"><div class="statement-mobile-head"><span>可分配净收入池</span><b>¥62,480</b><em>待财务锁定</em></div><div class="mobile-formula"><div><span>实际到账</span><b>¥80,820</b></div><div><span>退款</span><b>-¥1,796</b></div><div><span>直接成本</span><b>-¥16,544</b></div></div><h3 class="m-section-title">分配结果</h3><div class="mobile-allocation"><div class="biz"><i>70%</i><span>商务人员</span><b>¥43,736</b></div><div><i>10%</i><span>尚智</span><b>¥6,248</b></div><div><i>20%</i><span>乐趣生活</span><b>¥12,496</b></div></div><div class="mobile-cost-note"><b>未用AI额度不算成本</b><p>公司日常研发、行政、品牌与办公成本不能在分配前扣除。</p></div><button class="m-primary">查看 314 条成本凭证</button></div>`, '我的');
  return `<section class="bao-mobile-board v61-mobile-board"><header><div><span>乐趣宝·移动端 V6.1</span><h1>商务人员靠对话完成交付，也能随时看清持续收益</h1><p>资料直接扔给AI → 自动识别补齐 → 商家确认 → 后台自动交付</p></div><em>传统表单只作为修正与兜底</em></header><div class="bao-phones">${chat}${confirm}${income}${statement}</div></section>`;
}

const lifeSpriteMap = {
  vegetable:[0,0], meat:[1,0], rice:[2,0], dairy:[3,0], drink:[0,1], snack:[1,1], meal:[2,1], movie:[3,1],
  hotel:[0,2], clean:[1,2], car:[2,2], health:[3,2], child:[0,3], gift:[1,3], utility:[2,3], member:[3,3]
};

function spriteIconV61(type) {
  const p = lifeSpriteMap[type] || lifeSpriteMap.member;
  return `<span class="life-3d-icon" style="--sx:${p[0]};--sy:${p[1]}"><i></i></span>`;
}

const lifeHomeCategoriesV61 = [
  ['新鲜果蔬','vegetable'],['肉禽蛋水产','meat'],['米面粮油','rice'],['乳品烘焙','dairy'],['酒水饮料','drink'],
  ['休闲零食','snack'],['快手好菜','meal'],['纸品清洁','clean'],['健康养护','health'],['会员好券','member']
];

function categoryGridV61(items=lifeHomeCategoriesV61) {
  return `<div class="category-grid v61-category-grid">${items.map(c=>`<div role="button" tabindex="0">${spriteIconV61(c[1])}<span>${c[0]}</span></div>`).join('')}</div>`;
}

function lifeHomeContentV61() {
  return `${lifeTop()}${lifeSearch('搜今天要买的，或直接问小满')}
    <div class="life-v61-hero"><div class="hero-copy"><span>今日生活直供</span><h1>一日所需<br>新鲜送到家</h1><p>产地可溯·精选好货·售后有保障</p><b>新人满99减20</b></div><div class="hero-badges"><span>次日达</span><span>可售后</span></div><div class="hero-dots"><i></i><i></i><i></i></div></div>
    ${categoryGridV61()}
    <div class="life-promise"><span>${icon('check')} 源头直供</span><span>${icon('check')} 实付透明</span><span>${icon('check')} 售后无忧</span></div>
    <div class="life-promo-row"><button class="promo-coupon"><span>新人专享</span><b>¥20</b><em>满99可用</em><i>立即领</i></button><button class="promo-fast"><span>今日秒杀</span><b>15:00开抢</b><em>00:28:16</em></button></div>
    <div class="section-head v61-section"><div><h2>今日必买</h2><p>家庭高频复购，价格已核对</p></div><button>全部 ${icon('right')}</button></div>
    <div class="v61-products">${productCard('东北五常稻花香米','5kg·当季新米','69.9','rice','产地直供')}${productCard('每日鲜蔬组合','6种搭配·次日达','39.8','fruit','今日鲜达')}${productCard('家庭柔韧抽纸','24包整箱·无香','39.9','tissue','家庭常备')}${productCard('植物洗衣凝珠','52颗·温和护色','45.8','clean','限时直降')}</div>
    <div class="section-head v61-section"><div><h2>生活篮子</h2><p>AI按家庭消耗周期提醒补货</p></div><button>管理清单 ${icon('right')}</button></div><div class="v61-basket"><span>${icon('logo')}</span><div><b>本周建议补充 4 件</b><p>大米、抽纸、洗衣凝珠预计可用 12 天</p></div><button>一键加购</button></div>`;
}

function lifeHomeV61() {
  return `<section class="life-home-board v61-life-board"><div class="life-board-copy"><span>乐趣生活·V6.1 消费者首页</span><h1>既有中国生鲜小程序的鲜活感，又不变成乱哄哄的促销页</h1><p>数字供应链是首页主角；分类、优惠、价格、交付与售后一眼可懂。</p><div class="visual-points"><div><b>彩色立体分类图标</b><span>16个生活类目统一视觉语言</span></div><div><b>Banner整块可点</b><span>文字直接排在画面上，取消多余按钮</span></div><div><b>价格和优惠层级明确</b><span>橙色只用于交易，绿色表示服务与可信</span></div></div></div>${lifePhone(lifeHomeContentV61(),'生活','hero-phone v61-life-phone')}</section>`;
}

function lifeTabsV61() {
  return `<section class="life-tabs-board v61-tabs-board"><header><div><span>乐趣生活·五个一级栏目</span><h1>首页做生活直供，商城做商品，生活圈做附近团购</h1></div><p>消费者不再被“导购一次又导购一次”，进来就看商品、好店和自己的订单。</p></header><div class="v61-five-phones">${lifePhone(lifeHomeContentV61(),'生活','compact-phone mini-v61')}${lifePhone(mallContent(),'商城','compact-phone mini-v61')}${lifePhone(localContent(),'生活圈','compact-phone mini-v61')}${lifePhone(cartContent(),'购物车','compact-phone mini-v61')}${lifePhone(mineContent(),'我的','compact-phone mini-v61')}</div></section>`;
}

function lifeKitV61() {
  const all = [['新鲜果蔬','vegetable'],['肉禽蛋水产','meat'],['米面粮油','rice'],['乳品烘焙','dairy'],['酒水饮料','drink'],['休闲零食','snack'],['快手好菜','meal'],['影视休闲','movie'],['酒店住宿','hotel'],['纸品清洁','clean'],['洗车养护','car'],['健康养护','health'],['亲子教育','child'],['鲜花礼品','gift'],['生活缴费','utility'],['会员好券','member']];
  return `<section class="life-kit-board v61-kit"><header><div><span>乐趣生活·鲜活视觉资产</span><h1>Banner、16类立体图标、交易按钮与促销层级</h1></div><p>图标不再是素线稿；所有按钮有统一高度和明确状态。</p></header><div class="v61-kit-banner"><div class="kit-banner-copy"><span>今日生活直供</span><h2>一日所需，新鲜送到家</h2><p>产地可溯·品质严选·售后有保障</p></div><em>整块点击，不放“点进去看看”</em></div><div class="v61-kit-grid"><section><div class="kit-title"><b>16个丰满立体类目</b><span>64×64基准·透明底·可缩放</span></div><div class="v61-all-icons">${all.map(x=>`<div>${spriteIconV61(x[1])}<b>${x[0]}</b></div>`).join('')}</div></section><aside><div class="kit-title"><b>按钮与状态</b><span>44px主操作，文字不换行</span></div><button class="v61-btn buy">立即购买</button><button class="v61-btn cart">加入购物车</button><button class="v61-btn service">${icon('logo')} 问小满</button><button class="v61-btn outline">查看团购详情</button><button class="v61-btn loading"><i></i>正在提交</button><button class="v61-btn disabled">已售罄</button><div class="v61-color-note"><span><i class="orange"></i>橙色=交易</span><span><i class="green"></i>绿色=服务</span><span><i class="gray"></i>灰色=次级/禁用</span></div></aside></div></section>`;
}

const v61View = new URLSearchParams(location.search).get('view');
const v61Views = {
  'bao-intake': baoIntakeV61,
  'bao-business': baoBusinessV61,
  'bao-revenue': baoRevenueV61,
  'bao-mobile-v61': baoMobileV61,
  'life-home-v61': lifeHomeV61,
  'life-tabs-v61': lifeTabsV61,
  'life-kit-v61': lifeKitV61
};
if (v61Views[v61View]) document.querySelector('#app').innerHTML = v61Views[v61View]();
