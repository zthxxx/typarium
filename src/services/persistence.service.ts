import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

export interface StoredDocument {
  code: string
  languageId: string
  /** Toggled virtual preset labels (revision 2 of the schema). */
  presets?: Array<string>
  updatedAt: number
}

interface TypariumDb extends DBSchema {
  documents: {
    key: string
    value: StoredDocument
  }
}

const DB_NAME = 'typarium'
const DB_VERSION = 1
const CURRENT_DOCUMENT_KEY = 'current'

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
        db.createObjectStore('documents')
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
}
