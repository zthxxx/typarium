# ADR-0006 持久化 IndexedDB 与分享编码

- 状态：已采纳
- 日期：2026-07-16

## 背景 Context

需求：所有用户输入本地保存、刷新恢复；分享链接可选携带内容；需求方明确指定存储用 IndexedDB（否决 localStorage 一类的简单 KV 存储）

## 决策 Decision

1. **IndexedDB** 存用户数据：db `typarium`，store `workspace`（代码、更新时间）与 `settings`（locale、any badge 位置）。用 [idb](https://www.npmjs.com/package/idb) 做 Promise 薄封装，不引入更重的 ORM 式抽象
2. 写入时机：编辑停顿 500ms 防抖 + 页面转入后台时补写；启动恢复顺序 URL hash > workspace 存档 > 默认示例
3. **分享编码**：`#v1/<payload>`，payload = lz-string `compressToEncodedURIComponent(JSON.stringify({ code, lang }))` —— 输出字符集是 URL-safe 的 Base64 变体，满足「带 Base64 哈希 Tag」的需求形态，且压缩率对代码文本远好于裸 Base64（TS Playground 同款方案，[Playground 手册](https://www.typescriptlang.org/_playground-handbook/url-structure.html)）
4. hash 前缀带 schema 版本号（`v1`），将来结构变更加 `v2` 并保留旧版解码
5. locale 等个人偏好不进分享链接

## 代价与后果 Consequences

- IndexedDB 的异步 API 比 localStorage 复杂，启动恢复要处理「首帧渲染早于存档读取」的时序（骨架屏期间完成读取）
- lz-string 输出对人不可读（本来也不需要），且格式绑定 lz-string 实现 —— 版本号前缀保留了将来换编码的出路
- vfs 的 lib.d.ts 缓存仍走 localStorage（@typescript/vfs 内建行为），与「用户数据在 IndexedDB」不冲突：那是依赖库的实现细节缓存，非用户数据

## 备选方案 Alternatives

- localStorage：需求方明确否决；同步 API 阻塞主线程、容量上限也更紧
- 裸 Base64（`btoa`）：无压缩，稍长的代码就把 URL 顶到数千字符，否决
- 服务端短链：本项目无服务端（GitHub Pages 静态），否决
