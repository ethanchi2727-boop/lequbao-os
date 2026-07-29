# AI 开发质量门禁模板

一个可复用的 GitHub 模板仓库，为任何项目提供 AI 开发质量门禁基础设施。从本模板创建新项目后，TRAE 只需读取模板、识别技术栈并完成一次初始化，即可获得完整的测试规范和质量门禁能力。

## 包含什么

- **AI 质量守门员 Skill**：TRAE 在开发时自动遵守的质量流程
- **测试规范**：单元测试、接口测试、端到端测试、回归测试标准
- **测试矩阵模板**：通用高风险用例模板（支付、退款、余额、并发、幂等等）
- **CI/CD**：GitHub Actions 自动执行 lint、类型检查、测试、构建
- **质量门禁运行器**：`scripts/quality-gate.mjs`，按配置执行真实检查
- **项目初始化指引**：TRAE 自动识别技术栈并配置质量门禁

## 如何从模板创建新项目

1. 点击本仓库右上角 **Use this template** → **Create a new repository**
2. 填写新仓库名称，创建
3. 在 TRAE 中打开新项目
4. 发送下方的一句初始化指令给 TRAE

## 一句话初始化指令（直接发给 TRAE）

```
请按 docs/PROJECT_INITIALIZATION.md 初始化质量门禁：识别项目技术栈，安装对应测试工具，配置测试环境隔离，填写 quality-gate.config.json（initialized 设为 true），然后执行 node scripts/quality-gate.mjs 验证全部通过。
```

## 日常使用

### 开发新功能 / 修复 Bug 时
TRAE 会自动调用 `.trae/skills/ai-quality-gate/SKILL.md` 中的质量守门员流程，包括影响分析、测试编写、回归验证和结果报告。

### 提交前验证
```bash
node scripts/quality-gate.mjs
```

### Bug 修复要求
- 先编写能稳定复现 Bug 的失败测试
- 修复代码使测试通过
- 该复现测试作为永久回归测试保留，不得删除

### 发布前检查
- 确认所有 P0 测试通过
- 确认类型检查和构建通过
- 确认 lint 无错误
- 确认 CI 全部通过

## 质量门禁配置

配置文件 `quality-gate.config.json` 登记项目模块和实际执行命令：

```json
{
  "initialized": true,
  "projectName": "my-app",
  "techStack": ["typescript", "express"],
  "modules": [
    {
      "name": "backend",
      "path": "backend",
      "commands": {
        "lint": { "cmd": "npm run lint", "applicable": true, "reason": "" },
        "typecheck": { "cmd": "npm run typecheck", "applicable": true, "reason": "" },
        "test": { "cmd": "npm run test", "applicable": true, "reason": "" },
        "build": { "cmd": "npm run build", "applicable": true, "reason": "" }
      }
    }
  ]
}
```

**关键规则**：
- 未初始化（`initialized: false`）时质量门禁必须失败
- 某项检查不适用时必须写明理由，不能省略
- 禁止用 `--if-present` 让缺失命令静默通过
- 禁止把"没有测试"显示为"测试通过"

## 适配已有项目

将本模板的文件复制到已有项目根目录，然后执行初始化指令即可。详见 [docs/PROJECT_INITIALIZATION.md](docs/PROJECT_INITIALIZATION.md)。

## 目录结构

```
.
├── .trae/skills/ai-quality-gate/SKILL.md   # TRAE 质量守门员 Skill
├── .github/workflows/ci.yml                 # GitHub Actions CI
├── docs/
│   ├── TESTING_STANDARD.md                  # 测试规范
│   └── PROJECT_INITIALIZATION.md            # 初始化指引
├── tests/
│   └── TEST_MATRIX_TEMPLATE.md              # 测试矩阵模板
├── scripts/
│   └── quality-gate.mjs                     # 质量门禁运行器
├── quality-gate.config.json                 # 质量门禁配置
├── .gitignore
└── README.md
```

## 支持的技术栈

- Node.js / TypeScript / JavaScript
- Vue / Vite / UniApp
- Express / Koa / Fastify
- React / Next.js
- Java（基本支持）
- Go（基本支持）
- Python（基本支持）

## 许可

MIT
