# ADR 0024 —— 界面风格游戏化：采用 animal-island-ui

- 状态：已采纳（细化 [ADR-0009](./0009-色彩系统-semi-color-tag.md) 的 chrome 侧色彩，区域调色板不变）
- 日期：2026-07-28

## 背景 Context

typarium 的定位是「教学游乐场」，此前 chrome 已经在朝休闲游戏语言靠（卡通描边、糖果按钮、键帽 chip），但全部是手写样式：每个按钮 / 弹层 / 开关都是一次性 Tailwind 类堆叠，风格靠约定维持，没有组件库兜底。[animal-island-ui](https://github.com/guokaigdg/animal-island-ui)（动森风 React 组件库，v1.4.0）提供了一整套现成的游戏化设计语言：暖羊皮纸底、药丸圆角、3D 糖果按钮、有机气泡 Tooltip、缎带 Title、游戏手指光标

## 决策 Decision

chrome 全面切换到 animal-island-ui 的组件与设计语言，语义可视化层不动：

1. **组件替换**：图类型切换 → `Radio`（原生 `input[type=radio]`，保住 e2e 的 `role=radio` + `toBeChecked/Disabled` 契约）；分享 toast → `Notification`；配置开关 → `Switch`；配置输入 → `Input`；弹层面板 → `Card`；图标气泡提示 → `Tooltip`（island 变体）；启动进度条 → `Progress`；空画布提示 → `Typewriter`。所有按钮类控件用岛屿 token 手绘（见第 6 条），图标用常规 heroicons（见第 7 条）
2. **Token 对齐**：styles.css 的 chrome token 改写为岛屿调色板（brand=#19c8b9 青绿、ink=#794f27 棕、paper=#f8f8f0 羊皮纸、spark=#f5c31c 焦点黄、warn-any=#e05a5a），来源为库内 `--animal-*` token 表（v1.4.0 起实际暴露为 CSS 变量；AI_USAGE.md §0 的「不暴露」说法已过时）
3. **两种声音**：UI 文案用库的 Nunito / Noto Sans SC 圆体；一切「是代码」的文本（类型名、chip 标签、编辑器、tooltip 类型文本）保持 Maple Mono——`[class^='animal-']` 的字体 reset 在 cascade layer 之外、优先级高于 Tailwind utility，故以未分层的 `.code-voice` 规则夺回 mono
4. **手指光标只盖画布侧**：`Cursor` 用 `!important` 覆盖全部后代光标（scoped 模式也会覆盖 class 级光标），会毁掉 monaco 的 I-beam 与拖拽 col-resize——只包 `CanvasPane`，编辑器侧保留工具光标
5. **边界不变**：ADR-0009 的 12 色 `--set-hue-*` 区域调色板、diagram 包、`LanguageAdapter` 契约零改动；画板底色取暖白 `#fffdf5` 以保区域色相不偏
6. **小型 chrome 控件统一一套药丸配方，状态只变颜色**：库 `Button` 的 hover 抬升 / 变色翻转让密集折行的 chip 行看起来参差错落，库 `Select` 触发器（min-width 140px、粗描边）与并排控件失谐，库 `Button` small（32px）在 36-40px 的工具条里高度过大（用户反馈三次）。全部按钮类控件用岛屿 token 手绘，两档尺寸：标准 30px（预设 chip、头部语言切换、Share）、密集 26px（编辑器工具栏）；闲置 = 羊皮纸描边、激活 / 主操作 = 青绿填充（`any` 为 error 红）——沿用旧版「切换态只变颜色」的对齐原则；语言切换的下拉用 Popup + 同风格菜单
7. **工具图标用常规词汇（heroicons），不用岛屿 10 枚目录**：diy / design / variant 作为格式化 / 设置的隐喻不可识别（用户反馈）；工具动作必须一眼可读。heroicons 放进密集药丸内，气泡 `Tooltip` 保留——这是对库「不用第三方图标」守则的有意偏离
8. **区块标签保持安静文本**：`Title` 缎带（任何配色都是高饱和色带）作为行内小节标签太抢眼、与内容争夺注意力（用户反馈）——标签用棕灰小字 mono，「标签安静、内容出彩」的层级不动
9. **欧拉图矩形手绘扰动，内容哈希做种子**：矩形边框太笔直（用户反馈），每个矩形经 SVG `feTurbulence + feDisplacementMap` 轻微位移出手绘感。种子 = 等价类内容（labels）的 FNV-1a 哈希：纯函数，ADR-0012 的确定性成立——同一元素每次刷新扰动完全一致，内容相同的元素扰动相同；一个类的外框与其等价环（完全相同元素的内层边框线）放在**同一个**滤镜层里共享一片噪声场，叠层线条作为一体手绘嵌套摆动，不各自乱扭。标签在滤镜层外保持清晰。实现在 `diagram-euler` 包内（`wobble.ts` + 属性测试）

## 代价与后果 Consequences

- 依赖 + 体积：新增 animal-island-ui（自带 Nunito / Noto Sans SC woff2，按 unicode-range 分包、`font-display` 按需拉取，不阻塞可用；CSS 产物增大）。冷启动关键路径（引擎下载 / 首次分析，ADR-0020）不受影响
- e2e 契约依赖渲染结构：预设 chip 必须是真实 `<button>`（app.spec.ts 以 `locator('button')` 计数 any chip 与 badge）；`Radio` 依赖库渲染原生 `input[type=radio]`，库若改渲染结构属破坏性升级，升级时需重跑 e2e
- 保留 `@heroicons/react` 依赖：仅工具栏三处图标使用，为「常规可读」付出的小依赖成本
- 库的 Form 状态色、`Loading` 全屏场景、`Title` 缎带、内置 `Icon` 目录、`Select`、`Button` 等未使用；`Footer`（海浪 / 树林装饰带）占 80px 纵向空间，与满屏画布布局冲突，弃用

## 备选方案 Alternatives

- 只借调色板、继续手写组件 —— 否决：失去组件库的一致性与维护性，「游戏化」停留在配色
- `Tag` 作预设 chip（语义上更贴近）—— 否决：渲染为 `span[role=button]`，破坏 e2e 的 `<button>` 计数契约，且缺少激活态的糖果实心形态
- 库 `Button` 作预设 chip —— 实施后否决（用户反馈）：hover 抬升 / 变色翻转让密集 chip 行错落不齐，且库 primary 是奶油色、激活态区分度不足
- `Title` 缎带作区块标签 —— 实施后否决（用户反馈）：高饱和缎带作行内小标签太抢眼
- 岛屿内置 `Icon` 目录作工具图标 —— 实施后否决（用户反馈）：游戏隐喻不具备常规共识可读性
- 库 `Select` 作语言切换 —— 实施后否决（用户反馈）：触发器尺寸 / 描边不可定制（无 className/style），与同排 Share 及 chip 药丸家族失谐；改为 token 手绘 pill + Popup 下拉
- `Cursor` 包整个应用（forceAll 或 scoped）—— 否决：两种模式都会覆盖 monaco / 拖拽的功能光标，编辑体验受损
- 自绘动森风格贴图 —— 否决：工程量与一致性都不如直接采用现成体系
