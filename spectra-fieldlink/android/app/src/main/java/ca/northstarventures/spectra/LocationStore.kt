package ca.northstarventures.spectra

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import java.util.UUID

data class PendingFix(
    val id: String,
    val team: String,
    val member: String,
    val lat: Double,
    val lon: Double,
    val accuracy: Float,
    val capturedAt: Long
)

/**
 * Durable device-local outbox. Rows are deleted ONLY after the server acknowledges
 * the same id; any gap in connectivity leaves the fix queued for a later retry.
 * Does not discard old rows silently to satisfy a fixed cache limit.
 */
class LocationStore(context: Context) : SQLiteOpenHelper(
    context.applicationContext, "spectra_location_outbox.db", null, 1
) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE pending_fixes (
                id TEXT PRIMARY KEY,
                team TEXT NOT NULL,
                member TEXT NOT NULL,
                lat REAL NOT NULL,
                lon REAL NOT NULL,
                accuracy REAL NOT NULL,
                captured_at INTEGER NOT NULL
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX idx_pending_fixes_time ON pending_fixes(captured_at)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

    @Synchronized fun add(team: String, member: String, lat: Double, lon: Double,
                          accuracy: Float, created: Long): String {
        val id = UUID.randomUUID().toString()
        val row = ContentValues().apply {
            put("id", id)
            put("team", team)
            put("member", member)
            put("lat", lat)
            put("lon", lon)
            put("accuracy", accuracy)
            put("captured_at", created)
        }
        writableDatabase.insertOrThrow("pending_fixes", null, row)
        return id
    }

    @Synchronized fun nextBatch(limit: Int = 80): List<PendingFix> {
        val results = ArrayList<PendingFix>()
        readableDatabase.query("pending_fixes",
            arrayOf("id", "team", "member", "lat", "lon", "accuracy", "captured_at"),
            null, null, null, null, "captured_at ASC", limit.toString()).use { c ->
            while (c.moveToNext()) {
                results.add(PendingFix(
                    c.getString(0), c.getString(1), c.getString(2),
                    c.getDouble(3), c.getDouble(4), c.getFloat(5), c.getLong(6)
                ))
            }
        }
        return results
    }


    @Synchronized fun nextBatchFor(team: String, member: String, limit: Int = 80): List<PendingFix> {
        val result = ArrayList<PendingFix>()
        readableDatabase.query("pending_fixes",
            arrayOf("id", "team", "member", "lat", "lon", "accuracy", "captured_at"),
            "team=? AND member=?", arrayOf(team, member), null, null,
            "captured_at ASC", limit.coerceIn(1, 80).toString()
        ).use { c ->
            while (c.moveToNext()) result.add(PendingFix(
                c.getString(0), c.getString(1), c.getString(2), c.getDouble(3),
                c.getDouble(4), c.getFloat(5), c.getLong(6)
            ))
        }
        return result
    }

    @Synchronized fun acknowledgeBatch(ids: List<String>) {
        if (ids.isEmpty()) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            val placeholders = List(ids.size) { "?" }.joinToString(",")
            db.delete("pending_fixes", "id IN (" + placeholders + ")", ids.toTypedArray())
            db.setTransactionSuccessful()
        } finally { db.endTransaction() }
    }


    @Synchronized fun acknowledge(id: String) {
        writableDatabase.delete("pending_fixes", "id=?", arrayOf(id))
    }

    @Synchronized fun count(): Long =
        android.database.DatabaseUtils.longForQuery(readableDatabase,
            "SELECT COUNT(*) FROM pending_fixes", null)
}
