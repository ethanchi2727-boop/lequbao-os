# 2026-07-29 消费者端 E8 第八批交接

## 结论

本批“已发布授权门店详情 + 团购/预约价格与有效期规则 + 搜索/附近/助手统一跳转 + 受控待确认套餐草稿”已经完成并修绿。不要重做 E8 首页、城市、消息、家庭身份、搜索、AI 文本/语音/图片、订座、附近、支付，或本批详情与草稿链路。

唯一完成度依据仍是 `docs/TRACEABILITY.md`。E8 总项保持部分完成：套餐草稿确认下单与核销、分类聚合、生产语音/图片/地图/支付连接器、电商和完整订单中心仍未实现。

## 已完成能力

- 新增 `consumer.store.read` 与 `consumer.deal.manage`，仅授予 `SELF` 消费者。
- 门店详情只读取当前城市内 `PUBLISHED`、获 `PLATFORM_DISPLAY` 授权且营业中的门店；暂停、跨城市或未授权门店统一不可见。
- 搜索门店/服务、附近列表和 AI 推荐统一跳转真实门店详情页，不再落入通用占位页。
- 到店团购和预约服务使用独立发布事实保存有效期、可用星期/时段、退款规则和核销规则。
- 套餐价格、比较价、SKU 状态、有限库存及预约时段容量继续读取经营宝权威 Catalog/SPU/SKU/Slot，不复制第二套库存或价格。
- 过期、停售、售罄、库存不足、无有效预约时段或陈旧消费者上下文均禁止建立草稿。
- 用户必须先核对价格、有效期和规则；写接口要求 `acknowledgedTerms: true`、幂等键及当前城市/家庭身份。
- 成功后只创建 `WAITING_CONFIRMATION` 草稿，冻结价格规则版本、套餐版本、数量与可选服务时间。
- 草稿事务不创建商户订单、不扣减 SKU 库存或预约容量、不生成核销凭证、不发支付 Outbox、不宣称扣款。
- 套餐草稿事件只追加，并同步写审计和埋点；后续确认下单仍需独立强确认状态机。
- 消费者页面展示门店事实、套餐价格、库存状态、有效期、使用/退款规则、数量/预约时间和草稿边界。

## 主要文件

- `packages/auth/src/index.ts`
- `packages/contracts/src/index.ts`
- `apps/api/src/database.ts`
- `apps/api/src/consumer-store-service.ts`
- `apps/api/src/consumer-store-service.test.ts`
- `apps/api/src/consumer-home-service.ts`
- `apps/api/src/consumer-nearby-service.ts`
- `apps/api/src/consumer-assistant-service.ts`
- `apps/api/src/app.ts`
- `apps/api/openapi.yaml`
- `apps/consumer-miniapp/src/services/consumer.ts`
- `apps/consumer-miniapp/src/pages/store/index.vue`
- `apps/consumer-miniapp/src/pages.json`
- `docs/TRACEABILITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY.md`

## 最终验证

- OpenAPI：130 条路径、143 个 Schema、867 个 `$ref`、0 个悬空引用。
- `npm.cmd run check`：退出码 0。
- 类型检查：9 个工作区全部通过。
- 测试：180 项全部通过，其中认证包 8 项、产品目录包 5 项、API 164 项、管理端 3 项。
- 本批门店详情 API：6 项通过。
- 门店详情、搜索、附近、助手、经营宝目录与认证兼容复验：35 项通过。
- 全仓 API、通用移动端、四个独立 H5 与管理端正式构建：通过。
- 消费者微信小程序正式构建：通过。
- 构建只有 DCloud/Sass `legacy-js-api` 上游弃用提示。

## 浏览器验收

- 从消费者“晚餐”真实搜索结果点击首个服务，进入 `/pages/store/index?storeId=store-demo-jingan` 门店详情。
- 页面展示云和里·静安店的授权徽标、4.8 分/1286 条、确认地址和营业时间，以及“不提供导航/实时路程”边界。
- 页面展示 2 个已发布套餐；到店团购为 ¥628、比较价 ¥688、库存 18，并展示 2026-07-28 至 2026-10-27 有效期、每日 11:00–20:30、退款和核销规则。
- 实际点击“我已核对规则，建立待确认草稿”，页面出现 `WAITING_CONFIRMATION`、1 份、¥628 和“不创建订单/不占库存/不生成凭证/不扣款”说明。
- 数据库前后商户订单均为 12、`sku-e5-dinner-2` 库存均为 18、支付意图均为 1；仅草稿数从 0 增至 1。
- 1280×720 下无页面级横向溢出；640px 页头和 604px 主内容同轴居中，控制台 0 error/warning。

## 当前运行环境提示

验收时 API 开发服务运行于 `127.0.0.1:8787`，消费者 H5 运行于 `127.0.0.1:43216`。演示数据库保留本次 `WAITING_CONFIRMATION` 套餐草稿；它不是订单，未影响库存或支付。不要盲目终止进程；下次先检查端口、进程归属和页面是否仍需要。

## 未完成边界

- 套餐草稿的强确认下单、订单价格快照、库存/容量原子占用、核销凭证、过期释放与取消/退款闭环。
- 本地生活分类聚合、比价解释和更多真实商家套餐发布。
- 真实 ASR、图片识别/OCR、地图/导航和微信支付连接器及其生产治理。
- 电商购物车、结算、物流和售后。
- 消费者完整订单中心、状态筛选、拆单、发票、卡包、收藏与足迹。

## 下一批建议

推荐继续做“套餐草稿强确认下单 + 价格/规则快照 + 库存或预约容量原子占用 + 零支付/待支付分流 + 过期释放”，复用经营宝 `GROUP_BUY` / `RESERVATION` 订单状态机、现有支付意图和签名回调边界。下单必须保持独立强确认，库存占用与订单创建同事务，不能把当前草稿直接冒充订单。

开始下一批前先运行：

```powershell
npm.cmd test --workspace @lequ/api -- consumer-store-service.test.ts consumer-home-service.test.ts consumer-nearby-service.test.ts consumer-assistant-service.test.ts merchant-catalog-service.test.ts auth-service.test.ts
npm.cmd run typecheck --workspace @lequ/api
npm.cmd run typecheck --workspace @lequ/consumer-miniapp
```
