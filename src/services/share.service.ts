import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from 'lz-string'

/**
 * Share-URL codec (ADR-0006). Format: `#code/v1/<payload>` where payload
 * is lz-string's URI-safe Base64 variant of the JSON envelope. The
 * version segment lets future envelope changes decode old links.
 */
const HASH_PREFIX = '#code/v1/'

interface ShareEnvelope {
  languageId: string
  code: string
}

export class ShareService {
  encodeToHash(envelope: ShareEnvelope): string {
    return HASH_PREFIX + compressToEncodedURIComponent(JSON.stringify(envelope))
  }

  decodeFromHash(hash: string): ShareEnvelope | null {
    if (!hash.startsWith(HASH_PREFIX)) return null
    try {
      const json = decompressFromEncodedURIComponent(
        hash.slice(HASH_PREFIX.length),
      )
      const parsed: unknown = JSON.parse(json)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'code' in parsed &&
        typeof (parsed as ShareEnvelope).code === 'string'
      ) {
        return parsed as ShareEnvelope
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Copies a share link to the clipboard.
   * `withContent` embeds the current code; otherwise the bare page URL
   * is shared and the reader starts from the default sample.
   */
  async copyShareUrl(options: {
    withContent: boolean
    languageId: string
    code: string
  }): Promise<string> {
    const base = `${location.origin}${location.pathname}`
    const url = options.withContent
      ? base +
        this.encodeToHash({
          languageId: options.languageId,
          code: options.code,
        })
      : base
    await navigator.clipboard.writeText(url)
    return url
  }

  readHashFromLocation(): ShareEnvelope | null {
    if (typeof window === 'undefined') return null
    return this.decodeFromHash(window.location.hash)
  }
}
