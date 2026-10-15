// Sin caché ni modo sin conexión: existe solo para que Chrome deje instalar la plataforma como app y así aparezca en «Compartir en…».
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
