package com.d11.rn.mqtt

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.Serializable

@ReactModule(name = MqttModuleImpl.NAME)
class MqttModuleImpl(reactContext: ReactApplicationContext?) :
    ReactContextBaseJavaModule(reactContext), MqttModule {
    companion object {
        const val NAME = "MqttModule"
      init {
        try {
          System.loadLibrary("mqtt")
          Log.d("mqtt","lib load success")
        } catch (ignored: Exception) {
          Log.d("mqtt","lib load failed")
        }
      }
    }

    override fun getName(): String {
      return NAME
    }

    private external fun nativeInstallJSIBindings(runtimePtr: Long)

    private external fun nativeMultiply(a: Int, b: Int): Int

    @ReactMethod(isBlockingSynchronousMethod = true)
    fun installJSIModule(): Boolean {
      val context = reactApplicationContext ?: return false
      val reactContext = context.javaScriptContextHolder
      val reactContextValue = reactContext?.get() ?: 0L

      return if (reactContextValue != 0L) {
        nativeInstallJSIBindings(reactContextValue)
        true
      } else {
        false
      }
    }

  @ReactMethod
  fun multiply(a: Int, b: Int, promise: Promise) {
    promise.resolve(nativeMultiply(a, b))
  }

    private fun emitJsiEvent(eventId: String, payload: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventId, payload)
    }

    override fun createMqtt(clientId: String, host: String, port: Integer, enableSslConfig: java.lang.Boolean) {
        MqttManager.createMqtt(clientId, host, port.toInt(), enableSslConfig.booleanValue(), this::emitJsiEvent)
      Log.d("::::D11MQTT",":::: connect called via jsi bridge")
    }
    override fun removeMqtt(clientId: String) {
        MqttManager.removeMqtt(clientId)
      Log.d("::::D11MQTT",":::: removeMqtt called via jsi bridge")
    }

    override fun connectMqtt(clientId: String, options: HashMap<String, Serializable>) {
        MqttManager.connectMqtt(clientId, MqttConnectOptions(options))
      Log.d("::::D11MQTT",":::: connectMqtt called via jsi bridge")

    }

    override fun disconnectMqtt(clientId: String) {
        MqttManager.disconnectMqtt(clientId)
      Log.d("::::D11MQTT",":::: disconnectMqtt called via jsi bridge")
    }

    override fun subscribeMqtt(eventId: String, clientId: String, topic: String, qos: Integer) {
        MqttManager.subscribeMqtt(eventId, clientId, topic, qos.toInt())
      Log.d("::::D11MQTT",":::: subscribeMqtt called via jsi bridge")
    }

    override fun unsubscribeMqtt(eventId: String, clientId: String, topic: String) {
        MqttManager.unsubscribeMqtt(eventId, clientId, topic)
      Log.d("::::D11MQTT",":::: unsubscribeMqtt called via jsi bridge")
    }

    override fun getConnectionStatusMqtt(clientId: String): String {
        return MqttManager.getConnectionStatusMqtt(clientId)
      Log.d("::::D11MQTT",":::: getConnectionStatusMqtt called via jsi bridge")
    }
}