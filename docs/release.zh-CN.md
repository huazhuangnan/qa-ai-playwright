# Release 发布指南

[使用人员](../README.md) | **维护人员**

本页说明 GitHub Release 的版本、资产和说明来源。

## 说明放置位置

- 日常下载和使用步骤写在 [README](../README.md) 与环境指南。
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
3. 同步 `docs/version-history.zh-CN.md` 的未发布内容。
4. 创建匹配的 `v<版本>` Tag。
5. 等待主 CI 的质量、环境和项目 smoke 全部成功。
6. 检查 GitHub Release 的 ZIP 和 `SHA256SUMS.txt`。

没有对应版本文件时，工作流仍会使用 GitHub 自动生成的变更说明。

## 手动生成交付包

在 GitHub Actions 中手动运行 `Package` 工作流，可以从所选分支生成使用者包和开发者包。
工作流会上传两个 ZIP 和 `SHA256SUMS.txt`，结果保存在该次运行的 Artifacts 中。
默认只生成构件，不创建 GitHub Release。

使用者包面向解压后直接运行 QA CLI 的场景。开发者包保留完整源码、测试和维护文件。
普通使用者下载文件名包含 `-user.zip` 的资产。需要修改仓库或运行维护测试时下载 `-developer.zip`。

手动运行时可以启用 `publish_release` 发布 Release，并启用
`force_overwrite` 更新同名 Release。Release 标签由根 `package.json` 的版本生成，格式为 `v<版本>`。
同名 Release 已存在且未启用覆盖时，发布步骤会失败并保留原 Release。
启用覆盖时会替换同名新资产，并删除旧的单包资产 `qa-ai-playwright-v<版本>.zip`。

主 CI 只允许同一个 Tag 发布一次。若同名 Release 已存在，检查 job 会成功完成，发布 job 会跳过并保留原 Release，不会覆盖或重复上传。
