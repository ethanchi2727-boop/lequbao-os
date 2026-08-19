import { createHmac } from 'node:crypto';

export type VerificationTokenSubject = {
  entitlementId: string;
  tenantId: string;
  orderId: string;
  generation: number;
  validUntil: string;
};

export function createVerificationToken(secret: string, subject: VerificationTokenSubject) {
  if (Buffer.byteLength(secret, 'utf8') < 32)
    throw new Error('VERIFICATION_TOKEN_SECRET must contain at least 32 bytes');
  const opaque = createHmac('sha256', secret)
    .update(
      [
        'lequbao-verification-v1',
        subject.tenantId,
        subject.entitlementId,
        subject.orderId,
        subject.generation,
        subject.validUntil,
      ].join('\n'),
    )
    .digest('base64url');
  return `lqv1.${opaque}`;
}
