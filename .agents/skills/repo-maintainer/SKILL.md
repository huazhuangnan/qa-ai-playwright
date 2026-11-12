---
name: repo-maintainer
description: 修改、验证或发布本仓库时使用；仅提供项目治理规则，不提供业务 QA 能力。
metadata:
  version: "0.0.1"
---

# 仓库维护入口

## 规则

- 从根 `AGENTS.md` 的任务表选择一个 reference。跨领域时再读取相关 references。
- 变更保持精简。文档用短句，TypeScript 用 TSDoc。
- 仓库实现和测试用 TypeScript，依赖用 pnpm，维护脚本和测试用 Bun。
- Python 仅用于语言模板、Python 示例 QA 或系统能力要求。
- 独立任务可用少量 subagent，同一文件只由一个任务修改。
- 安装和测试交给 GitHub Actions。本机静态检查不能报告为完整通过。
- 有效变化写入 `docs/maintainers/version-history.zh-CN.md` 的未发布章节。
- 模板变化同步 `CHANGELOG.md`。
- 完成时提供英文 commit 信息。未经明确要求不 commit 或 push。
- 维护 Skill 不进入使用者说明，也不宣称是 QA 功能。

## 说明

本文件只放跨任务规则。环境、QA Skills、模板、文档和示例规则在 `references/`。

## 示例

CLI 任务读取 `references/environment.md`。跨领域发布再读取相关 references 和维护指南。
