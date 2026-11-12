# TypeScript 使用指南

[使用文档](README.md) | [维护文档](https://github.com/huazhuangnan/qa-ai-playwright/blob/main/docs/maintainers/README.md)

**TypeScript** | [Python](python.zh-CN.md)

---

用 Playwright Test 统一跑 API、功能逻辑和 E2E。以下命令从交付包或源码仓库根目录执行。
首次运行需联网；CLI 会安装 Node。公共说明见 [使用指南](../../README.md)。

[快速开始](#快速开始) · [测试执行](#测试执行) · [项目结构](#项目结构) · [TypeScript 风格与架构](typescript-code-style.zh-CN.md) · [报告与 Trace](#报告与-trace)

## 快速开始

### 第 1 步：准备环境

<details open>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
.\packages\qa-cli\bin\qa.cmd env init typescript
.\packages\qa-cli\bin\qa.cmd env check typescript
```

</details>

<details>
<summary>macOS / Linux</summary>

```bash
bash packages/qa-cli/bin/qa.sh env init typescript
bash packages/qa-cli/bin/qa.sh env check typescript
```

</details>

### 第 2 步：生成并检查项目

<details>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
.\packages\qa-cli\bin\qa.cmd project init .\workspaces\my-qa --language typescript
.\packages\qa-cli\bin\qa.cmd project check .\workspaces\my-qa
```

</details>

<details>
<summary>macOS / Linux</summary>

```bash
bash packages/qa-cli/bin/qa.sh project init ./workspaces/my-qa --language typescript
bash packages/qa-cli/bin/qa.sh project check ./workspaces/my-qa
```

</details>

### 第 3 步：激活环境并进入项目

<details>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
. "$HOME\.qa-ai-playwright\activate.ps1"
Set-Location .\workspaces\my-qa
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path .env.dev)) { Copy-Item .env.dev.example .env.dev }
if (!(Test-Path .env.stg)) { Copy-Item .env.stg.example .env.stg }
```

执行策略仅影响当前 PowerShell 进程。

</details>

<details>
<summary>macOS / Linux</summary>

```bash
source ~/.qa-ai-playwright/activate.sh
cd workspaces/my-qa
[ -f .env ] || cp .env.example .env
[ -f .env.dev ] || cp .env.dev.example .env.dev
[ -f .env.stg ] || cp .env.stg.example .env.stg
```

</details>

编辑 `.env`，按需要配置：

| 变量 | 用途 |
| --- | --- |
| `QA_ENV` | 选择环境 |
| `UI_BASE_URL` | 页面入口 |
| `API_BASE_URL` | API fixture 入口 |
| `PLAYWRIGHT_WEB_SERVER_COMMAND` | 配置本地服务启动命令 |
| `QA_AUTH_STATE` | 指向未提交的 UI 登录态文件 |

按接口契约补充认证、角色、租户、资源、数据隔离、清理和功能开关变量。
变量名登记到 `docs/qa/inputs/input-index.md`。
系统和 CI 中的同名变量优先于 `.env`。

### 登录态集成

官方推荐使用 `storageState`、setup project 和 project dependencies。
模板按此方式生成角色状态，并由浏览器 project 自动依赖 auth setup。

| 场景 | 推荐做法 |
| --- | --- |
| 只读测试共享一个账号 | 单个共享状态文件 |
| 并行测试修改账号状态 | 每个 worker 使用独立账号和状态 |
| 多角色或租户权限 | 每个角色或租户一个状态文件 |
| 测试登录流程本身 | 清空默认状态，从匿名 context 开始 |

| 配置 | 用途 |
| --- | --- |
| `QA_AUTH_ROLES` | 生成一个或多个角色，例如 `admin,user` |
| `QA_AUTH_ROLE` | 选择浏览器 project 默认使用的角色 |
| `QA_AUTH_<ROLE>_USERNAME` | 角色账号 |
| `QA_AUTH_<ROLE>_PASSWORD` | 角色密码 |
| `QA_AUTH_LOGIN_PATH` | 登录页路径 |
| `QA_AUTH_USERNAME_SELECTOR` | 账号输入框 |
| `QA_AUTH_PASSWORD_SELECTOR` | 密码输入框 |
| `QA_AUTH_SUBMIT_SELECTOR` | 登录按钮 |
| `QA_AUTH_SUCCESS_SELECTOR` | 登录成功后的可见元素 |
| `QA_AUTH_SUCCESS_URL` | 登录成功后的 URL，可替代成功元素 |
| `QA_AUTH_INDEXED_DB` | 认证数据在 IndexedDB 时设为 `true` |

角色凭据写入 `.env.<环境>` 或 CI secrets。
登录选择器按业务页面调整。

```bash
bun run auth:setup
bun run test:e2e
```

登录态使用规则：

- 状态写入 `playwright/.auth/<role>.json`。该目录已被忽略。
- 不设置 `QA_AUTH_ROLES` 时，setup project 不启用。
- `QA_AUTH_STATE` 可读取手工生成的状态文件。
- 多角色用例使用 `loginAs('admin')`。每个页面使用独立 context。
- 匿名测试用 `test.use({ storageState: { cookies: [], origins: [] } })` 清空默认状态。
- API 认证使用 `QA_API_TOKEN` 等显式配置，不与浏览器状态隐式共享。
- 登录态不包含服务端业务数据。数据种子和重置仍由项目 API 负责。

### 第 4 步：运行第一个测试

```bash
pnpm exec playwright test tests/e2e --project=chromium
pnpm exec playwright show-report
```

## 测试执行

在 `workspaces/my-qa` 执行。

```bash
bun run test:unit
bun run test:smoke
bun run test:regression
bun run test:api
bun run test:contract
bun run test:integration
pnpm exec playwright test tests/functional --project=chromium
bun run test:e2e
bunx tsc --noEmit
```

执行前检查以下配置：

- **API 门禁**：先完成业务接入。API 测试默认跳过。
  CI 手动门禁设置 `REQUIRE_API_TESTS=1`。缺少 `API_BASE_URL` 时门禁失败。
  在 GitHub Actions 手动运行工作流时，选择 `QA_ENV` 并启用 `run_api`。
- **环境与认证**：模板演示 `QA_API_BASE_URL` 和 `QA_API_TOKEN`。
  按项目变量扩展工作流 `env` 和仓库 secrets。不要假设所有项目只使用这几个 secret。
  API 认证适配支持 `QA_API_TOKEN`、`QA_API_TOKEN_HEADER` 和 `QA_API_AUTH_SCHEME`。
  账号、Cookie、OAuth、多租户或业务资源变量按项目实现。
- **CI 范围**：PR 和普通 push 运行 Linux Chromium smoke。
  手动 `suite=full` 运行完整环境和项目矩阵。
- **浏览器**：仅安装 Chromium 时保留 `--project=chromium`。
  安装全部浏览器后可用 `bun run test`。
- **写入保护**：生产类写操作调用 `requireWriteAccess` fixture。
  默认拒绝生产写入，除非显式设置 `QA_ALLOW_PRODUCTION_WRITES=true`。

## 项目结构

```text
my-qa/
├── .env.example          本地配置模板
├── .env.dev.example      dev 配置模板
├── .env.stg.example      stg 配置模板
├── VERSION               语言模板版本
├── CHANGELOG.md          模板变化
├── package.json          依赖与脚本
├── pnpm-lock.yaml        依赖锁
├── playwright.config.ts  浏览器与报告配置
├── tsconfig.json         类型配置
├── tests/
│   ├── api/              API 测试
│   ├── fixtures/         API、数据和生产写保护
│   ├── auth/             角色状态路径与环境变量工具
│   ├── functional/       功能逻辑测试
│   ├── e2e/              浏览器测试
│   └── unit/             模板自身单元测试
├── playwright/.auth/     本地角色状态，不提交
├── docs/qa/              工作模板
└── .github/workflows/    CI
```

## 报告与 Trace

HTML 报告在 `playwright-report/`。JUnit 在 `reports/`。截图和 Trace 在 `test-results/`。

```bash
pnpm exec playwright show-report
pnpm exec playwright show-trace test-results/<trace.zip路径>
```

分享 Trace 前检查敏感信息。

CI 和报告配置：

- 首次生成后提交 `pnpm-lock.yaml`。CI 检查锁文件后执行 `pnpm install --frozen-lockfile`。
- `failOnFlakyTests` 在 CI 中阻止重试后通过掩盖不稳定测试。
- 套件扩大后再启用 `--shard` 和 blob report 合并。
