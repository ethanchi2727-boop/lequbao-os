const experiences = [
  {
    page: 'page-037',
    layout: 'monthly-revenue',
    kicker: '收益结算 · 月度总览',
    headline: '从收入基数、直接成本、规则快照到结算状态逐层核对',
    description: '总览区分预估、已确认、可结算、已结算和争议中金额。',
    panels: [
      ['月份与口径', '展示结算月份、数据截止时间和规则版本'],
      ['收益分层', '拆分预估、确认、结算、冲正和冻结金额'],
      ['异常提示', '突出缺凭证、成本异常、比例冲突和争议'],
      ['商户钻取', '从汇总进入单商户收入、成本和分配明细'],
    ],
    actions: [
      ['查看商户收益明细', 'page-038'],
      ['查看直接成本', 'page-039'],
    ],
    guardrail: '月度汇总不能作为付款指令，最终结算以服务端账本和审批状态为准。',
  },
  {
    page: 'page-038',
    layout: 'merchant-revenue',
    kicker: '收益结算 · 商户明细',
    headline: '按商户核对收入事件、成本、比例版本和分配结果',
    description: '每笔汇总可以下钻到事件和凭证，避免只展示不可解释的净额。',
    panels: [
      ['收入事件', '按订单、订阅或服务事件展示计入基数'],
      ['成本扣减', '关联直接成本类型、金额和凭证状态'],
      ['比例版本', '展示本周期实际使用的收益权与内部比例快照'],
      ['分配结果', '展示各受益人金额、舍入、冻结和冲正'],
    ],
    actions: [
      ['查看直接成本', 'page-039'],
      ['返回月度总览', 'page-037'],
    ],
    guardrail: '商户明细的客户端合计不能替代服务端账本分录和结算版本。',
  },
  {
    page: 'page-039',
    layout: 'direct-costs',
    kicker: '收益结算 · 直接成本',
    headline: '按类型、商户、周期和凭证核对直接成本',
    description: '成本必须有适用规则和证据，不能用不透明的总额直接扣减收益。',
    panels: [
      ['成本类型', '区分支付、短信、渠道、交付和经批准的其他直接成本'],
      ['归属范围', '展示商户、事件、周期和分摊方法'],
      ['凭证状态', '区分待补、待审、有效、驳回和过期'],
      ['异常处理', '展示重复、超额、跨期和无法匹配事件'],
    ],
    actions: [
      ['查看成本凭证', 'page-040'],
      ['返回商户收益', 'page-038'],
    ],
    guardrail: '缺少规则或有效凭证的成本不能自动进入可结算扣减。',
  },
  {
    page: 'page-040',
    layout: 'cost-evidence',
    kicker: '收益结算 · 成本凭证',
    headline: '核对成本原件、结构化字段、关联事件和审批决定',
    description: '原始凭证与提取结果并列展示，修改只能形成新版本。',
    panels: [
      ['凭证原件', '展示类型、哈希、上传者、安全状态和保留策略'],
      ['提取字段', '展示金额、日期、对方、税额和置信度'],
      ['事件关联', '展示对应商户、订单、服务或分摊批次'],
      ['审核记录', '展示决定、理由、操作者、时间和追踪号'],
    ],
    actions: [
      ['返回直接成本', 'page-039'],
      ['返回月度总览', 'page-037'],
    ],
    guardrail: '凭证图片和 OCR 结果不能直接生成成本扣减，必须通过服务端审核流程。',
  },
];

export const workbenchRevenueExperiences = Object.freeze(experiences);
export const workbenchRevenueExperienceById = new Map(
  workbenchRevenueExperiences.map((experience) => [experience.page, experience]),
);
