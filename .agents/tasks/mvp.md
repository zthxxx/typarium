# typarium MVP —— 任务清单

> 期 1 范围：原始类型(含 any) + 结构体类型 + 函数类型 + union/intersection 的 Euler 可视化，
> 支撑「协变/逆变/双向协变、Tagged Union」教学演示

- [x] 脚手架：TanStack Start + React 19 + Vite 8 + Tailwind 4，git init，GitHub 私有仓库关联
- [x] docs/ 全套：原始诉求 / 产品功能定义 / 工程架构设计 / 工程规范定义 / 功能技术设计 / adr
- [x] 工程基建：TS pin 5.9.x、git hooks(lint-staged + commitlint)、vitest、playwright e2e、CI、CNAME、SSG 静态导出验证
- [x] core 领域层：集合语义 IR、关系分类、TS 宇宙基底域模型、动态原子分解（纯函数、单测）
- [x] TS 分析引擎 worker：@typescript/vfs + LanguageService、export 提取、assignability 矩阵、判空、any/error 检测（单测）
- [x] services 层：power-di + mobx（Analysis/SetModel/Layout/Editor/Persistence/Share/Settings/Preset）
- [x] views 层：布局(header/editor/canvas/footer)、monaco 接入(诊断高亮 + 1.2s 防抖提交)、预设按钮、i18n
- [x] Euler 渲染：固定底图 + bubblesets 轮廓、never 点阵(∅ pattern)、集合花纹/呼吸描边、any 可拖拽悬浮 badge、hover 类型提示
- [x] 持久化与分享：IndexedDB 自动保存恢复、URL hash 分享(可选带内容)
- [x] E2E + 浏览器截图验证循环（教学演示用例全过一遍：协变/逆变/双向协变/Tagged Union）
- [x] GitHub Pages 部署 workflow(手动触发；私有仓库当前套餐不支持 Pages，转 public 后改回 push 触发) + CNAME(typarium.zthxxx.me) + 最终验收截图
