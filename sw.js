/* Service worker HotelDesk : l'application s'ouvre même sans internet.
   - Page et bibliothèques : mises en cache, mises à jour dès que le réseau revient.
   - Données (Supabase) et assistant IA : jamais mis en cache, toujours via le réseau. */
const CACHE = 'hoteldesk-v2';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
const LIBS = [
  'lib-supabase-2.117.3.js', 'lib-lucide-1.55.0.js', 'lib-chart-4.4.1.js', 'lib-papaparse-5.4.1.min.js',
  'lib-html2canvas-1.4.1.min.js', 'lib-jspdf-2.5.1.umd.min.js', 'lib-xlsx-0.18.5.full.min.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(SHELL.concat(LIBS).map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co') || url.pathname.startsWith('/api/')) return; // données et IA : réseau uniquement

  // Page : réseau d'abord (mises à jour immédiates), cache si hors-ligne
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req);
        const c = await caches.open(CACHE); c.put('index.html', r.clone());
        return r;
      } catch (err) {
        return (await caches.match('index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Bibliothèques, polices, icônes : cache d'abord, rafraîchi en arrière-plan
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const net = fetch(req).then(async r => {
      if (r && (r.ok || r.type === 'opaque')) { const c = await caches.open(CACHE); c.put(req, r.clone()); }
      return r;
    }).catch(() => null);
    return cached || (await net) || Response.error();
  })());
});
