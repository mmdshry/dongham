package ir.dongham.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DonghamWidget")
public class DonghamWidgetPlugin extends Plugin {
    @PluginMethod
    public void updateBalance(PluginCall call) {
        String owed = call.getString("owedToMe", "۰");
        String iowe = call.getString("iOwe", "۰");
        Context ctx = getContext();
        SharedPreferences prefs = ctx.getSharedPreferences("dongham_widget", Context.MODE_PRIVATE);
        prefs.edit().putString("owedToMe", owed).putString("iOwe", iowe).apply();
        Intent intent = new Intent(ctx, BalanceWidget.class);
        intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        int[] ids = AppWidgetManager.getInstance(ctx).getAppWidgetIds(new ComponentName(ctx, BalanceWidget.class));
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        ctx.sendBroadcast(intent);
        call.resolve();
    }
}
