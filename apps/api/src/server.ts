import { buildApp } from './app.js';
import { createPool } from './database.js';
import { createDistributionLockService } from './distribution-lock-service.js';
import { createDistributionSettlementService } from './distribution-settlement-service.js';
import { createMerchantIntakeService } from './merchant-intake-service.js';
import { createMerchantIntakeMessageService } from './merchant-intake-message-service.js';
import { createMerchantIntakeUploadService } from './merchant-intake-upload-service.js';
import { createIntakeObjectStoreGateway } from './intake-object-store.js';
import { createRevenueRightService } from './revenue-right-service.js';
import { createSessionIdentityVerifier } from './session-identity.js';
import {
  createPostgresWeComReceiptStore,
  createWeComIntakeCallbackService,
  type WeComIntakeCallbackService,
} from './wecom-intake-callback.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const authSecret = process.env.AUTH_JWT_SECRET;
if (!authSecret) throw new Error('AUTH_JWT_SECRET is required');
const objectStoreGatewayUrl = process.env.OBJECT_STORE_GATEWAY_URL;
if (!objectStoreGatewayUrl) throw new Error('OBJECT_STORE_GATEWAY_URL is required');
const objectStoreSigningSecret = process.env.OBJECT_STORE_SIGNING_SECRET;
if (!objectStoreSigningSecret) throw new Error('OBJECT_STORE_SIGNING_SECRET is required');

const pool = createPool(databaseUrl);
const objectStore = createIntakeObjectStoreGateway({
  baseUrl: objectStoreGatewayUrl,
  signingSecret: objectStoreSigningSecret,
});
const merchantIntake = createMerchantIntakeService(pool);
const merchantIntakeMessages = createMerchantIntakeMessageService(merchantIntake, objectStore);
let wecomIntakeCallback: WeComIntakeCallbackService | undefined;
const wecom = {
  corpId: process.env.WECOM_CORP_ID,
  token: process.env.WECOM_CALLBACK_TOKEN,
  encodingAesKey: process.env.WECOM_ENCODING_AES_KEY,
  tenantId: process.env.WECOM_TENANT_ID,
  userId: process.env.WECOM_USER_ID,
  memberId: process.env.WECOM_MEMBER_ID,
  intakeSessionId: process.env.WECOM_INTAKE_SESSION_ID,
};
if (Object.values(wecom).every((value) => value)) {
  wecomIntakeCallback = createWeComIntakeCallbackService({
    config: {
      resolveCorp: async (corpId) =>
        corpId === wecom.corpId
          ? {
              tenantId: wecom.tenantId!,
              corpId: wecom.corpId!,
              token: wecom.token!,
              encodingAesKey: wecom.encodingAesKey!,
            }
          : undefined,
      resolveMember: async (_config, memberId) =>
        memberId === wecom.memberId
          ? {
              identity: {
                tenantId: wecom.tenantId!,
                userId: wecom.userId!,
                roleCodes: ['MERCHANT_OWNER'],
                storeIds: [],
                sessionId: `wecom:${memberId}`,
              },
              intakeSessionId: wecom.intakeSessionId!,
            }
          : undefined,
    },
    receipts: createPostgresWeComReceiptStore(pool),
    messages: merchantIntakeMessages,
  });
}
const app = await buildApp({
  logger: true,
  revenueRights: createRevenueRightService(pool),
  distributionLocks: createDistributionLockService(pool),
  distributionSettlements: createDistributionSettlementService(pool),
  merchantIntake,
  merchantIntakeUploads: createMerchantIntakeUploadService(pool, objectStore),
  merchantIntakeMessages,
  ...(wecomIntakeCallback ? { wecomIntakeCallback } : {}),
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
