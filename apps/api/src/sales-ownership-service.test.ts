import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from './app.js'
import { DEVELOPMENT_ACCESS_TOKENS } from './auth-service.js'
import { createDatabase } from './database.js'

const salesAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.sales}`
const salesPeerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.salesPeer}`
const cityManagerAuthorization = `Bearer ${DEVELOPMENT_ACCESS_TOKENS.cityManager}`

describe('E6 销售宝归属、保护期、申诉、转移与协作', () => {
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

  async function getOwnership(
    authorization = salesAuthorization,
    leadId = 'lead-yunheli',
  ) {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/ownership/${leadId}`,
      headers: { authorization },
    })
    expect(response.statusCode, response.body).toBe(200)
    return response.json()
  }

  async function requestTransfer(key = 'e6-ownership:request-peer') {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sales/ownership/lead-yunheli/transfer-requests',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': key,
      },
      payload: {
        targetOwnerId: 'user-demo-sales-peer',
        reason: '宁安已持续跟进该商圈且商家明确希望由她继续对接',
        evidence: ['7 月 23 日商家微信群确认记录', '同城销售交接清单已完成'],
        expectedLeadVersion: 1,
      },
    })
    return response
  }

  it('返回负责人、保护期策略、同城候选人、协作人与角色化权限', async () => {
    const overview = await getOwnership()
    expect(overview).toMatchObject({
      lead: { id: 'lead-yunheli', ownerId: 'user-demo-sales', version: 1 },
      owner: {
        userId: 'user-demo-sales',
        displayName: '上海销售顾问',
        roles: ['CITY_SALES'],
      },
      protection: {
        status: 'ACTIVE',
        daysRemaining: 30,
        policyVersion: 'lead-protection-30d-v1',
        transferFrozen: false,
      },
      permissions: {
        canRequestTransfer: true,
        canSubmitAppeal: true,
        canManageOwnership: false,
        canAddCollaborator: false,
      },
    })
    expect(overview.candidates.map((item: { userId: string }) => item.userId))
      .toEqual(['user-demo-city-manager', 'user-demo-sales-peer'])
    expect(overview.collaborationCandidates.map((item: { userId: string }) => item.userId))
      .toEqual([
        'user-demo-city-manager',
        'user-demo-provider',
        'user-demo-delivery',
        'user-demo-sales-peer',
      ])
    expect(overview.transferRequests).toEqual([])
    expect(overview.appeals).toEqual([])
  })

  it('销售只能提交幂等转移申请，不能直接转移、重复申请或与申诉并行', async () => {
    const requested = await requestTransfer()
    const replay = await requestTransfer()
    expect(requested.statusCode, requested.body).toBe(200)
    expect(replay.statusCode, replay.body).toBe(200)
    expect(replay.body).toBe(requested.body)
    expect(requested.json()).toMatchObject({
      lead: { ownerId: 'user-demo-sales', version: 1 },
      permissions: { canRequestTransfer: false },
      transferRequests: [{
        status: 'PENDING',
        targetOwner: { userId: 'user-demo-sales-peer' },
        leadVersionAtRequest: 1,
        version: 1,
      }],
      events: [{ type: 'TRANSFER_REQUESTED' }],
    })

    const direct = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/transfer',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-ownership:direct-denied',
      },
      payload: {
        targetOwnerId: 'user-demo-sales-peer',
        reason: '销售尝试绕过审批直接转移',
        expectedVersion: 1,
      },
    })
    expect(direct.statusCode).toBe(403)

    const duplicate = await requestTransfer('e6-ownership:request-duplicate')
    expect(duplicate.statusCode).toBe(409)
    expect(duplicate.json().title).toBe('transfer_request_pending')

    const appeal = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/appeals',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-ownership:parallel-appeal',
      },
      payload: {
        reason: '转移申请审批期间发起并行争议',
        evidence: ['重复线索证据'],
      },
    })
    expect(appeal.statusCode).toBe(409)
    expect(appeal.json().title).toBe('transfer_request_pending')
  })

  it('城市负责人批准后原负责人保留观察协作、任务同步归属并重算保护期', async () => {
    const requested = await requestTransfer()
    const request = requested.json().transferRequests[0]
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/ownership/transfer-requests/${request.id}/decision`,
      headers: {
        authorization: cityManagerAuthorization,
        'idempotency-key': 'e6-ownership:approve-transfer',
      },
      payload: {
        decision: 'APPROVE',
        note: '证据完整且商家已确认，批准同城销售平稳交接',
        expectedVersion: request.version,
      },
    })
    expect(approved.statusCode, approved.body).toBe(200)
    expect(approved.json()).toMatchObject({
      lead: { ownerId: 'user-demo-sales-peer', version: 2 },
      owner: { displayName: '上海销售顾问·宁安' },
      protection: { status: 'ACTIVE', daysRemaining: 30 },
      collaborators: [{
        userId: 'user-demo-sales',
        displayName: '上海销售顾问',
        role: 'OBSERVER',
      }],
      transferRequests: [{
        status: 'APPROVED',
        decisionBy: { userId: 'user-demo-city-manager' },
        version: 2,
      }],
    })
    expect(approved.json().events.map((item: { type: string }) => item.type))
      .toEqual(['TRANSFER_APPROVED', 'TRANSFER_REQUESTED'])

    const taskOwners = database.prepare(
      `SELECT DISTINCT owner_id FROM sales_tasks
       WHERE lead_id = 'lead-yunheli' AND status IN ('PENDING', 'SNOOZED')`,
    ).all() as unknown as Array<{ owner_id: string }>
    expect(taskOwners).toEqual([{ owner_id: 'user-demo-sales-peer' }])
    const evidence = {
      audit: database.prepare(
        `SELECT COUNT(*) AS count FROM audit_events WHERE run_id = 'sales-ownership-e6'`,
      ).get() as { count: number },
      outbox: database.prepare(
        `SELECT COUNT(*) AS count FROM outbox_events WHERE run_id = 'sales-ownership-e6'`,
      ).get() as { count: number },
    }
    expect(evidence).toEqual({ audit: { count: 2 }, outbox: { count: 2 } })

    const previousOwnerView = await getOwnership(salesAuthorization)
    expect(previousOwnerView.owner.userId).toBe('user-demo-sales-peer')
    const newOwnerView = await getOwnership(salesPeerAuthorization)
    expect(newOwnerView.permissions.canRequestTransfer).toBe(true)
  })

  it('拒绝转移时保留负责人和保护期，且已裁决申请不能再次处理', async () => {
    const before = await getOwnership()
    const requested = await requestTransfer('e6-ownership:request-reject')
    const request = requested.json().transferRequests[0]
    const decision = {
      method: 'POST' as const,
      url: `/api/v1/sales/ownership/transfer-requests/${request.id}/decision`,
      headers: {
        authorization: cityManagerAuthorization,
        'idempotency-key': 'e6-ownership:reject-transfer',
      },
      payload: {
        decision: 'REJECT',
        note: '当前销售仍处于有效保护期，交接依据不足',
        expectedVersion: request.version,
      },
    }
    const rejected = await app.inject(decision)
    expect(rejected.statusCode, rejected.body).toBe(200)
    expect(rejected.json()).toMatchObject({
      lead: { ownerId: 'user-demo-sales', version: 1 },
      transferRequests: [{ status: 'REJECTED', version: 2 }],
      events: [{ type: 'TRANSFER_REJECTED' }, { type: 'TRANSFER_REQUESTED' }],
    })
    expect(rejected.json().protection.expiresAt).toBe(before.protection.expiresAt)

    const secondDecision = await app.inject({
      ...decision,
      headers: {
        ...decision.headers,
        'idempotency-key': 'e6-ownership:reject-transfer-again',
      },
    })
    expect(secondDecision.statusCode).toBe(409)
    expect(secondDecision.json().title).toBe('transfer_request_already_decided')
  })

  it('申诉会冻结转移，城市负责人通过后解冻并重新计算保护期', async () => {
    const submitted = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/appeals',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-ownership:appeal-submit',
      },
      payload: {
        reason: '首次有效到店记录早于系统中的重复线索',
        evidence: ['7 月 18 日定位签到', '商家主理人确认截图'],
      },
    })
    expect(submitted.statusCode, submitted.body).toBe(200)

    const frozen = await getOwnership()
    expect(frozen).toMatchObject({
      lead: { disputeStatus: 'PENDING', version: 2 },
      protection: { status: 'DISPUTED', transferFrozen: true },
      permissions: { canRequestTransfer: false, canSubmitAppeal: false },
      appeals: [{ status: 'PENDING' }],
      events: [{ type: 'APPEAL_SUBMITTED' }],
    })

    const transfer = await app.inject({
      method: 'POST',
      url: '/api/v1/sales/ownership/lead-yunheli/transfer-requests',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-ownership:frozen-transfer',
      },
      payload: {
        targetOwnerId: 'user-demo-sales-peer',
        reason: '争议期间尝试转移',
        evidence: ['不应被接受'],
        expectedLeadVersion: 2,
      },
    })
    expect(transfer.statusCode).toBe(409)
    expect(transfer.json().title).toBe('ownership_frozen_by_appeal')

    const appeal = frozen.appeals[0]
    const approved = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/ownership/appeals/${appeal.id}/decision`,
      headers: {
        authorization: cityManagerAuthorization,
        'idempotency-key': 'e6-ownership:appeal-approve',
      },
      payload: {
        decision: 'APPROVE',
        note: '签到与商家确认相互印证，认可当前负责人归属',
        expectedLeadVersion: frozen.lead.version,
      },
    })
    expect(approved.statusCode, approved.body).toBe(200)
    expect(approved.json()).toMatchObject({
      lead: { disputeStatus: 'APPROVED', version: 3 },
      protection: { status: 'ACTIVE', daysRemaining: 30, transferFrozen: false },
      appeals: [{ status: 'APPROVED', decisionBy: { userId: 'user-demo-city-manager' } }],
      events: [{ type: 'APPEAL_APPROVED' }, { type: 'APPEAL_SUBMITTED' }],
    })
  })

  it('线索版本在等待审批期间变化时拒绝静默转移', async () => {
    const requested = await requestTransfer('e6-ownership:stale-request')
    const request = requested.json().transferRequests[0]
    const followedUp = await app.inject({
      method: 'POST',
      url: '/api/v1/onboarding/leads/lead-yunheli/followups',
      headers: {
        authorization: salesAuthorization,
        'idempotency-key': 'e6-ownership:stale-followup',
      },
      payload: {
        expectedVersion: 1,
        channel: 'PHONE',
        summary: '审批等待期间商家补充了新的决策信息',
        nextAction: '等待城市负责人复核转移申请',
        nextActionAt: new Date(Date.now() + 86400000).toISOString(),
      },
    })
    expect(followedUp.statusCode, followedUp.body).toBe(200)

    const stale = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/ownership/transfer-requests/${request.id}/decision`,
      headers: {
        authorization: cityManagerAuthorization,
        'idempotency-key': 'e6-ownership:stale-decision',
      },
      payload: {
        decision: 'APPROVE',
        note: '尝试基于旧版本批准',
        expectedVersion: request.version,
      },
    })
    expect(stale.statusCode).toBe(409)
    expect(stale.json().title).toBe('ownership_context_changed')
  })

  it('归属裁决事件禁止更新和删除', async () => {
    await requestTransfer('e6-ownership:immutable-request')
    expect(() => database.exec(
      "UPDATE lead_ownership_events SET summary = 'tampered'",
    )).toThrowError(/append-only/)
    expect(() => database.exec('DELETE FROM lead_ownership_events')).toThrowError(/append-only/)
  })
})
