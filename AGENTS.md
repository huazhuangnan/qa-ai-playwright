# AGENTS.md

项目目标是方便使用 Codex 完成 QA，降低准备、执行和排错成本。

## 边界

- `.agents/skills/` 是本仓库治理规则，不随交付包发布。
- `packages/skills/builtin/qa-*` 是面向使用者的 QA Skills。
- `docs/users/` 面向使用者，`docs/maintainers/` 面向维护者。
- 新边界写入本项目规则或 Skill，不修改全局配置。

## 按任务读取

| 任务 | 入口 |
| --- | --- |
| 修改、验证或发布本仓库 | [repo-maintainer](.agents/skills/repo-maintainer/SKILL.md) |
| CLI、环境、安装、浏览器和 MCP | [environment](.agents/skills/repo-maintainer/references/environment.md) |
| QA Skills、路由、资料和认证 | [skills](.agents/skills/repo-maintainer/references/skills.md) |
| QA 项目模板和 fixtures | [templates](.agents/skills/repo-maintainer/references/templates.md) |
| 使用者与维护者文档 | [docs](.agents/skills/repo-maintainer/references/docs.md) |
| 示例应用和业务 QA 工作流 | [examples](.agents/skills/repo-maintainer/references/examples.md) |

修改仓库时先读 `repo-maintainer`，再读一个匹配的 reference。跨领域时增加相关 references。不要把无关规则全文加载。
