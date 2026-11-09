// Portal AF4 360° › Panel › Estado del sistema (mejora 8). Lógica pura: qué variables de entorno necesita el portal (se
// informa solo si están, nunca su valor), qué tabla prueba que cada migración se corrió, cuándo una tarea programada está
// atrasada y a qué sección del manual de operación lleva cada problema. Prueba en `estado-sistema.test.ts`.

import type { DefTareaProgramada } from "@/lib/tareas/definiciones";

/** La clave de la guía «Operación y contingencia» del Centro de ayuda (`/ayuda/guias/<clave>`). */
export const CLAVE_GUIA_OPERACION = "operacion-contingencia";

/** Las secciones del manual a las que enlaza la página (por título, para no depender del orden). */
export const SECCION_MANUAL = {
  rutina: "Rutina diaria, semanal y mensual",
  importar: "Importar un Excel y qué hacer si falla o duplica",
  tareas: "Si una tarea programada falla",
  conexiones: "Si una conexión externa falla",
  quickbooks: "QuickBooks Online",
  monday: "Monday.com",
  reabrir: "Reabrir un mes cerrado",
  respaldos: "Respaldos y cómo recuperar",
  accesos: "Accesos y segundo administrador",
  migraciones: "Migraciones sin correr",
  escalar: "A quién escalar",
} as const;

/** El enlace a una sección del manual: `#seccion-N` según su orden en la guía (sin ella, la guía). */
export function enlaceManual(secciones: { titulo: string }[], titulo: string): string {
  const i = secciones.findIndex((s) => s.titulo === titulo);
  return `/ayuda/guias/${CLAVE_GUIA_OPERACION}${i >= 0 ? `#seccion-${i}` : ""}`;
}

export interface VariableEntorno {
  nombre: string;
  para: string;
  obligatoria: boolean;
  seccion: keyof typeof SECCION_MANUAL;
}

/** Las variables de servidor que usa el portal financiero. */
export const VARIABLES_ENTORNO: VariableEntorno[] = [
  { nombre: "NEXT_PUBLIC_SUPABASE_URL", para: "Base de datos", obligatoria: true, seccion: "conexiones" },
  { nombre: "NEXT_PUBLIC_SUPABASE_ANON_KEY", para: "Inicio de sesión", obligatoria: true, seccion: "conexiones" },
  { nombre: "SUPABASE_SERVICE_ROLE_KEY", para: "Lectura y escritura del servidor", obligatoria: true, seccion: "conexiones" },
  { nombre: "CRON_SECRET", para: "Tareas programadas", obligatoria: true, seccion: "tareas" },
  { nombre: "RECIBO_EMPRESA_NOMBRE", para: "Recibos y paquete bancario", obligatoria: false, seccion: "conexiones" },
  { nombre: "RECIBO_EMPRESA_RUC", para: "Recibos y paquete bancario", obligatoria: false, seccion: "conexiones" },
  { nombre: "PORTAL_URL", para: "Enlaces de los correos", obligatoria: false, seccion: "conexiones" },
  { nombre: "RESEND_API_KEY", para: "Correo del informe mensual y avisos", obligatoria: false, seccion: "conexiones" },
  { nombre: "RESEND_FROM", para: "Remitente de los correos", obligatoria: false, seccion: "conexiones" },
  { nombre: "ANTHROPIC_API_KEY", para: "Explicación del informe y «Leer factura»", obligatoria: false, seccion: "conexiones" },
  { nombre: "WHATSAPP_API_URL", para: "Resumen semanal por WhatsApp", obligatoria: false, seccion: "conexiones" },
  { nombre: "WHATSAPP_API_TOKEN", para: "Resumen semanal por WhatsApp", obligatoria: false, seccion: "conexiones" },
  { nombre: "WHATSAPP_INSTANCIA", para: "Resumen semanal por WhatsApp", obligatoria: false, seccion: "conexiones" },
  { nombre: "SHOPIFY_TIENDAS", para: "Órdenes de Shopify", obligatoria: false, seccion: "conexiones" },
  { nombre: "QBO_CLIENT_ID", para: "QuickBooks Online", obligatoria: false, seccion: "quickbooks" },
  { nombre: "QBO_CLIENT_SECRET", para: "QuickBooks Online", obligatoria: false, seccion: "quickbooks" },
  { nombre: "QBO_REDIRECT_URI", para: "QuickBooks Online (retorno de la autorización)", obligatoria: false, seccion: "quickbooks" },
  { nombre: "QBO_ENTORNO", para: "QuickBooks Online (sandbox o production)", obligatoria: false, seccion: "quickbooks" },
  { nombre: "QBO_TOKEN_KEY", para: "Cifrado de los tokens de QuickBooks", obligatoria: false, seccion: "quickbooks" },
  { nombre: "MONDAY_API_TOKEN", para: "Despachos de Monday.com", obligatoria: false, seccion: "monday" },
];

/** Si cada variable está configurada (no vacía). Nunca devuelve el valor. */
export function estadoVariables(env: Record<string, string | undefined>, lista = VARIABLES_ENTORNO): (VariableEntorno & { configurada: boolean })[] {
  return lista.map((v) => ({ ...v, configurada: typeof env[v.nombre] === "string" && env[v.nombre]!.trim().length > 0 }));
}

/**
 * Cómo se comprueba que una migración se corrió: su tabla o vista, una columna que agrega, una función, un tipo nuevo en
 * un `check` o un permiso que da. Sin la 0954 (`fin_estado_migraciones`) solo se pueden comprobar tablas, vistas y
 * columnas (con una lectura); lo demás queda «sin comprobar».
 */
export type PruebaMigracion =
  | { tipo: "tabla" | "vista"; nombre: string }
  | { tipo: "columna"; nombre: string; columna: string }
  | { tipo: "funcion"; nombre: string }
  | { tipo: "check"; nombre: string; valor: string }
  | { tipo: "permiso"; nombre: string };

/** Todas las migraciones del portal (0900 en adelante, una por archivo de `supabase/migrations/`). */
export const MIGRACIONES_CLAVE: { migracion: string; que: string; prueba: PruebaMigracion }[] = [
  { migracion: "0900", que: "Vistas del Portal AF4", prueba: { tipo: "vista", nombre: "af4_pyl_mensual" } },
  { migracion: "0901", que: "Libro de movimientos", prueba: { tipo: "tabla", nombre: "fin_movimientos" } },
  { migracion: "0902", que: "Permiso del libro", prueba: { tipo: "permiso", nombre: "libro-movimientos" } },
  { migracion: "0903", que: "Clasificación", prueba: { tipo: "tabla", nombre: "fin_reglas" } },
  { migracion: "0904", que: "Flujo de caja y utilidades", prueba: { tipo: "tabla", nombre: "fin_socios" } },
  { migracion: "0905", que: "Cuentas por cobrar y por pagar", prueba: { tipo: "tabla", nombre: "fin_cartera" } },
  { migracion: "0906", que: "Nómina", prueba: { tipo: "tabla", nombre: "nom_personas" } },
  { migracion: "0907", que: "Bienes de uso", prueba: { tipo: "tabla", nombre: "fin_bienes_uso" } },
  { migracion: "0908", que: "Costos de mercancía", prueba: { tipo: "tabla", nombre: "fin_costos_lotes" } },
  { migracion: "0909", que: "Ventas por tienda", prueba: { tipo: "tabla", nombre: "ven_ordenes" } },
  { migracion: "0910", que: "Conciliación bancaria", prueba: { tipo: "tabla", nombre: "conc_extractos" } },
  { migracion: "0911", que: "Deliverys", prueba: { tipo: "tabla", nombre: "del_repartidores" } },
  { migracion: "0912", que: "Permiso del panel financiero", prueba: { tipo: "permiso", nombre: "panel-financiero" } },
  { migracion: "0913", que: "Presupuesto", prueba: { tipo: "tabla", nombre: "fin_presupuestos" } },
  { migracion: "0914", que: "Cierre de mes", prueba: { tipo: "tabla", nombre: "fin_cierres" } },
  { migracion: "0915", que: "Rentabilidad", prueba: { tipo: "funcion", nombre: "fin_capital_trabajo_al" } },
  { migracion: "0916", que: "Conciliación v2", prueba: { tipo: "columna", nombre: "conc_pares", columna: "del_semana" } },
  { migracion: "0917", que: "Interruptores del libro", prueba: { tipo: "columna", nombre: "fin_movimientos", columna: "reemplazado_en" } },
  { migracion: "0918", que: "Proyección de caja", prueba: { tipo: "tabla", nombre: "fin_proyeccion_ajustes" } },
  { migracion: "0919", que: "Valoración y tipos de presupuesto", prueba: { tipo: "funcion", nombre: "fin_presupuesto_tipo_de_seccion" } },
  { migracion: "0920", que: "Clientes y marketing", prueba: { tipo: "tabla", nombre: "cli_clientes" } },
  { migracion: "0921", que: "Tareas programadas", prueba: { tipo: "tabla", nombre: "fin_tareas_ejecuciones" } },
  { migracion: "0923", que: "Entidades y multimoneda", prueba: { tipo: "tabla", nombre: "fin_entidades" } },
  { migracion: "0924", que: "Fotos de la proyección", prueba: { tipo: "columna", nombre: "fin_proyeccion_fotos", columna: "saldo_minimo" } },
  { migracion: "0925", que: "Historial de importaciones", prueba: { tipo: "tabla", nombre: "fin_importaciones" } },
  { migracion: "0927", que: "Control del cierre", prueba: { tipo: "tabla", nombre: "fin_cierre_reaperturas" } },
  { migracion: "0928", que: "Calendario fiscal", prueba: { tipo: "tabla", nombre: "fin_obligaciones_fiscales" } },
  { migracion: "0929", que: "Estados financieros y notas", prueba: { tipo: "tabla", nombre: "fin_notas_mes" } },
  { migracion: "0930", que: "Balance general", prueba: { tipo: "tabla", nombre: "fin_balance_partidas" } },
  { migracion: "0931", que: "Tesorería", prueba: { tipo: "tabla", nombre: "fin_saldos_bancarios" } },
  { migracion: "0932", que: "Deuda", prueba: { tipo: "tabla", nombre: "fin_prestamos" } },
  { migracion: "0933", que: "Unidad económica", prueba: { tipo: "tabla", nombre: "mkt_meta_reglas" } },
  { migracion: "0934", que: "Funciones de unidad económica", prueba: { tipo: "funcion", nombre: "fin_ue_lineas" } },
  { migracion: "0935", que: "Compras y costos", prueba: { tipo: "tabla", nombre: "fin_compras_gastos" } },
  { migracion: "0937", que: "Reportes, envíos y respaldos", prueba: { tipo: "tabla", nombre: "fin_respaldos" } },
  { migracion: "0938", que: "Dropi al portal", prueba: { tipo: "tabla", nombre: "fin_dropi_mensual" } },
  { migracion: "0939", que: "Alertas de tesorería", prueba: { tipo: "check", nombre: "fin_alertas_tipo_check", valor: "tesoreria_pagos" } },
  { migracion: "0940", que: "Paquete bancario", prueba: { tipo: "tabla", nombre: "fin_paquetes_bancarios" } },
  { migracion: "0942", que: "Comité de dirección", prueba: { tipo: "tabla", nombre: "fin_comite_acta" } },
  { migracion: "0943", que: "Alerta de techo de pauta", prueba: { tipo: "check", nombre: "fin_alertas_tipo_check", valor: "pauta_techo" } },
  { migracion: "0944", que: "Planificación", prueba: { tipo: "tabla", nombre: "fin_plan_versiones" } },
  { migracion: "0945", que: "Funciones de planificación", prueba: { tipo: "funcion", nombre: "fin_plan_historia" } },
  { migracion: "0946", que: "Optimizar deuda, refinanciamiento y covenants", prueba: { tipo: "tabla", nombre: "fin_covenants" } },
  { migracion: "0947", que: "Alerta de covenants", prueba: { tipo: "check", nombre: "fin_alertas_tipo_check", valor: "tesoreria_covenant" } },
  { migracion: "0948", que: "Plan de compras y matriz de riesgos", prueba: { tipo: "tabla", nombre: "fin_riesgos" } },
  { migracion: "0949", que: "Evaluación de proyectos", prueba: { tipo: "tabla", nombre: "fin_proyectos" } },
  { migracion: "0950", que: "QuickBooks Online", prueba: { tipo: "tabla", nombre: "qbo_conexion" } },
  { migracion: "0951", que: "Monday.com", prueba: { tipo: "tabla", nombre: "mon_config" } },
  { migracion: "0952", que: "Precio de transferencia", prueba: { tipo: "tabla", nombre: "fin_precio_transferencia_reglas" } },
  { migracion: "0953", que: "Deshacer en todos los importadores", prueba: { tipo: "columna", nombre: "ven_ordenes", columna: "importacion_id" } },
  { migracion: "0954", que: "Plan de compras con el pronóstico y estado de las migraciones", prueba: { tipo: "funcion", nombre: "fin_estado_migraciones" } },
  { migracion: "0955", que: "Entidad México (MXN)", prueba: { tipo: "tabla", nombre: "fin_entidades" } },
  { migracion: "0956", que: "Ciclo de la orden de Shopify, plata contra entrega y conexión de tiendas", prueba: { tipo: "funcion", nombre: "ven_registrar_remesa" } },
  { migracion: "0957", que: "Pipeline de Shopify: contactos, notas, cobertura, remesas anulables, incidencias y cierre de mes", prueba: { tipo: "funcion", nombre: "ven_anular_remesa" } },
  { migracion: "0958", que: "WhatsApp de los pedidos de Shopify (Chatmaid)", prueba: { tipo: "tabla", nombre: "ven_whatsapp_mensajes" } },
  { migracion: "0959", que: "Webhooks de Shopify y salud de la conexión de cada tienda", prueba: { tipo: "tabla", nombre: "ven_shopify_webhooks" } },
  { migracion: "0960", que: "Comprobantes de entrega y de cobro de las órdenes de Shopify", prueba: { tipo: "tabla", nombre: "ven_orden_comprobantes" } },
  { migracion: "0961", que: "Enlace propio de cada mensajero para su web app", prueba: { tipo: "tabla", nombre: "ven_mensajero_enlaces" } },
  { migracion: "0962", que: "Tiendas al portal financiero: ventas por mes y efectivo contra entrega por cobrar", prueba: { tipo: "tabla", nombre: "fin_tiendas_mensual" } },
  { migracion: "0963", que: "La remesa contra entrega llega al libro de movimientos y al banco", prueba: { tipo: "funcion", nombre: "ven_remesa_al_libro" } },
  { migracion: "0964", que: "El EERR por canal se alimenta con las órdenes de Shopify", prueba: { tipo: "funcion", nombre: "fin_ingresos_desde_ordenes" } },
  { migracion: "0965", que: "Clientes de fulfillment (Clicksi): sus órdenes no son ventas nuestras", prueba: { tipo: "columna", nombre: "fin_unidades", columna: "cliente_fulfillment" } },
  { migracion: "0966", que: "Clicksi: tarifa de fulfillment por cobrar y su efectivo por remitir", prueba: { tipo: "funcion", nombre: "fin_sincronizar_fulfillment" } },
  { migracion: "0967", que: "El costo de las órdenes de Shopify entra al EERR por canal", prueba: { tipo: "funcion", nombre: "fin_costos_desde_ordenes" } },
  { migracion: "0968", que: "Etiquetas y franja horaria de las órdenes de tienda", prueba: { tipo: "columna", nombre: "ven_ordenes", columna: "franja" } },
  { migracion: "0969", que: "Tiempo de carga de cada página", prueba: { tipo: "tabla", nombre: "app_metricas" } },
];

/** Lo que se muestra de una prueba («Falta …»). */
export function describirPrueba(p: PruebaMigracion): string {
  if (p.tipo === "columna") return `${p.nombre}.${p.columna}`;
  if (p.tipo === "check") return `«${p.valor}» en ${p.nombre}`;
  if (p.tipo === "permiso") return `permiso ${p.nombre}`;
  if (p.tipo === "funcion") return `${p.nombre}()`;
  return p.nombre;
}

/** Lo que se le manda a `fin_estado_migraciones` (jsonb): una fila por migración. */
export const pruebasParaSql = (lista = MIGRACIONES_CLAVE) =>
  lista.map((m) => ({ migracion: m.migracion, tipo: m.prueba.tipo, nombre: m.prueba.nombre, extra: "columna" in m.prueba ? m.prueba.columna : "valor" in m.prueba ? m.prueba.valor : null }));

export type EstadoTarea = "ok" | "error" | "atrasada" | "corriendo" | "nunca";

/** Horas que pueden pasar entre dos ejecuciones antes de decir que una tarea está atrasada (con margen). */
export function horasEsperadas(t: Pick<DefTareaProgramada, "dias" | "diaMes">): number {
  if (t.diaMes) return 32 * 24;
  if (t.dias.length) return Math.ceil((7 / t.dias.length) * 24) + 12;
  return 26;
}

/** El estado de una tarea según su última ejecución y la hora de ahora. */
export function estadoTarea(
  t: Pick<DefTareaProgramada, "dias" | "diaMes">,
  ultima: { inicio: string; fin: string | null; ok: boolean | null } | null,
  ahora: Date,
): EstadoTarea {
  if (!ultima) return "nunca";
  const horas = (ahora.getTime() - Date.parse(ultima.inicio)) / 3_600_000;
  if (!ultima.fin) return horas > 2 ? "error" : "corriendo";
  if (ultima.ok === false) return "error";
  return horas > horasEsperadas(t) ? "atrasada" : "ok";
}

/** Días desde un instante (redondeado hacia abajo); null sin fecha. */
export function diasDesde(iso: string | null | undefined, ahora: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((ahora.getTime() - t) / 86_400_000));
}

/** La última fila por clave (las filas vienen de la más nueva a la más vieja). */
export function ultimaPor<T>(filas: T[], clave: (f: T) => string): Map<string, T> {
  const m = new Map<string, T>();
  for (const f of filas) if (!m.has(clave(f))) m.set(clave(f), f);
  return m;
}
