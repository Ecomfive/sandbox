// Tarea «respaldo-finanzas» (mejora 100): copia cada tabla financiera a `respaldos-finanzas/<fecha>/<tabla>.json.gz`
// (bucket privado), anota el respaldo en `fin_respaldos` (tabla → filas) y borra las carpetas que sobran. Trabaja con el
// presupuesto de tiempo de las tareas: si no alcanza, deja las tablas que faltan en `pendiente` y la siguiente ejecución
// del día sigue de ahí (por eso la tarea tiene tres horarios). Las páginas solo lo listan y dan enlaces firmados.

import { gunzipSync, gzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_RESPALDOS, CONSERVAR_PREDETERMINADO, carpetasABorrar, compararRespaldo, ordenDe, rutaArchivo, tablasPendientes, type Verificacion } from "./respaldo";

const POR_PAGINA = 1000;

async function leerTabla(supabase: SupabaseClient, tabla: string, limite: number): Promise<{ filas: unknown[]; error?: string; corto?: boolean }> {
  const filas: unknown[] = [];
  const orden = ordenDe(tabla);
  for (let desde = 0; ; desde += POR_PAGINA) {
    if (Date.now() > limite) return { filas, corto: true };
    let q = supabase.from(tabla).select("*");
    for (const c of orden) q = q.order(c);
    const { data, error } = await q.range(desde, desde + POR_PAGINA - 1);
    if (error) return { filas, error: error.message };
    filas.push(...(data ?? []));
    if (!data || data.length < POR_PAGINA) return { filas };
  }
}

export async function respaldarFinanzas(
  supabase: SupabaseClient,
  o: { hoy: string; limite: number; pendiente: unknown; disparo: "cron" | "manual" },
): Promise<{ resumen: string; pendiente?: unknown }> {
  const carpeta = o.hoy;
  const { data: previo, error: e0 } = await supabase.from("fin_respaldos").select("id, tablas, bytes").eq("ruta", carpeta).maybeSingle();
  if (e0) throw new Error("Falta correr la migración 0937 (reportes y comunicación) en Supabase.");
  const tablas: Record<string, number> = { ...((previo?.tablas as Record<string, number> | null) ?? {}) };
  // Una ejecución nueva del día sigue lo que faltó; a mano, rehace todo.
  if (o.disparo === "manual" && !o.pendiente) for (const k of Object.keys(tablas)) delete tablas[k];
  const faltan = tablasPendientes(Object.keys(tablas));
  let bytes = 0;
  const omitidas: string[] = [];
  let i = 0;
  for (; i < faltan.length && Date.now() < o.limite; i++) {
    const t = faltan[i];
    const r = await leerTabla(supabase, t, o.limite);
    if (r.corto) break;
    if (r.error) {
      // Tabla que no existe en esta base (migración sin correr): se anota con −1 y no se reintenta hoy.
      tablas[t] = -1;
      omitidas.push(t);
      continue;
    }
    const gz = gzipSync(Buffer.from(JSON.stringify({ tabla: t, fecha: o.hoy, filas: r.filas })));
    const { error } = await supabase.storage.from(BUCKET_RESPALDOS).upload(rutaArchivo(carpeta, t), gz, { contentType: "application/gzip", upsert: true });
    if (error) throw new Error(`No se pudo subir ${t}: ${error.message}`);
    tablas[t] = r.filas.length;
    bytes += gz.length;
  }
  const { error: e1 } = await supabase
    .from("fin_respaldos")
    .upsert({ ruta: carpeta, tablas, disparo: o.disparo, bytes: bytes + Number(previo?.bytes ?? 0) }, { onConflict: "ruta" });
  if (e1) throw new Error(`No se pudo anotar el respaldo: ${e1.message}`);
  const restantes = tablasPendientes(Object.keys(tablas));
  if (restantes.length) {
    return { resumen: `Respaldo ${carpeta}: ${Object.keys(tablas).length} tablas listas, faltan ${restantes.length} (sigue en la próxima ejecución).`, pendiente: restantes };
  }
  // Terminado: se borran las carpetas que sobran.
  const { data: conf } = await supabase.from("fin_config").select("valor").eq("clave", "respaldos_conservar").maybeSingle();
  const conservar = Number(conf?.valor ?? CONSERVAR_PREDETERMINADO);
  const { data: todos } = await supabase.from("fin_respaldos").select("ruta");
  const borrar = carpetasABorrar((todos ?? []).map((r) => String(r.ruta)), conservar);
  for (const c of borrar) {
    const { data: archivos } = await supabase.storage.from(BUCKET_RESPALDOS).list(c, { limit: 200 });
    const rutas = (archivos ?? []).map((a) => `${c}/${a.name}`);
    if (rutas.length) await supabase.storage.from(BUCKET_RESPALDOS).remove(rutas);
    await supabase.from("fin_respaldos").delete().eq("ruta", c);
  }
  const filas = Object.values(tablas).filter((n) => n > 0).reduce((a, n) => a + n, 0);
  // Si queda tiempo, se comprueba que cada archivo se pueda leer (migración 0982); si no, se hace con «Verificar».
  const v = await verificarRespaldo(supabase, carpeta, o.limite).catch(() => null);
  const ver = !v || "error" in v ? "" : v.faltan.length ? " Verificación: sigue con «Verificar»." : v.ok ? " Verificado: se puede restaurar." : ` Verificación con problemas en ${v.tablas.filter((t) => t.estado !== "ok").length} tablas.`;
  return {
    resumen: `Respaldo ${carpeta} completo: ${filas.toLocaleString("es-PA")} filas de ${Object.values(tablas).filter((n) => n >= 0).length} tablas.${omitidas.length ? ` Sin tabla: ${omitidas.join(", ")}.` : ""}${borrar.length ? ` Borrados: ${borrar.join(", ")}.` : ""}${ver}`,
  };
}

/**
 * Descarga cada archivo del respaldo, lo descomprime, cuenta sus filas contra lo anotado y cuenta la tabla viva; guarda el
 * resultado en `fin_respaldos.verificacion`. Con `limite` (ms de reloj) deja en `faltan` lo que no alcanzó.
 */
export async function verificarRespaldo(supabase: SupabaseClient, carpeta: string, limite: number): Promise<{ error: string } | Verificacion> {
  const { data: r, error } = await supabase.from("fin_respaldos").select("tablas").eq("ruta", carpeta).maybeSingle();
  if (error || !r) return { error: error?.message ?? "No existe ese respaldo." };
  const anotado = (r.tablas as Record<string, number> | null) ?? {};
  const leido: Record<string, number | null> = {};
  const actual: Record<string, number | null> = {};
  for (const [t, n] of Object.entries(anotado)) {
    if (n < 0) continue;
    if (Date.now() > limite) break;
    try {
      const { data, error: e } = await supabase.storage.from(BUCKET_RESPALDOS).download(rutaArchivo(carpeta, t));
      if (e || !data) throw new Error("sin archivo");
      const json = JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString("utf8")) as { tabla?: string; filas?: unknown[] };
      leido[t] = json.tabla === t && Array.isArray(json.filas) ? json.filas.length : null;
    } catch {
      leido[t] = null;
    }
    const c = await supabase.from(t).select("*", { count: "exact", head: true });
    actual[t] = c.error ? null : (c.count ?? null);
  }
  const v = compararRespaldo(anotado, leido, actual);
  await supabase.from("fin_respaldos").update({ verificacion: v, verificado_en: new Date().toISOString() }).eq("ruta", carpeta);
  return v;
}
