export type AppRole = 'sales' | 'provider' | 'consumer' | 'merchant' | 'hq'

export type ProductApp = 'consumer' | 'merchant' | 'sales' | 'provider' | 'hq'

export type SystemRole =
  | 'HQ_SUPER_ADMIN'
  | 'HQ_OPERATOR'
  | 'AI_POLICY_ADMIN'
  | 'CITY_PROVIDER_ADMIN'
  | 'CITY_MANAGER'
  | 'CITY_SALES'
  | 'CITY_DELIVERY'
  | 'MERCHANT_OWNER'
  | 'STORE_MANAGER'
  | 'STORE_CLERK'
  | 'FINANCE'
  | 'CONSUMER'

export type DataScope =
  | 'PLATFORM'
  | 'CITY'
  | 'OWNED_MERCHANTS'
  | 'MERCHANT'
  | 'STORE'
  | 'SELF'

export interface AuthSession {
  subject: string
  displayName: string
  tenantId: string
  roles: SystemRole[]
  dataScope: DataScope
  cityIds: string[]
  merchantIds: string[]
  storeIds: string[]
  expiresAt: string
}

export type LeadStage =
  | 'NEW'
  | 'DIAGNOSED'
  | 'CONTRACT_DRAFT'
  | 'SIGNED'
  | 'ASSET_REVIEW'
  | 'READY_FOR_DELIVERY'
  | 'LOST'

export interface LeadActivitySummary {
  id: string
  sequence: number
  type: string
  summary: string
  createdAt: string
}

export interface OnboardingLeadSummary {
  id: string
  name: string
  category: string
  source: string
  contactName: string
  contactPhoneMasked: string
  address: string
  ownerId: string
  stage: LeadStage
  protectionExpiresAt: string
  disputeStatus: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED'
  healthScore: number | null
  lossReason: string | null
  nextAction: string
  nextActionAt: string
  version: number
}

export interface DiagnosisReportSummary {
  id: string
  leadId: string
  score: number
  grade: string
  findings: Array<{ code: string; title: string; severity: 'HIGH' | 'MEDIUM' | 'LOW'; evidence: string }>
  proposal: { title: string; priorities: string[]; expectedDays: number }
  modelVersion: string
  generatedAt: string
}

export interface ContractSummary {
  id: string
  leadId: string
  packageCode: string
  billingCycle: 'MONTH' | 'YEAR'
  listPriceFen: number
  discountBps: number
  finalPriceFen: number
  discountStatus: 'AUTO_APPROVED' | 'PENDING' | 'APPROVED' | 'REJECTED'
  status: 'DRAFT' | 'SIGNED' | 'VOID'
  contractVersion: string
  authorizationCount: number
  signedAt: string | null
  version: number
}

export interface OnboardingAssetSummary {
  id: string
  leadId: string
  assetType: 'BUSINESS_LICENSE' | 'STOREFRONT' | 'MENU'
  fileName: string
  confidence: number
  extracted: Record<string, unknown>
  corrected: Record<string, unknown> | null
  status: 'NEEDS_REVIEW' | 'CONFIRMED'
  source: 'DEMO_CAPTURE' | 'USER_UPLOAD'
  byteSize: number | null
  sha256: string | null
  version: number
}

export interface LeadCollaboratorSummary {
  id: string
  userId: string
  displayName: string
  role: 'CO_OWNER' | 'DELIVERY_PARTNER' | 'OBSERVER'
  createdAt: string
}

export interface OnboardingOverview {
  counts: {
    total: number
    protected: number
    pendingAction: number
    readyForDelivery: number
    lost: number
  }
  leads: OnboardingLeadSummary[]
  focusLead: OnboardingLeadSummary | null
  diagnosis: DiagnosisReportSummary | null
  contract: ContractSummary | null
  assets: OnboardingAssetSummary[]
  collaborators: LeadCollaboratorSummary[]
  activities: LeadActivitySummary[]
  updatedAt: string
}

export interface ProviderPackageSummary {
  code: 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN'
  name: string
  tagline: string
  listPriceFen: number
  billingCycle: 'YEAR'
  recommended: boolean
  capabilities: string[]
  policyVersion: string
}

export interface ProviderSalespersonSummary {
  userId: string
  displayName: string
  activeLeadCount: number
  diagnosedLeadCount: number
  signedLeadCount: number
  capacity: number
  loadRate: number
  availability: 'AVAILABLE' | 'BALANCED' | 'FULL'
}

export interface ProviderLeadAssignmentEventSummary {
  id: string
  sequence: number
  previousOwnerId: string
  previousOwnerName: string
  targetOwnerId: string
  targetOwnerName: string
  actorName: string
  reason: string
  createdAt: string
}

export interface ProviderLocalGrowthLeadSummary {
  lead: OnboardingLeadSummary
  ownerDisplayName: string
  diagnosis: DiagnosisReportSummary | null
  contract: ContractSummary | null
  authorizationLabels: string[]
  assignmentCount: number
  urgency: 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'CLOSED'
}

export interface ProviderLocalGrowthOverview {
  city: {
    id: string
    name: string
  }
  metrics: {
    totalLeads: number
    awaitingDiagnosis: number
    awaitingContract: number
    signed: number
    readyForDelivery: number
    overdue: number
  }
  leads: ProviderLocalGrowthLeadSummary[]
  focusLead: ProviderLocalGrowthLeadSummary | null
  salespeople: ProviderSalespersonSummary[]
  packages: ProviderPackageSummary[]
  assignmentEvents: ProviderLeadAssignmentEventSummary[]
  policy: {
    assignmentRuleVersion: string
    packageRuleVersion: string
    cityScopeEnforced: true
    strongConfirmationRequired: true
  }
  permissions: {
    canAssign: boolean
    canDiagnose: boolean
    canCreateContract: boolean
    canApproveDiscount: boolean
  }
  updatedAt: string
}

export type ProviderDeliveryStage =
  | 'WAITING_CAPTURE'
  | 'CAPTURING'
  | 'MINIAPP_GENERATING'
  | 'MERCHANT_CONFIRMATION'
  | 'REVIEWING'
  | 'LIVE'
  | 'GEO_SERVICING'
  | 'SKILL_GENERATING'
  | 'DELIVERED'

export interface ProviderDeliveryStageDefinition {
  key: ProviderDeliveryStage
  index: number
  label: string
  shortLabel: string
  description: string
  targetHours: number
}

export interface ProviderDeliveryCaseSummary {
  id: string
  leadId: string
  merchantName: string
  category: string
  stage: ProviderDeliveryStage
  stageIndex: number
  progressRate: number
  owner: {
    userId: string
    displayName: string
  }
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL'
  nextAction: string
  targetDueAt: string
  slaStatus: 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'COMPLETED'
  hoursRemaining: number
  stageStartedAt: string
  stageAgeHours: number
  healthScore: number | null
  projectId: string | null
  geoWorkspaceId: string | null
  skillSuiteId: string | null
  sourceStatuses: {
    lead: LeadStage
    miniapp: MiniAppProjectStatus | null
    geo: GeoWorkspaceStatus | null
    skill: SkillSuiteStatus | null
  }
  version: number
}

export interface ProviderDeliveryEvidenceSummary {
  id: string
  source: 'DELIVERY' | 'ONBOARDING' | 'MINIAPP' | 'GEO' | 'SKILL'
  type: string
  summary: string
  actorName: string
  createdAt: string
}

export interface ProviderDeliveryBoardOverview {
  city: {
    id: string
    name: string
  }
  metrics: {
    total: number
    active: number
    atRisk: number
    overdue: number
    delivered: number
    averageProgressRate: number
    averageCycleHours: number
  }
  stages: Array<ProviderDeliveryStageDefinition & {
    count: number
    cases: ProviderDeliveryCaseSummary[]
  }>
  cases: ProviderDeliveryCaseSummary[]
  focusCase: ProviderDeliveryCaseSummary | null
  evidence: ProviderDeliveryEvidenceSummary[]
  policy: {
    projectionVersion: string
    overallSlaHours: number
    cityScopeEnforced: true
    sourceOfTruth: ['ONBOARDING', 'MINIAPP_FACTORY', 'GEO_OS', 'SKILL_NETWORK']
  }
  permissions: {
    canView: boolean
    canOperateFactory: boolean
    canOperateGeo: boolean
    canOperateSkill: boolean
  }
  updatedAt: string
}

export type ProviderWorkOrderType =
  | 'ASSET_COLLECTION'
  | 'MINIAPP_CONFIGURATION'
  | 'MERCHANT_REVIEW'
  | 'PLATFORM_REVIEW'
  | 'GEO_OPTIMIZATION'
  | 'SKILL_ACTIVATION'
  | 'DELIVERY_ACCEPTANCE'
  | 'OTHER'

export type ProviderWorkOrderStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING_MERCHANT'
  | 'CHANGES_REQUESTED'
  | 'COMPLETED'

export interface ProviderWorkOrderTypeDefinition {
  key: ProviderWorkOrderType
  label: string
  icon: string
  description: string
  defaultHours: number
  confirmationRequired: boolean
  recommendedStage: ProviderDeliveryStage
}

export interface ProviderWorkOrderAttachmentSummary {
  id: string
  category: 'EVIDENCE' | 'DELIVERABLE' | 'MERCHANT_FEEDBACK'
  fileName: string
  mimeType: string
  byteSize: number
  sha256: string
  uploadedBy: string
  createdAt: string
}

export interface ProviderWorkOrderConfirmationSummary {
  id: string
  decision: 'APPROVED' | 'CHANGES_REQUESTED'
  confirmerName: string
  confirmerRole: string
  comment: string
  actorName: string
  workOrderVersion: number
  createdAt: string
}

export interface ProviderWorkOrderEventSummary {
  id: string
  sequence: number
  type:
    | 'CREATED'
    | 'ASSIGNED'
    | 'STARTED'
    | 'ATTACHMENT_ADDED'
    | 'SUBMITTED'
    | 'MERCHANT_APPROVED'
    | 'MERCHANT_CHANGES_REQUESTED'
    | 'RESUMED'
  summary: string
  actorName: string
  createdAt: string
}

export interface ProviderWorkOrderSummary {
  id: string
  caseId: string
  leadId: string
  merchantName: string
  type: ProviderWorkOrderType
  typeLabel: string
  stage: ProviderDeliveryStage
  title: string
  description: string
  status: ProviderWorkOrderStatus
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL'
  owner: {
    userId: string
    displayName: string
  }
  dueAt: string
  slaStatus: 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'COMPLETED'
  hoursRemaining: number
  confirmationRequired: boolean
  attachmentCount: number
  latestConfirmation: ProviderWorkOrderConfirmationSummary | null
  submittedAt: string | null
  completedAt: string | null
  version: number
  createdAt: string
  updatedAt: string
}

export interface ProviderWorkOrderOverview {
  city: {
    id: string
    name: string
  }
  metrics: {
    total: number
    open: number
    inProgress: number
    waitingMerchant: number
    changesRequested: number
    overdue: number
    completed: number
  }
  cases: ProviderDeliveryCaseSummary[]
  workOrders: ProviderWorkOrderSummary[]
  focusWorkOrder: ProviderWorkOrderSummary | null
  attachments: ProviderWorkOrderAttachmentSummary[]
  confirmations: ProviderWorkOrderConfirmationSummary[]
  events: ProviderWorkOrderEventSummary[]
  operators: Array<{
    userId: string
    displayName: string
    role: 'CITY_PROVIDER_ADMIN' | 'CITY_MANAGER' | 'CITY_DELIVERY'
    activeWorkOrderCount: number
  }>
  typeCatalog: ProviderWorkOrderTypeDefinition[]
  policy: {
    ruleVersion: string
    maxAttachmentBytes: number
    allowedMimeTypes: string[]
    merchantConfirmationSnapshot: true
    appendOnlyEvidence: true
  }
  permissions: {
    canManage: boolean
    canConfirm: boolean
    canUpload: boolean
  }
  updatedAt: string
}

export type ProviderSlaLevel = 1 | 2 | 3
export type ProviderSlaIncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'

export interface ProviderSlaIncidentSummary {
  id: string
  workOrder: {
    id: string
    title: string
    typeLabel: string
    status: ProviderWorkOrderStatus
    version: number
  }
  caseId: string
  leadId: string
  merchantName: string
  owner: {
    userId: string
    displayName: string
  }
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL'
  level: ProviderSlaLevel
  status: ProviderSlaIncidentStatus
  dueAt: string
  breachedAt: string
  overdueHours: number
  escalationTarget: string
  responsePlan: string | null
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  resolutionNote: string | null
  version: number
  policyVersion: string
  firstDetectedAt: string
  lastEscalatedAt: string
  updatedAt: string
}

export interface ProviderSlaEventSummary {
  id: string
  sequence: number
  type: 'DETECTED' | 'ESCALATED' | 'ACKNOWLEDGED' | 'RESOLVED'
  level: ProviderSlaLevel
  summary: string
  actorName: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface ProviderSlaOverview {
  city: {
    id: string
    name: string
  }
  metrics: {
    active: number
    unacknowledged: number
    acknowledged: number
    level2OrAbove: number
    level3: number
    resolved: number
    maxOverdueHours: number
  }
  incidents: ProviderSlaIncidentSummary[]
  focusIncident: ProviderSlaIncidentSummary | null
  events: ProviderSlaEventSummary[]
  policy: {
    version: string
    scanIntervalSeconds: number
    tiers: Array<{
      level: ProviderSlaLevel
      afterHours: number
      label: string
      recipients: string[]
      responseExpectation: string
    }>
    notificationDelivery: 'OUTBOX_PENDING_CONNECTOR'
    appendOnlyEvidence: true
  }
  permissions: {
    canAcknowledge: boolean
    canManage: boolean
    canScan: boolean
  }
  lastScanAt: string | null
  updatedAt: string
}

export type ProviderRenewalReminderType = 'DAY_30' | 'DAY_15' | 'DAY_7' | 'DAY_1'
export type ProviderRenewalCaseStatus =
  | 'MONITORING'
  | 'PROPOSAL_READY'
  | 'RENEWED'
  | 'LOST'
export type ProviderRenewalRiskBand =
  | 'HEALTHY'
  | 'WATCH'
  | 'AT_RISK'
  | 'CRITICAL'
  | 'EXPIRED'
export type ProviderRenewalLossReason =
  | 'PRICE'
  | 'LOW_USAGE'
  | 'SERVICE_GAP'
  | 'BUSINESS_CLOSED'
  | 'COMPETITOR'
  | 'CASH_FLOW'
  | 'TIMING'
  | 'OTHER'

export interface ProviderRenewalEvidenceSummary {
  deliveryCompleted: boolean
  completedWorkOrders: number
  geoScore: number | null
  onlineSkills: number
  completedOrders: number
  completedGmvFen: number
  evidence: string[]
  measuredAt: string
}

export interface ProviderRenewalProposalSummary {
  id: string
  version: number
  currentPackageCode: 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN'
  recommendedPackageCode: 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN'
  recommendedPackageName: string
  upgradeRecommended: boolean
  listPriceFen: number
  offerPriceFen: number
  discountBps: number
  recommendation: string
  valueNarrative: string
  evidence: string[]
  policyVersion: string
  createdBy: string
  createdAt: string
}

export interface ProviderRenewalCaseSummary {
  id: string
  leadId: string
  merchantName: string
  cityId: string
  owner: {
    userId: string
    displayName: string
  }
  source: 'SIGNED_CONTRACT' | 'LEGACY_IMPORT'
  sourceContractId: string | null
  currentPackageCode: 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN'
  currentPackageName: string
  currentPriceFen: number
  serviceStartedAt: string
  serviceEndsAt: string
  daysRemaining: number
  riskBand: ProviderRenewalRiskBand
  status: ProviderRenewalCaseStatus
  latestReminder: ProviderRenewalReminderType | null
  proposal: ProviderRenewalProposalSummary | null
  lossReason: ProviderRenewalLossReason | null
  lossDetail: string | null
  recoverable: boolean | null
  recoveryAction: string | null
  renewedPackageCode: 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN' | null
  renewedPriceFen: number | null
  renewedAt: string | null
  commission: {
    ledgerEntryId: string
    rateBps: number
    estimatedFen: number
  } | null
  evidence: ProviderRenewalEvidenceSummary
  version: number
  updatedAt: string
}

export interface ProviderRenewalEventSummary {
  id: string
  sequence: number
  type:
    | 'CASE_CREATED'
    | 'REMINDER_30'
    | 'REMINDER_15'
    | 'REMINDER_7'
    | 'REMINDER_1'
    | 'PROPOSAL_GENERATED'
    | 'RENEWED'
    | 'LOST'
  summary: string
  actorName: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface ProviderRenewalOverview {
  city: {
    id: string
    name: string
  }
  metrics: {
    active: number
    dueWithin30Days: number
    critical: number
    proposalReady: number
    renewed: number
    lost: number
    renewalRate: number
    renewalRevenueFen: number
    estimatedCommissionFen: number
  }
  reminderBuckets: Array<{
    type: ProviderRenewalReminderType
    days: 30 | 15 | 7 | 1
    label: string
    caseCount: number
    meaning: string
  }>
  cases: ProviderRenewalCaseSummary[]
  focusCase: ProviderRenewalCaseSummary | null
  events: ProviderRenewalEventSummary[]
  lossReasons: Array<{
    code: ProviderRenewalLossReason
    label: string
    count: number
  }>
  packages: ProviderPackageSummary[]
  policy: {
    version: string
    proposalVersion: string
    reminderDays: [30, 15, 7, 1]
    notificationDelivery: 'OUTBOX_PENDING_CONNECTOR'
    recommendationGuardrail: string
    appendOnlyEvidence: true
  }
  permissions: {
    canManage: boolean
    canScan: boolean
  }
  lastScanAt: string | null
  updatedAt: string
}

export type ProviderCityMetricPeriod = '30D' | '90D' | '365D'

export interface ProviderCityMetricComparison {
  current: number
  previous: number
  delta: number
  direction: 'UP' | 'DOWN' | 'FLAT'
}

export interface ProviderCityMerchantMetricSummary {
  leadId: string
  merchantName: string
  category: string
  ownerName: string
  packageCode: 'BASIC' | 'PRO' | 'AGENT' | 'CHAIN' | null
  serviceStage: 'DELIVERING' | 'LIVE' | 'SKILL_ONLINE' | 'RENEWAL' | 'LOST'
  healthScore: number | null
  active: boolean
  activityEvidence: string[]
  serviceRevenueFen: number
  transactionGmvFen: number
  renewalStatus: ProviderRenewalCaseStatus | null
  renewalDaysRemaining: number | null
  risk: 'HEALTHY' | 'WATCH' | 'RISK'
  nextAction: string
  lastActivityAt: string
}

export interface ProviderCityMetricsOverview {
  city: {
    id: string
    name: string
  }
  period: {
    key: ProviderCityMetricPeriod
    label: string
    from: string
    to: string
    previousFrom: string
    previousTo: string
    timezone: 'Asia/Shanghai'
  }
  metrics: {
    totalMerchants: number
    activeMerchants: number
    activeMerchantRate: number
    serviceRevenueFen: number
    signingRevenueFen: number
    renewalRevenueFen: number
    renewalRate: number
    renewedCases: number
    closedRenewalCases: number
    averageDeliveryHours: number | null
    deliveredCases: number
    deliveryTargetHours: 168
    skillTradableRate: number
    onlineSkills: number
    totalSkills: number
    transactionGmvFen: number
    transactionOrders: number
    skillGmvShare: number
    voucherAdoptionRate: number
    voucherMerchants: number
    transactingMerchants: number
  }
  comparisons: {
    activeMerchants: ProviderCityMetricComparison
    serviceRevenueFen: ProviderCityMetricComparison
    renewalRate: ProviderCityMetricComparison
    averageDeliveryHours: ProviderCityMetricComparison | null
    transactionGmvFen: ProviderCityMetricComparison
  }
  trends: Array<{
    label: string
    from: string
    to: string
    activeMerchants: number
    serviceRevenueFen: number
    transactionGmvFen: number
    deliveredCases: number
  }>
  categories: Array<{
    category: string
    merchants: number
    activeMerchants: number
    serviceRevenueFen: number
    transactionGmvFen: number
  }>
  merchants: ProviderCityMerchantMetricSummary[]
  focusMerchant: ProviderCityMerchantMetricSummary | null
  insights: Array<{
    id: string
    tone: 'POSITIVE' | 'NOTICE' | 'RISK'
    title: string
    detail: string
    evidence: string
  }>
  methodology: Array<{
    metric: string
    definition: string
    source: string
  }>
  freshness: Array<{
    source: string
    updatedAt: string | null
  }>
  policy: {
    version: 'provider-city-metrics-v1'
    cityScopeEnforced: true
    revenueRecognition: string
    gmvRecognition: string
    noEstimatedRevenue: true
  }
  updatedAt: string
}

export type ProviderSettlementStatus =
  | 'PENDING_INVOICE'
  | 'INVOICE_SUBMITTED'
  | 'READY_FOR_SETTLEMENT'
  | 'SETTLED'

export type ProviderSettlementAdjustmentStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface ProviderSettlementAdjustmentSummary {
  id: string
  direction: 'CREDIT' | 'DEBIT'
  amountFen: number
  status: ProviderSettlementAdjustmentStatus
  reason: string
  evidence: string[]
  requestedBy: string
  requestedAt: string
  decidedBy: string | null
  decisionNote: string | null
  decidedAt: string | null
}

export interface ProviderSettlementInvoiceSummary {
  id: string
  invoiceNo: string
  sellerName: string
  sellerTaxIdMasked: string
  amountFen: number
  issuedAt: string
  status: 'SUBMITTED' | 'VERIFIED' | 'REJECTED'
  submittedBy: string
  submittedAt: string
  decidedBy: string | null
  decisionNote: string | null
  decidedAt: string | null
}

export interface ProviderSettlementLedgerEntrySummary {
  id: string
  sequence: number
  category:
    | 'SUBSCRIPTION_SHARE'
    | 'RENEWAL_SHARE'
    | 'TRANSACTION_SERVICE_SHARE'
    | 'ADJUSTMENT'
  direction: 'CREDIT' | 'DEBIT'
  amountFen: number
  sourceId: string
  sourceLabel: string
  ruleVersion: string
  postedAt: string
}

export interface ProviderSettlementEventSummary {
  id: string
  sequence: number
  type:
    | 'STATEMENT_GENERATED'
    | 'STATEMENT_REFRESHED'
    | 'ADJUSTMENT_REQUESTED'
    | 'ADJUSTMENT_APPROVED'
    | 'ADJUSTMENT_REJECTED'
    | 'INVOICE_SUBMITTED'
    | 'INVOICE_VERIFIED'
    | 'INVOICE_REJECTED'
    | 'SETTLED'
  summary: string
  actorName: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface ProviderSettlementStatementSummary {
  id: string
  cityId: string
  period: string
  status: ProviderSettlementStatus
  currency: 'CNY'
  source: {
    signingRevenueFen: number
    renewalRevenueFen: number
    transactionGmvFen: number
  }
  shares: {
    subscriptionShareFen: number
    renewalShareFen: number
    transactionServiceShareFen: number
    approvedAdjustmentFen: number
    payableFen: number
  }
  adjustments: ProviderSettlementAdjustmentSummary[]
  invoice: ProviderSettlementInvoiceSummary | null
  ledgerEntries: ProviderSettlementLedgerEntrySummary[]
  ruleVersion: string
  version: number
  generatedAt: string
  settledAt: string | null
  updatedAt: string
}

export interface ProviderSettlementOverview {
  city: {
    id: string
    name: string
  }
  metrics: {
    currentReceivableFen: number
    yearToDatePayableFen: number
    yearToDateSettledFen: number
    pendingInvoiceCount: number
    pendingApprovalCount: number
    readyCount: number
    settledCount: number
  }
  rules: {
    version: string
    signingShareBps: number
    renewalShareBps: number
    transactionShareBps: number
    effectiveFrom: string
    formula: string
  }
  statements: ProviderSettlementStatementSummary[]
  focusStatement: ProviderSettlementStatementSummary | null
  events: ProviderSettlementEventSummary[]
  periods: string[]
  permissions: {
    canManage: boolean
    canApprove: boolean
    canSettle: boolean
  }
  policy: {
    version: 'provider-city-settlement-policy-v1'
    appendOnlyLedger: true
    cityScopeEnforced: true
    invoiceAmountMustMatch: true
    adjustmentRequiresHqApproval: true
    settlementEvent: 'settlement.completed.v1'
  }
  updatedAt: string
}

export type ConsumerHouseholdMode = 'SELF' | 'CHILD' | 'ELDER'
export type ConsumerMessageCategory = 'TRANSACTION' | 'SERVICE' | 'FAMILY' | 'SYSTEM'
export type ConsumerSearchResultType = 'MERCHANT' | 'SERVICE' | 'PRODUCT'

export interface ConsumerCitySummary {
  id: string
  name: string
  code: string
  serviceLevel: 'FULL' | 'DISCOVERY'
  available: boolean
  isCurrent: boolean
}

export interface ConsumerHouseholdMemberSummary {
  id: string
  name: string
  relation: string
  mode: ConsumerHouseholdMode
  avatarKey: string
  subtitle: string
  dietaryNotes: string[]
  permissions: string[]
  isCurrent: boolean
}

export interface ConsumerPreparedCardSummary {
  id: string
  kind: 'BENEFIT' | 'FAMILY_TASK' | 'REORDER' | 'SERVICE'
  eyebrow: string
  title: string
  description: string
  dueAt: string | null
  actionLabel: string
  actionTarget: string
  tone: 'MINT' | 'VIOLET' | 'AMBER' | 'CORAL'
}

export interface ConsumerProgressSummary {
  id: string
  type: 'RESERVATION' | 'ORDER' | 'AI_TASK' | 'AFTER_SALE'
  status: string
  title: string
  subtitle: string
  merchantName: string | null
  scheduledAt: string | null
  amountFen: number | null
  actionLabel: string
  actionTarget: string
}

export interface ConsumerRecentServiceSummary {
  id: string
  code: string
  title: string
  icon: string
  lastUsedAt: string
  actionTarget: string
}

export interface ConsumerHomeOverview {
  profile: {
    userId: string
    displayName: string
    phoneMasked: string
    greeting: string
    version: number
  }
  city: ConsumerCitySummary
  cities: ConsumerCitySummary[]
  household: {
    id: string
    name: string
    members: ConsumerHouseholdMemberSummary[]
    activeMember: ConsumerHouseholdMemberSummary
  }
  unreadMessageCount: number
  quickIntents: Array<{
    id: string
    label: string
    prompt: string
    icon: string
    tone: 'MINT' | 'VIOLET' | 'AMBER'
  }>
  prepared: ConsumerPreparedCardSummary[]
  inProgress: ConsumerProgressSummary[]
  recentServices: ConsumerRecentServiceSummary[]
  searchHot: string[]
  policy: {
    version: 'consumer-home-policy-v1'
    selfScopeEnforced: true
    householdContextExplicit: true
    locationOptional: true
    noEstimatedAvailability: true
  }
  updatedAt: string
}

export interface ConsumerMessageSummary {
  id: string
  category: ConsumerMessageCategory
  title: string
  body: string
  actionLabel: string | null
  actionTarget: string | null
  read: boolean
  createdAt: string
  version: number
}

export interface ConsumerMessageOverview {
  unreadCount: number
  categoryCounts: Array<{
    category: ConsumerMessageCategory | 'ALL'
    total: number
    unread: number
  }>
  messages: ConsumerMessageSummary[]
  policy: {
    version: 'consumer-message-policy-v1'
    selfScopeEnforced: true
    contentImmutable: true
    readReceiptAudited: true
  }
  updatedAt: string
}

export interface ConsumerSearchResultSummary {
  id: string
  type: ConsumerSearchResultType
  title: string
  subtitle: string
  merchantName: string
  address: string
  category: string
  priceFen: number | null
  compareAtFen: number | null
  distanceMeters: number
  rating: number
  reviewCount: number
  badges: string[]
  reason: string
  actionTarget: string
}

export interface ConsumerSearchOverview {
  query: string
  normalizedQuery: string
  city: ConsumerCitySummary
  activeMember: ConsumerHouseholdMemberSummary
  resultCount: number
  results: ConsumerSearchResultSummary[]
  typeCounts: Array<{
    type: ConsumerSearchResultType | 'ALL'
    count: number
  }>
  recentQueries: string[]
  suggestedQueries: string[]
  policy: {
    version: 'consumer-search-policy-v1'
    publishedStoresOnly: true
    platformDisplayAuthorizationRequired: true
    activeCatalogOnly: true
    queryPrivateToUser: true
    noPaidRanking: true
  }
  searchedAt: string
}

export type ConsumerNearbyMode = 'LOCATION' | 'CITY_FALLBACK'

export interface ConsumerNearbyStoreSummary {
  id: string
  merchantId: string
  name: string
  category: string
  address: string
  businessHours: string
  rating: number
  reviewCount: number
  badges: string[]
  reason: string
  distanceMeters: number | null
  distanceMethod: 'STRAIGHT_LINE' | null
  coordinates: {
    latitude: number
    longitude: number
    source: string
    confidence: number
    version: number
  } | null
  actionTarget: string
}

export interface ConsumerNearbyOverview {
  city: ConsumerCitySummary
  activeMember: ConsumerHouseholdMemberSummary
  mode: ConsumerNearbyMode
  notice: string
  stores: ConsumerNearbyStoreSummary[]
  map: {
    center: { latitude: number; longitude: number } | null
    points: Array<{
      storeId: string
      name: string
      latitude: number
      longitude: number
      distanceMeters: number | null
    }>
  }
  policy: {
    version: 'consumer-nearby-policy-v1'
    selfScopeEnforced: true
    locationOptional: true
    preciseLocationNotStored: true
    publishedStoresOnly: true
    platformDisplayAuthorizationRequired: true
    straightLineDistanceOnly: true
    noPaidRanking: true
    navigationNotSupported: true
  }
  updatedAt: string
}

export type ConsumerStoreOfferKind = 'GROUP_BUY' | 'RESERVATION'
export type ConsumerDealDraftStatus = 'WAITING_CONFIRMATION' | 'CONFIRMED' | 'EXPIRED'

export interface ConsumerStoreReservationSlotSummary {
  id: string
  weekday: number
  startTime: string
  endTime: string
  remainingCapacity: number
  priceFen: number
  priceOverrideFen: number | null
  version: number
}

export interface ConsumerStoreOfferSummary {
  id: string
  spuId: string
  kind: ConsumerStoreOfferKind
  title: string
  skuName: string
  category: string
  description: string
  attributes: Record<string, string>
  priceFen: number
  compareAtFen: number | null
  stockStatus: 'AVAILABLE' | 'LOW_STOCK' | 'SOLD_OUT'
  stockRemaining: number | null
  validFrom: string
  validUntil: string
  usableWeekdays: number[]
  dailyUsableTime: string
  refundRule: string
  redemptionRule: string
  reservationSlots: ConsumerStoreReservationSlotSummary[]
  canCreateDraft: boolean
  actionTarget: string
  version: number
}

export interface ConsumerDealDraftSummary {
  id: string
  status: ConsumerDealDraftStatus
  version: number
  kind: ConsumerStoreOfferKind
  storeId: string
  storeName: string
  offerId: string
  title: string
  skuName: string
  quantity: number
  serviceAt: string | null
  unitPriceFen: number
  totalAmountFen: number
  pricingRuleVersion: string
  offerVersion: number
  orderId: string | null
  orderStatus: MerchantOrderStatus | null
  paymentStatus:
    | 'NOT_REQUIRED'
    | 'PENDING_PROVIDER'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'LATE_SUCCEEDED'
  refundStatus: 'NONE' | 'REQUESTED' | 'APPROVED_PENDING_PROVIDER' | 'REFUNDED' | 'FAILED'
  holdStatus: 'NONE' | 'HELD' | 'CONSUMED' | 'RELEASED' | 'FULFILLED'
  verificationStatus: 'NOT_ISSUED' | 'ISSUED' | 'REDEEMED' | 'REVOKED' | 'EXPIRED'
  verificationCode: string | null
  verificationCodeMasked: string | null
  canConfirm: boolean
  canCancel: boolean
  canRequestRefund: boolean
  expiresAt: string
  confirmationNotice: string
  createdAt: string
  updatedAt: string
}

export interface ConsumerDealActionReceipt {
  accepted: true
  draftId: string
  orderId: string | null
  status: ConsumerDealDraftStatus
  paymentStatus: ConsumerDealDraftSummary['paymentStatus']
  refundStatus: ConsumerDealDraftSummary['refundStatus']
  holdStatus: ConsumerDealDraftSummary['holdStatus']
  version: number
}

export interface ConsumerDealConnectorCallbackReceipt {
  accepted: true
  replayed: boolean
  applied: boolean
  outcome:
    | 'PAYMENT_SUCCEEDED'
    | 'PAYMENT_FAILED'
    | 'LATE_PAYMENT_COMPENSATION_STARTED'
    | 'REFUND_SUCCEEDED'
    | 'REFUND_FAILED'
  intentId: string
  orderId: string
  paymentStatus: ConsumerDealDraftSummary['paymentStatus']
  refundStatus: ConsumerDealDraftSummary['refundStatus']
}

export interface ConsumerStoreDetailOverview {
  context: {
    cityId: string
    householdMemberId: string
  }
  store: {
    id: string
    merchantId: string
    name: string
    category: string
    cityId: string
    cityName: string
    address: string
    businessHours: string
    rating: number
    reviewCount: number
    badges: string[]
    tags: string[]
    recommendationReason: string
    coordinates: {
      latitude: number
      longitude: number
      source: string
      confidence: number
    } | null
  }
  offers: ConsumerStoreOfferSummary[]
  latestDraft: ConsumerDealDraftSummary | null
  policy: {
    version: 'consumer-store-detail-policy-v1'
    selfScopeEnforced: true
    publishedStoreRequired: true
    platformDisplayAuthorizationRequired: true
    activeCatalogRequired: true
    livePriceAndStockRequired: true
    explicitConfirmationRequired: true
    draftDoesNotCreateOrder: true
    draftDoesNotCharge: true
  }
  updatedAt: string
}

export type ConsumerAssistantRole = 'USER' | 'ASSISTANT'
export type ConsumerReservationDraftStatus = 'WAITING_CONFIRMATION' | 'CONFIRMED'

export type ConsumerPaymentStatus =
  | 'NOT_STARTED'
  | 'PENDING_PROVIDER'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUND_REQUESTED'
  | 'REFUNDED'

export interface ConsumerPaymentSummary {
  intentId: string | null
  provider: 'WECHAT_PAY'
  currency: 'CNY'
  status: ConsumerPaymentStatus
  version: number | null
  totalAmountFen: number
  paidAmountFen: number
  refundAmountFen: number
  canPrepare: boolean
  canRequestRefund: boolean
  liveConnectorAvailable: false
  disclosure: string
}

export interface ConsumerAssistantMessageSummary {
  id: string
  role: ConsumerAssistantRole
  content: string
  createdAt: string
}

export interface ConsumerAssistantRecommendationSummary {
  storeId: string
  merchantId: string
  merchantName: string
  category: string
  distanceMeters: number
  reason: string
  priceFen: number | null
  address: string
  actionTarget: string
  reservationSupported: boolean
}

export type ConsumerVoiceInputStatus =
  | 'PENDING_TRANSCRIPTION'
  | 'READY_FOR_CONFIRMATION'
  | 'CONFIRMED'
  | 'DISPATCHED'
  | 'FAILED'

export interface ConsumerVoiceInputSummary {
  id: string
  status: ConsumerVoiceInputStatus
  version: number
  fileName: string
  mimeType: string
  byteSize: number
  durationMs: number
  transcript: string | null
  confidence: number | null
  failureCode: string | null
  canConfirm: boolean
  canSend: boolean
  liveConnectorAvailable: false
  disclosure: string
  createdAt: string
  updatedAt: string
}

export type ConsumerImageInputStatus =
  | 'PENDING_RECOGNITION'
  | 'READY_FOR_CONFIRMATION'
  | 'CONFIRMED'
  | 'DISPATCHED'
  | 'FAILED'

export interface ConsumerImageInputSummary {
  id: string
  status: ConsumerImageInputStatus
  version: number
  fileName: string
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  byteSize: number
  width: number
  height: number
  category: 'MENU' | 'PRODUCT' | 'RECEIPT' | 'ENVIRONMENT' | 'OTHER' | null
  description: string | null
  confidence: number | null
  containsSensitiveData: boolean | null
  failureCode: string | null
  canConfirm: boolean
  canSend: boolean
  liveConnectorAvailable: false
  disclosure: string
  createdAt: string
  updatedAt: string
}

export interface ConsumerReservationDraftSummary {
  id: string
  status: ConsumerReservationDraftStatus
  version: number
  storeId: string
  merchantId: string
  merchantName: string
  itemSummary: string
  partySize: number
  reservationAt: string
  customerName: string
  customerPhoneMasked: string
  amountFen: number
  orderId: string | null
  orderStatus: MerchantOrderStatus | null
  payment: ConsumerPaymentSummary
  canEdit: boolean
  canCancel: boolean
  merchantReply: string | null
  confirmationNotice: string
  createdAt: string
  updatedAt: string
}

export interface ConsumerAssistantOverview {
  session: {
    id: string
    version: number
    city: ConsumerCitySummary
    activeMember: ConsumerHouseholdMemberSummary
  } | null
  messages: ConsumerAssistantMessageSummary[]
  recommendations: ConsumerAssistantRecommendationSummary[]
  voiceInput: ConsumerVoiceInputSummary | null
  imageInput: ConsumerImageInputSummary | null
  reservationDraft: ConsumerReservationDraftSummary | null
  policy: {
    version: 'consumer-assistant-policy-v1'
    modelVersion: 'consumer-intent-local-v1'
    textOnly: false
    voiceInputEnabled: true
    liveTranscriptionConnectorAvailable: false
    transcriptionCallbackSignatureRequired: true
    explicitTranscriptConfirmationRequired: true
    rawAudioDeletedAfterCallback: true
    imageInputEnabled: true
    liveImageRecognitionConnectorAvailable: false
    imageRecognitionCallbackSignatureRequired: true
    explicitImageDescriptionConfirmationRequired: true
    rawImageDeletedAfterCallback: true
    imageMagicAndDimensionValidation: true
    maximumRecommendations: 3
    selfScopeEnforced: true
    publishedStoresOnly: true
    explicitConfirmationRequiredForReservation: true
    draftEditableBeforeSubmission: true
    merchantConfirmationReceipt: true
    zeroPaymentCancellationBeforeService: true
    paymentConnectorBoundary: true
    livePaymentConnectorAvailable: false
    providerCallbackSignatureRequired: true
    refundRequiresMerchantApproval: true
  }
  updatedAt: string
}

export type SalesTaskKind =
  | 'FOLLOW_UP'
  | 'DIAGNOSIS'
  | 'CONTRACT'
  | 'ASSET'
  | 'HANDOFF'
  | 'REMINDER'

export type SalesTaskPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export type SalesTaskStatus = 'PENDING' | 'SNOOZED' | 'DONE' | 'SUPERSEDED'

export interface SalesTaskSummary {
  id: string
  leadId: string
  leadName: string
  title: string
  kind: SalesTaskKind
  priority: SalesTaskPriority
  status: SalesTaskStatus
  dueAt: string
  reminderAt: string
  source: 'LEAD_NEXT_ACTION' | 'MANUAL'
  completionNote: string | null
  completedAt: string | null
  version: number
}

export interface SalesOpportunitySummary {
  lead: OnboardingLeadSummary
  taskId: string | null
  priority: SalesTaskPriority
  opportunityScore: number
  overdueHours: number
  signals: string[]
  recommendedPlay: string
}

export interface SalesNextBestActionSummary {
  id: string
  leadId: string
  leadName: string
  title: string
  rationale: string[]
  guardrail: string
  priority: SalesTaskPriority
  recommendationScore: number
  policyVersion: string
  modelVersion: string
}

export interface SalesTaskEventSummary {
  id: string
  taskId: string
  leadId: string
  type: 'CREATED' | 'COMPLETED' | 'SNOOZED' | 'SUPERSEDED'
  summary: string
  occurredAt: string
}

export interface SalesWorkbenchOverview {
  metrics: {
    dueToday: number
    overdue: number
    completedToday: number
    activeLeads: number
    protectedLeads: number
    monthlySignedRevenueFen: number
    expectedCommissionFen: number
  }
  tasks: SalesTaskSummary[]
  focusOpportunities: SalesOpportunitySummary[]
  nextBestActions: SalesNextBestActionSummary[]
  recentEvents: SalesTaskEventSummary[]
  taskRuleVersion: string
  recommendationPolicyVersion: string
  recommendationModelVersion: string
  updatedAt: string
}

export type SalesCrmTimingFilter = 'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING'

export interface SalesLeadLocationSummary {
  latitude: number
  longitude: number
  district: string
  geocodeSource: 'MANUAL' | 'LOCAL_REFERENCE' | 'PROVIDER'
  confidence: number
  version: number
}

export interface SalesCrmLeadSummary {
  lead: OnboardingLeadSummary
  ownerDisplayName: string
  location: SalesLeadLocationSummary | null
  followUpCount: number
  activityCount: number
  lastFollowUpAt: string | null
  isOverdue: boolean
  protectionDaysRemaining: number
}

export interface SalesCrmMapPoint {
  leadId: string
  name: string
  category: string
  stage: LeadStage
  latitude: number
  longitude: number
  district: string
  isOverdue: boolean
  nextAction: string
}

export interface SalesCrmOverview {
  metrics: {
    total: number
    filtered: number
    overdue: number
    protected: number
    disputed: number
    located: number
  }
  leads: SalesCrmLeadSummary[]
  map: {
    center: { latitude: number; longitude: number }
    points: SalesCrmMapPoint[]
  }
  filters: {
    sources: string[]
    stages: LeadStage[]
  }
  query: {
    keyword: string
    stage: LeadStage | null
    source: string | null
    timing: SalesCrmTimingFilter
  }
  updatedAt: string
}

export type LeadOwnershipDecision = 'APPROVE' | 'REJECT'
export type LeadTransferRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED'

export interface LeadOwnershipActorSummary {
  userId: string
  displayName: string
  roles: SystemRole[]
}

export interface LeadTransferRequestSummary {
  id: string
  leadId: string
  requestedBy: LeadOwnershipActorSummary
  currentOwner: LeadOwnershipActorSummary
  targetOwner: LeadOwnershipActorSummary
  reason: string
  evidence: string[]
  status: LeadTransferRequestStatus
  decisionBy: LeadOwnershipActorSummary | null
  decisionNote: string | null
  decidedAt: string | null
  leadVersionAtRequest: number
  version: number
  createdAt: string
}

export interface LeadOwnershipAppealSummary {
  id: string
  leadId: string
  applicant: LeadOwnershipActorSummary
  reason: string
  evidence: string[]
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  decisionBy: LeadOwnershipActorSummary | null
  decisionNote: string | null
  createdAt: string
  decidedAt: string | null
}

export interface LeadOwnershipEventSummary {
  id: string
  sequence: number
  leadId: string
  requestId: string | null
  type:
    | 'TRANSFER_REQUESTED'
    | 'TRANSFER_APPROVED'
    | 'TRANSFER_REJECTED'
    | 'APPEAL_SUBMITTED'
    | 'APPEAL_APPROVED'
    | 'APPEAL_REJECTED'
  actor: LeadOwnershipActorSummary
  summary: string
  createdAt: string
}

export interface SalesOwnershipOverview {
  lead: OnboardingLeadSummary
  owner: LeadOwnershipActorSummary
  protection: {
    status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'DISPUTED'
    startedAt: string
    expiresAt: string
    daysRemaining: number
    policyVersion: string
    transferFrozen: boolean
  }
  collaborators: LeadCollaboratorSummary[]
  appeals: LeadOwnershipAppealSummary[]
  transferRequests: LeadTransferRequestSummary[]
  candidates: LeadOwnershipActorSummary[]
  collaborationCandidates: LeadOwnershipActorSummary[]
  events: LeadOwnershipEventSummary[]
  permissions: {
    canRequestTransfer: boolean
    canSubmitAppeal: boolean
    canManageOwnership: boolean
    canAddCollaborator: boolean
  }
  updatedAt: string
}

export type SalesPerformanceCategory = 'SIGNING' | 'RENEWAL' | 'TRANSACTION_SHARE'
export type SalesCommissionLedgerEntryKind = 'RECOGNITION' | 'SETTLEMENT' | 'REVERSAL'

export interface SalesPerformanceActorSummary {
  userId: string
  displayName: string
  roles: SystemRole[]
}

export interface SalesTargetSummary {
  id: string
  salesperson: SalesPerformanceActorSummary
  period: string
  signingTargetFen: number
  renewalTargetFen: number
  transactionTargetFen: number
  totalTargetFen: number
  version: number
  reason: string
  setBy: SalesPerformanceActorSummary
  createdAt: string
}

export interface SalesPerformanceCategorySummary {
  category: SalesPerformanceCategory
  performanceFen: number
  targetFen: number
  achievementRate: number
  estimatedCommissionFen: number
  settledCommissionFen: number
  reversalFen: number
}

export interface SalesCommissionLedgerEntrySummary {
  id: string
  sequence: number
  salesperson: SalesPerformanceActorSummary
  leadId: string | null
  leadName: string | null
  category: SalesPerformanceCategory
  kind: SalesCommissionLedgerEntryKind
  sourceId: string
  sourceLabel: string
  originalEntryId: string | null
  performanceDeltaFen: number
  estimatedCommissionDeltaFen: number
  settledCommissionDeltaFen: number
  ruleVersion: string
  ruleExplanation: string[]
  reason: string
  evidence: string[]
  occurredAt: string
  createdAt: string
}

export interface SalesTeamMemberPerformanceSummary {
  salesperson: SalesPerformanceActorSummary
  performanceFen: number
  targetFen: number
  achievementRate: number
  estimatedCommissionFen: number
  settledCommissionFen: number
  reversalFen: number
  targetVersion: number
}

export interface SalesPerformanceOverview {
  period: string
  availablePeriods: string[]
  viewMode: 'INDIVIDUAL' | 'TEAM'
  viewer: SalesPerformanceActorSummary
  focusSalesperson: SalesPerformanceActorSummary | null
  metrics: {
    performanceFen: number
    targetFen: number
    achievementRate: number
    estimatedCommissionFen: number
    settledCommissionFen: number
    reversalFen: number
    recognizedCount: number
  }
  target: SalesTargetSummary | null
  categories: SalesPerformanceCategorySummary[]
  team: SalesTeamMemberPerformanceSummary[]
  ledger: SalesCommissionLedgerEntrySummary[]
  policy: {
    currency: 'CNY'
    amountUnit: 'FEN'
    targetRuleVersion: string
    settlementRuleVersion: string
    immutableLedger: true
    guardrail: string
  }
  permissions: {
    canManageTarget: boolean
    canSettleCommission: boolean
    canReverseCommission: boolean
  }
  updatedAt: string
}

export type SalesCareerLevel =
  | 'ASSOCIATE'
  | 'CONSULTANT'
  | 'SENIOR'
  | 'EXPERT'
  | 'TEAM_LEAD'

export type SalesPerformanceRating =
  | 'OUTSTANDING'
  | 'EXCEEDS'
  | 'MEETS'
  | 'DEVELOPING'
  | 'ATTENTION'

export type SalesCapabilityKey =
  | 'DISCOVERY'
  | 'DIAGNOSIS'
  | 'PROPOSAL'
  | 'NEGOTIATION'
  | 'COMPLIANCE'

export interface SalesCapabilitySummary {
  key: SalesCapabilityKey
  label: string
  score: number
  delta: number
}

export interface SalesTeamUnitSummary {
  id: string
  parentId: string | null
  kind: 'CITY' | 'SQUAD'
  name: string
  leader: SalesPerformanceActorSummary | null
  activeMemberCount: number
  childUnitIds: string[]
}

export interface SalesCoachingPlanSummary {
  id: string
  memberId: string
  coach: SalesPerformanceActorSummary
  title: string
  focusCapability: SalesCapabilityKey
  goal: string
  actions: string[]
  successMetric: string
  dueAt: string
  nextSessionAt: string | null
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
  version: number
  latestNote: string | null
  evidence: string[]
  createdAt: string
  updatedAt: string
}

export interface SalesLevelChangeSummary {
  requestId: string
  memberId: string
  fromLevel: SalesCareerLevel
  toLevel: SalesCareerLevel
  direction: 'PROMOTION' | 'DEMOTION'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reason: string
  evidence: string[]
  metricsSnapshot: Record<string, number | string | boolean>
  requestedBy: SalesPerformanceActorSummary
  requestedAt: string
  decidedBy: SalesPerformanceActorSummary | null
  decisionReason: string | null
  decidedAt: string | null
}

export interface SalesTeamMemberSummary {
  id: string
  salesperson: SalesPerformanceActorSummary
  teamUnitId: string
  teamUnitName: string
  level: SalesCareerLevel
  employmentStatus: 'ACTIVE' | 'PROBATION' | 'LEAVE'
  mentor: SalesPerformanceActorSummary | null
  joinedAt: string
  version: number
  performance: {
    performanceFen: number
    targetFen: number
    achievementRate: number
    overallScore: number
    rating: SalesPerformanceRating
    rank: number
    resultScore: number
    pipelineScore: number
    processScore: number
    qualityScore: number
    complianceScore: number
  }
  capabilities: SalesCapabilitySummary[]
  career: {
    nextLevel: SalesCareerLevel | null
    eligible: boolean
    recommendedAction: 'PROMOTION' | 'DEVELOPMENT' | 'MAINTAIN'
    evidence: string[]
  }
  activeCoachingPlanCount: number
  nextCoachingAt: string | null
}

export interface SalesTeamOverview {
  period: string
  city: { id: string; name: string }
  viewer: SalesPerformanceActorSummary
  viewMode: 'PERSONAL' | 'TEAM'
  focusMember: SalesTeamMemberSummary | null
  units: SalesTeamUnitSummary[]
  members: SalesTeamMemberSummary[]
  levelChanges: SalesLevelChangeSummary[]
  coachingPlans: SalesCoachingPlanSummary[]
  metrics: {
    activeMembers: number
    averageScore: number
    targetAchievementRate: number
    activeCoachingPlans: number
    pendingLevelChanges: number
  }
  rankingPolicy: {
    version: string
    formula: string
    tieBreaker: string
    complianceGuardrail: string
  }
  permissions: {
    canViewTeamDetail: boolean
    canManageCoaching: boolean
    canRequestLevelChange: boolean
    canApproveLevelChange: boolean
  }
  updatedAt: string
}

export type SalesAiArtifactKind =
  | 'PRE_VISIT_BRIEF'
  | 'TALK_TRACK'
  | 'MEETING_SUMMARY'
  | 'NEXT_ACTION'
  | 'PROPOSAL'

export type SalesAiObjectionType =
  | 'PRICE'
  | 'ROI'
  | 'TIMING'
  | 'AUTHORITY'
  | 'COMPETITOR'

export interface SalesAiEvidenceSummary {
  label: string
  value: string
  sourceType: 'CRM' | 'DIAGNOSIS' | 'FOLLOW_UP' | 'CONTRACT' | 'POLICY'
  sourceId: string
  observedAt: string
}

export interface SalesAiArtifactSection {
  key: string
  title: string
  items: string[]
}

export interface SalesAiArtifactSummary {
  id: string
  artifactKey: string
  leadId: string
  kind: SalesAiArtifactKind
  revision: number
  status: 'DRAFT' | 'CONFIRMED'
  title: string
  summary: string
  sections: SalesAiArtifactSection[]
  evidence: SalesAiEvidenceSummary[]
  guardrails: string[]
  modelVersion: string
  promptVersion: string
  policyVersion: string
  generatedBy: SalesPerformanceActorSummary
  confirmedBy: SalesPerformanceActorSummary | null
  confirmedAt: string | null
  createdAt: string
}

export interface SalesAiRoleplayEvaluation {
  overallScore: number
  empathyScore: number
  evidenceScore: number
  complianceScore: number
  nextStepScore: number
  strengths: string[]
  improvements: string[]
}

export interface SalesAiRoleplayTurnSummary {
  id: string
  sequence: number
  actor: 'CUSTOMER' | 'SALES' | 'COACH'
  content: string
  evaluation: SalesAiRoleplayEvaluation | null
  createdAt: string
}

export interface SalesAiRoleplaySessionSummary {
  id: string
  leadId: string
  objectionType: SalesAiObjectionType
  scenario: string
  status: 'ACTIVE' | 'COMPLETED'
  modelVersion: string
  promptVersion: string
  policyVersion: string
  turns: SalesAiRoleplayTurnSummary[]
  latestEvaluation: SalesAiRoleplayEvaluation | null
  createdAt: string
  updatedAt: string
}

export interface SalesAiLeadContextSummary {
  id: string
  name: string
  category: string
  contactName: string
  stage: LeadStage
  nextAction: string
  nextActionAt: string
  version: number
  healthScore: number | null
  recentFacts: string[]
}

export interface SalesAiCopilotOverview {
  focusLead: SalesAiLeadContextSummary
  availableLeads: SalesAiLeadContextSummary[]
  artifacts: SalesAiArtifactSummary[]
  roleplaySessions: SalesAiRoleplaySessionSummary[]
  metrics: {
    evidenceCount: number
    draftCount: number
    confirmedCount: number
    roleplayCount: number
  }
  recommendation: {
    title: string
    rationale: string[]
    suggestedAt: string
    source: 'RULE_AND_MODEL'
  }
  substrate: {
    provider: string
    modelVersion: string
    policyVersion: string
    evidenceRequired: true
    humanConfirmationRequired: true
    externalActionAllowed: false
  }
  permissions: {
    canGenerate: boolean
    canConfirm: boolean
    canWriteCrmAfterConfirmation: boolean
  }
  updatedAt: string
}

export type MiniAppProjectStatus =
  | 'DRAFT'
  | 'GENERATED'
  | 'PREVIEW'
  | 'MERCHANT_APPROVAL'
  | 'REVIEW'
  | 'GRAY'
  | 'LIVE'
  | 'ARCHIVED'

export interface MiniAppTemplateSummary {
  code: 'DINING_AURORA' | 'CAFE_EDITORIAL' | 'RETAIL_GALLERY'
  name: string
  industry: string
  description: string
  accent: string
  blocks: string[]
}

export interface MiniAppPageVersionSummary {
  id: string
  version: number
  status: 'GENERATED' | 'PREVIEW' | 'APPROVED' | 'REVIEW' | 'GRAY' | 'LIVE' | 'ROLLED_BACK'
  templateCode: MiniAppTemplateSummary['code']
  schema: {
    page: string
    blocks: Array<{ id: string; type: string; enabled: boolean; order: number }>
  }
  content: Record<string, unknown>
  theme: { primary: string; accent: string; radius: number }
  previewPath: string
  merchantApprovedBy: string | null
  merchantApprovedAt: string | null
  publishedAt: string | null
  createdAt: string
}

export interface MiniAppProjectSummary {
  id: string
  leadId: string
  merchantName: string
  deliveryType: 'MERCHANT_PAGE' | 'STANDARD_MINIAPP' | 'CHAIN_ENTERPRISE'
  status: MiniAppProjectStatus
  templateCode: MiniAppTemplateSummary['code']
  currentDraftVersion: number
  currentReleaseVersion: number | null
  nextAction: string
  slaDueAt: string
  version: number
  updatedAt: string
}

export interface MiniAppFactoryEventSummary {
  id: string
  sequence: number
  type: string
  summary: string
  createdAt: string
}

export interface MiniAppFactoryOverview {
  counts: {
    total: number
    awaitingMerchant: number
    inReview: number
    live: number
    slaRisk: number
  }
  eligibleLeads: OnboardingLeadSummary[]
  projects: MiniAppProjectSummary[]
  focusProject: MiniAppProjectSummary | null
  currentVersion: MiniAppPageVersionSummary | null
  versions: MiniAppPageVersionSummary[]
  templates: MiniAppTemplateSummary[]
  events: MiniAppFactoryEventSummary[]
  updatedAt: string
}

export type GeoWorkspaceStatus =
  | 'PENDING'
  | 'SCANNING'
  | 'ISSUE_FOUND'
  | 'FIX_PROPOSED'
  | 'MERCHANT_APPROVAL'
  | 'PUBLISHED'
  | 'MONITORING'

export interface GeoDimensionScore {
  key: string
  label: string
  score: number
  maxScore: number
  delta: number
  status: 'EXCELLENT' | 'GOOD' | 'ATTENTION'
}

export interface GeoIdentitySummary {
  brandName: string
  storeName: string
  canonicalPoiId: string
  aliases: string[]
  address: string
  coordinates: { latitude: number; longitude: number }
  matchStatus: 'MATCHED' | 'NEEDS_REVIEW'
  source: string
  confidence: number
  version: number
}

export interface GeoFactSummary {
  id: string
  fieldKey: string
  fieldLabel: string
  value: string
  sourceType: string
  sourceRef: string
  confidence: number
  verificationStatus: 'VERIFIED' | 'INFERRED' | 'NEEDS_REVIEW'
  version: number
}

export interface GeoChannelFieldSummary {
  channel: 'MERCHANT_PROFILE' | 'MINIAPP' | 'MAP_A' | 'MAP_B'
  value: string
  status: 'CONSISTENT' | 'DIFF' | 'MISSING'
}

export interface GeoChannelComparisonSummary {
  fieldKey: string
  fieldLabel: string
  canonicalValue: string
  channels: GeoChannelFieldSummary[]
  consistencyRate: number
}

export interface GeoIssueSummary {
  id: string
  dimensionKey: string
  code: string
  title: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  channel: string
  fieldKey: string
  currentValue: string
  recommendedValue: string
  status: 'OPEN' | 'FIX_PROPOSED' | 'APPROVED' | 'PUBLISHED' | 'DISMISSED'
}

export interface GeoContentPlanSummary {
  id: string
  version: number
  questionTerms: string[]
  scenarioTerms: string[]
  items: Array<{ title: string; format: string; channel: string; evidenceFactKeys: string[] }>
  status: 'GENERATED' | 'APPROVED' | 'PUBLISHED'
  modelVersion: string
  approvedBy: string | null
  approvedAt: string | null
  createdAt: string
}

export interface GeoObservationSummary {
  date: string
  channel: string
  mentions: number
  visits: number
  inquiries: number
  orders: number
  attributionModel: string
}

export interface GeoWorkspaceSummary {
  id: string
  projectId: string
  leadId: string
  merchantName: string
  status: GeoWorkspaceStatus
  score: number | null
  previousScore: number | null
  scanVersion: number
  nextAction: string
  complianceNotice: string
  version: number
  updatedAt: string
}

export interface GeoEventSummary {
  id: string
  sequence: number
  type: string
  summary: string
  createdAt: string
}

export interface GeoOverview {
  counts: {
    total: number
    scanning: number
    issues: number
    awaitingMerchant: number
    monitoring: number
  }
  eligibleProjects: MiniAppProjectSummary[]
  workspaces: GeoWorkspaceSummary[]
  focusWorkspace: GeoWorkspaceSummary | null
  dimensions: GeoDimensionScore[]
  identity: GeoIdentitySummary | null
  facts: GeoFactSummary[]
  channelComparisons: GeoChannelComparisonSummary[]
  issues: GeoIssueSummary[]
  contentPlan: GeoContentPlanSummary | null
  observations: GeoObservationSummary[]
  cityBenchmark: { cityName: string; merchantPercentile: number; cityAverage: number; industryAverage: number }
  events: GeoEventSummary[]
  updatedAt: string
}

export type SkillSuiteStatus =
  | 'DRAFT'
  | 'GENERATED'
  | 'TESTED'
  | 'CERT_PENDING'
  | 'CERTIFIED'
  | 'GRAY'
  | 'ONLINE'
  | 'PAUSED'

export type SkillNetworkVersionStatus =
  | 'GENERATED'
  | 'TESTED'
  | 'CERT_PENDING'
  | 'CERTIFIED'
  | 'GRAY'
  | 'ONLINE'
  | 'PAUSED'
  | 'DEPRECATED'

export interface SkillManifestSummary {
  skillId: string
  version: string
  tenantId: string
  merchantId: string
  storeId: string
  name: 'get_menu' | 'find_table' | 'reserve_table'
  description: string
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  scopes: string[]
  riskLevel: RiskLevel
  approvalRequired: boolean
  timeoutMs: number
  retryMax: number
  idempotencyRequired: boolean
  slaMs: number
  adapter: string
}

export interface SkillNetworkVersionSummary {
  id: string
  skillId: string
  name: SkillManifestSummary['name']
  version: string
  status: SkillNetworkVersionStatus
  maturity: 'L1' | 'L2' | 'L3' | 'L4'
  manifest: SkillManifestSummary
  schemaHash: string
  certifiedBy: string | null
  certifiedAt: string | null
  publishedAt: string | null
  createdAt: string
}

export interface SkillTestRunSummary {
  id: string
  skillVersionId: string
  testType: 'INPUT_SCHEMA' | 'OUTPUT_SCHEMA' | 'ADAPTER_CONTRACT' | 'RISK_POLICY'
  status: 'PASSED' | 'FAILED'
  latencyMs: number
  assertionCount: number
  detail: string
  createdAt: string
}

export interface SkillInvocationSummary {
  id: string
  skillVersionId: string
  skillName: SkillManifestSummary['name']
  intent: string
  approvalConfirmed: boolean
  status: 'SUCCEEDED' | 'FAILED' | 'TIMED_OUT'
  attemptCount: number
  latencyMs: number
  resultValid: boolean
  result: Record<string, unknown>
  createdAt: string
}

export interface SkillSuiteSummary {
  id: string
  geoWorkspaceId: string
  leadId: string
  merchantName: string
  status: SkillSuiteStatus
  nextAction: string
  version: number
  updatedAt: string
}

export interface SkillNetworkOverview {
  counts: { total: number; pendingTest: number; certification: number; online: number }
  eligibleGeoWorkspaces: GeoWorkspaceSummary[]
  suites: SkillSuiteSummary[]
  focusSuite: SkillSuiteSummary | null
  skills: SkillNetworkVersionSummary[]
  tests: SkillTestRunSummary[]
  invocations: SkillInvocationSummary[]
  metrics: { successRate: number; p95LatencyMs: number; availability: number; complaintRate: number; refundRate: number }
  events: GeoEventSummary[]
  updatedAt: string
}

export type MerchantOrderType = 'RESERVATION' | 'GROUP_BUY' | 'ECOMMERCE'

export type MerchantOrderChannel = 'MINIAPP' | 'SKILL' | 'POS' | 'MARKETPLACE'

export type MerchantOrderStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'READY_FOR_SERVICE'
  | 'VERIFIED'
  | 'COMPLETED'
  | 'REFUND_REQUESTED'
  | 'REFUNDED'
  | 'CANCELLED'
  | 'EXCEPTION'

export interface MerchantStoreSummary {
  id: string
  merchantId: string
  name: string
  cityName: string
  address: string
  businessHours: string
  operatingStatus: 'OPEN' | 'CLOSED' | 'PAUSED'
  managerName: string
}

export interface MerchantOrderSummary {
  id: string
  orderNo: string
  type: MerchantOrderType
  channel: MerchantOrderChannel
  status: MerchantOrderStatus
  customerName: string
  customerPhoneMasked: string
  itemSummary: string
  partySize: number | null
  serviceAt: string | null
  grossAmountFen: number
  discountFen: number
  paidAmountFen: number
  refundAmountFen: number
  consumerDealPaymentStatus:
    | 'NOT_APPLICABLE'
    | 'NOT_REQUIRED'
    | 'PENDING_PROVIDER'
    | 'SUCCEEDED'
    | 'FAILED'
    | 'CANCELLED'
    | 'LATE_SUCCEEDED'
  consumerDealRefundStatus:
    | 'NOT_APPLICABLE'
    | 'NONE'
    | 'REQUESTED'
    | 'APPROVED_PENDING_PROVIDER'
    | 'REFUNDED'
    | 'FAILED'
  merchantConfirmationAllowed: boolean
  verificationCodeMasked: string | null
  verificationStatus: 'NOT_APPLICABLE' | 'NOT_ISSUED' | 'ISSUED' | 'REDEEMED' | 'REVOKED' | 'EXPIRED'
  exceptionCode: string | null
  version: number
  placedAt: string
  updatedAt: string
}

export interface MerchantTodoSummary {
  id: string
  kind: 'ORDER_CONFIRMATION' | 'ORDER_VERIFICATION' | 'REFUND_APPROVAL' | 'ORDER_EXCEPTION'
  title: string
  detail: string
  urgency: 'HIGH' | 'MEDIUM' | 'LOW'
  orderId: string
  action: 'CONFIRM' | 'VERIFY' | 'APPROVE_REFUND' | 'VIEW'
}

export interface MerchantAiRecommendationSummary {
  id: string
  priority: number
  title: string
  rationale: string
  expectedImpact: string
  evidence: string[]
  actionLabel: string
  actionTarget: 'ORDERS' | 'ANALYTICS' | 'CATALOG'
  riskLevel: RiskLevel
  modelVersion: string
}

export interface MerchantAnalyticsSummary {
  revenueTrend: Array<{ date: string; revenueFen: number; orderCount: number }>
  channelMix: Array<{ channel: MerchantOrderChannel; revenueFen: number; orderCount: number; share: number }>
  hourlyRevenue: Array<{ hour: string; revenueFen: number }>
  funnel: {
    visitors: number
    orderCount: number
    verifiedCount: number
    conversionRate: number
    verificationRate: number
  }
}

export interface MerchantOperationsOverview {
  businessDate: string
  store: MerchantStoreSummary
  headline: {
    status: 'EXCELLENT' | 'GOOD' | 'ATTENTION'
    title: string
    narrative: string
  }
  metrics: {
    revenueFen: number
    revenueDeltaBps: number
    orderCount: number
    newMemberCount: number
    verificationRate: number
    aiHealthScore: number
  }
  recommendations: MerchantAiRecommendationSummary[]
  todos: MerchantTodoSummary[]
  exceptions: MerchantTodoSummary[]
  orders: MerchantOrderSummary[]
  focusOrder: MerchantOrderSummary | null
  analytics: MerchantAnalyticsSummary
  updatedAt: string
}

export type MerchantSpuType = 'PRODUCT' | 'SERVICE' | 'PACKAGE'
export type MerchantSpuStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED'
export type MerchantStockMode = 'FINITE' | 'UNLIMITED' | 'SLOT'

export interface MerchantSkuSummary {
  id: string
  spuId: string
  code: string
  name: string
  attributes: Record<string, string>
  priceFen: number
  compareAtFen: number | null
  costFen: number | null
  stockMode: MerchantStockMode
  stockQuantity: number
  lowStockThreshold: number
  status: 'ACTIVE' | 'OUT_OF_STOCK' | 'PAUSED'
  pricingRuleVersion: string
  version: number
  updatedAt: string
}

export interface MerchantServiceSlotSummary {
  id: string
  skuId: string
  weekday: number
  startTime: string
  endTime: string
  capacity: number
  reserved: number
  priceOverrideFen: number | null
  status: 'ACTIVE' | 'PAUSED'
  version: number
}

export interface MerchantSpuSummary {
  id: string
  catalogId: string
  type: MerchantSpuType
  name: string
  category: string
  description: string
  status: MerchantSpuStatus
  mediaCompletion: number
  sortOrder: number
  version: number
  skus: MerchantSkuSummary[]
  slots: MerchantServiceSlotSummary[]
  updatedAt: string
}

export interface MerchantCatalogImportSummary {
  id: string
  fileName: string
  status: 'PREVIEWED' | 'APPLIED' | 'FAILED'
  totalRows: number
  acceptedRows: number
  errors: Array<{ row: number; field: string; message: string }>
  version: number
  createdAt: string
  appliedAt: string | null
}

export interface MerchantCatalogOverview {
  catalog: {
    id: string
    storeId: string
    name: string
    status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
    version: number
  }
  metrics: {
    activeSpus: number
    activeSkus: number
    lowStockSkus: number
    slotUtilization: number
    averageMediaCompletion: number
  }
  spus: MerchantSpuSummary[]
  focusSpu: MerchantSpuSummary | null
  imports: MerchantCatalogImportSummary[]
  updatedAt: string
}

export type MerchantMemberSegment = 'NEW' | 'ACTIVE' | 'DORMANT' | 'HIGH_VALUE'
export type MerchantMemberRisk = 'LOW' | 'MEDIUM' | 'HIGH'
export type MerchantBenefitStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED'

export interface MerchantMemberSummary {
  id: string
  storeId: string
  displayName: string
  phoneMasked: string
  segment: MerchantMemberSegment
  tags: string[]
  orderCount: number
  lifetimeValueFen: number
  averageTicketFen: number
  repurchaseProbability: number
  churnRisk: MerchantMemberRisk
  predictionReasons: string[]
  marketingConsent: boolean
  joinedAt: string
  lastVisitAt: string | null
  version: number
}

export interface MerchantMemberTimelineItem {
  id: string
  memberId: string
  type: 'JOINED' | 'ORDER' | 'VISIT' | 'TAG_CHANGED' | 'BENEFIT_GRANTED' | 'RECALL_SCHEDULED'
  title: string
  detail: string
  amountFen: number | null
  source: string
  occurredAt: string
}

export interface MerchantMemberBenefitSummary {
  id: string
  memberId: string
  kind: 'COUPON' | 'LEVEL' | 'EXPERIENCE'
  title: string
  valueFen: number
  status: MerchantBenefitStatus
  ruleVersion: string
  expiresAt: string
  grantedAt: string
}

export interface MerchantRecallTaskSummary {
  id: string
  storeId: string
  name: string
  channel: 'WECHAT' | 'SMS'
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED'
  audienceCount: number
  excludedNoConsentCount: number
  memberIds: string[]
  content: string
  reason: string
  segmentRuleVersion: string
  predictionModelVersion: string
  approvalConfirmed: boolean
  scheduledAt: string
  createdAt: string
  version: number
}

export interface MerchantMemberOverview {
  store: {
    id: string
    name: string
  }
  metrics: {
    totalMembers: number
    newMembers: number
    activeMembers: number
    dormantMembers: number
    highValueMembers: number
    consentedMembers: number
    averageRepurchaseProbability: number
    atRiskValueFen: number
  }
  segmentRuleVersion: string
  predictionModelVersion: string
  members: MerchantMemberSummary[]
  focusMember: MerchantMemberSummary | null
  timeline: MerchantMemberTimelineItem[]
  benefits: MerchantMemberBenefitSummary[]
  recallTasks: MerchantRecallTaskSummary[]
  updatedAt: string
}

export type MerchantState =
  | 'UNSTARTED'
  | 'LEAD'
  | 'DIAGNOSED'
  | 'AUTHORIZED'
  | 'ONBOARDING'
  | 'MINIAPP_PREVIEW'
  | 'MINIAPP_LIVE'
  | 'GEO_ACTIVE'
  | 'SKILL_ACTIVE'
  | 'TRANSACTION_ACTIVE'

export type RiskLevel = 'L0' | 'L1' | 'L2' | 'L3'

export interface JourneyStep {
  readonly index: number
  readonly key: string
  readonly title: string
  readonly shortTitle: string
  readonly description: string
  readonly role: AppRole
  readonly actionLabel: string
  readonly riskLevel: RiskLevel
}

export const JOURNEY_STEPS: readonly JourneyStep[] = [
  { index: 1, key: 'lead.create', title: '录入餐厅线索', shortTitle: '线索', description: '建立商家主数据与销售归属', role: 'sales', actionLabel: '保存并建立线索', riskLevel: 'L0' },
  { index: 2, key: 'diagnosis.run', title: '运行 AI 商家体检', shortTitle: 'AI 体检', description: '生成数字完整度和优化建议', role: 'sales', actionLabel: '开始 AI 体检', riskLevel: 'L0' },
  { index: 3, key: 'contract.authorize', title: '签约并完成分层授权', shortTitle: '签约授权', description: '六类授权独立留痕，不捆绑开通', role: 'sales', actionLabel: '确认签约与授权', riskLevel: 'L2' },
  { index: 4, key: 'profile.capture', title: '识别执照、门头与菜单', shortTitle: '资料识别', description: 'OCR 结果进入待确认知识资产', role: 'provider', actionLabel: '完成资料识别', riskLevel: 'L1' },
  { index: 5, key: 'miniapp.preview', title: '生成商家小程序预览', shortTitle: '生成预览', description: '配置驱动，不创建门店代码分支', role: 'provider', actionLabel: '生成小程序预览', riskLevel: 'L1' },
  { index: 6, key: 'miniapp.approve', title: '商家确认预览版本', shortTitle: '商家确认', description: '保存确认人、版本与内容快照', role: 'provider', actionLabel: '记录商家确认', riskLevel: 'L2' },
  { index: 7, key: 'geo.scan', title: '完成 GEO 扫描', shortTitle: 'GEO 扫描', description: '按冻结权重计算机器可读健康分', role: 'provider', actionLabel: '运行 GEO 扫描', riskLevel: 'L0' },
  { index: 8, key: 'skills.generate', title: '生成并认证商家 Skill', shortTitle: 'Skill 上线', description: '菜单、查桌与订座能力完成测试', role: 'provider', actionLabel: '生成并测试 Skill', riskLevel: 'L2' },
  { index: 9, key: 'reservation.draft', title: 'AI 创建订座草稿', shortTitle: '订座草稿', description: '只创建草稿，不替用户做交易决定', role: 'consumer', actionLabel: '让 AI 生成订座方案', riskLevel: 'L2' },
  { index: 10, key: 'reservation.confirm', title: '用户确认订座', shortTitle: '用户确认', description: '确认人数、时间、门店和联系人', role: 'consumer', actionLabel: '确认订座并发送商家', riskLevel: 'L2' },
  { index: 11, key: 'reservation.receive', title: '经营宝接收预约', shortTitle: '商家接单', description: '预约进入经营宝今日待办', role: 'merchant', actionLabel: '确认已收到预约', riskLevel: 'L1' },
  { index: 12, key: 'audit.review', title: 'HQ 复核全链路', shortTitle: 'HQ 审计', description: '核对授权、状态、风险与事件证据', role: 'hq', actionLabel: '完成 HQ 审计', riskLevel: 'L1' }
] as const

export interface MerchantSummary {
  id: string
  name: string
  category: string
  city: string
  address: string
  contactName: string
  state: MerchantState
  healthScore: number | null
  geoScore: number | null
  profileCompletion: number
}

export interface MiniAppSummary {
  version: string
  status: 'PREVIEW' | 'LIVE'
  template: string
  previewPath: string
  approvedAt: string | null
}

export interface SkillSummary {
  id: string
  name: 'get_menu' | 'find_table' | 'reserve_table'
  version: string
  status: 'CERTIFIED' | 'ONLINE'
  successRate: number
  riskLevel: RiskLevel
}

export interface ReservationSummary {
  id: string
  status: 'WAITING_CONFIRM' | 'FULFILLING' | 'MERCHANT_RECEIVED'
  storeName: string
  partySize: number
  reservationAt: string
  customerName: string
  note: string
  merchantSeenAt: string | null
}

export interface ConsentSummary {
  scope: string
  label: string
  grantedAt: string
}

export interface AuditSummary {
  id: string
  sequence: number
  actorRole: AppRole | 'system' | 'merchant-owner'
  action: string
  entityType: string
  riskLevel: RiskLevel
  result: 'SUCCESS' | 'APPROVED'
  summary: string
  createdAt: string
}

export interface ExperienceSnapshot {
  runId: string
  completedSteps: number
  totalSteps: number
  completionRate: number
  nextStep: JourneyStep | null
  merchant: MerchantSummary | null
  miniApp: MiniAppSummary | null
  skills: SkillSummary[]
  reservation: ReservationSummary | null
  consents: ConsentSummary[]
  audits: AuditSummary[]
  metrics: {
    auditCoverage: number
    eventCount: number
    idempotencyReplays: number
  }
  updatedAt: string
}

export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail: string
  traceId: string
}
