package io.github.thnonl.agentworkspace

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.isVisible
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

/**
 * One screen: the connect form (scan the QR code, or type IP and port) and, once connected, the office in a
 * WebView. The page comes from the computer itself, so the app never needs an update for a new web version.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private lateinit var panel: View
    private lateinit var hostInput: EditText
    private lateinit var portInput: EditText
    private lateinit var errorText: TextView

    private val prefs by lazy { getSharedPreferences("connect", MODE_PRIVATE) }
    private val updates by lazy { UpdateChecker(this) }
    private var server: Server? = null
    private var lastBack = 0L

    private val scan = registerForActivityResult(ScanContract()) { result ->
        val text = result.contents ?: return@registerForActivityResult
        val found = Server.parse(text)
        if (found == null) showPanel(getString(R.string.err_bad_qr)) else connect(found)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val root = findViewById<View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        web = findViewById(R.id.web)
        panel = findViewById(R.id.panel)
        hostInput = findViewById(R.id.host)
        portInput = findViewById(R.id.port)
        errorText = findViewById(R.id.error)
        findViewById<TextView>(R.id.version).text = getString(R.string.version, BuildConfig.VERSION_NAME)
        findViewById<Button>(R.id.scan).setOnClickListener { startScan() }
        findViewById<Button>(R.id.connect).setOnClickListener { connectFromForm() }
        portInput.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_GO) connectFromForm()
            action == EditorInfo.IME_ACTION_GO
        }
        setUpWebView()

        val saved = Server.load(prefs)
        fill(saved)
        val opened = Server.parse(intent?.dataString)
        when {
            opened != null -> connect(opened)
            saved != null -> connect(saved)
            else -> showPanel(null)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (panel.isVisible) {
                    finish()
                    return
                }
                val now = SystemClock.elapsedRealtime()
                if (now - lastBack < 2000) {
                    disconnect(null)
                } else {
                    lastBack = now
                    Toast.makeText(this@MainActivity, R.string.back_again, Toast.LENGTH_SHORT).show()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        Server.parse(intent.dataString)?.let(::connect)
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
        updates.check()
    }

    override fun onPause() {
        web.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setUpWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        CookieManager.getInstance().setAcceptCookie(true)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // the web app hides its "Connect a device" settings when it finds this
            userAgentString = "$userAgentString AgentWorkspaceApp/${BuildConfig.VERSION_NAME}"
        }
        web.addJavascriptInterface(AppBridge(), "AgentWorkspaceApp")
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val target = server
                if (target != null && target.isSameHost(request.url)) return false
                // links to anywhere else (GitHub, docs …) open in the browser
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, request.url))
                } catch (_: ActivityNotFoundException) {
                    /* nothing can open it */
                }
                return true
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame || panel.isVisible) return
                disconnect(getString(R.string.err_unreachable, server?.label ?: "", error.description))
            }

            // (only a computer that runs a version up to 1.3.8 still locks its office: a QR code of it carries the token)
            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (request.isForMainFrame && response.statusCode == 401 && !panel.isVisible) disconnect(getString(R.string.err_locked))
            }
        }
    }

    /**
     * `window.AgentWorkspaceApp` for the page: its Settings show a "Change server" button when this is there. (Only the
     * office of the connected computer is ever loaded: links elsewhere go to the browser.) Called on a WebView thread.
     */
    private inner class AppBridge {
        @JavascriptInterface
        fun changeServer() {
            runOnUiThread { if (!isFinishing) disconnect(null) }
        }

        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME
    }

    private fun startScan() {
        scan.launch(
            ScanOptions()
                .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                .setPrompt(getString(R.string.scan_prompt))
                .setBeepEnabled(false)
                .setOrientationLocked(false),
        )
    }

    private fun connectFromForm() {
        val typed = Server.of(hostInput.text.toString(), portInput.text.toString())
        if (typed == null) showPanel(getString(R.string.err_input)) else connect(typed)
    }

    private fun connect(target: Server) {
        server = target
        target.save(prefs)
        fill(target)
        errorText.isVisible = false
        panel.isVisible = false
        web.isVisible = true
        web.loadUrl(target.pageUrl())
    }

    /** Leaves the office (the page stops, its stream closes) and shows the form, with an error when there is one. */
    private fun disconnect(error: String?) {
        web.stopLoading()
        web.loadUrl("about:blank")
        showPanel(error)
    }

    private fun showPanel(error: String?) {
        web.isVisible = false
        panel.isVisible = true
        errorText.text = error
        errorText.isVisible = error != null
    }

    private fun fill(target: Server?) {
        hostInput.setText(target?.host ?: "")
        portInput.setText((target?.port ?: Server.DEFAULT_PORT).toString())
    }
}
