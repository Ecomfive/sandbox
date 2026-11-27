// Gestión de tienda › Cambios y reembolsos (migración 0972): lo que lee el tablero de `mon_postventa`, la misma tabla que llenaba Monday y que leen la
// ficha del pedido, Pedidos y Logística. Los abiertos se muestran todos; los realizados, los de los últimos días (o todos, si se pide).

import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { soloSusTiendas } from "@/lib/despacho/datos";
import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { ESTADOS, etiquetaDe, grupoDe, GRUPO_REALIZADOS, NOTIFICAR, TIPOS } from "./reglas";

export interface FilaCaso {
  itemId: string;
  origen: "monday" | "sistema";
  editadoEn: string | null;
  nombre: string;
  tienda: string | null;
  numero: string | null;
  ordenId: string | null;
  /** El tipo principal (el que da color a la etiqueta) y todos. */
  tipo: string | null;
  tipos: string[];
  responsableId: string | null;
  responsable: string | null;
  /** Quién causó la solicitud (migración 0365): «Cliente» o «Tienda». */
  causa: string | null;
  /** Si ya se subió el comprobante del pago para el cliente (migración 0365). */
  comprobante: boolean;
  estado: string | null;
  grupo: string;
  fecha: string | null;
  seguimiento: string | null;
  valorEnvio: number | null;
  reembolso: number | null;
  adjuntos: number;
  notificar: string | null;
  fechaNotificacion: string | null;
  creado: string | null;
  retirar: string | null;
  enviar: string | null;
  motivo: string | null;
  costoEnvio: string | null;
  observacion: string | null;
  despachoItemId: string | null;
}

export interface Persona {
  id: string;
  nombre: string;
}

const COLUMNAS =
  "item_id, origen, editado_en, nombre, tienda_texto, numero_pedido, orden_id, tipos, responsable_id, responsable_texto, estado, grupo, fecha, seguimiento, valor_envio, reembolso, adjuntos, notificar, fecha_notificacion, creado_monday, retirar, enviar, motivo, costo_envio, observacion, despacho_item_id";
/** Las de la migración 0365 (Responsable = Cliente o Tienda, y el comprobante): sin ella, el tablero se lee sin estas. */
const COLUMNAS_0365 = `${COLUMNAS}, causa, comprobante`;

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
/** El orden en que se elige el tipo principal: «Reembolso y retiro» se pinta como Reembolso. */
const ORDEN = ["reembolso", "cambio", "complemento", "faltante", "garantia", "envio", "retiro"];

export function aFilaCaso(r: Record<string, unknown>, personas: Map<string, string>): FilaCaso {
  const tipos = Array.isArray(r.tipos) ? (r.tipos as string[]) : [];
  const principal = ORDEN.find((t) => tipos.includes(t)) ?? null;
  const responsableId = (r.responsable_id as string | null) ?? null;
  return {
    itemId: String(r.item_id),
    origen: r.origen === "sistema" ? "sistema" : "monday",
    editadoEn: (r.editado_en as string | null) ?? null,
    nombre: String(r.nombre ?? ""),
    tienda: (r.tienda_texto as string | null)?.replace(/\s+O$/, "") ?? null,
    numero: (r.numero_pedido as string | null) ?? null,
    ordenId: (r.orden_id as string | null) ?? null,
    tipo: principal ? (TIPOS.find((t) => t.clave === principal)?.nombre ?? null) : null,
    tipos,
    responsableId,
    responsable: (responsableId ? personas.get(responsableId) : null) ?? (r.responsable_texto as string | null) ?? null,
    causa: (r.causa as string | null) ?? null,
    comprobante: !!r.comprobante,
    estado: etiquetaDe(ESTADOS, r.estado as string | null),
    grupo: grupoDe(r.grupo as string | null),
    fecha: (r.fecha as string | null) ?? null,
    seguimiento: (r.seguimiento as string | null) ?? null,
    valorEnvio: num(r.valor_envio),
    reembolso: num(r.reembolso),
    adjuntos: Array.isArray(r.adjuntos) ? r.adjuntos.length : 0,
    notificar: etiquetaDe(NOTIFICAR, r.notificar as string | null),
    fechaNotificacion: (r.fecha_notificacion as string | null) ?? null,
    creado: (r.creado_monday as string | null) ?? null,
    retirar: (r.retirar as string | null) ?? null,
    enviar: (r.enviar as string | null) ?? null,
    motivo: (r.motivo as string | null) ?? null,
    costoEnvio: (r.costo_envio as string | null) ?? null,
    observacion: (r.observacion as string | null) ?? null,
    despachoItemId: (r.despacho_item_id as string | null) ?? null,
  };
}

/** Las personas activas del sistema (para la columna Responsable). */
export async function cargarPersonas(supabase: SupabaseClient): Promise<Persona[]> {
  const { data } = await supabase.from("perfiles").select("id, nombre, email").eq("activo", true).order("nombre");
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: (p.nombre as string | null) ?? String(p.email).split("@")[0] }));
}

/**
 * Las solicitudes del tablero: las abiertas (Asuntos de Finanzas y Cambios/Retiros/…) todas, y las realizadas de los últimos `diasRealizados` días
 * (todas si es null). Con `archivados`, solo las archivadas. `faltaMigracion` si falta la 0972.
 */
export async function cargarCasos(
  supabase: SupabaseClient,
  opciones: { diasRealizados: number | null; archivados?: boolean },
): Promise<{ filas: FilaCaso[]; personas: Persona[]; faltaMigracion: boolean; falta0365: boolean }> {
  let faltaMigracion = false;
  let falta0365 = false;
  const personas = await cargarPersonas(supabase);
  const mapa = new Map(personas.map((p) => [p.id, p.nombre]));
  const desde = opciones.diasRealizados === null ? null : new Date(Date.now() - opciones.diasRealizados * 86_400_000).toISOString();
  // Con tiendas limitadas (17 nov 2026), solo las solicitudes de sus tiendas.
  const permitidas = await cargarTiendasPermitidas();
  const leer = (columnas: string) =>
    traerTodasLasFilas<Record<string, unknown>>((d, h) => {
      const q = soloSusTiendas(supabase.from("mon_postventa").select(columnas as "*"), permitidas);
      if (opciones.archivados) return q.not("archivado_en", "is", null).order("item_id").range(d, h);
      const base = q.is("archivado_en", null);
      // Los realizados de hace poco: por cuándo se abrieron o cuándo se cambiaron por última vez.
      return (desde ? base.or(`grupo.is.null,grupo.neq.${GRUPO_REALIZADOS},creado_monday.gte.${desde},actualizado_monday.gte.${desde}`) : base).order("item_id").range(d, h);
    });
  const crudas = await leer(COLUMNAS_0365)
    .catch(() => {
      falta0365 = true;
      return leer(COLUMNAS);
    })
    .catch(() => {
      faltaMigracion = true;
      return [] as Record<string, unknown>[];
    });
  const filas = crudas.map((r) => aFilaCaso(r, mapa)).sort((a, b) => (b.creado ?? "").localeCompare(a.creado ?? ""));
  return { filas, personas, faltaMigracion, falta0365 };
}

/** Hoy en Panamá, AAAA-MM-DD. */
export const hoyPanama = (ahora = Date.now()) => new Date(ahora).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
