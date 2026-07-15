/**
 * Two-locale dictionary, deliberately framework-free (ADR-0008).
 * Keys are structural: every locale must provide every key — enforced
 * by the `Messages` type derived from the `en` dictionary.
 */

export type Locale = 'zh' | 'en'

const en = {
  'app.tagline': 'TypeScript types, drawn as sets',
  'header.language': 'Language',
  'header.share': 'Share',
  'header.shareWithContent': 'Share with content',
  'header.shareCopied': 'Share link copied to clipboard',
  'presets.title': 'Presets',
  'canvas.universeLabel': 'unknown — the universe',
  'canvas.neverLegend': '∅ never — the empty set, inside every set',
  'canvas.unknownOverlapHint':
    'TypeScript cannot decide whether this intersection is empty',
  'canvas.emptyHint': 'Export a type on the right to see it drawn as a set',
  'canvas.truncated': 'Too many exported types; showing the first ones only',
  'anyBadge.label': 'any',
  'anyBadge.tooltip':
    'any is outside set theory: it is treated as assignable both ways, breaking subset reasoning. Entities resolved to any: {names}',
  'deviation.void':
    'void is not a value set: it behaves like undefined plus a special rule for function return positions',
  'deviation.method-bivariance':
    'Method parameters stay bivariant even under strictFunctionTypes — a deliberate unsoundness',
  'deviation.enum-nominal':
    'Enums are nominal: structurally equal enums are still distinct sets',
  'editor.loading': 'Loading editor…',
  'footer.engine': 'Type analysis engine: {version} (JS compiler API)',
  'error.analysis': 'Analysis failed; the last valid diagram is shown',
} as const

export type MessageKey = keyof typeof en

const zh: Record<MessageKey, string> = {
  'app.tagline': '把 TypeScript 类型画成集合',
  'header.language': '语言',
  'header.share': '分享',
  'header.shareWithContent': '携带当前内容分享',
  'header.shareCopied': '分享链接已复制到剪贴板',
  'presets.title': '预设类型',
  'canvas.universeLabel': 'unknown —— 全集',
  'canvas.neverLegend': '∅ never —— 空集，存在于任何集合之中',
  'canvas.unknownOverlapHint': 'TypeScript 无法判定这个交集是否为空',
  'canvas.emptyHint': '在右侧 export 一个类型，这里就会画出它的集合',
  'canvas.truncated': '导出类型过多，仅展示前若干个',
  'anyBadge.label': 'any',
  'anyBadge.tooltip':
    'any 不属于集合范畴：它被视为双向可赋值，破坏子集推理。解析为 any 的导出：{names}',
  'deviation.void':
    'void 不是一个值集合：它近似 undefined，外加函数返回位置的特殊规则',
  'deviation.method-bivariance':
    '方法参数在 strictFunctionTypes 下仍是双向协变 —— TypeScript 有意保留的不健全',
  'deviation.enum-nominal': 'enum 是名义类型：结构相同的两个 enum 仍是不同集合',
  'editor.loading': '编辑器加载中…',
  'footer.engine': '类型分析引擎：{version}（JS compiler API）',
  'error.analysis': '分析失败，画布保留上一次有效结果',
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
