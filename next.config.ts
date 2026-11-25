import type { NextConfig } from "next";
import { HSTS, POLITICA_BASE } from "./src/lib/seguridad/cabeceras";

/**
 * Cabeceras de seguridad en todas las respuestas. Aquí va la parte fija de la política de contenido (quién puede incrustar
 * la app, el `<base>`, los formularios y los plugins); `script-src` con un nonce por petición lo agrega `middleware.ts` a
 * cada página (auditoría de seguridad, 18 nov 2026). Evita el clickjacking y varios tipos de inyección. HSTS solo en
 * producción (auditoría de seguridad, 18 nov 2026).
 */
const CABECERAS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: POLITICA_BASE },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: HSTS }] : []),
];

const nextConfig: NextConfig = {
  // El Catálogo maestro pasó a ser el módulo Producto.
  async redirects() {
    // Gestión de tienda (17 nov 2026): los módulos sueltos pasaron a ser pestañas de Pedidos, Envíos Delivery y Tiendas Shopify. Las direcciones
    // viejas (favoritos, avisos «Para ti» ya guardados, enlaces copiados) siguen llevando a su pestaña.
    const movidas: [string, string][] = [
      ["/tienda-logistica", "/tienda-pedidos/logistica"],
      ["/tienda-confirmacion", "/tienda-pedidos/confirmacion"],
      ["/tienda-cuanto-hay", "/tienda-pedidos/cuanto-hay"],
      ["/despacho-devoluciones", "/despacho-ciudad/devoluciones"],
      ["/despacho-cambios", "/despacho-ciudad/cambios"],
      // Inventario despacho salió de Envíos Delivery (25 nov 2026). El archivo va antes que la ruta que lo contiene.
      ["/despacho-cuanto-hay", "/inventario-despacho"],
      ["/despacho-pedir-inventario/archivo", "/inventario-despacho/archivo"],
      ["/despacho-pedir-inventario", "/inventario-despacho/solicitudes"],
      ["/despacho-ciudad/cuanto-hay", "/inventario-despacho"],
      ["/despacho-ciudad/pedir-inventario/archivo", "/inventario-despacho/archivo"],
      ["/despacho-ciudad/pedir-inventario", "/inventario-despacho/solicitudes"],
      ["/tienda-productos", "/tienda-tiendas/productos"],
    ];
    return [
      { source: "/catalogo-maestro", destination: "/producto", permanent: false },
      ...movidas.flatMap(([desde, hacia]) => [
        { source: desde, destination: hacia, permanent: false },
        { source: `${desde}/:resto*`, destination: `${hacia}/:resto*`, permanent: false },
      ]),
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: CABECERAS }];
  },
};

export default nextConfig;
