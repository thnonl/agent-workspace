package io.github.thnonl.agentworkspace

import android.content.SharedPreferences
import android.net.Uri

/** A computer running Agent Workspace: where it listens. */
data class Server(val host: String, val port: Int) {

    val label: String get() = "$urlHost:$port"

    private val urlHost: String get() = if (host.contains(':')) "[$host]" else host

    /** The office page. */
    fun pageUrl(): String = "http://$urlHost:$port/"

    fun isSameHost(uri: Uri): Boolean =
        uri.host.equals(host, ignoreCase = true) && (uri.port == port || (uri.port == -1 && port == 80))

    fun save(prefs: SharedPreferences) {
        prefs.edit().putString(KEY_HOST, host).putInt(KEY_PORT, port).apply()
    }

    companion object {
        const val DEFAULT_PORT = 4173
        private const val KEY_HOST = "host"
        private const val KEY_PORT = "port"

        fun load(prefs: SharedPreferences): Server? {
            val host = prefs.getString(KEY_HOST, null) ?: return null
            return of(host, prefs.getInt(KEY_PORT, DEFAULT_PORT).toString())
        }

        /** From the manual form; null when the host is empty or the port is not a port. */
        fun of(host: String, port: String): Server? {
            val h = host.trim().removePrefix("http://").removeSuffix("/").removePrefix("[").removeSuffix("]")
            val p = port.trim().ifEmpty { DEFAULT_PORT.toString() }.toIntOrNull() ?: return null
            if (h.isEmpty() || p !in 1..65535) return null
            return Server(h, p)
        }

        /**
         * From a scanned QR code or an opened link: the server's `http://<ip>:<port>/m` (what the QR code holds) or
         * `agentworkspace://connect?h=<ip>&p=<port>` (what its /m page hands to the app). A code of an older version
         * still carries a token (`t=`): it is ignored.
         */
        fun parse(text: String?): Server? {
            if (text.isNullOrBlank()) return null
            val uri = runCatching { Uri.parse(text.trim()) }.getOrNull() ?: return null
            return when (uri.scheme?.lowercase()) {
                "agentworkspace" -> of(uri.getQueryParameter("h") ?: "", uri.getQueryParameter("p") ?: "")
                // (only the connect page: any other web address in a QR code is not an Agent Workspace code)
                "http" -> if (uri.path?.trimEnd('/') == "/m") of(uri.host ?: "", (if (uri.port == -1) 80 else uri.port).toString()) else null
                else -> null
            }
        }
    }
}
