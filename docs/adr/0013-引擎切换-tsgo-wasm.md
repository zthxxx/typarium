# ADR-0013 引擎切换：tsgo-wasm 诊断探针

- 状态：已采纳（推翻 [ADR-0011](./0011-tsgo-wasm-评估与引擎替换边界.md) 的部分结论）
- 日期：2026-07-16

## 背景 Context

需求方在第二轮明确要求类型分析引擎使用 TypeScript 7 的 [tsgo-wasm](https://www.npmjs.com/package/tsgo-wasm)。ADR-0011 当时的否决理由是「集合语义分析依赖 checker 级内省，tsc CLI 不暴露这些」—— 这个前提被 [ADR-0012](./0012-可视化范式-矩形包含布局.md) 的范式收窄改变了：矩形布局只需要两两包含关系矩阵，原子分解、交集判空、字面量 flags 这些 checker 独有的能力全部退役

剩下的唯一语义问题「X 可否赋给 Y」可以用**诊断探针**回答：合成一行 `declare const s: X; const d: Y = s`，该行是否报 error 就是 assignability oracle。这把语义查询从 compiler API 解耦成了任何 tsc 形态（CLI、LSP、wasm）都能回答的问题

实测确认可行：`tsgo-wasm@7.0.2` 是 Go js/wasm ABI 的 tsc 编译产物，`--pretty false` 输出 `file(line,col): error TSxxxx: msg` 的可机读诊断，lib.d.ts 内嵌在 wasm 内无需外部文件，node 下单次全量运行约 0.4s

## 决策 Decision

1. **语义 oracle 切换为 tsgo-wasm（TypeScript 7）**，架构为：
   - 探针文件：`import type` 引入用户导出 + 虚拟预设别名 + 每行一条赋值探针，行号与 (X→Y) 有序对确定映射；一次分析一次 tsc run
   - 关系分类：双向可赋 = equivalent、单向 = subset/superset、双向不可 = unrelated
   - 哨兵分类先于关系矩阵：any ⟺ `unknown ⊆ X ∧ X ⊆ string`（any 可赋给一切唯独 never 除外，实测；never 探针对 any 判定不可用）、empty ⟺ `X ⊆ never ∧ ¬any`、universe ⟺ `unknown ⊆ X ∧ ¬any`
   - **canary 防毒化**：探针文件固定含一行必然报错的哨兵，解析结果里没有它就说明引擎没有真实运行，必须 throw 交给上层的 failed 态处理 —— 空诊断绝不允许被解读为「全部可赋值」（首次浏览器联调时全体实体被误判成 any，就是这个缺口）
2. **运行时**：vendored 的 Go js/wasm runtime（自 tsgo-wasm launcher 改造，Apache-2.0 注明出处）+ 自实现内存 fs shim；wasm 模块编译一次缓存，每次分析重新 instantiate（Go main 跑完即退出）；node 测试走同一分析核心 + 临时目录 CLI runner（`TscRunner` 注入 seam）
3. **typescript@5.9 保留但只作 parser**：export 扫描（名字、span、源码文本切片、全默认泛型判定）用 5.9 的 `createSourceFile` 语法层，不碰 checker；monaco 编辑器内嵌的也是 5.9 worker，只服务编辑体验

## 代价与后果 Consequences

- **47MB wasm 资产**（gzip 后仍 10MB 量级）进构建产物与首屏预算，分析首次可用时间受 wasm 下载编译制约；产物体积从 15MB 涨到 60MB 量级，接受（需求方指定引擎）
- 每次分析重新 instantiate + 全量 tsc run，单次延迟高于常驻 LanguageService 的增量查询；1.2s 防抖节奏下可接受
- **编辑器与引擎的版本口径分裂**：monaco 内嵌 TS 5.9 出编辑器诊断，语义引擎是 TS 7 —— 两者对同一段代码的判定可能有版本差，Footer 明示引擎为 TypeScript 7（tsgo-wasm），出现分歧时以引擎为准
- 类型文本失去 checker 打印能力，tooltip 的 `typeText` 取源码切片，alias 不展开 —— hover 展开推断结果的能力随之降级，接受
- 非官方构建依赖（sxzz 维护、随上游 nightly 滚动），版本 pin 住并在升级时重跑教学矩阵测试

已踩实的坑（都有代码注释与测试背书）：

- Go wasm 的 argv+env 打包区约 8KB，`pnpm run` 注入的 npm_* 环境变量会撑爆它 —— node runner 给子进程只传 `PATH`
- Go wasm 的 fs 回调必须 `queueMicrotask` 异步化：宿主帧内同步回调会重入 Go 调度器，运行时状态损坏后 panic 指向无关位置
- tsgo 诊断路径按 cwd 相对打印（浏览器下形如 `../../../app/main.ts`），解析按 basename 匹配

## 备选方案 Alternatives

- 维持 TS 5.9 checker 引擎 —— 否决：需求方点名 TypeScript 7 tsgo-wasm；且矩形范式下 checker 的能力优势已无处发挥
- tsgo LSP-in-worker（stdio 桥接） —— 否决：LSP 协议同样没有 assignability 查询，还要多养一条长连接协议栈；批式诊断探针更简单且天然无状态
- 等官方 TS 7 API/WASM —— 否决：时间不可控，诊断探针路线已把对 API 的依赖降为零
