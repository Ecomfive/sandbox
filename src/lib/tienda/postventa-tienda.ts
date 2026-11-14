// Los cambios, reembolsos, retiros y complementos de cada pedido, como los registra el equipo en el tablero «CAMBIOS Y REEMBOLSOS» de Monday
// (14 nov 2026). Los lee la tarea `monday` a `mon_postventa` (src/lib/monday/postventa.ts); aquí solo se leen, para la ficha del pedido, la lista de
// Pedidos y Logística. Sin la migración 0290, no hay casos (todo sigue igual).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CasoPedido {
  /** cambio, reembolso, retiro, complemento, faltante, garantia, envio. */
  tipos: string[];
  /** La columna «Estado» del tablero (En Proceso, Hecho, Estancado…). */
  estado: string | null;
  /** El grupo del tablero (Realizados, Cambios/Retiros/Reembolsos/Complementos…). */
  grupo: string | null;
  /** El día en que se abrió el caso en Monday, AAAA-MM-DD. */
  fecha: string | null;
  nombre: string;
  retirar: string | null;
  enviar: string | null;
  reembolso: number | null;
  reembolsoTexto: string | null;
  penalizacion: string | null;
  costoEnvio: string | null;
  motivo: string | null;
  observacion: string | null;
  ultimaNota: string | null;
}

const COLUMNAS = "orden_id, nombre, tipos, estado, grupo, retirar, enviar, reembolso, reembolso_texto, penalizacion, costo_envio, motivo, observacion, ultima_nota, creado_monday";

const NOMBRE_TIPO: Record<string, string> = {
  cambio: "Cambio",
  reembolso: "Reembolso",
  complemento: "Complemento",
  faltante: "Faltante",
  garantia: "Garantía",
  envio: "Envío",
  retiro: "Retiro",
};
/** El orden en que se nombra el caso: «Reembolso y retiro» se llama «Reembolso». */
const ORDEN_TIPOS = ["reembolso", "cambio", "complemento", "faltante", "garantia", "envio", "retiro"];

/** El nombre corto del caso: su tipo principal («Reembolso», «Cambio»…). */
export function tipoPrincipal(tipos: string[]): string {
  const t = ORDEN_TIPOS.find((x) => tipos.includes(x));
  return t ? NOMBRE_TIPO[t] : "Caso";
}

/** El caso sigue abierto si su estado no es «Hecho» (ni está en el grupo de realizados sin estado). */
export const casoAbierto = (c: Pick<CasoPedido, "estado" | "grupo">): boolean => {
  const e = (c.estado ?? "").trim().toUpperCase();
  if (e) return e !== "HECHO";
  return !/REALIZAD/i.test(c.grupo ?? "");
};

/** La etiqueta para la lista de Pedidos: el caso más reciente («Reembolso · Hecho», «Cambio · En Proceso»). */
export function etiquetaPostventa(casos: CasoPedido[] | null | undefined): string | null {
  if (!casos?.length) return null;
  const ultimo = [...casos].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))[0];
  return [tipoPrincipal(ultimo.tipos), ultimo.estado?.trim() || (casoAbierto(ultimo) ? "En proceso" : "Hecho")].join(" · ");
}

export function casoDeFila(x: Record<string, unknown>): CasoPedido {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    tipos: Array.isArray(x.tipos) ? (x.tipos as unknown[]).map(String) : [],
    estado: s(x.estado),
    grupo: s(x.grupo),
    fecha: s(x.creado_monday)?.slice(0, 10) ?? null,
    nombre: s(x.nombre) ?? "",
    retirar: s(x.retirar),
    enviar: s(x.enviar),
    reembolso: x.reembolso === null || x.reembolso === undefined ? null : Number(x.reembolso),
    reembolsoTexto: s(x.reembolso_texto),
    penalizacion: s(x.penalizacion),
    costoEnvio: s(x.costo_envio),
    motivo: s(x.motivo),
    observacion: s(x.observacion),
    ultimaNota: s(x.ultima_nota),
  };
}

/** Los casos de cada pedido, del más nuevo al más viejo. Sin la tabla, vacío. */
export async function postventaDeOrdenes(supabase: SupabaseClient, ids: string[]): Promise<Map<string, CasoPedido[]>> {
  const mapa = new Map<string, CasoPedido[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.from("mon_postventa").select(COLUMNAS).in("orden_id", ids.slice(i, i + 200)).order("creado_monday", { ascending: false });
    if (error) return mapa;
    for (const x of (data ?? []) as Record<string, unknown>[]) {
      const id = String(x.orden_id);
      const lista = mapa.get(id) ?? [];
      lista.push(casoDeFila(x));
      mapa.set(id, lista);
    }
  }
  return mapa;
}

/**
 * Para listas largas (Pedidos de varios meses): los casos de todos los pedidos enlazados de una vez (son pocos: unos 60 por mes entre todas las
 * tiendas) y se quedan los de `ids`. Con pocos pedidos, por sus ids.
 */
export async function postventaDePedidos(supabase: SupabaseClient, ids: string[]): Promise<Map<string, CasoPedido[]>> {
  if (ids.length <= 400) return postventaDeOrdenes(supabase, ids);
  const quiero = new Set(ids);
  const mapa = new Map<string, CasoPedido[]>();
  for (let d = 0; d < 20_000; d += 1000) {
    const { data, error } = await supabase.from("mon_postventa").select(COLUMNAS).not("orden_id", "is", null).order("creado_monday", { ascending: false }).range(d, d + 999);
    if (error) return mapa;
    for (const x of (data ?? []) as Record<string, unknown>[]) {
      const id = String(x.orden_id);
      if (!quiero.has(id)) continue;
      const lista = mapa.get(id) ?? [];
      lista.push(casoDeFila(x));
      mapa.set(id, lista);
    }
    if ((data ?? []).length < 1000) break;
  }
  return mapa;
}
