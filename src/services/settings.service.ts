import { makeAutoObservable } from 'mobx'
import { dictionaries, formatMessage } from '#/i18n/messages.ts'
import type { Locale, MessageKey } from '#/i18n/messages.ts'

const LOCALE_STORAGE_KEY = 'typarium.locale'

/**
 * User preferences. Locale is a personal setting: persisted in
 * localStorage and deliberately NOT part of share URLs (ADR-0006) —
 * a shared link must not force its author's language on the reader.
 */
export class SettingsService {
  locale: Locale

  constructor() {
    this.locale = detectInitialLocale()
    makeAutoObservable(this)
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
