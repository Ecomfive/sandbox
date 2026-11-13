// Monday › los tableros de cada repartidor (migración 0282, 12 nov 2026, pedido de Hernán). El consolidado «DELIVERY REPORTES DIARIOS» (`mon_config`)
// llega hasta el 31/10; lo de noviembre está en el tablero de cada repartidor, con las mismas columnas. La tarea `monday`, después del consolidado,
// lee estos tableros completos (cada uno con su propio avance) y guarda sus ítems en `mon_despachos` igual que los del consolidado. Las columnas se
// reconocen por el título de las del consolidado (`mapeoPorTitulos`, pura y con prueba) y quedan guardadas en el tablero. Si un tablero no termina en
// el tiempo de la ejecución, sigue entero en la próxima.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizar } from "../finanzas/clasificacion";
import { COLUMNA_GRUPO, COLUMNA_NOMBRE, CONSULTA_COLUMNAS, CONSULTA_SIGUIENTE, consultaPrimeraDesde, ITEMS_POR_PAGINA, cambioDesde, despachoDeItem, leerColumnas, leerMapeo, leerPagina, leerReglasEstado, sugerirMapeo, type ColumnaTablero, type MapeoColumnas } from "./columnas";
import { consultarMonday, guardarDespachos, mondayConfigurado } from "./sincronizar";

/**
 * El mapeo de un tablero de repartidor a partir del del consolidado: cada dato toma la columna con el mismo título (sin tildes ni mayúsculas).
 * El nombre del ítem y el grupo valen igual en todos los tableros. Sin la columna de pedido o de estado no se puede leer: null.
 */
export function mapeoPorTitulos(mapeo: MapeoColumnas, principal: ColumnaTablero[], extra: ColumnaTablero[]): MapeoColumnas | null {
  const tituloDe = new Map(principal.map((c) => [c.id, normalizar(c.titulo)]));
  const porTitulo = new Map<string, string>();
  for (const c of extra) if (!porTitulo.has(normalizar(c.titulo))) porTitulo.set(normalizar(c.titulo), c.id);
  const salida: MapeoColumnas = {};
  for (const [campo, id] of Object.entries(mapeo) as [keyof MapeoColumnas, string][]) {
    if (id === COLUMNA_NOMBRE || id === COLUMNA_GRUPO) {
      salida[campo] = id;
      continue;
    }
    const titulo = tituloDe.get(id);
    const otro = titulo ? porTitulo.get(titulo) : undefined;
    if (otro) salida[campo] = otro;
  }
  return salida.pedido && salida.estado ? salida : null;
}

/** Lee los tableros de los repartidores que alcancen antes de `limite`. Sin la migración 0282 o sin tableros, no hace nada. */
export async function sincronizarTablerosExtra(supabase: SupabaseClient, limite: number): Promise<string> {
  if (!mondayConfigurado()) return "";
  const { data: tableros, error } = await supabase.from("mon_tableros_extra").select("tablero_id, nombre, columnas, cursor_actualizado").eq("activo", true).order("ultima_lectura", { ascending: true, nullsFirst: true });
  if (error || !tableros?.length) return "";
  const { data: cfg } = await supabase.from("mon_config").select("tablero_id, columnas, estados").eq("id", 1).maybeSingle();
  const mapeoPrincipal = leerMapeo(cfg?.columnas);
  if (!cfg?.tablero_id || !mapeoPrincipal.pedido || !mapeoPrincipal.estado) return "";
  const reglas = leerReglasEstado(cfg.estados);
  const { data: unidadesData } = await supabase.from("fin_unidades").select("id, nombre");
  const unidades = (unidadesData ?? []) as { id: string; nombre: string }[];
  let columnasPrincipal: ColumnaTablero[] | null = null;

  const hechos: string[] = [];
  for (const t of tableros as { tablero_id: string; nombre: string; columnas: unknown; cursor_actualizado: string | null }[]) {
    if (Date.now() > limite) break;
    try {
      let mapeo = t.columnas ? leerMapeo(t.columnas) : null;
      if (!mapeo?.pedido || !mapeo.estado) {
        columnasPrincipal ??= leerColumnas(await consultarMonday(CONSULTA_COLUMNAS, { ids: [String(cfg.tablero_id)] }))?.columnas ?? [];
        const propias = leerColumnas(await consultarMonday(CONSULTA_COLUMNAS, { ids: [t.tablero_id] }));
        if (!propias) throw new Error("El tablero no existe o el token de Monday no tiene acceso a él.");
        mapeo = mapeoPorTitulos(mapeoPrincipal, columnasPrincipal, propias.columnas);
        if (!mapeo) throw new Error("No tiene columnas con el mismo título que las de pedido y estado del consolidado.");
        // Las de los asesores (solo las tiene el tablero de devoluciones; migración 0288), por su título.
        const sugeridas = sugerirMapeo(propias.columnas);
        if (sugeridas.estado_asesores) mapeo.estado_asesores = sugeridas.estado_asesores;
        if (sugeridas.observaciones_asesores) mapeo.observaciones_asesores = sugeridas.observaciones_asesores;
        await supabase.from("mon_tableros_extra").update({ columnas: mapeo }).eq("tablero_id", t.tablero_id);
      }
      let cursor: string | null = null;
      let primera = true;
      let maximo: string | null = null;
      let leidos = 0;
      let guardados = 0;
      while (primera || cursor) {
        if (!primera && Date.now() > limite) break;
        const json = primera ? await consultarMonday(consultaPrimeraDesde(t.cursor_actualizado), { ids: [t.tablero_id], limit: ITEMS_POR_PAGINA }) : await consultarMonday(CONSULTA_SIGUIENTE, { cursor, limit: ITEMS_POR_PAGINA });
        primera = false;
        const pagina = leerPagina(json);
        const cambiados = pagina.items.filter((i) => cambioDesde(i, t.cursor_actualizado));
        guardados += await guardarDespachos(supabase, t.tablero_id, cambiados.map((i) => despachoDeItem(i, mapeo, reglas)), unidades);
        leidos += pagina.items.length;
        const max = pagina.items.map((i) => i.updated_at ?? "").filter(Boolean).sort().at(-1) ?? null;
        if (max && (!maximo || max > maximo)) maximo = max;
        cursor = pagina.cursor;
      }
      // Sin terminar, el avance no se mueve: la próxima ejecución lo vuelve a leer entero.
      if (cursor) {
        hechos.push(`${t.nombre}: ${guardados} guardados, sigue en la próxima`);
        continue;
      }
      const { count } = await supabase.from("mon_despachos").select("item_id", { count: "exact", head: true }).eq("tablero_id", t.tablero_id);
      await supabase
        .from("mon_tableros_extra")
        .update({ cursor_actualizado: maximo ?? t.cursor_actualizado, items: count ?? leidos, ultima_lectura: new Date().toISOString(), ultimo_error: null })
        .eq("tablero_id", t.tablero_id);
      hechos.push(`${t.nombre}: ${guardados} de ${leidos}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo leer.";
      await supabase.from("mon_tableros_extra").update({ ultimo_error: msg.slice(0, 1000), ultima_lectura: new Date().toISOString() }).eq("tablero_id", t.tablero_id);
      hechos.push(`${t.nombre}: ${msg}`);
      if (/429/.test(msg)) break;
    }
  }
  return hechos.length ? `Tableros de repartidores: ${hechos.join("; ")}.` : "";
}
