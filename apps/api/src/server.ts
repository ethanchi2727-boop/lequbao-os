import { buildApp } from './app.js';
import { createAccessControlService } from './access-control.js';
import { createAuthSessionService } from './auth-session-service.js';
import {
  createConsumerSessionIdentityVerifier,
  createConsumerSessionTokenSigner,
} from './consumer-session-identity.js';
import { createConsumerStoreSwitchService } from './consumer-store-switch-service.js';
import { createConsumerCatalogService } from './consumer-catalog-service.js';
import { createLifeConsumerSessionIdentityVerifier } from './life-consumer-session-identity.js';
import { createCustomerServiceAiOrchestrator } from './customer-service-ai.js';
import {
  createHttpCustomerServiceBusinessToolGateway,
  createHttpCustomerServiceKnowledgeGateway,
  createHttpCustomerServiceModelGateway,
  createHttpCustomerServiceNotificationDispatcher,
} from './customer-service-http-adapters.js';
import { createCustomerService } from './customer-service.js';
import { createHttpCommerceAdapters } from './commerce-http-adapters.js';
import { createCommerceOrderService } from './commerce-order-service.js';
import { createCommercePaymentService } from './commerce-payment-service.js';
import { createCommerceReconciliationService } from './commerce-reconciliation-service.js';
import { createCommerceRefundService } from './commerce-refund-service.js';
import { createCommerceVerificationService } from './commerce-verification-service.js';
import { createPool } from './database.js';
import { createDistributionLockService } from './distribution-lock-service.js';
import { createDistributionSettlementService } from './distribution-settlement-service.js';
import { createDeliveryWorkflowService } from './delivery-workflow-service.js';
import { createEmployeeAgentService } from './employee-agent-service.js';
import { createOperationalHomeService } from './operational-home-service.js';
import { createGeoOperationsService } from './geo-operations-service.js';
import { createCustomerServiceOperationsService } from './customer-service-operations-service.js';
import { createPlatformControlService } from './platform-control-service.js';
import { createMerchantIntakeService } from './merchant-intake-service.js';
import { createMerchantIntakeMessageService } from './merchant-intake-message-service.js';
import { createMerchantIntakeUploadService } from './merchant-intake-upload-service.js';
import { createMerchantOperationsService } from './merchant-operations-service.js';
import { createOrganizationGovernanceService } from './organization-governance-service.js';
import { createRevenueOperationsService } from './revenue-operations-service.js';
import { createSalesLifecycleService } from './sales-lifecycle-service.js';
import { createSubscriptionLifecycleService } from './subscription-lifecycle-service.js';
import { createPlatformCartService } from './platform-cart-service.js';
import { createPlatformCheckoutService } from './platform-checkout-service.js';
import { createMerchantConsumerJourneyService } from './merchant-consumer-journey-service.js';
import { createPlatformOrderQueryService } from './platform-order-query-service.js';
import { createPlatformPaymentService } from './platform-payment-service.js';
import { createPlatformAftercareService } from './platform-aftercare-service.js';
import { createPlatformDiscoveryService } from './platform-discovery-service.js';
import {
  createPlatformAddressCipher,
  createPlatformAddressService,
} from './platform-address-service.js';
import { createPlatformInvoiceProfileService } from './platform-invoice-profile-service.js';
import {
  createMiniProgramCallbackService,
  type MiniProgramCallbackService,
} from './mini-program-callback.js';
import {
  createHttpMiniProgramBuilder,
  createHttpMiniProgramProviderGateway,
} from './mini-program-http-adapters.js';
import {
  createMiniProgramLifecycleService,
  type MiniProgramLifecycleService,
} from './mini-program-lifecycle-service.js';
import { createIntakeObjectStoreGateway } from './intake-object-store.js';
import { createRevenueRightService } from './revenue-right-service.js';
import { createRevenueRightGovernanceService } from './revenue-right-governance-service.js';
import { createSessionIdentityVerifier, createSessionTokenSigner } from './session-identity.js';
import {
  createGeoPluginReportService,
  createHttpGeoPluginGateways,
} from './geo-plugin-report-service.js';
import {
  createPostgresWeComReceiptStore,
  createWeComIntakeCallbackService,
  type WeComIntakeCallbackService,
} from './wecom-intake-callback.js';
import { createHttpWeComConfigResolver } from './wecom-intake-http-adapter.js';
import { validateApiRuntimeConfiguration } from './runtime-configuration.js';

validateApiRuntimeConfiguration(process.env);

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
const salesLifecycle = process.env.SALES_IDENTITY_HASH_SECRET
  ? createSalesLifecycleService(pool, {
      identityHashSecret: process.env.SALES_IDENTITY_HASH_SECRET,
    })
  : undefined;
const platformCart = createPlatformCartService(pool);
const platformCheckout = createPlatformCheckoutService(pool);
const merchantConsumerJourney = createMerchantConsumerJourneyService(
  pool,
  platformCart,
  platformCheckout,
);
const consumerAuthSecret = process.env.CONSUMER_AUTH_JWT_SECRET;
const consumerSession = consumerAuthSecret
  ? createConsumerSessionIdentityVerifier(consumerAuthSecret)
  : undefined;
const consumerStoreSwitch = consumerAuthSecret
  ? createConsumerStoreSwitchService(pool, createConsumerSessionTokenSigner(consumerAuthSecret))
  : undefined;
const platformSensitiveCipher = process.env.PLATFORM_ADDRESS_ENCRYPTION_KEY
  ? createPlatformAddressCipher(process.env.PLATFORM_ADDRESS_ENCRYPTION_KEY)
  : undefined;
const merchantIntakeMessages = createMerchantIntakeMessageService(merchantIntake, objectStore);
const wecomNotification =
  process.env.WECOM_NOTIFICATION_GATEWAY_URL && process.env.WECOM_NOTIFICATION_GATEWAY_TOKEN
    ? createHttpCustomerServiceNotificationDispatcher({
        baseUrl: process.env.WECOM_NOTIFICATION_GATEWAY_URL,
        serviceToken: process.env.WECOM_NOTIFICATION_GATEWAY_TOKEN,
      })
    : undefined;
const customerService = createCustomerService(pool, objectStore, wecomNotification);
const commerceOrders = createCommerceOrderService(pool);
const commerceProviderConfig = {
  baseUrl: process.env.COMMERCE_PROVIDER_GATEWAY_URL,
  serviceToken: process.env.COMMERCE_PROVIDER_GATEWAY_TOKEN,
  callbackSecret: process.env.COMMERCE_CALLBACK_SECRET,
  verificationTokenSecret: process.env.VERIFICATION_TOKEN_SECRET,
};
const commerceAdapters = Object.values(commerceProviderConfig).every(Boolean)
  ? createHttpCommerceAdapters({
      baseUrl: commerceProviderConfig.baseUrl!,
      serviceToken: commerceProviderConfig.serviceToken!,
      callbackSecret: commerceProviderConfig.callbackSecret!,
    })
  : undefined;
const commercePayments = commerceAdapters
  ? createCommercePaymentService({
      pool,
      objectStore,
      provider: commerceAdapters.payment,
      callbackVerifier: commerceAdapters.callback,
      verificationTokenSecret: commerceProviderConfig.verificationTokenSecret!,
    })
  : undefined;
const commerceRefunds = commerceAdapters
  ? createCommerceRefundService({ pool, objectStore, provider: commerceAdapters.refund })
  : undefined;
const commerceVerification = commerceProviderConfig.verificationTokenSecret
  ? createCommerceVerificationService({
      pool,
      verificationTokenSecret: commerceProviderConfig.verificationTokenSecret,
    })
  : undefined;
const commerceReconciliation = commerceAdapters
  ? createCommerceReconciliationService({ pool, provider: commerceAdapters.reconciliation })
  : undefined;
const geoPluginGateway =
  process.env.GEO_PLUGIN_GATEWAY_URL && process.env.GEO_PLUGIN_GATEWAY_TOKEN
    ? createHttpGeoPluginGateways({
        baseUrl: process.env.GEO_PLUGIN_GATEWAY_URL,
        serviceToken: process.env.GEO_PLUGIN_GATEWAY_TOKEN,
      })
    : undefined;
const geoPluginReports = geoPluginGateway
  ? createGeoPluginReportService({
      pool,
      geo: geoPluginGateway.geo,
      plugins: geoPluginGateway.plugins,
    })
  : undefined;
const customerServiceGateways = {
  knowledgeUrl: process.env.CUSTOMER_SERVICE_KNOWLEDGE_URL,
  knowledgeToken: process.env.CUSTOMER_SERVICE_KNOWLEDGE_TOKEN,
  modelUrl: process.env.CUSTOMER_SERVICE_MODEL_URL,
  modelToken: process.env.CUSTOMER_SERVICE_MODEL_TOKEN,
  businessUrl: process.env.CUSTOMER_SERVICE_BUSINESS_TOOLS_URL,
  businessToken: process.env.CUSTOMER_SERVICE_BUSINESS_TOOLS_TOKEN,
};
const customerServiceAi = Object.values(customerServiceGateways).every(Boolean)
  ? createCustomerServiceAiOrchestrator({
      pool,
      objectStore,
      customerService,
      knowledge: createHttpCustomerServiceKnowledgeGateway({
        baseUrl: customerServiceGateways.knowledgeUrl!,
        serviceToken: customerServiceGateways.knowledgeToken!,
      }),
      model: createHttpCustomerServiceModelGateway({
        baseUrl: customerServiceGateways.modelUrl!,
        serviceToken: customerServiceGateways.modelToken!,
      }),
      tools: createHttpCustomerServiceBusinessToolGateway({
        baseUrl: customerServiceGateways.businessUrl!,
        serviceToken: customerServiceGateways.businessToken!,
      }),
    })
  : undefined;
let miniPrograms: MiniProgramLifecycleService | undefined;
let miniProgramCallback: MiniProgramCallbackService | undefined;
const miniProgramGatewayUrl = process.env.MINI_PROGRAM_GATEWAY_URL;
const miniProgramGatewayToken = process.env.MINI_PROGRAM_GATEWAY_TOKEN;
const miniProgramBuilderUrl = process.env.MINI_PROGRAM_BUILDER_URL;
const miniProgramBuilderToken = process.env.MINI_PROGRAM_BUILDER_TOKEN;
if (
  miniProgramGatewayUrl &&
  miniProgramGatewayToken &&
  miniProgramBuilderUrl &&
  miniProgramBuilderToken
) {
  const provider = createHttpMiniProgramProviderGateway({
    baseUrl: miniProgramGatewayUrl,
    serviceToken: miniProgramGatewayToken,
  });
  miniPrograms = createMiniProgramLifecycleService(
    pool,
    provider,
    createHttpMiniProgramBuilder({
      baseUrl: miniProgramBuilderUrl,
      serviceToken: miniProgramBuilderToken,
    }),
  );
  if (process.env.MINI_PROGRAM_CALLBACK_TOKEN) {
    miniProgramCallback = createMiniProgramCallbackService({
      token: process.env.MINI_PROGRAM_CALLBACK_TOKEN,
      decoder: provider,
      objectStore,
      lifecycle: miniPrograms,
    });
  }
}
let wecomIntakeCallback: WeComIntakeCallbackService | undefined;
if (process.env.WECOM_CONFIG_GATEWAY_URL && process.env.WECOM_CONFIG_GATEWAY_TOKEN) {
  wecomIntakeCallback = createWeComIntakeCallbackService({
    config: createHttpWeComConfigResolver({
      baseUrl: process.env.WECOM_CONFIG_GATEWAY_URL,
      serviceToken: process.env.WECOM_CONFIG_GATEWAY_TOKEN,
    }),
    receipts: createPostgresWeComReceiptStore(pool),
    messages: merchantIntakeMessages,
  });
}
const app = await buildApp({
  logger: true,
  revenueRights: createRevenueRightService(pool),
  revenueRightGovernance: createRevenueRightGovernanceService(pool),
  distributionLocks: createDistributionLockService(pool),
  distributionSettlements: createDistributionSettlementService(pool),
  merchantIntake,
  merchantIntakeUploads: createMerchantIntakeUploadService(pool, objectStore),
  merchantIntakeMessages,
  ...(wecomIntakeCallback ? { wecomIntakeCallback } : {}),
  sessionIdentity: createSessionIdentityVerifier(authSecret),
  authSessions: createAuthSessionService(pool, createSessionTokenSigner(authSecret)),
  deliveryWorkflows: createDeliveryWorkflowService(pool),
  accessControl: createAccessControlService(pool),
  customerService,
  consumerCatalog: createConsumerCatalogService(pool),
  platformCart,
  ...(platformSensitiveCipher
    ? {
        platformAddresses: createPlatformAddressService(pool, platformSensitiveCipher),
        platformInvoiceProfiles: createPlatformInvoiceProfileService(pool, platformSensitiveCipher),
      }
    : {}),
  platformCheckout,
  merchantConsumerJourney,
  platformOrders: createPlatformOrderQueryService(pool),
  platformDiscovery: createPlatformDiscoveryService(pool),
  ...(commercePayments
    ? { platformPayments: createPlatformPaymentService(pool, commercePayments) }
    : {}),
  ...(commerceRefunds && commerceVerification
    ? {
        platformAftercare: createPlatformAftercareService(
          pool,
          commerceRefunds,
          commerceVerification,
        ),
      }
    : {}),
  commerceOrders,
  merchantOperations: createMerchantOperationsService(pool),
  organizationGovernance: createOrganizationGovernanceService(pool),
  revenueOperations: createRevenueOperationsService(pool, objectStore),
  ...(salesLifecycle ? { salesLifecycle } : {}),
  subscriptionLifecycle: createSubscriptionLifecycleService(pool),
  employeeAgent: createEmployeeAgentService(pool, objectStore),
  operationalHome: createOperationalHomeService(pool),
  geoOperations: createGeoOperationsService(pool),
  customerServiceOperations: createCustomerServiceOperationsService(pool),
  platformControl: createPlatformControlService(pool),
  ...(commercePayments ? { commercePayments } : {}),
  ...(commerceRefunds ? { commerceRefunds } : {}),
  ...(commerceVerification ? { commerceVerification } : {}),
  ...(commerceReconciliation ? { commerceReconciliation } : {}),
  ...(geoPluginReports ? { geoPluginReports } : {}),
  ...(consumerSession
    ? {
        consumerSession,
        consumerStoreSwitch: consumerStoreSwitch!,
      }
    : {}),
  ...(process.env.LIFE_CONSUMER_AUTH_JWT_SECRET
    ? {
        lifeConsumerSession: createLifeConsumerSessionIdentityVerifier(
          process.env.LIFE_CONSUMER_AUTH_JWT_SECRET,
        ),
      }
    : {}),
  ...(customerServiceAi ? { customerServiceAi } : {}),
  ...(process.env.INTERNAL_WORKER_TOKEN
    ? { internalWorkerToken: process.env.INTERNAL_WORKER_TOKEN }
    : {}),
  ...(miniPrograms ? { miniPrograms } : {}),
  ...(miniProgramCallback ? { miniProgramCallback } : {}),
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
