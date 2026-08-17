import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const authorization = {
  sales: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`,
  salesPeer: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.salesPeer}`,
  cityManager: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.cityManager}`,
  hq: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`,
  provider: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`,
}

describe('E6 销售宝业绩、目标、预计/已结佣金与冲正解释', () => {
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

  async function getPerformance(
    token = authorization.sales,
    query = '',
  ) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/performance${query}`,
      headers: { authorization: token },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  it('销售只读取本人业绩、三类目标、预计/已结佣金和可解释冲正', async () => {
    const overview = await getPerformance()
    expect(overview).toMatchObject({
      viewMode: 'INDIVIDUAL',
      focusSalesperson: {
        userId: 'user-demo-sales',
        displayName: '上海销售顾问',
      },
      metrics: {
        performanceFen: 617600,
        targetFen: 830000,
        achievementRate: 74.4,
        estimatedCommissionFen: 2460,
        settledCommissionFen: 4990,
        reversalFen: 32800,
        recognizedCount: 4,
      },
      target: {
        signingTargetFen: 150000,
        renewalTargetFen: 80000,
        transactionTargetFen: 600000,
        totalTargetFen: 830000,
        version: 1,
      },
      policy: {
        amountUnit: 'FEN',
        immutableLedger: true,
        settlementRuleVersion: 'sales-commission-ledger-v1',
      },
      permissions: {
        canManageTarget: false,
        canSettleCommission: false,
        canReverseCommission: false,
      },
    })
    expect(overview.categories).toEqual([
      expect.objectContaining({ category: 'SIGNING', performanceFen: 99800, targetFen: 150000 }),
      expect.objectContaining({ category: 'RENEWAL', performanceFen: 49800, targetFen: 80000 }),
      expect.objectContaining({
        category: 'TRANSACTION_SHARE',
        performanceFen: 468000,
        targetFen: 600000,
        reversalFen: 32800,
      }),
    ])
    expect(overview.ledger.some((entry: {
      kind: string
      settledCommissionDeltaFen: number
      reason: string
      evidence: string[]
      ruleExplanation: string[]
    }) => (
      entry.kind === 'REVERSAL'
      && entry.settledCommissionDeltaFen === -33
      && entry.reason.includes('同步冲正')
      && entry.evidence.length === 3
      && entry.ruleExplanation.some((line) => line.includes('服务端'))
    ))).toBe(true)
    expect(new Set(overview.ledger.map((entry: { salesperson: { userId: string } }) =>
      entry.salesperson.userId))).toEqual(new Set(['user-demo-sales']))
  })

  it('城市负责人可查看团队汇总、排行并钻取同城销售', async () => {
    const team = await getPerformance(authorization.cityManager)
    expect(team).toMatchObject({
      viewMode: 'TEAM',
      focusSalesperson: null,
      metrics: {
        performanceFen: 915400,
        targetFen: 1410000,
        estimatedCommissionFen: 7648,
        settledCommissionFen: 4990,
      },
      permissions: { canManageTarget: true, canSettleCommission: false },
    })
    expect(team.team).toHaveLength(2)
    expect(team.team.map((member: { salesperson: { userId: string } }) =>
      member.salesperson.userId)).toEqual([
      'user-demo-sales',
      'user-demo-sales-peer',
    ])

    const peer = await getPerformance(
      authorization.cityManager,
      `?period=${team.period}&salespersonId=user-demo-sales-peer`,
    )
    expect(peer).toMatchObject({
      viewMode: 'INDIVIDUAL',
      focusSalesperson: { userId: 'user-demo-sales-peer' },
      metrics: {
        performanceFen: 297800,
        targetFen: 580000,
        estimatedCommissionFen: 5188,
        settledCommissionFen: 0,
      },
      target: { version: 1 },
    })
  })

  it('目标修订只追加新版本，支持乐观锁与幂等，销售本人不能改目标', async () => {
    const overview = await getPerformance(authorization.cityManager)
    const period = overview.period
    const request = {
      method: 'POST' as const,
      url: '/api/v1/sales/performance/targets/user-demo-sales',
      headers: {
        authorization: authorization.cityManager,
        'idempotency-key': 'sales-performance:target:v2',
      },
      payload: {
        period,
        signingTargetFen: 180000,
        renewalTargetFen: 90000,
        transactionTargetFen: 650000,
        expectedVersion: 1,
        reason: '结合当前签约管线与交易增长重新拆解目标',
      },
    }
    const revised = await app.inject(request)
    const replay = await app.inject(request)
    expect(revised.statusCode, revised.body).toBe(200)
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.body).toBe(revised.body)
    expect(revised.json()).toMatchObject({
      viewMode: 'INDIVIDUAL',
      target: {
        totalTargetFen: 920000,
        version: 2,
        reason: '结合当前签约管线与交易增长重新拆解目标',
        setBy: { userId: 'user-demo-city-manager' },
      },
    })
    const revisions = database.prepare(
      `SELECT version FROM sales_target_revisions
       WHERE salesperson_id = 'user-demo-sales' AND period = ? ORDER BY version`,
    ).all(period) as unknown as Array<{ version: number }>
    expect(revisions).toEqual([{ version: 1 }, { version: 2 }])

    const stale = await app.inject({
      ...request,
      headers: {
        ...request.headers,
        'idempotency-key': 'sales-performance:target:stale',
      },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('stale_entity_version')

    const denied = await app.inject({
      ...request,
      headers: {
        authorization: authorization.sales,
        'idempotency-key': 'sales-performance:target:denied',
      },
    })
    expect(denied.statusCode).toBe(403)
  })

  it('总部财务权限把预计佣金转入已结，要求强确认且不修改原流水', async () => {
    const before = await getPerformance()
    const renewal = before.ledger.find((entry: {
      category: string
      kind: string
    }) => entry.category === 'RENEWAL' && entry.kind === 'RECOGNITION')
    const denied = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/performance/ledger/${renewal.id}/settle`,
      headers: {
        authorization: authorization.hq,
        'idempotency-key': 'sales-performance:settle:not-confirmed',
      },
      payload: {
        reason: '月结复核已完成，准备转入已结佣金',
        evidence: ['结算批次测试凭证'],
        confirmed: false,
      },
    })
    expect(denied.statusCode).toBe(409)
    expect(denied.json().title).toBe('strong_confirmation_required')

    const settled = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/performance/ledger/${renewal.id}/settle`,
      headers: {
        authorization: authorization.hq,
        'idempotency-key': 'sales-performance:settle:renewal',
      },
      payload: {
        reason: '月结复核已完成，预计佣金正式转入已结',
        evidence: ['结算批次 SET-TEST-001', '财务双人复核'],
        confirmed: true,
      },
    })
    expect(settled.statusCode, settled.body).toBe(200)
    expect(settled.json().metrics).toMatchObject({
      performanceFen: 617600,
      estimatedCommissionFen: 468,
      settledCommissionFen: 6982,
    })
    expect(settled.json().ledger[0]).toMatchObject({
      kind: 'SETTLEMENT',
      originalEntryId: renewal.id,
      performanceDeltaFen: 0,
      estimatedCommissionDeltaFen: -1992,
      settledCommissionDeltaFen: 1992,
    })
    const original = database.prepare(
      `SELECT kind, estimated_commission_delta_fen
       FROM sales_commission_ledger WHERE id = ?`,
    ).get(renewal.id)
    expect(original).toEqual({ kind: 'RECOGNITION', estimated_commission_delta_fen: 1992 })
  })

  it('已结佣金退款时追加冲正，原业绩与已结金额同步抵销且不可重复', async () => {
    const before = await getPerformance()
    const signing = before.ledger.find((entry: {
      category: string
      kind: string
    }) => entry.category === 'SIGNING' && entry.kind === 'RECOGNITION')
    const reversed = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/performance/ledger/${signing.id}/reverse`,
      headers: {
        authorization: authorization.hq,
        'idempotency-key': 'sales-performance:reverse:signing',
      },
      payload: {
        reason: '合同解除且首款已原路退回，业绩与已结佣金同步冲正',
        evidence: ['退款事实 RF-TEST-009', '合同解除协议', '财务复核通过'],
        confirmed: true,
      },
    })
    expect(reversed.statusCode, reversed.body).toBe(200)
    expect(reversed.json().metrics).toMatchObject({
      performanceFen: 517800,
      estimatedCommissionFen: 2460,
      settledCommissionFen: 0,
      reversalFen: 132600,
    })
    expect(reversed.json().ledger[0]).toMatchObject({
      kind: 'REVERSAL',
      originalEntryId: signing.id,
      performanceDeltaFen: -99800,
      estimatedCommissionDeltaFen: 0,
      settledCommissionDeltaFen: -4990,
    })
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/performance/ledger/${signing.id}/reverse`,
      headers: {
        authorization: authorization.hq,
        'idempotency-key': 'sales-performance:reverse:signing-again',
      },
      payload: {
        reason: '尝试对同一原始流水重复冲正',
        evidence: ['重复冲正测试'],
        confirmed: true,
      },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json().title).toBe('commission_already_reversed')

    const evidence = {
      audit: database.prepare(
        `SELECT COUNT(*) AS count FROM audit_events
         WHERE run_id = 'sales-performance-e6' AND action = 'COMMISSION_REVERSED'`,
      ).get(),
      outbox: database.prepare(
        `SELECT COUNT(*) AS count FROM outbox_events
         WHERE run_id = 'sales-performance-e6'
           AND topic = 'sales.performance.commission_reversed.v1'`,
      ).get(),
    }
    expect(evidence).toEqual({ audit: { count: 1 }, outbox: { count: 1 } })
  })

  it('销售之间严格隔离，交付角色没有业绩权限，销售不能执行财务结算', async () => {
    const peer = await getPerformance(authorization.salesPeer)
    expect(peer).toMatchObject({
      focusSalesperson: { userId: 'user-demo-sales-peer' },
      metrics: { performanceFen: 297800, targetFen: 580000 },
    })
    const otherSales = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/performance?period=${peer.period}&salespersonId=user-demo-sales`,
      headers: { authorization: authorization.salesPeer },
    })
    expect(otherSales.statusCode).toBe(404)

    const provider = await app.inject({
      method: 'GET',
      url: '/api/v1/sales/performance',
      headers: { authorization: authorization.provider },
    })
    expect(provider.statusCode).toBe(403)

    const recognition = peer.ledger.find((entry: { kind: string }) =>
      entry.kind === 'RECOGNITION')
    const settle = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/performance/ledger/${recognition.id}/settle`,
      headers: {
        authorization: authorization.salesPeer,
        'idempotency-key': 'sales-performance:sales-settle-denied',
      },
      payload: {
        reason: '销售不得自行结算佣金',
        evidence: ['权限测试'],
        confirmed: true,
      },
    })
    expect(settle.statusCode).toBe(403)
  })

  it('佣金规则、目标修订和佣金流水均由数据库禁止更新与删除', () => {
    expect(() => database.exec(
      "UPDATE sales_compensation_rules SET basis = 'tampered'",
    )).toThrowError(/append-only/)
    expect(() => database.exec(
      "UPDATE sales_target_revisions SET reason = 'tampered'",
    )).toThrowError(/append-only/)
    expect(() => database.exec(
      'DELETE FROM sales_commission_ledger',
    )).toThrowError(/append-only/)
  })
})
