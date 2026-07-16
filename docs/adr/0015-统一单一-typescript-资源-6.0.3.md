# ADR 0015 —— 统一单一 TypeScript 资源（6.0.3）

- 状态：已采纳
- 日期：2026-07-16

## 背景 Context

[ADR-0013](./0013-引擎切换-tsgo-wasm.md) 落地后项目里同时存在两份 TypeScript 实现：tsgo-wasm（TS 7，47MB wasm，语义引擎）与 monaco 内嵌的 TS 5.9 worker（编辑器诊断/hover/补全），另有 typescript@5.9.3 npm 包兼作 parser。用户提出统一要求：不希望项目中有多份 TypeScript 实现、不加载多份资源；并要求先核实 TS 7 能否补齐 hover 类型展开，做不到就统一成 TypeScript 6.0.3

两项核实结论（2026-07-16 实测）：

- **tsgo-wasm 的 LSP hover 不可实用**。`tsgo --lsp --stdio` 模式存在（jsonrpc 帧校验生效），但在最友好的环境（node + 真实 fs）做 initialize → didOpen → hover 的完整往返，hover 请求 5 秒无应答，仅 initialize 有响应。浏览器环境（wasm + 内存 fs + LSP 帧流经 fd 0/1 shim）只会更难，且该路线要求 Go wasm 实例常驻、外加 LSP 客户端接线，47MB 资产仍在
- **typescript@6.0.3 具备全部所需能力**。6.0 是 JS 实现的最后过渡线（与 5.9 同源），实测 `checker.isTypeAssignableTo`、`checker.getNeverType`、`languageService.getQuickInfoAtPosition`、`typeToString(InTypeAlias | NoTruncation)` 展开全部可用，且与 @typescript/vfs 兼容

## 决策 Decision

统一到 **typescript@6.0.3（exact pin）单一资源**，一个分析 worker 同时供给画布与编辑器：

1. 语义引擎回到 checker API 直查（`isTypeAssignableTo` 双向 → 关系矩阵；special 分类用 TypeFlags 与 never 赋值判定），tsgo-wasm 与诊断探针架构退役，vendored Go runtime / 内存 fs shim / canary 防毒化一并移除
2. **monaco 不再加载内嵌 TS worker**。编辑器只保留 monarch 语法高亮（basic-languages），诊断（350ms 快速 check → markers）、hover（quickInfo）、补全（getCompletionsAtPosition）全部由同一个 6.0.3 worker 通过 monaco provider 供给
3. `LanguageAdapter` 契约扩展 `check` / `quickInfo` / `completions` —— 「单一语言实现同时服务画布与编辑器」成为 adapter 的职责定义（多语言扩展时同样成立）
4. `TypeEntity` 恢复 `expandedText`（alias 一层展开文本），画布 tooltip 直接展示展开结果 —— hover 类型展开能力随统一顺带回归

## 代价与后果 Consequences

- 教学口径从「TypeScript 7」回到「TypeScript 6.0.3」，footer 同步；6.0 与 7 的行为差异随 7.x 普及会逐渐显现，与 [ADR-0002](./0002-技术栈-tanstack-start-与-typescript-单版本-pin.md) 时代相同的失真风险重新存在
- 收益立竿见影：产物从 61MB 回落到 ~15MB（去掉 47MB wasm 与 monaco ts.worker 分包）；每次分析不再重新 instantiate wasm；编辑器诊断与语义引擎口径完全一致（同一 checker）
- ADR-0013 沉淀的 Go wasm 工程经验（argv+env 上限、fs 回调异步化、canary 防毒化）保留在文档与 git 历史，若未来官方出 TS 7 API 再评估
- monaco 内嵌 TS（5.9.3）仍存在于 node_modules，但不进 bundle、不被加载 —— 「一份资源」以运行时加载口径衡量

## 备选方案 Alternatives

- tsgo LSP 全托管（诊断/hover/补全都走 LSP）—— 否决：hover 实测无应答；常驻 wasm 实例 + LSP 客户端接线工程量大；47MB 资产保留，与「不加载多份资源」的目标矛盾
- 保留 tsgo 做语义 + 6.0.3 做编辑器 —— 否决：正是用户要消除的双实现形态
- monaco 内嵌 worker 继续用、语义引擎切 6.0.3 —— 否决：仍是两份加载（monaco ts.worker 与分析 worker 各带一份 TS），且版本口径分裂（5.9 vs 6.0）
