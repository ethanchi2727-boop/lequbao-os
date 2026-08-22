import { z } from 'zod';
import type { WeComConfigResolver } from './wecom-intake-callback.js';

const TenantConfigSchema = z.object({
  tenantId: z.uuid(),
  corpId: z.string().min(1).max(255),
  token: z.string().min(1).max(1024),
  encodingAesKey: z.string().length(43),
});

const MemberSchema = z.object({
  userId: z.uuid(),
  roleCodes: z.array(z.string().min(1).max(100)).max(100),
  storeIds: z.array(z.uuid()).max(1000),
  sessionId: z.string().min(1).max(255),
  intakeSessionId: z.uuid(),
});

export function createHttpWeComConfigResolver(options: {
  baseUrl: string;
  serviceToken: string;
  fetch?: typeof globalThis.fetch;
}): WeComConfigResolver {
  const base = new URL(options.baseUrl);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(base.hostname);
  if (base.username || base.password)
    throw new Error('WECOM_CONFIG_GATEWAY_URL must not contain credentials');
  if (base.protocol !== 'https:' && !(local && base.protocol === 'http:'))
    throw new Error('WECOM_CONFIG_GATEWAY_URL must use HTTPS outside localhost');
  if (Buffer.byteLength(options.serviceToken, 'utf8') < 16)
    throw new Error('WECOM_CONFIG_GATEWAY_TOKEN must contain at least 16 bytes');
  const request = options.fetch ?? globalThis.fetch;

  const read = async (path: string) => {
    const response = await request(
      new URL(path, base.href.endsWith('/') ? base : `${base.href}/`),
      {
        headers: { authorization: `Bearer ${options.serviceToken}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`WeCom configuration gateway failed with HTTP ${response.status}`);
    }
    return response.json();
  };

  return {
    async resolveCorp(corpId) {
      const body = await read(`v1/wecom/corps/${encodeURIComponent(corpId)}`);
      if (body === undefined) return undefined;
      const parsed = TenantConfigSchema.parse(body);
      if (parsed.corpId !== corpId) throw new Error('WeCom configuration corp mismatch');
      return parsed;
    },
    async resolveMember(config, memberId) {
      const body = await read(
        `v1/wecom/corps/${encodeURIComponent(config.corpId)}/members/${encodeURIComponent(memberId)}`,
      );
      if (body === undefined) return undefined;
      const member = MemberSchema.parse(body);
      return {
        identity: {
          tenantId: config.tenantId,
          userId: member.userId,
          roleCodes: member.roleCodes,
          storeIds: member.storeIds,
          sessionId: member.sessionId,
        },
        intakeSessionId: member.intakeSessionId,
      };
    },
  };
}
