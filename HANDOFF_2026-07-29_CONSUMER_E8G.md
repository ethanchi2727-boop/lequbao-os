# 2026-07-29 消费者端 E8 第七批交接

## 结论

本批“图片安全上传边界 + 签名识别回调/幂等 + 用户可编辑明确确认 + 既有文本助手复用”已经完成并修绿。不要重做 E8 首页、城市、消息、家庭身份、搜索、AI 文本/语音、订座、附近、支付，或本批图片确认链路。

唯一完成度依据仍是 `docs/TRACEABILITY.md`。E8 总项保持部分完成：生产语音转写与图片识别连接器、图片恶意内容扫描、AI 位置理解、生产地图/导航、门店详情与团购、真实微信支付连接器仍未实现。

## 已完成能力

- 新增 `consumer.image.manage`，仅授予消费者角色并维持 `SELF` 数据范围。
- 图片上传支持 JPEG、PNG、WebP，最大 8MB；同时校验文件扩展名、声明 MIME、魔数、真实尺寸不超过 4096×4096 且总像素不超过 1200 万。
- 上述检查是文件类型和尺寸基础校验，不冒充恶意内容、病毒或完整安全扫描。
- 上传只创建 `PENDING_RECOGNITION` 私有输入、暂存原图并投递识别请求 Outbox，不伪造识别成功。
- 图片识别回调精确免 Bearer，但强制 HMAC 签名；连接器事件号支持幂等重放并拒绝同事件号冲突结果。
- 成功回调只生成 `READY_FOR_CONFIRMATION` 描述，失败回调进入 `FAILED`；两种回调都会立即删除原图。
- 原始识别描述只保存在消费者私有图片输入中；审计、埋点和 Outbox 仅保存 SHA-256 摘要、类别、置信度、敏感数据标记、文件摘要和状态。
- 消费者可编辑识别描述，但必须提交 `confirmed: true` 和当前乐观版本才能进入 `CONFIRMED`。
- 文本助手写接口新增可选 `sourceImageInputId`；只有本人、当前城市/家庭上下文、`CONFIRMED` 且描述完全一致的图片输入才能被原子消费为 `DISPATCHED`，随后复用既有推荐、订座草稿和消息链路。
- 图片事件数据库只追加，禁止更新和删除。
- 消费者页面新增图片入口、待识别、失败、敏感数据提示、可编辑确认和已发送状态；首页图片入口进入真实助手。
- 当前 `liveImageRecognitionConnectorAvailable=false`，没有宣称接通生产图片识别。

## 主要文件

- `.env.example`
- `packages/auth/src/index.ts`
- `packages/contracts/src/index.ts`
- `apps/api/src/database.ts`
- `apps/api/src/consumer-image-service.ts`
- `apps/api/src/consumer-image-service.test.ts`
- `apps/api/src/consumer-assistant-service.ts`
- `apps/api/src/app.ts`
- `apps/api/openapi.yaml`
- `apps/consumer-miniapp/src/services/consumer.ts`
- `apps/consumer-miniapp/src/pages/index/index.vue`
- `apps/consumer-miniapp/src/pages/assistant/index.vue`
- `docs/TRACEABILITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY.md`

## 最终验证

- OpenAPI：128 条路径、140 个 Schema、853 个 `$ref`、0 个悬空引用。
- `npm.cmd run check`：退出码 0。
- 类型检查：9 个工作区全部通过。
- 测试：174 项全部通过，其中认证包 8 项、产品目录包 5 项、API 158 项、管理端 3 项。
- 本批图片 API：7 项通过。
- 图片、语音、消费者助手、支付、经营宝订单与认证兼容复验：38 项通过。
- 全仓 API、通用移动端、四个独立 H5 与管理端正式构建：通过。
- 消费者微信小程序正式构建：通过。
- 构建只有 DCloud/Sass `legacy-js-api` 上游弃用提示。

## 浏览器验收

- 使用本地最小 PNG 真实建立 `PENDING_RECOGNITION` 输入，再以开发环境 HMAC 签名回调进入 `READY_FOR_CONFIRMATION`；这不是生产图片识别。
- 页面展示 1×1、0.1KB、`MENU`、92% 置信度，以及“上传不等于识别成功、基础校验不等于恶意内容扫描”的明确说明。
- 实际把识别描述中的“两个人”修改为“三个人”，再点击“我已核对，确认并发送给助手”。
- 页面进入 `DISPATCHED`；API 最后一条用户消息完全等于编辑后文本，并生成 1 个真实授权推荐和 3 人待确认订座草稿。
- 1280×720 下文档宽度等于视口宽度，无页面级横向溢出；604px 图片卡和 640px 页头/页尾居中。
- 页面标题已同步为“文本、语音与图片确认在线”，控制台 0 error/warning。
- 未代用户授予相机或文件权限；文件选择 API 由消费者 H5/微信正式构建与类型检查覆盖。

## 当前运行环境提示

验收时 API 开发服务运行于 `127.0.0.1:8787`，消费者 H5 运行于 `127.0.0.1:43216`，且 H5 通过 `VITE_API_BASE_URL=http://127.0.0.1:8787/api/v1` 访问 API。演示数据库保留本次图片元数据、识别确认和消息证据，但签名回调后原图已经删除。不要盲目终止进程；下次先检查端口、进程归属和页面是否仍需要。

## 未完成边界

- 真实 ASR/语音转写供应商、生产凭据、重试调度、限流、可用性监控与成本治理。
- 真实图片识别/OCR 供应商、生产凭据、恶意内容扫描、重试调度、限流、可用性监控与成本治理。
- 生产地图、导航和实时路线连接器。
- 门店详情、团购方案、库存、价格和有效期闭环。
- 真实微信支付下单、商户凭据、证书轮换、平台证书验签和渠道对账。

## 下一批建议

推荐先做“门店详情 + 团购方案/价格/有效期 + 从推荐/搜索/附近进入详情并建立受控购买或预约草稿”，继续复用现有发布授权、目录、订单状态机、强确认和支付连接器边界。生产语音、图片、地图和微信支付都需要外部供应商权限，本批已经完成所有不依赖外部权限的图片内部状态机、隐私回收、签名回调和人控确认边界。

开始下一批前先运行：

```powershell
npm.cmd test --workspace @lequ/api -- consumer-image-service.test.ts consumer-voice-service.test.ts consumer-assistant-service.test.ts consumer-payment-service.test.ts merchant-operations-service.test.ts auth-service.test.ts
npm.cmd run typecheck --workspace @lequ/api
npm.cmd run typecheck --workspace @lequ/consumer-miniapp
```
