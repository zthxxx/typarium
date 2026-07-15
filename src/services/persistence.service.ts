import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'

interface TypariumDb extends DBSchema {
  documents: {
    key: string
    value: {
      code: string
      languageId: string
      updatedAt: number
    }
  }
}

const DB_NAME = 'typarium'
const DB_VERSION = 1
const CURRENT_DOCUMENT_KEY = 'current'

/**
 * IndexedDB persistence for user input (ADR-0006): everything typed in
 * the editor survives a refresh. Saves are last-write-wins on a single
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

  async saveDocument(code: string, languageId: string): Promise<void> {
    try {
      const db = await this.db()
      await db.put(
        'documents',
        { code, languageId, updatedAt: Date.now() },
        CURRENT_DOCUMENT_KEY,
      )
    } catch {
      // Persistence is best-effort: private mode or quota errors must
      // never break the editing session itself.
    }
  }

  async loadDocument(): Promise<{ code: string; languageId: string } | null> {
    try {
      const db = await this.db()
      const record = await db.get('documents', CURRENT_DOCUMENT_KEY)
      return record
        ? { code: record.code, languageId: record.languageId }
        : null
    } catch {
      return null
    }
  }
}
