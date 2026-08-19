import type pg from 'pg';
import { TenantIdSchema, UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { LifeConsumerSessionIdentity } from './life-consumer-session-identity.js';

const SetCartItemSchema = z.object({
  merchantTenantId: TenantIdSchema,
  storeId: UuidSchema,
  variantId: UuidSchema,
  quantity: z.number().int().min(1).max(999),
});

export interface PlatformCartService {
  get(identity: LifeConsumerSessionIdentity): Promise<unknown>;
  setItem(identity: LifeConsumerSessionIdentity, input: unknown): Promise<unknown>;
  removeItem(identity: LifeConsumerSessionIdentity, itemId: string): Promise<unknown>;
}

export class PlatformCartAuthenticationError extends Error {}
export class PlatformCartItemUnavailableError extends Error {}
export class PlatformCartItemNotFoundError extends Error {}

export function createPlatformCartService(pool: Pick<pg.Pool, 'connect'>): PlatformCartService {
  async function transaction<T>(
    identity: LifeConsumerSessionIdentity,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.consumer_account_id',$1,true)", [
        identity.accountId,
      ]);
      const activeSession = await client.query(
        `SELECT 1
           FROM platform_consumer_sessions session
           JOIN platform_consumer_accounts account ON account.id=session.account_id
          WHERE session.session_id=$1 AND session.account_id=$2
            AND session.revoked_at IS NULL AND session.expires_at>now()
            AND account.status='ACTIVE'`,
        [identity.sessionId, identity.accountId],
      );
      if (activeSession.rowCount !== 1) throw new PlatformCartAuthenticationError();
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function ensureCart(client: pg.PoolClient, accountId: string) {
    const result = await client.query<{ id: string; version: number }>(
      `INSERT INTO shopping_carts(account_id)
       VALUES ($1)
       ON CONFLICT (account_id) WHERE status='ACTIVE'
       DO UPDATE SET updated_at=shopping_carts.updated_at
       RETURNING id,version`,
      [accountId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('active cart could not be created');
    return row;
  }

  async function loadCart(client: pg.PoolClient, accountId: string) {
    const carts = await client.query<{ id: string; version: number }>(
      `SELECT id,version FROM shopping_carts
        WHERE account_id=$1 AND status='ACTIVE'`,
      [accountId],
    );
    const cart = carts.rows[0];
    if (!cart) return { id: null, version: 0, itemCount: 0, groups: [] };
    const items = await client.query<{
      id: string;
      merchant_tenant_id: string;
      store_id: string;
      product_id: string;
      variant_id: string;
      quantity: number;
      version: number;
    }>(
      `SELECT id,merchant_tenant_id,store_id,product_id,variant_id,quantity,version
         FROM shopping_cart_items
        WHERE cart_id=$1
        ORDER BY merchant_tenant_id,store_id,created_at,id`,
      [cart.id],
    );
    const groups = new Map<
      string,
      {
        merchantTenantId: string;
        storeId: string;
        storeName: string | null;
        subtotalCents: number;
        items: unknown[];
      }
    >();
    for (const item of items.rows) {
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [item.merchant_tenant_id]);
      const current = await client.query<{
        store_name: string;
        product_title: string;
        product_type: string;
        variant_title: string;
        sale_price_cents: string | number;
        available_quantity: string | number;
      }>(
        `SELECT store.store_name,product.title AS product_title,product.product_type,
                variant.title AS variant_title,variant.sale_price_cents,
                GREATEST(COALESCE(balance.on_hand,0)-COALESCE(balance.reserved,0),0)
                  AS available_quantity
           FROM stores store
           JOIN products product
             ON product.tenant_id=store.tenant_id AND product.store_id=store.id
           JOIN product_variants variant
             ON variant.tenant_id=product.tenant_id AND variant.product_id=product.id
           LEFT JOIN inventory_balances balance
             ON balance.tenant_id=variant.tenant_id AND balance.variant_id=variant.id
          WHERE store.tenant_id=$1 AND store.id=$2 AND product.id=$3 AND variant.id=$4
            AND store.status='ACTIVE' AND product.status='ON_SALE' AND variant.status='ACTIVE'`,
        [item.merchant_tenant_id, item.store_id, item.product_id, item.variant_id],
      );
      const live = current.rows[0];
      const key = `${item.merchant_tenant_id}:${item.store_id}`;
      const group = groups.get(key) ?? {
        merchantTenantId: item.merchant_tenant_id,
        storeId: item.store_id,
        storeName: live?.store_name ?? null,
        subtotalCents: 0,
        items: [],
      };
      const availableQuantity = live ? Number(live.available_quantity) : 0;
      const available = Boolean(live) && availableQuantity >= item.quantity;
      const unitPriceCents = live ? Number(live.sale_price_cents) : null;
      if (available && unitPriceCents !== null)
        group.subtotalCents += unitPriceCents * item.quantity;
      group.items.push({
        id: item.id,
        productId: item.product_id,
        variantId: item.variant_id,
        productTitle: live?.product_title ?? '已失效商品',
        productType: live?.product_type ?? null,
        variantTitle: live?.variant_title ?? null,
        quantity: item.quantity,
        unitPriceCents,
        availableQuantity,
        available,
        version: item.version,
      });
      groups.set(key, group);
    }
    return {
      id: cart.id,
      version: cart.version,
      itemCount: items.rows.reduce((total, item) => total + item.quantity, 0),
      groups: [...groups.values()],
    };
  }

  return {
    async get(identity) {
      return transaction(identity, (client) => loadCart(client, identity.accountId));
    },

    async setItem(identity, rawInput) {
      const input = SetCartItemSchema.parse(rawInput);
      return transaction(identity, async (client) => {
        const link = await client.query(
          `SELECT 1 FROM platform_consumer_tenant_links
            WHERE account_id=$1 AND merchant_tenant_id=$2 AND status='ACTIVE'`,
          [identity.accountId, input.merchantTenantId],
        );
        if (link.rowCount !== 1)
          throw new PlatformCartItemUnavailableError('merchant link missing');
        await client.query("SELECT set_config('app.tenant_id',$1,true)", [input.merchantTenantId]);
        const selected = await client.query<{
          product_id: string;
          available_quantity: string | number;
        }>(
          `SELECT product.id AS product_id,
                  GREATEST(COALESCE(balance.on_hand,0)-COALESCE(balance.reserved,0),0)
                    AS available_quantity
             FROM stores store
             JOIN products product
               ON product.tenant_id=store.tenant_id AND product.store_id=store.id
             JOIN product_variants variant
               ON variant.tenant_id=product.tenant_id AND variant.product_id=product.id
             LEFT JOIN inventory_balances balance
               ON balance.tenant_id=variant.tenant_id AND balance.variant_id=variant.id
            WHERE store.tenant_id=$1 AND store.id=$2 AND variant.id=$3
              AND store.status='ACTIVE' AND product.status='ON_SALE' AND variant.status='ACTIVE'`,
          [input.merchantTenantId, input.storeId, input.variantId],
        );
        const product = selected.rows[0];
        if (!product || Number(product.available_quantity) < input.quantity)
          throw new PlatformCartItemUnavailableError('product or inventory unavailable');
        const cart = await ensureCart(client, identity.accountId);
        await client.query(
          `INSERT INTO shopping_cart_items(
             cart_id,merchant_tenant_id,store_id,product_id,variant_id,quantity
           ) VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (cart_id,merchant_tenant_id,store_id,variant_id)
           DO UPDATE SET quantity=EXCLUDED.quantity,version=shopping_cart_items.version+1,
                         updated_at=now()`,
          [
            cart.id,
            input.merchantTenantId,
            input.storeId,
            product.product_id,
            input.variantId,
            input.quantity,
          ],
        );
        await client.query(
          `UPDATE shopping_carts SET version=version+1,updated_at=now()
            WHERE account_id=$1 AND id=$2 AND status='ACTIVE'`,
          [identity.accountId, cart.id],
        );
        return loadCart(client, identity.accountId);
      });
    },

    async removeItem(identity, rawItemId) {
      const itemId = UuidSchema.parse(rawItemId);
      return transaction(identity, async (client) => {
        const removed = await client.query<{ cart_id: string }>(
          `DELETE FROM shopping_cart_items item
            USING shopping_carts cart
            WHERE item.cart_id=cart.id AND cart.account_id=$1
              AND cart.status='ACTIVE' AND item.id=$2
            RETURNING item.cart_id`,
          [identity.accountId, itemId],
        );
        if (removed.rowCount !== 1) throw new PlatformCartItemNotFoundError();
        await client.query(
          `UPDATE shopping_carts SET version=version+1,updated_at=now()
            WHERE account_id=$1 AND id=$2 AND status='ACTIVE'`,
          [identity.accountId, removed.rows[0]!.cart_id],
        );
        return loadCart(client, identity.accountId);
      });
    },
  };
}
