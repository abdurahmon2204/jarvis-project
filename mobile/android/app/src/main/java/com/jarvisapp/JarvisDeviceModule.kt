package com.jarvisapp

import android.content.Context
import android.content.Intent
import android.os.PowerManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/** Small native helpers: keep the CPU awake while listening, and launch an installed app by its name. */
class JarvisDeviceModule(private val ctx: ReactApplicationContext) :
    ReactContextBaseJavaModule(ctx) {

    private var wakeLock: PowerManager.WakeLock? = null

    override fun getName() = "JarvisDevice"

    @ReactMethod
    fun acquire() {
        if (wakeLock?.isHeld == true) return
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "JarvisApp::ListeningLock").apply {
            setReferenceCounted(false)
            acquire()
        }
    }

    @ReactMethod
    fun release() {
        wakeLock?.let { if (it.isHeld) it.release() }
        wakeLock = null
    }

    /** Resolves true when an app whose label matches [query] was launched. */
    @ReactMethod
    fun openApp(query: String, promise: Promise) {
        try {
            val pm = ctx.packageManager
            val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            val apps = pm.queryIntentActivities(main, 0)
            val q = query.trim().lowercase()
            val match = apps.firstOrNull { it.loadLabel(pm).toString().lowercase() == q }
                ?: apps.firstOrNull { it.loadLabel(pm).toString().lowercase().contains(q) }
            val launch = match?.let { pm.getLaunchIntentForPackage(it.activityInfo.packageName) }
            if (launch == null) {
                promise.resolve(false)
                return
            }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(launch)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("E_OPEN_APP", e)
        }
    }
}
