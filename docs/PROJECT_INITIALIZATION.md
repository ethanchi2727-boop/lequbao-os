# 项目初始化指引

本文件指导 TRAE 在新项目（从本模板创建）或已有项目中完成质量门禁初始化。

## 初始化目标

1. 识别项目真实技术栈
2. 安装对应的测试和检查工具
3. 创建测试数据库、Mock 接口和测试账号隔离
4. 自动填写 `quality-gate.config.json`
5. 完成初始化后实际执行一次完整质量门禁

## 初始化流程

### 第一步：识别技术栈

读取项目文件判断技术栈：

| 文件/依赖 | 技术栈 | 测试工具 | Lint | 类型检查 |
|-----------|--------|----------|------|----------|
| `package.json` 含 `typescript` | TypeScript | Jest/Vitest | ESLint | `tsc --noEmit` |
| `package.json` 含 `vue` | Vue | Vitest + @vue/test-utils | ESLint + eslint-plugin-vue | `vue-tsc --noEmit` |
| `package.json` 含 `vite` | Vite | Vitest | ESLint | 根据框架 |
| `package.json` 含 `@dcloudio/uni-app` | UniApp | Vitest | ESLint | `vue-tsc --noEmit` |
| `package.json` 含 `express` / `koa` / `fastify` | Node 后端 | Jest + Supertest | ESLint | `tsc --noEmit` |
| `package.json` 含 `react` | React | Jest + @testing-library/react | ESLint | `tsc --noEmit` |
| `package.json` 含 `next` | Next.js | Jest + Playwright | ESLint | `tsc --noEmit` |
| `pom.xml` / `build.gradle` | Java | JUnit | Checkstyle | javac |
| `go.mod` | Go | go test | golangci-lint | go vet |
| `requirements.txt` / `pyproject.toml` | Python | pytest | flake8/ruff | mypy |

### 第二步：识别项目模块

项目可能为单模块或多模块（monorepo）：

- **单模块**：根目录有 `package.json`，无子模块
- **多模块**：根目录下有多个子目录各含 `package.json`（如 `backend/`、`frontend/`）

对每个模块分别登记检查命令。

### 第三步：安装测试依赖

**根据识别到的技术栈安装对应工具，不要强行给所有项目安装相同框架。**

Node.js 项目示例：
```bash
# 后端（Express + TypeScript）
npm install --save-dev jest ts-jest @types/jest supertest @types/supertest eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin

# 前端（Vue + Vite）
npm install --save-dev vitest @vue/test-utils jsdom eslint eslint-plugin-vue vue-tsc
```

### 第四步：创建测试环境隔离

1. **测试数据库**：创建独立的测试数据库配置（如 `.env.test`），使用内存数据库或独立实例
2. **Mock 接口**：对外部服务（支付、短信、推送）创建 Mock
3. **测试账号**：创建测试专用账号，与正式账号隔离

### 第五步：填写 quality-gate.config.json

根据识别结果填写配置。**关键规则**：
- `initialized` 必须设为 `true`
- 每个模块必须填写 `lint`、`typecheck`、`test`、`build` 命令
- 如果某项检查确实不适用，必须在 `applicable: false` 中写明 `reason`，不能直接省略
- 命令必须真实存在且可执行，禁止使用 `--if-present`

配置示例（多模块项目）：
```json
{
  "initialized": true,
  "projectName": "my-project",
  "techStack": ["typescript", "express", "vue", "vite"],
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
    },
    {
      "name": "frontend",
      "path": "frontend",
      "commands": {
        "lint": { "cmd": "npm run lint", "applicable": true, "reason": "" },
        "typecheck": { "cmd": "npm run typecheck", "applicable": true, "reason": "" },
        "test": { "cmd": "npm run test", "applicable": true, "reason": "" },
        "build": { "cmd": "npm run build", "applicable": true, "reason": "" }
      }
    }
  ],
  "p0TestsRequired": true,
  "notes": "初始化完成"
}
```

### 第六步：执行完整质量门禁

初始化后必须实际执行一次：
```bash
node scripts/quality-gate.mjs
```

全部通过后初始化才算完成。

## 已有项目补装质量门禁

对于已有项目，将本模板的以下文件复制到项目根目录，然后按上述流程初始化：

- `.trae/skills/ai-quality-gate/SKILL.md`
- `docs/TESTING_STANDARD.md`
- `tests/TEST_MATRIX_TEMPLATE.md`（重命名为 `TEST_MATRIX.md`）
- `.github/workflows/ci.yml`
- `quality-gate.config.json`
- `scripts/quality-gate.mjs`
- `docs/PROJECT_INITIALIZATION.md`

## 注意事项

1. 不要把模板的示例配置当作所有项目的通用配置
2. 不要强行安装项目不需要的框架
3. 必须先识别真实技术栈，再安装对应工具
4. 某项检查不适用时必须写明理由，不能省略
5. 模板既支持全新项目，也支持已有项目补装
