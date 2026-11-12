# Skills 与 MCP

[使用人员](../README.md) | [维护人员](maintenance.zh-CN.md)

本页说明 QA + AI + Playwright 中 Skill 与 MCP 的对象、来源、作用域、当前命令和生命周期边界。

本页同时服务两类读者。使用人员重点阅读“使用人员：组合使用方式”和“使用边界”；仓库维护人员重点阅读来源、作用域、生命周期、版本和“维护人员：维护要求”。

内置 Skill 支持项目级状态检查、安装、修复、快照和回滚。升级只提供检测结果，外部 Skill 继续按上游方式人工维护。

## 对象与来源

### Skill

Skill 是供 AI 读取的规则、路由、测试职责或工具使用说明。Skill 不等同于 CLI、MCP 或业务项目代码。

在 Codex 中使用 `/skills` 查看可用 Skill。可使用 `$qa-business-guide` 显式调用业务引导 Skill。
MCP 由客户端提供工具。项目 CLI 通过终端运行，例如 `qa env init`，不是 `/env` 命令。

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

Windows 旧环境的 QA MCP 若指向 `bun.cmd`，按以下步骤处理：

1. 检查注册和锁记录。出现所有权冲突时先人工核对，不覆盖配置。
2. 确认属于当前环境且未被修改后，执行 `qa env uninstall` 清理受管注册。
3. 使用原语言和选项执行 `qa env init`。环境目录和共享软件会保留。

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

CLI 安装的内置 Skill 记录在项目 `.agents/qa-skills-lock.json`。记录包含项目作用域、来源、版本和每个文件的 SHA256。已有的同名目录不会被接管。

复用已有 Skill 时不产生新的安装记录。共享工具的复用状态和实际版本按环境记录。不能只根据清单版本推断本机已安装版本。

## Skill 生命周期

### 当前支持

AI 使用 Skill 前检查会话、全局、当前项目和旧环境中的可用版本。具体检查顺序以项目引导和 Skill 引用为准。缺失时，按任务需要从 QA 交付包或外部来源安装到当前业务项目，并读取对应的 `SKILL.md`。

在仓库根目录使用对应平台启动器执行以下命令。`项目目录` 必须已经存在。

```text
qa skills list 项目目录
qa skills check 项目目录 qa-api
qa skills install 项目目录 qa-api
qa skills repair 项目目录 qa-api
qa skills upgrade 项目目录 qa-api  # 只输出人工操作提示  # 只输出人工升级提示
qa skills uninstall 项目目录 qa-api
```

- **状态**：列表报告 `missing`、`installed`、`modified` 或 `unmanaged`。`check` 只在受管文件完整且未修改时成功。
- **安装**：未受管目录不会被覆盖或接管。失败时尝试恢复已写入的文件，并报告未恢复的路径。
- **卸载**：遇到修改时返回失败，可检查后重试。

- **修复**：只补齐仍与锁记录匹配的缺失文件。
- **升级**：检查受管文件和新文件冲突，输出人工迁移建议。发现用户修改或未受管目标时停止。CLI 不自动替换文件或更新安装记录。

安装、修复和卸载会在修改前写入项目级恢复记录。中断后：

1. 执行 `qa skills recover 项目目录`。恢复只处理与操作前或操作后内容一致的文件。
2. 如果发现其他修改，命令停止并保留记录。
3. 如果中断安装留下空目录，确认归属后手动处理。

维护者可在人工变更前保存项目级快照：

- `qa skills snapshots 项目目录`：查看快照。
- `qa skills rollback 项目目录 快照标识`：恢复变更前的文件和安装记录。回滚前发现修改时停止。

当前 CLI 提供外部 Skill 的只读更新检查：

```powershell
.\packages\qa-cli\bin\qa.cmd skills check-updates
.\packages\qa-cli\bin\qa.cmd skills check-updates --source ./external-sources.json
```

```bash
bash packages/qa-cli/bin/qa.sh skills check-updates
bash packages/qa-cli/bin/qa.sh skills check-updates --source ./external-sources.json
```

检查只比较来源清单中的固定提交与上游指定目录的最新提交。
检查不会安装、升级、覆盖或删除 Skill，也不会修改安装记录。
网络失败、来源无效、目录不存在或无法确认版本时，必须报告未知或错误。
不能报告为最新。

### 项目作用域

内置 Skill 安装到项目 `.agents/skills/`。
卸载只删除记录中哈希未变化的文件。
修改、额外文件和符号链接会保留。
存在保留的受管文件时，保留记录并返回失败。
环境卸载不删除项目级 Skill。
外部 Skill 按上游命令安装和管理。

### 变更检测保护

变更检测检查项目安装记录和受管文件哈希。存在本地修改、缺失文件或同名未受管目标时停止，并输出人工迁移建议。维护者人工变更后再执行 `skills check`。

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
| `skills list/check/install/repair/upgrade/uninstall` | 检测并管理项目级内置 Skill；upgrade 只给人工提示 | 指定项目 `.agents/` | 已支持 |
| `mcp check/repair` | 检查状态并按记录补齐缺失项 | 共享包和用户级注册 | 已支持可选 MCP |

## 使用人员：组合使用方式

在对话中按流程组合三者。Skill 负责当前这一轮该思考什么，MCP 负责检查和准备，CLI 在会话没有对应 MCP 时提供同等入口。

```text
1. 你：说明需求、资料、环境和写入边界。
2. Codex：检查环境、项目和可用 Skill。
3. 你：要求使用 qa-business-guide 整理业务规则。
4. Codex：输出角色、状态、流程和待确认项。
5. 你：要求使用 qa-test-design 形成用例和追踪关系。
6. Codex：展示计划，等待范围确认。
7. 你：确认范围并选择 qa-api/qa-web 与语言 Skill。
8. Codex：实现、执行、保存证据。
9. 你：要求使用 qa-triage 分析失败并安排复测。
```

环境、项目和 Skill 的只读检查可以并行。安装、修复、添加和移除必须等待上一轮结果，再把缺失项、项目路径或锁记录交给下一轮。出现 `modified`、`unmanaged`、所有权冲突或配置不一致时，暂停自动写入并转为人工处理。

没有 MCP 工具时，在对话中明确说明“请使用 CLI 完成同一步骤”，并把 CLI 输出作为下一轮输入。不要跳过环境、权限、清理和证据检查。

完整的需求、Skill、MCP、执行和证据示例见[从需求到执行](qa-workflow.zh-CN.md#在-codex-中执行一条完整任务)。

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

默认配置为 `packages/qa-cli/update-sources.json`。
`--source` 可指定其他配置文件。
`sources` 用于检查 npm 包或 GitHub Release。
结果比较固定基线和上游候选，不代表本机实际安装版本。
检查不安装或升级组件，也不修改锁记录。

## MCP 注册与保护规则

启用 Codex 时注册内置 `qa` MCP。未跳过浏览器工具时，标准模式还注册 `playwright`，`--full` 再注册 `agent-browser`。
浏览器先检测并复用用户已有的兼容安装。确认缺失后才下载。用户指定浏览器时按其选择处理。浏览器自动化使用独立上下文。

`--skip-codex` 不注册 QA MCP 和依赖 Codex 的 MCP。`--skip-skills` 跳过浏览器 MCP 和浏览器辅助 CLI，不影响 QA MCP。

内置 QA MCP 使用 stdio 通信。标准输出只传输 MCP 协议消息，诊断信息写入标准错误。它复用 CLI 业务逻辑和路径、所有权、用户文件保护规则。
项目初始化和检查的 `browser` 参数支持 `chrome`、`msedge`、`chromium`、`firefox` 和 `webkit`。初始化还支持 `all` 和 `none`。

当前 MCP 使用用户级 `CODEX_HOME/qa-ai-playwright-mcp.lock.json` 记录环境、来源、scope、版本和注册项配置快照。
配置与记录不一致时保留注册并报告。

浏览器路径迁移期间，旧注册可能已经移除，而新注册尚未写入。
此时可使用相同配置重跑初始化。
如果新注册已写入但所有权记录尚未更新，需要人工核对注册与记录。
遇到无法确认的修改时，保留配置并报告。

以下列出当前保护边界和后续升级要求。完整配置快照回滚仍待实现：

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

## 维护人员：维护要求

新增或调整 Skill、MCP、清单、安装命令或作用域时，需要同步检查：

- 来源、版本、许可证和 SHA256；
- 安装路径、scope 和所有权；
- 锁记录与实际文件；
- 重复安装、冲突保护和失败恢复；
- 项目修改、用户文件和共享工具保留规则；
- 环境卸载后的 MCP 注册清理；
- 相关模板、`AGENTS.md`、维护指南、版本记录和 CI 断言。

详细维护规则见[维护指南](maintenance.zh-CN.md)。
