import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '02_完整PRD页面树与状态机', '页面树与页面契约');
fs.mkdirSync(out, { recursive: true });

const definitions = {
  '乐趣宝|PC与移动H5': [
    'AI工作台>新建与执行>新对话','AI工作台>新建与执行>普通对话','AI工作台>新建与执行>复杂任务','AI工作台>新建与执行>成果预览','AI工作台>新建与执行>来源与工具轨迹',
    'AI工作台>会话管理>会话列表','AI工作台>会话管理>后台任务','AI工作台>会话管理>材料与来源','AI工作台>会话管理>身份与空间切换',
    'AI工作台>商家资料对话>开始建档','AI工作台>商家资料对话>材料与语音','AI工作台>商家资料对话>识别结果','AI工作台>商家资料对话>缺项追问','AI工作台>商家资料对话>确认变更','AI工作台>商家资料对话>确认变更>字段来源','AI工作台>商家资料对话>确认变更>字段来源>原始材料','AI工作台>商家资料对话>影响与发布',
    '商务中心>商务首页>今日与收益','商务中心>商机管理>商机列表','商务中心>商机管理>商机详情','商务中心>商机管理>重复与归属检查','商务中心>签约与开通>套餐报价','商务中心>签约与开通>合同与收款','商务中心>商户归属权>永久收益权','商务中心>商户归属权>多人内部比例','商务中心>商户归属权>争议与转让','商务中心>收益账户>月度收益总览','商务中心>收益账户>商户收益明细','商务中心>收益账户>商户收益明细>直接成本明细','商务中心>收益账户>商户收益明细>直接成本明细>成本凭证','商务中心>收益账户>待结与已结','商务中心>收益账户>退款冲回','商务中心>收益账户>收益申诉','商务中心>续费管理>续费列表','商务中心>续费管理>续费详情',
    '商户交付>线索与签约>商户线索','商户交付>线索与签约>订阅开通','商户交付>一键交付>新建交付任务','商户交付>一键交付>交付任务详情','商户交付>一键交付>商户确认页','商户交付>一键交付>交付验收与回执',
    '商户交付>小程序发布>小程序实例','商户交付>小程序发布>微信授权','商户交付>小程序发布>名称与类目','商户交付>小程序发布>模板配置','商户交付>小程序发布>体验版预览','商户交付>小程序发布>审核驳回处理','商户交付>小程序发布>审核与发布','商户交付>小程序发布>审核与发布>审核详情','商户交付>小程序发布>审核与发布>审核详情>驳回原因与修正','商户交付>小程序发布>版本升级与回滚',
    '商户交付>GEO服务>商家主档','商户交付>GEO服务>渠道发布状态','商户交付>GEO服务>一致性巡检','商户交付>工作台开通>组织与员工','商户交付>工作台开通>套餐权益','商户交付>AI客服开通>知识初始化','商户交付>AI客服开通>上线测试',
    '门店经营>经营总览>今日经营','门店经营>资料与知识>资料对话','门店经营>资料与知识>AI整理结果','门店经营>资料与知识>待确认变更','门店经营>资料与知识>发布影响','门店经营>商品与团购>商品管理','门店经营>商品与团购>团购管理','门店经营>商品与团购>活动发布确认',
    '门店经营>订单履约>订单列表','门店经营>订单履约>订单详情','门店经营>订单履约>订单详情>售后记录','门店经营>订单履约>订单详情>售后记录>部分退款详情','门店经营>订单履约>核销工作台','门店经营>订单履约>退款与售后','门店经营>订单履约>每日对账',
    'AI客服与客户>客服工作台>会话队列','AI客服与客户>客服工作台>会话详情','AI客服与客户>客服工作台>会话详情>订单上下文','AI客服与客户>客服工作台>会话详情>订单上下文>退款审批','AI客服与客户>客服工作台>值班与分配','AI客服与客户>客户档案>客户列表','AI客服与客户>客户档案>持续客户档案','AI客服与客户>客户档案>客户分组与任务','AI客服与客户>知识与质检>知识库','AI客服与客户>知识与质检>客服质检','AI客服与客户>企业微信连接>组织授权','AI客服与客户>企业微信连接>连接健康',
    '会员与奖励>会员管理>会员列表','会员与奖励>消费奖励>奖励规则','会员与奖励>消费奖励>奖励流水',
    '经营分析>价值报告>月度价值报告','经营分析>经营分析>销售与核销','经营分析>经营分析>客服与转化','经营分析>经营分析>GEO健康',
    '插件与技能>插件中心>插件目录','插件与技能>插件中心>插件详情','插件与技能>技能中心>技能目录','插件与技能>开发者提交>提交审核',
    '套餐与设置>套餐用量>当前套餐','套餐与设置>套餐用量>AI服务用量','套餐与设置>组织权限>员工与角色','套餐与设置>组织权限>审计记录','套餐与设置>数据与隐私>数据导出与删除','套餐与设置>退订与迁移>退订处理',
    '平台控制台>商户运营>商户列表','平台控制台>商户运营>异常中心','平台控制台>套餐计费>权益配置','平台控制台>套餐计费>订阅与收益结算','平台控制台>收益规则>永久收益权台账','平台控制台>收益规则>分配规则版本','平台控制台>收益规则>成本目录','平台控制台>收益规则>月结批次','平台控制台>收益规则>月结批次>差异处理','平台控制台>收益规则>算力包净利润','平台控制台>收益规则>收益转让审批','平台控制台>渠道伙伴>伙伴与区域','平台控制台>插件治理>审核与熔断','平台控制台>模型与任务>模型路由与预算','平台控制台>模型与任务>任务与失败队列','平台控制台>安全与审计>临时支持授权','平台控制台>安全与审计>全局审计'
  ],
  '乐趣宝|移动端H5': [
    '移动工作台>首页>今日待办','移动工作台>AI建档>对话建档','移动工作台>AI建档>拍照与文件','移动工作台>AI建档>语音补充','移动工作台>AI建档>识别确认','移动工作台>商务交付>交付进度','移动工作台>商务交付>商户确认协助','移动工作台>商务收益>收益总览','移动工作台>商务收益>商户收益','移动工作台>商务收益>成本明细','移动工作台>客服>待接管会话','移动工作台>客服>人工会话','移动工作台>客服>客户档案摘要','移动工作台>核销>扫码核销','移动工作台>消息>内部通知','移动工作台>我的>身份与权限'
  ],
  '乐趣生活|微信小程序': [
    '生活>首页>城市与推荐','生活>分类>一级分类','生活>分类>分类商品列表','生活>搜索>综合搜索','生活>搜索>搜索结果',
    '商城>首页>商城精选','商城>商品>商品详情','商城>商品>规格选择','商城>商品>溯源报告','商城>活动>活动会场',
    '生活圈>首页>附近推荐','生活圈>商家>商家详情','生活圈>商家>门店地图','生活圈>团购>团购详情',
    '购物车>列表>购物车','结算>确认订单>地址与配送','结算>确认订单>优惠与奖励','结算>确认订单>订单确认','结算>支付>微信支付','结算>支付>支付结果',
    '我的>会员>会员首页','我的>订单>订单列表','我的>订单>订单详情','我的>订单>订单详情>售后记录','我的>订单>订单详情>售后记录>退款详情','我的>团购券>待使用券','我的>团购券>核销结果','我的>售后>申请售后','我的>售后>售后详情','我的>地址>地址管理','我的>发票>发票与抬头','我的>消费奖励>奖励明细','我的>设置>隐私与授权','我的>设置>订阅消息',
    'AI生活助手>对话>小满生活助手','AI生活助手>对话>订单与售后工具','客服与帮助>AI客服>乐趣生活客服','客服与帮助>工单>我的工单'
  ],
  '商家独立小程序模板实例|微信小程序': [
    '商家首页>首页>品牌与门店','商家首页>门店>门店信息','商家首页>门店>门店切换',
    '商品与团购>商品>商品列表','商品与团购>商品>商品详情','商品与团购>团购>团购列表','商品与团购>团购>团购详情',
    '购物与支付>购物车>购物车','购物与支付>结算>确认订单','购物与支付>支付>商家微信支付','购物与支付>支付>支付结果',
    '订单与核销>订单>订单列表','订单与核销>订单>订单详情','订单与核销>订单>订单详情>售后记录','订单与核销>订单>订单详情>售后记录>退款详情','订单与核销>团购券>我的券','订单与核销>团购券>券码详情',
    'AI店员>对话>半屏快速问','AI店员>对话>全屏会话','AI店员>对话>人工回复提醒',
    '会员与我的>会员>商家会员','会员与我的>售后>售后申请','会员与我的>售后>售后进度','会员与我的>设置>隐私与客户档案'
  ]
};

const critical = {
  '微信授权': ['商户管理员','完成商家管理员对微信第三方平台的官方授权','扫码授权;刷新权限;撤销连接','wechat-open;secret'],
  '审核与发布': ['商户管理员','提交微信审核，并在通过后由商家确认发布','提交审核;查看结果;发布;暂停','miniapp-release;wechat-open'],
  '持续客户档案': ['店长;客服','查看本商户内的事实、服务记录和有来源的偏好摘要','更正;删除申请;创建服务任务','customer;memory;privacy'],
  '会话详情': ['客服;店长','人工接管后回复顾客，AI停止对外自动回复','认领;回复;转派;交还AI','service-message;assignment'],
  '商家微信支付': ['消费者','向商家自己的微信支付商户号付款','支付;重试;查询真实状态','payment;order'],
  '月度价值报告': ['商户老板;商务只读','展示可核对的接待、成交、交付、健康和额度数据','分享;下载;查看统计口径','analytics;report'],
  '渠道发布状态': ['商户管理员;商务','展示资料发布与可访问性，不承诺外部收录或排名','授权;发布;验证;重试','geo;adapter'],
  '交付任务详情': ['商务;商户管理员','跟踪一键交付的步骤、等待、失败和人工待办','暂停;重试;继续;生成回执','delivery;job;receipt'],
  '奖励流水': ['商户财务','逐笔查看奖励生成、使用、过期与退款冲正','查询;对账;申请导出','reward-ledger'],
  '订阅与收益结算': ['总部财务','按实际到账、直接成本和规则版本计算三方收益','对账;锁定;结算;冲回','subscription-ledger;revenue-share'],
  '永久收益权': ['商务人员;总部财务','查看绑定商户、受益人、永久状态和规则版本','查看;申诉;发起转让','attribution;revenue-right'],
  '商户收益明细': ['商务人员','查看订阅实收、直接成本、可分配收益和本人份额','查看成本;查看规则;申诉','subscription;cost;revenue-share'],
  '直接成本明细': ['商务人员;总部财务','逐项查看可以对应到商户和服务月份的直接成本','查看凭证;申请复核','cost-allocation;audit'],
  '对话建档': ['商务;商户管理员','通过文字、图片、文件和语音完成商家资料整理','拍照;发送文件;发送语音;确认','merchant-intake;agent;attachment'],
  '识别确认': ['商务;商户管理员','核对AI提取字段、缺项、冲突和发布影响','更正;确认;继续','merchant-intake;confirmation']
};

function infoFor(title) {
  if (critical[title]) return critical[title];
  let role = '按页面权限';
  if (/平台|全局|模型路由|权益配置|异常中心/.test(title)) role = '总部授权角色';
  else if (/商户线索|商机|交付|建档|商务收益|归属权/.test(title)) role = '商务与区县合作伙伴';
  else if (/支付|商品详情|团购详情|购物车|订单确认|会员首页|我的券/.test(title)) role = '消费者';
  else if (/审计|对账|流水|结算|收益|成本/.test(title)) role = '财务或审计角色';
  else if (/客服|会话|工单/.test(title)) role = '客服与店长';
  else if (/设置|授权|插件|知识|员工/.test(title)) role = '商户管理员';
  const purpose = '完成“' + title + '”相关的查看、处理与异常恢复';
  const actions = /列表|目录|搜索/.test(title) ? '搜索;筛选;打开详情' : '查看;编辑或处理;确认;返回';
  let apis = 'tenant;permission;business';
  if (/订单|支付|退款|核销|售后/.test(title)) apis = 'order;payment;fulfillment;aftersale';
  else if (/客服|会话|知识|客户/.test(title)) apis = 'service;customer;knowledge';
  else if (/小程序|微信|模板|审核|体验版/.test(title)) apis = 'miniapp;wechat-open;release';
  else if (/GEO|地图|附近|定位/.test(title)) apis = 'geo;merchant-master';
  else if (/套餐|权益|用量|订阅|收益|成本|归属/.test(title)) apis = 'subscription;entitlement;usage;revenue-share';
  else if (/建档|材料|识别|缺项|字段来源/.test(title)) apis = 'merchant-intake;attachment;agent';
  return [role, purpose, actions, apis];
}

const rows = [];
const nodeMap = new Map();
let sequence = 1;
for (const [scope, paths] of Object.entries(definitions)) {
  const [product, terminal] = scope.split('|');
  for (const item of paths) {
    const titles = item.split('>');
    let parent = '';
    let key = scope;
    titles.forEach((title, index) => {
      key += '|' + title;
      let row = nodeMap.get(key);
      const leaf = index === titles.length - 1;
      if (!row) {
        const details = infoFor(title);
        row = {
          page_id: 'PAGE-' + String(sequence++).padStart(3, '0'),
          product,
          terminal,
          level: index + 2,
          parent_id: parent,
          title,
          route: leaf ? '/' + (product === '乐趣宝' ? 'bao' : product === '乐趣生活' ? 'life' : 'merchant') + '/page-' + String(sequence - 1).padStart(3, '0') : '',
          primary_role: leaf ? details[0] : '按子页面权限',
          purpose: leaf ? details[1] : '承载下级页面和统一导航',
          components: leaf ? '标题;筛选与搜索;内容区;状态反馈;主要操作;帮助与审计入口' : '导航;分组;权限提示',
          primary_actions: leaf ? details[2] : '进入下级页面',
          states: '默认;加载中;空数据;局部错误;无权限;停用;成功;可恢复失败',
          api_domains: leaf ? details[3] : '',
          priority: 'P0',
          acceptance: leaf ? '主任务可完成;异常可恢复;权限不越界;关键操作有反馈;事件已埋点' : '导航、路由和权限正确',
          is_leaf: leaf
        };
        nodeMap.set(key, row);
        rows.push(row);
      } else if (leaf) {
        row.is_leaf = true;
      }
      parent = row.page_id;
    });
  }
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

const fields = ['page_id','product','terminal','level','parent_id','title','route','primary_role','purpose','components','primary_actions','states','api_domains','priority','acceptance','is_leaf'];
const csv = [fields.join(','), ...rows.map(row => fields.map(field => csvCell(row[field])).join(','))].join('\n') + '\n';
fs.writeFileSync(path.join(out, '页面树.csv'), '\ufeff' + csv);
fs.writeFileSync(path.join(out, '页面树.json'), JSON.stringify(rows, null, 2) + '\n');

const leaves = rows.filter(row => row.is_leaf);
let markdown = '# 页面规格索引\n\n';
markdown += '本索引与《页面树.csv》一一对应，实际覆盖二级到六级页面。五级和六级用于审核修正、订单售后、退款审批等必须独立验收的深层任务。\n\n';
markdown += '每个叶子页必须处理默认、加载中、空数据、局部错误、无权限、停用、成功、可恢复失败八类状态。外部写操作必须有幂等键、确认、审计和失败恢复。\n\n';
markdown += '## 数量\n\n- 页面节点：' + rows.length + '\n- 可执行叶子页面：' + leaves.length + '\n\n';
for (const leaf of leaves) {
  const names = [];
  let current = leaf;
  while (current) {
    names.unshift(current.title);
    current = rows.find(row => row.page_id === current.parent_id);
  }
  markdown += '## ' + leaf.page_id + ' ' + names.join(' / ') + '\n\n';
  markdown += '- 产品与终端：' + leaf.product + ' / ' + leaf.terminal + '\n';
  markdown += '- 路由：' + leaf.route + '\n';
  markdown += '- 首要角色：' + leaf.primary_role + '\n';
  markdown += '- 要解决的事：' + leaf.purpose + '\n';
  markdown += '- 主要操作：' + leaf.primary_actions + '\n';
  markdown += '- 接口域：' + leaf.api_domains + '\n';
  markdown += '- 页面状态：' + leaf.states + '\n';
  markdown += '- 验收：' + leaf.acceptance + '\n\n';
}
fs.writeFileSync(path.join(out, '页面规格索引.md'), markdown);

const summary = {
  total_nodes: rows.length,
  leaf_pages: leaves.length,
  max_level: Math.max(...rows.map(row => row.level)),
  products: [...new Set(rows.map(row => row.product))],
  terminals: [...new Set(rows.map(row => row.terminal))]
};
fs.writeFileSync(path.join(out, '页面树统计.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
