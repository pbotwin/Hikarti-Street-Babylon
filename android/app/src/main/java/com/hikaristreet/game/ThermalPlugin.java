package com.hikaristreet.game;

import android.content.Context;
import android.os.Build;
import android.os.PowerManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The phone's thermal state for the game's adaptive performance (the web
 * page itself has no thermal API).
 *
 *   status    PowerManager thermal status, 0 (none) .. 6 (shutdown); Android 10+
 *   headroom  forecast 10 s ahead, 0 = cool .. 1 = severe throttling; Android 11+
 *
 * Android allows a headroom query about once a second; the game asks every
 * two seconds.
 */
@CapacitorPlugin(name = "Thermal")
public class ThermalPlugin extends Plugin {
    private static final int FORECAST_SECONDS = 10;

    @PluginMethod
    public void getState(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject result = new JSObject();
        if (pm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            result.put("status", pm.getCurrentThermalStatus());
        }
        if (pm != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            float headroom = pm.getThermalHeadroom(FORECAST_SECONDS);
            if (!Float.isNaN(headroom)) result.put("headroom", headroom);
        }
        call.resolve(result);
    }
}
