/**
 * sw.js - 이유식 앱 서비스 워커
 * 앱 셸 프리캐싱 및 오프라인 구동 지원
 */

const CACHE_VERSION = 'baby-food-v1.2.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './config.js',
  './css/tokens.css',
  './css/app.css',
  './js/main.js',
  './js/api.js',
  './js/store.js',
  './js/dates.js',
  './js/forecast.js',
  './js/ui/sheet.js',
  './js/ui/chip.js',
  './js/ui/stepper.js',
  './js/ui/toast.js',
  './js/views/home.js',
  './js/views/calendar.js',
  './js/views/daySheet.js',
  './js/views/entrySheet.js',
  './js/views/cubes.js',
  './js/views/ingredients.js',
  './js/views/settings.js',
  './assets/icons/icon-192.svg',
  './assets/icons/icon-512.svg'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).catch(err => {
      console.warn('[SW] Caching failed during install:', err);
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_VERSION) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Google Apps Script API 요청 및 외부 API는 캐시 제외 (네트워크 직접 연결)
  if (url.origin.includes('script.google.com') || url.origin.includes('googleusercontent.com')) {
    return;
  }

  // POST 요청은 캐시할 수 없으므로 네트워크 통과
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // 캐시 우선, 백그라운드 갱신 (Stale-While-Revalidate)
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_VERSION).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
