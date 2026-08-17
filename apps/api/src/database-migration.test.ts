import { randomUUID } from 'node:crypto'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { createDatabase } from './database.js'

const TEMP_ROOT = resolve(tmpdir())

function assertSystemTempFile(path: string): void {
  const resolved = resolve(path)
  const relativePath = relative(TEMP_ROOT, resolved)
  if (
    relativePath.length === 0
    || relativePath === '..'
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error(`refusing to use a migration test file outside system temp: ${resolved}`)
  }
}

describe('E8J consumer deal lifecycle database migration', () => {
  let databasePath: string | null = null
  let legacyDatabase: DatabaseSync | null = null
  let migratedDatabase: DatabaseSync | null = null
  let previousSeedDemoAuth: string | undefined

  afterEach(() => {
    try {
      migratedDatabase?.close()
    } finally {
      migratedDatabase = null
    }
    try {
      legacyDatabase?.close()
    } finally {
      legacyDatabase = null
    }
    if (previousSeedDemoAuth === undefined) {
      delete process.env.LEQU_SEED_DEMO_AUTH
    } else {
      process.env.LEQU_SEED_DEMO_AUTH = previousSeedDemoAuth
    }
    if (!databasePath) return
    for (const candidate of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
      assertSystemTempFile(candidate)
      if (existsSync(candidate)) rmSync(candidate, { force: true })
    }
    databasePath = null
  })

  it('preserves E8I rows and installs the expanded lifecycle schema safely', () => {
    previousSeedDemoAuth = process.env.LEQU_SEED_DEMO_AUTH
    process.env.LEQU_SEED_DEMO_AUTH = 'false'
    databasePath = join(tmpdir(), `lequ-e8i-migration-${randomUUID()}.sqlite`)
    assertSystemTempFile(databasePath)

    legacyDatabase = new DatabaseSync(databasePath)
    legacyDatabase.exec(`
      PRAGMA foreign_keys = ON;

      CREATE TABLE consumer_deal_drafts (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE merchant_orders (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        merchant_id TEXT NOT NULL,
        store_id TEXT NOT NULL,
        status TEXT NOT NULL,
        placed_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE merchant_skus (
        id TEXT PRIMARY KEY,
        spu_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE merchant_service_slots (
        id TEXT PRIMARY KEY,
        sku_id TEXT NOT NULL,
        weekday INTEGER NOT NULL,
        start_time TEXT NOT NULL
      ) STRICT;

      INSERT INTO consumer_deal_drafts
        (id, tenant_id, user_id, status, version, updated_at)
      VALUES
        ('draft-e8i-1', 'tenant-e8i', 'user-e8i', 'WAITING_CONFIRMATION', 1,
         '2026-07-28T08:00:00.000Z'),
        ('draft-e8i-2', 'tenant-e8i', 'user-e8i', 'WAITING_CONFIRMATION', 1,
         '2026-07-28T08:00:00.000Z');

      INSERT INTO merchant_orders
        (id, tenant_id, merchant_id, store_id, status, placed_at, updated_at)
      VALUES
        ('order-e8i-1', 'tenant-e8i', 'merchant-e8i', 'store-e8i',
         'PENDING_CONFIRMATION', '2026-07-28T08:00:00.000Z',
         '2026-07-28T08:00:00.000Z'),
        ('order-e8i-2', 'tenant-e8i', 'merchant-e8i', 'store-e8i',
         'PENDING_CONFIRMATION', '2026-07-28T08:00:00.000Z',
         '2026-07-28T08:00:00.000Z');

      INSERT INTO merchant_skus (id, spu_id, status, updated_at)
      VALUES ('sku-e8i-1', 'spu-e8i-1', 'ACTIVE', '2026-07-28T08:00:00.000Z');

      CREATE TABLE consumer_deal_payment_intents (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        draft_id TEXT NOT NULL UNIQUE,
        order_id TEXT NOT NULL UNIQUE,
        provider TEXT NOT NULL CHECK (provider = 'WECHAT_PAY'),
        currency TEXT NOT NULL CHECK (currency = 'CNY'),
        amount_fen INTEGER NOT NULL CHECK (amount_fen > 0),
        status TEXT NOT NULL CHECK (status IN ('PENDING_PROVIDER', 'CANCELLED')),
        provider_request_id TEXT NOT NULL UNIQUE,
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
        FOREIGN KEY (order_id) REFERENCES merchant_orders(id)
      ) STRICT;

      CREATE TABLE consumer_deal_fulfillment_holds (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        draft_id TEXT NOT NULL UNIQUE,
        order_id TEXT NOT NULL UNIQUE,
        sku_id TEXT NOT NULL,
        slot_id TEXT,
        quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
        status TEXT NOT NULL CHECK (status IN ('HELD', 'CONSUMED', 'RELEASED')),
        expires_at TEXT NOT NULL,
        released_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (draft_id) REFERENCES consumer_deal_drafts(id),
        FOREIGN KEY (order_id) REFERENCES merchant_orders(id),
        FOREIGN KEY (sku_id) REFERENCES merchant_skus(id),
        FOREIGN KEY (slot_id) REFERENCES merchant_service_slots(id)
      ) STRICT;

      INSERT INTO consumer_deal_payment_intents
        (id, tenant_id, user_id, draft_id, order_id, provider, currency,
         amount_fen, status, provider_request_id, version, created_at, updated_at)
      VALUES
        ('payment-e8i-1', 'tenant-e8i', 'user-e8i', 'draft-e8i-1',
         'order-e8i-1', 'WECHAT_PAY', 'CNY', 62800, 'PENDING_PROVIDER',
         'request-e8i-1', 3, '2026-07-28T08:00:00.000Z',
         '2026-07-28T08:05:00.000Z');

      INSERT INTO consumer_deal_fulfillment_holds
        (id, tenant_id, user_id, draft_id, order_id, sku_id, slot_id, quantity,
         status, expires_at, released_at, created_at, updated_at)
      VALUES
        ('hold-e8i-1', 'tenant-e8i', 'user-e8i', 'draft-e8i-1', 'order-e8i-1',
         'sku-e8i-1', NULL, 1, 'CONSUMED', '2026-07-29T08:00:00.000Z', NULL,
         '2026-07-28T08:00:00.000Z', '2026-07-28T08:05:00.000Z');
    `)
    legacyDatabase.close()
    legacyDatabase = null

    migratedDatabase = createDatabase(databasePath)

    expect(migratedDatabase.prepare(
      `SELECT id, tenant_id, user_id, draft_id, order_id, amount_fen, status,
              provider_request_id, provider_transaction_id, failure_code,
              late_success, version, created_at, updated_at
       FROM consumer_deal_payment_intents WHERE id = 'payment-e8i-1'`,
    ).get()).toEqual({
      id: 'payment-e8i-1',
      tenant_id: 'tenant-e8i',
      user_id: 'user-e8i',
      draft_id: 'draft-e8i-1',
      order_id: 'order-e8i-1',
      amount_fen: 62800,
      status: 'PENDING_PROVIDER',
      provider_request_id: 'request-e8i-1',
      provider_transaction_id: null,
      failure_code: null,
      late_success: 0,
      version: 3,
      created_at: '2026-07-28T08:00:00.000Z',
      updated_at: '2026-07-28T08:05:00.000Z',
    })
    expect(migratedDatabase.prepare(
      `SELECT id, status, consumed_at, released_at, fulfilled_at, updated_at
       FROM consumer_deal_fulfillment_holds WHERE id = 'hold-e8i-1'`,
    ).get()).toEqual({
      id: 'hold-e8i-1',
      status: 'CONSUMED',
      consumed_at: '2026-07-28T08:05:00.000Z',
      released_at: null,
      fulfilled_at: null,
      updated_at: '2026-07-28T08:05:00.000Z',
    })

    expect(migratedDatabase.prepare(
      `UPDATE consumer_deal_payment_intents
       SET status = 'LATE_SUCCEEDED', provider_transaction_id = 'wx-txn-e8i-1',
           late_success = 1, succeeded_at = '2026-07-28T08:10:00.000Z',
           version = version + 1, updated_at = '2026-07-28T08:10:00.000Z'
       WHERE id = 'payment-e8i-1'`,
    ).run().changes).toBe(1)
    expect(migratedDatabase.prepare(
      `UPDATE consumer_deal_fulfillment_holds
       SET status = 'FULFILLED', fulfilled_at = '2026-07-28T08:10:00.000Z',
           updated_at = '2026-07-28T08:10:00.000Z'
       WHERE id = 'hold-e8i-1'`,
    ).run().changes).toBe(1)
    expect(migratedDatabase.prepare(
      "SELECT status, provider_transaction_id, late_success FROM consumer_deal_payment_intents WHERE id = 'payment-e8i-1'",
    ).get()).toEqual({
      status: 'LATE_SUCCEEDED',
      provider_transaction_id: 'wx-txn-e8i-1',
      late_success: 1,
    })
    expect(migratedDatabase.prepare(
      "SELECT status, fulfilled_at FROM consumer_deal_fulfillment_holds WHERE id = 'hold-e8i-1'",
    ).get()).toEqual({
      status: 'FULFILLED',
      fulfilled_at: '2026-07-28T08:10:00.000Z',
    })

    migratedDatabase.prepare(
      `INSERT INTO consumer_deal_payment_intents
       (id, tenant_id, user_id, draft_id, order_id, provider, currency,
        amount_fen, status, provider_request_id, provider_transaction_id,
        version, created_at, updated_at)
       VALUES ('payment-e8i-2', 'tenant-e8i', 'user-e8i', 'draft-e8i-2',
               'order-e8i-2', 'WECHAT_PAY', 'CNY', 98800, 'SUCCEEDED',
               'request-e8i-2', 'wx-txn-e8i-2', 1,
               '2026-07-28T08:15:00.000Z', '2026-07-28T08:15:00.000Z')`,
    ).run()
    expect(() => migratedDatabase?.prepare(
      `UPDATE consumer_deal_payment_intents
       SET provider_transaction_id = 'wx-txn-e8i-1'
       WHERE id = 'payment-e8i-2'`,
    ).run()).toThrow(/UNIQUE constraint failed.*provider_transaction_id/)

    const lifecycleTables = migratedDatabase.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name IN (
         'payment_connector_receipts',
         'consumer_deal_payment_events',
         'consumer_deal_refund_requests',
         'consumer_deal_refund_attempts',
         'consumer_deal_redemption_credentials',
         'consumer_deal_redemption_events'
       ) ORDER BY name`,
    ).all() as unknown as Array<{ name: string }>
    expect(lifecycleTables.map(({ name }) => name)).toEqual([
      'consumer_deal_payment_events',
      'consumer_deal_redemption_credentials',
      'consumer_deal_redemption_events',
      'consumer_deal_refund_attempts',
      'consumer_deal_refund_requests',
      'payment_connector_receipts',
    ])

    const lifecycleTriggers = migratedDatabase.prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'trigger' AND name IN (
         'consumer_deal_payment_events_no_update',
         'consumer_deal_payment_events_no_delete',
         'consumer_deal_redemption_events_no_update',
         'consumer_deal_redemption_events_no_delete'
       ) ORDER BY name`,
    ).all() as unknown as Array<{ name: string }>
    expect(lifecycleTriggers.map(({ name }) => name)).toEqual([
      'consumer_deal_payment_events_no_delete',
      'consumer_deal_payment_events_no_update',
      'consumer_deal_redemption_events_no_delete',
      'consumer_deal_redemption_events_no_update',
    ])

    migratedDatabase.prepare(
      `INSERT INTO consumer_deal_payment_events
       (id, tenant_id, user_id, intent_id, draft_id, order_id,
        provider_event_id, type, request_hash, outcome, summary,
        payload_json, created_at)
       VALUES ('event-e8i-1', 'tenant-e8i', 'user-e8i', 'payment-e8i-1',
               'draft-e8i-1', 'order-e8i-1', 'provider-event-e8i-1',
               'PAYMENT_SUCCEEDED', 'hash-e8i-1', 'LATE_PAYMENT_COMPENSATION_STARTED',
               'legacy payment migrated', '{}', '2026-07-28T08:20:00.000Z')`,
    ).run()
    expect(() => migratedDatabase?.prepare(
      "UPDATE consumer_deal_payment_events SET summary = 'tampered' WHERE id = 'event-e8i-1'",
    ).run()).toThrow(/consumer_deal_payment_events is append-only/)
  })
})
