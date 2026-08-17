import { describe, expect, it } from 'vitest'
import { breadcrumbs, catalogDepth, findNode, products, type ProductNavNode } from './index.js'

function flatten(nodes: readonly ProductNavNode[]): ProductNavNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])])
}

describe('四端产品信息架构', () => {
  for (const product of Object.values(products)) {
    it(`${product.name} 具备唯一节点和 2-6 级导航`, () => {
      const nodes = flatten(product.modules)
      expect(product.modules.length).toBeGreaterThanOrEqual(6)
      expect(new Set(nodes.map((node) => node.id)).size).toBeGreaterThan(5)
      expect(catalogDepth(product.modules)).toBe(6)
      expect(nodes.every((node) => node.title.length > 0 && node.summary.length > 0)).toBe(true)
    })
  }

  it('可定位六级交易确认页并生成完整面包屑', () => {
    const path = ['assistant', 'sessions', 'input', 'plans', 'merchant', 'confirmation']
    expect(findNode('consumer', path)?.title).toBe('交易确认')
    expect(breadcrumbs('consumer', path).map((node) => node.title)).toEqual([
      'AI 管家', '对话与任务', '多模态输入', '方案卡片', '商家与商品候选', '交易确认',
    ])
  })
})
