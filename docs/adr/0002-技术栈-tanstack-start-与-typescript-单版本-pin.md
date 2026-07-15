# ADR-0002 技术栈 TanStack Start 与 TypeScript 单版本 pin

- 状态：已采纳
- 日期：2026-07-16

## 背景 Context

早期讨论中框架约束写的是「Next.js + Vite 做 SSG」，但两者是互斥的构建体系（Next 只有 webpack/Turbopack，无主流 Vite 组合）。需求方后来把技术栈明确为 React + TanStack Start、构建走 Vite（voidzero 生态）

另一个独立事实改变了引擎选型空间：npm `typescript@latest` 已是 7.x（native/Go 实现），包内只有 tsc 二进制包装、JS compiler API 整个不存在（实证 `require('typescript').createProgram === undefined`）；JS 实现版本线终结于 5.9.3 与过渡线 6.0.x。本项目的分析引擎必须在浏览器 worker 里调 compiler API

## 决策 Decision

1. React 19 + TanStack Start + Vite + pnpm；SSG 静态导出部署 GitHub Pages
2. typescript **单版本 pin 5.9.x**：分析引擎与仓库工具链共用同一个版本。脚手架默认的 6.0.x 降到 5.9.x，避免「工具链一个版本、引擎一个版本」的双版本心智负担与行为差异
3. 页面 Footer 明示引擎 TS 版本号

## 代价与后果 Consequences

- 「与最新 TS 行为一致」的教学口径会随 7.x 普及逐渐失真，这是无法回避的断层，只能明示版本号来管理预期；长期出路等官方 WASM 方案（目前没有）
- 工具链停在 5.9.x：放弃 6.x 的工具链改进，换取单版本一致性
- TanStack Start 相对年轻，SSG 路径的坑要自己踩（相比 Next 的成熟静态导出）；换来的是纯 Vite 构建链与 monaco worker 集成的官方样板路径

## 备选方案 Alternatives

- Next.js 静态导出：与「Vite 构建」要求冲突，Turbopack 下 monaco worker 配置要手写，否决（需求方已明确改栈）
- 引擎与工具链双版本（engine pin 5.9 + toolchain 6.x/7.x）：pnpm alias 可实现，但同仓库两个 TS 的类型行为差异会在测试与 IDE 里制造混乱，否决
- 出处：[TS 5.4 公开 isTypeAssignableTo PR #56448](https://github.com/microsoft/TypeScript/pull/56448)、[Next Turbopack 文档](https://nextjs.org/docs/app/api-reference/turbopack)、typescript@7.0.2 本地实证
