# ADR 0019 —— LanguageAdapter 能力拆分与描述符

- 状态：已采纳
- 日期：2026-07-22

## 背景 Context

[ADR-0015](./0015-统一单一-typescript-资源-6.0.3.md) 之后 `LanguageAdapter` 从一个 `analyze` 长到七个方法，编辑器能力（补全 / 格式化 / twoslash）成为每个未来语言的义务；`twoslashQueries` 是 TS 社区概念，出现在 core 的语言无关契约里，违反「TS 知识不越过 adapter 边界」不变量。同时存在三处语言知识泄漏：`EditorService` 硬编码 `export type CN = ...` 声明语法，views 与 i18n 写死 unknown / never / any 显示名。Rust / Golang 语言接入已确认排期，且启动进度上报也要进契约 —— 拆分有了真实驱动，不再是投机抽象

## 决策 Decision

契约按四块重组：

1. **descriptor（纯数据）**：id、label、editorLanguageId、engineLabel、presets、sampleSource、compilerOptionsDisplay，新增 `specialTypeNames`（universe / empty / any 在该语言里的名字）与 `snippet`（声明模板函数 + 自动命名导出的匹配 pattern）—— 三处泄漏全部收回 adapter
2. **分析核心（必选）**：`analyze` / `check`，画布与诊断的最小面
3. **编辑器能力（可选）**：`editor?: { quickInfo, completions, format, inlineQueries }`；twoslash 更名为语言中立的 inlineQueries，`// ^?` 语法降为 TS adapter 内部细节；能力缺失时 UI 降级（隐藏对应按钮 / 不注册 provider）
4. **事件面**：`onTypesAcquired` 与 `onBootProgress` 统一为多订阅事件（worker 侧真实多播），修复单槽监听的暗坑

## 代价与后果 Consequences

- 契约一次变大但形状被锁定：新语言最小交付 = descriptor + analyze + check，编辑器能力可后补；服务端 / wasm / worker 三种引擎形态都被全异步契约覆盖
- UI 需要处理能力缺失的降级态，多一类状态
- 跨 adapter 契约测试套件（同一断言集跑每个实现）随本 ADR 补齐，配 FakeLanguageAdapter 作为第二实现 —— 文档中 L 的声明从此有实体支撑

## 备选方案 Alternatives

- 保持扁平接口、可选方法用 undefined 表达 —— 否决：能力成组出现（编辑器体验是一组），散落的可选方法让调用方逐个探测
- 为每种能力定义独立接口并用 DI 分别注册 —— 否决：当前只有一个消费方（编辑器视图），拆到 DI 粒度是为拆而拆
