import { campoDeEtiqueta, campoOculto, vePagosProveedor, type RestriccionesCompras } from "@/app/(app)/compras/permisos-compras";
import { ACCIONES_COMERCIALES, accesoCrm, areasVisibles, type AreaCrm, type PermisosCrm } from "@/lib/crm/areas";
import { chatEnAlcance, permisosBandeja } from "@/lib/crm/permisos-bandeja";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { puedeVerPais } from "@/lib/paises-permitidos";
import type { Afinado } from "@/lib/permisos/afinado";

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
  fin_grupo_movimientos: "tesoreria",
  fin_grupo_partes: "tesoreria",
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
  dunamixfy_competencia_productos: "analisis-competencia",
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
  // Anuncios Meta (migración 0320): cuentas, campañas corregidas a mano, topes de CPA y decisiones sobre sugerencias.
  meta_cuentas: "anuncios-meta",
  meta_campanas: "anuncios-meta",
  meta_topes: "anuncios-meta",
  meta_decisiones: "anuncios-meta",
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

const cuantosDatos = (o: unknown) => (o && typeof o === "object" ? Object.keys(o as object).length : 0);

/**
 * Una línea de la auditoría de una compra como la puede ver la persona según lo afinado en Compras (auditoría de seguridad, 18 nov 2026).
 * La auditoría guarda los montos sin «$» («Monto Total: 1270 → 1100»), así que de antes/después se quita cada dato de un campo que no ve,
 * por su etiqueta (como hace la Actividad de la compra). Sin ver los pagos a Shen Zhen (`vePagosProveedor`), el pago de una llegada no dice
 * cuánto y no se ven los cambios del Registro de pagos. Sin el monto, del detalle se quita todo «$…» (`eventoSinMontos`). Null si no queda nada.
 */
export function eventoCompraParaRol<T extends { accion: string; detalle?: string | null; antes?: unknown; despues?: unknown }>(evento: T, r: RestriccionesCompras): T | null {
  if (r.ocultos.length === 0) return evento;
  const sinMonto = campoOculto(r, "monto");
  const vePagos = vePagosProveedor(r);
  if (!vePagos && (evento.detalle ?? "").includes("cambió en el Registro de pagos")) return null;
  if (evento.accion === "renombrar_tienda" && campoOculto(r, "tienda")) return null;
  const pagoSinVer = evento.accion === "registrar_pago_llegada" && !vePagos;
  const quitar = (etiqueta: string) => {
    const campo = campoDeEtiqueta(etiqueta);
    return (!!campo && campoOculto(r, campo)) || (pagoSinVer && etiqueta === "Pagado a Proveedor");
  };
  const limpiar = (o: unknown) =>
    o && typeof o === "object" && !Array.isArray(o) ? Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k]) => !quitar(k))) : o;
  const antes = limpiar(evento.antes);
  const despues = limpiar(evento.despues);
  if (cuantosDatos(evento.antes) + cuantosDatos(evento.despues) > 0 && cuantosDatos(antes) + cuantosDatos(despues) === 0) return null;
  const detalle = pagoSinVer ? "Segundo pago registrado; la compra pasó a Completado" : evento.detalle;
  const limpio = { ...evento, detalle, antes, despues };
  return sinMonto ? eventoSinMontos(limpio) : limpio;
}

/** Las entidades de finanzas y tiendas: con tiendas limitadas se parten por tienda (`eventoDeTiendaVisible`). */
const PREFIJOS_POR_TIENDA = ["fin_", "ven_", "del_", "mkt_", "conc_", "nom_", "qbo_", "mon_", "cli_"];

/**
 * Con tiendas limitadas (`perfiles.tiendas_permitidas`), una línea de finanzas o de una tienda solo se ve si es de una tienda suya
 * (`unidadDe` da la tienda del registro: null si es de toda la empresa, undefined si no se sabe). Lo de toda la empresa o de tienda
 * desconocida no se ve, como en sus módulos (auditoría de seguridad, 18 nov 2026). Sin límite, todo.
 */
export function eventoDeTiendaVisible(
  evento: { entidad: string; entidad_id: string | null },
  permitidas: string[] | null,
  unidadDe: (entidad: string, id: string | null) => string | null | undefined,
): boolean {
  if (permitidas === null) return true;
  if (!PREFIJOS_POR_TIENDA.some((p) => evento.entidad.startsWith(p))) return true;
  const unidad = unidadDe(evento.entidad, evento.entidad_id);
  return unidad !== undefined && puedeVerUnidad(permitidas, unidad);
}

/** Lo que hace Dirección del CRM sobre un dropshipper (atender una alerta, una tarea desde su panel): solo lo ve Dirección. */
const ACCIONES_DIRECCION = new Set(["crm_alerta_atendida", "crear_tarea_crm"]);

/** Si la persona ve todos los chats del CRM (las tres áreas y sin «los suyos y los libres»): entonces no hace falta mirar cada chat. */
export function veTodosLosChats(usuario: PermisosCrm & { afinado?: Record<string, Afinado> }): boolean {
  return areasVisibles(accesoCrm(usuario)).length === 3 && permisosBandeja(usuario).alcance === "todas";
}

/**
 * Si una línea del CRM se puede mostrar a esta persona como en el propio CRM (auditoría de seguridad, 18 nov 2026): la de un chat, solo si
 * el chat es de un área suya y entra en su alcance («los suyos y los libres»); `chatDe` da su área y a quién está asignado (undefined si no
 * se sabe: no se muestra). Una línea de varios chats (sin id) solo la ve quien ve todas las áreas y todos los chats. Lo de Dirección sobre un
 * dropshipper, solo Dirección. El resto, igual que antes.
 */
export function eventoCrmVisible(
  evento: { accion: string; entidad: string; entidad_id: string | null },
  usuario: PermisosCrm & { id: string; afinado?: Record<string, Afinado> },
  chatDe: (id: string) => { area: AreaCrm; asignadaA: string | null } | undefined,
): boolean {
  const acceso = accesoCrm(usuario);
  if (evento.entidad === "dropshippers" && ACCIONES_DIRECCION.has(evento.accion)) return acceso.direccion;
  if (evento.entidad !== "whatsapp_conversaciones" || veTodosLosChats(usuario)) return true;
  if (!evento.entidad_id) return false;
  const areas = areasVisibles(acceso);
  const alcance = permisosBandeja(usuario).alcance;
  const chat = chatDe(evento.entidad_id);
  return !!chat && areas.includes(chat.area) && chatEnAlcance(alcance, chat.asignadaA, usuario.id);
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
