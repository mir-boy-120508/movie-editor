/*
  GitHub PagesはレスポンスヘッダーにCross-Origin-Opener-PolicyとCross-Origin-Embedder-Policyを
  設定できないため、Service Workerでレスポンスを横取りしてヘッダーを追加注入する。
  これによりSharedArrayBufferが有効化され、ffmpeg.wasmのマルチスレッド版が動作するようになる。
*/
(function () {
  const swUrl = document.currentScript.src;

  if (typeof window === "undefined") {
    // Service Worker自身のコンテキストで実行されている場合
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", (event) => {
      if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
        return;
      }
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response.status === 0) return response;
            const newHeaders = new Headers(response.headers);
            newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
            newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: newHeaders,
            });
          })
          .catch((err) => new Response(String(err), { status: 500 }))
      );
    });
    return;
  }

  // すでにcrossOriginIsolatedが有効なら何もしない
  if (window.crossOriginIsolated !== false) return;

  if (!window.isSecureContext) {
    console.warn("[coi] secure context (https) が必要です。");
    return;
  }

  navigator.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registration.addEventListener("updatefound", () => {
        // 新しいService Workerが有効化されたらリロードして反映
        window.location.reload();
      });
      if (registration.active && !navigator.serviceWorker.controller) {
        window.location.reload();
      }
    })
    .catch((err) => console.error("[coi] service worker registration failed:", err));
})();
