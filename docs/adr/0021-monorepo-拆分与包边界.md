# ADR 0021 —— monorepo 拆分与包边界

- 状态：已采纳
- 日期：2026-07-22

## 背景 Context

三种能力需要在其他项目中独立复用而不携带整个网站：类型计算的输入输出契约、Euler 图定义 + 绘制、Hasse 图定义 + 绘制。现有分层依赖方向靠 lint 与 rg 审计维持（约定而非物理约束）；Rust / Golang adapter 将来也应以独立包的形式接入。仓库转为 pnpm + TypeScript monorepo

## 决策 Decision

包划分与依赖方向（全部内层 ← 外层）：

| 包                              | 内容                                                                                               | 依赖                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| `@typarium/set-model`           | 集合语义 IR、关系代数（等价类合并 / 包含结构）、画布几何契约（Box / Viewport / 常量 / 调色板 CSS） | 零                          |
| `@typarium/diagram-euler`       | rect-layout + faithfulness probe + EulerDiagram 受控组件                                           | set-model                   |
| `@typarium/diagram-hasse`       | hasse-layout + HasseDiagram 受控组件                                                               | set-model                   |
| `@typarium/language-adapter`    | adapter 契约 + 契约测试套件 + FakeLanguageAdapter                                                  | set-model                   |
| `@typarium/analyzer-typescript` | createTsAnalyzer / scan-exports / ATA，node 直接可用；typescript exact pin 只存在于此              | set-model、language-adapter |
| `apps/web`                      | services、views 壳、monaco、持久化、i18n、启动管线、worker 胶水                                    | 全部                        |

- 绘制组件为受控 props 形态（layout、activeIds、事件回调、文案 slot），不含 DI / mobx / i18n；应用侧包 observer 容器。tooltip 内容、never 图例、any 徽章属产品语义，留在 apps/web
- 包 `exports` 带 `typarium-source` 自定义条件指向 src，应用 vite 以该条件消费源码零构建；对外发布走 `tsc -b` 产 dist + d.ts 的默认条件。调色板与组件样式随包分发（CSS 变量可覆盖），不依赖宿主 tailwind
- 分层从约定变物理：包间依赖由 package.json 声明，违例直接编译不过

## 代价与后果 Consequences

- 包工程链（project references、react peerDependency、vitest workspace、发布节奏）是持续开销；单人项目里值得做的理由是「其他项目嵌入绘制」为已确认需求
- `computeCanvasLayout` 自动切换随 [ADR-0018](./0018-布局模式用户选择与自动降级.md) 移除后，两个 diagram 包互不依赖，嵌入方自行组合 probe 与引擎
- e2e 与站点行为不变；迁移属纯搬移，风险由先行补齐的测试网覆盖

## 备选方案 Alternatives

- 单包多入口（subpath exports）—— 否决：diagram 与 analyzer 的依赖重量差异大（react vs typescript），单包会让轻消费方背上重依赖的安装与审计成本
- 每包独立仓库 —— 否决：契约仍在快速演化，跨仓库版本协调成本远超单 monorepo
- 立即接 changesets 发布流水线 —— 推迟：先保证结构与构建正确，发布节奏等首个外部消费项目出现再定
