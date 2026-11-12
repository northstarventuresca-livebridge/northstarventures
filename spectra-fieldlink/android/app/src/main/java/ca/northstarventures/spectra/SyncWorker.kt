package ca.northstarventures.spectra

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/**
 * WorkManager is only for eventual upload retry, NOT a replacement for real-time GPS
 * collection. Android may defer scheduled jobs under battery/network constraints.
 */
class SyncWorker(appContext: Context, params: WorkerParameters) : Worker(appContext, params) {
    override fun doWork(): Result {
        SyncEngine.perform(applicationContext)
        return Result.success() // unsent rows remain queued if upload fails
    }

    companion object {
        fun schedule(context: Context) {
            val task = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "spectra-fieldlink-background-upload",
                ExistingPeriodicWorkPolicy.KEEP, task
            )
        }
    }
}
