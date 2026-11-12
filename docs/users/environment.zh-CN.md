# 环境初始化

[使用人员](../../README.md)

Windows 启动器使用 PowerShell。macOS 和 Linux 启动器使用 Bash。启动器发现或引导 Node，再将命令交给 TypeScript CLI。
Node 需要 22.18 或更高版本。启动器优先使用符合要求的系统 Node，再检查用户级共享 Node。环境命令负责准备 QA 所需运行时与工具。项目、Skill 和 MCP 命令复用同一个 CLI 入口。

本页说明环境与项目的初始化、检查、目录和卸载。
工具优先复用系统或用户级安装。环境目录保存环境状态、缓存和运行输出。MCP 注册使用用户级 Codex 配置。
Codex CLI 与桌面端分别检测。Windows 检测 Microsoft Store 版本的桌面端，其他平台显示未知。桌面端不能替代 CLI。
测试代码与报告命令见对应的 [TypeScript](typescript.zh-CN.md) 和 [Python](python.zh-CN.md) 指南。

## 使用顺序

1. 初始化与检查对应语言的环境。
2. 在环境之外生成并检查 QA 项目。
3. 激活环境，配置 `.env.<环境>` 和项目输入索引。
4. 按语言指南运行测试，再查看报告和证据。
5. 需要清理时，先检查所有权，再执行项目或环境卸载。

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
- 首次安装需要访问 Node、共享工具包和 Python 包下载域名。需要下载缺失的浏览器时还需要访问浏览器下载域名。

Linux/macOS 的引导脚本需要 Bash、tar、gzip、curl 或 wget、SHA256 工具。
不支持 musl/Alpine。
运行 CC Switch 的 Linux 桌面还需要 glibc 2.35+ 和 WebKitGTK 4.1。

## 初始化和项目

| 阶段 | 命令 | 结果 |
| --- | --- | --- |
| 环境 | `env init <语言>` | 共享工具检查、QA MCP、环境状态、缓存和输出 |
| 检查 | `env check <语言>` | 检查版本和所选组件 |
| 项目 | `project init <目录> --language <语言>` | 模板、依赖和浏览器 |
| 检查 | `project check <目录>` | 项目依赖锁、测试和浏览器检查 |

以下命令在解压后的交付包根目录或源码仓库根目录执行。

在交付包根目录安装全局命令。安装后重新打开终端。

Windows：`pwsh -ExecutionPolicy Bypass -File packages/qa-cli/bin/install.ps1`。
PowerShell 7 不可用时，改用 `powershell -ExecutionPolicy Bypass -File packages/qa-cli/bin/install.ps1`。

macOS / Linux：`bash packages/qa-cli/bin/install.sh`。

默认环境位于用户目录下的 `.qa-ai-playwright`。

升级时重新运行新版交付包的安装脚本。安装器核对已管理文件的归属和内容。发现冲突时保留原文件并提示处理。
安装写入用户目录，不请求管理员权限。
首次安装中断会回滚本次创建的文件。
升级失败会保留恢复目录，路径由错误输出给出。

```powershell
qa env init typescript
qa env check typescript
qa project init .\workspaces\my-qa --language typescript
qa project check .\workspaces\my-qa
```

```bash
qa env init python
qa env check python
qa project init ./workspaces/python-qa --language python
qa project check ./workspaces/python-qa
```

- **初始化**：`project` 要求先完成对应语言的 `env init`。初始化优先复用系统或用户级工具。缺少工具时，按组件安装到共享位置或环境目录，并在安装前输出命令。
- **可选组件**：扩展包使用 `env init <语言> --full`。需要 CC Switch 时添加 `--with-cc-switch`。Python 环境会准备受管 Python。
- **状态记录**：初始化写入环境状态和用户级 MCP 配置。安装及复用的工具会记录在环境状态中。共享工具的使用关系不能仅凭单个环境的记录确认。
- **失败恢复**：初始化失败后，可使用相同参数重跑。先检查已输出的安装操作。
- **版本兼容**：复用的 Bun 或 pnpm 主版本与配置基线不同时，会提示人工检查兼容性。CLI 不覆盖已有安装。

### MCP 名称

默认名称包括 `qa` 和 `qa-playwright`。名称冲突时保留已有配置。

浏览器按以下规则准备：

- 优先检测并复用用户已有的兼容安装。确认缺失后才下载。用户指定浏览器时按其选择处理。
- 检测只确认可执行文件存在且可访问，不保证版本与 Playwright 兼容。使用 `project check` 运行浏览器测试，验证当前组合。
- 同时使用 `--skip-codex --full` 时，也先复用已有浏览器。缺失时准备环境内的 Chromium，供 Agent Browser 使用。
- 浏览器自动化使用独立上下文，不使用用户日常浏览器的配置和登录状态。
- 使用自定义 Chrome 或 Edge 路径时，设置 `QA_BROWSER_CHANNEL` 和 `QA_BROWSER_EXECUTABLE_PATH`。指定系统 Chromium 路径时，将通道设为空。

### 使用 Codex 准备环境

1. 确认项目语言、环境根目录和所需组件。使用 QA MCP 或 CLI 检查环境。
2. 环境缺失或语言不匹配时，使用交付包启动器和相同根目录执行对应语言的 `env init`。安装缺失的共享工具前告知用户。
3. 初始化后，以相同条件执行 `env check`。检查通过后再继续依赖该环境的测试。
4. 找不到启动器、缺少必要参数或初始化失败时，报告原因。不声称安装或测试通过。

### 命令输出示例

以下仅展示输出形式。路径与版本以实际执行为准，不代表本次已执行：

```text
Ready. Local activation files: ［环境目录］/activate.ps1 / activate.sh
Project ready: ［项目目录］. QA templates: ［版本］. Language template: ［版本］. Run: qa project check ［项目目录］
```

- `env check` 输出运行时信息。末尾 JSON 包含 `root`、`missing` 和 `versions`。
- `missing` 为空表示环境组件检查通过，不代表业务测试通过。检查验证可用程序、实际版本和所需入口。
- 命令成功返回 0，存在缺失项返回 1。
- 重复初始化时，`KEEP` 表示保留已有项目文件。

测试结果与证据位置见[从需求到执行](qa-workflow.zh-CN.md#执行示例)。

## 生命周期管理

以下是当前支持的操作。
项目初始化、检查和升级要求环境已经初始化，且语言与项目匹配。
项目卸载只检查项目归属和路径边界。

- `env init <语言>`：准备所选环境，复用已发现的工具并安装缺失组件。重新执行可补齐缺失项并更新环境状态。它不是通用升级或回滚命令。
- `env list`：只读列出当前环境记录的语言、配置、安装台账和发现的工具。输出区分记录版本和发现的软件包版本。来源无法确认时显示 `unknown`。
- `env repair`：使用已记录的语言和组件配置重新补齐环境。Bun 或 pnpm 缺失时也可执行。缺少初始化记录时拒绝执行。它不替换已复用的共享工具。
  如果 Node 缺失，先按原语言重新执行 `env init` 来引导 Node。
- `env plan uv`、`env upgrade uv`、`env snapshots uv` 和 `env rollback <快照标识>`：维护环境内受管 uv。
  升级前先查看计划，回滚时使用实际快照标识。
- `env check <语言>`：只读检查所选环境的组件、版本和配置。它不自动安装、升级或删除组件。检查时使用与初始化一致的语言和选项。
- `project init <目录> --language <语言>`：创建或重新初始化项目，准备模板、依赖和所选浏览器。已有项目文件会保留。重新初始化不等同于模板升级。
- `project check <目录>`：检查项目依赖锁并运行项目测试，包括浏览器检查。TypeScript 项目还会进行类型检查。此命令会运行测试，并非只读的环境检查。
- `project plan <目录>`：只读比较项目模板、受管文件和当前版本。
- `project upgrade <目录>`：只输出人工升级说明，不自动替换文件。
- `project repair/snapshots/rollback <目录>`：修复缺失的受管文件，或管理升级快照。回滚不会覆盖无法确认所有权的文件。
- `project uninstall <目录>`：删除项目记录中的未修改模板文件。保留修改过的文件、未跟踪文件和依赖目录。存在受管保留项时保留项目记录，方便再次执行。
- `env uninstall`：清理当前环境拥有且可安全识别的 MCP 注册。
  它不删除环境目录或其中的数据。存在无法安全移除的受管注册时返回失败。
  外部软件的处理见下方卸载说明。
- `mcp remove <名称>`：只移除当前环境拥有且未修改的可选 MCP 注册。无法确认所有权或移除后注册仍存在时返回失败并保留记录。
- `mcp list` 和 `mcp check <名称>` 分别列出或检查可选 MCP 的注册、所有权和软件包状态。
- `mcp repair <名称>`：按记录修复可选 MCP。无法确认所有权时保留现有注册。

环境修复不提供共享工具升级或通用回滚。外部安装步骤失败时可能需要重试。

## 参数

| 参数 | 说明 |
| --- | --- |
| `env init/check` 的位置参数 | `python`、`typescript` 或 `both` |
| `--full` | 增加 Agent Browser CLI 和 MCP |
| `--with-cc-switch` | 初始化或检查 CC Switch |
| `--language python/typescript` | 选择新项目语言 |
| `--browser` | `project init` 支持 `chrome`、`msedge`、`chromium`、`firefox`、`webkit`、`all`、`none`；`project check` 支持前五项 |
| `--skip-codex` | 不安装 Codex 和声明需要 Codex 的 MCP |
| `--skip-skills` | 跳过 Playwright CLI、浏览器辅助 CLI 和浏览器 MCP；不影响 QA MCP 和 Skill 按需检查 |
| `--with-deps` | Linux 安装浏览器系统库 |

`--language` 也可写作 `--语言`。
`env check` 未指定该选项时，按已记录的环境配置决定是否检查 CC Switch。

- 未指定浏览器时，依次检测系统 Chrome、Edge、Chromium、环境内 Chromium。均未发现时，准备 Playwright 的 Chromium。
- 项目检查优先使用 `--browser`，其次使用 `QA_BROWSER_CHANNEL`。两者均未指定时，沿用初始化记录的 Chrome 或 Edge，否则使用 Chromium。
- 显式指定 `chrome` 或 `msedge` 时，使用对应系统浏览器。找不到时命令失败，并提示自行安装或选择其他浏览器。CLI 不会自动安装系统 Chrome 或 Edge。
- `all` 和 `none` 仅用于项目初始化。

环境初始化复用已有工具版本。
缺失时使用配置中的版本安装。
CI 的 `latest` 对应当前默认版本，`compatible` 对应仍需支持的兼容版本。
`--full` 只在需要 Agent Browser CLI 或 Agent Browser MCP 时使用。
版本、安装逻辑或平台变化会触发对应 CI 验证。

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
| `QA_BROWSER_CHANNEL` | 项目测试的 Chromium 通道；`chrome` 或 `msedge` 使用对应系统浏览器，空值使用 Chromium |
| `QA_BROWSER_EXECUTABLE_PATH` | 系统浏览器可执行文件路径；通道为空时指定 Chromium，路径也为空时使用 Playwright 管理的 Chromium |
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

项目变量按以下规则管理：

- **变量名**：没有跨项目通用的业务变量名称。以实际代码、OpenAPI 或脱敏样例为准。各环境文件保持相同变量名。
- **优先级**：进程环境或 CI、`.env.<环境>`、公共 `.env`、代码默认值，依次生效。
- **凭证**：真实值放入进程环境、CI secret 或密钥系统。模板从环境变量或本地 `.env` 文件读取，不直接连接密钥系统。使用密钥系统时，先通过项目安全机制将值注入进程环境。
- **文件保护**：本地 `.env` 和浏览器登录态不加密，不要提交或分享。
- **CI 配置**：公开地址可使用 GitHub Actions `vars`，凭证使用 `secrets`。新增变量时同步扩展生成工作流的 `env` 映射。
- **登记**：将变量名和获取位置登记到生成项目的 `docs/qa/inputs/input-index.md`。

## 环境目录

| 路径 | 内容 |
| --- | --- |
| `<root>/runtime/` | 旧环境运行时或项目状态 |
| 用户级 `CODEX_HOME` | Codex 配置、MCP 注册和 MCP 锁记录 |
| npm 全局前缀 | 缺失时安装的 Codex、Bun、pnpm、Playwright CLI、Playwright MCP 和 Agent Browser |
| 用户级共享目录 | 缺失时安装的 Node 和 CC Switch |
| `<root>/bin/cc-switch`（Windows 为 `cc-switch.cmd`） | 启动已发现的 CC Switch 的快捷方式，并非应用本体 |
| `<root>/codex/skills/` | 旧环境可能保留的 Skills |
| `<root>/cache/` | npm、pnpm、Bun、pip、uv 和浏览器缓存 |
| `<root>/state.json` | 实际复用或安装的工具路径和版本 |
| `<root>/mcp-output/` | Playwright MCP 输出 |
| `<root>/activate.ps1` / `activate.sh` | 当前 shell 的激活文件 |

以下数据文件采用程序读取的固定格式，不能插入注释：

- `.qa-managed`：环境归属标记。
- `bootstrap/python-path.txt`：环境使用的 Python 路径。
- `agent-browser-config.json`：Agent Browser 配置。

激活 PowerShell 7 或 Windows PowerShell 5.1：

```powershell
. "$HOME\.qa-ai-playwright\activate.ps1"
```

激活 Bash：

```bash
source ~/.qa-ai-playwright/activate.sh
```

启动 CC Switch：

```powershell
qa run cc-switch
```

程序优先复用系统或用户级安装。缺失时，按组件安装到 npm 全局前缀、用户级共享目录或环境目录。
运行后，CC Switch 仍按上游设计使用用户主目录的 `~/.cc-switch` 数据目录。
CC Switch 共享应用不会随环境卸载。

## 卸载

先卸载不再需要的项目：

```powershell
qa project uninstall .\workspaces\my-qa
```

项目卸载删除未修改模板，保留依赖、用户修改与未跟踪文件。

然后在原交付包目录执行对应的安装脚本，卸载全局 QA。脚本先清理可确认归属的 MCP 注册，再清理受管理的命令和安装文件。
软件升级和卸载只接受 `source=qa` 且路径匹配的所有权记录。
系统或用户已有软件只复用和保留。
普通复用不会继承之前的 QA 所有权。

```powershell
pwsh -ExecutionPolicy Bypass -File packages/qa-cli/bin/install.ps1 -Uninstall
```

PowerShell 7 不可用时，使用 `powershell -ExecutionPolicy Bypass -File packages/qa-cli/bin/install.ps1 -Uninstall`。

```bash
bash packages/qa-cli/bin/install.sh --uninstall
```

执行前会校验所有权和路径边界。

- **项目卸载**：删除未修改模板，保留 `.venv`、`node_modules`、用户修改与未跟踪文件。确认依赖目录无需保留后，可自行删除。
- **环境卸载**：保留环境目录、所有权标记及其中的数据，只清理可确认属于该环境的 MCP 注册。卸载成功后环境标记为未初始化，项目命令需要重新初始化。确认目录无需保留后，可自行删除。
- **外部软件**：发现的非 QA 安装软件始终保留。CLI 不提供外部软件卸载参数，也不覆盖用户已有版本。请使用软件原有的安装工具管理。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| PowerShell 策略阻止安装脚本 | 使用上方安装命令，它只为该进程设置 Bypass |
| 下载失败 | 检查代理、受信证书、磁盘和报错域名 |
| Node 自举提示 release file was not found | 确认 `SHASUMS256.txt` 含目标平台的 `.tar.gz` 包；脚本按文件后缀匹配 |
| Windows 提示 Bun 或 pnpm missing | 重新执行 `env init`；Bun 使用 `bun.exe`，pnpm 安装脚本单独放行 |
| Linux 缺浏览器库 | 使用 `project init <目录> --language <语言> --with-deps` |
| 找不到运行时或 Codex | 检查 `state.json`、激活文件和 `QA_ROOT` |
| 浏览器 executable 不存在 | 安装对应浏览器 |
| `playwright-cli --version` 报 `MODULE_NOT_FOUND` | 重新执行 `env init`，再执行 `env check`；确认安装包 `bin` 入口和启动器指向同一文件 |
| API 测试 skipped | 检查 `QA_ENV`、`API_BASE_URL`、API 门禁和认证变量 |
| Skill 或模板未更新 | 保留已有内容。升级前先合并本地修改 |
| Python 锁文件未受管理或已修改 | 备份并手动处理 `requirements.lock` 和元数据后重跑初始化。失败前已复制的模板会保留 |

Windows `QA_POWERSHELL=powershell.exe` 可强制验证 5.1 降级路径。
