import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  CommerceInventoryUnavailableError,
  createCommerceOrderService,
} from '../src/commerce-order-service.js';
import type { ConsumerSessionIdentity } from '../src/consumer-session-identity.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required');

const tenantId = randomUUID();
const storeId = randomUUID();
const customerId = randomUUID();
const productId = randomUUID();
const variantId = randomUUID();
const sessionId = `concurrency-${randomUUID()}`;
const stock = 3;
const contenders = 10;
const pool = new pg.Pool({ connectionString, max: contenders + 2 });

try {
  const seedClient = await pool.connect();
  try {
    await seedClient.query('BEGIN');
    await seedClient.query(
      `INSERT INTO tenants(id,tenant_code,legal_name,display_name)
       VALUES ($1,$2,'Commerce Concurrency Legal','Commerce Concurrency')`,
      [tenantId, `concurrency-${tenantId.slice(0, 8)}`],
    );
    await seedClient.query(
      `INSERT INTO stores(id,tenant_id,store_code,store_name,status)
       VALUES ($1,$2,$3,'Concurrency Store','ACTIVE')`,
      [storeId, tenantId, `CON-${storeId.slice(0, 8)}`],
    );
    await seedClient.query(
      `INSERT INTO customer_profiles(id,tenant_id,union_identifier_hash,status)
       VALUES ($1,$2,$3,'ACTIVE')`,
      [customerId, tenantId, createHash('sha256').update(customerId).digest('hex')],
    );
    await seedClient.query(
      `INSERT INTO products(
         id,tenant_id,store_id,product_type,title,status,sale_price_cents,reward_rule_snapshot
       ) VALUES ($1,$2,$3,'GROUP_BUY','Concurrency Product','ON_SALE',500,'{}'::jsonb)`,
      [productId, tenantId, storeId],
    );
    await seedClient.query(
      `INSERT INTO product_variants(id,tenant_id,product_id,sku_code,title,sale_price_cents,status)
       VALUES ($1,$2,$3,$4,'Standard',500,'ACTIVE')`,
      [variantId, tenantId, productId, `SKU-${variantId.slice(0, 8)}`],
    );
    await seedClient.query(
      `INSERT INTO inventory_balances(tenant_id,variant_id,on_hand,reserved)
       VALUES ($1,$2,$3,0)`,
      [tenantId, variantId, stock],
    );
    await seedClient.query(
      `INSERT INTO consumer_sessions(
         session_id,tenant_id,customer_id,store_id,auth_subject_hash,auth_level,expires_at
       ) VALUES ($1,$2,$3,$4,$5,'WECHAT',now()+interval '1 hour')`,
      [
        sessionId,
        tenantId,
        customerId,
        storeId,
        createHash('sha256').update(sessionId).digest('hex'),
      ],
    );
    await seedClient.query('COMMIT');
  } catch (error) {
    await seedClient.query('ROLLBACK');
    throw error;
  } finally {
    seedClient.release();
  }

  const identity: ConsumerSessionIdentity = {
    tenantId,
    customerId,
    storeId,
    sessionId,
    authLevel: 'WECHAT',
  };
  const service = createCommerceOrderService(pool);
  const results = await Promise.allSettled(
    Array.from({ length: contenders }, (_, index) =>
      service.create({
        identity,
        idempotencyKey: `commerce-concurrency:${tenantId}:${index}`,
        traceId: `trace-commerce-concurrency-${index}`,
        body: {
          storeId,
          sourceChannel: 'MERCHANT_MINI_PROGRAM',
          orderType: 'GROUP_BUY',
          items: [{ variantId, quantity: 1 }],
        },
      }),
    ),
  );
  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  if (fulfilled.length !== stock) {
    console.error(
      rejected.map((result) =>
        result.status === 'rejected'
          ? `${result.reason?.constructor?.name ?? 'Error'}: ${String(result.reason?.message ?? result.reason)}`
          : 'unexpected fulfilled result',
      ),
    );
  }
  assert.equal(fulfilled.length, stock);
  assert.equal(rejected.length, contenders - stock);
  assert.ok(
    rejected.every(
      (result) =>
        result.status === 'rejected' && result.reason instanceof CommerceInventoryUnavailableError,
    ),
  );

  const evidence = await pool.query<{
    on_hand: string;
    reserved: string;
    orders: string;
    item_quantity: string;
    ledger_quantity: string;
    outbox_events: string;
    idempotency_rows: string;
  }>(
    `SELECT
       balance.on_hand::text,
       balance.reserved::text,
       (SELECT count(*) FROM orders WHERE tenant_id=$1)::text AS orders,
       (SELECT COALESCE(sum(quantity),0) FROM order_items WHERE tenant_id=$1)::text AS item_quantity,
       (SELECT COALESCE(sum(quantity),0) FROM inventory_ledger
         WHERE tenant_id=$1 AND variant_id=$2 AND operation='RESERVE')::text AS ledger_quantity,
       (SELECT count(*) FROM outbox_events
         WHERE tenant_id=$1 AND event_name='order.created.v1')::text AS outbox_events,
       (SELECT count(*) FROM idempotency_keys
         WHERE tenant_id=$1 AND scope='commerce.order.create')::text AS idempotency_rows
     FROM inventory_balances balance
     WHERE balance.tenant_id=$1 AND balance.variant_id=$2`,
    [tenantId, variantId],
  );
  assert.deepEqual(evidence.rows[0], {
    on_hand: String(stock),
    reserved: String(stock),
    orders: String(stock),
    item_quantity: String(stock),
    ledger_quantity: String(stock),
    outbox_events: String(stock),
    idempotency_rows: String(stock),
  });
  console.log(
    `Commerce concurrency PostgreSQL integration passed: ${stock}/${contenders} committed, no oversell or failed-request fragments.`,
  );
} finally {
  await pool.end();
}
