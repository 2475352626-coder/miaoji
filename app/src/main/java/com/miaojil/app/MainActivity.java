package com.miaojil.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;

/**
 * 喵记 —— 整个 App 就是一个 WebView，加载打包在 assets 里的离线网页。
 *
 * 关键点：不能直接用 file:// 加载，那样 localStorage 会被浏览器禁用，
 * 数据一刷新就没了。这里用 WebViewAssetLoader 把 assets 挂到一个
 * https 虚拟域名下，页面就有了正常的 origin，数据能正常保存。
 */
public class MainActivity extends Activity {

    private static final String START_URL =
            "https://appassets.androidplatform.net/assets/www/index.html";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        setContentView(web, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage，必须开
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setUseWideViewPort(true);
        s.setTextZoom(100);                     // 不跟随系统字体放大，避免排版错乱
        web.setBackgroundColor(0xFFFAF6F1);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        web.setWebViewClient(new WebViewClientCompat() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        if (savedInstanceState == null) {
            web.loadUrl(START_URL);
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        // 有弹层时先关弹层，没有弹层才退出 App
        web.evaluateJavascript(
                "(function(){var l=document.getElementById('sheetLayer');" +
                        "if(l&&!l.hidden){var b=document.querySelector('[data-close]');" +
                        "if(b){b.click();return 'sheet';}}return 'none';})()",
                new ValueCallback<String>() {
                    @Override
                    public void handleValue(String value) {
                        if (value != null && value.contains("sheet")) return;
                        if (web.canGoBack()) web.goBack();
                        else finish();
                    }
                });
    }
}
