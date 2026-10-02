import type { NextConfig } from "next";

/**
 * Cabeceras de seguridad en todas las respuestas. La política de contenido es parcial a propósito: restringe lo que no
 * necesita scripts con nonce (quién puede incrustar la app, el `<base>`, los formularios y los plugins) y deja libre
 * `script-src`, que requeriría un nonce por petición. Evita el clickjacking y varios tipos de inyección.
 */
const CABECERAS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS }];
  },
};

export default nextConfig;
