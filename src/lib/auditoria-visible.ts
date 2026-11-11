import { ACCIONES_COMERCIALES } from "@/lib/crm/areas";
import { puedeVerPais } from "@/lib/paises-permitidos";

/**
 * De qué módulo es cada `entidad` de `historial_auditoria`: un evento solo se muestra en la bitácora del Centro de
 * notificaciones a quien puede abrir ese módulo (antes la bitácora mostraba los 200 últimos de todos los módulos a
 * cualquiera con «notificaciones»). Una entidad que no esté aquí solo la ve quien tiene Usuarios y roles, que ya tiene el
 * historial completo en /usuarios/auditoria.
 */
export const MODULO_DE_ENTIDAD: Record<string, string> = {
  fin_movimientos: "libro-movimientos",
  fin_costos_lotes: "costos-mercancia",
  fin_bienes_uso: "bienes-de-uso",
  fin_config: "estado-resultados",
  mkt_meta_campanas: "rentabilidad",
  mkt_meta_reglas: "rentabilidad",
  fin_notas_mes: "estado-resultados",
  fin_unidades: "estado-resultados",
  fin_tipos: "estado-resultados",
  fin_balance_partidas: "balance-general",
  fin_inventario_cortes: "balance-general",
  fin_compras_gastos: "rentabilidad",
  fin_compras_presupuesto: "rentabilidad",
  fin_plan_compras_producto: "rentabilidad",
  fin_riesgos: "capital-riesgo",
  fin_proyectos: "capital-riesgo",
  wms_stock: "inventario",
  fin_tareas_ejecuciones: "usuarios",
  fin_alertas: "usuarios",
  fin_comentarios: "panel-financiero",
  fin_comite_acta: "panel-financiero",
  fin_informes_envios: "panel-financiero",
  fin_informes_versiones: "panel-financiero",
  fin_paquetes_bancarios: "panel-financiero",
  fin_informes_explicacion: "panel-financiero",
  fin_respaldos: "usuarios",
  fin_tipos_cambio_mes: "estado-resultados",
  fin_precio_transferencia_reglas: "estado-resultados",
  fin_cierres: "cierre-mes",
  // QuickBooks y Monday (migraciones 0950 y 0951).
  qbo_conexion: "usuarios",
  qbo_mapeo: "cierre-mes",
  mon_config: "deliverys",
  mon_causas: "deliverys",
  fin_ajustes_cierre: "cierre-mes",
  fin_prepagos: "cierre-mes",
  fin_obligaciones_fiscales: "cierre-mes",
  // Provisiones calculadas con los salarios: solo quien ve la nómina.
  fin_provision_nomina: "nomina",
  fin_presupuestos: "presupuesto",
  fin_plan_motores: "planificacion",
  fin_plan_versiones: "planificacion",
  fin_plan_fotos: "planificacion",
  fin_plan_escenarios: "planificacion",
  ven_ordenes: "ventas-tiendas",
  cli_clientes: "clientes-marketing",
  del_entregas: "deliverys",
  conc_lineas: "conciliacion-bancaria",
  del_cierres: "deliverys",
  del_repartidores: "deliverys",
  fin_base_distribucion: "ventas-tiendas",
  fin_cartera_cobrar: "cuentas-por-cobrar",
  fin_cartera_pagar: "cuentas-por-pagar",
  nom_lineas: "nomina",
  nom_personas: "nomina",
  nom_periodos: "nomina",
  fin_saldos_iniciales: "flujo-caja",
  fin_proyeccion_ajustes: "proyeccion-caja",
  fin_proyeccion_supuestos: "proyeccion-caja",
  fin_saldos_bancarios: "tesoreria",
  fin_tesoreria_config: "tesoreria",
  fin_pago_prioridades: "tesoreria",
  fin_pagos_programados: "tesoreria",
  fin_lineas_credito: "tesoreria",
  fin_prestamos: "tesoreria",
  fin_financiamientos_ciclo: "tesoreria",
  fin_ofertas_refinanciamiento: "tesoreria",
  fin_covenants: "tesoreria",
  fin_participaciones: "utilidades",
  fin_retiros_socio: "utilidades",
  puestos: "puestos",
  compras_alertas_sin_stock: "compras",
  skus_maestros: "producto",
  competencia_productos: "analisis-competencia",
  drop_competencia_productos: "analisis-competencia",
  effi_competencia_productos: "analisis-competencia",
  dropshippers: "crm-dropshippers",
  whatsapp_conversaciones: "crm-dropshippers",
  crm_plataformas_venta: "crm-dropshippers",
  whatsapp_plantillas: "crm-dropshippers",
  whatsapp_respuestas_rapidas: "crm-dropshippers",
  wms_compras: "compras",
  wms_rutas_envio: "compras",
  retiros: "retiros",
  cuentas_retiro: "retiros",
  saldos_wallet: "retiros",
  perfiles: "usuarios",
  manuales_proceso: "usuarios",
  wms_productos: "wms-productos",
  wms_dropi_productos: "wms-productos-dropi",
  wms_ubicaciones: "wms-ubicaciones",
  wms_bodegas: "wms-bodegas",
  wms_productos_test: "productos-test",
  wms_filtro_productos: "filtro-productos",
  scraping_proveedores: "scraping-proveedores",
  wms_seleccion_productos: "seleccion-productos",
  landings: "generador-landings",
  dropi_publicaciones: "publicaciones-dropi",
  effi_publicaciones: "publicaciones-effi",
  dunamixfy_publicaciones: "publicaciones-dunamixfy",
  dropi_publicaciones_reglas: "publicaciones-dropi",
  instagram_capturas: "instagram",
  alertas_inventario_no_retornado: "alertas",
  productos: "productos",
  paises: "configuracion",
  plataformas: "configuracion",
  pais_plataformas: "configuracion",
  tareas_equipo: "tareas",
  crm_tipo_cliente_umbrales: "configuracion",
};

const COMERCIALES = new Set<string>(ACCIONES_COMERCIALES);

/**
 * Acciones de un producto (`skus_maestros`, que no tiene país) que sí son de un país: la orden de compra creada al pasarlo a
 * Activo y un movimiento de inventario. Su país va al final del detalle («… · Panamá») y se lee con `paisEnDetalle`.
 */
export const ACCIONES_PRODUCTO_CON_PAIS = new Set(["crear_compra", "movimiento_inventario", "envio_dropi_inventario", "envio_dropi_recibido", "competencia_no_es_el_mismo", "competencia_es_el_mismo", "competencia_volver_a_contar"]);

/** El código del país nombrado en el detalle como « · <Nombre>», o undefined si no nombra ninguno. */
export function paisEnDetalle(detalle: string | null | undefined, paises: { codigo: string; nombre: string }[]): string | undefined {
  if (!detalle) return undefined;
  // Solo cuenta el último « · »: antes puede haber texto libre (referencia, lote) que nombre otro país a propósito.
  const i = detalle.lastIndexOf(" · ");
  if (i < 0) return undefined;
  const final = detalle.slice(i + 3);
  // «Panamá» (movimiento) o «Panamá (al pasar a Activo)» (orden de compra), nada más.
  return paises.find((p) => final === p.nombre || final === `${p.nombre} (al pasar a Activo)`)?.codigo;
}

/**
 * Las entidades cuyo país se conoce por su id (`paisDe`): compras y rutas de envío, y desde la auditoría del 27 oct 2026 también
 * landings, publicaciones de Dropi, fichas WMS y bodegas, que en su módulo ya se limitan por país.
 */
export const ENTIDADES_CON_PAIS = new Set(["wms_compras", "wms_rutas_envio", "landings", "dropi_publicaciones", "wms_productos", "wms_dropi_productos", "wms_bodegas"]);

const MONTO = /\$\s?[\d.,]+/;

/**
 * Un evento de una compra sin sus montos, para quien tiene «Monto» oculto en Compras (auditoría del 27 oct 2026): del detalle se quita
 * lo que lleva «$…» y de antes/después los datos con un monto. Null si era un cambio de montos y no queda nada que mostrar.
 */
export function eventoSinMontos<T extends { detalle?: string | null; antes?: unknown; despues?: unknown }>(evento: T): T | null {
  const limpiar = (o: unknown) =>
    o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([, v]) => !MONTO.test(String(v ?? "")))) : o;
  const cuantos = (o: unknown) => (o && typeof o === "object" ? Object.keys(o as object).length : 0);
  const antes = limpiar(evento.antes);
  const despues = limpiar(evento.despues);
  if (cuantos(evento.antes) + cuantos(evento.despues) > 0 && cuantos(antes) + cuantos(despues) === 0) return null;
  const detalle = evento.detalle ? evento.detalle.replace(/ · [^·→]*\$\s?[\d.,]+/g, "").replace(/\$\s?[\d.,]+/g, "$…") : evento.detalle;
  return { ...evento, detalle, antes, despues };
}

/**
 * Si un evento de la auditoría se puede mostrar a esta persona: necesita el módulo de su entidad; las acciones del CRM
 * Comercial piden además «crm-comercial»; y una compra (o ruta de envío) de un país que la persona no puede ver queda fuera
 * (`paisDe` da el código de país de la compra o ruta, o `null` si es de Importadora; `undefined` si no se sabe).
 */
export function eventoVisible(
  evento: { accion: string; entidad: string; entidad_id: string | null; detalle?: string | null },
  usuario: { modulos: string[]; paisesPermitidos: string[] | null },
  paisDe: (entidad: string, id: string | null) => string | null | undefined,
  paises: { codigo: string; nombre: string }[] = [],
): boolean {
  const modulo = MODULO_DE_ENTIDAD[evento.entidad] ?? "usuarios";
  if (!usuario.modulos.includes(modulo)) return false;
  if (COMERCIALES.has(evento.accion) && !usuario.modulos.includes("crm-comercial")) return false;
  if (usuario.paisesPermitidos !== null && ENTIDADES_CON_PAIS.has(evento.entidad)) {
    const pais = paisDe(evento.entidad, evento.entidad_id);
    // Sin saber el país (la compra se borró, por ejemplo) no se arriesga: se oculta.
    if (pais === undefined || !puedeVerPais(usuario.paisesPermitidos, pais)) return false;
  }
  // Los productos de la competencia (8 nov 2026, «Es el mismo» / «No es el mismo») también llevan su país al final del detalle.
  if (usuario.paisesPermitidos !== null && ((evento.entidad === "skus_maestros" && ACCIONES_PRODUCTO_CON_PAIS.has(evento.accion)) || MODULO_DE_ENTIDAD[evento.entidad] === "analisis-competencia")) {
    const pais = paisEnDetalle(evento.detalle, paises);
    if (pais === undefined || !puedeVerPais(usuario.paisesPermitidos, pais)) return false;
  }
  return true;
}
