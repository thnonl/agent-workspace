package io.github.thnonl.agentworkspace

import android.content.SharedPreferences
import android.net.Uri
import java.net.URLEncoder

/** A computer running Agent Workspace: where it listens and the token it wants from other machines. */
data class Server(val host: String, val port: Int, val token: String) {

    val label: String get() = "$urlHost:$port"

    private val urlHost: String get() = if (host.contains(':')) "[$host]" else host

    /** The office page; the token goes along once, the server turns it into a cookie and drops it from the URL. */
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

        /** From the manual form; null when the host is empty or the port is not a port. */
        fun of(host: String, port: String, token: String): Server? {
            val h = host.trim().removePrefix("http://").removeSuffix("/").removePrefix("[").removeSuffix("]")
            val p = port.trim().ifEmpty { DEFAULT_PORT.toString() }.toIntOrNull() ?: return null
            if (h.isEmpty() || p !in 1..65535) return null
            return Server(h, p, token.trim())
        }

        /**
         * From a scanned QR code or an opened link: the server's `http://<ip>:<port>/m?t=<token>` (what the QR code holds)
         * or `agentworkspace://connect?h=<ip>&p=<port>&t=<token>` (what its /m page hands to the app).
         */
        fun parse(text: String?): Server? {
            if (text.isNullOrBlank()) return null
            val uri = runCatching { Uri.parse(text.trim()) }.getOrNull() ?: return null
            return when (uri.scheme?.lowercase()) {
                "agentworkspace" -> of(uri.getQueryParameter("h") ?: "", uri.getQueryParameter("p") ?: "", uri.getQueryParameter("t") ?: "")
                "http" -> {
                    val token = uri.getQueryParameter("t") ?: uri.getQueryParameter("token") ?: return null
                    of(uri.host ?: "", (if (uri.port == -1) 80 else uri.port).toString(), token)
                }
                else -> null
            }
        }
    }
}
