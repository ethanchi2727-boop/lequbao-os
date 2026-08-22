import pg from 'pg';
import pino from 'pino';
import { createHttpOutboxPublisher } from './outbox-publisher.js';
import { dispatchTenantOutboxBatch } from './outbox-runtime.js';
import { dispatchQueuedCustomerServiceAiJobs } from './customer-service-ai.js';
import { dispatchCommerceJobs } from './commerce-jobs.js';
import { dispatchGeoAndReportJobs } from './geo-report-jobs.js';
import { dispatchPrivacyDeletionJobs } from './privacy-deletion-jobs.js';
import { dispatchPrivacyExportJobs } from './privacy-export-jobs.js';
import { validateWorkerRuntimeConfiguration } from './runtime-configuration.js';

validateWorkerRuntimeConfiguration(process.env);

const databaseUrl = process.env.DATABASE_URL;
const tenantId = process.env.WORKER_TENANT_ID;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
if (!tenantId) throw new Error('WORKER_TENANT_ID is required for RLS-safe processing');
if (!process.env.OUTBOX_EVENT_GATEWAY_URL) throw new Error('OUTBOX_EVENT_GATEWAY_URL is required');
if (!process.env.OUTBOX_EVENT_GATEWAY_TOKEN)
  throw new Error('OUTBOX_EVENT_GATEWAY_TOKEN is required');

const pool = new pg.Pool({ connectionString: databaseUrl });
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const workerId = `outbox-${process.pid}`;
const outboxPublisher = createHttpOutboxPublisher({
  baseUrl: process.env.OUTBOX_EVENT_GATEWAY_URL,
  serviceToken: process.env.OUTBOX_EVENT_GATEWAY_TOKEN,
});

try {
  const outboxResults = await dispatchTenantOutboxBatch({
    pool,
    tenantId,
    workerId,
    publisher: outboxPublisher,
  });
  logger.info(
    {
      attempted: outboxResults.length,
      published: outboxResults.filter((event) => event.status === 'PUBLISHED').length,
      failed: outboxResults.filter((event) => event.status === 'FAILED').length,
      dead: outboxResults.filter((event) => event.status === 'DEAD').length,
      tenantId,
    },
    'outbox batch settled',
  );
  if (process.env.INTERNAL_API_URL && process.env.INTERNAL_WORKER_TOKEN) {
    const commerceJobs = await dispatchCommerceJobs({
      pool,
      tenantId,
      internalApiUrl: process.env.INTERNAL_API_URL,
      internalWorkerToken: process.env.INTERNAL_WORKER_TOKEN,
    });
    logger.info(
      {
        attempted: commerceJobs.length,
        accepted: commerceJobs.filter((job) => job.accepted).length,
        tenantId,
      },
      'commerce jobs dispatched',
    );
    const geoReportJobs = await dispatchGeoAndReportJobs({
      pool,
      tenantId,
      internalApiUrl: process.env.INTERNAL_API_URL,
      internalWorkerToken: process.env.INTERNAL_WORKER_TOKEN,
    });
    logger.info(
      {
        attempted: geoReportJobs.length,
        accepted: geoReportJobs.filter((job) => job.accepted).length,
        tenantId,
      },
      'GEO and value-report jobs dispatched',
    );
    const aiJobs = await dispatchQueuedCustomerServiceAiJobs({
      pool,
      tenantId,
      workerId: `customer-service-ai-${process.pid}`,
      internalApiUrl: process.env.INTERNAL_API_URL,
      internalWorkerToken: process.env.INTERNAL_WORKER_TOKEN,
    });
    logger.info(
      {
        attempted: aiJobs.length,
        accepted: aiJobs.filter((job) => job.accepted).length,
        tenantId,
      },
      'customer-service AI jobs dispatched',
    );
  }
  if (process.env.PRIVACY_DELETION_GATEWAY_URL && process.env.PRIVACY_DELETION_GATEWAY_TOKEN) {
    const privacyJobs = await dispatchPrivacyDeletionJobs({
      pool,
      tenantId,
      gatewayUrl: process.env.PRIVACY_DELETION_GATEWAY_URL,
      gatewayToken: process.env.PRIVACY_DELETION_GATEWAY_TOKEN,
    });
    logger.info(
      {
        attempted: privacyJobs.length,
        accepted: privacyJobs.filter((job) => job.accepted).length,
        tenantId,
      },
      'privacy deletion jobs dispatched',
    );
  }
  if (process.env.PRIVACY_EXPORT_GATEWAY_URL && process.env.PRIVACY_EXPORT_GATEWAY_TOKEN) {
    const privacyExports = await dispatchPrivacyExportJobs({
      pool,
      tenantId,
      gatewayUrl: process.env.PRIVACY_EXPORT_GATEWAY_URL,
      gatewayToken: process.env.PRIVACY_EXPORT_GATEWAY_TOKEN,
    });
    logger.info(
      {
        attempted: privacyExports.length,
        accepted: privacyExports.filter((job) => job.accepted).length,
        tenantId,
      },
      'encrypted privacy export jobs dispatched',
    );
  }
} finally {
  await pool.end();
}
