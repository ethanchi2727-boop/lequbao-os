# 2026-07-28 消费者端 E8 第四批交接

## 结论

本批“位置授权 + 附近列表/分布 + 拒绝定位与无定位降级”已经完成并修绿。不要重做 E8 首页、城市、消息、家庭身份、搜索、AI 文本会话、订座管理，或本批附近能力。

唯一完成度依据仍是 `docs/TRACEABILITY.md`；E8 总项保持部分完成，因为语音、图片、生产地图/导航、团购与门店详情、真实支付等仍未实现。

## 已完成能力

- 新增 `consumer.nearby.read` 细粒度权限，仅授予消费者角色。
- 新增 `POST /api/v1/consumer/nearby`，只允许读取本人当前城市与家庭上下文。
- 新增权威门店位置事实表，位置包含来源、置信度和版本；演示库现有 4 家已发布、获平台展示授权且营业中的真实门店位置。
- 有用户坐标时使用 Haversine 计算直线距离并按距离排序；页面明确这不是步行、驾车或实时路程。
- 精确用户位置仅存在于单次请求和页面内存，不落库，不进入审计、埋点或 Outbox。
- 无授权、拒绝授权或设备不可定位时返回城市授权门店与位置分布，不写默认用户坐标、不伪造距离。
- 暂停展示、停业门店自动排除；缺少可信坐标的门店可保留在列表，但不进入位置分布。
- 消费者端新增“附近”一级页面，首页位置工具和底部导航均接入；支持列表/分布切换和定位失败反馈。
- 当前分布是可信门店位置事实可视化，不是生产地图、导航或路线连接器。
- 为兼容新增演示门店，消费者 AI 推荐只选择存在有效服务目录的门店；经营宝概览优先选择已有经营指标的门店。

## 主要文件

- `packages/auth/src/index.ts`
- `packages/contracts/src/index.ts`
- `apps/api/src/database.ts`
- `apps/api/src/consumer-nearby-service.ts`
- `apps/api/src/consumer-nearby-service.test.ts`
- `apps/api/src/consumer-assistant-service.ts`
- `apps/api/src/merchant-operations-service.ts`
- `apps/api/src/app.ts`
- `apps/api/openapi.yaml`
- `apps/consumer-miniapp/src/services/consumer.ts`
- `apps/consumer-miniapp/src/pages.json`
- `apps/consumer-miniapp/src/pages/index/index.vue`
- `apps/consumer-miniapp/src/pages/nearby/index.vue`
- `docs/TRACEABILITY.md`
- `docs/ARCHITECTURE.md`
- `docs/DELIVERY.md`

## 最终验证

- OpenAPI：119 条路径、137 个 schema、791 个 `$ref`、0 个悬空引用。
- `npm.cmd run check`：退出码 0。
- 类型检查：9 个工作区全部通过。
- 测试：153 项全部通过，其中认证包 8 项、产品目录包 5 项、API 137 项、管理端 3 项。
- 本批附近 API 定向测试：5 项通过。
- 消费者助手、经营宝订单与附近兼容复验：17 项通过。
- 消费者 H5 与微信小程序正式构建：通过。
- 全仓 API、通用移动端、四个独立 H5 与管理端正式构建：通过。
- 构建只有 DCloud/Sass `legacy-js-api` 上游弃用提示。

## 浏览器验收

- 从首页底部“附近”逐级点击，正确进入 `#/pages/nearby/index`。
- 初始无定位状态展示“上海城市浏览”、4 家真实授权门店和“城市精选”，没有虚构用户距离。
- 列表切换为分布后显示 4 个可信门店点位，并明确“门店位置事实分布 · 非导航地图 · 不提供路线和实时路程”。
- 点击“使用当前位置”后，当前浏览器设备返回不可定位；页面自动降级为城市浏览，明确说明不会用默认坐标冒充用户位置，4 家门店与分布仍可使用。
- 1280px 浏览器下 header、内容和底部导航同轴居中；`documentElement.scrollWidth = clientWidth = 1265`，无页面级横向溢出。
- 精确定位成功分支、距离计算、排序、不持久化和越权边界由 5 项 API 自动化测试覆盖；浏览器验收没有授予或读取真实设备位置。

## 当前运行环境提示

验收时 `127.0.0.1:8787` 和 `127.0.0.1:43216` 仍由既有开发进程提供服务。不要盲目终止这些进程；下次先检查端口、进程归属和当前页面是否仍需要。

## 下一批建议

优先从 E8 未完成项选择一个独立可验收切片：

1. 支付前结构化确认页 + 支付连接器接口、回调、幂等与退款边界；或
2. 语音输入 + 明确转写确认 + 既有文本助手链路复用；或
3. 图片输入 + 上传安全边界 + 明确识别结果确认；或
4. 门店详情/团购方案 + 明确库存、价格和有效期。

推荐先做第 1 项，因为现有订座草稿、权威订单、零支付确认和取消边界已经齐备，可以在不接真实资金的前提下先完成可审计的支付连接器接口与确认边界。

开始下一批前先运行：

```powershell
npm.cmd test --workspace @lequ/api -- consumer-nearby-service.test.ts consumer-assistant-service.test.ts merchant-operations-service.test.ts auth-service.test.ts
npm.cmd run typecheck --workspace @lequ/api
npm.cmd run typecheck --workspace @lequ/consumer-miniapp
```
