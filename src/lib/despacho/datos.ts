// Gestión de tienda › Despacho ciudad y Devoluciones (migración 0970): lo que leen sus páginas de `mon_despachos`, la misma tabla que llenaba Monday y
// que leen las entregas de los pedidos, Logística y la ficha del pedido. Las etiquetas se muestran limpias (`etiquetaLimpia`) y un pedido que está en el
// consolidado y en el tablero del repartidor sale una sola vez (`sinDuplicados`).

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
  estadoAsesores: string | null;
  obsAsesores: string | null;
  /** El día (ciudad, AAAA-MM-DD) o el grupo (devoluciones). */
  dia: string | null;
  grupo: string;
  posicion: number;
}

const COLUMNAS =
  "item_id, tablero_id, origen, editado_en, actualizado_monday, nombre, numero_pedido, orden_id, tienda_texto, courier, estado, edo_pago, forma_pago, por_cobrar, monto_cobrado, coste_envio, turno, comentario, comprobantes, estado_asesores, observaciones_asesores, fecha_despacho, grupo, posicion";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

function aFila(r: Record<string, unknown>, clase: Clase): FilaTablero {
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
    estadoAsesores: etiquetaLimpia("estado_asesores", r.estado_asesores as string | null),
    obsAsesores: (r.observaciones_asesores as string | null) ?? null,
    dia,
    grupo: clase === "devolucion" ? grupoDevolucion(r.grupo as string | null) : (dia ?? "Sin día"),
    posicion: Number(r.posicion) || 0,
  };
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
  const crudas = await traerTodasLasFilas<Record<string, unknown>>((d, h) => {
    const q = supabase.from("mon_despachos").select(COLUMNAS).eq("clase", "ciudad");
    return (archivados ? q.not("archivado_en", "is", null) : q.is("archivado_en", null).gte("fecha_despacho", desde).lte("fecha_despacho", hasta)).order("item_id").range(d, h);
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
  const crudas = await traerTodasLasFilas<Record<string, unknown>>((d, h) => {
    const q = supabase.from("mon_despachos").select(COLUMNAS).eq("clase", "devolucion");
    return (archivados ? q.not("archivado_en", "is", null) : q.is("archivado_en", null)).order("item_id").range(d, h);
  }).catch(() => {
    faltaMigracion = true;
    return [] as Record<string, unknown>[];
  });
  return { filas: crudas.map((r) => aFila(r, "devolucion")), faltaMigracion };
}

const diaPanama = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** Los días que muestra Despacho ciudad: los `dias` hasta hoy (en Panamá) y los dos siguientes, para lo programado. */
export function rangoDespacho(dias: number, ahora = Date.now()): { desde: string; hasta: string; hoy: string } {
  return { desde: diaPanama(ahora - (dias - 1) * 86_400_000), hasta: diaPanama(ahora + 2 * 86_400_000), hoy: diaPanama(ahora) };
}
