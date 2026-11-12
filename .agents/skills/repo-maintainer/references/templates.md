# 项目模板

- Python 和 TypeScript 模板分别维护 `VERSION` 和 `CHANGELOG.md`。
- 首次提交前，自有包、builtin Skills 和维护 Skill 保持 `0.0.1`。
- 外部 Skill、MCP 和应用记录真实来源与版本。
- 项目清单记录 QA 文档模板和语言模板版本。
- TypeScript 锁定依赖和 `pnpm-lock.yaml`。Python 使用带哈希的 `requirements.lock`。
- `env init` 复用已有 Bun、pnpm 并记录实际版本。
- 生成项目安装使用 `pnpm install --frozen-lockfile`，脚本通过 Bun 执行。
- 模板只保留可执行或可填写的内容，不放重复目录说明。
- `QA_ENV` 选择环境。`UI_BASE_URL`、`API_BASE_URL` 分开配置。`BASE_URL` 仅作兼容回退。
- 项目变量登记到 `docs/qa/inputs/input-index.md`。
- 模板提供认证、API、唯一数据和 LIFO 清理 fixtures。
- API 测试由显式门禁运行。缺契约不能当作覆盖。
- 生产写入默认禁止。写入时使用独立开关并记录环境。
- 测试使用 smoke、regression、contract、integration 标签。
- CI 限制权限、时长和并发，归档失败证据。PR 做快速验证，手动任务做完整矩阵。
