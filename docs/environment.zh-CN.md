# 环境初始化

本页说明运行时、项目生成、目录和卸载。
测试代码与报告命令见对应的 [TypeScript](typescript.zh-CN.md) 和 [Python](python.zh-CN.md) 指南。

## Windows

Windows 的启动顺序如下：

1. 使用 PowerShell 7 `pwsh.exe`。
2. PowerShell 7 不可用时，使用 Windows PowerShell 5.1。
3. 两者都不可用时，给出明确错误。

`qa.cmd` 自动完成选择和降级。可设置 `QA_POWERSHELL` 强制指定解释器。

## 系统要求

- Windows 11、Windows Server 2019+ 或受支持的 WSL。
- macOS 14 Sonoma 或更高。
- Debian 12/13 或 Ubuntu 22.04/24.04/26.04。
- x86-64 或 arm64。
- 首次安装需要访问 Node、Bun、pnpm、Python 包和浏览器下载域名。

Linux/macOS 的引导脚本需要 Bash、tar、gzip、curl 或 wget、SHA256 工具。
不支持 musl/Alpine。
运行 CC Switch 的 Linux 桌面还需要 glibc 2.35+ 和 WebKitGTK 4.1。

## 初始化和项目

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| 环境 | `env init <语言>` | Node、Bun、pnpm、Codex、Playwright MCP、CC Switch 和缓存 |
| 检查 | `env check <语言>` | 检查版本、核心组件和 CC Switch |
| 项目 | `project init <目录> --language <语言>` | 模板、依赖和浏览器 |
| 测试 | `project check <目录>` | 功能和浏览器自检 |

以下命令在仓库根目录执行。

```powershell
.\packages\qa-ai-playwright\src\bin\qa.cmd env init typescript
.\packages\qa-ai-playwright\src\bin\qa.cmd env check typescript
.\packages\qa-ai-playwright\src\bin\qa.cmd project init .\workspaces\my-qa --language typescript
.\packages\qa-ai-playwright\src\bin\qa.cmd project check .\workspaces\my-qa
```

```bash
bash packages/qa-ai-playwright/src/bin/qa.sh env init python
bash packages/qa-ai-playwright/src/bin/qa.sh env check python
bash packages/qa-ai-playwright/src/bin/qa.sh project init ./workspaces/python-qa --language python
bash packages/qa-ai-playwright/src/bin/qa.sh project check ./workspaces/python-qa
```

`project` 要求先完成对应语言的 `env init`。
`env init` 使用环境内 Node 安装固定版本的 Bun 和 pnpm。
扩展包使用 `env init <语言> --full`。

### 命令输出示例

以下仅展示输出形式。路径与版本以实际执行为准，不代表本次已执行：

```text
Ready. Local activation files: ［环境目录］/activate.ps1 / activate.sh
Project ready: ［项目目录］. QA templates: ［版本］. Language template: ［版本］. Run: qa project check ［项目目录］
```

`env check` 输出运行时信息，并在末尾输出包含 `root`、`missing` 和 `versions` 的 JSON 对象。
`missing` 为空表示所选环境组件检查通过，不代表业务测试通过。检查会验证固定版本、启动器和实际 JavaScript 入口。命令成功返回 0，存在缺失项返回 1。
重复初始化时，`KEEP` 表示保留已有项目文件。
测试结果与证据位置见[从需求到执行](qa-workflow.zh-CN.md#可观察的执行示例)。

## 参数

| 参数 | 说明 |
| --- | --- |
| `--root <目录>` | 指定隔离环境目录，后续命令保持相同路径 |
| `env init/check` 的位置参数 | `python`、`typescript` 或 `both` |
| `--full` | 增加 Agent Browser CLI 和 MCP |
| `--language python/typescript` | 选择新项目语言 |
| `--browser chromium/firefox/webkit/all/none` | 选择项目浏览器 |
| `--skip-codex` | 不安装 Codex 和声明需要 Codex 的 MCP |
| `--skip-skills` | 跳过 Playwright CLI、浏览器辅助 CLI 和 MCP；不影响 Skill 按需检查 |
| `--with-deps` | Linux 安装浏览器系统库 |

`--language` 也可写作 `--语言`。
`--skip-skills` 不会跳过 CC Switch。

## 配置变量

`QA_ENV` 选择 `.env.dev`、`.env.stg` 等配置文件。
`UI_BASE_URL` 和 `API_BASE_URL` 分别配置页面与接口入口。
`BASE_URL` 只用于旧项目兼容。

| 类别 | 说明 |
| --- | --- |
| 环境选择 | `QA_ENV`，以及项目需要的构建或地区标识 |
| 服务入口 | API、UI、资源服务或第三方服务地址 |
| 认证与会话 | Token、Cookie、账号、客户端、租户、作用域或认证状态 |
| 身份与资源 | 角色、用户、组织、项目、租户和业务资源标识 |
| 测试数据 | 数据前缀、所有者、夹具位置、唯一性和清理策略 |
| 执行控制 | API 门禁、生产写保护、超时、并发、标签和环境限制 |
| 功能上下文 | 功能开关、区域、语言、时区和浏览器或构建差异 |

模板当前读取的基线变量如下：

| 变量 | 用途 |
| --- | --- |
| `UI_BASE_URL` | 页面入口 |
| `API_BASE_URL` | API 入口 |
| `BASE_URL` | 兼容回退 |
| `QA_API_TOKEN` | API Token |
| `QA_API_TOKEN_HEADER` | Token 请求头名称 |
| `QA_API_AUTH_SCHEME` | Token 认证前缀 |
| `QA_API_TIMEOUT` | API 超时秒数 |
| `QA_AUTH_STATE` | 浏览器登录状态文件 |
| `QA_AUTH_ROLES` | 启用多角色登录态生成 |
| `QA_AUTH_ROLE` | 默认浏览器登录角色 |
| `QA_AUTH_<ROLE>_USERNAME` / `_PASSWORD` | 角色凭证 |
| `QA_AUTH_*_SELECTOR` | 登录页元素定位 |
| `QA_ALLOW_PRODUCTION_WRITES` | 生产写保护开关 |
| `REQUIRE_API_TESTS` | 缺少 API 配置时是否失败 |
| `PLAYWRIGHT_WEB_SERVER_COMMAND` | TypeScript 可选本地服务启动命令 |

没有跨项目通用的业务变量名称。
以实际代码、OpenAPI 或脱敏样例为准。
各环境文件保持相同变量名。
取值优先级为进程环境或 CI、`.env.<环境>`、公共 `.env`、代码默认值。
真实值放入进程环境、CI secret 或密钥系统。
公开地址可使用 GitHub Actions `vars`，凭证使用 `secrets`。
项目新增变量时必须同步扩展生成工作流的 `env` 映射。
变量名和获取位置登记到生成项目的 `docs/qa/inputs/input-index.md`。

## 环境目录

| 路径 | 内容 |
| --- | --- |
| `<root>/runtime/` | Python 和 Node |
| `<root>/tools/npm/` | Codex、Bun、pnpm 和下载的浏览器 CLI |
| `<root>/tools/cc-switch/` | 固定版本 CC Switch 桌面程序 |
| `<root>/bin/cc-switch` | CC Switch 启动包装器 |
| `<root>/codex/skills/` | 旧环境可能保留的 Skills |
| `<root>/codex/config.toml` | 环境级 MCP 配置 |
| `<root>/cache/` | npm、pnpm、Bun、pip、uv 和浏览器缓存 |
| `<root>/state.json` | 实际安装版本 |
| `<root>/activate.ps1` / `activate.sh` | 当前 shell 的激活文件 |

激活 PowerShell 7 或 Windows PowerShell 5.1：

```powershell
. .\.qa-env\activate.ps1
```

激活 Bash：

```bash
source .qa-env/activate.sh
```

启动 CC Switch：

```powershell
.\packages\qa-ai-playwright\src\bin\qa.cmd run cc-switch
```

程序文件只写入环境目录。
运行后，CC Switch 仍按上游设计使用用户主目录的 `~/.cc-switch` 数据目录。
安装器只处理环境内文件。

## 卸载

```powershell
.\packages\qa-ai-playwright\src\bin\qa.cmd project uninstall .\workspaces\my-qa
.\packages\qa-ai-playwright\src\bin\qa.cmd env uninstall
```

执行前会校验所有权和路径边界。
项目卸载删除受管理依赖和未修改模板，保留用户修改与未跟踪文件。
环境卸载删除环境内的运行时、缓存、Skills、MCP 配置和本地 Codex 登录状态。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| PowerShell 策略阻止脚本 | 使用 `packages/qa-ai-playwright/src/bin/qa.cmd`，它只为该进程设置 Bypass |
| 下载失败 | 检查代理、受信证书、磁盘和报错域名 |
| Node 自举提示 release file was not found | 确认 `SHASUMS256.txt` 含目标平台的 `.tar.gz` 包；脚本按文件后缀匹配 |
| Windows 提示 Bun 或 pnpm missing | 重新执行 `env init`；Bun 使用 `bun.exe`，pnpm 安装脚本单独放行 |
| Linux 缺浏览器库 | 使用 `project init <目录> --language <语言> --with-deps` |
| 找不到运行时或 Codex | 检查 `state.json`、激活文件和 `QA_ROOT` |
| 浏览器 executable 不存在 | 安装对应浏览器并使用相同 `--root` |
| `playwright-cli --version` 报 `MODULE_NOT_FOUND` | 使用相同 `--root` 重新执行 `env init`，再执行 `env check` |
| API 测试 skipped | 检查 `QA_ENV`、`API_BASE_URL`、API 门禁和认证变量 |
| Skill 或模板未更新 | 保留已有内容。升级前先合并本地修改 |
| Python 锁文件未受管理或已修改 | 备份并手动处理 `requirements.lock` 和元数据后重跑初始化。失败前已复制的模板会保留 |

Windows `QA_POWERSHELL=powershell.exe` 可强制验证 5.1 降级路径。
