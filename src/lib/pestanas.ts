export interface Pestana {
  etiqueta: string;
  href: string;
}

/**
 * Pestañas de los módulos que tienen subpáginas (la franja de "vistas" de ClickUp). El nombre de cada
 * una es el título de su página. La primera es la página del módulo; las demás cuelgan de ella.
 */
export const PESTANAS_POR_MODULO: Record<string, Pestana[]> = {
  "/publicaciones-dropi": [
    { etiqueta: "Publicaciones", href: "/publicaciones-dropi" },
    { etiqueta: "Recomendaciones", href: "/publicaciones-dropi/recomendaciones" },
    { etiqueta: "Tareas", href: "/publicaciones-dropi/tareas" },
    { etiqueta: "Reglas", href: "/publicaciones-dropi/reglas" },
    { etiqueta: "Consumo de IA", href: "/publicaciones-dropi/consumo" },
  ],
  "/retiros": [
    { etiqueta: "Retiros", href: "/retiros" },
    { etiqueta: "Cuentas destino", href: "/retiros/cuentas" },
  ],
  "/usuarios": [
    { etiqueta: "Personas", href: "/usuarios" },
    { etiqueta: "Roles", href: "/usuarios/roles" },
    { etiqueta: "Historial de auditoría", href: "/usuarios/auditoria" },
  ],
  "/puestos": [
    { etiqueta: "Puestos", href: "/puestos" },
    { etiqueta: "Organigrama", href: "/puestos/organigrama" },
  ],
  "/extractos": [
    { etiqueta: "Cargar extracto", href: "/extractos" },
    { etiqueta: "Diccionario de patrones bancarios", href: "/extractos/patrones" },
  ],
  "/crm-dropshippers": [
    { etiqueta: "Dropshippers", href: "/crm-dropshippers" },
    { etiqueta: "Bandeja de WhatsApp", href: "/crm-dropshippers/bandeja" },
    { etiqueta: "Plantillas", href: "/crm-dropshippers/plantillas" },
    { etiqueta: "Borrados", href: "/crm-dropshippers/borrados" },
    { etiqueta: "Casos", href: "/crm-dropshippers/casos" },
    { etiqueta: "Motivos", href: "/crm-dropshippers/motivos" },
    { etiqueta: "Ranking", href: "/crm-dropshippers/ranking" },
    { etiqueta: "KPIs de atención", href: "/crm-dropshippers/kpis" },
    { etiqueta: "Vínculos", href: "/crm-dropshippers/vinculos" },
  ],
  "/inventario": [
    { etiqueta: "Stock", href: "/inventario" },
    { etiqueta: "Vencimientos", href: "/inventario/vencimientos" },
    { etiqueta: "Pistoleo", href: "/inventario/pistoleo" },
  ],
  "/productos-test": [
    { etiqueta: "Productos", href: "/productos-test/productos" },
    { etiqueta: "Informe", href: "/productos-test/informe" },
    { etiqueta: "Dashboard", href: "/productos-test/dashboard" },
  ],
  "/ayuda": [
    { etiqueta: "Inicio", href: "/ayuda" },
    { etiqueta: "Glosario", href: "/ayuda/glosario" },
    { etiqueta: "Guías", href: "/ayuda/guias" },
    { etiqueta: "Universidad", href: "/ayuda/universidad" },
    { etiqueta: "Manuales de proceso", href: "/ayuda/manuales" },
  ],
  "/analisis-competencia": [
    { etiqueta: "Competidores", href: "/analisis-competencia" },
    { etiqueta: "Resumen", href: "/analisis-competencia/resumen" },
  ],
  // Compras primero y luego el Tablero de Shen Zhen (pedido de Hernán, 22 oct 2026).
  "/compras": [
    { etiqueta: "Compras", href: "/compras/lista" },
    { etiqueta: "Tablero de Shen Zhen", href: "/compras/tablero-chin" },
    { etiqueta: "Dashboard", href: "/compras/dashboard" },
    { etiqueta: "Informe", href: "/compras/informe" },
    { etiqueta: "Planificación", href: "/compras/planificacion" },
    { etiqueta: "Reponer", href: "/compras/reponer" },
    { etiqueta: "Sin stock", href: "/compras/sin-stock" },
    { etiqueta: "Tiempos y fallas", href: "/compras/tiempos" },
    { etiqueta: "Envíos", href: "/compras/envios" },
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
