export interface AdminNode {
  readonly id: string
  readonly title: string
  readonly summary: string
  readonly badge?: string
  readonly children?: readonly AdminNode[]
}

export interface AdminModule extends AdminNode {
  readonly icon: string
  readonly accent: string
}

const leaf = (id: string, title: string, summary: string, badge?: string): AdminNode => ({
  id,
  title,
  summary,
  ...(badge === undefined ? {} : { badge }),
})

export const adminModules: readonly AdminModule[] = [
  {
    id: 'network', title: '城市与商家网络', icon: '城', accent: '#3478F6',
    summary: '城市、服务商、商户、门店与经营健康度',
    children: [
      {
        id: 'cities', title: '城市网络', summary: '开城状态、目标、服务商和区域指标',
        children: [{
          id: 'shanghai', title: '上海城市中心', summary: '团队、商家、收入、交付和风险',
          children: [{
            id: 'merchants', title: '商家列表', summary: '行业、区域、套餐、阶段和健康分',
            children: [{
              id: 'yunheli', title: '云和里餐饮', summary: '主体、合同、授权、门店和资产',
              children: [leaf('jingan', '静安店详情', '主体证照、营业状态、经营指标与审计时间线')],
            }],
          }],
        }],
      },
      leaf('providers', '城市服务商', '资质、区域、团队、分成和履约质量'),
      leaf('risk', '网络风险', '停业、资质、投诉、交付和续费风险'),
    ],
  },
  {
    id: 'miniapp', title: 'MiniApp Factory', icon: '微', accent: '#675CF6',
    summary: '模板、页面、构建、审核、灰度和回滚',
    children: [
      leaf('templates', '模板市场', '行业模板、白名单区块和适用版本'),
      leaf('projects', '商家项目', 'Schema、品牌主题、页面编排与内容资产'),
      leaf('releases', '发布中心', '预览、确认、审核、灰度、正式发布和回滚'),
      leaf('pipeline', '构建流水线', '构建、签名、上传、失败重试和发布证据'),
    ],
  },
  {
    id: 'geo', title: 'GEO OS', icon: 'G', accent: '#16B98C',
    summary: '事实、渠道一致性、内容计划、观测与实验',
    children: [
      leaf('entities', '实体与 POI', 'Entity Identity、门店映射和冲突合并'),
      leaf('facts', '事实与知识图谱', '来源、置信度、证据和新鲜度'),
      leaf('consistency', '渠道一致性', '字段映射、差异扫描和修复任务'),
      leaf('visibility', '可见性与归因', '访问、咨询、订单、内容和实验归因'),
    ],
  },
  {
    id: 'skills', title: 'Skill Network', icon: 'S', accent: '#8B5CF6',
    summary: 'Builder、Registry、测试、运行时和版本治理',
    children: [
      leaf('registry', 'Skill Registry', '发现、Manifest、授权、风险和状态'),
      leaf('certification', '认证中心', 'Schema、沙盒、回归、灰度和上线'),
      leaf('runtime', '运行监控', '成功率、P95、超时、重试和投诉'),
      leaf('versions', '版本治理', '暂停、回滚、废弃和影响分析'),
    ],
  },
  {
    id: 'commerce', title: '交易与供应链', icon: '交', accent: '#F6A723',
    summary: '商品、订单、支付、履约、售后和供应链',
    children: [
      leaf('catalog', '商品供应链', 'SPU/SKU、供应商、库存、价格和履约网络'),
      leaf('orders', '聚合订单', '本地生活、电商、缴费、票务和状态机'),
      leaf('payments', '支付中心', '支付、退款、分账、对账和异常'),
      leaf('after-sale', '售后中心', '申请、举证、裁决、冲正和审计', 'L3 审批'),
    ],
  },
  {
    id: 'voucher', title: '代金券与结算', icon: '券', accent: '#FF6B7A',
    summary: 'V1.6 规则、账本、佣金、结算和对账',
    children: [
      leaf('rules', '规则版本', '模式、比例、额度、加速池、有效期和开关'),
      leaf('ledger', '不可变账本', '发放、使用、退款冲正和负余额抵扣'),
      leaf('commission', '业绩佣金', '预计、锁定、已结、冲正和解释'),
      leaf('settlement', '结算对账', '商家、服务商、销售、税费和发票'),
    ],
  },
  {
    id: 'growth', title: '销售与订阅', icon: '增', accent: '#EC4899',
    summary: '销售组织、套餐、订阅、续费和渠道分成',
    children: [
      leaf('sales', '销售组织', '组织树、归属、保护期、绩效和佣金'),
      leaf('plans', '套餐定价', '基础、专业、Agent、连锁与周期'),
      leaf('subscriptions', '订阅生命周期', '开通、升级、降级、暂停、到期和续费'),
      leaf('channels', '渠道与应收', '渠道价、服务商分成、应收和发票'),
    ],
  },
  {
    id: 'ai', title: 'AI 策略与审批', icon: 'AI', accent: '#06B6D4',
    summary: '模型、策略、工具、RAG、评测和人工接管',
    children: [
      leaf('policies', '策略中心', '风险等级、工具白名单、预算和审批'),
      leaf('orchestrator', 'AI Orchestrator', '模型路由、上下文、工具调用和降级'),
      leaf('rag', '知识与 RAG', '租户隔离、事实引用、新鲜度和权限'),
      leaf('evaluation', '评测与接管', '离线集、线上指标、红队和人工接管'),
    ],
  },
  {
    id: 'governance', title: '风控、审计与开放', icon: '盾', accent: '#14B8A6',
    summary: '审批流、审计、连接器、实验和开放能力',
    children: [
      leaf('workflows', '工作流治理', '模板、节点、条件、SLA、转交和加签'),
      leaf('audit', '审计中心', '主体、操作、风险、证据和导出'),
      leaf('connectors', '连接器中心', '微信、地图、支付、短信、ERP 和凭证'),
      leaf('experiments', '实验平台', '分流、指标、护栏、停止和归因'),
    ],
  },
]

export function findAdminModule(id: string): AdminModule | undefined {
  return adminModules.find((module) => module.id === id)
}

export function findAdminNode(
  moduleId: string,
  path: readonly string[],
): AdminNode | undefined {
  const module = findAdminModule(moduleId)
  if (!module) return undefined
  if (path.length === 0) return module
  let nodes = module.children ?? []
  let current: AdminNode | undefined
  for (const segment of path) {
    current = nodes.find((node) => node.id === segment)
    if (!current) return undefined
    nodes = current.children ?? []
  }
  return current
}

export function adminBreadcrumbs(moduleId: string, path: readonly string[]): AdminNode[] {
  const module = findAdminModule(moduleId)
  if (!module) return []
  const result: AdminNode[] = [module]
  for (let index = 1; index <= path.length; index += 1) {
    const node = findAdminNode(moduleId, path.slice(0, index))
    if (!node) break
    result.push(node)
  }
  return result
}

export function adminDepth(node: AdminNode): number {
  if (!node.children?.length) return 1
  return 1 + Math.max(...node.children.map(adminDepth))
}
