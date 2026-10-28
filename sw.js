// Lets the installed app open without internet. App files are fetched fresh when online (so updates arrive)
// and served from this cache when offline. Client data is never cached here; it stays in the browser's storage.
const CACHE = 'birthday-reminder-v2';
const SHELL = [
  './', 'index.html', 'style.css', 'app.js', 'templates.json', 'manifest.webmanifest',
  'lib/util.js', 'lib/contacts.js', 'lib/parse.js', 'lib/analyse.js', 'lib/cards.js', 'lib/pdftext.js', 'install.js',
  'icon.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'pictures/pictures.json',
  'pictures/young/pink-roses-cake.en-zh.webp', 'pictures/adult/navy-gold-cake.en-zh.webp', 'pictures/adult/pink-roses-cake.en-zh.webp',
  'pictures/mature/navy-gold-cake.en-zh.webp', 'pictures/mature/tea-mountains.en-zh.webp',
  'pictures/senior/longevity-peony.zh.webp', 'pictures/senior/tea-mountains.en-zh.webp',
];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(async (c) => {
    await c.addAll(SHELL);
    await Promise.all(CDN.map((u) => fetch(u, { mode: 'cors' }).then((r) => r.ok && c.put(u, r)).catch(() => {})));
  }).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // pdf.js from the CDN never changes for this version: cache first.
  if (CDN.includes(url.href)) {
    e.respondWith(caches.match(url.href).then((hit) => hit || fetch(req)));
    return;
  }
  if (url.origin !== self.location.origin) return;
  // App files: network first, cache as fallback (offline).
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
