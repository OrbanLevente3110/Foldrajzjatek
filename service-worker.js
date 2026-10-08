const CACHE_NAME = "foldrajz-jatek-v12";

const CORE_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.webmanifest",
    "./data/game_data.json",
    "./data/subdivisions.json",
    "./lib/topojson-client.min.js",
    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(CORE_FILES);

            const [gameData, subdivisionData] = await Promise.all([
                fetch("./data/game_data.json").then(response => response.json()),
                fetch("./data/subdivisions.json").then(response => response.json())
            ]);
            const countries = gameData.objects.countries.geometries;
            const subdivisions = subdivisionData.objects.subdivisions.geometries;
            const imagePaths = [
                ...new Set(
                    [...countries, ...subdivisions]
                        .flatMap(entity => [
                            entity.properties.flag_local_path,
                            entity.properties.flag?.local_path,
                            entity.properties.coat_of_arms?.local_path
                        ])
                        .filter(Boolean)
                )
            ];

            // Small batches keep installation stable on memory-limited phones.
            for (let index = 0; index < imagePaths.length; index += 40) {
                const batch = imagePaths.slice(index, index + 40);
                await Promise.allSettled(batch.map(path => cache.add(`./${path}`)));
            }

            await self.skipWaiting();
        })()
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => caches.delete(name))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const requestUrl = new URL(request.url);
    if (request.method !== "GET") return;
    const isLocal = requestUrl.origin === self.location.origin;
    const isWikimediaImage = request.destination === "image" &&
        ["commons.wikimedia.org", "upload.wikimedia.org"].includes(requestUrl.hostname);
    if (!isLocal && !isWikimediaImage) return;

    event.respondWith(
        (async () => {
            const cachedResponse = await caches.match(request);
            if (cachedResponse) return cachedResponse;

            try {
                const networkResponse = await fetch(request);
                if (networkResponse.ok || networkResponse.type === "opaque") {
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, networkResponse.clone());
                }
                return networkResponse;
            } catch (error) {
                if (request.mode === "navigate") return caches.match("./index.html");
                throw error;
            }
        })()
    );
});
