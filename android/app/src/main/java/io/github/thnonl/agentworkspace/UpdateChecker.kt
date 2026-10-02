package io.github.thnonl.agentworkspace

import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

/**
 * Asks GitHub for the latest release while the app is open (at start and then at most once an hour) and offers its APK
 * when it is newer than this app. The dialog shows once per run; "Download" opens the APK link in the browser.
 */
class UpdateChecker(private val activity: Activity) {

    private var lastCheck = 0L
    private var offered = false

    fun check() {
        val now = SystemClock.elapsedRealtime()
        if (offered || (lastCheck != 0L && now - lastCheck < CHECK_EVERY_MS)) return
        lastCheck = now
        thread(name = "update-check", isDaemon = true) {
            val release = runCatching { latest() }.getOrNull() ?: return@thread
            if (!isNewer(release.version, BuildConfig.VERSION_NAME)) return@thread
            activity.runOnUiThread { offer(release) }
        }
    }

    private fun offer(release: Release) {
        if (offered || activity.isFinishing || activity.isDestroyed) return
        offered = true
        AlertDialog.Builder(activity)
            .setTitle(R.string.update_title)
            .setMessage(activity.getString(R.string.update_message, release.version, BuildConfig.VERSION_NAME))
            .setPositiveButton(R.string.update_download) { _, _ ->
                try {
                    activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(release.apkUrl)))
                } catch (_: ActivityNotFoundException) {
                    /* no browser */
                }
            }
            .setNegativeButton(R.string.update_later, null)
            .show()
    }

    private data class Release(val version: String, val apkUrl: String)

    /** The latest (non-pre-)release and its .apk asset; null when it has none (the APK is still being built). */
    private fun latest(): Release? {
        val conn = URL("https://api.github.com/repos/${BuildConfig.REPO}/releases/latest").openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "AgentWorkspaceApp/${BuildConfig.VERSION_NAME}")
            if (conn.responseCode != 200) return null
            val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
            val assets = json.optJSONArray("assets") ?: return null
            for (i in 0 until assets.length()) {
                val asset = assets.getJSONObject(i)
                if (asset.optString("name").endsWith(".apk")) {
                    return Release(json.optString("tag_name").removePrefix("v"), asset.getString("browser_download_url"))
                }
            }
            return null
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        private const val CHECK_EVERY_MS = 3_600_000L

        /** "1.10.0" > "1.9.3"; a pre-release suffix ("-beta.1") is ignored. */
        fun isNewer(candidate: String, current: String): Boolean {
            fun parts(v: String) = v.removePrefix("v").substringBefore('-').split('.').map { it.toIntOrNull() ?: 0 }
            val a = parts(candidate)
            val b = parts(current)
            for (i in 0 until maxOf(a.size, b.size)) {
                val x = a.getOrElse(i) { 0 }
                val y = b.getOrElse(i) { 0 }
                if (x != y) return x > y
            }
            return false
        }
    }
}
