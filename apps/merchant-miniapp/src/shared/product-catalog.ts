// Generated from packages/product-catalog. Do not edit this mirror directly.
export type ProductId = 'consumer' | 'merchant' | 'sales' | 'provider'

export interface ProductNavNode {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly icon: string
  readonly badge?: string
  readonly children?: readonly ProductNavNode[]
}

export interface ProductDefinition {
  readonly id: ProductId
  readonly name: string
  readonly englishName: string
  readonly identity: string
  readonly greeting: string
  readonly heroTitle: string
  readonly heroSummary: string
  readonly primaryAction: string
  readonly accent: string
  readonly modules: readonly ProductNavNode[]
}

const leaf = (
  id: string,
  title: string,
  summary: string,
  icon = '·',
  badge?: string,
): ProductNavNode => ({
  id,
  title,
  summary,
  icon,
  ...(badge === undefined ? {} : { badge }),
})

export const products: Readonly<Record<ProductId, ProductDefinition>> = {
  consumer: {
    id: 'consumer',
    name: '乐趣生活',
    englishName: 'LEQU LIFE',
    identity: '家庭生活主理人',
    greeting: '晚上好，知夏一家',
    heroTitle: '把生活交给懂你的 AI 管家',
    heroSummary: '从发现、比较到预订与履约，每一步由你确认。',
    primaryAction: '告诉 AI 你想做什么',
    accent: '#675CF6',
    modules: [
      {
        id: 'assistant', title: 'AI 管家', icon: '✦',
        summary: '文字、语音、图片与位置的多轮生活决策', badge: '原生入口',
        children: [
          {
            id: 'sessions', title: '对话与任务', icon: '⌁', summary: '上下文、家庭偏好与历史任务',
            children: [
              {
                id: 'input', title: '多模态输入', icon: '◎', summary: '文本、语音、图片和位置',
                children: [
                  {
                    id: 'plans', title: '方案卡片', icon: '◇', summary: '可比较、可修改、可追问的方案',
                    children: [
                      {
                        id: 'merchant', title: '商家与商品候选', icon: '⌂', summary: '事实依据、距离、价格和权益',
                        children: [
                          leaf('confirmation', '交易确认', '门店、时间、金额、联系人和规则快照', '✓', 'L2 强确认'),
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          leaf('voice', '语音管家', '实时转写、可中断回复与静音模式', '◉'),
          leaf('image', '看图问生活', '识别菜单、商品、票据和环境', '▣'),
        ],
      },
      {
        id: 'local-life', title: '本地生活', icon: '⌖', summary: '附近、地图、团购、预约和商家详情',
        children: [
          leaf('nearby', '附近好店', '按场景、距离、评分与家庭偏好筛选', '⌖'),
          leaf('map', '生活地图', '商圈、路线、停车与实时营业状态', '⌘'),
          leaf('deals', '团购与套餐', '到店套餐、可用时间和退款规则', '券'),
          leaf('merchant', '商家详情', '菜单、评价、证据、预约与 Skill 能力', '店'),
        ],
      },
      {
        id: 'commerce', title: '品质购物', icon: '◫', summary: '商品、购物车、结算、物流和售后',
        children: [
          leaf('catalog', '精选商品', '家庭需求驱动的商品与内容推荐', '品'),
          leaf('cart', '购物车', '跨店拆单、优惠选择与失效提醒', '车'),
          leaf('checkout', '结算台', '地址、配送、支付和订单快照', '付', '强确认'),
          leaf('after-sale', '物流与售后', '轨迹、退换货和平台介入', '售'),
        ],
      },
      {
        id: 'services', title: '生活服务', icon: '∞', summary: '缴费、出行、酒店、能源、票务与权益',
        children: [
          leaf('utility', '充值缴费', '手机号、生活缴费与历史账户', '充'),
          leaf('travel', '酒店交通', '行程方案、退改规则与同行人', '行'),
          leaf('energy', '加油充电', '附近站点、价格、空闲桩和导航', '能'),
          leaf('tickets', '票务权益', '演出、电影、景区和家庭权益', '票'),
        ],
      },
      {
        id: 'family', title: '家庭空间', icon: '⌂', summary: '成员、子账户、共享、地址、禁忌与权限',
        children: [
          leaf('members', '家庭成员', '身份、关系、儿童与长辈模式', '人'),
          leaf('sharing', '共享与代办', '共享订单、清单、日程与代付款', '共'),
          leaf('preferences', '地址与偏好', '常用地址、过敏原、口味和隐私', '心'),
          leaf('permissions', '家庭数据权限', '按成员管理可见、可用与审批范围', '锁'),
        ],
      },
      {
        id: 'orders', title: '订单与资产', icon: '▤', summary: '全渠道订单、卡包、会员、收藏与足迹',
        children: [
          leaf('all', '全部订单', '状态筛选、拆单、价格快照与发票', '单'),
          leaf('wallet', '卡包与会员', '代金券、会员权益与到期提醒', '卡'),
          leaf('favorites', '收藏与足迹', '商家、商品、内容与浏览历史', '藏'),
          leaf('messages', '消息中心', '交易、服务、家庭和系统通知', '信'),
        ],
      },
    ],
  },
  merchant: {
    id: 'merchant',
    name: '经营宝',
    englishName: 'LEQU MERCHANT',
    identity: '云和里 · 静安店',
    greeting: '今晚经营节奏良好',
    heroTitle: '把每一位到店客人经营成长期关系',
    heroSummary: '订单、会员、营销、资产与财务在一个驾驶舱协同。',
    primaryAction: '处理今日待办',
    accent: '#16B98C',
    modules: [
      {
        id: 'today', title: '今日', icon: '今', summary: '经营概览、待办、异常与 AI 建议', badge: '6 项待办',
        children: [
          leaf('tasks', '今日待办', '预约确认、核销、售后与内容审批', '办'),
          leaf('signals', '经营信号', '销售、客流、复购和异常波动', '势'),
          leaf('assistant', 'AI 建议', '可解释建议、影响范围与执行审批', '✦'),
        ],
      },
      {
        id: 'analytics', title: '经营分析', icon: '↗', summary: '收入、订单、客单、复购与渠道钻取',
        children: [
          leaf('revenue', '收入分析', '时段、门店、渠道、品类与商品贡献', '收'),
          leaf('customer', '顾客分析', '新老客、分层、留存、复购和流失', '客'),
          leaf('funnel', '转化漏斗', '曝光、访问、咨询、下单和履约', '斗'),
        ],
      },
      {
        id: 'catalog', title: '商品与服务', icon: '品', summary: 'SPU/SKU、套餐、预约时段、库存和价格',
        children: [
          leaf('products', '商品中心', 'SPU、SKU、规格、图片与上下架', '货'),
          leaf('service', '服务与套餐', '到店服务、组合套餐和适用门店', '套'),
          leaf('availability', '预约与库存', '时段、桌位、库存、限购和价格日历', '仓'),
        ],
      },
      {
        id: 'orders', title: '订单履约', icon: '单', summary: '团购、预约、电商、核销、退款和异常',
        children: [
          {
            id: 'all', title: '聚合订单', icon: '汇', summary: '跨渠道统一状态与履约队列',
            children: [
              {
                id: 'detail', title: '订单详情', icon: '详', summary: '商品、顾客、支付、价格与规则快照',
                children: [
                  {
                    id: 'service', title: '履约处理', icon: '履', summary: '接单、备货、预约、配送与核销',
                    children: [{
                      id: 'exception', title: '异常与售后', icon: '异',
                      summary: '退款、举证、平台介入和强确认', badge: '强确认',
                      children: [leaf('decision', '售后裁决', '责任、金额、凭证、通知与冲正快照', '裁', 'L3 审批')],
                    }],
                  },
                ],
              },
            ],
          },
          leaf('verify', '扫码核销', '验券、撤销核销和操作员留痕', '扫'),
        ],
      },
      {
        id: 'members', title: '会员经营', icon: '会', summary: '分层、标签、时间线、权益和召回',
        children: [
          leaf('segments', '会员分层', '价值、活跃、偏好和生命周期人群', '层'),
          leaf('profile', '会员画像', '标签、消费时间线、授权与触达记录', '像'),
          leaf('benefits', '权益与召回', '会员日、券包、任务和流失召回', '益'),
        ],
      },
      {
        id: 'growth', title: '营销增长', icon: '增', summary: '模板、会员日、团购、联盟和内容投放',
        children: [
          leaf('campaigns', '营销活动', '目标、人群、预算、内容和审批', '营'),
          leaf('alliance', '联盟营销', '异业合作、券规则、归因和结算', '盟'),
          leaf('content', '内容投放', '多渠道内容计划、发布与效果', '文'),
        ],
      },
      {
        id: 'assets', title: '数字资产', icon: '资', summary: '小程序、GEO、Skill 与内容资产中心',
        children: [
          leaf('miniapp', '小程序中心', '页面、版本、预览、确认和发布', '微'),
          leaf('geo', 'GEO 中心', '事实、渠道一致性、内容计划和观测', 'G'),
          leaf('skills', 'Skill 中心', '能力、授权、调用、风险和版本', 'S'),
        ],
      },
      {
        id: 'finance', title: '财务与设置', icon: '财', summary: '服务费、佣金、结算、发票、员工和订阅',
        children: [
          leaf('settlement', '结算中心', '账单、佣金、提现、发票和对账', '账'),
          leaf('organization', '主体与员工', '门店、营业时间、角色和操作权限', '组'),
          leaf('subscription', '订阅与设置', '套餐、续费、消息、连接器与安全', '设'),
        ],
      },
    ],
  },
  sales: {
    id: 'sales',
    name: '销售宝',
    englishName: 'LEQU SALES',
    identity: '上海一队 · 林一凡',
    greeting: '今天有 3 个高意向机会',
    heroTitle: '把下一步行动，放在最值得跟进的商家上',
    heroSummary: 'AI 体检、签约、归属和佣金都留下可解释证据。',
    primaryAction: '开始今日拜访',
    accent: '#FF6B7A',
    modules: [
      {
        id: 'today', title: '今日任务', icon: '今', summary: '重点商机、提醒和 AI 下一步建议', badge: '3 个机会',
        children: [
          leaf('priorities', '重点商机', '按意向、时效、价值和风险排序', '重'),
          leaf('schedule', '任务日程', '拜访、回访、签约和到期提醒', '程'),
          leaf('next-best-action', 'AI 下一步', '依据、建议话术和可执行动作', '✦'),
        ],
      },
      {
        id: 'leads', title: '线索与商家', icon: '索', summary: '列表、筛选、地图、归属和保护期',
        children: [
          {
            id: 'pool', title: '线索池', icon: '池', summary: '来源、分配、保护期和重复线索',
            children: [
              {
                id: 'detail', title: '商家详情', icon: '详', summary: '主体、门店、联系人和机会阶段',
                children: [
                  {
                    id: 'timeline', title: '跟进时间线', icon: '线', summary: '拜访、沟通、资料和下一步动作',
                    children: [{
                      id: 'action', title: '记录跟进', icon: '记',
                      summary: '纪要、附件、结果、失单原因和提醒',
                      children: [leaf('confirmation', '跟进确认', '归属、下一步、提醒时间与审计摘要', '确')],
                    }],
                  },
                ],
              },
            ],
          },
          leaf('map', '商机地图', '区域密度、路线规划和附近线索', '图'),
          leaf('ownership', '归属与申诉', '转移、协作、保护期和争议证据', '属'),
        ],
      },
      {
        id: 'diagnosis', title: 'AI 体检', icon: '检', summary: '免费诊断、问题明细和数字化提案',
        children: [
          leaf('capture', '采集资料', '门头、执照、菜单、渠道和访谈', '采'),
          leaf('report', '体检报告', '健康分、问题证据、同行基准和机会', '报'),
          leaf('proposal', '生成提案', '方案、范围、价值、周期和风险说明', '案'),
        ],
      },
      {
        id: 'contract', title: '签约中心', icon: '签', summary: '分步向导、草稿、套餐、授权和电子合同',
        children: [
          leaf('wizard', '签约向导', '主体、套餐、价格、授权、支付和签署', '导'),
          leaf('drafts', '合同草稿', '自动保存、版本差异和继续签约', '稿'),
          leaf('discount', '折扣审批', '权限额度、审批链和定价证据', '折'),
        ],
      },
      {
        id: 'performance', title: '业绩佣金', icon: '绩', summary: '目标、预计/已结佣金、冲正和解释',
        children: [
          leaf('goals', '目标进度', '月/季目标、阶段转化和差距', '标'),
          leaf('commission', '佣金明细', '预计、锁定、已结、冲正与规则版本', '佣'),
          leaf('ranking', '个人排行', '同级比较、质量分与合规扣分', '榜'),
        ],
      },
      {
        id: 'team', title: '团队成长', icon: '队', summary: '组织树、晋降级、绩效、培养和排行',
        children: [
          leaf('organization', '组织与成员', '层级、区域、角色和在职状态', '组'),
          leaf('coaching', '绩效与培养', '过程指标、能力雷达和辅导计划', '育'),
          leaf('learning', '培训与素材', '课程、考试、案例、话术和规则', '学'),
        ],
      },
      {
        id: 'copilot', title: 'AI 销售助手', icon: '✦', summary: '拜访准备、话术、异议模拟、纪要与提案',
        children: [
          leaf('prep', '拜访准备', '商家背景、关键人、机会和问题清单', '备'),
          leaf('roleplay', '话术与异议模拟', '情景演练、反馈和合规提醒', '练'),
          leaf('notes', '纪要与跟进', '结构化纪要、待办和 CRM 回写审批', '纪'),
        ],
      },
    ],
  },
  provider: {
    id: 'provider',
    name: '城市服务商工作台',
    englishName: 'LEQU CITY OPS',
    identity: '上海城市中心',
    greeting: '本周交付准时率 96.8%',
    heroTitle: '让每个商家的数字化交付，都清晰可验收',
    heroSummary: '从本地线索到续费，用阶段、工单与 SLA 管住结果。',
    primaryAction: '查看交付焦点',
    accent: '#3478F6',
    modules: [
      {
        id: 'today', title: '今日焦点', icon: '今', summary: '交付、SLA、续费和异常优先级', badge: '4 项风险',
        children: [
          leaf('delivery', '交付待办', '阶段卡点、商家确认和今日截止', '交'),
          leaf('sla', 'SLA 风险', '即将超时、已升级和负责人负载', '时'),
          leaf('renewal', '续费提醒', '30/15/7/1 天续费机会', '续'),
        ],
      },
      {
        id: 'local-sales', title: '本地增长', icon: '增', summary: '线索池、销售分配、体检、合同和套餐',
        children: [
          leaf('leads', '城市线索池', '来源、分配、保护期和冲突', '索'),
          leaf('diagnosis', '体检与提案', '免费诊断、报告和签约提案', '检'),
          leaf('contracts', '合同与套餐', '签约、折扣、支付和六层授权', '签'),
        ],
      },
      {
        id: 'delivery', title: '交付中心', icon: '交', summary: '九阶段看板、工单、附件和商家确认',
        children: [
          {
            id: 'board', title: '九阶段看板', icon: '板', summary: '建档到运营的 WIP、负责人和时限',
            children: [
              {
                id: 'merchant', title: '商家交付空间', icon: '商', summary: '里程碑、证据、风险和沟通记录',
                children: [
                  {
                    id: 'work-order', title: '交付工单', icon: '单', summary: '类型、负责人、截止时间和附件',
                    children: [{
                      id: 'acceptance', title: '商家验收', icon: '验',
                      summary: '内容快照、确认人、异议和审计证据', badge: 'L2 确认',
                      children: [leaf('archive', '验收归档', '版本、签名、交付证据与 SLA 结果', '档')],
                    }],
                  },
                ],
              },
            ],
          },
          leaf('sla', 'SLA 与升级', '规则、倒计时、自动升级和处理时间线', '时'),
        ],
      },
      {
        id: 'geo', title: 'GEO 交付', icon: 'G', summary: '九维评分、渠道一致性、内容与可见性观测', badge: 'AI 可解释',
        children: [
          leaf('identity', '实体与 POI', '品牌、门店、别名、地址、迁移与置信度', '实'),
          leaf('consistency', '渠道一致性', '字段映射、差异扫描、修复与发布证据', '一'),
          leaf('content', '内容与观测', '问题词、场景词、计划、提及与转化归因', '观'),
        ],
      },
      {
        id: 'skills', title: 'Skill Network', icon: 'S', summary: 'Manifest、测试、认证、调用与质量监测', badge: '3 项标准能力',
        children: [
          leaf('builder', 'Skill Builder', '输入输出 Schema、Scope、风险、SLA 与适配器', '建'),
          leaf('certification', '测试与认证', '契约测试、风险策略、认证、灰度与上线', '证'),
          leaf('runtime', '运行与日志', '发现、授权、强确认、调用结果和 P95', '调'),
        ],
      },
      {
        id: 'renewals', title: '续费经营', icon: '续', summary: '提醒、提案、升级、续费和流失原因',
        children: [
          leaf('pipeline', '续费漏斗', '到期分层、负责人、概率和下一步', '漏'),
          leaf('proposal', '续费提案', '效果证据、套餐建议和升级价值', '案'),
          leaf('churn', '流失分析', '原因、竞品、可挽回动作和复盘', '失'),
        ],
      },
      {
        id: 'network', title: '城市商家', icon: '城', summary: '商家网络、健康度、收入与区域隔离',
        children: [
          leaf('merchants', '商家网络', '状态、行业、区域、套餐和健康分', '网'),
          leaf('quality', '交付质量', '完成率、平均时长、返工和满意度', '质'),
          leaf('permissions', '区域数据权限', '城市、团队、商家和字段范围', '权'),
        ],
      },
      {
        id: 'metrics', title: '城市经营', icon: '数', summary: '收入、续费率、交付时长、GMV 与结算',
        children: [
          leaf('dashboard', '城市仪表盘', '关键指标、趋势、目标和风险', '盘'),
          leaf('income', '收益结算', '订阅分成、服务收入、调整与发票', '财'),
          leaf('benchmark', '同城基准', '行业、区域和团队可比指标', '比'),
        ],
      },
    ],
  },
}

export function getProduct(productId: ProductId): ProductDefinition {
  return products[productId]
}

export function findNode(
  productId: ProductId,
  path: readonly string[],
): ProductNavNode | undefined {
  let candidates = products[productId].modules
  let current: ProductNavNode | undefined
  for (const segment of path) {
    current = candidates.find((node) => node.id === segment)
    if (!current) return undefined
    candidates = current.children ?? []
  }
  return current
}

export function breadcrumbs(
  productId: ProductId,
  path: readonly string[],
): ProductNavNode[] {
  const result: ProductNavNode[] = []
  for (let index = 1; index <= path.length; index += 1) {
    const node = findNode(productId, path.slice(0, index))
    if (!node) break
    result.push(node)
  }
  return result
}

export function catalogDepth(nodes: readonly ProductNavNode[]): number {
  if (nodes.length === 0) return 0
  return Math.max(...nodes.map((node) => 1 + catalogDepth(node.children ?? [])))
}
