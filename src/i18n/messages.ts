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
