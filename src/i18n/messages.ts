/**
 * Two-locale dictionary, deliberately framework-free (ADR-0008).
 * Keys are structural: every locale must provide every key — enforced
 * by the `Messages` type derived from the `en` dictionary.
 */

export type Locale = 'zh' | 'en'

const en = {
  'app.tagline': 'TypeScript algebraic set theory, visualized',
  'header.language': 'Language',
  'header.share': 'Share',
  'header.shareCopied': 'Share link copied to clipboard',
  'presets.title': 'Presets',
  'presets.snippets': 'Snippets',
  'mode.title': 'Diagram',
  'mode.infoAria': 'About diagram types',
  'mode.eulerUnavailable':
    'This containment structure cannot be drawn faithfully as nested rectangles',
  'mode.info.euler':
    'nested rectangles: a set drawn INSIDE another IS its subset. Some containment graphs cannot be nested faithfully (e.g. one set inside three separate parents) — the canvas then switches to Hasse automatically.',
  'mode.info.hasse':
    'a layered order diagram: supersets sit above their subsets and every containment edge is drawn. It can represent ANY containment structure, trading away the direct inside-means-subset reading.',
  'mode.info.example':
    'The same input both ways: C1 contains C2 and C3; C2 and C3 are disjoint',
  'canvas.neverLegend': '∅ {name} = the empty set, inside every set',
  'canvas.neverRow': '∅ {name}',
  'canvas.emptyHint': 'Pick a type below or export one in the editor',
  'canvas.otherTypes': 'more set members live here',
  'anyBadge.tooltip':
    '{name} is outside set theory: it is treated as assignable both ways, breaking subset reasoning',
  'editor.title': 'Editor',
  'editor.format': 'Format code',
  'editor.settings': 'Editor settings',
  'config.wordWrap': 'Word wrap',
  'config.quotes': 'Quotes',
  'config.quotes.single': 'Single',
  'config.quotes.double': 'Double',
  'config.semi': 'Semicolons',
  'config.trailingComma': 'Trailing commas',
  'config.printWidth': 'Wrap column',
  'editor.collapse': 'Collapse editor',
  'editor.expand': 'Open editor',
  'editor.resize': 'Drag to resize editor',
  'editor.loading': 'Loading editor…',
  'footer.engine': 'Type analysis engine: {version}',
  'footer.computing': 'Computing…',
  'footer.analyzing': 'Analyzing set relations…',
} as const

export type MessageKey = keyof typeof en

const zh: Record<MessageKey, string> = {
  'app.tagline': 'TypeScript 代数集合论可视化',
  'header.language': '语言',
  'header.share': '分享',
  'header.shareCopied': '分享链接已复制到剪贴板',
  'presets.title': '预设类型',
  'presets.snippets': '代码模板',
  'mode.title': '图类型',
  'mode.infoAria': '图类型说明',
  'mode.eulerUnavailable': '当前包含结构无法用嵌套矩形如实绘制',
  'mode.info.euler':
    '嵌套矩形：画在另一个集合内部的集合就是它的子集。部分包含结构无法如实嵌套（例如一个集合同时属于三个互不包含的父集合），此时画布会自动切换到 Hasse 图。',
  'mode.info.hasse':
    '分层的序图：父集合画在子集合上方，每一条包含关系都画成连线。它能表达任意包含结构，代价是失去「在内部即子集」的直观读法。',
  'mode.info.example':
    '同一份输入的两种画法：C1 包含 C2 与 C3，C2 与 C3 无交集',
  'canvas.neverLegend': '∅ {name} = 空集，存在于任何集合之中',
  'canvas.neverRow': '∅ {name}',
  'canvas.emptyHint': '点下方类型，或在编辑器里 export 一个类型',
  'canvas.otherTypes': '还有其他集合元素',
  'anyBadge.tooltip': '{name} 不属于集合范畴：它被视为双向可赋值，破坏子集推理',
  'editor.title': '编辑器',
  'editor.format': '代码格式化',
  'editor.settings': '编辑器配置',
  'config.wordWrap': '自动换行',
  'config.quotes': '引号风格',
  'config.quotes.single': '单引号',
  'config.quotes.double': '双引号',
  'config.semi': '分号结尾',
  'config.trailingComma': '多行尾逗号',
  'config.printWidth': '换行列宽',
  'editor.collapse': '收起编辑器',
  'editor.expand': '打开编辑器',
  'editor.resize': '拖拽调整编辑器宽度',
  'editor.loading': '编辑器加载中…',
  'footer.engine': '类型分析引擎：{version}',
  'footer.computing': '计算中…',
  'footer.analyzing': '计算集合关系中…',
}

export const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  en,
  zh,
}

/** `{name}` placeholder interpolation, the only templating we need. */
export function formatMessage(
  template: string,
  params?: Record<string, string>,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? params[key] : match,
  )
}
