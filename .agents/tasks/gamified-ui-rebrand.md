# gamified-ui-rebrand

目标：把 chrome 层重塑为 itch.io / 微信小游戏式的轻量游戏化 UI；补齐 favicon 与 Tab title；副标题与 Tab title 统一为「TypeScript 代数集合论可视化」。logo 图形不变，集合区域色彩系统（ADR-0009）不变，布局 IA 不变。

## 设计判读

- 现状读作 dev tool 的根因：满屏白底无色块、chip 过薄（py-0.5 / text-xs）像表单标签、无深度、字体中性、favicon 缺失（public 下是未拉取的 git-lfs pointer，且 head 无 icon link）
- 方向：卡通贴纸风 —— 粗 ink 描边面板 + 硬偏移阴影、糖果按压按钮（0 3px 0 深色底阴影 + active 下压）、keycap 式 preset chip、游戏垫点阵纸底、Baloo 2 圆润展示字体做 wordmark、JS 黄马克笔高亮副标题
- deploy.yml 已有 `lfs: true`，二进制 icon 走 LFS 可正常部署

## Tasks

- [x] 品牌资产：favicon.svg（logo 同构）+ 重新生成 favicon.ico / logo192 / logo512 / apple-touch-icon，更新 manifest.json
- [x] head：Tab title「typarium · TypeScript 代数集合论可视化」、icon links、theme-color、lang=zh-CN
- [x] i18n：zh 副标题「TypeScript 代数集合论可视化」，en 用英文等义句
- [x] 设计 token：paper 加蓝调 + 点阵纹理、sticker / keycap 阴影 token、toast 弹入动画（reduced-motion 降级）、Baloo 2 字体（chip-pop 关键帧未采用：与 keycap 按压 translate 冲突，按压物理已足够）
- [x] chrome 重塑：AppHeader / PresetsBar / CanvasPane / RectCanvas / EditorDrawer / AppFooter(微调) / BootSplash / toast
- [x] 视觉验证：默认态 / universe+never+any 态 / 窄屏 420px / EN locale / hover tooltip 均截图确认
- [x] 质量门禁：pnpm check && lint && typecheck && test ✓，e2e ✓
- [x] pnpm build 产物验证（预渲染 HTML 含 lang=zh-CN、新 title、icon links，icon 资产全部拷入 dist/client）
