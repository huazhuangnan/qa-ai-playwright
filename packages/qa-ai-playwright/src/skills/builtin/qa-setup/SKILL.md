---
name: qa-setup
description: 通过本仓库 CLI 为新电脑初始化本地 QA 环境、创建 Python/TypeScript 测试项目、检查安装或卸载受管理的环境和项目。
metadata:
  version: "0.0.1"
---

# QA 环境与项目管理

找到包内的 src/bin/qa.cmd（Windows）或 src/bin/qa.sh（macOS/Linux）。已激活环境时包位置在 QA_REPO。

## 规则

- 所有管理操作调用同一 CLI。不另行全局安装运行时、修改系统 PATH 或手工删目录。
- CLI 不读取交互输入。缺少参数时直接报错。
- project 命令先检查对应环境已初始化且语言匹配。
- 安装根目录默认当前目录 .qa-env，可用 --root 覆盖。后续命令保持相同 root。
- 项目放在环境目录之外。
- QA 和外部 Skill 在任务需要时检查可用作用域。缺失时安装到业务项目，不写全局目录。
- 卸载仅在用户明确要求时执行，先核对命令参数中的绝对路径。
- 环境卸载须经 qa.cmd/qa.sh 入口，Windows 需等管理进程退出。
- 失败按实际错误报告网络、校验、权限或系统库问题，不禁用证书验证。
- 不把 CLI 自检当作业务测试通过。

## 说明

- 默认安装 Codex、Playwright CLI 和所选语言运行环境。
- 环境初始化在 Node 完成后安装固定版本的 Bun 和 pnpm。
- `--full` 增加 Agent Browser CLI 和 MCP。
- 所有语言方案都安装固定便携版 CC Switch。
- CC Switch 不写注册表或系统应用目录，安装器不自动启动程序。
- `playwright-cli` 默认安装；`agent-browser` 仅在 `--full` 时安装。
- 默认注册 `playwright` MCP；`--full` 再注册 `agent-browser` MCP。
- `qa-docs` 与其他 QA Skills 按需使用。Skills 不随环境初始化安装。
- Agent Browser 复用 Playwright Chromium。
- Python 是 CLI 自带运行时。即使跳过 Codex 也准备 Node。
- 项目依赖使用 pnpm。项目脚本使用 Bun。
- Playwright、MCP 和原生 Node 模块继续使用 Node。
- 版本由 src/runtime-versions.env 管理。
- 项目包含 `.env.example`。复制为 `.env` 后自动加载，真实 `.env` 不提交。
- 示例提供 `QA_ENV`、`UI_BASE_URL`、`API_BASE_URL` 和基础适配项。
- `BASE_URL` 只作兼容回退。
- 项目清单记录 QA 文档模板和语言模板版本。依赖锁文件必须保留并提交。
- 修改 `QA_ENV` 可切换 `.env.dev`、`.env.stg` 等环境文件。系统和 CI 变量优先。
- 项目变量登记到 `docs/qa/inputs/input-index.md`，不要只依赖 `BASE_URL`。
- 默认 Codex 环境安装 `@playwright/mcp`，注册在环境内 `CODEX_HOME/config.toml`。
- 重复执行保持已有文件。跳过组件时，检查传相同 skip 参数。

## 示例

- 初始化环境：`env init <python|typescript|both>`。
- 扩展环境：`env init <python|typescript|both> --full`。
- 初始化项目：`project init <目录> --language <python|typescript> --browser chromium`。
- 检查：`env check <python|typescript|both>`；`project check <目录> --browser chromium`。
- 运行：`run python ...`、`run pnpm ...`、`run bun ...`、`run codex ...`、`run cc-switch`。
- 卸载项目：`project uninstall <目录>`。
- 卸载环境：`env uninstall`。

## 参考

[Playwright 系统要求](https://playwright.dev/docs/intro) ·
[Playwright 浏览器](https://playwright.dev/docs/browsers) ·
[playwright-cli（浏览器 CLI）](https://www.skills.sh/microsoft/playwright-cli) ·
[agent-browser（浏览器 CLI）](https://www.skills.sh/vercel-labs/agent-browser)
