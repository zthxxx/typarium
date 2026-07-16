import { makeAutoObservable } from 'mobx'
import { dictionaries, formatMessage } from '#/i18n/messages.ts'
import type { Locale, MessageKey } from '#/i18n/messages.ts'

const LOCALE_STORAGE_KEY = 'typarium.locale'
const EDITOR_CONFIG_KEY = 'typarium.editorConfig'

/** Editor style knobs: formatter output AND completion suggestions. */
export interface EditorConfig {
  wordWrap: boolean
  singleQuote: boolean
  semi: boolean
  trailingComma: boolean
  printWidth: number
}

const DEFAULT_EDITOR_CONFIG: EditorConfig = {
  wordWrap: false,
  singleQuote: true,
  semi: false,
  trailingComma: true,
  printWidth: 52,
}

/**
 * User preferences. Locale is a personal setting: persisted in
 * localStorage and deliberately NOT part of share URLs (ADR-0006) —
 * a shared link must not force its author's language on the reader.
 */
export class SettingsService {
  locale: Locale
  editorConfig: EditorConfig

  constructor() {
    this.locale = detectInitialLocale()
    this.editorConfig = loadEditorConfig()
    makeAutoObservable(this)
  }

  updateEditorConfig(patch: Partial<EditorConfig>): void {
    this.editorConfig = { ...this.editorConfig, ...patch }
    try {
      localStorage.setItem(EDITOR_CONFIG_KEY, JSON.stringify(this.editorConfig))
    } catch {
      // Best-effort persistence only.
    }
  }

  setLocale(locale: Locale): void {
    this.locale = locale
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    } catch {
      // Storage may be unavailable (private mode); the choice still
      // applies for the session.
    }
  }

  /** Translate a message key with optional `{name}` interpolation. */
  t = (key: MessageKey, params?: Record<string, string>): string => {
    return formatMessage(dictionaries[this.locale][key], params)
  }
}

function detectInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'zh' || stored === 'en') return stored
  } catch {
    // fall through to browser detection
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

function loadEditorConfig(): EditorConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_EDITOR_CONFIG }
  try {
    const stored = localStorage.getItem(EDITOR_CONFIG_KEY)
    if (stored) {
      return { ...DEFAULT_EDITOR_CONFIG, ...(JSON.parse(stored) as object) }
    }
  } catch {
    // Corrupt storage falls back to defaults.
  }
  return { ...DEFAULT_EDITOR_CONFIG }
}
