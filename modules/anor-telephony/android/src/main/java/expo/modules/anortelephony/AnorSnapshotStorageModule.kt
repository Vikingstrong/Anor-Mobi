package expo.modules.anortelephony

import android.util.AtomicFile
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException

class AnorSnapshotStorageModule : Module() {
  private val lock = Any()
  private fun storage(): AtomicFile {
    val context = appContext.reactContext ?: throw IOException("Storage unavailable")
    return AtomicFile(File(context.noBackupFilesDir, "anor_snapshot_v1.json"))
  }
  override fun definition() = ModuleDefinition {
    Name("AnorSnapshotStorage")
    AsyncFunction("readAccent") {
      val context = appContext.reactContext ?: throw IOException("Storage unavailable")
      context.getSharedPreferences("anor_preferences", 0).getString("accent", "blue")
    }
    AsyncFunction("writeAccent") { accent: String ->
      require(accent in listOf("blue", "green", "orange", "red", "purple", "teal", "pink"))
      val context = appContext.reactContext ?: throw IOException("Storage unavailable")
      if (!context.getSharedPreferences("anor_preferences", 0).edit().putString("accent", accent).commit()) {
        throw IOException("Preference write failed")
      }
    }
    AsyncFunction("readTheme") {
      val context = appContext.reactContext ?: throw IOException("Storage unavailable")
      context.getSharedPreferences("anor_preferences", 0).getString("theme", "system")
    }
    AsyncFunction("writeTheme") { theme: String ->
      require(theme in listOf("system", "light", "dark"))
      val context = appContext.reactContext ?: throw IOException("Storage unavailable")
      if (!context.getSharedPreferences("anor_preferences", 0).edit().putString("theme", theme).commit()) {
        throw IOException("Preference write failed")
      }
    }
    AsyncFunction("readSnapshot") {
      synchronized(lock) {
        val file = storage()
        try {
          file.openRead().use {
            val bytes = it.readBytes()
            if (bytes.size > 131072) throw IOException("Invalid snapshot size")
            String(bytes, Charsets.UTF_8)
          }
        } catch (_: java.io.FileNotFoundException) { null }
      }
    }
    AsyncFunction("writeSnapshot") { json: String ->
      synchronized(lock) {
        val bytes = json.toByteArray(Charsets.UTF_8)
        if (bytes.size > 131072) throw IOException("Invalid snapshot size")
        val file = storage()
        val stream = file.startWrite()
        try {
          stream.write(bytes)
          file.finishWrite(stream)
        } catch (error: IOException) {
          file.failWrite(stream)
          throw error
        }
      }
    }
  }
}
