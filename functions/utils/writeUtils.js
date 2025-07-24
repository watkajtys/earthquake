// functions/utils/writeUtils.js

/**
 * Inserts a new note into the D1 database.
 *
 * @param {object} db - The Cloudflare D1 database binding.
 * @param {string} note - The note to be inserted.
 * @returns {Promise<object>} A promise that resolves to an object indicating success or failure.
 */
export async function writeNoteToD1(db, note) {
  if (!db) {
    console.error('[writeUtils-writeNoteToD1] D1 Database (DB) binding not provided.');
    return { success: false, error: 'Database binding not available.' };
  }
  if (!note || typeof note !== 'string' || note.trim().length === 0) {
    return { success: false, error: 'Invalid note provided.' };
  }

  const timestamp = Date.now();

  try {
    const stmt = db.prepare('INSERT INTO notes (timestamp, note) VALUES (?, ?)');
    await stmt.bind(timestamp, note).run();
    return { success: true };
  } catch (error) {
    console.error(`[writeUtils-writeNoteToD1] Error inserting note into D1: ${error.message}`, error);
    return { success: false, error: 'Failed to insert note into database.' };
  }
}
