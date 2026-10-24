import { db, PaisaTrackDatabase } from './database'
import { seedInitialData } from './seed'

/**
 * Initializes the PaisaTrack database.
 * Opens the IndexedDB connection and performs one-time seeding if the database is newly created.
 *
 * Critical rule: Does NOT reset or delete the database on error.
 * Re-running this function on an already initialized database is safe and idempotent.
 */
export async function initializeDatabase(
  database: PaisaTrackDatabase = db
): Promise<PaisaTrackDatabase> {
  try {
    if (!database.isOpen()) {
      await database.open()
    }
    await seedInitialData(database)
    return database
  } catch (error) {
    // Preserve data integrity: Never silently reset or purge existing database tables.
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to initialize PaisaTrack database: ${message}`)
  }
}
