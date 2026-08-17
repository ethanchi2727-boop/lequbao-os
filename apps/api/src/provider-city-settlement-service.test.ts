import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const authorization = {
  provider: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.provider}`,
  sales: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`,
  delivery: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.delivery}`,
  hq: `Bearer ${DEVELOPMENT_ACCESS_TOKENS.hq}`,
}

describe('E7 区域隔离与城市收益结算', () => {
  let database: DatabaseSync
  let app: Awaited<ReturnType<typeof buildApp>>
  let currentStatementId: string

  beforeEach(async () => {
    process.env.NODE_ENV = 'test'
    database = createDatabase(':memory:')
    app = await buildApp({ database })
    const current = database.prepare(
      `SELECT id FROM provider_city_settlement_statements
       WHERE city_id = 'city-shanghai' AND status = 'PENDING_INVOICE'
       ORDER BY period DESC LIMIT 1`,
    ).get() as { id: string }
    currentStatementId = current.id
  })

  afterEach(async () => {
    await app.close()
  })

  async function overview(
    token = authorization.provider,
    statementId?: string,
    expectedStatus = 200,
  ) {
    const query = statementId
      ? `?focusStatementId=${encodeURIComponent(statementId)}`
      : ''
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/provider/settlements${query}`,
      headers: { authorization: token },
    })
    expect(response.statusCode, response.body).toBe(expectedStatus)
    return response.json()
  }

  async function write(
    token: string,
    url: string,
    key: string,
    payload: Record<string, unknown>,
    expectedStatus = 200,
  ) {
    const response = await app.inject({
      method: 'POST',
      url,
      headers: {
        authorization: token,
        'idempotency-key': key,
      },
      payload,
    })
    expect(response.statusCode, response.body).toBe(expectedStatus)
    return response
  }

  it('以冻结规则汇总月度应收、历史结算和只追加账本', async () => {
    const result = await overview()

    expect(result).toMatchObject({
      city: { id: 'city-shanghai', name: '上海城市中心' },
      rules: {
        version: 'provider-city-settlement-2026.07-v1',
        signingShareBps: 6000,
        renewalShareBps: 6500,
        transactionShareBps: 50,
      },
      permissions: {
        canManage: true,
        canApprove: false,
        canSettle: false,
      },
      policy: {
        version: 'provider-city-settlement-policy-v1',
        appendOnlyLedger: true,
        cityScopeEnforced: true,
        invoiceAmountMustMatch: true,
        adjustmentRequiresHqApproval: true,
        settlementEvent: 'settlement.completed.v1',
      },
    })
    expect(result.statements).toHaveLength(2)
    expect(result.focusStatement.status).toBe('PENDING_INVOICE')
    expect(result.focusStatement.shares.payableFen).toBeGreaterThan(0)
    const settled = result.statements.find(
      ({ status }: { status: string }) => status === 'SETTLED',
    )
    expect(settled.invoice.status).toBe('VERIFIED')
    expect(settled.ledgerEntries.length).toBeGreaterThan(0)
  })

  it('强确认刷新结算单并按基点公式计算，幂等回放不重复留痕', async () => {
    const period = new Date().toISOString().slice(0, 7)
    await write(
      authorization.provider,
      '/api/v1/provider/settlements/generate',
      'settlement:generate:missing-confirmation',
      { cityId: 'city-shanghai', period, confirmed: false },
      422,
    )
    const request = {
      cityId: 'city-shanghai',
      period,
      confirmed: true,
    }
    const response = await write(
      authorization.provider,
      '/api/v1/provider/settlements/generate',
      'settlement:generate:current',
      request,
    )
    const result = response.json()
    expect(result.focusStatement.version).toBe(2)
    expect(result.focusStatement.shares.subscriptionShareFen).toBe(
      Math.round(result.focusStatement.source.signingRevenueFen * 6000 / 10_000),
    )
    expect(result.focusStatement.shares.renewalShareFen).toBe(
      Math.round(result.focusStatement.source.renewalRevenueFen * 6500 / 10_000),
    )
    expect(result.focusStatement.shares.transactionServiceShareFen).toBe(
      Math.round(result.focusStatement.source.transactionGmvFen * 50 / 10_000),
    )

    await write(
      authorization.provider,
      '/api/v1/provider/settlements/generate',
      'settlement:generate:current',
      request,
    )
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM provider_city_settlement_events
       WHERE statement_id = ? AND type = 'STATEMENT_REFRESHED'`,
    ).get(currentStatementId) as { count: number }).count).toBe(1)
    expect((database.prepare(
      `SELECT replay_count FROM idempotency_records
       WHERE key = 'settlement:generate:current'`,
    ).get() as { replay_count: number }).replay_count).toBe(1)
  })

  it('城市方只能申请调账，总部独立审批后才改变应付金额', async () => {
    const initial = await overview()
    const originalPayable = initial.focusStatement.shares.payableFen
    const requested = await write(
      authorization.provider,
      `/api/v1/provider/settlements/${currentStatementId}/adjustments`,
      'settlement:adjustment:request',
      {
        expectedVersion: 1,
        direction: 'CREDIT',
        amountFen: 12_345,
        reason: '补充确认本期线下联合交付服务差额',
        evidence: ['补充协议 LQ-SH-2026-07', '城市交付确认单 #088'],
        confirmed: true,
      },
    )
    const adjustment = requested.json().focusStatement.adjustments[0]
    expect(adjustment).toMatchObject({
      status: 'PENDING',
      direction: 'CREDIT',
      amountFen: 12_345,
    })
    expect(requested.json().focusStatement.shares.payableFen).toBe(originalPayable)

    await write(
      authorization.provider,
      `/api/v1/provider/settlements/${currentStatementId}/adjustments/${adjustment.id}/decision`,
      'settlement:adjustment:self-approve',
      {
        expectedVersion: 2,
        decision: 'APPROVE',
        note: '城市方不得自批',
        confirmed: true,
      },
      403,
    )
    const approved = await write(
      authorization.hq,
      `/api/v1/provider/settlements/${currentStatementId}/adjustments/${adjustment.id}/decision`,
      'settlement:adjustment:hq-approve',
      {
        expectedVersion: 2,
        decision: 'APPROVE',
        note: '补充协议与交付确认单一致，同意计入本期应付。',
        confirmed: true,
      },
    )
    expect(approved.json().focusStatement).toMatchObject({
      version: 3,
      shares: {
        approvedAdjustmentFen: 12_345,
        payableFen: originalPayable + 12_345,
      },
    })
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE aggregate_id = ? AND topic =
         'provider.settlement.adjustment.approved.v1'`,
    ).get(currentStatementId) as { count: number }).count).toBe(1)
  })

  it('发票必须与应付金额一致，提交后由总部核验并锁定待结算状态', async () => {
    const initial = await overview()
    const payableFen = initial.focusStatement.shares.payableFen
    await write(
      authorization.provider,
      `/api/v1/provider/settlements/${currentStatementId}/invoices`,
      'settlement:invoice:mismatch',
      {
        expectedVersion: 1,
        invoiceNo: 'SH-LQ-MISMATCH-01',
        sellerName: '上海乐趣城市服务有限公司',
        sellerTaxIdMasked: '9131**********6X',
        amountFen: payableFen + 1,
        issuedAt: new Date().toISOString(),
        confirmed: true,
      },
      422,
    )
    const submitted = await write(
      authorization.provider,
      `/api/v1/provider/settlements/${currentStatementId}/invoices`,
      'settlement:invoice:submit',
      {
        expectedVersion: 1,
        invoiceNo: 'SH-LQ-CURRENT-001',
        sellerName: '上海乐趣城市服务有限公司',
        sellerTaxIdMasked: '9131**********6X',
        amountFen: payableFen,
        issuedAt: new Date().toISOString(),
        confirmed: true,
      },
    )
    expect(submitted.json().focusStatement).toMatchObject({
      status: 'INVOICE_SUBMITTED',
      version: 2,
      invoice: {
        invoiceNo: 'SH-LQ-CURRENT-001',
        status: 'SUBMITTED',
        amountFen: payableFen,
      },
    })
    const verified = await write(
      authorization.hq,
      `/api/v1/provider/settlements/${currentStatementId}/invoice-decision`,
      'settlement:invoice:verify',
      {
        expectedVersion: 2,
        decision: 'VERIFY',
        note: '抬头、税号、账期与金额均核验一致。',
        confirmed: true,
      },
    )
    expect(verified.json().focusStatement).toMatchObject({
      status: 'READY_FOR_SETTLEMENT',
      version: 3,
      invoice: { status: 'VERIFIED' },
    })
  })

  it('财务强确认后一次性追加账本并发布 settlement.completed.v1', async () => {
    const initial = await overview()
    const payableFen = initial.focusStatement.shares.payableFen
    await write(
      authorization.provider,
      `/api/v1/provider/settlements/${currentStatementId}/invoices`,
      'settlement:flow:invoice',
      {
        expectedVersion: 1,
        invoiceNo: 'SH-LQ-SETTLE-001',
        sellerName: '上海乐趣城市服务有限公司',
        sellerTaxIdMasked: '9131**********6X',
        amountFen: payableFen,
        issuedAt: new Date().toISOString(),
        confirmed: true,
      },
    )
    await write(
      authorization.hq,
      `/api/v1/provider/settlements/${currentStatementId}/invoice-decision`,
      'settlement:flow:verify',
      {
        expectedVersion: 2,
        decision: 'VERIFY',
        note: '结算发票核验通过。',
        confirmed: true,
      },
    )
    const settleRequest = {
      expectedVersion: 3,
      confirmed: true,
    }
    const settled = await write(
      authorization.hq,
      `/api/v1/provider/settlements/${currentStatementId}/settle`,
      'settlement:flow:settle',
      settleRequest,
    )
    expect(settled.json().focusStatement).toMatchObject({
      status: 'SETTLED',
      version: 4,
    })
    const ledger = database.prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN direction = 'CREDIT' THEN amount_fen ELSE -amount_fen END
       ), 0) AS value, COUNT(*) AS count
       FROM provider_city_settlement_ledger WHERE statement_id = ?`,
    ).get(currentStatementId) as { value: number; count: number }
    expect(ledger.value).toBe(payableFen)
    expect(ledger.count).toBeGreaterThan(0)
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM outbox_events
       WHERE aggregate_id = ? AND topic = 'settlement.completed.v1'`,
    ).get(currentStatementId) as { count: number }).count).toBe(1)

    await write(
      authorization.hq,
      `/api/v1/provider/settlements/${currentStatementId}/settle`,
      'settlement:flow:settle',
      settleRequest,
    )
    expect((database.prepare(
      `SELECT COUNT(*) AS count FROM provider_city_settlement_events
       WHERE statement_id = ? AND type = 'SETTLED'`,
    ).get(currentStatementId) as { count: number }).count).toBe(1)
  })

  it('城市范围在 SQL 层隔离，总部可见而销售与交付角色均无权读取', async () => {
    database.prepare(
      `UPDATE provider_city_settlement_statements
       SET city_id = 'city-hangzhou' WHERE id = ?`,
    ).run(currentStatementId)

    const provider = await overview()
    const hq = await overview(authorization.hq)
    expect(provider.statements).toHaveLength(1)
    expect(hq.statements).toHaveLength(2)
    await overview(authorization.provider, currentStatementId, 404)
    await overview(authorization.sales, undefined, 403)
    await overview(authorization.delivery, undefined, 403)
  })

  it('规则、账本和结算事件均由数据库触发器阻止改写与删除', () => {
    const ledger = database.prepare(
      `SELECT id FROM provider_city_settlement_ledger ORDER BY sequence LIMIT 1`,
    ).get() as { id: string }
    const event = database.prepare(
      `SELECT id FROM provider_city_settlement_events ORDER BY sequence LIMIT 1`,
    ).get() as { id: string }

    expect(() => database.prepare(
      `UPDATE provider_city_settlement_rules SET signing_share_bps = 1
       WHERE id = 'provider-city-settlement-rule-demo'`,
    ).run()).toThrow(/versioned/)
    expect(() => database.prepare(
      `UPDATE provider_city_settlement_ledger SET amount_fen = 1 WHERE id = ?`,
    ).run(ledger.id)).toThrow(/append-only/)
    expect(() => database.prepare(
      `DELETE FROM provider_city_settlement_events WHERE id = ?`,
    ).run(event.id)).toThrow(/append-only/)
  })
})
