import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import cors from '@fastify/cors'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AccessDeniedError, requireAccess, type Principal } from '@lequ/auth'
import { authenticate, toAuthSession } from './auth-service.js'
import { createDatabase } from './database.js'
import { DomainError } from './errors.js'
import {
  advanceExperience,
  getSnapshot,
  resetExperience,
} from './experience-service.js'
import {
  addLeadCollaborator,
  addLeadFollowUp,
  captureAssets,
  confirmAsset,
  createContractDraft,
  createLead,
  decideContractDiscount,
  getOnboardingOverview,
  markLeadLost,
  runDiagnosis,
  signContract,
  submitLeadAppeal,
  transferLead,
  uploadOnboardingAsset,
} from './onboarding-service.js'
import {
  advanceMiniAppProject,
  createMiniAppProject,
  generateMiniAppDraft,
  getMiniAppFactoryOverview,
  reviseMiniAppProject,
  rollbackMiniAppProject,
} from './miniapp-factory-service.js'
import {
  approveGeoPlan,
  createGeoWorkspace,
  getGeoOverview,
  proposeGeoFixes,
  publishGeoPlan,
  scanGeoWorkspace,
  startGeoMonitoring,
} from './geo-service.js'
import {
  advanceSkillSuite,
  createSkillSuite,
  generateSkillSuite,
  getSkillNetworkOverview,
  invokeSkill,
  testSkillSuite,
} from './skill-network-service.js'
import {
  approveMerchantRefund,
  confirmMerchantOrder,
  getMerchantOperationsOverview,
  verifyMerchantOrder,
} from './merchant-operations-service.js'
import {
  adjustSkuStock,
  applyCatalogImport,
  changeSkuPrice,
  createCatalogSpu,
  getMerchantCatalogOverview,
  previewCatalogImport,
  publishCatalogSpu,
  updateServiceSlot,
} from './merchant-catalog-service.js'
import {
  createMemberRecallTask,
  getMerchantMemberOverview,
  grantMemberBenefit,
  updateMemberTags,
} from './merchant-member-service.js'
import {
  completeSalesTask,
  getSalesWorkbenchOverview,
  snoozeSalesTask,
} from './sales-workbench-service.js'
import { getSalesCrmOverview } from './sales-crm-service.js'
import {
  createLeadTransferRequest,
  decideLeadAppeal,
  decideLeadTransferRequest,
  getSalesOwnershipOverview,
} from './sales-ownership-service.js'
import {
  getSalesPerformanceOverview,
  reverseSalesCommission,
  settleSalesCommission,
  updateSalesTarget,
} from './sales-performance-service.js'
import {
  checkInSalesCoachingPlan,
  createSalesCoachingPlan,
  decideSalesLevelChange,
  getSalesTeamOverview,
  requestSalesLevelChange,
} from './sales-team-service.js'
import {
  confirmSalesAiArtifact,
  generateSalesAiArtifact,
  getSalesAiCopilotOverview,
  replySalesAiRoleplay,
  startSalesAiRoleplay,
} from './sales-ai-copilot-service.js'
import {
  assignProviderLead,
  getProviderLocalGrowthOverview,
} from './provider-local-growth-service.js'
import { getProviderDeliveryBoardOverview } from './provider-delivery-board-service.js'
import {
  assignProviderWorkOrder,
  confirmProviderWorkOrder,
  createProviderWorkOrder,
  getProviderWorkOrderAttachment,
  getProviderWorkOrderOverview,
  startProviderWorkOrder,
  submitProviderWorkOrder,
  uploadProviderWorkOrderAttachment,
} from './provider-work-order-service.js'
import {
  acknowledgeProviderSlaIncident,
  getProviderSlaOverview,
  PROVIDER_SLA_SCAN_INTERVAL_SECONDS,
  runProviderSlaScan,
} from './provider-sla-service.js'
import {
  closeProviderRenewalCase,
  generateProviderRenewalProposal,
  getProviderRenewalOverview,
  PROVIDER_RENEWAL_SCAN_INTERVAL_SECONDS,
  runProviderRenewalScan,
} from './provider-renewal-service.js'
import { getProviderCityMetricsOverview } from './provider-city-metrics-service.js'
import {
  decideProviderSettlementAdjustment,
  decideProviderSettlementInvoice,
  generateProviderSettlement,
  getProviderSettlementOverview,
  requestProviderSettlementAdjustment,
  settleProviderStatement,
  submitProviderSettlementInvoice,
} from './provider-city-settlement-service.js'
import {
  executeConsumerSearch,
  getConsumerHomeOverview,
  getConsumerMessages,
  markConsumerMessageRead,
  updateConsumerContext,
} from './consumer-home-service.js'
import {
  cancelConsumerReservation,
  confirmConsumerReservation,
  getConsumerAssistantOverview,
  sendConsumerAssistantMessage,
  updateConsumerReservationDraft,
} from './consumer-assistant-service.js'
import { getConsumerNearbyOverview } from './consumer-nearby-service.js'
import {
  confirmConsumerDealDraft,
  CONSUMER_DEAL_EXPIRY_SCAN_INTERVAL_SECONDS,
  createConsumerDealDraft,
  getConsumerStoreDetail,
  releaseExpiredConsumerDealCheckouts,
} from './consumer-store-service.js'
import {
  cancelConsumerDeal,
  requestConsumerDealRefund,
} from './consumer-deal-aftercare-service.js'
import { applyConsumerDealPaymentCallback } from './consumer-deal-payment-service.js'
import {
  applyConsumerPaymentCallback,
  prepareConsumerReservationPayment,
  requestConsumerReservationRefund,
} from './consumer-payment-service.js'
import {
  applySpeechTranscriptionCallback,
  confirmConsumerVoiceTranscript,
  uploadConsumerVoiceInput,
} from './consumer-voice-service.js'
import {
  applyImageRecognitionCallback,
  confirmConsumerImageDescription,
  uploadConsumerImageInput,
} from './consumer-image-service.js'

const advanceBodySchema = z.object({
  expectedStep: z.number().int().min(1).max(12),
})

const leadIdParamsSchema = z.object({ leadId: z.string().min(1).max(100) })
const contractIdParamsSchema = z.object({ contractId: z.string().min(1).max(100) })
const assetIdParamsSchema = z.object({ assetId: z.string().min(1).max(100) })
const overviewQuerySchema = z.object({ focusLeadId: z.string().min(1).max(100).optional() })
const createLeadBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  source: z.string().trim().min(2).max(80),
  contactName: z.string().trim().min(2).max(60),
  contactPhoneMasked: z.string().trim().min(7).max(30),
  address: z.string().trim().min(5).max(240),
  cityId: z.string().trim().min(2).max(80),
})
const versionBodySchema = z.object({ expectedVersion: z.number().int().positive() })
const contractBodySchema = versionBodySchema.extend({
  packageCode: z.enum(['BASIC', 'PRO', 'AGENT', 'CHAIN']),
  discountBps: z.number().int().min(0).max(3000),
})
const signContractBodySchema = versionBodySchema.extend({ leadId: z.string().min(1).max(100) })
const confirmAssetBodySchema = versionBodySchema.extend({
  leadId: z.string().min(1).max(100),
  corrected: z.record(z.string(), z.unknown()),
})
const transferLeadBodySchema = versionBodySchema.extend({
  targetOwnerId: z.string().min(1).max(100),
  reason: z.string().trim().min(5).max(300),
})
const appealBodySchema = z.object({
  reason: z.string().trim().min(5).max(500),
  evidence: z.array(z.string().trim().min(1).max(300)).min(1).max(10),
})
const followUpBodySchema = versionBodySchema.extend({
  channel: z.enum(['PHONE', 'WECHAT', 'VISIT', 'VIDEO']),
  summary: z.string().trim().min(3).max(500),
  nextAction: z.string().trim().min(2).max(160),
  nextActionAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), '无效的跟进时间'),
})
const lostBodySchema = versionBodySchema.extend({
  reason: z.enum(['NO_BUDGET', 'NO_DECISION', 'COMPETITOR', 'TIMING', 'INVALID', 'OTHER']),
  note: z.string().trim().min(3).max(500),
})
const collaboratorBodySchema = versionBodySchema.extend({
  userId: z.string().min(1).max(100),
  role: z.enum(['CO_OWNER', 'DELIVERY_PARTNER', 'OBSERVER']),
})
const discountDecisionBodySchema = versionBodySchema.extend({
  leadId: z.string().min(1).max(100),
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().min(3).max(500),
})
const uploadHeadersSchema = z.object({
  'x-asset-type': z.enum(['BUSINESS_LICENSE', 'STOREFRONT', 'MENU']),
  'x-file-name': z.string().min(1).max(600),
  'x-mime-type': z.string().min(3).max(120),
  'x-expected-version': z.coerce.number().int().positive(),
})
const projectIdParamsSchema = z.object({ projectId: z.string().min(1).max(100) })
const factoryOverviewQuerySchema = z.object({ focusProjectId: z.string().min(1).max(100).optional() })
const createProjectBodySchema = z.object({
  leadId: z.string().min(1).max(100),
  expectedLeadVersion: z.number().int().positive(),
  deliveryType: z.enum(['MERCHANT_PAGE', 'STANDARD_MINIAPP', 'CHAIN_ENTERPRISE']),
  templateCode: z.enum(['DINING_AURORA', 'CAFE_EDITORIAL', 'RETAIL_GALLERY']),
})
const generateProjectBodySchema = versionBodySchema.extend({
  templateCode: z.enum(['DINING_AURORA', 'CAFE_EDITORIAL', 'RETAIL_GALLERY']),
})
const merchantApproveBodySchema = versionBodySchema.extend({
  merchantApprover: z.string().trim().min(2).max(80),
})
const rollbackProjectBodySchema = versionBodySchema.extend({
  targetVersion: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
})
const geoWorkspaceIdParamsSchema = z.object({ workspaceId: z.string().min(1).max(100) })
const geoOverviewQuerySchema = z.object({ focusWorkspaceId: z.string().min(1).max(100).optional() })
const createGeoWorkspaceBodySchema = z.object({
  projectId: z.string().min(1).max(100),
  expectedProjectVersion: z.number().int().positive(),
})
const approveGeoBodySchema = versionBodySchema.extend({
  merchantApprover: z.string().trim().min(2).max(80),
})
const skillSuiteIdParamsSchema = z.object({ suiteId: z.string().min(1).max(100) })
const skillInvokeParamsSchema = skillSuiteIdParamsSchema.extend({ skillVersionId: z.string().min(1).max(100) })
const skillOverviewQuerySchema = z.object({ focusSuiteId: z.string().min(1).max(100).optional() })
const createSkillSuiteBodySchema = z.object({
  geoWorkspaceId: z.string().min(1).max(100),
  expectedGeoVersion: z.number().int().positive(),
})
const invokeSkillBodySchema = z.object({
  intent: z.string().trim().min(3).max(300),
  payload: z.record(z.string(), z.unknown()),
  approvalConfirmed: z.boolean(),
})
const merchantOrderIdParamsSchema = z.object({ orderId: z.string().min(1).max(100) })
const merchantOverviewQuerySchema = z.object({ focusOrderId: z.string().min(1).max(100).optional() })
const verifyMerchantOrderBodySchema = versionBodySchema.extend({
  verificationCode: z.string().regex(/^\d{6}$/, '核销码必须是 6 位数字'),
  confirmed: z.boolean(),
})
const approveRefundBodySchema = versionBodySchema.extend({
  refundAmountFen: z.number().int().positive(),
  reason: z.string().trim().min(3).max(300),
  confirmed: z.boolean(),
})
const catalogSpuIdParamsSchema = z.object({ spuId: z.string().min(1).max(100) })
const catalogSkuIdParamsSchema = z.object({ skuId: z.string().min(1).max(100) })
const catalogSlotIdParamsSchema = z.object({ slotId: z.string().min(1).max(100) })
const catalogImportIdParamsSchema = z.object({ importId: z.string().min(1).max(100) })
const catalogOverviewQuerySchema = z.object({ focusSpuId: z.string().min(1).max(100).optional() })
const stockModeSchema = z.enum(['FINITE', 'UNLIMITED', 'SLOT'])
const createCatalogSpuBodySchema = z.object({
  type: z.enum(['PRODUCT', 'SERVICE', 'PACKAGE']),
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(2).max(80),
  description: z.string().trim().min(5).max(1000),
  mediaCompletion: z.number().int().min(0).max(100),
  sku: z.object({
    code: z.string().trim().min(3).max(80).regex(/^[A-Z0-9-]+$/, 'SKU 编码只能包含大写字母、数字和连字符'),
    name: z.string().trim().min(2).max(120),
    priceFen: z.number().int().positive(),
    stockMode: stockModeSchema,
    stockQuantity: z.number().int().nonnegative(),
    lowStockThreshold: z.number().int().nonnegative(),
  }),
})
const changeSkuPriceBodySchema = versionBodySchema.extend({
  priceFen: z.number().int().positive(),
  compareAtFen: z.number().int().nonnegative().nullable(),
  reason: z.string().trim().min(3).max(300),
  confirmed: z.boolean(),
})
const adjustSkuStockBodySchema = versionBodySchema.extend({
  delta: z.number().int().min(-100000).max(100000).refine((value) => value !== 0, '库存变化量不能为 0'),
  reason: z.string().trim().min(3).max(300),
})
const updateServiceSlotBodySchema = versionBodySchema.extend({
  capacity: z.number().int().positive().max(10000),
  priceOverrideFen: z.number().int().nonnegative().nullable(),
  confirmed: z.boolean(),
})
const catalogImportRowSchema = z.object({
  type: z.enum(['PRODUCT', 'SERVICE', 'PACKAGE']),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1000),
  mediaCompletion: z.number().int(),
  skuCode: z.string().trim().min(1).max(80),
  skuName: z.string().trim().min(1).max(120),
  priceFen: z.number().int(),
  stockMode: stockModeSchema,
  stockQuantity: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
})
const previewCatalogImportBodySchema = z.object({
  fileName: z.string().trim().min(3).max(180),
  rows: z.array(catalogImportRowSchema).min(1).max(50),
})
const applyCatalogImportBodySchema = versionBodySchema.extend({ confirmed: z.boolean() })
const memberIdParamsSchema = z.object({ memberId: z.string().min(1).max(100) })
const memberOverviewQuerySchema = z.object({ focusMemberId: z.string().min(1).max(100).optional() })
const updateMemberTagsBodySchema = versionBodySchema.extend({
  tags: z.array(z.string().trim().min(1).max(30)).max(8),
})
const grantMemberBenefitBodySchema = versionBodySchema.extend({
  kind: z.enum(['COUPON', 'LEVEL', 'EXPERIENCE']),
  title: z.string().trim().min(2).max(120),
  valueFen: z.number().int().nonnegative(),
  expiresAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), '无效的权益到期时间'),
  confirmed: z.boolean(),
})
const createMemberRecallBodySchema = z.object({
  name: z.string().trim().min(2).max(120),
  memberIds: z.array(z.string().min(1).max(100)).min(1).max(100),
  channel: z.enum(['WECHAT', 'SMS']),
  content: z.string().trim().min(5).max(500),
  reason: z.string().trim().min(3).max(300),
  scheduledAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), '无效的召回计划时间'),
  confirmed: z.boolean(),
})
const salesTaskIdParamsSchema = z.object({ taskId: z.string().min(1).max(120) })
const completeSalesTaskBodySchema = versionBodySchema.extend({
  completionNote: z.string().trim().min(3).max(500),
})
const snoozeSalesTaskBodySchema = versionBodySchema.extend({
  snoozeUntil: z.string().refine((value) => Number.isFinite(Date.parse(value)), '无效的稍后提醒时间'),
  reason: z.string().trim().min(3).max(300),
})
const salesCrmQuerySchema = z.object({
  keyword: z.string().trim().max(80).optional().default(''),
  stage: z.enum([
    'NEW',
    'DIAGNOSED',
    'CONTRACT_DRAFT',
    'SIGNED',
    'ASSET_REVIEW',
    'READY_FOR_DELIVERY',
    'LOST',
  ]).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  timing: z.enum(['ALL', 'OVERDUE', 'TODAY', 'UPCOMING']).optional().default('ALL'),
})
const createLeadTransferRequestBodySchema = z.object({
  targetOwnerId: z.string().min(1).max(100),
  reason: z.string().trim().min(5).max(500),
  evidence: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
  expectedLeadVersion: z.number().int().positive(),
})
const ownershipDecisionBodySchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().min(5).max(500),
  expectedVersion: z.number().int().positive(),
})
const appealDecisionBodySchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().min(5).max(500),
  expectedLeadVersion: z.number().int().positive(),
})
const ownershipTransferRequestParamsSchema = z.object({
  requestId: z.string().min(1).max(160),
})
const ownershipAppealParamsSchema = z.object({
  appealId: z.string().min(1).max(160),
})
const salesPerformanceQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  salespersonId: z.string().min(1).max(100).optional(),
})
const salesTargetParamsSchema = z.object({
  salespersonId: z.string().min(1).max(100),
})
const salesLedgerEntryParamsSchema = z.object({
  entryId: z.string().min(1).max(180),
})
const updateSalesTargetBodySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  signingTargetFen: z.number().int().min(0).max(100_000_000_000),
  renewalTargetFen: z.number().int().min(0).max(100_000_000_000),
  transactionTargetFen: z.number().int().min(0).max(100_000_000_000),
  expectedVersion: z.number().int().min(0),
  reason: z.string().trim().min(5).max(500),
}).refine(
  (value) => value.signingTargetFen + value.renewalTargetFen + value.transactionTargetFen > 0,
  '业绩目标合计必须大于 0',
)
const commissionTransitionBodySchema = z.object({
  reason: z.string().trim().min(5).max(500),
  evidence: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
  confirmed: z.boolean(),
})
const salesCareerLevelSchema = z.enum([
  'ASSOCIATE',
  'CONSULTANT',
  'SENIOR',
  'EXPERT',
  'TEAM_LEAD',
])
const salesCapabilitySchema = z.enum([
  'DISCOVERY',
  'DIAGNOSIS',
  'PROPOSAL',
  'NEGOTIATION',
  'COMPLIANCE',
])
const salesTeamQuerySchema = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  focusMemberId: z.string().min(1).max(120).optional(),
})
const salesTeamMemberParamsSchema = z.object({
  memberId: z.string().min(1).max(120),
})
const salesLevelChangeParamsSchema = z.object({
  requestId: z.string().min(1).max(180),
})
const salesCoachingPlanParamsSchema = z.object({
  planId: z.string().min(1).max(180),
})
const requestSalesLevelChangeBodySchema = z.object({
  toLevel: salesCareerLevelSchema,
  expectedVersion: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
  evidence: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
  confirmed: z.boolean(),
})
const decideSalesLevelChangeBodySchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  expectedMemberVersion: z.number().int().positive(),
  reason: z.string().trim().min(5).max(500),
  evidence: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
  confirmed: z.boolean(),
})
const createSalesCoachingPlanBodySchema = z.object({
  expectedMemberVersion: z.number().int().positive(),
  title: z.string().trim().min(3).max(120),
  focusCapability: salesCapabilitySchema,
  goal: z.string().trim().min(5).max(500),
  actions: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
  successMetric: z.string().trim().min(5).max(300),
  dueAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), '无效的截止时间'),
  nextSessionAt: z.string()
    .refine((value) => Number.isFinite(Date.parse(value)), '无效的辅导时间')
    .optional(),
})
const checkInSalesCoachingPlanBodySchema = z.object({
  expectedVersion: z.number().int().positive(),
  note: z.string().trim().min(3).max(500),
  evidence: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
  nextSessionAt: z.string()
    .refine((value) => Number.isFinite(Date.parse(value)), '无效的辅导时间')
    .optional(),
  complete: z.boolean(),
})
const salesAiCopilotQuerySchema = z.object({
  focusLeadId: z.string().min(1).max(120).optional(),
})
const salesAiArtifactKindSchema = z.enum([
  'PRE_VISIT_BRIEF',
  'TALK_TRACK',
  'MEETING_SUMMARY',
  'NEXT_ACTION',
  'PROPOSAL',
])
const salesAiObjectionTypeSchema = z.enum([
  'PRICE',
  'ROI',
  'TIMING',
  'AUTHORITY',
  'COMPETITOR',
])
const salesAiArtifactParamsSchema = z.object({
  artifactKey: z.string().min(3).max(180),
})
const salesAiRoleplayParamsSchema = z.object({
  sessionId: z.string().min(3).max(180),
})
const generateSalesAiArtifactBodySchema = z.object({
  kind: salesAiArtifactKindSchema,
  objective: z.string().trim().min(3).max(500),
  contextNotes: z.array(z.string().trim().min(2).max(600)).max(12).default([]),
})
const confirmSalesAiArtifactBodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  expectedLeadVersion: z.number().int().positive(),
  confirmed: z.boolean(),
  crmWriteback: z.object({
    channel: z.enum(['PHONE', 'WECHAT', 'VISIT', 'VIDEO']),
    summary: z.string().trim().min(3).max(1000),
    nextAction: z.string().trim().min(2).max(160),
    nextActionAt: z.string().refine(
      (value) => Number.isFinite(Date.parse(value)),
      '无效的下一步时间',
    ),
  }).optional(),
})
const startSalesAiRoleplayBodySchema = z.object({
  objectionType: salesAiObjectionTypeSchema,
  scenario: z.string().trim().min(3).max(500),
})
const replySalesAiRoleplayBodySchema = z.object({
  response: z.string().trim().min(3).max(1200),
})
const providerLocalGrowthQuerySchema = z.object({
  focusLeadId: z.string().min(1).max(100).optional(),
})
const providerDeliveryBoardQuerySchema = z.object({
  focusCaseId: z.string().min(1).max(160).optional(),
})
const providerWorkOrderQuerySchema = z.object({
  focusCaseId: z.string().min(1).max(160).optional(),
  focusWorkOrderId: z.string().min(1).max(180).optional(),
})
const providerWorkOrderIdParamsSchema = z.object({
  workOrderId: z.string().min(1).max(180),
})
const providerWorkOrderAttachmentParamsSchema = z.object({
  attachmentId: z.string().min(1).max(200),
})
const providerWorkOrderTypeSchema = z.enum([
  'ASSET_COLLECTION',
  'MINIAPP_CONFIGURATION',
  'MERCHANT_REVIEW',
  'PLATFORM_REVIEW',
  'GEO_OPTIMIZATION',
  'SKILL_ACTIVATION',
  'DELIVERY_ACCEPTANCE',
  'OTHER',
])
const createProviderWorkOrderBodySchema = z.object({
  caseId: z.string().min(1).max(160),
  type: providerWorkOrderTypeSchema,
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(5).max(800),
  priority: z.enum(['CRITICAL', 'HIGH', 'NORMAL']),
  ownerId: z.string().min(1).max(100),
  dueAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), '无效的截止时间'),
  confirmationRequired: z.boolean().optional(),
})
const assignProviderWorkOrderBodySchema = versionBodySchema.extend({
  targetOwnerId: z.string().min(1).max(100),
  reason: z.string().trim().min(5).max(500),
  confirmed: z.boolean(),
})
const submitProviderWorkOrderBodySchema = versionBodySchema.extend({
  handoffNote: z.string().trim().min(5).max(800),
  confirmed: z.boolean(),
})
const confirmProviderWorkOrderBodySchema = versionBodySchema.extend({
  decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
  confirmerName: z.string().trim().min(2).max(80),
  confirmerRole: z.string().trim().min(2).max(80),
  comment: z.string().trim().min(3).max(800),
  confirmed: z.boolean(),
})
const providerSlaQuerySchema = z.object({
  focusIncidentId: z.string().min(1).max(180).optional(),
})
const providerSlaIncidentParamsSchema = z.object({
  incidentId: z.string().min(1).max(180),
})
const acknowledgeProviderSlaBodySchema = versionBodySchema.extend({
  responsePlan: z.string().trim().min(10).max(1200),
  confirmed: z.boolean(),
})
const providerRenewalQuerySchema = z.object({
  focusCaseId: z.string().min(1).max(180).optional(),
})
const providerCityMetricsQuerySchema = z.object({
  period: z.enum(['30D', '90D', '365D']).optional(),
  focusLeadId: z.string().min(1).max(100).optional(),
})
const providerSettlementQuerySchema = z.object({
  focusStatementId: z.string().min(1).max(180).optional(),
})
const providerSettlementStatementParamsSchema = z.object({
  statementId: z.string().min(1).max(180),
})
const providerSettlementAdjustmentParamsSchema = providerSettlementStatementParamsSchema.extend({
  adjustmentId: z.string().min(1).max(180),
})
const generateProviderSettlementBodySchema = z.object({
  cityId: z.string().trim().min(2).max(80),
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '账期必须为 YYYY-MM'),
  confirmed: z.boolean(),
})
const providerSettlementAdjustmentBodySchema = versionBodySchema.extend({
  direction: z.enum(['CREDIT', 'DEBIT']),
  amountFen: z.number().int().positive().max(100_000_000),
  reason: z.string().trim().min(5).max(500),
  evidence: z.array(z.string().trim().min(2).max(300)).min(1).max(10),
  confirmed: z.boolean(),
})
const providerSettlementAdjustmentDecisionBodySchema = versionBodySchema.extend({
  decision: z.enum(['APPROVE', 'REJECT']),
  note: z.string().trim().min(3).max(500),
  confirmed: z.boolean(),
})
const providerSettlementInvoiceBodySchema = versionBodySchema.extend({
  invoiceNo: z.string().trim().min(5).max(80),
  sellerName: z.string().trim().min(4).max(160),
  sellerTaxIdMasked: z.string().trim().min(8).max(40),
  amountFen: z.number().int().positive().max(1_000_000_000),
  issuedAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), '无效的开票时间'),
  confirmed: z.boolean(),
})
const providerSettlementInvoiceDecisionBodySchema = versionBodySchema.extend({
  decision: z.enum(['VERIFY', 'REJECT']),
  note: z.string().trim().min(3).max(500),
  confirmed: z.boolean(),
})
const settleProviderStatementBodySchema = versionBodySchema.extend({
  confirmed: z.boolean(),
})
const consumerContextBodySchema = versionBodySchema.extend({
  cityId: z.string().trim().min(2).max(80),
  householdMemberId: z.string().trim().min(2).max(120),
})
const consumerMessageQuerySchema = z.object({
  category: z.enum(['TRANSACTION', 'SERVICE', 'FAMILY', 'SYSTEM']).optional(),
  unreadOnly: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
})
const consumerMessageParamsSchema = z.object({
  messageId: z.string().min(1).max(180),
})
const consumerMessageReadBodySchema = versionBodySchema
const consumerSearchBodySchema = z.object({
  query: z.string().trim().min(1).max(120),
  cityId: z.string().trim().min(2).max(80).optional(),
  householdMemberId: z.string().trim().min(2).max(120).optional(),
  limit: z.number().int().min(1).max(30).default(20),
})
const consumerNearbyBodySchema = z.object({
  cityId: z.string().trim().min(2).max(80).optional(),
  householdMemberId: z.string().trim().min(2).max(120).optional(),
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracyMeters: z.number().nonnegative().max(10_000).optional(),
  }).optional(),
  limit: z.number().int().min(1).max(30).default(20),
})
const consumerStoreParamsSchema = z.object({
  storeId: z.string().min(1).max(180),
})
const consumerDealDraftParamsSchema = consumerStoreParamsSchema.extend({
  offerId: z.string().min(1).max(180),
})
const consumerDealDraftBodySchema = z.object({
  cityId: z.string().trim().min(2).max(80),
  householdMemberId: z.string().trim().min(2).max(120),
  quantity: z.number().int().min(1).max(10),
  serviceAt: z.string().datetime({ offset: true }).optional(),
  acknowledgedTerms: z.boolean(),
})
const consumerDealConfirmParamsSchema = z.object({
  draftId: z.string().uuid(),
})
const consumerDealConfirmBodySchema = versionBodySchema.extend({
  confirmed: z.boolean(),
})
const consumerDealAftercareBodySchema = versionBodySchema.extend({
  confirmed: z.boolean(),
  reason: z.string().trim().min(3).max(300),
})
const consumerAssistantMessageBodySchema = z.object({
  prompt: z.string().trim().min(1).max(600),
  cityId: z.string().trim().min(2).max(80),
  householdMemberId: z.string().trim().min(2).max(120),
  sessionId: z.string().uuid().optional(),
  sourceVoiceInputId: z.string().uuid().optional(),
  sourceImageInputId: z.string().uuid().optional(),
})
const consumerVoiceUploadHeadersSchema = z.object({
  'x-file-name': z.string().min(1).max(600),
  'x-mime-type': z.string().min(3).max(120),
  'x-duration-ms': z.coerce.number().int().min(500).max(60_000),
  'x-city-id': z.string().trim().min(2).max(80),
  'x-household-member-id': z.string().trim().min(2).max(120),
})
const consumerVoiceParamsSchema = z.object({ voiceInputId: z.string().uuid() })
const consumerVoiceConfirmBodySchema = versionBodySchema.extend({
  transcript: z.string().trim().min(1).max(600),
  confirmed: z.boolean(),
})
const speechConnectorCallbackBodySchema = z.object({
  providerEventId: z.string().trim().min(8).max(180),
  voiceInputId: z.string().uuid(),
  status: z.enum(['SUCCEEDED', 'FAILED']),
  transcript: z.string().trim().min(1).max(600).optional(),
  confidence: z.number().min(0).max(1).optional(),
  language: z.literal('zh-CN').optional(),
  failureCode: z.string().trim().min(2).max(120).optional(),
})
const consumerImageUploadHeadersSchema = z.object({
  'x-file-name': z.string().min(1).max(600),
  'x-mime-type': z.string().min(3).max(120),
  'x-city-id': z.string().trim().min(2).max(80),
  'x-household-member-id': z.string().trim().min(2).max(120),
})
const consumerImageParamsSchema = z.object({ imageInputId: z.string().uuid() })
const consumerImageConfirmBodySchema = versionBodySchema.extend({
  description: z.string().trim().min(1).max(600),
  confirmed: z.boolean(),
})
const imageRecognitionCallbackBodySchema = z.object({
  providerEventId: z.string().trim().min(8).max(180),
  imageInputId: z.string().uuid(),
  status: z.enum(['SUCCEEDED', 'FAILED']),
  category: z.enum(['MENU', 'PRODUCT', 'RECEIPT', 'ENVIRONMENT', 'OTHER']).optional(),
  description: z.string().trim().min(1).max(600).optional(),
  confidence: z.number().min(0).max(1).optional(),
  containsSensitiveData: z.boolean().optional(),
  failureCode: z.string().trim().min(2).max(120).optional(),
})
const consumerReservationParamsSchema = z.object({
  draftId: z.string().uuid(),
})
const consumerReservationConfirmBodySchema = versionBodySchema.extend({
  confirmed: z.boolean(),
})
const consumerReservationUpdateBodySchema = versionBodySchema.extend({
  partySize: z.number().int().min(1).max(20),
  reservationAt: z.string().refine(
    (value) => Number.isFinite(Date.parse(value)),
    '无效的订座时间',
  ),
})
const consumerReservationCancelBodySchema = versionBodySchema.extend({
  confirmed: z.boolean(),
  reason: z.string().trim().min(3).max(300),
})
const consumerPaymentPrepareBodySchema = versionBodySchema.extend({
  confirmed: z.boolean(),
})
const consumerRefundRequestBodySchema = versionBodySchema.extend({
  confirmed: z.boolean(),
  reason: z.string().trim().min(3).max(300),
})
const paymentConnectorCallbackBodySchema = z.object({
  providerEventId: z.string().trim().min(8).max(180),
  type: z.enum(['PAYMENT_SUCCEEDED', 'PAYMENT_FAILED', 'REFUND_SUCCEEDED', 'REFUND_FAILED']),
  intentId: z.string().uuid(),
  amountFen: z.number().int().positive(),
  currency: z.literal('CNY'),
  providerTransactionId: z.string().trim().min(3).max(180).optional(),
  providerRefundId: z.string().trim().min(3).max(180).optional(),
  failureCode: z.string().trim().min(2).max(120).optional(),
})
const consumerDealConnectorCallbackBaseSchema = z.object({
  providerEventId: z.string().trim().min(8).max(180),
  intentId: z.string().uuid(),
  providerRequestId: z.string().trim().min(3).max(180),
  amountFen: z.number().int().positive(),
  currency: z.literal('CNY'),
  occurredAt: z.string().datetime({ offset: true }),
})
const consumerDealPaymentConnectorCallbackBodySchema = z.discriminatedUnion('type', [
  consumerDealConnectorCallbackBaseSchema.extend({
    type: z.literal('PAYMENT_SUCCEEDED'),
    providerTransactionId: z.string().trim().min(3).max(180),
  }),
  consumerDealConnectorCallbackBaseSchema.extend({
    type: z.literal('PAYMENT_FAILED'),
    failureCode: z.string().trim().min(2).max(120),
  }),
  consumerDealConnectorCallbackBaseSchema.extend({
    type: z.literal('REFUND_SUCCEEDED'),
    refundId: z.string().uuid(),
    refundAttemptId: z.string().uuid(),
    providerRefundId: z.string().trim().min(3).max(180),
  }),
  consumerDealConnectorCallbackBaseSchema.extend({
    type: z.literal('REFUND_FAILED'),
    refundId: z.string().uuid(),
    refundAttemptId: z.string().uuid(),
    failureCode: z.string().trim().min(2).max(120),
  }),
])
const providerRenewalCaseParamsSchema = z.object({
  caseId: z.string().min(1).max(180),
})
const providerRenewalProposalBodySchema = versionBodySchema.extend({
  confirmed: z.boolean(),
})
const providerRenewalOutcomeBodySchema = z.discriminatedUnion('outcome', [
  versionBodySchema.extend({
    outcome: z.literal('RENEWED'),
    confirmed: z.boolean(),
    acceptedPackageCode: z.enum(['BASIC', 'PRO', 'AGENT', 'CHAIN']).optional(),
  }),
  versionBodySchema.extend({
    outcome: z.literal('LOST'),
    confirmed: z.boolean(),
    lossReason: z.enum([
      'PRICE',
      'LOW_USAGE',
      'SERVICE_GAP',
      'BUSINESS_CLOSED',
      'COMPETITOR',
      'CASH_FLOW',
      'TIMING',
      'OTHER',
    ]),
    lossDetail: z.string().trim().min(5).max(1200),
    recoverable: z.boolean(),
    recoveryAction: z.string().trim().min(5).max(600).optional(),
  }),
])
const providerWorkOrderUploadHeadersSchema = z.object({
  'x-file-name': z.string().min(1).max(600),
  'x-mime-type': z.string().min(3).max(120),
  'x-attachment-category': z.enum(['EVIDENCE', 'DELIVERABLE', 'MERCHANT_FEEDBACK']),
  'x-expected-version': z.coerce.number().int().positive(),
})
const providerAssignLeadBodySchema = versionBodySchema.extend({
  targetOwnerId: z.string().min(1).max(100),
  reason: z.string().trim().min(5).max(500),
  confirmed: z.boolean(),
})

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal | null
    sessionExpiresAt: string | null
  }
}

function requirePrincipal(request: FastifyRequest): Principal {
  if (!request.principal) {
    throw new DomainError(401, 'authentication_required', '请先登录后再访问此服务')
  }
  return request.principal
}

function requireIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key']
  if (typeof value !== 'string' || value.trim().length < 8) {
    throw new DomainError(
      400,
      'idempotency_key_required',
      '写接口必须提供至少 8 个字符的 Idempotency-Key',
    )
  }
  return value.trim()
}

function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  code: string,
  detail: string,
): void {
  void reply
    .status(status)
    .type('application/problem+json')
    .send({
      type: `https://lequ.life/problems/${code}`,
      title: code,
      status,
      detail,
      traceId: request.id,
    })
}

export async function buildApp(options?: { database?: DatabaseSync }) {
  const database = options?.database ?? createDatabase()
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    genReqId: () => randomUUID(),
    bodyLimit: 8 * 1024 * 1024,
  })

  app.addContentTypeParser(
    'application/octet-stream',
    { parseAs: 'buffer' },
    (_request, body, done) => done(null, body),
  )

  await app.register(cors, {
    origin: [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
    methods: ['GET', 'POST'],
    allowedHeaders: [
      'Content-Type', 'Idempotency-Key', 'Authorization', 'X-Asset-Type',
      'X-File-Name', 'X-Mime-Type', 'X-Expected-Version', 'X-Attachment-Category',
      'X-Payment-Signature', 'X-Speech-Signature', 'X-Duration-Ms',
      'X-City-Id', 'X-Household-Member-Id', 'X-Image-Signature',
    ],
  })

  app.decorateRequest('principal', null)
  app.decorateRequest('sessionExpiresAt', null)

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api/v1')) return
    if (request.url === '/api/v1/payment-connectors/wechat/callback') return
    if (request.url === '/api/v1/payment-connectors/wechat/deals/callback') return
    if (request.url === '/api/v1/speech-connectors/transcription/callback') return
    if (request.url === '/api/v1/image-connectors/recognition/callback') return
    const session = authenticate(database, request.headers.authorization)
    request.principal = session.principal
    request.sessionExpiresAt = session.expiresAt
  })

  app.get('/health', async () => ({
    status: 'ok',
    service: 'lequ-modular-monolith',
    version: '5.0.0',
  }))

  app.get('/api/v1/auth/session', async (request) => {
    const principal = requirePrincipal(request)
    return toAuthSession(principal, request.sessionExpiresAt ?? '')
  })

  app.get('/api/v1/onboarding/overview', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.read')
    const query = overviewQuerySchema.parse(request.query)
    return getOnboardingOverview(database, principal, query.focusLeadId)
  })

  app.post('/api/v1/onboarding/leads', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    return createLead(
      database,
      principal,
      createLeadBodySchema.parse(request.body),
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/onboarding/leads/:leadId/diagnosis', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    requireAccess(principal, 'ai.use')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = versionBodySchema.parse(request.body)
    return runDiagnosis(database, principal, { leadId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/leads/:leadId/followups', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = followUpBodySchema.parse(request.body)
    return addLeadFollowUp(database, principal, { leadId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/leads/:leadId/lost', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = lostBodySchema.parse(request.body)
    return markLeadLost(database, principal, { leadId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/leads/:leadId/collaborators', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.assign')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = collaboratorBodySchema.parse(request.body)
    return addLeadCollaborator(database, principal, { leadId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/leads/:leadId/contracts', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'contract.create')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = contractBodySchema.parse(request.body)
    return createContractDraft(database, principal, { leadId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/contracts/:contractId/sign', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'contract.create')
    const { contractId } = contractIdParamsSchema.parse(request.params)
    const body = signContractBodySchema.parse(request.body)
    return signContract(database, principal, { contractId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/contracts/:contractId/discount-decision', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'contract.discount.approve')
    const { contractId } = contractIdParamsSchema.parse(request.params)
    const body = discountDecisionBodySchema.parse(request.body)
    return decideContractDiscount(
      database, principal, { contractId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/onboarding/leads/:leadId/assets/capture', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = versionBodySchema.parse(request.body)
    return captureAssets(database, principal, { leadId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/leads/:leadId/assets/upload', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const headers = uploadHeadersSchema.parse(request.headers)
    if (!Buffer.isBuffer(request.body)) {
      throw new DomainError(400, 'asset_body_required', '资料文件内容不能为空')
    }
    let fileName: string
    try {
      fileName = decodeURIComponent(headers['x-file-name'])
    } catch {
      throw new DomainError(400, 'asset_file_name_invalid', '资料文件名编码无效')
    }
    return uploadOnboardingAsset(database, principal, {
      leadId,
      expectedVersion: headers['x-expected-version'],
      assetType: headers['x-asset-type'],
      fileName,
      mimeType: headers['x-mime-type'],
      bytes: request.body,
    }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/assets/:assetId/confirm', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    const { assetId } = assetIdParamsSchema.parse(request.params)
    const body = confirmAssetBodySchema.parse(request.body)
    return confirmAsset(database, principal, { assetId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/leads/:leadId/transfer', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.transfer')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = transferLeadBodySchema.parse(request.body)
    return transferLead(database, principal, { leadId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/onboarding/leads/:leadId/appeals', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = appealBodySchema.parse(request.body)
    return submitLeadAppeal(database, principal, { leadId, ...body }, requireIdempotencyKey(request))
  })

  app.get('/api/v1/sales/workbench', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.read')
    return getSalesWorkbenchOverview(database, principal)
  })

  app.get('/api/v1/sales/crm', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.read')
    return getSalesCrmOverview(database, principal, salesCrmQuerySchema.parse(request.query))
  })

  app.get('/api/v1/sales/ownership/:leadId', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.read')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    return getSalesOwnershipOverview(database, principal, leadId)
  })

  app.post('/api/v1/sales/ownership/:leadId/transfer-requests', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = createLeadTransferRequestBodySchema.parse(request.body)
    return createLeadTransferRequest(
      database,
      principal,
      { leadId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/ownership/transfer-requests/:requestId/decision', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.transfer')
    const { requestId } = ownershipTransferRequestParamsSchema.parse(request.params)
    const body = ownershipDecisionBodySchema.parse(request.body)
    return decideLeadTransferRequest(
      database,
      principal,
      { requestId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/ownership/appeals/:appealId/decision', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.transfer')
    const { appealId } = ownershipAppealParamsSchema.parse(request.params)
    const body = appealDecisionBodySchema.parse(request.body)
    return decideLeadAppeal(
      database,
      principal,
      { appealId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/sales/performance', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'sales.performance.read')
    return getSalesPerformanceOverview(
      database,
      principal,
      salesPerformanceQuerySchema.parse(request.query),
    )
  })

  app.post('/api/v1/sales/performance/targets/:salespersonId', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'sales.target.manage')
    const { salespersonId } = salesTargetParamsSchema.parse(request.params)
    const body = updateSalesTargetBodySchema.parse(request.body)
    return updateSalesTarget(
      database,
      principal,
      { salespersonId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/performance/ledger/:entryId/settle', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'sales.commission.settle')
    const { entryId } = salesLedgerEntryParamsSchema.parse(request.params)
    const body = commissionTransitionBodySchema.parse(request.body)
    return settleSalesCommission(
      database,
      principal,
      { entryId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/performance/ledger/:entryId/reverse', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'sales.commission.settle')
    const { entryId } = salesLedgerEntryParamsSchema.parse(request.params)
    const body = commissionTransitionBodySchema.parse(request.body)
    return reverseSalesCommission(
      database,
      principal,
      { entryId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/sales/team', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'sales.team.read')
    return getSalesTeamOverview(
      database,
      principal,
      salesTeamQuerySchema.parse(request.query),
    )
  })

  app.post('/api/v1/sales/team/members/:memberId/level-changes', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'sales.team.manage')
    const { memberId } = salesTeamMemberParamsSchema.parse(request.params)
    const body = requestSalesLevelChangeBodySchema.parse(request.body)
    return requestSalesLevelChange(
      database,
      principal,
      { memberId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/team/level-changes/:requestId/decision', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'sales.team.level.approve')
    const { requestId } = salesLevelChangeParamsSchema.parse(request.params)
    const body = decideSalesLevelChangeBodySchema.parse(request.body)
    return decideSalesLevelChange(
      database,
      principal,
      { requestId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/team/members/:memberId/coaching-plans', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'sales.team.manage')
    const { memberId } = salesTeamMemberParamsSchema.parse(request.params)
    const body = createSalesCoachingPlanBodySchema.parse(request.body)
    return createSalesCoachingPlan(
      database,
      principal,
      { memberId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/team/coaching-plans/:planId/check-ins', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'sales.team.manage')
    const { planId } = salesCoachingPlanParamsSchema.parse(request.params)
    const body = checkInSalesCoachingPlanBodySchema.parse(request.body)
    return checkInSalesCoachingPlan(
      database,
      principal,
      { planId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/sales/copilot', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.read')
    requireAccess(principal, 'ai.use')
    requireAccess(principal, 'sales.copilot.use')
    const query = salesAiCopilotQuerySchema.parse(request.query)
    return getSalesAiCopilotOverview(database, principal, query.focusLeadId)
  })

  app.post('/api/v1/sales/copilot/leads/:leadId/artifacts', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.read')
    requireAccess(principal, 'ai.use')
    requireAccess(principal, 'sales.copilot.use')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = generateSalesAiArtifactBodySchema.parse(request.body)
    return generateSalesAiArtifact(
      database,
      principal,
      { leadId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/copilot/artifacts/:artifactKey/confirm', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    requireAccess(principal, 'ai.use')
    requireAccess(principal, 'sales.copilot.use')
    const { artifactKey } = salesAiArtifactParamsSchema.parse(request.params)
    const body = confirmSalesAiArtifactBodySchema.parse(request.body)
    return confirmSalesAiArtifact(
      database,
      principal,
      { artifactKey, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/copilot/leads/:leadId/roleplay-sessions', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.read')
    requireAccess(principal, 'ai.use')
    requireAccess(principal, 'sales.copilot.use')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = startSalesAiRoleplayBodySchema.parse(request.body)
    return startSalesAiRoleplay(
      database,
      principal,
      { leadId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/copilot/roleplay-sessions/:sessionId/turns', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.read')
    requireAccess(principal, 'ai.use')
    requireAccess(principal, 'sales.copilot.use')
    const { sessionId } = salesAiRoleplayParamsSchema.parse(request.params)
    const body = replySalesAiRoleplayBodySchema.parse(request.body)
    return replySalesAiRoleplay(
      database,
      principal,
      { sessionId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/provider/local-growth', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.assign')
    const query = providerLocalGrowthQuerySchema.parse(request.query)
    return getProviderLocalGrowthOverview(database, principal, query.focusLeadId)
  })

  app.get('/api/v1/provider/delivery-board', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.assign')
    const query = providerDeliveryBoardQuerySchema.parse(request.query)
    return getProviderDeliveryBoardOverview(database, principal, query.focusCaseId)
  })

  app.get('/api/v1/provider/delivery-work-orders', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.workorder.read')
    const query = providerWorkOrderQuerySchema.parse(request.query)
    return getProviderWorkOrderOverview(database, principal, query)
  })

  app.post('/api/v1/provider/delivery-work-orders', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.workorder.manage')
    return createProviderWorkOrder(
      database,
      principal,
      createProviderWorkOrderBodySchema.parse(request.body),
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/provider/delivery-work-orders/:workOrderId/assign', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.workorder.manage')
    const { workOrderId } = providerWorkOrderIdParamsSchema.parse(request.params)
    const body = assignProviderWorkOrderBodySchema.parse(request.body)
    return assignProviderWorkOrder(
      database,
      principal,
      { workOrderId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/provider/delivery-work-orders/:workOrderId/start', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.workorder.manage')
    const { workOrderId } = providerWorkOrderIdParamsSchema.parse(request.params)
    const body = versionBodySchema.parse(request.body)
    return startProviderWorkOrder(
      database,
      principal,
      { workOrderId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/provider/delivery-work-orders/:workOrderId/attachments', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.workorder.manage')
    const { workOrderId } = providerWorkOrderIdParamsSchema.parse(request.params)
    const headers = providerWorkOrderUploadHeadersSchema.parse(request.headers)
    if (!Buffer.isBuffer(request.body)) {
      throw new DomainError(400, 'work_order_attachment_body_required', '请使用二进制请求体上传附件')
    }
    let fileName: string
    try {
      fileName = decodeURIComponent(headers['x-file-name'])
    } catch {
      throw new DomainError(400, 'work_order_attachment_file_name_invalid', '附件文件名编码无效')
    }
    return uploadProviderWorkOrderAttachment(
      database,
      principal,
      {
        workOrderId,
        expectedVersion: headers['x-expected-version'],
        category: headers['x-attachment-category'],
        fileName,
        mimeType: headers['x-mime-type'],
        content: request.body,
      },
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/provider/delivery-work-order-attachments/:attachmentId', async (request, reply) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.workorder.read')
    const { attachmentId } = providerWorkOrderAttachmentParamsSchema.parse(request.params)
    const attachment = getProviderWorkOrderAttachment(database, principal, attachmentId)
    return reply
      .type(attachment.mimeType)
      .header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`)
      .send(attachment.content)
  })

  app.post('/api/v1/provider/delivery-work-orders/:workOrderId/submit', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.workorder.manage')
    const { workOrderId } = providerWorkOrderIdParamsSchema.parse(request.params)
    const body = submitProviderWorkOrderBodySchema.parse(request.body)
    return submitProviderWorkOrder(
      database,
      principal,
      { workOrderId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/provider/delivery-work-orders/:workOrderId/merchant-confirmation', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.workorder.confirm')
    const { workOrderId } = providerWorkOrderIdParamsSchema.parse(request.params)
    const body = confirmProviderWorkOrderBodySchema.parse(request.body)
    return confirmProviderWorkOrder(
      database,
      principal,
      { workOrderId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/provider/delivery-sla', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.sla.read')
    const query = providerSlaQuerySchema.parse(request.query)
    return getProviderSlaOverview(database, principal, query.focusIncidentId)
  })

  app.post('/api/v1/provider/delivery-sla/scan', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.sla.scan')
    requireIdempotencyKey(request)
    return runProviderSlaScan(database, principal)
  })

  app.post('/api/v1/provider/delivery-sla/incidents/:incidentId/acknowledge', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.sla.acknowledge')
    const { incidentId } = providerSlaIncidentParamsSchema.parse(request.params)
    const body = acknowledgeProviderSlaBodySchema.parse(request.body)
    return acknowledgeProviderSlaIncident(
      database,
      principal,
      { incidentId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/provider/renewals', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.renewal.read')
    const query = providerRenewalQuerySchema.parse(request.query)
    return getProviderRenewalOverview(database, principal, query.focusCaseId)
  })

  app.post('/api/v1/provider/renewals/scan', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.renewal.scan')
    requireIdempotencyKey(request)
    return runProviderRenewalScan(database, principal)
  })

  app.post('/api/v1/provider/renewals/:caseId/proposals', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.renewal.manage')
    const { caseId } = providerRenewalCaseParamsSchema.parse(request.params)
    const body = providerRenewalProposalBodySchema.parse(request.body)
    return generateProviderRenewalProposal(
      database,
      principal,
      { caseId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/provider/renewals/:caseId/outcome', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'delivery.renewal.manage')
    const { caseId } = providerRenewalCaseParamsSchema.parse(request.params)
    const body = providerRenewalOutcomeBodySchema.parse(request.body)
    return closeProviderRenewalCase(
      database,
      principal,
      { caseId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/provider/city-metrics', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'provider.metrics.read')
    return getProviderCityMetricsOverview(
      database,
      principal,
      providerCityMetricsQuerySchema.parse(request.query),
    )
  })

  app.get('/api/v1/provider/settlements', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'provider.settlement.read')
    const query = providerSettlementQuerySchema.parse(request.query)
    return getProviderSettlementOverview(database, principal, query.focusStatementId)
  })

  app.post('/api/v1/provider/settlements/generate', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'provider.settlement.manage')
    return generateProviderSettlement(
      database,
      principal,
      generateProviderSettlementBodySchema.parse(request.body),
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/provider/settlements/:statementId/adjustments', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'provider.settlement.manage')
    const { statementId } = providerSettlementStatementParamsSchema.parse(request.params)
    const body = providerSettlementAdjustmentBodySchema.parse(request.body)
    return requestProviderSettlementAdjustment(
      database,
      principal,
      { statementId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post(
    '/api/v1/provider/settlements/:statementId/adjustments/:adjustmentId/decision',
    async (request) => {
      const principal = requirePrincipal(request)
      requireAccess(principal, 'provider.settlement.approve')
      const { statementId, adjustmentId } = providerSettlementAdjustmentParamsSchema
        .parse(request.params)
      const body = providerSettlementAdjustmentDecisionBodySchema.parse(request.body)
      return decideProviderSettlementAdjustment(
        database,
        principal,
        { statementId, adjustmentId, ...body },
        requireIdempotencyKey(request),
      )
    },
  )

  app.post('/api/v1/provider/settlements/:statementId/invoices', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'provider.settlement.manage')
    const { statementId } = providerSettlementStatementParamsSchema.parse(request.params)
    const body = providerSettlementInvoiceBodySchema.parse(request.body)
    return submitProviderSettlementInvoice(
      database,
      principal,
      { statementId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/provider/settlements/:statementId/invoice-decision', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'provider.settlement.approve')
    const { statementId } = providerSettlementStatementParamsSchema.parse(request.params)
    const body = providerSettlementInvoiceDecisionBodySchema.parse(request.body)
    return decideProviderSettlementInvoice(
      database,
      principal,
      { statementId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/provider/settlements/:statementId/settle', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'provider.settlement.settle')
    const { statementId } = providerSettlementStatementParamsSchema.parse(request.params)
    const body = settleProviderStatementBodySchema.parse(request.body)
    return settleProviderStatement(
      database,
      principal,
      { statementId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/provider/local-growth/leads/:leadId/assign', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.assign')
    const { leadId } = leadIdParamsSchema.parse(request.params)
    const body = providerAssignLeadBodySchema.parse(request.body)
    return assignProviderLead(
      database,
      principal,
      { leadId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/tasks/:taskId/complete', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    const { taskId } = salesTaskIdParamsSchema.parse(request.params)
    const body = completeSalesTaskBodySchema.parse(request.body)
    return completeSalesTask(
      database, principal, { taskId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/sales/tasks/:taskId/snooze', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'lead.write')
    const { taskId } = salesTaskIdParamsSchema.parse(request.params)
    const body = snoozeSalesTaskBodySchema.parse(request.body)
    return snoozeSalesTask(
      database, principal, { taskId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/miniapp-factory/overview', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'miniapp.read')
    const query = factoryOverviewQuerySchema.parse(request.query)
    return getMiniAppFactoryOverview(database, principal, query.focusProjectId)
  })

  app.post('/api/v1/miniapp-factory/projects', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'miniapp.build')
    return createMiniAppProject(
      database, principal, createProjectBodySchema.parse(request.body), requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/miniapp-factory/projects/:projectId/generate', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'miniapp.build')
    const { projectId } = projectIdParamsSchema.parse(request.params)
    const body = generateProjectBodySchema.parse(request.body)
    return generateMiniAppDraft(database, principal, { projectId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/miniapp-factory/projects/:projectId/preview', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'miniapp.build')
    const { projectId } = projectIdParamsSchema.parse(request.params)
    const body = versionBodySchema.parse(request.body)
    return advanceMiniAppProject(database, principal, { projectId, ...body, action: 'preview' }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/miniapp-factory/projects/:projectId/merchant-approve', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'miniapp.build')
    const { projectId } = projectIdParamsSchema.parse(request.params)
    const body = merchantApproveBodySchema.parse(request.body)
    return advanceMiniAppProject(database, principal, { projectId, ...body, action: 'merchantApprove' }, requireIdempotencyKey(request))
  })

  for (const [path, action, permission] of [
    ['review', 'review', 'miniapp.build'],
    ['gray', 'gray', 'miniapp.release'],
    ['publish', 'publish', 'miniapp.release'],
  ] as const) {
    app.post(`/api/v1/miniapp-factory/projects/:projectId/${path}`, async (request) => {
      const principal = requirePrincipal(request)
      requireAccess(principal, permission)
      const { projectId } = projectIdParamsSchema.parse(request.params)
      const body = versionBodySchema.parse(request.body)
      return advanceMiniAppProject(database, principal, { projectId, ...body, action }, requireIdempotencyKey(request))
    })
  }

  app.post('/api/v1/miniapp-factory/projects/:projectId/revise', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'miniapp.build')
    const { projectId } = projectIdParamsSchema.parse(request.params)
    const body = versionBodySchema.parse(request.body)
    return reviseMiniAppProject(database, principal, { projectId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/miniapp-factory/projects/:projectId/rollback', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'miniapp.release')
    const { projectId } = projectIdParamsSchema.parse(request.params)
    const body = rollbackProjectBodySchema.parse(request.body)
    return rollbackMiniAppProject(database, principal, { projectId, ...body }, requireIdempotencyKey(request))
  })

  app.get('/api/v1/geo/overview', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'geo.read')
    const query = geoOverviewQuerySchema.parse(request.query)
    return getGeoOverview(database, principal, query.focusWorkspaceId)
  })

  app.post('/api/v1/geo/workspaces', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'geo.manage')
    return createGeoWorkspace(
      database, principal, createGeoWorkspaceBodySchema.parse(request.body), requireIdempotencyKey(request),
    )
  })

  for (const [path, operation] of [
    ['scan', scanGeoWorkspace],
    ['propose', proposeGeoFixes],
    ['publish', publishGeoPlan],
    ['monitor', startGeoMonitoring],
  ] as const) {
    app.post(`/api/v1/geo/workspaces/:workspaceId/${path}`, async (request) => {
      const principal = requirePrincipal(request)
      requireAccess(principal, 'geo.manage')
      const { workspaceId } = geoWorkspaceIdParamsSchema.parse(request.params)
      const body = versionBodySchema.parse(request.body)
      return operation(database, principal, { workspaceId, ...body }, requireIdempotencyKey(request))
    })
  }

  app.post('/api/v1/geo/workspaces/:workspaceId/merchant-approve', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'geo.manage')
    const { workspaceId } = geoWorkspaceIdParamsSchema.parse(request.params)
    const body = approveGeoBodySchema.parse(request.body)
    return approveGeoPlan(database, principal, { workspaceId, ...body }, requireIdempotencyKey(request))
  })

  app.get('/api/v1/skills/overview', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'skill.read')
    const query = skillOverviewQuerySchema.parse(request.query)
    return getSkillNetworkOverview(database, principal, query.focusSuiteId)
  })

  app.post('/api/v1/skills/suites', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'skill.manage')
    return createSkillSuite(
      database, principal, createSkillSuiteBodySchema.parse(request.body), requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/skills/suites/:suiteId/generate', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'skill.manage')
    const { suiteId } = skillSuiteIdParamsSchema.parse(request.params)
    const body = versionBodySchema.parse(request.body)
    return generateSkillSuite(database, principal, { suiteId, ...body }, requireIdempotencyKey(request))
  })

  app.post('/api/v1/skills/suites/:suiteId/test', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'skill.manage')
    const { suiteId } = skillSuiteIdParamsSchema.parse(request.params)
    const body = versionBodySchema.parse(request.body)
    return testSkillSuite(database, principal, { suiteId, ...body }, requireIdempotencyKey(request))
  })

  for (const [path, action, permission] of [
    ['submit', 'submit', 'skill.manage'],
    ['certify', 'certify', 'skill.release'],
    ['gray', 'gray', 'skill.release'],
    ['publish', 'publish', 'skill.release'],
    ['pause', 'pause', 'skill.release'],
  ] as const) {
    app.post(`/api/v1/skills/suites/:suiteId/${path}`, async (request) => {
      const principal = requirePrincipal(request)
      requireAccess(principal, permission)
      const { suiteId } = skillSuiteIdParamsSchema.parse(request.params)
      const body = versionBodySchema.parse(request.body)
      return advanceSkillSuite(database, principal, { suiteId, ...body, action }, requireIdempotencyKey(request))
    })
  }

  app.post('/api/v1/skills/suites/:suiteId/invoke/:skillVersionId', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'skill.manage')
    const params = skillInvokeParamsSchema.parse(request.params)
    const body = invokeSkillBodySchema.parse(request.body)
    return invokeSkill(database, principal, { ...params, ...body }, requireIdempotencyKey(request))
  })

  app.get('/api/v1/merchant/overview', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.read')
    requireAccess(principal, 'analytics.read')
    const query = merchantOverviewQuerySchema.parse(request.query)
    return getMerchantOperationsOverview(database, principal, query.focusOrderId)
  })

  app.post('/api/v1/merchant/orders/:orderId/confirm', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'order.manage')
    const { orderId } = merchantOrderIdParamsSchema.parse(request.params)
    const body = versionBodySchema.parse(request.body)
    return confirmMerchantOrder(
      database, principal, { orderId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/orders/:orderId/verify', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'order.manage')
    const { orderId } = merchantOrderIdParamsSchema.parse(request.params)
    const body = verifyMerchantOrderBodySchema.parse(request.body)
    return verifyMerchantOrder(
      database, principal, { orderId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/orders/:orderId/approve-refund', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'order.refund')
    const { orderId } = merchantOrderIdParamsSchema.parse(request.params)
    const body = approveRefundBodySchema.parse(request.body)
    return approveMerchantRefund(
      database, principal, { orderId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/merchant/catalog/overview', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.read')
    const query = catalogOverviewQuerySchema.parse(request.query)
    return getMerchantCatalogOverview(database, principal, query.focusSpuId)
  })

  app.post('/api/v1/merchant/catalog/spus', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    return createCatalogSpu(
      database, principal, createCatalogSpuBodySchema.parse(request.body),
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/catalog/spus/:spuId/publish', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    const { spuId } = catalogSpuIdParamsSchema.parse(request.params)
    const body = versionBodySchema.parse(request.body)
    return publishCatalogSpu(
      database, principal, { spuId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/catalog/skus/:skuId/price', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    const { skuId } = catalogSkuIdParamsSchema.parse(request.params)
    const body = changeSkuPriceBodySchema.parse(request.body)
    return changeSkuPrice(
      database, principal, { skuId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/catalog/skus/:skuId/stock', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    const { skuId } = catalogSkuIdParamsSchema.parse(request.params)
    const body = adjustSkuStockBodySchema.parse(request.body)
    return adjustSkuStock(
      database, principal, { skuId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/catalog/slots/:slotId/capacity', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    const { slotId } = catalogSlotIdParamsSchema.parse(request.params)
    const body = updateServiceSlotBodySchema.parse(request.body)
    return updateServiceSlot(
      database, principal, { slotId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/catalog/imports/preview', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    return previewCatalogImport(
      database, principal, previewCatalogImportBodySchema.parse(request.body),
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/catalog/imports/:importId/apply', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    const { importId } = catalogImportIdParamsSchema.parse(request.params)
    const body = applyCatalogImportBodySchema.parse(request.body)
    return applyCatalogImport(
      database, principal, { importId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/merchant/members/overview', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.read')
    const query = memberOverviewQuerySchema.parse(request.query)
    return getMerchantMemberOverview(database, principal, query.focusMemberId)
  })

  app.post('/api/v1/merchant/members/:memberId/tags', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    const { memberId } = memberIdParamsSchema.parse(request.params)
    const body = updateMemberTagsBodySchema.parse(request.body)
    return updateMemberTags(
      database, principal, { memberId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/members/:memberId/benefits', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    const { memberId } = memberIdParamsSchema.parse(request.params)
    const body = grantMemberBenefitBodySchema.parse(request.body)
    return grantMemberBenefit(
      database, principal, { memberId, ...body }, requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/merchant/members/recall-tasks', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'merchant.write')
    return createMemberRecallTask(
      database, principal, createMemberRecallBodySchema.parse(request.body),
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/consumer/home', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.home.read')
    return getConsumerHomeOverview(database, principal)
  })

  app.post('/api/v1/consumer/context', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.context.manage')
    return updateConsumerContext(
      database,
      principal,
      consumerContextBodySchema.parse(request.body),
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/consumer/messages', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.message.read')
    return getConsumerMessages(
      database,
      principal,
      consumerMessageQuerySchema.parse(request.query),
    )
  })

  app.post('/api/v1/consumer/messages/:messageId/read', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.message.manage')
    const { messageId } = consumerMessageParamsSchema.parse(request.params)
    const body = consumerMessageReadBodySchema.parse(request.body)
    return markConsumerMessageRead(
      database,
      principal,
      { messageId, ...body },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/search', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.search')
    return executeConsumerSearch(
      database,
      principal,
      consumerSearchBodySchema.parse(request.body),
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/nearby', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.nearby.read')
    return getConsumerNearbyOverview(
      database,
      principal,
      consumerNearbyBodySchema.parse(request.body),
    )
  })

  app.get('/api/v1/consumer/stores/:storeId', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.store.read')
    const { storeId } = consumerStoreParamsSchema.parse(request.params)
    return getConsumerStoreDetail(database, principal, storeId)
  })

  app.post('/api/v1/consumer/stores/:storeId/offers/:offerId/drafts', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.deal.manage')
    const { storeId, offerId } = consumerDealDraftParamsSchema.parse(request.params)
    return createConsumerDealDraft(
      database,
      principal,
      { storeId, offerId, ...consumerDealDraftBodySchema.parse(request.body) },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/deal-drafts/:draftId/confirm', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.deal.manage')
    const { draftId } = consumerDealConfirmParamsSchema.parse(request.params)
    return confirmConsumerDealDraft(
      database,
      principal,
      { draftId, ...consumerDealConfirmBodySchema.parse(request.body) },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/deal-drafts/:draftId/cancel', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.deal.manage')
    const { draftId } = consumerDealConfirmParamsSchema.parse(request.params)
    return cancelConsumerDeal(
      database,
      principal,
      { draftId, ...consumerDealAftercareBodySchema.parse(request.body) },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/deal-drafts/:draftId/refunds', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.deal.manage')
    const { draftId } = consumerDealConfirmParamsSchema.parse(request.params)
    return requestConsumerDealRefund(
      database,
      principal,
      { draftId, ...consumerDealAftercareBodySchema.parse(request.body) },
      requireIdempotencyKey(request),
    )
  })

  app.get('/api/v1/consumer/assistant', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.assistant.read')
    return getConsumerAssistantOverview(database, principal)
  })

  app.post('/api/v1/consumer/assistant/messages', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.assistant.manage')
    return sendConsumerAssistantMessage(
      database,
      principal,
      consumerAssistantMessageBodySchema.parse(request.body),
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/assistant/voice-inputs', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.voice.manage')
    const headers = consumerVoiceUploadHeadersSchema.parse(request.headers)
    let fileName: string
    try {
      fileName = decodeURIComponent(headers['x-file-name'])
    } catch {
      throw new DomainError(400, 'consumer_voice_file_name_invalid', '语音文件名编码无效')
    }
    if (!Buffer.isBuffer(request.body)) {
      throw new DomainError(400, 'consumer_voice_body_required', '语音上传必须包含二进制音频')
    }
    return uploadConsumerVoiceInput(
      database,
      principal,
      {
        fileName,
        mimeType: headers['x-mime-type'],
        durationMs: headers['x-duration-ms'],
        cityId: headers['x-city-id'],
        householdMemberId: headers['x-household-member-id'],
        content: request.body,
      },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/assistant/voice-inputs/:voiceInputId/confirm', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.voice.manage')
    const { voiceInputId } = consumerVoiceParamsSchema.parse(request.params)
    return confirmConsumerVoiceTranscript(
      database,
      principal,
      {
        voiceInputId,
        ...consumerVoiceConfirmBodySchema.parse(request.body),
      },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/assistant/image-inputs', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.image.manage')
    const headers = consumerImageUploadHeadersSchema.parse(request.headers)
    let fileName: string
    try {
      fileName = decodeURIComponent(headers['x-file-name'])
    } catch {
      throw new DomainError(400, 'consumer_image_file_name_invalid', '图片文件名编码无效')
    }
    if (!Buffer.isBuffer(request.body)) {
      throw new DomainError(400, 'consumer_image_body_required', '图片上传必须包含二进制内容')
    }
    return uploadConsumerImageInput(
      database,
      principal,
      {
        fileName,
        mimeType: headers['x-mime-type'],
        cityId: headers['x-city-id'],
        householdMemberId: headers['x-household-member-id'],
        content: request.body,
      },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/assistant/image-inputs/:imageInputId/confirm', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.image.manage')
    const { imageInputId } = consumerImageParamsSchema.parse(request.params)
    return confirmConsumerImageDescription(
      database,
      principal,
      {
        imageInputId,
        ...consumerImageConfirmBodySchema.parse(request.body),
      },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/reservations/:draftId/confirm', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.reservation.confirm')
    const { draftId } = consumerReservationParamsSchema.parse(request.params)
    return confirmConsumerReservation(
      database,
      principal,
      {
        draftId,
        ...consumerReservationConfirmBodySchema.parse(request.body),
      },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/reservations/:draftId/update', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.reservation.manage')
    const { draftId } = consumerReservationParamsSchema.parse(request.params)
    return updateConsumerReservationDraft(
      database,
      principal,
      {
        draftId,
        ...consumerReservationUpdateBodySchema.parse(request.body),
      },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/reservations/:draftId/cancel', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.reservation.manage')
    const { draftId } = consumerReservationParamsSchema.parse(request.params)
    return cancelConsumerReservation(
      database,
      principal,
      {
        draftId,
        ...consumerReservationCancelBodySchema.parse(request.body),
      },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/reservations/:draftId/payment/prepare', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.payment.manage')
    const { draftId } = consumerReservationParamsSchema.parse(request.params)
    return prepareConsumerReservationPayment(
      database,
      principal,
      { draftId, ...consumerPaymentPrepareBodySchema.parse(request.body) },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/consumer/reservations/:draftId/refund', async (request) => {
    const principal = requirePrincipal(request)
    requireAccess(principal, 'consumer.payment.manage')
    const { draftId } = consumerReservationParamsSchema.parse(request.params)
    return requestConsumerReservationRefund(
      database,
      principal,
      { draftId, ...consumerRefundRequestBodySchema.parse(request.body) },
      requireIdempotencyKey(request),
    )
  })

  app.post('/api/v1/payment-connectors/wechat/callback', async (request) => {
    const signature = request.headers['x-payment-signature']
    if (typeof signature !== 'string' || !signature) {
      throw new DomainError(401, 'payment_callback_signature_required', '缺少支付连接器回调签名')
    }
    return applyConsumerPaymentCallback(
      database,
      paymentConnectorCallbackBodySchema.parse(request.body),
      signature,
    )
  })

  app.post('/api/v1/payment-connectors/wechat/deals/callback', async (request) => {
    const signature = request.headers['x-payment-signature']
    if (typeof signature !== 'string' || !signature) {
      throw new DomainError(401, 'payment_callback_signature_required', '缺少支付连接器回调签名')
    }
    return applyConsumerDealPaymentCallback(
      database,
      consumerDealPaymentConnectorCallbackBodySchema.parse(request.body),
      signature,
    )
  })

  app.post('/api/v1/speech-connectors/transcription/callback', async (request) => {
    const signature = request.headers['x-speech-signature']
    if (typeof signature !== 'string' || !signature) {
      throw new DomainError(401, 'speech_callback_signature_required', '缺少转写连接器回调签名')
    }
    return applySpeechTranscriptionCallback(
      database,
      speechConnectorCallbackBodySchema.parse(request.body),
      signature,
    )
  })

  app.post('/api/v1/image-connectors/recognition/callback', async (request) => {
    const signature = request.headers['x-image-signature']
    if (typeof signature !== 'string' || !signature) {
      throw new DomainError(401, 'image_callback_signature_required', '缺少图片识别连接器回调签名')
    }
    return applyImageRecognitionCallback(
      database,
      imageRecognitionCallbackBodySchema.parse(request.body),
      signature,
    )
  })

  app.get('/api/v1/experience', async (request) => {
    requireAccess(requirePrincipal(request), 'merchant.read')
    return getSnapshot(database)
  })

  app.post('/api/v1/experience/advance', async (request) => {
    requireAccess(requirePrincipal(request), 'workflow.execute')
    const idempotencyKey = requireIdempotencyKey(request)
    const body = advanceBodySchema.parse(request.body)
    return advanceExperience(database, body, idempotencyKey)
  })

  app.post('/api/v1/experience/reset', async (request) => {
    requireAccess(requirePrincipal(request), 'demo.reset')
    const idempotencyKey = requireIdempotencyKey(request)
    return resetExperience(database, idempotencyKey)
  })

  app.setNotFoundHandler((request, reply) => {
    sendProblem(request, reply, 404, 'route_not_found', '请求的 API 路由不存在')
  })

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof DomainError) {
      sendProblem(request, reply, error.status, error.code, error.message)
      return
    }
    if (error instanceof AccessDeniedError) {
      sendProblem(request, reply, 403, error.code, error.message)
      return
    }
    if (error instanceof z.ZodError) {
      sendProblem(
        request,
        reply,
        400,
        'validation_failed',
        error.issues.map((issue) => issue.message).join('；'),
      )
      return
    }

    request.log.error(error)
    sendProblem(request, reply, 500, 'internal_error', '服务暂时不可用，请稍后重试')
  })

  let slaScheduler: ReturnType<typeof setInterval> | undefined
  let initialSlaScan: ReturnType<typeof setTimeout> | undefined
  if (process.env.NODE_ENV !== 'test' && process.env.SLA_SCHEDULER_ENABLED !== 'false') {
    const schedulerPrincipal: Principal = {
      subject: 'user-demo-hq',
      displayName: 'SLA 自动升级调度器',
      tenantId: 'tenant-lequ',
      roles: ['HQ_SUPER_ADMIN'],
      dataScope: 'PLATFORM',
      cityIds: [],
      merchantIds: [],
      storeIds: [],
    }
    const scan = () => {
      try {
        runProviderSlaScan(database, schedulerPrincipal)
      } catch (error) {
        app.log.error(error, 'SLA automatic escalation scan failed')
      }
    }
    initialSlaScan = setTimeout(scan, 1_000)
    initialSlaScan.unref()
    slaScheduler = setInterval(scan, PROVIDER_SLA_SCAN_INTERVAL_SECONDS * 1_000)
    slaScheduler.unref()
  }

  let renewalScheduler: ReturnType<typeof setInterval> | undefined
  let initialRenewalScan: ReturnType<typeof setTimeout> | undefined
  if (process.env.NODE_ENV !== 'test' && process.env.RENEWAL_SCHEDULER_ENABLED !== 'false') {
    const schedulerPrincipal: Principal = {
      subject: 'user-demo-hq',
      displayName: '续费经营自动调度器',
      tenantId: 'tenant-lequ',
      roles: ['HQ_SUPER_ADMIN'],
      dataScope: 'PLATFORM',
      cityIds: [],
      merchantIds: [],
      storeIds: [],
    }
    const scan = () => {
      try {
        runProviderRenewalScan(database, schedulerPrincipal)
      } catch (error) {
        app.log.error(error, 'Provider renewal reminder scan failed')
      }
    }
    initialRenewalScan = setTimeout(scan, 1_500)
    initialRenewalScan.unref()
    renewalScheduler = setInterval(scan, PROVIDER_RENEWAL_SCAN_INTERVAL_SECONDS * 1_000)
    renewalScheduler.unref()
  }

  let consumerDealExpiryScheduler: ReturnType<typeof setInterval> | undefined
  let initialConsumerDealExpiryScan: ReturnType<typeof setTimeout> | undefined
  if (
    process.env.NODE_ENV !== 'test'
    && process.env.CONSUMER_DEAL_EXPIRY_SCHEDULER_ENABLED !== 'false'
  ) {
    const scan = () => {
      try {
        releaseExpiredConsumerDealCheckouts(database)
      } catch (error) {
        app.log.error(error, 'Consumer deal expiry scan failed')
      }
    }
    initialConsumerDealExpiryScan = setTimeout(scan, 2_000)
    initialConsumerDealExpiryScan.unref()
    consumerDealExpiryScheduler = setInterval(
      scan,
      CONSUMER_DEAL_EXPIRY_SCAN_INTERVAL_SECONDS * 1_000,
    )
    consumerDealExpiryScheduler.unref()
  }

  app.addHook('onClose', async () => {
    if (initialSlaScan) clearTimeout(initialSlaScan)
    if (slaScheduler) clearInterval(slaScheduler)
    if (initialRenewalScan) clearTimeout(initialRenewalScan)
    if (renewalScheduler) clearInterval(renewalScheduler)
    if (initialConsumerDealExpiryScan) clearTimeout(initialConsumerDealExpiryScan)
    if (consumerDealExpiryScheduler) clearInterval(consumerDealExpiryScheduler)
    database.close()
  })

  return app
}
