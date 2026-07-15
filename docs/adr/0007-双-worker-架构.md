# ADR-0007 双 worker 架构

- 状态：已采纳
- 日期：2026-07-16

## 背景 Context

需要在浏览器里同时提供两种 TS 能力：编辑体验（诊断/补全/hover）与集合语义分析（export 提取、assignability 矩阵、原子分解）。monaco 内置 TS worker 天然提供前者；后者放哪有两条路：扩展 monaco 的 TS worker（TS Playground 的 `customWorkerPath` + `customTSWorkerFactory` 路线，[monaco-typescript#65](https://github.com/microsoft/monaco-typescript/pull/65)），或起独立分析 worker

## 决策 Decision

**双 worker**：monaco 内置 TS worker 管编辑体验（零定制）；独立分析 worker（typescript 5.9.x + @typescript/vfs 起 LanguageService）管集合语义，RPC 面只有 `analyze(code) → IR` 与 `quickInfo(position)`。画布 hover 的类型文本也从分析 worker 取，保证与图同源

分析请求带单调递增 revision，过期结果丢弃

## 代价与后果 Consequences

- 两份 TS 实例 + 双份 lib.d.ts 内存（MB 级）、TS worker 代码双份加载（gzip ~1.5MB × 2 中的引擎部分；lib 有 CDN 缓存）—— 已接受
- 换到手的：分析引擎与 monaco 完全解耦，`LanguageAdapter` 接口下每个语言各带各的分析 worker，渲染层零感知；monaco 将来可替换（其他语言可能用 CodeMirror 等）
- 编辑器诊断与分析引擎理论上可能版本不一致（monaco 内置 TS 版本 vs 我们 pin 的 5.9.x）—— monaco 0.55 内置恰好也是 5.9.3，当前一致；升级 monaco 时要复核

## 备选方案 Alternatives

- 扩展 monaco TS worker（Playground 路线）：省一份内存，但分析逻辑焊死在 monaco 上，多语言 adapter 的统一接口就没了；且 `customWorkerPath` 在 module worker 下有 `importScripts` 限制（[monaco-editor#3151](https://github.com/microsoft/monaco-editor/issues/3151)），否决
- 分析跑主线程：教学演示时输入频繁，O(N²) assignability + 原子分解会卡输入，违背「类型解析在 worker」的架构约束，否决
