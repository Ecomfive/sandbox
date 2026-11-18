/**
 * Cabeceras de seguridad HTTP de la app (auditoría de seguridad, 18 nov 2026). Las usan `next.config.ts` (todas las
 * respuestas) y `middleware.ts` (la política con nonce de cada página). Sin dependencias de Node: corre también en el
 * runtime del middleware.
 */

/**
 * La parte de la política de contenido que no depende de la petición: quién puede incrustar la app, el `<base>`, a dónde
 * van los formularios y los plugins. Va en todas las respuestas (también las de `/api`, que no llevan nonce).
 */
export const POLITICA_BASE = "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

/**
 * HSTS: dos años y también los subdominios, sin `preload` (eso es una lista de los navegadores de la que cuesta salir).
 * Solo en producción: por http (localhost, la vista previa) los navegadores la ignoran igual.
 */
export const HSTS = "max-age=63072000; includeSubDomains";

/**
 * Un nonce nuevo por petición: 16 bytes al azar en base64 (lo que pide CSP). Sale de `crypto.getRandomValues`, que existe
 * en Node y en el runtime del middleware.
 */
export function nuevoNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario);
}

/**
 * La política completa de una página: la base más `script-src` con el nonce de la petición. Con `'strict-dynamic'` los
 * scripts que Next carga desde uno con nonce (los trozos de cada página) también corren; un `<script>` inyectado, un
 * `onclick="…"` o un `javascript:` no. `'self'` queda para navegadores viejos que no entienden `'strict-dynamic'`. En
 * desarrollo React necesita `eval` (pila de llamadas y recarga en caliente). `worker-src 'self'` deja explícito que el
 * service worker (`/sw.js`, el de instalar la app) se puede registrar. Estilos, imágenes y conexiones no se limitan:
 * Tailwind, los estilos en línea y los orígenes externos (Supabase, Shopify, fotos de Dropi…) siguen como antes.
 */
export function politicaConNonce(nonce: string, desarrollo: boolean): string {
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(desarrollo ? ["'unsafe-eval'"] : [])];
  return `${POLITICA_BASE}; script-src ${script.join(" ")}; worker-src 'self'`;
}

/**
 * Si la respuesta de esa ruta lleva la política con nonce. Las de `/api` no: devuelven JSON, archivos o su propia política
 * (la de los archivos de WhatsApp, `default-src 'none'; sandbox`), y se quedan con la base de `next.config.ts`.
 */
export function llevaPoliticaConNonce(ruta: string): boolean {
  return ruta !== "/api" && !ruta.startsWith("/api/");
}

/**
 * Si el límite de scripts se aplica (bloquea) o solo avisa. Se aplica con `CSP_SCRIPTS_ESTRICTA=1` (o `true`); sin ella,
 * la política con nonce va como `Content-Security-Policy-Report-Only` y el navegador solo anota en la consola lo que
 * habría bloqueado.
 */
export function scriptsEstrictos(env: Record<string, string | undefined>): boolean {
  const v = (env.CSP_SCRIPTS_ESTRICTA ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}
