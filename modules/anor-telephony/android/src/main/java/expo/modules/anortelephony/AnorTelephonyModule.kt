package expo.modules.anortelephony

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Telephony
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AnorTelephonyModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private data class Pending(val id: String, val promise: Promise, val timeout: Runnable)
  private var pending: Pending? = null
  private var receiverContext: Context? = null

  private fun error(code: String, nativeCode: Int? = null): Map<String, Any?> =
    mapOf("kind" to "error", "code" to code, "nativeCode" to nativeCode)

  private fun permitted(context: Context, permission: String) =
    context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

  private fun active(context: Context, subscriptionId: Int): Boolean =
    context.getSystemService(SubscriptionManager::class.java)
      ?.activeSubscriptionInfoList?.any { it.subscriptionId == subscriptionId } == true

  // All access to pending is serialized on the main looper. A timeout cannot
  // cancel the modem session; its eventual callback is deliberately ignored.
  private fun finish(id: String, result: Map<String, Any?>) {
    val operation = pending ?: return
    if (operation.id != id) return
    pending = null
    main.removeCallbacks(operation.timeout)
    operation.promise.resolve(result)
  }

  private val smsReceiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
      if (!permitted(context, Manifest.permission.RECEIVE_SMS)) return
      val messages = try {
        Telephony.Sms.Intents.getMessagesFromIntent(intent)
      } catch (_: IllegalArgumentException) { return }
      val first = messages.firstOrNull() ?: return
      if (messages.any { !it.originatingAddress.equals("AnorINFO", ignoreCase = true) }) return
      val body = messages.joinToString("") { it.messageBody.orEmpty() }
      if (body.isBlank() || body.length > 16384 || appContext.reactContext == null) return
      val subscriptionId = intent.getIntExtra(
        SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX,
        intent.getIntExtra("subscription", SubscriptionManager.INVALID_SUBSCRIPTION_ID)
      )
      // Only an in-memory event. No SMS body or other sender is written to disk.
      sendEvent("onOperatorSms", mapOf(
        "sender" to "AnorINFO", "body" to body,
        "subscriptionId" to subscriptionId,
        "receivedAt" to System.currentTimeMillis().toDouble(),
        "messageTime" to first.timestampMillis.toDouble()
      ))
    }
  }

  private fun stopReceiver() {
    val context = receiverContext ?: return
    receiverContext = null
    try { context.unregisterReceiver(smsReceiver) } catch (_: IllegalArgumentException) { }
  }

  override fun definition() = ModuleDefinition {
    Name("AnorTelephony")
    Events("onOperatorSms", "onRequestDispatched")

    AsyncFunction("configureBackgroundSms") { enabled: Boolean, subscriptionId: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("Context unavailable")
      SmsInbox.configure(context, enabled && permitted(context, Manifest.permission.RECEIVE_SMS), subscriptionId)
    }
    AsyncFunction("readPendingSms") {
      val context = appContext.reactContext ?: throw IllegalStateException("Context unavailable")
      SmsInbox.pending(context)
    }
    AsyncFunction("acknowledgeSms") { ids: List<String> ->
      val context = appContext.reactContext ?: throw IllegalStateException("Context unavailable")
      SmsInbox.acknowledge(context, ids)
    }

    AsyncFunction("getSubscriptions") {
      val context = appContext.reactContext
      if (context == null) error("MODULE_UNAVAILABLE")
      else if (!permitted(context, Manifest.permission.READ_PHONE_STATE)) error("READ_PHONE_STATE_REQUIRED")
      else try {
        val defaultVoice = SubscriptionManager.getDefaultVoiceSubscriptionId()
        val telephony = context.getSystemService(TelephonyManager::class.java)
        val subscriptions = context.getSystemService(SubscriptionManager::class.java)
          ?.activeSubscriptionInfoList.orEmpty().map {
            mapOf("subscriptionId" to it.subscriptionId, "slotIndex" to it.simSlotIndex,
              "displayName" to it.displayName?.toString().orEmpty().take(60),
              "carrierName" to it.carrierName?.toString().orEmpty().take(80),
              "operatorName" to telephony?.createForSubscriptionId(it.subscriptionId)?.simOperatorName.orEmpty().take(80),
              "isDefaultVoice" to (it.subscriptionId == defaultVoice))
          }
        mapOf("kind" to "success", "data" to subscriptions)
      } catch (_: SecurityException) { error("READ_PHONE_STATE_REQUIRED") }
        catch (_: UnsupportedOperationException) { error("UNSUPPORTED") }
    }

    AsyncFunction("sendRequest") { id: String, kind: String, subscriptionId: Int, promise: Promise ->
      main.post {
        val context = appContext.reactContext
        val code = when (kind) { "balance" -> "*100#"; "packages" -> "*104#"; else -> null }
        if (context == null) { promise.resolve(error("MODULE_UNAVAILABLE")); return@post }
        if (code == null || id.isBlank() || id.length > 128) {
          promise.resolve(error("INVALID_INPUT")); return@post
        }
        if (Build.VERSION.SDK_INT < 26 || !context.packageManager.hasSystemFeature(PackageManager.FEATURE_TELEPHONY)) {
          promise.resolve(error("UNSUPPORTED")); return@post
        }
        if (!permitted(context, Manifest.permission.CALL_PHONE)) {
          promise.resolve(error("CALL_PHONE_REQUIRED")); return@post
        }
        if (!permitted(context, Manifest.permission.READ_PHONE_STATE)) {
          promise.resolve(error("READ_PHONE_STATE_REQUIRED")); return@post
        }
        if (pending != null) { promise.resolve(error("BUSY")); return@post }
        try {
          if (!active(context, subscriptionId)) { promise.resolve(error("SIM_CHANGED")); return@post }
          val manager = context.getSystemService(TelephonyManager::class.java)
            ?.createForSubscriptionId(subscriptionId)
          if (manager == null) { promise.resolve(error("UNSUPPORTED")); return@post }
          val timeout = Runnable { finish(id, error("TIMEOUT")) }
          pending = Pending(id, promise, timeout)
          main.postDelayed(timeout, 30000)
          manager.sendUssdRequest(code, object : TelephonyManager.UssdResponseCallback() {
            override fun onReceiveUssdResponse(manager: TelephonyManager, request: String, response: CharSequence) {
              if (pending?.id != id) return
              try {
                if (!active(context, subscriptionId)) { finish(id, error("SIM_CHANGED")); return }
                val text = response.toString()
                if (text.length > 16384) { finish(id, error("INVALID_RESPONSE")); return }
                finish(id, mapOf("kind" to "success", "data" to mapOf(
                  "requestId" to id, "subscriptionId" to subscriptionId,
                  "text" to text, "receivedAt" to System.currentTimeMillis().toDouble()
                )))
              } catch (_: SecurityException) { finish(id, error("READ_PHONE_STATE_REQUIRED")) }
                catch (_: UnsupportedOperationException) { finish(id, error("UNSUPPORTED")) }
            }
            override fun onReceiveUssdResponseFailed(manager: TelephonyManager, request: String, failureCode: Int) {
              finish(id, error("PLATFORM_FAILURE", failureCode))
            }
          }, main)
          sendEvent("onRequestDispatched", mapOf("requestId" to id, "kind" to kind,
            "sentAt" to System.currentTimeMillis().toDouble()))
        } catch (_: SecurityException) {
          if (pending?.id == id) finish(id, error("PERMISSION_REVOKED"))
          else promise.resolve(error("PERMISSION_REVOKED"))
        } catch (_: UnsupportedOperationException) {
          if (pending?.id == id) finish(id, error("UNSUPPORTED"))
          else promise.resolve(error("UNSUPPORTED"))
        } catch (_: IllegalArgumentException) {
          if (pending?.id == id) finish(id, error("INVALID_INPUT"))
          else promise.resolve(error("INVALID_INPUT"))
        } catch (_: IllegalStateException) {
          if (pending?.id == id) finish(id, error("PLATFORM_FAILURE"))
          else promise.resolve(error("PLATFORM_FAILURE"))
        }
      }
      Unit
    }

    AsyncFunction("setSmsListening") { enabled: Boolean, promise: Promise ->
      main.post {
        val context = appContext.reactContext
        if (!enabled) { stopReceiver(); promise.resolve(mapOf("kind" to "success", "data" to true)); return@post }
        if (context == null) { promise.resolve(error("MODULE_UNAVAILABLE")); return@post }
        if (!permitted(context, Manifest.permission.RECEIVE_SMS)) {
          promise.resolve(error("RECEIVE_SMS_REQUIRED")); return@post
        }
        if (receiverContext != null) { promise.resolve(mapOf("kind" to "success", "data" to true)); return@post }
        try {
          val filter = IntentFilter(Telephony.Sms.Intents.SMS_RECEIVED_ACTION)
          if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(smsReceiver, filter, Context.RECEIVER_EXPORTED)
          else context.registerReceiver(smsReceiver, filter)
          receiverContext = context
          promise.resolve(mapOf("kind" to "success", "data" to true))
        } catch (_: SecurityException) { promise.resolve(error("RECEIVE_SMS_REQUIRED")) }
      }
      Unit
    }

    OnDestroy {
      main.post {
        stopReceiver()
        pending?.let { finish(it.id, error("CANCELLED")) }
      }
    }
  }
}
