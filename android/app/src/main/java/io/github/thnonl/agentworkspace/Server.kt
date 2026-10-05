package io.github.thnonl.agentworkspace

import android.content.SharedPreferences
import android.net.Uri
import java.net.URLEncoder

/**
 * A computer running Agent Workspace: where it listens. `token` only comes from the QR code or link of a computer that runs
 * a version up to 1.3.8 (those still ask other machines for one); a newer one ignores it.
 */
data class Server(val host: String, val port: Int, val token: String = "") {

    val label: String get() = "$urlHost:$port"

    private val urlHost: String get() = if (host.contains(':')) "[$host]" else host

    /** The office page (an older computer turns a token into a cookie and drops it from the URL; a newer one just drops it). */
    fun pageUrl(): String {
        val base = "http://$urlHost:$port/"
        return if (token.isEmpty()) base else base + "?token=" + URLEncoder.encode(token, "UTF-8")
    }

    fun isSameHost(uri: Uri): Boolean =
        uri.host.equals(host, ignoreCase = true) && (uri.port == port || (uri.port == -1 && port == 80))

    fun save(prefs: SharedPreferences) {
        prefs.edit().putString(KEY_HOST, host).putInt(KEY_PORT, port).putString(KEY_TOKEN, token).apply()
    }

    companion object {
        const val DEFAULT_PORT = 4173
        private const val KEY_HOST = "host"
        private const val KEY_PORT = "port"
        private const val KEY_TOKEN = "token"

        fun load(prefs: SharedPreferences): Server? {
            val host = prefs.getString(KEY_HOST, null) ?: return null
            return of(host, prefs.getInt(KEY_PORT, DEFAULT_PORT).toString(), prefs.getString(KEY_TOKEN, "") ?: "")
        }

        /** From the manual form (no token) or a code; null when the host is empty or the port is not a port. */
        fun of(host: String, port: String, token: String = ""): Server? {
            val h = host.trim().removePrefix("http://").removeSuffix("/").removePrefix("[").removeSuffix("]")
            val p = port.trim().ifEmpty { DEFAULT_PORT.toString() }.toIntOrNull() ?: return null
            if (h.isEmpty() || p !in 1..65535) return null
            return Server(h, p, token.trim())
        }

        /**
         * From a scanned QR code or an opened link: the server's `http://<ip>:<port>/m` (what the QR code holds) or
         * `agentworkspace://connect?h=<ip>&p=<port>` (what its /m page hands to the app). A code of an older computer also
         * carries its token (`t=`), which goes along.
         */
        fun parse(text: String?): Server? {
            if (text.isNullOrBlank()) return null
            val uri = runCatching { Uri.parse(text.trim()) }.getOrNull() ?: return null
            val token = uri.getQueryParameter("t") ?: uri.getQueryParameter("token") ?: ""
            return when (uri.scheme?.lowercase()) {
                "agentworkspace" -> of(uri.getQueryParameter("h") ?: "", uri.getQueryParameter("p") ?: "", token)
                // (only the connect page: any other web address in a QR code is not an Agent Workspace code)
                "http" -> if (uri.path?.trimEnd('/') == "/m") of(uri.host ?: "", (if (uri.port == -1) 80 else uri.port).toString(), token) else null
                else -> null
            }
        }
    }
}
