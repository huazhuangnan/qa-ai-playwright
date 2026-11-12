# Release 发布指南

[使用人员](../../README.md) | **维护人员**

本页说明 GitHub Release 的版本、资产和说明来源。

## 交付边界

| 内容 | 用户包 | 说明 |
| --- | --- | --- |
| `README.md`、`docs/users/` | 包含 | 面向 QA 使用人员 |
| `packages/` | 包含 | QA CLI、Skills、MCP、模板和运行时清单 |
| 模板 `AGENTS.md` | 包含 | 生成 QA 项目需要项目规则 |
| 根 `AGENTS.md`、`.agents/` | 排除 | 只用于维护本仓库 |
| `docs/maintainers/` | 排除 | 维护记录和发布流程 |
| `apps/`、`tests/`、`scripts/` | 排除 | 示例源码和仓库开发资产 |

打包脚本校验用户 Markdown 的相对链接。
Package 工作流检查治理文件未进入用户包，并验证两种语言的模板规则可生成。

## 说明放置位置

- 日常下载和使用步骤写在 [README](../../README.md) 与环境指南。
- 发布流程、资产清单和验收门禁写在 [维护指南](maintenance.zh-CN.md)。
- 每个版本面向使用人员的变更说明写在 `docs/releases/v<版本>.md`。
- GitHub Release 正文由该版本文件和 GitHub 自动生成的变更组成。
- 长期兼容性、迁移和历史记录同步写入 [版本记录](version-history.zh-CN.md)。

## 版本说明格式

文件名使用 Tag 名称，例如 `docs/releases/v0.0.1.md`。

内容只写用户需要知道的变化：

```markdown
# v0.0.1

## 新增

- ［用户可见变化］

## 修复

- ［用户可见修复］

## 使用变化

- ［安装或迁移步骤；没有时删除本节］
```

不要在 Release 说明中放凭证、内部路径或未验证的测试结论。验证结果由 Release 工作流提供。

## 发布前检查

1. 更新根 `package.json` 版本。
2. 更新 `docs/releases/v<版本>.md`。
3. 同步 `docs/maintainers/version-history.zh-CN.md` 的未发布内容。
4. 创建匹配的 `v<版本>` Tag。
5. 等待主 CI 的质量、环境和项目 smoke 全部成功。
6. 检查 GitHub Release 的 ZIP 和 `SHA256SUMS.txt`。

每个 Release 的交付资产包括一个工作流上传的 ZIP：

| 文件 | 用途 |
| --- | --- |
| `qa-ai-playwright-v<版本>.zip` | 普通使用者运行 QA CLI |
| `SHA256SUMS.txt` | 校验用户 ZIP |

GitHub 还会自动显示 `Source code (zip)` 和 `Source code (tar.gz)`。
开发和维护使用这两个源码快照。它们是平台生成的源码快照，不是本项目工作流上传的用户包。

没有对应版本文件时，工作流仍会使用 GitHub 自动生成的变更说明。

## 手动生成交付包

在 GitHub Actions 中手动运行 `Package` 工作流，可以从所选分支生成使用者包。
工作流会上传一个 ZIP 和 `SHA256SUMS.txt`，结果保存在该次运行的 Artifacts 中。
默认只生成构件，不创建 GitHub Release。

使用者包面向解压后直接运行 QA CLI 的场景。开发和维护使用 GitHub 自动提供的源码快照。

手动运行时可以启用 `publish_release` 发布 Release，并启用
`force_overwrite` 更新同名 Release。Release 标签由根 `package.json` 的版本生成，格式为 `v<版本>`。
同名 Release 已存在且未启用覆盖时，发布步骤会失败并保留原 Release。
启用覆盖时会替换同名用户包和校验文件，并清理旧的 `-user.zip`、`-developer.zip` 拆分包。

主 CI 只允许同一个 Tag 发布一次。若同名 Release 已存在，检查 job 会成功完成，发布 job 会跳过并保留原 Release，不会覆盖或重复上传。
