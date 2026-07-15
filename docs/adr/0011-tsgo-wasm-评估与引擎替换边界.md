# ADR 0011 —— tsgo-wasm 评估与引擎替换边界

- 状态：已采纳
- 日期：2026-07-16

## 背景 Context

用户提示了 [tsgo-wasm](https://www.npmjs.com/package/tsgo-wasm)：TypeScript 7（native/Go 实现，typescript-go）的非官方 WASM 每日构建，可在浏览器运行。而 [ADR-0002](./0002-技术栈-tanstack-start-与-typescript-单版本-pin.md) 把分析引擎 pin 在 TS 5.9.x 的一个理由是「TS 7 无浏览器方案」，需要重新评估

对 `tsgo-wasm@7.0.2` 包内容的实际核查结论：

- 包产物只有 `tsgo.wasm` 二进制与一个 CLI 包装脚本（`main: tsgo.wasm`），形态是 tsc CLI / LSP server 的 WASM 编译
- 没有任何 JS compiler API 面：没有 `TypeChecker`、`Type` 对象内省、`isTypeAssignableTo`、union/intersection 分解、`getCallSignatures` 这些能力的暴露；typescript-go 上游本身也未提供 JS API（官方公告明确 API 层需等后续设计）
- 它是非官方构建（sxzz 维护，源码来自官方仓库每日 CI），版本随上游 nightly 滚动

## 决策 Decision

分析引擎维持 TS 5.9.x JS compiler API 不变。tsgo-wasm 不能替代它：集合语义分析依赖 checker 级内省（assignability 双向查询、判空、类型分解、字面量 flags），LSP 协议与 tsc CLI 都不暴露这些

同时把「引擎可替换」明确为架构边界的职责：`LanguageAdapter` 接口（`src/core/analysis/adapter.ts`）是唯一耦合点，core/layout/views 均不感知 typescript 包。将来 TS 7 若开放 API（任何形态：JS binding、WASM export、LSP 扩展协议），替换动作被限制在 adapter 目录内

tsgo-wasm 的合理用途留作后续观察项：编辑器侧诊断/hover 若要与 TS 7 行为对齐，可评估用它跑 LSP-in-worker，与分析引擎（5.9 语义）双轨 —— 但双轨意味着编辑器报错口径与集合语义口径可能不一致，引入前必须先解决口径标注问题

## 代价与后果 Consequences

- 教学口径固定在 TS 5.9.x 语义，与 TS 7 的行为差异会随时间积累；页面明示引擎版本（ADR-0002 已定）仍是必要缓解
- 收益是保住了整个语义引擎的可行性：checker 级 API 是本产品的地基，没有它一切免谈

## 备选方案 Alternatives

- 用 tsgo-wasm 跑 LSP、从 hover/diagnostics 文本反解类型关系 —— 否决：文本反解脆弱且拿不到 assignability 判定，等于重新实现一个不完整 checker
- 等待 TS 7 官方 API 再启动项目 —— 否决：时间不可控，且 adapter 边界已把未来迁移成本压到局部
