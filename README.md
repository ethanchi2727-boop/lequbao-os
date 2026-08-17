# 乐趣宝与乐趣生活 V6.1

这是依据 V6.1 正式开发总包重建的新平台。V5 代码保留在 `main` 分支和 Git 历史中，当前升级在
`upgrade/v6.1-rebuild` 分支推进，不在新架构中复制旧实现。

## 当前阶段

- 已固化唯一开发基线、总包校验结果、冲突裁决和 V5→V6 迁移矩阵。
- 已从 PostgreSQL 15+ 的 73 表正式基线扩展到 78 表审计目标，包含租户 RLS、不可变台账、收益结算、可信 AI 商户建档和单次消费上传票据。
- 当前实现 17 条范围明确的 API 路径，以及模块化单体 API、异步 Worker、共享契约、乐趣宝响应式 Web 与全仓质量门。

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

本地没有 PostgreSQL 时，推送分支后由 GitHub Actions 的真实 PostgreSQL 服务执行这两项。

启动 API 还必须配置会话与对象存储边界：

```powershell
$env:AUTH_JWT_SECRET = '<由密钥管理系统提供的高强度密钥>'
$env:OBJECT_STORE_GATEWAY_URL = 'https://<租户对象存储网关>'
$env:OBJECT_STORE_SIGNING_SECRET = '<至少 32 字节的对象授权密钥>'
```

这些密钥只从部署环境或密钥服务读取，不得提交到仓库。企业微信回调只有在完整配置 `WECOM_CORP_ID`、`WECOM_CALLBACK_TOKEN`、`WECOM_ENCODING_AES_KEY`、`WECOM_TENANT_ID`、`WECOM_USER_ID`、`WECOM_MEMBER_ID` 和 `WECOM_INTAKE_SESSION_ID` 时启用；数据库角色仍会在处理消息时再次校验。

本地查看乐趣宝建档页面：

```powershell
corepack pnpm --filter @lequ/workbench-web dev
```

打开 `http://127.0.0.1:4173/bao/page-014?demo=1`。`demo=1` 仅用于视觉验收，不代表真实供应商或生产数据联调。

不带 `demo=1` 时页面进入生产模式，从同源 API 或 `apiBase` 查询参数指定的 API 读取数据。员工签名会话必须由登录壳写入当前标签页的 `sessionStorage['lequbao.employee-session']`；不得把 Bearer 会话放入 URL。可通过 `sessionId` 恢复已有建档会话，否则页面会新建会话。
