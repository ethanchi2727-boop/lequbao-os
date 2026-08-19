import type pg from 'pg';
import { TenantIdSchema } from '@lequ/contracts';

type ExportRow = {
  id: string;
  customer_id: string;
  requested_by_session_id: string;
  scope: string[];
};

type ExportGatewayReceipt = {
  objectKey: string;
  encryptionKeyRef: string;
  expiresAt: string;
  encrypted: true;
  deliveryAccepted: true;
};

export async function dispatchPrivacyExportJobs(options: {
  pool: pg.Pool;
  tenantId: string;
  gatewayUrl: string;
  gatewayToken: string;
  fetch?: typeof globalThis.fetch;
}): Promise<Array<{ requestId: string; accepted: boolean }>> {
  const tenantId = TenantIdSchema.parse(options.tenantId);
  if (!URL.canParse(options.gatewayUrl)) throw new Error('privacy export gateway URL is invalid');
  if (Buffer.byteLength(options.gatewayToken, 'utf8') < 32)
    throw new Error('privacy export gateway token is too short');
  const request = options.fetch ?? globalThis.fetch;
  const client = await options.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    const claimed = await client.query<ExportRow>(
      `UPDATE customer_privacy_requests request
          SET status='PROCESSING',updated_at=now()
        WHERE request.id IN (
          SELECT id FROM customer_privacy_requests
           WHERE tenant_id=$1 AND request_type='VIEW' AND status IN('QUEUED','FAILED')
           ORDER BY requested_at,id FOR UPDATE SKIP LOCKED LIMIT 10
        )
      RETURNING request.id,request.customer_id,request.requested_by_session_id,request.scope`,
      [tenantId],
    );
    await client.query('COMMIT');

    const results: Array<{ requestId: string; accepted: boolean }> = [];
    for (const job of claimed.rows) {
      let receipt: ExportGatewayReceipt | undefined;
      try {
        const response = await request(
          `${options.gatewayUrl.replace(/\/$/u, '')}/v1/privacy-exports`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${options.gatewayToken}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              tenantId,
              requestId: job.id,
              customerId: job.customer_id,
              requestedBySessionId: job.requested_by_session_id,
              scope: job.scope,
              encryption: 'KMS_ENVELOPE_AES_256_GCM',
              expiresInSeconds: 900,
              deliverToVerifiedSession: true,
            }),
          },
        );
        if (!response.ok) throw new Error(`PRIVACY_EXPORT_GATEWAY_${response.status}`);
        const raw = (await response.json()) as Partial<ExportGatewayReceipt>;
        const expiresAt = new Date(String(raw.expiresAt));
        if (
          raw.encrypted !== true ||
          raw.deliveryAccepted !== true ||
          typeof raw.objectKey !== 'string' ||
          !raw.objectKey.startsWith(`${tenantId}/`) ||
          typeof raw.encryptionKeyRef !== 'string' ||
          raw.encryptionKeyRef.length < 8 ||
          !Number.isFinite(expiresAt.getTime()) ||
          expiresAt.getTime() > Date.now() + 15 * 60_000 + 5_000
        )
          throw new Error('PRIVACY_EXPORT_GATEWAY_INVALID_RECEIPT');
        receipt = raw as ExportGatewayReceipt;
      } catch (error) {
        await updateExportResult(options.pool, tenantId, job.id, {
          ok: false,
          errorCode: error instanceof Error ? error.message.slice(0, 120) : 'UNKNOWN',
        });
        results.push({ requestId: job.id, accepted: false });
        continue;
      }
      await updateExportResult(options.pool, tenantId, job.id, { ok: true, receipt });
      results.push({ requestId: job.id, accepted: true });
    }
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateExportResult(
  pool: pg.Pool,
  tenantId: string,
  requestId: string,
  result: { ok: true; receipt: ExportGatewayReceipt } | { ok: false; errorCode: string },
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    if (result.ok) {
      await client.query(
        `UPDATE customer_privacy_requests
            SET status='COMPLETED',completed_at=now(),updated_at=now(),
                result_summary=$3::jsonb
          WHERE tenant_id=$1 AND id=$2 AND request_type='VIEW' AND status='PROCESSING'`,
        [
          tenantId,
          requestId,
          JSON.stringify({
            encrypted_object_ref: result.receipt.objectKey,
            encryption_key_ref: result.receipt.encryptionKeyRef,
            expires_at: result.receipt.expiresAt,
            delivered_to_verified_session: true,
          }),
        ],
      );
      await client.query(
        `INSERT INTO audit_logs(
           tenant_id,actor_type,actor_id,action,resource_type,resource_id,result_code,trace_id
         ) VALUES($1,'SYSTEM','privacy-export-worker','privacy.export.delivered',
                  'customer_privacy_request',$2,'OK',$2)`,
        [tenantId, requestId],
      );
    } else {
      await client.query(
        `UPDATE customer_privacy_requests
            SET status='FAILED',updated_at=now(),result_summary=$3::jsonb
          WHERE tenant_id=$1 AND id=$2 AND request_type='VIEW' AND status='PROCESSING'`,
        [tenantId, requestId, JSON.stringify({ error_code: result.errorCode })],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
