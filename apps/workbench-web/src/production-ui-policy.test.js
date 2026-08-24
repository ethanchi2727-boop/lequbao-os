import { describe, expect, it } from 'vitest';
import {
  resolveIntakeMutationMode,
  resolveIntakeProjection,
  resolveWorkbenchShell,
} from './production-ui-policy.mjs';

describe('production UI policy', () => {
  it('routes each demo recent service to an existing core workflow', () => {
    expect(resolveWorkbenchShell(true).recentServices).toEqual([
      { label: '拾味小馆 · 交付中', route: 'page-053' },
      { label: '叶子花店 · 资料待确认', route: 'page-018' },
      { label: '七月永久收益月结', route: 'page-037' },
    ]);
  });

  it('never projects sample people, merchants, tasks, or intake fields in production', () => {
    const shell = resolveWorkbenchShell(false);
    const intake = resolveIntakeProjection({ demoMode: false, session: null, demoFields: [['x']] });
    expect(shell).toMatchObject({
      recentServices: [],
      identityLabel: '当前已登录成员',
      backgroundTaskCount: null,
    });
    expect(JSON.stringify(shell)).not.toMatch(/周子涵|拾味小馆|叶子花店|南京西路/u);
    expect(intake).toEqual({ fields: [], missingItems: [], completeness: 0, sourceCount: 0 });
  });

  it('derives production progress and evidence counts only from the live session', () => {
    expect(
      resolveIntakeProjection({
        demoMode: false,
        demoFields: [],
        session: {
          fields: [
            { id: 'one', sourceAssetId: 'asset-1' },
            { id: 'two', sourceAssetId: 'asset-1' },
            { id: 'three', sourceAssetId: 'asset-2' },
          ],
          missingItems: ['hours'],
        },
      }),
    ).toEqual({
      fields: expect.any(Array),
      missingItems: ['hours'],
      completeness: 75,
      sourceCount: 2,
    });
  });

  it('fails production mutations closed without both service and authoritative session', () => {
    expect(
      resolveIntakeMutationMode({
        demoMode: false,
        serviceAvailable: false,
        sessionAvailable: false,
      }),
    ).toBe('blocked');
    expect(
      resolveIntakeMutationMode({
        demoMode: false,
        serviceAvailable: true,
        sessionAvailable: false,
      }),
    ).toBe('blocked');
    expect(
      resolveIntakeMutationMode({
        demoMode: false,
        serviceAvailable: true,
        sessionAvailable: true,
      }),
    ).toBe('live');
    expect(
      resolveIntakeMutationMode({
        demoMode: true,
        serviceAvailable: false,
        sessionAvailable: false,
      }),
    ).toBe('simulate');
  });
});
