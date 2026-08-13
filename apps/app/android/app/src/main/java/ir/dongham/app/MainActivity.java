package ir.dongham.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DonghamBazaarPlugin.class);
        registerPlugin(DonghamMyketPlugin.class);
        registerPlugin(DonghamWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
