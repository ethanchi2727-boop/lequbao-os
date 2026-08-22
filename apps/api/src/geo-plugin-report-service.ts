import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import type { SessionIdentity } from './session-identity.js';
import {
  PluginManifestSchema,
  PluginPolicyError,
  assertPluginCall,
  assertPluginInstall,
  buildTraceableMonthlyReport,
  nextCircuitState,
  requiresPluginReauthorization,
  validateGeoProfile,
} from './geo-plugin-report-policy.js';

type StaffIdentity = SessionIdentity & { accessScopes?: string[] };
const uuid = z.string().uuid();
const PublishGeoSchema = z.object({
  profile: z.unknown(),
  targetCode: z.string().min(1).max(80),
  channelAccount: z.string().min(1).max(255),
  authorizationConfirmed: z.literal(true),
});
const InstallPluginSchema = z.object({
  pluginVersionId: uuid,
  acceptedPermissions: z.array(z.string().min(1)),
  resourceScope: z.record(z.string(), z.unknown()).default({}),
  responsibleOwnerConfirmed: z.literal(true),
});
const InvokePluginSchema = z.object({
  actionCode: z.string().min(1).max(120),
  requiredPermission: z.string().min(1).max(120),
  requestedUrl: z.string().url().optional(),
  input: z.record(z.string(), z.unknown()).default({}),
});

export interface GeoChannelGateway {
  submit(input: {
    tenantId: string;
    idempotencyKey: string;
    targetCode: string;
    channelAccount: string;
    canonicalPayload: unknown;
    contentVersion: number;
    traceId: string;
  }): Promise<{
    status: 'SUCCEEDED' | 'PROCESSING' | 'REJECTED' | 'FAILED' | 'RATE_LIMITED';
    externalRecordId?: string;
    publicUrl?: string;
    responseReference?: string;
    retryAfter?: string;
    summary?: Record<string, unknown>;
  }>;
  inspect(input: {
    tenantId: string;
    targetCode: string;
    externalRecordId?: string;
    publicUrl?: string;
    traceId: string;
  }): Promise<{
    accessible: boolean;
    authorizationActive: boolean;
    responseReference?: string;
    strongFieldHashes: Partial<
      Record<'merchantName' | 'address' | 'phone' | 'businessHours', string>
    >;
  }>;
}
export interface PluginRuntimeGateway {
  invoke(input: {
    installationId: string;
    actionCode: string;
    requestedUrl?: string;
    input: Record<string, unknown>;
    traceId: string;
    timeoutMs: number;
  }): Promise<{
    status: 'SUCCEEDED' | 'RETRYABLE_FAILURE' | 'PERMANENT_FAILURE' | 'UNKNOWN';
    result?: Record<string, unknown>;
    errorCode?: string;
  }>;
  uninstall(input: {
    installationId: string;
    deletionScopes: string[];
    traceId: string;
  }): Promise<void>;
}
export interface GeoPluginReportService {
  listPlugins(command: { identity: StaffIdentity }): Promise<unknown>;
  getPlugin(command: { identity: StaffIdentity; pluginCode: string }): Promise<unknown>;
  publishGeo(command: {
    identity: StaffIdentity;
    profileId: string;
    idempotencyKey: string;
    traceId: string;
    body: unknown;
  }): Promise<unknown>;
  installPlugin(command: {
    identity: StaffIdentity;
    idempotencyKey: string;
    traceId: string;
    body: unknown;
  }): Promise<unknown>;
  invokePlugin(command: {
    identity: StaffIdentity;
    installationId: string;
    idempotencyKey: string;
    traceId: string;
    body: unknown;
  }): Promise<unknown>;
  upgradePlugin(command: {
    identity: StaffIdentity;
    installationId: string;
    traceId: string;
    body: unknown;
  }): Promise<unknown>;
  uninstallPlugin(command: {
    identity: StaffIdentity;
    installationId: string;
    traceId: string;
  }): Promise<unknown>;
  monthlyReport(command: {
    identity: StaffIdentity;
    month: string;
    storeId?: string;
  }): Promise<unknown>;
  materializeMonthlyReport(command: {
    tenantId: string;
    month: string;
    storeId?: string;
  }): Promise<{ reportId: string }>;
  checkGeoTarget(command: {
    tenantId: string;
    targetId: string;
    traceId: string;
  }): Promise<{ targetId: string; status: string; differences: string[] }>;
}

export class GeoPluginReportStateError extends Error {}

export function createGeoPluginReportService(options: {
  pool: Pick<pg.Pool, 'connect'>;
  geo: GeoChannelGateway;
  plugins: PluginRuntimeGateway;
}): GeoPluginReportService {
  async function tx<T>(tenantId: string, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await options.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      const value = await work(client);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return {
    async listPlugins(command) {
      return tx(command.identity.tenantId, async (client) => {
        const result = await client.query<{
          plugin_code: string;
          name: string;
          plugin_version_id: string;
          semantic_version: string;
          manifest: unknown;
        }>(
          `SELECT p.plugin_code,p.name,v.id AS plugin_version_id,v.semantic_version,v.manifest FROM plugins p
             JOIN LATERAL (SELECT id,semantic_version,manifest FROM plugin_versions
               WHERE plugin_id=p.id AND status='PUBLISHED' ORDER BY created_at DESC LIMIT 1) v ON true
            WHERE p.publisher_type='FIRST_PARTY' AND p.status='PUBLISHED' ORDER BY p.name,p.plugin_code`,
        );
        return {
          plugins: result.rows.map((row) => ({
            pluginCode: row.plugin_code,
            pluginVersionId: row.plugin_version_id,
            name: row.name,
            version: row.semantic_version,
            manifest: PluginManifestSchema.parse(row.manifest),
          })),
        };
      });
    },
    async getPlugin(command) {
      return tx(command.identity.tenantId, async (client) => {
        const result = await client.query<{
          plugin_version_id: string;
          plugin_code: string;
          name: string;
          semantic_version: string;
          manifest: unknown;
        }>(
          `SELECT version.id AS plugin_version_id,plugin.plugin_code,plugin.name,
                  version.semantic_version,version.manifest
             FROM plugins plugin JOIN plugin_versions version ON version.plugin_id=plugin.id
            WHERE plugin.plugin_code=$1 AND plugin.publisher_type='FIRST_PARTY'
              AND plugin.status='PUBLISHED' AND version.status='PUBLISHED'
            ORDER BY version.created_at DESC LIMIT 1`,
          [command.pluginCode],
        );
        const row = result.rows[0];
        if (!row) throw new GeoPluginReportStateError('PLUGIN_NOT_FOUND');
        return {
          pluginVersionId: row.plugin_version_id,
          pluginCode: row.plugin_code,
          name: row.name,
          version: row.semantic_version,
          manifest: PluginManifestSchema.parse(row.manifest),
        };
      });
    },
    async publishGeo(command) {
      const input = PublishGeoSchema.parse(command.body);
      const validated = validateGeoProfile(input.profile);
      const commandRequestHash = createHash('sha256')
        .update(JSON.stringify({ profileId: command.profileId, ...input }))
        .digest('hex');
      const prepared = await tx(command.identity.tenantId, async (client) => {
        await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [
          `${command.identity.tenantId}:geo.publish:${command.idempotencyKey}`,
        ]);
        const replay = await client.query<{ request_hash: string; response_body: unknown }>(
          `SELECT request_hash,response_body FROM idempotency_keys
            WHERE tenant_id=$1 AND scope='geo.publish' AND idempotency_key=$2`,
          [command.identity.tenantId, command.idempotencyKey],
        );
        if (replay.rows[0]) {
          if (replay.rows[0].request_hash !== commandRequestHash)
            throw new GeoPluginReportStateError('GEO_PUBLISH_IDEMPOTENCY_CONFLICT');
          if (replay.rows[0].response_body) return { replay: replay.rows[0].response_body };
          throw new GeoPluginReportStateError('GEO_PUBLISH_RESULT_PENDING_RECONCILIATION');
        }
        await client.query(
          `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,
             resource_type,resource_id,expires_at)
           VALUES($1,'geo.publish',$2,$3,'geo_profile',$4,now()+interval '7 days')`,
          [
            command.identity.tenantId,
            command.idempotencyKey,
            commandRequestHash,
            command.profileId,
          ],
        );
        const currentTarget = await client.query<{ status: string }>(
          `SELECT status FROM geo_publish_targets
            WHERE tenant_id=$1 AND geo_profile_id=$2 AND target_code=$3 FOR UPDATE`,
          [command.identity.tenantId, command.profileId, input.targetCode],
        );
        if (
          currentTarget.rows[0] &&
          !['FAILED', 'AUTH_REQUIRED', 'STALE'].includes(currentTarget.rows[0].status)
        )
          throw new GeoPluginReportStateError('GEO_TARGET_NOT_SAFE_TO_RESUBMIT');
        const row = await client.query<{ version: number }>(
          `UPDATE geo_profiles SET canonical_payload=$3,completeness_score=$4,status='PUBLISHING',
             confirmed_by=$5,confirmed_at=now(),version=version+1,updated_at=now()
           WHERE tenant_id=$1 AND id=$2 RETURNING version`,
          [
            command.identity.tenantId,
            command.profileId,
            validated.payload,
            validated.completenessScore,
            command.identity.userId,
          ],
        );
        if (!row.rows[0]) throw new GeoPluginReportStateError('GEO_PROFILE_NOT_FOUND');
        const target = await client.query<{ id: string }>(
          `INSERT INTO geo_publish_targets(tenant_id,geo_profile_id,target_code,status,authorization_status,response_summary,content_version)
           VALUES ($1,$2,$3,'PUBLISHING','ACTIVE',jsonb_build_object('channel_account_hash',encode(digest($4,'sha256'),'hex')),$5)
           ON CONFLICT (geo_profile_id,target_code) DO UPDATE SET status='PUBLISHING',authorization_status='ACTIVE',content_version=$5
           RETURNING id`,
          [
            command.identity.tenantId,
            command.profileId,
            input.targetCode,
            input.channelAccount,
            row.rows[0].version,
          ],
        );
        return { targetId: target.rows[0]!.id, contentVersion: row.rows[0].version };
      });
      if ('replay' in prepared) return prepared.replay;
      const response = await options.geo.submit({
        tenantId: command.identity.tenantId,
        idempotencyKey: command.idempotencyKey,
        targetCode: input.targetCode,
        channelAccount: input.channelAccount,
        canonicalPayload: validated.payload,
        contentVersion: prepared.contentVersion,
        traceId: command.traceId,
      });
      return tx(command.identity.tenantId, async (client) => {
        const requestHash = createHash('sha256')
          .update(JSON.stringify(validated.payload))
          .digest('hex');
        const status =
          response.status === 'SUCCEEDED'
            ? 'ACTIVE'
            : response.status === 'PROCESSING'
              ? 'PUBLISHING'
              : 'FAILED';
        await client.query(
          `UPDATE geo_publish_targets SET status=$3,external_record_id=$4,public_url=$5,last_error_code=$6,
          last_published_at=CASE WHEN $3='ACTIVE' THEN now() ELSE last_published_at END,retry_after=$7,response_summary=$8 WHERE tenant_id=$1 AND id=$2`,
          [
            command.identity.tenantId,
            prepared.targetId,
            status,
            response.externalRecordId ?? null,
            response.publicUrl ?? null,
            response.status === 'FAILED' || response.status === 'REJECTED' ? response.status : null,
            response.retryAfter ?? null,
            response.summary ?? {},
          ],
        );
        await client.query(
          `INSERT INTO geo_publication_evidence(tenant_id,geo_profile_id,target_id,action,request_hash,response_reference,response_summary,result,actor_id,trace_id)
          VALUES ($1,$2,$3,'SUBMIT',$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
          [
            command.identity.tenantId,
            command.profileId,
            prepared.targetId,
            requestHash,
            response.responseReference ?? null,
            response.summary ?? {},
            response.status,
            command.identity.userId,
            command.traceId,
          ],
        );
        const result = {
          profileId: command.profileId,
          targetId: prepared.targetId,
          status,
          responseReference: response.responseReference ?? null,
          publicUrl: response.publicUrl ?? null,
          retryAfter: response.retryAfter ?? null,
        };
        await client.query(
          `UPDATE idempotency_keys SET response_status=202,response_body=$3::jsonb
            WHERE tenant_id=$1 AND scope='geo.publish' AND idempotency_key=$2`,
          [command.identity.tenantId, command.idempotencyKey, JSON.stringify(result)],
        );
        return result;
      });
    },
    async installPlugin(command) {
      const input = InstallPluginSchema.parse(command.body);
      return tx(command.identity.tenantId, async (client) => {
        const version = await client.query<{
          plugin_id: string;
          manifest: unknown;
          status: string;
        }>(`SELECT plugin_id,manifest,status FROM plugin_versions WHERE id=$1`, [
          input.pluginVersionId,
        ]);
        const current = version.rows[0];
        if (!current || current.status !== 'PUBLISHED')
          throw new GeoPluginReportStateError('PLUGIN_VERSION_UNAVAILABLE');
        const checked = assertPluginInstall({
          manifest: current.manifest,
          acceptedPermissions: input.acceptedPermissions,
          responsibleOwnerConfirmed: input.responsibleOwnerConfirmed,
        });
        const installationId = randomUUID();
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO tenant_plugin_installations(id,tenant_id,plugin_id,plugin_version_id,status,granted_by,granted_at,config_public)
          VALUES($1,$2,$3,$4,'ACTIVE',$5,now(),jsonb_build_object('permission_fingerprint',$6,'resource_scope',$7,'idempotency_key',$8))
          ON CONFLICT(tenant_id,plugin_id) DO UPDATE SET plugin_version_id=EXCLUDED.plugin_version_id,status='ACTIVE',granted_by=EXCLUDED.granted_by,granted_at=now(),config_public=EXCLUDED.config_public
          RETURNING id`,
          [
            installationId,
            command.identity.tenantId,
            current.plugin_id,
            input.pluginVersionId,
            command.identity.userId,
            checked.permissionFingerprint,
            input.resourceScope,
            command.idempotencyKey,
          ],
        );
        await client.query(
          `DELETE FROM tenant_plugin_grants WHERE tenant_id=$1 AND installation_id=$2`,
          [command.identity.tenantId, inserted.rows[0]!.id],
        );
        for (const permission of checked.manifest.permissions)
          await client.query(
            `INSERT INTO tenant_plugin_grants(tenant_id,installation_id,permission_code,resource_scope,granted_by) VALUES($1,$2,$3,$4,$5)`,
            [
              command.identity.tenantId,
              inserted.rows[0]!.id,
              permission,
              input.resourceScope,
              command.identity.userId,
            ],
          );
        return {
          installationId: inserted.rows[0]!.id,
          status: 'ACTIVE',
          manifest: checked.manifest,
        };
      });
    },
    async invokePlugin(command) {
      const input = InvokePluginSchema.parse(command.body);
      const prepared = await tx(command.identity.tenantId, async (client) => {
        const row = await client.query<{
          plugin_version_id: string;
          manifest: unknown;
          circuit_status: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
          consecutive_failures: number;
          status: string;
        }>(
          `SELECT i.plugin_version_id,v.manifest,i.circuit_status,i.consecutive_failures,i.status FROM tenant_plugin_installations i JOIN plugin_versions v ON v.id=i.plugin_version_id WHERE i.tenant_id=$1 AND i.id=$2`,
          [command.identity.tenantId, command.installationId],
        );
        const current = row.rows[0];
        if (!current || current.status !== 'ACTIVE')
          throw new GeoPluginReportStateError('PLUGIN_INSTALLATION_INACTIVE');
        const grants = await client.query<{ permission_code: string }>(
          `SELECT permission_code FROM tenant_plugin_grants WHERE tenant_id=$1 AND installation_id=$2 AND revoked_at IS NULL`,
          [command.identity.tenantId, command.installationId],
        );
        const manifest = PluginManifestSchema.parse(current.manifest);
        let deniedCode: string | undefined;
        try {
          assertPluginCall({
            manifest,
            grantedPermissions: grants.rows.map((x) => x.permission_code),
            requiredPermission: input.requiredPermission,
            ...(input.requestedUrl ? { requestedUrl: input.requestedUrl } : {}),
            circuitStatus: current.circuit_status,
          });
        } catch (error) {
          if (!(error instanceof Error) || !('code' in error)) throw error;
          deniedCode = String(error.code);
          await client.query(
            `INSERT INTO plugin_runtime_invocations(tenant_id,installation_id,plugin_version_id,actor_id,idempotency_key,action_code,requested_domain,input_hash,status,error_code,trace_id,completed_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,'DENIED',$9,$10,now()) ON CONFLICT DO NOTHING`,
            [
              command.identity.tenantId,
              command.installationId,
              current.plugin_version_id,
              command.identity.userId,
              command.idempotencyKey,
              input.actionCode,
              input.requestedUrl ? new URL(input.requestedUrl).hostname : null,
              createHash('sha256').update(JSON.stringify(input.input)).digest('hex'),
              deniedCode,
              command.traceId,
            ],
          );
        }
        return { ...current, manifest, deniedCode };
      });
      if (prepared.deniedCode) throw new PluginPolicyError(prepared.deniedCode);
      let result: Awaited<ReturnType<PluginRuntimeGateway['invoke']>>;
      try {
        result = await options.plugins.invoke({
          installationId: command.installationId,
          actionCode: input.actionCode,
          ...(input.requestedUrl ? { requestedUrl: input.requestedUrl } : {}),
          input: input.input,
          traceId: command.traceId,
          timeoutMs: prepared.manifest.timeoutSeconds * 1000,
        });
      } catch {
        result = { status: 'RETRYABLE_FAILURE', errorCode: 'PLUGIN_RUNTIME_UNAVAILABLE' };
      }
      return tx(command.identity.tenantId, async (client) => {
        const circuit = nextCircuitState({
          currentFailures: prepared.consecutive_failures,
          outcome: result.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED',
        });
        await client.query(
          `UPDATE tenant_plugin_installations SET consecutive_failures=$3,circuit_status=$4,circuit_opened_at=CASE WHEN $4='OPEN' THEN now() ELSE NULL END,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, command.installationId, circuit.failures, circuit.status],
        );
        await client.query(
          `INSERT INTO plugin_runtime_invocations(tenant_id,installation_id,plugin_version_id,actor_id,idempotency_key,action_code,requested_domain,input_hash,status,error_code,trace_id,completed_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now()) ON CONFLICT DO NOTHING`,
          [
            command.identity.tenantId,
            command.installationId,
            prepared.plugin_version_id,
            command.identity.userId,
            command.idempotencyKey,
            input.actionCode,
            input.requestedUrl ? new URL(input.requestedUrl).hostname : null,
            createHash('sha256').update(JSON.stringify(input.input)).digest('hex'),
            result.status,
            result.errorCode ?? null,
            command.traceId,
          ],
        );
        return { ...result, circuitStatus: circuit.status };
      });
    },
    async upgradePlugin(command) {
      const body = z
        .object({
          pluginVersionId: uuid,
          responsibleOwnerConfirmed: z.boolean().default(false),
          acceptedPermissions: z.array(z.string()).default([]),
        })
        .parse(command.body);
      return tx(command.identity.tenantId, async (client) => {
        const rows = await client.query<{
          current_id: string;
          current_manifest: unknown;
          next_manifest: unknown;
          next_status: string;
        }>(
          `SELECT i.plugin_version_id current_id,old.manifest current_manifest,next.manifest next_manifest,next.status next_status FROM tenant_plugin_installations i JOIN plugin_versions old ON old.id=i.plugin_version_id JOIN plugin_versions next ON next.id=$3 WHERE i.tenant_id=$1 AND i.id=$2`,
          [command.identity.tenantId, command.installationId, body.pluginVersionId],
        );
        const row = rows.rows[0];
        if (!row || row.next_status !== 'PUBLISHED')
          throw new GeoPluginReportStateError('PLUGIN_VERSION_UNAVAILABLE');
        const current = PluginManifestSchema.parse(row.current_manifest),
          next = PluginManifestSchema.parse(row.next_manifest);
        const reauthorize = requiresPluginReauthorization(current, next);
        if (reauthorize)
          assertPluginInstall({
            manifest: next,
            acceptedPermissions: body.acceptedPermissions,
            responsibleOwnerConfirmed: body.responsibleOwnerConfirmed,
          });
        await client.query(
          `UPDATE tenant_plugin_installations SET plugin_version_id=$3,authorization_version=authorization_version+$4,token_generation=token_generation+1,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [
            command.identity.tenantId,
            command.installationId,
            body.pluginVersionId,
            reauthorize ? 1 : 0,
          ],
        );
        return {
          installationId: command.installationId,
          version: next.version,
          reauthorized: reauthorize,
        };
      });
    },
    async uninstallPlugin(command) {
      const prepared = await tx(command.identity.tenantId, async (client) => {
        const row = await client.query<{ manifest: unknown; token_generation: number }>(
          `SELECT v.manifest,i.token_generation FROM tenant_plugin_installations i JOIN plugin_versions v ON v.id=i.plugin_version_id WHERE i.tenant_id=$1 AND i.id=$2 AND i.status<>'UNINSTALLED' FOR UPDATE`,
          [command.identity.tenantId, command.installationId],
        );
        if (!row.rows[0]) throw new GeoPluginReportStateError('PLUGIN_INSTALLATION_INACTIVE');
        return {
          manifest: PluginManifestSchema.parse(row.rows[0].manifest),
          tokenGeneration: row.rows[0].token_generation,
        };
      });
      await options.plugins.uninstall({
        installationId: command.installationId,
        deletionScopes: prepared.manifest.dataDeletionScopes,
        traceId: command.traceId,
      });
      return tx(command.identity.tenantId, async (client) => {
        await client.query(
          `UPDATE tenant_plugin_grants SET revoked_at=now() WHERE tenant_id=$1 AND installation_id=$2 AND revoked_at IS NULL`,
          [command.identity.tenantId, command.installationId],
        );
        await client.query(
          `UPDATE tenant_plugin_installations SET status='UNINSTALLED',token_generation=token_generation+1,uninstalled_at=now(),updated_at=now() WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, command.installationId],
        );
        await client.query(
          `INSERT INTO plugin_data_deletion_receipts(tenant_id,installation_id,manifest_version,deleted_scopes,token_generation,completed_at,trace_id) VALUES($1,$2,$3,$4,$5,now(),$6) ON CONFLICT DO NOTHING`,
          [
            command.identity.tenantId,
            command.installationId,
            prepared.manifest.version,
            prepared.manifest.dataDeletionScopes,
            prepared.tokenGeneration + 1,
            command.traceId,
          ],
        );
        return {
          installationId: command.installationId,
          status: 'UNINSTALLED',
          tokensRevoked: true,
          dataDeleted: true,
        };
      });
    },
    async monthlyReport(command) {
      return tx(command.identity.tenantId, async (client) => {
        const rows = await client.query<{
          metric_code: string;
          display_name: string;
          unit: 'COUNT' | 'CENTS' | 'PERCENT';
          metric_value: string | number;
          source_event_ids: string[];
          source_event_types: string[];
          calculation_sql_version: string;
          description: string;
          generated_through: string | Date;
        }>(
          `SELECT m.metric_code,d.display_name,d.unit,m.metric_value,m.source_event_ids,d.source_event_types,d.calculation_sql_version,d.description,r.generated_through FROM monthly_value_reports r JOIN monthly_value_report_metrics m ON m.tenant_id=r.tenant_id AND m.report_id=r.id JOIN metric_definitions d ON d.metric_code=m.metric_code WHERE r.tenant_id=$1 AND r.report_month=$2::date AND r.store_id IS NOT DISTINCT FROM $3::uuid AND r.status='READY' ORDER BY m.metric_code`,
          [command.identity.tenantId, `${command.month}-01`, command.storeId ?? null],
        );
        if (rows.rows.length === 0) throw new GeoPluginReportStateError('MONTHLY_REPORT_NOT_READY');
        return buildTraceableMonthlyReport({
          month: command.month,
          generatedThrough: new Date(rows.rows[0]!.generated_through).toISOString(),
          metrics: rows.rows.map((x) => ({
            metricCode: x.metric_code,
            displayName: x.display_name,
            unit: x.unit,
            value: Number(x.metric_value),
            sourceEventIds: x.source_event_ids,
            sourceEventTypes: x.source_event_types,
            calculationVersion: x.calculation_sql_version,
            definition: x.description,
          })),
        });
      });
    },
    async materializeMonthlyReport(command) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(command.month))
        throw new GeoPluginReportStateError('INVALID_REPORT_MONTH');
      return tx(command.tenantId, async (client) => {
        const result = await client.query<{ report_id: string }>(
          `SELECT app.materialize_monthly_value_report($1,$2::date,$3::uuid) AS report_id`,
          [command.tenantId, `${command.month}-01`, command.storeId ?? null],
        );
        return { reportId: result.rows[0]!.report_id };
      });
    },
    async checkGeoTarget(command) {
      const prepared = await tx(command.tenantId, async (client) => {
        const result = await client.query<{
          geo_profile_id: string;
          target_code: string;
          external_record_id: string | null;
          public_url: string | null;
          canonical_payload: Record<string, unknown>;
        }>(
          `SELECT t.geo_profile_id,t.target_code,t.external_record_id,t.public_url,p.canonical_payload
             FROM geo_publish_targets t JOIN geo_profiles p ON p.tenant_id=t.tenant_id AND p.id=t.geo_profile_id
            WHERE t.tenant_id=$1 AND t.id=$2 AND t.status IN ('ACTIVE','STALE','AUTH_REQUIRED')`,
          [command.tenantId, command.targetId],
        );
        if (!result.rows[0]) throw new GeoPluginReportStateError('GEO_TARGET_NOT_CHECKABLE');
        return result.rows[0];
      });
      const inspected = await options.geo.inspect({
        tenantId: command.tenantId,
        targetCode: prepared.target_code,
        ...(prepared.external_record_id ? { externalRecordId: prepared.external_record_id } : {}),
        ...(prepared.public_url ? { publicUrl: prepared.public_url } : {}),
        traceId: command.traceId,
      });
      const canonicalHashes: Record<string, string> = Object.fromEntries(
        ['merchantName', 'address', 'phone', 'businessHours'].map((field) => [
          field,
          createHash('sha256')
            .update(String(prepared.canonical_payload[field] ?? ''))
            .digest('hex'),
        ]),
      );
      const differences = Object.entries(inspected.strongFieldHashes)
        .filter(([field, hash]) => canonicalHashes[field] !== hash)
        .map(([field]) => field);
      return tx(command.tenantId, async (client) => {
        const status = !inspected.authorizationActive
          ? 'AUTH_REQUIRED'
          : !inspected.accessible || differences.length > 0
            ? 'STALE'
            : 'ACTIVE';
        await client.query(
          `UPDATE geo_publish_targets SET status=$3,authorization_status=$4,last_checked_at=now(),next_check_at=now()+interval '7 days' WHERE tenant_id=$1 AND id=$2`,
          [
            command.tenantId,
            command.targetId,
            status,
            inspected.authorizationActive ? 'ACTIVE' : 'EXPIRED',
          ],
        );
        for (const field of differences)
          await client.query(
            `INSERT INTO geo_difference_tasks(tenant_id,geo_profile_id,target_id,field_name,canonical_value_hash,observed_value_hash,due_at)
           VALUES($1,$2,$3,$4,$5,$6,now()+interval '7 days') ON CONFLICT DO NOTHING`,
            [
              command.tenantId,
              prepared.geo_profile_id,
              command.targetId,
              field,
              canonicalHashes[field],
              inspected.strongFieldHashes[field as keyof typeof inspected.strongFieldHashes],
            ],
          );
        const requestHash = createHash('sha256').update(JSON.stringify(inspected)).digest('hex');
        await client.query(
          `INSERT INTO geo_publication_evidence(tenant_id,geo_profile_id,target_id,action,request_hash,response_reference,response_summary,result,trace_id)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
          [
            command.tenantId,
            prepared.geo_profile_id,
            command.targetId,
            differences.length ? 'DIFFERENCE_FOUND' : 'ACCESS_CHECK',
            requestHash,
            inspected.responseReference ?? null,
            { accessible: inspected.accessible, differences },
            inspected.accessible ? 'SUCCEEDED' : 'FAILED',
            command.traceId,
          ],
        );
        return { targetId: command.targetId, status, differences };
      });
    },
  };
}

export function createHttpGeoPluginGateways(input: { baseUrl: string; serviceToken: string }): {
  geo: GeoChannelGateway;
  plugins: PluginRuntimeGateway;
} {
  const call = async <T>(path: string, body: unknown, timeoutMs = 15000): Promise<T> => {
    const response = await fetch(new URL(path, input.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.serviceToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new GeoPluginReportStateError(`GATEWAY_${response.status}`);
    return (await response.json()) as T;
  };
  return {
    geo: {
      submit: (body) =>
        call<Awaited<ReturnType<GeoChannelGateway['submit']>>>('/v1/geo/submit', body),
      inspect: (body) =>
        call<Awaited<ReturnType<GeoChannelGateway['inspect']>>>('/v1/geo/inspect', body),
    },
    plugins: {
      invoke: (body) =>
        call<Awaited<ReturnType<PluginRuntimeGateway['invoke']>>>(
          '/v1/plugins/invoke',
          body,
          body.timeoutMs,
        ),
      uninstall: async (body) => {
        await call<unknown>('/v1/plugins/uninstall', body);
      },
    },
  };
}
