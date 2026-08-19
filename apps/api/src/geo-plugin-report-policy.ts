import { createHash } from 'node:crypto';
import { z } from 'zod';

export const GeoCanonicalPayloadSchema = z.object({
  merchantName: z.string().trim().min(1),
  brandName: z.string().trim().min(1),
  storeName: z.string().trim().min(1),
  address: z.string().trim().min(1),
  longitude: z.number().min(-180).max(180),
  latitude: z.number().min(-90).max(90),
  phone: z.string().trim().min(5),
  businessHours: z.string().trim().min(1),
  categories: z.array(z.string().trim().min(1)).min(1),
  description: z.string().trim().min(10),
  imageUrls: z.array(z.string().url()).min(1),
  miniProgramUrl: z.string().url(),
  lequLifeUrl: z.string().url().optional(),
  merchantConfirmed: z.literal(true),
});

const forbiddenPromisePatterns = [
  /保证.{0,8}(收录|排名|流量|成交)/u,
  /排名.{0,4}(第一|首位)/u,
  /(一定|必然).{0,6}(收录|有流量|成交)/u,
  /所有平台.{0,6}自动发布/u,
];

export function assertGeoCopyIsCompliant(value: unknown): void {
  const text = JSON.stringify(value);
  if (forbiddenPromisePatterns.some((pattern) => pattern.test(text))) {
    throw new GeoPolicyError('GEO_PROMISE_PROHIBITED');
  }
}

export function validateGeoProfile(value: unknown) {
  assertGeoCopyIsCompliant(value);
  const result = GeoCanonicalPayloadSchema.safeParse(value);
  if (!result.success) {
    throw new GeoPolicyError(
      'GEO_PROFILE_INVALID',
      result.error.issues.map((issue) => issue.path.join('.')),
    );
  }
  return { payload: result.data, completenessScore: 100 };
}

export const PluginManifestSchema = z.object({
  pluginId: z.string().min(1),
  publisher: z.literal('乐趣宝'),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  permissions: z.array(z.string().min(1)).min(1),
  allowedDomains: z.array(z.string().min(1)).default([]),
  fee: z.object({ unit: z.string().min(1), amountCents: z.number().int().nonnegative() }),
  uninstallImpact: z.string().min(1),
  dataDeletionScopes: z.array(z.string().min(1)),
  timeoutSeconds: z.number().int().min(1).max(60),
  maxRetries: z.number().int().min(0).max(5),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export function permissionFingerprint(manifest: PluginManifest): string {
  return createHash('sha256')
    .update(JSON.stringify([...manifest.permissions].sort()))
    .digest('hex');
}

export function assertPluginInstall(input: {
  manifest: unknown;
  acceptedPermissions: string[];
  responsibleOwnerConfirmed: boolean;
}) {
  const manifest = PluginManifestSchema.parse(input.manifest);
  const accepted = [...new Set(input.acceptedPermissions)].sort();
  if (!input.responsibleOwnerConfirmed) throw new PluginPolicyError('OWNER_CONFIRMATION_REQUIRED');
  if (accepted.join('\0') !== [...manifest.permissions].sort().join('\0'))
    throw new PluginPolicyError('PERMISSION_ACCEPTANCE_MISMATCH');
  return { manifest, permissionFingerprint: permissionFingerprint(manifest) };
}

export function assertPluginCall(input: {
  manifest: PluginManifest;
  grantedPermissions: string[];
  requiredPermission: string;
  requestedUrl?: string;
  circuitStatus: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}) {
  if (input.circuitStatus === 'OPEN') throw new PluginPolicyError('PLUGIN_CIRCUIT_OPEN');
  if (!input.grantedPermissions.includes(input.requiredPermission))
    throw new PluginPolicyError('PLUGIN_PERMISSION_DENIED');
  if (input.requestedUrl) {
    const url = new URL(input.requestedUrl);
    if (url.protocol !== 'https:' || !input.manifest.allowedDomains.includes(url.hostname))
      throw new PluginPolicyError('PLUGIN_EGRESS_DENIED');
  }
}

export function requiresPluginReauthorization(current: PluginManifest, next: PluginManifest) {
  const oldPermissions = new Set(current.permissions);
  const oldDomains = new Set(current.allowedDomains);
  return (
    next.permissions.some((permission) => !oldPermissions.has(permission)) ||
    next.allowedDomains.some((domain) => !oldDomains.has(domain))
  );
}

export function nextCircuitState(input: {
  currentFailures: number;
  outcome: 'SUCCEEDED' | 'TIMEOUT' | 'DENIED' | 'FAILED';
  threshold?: number;
}) {
  if (input.outcome === 'SUCCEEDED') return { failures: 0, status: 'CLOSED' as const };
  const failures = input.currentFailures + 1;
  return {
    failures,
    status: failures >= (input.threshold ?? 3) ? ('OPEN' as const) : ('CLOSED' as const),
  };
}

export const MetricEvidenceSchema = z.object({
  metricCode: z.string().min(1),
  displayName: z.string().min(1),
  unit: z.enum(['COUNT', 'CENTS', 'PERCENT']),
  value: z.number(),
  sourceEventIds: z.array(z.string().uuid()),
  sourceEventTypes: z.array(z.string().min(1)).min(1),
  calculationVersion: z.string().min(1),
  definition: z.string().min(1),
});

export function buildTraceableMonthlyReport(input: {
  month: string;
  generatedThrough: string;
  metrics: unknown[];
}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/u.test(input.month)) throw new ReportPolicyError('INVALID_MONTH');
  const metrics = input.metrics.map((metric) => MetricEvidenceSchema.parse(metric));
  if (new Set(metrics.map((metric) => metric.metricCode)).size !== metrics.length)
    throw new ReportPolicyError('DUPLICATE_METRIC');
  return {
    month: input.month,
    generatedThrough: z.iso.datetime({ offset: true }).parse(input.generatedThrough),
    disclaimer: 'GEO 健康分只反映可检查的资料质量，不代表外部收录、排名或流量。',
    metrics: metrics.map((metric) => ({
      ...metric,
      sourceCount: metric.sourceEventIds.length,
      traceable: true as const,
    })),
  };
}

export class GeoPolicyError extends Error {
  constructor(
    public readonly code: string,
    public readonly fields: string[] = [],
  ) {
    super(code);
  }
}
export class PluginPolicyError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export class ReportPolicyError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
