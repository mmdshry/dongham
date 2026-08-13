package ir.dongham.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DonghamBazaar")
public class DonghamBazaarPlugin extends Plugin {
    private static final String BAZAAR_PACKAGE = "com.farsitel.bazaar";

    @PluginMethod
    public void purchase(PluginCall call) {
        String sku = call.getString("sku", "premium_monthly");
        if (!isBazaarInstalled()) {
            call.reject("کافه بازار نصب نیست");
            return;
        }
        try {
            Intent intent = new Intent("ir.cafebazaar.intent.action.PAY");
            intent.setPackage(BAZAAR_PACKAGE);
            intent.putExtra("SKU", sku);
            intent.putExtra("PACKAGE_NAME", getContext().getPackageName());
            getActivity().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("sku", sku);
            ret.put("purchaseToken", "dev-pending-" + sku);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("باز کردن بازار ممکن نشد: " + e.getMessage());
        }
    }

    @PluginMethod
    public void queryPremium(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("owned", false);
        call.resolve(ret);
    }

    private boolean isBazaarInstalled() {
        try {
            getContext().getPackageManager().getPackageInfo(BAZAAR_PACKAGE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }
}
