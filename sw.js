/* 리아 브리핑 service worker
 * - 앱 셸: 캐시 우선(오프라인에서도 열림)
 * - data/briefings.enc.json(암호문): 네트워크 우선, 실패하면 마지막 저장본
 * - 평문 데이터(briefings.json)는 요청도, 저장도 하지 않아요. 복호화된 내용은 메모리에만 있어요.
 * 앱 파일을 고치면 VERSION 숫자를 올리세요. */
const VERSION = "v2";
const SHELL = `ria-shell-${VERSION}`;
const DATA = `ria-data-${VERSION}`;
const ENC = "data/briefings.enc.json";
const SHELL_FILES = [
  "./", "index.html", "css/app.css", "js/app.js", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png", "icons/favicon-32.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(SHELL_FILES))
      .then(() => caches.open(DATA)).then((c) => c.add(ENC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    // 이전 버전(v1)이 저장해 둔 캐시는 모두 지워요(평문이 있었을 수 있어서)
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.endsWith("/briefings.json")) return; // 평문 데이터: 가로채지도 저장하지도 않음

  if (url.pathname.endsWith("/" + ENC)) {
    e.respondWith(
      fetch(req, { cache: "no-store" }).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(DATA).then((c) => c.put(ENC, copy)); }
        return res;
      }).catch(() => caches.match(ENC))
    );
    return;
  }

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put("index.html", copy)); }
        return res;
      }).catch(() => caches.match("index.html", { ignoreSearch: true }))
    );
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res.ok && !url.pathname.includes("/data/")) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
