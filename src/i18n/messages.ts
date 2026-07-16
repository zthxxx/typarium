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
  'header.shareWithContent': 'Share with content',
  'header.shareCopied': 'Share link copied to clipboard',
  'presets.title': 'Presets',
  'presets.snippets': 'Snippets',
  'canvas.neverLegend': '∅ never = the empty set, inside every set',
  'canvas.neverRow': '∅ never',
  'canvas.emptyHint': 'Pick a type below or export one in the editor',
  'anyBadge.label': 'any',
  'anyBadge.tooltip':
    'any is outside set theory: it is treated as assignable both ways, breaking subset reasoning',
  'editor.title': 'Editor',
  'editor.collapse': 'Collapse editor',
  'editor.expand': 'Open editor',
  'editor.resize': 'Drag to resize editor',
  'editor.loading': 'Loading editor…',
  'footer.engine': 'Type analysis engine: {version}',
} as const

export type MessageKey = keyof typeof en

const zh: Record<MessageKey, string> = {
  'app.tagline': 'TypeScript 代数集合论可视化',
  'header.language': '语言',
  'header.share': '分享',
  'header.shareWithContent': '携带当前内容分享',
  'header.shareCopied': '分享链接已复制到剪贴板',
  'presets.title': '预设类型',
  'presets.snippets': '代码模板',
  'canvas.neverLegend': '∅ never = 空集，存在于任何集合之中',
  'canvas.neverRow': '∅ never',
  'canvas.emptyHint': '点下方类型，或在编辑器里 export 一个类型',
  'anyBadge.label': 'any',
  'anyBadge.tooltip': 'any 不属于集合范畴：它被视为双向可赋值，破坏子集推理',
  'editor.title': '编辑器',
  'editor.collapse': '收起编辑器',
  'editor.expand': '打开编辑器',
  'editor.resize': '拖拽调整编辑器宽度',
  'editor.loading': '编辑器加载中…',
  'footer.engine': '类型分析引擎：{version}',
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
