import { buildApp } from './app.js';
import { createPool } from './database.js';
import { createDistributionLockService } from './distribution-lock-service.js';
import { createDistributionSettlementService } from './distribution-settlement-service.js';
import { createMerchantIntakeService } from './merchant-intake-service.js';
import { createRevenueRightService } from './revenue-right-service.js';
import { createSessionIdentityVerifier } from './session-identity.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const authSecret = process.env.AUTH_JWT_SECRET;
if (!authSecret) throw new Error('AUTH_JWT_SECRET is required');

const pool = createPool(databaseUrl);
const app = await buildApp({
  logger: true,
  revenueRights: createRevenueRightService(pool),
  distributionLocks: createDistributionLockService(pool),
  distributionSettlements: createDistributionSettlementService(pool),
  merchantIntake: createMerchantIntakeService(pool),
  sessionIdentity: createSessionIdentityVerifier(authSecret),
  databaseCheck: async () => {
    await pool.query('SELECT 1');
  },
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await app.listen({ port, host });
