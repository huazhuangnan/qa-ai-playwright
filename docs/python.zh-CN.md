# Python 使用指南

[使用人员](../README.md)

[TypeScript](typescript.zh-CN.md) | **Python**

---

用 pytest 跑测试，requests 处理 API，pytest-playwright 跑浏览器 E2E。以下命令从交付包或源码仓库根目录执行。
首次运行需联网；CLI 会安装 Python。公共说明见 [使用指南](../README.md)。

完整示例见 [Python 示例 QA](../apps/qa-ticket-app-suite-python/README.md)。

[快速开始](#快速开始) · [测试执行](#测试执行) · [项目结构](#项目结构) · [Python 风格与架构](python-code-style.zh-CN.md) · [报告与 Trace](#报告与-trace)

## 快速开始

### 第 1 步：准备环境

<details open>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
.\packages\qa-cli\bin\qa.cmd env init python
.\packages\qa-cli\bin\qa.cmd env check python
```

</details>

<details>
<summary>macOS / Linux</summary>

```bash
bash packages/qa-cli/bin/qa.sh env init python
bash packages/qa-cli/bin/qa.sh env check python
```

</details>

### 第 2 步：生成并检查项目

<details>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
.\packages\qa-cli\bin\qa.cmd project init .\workspaces\python-qa --language python
.\packages\qa-cli\bin\qa.cmd project check .\workspaces\python-qa
```

</details>

<details>
<summary>macOS / Linux</summary>

```bash
bash packages/qa-cli/bin/qa.sh project init ./workspaces/python-qa --language python
bash packages/qa-cli/bin/qa.sh project check ./workspaces/python-qa
```

</details>

### 第 3 步：激活环境并进入项目

<details>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
. .\.qa-env\activate.ps1
Set-Location .\workspaces\python-qa
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path .env.dev)) { Copy-Item .env.dev.example .env.dev }
if (!(Test-Path .env.stg)) { Copy-Item .env.stg.example .env.stg }
```

执行策略仅影响当前 PowerShell 进程。

</details>

<details>
<summary>macOS / Linux</summary>

```bash
source .qa-env/activate.sh
cd workspaces/python-qa
[ -f .env ] || cp .env.example .env
[ -f .env.dev ] || cp .env.dev.example .env.dev
[ -f .env.stg ] || cp .env.stg.example .env.stg
```

</details>

编辑 `.env`，按需要配置：

| 变量 | 用途 |
| --- | --- |
| `QA_ENV` | 选择环境 |
| `UI_BASE_URL` | 浏览器 context 入口 |
| `API_BASE_URL` | `qa_api` 入口 |
| `BASE_URL` | 兼容回退入口 |
| `QA_AUTH_STATE` | 指向未提交的 UI 登录态文件 |

按接口契约补充认证、角色、租户、资源、数据隔离、清理和功能开关变量。
变量名登记到 `docs/qa/inputs/input-index.md`。
系统和 CI 中的同名变量优先于 `.env`。

### 登录态集成

pytest-playwright 没有 setup project。
模板提供独立生成脚本，沿用 Playwright 的 `storageState` 方案。
并行测试修改账号状态时，每个 worker 使用独立账号和状态。

| 配置 | 用途 |
| --- | --- |
| `QA_AUTH_ROLES` | 生成一个或多个角色，例如 `admin,user` |
| `QA_AUTH_ROLE` | 选择默认 `page` 使用的角色 |
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

<details>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
.venv\Scripts\python.exe scripts/auth_state.py
```

</details>

<details>
<summary>macOS / Linux</summary>

```bash
.venv/bin/python scripts/auth_state.py
```

</details>

登录态使用规则：

- 状态写入 `playwright/.auth/<role>.json`。该目录已被忽略。
- `QA_AUTH_STATE` 可读取手工生成的状态文件。
- 多角色用例使用 `login_as('admin')`。每个页面使用独立 context。
- API 认证使用 `QA_API_TOKEN` 等显式配置，不与浏览器状态隐式共享。
- 登录态不包含服务端业务数据。数据种子和重置仍由项目 API 负责。

### 第 4 步：运行第一个测试

<details>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
.venv\Scripts\python.exe -m pytest tests/e2e --browser chromium --tracing retain-on-failure --screenshot only-on-failure
```

</details>

<details>
<summary>macOS / Linux</summary>

```bash
.venv/bin/python -m pytest tests/e2e --browser chromium --tracing retain-on-failure --screenshot only-on-failure
```

</details>

## 测试执行

在 `workspaces/python-qa` 执行。

<details>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
.venv\Scripts\python.exe -m pytest tests/unit
.venv\Scripts\python.exe -m pytest -m smoke
.venv\Scripts\python.exe -m pytest -m regression
.venv\Scripts\python.exe -m pytest -m contract
.venv\Scripts\python.exe -m pytest -m integration
.venv\Scripts\python.exe -m pytest tests/functional
.venv\Scripts\python.exe -m pytest tests/api
```

</details>

<details>
<summary>macOS / Linux</summary>

```bash
.venv/bin/python -m pytest tests/unit
.venv/bin/python -m pytest -m smoke
.venv/bin/python -m pytest -m regression
.venv/bin/python -m pytest -m contract
.venv/bin/python -m pytest -m integration
.venv/bin/python -m pytest tests/functional
.venv/bin/python -m pytest tests/api
```

</details>

执行前检查以下配置：

- **API 门禁**：先完成业务接入。API 测试默认跳过。
  CI 手动门禁设置 `REQUIRE_API_TESTS=1`。缺少 `API_BASE_URL` 和 `BASE_URL` 时门禁失败。
  在 GitHub Actions 手动运行工作流时，选择 `QA_ENV` 并启用 `run_api`。
- **环境与认证**：模板演示 `QA_API_BASE_URL`、`QA_BASE_URL` 和 `QA_API_TOKEN`。
  按项目变量扩展工作流 `env` 和仓库 secrets。不要假设所有项目只使用这几个 secret。
  API 认证适配支持 `QA_API_TOKEN`、`QA_API_TOKEN_HEADER` 和 `QA_API_AUTH_SCHEME`。
  账号、Cookie、OAuth、多租户或业务资源变量按项目实现。
- **CI 范围**：PR 在 Linux 和 Chromium 上快速验证。
  手动启用 `full_suite` 后运行三平台和三浏览器矩阵。
- **浏览器**：测试时加 `--browser chromium --tracing retain-on-failure --screenshot only-on-failure`。
- **写入保护**：生产类写操作使用 `require_write_access` fixture。
  默认拒绝生产写入，除非显式设置 `QA_ALLOW_PRODUCTION_WRITES=true`。

## 项目结构

```text
python-qa/
├── .env.example          本地配置模板
├── .env.dev.example      dev 配置模板
├── .env.stg.example      stg 配置模板
├── VERSION               语言模板版本
├── CHANGELOG.md          模板变化
├── conftest.py           `.env` 加载入口
├── requirements.in       直接依赖
├── requirements.lock     完整依赖锁
├── requirements.lock.meta.json  锁文件来源基线
├── pytest.ini            运行器配置
├── scripts/              锁文件检查和角色状态生成
├── tests/
│   ├── api/              API 测试
│   ├── fixtures/         API、数据和生产写保护
│   ├── fixtures/auth.py  角色状态路径与环境变量工具
│   ├── functional/       功能逻辑测试
│   ├── e2e/              浏览器测试
│   └── unit/             模板自身单元测试
├── playwright/.auth/     本地角色状态，不提交
├── docs/qa/              工作模板
└── .github/workflows/    CI
```

## 报告与 Trace

JUnit 在 `reports/`。截图和 Trace 在 `test-results/`。

`project init` 使用 universal 解析生成跨平台哈希锁。
CI 会检查锁文件与环境基线，并用 `--require-hashes` 安装。

<details>
<summary>Windows（PowerShell 7 优先，5.1 降级）</summary>

```powershell
.venv\Scripts\python.exe -m playwright show-trace test-results/<trace.zip路径>
```

</details>

<details>
<summary>macOS / Linux</summary>

```bash
.venv/bin/python -m playwright show-trace test-results/<trace.zip路径>
```

</details>

分享 Trace 前检查敏感信息。
