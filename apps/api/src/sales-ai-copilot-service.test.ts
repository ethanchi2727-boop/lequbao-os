import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'
import { evidenceSalesAiProvider } from './sales-ai-copilot-service.js'

const authorization = {
  sales: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`,
  salesPeer: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.salesPeer}`,
  cityManager: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.cityManager}`,
  provider: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`,
}

describe('E6 AI 销售助手：准备、话术、异议、纪要、下一步与提案', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
  })

  afterEach(async () => {
    await app.close()
  })

  async function overview(
    token = authorization.sales,
    focusLeadId?: string,
  ) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/copilot${focusLeadId
        ? `?focusLeadId=${encodeURIComponent(focusLeadId)}`
        : ''}`,
      headers: { authorization: token },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  it('只返回当前数据范围内商机、真实证据与人控 AI 底座信息', async () => {
    const result = await overview()
    expect(result.focusLead).toMatchObject({
      version: 1,
      recentFacts: expect.arrayContaining([
        expect.stringContaining('CRM 阶段'),
        expect.stringContaining('当前下一步'),
      ]),
    })
    expect(result.availableLeads.length).toBeGreaterThan(0)
    expect(result.metrics).toEqual({
      evidenceCount: expect.any(Number),
      draftCount: 0,
      confirmedCount: 0,
      roleplayCount: 0,
    })
    expect(result.substrate).toEqual({
      provider: 'lequ-evidence-copilot',
      modelVersion: 'sales-copilot-context-v1',
      policyVersion: 'sales-ai-human-control-v1',
      evidenceRequired: true,
      humanConfirmationRequired: true,
      externalActionAllowed: false,
    })
    expect(result.recommendation.rationale).toContain(
      '建议由 AI 起草，销售确认后再写入业务记录',
    )
  })

  it('生成拜访简报、话术、下一步与提案时只追加草稿，不修改 CRM', async () => {
    const initial = await overview()
    const lead = initial.focusLead
    const original = database.prepare(
      'SELECT version, next_action FROM leads WHERE id = ?',
    ).get(lead.id)
    const kinds = [
      'PRE_VISIT_BRIEF',
      'TALK_TRACK',
      'NEXT_ACTION',
      'PROPOSAL',
    ] as const
    let current = initial
    for (const kind of kinds) {
      const request = {
        method: 'POST' as const,
        url: `/api/v1/sales/copilot/leads/${lead.id}/artifacts`,
        headers: {
          authorization: authorization.sales,
          'idempotency-key': `sales-ai:generate:${kind}`,
        },
        payload: {
          kind,
          objective: '让商家明确经营问题、验证范围与决策下一步',
          contextNotes: ['商家希望先看到小范围验证结果'],
        },
      }
      const generated = await app.inject(request)
      const replay = await app.inject(request)
      expect(generated.statusCode, generated.body).toBe(200)
      expect(replay.statusCode, replay.body).toBe(200)
      expect(replay.body).toBe(generated.body)
      current = generated.json()
    }
    expect(current.artifacts).toHaveLength(4)
    expect(current.artifacts.every(
      (artifact: { status: string }) => artifact.status === 'DRAFT',
    )).toBe(true)
    expect(current.artifacts[0]).toMatchObject({
      revision: 1,
      evidence: expect.arrayContaining([
        expect.objectContaining({ sourceType: 'CRM' }),
        expect.objectContaining({ sourceType: 'POLICY' }),
      ]),
      guardrails: expect.arrayContaining([
        expect.stringContaining('不自动联系商家'),
      ]),
      modelVersion: 'sales-copilot-context-v1',
      policyVersion: 'sales-ai-human-control-v1',
    })
    expect(database.prepare(
      'SELECT version, next_action FROM leads WHERE id = ?',
    ).get(lead.id)).toEqual(original)
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM audit_events
       WHERE run_id = 'sales-ai-copilot-e6'
         AND action = 'ARTIFACT_GENERATED'`,
    ).get()).toEqual({ count: 4 })
  })

  it('会议纪要须有原始记录，强确认后才写入 CRM 且保留双版本证据', async () => {
    const initial = await overview()
    const lead = initial.focusLead
    const missingNotes = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/copilot/leads/${lead.id}/artifacts`,
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-ai:meeting:missing',
      },
      payload: {
        kind: 'MEETING_SUMMARY',
        objective: '确认试点范围和决策节奏',
        contextNotes: [],
      },
    })
    expect(missingNotes.statusCode).toBe(400)
    expect(missingNotes.json().title).toBe('meeting_notes_required')

    const generated = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/copilot/leads/${lead.id}/artifacts`,
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-ai:meeting:generate',
      },
      payload: {
        kind: 'MEETING_SUMMARY',
        objective: '确认 14 天验证范围和双方负责人',
        contextNotes: [
          '商家认可先验证会员复购链路',
          '需要店长与财务共同确认数据口径',
          '下周三复核试点方案',
        ],
      },
    })
    expect(generated.statusCode, generated.body).toBe(200)
    const artifact = generated.json().artifacts.find(
      (candidate: { kind: string }) => candidate.kind === 'MEETING_SUMMARY',
    )
    expect(artifact).toMatchObject({ status: 'DRAFT', revision: 1 })
    expect(database.prepare(
      'SELECT COUNT(*) AS count FROM lead_followups WHERE lead_id = ?',
    ).get(lead.id)).toEqual({ count: 0 })

    const unconfirmed = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/copilot/artifacts/${encodeURIComponent(artifact.artifactKey)}/confirm`,
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-ai:meeting:unconfirmed',
      },
      payload: {
        expectedRevision: artifact.revision,
        expectedLeadVersion: lead.version,
        confirmed: false,
      },
    })
    expect(unconfirmed.statusCode).toBe(409)
    expect(unconfirmed.json().title).toBe('strong_confirmation_required')

    const confirmation = {
      method: 'POST' as const,
      url: `/api/v1/sales/copilot/artifacts/${encodeURIComponent(artifact.artifactKey)}/confirm`,
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-ai:meeting:confirm',
      },
      payload: {
        expectedRevision: artifact.revision,
        expectedLeadVersion: lead.version,
        confirmed: true,
        crmWriteback: {
          channel: 'VISIT',
          summary: '商家认可先验证会员复购链路，待店长与财务确认数据口径',
          nextAction: '下周三共同复核 14 天试点方案',
          nextActionAt: '2026-08-05T10:00:00.000Z',
        },
      },
    }
    const confirmed = await app.inject(confirmation)
    const replay = await app.inject(confirmation)
    expect(confirmed.statusCode, confirmed.body).toBe(200)
    expect(replay.body).toBe(confirmed.body)
    expect(confirmed.json().artifacts.find(
      (candidate: { artifactKey: string }) =>
        candidate.artifactKey === artifact.artifactKey,
    )).toMatchObject({
      status: 'CONFIRMED',
      revision: 2,
      confirmedBy: { userId: 'user-demo-sales' },
    })
    expect(confirmed.json().focusLead).toMatchObject({
      version: lead.version + 1,
      nextAction: '下周三共同复核 14 天试点方案',
    })
    expect(database.prepare(
      `SELECT COUNT(*) AS count FROM sales_ai_artifact_revisions
       WHERE artifact_key = ?`,
    ).get(artifact.artifactKey)).toEqual({ count: 2 })
    expect(database.prepare(
      'SELECT channel, summary FROM lead_followups WHERE lead_id = ?',
    ).get(lead.id)).toEqual({
      channel: 'VISIT',
      summary: '商家认可先验证会员复购链路，待店长与财务确认数据口径',
    })
  })

  it('异议模拟逐轮评分但不联系商家、不修改商机', async () => {
    expect(evidenceSalesAiProvider.evaluate(
      '我理解您的顾虑，我们基于经营数据设计试点，不做未经验证的效果承诺。',
    ).complianceScore).toBe(96)
    const initial = await overview()
    const lead = initial.focusLead
    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/copilot/leads/${lead.id}/roleplay-sessions`,
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-ai:roleplay:start',
      },
      payload: {
        objectionType: 'PRICE',
        scenario: '商家认可方向，但认为当前报价过高',
      },
    })
    expect(started.statusCode, started.body).toBe(200)
    const session = started.json().roleplaySessions[0]
    expect(session).toMatchObject({
      objectionType: 'PRICE',
      status: 'ACTIVE',
      turns: [
        expect.objectContaining({ actor: 'CUSTOMER' }),
      ],
    })

    const replied = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/copilot/roleplay-sessions/${session.id}/turns`,
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-ai:roleplay:reply:1',
      },
      payload: {
        response: '我理解价格顾虑，我们保证一定能提升复购，下一步先安排试点。',
      },
    })
    expect(replied.statusCode, replied.body).toBe(200)
    const updated = replied.json().roleplaySessions[0]
    expect(updated.turns.map((turn: { actor: string }) => turn.actor)).toEqual([
      'CUSTOMER',
      'SALES',
      'COACH',
      'CUSTOMER',
    ])
    expect(updated.latestEvaluation).toMatchObject({
      complianceScore: 42,
      improvements: expect.arrayContaining([
        '删除绝对化承诺，改为可验证的阶段目标',
      ]),
    })
    expect(database.prepare(
      'SELECT version FROM leads WHERE id = ?',
    ).get(lead.id)).toEqual({ version: lead.version })
    expect(database.prepare(
      `SELECT payload_json FROM sales_ai_events
       WHERE type = 'ROLEPLAY_TURN_EVALUATED' ORDER BY sequence DESC LIMIT 1`,
    ).get()).toMatchObject({
      payload_json: expect.stringContaining('"externalAction":false'),
    })
  })

  it('销售不能读取同事商机，交付角色不能使用销售 AI 助手', async () => {
    const sales = await overview()
    const peerDenied = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/copilot?focusLeadId=${sales.focusLead.id}`,
      headers: { authorization: authorization.salesPeer },
    })
    expect(peerDenied.statusCode).toBe(404)

    const providerDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/sales/copilot',
      headers: { authorization: authorization.provider },
    })
    expect(providerDenied.statusCode).toBe(403)

    const manager = await overview(authorization.cityManager)
    expect(manager.availableLeads.length).toBeGreaterThanOrEqual(
      sales.availableLeads.length,
    )
  })

  it('AI 草稿、模拟轮次和事件由数据库禁止更新与删除', async () => {
    const initial = await overview()
    await app.inject({
      method: 'POST',
      url: `/api/v1/sales/copilot/leads/${initial.focusLead.id}/artifacts`,
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-ai:append-only:artifact',
      },
      payload: {
        kind: 'PRE_VISIT_BRIEF',
        objective: '验证只追加数据保护',
        contextNotes: [],
      },
    })
    await app.inject({
      method: 'POST',
      url: `/api/v1/sales/copilot/leads/${initial.focusLead.id}/roleplay-sessions`,
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-ai:append-only:roleplay',
      },
      payload: {
        objectionType: 'ROI',
        scenario: '验证模拟轮次只追加保护',
      },
    })
    expect(() => database.exec(
      "UPDATE sales_ai_artifact_revisions SET status = 'CONFIRMED'",
    )).toThrowError(/append-only/)
    expect(() => database.exec(
      'DELETE FROM sales_ai_roleplay_turns',
    )).toThrowError(/append-only/)
    expect(() => database.exec(
      'UPDATE sales_ai_events SET payload_json = \'{}\'',
    )).toThrowError(/append-only/)
  })
})
