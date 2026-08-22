import { describe, expect, it } from 'vitest';
import { livePageIds, resolveLivePageRequest } from './live-page-registry.mjs';
import { workbenchPageContracts } from './page-contracts.mjs';

describe('live workbench page registry', () => {
  it('covers the exact frozen Workbench leaf set together with the five dedicated intake pages', () => {
    const dedicatedIntakePages = ['page-014', 'page-175', 'page-176', 'page-177', 'page-178'];
    expect(new Set([...livePageIds, ...dedicatedIntakePages])).toEqual(
      new Set(workbenchPageContracts.map((page) => page.id)),
    );
  });

  it('connects the launch-scope read surfaces to implementation-bounded APIs', () => {
    expect(livePageIds.size).toBe(130);
    expect(resolveLivePageRequest('page-129', new URLSearchParams())).toEqual({
      status: 'ready',
      kind: 'official-plugin-catalog',
      path: '/api/v1/plugins/catalog',
      commands: [],
    });
    expect(
      resolveLivePageRequest(
        'page-122',
        new URLSearchParams('month=2026-08&storeId=10000000-0000-4000-8000-000000000001'),
      ).path,
    ).toContain('month=2026-08');
    expect(resolveLivePageRequest('page-087', new URLSearchParams()).path).toContain(
      'productType=GROUP_BUY',
    );
    expect(resolveLivePageRequest('page-091', new URLSearchParams())).toMatchObject({
      status: 'missing-parameters',
      missing: ['orderId'],
    });
    expect(resolveLivePageRequest('page-119', new URLSearchParams())).toMatchObject({
      status: 'missing-parameters',
      missing: ['customerId'],
    });
    expect(
      resolveLivePageRequest('page-141', new URLSearchParams('action=ROLE_ASSIGNED')),
    ).toMatchObject({
      status: 'ready',
      kind: 'organization-audit',
      path: '/api/v1/organization/audit-logs?action=ROLE_ASSIGNED',
    });
    expect(resolveLivePageRequest('page-170', new URLSearchParams())).toMatchObject({
      status: 'ready',
      kind: 'organization-audit',
    });
    expect(
      resolveLivePageRequest('page-152', new URLSearchParams('statementId=statement-1')).path,
    ).toBe('/api/v1/revenue-operations/statements/statement-1');
    expect(
      resolveLivePageRequest(
        'page-157',
        new URLSearchParams(
          'subscriptionId=18000000-0000-4000-8000-000000000004&periodStart=2026-08-01&periodEnd=2026-08-31',
        ),
      ).commands,
    ).toEqual([expect.objectContaining({ id: 'distribution-statement-lock' })]);
    expect(resolveLivePageRequest('page-026', new URLSearchParams()).path).toBe(
      '/api/v1/sales/opportunities?',
    );
    expect(resolveLivePageRequest('page-045', new URLSearchParams())).toMatchObject({
      status: 'ready',
      kind: 'renewal-previews',
      path: '/api/v1/subscription-lifecycle/renewal-previews',
    });
    expect(
      resolveLivePageRequest(
        'page-016',
        new URLSearchParams('sessionId=10000000-0000-4000-8000-000000000001'),
      ),
    ).toMatchObject({
      status: 'ready',
      kind: 'merchant-intake-evidence',
      path: '/api/v1/merchant-intake/sessions/10000000-0000-4000-8000-000000000001',
    });
  });

  it('connects desktop and mobile today views to the same authoritative aggregation', () => {
    for (const page of ['page-079', 'page-173'])
      expect(resolveLivePageRequest(page, new URLSearchParams())).toMatchObject({
        status: 'ready',
        kind: 'operational-home-today',
        path: '/api/v1/operational-home/today',
      });
  });

  it('connects GEO health and difference remediation without exposing hashes in URLs', () => {
    expect(
      resolveLivePageRequest('page-126', new URLSearchParams('storeId=store-1')),
    ).toMatchObject({
      status: 'ready',
      kind: 'geo-health-overview',
      path: '/api/v1/geo-operations/overview?storeId=store-1',
    });
    const difference = resolveLivePageRequest(
      'page-070',
      new URLSearchParams('differenceId=difference-1&status=OPEN'),
    );
    expect(difference).toMatchObject({
      status: 'ready',
      kind: 'geo-differences',
      commands: [{ id: 'geo-difference-decide' }],
    });
    expect(JSON.stringify(difference)).not.toMatch(/canonical|observed|hash/iu);
    const publication = resolveLivePageRequest(
      'page-069',
      new URLSearchParams('profileId=profile-1'),
    );
    expect(publication).toMatchObject({
      status: 'ready',
      kind: 'geo-channel-publication',
      commands: [{ id: 'geo-profile-publish', body: { authorizationConfirmed: true } }],
    });
    expect(JSON.stringify(publication)).toContain('不承诺外部收录');
  });

  it('reuses the secure intake evidence chain for merchant data and knowledge pages', () => {
    const params = new URLSearchParams('sessionId=session-1');
    expect(resolveLivePageRequest('page-081', params)).toMatchObject({
      status: 'ready',
      kind: 'merchant-intake-materials',
      commands: [{ id: 'merchant-intake-message-add' }, { id: 'merchant-intake-upload-create' }],
    });
    expect(resolveLivePageRequest('page-082', params)).toMatchObject({
      status: 'ready',
      kind: 'merchant-intake-evidence',
      commands: [],
    });
    expect(resolveLivePageRequest('page-083', params)).toMatchObject({
      status: 'ready',
      kind: 'merchant-intake-confirmation',
      commands: [{ id: 'merchant-intake-confirm' }],
    });
    expect(resolveLivePageRequest('page-084', params)).toMatchObject({
      status: 'ready',
      kind: 'merchant-intake-publish-impact',
      commands: [{ id: 'merchant-intake-commit' }],
    });
  });

  it('uses the immutable monthly report metrics for customer-service conversion analysis', () => {
    expect(
      resolveLivePageRequest('page-125', new URLSearchParams('month=2026-08&storeId=store-1')),
    ).toMatchObject({
      status: 'ready',
      kind: 'monthly-value-report',
      path: '/api/v1/reports/monthly-value?month=2026-08&storeId=store-1',
    });
  });

  it('connects group-buy publication to a versioned and confirmed server command', () => {
    const result = resolveLivePageRequest(
      'page-088',
      new URLSearchParams('storeId=store-1&productId=product-1'),
    );
    expect(result).toMatchObject({
      status: 'ready',
      kind: 'merchant-group-buy-publication',
      commands: [
        {
          id: 'merchant-group-buy-publish',
          body: { confirmed: true },
          inputs: [{ name: 'expectedVersion', type: 'number' }],
        },
      ],
    });
  });

  it('connects customer-service duty, customer tasks, and quality remediation', () => {
    expect(resolveLivePageRequest('page-103', new URLSearchParams())).toMatchObject({
      status: 'ready',
      kind: 'customer-service-shifts',
      commands: [{ id: 'customer-service-shift-create' }],
    });
    expect(
      resolveLivePageRequest('page-107', new URLSearchParams('taskId=task-1')).commands,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'customer-service-task-create' }),
        expect.objectContaining({ id: 'customer-service-task-complete' }),
      ]),
    );
    const review = resolveLivePageRequest('page-110', new URLSearchParams('reviewId=review-1'));
    expect(review).toMatchObject({
      status: 'ready',
      kind: 'customer-service-quality-reviews',
      commands: [{ id: 'customer-service-quality-decide' }],
    });
    expect(JSON.stringify(review)).not.toMatch(/customerName|mobile|messageContent/iu);
  });

  it('connects the remaining headquarters and governance pages to authoritative controls', () => {
    expect(
      resolveLivePageRequest('page-113', new URLSearchParams('connectorCode=WECOM_INTAKE')),
    ).toMatchObject({
      kind: 'wecom-connection-health',
      commands: [{ id: 'wecom-connection-retry' }],
    });
    expect(resolveLivePageRequest('page-118', new URLSearchParams())).toMatchObject({
      kind: 'reward-rules',
      commands: [{ id: 'reward-rule-publish' }],
    });
    expect(
      resolveLivePageRequest(
        'page-130',
        new URLSearchParams('pluginCode=report&pluginVersionId=version-1'),
      ),
    ).toMatchObject({
      kind: 'official-plugin-detail',
      path: '/api/v1/plugins/catalog/report',
      commands: [{ id: 'official-plugin-install' }],
    });
    expect(resolveLivePageRequest('page-132', new URLSearchParams('query=团购'))).toMatchObject({
      kind: 'official-skill-catalog',
      path: expect.stringContaining('query=%E5%9B%A2%E8%B4%AD'),
    });
    expect(resolveLivePageRequest('page-148', new URLSearchParams())).toMatchObject({
      kind: 'platform-merchants',
    });
    expect(resolveLivePageRequest('page-151', new URLSearchParams('planCode=PRO'))).toMatchObject({
      kind: 'platform-plan-entitlements',
      commands: [{ id: 'platform-plan-entitlements-update' }],
    });
    expect(
      resolveLivePageRequest('page-158', new URLSearchParams('discrepancyId=difference-1')),
    ).toMatchObject({
      kind: 'reconciliation-discrepancies',
      commands: [{ id: 'reconciliation-discrepancy-resolve' }],
    });
    expect(resolveLivePageRequest('page-162', new URLSearchParams())).toMatchObject({
      kind: 'platform-channel-partners',
      commands: [{ id: 'platform-channel-partner-save' }],
    });
    expect(resolveLivePageRequest('page-166', new URLSearchParams())).toMatchObject({
      kind: 'platform-model-route-budgets',
      commands: [{ id: 'platform-model-route-budget-save' }],
    });
  });

  it('exposes only page-specific bounded write commands derived from resource parameters', () => {
    const delivery = resolveLivePageRequest(
      'page-053',
      new URLSearchParams(
        'projectId=10000000-0000-4000-8000-000000000001&stepCode=merchant_authorization',
      ),
    );
    expect(delivery.commands.map((command) => command.id)).toEqual([
      'delivery-start',
      'delivery-resume',
      'delivery-suspend',
      'delivery-step-execute',
      'delivery-step-retry',
    ]);
    expect(JSON.stringify(delivery.commands)).not.toContain('tenantId');
    expect(
      resolveLivePageRequest(
        'page-181',
        new URLSearchParams(
          'projectId=10000000-0000-4000-8000-000000000001&stepCode=merchant_confirmation',
        ),
      ).commands,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'delivery-step-execute' })]));

    const review = resolveLivePageRequest(
      'page-134',
      new URLSearchParams('miniProgramId=mini-1&releaseId=release-1'),
    );
    expect(review.commands).toEqual([
      expect.objectContaining({ id: 'mini-program-submit-review', body: {} }),
    ]);

    const organization = resolveLivePageRequest(
      'page-140',
      new URLSearchParams(
        'userId=17000000-0000-4000-8000-000000000003&roleCode=STORE_MANAGER&storeId=17000000-0000-4000-8000-000000000005&memberStatus=SUSPENDED',
      ),
    );
    expect(organization.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'organization-role-assign' }),
        expect.objectContaining({
          id: 'organization-member-status',
          body: { status: 'SUSPENDED' },
        }),
      ]),
    );

    expect(
      resolveLivePageRequest('page-160', new URLSearchParams('transferId=transfer-1')).commands,
    ).toEqual([expect.objectContaining({ id: 'revenue-transfer-approve', body: {} })]);
    expect(
      resolveLivePageRequest(
        'page-035',
        new URLSearchParams(
          'rightGroupId=group-1&claimantBeneficiaryIds=beneficiary-1,beneficiary-2&reasonCode=DUPLICATE_OWNERSHIP',
        ),
      ).commands,
    ).toEqual([expect.objectContaining({ id: 'revenue-right-dispute-open' })]);

    const customerService = resolveLivePageRequest(
      'page-100',
      new URLSearchParams('conversationId=10000000-0000-4000-8000-000000000002'),
    );
    expect(customerService.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'customer-service-accept', body: {} }),
        expect.objectContaining({
          id: 'customer-service-close',
          body: { resolutionCode: 'RESOLVED_BY_AGENT' },
        }),
      ]),
    );

    const contract = resolveLivePageRequest(
      'page-031',
      new URLSearchParams(
        'opportunityId=25000000-0000-4000-8000-000000000007&contractId=25000000-0000-4000-8000-000000000010',
      ),
    );
    expect(contract.commands.map((command) => command.id)).toEqual([
      'sales-contract-create',
      'sales-contract-sign',
      'sales-collection-record',
    ]);
    expect(JSON.stringify(contract.commands)).not.toContain('providerReference=');
    expect(
      contract.commands.find((command) => command.id === 'sales-collection-record').inputs,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'providerReference', type: 'password' }),
      ]),
    );

    const activation = resolveLivePageRequest(
      'page-050',
      new URLSearchParams('changeId=25000000-0000-4000-8000-000000000012'),
    );
    expect(activation.commands.map((command) => command.id)).toEqual([
      'subscription-activation-request',
      'subscription-change-decide',
    ]);

    const intakeConfirmation = resolveLivePageRequest(
      'page-018',
      new URLSearchParams('sessionId=10000000-0000-4000-8000-000000000001'),
    );
    expect(intakeConfirmation.commands).toEqual([
      expect.objectContaining({
        id: 'merchant-intake-confirm',
        body: {},
        inputs: expect.arrayContaining([
          expect.objectContaining({ name: 'candidateIds', type: 'csv' }),
          expect.objectContaining({ name: 'confirmedPayload', type: 'json' }),
        ]),
      }),
    ]);

    const intakeCommit = resolveLivePageRequest(
      'page-021',
      new URLSearchParams('sessionId=10000000-0000-4000-8000-000000000001'),
    );
    expect(intakeCommit.commands).toEqual([
      expect.objectContaining({ id: 'merchant-intake-commit', body: {} }),
    ]);

    const wechatAuthorization = resolveLivePageRequest('page-058', new URLSearchParams());
    expect(wechatAuthorization.commands).toEqual([
      expect.objectContaining({
        id: 'mini-program-authorization-activate',
        inputs: expect.arrayContaining([
          expect.objectContaining({ name: 'authorizationCode', type: 'password' }),
        ]),
      }),
    ]);
    const rejectionCorrection = resolveLivePageRequest(
      'page-062',
      new URLSearchParams('miniProgramId=10000000-0000-4000-8000-000000000001'),
    );
    expect(rejectionCorrection.commands).toEqual([
      expect.objectContaining({
        id: 'mini-program-preview-create',
        inputs: expect.arrayContaining([expect.objectContaining({ name: 'config', type: 'json' })]),
      }),
    ]);
    expect(resolveLivePageRequest('page-075', new URLSearchParams()).commands).toEqual([
      expect.objectContaining({
        id: 'knowledge-publication-create',
        inputs: expect.arrayContaining([
          expect.objectContaining({ name: 'trustLevel' }),
          expect.objectContaining({ name: 'expiresAt', required: false }),
        ]),
      }),
    ]);
    expect(resolveLivePageRequest('page-043', new URLSearchParams()).commands).toEqual([
      expect.objectContaining({
        id: 'revenue-dispute-submit',
        inputs: expect.arrayContaining([
          expect.objectContaining({ name: 'statementId', required: true }),
          expect.objectContaining({ name: 'costEntryId', required: false }),
        ]),
      }),
    ]);
    expect(
      resolveLivePageRequest(
        'page-040',
        new URLSearchParams('costEntryId=18000000-0000-4000-8000-000000000008'),
      ),
    ).toMatchObject({
      status: 'ready',
      kind: 'revenue-cost-evidence',
      path: '/api/v1/revenue-operations/costs/18000000-0000-4000-8000-000000000008/evidence',
    });
  });

  it('fails closed when a resource-bound page has no authoritative id', () => {
    expect(resolveLivePageRequest('page-053', new URLSearchParams())).toEqual({
      status: 'missing-parameters',
      missing: ['projectId'],
      kind: 'delivery-project',
    });
    expect(resolveLivePageRequest('page-011', new URLSearchParams())).toEqual({
      status: 'missing-parameters',
      missing: ['sessionId'],
      kind: 'merchant-intake-materials',
    });
    expect(resolveLivePageRequest('page-069', new URLSearchParams())).toMatchObject({
      status: 'ready',
      kind: 'geo-channel-publication',
      commands: [],
    });
  });
});
