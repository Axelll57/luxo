/* Luxo — service worker
   Rôle : garder une copie de tous les fichiers de l'appli sur le téléphone
   pour qu'elle marche sans réseau.

   >>> Pour publier une mise à jour (nouvelles leçons, correction…),
   >>> augmente VERSION ci-dessous. C'est ce changement qui prévient
   >>> le téléphone qu'il y a du nouveau.                                  */
const VERSION = '2.1.0';
const CACHE = 'luxo-' + VERSION;
const FILES = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'lessons.json',
  'manifest.webmanifest',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/favicon-32.png'
];

// 1. Installation : on télécharge tout d'un coup dans un cache neuf.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES.map(f => new Request(f, {cache: 'reload'}))))
  );
  // Pas de skipWaiting ici : on attend que l'utilisateur touche « Mettre à jour ».
});

// 2. Activation : on supprime les anciennes versions du cache.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('luxo-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 3. Chaque requête : d'abord le cache (instantané, marche hors ligne), sinon le réseau.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, {ignoreSearch: true}).then(hit => {
      if (hit) return hit;
      return fetch(req).catch(() => req.mode === 'navigate' ? caches.match('index.html') : Response.error());
    })
  );
});

// 4. Messages de l'appli : activer la nouvelle version, ou donner le numéro de version.
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'version' && event.source) event.source.postMessage({version: VERSION});
});
