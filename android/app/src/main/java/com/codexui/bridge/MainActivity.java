package com.codexui.bridge;

import android.os.Bundle;
import com.getcapacitor.CapConfig;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MobileShellPlugin.class);
        config = buildConfig();
        super.onCreate(savedInstanceState);
    }

    private CapConfig buildConfig() {
        CapConfig defaultConfig = CapConfig.loadDefault(this);
        String serverUrl = MobileShellConfig.resolveServerUrl(this, defaultConfig.getServerUrl());
        boolean allowMixedContent = defaultConfig.isMixedContentAllowed() || serverUrl.startsWith("http://");

        CapConfig.Builder builder = new CapConfig.Builder(this)
            .setHTML5mode(defaultConfig.isHTML5Mode())
            .setErrorPath(defaultConfig.getErrorPath())
            .setHostname(defaultConfig.getHostname())
            .setStartPath(defaultConfig.getStartPath())
            .setAndroidScheme(defaultConfig.getAndroidScheme())
            .setAllowNavigation(defaultConfig.getAllowNavigation())
            .setOverriddenUserAgentString(defaultConfig.getOverriddenUserAgentString())
            .setAppendedUserAgentString(defaultConfig.getAppendedUserAgentString())
            .setBackgroundColor(defaultConfig.getBackgroundColor())
            .setAllowMixedContent(allowMixedContent)
            .setCaptureInput(defaultConfig.isInputCaptured())
            .setUseLegacyBridge(defaultConfig.isUsingLegacyBridge())
            .setResolveServiceWorkerRequests(defaultConfig.isResolveServiceWorkerRequests())
            .setWebContentsDebuggingEnabled(defaultConfig.isWebContentsDebuggingEnabled())
            .setZoomableWebView(defaultConfig.isZoomableWebView())
            .setLoggingEnabled(defaultConfig.isLoggingEnabled())
            .setInitialFocus(defaultConfig.isInitialFocus());

        if (!serverUrl.isEmpty()) {
            builder.setServerUrl(serverUrl);
        }

        return builder.create();
    }
}
