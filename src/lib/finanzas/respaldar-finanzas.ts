// Tarea «respaldo-finanzas» (mejora 100): copia cada tabla financiera a `respaldos-finanzas/<fecha>/<tabla>.json.gz`
// (bucket privado), anota el respaldo en `fin_respaldos` (tabla → filas) y borra las carpetas que sobran. Trabaja con el
// presupuesto de tiempo de las tareas: si no alcanza, deja las tablas que faltan en `pendiente` y la siguiente ejecución
// del día sigue de ahí (por eso la tarea tiene tres horarios). Las páginas solo lo listan y dan enlaces firmados.

import { gzipSync } from "node:zlib";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_RESPALDOS, CONSERVAR_PREDETERMINADO, carpetasABorrar, ordenDe, rutaArchivo, tablasPendientes } from "./respaldo";

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
  return {
    resumen: `Respaldo ${carpeta} completo: ${filas.toLocaleString("es-PA")} filas de ${Object.values(tablas).filter((n) => n >= 0).length} tablas.${omitidas.length ? ` Sin tabla: ${omitidas.join(", ")}.` : ""}${borrar.length ? ` Borrados: ${borrar.join(", ")}.` : ""}`,
  };
}
