import pg from 'pg';
import pino from 'pino';
import { claimTenantOutbox } from './outbox.js';

const databaseUrl = process.env.DATABASE_URL;
const tenantId = process.env.WORKER_TENANT_ID;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!tenantId) throw new Error('WORKER_TENANT_ID is required for RLS-safe processing');

const pool = new pg.Pool({ connectionString: databaseUrl });
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const workerId = `outbox-${process.pid}`;

const events = await claimTenantOutbox(pool, tenantId, workerId);
logger.info({ claimed: events.length, tenantId }, 'outbox batch claimed');
await pool.end();
