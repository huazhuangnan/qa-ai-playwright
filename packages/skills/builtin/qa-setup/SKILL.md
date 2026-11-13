---
name: qa-setup
description: 通过 QA CLI 为新电脑初始化本地 QA 环境、创建 Python/TypeScript 测试项目、检查安装或卸载受管理的环境和项目。
metadata:
  version: "0.0.1"
---

# QA 环境与项目管理

优先使用用户级 `qa` 命令。
未安装或需要在包内排查时，使用 `packages/qa-cli/bin/qa.cmd`（Windows）
或 `packages/qa-cli/bin/qa.sh`（macOS/Linux）。
已激活环境时，`QA_REPO` 指向交付包根目录。

## 规则

- 管理操作通过 QA MCP 或 CLI 执行。两者复用同一实现。不另行全局安装运行时、修改系统 PATH 或手工删目录。
- CLI 不读取交互输入。缺少参数时直接报错。
- 使用完整启动器路径或已安装的 `qa`。短命令只影响当前 shell，不要假设不同工具调用共享会话。
- 环境根目录优先级为 `--root`、`QA_ROOT`、`~/.qa-ai-playwright`。后续命令保持相同 root。
- project 命令先检查对应环境已初始化且语言匹配。
- 项目放在环境目录之外。
- QA 和外部 Skill 在任务需要时检查可用作用域。缺失时安装到业务项目，不写全局目录。
- 卸载仅在用户明确要求时执行，先核对命令参数中的绝对路径。
- 环境卸载须经 qa.cmd/qa.sh 入口，Windows 需等管理进程退出。
- 失败按实际错误报告网络、校验、权限或系统库问题，不禁用证书验证。
- 不把 CLI 自检当作业务测试通过。
- 按任务使用内置 QA MCP 检查环境、诊断问题和管理项目。不可用时回退 CLI。
- 执行依赖 QA 环境的测试前，确认项目语言、环境根目录和所需组件。用 `qa_env_check` 或相同条件的 `env check` 检查。
- 环境缺失或语言不匹配时，通过交付包启动器使用同一根目录和所需选项执行对应语言的 `env init`。安装缺失的共享工具前告知用户。
- 初始化后用相同语言、根目录和选项复查。检查通过后才执行依赖该环境的测试。找不到启动器、必要参数未知或初始化失败时报告阻塞，不虚构结果。
- 先检测并复用兼容浏览器。确认缺失后才下载。用户指定浏览器时按其选择。
- 浏览器自动化使用独立上下文，不接管用户日常配置或登录状态。
- 浏览器位于自定义路径时，项目测试通过 `QA_BROWSER_EXECUTABLE_PATH` 接收可执行文件路径。Chrome 和 Edge 指定对应通道。系统 Chromium 的通道留空。不要把本机绝对路径写入公共模板默认值。
- 不提供任意命令执行或环境自卸载 MCP 工具。

## 说明

- 默认安装 Codex、Playwright CLI、CC Switch 和所选语言运行环境。
- 环境初始化在 Node 完成后检查 Bun 和 pnpm。已有兼容版本时复用，缺失时安装配置版本。
- `--full` 增加 Agent Browser CLI 和 MCP。
- CC Switch 默认检查并准备。已有时复用，缺失时安装配置的便携版。
- 仅在指定 `--skip-cc-switch` 时跳过 CC Switch。
- CC Switch 不写注册表或系统应用目录，安装器不自动启动程序。
- 启用 Codex 时注册 `qa` MCP。未跳过浏览器工具时注册 Playwright MCP；`--full` 再准备并注册 Agent Browser。
- `qa-core` 的专项参考按任务使用。Skills 不随环境初始化安装。
- Python 语言环境使用受管 Python。即使跳过 Codex 也准备 Node。
- 项目依赖使用 pnpm。项目脚本使用 Bun。
- Playwright MCP 和原生 Node 模块使用 Node。QA MCP 使用发现的 Bun。
- 版本由 packages/qa-cli/runtime-versions.env 管理。
- 项目包含 `.env.example`。复制为 `.env` 后自动加载，真实 `.env` 不提交。
- 示例提供 `QA_ENV`、`UI_BASE_URL`、`API_BASE_URL` 和基础适配项。
- 项目清单记录 QA 文档模板和语言模板版本。依赖锁文件必须保留并提交。
- 修改 `QA_ENV` 可切换 `.env.dev`、`.env.stg` 等环境文件。系统和 CI 变量优先。
- 项目变量登记到 `docs/qa/inputs/input-index.md`。
- 重复执行保持已有文件。跳过组件时，检查传相同 skip 参数。

## 示例

- 初始化环境：`env init <python|typescript|both>`。
- 扩展环境：`env init <python|typescript|both> --full`。
- 跳过 CC Switch：`env init <python|typescript|both> --skip-cc-switch`。
- 初始化项目：`project init <目录> --language <python|typescript>`。它会自动补齐标准环境并安装项目级 `qa-core`。
- 检查：`env check <python|typescript|both>`；`project check <目录>`。
- 升级项目 Skill：`skills upgrade <目录> <qa-core|qa-setup>`。项目 Skill 由仓库维护，命令直接同步交付包版本。
- 运行：`run python ...`、`run pnpm ...`、`run bun ...`、`run codex ...`、`run cc-switch`。
- 卸载项目：`project uninstall <目录>`。
- 卸载环境：`env uninstall`。

## 参考

[Playwright 系统要求](https://playwright.dev/docs/intro) ·
[Playwright 浏览器](https://playwright.dev/docs/browsers) ·
[playwright-cli（浏览器 CLI）](https://www.skills.sh/microsoft/playwright-cli) ·
[agent-browser（浏览器 CLI）](https://www.skills.sh/vercel-labs/agent-browser)
