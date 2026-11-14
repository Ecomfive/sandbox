// Monday.com desde el servidor (migración 0951). Token personal `MONDAY_API_TOKEN` (solo servidor). Lectura de las
// columnas de un tablero (para elegir el mapeo en el portal) y la tarea `monday`: lee el tablero completo paginado con
// `items_page` y el cursor de `next_items_page` (500 por página; lo que no alcanza en una ejecución sigue en la siguiente
// del mismo día, mientras el cursor de Monday siga vivo: 60 minutos), guarda en `mon_despachos` solo los ítems
// actualizados desde la última lectura completa (con un día de margen) y los enlaza a `ven_ordenes` por número de pedido
// y tienda. Sin el token, sin tablero o sin mapeo, la tarea queda apagada.

import type { SupabaseClient } from "@supabase/supabase-js";
import { unidadDeTienda } from "../ventas/matriz";
import {
  cambioDesde,
  CONSULTA_COLUMNAS,
  consultaPrimeraDesde,
  CONSULTA_SIGUIENTE,
  despachoDeItem,
  enlazarOrden,
  errorMonday,
  ITEMS_POR_PAGINA,
  leerColumnas,
  leerMapeo,
  leerPagina,
  leerReglasEstado,
  unidadDeTexto,
  URL_API_MONDAY,
  variantesPedido,
  VERSION_API_MONDAY,
  type ColumnaTablero,
  type Despacho,
  type OrdenCandidata,
} from "./columnas";

export const SIN_MIGRACION_MONDAY = "Falta correr la migración 0951 (Monday.com) en Supabase.";
export const mondayConfigurado = () => Boolean(process.env.MONDAY_API_TOKEN?.trim());
/** Vida del cursor de `items_page` en Monday. */
const VIDA_CURSOR_MS = 55 * 60_000;

/** Una consulta a la API de Monday con el token del servidor (también la usan los tableros de repartidores, `tableros-extra.ts`). */
export async function consultarMonday(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const token = process.env.MONDAY_API_TOKEN?.trim();
  if (!token) throw new Error("Falta MONDAY_API_TOKEN en el servidor.");
  const r = await fetch(URL_API_MONDAY, {
    method: "POST",
    headers: { Authorization: token, "API-Version": VERSION_API_MONDAY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(25_000),
  });
  if (r.status === 401 || r.status === 403) throw new Error(`Monday rechazó el token (${r.status}).`);
  if (r.status === 429) throw new Error("Monday limitó las consultas (429): sigue en la próxima ejecución.");
  const json = await r.json().catch(() => null);
  const err = errorMonday(json);
  if (err) throw new Error(`Monday: ${err}`);
  if (!r.ok) throw new Error(`Monday respondió ${r.status}.`);
  return json;
}

/** Las columnas de un tablero (para el mapeo). */
export async function columnasDeTablero(tableroId: string): Promise<{ nombre: string; columnas: ColumnaTablero[] } | { error: string }> {
  try {
    const c = leerColumnas(await consultarMonday(CONSULTA_COLUMNAS, { ids: [tableroId] }));
    return c ?? { error: "Ese tablero no existe o el token no tiene acceso a él." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo leer el tablero." };
  }
}

interface Pendiente {
  cursor: string;
  maximo: string | null;
  inicio: number;
  leidos: number;
  guardados: number;
}

const leerPendiente = (v: unknown): Pendiente | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.cursor !== "string" || typeof o.inicio !== "number" || Date.now() - o.inicio > VIDA_CURSOR_MS) return null;
  return { cursor: o.cursor, maximo: typeof o.maximo === "string" ? o.maximo : null, inicio: o.inicio, leidos: Number(o.leidos) || 0, guardados: Number(o.guardados) || 0 };
};

/** Enlaza y guarda un lote de despachos. */
export async function guardarDespachos(supabase: SupabaseClient, tableroId: string, lote: Despacho[], unidades: { id: string; nombre: string }[]): Promise<number> {
  if (!lote.length) return 0;
  const variantes = [...new Set(lote.flatMap((d) => variantesPedido(d.numero_pedido)))];
  const candidatas: OrdenCandidata[] = [];
  for (let i = 0; i < variantes.length; i += 200) {
    const { data, error } = await supabase.from("ven_ordenes").select("id, unidad_id, numero, periodo").in("numero", variantes.slice(i, i + 200));
    if (error) throw new Error(`ven_ordenes: ${error.message}`);
    for (const o of data ?? []) candidatas.push({ id: o.id as string, unidad_id: o.unidad_id as string, numero: o.numero as string, periodo: String(o.periodo).slice(0, 10) });
  }
  const ahora = new Date().toISOString();
  const filas = lote.map((d) => {
    const unidad = unidadDeTexto(d.tienda_texto, unidades, unidadDeTienda);
    const orden = enlazarOrden(d.numero_pedido, unidad, candidatas);
    const periodo = orden?.periodo ?? (d.fecha_despacho ? `${d.fecha_despacho.slice(0, 7)}-01` : null);
    return { ...d, tablero_id: tableroId, unidad_id: unidad ?? orden?.unidad_id ?? null, orden_id: orden?.id ?? null, periodo, leido_en: ahora };
  });
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from("mon_despachos").upsert(filas.slice(i, i + 500), { onConflict: "item_id" });
    if (error) throw new Error(`mon_despachos: ${error.message}`);
  }
  return filas.length;
}

/** La tarea `monday`. Devuelve lo que falta (el cursor) si no terminó. */
export async function sincronizarMonday(supabase: SupabaseClient, limite: number, pendienteAnterior: unknown): Promise<{ resumen: string; pendiente: Pendiente | null }> {
  if (!mondayConfigurado()) return { resumen: "Apagada: falta MONDAY_API_TOKEN en las variables de entorno.", pendiente: null };
  const { data: cfg, error } = await supabase.from("mon_config").select("tablero_id, columnas, estados, cursor_actualizado, items").eq("id", 1).maybeSingle();
  if (error) throw new Error(SIN_MIGRACION_MONDAY);
  const mapeo = leerMapeo(cfg?.columnas);
  if (!cfg?.tablero_id || !mapeo.pedido || !mapeo.estado) return { resumen: "Apagada: falta elegir el tablero y sus columnas (Deliverys › Monday).", pendiente: null };
  const tablero = String(cfg.tablero_id);
  const reglas = leerReglasEstado(cfg.estados);
  const cursorActualizado = (cfg.cursor_actualizado as string | null) ?? null;
  const { data: unidadesData } = await supabase.from("fin_unidades").select("id, nombre");
  const unidades = (unidadesData ?? []) as { id: string; nombre: string }[];

  const previo = leerPendiente(pendienteAnterior);
  let estado: Pendiente = previo ?? { cursor: "", maximo: null, inicio: Date.now(), leidos: 0, guardados: 0 };
  let cursor: string | null = previo ? previo.cursor : null;
  let primera = !previo;
  try {
    while (primera || cursor) {
      if (!primera && Date.now() > limite) break;
      const json = primera
        ? await consultarMonday(consultaPrimeraDesde(cursorActualizado), { ids: [tablero], limit: ITEMS_POR_PAGINA })
        : await consultarMonday(CONSULTA_SIGUIENTE, { cursor, limit: ITEMS_POR_PAGINA });
      primera = false;
      const pagina = leerPagina(json);
      const cambiados = pagina.items.filter((i) => cambioDesde(i, cursorActualizado));
      const guardados = await guardarDespachos(supabase, tablero, cambiados.map((i) => despachoDeItem(i, mapeo, reglas)), unidades);
      const maxPagina = pagina.items.map((i) => i.updated_at ?? "").filter(Boolean).sort().at(-1) ?? null;
      estado = {
        cursor: pagina.cursor ?? "",
        maximo: maxPagina && (!estado.maximo || maxPagina > estado.maximo) ? maxPagina : estado.maximo,
        inicio: estado.inicio,
        leidos: estado.leidos + pagina.items.length,
        guardados: estado.guardados + guardados,
      };
      cursor = pagina.cursor;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falló la lectura de Monday.";
    await supabase.from("mon_config").update({ ultimo_error: msg.slice(0, 1000) }).eq("id", 1);
    throw new Error(msg);
  }
  const texto = `${estado.leidos} ítems leídos, ${estado.guardados} guardados (actualizados desde la última lectura).`;
  if (cursor) return { resumen: `${texto} Sigue en la próxima ejecución.`, pendiente: { ...estado, cursor } };
  const { count } = await supabase.from("mon_despachos").select("item_id", { count: "exact", head: true }).eq("tablero_id", tablero);
  await supabase
    .from("mon_config")
    .update({ cursor_actualizado: estado.maximo ?? cursorActualizado, items: count ?? cfg.items ?? 0, ultima_lectura: new Date().toISOString(), ultimo_error: null })
    .eq("id", 1);
  return { resumen: texto, pendiente: null };
}

/**
 * Vuelve a buscar el pedido de las filas de Monday que se guardaron sin él (14 nov 2026). Una fila se enlaza al guardarse, y solo se vuelve a guardar si
 * cambia en Monday; si el pedido entró después al sistema (Oferfy: sus pedidos de Shopify desde el 14 oct llegaron después que su tablero de
 * devoluciones), la fila quedaba sin pedido para siempre. Revisa las filas de los últimos `dias` con tienda y número, en `mon_despachos` y en
 * `mon_postventa` (cambios y reembolsos; sin la migración 0290, solo la primera). Devuelve cuántas enlazó.
 */
export async function enlazarSinPedido(supabase: SupabaseClient, dias = 120): Promise<number> {
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
  let enlazadas = 0;
  for (const [tabla, fecha] of [
    ["mon_despachos", "actualizado_monday"],
    ["mon_postventa", "creado_monday"],
  ] as const) {
    const filas: { item_id: string; numero_pedido: string; unidad_id: string }[] = [];
    for (let d = 0; d < 20_000; d += 1000) {
      const { data, error } = await supabase
        .from(tabla)
        .select("item_id, numero_pedido, unidad_id")
        .is("orden_id", null)
        .not("numero_pedido", "is", null)
        .not("unidad_id", "is", null)
        .gte(fecha, desde)
        .order("item_id")
        .range(d, d + 999);
      if (error) break;
      filas.push(...((data ?? []) as typeof filas));
      if ((data ?? []).length < 1000) break;
    }
    if (!filas.length) continue;
    const variantes = [...new Set(filas.flatMap((f) => variantesPedido(f.numero_pedido)))];
    const candidatas: OrdenCandidata[] = [];
    for (let i = 0; i < variantes.length; i += 200) {
      const { data, error } = await supabase.from("ven_ordenes").select("id, unidad_id, numero, periodo").in("numero", variantes.slice(i, i + 200));
      if (error) throw new Error(`ven_ordenes: ${error.message}`);
      for (const o of data ?? []) candidatas.push({ id: o.id as string, unidad_id: o.unidad_id as string, numero: o.numero as string, periodo: String(o.periodo).slice(0, 10) });
    }
    const cambios = filas.flatMap((f) => {
      const orden = enlazarOrden(f.numero_pedido, f.unidad_id, candidatas);
      return orden ? [{ item_id: f.item_id, orden }] : [];
    });
    for (let i = 0; i < cambios.length; i += 20) {
      await Promise.all(
        cambios.slice(i, i + 20).map(async ({ item_id, orden }) => {
          const cambio: Record<string, unknown> = { orden_id: orden.id };
          if (tabla === "mon_despachos") cambio.periodo = orden.periodo;
          const { error } = await supabase.from(tabla).update(cambio).eq("item_id", item_id).is("orden_id", null);
          if (!error) enlazadas++;
        }),
      );
    }
  }
  return enlazadas;
}
