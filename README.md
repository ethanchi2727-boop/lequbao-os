# 乐趣生活 V5.0

乐趣生活 V5.0 全平台 Monorepo。当前包含四个可独立发布的小程序、五角色端到端验收台、模块化单体 API、SQLite 本地适配器、RBAC/数据权限、Aurora Living 设计系统和 1-6 级产品目录。

运行环境要求 Node.js `>=22.5.0`。仓库不包含本地 `.env`、SQLite 运行数据、依赖目录或构建产物；首次在云端工作区打开后先执行 `npm ci`。

完整完成度以 [全量需求追踪矩阵](./docs/TRACEABILITY.md) 为准；未标记为 `[x]` 的业务不得视为已开发完成。

## 工程入口

| 产品 | Workspace | H5 端口 | 微信构建目录 |
| --- | --- | ---: | --- |
| 乐趣生活 | `@lequ/consumer-miniapp` | 43216 | `apps/consumer-miniapp/dist/build/mp-weixin` |
| 经营宝 | `@lequ/merchant-miniapp` | 43217 | `apps/merchant-miniapp/dist/build/mp-weixin` |
| 销售宝 | `@lequ/sales-miniapp` | 43218 | `apps/sales-miniapp/dist/build/mp-weixin` |
| 城市服务商 | `@lequ/provider-miniapp` | 43219 | `apps/provider-miniapp/dist/build/mp-weixin` |
| 五角色验收台 | `@lequ/mobile` | 43215 | `apps/mobile/dist/build/mp-weixin` |
| API | `@lequ/api` | 8787 | `apps/api/dist/server.js` |
| 统一 PC 后台 | `@lequ/admin-web` | 43220 | `apps/admin-web/dist` |

## 常用命令

```bash
npm install
npm run typecheck
npm test
npm run build:miniapps
npm run build:weixin
npm run check
node scripts/quality-gate.mjs
```

## 云端开发

```bash
git clone https://github.com/ethanchi2727-boop/lequbao-os.git
cd lequbao-os
npm ci
npm run typecheck
```

GitHub Actions 会在 `main` / `develop` 推送及面向 `main` 的 Pull Request 上执行真实类型检查、自动化测试、全仓构建和四端微信小程序构建。质量门禁配置见 [`quality-gate.config.json`](./quality-gate.config.json)，测试规范见 [`docs/TESTING_STANDARD.md`](./docs/TESTING_STANDARD.md)。

启动指定产品：

```bash
npm run dev:h5 -w @lequ/consumer-miniapp
npm run dev:h5 -w @lequ/merchant-miniapp
npm run dev:h5 -w @lequ/sales-miniapp
npm run dev:h5 -w @lequ/provider-miniapp
npm run dev:admin
```

API 默认只监听 `127.0.0.1`。开发会话令牌仅用于本地适配器，生产环境必须接入 OAuth 2.1/OIDC；详见 [平台架构](./docs/ARCHITECTURE.md) 与 [安全说明](./SECURITY.md)。

当前已完成 E1 商家入网业务域，以及 E2 MiniApp Factory、E3 GEO OS、E4 Skill Network 的首个垂直切片。启动 API 后，可在销售宝完成入网资料闭环，再从城市服务商工作台依次完成模板建站、分级发布、GEO 九维扫描、渠道修复、内容确认、Skill 生成测试、认证上线与受控调用。未完成边界仍以追踪矩阵为准。
