# Skills 与 MCP

运行环境安装在隔离目录。QA 与外部 Skill 由 AI 按任务检查。
可用时复用现有 Skill，缺失时安装到业务项目，不写用户全局目录。

## 来源

自有 Skill 位于 `packages/qa-ai-playwright/src/skills/builtin/`。外部 Skill 使用上游命令按需安装，不存入本仓库。

MCP 清单目录：

- `packages/qa-ai-playwright/src/mcp/builtin/`
- `packages/qa-ai-playwright/src/mcp/external/`

## 作用域

| scope | Skill | MCP | 管理方 |
| --- | --- | --- | --- |
| `global` | 用户 Skill 目录 | 用户 Codex 配置 | 用户自行管理 |
| `project` | 项目 `.agents/skills/` | 项目自己的 Codex 配置 | AI 按需安装，业务项目维护 |
| `environment` | 旧环境 `<root>/codex/skills/` | `<root>/codex/config.toml` | 复用已有 Skill；CLI 管理 MCP |

项目级安装记录由安装工具维护。旧环境 Skill 锁记录保留。
AI 还在 `docs/qa/tasks/skill-installs.md` 记录项目级安装的来源、版本或提交及 `scope: project`。
复用已有 Skill 不产生新的安装记录。

## QA Skills

QA 任务按需使用：

- `qa-setup`
- `qa-core`
- `qa-business-guide`
- `qa-test-design`
- `qa-api`
- `qa-web`
- `qa-triage`

语言适配包括 `qa-python`、`qa-typescript`。
`qa-docs` 为可选 Skill，资料归档或静态导出任务按需使用。

外部 Skill 来源：

- [Microsoft playwright-cli](https://github.com/microsoft/playwright-cli)
- [Vercel agent-browser](https://github.com/vercel-labs/agent-browser)
- [Anthropic webapp-testing](https://github.com/anthropics/skills/tree/main/skills/webapp-testing)
- [Currents playwright-best-practices](https://github.com/currents-dev/playwright-best-practices-skill)
- [Bun Runtime](https://github.com/affaan-m/ECC/tree/main/skills/bun-runtime)
- [pnpm](https://github.com/antfu/skills/tree/main/skills/pnpm)

AI 先检查任务是否需要该 Skill，再检查会话、全局、当前项目和旧环境是否已有可用版本。
均缺失时，将所需 Skill 安装到当前业务项目。安装后读取对应 Skill 并记录来源和版本。
AI 的自动检查依赖当前客户端遵循项目规则，安装失败时需报告并继续可独立完成的工作。
安装命令、固定提交和检查顺序见 [外部 Skill 按需安装](../packages/qa-ai-playwright/src/skills/builtin/qa-core/references/external-skills.md)。
QA Skill 从本仓库安装，命令和引导随生成项目的 `AGENTS.md` 交付。
先激活 QA 环境，确保 `QA_REPO` 指向交付包。每次只安装当前任务缺少的 Skill。
不同作用域中的 QA Skill 可能不在同一目录。跨 Skill 引用按名称重新查找。

例如，在已激活环境的生成项目中告诉 AI：

```text
读取 docs/qa/inputs/input-index.md，按项目 AGENTS.md 检查并使用 qa-api。
根据已确认的接口契约设计测试。缺资料时列出缺口，不猜预期。
```

AI 可复用可用的 `qa-api`。如果缺失，它应按项目引导安装并记录来源。
安装后如客户端未刷新 Skill 列表，可直接读取项目里的 `SKILL.md`。

升级已有环境时，原有 Skill 目录及锁记录保留。环境检查不要求安装 Skill。
项目级按需安装的内容由业务项目管理，不由环境卸载删除。
旧项目的 `AGENTS.md` 同样不会被覆盖。将新版项目模板中的 QA 路由合并到已有规则。
环境卸载会删除整个受管理环境，包括保留在其中的旧 Skill。

### qa-docs

`qa-docs` 按任务需要安装到业务项目。
`qa-docs` 负责把用户提供的链接交给 Codex 当前可用的能力处理。
它不实现网页抓取、全文检索、上下文压缩或静态站生成。

AI 会先读取项目上下文，再调用网页搜索或浏览器发现相关文档。
精简资料归档到 `docs/qa/inputs/external/`。
静态输出写入 `docs/qa/generated/`。

### qa-business-guide

`qa-business-guide` 用于解释陌生业务和指导下一步操作。
它会先读取项目资料，再说明角色、流程、状态、边界、风险和验证方式。
规则未确认时只给解释、操作步骤或测试计划，不代替业务负责人定规则。

## Codex 快捷调用

- `/skills`：查看并选择可用 Skill。
- `$qa-business-guide`：直接调用业务讲解。
- `$qa-test-design`、`$qa-api`、`$qa-web`、`$qa-triage`：直接调用对应测试职责。
- `/plan`、`/review`、`/status` 等：Codex 原生命令，是否可用取决于客户端版本。
- `qa.cmd env init` 等：项目 CLI，不是 `/env` 一类快捷命令。
- MCP：配置后由 Codex 按任务选择调用，不依赖项目自定义 `/mcp`。

## 外部应用

CC Switch 桌面程序来自 [farion1231/cc-switch](../packages/qa-ai-playwright/src/apps/cc-switch/UPSTREAM.md)。
版本、提交、许可证、官方资产和 SHA256 记录在 `packages/qa-ai-playwright/src/apps/cc-switch/manifest.json`。
Windows 使用 Portable ZIP，macOS 使用 ZIP，Linux 使用 AppImage。
所有语言方案都会安装 CC Switch。
`--skip-skills` 是兼容参数，跳过 MCP 和浏览器辅助 CLI，不跳过 CC Switch。

```powershell
.\packages\qa-ai-playwright\src\bin\qa.cmd run cc-switch
```

程序文件位于环境目录。
运行后的用户数据仍按上游设计写入 `~/.cc-switch`。

## MCP

标准模式注册：

- `playwright`

`--full` 再注册 `agent-browser`。
两者都使用环境内 Chromium。
配置写入 `<root>/codex/config.toml`。
下载清单位于 `packages/qa-ai-playwright/src/mcp/external/`。

`--skip-codex` 同时跳过依赖 Codex 的 MCP。
`--skip-skills` 跳过 MCP 和浏览器辅助 CLI，不影响 Skill 按需检查。

## 按需 MCP

以下可选，默认不安装。
faker 已接入。docker-mcp 待核对安装方式，k6 和 ZAP 需要外部程序，暂缓。

| MCP | 类型 | 用途 | 来源 |
| --- | --- | --- | --- |
| faker | npm（`faker-mcp-server`） | 生成测试假数据 | <https://github.com/funsjanssen/faker-mcp> |
| docker-mcp | 待核对 | 容器环境管理 | <https://github.com/QuantGeekDev/docker-mcp> |
| k6 MCP | 外部二进制 | 性能压测 | <https://github.com/grafana/mcp-k6> |
| OWASP ZAP MCP | ZAP 附加组件 | 安全扫描 | <https://github.com/zaproxy/zaproxy> |

```powershell
.\packages\qa-ai-playwright\src\bin\qa.cmd mcp list
.\packages\qa-ai-playwright\src\bin\qa.cmd mcp add faker
.\packages\qa-ai-playwright\src\bin\qa.cmd mcp remove faker
```

```bash
bash packages/qa-ai-playwright/src/bin/qa.sh mcp list
bash packages/qa-ai-playwright/src/bin/qa.sh mcp add faker
bash packages/qa-ai-playwright/src/bin/qa.sh mcp remove faker
```

`mcp add` 只对 npm 包型可选清单生效。
k6 和 ZAP 需要外部程序或守护进程，不纳入一键安装。

## 使用

标准模式：

```powershell
.\packages\qa-ai-playwright\src\bin\qa.cmd run codex
.\packages\qa-ai-playwright\src\bin\qa.cmd run playwright-cli
```

```bash
bash packages/qa-ai-playwright/src/bin/qa.sh run codex
bash packages/qa-ai-playwright/src/bin/qa.sh run playwright-cli
```

需要 Agent Browser 时：

```powershell
.\packages\qa-ai-playwright\src\bin\qa.cmd env init typescript --full
.\packages\qa-ai-playwright\src\bin\qa.cmd run agent-browser
```

```bash
bash packages/qa-ai-playwright/src/bin/qa.sh env init typescript --full
bash packages/qa-ai-playwright/src/bin/qa.sh run agent-browser
```

Codex 登录由用户交互完成。
凭证和本地认证状态不提交。

## 维护

旧环境 Skill 的来源路径、版本和 scope 保留在原锁文件。
项目 Skill 的安装记录由业务项目维护。更新组件时同步核对来源、版本和 Actions 断言。
详细规则见[维护指南](maintenance.zh-CN.md)。
