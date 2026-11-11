# Skills 与 MCP

本页说明 QA + AI + Playwright 中 Skill 与 MCP 的对象、来源、作用域、当前命令和生命周期边界。

当前实现支持环境初始化、MCP 查询与按需 MCP 管理，以及外部 Skill 的只读更新检查。Skill 的通用安装由 AI 按任务路由完成。统一的 Skill 安装、升级、修复和卸载命令仍待实现。

## 对象与来源

### Skill

Skill 是供 AI 读取的规则、路由、测试职责或工具使用说明。Skill 不等同于 CLI、MCP 或业务项目代码。

| 对象 | 来源 | 当前管理方式 | 当前状态 |
| --- | --- | --- | --- |
| QA 内置 Skill | `packages/skills/builtin/` | 随 QA 交付包提供，按需安装到业务项目 | 已支持按名称查找和安装引导 |
| 外部 Skill | 上游 Git 仓库或上游安装命令 | AI 按任务检查并按需安装到业务项目 | 已支持来源清单和只读更新检查 |
| 用户 Skill | 用户 Skill 目录 | 用户或客户端管理 | CLI 不接管 |
| 旧环境 Skill | 旧环境 `<root>/codex/skills/` | 环境升级和卸载时保留 | 兼容保留 |
| 项目 Skill | 业务项目 `.agents/skills/` | 业务项目维护，环境卸载不删除 | 已支持按需使用 |

QA 内置 Skill 包括：

- `qa-setup`
- `qa-core`
- `qa-business-guide`
- `qa-test-design`
- `qa-api`
- `qa-web`
- `qa-triage`
- `qa-python`
- `qa-typescript`
- 可选的 `qa-docs`

外部 Skill 来源包括：

- [Microsoft playwright-cli](https://github.com/microsoft/playwright-cli)
- [Vercel agent-browser](https://github.com/vercel-labs/agent-browser)
- [Anthropic webapp-testing](https://github.com/anthropics/skills/tree/main/skills/webapp-testing)
- [Currents playwright-best-practices](https://github.com/currents-dev/playwright-best-practices-skill)
- [Bun Runtime](https://github.com/affaan-m/ECC/tree/main/skills/bun-runtime)
- [pnpm](https://github.com/antfu/skills/tree/main/skills/pnpm)

外部 Skill 的来源、固定提交和安装命令见[外部 Skill 按需安装](../packages/skills/builtin/qa-core/references/external-skills.md)。仓库只保存来源清单和自有 Skill，不复制外部 Skill 内容。

### MCP

MCP 是由客户端启动并通过 MCP 协议提供结构化工具的服务。MCP 的安装来源、注册配置和运行时状态需要分别记录。

| 对象 | 来源 | 当前管理方式 | 当前状态 |
| --- | --- | --- | --- |
| 内置 QA MCP | `packages/mcp/builtin/` | 环境初始化时注册 `qa` | 已支持 |
| 内置 Playwright MCP | 外部清单和 Playwright 包 | 标准模式注册 `playwright` | 已支持 |
| 内置 Agent Browser MCP | 外部清单和 Agent Browser 包 | `--full` 模式注册 `agent-browser` | 已支持 |
| 按需 npm MCP | `packages/mcp/external/` | `mcp add/remove` | 已支持部分 npm 清单 |
| 外部程序型 MCP | 外部二进制、守护进程或桌面应用 | 用户按其官方方式安装 | 暂不纳入一键安装 |

MCP 清单目录为：

- `packages/mcp/builtin/`
- `packages/mcp/external/`

## 作用域与所有权

下表描述使用和所有权边界。实际锁记录中的 scope 以记录字段为准。MCP 注册位于用户级，当前 MCP 锁记录使用 `scope: user`，并通过环境根目录区分所有者。

| scope | Skill 位置 | MCP 位置 | 安装与维护方 | 环境卸载行为 |
| --- | --- | --- | --- | --- |
| `global` | 用户 Skill 目录 | 用户级 `CODEX_HOME/config.toml` | 用户或客户端 | 默认保留 |
| `project` | 业务项目 `.agents/skills/` | 业务项目自己的客户端配置 | AI 按任务安装，业务项目维护 | 保留 |
| `environment` | 旧环境 `<root>/codex/skills/` | 用户级 Codex 配置中指向当前环境的注册项 | QA CLI 管理 | 保留环境目录和旧 Skill，清理可确认归属的注册 |
共享 MCP 包和工具可以被多个环境复用。它们默认不随单个环境卸载。

当前 MCP 注册写入用户级 `CODEX_HOME/config.toml`。注册名包含环境路径标识，server args 可以带当前环境根目录，因此多个环境可以共存。

环境只能删除自己创建且仍能验证所有权的注册项。遇到同名用户注册、来源不一致、环境路径不匹配或配置无法安全解析时，CLI 必须保留原配置并报告冲突。

卸载环境不会删除：

- 用户已有的同名 MCP 注册；
- 其他环境拥有的 MCP 注册；
- 项目级 Skill；
- 系统级或用户级共享工具；
- 无法验证为 QA 所有的文件或配置。

环境卸载保留整个环境目录和旧环境 Skill。MCP 注册按所有权记录检查后清理。

## 安装记录、锁记录与版本

后续统一锁记录应按适用对象追溯以下信息。当前并非所有字段都已记录：

- 名称和类型；
- `scope`；
- 来源仓库、npm 包、官方资产或本地路径；
- 版本、Git 提交或不可变资产标识；
- 许可证；
- 实际安装路径；
- 文件或资产 SHA256；
- 安装时间和管理环境；
- 当前所有权和本地修改状态。

外部 Skill 来源清单位于交付包的 `packages/skills/external-sources.json`。清单条目当前使用以下字段：

| 字段 | 含义 |
| --- | --- |
| `name` | Skill 名称 |
| `repository` | GitHub 仓库地址 |
| `ref` | 上游分支，空字符串表示默认分支 |
| `path` | Skill 在仓库中的路径 |
| `commit` | 当前固定的上游提交 |
| `license` | 上游许可证标识 |

MCP 下载清单位于 `packages/mcp/external/`。桌面应用和其他下载资产的版本、提交、许可证、官方资产和 SHA256 记录在对应清单中。

当前项目模板没有提供固定的 `docs/qa/tasks/skill-installs.md` 文件。项目文档不得引用该不存在的路径。项目级 Skill 安装记录应暂存于业务项目已有的维护文档或任务记录中，并包含上述字段。统一的项目 Skill 锁文件和安装记录模板属于待实现能力，确定路径后再同步模板、`AGENTS.md` 和 CHANGELOG。

复用已有 Skill 时不产生新的安装记录。共享工具的复用状态和实际版本按环境记录。不能只根据清单版本推断本机已安装版本。

## Skill 生命周期

### 当前支持

AI 使用 Skill 前检查会话、全局、当前项目和旧环境中的可用版本。具体检查顺序以项目引导和 Skill 引用为准。缺失时，按任务需要从 QA 交付包或外部来源安装到当前业务项目，并读取对应的 `SKILL.md`。

当前 CLI 提供外部 Skill 的只读更新检查：

```powershell
.\packages\qa-cli\bin\qa.cmd skills check-updates
.\packages\qa-cli\bin\qa.cmd skills check-updates --source ./external-sources.json
```

```bash
bash packages/qa-cli/bin/qa.sh skills check-updates
bash packages/qa-cli/bin/qa.sh skills check-updates --source ./external-sources.json
```

检查只比较来源清单中的固定提交与上游指定目录的最新提交。检查不会安装、升级、覆盖或删除 Skill，也不会修改安装记录。网络失败、来源无效、目录不存在或无法确认版本时必须报告未知或错误，不能报告为最新。

### 当前不支持

当前没有统一的以下命令：

- `skills install`
- `skills update` 或 `skills upgrade`
- `skills repair`
- `skills uninstall`

项目级 Skill 的安装、升级和移除由业务项目与 AI 当前任务共同管理。环境卸载不删除项目级 Skill。旧环境升级保留原 Skill 目录和锁记录；环境检查不因 Skill 缺失而自动安装 Skill。

### 后续升级规则

实现统一升级命令前，应满足以下规则：

1. 升级前读取来源、版本、提交、哈希、scope 和所有权。
2. 检查本地修改、同名 Skill 和来源变化。
3. 先生成差异、冲突和迁移报告。
4. 写入前保存可恢复的状态、锁记录和配置快照。
5. 用户修改默认保留，不能静默覆盖。
6. 升级失败时恢复原 Skill、锁记录和安装状态。
7. 升级成功后同步实际版本、提交、哈希和变更记录。
8. 卸载只删除受管且未修改的内容；修改内容必须保留并报告。

## 当前命令边界

| 命令 | 当前用途 | 写入范围 | 当前状态 |
| --- | --- | --- | --- |
| `env init` | 初始化或重跑环境，并注册环境所需 MCP | 环境状态、共享工具和当前环境拥有的 MCP 注册 | 已支持 |
| `env check` | 检查环境与组件状态 | 只读 | 已支持 |
| `env uninstall` | 清理当前环境拥有的注册并保留环境目录 | 可验证的环境注册 | 已支持 |
| `mcp list` | 查询可选 MCP 清单 | 只读 | 已支持 |
| `mcp add` | 安装并注册清单中的按需 MCP | 共享工具、安装记录和用户级注册 | 已支持部分 npm MCP |
| `mcp remove` | 删除当前环境或清单拥有的按需 MCP | 仅处理可验证所有权的内容 | 已支持 |
| `skills check-updates` | 检查外部 Skill 上游差异 | 只读 | 已支持 |
| `skills install/update/uninstall` | 统一管理 Skill 生命周期 | — | 待实现 |
| `mcp check/upgrade/repair` | 检查或迁移 MCP 配置与版本 | — | 待实现 |

## 更新检查

仓库根目录执行：

```powershell
.\packages\qa-cli\bin\qa.cmd update check
.\packages\qa-cli\bin\qa.cmd update check --source ./update-sources.json
```

macOS / Linux 使用：

```bash
bash packages/qa-cli/bin/qa.sh update check
bash packages/qa-cli/bin/qa.sh update check --source ./update-sources.json
```

默认配置为 `packages/qa-cli/update-sources.json`。`--source` 可指定其他配置文件。`sources` 用于检查 npm 包或 GitHub Release。结果比较固定基线和上游候选，不代表本机实际安装版本。检查不安装或升级组件，也不修改锁记录。

## MCP 注册与保护规则

启用 Codex 时注册内置 `qa` MCP。标准模式还注册 `playwright`，`--full` 再注册 `agent-browser`。两者使用环境内 Chromium。

`--skip-codex` 不注册 QA MCP 和依赖 Codex 的 MCP。`--skip-skills` 跳过浏览器 MCP 和浏览器辅助 CLI，不影响 QA MCP。

内置 QA MCP 使用 stdio 通信。标准输出只传输 MCP 协议消息，诊断信息写入标准错误。它复用 CLI 业务逻辑和路径、所有权、用户文件保护规则。

当前 MCP 使用用户级 `CODEX_HOME/qa-ai-playwright-mcp.lock.json` 记录环境、来源、scope、版本和注册项配置快照。配置与记录不一致时保留注册并报告。以下列出当前保护边界和后续升级要求。完整配置快照回滚仍待实现：

- 变更前应保存可恢复的 `CODEX_HOME/config.toml` 快照。
- 只修改当前 QA 环境拥有的注册项。
- 同名但非当前环境拥有的注册项必须保留。
- 注册失败时应保留原配置，并清理临时安装状态。
- 记录实际 server command、args、来源、版本、路径和 scope。
- 环境卸载后清理当前环境注册，保留共享 MCP 和其他环境注册。
- 不提供任意命令执行或环境自卸载工具。

内置 QA MCP 提供以下结构化工具：

| 工具 | 职责 |
| --- | --- |
| `qa_env_check` | 检查环境状态 |
| `qa_doctor` | 诊断环境问题 |
| `qa_project_init` | 初始化项目 |
| `qa_project_check` | 检查项目 |
| `qa_project_uninstall` | 卸载受管理项目 |
| `qa_mcp_list` | 查询 MCP 清单 |
| `qa_mcp_add` | 安装并注册按需 MCP |
| `qa_mcp_remove` | 移除按需 MCP |

其他支持 stdio 的客户端可使用 Bun 和服务入口的绝对路径配置：

```json
{
  "command": "［Bun 可执行文件绝对路径］",
  "args": ["［交付包绝对路径］/packages/mcp/builtin/qa-server.ts", "--root", "［环境根目录绝对路径］"]
}
```

凭证、Cookie、私钥和本地认证状态不写入配置示例，也不提交到仓库。

## 按需 MCP

以下 MCP 默认不安装：

| MCP | 类型 | 用途 | 来源 | 当前状态 |
| --- | --- | --- | --- | --- |
| `faker` | npm（`faker-mcp-server`） | 生成测试假数据 | <https://github.com/funsjanssen/faker-mcp> | 已接入 `mcp add` |
| `docker-mcp` | 待核对 | 容器环境管理 | <https://github.com/QuantGeekDev/docker-mcp> | 待核对安装方式 |
| `k6 MCP` | 外部二进制 | 性能压测 | <https://github.com/grafana/mcp-k6> | 暂不纳入一键安装 |
| `OWASP ZAP MCP` | ZAP 附加组件 | 安全扫描 | <https://github.com/zaproxy/zaproxy> | 暂不纳入一键安装 |

```powershell
.\packages\qa-cli\bin\qa.cmd mcp list
.\packages\qa-cli\bin\qa.cmd mcp add faker
.\packages\qa-cli\bin\qa.cmd mcp remove faker
```

```bash
bash packages/qa-cli/bin/qa.sh mcp list
bash packages/qa-cli/bin/qa.sh mcp add faker
bash packages/qa-cli/bin/qa.sh mcp remove faker
```

`mcp add` 只对清单中已接入的 npm 包型 MCP 生效。k6 和 ZAP 需要外部程序或守护进程，暂不纳入一键安装、升级和卸载。

## 使用边界

标准模式：

```powershell
.\packages\qa-cli\bin\qa.cmd run codex
.\packages\qa-cli\bin\qa.cmd run playwright-cli
```

需要 Agent Browser 时：

```powershell
.\packages\qa-cli\bin\qa.cmd env init typescript --full
.\packages\qa-cli\bin\qa.cmd run agent-browser
```

Codex 登录由用户交互完成。凭证和本地认证状态不提交。

## 维护要求

新增或调整 Skill、MCP、清单、安装命令或作用域时，需要同步检查：

- 来源、版本、许可证和 SHA256；
- 安装路径、scope 和所有权；
- 锁记录与实际文件；
- 重复安装、冲突保护和失败恢复；
- 项目修改、用户文件和共享工具保留规则；
- 环境卸载后的 MCP 注册清理；
- 相关模板、`AGENTS.md`、维护指南、版本记录和 CI 断言。

详细维护规则见[维护指南](maintenance.zh-CN.md)。
