# 2026-08-17 消费者端 E8 第十批（E8J）云端交接

## 结论

E8J 的“套餐支付连接器回调 + 支付成功状态机 + 商家接单解锁 + 一次性核销凭证 + 取消/退款补偿”已完成并通过本地自动化质量门。不要重做 E8I 已完成的套餐强确认、不可变快照、资源原子占用和过期扫描，也不要重做本批支付/退款状态机。

本交接用于 GitHub 私有仓库 `ethanchi2727-boop/lequbao-os` 的云端继续开发。仓库不包含本地 `.env`、SQLite 运行数据库、依赖目录或构建产物；云端首次打开需执行 `npm ci`。

## 已完成能力

- 新增独立套餐支付回调 `POST /api/v1/payment-connectors/wechat/deals/callback`，使用固定作用域 HMAC、签名前置校验、金额/币种/不可变快照核对及最小 ACK。
- 及时支付成功写入真实已付金额，将 `HELD` 转为 `CONSUMED`，但不替商家自动接单；支付失败原子取消订单并释放库存或预约容量。
- 扫描前后迟到支付只记录 `LATE_SUCCEEDED`，不会复活订单或重新占用资源，并自动建立精确全额补偿退款请求、尝试和 Outbox。
- 事件号、交易号和退款号均有跨聚合冲突保护；相同事件同载荷可重放，不同载荷返回冲突。
- 商家接单同时校验资金、资源与退款状态；零支付或支付成功套餐才可接单。
- 商家接单后签发一次性 6 位 HMAC 派生核销码。消费者仅在有效期内获得完整码，商家只看到掩码，数据库不保存明文码；生产环境缺凭证密钥时关闭签发。
- 核销要求有效资金、占用、凭证和乐观版本；成功后凭证变为 `REDEEMED`、hold 变为 `FULFILLED`，预约容量释放，有限团购库存不重复回补。
- 消费者可取消未实付、未履约套餐并原子释放资源；已支付套餐只能申请全额退款。退款申请先撤销凭证但不提前释放资源或宣称退款成功。
- 商家批准退款后按精确尝试等待连接器；失败可重试，旧失败尝试的迟到成功仍能安全收敛，后续失败不会再次降级已成功退款。
- 消费者与经营宝页面已统一展示支付、退款、占用和核销状态；经营宝 UI 策略阻止重复批准、错误接单和失效凭证核销。
- E8I 旧 SQLite 结构可真实迁移到 E8J，新生命周期事件保持只追加约束。

## 主要文件

- `apps/api/src/consumer-deal-payment-service.ts`
- `apps/api/src/consumer-deal-payment-service.test.ts`
- `apps/api/src/consumer-deal-aftercare-service.ts`
- `apps/api/src/consumer-deal-aftercare-service.test.ts`
- `apps/api/src/consumer-deal-credential-service.ts`
- `apps/api/src/database-migration.test.ts`
- `apps/api/src/database.ts`
- `apps/api/src/merchant-operations-service.ts`
- `apps/api/src/merchant-operations-service.test.ts`
- `apps/api/src/consumer-store-service.ts`
- `apps/api/src/app.ts`
- `apps/api/openapi.yaml`
- `packages/contracts/src/index.ts`
- `apps/consumer-miniapp/src/pages/store/index.vue`
- `apps/merchant-miniapp/src/services/merchant-order-state.ts`
- `apps/merchant-miniapp/src/services/merchant-order-state.test.ts`
- `apps/merchant-miniapp/src/pages/index/index.vue`
- `apps/merchant-miniapp/src/pages/orders/index.vue`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY.md`
- `docs/TRACEABILITY.md`

## 最终自动化验证

- `node scripts/quality-gate.mjs`：通过。
  - 9 个工作区类型检查通过，约 120.2 秒。
  - 全仓自动化测试通过，约 59.3 秒。
  - API、通用 H5、四端 H5 与管理后台正式构建通过，约 211.0 秒。
- `npm.cmd run build:weixin`：消费者、经营宝、销售宝和城市服务商四端微信小程序构建全部通过。
- E8J 主线定向：支付/退款回调、售后、迁移、商家履约和商家 UI 策略共 41 项通过。
- OpenAPI 3.1：134 条路径、150 个 Schema、902 个 `$ref`，无悬空引用或重复 `operationId`。
- 构建只输出既有 DCloud/Dart Sass `legacy-js-api` 弃用提示和 npm 版本提示，退出码为 0。

## 尚未执行

- E8J 最终浏览器验收尚未在本批自动化完成后重跑，不能标记为已通过。云端继续前应分别验收消费者门店页和经营宝订单页的支付成功、接单签发、核销、退款失败重试与成功收敛显示。
- 未接入真实微信商户支付适配器；当前实现的是已验证原始通知之后的内部 HMAC 连接器边界，不应宣称发生真实生产扣款或退款。

## 云端启动

```bash
git clone https://github.com/ethanchi2727-boop/lequbao-os.git
cd lequbao-os
npm ci
npm run typecheck
npm test
```

开发服务：

```bash
npm run dev:api
npm run dev:h5 -w @lequ/consumer-miniapp
npm run dev:h5 -w @lequ/merchant-miniapp
```

## 下一步建议

1. 先完成 E8J 消费者端与经营宝浏览器验收并把证据写入 `docs/DELIVERY.md`。
2. 再进入 E8K：本地生活分类聚合、比价解释、完整订单中心或真实微信支付沙盒适配器，按 `docs/TRACEABILITY.md` 选择一个连贯垂直切片。
3. 继续以仓库文档、测试和 Git 历史作为事实源；长对话结束前更新新的 HANDOFF，不依赖聊天上下文。
