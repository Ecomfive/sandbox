export interface Pestana {
  etiqueta: string;
  href: string;
}

/**
 * Pestañas de los módulos que tienen subpáginas (la franja de "vistas" de ClickUp). El nombre de cada
 * una es el título de su página. La primera es la página del módulo; las demás cuelgan de ella.
 */
export const PESTANAS_POR_MODULO: Record<string, Pestana[]> = {
  "/retiros": [
    { etiqueta: "Retiros", href: "/retiros" },
    { etiqueta: "Cuentas destino", href: "/retiros/cuentas" },
  ],
  "/usuarios": [
    { etiqueta: "Usuarios y roles", href: "/usuarios" },
    { etiqueta: "Historial de auditoría", href: "/usuarios/auditoria" },
  ],
  "/extractos": [
    { etiqueta: "Cargar extracto", href: "/extractos" },
    { etiqueta: "Diccionario de patrones bancarios", href: "/extractos/patrones" },
  ],
  "/compras": [
    { etiqueta: "Productos", href: "/compras" },
    { etiqueta: "Filtros", href: "/compras/filtros" },
  ],
};

/** Pestañas del módulo (vacío si no tiene subpáginas: entonces no se dibuja la franja). */
export function pestanasDe(moduloHref: string | null): Pestana[] {
  return (moduloHref && PESTANAS_POR_MODULO[moduloHref]) || [];
}

/** La pestaña de la ruta actual: la de href más largo que la contiene (un detalle cuenta en la pestaña de su módulo). */
export function pestanaActiva(pestanas: Pestana[], ruta: string): string | null {
  const limpia = ruta.length > 1 ? ruta.replace(/\/+$/, "") : ruta;
  const candidatas = pestanas.filter((p) => limpia === p.href || limpia.startsWith(`${p.href}/`));
  return candidatas.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
