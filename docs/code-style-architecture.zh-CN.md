# 代码风格与架构规范

[使用人员](../README.md) | [维护人员](maintenance.zh-CN.md)

规范按三层维护。公共规则约束测试边界和依赖方向。语言规则约束具体实现。AI 生成或修改测试时，先读公共规则，再读目标语言规则。

## 规则入口

- [公共架构与边界](code-style-architecture-common.zh-CN.md)
- [TypeScript 风格与架构](typescript-code-style.zh-CN.md)
- [Python 风格与架构](python-code-style.zh-CN.md)

## AI 路由

1. 先读取项目 AGENTS.md 和公共架构与边界。
2. TypeScript 项目读取 TypeScript 风格与架构和 qa-typescript。
3. Python 项目读取 Python 风格与架构和 qa-python。
4. 设计测试层级时读取 qa-test-design，执行环境时读取 qa-setup。

两种语言保持相同的测试边界、数据隔离、写保护、清理和证据要求。语法、类型系统、fixture 和运行器按语言分别实现。

## 当前门禁边界

- .editorconfig 和 .gitattributes 统一缩进、编码和换行。
- TypeScript 通过 tsc --noEmit 检查类型。Python 通过 pytest 严格配置和严格 markers 检查运行器约定。
- 当前没有在模板中强制安装 ESLint、Prettier、Ruff 或 Black。命名、格式和依赖方向由语言规范、代码评审和现有测试共同约束。
- 后续接入 lint 或 formatter 时，必须分别加入对应语言模板的锁文件、CI 门禁、生成项目检查和版本记录。
