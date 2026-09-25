# controlled-preproduction 配置名称缺口

2026-09-25 从 GitHub 环境 API 只读取得 Secret 和变量的**名称**，用 `tooling/controlled-environment-inventory.mjs --github=ethanchi2727-boop/lequbao-os` 对照受保护工作流。未读取或保存配置值；此清单是检查时点快照，补齐后须重新运行名称盘点和受控预检。

| 阶段                           | 已有/所需 | 待补                                   |
| ------------------------------ | --------: | -------------------------------------- |
| 47：身份、对象存储、企微与隐私 |      2/15 | 6 个 Secret、7 个变量                  |
| 48：支付和小程序网关           |       3/9 | 3 个 Secret、3 个变量                  |
| 49：受控运行与性能             |      7/32 | 11 个 Secret、14 个变量                |
| 50：结果汇总                   |       1/2 | `CONTROLLED_RESULTS_FILE` 外部结果文件 |

合并去重后，GitHub 环境还缺 **20/30 个 Secret、24/26 个变量**；未发现多余或放错类型的名称。`RELEASE_COMMIT` 名称已存在，但其值必须与本次候选提交严格一致；阶段 50 的结果文件不是 GitHub 环境变量。

## 阶段 47 待补

Secret：`DATABASE_URL`、`IDENTITY_PROVIDER_GATEWAY_TOKEN`、`PRIVACY_DELETION_GATEWAY_TOKEN`、`PRIVACY_EXPORT_GATEWAY_TOKEN`、`WECOM_CONFIG_GATEWAY_TOKEN`、`WECOM_NOTIFICATION_GATEWAY_TOKEN`。

变量：`IDENTITY_PROVIDER_GATEWAY_URL`、`OBJECT_STORE_GATEWAY_URL`、`PRIVACY_DELETION_GATEWAY_URL`、`PRIVACY_EXPORT_GATEWAY_URL`、`TRUSTED_PROXY_CIDRS`、`WECOM_CONFIG_GATEWAY_URL`、`WECOM_NOTIFICATION_GATEWAY_URL`。

## 阶段 48 待补

Secret：`COMMERCE_PROVIDER_GATEWAY_TOKEN`、`MINI_PROGRAM_BUILDER_TOKEN`、`MINI_PROGRAM_GATEWAY_TOKEN`。

变量：`COMMERCE_PROVIDER_GATEWAY_URL`、`MINI_PROGRAM_BUILDER_URL`、`MINI_PROGRAM_GATEWAY_URL`。

## 阶段 49 待补

Secret：`CUSTOMER_SERVICE_BUSINESS_TOOLS_TOKEN`、`CUSTOMER_SERVICE_KNOWLEDGE_TOKEN`、`CUSTOMER_SERVICE_MODEL_TOKEN`、`GEO_PLUGIN_GATEWAY_TOKEN`、`OUTBOX_EVENT_GATEWAY_TOKEN`、`PERFORMANCE_CONVERSATION_BODY_JSON`、`PERFORMANCE_DATABASE_URL`、`PERFORMANCE_MESSAGE_BEARER_TOKEN`、`PERFORMANCE_READ_BEARER_TOKEN`、`PERFORMANCE_WRITE_BEARER_TOKEN`、`PERFORMANCE_WRITE_BODY_JSON`。

变量：`CONTROLLED_BASE_URL`、`CUSTOMER_SERVICE_BUSINESS_TOOLS_URL`、`CUSTOMER_SERVICE_KNOWLEDGE_URL`、`CUSTOMER_SERVICE_MODEL_URL`、`GEO_PLUGIN_GATEWAY_URL`、`INTERNAL_API_URL`、`OUTBOX_EVENT_GATEWAY_URL`、`PERFORMANCE_BASE_URL`、`PERFORMANCE_CANDIDATE_IMAGE_MANIFEST_JSON`、`PERFORMANCE_CONVERSATION_PATH`、`PERFORMANCE_DEPLOYED_IMAGES_JSON`、`PERFORMANCE_REPORT_PATH`、`PERFORMANCE_WRITE_PATH`、`WORKER_TENANT_ID`。

## 接入顺序和证据

1. 环境负责人按阶段配置名称和正确存储类型，在受控环境内独立核验值、服务权限、网络目标、测试身份及批准身份；不要把 Secret 值放进 PR、日志或此清单。
2. 资金口径 P0 阻断解除、候选提交固定后，核对 `RELEASE_COMMIT`、候选镜像清单和已部署镜像对应同一提交，再运行受保护的阶段 47–49 预检。
3. 保存真实备份恢复、浏览器/微信真机、支付/退款与奖励对账、性能、隐私和故障恢复的受控证据，组成 `CONTROLLED_RESULTS_FILE`，由独立复核人完成阶段 50。

仅名称齐备不证明值有效、服务可用、资金闭环或页面验收完成；所有阶段都需按 `docs/release/50_STAGE_FRONTEND_PRODUCTIZATION_PLAN.md` 和受控工作流验证。
