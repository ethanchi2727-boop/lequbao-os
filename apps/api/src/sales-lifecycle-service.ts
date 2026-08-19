import { createHash, createHmac } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { AuthorizationContext } from './access-control.js';
import type { SessionIdentity } from './session-identity.js';

const ListSchema = z.object({
  status: z.string().trim().min(1).max(40).optional(),
  query: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const CreateOpportunitySchema = z
  .object({
    legalSubjectName: z.string().trim().min(2).max(200),
    unifiedCreditCode: z.string().trim().min(8).max(40).optional(),
    contactMobile: z.string().trim().min(6).max(30).optional(),
    storeAddress: z.string().trim().min(4).max(500).optional(),
    evidenceAssetId: UuidSchema,
    firstContactAt: z.iso.datetime({ offset: true }),
    nextAction: z.string().trim().min(2).max(500),
    protectionDays: z.number().int().min(1).max(365).default(90),
  })
  .refine(
    (value) => value.unifiedCreditCode || value.contactMobile || value.storeAddress,
    'one stable merchant identifier is required',
  );
const DuplicateSchema = z.object({
  opportunityId: UuidSchema,
  decision: z.enum(['CLEAR', 'CONFIRMED_DUPLICATE']).optional(),
  decisionReasonCode: z.string().trim().min(1).max(80).optional(),
});
const QuoteSchema = z.object({
  opportunityId: UuidSchema,
  planCode: z.string().trim().min(1).max(80),
  quotedPriceCents: z.number().int().nonnegative().optional(),
  discountReason: z.string().trim().min(2).max(200).optional(),
  addonSnapshot: z.array(z.record(z.string(), z.unknown())).default([]),
  validUntil: z.iso.datetime({ offset: true }),
});
const ContractSchema = z.object({
  opportunityId: UuidSchema,
  quoteId: UuidSchema,
  contractNo: z.string().trim().min(1).max(100),
  contractAssetId: UuidSchema,
  privacyPolicyVersion: z.string().trim().min(1).max(80),
});
const SignContractSchema = z.object({
  contractId: UuidSchema,
  merchantSignerReference: z.string().trim().min(4).max(300),
  signedAt: z.iso.datetime({ offset: true }),
});
const CollectionSchema = z.object({
  contractId: UuidSchema,
  provider: z.string().trim().min(1).max(80),
  externalEventId: z.string().trim().min(1).max(255),
  providerReference: z.string().trim().min(4).max(300),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).default('CNY'),
  occurredAt: z.iso.datetime({ offset: true }),
});

type Identity = SessionIdentity & Partial<AuthorizationContext>;
type Command = {
  identity: Identity;
  idempotencyKey: string;
  traceId: string;
  body: unknown;
};

export class SalesLifecycleAuthorizationError extends Error {}
export class SalesLifecycleConflictError extends Error {}
export class SalesLifecycleStateError extends Error {}

export interface SalesLifecycleService {
  list(identity: Identity, query: unknown): Promise<unknown[]>;
  get(identity: Identity, opportunityId: string): Promise<unknown>;
  create(command: Command): Promise<unknown>;
  checkDuplicates(command: Command): Promise<unknown>;
  createQuote(command: Command): Promise<unknown>;
  createContract(command: Command): Promise<unknown>;
  signContract(command: Command): Promise<unknown>;
  recordCollection(command: Command): Promise<unknown>;
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);

function opportunityView(row: Record<string, unknown>) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    legalSubjectName: row.legal_subject_name,
    status: row.status,
    firstContactAt: iso(row.first_contact_at as Date | string | null),
    nextAction: row.next_action,
    protectionUntil: iso(row.protection_until as Date | string | null),
    convertedMerchantProfileId: row.converted_merchant_profile_id ?? null,
    lossReasonCode: row.loss_reason_code ?? null,
    hasEvidence: row.has_evidence ?? Boolean(row.evidence_asset_id),
    version: Number(row.version),
    createdAt: iso(row.created_at as Date | string | null),
    updatedAt: iso(row.updated_at as Date | string | null),
  };
}

export function createSalesLifecycleService(
  pool: Pick<pg.Pool, 'connect'>,
  options: { identityHashSecret: string },
): SalesLifecycleService {
  if (Buffer.byteLength(options.identityHashSecret, 'utf8') < 32)
    throw new Error('SALES_IDENTITY_HASH_SECRET must contain at least 32 bytes');

  const identityHash = (kind: string, value: string | undefined) =>
    value
      ? createHmac('sha256', options.identityHashSecret)
          .update(`${kind}:${value.trim().toUpperCase().replace(/\s+/gu, '')}`)
          .digest('hex')
      : null;
  const canViewAll = (identity: Identity) =>
    identity.accessScopes?.some((scope) =>
      ['TENANT', 'ALL', 'REGION', 'DUAL', 'JIT_READ'].includes(scope),
    ) ?? false;

  async function transaction<T>(identity: Identity, work: (client: pg.PoolClient) => Promise<T>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [identity.tenantId]);
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

  async function idempotent<T>(
    command: Command,
    scope: string,
    normalizedBody: unknown,
    work: (client: pg.PoolClient) => Promise<T>,
  ) {
    return transaction(command.identity, async (client) => {
      const requestHash = createHash('sha256').update(JSON.stringify(normalizedBody)).digest('hex');
      const receipt = await client.query<{ request_hash: string; response_body: T | null }>(
        `SELECT request_hash,response_body FROM idempotency_keys
          WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`,
        [command.identity.tenantId, scope, command.idempotencyKey],
      );
      if (receipt.rows[0]) {
        if (receipt.rows[0].request_hash !== requestHash || receipt.rows[0].response_body === null)
          throw new SalesLifecycleConflictError();
        return receipt.rows[0].response_body;
      }
      await client.query(
        `INSERT INTO idempotency_keys(tenant_id,scope,idempotency_key,request_hash,expires_at)
         VALUES($1,$2,$3,$4,now()+interval '30 days')`,
        [command.identity.tenantId, scope, command.idempotencyKey, requestHash],
      );
      const result = await work(client);
      await client.query(
        `UPDATE idempotency_keys SET response_status=200,response_body=$4::jsonb
          WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3`,
        [command.identity.tenantId, scope, command.idempotencyKey, JSON.stringify(result)],
      );
      return result;
    });
  }

  async function opportunity(
    client: pg.PoolClient,
    identity: Identity,
    opportunityId: string,
    lock = false,
  ) {
    const result = await client.query(
      `SELECT id,owner_user_id,legal_subject_name,unified_credit_code_hash,
              contact_mobile_hash,store_address_hash,evidence_asset_id,first_contact_at,
              next_action,status,protection_until,converted_merchant_profile_id,
              loss_reason_code,version,created_at,updated_at
         FROM sales_opportunities WHERE tenant_id=$1 AND id=$2
          AND ($3::boolean OR owner_user_id=$4) ${lock ? 'FOR UPDATE' : ''}`,
      [identity.tenantId, opportunityId, canViewAll(identity), identity.userId],
    );
    if (!result.rows[0]) throw new SalesLifecycleAuthorizationError();
    return result.rows[0];
  }

  async function audit(
    client: pg.PoolClient,
    command: Command,
    action: string,
    resourceType: string,
    resourceId: string,
    after: unknown,
  ) {
    await client.query(
      `INSERT INTO audit_logs(tenant_id,actor_type,actor_id,action,resource_type,resource_id,
        permission_code,result_code,after_redacted,trace_id)
       VALUES($1,'USER',$2,$3,$4,$5,'merchant.intake.write','SUCCESS',$6::jsonb,$7)`,
      [
        command.identity.tenantId,
        command.identity.userId,
        action,
        resourceType,
        resourceId,
        JSON.stringify(after),
        command.traceId,
      ],
    );
  }

  return {
    list(identity, rawQuery) {
      const query = ListSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT id,owner_user_id,legal_subject_name,status,first_contact_at,next_action,
                  protection_until,converted_merchant_profile_id,version,created_at,updated_at,
                  (evidence_asset_id IS NOT NULL) AS has_evidence
             FROM sales_opportunities WHERE tenant_id=$1
              AND ($2::boolean OR owner_user_id=$3)
              AND ($4::text IS NULL OR status=$4)
              AND ($5::text IS NULL OR legal_subject_name ILIKE '%'||$5||'%')
            ORDER BY updated_at DESC,id LIMIT $6`,
          [
            identity.tenantId,
            canViewAll(identity),
            identity.userId,
            query.status ?? null,
            query.query ?? null,
            query.limit,
          ],
        );
        return result.rows.map((row) => opportunityView(row));
      });
    },

    get(identity, rawOpportunityId) {
      const opportunityId = UuidSchema.parse(rawOpportunityId);
      return transaction(identity, async (client) => {
        const row = await opportunity(client, identity, opportunityId);
        const [checks, quotes, contracts] = await Promise.all([
          client.query(
            `SELECT id,matched_opportunity_ids,matched_merchant_profile_ids,result,
                    decision_reason_code,checked_at
               FROM sales_duplicate_checks WHERE tenant_id=$1 AND opportunity_id=$2
              ORDER BY checked_at DESC,id`,
            [identity.tenantId, opportunityId],
          ),
          client.query(
            `SELECT id,plan_code,list_price_cents,quoted_price_cents,addon_snapshot,status,
                    valid_until,version,created_at,updated_at
               FROM sales_quotes WHERE tenant_id=$1 AND opportunity_id=$2
              ORDER BY created_at DESC,id`,
            [identity.tenantId, opportunityId],
          ),
          client.query(
            `SELECT contract.id,contract.quote_id,contract.contract_no,contract.amount_cents,
                    contract.currency,contract.status,contract.privacy_policy_version,
                    contract.signed_at,contract.version,contract.created_at,contract.updated_at,
                    (contract.contract_asset_id IS NOT NULL) AS has_contract,
                    COALESCE(sum(receipt.amount_cents) FILTER(WHERE receipt.status='CONFIRMED'),0)
                    +COALESCE(sum(receipt.amount_cents) FILTER(WHERE receipt.status='REVERSED'),0)
                    AS collected_cents
               FROM sales_contracts contract
               LEFT JOIN sales_collection_receipts receipt
                 ON receipt.tenant_id=contract.tenant_id AND receipt.contract_id=contract.id
              WHERE contract.tenant_id=$1 AND contract.opportunity_id=$2
              GROUP BY contract.id ORDER BY contract.created_at DESC,contract.id`,
            [identity.tenantId, opportunityId],
          ),
        ]);
        return {
          ...opportunityView(row),
          checks: checks.rows.map((check) => ({
            id: check.id,
            matchedOpportunityIds: check.matched_opportunity_ids,
            matchedMerchantProfileIds: check.matched_merchant_profile_ids,
            result: check.result,
            decisionReasonCode: check.decision_reason_code ?? null,
            checkedAt: iso(check.checked_at),
          })),
          quotes: quotes.rows.map((quote) => ({
            id: quote.id,
            planCode: quote.plan_code,
            listPriceCents: Number(quote.list_price_cents),
            quotedPriceCents: Number(quote.quoted_price_cents),
            addonSnapshot: quote.addon_snapshot,
            status: quote.status,
            validUntil: iso(quote.valid_until),
            version: Number(quote.version),
            createdAt: iso(quote.created_at),
            updatedAt: iso(quote.updated_at),
          })),
          contracts: contracts.rows.map((contract) => ({
            id: contract.id,
            quoteId: contract.quote_id,
            contractNo: contract.contract_no,
            amountCents: Number(contract.amount_cents),
            currency: contract.currency,
            status: contract.status,
            privacyPolicyVersion: contract.privacy_policy_version,
            signedAt: iso(contract.signed_at),
            hasContract: contract.has_contract,
            collectedCents: Number(contract.collected_cents),
            version: Number(contract.version),
            createdAt: iso(contract.created_at),
            updatedAt: iso(contract.updated_at),
          })),
        };
      });
    },

    create(command) {
      const body = CreateOpportunitySchema.parse(command.body);
      const normalized = {
        ...body,
        unifiedCreditCodeHash: identityHash('credit', body.unifiedCreditCode),
        contactMobileHash: identityHash('mobile', body.contactMobile),
        storeAddressHash: identityHash('address', body.storeAddress),
      };
      return idempotent(command, 'sales.opportunity.create', normalized, async (client) => {
        const asset = await client.query(
          `SELECT 1 FROM merchant_intake_assets
            WHERE tenant_id=$1 AND id=$2 AND security_status='SAFE'
              AND processing_status='SUCCEEDED'`,
          [command.identity.tenantId, body.evidenceAssetId],
        );
        if (!asset.rows[0]) throw new SalesLifecycleStateError();
        const inserted = await client.query(
          `INSERT INTO sales_opportunities(tenant_id,owner_user_id,legal_subject_name,
            unified_credit_code_hash,contact_mobile_hash,store_address_hash,evidence_asset_id,
            first_contact_at,next_action,status,protection_until)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'NEW',now()+make_interval(days=>$10))
           RETURNING id,owner_user_id,legal_subject_name,status,protection_until,version,created_at`,
          [
            command.identity.tenantId,
            command.identity.userId,
            body.legalSubjectName,
            normalized.unifiedCreditCodeHash,
            normalized.contactMobileHash,
            normalized.storeAddressHash,
            body.evidenceAssetId,
            body.firstContactAt,
            body.nextAction,
            body.protectionDays,
          ],
        );
        const result = inserted.rows[0];
        await audit(client, command, 'SALES_OPPORTUNITY_CREATED', 'sales_opportunity', result.id, {
          legalSubjectName: body.legalSubjectName,
          hasEvidence: true,
        });
        return result;
      });
    },

    checkDuplicates(command) {
      const body = DuplicateSchema.parse(command.body);
      return idempotent(command, 'sales.opportunity.duplicate-check', body, async (client) => {
        const current = await opportunity(client, command.identity, body.opportunityId, true);
        const matches = await client.query<{ id: string }>(
          `SELECT id FROM sales_opportunities WHERE tenant_id=$1 AND id<>$2
            AND (($3::text IS NOT NULL AND unified_credit_code_hash=$3)
              OR ($4::text IS NOT NULL AND contact_mobile_hash=$4)
              OR ($5::text IS NOT NULL AND store_address_hash=$5))
            ORDER BY created_at,id`,
          [
            command.identity.tenantId,
            body.opportunityId,
            current.unified_credit_code_hash,
            current.contact_mobile_hash,
            current.store_address_hash,
          ],
        );
        const merchants = await client.query<{ id: string }>(
          `SELECT id FROM merchant_profiles WHERE tenant_id=$1
            AND lower(legal_subject_name)=lower($2) ORDER BY id`,
          [command.identity.tenantId, current.legal_subject_name],
        );
        const automaticResult =
          matches.rows.length || merchants.rows.length ? 'POTENTIAL_DUPLICATE' : 'CLEAR';
        const result = body.decision ?? automaticResult;
        if (body.decision === 'CONFIRMED_DUPLICATE' && !body.decisionReasonCode)
          throw new SalesLifecycleStateError();
        if (
          body.decision === 'CLEAR' &&
          automaticResult === 'POTENTIAL_DUPLICATE' &&
          !body.decisionReasonCode
        )
          throw new SalesLifecycleStateError();
        const requestHash = createHash('sha256')
          .update(
            JSON.stringify({
              current: current.id,
              matches: matches.rows,
              merchants: merchants.rows,
              body,
            }),
          )
          .digest('hex');
        const inserted = await client.query(
          `INSERT INTO sales_duplicate_checks(tenant_id,opportunity_id,checked_by,request_hash,
            matched_opportunity_ids,matched_merchant_profile_ids,result,decision_reason_code)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id,result,matched_opportunity_ids,matched_merchant_profile_ids,
                     decision_reason_code,checked_at`,
          [
            command.identity.tenantId,
            body.opportunityId,
            command.identity.userId,
            requestHash,
            matches.rows.map((row) => row.id),
            merchants.rows.map((row) => row.id),
            result,
            body.decisionReasonCode ?? null,
          ],
        );
        await client.query(
          `UPDATE sales_opportunities SET status=$3,version=version+1
            WHERE tenant_id=$1 AND id=$2`,
          [
            command.identity.tenantId,
            body.opportunityId,
            result === 'CLEAR'
              ? 'QUALIFIED'
              : result === 'CONFIRMED_DUPLICATE'
                ? 'LOST'
                : 'DUPLICATE_REVIEW',
          ],
        );
        const response = inserted.rows[0];
        await audit(
          client,
          command,
          'SALES_DUPLICATE_CHECKED',
          'sales_opportunity',
          body.opportunityId,
          {
            result,
            matchCount: matches.rows.length + merchants.rows.length,
          },
        );
        return response;
      });
    },

    createQuote(command) {
      const body = QuoteSchema.parse(command.body);
      if (new Date(body.validUntil).getTime() <= Date.now()) throw new SalesLifecycleStateError();
      return idempotent(command, 'sales.quote.create', body, async (client) => {
        const current = await opportunity(client, command.identity, body.opportunityId, true);
        if (current.status !== 'QUALIFIED') throw new SalesLifecycleStateError();
        const plan = await client.query<{ list_price_cents: string }>(
          `SELECT list_price_cents FROM plans WHERE plan_code=$1 AND active`,
          [body.planCode],
        );
        const listPrice = Number(plan.rows[0]?.list_price_cents);
        if (!Number.isFinite(listPrice)) throw new SalesLifecycleStateError();
        const quotedPrice = body.quotedPriceCents ?? listPrice;
        if (quotedPrice < listPrice && !body.discountReason) throw new SalesLifecycleStateError();
        if (quotedPrice > listPrice && body.addonSnapshot.length === 0)
          throw new SalesLifecycleStateError();
        const inserted = await client.query(
          `INSERT INTO sales_quotes(tenant_id,opportunity_id,plan_code,list_price_cents,
            quoted_price_cents,addon_snapshot,status,valid_until,issued_by)
           VALUES($1,$2,$3,$4,$5,$6::jsonb,'ISSUED',$7,$8)
           RETURNING id,plan_code,list_price_cents,quoted_price_cents,addon_snapshot,status,
                     valid_until,version,created_at`,
          [
            command.identity.tenantId,
            body.opportunityId,
            body.planCode,
            listPrice,
            quotedPrice,
            JSON.stringify(body.addonSnapshot),
            body.validUntil,
            command.identity.userId,
          ],
        );
        await client.query(
          `UPDATE sales_opportunities SET status='QUOTED',version=version+1
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, body.opportunityId],
        );
        const result = inserted.rows[0];
        await audit(client, command, 'SALES_QUOTE_ISSUED', 'sales_quote', result.id, {
          opportunityId: body.opportunityId,
          planCode: body.planCode,
          listPriceCents: listPrice,
          quotedPriceCents: quotedPrice,
          discountReason: body.discountReason ?? null,
        });
        return result;
      });
    },

    createContract(command) {
      const body = ContractSchema.parse(command.body);
      return idempotent(command, 'sales.contract.create', body, async (client) => {
        const current = await opportunity(client, command.identity, body.opportunityId, true);
        if (!['QUOTED', 'CONTRACTED'].includes(current.status))
          throw new SalesLifecycleStateError();
        const quote = await client.query<{ quoted_price_cents: string }>(
          `SELECT quoted_price_cents FROM sales_quotes
            WHERE tenant_id=$1 AND id=$2 AND opportunity_id=$3 AND status='ISSUED'
              AND valid_until>now() FOR UPDATE`,
          [command.identity.tenantId, body.quoteId, body.opportunityId],
        );
        const asset = await client.query(
          `SELECT 1 FROM merchant_intake_assets WHERE tenant_id=$1 AND id=$2
            AND asset_type='DOCUMENT' AND security_status='SAFE' AND processing_status='SUCCEEDED'`,
          [command.identity.tenantId, body.contractAssetId],
        );
        if (!quote.rows[0] || !asset.rows[0]) throw new SalesLifecycleStateError();
        const inserted = await client.query(
          `INSERT INTO sales_contracts(tenant_id,opportunity_id,quote_id,contract_no,
            contract_asset_id,amount_cents,status,privacy_policy_version)
           VALUES($1,$2,$3,$4,$5,$6,'SENT',$7)
           RETURNING id,contract_no,amount_cents,currency,status,privacy_policy_version,
                     version,created_at`,
          [
            command.identity.tenantId,
            body.opportunityId,
            body.quoteId,
            body.contractNo,
            body.contractAssetId,
            quote.rows[0].quoted_price_cents,
            body.privacyPolicyVersion,
          ],
        );
        const result = inserted.rows[0];
        await audit(client, command, 'SALES_CONTRACT_SENT', 'sales_contract', result.id, {
          opportunityId: body.opportunityId,
          contractNo: body.contractNo,
          amountCents: Number(result.amount_cents),
          hasContract: true,
        });
        return result;
      });
    },

    signContract(command) {
      const body = SignContractSchema.parse(command.body);
      return idempotent(command, 'sales.contract.sign', body, async (client) => {
        const updated = await client.query(
          `UPDATE sales_contracts contract SET status='SIGNED',merchant_signer_ref_hash=$3,
                  platform_signer_user_id=$4,signed_at=$5,version=version+1
            FROM sales_opportunities opportunity
            WHERE contract.tenant_id=$1 AND contract.id=$2 AND contract.status='SENT'
              AND opportunity.tenant_id=contract.tenant_id AND opportunity.id=contract.opportunity_id
              AND ($6::boolean OR opportunity.owner_user_id=$4)
            RETURNING contract.id,contract.opportunity_id,contract.contract_no,
                      contract.amount_cents,contract.status,contract.signed_at,contract.version`,
          [
            command.identity.tenantId,
            body.contractId,
            identityHash('contract-signer', body.merchantSignerReference),
            command.identity.userId,
            body.signedAt,
            canViewAll(command.identity),
          ],
        );
        const result = updated.rows[0];
        if (!result) throw new SalesLifecycleStateError();
        await client.query(
          `UPDATE sales_opportunities SET status='CONTRACTED',version=version+1
            WHERE tenant_id=$1 AND id=$2`,
          [command.identity.tenantId, result.opportunity_id],
        );
        await audit(client, command, 'SALES_CONTRACT_SIGNED', 'sales_contract', result.id, {
          contractNo: result.contract_no,
          signedAt: body.signedAt,
        });
        return result;
      });
    },

    recordCollection(command) {
      const body = CollectionSchema.parse(command.body);
      return idempotent(command, 'sales.collection.record', body, async (client) => {
        const contract = await client.query(
          `SELECT contract.id,contract.amount_cents FROM sales_contracts contract
           JOIN sales_opportunities opportunity ON opportunity.tenant_id=contract.tenant_id
             AND opportunity.id=contract.opportunity_id
          WHERE contract.tenant_id=$1 AND contract.id=$2 AND contract.status='SIGNED'
            AND ($3::boolean OR opportunity.owner_user_id=$4)`,
          [
            command.identity.tenantId,
            body.contractId,
            canViewAll(command.identity),
            command.identity.userId,
          ],
        );
        if (!contract.rows[0]) throw new SalesLifecycleStateError();
        const inserted = await client.query(
          `INSERT INTO sales_collection_receipts(tenant_id,contract_id,provider,
            external_event_id,provider_reference_hash,amount_cents,currency,status,
            occurred_at,recorded_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,'CONFIRMED',$8,$9)
           RETURNING id,contract_id,provider,amount_cents,currency,status,occurred_at,created_at`,
          [
            command.identity.tenantId,
            body.contractId,
            body.provider,
            body.externalEventId,
            identityHash('collection-reference', body.providerReference),
            body.amountCents,
            body.currency,
            body.occurredAt,
            command.identity.userId,
          ],
        );
        const result = inserted.rows[0];
        await audit(
          client,
          command,
          'SALES_COLLECTION_CONFIRMED',
          'sales_contract',
          body.contractId,
          {
            receiptId: result.id,
            amountCents: body.amountCents,
            currency: body.currency,
            provider: body.provider,
          },
        );
        return result;
      });
    },
  };
}
