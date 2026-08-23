const experiences = [
  {
    page: 'page-015',
    layout: 'material-capture',
    kicker: '商户建档 · 材料与语音',
    headline: '按材料类型采集、扫描、转写并保留原件',
    description: '文件和语音先经过类型、大小、安全与用途校验，再进入识别队列。',
    panels: [
      ['材料清单', '区分营业执照、门头、位置、菜单和补充证明'],
      ['上传与扫描', '展示上传进度、安全扫描和隔离原因'],
      ['语音转写', '原音与可修正转写共同保留，生产录音未验收时禁用'],
      ['任务关联', '说明材料将用于哪些字段、会话和交付任务'],
    ],
    actions: [
      ['查看识别结果', 'page-016'],
      ['查看原始材料', 'page-020'],
    ],
    guardrail: '材料未通过安全检查或超出声明目的时不可进入识别和交付。',
  },
  {
    page: 'page-016',
    layout: 'recognition-review',
    kicker: '商户建档 · 识别结果',
    headline: '逐字段核对候选值、置信度、冲突和来源',
    description: '低风险高置信字段可建议，主体、联系方式和发布范围仍需有权人员确认。',
    panels: [
      ['字段候选', '展示候选值、标准化结果和识别状态'],
      ['置信度', '区分可建议、需核对和无法判断，不用单一百分比替代判断'],
      ['冲突', '并列展示不同材料的候选值与来源'],
      ['确认状态', '区分 proposed、confirmed、rejected 和 conflict'],
    ],
    actions: [
      ['处理缺项追问', 'page-017'],
      ['查看字段来源', 'page-019'],
    ],
    guardrail: '高风险字段和冲突字段不能由 AI 自动确认或写入正式档案。',
  },
  {
    page: 'page-017',
    layout: 'missing-items',
    kicker: '商户建档 · 缺项追问',
    headline: '只追问阻断交付的缺项，并说明为什么需要',
    description: '问题按主体、门店、公开信息和交付依赖分组，已回答内容不重复询问。',
    panels: [
      ['阻断缺项', '展示缺少后无法继续的字段和依赖步骤'],
      ['建议补充', '展示能提高质量但不阻断当前任务的信息'],
      ['回答入口', '支持文字、材料或明确选择“暂不提供”'],
      ['恢复位置', '提交后返回原任务和原字段，不开启无关新会话'],
    ],
    actions: [
      ['返回识别结果', 'page-016'],
      ['进入确认变更', 'page-018'],
    ],
    guardrail: '不得为了提高资料完整度收集与当前任务无关的个人或经营信息。',
  },
  {
    page: 'page-018',
    layout: 'change-confirmation',
    kicker: '商户建档 · 确认变更',
    headline: '提交前逐项展示旧值、新值、影响范围和确认主体',
    description: '确认页不隐藏冲突、不合并不同风险级别，也不使用笼统的一键同意。',
    panels: [
      ['变更差异', '逐字段并列展示正式值与待确认候选值'],
      ['影响范围', '说明公开展示、合同、交付和历史引用是否受影响'],
      ['确认资格', '服务端校验当前身份能否确认该字段与资源'],
      ['提交回执', '成功后展示版本、操作者、时间和追踪号'],
    ],
    actions: [
      ['查看字段来源', 'page-019'],
      ['查看影响与发布', 'page-021'],
    ],
    guardrail: '确认按钮不能绕过字段级风险、版本冲突和服务端权限裁决。',
  },
  {
    page: 'page-019',
    layout: 'field-provenance',
    kicker: '商户建档 · 字段来源',
    headline: '从每个字段回到原件、识别事件和确认记录',
    description: '来源链保留原始值、规范化过程、模型或规则版本及人工决定。',
    panels: [
      ['原始片段', '定位材料页码、图片区域、语音时间段或业务记录'],
      ['提取过程', '记录识别方式、规则版本和规范化步骤'],
      ['候选历史', '保留被拒绝、被替代和存在冲突的候选值'],
      ['确认记录', '展示决定、操作者、权限范围、时间和追踪号'],
    ],
    actions: [
      ['查看原始材料', 'page-020'],
      ['返回识别结果', 'page-016'],
    ],
    guardrail: '修正字段只能追加新候选和决定，不能改写已经留证的来源历史。',
  },
  {
    page: 'page-020',
    layout: 'raw-materials',
    kicker: '商户建档 · 原始材料',
    headline: '在最小权限内查看原件、版本、哈希和保留状态',
    description: '原件与派生预览分离；下载、分享、删除和延长保留期分别授权。',
    panels: [
      ['原件信息', '展示服务端对象标识、文件类型、大小、哈希和上传时间'],
      ['安全结果', '展示扫描状态、隔离原因和允许的后续动作'],
      ['派生内容', '列出缩略图、OCR、转写和结构化字段版本'],
      ['保留策略', '说明到期时间、法律保留和删除状态'],
    ],
    actions: [
      ['查看字段来源', 'page-019'],
      ['返回材料采集', 'page-015'],
    ],
    guardrail: '没有下载权限时只能查看服务端允许的脱敏预览，不暴露对象存储地址。',
  },
  {
    page: 'page-021',
    layout: 'publication-impact',
    kicker: '商户建档 · 影响与发布',
    headline: '发布前核对渠道、可见人群、字段差异和回滚条件',
    description: '建档完成不等于已经对外发布；每个目标渠道都有独立状态和回执。',
    panels: [
      ['目标渠道', '区分内部档案、商家端、消费者端和第三方平台'],
      ['可见字段', '逐渠道列出公开、受限和不发布字段'],
      ['发布检查', '检查授权、敏感信息、格式、版本和依赖服务'],
      ['回滚条件', '说明失败、驳回或错误发布后的恢复方式'],
    ],
    actions: [
      ['返回确认变更', 'page-018'],
      ['查看后台任务', 'page-010'],
    ],
    guardrail: '发布属于高影响写操作，必须获得明确确认并保存目标渠道回执。',
  },
  {
    page: 'page-024',
    layout: 'today-revenue',
    kicker: '经营首页 · 今日与收益',
    headline: '把今日经营事实、异常和收益口径放在同一屏核对',
    description: '指标显示数据时间与统计口径；预估收益和已结算收益严格分开。',
    panels: [
      ['今日经营', '展示订单、核销、退款和服务任务的权威汇总'],
      ['待处理异常', '按资金、履约、交付和客户风险排序'],
      ['收益进度', '区分预估、待确认、可结算和已结算金额'],
      ['口径与时间', '展示数据截止时间、统计版本和钻取入口'],
    ],
    actions: [
      ['查看月度收益', 'page-037'],
      ['查看后台任务', 'page-010'],
    ],
    guardrail: '客户端汇总不能替代账本、结算单和服务端统计口径。',
  },
];

export const workbenchIntakeExperiences = Object.freeze(
  experiences.map((experience) =>
    Object.freeze({
      ...experience,
      panels: Object.freeze(experience.panels.map((panel) => Object.freeze(panel))),
      actions: Object.freeze(experience.actions.map((action) => Object.freeze(action))),
    }),
  ),
);

export const workbenchIntakeExperienceById = new Map(
  workbenchIntakeExperiences.map((experience) => [experience.page, experience]),
);
