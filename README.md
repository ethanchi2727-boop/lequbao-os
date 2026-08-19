# 乐趣宝与乐趣生活 V6.1

这是依据 V6.1 正式开发总包重建的新平台。V5 代码保留在 `main` 分支和 Git 历史中，当前升级在
`upgrade/v6.1-rebuild` 分支推进，不在新架构中复制旧实现。

## 当前阶段

- 已固化唯一开发基线、总包校验结果、冲突裁决和 V5→V6 迁移矩阵。
- 已从 PostgreSQL 15+ 的 73 表正式基线扩展到 164 表、26 个迁移的审计目标，包含租户 RLS、不可变台账、商业交易、AI/客服、运营和平台控制面。
- 当前实现 192 条范围明确的 API 路径、135 个乐趣宝叶页面与 62 个小程序叶页面；全部 197 个发布叶页面使用权威服务端边界。
- 全仓门禁覆盖格式、Lint、契约/RBAC/OpenAPI、安全/运维/部署、六个类型检查、79 个测试文件、401 个测试和六个生产构建。

权威状态见 [PROJECT_STATE.md](PROJECT_STATE.md)，架构决策见
[docs/adr/0001-v6-1-rebuild.md](docs/adr/0001-v6-1-rebuild.md)。

## 本地命令

要求 Node.js 22.23.1+ 与 Corepack。

```powershell
corepack pnpm install
corepack pnpm check
```

数据库需要 PostgreSQL 15+：

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/schema.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/tests/rls.sql
```

GitHub Actions 还会执行完整 22 个数据库 fixtures、73 表增量升级、分账、商家录入、库存并发、Worker 故障注入和性能证据快照。

启动 API 还必须配置会话与对象存储边界：

```powershell
$env:AUTH_JWT_SECRET = '<由密钥管理系统提供的高强度密钥>'
$env:OBJECT_STORE_GATEWAY_URL = 'https://<租户对象存储网关>'
$env:OBJECT_STORE_SIGNING_SECRET = '<至少 32 字节的对象授权密钥>'
```

这些密钥只从部署环境或密钥服务读取，不得提交到仓库。企业微信回调通过 `WECOM_CONFIG_GATEWAY_URL` 和 `WECOM_CONFIG_GATEWAY_TOKEN` 接入多租户配置/身份边界；网关按 CorpID 解析密钥服务中的回调配置，并把成员解析为当前租户、用户、门店和建档会话，API 会拒绝跨 CorpID 响应。

Worker 是按租户、一次性执行的安全单元，由外部调度器为每个活跃租户触发。`WORKER_TENANT_ID`、`OUTBOX_EVENT_GATEWAY_URL` 和 `OUTBOX_EVENT_GATEWAY_TOKEN` 为必填；没有事件网关时 Worker 会在领取事件前失败，不能把 Outbox 留在 `PROCESSING`。发布使用事件 ID 作为网关幂等键，失败进入有上限的重试/死信链，崩溃留下的旧锁会在五分钟后安全重领。

本地查看乐趣宝建档页面：

```powershell
corepack pnpm --filter @lequ/workbench-web dev
```

打开 `http://127.0.0.1:4173/bao/page-014?demo=1`。`demo=1` 仅用于视觉验收，不代表真实供应商或生产数据联调。

不带 `demo=1` 时页面进入生产模式，从同源 API 或 `apiBase` 查询参数指定的 API 读取数据。员工签名会话必须由登录壳写入当前标签页的 `sessionStorage['lequbao.employee-session']`；不得把 Bearer 会话放入 URL。可通过 `sessionId` 恢复已有建档会话，否则页面会新建会话。
