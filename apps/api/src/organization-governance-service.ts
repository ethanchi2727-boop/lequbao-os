import { createHash } from 'node:crypto';
import type pg from 'pg';
import { UuidSchema } from '@lequ/contracts';
import { z } from 'zod';
import type { AuthorizationContext } from './access-control.js';
import type { SessionIdentity } from './session-identity.js';

const ListSchema = z.object({
  status: z.string().trim().min(1).max(40).optional(),
  query: z.string().trim().min(1).max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
const AuditQuerySchema = ListSchema.extend({
  action: z.string().trim().min(1).max(120).optional(),
  resourceType: z.string().trim().min(1).max(120).optional(),
});
const AssignRoleSchema = z.object({
  userId: UuidSchema,
  roleCode: z.string().trim().min(1).max(80),
  storeId: UuidSchema.optional(),
  validUntil: z.iso.datetime().optional(),
});
const ChangeMemberSchema = z.object({
  userId: UuidSchema,
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});
const TenantAssignableRoles = new Set([
  'MERCHANT_OWNER',
  'STORE_MANAGER',
  'CUSTOMER_SERVICE',
  'FINANCE',
  'MARKETER',
  'VERIFIER',
  'AUDITOR',
]);
const StoreBoundRoles = new Set(['STORE_MANAGER', 'CUSTOMER_SERVICE', 'MARKETER', 'VERIFIER']);

export class OrganizationGovernanceAuthorizationError extends Error {}
export class OrganizationGovernanceConflictError extends Error {}
export class OrganizationGovernanceStateError extends Error {}

type Identity = SessionIdentity & Partial<AuthorizationContext>;
type Command<T> = {
  identity: Identity;
  idempotencyKey: string;
  traceId: string;
  body: T;
};

export interface OrganizationGovernanceService {
  listMembers(identity: Identity, query: unknown): Promise<unknown[]>;
  getAuthorizationCatalog(identity: Identity): Promise<unknown>;
  assignRole(command: Command<unknown>): Promise<unknown>;
  revokeRole(command: Command<{ assignmentId: string }>): Promise<unknown>;
  changeMemberStatus(command: Command<unknown>): Promise<unknown>;
  listAudit(identity: Identity, query: unknown): Promise<unknown[]>;
  listPrivacyRequests(identity: Identity, query: unknown): Promise<unknown[]>;
  listNotifications(identity: Identity, query: unknown): Promise<unknown[]>;
}

const iso = (value: Date | string | null) => (value ? new Date(value).toISOString() : null);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function tenantWide(identity: Identity) {
  if (!identity.accessScopes?.some((scope) => ['TENANT', 'ALL', 'DUAL'].includes(scope)))
    throw new OrganizationGovernanceAuthorizationError();
}

export function createOrganizationGovernanceService(
  pool: Pick<pg.Pool, 'connect'>,
): OrganizationGovernanceService {
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
    command: Command<unknown>,
    scope: string,
    work: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    return transaction(command.identity, async (client) => {
      const requestHash = hash(command.body);
      const receipt = await client.query<{ request_hash: string; response_body: T | null }>(
        `SELECT request_hash,response_body FROM idempotency_keys
          WHERE tenant_id=$1 AND scope=$2 AND idempotency_key=$3 FOR UPDATE`,
        [command.identity.tenantId, scope, command.idempotencyKey],
      );
      if (receipt.rows[0]) {
        if (receipt.rows[0].request_hash !== requestHash)
          throw new OrganizationGovernanceConflictError();
        if (receipt.rows[0].response_body === null) throw new OrganizationGovernanceConflictError();
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

  async function audit(
    client: pg.PoolClient,
    command: Command<unknown>,
    action: string,
    resourceType: string,
    resourceId: string,
    permissionCode: string,
    after: unknown,
  ) {
    await client.query(
      `INSERT INTO audit_logs(tenant_id,actor_type,actor_id,action,resource_type,resource_id,
        permission_code,result_code,after_redacted,trace_id)
       VALUES($1,'USER',$2,$3,$4,$5,$6,'SUCCESS',$7::jsonb,$8)`,
      [
        command.identity.tenantId,
        command.identity.userId,
        action,
        resourceType,
        resourceId,
        permissionCode,
        JSON.stringify(after),
        command.traceId,
      ],
    );
  }

  return {
    listMembers(identity, rawQuery) {
      tenantWide(identity);
      const query = ListSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT membership.user_id,user_account.display_name,user_account.status AS user_status,
                  membership.employee_no,membership.membership_status,membership.joined_at,
                  membership.created_at,membership.updated_at,
                  COALESCE(jsonb_agg(jsonb_build_object('assignmentId',assignment.id,
                    'roleCode',assignment.role_code,'storeId',assignment.store_id,
                    'validUntil',assignment.valid_until) ORDER BY assignment.created_at)
                    FILTER(WHERE assignment.id IS NOT NULL),'[]'::jsonb) AS assignments
             FROM tenant_memberships membership
             JOIN users user_account ON user_account.id=membership.user_id
             LEFT JOIN member_role_assignments assignment
               ON assignment.tenant_id=membership.tenant_id AND assignment.user_id=membership.user_id
            WHERE membership.tenant_id=$1
              AND ($2::text IS NULL OR membership.membership_status=$2)
              AND ($3::text IS NULL OR user_account.display_name ILIKE '%'||$3||'%'
                   OR membership.employee_no ILIKE '%'||$3||'%')
            GROUP BY membership.user_id,user_account.display_name,user_account.status,
                     membership.employee_no,membership.membership_status,membership.joined_at,
                     membership.created_at,membership.updated_at
            ORDER BY user_account.display_name,membership.user_id LIMIT $4`,
          [identity.tenantId, query.status ?? null, query.query ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          userId: row.user_id,
          displayName: row.display_name,
          userStatus: row.user_status,
          employeeNo: row.employee_no,
          membershipStatus: row.membership_status,
          joinedAt: iso(row.joined_at),
          assignments: row.assignments,
          createdAt: iso(row.created_at),
          updatedAt: iso(row.updated_at),
        }));
      });
    },

    getAuthorizationCatalog(identity) {
      tenantWide(identity);
      return transaction(identity, async (client) => {
        const [roles, permissions] = await Promise.all([
          client.query(
            `SELECT role_code,role_name,scope_type,description,system_role
               FROM role_catalog ORDER BY role_code`,
          ),
          client.query(
            `SELECT permission.role_code,permission.permission_code,permission.access_scope,
                    catalog.domain,catalog.description,catalog.risk_level
               FROM role_permissions permission
               JOIN permission_catalog catalog ON catalog.permission_code=permission.permission_code
              ORDER BY permission.role_code,permission.permission_code`,
          ),
        ]);
        return { roles: roles.rows, permissions: permissions.rows };
      });
    },

    assignRole(rawCommand) {
      const body = AssignRoleSchema.parse(rawCommand.body);
      tenantWide(rawCommand.identity);
      if (!TenantAssignableRoles.has(body.roleCode))
        throw new OrganizationGovernanceAuthorizationError();
      if (StoreBoundRoles.has(body.roleCode) !== Boolean(body.storeId))
        throw new OrganizationGovernanceStateError();
      if (body.validUntil && new Date(body.validUntil).getTime() <= Date.now())
        throw new OrganizationGovernanceStateError();
      return idempotent({ ...rawCommand, body }, 'organization.role.assign', async (client) => {
        const membership = await client.query(
          `SELECT membership_status FROM tenant_memberships
            WHERE tenant_id=$1 AND user_id=$2 FOR UPDATE`,
          [rawCommand.identity.tenantId, body.userId],
        );
        if (membership.rows[0]?.membership_status !== 'ACTIVE')
          throw new OrganizationGovernanceStateError();
        if (body.storeId) {
          const store = await client.query(
            `SELECT 1 FROM stores WHERE tenant_id=$1 AND id=$2 AND status<>'CLOSED'`,
            [rawCommand.identity.tenantId, body.storeId],
          );
          if (!store.rows[0]) throw new OrganizationGovernanceAuthorizationError();
        }
        const inserted = await client.query(
          `INSERT INTO member_role_assignments(tenant_id,user_id,role_code,store_id,granted_by,valid_until)
           VALUES($1,$2,$3,$4,$5,$6)
           ON CONFLICT (tenant_id,user_id,role_code,store_id)
           DO UPDATE SET valid_until=EXCLUDED.valid_until,granted_by=EXCLUDED.granted_by
           RETURNING id,user_id,role_code,store_id,valid_until,created_at`,
          [
            rawCommand.identity.tenantId,
            body.userId,
            body.roleCode,
            body.storeId ?? null,
            rawCommand.identity.userId,
            body.validUntil ?? null,
          ],
        );
        const result = inserted.rows[0];
        await audit(
          client,
          rawCommand,
          'ROLE_ASSIGNED',
          'member_role_assignment',
          result.id,
          'role.manage',
          { userId: body.userId, roleCode: body.roleCode, storeId: body.storeId ?? null },
        );
        return result;
      });
    },

    revokeRole(rawCommand) {
      const assignmentId = UuidSchema.parse(rawCommand.body.assignmentId);
      tenantWide(rawCommand.identity);
      return idempotent(
        { ...rawCommand, body: { assignmentId } },
        'organization.role.revoke',
        async (client) => {
          const found = await client.query(
            `SELECT id,user_id,role_code,store_id FROM member_role_assignments
              WHERE tenant_id=$1 AND id=$2 FOR UPDATE`,
            [rawCommand.identity.tenantId, assignmentId],
          );
          const assignment = found.rows[0];
          if (!assignment) throw new OrganizationGovernanceAuthorizationError();
          if (assignment.role_code === 'MERCHANT_OWNER') {
            const owners = await client.query(
              `SELECT count(*)::int AS count FROM member_role_assignments assignment
               JOIN tenant_memberships membership ON membership.tenant_id=assignment.tenant_id
                 AND membership.user_id=assignment.user_id
              WHERE assignment.tenant_id=$1 AND assignment.role_code='MERCHANT_OWNER'
                AND membership.membership_status='ACTIVE'
                AND (assignment.valid_until IS NULL OR assignment.valid_until>now())`,
              [rawCommand.identity.tenantId],
            );
            if (Number(owners.rows[0]?.count) <= 1) throw new OrganizationGovernanceStateError();
          }
          await client.query(`DELETE FROM member_role_assignments WHERE tenant_id=$1 AND id=$2`, [
            rawCommand.identity.tenantId,
            assignmentId,
          ]);
          const result = { ...assignment, revoked: true };
          await audit(
            client,
            rawCommand,
            'ROLE_REVOKED',
            'member_role_assignment',
            assignmentId,
            'role.manage',
            result,
          );
          return result;
        },
      );
    },

    changeMemberStatus(rawCommand) {
      const body = ChangeMemberSchema.parse(rawCommand.body);
      tenantWide(rawCommand.identity);
      if (body.userId === rawCommand.identity.userId && body.status === 'SUSPENDED')
        throw new OrganizationGovernanceStateError();
      return idempotent({ ...rawCommand, body }, 'organization.member.status', async (client) => {
        if (body.status === 'SUSPENDED') {
          const targetOwner = await client.query(
            `SELECT EXISTS(SELECT 1 FROM member_role_assignments WHERE tenant_id=$1 AND user_id=$2
              AND role_code='MERCHANT_OWNER' AND (valid_until IS NULL OR valid_until>now())) AS owner,
              (SELECT count(*) FROM member_role_assignments assignment
               JOIN tenant_memberships membership ON membership.tenant_id=assignment.tenant_id
                 AND membership.user_id=assignment.user_id
               WHERE assignment.tenant_id=$1 AND assignment.role_code='MERCHANT_OWNER'
                 AND membership.membership_status='ACTIVE'
                 AND (assignment.valid_until IS NULL OR assignment.valid_until>now())) AS owner_count`,
            [rawCommand.identity.tenantId, body.userId],
          );
          if (targetOwner.rows[0]?.owner && Number(targetOwner.rows[0]?.owner_count) <= 1)
            throw new OrganizationGovernanceStateError();
        }
        const updated = await client.query(
          `UPDATE tenant_memberships SET membership_status=$3,updated_at=now()
            WHERE tenant_id=$1 AND user_id=$2 AND membership_status<>$3
            RETURNING user_id,membership_status,updated_at`,
          [rawCommand.identity.tenantId, body.userId, body.status],
        );
        if (!updated.rows[0]) throw new OrganizationGovernanceStateError();
        if (body.status === 'SUSPENDED')
          await client.query(
            `UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()),revoked_reason='MEMBERSHIP_SUSPENDED'
              WHERE tenant_id=$1 AND user_id=$2 AND revoked_at IS NULL`,
            [rawCommand.identity.tenantId, body.userId],
          );
        const result = updated.rows[0];
        await audit(
          client,
          rawCommand,
          'MEMBERSHIP_STATUS_CHANGED',
          'tenant_membership',
          body.userId,
          'member.manage',
          result,
        );
        return result;
      });
    },

    listAudit(identity, rawQuery) {
      tenantWide(identity);
      const query = AuditQuerySchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT id,actor_type,actor_id,action,resource_type,resource_id,permission_code,
                  result_code,trace_id,occurred_at
             FROM audit_logs WHERE tenant_id=$1
              AND ($2::text IS NULL OR action=$2)
              AND ($3::text IS NULL OR resource_type=$3)
            ORDER BY occurred_at DESC,id LIMIT $4`,
          [identity.tenantId, query.action ?? null, query.resourceType ?? null, query.limit],
        );
        return result.rows.map((row) => ({ ...row, occurred_at: iso(row.occurred_at) }));
      });
    },

    listPrivacyRequests(identity, rawQuery) {
      tenantWide(identity);
      const query = ListSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const result = await client.query(
          `SELECT id,customer_id,request_type,scope,status,legal_hold,retention_basis,
                  result_summary,requested_at,completed_at,updated_at
             FROM customer_privacy_requests WHERE tenant_id=$1
              AND ($2::text IS NULL OR status=$2)
            ORDER BY requested_at DESC,id LIMIT $3`,
          [identity.tenantId, query.status ?? null, query.limit],
        );
        return result.rows.map((row) => ({
          ...row,
          requested_at: iso(row.requested_at),
          completed_at: iso(row.completed_at),
          updated_at: iso(row.updated_at),
        }));
      });
    },

    listNotifications(identity, rawQuery) {
      const query = ListSchema.parse(rawQuery);
      return transaction(identity, async (client) => {
        const stores = identity.accessScopes?.some((scope) => ['TENANT', 'ALL'].includes(scope))
          ? null
          : (identity.assignedStoreIds ?? []);
        if (stores?.length === 0) throw new OrganizationGovernanceAuthorizationError();
        const result = await client.query(
          `SELECT notification.id,notification.conversation_id,notification.ticket_id,
                  notification.channel,notification.payload_summary,notification.status,
                  notification.attempt_count,notification.last_error_code,
                  notification.delivered_at,notification.created_at,notification.updated_at
             FROM customer_service_notifications notification
             JOIN conversations conversation ON conversation.tenant_id=notification.tenant_id
               AND conversation.id=notification.conversation_id
            WHERE notification.tenant_id=$1
              AND ($2::uuid[] IS NULL OR conversation.store_id=ANY($2))
              AND ($3::text IS NULL OR notification.status=$3)
            ORDER BY notification.created_at DESC,notification.id LIMIT $4`,
          [identity.tenantId, stores, query.status ?? null, query.limit],
        );
        return result.rows;
      });
    },
  };
}
