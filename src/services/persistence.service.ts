import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type { AnalysisResult } from '#/core/set-model/types.ts'

export interface StoredDocument {
  code: string
  languageId: string
  /** Toggled virtual preset labels (revision 2 of the schema). */
  presets?: Array<string>
  updatedAt: number
}

/**
 * Cache-first render payload (ADR-0020): the last good analysis keyed
 * by EXACTLY the input that produced it plus the engine identity. A
 * hit paints the canvas before the engine finishes booting; any key
 * mismatch (edited code, different presets, upgraded engine) ignores
 * the snapshot — the canvas never shows a result that was not true
 * for the restored input.
 */
export interface AnalysisSnapshot {
  engineLabel: string
  code: string
  /** Virtual preset names that joined the analysis. */
  presets: Array<string>
  result: AnalysisResult
}

interface TypariumDb extends DBSchema {
  documents: {
    key: string
    value: StoredDocument
  }
  snapshots: {
    key: string
    value: AnalysisSnapshot
  }
}

const DB_NAME = 'typarium'
const DB_VERSION = 2
const CURRENT_DOCUMENT_KEY = 'current'
const CURRENT_SNAPSHOT_KEY = 'current'

/**
 * IndexedDB persistence for user input (ADR-0006): everything typed or
 * toggled survives a refresh. Saves are last-write-wins on a single
 * document record — good enough for a single-tab local tool; multi-tab
 * conflicts resolve to the most recent edit.
 */
export class PersistenceService {
  private dbPromise: Promise<IDBPDatabase<TypariumDb>> | null = null

  private db(): Promise<IDBPDatabase<TypariumDb>> {
    this.dbPromise ??= openDB<TypariumDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          db.createObjectStore('documents')
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots')
        }
      },
    })
    return this.dbPromise
  }

  async saveDocument(
    document: Omit<StoredDocument, 'updatedAt'>,
  ): Promise<void> {
    try {
      const db = await this.db()
      await db.put(
        'documents',
        { ...document, updatedAt: Date.now() },
        CURRENT_DOCUMENT_KEY,
      )
    } catch {
      // Persistence is best-effort: private mode or quota errors must
      // never break the editing session itself.
    }
  }

  async loadDocument(): Promise<StoredDocument | null> {
    try {
      const db = await this.db()
      return (await db.get('documents', CURRENT_DOCUMENT_KEY)) ?? null
    } catch {
      return null
    }
  }

  async saveSnapshot(snapshot: AnalysisSnapshot): Promise<void> {
    try {
      const db = await this.db()
      await db.put('snapshots', snapshot, CURRENT_SNAPSHOT_KEY)
    } catch {
      // Best-effort, same as documents.
    }
  }

  async loadSnapshot(): Promise<AnalysisSnapshot | null> {
    try {
      const db = await this.db()
      return (await db.get('snapshots', CURRENT_SNAPSHOT_KEY)) ?? null
    } catch {
      return null
    }
  }
}
