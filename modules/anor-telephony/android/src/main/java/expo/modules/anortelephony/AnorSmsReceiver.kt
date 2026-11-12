package expo.modules.anortelephony

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.provider.Telephony
import android.telephony.SubscriptionManager
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONException
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.Executors

// Manifest receiver survives JS/process destruction. It stores known fields only,
// never the SMS body, sender, greeting, phone number, or permission state.
class AnorSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION ||
      context.checkSelfPermission(Manifest.permission.RECEIVE_SMS) != PackageManager.PERMISSION_GRANTED) return
    val messages = try { Telephony.Sms.Intents.getMessagesFromIntent(intent) }
      catch (_: IllegalArgumentException) { return }
    val first = messages.firstOrNull() ?: return
    if (messages.any { !it.originatingAddress.equals("AnorINFO", ignoreCase = true) }) return
    val body = messages.joinToString("") { it.messageBody.orEmpty() }
    if (body.isBlank() || body.length > 16384) return
    val subscription = intent.getIntExtra(SubscriptionManager.EXTRA_SUBSCRIPTION_INDEX,
      intent.getIntExtra("subscription", SubscriptionManager.INVALID_SUBSCRIPTION_ID))
    if (first.timestampMillis <= 0) return
    val fields = extractFields(body) ?: return
    val event = JSONObject().put("id", UUID.randomUUID().toString()).put("subscriptionId", subscription)
      .put("receivedAt", System.currentTimeMillis()).put("messageTime", first.timestampMillis).put("fields", fields)
    val result = goAsync()
    worker.execute {
      try { SmsInbox.append(context.applicationContext, subscription, event) }
      catch (_: IOException) { /* Leave the ordinary SMS/manual import available. No SMS logging. */ }
      catch (_: JSONException) { /* Do not overwrite an unreadable inbox. */ }
      finally { result.finish() }
    }
  }

  private fun extractFields(body: String): JSONObject? {
    val main = body.replace("\r", "").split(Regex("<<\\s*Стоп платный интернет трафик\\s*>>", RegexOption.IGNORE_CASE))[0]
    val fields = JSONObject()
    val definitions = listOf(Triple("day", "Интернети бокимонда", "мб"), Triple("night", "Трафики шабона", "мб"),
      Triple("minutes", "Дакикахои бокимонда", "дакика"), Triple("sms", "СМС бокимонда", "адад"))
    for ((key, label, unit) in definitions) {
      val matches = Regex("(?:^|[\\n;])\\s*$label\\s*:([^;\\n]*)", RegexOption.IGNORE_CASE).findAll(main).toList()
      if (matches.size > 1) return null
      val field = matches.firstOrNull()?.groupValues?.get(1) ?: continue
      // Keep just a constrained number/unit pair. JS revalidates integer/range semantics.
      val value = Regex("^\\s*(-?\\d+(?:[.,]\\d+)?)\\s*($unit)\\s*$", RegexOption.IGNORE_CASE).matchEntire(field) ?: continue
      val number = value.groupValues[1].replace(',', '.').toDoubleOrNull() ?: return null
      if (!number.isFinite() || number < 0 || (key in listOf("minutes", "sms") &&
        (number % 1.0 != 0.0 || number > 9007199254740991.0))) return null
      fields.put(key, value.groupValues[1] + " " + unit)
    }
    if (fields.length() == 0) return null
    val names = Regex("(?:^|\\n)\\s*Тарофаи\\s+Шумо\\s*<<([^<>\\n]{1,80})>>", RegexOption.IGNORE_CASE).findAll(main).toList()
    if (names.size > 1) return null
    names.firstOrNull()?.let {
      val name = it.groupValues[1].trim()
      if (name.isEmpty()) return null
      fields.put("tariffName", name)
    }
    val dates = Regex("Мухлати\\s+баста\\s+то\\s+(\\d{2}\\.\\d{2}\\.\\d{4}\\s+\\d{2}:\\d{2}:\\d{2})", RegexOption.IGNORE_CASE).findAll(main).toList()
    if (dates.size > 1) return null
    dates.firstOrNull()?.let {
      val raw = it.groupValues[1]
      val format = java.text.SimpleDateFormat("dd.MM.yyyy HH:mm:ss", java.util.Locale.ROOT)
      format.isLenient = false
      try { format.parse(raw) ?: return null } catch (_: java.text.ParseException) { return null }
      fields.put("expiry", raw)
    }
    return fields
  }
  companion object { private val worker = Executors.newSingleThreadExecutor() }
}

// Shared process lock serializes broadcast IO and Expo async calls. All files are
// excluded from backup. AtomicFile preserves the previous file on write failure.
object SmsInbox {
  private val lock = Any()
  private fun file(context: Context) = AtomicFile(File(context.noBackupFilesDir, "anor_sms_inbox_v1.json"))
  private fun read(context: Context): JSONObject {
    val storage = file(context)
    return try {
      storage.openRead().use {
        val bytes = it.readBytes()
        if (bytes.size > 131072) throw IOException("Inbox too large")
        JSONObject(String(bytes, Charsets.UTF_8))
      }
    } catch (_: java.io.FileNotFoundException) { JSONObject().put("enabled", false).put("subscriptionId", -1).put("events", JSONArray()) }
  }
  private fun write(context: Context, value: JSONObject) {
    val storage = file(context)
    val bytes = value.toString().toByteArray(Charsets.UTF_8)
    if (bytes.size > 131072) throw IOException("Inbox too large")
    val stream = storage.startWrite()
    try { stream.write(bytes); storage.finishWrite(stream) }
    catch (error: IOException) { storage.failWrite(stream); throw error }
  }
  fun configure(context: Context, enabled: Boolean, subscription: Int) = synchronized(lock) {
    val value = read(context)
    if (!enabled || value.optInt("subscriptionId", -1) != subscription) value.put("events", JSONArray())
    value.put("enabled", enabled).put("subscriptionId", subscription)
    write(context, value)
  }
  fun append(context: Context, subscription: Int, event: JSONObject) = synchronized(lock) {
    val value = read(context)
    if (!value.optBoolean("enabled") || subscription < 0 || value.optInt("subscriptionId", -1) != subscription) return@synchronized
    val events = value.optJSONArray("events") ?: JSONArray()
    events.put(event)
    while (events.length() > 30) events.remove(0)
    value.put("events", events)
    write(context, value)
  }
  fun pending(context: Context): String = synchronized(lock) { (read(context).optJSONArray("events") ?: JSONArray()).toString() }
  fun acknowledge(context: Context, ids: List<String>) = synchronized(lock) {
    val value = read(context)
    val old = value.optJSONArray("events") ?: JSONArray()
    val next = JSONArray()
    for (index in 0 until old.length()) {
      val event = old.getJSONObject(index)
      if (event.optString("id") !in ids) next.put(event)
    }
    value.put("events", next)
    write(context, value)
  }
}
