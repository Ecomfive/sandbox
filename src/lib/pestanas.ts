export interface Pestana {
  etiqueta: string;
  href: string;
  /** Las pestañas seguidas con el mismo grupo van juntas, separadas de las demás (como los grupos del menú). */
  grupo?: string;
}

/**
 * Pestañas de los módulos que tienen subpáginas (la franja de "vistas" de ClickUp). El nombre de cada
 * una es el título de su página. La primera es la página del módulo; las demás cuelgan de ella.
 */
export const PESTANAS_POR_MODULO: Record<string, Pestana[]> = {
  "/publicaciones-drop": [
    { etiqueta: "Publicaciones", href: "/publicaciones-drop" },
    { etiqueta: "Recomendaciones", href: "/publicaciones-drop/recomendaciones" },
    { etiqueta: "Tareas", href: "/publicaciones-drop/tareas" },
    { etiqueta: "Reglas", href: "/publicaciones-drop/reglas" },
  ],
  "/publicaciones-dropi": [
    { etiqueta: "Publicaciones", href: "/publicaciones-dropi" },
    { etiqueta: "Recomendaciones", href: "/publicaciones-dropi/recomendaciones" },
    { etiqueta: "Tareas", href: "/publicaciones-dropi/tareas" },
    { etiqueta: "Reglas", href: "/publicaciones-dropi/reglas" },
    { etiqueta: "Consumo de IA", href: "/publicaciones-dropi/consumo" },
    { etiqueta: "Uso del sistema", href: "/publicaciones-dropi/uso-sistema" },
  ],
  // Equipo › Tareas (9 nov 2026, pedido de Hernán): el tablero del equipo y «Mis tareas por módulo», las tareas abiertas de cada persona en cada módulo.
  "/tareas": [
    { etiqueta: "Tablero del equipo", href: "/tareas" },
    { etiqueta: "Mis tareas por módulo", href: "/tareas/por-modulo" },
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
  "/estado-resultados": [
    { etiqueta: "Estado de resultados", href: "/estado-resultados" },
    { etiqueta: "Precio de transferencia", href: "/estado-resultados/precio-transferencia" },
    { etiqueta: "Ajustes", href: "/estado-resultados/ajustes" },
    { etiqueta: "Tipos de cambio", href: "/estado-resultados/tipos-cambio" },
  ],
  "/rentabilidad": [
    // Resumen, unidad económica, inventario y compras, capital y palancas.
    { etiqueta: "Rentabilidad", href: "/rentabilidad" },
    { etiqueta: "Productos", href: "/rentabilidad/productos", grupo: "Unidad económica" },
    { etiqueta: "Pedidos", href: "/rentabilidad/pedidos", grupo: "Unidad económica" },
    { etiqueta: "Zonas y repartidores", href: "/rentabilidad/zonas", grupo: "Unidad económica" },
    { etiqueta: "Marketing", href: "/rentabilidad/marketing", grupo: "Unidad económica" },
    { etiqueta: "Equilibrio", href: "/rentabilidad/equilibrio", grupo: "Unidad económica" },
    { etiqueta: "Inventario", href: "/rentabilidad/inventario", grupo: "Inventario y compras" },
    { etiqueta: "Reorden", href: "/rentabilidad/reorden", grupo: "Inventario y compras" },
    { etiqueta: "Compras y costos", href: "/rentabilidad/compras", grupo: "Inventario y compras" },
    { etiqueta: "Plan de compras", href: "/rentabilidad/plan-compras", grupo: "Inventario y compras" },
    { etiqueta: "Capital de trabajo", href: "/rentabilidad/capital-trabajo", grupo: "Capital y valor" },
    { etiqueta: "Palancas de valor", href: "/rentabilidad/palancas", grupo: "Capital y valor" },
  ],
  "/cierre-mes": [
    { etiqueta: "Meses", href: "/cierre-mes" },
    { etiqueta: "Asientos de ajuste", href: "/cierre-mes/ajustes" },
    { etiqueta: "Gastos prepagados", href: "/cierre-mes/prepagos" },
    { etiqueta: "Calendario fiscal", href: "/cierre-mes/calendario-fiscal" },
    { etiqueta: "QuickBooks", href: "/cierre-mes/quickbooks" },
    { etiqueta: "Configuración", href: "/cierre-mes/configuracion" },
  ],
  "/panel-financiero": [
    { etiqueta: "Panel", href: "/panel-financiero" },
    { etiqueta: "Hoy", href: "/panel-financiero/hoy" },
    { etiqueta: "Tiendas y proveeduría", href: "/panel-financiero/canales" },
    { etiqueta: "Comité", href: "/panel-financiero/comite" },
    { etiqueta: "Informe mensual", href: "/panel-financiero/informe" },
    { etiqueta: "Paquete bancario", href: "/panel-financiero/paquete-bancario" },
    { etiqueta: "Envíos", href: "/panel-financiero/envios" },
    { etiqueta: "Versiones", href: "/panel-financiero/versiones" },
    { etiqueta: "Valoración", href: "/panel-financiero/valoracion" },
    { etiqueta: "Tareas programadas", href: "/panel-financiero/tareas" },
    { etiqueta: "Respaldos", href: "/panel-financiero/respaldos" },
    { etiqueta: "Estado del sistema", href: "/panel-financiero/estado-sistema" },
  ],
  "/conciliacion-bancaria": [
    { etiqueta: "Conciliación", href: "/conciliacion-bancaria" },
    { etiqueta: "Cobros", href: "/conciliacion-bancaria/cobros" },
    { etiqueta: "Importar", href: "/conciliacion-bancaria/importar" },
  ],
  "/deliverys": [
    { etiqueta: "Semana", href: "/deliverys" },
    { etiqueta: "Entregas", href: "/deliverys/entregas" },
    { etiqueta: "Cierres", href: "/deliverys/cierres" },
    { etiqueta: "Repartidores", href: "/deliverys/repartidores" },
    { etiqueta: "Monday", href: "/deliverys/monday" },
    { etiqueta: "Importar Excel", href: "/deliverys/importar" },
  ],
  "/clientes-marketing": [
    { etiqueta: "Resumen", href: "/clientes-marketing" },
    { etiqueta: "Cohortes", href: "/clientes-marketing/cohortes" },
    { etiqueta: "Marketing", href: "/clientes-marketing/marketing" },
  ],
  "/ventas-tiendas": [
    { etiqueta: "Resumen", href: "/ventas-tiendas" },
    { etiqueta: "Órdenes", href: "/ventas-tiendas/ordenes" },
    { etiqueta: "Pipeline", href: "/ventas-tiendas/pipeline" },
    { etiqueta: "Cuadre", href: "/ventas-tiendas/cuadre" },
    { etiqueta: "Importar Excel", href: "/ventas-tiendas/importar" },
  ],
  "/nomina": [
    { etiqueta: "Nómina", href: "/nomina" },
    { etiqueta: "Conciliación con el libro", href: "/nomina/conciliacion" },
    { etiqueta: "Importar Excel", href: "/nomina/importar" },
  ],
  "/cuentas-por-cobrar": [
    { etiqueta: "Cuentas por cobrar", href: "/cuentas-por-cobrar" },
    { etiqueta: "Importar Excel", href: "/cuentas-por-cobrar/importar" },
  ],
  "/cuentas-por-pagar": [
    { etiqueta: "Cuentas por pagar", href: "/cuentas-por-pagar" },
    { etiqueta: "Importar Excel", href: "/cuentas-por-pagar/importar" },
  ],
  "/capital-riesgo": [
    { etiqueta: "Riesgos", href: "/capital-riesgo" },
    { etiqueta: "Proyectos", href: "/capital-riesgo/proyectos" },
    { etiqueta: "Asignación de capital", href: "/capital-riesgo/asignacion" },
  ],
  "/tesoreria": [
    { etiqueta: "Posición", href: "/tesoreria" },
    { etiqueta: "Saldos bancarios", href: "/tesoreria/saldos" },
    { etiqueta: "Pagos", href: "/tesoreria/pagos" },
    { etiqueta: "Repartidores", href: "/tesoreria/repartidores" },
    { etiqueta: "Costos de cobro", href: "/tesoreria/comisiones" },
    { etiqueta: "Deuda", href: "/tesoreria/deuda" },
    { etiqueta: "Optimizar deuda", href: "/tesoreria/optimizar" },
    { etiqueta: "Refinanciamiento", href: "/tesoreria/refinanciamiento" },
    { etiqueta: "Covenants", href: "/tesoreria/covenants" },
    { etiqueta: "Capital para crecer", href: "/tesoreria/crecimiento" },
    { etiqueta: "Ajustes", href: "/tesoreria/ajustes" },
  ],
  "/planificacion": [
    { etiqueta: "Pronóstico", href: "/planificacion" },
    { etiqueta: "Motores", href: "/planificacion/motores" },
    { etiqueta: "Plan anual", href: "/planificacion/plan-anual" },
    { etiqueta: "18 meses", href: "/planificacion/18-meses" },
    { etiqueta: "Escenarios", href: "/planificacion/escenarios" },
    { etiqueta: "Metas", href: "/planificacion/metas" },
  ],
  "/proyeccion-caja": [
    { etiqueta: "Proyección", href: "/proyeccion-caja" },
    { etiqueta: "Precisión", href: "/proyeccion-caja/precision" },
  ],
  "/balance-general": [
    { etiqueta: "Balance", href: "/balance-general" },
    { etiqueta: "Partidas", href: "/balance-general/partidas" },
  ],
  "/flujo-caja": [
    { etiqueta: "Flujo", href: "/flujo-caja" },
    { etiqueta: "Saldos iniciales", href: "/flujo-caja/saldos" },
  ],
  "/utilidades": [
    { etiqueta: "Distribución", href: "/utilidades" },
    { etiqueta: "Participaciones", href: "/utilidades/participaciones" },
    { etiqueta: "Retiros", href: "/utilidades/retiros" },
  ],
  "/bienes-de-uso": [
    { etiqueta: "Bienes", href: "/bienes-de-uso" },
    { etiqueta: "Importar Excel", href: "/bienes-de-uso/importar" },
  ],
  "/costos-mercancia": [
    { etiqueta: "Productos", href: "/costos-mercancia" },
    { etiqueta: "Lotes", href: "/costos-mercancia/lotes" },
    { etiqueta: "Mapeo con Dropi", href: "/costos-mercancia/mapeo" },
    { etiqueta: "Importar Excel", href: "/costos-mercancia/importar" },
  ],
  "/libro-movimientos": [
    { etiqueta: "Movimientos", href: "/libro-movimientos" },
    { etiqueta: "Por clasificar", href: "/libro-movimientos/pendientes" },
    { etiqueta: "Reglas", href: "/libro-movimientos/reglas" },
    { etiqueta: "Revisar", href: "/libro-movimientos/revisar" },
    { etiqueta: "Proveedores", href: "/libro-movimientos/proveedores" },
    { etiqueta: "Salud de datos", href: "/libro-movimientos/salud" },
    { etiqueta: "Importar Excel", href: "/libro-movimientos/importar" },
  ],
  "/extractos": [
    { etiqueta: "Cargar extracto", href: "/extractos" },
    { etiqueta: "Diccionario de patrones bancarios", href: "/extractos/patrones" },
  ],
  "/crm-dropshippers": [
    { etiqueta: "Dropshippers", href: "/crm-dropshippers" },
    { etiqueta: "Bandeja de WhatsApp", href: "/crm-dropshippers/bandeja" },
    { etiqueta: "Tareas", href: "/crm-dropshippers/tareas" },
    { etiqueta: "Plantillas", href: "/crm-dropshippers/plantillas" },
    { etiqueta: "Borrados", href: "/crm-dropshippers/borrados" },
    { etiqueta: "Casos", href: "/crm-dropshippers/casos" },
    { etiqueta: "Motivos", href: "/crm-dropshippers/motivos" },
    { etiqueta: "Ranking", href: "/crm-dropshippers/ranking" },
    { etiqueta: "Vínculos", href: "/crm-dropshippers/vinculos" },
  ],
  "/inventario": [
    { etiqueta: "Stock", href: "/inventario" },
    { etiqueta: "Levantamiento", href: "/inventario/levantamiento" },
    { etiqueta: "Recepción", href: "/inventario/recepcion" },
    { etiqueta: "Cuadro", href: "/inventario/cuadro" },
    { etiqueta: "Novedades", href: "/inventario/novedades" },
    { etiqueta: "Traslados", href: "/inventario/traslados" },
    { etiqueta: "Remisiones", href: "/inventario/remisiones" },
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
  // Tu Winner (2 nov 2026, boceto aprobado): los ganadores, lo que se repite en varios canales, el seguimiento y cómo se lee.
  "/tu-winner": [
    { etiqueta: "Ganadores", href: "/tu-winner" },
    { etiqueta: "Se repite en varios canales", href: "/tu-winner/canales" },
    { etiqueta: "Seguimiento", href: "/tu-winner/seguimiento" },
    { etiqueta: "Cómo se actualiza", href: "/tu-winner/como" },
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
    { etiqueta: "Gestión por país", href: "/compras/por-pais" },
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

export interface GrupoPestanas {
  /** El nombre del grupo, o el de la pestaña si va sola. */
  etiqueta: string;
  /** A dónde lleva la pestaña del grupo: su primera página. */
  href: string;
  pestanas: Pestana[];
}

/**
 * Las pestañas juntadas por `grupo` (en el orden en que aparecen): una franja de grupos y, debajo, las páginas del grupo
 * elegido. Sin grupos, null (la franja de siempre).
 */
export function gruposDePestanas(pestanas: Pestana[]): GrupoPestanas[] | null {
  if (!pestanas.some((p) => p.grupo)) return null;
  const grupos: GrupoPestanas[] = [];
  for (const p of pestanas) {
    const ultimo = grupos[grupos.length - 1];
    if (p.grupo && ultimo && ultimo.etiqueta === p.grupo && ultimo.pestanas[0].grupo === p.grupo) ultimo.pestanas.push(p);
    else grupos.push({ etiqueta: p.grupo ?? p.etiqueta, href: p.href, pestanas: [p] });
  }
  return grupos;
}
