# typarium docs

typarium 是一个把 TypeScript 类型系统可视化为集合论 Euler 图的教学 Web 应用。docs/ 是本仓库唯一使用中文的区域，按职责分目录：

- [requirements/原始诉求.md](./requirements/原始诉求.md) —— 需求的唯一事实源：要做什么、为什么做、验收场景
- [product/产品功能定义.md](./product/产品功能定义.md) —— 每个功能的行为定义与验收标准、期 1 验收清单、非目标
- [architecture/工程架构设计.md](./architecture/工程架构设计.md) —— 分层模型、依赖规则、集合语义 IR 契约、双 worker 架构
- [engineering/工程规范定义.md](./engineering/工程规范定义.md) —— 代码语言、质量门禁、测试策略、提交与文档约定
- [design/功能技术设计.md](./design/功能技术设计.md) —— 语义引擎、布局引擎、渲染、编辑器管线、持久化与分享的技术方案
- [adr/](./adr/) —— 决策记录：有争议或有代价的选择，先 ADR 后实现，一个决策一个文件

阅读顺序建议：原始诉求 → 产品功能定义 → 工程架构设计 → 功能技术设计；ADR 按需查阅
