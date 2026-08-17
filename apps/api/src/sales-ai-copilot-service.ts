import { createHash, randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { Principal } from '@lequ/auth'
import type {
  LeadStage,
  SalesAiArtifactKind,
  SalesAiArtifactSection,
  SalesAiArtifactSummary,
  SalesAiCopilotOverview,
  SalesAiEvidenceSummary,
  SalesAiLeadContextSummary,
  SalesAiObjectionType,
  SalesAiRoleplayEvaluation,
  SalesAiRoleplaySessionSummary,
  SalesAiRoleplayTurnSummary,
  SalesPerformanceActorSummary,
  SystemRole,
} from '@lequ/contracts'
import { DomainError } from './errors.js'

const RUN_ID = 'sales-ai-copilot-e6'
const PROVIDER = 'lequ-evidence-copilot'
const MODEL_VERSION = 'sales-copilot-context-v1'
const POLICY_VERSION = 'sales-ai-human-control-v1'

interface LeadRow {
  id: string
  tenant_id: string
  city_id: string
  name: string
  category: string
  contact_name: string
  owner_id: string
  stage: LeadStage
  health_score: number | null
  next_action: string
  next_action_at: string
  version: number
  created_at: string
  updated_at: string
}

interface ActorRow {
  user_id: string
  display_name: string
  roles: string
}

interface ArtifactRow {
  id: string
  artifact_key: string
  session_id: string
  lead_id: string
  kind: SalesAiArtifactKind
  revision: number
  status: 'DRAFT' | 'CONFIRMED'
  title: string
  summary: string
  content_json: string
  evidence_json: string
  guardrails_json: string
  model_version: string
  prompt_version: string
  policy_version: string
  generated_by: string
  confirmed_by: string | null
  confirmed_at: string | null
  created_at: string
}

interface SessionRow {
  id: string
  lead_id: string
  objection_type: SalesAiObjectionType
  scenario: string
  status: 'ACTIVE' | 'COMPLETED'
  model_version: string
  prompt_version: string
  policy_version: string
  created_at: string
  updated_at: string
}

interface TurnRow {
  id: string
  sequence: number
  session_id: string
  actor: 'CUSTOMER' | 'SALES' | 'COACH'
  content: string
  evaluation_json: string | null
  created_at: string
}

interface IdempotencyRow {
  request_hash: string
  response_json: string
}

export interface GenerateSalesAiArtifactInput {
  leadId: string
  kind: SalesAiArtifactKind
  objective: string
  contextNotes: string[]
}

export interface ConfirmSalesAiArtifactInput {
  artifactKey: string
  expectedRevision: number
  expectedLeadVersion: number
  confirmed: boolean
  crmWriteback?: {
    channel: 'PHONE' | 'WECHAT' | 'VISIT' | 'VIDEO'
    summary: string
    nextAction: string
    nextActionAt: string
  } | undefined
}

export interface StartSalesAiRoleplayInput {
  leadId: string
  objectionType: SalesAiObjectionType
  scenario: string
}

export interface ReplySalesAiRoleplayInput {
  sessionId: string
  response: string
}

interface ProviderContext {
  lead: LeadRow
  evidence: SalesAiEvidenceSummary[]
  objective: string
  contextNotes: string[]
}

interface ProviderDraft {
  title: string
  summary: string
  sections: SalesAiArtifactSection[]
}

export interface SalesAiProvider {
  readonly name: string
  readonly modelVersion: string
  generate(kind: SalesAiArtifactKind, context: ProviderContext): ProviderDraft
  opening(objectionType: SalesAiObjectionType, leadName: string): string
  evaluate(response: string): SalesAiRoleplayEvaluation
  nextCustomerTurn(objectionType: SalesAiObjectionType, attempt: number): string
}

function now(): string {
  return new Date().toISOString()
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function promptVersion(kind: SalesAiArtifactKind): string {
  return `sales-${kind.toLowerCase().replaceAll('_', '-')}-v1`
}

function stageLabel(stage: LeadStage): string {
  const labels: Record<LeadStage, string> = {
    NEW: '新线索',
    DIAGNOSED: '已完成 AI 体检',
    CONTRACT_DRAFT: '合同草案',
    SIGNED: '已签约',
    ASSET_REVIEW: '资料确认',
    READY_FOR_DELIVERY: '交付就绪',
    LOST: '已关闭',
  }
  return labels[stage]
}

function artifactTitle(kind: SalesAiArtifactKind, leadName: string): string {
  const labels: Record<SalesAiArtifactKind, string> = {
    PRE_VISIT_BRIEF: '拜访作战简报',
    TALK_TRACK: '顾问式沟通话术',
    MEETING_SUMMARY: '会议纪要草稿',
    NEXT_ACTION: '下一步行动建议',
    PROPOSAL: '价值提案草稿',
  }
  return `${leadName} · ${labels[kind]}`
}

function safeNotes(notes: string[]): string[] {
  return notes.map((note) => note.trim()).filter(Boolean).slice(0, 8)
}

export const evidenceSalesAiProvider: SalesAiProvider = {
  name: PROVIDER,
  modelVersion: MODEL_VERSION,
  generate(kind, context) {
    const facts = context.evidence.slice(0, 5).map(
      (item) => `${item.label}：${item.value}`,
    )
    const notes = safeNotes(context.contextNotes)
    const objective = context.objective.trim()
      || `推动${context.lead.name}明确下一步决策`
    const sharedRisk = [
      '不承诺未经审批的价格、效果、交付时间或平台资源',
      '出现不确定信息时回到事实证据，并明确待核实项',
    ]

    if (kind === 'PRE_VISIT_BRIEF') {
      return {
        title: artifactTitle(kind, context.lead.name),
        summary: `围绕“${objective}”组织事实、问题和会谈边界。`,
        sections: [
          { key: 'goal', title: '本次目标', items: [objective] },
          { key: 'facts', title: '已知事实', items: facts },
          {
            key: 'questions',
            title: '关键提问',
            items: [
              '当前获客、复购或履约中，最影响经营结果的环节是什么？',
              '谁参与最终决策，评估方案时最看重哪些证据？',
              '若先做小范围验证，什么结果可以支持进入下一步？',
            ],
          },
          { key: 'risks', title: '风险与边界', items: sharedRisk },
        ],
      }
    }

    if (kind === 'TALK_TRACK') {
      return {
        title: artifactTitle(kind, context.lead.name),
        summary: '从共识、诊断、证据到下一步的顾问式会谈路径。',
        sections: [
          {
            key: 'opening',
            title: '建立共识',
            items: [`今天希望先围绕“${objective}”核对现状，再判断是否值得进入下一步。`],
          },
          {
            key: 'discovery',
            title: '诊断追问',
            items: [
              '这个问题最近一次发生在什么时候，造成了什么实际影响？',
              '目前用了哪些办法，哪些环节仍然没有被解决？',
            ],
          },
          {
            key: 'value',
            title: '价值表达',
            items: facts.length
              ? [`基于已确认的事实：${facts.join('；')}。建议先验证最关键的一段闭环。`]
              : ['先补齐经营事实，再共同定义可验证的价值指标。'],
          },
          {
            key: 'close',
            title: '收口下一步',
            items: ['若今天的判断一致，我们共同确认负责人、时间和验证证据。'],
          },
        ],
      }
    }

    if (kind === 'MEETING_SUMMARY') {
      return {
        title: artifactTitle(kind, context.lead.name),
        summary: 'AI 已把原始记录整理为可核对草稿，确认前不会写入 CRM。',
        sections: [
          {
            key: 'raw',
            title: '会谈要点',
            items: notes.length ? notes : ['尚未提供会议原始记录，请补充后重新生成。'],
          },
          {
            key: 'agreement',
            title: '已形成共识',
            items: [objective, '以双方确认的事实和小范围验证结果作为后续决策依据。'],
          },
          {
            key: 'open',
            title: '待核实事项',
            items: ['决策人及审批节奏', '验证范围、成功标准和数据口径'],
          },
          {
            key: 'next',
            title: '建议下一步',
            items: [`确认“${context.lead.next_action}”的负责人和时间。`],
          },
        ],
      }
    }

    if (kind === 'NEXT_ACTION') {
      return {
        title: artifactTitle(kind, context.lead.name),
        summary: `基于当前 ${stageLabel(context.lead.stage)} 阶段生成，不会自动修改 CRM。`,
        sections: [
          { key: 'action', title: '建议动作', items: [objective || context.lead.next_action] },
          { key: 'why', title: '判断依据', items: facts },
          {
            key: 'success',
            title: '完成信号',
            items: ['负责人明确', '截止时间明确', '下一阶段所需证据可核验'],
          },
          { key: 'guardrail', title: '执行边界', items: sharedRisk },
        ],
      }
    }

    return {
      title: artifactTitle(kind, context.lead.name),
      summary: '从经营问题、解决路径、价值证据到实施节奏的提案草稿。',
      sections: [
        {
          key: 'challenge',
          title: '经营问题',
          items: [objective, ...facts.slice(0, 2)],
        },
        {
          key: 'solution',
          title: '解决路径',
          items: [
            '先完成经营事实与内容资产校准',
            '再上线可观测的小程序、GEO 与会员运营闭环',
            '以真实订单、复购和履约数据复盘效果',
          ],
        },
        {
          key: 'value',
          title: '价值证据',
          items: facts.length ? facts : ['价值结论必须补充可追溯事实后才能对外使用。'],
        },
        {
          key: 'plan',
          title: '推进计划',
          items: ['确认诊断范围', '确认方案与职责', '审批合同与授权', '进入交付验证'],
        },
        { key: 'boundary', title: '承诺边界', items: sharedRisk },
      ],
    }
  },
  opening(objectionType, leadName) {
    const openings: Record<SalesAiObjectionType, string> = {
      PRICE: `你们的方案听起来不错，但这个价格对${leadName}来说还是太高了。`,
      ROI: '我不能只听方案描述，你怎么证明这笔投入真的能带来回报？',
      TIMING: '我们最近很忙，这件事是不是可以过两个月再说？',
      AUTHORITY: '我个人觉得可以，但这件事我做不了最终决定。',
      COMPETITOR: '我们已经在看另一家服务商，他们报价更低、案例也不少。',
    }
    return openings[objectionType]
  },
  evaluate(response) {
    const empathy = /理解|确实|担心|顾虑|认同/.test(response) ? 92 : 68
    const evidence = /数据|体检|订单|会员|复购|转化|证据|案例/.test(response) ? 91 : 64
    const promiseMentions = [...response.matchAll(/保证|承诺/g)]
    const unsafePromise = promiseMentions.some((match) => {
      const index = match.index ?? 0
      const prefix = response.slice(Math.max(0, index - 14), index)
      return !/(不|不会|不能|无法|不得|拒绝|避免)/.test(prefix)
    })
    const unsafe = unsafePromise || /一定能|最低价|百分之百|绝对(?:能|会)/.test(response)
    const compliance = unsafe ? 42 : 96
    const nextStep = /下一步|确认|安排|试点|时间|一起/.test(response) ? 90 : 66
    const overallScore = Math.round((empathy + evidence + compliance + nextStep) / 4)
    const strengths = [
      ...(empathy >= 85 ? ['先回应了客户真实顾虑'] : []),
      ...(evidence >= 85 ? ['使用了可核验事实而非空泛承诺'] : []),
      ...(compliance >= 90 ? ['守住了价格与效果承诺边界'] : []),
      ...(nextStep >= 85 ? ['给出了清晰、低压力的下一步'] : []),
    ]
    const improvements = [
      ...(empathy < 85 ? ['先复述并确认客户顾虑，再进入方案说明'] : []),
      ...(evidence < 85 ? ['补充 CRM、体检或经营数据作为判断依据'] : []),
      ...(compliance < 90 ? ['删除绝对化承诺，改为可验证的阶段目标'] : []),
      ...(nextStep < 85 ? ['用负责人、时间和证据定义一个最小下一步'] : []),
    ]
    return {
      overallScore,
      empathyScore: empathy,
      evidenceScore: evidence,
      complianceScore: compliance,
      nextStepScore: nextStep,
      strengths,
      improvements,
    }
  },
  nextCustomerTurn(objectionType, attempt) {
    if (attempt >= 3) return '好，那你把刚才说的验证范围和下一步发我确认一下。'
    const followUps: Record<SalesAiObjectionType, string> = {
      PRICE: '即使先验证，我还是担心后面总投入会失控，你怎么控制？',
      ROI: '这些指标听起来合理，但具体用什么数据来判断？',
      TIMING: '如果现在开始，最少需要我们投入多少时间？',
      AUTHORITY: '你需要我把哪些材料带给最终决策人？',
      COMPETITOR: '除了价格，你们与另一家的差异到底怎么验证？',
    }
    return followUps[objectionType]
  },
}

function leadScope(principal: Principal, alias = 'lead'): {
  clause: string
  values: string[]
} {
  if (principal.dataScope === 'PLATFORM') return { clause: '', values: [] }
  if (principal.dataScope === 'CITY') {
    if (principal.cityIds.length === 0) return { clause: ' AND 0 = 1', values: [] }
    return {
      clause: ` AND ${alias}.city_id IN (${principal.cityIds.map(() => '?').join(', ')})`,
      values: [...principal.cityIds],
    }
  }
  return {
    clause: ` AND (
      ${alias}.owner_id = ? OR EXISTS (
        SELECT 1 FROM lead_collaborators collaborator
        WHERE collaborator.tenant_id = ${alias}.tenant_id
          AND collaborator.lead_id = ${alias}.id
          AND collaborator.user_id = ?
      )
    )`,
    values: [principal.subject, principal.subject],
  }
}

function readLeadRows(database: DatabaseSync, principal: Principal): LeadRow[] {
  const scope = leadScope(principal)
  return database.prepare(
    `SELECT lead.id, lead.tenant_id, lead.city_id, lead.name, lead.category,
            lead.contact_name, lead.owner_id, lead.stage, lead.health_score,
            lead.next_action, lead.next_action_at, lead.version,
            lead.created_at, lead.updated_at
     FROM leads lead
     WHERE lead.tenant_id = ?${scope.clause}
       AND lead.stage != 'LOST'
     ORDER BY lead.next_action_at, lead.updated_at DESC`,
  ).all(principal.tenantId, ...scope.values) as unknown as LeadRow[]
}

function getLead(
  database: DatabaseSync,
  principal: Principal,
  leadId: string,
): LeadRow {
  const lead = readLeadRows(database, principal).find((candidate) => candidate.id === leadId)
  if (!lead) {
    throw new DomainError(404, 'sales_ai_lead_not_found', '商机不存在或不在当前数据范围内')
  }
  return lead
}

function actorMap(
  database: DatabaseSync,
  tenantId: string,
): Map<string, SalesPerformanceActorSummary> {
  const rows = database.prepare(
    `SELECT users.id AS user_id, users.display_name,
            GROUP_CONCAT(role_assignments.role, ',') AS roles
     FROM users
     JOIN memberships
       ON memberships.user_id = users.id
      AND memberships.tenant_id = ?
      AND memberships.status = 'ACTIVE'
     JOIN role_assignments ON role_assignments.membership_id = memberships.id
     WHERE users.status = 'ACTIVE'
     GROUP BY users.id, users.display_name`,
  ).all(tenantId) as unknown as ActorRow[]
  return new Map(rows.map((row) => [
    row.user_id,
    {
      userId: row.user_id,
      displayName: row.display_name,
      roles: row.roles.split(',').filter(Boolean) as SystemRole[],
    },
  ]))
}

function requiredActor(
  actors: Map<string, SalesPerformanceActorSummary>,
  userId: string,
): SalesPerformanceActorSummary {
  const actor = actors.get(userId)
  if (!actor) throw new DomainError(409, 'sales_ai_actor_missing', 'AI 记录关联人员已停用')
  return actor
}

function evidenceForLead(
  database: DatabaseSync,
  lead: LeadRow,
): SalesAiEvidenceSummary[] {
  const evidence: SalesAiEvidenceSummary[] = [
    {
      label: 'CRM 阶段',
      value: stageLabel(lead.stage),
      sourceType: 'CRM',
      sourceId: lead.id,
      observedAt: lead.updated_at,
    },
    {
      label: '当前下一步',
      value: lead.next_action,
      sourceType: 'CRM',
      sourceId: lead.id,
      observedAt: lead.updated_at,
    },
  ]
  const diagnosis = database.prepare(
    `SELECT id, score, grade, generated_at
     FROM diagnosis_reports WHERE lead_id = ?`,
  ).get(lead.id) as {
    id: string
    score: number
    grade: string
    generated_at: string
  } | undefined
  if (diagnosis) {
    evidence.push({
      label: 'AI 体检',
      value: `${diagnosis.score} 分 · ${diagnosis.grade}`,
      sourceType: 'DIAGNOSIS',
      sourceId: diagnosis.id,
      observedAt: diagnosis.generated_at,
    })
  }
  const followUp = database.prepare(
    `SELECT id, summary, occurred_at
     FROM lead_followups WHERE lead_id = ?
     ORDER BY occurred_at DESC LIMIT 1`,
  ).get(lead.id) as {
    id: string
    summary: string
    occurred_at: string
  } | undefined
  if (followUp) {
    evidence.push({
      label: '最近跟进',
      value: followUp.summary,
      sourceType: 'FOLLOW_UP',
      sourceId: followUp.id,
      observedAt: followUp.occurred_at,
    })
  }
  const contract = database.prepare(
    `SELECT id, package_code, final_price_fen, status, updated_at
     FROM contract_drafts WHERE lead_id = ?
     ORDER BY updated_at DESC LIMIT 1`,
  ).get(lead.id) as {
    id: string
    package_code: string
    final_price_fen: number
    status: string
    updated_at: string
  } | undefined
  if (contract) {
    evidence.push({
      label: '合同草案',
      value: `${contract.package_code} · ¥${(contract.final_price_fen / 100).toLocaleString('zh-CN')} · ${contract.status}`,
      sourceType: 'CONTRACT',
      sourceId: contract.id,
      observedAt: contract.updated_at,
    })
  }
  evidence.push({
    label: '人控策略',
    value: 'AI 草稿未经本人确认不得写入 CRM 或对外发送',
    sourceType: 'POLICY',
    sourceId: POLICY_VERSION,
    observedAt: lead.updated_at,
  })
  return evidence
}

function leadContext(
  database: DatabaseSync,
  lead: LeadRow,
): SalesAiLeadContextSummary {
  const facts = evidenceForLead(database, lead)
    .filter((item) => item.sourceType !== 'POLICY')
    .map((item) => `${item.label}：${item.value}`)
  return {
    id: lead.id,
    name: lead.name,
    category: lead.category,
    contactName: lead.contact_name,
    stage: lead.stage,
    nextAction: lead.next_action,
    nextActionAt: lead.next_action_at,
    version: lead.version,
    healthScore: lead.health_score,
    recentFacts: facts,
  }
}

function artifactRows(
  database: DatabaseSync,
  principal: Principal,
  leadId: string,
): ArtifactRow[] {
  return database.prepare(
    `SELECT artifact.id, artifact.artifact_key, artifact.session_id,
            artifact.lead_id, artifact.kind, artifact.revision, artifact.status,
            artifact.title, artifact.summary, artifact.content_json,
            artifact.evidence_json, artifact.guardrails_json,
            artifact.model_version, artifact.prompt_version,
            artifact.policy_version, artifact.generated_by,
            artifact.confirmed_by, artifact.confirmed_at, artifact.created_at
     FROM sales_ai_artifact_revisions artifact
     WHERE artifact.tenant_id = ? AND artifact.lead_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM sales_ai_artifact_revisions newer
         WHERE newer.artifact_key = artifact.artifact_key
           AND newer.revision > artifact.revision
       )
     ORDER BY artifact.created_at DESC`,
  ).all(principal.tenantId, leadId) as unknown as ArtifactRow[]
}

function artifactSummary(
  row: ArtifactRow,
  actors: Map<string, SalesPerformanceActorSummary>,
): SalesAiArtifactSummary {
  return {
    id: row.id,
    artifactKey: row.artifact_key,
    leadId: row.lead_id,
    kind: row.kind,
    revision: row.revision,
    status: row.status,
    title: row.title,
    summary: row.summary,
    sections: parseJson<SalesAiArtifactSection[]>(row.content_json, []),
    evidence: parseJson<SalesAiEvidenceSummary[]>(row.evidence_json, []),
    guardrails: parseJson<string[]>(row.guardrails_json, []),
    modelVersion: row.model_version,
    promptVersion: row.prompt_version,
    policyVersion: row.policy_version,
    generatedBy: requiredActor(actors, row.generated_by),
    confirmedBy: row.confirmed_by ? requiredActor(actors, row.confirmed_by) : null,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
  }
}

function roleplaySessions(
  database: DatabaseSync,
  principal: Principal,
  leadId: string,
): SalesAiRoleplaySessionSummary[] {
  const sessions = database.prepare(
    `SELECT id, lead_id, objection_type, scenario, status, model_version,
            prompt_version, policy_version, created_at, updated_at
     FROM sales_ai_sessions
     WHERE tenant_id = ? AND lead_id = ? AND mode = 'ROLEPLAY'
     ORDER BY updated_at DESC`,
  ).all(principal.tenantId, leadId) as unknown as SessionRow[]
  if (sessions.length === 0) return []
  const ids = sessions.map(() => '?').join(', ')
  const turns = database.prepare(
    `SELECT id, sequence, session_id, actor, content, evaluation_json, created_at
     FROM sales_ai_roleplay_turns
     WHERE session_id IN (${ids}) ORDER BY sequence`,
  ).all(...sessions.map((session) => session.id)) as unknown as TurnRow[]
  return sessions.map((session) => {
    const sessionTurns: SalesAiRoleplayTurnSummary[] = turns
      .filter((turn) => turn.session_id === session.id)
      .map((turn) => ({
        id: turn.id,
        sequence: turn.sequence,
        actor: turn.actor,
        content: turn.content,
        evaluation: parseJson<SalesAiRoleplayEvaluation | null>(
          turn.evaluation_json,
          null,
        ),
        createdAt: turn.created_at,
      }))
    const latestEvaluation = [...sessionTurns].reverse()
      .find((turn) => turn.evaluation)?.evaluation ?? null
    return {
      id: session.id,
      leadId: session.lead_id,
      objectionType: session.objection_type,
      scenario: session.scenario,
      status: session.status,
      modelVersion: session.model_version,
      promptVersion: session.prompt_version,
      policyVersion: session.policy_version,
      turns: sessionTurns,
      latestEvaluation,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    }
  })
}

function recommendation(lead: LeadRow): {
  title: string
  rationale: string[]
  suggestedAt: string
  source: 'RULE_AND_MODEL'
} {
  const titles: Record<LeadStage, string> = {
    NEW: '先生成拜访简报，再确认经营问题与决策链',
    DIAGNOSED: '围绕体检证据生成话术与价值提案',
    CONTRACT_DRAFT: '先做异议模拟，再确认合同推进节点',
    SIGNED: '生成会议纪要并确认交付交接事项',
    ASSET_REVIEW: '核对资料缺口并形成下一步行动',
    READY_FOR_DELIVERY: '确认交付启动与商家成功标准',
    LOST: '复盘失单事实，不自动触达商家',
  }
  return {
    title: titles[lead.stage],
    rationale: [
      `当前阶段：${stageLabel(lead.stage)}`,
      `CRM 下一步：${lead.next_action}`,
      '建议由 AI 起草，销售确认后再写入业务记录',
    ],
    suggestedAt: lead.next_action_at,
    source: 'RULE_AND_MODEL',
  }
}

export function getSalesAiCopilotOverview(
  database: DatabaseSync,
  principal: Principal,
  focusLeadId?: string,
): SalesAiCopilotOverview {
  const leads = readLeadRows(database, principal)
  if (leads.length === 0) {
    throw new DomainError(404, 'sales_ai_no_visible_leads', '当前数据范围内没有可用商机')
  }
  const focus = focusLeadId
    ? leads.find((lead) => lead.id === focusLeadId)
    : leads[0]
  if (!focus) {
    throw new DomainError(404, 'sales_ai_lead_not_found', '商机不存在或不在当前数据范围内')
  }
  const actors = actorMap(database, principal.tenantId)
  const artifacts = artifactRows(database, principal, focus.id)
    .map((row) => artifactSummary(row, actors))
  const simulations = roleplaySessions(database, principal, focus.id)
  const evidence = evidenceForLead(database, focus)
  const updatedCandidates = [
    focus.updated_at,
    ...artifacts.map((artifact) => artifact.createdAt),
    ...simulations.map((session) => session.updatedAt),
  ].sort()
  return {
    focusLead: leadContext(database, focus),
    availableLeads: leads.map((lead) => leadContext(database, lead)),
    artifacts,
    roleplaySessions: simulations,
    metrics: {
      evidenceCount: evidence.length,
      draftCount: artifacts.filter((artifact) => artifact.status === 'DRAFT').length,
      confirmedCount: artifacts.filter((artifact) => artifact.status === 'CONFIRMED').length,
      roleplayCount: simulations.length,
    },
    recommendation: recommendation(focus),
    substrate: {
      provider: evidenceSalesAiProvider.name,
      modelVersion: evidenceSalesAiProvider.modelVersion,
      policyVersion: POLICY_VERSION,
      evidenceRequired: true,
      humanConfirmationRequired: true,
      externalActionAllowed: false,
    },
    permissions: {
      canGenerate: true,
      canConfirm: true,
      canWriteCrmAfterConfirmation: true,
    },
    updatedAt: updatedCandidates.at(-1) ?? now(),
  }
}

function recordEvent(
  database: DatabaseSync,
  principal: Principal,
  input: {
    leadId: string
    cityId: string
    sessionId?: string | undefined
    artifactKey?: string | undefined
    type:
      | 'ARTIFACT_GENERATED'
      | 'ARTIFACT_CONFIRMED'
      | 'ROLEPLAY_STARTED'
      | 'ROLEPLAY_TURN_EVALUATED'
    entityId: string
    riskLevel: 'L0' | 'L1' | 'L2'
    summary: string
    payload: Record<string, unknown>
  },
  timestamp: string,
): void {
  const payloadJson = JSON.stringify(input.payload)
  database.prepare(
    `INSERT INTO sales_ai_events
     (id, tenant_id, city_id, lead_id, session_id, artifact_key, type,
      actor_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, input.cityId, input.leadId,
    input.sessionId ?? null, input.artifactKey ?? null, input.type,
    principal.subject, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO audit_events
     (id, run_id, tenant_id, actor_role, action, entity_type, entity_id,
      risk_level, result, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, 'sales_ai_copilot', ?, ?, 'APPROVED', ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId, principal.roles[0] ?? 'system',
    input.type, input.entityId, input.riskLevel, input.summary, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO tracking_events
     (id, run_id, tenant_id, name, properties_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `sales_ai_${input.type.toLowerCase()}`, payloadJson, timestamp,
  )
  database.prepare(
    `INSERT INTO outbox_events
     (id, run_id, tenant_id, topic, aggregate_id, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), RUN_ID, principal.tenantId,
    `sales.ai.${input.type.toLowerCase()}.v1`,
    input.entityId, payloadJson, timestamp,
  )
}

function recordLeadActivity(
  database: DatabaseSync,
  principal: Principal,
  leadId: string,
  type: string,
  summary: string,
  payload: Record<string, unknown>,
  timestamp: string,
): void {
  database.prepare(
    `INSERT INTO lead_activities
     (id, tenant_id, lead_id, actor_id, type, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(), principal.tenantId, leadId, principal.subject,
    type, summary, JSON.stringify(payload), timestamp,
  )
}

function idempotentMutation(
  database: DatabaseSync,
  principal: Principal,
  idempotencyKey: string,
  route: string,
  input: unknown,
  operation: () => string,
): SalesAiCopilotOverview {
  const requestHash = hash(input)
  const stored = database.prepare(
    `SELECT request_hash, response_json FROM idempotency_records
     WHERE key = ? AND route = ?`,
  ).get(idempotencyKey, route) as unknown as IdempotencyRow | undefined
  if (stored) {
    if (stored.request_hash !== requestHash) {
      throw new DomainError(409, 'idempotency_conflict', '同一幂等键不能用于不同请求')
    }
    database.prepare(
      `UPDATE idempotency_records SET replay_count = replay_count + 1
       WHERE key = ? AND route = ?`,
    ).run(idempotencyKey, route)
    return JSON.parse(stored.response_json) as SalesAiCopilotOverview
  }

  database.exec('BEGIN IMMEDIATE;')
  try {
    const focusLeadId = operation()
    const overview = getSalesAiCopilotOverview(database, principal, focusLeadId)
    database.prepare(
      `INSERT INTO idempotency_records
       (key, route, run_id, request_hash, response_json, status_code, created_at)
       VALUES (?, ?, ?, ?, ?, 200, ?)`,
    ).run(idempotencyKey, route, RUN_ID, requestHash, JSON.stringify(overview), now())
    database.exec('COMMIT;')
    return overview
  } catch (error) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function latestArtifact(
  database: DatabaseSync,
  principal: Principal,
  artifactKey: string,
): ArtifactRow {
  const row = database.prepare(
    `SELECT id, artifact_key, session_id, lead_id, kind, revision, status,
            title, summary, content_json, evidence_json, guardrails_json,
            model_version, prompt_version, policy_version, generated_by,
            confirmed_by, confirmed_at, created_at
     FROM sales_ai_artifact_revisions
     WHERE tenant_id = ? AND artifact_key = ?
     ORDER BY revision DESC LIMIT 1`,
  ).get(principal.tenantId, artifactKey) as unknown as ArtifactRow | undefined
  if (!row) {
    throw new DomainError(404, 'sales_ai_artifact_not_found', 'AI 草稿不存在')
  }
  getLead(database, principal, row.lead_id)
  return row
}

export function generateSalesAiArtifact(
  database: DatabaseSync,
  principal: Principal,
  input: GenerateSalesAiArtifactInput,
  idempotencyKey: string,
): SalesAiCopilotOverview {
  const route = `/api/v1/sales/copilot/leads/${input.leadId}/artifacts`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    if (input.kind === 'MEETING_SUMMARY' && safeNotes(input.contextNotes).length === 0) {
      throw new DomainError(400, 'meeting_notes_required', '生成会议纪要前请提供原始会谈记录')
    }
    const timestamp = now()
    const evidence = evidenceForLead(database, lead)
    const draft = evidenceSalesAiProvider.generate(input.kind, {
      lead,
      evidence,
      objective: input.objective,
      contextNotes: input.contextNotes,
    })
    const artifactKey = `${lead.id}:${input.kind}`
    const previous = database.prepare(
      `SELECT revision FROM sales_ai_artifact_revisions
       WHERE artifact_key = ? ORDER BY revision DESC LIMIT 1`,
    ).get(artifactKey) as { revision: number } | undefined
    const revision = (previous?.revision ?? 0) + 1
    const sessionId = `sales-ai-session-${randomUUID()}`
    const artifactId = `sales-ai-artifact-${randomUUID()}`
    const prompt = promptVersion(input.kind)
    const guardrails = [
      'AI 只生成草稿，不自动联系商家、不自动承诺、不自动修改 CRM 阶段',
      '事实必须保留来源；不确定内容必须明确标注并由销售核对',
      '会议纪要只有在强确认后才允许写入 CRM 跟进记录',
    ]
    database.prepare(
      `INSERT INTO sales_ai_sessions
       (id, tenant_id, city_id, lead_id, owner_id, mode, objection_type,
        scenario, status, model_version, prompt_version, policy_version,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ARTIFACT', NULL, ?, 'COMPLETED', ?, ?, ?, ?, ?)`,
    ).run(
      sessionId, principal.tenantId, lead.city_id, lead.id, principal.subject,
      input.objective, MODEL_VERSION, prompt, POLICY_VERSION, timestamp, timestamp,
    )
    database.prepare(
      `INSERT INTO sales_ai_artifact_revisions
       (id, artifact_key, session_id, tenant_id, city_id, lead_id, kind,
        revision, status, title, summary, content_json, evidence_json,
        guardrails_json, model_version, prompt_version, policy_version,
        generated_by, confirmed_by, confirmed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?,
               NULL, NULL, ?)`,
    ).run(
      artifactId, artifactKey, sessionId, principal.tenantId, lead.city_id,
      lead.id, input.kind, revision, draft.title, draft.summary,
      JSON.stringify(draft.sections), JSON.stringify(evidence),
      JSON.stringify(guardrails), MODEL_VERSION, prompt, POLICY_VERSION,
      principal.subject, timestamp,
    )
    recordEvent(database, principal, {
      leadId: lead.id,
      cityId: lead.city_id,
      sessionId,
      artifactKey,
      type: 'ARTIFACT_GENERATED',
      entityId: artifactId,
      riskLevel: 'L0',
      summary: 'AI 销售草稿已生成，尚未产生外部动作',
      payload: {
        artifactKey,
        kind: input.kind,
        revision,
        evidenceCount: evidence.length,
        modelVersion: MODEL_VERSION,
        promptVersion: prompt,
        policyVersion: POLICY_VERSION,
        externalAction: false,
      },
    }, timestamp)
    return lead.id
  })
}

export function confirmSalesAiArtifact(
  database: DatabaseSync,
  principal: Principal,
  input: ConfirmSalesAiArtifactInput,
  idempotencyKey: string,
): SalesAiCopilotOverview {
  const route = `/api/v1/sales/copilot/artifacts/${input.artifactKey}/confirm`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    if (!input.confirmed) {
      throw new DomainError(409, 'strong_confirmation_required', '确认 AI 草稿需要强确认')
    }
    const artifact = latestArtifact(database, principal, input.artifactKey)
    if (artifact.revision !== input.expectedRevision) {
      throw new DomainError(409, 'stale_artifact_revision', 'AI 草稿已更新，请刷新后再确认')
    }
    if (artifact.status !== 'DRAFT') {
      throw new DomainError(409, 'artifact_already_confirmed', '该 AI 草稿已确认')
    }
    const lead = getLead(database, principal, artifact.lead_id)
    if (lead.version !== input.expectedLeadVersion) {
      throw new DomainError(409, 'stale_entity_version', '商机已更新，请刷新后再确认')
    }
    if (artifact.kind === 'MEETING_SUMMARY' && !input.crmWriteback) {
      throw new DomainError(400, 'crm_writeback_required', '确认会议纪要时必须核对 CRM 跟进内容')
    }
    const timestamp = now()
    const confirmedId = `sales-ai-artifact-${randomUUID()}`
    database.prepare(
      `INSERT INTO sales_ai_artifact_revisions
       (id, artifact_key, session_id, tenant_id, city_id, lead_id, kind,
        revision, status, title, summary, content_json, evidence_json,
        guardrails_json, model_version, prompt_version, policy_version,
        generated_by, confirmed_by, confirmed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?)`,
    ).run(
      confirmedId, artifact.artifact_key, artifact.session_id,
      principal.tenantId, lead.city_id, lead.id, artifact.kind,
      artifact.revision + 1, artifact.title, artifact.summary,
      artifact.content_json, artifact.evidence_json, artifact.guardrails_json,
      artifact.model_version, artifact.prompt_version, artifact.policy_version,
      artifact.generated_by, principal.subject, timestamp, timestamp,
    )

    if (artifact.kind === 'MEETING_SUMMARY' && input.crmWriteback) {
      const writeback = input.crmWriteback
      database.prepare(
        `INSERT INTO lead_followups
         (id, tenant_id, lead_id, actor_id, channel, summary, next_action,
          next_action_at, occurred_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `followup-${randomUUID()}`, principal.tenantId, lead.id, principal.subject,
        writeback.channel, writeback.summary, writeback.nextAction,
        writeback.nextActionAt, timestamp, timestamp,
      )
      const result = database.prepare(
        `UPDATE leads SET next_action = ?, next_action_at = ?,
                version = version + 1, updated_at = ?
         WHERE id = ? AND version = ?`,
      ).run(
        writeback.nextAction, writeback.nextActionAt, timestamp,
        lead.id, input.expectedLeadVersion,
      )
      if (result.changes !== 1) {
        throw new DomainError(409, 'stale_entity_version', '商机已更新，请刷新后再确认')
      }
    }

    recordLeadActivity(
      database,
      principal,
      lead.id,
      'AI_ARTIFACT_CONFIRMED',
      artifact.kind === 'MEETING_SUMMARY'
        ? 'AI 会议纪要经销售核对后写入 CRM'
        : 'AI 销售草稿已由销售确认',
      {
        artifactKey: artifact.artifact_key,
        kind: artifact.kind,
        fromRevision: artifact.revision,
        confirmedRevision: artifact.revision + 1,
        crmWritten: artifact.kind === 'MEETING_SUMMARY',
        humanConfirmed: true,
      },
      timestamp,
    )
    recordEvent(database, principal, {
      leadId: lead.id,
      cityId: lead.city_id,
      sessionId: artifact.session_id,
      artifactKey: artifact.artifact_key,
      type: 'ARTIFACT_CONFIRMED',
      entityId: confirmedId,
      riskLevel: artifact.kind === 'MEETING_SUMMARY' ? 'L2' : 'L1',
      summary: artifact.kind === 'MEETING_SUMMARY'
        ? 'AI 会议纪要经强确认后写入 CRM'
        : 'AI 销售草稿已由本人确认',
      payload: {
        kind: artifact.kind,
        confirmedRevision: artifact.revision + 1,
        crmWritten: artifact.kind === 'MEETING_SUMMARY',
        humanConfirmed: true,
        policyVersion: POLICY_VERSION,
      },
    }, timestamp)
    return lead.id
  })
}

function scopedRoleplaySession(
  database: DatabaseSync,
  principal: Principal,
  sessionId: string,
): SessionRow & { city_id: string } {
  const session = database.prepare(
    `SELECT session.id, session.lead_id, session.city_id,
            session.objection_type, session.scenario, session.status,
            session.model_version, session.prompt_version,
            session.policy_version, session.created_at, session.updated_at
     FROM sales_ai_sessions session
     WHERE session.id = ? AND session.tenant_id = ? AND session.mode = 'ROLEPLAY'`,
  ).get(sessionId, principal.tenantId) as unknown as
    (SessionRow & { city_id: string }) | undefined
  if (!session) {
    throw new DomainError(404, 'sales_ai_roleplay_not_found', '异议模拟不存在')
  }
  getLead(database, principal, session.lead_id)
  return session
}

export function startSalesAiRoleplay(
  database: DatabaseSync,
  principal: Principal,
  input: StartSalesAiRoleplayInput,
  idempotencyKey: string,
): SalesAiCopilotOverview {
  const route = `/api/v1/sales/copilot/leads/${input.leadId}/roleplay-sessions`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const lead = getLead(database, principal, input.leadId)
    const timestamp = now()
    const sessionId = `sales-ai-roleplay-${randomUUID()}`
    const prompt = 'sales-objection-roleplay-v1'
    database.prepare(
      `INSERT INTO sales_ai_sessions
       (id, tenant_id, city_id, lead_id, owner_id, mode, objection_type,
        scenario, status, model_version, prompt_version, policy_version,
        created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ROLEPLAY', ?, ?, 'ACTIVE', ?, ?, ?, ?, ?)`,
    ).run(
      sessionId, principal.tenantId, lead.city_id, lead.id, principal.subject,
      input.objectionType, input.scenario, MODEL_VERSION, prompt,
      POLICY_VERSION, timestamp, timestamp,
    )
    database.prepare(
      `INSERT INTO sales_ai_roleplay_turns
       (id, tenant_id, city_id, session_id, actor, content,
        evaluation_json, model_version, created_at)
       VALUES (?, ?, ?, ?, 'CUSTOMER', ?, NULL, ?, ?)`,
    ).run(
      `sales-ai-turn-${randomUUID()}`, principal.tenantId, lead.city_id,
      sessionId, evidenceSalesAiProvider.opening(input.objectionType, lead.name),
      MODEL_VERSION, timestamp,
    )
    recordEvent(database, principal, {
      leadId: lead.id,
      cityId: lead.city_id,
      sessionId,
      type: 'ROLEPLAY_STARTED',
      entityId: sessionId,
      riskLevel: 'L0',
      summary: 'AI 异议模拟已开始，不产生任何外部动作',
      payload: {
        objectionType: input.objectionType,
        modelVersion: MODEL_VERSION,
        promptVersion: prompt,
        externalAction: false,
      },
    }, timestamp)
    return lead.id
  })
}

export function replySalesAiRoleplay(
  database: DatabaseSync,
  principal: Principal,
  input: ReplySalesAiRoleplayInput,
  idempotencyKey: string,
): SalesAiCopilotOverview {
  const route = `/api/v1/sales/copilot/roleplay-sessions/${input.sessionId}/turns`
  return idempotentMutation(database, principal, idempotencyKey, route, input, () => {
    const session = scopedRoleplaySession(database, principal, input.sessionId)
    if (session.status !== 'ACTIVE') {
      throw new DomainError(409, 'sales_ai_roleplay_completed', '该异议模拟已完成')
    }
    const timestamp = now()
    const previousSalesTurns = database.prepare(
      `SELECT COUNT(*) AS count FROM sales_ai_roleplay_turns
       WHERE session_id = ? AND actor = 'SALES'`,
    ).get(session.id) as { count: number }
    const attempt = Number(previousSalesTurns.count) + 1
    const evaluation = evidenceSalesAiProvider.evaluate(input.response)
    database.prepare(
      `INSERT INTO sales_ai_roleplay_turns
       (id, tenant_id, city_id, session_id, actor, content,
        evaluation_json, model_version, created_at)
       VALUES (?, ?, ?, ?, 'SALES', ?, NULL, ?, ?)`,
    ).run(
      `sales-ai-turn-${randomUUID()}`, principal.tenantId, session.city_id,
      session.id, input.response, MODEL_VERSION, timestamp,
    )
    const coaching = evaluation.improvements.length
      ? `本轮 ${evaluation.overallScore} 分。优先改进：${evaluation.improvements[0]}`
      : `本轮 ${evaluation.overallScore} 分。回应结构完整，可以继续收口下一步。`
    database.prepare(
      `INSERT INTO sales_ai_roleplay_turns
       (id, tenant_id, city_id, session_id, actor, content,
        evaluation_json, model_version, created_at)
       VALUES (?, ?, ?, ?, 'COACH', ?, ?, ?, ?)`,
    ).run(
      `sales-ai-turn-${randomUUID()}`, principal.tenantId, session.city_id,
      session.id, coaching, JSON.stringify(evaluation), MODEL_VERSION, timestamp,
    )
    const complete = attempt >= 3
    if (!complete) {
      database.prepare(
        `INSERT INTO sales_ai_roleplay_turns
         (id, tenant_id, city_id, session_id, actor, content,
          evaluation_json, model_version, created_at)
         VALUES (?, ?, ?, ?, 'CUSTOMER', ?, NULL, ?, ?)`,
      ).run(
        `sales-ai-turn-${randomUUID()}`, principal.tenantId, session.city_id,
        session.id,
        evidenceSalesAiProvider.nextCustomerTurn(session.objection_type, attempt),
        MODEL_VERSION, timestamp,
      )
    }
    database.prepare(
      `UPDATE sales_ai_sessions SET status = ?, updated_at = ? WHERE id = ?`,
    ).run(complete ? 'COMPLETED' : 'ACTIVE', timestamp, session.id)
    recordEvent(database, principal, {
      leadId: session.lead_id,
      cityId: session.city_id,
      sessionId: session.id,
      type: 'ROLEPLAY_TURN_EVALUATED',
      entityId: session.id,
      riskLevel: 'L0',
      summary: 'AI 已完成异议回应训练评估',
      payload: {
        attempt,
        complete,
        evaluation,
        externalAction: false,
      },
    }, timestamp)
    return session.lead_id
  })
}
