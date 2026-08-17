import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const authorization = {
  provider: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`,
  sales: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`,
}

describe('E7 续费提醒、提案、升级、流失与佣金', () => {
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

  async function scan(key: string) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/provider/renewals/scan',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': key,
      },
    })
  }

  async function proposal(caseId: string, expectedVersion: number, key: string) {
    return app.inject({
      method: 'POST',
      url: `/api/v1/provider/renewals/${caseId}/proposals`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': key,
      },
      payload: { expectedVersion, confirmed: true },
    })
  }

  it('按 30/15/7/1 天跨级补齐提醒，重复扫描不重复投递', async () => {
    const first = await scan('renewal:scan:first')
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json()).toMatchObject({
      metrics: {
        active: 3,
        dueWithin30Days: 3,
        critical: 1,
      },
      policy: {
        reminderDays: [30, 15, 7, 1],
        notificationDelivery: 'OUTBOX_PENDING_CONNECTOR',
        appendOnlyEvidence: true,
      },
    })
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM provider_renewal_events
       WHERE type LIKE 'REMINDER_%'`,
    ).get() as { count: number }).count).toBe(6)
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE topic = 'provider.renewal.reminder.pending.v1'`,
    ).get() as { count: number }).count).toBe(6)

    const repeated = await scan('renewal:scan:repeat')
    expect(repeated.statusCode, repeated.body).toBe(200)
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM provider_renewal_events
       WHERE type LIKE 'REMINDER_%'`,
    ).get() as { count: number }).count).toBe(6)
  })

  it('用交付与交易证据生成升级提案并冻结证据快照', async () => {
    const response = await proposal(
      'provider-renewal-yunheli-current',
      1,
      'renewal:proposal:upgrade',
    )
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().focusCase).toMatchObject({
      id: 'provider-renewal-yunheli-current',
      status: 'PROPOSAL_READY',
      version: 2,
      proposal: {
        version: 1,
        currentPackageCode: 'PRO',
        recommendedPackageCode: 'AGENT',
        upgradeRecommended: true,
        offerPriceFen: 169800,
        policyVersion: 'provider-renewal-proposal-v1',
      },
    })
    expect(response.json().focusCase.proposal.evidence.length).toBeGreaterThan(0)
    expect(response.json().policy.recommendationGuardrail).toContain('不承诺')
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE aggregate_id = 'provider-renewal-yunheli-current'
         AND topic = 'provider.renewal.proposal.generated.v1'`,
    ).get() as { count: number }).count).toBe(1)
  })

  it('强确认续费后写入续费佣金账本且幂等回放不重复计佣', async () => {
    await proposal(
      'provider-renewal-yunheli-current',
      1,
      'renewal:proposal:commission',
    )
    const request = {
      method: 'POST' as const,
      url: '/api/v1/provider/renewals/provider-renewal-yunheli-current/outcome',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'renewal:outcome:renewed',
      },
      payload: {
        expectedVersion: 2,
        outcome: 'RENEWED',
        acceptedPackageCode: 'AGENT',
        confirmed: true,
      },
    }
    const response = await app.inject(request)
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().focusCase).toMatchObject({
      status: 'RENEWED',
      renewedPackageCode: 'AGENT',
      renewedPriceFen: 169800,
      version: 3,
      commission: {
        rateBps: 400,
        estimatedFen: 6792,
      },
    })
    const replay = await app.inject(request)
    expect(replay.statusCode, replay.body).toBe(200)
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM sales_commission_ledger
       WHERE source_id = 'provider-renewal-yunheli-current'
         AND category = 'RENEWAL'`,
    ).get() as { count: number }).count).toBe(1)
  })

  it('流失必须结构化记录原因、事实与可挽回动作', async () => {
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/v1/provider/renewals/provider-renewal-muyun-current/outcome',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'renewal:loss:invalid',
      },
      payload: {
        expectedVersion: 1,
        outcome: 'LOST',
        lossReason: 'CASH_FLOW',
        lossDetail: '商家本季度现金流承压，暂缓年度续费安排。',
        recoverable: true,
        confirmed: true,
      },
    })
    expect(invalid.statusCode).toBe(422)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/provider/renewals/provider-renewal-muyun-current/outcome',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'renewal:loss:valid',
      },
      payload: {
        expectedVersion: 1,
        outcome: 'LOST',
        lossReason: 'CASH_FLOW',
        lossDetail: '商家本季度现金流承压，暂缓年度续费安排。',
        recoverable: true,
        recoveryAction: '下月十五日由原负责人复盘现金流并提供基础版连续服务方案。',
        confirmed: true,
      },
    })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().focusCase).toMatchObject({
      status: 'LOST',
      lossReason: 'CASH_FLOW',
      recoverable: true,
      recoveryAction: '下月十五日由原负责人复盘现金流并提供基础版连续服务方案。',
      version: 2,
    })
  })

  it('签约合同由扫描器自动建立续费周期，销售角色无权进入城市续费池', async () => {
    const diagnosis = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/diagnosis',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'renewal:setup:diagnosis',
      },
      payload: { expectedVersion: 1 },
    })
    expect(diagnosis.statusCode, diagnosis.body).toBe(200)
    const drafted = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/contracts',
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'renewal:setup:contract',
      },
      payload: { expectedVersion: 2, packageCode: 'PRO', discountBps: 300 },
    })
    expect(drafted.statusCode, drafted.body).toBe(200)
    const contractId = drafted.json().contract.id as string
    const signed = await app.inject({
      method: 'POST',
      url: `/api/v1/onboarding/contracts/${contractId}/sign`,
      headers: {
        authorization: authorization.provider,
        'idempotency-key': 'renewal:setup:sign',
      },
      payload: { leadId: 'lead-yunheli', expectedVersion: 1 },
    })
    expect(signed.statusCode, signed.body).toBe(200)
    await scan('renewal:scan:bootstrap')
    expect(database.prepare(
      `SELECT source, source_contract_id FROM provider_renewal_cases
       WHERE source_contract_id = ?`,
    ).get(contractId)).toEqual({
      source: 'SIGNED_CONTRACT',
      source_contract_id: contractId,
    })

    const denied = await app.inject({
      method: 'GET',
      url: '/api/v1/provider/renewals',
      headers: { authorization: authorization.sales },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('续费提案与事件证据禁止修改和删除', async () => {
    await proposal(
      'provider-renewal-yunheli-current',
      1,
      'renewal:proposal:append-only',
    )
    expect(() => database.exec(
      `UPDATE provider_renewal_proposals SET recommendation = 'tampered'`,
    )).toThrow(/append-only/)
    expect(() => database.exec(
      `DELETE FROM provider_renewal_events`,
    )).toThrow(/append-only/)
  })
})
