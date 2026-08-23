# ADR-0012：UniApp 多终端产品拓扑

## 状态

Accepted. This decision supersedes ADR-0004 and ADR-0011 where they excluded UniApp or treated native WXML and H5 as independent active implementations.

## 产品终端

| 产品               | 核心终端       | 同步终端                 | 唯一活跃实现                                                             |
| ------------------ | -------------- | ------------------------ | ------------------------------------------------------------------------ |
| 乐趣生活           | 微信小程序、H5 | 后续按需扩展其他移动平台 | `apps/life-uniapp`，一套 Vue 3 UniApp 源码同时构建 `h5` 与 `mp-weixin`   |
| 乐趣宝             | PC Web         | 移动 H5、微信小程序      | PC 使用 `apps/workbench-web`；移动 H5 与微信小程序使用 `apps/bao-uniapp` |
| 商家独立小程序模板 | 微信小程序     | 无                       | 与乐趣宝员工小程序严格分离，不得冒充乐趣宝小程序                         |

乐趣生活不是乐趣宝移动端。乐趣宝 PC、移动 H5 和小程序共享业务能力、权限和接口，但按屏幕与使用场景重新组织页面，不能把 PC 等比缩小。

## 技术决策

- 两个移动产品使用 Vue 3 UniApp CLI 工程；同一源码分别执行 `build:h5` 和 `build:mp-weixin`。
- DCloud 依赖必须使用同一发行编号并锁定版本；升级必须同时验证 H5 和微信小程序构建。
- `apps/consumer-miniapp` 的原生 WXML 与本轮原生 ESM 乐趣生活 H5 只作为迁移输入，功能迁入 `apps/life-uniapp` 后删除活跃构建入口。
- 乐趣宝 PC 继续使用独立 Web 工程，因为其信息密度、快捷操作和大屏布局与移动端不同；移动端由 `apps/bao-uniapp` 输出 H5 和微信小程序。
- `apps/merchant-miniapp` 继续代表消费者访问某一商家的独立店铺模板，不等于乐趣宝员工端。

## 发布路径

- 乐趣生活 H5：`/life/*`。
- 乐趣宝 PC：`/bao/*`。
- 乐趣宝移动 H5：`/bao-mobile/*`。
- 两个产品分别拥有微信小程序 AppID、隐私清单、发布版本和回滚证据。

## 迁移与回滚

先让 UniApp 双构建通过并逐页迁移，旧实现保持只读对照；达到页面、API、状态和视觉等价后，切换 Web 静态入口和小程序构建入口。回滚只切回上一份构建产物，不回滚 API、数据库或交易事实。
