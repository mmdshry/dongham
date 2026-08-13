package ir.dongham.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class BalanceWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences("dongham_widget", Context.MODE_PRIVATE);
        String owed = prefs.getString("owedToMe", "۰ تومان");
        String iowe = prefs.getString("iOwe", "۰ تومان");
        for (int id : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_balance);
            views.setTextViewText(R.id.widget_owed, "طلب: " + owed);
            views.setTextViewText(R.id.widget_iowe, "بدهی: " + iowe);
            appWidgetManager.updateAppWidget(id, views);
        }
    }
}
