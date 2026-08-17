import { describe, expect, it } from 'vitest'
import { adminBreadcrumbs, adminDepth, adminModules, findAdminNode, type AdminNode } from './admin-nav'

function flatten(nodes: readonly AdminNode[]): AdminNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])])
}

describe('统一 PC 后台信息架构', () => {
  it('覆盖九个总部运营模块', () => {
    expect(adminModules.map((module) => module.id)).toEqual([
      'network', 'miniapp', 'geo', 'skills', 'commerce', 'voucher',
      'growth', 'ai', 'governance',
    ])
  })

  it('城市商家网络具备六级钻取', () => {
    expect(adminDepth(adminModules[0]!)).toBe(6)
    const path = ['cities', 'shanghai', 'merchants', 'yunheli', 'jingan']
    expect(findAdminNode('network', path)?.title).toBe('静安店详情')
    expect(adminBreadcrumbs('network', path)).toHaveLength(6)
  })

  it('节点标识在各自模块内保持唯一', () => {
    for (const module of adminModules) {
      const ids = flatten([module]).map((node) => node.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })
})
