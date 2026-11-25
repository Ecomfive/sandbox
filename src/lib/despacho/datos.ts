// Gestión de tienda › Envíos Delivery y Devoluciones (migración 0970): lo que leen sus páginas de `mon_despachos`, la misma tabla que llenaba Monday y
// que leen las entregas de los pedidos, Logística y la ficha del pedido. Las etiquetas se muestran limpias (`etiquetaLimpia`) y un pedido que está en el
// consolidado y en el tablero del repartidor sale una sola vez (`sinDuplicados`).

import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { SIN_TIENDA } from "@/lib/finanzas/tiendas-permitidas";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { etiquetaLimpia, grupoDevolucion, sinDuplicados } from "./etiquetas";

export type Clase = "ciudad" | "devolucion";

export interface FilaTablero {
  itemId: string;
  tableroId: string;
  origen: "monday" | "sistema";
  editadoEn: string | null;
  actualizado: string | null;
  nombre: string | null;
  numero: string | null;
  ordenId: string | null;
  tienda: string | null;
  courier: string | null;
  estado: string | null;
  edoPago: string | null;
  formaPago: string | null;
  porCobrar: number | null;
  cobrado: number | null;
  costeEnvio: number | null;
  turno: string | null;
  comentario: string | null;
  comprobantes: number;
  /** Los comprobantes tal como están guardados (enlace de Monday o `storage:<ruta>`), para verlos en el sistema. */
  archivos: string[];
  estadoAsesores: string | null;
  obsAsesores: string | null;
  /** El día (ciudad, AAAA-MM-DD) o el grupo (devoluciones). */
  dia: string | null;
  /** Si el repartidor la marcó desde su panel (24 nov 2026, migración 0362) y cuándo. */
  desdePanel: boolean;
  marcadoEn: string | null;
  grupo: string;
  posicion: number;
}

export const COLUMNAS_DESPACHO =
  "item_id, tablero_id, origen, editado_en, actualizado_monday, nombre, numero_pedido, orden_id, tienda_texto, courier, estado, edo_pago, forma_pago, por_cobrar, monto_cobrado, coste_envio, turno, comentario, comprobantes, estado_asesores, observaciones_asesores, fecha_despacho, grupo, posicion";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

/** Las columnas del panel del repartidor (migración 0362); sin la migración, la consulta va sin ellas. */
export const COLUMNAS_PANEL = ", marcado_desde, marcado_en";

/** Si ya está la migración 0362 (lo marcado desde el panel del repartidor). */
export async function hayPanelRepartidor(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("mon_despachos").select("marcado_desde").limit(1);
  return !error;
}

export function aFila(r: Record<string, unknown>, clase: Clase): FilaTablero {
  const dia = (r.fecha_despacho as string | null) ?? null;
  return {
    itemId: String(r.item_id),
    tableroId: String(r.tablero_id),
    origen: r.origen === "sistema" ? "sistema" : "monday",
    editadoEn: (r.editado_en as string | null) ?? null,
    actualizado: (r.actualizado_monday as string | null) ?? null,
    nombre: (r.nombre as string | null) ?? null,
    numero: (r.numero_pedido as string | null) ?? (r.nombre as string | null) ?? null,
    ordenId: (r.orden_id as string | null) ?? null,
    tienda: etiquetaLimpia("tienda", r.tienda_texto as string | null),
    courier: etiquetaLimpia("courier", r.courier as string | null),
    estado: etiquetaLimpia("estado", r.estado as string | null),
    edoPago: etiquetaLimpia("edo_pago", r.edo_pago as string | null),
    formaPago: etiquetaLimpia("forma_pago", r.forma_pago as string | null),
    porCobrar: num(r.por_cobrar),
    cobrado: num(r.monto_cobrado),
    costeEnvio: num(r.coste_envio),
    turno: etiquetaLimpia("turno", r.turno as string | null),
    comentario: (r.comentario as string | null) ?? null,
    comprobantes: Array.isArray(r.comprobantes) ? r.comprobantes.length : 0,
    archivos: Array.isArray(r.comprobantes) ? (r.comprobantes as string[]) : [],
    estadoAsesores: etiquetaLimpia("estado_asesores", r.estado_asesores as string | null),
    obsAsesores: (r.observaciones_asesores as string | null) ?? null,
    dia,
    desdePanel: r.marcado_desde === "panel",
    marcadoEn: (r.marcado_en as string | null) ?? null,
    grupo: clase === "devolucion" ? grupoDevolucion(r.grupo as string | null) : (dia ?? "Sin día"),
    posicion: Number(r.posicion) || 0,
  };
}

/**
 * Con tiendas limitadas (17 nov 2026: la gente de Nuvo ve solo lo de Nuvo), solo las filas de sus tiendas; las que no tienen tienda reconocida no se ven.
 * Sin límite, todas.
 */
export function soloSusTiendas<Q>(q: Q, permitidas: string[] | null): Q {
  if (permitidas === null) return q;
  return (q as unknown as { in: (columna: string, valores: string[]) => Q }).in("unidad_id", permitidas.length ? permitidas : [SIN_TIENDA]);
}

/** El tablero consolidado de Monday (para preferir el del repartidor cuando un pedido está en los dos). */
export async function tableroConsolidado(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("mon_config").select("tablero_id").eq("id", 1).maybeSingle();
  return (data?.tablero_id as string | null) ?? null;
}

/**
 * Los repartos de ciudad de `desde` a `hasta` (AAAA-MM-DD), sin los archivados; con `archivados`, solo los archivados (de cualquier día).
 * `faltaMigracion` si faltan las columnas `clase` o `archivado_en` (migraciones 0970 y 0971 sin correr).
 */
export async function cargarCiudad(supabase: SupabaseClient, desde: string, hasta: string, archivados = false): Promise<{ filas: FilaTablero[]; faltaMigracion: boolean }> {
  let faltaMigracion = false;
  const columnas = COLUMNAS_DESPACHO + ((await hayPanelRepartidor(supabase)) ? COLUMNAS_PANEL : "");
  const permitidas = await cargarTiendasPermitidas();
  const crudas = await traerTodasLasFilas<Record<string, unknown>>((d, h) => {
    const q = soloSusTiendas(supabase.from("mon_despachos").select(columnas).eq("clase", "ciudad"), permitidas);
    // Las columnas se arman según la migración 0362: el tipo de la respuesta se declara a mano.
    return (archivados ? q.not("archivado_en", "is", null) : q.is("archivado_en", null).gte("fecha_despacho", desde).lte("fecha_despacho", hasta)).order("item_id").range(d, h) as unknown as PromiseLike<{
      data: Record<string, unknown>[] | null;
      error: unknown;
    }>;
  }).catch(() => {
    faltaMigracion = true;
    return [] as Record<string, unknown>[];
  });
  const consolidado = await tableroConsolidado(supabase);
  const filas = crudas.map((r) => aFila(r, "ciudad"));
  return { filas: archivados ? filas : sinDuplicados(filas, consolidado), faltaMigracion };
}

/** Las devoluciones (todas las tiendas), sin las archivadas; con `archivados`, solo las archivadas. */
export async function cargarDevoluciones(supabase: SupabaseClient, archivados = false): Promise<{ filas: FilaTablero[]; faltaMigracion: boolean }> {
  let faltaMigracion = false;
  const columnas = COLUMNAS_DESPACHO;
  const permitidas = await cargarTiendasPermitidas();
  const crudas = await traerTodasLasFilas<Record<string, unknown>>((d, h) => {
    const q = soloSusTiendas(supabase.from("mon_despachos").select(columnas).eq("clase", "devolucion"), permitidas);
    return (archivados ? q.not("archivado_en", "is", null) : q.is("archivado_en", null)).order("item_id").range(d, h);
  }).catch(() => {
    faltaMigracion = true;
    return [] as Record<string, unknown>[];
  });
  return { filas: crudas.map((r) => aFila(r, "devolucion")), faltaMigracion };
}

const diaPanama = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** Los días que muestra Envíos Delivery: los `dias` hasta hoy (en Panamá) y los dos siguientes, para lo programado. */
export function rangoDespacho(dias: number, ahora = Date.now()): { desde: string; hasta: string; hoy: string } {
  return { desde: diaPanama(ahora - (dias - 1) * 86_400_000), hasta: diaPanama(ahora + 2 * 86_400_000), hoy: diaPanama(ahora) };
}
