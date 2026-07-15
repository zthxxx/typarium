# ADR-0001 项目命名 typarium

- 状态：已采纳
- 日期：2026-07-16

## 背景 Context

项目需要一个简短、清新可爱、有游戏感的名字：体现代数数据类型或集合论、与 TypeScript 有关，且不能直白到失去趣味（如 `ts-set-visualizer` 一类）。名字同时决定仓库名与子域名

## 决策 Decision

命名 **typarium**：`ty-`（type / TypeScript）+ `-arium`（planetarium / terrarium / aquarium 的容器后缀）——「一个装着类型宇宙的小生态缸」。容器隐喻直接对应产品的核心画面：`unknown` 全集是缸壁，所有类型集合生活在里面

域名 `typarium.zthxxx.me`，仓库 `zthxxx/typarium`

## 代价与后果 Consequences

- 8 个字母，比理想的极短名（≤5）略长，但仍在一词可读的范围
- 不含 set/venn 字样，集合论语义要靠产品自己传达 —— 这正是「不直白」要求的代价

## 备选方案 Alternatives

- `typeset`：type + set 双关且是真词，但排版含义太强、更像工具名，游戏感弱，否决
- `tset` / `tsets`：极短但易被读成 test 的笔误，否决
- `typia` / `typetale` / `typegarten`：typia 与现有 TS 校验库重名硬冲突；后两者只有游戏感、丢了集合语义，否决
- `unio`（拉丁语「联合」，也是河蚌属名）：可爱但与 TS 无关联，否决
